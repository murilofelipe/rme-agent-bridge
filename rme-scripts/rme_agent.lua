-- @Title: RME Agent
-- @Description: monta um request da seleção -> ponte -> aplica em app.transaction
--
-- Instalação: copie para <RME>/scripts/ e rode pelo menu **Scripts** do editor.
-- (app.addContextMenu não é consumido na v4.0 do canary-map-editor, então não
--  dá para acionar por clique direito ainda — isso precisa de fork.)
--
-- Transporte (ADR 0001): o `http` do editor bloqueia URLs com `localhost` /
-- `127.` / `[::1]`. Aponte BRIDGE_URL para um IP de LAN da máquina, ou um
-- hostname que resolva para loopback via /etc/hosts (ex.: rme-bridge.local).

local BRIDGE_URL = "http://rme-bridge.local:8777/bridge"
local CONTRACT_VERSION = 1
-- teto do polling: app.sleep congela a GUI (ADR 0001), então enquanto a
-- ponte pensa o editor fica sem responder. Com o cérebro real (claude -p)
-- uma query leva ~15-60s; 3000 x 50ms = 150s de margem.
local POLL_STEPS = 3000

-- Overlay: só desenho — NÃO bloqueia o input do humano na região (bloqueio
-- físico foi adiado, provável fork). Repinta durante o app.yield() do polling.
local OVERLAY = "rme_agent_active"
local overlayState = { on = false, region = nil, label = "" }

local function showOverlay(region, label)
	overlayState.on = true
	overlayState.region = region
	overlayState.label = label
	app.mapView.addOverlay(OVERLAY, {
		enabled = true,
		order = 50,
		ondraw = function(ctx)
			if not overlayState.on or not overlayState.region then return end
			local r = overlayState.region
			ctx.rect({
				x = r.min.x, y = r.min.y, z = r.min.z,
				w = r.max.x - r.min.x + 1, h = r.max.y - r.min.y + 1,
				filled = true, color = { r = 80, g = 140, b = 255, a = 60 },
			})
			ctx.rect({
				x = r.min.x, y = r.min.y, z = r.min.z,
				w = r.max.x - r.min.x + 1, h = r.max.y - r.min.y + 1,
				filled = false, width = 2, color = { r = 80, g = 140, b = 255, a = 220 },
			})
			ctx.text({
				x = r.min.x, y = r.min.y - 1, z = r.min.z,
				text = overlayState.label, color = { r = 220, g = 235, b = 255, a = 235 },
			})
		end,
	})
	app.refresh()
end

local function hideOverlay()
	overlayState.on = false
	pcall(function() app.mapView.removeOverlay(OVERLAY) end)
	app.refresh()
end

local function readSelection()
	local sel = app.selection
	if not sel or sel.isEmpty then
		return nil
	end
	local mn, mx = sel.minPosition, sel.maxPosition
	local tiles = {}
	for _, t in ipairs(sel.tiles) do
		local entry = { x = t.x, y = t.y, z = t.z, ground = 0 }
		if t.hasGround and t.ground then
			entry.ground = t.ground.id
		end
		local items = {}
		for _, it in ipairs(t.items) do
			items[#items + 1] = it.id
		end
		if #items > 0 then
			entry.items = items
		end
		local flags = 0
		if t.hasWall then flags = flags + 1 end
		if t.hasBorders then flags = flags + 2 end
		if flags ~= 0 then
			entry.flags = flags
		end
		-- esparso: só tiles com conteúdo (tile ausente = vazio, ver contrato)
		if entry.ground ~= 0 or entry.items or entry.flags then
			tiles[#tiles + 1] = entry
		end
	end
	return {
		min = { x = mn.x, y = mn.y, z = mn.z },
		max = { x = mx.x, y = mx.y, z = mx.z },
	}, tiles
end

-- um round-trip pela ponte (streaming, como o scripts/claude_agent.lua nativo)
local function callBridge(request)
	local start = http.postJsonStream(BRIDGE_URL, request, {})
	if not start.ok then
		return nil, "falha ao iniciar: " .. tostring(start.error)
	end
	local acc = ""
	for _ = 1, POLL_STEPS do
		app.sleep(50)
		app.yield()
		local r = http.streamRead(start.sessionId)
		if r.data and r.data ~= "" then
			acc = acc .. r.data
		end
		if r.hasError then
			http.streamClose(start.sessionId)
			return nil, tostring(r.error)
		end
		if r.finished then
			break
		end
	end
	http.streamClose(start.sessionId)
	local ok, parsed = pcall(json.decode, acc)
	if not ok or type(parsed) ~= "table" then
		return nil, "resposta não é JSON válido: " .. acc:sub(1, 200)
	end
	return parsed
end

local function inBounds(op, s)
	return op.x >= s.min.x and op.x <= s.max.x
		and op.y >= s.min.y and op.y <= s.max.y
		and op.z >= s.min.z and op.z <= s.max.z
end

-- ACHADO v4.0: app.transaction ENGOLE o erro do callback e faz COMMIT do
-- trabalho parcial — não há rollback automático. Então tudo o que dá para
-- checar em Lua é checado ANTES de abrir a transação; o que entra na
-- transação só pode falhar no nível da engine (id inexistente), e aí sobra
-- trabalho parcial que UM Ctrl+Z desfaz (o passo de undo é único).
local NEEDS_ID = { setGround = true, addItem = true, removeItem = true }
local function precheck(operations, selection)
	for i, op in ipairs(operations) do
		if not inBounds(op, selection) then
			return "operação " .. i .. ": fora da seleção (" .. op.x .. "," .. op.y .. "," .. op.z .. ")"
		end
		if NEEDS_ID[op.type] and type(op.id) ~= "number" then
			return "operação " .. i .. ": " .. tostring(op.type) .. " sem id"
		elseif op.type == "applyBrush" and (op.name == nil or op.name == "") then
			return "operação " .. i .. ": applyBrush sem name"
		elseif not NEEDS_ID[op.type] and op.type ~= "applyBrush" and op.type ~= "borderize" then
			return "operação " .. i .. ": tipo desconhecido " .. tostring(op.type)
		end
	end
	return nil
end

-- aplica as operações numa transação única (1 passo de undo). auto-contorno
-- nos tiles tocados no fim da mesma transação, a menos que autoBorder=false.
local function applyOperations(operations, selection, autoBorder)
	local err = precheck(operations, selection)
	if err then
		error(err)
	end
	local applied = 0
	local touched = {}
	app.transaction("RME Agent", function()
		for _, op in ipairs(operations) do
			local tile = app.map:getOrCreateTile(op.x, op.y, op.z)
			if not tile then
				error("tile inválido (" .. op.x .. "," .. op.y .. "," .. op.z .. ")")
			end
			touched[#touched + 1] = tile
			if op.type == "setGround" then
				tile.ground = op.id
			elseif op.type == "addItem" then
				tile:addItem(op.id, op.count or 1)
			elseif op.type == "removeItem" then
				for _, it in ipairs(tile.items) do
					if it.id == op.id then
						tile:removeItem(it)
						break
					end
				end
			elseif op.type == "applyBrush" then
				tile:applyBrush(op.name, false)
			elseif op.type == "borderize" then
				tile:borderize()
			end
			applied = applied + 1
		end
		if autoBorder ~= false then
			for _, tile in ipairs(touched) do
				tile:borderize()
			end
		end
	end)
	return applied
end

-- ---------------------------------------------------------------------------
hideOverlay() -- limpa um overlay órfão de um acionamento anterior que quebrou

if not app.hasMap() then
	app.alert("Abra um mapa primeiro.")
	return
end
local selection, tiles = readSelection()
if not selection then
	app.alert("Selecione uma região no mapa primeiro.")
	return
end

local dlg = Dialog({ title = "RME Agent", width = 460 })
dlg:label({ text = "O que fazer nesta região?" })
dlg:newrow()
dlg:input({ id = "instruction", label = "", text = "", focus = true })
dlg:newrow()
dlg:button({ id = "go", text = "Aplicar", focus = true, onclick = function(d) d:close() end })
dlg:button({ id = "cancel", text = "Cancelar", onclick = function(d) d:close() end })
dlg:show()

local data = dlg.data
if not data or data.cancel or not data.instruction or data.instruction == "" then
	return
end

local request = {
	version = CONTRACT_VERSION,
	instruction = data.instruction,
	selection = selection,
	tiles = tiles, -- lista vazia vira {} no JSON; o contrato normaliza para []
}
print("[rme-agent] -> ponte: \"" .. data.instruction .. "\" (" .. #tiles .. " tiles)")

showOverlay(selection, "agente: aplicando…")

local function fail(msg)
	hideOverlay()
	app.alert(msg)
end

local response, err = callBridge(request)
if not response then
	return fail("Falha na ponte: " .. tostring(err))
end
if response.error then
	return fail("Ponte recusou: " .. tostring(response.error))
end
if response.version ~= CONTRACT_VERSION then
	return fail("versão de resposta incompatível: " .. tostring(response.version))
end
if type(response.operations) ~= "table" then
	return fail("resposta sem lista de operações: " .. tostring(response.error or "?"))
end

local ok, result = pcall(applyOperations, response.operations, selection, response.autoBorder)
hideOverlay()
if not ok then
	app.alert("Erro ao aplicar:\n" .. tostring(result))
	return
end
app.refresh()
print("[rme-agent] aplicadas " .. result .. " operações. Ctrl+Z desfaz tudo de uma vez.")

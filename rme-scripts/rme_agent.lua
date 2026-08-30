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
	for _ = 1, 400 do
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

-- aplica as operações numa transação única (1 passo de undo; rollback em erro)
local function applyOperations(operations)
	local applied = 0
	app.transaction("RME Agent", function()
		for i, op in ipairs(operations) do
			local tile = app.map:getOrCreateTile(op.x, op.y, op.z)
			if not tile then
				error("operação " .. i .. ": tile inválido (" .. op.x .. "," .. op.y .. "," .. op.z .. ")")
			end
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
			else
				error("operação " .. i .. ": tipo desconhecido " .. tostring(op.type))
			end
			applied = applied + 1
		end
	end)
	return applied
end

-- ---------------------------------------------------------------------------
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

local response, err = callBridge(request)
if not response then
	app.alert("Falha na ponte: " .. tostring(err))
	return
end
if response.version ~= CONTRACT_VERSION then
	app.alert("versão de resposta incompatível: " .. tostring(response.version))
	return
end
if type(response.operations) ~= "table" then
	app.alert("resposta sem lista de operações: " .. tostring(response.error or "?"))
	return
end

local ok, result = pcall(applyOperations, response.operations)
if not ok then
	app.alert("Erro ao aplicar — transação revertida:\n" .. tostring(result))
	return
end
app.refresh()
print("[rme-agent] aplicadas " .. result .. " operações. Ctrl+Z desfaz tudo de uma vez.")

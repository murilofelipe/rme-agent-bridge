-- @Title: RME Agent
-- @Description: sessão do agente (MCP, ADR 0002) ou uma instrução (claude -p)
--
-- Instalação: copie para <RME>/scripts/ e rode pelo menu **Scripts**.
-- (app.addContextMenu é código morto na v4.0 — sem gatilho por clique direito.)
--
-- Transporte (ADR 0001): o `http` do editor bloqueia URLs com `localhost` /
-- `127.` / `[::1]`. RELAY tem que ser um IP de LAN ou um alias de /etc/hosts
-- (o docker-compose expõe o relay como `rme-bridge.local`).

local RELAY = "http://rme-bridge.local:8777"
local CONTRACT_VERSION = 1

-- Modo sessão (ADR 0002): o editor não tem servidor de entrada. O script abre
-- uma sessão e mantém UMA conexão `/stream` aberta enquanto a sessão dura; o
-- relay empurra um comando por linha. Abrir/fechar um stream por poll faz a
-- v4.0 abortar (std::system_error). A UI fica lenta — é o teto da v4.0.
local SESSION_TTL_MS = 600000       -- 10 min; o relay renova a cada leitura do stream
local SESSION_MAX_WALL_S = 3600     -- corte duro de 1h

-- Modo instrução: claude -p pode demorar; 3000 x 50ms = 150s.
local ONESHOT_STREAM_STEPS = 3000

-- ---------------------------------------------------------------------------
-- Overlay (só desenho, não bloqueia input — bloqueio físico = fork)

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
			if not overlayState.on then return end
			local r = overlayState.region
			if r then
				for _, filled in ipairs({ true, false }) do
					ctx.rect({
						x = r.min.x, y = r.min.y, z = r.min.z,
						w = r.max.x - r.min.x + 1, h = r.max.y - r.min.y + 1,
						filled = filled, width = 2,
						color = { r = 80, g = 140, b = 255, a = filled and 60 or 220 },
					})
				end
				ctx.text({ x = r.min.x, y = r.min.y - 1, z = r.min.z, text = overlayState.label,
					color = { r = 220, g = 235, b = 255, a = 235 } })
			elseif ctx.view then
				-- sessão sem região: rótulo no canto da vista
				ctx.text({ x = ctx.view.x1 + 1, y = ctx.view.y1 + 1, z = ctx.view.z,
					text = overlayState.label, color = { r = 120, g = 200, b = 120, a = 235 } })
			end
		end,
	})
	app.refresh()
end

local function hideOverlay()
	overlayState.on = false
	pcall(function() app.mapView.removeOverlay(OVERLAY) end)
	app.refresh()
end

-- ---------------------------------------------------------------------------
-- Leitura do mapa

local function readTileEntry(t)
	local entry = { x = t.x, y = t.y, z = t.z, ground = 0 }
	if t.hasGround and t.ground then
		entry.ground = t.ground.id
	end
	local items = {}
	for _, it in ipairs(t.items) do
		items[#items + 1] = it.id
	end
	if #items > 0 then entry.items = items end
	local flags = 0
	if t.hasWall then flags = flags + 1 end
	if t.hasBorders then flags = flags + 2 end
	if flags ~= 0 then entry.flags = flags end
	return entry
end

-- esparso: só devolve tiles com algo dentro (tile ausente = vazio, ver contrato)
local function readRegion(min, max)
	local tiles = {}
	for z = min.z, max.z do
		for y = min.y, max.y do
			for x = min.x, max.x do
				local t = app.map:getTile(x, y, z)
				if t then
					local e = readTileEntry(t)
					if e.ground ~= 0 or e.items or e.flags then
						tiles[#tiles + 1] = e
					end
				end
			end
		end
	end
	return tiles
end

local function readTile(x, y, z)
	local t = app.map:getTile(x, y, z)
	if not t then return nil end
	local e = readTileEntry(t)
	if e.ground == 0 and not e.items and not e.flags then return nil end
	return e
end

local function readSelection()
	local sel = app.selection
	if not sel or sel.isEmpty then return nil end
	local mn, mx = sel.minPosition, sel.maxPosition
	local region = { min = { x = mn.x, y = mn.y, z = mn.z }, max = { x = mx.x, y = mx.y, z = mx.z } }
	return region, readRegion(region.min, region.max)
end

-- ---------------------------------------------------------------------------
-- Aplicação (ver ADR 0001: app.transaction NÃO faz rollback; pré-checa antes)

local function inBounds(op, s)
	return op.x >= s.min.x and op.x <= s.max.x
		and op.y >= s.min.y and op.y <= s.max.y
		and op.z >= s.min.z and op.z <= s.max.z
end

local NEEDS_ID = { setGround = true, addItem = true, removeItem = true }
local function precheck(operations, bounds)
	if type(operations) ~= "table" then return "operations: precisa ser uma lista" end
	for i, op in ipairs(operations) do
		if not inBounds(op, bounds) then
			return "operação " .. i .. ": fora dos limites (" .. op.x .. "," .. op.y .. "," .. op.z .. ")"
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

local function applyOperations(operations, bounds, autoBorder)
	local err = precheck(operations, bounds)
	if err then error(err) end
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
					if it.id == op.id then tile:removeItem(it); break end
				end
			elseif op.type == "applyBrush" then
				tile:applyBrush(op.name, false)
			elseif op.type == "borderize" then
				tile:borderize()
			end
			applied = applied + 1
		end
		if autoBorder ~= false then
			for _, tile in ipairs(touched) do tile:borderize() end
		end
	end)
	return applied
end

-- ---------------------------------------------------------------------------
-- HTTP

local function httpJson(path, body)
	local r = http.postJson(RELAY .. path, body or {}, {})
	if not r or not r.ok then
		return nil, (r and tostring(r.error)) or "sem resposta"
	end
	local ok, parsed = pcall(json.decode, r.body or "")
	if not ok then return nil, "resposta não-JSON: " .. tostring(r.body):sub(1, 150) end
	return parsed
end

-- ---------------------------------------------------------------------------
-- Modo sessão

local function dispatch(cmd)
	if cmd.op == "getSelection" then
		local region = readSelection()
		return true, region -- nil vira null no JSON
	elseif cmd.op == "getMapContext" then
		local s = cmd.args and cmd.args.selection
		if not s then return false, "getMapContext: falta selection" end
		return true, { tiles = readRegion(s.min, s.max) }
	elseif cmd.op == "getTile" then
		local a = cmd.args or {}
		return true, readTile(a.x, a.y, a.z)
	elseif cmd.op == "apply" then
		local a = cmd.args or {}
		local ok, res = pcall(applyOperations, a.operations, a.bounds, a.autoBorder)
		if ok then return true, { applied = res } end
		return false, tostring(res)
	end
	return false, "op desconhecida: " .. tostring(cmd.op)
end

local function runSession()
	if not app.hasMap() then
		app.alert("Abra um mapa primeiro.")
		return
	end
	local s, err = httpJson("/session", { ttlMs = SESSION_TTL_MS })
	if not s or not s.sessionId then
		app.alert("Não consegui abrir a sessão no relay: " .. tostring(err or (s and s.error)))
		return
	end
	local sessionId = s.sessionId
	showOverlay(nil, "sessão do agente ativa — Ctrl+Z desfaz cada passo")
	print("[rme-agent] sessão " .. sessionId .. " aberta")

	-- UMA conexão pela sessão toda. Abrir/fechar stream a cada poll faz a v4.0
	-- abortar (std::system_error); o claude_agent.lua nativo também mantém uma.
	local stream = http.postJsonStream(RELAY .. "/stream", { session = sessionId }, {})
	if not stream.ok then
		httpJson("/session/end", { sessionId = sessionId })
		hideOverlay()
		app.alert("stream do relay não abriu: " .. tostring(stream.error))
		return
	end

	local function handleLine(line)
		if line == "" or line:sub(1, 1) == ":" then return false end -- keepalive
		local ok, cmd = pcall(json.decode, line)
		if not ok or type(cmd) ~= "table" or not cmd.id then return false end
		if cmd.op == "endSession" then
			httpJson("/result", { sessionId = sessionId, commandId = cmd.id, ok = true, data = { ended = true } })
			return true -- pede pra encerrar
		end
		local dok, data = dispatch(cmd)
		app.refresh()
		httpJson("/result", {
			sessionId = sessionId, commandId = cmd.id, ok = dok,
			data = dok and data or nil, error = (not dok) and data or nil,
		})
		print("[rme-agent] " .. tostring(cmd.op) .. " -> " .. (dok and "ok" or ("ERRO: " .. tostring(data))))
		return false
	end

	local deadline = os.time() + SESSION_MAX_WALL_S
	local reason, buf, stop = "deadline", "", false
	while not stop and os.time() < deadline do
		app.sleep(200)
		app.yield()
		local r = http.streamRead(stream.sessionId)
		if r.hasError then reason = "erro no stream: " .. tostring(r.error); break end
		if r.data and r.data ~= "" then
			buf = buf .. r.data
			while true do
				local nl = buf:find("\n", 1, true)
				if not nl then break end
				local line = buf:sub(1, nl - 1)
				buf = buf:sub(nl + 1)
				if handleLine(line) then stop = true; reason = "endSession"; break end
			end
		end
		if r.finished then reason = "stream fechou"; break end
	end

	-- ACHADO v4.0: fechar um stream ainda-vivo faz o editor dar
	-- `std::system_error: Resource deadlock avoided` no teardown do script.
	-- Então: encerra server-side PRIMEIRO, drena até o relay fechar a resposta,
	-- e só então chama streamClose.
	if reason ~= "stream fechou" then
		httpJson("/session/end", { sessionId = sessionId })
		for _ = 1, 40 do
			app.sleep(100)
			app.yield()
			local r = http.streamRead(stream.sessionId)
			if r.finished or r.hasError then break end
		end
	end
	http.streamClose(stream.sessionId)
	hideOverlay()
	print("[rme-agent] sessão encerrada (" .. reason .. ")")
end

-- ---------------------------------------------------------------------------
-- Modo instrução (claude -p, um tiro) — ADR 0001

local function runOneShot()
	if not app.hasMap() then
		app.alert("Abra um mapa primeiro.")
		return
	end
	local selection, tiles = readSelection()
	if not selection then
		app.alert("Selecione uma região no mapa primeiro.")
		return
	end

	local dlg = Dialog({ title = "RME Agent — uma instrução", width = 460 })
	dlg:label({ text = "O que fazer nesta região?" })
	dlg:newrow()
	dlg:input({ id = "instruction", label = "", text = "", focus = true })
	dlg:newrow()
	dlg:button({ id = "go", text = "Aplicar", focus = true, onclick = function(d) d:close() end })
	dlg:button({ id = "cancel", text = "Cancelar", onclick = function(d) d:close() end })
	dlg:show()

	local data = dlg.data
	if not data or data.cancel or not data.instruction or data.instruction == "" then return end

	local request = {
		version = CONTRACT_VERSION, instruction = data.instruction,
		selection = selection, tiles = tiles,
	}
	showOverlay(selection, "agente: aplicando…")

	local start = http.postJsonStream(RELAY .. "/bridge", request, {})
	local response
	if start.ok then
		local acc = ""
		for _ = 1, ONESHOT_STREAM_STEPS do
			app.sleep(50)
			app.yield()
			local r = http.streamRead(start.sessionId)
			if r.data and r.data ~= "" then acc = acc .. r.data end
			if r.hasError or r.finished then break end
		end
		http.streamClose(start.sessionId)
		local ok, parsed = pcall(json.decode, acc)
		if ok and type(parsed) == "table" then response = parsed end
	end

	if not response then
		hideOverlay(); app.alert("Falha na ponte (o modo instrução precisa do stub, não do relay).")
		return
	end
	if response.error then hideOverlay(); app.alert("Ponte recusou: " .. tostring(response.error)); return end
	if type(response.operations) ~= "table" then
		hideOverlay(); app.alert("resposta sem operações"); return
	end

	local ok, result = pcall(applyOperations, response.operations, selection, response.autoBorder)
	hideOverlay()
	if not ok then app.alert("Erro ao aplicar:\n" .. tostring(result)); return end
	app.refresh()
	print("[rme-agent] aplicadas " .. result .. " operações. Ctrl+Z desfaz tudo.")
end

-- ---------------------------------------------------------------------------
hideOverlay() -- limpa overlay órfão de um acionamento anterior que quebrou

local pick = Dialog({ title = "RME Agent", width = 420 })
pick:label({ text = "Como você quer trabalhar?" })
pick:newrow()
pick:button({ id = "session", text = "Sessão do agente (MCP)", focus = true, onclick = function(d) d:close() end })
pick:button({ id = "oneshot", text = "Uma instrução (claude -p)", onclick = function(d) d:close() end })
pick:newrow()
pick:button({ id = "cancel", text = "Cancelar", onclick = function(d) d:close() end })
pick:show()

local choice = pick.data
if not choice or choice.cancel then
	return
elseif choice.oneshot then
	runOneShot()
else
	runSession()
end

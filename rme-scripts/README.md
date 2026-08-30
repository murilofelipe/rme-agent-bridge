# rme-scripts

O lado **editor** da ponte: scripts Lua que rodam dentro do
`opentibiabr/remeres-map-editor` (build `canary-map-editor` v4.0+).

## `rme_agent.lua`

Fluxo do tracer bullet (#10): lê a seleção do usuário → monta um `BridgeRequest`
(contrato em `sdk-node/src/contract`) → manda pela ponte HTTP → aplica as
operações da `BridgeResponse` numa transação única (um passo de undo).

### Instalação

1. Copie `rme_agent.lua` para `<instalação-do-RME>/scripts/`.
2. Suba o lado-terminal: `cd sdk-node && npm run stub` (ou o handler real
   quando #12 existir). Ele escuta em `0.0.0.0:8777`.
3. Ajuste `BRIDGE_URL` no topo do script (ver "Transporte" abaixo).
4. No editor: abra/crie um mapa, faça uma seleção, e rode **Scripts →
   RME Agent**.

### Transporte (ADR 0001)

O `http` do editor **bloqueia** URLs contendo `localhost`, `127.` ou `[::1]`
(`isUrlSafe` em `source/lua/lua_api_http.cpp`). Aponte `BRIDGE_URL` para:

- o **IP de LAN** da máquina (ex.: `http://192.168.1.50:8777/bridge`), ou
- um **hostname** que resolva para loopback via `/etc/hosts`
  (ex.: `127.0.0.1  rme-bridge.local` → `http://rme-bridge.local:8777/bridge`).

## Limitações conhecidas da v4.0 (precisam de fork)

- **`app.addContextMenu` é código morto** — registrado mas nunca consumido.
  O gatilho tem que ser o menu Scripts; o "clique direito → aplicar" (#13)
  precisa de patch em C++.
- **`app.events` é código morto** — não há como observar edições do humano em
  tempo real (#13 modo contínuo).
- **`File > New` exige um bundle de assets do Tibia 12+** (`<dir>/assets/
  catalog-content.json` + `package.json` + appearances protobuf). Aponte o
  editor via Preferences → client directory, ou `ASSETS_DATA_DIRS` no
  `rme.cfg`.

## Verificado ao vivo (2026-08-30, v4.0.0 + client 13.40)

Rodando o script pelo menu Scripts contra o stub em modo "preencher seleção":
`BridgeRequest` montado → HTTP round-trip → 16 operações `setGround` recebidas
→ `app.transaction` aplicou todas (`tile.ground` mudou de 0 para 4526) → **um
Ctrl+Z reverteu todos os 16 tiles** (undo atômico confirmado).

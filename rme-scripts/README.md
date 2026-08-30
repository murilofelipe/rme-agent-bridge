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
- **`app.transaction` não faz rollback** — engole o erro do callback e faz
  commit do parcial; sem `app.undo` programático. Mitigação: pré-validação
  antes da transação + o passo de undo único (Ctrl+Z).
- **`File > New` exige um bundle de assets do Tibia 12+** (`<dir>/assets/
  catalog-content.json` + `package.json` + appearances protobuf). Aponte o
  editor via Preferences → client directory, ou `ASSETS_DATA_DIRS` no
  `rme.cfg`.

## Verificado ao vivo (2026-08-30, v4.0.0 + client 13.40)

Rodando o script pelo menu Scripts contra o stub em modo "preencher seleção":
`BridgeRequest` montado → HTTP round-trip → 16 operações `setGround` recebidas
→ `app.transaction` aplicou todas (`tile.ground` mudou de 0 para 4526) → **um
Ctrl+Z reverteu todos os 16 tiles** (undo atômico confirmado).

### #11 — validação de limites + rollback (2026-08-29, mesma build)

- **Handler** (`sdk-node`): `handleRequest` valida a `response` contra o
  schema **e** contra os limites da seleção; response ruim ou cérebro que
  lança → erro estruturado, **nenhuma** operação repassada. Coberto por
  `handler.test.ts` (offline, CI).
- **Lua**: `precheck` roda ANTES de abrir a transação — limites, tipo de op
  conhecido, campos por tipo. Verificado headless: op válida aplica; op fora
  da seleção → barrada **sem nenhuma mutação no mapa** (`0 -> 0`).
- Erro estruturado da ponte (`{ "error": ... }`) vira o alerta
  "Ponte recusou: …" no editor.

> **Achado v4.0 (item de fork):** `app.transaction` **engole** o erro do
> callback e faz **commit do trabalho parcial** — não há rollback
> automático, e `app.undo` / `app.map.undo` não existem na v4.0 (probe ao
> vivo: `nil`). Por isso a pré-validação: tudo o que dá para checar em Lua
> é barrado antes da transação. Uma falha só de engine no meio da
> transação (id inexistente) deixa trabalho parcial — mas o passo de undo é
> único, então **um Ctrl+Z desfaz** (o #10 confirmou o agrupamento). Rollback
> real exige fork.

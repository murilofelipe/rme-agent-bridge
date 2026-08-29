# Investigação: API Lua do `opentibiabr/remeres-map-editor` e `claude_agent.lua`

**Data:** 2026-08-29
**Fonte:** clone raso de `opentibiabr/remeres-map-editor` (commit `db1c3cf`),
leitura de `source/lua/*` e `scripts/*` + `grep -rn` na `source/` inteira.
**Limite deste relatório:** baseado em leitura de código, não em execução. Não
testei a build. Versões da API podem mudar. Não cobre o `otclient` nem outros
forks. O canal de transporte agente↔script (seção "Transporte") tem uma
decisão em aberto que precisa de teste empírico.

---

## Placar

| Peça que o projeto queria construir | Já existe no fork? |
| --- | --- |
| API nativa de manipulação de mapa | **Sim** — API Lua rica (`map`, `tile`, `selection`, `Brushes`) |
| Undo atômico (1 operação = 1 passo) | **Sim** — `app.transaction(nome, fn)` |
| Auto-contorno via código | **Sim** — `tile:borderize()` e `tile:applyBrush(nome, autoBorder)` |
| Overlay visual (o "bloqueio de área") | **Sim** — `app.mapView.addOverlay{ondraw=...}` |
| Gatilho por menu de contexto | **Sim** — `app.addContextMenu(label, cb)` |
| Loop de fundo cooperativo | **Sim** — `app.sleep(ms)` + `app.yield()` |
| Persistência em disco | **Sim** — `app.storage(nome)` → JSON em `scripts/nome.json` |
| Chat com Claude dentro do editor | **Sim** — `scripts/claude_agent.lua` |
| HTTP de saída (streaming) | **Sim** — `http.postJsonStream` + `http.streamRead` |
| Geração procedural | **Sim** — 8 geradores em `scripts/` (cave, forest, island, maze, river…) |
| **Servidor de ENTRADA (agente externo conecta)** | **Não** |
| **Eventos de edição (observar o que o humano fez)** | **Não** (infra existe, mas sem call site) |
| **`claude_agent.lua` executar operações no mapa** | **Não** — é só chat; o Claude sugere código Lua, o humano roda |

---

## O que o `claude_agent.lua` é

Um script (`@Author: VLL Systems`) que abre um `Dialog`, pede a **API key da
Anthropic**, guarda em `app.storage`, e num loop:

1. lê a mensagem do humano num `Dialog:input`
2. `http.postJsonStream("https://api.anthropic.com/v1/messages", body, {["x-api-key"]=key, ["anthropic-version"]="2023-06-01"})`
3. faz polling com `http.streamRead` + `app.sleep(100)` + `app.yield()`,
   parseia o SSE, imprime o texto no console
4. mantém `conversationHistory` na sessão

**System prompt** dele: *"You are an AI assistant integrated into Remere's Map
Editor… Available APIs: app, map, tile, Items, Brushes, algo, noise, geo, http,
json, Dialog. The user can run Lua scripts to manipulate the map."*

Ou seja: **é um assistente de conversa, não um agente que age.** Ele não
interpreta a resposta do Claude nem chama `tile:applyBrush`. Custa **por token
da API key** — exatamente o que você quer evitar.

## API Lua disponível hoje (resumo do que importa)

- **`app`**: `transaction(nome, fn)`, `hasMap()`, `refresh()`, `map`,
  `selection`, `storage(nome)`, `sleep(ms)`, `yield()`, `getTime()`,
  `addContextMenu(label, fn)`, `setCameraPosition(x,y,z)`, `mapView.addOverlay`,
  `keyboard.isCtrlDown()`, `copy/cut/paste`, `alert`, `events:on/off` (ver
  ressalva abaixo).
- **`map`**: `getTile(x,y,z)` / `getTile(pos)`, `createTile(pos)`,
  `getTileCount()`.
- **`tile`**: `.ground = id` (set), `:addItem(id, count?)`,
  `:removeItem(item)`, `:borderize()`, `:applyBrush(nome, autoBorder?)`,
  `.hasGround`, `.hasBorders`, `.hasWall`, `.items`.
- **`selection`**: `.tiles`, `.bounds`, `.minPosition` / `.maxPosition`,
  `:add` / `:remove` / `:clear`, `.isEmpty`, `.size`. → **dá pra ler a seleção
  que o humano fez.**
- **`Brushes`**, **`noise`** (Perlin/simplex), **`algo`**, **`geo`**,
  **`json`** (`decode` / `encode_pretty`), **`Image`**, **`Dialog`**.
- **`http`**: `get`, `post`, `postJson`, `postStream`, `postJsonStream`,
  `streamRead`, `streamClose`, `streamStatus`.

## Restrições do sandbox (relevantes para a arquitetura)

1. **`io` é `nil`.** Sem leitura/escrita de arquivo direta em Lua. **Mas**
   `app.storage(nome)` faz I/O de arquivo em C++: JSON em
   `<INSTALAÇÃO_DO_RME>/scripts/nome.json` (o dir é o `SCRIPT_DIR` do script em
   execução, **não** o dir do projeto), com `:load()` / `:save()` (via
   `std::ofstream(..., trunc)`, **sem lock**) / `:clear()`. `..` e caminho
   absoluto bloqueados.
2. **`http` bloqueia só por casamento de string** — `isUrlSafe()` rejeita os
   literais `localhost`, `127.`, `0.0.0.0`, `[::1]`, `[::ffff:127.`, `//[::` e
   os esquemas `file://` / `ftp://`. **Não** bloqueia IP de LAN
   (`192.168.x.x`) nem um hostname que resolva para loopback via `/etc/hosts`.
   Então um canal HTTP para um bridge local **provavelmente é viável** por
   alias de hostname ou IP de LAN — a verificar. `http.post*` (não-stream) é
   **síncrono e bloqueia a thread da GUI** até a resposta (timeout 10 s).
3. `os.execute` / `exit` / `getenv` / `remove` / `rename` → `nil`
   (o lado do agente, fora do sandbox, pode renomear — útil para escrita
   atômica). `os.time` / `os.clock` / `os.date` continuam.
4. Sem `require` de módulos arbitrários (searchers desligados).
5. **`app.events:on(nome, cb)` existe mas não recebe nada.** CONFIRMADO por
   `grep -rn 'emit(\|emitCancellable(' source/`: o dispatch
   (`LuaScriptManager::emit` / `emitCancellable`) tem **zero call sites** no
   editor. Observar edição do humano em tempo real exige fork (adicionar `emit`
   nos caminhos de edição).
6. **`app.sleep(ms)` = `std::this_thread::sleep_for` na thread da GUI → congela
   o editor** durante o sleep (cap 10 s). `app.yield()` = `wxTheApp->Yield(true)`
   → bombeia o event loop do wx. O loop `sleep(100); yield()` do
   `claude_agent.lua` roda, mas **engasga** a UI. Consequência: **nada de loop
   de polling residente**; o formato tem que ser **um round-trip por
   acionamento**.
7. Scripts rodam por: tag `@AutoRun: true` (após a GUI subir), item de menu de
   contexto (`app.addContextMenu`), ou a janela de scripts.

---

## Consequência para o projeto

### Menor entregável possível (esqueleto que anda)

**Um `claude_agent.lua` modificado**, um arquivo:

1. troca `https://api.anthropic.com/v1/messages` + `x-api-key` pelo round-trip
   com a sessão do Claude Code (ver "Transporte");
2. parseia a resposta como uma lista de operações e as aplica dentro de
   `app.transaction("agente", fn)` → `tile:applyBrush` / `tile.ground=` /
   `tile:addItem` / `tile:borderize`.

Isso já responde ao pedido (Claude Code atuando no editor, sem custo de key) e
é um "sim" muito mais fácil que reestruturar o repo.

### O que NÃO precisa de fork (confirmado na leitura)

- **Gatilho**: `app.addContextMenu("RME Agent: revisar seleção", fn)` /
  `"...continuar daqui"`.
- **Ler contexto**: `app.selection.tiles` / `.bounds`, `map:getTile(...)`.
- **Executar com 1 passo de undo**: `app.transaction(nome, fn)`.
- **Overlay de aviso**: `app.mapView.addOverlay{ondraw=...}` (ver
  `scripts/house_visualizer.lua`).

### Transporte agente ↔ script — DECIDIDO (ADR 0001)

Spike headless rodado (2026-08-29). **HTTP funciona**: `http.postJson` /
`postJsonStream` para um hostname alias (`rme-bridge.local` → 127.0.0.1) ou IP
de LAN retorna 200; só URLs contendo `localhost`/`127.`/`[::1]` são bloqueadas.
Decisão em `docs/adr/0001-transporte-agente-editor.md`. O texto abaixo é o
histórico da análise.

Opções consideradas, da melhor para a pior:

- **HTTP para um bridge local via alias** — `isUrlSafe` só barra strings, não
  faz checagem real de loopback. Um bridge escutando em `192.168.x.x` ou num
  hostname de `/etc/hosts` provavelmente passa. Request/response de verdade,
  sem corrida. Contra: `http.post` síncrono congela a GUI durante a chamada;
  usar o streaming (`postStream` + `streamRead` + `sleep`/`yield`) como o
  `claude_agent.lua` faz, aceitando o engasgo enquanto o agente responde.
  **Verificar se `http.postJson` a um hostname que resolve p/ loopback
  funciona.**
- **Arquivo via `app.storage`** — sem fork, mas: (a) `save` é `ofstream trunc`
  sem lock → um arquivo só = leitura rasgada; usar **arquivos separados** de
  request e response, e o lado do agente escreve com temp-then-rename (Lua não
  renomeia; Claude Code sim); (b) o arquivo mora no `scripts/` **da instalação
  do RME**, não no projeto; (c) o script faz um poll **curto e limitado** após
  o acionamento (não residente).
- **WebSocket de entrada** — precisa de fork. Só se as duas acima falharem.

### O que precisaria de fork (adiar)

- Modo 2 *contínuo* (agente observa cada edição) — precisa wire de `emit`.
  **Modo 2 sob demanda** já funciona sem isso, e foi o que você escolheu.
- **Bloqueio FÍSICO do input do humano na área (Q6)** — você escolheu (a)
  explicitamente. O overlay Lua só *desenha* o aviso; impedir o clique dentro
  da box provavelmente exige C++. **Pergunta para você:** aceita o MVP entregar
  só o aviso visual (bloqueio por convenção), e o bloqueio físico virar item de
  fork depois?

---

## Recomendação (findings, não decisão fechada)

A direção — scripts Lua na build oficial, sem fork, Claude Code como cérebro no
lugar da API key — está bem sustentada. Duas coisas ainda não estão 100%:
o transporte (a testar) e o bloqueio físico do Q6 (provável fork). Com isso em
mente, a forma provável do projeto:

1. **`rme-scripts/`** — scripts Lua da ponte (gatilho, overlay, executor de
   operações, transporte). Rodam na build oficial de
   `opentibiabr/remeres-map-editor`.
2. **lado do terminal** — o que o Claude Code (ou outro agente) usa para
   conversar com os scripts. É aqui que "SDK / MCP / plugin" do README se
   materializa. `sdk-node/` pode virar isto.
3. **contrato** — formato do pedido + contexto de mapa + operações de resposta.
   Um ADR.

`agent-python/` e `docker/` saem. `core-cpp/` fica congelado até (e se) o
transporte sem-fork provar ser insuficiente, ou o Q6 físico entrar.

**Próximo passo antes do spec:** um teste de 1 hora — subir a build oficial do
fork, rodar um `.lua` que (a) adiciona item de menu, (b) lê a seleção,
(c) tenta `http.postJson` para um hostname loopback-alias, (d) aplica um tile
em `app.transaction`. Isso fecha a decisão de transporte.

# 🗺️ RME Agent Bridge

**Português** · [English](README.en.md)

[![Lua](https://img.shields.io/badge/Editor-Lua-2C2D72.svg)](#)
[![TypeScript](https://img.shields.io/badge/Terminal-TypeScript-3178C6.svg)](#)
[![Node.js](https://img.shields.io/badge/Env-Node.js-339933.svg)](#)
[![MCP](https://img.shields.io/badge/Protocol-MCP-6E56CF.svg)](#)

**RME Agent Bridge** é uma ponte entre agentes de IA e o **Remere's Map Editor
(RME)**, o editor de mapas de OpenTibia. Ela dá a qualquer agente uma forma de
*enxergar* e *manipular* um mapa aberto no editor — sem simular mouse, sem
screenshot.

A analogia: é para o RME o que a extensão de navegador do Claude Code é para um
site. O editor passa a expor **comandos** (`coloque grama no quadrado 100,50`,
`rode o auto-contorno nessa área`, `me diga o que tem aqui`, `selecione essa
região`) e o agente os chama direto.

> O entendimento completo do projeto está em [`CONTEXT.md`](CONTEXT.md).

---

## 🎯 O que este projeto é (e o que não é)

**A ponte é o produto.** Quem é o agente — Claude Code, um modelo local, um
script seu — é plugável e está **fora do escopo**. Existe um único contrato de
comandos por baixo; as formas de consumo (SDK, servidor MCP, plugin) são
embrulhos finos sobre ele.

A ponte **não** entende linguagem natural, **não** tem modelo de IA próprio,
**não** gera nada procedural e **não** interpreta imagens. Traduzir *"faz um
lago sombrio no canto nordeste"* em ações no mapa é trabalho do agente. A ponte
só expõe o mapa de um jeito que um LLM consiga raciocinar em cima.

## 🧩 Casos de uso alvo

1. **Co-edição ao vivo** — uma pessoa trabalha no RME normalmente; um agente
   trabalha no mesmo mapa ao lado, guiado por chat.
2. **Reproduzir uma referência** — dado um mapa de outro game ou uma imagem, o
   agente monta aquilo no editor para um servidor de jogo.

## ⚙️ Como a co-edição ao vivo funciona

| Tema | Decisão |
| --- | --- |
| Interação | O agente chama **ferramentas MCP** (`rme_get_selection`, `rme_apply_operations`, …) ou recebe **uma instrução em linguagem natural** por diálogo no editor |
| Operação do agente | Uma chamada = uma transação atômica = **um** passo de undo |
| Concorrência | Objetivo: travar o input do humano na área ativa. **Hoje só aviso visual** — o bloqueio físico precisa de fork (ver limitações abaixo) |
| Visual | Retângulo/rótulo semitransparente sobre a área enquanto o agente trabalha |
| Comunicação | **HTTP** (ADR 0001). O editor não tem servidor de entrada, então o humano abre uma **janela de sessão** pelo menu Scripts e o script faz long-poll enquanto o agente age (ADR 0002) |
| Modos | (1) **Sessão do agente** — janela aberta pelo menu, agente age livre via MCP · (2) **Uma instrução** — humano seleciona área e digita o que quer (`claude -p`, sem API key) |
| Auto-contorno | Automático ao fim de cada transação (desligável por operação) |

## 🎯 Alvo técnico

- Editor: [`opentibiabr/remeres-map-editor`](https://github.com/opentibiabr/remeres-map-editor)
  — build `canary-map-editor` v4.0+ (tem a API Lua: `app.transaction`, `map`,
  `tile`, `app.mapView.addOverlay`, `http`, `Dialog`)
- Client/itens: Tibia recente (protocolo 13.x) — um alvo só
- Transporte: **HTTP**, um round-trip por acionamento — o script Lua chama uma
  ponte local via IP de LAN ou alias de `/etc/hosts` (ADR 0001)

---

## 📁 Estrutura do Monorepo

```text
rme-agent-bridge/
├── rme-scripts/  # lado EDITOR: rme_agent.lua roda dentro do RME (menu Scripts)
├── sdk-node/     # lado TERMINAL (TS): contrato, validação, relay, cérebro claude -p
│   └── src/
│       ├── contract/  # BridgeRequest/Response + validação + fixtures
│       ├── bridge/    # handler + servidor stub + claudeBrain
│       └── relay/     # fila de comandos + sessão (ADR 0002)
├── mcp-node/     # MCP server (@rme-agent-bridge/mcp) — expõe o editor como ferramentas
├── docs/
│   ├── adr/          # decisões (0001 = transporte HTTP · 0002 = MCP + janela de sessão)
│   ├── agents/       # config das engineering skills
│   └── planejamento/ # investigação da API Lua + notas
├── CONTEXT.md
└── README.md
```

> O plano antigo (fork do RME + agente autônomo próprio, `core-cpp/` +
> `agent-python/` + `docker/`) foi removido: a investigação
> (`docs/planejamento/investigacao-lua-api-rme.md`) mostrou que a API Lua da
> v4.0 já cobre o essencial, e a arquitetura colapsou para *scripts Lua +
> lado-terminal*.

---

## ⚠️ Limitações da build v4.0 (o que hoje precisa de fork)

A investigação em runtime achou tetos na API Lua do `canary-map-editor` v4.0:

- **`app.transaction` não faz rollback** — engole o erro do callback e commita
  o trabalho parcial; `app.undo` não existe. Mitigação atual: pré-validar tudo
  antes de abrir a transação; o que sobra, um Ctrl+Z desfaz.
- **`app.addContextMenu` e `app.events` são código morto** — o gatilho tem que
  ser o menu Scripts, e não dá para observar a edição do humano em tempo real.
- **Overlay é só desenho** — não trava o input do humano na região.
- **`File > New` exige um bundle de assets do Tibia 12+.**

Detalhes: [`docs/planejamento/investigacao-lua-api-rme.md`](docs/planejamento/investigacao-lua-api-rme.md)
e [`rme-scripts/README.md`](rme-scripts/README.md).

---

## 🛠️ Roadmap

**MVP da co-edição ao vivo** (issues #8–#13) — **entregue**:

- [x] Scaffolding do monorepo + CI
- [x] Spike de transporte + ADR 0001 (HTTP)
- [x] Contrato de mensagens + validação + fixtures
- [x] Tracer bullet: menu Scripts → request real → response → tile aplicado (undo atômico)
- [x] Validação de limites nos dois lados + pré-checagem antes da transação
- [x] Cérebro real: instrução em linguagem natural → `claude -p` (sem API key)
- [x] Overlay + auto-contorno + alertas de borda

**MCP + empacotamento** (ADR 0002) — **em desenvolvimento**:

- [x] `relay` — fila de comandos + sessão única
- [x] `@rme-agent-bridge/mcp` — MCP server (stdio + HTTP), 6 ferramentas
- [ ] Loop de sessão no `rme_agent.lua` — *a v4.0 aborta (`std::system_error`) com HTTP repetido no loop; em investigação*
- [ ] `docker-compose` (editor headless + noVNC + relay num `up` só)
- [ ] Plugin do Claude Code pra instalação em um comando

**Precisa de fork do RME em C++**:

- [ ] Rollback de verdade na transação (a v4.0 engole o erro e commita o parcial)
- [ ] Servidor de entrada no editor (dispensa a janela de sessão)
- [ ] Gatilho por clique-direito e observação contínua da edição do humano
- [ ] Bloqueio físico do input do humano na área ativa

---

## 🧑‍💻 Desenvolvimento

### Fluxo de branches (Gitflow leve)

- `main` — releases estáveis.
- `develop` — branch de integração; todo trabalho é mergeado aqui via PR.
- Features: `feat/<nome>` a partir de `develop` → PR para `develop` (CI obrigatório).

### Rodando

| Parte | Setup | Checks |
| --- | --- | --- |
| `sdk-node/` | `npm ci` | `npm run lint && npm run typecheck && npm run build && npm test` |
| `mcp-node/` | `npm ci` | `npm run lint && npm run typecheck && npm run build && npm test` |
| `rme-scripts/` | copiar `rme_agent.lua` para `<RME>/scripts/` | rodar pelo menu Scripts do editor |

**Modo "uma instrução"** (funciona hoje): `cd sdk-node && npm run stub -- --brain claude`
sobe a ponte; no editor, seleciona uma região e roda **Scripts → RME Agent →
Uma instrução**.

**Modo sessão/MCP** (em desenvolvimento): `npm run relay` no `sdk-node/` +
`rme-mcp` apontado pra ele; no editor, **Scripts → RME Agent → Sessão do agente**.
Ver [ADR 0002](docs/adr/0002-mcp-e-janela-de-sessao.md).

Detalhes e limitações da v4.0 em [`rme-scripts/README.md`](rme-scripts/README.md).

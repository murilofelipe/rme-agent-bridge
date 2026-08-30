# 🗺️ RME Agent Bridge

[Português](README.md) · **English**

[![Lua](https://img.shields.io/badge/Editor-Lua-2C2D72.svg)](#)
[![TypeScript](https://img.shields.io/badge/Terminal-TypeScript-3178C6.svg)](#)
[![Node.js](https://img.shields.io/badge/Env-Node.js-339933.svg)](#)
[![MCP](https://img.shields.io/badge/Protocol-MCP-6E56CF.svg)](#)

**RME Agent Bridge** is a bridge between AI agents and the **Remere's Map Editor
(RME)**, the OpenTibia map editor. It gives any agent a way to *see* and
*manipulate* a map open in the editor — no mouse simulation, no screenshots.

The analogy: it is to RME what Claude Code's browser extension is to a website.
The editor exposes **commands** (`put grass at tile 100,50`, `run auto-border on
this area`, `tell me what's here`, `select this region`) and the agent calls
them directly.

> The full picture of the project lives in [`CONTEXT.md`](CONTEXT.md).

---

## 🎯 What this project is (and isn't)

**The bridge is the product.** Who the agent is — Claude Code, a local model,
your own script — is pluggable and **out of scope**. There is a single command
contract underneath; the ways to consume it (SDK, MCP server, plugin) are thin
wrappers over it.

The bridge does **not** understand natural language, has **no** AI model of its
own, generates **nothing** procedurally, and does **not** interpret images.
Turning *"make a dark lake in the northeast corner"* into map actions is the
agent's job. The bridge only exposes the map in a shape an LLM can reason about.

## 🧩 Target use cases

1. **Live co-editing** — a person works in RME as usual; an agent works on the
   same map alongside them, guided by chat.
2. **Reproduce a reference** — given a map from another game or an image, the
   agent builds it in the editor for a game server.

## ⚙️ How live co-editing works

| Topic | Decision |
| --- | --- |
| Interaction | The agent calls **MCP tools** (`rme_get_selection`, `rme_apply_operations`, …) or receives **a single natural-language instruction** via a dialog in the editor |
| Agent operation | One call = one atomic transaction = **one** undo step |
| Concurrency | Goal: lock the human's input in the active area. **Today it's a visual notice only** — physical locking needs a fork (see limitations below) |
| Visual | Semi-transparent rectangle/label over the area while the agent works |
| Communication | **HTTP** (ADR 0001). The editor has no inbound server, so the human opens a **session window** from the Scripts menu and the script long-polls while the agent acts (ADR 0002) |
| Modes | (1) **Agent session** — window opened from the menu, agent acts freely via MCP · (2) **Single instruction** — human selects an area and types what they want (`claude -p`, no API key) |
| Auto-border | Automatic at the end of each transaction (per-operation opt-out) |

## 🎯 Technical target

- Editor: [`opentibiabr/remeres-map-editor`](https://github.com/opentibiabr/remeres-map-editor)
  — `canary-map-editor` v4.0+ build (has the Lua API: `app.transaction`, `map`,
  `tile`, `app.mapView.addOverlay`, `http`, `Dialog`)
- Client/items: recent Tibia (protocol 13.x) — a single target
- Transport: **HTTP**, one round-trip per invocation — the Lua script calls a
  local bridge via a LAN IP or an `/etc/hosts` alias (ADR 0001)

---

## 📁 Monorepo layout

```text
rme-agent-bridge/
├── rme-scripts/  # EDITOR side: rme_agent.lua runs inside RME (Scripts menu)
├── sdk-node/     # TERMINAL side (TS): contract, validation, relay, claude -p brain
│   └── src/
│       ├── contract/  # BridgeRequest/Response + validation + fixtures
│       ├── bridge/    # handler + stub server + claudeBrain
│       └── relay/     # command queue + session (ADR 0002)
├── mcp-node/     # MCP server (@rme-agent-bridge/mcp) — exposes the editor as tools
├── docs/
│   ├── adr/          # decisions (0001 = HTTP transport · 0002 = MCP + session window)
│   ├── agents/       # engineering-skills config
│   └── planejamento/ # Lua API investigation + notes
├── CONTEXT.md
└── README.md
```

> The old plan (fork RME + a self-contained agent, `core-cpp/` + `agent-python/`
> + `docker/`) was removed: the investigation
> (`docs/planejamento/investigacao-lua-api-rme.md`) showed the v4.0 Lua API
> already covers the essentials, and the architecture collapsed to *Lua scripts
> + terminal side*.

---

## ⚠️ v4.0 build limitations (what needs a fork today)

Runtime investigation found ceilings in the `canary-map-editor` v4.0 Lua API:

- **`app.transaction` has no rollback** — it swallows the callback's error and
  commits the partial work; `app.undo` does not exist. Current mitigation:
  pre-validate everything before opening the transaction; whatever slips
  through, a single Ctrl+Z undoes.
- **`app.addContextMenu` and `app.events` are dead code** — the trigger has to
  be the Scripts menu, and there's no way to observe the human's edits in real
  time.
- **The overlay is draw-only** — it does not lock the human's input in the area.
- **`File > New` requires a Tibia 12+ asset bundle.**

Details: [`docs/planejamento/investigacao-lua-api-rme.md`](docs/planejamento/investigacao-lua-api-rme.md)
and [`rme-scripts/README.md`](rme-scripts/README.md).

---

## 🛠️ Roadmap

**Live co-editing MVP** (issues #8–#13) — **delivered**:

- [x] Monorepo scaffolding + CI
- [x] Transport spike + ADR 0001 (HTTP)
- [x] Message contract + validation + fixtures
- [x] Tracer bullet: Scripts menu → real request → response → tile applied (atomic undo)
- [x] Bounds validation on both sides + pre-check before the transaction
- [x] Real brain: natural-language instruction → `claude -p` (no API key)
- [x] Overlay + auto-border + edge alerts

**MCP + packaging** (ADR 0002) — **delivered**:

- [x] `relay` — command queue + single session
- [x] `@rme-agent-bridge/mcp` — MCP server (stdio + HTTP), 6 tools
- [x] Session loop in `rme_agent.lua` (single `/stream` connection; fixed the
      v4.0 `std::system_error` on closing a live stream)
- [x] `docker-compose` (headless editor + noVNC + relay + MCP in one `up`)
- [x] Claude Code plugin (`/plugin marketplace add murilofelipe/rme-agent-bridge`)

**Needs a C++ fork of RME**:

- [ ] Real transaction rollback (v4.0 swallows the error and commits the partial)
- [ ] Inbound server in the editor (removes the session window)
- [ ] Right-click trigger and continuous observation of the human's edits
- [ ] Physical lock of the human's input in the active area

---

## 🧑‍💻 Development

### Branch flow (light Gitflow)

- `main` — stable releases.
- `develop` — integration branch; all work merges here via PR.
- Features: `feat/<name>` off `develop` → PR to `develop` (CI required).

### Running

| Part | Setup | Checks |
| --- | --- | --- |
| `sdk-node/` | `npm ci` | `npm run lint && npm run typecheck && npm run build && npm test` |
| `mcp-node/` | `npm ci` | `npm run lint && npm run typecheck && npm run build && npm test` |
| `rme-scripts/` | copy `rme_agent.lua` to `<RME>/scripts/` | run it from the editor's Scripts menu |

**"Single instruction" mode** (works today): `cd sdk-node && npm run stub -- --brain claude`
starts the bridge; in the editor, select a region and run **Scripts → RME Agent →
Single instruction**.

**Session/MCP mode:** the easiest path is the `docker-compose` — it brings up
the editor (noVNC), relay and MCP in one `up`; see
[`docker/README.md`](docker/README.md) and the plugin in [`plugin/`](plugin/).
Without Docker: `npm run relay` in `sdk-node/` + `rme-mcp` pointed at it. In the
editor: **Scripts → RME Agent → Agent session**. See
[ADR 0002](docs/adr/0002-mcp-e-janela-de-sessao.md).

Details and v4.0 limitations in [`rme-scripts/README.md`](rme-scripts/README.md).

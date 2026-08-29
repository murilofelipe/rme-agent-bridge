# RME Agent Bridge

Ponte entre agentes LLM e o Remere's Map Editor para geração de mapas OpenTibia
via API nativa. Serviços: `core-cpp/`, `sdk-node/`, `agent-python/`. Fluxo de
branches: `main` (releases) + `develop` (integração); features via PR para
`develop`.

## Agent skills

### Issue tracker

Issues e specs vivem como GitHub issues (`gh` CLI), no repo `murilofelipe/rme-agent-bridge`. See `docs/agents/issue-tracker.md`.

### Triage labels

Labels canônicas padrão (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` na raiz do repo. See `docs/agents/domain.md`.

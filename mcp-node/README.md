# @rme-agent-bridge/mcp

MCP server que expõe o **Remere's Map Editor** (mapas OpenTibia) como
ferramentas para qualquer agente. Parte do
[RME Agent Bridge](https://github.com/murilofelipe/rme-agent-bridge).

## Uso

```bash
npx @rme-agent-bridge/mcp                 # stdio (config .mcp.json)
npx @rme-agent-bridge/mcp --http --port 8778   # Streamable HTTP (docker-compose)
```

Env: `RME_RELAY_URL` (padrão `http://127.0.0.1:8777`) — o relay
(`@rme-agent-bridge/sdk`) com o qual as ferramentas falam.

## Ferramentas

`rme_session_status`, `rme_get_selection`, `rme_get_map_context`,
`rme_get_tile`, `rme_apply_operations`, `rme_end_session`.

Requer uma **sessão aberta no editor** (menu Scripts → RME Agent → Sessão do
agente). Ver [ADR 0002](https://github.com/murilofelipe/rme-agent-bridge/blob/main/docs/adr/0002-mcp-e-janela-de-sessao.md).

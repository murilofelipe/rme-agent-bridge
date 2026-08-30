---
description: Logs do docker-compose do RME Agent Bridge
---

Rode `docker compose -f docker/docker-compose.yml logs --tail 80` a partir da
raiz do repo `rme-agent-bridge`. Se o usuário indicar um serviço (`relay`,
`mcp` ou `editor`), passe o nome no fim. Procure por:

- `[relay] ouvindo` — relay ok
- `[rme-mcp] Streamable HTTP em :8778` — MCP ok
- `[editor] noVNC em ...` — editor ok
- `[Lua] [rme-agent] sessão ... aberta` — sessão do agente ativa
- `std::system_error` / `Aborted` — o editor crashou (reporte o log)

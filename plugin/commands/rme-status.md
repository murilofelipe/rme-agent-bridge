---
description: Estado do RME Agent Bridge (containers + há sessão do agente ativa?)
---

Mostre o estado:

1. `docker compose -f docker/docker-compose.yml ps` — os 3 serviços (relay,
   mcp, editor) estão `up`?
2. `curl -s http://localhost:8778/mcp` não serve pra status; use a ferramenta
   MCP **`rme_session_status`** pra ver se há uma sessão do agente aberta no
   editor.
3. Se não houver sessão: lembre o usuário de abrir **Scripts → RME Agent →
   Sessão do agente (MCP)** no editor (http://localhost:8080/vnc.html).

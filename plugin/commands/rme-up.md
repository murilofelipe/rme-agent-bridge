---
description: Sobe o docker-compose do RME Agent Bridge (editor headless + relay + MCP)
---

Suba o stack do RME Agent Bridge.

1. Ache a raiz do repo `rme-agent-bridge` (contém `docker/docker-compose.yml`).
   Se não estiver num checkout, peça o caminho ao usuário ou clone
   `https://github.com/murilofelipe/rme-agent-bridge`.
2. Se `docker/.env` não existir, copie `docker/.env.example` para `docker/.env`
   e peça ao usuário o caminho da pasta de assets do Tibia (`TIBIA_ASSETS` —
   precisa ter `assets/catalog-content.json` + `package.json`).
3. Rode: `docker compose -f docker/docker-compose.yml up -d --build`
4. Quando subir, diga ao usuário:
   - editor: **http://localhost:8080/vnc.html**
   - o MCP `rme` deste plugin já aponta pra `http://localhost:8778/mcp`
   - no editor: **Scripts → RME Agent → Sessão do agente (MCP)** pra habilitar
     as ferramentas

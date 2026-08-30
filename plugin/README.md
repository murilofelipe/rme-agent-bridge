# rme-agent-bridge — plugin do Claude Code

Dá ao Claude Code as ferramentas do **Remere's Map Editor** (mapas OpenTibia)
e comandos pra subir o stack em Docker.

## Instalação

```
/plugin marketplace add murilofelipe/rme-agent-bridge
/plugin install rme-agent-bridge@rme-agent-bridge
```

## O que vem junto

- **MCP `rme`** — aponta pra `http://localhost:8778/mcp` (o serviço `mcp` do
  docker-compose). Ferramentas: `rme_session_status`, `rme_get_selection`,
  `rme_get_map_context`, `rme_get_tile`, `rme_apply_operations`,
  `rme_end_session`.
- **Comandos:** `/rme-up`, `/rme-down`, `/rme-status`, `/rme-logs`.

## Fluxo

1. `/rme-up` — sobe editor + relay + MCP (pede o caminho dos assets do Tibia
   na 1ª vez).
2. Abra **http://localhost:8080/vnc.html** e no editor:
   **Scripts → RME Agent → Sessão do agente (MCP)**.
3. Peça o que quiser ao Claude — ele usa as ferramentas `rme_*` enquanto a
   sessão estiver aberta. Fora da sessão, as ferramentas devolvem um erro
   claro.

## Sem Docker

Se você roda o editor de outro jeito: `npm run relay` no `sdk-node/` e
`rme-mcp` (do `mcp-node/`) apontado pra ele. Ver o `README.md` da raiz e a
[ADR 0002](../docs/adr/0002-mcp-e-janela-de-sessao.md).

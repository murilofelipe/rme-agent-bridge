# docker/ — editor + ponte + MCP num `up` só

Empacota o lado-editor e o lado-terminal (ADR 0002). Três serviços numa rede
interna:

| Serviço | O que roda | Porta |
| --- | --- | --- |
| `relay` | fila de comandos + sessão (`sdk-node`) | interna, alias `rme-bridge.local` |
| `mcp` | `rme-mcp --http` (`mcp-node`) | **8778** (cliente MCP conecta aqui) |
| `editor` | `canary-map-editor` v4.0 headless + noVNC | **8080** (browser) |

O alias de rede `rme-bridge.local` resolve o `isUrlSafe` do editor (ADR 0001):
**nenhuma edição de `/etc/hosts` no host**.

## Uso

```bash
cp docker/.env.example docker/.env
# edite docker/.env: TIBIA_ASSETS = pasta com assets/catalog-content.json + package.json
docker compose -f docker/docker-compose.yml up --build
```

1. Abra **http://localhost:8080/vnc.html** — o editor. Se não abrir um mapa
   sozinho, `File > New`.
2. Aponte seu cliente MCP para **http://localhost:8778/mcp**
   (ex. `.mcp.json`: `{ "mcpServers": { "rme": { "type": "http", "url": "http://localhost:8778/mcp" } } }`).
3. No editor: **Scripts → RME Agent → Sessão do agente (MCP)**. Enquanto a
   sessão dura, as ferramentas MCP respondem.

### ⚠️ O canvas do noVNC fica preto

`Xvfb` não tem GL de hardware, então o **mapa não renderiza** no noVNC — só
os menus, a toolbar, os diálogos e o **Scripts** funcionam. O agente aplica
tiles normalmente (dá pra conferir com `File > Save` e abrir o `.otbm` noutro
lugar), você só não vê ao vivo.

**Pra VER o mapa** (desktop Linux com X): rode o relay+mcp pelo compose e o
editor na sua própria tela —

```bash
docker compose -f docker/docker-compose.yml up -d relay mcp
TIBIA_ASSETS=/caminho/abs/tibia-client/Tibia ./docker/editor-on-host-display.sh
```

A janela do editor abre no seu X, com a sua GPU, canvas funcionando. O
container é só pra contornar o glibc do binário v4.0. Ele entra na rede
`rme-agent-bridge` do compose pra alcançar o relay (sem publicar porta —
nada de conflito de `address already in use`).

## Assets

Os assets do Tibia são da Cipsoft — **não** vão na imagem. Você monta a sua
pasta via `TIBIA_ASSETS`. Fontes: um release do `dudantas/tibia-client`, ou os
dados do seu servidor Canary.

## Limitações

- **Canvas preto no noVNC** (Xvfb não tem GL de hardware) — veja acima; use
  `editor-on-host-display.sh` pra ver o mapa de verdade. O overlay da sessão
  também só aparece com GL real.
- Modo "uma instrução" (`POST /bridge` / `claude -p`) **não** funciona no
  compose (o container do `relay` não tem o CLI `claude` autenticado). Use a
  sessão MCP, ou rode `npm run relay` no host pra esse modo.
- `canary-map-editor` v4.0 exige glibc 2.38 → a imagem do editor é `ubuntu:24.04`.

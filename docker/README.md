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

**Suba os 3 serviços** (`--build` na primeira vez / depois de `git pull`):

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

1. Abra **http://localhost:8080/vnc.html** e clique **Connect** — o editor.
   Se não abrir um mapa sozinho, `File > New`.
2. Aponte seu cliente MCP para **http://localhost:8778/mcp**. Isso **não** é
   pra abrir no browser (um GET dá `Not Acceptable: must accept
   text/event-stream` — é o servidor funcionando). Vai no `.mcp.json`:
   `{ "mcpServers": { "rme": { "type": "http", "url": "http://localhost:8778/mcp" } } }`.
3. No editor: **Scripts → RME Agent → Sessão do agente (MCP)**. Enquanto a
   sessão dura, as ferramentas MCP respondem.

### O canvas fica preto quando o mapa está vazio

Isso é **normal** — mapa sem tiles = preto. O render do canvas funciona no
noVNC (software GL). Assim que você (ou o agente, via
`rme_apply_operations`) botar tiles, eles aparecem. Terrenos escuros +
sem iluminação renderizam bem escuros; grama/areia com zoom normal fica
visível.

### Alternativa: janela nativa (`editor-on-host-display.sh`)

Se preferir uma janela na sua tela em vez do browser (desktop Linux com X):

```bash
docker compose -f docker/docker-compose.yml up -d relay mcp
./docker/editor-on-host-display.sh
```

Lê `TIBIA_ASSETS` do `docker/.env`, roda como o seu UID, entra na rede do
compose. Com `nvidia-container-toolkit` instalado usa a GPU; senão, software
GL (renderiza, só mais lento).

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

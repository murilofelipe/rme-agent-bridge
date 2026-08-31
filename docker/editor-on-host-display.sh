#!/usr/bin/env bash
# Roda SÓ o editor num container (resolve o glibc), renderizando no SEU X
# server — a janela abre na sua tela, com GPU de verdade, canvas funcionando.
# Use no lugar do serviço `editor` do compose quando você está num desktop
# Linux e quer VER o mapa (o noVNC mostra canvas preto: Xvfb não tem GL de
# hardware).
#
#   docker compose -f docker/docker-compose.yml up -d relay mcp
#   ./docker/editor-on-host-display.sh          # lê TIBIA_ASSETS do docker/.env
#
# A janela do editor abre na SUA TELA (não é um link/browser). No editor:
# Scripts -> RME Agent -> Sessão do agente (MCP).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

# usa o mesmo docker/.env do compose, se existir
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a

: "${TIBIA_ASSETS:?defina TIBIA_ASSETS no docker/.env (caminho ABSOLUTO da pasta com assets/ + package.json)}"
: "${DISPLAY:?sem DISPLAY — precisa de uma sessão X (não Wayland puro / SSH sem -X)}"
[ -f "$TIBIA_ASSETS/package.json" ] && [ -f "$TIBIA_ASSETS/assets/catalog-content.json" ] || {
  echo "erro: $TIBIA_ASSETS não tem package.json + assets/catalog-content.json" >&2; exit 1; }

IMAGE="${IMAGE:-rme-agent-bridge-editor}"
echo "[host-editor] build da imagem ($IMAGE)…"
docker build -q -f "$HERE/Dockerfile.editor" -t "$IMAGE" "$HERE/.." >/dev/null

xhost "+local:" >/dev/null
trap 'xhost -local: >/dev/null 2>&1 || true' EXIT

# --- GL: NVIDIA (via nvidia-container-toolkit) se der, senão software ---
# RME_GL=nvidia | software  força; vazio = auto.
gpu=()
gl_env=()
mode="${RME_GL:-auto}"
if { [ "$mode" = auto ] || [ "$mode" = nvidia ]; } && command -v nvidia-ctk >/dev/null 2>&1; then
  gpu=(--gpus all)
  gl_env=(-e NVIDIA_DRIVER_CAPABILITIES=graphics,display,compute,utility -e NVIDIA_VISIBLE_DEVICES=all)
  echo "[host-editor] GL: NVIDIA (nvidia-container-toolkit)"
else
  # llvmpipe renderiza pro X real via swrast — mais lento, mas pinta (o
  # driver Mesa do container não fala com o X server da NVIDIA).
  gl_env=(-e LIBGL_ALWAYS_SOFTWARE=1 -e GALLIUM_DRIVER=llvmpipe)
  [ -d /dev/dri ] && gpu=(--device /dev/dri:/dev/dri)
  for g in render video; do
    gid=$(getent group "$g" | cut -d: -f3 || true); [ -n "$gid" ] && gpu+=(--group-add "$gid")
  done
  echo "[host-editor] GL: software (llvmpipe). Pra usar a GPU: instale o"
  echo "[host-editor]     nvidia-container-toolkit e rode de novo (RME_GL=nvidia)."
fi

# roda como o SEU UID pra que a memória compartilhada do X (MIT-SHM) case com
# o seu Xorg — senão spama `MESA: Failed to attach to x11 shm`.
XAUTH="${XAUTHORITY:-$HOME/.Xauthority}"
[ -f "$XAUTH" ] || XAUTH="$(ls /run/user/$(id -u)/*/Xauthority 2>/dev/null | head -1 || true)"
xauth_args=()
[ -n "$XAUTH" ] && [ -f "$XAUTH" ] && xauth_args=(-e XAUTHORITY=/tmp/.xauth -v "$XAUTH":/tmp/.xauth:ro)

ASSETS_ID="$(jq -r '.version // "tibia"' "$TIBIA_ASSETS/package.json" 2>/dev/null || echo tibia)"

# entra na rede do compose pra resolver `rme-bridge.local` (sem publicar porta)
NET="${RME_NETWORK:-rme-agent-bridge}"
docker network inspect "$NET" >/dev/null 2>&1 || {
  echo "erro: a rede '$NET' não existe — rode antes:" >&2
  echo "  docker compose -f docker/docker-compose.yml up -d relay mcp" >&2
  exit 1
}

echo "[host-editor] abrindo a janela do editor na sua tela…"
exec docker run --rm -it --ipc=host \
  --user "$(id -u):$(id -g)" \
  -e DISPLAY="$DISPLAY" -e HOME=/tmp "${gl_env[@]}" \
  -v /tmp/.X11-unix:/tmp/.X11-unix "${xauth_args[@]}" "${gpu[@]}" \
  --network "$NET" \
  -v "$TIBIA_ASSETS":/rme-client:ro \
  -v "$HERE/../rme-scripts/rme_agent.lua":/rme/scripts/rme_agent.lua:ro \
  --entrypoint bash "$IMAGE" -c "
    cat > /rme/rme.cfg <<EOF
GOTO_WEBSITE_ON_BOOT=0
USE_UPDATER=0
[Version]
ASSETS_DATA_DIRS=[{\"id\":\"$ASSETS_ID\",\"path\":\"/rme-client\"}]
[Window]
WELCOME_DIALOG=0
EOF
    cd /rme && exec ./canary-map-editor
  "

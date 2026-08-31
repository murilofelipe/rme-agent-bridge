#!/bin/bash
# xvfb -> WM -> x11vnc -> noVNC -> editor. O canvas fica preto sob GL por
# software (headless) — menus/diálogos/Scripts funcionam. Se o x11vnc/noVNC
# falhar, o editor e a sessão MCP continuam funcionando (só não dá pra ver
# pelo browser).

set -eu
export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe
export DISPLAY=:99

if [ ! -f /rme-client/package.json ] || [ ! -f /rme-client/assets/catalog-content.json ]; then
  echo "[editor] ERRO: /rme-client não tem package.json + assets/catalog-content.json." >&2
  echo "[editor] Ajuste TIBIA_ASSETS no docker/.env: caminho ABSOLUTO da pasta que" >&2
  echo "[editor] CONTÉM 'assets/' e 'package.json' (não a pasta 'assets/' em si)." >&2
  echo "[editor] Conteúdo visto em /rme-client:" >&2
  ls -la /rme-client >&2 || true
  exit 1
fi

ASSETS_ID="$(jq -r '.version // "tibia"' /rme-client/package.json 2>/dev/null || echo tibia)"
cat > /rme/rme.cfg <<EOF
GOTO_WEBSITE_ON_BOOT=0
USE_UPDATER=0
[Version]
ASSETS_DATA_DIRS=[{"id":"${ASSETS_ID}","path":"/rme-client"}]
USE_SQLITE_MATERIALS=1
[Window]
WELCOME_DIALOG=0
WINDOW_MAXIMIZED=1
EOF

echo "[editor] assets id: ${ASSETS_ID}"
mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
rm -f /tmp/.X99-lock

set +e   # daqui pra baixo, falha de VNC não pode derrubar o editor

Xvfb :99 -screen 0 "${SCREEN:-1600x1000x24}" -ac +extension GLX -nolisten tcp >/tmp/xvfb.log 2>&1 &
for i in $(seq 1 60); do
  xdpyinfo -display :99 >/dev/null 2>&1 && break
  sleep 0.5
done
if ! xdpyinfo -display :99 >/dev/null 2>&1; then
  echo "[editor] ERRO: Xvfb não subiu. Log:" >&2; cat /tmp/xvfb.log >&2; exit 1
fi

matchbox-window-manager -use_titlebar no >/tmp/wm.log 2>&1 &
sleep 1

if x11vnc -display :99 -forever -shared -nopw -rfbport 5900 -noxdamage -bg -o /tmp/x11vnc.log; then
  websockify --web /opt/novnc 8080 localhost:5900 >/tmp/novnc.log 2>&1 &
  echo "[editor] noVNC pronto:  http://localhost:8080/vnc.html"
else
  echo "[editor] AVISO: x11vnc falhou — sem noVNC (a sessão MCP funciona). Log:" >&2
  cat /tmp/x11vnc.log >&2 || true
fi

echo "[editor] relay esperado em http://rme-bridge.local:8777"
cd /rme
exec ./canary-map-editor

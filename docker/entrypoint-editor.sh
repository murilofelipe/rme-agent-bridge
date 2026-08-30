#!/bin/bash
# Sobe xvfb -> WM -> x11vnc -> noVNC -> o editor. O canvas fica preto sob GL
# por software (headless) — os menus e diálogos funcionam; abra um mapa por
# File > New se o WELCOME_DIALOG não auto-criar.
set -e

export DISPLAY=:99
export LIBGL_ALWAYS_SOFTWARE=1

# id dos assets: tenta o version do package.json do client montado
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

Xvfb :99 -screen 0 "${SCREEN:-1600x1000x24}" >/tmp/xvfb.log 2>&1 &
sleep 2
matchbox-window-manager -use_titlebar no >/tmp/wm.log 2>&1 &
sleep 1
x11vnc -display :99 -forever -shared -nopw -rfbport 5900 -bg -quiet
websockify --web /usr/share/novnc 8080 localhost:5900 >/tmp/novnc.log 2>&1 &

echo "[editor] noVNC em http://localhost:8080/vnc.html   (assets id: ${ASSETS_ID})"
echo "[editor] relay esperado em http://rme-bridge.local:8777"

cd /rme
exec ./canary-map-editor

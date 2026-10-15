#!/bin/bash
# Local Omarchy layer: Gallery's web with hot reload, for design work (impeccable and friends). Vite's dev server runs
# in the web-check image (gallery-web-check:local, which already holds every dependency) with this checkout's
# web/src, web/static and i18n mounted read-only, on http://localhost:2284 only. /api goes to the live Gallery on
# :2283, so the pages show the real library under the session the browser is already logged in with (a cookie for
# localhost reaches every port), and Curator answers it too (its CURATOR_CORS_ORIGIN_REGEX allows localhost:2284).
# An edit under web/src shows in the browser within a second; nothing here writes to the checkout, and the deployed
# web (local-build.sh) is unaffected.
#
#   ./local-dev.sh start | stop | restart | status | logs
#   ./local-dev.sh login                  once: log in to the screenshot browser (a window opens; you type, I don't)
#   ./local-dev.sh shots [options]        headless screenshots of the dev server (tools/local-shots.mjs has the options:
#                                         --live, --routes, --viewports aorus,dell,laptop,tablet,phone, --modes, --all,
#                                         --hidpi, --compare RUN_A RUN_B) into ~/.cache/gallery-shots/<time>/
#
# Differences from the deployed build: upstream names show where the build's apply-branding would say Gallery, and
# web files outside src/ and static/ (vite.config.ts, package.json) come from the image, so rebuild the image when
# those change. Node only warns about unhandled rejections: in dev, SvelteKit loads the root layout on the server to
# read its `ssr = false`, and upstream's asset-utils probes image formats with `new Image()` in an async function at
# import, which Node (no Image) rejects; left to the default, that rejection stops the whole dev server.
set -euo pipefail
SRC=$(cd "$(dirname "$0")" && pwd)
NAME=gallery-web-dev
PORT=${GALLERY_DEV_PORT:-2284}
IMAGE=${GALLERY_DEV_IMAGE:-gallery-web-check:local}

running() { [[ $(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null) == true ]]; }

start() {
  if running; then
    echo "already running: http://localhost:$PORT"
    return
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" \
    -p "127.0.0.1:$PORT:$PORT" \
    --add-host host.docker.internal:host-gateway \
    -e IMMICH_SERVER_URL=http://host.docker.internal:2283/ \
    -e NODE_OPTIONS=--unhandled-rejections=warn \
    -v "$SRC/web/src:/usr/src/app/web/src:ro" \
    -v "$SRC/web/static:/usr/src/app/web/static:ro" \
    -v "$SRC/i18n:/usr/src/app/i18n:ro" \
    "$IMAGE" sh -c "cd web && npx svelte-kit sync >/dev/null && exec npx vite dev --host 0.0.0.0 --port $PORT --strictPort" \
    >/dev/null
  # the first start compiles the app: wait until it answers
  for _ in $(seq 1 90); do
    if curl -sf -o /dev/null "http://localhost:$PORT/"; then
      echo "ready: http://localhost:$PORT"
      return
    fi
    running || { echo "the dev server stopped:" >&2; docker logs --tail 30 "$NAME" >&2; exit 1; }
    sleep 1
  done
  echo "still starting; see ./local-dev.sh logs" >&2
}

case ${1:-status} in
  start) start ;;
  stop) docker rm -f "$NAME" >/dev/null 2>&1 && echo stopped || echo "not running" ;;
  restart) docker rm -f "$NAME" >/dev/null 2>&1 || true; start ;;
  status) running && echo "running: http://localhost:$PORT" || echo "not running" ;;
  logs) docker logs --tail "${2:-50}" -f "$NAME" ;;
  login) shift; node "$SRC/tools/local-shots.mjs" login "$@" ;;
  shots) shift; node "$SRC/tools/local-shots.mjs" "$@" ;;
  *) echo "usage: $0 start|stop|restart|status|logs|login|shots" >&2; exit 2 ;;
esac

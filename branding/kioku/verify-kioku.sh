#!/usr/bin/env bash
# Local Omarchy layer: lists every Noodle Gallery, Gallery (the brand, not the word) and Immich left where people see
# the Kioku build, and exits 1 on any that brand.json does not keep on purpose (the phone app, the server's releases,
# purchase and credits; README.md). It reads either
#
#   branding/kioku/verify-kioku.sh <copy root>      local-build.sh's copy after apply-kioku.sh: the i18n bundle, the
#                                                   titles, the manifest, app.html and the memory player's sources
#   branding/kioku/verify-kioku.sh <build output>   local-build.sh's $WORK/out: every text file of the built web and
#                                                   memory player, the locale bundles read out of their chunks, and
#                                                   the precompressed copies checked against their files
#
# and changes nothing. local-build.sh runs it on the copy before the Docker build and on the output after it.
set -euo pipefail

KIOKU_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -eq 1 && -d $1 ]] || {
  echo "usage: verify-kioku.sh <copy root | build output>" >&2
  exit 2
}
command -v node >/dev/null || {
  echo "verify-kioku: needs node" >&2
  exit 2
}
exec node "$KIOKU_DIR/kioku.mjs" verify "$1"

#!/bin/bash
# Build only the Gallery web UI from this checkout and install it where
# ~/immich/docker-compose.yml mounts it over the container's /build/www.
#
# Mirrors CI: copy the tree, run branding/scripts/apply-branding.sh on the copy
# (it rewrites files in place, so never on the checkout), then build the
# Dockerfile's `web` stage and export just web/build.
#
#   ./local-build.sh              # build + install to ~/immich/web-custom (synced in place), and the vault edition
#   ./local-build.sh --no-install
#   ./local-build.sh --vault-only # build, then install only the vault edition: the main Gallery keeps running
#   ./local-build.sh --libraries-only # build, then install only into the ordinary libraries besides Main
#
# Two editions from this one source: the full one for the owner's Gallery, and the vault edition (web/src/lib/gallery/
# edition.ts, VITE_KIOKU_EDITION=vault), stripped to what one person needs on this computer (no Curator, sharing,
# other accounts, phones, map or Locked Folder: the list is in edition.ts), which each encrypted vault's private
# Gallery serves from ~/immich/vault/web. kioku-release.json there names the Gallery server it is built
# for; a vault runs that server from its next unlock, backed up inside the vault first when that is an upgrade
# (~/immich/tools/vault). So a Gallery or Kioku update reaches the vaults by building here, as it reaches the main one.
#
# Ordinary libraries besides Main, each a Gallery stack of its own (~/immich/tools/libraries/library.py), serve the full
# edition from their own folders, each with its own kioku-library.json: which library it is, what it offers, and every
# library for Kioku's switcher. Main gets its own kioku-library.json too. Each library then runs Main's server version,
# its database dumped first when that is an upgrade, so one build here updates every library.
#
# Local Omarchy layer: the copy is then named Kioku over Noodle's branding (branding/kioku/apply-kioku.sh, logged to
# $WORK/kioku.log), and verify-kioku.sh checks the copy before the build and the output after it, so nothing installed
# still says Noodle Gallery, Gallery or Immich where it should say Kioku. GALLERY_BRAND=noodle builds Noodle Gallery
# as it comes, for a quick unbranded build; so does a checkout without branding/kioku/brand.json.
set -euo pipefail
SRC=$(cd "$(dirname "$0")" && pwd)
WORK=${GALLERY_BUILD_DIR:-$HOME/.cache/gallery-build}
DEST=${GALLERY_WEB_DEST:-$HOME/immich/web-custom}
PLAYER_DEST=${GALLERY_MEMORY_PLAYER_DEST:-$HOME/immich/memory-player}
VAULT_DEST=${GALLERY_VAULT_WEB_DEST:-$HOME/immich/vault/web}
LIBRARIES=${KIOKU_LIBRARY_TOOL:-$HOME/immich/tools/libraries/library.py}
VERSION=${GALLERY_FORK_VERSION:-$(git -C "$SRC" describe --tags --abbrev=0 2>/dev/null || echo v5.9.0)}
BRAND=${GALLERY_BRAND:-kioku}
case $BRAND in
  kioku) [[ -f "$SRC/branding/kioku/brand.json" ]] || BRAND=noodle ;;
  noodle) ;;
  *) echo "GALLERY_BRAND is kioku (the default) or noodle, not '$BRAND'"; exit 1 ;;
esac
KIOKU="$WORK/src/branding/kioku"

mkdir -p "$WORK"
rsync -a --delete --exclude node_modules --exclude .git --exclude 'web/build' --exclude 'web/build-memory-player' --exclude '.svelte-kit' \
  "$SRC/" "$WORK/src/"
cp -a "$SRC/.git" "$WORK/src/.git" 2>/dev/null || true
(cd "$WORK/src" && FORK_VERSION=$VERSION ./branding/scripts/apply-branding.sh >"$WORK/branding.log" 2>&1) \
  || { echo "apply-branding failed, see $WORK/branding.log"; exit 1; }
if [[ $BRAND == kioku ]]; then
  { "$KIOKU/apply-kioku.sh" "$WORK/src" && "$KIOKU/verify-kioku.sh" "$WORK/src"; } >"$WORK/kioku.log" 2>&1 \
    || { echo "Kioku branding failed, see $WORK/kioku.log"; tail -20 "$WORK/kioku.log"; exit 1; }
  grep '^assets:' "$WORK/kioku.log" || true
else
  echo "building Noodle Gallery's branding only (GALLERY_BRAND=noodle, or no branding/kioku/brand.json)"
fi

# Append a scratch stage holding only the built sites, so the export copies ~80 MB, not the stages' node_modules. The
# vault edition is the same tree built again with its flag set.
cat >>"$WORK/src/server/Dockerfile" <<'DOCKER'

FROM web AS memory-player
RUN cd /usr/src/app/web && pnpm exec vite build --config vite.memory.config.ts
FROM web AS vault-web
RUN cd /usr/src/app/web && VITE_KIOKU_EDITION=vault pnpm exec vite build
FROM scratch AS web-export
COPY --from=web /usr/src/app/web/build /web/
COPY --from=memory-player /usr/src/app/web/build-memory-player /memory-player/
COPY --from=vault-web /usr/src/app/web/build /vault-web/
DOCKER
rm -rf "$WORK/out"
docker buildx build \
  -f "$WORK/src/server/Dockerfile" \
  --target web-export \
  --build-arg BUILD_ID="local-$(date +%Y%m%d%H%M)" \
  --output type=local,dest="$WORK/out" \
  "$WORK/src" >"$WORK/build.log" 2>&1 \
  || { echo "build failed, see $WORK/build.log"; tail -30 "$WORK/build.log"; exit 1; }
if [[ $BRAND == kioku ]]; then
  "$KIOKU/verify-kioku.sh" "$WORK/out" >>"$WORK/kioku.log" 2>&1 \
    || { echo "the build names Noodle Gallery, Gallery or Immich off Kioku's keep list, see $WORK/kioku.log"; exit 1; }
fi
# Each build names the edition it was made as (markEdition in web/src/lib/gallery/edition.ts, folded to one word at build
# time): the vault flag reached the vault edition, and only it, or nothing is installed.
edition_is() { grep -rqsE "kiokuEdition=.$2." "$WORK/out/$1" && ! grep -rqsE "kiokuEdition=.$3." "$WORK/out/$1"; }
edition_is web full vault || { echo "the main build is not the full edition (web/src/lib/gallery/edition.ts)"; exit 1; }
edition_is vault-web vault full || { echo "the vault build is not the vault edition (web/src/lib/gallery/edition.ts)"; exit 1; }
changes=$([[ -n $(git -C "$SRC" status --porcelain) ]] && echo '+changes' || true)
printf '{"edition": "vault", "server": "%s", "commit": "%s%s", "built": "%s"}\n' \
  "$VERSION" "$(git -C "$SRC" rev-parse --short=12 HEAD)" "$changes" "$(date -Iseconds)" >"$WORK/out/kioku-release.json"
echo "built ($BRAND): $(du -sh "$WORK/out" | cut -f1), both editions for Gallery server $VERSION"

install_vault() {
  # A vault's Gallery mounts this read-only and reads it when it starts, so nothing restarts here. Old hashed chunks stay
  # a few days, as below. The release goes in last: the next unlock reads it to choose its server.
  mkdir -p "$VAULT_DEST"
  rsync -a --delete-after --filter='protect _app/immutable/**' --filter='protect kioku-release.json' \
    "$WORK/out/vault-web/" "$VAULT_DEST/"
  find "$VAULT_DEST/_app/immutable" -type f -mtime +3 -delete 2>/dev/null || true
  cp "$WORK/out/kioku-release.json" "$VAULT_DEST/.kioku-release.json.new"
  mv "$VAULT_DEST/.kioku-release.json.new" "$VAULT_DEST/kioku-release.json"
  # The images that server needs (~/immich/tools/vault/compose.yml), fetched now while online, not at an unlock.
  local image
  for image in gallery-server gallery-ml; do
    docker image inspect "ghcr.io/open-noodle/$image:$VERSION" >/dev/null 2>&1 \
      || docker pull -q "ghcr.io/open-noodle/$image:$VERSION" >/dev/null \
      || echo "could not fetch $image:$VERSION now: a vault's next unlock fetches it"
  done
  echo "vault edition installed to $VAULT_DEST: vaults run Gallery server $VERSION from their next unlock"
}

install_libraries() {
  # The ordinary libraries' own copies of the full edition, with their contexts; Main is not touched here.
  [[ -f $LIBRARIES ]] || return 0
  python3 "$LIBRARIES" install-web "$WORK/out/web"
}

case ${1:-} in
  --no-install) exit 0 ;;
  --vault-only) install_vault; exit 0 ;;
  --libraries-only) install_libraries; exit 0 ;;
esac
# The container bind-mounts $DEST itself, so a rename would leave it serving the old inode: sync in place.
# Hashed _app/immutable files never collide; index/entry files are replaced last by rsync's ordering.
mkdir -p "$DEST"
# Old hashed chunks stay for a few days: a tab still running the previous build lazy-loads them (the photo viewer, a
# modal) and without them opens to a black screen until reloaded. Pruned by age instead.
rsync -a --delete-after --filter='protect _app/immutable/**' --filter='protect kioku-library.json' "$WORK/out/web/" "$DEST/"
# Main's kioku-library.json: Main, with every library for its switcher (none but Main: no switcher at all)
[[ -f $LIBRARIES ]] && python3 "$LIBRARIES" context main "$DEST"
mkdir -p "$PLAYER_DEST"
rsync -a --delete-after --filter='protect assets/**' "$WORK/out/memory-player/" "$PLAYER_DEST/"
find "$DEST/_app/immutable" -type f -mtime +3 -delete 2>/dev/null || true
# immich-server reads index.html once at boot (it injects metadata into it), so new entry
# hashes are only served after a restart.
docker restart immich_server >/dev/null && echo "installed to $DEST, immich_server restarted (reload the browser)"
# The server indexes its web folder as it starts: Main's kioku-library.json must be served whole once it is up again
# (without it Main is simply one library again, as before).
if [[ -f $DEST/kioku-library.json ]]; then
  for _ in $(seq 120); do
    curl -fsS -H 'Accept: application/json' http://127.0.0.1:2283/kioku-library.json 2>/dev/null \
      | cmp -s - "$DEST/kioku-library.json" && { served=1; break; }
    sleep 1
  done
  [[ ${served:-} ]] || echo "warning: Main does not serve its kioku-library.json yet: check http://127.0.0.1:2283/kioku-library.json"
fi
install_vault
install_libraries

#!/bin/bash
# Build only the Gallery web UI from this checkout and install it where
# ~/immich/docker-compose.yml mounts it over the container's /build/www.
#
# Mirrors CI: copy the tree, run branding/scripts/apply-branding.sh on the copy
# (it rewrites files in place, so never on the checkout), then build the
# Dockerfile's `web` stage and export just web/build.
#
#   ./local-build.sh            # build + install to ~/immich/web-custom (synced in place)
#   ./local-build.sh --no-install
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

# Append a scratch stage holding only the built site, so the export copies ~40 MB, not the stage's node_modules.
cat >>"$WORK/src/server/Dockerfile" <<'DOCKER'

FROM web AS memory-player
RUN cd /usr/src/app/web && pnpm exec vite build --config vite.memory.config.ts
FROM scratch AS web-export
COPY --from=web /usr/src/app/web/build /web/
COPY --from=memory-player /usr/src/app/web/build-memory-player /memory-player/
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
echo "built ($BRAND): $(du -sh "$WORK/out" | cut -f1)"

[[ ${1:-} == --no-install ]] && exit 0
# The container bind-mounts $DEST itself, so a rename would leave it serving the old inode: sync in place.
# Hashed _app/immutable files never collide; index/entry files are replaced last by rsync's ordering.
mkdir -p "$DEST"
# Old hashed chunks stay for a few days: a tab still running the previous build lazy-loads them (the photo viewer, a
# modal) and without them opens to a black screen until reloaded. Pruned by age instead.
rsync -a --delete-after --filter='protect _app/immutable/**' "$WORK/out/web/" "$DEST/"
mkdir -p "$PLAYER_DEST"
rsync -a --delete-after --filter='protect assets/**' "$WORK/out/memory-player/" "$PLAYER_DEST/"
find "$DEST/_app/immutable" -type f -mtime +3 -delete 2>/dev/null || true
# immich-server reads index.html once at boot (it injects metadata into it), so new entry
# hashes are only served after a restart.
docker restart immich_server >/dev/null && echo "installed to $DEST, immich_server restarted (reload the browser)"

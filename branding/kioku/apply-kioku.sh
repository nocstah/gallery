#!/usr/bin/env bash
# Local Omarchy layer: names the web build Kioku (記憶, "memory"), the family's name for this archive, over Noodle's
# branding. local-build.sh runs it on its copy of the checkout right after branding/scripts/apply-branding.sh, unless
# GALLERY_BRAND=noodle; never on a checkout, since it rewrites files in place. brand.json beside it holds the words and
# the i18n classification; README.md says what changes, what cannot (the server image, the phone app, the emails) and
# how to classify a new string.
#
#   branding/kioku/apply-kioku.sh <copy root>
#
# Text is rewritten in the copy before the Docker build, never in the build's output: SvelteKit precompresses the
# output (.br, .gz) and the server sends those first. Every rewrite checks that it found the text it was written
# against, as often as it was, and stops the build otherwise, naming the file and the text, so an upstream change can
# never turn one into a silent no-op. Running it twice changes nothing the second time. An asset not drawn yet is only a
# warning: Noodle's stays until branding/kioku/assets/ has it.
set -euo pipefail

KIOKU_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAND="$KIOKU_DIR/brand.json"
ENGINE="$KIOKU_DIR/kioku.mjs"

die() {
  echo "apply-kioku: $*" >&2
  exit 1
}

[[ $# -eq 1 && -d $1 ]] || die "usage: apply-kioku.sh <copy root> (local-build.sh's \$WORK/src)"
ROOT="$(cd "$1" && pwd)"
command -v node >/dev/null || die "needs node (as apply-branding.sh does)"
command -v jq >/dev/null || die "needs jq"
if command -v magick >/dev/null; then
  MAGICK=(magick)
elif command -v convert >/dev/null; then
  MAGICK=(convert)
else
  die "needs ImageMagick (magick or convert) for the icons"
fi

NAME=$(jq -r '.name' "$BRAND")
SHORT_NAME=$(jq -r '.short_name' "$BRAND")
DESCRIPTION=$(jq -r '.description' "$BRAND")
BACKGROUND=$(jq -r '.manifest.background_color' "$BRAND")
NOODLE=$(jq -r '.name' "$ROOT/branding/config.json")

# The copy apply-branding.sh left: the i18n overlay folded into i18n/*.json and the manifest named by Noodle (or already
# by Kioku, on a second run). A checkout has neither.
[[ -f $ROOT/i18n/en.json && -d $ROOT/web/src ]] || die "$ROOT is not a copy of the checkout (no i18n/en.json, web/src)"
[[ ! -f $ROOT/i18n/gallery/en.json ]] \
  || die "$ROOT still has the i18n overlay (i18n/gallery/en.json): this is a checkout, not local-build.sh's copy"
manifest="$ROOT/web/static/manifest.json"
named=$(jq -r '.name' "$manifest")
[[ $named == "$NOODLE" || $named == "$NAME" ]] \
  || die "web/static/manifest.json is named '$named', not $NOODLE: apply-branding.sh has not run on this copy"

# rule <file> <count>: rewrites <count> occurrences of a literal text in <file>, the rule on stdin: the old text, a line
# "=>", the new text. @NAME@, @NOODLE@, @UPSTREAM@, @INSPECTOR_TITLE@, @LOGO_ALT@, @MEMORY_PAGE_TITLE@, @CREDIT_KEY@,
# @PHONE_APP_ICON@ and @MEMORY_TITLE[expression]@ come from brand.json and branding/config.json (kioku.mjs).
rule() {
  node "$ENGINE" rewrite "$ROOT" "$1" "$2"
}

# place <source> <target> <px>: a square PNG at that size, copied byte for byte when it is drawn at that size already,
# otherwise resized and written without timestamps (a second run makes the same bytes); says which in $placed
size_of() {
  "${MAGICK[@]}" identify -format '%wx%h' "$1[0]"
}
placed=""
place() {
  local size
  size=$(size_of "$1")
  [[ ${size%x*} == "${size#*x}" ]] || die "${1#"$KIOKU_DIR"/} is $size: it must be square"
  if [[ $size == "$3x$3" ]]; then
    cp "$1" "$2"
    placed="as drawn"
    return
  fi
  ((${size%x*} >= $3)) || echo "  warning: ${1#"$KIOKU_DIR"/} is $size, smaller than the $3px it makes"
  "${MAGICK[@]}" "$1" -resize "$3x$3" -strip -define png:exclude-chunks=date,time "$2"
  [[ $(size_of "$2") == "$3x$3" ]] || die "${2#"$ROOT"/} did not come out $3x$3"
  placed="resized from $size"
}

echo "=== $NAME over $NOODLE: $ROOT ==="

echo "--- i18n: the folded bundle, by brand.json's classification ---"
node "$ENGINE" i18n "$ROOT/i18n"

echo "--- Titles ---"
# Every tab reads "<page> - Kioku"; a page without a title of its own (the root layout's default, which /maintenance
# and a few admin pages show) reads "Kioku", once.
rule web/src/routes/+layout.svelte 1 <<'RULE'
<title>{page.data.meta?.title || 'Web'} - @NOODLE@</title>
=>
<title>{page.data.meta?.title === '@NAME@' ? '@NAME@' : `${page.data.meta?.title || 'Web'} - @NAME@`}</title>
RULE
rule web/src/routes/+layout.ts 1 <<'RULE'
title: '@UPSTREAM@',
=>
title: '@NAME@',
RULE
# The pages that set their own title: the error pages, a shared link's page and its ended page
rule web/src/routes/ErrorLayout.svelte 1 <<'RULE'
} - @NOODLE@</title>
=>
} - @NAME@</title>
RULE
rule web/src/lib/components/pages/SharedLinkErrorPage.svelte 1 <<'RULE'
{words.title} - @NOODLE@</title>
=>
{words.title} - @NAME@</title>
RULE
rule web/src/lib/components/pages/SharedLinkPage.svelte 1 <<'RULE'
+ ' - @NOODLE@';
=>
+ ' - @NAME@';
RULE
# The inspector's window, which the owner's Hyprland rule finds by the start of its title (README.md, On the desktop)
rule web/src/lib/managers/inspector-link.svelte.ts 1 <<'RULE'
INSPECTOR_TITLE = 'Gallery inspector';
=>
INSPECTOR_TITLE = '@INSPECTOR_TITLE@';
RULE

echo "--- Words on the pages ---"
rule web/src/app.html 1 <<'RULE'
To use @NOODLE@,
=>
To use @NAME@,
RULE
# The logo's alt text: the bar's mark and the login card's, and the login page's backdrop
rule web/src/lib/components/shared-components/Logo.svelte 1 <<'RULE'
alt="Gallery logo"
=>
alt="@LOGO_ALT@"
RULE
rule web/src/lib/components/layouts/AuthPageLayout.svelte 1 <<'RULE'
alt="Gallery logo"
=>
alt="@LOGO_ALT@"
RULE
# Importing a file that is not a theme (the file format keeps its id, gallery-theme)
rule web/src/lib/theme/derive.ts 1 <<'RULE'
'not a Gallery theme (format
=>
'not a @NAME@ theme (format
RULE
# Help › About, the owner's section beside the projects' links: the credit (about_credit in brand.json)
rule web/src/lib/modals/HelpAndFeedbackModal.svelte 1 <<'RULE'
<div class="ws-sheet-head"><h3 class="ws-sheet-title">{$t('about')}</h3></div>
=>
<div class="ws-sheet-head"><h3 class="ws-sheet-title">{$t('about')}</h3></div>
          <p class="ws-sheet-note" data-testid="help-credit">{$t('@CREDIT_KEY@')}</p>
RULE

echo "--- The loader and the login card ---"
# Kioku's loader writes itself (the mark drawn stroke by stroke, then let go), so it no longer also spins: not in
# LoadingSpinner, not on the boot screen. Noodle's spinning mark keeps its spin in a GALLERY_BRAND=noodle build, and
# the source keeps it for its specs.
rule web/src/lib/components/shared-components/LoadingSpinner.svelte 1 <<'RULE'
class={['animate-spin', sizeClasses[size], className]
=>
class={[sizeClasses[size], className]
RULE
rule web/src/app.html 1 <<'RULE'
@keyframes loadspin {
        100% {
          transform: rotate(360deg);
        }
      }

      #stencil {
=>
#stencil {
RULE
rule web/src/app.html 1 <<'RULE'
animation:
          0s linear 0.3s forwards delayedVisibility,
          loadspin 8s linear infinite;
=>
animation: 0s linear 0.3s forwards delayedVisibility;
RULE
# The login card shows the still mark rather than the loader, which would write itself every few seconds there
rule web/src/lib/components/layouts/AuthPageLayout.svelte 1 <<'RULE'
<Logo variant="icon" size="giant" transparent />
=>
<Logo variant="icon" size="giant" />
RULE

echo "--- The phone app's banner ---"
# The open-in-app banner offers the phone app, which stays Noodle Gallery's, so it keeps that app's icon (from Noodle's
# iOS launcher icon) while apple-icon-180.png becomes the Kioku web app's own (Assets below).
phone_source=$(jq -r '.phone_app_icon.source' "$BRAND")
phone_target=$(jq -r '.phone_app_icon.target' "$BRAND")
[[ -f $ROOT/$phone_source ]] || die "$phone_source is not in the copy (Noodle moved it): update brand.json"
place "$ROOT/$phone_source" "$ROOT/$phone_target" "$(jq -r '.phone_app_icon.size' "$BRAND")"
echo "  $phone_source -> $phone_target ($placed)"
rule web/src/lib/components/shared-components/open-in-app-banner.svelte 1 <<'RULE'
src="/apple-icon-180.png"
=>
src="@PHONE_APP_ICON@"
RULE

echo "--- The memory player ---"
rule web/memory-player/index.html 1 <<'RULE'
<title>Gallery · Memory</title>
=>
<title>@MEMORY_PAGE_TITLE@</title>
RULE
rule web/memory-player/src/SharedMemoryPlayer.svelte 1 <<'RULE'
document.title = `${memory!.title} · Gallery`;
=>
document.title = `@MEMORY_TITLE[${memory!.title}]@`;
RULE

echo "--- manifest.json ---"
tmp=$(mktemp "$manifest.XXXXXX")
jq --arg name "$NAME" --arg short "$SHORT_NAME" --arg desc "$DESCRIPTION" --arg background "$BACKGROUND" \
  '.name = $name | .short_name = $short | .description = $desc | .background_color = $background' \
  "$manifest" >"$tmp"
chmod 644 "$tmp"
mv "$tmp" "$manifest"
[[ $(jq -r '[.name, .short_name, .description, .background_color] | join("|")' "$manifest") \
  == "$NAME|$SHORT_NAME|$DESCRIPTION|$BACKGROUND" ]] || die "web/static/manifest.json did not take the new name"
echo "  web/static/manifest.json: $NAME, $SHORT_NAME, «$DESCRIPTION», $BACKGROUND"

echo "--- Assets ---"
# Each file brand.json lists under assets replaces its counterparts in the copy: byte for byte, or resized where it is
# drawn at another size than a target's (the sizes apply-branding.sh makes, but each at its real size), without
# timestamps, so a second run makes the same bytes. A target marked new is one the copy does not have yet.
assets="$KIOKU_DIR/$(jq -r '.assets.dir' "$BRAND")"
missing=()
optional=()
made=0
favicon_drawn=""
while IFS=$'\t' read -r source why instead; do
  if [[ ! -f $assets/$source ]]; then
    if [[ -n $instead ]]; then
      optional+=("$source ($instead)")
    else
      missing+=("$source: $why")
    fi
    continue
  fi
  if [[ $source == favicon*.png ]]; then
    favicon_drawn=yes
  fi
  while IFS=$'\t' read -r target size new; do
    [[ $new == new || -f $ROOT/$target ]] || die "$target is not in the copy (upstream moved it): update brand.json"
    if [[ $size == 0 ]]; then
      cp "$assets/$source" "$ROOT/$target"
      placed="as drawn"
    else
      place "$assets/$source" "$ROOT/$target" "$size"
      placed="${size}px, $placed"
    fi
    if [[ $new == new ]]; then
      placed+=", new"
    fi
    echo "  assets/$source -> $target ($placed)"
    made=$((made + 1))
  done < <(jq -r --arg source "$source" '.assets.files[] | select(.source == $source) | .make[]
    | [.target, (.size // 0 | tostring), (if .new then "new" else "-" end)] | @tsv' "$BRAND")
done < <(jq -r '.assets.files[] | [.source, .why, (.optional // "")] | @tsv' "$BRAND")
# favicon.ico, unless drawn: assembled from the sizes brand.json lists for it, once a favicon is drawn (Noodle's stays
# until then)
if [[ ! -f $assets/favicon.ico && -n $favicon_drawn ]]; then
  ico="$ROOT/$(jq -r '.assets.ico.target' "$BRAND")"
  frames=()
  while read -r frame; do
    if [[ -f $ROOT/$frame ]]; then
      frames+=("$ROOT/$frame")
    fi
  done < <(jq -r '.assets.ico.from[]' "$BRAND")
  "${MAGICK[@]}" "${frames[@]}" "$ico"
  sizes=$("${MAGICK[@]}" identify -format '%w ' "$ico")
  [[ $(wc -w <<<"$sizes") -eq ${#frames[@]} ]] || die "favicon.ico did not take its ${#frames[@]} sizes"
  echo "  favicon.ico <- the ${sizes% } px PNGs"
fi
# A 24 px favicon is new with Kioku: app.html lists it beside the other sizes, once there is one
if [[ -f $ROOT/web/static/favicon-24.png ]]; then
  rule web/src/app.html 1 <<'RULE'
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
=>
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
    <link rel="icon" type="image/png" sizes="24x24" href="/favicon-24.png" />
RULE
else
  echo "  no 24 px favicon drawn: app.html keeps its sizes"
fi
required=$(jq '[.assets.files[] | select(.optional | not)] | length' "$BRAND")
if ((${#missing[@]} > 0)); then
  echo "  warning: ${#missing[@]} of $required assets not drawn yet; Noodle's stay in their place:"
  printf '    %s\n' "${missing[@]}"
fi
if ((${#optional[@]} > 0)); then
  echo "  optional, not drawn:"
  printf '    %s\n' "${optional[@]}"
fi
echo "assets: $made files made, ${#missing[@]} of $required not drawn yet (branding/kioku/assets/)"

echo "=== $NAME applied ==="

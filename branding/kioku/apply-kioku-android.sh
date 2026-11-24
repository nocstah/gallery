#!/usr/bin/env bash
# Local Omarchy layer: extends Kioku branding to the Android app on a scratch copy of the checkout, right after
# branding/scripts/apply-branding.sh and branding/kioku/apply-kioku.sh. Never runs on the checkout itself.
#
#   branding/kioku/apply-kioku-android.sh <copy root>
#
# Rewrites Android app identity (applicationId, label, deep link & OAuth schemes, download folder, splash color),
# rewrites the phone_app i18n keys to Kioku for the mobile bundle (leaving the web build's verify-kioku rules untouched),
# and renders Kioku's pinwheel and wordmark assets into mobile/ from branding/kioku/assets/.
set -euo pipefail

KIOKU_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAND="$KIOKU_DIR/brand.json"
ENGINE="$KIOKU_DIR/kioku.mjs"

die() {
  echo "apply-kioku-android: $*" >&2
  exit 1
}

[[ $# -eq 1 && -d $1 ]] || die "usage: apply-kioku-android.sh <copy root>"
ROOT="$(cd "$1" && pwd)"
command -v node >/dev/null || die "needs node"
command -v jq >/dev/null || die "needs jq"
command -v rsvg-convert >/dev/null || die "needs rsvg-convert (librsvg)"
if command -v magick >/dev/null; then
  MAGICK=(magick)
elif command -v convert >/dev/null; then
  MAGICK=(convert)
else
  die "needs ImageMagick (magick or convert)"
fi

[[ -f $ROOT/mobile/android/app/build.gradle ]] || die "$ROOT does not contain mobile/android/app/build.gradle"
[[ ! -f $ROOT/i18n/gallery/en.json ]] \
  || die "$ROOT still has i18n/gallery/en.json: run apply-branding.sh and apply-kioku.sh on a build copy first"

NAME=$(jq -r '.name' "$BRAND")
APP_ID=$(jq -r '.android.application_id' "$BRAND")
SCHEME=$(jq -r '.android.deep_link_scheme' "$BRAND")
DOWNLOAD_DIR=$(jq -r '.android.download_dir' "$BRAND")
ASSETS="$KIOKU_DIR/$(jq -r '.assets.dir' "$BRAND")"

rule() {
  node "$ENGINE" rewrite "$ROOT" "$1" "$2"
}

echo "=== $NAME Android branding: $ROOT ($APP_ID, $SCHEME://) ==="

echo "--- i18n: phone_app strings -> $NAME ---"
node "$ENGINE" i18n-mobile "$ROOT/i18n"

echo "--- Android Gradle & Manifest ---"
rule mobile/android/app/build.gradle 1 <<'RULE'
    applicationId "@NOODLE_BUNDLE_ID@"
=>
    applicationId "@ANDROID_APP_ID@"
RULE

rule mobile/android/app/build.gradle 1 <<'RULE'
    resValue "string", "app_name", "@NOODLE@"
=>
    resValue "string", "app_name", "@NAME@"
RULE

rule mobile/android/app/build.gradle 1 <<'RULE'
        resValue "string", "app_name", "@NOODLE@ PR ${prNumber}"
=>
        resValue "string", "app_name", "@NAME@ PR ${prNumber}"
RULE

rule mobile/android/app/src/main/AndroidManifest.xml 1 <<'RULE'
  <application android:label="@NOODLE@"
=>
  <application android:label="@NAME@"
RULE

rule mobile/android/app/src/main/AndroidManifest.xml 4 <<'RULE'
android:label="Upload to @NOODLE@"
=>
android:label="Upload to @NAME@"
RULE

rule mobile/android/app/src/main/AndroidManifest.xml 2 <<'RULE'
android:label="View in @NOODLE@"
=>
android:label="View in @NAME@"
RULE

rule mobile/android/app/src/main/AndroidManifest.xml 1 <<'RULE'
        <data android:scheme="@NOODLE_DEEP_LINK_SCHEME@" />
=>
        <data android:scheme="@NOODLE_DEEP_LINK_SCHEME@" />
        <data android:scheme="@ANDROID_DEEP_LINK_SCHEME@" />
RULE

rule mobile/android/app/src/main/AndroidManifest.xml 1 <<'RULE'
        <data android:scheme="@NOODLE_BUNDLE_ID@" android:pathPrefix="/oauth-callback" />
=>
        <data android:scheme="@NOODLE_BUNDLE_ID@" android:pathPrefix="/oauth-callback" />
        <data android:scheme="@ANDROID_APP_ID@" android:pathPrefix="/oauth-callback" />
RULE

rule mobile/android/app/src/debug/AndroidManifest.xml 1 <<'RULE'
android:label="@NOODLE@-Debug"
=>
android:label="@NAME@-Debug"
RULE

rule mobile/android/app/src/main/res/values/strings.xml 1 <<'RULE'
  <string name="memory_widget_description">See memories from @UPSTREAM@.</string>
=>
  <string name="memory_widget_description">See memories from @NAME@.</string>
RULE

rule mobile/android/app/src/main/res/values-v31/styles.xml 1 <<'RULE'
        <item name="android:windowSplashScreenBackground">#f6f8fe</item>
=>
        <item name="android:windowSplashScreenBackground">@ANDROID_SPLASH_LIGHT@</item>
RULE

echo "--- Mobile Dart brand text & schemes ---"
rule mobile/lib/constants/constants.dart 1 <<'RULE'
const String kAppTitle = '@NOODLE@';
=>
const String kAppTitle = '@NAME@';
RULE

rule mobile/lib/widgets/common/immich_title_text.dart 1 <<'RULE'
      '@NOODLE@',
=>
      '@NAME@',
RULE

rule mobile/lib/main.dart 1 <<'RULE'
    if (deepLink.uri.scheme == "immich" || deepLink.uri.scheme == "@NOODLE_DEEP_LINK_SCHEME@") {
=>
    if (deepLink.uri.scheme == "immich" || deepLink.uri.scheme == "@NOODLE_DEEP_LINK_SCHEME@" || deepLink.uri.scheme == "@ANDROID_DEEP_LINK_SCHEME@") {
RULE

rule mobile/lib/services/download.service.dart 2 <<'RULE'
Platform.isAndroid ? 'DCIM/@UPSTREAM@' : null;
=>
Platform.isAndroid ? '@ANDROID_DOWNLOAD_DIR@' : null;
RULE

echo "--- Mobile visual assets (from branding/kioku/assets) ---"
LOGO_MARK_SVG="$ASSETS/logo-mark.svg"
APP_ICON_PNG="$ASSETS/app-icon.png"
INLINE_LIGHT_SVG="$ASSETS/logo-inline-light.svg"
INLINE_DARK_SVG="$ASSETS/logo-inline-dark.svg"

for req in "$LOGO_MARK_SVG" "$APP_ICON_PNG" "$INLINE_LIGHT_SVG" "$INLINE_DARK_SVG"; do
  [[ -f $req ]] || die "missing Kioku asset: $req"
done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. Transparent in-app pinwheel (1024x1024)
rsvg-convert -w 1024 -h 1024 "$LOGO_MARK_SVG" -o "$ROOT/mobile/assets/immich-logo.png"
echo "  rendered mobile/assets/immich-logo.png (1024x1024)"

# 2. Opaque launcher icon sources + legacy mipmap ic_launcher.png
cp "$APP_ICON_PNG" "$ROOT/mobile/assets/immich-logo-w-bg.png"
cp "$APP_ICON_PNG" "$ROOT/mobile/assets/immich-logo-w-bg-android.png"
for spec in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  density="${spec%%:*}"
  px="${spec##*:}"
  "${MAGICK[@]}" "$APP_ICON_PNG" -resize "${px}x${px}" -strip -define png:exclude-chunks=date,time \
    "$ROOT/mobile/android/app/src/main/res/mipmap-${density}/ic_launcher.png"
done
echo "  generated Android mipmap ic_launcher.png (mdpi..xxxhdpi)"

# 3. Adaptive icon foreground (432x432 canvas, 256x256 trimmed & centered pinwheel inside 66% safe zone) + monochrome (Android 13+)
rsvg-convert -w 512 -h 512 "$LOGO_MARK_SVG" -o "$TMP/mark-raw.png"
"${MAGICK[@]}" "$TMP/mark-raw.png" -trim +repage -resize 256x256 "$TMP/fg-mark.png"
"${MAGICK[@]}" -size 432x432 xc:none "$TMP/fg-mark.png" -gravity center -composite \
  -strip -define png:exclude-chunks=date,time \
  "$ROOT/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.png"
cp "$ROOT/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.png" \
  "$ROOT/mobile/assets/immich-logo-android-adaptive-icon.png"

"${MAGICK[@]}" "$ROOT/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.png" \
  -alpha extract -background white -alpha shape \
  -strip -define png:exclude-chunks=date,time \
  "$ROOT/mobile/android/app/src/main/res/drawable/ic_launcher_monochrome.png"
echo "  generated Android adaptive foreground & monochrome icons (432x432)"

# 4. Inline SVG & PNG wordmarks (used in app bar & account dialog)
cp "$INLINE_LIGHT_SVG" "$ROOT/mobile/assets/immich-logo-inline-light.svg"
cp "$INLINE_DARK_SVG" "$ROOT/mobile/assets/immich-logo-inline-dark.svg"
rsvg-convert -h 282 "$INLINE_LIGHT_SVG" -o "$ROOT/mobile/assets/immich-text-light.png"
rsvg-convert -h 282 "$INLINE_DARK_SVG" -o "$ROOT/mobile/assets/immich-text-dark.png"
echo "  rendered mobile/assets/immich-text-{light,dark}.png and copied inline SVGs"

# 5. Splash screens: legacy + Android 12+ (1152x1152 with 480x480 trimmed & centered mark, within 4/9 = 512px safe circle)
"${MAGICK[@]}" "$TMP/mark-raw.png" -trim +repage -resize 480x480 "$TMP/splash-mark.png"
"${MAGICK[@]}" -size 1152x1152 xc:none "$TMP/splash-mark.png" -gravity center -composite \
  -strip -define png:exclude-chunks=date,time \
  "$ROOT/mobile/assets/immich-splash-android12.png"
rsvg-convert -w 512 -h 512 "$LOGO_MARK_SVG" -o "$ROOT/mobile/assets/immich-splash.png"

# Notification icon base (solid white silhouette of pinwheel)
rsvg-convert -w 96 -h 96 "$LOGO_MARK_SVG" -o "$TMP/notif-base.png"
"${MAGICK[@]}" "$TMP/notif-base.png" -alpha extract -background white -alpha shape \
  -strip -define png:exclude-chunks=date,time "$TMP/notif-white.png"

for spec in mdpi:288:192:24 hdpi:432:288:36 xhdpi:576:384:48 xxhdpi:864:576:72 xxxhdpi:1152:768:96; do
  IFS=: read -r density a12_px legacy_px notif_px <<<"$spec"
  res_dir="$ROOT/mobile/android/app/src/main/res/drawable-${density}"
  night_dir="$ROOT/mobile/android/app/src/main/res/drawable-night-${density}"

  "${MAGICK[@]}" "$ROOT/mobile/assets/immich-splash-android12.png" -resize "${a12_px}x${a12_px}" \
    -strip -define png:exclude-chunks=date,time "$res_dir/android12splash.png"
  "${MAGICK[@]}" "$ROOT/mobile/assets/immich-splash.png" -resize "${legacy_px}x${legacy_px}" \
    -strip -define png:exclude-chunks=date,time "$res_dir/splash.png"
  "${MAGICK[@]}" "$TMP/notif-white.png" -resize "${notif_px}x${notif_px}" \
    -strip -define png:exclude-chunks=date,time "$res_dir/notification_icon.png"

  if [[ -d "$night_dir" ]]; then
    cp "$res_dir/android12splash.png" "$night_dir/android12splash.png"
    cp "$res_dir/splash.png" "$night_dir/splash.png"
  fi
done
echo "  generated Android splash, Android 12 splash, and notification icons (mdpi..xxxhdpi)"

echo "=== $NAME Android branding applied ==="

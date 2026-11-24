#!/usr/bin/env bash
# Local Omarchy layer: build a branded, signed Kioku Android APK from this checkout on a scratch copy,
# mirroring local-build.sh (web) and .github/workflows/gallery-build-mobile.yml.
#
# Never modifies the git checkout. Reuses incremental Gradle/Dart/Rust caches under $WORK unless --clean is passed.
#
#   ./local-build-android.sh                   # build release APK (arm64 + armv7 + x64) into ~/.cache/gallery-android-build/out/
#   ./local-build-android.sh --abi arm64       # fast arm64-v8a-only build for a modern Android phone
#   ./local-build-android.sh --abi x64         # fast x86_64-only build for the local Android emulator
#   ./local-build-android.sh --install         # build and install via adb (auto-selects phone, or kioku-pixel emulator)
#   ./local-build-android.sh --install SERIAL  # build and install onto a specific adb device serial
#   ./local-build-android.sh --brand noodle    # build Noodle Gallery branding without the Kioku layer
#   ./local-build-android.sh --clean           # wipe scratch build caches before building
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
WORK="${GALLERY_ANDROID_BUILD_DIR:-$HOME/.cache/gallery-android-build}"
OUT_DIR="$WORK/out"
SIGNING_ENV="${KIOKU_ANDROID_SIGNING_ENV:-$HOME/.config/kioku-android/signing.env}"
VERSION="${GALLERY_FORK_VERSION:-$(git -C "$SRC" describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || echo v5.11.1)}"
BRAND="${GALLERY_BRAND:-kioku}"
ABI_MODE="all"
DO_INSTALL=0
INSTALL_SERIAL=""
DO_CLEAN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --abi)
      [[ $# -ge 2 ]] || { echo "missing value for --abi (all|arm64|x64|split)" >&2; exit 2; }
      ABI_MODE="$2"
      shift 2
      ;;
    --install)
      DO_INSTALL=1
      if [[ $# -ge 2 && "$2" != --* ]]; then
        INSTALL_SERIAL="$2"
        shift 2
      else
        shift
      fi
      ;;
    --brand)
      [[ $# -ge 2 ]] || { echo "missing value for --brand (kioku|noodle)" >&2; exit 2; }
      BRAND="$2"
      shift 2
      ;;
    --clean)
      DO_CLEAN=1
      shift
      ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      exit 2
      ;;
  esac
done

case "$BRAND" in
  kioku) [[ -f "$SRC/branding/kioku/brand.json" ]] || BRAND=noodle ;;
  noodle) ;;
  *) echo "BRAND must be kioku or noodle, not '$BRAND'" >&2; exit 1 ;;
esac

# Resolve pinned toolchains deterministically (avoiding mise symlink drift noted in AGENTS.md).
FLUTTER_VER="$(awk '/^[[:space:]]*flutter:[[:space:]]*/ { print $2; exit }' "$SRC/mobile/pubspec.yaml")"
FLUTTER_BIN_DIR="$HOME/.local/share/mise/installs/aqua-flutter-flutter/$FLUTTER_VER/flutter/bin"
JAVA_HOME_PIN="$HOME/.local/share/mise/installs/java/21.0.2"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
[[ -x "$FLUTTER_BIN_DIR/flutter" ]] || { echo "Flutter $FLUTTER_VER not found at $FLUTTER_BIN_DIR (run mise install in mobile/)" >&2; exit 1; }
[[ -d "$JAVA_HOME_PIN" ]] && export JAVA_HOME="$JAVA_HOME_PIN"
[[ -d "$ANDROID_HOME" ]] || { echo "Android SDK not found at $ANDROID_HOME" >&2; exit 1; }
export PATH="$FLUTTER_BIN_DIR:${JAVA_HOME:+$JAVA_HOME/bin:}$HOME/.local/share/mise/shims:$HOME/.cargo/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# Load persistent local release keystore (never committed to git).
if [[ -f "$SIGNING_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$SIGNING_ENV"
fi
if [[ -z "${KEYSTORE_PATH:-}" || ! -f "$KEYSTORE_PATH" ]]; then
  echo "Signing keystore not found ($SIGNING_ENV). Release APK would fall back to debug key." >&2
  exit 1
fi

if [[ $DO_CLEAN -eq 1 ]]; then
  echo "Cleaning scratch build directory $WORK/src ..."
  rm -rf "$WORK/src"
fi

mkdir -p "$WORK/src" "$OUT_DIR"

echo "=== Syncing checkout -> $WORK/src ==="
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'web/build' \
  --exclude 'web/.svelte-kit' \
  --exclude 'server/dist' \
  --exclude 'mobile/build' \
  --exclude 'mobile/.dart_tool' \
  --exclude 'mobile/android/.gradle' \
  --exclude 'mobile/android/local.properties' \
  --exclude 'mobile/android/key.jks' \
  --exclude 'mobile/generated' \
  --exclude 'native/target' \
  "$SRC/" "$WORK/src/"

# Reuse generated Dart OpenAPI client from the checkout if already built so we skip Java openapi-generator unless needed.
if [[ -d "$SRC/mobile/generated/openapi" && ! -d "$WORK/src/mobile/generated/openapi" ]]; then
  mkdir -p "$WORK/src/mobile/generated"
  cp -a "$SRC/mobile/generated/openapi" "$WORK/src/mobile/generated/openapi"
fi

# Copy signing keystore into scratch copy only for the build, always removed on exit.
cp "$KEYSTORE_PATH" "$WORK/src/mobile/android/key.jks"
chmod 600 "$WORK/src/mobile/android/key.jks"
cleanup() {
  rm -f "$WORK/src/mobile/android/key.jks"
}
trap cleanup EXIT

echo "=== Trusting mise configs in scratch copy ==="
export MISE_TRUSTED_CONFIG_PATHS="$WORK/src:$SRC"
for cfg in "$WORK/src/mise.toml" "$WORK/src/mobile/mise.toml" "$WORK/src/native/mise.toml"; do
  [[ -f "$cfg" ]] && mise trust "$cfg" >/dev/null
done

echo "=== Applying Noodle branding ($VERSION) ==="
(cd "$WORK/src" && FORK_VERSION="$VERSION" ./branding/scripts/apply-branding.sh >"$WORK/branding.log" 2>&1) \
  || { echo "apply-branding failed, see $WORK/branding.log" >&2; tail -25 "$WORK/branding.log" >&2; exit 1; }

if [[ "$BRAND" == "kioku" ]]; then
  echo "=== Applying Kioku web + Android branding ==="
  {
    "$WORK/src/branding/kioku/apply-kioku.sh" "$WORK/src"
    "$WORK/src/branding/kioku/verify-kioku.sh" "$WORK/src"
    "$WORK/src/branding/kioku/apply-kioku-android.sh" "$WORK/src"
  } >"$WORK/kioku-android.log" 2>&1 \
    || { echo "Kioku branding failed, see $WORK/kioku-android.log" >&2; tail -30 "$WORK/kioku-android.log" >&2; exit 1; }
fi

echo "=== Verifying Android 12 splash bounds ==="
python3 - "$WORK/src" <<'PY'
import re, subprocess, sys
from pathlib import Path
root = Path(sys.argv[1])
files = [
    root / "mobile/assets/immich-splash-android12.png",
    *(root / f"mobile/android/app/src/main/res/drawable-{d}/android12splash.png"
      for d in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")),
]
for f in files:
    out = subprocess.check_output(["identify", "-format", "%w %h %@", str(f)], text=True).strip()
    w, h, bbox = out.split()
    w, h = int(w), int(h)
    m = re.match(r"^(\d+)x(\d+)\+(\d+)\+(\d+)$", bbox)
    assert m, f"bad bbox for {f}: {bbox}"
    bw, bh, ox, oy = map(int, m.groups())
    max_box = w * 4 // 9 + 2
    assert bw <= max_box and bh <= max_box, f"{f}: content {bw}x{bh} > max {max_box}"
    assert abs(ox - (w - ox - bw)) <= 2 and abs(oy - (h - oy - bh)) <= 2, f"{f}: not centered"
print(f"OK: {len(files)} Android 12 splash assets within safe bounds")
PY

echo "=== Preparing mobile dependencies & branded i18n/codegen ==="
(
  cd "$WORK/src"
  if [[ ! -d mobile/generated/openapi/lib ]]; then
    (cd open-api && bash ./bin/generate-dart-sdk.sh)
  fi
  cd mobile
  flutter pub get --enforce-lockfile
  node ./scripts/build_runner_patch.mjs
  rm -rf ../i18n/gallery/merged
  node ../i18n/gallery/merge.mjs
  dart run easy_localization:generate -S ../i18n/gallery/merged
  dart format lib/generated/codegen_loader.g.dart >/dev/null
  dart run bin/generate_keys.dart
  dart format lib/generated/translations.g.dart >/dev/null
  # Generate remaining codegen if not already present from the checkout
  if [[ ! -f lib/routing/router.gr.dart ]]; then
    dart run drift_dev make-migrations
    dart run build_runner build --delete-conflicting-outputs
    dart format lib/routing/router.gr.dart >/dev/null
    ls pigeon/*.dart | xargs -n1 -P4 -I{} dart run pigeon --input {}
    dart format lib/platform/ >/dev/null
  fi
)

VERSION_NAME="${VERSION#v}"
VERSION_CODE=$(( $(date +%s) / 60 ))

BUILD_ARGS=(apk --release --build-name="$VERSION_NAME" --build-number="$VERSION_CODE")
CHECK_ABIS=()
OUT_SUFFIX=""
case "$ABI_MODE" in
  all)
    CHECK_ABIS=(arm64-v8a armeabi-v7a)
    ;;
  arm64)
    BUILD_ARGS+=(--target-platform android-arm64)
    CHECK_ABIS=(arm64-v8a)
    OUT_SUFFIX="-arm64"
    ;;
  x64)
    BUILD_ARGS+=(--target-platform android-x64)
    CHECK_ABIS=(x86_64)
    OUT_SUFFIX="-x64"
    ;;
  split)
    BUILD_ARGS+=(--split-per-abi)
    CHECK_ABIS=(arm64-v8a)
    ;;
  *)
    echo "invalid --abi '$ABI_MODE' (expected all|arm64|x64|split)" >&2
    exit 2
    ;;
esac

echo "=== Building signed $BRAND APK ($VERSION_NAME, code $VERSION_CODE, abi=$ABI_MODE) ==="
(
  cd "$WORK/src/mobile"
  export ALIAS ANDROID_KEY_PASSWORD ANDROID_STORE_PASSWORD
  flutter build "${BUILD_ARGS[@]}"
)

APK_DIR="$WORK/src/mobile/build/app/outputs/flutter-apk"
if [[ "$ABI_MODE" == "split" ]]; then
  BUILT_APK="$APK_DIR/app-arm64-v8a-release.apk"
  cp "$APK_DIR"/app-*-release.apk "$OUT_DIR/"
else
  BUILT_APK="$APK_DIR/app-release.apk"
fi
[[ -f "$BUILT_APK" ]] || { echo "Expected APK not found at $BUILT_APK" >&2; exit 1; }

echo "=== Verifying libsqlite3.so and 16 KB ELF page alignment ==="
python3 - "$BUILT_APK" "${CHECK_ABIS[@]}" <<'PY'
import struct, sys, zipfile
apk = sys.argv[1]
required_abis = sys.argv[2:]
with zipfile.ZipFile(apk) as z:
    names = set(z.namelist())
    for abi in required_abis:
        target = f"lib/{abi}/libsqlite3.so"
        if target not in names:
            print(f"ERROR: missing {target} in {apk}", file=sys.stderr)
            sys.exit(1)
        print(f"OK: {target} present")
    bad = []
    for name in sorted(names):
        if not name.endswith(".so") or not any(f"/lib/{a}/" in f"/{name}" for a in ("arm64-v8a", "x86_64")):
            continue
        b = z.read(name)
        phoff = struct.unpack_from("<Q", b, 0x20)[0]
        phentsize, phnum = struct.unpack_from("<HH", b, 0x36)
        aligns = [
            struct.unpack_from("<Q", b, phoff + i * phentsize + 48)[0]
            for i in range(phnum)
            if struct.unpack_from("<I", b, phoff + i * phentsize)[0] == 1
        ]
        align = min(aligns)
        if align < 16384:
            print(f"BAD {align:>6} {name}", file=sys.stderr)
            bad.append(name)
    if bad:
        print(f"ERROR: {len(bad)} 64-bit native libs not 16 KB aligned", file=sys.stderr)
        sys.exit(1)
    print("OK: all 64-bit native libraries are 16 KB page-aligned")
PY

FINAL_APK="$OUT_DIR/${BRAND}-${VERSION}${OUT_SUFFIX}.apk"
cp "$BUILT_APK" "$FINAL_APK"
ln -sfn "$(basename "$FINAL_APK")" "$OUT_DIR/${BRAND}-latest.apk"
echo "Built signed APK: $FINAL_APK ($(du -h "$FINAL_APK" | cut -f1))"

if [[ $DO_INSTALL -eq 1 ]]; then
  if [[ -z "$INSTALL_SERIAL" ]]; then
    # Prefer a physical device; fall back to kioku-pixel emulator (5554), never blindly pick unrelated emulators.
    PHYS=$(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ { print $1; exit }')
    if [[ -n "$PHYS" ]]; then
      INSTALL_SERIAL="$PHYS"
    elif adb devices | awk 'NR>1 && $2=="device" && $1=="emulator-5554" { found=1 } END { exit !found }'; then
      INSTALL_SERIAL="emulator-5554"
    else
      echo "No physical phone or kioku-pixel (emulator-5554) found. Pass --install <serial> explicitly." >&2
      adb devices -l >&2
      exit 1
    fi
  fi
  echo "=== Installing onto $INSTALL_SERIAL ==="
  adb -s "$INSTALL_SERIAL" install -r "$FINAL_APK"
  if [[ "$BRAND" == "kioku" ]]; then
    APP_ID="$(jq -r '.android.application_id' "$SRC/branding/kioku/brand.json")"
    echo "Installed $APP_ID on $INSTALL_SERIAL"
  fi
fi

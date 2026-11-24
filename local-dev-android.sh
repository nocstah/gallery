#!/usr/bin/env bash
# Local Omarchy layer: Android emulator, hot-reload dev runner, screenshots, and unit test helper for mobile/.
# Mirrors local-dev.sh (web). Always uses a dedicated port (5554) for the kioku-pixel AVD so it never collides with
# other emulators running on this host.
#
#   ./local-dev-android.sh emulator start [--headless]  # boot kioku-pixel on emulator-5554 + adb reverse :2283 & :2290
#   ./local-dev-android.sh emulator stop                # shut down emulator-5554 cleanly
#   ./local-dev-android.sh emulator status              # check if emulator-5554 is up
#   ./local-dev-android.sh reverse [serial]             # forward localhost:2283 (Gallery) and :2290 (Curator) to device
#   ./local-dev-android.sh run [device-id] [args...]    # run `flutter run` with hot reload against phone or emulator
#   ./local-dev-android.sh shot [name] [serial]         # capture a PNG screenshot into ~/.cache/gallery-android-shots/
#   ./local-dev-android.sh devices                      # list adb and flutter devices
#   ./local-dev-android.sh test [path...]               # run `flutter test` with pinned Flutter from mobile/pubspec.yaml
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
AVD_NAME="${KIOKU_ANDROID_AVD:-kioku-pixel}"
EMU_PORT="${KIOKU_ANDROID_EMU_PORT:-5554}"
EMU_SERIAL="emulator-$EMU_PORT"
SHOTS_DIR="${GALLERY_ANDROID_SHOTS_DIR:-$HOME/.cache/gallery-android-shots}"

FLUTTER_VER="$(awk '/^[[:space:]]*flutter:[[:space:]]*/ { print $2; exit }' "$SRC/mobile/pubspec.yaml")"
FLUTTER_BIN_DIR="$HOME/.local/share/mise/installs/aqua-flutter-flutter/$FLUTTER_VER/flutter/bin"
JAVA_HOME_PIN="$HOME/.local/share/mise/installs/java/21.0.2"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.config/.android/avd}"
[[ -d "$JAVA_HOME_PIN" ]] && export JAVA_HOME="$JAVA_HOME_PIN"
export PATH="$FLUTTER_BIN_DIR:${JAVA_HOME:+$JAVA_HOME/bin:}$HOME/.local/share/mise/shims:$HOME/.cargo/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

emu_running() {
  adb devices | awk -v s="$EMU_SERIAL" 'NR>1 && $1==s && $2=="device" { found=1 } END { exit !found }'
}

pick_device() {
  local requested="${1:-}"
  if [[ -n "$requested" ]]; then
    echo "$requested"
    return
  fi
  local phys
  phys="$(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ { print $1; exit }')"
  if [[ -n "$phys" ]]; then
    echo "$phys"
  elif emu_running; then
    echo "$EMU_SERIAL"
  else
    echo "No physical phone or $AVD_NAME ($EMU_SERIAL) connected. Start emulator with: ./local-dev-android.sh emulator start" >&2
    exit 1
  fi
}

setup_reverse() {
  local serial="$1"
  adb -s "$serial" reverse tcp:2283 tcp:2283 >/dev/null
  adb -s "$serial" reverse tcp:2290 tcp:2290 >/dev/null
  echo "Forwarded http://127.0.0.1:2283 (Gallery) and http://127.0.0.1:2290 (Curator) on $serial"
}

emu_start() {
  local headless=0
  [[ "${1:-}" == "--headless" ]] && headless=1
  if emu_running; then
    echo "$AVD_NAME already running on $EMU_SERIAL"
    setup_reverse "$EMU_SERIAL"
    return
  fi
  mkdir -p "$HOME/.cache/gallery-android-build"
  local args=(-avd "$AVD_NAME" -port "$EMU_PORT" -no-audio -no-boot-anim)
  if [[ $headless -eq 1 ]]; then
    args+=(-no-window -no-snapshot-save -gpu host)
  else
    args+=(-gpu host)
  fi
  setsid "$ANDROID_HOME/emulator/emulator" "${args[@]}" \
    >"$HOME/.cache/gallery-android-build/emulator.log" 2>&1 </dev/null &
  echo "Starting $AVD_NAME on $EMU_SERIAL (log: ~/.cache/gallery-android-build/emulator.log)..."
  adb -s "$EMU_SERIAL" wait-for-device
  for _ in $(seq 120); do
    if [[ "$(adb -s "$EMU_SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; then
      setup_reverse "$EMU_SERIAL"
      echo "Ready: $AVD_NAME ($EMU_SERIAL)"
      return
    fi
    sleep 1
  done
  echo "Timed out waiting for $EMU_SERIAL to boot; check ~/.cache/gallery-android-build/emulator.log" >&2
  exit 1
}

emu_stop() {
  if emu_running; then
    adb -s "$EMU_SERIAL" emu kill >/dev/null 2>&1 || true
    echo "Stopped $EMU_SERIAL"
  else
    echo "$EMU_SERIAL is not running"
  fi
}

case "${1:-help}" in
  emulator)
    case "${2:-status}" in
      start) emu_start "${3:-}" ;;
      stop) emu_stop ;;
      status) emu_running && echo "running: $AVD_NAME ($EMU_SERIAL)" || echo "not running ($EMU_SERIAL)" ;;
      *) echo "usage: $0 emulator start [--headless] | stop | status" >&2; exit 2 ;;
    esac
    ;;
  reverse)
    serial="$(pick_device "${2:-}")"
    setup_reverse "$serial"
    ;;
  run)
    shift
    dev=""
    if [[ $# -ge 1 && "$1" != -* ]]; then
      dev="$1"
      shift
    fi
    serial="$(pick_device "$dev")"
    setup_reverse "$serial"
    cd "$SRC/mobile"
    exec flutter run -d "$serial" "$@"
    ;;
  shot)
    name="${2:-screen}"
    serial="$(pick_device "${3:-}")"
    mkdir -p "$SHOTS_DIR"
    out="$SHOTS_DIR/$(date +%Y%m%d-%H%M%S)-${name}.png"
    adb -s "$serial" exec-out screencap -p >"$out"
    echo "$out"
    ;;
  devices)
    echo "--- adb devices ---"
    adb devices -l
    echo "--- flutter devices ---"
    (cd "$SRC/mobile" && flutter devices)
    ;;
  test)
    shift
    cd "$SRC/mobile"
    exec flutter test "$@"
    ;;
  *)
    sed -n '2,14p' "$0"
    ;;
esac

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build-android.sh — Build a standalone Android APK for diag_tool
#
# No Google account or Play Store required.
# The resulting APK can be installed on any Android device directly.
#
# Usage:
#   ./scripts/build-android.sh              # debug APK  (fast, for testing)
#   ./scripts/build-android.sh --release    # release APK (optimised, for daily use)
#   ./scripts/build-android.sh --install    # debug APK + install on USB device
#
# Prerequisites:
#   - Node.js 18+
#   - JDK 17:  https://adoptium.net  (or: brew install openjdk@17)
#   - Android SDK command-line tools OR Android Studio
#     Set ANDROID_HOME, e.g.:  export ANDROID_HOME=$HOME/Library/Android/sdk
#     Or install Android Studio and let it manage the SDK.
#
# On Android device:
#   Settings → Apps → Special app access → Install unknown apps
#   → Allow for your file manager / browser
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
BUILD_VARIANT="debug"
AUTO_INSTALL=false

# ── Parse args ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --release) BUILD_VARIANT="release" ;;
    --install) AUTO_INSTALL=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
ANDROID_DIR="$ROOT/android"
# Keystore lives in mobile-app/ root — outside android/ so expo prebuild --clean never wipes it
KEYSTORE_FILE="$ROOT/vehiclediag-release.keystore"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▶ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
err()     { echo -e "${RED}✘ $*${NC}"; exit 1; }

# ── Prerequisite checks ───────────────────────────────────────────────────────
info "Checking prerequisites…"

command -v node >/dev/null 2>&1 || err "Node.js not found. Install from https://nodejs.org"
command -v npx  >/dev/null 2>&1 || err "npx not found. Update Node.js."

if ! command -v java >/dev/null 2>&1; then
  err "JDK not found. Install JDK 17 from https://adoptium.net\n  macOS: brew install openjdk@17"
fi
JAVA_VER=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d. -f1)
[[ "$JAVA_VER" -lt 17 ]] && err "JDK 17+ required (found $JAVA_VER). Install from https://adoptium.net"
success "Java $JAVA_VER OK."

if [[ -z "${ANDROID_HOME:-}" ]]; then
  for candidate in \
    "$HOME/Library/Android/sdk" \
    "$HOME/Android/Sdk" \
    "/usr/local/lib/android/sdk"
  do
    if [[ -d "$candidate" ]]; then
      export ANDROID_HOME="$candidate"
      break
    fi
  done
fi
[[ -z "${ANDROID_HOME:-}" ]] && err "ANDROID_HOME not set and SDK not found in default locations.\n  Install Android Studio or set: export ANDROID_HOME=/path/to/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
success "Android SDK: $ANDROID_HOME"
success "Prerequisites OK."

# ── Step 1: JS dependencies ───────────────────────────────────────────────────
info "Installing JS dependencies…"
cd "$ROOT"
npm install --silent
success "npm install done."

# ── Step 2: Expo prebuild ─────────────────────────────────────────────────────
info "Running expo prebuild (generates android/ native project)…"
npx expo prebuild --platform android --clean
success "Prebuild complete."

# ── Step 3 (release only): Set up signing keystore ───────────────────────────
if [[ "$BUILD_VARIANT" == "release" ]]; then
  if [[ ! -f "$KEYSTORE_FILE" ]]; then
    info "Generating release keystore (one-time)…"
    keytool -genkeypair -v \
      -keystore "$KEYSTORE_FILE" \
      -alias vehiclediag \
      -keyalg RSA \
      -keysize 2048 \
      -validity 10000 \
      -dname "CN=diag_tool, OU=Dev, O=Dev, L=Unknown, ST=Unknown, C=ES" \
      -storepass vehiclediag_keystore \
      -keypass vehiclediag_keystore \
      -noprompt
    success "Keystore created: $KEYSTORE_FILE"
    warn "Keep vehiclediag-release.keystore safe — you need it to update the app later."
  else
    success "Keystore already exists: $KEYSTORE_FILE"
  fi

  # Write signing.gradle into android/ (recreated each build after prebuild --clean — that's fine).
  # rootProject.projectDir = android/  →  parentFile = mobile-app/  →  keystore next to package.json
  SIGNING_GRADLE="$ANDROID_DIR/signing.gradle"
  cat > "$SIGNING_GRADLE" << 'EOF'
def ksFile = new File(rootProject.projectDir.parentFile, "vehiclediag-release.keystore")
android {
    signingConfigs {
        vehiclediag {
            storeFile     ksFile
            storePassword "vehiclediag_keystore"
            keyAlias      "vehiclediag"
            keyPassword   "vehiclediag_keystore"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.vehiclediag
        }
    }
}
EOF

  # Append apply line to app/build.gradle (only once — prebuild regenerates it each time)
  BUILD_GRADLE="$ANDROID_DIR/app/build.gradle"
  if ! grep -q "signing\.gradle" "$BUILD_GRADLE"; then
    info "Applying signing.gradle…"
    echo "" >> "$BUILD_GRADLE"
    echo "apply from: '../signing.gradle'" >> "$BUILD_GRADLE"
    success "Signing config applied."
  fi
fi

# ── Step 4: Build ─────────────────────────────────────────────────────────────
cd "$ANDROID_DIR"

if [[ "$BUILD_VARIANT" == "release" ]]; then
  info "Building release APK…"
  ./gradlew assembleRelease --no-daemon -q
  APK_PATH=$(find "$ANDROID_DIR/app/build/outputs/apk/release" -name "*.apk" | head -1)
else
  info "Building debug APK…"
  ./gradlew assembleDebug --no-daemon -q
  APK_PATH=$(find "$ANDROID_DIR/app/build/outputs/apk/debug" -name "*.apk" | head -1)
fi

cd "$ROOT"
[[ -z "$APK_PATH" ]] && err "APK not found — build may have failed. Run without -q to see full output."

APK_SIZE=$(du -sh "$APK_PATH" | cut -f1)

# ── Step 5 (optional): Install on device ──────────────────────────────────────
if [[ "$AUTO_INSTALL" == true ]]; then
  if ! command -v adb >/dev/null 2>&1; then
    warn "adb not found in PATH, trying $ANDROID_HOME/platform-tools/adb"
    ADB="$ANDROID_HOME/platform-tools/adb"
  else
    ADB="adb"
  fi

  DEVICE_COUNT=$("$ADB" devices | grep -c "device$" || true)
  if [[ "$DEVICE_COUNT" -eq 0 ]]; then
    warn "No Android device connected via USB. APK saved at:"
    warn "  $APK_PATH"
  else
    info "Installing on device…"
    "$ADB" install -r "$APK_PATH"
    success "Installed on device!"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "══════════════════════════════════════════════════"
success " APK ready ($BUILD_VARIANT, $APK_SIZE)"
success " $APK_PATH"
success "══════════════════════════════════════════════════"
echo ""
echo -e "${CYAN}How to install on Android (no computer needed after this):${NC}"
echo ""
echo "  Option A — USB (fastest):"
echo "    adb install -r \"$APK_PATH\""
echo "    (or run this script with --install)"
echo ""
echo "  Option B — Transfer the file:"
echo "    • USB cable: copy APK to phone storage, open with file manager"
echo "    • WhatsApp / Telegram: send the file to yourself"
echo "    • Google Drive / iCloud: upload and open from mobile"
echo "    • Local WiFi: python3 -m http.server 8080  (in the APK folder)"
echo "      then open http://<your-mac-ip>:8080 on the phone browser"
echo ""
echo "  Before installing: enable 'Install unknown apps' on the device:"
echo "    Settings → Apps → Special app access → Install unknown apps"
echo "    → Allow for your file manager or browser"
echo ""
if [[ "$BUILD_VARIANT" == "debug" ]]; then
  echo -e "${YELLOW}  Tip: use --release for a faster, optimised build for daily use.${NC}"
  echo ""
fi

# =============================================================================
# build-android.ps1 - Build a standalone Android APK for vehicle-diag
#
# No Google account or Play Store required.
# The resulting APK can be installed on any Android device directly.
#
# Usage:
#   .\scripts\build-android.ps1              # debug APK  (fast, for testing)
#   .\scripts\build-android.ps1 -Release     # release APK (optimised, for daily use)
#   .\scripts\build-android.ps1 -Install     # debug APK + install on USB device
#
# Prerequisites:
#   - Node.js 18+          https://nodejs.org
#   - JDK 17+              https://adoptium.net
#   - Android Studio       https://developer.android.com/studio
#     (sets ANDROID_HOME automatically; or set it manually)
#
# On Android device before installing the APK:
#   Settings > Apps > Special app access > Install unknown apps
#   > Allow for your file manager or browser
# =============================================================================
param(
    [switch]$Release,
    [switch]$Install,
    [switch]$Mock        # keep USE_MOCK = true (simulated data, no BLE hardware needed)
)

$ErrorActionPreference = 'Stop'

# -- Helpers ------------------------------------------------------------------
function Info($msg)    { Write-Host "  $msg" -ForegroundColor Cyan }
function Success($msg) { Write-Host "  $msg" -ForegroundColor Green }
function Warn($msg)    { Write-Host "  $msg" -ForegroundColor Yellow }
function Err($msg)     { Write-Host "  $msg" -ForegroundColor Red; exit 1 }

# -- Paths --------------------------------------------------------------------
$ScriptDir      = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root           = Split-Path -Parent $ScriptDir
$AndroidDir     = Join-Path $Root 'android'
$AdapterFactory = Join-Path $Root 'src\infrastructure\adapterFactory.ts'
# Keystore lives in mobile-app/ root — outside android/ so expo prebuild --clean never wipes it
$KeystoreFile   = Join-Path $Root 'vehiclediag-release.keystore'
$BuildVariant   = if ($Release) { 'release' } else { 'debug' }

# -- USE_MOCK restore on exit -------------------------------------------------
$MockWasTrue = $false

function Restore-Mock {
    if ($MockWasTrue) {
        (Get-Content $AdapterFactory -Raw) `
            -replace 'export const USE_MOCK = false', 'export const USE_MOCK = true' |
            Set-Content $AdapterFactory -Encoding utf8
        Warn "USE_MOCK restored to true (dev mode)."
    }
}

# -- Prerequisite checks ------------------------------------------------------
Info "Checking prerequisites..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Err "Node.js not found. Install from https://nodejs.org"
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Err "npx not found. Update Node.js."
}
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Err "JDK not found. Install JDK 17 from https://adoptium.net"
}

# java -version writes to stderr; capture it via a temp file to avoid NativeCommandError
$javaVerTmp = Join-Path $env:TEMP 'java_version.txt'
Start-Process java -ArgumentList '-version' -NoNewWindow `
    -RedirectStandardError $javaVerTmp -Wait
$javaVerLine = Get-Content $javaVerTmp -ErrorAction SilentlyContinue | Select-String 'version' | Select-Object -First 1
Remove-Item $javaVerTmp -ErrorAction SilentlyContinue

if ($javaVerLine -match '"(\d+)') {
    $javaVer = [int]$Matches[1]
} else {
    Err "No se pudo leer la version de Java. Asegurate de tener JDK 17+ instalado."
}
if ($javaVer -lt 17) {
    Err "Se requiere JDK 17+ (encontrado: $javaVer). Instala desde https://adoptium.net"
}
Success "Java $javaVer OK."

if (-not $env:ANDROID_HOME) {
    $candidates = @(
        "$env:LOCALAPPDATA\Android\Sdk",
        "$env:USERPROFILE\AppData\Local\Android\Sdk",
        'C:\Android\Sdk'
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $env:ANDROID_HOME = $c; break }
    }
}
if (-not $env:ANDROID_HOME) {
    Err "ANDROID_HOME not set and Android SDK not found.`n  Install Android Studio or set: `$env:ANDROID_HOME = 'C:\path\to\sdk'"
}
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:PATH"
Success "Android SDK: $env:ANDROID_HOME"
Success "Prerequisites OK."

# -- Step 1: USE_MOCK handling ------------------------------------------------
$factoryContent = Get-Content $AdapterFactory -Raw

if ($Mock) {
    Info "USE_MOCK = true  (-Mock flag set, simulated data)"
    if ($factoryContent -match 'export const USE_MOCK = false') {
        $MockWasTrue = $false   # was false → restore to false on exit
        $factoryContent -replace 'export const USE_MOCK = false', 'export const USE_MOCK = true' |
            Set-Content $AdapterFactory -Encoding utf8
        # Override $MockWasTrue so Restore-Mock puts it back to false
        $MockWasTrue = $true
    } else {
        Success "USE_MOCK already true."
    }
} else {
    Info "Setting USE_MOCK = false (real BLE build)..."
    if ($factoryContent -match 'export const USE_MOCK = true') {
        $MockWasTrue = $true
        $factoryContent -replace 'export const USE_MOCK = true', 'export const USE_MOCK = false' |
            Set-Content $AdapterFactory -Encoding utf8
        Success "USE_MOCK -> false"
    } else {
        Success "USE_MOCK already false."
    }
}

# -- Step 2: JS dependencies --------------------------------------------------
Info "Installing JS dependencies..."
Push-Location $Root
try {
    npm install --silent
    if ($LASTEXITCODE -ne 0) { Restore-Mock; Err "npm install failed." }
    Success "npm install done."

    # -- Step 3: Expo prebuild ------------------------------------------------
    # Kill lingering Gradle daemons that lock files in android/ from failed builds
    Get-Process -Name "java" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    # Delete android/ ourselves so we control the removal (avoids EBUSY on locked files)
    if (Test-Path $AndroidDir) {
        Info "Removing android/ directory..."
        Remove-Item $AndroidDir -Recurse -Force -ErrorAction Stop
    }

    Info "Running expo prebuild (generates android/ native project)..."
    npx expo prebuild --platform android
    if ($LASTEXITCODE -ne 0) { Restore-Mock; Err "expo prebuild failed." }
    Success "Prebuild complete."
} finally {
    Pop-Location
}

# -- Step 4 (release only): signing keystore ----------------------------------
if ($Release) {
    if (-not (Test-Path $KeystoreFile)) {
        Info "Generating release keystore (one-time)..."
        keytool -genkeypair -v `
            -keystore $KeystoreFile `
            -alias vehiclediag `
            -keyalg RSA `
            -keysize 2048 `
            -validity 10000 `
            -dname "CN=vehicle-diag, OU=Dev, O=Dev, L=Unknown, ST=Unknown, C=ES" `
            -storepass vehiclediag_keystore `
            -keypass vehiclediag_keystore `
            -noprompt
        if ($LASTEXITCODE -ne 0) { Restore-Mock; Err "keytool failed." }
        Success "Keystore created: $KeystoreFile"
        Warn "Guarda vehiclediag-release.keystore en un lugar seguro -- lo necesitas para actualizar la app."
    } else {
        Success "Keystore already exists: $KeystoreFile"
    }

    # Write signing.gradle into android/ (recreated each build after --clean — that's fine).
    # Uses apply from so it merges with the existing android{} block without duplicating signingConfigs.
    $utf8NoBom    = New-Object System.Text.UTF8Encoding $false
    $SigningGradle = Join-Path $AndroidDir 'signing.gradle'
    # rootProject.projectDir = android/  →  parentFile = mobile-app/  →  keystore next to package.json
    $signingContent = "def ksFile = new File(rootProject.projectDir.parentFile, `"vehiclediag-release.keystore`")`nandroid {`n    signingConfigs {`n        vehiclediag {`n            storeFile     ksFile`n            storePassword `"vehiclediag_keystore`"`n            keyAlias      `"vehiclediag`"`n            keyPassword   `"vehiclediag_keystore`"`n        }`n    }`n    buildTypes {`n        release {`n            signingConfig signingConfigs.vehiclediag`n        }`n    }`n}`n"
    [System.IO.File]::WriteAllText($SigningGradle, $signingContent, $utf8NoBom)

    # Append apply line to app/build.gradle (only once — prebuild --clean regenerates it each time)
    $BuildGradle   = Join-Path $AndroidDir 'app\build.gradle'
    $gradleContent = Get-Content $BuildGradle -Raw
    if ($gradleContent -notmatch 'signing\.gradle') {
        Info "Applying signing.gradle..."
        [System.IO.File]::AppendAllText($BuildGradle, "`napply from: '../signing.gradle'`n", $utf8NoBom)
        Success "Signing config applied."
    }
}

# -- Step 5: Build ------------------------------------------------------------
Push-Location $AndroidDir
try {
    if ($Release) {
        Info "Building release APK..."
        .\gradlew.bat assembleRelease --no-daemon -q
    } else {
        Info "Building debug APK..."
        .\gradlew.bat assembleDebug --no-daemon -q
    }
    if ($LASTEXITCODE -ne 0) { Restore-Mock; Err "Gradle build failed. Re-run without -q for full output." }
} finally {
    Pop-Location
}

$apkSearchDir = if ($Release) {
    Join-Path $AndroidDir 'app\build\outputs\apk\release'
} else {
    Join-Path $AndroidDir 'app\build\outputs\apk\debug'
}
$ApkPath = Get-ChildItem -Path $apkSearchDir -Filter '*.apk' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $ApkPath) {
    Restore-Mock
    Err "APK no encontrado -- el build puede haber fallado. Re-ejecuta sin -q para ver el log completo."
}

$ApkSize = [math]::Round((Get-Item $ApkPath).Length / 1MB, 1)

# -- Step 6 (optional): install on device -------------------------------------
if ($Install) {
    $adb = if (Get-Command adb -ErrorAction SilentlyContinue) { 'adb' } else {
        $p = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
        Warn "adb no encontrado en PATH, usando: $p"
        $p
    }
    $devices = & $adb devices 2>&1 | Select-String 'device$'
    if (-not $devices) {
        Warn "Ningun dispositivo Android conectado por USB. APK guardado en:"
        Warn "  $ApkPath"
    } else {
        Info "Instalando en el dispositivo..."
        & $adb install -r $ApkPath
        if ($LASTEXITCODE -eq 0) { Success "Instalado en el dispositivo!" }
        else { Warn "adb install devolvio un error -- revisa la pantalla del movil." }
    }
}

# -- Done ---------------------------------------------------------------------
Restore-Mock

Write-Host ""
Success "=================================================="
Success " APK listo ($BuildVariant, ${ApkSize} MB)"
Success " $ApkPath"
Success "=================================================="
Write-Host ""
Write-Host "  Como instalar en Android (sin necesitar el PC despues):" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Opcion A - USB (lo mas rapido):"
Write-Host "    adb install -r `"$ApkPath`""
Write-Host "    (o ejecuta el script con -Install)"
Write-Host ""
Write-Host "  Opcion B - Transferir el fichero:"
Write-Host "    * Cable USB:         copia el APK al movil, abrelo con el gestor de ficheros"
Write-Host "    * WhatsApp/Telegram: envialo a tu propio chat"
Write-Host "    * Google Drive:      subelo y abrelo desde el movil"
Write-Host "    * WiFi local:        python -m http.server 8080  (en la carpeta del APK)"
Write-Host "                         luego abre http://<ip-de-tu-pc>:8080 en el navegador del movil"
Write-Host ""
Write-Host "  Antes de instalar: activa 'Instalar apps desconocidas' en el movil:"
Write-Host "    Ajustes > Aplicaciones > Acceso especial > Instalar apps desconocidas"
Write-Host "    > Permitir para tu gestor de ficheros o navegador"
Write-Host ""
if (-not $Release) {
    Warn "  Tip: usa -Release para un APK optimizado listo para uso diario."
    Write-Host ""
}

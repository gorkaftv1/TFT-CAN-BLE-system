# diag — Mobile App

React Native + Expo app for the OBD-II/BLE vehicle diagnostic system. Connects to a Raspberry Pi running the `diag_tool` BLE server, displays live sensor data, reads/clears DTCs, and logs session history.

Compatible with **Android** and **iOS**.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Building](#building)
- [Key Concepts](#key-concepts)
- [How To: Add a New OBD-II PID](#how-to-add-a-new-obd-ii-pid)
- [How To: Add a New BLE Command](#how-to-add-a-new-ble-command)
- [Color Convention](#color-convention)
- [Mock Mode](#mock-mode)

---

## Architecture

The app follows a layered architecture where dependencies point inward — UI never imports from infrastructure directly.

```
┌─────────────────────────────────────────────────┐
│                   SCREENS                        │  React Native UI
│  Dashboard · DTCs · Sessions · Console · Settings│
├─────────────────────────────────────────────────┤
│                   STORES                         │  Zustand (global state)
│  connection · vehicle · dtc · uds · session …   │
├─────────────────────────────────────────────────┤
│               DOMAIN SERVICES                    │  Business logic
│  VehicleService · DtcLookupService · LogService  │
├─────────────────────────────────────────────────┤
│            IVehicleAdapter (interface)           │  Contract
├──────────────────┬──────────────────────────────┤
│   BleAdapter     │       MockAdapter             │  Implementations
│  (real hardware) │  (no hardware needed)         │
└──────────────────┴──────────────────────────────┘
```

`adapterFactory` provides the active adapter as a singleton. Switching between BLE and Mock at runtime destroys and recreates the instance.

---

## Tech Stack

| Package | Version | Purpose |
|---|---|---|
| `expo` | ~54.0 | Build toolchain, managed workflow |
| `react-native` | 0.81.5 | Cross-platform UI framework |
| `react-native-ble-plx` | ^3.5 | BLE scanning, connecting, GATT read/write/notify |
| `@react-navigation/native` + `bottom-tabs` | ^7 | Screen navigation |
| `zustand` | ^5.0 | Lightweight global state management |
| `@react-native-async-storage/async-storage` | 2.2.0 | Persistent settings (widgets, interval, deviceName) |
| `expo-file-system` + `expo-sharing` | ~19 / ~14 | CSV export of console logs |
| `typescript` | ~5.9 | Type safety throughout |

---

## Project Structure

```
mobile-app/src/
│
├── navigation/
│   └── AppNavigator.tsx          # Bottom tab navigator, global disconnect button
│
├── screens/                      # One folder per screen
│   ├── dashboard/DashboardScreen.tsx
│   ├── dtcs/DtcScreen.tsx
│   ├── sessions/
│   │   ├── SessionsScreen.tsx
│   │   └── SessionDetailView.tsx
│   ├── console/ConsoleScreen.tsx
│   └── settings/SettingsScreen.tsx
│
├── stores/                       # Zustand stores
│   ├── connectionStore.ts        # BLE connection state machine
│   ├── vehicleStore.ts           # Live PID samples + monitor on/off
│   ├── dashboardStore.ts         # Widget visibility & order (persisted)
│   ├── settingsStore.ts          # intervalMs, deviceName, useMock (persisted)
│   ├── dtcStore.ts               # Current session DTCs
│   ├── pidSupportStore.ts        # ECU-reported supported PIDs
│   ├── udsStore.ts               # UDS session type + DID values
│   ├── sessionStore.ts           # Session history list
│   └── logsStore.ts              # Console log entries (BLE/OBD/UDS/App)
│
├── domain/
│   ├── models/                   # Pure TypeScript types
│   │   ├── DtcCode.ts
│   │   ├── MonitorSample.ts
│   │   ├── Session.ts
│   │   └── LogEntry.ts
│   └── services/
│       ├── VehicleService.ts     # snapshot(), start(), stop() — wraps BleAdapter
│       ├── DtcLookupService.ts   # Local DTC code descriptions + severity
│       ├── LogService.ts         # Centralized logging → logsStore
│       └── LogExportService.ts   # Export log entries to CSV
│
├── infrastructure/
│   ├── IVehicleAdapter.ts        # Interface — all adapter methods
│   ├── BleAdapter.ts             # Real BLE implementation (NUS over GATT)
│   ├── MockAdapter.ts            # Simulated data — no hardware needed
│   └── adapterFactory.ts        # Singleton factory, configureAdapter(useMock)
│
├── config/
│   ├── obd_pids.ts               # 25 PIDs: hex, name, unit, optional thresholds
│   └── uds_dids.ts               # 11 DIDs: hex, name, unit, min session required
│
├── data/
│   └── dtcDatabase.json          # Local DTC descriptions (~13 000 codes)
│
├── components/
│   ├── ConnectionFlowModals.tsx  # Scan / connecting modals
│   └── DisconnectedState.tsx     # Placeholder when not connected
│
├── assets/icons/                 # SVG icons + index.tsx barrel
├── shared/theme.ts               # colors, fontSize, spacing constants
└── utils/blePermissions.ts       # Android BLE permission request
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- For Android: Android Studio + SDK (API 31+)
- For iOS: Xcode 15+ (macOS only)

### Install and run

```bash
cd mobile-app
npm install
npx expo start
```

Press `a` for Android emulator, `i` for iOS simulator, or scan the QR code with Expo Go.

> **Note:** BLE does not work in simulators. Use a physical device or enable Mock Mode in Settings.

---

## Building

### Android APK (Windows)

```powershell
# Debug APK (fast, for testing)
.\scripts\build-android.ps1

# Release APK (optimised, for daily use)
.\scripts\build-android.ps1 -Release

# Debug APK + install directly on USB-connected device
.\scripts\build-android.ps1 -Install
```

Prerequisites: Node 18+, JDK 17+, Android Studio (sets `ANDROID_HOME`).

The release keystore (`vehiclediag-release.keystore`) is generated once in `mobile-app/` and reused on subsequent builds. Keep it backed up — it is required to update the app.

### Android APK (macOS/Linux)

```bash
./scripts/build-android.sh           # debug
./scripts/build-android.sh --release # release
./scripts/build-android.sh --install # debug + adb install
```

### iOS (macOS only, free Apple ID)

```bash
./scripts/build-ios.sh        # build + install on USB device
./scripts/build-ios.sh --ipa  # build .ipa for AltStore / Sideloadly
```

Requires Xcode 15+, CocoaPods, and a free Apple ID added to Xcode. App is valid for 7 days without a paid developer account.

---

## Key Concepts

### IVehicleAdapter

All screens and services interact exclusively with `IVehicleAdapter`. This decouples UI from transport:

```typescript
// infrastructure/IVehicleAdapter.ts
export interface IVehicleAdapter {
  connect(deviceId?: string, deviceLabel?: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  startMonitor(pids: number[], intervalMs: number, onSample: (s: MonitorSample) => void): () => void;
  fetchDtcs(): Promise<DtcCode[]>;
  clearDtcs(): Promise<void>;
  getVin(): Promise<string>;
  getSnapshot(): Promise<Record<string, { value: number; unit: string }>>;
  probeAvailablePids(): Promise<number[]>;
  setUdsSession(sessionType: number): Promise<...>;
  readUdsDid(did: string): Promise<...>;
  getSessions(limit?: number): Promise<Session[]>;
  getSessionSamples(sessionId: number, pid?: number, limit?: number): Promise<...>;
  getSessionCommands(sessionId: number): Promise<...>;
  getSessionDtcs(sessionId: number): Promise<...>;
}
```

To add a new transport (e.g. WiFi), implement `IVehicleAdapter` and register it in `adapterFactory.ts`.

### BLE Protocol (NDJSON over NUS)

The Raspberry Pi server exposes a Nordic UART Service (NUS) GATT profile. All communication is newline-delimited JSON over the NUS RX/TX characteristics.

**Request format:**
```json
{"cmd": "snapshot"}\n
```

**Response format:**
```json
{"status": "ok", "data": {"0x0C": {"value": 2340, "unit": "rpm"}}}\n
```

**Push (server → client, no request):**
```json
{"type": "samples", "samples": [{"pid": 12, "name": "RPM motor", "value": 2340, "unit": "rpm", "ts": 1234.56}]}\n
```

`BleAdapter` buffers incoming bytes and splits on `\n`. Each complete JSON line is dispatched: command responses go to the pending request queue; push messages (`type` field present) are routed to registered listeners.

### Zustand Stores

Stores hold global state and expose actions. Screens subscribe to slices to avoid unnecessary re-renders:

```typescript
// Subscribe to a single field — component only re-renders when that field changes
const monitoring = useVehicleStore((s) => s.monitoring);

// Trigger an action from anywhere (outside React)
useVehicleStore.getState().start();
```

`dashboardStore` and `settingsStore` are persisted to `AsyncStorage` using Zustand's `persist` middleware.

---

## How To: Add a New OBD-II PID

**1. Register the PID in `config/obd_pids.ts`:**

```typescript
{ pid: 0x5A, name: 'Acelerador relativo', unit: '%', defaultVisible: false },
```

Optionally add color thresholds (range-based):

```typescript
{
  pid: 0x5A, name: 'Acelerador relativo', unit: '%', defaultVisible: false,
  colorThresholds: { goodMin: 0, goodMax: 100 },
},
```

**2. Done.** The dashboard, settings widget list, and monitor will pick it up automatically via `PID_MAP`.

The Raspberry Pi backend is the source of truth for decoding — the app only displays what the server sends. If the server does not implement the PID, the card shows `—`.

---

## How To: Add a New BLE Command

**1. Add the method to `IVehicleAdapter.ts`:**

```typescript
getOdometer(): Promise<number>;
```

**2. Implement in `BleAdapter.ts`:**

```typescript
async getOdometer(): Promise<number> {
  const res = await this._request({ cmd: 'odometer' });
  return res.data as number;
}
```

**3. Implement in `MockAdapter.ts`:**

```typescript
async getOdometer(): Promise<number> {
  return 123456;
}
```

**4. Use from a store or service:**

```typescript
const km = await getAdapter().getOdometer();
```

---

## Color Convention

OBD-II card values use a threshold-based color system. UDS DID values have no thresholds and always display white.

| Color | Meaning | When |
|---|---|---|
| Green | Within good range | Value between `goodMin` and `goodMax` |
| Yellow | Out of range / timeout | Value outside threshold, or read timed out |
| **White** | No threshold defined | PID has no `colorThresholds`, or any UDS DID |
| Gray | No data | No reading received yet (`—`) |
| Blue | Reading in progress | UDS DID fetch in progress |

PIDs with defined thresholds:

| PID | Good range |
|---|---|
| 0x05 Temp. refrigerante | 85 – 105 °C |
| 0x0B MAP admisión | 90 – 105 kPa |
| 0x42 Tensión batería | 13.0 – 14.8 V |

---

## Mock Mode

Enable in **Settings → Modo simulación**. Replaces `BleAdapter` with `MockAdapter`, which returns realistic simulated data without any hardware.

Useful for UI development, demos, and testing without a Raspberry Pi or vehicle.

To add simulated data for a new feature, edit `infrastructure/MockAdapter.ts`.

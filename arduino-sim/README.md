# ECU Simulator — Arduino MKR + CAN Shield

Generic automotive ECU simulator implementing OBD-II (SAE J1979 / ISO 15031) and UDS (ISO 14229-1) over CAN bus with ISO-TP transport (ISO 15765-2). Designed to be queried by a Raspberry Pi or any CAN-connected scanner without needing a real vehicle.

---

## Hardware

| Component | Detail |
|-----------|--------|
| MCU | Arduino MKR family (MKR WiFi 1010, MKR Zero, etc.) |
| CAN shield | MKR CAN Shield (based on MCP2515 / TJA1050) |
| Ignition button | Momentary push-button, pin D7 → GND |
| DTC fault button | Momentary push-button, pin D6 → GND |

Both buttons use the MCU's internal pull-up (`INPUT_PULLUP`). No external resistors needed.

### Wiring

```
Arduino MKR
  D7 ──┤ Button ├── GND    (ignition toggle)
  D6 ──┤ Button ├── GND    (DTC fault inject)
  CAN Shield mounted on MKR header
    CANH ── CAN bus H
    CANL ── CAN bus L
```

---

## Files

```
arduino-sim/
  ecu_sim/
    ecu_sim.ino        — main sketch (simulation loop, OBD-II/UDS handlers, ISO-TP TX)
    ecu_protocol.h     — all constants, structs, encoding utilities, config flags
```

---

## Configuration

All tuneable parameters live in `ecu_protocol.h`. No changes to the sketch are needed for normal configuration.

### Simulation mode

```c
#define SIM_MODE  SIM_MODE_FULL   // all 24 PIDs active
// or
#define SIM_MODE  SIM_MODE_BASIC  // only 6 core PIDs (RPM, Speed, Coolant, Load, Throttle, Battery)
```

`SIM_MODE_BASIC` is useful for fast bring-up or when the scanner expects a minimal ECU.

### Noise & broadcast

```c
#define BROADCAST_ENABLE  0   // 1 = emit unsolicited frames (0x280/0x320/0x3D0) every 100 ms
#define ADD_NOISE         0   // 1 = add random jitter to sensor values each cycle
```

Set both to `0` for a silent, deterministic bus (only responds to explicit requests).

| Flag | Effect when 1 |
|------|--------------|
| `BROADCAST_ENABLE` | Sends RPM/load on 0x280, speed on 0x320, coolant/throttle/voltage on 0x3D0 at 10 Hz |
| `ADD_NOISE` | Adds ±N counts of random jitter to RPM, temps, MAF, voltage, fuel trim each 200 ms tick |

Noise amplitudes are configurable per sensor (`NOISE_RPM_MAX`, `NOISE_COOLANT_MAX`, etc.).

### Logging

```c
#define LOG_LEVEL 0   // 0 = quiet, 1 = all RX/TX frames, 2 = + broadcast frames
```

Output goes to Serial at 115200 baud.

---

## CAN / ISO-TP Layer

| Parameter | Value |
|-----------|-------|
| Bitrate | 500 kbps |
| Scanner → ECU (TX) | 0x7E0 |
| ECU → Scanner (RX) | 0x7E8 |
| Transport protocol | ISO-TP (ISO 15765-2) |
| Padding byte | 0xAA |
| CF separation time | 25 ms |
| Flow Control timeout | 1000 ms |

The firmware handles:
- **Single Frame (SF)** for all requests and short responses (≤7 payload bytes)
- **First Frame + Consecutive Frame (FF/CF)** for multi-frame responses (VIN, long UDS payloads)
- **Flow Control (FC)** wait — polls for FC from scanner before sending CFs

---

## OBD-II (ISO 15031 / SAE J1979)

### Supported modes

| Mode | Service | Notes |
|------|---------|-------|
| 01 | Current live data | 24 PIDs in FULL mode, 6 in BASIC |
| 03 | Read DTCs | Up to 2 DTCs per SF response |
| 04 | Clear DTCs | Clears all active faults + resets checkEngine |
| 09 | Vehicle info | PID 0x02 — VIN (multi-frame) |

### Mode 01 PIDs

| PID | Request | Description | Unit | Encoding |
|-----|---------|-------------|------|----------|
| 0x00 | `01 00` | PID support 0x01–0x20 | bitmask | 4 bytes |
| 0x04 | `01 04` | Engine load | % | `A×100/255` |
| 0x05 | `01 05` | Coolant temp | °C | `A−40` |
| 0x06 | `01 06` | Short fuel trim B1 | % | `(A−128)×100/128` |
| 0x07 | `01 07` | Long fuel trim B1 | % | `(A−128)×100/128` |
| 0x0A | `01 0A` | Fuel pressure | kPa | `A×3` |
| 0x0B | `01 0B` | Intake MAP | kPa | `A` |
| 0x0C | `01 0C` | Engine RPM | rpm | `(A×256+B)/4` |
| 0x0D | `01 0D` | Vehicle speed | km/h | `A` |
| 0x0E | `01 0E` | Timing advance | ° | `A/2−64` |
| 0x0F | `01 0F` | Intake air temp | °C | `A−40` |
| 0x10 | `01 10` | MAF flow | g/s | `(A×256+B)/100` |
| 0x11 | `01 11` | Throttle position | % | `A×100/255` |
| 0x1F | `01 1F` | Runtime since start | s | `A×256+B` |
| 0x20 | `01 20` | PID support 0x21–0x40 | bitmask | 4 bytes |
| 0x23 | `01 23` | Fuel rail pressure | kPa | `(A×256+B)×10` |
| 0x2F | `01 2F` | Fuel level | % | `A×100/255` |
| 0x31 | `01 31` | Distance since DTC clear | km | `A×256+B` |
| 0x33 | `01 33` | Barometric pressure | kPa | `A` |
| 0x40 | `01 40` | PID support 0x41–0x60 | bitmask | 4 bytes |
| 0x42 | `01 42` | Battery voltage | V | `(A×256+B)/1000` (mV) |
| 0x46 | `01 46` | Ambient air temp | °C | `A−40` |
| 0x47 | `01 47` | Throttle position B | % | `A×100/255` |
| 0x49 | `01 49` | Accel pedal D | % | `A×100/255` |
| 0x4A | `01 4A` | Accel pedal E | % | `A×100/255` |
| 0x5C | `01 5C` | Engine oil temp | °C | `A−40` |
| 0x5E | `01 5E` | Fuel consumption rate | L/h | `(A×256+B)/20` |

### Mode 03 — DTC format

Response: `43 <count> [B1_hi B1_lo] [B2_hi B2_lo] ...`

Up to 2 DTCs fit in a Single Frame. Each DTC is 2 bytes (standard OBD-II encoding: high byte encodes system prefix P/C/B/U + high digit, low byte encodes remaining 2 digits).

### Mode 09 PID 0x02 — VIN

Response is a 20-byte ISO-TP multi-frame:

```
FF: 10 14 49 02 01 <first 6 VIN bytes>
CF1: 21 <next 7 VIN bytes>
CF2: 22 <last 4 VIN bytes> AA AA AA
```

Default VIN: `ARDUINO00000000000` (changeable in `initVehicleData()`).

---

## UDS (ISO 14229-1)

### Service 0x10 — DiagnosticSessionControl

| Subfunction | Request | Response |
|-------------|---------|----------|
| Default (0x01) | `10 01` | `50 01 00 19 01 F4` |
| Extended (0x03) | `10 03` | `50 03 00 19 01 F4` |

P2 = 25 ms, P2ext = 500 ms. Unsupported subfunctions (0x02 programming) return NRC 0x12.

### Service 0x22 — ReadDataByIdentifier

#### Standard DIDs (Default + Extended session)

| DID | Request | Description | Format |
|-----|---------|-------------|--------|
| 0xF190 | `22 F1 90` | VIN | 17 bytes ASCII, multi-frame |
| 0xF18C | `22 F1 8C` | ECU serial number | 8 bytes ASCII |
| 0xF189 | `22 F1 89` | Software version | 6 bytes ASCII |

#### Proprietary live-data DIDs (Extended session only — requires `10 03` first)

| DID | Request | Description | Format |
|-----|---------|-------------|--------|
| 0x2001 | `22 20 01` | Engine load | uint8, `×100/255` % |
| 0x2002 | `22 20 02` | Coolant temp | int16 BE, °C |
| 0x2003 | `22 20 03` | Engine RPM | uint16 BE, rpm |
| 0x2004 | `22 20 04` | Vehicle speed | uint8, km/h |
| 0x2005 | `22 20 05` | Throttle position | uint8, `×100/255` % |
| 0x2006 | `22 20 06` | Fuel level | uint8, `×100/255` % |
| 0x2007 | `22 20 07` | Engine oil temp | int16 BE, °C |
| 0x2008 | `22 20 08` | Battery voltage | uint16 BE, mV |

Requesting a proprietary DID in Default session returns NRC 0x22 (conditions not correct).

### NRC codes

| Code | Meaning |
|------|---------|
| 0x11 | Service not supported |
| 0x12 | Subfunction not supported |
| 0x22 | Conditions not correct (wrong session) |
| 0x31 | Request out of range (unknown DID/PID) |
| 0x33 | Security access denied |

---

## Physical Buttons

### D7 — Ignition (engine start/stop)

Each press toggles engine state:
- **ON**: RPM set to 850 (idle). Simulation begins (temps rise, MAF active, runtime counter starts).
- **OFF**: RPM → 0. Temps decay toward ambient. Battery drops to 12.2–12.6 V range.

Debounce: 500 ms.

### D6 — DTC fault inject/clear

Cycles through fault injection:

| Press | Effect |
|-------|--------|
| 1st | Inject P0300 (random misfire) |
| 2nd | Inject P0171 (system lean B1) |
| 3rd | Inject P0420 (catalyst efficiency B1) |
| 4th | Clear all DTCs, MIL off |

Debounce: 500 ms. `checkEngine` flag is set/cleared automatically. Cleared DTCs also reset `distanceSinceClear`.

---

## Vehicle Simulation Model

Updated every 200 ms (`SIM_UPDATE_INTERVAL_DEFAULT`).

**Engine running:**
- RPM follows throttle position with first-order lag (α = 0.3, time constant ~200 ms)
- Speed model: `Δspeed = 0.00002 × RPM × load − 0.003 × speed²` (capped 0–180 km/h)
- Engine load = `map(throttle, 0→100, 15→85)` %
- MAF = `(RPM × load) / 500`
- Timing advance = `map(RPM, 800→6000, 8→32)` °
- Intake MAP = `map(load, 0→100, 30→100)` kPa
- Fuel pressure = `map(load, 0→100, 30→60)` kPa
- Fuel consumption = `(RPM × load) / 800` (L/h × 20)
- Coolant/oil temps rise until 90/95 °C respectively
- Battery charges to 13.8–14.4 V while running

**Engine off:**
- Temps decay toward ambient
- Speed decelerates at −2 km/h per tick
- Battery drains to 12.2–12.6 V range

---

## Quick Test (Raspberry Pi / SocketCAN)

```bash
# Bring up CAN interface
sudo ip link set can0 type can bitrate 500000
sudo ip link set can0 up

# Monitor all traffic
candump can0

# Request RPM (Mode 01 PID 0x0C)
cansend can0 7E0#02010C0000000000

# Request coolant temp (Mode 01 PID 0x05)
cansend can0 7E0#020105AA000000AA

# Read DTCs (Mode 03)
cansend can0 7E0#0103000000000000

# Clear DTCs (Mode 04)
cansend can0 7E0#0104000000000000

# Read VIN (Mode 09 PID 0x02) — multi-frame, send FC after FF
cansend can0 7E0#020902AA000000AA

# UDS: enter extended session
cansend can0 7E0#021003AAAAAAAAAA

# UDS: read RPM via DID 0x2003 (extended session required)
cansend can0 7E0#03222003AAAAAAAA
```

Expected response IDs are on `0x7E8`. ISO-TP single frames: `0x0N <data> 0xAA...` where N = payload length.

---

## Dependencies

- [arduino-CAN](https://github.com/sandeepmistry/arduino-CAN) library by Sandeep Mistry
  - Install via Arduino IDE: Sketch → Include Library → Manage Libraries → search "CAN"

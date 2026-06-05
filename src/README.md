# diag_tool — src

Servidor de diagnóstico OBD-II / UDS para Raspberry Pi. Se conecta al bus CAN del vehículo mediante ISO-TP y expone los datos a una app móvil vía Bluetooth Low Energy (GATT NUS).

---

## Estructura

```
src/
├── config/               # Constantes y definiciones de PIDs/DIDs/CAN
│   ├── can_config.py     # IDs CAN, constantes ISO-TP, modos OBD2, NRC
│   ├── obd_pids.py       # Mapa PID → PidDefinition (request bytes + decoder)
│   ├── uds_dids.py       # DIDs UDS y tipos de sesión
│   └── dtc_descriptions.json  # 12.128 códigos DTC con descripción ES/EN
├── core/                 # Interfaces, modelos y excepciones (sin dependencias externas)
│   ├── exceptions.py
│   ├── interfaces/       # ITransport, IDiagnosticSession, IDataLogger, ...
│   └── models/           # MonitorSample, Dtc, LogSession, OBD2Response, ...
├── infraestructure/      # Implementaciones concretas
│   ├── decoder/          # Obd2DataDecoder, UdsDecoder
│   ├── logging/          # SqliteDataLogger, LoggingTransport, FrameFormatter
│   ├── protocol/         # Obd2ProtocolBuilder, UdsProtocolBuilder
│   └── transport/        # IsoTpTransport, MockTransport, LoggingTransport
├── monitor/              # Monitor de datos en tiempo real (hilo de fondo)
├── scripts/              # Puntos de entrada
│   ├── server.py         # Servidor BLE
│   └── cli.py            # Herramienta de diagnóstico por consola
├── server/               # Lógica BLE: GATT server + handler de comandos
│   ├── bluetooth_server.py   # BlessServer GATT NUS, watchdog, restart
│   └── bt_command_handler.py # Dispatch JSON → sesión diagnóstica
└── session/              # Sesión de diagnóstico
    ├── diagnostic_session.py        # OBD2 puro
    ├── logged_diagnostic_session.py # Decorador con persistencia SQLite
    └── uds_session.py               # Sesión UDS (0x10 / 0x22)
```

---

## Arranque

```bash
# Servidor BLE (Raspberry Pi con CAN)
python scripts/server.py

# Servidor BLE sin hardware (modo mock)
python scripts/server.py --mock

# CLI interactivo
python scripts/cli.py

# CLI sin hardware
python scripts/cli.py --mock
```

El token de autenticación BLE se carga de:
1. Variable de entorno `BLE_AUTH_TOKEN`
2. Fichero `~/.seat_diag_token`
3. Por defecto: `1234`

La base de datos siempre se guarda en `<raíz del repo>/diagnostics.db` independientemente del directorio de trabajo.

---

## Cómo se construye una petición: de PID a trama CAN

### 1. Configuración CAN (`config/can_config.py`)

```python
CAN_TX_ID = 0x7E0   # ID estándar OBD-II hacia el ECU
CAN_RX_ID = 0x7E8   # ID de respuesta del ECU

# ISO-TP frame types (nibble alto del byte PCI)
ISOTP_PCI_SF = 0x00  # Single Frame   — carga ≤ 7 bytes
ISOTP_PCI_FF = 0x10  # First Frame    — inicio de mensaje largo
ISOTP_PCI_CF = 0x20  # Consecutive Frame
ISOTP_PCI_FC = 0x30  # Flow Control   — enviado por el receptor para regular el flujo

ISOTP_PADDING_BYTE   = 0xAA  # relleno hasta 8 bytes
ISOTP_CF_SEPARATION_MS = 25  # tiempo mínimo entre consecutive frames
```

### 2. Definición de PID (`config/obd_pids.py`)

```python
from config.obd_pids import PIDS

pid = PIDS[0x0C]
print(pid.request)  # b'\x01\x0c'  — Mode 01, PID 0x0C
print(pid.name)     # "RPM motor"
print(pid.unit)     # "rpm"

# Decodificar respuesta raw
raw = bytes([0x41, 0x0C, 0x0D, 0x48])
#            ^^^^  ^^^^  ^^^^^^^^^^^
#            0x01+0x40  PID   valor (A<<8|B)/4 = 850.0 rpm
print(pid.decode(raw))  # 850.0
```

### 3. Constructor de petición (`infraestructure/protocol/obd2_builder.py`)

```python
from infraestructure.protocol.obd2_builder import Obd2ProtocolBuilder

builder = Obd2ProtocolBuilder()
builder.build_read_rpm_request()        # b'\x01\x0c'
builder.build_read_coolant_temp_request()  # b'\x01\x05'
builder.build_read_dtcs_request()       # b'\x03'      (Mode 03)
builder.build_clear_dtcs_request()      # b'\x04'      (Mode 04)
builder.build_read_vin_request()        # b'\x09\x02'  (Mode 09 PID 02)
```

### 4. Transporte ISO-TP → CAN (`infraestructure/transport/isotp_transport.py`)

El `IsoTpTransport` usa `python-can` + `can-isotp` para segmentar/ensamblar sobre SocketCAN:

```python
from infraestructure.transport.isotp_transport import IsoTpTransport

with IsoTpTransport(channel="can0", tx_id=0x7E0, rx_id=0x7E8, timeout=2.0) as t:
    t.send(b"\x01\x0C")   # petición RPM
    raw = t.receive()      # b'\x41\x0c\x0d\x48'
```

**Flujo de bytes en el bus CAN para una petición simple:**

```
[TX] trama CAN  ID=0x7E0  DLC=8
     data: 02 01 0C AA AA AA AA AA
           ^^                        PCI: SF (0x00), longitud = 2 bytes
              ^^ ^^                  payload OBD2: Mode=0x01, PID=0x0C
                    ^^^^^^^^^^^^^^   padding (0xAA)

[RX] trama CAN  ID=0x7E8  DLC=8
     data: 04 41 0C 0D 48 AA AA AA
           ^^                        PCI: SF, longitud = 4 bytes
              ^^ ^^                  respuesta: 0x01+0x40=0x41, PID=0x0C
                    ^^ ^^            valor A=0x0D B=0x48 → (0x0D<<8|0x48)/4 = 850 rpm
                          ^^^^^^^^   padding
```

**Mensajes largos (ej. VIN = 17 bytes):**

```
[TX] 02 09 02 AA AA AA AA AA   (petición SF)

[RX] 10 14 49 02 01 57 56 57   First Frame — total 0x14=20 bytes, primeros 6 de payload
[TX] 30 00 19 AA AA AA AA AA   Flow Control — blocksize=0, STmin=25ms
[RX] 21 5A 5A 5A 31 4B 5A 41   CF #1
[RX] 22 4D 30 30 30 30 30 31   CF #2
```

### 5. UDS (`infraestructure/protocol/uds_builder.py`)

```python
from infraestructure.protocol.uds_builder import UdsProtocolBuilder

uds = UdsProtocolBuilder()

# DiagnosticSessionControl (SID 0x10)
uds.build_session_control(1)   # b'\x10\x01' — Default session
uds.build_session_control(3)   # b'\x10\x03' — Extended Diagnostic session

# ReadDataByIdentifier (SID 0x22)
uds.build_read_did(0xF190)     # b'\x22\xf1\x90' — VIN
uds.build_read_did(0x2003)     # b'\x22\x20\x03' — RPM (DID propio del ECU)
```

**Trama CAN para ReadDataByIdentifier VIN:**

```
[TX] 03 22 F1 90 AA AA AA AA   (SF, 3 bytes: SID + DID high + DID low)
[RX] 10 14 62 F1 90 57 56 57   (FF — respuesta positiva 0x22+0x40=0x62, datos VIN)
     ...consecutive frames...
```

### 6. NRC (Negative Response Code)

Si el ECU no soporta un servicio o PID, responde con:

```
7F <SID> <NRC>
^^              prefijo NRC
   ^^           servicio que falló (ej. 0x01 para OBD Mode 01)
      ^^        código de error:
                  0x11 serviceNotSupported
                  0x12 subFunctionNotSupported
                  0x22 conditionsNotCorrect
                  0x31 requestOutOfRange
```

El monitor detecta NRCs y añade el PID a una **blacklist** para no reintentar en cada ciclo:

```python
# live_data_monitor.py — si raw[0] == 0x7F, el PID queda bloqueado
if len(raw) >= 1 and raw[0] == 0x7F:
    self._nrc_pids.add(pid_def.pid)
    return
```

---

## Capas

### `core/` — Contratos

Interfaces y modelos sin dependencias externas.

```python
from core.exceptions import DiagnosticTimeoutError, NrcException, InvalidResponseError
from core.models.monitor_sample import MonitorSample
from core.models.dtc import Dtc
from core.models.log_session import LogSession

sample = MonitorSample(pid=0x0C, name="RPM motor", value=850.0, unit="rpm", timestamp=1234.5)
```

---

### `infraestructure/transport/` — Transporte

**MockTransport** — respuestas estáticas en memoria, sin hardware:

```python
from infraestructure.transport.mock_transport import MockTransport

with MockTransport() as t:
    t.send(b"\x01\x0C")
    raw = t.receive()   # b'\x41\x0c\x0d\x48'

# Inyectar respuestas personalizadas
t = MockTransport(response_map={b"\x01\x0C": b"\x41\x0C\x1A\x90"})
t.inject_response(b"\x01\x05", b"\x41\x05\x50")
```

**LoggingTransport** — decorador que loguea cada TX/RX:

```python
from infraestructure.transport.logging_transport import LoggingTransport

transport = LoggingTransport(IsoTpTransport(channel="can0"))
# Cada send/receive queda en consola y ble_comms.log
```

---

### `infraestructure/decoder/` — Decodificadores

```python
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder

dec = Obd2DataDecoder()
raw = bytes([0x41, 0x0C, 0x0D, 0x48])
dec.validate_response(raw, expected_mode=0x01)  # lanza si es NRC o malformado
rpm = dec.decode_rpm(raw)   # 850.0

dtc_raw = bytes([0x43, 0x02, 0x01, 0x43, 0x00, 0x00])
dtcs = dec.decode_dtcs(dtc_raw)   # [Dtc(code='P0143', ...), ...]
```

---

### `core/models/dtc.py` — Códigos de avería

Los DTCs se decodifican según SAE J1979 y se enriquecen automáticamente con descripción desde `config/dtc_descriptions.json` (12.128 códigos, idiomas ES/EN):

```python
from core.models.dtc import Dtc

dtc = Dtc.from_raw(bytes([0x01, 0x43]), lang="es")
print(dtc.code)         # "P0143"
print(dtc.description)  # "Sensor de oxígeno del circuito bajo (banco 1, sensor 3)"

# Con fallback a inglés si no hay descripción en ES
dtc_en = Dtc.from_raw(bytes([0x01, 0x43]), lang="fr")
print(dtc_en.description)  # descripción en inglés
```

**Codificación de los 2 bytes de DTC (SAE J1979):**

```
Byte 1:  bits 7-6 → tipo  (00=P, 01=C, 10=B, 11=U)
         bits 5-4 → dígito 1
         bits 3-0 → dígito 2
Byte 2:  bits 7-4 → dígito 3
         bits 3-0 → dígito 4

Ejemplo: 0x01 0x43
  0x01 = 0000 0001 → tipo=P, d1=0, d2=1
  0x43 = 0100 0011 → d3=4, d4=3
  → P0143
```

---

### `session/` — Sesión de diagnóstico

```python
from infraestructure.transport.mock_transport import MockTransport
from infraestructure.protocol.obd2_builder import Obd2ProtocolBuilder
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from session.diagnostic_session import DiagnosticSession

session = DiagnosticSession(MockTransport(), Obd2ProtocolBuilder(), Obd2DataDecoder())

with session:
    rpm     = session.get_engine_rpm()     # 850.0
    temp    = session.get_coolant_temp()   # 56.0
    speed   = session.get_vehicle_speed()  # 0.0
    vin     = session.get_vin()            # "WVWZZZ1KZAM000001"
    dtcs    = session.get_dtcs()           # [Dtc(code='P0143', ...), ...]
    samples = session.get_snapshot()       # list[MonitorSample]
```

**LoggedDiagnosticSession** — decorador que persiste cada operación en SQLite:

```python
from infraestructure.logging.sqlite_logger import SqliteDataLogger
from session.logged_diagnostic_session import LoggedDiagnosticSession

logger = SqliteDataLogger("diagnostics.db")
session_id = logger.start_session("mi sesión")

logged = LoggedDiagnosticSession(session, logger, session_id, transport)
with logged:
    rpm = logged.get_engine_rpm()   # igual que antes, pero queda en la DB
```

---

### `monitor/` — Monitor continuo

Hilo de fondo que hace polling de PIDs a intervalo fijo. PIDs que responden con NRC quedan en blacklist automáticamente.

```python
import threading
from monitor.live_data_monitor import LiveDataMonitor

def on_sample(s): print(f"{s.name}: {s.value} {s.unit}")
def on_error(pid, exc): print(f"PID 0x{pid:02X} NRC/error: {exc}")

monitor = LiveDataMonitor(
    transport=transport,
    decoder=Obd2DataDecoder(),
    pid_ids=frozenset({0x0C, 0x05, 0x0D}),
    interval_ms=500,
    on_sample=on_sample,
    on_error=on_error,
    lock=threading.Lock(),  # lock compartido con el servidor BLE
)

monitor.start()
# ...
monitor.stop()
```

---

### `infraestructure/logging/` — Persistencia SQLite

```python
from infraestructure.logging.sqlite_logger import SqliteDataLogger

logger = SqliteDataLogger("diagnostics.db")
session_id = logger.start_session("prueba")

logger.log_sample(session_id, MonitorSample(...))
logger.log_dtcs(session_id, [Dtc(code="P0143", ...)])

sessions = logger.get_sessions(limit=10)
samples  = logger.get_samples(session_id=session_id, pid=0x0C)
dtcs     = logger.get_dtcs_for_session(session_id)

logger.end_session(session_id)
logger.close()
```

**Esquema de la base de datos:**

```sql
sessions (id, label, started_at, ended_at)

samples  (id, session_id, pid, name, value, unit, monotonic_ts, wall_ts)
          INDEX (session_id, pid)

commands (id, session_id, command, request_hex, response_hex, wall_ts)
          INDEX (session_id)

dtcs     (id, session_id, code, raw_hex, description, wall_ts)
          INDEX (session_id)
```

WAL activado para lecturas concurrentes sin bloquear escrituras del monitor.

---

### `server/` — Servidor BLE

**BLEDiagServer** expone el servicio GATT NUS (Nordic UART Service):

- `_NUS_RX` `6E400002-...` — característica de escritura (app → Pi)
- `_NUS_TX` `6E400003-...` — característica de notificación (Pi → app)

Protocolo: objetos JSON terminados en `\n`, MTU 240 bytes (fragmentado automáticamente si el payload es mayor).

**Watchdog:** comprueba actividad del cliente cada 5 s. Si no hay RX en 30 s, desconecta y **reinicia el servidor BLE** (stop + start de BlessServer) para volver a anunciar correctamente en BlueZ.

**BtCommandHandler** despacha los comandos JSON a la lógica de diagnóstico. Todos los comandos excepto `auth` requieren autenticación previa.

**Comandos disponibles:**

```jsonc
// Autenticación
{"cmd": "auth", "token": "1234"}
// → {"status": "ok", "data": "authenticated"}

// Keepalive
{"cmd": "ping"}
// → {"status": "ok", "data": "pong"}

// Descubrir PIDs soportados por el ECU (bitmap OBD2 + poll de confirmación)
{"cmd": "probe_pids"}
// → {"status": "ok", "data": [4, 5, 12, 13, 17, ...]}

// Captura única de todos los PIDs soportados
{"cmd": "snapshot"}
// → {"status": "ok", "data": {"RPM motor": {"value": 850.0, "unit": "rpm"}, ...}}

// Monitor continuo (push periódico mientras esté activo)
{"cmd": "monitor_start", "pids": [4, 5, 12, 13], "interval_ms": 500}
// Push de muestras: {"type": "samples", "samples": [{"pid":12,"name":"RPM motor","value":850.0,...}]}
// Push de error:    {"type": "error", "pid": 10, "message": "NRC 0x31"}

{"cmd": "monitor_stop"}

// DTCs
{"cmd": "dtcs"}
// → {"status": "ok", "data": [{"code":"P0143","description":"Sensor O2...","raw":"0143"}]}

{"cmd": "clear_dtcs"}

// VIN
{"cmd": "vin"}

// Historial SQLite
{"cmd": "sessions", "limit": 20}
{"cmd": "session_samples", "session_id": 5, "pid": 12, "limit": 1000}
{"cmd": "session_commands", "session_id": 5}
{"cmd": "session_dtcs", "session_id": 5}

// UDS
{"cmd": "uds_session", "session_type": 3}
{"cmd": "uds_read_did", "did": "0xF190"}

// Desconexión limpia (sin esperar watchdog)
{"cmd": "disconnect"}
```

---

## Flujo completo

```
App móvil
    │  JSON\n / BLE NUS (6E400002 RX → 6E400003 TX)
    ▼
BLEDiagServer          bluetooth_server.py
    │ watchdog 30s → reinicia BlessServer si cliente inactivo
    │ llama a
    ▼
BtCommandHandler       bt_command_handler.py
    │ usa
    ├─► LoggedDiagnosticSession ──► DiagnosticSession
    │                                      │
    │                               IsoTpTransport (+ lock compartido)
    │                                      │  ISO-TP / SocketCAN
    │                                      ▼
    │                                   ECU (can0 @ 500 kbps)
    │                                   TX: 0x7E0 / RX: 0x7E8
    │
    ├─► LiveDataMonitor    hilo de fondo para monitor_start
    │       └── blacklist de PIDs con NRC
    │
    └─► SqliteDataLogger → diagnostics.db
            sessions / samples / commands / dtcs
```

---

## Dependencias

```
python-can       # interfaz CAN (SocketCAN en Linux)
can-isotp        # stack ISO 15765-2 (ISO-TP)
bless            # servidor GATT BLE (solo server.py)
```

```bash
pip install -r requirements.txt
# En Raspberry Pi para BLE:
sudo apt install libbluetooth-dev bluez
pip install bless
```

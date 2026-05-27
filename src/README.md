# diag_tool — src

Servidor de diagnóstico OBD-II para Raspberry Pi. Se conecta al bus CAN del vehículo mediante ISO-TP y expone los datos a una app móvil vía Bluetooth Low Energy (GATT NUS).

---

## Estructura

```
src/
├── config/               # Constantes y definiciones de PIDs/DIDs
├── core/                 # Interfaces, modelos y excepciones (sin dependencias externas)
│   ├── exceptions.py
│   ├── interfaces/
│   └── models/
├── infraestructure/      # Implementaciones concretas
│   ├── decoder/          # Decodificadores OBD2 y UDS
│   ├── logging/          # Logger SQLite y formateador de tramas
│   ├── protocol/         # Constructores de peticiones OBD2 y UDS
│   └── transport/        # IsoTpTransport, MockTransport, LoggingTransport
├── monitor/              # Monitor de datos en tiempo real (hilo de fondo)
├── scripts/              # Puntos de entrada
│   ├── server.py         # Servidor BLE
│   └── cli.py            # Herramienta de diagnóstico por consola
├── server/               # Lógica BLE: GATT server + handler de comandos
└── session/              # Sesión de diagnóstico OBD2 y UDS
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

---

## Capas

### `core/` — Contratos

Interfaces y modelos sin dependencias externas. Permiten sustituir cualquier implementación (por ejemplo, cambiar el transporte o el logger) sin tocar el resto del código.

**Excepciones:**

```python
from core.exceptions import DiagnosticTimeoutError, NrcException, InvalidResponseError

# DiagnosticTimeoutError  — el ECU no respondió en el tiempo máximo
# NrcException            — el ECU respondió con código de error UDS/OBD (NRC)
# InvalidResponseError    — la respuesta está malformada
```

**Modelos:**

```python
from core.models.monitor_sample import MonitorSample
from core.models.dtc import Dtc
from core.models.log_session import LogSession

sample = MonitorSample(pid=0x0C, name="RPM motor", value=850.0, unit="rpm", timestamp=1234.5)
```

---

### `config/` — PIDs y constantes CAN

```python
from config.obd_pids import PIDS, PidDefinition
from config.can_config import CAN_TX_ID, CAN_RX_ID

# PIDS es un dict[int, PidDefinition] con 24 PIDs Mode 01 definidos
pid = PIDS[0x0C]
print(pid.name)     # "RPM motor"
print(pid.request)  # b'\x01\x0c'
print(pid.unit)     # "rpm"

# Decodificar una respuesta raw
raw = bytes([0x41, 0x0C, 0x0D, 0x48])
print(pid.decode(raw))  # 850.0
```

Los PIDs disponibles incluyen: RPM, velocidad, temperaturas (refrigerante, aceite, aire interior/exterior), MAF, trims de combustible, throttle, presiones, batería, nivel de combustible, tiempo de encendido, distancia desde borrado de DTCs.

---

### `infraestructure/transport/` — Transporte

Implementan `ITransport`: `connect()`, `disconnect()`, `send(bytes)`, `receive() -> bytes`.

**IsoTpTransport** — transporte real sobre SocketCAN:

```python
from infraestructure.transport.isotp_transport import IsoTpTransport

with IsoTpTransport(channel="can0", tx_id=0x7E0, rx_id=0x7E8) as t:
    t.send(b"\x01\x0C")        # pide RPM
    raw = t.receive()           # b'\x41\x0c\x0d\x48'
```

**MockTransport** — respuestas estáticas en memoria, sin hardware:

```python
from infraestructure.transport.mock_transport import MockTransport

with MockTransport() as t:
    t.send(b"\x01\x0C")
    raw = t.receive()           # b'\x41\x0c\x0d\x48' (respuesta predefinida)

# Inyectar respuestas personalizadas
custom = MockTransport(response_map={b"\x01\x0C": b"\x41\x0C\x1A\x90"})

# O sobrescribir una entrada en tiempo de ejecución
t.inject_response(b"\x01\x05", b"\x41\x05\x50")
```

**LoggingTransport** — decorador que loguea cada TX/RX al logger `transport`:

```python
from infraestructure.transport.logging_transport import LoggingTransport

raw_transport = IsoTpTransport(channel="can0")
transport = LoggingTransport(raw_transport)
# Todas las llamadas a send/receive quedan en consola y ble_comms.log
```

---

### `infraestructure/decoder/` — Decodificadores

**Obd2DataDecoder** — valida y decodifica respuestas Mode 01/03/04/09:

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

### `session/` — Sesión de diagnóstico

**DiagnosticSession** — pipeline completo send → receive → validate → decode:

```python
from infraestructure.transport.mock_transport import MockTransport
from infraestructure.protocol.obd2_builder import Obd2ProtocolBuilder
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from session.diagnostic_session import DiagnosticSession

transport = MockTransport()
session = DiagnosticSession(transport, Obd2ProtocolBuilder(), Obd2DataDecoder())

with session:
    rpm   = session.get_engine_rpm()        # 850.0
    temp  = session.get_coolant_temp()      # 56.0
    speed = session.get_vehicle_speed()     # 0.0
    vin   = session.get_vin()               # "WVWZZZ1KZAM000001"
    dtcs  = session.get_dtcs()             # []

    samples = session.get_snapshot()        # list[MonitorSample], todos los PIDs
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

Hilo de fondo que hace polling de una lista de PIDs a intervalo fijo y llama a callbacks por cada muestra o error. Los PIDs que responden con NRC quedan en blacklist automáticamente tras el primer fallo.

```python
import threading
from infraestructure.transport.mock_transport import MockTransport
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from monitor.live_data_monitor import LiveDataMonitor

transport = MockTransport()
transport.connect()

def on_sample(s):
    print(f"{s.name}: {s.value} {s.unit}")

def on_error(pid, exc):
    print(f"PID 0x{pid:02X} error: {exc}")

monitor = LiveDataMonitor(
    transport=transport,
    decoder=Obd2DataDecoder(),
    pid_ids=frozenset({0x0C, 0x05, 0x0D}),
    interval_ms=500,
    on_sample=on_sample,
    on_error=on_error,
)

monitor.start()
# ... hacer otras cosas ...
monitor.stop()

# O como context manager:
with monitor:
    input("Enter para parar")
```

Con lock compartido para acceso exclusivo al bus CAN (necesario cuando coexiste con el servidor BLE):

```python
lock = threading.Lock()
monitor = LiveDataMonitor(..., lock=lock)
```

---

### `infraestructure/logging/` — Persistencia

**SqliteDataLogger** — guarda sesiones, muestras y comandos en SQLite:

```python
from infraestructure.logging.sqlite_logger import SqliteDataLogger
from core.models.monitor_sample import MonitorSample

logger = SqliteDataLogger("diagnostics.db")
session_id = logger.start_session("prueba")

logger.log_sample(session_id, MonitorSample(
    pid=0x0C, name="RPM motor", value=850.0, unit="rpm", timestamp=0.0
))

sessions = logger.get_sessions(limit=10)
samples  = logger.get_samples(session_id=session_id, pid=0x0C)

logger.end_session(session_id)
logger.close()
```

Esquema de la base de datos:

```sql
sessions  (id, label, started_at, ended_at)
samples   (id, session_id, pid, name, value, unit, monotonic_ts, wall_ts)
commands  (id, session_id, command, request_hex, response_hex, wall_ts)
```

La DB siempre se guarda en `<raíz del repo>/diagnostics.db` independientemente del directorio de trabajo.

---

### `server/` — Servidor BLE

**BLEDiagServer** — GATT server UART NUS (Nordic UART Service). Recibe JSON por la característica RX y responde por TX.

**BtCommandHandler** — despacha los comandos JSON a la lógica de diagnóstico.

Protocolo: JSON terminado en `\n` sobre BLE NUS.

**Comandos disponibles:**

```jsonc
// Autenticación (obligatoria si hay token configurado)
{"cmd": "auth", "token": "1234"}
// → {"status": "ok", "data": "authenticated"}

// Keepalive
{"cmd": "ping"}
// → {"status": "ok", "data": "pong"}

// Descubrir PIDs soportados (bitmap + poll real)
{"cmd": "probe_pids"}
// → {"status": "ok", "data": [4, 5, 12, 13, ...]}

// Captura única de todos los PIDs soportados
{"cmd": "snapshot"}
// → {"status": "ok", "data": {"RPM motor": {"value": 850.0, "unit": "rpm"}, ...}}

// Monitor continuo
{"cmd": "monitor_start", "pids": [4, 5, 12, 13], "interval_ms": 500}
// Push periódico: {"type": "samples", "samples": [{...}, ...]}
// Push en error:  {"type": "error", "pid": 10, "message": "..."}

{"cmd": "monitor_stop"}

// DTCs
{"cmd": "dtcs"}
{"cmd": "clear_dtcs"}

// VIN
{"cmd": "vin"}

// Historial (SQLite)
{"cmd": "sessions", "limit": 20}
{"cmd": "session_samples", "session_id": 5, "pid": 12, "limit": 1000}
{"cmd": "session_commands", "session_id": 5}

// UDS
{"cmd": "uds_session", "session_type": 3}
{"cmd": "uds_read_did", "did": "0xF190"}

// Desconexión limpia (reset inmediato, sin esperar watchdog)
{"cmd": "disconnect"}
```

---

## Flujo completo

```
App móvil
    │  JSON / BLE NUS
    ▼
BLEDiagServer (bluetooth_server.py)
    │  llama a
    ▼
BtCommandHandler (bt_command_handler.py)
    │  usa
    ├─► LoggedDiagnosticSession ──► DiagnosticSession
    │                                      │
    │                               IsoTpTransport
    │                                      │ ISO-TP / SocketCAN
    │                                      ▼
    │                                   ECU (can0)
    │
    └─► LiveDataMonitor (hilo de fondo, para monitor_start)
    │
    └─► SqliteDataLogger → diagnostics.db
```

---

## Dependencias

```
python-can       # interfaz CAN
can-isotp        # stack ISO 15765-2 (ISO-TP)
bless            # servidor GATT BLE (solo server.py)
```

Instalación:
```bash
pip install -r requirements.txt
# En Raspberry Pi para BLE:
sudo apt install libbluetooth-dev bluez
pip install bless
```

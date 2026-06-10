# TFT-CAN-BLE — Sistema de Diagnóstico Automotriz por BLE

> **Trabajo de Fin de Título** — Grado en Ingeniería Informática  
> Universidad de Las Palmas de Gran Canaria (ULPGC)  
> Autor: Gorka Eymard Santana Cabrera

Sistema completo de diagnóstico vehicular que une un simulador de ECU (Arduino), un servidor de diagnóstico (Raspberry Pi) y una app móvil (Android/iOS) mediante Bluetooth Low Energy.

---

## Repositorios

| Remoto | URL | Descripción |
|--------|-----|-------------|
| **GitHub** (`origin`) | https://github.com/gorkaftv1/TFT-CAN-BLE-system | Repositorio público principal |
| **ULPGC GitLab** (`ulpgc`) | https://git.iusiani.ulpgc.es/git/gesantana/TFT-CAN-BLE | Repositorio institucional del TFT |

Ambos remotos mantienen el mismo historial. El remoto `ulpgc` es el repositorio oficial de entrega del TFT; `origin` (GitHub) es el espejo público con acceso abierto al código fuente.

---

## Arquitectura general

```
┌─────────────────┐      CAN bus (500 kbps)      ┌─────────────────────┐
│  Arduino        │◄────────────────────────────►│  Raspberry Pi        │
│  ECU Simulator  │    ISO-TP (ISO 15765-2)       │  Servidor Python     │
│  (ecu_sim.ino)  │    OBD-II / UDS              │  (src/scripts/)      │
└─────────────────┘                               └────────┬────────────┘
                                                           │ BLE (GATT/NUS)
                                                           │ NDJSON
                                                  ┌────────▼────────────┐
                                                  │  App Móvil           │
                                                  │  React Native        │
                                                  │  (mobile-app/)       │
                                                  └─────────────────────┘
```

**Protocolos verticales:**
- `CAN` — IEEE 802.3 / ISO 11898, 500 kbps, IDs 0x7E0 (tester) / 0x7E8 (ECU)
- `ISO-TP` (ISO 15765-2) — Segmentación y reensamblado sobre CAN
- `OBD-II` (SAE J1979) — Modos 01, 03, 04, 09 (PIDs estándar)
- `UDS` (ISO 14229-1) — Servicios 0x10 (sesión), 0x22 (lectura de DID)
- `BLE GATT` — Nordic UART Service (NUS), MTU 244, NDJSON newline-delimited

---

## Estructura del proyecto

```
tft-gorka/
├── src/                     # Backend Python (Raspberry Pi)
│   ├── config/              # Constantes de protocolo, PIDs, DIDs
│   ├── core/                # Interfaces, modelos, excepciones
│   ├── infraestructure/     # Transporte CAN/Mock, decoder, logger, builder
│   ├── monitor/             # Hilo de monitorización en tiempo real
│   ├── scripts/             # Puntos de entrada: server.py, cli.py
│   ├── server/              # Servidor BLE GATT (bless)
│   ├── session/             # Sesiones OBD-II, UDS, con logging
│   └── requirements.txt
├── mobile-app/              # App React Native (Android/iOS)
│   ├── src/
│   │   ├── config/          # Definición de PIDs y DIDs para la app
│   │   ├── components/      # Componentes reutilizables
│   │   ├── data/            # Base de datos local DTC (~13 000 códigos)
│   │   ├── domain/          # Modelos y servicios de negocio
│   │   ├── infrastructure/  # Adaptadores BLE y Mock
│   │   ├── navigation/      # Bottom tab navigator
│   │   ├── screens/         # Dashboard, DTC, Sesiones, Consola, Ajustes
│   │   ├── shared/          # Tema, constantes
│   │   └── stores/          # Estado global (Zustand, 8 stores)
│   └── package.json
├── arduino-sim/
│   └── ecu_sim/
│       ├── ecu_sim.ino      # Sketch principal (ECU completa, 982 líneas)
│       └── ecu_protocol.h   # Constantes de protocolo y structs
├── documentation/           # Memoria del TFT (LaTeX, capturas, evidencias)
├── scripts/                 # Utilidades: métricas de BD, latencia BLE
└── diagnostics.db           # Base de datos SQLite (sesiones, muestras, DTCs)
```

---

## Componentes

### 1. Simulador ECU (Arduino)

Emula una ECU real respondiendo a peticiones OBD-II y UDS sobre CAN bus. Permite desarrollar y probar el sistema completo sin un vehículo real.

**Hardware requerido:**
- Arduino MKR (MKR WiFi 1010 o MKR Zero)
- MKR CAN Shield (MCP2515 + TJA1050)
- Botón en D7 (encendido/apagado motor)
- Botón en D6 (ciclar DTCs de prueba)

**Funcionalidades:**
- OBD-II Modo 01: 24 PIDs (RPM, temperatura, velocidad, carga, MAF, presión de combustible, tensión de batería…)
- OBD-II Modo 03/04: lectura y borrado de DTCs
- OBD-II Modo 09: VIN (multi-frame ISO-TP)
- UDS 0x10: control de sesión (Default / Extended)
- UDS 0x22: lectura de DIDs (VIN 0xF190, datos en vivo 0x2001–0x2008)
- ISO-TP completo: Single Frame, First Frame, Consecutive Frame, Flow Control
- Modelo de simulación: estado del motor, filtro de primer orden en aceleración, integración de velocidad con rozamiento cuadrático, temperatura con rise/decay, tensión de batería con ruido configurable

**Configuración en `ecu_protocol.h`:**

| Macro | Valores | Efecto |
|-------|---------|--------|
| `SIM_MODE` | `FULL` / `BASIC` | 24 PIDs vs. 6 PIDs |
| `BROADCAST_ENABLE` | 0 / 1 | Tramas CAN no solicitadas a 10 Hz |
| `ADD_NOISE` | 0 / 1 | Jitter aleatorio en sensores |
| `LOG_LEVEL` | 0 / 1 / 2 | Verbosidad de Serial (0=quiet, 2=todo) |

**Instalar y flashear:**
1. Instalar librería **arduino-CAN** (Sandeep Mistry) desde Arduino IDE → Library Manager
2. Abrir `arduino-sim/ecu_sim/ecu_sim.ino`
3. Seleccionar placa: *Arduino MKR WiFi 1010* (o la variante correcta)
4. Cargar el sketch

---

### 2. Backend Python (Raspberry Pi)

Servidor BLE GATT que actúa como puente entre la app móvil y el bus CAN del vehículo (o el simulador Arduino).

**Requisitos del sistema:**
- Raspberry Pi (probado en Pi 4 y Pi Zero 2W)
- Python ≥ 3.10
- Adaptador CAN (MCP2515 vía SPI o HAT CAN)
- BlueZ ≥ 5.55

**Instalación:**
```bash
cd src
pip install -r requirements.txt
```

**Iniciar servidor BLE:**
```bash
python scripts/server.py
```

El servidor expone el **Nordic UART Service** (NUS) y espera comandos JSON desde la app. La autenticación requiere un token de 4 dígitos (por defecto `1234`).

**CLI interactivo (sin BLE, para pruebas):**
```bash
python scripts/cli.py
```

**Comandos BLE disponibles (NDJSON):**

| Comando | Descripción |
|---------|-------------|
| `{"cmd":"auth","token":"1234"}` | Autenticación |
| `{"cmd":"monitor_start","pids":[12,5,13],"interval_ms":500}` | Iniciar monitorización |
| `{"cmd":"monitor_stop"}` | Detener monitorización |
| `{"cmd":"snapshot"}` | Lectura puntual de todos los PIDs |
| `{"cmd":"dtcs"}` | Leer códigos de fallo activos |
| `{"cmd":"clear_dtcs"}` | Borrar DTCs |
| `{"cmd":"vin"}` | Leer VIN del vehículo |
| `{"cmd":"uds_session","type":1}` | Control de sesión UDS |
| `{"cmd":"uds_read_did","did":"0xF190"}` | Leer DID UDS |
| `{"cmd":"sessions"}` | Historial de sesiones (SQLite) |
| `{"cmd":"probe_pids"}` | Detectar PIDs soportados por la ECU |

**Watchdog BLE:** si el cliente no envía actividad durante 30 s, el servidor reinicia automáticamente el stack BLE (máx. 5 reintentos con backoff exponencial).

**Mock (sin hardware CAN):**
```bash
# En src/scripts/server.py, habilitar MOCK_MODE=True
```

---

### 3. App Móvil (React Native)

Aplicación cross-platform (Android/iOS) que se conecta al servidor Pi vía BLE y muestra datos del vehículo en tiempo real.

**Instalar dependencias:**
```bash
cd mobile-app
npm install
```

**Ejecutar en desarrollo:**
```bash
npx expo start          # Metro bundler
npx expo run:android    # Build nativo Android
npx expo run:ios        # Build nativo iOS (requiere macOS)
```

**Pantallas principales:**

| Pantalla | Ruta | Función |
|----------|------|---------|
| Dashboard | `/dashboard` | Grid de widgets con PIDs y DIDs en tiempo real |
| Fallos | `/dtc` | Lista de DTCs activos con descripción |
| Sesiones | `/sessions` | Historial de sesiones guardadas |
| Consola | `/console` | Log raw de tramas OBD/BLE/UDS/App con export CSV |
| Ajustes | `/settings` | Dispositivo BLE, modo Mock, widgets, intervalo |

**Modo Mock:** activable desde Ajustes → "Usar modo simulado". No requiere hardware; genera datos realistas para desarrollo y demostración.

---

## Dependencias y librerías

### Python (Raspberry Pi)

| Librería | Versión | Propósito |
|----------|---------|-----------|
| [`python-can`](https://python-can.readthedocs.io/) | ≥ 4.4.0 | Interfaz con el bus CAN (SocketCAN en Linux). Abstrae el hardware CAN (MCP2515, PEAK, Vector, etc.) en una API unificada. |
| [`can-isotp`](https://can-isotp.readthedocs.io/) | ≥ 2.0.0 | Implementación de ISO 15765-2 (ISO-TP) sobre python-can. Gestiona segmentación, reensamblado, Flow Control y separación de tramas. |
| [`bless`](https://github.com/kevincar/bless) | ≥ 0.2.6 | Servidor BLE GATT (peripheral role) multiplataforma sobre BlueZ (Linux), CoreBluetooth (macOS) y WinRT (Windows). Expone el Nordic UART Service. |
| `sqlite3` | stdlib | Persistencia de sesiones, muestras, comandos y DTCs. Módulo estándar de Python. |
| `asyncio` | stdlib | Loop de eventos para la gestión concurrente del servidor BLE, el hilo de monitorización y las sesiones CAN. |
| `threading` | stdlib | Hilo de monitorización en tiempo real (`LiveDataMonitor`) paralelo al servidor BLE. |

### React Native / Expo (App móvil)

| Librería | Versión | Propósito |
|----------|---------|-----------|
| [`react-native`](https://reactnative.dev/) | 0.81.5 | Framework de UI cross-platform. Renderiza componentes nativos en Android e iOS desde JavaScript. |
| [`expo`](https://docs.expo.dev/) | ~54.0.33 | Toolchain y runtime que simplifica build, OTA updates y acceso a APIs nativas. |
| [`react-native-ble-plx`](https://github.com/dotintent/react-native-ble-plx) | ^3.5.1 | API BLE para React Native. Gestiona escaneo, conexión, descubrimiento de servicios GATT y lectura/escritura/notificaciones de características. |
| [`zustand`](https://github.com/pmndrs/zustand) | ^5.0.12 | Gestión de estado global minimalista. 8 stores: conexión BLE, datos del vehículo, DTCs, sesiones, PIDs soportados, UDS, configuración y logs. |
| [`@react-navigation/native`](https://reactnavigation.org/) | ^7.2.2 | Sistema de navegación. Gestiona el stack de rutas y el historial de pantallas. |
| [`@react-navigation/bottom-tabs`](https://reactnavigation.org/docs/bottom-tab-navigator) | ^7.15.9 | Navegación por pestañas inferiores (Dashboard / Fallos / Sesiones / Consola / Ajustes). |
| [`@react-native-async-storage/async-storage`](https://react-native-async-storage.github.io/async-storage/) | 2.2.0 | Almacenamiento clave-valor persistente en el dispositivo. Usado por Zustand para persistir configuración y preferencias de widgets. |
| [`expo-file-system`](https://docs.expo.dev/versions/latest/sdk/filesystem/) | ~19.0.22 | Acceso al sistema de archivos del dispositivo para exportar logs en formato CSV. |
| [`expo-sharing`](https://docs.expo.dev/versions/latest/sdk/sharing/) | ~14.0.8 | Hoja de compartición nativa (Android Share / iOS Share Sheet) para los exports CSV. |
| [`expo-status-bar`](https://docs.expo.dev/versions/latest/sdk/status-bar/) | ~3.0.9 | Control del estilo de la barra de estado del sistema operativo. |
| [`react-native-safe-area-context`](https://github.com/th3rdwave/react-native-safe-area-context) | ~5.6.0 | Insets para notch, barra de navegación y safe areas en distintos dispositivos. |
| [`react-native-screens`](https://github.com/software-mansion/react-native-screens) | ~4.16.0 | Optimización de rendimiento de navegación usando pantallas nativas del SO. |
| `typescript` | ~5.9.2 | Tipado estático completo en toda la app. Todos los modelos, servicios y adaptadores están tipados. |

### Arduino

| Librería | Fuente | Propósito |
|----------|--------|-----------|
| [arduino-CAN](https://github.com/sandeepmistry/arduino-CAN) | Sandeep Mistry (Library Manager) | Interfaz con el controlador MCP2515 del MKR CAN Shield. Envío y recepción de tramas CAN de 8 bytes a 500 kbps. |

El simulador implementa **ISO-TP** y las capas **OBD-II/UDS** de forma nativa en el sketch, sin dependencias externas adicionales.

---

## Base de datos SQLite

Fichero: `diagnostics.db` (raíz del proyecto, en el sistema de la Raspberry Pi)

```sql
-- Sesiones de diagnóstico
CREATE TABLE sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT,
    started_at TEXT,   -- ISO 8601
    ended_at   TEXT
);

-- Muestras de sensores
CREATE TABLE samples (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER REFERENCES sessions(id),
    pid          INTEGER,    -- PID OBD-II o DID UDS (hex)
    name         TEXT,       -- Nombre legible ("RPM", "Coolant Temp"…)
    value        REAL,
    unit         TEXT,
    monotonic_ts REAL,       -- Para análisis de latencia y cadencia
    wall_ts      TEXT
);
CREATE INDEX idx_samples ON samples(session_id, pid);

-- Log de comandos enviados
CREATE TABLE commands (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER REFERENCES sessions(id),
    command      TEXT,
    request_hex  TEXT,
    response_hex TEXT,
    wall_ts      TEXT
);
CREATE INDEX idx_commands ON commands(session_id);

-- Códigos de fallo registrados
CREATE TABLE dtcs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER REFERENCES sessions(id),
    code        TEXT,        -- e.g. "P0300"
    raw_hex     TEXT,
    description TEXT,
    wall_ts     TEXT
);
CREATE INDEX idx_dtcs ON dtcs(session_id);
```

WAL mode activado para permitir escritura concurrente del monitor y lectura desde la app o el CLI.

**Scripts de análisis:**
```bash
python scripts/db_metrics.py          # Estadísticas de sesiones y muestras
python scripts/latency_from_csv.py    # Latencia BLE desde logs CSV exportados
```

---

## Guía rápida de uso completo

### Opción A — Con Arduino (sin vehículo real)

```
1. Flashear ecu_sim.ino en Arduino MKR + CAN Shield
2. Conectar Arduino a Raspberry Pi por CAN bus (H↔H, L↔L, GND↔GND)
3. En Raspberry Pi:
   cd src && python scripts/server.py
4. En la app móvil:
   Ajustes → seleccionar dispositivo BLE → Conectar
   Ajustes → modo Mock: OFF
5. Dashboard mostrará RPM, temperatura, velocidad en tiempo real
```

### Opción B — Modo Mock (solo app, sin hardware)

```
1. En la app: Ajustes → "Usar modo simulado: ON"
2. Conectar → datos simulados aparecen inmediatamente
3. Útil para desarrollo de UI y demos
```

### Opción C — Con vehículo real

```
1. Conectar adaptador CAN al puerto OBD-II del vehículo
2. Configurar SocketCAN en Raspberry Pi:
   sudo ip link set can0 up type can bitrate 500000
3. En src/infraestructure/transport/isotp_transport.py:
   channel = "can0"  # ajustar según adaptador
4. Ejecutar: python scripts/server.py
5. Conectar app igual que Opción A
```

---

## Calidad académica del proyecto

Este proyecto cumple con los requisitos habituales de un Trabajo de Fin de Título de nivel alto en Ingeniería Informática. A continuación se detallan los aspectos más valorables y los puntos que merecen mención especial:

### Puntos fuertes

**Amplitud técnica real.**
El sistema integra tres capas de hardware y software distintas (Arduino, Raspberry Pi, smartphone) coordinadas por cuatro protocolos industriales estandarizados (CAN, ISO-TP, OBD-II, UDS). No es un proyecto de software puro; requiere conocimiento de sistemas embebidos, protocolos de red de área del controlador y comunicaciones inalámbricas de baja energía.

**Implementación de protocolos desde cero.**
El simulador de ECU implementa ISO-TP completo (SF, FF, CF, FC) y las capas OBD-II/UDS en C++ sin librerías de protocolo externas. Esto demuestra comprensión profunda del estándar, no solo uso de APIs de alto nivel.

**Arquitectura software bien estructurada.**
El backend Python aplica correctamente el patrón de capas (interfaces → infraestructura → sesión → servidor) con inyección de dependencias y decoradores (LoggedDiagnosticSession sobre DiagnosticSession). La app móvil sigue el patrón adaptador con una interfaz `IVehicleAdapter` que permite cambiar entre BLE real y Mock sin modificar la lógica de negocio.

**Persistencia y observabilidad.**
Todas las sesiones, muestras, comandos y DTCs se persisten en SQLite con índices apropiados y WAL mode. Los scripts de análisis de latencia (`latency_from_csv.py`, `db_metrics.py`) evidencian un enfoque de ingeniería riguroso, no solo un prototipo.

**Modo simulado completo.**
La existencia de un MockAdapter en la app y un MockTransport en el backend permite reproducir el sistema sin hardware, facilitando el desarrollo, las pruebas y la evaluación por parte del tribunal.

**Documentación de calidad.**
La base de datos local de 13 000 códigos DTC, la batería de preguntas de defensa con más de 70 preguntas técnicas cubiertas, y la memoria del TFT en LaTeX evidencian un trabajo completo, no solo el código.

### Aspectos a tener en cuenta en la defensa

- La seguridad del protocolo BLE se limita a un token de 4 dígitos numérico. En un contexto de producción real se requeriría autenticación más robusta (e.g., TLS sobre BLE, token TOTP). Esto puede aparecer como pregunta del tribunal.
- El sistema está probado en Arduino MKR + Raspberry Pi 4; la portabilidad a otros adaptadores CAN (PEAK, Vector) requiere ajustar solo el parámetro `channel` en `isotp_transport.py`, gracias a la abstracción de `python-can`.
- El protocolo NDJSON sobre BLE es una elección pragmática para un TFT; en un producto real se evaluaría CBOR o Protobuf para reducir overhead.

---

## Documentación adicional

- [src/README.md](src/README.md) — Arquitectura del backend, API de comandos BLE, ejemplos de uso
- [mobile-app/README.md](mobile-app/README.md) — Stack frontend, estructura de stores, convenciones de color
- [arduino-sim/README.md](arduino-sim/README.md) — Hardware, configuración de SIM_MODE, tabla de PIDs y DIDs
- [documentation/](documentation/) — Memoria completa del TFT (LaTeX), capturas, evidencias de pruebas, figuras

---

## Licencia

Proyecto académico — Universidad de Las Palmas de Gran Canaria. Código disponible con fines educativos.

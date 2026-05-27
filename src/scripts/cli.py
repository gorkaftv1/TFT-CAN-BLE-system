"""VAG Group OBD-II Diagnostic CLI.

Usage:
    python scripts/cli.py            # real CAN hardware (can0)
    python scripts/cli.py --mock     # Arduino simulator / no hardware
    python scripts/cli.py --channel can1  # different CAN interface

All sessions logged to diagnostics.db (SQLite).
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import threading
import time

# Allow running from the project root without installing as a package.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.exceptions import DiagnosticTimeoutError, InvalidResponseError, NrcException
from core.models.monitor_sample import MonitorSample
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from infraestructure.logging.sqlite_logger import SqliteDataLogger
from infraestructure.protocol.obd2_builder import Obd2ProtocolBuilder
from infraestructure.transport.isotp_transport import IsoTpTransport
from infraestructure.transport.logging_transport import LoggingTransport
from infraestructure.transport.mock_transport import MockTransport
from config.obd_pids import PIDS
from monitor.live_data_monitor import LiveDataMonitor
from session.diagnostic_session import DiagnosticSession
from session.logged_diagnostic_session import LoggedDiagnosticSession

_SEP = "─" * 48

# ---------- UDS helpers ----------
_UDS_DSC  = 0x10
_UDS_RDBI = 0x22
_UDS_NRC  = 0x7F

_UDS_DIDS = [
    (0xF190, "VIN",               "",     lambda d: d.decode("ascii", errors="replace").rstrip("\x00")),
    (0xF18C, "ECU Serial Number", "",     lambda d: d.decode("ascii", errors="replace").rstrip("\x00")),
    (0xF189, "Software Version",  "",     lambda d: d.decode("ascii", errors="replace").rstrip("\x00")),
    (0x2001, "Engine Load",       "%",    lambda d: round(d[0] * 100 / 255)),
    (0x2002, "Coolant Temp",      "°C",  lambda d: d[0] - 40),
    (0x2003, "Engine RPM",        "rpm",  lambda d: ((d[0] << 8) | d[1]) // 4),
    (0x2004, "Vehicle Speed",     "km/h", lambda d: d[0]),
    (0x2005, "Throttle Position", "%",    lambda d: round(d[0] * 100 / 255)),
    (0x2006, "Fuel Level",        "%",    lambda d: round(d[0] * 100 / 255)),
    (0x2007, "Engine Oil Temp",   "°C",  lambda d: d[0] - 40),
    (0x2008, "Battery Voltage",   "V",    lambda d: round(((d[0] << 8) | d[1]) / 1000, 2)),
]
_STANDARD_DIDS  = _UDS_DIDS[:3]
_EXTENDED_DIDS  = _UDS_DIDS[3:]

_uds_session_type = 1  # 1=default, 3=extended


def _uds_send_recv(transport, payload: bytes) -> bytes:
    transport.send(payload)
    return transport.receive()


def _uds_check_nrc(raw: bytes, service: int) -> None:
    if raw and raw[0] == _UDS_NRC:
        nrc = raw[2] if len(raw) >= 3 else 0x00
        nrc_names = {
            0x11: "serviceNotSupported",
            0x12: "subFunctionNotSupported",
            0x22: "conditionsNotCorrect",
            0x31: "requestOutOfRange",
            0x33: "securityAccessDenied",
        }
        raise RuntimeError(f"NRC 0x{nrc:02X} ({nrc_names.get(nrc, 'unknown')}) for service 0x{service:02X}")


def _setup_transport_logger() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s", datefmt="%H:%M:%S"))
    log = logging.getLogger("transport")
    log.setLevel(logging.INFO)
    log.addHandler(handler)
    log.propagate = False

_MENU = """\
  [1]  Live data          (5 core PIDs, single snapshot)
  [2]  Extended live data (all PIDs, skips unsupported)
  [3]  Read DTCs
  [4]  Clear DTCs
  [5]  Read VIN
  [6]  Live monitor       (5 core PIDs, continuous)
  [7]  UDS — change session
  [8]  UDS — read standard DIDs (VIN / Serial / SW)
  [9]  UDS — read extended DIDs (requires extended session)
  [p]  Probe supported PIDs
  [0]  Exit"""

_MONITOR_PIDS = [0x05, 0x04, 0x0C, 0x0D, 0x11]
_MONITOR_PID_SET = frozenset(_MONITOR_PIDS)


def _option_live_data(session: LoggedDiagnosticSession) -> None:
    rows = [
        ("RPM",          session.get_engine_rpm(),        "rpm"),
        ("Coolant Temp", session.get_coolant_temp(),      "°C"),
        ("Speed",        session.get_vehicle_speed(),     "km/h"),
        ("Throttle Pos", session.get_throttle_position(), "%"),
        ("Engine Load",  session.get_engine_load(),       "%"),
    ]
    print(_SEP)
    for label, value, unit in rows:
        print(f"  {label:<22} : {value:>8.2f} {unit}")


def _option_extended_live_data(session: LoggedDiagnosticSession) -> None:
    print(_SEP)
    samples = session.get_snapshot()
    if not samples:
        print("  No PIDs responded.")
        return
    for s in samples:
        print(f"  {s.name:<30} : {s.value:>8.2f} {s.unit}")
    print(f"  ({len(samples)} PIDs)")


def _option_read_dtcs(session: LoggedDiagnosticSession) -> None:
    dtcs = session.get_dtcs()
    print(_SEP)
    if not dtcs:
        print("  No DTCs stored.")
    else:
        for dtc in dtcs:
            print(f"  [{dtc.code}]  {dtc.description}")


def _option_clear_dtcs(session: LoggedDiagnosticSession) -> None:
    print(_SEP)
    answer = input("  Clear all DTCs? (y/N): ")
    if answer.strip().lower() == "y":
        session.clear_dtcs()
        print("  DTCs cleared successfully.")
    else:
        print("  Cancelled.")


def _option_read_vin(session: LoggedDiagnosticSession) -> None:
    vin = session.get_vin()
    print(_SEP)
    print(f"  VIN: {vin}")


def _option_uds_session(log_transport: LoggingTransport) -> None:
    global _uds_session_type
    print(_SEP)
    print("  [1] Default session (0x01)")
    print("  [2] Extended session (0x03)")
    choice = input("  Select: ").strip()
    subf = 0x03 if choice == "2" else 0x01
    raw = _uds_send_recv(log_transport, bytes([_UDS_DSC, subf]))
    _uds_check_nrc(raw, _UDS_DSC)
    if len(raw) < 6 or raw[0] != 0x50:
        raise RuntimeError(f"Unexpected DSC response: {raw.hex()}")
    _uds_session_type = raw[1]
    p2_ms    = (raw[2] << 8) | raw[3]
    p2ext_ms = (raw[4] << 8) | raw[5]
    label = "extended" if _uds_session_type == 3 else "default"
    print(f"  Session: {label}  P2={p2_ms}ms  P2ext={p2ext_ms}ms")


def _option_uds_read_dids(log_transport: LoggingTransport, dids: list) -> None:
    print(_SEP)
    for did_int, name, unit, decoder in dids:
        request = bytes([_UDS_RDBI, (did_int >> 8) & 0xFF, did_int & 0xFF])
        try:
            raw = _uds_send_recv(log_transport, request)
            _uds_check_nrc(raw, _UDS_RDBI)
            if len(raw) < 3 or raw[0] != 0x62:
                raise RuntimeError(f"Bad response: {raw.hex()}")
            value = decoder(raw[3:])
            suffix = f" {unit}" if unit else ""
            print(f"  [0x{did_int:04X}]  {name:<22} : {value}{suffix}")
        except Exception as exc:
            print(f"  [0x{did_int:04X}]  {name:<22} : ERROR — {exc}")


def _option_live_monitor(
    session: LoggedDiagnosticSession,
    logger: SqliteDataLogger,
    session_id: int,
    log_transport: LoggingTransport,
) -> None:
    latest: dict[int, MonitorSample] = {}
    lock = threading.Lock()
    samples_this_cycle = [0]

    def _print_frame() -> None:
        ts = time.strftime("%H:%M:%S")
        print(f"\n{_SEP}  {ts}")
        for pid in _MONITOR_PIDS:
            s = latest[pid]
            print(f"  {s.name:<30} : {s.value:>8.2f} {s.unit}")
        print(_SEP)
        sys.stdout.flush()

    def on_sample(s: MonitorSample) -> None:
        logger.log_sample(session_id, s)
        with lock:
            latest[s.pid] = s
            samples_this_cycle[0] += 1
            if samples_this_cycle[0] >= len(_MONITOR_PIDS):
                samples_this_cycle[0] = 0
                _print_frame()

    def on_error(pid: int, exc: Exception) -> None:
        print(f"  [WARN] PID 0x{pid:02X}: {exc}")

    monitor = LiveDataMonitor(
        transport=log_transport,
        decoder=Obd2DataDecoder(),
        pid_ids=_MONITOR_PID_SET,
        interval_ms=500,
        on_sample=on_sample,
        on_error=on_error,
    )
    print("  Live monitor started — press Enter to stop.")
    with monitor:
        input()
    print("  Live monitor stopped.")


def _option_probe_pids(log_transport: LoggingTransport) -> None:
    print(_SEP)
    print("  Probing PIDs — please wait...")

    # Step 1: collect declared PIDs via OBD2 availability bitmasks
    declared: set[int] = set()
    for support_pid in (0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0, 0xE0):
        try:
            log_transport.send(bytes([0x01, support_pid]))
            raw = log_transport.receive()
            if len(raw) >= 6 and raw[0] == 0x41 and raw[1] == support_pid:
                mask = (raw[2] << 24) | (raw[3] << 16) | (raw[4] << 8) | raw[5]
                for i in range(32):
                    if mask & (0x80000000 >> i):
                        declared.add(support_pid + i + 1)
                if not (mask & 0x01):
                    break
        except Exception:
            break

    # Step 2: real poll each declared PID to confirm it actually responds
    confirmed: list[tuple[int, str, str]] = []
    for pid in sorted(declared):
        try:
            log_transport.send(bytes([0x01, pid]))
            raw = log_transport.receive()
            if len(raw) >= 2 and raw[0] == 0x41 and raw[1] == pid:
                name = PIDS[pid].name if pid in PIDS else f"PID_0x{pid:02X}"
                unit = PIDS[pid].unit if pid in PIDS else ""
                confirmed.append((pid, name, unit))
        except Exception:
            pass

    print(_SEP)
    if not confirmed:
        print("  No PIDs responded.")
        return
    for pid, name, unit in confirmed:
        known = "" if pid in PIDS else "  *"
        suffix = f" ({unit})" if unit else ""
        print(f"  [0x{pid:02X}]  {name:<32}{suffix}{known}")
    print(f"\n  {len(confirmed)} PIDs confirmed ({len(declared)} declared by ECU).")
    unknown = [pid for pid, _, _ in confirmed if pid not in PIDS]
    if unknown:
        print(f"  * {len(unknown)} without decoder — not monitorable")


def run_menu(
    session: LoggedDiagnosticSession,
    logger: SqliteDataLogger,
    session_id: int,
    log_transport: LoggingTransport,
) -> None:
    handlers = {
        "1": lambda: _option_live_data(session),
        "2": lambda: _option_extended_live_data(session),
        "3": lambda: _option_read_dtcs(session),
        "4": lambda: _option_clear_dtcs(session),
        "5": lambda: _option_read_vin(session),
        "6": lambda: _option_live_monitor(session, logger, session_id, log_transport),
        "7": lambda: _option_uds_session(log_transport),
        "8": lambda: _option_uds_read_dids(log_transport, _STANDARD_DIDS),
        "9": lambda: _option_uds_read_dids(log_transport, _EXTENDED_DIDS),
        "p": lambda: _option_probe_pids(log_transport),
    }

    while True:
        print()
        session_label = "extended" if _uds_session_type == 3 else "default"
        print(f"  UDS session: {session_label}")
        print(_MENU)
        choice = input("\n  Select option: ").strip()

        if choice == "0":
            print("  Goodbye.")
            break

        handler = handlers.get(choice)
        if handler is None:
            print("  Unknown option — enter 0-9.")
            continue

        try:
            handler()
        except (NrcException, DiagnosticTimeoutError, InvalidResponseError) as e:
            print(f"  [ERROR] {e}")
        except RuntimeError as e:
            print(f"  [ERROR] {e}")


if __name__ == "__main__":
    _setup_transport_logger()
    parser = argparse.ArgumentParser(description="VAG OBD-II Diagnostic CLI")
    parser.add_argument("--mock",    action="store_true", help="Use mock transport (no hardware)")
    parser.add_argument("--channel", default="can0",      help="SocketCAN interface (default: can0)")
    args = parser.parse_args()

    if args.mock:
        raw_transport = MockTransport()
        banner_transport = "MockTransport (demo mode)"
    else:
        raw_transport = IsoTpTransport(channel=args.channel)
        banner_transport = f"IsoTpTransport ({args.channel})"

    print(f"""\
╔══════════════════════════════════════════════╗
║  VAG Group OBD-II Diagnostic Tool           ║
║  Transport: {banner_transport:<33}║
║  Logging:   diagnostics.db                  ║
╚══════════════════════════════════════════════╝""")

    log_transport = LoggingTransport(raw_transport)
    _db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "diagnostics.db"))
    logger = SqliteDataLogger(_db_path)
    session_id = logger.start_session(f"CLI {banner_transport}")
    print(f"  [LOG] Session #{session_id} → {_db_path}")

    inner = DiagnosticSession(log_transport, Obd2ProtocolBuilder(), Obd2DataDecoder())
    session = LoggedDiagnosticSession(inner, logger, session_id, log_transport)

    try:
        with session:
            run_menu(session, logger, session_id, log_transport)
    finally:
        logger.end_session(session_id)
        logger.close()
        print(f"  [LOG] Session #{session_id} closed.")

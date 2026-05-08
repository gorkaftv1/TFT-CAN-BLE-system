"""BLE OBD-II server entry point for Raspberry Pi.

Usage:
    python scripts/server.py
    python scripts/server.py --mock    # No CAN hardware

Prerequisites on Raspberry Pi:
    sudo apt install libbluetooth-dev bluez
    pip install bless
"""

from __future__ import annotations

import asyncio
import logging
import logging.handlers
import os
import sys
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Console: INFO and above, clean format
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

# Rotating file: DEBUG and above — captures all BLE RX/TX
_file_handler = logging.handlers.RotatingFileHandler(
    "ble_comms.log",
    maxBytes=5 * 1024 * 1024,  # 5 MB per file
    backupCount=3,
    encoding="utf-8",
)
_file_handler.setLevel(logging.DEBUG)
_file_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
logging.getLogger().addHandler(_file_handler)

import argparse

from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from infraestructure.logging.sqlite_logger import SqliteDataLogger
from infraestructure.protocol.obd2_builder import Obd2ProtocolBuilder
from infraestructure.transport.isotp_transport import IsoTpTransport
from infraestructure.transport.logging_transport import LoggingTransport
from infraestructure.transport.mock_transport import MockTransport
from session.diagnostic_session import DiagnosticSession
from session.logged_diagnostic_session import LoggedDiagnosticSession
from server.bluetooth_server import BLEDiagServer
from server.bt_command_handler import BtCommandHandler

_DB_PATH = "diagnostics.db"
_TOKEN_FILE = os.path.expanduser("~/.seat_diag_token")
_DEFAULT_TOKEN = "1234"


def _load_auth_token() -> str:
    if token := os.environ.get("BLE_AUTH_TOKEN", "").strip():
        return token
    try:
        token = open(_TOKEN_FILE).read().strip()
        if token:
            return token
    except FileNotFoundError:
        pass
    return _DEFAULT_TOKEN


async def main(mock: bool) -> None:
    print("╔══════════════════════════════════════════════╗")
    print("║  SEAT Ibiza 6J — BLE OBD-II Server          ║")
    print(f"║  Transport: {'MockTransport' if mock else 'IsoTpTransport (can0)  ':<33}║")
    print("║  Logging:   diagnostics.db + ble_comms.log  ║")
    print("╚══════════════════════════════════════════════╝")

    auth_token = _load_auth_token()
    token_src = "env" if os.environ.get("BLE_AUTH_TOKEN") else (_TOKEN_FILE if os.path.exists(_TOKEN_FILE) else "default")
    print(f"[BLE] Auth token loaded from: {token_src}")

    if mock:
        raw_transport = MockTransport()
    else:
        raw_transport = IsoTpTransport(channel="can0", tx_id=0x7E0, rx_id=0x7E8)

    log_transport = LoggingTransport(raw_transport)
    transport_lock = threading.Lock()

    logger_db = SqliteDataLogger(_DB_PATH)
    session_id = logger_db.start_session(f"BLE {'mock' if mock else 'real'} session")
    print(f"[LOG] Session #{session_id} → {_DB_PATH}")

    inner_session = DiagnosticSession(log_transport, Obd2ProtocolBuilder(), Obd2DataDecoder())
    session = LoggedDiagnosticSession(inner_session, logger_db, session_id, log_transport)

    handler = BtCommandHandler(
        session=session,
        logger=logger_db,
        session_id=session_id,
        transport=log_transport,
        transport_lock=transport_lock,
        auth_token=auth_token,
    )
    ble_server = BLEDiagServer(handler)
    handler.set_push_callback(ble_server.notify)

    try:
        with session:
            await ble_server.start()
    finally:
        logger_db.end_session(session_id)
        logger_db.close()
        print(f"[LOG] Session #{session_id} closed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BLE OBD-II Server")
    parser.add_argument("--mock", action="store_true", help="Use mock transport (no CAN hardware)")
    args = parser.parse_args()
    asyncio.run(main(mock=args.mock))

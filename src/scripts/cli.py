"""OBD-II diagnostic CLI.

Run: python scripts/cli.py
Uses MockTransport by default. Swap in IsoTpTransport for real hardware.
"""

from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.exceptions import DiagnosticTimeoutError, InvalidResponseError, NrcException
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from infraestructure.protocol.obd2_builder import Obd2ProtocolBuilder
from infraestructure.transport.mock_transport import MockTransport
from session.diagnostic_session import DiagnosticSession

_BANNER = """\
╔══════════════════════════════════════════════╗
║     OBD-II Diagnostic Tool                  ║
║     Transport: MockTransport (demo mode)     ║
╚══════════════════════════════════════════════╝"""

_SEP = "─" * 48

_MENU = """\
  [1]  Live data          (5 core PIDs)
  [2]  Extended live data (all PIDs)
  [3]  Read DTCs
  [4]  Clear DTCs
  [5]  Read VIN
  [0]  Exit"""


def _option_live_data(session: DiagnosticSession) -> None:
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


def _option_extended_live_data(session: DiagnosticSession) -> None:
    print(_SEP)
    for sample in session.get_snapshot():
        print(f"  {sample.name:<30} : {sample.value:>8.2f} {sample.unit}")


def _option_read_dtcs(session: DiagnosticSession) -> None:
    dtcs = session.get_dtcs()
    print(_SEP)
    if not dtcs:
        print("  No DTCs stored.")
    else:
        for dtc in dtcs:
            print(f"  [{dtc.code}]  {dtc.description}")


def _option_clear_dtcs(session: DiagnosticSession) -> None:
    print(_SEP)
    if input("  Clear all DTCs? (y/N): ").strip().lower() == "y":
        session.clear_dtcs()
        print("  DTCs cleared.")
    else:
        print("  Cancelled.")


def _option_read_vin(session: DiagnosticSession) -> None:
    print(_SEP)
    print(f"  VIN: {session.get_vin()}")


def run_menu(session: DiagnosticSession) -> None:
    """Run the interactive menu loop until the user selects 0."""
    handlers = {
        "1": lambda: _option_live_data(session),
        "2": lambda: _option_extended_live_data(session),
        "3": lambda: _option_read_dtcs(session),
        "4": lambda: _option_clear_dtcs(session),
        "5": lambda: _option_read_vin(session),
    }
    while True:
        print(f"\n{_MENU}")
        choice = input("\n  Select option: ").strip()
        if choice == "0":
            print("  Goodbye.")
            break
        handler = handlers.get(choice)
        if handler is None:
            print("  Unknown option.")
            continue
        try:
            handler()
        except (NrcException, DiagnosticTimeoutError, InvalidResponseError) as e:
            print(f"  [ERROR] {e}")


if __name__ == "__main__":
    print(_BANNER)
    transport = MockTransport()
    session = DiagnosticSession(transport, Obd2ProtocolBuilder(), Obd2DataDecoder())
    with session:
        run_menu(session)

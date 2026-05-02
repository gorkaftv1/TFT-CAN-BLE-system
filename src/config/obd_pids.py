"""SAE J1979 OBD-II PID definitions. All formulas conform to SAE J1979 / ISO 15031-5."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class PidDefinition:
    """Descriptor for a single Mode 0x01 PID.

    decode: lambda(raw: bytes) -> float where raw[0]=mode echo (0x41),
    raw[1]=PID echo, raw[2:]=payload data.
    """

    pid: int
    name: str
    request: bytes
    unit: str
    response_bytes: int
    decode: Callable[[bytes], float]


# --- Request constants ---

VIN_PID_REQUEST: bytes   = b"\x09\x02"
READ_DTCS_REQUEST: bytes = b"\x03"
CLEAR_DTCS_REQUEST: bytes = b"\x04"

# --- Mode 0x01 PID registry ---

PIDS: dict[int, PidDefinition] = {
    0x04: PidDefinition(
        pid=0x04, name="Engine Load", request=b"\x01\x04", unit="%",
        response_bytes=3, decode=lambda raw: (raw[2] * 100) / 255,
    ),
    0x05: PidDefinition(
        pid=0x05, name="Coolant Temp", request=b"\x01\x05", unit="°C",
        response_bytes=3, decode=lambda raw: float(raw[2] - 40),
    ),
    0x06: PidDefinition(
        pid=0x06, name="Short Fuel Trim Bank 1", request=b"\x01\x06", unit="%",
        response_bytes=3, decode=lambda raw: (raw[2] * 100 / 128) - 100,
    ),
    0x07: PidDefinition(
        pid=0x07, name="Long Fuel Trim Bank 1", request=b"\x01\x07", unit="%",
        response_bytes=3, decode=lambda raw: (raw[2] * 100 / 128) - 100,
    ),
    0x0C: PidDefinition(
        pid=0x0C, name="Engine RPM", request=b"\x01\x0C", unit="rpm",
        response_bytes=4, decode=lambda raw: ((raw[2] << 8) | raw[3]) / 4,
    ),
    0x0D: PidDefinition(
        pid=0x0D, name="Vehicle Speed", request=b"\x01\x0D", unit="km/h",
        response_bytes=3, decode=lambda raw: float(raw[2]),
    ),
    0x0E: PidDefinition(
        pid=0x0E, name="Timing Advance", request=b"\x01\x0E", unit="°",
        response_bytes=3, decode=lambda raw: (raw[2] / 2) - 64,
    ),
    0x0F: PidDefinition(
        pid=0x0F, name="Intake Air Temp", request=b"\x01\x0F", unit="°C",
        response_bytes=3, decode=lambda raw: float(raw[2] - 40),
    ),
    0x10: PidDefinition(
        pid=0x10, name="MAF Air Flow Rate", request=b"\x01\x10", unit="g/s",
        response_bytes=4, decode=lambda raw: ((raw[2] << 8) | raw[3]) / 100,
    ),
    0x11: PidDefinition(
        pid=0x11, name="Throttle Position", request=b"\x01\x11", unit="%",
        response_bytes=3, decode=lambda raw: (raw[2] * 100) / 255,
    ),
    0x1F: PidDefinition(
        pid=0x1F, name="Runtime Since Start", request=b"\x01\x1F", unit="seconds",
        response_bytes=4, decode=lambda raw: float((raw[2] << 8) | raw[3]),
    ),
    0x23: PidDefinition(
        pid=0x23, name="Fuel Rail Pressure", request=b"\x01\x23", unit="kPa",
        response_bytes=4, decode=lambda raw: float(((raw[2] << 8) | raw[3]) * 10),
    ),
    0x2F: PidDefinition(
        pid=0x2F, name="Fuel Level", request=b"\x01\x2F", unit="%",
        response_bytes=3, decode=lambda raw: (raw[2] * 100) / 255,
    ),
    0x31: PidDefinition(
        pid=0x31, name="Distance Since DTC Clear", request=b"\x01\x31", unit="km",
        response_bytes=4, decode=lambda raw: float((raw[2] << 8) | raw[3]),
    ),
    0x33: PidDefinition(
        pid=0x33, name="Barometric Pressure", request=b"\x01\x33", unit="kPa",
        response_bytes=3, decode=lambda raw: float(raw[2]),
    ),
    0x42: PidDefinition(
        pid=0x42, name="Control Module Voltage", request=b"\x01\x42", unit="V",
        response_bytes=4, decode=lambda raw: ((raw[2] << 8) | raw[3]) / 1000,
    ),
    0x46: PidDefinition(
        pid=0x46, name="Ambient Air Temp", request=b"\x01\x46", unit="°C",
        response_bytes=3, decode=lambda raw: float(raw[2] - 40),
    ),
    0x5C: PidDefinition(
        pid=0x5C, name="Engine Oil Temp", request=b"\x01\x5C", unit="°C",
        response_bytes=3, decode=lambda raw: float(raw[2] - 40),
    ),
    0x0A: PidDefinition(
        pid=0x0A, name="Fuel Pressure", request=b"\x01\x0A", unit="kPa",
        response_bytes=3, decode=lambda raw: float(raw[2] * 3),
    ),
    0x0B: PidDefinition(
        pid=0x0B, name="Intake MAP", request=b"\x01\x0B", unit="kPa",
        response_bytes=3, decode=lambda raw: float(raw[2]),
    ),
    0x43: PidDefinition(
        pid=0x43, name="Absolute Load", request=b"\x01\x43", unit="%",
        response_bytes=4, decode=lambda raw: ((raw[2] << 8) | raw[3]) * 100 / 255,
    ),
    0x47: PidDefinition(
        pid=0x47, name="Throttle Position B", request=b"\x01\x47", unit="%",
        response_bytes=3, decode=lambda raw: (raw[2] * 100) / 255,
    ),
    0x49: PidDefinition(
        pid=0x49, name="Accelerator Pedal D", request=b"\x01\x49", unit="%",
        response_bytes=3, decode=lambda raw: (raw[2] * 100) / 255,
    ),
    0x4A: PidDefinition(
        pid=0x4A, name="Accelerator Pedal E", request=b"\x01\x4A", unit="%",
        response_bytes=3, decode=lambda raw: (raw[2] * 100) / 255,
    ),
    0x5E: PidDefinition(
        pid=0x5E, name="Engine Fuel Rate", request=b"\x01\x5E", unit="L/h",
        response_bytes=4, decode=lambda raw: ((raw[2] << 8) | raw[3]) / 20,
    ),
}

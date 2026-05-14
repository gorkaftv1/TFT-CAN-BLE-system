"""UDS (ISO 14229-1) Data Identifier definitions.

Wire encoding mirrors the Arduino simulator:
  - percent values: uint8  encoded as raw*255/100
  - temperatures:   int16  BE, °C direct
  - RPM:            uint16 BE, rpm direct
  - voltage:        uint16 BE, mV
  - ASCII fields:   raw bytes decoded as ASCII
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class DidDefinition:
    did: int
    name: str
    unit: str
    response_bytes: int   # total response bytes including [0x62, DID_H, DID_L]
    decode: Callable[[bytes], object]
    extended_only: bool = False


# Offset in response where data starts: after [0x62, DID_H, DID_L]
_D = 3

DIDS: dict[int, DidDefinition] = {
    # --- ISO 14229-1 standard DIDs (Default + Extended) ---
    0xF190: DidDefinition(
        did=0xF190, name="VIN", unit="",
        response_bytes=20,
        decode=lambda raw: raw[_D:_D + 17].decode("ascii", errors="replace"),
    ),
    0xF18C: DidDefinition(
        did=0xF18C, name="ECU Serial Number", unit="",
        response_bytes=7,
        decode=lambda raw: raw[_D:_D + 4].decode("ascii", errors="replace"),
    ),
    0xF189: DidDefinition(
        did=0xF189, name="Software Version", unit="",
        response_bytes=7,
        decode=lambda raw: raw[_D:_D + 4].decode("ascii", errors="replace"),
    ),

    # --- Proprietary live-data DIDs (Extended session only) ---
    0x2001: DidDefinition(
        did=0x2001, name="Engine Load", unit="%",
        response_bytes=4,
        decode=lambda raw: round((raw[_D] * 100) / 255, 1),
        extended_only=True,
    ),
    0x2002: DidDefinition(
        did=0x2002, name="Coolant Temp", unit="°C",
        response_bytes=5,
        decode=lambda raw: int.from_bytes(raw[_D:_D + 2], "big", signed=True),
        extended_only=True,
    ),
    0x2003: DidDefinition(
        did=0x2003, name="Engine RPM", unit="rpm",
        response_bytes=5,
        decode=lambda raw: int.from_bytes(raw[_D:_D + 2], "big", signed=False),
        extended_only=True,
    ),
    0x2004: DidDefinition(
        did=0x2004, name="Vehicle Speed", unit="km/h",
        response_bytes=4,
        decode=lambda raw: int(raw[_D]),
        extended_only=True,
    ),
    0x2005: DidDefinition(
        did=0x2005, name="Throttle Position", unit="%",
        response_bytes=4,
        decode=lambda raw: round((raw[_D] * 100) / 255, 1),
        extended_only=True,
    ),
    0x2006: DidDefinition(
        did=0x2006, name="Fuel Level", unit="%",
        response_bytes=4,
        decode=lambda raw: round((raw[_D] * 100) / 255, 1),
        extended_only=True,
    ),
    0x2007: DidDefinition(
        did=0x2007, name="Engine Oil Temp", unit="°C",
        response_bytes=5,
        decode=lambda raw: int.from_bytes(raw[_D:_D + 2], "big", signed=True),
        extended_only=True,
    ),
    0x2008: DidDefinition(
        did=0x2008, name="Battery Voltage", unit="V",
        response_bytes=5,
        decode=lambda raw: int.from_bytes(raw[_D:_D + 2], "big", signed=False) / 1000,
        extended_only=True,
    ),
}

# UDS session type constants (mirrors Arduino UDS_SESSION_*)
UDS_SESSION_DEFAULT:     int = 0x01
UDS_SESSION_PROGRAMMING: int = 0x02
UDS_SESSION_EXTENDED:    int = 0x03

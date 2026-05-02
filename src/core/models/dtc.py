"""Domain model for Diagnostic Trouble Codes (DTCs)."""

from __future__ import annotations

from dataclasses import dataclass, field

# Bits 15-14 of the 2-byte DTC word → category prefix
_DTC_PREFIX: dict[int, str] = {
    0b00: "P",
    0b01: "C",
    0b10: "B",
    0b11: "U",
}


@dataclass(frozen=True)
class Dtc:
    """Immutable representation of a single SAE J1979 DTC."""

    code: str
    raw_bytes: bytes
    description: str = field(default="")

    def __str__(self) -> str:
        return f"{self.code} - {self.description}"

    @classmethod
    def from_raw(cls, raw: bytes) -> Dtc:
        """Decode a 2-byte SAE J1979 DTC word into a Dtc instance.

        Bit layout: [15-14] category, [13-12] digit1, [11-8] digit2,
        [7-4] digit3, [3-0] digit4.
        """
        if len(raw) != 2:
            raise ValueError(f"DTC raw bytes must be exactly 2 bytes, got {len(raw)}")
        prefix = _DTC_PREFIX[(raw[0] >> 6) & 0x03]
        digit1 = (raw[0] >> 4) & 0x03
        digit2 = raw[0] & 0x0F
        digit3 = (raw[1] >> 4) & 0x0F
        digit4 = raw[1] & 0x0F
        code = f"{prefix}{digit1}{digit2:X}{digit3:X}{digit4:X}"
        return cls(code=code, raw_bytes=bytes(raw))

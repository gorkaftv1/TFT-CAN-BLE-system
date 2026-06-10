from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ObdResponse:

    mode: int
    pid: int
    data: bytes
    is_positive: bool

    def __len__(self) -> int:
        return len(self.data)

    def __repr__(self) -> str:
        return (
            f"ObdResponse(mode=0x{self.mode:02X}, pid=0x{self.pid:02X}, "
            f"data={self.data.hex(' ').upper()!r}, is_positive={self.is_positive})"
        )

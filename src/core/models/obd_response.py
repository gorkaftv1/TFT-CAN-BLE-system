from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ObdResponse:

    mode: int
    pid: int
    data: bytes
    is_positive: bool

    def __len__(self) -> int:
        ...

    def __repr__(self) -> str:
        ...

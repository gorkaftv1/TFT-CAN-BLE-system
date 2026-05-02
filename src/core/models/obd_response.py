"""Immutable value object wrapping a parsed positive ECU response frame."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ObdResponse:
    """Parsed positive response from the ECU (mode echo, PID echo, data bytes)."""

    mode: int
    pid: int
    data: bytes
    is_positive: bool

    def __len__(self) -> int:
        ...

    def __repr__(self) -> str:
        ...

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LogSession:
    session_id: int
    label: str
    started_at: str
    ended_at: str | None  # None while session is still open
    sample_count: int
    dtc_count: int

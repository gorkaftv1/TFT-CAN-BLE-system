from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MonitorSample:
    pid: int
    name: str
    value: float
    unit: str
    timestamp: float        # time.monotonic() — immune to clock adjustments
    wall_ts: str = ""       # ISO-8601 UTC wall clock time

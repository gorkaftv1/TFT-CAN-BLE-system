from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MonitorSample:
    pid: int
    name: str
    value: float
    unit: str
    timestamp: float        # time.monotonic() — immune to clock adjustments
    wall_ts: str | None = None  # ISO 8601 UTC — populated when loaded from DB

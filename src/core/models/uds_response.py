from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class UdsResponse:

    sid: int       # service ID that was requested
    data: bytes    # payload after [response_sid, ...]
    is_positive: bool

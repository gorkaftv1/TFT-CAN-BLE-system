from dataclasses import dataclass


@dataclass(frozen=True)
class CommandLog:
    command: str       # human-readable name: "get_dtcs", "get_engine_rpm", etc.
    request_hex: str   # request bytes as hex string, e.g. "0103"
    response_hex: str  # response bytes as hex string
    timestamp: str     # ISO 8601 wall-clock

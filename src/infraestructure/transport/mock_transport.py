"""In-memory mock transport for testing — no CAN hardware required."""

from __future__ import annotations

from types import TracebackType

from core.exceptions import DiagnosticTimeoutError
from core.interfaces.i_transport import ITransport

# Generic ECU at idle (RPM=850, engine cold, no DTCs)
DEFAULT_RESPONSES: dict[bytes, bytes] = {
    b"\x01\x04": b"\x41\x04\x1A",
    b"\x01\x05": b"\x41\x05\x60",
    b"\x01\x06": b"\x41\x06\x82",
    b"\x01\x07": b"\x41\x07\x7E",
    b"\x01\x0C": b"\x41\x0C\x0D\x48",
    b"\x01\x0D": b"\x41\x0D\x00",
    b"\x01\x0E": b"\x41\x0E\x94",
    b"\x01\x0F": b"\x41\x0F\x3C",
    b"\x01\x10": b"\x41\x10\x00\x00",
    b"\x01\x11": b"\x41\x11\x00",
    b"\x01\x1F": b"\x41\x1F\x00\x00",
    b"\x01\x23": b"\x41\x23\x00\x00",
    b"\x01\x2F": b"\x41\x2F\xA6",
    b"\x01\x31": b"\x41\x31\x05\xDC",
    b"\x01\x33": b"\x41\x33\x65",
    b"\x01\x42": b"\x41\x42\x30\x9A",
    b"\x01\x46": b"\x41\x46\x3A",
    b"\x01\x5C": b"\x41\x5C\x3C",
    b"\x03":     b"\x43\x00",
    b"\x04":     b"\x44",
    b"\x09\x02": b"\x49\x02\x01WVWZZZ1KZAM000001",
    b"\x01\xFF": b"\x7F\x01\x11",
}


class MockTransport(ITransport):
    """ITransport backed by a static response map; replaces the CAN socket in tests."""

    def __init__(
        self,
        response_map: dict[bytes, bytes] | None = None,
        default_timeout: float = 1.0,
    ) -> None:
        self._responses: dict[bytes, bytes] = (
            dict(DEFAULT_RESPONSES) if response_map is None else dict(response_map)
        )
        self.default_timeout = default_timeout
        self._connected: bool = False
        self._last_sent: bytes | None = None

    def connect(self) -> None:
        if self._connected:
            raise ConnectionError("MockTransport is already connected.")
        self._connected = True

    def disconnect(self) -> None:
        self._connected = False

    def send(self, payload: bytes) -> None:
        if not self._connected:
            raise RuntimeError("Cannot send: MockTransport is not connected.")
        self._last_sent = payload

    def receive(self) -> bytes:
        if not self._connected:
            raise RuntimeError("Cannot receive: MockTransport is not connected.")
        if self._last_sent is None:
            raise RuntimeError("Cannot receive: no request has been sent yet.")
        response = self._responses.get(self._last_sent)
        if response is None:
            raise DiagnosticTimeoutError(
                f"No response for request: {self._last_sent.hex(' ').upper()}"
            )
        return response

    def __enter__(self) -> MockTransport:
        self.connect()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool | None:
        self.disconnect()
        return None

    def inject_response(self, request: bytes, response: bytes) -> None:
        """Add or override a single entry in the response map."""
        self._responses[request] = response

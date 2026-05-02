"""ISO-TP transport over a physical SocketCAN interface (Linux only)."""

from __future__ import annotations

import time
from types import TracebackType

import can
import isotp

from config.can_config import (
    CAN_RX_ID,
    CAN_TX_ID,
    ISOTP_CF_SEPARATION_MS,
    ISOTP_PADDING_BYTE,
)
from core.exceptions import DiagnosticTimeoutError
from core.interfaces.i_transport import ITransport


class IsoTpTransport(ITransport):
    """Concrete ITransport backed by python-can + can-isotp over socketcan."""

    def __init__(
        self,
        channel: str = "can0",
        tx_id: int = CAN_TX_ID,
        rx_id: int = CAN_RX_ID,
        timeout: float = 2.0,
    ) -> None:
        self._channel = channel
        self._timeout = timeout
        self._address = isotp.Address(
            addressing_mode=isotp.AddressingMode.Normal_11bits,
            txid=tx_id,
            rxid=rx_id,
        )
        self._params: dict = {
            "stmin": ISOTP_CF_SEPARATION_MS,
            "blocksize": 0,               # accept all frames without issuing FC
            "tx_padding": ISOTP_PADDING_BYTE,
        }
        self._stack: isotp.CanStack | None = None
        self._bus: can.BusABC | None = None

    def connect(self) -> None:
        if self._stack is not None:
            raise ConnectionError("IsoTpTransport is already connected.")
        self._bus = can.Bus(channel=self._channel, interface="socketcan")
        # Drain stale frames left in the kernel socket buffer from a previous session.
        while self._bus.recv(timeout=0) is not None:
            pass
        self._stack = isotp.CanStack(self._bus, address=self._address, params=self._params)
        self._flush_rx()

    def disconnect(self) -> None:
        if self._stack is None:
            return
        self._bus.shutdown()
        self._stack = None
        self._bus = None

    def _flush_rx(self) -> None:
        """Pump the ISO-TP stack and discard any already-queued messages."""
        assert self._stack is not None
        self._stack.process()
        while self._stack.available():
            self._stack.recv()
            self._stack.process()

    def send(self, payload: bytes) -> None:
        if self._stack is None:
            raise RuntimeError("Cannot send: IsoTpTransport is not connected.")
        self._flush_rx()
        self._stack.send(payload)
        while self._stack.transmitting():
            self._stack.process()
            time.sleep(0.001)

    def receive(self) -> bytes:
        if self._stack is None:
            raise RuntimeError("Cannot receive: IsoTpTransport is not connected.")
        deadline = time.monotonic() + self._timeout
        while time.monotonic() < deadline:
            self._stack.process()
            if self._stack.available():
                return self._stack.recv()
            time.sleep(0.001)
        raise DiagnosticTimeoutError(f"No response within {self._timeout:.1f}s.")

    def __enter__(self) -> IsoTpTransport:
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

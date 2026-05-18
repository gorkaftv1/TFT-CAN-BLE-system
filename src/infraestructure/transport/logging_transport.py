from __future__ import annotations

import logging
import threading
from types import TracebackType

from core.interfaces.i_transport import ITransport
from infraestructure.logging.frame_formatter import format_rx, format_tx

_log = logging.getLogger("transport")


class LoggingTransport(ITransport):
    # Thread-local storage so the live-monitor thread does not overwrite
    # the main thread's last_sent/last_received mid-log.
    def __init__(self, inner: ITransport) -> None:
        self._inner = inner
        self._local = threading.local()

    @property
    def last_sent(self) -> bytes:
        return getattr(self._local, "last_sent", b"")

    @property
    def last_received(self) -> bytes:
        return getattr(self._local, "last_received", b"")

    def connect(self) -> None:
        self._inner.connect()

    def disconnect(self) -> None:
        self._inner.disconnect()

    def send(self, payload: bytes) -> None:
        self._local.last_sent = payload
        _log.info(format_tx(payload))
        self._inner.send(payload)

    def receive(self) -> bytes:
        data = self._inner.receive()
        self._local.last_received = data
        _log.info(format_rx(data))
        return data

    def __enter__(self) -> LoggingTransport:
        self._inner.__enter__()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool | None:
        return self._inner.__exit__(exc_type, exc_val, exc_tb)

from __future__ import annotations

from abc import ABC, abstractmethod
from types import TracebackType


class ITransport(ABC):

    @abstractmethod
    def connect(self) -> None: ...

    @abstractmethod
    def disconnect(self) -> None: ...

    @abstractmethod
    def send(self, payload: bytes) -> None: ...

    @abstractmethod
    def receive(self) -> bytes: ...

    @abstractmethod
    def __enter__(self) -> ITransport: ...

    @abstractmethod
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool | None: ...

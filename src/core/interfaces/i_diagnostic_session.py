from __future__ import annotations

from abc import ABC, abstractmethod
from types import TracebackType

from core.interfaces.i_data_decoder import IDataDecoder
from core.interfaces.i_protocol_builder import IProtocolBuilder
from core.interfaces.i_transport import ITransport
from core.models.dtc import Dtc


class IDiagnosticSession(ABC):
    """Façade that coordinates transport, builder, and decoder."""

    def __init__(
        self,
        transport: ITransport,
        builder: IProtocolBuilder,
        decoder: IDataDecoder,
    ) -> None: ...

    @abstractmethod
    def open(self) -> None: ...

    @abstractmethod
    def close(self) -> None: ...

    def __enter__(self) -> IDiagnosticSession: ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool | None: ...

    @abstractmethod
    def get_engine_rpm(self) -> float: ...

    @abstractmethod
    def get_coolant_temp(self) -> float: ...

    @abstractmethod
    def get_vehicle_speed(self) -> float: ...

    @abstractmethod
    def get_throttle_position(self) -> float: ...

    @abstractmethod
    def get_engine_load(self) -> float: ...

    @abstractmethod
    def get_dtcs(self) -> list[Dtc]: ...

    @abstractmethod
    def clear_dtcs(self) -> None: ...

    @abstractmethod
    def get_vin(self) -> str: ...

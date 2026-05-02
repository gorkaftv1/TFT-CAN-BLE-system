from __future__ import annotations

from abc import ABC, abstractmethod

from core.exceptions import InvalidResponseError, NrcException  # noqa: F401
from core.models.dtc import Dtc
from core.models.obd_response import ObdResponse


class IDataDecoder(ABC):
    @abstractmethod
    def validate_response(self, raw: bytes, expected_mode: int) -> ObdResponse: ...

    @abstractmethod
    def decode_rpm(self, raw: bytes) -> float: ...

    @abstractmethod
    def decode_coolant_temp(self, raw: bytes) -> float: ...

    @abstractmethod
    def decode_vehicle_speed(self, raw: bytes) -> float: ...

    @abstractmethod
    def decode_throttle_position(self, raw: bytes) -> float: ...

    @abstractmethod
    def decode_engine_load(self, raw: bytes) -> float: ...

    @abstractmethod
    def decode_dtcs(self, raw: bytes) -> list[Dtc]: ...

    @abstractmethod
    def decode_vin(self, raw: bytes) -> str: ...

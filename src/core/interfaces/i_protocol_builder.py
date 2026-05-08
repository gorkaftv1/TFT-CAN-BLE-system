from __future__ import annotations

from abc import ABC, abstractmethod


class IProtocolBuilder(ABC):

    @abstractmethod
    def build_read_rpm_request(self) -> bytes: ...

    @abstractmethod
    def build_read_coolant_temp_request(self) -> bytes: ...

    @abstractmethod
    def build_read_vehicle_speed_request(self) -> bytes: ...

    @abstractmethod
    def build_read_throttle_position_request(self) -> bytes: ...

    @abstractmethod
    def build_read_engine_load_request(self) -> bytes: ...

    @abstractmethod
    def build_read_dtcs_request(self) -> bytes: ...

    @abstractmethod
    def build_clear_dtcs_request(self) -> bytes: ...

    @abstractmethod
    def build_read_vin_request(self) -> bytes: ...

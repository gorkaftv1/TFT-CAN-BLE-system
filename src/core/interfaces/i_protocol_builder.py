"""Abstract interface for building raw OBD-II request frames."""

from __future__ import annotations

from abc import ABC, abstractmethod


class IProtocolBuilder(ABC):
    """Pure factory: constructs OBD-II request byte sequences without I/O."""

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

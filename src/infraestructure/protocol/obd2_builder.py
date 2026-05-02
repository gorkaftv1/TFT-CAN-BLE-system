from __future__ import annotations

import config.obd_pids as _pids
from core.interfaces.i_protocol_builder import IProtocolBuilder


class Obd2ProtocolBuilder(IProtocolBuilder):

    def build_read_rpm_request(self) -> bytes:
        return _pids.PIDS[0x0C].request

    def build_read_coolant_temp_request(self) -> bytes:
        return _pids.PIDS[0x05].request

    def build_read_vehicle_speed_request(self) -> bytes:
        return _pids.PIDS[0x0D].request

    def build_read_throttle_position_request(self) -> bytes:
        return _pids.PIDS[0x11].request

    def build_read_engine_load_request(self) -> bytes:
        return _pids.PIDS[0x04].request

    def build_read_dtcs_request(self) -> bytes:
        return _pids.READ_DTCS_REQUEST

    def build_clear_dtcs_request(self) -> bytes:
        return _pids.CLEAR_DTCS_REQUEST

    def build_read_vin_request(self) -> bytes:
        return _pids.VIN_PID_REQUEST

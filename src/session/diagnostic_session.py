"""Concrete OBD-II diagnostic session: orchestrates transport, builder, and decoder."""

from __future__ import annotations

import time
from types import TracebackType

from config.obd_pids import PIDS
from core.exceptions import InvalidResponseError
from core.interfaces.i_data_decoder import IDataDecoder
from core.interfaces.i_diagnostic_session import IDiagnosticSession
from core.interfaces.i_protocol_builder import IProtocolBuilder
from core.interfaces.i_transport import ITransport
from core.models.dtc import Dtc
from core.models.monitor_sample import MonitorSample


class DiagnosticSession(IDiagnosticSession):
    """Implements the full send → receive → validate → decode pipeline."""

    def __init__(
        self,
        transport: ITransport,
        builder: IProtocolBuilder,
        decoder: IDataDecoder,
    ) -> None:
        self._transport = transport
        self._builder = builder
        self._decoder = decoder

    def open(self) -> None:
        self._transport.connect()

    def close(self) -> None:
        self._transport.disconnect()

    def __enter__(self) -> DiagnosticSession:
        self.open()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool | None:
        self.close()
        return None

    def get_engine_rpm(self) -> float:
        self._transport.send(self._builder.build_read_rpm_request())
        raw = self._transport.receive()
        self._decoder.validate_response(raw, expected_mode=0x01)
        return self._decoder.decode_rpm(raw)

    def get_coolant_temp(self) -> float:
        self._transport.send(self._builder.build_read_coolant_temp_request())
        raw = self._transport.receive()
        self._decoder.validate_response(raw, expected_mode=0x01)
        return self._decoder.decode_coolant_temp(raw)

    def get_vehicle_speed(self) -> float:
        self._transport.send(self._builder.build_read_vehicle_speed_request())
        raw = self._transport.receive()
        self._decoder.validate_response(raw, expected_mode=0x01)
        return self._decoder.decode_vehicle_speed(raw)

    def get_throttle_position(self) -> float:
        self._transport.send(self._builder.build_read_throttle_position_request())
        raw = self._transport.receive()
        self._decoder.validate_response(raw, expected_mode=0x01)
        return self._decoder.decode_throttle_position(raw)

    def get_engine_load(self) -> float:
        self._transport.send(self._builder.build_read_engine_load_request())
        raw = self._transport.receive()
        self._decoder.validate_response(raw, expected_mode=0x01)
        return self._decoder.decode_engine_load(raw)

    def get_dtcs(self) -> list[Dtc]:
        self._transport.send(self._builder.build_read_dtcs_request())
        raw = self._transport.receive()
        self._decoder.validate_response(raw, expected_mode=0x03)
        return self._decoder.decode_dtcs(raw)

    def clear_dtcs(self) -> None:
        self._transport.send(self._builder.build_clear_dtcs_request())
        raw = self._transport.receive()
        self._decoder.validate_response(raw, expected_mode=0x04)

    def get_snapshot(self) -> list[MonitorSample]:
        """Read all registered Mode 0x01 PIDs in a single pass."""
        _MAX_DRAIN = 10
        samples: list[MonitorSample] = []
        for pid_def in PIDS.values():
            self._transport.send(pid_def.request)
            raw = self._transport.receive()
            for _ in range(_MAX_DRAIN):
                if len(raw) < 2 or raw[1] == pid_def.pid:
                    break
                raw = self._transport.receive()
            self._decoder.validate_response(raw, expected_mode=0x01)
            if len(raw) >= 2 and raw[1] != pid_def.pid:
                raise InvalidResponseError(
                    f"PID echo mismatch for 0x{pid_def.pid:02X}: "
                    f"got 0x{raw[1]:02X} — raw: {bytes(raw).hex(' ').upper()}"
                )
            if len(raw) < pid_def.response_bytes:
                raise InvalidResponseError(
                    f"PID 0x{pid_def.pid:02X} too short: "
                    f"expected {pid_def.response_bytes}, got {len(raw)}"
                    f" — raw: {bytes(raw).hex(' ').upper()}"
                )
            samples.append(MonitorSample(
                pid=pid_def.pid,
                name=pid_def.name,
                value=pid_def.decode(raw),
                unit=pid_def.unit,
                timestamp=time.monotonic(),
            ))
        return samples

    def get_vin(self) -> str:
        self._transport.send(self._builder.build_read_vin_request())
        raw = self._transport.receive()
        self._decoder.validate_response(raw, expected_mode=0x09)
        return self._decoder.decode_vin(raw)

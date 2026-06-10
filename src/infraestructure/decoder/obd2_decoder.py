"""Concrete OBD-II response decoder backed by the config PID registry."""

from __future__ import annotations

import config.can_config as _cfg
import config.obd_pids as _pids
from core.exceptions import InvalidResponseError, NrcException
from core.interfaces.i_data_decoder import IDataDecoder
from core.models.dtc import Dtc
from core.models.obd_response import ObdResponse


class Obd2DataDecoder(IDataDecoder):
    """Validates raw ECU frames and delegates SAE J1979 math to the PID registry lambdas."""

    def validate_response(self, raw: bytes, expected_mode: int) -> ObdResponse:
        """Raise NrcException or InvalidResponseError; return ObdResponse on success."""
        if len(raw) < 1:
            raise InvalidResponseError(f"Response too short: got {len(raw)} bytes")
        if raw[0] == _cfg.OBD_NEGATIVE_PREFIX:
            if len(raw) < 3:
                raise InvalidResponseError(f"NRC frame too short: got {len(raw)} bytes")
            raise NrcException(mode=raw[1], nrc_code=raw[2])
        expected_echo = expected_mode + _cfg.OBD_POSITIVE_OFFSET
        if raw[0] != expected_echo:
            raise InvalidResponseError(
                f"Unexpected mode echo: got 0x{raw[0]:02X}, expected 0x{expected_echo:02X}"
            )
        return ObdResponse(
            mode=expected_mode,
            pid=raw[1] if len(raw) >= 2 else 0x00,
            data=raw[2:],
            is_positive=True,
        )

    @staticmethod
    def _check_length(raw: bytes, pid: int) -> None:
        """Raise InvalidResponseError if raw is shorter than the PID registry expects."""
        expected = _pids.PIDS[pid].response_bytes
        if len(raw) < expected:
            raise InvalidResponseError(
                f"PID 0x{pid:02X}: expected {expected} bytes, got {len(raw)}"
                f" — raw: {bytes(raw).hex(' ').upper()}"
            )

    def decode_rpm(self, raw: bytes) -> float:
        self._check_length(raw, 0x0C)
        return _pids.PIDS[0x0C].decode(raw)

    def decode_coolant_temp(self, raw: bytes) -> float:
        self._check_length(raw, 0x05)
        return _pids.PIDS[0x05].decode(raw)

    def decode_vehicle_speed(self, raw: bytes) -> float:
        self._check_length(raw, 0x0D)
        return _pids.PIDS[0x0D].decode(raw)

    def decode_throttle_position(self, raw: bytes) -> float:
        self._check_length(raw, 0x11)
        return _pids.PIDS[0x11].decode(raw)

    def decode_engine_load(self, raw: bytes) -> float:
        self._check_length(raw, 0x04)
        return _pids.PIDS[0x04].decode(raw)

    def decode_dtcs(self, raw: bytes) -> list[Dtc]:
        """Parse raw[1] DTC count, then decode each 2-byte DTC pair."""
        dtc_count = raw[1]
        if dtc_count == 0:
            return []
        dtcs: list[Dtc] = []
        for i in range(dtc_count):
            offset = 2 + i * 2
            pair = raw[offset: offset + 2]
            if len(pair) < 2 or pair == b"\x00\x00":
                continue
            dtcs.append(Dtc.from_raw(pair))
        return dtcs

    def decode_vin(self, raw: bytes) -> str:
        """Decode 17-char VIN from raw[3:20]; raise InvalidResponseError if not 17 chars."""
        try:
            vin = raw[3:20].decode("ascii")
        except UnicodeDecodeError as exc:
            raise InvalidResponseError(f"VIN contains non-ASCII bytes: {exc}") from exc
        if len(vin) != 17:
            raise InvalidResponseError(f"VIN length invalid: expected 17, got {len(vin)}")
        return vin

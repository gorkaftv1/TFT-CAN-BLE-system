"""UDS (ISO 14229-1) response decoder."""

from __future__ import annotations

import config.uds_dids as _dids
from core.exceptions import InvalidResponseError, NrcException
from core.models.uds_response import UdsResponse

_NEGATIVE_RESPONSE: int = 0x7F
_POSITIVE_OFFSET:   int = 0x40

_SID_SESSION_CTRL:    int = 0x10
_SID_READ_DATA_BY_ID: int = 0x22


class UdsDataDecoder:

    def validate_response(self, raw: bytes, expected_sid: int) -> UdsResponse:
        """Raise NrcException or InvalidResponseError; return UdsResponse on success."""
        if len(raw) < 1:
            raise InvalidResponseError(f"UDS response too short: {len(raw)} bytes")
        if raw[0] == _NEGATIVE_RESPONSE:
            if len(raw) < 3:
                raise InvalidResponseError(f"UDS NRC frame too short: {len(raw)} bytes")
            raise NrcException(mode=raw[1], nrc_code=raw[2])
        expected_echo = expected_sid + _POSITIVE_OFFSET
        if raw[0] != expected_echo:
            raise InvalidResponseError(
                f"UDS unexpected SID echo: got 0x{raw[0]:02X}, expected 0x{expected_echo:02X}"
            )
        return UdsResponse(sid=expected_sid, data=raw[1:], is_positive=True)

    def decode_session_info(self, response: UdsResponse) -> dict:
        """Decode DiagnosticSessionControl positive response payload.

        Payload after SID echo: [sessionType, P2_high, P2_low, P2ext_high, P2ext_low]
        """
        d = response.data
        if len(d) < 5:
            raise InvalidResponseError(f"Session response too short: {len(d)} bytes")
        session_type = d[0]
        p2_ms      = (d[1] << 8) | d[2]
        p2_ext_ms  = (d[3] << 8) | d[4]
        return {
            "session_type": session_type,
            "p2_server_ms": p2_ms,
            "p2_extended_ms": p2_ext_ms,
        }

    def decode_did(self, response: UdsResponse, did: int) -> object:
        """Decode ReadDataByIdentifier response for given DID.

        response.data layout after SID echo: [DID_H, DID_L, payload...]
        So full raw = [0x62, DID_H, DID_L, payload...], which is response.data prepended with SID.
        We reconstruct full raw to match the lambda offset convention in uds_dids.py.
        """
        if did not in _dids.DIDS:
            raise InvalidResponseError(f"Unknown DID: 0x{did:04X}")
        definition = _dids.DIDS[did]

        # Reconstruct full frame so lambdas using _D=3 work correctly
        full_raw = bytes([0x62]) + bytes(response.data)

        if len(full_raw) < definition.response_bytes:
            raise InvalidResponseError(
                f"DID 0x{did:04X}: expected {definition.response_bytes} bytes, got {len(full_raw)}"
            )
        return definition.decode(full_raw)

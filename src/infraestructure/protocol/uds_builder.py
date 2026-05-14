from __future__ import annotations

from config.uds_dids import UDS_SESSION_DEFAULT, UDS_SESSION_EXTENDED, UDS_SESSION_PROGRAMMING

_SID_SESSION_CTRL:    int = 0x10
_SID_READ_DATA_BY_ID: int = 0x22


class UdsProtocolBuilder:

    def build_session_control(self, session_type: int) -> bytes:
        """Build DiagnosticSessionControl request (SID 0x10)."""
        if session_type not in (UDS_SESSION_DEFAULT, UDS_SESSION_PROGRAMMING, UDS_SESSION_EXTENDED):
            raise ValueError(f"Unknown UDS session type: 0x{session_type:02X}")
        return bytes([_SID_SESSION_CTRL, session_type])

    def build_read_did(self, did: int) -> bytes:
        """Build ReadDataByIdentifier request (SID 0x22) for a 2-byte DID."""
        if not 0x0000 <= did <= 0xFFFF:
            raise ValueError(f"DID out of range: 0x{did:04X}")
        return bytes([_SID_READ_DATA_BY_ID, (did >> 8) & 0xFF, did & 0xFF])

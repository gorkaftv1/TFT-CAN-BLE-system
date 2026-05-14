"""UDS diagnostic session façade (ISO 14229-1).

Wraps ITransport with UdsProtocolBuilder + UdsDataDecoder to expose
high-level operations: session control and DID reading.
"""

from __future__ import annotations

import config.uds_dids as _dids
from core.exceptions import InvalidResponseError, NrcException
from core.interfaces.i_transport import ITransport
from core.models.uds_response import UdsResponse
from infraestructure.decoder.uds_decoder import UdsDataDecoder
from infraestructure.protocol.uds_builder import UdsProtocolBuilder

_SID_SESSION_CTRL:    int = 0x10
_SID_READ_DATA_BY_ID: int = 0x22


class UdsSession:
    """Client-side UDS session over an ITransport."""

    def __init__(self, transport: ITransport) -> None:
        self._transport = transport
        self._builder   = UdsProtocolBuilder()
        self._decoder   = UdsDataDecoder()
        self._current_session: int = _dids.UDS_SESSION_DEFAULT

    def open(self) -> None:
        self._transport.connect()

    def close(self) -> None:
        try:
            self.set_session(_dids.UDS_SESSION_DEFAULT)
        except Exception:
            pass
        self._transport.disconnect()

    def __enter__(self) -> UdsSession:
        self.open()
        return self

    def __exit__(self, *_) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def set_session(self, session_type: int) -> dict:
        """Send DiagnosticSessionControl and return timing parameters."""
        req = self._builder.build_session_control(session_type)
        self._transport.send(req)
        raw = self._transport.receive()
        response = self._decoder.validate_response(raw, _SID_SESSION_CTRL)
        info = self._decoder.decode_session_info(response)
        self._current_session = session_type
        return info

    def read_did(self, did: int) -> object:
        """Send ReadDataByIdentifier and return the decoded value."""
        definition = _dids.DIDS.get(did)
        if definition is None:
            raise InvalidResponseError(f"DID 0x{did:04X} not in registry")
        if definition.extended_only and self._current_session != _dids.UDS_SESSION_EXTENDED:
            raise NrcException(mode=_SID_READ_DATA_BY_ID, nrc_code=0x7E)
        req = self._builder.build_read_did(did)
        self._transport.send(req)
        raw = self._transport.receive()
        response = self._decoder.validate_response(raw, _SID_READ_DATA_BY_ID)
        return self._decoder.decode_did(response, did)

    def read_did_raw(self, did: int) -> UdsResponse:
        """Return raw UdsResponse without decoding (useful for unknown DIDs)."""
        req = self._builder.build_read_did(did)
        self._transport.send(req)
        raw = self._transport.receive()
        return self._decoder.validate_response(raw, _SID_READ_DATA_BY_ID)

    @property
    def current_session(self) -> int:
        return self._current_session

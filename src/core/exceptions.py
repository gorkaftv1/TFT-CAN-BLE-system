class NrcException(Exception):
    def __init__(self, mode: int, nrc_code: int) -> None:
        self.mode = mode
        self.nrc_code = nrc_code
        super().__init__(f"NRC for mode 0x{mode:02X}: code 0x{nrc_code:02X}")


class TransportError(Exception):
    """Low-level CAN / ISO-TP communication failure."""


class DiagnosticTimeoutError(Exception):
    """Diagnostic operation exceeded its timeout threshold."""


class InvalidResponseError(Exception):
    """Structurally malformed payload received from the ECU."""

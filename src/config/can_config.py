CAN_BITRATE: int = 500_000
CAN_TX_ID: int   = 0x7E0
CAN_RX_ID: int   = 0x7E8

# --- ISO-TP Transport ---

# PCI byte: high nibble = frame type, low nibble = payload length or SN
ISOTP_PCI_SF: int = 0x00   # Single Frame
ISOTP_PCI_FF: int = 0x10   # First Frame
ISOTP_PCI_CF: int = 0x20   # Consecutive Frame
ISOTP_PCI_FC: int = 0x30   # Flow Control

ISOTP_PADDING_BYTE: int      = 0xAA
ISOTP_SF_MAX_PAYLOAD: int    = 7
ISOTP_FF_DATA_BYTES: int     = 6
ISOTP_CF_DATA_BYTES: int     = 7
ISOTP_FC_TIMEOUT_MS: int     = 1000
ISOTP_CF_SEPARATION_MS: int  = 25

# --- OBD-II Application Layer ---

OBD_MODE_LIVE_DATA: int    = 0x01
OBD_MODE_READ_DTCS: int    = 0x03
OBD_MODE_CLEAR_DTCS: int   = 0x04
OBD_MODE_VEHICLE_INFO: int = 0x09

OBD_POSITIVE_OFFSET: int = 0x40
OBD_NEGATIVE_PREFIX: int = 0x7F

# --- NRC Codes (ISO 14229-1) ---

NRC_SERVICE_NOT_SUPPORTED: int    = 0x11
NRC_SUBFUNCTION_NOT_SUPPORTED: int = 0x12
NRC_INVALID_MESSAGE_FORMAT: int   = 0x13
NRC_CONDITIONS_NOT_CORRECT: int   = 0x22
NRC_REQUEST_OUT_OF_RANGE: int     = 0x31
NRC_SECURITY_ACCESS_DENIED: int   = 0x33

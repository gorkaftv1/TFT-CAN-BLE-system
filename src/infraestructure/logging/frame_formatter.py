"""Unified TX/RX frame formatter for CAN/OBD2/UDS and BLE transport layers."""

from __future__ import annotations

import json

import config.can_config as _cfg
import config.obd_pids as _pids

_NRC_NAMES: dict[int, str] = {
    0x10: "generalReject",
    0x11: "serviceNotSupported",
    0x12: "subfunctionNotSupported",
    0x13: "incorrectMessageLength",
    0x22: "conditionsNotCorrect",
    0x24: "requestSequenceError",
    0x31: "requestOutOfRange",
    0x33: "securityAccessDenied",
    0x35: "invalidKey",
    0x36: "exceededNumberOfAttempts",
    0x37: "requiredTimeDelayNotExpired",
    0x78: "responsePending",
    0x7E: "subfunctionNotSupportedInActiveSession",
    0x7F: "serviceNotSupportedInActiveSession",
}

_UDS_SERVICES: dict[int, str] = {
    0x10: "DiagnosticSessionControl",
    0x11: "ECUReset",
    0x14: "ClearDiagnosticInformation",
    0x19: "ReadDTCInformation",
    0x22: "ReadDataByIdentifier",
    0x23: "ReadMemoryByAddress",
    0x27: "SecurityAccess",
    0x28: "CommunicationControl",
    0x2E: "WriteDataByIdentifier",
    0x31: "RoutineControl",
    0x34: "RequestDownload",
    0x3E: "TesterPresent",
    0x85: "ControlDTCSetting",
}

_UDS_SESSION_NAMES: dict[int, str] = {
    0x01: "defaultSession",
    0x02: "programmingSession",
    0x03: "extendedDiagnosticSession",
}

_UDS_POSITIVE_SIDS: frozenset[int] = frozenset(s + 0x40 for s in _UDS_SERVICES)


def _decode_tx(raw: bytes) -> tuple[str, str]:
    if not raw:
        return "?", "(empty frame)"
    mode = raw[0]

    if mode == 0x01 and len(raw) >= 2:
        pid = raw[1]
        pid_def = _pids.PIDS.get(pid)
        name = pid_def.name if pid_def else f"PID 0x{pid:02X}"
        return "OBD2", f"Mode 01 request -> {name} (PID 0x{pid:02X})"

    if mode == 0x03:
        return "OBD2", "Mode 03 -> ReadDTCs"

    if mode == 0x04:
        return "OBD2", "Mode 04 -> ClearDTCs"

    if mode == 0x09 and len(raw) >= 2:
        label = "VIN" if raw[1] == 0x02 else f"InfoType 0x{raw[1]:02X}"
        return "OBD2", f"Mode 09 -> {label}"

    if mode in _UDS_SERVICES:
        svc = _UDS_SERVICES[mode]
        if mode == 0x10 and len(raw) >= 2:
            sub = _UDS_SESSION_NAMES.get(raw[1], f"0x{raw[1]:02X}")
            return "UDS", f"{svc} -> {sub}"
        if mode == 0x22 and len(raw) >= 3:
            did = (raw[1] << 8) | raw[2]
            return "UDS", f"{svc} DID=0x{did:04X}"
        if mode == 0x27 and len(raw) >= 2:
            return "UDS", f"{svc} subFunc=0x{raw[1]:02X}"
        return "UDS", svc

    return "CAN", f"raw mode=0x{mode:02X}"


def _decode_rx(raw: bytes) -> tuple[str, str]:
    if not raw:
        return "?", "(empty frame)"
    first = raw[0]

    if first == _cfg.OBD_NEGATIVE_PREFIX:  # 0x7F
        if len(raw) >= 3:
            svc_name = _UDS_SERVICES.get(raw[1], f"SID=0x{raw[1]:02X}")
            nrc_name = _NRC_NAMES.get(raw[2], f"0x{raw[2]:02X}")
            return "OBD2/UDS", f"NegativeResponse {svc_name} NRC={nrc_name}"
        return "OBD2/UDS", "NegativeResponse (malformed)"

    if 0x41 <= first <= 0x49:
        mode = first - 0x40
        if mode == 0x01 and len(raw) >= 2:
            pid = raw[1]
            pid_def = _pids.PIDS.get(pid)
            if pid_def:
                try:
                    value = pid_def.decode(raw)
                    return "OBD2", f"Mode 01 response -> {pid_def.name} = {value:.2f} {pid_def.unit}"
                except Exception:
                    return "OBD2", f"Mode 01 response -> {pid_def.name} (decode error)"
            return "OBD2", f"Mode 01 response -> PID 0x{pid:02X}"
        if mode == 0x03:
            count = raw[1] if len(raw) >= 2 else "?"
            return "OBD2", f"ReadDTCs response -> {count} DTC(s)"
        if mode == 0x04:
            return "OBD2", "ClearDTCs -> OK"
        if mode == 0x09 and len(raw) >= 2:
            if raw[1] == 0x02 and len(raw) >= 20:
                try:
                    vin = raw[3:20].decode("ascii")
                    return "OBD2", f"Mode 09 response -> VIN={vin}"
                except Exception:
                    pass
            return "OBD2", f"Mode 09 response -> InfoType 0x{raw[1]:02X}"
        return "OBD2", f"PositiveResponse mode=0x{mode:02X}"

    if first in _UDS_POSITIVE_SIDS:
        orig_sid = first - 0x40
        svc = _UDS_SERVICES.get(orig_sid, f"SID=0x{orig_sid:02X}")
        if orig_sid == 0x10 and len(raw) >= 2:
            sub = _UDS_SESSION_NAMES.get(raw[1], f"0x{raw[1]:02X}")
            return "UDS", f"PositiveResponse {svc} -> {sub} OK"
        if orig_sid == 0x27 and len(raw) >= 2:
            return "UDS", f"PositiveResponse {svc} subFunc=0x{raw[1]:02X}"
        return "UDS", f"PositiveResponse {svc} OK"

    return "CAN", f"raw first=0x{first:02X}"


def format_tx(raw: bytes) -> str:
    protocol, decoded = _decode_tx(raw)
    hex_str = raw.hex(" ").upper() if raw else "(none)"
    return (
        f"TX - [{protocol}]\n"
        f"  RAW    : {hex_str}\n"
        f"  DECODED: {decoded}"
    )


def format_rx(raw: bytes) -> str:
    protocol, decoded = _decode_rx(raw)
    hex_str = raw.hex(" ").upper() if raw else "(none)"
    return (
        f"RX - [{protocol}]\n"
        f"  RAW    : {hex_str}\n"
        f"  DECODED: {decoded}"
    )


def format_ble_rx(raw_str: str, cmd: dict) -> str:
    cmd_name = cmd.get("cmd", "?")
    pids = cmd.get("pids")
    detail = f"command={cmd_name!r}"
    if pids is not None:
        detail += f" pids={[hex(p) for p in pids]}"
    return (
        f"RX - [BLE]\n"
        f"  RAW    : {raw_str}\n"
        f"  DECODED: {detail}"
    )


def format_ble_tx(data: dict) -> str:
    raw_str = json.dumps(data, separators=(",", ":"))
    status = data.get("status", "")
    dtype = data.get("type", "")
    if dtype:
        detail = f"type={dtype!r}"
        if dtype == "samples":
            count = len(data.get("samples", []))
            detail += f" samples={count}"
    elif status:
        detail = f"status={status!r}"
        d = data.get("data")
        if isinstance(d, str):
            detail += f" data={d!r}"
    else:
        detail = raw_str[:80]
    truncated = raw_str[:200] + ("..." if len(raw_str) > 200 else "")
    return (
        f"TX - [BLE]\n"
        f"  RAW    : {truncated}\n"
        f"  DECODED: {detail}"
    )

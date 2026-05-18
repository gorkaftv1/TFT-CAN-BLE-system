from __future__ import annotations

import threading
from typing import Any

from config.obd_pids import PIDS
from core.interfaces.i_data_logger import IDataLogger
from core.interfaces.i_diagnostic_session import IDiagnosticSession
from core.interfaces.i_transport import ITransport
from core.models.monitor_sample import MonitorSample
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from monitor.live_data_monitor import LiveDataMonitor

# UDS service IDs
_UDS_DSC         = 0x10  # DiagnosticSessionControl
_UDS_RDBI        = 0x22  # ReadDataByIdentifier
_UDS_NRC         = 0x7F

# DID registry: did_int -> (name, unit, decoder)
# decoder(data: bytes) -> str | int | float
def _dec_str(data: bytes) -> str:
    return data.decode("ascii", errors="replace").rstrip("\x00")

def _dec_pct(data: bytes) -> int:
    return round(data[0] * 100 / 255)

def _dec_temp(data: bytes) -> int:
    return data[0] - 40

def _dec_rpm(data: bytes) -> int:
    return ((data[0] << 8) | data[1]) // 4

def _dec_raw1(data: bytes) -> int:
    return data[0]

def _dec_raw2(data: bytes) -> int:
    return (data[0] << 8) | data[1]

def _dec_voltage_mv(data: bytes) -> float:
    return round(((data[0] << 8) | data[1]) / 1000, 2)

_DID_META: dict[int, tuple[str, str, Any]] = {
    0xF190: ("VIN",               "",     _dec_str),
    0xF18C: ("ECU Serial Number", "",     _dec_str),
    0xF189: ("Software Version",  "",     _dec_str),
    0x2001: ("Engine Load",       "%",    _dec_pct),
    0x2002: ("Coolant Temp",      "°C", _dec_temp),
    0x2003: ("Engine RPM",        "rpm",  _dec_rpm),
    0x2004: ("Vehicle Speed",     "km/h", _dec_raw1),
    0x2005: ("Throttle Position", "%",    _dec_pct),
    0x2006: ("Fuel Level",        "%",    _dec_pct),
    0x2007: ("Engine Oil Temp",   "°C", _dec_temp),
    0x2008: ("Battery Voltage",   "V",    _dec_voltage_mv),
}


class BtCommandHandler:

    def __init__(
        self,
        session: IDiagnosticSession,
        logger: IDataLogger,
        session_id: int,
        transport: ITransport,
        transport_lock: threading.Lock,
        push_callback=None,
        auth_token: str | None = None,
    ) -> None:
        self._session = session
        self._logger = logger
        self._session_id = session_id
        self._transport = transport
        self._lock = transport_lock
        self._push = push_callback or (lambda _: None)
        self._auth_token = auth_token
        self._authenticated = auth_token is None
        self._monitor: LiveDataMonitor | None = None
        self._monitor_lock = threading.Lock()
        self._uds_session_type: int = 1

    def set_push_callback(self, cb) -> None:
        self._push = cb

    def handle(self, cmd: dict) -> dict:
        name = cmd.get("cmd", "")

        if not self._authenticated:
            if name != "auth":
                return {"status": "error", "message": "not authenticated"}
            provided = cmd.get("token", "")
            if provided == self._auth_token:
                self._authenticated = True
                return {"status": "ok", "data": "authenticated"}
            return {"status": "error", "message": "invalid token"}

        dispatch = {
            "ping":             self._ping,
            "snapshot":         self._snapshot,
            "dtcs":             self._dtcs,
            "clear_dtcs":       self._clear_dtcs,
            "vin":              self._vin,
            "monitor_start":    self._monitor_start,
            "monitor_stop":     self._monitor_stop,
            "sessions":         self._sessions,
            "session_samples":  self._session_samples,
            "session_commands": self._session_commands,
            "uds_session":      self._uds_session,
            "uds_read_did":     self._uds_read_did,
        }
        fn = dispatch.get(name)
        if fn is None:
            return {"status": "error", "message": f"Unknown command: {name!r}"}
        try:
            return fn(cmd)
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    def _ping(self, _cmd: dict) -> dict:
        return {"status": "ok", "data": "pong"}

    def _snapshot(self, _cmd: dict) -> dict:
        data = {}
        with self._lock:
            for pid_def in PIDS.values():
                self._transport.send(pid_def.request)
                raw = self._transport.receive()
                value = pid_def.decode(raw)
                data[pid_def.name] = {"value": value, "unit": pid_def.unit}
        return {"status": "ok", "data": data}

    def _dtcs(self, _cmd: dict) -> dict:
        with self._lock:
            dtcs = self._session.get_dtcs()
        return {
            "status": "ok",
            "data": [{"code": d.code, "description": d.description} for d in dtcs],
        }

    def _clear_dtcs(self, _cmd: dict) -> dict:
        with self._lock:
            self._session.clear_dtcs()
        return {"status": "ok", "data": None}

    def _vin(self, _cmd: dict) -> dict:
        with self._lock:
            vin = self._session.get_vin()
        return {"status": "ok", "data": vin}

    def _monitor_start(self, cmd: dict) -> dict:
        pids = frozenset(cmd.get("pids", [0x05, 0x04, 0x0C, 0x0D, 0x11]))
        interval_ms = int(cmd.get("interval_ms", 500))
        cycle_size = len(pids)

        with self._monitor_lock:
            if self._monitor is not None and self._monitor.is_running():
                return {"status": "ok", "data": "monitor already running"}

            sample_batch: list[dict] = []

            def on_sample(s: MonitorSample) -> None:
                self._logger.log_sample(self._session_id, s)
                sample_batch.append({
                    "pid":   s.pid,
                    "name":  s.name,
                    "value": s.value,
                    "unit":  s.unit,
                    "ts":    s.timestamp,
                })
                if len(sample_batch) >= cycle_size:
                    self._push({"type": "samples", "samples": sample_batch.copy()})
                    sample_batch.clear()

            def on_error(pid: int, exc: Exception) -> None:
                self._push({"type": "error", "pid": pid, "message": str(exc)})

            self._monitor = LiveDataMonitor(
                transport=self._transport,
                decoder=Obd2DataDecoder(),
                pid_ids=pids,
                interval_ms=interval_ms,
                on_sample=on_sample,
                on_error=on_error,
                lock=self._lock,
            )
            self._monitor.start()

        return {"status": "ok", "data": "monitor started"}

    def _monitor_stop(self, _cmd: dict) -> dict:
        with self._monitor_lock:
            if self._monitor is not None:
                self._monitor.stop()
                self._monitor = None
        return {"status": "ok", "data": "monitor stopped"}

    def _sessions(self, cmd: dict) -> dict:
        limit = int(cmd.get("limit", 50))
        sessions = self._logger.get_sessions(limit=limit)
        return {
            "status": "ok",
            "data": [
                {
                    "session_id":   s.session_id,
                    "label":        s.label,
                    "started_at":   s.started_at,
                    "ended_at":     s.ended_at,
                    "sample_count": s.sample_count,
                }
                for s in sessions
            ],
        }

    def _session_samples(self, cmd: dict) -> dict:
        sid = int(cmd.get("session_id", 0))
        pid = cmd.get("pid")
        limit = int(cmd.get("limit", 1000))
        samples = self._logger.get_samples(
            session_id=sid,
            pid=int(pid) if pid is not None else None,
            limit=limit,
        )
        return {
            "status": "ok",
            "data": [
                {"pid": s.pid, "name": s.name, "value": s.value, "unit": s.unit, "ts": s.timestamp}
                for s in samples
            ],
        }

    def _session_commands(self, cmd: dict) -> dict:
        sid = int(cmd.get("session_id", 0))
        commands = self._logger.get_commands(session_id=sid)
        return {
            "status": "ok",
            "data": [
                {
                    "command":      c.command,
                    "request_hex":  c.request_hex,
                    "response_hex": c.response_hex,
                    "timestamp":    c.timestamp,
                }
                for c in commands
            ],
        }

    def _uds_session(self, cmd: dict) -> dict:
        session_type = int(cmd.get("session_type", 1))
        request = bytes([_UDS_DSC, session_type])
        with self._lock:
            self._transport.send(request)
            raw = self._transport.receive()
        if len(raw) >= 1 and raw[0] == _UDS_NRC:
            nrc = raw[2] if len(raw) >= 3 else 0x00
            raise RuntimeError(f"UDS NRC 0x{nrc:02X} for DSC")
        if len(raw) < 6 or raw[0] != 0x50:
            raise RuntimeError(f"Unexpected DSC response: {raw.hex()}")
        p2_ms     = (raw[2] << 8) | raw[3]
        p2ext_ms  = (raw[4] << 8) | raw[5]
        self._uds_session_type = raw[1]
        return {"status": "ok", "data": {
            "session_type":    self._uds_session_type,
            "p2_server_ms":    p2_ms,
            "p2_extended_ms":  p2ext_ms,
        }}

    def _uds_read_did(self, cmd: dict) -> dict:
        did_str = str(cmd.get("did", "0x0000"))
        did_int = int(did_str, 16)
        did_hi  = (did_int >> 8) & 0xFF
        did_lo  = did_int & 0xFF
        request = bytes([_UDS_RDBI, did_hi, did_lo])
        with self._lock:
            self._transport.send(request)
            raw = self._transport.receive()
        if len(raw) >= 1 and raw[0] == _UDS_NRC:
            nrc = raw[2] if len(raw) >= 3 else 0x00
            raise RuntimeError(f"UDS NRC 0x{nrc:02X} for RDBI DID 0x{did_int:04X}")
        if len(raw) < 3 or raw[0] != 0x62:
            raise RuntimeError(f"Unexpected RDBI response: {raw.hex()}")
        data = raw[3:]
        meta = _DID_META.get(did_int)
        if meta:
            name, unit, decoder = meta
            value = decoder(data)
        else:
            name  = f"DID_0x{did_int:04X}"
            unit  = ""
            value = data.hex().upper()
        return {"status": "ok", "data": {
            "did":   did_str,
            "name":  name,
            "value": value,
            "unit":  unit,
        }}

    def stop_monitor(self) -> None:
        with self._monitor_lock:
            if self._monitor is not None:
                self._monitor.stop()
                self._monitor = None

    def on_disconnect(self) -> None:
        self.stop_monitor()
        self._authenticated = self._auth_token is None
        self._uds_session_type = 1

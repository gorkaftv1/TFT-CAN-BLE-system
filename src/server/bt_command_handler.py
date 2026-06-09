from __future__ import annotations

import threading

import config.uds_dids as _dids
from config.obd_pids import PIDS
from core.exceptions import DiagnosticTimeoutError
from core.interfaces.i_data_logger import IDataLogger
from core.interfaces.i_diagnostic_session import IDiagnosticSession
from core.models.monitor_sample import MonitorSample
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from infraestructure.transport.logging_transport import LoggingTransport
from monitor.live_data_monitor import LiveDataMonitor
from session.uds_session import UdsSession


class BtCommandHandler:

    def __init__(
        self,
        session: IDiagnosticSession,
        logger: IDataLogger,
        session_id: int,
        transport: LoggingTransport,
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
        self._uds = UdsSession(transport)
        self._supported_pids: set[int] | None = None

    def set_push_callback(self, cb) -> None:
        self._push = cb

    def handle(self, cmd: dict) -> dict | None:
        name = cmd.get("cmd", "")

        # Async/keepalive frames carry a "type" (e.g. {"type": "heartbeat_ack"})
        # and no "cmd". They are not commands: acknowledge silently, no response.
        if not name:
            return None

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
            "session_dtcs":     self._session_dtcs,
            "uds_session":      self._uds_session,
            "uds_read_did":     self._uds_read_did,
            "probe_pids":       self._probe_pids,
            "disconnect":       self._cmd_disconnect,
            "auth":             self._cmd_auth,
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
        pid_ids = self._supported_pids if self._supported_pids is not None else set(PIDS.keys())
        _decoder = Obd2DataDecoder()
        data = {}
        for pid_id in pid_ids:
            pid_def = PIDS[pid_id]
            try:
                with self._lock:
                    self._transport.send(pid_def.request)
                    raw = self._transport.receive()
                _decoder.validate_response(raw, expected_mode=0x01)
                value = pid_def.decode(raw)
                data[pid_def.name] = {"value": value, "unit": pid_def.unit}
            except DiagnosticTimeoutError:
                if self._supported_pids is not None:
                    self._supported_pids.discard(pid_id)
            except Exception:
                pass
        return {"status": "ok", "data": data}

    def _probe_pids(self, _cmd: dict) -> dict:
        """Discover supported PIDs via OBD2 bitmasks, then confirm each with a real poll."""
        # Step 1: collect declared PIDs via availability bitmasks
        declared: set[int] = set()
        for support_pid in (0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0, 0xE0):
            try:
                with self._lock:
                    self._transport.send(bytes([0x01, support_pid]))
                    raw = self._transport.receive()
                if len(raw) >= 6 and raw[0] == 0x41 and raw[1] == support_pid:
                    mask = (raw[2] << 24) | (raw[3] << 16) | (raw[4] << 8) | raw[5]
                    for i in range(32):
                        if mask & (0x80000000 >> i):
                            declared.add(support_pid + i + 1)
                    if not (mask & 0x01):
                        break
            except Exception:
                break

        # Step 2: real poll each declared PID to filter false positives (NRC)
        confirmed: set[int] = set()
        for pid in sorted(declared):
            try:
                with self._lock:
                    self._transport.send(bytes([0x01, pid]))
                    raw = self._transport.receive()
                if len(raw) >= 2 and raw[0] == 0x41 and raw[1] == pid:
                    confirmed.add(pid)
            except Exception:
                pass

        # Only expose PIDs that have a decoder (required for monitor_start)
        self._supported_pids = confirmed & set(PIDS.keys())
        return {"status": "ok", "data": sorted(self._supported_pids)}

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
            if self._monitor is not None and self._monitor.is_running:
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
                    "dtc_count":    s.dtc_count,
                }
                for s in sessions
            ],
        }

    def _session_samples(self, cmd: dict) -> dict:
        sid    = int(cmd.get("session_id", 0))
        pid    = cmd.get("pid")
        limit  = int(cmd.get("limit", 1000))
        offset = int(cmd.get("offset", 0))
        samples = self._logger.get_samples(
            session_id=sid,
            pid=int(pid) if pid is not None else None,
            limit=limit,
            offset=offset,
        )
        return {
            "status": "ok",
            "data": [
                {
                    "pid": s.pid, "name": s.name,
                    "value": s.value, "unit": s.unit,
                    "ts": s.wall_ts or str(s.timestamp),
                }
                for s in samples
            ],
        }

    def _session_dtcs(self, cmd: dict) -> dict:
        sid = int(cmd.get("session_id", 0))
        dtcs = self._logger.get_dtcs_for_session(session_id=sid)
        return {
            "status": "ok",
            "data": [
                {"code": d.code, "description": d.description, "raw": d.raw_bytes.hex()}
                for d in dtcs
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
        with self._lock:
            info = self._uds.set_session(session_type)
        self._logger.log_command(
            self._session_id, f"uds_session_{session_type}",
            self._transport.last_sent, self._transport.last_received,
        )
        return {"status": "ok", "data": {
            "session_type":   self._uds.current_session,
            "p2_server_ms":   info["p2_server_ms"],
            "p2_extended_ms": info["p2_extended_ms"],
        }}

    def _uds_read_did(self, cmd: dict) -> dict:
        did_str = str(cmd.get("did", "0x0000"))
        did_int = int(did_str, 16)
        definition = _dids.DIDS.get(did_int)
        with self._lock:
            if definition is not None:
                value = self._uds.read_did(did_int)
            else:
                response = self._uds.read_did_raw(did_int)
                value = bytes(response.data[2:]).hex().upper()
        self._logger.log_command(
            self._session_id, f"uds_read_did_{did_str}",
            self._transport.last_sent, self._transport.last_received,
        )
        name = definition.name if definition else f"DID_0x{did_int:04X}"
        unit = definition.unit if definition else ""
        return {"status": "ok", "data": {
            "did":   did_str,
            "name":  name,
            "value": value,
            "unit":  unit,
        }}

    def _cmd_auth(self, cmd: dict) -> dict:
        provided = cmd.get("token", "")
        if self._auth_token is None or provided == self._auth_token:
            return {"status": "ok", "data": "authenticated"}
        return {"status": "error", "message": "invalid token"}

    def _cmd_disconnect(self, _cmd: dict) -> dict:
        self.on_disconnect()
        return {"status": "ok"}

    def stop_monitor(self) -> None:
        with self._monitor_lock:
            if self._monitor is not None:
                self._monitor.stop()
                self._monitor = None

    def on_disconnect(self) -> None:
        self.stop_monitor()
        self._authenticated = self._auth_token is None
        try:
            with self._lock:
                self._uds.set_session(_dids.UDS_SESSION_DEFAULT)
        except Exception:
            pass

    def close_session(self) -> None:
        """Flush DB buffer and end the current session on client disconnect.

        Does NOT close the DB connection: the server restarts in-place and
        reuses this handler/logger, so the connection must stay open. The
        real close() happens on full process shutdown (server entry point).
        """
        self.stop_monitor()
        self._logger.end_session(self._session_id)

    def start_session(self, label: str = "BLE session") -> None:
        """Begin a fresh session row for a new client connection."""
        self._session_id = self._logger.start_session(label)
        if hasattr(self._session, "set_session_id"):
            self._session.set_session_id(self._session_id)

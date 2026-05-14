from __future__ import annotations

import threading

from config.obd_pids import PIDS
from config.uds_dids import DIDS as UDS_DIDS
from core.interfaces.i_data_logger import IDataLogger
from core.interfaces.i_diagnostic_session import IDiagnosticSession
from core.interfaces.i_transport import ITransport
from core.models.monitor_sample import MonitorSample
from infraestructure.decoder.obd2_decoder import Obd2DataDecoder
from monitor.live_data_monitor import LiveDataMonitor
from session.uds_session import UdsSession


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
        self._uds = UdsSession(transport)

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
        """cmd: {"cmd":"uds_session","session_type":3}  (1=default, 2=programming, 3=extended)"""
        session_type = int(cmd.get("session_type", 1))
        with self._lock:
            info = self._uds.set_session(session_type)
        return {"status": "ok", "data": info}

    def _uds_read_did(self, cmd: dict) -> dict:
        """cmd: {"cmd":"uds_read_did","did":"0x2003"}  — DID as hex string or int."""
        raw_did = cmd.get("did")
        if raw_did is None:
            return {"status": "error", "message": "missing 'did' field"}
        did = int(raw_did, 16) if isinstance(raw_did, str) else int(raw_did)
        definition = UDS_DIDS.get(did)
        with self._lock:
            value = self._uds.read_did(did)
        return {
            "status": "ok",
            "data": {
                "did":   f"0x{did:04X}",
                "name":  definition.name if definition else f"DID_{did:04X}",
                "value": value,
                "unit":  definition.unit if definition else "",
            },
        }

    def stop_monitor(self) -> None:
        with self._monitor_lock:
            if self._monitor is not None:
                self._monitor.stop()
                self._monitor = None

    def on_disconnect(self) -> None:
        self.stop_monitor()
        self._authenticated = self._auth_token is None

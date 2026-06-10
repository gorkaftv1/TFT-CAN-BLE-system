from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone

from core.interfaces.i_data_logger import IDataLogger
from core.models.command_log import CommandLog
from core.models.dtc import Dtc
from core.models.log_session import LogSession
from core.models.monitor_sample import MonitorSample


_SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT    NOT NULL DEFAULT '',
    started_at TEXT    NOT NULL,
    ended_at   TEXT
);

CREATE TABLE IF NOT EXISTS samples (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id),
    pid          INTEGER NOT NULL,
    name         TEXT    NOT NULL,
    value        REAL    NOT NULL,
    unit         TEXT    NOT NULL,
    monotonic_ts REAL    NOT NULL,
    wall_ts      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS commands (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id),
    command      TEXT    NOT NULL,
    request_hex  TEXT    NOT NULL,
    response_hex TEXT    NOT NULL,
    wall_ts      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS dtcs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id),
    code         TEXT    NOT NULL,
    raw_hex      TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    wall_ts      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_samples_session  ON samples(session_id, pid);
CREATE INDEX IF NOT EXISTS idx_commands_session ON commands(session_id);
CREATE INDEX IF NOT EXISTS idx_dtcs_session     ON dtcs(session_id);
"""

_BUFFER_SIZE = 50


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SqliteDataLogger(IDataLogger):
    # WAL mode allows concurrent reads from BLE/BT thread while the
    # monitor background thread writes samples without blocking.

    def __init__(self, db_path: str = "diagnostics.db") -> None:
        self._lock = threading.Lock()
        self._sample_buffer: list[tuple] = []
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        self._snapshot_conn: sqlite3.Connection | None = None

    def open_snapshot(self) -> None:
        """Point-in-time in-memory copy of the DB for consistent historical reads."""
        snap = sqlite3.connect(":memory:", check_same_thread=False)
        with self._lock:
            self._flush_buffer()
            self._conn.backup(snap)
        self._snapshot_conn = snap

    def close_snapshot(self) -> None:
        if self._snapshot_conn is not None:
            self._snapshot_conn.close()
            self._snapshot_conn = None

    @property
    def _read_conn(self) -> sqlite3.Connection:
        return self._snapshot_conn if self._snapshot_conn is not None else self._conn

    def start_session(self, label: str = "") -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO sessions (label, started_at) VALUES (?, ?)",
                (label, _now_iso()),
            )
            self._conn.commit()
            return cur.lastrowid  # type: ignore[return-value]

    def end_session(self, session_id: int) -> None:
        with self._lock:
            self._flush_buffer()
            self._conn.execute(
                "UPDATE sessions SET ended_at = ? WHERE id = ?",
                (_now_iso(), session_id),
            )
            self._conn.commit()

    def log_sample(self, session_id: int, sample: MonitorSample) -> None:
        row = (
            session_id,
            sample.pid,
            sample.name,
            sample.value,
            sample.unit,
            sample.timestamp,
            _now_iso(),
        )
        with self._lock:
            self._sample_buffer.append(row)
            if len(self._sample_buffer) >= _BUFFER_SIZE:
                self._flush_buffer()

    def log_command(
        self,
        session_id: int,
        command: str,
        request: bytes,
        response: bytes,
    ) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO commands"
                " (session_id, command, request_hex, response_hex, wall_ts)"
                " VALUES (?, ?, ?, ?, ?)",
                (session_id, command, request.hex(), response.hex(), _now_iso()),
            )
            self._conn.commit()

    def get_sessions(self, limit: int = 50) -> list[LogSession]:
        cur = self._read_conn.execute(
            """
            SELECT s.id, s.label, s.started_at, s.ended_at,
                   COUNT(DISTINCT sa.id) AS sample_count,
                   COUNT(DISTINCT d.id)  AS dtc_count
            FROM sessions s
            LEFT JOIN samples sa ON sa.session_id = s.id
            LEFT JOIN dtcs    d  ON d.session_id  = s.id
            GROUP BY s.id
            ORDER BY s.id DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [
            LogSession(
                session_id=row[0],
                label=row[1],
                started_at=row[2],
                ended_at=row[3],
                sample_count=row[4],
                dtc_count=row[5],
            )
            for row in cur.fetchall()
        ]

    def get_samples(
        self,
        session_id: int,
        pid: int | None = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[MonitorSample]:
        if pid is None:
            cur = self._read_conn.execute(
                "SELECT pid, name, value, unit, monotonic_ts, wall_ts"
                " FROM samples WHERE session_id = ?"
                " ORDER BY monotonic_ts DESC LIMIT ? OFFSET ?",
                (session_id, limit, offset),
            )
        else:
            cur = self._read_conn.execute(
                "SELECT pid, name, value, unit, monotonic_ts, wall_ts"
                " FROM samples WHERE session_id = ? AND pid = ?"
                " ORDER BY monotonic_ts DESC LIMIT ? OFFSET ?",
                (session_id, pid, limit, offset),
            )
        return [
            MonitorSample(pid=r[0], name=r[1], value=r[2], unit=r[3], timestamp=r[4], wall_ts=r[5])
            for r in cur.fetchall()
        ]

    def get_commands(self, session_id: int) -> list[CommandLog]:
        cur = self._read_conn.execute(
            "SELECT command, request_hex, response_hex, wall_ts"
            " FROM commands WHERE session_id = ? ORDER BY id",
            (session_id,),
        )
        return [
            CommandLog(command=r[0], request_hex=r[1], response_hex=r[2], timestamp=r[3])
            for r in cur.fetchall()
        ]

    def log_dtcs(self, session_id: int, dtcs: list[Dtc]) -> None:
        if not dtcs:
            return
        with self._lock:
            self._conn.executemany(
                "INSERT INTO dtcs (session_id, code, raw_hex, description, wall_ts)"
                " VALUES (?, ?, ?, ?, ?)",
                [
                    (session_id, d.code, d.raw_bytes.hex(), d.description, _now_iso())
                    for d in dtcs
                ],
            )
            self._conn.commit()

    def get_dtcs_for_session(self, session_id: int) -> list[Dtc]:
        cur = self._read_conn.execute(
            "SELECT code, raw_hex, description FROM dtcs"
            " WHERE session_id = ? ORDER BY id",
            (session_id,),
        )
        return [
            Dtc(code=r[0], raw_bytes=bytes.fromhex(r[1]), description=r[2])
            for r in cur.fetchall()
        ]

    def close(self) -> None:
        with self._lock:
            self._flush_buffer()
        self._conn.close()

    def _flush_buffer(self) -> None:
        if not self._sample_buffer:
            return
        self._conn.executemany(
            "INSERT INTO samples"
            " (session_id, pid, name, value, unit, monotonic_ts, wall_ts)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            self._sample_buffer,
        )
        self._conn.commit()
        self._sample_buffer.clear()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

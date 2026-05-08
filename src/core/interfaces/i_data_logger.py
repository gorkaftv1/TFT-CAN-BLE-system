from __future__ import annotations

from abc import ABC, abstractmethod

from core.models.monitor_sample import MonitorSample
from core.models.log_session import LogSession
from core.models.command_log import CommandLog


class IDataLogger(ABC):
    @abstractmethod
    def start_session(self, label: str = "") -> int: ...

    @abstractmethod
    def end_session(self, session_id: int) -> None: ...

    @abstractmethod
    def log_sample(self, session_id: int, sample: MonitorSample) -> None: ...

    @abstractmethod
    def log_command(
        self,
        session_id: int,
        command: str,
        request: bytes,
        response: bytes,
    ) -> None: ...

    @abstractmethod
    def get_sessions(self, limit: int = 50) -> list[LogSession]: ...

    @abstractmethod
    def get_samples(
        self,
        session_id: int,
        pid: int | None = None,
        limit: int = 1000,
    ) -> list[MonitorSample]: ...

    @abstractmethod
    def get_commands(self, session_id: int) -> list[CommandLog]: ...

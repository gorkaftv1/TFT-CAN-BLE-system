from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
import time

try:
    from bless import (  # type: ignore[import]
        BlessServer,
        BlessGATTCharacteristic,
        GATTCharacteristicProperties,
        GATTAttributePermissions,
    )
    _BLESS_AVAILABLE = True
except ImportError:
    _BLESS_AVAILABLE = False

from server.bt_command_handler import BtCommandHandler
from infraestructure.logging.frame_formatter import format_ble_rx, format_ble_tx

logger = logging.getLogger(__name__)

_NUS_SERVICE = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
_NUS_RX      = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
_NUS_TX      = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

_BLE_NAME              = "diag_tool"
_MTU                   = 240
_CLIENT_TIMEOUT_S      = 15.0
_SERVER_TIMEOUT_S      = 20.0
_WATCHDOG_INTERVAL     = 3.0
_HEARTBEAT_AFTER_S     = 8.0
_RECV_BUFFER_MAX_SIZE  = 4096
_MAX_RECONNECT_RETRIES = 5
# Pause between BLE notification chunks. Large responses (e.g. session_samples
# with hundreds of rows) fragment into dozens of 240b notifications. Pushing
# them back-to-back overflows the BlueZ D-Bus socket (BlockingIOError, EAGAIN),
# dropping chunks so the client never sees the terminating newline and the
# request hangs. Pacing lets BlueZ drain each notification over the air.
_SEND_CHUNK_DELAY_S    = 0.05


class BLEDiagServer:

    def __init__(self, handler: BtCommandHandler) -> None:
        if not _BLESS_AVAILABLE:
            raise RuntimeError("bless not installed. Run: pip install bless")
        self._handler = handler
        self._server: BlessServer | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._recv_buf: str = ""
        self._stop_event: asyncio.Event | None = None
        self._restart_event: asyncio.Event | None = None
        self._last_rx_time: float = 0.0
        self._last_tx_time: float = 0.0
        self._client_connected: bool = False
        self._server_running: bool = False
        self._watchdog_task: asyncio.Task | None = None
        self._tx_lock: asyncio.Lock | None = None

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._stop_event = asyncio.Event()
        self._restart_event = asyncio.Event()
        self._tx_lock = asyncio.Lock()
        reconnect_count = 0
        try:
            await self._start_server()
            while True:
                stop_fut    = asyncio.ensure_future(self._stop_event.wait())
                restart_fut = asyncio.ensure_future(self._restart_event.wait())
                done, pending = await asyncio.wait(
                    [stop_fut, restart_fut], return_when=asyncio.FIRST_COMPLETED
                )
                for fut in pending:
                    fut.cancel()

                if self._stop_event.is_set():
                    break

                self._restart_event.clear()
                reconnect_count += 1
                if reconnect_count >= _MAX_RECONNECT_RETRIES:
                    logger.error(f"[BLE] Max retries ({_MAX_RECONNECT_RETRIES}) reached. Stopping.")
                    break
                wait_s = min(2 ** reconnect_count, 30)
                logger.info(
                    f"[BLE] Restarting BLE server "
                    f"(attempt {reconnect_count}/{_MAX_RECONNECT_RETRIES}, wait {wait_s}s)..."
                )
                await asyncio.sleep(wait_s)
                try:
                    await self._start_server()
                    self._handler.start_session()
                    print("[BLE] New DB session started for next client")
                    reconnect_count = 0
                except Exception as exc:
                    logger.error(f"[BLE] Restart failed: {exc}. Scheduling retry...")
                    self._restart_event.set()
        finally:
            await self._shutdown()

    async def _start_server(self) -> None:
        self._last_rx_time = time.time()
        self._last_tx_time = time.time()

        assert self._loop is not None
        self._server = BlessServer(name=_BLE_NAME, loop=self._loop)
        self._server.read_request_func  = self._on_read
        self._server.write_request_func = self._on_write

        await self._server.add_new_service(_NUS_SERVICE)
        await self._server.add_new_characteristic(
            _NUS_SERVICE, _NUS_RX,
            GATTCharacteristicProperties.write | GATTCharacteristicProperties.write_without_response,
            None, GATTAttributePermissions.writeable,
        )
        await self._server.add_new_characteristic(
            _NUS_SERVICE, _NUS_TX,
            GATTCharacteristicProperties.notify,
            None, GATTAttributePermissions.readable,
        )

        await self._server.start()
        self._server_running = True
        print(f"[BLE] Advertising '{_BLE_NAME}' — waiting for connection...")
        logger.info(f"[BLE] Advertising '{_BLE_NAME}'")

        self._watchdog_task = asyncio.create_task(self._watchdog_loop())

    async def _shutdown(self) -> None:
        self._server_running = False
        if self._watchdog_task:
            self._watchdog_task.cancel()
            try:
                await self._watchdog_task
            except asyncio.CancelledError:
                pass
        if self._server:
            try:
                await self._server.stop()
            except Exception as e:
                logger.error(f"[BLE] Error stopping server: {e}")
        self._handler.stop_monitor()
        print("[BLE] Server stopped.")
        logger.info("[BLE] Server stopped.")

    def stop(self) -> None:
        if self._stop_event and self._loop:
            self._loop.call_soon_threadsafe(self._stop_event.set)

    # ── GATT callbacks ─────────────────────────────────────────────────

    def _on_read(self, characteristic: BlessGATTCharacteristic, **_) -> bytearray:
        return characteristic.value or bytearray()

    def _on_write(self, characteristic: BlessGATTCharacteristic, value: bytearray, **_) -> None:
        rx_uuid = getattr(characteristic, "uuid", "?")
        print(f"[BLE] write callback: uuid={rx_uuid!r} len={len(value)}")
        if str(rx_uuid).upper() != _NUS_RX.upper():
            print(f"[BLE] write filtered (not RX char): {rx_uuid!r}")
            return

        self._last_rx_time = time.time()
        if not self._client_connected:
            self._client_connected = True
            # Log negotiated MTU: the first write size reveals the MTU the client is using
            negotiated_mtu = len(value)
            mtu_info = f"first write size={negotiated_mtu}b (server TX MTU={_MTU}b)"
            print(f"[BLE] Client connected — {mtu_info}")
            logger.info(f"[BLE] Client connected — {mtu_info}")
            # Try to read MTU from bless server if available
            try:
                if hasattr(self._server, "get_mtu"):
                    blz_mtu = self._server.get_mtu()
                    print(f"[BLE] BlueZ reported MTU: {blz_mtu}")
                    logger.info(f"[BLE] BlueZ reported MTU: {blz_mtu}")
            except Exception as e:
                logger.debug(f"[BLE] Could not read BlueZ MTU: {e}")
            self._handler.open_snapshot()

        chunk = bytes(value).decode("utf-8", errors="replace")

        if len(self._recv_buf) + len(chunk) > _RECV_BUFFER_MAX_SIZE:
            logger.warning("[BLE] RX buffer overflow — auto-disconnecting")
            print("[BLE] RX buffer overflow — auto-disconnecting")
            self._recv_buf = ""
            self.notify({"status": "error", "message": "Buffer overflow — disconnecting"})
            # Schedule disconnect from within the event loop
            assert self._loop is not None
            asyncio.ensure_future(self._handle_disconnect())
            return

        self._recv_buf += chunk

        while "\n" in self._recv_buf:
            line, self._recv_buf = self._recv_buf.split("\n", 1)
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
            except json.JSONDecodeError as exc:
                logger.warning(f"[BLE] Invalid JSON: {exc}")
                self.notify({"status": "error", "message": f"Invalid JSON: {exc}"})
                continue

            logger.info(format_ble_rx(line, cmd))
            print(format_ble_rx(line, cmd))

            assert self._loop is not None
            asyncio.run_coroutine_threadsafe(self._dispatch_async(cmd), self._loop)

    # ── Watchdog ───────────────────────────────────────────────────────

    async def _watchdog_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(_WATCHDOG_INTERVAL)
                # Exit if a new watchdog replaced us (after reconnect)
                if self._watchdog_task is not asyncio.current_task():
                    return

                now = time.time()

                if self._server_running and self._client_connected:
                    elapsed_tx = now - self._last_tx_time
                    if elapsed_tx > _SERVER_TIMEOUT_S:
                        logger.error(f"[Watchdog] No TX for {elapsed_tx:.1f}s — possible internal fault")
                        raise RuntimeError(f"BLE server TX silent for {elapsed_tx:.1f}s")

                if self._client_connected:
                    elapsed_rx = now - self._last_rx_time
                    if elapsed_rx > _CLIENT_TIMEOUT_S:
                        logger.warning(f"[Watchdog] Client inactive for {elapsed_rx:.1f}s — disconnecting")
                        print(f"[Watchdog] Client inactive for {elapsed_rx:.1f}s — disconnecting")
                        await self._handle_disconnect()
                        return
                    elif elapsed_rx > _HEARTBEAT_AFTER_S:
                        # Client idle — probe it. The client replies with
                        # heartbeat_ack, which arrives on RX and resets the timer.
                        # RX is reset ONLY by real client feedback (ack/ping/cmd),
                        # never by our own TX: a successful send proves nothing about
                        # whether the client is still listening.
                        self.notify({"type": "heartbeat"})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[Watchdog] Fatal error: {e} — triggering restart")
            if self._restart_event is not None:
                self._restart_event.set()

    async def _handle_disconnect(self) -> None:
        self._client_connected = False
        self._recv_buf = ""
        self._handler.on_disconnect()
        logger.info("[BLE] Client disconnected — restarting BLE server")
        print("[BLE] Client disconnected — restarting BLE server")
        try:
            self._handler.close_session()
            print("[BLE] Session closed and DB flushed")
        except Exception as e:
            logger.warning(f"[BLE] Error closing session: {e}")
        # Stop current server (unregister GATT app from D-Bus)
        self._server_running = False
        current = asyncio.current_task()
        if self._watchdog_task and self._watchdog_task is not current:
            self._watchdog_task.cancel()
        self._watchdog_task = None
        if self._server:
            try:
                await self._server.stop()
            except Exception as e:
                logger.warning(f"[BLE] Error stopping server: {e}")
            self._server = None
        # Reset HCI adapter to clear BlueZ advertising state
        print("[BLE] Resetting HCI adapter...")
        subprocess.run(["sudo", "hciconfig", "hci0", "reset"], timeout=5)
        await asyncio.sleep(3)
        # Signal start() to handle the restart — avoids restarting inside the watchdog
        # task where exceptions can't propagate to the main reconnect loop
        if self._restart_event is not None:
            self._restart_event.set()
        else:
            # Fallback when called outside start() lifecycle (e.g. direct disconnect cmd)
            await self._start_server()
            self._handler.start_session()

    # ── Dispatch and notify ────────────────────────────────────────────

    async def _dispatch_async(self, cmd: dict) -> None:
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(None, self._handler.handle, cmd)
        if response is not None:
            await self._notify_async(response)
        if cmd.get("cmd") == "disconnect":
            await self._handle_disconnect()

    def notify(self, data: dict) -> None:
        """Queue a message for sending. Safe from any thread (monitor worker,
        BLE write callback) and from the event loop itself. Serialization is
        handled by _notify_async's TX lock."""
        if self._server is None or self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._notify_async(data), self._loop)

    async def _notify_async(self, data: dict) -> None:
        """Send one logical message, serialized so its chunks never interleave
        with another message's. Concurrent _dispatch_async/heartbeat/monitor
        sends would otherwise inject their chunks mid-stream during the pacing
        await, splicing e.g. a pong into the middle of a large session_samples
        payload and corrupting the client's NDJSON line."""
        payload = (json.dumps(data) + "\n").encode()
        chunks = [payload[i:i + _MTU] for i in range(0, len(payload), _MTU)]
        logger.info(format_ble_tx(data))
        print(format_ble_tx(data))
        assert self._tx_lock is not None
        async with self._tx_lock:
            self._last_tx_time = time.time()  # mark before send — TX watchdog won't fire on partial BLE errors
            await self._send_chunks_paced(chunks)

    async def _send_chunks_paced(self, chunks: list[bytes]) -> None:
        assert self._server is not None
        multi = len(chunks) > 1
        try:
            for chunk in chunks:
                char = self._server.get_characteristic(_NUS_TX)
                if char is None:
                    logger.warning("[BLE] TX characteristic not available")
                    break
                char.value = bytearray(chunk)
                self._server.update_value(_NUS_SERVICE, _NUS_TX)
                if multi:
                    await asyncio.sleep(_SEND_CHUNK_DELAY_S)
                # Keep the TX watchdog calm during long multi-chunk transfers
                self._last_tx_time = time.time()
        except Exception as e:
            logger.error(f"[BLE] Error sending notification: {e}")
            raise

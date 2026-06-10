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
_CLIENT_TIMEOUT_S      = 30.0
_SERVER_TIMEOUT_S      = 40.0
_WATCHDOG_INTERVAL     = 5.0
_RECV_BUFFER_MAX_SIZE  = 4096
_MAX_RECONNECT_RETRIES = 5


class BLEDiagServer:

    def __init__(self, handler: BtCommandHandler) -> None:
        if not _BLESS_AVAILABLE:
            raise RuntimeError("bless not installed. Run: pip install bless")
        self._handler = handler
        self._server: BlessServer | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._recv_buf: str = ""
        self._stop_event: asyncio.Event | None = None
        self._last_rx_time: float = 0.0
        self._last_tx_time: float = 0.0
        self._client_connected: bool = False
        self._server_running: bool = False
        self._watchdog_task: asyncio.Task | None = None
        self._reconnect_count: int = 0

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._stop_event = asyncio.Event()
        try:
            while self._reconnect_count < _MAX_RECONNECT_RETRIES:
                try:
                    await self._start_server()
                    self._reconnect_count = 0
                    await self._stop_event.wait()
                    break
                except Exception as exc:
                    self._reconnect_count += 1
                    if self._reconnect_count >= _MAX_RECONNECT_RETRIES:
                        logger.error(f"[BLE] Max retries reached ({_MAX_RECONNECT_RETRIES}). Stopping.")
                        raise
                    wait_time = min(2 ** self._reconnect_count, 30)
                    logger.error(
                        f"[BLE] Error (attempt {self._reconnect_count}/{_MAX_RECONNECT_RETRIES}): {exc}. "
                        f"Retrying in {wait_time}s..."
                    )
                    await asyncio.sleep(wait_time)
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

        chunk = bytes(value).decode("utf-8", errors="replace")

        if len(self._recv_buf) + len(chunk) > _RECV_BUFFER_MAX_SIZE:
            logger.warning("[BLE] RX buffer overflow — auto-disconnecting")
            print("[BLE] RX buffer overflow — auto-disconnecting")
            self._recv_buf = ""
            self._notify_from_loop({"status": "error", "message": "Buffer overflow — disconnecting"})
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
                self._notify_from_loop({"status": "error", "message": f"Invalid JSON: {exc}"})
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
                        return  # _start_server created a new watchdog; exit this one
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[Watchdog] Error: {e}")
            raise

    async def _handle_disconnect(self) -> None:
        self._client_connected = False
        self._recv_buf = ""
        self._handler.on_disconnect()
        logger.info("[BLE] Client disconnected — restarting BLE server")
        print("[BLE] Client disconnected — restarting BLE server")
        # Flush DB and end session cleanly
        try:
            self._handler.close_session()
            print("[BLE] Session closed and DB flushed")
        except Exception as e:
            logger.warning(f"[BLE] Error closing session: {e}")
        # 1. Stop current server (unregister GATT app from D-Bus)
        self._server_running = False
        current = asyncio.current_task()
        if self._watchdog_task and self._watchdog_task is not current:
            # Only cancel if we're not the watchdog itself — cancelling self
            # raises CancelledError at the next await, aborting the restart
            self._watchdog_task.cancel()
        self._watchdog_task = None  # _start_server will assign a new one
        if self._server:
            try:
                await self._server.stop()
            except Exception as e:
                logger.warning(f"[BLE] Error stopping server: {e}")
            self._server = None
        # 2. Reset HCI adapter to clear BlueZ advertising state
        print("[BLE] Resetting HCI adapter...")
        subprocess.run(["sudo", "hciconfig", "hci0", "reset"], timeout=5)
        await asyncio.sleep(2)
        # 3. Start fresh server
        print("[BLE] Restarting BLE server...")
        await self._start_server()
        # 4. Roll a new DB session for the next client (DB stays open)
        try:
            self._handler.start_session()
            print("[BLE] New DB session started for next client")
        except Exception as e:
            logger.warning(f"[BLE] Error starting new session: {e}")

    # ── Dispatch and notify ────────────────────────────────────────────

    async def _dispatch_async(self, cmd: dict) -> None:
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(None, self._handler.handle, cmd)
        if response is not None:
            self._notify_from_loop(response)
        if cmd.get("cmd") == "disconnect":
            await self._handle_disconnect()

    def notify(self, data: dict) -> None:
        """Send data to BLE client. Thread-safe."""
        if self._server is None or self._loop is None:
            return
        payload = (json.dumps(data) + "\n").encode()
        chunks = [payload[i:i + _MTU] for i in range(0, len(payload), _MTU)]
        logger.info(format_ble_tx(data))
        print(format_ble_tx(data))
        self._loop.call_soon_threadsafe(self._send_chunks, chunks)

    def _notify_from_loop(self, data: dict) -> None:
        payload = (json.dumps(data) + "\n").encode()
        chunks = [payload[i:i + _MTU] for i in range(0, len(payload), _MTU)]
        logger.info(format_ble_tx(data))
        print(format_ble_tx(data))
        self._send_chunks(chunks)
        self._last_tx_time = time.time()

    def _send_chunks(self, chunks: list[bytes]) -> None:
        assert self._server is not None
        try:
            for chunk in chunks:
                char = self._server.get_characteristic(_NUS_TX)
                if char is None:
                    logger.warning("[BLE] TX characteristic not available")
                    break
                char.value = bytearray(chunk)
                self._server.update_value(_NUS_SERVICE, _NUS_TX)
        except Exception as e:
            logger.error(f"[BLE] Error sending notification: {e}")
            raise

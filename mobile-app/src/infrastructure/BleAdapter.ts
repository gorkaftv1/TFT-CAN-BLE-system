import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { DtcCode } from '../domain/models/DtcCode';
import { MonitorSample } from '../domain/models/MonitorSample';
import { IVehicleAdapter } from './IVehicleAdapter';
import { LogService } from '../domain/services/LogService';

const NUS_SERVICE = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHAR     = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHAR     = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

const MTU                = 128;
const WRITE_CHUNK_BYTES  = 240;
const SCAN_TIMEOUT_MS    = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;
const CLIENT_TIMEOUT_MS  = 20_000;
const INACTIVITY_CHECK_MS = 5_000;
const PING_INTERVAL_MS   = 7_000;

function translateBleError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/was disconnected/i.test(raw))      return 'El dispositivo se desconectó durante la conexión. Asegúrate de que la Pi está encendida y cerca.';
  if (/timed out/i.test(raw))             return 'Tiempo de espera agotado. El dispositivo no respondió a tiempo.';
  if (/not found/i.test(raw))             return 'Dispositivo no encontrado. Comprueba que está encendido y visible.';
  if (/powered off/i.test(raw))           return 'Bluetooth desactivado. Actívalo e inténtalo de nuevo.';
  if (/unauthorized|permission/i.test(raw)) return 'Permiso Bluetooth denegado. Concede los permisos en Ajustes del sistema.';
  if (/MTU/i.test(raw))                   return 'Error al negociar el tamaño de paquete (MTU) con el dispositivo.';
  if (/discover/i.test(raw))              return 'Error al descubrir los servicios del dispositivo.';
  if (/characteristic/i.test(raw))        return 'Servicio NUS no disponible. Comprueba que el firmware de la Pi es correcto.';
  if (/already connected/i.test(raw))     return 'El dispositivo ya está conectado. Desconéctalo e inténtalo de nuevo.';
  if (/scanning/i.test(raw))              return 'Error durante la búsqueda de dispositivos Bluetooth.';
  return raw;
}

function b64ToStr(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export class BleAdapter implements IVehicleAdapter {
  private static instance: BleAdapter;

  private readonly manager = new BleManager();
  private device: Device | null = null;
  private txSub: Subscription | null = null;
  private rxBuf = '';
  private queue: Pending[] = [];
  private sampleCbs: Set<(s: MonitorSample) => void> = new Set();
  private lastActivityTime = 0;
  private lastSampleAckMs = 0;
  private intentionalDisconnect = false;
  private activityMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  onUnexpectedDisconnect: (() => void) | null = null;

  static getInstance(): BleAdapter {
    if (!BleAdapter.instance) BleAdapter.instance = new BleAdapter();
    return BleAdapter.instance;
  }

  // ── Scanning ──────────────────────────────────────────────────────

  startScan(onDevice: (d: ScannedDevice) => void, timeoutMs = SCAN_TIMEOUT_MS): () => void {
    const seen = new Set<string>();
    LogService.add('info', 'BLE busqueda iniciada');
    this.manager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) { LogService.add('error', `Error de busqueda: ${err.message}`); return; }
      if (!device || seen.has(device.id)) return;
      seen.add(device.id);
      onDevice({ id: device.id, name: device.name ?? null, rssi: device.rssi ?? null });
    });
    const timer = setTimeout(() => {
      this.manager.stopDeviceScan();
      LogService.add('info', 'BLE busqueda finalizada por tiempo');
    }, timeoutMs);
    return () => { clearTimeout(timer); this.manager.stopDeviceScan(); };
  }

  // ── Connect ───────────────────────────────────────────────────────

  async connect(deviceId?: string, deviceLabel?: string): Promise<void> {
    if (!deviceId) throw new Error('No hay dispositivo seleccionado — elige uno de la lista');
    const label = deviceLabel ?? deviceId;
    LogService.add('info', `[1/5] Conectando GATT a ${label}...`);
    // Cancel any stale OS-level GATT connection left by a previous unexpected disconnect
    await this.manager.cancelDeviceConnection(deviceId).catch(() => {});
    try {
      const raw = await this.manager.connectToDevice(deviceId, { autoConnect: false, timeout: 10000 });
      LogService.add('info', `[2/5] GATT conectado — solicitando MTU ${MTU}...`);
      const mtuResult = await raw.requestMTU(MTU);
      LogService.add('info', `[3/5] MTU=${mtuResult.mtu} — descubriendo servicios...`);
      await raw.discoverAllServicesAndCharacteristics();
      LogService.add('info', '[4/5] Servicios descubiertos — suscribiendo RX...');
      raw.onDisconnected(() => this.handleUnexpectedDisconnect());
      this.device = raw;
      LogService.add('info', '[5/5] Suscribiendo canal de recepción...');
      await this.subscribeToTx();
      LogService.add('info', '[6/6] Autenticando con la Pi...');
      await this.authenticate();
    } catch (e) {
      this.device = null;
      const friendly = translateBleError(e);
      LogService.add('error', `Error de conexión: ${friendly}`);
      throw new Error(friendly);
    }
    LogService.add('success', 'Autenticacion correcta — sesion activa');
    this.lastActivityTime = Date.now();
    this.startPingInterval();
    this.startActivityMonitor();
  }

  private async authenticate(token = '1234'): Promise<void> {
    await this.request({ cmd: 'auth', token });
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true; // suppress the onDisconnected -> unexpected handler
    this.onUnexpectedDisconnect = null; // intentional — prevent callback from firing
    if (this.device) {
      try { await this.writeRx(JSON.stringify({ cmd: 'disconnect' }) + '\n', false); } catch { /* ignore */ }
    }
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    if (this.activityMonitorInterval) { clearInterval(this.activityMonitorInterval); this.activityMonitorInterval = null; }
    this.txSub?.remove();
    this.txSub = null;
    this.rxBuf = '';
    this.drainQueue(new Error('Desconectado'));
    if (this.device) {
      try { await this.device.cancelConnection(); } catch { /* ignore */ }
      this.device = null;
    }
    this.intentionalDisconnect = false;
  }

  isConnected(): boolean {
    return this.device !== null;
  }

  startMonitor(pids: number[], intervalMs: number, onSample: (s: MonitorSample) => void): () => void {
    this.sampleCbs.add(onSample);
    // request() -> writeRx() already logs the BLE TX; do not log it again here.
    this.request({ cmd: 'monitor_start', pids, interval_ms: intervalMs }).catch((e) => {
      LogService.add('error', `Error al iniciar monitor: ${e instanceof Error ? e.message : String(e)}`);
    });
    return () => {
      this.sampleCbs.delete(onSample);
      if (this.sampleCbs.size === 0) {
        this.request({ cmd: 'monitor_stop' }).catch(() => {});
      }
    };
  }

  async fetchDtcs(): Promise<Array<Pick<DtcCode, 'code' | 'description' | 'severity'>>> {
    const raw = await this.request<Array<{ code: string; description: string }>>({ cmd: 'dtcs' });
    return (raw ?? []).map((d) => ({ ...d, severity: 'warning' as const }));
  }

  async clearDtcs(): Promise<void> {
    await this.request({ cmd: 'clear_dtcs' });
  }

  async getSnapshot(): Promise<Record<string, { value: number; unit: string }>> {
    return await this.request({ cmd: 'snapshot' });
  }

  async getVin(): Promise<string> {
    return await this.request({ cmd: 'vin' });
  }

  async probeAvailablePids(): Promise<number[]> {
    return await this.request<number[]>({ cmd: 'probe_pids' });
  }

  async getSessions(limit = 50): Promise<any[]> {
    return await this.request({ cmd: 'sessions', limit });
  }

  async getSessionDtcs(sessionId: number): Promise<Array<{ code: string; description: string; raw: string }>> {
    return await this.request({ cmd: 'session_dtcs', session_id: sessionId }) ?? [];
  }

  async getSessionSamples(sessionId: number, pid?: number, limit = 1000, offset = 0): Promise<any[]> {
    return await this.request({ cmd: 'session_samples', session_id: sessionId, pid, limit, offset });
  }

  async getSessionCommands(sessionId: number): Promise<any[]> {
    return await this.request({ cmd: 'session_commands', session_id: sessionId });
  }

  async setUdsSession(sessionType: number): Promise<{ session_type: number; p2_server_ms: number; p2_extended_ms: number }> {
    return await this.request({ cmd: 'uds_session', session_type: sessionType });
  }

  async readUdsDid(did: string): Promise<{ did: string; name: string; value: string | number; unit: string }> {
    return await this.request({ cmd: 'uds_read_did', did });
  }

  // ── BLE internals ─────────────────────────────────────────────────

  private subscribeToTx(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.device) { reject(new Error('Sin conexion')); return; }
      this.txSub = this.device.monitorCharacteristicForService(
        NUS_SERVICE, TX_CHAR,
        (err, char) => {
          if (err || !char?.value) return;
          const raw = b64ToStr(char.value);
          this.feedBuffer(raw);
        },
      );
      resolve();
    });
  }

  // ── NDJSON buffer ────────────────────────────────────────────────

  private feedBuffer(chunk: string): void {
    this.lastActivityTime = Date.now();
    this.rxBuf += chunk;
    const lines = this.rxBuf.split('\n');
    this.rxBuf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const parsed = JSON.parse(t) as Record<string, unknown>;
        if (parsed.type !== 'samples' && parsed.type !== 'heartbeat' && parsed.type !== 'heartbeat_ack') {
          LogService.addBleRx(t);
        }
        this.dispatch(parsed);
      } catch {
        // malformed JSON — skip
      }
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    if (msg.type === 'samples') {
      const batch = msg.samples as MonitorSample[];
      batch.forEach((s) => this.sampleCbs.forEach((cb) => cb(s)));
      const now = Date.now();
      if (now - this.lastSampleAckMs > 5_000) {
        this.lastSampleAckMs = now;
        this.writeRx(JSON.stringify({ type: 'heartbeat_ack' }) + '\n', false).catch(() => {});
      }
      return;
    }
    if (msg.type === 'sample' || msg.type === 'error') {
      this.sampleCbs.forEach((cb) => cb(msg as unknown as MonitorSample));
      return;
    }
    if (msg.type === 'heartbeat') {
      this.sendHeartbeatAck();
      return;
    }
    if (msg.type === 'heartbeat_ack') return;

    if (msg.status === 'ok' && msg.data === 'pong') return;

    // Defensive: a server that still replies to heartbeat_ack emits this stray
    // error; it must NOT be matched to a pending request (would reject it wrongly).
    if (msg.status === 'error' && typeof msg.message === 'string'
        && msg.message.startsWith('Unknown command')) return;

    const pending = this.queue.shift();
    if (!pending) return;
    clearTimeout(pending.timer);

    if (msg.status === 'ok') {
      pending.resolve(msg.data);
    } else {
      pending.reject(new Error((msg.message as string) ?? 'Server error'));
    }
  }

  // ── Request-response ─────────────────────────────────────────────

  private request<T = unknown>(cmd: object): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const json = JSON.stringify(cmd) + '\n';

      // Keep Pi session alive while waiting for potentially large responses
      const keepalive = setInterval(() => {
        if (this.device) {
          this.writeRx(JSON.stringify({ type: 'heartbeat_ack' }) + '\n', false).catch(() => {});
        }
      }, 5_000);

      const finish = () => clearInterval(keepalive);

      const timer = setTimeout(() => {
        finish();
        const idx = this.queue.findIndex((p) => p.timer === timer);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error(`Tiempo de espera agotado: ${JSON.stringify(cmd)}`));
      }, REQUEST_TIMEOUT_MS);

      this.queue.push({
        resolve: (d) => { finish(); (resolve as (d: unknown) => void)(d); },
        reject:  (e) => { finish(); reject(e); },
        timer,
      });
      this.writeRx(json).catch((e) => {
        finish();
        const idx = this.queue.findIndex((p) => p.timer === timer);
        if (idx !== -1) { clearTimeout(timer); this.queue.splice(idx, 1); }
        reject(e);
      });
    });
  }

  private async writeRx(data: string, withResponse = true): Promise<void> {
    if (!this.device) throw new Error('Sin conexion');
    try {
      const cmdType = (JSON.parse(data.trim()) as Record<string, unknown>)?.cmd as string | undefined;
      if (cmdType !== 'ping' && cmdType !== 'heartbeat_ack') LogService.addBleTx(data.trimEnd());
    } catch { LogService.addBleTx(data.trimEnd()); }
    const bytes = new TextEncoder().encode(data);
    try {
      for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK_BYTES) {
        const slice = bytes.subarray(offset, offset + WRITE_CHUNK_BYTES);
        let bin = '';
        for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i]);
        const b64 = btoa(bin);
        if (withResponse) {
          await this.device.writeCharacteristicWithResponseForService(NUS_SERVICE, RX_CHAR, b64);
        } else {
          await this.device.writeCharacteristicWithoutResponseForService(NUS_SERVICE, RX_CHAR, b64);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      LogService.add('error', `Escritura BLE fallida: ${msg}`);
      throw new Error(`Escritura BLE fallida: ${msg}`);
    }
  }

  // ── Keepalive ────────────────────────────────────────────────────

  private startPingInterval(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (!this.device) return;
      this.writeRx(JSON.stringify({ cmd: 'ping' }) + '\n', false).catch(() => {});
    }, PING_INTERVAL_MS);
  }

  private sendHeartbeatAck(): void {
    if (!this.device) return;
    this.writeRx(JSON.stringify({ type: 'heartbeat_ack' }) + '\n', false).catch(() => {});
  }

  private startActivityMonitor(): void {
    if (this.activityMonitorInterval) clearInterval(this.activityMonitorInterval);
    this.activityMonitorInterval = setInterval(() => {
      if (!this.device) return;
      const elapsed = Date.now() - this.lastActivityTime;
      if (elapsed > CLIENT_TIMEOUT_MS) {
        LogService.add('error', `Tiempo sin actividad (${elapsed}ms) — desconectando`);
        const cb = this.onUnexpectedDisconnect;
        this.disconnect().catch(() => {}).finally(() => cb?.());
      }
    }, INACTIVITY_CHECK_MS);
  }

  // ── Cleanup ──────────────────────────────────────────────────────

  private drainQueue(err: Error): void {
    this.queue.forEach((p) => { clearTimeout(p.timer); p.reject(err); });
    this.queue = [];
  }

  private handleUnexpectedDisconnect(): void {
    // Manual disconnect() already cleaned up and triggers onDisconnected — ignore it.
    if (this.intentionalDisconnect) return;
    LogService.add('error', 'Device disconnected unexpectedly');
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    if (this.activityMonitorInterval) { clearInterval(this.activityMonitorInterval); this.activityMonitorInterval = null; }
    this.txSub?.remove();
    this.txSub = null;
    this.rxBuf = '';
    this.device = null;
    this.sampleCbs.clear();
    this.drainQueue(new Error('Device disconnected unexpectedly'));
    const cb = this.onUnexpectedDisconnect;
    this.onUnexpectedDisconnect = null;
    cb?.();
  }
}

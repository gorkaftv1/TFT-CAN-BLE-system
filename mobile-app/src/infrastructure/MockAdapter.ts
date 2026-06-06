import { IVehicleAdapter } from './IVehicleAdapter';
import { DtcCode } from '../domain/models/DtcCode';
import { MonitorSample } from '../domain/models/MonitorSample';
import { PIDS } from '../config/obd_pids';

export class MockAdapter implements IVehicleAdapter {
  private _connected = false;
  private _interval: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<void> {
    await new Promise((r) => setTimeout(r, 800));
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    this._connected = false;
  }

  isConnected(): boolean { return this._connected; }

  startMonitor(pids: number[], intervalMs: number, onSample: (s: MonitorSample) => void): () => void {
    let tick = 0;
    const pidDefs = PIDS.filter((p) => pids.includes(p.pid));
    this._interval = setInterval(() => {
      tick++;
      for (const def of pidDefs) {
        if (Math.random() < 0.10) {
          onSample({ pid: def.pid, name: def.name, value: 0, unit: def.unit, ts: Date.now(), type: 'error', message: 'Tiempo de espera agotado' });
        } else {
          onSample({ pid: def.pid, name: def.name, value: this.mockValue(def.pid, tick), unit: def.unit, ts: Date.now() });
        }
      }
    }, intervalMs);
    return () => {
      if (this._interval) { clearInterval(this._interval); this._interval = null; }
    };
  }

  private mockValue(pid: number, tick: number): number {
    switch (pid) {
      case 0x0C: return 800 + Math.sin(tick * 0.1) * 400;
      case 0x0D: return Math.max(0, 60 + Math.sin(tick * 0.05) * 40);
      case 0x05: return 85 + Math.sin(tick * 0.02) * 5;
      case 0x11: return 15 + Math.sin(tick * 0.15) * 10;
      case 0x04: return 30 + Math.sin(tick * 0.08) * 20;
      case 0x2F: return 65;
      case 0x42: return 13.8 + Math.sin(tick * 0.01) * 0.3;
      default:   return Math.round(Math.random() * 100);
    }
  }

  async fetchDtcs(): Promise<Array<Pick<DtcCode, 'code' | 'description' | 'severity'>>> {
    return [
      { code: 'P0501', description: 'Rango/rendimiento del sensor de velocidad', severity: 'warning' },
      { code: 'U0415', description: 'Datos invalidos recibidos del modulo ABS', severity: 'warning' },
    ];
  }

  async clearDtcs(): Promise<void> { /* mock: no-op */ }
  async getVin(): Promise<string> { return 'SIMUL000000'; }
  async getSnapshot(): Promise<Record<string, { value: number; unit: string }>> {
    const tick = Date.now() / 1000;
    const result: Record<string, { value: number; unit: string }> = {};
    for (const def of PIDS) {
      if (Math.random() >= 0.10) {
        result[def.name] = { value: this.mockValue(def.pid, tick), unit: def.unit };
      }
      // 10% chance: entry omitted → VehicleService marks it as missing (no update, card shows stale)
    }
    return result;
  }
  async probeAvailablePids(): Promise<number[]> {
    await new Promise((r) => setTimeout(r, 400));
    return PIDS.map((p) => p.pid);
  }

  async getSessions(): Promise<any[]> {
    return [
      { session_id: 3, label: 'BLE real session',         started_at: '2026-05-20T09:10:00.000Z', ended_at: '2026-05-20T09:45:12.000Z', sample_count: 128, dtc_count: 2 },
      { session_id: 2, label: 'BLE real session',         started_at: '2026-05-18T17:30:00.000Z', ended_at: '2026-05-18T17:52:44.000Z', sample_count: 87,  dtc_count: 0 },
      { session_id: 1, label: 'CLI IsoTpTransport (can0)', started_at: '2026-05-15T08:00:00.000Z', ended_at: null,                       sample_count: 34,  dtc_count: 0 },
    ];
  }
  async getSessionDtcs(sessionId: number): Promise<Array<{ code: string; description: string; raw: string }>> {
    if (sessionId === 3) return [
      { code: 'P0501', description: 'Vehicle Speed Sensor Range/Performance', raw: '0501' },
      { code: 'U0415', description: 'Invalid Data Received From ABS Control Module', raw: '0415' },
    ];
    return [];
  }
  async getSessionSamples(sessionId: number, pid?: number, limit = 1000, offset = 0): Promise<any[]> {
    if (sessionId !== 3) return [];
    const base = new Date('2026-05-20T09:10:00.000Z').getTime();
    const all: any[] = [];
    for (let i = 0; i < 30; i++) {
      const ts = new Date(base + i * 5000).toISOString();
      all.push({ pid: 0x0C, name: 'RPM',               value: Math.round(820 + Math.sin(i * 0.3) * 300), unit: 'rpm',  ts });
      all.push({ pid: 0x05, name: 'Temp. refrigerante', value: parseFloat((86 + Math.sin(i * 0.05) * 3).toFixed(1)),   unit: '°C',  ts });
      all.push({ pid: 0x0D, name: 'Velocidad',          value: Math.max(0, Math.round(55 + Math.sin(i * 0.12) * 30)), unit: 'km/h', ts });
      all.push({ pid: 0x04, name: 'Carga del motor',    value: parseFloat((28 + Math.sin(i * 0.2) * 15).toFixed(1)),  unit: '%',   ts });
    }
    const filtered = pid !== undefined ? all.filter((s) => s.pid === pid) : all;
    return filtered.slice(offset, offset + limit);
  }

  async getSessionCommands(sessionId: number): Promise<any[]> {
    if (sessionId !== 3) return [];
    return [
      { command: 'get_vin',               request_hex: '0902', response_hex: '4902013030303030303030303030303030303030', timestamp: '2026-05-20T09:10:00.100Z' },
      { command: 'get_engine_rpm',        request_hex: '010c', response_hex: '410c0a14',                                 timestamp: '2026-05-20T09:10:02.000Z' },
      { command: 'get_coolant_temp',      request_hex: '0105', response_hex: '410566',                                   timestamp: '2026-05-20T09:10:02.050Z' },
      { command: 'get_vehicle_speed',     request_hex: '010d', response_hex: '410dff',                                   timestamp: '2026-05-20T09:10:02.100Z' },
      { command: 'get_throttle_position', request_hex: '0111', response_hex: '411120',                                  timestamp: '2026-05-20T09:10:02.150Z' },
      { command: 'get_dtcs',              request_hex: '03',   response_hex: '4302c4150501',                             timestamp: '2026-05-20T09:44:56.000Z' },
    ];
  }

  async setUdsSession(sessionType: number): Promise<{ session_type: number; p2_server_ms: number; p2_extended_ms: number }> {
    await new Promise((r) => setTimeout(r, 200));
    return { session_type: sessionType, p2_server_ms: 25, p2_extended_ms: 5000 };
  }

  async readUdsDid(did: string): Promise<{ did: string; name: string; value: string | number; unit: string }> {
    await new Promise((r) => setTimeout(r, 100));
    const MOCK: Record<string, { name: string; value: string | number; unit: string }> = {
      '0xF190': { name: 'VIN',                  value: 'SIMUL000000', unit: '' },
      '0xF18C': { name: 'Numero serie ECU',     value: 'SIM1',        unit: '' },
      '0xF189': { name: 'Version software',     value: '1.00',        unit: '' },
      '0x2001': { name: 'Carga del motor',      value: 45.3,          unit: '%' },
      '0x2002': { name: 'Temp. refrigerante',   value: 90,            unit: '°C' },
      '0x2003': { name: 'RPM motor',            value: 1200,          unit: 'rpm' },
      '0x2004': { name: 'Velocidad',            value: 60,            unit: 'km/h' },
      '0x2005': { name: 'Posicion acelerador',  value: 25.5,          unit: '%' },
      '0x2006': { name: 'Nivel combustible',    value: 75.0,          unit: '%' },
      '0x2007': { name: 'Temp. aceite motor',   value: 95,            unit: '°C' },
      '0x2008': { name: 'Tension bateria',      value: 14.2,          unit: 'V' },
    };
    const entry = MOCK[did.toUpperCase()] ?? { name: `DID_${did}`, value: '—', unit: '' };
    return { did, ...entry };
  }
}

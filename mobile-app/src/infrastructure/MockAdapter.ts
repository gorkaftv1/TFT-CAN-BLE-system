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
        onSample({
          pid: def.pid,
          name: def.name,
          value: this.mockValue(def.pid, tick),
          unit: def.unit,
          ts: Date.now(),
        });
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
      { code: 'P0501', description: 'Vehicle Speed Sensor Range/Performance', severity: 'warning' },
      { code: 'U0415', description: 'Invalid Data Received from ABS Control Module', severity: 'warning' },
    ];
  }

  async clearDtcs(): Promise<void> { /* mock: no-op */ }
  async getVin(): Promise<string> { return 'VSSZZZ6JXCR123456'; }
  async getSnapshot(): Promise<Record<string, { value: number; unit: string }>> { return {}; }
  async getSessions(): Promise<any[]> { return []; }
  async getSessionSamples(): Promise<any[]> { return []; }
  async getSessionCommands(): Promise<any[]> { return []; }

  async setUdsSession(sessionType: number): Promise<{ session_type: number; p2_server_ms: number; p2_extended_ms: number }> {
    await new Promise((r) => setTimeout(r, 200));
    return { session_type: sessionType, p2_server_ms: 25, p2_extended_ms: 5000 };
  }

  async readUdsDid(did: string): Promise<{ did: string; name: string; value: string | number; unit: string }> {
    await new Promise((r) => setTimeout(r, 100));
    const MOCK: Record<string, { name: string; value: string | number; unit: string }> = {
      '0xF190': { name: 'VIN',               value: 'VSSZZZ6JXCR123456', unit: '' },
      '0xF18C': { name: 'ECU Serial Number', value: 'SIM1',               unit: '' },
      '0xF189': { name: 'Software Version',  value: '1.00',               unit: '' },
      '0x2001': { name: 'Engine Load',       value: 45.3,                 unit: '%' },
      '0x2002': { name: 'Coolant Temp',      value: 90,                   unit: '°C' },
      '0x2003': { name: 'Engine RPM',        value: 1200,                 unit: 'rpm' },
      '0x2004': { name: 'Vehicle Speed',     value: 60,                   unit: 'km/h' },
      '0x2005': { name: 'Throttle Position', value: 25.5,                 unit: '%' },
      '0x2006': { name: 'Fuel Level',        value: 75.0,                 unit: '%' },
      '0x2007': { name: 'Engine Oil Temp',   value: 95,                   unit: '°C' },
      '0x2008': { name: 'Battery Voltage',   value: 14.2,                 unit: 'V' },
    };
    const entry = MOCK[did.toUpperCase()] ?? { name: `DID_${did}`, value: '—', unit: '' };
    return { did, ...entry };
  }
}

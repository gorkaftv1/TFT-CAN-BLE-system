import { DtcCode } from '../domain/models/DtcCode';
import { MonitorSample } from '../domain/models/MonitorSample';

export interface IVehicleAdapter {
  connect(deviceId?: string, deviceLabel?: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  startMonitor(pids: number[], intervalMs: number, onSample: (s: MonitorSample) => void): () => void;
  fetchDtcs(): Promise<Array<Pick<DtcCode, 'code' | 'description' | 'severity'>>>;
  clearDtcs(): Promise<void>;
  getVin(): Promise<string>;
  getSnapshot(): Promise<Record<string, { value: number; unit: string }>>;
  getSessions(limit?: number): Promise<any[]>;
  getSessionDtcs(sessionId: number): Promise<Array<{ code: string; description: string; raw: string }>>;
  getSessionSamples(sessionId: number, pid?: number, limit?: number, offset?: number): Promise<any[]>;
  getSessionCommands(sessionId: number): Promise<any[]>;
  setUdsSession(sessionType: number): Promise<{ session_type: number; p2_server_ms: number; p2_extended_ms: number }>;
  readUdsDid(did: string): Promise<{ did: string; name: string; value: string | number; unit: string }>;
  probeAvailablePids(): Promise<number[]>;
}

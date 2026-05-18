import { LogType, LogSection, LogEntry } from '../models/LogEntry';
import { useLogsStore } from '../../stores/logsStore';

let _seq = 0;

function sectionFromType(type: LogType): LogSection {
  if (type === 'ble_tx' || type === 'ble_rx') return 'bluetooth';
  if (type === 'obd_tx' || type === 'obd_rx' || type === 'data') return 'obd';
  if (type === 'uds_tx' || type === 'uds_rx') return 'uds';
  return 'app';
}

function push(type: LogType, content: string): void {
  const entry: LogEntry = {
    id: `${Date.now()}-${_seq++}`,
    type,
    section: sectionFromType(type),
    content,
    timestamp: Date.now(),
  };
  useLogsStore.getState().addEntry(entry);
}

export class LogService {
  // BLE TX (app -> Pi)
  static addBleTx(json: string): void {
    let decoded = "command='?'";
    try {
      const obj = JSON.parse(json) as Record<string, unknown>;
      const cmd = (obj.cmd as string) ?? '?';
      decoded = `command='${cmd}'`;
      const pids = obj.pids;
      if (Array.isArray(pids)) {
        decoded += ` pids=[${(pids as number[]).map((p) => '0x' + p.toString(16).toUpperCase()).join(',')}]`;
      }
    } catch {}
    push('ble_tx', `TX - [BLE]\n  RAW    : ${json}\n  DECODED: ${decoded}`);
  }

  // BLE RX (Pi -> app)
  static addBleRx(json: string): void {
    let decoded = "status='?'";
    try {
      const obj = JSON.parse(json) as Record<string, unknown>;
      const type = obj.type as string | undefined;
      const status = obj.status as string | undefined;
      if (type) {
        decoded = `type='${type}'`;
      } else if (status) {
        decoded = `status='${status}'`;
        if (typeof obj.data === 'string') decoded += ` data='${obj.data}'`;
      }
    } catch {}
    const preview = json.length > 200 ? json.slice(0, 200) + '...' : json;
    push('ble_rx', `RX - [BLE]\n  RAW    : ${preview}\n  DECODED: ${decoded}`);
  }

  // OBD2 sample received
  static addObdSample(pid: number, name: string, value: number, unit: string): void {
    const pidHex = `0x${pid.toString(16).toUpperCase().padStart(2, '0')}`;
    const valStr = pid === 0x0C ? Math.round(value).toString() : value.toFixed(2);
    push('data', `RX - [OBD2]\n  PID    : ${pidHex} ${name}\n  VALUE  : ${valStr} ${unit}`);
  }

  // OBD2 error on a PID
  static addObdError(pid: number, name: string, message: string): void {
    const pidHex = `0x${pid.toString(16).toUpperCase().padStart(2, '0')}`;
    push('obd_rx', `RX - [OBD2]\n  PID    : ${pidHex} ${name}\n  ERROR  : ${message}`);
  }

  // UDS TX (command sent to ECU)
  static addUdsTx(cmd: string, detail?: string): void {
    const content = detail
      ? `TX - [UDS]\n  CMD    : ${cmd}\n  DETAIL : ${detail}`
      : `TX - [UDS]\n  CMD    : ${cmd}`;
    push('uds_tx', content);
  }

  // UDS RX (response from ECU)
  static addUdsRx(did: string, name: string, value: string | number, unit?: string): void {
    const valStr = typeof value === 'number' ? value.toFixed(2) : String(value);
    const content = unit
      ? `RX - [UDS]\n  DID    : ${did} ${name}\n  VALUE  : ${valStr} ${unit}`
      : `RX - [UDS]\n  DID    : ${did} ${name}\n  VALUE  : ${valStr}`;
    push('uds_rx', content);
  }

  // Generic app-level logs (info, warning, error, etc.)
  static add(type: LogType, content: string): void {
    push(type, content);
  }
}

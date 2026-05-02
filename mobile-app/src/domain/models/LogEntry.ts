export type LogType =
  | 'ble_tx'    // App → Pi (BLE write)
  | 'ble_rx'    // Pi → App (BLE notify)
  | 'data'      // PID sample received from ECU
  | 'info'      // Command/instruction launched by app
  | 'debug'     // Internal app log
  | 'error'
  | 'warning'
  | 'success'
  | 'command';  // legacy

export interface LogEntry {
  id: string;
  type: LogType;
  content: string;
  timestamp: number;
}

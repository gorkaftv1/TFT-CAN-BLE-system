export type LogSection = 'bluetooth' | 'obd' | 'uds' | 'app';

export type LogType =
  | 'ble_tx' | 'ble_rx'           // bluetooth section
  | 'obd_tx' | 'obd_rx' | 'data' // obd section
  | 'uds_tx' | 'uds_rx'          // uds section
  | 'info' | 'success' | 'warning' | 'error' | 'debug'; // app section

export interface LogEntry {
  id: string;
  type: LogType;
  section: LogSection;
  content: string; // pre-formatted, may contain \n
  timestamp: number;
}

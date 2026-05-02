export type LogType = 'data' | 'command' | 'error' | 'info' | 'debug' | 'warning' | 'success';

export interface LogEntry {
  id: string;
  type: LogType;
  content: string;
  timestamp: number;
}

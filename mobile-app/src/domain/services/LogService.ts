import { LogType, LogEntry } from '../models/LogEntry';
import { useLogsStore } from '../../stores/logsStore';

let _seq = 0;

export class LogService {
  static add(type: LogType, content: string): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${_seq++}`,
      type,
      content,
      timestamp: Date.now(),
    };
    useLogsStore.getState().addEntry(entry);
  }
}

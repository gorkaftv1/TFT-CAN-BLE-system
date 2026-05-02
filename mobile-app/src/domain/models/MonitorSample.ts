export interface MonitorSample {
  pid: number;
  name: string;
  value: number;
  unit: string;
  ts?: number;
  // Push-only error fields (type === 'error')
  type?: 'error';
  message?: string;
}

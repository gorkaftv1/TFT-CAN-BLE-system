export interface PidDefinition {
  pid: number;
  name: string;
  unit: string;
  defaultVisible: boolean;
  colorThresholds?: {
    warn: number;
    danger: number;
    direction: 'up' | 'down'; // 'up' = bad when high, 'down' = bad when low
  };
}

export const PIDS: PidDefinition[] = [
  {
    pid: 0x04, name: 'Engine Load', unit: '%', defaultVisible: true,
    colorThresholds: { warn: 80, danger: 95, direction: 'up' },
  },
  {
    pid: 0x05, name: 'Coolant Temp', unit: '°C', defaultVisible: true,
    colorThresholds: { warn: 95, danger: 105, direction: 'up' },
  },
  { pid: 0x06, name: 'Short Fuel Trim B1', unit: '%',     defaultVisible: false },
  { pid: 0x07, name: 'Long Fuel Trim B1',  unit: '%',     defaultVisible: false },
  { pid: 0x0A, name: 'Fuel Pressure',      unit: 'kPa',   defaultVisible: false },
  { pid: 0x0B, name: 'Intake MAP',         unit: 'kPa',   defaultVisible: false },
  {
    pid: 0x0C, name: 'Engine RPM', unit: 'rpm', defaultVisible: true,
    colorThresholds: { warn: 5000, danger: 6500, direction: 'up' },
  },
  { pid: 0x0D, name: 'Vehicle Speed',      unit: 'km/h',  defaultVisible: true  },
  { pid: 0x0E, name: 'Timing Advance',     unit: '°',     defaultVisible: false },
  { pid: 0x0F, name: 'Intake Air Temp',    unit: '°C',    defaultVisible: false },
  { pid: 0x10, name: 'MAF Air Flow Rate',  unit: 'g/s',   defaultVisible: false },
  { pid: 0x11, name: 'Throttle Position',  unit: '%',     defaultVisible: true  },
  { pid: 0x1F, name: 'Runtime Since Start',unit: 's',     defaultVisible: false },
  { pid: 0x23, name: 'Fuel Rail Pressure', unit: 'kPa',   defaultVisible: false },
  {
    pid: 0x2F, name: 'Fuel Level', unit: '%', defaultVisible: true,
    colorThresholds: { warn: 30, danger: 15, direction: 'down' },
  },
  { pid: 0x31, name: 'Dist Since DTC Clear',    unit: 'km',  defaultVisible: false },
  { pid: 0x33, name: 'Barometric Pressure',      unit: 'kPa', defaultVisible: false },
  {
    pid: 0x42, name: 'Module Voltage', unit: 'V', defaultVisible: true,
    colorThresholds: { warn: 12.0, danger: 11.5, direction: 'down' },
  },
  { pid: 0x43, name: 'Absolute Load',        unit: '%',  defaultVisible: false },
  { pid: 0x46, name: 'Ambient Air Temp',     unit: '°C', defaultVisible: false },
  { pid: 0x47, name: 'Throttle Position B',  unit: '%',  defaultVisible: false },
  { pid: 0x49, name: 'Accelerator Pedal D',  unit: '%',  defaultVisible: false },
  { pid: 0x4A, name: 'Accelerator Pedal E',  unit: '%',  defaultVisible: false },
  {
    pid: 0x5C, name: 'Engine Oil Temp', unit: '°C', defaultVisible: false,
    colorThresholds: { warn: 130, danger: 150, direction: 'up' },
  },
  { pid: 0x5E, name: 'Engine Fuel Rate', unit: 'L/h', defaultVisible: false },
];

export const PID_MAP = new Map<number, PidDefinition>(PIDS.map((p) => [p.pid, p]));

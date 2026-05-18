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
    pid: 0x04, name: 'Carga del motor', unit: '%', defaultVisible: true,
    colorThresholds: { warn: 80, danger: 95, direction: 'up' },
  },
  {
    pid: 0x05, name: 'Temp. refrigerante', unit: '°C', defaultVisible: true,
    colorThresholds: { warn: 95, danger: 105, direction: 'up' },
  },
  { pid: 0x06, name: 'Trim combustible corto B1', unit: '%',     defaultVisible: false },
  { pid: 0x07, name: 'Trim combustible largo B1',  unit: '%',     defaultVisible: false },
  { pid: 0x0A, name: 'Presion combustible',         unit: 'kPa',   defaultVisible: false },
  { pid: 0x0B, name: 'MAP admision',                unit: 'kPa',   defaultVisible: false },
  {
    pid: 0x0C, name: 'RPM motor', unit: 'rpm', defaultVisible: true,
    colorThresholds: { warn: 5000, danger: 6500, direction: 'up' },
  },
  { pid: 0x0D, name: 'Velocidad',              unit: 'km/h',  defaultVisible: true  },
  { pid: 0x0E, name: 'Avance encendido',        unit: '°',     defaultVisible: false },
  { pid: 0x0F, name: 'Temp. aire admision',     unit: '°C',    defaultVisible: false },
  { pid: 0x10, name: 'Flujo MAF',               unit: 'g/s',   defaultVisible: false },
  { pid: 0x11, name: 'Posicion acelerador',      unit: '%',     defaultVisible: true  },
  { pid: 0x1F, name: 'Tiempo encendido',         unit: 's',     defaultVisible: false },
  { pid: 0x23, name: 'Presion rampa combustible',unit: 'kPa',   defaultVisible: false },
  {
    pid: 0x2F, name: 'Nivel combustible', unit: '%', defaultVisible: true,
    colorThresholds: { warn: 30, danger: 15, direction: 'down' },
  },
  { pid: 0x31, name: 'Dist. desde borrado DTC',  unit: 'km',  defaultVisible: false },
  { pid: 0x33, name: 'Presion barometrica',       unit: 'kPa', defaultVisible: false },
  {
    pid: 0x42, name: 'Tension bateria', unit: 'V', defaultVisible: true,
    colorThresholds: { warn: 12.0, danger: 11.5, direction: 'down' },
  },
  { pid: 0x43, name: 'Carga absoluta',            unit: '%',  defaultVisible: false },
  { pid: 0x46, name: 'Temp. aire exterior',       unit: '°C', defaultVisible: false },
  { pid: 0x47, name: 'Posicion acelerador B',     unit: '%',  defaultVisible: false },
  { pid: 0x49, name: 'Pedal acelerador D',        unit: '%',  defaultVisible: false },
  { pid: 0x4A, name: 'Pedal acelerador E',        unit: '%',  defaultVisible: false },
  {
    pid: 0x5C, name: 'Temp. aceite motor', unit: '°C', defaultVisible: false,
    colorThresholds: { warn: 130, danger: 150, direction: 'up' },
  },
  { pid: 0x5E, name: 'Consumo combustible', unit: 'L/h', defaultVisible: false },
];

export const PID_MAP = new Map<number, PidDefinition>(PIDS.map((p) => [p.pid, p]));

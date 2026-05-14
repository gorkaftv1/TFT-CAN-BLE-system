export const UDS_SESSION_DEFAULT    = 1;
export const UDS_SESSION_PROGRAMMING = 2;
export const UDS_SESSION_EXTENDED   = 3;

export interface UdsDidConfig {
  did: number;
  hexStr: string;
  name: string;
  unit: string;
  extendedOnly: boolean;
}

export const STANDARD_DIDS: UdsDidConfig[] = [
  { did: 0xF190, hexStr: '0xF190', name: 'VIN',               unit: '', extendedOnly: false },
  { did: 0xF18C, hexStr: '0xF18C', name: 'ECU Serial Number', unit: '', extendedOnly: false },
  { did: 0xF189, hexStr: '0xF189', name: 'Software Version',  unit: '', extendedOnly: false },
];

export const EXTENDED_DIDS: UdsDidConfig[] = [
  { did: 0x2001, hexStr: '0x2001', name: 'Engine Load',       unit: '%',    extendedOnly: true },
  { did: 0x2002, hexStr: '0x2002', name: 'Coolant Temp',      unit: '°C',   extendedOnly: true },
  { did: 0x2003, hexStr: '0x2003', name: 'Engine RPM',        unit: 'rpm',  extendedOnly: true },
  { did: 0x2004, hexStr: '0x2004', name: 'Vehicle Speed',     unit: 'km/h', extendedOnly: true },
  { did: 0x2005, hexStr: '0x2005', name: 'Throttle Position', unit: '%',    extendedOnly: true },
  { did: 0x2006, hexStr: '0x2006', name: 'Fuel Level',        unit: '%',    extendedOnly: true },
  { did: 0x2007, hexStr: '0x2007', name: 'Engine Oil Temp',   unit: '°C',   extendedOnly: true },
  { did: 0x2008, hexStr: '0x2008', name: 'Battery Voltage',   unit: 'V',    extendedOnly: true },
];

export const ALL_DIDS = [...STANDARD_DIDS, ...EXTENDED_DIDS];

import dtcDb from '../../data/dtcDatabase.json';
import { DtcCode } from '../models/DtcCode';

type DbEntry = { en: string; es?: string; mfr?: string };

export function dtcLookup(code: string): { description: string | null; manufacturer: string | null } {
  const entry = (dtcDb as Record<string, DbEntry>)[code];
  if (!entry) return { description: null, manufacturer: null };
  return {
    description: entry.es ?? entry.en,
    manufacturer: entry.mfr ?? null,
  };
}

export function dtcSeverity(code: string): DtcCode['severity'] {
  const prefix = code[0]?.toUpperCase();
  if (prefix === 'P' || prefix === 'C') return 'warning';
  return 'info';
}

export function dtcEnrich(raw: Pick<DtcCode, 'code' | 'description' | 'severity'>): DtcCode {
  const { description, manufacturer } = dtcLookup(raw.code);
  return {
    ...raw,
    description: description ?? raw.description,
    severity: dtcSeverity(raw.code),
    manufacturer: manufacturer ?? undefined,
  };
}

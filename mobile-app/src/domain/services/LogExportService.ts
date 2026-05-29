import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import { LogEntry, LogSection } from '../models/LogEntry';

function escCsv(value: string): string {
  const s = value.replace(/"/g, '""').replace(/\r?\n/g, ' ↵ ');
  return `"${s}"`;
}

function fmtDatetime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, z = 2) => n.toString().padStart(z, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export async function exportLogsToCsv(
  entries: LogEntry[],
  label = 'log',
  section?: LogSection,
): Promise<void> {
  const rows = section ? entries.filter((e) => e.section === section) : entries;

  const header = 'timestamp,datetime,type,section,content\n';
  const body = rows
    .map((e) => [e.timestamp, escCsv(fmtDatetime(e.timestamp)), escCsv(e.type), escCsv(e.section), escCsv(e.content)].join(','))
    .join('\n');

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `diag_${label}_${ts}.csv`;

  const file = new File(Paths.cache, filename);
  await file.write(header + body);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Compartir no está disponible en este dispositivo.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: `Exportar ${filename}` });
}

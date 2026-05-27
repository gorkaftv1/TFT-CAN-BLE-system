import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { getAdapter } from '../../infrastructure/adapterFactory';
import { Session } from '../../domain/models/Session';
import { colors, fontSize, monoFont, spacing } from '../../shared/theme';

type Tab = 'dtcs' | 'samples' | 'commands';

interface SessionDtc  { code: string; description: string; raw: string; }
interface SessionSample { pid: number; name: string; value: number; unit: string; ts: string; }
interface SessionCommand { ts: string; direction: 'tx' | 'rx'; raw: string; }

interface PidStats {
  pid: number; name: string; unit: string;
  count: number; min: number; max: number; avg: number;
}

function pad(n: number, z = 2) { return n.toString().padStart(z, '0'); }
function fmtTs(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDuration(start: string, end: string | null): string {
  if (!end) return 'Sin cerrar';
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function aggregateSamples(samples: SessionSample[]): PidStats[] {
  const map = new Map<number, PidStats>();
  for (const s of samples) {
    const entry = map.get(s.pid);
    if (!entry) {
      map.set(s.pid, { pid: s.pid, name: s.name, unit: s.unit, count: 1, min: s.value, max: s.value, avg: s.value });
    } else {
      entry.count++;
      if (s.value < entry.min) entry.min = s.value;
      if (s.value > entry.max) entry.max = s.value;
      entry.avg = entry.avg + (s.value - entry.avg) / entry.count;
    }
  }
  return Array.from(map.values());
}

// ── Sub-views ─────────────────────────────────────────────────────

function DtcsTab({ dtcs, loading }: { dtcs: SessionDtc[]; loading: boolean }) {
  if (loading) return <Loader />;
  if (dtcs.length === 0) return <Empty text="Sin averías registradas en esta sesión" />;
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      {dtcs.map((d) => (
        <View key={d.code} style={styles.dtcCard}>
          <Text style={styles.dtcCode}>{d.code}</Text>
          <Text style={styles.dtcDesc}>{d.description}</Text>
          <Text style={styles.dtcRaw}>Raw: {d.raw}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function SamplesTab({ samples, loading }: { samples: SessionSample[]; loading: boolean }) {
  if (loading) return <Loader />;
  if (samples.length === 0) return <Empty text="Sin muestras en esta sesión" />;
  const stats = aggregateSamples(samples);
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.statsHeader}>
        <Text style={[styles.statsCell, styles.statsCellName]}>Sensor</Text>
        <Text style={styles.statsCell}>Muestras</Text>
        <Text style={styles.statsCell}>Mín</Text>
        <Text style={styles.statsCell}>Med</Text>
        <Text style={styles.statsCell}>Máx</Text>
      </View>
      {stats.map((s) => (
        <View key={s.pid} style={styles.statsRow}>
          <View style={styles.statsCellName}>
            <Text style={styles.statsSensorName}>{s.name}</Text>
            <Text style={styles.statsSensorUnit}>{s.unit}</Text>
          </View>
          <Text style={styles.statsCell}>{s.count}</Text>
          <Text style={styles.statsCell}>{s.min.toFixed(1)}</Text>
          <Text style={styles.statsCell}>{s.avg.toFixed(1)}</Text>
          <Text style={styles.statsCell}>{s.max.toFixed(1)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function CommandsTab({ commands, loading }: { commands: SessionCommand[]; loading: boolean }) {
  if (loading) return <Loader />;
  if (commands.length === 0) return <Empty text="Sin comandos registrados en esta sesión" />;
  return (
    <ScrollView contentContainerStyle={styles.logContent}>
      {commands.map((c, i) => (
        <View key={i} style={styles.logLine}>
          <Text style={styles.logTs}>{fmtTs(c.ts)}</Text>
          <Text style={[styles.logDir, c.direction === 'tx' ? styles.logTx : styles.logRx]}>
            {c.direction === 'tx' ? '→' : '←'}
          </Text>
          <Text style={styles.logRaw} numberOfLines={2}>{c.raw}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Loader() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────

interface Props {
  session: Session;
  onBack: () => void;
}

export function SessionDetailView({ session, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('dtcs');
  const [dtcs,     setDtcs]     = useState<SessionDtc[]>([]);
  const [samples,  setSamples]  = useState<SessionSample[]>([]);
  const [commands, setCommands] = useState<SessionCommand[]>([]);
  const [loadingDtcs,     setLoadingDtcs]     = useState(false);
  const [loadingSamples,  setLoadingSamples]  = useState(false);
  const [loadingCommands, setLoadingCommands] = useState(false);

  useEffect(() => {
    setLoadingDtcs(true);
    getAdapter().getSessionDtcs(session.session_id)
      .then(setDtcs)
      .catch(() => setDtcs([]))
      .finally(() => setLoadingDtcs(false));
  }, [session.session_id]);

  useEffect(() => {
    if (tab !== 'samples' || samples.length > 0) return;
    setLoadingSamples(true);
    getAdapter().getSessionSamples(session.session_id)
      .then(setSamples)
      .catch(() => setSamples([]))
      .finally(() => setLoadingSamples(false));
  }, [tab, session.session_id]);

  useEffect(() => {
    if (tab !== 'commands' || commands.length > 0) return;
    setLoadingCommands(true);
    getAdapter().getSessionCommands(session.session_id)
      .then(setCommands)
      .catch(() => setCommands([]))
      .finally(() => setLoadingCommands(false));
  }, [tab, session.session_id]);

  return (
    <View style={styles.root}>
      {/* Back + session info */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.75}>
          <Text style={styles.backLabel}>← Sesiones</Text>
        </TouchableOpacity>
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionDate}>{fmtDate(session.started_at)}</Text>
          <Text style={styles.sessionDur}>{fmtDuration(session.started_at, session.ended_at)}</Text>
        </View>
      </View>

      {/* Tab toggle */}
      <View style={styles.tabBar}>
        {(['dtcs', 'samples', 'commands'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'dtcs' ? 'Averías' : t === 'samples' ? 'Muestras' : 'Comandos'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === 'dtcs'     && <DtcsTab     dtcs={dtcs}         loading={loadingDtcs} />}
      {tab === 'samples'  && <SamplesTab  samples={samples}   loading={loadingSamples} />}
      {tab === 'commands' && <CommandsTab commands={commands} loading={loadingCommands} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: spacing.md,
  },
  backBtn:     { paddingVertical: spacing.xs, paddingRight: spacing.sm },
  backLabel:   { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  sessionMeta: { flex: 1 },
  sessionDate: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  sessionDur:  { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1, alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive:  { borderBottomColor: colors.primary },
  tabLabel:      { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  tabLabelActive:{ color: colors.primary, fontWeight: '700' },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },

  listContent: { padding: spacing.md, gap: spacing.sm },

  // DTCs
  dtcCard: {
    backgroundColor: colors.surface, borderRadius: 10,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 3,
  },
  dtcCode: { fontSize: fontSize.sm, fontWeight: '700', color: colors.warning, fontFamily: monoFont },
  dtcDesc: { fontSize: fontSize.sm, color: colors.text },
  dtcRaw:  { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: monoFont },

  // Samples table
  statsHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  statsCell:     { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  statsCellName: { flex: 2, textAlign: 'left' },
  statsSensorName: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  statsSensorUnit: { fontSize: fontSize.xs, color: colors.textMuted },

  // Commands log
  logContent: { padding: spacing.sm, gap: 2 },
  logLine: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: spacing.xs + 1,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  logTs:  { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: monoFont, width: 52, flexShrink: 0, paddingTop: 1 },
  logDir: { fontSize: fontSize.sm, fontWeight: '700', width: 16, flexShrink: 0 },
  logTx:  { color: colors.primary },
  logRx:  { color: colors.success },
  logRaw: { flex: 1, fontSize: fontSize.xs, color: colors.text, fontFamily: monoFont, lineHeight: 17 },
});

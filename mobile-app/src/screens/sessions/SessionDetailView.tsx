import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { getAdapter } from '../../infrastructure/adapterFactory';
import { Session } from '../../domain/models/Session';
import { colors, fontSize, monoFont, spacing } from '../../shared/theme';

const SAMPLES_DISCOVERY_LIMIT = 50;
const SAMPLES_BATCH_SIZE      = 3;
const SAMPLES_BATCH_DELAY_MS  = 75;

type Tab = 'dtcs' | 'samples' | 'commands';

interface SessionDtc  { code: string; description: string; raw: string; }
interface SessionSample { pid: number; name: string; value: number; unit: string; ts: string; }
interface SessionCommand { ts: string; direction: 'tx' | 'rx'; raw: string; }

interface PidEntry {
  pid:     number;
  name:    string;
  unit:    string;
  samples: SessionSample[];
  loading: boolean;
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

function computeStats(samples: SessionSample[]) {
  if (samples.length === 0) return { count: 0, min: 0, max: 0, avg: 0 };
  let min = samples[0].value, max = samples[0].value, sum = 0;
  for (const s of samples) {
    if (s.value < min) min = s.value;
    if (s.value > max) max = s.value;
    sum += s.value;
  }
  return { count: samples.length, min, max, avg: sum / samples.length };
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

// ── PID expandable card ───────────────────────────────────────────

function PidStatCard({ entry, expanded, onToggle }: {
  entry: PidEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const st = computeStats(entry.samples);
  return (
    <View style={styles.pidCard}>
      <TouchableOpacity style={styles.pidHeader} onPress={onToggle} activeOpacity={0.75}>
        <View style={styles.pidHeaderLeft}>
          <Text style={styles.statsSensorName}>{entry.name}</Text>
          {!!entry.unit && <Text style={styles.statsSensorUnit}>{entry.unit}</Text>}
        </View>
        {entry.loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.pidLoader} />
        ) : (
          <>
            <Text style={styles.statsCell}>{st.count}</Text>
            <Text style={styles.statsCell}>{st.min.toFixed(1)}</Text>
            <Text style={styles.statsCell}>{st.avg.toFixed(1)}</Text>
            <Text style={styles.statsCell}>{st.max.toFixed(1)}</Text>
            <Text style={styles.expandChevron}>{expanded ? '▲' : '▼'}</Text>
          </>
        )}
      </TouchableOpacity>

      {expanded && !entry.loading && (
        <View style={styles.sampleList}>
          <View style={styles.sampleListHeader}>
            <Text style={styles.sampleHdrTs}>Hora</Text>
            <Text style={styles.sampleHdrVal}>Valor</Text>
          </View>
          {entry.samples.map((s, i) => (
            <View key={i} style={[styles.sampleRow, i % 2 === 0 && styles.sampleRowAlt]}>
              <Text style={styles.sampleTs}>{fmtTs(s.ts)}</Text>
              <Text style={styles.sampleVal}>{s.value} {entry.unit}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Samples tab ───────────────────────────────────────────────────

function SamplesTab({ sessionId }: { sessionId: number }) {
  const [pidEntries, setPidEntries] = useState<PidEntry[]>([]);
  const [phase, setPhase]           = useState<'idle' | 'discovering' | 'loading' | 'done'>('idle');
  const [expandedPids, setExpandedPids] = useState<Set<number>>(new Set());
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setPhase('discovering');

    const load = async () => {
      // Discover PIDs with small initial batch
      const discovery = await getAdapter().getSessionSamples(sessionId, undefined, SAMPLES_DISCOVERY_LIMIT);
      if (discovery.length === 0) { setPhase('done'); return; }

      const pidOrder: number[] = [];
      const metaMap: Record<number, { name: string; unit: string }> = {};
      for (const s of discovery) {
        if (!metaMap[s.pid]) { pidOrder.push(s.pid); metaMap[s.pid] = { name: s.name, unit: s.unit }; }
      }

      const initial: PidEntry[] = pidOrder.map((pid) => ({
        pid, name: metaMap[pid].name, unit: metaMap[pid].unit,
        samples: [], loading: true,
      }));
      setPidEntries(initial);
      setPhase('loading');

      // Fetch full sample list per PID in batches
      for (let i = 0; i < pidOrder.length; i += SAMPLES_BATCH_SIZE) {
        const batch = pidOrder.slice(i, i + SAMPLES_BATCH_SIZE);
        for (const pid of batch) {
          try {
            const pidSamples = await getAdapter().getSessionSamples(sessionId, pid);
            setPidEntries((prev) =>
              prev.map((e) => e.pid === pid ? { ...e, samples: pidSamples, loading: false } : e)
            );
          } catch {
            setPidEntries((prev) =>
              prev.map((e) => e.pid === pid ? { ...e, loading: false } : e)
            );
          }
        }
        if (i + SAMPLES_BATCH_SIZE < pidOrder.length) {
          await new Promise<void>((r) => setTimeout(r, SAMPLES_BATCH_DELAY_MS));
        }
      }
      setPhase('done');
    };

    load().catch(() => setPhase('done'));
  }, [sessionId]);

  const togglePid = (pid: number) => {
    setExpandedPids((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  if (phase === 'idle' || phase === 'discovering') return <Loader text="Descubriendo sensores..." />;
  if (pidEntries.length === 0) return <Empty text="Sin muestras en esta sesión" />;

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.statsHeader}>
        <Text style={[styles.statsCellName, styles.statsHeaderLabel]}>Sensor</Text>
        <Text style={[styles.statsCell, styles.statsHeaderLabel]}>#</Text>
        <Text style={[styles.statsCell, styles.statsHeaderLabel]}>Mín</Text>
        <Text style={[styles.statsCell, styles.statsHeaderLabel]}>Med</Text>
        <Text style={[styles.statsCell, styles.statsHeaderLabel]}>Máx</Text>
        <View style={styles.chevronSpacer} />
      </View>
      {pidEntries.map((entry) => (
        <PidStatCard
          key={entry.pid}
          entry={entry}
          expanded={expandedPids.has(entry.pid)}
          onToggle={() => togglePid(entry.pid)}
        />
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

function Loader({ text }: { text?: string } = {}) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {!!text && <Text style={[styles.emptyText, { marginTop: spacing.sm }]}>{text}</Text>}
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
  const [commands, setCommands] = useState<SessionCommand[]>([]);
  const [loadingDtcs,     setLoadingDtcs]     = useState(false);
  const [loadingCommands, setLoadingCommands] = useState(false);

  useEffect(() => {
    setLoadingDtcs(true);
    getAdapter().getSessionDtcs(session.session_id)
      .then(setDtcs)
      .catch(() => setDtcs([]))
      .finally(() => setLoadingDtcs(false));
  }, [session.session_id]);

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
      {tab === 'dtcs'     && <DtcsTab     dtcs={dtcs}     loading={loadingDtcs} />}
      {tab === 'samples'  && <SamplesTab  sessionId={session.session_id} />}
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
  statsHeaderLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  statsCell:     { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  statsCellName: { flex: 2, textAlign: 'left' },
  statsSensorName: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  statsSensorUnit: { fontSize: fontSize.xs, color: colors.textMuted },

  // PID expandable cards
  pidCard: {
    backgroundColor: colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  pidHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    gap: 2,
  },
  pidHeaderLeft: { flex: 2 },
  pidLoader:     { flex: 4.5, alignItems: 'flex-end', paddingRight: spacing.sm },
  expandChevron: { fontSize: 9, color: colors.textMuted, width: 14, textAlign: 'right' },
  chevronSpacer: { width: 14 },

  // Per-PID sample list (expanded)
  sampleList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sampleListHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceElevated,
  },
  sampleHdrTs:  { flex: 1, fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  sampleHdrVal: { flex: 1, fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600', textAlign: 'right' },
  sampleRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 1,
  },
  sampleRowAlt: { backgroundColor: colors.surfaceElevated + '60' },
  sampleTs:  { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: monoFont },
  sampleVal: { flex: 1, fontSize: fontSize.xs, color: colors.text, textAlign: 'right', fontFamily: monoFont },

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

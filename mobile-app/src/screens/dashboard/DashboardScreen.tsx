import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { useConnectionStore } from '../../stores/connectionStore';
import { useDashboardStore, Widget } from '../../stores/dashboardStore';
import { useVehicleStore, PidSample } from '../../stores/vehicleStore';
import { useUdsStore } from '../../stores/udsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePidSupportStore } from '../../stores/pidSupportStore';
import { DisconnectedState } from '../../components/DisconnectedState';
import { VehicleService } from '../../domain/services/VehicleService';
import { PID_MAP } from '../../config/obd_pids';
import { ALL_DIDS, STANDARD_DIDS, UDS_SESSION_EXTENDED, UdsDidConfig } from '../../config/uds_dids';
import { colors, fontSize, spacing } from '../../shared/theme';

type Protocol = 'obd' | 'uds';

function pad(n: number, z = 2) { return n.toString().padStart(z, '0'); }
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isStale(timestamp: number, intervalMs: number): boolean {
  return Date.now() - timestamp > Math.max(intervalMs * 3, 2000);
}

function valueColor(widget: Widget, value: number): string {
  const def = PID_MAP.get(widget.pid);
  if (!def?.colorThresholds) return colors.text;
  const { warn, danger, direction } = def.colorThresholds;
  if (direction === 'up') {
    if (value >= danger) return colors.error;
    if (value >= warn)   return colors.warning;
    return colors.success;
  } else {
    if (value <= danger) return colors.error;
    if (value <= warn)   return colors.warning;
    return colors.success;
  }
}

function formatObdValue(pid: number, value: number): string {
  if (pid === 0x0C) return Math.round(value).toLocaleString();
  if (pid === 0x42) return value.toFixed(2);
  return value.toFixed(1);
}

// ── OBD Card (horizontal) ─────────────────────────────────────────

function ObdCard({ widget, intervalMs }: { widget: Widget; intervalMs: number }) {
  const sample = useVehicleStore((s) => s.samples[widget.pid]) as PidSample | undefined;
  const pidLabel = `PID 0x${widget.pid.toString(16).toUpperCase().padStart(2, '0')}`;

  if (!sample) {
    return (
      <View style={styles.card}>
        <View style={[styles.dot, { backgroundColor: colors.border }]} />
        <Text style={styles.cardName} numberOfLines={1}>{widget.label}</Text>
        <Text style={styles.cardPid}>{pidLabel}</Text>
        <Text style={[styles.cardValue, { color: colors.textMuted }]}>—</Text>
      </View>
    );
  }

  if (sample.error) {
    return (
      <View style={[styles.card, styles.cardWarn]}>
        <View style={[styles.dot, { backgroundColor: colors.warning }]} />
        <Text style={styles.cardName} numberOfLines={1}>{widget.label}</Text>
        <Text style={styles.cardPid}>{pidLabel}</Text>
        <View style={styles.cardRight}>
          <Text style={styles.cardTs}>{fmtTime(sample.timestamp)}</Text>
          <Text style={[styles.cardValue, { color: colors.warning }]} numberOfLines={1}>
            LÍMITE DE TIEMPO
          </Text>
        </View>
      </View>
    );
  }

  const stale = isStale(sample.timestamp, intervalMs);
  const color = stale ? colors.textMuted : valueColor(widget, sample.value);

  return (
    <View style={[styles.card, stale && styles.cardStale]}>
      <View style={[styles.dot, { backgroundColor: stale ? colors.textMuted : colors.success }]} />
      <Text style={styles.cardName} numberOfLines={1}>{widget.label}</Text>
      <Text style={styles.cardPid}>{pidLabel}</Text>
      <View style={styles.cardRight}>
        <Text style={styles.cardTs}>{fmtTime(sample.timestamp)}</Text>
        <Text style={[styles.cardValue, { color }]}>
          {formatObdValue(widget.pid, sample.value)} <Text style={styles.cardUnit}>{widget.unit}</Text>
        </Text>
      </View>
    </View>
  );
}

// ── UDS Card (horizontal) ─────────────────────────────────────────

function UdsCard({ def }: { def: UdsDidConfig }) {
  const didValue = useUdsStore((s) => s.didValues[def.hexStr]);
  const readingDid = useUdsStore((s) => s.readingDid);
  const isReading = readingDid === def.hexStr;

  if (isReading) {
    return (
      <View style={styles.card}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        <Text style={styles.cardName} numberOfLines={1}>{def.name}</Text>
        <Text style={styles.cardPid}>{def.hexStr}</Text>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (didValue === undefined) {
    return (
      <View style={styles.card}>
        <View style={[styles.dot, { backgroundColor: colors.border }]} />
        <Text style={styles.cardName} numberOfLines={1}>{def.name}</Text>
        <Text style={styles.cardPid}>{def.hexStr}</Text>
        <Text style={[styles.cardValue, { color: colors.textMuted }]}>—</Text>
      </View>
    );
  }

  if (didValue === null) {
    return (
      <View style={[styles.card, styles.cardWarn]}>
        <View style={[styles.dot, { backgroundColor: colors.warning }]} />
        <Text style={styles.cardName} numberOfLines={1}>{def.name}</Text>
        <Text style={styles.cardPid}>{def.hexStr}</Text>
        <Text style={[styles.cardValue, { color: colors.warning }]}>Error al leer</Text>
      </View>
    );
  }

  const valStr = def.unit
    ? `${didValue.value} ${def.unit}`
    : String(didValue.value);

  return (
    <View style={styles.card}>
      <View style={[styles.dot, { backgroundColor: colors.success }]} />
      <Text style={styles.cardName} numberOfLines={1}>{def.name}</Text>
      <Text style={styles.cardPid}>{def.hexStr}</Text>
      <View style={styles.cardRight}>
        <Text style={styles.cardTs}>{fmtTime(didValue.timestamp)}</Text>
        <Text style={[styles.cardValue, { color: colors.text }]} numberOfLines={1}>{valStr}</Text>
      </View>
    </View>
  );
}

// ── Column header ─────────────────────────────────────────────────

function CardHeader() {
  return (
    <View style={styles.cardHeaderRow}>
      <View style={styles.dot} />
      <Text style={styles.colName}>Nombre</Text>
      <Text style={styles.colPid}>ID Hex</Text>
      <Text style={styles.colValue}>Valor</Text>
    </View>
  );
}

// ── Color legend ──────────────────────────────────────────────────

const LEGEND_OBD = [
  { color: colors.success, label: 'Normal' },
  { color: colors.warning, label: 'Atención' },
  { color: colors.error,   label: 'Crítico' },
  { color: colors.warning, label: 'Timeout' },
  { color: colors.textMuted, label: 'Sin datos' },
];

const LEGEND_UDS = [
  { color: colors.success,   label: 'OK' },
  { color: colors.primary,   label: 'Leyendo' },
  { color: colors.warning,   label: 'Error' },
  { color: colors.textMuted, label: 'Sin datos' },
];

function ColorLegend({ protocol }: { protocol: Protocol }) {
  const items = protocol === 'obd' ? LEGEND_OBD : LEGEND_UDS;
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────

export function DashboardScreen() {
  const { status } = useConnectionStore();
  const { vin, monitoring } = useVehicleStore();
  const { widgets } = useDashboardStore();
  const { sessionType, readAllLoading, openExtendedSession } = useUdsStore();
  const intervalMs = useSettingsStore((s) => s.monitorIntervalMs);
  const useMock = useSettingsStore((s) => s.useMock);

  const { supportedPids, probing, probe } = usePidSupportStore();

  const [protocol, setProtocol] = useState<Protocol>('obd');
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [udsMonitoring, setUdsMonitoring] = useState(false);
  const udsMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const visibleWidgets = [...widgets]
    .filter((w) => w.visible && (supportedPids === null || supportedPids.includes(w.pid)))
    .sort((a, b) => a.order - b.order);
  const udsItems = sessionType === UDS_SESSION_EXTENDED ? ALL_DIDS : STANDARD_DIDS;

  const handleProtocolSwitch = useCallback((p: Protocol) => {
    // Stop active monitoring when switching protocol
    if (monitoring) VehicleService.stop();
    if (udsMonitoring) {
      if (udsMonitorRef.current) clearInterval(udsMonitorRef.current);
      setUdsMonitoring(false);
    }
    setProtocol(p);
  }, [monitoring, udsMonitoring]);

  const handleSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      if (protocol === 'obd') {
        await VehicleService.snapshot();
      } else {
        await useUdsStore.getState().readAllAvailable();
      }
    } finally {
      setSnapshotLoading(false);
    }
  }, [protocol]);

  const handleMonitorToggle = useCallback(() => {
    if (protocol === 'obd') {
      monitoring ? VehicleService.stop() : VehicleService.start();
    } else {
      if (udsMonitoring) {
        if (udsMonitorRef.current) clearInterval(udsMonitorRef.current);
        udsMonitorRef.current = null;
        setUdsMonitoring(false);
      } else {
        useUdsStore.getState().readAllAvailable();
        udsMonitorRef.current = setInterval(() => {
          useUdsStore.getState().readAllAvailable();
        }, Math.max(intervalMs * 4, 2000));
        setUdsMonitoring(true);
      }
    }
  }, [protocol, monitoring, udsMonitoring, intervalMs]);

  const isMonitoring = protocol === 'obd' ? monitoring : udsMonitoring;
  const isBusy = snapshotLoading || readAllLoading;

  if (!useMock && status !== 'connected') {
    return <DisconnectedState screen="dashboard" />;
  }

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.vinRow}>
          <Text style={styles.vinLabel}>VIN</Text>
          <Text style={styles.vinValue} numberOfLines={1}>{vin ?? 'No disponible'}</Text>
        </View>

        {/* Protocol toggle */}
        <View style={styles.protocolToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, protocol === 'obd' && styles.toggleBtnActive]}
            onPress={() => handleProtocolSwitch('obd')}
            activeOpacity={0.75}
          >
            <Text style={[styles.toggleLabel, protocol === 'obd' && styles.toggleLabelActive]}>OBD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, protocol === 'uds' && styles.toggleBtnActive]}
            onPress={() => handleProtocolSwitch('uds')}
            activeOpacity={0.75}
          >
            <Text style={[styles.toggleLabel, protocol === 'uds' && styles.toggleLabelActive]}>UDS</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Action bar ── */}
      <View style={styles.actionBar}>
        {/* UDS extended session badge */}
        {protocol === 'uds' && (
          <TouchableOpacity
            style={[styles.sessionBtn, sessionType === UDS_SESSION_EXTENDED && styles.sessionBtnActive]}
            onPress={sessionType === UDS_SESSION_EXTENDED
              ? () => useUdsStore.getState().closeToDefaultSession()
              : openExtendedSession}
            activeOpacity={0.75}
          >
            <Text style={[styles.sessionLabel, sessionType === UDS_SESSION_EXTENDED && styles.sessionLabelActive]}>
              {sessionType === UDS_SESSION_EXTENDED ? 'Sesion extendida' : 'Sesion por defecto'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.actionBtns}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.snapshotBtn, (isBusy || isMonitoring) && styles.btnDisabled]}
            onPress={handleSnapshot}
            disabled={isBusy || isMonitoring}
            activeOpacity={0.75}
          >
            {snapshotLoading || readAllLoading
              ? <ActivityIndicator size="small" color={colors.background} />
              : <Text style={styles.actionBtnLabel}>Captura</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, isMonitoring ? styles.stopBtn : styles.monitorBtn]}
            onPress={handleMonitorToggle}
            activeOpacity={0.75}
          >
            <Text style={styles.actionBtnLabel}>{isMonitoring ? 'Detener' : 'Monitorizar'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Live banner ── */}
      {isMonitoring && (
        <View style={styles.liveBanner}>
          <Text style={styles.liveDot}>●</Text>
          <Text style={styles.liveText}>
            {protocol === 'obd' ? 'Monitorizando OBD en tiempo real' : 'Monitorizando UDS en tiempo real'}
          </Text>
        </View>
      )}

      {/* ── PID probe row (OBD only) ── */}
      {protocol === 'obd' && (
        <View style={styles.probeRow}>
          <Text style={styles.probeStatus}>
            {supportedPids === null
              ? 'Sin escanear'
              : `${supportedPids.length} PIDs detectados`}
          </Text>
          <TouchableOpacity
            style={[styles.probeScanBtn, (probing || isMonitoring) && styles.probeScanBtnDisabled]}
            onPress={() => void probe()}
            disabled={probing || isMonitoring}
            activeOpacity={0.75}
          >
            <Text style={styles.probeScanBtnLabel}>
              {probing ? 'Escaneando...' : supportedPids === null ? 'Escanear PIDs' : 'Re-escanear'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Card list ── */}
      <ScrollView contentContainerStyle={styles.list}>
        {protocol === 'obd' ? (
          visibleWidgets.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sin sensores activos</Text>
              <Text style={styles.emptyHint}>Ve a Ajustes para activar los sensores que quieres ver.</Text>
            </View>
          ) : (
            <>
              <CardHeader />
              {visibleWidgets.map((w) => (
                <ObdCard key={w.id} widget={w} intervalMs={intervalMs} />
              ))}
            </>
          )
        ) : (
          <>
            <CardHeader />
            {udsItems.map((def) => (
              <UdsCard key={def.hexStr} def={def} />
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Color legend ── */}
      <ColorLegend protocol={protocol} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  vinRow:   { flex: 1 },
  vinLabel: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  vinValue: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace' },

  protocolToggle: {
    flexDirection: 'row', borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  toggleBtn:       { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, backgroundColor: colors.background },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleLabel:       { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  toggleLabelActive: { color: colors.background },

  actionBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  sessionBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: 6, borderWidth: 1, borderColor: colors.border,
  },
  sessionBtnActive: { borderColor: colors.warning, backgroundColor: colors.warning + '18' },
  sessionLabel:       { fontSize: fontSize.xs, color: colors.textMuted },
  sessionLabelActive: { color: colors.warning, fontWeight: '600' },
  actionBtns:    { flexDirection: 'row', gap: spacing.sm, marginLeft: 'auto' },
  actionBtn:     { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: 8, minWidth: 90, alignItems: 'center' },
  snapshotBtn:   { backgroundColor: colors.primary },
  monitorBtn:    { backgroundColor: colors.success },
  stopBtn:       { backgroundColor: colors.error },
  actionBtnLabel:{ fontSize: fontSize.sm, fontWeight: '700', color: colors.background },
  btnDisabled:   { opacity: 0.4 },

  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.success + '18',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.success + '40',
  },
  liveDot:  { fontSize: 10, color: colors.success },
  liveText: { fontSize: fontSize.xs, color: colors.success, fontWeight: '600' },

  list: { paddingVertical: spacing.xs },

  // Horizontal card
  card: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  cardErr:   { backgroundColor: colors.error + '08' },
  cardWarn:  { backgroundColor: colors.warning + '12' },
  cardStale: { opacity: 0.6 },

  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  cardName: { flex: 2, fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  cardPid:  {
    flex: 1, fontSize: fontSize.xs, color: colors.textMuted,
    fontFamily: 'monospace', textAlign: 'center',
  },
  cardRight: { flex: 1.5, alignItems: 'flex-end' },
  cardTs:    { fontSize: 9, color: colors.textMuted, fontFamily: 'monospace' },
  cardValue: { fontSize: fontSize.sm, fontWeight: '600', textAlign: 'right' },
  cardUnit:  { fontSize: fontSize.xs, fontWeight: '400', color: colors.textMuted },

  probeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  probeStatus:          { fontSize: fontSize.xs, color: colors.textMuted },
  probeScanBtn:         { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 8, backgroundColor: colors.primary },
  probeScanBtnDisabled: { opacity: 0.5 },
  probeScanBtnLabel:    { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },

  cardHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  colName:  { flex: 2, fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  colPid:   { flex: 1, fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  colValue: { flex: 1.5, fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendLabel: { fontSize: fontSize.xs, color: colors.textMuted },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: fontSize.lg, color: colors.textSecondary, marginBottom: spacing.sm, fontWeight: '600' },
  emptyHint:  { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  goBtn:      { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: 10, backgroundColor: colors.primary },
  goBtnLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.background },
});

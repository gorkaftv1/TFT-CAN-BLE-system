import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useConnectionStore } from '../../stores/connectionStore';
import { useDashboardStore, Widget } from '../../stores/dashboardStore';
import { useVehicleStore } from '../../stores/vehicleStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { VehicleService } from '../../domain/services/VehicleService';
import { PID_MAP } from '../../config/obd_pids';
import { colors, fontSize, spacing } from '../../shared/theme';

// Stale threshold: 3× the monitor interval with a 2s minimum
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

function formatValue(pid: number, value: number): string {
  if (pid === 0x0C) return Math.round(value).toLocaleString();
  if (pid === 0x42) return value.toFixed(2);
  return value.toFixed(1);
}

function WidgetCard({ widget, intervalMs }: { widget: Widget; intervalMs: number }) {
  const sample = useVehicleStore((s) => s.samples[widget.pid]);

  if (!sample) {
    return (
      <View style={[styles.card, styles.cardNoData]}>
        <Text style={styles.cardLabel} numberOfLines={2}>{widget.label}</Text>
        <Text style={styles.cardNoDataValue}>—</Text>
        <Text style={styles.cardNoDataHint}>Sin datos</Text>
      </View>
    );
  }

  if (sample.error) {
    return (
      <View style={[styles.card, styles.cardError]}>
        <Text style={styles.cardLabel} numberOfLines={2}>{widget.label}</Text>
        <Text style={[styles.cardValue, { color: colors.error, fontSize: fontSize.lg }]}>!</Text>
        <Text style={styles.cardErrorHint}>Error al leer</Text>
      </View>
    );
  }

  const stale = isStale(sample.timestamp, intervalMs);
  const color = stale ? colors.textMuted : valueColor(widget, sample.value);
  const large = widget.pid === 0x0C;

  return (
    <View style={[styles.card, stale && styles.cardStale]}>
      <Text style={styles.cardLabel} numberOfLines={2}>{widget.label}</Text>
      <Text style={[styles.cardValue, { color, fontSize: large ? fontSize.xxl : fontSize.xl }]}>
        {formatValue(widget.pid, sample.value)}
      </Text>
      <Text style={[styles.cardUnit, stale && styles.cardUnitStale]}>{widget.unit}</Text>
      {stale && <Text style={styles.cardStaleHint}>Sin actualizar</Text>}
    </View>
  );
}

export function DashboardScreen() {
  const { status } = useConnectionStore();
  const { vin, monitoring } = useVehicleStore();
  const { widgets } = useDashboardStore();
  const intervalMs = useSettingsStore((s) => s.monitorIntervalMs);
  const navigation = useNavigation();

  if (status !== 'connected') {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sin conexión</Text>
          <Text style={styles.emptyHint}>Conecta el dispositivo de diagnóstico para ver los datos del vehículo.</Text>
          <TouchableOpacity
            style={styles.goConnectBtn}
            onPress={() => navigation.navigate('Conexión' as never)}
            activeOpacity={0.75}
          >
            <Text style={styles.goConnectLabel}>Ir a Conexión</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const visible = [...widgets].filter((w) => w.visible).sort((a, b) => a.order - b.order);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.vinRow}>
          <Text style={styles.vinLabel}>VIN del vehículo</Text>
          <Text style={styles.vinValue} numberOfLines={1}>{vin ?? 'No disponible'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.monitorBtn, monitoring ? styles.monitorBtnStop : styles.monitorBtnStart]}
          onPress={monitoring ? VehicleService.stop : VehicleService.start}
          activeOpacity={0.75}
        >
          <Text style={styles.monitorBtnLabel}>{monitoring ? '■  Detener' : '▶  Iniciar'}</Text>
        </TouchableOpacity>
      </View>

      {monitoring && (
        <View style={styles.monitoringBanner}>
          <Text style={styles.monitoringBannerText}>● Monitorizando en tiempo real</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.grid}>
        {visible.map((w) => (
          <WidgetCard key={w.id} widget={w} intervalMs={intervalMs} />
        ))}
        {visible.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Sin sensores activos</Text>
            <Text style={styles.emptyHint}>
              Ve a <Text style={styles.emptyBold}>Configurar</Text> para activar los sensores que quieres ver.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  vinRow:     { flex: 1, marginRight: spacing.sm },
  vinLabel:   { fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  vinValue:   { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: 'monospace' },
  monitorBtn:      { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: 8, minWidth: 100, alignItems: 'center' },
  monitorBtnStart: { backgroundColor: colors.success },
  monitorBtnStop:  { backgroundColor: colors.error },
  monitorBtnLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },
  monitoringBanner: {
    backgroundColor: colors.success + '18',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.success + '40',
  },
  monitoringBannerText: { fontSize: fontSize.xs, color: colors.success, fontWeight: '600' },
  grid:  { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm },
  card: {
    width: '48%', margin: '1%', backgroundColor: colors.surface,
    borderRadius: 12, padding: spacing.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, minHeight: 120,
  },
  cardStale: { opacity: 0.6, borderColor: colors.border },
  cardNoData:{ borderStyle: 'dashed' },
  cardError: { borderColor: colors.error + '60', backgroundColor: colors.error + '08' },
  cardLabel:       { fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: spacing.xs, textAlign: 'center' },
  cardValue:       { fontWeight: '700' },
  cardUnit:        { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  cardUnitStale:   { color: colors.textMuted },
  cardStaleHint:   { fontSize: 9, color: colors.textMuted, marginTop: 3, fontStyle: 'italic' },
  cardNoDataValue: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.textMuted },
  cardNoDataHint:  { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  cardErrorHint:   { fontSize: fontSize.xs, color: colors.error, marginTop: spacing.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: fontSize.lg, color: colors.textSecondary, marginBottom: spacing.sm, fontWeight: '600' },
  emptyHint:  { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  emptyBold:  { fontWeight: '700', color: colors.textSecondary },
  goConnectBtn:  { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: 10, backgroundColor: colors.primary },
  goConnectLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.background },
});

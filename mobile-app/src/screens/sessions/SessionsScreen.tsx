import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ListRenderItem, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SessionDetailView } from './SessionDetailView';
import { useSessionStore } from '../../stores/sessionStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useVehicleStore } from '../../stores/vehicleStore';
import { DisconnectedState } from '../../components/DisconnectedState';
import { Session } from '../../domain/models/Session';
import { colors, fontSize, spacing } from '../../shared/theme';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'Sin cerrar';
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function SessionCard({ item, onPress }: { item: Session; onPress: () => void }) {
  const isOpen = item.ended_at === null;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <Text style={styles.date}>{formatDate(item.started_at)}</Text>
        {isOpen && <View style={styles.openBadge}><Text style={styles.openBadgeText}>Sin cerrar</Text></View>}
      </View>

      <View style={styles.row}>
        <Stat label="Inicio"    value={formatTime(item.started_at)} />
        <Stat label="Duración"  value={formatDuration(item.started_at, item.ended_at)} />
        <Stat label="Muestras"  value={String(item.sample_count)} />
        <Stat label="Averías"   value={String(item.dtc_count)}
              valueColor={item.dtc_count ? colors.warning : undefined} />
      </View>

      <Text style={styles.label}>{item.label}</Text>
    </TouchableOpacity>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function SessionsScreen() {
  const { status } = useConnectionStore();
  const useMock = useSettingsStore((s) => s.useMock);
  const vin = useVehicleStore((s) => s.vin);
  const { sessions, loading, error, fetch } = useSessionStore();
  const [selected, setSelected] = useState<Session | null>(null);

  useEffect(() => { void fetch(); }, []);

  if (!useMock && status !== 'connected') {
    return <DisconnectedState screen="dtc" />;
  }

  if (selected) {
    return <SessionDetailView session={selected} onBack={() => setSelected(null)} />;
  }

  const renderItem: ListRenderItem<Session> = ({ item }) => (
    <SessionCard item={item} onPress={() => setSelected(item)} />
  );

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View>
          <Text style={styles.vinLabel}>VIN</Text>
          <Text style={styles.vinValue}>{vin || '—'}</Text>
        </View>
        <TouchableOpacity style={styles.btnRefresh} onPress={fetch} disabled={loading} activeOpacity={0.75}>
          <Text style={styles.btnRefreshLabel}>{loading ? 'Cargando…' : 'Actualizar'}</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={sessions}
        renderItem={renderItem}
        keyExtractor={(s) => String(s.session_id)}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sin sesiones</Text>
              <Text style={styles.emptyText}>Pulsa Actualizar para cargar el historial del adaptador.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Cargando sesiones…</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: colors.background },
  toolbar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  vinLabel:         { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 1 },
  vinValue:         { fontSize: fontSize.sm, color: colors.text, fontFamily: 'monospace', fontWeight: '600' },
  btnRefresh:       { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6, backgroundColor: colors.primary },
  btnRefreshLabel:  { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },
  errorText:        { fontSize: fontSize.sm, color: colors.error, padding: spacing.md, textAlign: 'center' },
  list:             { flex: 1 },
  listContent:      { padding: spacing.md, gap: spacing.sm },
  card:             { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date:             { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  openBadge:        { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.warning + '22', borderWidth: 1, borderColor: colors.warning + '60' },
  openBadgeText:    { fontSize: fontSize.xs, color: colors.warning, fontWeight: '600' },
  row:              { flexDirection: 'row', gap: spacing.sm },
  stat:             { flex: 1, alignItems: 'center', backgroundColor: colors.background, borderRadius: 8, paddingVertical: spacing.sm },
  statValue:        { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  statLabel:        { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  label:            { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  empty:            { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle:       { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600' },
  emptyText:        { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  loadingText:      { fontSize: fontSize.sm, color: colors.textMuted },
});

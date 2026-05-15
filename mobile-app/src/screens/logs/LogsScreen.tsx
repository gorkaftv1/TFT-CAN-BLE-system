import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, ListRenderItem, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLogsStore } from '../../stores/logsStore';
import { LogEntry, LogType } from '../../domain/models/LogEntry';
import { colors, fontSize, spacing } from '../../shared/theme';

type Tab = 'bluetooth' | 'data' | 'sistema' | 'errores';

const TABS: { key: Tab; label: string; types: LogType[]; emptyMsg: string }[] = [
  {
    key: 'bluetooth',
    label: 'Bluetooth',
    types: ['ble_tx', 'ble_rx'],
    emptyMsg: 'Sin actividad Bluetooth. Conecta un dispositivo para ver los mensajes enviados y recibidos.',
  },
  {
    key: 'data',
    label: 'Datos',
    types: ['data'],
    emptyMsg: 'Sin datos recibidos. Inicia la monitorización en el Panel para ver los valores del vehículo.',
  },
  {
    key: 'sistema',
    label: 'Sistema',
    types: ['info', 'success', 'warning'],
    emptyMsg: 'Sin eventos de sistema.',
  },
  {
    key: 'errores',
    label: 'Errores',
    types: ['debug', 'error'],
    emptyMsg: 'Sin errores registrados.',
  },
];

const TYPE_COLOR: Partial<Record<LogType, string>> = {
  ble_tx:  '#4fc3f7',
  ble_rx:  '#81c784',
  data:    colors.primary,
  info:    colors.textSecondary,
  success: colors.success,
  warning: colors.warning,
  error:   colors.error,
  debug:   colors.textMuted,
  command: colors.warning,
};

const TYPE_LABEL: Partial<Record<LogType, string>> = {
  ble_tx:  '↑ Enviado',
  ble_rx:  '↓ Recibido',
  info:    'INFO',
  success: 'OK',
  warning: 'AVISO',
  error:   'ERROR',
  debug:   'DEBUG',
  data:    'DATO',
  command: 'CMD',
};

function pad(n: number, z = 2) { return n.toString().padStart(z, '0'); }
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function EntryRow({ entry }: { entry: LogEntry }) {
  const color = TYPE_COLOR[entry.type] ?? colors.text;
  const label = TYPE_LABEL[entry.type] ?? entry.type.toUpperCase();
  return (
    <View style={styles.row}>
      <Text style={styles.ts}>{fmtTime(entry.timestamp)}</Text>
      <View style={[styles.badge, { borderColor: color, backgroundColor: color + '22' }]}>
        <Text style={[styles.badgeText, { color }]}>{label}</Text>
      </View>
      <Text style={styles.content} numberOfLines={3}>{entry.content}</Text>
    </View>
  );
}

export function LogsScreen() {
  const entries   = useLogsStore((s) => s.entries);
  const clearLogs = useLogsStore((s) => s.clearLogs);
  const [tab, setTab] = useState<Tab>('bluetooth');

  const activeTab = useMemo(() => TABS.find((t) => t.key === tab)!, [tab]);

  const filtered = useMemo(
    () => entries.filter((e) => (activeTab.types as string[]).includes(e.type)),
    [entries, activeTab],
  );

  const countByTab = useMemo(() => {
    const counts: Record<Tab, number> = { bluetooth: 0, data: 0, sistema: 0, errores: 0 };
    for (const e of entries) {
      for (const t of TABS) {
        if ((t.types as string[]).includes(e.type)) { counts[t.key]++; break; }
      }
    }
    return counts;
  }, [entries]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Borrar registros',
      '¿Seguro que quieres borrar todos los registros? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: clearLogs },
      ],
    );
  }, [clearLogs]);

  const renderItem: ListRenderItem<LogEntry> = useCallback(({ item }) => <EntryRow entry={item} />, []);

  return (
    <View style={styles.root}>
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const count = countByTab[t.key];
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                {t.label}
              </Text>
              {count > 0 && (
                <View style={[styles.badge2, tab === t.key && styles.badge2Active]}>
                  <Text style={[styles.badge2Text, tab === t.key && styles.badge2TextActive]}>
                    {count > 999 ? '999+' : count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.countRow}>
        <Text style={styles.count}>{filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}</Text>
        <TouchableOpacity onPress={handleClearAll}>
          <Text style={styles.clearText}>Borrar todo</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        inverted
        initialNumToRender={40}
        maxToRenderPerBatch={40}
        windowSize={8}
        removeClippedSubviews
        ListEmptyComponent={
          <Text style={styles.emptyText}>{activeTab.emptyMsg}</Text>
        }
      />
    </View>
  );
}

const monoFont = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    gap: 3,
  },
  tabBtnActive:    { borderBottomColor: colors.primary },
  tabLabel:        { fontSize: fontSize.xs, color: colors.textSecondary },
  tabLabelActive:  { color: colors.primary, fontWeight: '600' },
  badge2: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8,
    backgroundColor: colors.border, minWidth: 18, alignItems: 'center',
  },
  badge2Active:    { backgroundColor: colors.primary + '33' },
  badge2Text:      { fontSize: 9, color: colors.textMuted, fontWeight: '700' },
  badge2TextActive:{ color: colors.primary },
  countRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  count:     { fontSize: fontSize.xs, color: colors.textMuted },
  clearText: { fontSize: fontSize.xs, color: colors.error },
  list:      { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  ts:        { fontFamily: monoFont, fontSize: 10, color: colors.textMuted, marginRight: spacing.xs, minWidth: 84, paddingTop: 2 },
  badge:     { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1, marginRight: spacing.xs, alignSelf: 'flex-start', minWidth: 60, alignItems: 'center' },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  content:   { flex: 1, fontFamily: monoFont, fontSize: fontSize.xs, color: colors.text, lineHeight: 17 },
  emptyText: { textAlign: 'center', color: colors.textMuted, padding: spacing.xl, fontSize: fontSize.sm, lineHeight: 22 },
});

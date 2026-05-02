import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLogsStore } from '../../stores/logsStore';
import { LogEntry, LogType } from '../../domain/models/LogEntry';
import { colors, fontSize, spacing } from '../../shared/theme';

type Tab = 'comunicacion' | 'data' | 'info' | 'debug';

const TABS: { key: Tab; label: string; types: LogType[] }[] = [
  { key: 'comunicacion', label: 'Comunicación', types: ['ble_tx', 'ble_rx'] },
  { key: 'data',         label: 'Data',         types: ['data'] },
  { key: 'info',         label: 'Info',         types: ['info', 'success', 'warning'] },
  { key: 'debug',        label: 'Debug',        types: ['debug', 'error'] },
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
  ble_tx: 'TX',
  ble_rx: 'RX',
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
  const [tab, setTab] = useState<Tab>('comunicacion');

  const activeTypes = useMemo(() => TABS.find((t) => t.key === tab)!.types, [tab]);

  const filtered = useMemo(
    () => entries.filter((e) => (activeTypes as string[]).includes(e.type)),
    [entries, activeTypes],
  );

  const renderItem: ListRenderItem<LogEntry> = useCallback(({ item }) => <EntryRow entry={item} />, []);

  return (
    <View style={styles.root}>
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.countRow}>
        <Text style={styles.count}>{filtered.length} entries</Text>
        <TouchableOpacity onPress={clearLogs}>
          <Text style={styles.clearText}>Clear all</Text>
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
        ListEmptyComponent={<Text style={styles.emptyText}>No entries</Text>}
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
  },
  tabBtnActive:   { borderBottomColor: colors.primary },
  tabLabel:       { fontSize: fontSize.xs, color: colors.textSecondary },
  tabLabelActive: { color: colors.primary, fontWeight: '600' },
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
  badge:     { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1, marginRight: spacing.xs, alignSelf: 'flex-start' },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  content:   { flex: 1, fontFamily: monoFont, fontSize: fontSize.xs, color: colors.text, lineHeight: 17 },
  emptyText: { textAlign: 'center', color: colors.textMuted, padding: spacing.xl, fontSize: fontSize.sm },
});

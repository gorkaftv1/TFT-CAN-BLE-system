import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, FlatList, ListRenderItem, Platform,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useLogsStore } from '../../stores/logsStore';
import { LogEntry, LogSection, LogType } from '../../domain/models/LogEntry';
import { colors, fontSize, spacing } from '../../shared/theme';

const monoFont = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

type TabKey = LogSection;

const TABS: { key: TabKey; label: string; emptyMsg: string }[] = [
  { key: 'bluetooth', label: 'BLE',  emptyMsg: 'Sin actividad Bluetooth.' },
  { key: 'obd',       label: 'OBD',  emptyMsg: 'Sin datos OBD. Inicia la monitorizacion o captura en el Panel.' },
  { key: 'uds',       label: 'UDS',  emptyMsg: 'Sin actividad UDS.' },
  { key: 'app',       label: 'App',  emptyMsg: 'Sin eventos de aplicacion.' },
];

const TYPE_COLOR: Partial<Record<LogType, string>> = {
  ble_tx:  colors.warning,
  ble_rx:  colors.success,
  obd_tx:  colors.warning,
  obd_rx:  colors.success,
  data:    colors.primary,
  uds_tx:  '#c084fc',
  uds_rx:  '#a78bfa',
  info:    colors.textSecondary,
  success: colors.success,
  warning: colors.warning,
  error:   colors.error,
  debug:   colors.textMuted,
};

function pad(n: number, z = 2) { return n.toString().padStart(z, '0'); }
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function EntryRow({ entry }: { entry: LogEntry }) {
  const color = TYPE_COLOR[entry.type] ?? colors.textSecondary;
  const lines = entry.content.split('\n');
  const header = lines[0];
  const rest   = lines.slice(1);

  return (
    <View style={styles.row}>
      <Text style={styles.ts}>{fmtTime(entry.timestamp)}</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.headerLine, { color }]}>{header}</Text>
        {rest.map((line, i) => (
          <Text key={i} style={styles.bodyLine}>{line}</Text>
        ))}
      </View>
    </View>
  );
}

export function ConsoleScreen() {
  const entries    = useLogsStore((s) => s.entries);
  const clearSection = useLogsStore((s) => s.clearSection);
  const clearAll   = useLogsStore((s) => s.clearAll);
  const [tab, setTab] = useState<TabKey>('bluetooth');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<FlatList<LogEntry>>(null);

  const activeTab = useMemo(() => TABS.find((t) => t.key === tab)!, [tab]);

  const filtered = useMemo(
    () => entries.filter((e) => e.section === tab),
    [entries, tab],
  );

  const countByTab = useMemo(() => {
    const counts: Record<TabKey, number> = { bluetooth: 0, obd: 0, uds: 0, app: 0 };
    for (const e of entries) counts[e.section]++;
    return counts;
  }, [entries]);

  useEffect(() => {
    if (autoScroll && filtered.length > 0) {
      listRef.current?.scrollToEnd({ animated: false });
    }
  }, [filtered.length, autoScroll]);

  const handleClear = useCallback(() => {
    Alert.alert(
      'Borrar registros',
      `Borrar todos los registros de la seccion "${activeTab.label}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => clearSection(tab) },
      ],
    );
  }, [tab, activeTab, clearSection]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Borrar todo',
      'Borrar todos los registros de todas las secciones?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: clearAll },
      ],
    );
  }, [clearAll]);

  const renderItem: ListRenderItem<LogEntry> = useCallback(
    ({ item }) => <EntryRow entry={item} />,
    [],
  );

  return (
    <View style={styles.root}>
      {/* ── Tab bar ── */}
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
                <View style={[styles.badge, tab === t.key && styles.badgeActive]}>
                  <Text style={[styles.badgeText, tab === t.key && styles.badgeTextActive]}>
                    {count > 999 ? '999+' : count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Toolbar ── */}
      <View style={styles.toolbar}>
        <Text style={styles.count}>{filtered.length} entradas</Text>
        <View style={styles.toolbarRight}>
          <TouchableOpacity
            style={[styles.iconBtn, autoScroll && styles.iconBtnActive]}
            onPress={() => setAutoScroll(!autoScroll)}
          >
            <Text style={[styles.iconBtnLabel, autoScroll && styles.iconBtnLabelActive]}>
              {autoScroll ? 'Auto' : 'Manual'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnDanger]} onPress={handleClear}>
            <Text style={styles.iconBtnDangerLabel}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearAllLabel}>Todo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{activeTab.emptyMsg}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => autoScroll && listRef.current?.scrollToEnd({ animated: false })}
          initialNumToRender={50}
          maxToRenderPerBatch={50}
          windowSize={8}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1117' },

  tabBar: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent', gap: 3,
  },
  tabBtnActive:    { borderBottomColor: colors.primary },
  tabLabel:        { fontSize: fontSize.xs, color: colors.textSecondary },
  tabLabelActive:  { color: colors.primary, fontWeight: '600' },
  badge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8,
    backgroundColor: colors.border, minWidth: 18, alignItems: 'center',
  },
  badgeActive:    { backgroundColor: colors.primary + '33' },
  badgeText:      { fontSize: 9, color: colors.textMuted, fontWeight: '700' },
  badgeTextActive:{ color: colors.primary },

  toolbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  count:        { fontSize: fontSize.xs, color: colors.textMuted },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  iconBtnActive:      { borderColor: colors.success, backgroundColor: colors.success + '20' },
  iconBtnLabel:       { fontSize: fontSize.xs, color: colors.textMuted },
  iconBtnLabelActive: { color: colors.success, fontWeight: '600' },
  iconBtnDanger:      { borderColor: colors.error },
  iconBtnDangerLabel: { fontSize: fontSize.xs, color: colors.error },
  clearAllLabel:      { fontSize: fontSize.xs, color: colors.textMuted },

  list:        { flex: 1 },
  listContent: { paddingVertical: spacing.xs },

  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1e2a38',
  },
  ts:       { fontFamily: monoFont, fontSize: 9, color: '#4a5568', marginRight: spacing.xs, minWidth: 78, paddingTop: 2 },
  rowBody:  { flex: 1 },
  headerLine: { fontFamily: monoFont, fontSize: 11, fontWeight: '700', lineHeight: 18 },
  bodyLine:   { fontFamily: monoFont, fontSize: 10, color: '#6b7280', lineHeight: 16, paddingLeft: spacing.xs },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 22 },
});

import React from 'react';
import { ActivityIndicator, FlatList, ListRenderItem, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDtcStore } from '../../stores/dtcStore';
import { DtcCode } from '../../domain/models/DtcCode';
import { colors, fontSize, spacing } from '../../shared/theme';

const SEVERITY_COLOR = { info: colors.primary, warning: colors.warning, error: colors.error };

function DtcRow({ item }: { item: DtcCode }) {
  const color = SEVERITY_COLOR[item.severity];
  return (
    <View style={styles.row}>
      <View style={[styles.codeBadge, { borderColor: color, backgroundColor: color + '22' }]}>
        <Text style={[styles.codeText, { color }]}>{item.code}</Text>
      </View>
      <Text style={styles.desc} numberOfLines={3}>{item.description}</Text>
    </View>
  );
}

export function DtcScreen() {
  const { codes, loading, error, fetch, clear } = useDtcStore();

  const renderItem: ListRenderItem<DtcCode> = ({ item }) => <DtcRow item={item} />;

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={styles.count}>{codes.length} fault code{codes.length !== 1 ? 's' : ''}</Text>
        <View style={styles.toolbarRight}>
          <TouchableOpacity style={styles.btnScan} onPress={fetch} disabled={loading} activeOpacity={0.75}>
            <Text style={styles.btnScanLabel}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnClear, codes.length === 0 && styles.btnDisabled]}
            onPress={clear} disabled={loading || codes.length === 0} activeOpacity={0.75}
          >
            <Text style={styles.btnClearLabel}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />}
      {error   && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={codes}
        renderItem={renderItem}
        keyExtractor={(item) => item.code}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? <Text style={styles.emptyText}>No fault codes — press Scan to read from ECU</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  count:       { fontSize: fontSize.sm, color: colors.textSecondary },
  toolbarRight: { flexDirection: 'row', gap: spacing.sm },
  btnScan:     { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6, backgroundColor: colors.primary },
  btnScanLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },
  btnClear:     { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6, borderWidth: 1, borderColor: colors.error },
  btnClearLabel: { fontSize: fontSize.sm, color: colors.error },
  btnDisabled:  { opacity: 0.35 },
  errorText:    { fontSize: fontSize.sm, color: colors.error, padding: spacing.md, textAlign: 'center' },
  list:         { flex: 1 },
  listContent:  { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surface,
    borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  codeBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 6, borderWidth: 1, marginRight: spacing.md, minWidth: 72, alignItems: 'center' },
  codeText:  { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'monospace' },
  desc:      { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
  emptyText: { textAlign: 'center', color: colors.textMuted, padding: spacing.xl, fontSize: fontSize.sm },
});

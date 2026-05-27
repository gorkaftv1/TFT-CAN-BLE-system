import React from 'react';
import { ActivityIndicator, Alert, FlatList, ListRenderItem, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDtcStore } from '../../stores/dtcStore';
import { DtcCode } from '../../domain/models/DtcCode';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { DisconnectedState } from '../../components/DisconnectedState';
import { colors, fontSize, spacing } from '../../shared/theme';

const SEVERITY_COLOR = { info: colors.primary, warning: colors.warning, error: colors.error };
const SEVERITY_LABEL = { info: 'Informativo', warning: 'Aviso', error: 'Fallo grave' };

function DtcRow({ item }: { item: DtcCode }) {
  const color = SEVERITY_COLOR[item.severity];
  return (
    <View style={styles.row}>
      <View style={[styles.codeBadge, { borderColor: color, backgroundColor: color + '22' }]}>
        <Text style={[styles.codeText, { color }]}>{item.code}</Text>
        <Text style={[styles.severityText, { color }]}>{SEVERITY_LABEL[item.severity]}</Text>
      </View>
      <View style={styles.descCol}>
        <Text style={styles.desc} numberOfLines={3}>{item.description}</Text>
        {item.manufacturer && (
          <Text style={styles.mfrTag}>{item.manufacturer}</Text>
        )}
      </View>
    </View>
  );
}

export function DtcScreen() {
  const { status } = useConnectionStore();
  const useMock = useSettingsStore((s) => s.useMock);
  const { codes, loading, error, fetch, clear } = useDtcStore();

  if (!useMock && status !== 'connected') {
    return <DisconnectedState screen="dtc" />;
  }

  const handleClear = () => {
    Alert.alert(
      'Borrar códigos de avería',
      'Esta acción borrará todos los códigos de avería de la memoria del vehículo y apagará el indicador de motor.\n\nEsta operación no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar averías', style: 'destructive', onPress: clear },
      ],
    );
  };

  const renderItem: ListRenderItem<DtcCode> = ({ item }) => <DtcRow item={item} />;

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={styles.count}>
          {codes.length === 0 ? 'Sin averías' : `${codes.length} ${codes.length === 1 ? 'avería' : 'averías'}`}
        </Text>
        <View style={styles.toolbarRight}>
          <TouchableOpacity style={styles.btnScan} onPress={fetch} disabled={loading} activeOpacity={0.75}>
            <Text style={styles.btnScanLabel}>{loading ? 'Escaneando…' : 'Escanear'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnClear, (loading || codes.length === 0) && styles.btnDisabled]}
            onPress={handleClear}
            disabled={loading || codes.length === 0}
            activeOpacity={0.75}
          >
            <Text style={styles.btnClearLabel}>Borrar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Leyendo la memoria del vehículo…</Text>
        </View>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={codes}
        renderItem={renderItem}
        keyExtractor={(item) => item.code}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Sin averías detectadas</Text>
              <Text style={styles.emptyText}>
                Pulsa <Text style={styles.emptyBold}>Escanear</Text> para leer los códigos de avería almacenados en el vehículo.
              </Text>
            </View>
          ) : null
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
  count:        { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  toolbarRight: { flexDirection: 'row', gap: spacing.sm },
  btnScan:      { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6, backgroundColor: colors.primary },
  btnScanLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },
  btnClear:     { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6, borderWidth: 1, borderColor: colors.error },
  btnClearLabel:{ fontSize: fontSize.sm, color: colors.error },
  btnDisabled:  { opacity: 0.35 },
  loadingRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.primary + '10' },
  loadingText:  { fontSize: fontSize.sm, color: colors.primary },
  errorText:    { fontSize: fontSize.sm, color: colors.error, padding: spacing.md, textAlign: 'center' },
  list:         { flex: 1 },
  listContent:  { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surface,
    borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  codeBadge:    { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 6, borderWidth: 1, marginRight: spacing.md, minWidth: 80, alignItems: 'center' },
  codeText:     { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'monospace' },
  severityText: { fontSize: 9, marginTop: 2, fontWeight: '500' },
  descCol:      { flex: 1 },
  desc:         { fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
  mfrTag:       { marginTop: 4, fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  emptyContainer:{ alignItems: 'center', padding: spacing.xl },
  emptyTitle:   { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600', marginBottom: spacing.sm },
  emptyText:    { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyBold:    { fontWeight: '700', color: colors.textSecondary },
});

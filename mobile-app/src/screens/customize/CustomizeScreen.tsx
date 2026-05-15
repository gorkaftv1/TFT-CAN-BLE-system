import React, { useEffect, useState } from 'react';
import { FlatList, ListRenderItem, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDashboardStore, Widget } from '../../stores/dashboardStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { colors, fontSize, spacing } from '../../shared/theme';

const INTERVAL_OPTIONS = [
  { label: 'Tiempo real (250 ms)', value: 250 },
  { label: 'Normal (500 ms)',      value: 500 },
  { label: 'Lento (1 s)',          value: 1000 },
  { label: 'Muy lento (2 s)',      value: 2000 },
];

function WidgetRow({
  item, index, total, onToggle, onUp, onDown,
}: {
  item: Widget; index: number; total: number;
  onToggle: (id: string) => void; onUp: (id: string) => void; onDown: (id: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Switch
        value={item.visible}
        onValueChange={() => onToggle(item.id)}
        trackColor={{ false: colors.border, true: colors.primary + '88' }}
        thumbColor={item.visible ? colors.primary : colors.textMuted}
      />
      <View style={styles.rowInfo}>
        <Text style={[styles.rowLabel, !item.visible && styles.rowLabelDim]}>{item.label}</Text>
        <Text style={styles.rowUnit}>{item.unit}</Text>
      </View>
      <View style={styles.arrows}>
        <TouchableOpacity
          style={[styles.arrowBtn, index === 0 && styles.arrowBtnDim]}
          onPress={() => onUp(item.id)} disabled={index === 0}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.arrowText}>▲</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.arrowBtn, index === total - 1 && styles.arrowBtnDim]}
          onPress={() => onDown(item.id)} disabled={index === total - 1}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.arrowText}>▼</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function CustomizeScreen() {
  const { widgets, loaded, toggleWidget, moveUp, moveDown, loadFromStorage } = useDashboardStore();
  const { deviceName, monitorIntervalMs, loaded: settingsLoaded, setDeviceName, setMonitorInterval, loadFromStorage: loadSettings } = useSettingsStore();

  const [deviceNameInput, setDeviceNameInput] = useState(deviceName);

  useEffect(() => {
    if (!loaded) void loadFromStorage();
    if (!settingsLoaded) void loadSettings();
  }, [loaded, settingsLoaded]);

  useEffect(() => {
    setDeviceNameInput(deviceName);
  }, [deviceName]);

  const sorted = [...widgets].sort((a, b) => a.order - b.order);
  const visible = sorted.filter((w) => w.visible).length;

  const renderItem: ListRenderItem<Widget> = ({ item, index }) => (
    <WidgetRow
      item={item} index={index} total={sorted.length}
      onToggle={toggleWidget} onUp={moveUp} onDown={moveDown}
    />
  );

  const handleDeviceNameSave = () => {
    const trimmed = deviceNameInput.trim();
    if (trimmed) void setDeviceName(trimmed);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scrollContent}>

      {/* ─── Sección: Ajustes de conexión ─── */}
      <Text style={styles.sectionTitle}>Ajustes de conexión</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.settingLabel}>Nombre del dispositivo</Text>
        <Text style={styles.settingHint}>
          Nombre del adaptador de diagnóstico que aparecerá en la búsqueda Bluetooth. Por defecto: SEAT_DIAG
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={deviceNameInput}
            onChangeText={setDeviceNameInput}
            onBlur={handleDeviceNameSave}
            placeholder="Nombre del dispositivo"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={handleDeviceNameSave}
          />
          {deviceNameInput.trim() !== deviceName && (
            <TouchableOpacity style={styles.saveBtn} onPress={handleDeviceNameSave} activeOpacity={0.75}>
              <Text style={styles.saveBtnLabel}>Guardar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Sección: Velocidad de actualización ─── */}
      <Text style={styles.sectionTitle}>Velocidad de actualización</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.settingHint}>
          Con qué frecuencia se solicitan datos al vehículo. Más rápido consume más batería.
        </Text>
        <View style={styles.intervalOptions}>
          {INTERVAL_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.intervalBtn, monitorIntervalMs === opt.value && styles.intervalBtnActive]}
              onPress={() => void setMonitorInterval(opt.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.intervalBtnLabel, monitorIntervalMs === opt.value && styles.intervalBtnLabelActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── Sección: Sensores del panel ─── */}
      <Text style={styles.sectionTitle}>Sensores del panel</Text>
      <Text style={styles.sectionHint}>
        {visible}/{sorted.length} activos · Activa o desactiva cada sensor. Reordénalos con las flechas.
      </Text>

      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xl },

  sectionTitle: {
    fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xs,
  },
  sectionHint: {
    fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },

  settingsCard: {
    backgroundColor: colors.surface, marginHorizontal: spacing.md,
    borderRadius: 12, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  settingLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  settingHint:  { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.sm },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1, backgroundColor: colors.background, borderRadius: 8, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    fontSize: fontSize.sm, color: colors.text, fontFamily: 'monospace',
  },
  saveBtn:      { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 8, backgroundColor: colors.primary },
  saveBtnLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },

  intervalOptions: { gap: spacing.xs },
  intervalBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
  },
  intervalBtnActive:      { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  intervalBtnLabel:       { fontSize: fontSize.sm, color: colors.textSecondary },
  intervalBtnLabelActive: { color: colors.primary, fontWeight: '600' },

  listContent: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  rowInfo:     { flex: 1, marginLeft: spacing.sm },
  rowLabel:    { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  rowLabelDim: { color: colors.textMuted },
  rowUnit:     { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  arrows:      { flexDirection: 'row', gap: spacing.xs },
  arrowBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: 6, backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.border,
  },
  arrowBtnDim: { opacity: 0.25 },
  arrowText:   { color: colors.text, fontSize: fontSize.sm },
});

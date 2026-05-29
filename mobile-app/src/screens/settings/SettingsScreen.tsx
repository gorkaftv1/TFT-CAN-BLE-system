import React, { useEffect, useState } from 'react';
import {
  Alert, FlatList, ListRenderItem, ScrollView,
  StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useConnectionStore } from '../../stores/connectionStore';
import { useDashboardStore, Widget } from '../../stores/dashboardStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePidSupportStore } from '../../stores/pidSupportStore';
import { useVehicleStore } from '../../stores/vehicleStore';
import { ScanModal, useConnectionFlow } from '../../components/ConnectionFlowModals';
import { colors, fontSize, spacing } from '../../shared/theme';

// ── Widget row ────────────────────────────────────────────────────

function WidgetRow({
  item, index, total, supported, onToggle, onUp, onDown,
}: {
  item: Widget; index: number; total: number;
  supported?: boolean;
  onToggle: (id: string) => void; onUp: (id: string) => void; onDown: (id: string) => void;
}) {
  const notDetected = supported === false;
  return (
    <View style={[styles.widgetRow, notDetected && styles.widgetRowUnsupported]}>
      <Switch
        value={item.visible}
        onValueChange={() => onToggle(item.id)}
        trackColor={{ false: colors.border, true: colors.primary + '88' }}
        thumbColor={item.visible ? colors.primary : colors.textMuted}
      />
      <View style={styles.widgetInfo}>
        <Text style={[styles.widgetLabel, !item.visible && styles.widgetLabelDim]}>{item.label}</Text>
        {notDetected
          ? <Text style={styles.widgetUnsupportedHint}>No detectado</Text>
          : <Text style={styles.widgetUnit}>{item.unit}</Text>
        }
      </View>
      <View style={styles.arrows}>
        <TouchableOpacity
          style={[styles.arrowBtn, index === 0 && styles.arrowBtnDim]}
          onPress={() => onUp(item.id)} disabled={index === 0}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-up" size={18} color={index === 0 ? colors.textMuted : colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.arrowBtn, index === total - 1 && styles.arrowBtnDim]}
          onPress={() => onDown(item.id)} disabled={index === total - 1}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-down" size={18} color={index === total - 1 ? colors.textMuted : colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Interval options ──────────────────────────────────────────────

const INTERVAL_OPTIONS = [
  { label: 'Tiempo real (250 ms)', value: 250 },
  { label: 'Normal (500 ms)',      value: 500 },
  { label: 'Lento (1 s)',          value: 1000 },
  { label: 'Muy lento (2 s)',      value: 2000 },
];

// ── Main screen ───────────────────────────────────────────────────

export function SettingsScreen() {
  const { status } = useConnectionStore();
  const { vin } = useVehicleStore();
  const { widgets, loaded, toggleWidget, moveUp, moveDown, selectAll, deselectAll, loadFromStorage } = useDashboardStore();
  const {
    deviceName, monitorIntervalMs, useMock, loaded: settingsLoaded,
    setDeviceName, setMonitorInterval, setUseMock, loadFromStorage: loadSettings,
  } = useSettingsStore();

  const { supportedPids } = usePidSupportStore();

  const { scanOpen, openScan, closeScan } = useConnectionFlow();
  const [deviceNameInput, setDeviceNameInput] = useState(deviceName);

  useEffect(() => {
    if (!loaded) void loadFromStorage();
    if (!settingsLoaded) void loadSettings();
  }, [loaded, settingsLoaded]);

  useEffect(() => { setDeviceNameInput(deviceName); }, [deviceName]);

  const sorted  = [...widgets].sort((a, b) => a.order - b.order);
  const visible = sorted.filter((w) => w.visible).length;
  const allSelected = visible === sorted.length;

  const handleToggleMock = (value: boolean) => {
    if (status === 'connected') {
      Alert.alert(
        'Cambiar modo',
        'Esto desconectara el dispositivo actual. ¿Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Continuar', style: 'destructive',
            onPress: async () => {
              await useConnectionStore.getState().disconnect();
              void setUseMock(value);
            },
          },
        ],
      );
    } else {
      void setUseMock(value);
    }
  };

  const handleDeviceNameSave = () => {
    const trimmed = deviceNameInput.trim();
    if (trimmed) void setDeviceName(trimmed);
  };

  const handleConnectionBtn = () => {
    if (status === 'connected' || useMock) {
      if (useMock) {
        void setUseMock(false);
      } else {
        void useConnectionStore.getState().disconnect();
      }
    } else {
      openScan();
    }
  };

  const renderWidget: ListRenderItem<Widget> = ({ item, index }) => (
    <WidgetRow
      item={item} index={index} total={sorted.length}
      supported={supportedPids === null ? undefined : supportedPids.includes(item.pid)}
      onToggle={toggleWidget} onUp={moveUp} onDown={moveDown}
    />
  );

  // Connection status label
  const connectionLabel = useMock
    ? 'Simulacion activa'
    : status === 'connected'
      ? `Conectado a ${useConnectionStore.getState().deviceName ?? ''}`
      : status === 'scanning'   ? 'Buscando...'
      : status === 'connecting' ? 'Conectando...'
      : 'Desconectado';

  const dotColor = useMock
    ? colors.primary
    : status === 'connected' ? colors.success
    : status === 'scanning' || status === 'connecting' ? colors.warning
    : colors.border;

  const isActive = useMock || status === 'connected';

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.scrollContent}>

        {/* ── Estado de conexion ── */}
        <Text style={styles.sectionTitle}>Estado de conexion</Text>
        <View style={styles.card}>
          <View style={styles.connectionStatus}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <View style={styles.connectionInfo}>
              <Text style={styles.connectionLabel}>{connectionLabel}</Text>
              {status === 'connected' && !useMock && vin ? (
                <Text style={styles.connectionDevice} numberOfLines={1}>VIN: {vin}</Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.connectionBtn, isActive && styles.connectionBtnDisconnect]}
            onPress={handleConnectionBtn}
            activeOpacity={0.75}
          >
            <Text style={styles.connectionBtnLabel}>
              {isActive ? 'Desconectar' : 'Conectar'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Modo simulacion ── */}
        <Text style={styles.sectionTitle}>Modo simulacion</Text>
        <View style={styles.card}>
          <View style={styles.mockRow}>
            <View style={styles.mockInfo}>
              <Text style={styles.settingLabel}>Simulacion de datos</Text>
              <Text style={styles.settingHint}>Usa datos ficticios sin hardware real.</Text>
            </View>
            <Switch
              value={useMock}
              onValueChange={handleToggleMock}
              trackColor={{ false: colors.border, true: colors.primary + '88' }}
              thumbColor={useMock ? colors.primary : colors.textMuted}
            />
          </View>
        </View>

        {/* ── Adaptador BLE ── */}
        {!useMock && (
          <>
            <Text style={styles.sectionTitle}>Adaptador BLE</Text>
            <View style={styles.card}>
              <Text style={styles.settingLabel}>Nombre del dispositivo</Text>
              <Text style={styles.settingHint}>
                Nombre Bluetooth del adaptador de diagnostico. Por defecto: diag_tool
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
          </>
        )}

        {/* ── Tiempo de sondeo ── */}
        <Text style={styles.sectionTitle}>Tiempo de sondeo</Text>
        <View style={styles.card}>
          <Text style={styles.settingHint}>
            Define cada cuanto la aplicacion pide datos al vehiculo. Frecuencias mayores muestran cambios mas rapido pero consumen mas bateria.
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

        {/* ── Datos mostrados en Diagnosis ── */}
        <Text style={styles.sectionTitle}>Datos mostrados en Diagnosis</Text>
        <Text style={styles.sectionHint}>
          Selecciona que datos quieres visualizar en el Panel OBD.
          {supportedPids !== null ? ' Los sensores marcados en naranja no fueron detectados en el ultimo escaneo.' : ' Escanea los PIDs desde el Panel OBD para saber cuales soporta tu vehiculo.'}
        </Text>

        {/* Select / deselect all toolbar */}
        <View style={styles.selectAllRow}>
          <Text style={styles.activeCount}>{visible}/{sorted.length} activos</Text>
          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={() => allSelected ? deselectAll() : selectAll()}
            activeOpacity={0.75}
          >
            <Text style={styles.selectAllLabel}>
              {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={sorted}
          renderItem={renderWidget}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.widgetList}
        />
      </ScrollView>

      <ScanModal visible={scanOpen} onClose={closeScan} />
    </>
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
    fontSize: fontSize.sm, color: colors.textSecondary,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    lineHeight: 20,
  },

  card: {
    backgroundColor: colors.surface, marginHorizontal: spacing.md,
    borderRadius: 12, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm,
  },

  // Connection status card
  connectionStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot:              { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  connectionInfo:   { flex: 1 },
  connectionLabel:  { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  connectionDevice: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: 'monospace' },
  connectionBtn: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: 8, backgroundColor: colors.primary,
  },
  connectionBtnDisconnect: { backgroundColor: colors.error },
  connectionBtnLabel:      { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },

  // Mock toggle
  mockRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mockInfo: { flex: 1, marginRight: spacing.md },

  // Device name
  settingLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  settingHint:  { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1, backgroundColor: colors.background, borderRadius: 8, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    fontSize: fontSize.sm, color: colors.text, fontFamily: 'monospace',
  },
  saveBtn:      { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 8, backgroundColor: colors.primary },
  saveBtnLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },

  // Interval
  intervalOptions: { gap: spacing.xs },
  intervalBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
  },
  intervalBtnActive:      { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  intervalBtnLabel:       { fontSize: fontSize.sm, color: colors.textSecondary },
  intervalBtnLabelActive: { color: colors.primary, fontWeight: '600' },

  // Select all row
  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  activeCount:    { fontSize: fontSize.xs, color: colors.textMuted },
  selectAllBtn:   { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 6, borderWidth: 1, borderColor: colors.primary },
  selectAllLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },

  // Widget list
  widgetList: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.sm },
  widgetRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  widgetRowUnsupported: { borderColor: colors.warning + '60', backgroundColor: colors.warning + '08' },
  widgetInfo:           { flex: 1, marginLeft: spacing.sm },
  widgetLabel:          { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  widgetLabelDim:       { color: colors.textMuted },
  widgetUnit:           { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  widgetUnsupportedHint:{ fontSize: fontSize.xs, color: colors.warning, marginTop: 2, fontWeight: '600' },
  arrows:        { flexDirection: 'row', gap: spacing.xs },
  arrowBtn:      { padding: spacing.xs, borderRadius: 6, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  arrowBtnDim:   { opacity: 0.25 },
});

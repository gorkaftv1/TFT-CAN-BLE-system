import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, ListRenderItem, Modal,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useConnectionStore } from '../../stores/connectionStore';
import { useDashboardStore, Widget } from '../../stores/dashboardStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useVehicleStore } from '../../stores/vehicleStore';
import { ScannedDevice } from '../../infrastructure/BleAdapter';
import { colors, fontSize, spacing } from '../../shared/theme';

// ── RSSI helpers ──────────────────────────────────────────────────

function rssiBar(rssi: number | null): string {
  if (rssi === null) return '?';
  if (rssi >= -60) return 'xxxxxx';
  if (rssi >= -75) return 'xxxx  ';
  if (rssi >= -85) return 'xx    ';
  return 'x     ';
}

function rssiLabel(rssi: number | null): string {
  if (rssi === null) return 'Senal desconocida';
  if (rssi >= -60) return 'Senal excelente';
  if (rssi >= -75) return 'Senal buena';
  if (rssi >= -85) return 'Senal debil';
  return 'Senal muy debil';
}

// ── Connection Modal ──────────────────────────────────────────────

function DeviceRow({ device, onConnect, disabled, targetName }: {
  device: ScannedDevice;
  onConnect: () => void;
  disabled: boolean;
  targetName: string;
}) {
  const name = device.name ?? 'Dispositivo desconocido';
  const isTarget = name === targetName;
  return (
    <View style={[styles.deviceRow, isTarget && styles.deviceRowTarget]}>
      <View style={styles.deviceInfo}>
        <View style={styles.deviceNameRow}>
          <Text style={[styles.deviceName, isTarget && styles.deviceNameTarget]}>{name}</Text>
          {isTarget && <Text style={styles.tagRecommended}>Recomendado</Text>}
        </View>
        <Text style={styles.deviceMeta}>{rssiLabel(device.rssi)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.connectBtn, isTarget && styles.connectBtnTarget, disabled && styles.btnDisabled]}
        onPress={onConnect}
        disabled={disabled}
        activeOpacity={0.75}
      >
        <Text style={[styles.connectBtnLabel, isTarget && styles.connectBtnLabelTarget]}>Conectar</Text>
      </TouchableOpacity>
    </View>
  );
}

function ConnectionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { status, error, scannedDevices, startScan, stopScan, connect, disconnect } =
    useConnectionStore();
  const targetName = useSettingsStore((s) => s.deviceName);
  const useMock    = useSettingsStore((s) => s.useMock);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const animRef  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animRef.current?.stop();
    spinAnim.setValue(0);
    if (status === 'scanning' || status === 'connecting') {
      animRef.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      );
      animRef.current.start();
    }
    return () => animRef.current?.stop();
  }, [status]);

  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const renderDevice: ListRenderItem<ScannedDevice> = ({ item }) => (
    <DeviceRow
      device={item}
      disabled={status === 'connecting'}
      targetName={targetName}
      onConnect={() => connect(item.id, item.name ?? item.id)}
    />
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {/* Modal header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Buscar dispositivo</Text>
          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.75}>
            <Text style={styles.modalCloseLabel}>Cerrar</Text>
          </TouchableOpacity>
        </View>

        {/* Connection status (when connected) */}
        {status === 'connected' ? (
          <View style={styles.connectedBox}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <View style={styles.connectedInfo}>
              <Text style={styles.connectedLabel}>Conectado</Text>
              <Text style={styles.connectedDevice}>
                {useConnectionStore.getState().deviceName ?? ''}
                {useMock ? '  [simulacion]' : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect} activeOpacity={0.75}>
              <Text style={styles.disconnectLabel}>Desconectar</Text>
            </TouchableOpacity>
          </View>
        ) : useMock ? (
          /* Mock mode — no scan needed */
          <View style={styles.mockBar}>
            <View style={styles.scanBarLeft}>
              {status === 'connecting' && (
                <Animated.Text style={[styles.spinner, { transform: [{ rotate }] }]}>o</Animated.Text>
              )}
              <Text style={styles.scanStatus}>
                {status === 'connecting' ? 'Iniciando simulacion...' : 'Modo simulacion activo'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.scanBtn, styles.scanBtnPrimary, status === 'connecting' && styles.btnDisabled]}
              onPress={() => connect('mock', 'Simulacion')}
              disabled={status === 'connecting'}
              activeOpacity={0.75}
            >
              <Text style={[styles.scanBtnLabel, styles.scanBtnPrimaryLabel]}>Conectar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* BLE scan controls */
          <View style={styles.scanBar}>
            <View style={styles.scanBarLeft}>
              {(status === 'scanning' || status === 'connecting') && (
                <Animated.Text style={[styles.spinner, { transform: [{ rotate }] }]}>o</Animated.Text>
              )}
              <Text style={styles.scanStatus}>
                {status === 'scanning'   ? 'Buscando...' :
                 status === 'connecting' ? 'Conectando...' :
                 scannedDevices.length > 0 ? `${scannedDevices.length} encontrados` : 'Sin dispositivos'}
              </Text>
            </View>
            {status === 'scanning' ? (
              <TouchableOpacity style={styles.scanBtn} onPress={stopScan} activeOpacity={0.75}>
                <Text style={styles.scanBtnLabel}>Detener</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.scanBtn, styles.scanBtnPrimary, status === 'connecting' && styles.btnDisabled]}
                onPress={startScan}
                disabled={status === 'connecting'}
                activeOpacity={0.75}
              >
                <Text style={[styles.scanBtnLabel, styles.scanBtnPrimaryLabel]}>
                  {scannedDevices.length > 0 ? 'Actualizar' : 'Buscar'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Device list — BLE only */}
        {status !== 'connected' && !useMock && (
          scannedDevices.length === 0 ? (
            <View style={styles.scanEmpty}>
              <Text style={styles.scanEmptyText}>
                Asegurate de que el adaptador esta encendido y cerca del telefono, luego pulsa Buscar.
              </Text>
            </View>
          ) : (
            <FlatList
              data={scannedDevices}
              keyExtractor={(d) => d.id}
              renderItem={renderDevice}
              contentContainerStyle={{ paddingBottom: spacing.xl }}
            />
          )
        )}
      </View>
    </Modal>
  );
}

// ── Widget row ────────────────────────────────────────────────────

function WidgetRow({
  item, index, total, onToggle, onUp, onDown,
}: {
  item: Widget; index: number; total: number;
  onToggle: (id: string) => void; onUp: (id: string) => void; onDown: (id: string) => void;
}) {
  return (
    <View style={styles.widgetRow}>
      <Switch
        value={item.visible}
        onValueChange={() => onToggle(item.id)}
        trackColor={{ false: colors.border, true: colors.primary + '88' }}
        thumbColor={item.visible ? colors.primary : colors.textMuted}
      />
      <View style={styles.widgetInfo}>
        <Text style={[styles.widgetLabel, !item.visible && styles.widgetLabelDim]}>{item.label}</Text>
        <Text style={styles.widgetUnit}>{item.unit}</Text>
      </View>
      <View style={styles.arrows}>
        <TouchableOpacity
          style={[styles.arrowBtn, index === 0 && styles.arrowBtnDim]}
          onPress={() => onUp(item.id)} disabled={index === 0}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.arrowText}>up</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.arrowBtn, index === total - 1 && styles.arrowBtnDim]}
          onPress={() => onDown(item.id)} disabled={index === total - 1}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.arrowText}>dn</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────

const INTERVAL_OPTIONS = [
  { label: 'Tiempo real (250 ms)', value: 250 },
  { label: 'Normal (500 ms)',      value: 500 },
  { label: 'Lento (1 s)',          value: 1000 },
  { label: 'Muy lento (2 s)',      value: 2000 },
];

export function SettingsScreen() {
  const { status } = useConnectionStore();
  const { vin } = useVehicleStore();
  const { widgets, loaded, toggleWidget, moveUp, moveDown, loadFromStorage } = useDashboardStore();
  const {
    deviceName, monitorIntervalMs, useMock, loaded: settingsLoaded,
    setDeviceName, setMonitorInterval, setUseMock, loadFromStorage: loadSettings,
  } = useSettingsStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState(deviceName);

  useEffect(() => {
    if (!loaded) void loadFromStorage();
    if (!settingsLoaded) void loadSettings();
  }, [loaded, settingsLoaded]);

  useEffect(() => { setDeviceNameInput(deviceName); }, [deviceName]);

  const sorted  = [...widgets].sort((a, b) => a.order - b.order);
  const visible = sorted.filter((w) => w.visible).length;

  const handleToggleMock = (value: boolean) => {
    if (status === 'connected') {
      Alert.alert(
        'Cambiar modo',
        'Esto desconectara el dispositivo actual. Continuar?',
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

  const renderWidget: ListRenderItem<Widget> = ({ item, index }) => (
    <WidgetRow
      item={item} index={index} total={sorted.length}
      onToggle={toggleWidget} onUp={moveUp} onDown={moveDown}
    />
  );

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.scrollContent}>

        {/* ── Conexion ── */}
        <Text style={styles.sectionTitle}>Conexion</Text>
        <View style={styles.card}>
          <View style={styles.connectionStatus}>
            <View style={[styles.dot, {
              backgroundColor: status === 'connected' ? colors.success :
                               status === 'scanning' || status === 'connecting' ? colors.warning :
                               colors.border,
            }]} />
            <View style={styles.connectionInfo}>
              <Text style={styles.connectionLabel}>
                {status === 'connected'  ? 'Conectado' :
                 status === 'scanning'   ? 'Buscando...' :
                 status === 'connecting' ? 'Conectando...' :
                 'Desconectado'}
              </Text>
              {status === 'connected' && (
                <Text style={styles.connectionDevice} numberOfLines={1}>
                  {useConnectionStore.getState().deviceName ?? ''}{vin ? `  VIN: ${vin}` : ''}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.connectionBtn, status === 'connected' && styles.connectionBtnDisconnect]}
            onPress={() => {
              if (status === 'connected') {
                useConnectionStore.getState().disconnect();
              } else {
                setModalVisible(true);
              }
            }}
            activeOpacity={0.75}
          >
            <Text style={styles.connectionBtnLabel}>
              {status === 'connected' ? 'Desconectar' : 'Conectar'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Adaptador BLE ── */}
        <Text style={styles.sectionTitle}>Adaptador BLE</Text>
        <View style={styles.card}>
          <View style={styles.mockRow}>
            <View style={styles.mockInfo}>
              <Text style={styles.settingLabel}>Modo simulacion</Text>
              <Text style={styles.settingHint}>Usa datos ficticios sin hardware real.</Text>
            </View>
            <Switch
              value={useMock}
              onValueChange={handleToggleMock}
              trackColor={{ false: colors.border, true: colors.primary + '88' }}
              thumbColor={useMock ? colors.primary : colors.textMuted}
            />
          </View>
          {!useMock && (
            <>
              <View style={styles.divider} />
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
            </>
          )}
        </View>

        {/* ── Velocidad de actualizacion ── */}
        <Text style={styles.sectionTitle}>Velocidad de actualizacion</Text>
        <View style={styles.card}>
          <Text style={styles.settingHint}>
            Frecuencia de solicitud de datos al vehiculo. Mayor frecuencia = mayor consumo de bateria.
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

        {/* ── Sensores del panel ── */}
        <Text style={styles.sectionTitle}>Sensores del panel</Text>
        <Text style={styles.sectionHint}>
          {visible}/{sorted.length} activos — activa, desactiva y reordena con las flechas.
        </Text>

        <FlatList
          data={sorted}
          renderItem={renderWidget}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.widgetList}
        />
      </ScrollView>

      <ConnectionModal visible={modalVisible} onClose={() => setModalVisible(false)} />
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
    fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
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
  divider:  { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

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

  // Widget list
  widgetList: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.sm },
  widgetRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  widgetInfo:    { flex: 1, marginLeft: spacing.sm },
  widgetLabel:   { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  widgetLabelDim:{ color: colors.textMuted },
  widgetUnit:    { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  arrows:        { flexDirection: 'row', gap: spacing.xs },
  arrowBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: 6, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  arrowBtnDim: { opacity: 0.25 },
  arrowText:   { color: colors.text, fontSize: fontSize.xs, fontFamily: 'monospace' },

  // ── Modal ──
  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTitle:      { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  modalCloseBtn:   { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  modalCloseLabel: { fontSize: fontSize.sm, color: colors.textSecondary },

  connectedBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.success + '12',
    borderBottomWidth: 1, borderBottomColor: colors.success + '30',
  },
  connectedInfo:   { flex: 1 },
  connectedLabel:  { fontSize: fontSize.sm, fontWeight: '700', color: colors.success },
  connectedDevice: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: 'monospace' },
  disconnectBtn:   { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 8, backgroundColor: colors.error },
  disconnectLabel: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  mockBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.primary + '08',
  },
  scanBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  scanBarLeft:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  spinner:           { fontSize: 16, color: colors.primary },
  scanStatus:        { fontSize: fontSize.sm, color: colors.textSecondary },
  scanBtn:           { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  scanBtnPrimary:    { backgroundColor: colors.primary, borderColor: colors.primary },
  scanBtnLabel:      { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  scanBtnPrimaryLabel:{ color: colors.background },
  errorText: {
    fontSize: fontSize.sm, color: colors.error,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.error + '15',
  },
  scanEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scanEmptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  deviceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  deviceRowTarget:  { backgroundColor: colors.primary + '10' },
  deviceInfo:       { flex: 1 },
  deviceNameRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 3 },
  deviceName:       { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  deviceNameTarget: { color: colors.primary },
  tagRecommended: {
    fontSize: 9, fontWeight: '700', color: colors.primary,
    backgroundColor: colors.primary + '20', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  deviceMeta:           { fontSize: fontSize.xs, color: colors.textMuted },
  connectBtn:           { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  connectBtnTarget:     { backgroundColor: colors.primary, borderColor: colors.primary },
  connectBtnLabel:      { fontSize: fontSize.xs, fontWeight: '700', color: colors.text },
  connectBtnLabelTarget:{ color: colors.background },
  btnDisabled:          { opacity: 0.4 },
});

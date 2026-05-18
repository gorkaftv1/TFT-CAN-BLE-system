import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, FlatList, ListRenderItem, Modal,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useConnectionStore } from '../stores/connectionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { ScannedDevice } from '../infrastructure/BleAdapter';
import { colors, fontSize, spacing } from '../shared/theme';

// ── RSSI helpers ──────────────────────────────────────────────────

function rssiLabel(rssi: number | null): string {
  if (rssi === null) return 'Senal desconocida';
  if (rssi >= -60) return 'Senal excelente';
  if (rssi >= -75) return 'Senal buena';
  if (rssi >= -85) return 'Senal debil';
  return 'Senal muy debil';
}

// ── Device row ────────────────────────────────────────────────────

function DeviceRow({ device, onConnect, disabled, targetName }: {
  device: ScannedDevice;
  onConnect: () => void;
  disabled: boolean;
  targetName: string;
}) {
  const name = device.name ?? 'Dispositivo desconocido';
  const isTarget = name === targetName;
  return (
    <View style={[s.deviceRow, isTarget && s.deviceRowTarget]}>
      <View style={s.deviceInfo}>
        <View style={s.deviceNameRow}>
          <Text style={[s.deviceName, isTarget && s.deviceNameTarget]}>{name}</Text>
          {isTarget && <Text style={s.tagRecommended}>Recomendado</Text>}
        </View>
        <Text style={s.deviceMeta}>{rssiLabel(device.rssi)}</Text>
      </View>
      <TouchableOpacity
        style={[s.connectBtn, isTarget && s.connectBtnTarget, disabled && s.btnDisabled]}
        onPress={onConnect}
        disabled={disabled}
        activeOpacity={0.75}
      >
        <Text style={[s.connectBtnLabel, isTarget && s.connectBtnLabelTarget]}>Conectar</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── ScanModal ─────────────────────────────────────────────────────

export function ScanModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { status, error, scannedDevices, startScan, stopScan, connect } = useConnectionStore();
  const targetName = useSettingsStore((s) => s.deviceName);

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

  // Auto-close when connection established
  useEffect(() => {
    if (visible && status === 'connected') onClose();
  }, [status, visible]);

  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const isScanning   = status === 'scanning';
  const isConnecting = status === 'connecting';
  const hasList      = scannedDevices.length > 0;
  const showHint     = !isScanning && !isConnecting && !hasList;

  const handleCancel = () => {
    if (isScanning) stopScan();
    onClose();
  };

  const renderDevice: ListRenderItem<ScannedDevice> = ({ item }) => (
    <DeviceRow
      device={item}
      disabled={isConnecting}
      targetName={targetName}
      onConnect={() => connect(item.id, item.name ?? item.id)}
    />
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleCancel}>
      <View style={s.overlay}>
        <View style={s.dialogBox}>
          {/* Header */}
          <View style={s.dialogHeader}>
            <Text style={s.modalTitle}>Buscar dispositivo</Text>
            <TouchableOpacity style={s.modalCloseBtn} onPress={handleCancel} activeOpacity={0.75}>
              <Text style={s.modalCloseLabel}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          {/* Scan bar */}
          <View style={s.scanBar}>
            <View style={s.scanBarLeft}>
              {(isScanning || isConnecting) && (
                <Animated.Text style={[s.spinner, { transform: [{ rotate }] }]}>o</Animated.Text>
              )}
              <Text style={s.scanStatus}>
                {isConnecting ? 'Conectando...' :
                 isScanning   ? 'Buscando...' :
                 hasList      ? `${scannedDevices.length} encontrados` :
                 'Listo para buscar'}
              </Text>
            </View>
            {isScanning ? (
              <TouchableOpacity style={s.actionBtn} onPress={stopScan} activeOpacity={0.75}>
                <Text style={s.actionBtnLabel}>Detener</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.actionBtn, s.actionBtnPrimary, isConnecting && s.btnDisabled]}
                onPress={startScan}
                disabled={isConnecting}
                activeOpacity={0.75}
              >
                <Text style={[s.actionBtnLabel, s.actionBtnPrimaryLabel]}>
                  {hasList ? 'Actualizar' : 'Buscar'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          {/* Content */}
          {showHint ? (
            <View style={s.hintBox}>
              <Text style={s.hintText}>
                Pulsa <Text style={s.hintBold}>Buscar</Text> para ver los dispositivos cercanos disponibles.
              </Text>
            </View>
          ) : hasList ? (
            <FlatList
              data={scannedDevices}
              keyExtractor={(d) => d.id}
              renderItem={renderDevice}
              style={s.deviceList}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ── SimulateConfirmModal ──────────────────────────────────────────

export function SimulateConfirmModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const setUseMock = useSettingsStore((st) => st.setUseMock);
  const connect    = useConnectionStore((st) => st.connect);
  const [success, setSuccess] = useState(false);

  const handleContinue = () => {
    void setUseMock(true).then(() => connect('mock', 'Simulacion'));
    setSuccess(true);
  };

  const handleClose = () => {
    setSuccess(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={s.confirmBox}>
          {success ? (
            <>
              <Text style={s.successIcon}>✓</Text>
              <Text style={s.confirmTitle}>Simulacion activada</Text>
              <Text style={s.confirmBody}>
                Los datos mostrados son simulados por la aplicacion. Puedes desactivarlo en Ajustes.
              </Text>
              <View style={s.confirmBtns}>
                <TouchableOpacity style={s.continueBtn} onPress={handleClose} activeOpacity={0.75}>
                  <Text style={s.continueBtnLabel}>Continuar</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={s.confirmTitle}>Modo simulacion</Text>
              <Text style={s.confirmBody}>
                Si seleccionas simular veras datos simulados por la aplicacion.{'\n'}¿Quieres continuar a simular?
              </Text>
              <View style={s.confirmBtns}>
                <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.75}>
                  <Text style={s.cancelBtnLabel}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.continueBtn} onPress={handleContinue} activeOpacity={0.75}>
                  <Text style={s.continueBtnLabel}>Continuar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── useConnectionFlow hook ────────────────────────────────────────

export function useConnectionFlow() {
  const [scanOpen, setScanOpen]   = useState(false);
  const [simOpen, setSimOpen]     = useState(false);

  return {
    scanOpen,
    simOpen,
    openScan:  () => setScanOpen(true),
    closeScan: () => setScanOpen(false),
    openSim:   () => setSimOpen(true),
    closeSim:  () => setSimOpen(false),
  };
}

// ── Styles ────────────────────────────────────────────────────────

const s = StyleSheet.create({
  dialogBox: {
    backgroundColor: colors.surface, borderRadius: 14,
    width: '100%', maxHeight: '80%',
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  dialogHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  deviceList: { maxHeight: 240 },
  modalTitle:      { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  modalCloseBtn:   { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 8, borderWidth: 1, borderColor: colors.error },
  modalCloseLabel: { fontSize: fontSize.sm, color: colors.error, fontWeight: '600' },

  scanBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  scanBarLeft:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  spinner:      { fontSize: 16, color: colors.primary },
  scanStatus:   { fontSize: fontSize.sm, color: colors.textSecondary },
  actionBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  actionBtnPrimary:      { backgroundColor: colors.primary, borderColor: colors.primary },
  actionBtnLabel:        { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  actionBtnPrimaryLabel: { color: colors.background },

  errorText: {
    fontSize: fontSize.sm, color: colors.error,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.error + '15',
  },

  hintBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  hintText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', lineHeight: 24 },
  hintBold: { fontWeight: '700', color: colors.textSecondary },

  // Device list
  deviceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  deviceRowTarget:      { backgroundColor: colors.primary + '10' },
  deviceInfo:           { flex: 1 },
  deviceNameRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 3 },
  deviceName:           { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  deviceNameTarget:     { color: colors.primary },
  tagRecommended: {
    fontSize: 9, fontWeight: '700', color: colors.primary,
    backgroundColor: colors.primary + '20', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  deviceMeta:               { fontSize: fontSize.xs, color: colors.textMuted },
  connectBtn:               { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  connectBtnTarget:         { backgroundColor: colors.primary, borderColor: colors.primary },
  connectBtnLabel:          { fontSize: fontSize.xs, fontWeight: '700', color: colors.text },
  connectBtnLabelTarget:    { color: colors.background },
  btnDisabled:              { opacity: 0.4 },

  // Simulate confirm modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  confirmBox: {
    backgroundColor: colors.surface, borderRadius: 14,
    padding: spacing.lg, width: '100%',
    borderWidth: 1, borderColor: colors.border,
  },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  confirmBody:  { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.lg },
  confirmBtns:  { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  cancelBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: 10, borderWidth: 1, borderColor: colors.error,
  },
  cancelBtnLabel:   { fontSize: fontSize.sm, fontWeight: '700', color: colors.error },
  continueBtn:      { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 10, backgroundColor: colors.primary },
  continueBtnLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },
  successIcon: { fontSize: 40, color: colors.success, textAlign: 'center', marginBottom: spacing.sm },
});

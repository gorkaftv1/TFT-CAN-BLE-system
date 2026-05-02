import React, { useEffect, useRef } from 'react';
import {
  Animated, FlatList, ListRenderItem, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useConnectionStore } from '../../stores/connectionStore';
import { useVehicleStore } from '../../stores/vehicleStore';
import { ScannedDevice } from '../../infrastructure/BleAdapter';
import { colors, fontSize, spacing } from '../../shared/theme';

function rssiBar(rssi: number | null): string {
  if (rssi === null) return '?';
  if (rssi >= -60) return '▂▄▆█';
  if (rssi >= -75) return '▂▄▆·';
  if (rssi >= -85) return '▂▄··';
  return '▂···';
}

function DeviceRow({ device, onConnect, disabled }: {
  device: ScannedDevice;
  onConnect: () => void;
  disabled: boolean;
}) {
  const name = device.name ?? 'Unknown';
  const isTarget = name === 'SEAT_DIAG';
  return (
    <View style={[styles.deviceRow, isTarget && styles.deviceRowTarget]}>
      <View style={styles.deviceInfo}>
        <Text style={[styles.deviceName, isTarget && styles.deviceNameTarget]}>{name}</Text>
        <Text style={styles.deviceId}>{device.id}</Text>
      </View>
      <Text style={styles.rssi}>{rssiBar(device.rssi)}</Text>
      <TouchableOpacity
        style={[styles.connectBtn, isTarget && styles.connectBtnTarget, disabled && styles.btnDisabled]}
        onPress={onConnect}
        disabled={disabled}
        activeOpacity={0.75}
      >
        <Text style={styles.connectBtnLabel}>Connect</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ConnectionScreen() {
  const { status, deviceName, error, scannedDevices, startScan, stopScan, connect, disconnect } =
    useConnectionStore();
  const { vin } = useVehicleStore();

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
      onConnect={() => connect(item.id, item.name ?? item.id)}
    />
  );

  if (status === 'connected') {
    return (
      <View style={styles.root}>
        <View style={styles.connectedBody}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text style={styles.connectedLabel}>Connected</Text>
          {deviceName ? <Text style={styles.deviceNameLg}>{deviceName}</Text> : null}
          {vin ? <Text style={styles.vinText}>VIN: {vin}</Text> : null}
          <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect} activeOpacity={0.75}>
            <Text style={styles.disconnectLabel}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>OBD-II Diagnostics</Text>
        {status === 'scanning' ? (
          <View style={styles.headerRight}>
            <Animated.Text style={[styles.spinner, { transform: [{ rotate }] }]}>◌</Animated.Text>
            <Text style={styles.scanningLabel}>Scanning…</Text>
            <TouchableOpacity onPress={stopScan} style={styles.stopBtn}>
              <Text style={styles.stopBtnLabel}>Stop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.scanBtn, status === 'connecting' && styles.btnDisabled]}
            onPress={startScan}
            disabled={status === 'connecting'}
            activeOpacity={0.75}
          >
            <Text style={styles.scanBtnLabel}>
              {scannedDevices.length > 0 ? 'Refresh' : 'Scan'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {status === 'connecting' ? (
        <View style={styles.connectingRow}>
          <Animated.Text style={[styles.spinner, { transform: [{ rotate }] }]}>◌</Animated.Text>
          <Text style={styles.connectingLabel}>Connecting…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {scannedDevices.length === 0 && status !== 'scanning' ? (
        <View style={styles.emptyBody}>
          <Text style={styles.emptyText}>No devices found.{'\n'}Press Scan to search.</Text>
        </View>
      ) : (
        <FlatList
          data={scannedDevices}
          keyExtractor={(d) => d.id}
          renderItem={renderDevice}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            scannedDevices.length > 0
              ? <Text style={styles.listHeader}>{scannedDevices.length} device(s) found</Text>
              : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title:        { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  spinner:      { fontSize: 20, color: colors.primary },
  scanningLabel:{ fontSize: fontSize.sm, color: colors.primary },
  stopBtn:      { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  stopBtnLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  scanBtn:      { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 8, backgroundColor: colors.primary },
  scanBtnLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },

  connectingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.warning + '22',
  },
  connectingLabel: { fontSize: fontSize.sm, color: colors.warning },

  errorText: {
    fontSize: fontSize.sm, color: colors.error,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.error + '15',
  },

  listContent: { paddingBottom: spacing.xl },
  listHeader:  { fontSize: fontSize.xs, color: colors.textMuted, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },

  deviceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  deviceRowTarget: { backgroundColor: colors.primary + '10' },
  deviceInfo:      { flex: 1 },
  deviceName:      { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  deviceNameTarget:{ color: colors.primary },
  deviceId:        { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  rssi:            { fontSize: 12, color: colors.textMuted, marginHorizontal: spacing.sm, minWidth: 36, textAlign: 'center' },
  connectBtn:      { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  connectBtnTarget:{ backgroundColor: colors.primary, borderColor: colors.primary },
  connectBtnLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text },
  btnDisabled:     { opacity: 0.4 },

  // connected state
  connectedBody:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  dot:             { width: 44, height: 44, borderRadius: 22, marginBottom: spacing.lg },
  connectedLabel:  { fontSize: fontSize.xl, fontWeight: '700', color: colors.success, marginBottom: spacing.xs },
  deviceNameLg:    { fontSize: fontSize.md, color: colors.text, marginBottom: spacing.xs },
  vinText:         { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: 'monospace', marginBottom: spacing.xl },
  disconnectBtn:   { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 10, backgroundColor: colors.error, minWidth: 200, alignItems: 'center' },
  disconnectLabel: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },

  emptyBody:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:  { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});

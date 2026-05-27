import { useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/stores/settingsStore';
import { useDashboardStore } from './src/stores/dashboardStore';
import { usePidSupportStore } from './src/stores/pidSupportStore';
import { useConnectionStore } from './src/stores/connectionStore';
import { VehicleService } from './src/domain/services/VehicleService';
import { requestBlePermissions } from './src/utils/blePermissions';
import { colors, fontSize, spacing } from './src/shared/theme';

export default function App() {
  const loadSettings    = useSettingsStore((s) => s.loadFromStorage);
  const loadDashboard   = useDashboardStore((s) => s.loadFromStorage);
  const loadPidCache    = usePidSupportStore((s) => s.load);
  const useMock         = useSettingsStore((s) => s.useMock);
  const settingsLoaded  = useSettingsStore((s) => s.loaded);
  const disconnectedUnexpectedly = useConnectionStore((s) => s.disconnectedUnexpectedly);
  const clearDisconnectError     = useConnectionStore((s) => s.clearDisconnectError);

  useEffect(() => {
    void loadSettings();
    void loadDashboard();
    void loadPidCache();
    void requestBlePermissions();
  }, []);

  // Mock mode: connection flow is skipped, fetch VIN manually when mock is active
  useEffect(() => {
    if (settingsLoaded && useMock) {
      void VehicleService.fetchVin();
    }
  }, [useMock, settingsLoaded]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />

      <Modal transparent visible={disconnectedUnexpectedly} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Error de conexión</Text>
            <Text style={styles.dialogBody}>
              La conexión con el dispositivo se ha perdido inesperadamente.
            </Text>
            <TouchableOpacity style={styles.dialogBtn} onPress={clearDisconnectError} activeOpacity={0.75}>
              <Text style={styles.dialogBtnLabel}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  dialog: {
    width: '80%', backgroundColor: colors.surface,
    borderRadius: 16, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.error + '60',
    gap: spacing.md,
  },
  dialogTitle: {
    fontSize: fontSize.lg, fontWeight: '700', color: colors.error, textAlign: 'center',
  },
  dialogBody: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  dialogBtn: {
    alignSelf: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
    borderRadius: 10, backgroundColor: colors.primary,
  },
  dialogBtnLabel: {
    fontSize: fontSize.md, fontWeight: '700', color: colors.background,
  },
});

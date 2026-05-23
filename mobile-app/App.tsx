import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/stores/settingsStore';
import { useDashboardStore } from './src/stores/dashboardStore';
import { usePidSupportStore } from './src/stores/pidSupportStore';

export default function App() {
  const loadSettings  = useSettingsStore((s) => s.loadFromStorage);
  const loadDashboard = useDashboardStore((s) => s.loadFromStorage);
  const loadPidCache  = usePidSupportStore((s) => s.load);

  useEffect(() => {
    void loadSettings();
    void loadDashboard();
    void loadPidCache();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/stores/settingsStore';
import { useDashboardStore } from './src/stores/dashboardStore';

export default function App() {
  const loadSettings  = useSettingsStore((s) => s.loadFromStorage);
  const loadDashboard = useDashboardStore((s) => s.loadFromStorage);

  useEffect(() => {
    void loadSettings();
    void loadDashboard();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

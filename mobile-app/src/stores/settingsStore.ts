import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = '@app_settings_v1';

interface SettingsState {
  deviceName: string;
  monitorIntervalMs: number;
  loaded: boolean;
  setDeviceName: (name: string) => Promise<void>;
  setMonitorInterval: (ms: number) => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  deviceName: 'SEAT_DIAG',
  monitorIntervalMs: 500,
  loaded: false,

  setDeviceName: async (name) => {
    set({ deviceName: name });
    await persist(get());
  },

  setMonitorInterval: async (ms) => {
    set({ monitorIntervalMs: ms });
    await persist(get());
  },

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { deviceName, monitorIntervalMs } = JSON.parse(raw) as Partial<SettingsState>;
        set({
          deviceName: typeof deviceName === 'string' && deviceName.trim() ? deviceName : 'SEAT_DIAG',
          monitorIntervalMs: typeof monitorIntervalMs === 'number' ? monitorIntervalMs : 500,
        });
      }
    } catch { /* ignore */ }
    set({ loaded: true });
  },
}));

async function persist(state: SettingsState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      deviceName: state.deviceName,
      monitorIntervalMs: state.monitorIntervalMs,
    }));
  } catch { /* ignore */ }
}

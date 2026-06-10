import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { configureAdapter } from '../infrastructure/adapterFactory';

const STORAGE_KEY = '@app_settings_v1';

interface SettingsState {
  deviceName: string;
  monitorIntervalMs: number;
  useMock: boolean;
  authToken: string;
  loaded: boolean;
  setDeviceName: (name: string) => Promise<void>;
  setMonitorInterval: (ms: number) => Promise<void>;
  setUseMock: (value: boolean) => Promise<void>;
  setAuthToken: (token: string) => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  deviceName: 'diag_tool',
  monitorIntervalMs: 500,
  useMock: false,
  authToken: '1234',
  loaded: false,

  setDeviceName: async (name) => {
    set({ deviceName: name });
    await persist(get());
  },

  setMonitorInterval: async (ms) => {
    set({ monitorIntervalMs: ms });
    await persist(get());
  },

  setUseMock: async (value) => {
    configureAdapter(value);
    set({ useMock: value });
    await persist(get());
  },

  setAuthToken: async (token) => {
    set({ authToken: token.trim() || '1234' });
    await persist(get());
  },

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { deviceName, monitorIntervalMs, useMock, authToken } = JSON.parse(raw) as Partial<SettingsState>;
        const mock = typeof useMock === 'boolean' ? useMock : false;
        configureAdapter(mock);
        set({
          deviceName: typeof deviceName === 'string' && deviceName.trim() ? deviceName : 'diag_tool',
          monitorIntervalMs: typeof monitorIntervalMs === 'number' ? monitorIntervalMs : 500,
          useMock: mock,
          authToken: typeof authToken === 'string' && authToken.trim() ? authToken : '1234',
        });
      }
    } catch { /* ignore */ }
    configureAdapter(get().useMock);
    set({ loaded: true });
  },
}));

async function persist(state: SettingsState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      deviceName: state.deviceName,
      monitorIntervalMs: state.monitorIntervalMs,
      useMock: state.useMock,
      authToken: state.authToken,
    }));
  } catch { /* ignore */ }
}

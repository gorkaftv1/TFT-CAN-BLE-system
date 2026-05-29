import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { getAdapter } from '../infrastructure/adapterFactory';
import { LogService } from '../domain/services/LogService';

const STORAGE_KEY = '@supported_pids_v1';

interface PidSupportState {
  supportedPids: number[] | null;
  probing: boolean;
  lastProbed: number | null;
  probe: () => Promise<void>;
  load: () => Promise<void>;
  clear: () => void;
}

export const usePidSupportStore = create<PidSupportState>((set, get) => ({
  supportedPids: null,
  probing: false,
  lastProbed: null,

  probe: async () => {
    if (get().probing) return;
    set({ probing: true });
    try {
      LogService.add('info', 'probe_pids — escaneando PIDs disponibles...');
      const pids = await getAdapter().probeAvailablePids();
      const ts = Date.now();
      set({ supportedPids: pids, lastProbed: ts, probing: false });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ pids, ts }));
      LogService.add('info', `probe_pids — ${pids.length} PIDs soportados: ${pids.map((p) => '0x' + p.toString(16).toUpperCase()).join(', ')}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      LogService.add('error', `probe_pids error: ${msg}`);
      set({ probing: false });
    }
  },

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { pids, ts } = JSON.parse(raw) as { pids: number[]; ts: number };
        if (Array.isArray(pids)) set({ supportedPids: pids, lastProbed: ts });
      }
    } catch { /* ignore */ }
  },

  clear: () => {
    set({ supportedPids: null, lastProbed: null });
    void AsyncStorage.removeItem(STORAGE_KEY);
  },
}));

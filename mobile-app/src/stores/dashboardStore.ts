import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { PIDS } from '../config/obd_pids';

export interface Widget {
  id: string;    // `pid_${pid}` e.g. "pid_12"
  pid: number;
  label: string;
  unit: string;
  visible: boolean;
  order: number;
}

const STORAGE_KEY = '@dashboard_widgets_v2';

export const DEFAULT_WIDGETS: Widget[] = PIDS.map((p, i) => ({
  id: `pid_${p.pid}`,
  pid: p.pid,
  label: p.name,
  unit: p.unit,
  visible: p.defaultVisible,
  order: i,
}));

interface DashboardState {
  widgets: Widget[];
  loaded: boolean;
  toggleWidget: (id: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  widgets: DEFAULT_WIDGETS,
  loaded: false,

  toggleWidget: (id) => {
    set((state) => ({
      widgets: state.widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
    }));
    void get().saveToStorage();
  },

  moveUp: (id) => {
    set((state) => {
      const sorted = [...state.widgets].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((w) => w.id === id);
      if (idx <= 0) return state;
      const arr = [...sorted];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return { widgets: arr.map((w, i) => ({ ...w, order: i })) };
    });
    void get().saveToStorage();
  },

  moveDown: (id) => {
    set((state) => {
      const sorted = [...state.widgets].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((w) => w.id === id);
      if (idx >= sorted.length - 1) return state;
      const arr = [...sorted];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return { widgets: arr.map((w, i) => ({ ...w, order: i })) };
    });
    void get().saveToStorage();
  },

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Widget[];
        // Merge: add any new PIDs not in saved config
        const savedIds = new Set(saved.map((w) => w.id));
        const newWidgets = DEFAULT_WIDGETS.filter((w) => !savedIds.has(w.id))
          .map((w, i) => ({ ...w, order: saved.length + i }));
        set({ widgets: [...saved, ...newWidgets], loaded: true });
        return;
      }
    } catch {
      // fall through to default
    }
    set({ loaded: true });
  },

  saveToStorage: async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().widgets));
    } catch {
      // silently ignore
    }
  },
}));

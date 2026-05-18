import { create } from 'zustand';
import { LogEntry, LogSection } from '../domain/models/LogEntry';

const MAX_ENTRIES = 1000;

interface LogsState {
  entries: LogEntry[];
  addEntry: (entry: LogEntry) => void;
  clearSection: (section: LogSection) => void;
  clearAll: () => void;
}

export const useLogsStore = create<LogsState>((set, get) => ({
  entries: [],

  addEntry: (entry) => {
    const { entries } = get();
    set({
      entries: entries.length >= MAX_ENTRIES
        ? [...entries.slice(-(MAX_ENTRIES - 1)), entry]
        : [...entries, entry],
    });
  },

  clearSection: (section) =>
    set((s) => ({ entries: s.entries.filter((e) => e.section !== section) })),

  clearAll: () => set({ entries: [] }),
}));

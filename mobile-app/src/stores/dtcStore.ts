import { create } from 'zustand';
import { DtcCode } from '../domain/models/DtcCode';
import { getAdapter } from '../infrastructure/adapterFactory';
import { LogService } from '../domain/services/LogService';

interface DtcState {
  codes: DtcCode[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useDtcStore = create<DtcState>((set) => ({
  codes: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await getAdapter().fetchDtcs();
      const codes: DtcCode[] = raw.map((d) => ({ ...d, timestamp: Date.now() }));
      set({ codes, loading: false });
      LogService.add('info', `DTCs: ${codes.length} encontrados`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: msg });
      LogService.add('error', `Error al leer DTCs: ${msg}`);
    }
  },

  clear: async () => {
    set({ loading: true, error: null });
    try {
      await getAdapter().clearDtcs();
      set({ codes: [], loading: false });
      LogService.add('info', 'DTCs borrados');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: msg });
      LogService.add('error', `Error al borrar DTCs: ${msg}`);
    }
  },
}));

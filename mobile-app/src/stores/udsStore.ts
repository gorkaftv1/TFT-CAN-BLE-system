import { create } from 'zustand';
import { getAdapter } from '../infrastructure/adapterFactory';
import { LogService } from '../domain/services/LogService';
import { ALL_DIDS, STANDARD_DIDS, UDS_SESSION_DEFAULT, UDS_SESSION_EXTENDED } from '../config/uds_dids';

interface DidValue {
  value: string | number;
  unit: string;
  timestamp: number;
}

interface UdsState {
  sessionType: number;
  sessionLoading: boolean;
  didValues: Record<string, DidValue | null>;
  readingDid: string | null;
  readAllLoading: boolean;
  error: string | null;

  openExtendedSession: () => Promise<void>;
  closeToDefaultSession: () => Promise<void>;
  readDid: (hexStr: string) => Promise<void>;
  readAllAvailable: () => Promise<void>;
  reset: () => void;
}

export const useUdsStore = create<UdsState>((set, get) => ({
  sessionType:    UDS_SESSION_DEFAULT,
  sessionLoading: false,
  didValues:      {},
  readingDid:     null,
  readAllLoading: false,
  error:          null,

  openExtendedSession: async () => {
    set({ sessionLoading: true, error: null });
    LogService.addUdsTx('DiagnosticSessionControl', 'extendedDiagnosticSession');
    try {
      const info = await getAdapter().setUdsSession(UDS_SESSION_EXTENDED);
      set({ sessionType: info.session_type, sessionLoading: false });
      LogService.addUdsRx('session', 'DiagnosticSession', 'extended', `P2=${info.p2_server_ms}ms`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ sessionLoading: false, error: msg });
      LogService.add('error', `UDS session change failed: ${msg}`);
    }
  },

  closeToDefaultSession: async () => {
    set({ sessionLoading: true, error: null });
    LogService.addUdsTx('DiagnosticSessionControl', 'defaultSession');
    try {
      const info = await getAdapter().setUdsSession(UDS_SESSION_DEFAULT);
      set({ sessionType: info.session_type, sessionLoading: false, didValues: {} });
      LogService.addUdsRx('session', 'DiagnosticSession', 'default');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ sessionLoading: false, error: msg });
      LogService.add('error', `UDS session change failed: ${msg}`);
    }
  },

  readDid: async (hexStr: string) => {
    set({ readingDid: hexStr, error: null });
    LogService.addUdsTx('ReadDataByIdentifier', hexStr);
    try {
      const result = await getAdapter().readUdsDid(hexStr);
      set((s) => ({
        readingDid: null,
        didValues: {
          ...s.didValues,
          [hexStr]: { value: result.value, unit: result.unit, timestamp: Date.now() },
        },
      }));
      LogService.addUdsRx(hexStr, result.name, result.value, result.unit || undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ readingDid: null, error: msg });
      LogService.add('error', `UDS readDid ${hexStr} failed: ${msg}`);
    }
  },

  readAllAvailable: async () => {
    const { sessionType } = get();
    const readable = sessionType === UDS_SESSION_EXTENDED ? ALL_DIDS : STANDARD_DIDS;

    set({ readAllLoading: true, error: null });
    LogService.add('info', `UDS read all — ${readable.length} DIDs`);
    const newValues: Record<string, DidValue | null> = { ...get().didValues };

    for (const def of readable) {
      LogService.addUdsTx('ReadDataByIdentifier', def.hexStr);
      try {
        const result = await getAdapter().readUdsDid(def.hexStr);
        newValues[def.hexStr] = { value: result.value, unit: result.unit, timestamp: Date.now() };
        LogService.addUdsRx(def.hexStr, result.name, result.value, result.unit || undefined);
      } catch {
        newValues[def.hexStr] = null;
      }
    }

    set({ readAllLoading: false, didValues: newValues });
  },

  reset: () => set({
    sessionType:    UDS_SESSION_DEFAULT,
    sessionLoading: false,
    didValues:      {},
    readingDid:     null,
    readAllLoading: false,
    error:          null,
  }),
}));

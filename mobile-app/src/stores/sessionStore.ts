import { create } from 'zustand';
import { Session } from '../domain/models/Session';
import { getAdapter } from '../infrastructure/adapterFactory';

interface SessionState {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const raw: any[] = await getAdapter().getSessions(50);
      const sessions: Session[] = raw.map((s) => ({
        session_id:   s.session_id,
        label:        s.label ?? '',
        started_at:   s.started_at,
        ended_at:     s.ended_at ?? null,
        sample_count: s.sample_count ?? 0,
        dtc_count:    null,
      }));
      sessions.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
      set({ sessions, loading: false });

      // load DTC counts sequentially in background (BLE is serial)
      for (const session of sessions) {
        try {
          const dtcs = await getAdapter().getSessionDtcs(session.session_id);
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.session_id === session.session_id ? { ...s, dtc_count: dtcs.length } : s
            ),
          }));
        } catch {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.session_id === session.session_id ? { ...s, dtc_count: 0 } : s
            ),
          }));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: msg });
    }
  },
}));

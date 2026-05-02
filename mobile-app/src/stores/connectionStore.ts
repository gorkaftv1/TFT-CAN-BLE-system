import { create } from 'zustand';
import { getAdapter } from '../infrastructure/adapterFactory';
import { VehicleService } from '../domain/services/VehicleService';
import { useVehicleStore } from './vehicleStore';

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';

interface ConnectionState {
  status: ConnectionStatus;
  deviceName: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setStatus: (status: ConnectionStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  deviceName: null,
  error: null,

  connect: async () => {
    set({ status: 'scanning', error: null });
    try {
      set({ status: 'connecting' });
      await getAdapter().connect();
      set({ status: 'connected', deviceName: 'SEAT_DIAG' });
      VehicleService.fetchVin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: 'disconnected', error: msg });
    }
  },

  disconnect: async () => {
    VehicleService.stop();
    await getAdapter().disconnect();
    useVehicleStore.getState().clear();
    set({ status: 'disconnected', deviceName: null, error: null });
  },

  setStatus: (status) => set({ status }),
}));

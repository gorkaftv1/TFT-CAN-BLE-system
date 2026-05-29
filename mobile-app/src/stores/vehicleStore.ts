import { create } from 'zustand';

export interface PidSample {
  pid: number;
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  error?: boolean;
}

interface VehicleState {
  samples: Record<number, PidSample>;
  vin: string | null;
  monitoring: boolean;
  updateSample: (sample: PidSample) => void;
  setVin: (vin: string | null) => void;
  setMonitoring: (v: boolean) => void;
  getSample: (pid: number) => PidSample | undefined;
  clear: () => void;
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  samples: {},
  vin: null,
  monitoring: false,

  updateSample: (sample) =>
    set((state) => ({ samples: { ...state.samples, [sample.pid]: sample } })),

  setVin: (vin) => set({ vin }),
  setMonitoring: (v) => set({ monitoring: v }),
  getSample: (pid) => get().samples[pid],
  clear: () => set({ samples: {}, monitoring: false, vin: null }),
}));

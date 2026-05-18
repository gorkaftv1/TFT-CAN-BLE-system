import { create } from 'zustand';
import { getAdapter } from '../infrastructure/adapterFactory';
import { BleAdapter, ScannedDevice } from '../infrastructure/BleAdapter';
import { VehicleService } from '../domain/services/VehicleService';
import { useVehicleStore } from './vehicleStore';
import { LogService } from '../domain/services/LogService';

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';

interface ConnectionState {
  status: ConnectionStatus;
  deviceName: string | null;
  error: string | null;
  scannedDevices: ScannedDevice[];
  stopScanFn: (() => void) | null;

  startScan: () => void;
  stopScan: () => void;
  connect: (deviceId: string, deviceLabel: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: 'disconnected',
  deviceName: null,
  error: null,
  scannedDevices: [],
  stopScanFn: null,

  startScan: () => {
    get().stopScanFn?.();
    set({ status: 'scanning', scannedDevices: [], error: null });
    const ble = BleAdapter.getInstance();
    const stop = ble.startScan((device) => {
      set((s) => {
        if (s.scannedDevices.some((d) => d.id === device.id)) return s;
        return { scannedDevices: [...s.scannedDevices, device] };
      });
    });
    // auto-stop scan after timeout, revert status to disconnected
    const timer = setTimeout(() => {
      set((s) => ({ status: s.status === 'scanning' ? 'disconnected' : s.status, stopScanFn: null }));
    }, 20_000);
    set({ stopScanFn: () => { clearTimeout(timer); stop(); } });
  },

  stopScan: () => {
    get().stopScanFn?.();
    set({ stopScanFn: null, status: 'disconnected' });
  },

  connect: async (deviceId, deviceLabel) => {
    get().stopScanFn?.();
    set({ status: 'connecting', error: null, stopScanFn: null });
    // Brief pause: let BLE stack settle after stopping scan before connecting
    await new Promise((r) => setTimeout(r, 300));
    try {
      await getAdapter().connect(deviceId, deviceLabel);
      set({ status: 'connected', deviceName: deviceLabel });
      LogService.add('info', `Conectado a ${deviceLabel}`);
      VehicleService.fetchVin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: 'disconnected', error: msg });
    }
  },

  disconnect: async () => {
    LogService.add('info', `Desconectando de ${get().deviceName ?? 'dispositivo'}`);
    VehicleService.stop();
    await getAdapter().disconnect();
    useVehicleStore.getState().clear();
    set({ status: 'disconnected', deviceName: null, error: null, scannedDevices: [] });
  },
}));

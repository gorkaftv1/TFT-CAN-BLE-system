import { create } from 'zustand';
import { getAdapter } from '../infrastructure/adapterFactory';
import { BleAdapter, ScannedDevice } from '../infrastructure/BleAdapter';
import { VehicleService } from '../domain/services/VehicleService';
import { useVehicleStore } from './vehicleStore';
import { usePidSupportStore } from './pidSupportStore';
import { LogService } from '../domain/services/LogService';

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';

interface ConnectionState {
  status: ConnectionStatus;
  deviceName: string | null;
  error: string | null;
  disconnectedUnexpectedly: boolean;
  scannedDevices: ScannedDevice[];
  stopScanFn: (() => void) | null;

  startScan: () => void;
  stopScan: () => void;
  connect: (deviceId: string, deviceLabel: string) => Promise<void>;
  disconnect: () => Promise<void>;
  clearDisconnectError: () => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: 'disconnected',
  deviceName: null,
  error: null,
  disconnectedUnexpectedly: false,
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
    set({ status: 'connecting', error: null, disconnectedUnexpectedly: false, stopScanFn: null });
    // Brief pause: let BLE stack settle after stopping scan before connecting
    await new Promise((r) => setTimeout(r, 300));
    try {
      await getAdapter().connect(deviceId, deviceLabel);
      BleAdapter.getInstance().onUnexpectedDisconnect = () => {
        VehicleService.stop();
        useVehicleStore.getState().clear();
        usePidSupportStore.getState().clear();
        set({ status: 'disconnected', deviceName: null, error: null, disconnectedUnexpectedly: true, scannedDevices: [] });
      };
      set({ status: 'connected', deviceName: deviceLabel });
      LogService.add('info', `Conectado a ${deviceLabel}`);
      VehicleService.fetchVin();
      void usePidSupportStore.getState().probe();
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
    usePidSupportStore.getState().clear();
    set({ status: 'disconnected', deviceName: null, error: null, disconnectedUnexpectedly: false, scannedDevices: [] });
  },

  clearDisconnectError: () => set({ disconnectedUnexpectedly: false }),
}));

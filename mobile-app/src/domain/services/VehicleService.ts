import { getAdapter } from '../../infrastructure/adapterFactory';
import { MonitorSample } from '../models/MonitorSample';
import { useVehicleStore, PidSample } from '../../stores/vehicleStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { LogService } from './LogService';
import { PID_MAP } from '../../config/obd_pids';

let stopMonitor: (() => void) | null = null;

function handleSample(sample: MonitorSample): void {
  const now = Date.now();

  if (sample.type === 'error') {
    const existing = useVehicleStore.getState().getSample(sample.pid);
    if (existing) {
      useVehicleStore.getState().updateSample({ ...existing, error: true, timestamp: now });
    } else {
      useVehicleStore.getState().updateSample({
        pid: sample.pid,
        name: sample.name,
        value: 0,
        unit: '',
        timestamp: now,
        error: true,
      });
    }
    LogService.addObdError(sample.pid, sample.name, sample.message ?? 'read error');
    return;
  }

  const pidSample: PidSample = {
    pid: sample.pid,
    name: sample.name,
    value: sample.value,
    unit: sample.unit,
    timestamp: now,
    error: false,
  };
  useVehicleStore.getState().updateSample(pidSample);
  LogService.addObdSample(sample.pid, sample.name, sample.value, sample.unit);
}

export class VehicleService {
  static start(): void {
    if (stopMonitor) return;

    const widgets = useDashboardStore.getState().widgets;
    const pids = widgets.filter((w) => w.visible).map((w) => w.pid);

    if (pids.length === 0) {
      LogService.add('warning', 'monitor_start — no active sensors');
      return;
    }

    const interval = useSettingsStore.getState().monitorIntervalMs;
    const adapter = getAdapter();
    stopMonitor = adapter.startMonitor(pids, interval, handleSample);
    useVehicleStore.getState().setMonitoring(true);
    LogService.add('info', `monitor_start — ${pids.length} PIDs: ${pids.map((p) => '0x' + p.toString(16).toUpperCase()).join(', ')}`);
  }

  static stop(): void {
    stopMonitor?.();
    stopMonitor = null;
    useVehicleStore.getState().clear();
    LogService.add('info', 'monitor_stop');
  }

  static async snapshot(): Promise<void> {
    LogService.add('info', 'snapshot — requesting all PIDs');
    const data = await getAdapter().getSnapshot();
    const now  = Date.now();

    const visiblePids = new Set(
      useDashboardStore.getState().widgets.filter((w) => w.visible).map((w) => w.pid),
    );

    for (const [pid, def] of PID_MAP.entries()) {
      if (!visiblePids.has(pid)) continue;
      const entry = data[def.name];
      if (entry) {
        useVehicleStore.getState().updateSample({
          pid, name: def.name, value: entry.value, unit: entry.unit, timestamp: now, error: false,
        });
        LogService.addObdSample(pid, def.name, entry.value, entry.unit);
      } else {
        useVehicleStore.getState().updateSample({
          pid, name: def.name, value: 0, unit: def.unit, timestamp: now, error: true,
        });
        LogService.addObdError(pid, def.name, 'Tiempo de espera agotado');
      }
    }
  }

  static async fetchVin(): Promise<void> {
    try {
      const vin = await getAdapter().getVin();
      useVehicleStore.getState().setVin(vin);
      LogService.add('info', `VIN: ${vin}`);
    } catch {
      // VIN not available on all vehicles
    }
  }
}

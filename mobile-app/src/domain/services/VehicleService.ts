import { getAdapter } from '../../infrastructure/adapterFactory';
import { MonitorSample } from '../models/MonitorSample';
import { useVehicleStore, PidSample } from '../../stores/vehicleStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useLogsStore } from '../../stores/logsStore';
import { LogService } from './LogService';

const INTERVAL_MS = 500;

let stopMonitor: (() => void) | null = null;

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, z = 2) => n.toString().padStart(z, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function handleSample(sample: MonitorSample): void {
  const now = Date.now();

  if (sample.type === 'error') {
    useLogsStore.getState().addConsoleLine(
      `[${fmtTime(now)}] [ERR] pid:0x${sample.pid?.toString(16).toUpperCase().padStart(2,'0')} ${sample.message ?? ''}`,
    );
    return;
  }

  const pidSample: PidSample = {
    pid: sample.pid,
    name: sample.name,
    value: sample.value,
    unit: sample.unit,
    timestamp: now,
  };
  useVehicleStore.getState().updateSample(pidSample);
  LogService.add('data', `pid:0x${sample.pid.toString(16).toUpperCase().padStart(2,'0')} ${sample.name}=${sample.value} ${sample.unit}`);
}

export class VehicleService {
  static start(): void {
    if (stopMonitor) return;

    const widgets = useDashboardStore.getState().widgets;
    const pids = widgets.filter((w) => w.visible).map((w) => w.pid);

    if (pids.length === 0) {
      useLogsStore.getState().addConsoleLine(`[SYS] No PIDs enabled — enable widgets in Customize first`);
      return;
    }

    const adapter = getAdapter();
    stopMonitor = adapter.startMonitor(pids, INTERVAL_MS, handleSample);
    useVehicleStore.getState().setMonitoring(true);
    useLogsStore.getState().addConsoleLine(`[SYS] Monitor started: ${pids.length} PIDs`);
    LogService.add('info', `monitor_start — ${pids.length} PIDs: ${pids.map(p => '0x' + p.toString(16).toUpperCase()).join(', ')}`);
  }

  static stop(): void {
    stopMonitor?.();
    stopMonitor = null;
    useVehicleStore.getState().clear();
    useLogsStore.getState().addConsoleLine(`[SYS] Monitor stopped`);
    LogService.add('info', 'monitor_stop');
  }

  static async fetchVin(): Promise<void> {
    try {
      const vin = await getAdapter().getVin();
      useVehicleStore.getState().setVin(vin);
      useLogsStore.getState().addConsoleLine(`[SYS] VIN: ${vin}`);
      LogService.add('info', `VIN: ${vin}`);
    } catch {
      // VIN not available on all vehicles
    }
  }
}

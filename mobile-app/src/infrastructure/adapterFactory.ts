import { IVehicleAdapter } from './IVehicleAdapter';
import { BleAdapter } from './BleAdapter';
import { MockAdapter } from './MockAdapter';

// Set to true to test without real BLE hardware (build scripts patch this)
export const USE_MOCK = true;

let _adapter: IVehicleAdapter | null = null;

export function getAdapter(): IVehicleAdapter {
  if (!_adapter) {
    _adapter = USE_MOCK ? new MockAdapter() : BleAdapter.getInstance();
  }
  return _adapter;
}



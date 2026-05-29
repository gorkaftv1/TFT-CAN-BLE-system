import { IVehicleAdapter } from './IVehicleAdapter';
import { BleAdapter } from './BleAdapter';
import { MockAdapter } from './MockAdapter';

let _adapter: IVehicleAdapter | null = null;
let _useMock = false;

export function getAdapter(): IVehicleAdapter {
  if (!_adapter) {
    _adapter = _useMock ? new MockAdapter() : BleAdapter.getInstance();
  }
  return _adapter;
}

export function configureAdapter(useMock: boolean): void {
  _useMock = useMock;
  _adapter = null;
}

export function isUsingMock(): boolean {
  return _useMock;
}





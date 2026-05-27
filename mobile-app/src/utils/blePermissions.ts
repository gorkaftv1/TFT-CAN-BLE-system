import { Alert, PermissionsAndroid, Platform } from 'react-native';

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    const granted = Object.values(result).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED,
    );
    if (!granted) {
      Alert.alert(
        'Permisos necesarios',
        'DIAG necesita permiso de Bluetooth para buscar y conectar con el adaptador de diagnóstico. Actívalo en Ajustes > Aplicaciones > DIAG > Permisos.',
        [{ text: 'Aceptar' }],
      );
    }
    return granted;
  }

  // Android 6–11: location required for BLE scan
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Permiso de ubicación',
      message: 'DIAG necesita acceso a la ubicación para buscar dispositivos Bluetooth cercanos.',
      buttonPositive: 'Permitir',
      buttonNegative: 'Cancelar',
    },
  );
  const granted = result === PermissionsAndroid.RESULTS.GRANTED;
  if (!granted) {
    Alert.alert(
      'Permiso denegado',
      'Sin permiso de ubicación no es posible buscar dispositivos BLE en esta versión de Android.',
      [{ text: 'Aceptar' }],
    );
  }
  return granted;
}

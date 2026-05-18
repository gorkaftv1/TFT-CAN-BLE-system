import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScanModal, SimulateConfirmModal, useConnectionFlow } from './ConnectionFlowModals';
import { colors, fontSize, spacing } from '../shared/theme';

type ScreenKey = 'dashboard' | 'dtc' | 'console';

interface Props { screen: ScreenKey }

const COPY: Record<ScreenKey, { title: string; description: string }> = {
  dashboard: {
    title: 'Panel',
    description:
      'Una vez conectado al dispositivo de diagnostico podras hacer una captura momentanea de los datos del vehiculo o monitorizarlos en tiempo real.',
  },
  dtc: {
    title: 'Averias',
    description:
      'Una vez conectado podras leer los codigos de averia almacenados en el vehiculo y borrarlos.',
  },
  console: {
    title: 'Consola',
    description:
      'Una vez conectado veras la traza de la comunicacion Bluetooth, OBD y UDS en tiempo real.',
  },
};

export function DisconnectedState({ screen }: Props) {
  const { title, description } = COPY[screen];
  const { scanOpen, simOpen, openScan, closeScan, openSim, closeSim } = useConnectionFlow();

  return (
    <View style={s.root}>
      <View style={s.inner}>
        <Text style={s.screenTitle}>{title}</Text>
        <Text style={s.headline}>Estas sin conexion</Text>
        <Text style={s.description}>{description}</Text>

        <View style={s.btnRow}>
          <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={openScan} activeOpacity={0.75}>
            <Text style={[s.btnLabel, s.btnLabelPrimary]}>CONECTAR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={openSim} activeOpacity={0.75}>
            <Text style={[s.btnLabel, s.btnLabelSecondary]}>SIMULAR</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScanModal visible={scanOpen} onClose={closeScan} />
      <SimulateConfirmModal visible={simOpen} onClose={closeSim} />
    </View>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  inner: { padding: spacing.xl, maxWidth: 360, width: '100%', alignItems: 'center' },

  screenTitle: {
    fontSize: fontSize.xl ?? 24, fontWeight: '700', color: colors.textSecondary,
    marginBottom: spacing.lg, alignSelf: 'flex-start',
  },
  headline: {
    fontSize: fontSize.lg, fontWeight: '800', color: colors.error,
    marginBottom: spacing.md, alignSelf: 'flex-start',
  },
  description: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    lineHeight: 22, marginBottom: spacing.xl, textAlign: 'left',
  },

  btnRow: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  btn:    { flex: 1, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center' },
  btnPrimary:        { backgroundColor: colors.primary },
  btnSecondary:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnLabel:          { fontSize: fontSize.sm, fontWeight: '700' },
  btnLabelPrimary:   { color: colors.background },
  btnLabelSecondary: { color: colors.textSecondary },
});

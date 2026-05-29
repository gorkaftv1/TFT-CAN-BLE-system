import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { DashboardScreen }  from '../screens/dashboard/DashboardScreen';
import { DtcScreen }        from '../screens/dtcs/DtcScreen';
import { SessionsScreen }   from '../screens/sessions/SessionsScreen';
import { ConsoleScreen }    from '../screens/console/ConsoleScreen';
import { SettingsScreen }   from '../screens/settings/SettingsScreen';
import { useConnectionStore } from '../stores/connectionStore';
import { useSettingsStore }   from '../stores/settingsStore';
import { colors, fontSize, spacing } from '../shared/theme';
import { DashboardIcon, WarningIcon, ConsoleIcon, SettingsIcon, HistoryIcon } from '../assets/icons';

const Tab = createBottomTabNavigator();

function DisconnectButton() {
  const { status, disconnect } = useConnectionStore();
  const { useMock, setUseMock } = useSettingsStore();

  const isActive = useMock || status === 'connected';
  if (!isActive) return null;

  const handlePress = () => {
    const title   = useMock ? '¿Terminar simulacion?' : '¿Desconectar?';
    const message = useMock
      ? 'Se desactivara el modo simulacion y volveras al estado desconectado.'
      : 'Se cerrara la conexion con el adaptador de diagnostico.';
    const btnText = useMock ? 'Finalizar' : 'Desconectar';

    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: btnText,
        style: 'destructive',
        onPress: () => {
          if (useMock) {
            void disconnect().then(() => setUseMock(false));
          } else {
            void disconnect();
          }
        },
      },
    ]);
  };

  return (
    <TouchableOpacity style={s.btn} onPress={handlePress} activeOpacity={0.75}>
      <Text style={s.label}>{useMock ? 'Finalizar' : 'Desconectar'}</Text>
      <Text style={s.dot}>●</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: spacing.md, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: colors.error + '60', backgroundColor: colors.error + '12' },
  label: { fontSize: fontSize.xs, color: colors.error, fontWeight: '600' },
  dot:   { fontSize: 8, color: colors.error },
});

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused }) => {
            const color = focused ? colors.primary : colors.textSecondary;
            const size  = 24;
            switch (route.name) {
              case 'Panel':    return <DashboardIcon color={color} size={size} />;
              case 'Averias':  return <WarningIcon   color={color} size={size} />;
              case 'Sesiones': return <HistoryIcon   color={color} size={size} />;
              case 'Consola':  return <ConsoleIcon   color={color} size={size} />;
              case 'Ajustes':  return <SettingsIcon  color={color} size={size} />;
              default:         return null;
            }
          },
          tabBarStyle:            { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
          tabBarActiveTintColor:  colors.primary,
          tabBarInactiveTintColor:colors.textSecondary,
          tabBarLabelStyle:       { fontSize: fontSize.xs },
          headerStyle: {
            backgroundColor: colors.surface,
            shadowColor: 'transparent',
            elevation: 0,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          } as object,
          headerTintColor:     colors.text,
          headerTitleStyle:    { fontWeight: '600' as const },
          headerRight:         () => <DisconnectButton />,
        })}
      >
        <Tab.Screen name="Panel"   component={DashboardScreen} options={{ title: 'Panel' }}   />
        <Tab.Screen name="Averias"  component={DtcScreen}       options={{ title: 'Averias' }}   />
        <Tab.Screen name="Sesiones" component={SessionsScreen}  options={{ title: 'Sesiones' }}  />
        <Tab.Screen name="Consola"  component={ConsoleScreen}   options={{ title: 'Consola' }}   />
        <Tab.Screen name="Ajustes" component={SettingsScreen}  options={{ title: 'Ajustes' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

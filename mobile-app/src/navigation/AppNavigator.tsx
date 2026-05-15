import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { View } from 'react-native';
import { ConnectionScreen } from '../screens/connection/ConnectionScreen';
import { ConsoleScreen }    from '../screens/console/ConsoleScreen';
import { CustomizeScreen }  from '../screens/customize/CustomizeScreen';
import { DashboardScreen }  from '../screens/dashboard/DashboardScreen';
import { DtcScreen }        from '../screens/dtcs/DtcScreen';
import { LogsScreen }       from '../screens/logs/LogsScreen';
import { UdsScreen }        from '../screens/uds/UdsScreen';
import { colors, fontSize } from '../shared/theme';
import {
  ConnectionIcon, DashboardIcon, WarningIcon,
  ConsoleIcon, SettingsIcon, LogsIcon, UdsIcon,
} from '../assets/icons';

const Tab = createBottomTabNavigator();

export function AppNavigator() {
  const getIcon = (name: string, color: string) => {
    const props = { color, size: 24 };
    switch (name) {
      case 'Conexión':    return <ConnectionIcon {...props} />;
      case 'Panel':       return <DashboardIcon  {...props} />;
      case 'Averías':     return <WarningIcon     {...props} />;
      case 'Consola':     return <ConsoleIcon     {...props} />;
      case 'Configurar':  return <SettingsIcon    {...props} />;
      case 'Registros':   return <LogsIcon        {...props} />;
      case 'UDS':         return <UdsIcon         {...props} />;
      default:            return <View />;
    }
  };

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused }) => getIcon(route.name, focused ? colors.primary : colors.textSecondary),
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
          tabBarActiveTintColor:   colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: { fontSize: fontSize.xs },
          headerStyle: {
            backgroundColor: colors.surface,
            shadowColor: 'transparent',
            elevation: 0,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          } as object,
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' as const },
        })}
      >
        <Tab.Screen name="Conexión"   component={ConnectionScreen} />
        <Tab.Screen name="Panel"      component={DashboardScreen}  />
        <Tab.Screen name="Averías"    component={DtcScreen}        />
        <Tab.Screen name="Consola"    component={ConsoleScreen}    />
        <Tab.Screen name="Configurar" component={CustomizeScreen}  />
        <Tab.Screen name="Registros"  component={LogsScreen}       />
        <Tab.Screen name="UDS"        component={UdsScreen}        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

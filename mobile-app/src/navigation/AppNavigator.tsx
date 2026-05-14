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
      case 'Connection': return <ConnectionIcon {...props} />;
      case 'Dashboard':  return <DashboardIcon  {...props} />;
      case 'DTCs':       return <WarningIcon     {...props} />;
      case 'Console':    return <ConsoleIcon     {...props} />;
      case 'Customize':  return <SettingsIcon    {...props} />;
      case 'Logs':       return <LogsIcon        {...props} />;
      case 'UDS':        return <UdsIcon         {...props} />;
      default:           return <View />;
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
        <Tab.Screen name="Connection" component={ConnectionScreen} />
        <Tab.Screen name="Dashboard"  component={DashboardScreen}  />
        <Tab.Screen name="DTCs"       component={DtcScreen}        />
        <Tab.Screen name="Console"    component={ConsoleScreen}     />
        <Tab.Screen name="Customize"  component={CustomizeScreen}   />
        <Tab.Screen name="Logs"       component={LogsScreen}        />
        <Tab.Screen name="UDS"        component={UdsScreen}         />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

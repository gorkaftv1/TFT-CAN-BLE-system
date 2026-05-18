import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { DtcScreen }       from '../screens/dtcs/DtcScreen';
import { ConsoleScreen }   from '../screens/console/ConsoleScreen';
import { SettingsScreen }  from '../screens/settings/SettingsScreen';
import { colors, fontSize } from '../shared/theme';
import { DashboardIcon, WarningIcon, ConsoleIcon, SettingsIcon } from '../assets/icons';

const Tab = createBottomTabNavigator();

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
        })}
      >
        <Tab.Screen name="Panel"   component={DashboardScreen} options={{ title: 'Panel' }}   />
        <Tab.Screen name="Averias" component={DtcScreen}       options={{ title: 'Averias' }} />
        <Tab.Screen name="Consola" component={ConsoleScreen}   options={{ title: 'Consola' }} />
        <Tab.Screen name="Ajustes" component={SettingsScreen}  options={{ title: 'Ajustes' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

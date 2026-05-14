import React from 'react';
import { Text } from 'react-native';

interface IconProps { color: string; size: number; }

// Simple text-based icons — replace with SVG library if needed

export function ConnectionIcon({ color, size }: IconProps) {
  return <Text style={{ color, fontSize: size * 0.75 }}>⬡</Text>;
}

export function DashboardIcon({ color, size }: IconProps) {
  return <Text style={{ color, fontSize: size * 0.75 }}>◈</Text>;
}

export function WarningIcon({ color, size }: IconProps) {
  return <Text style={{ color, fontSize: size * 0.75 }}>⚠</Text>;
}

export function ConsoleIcon({ color, size }: IconProps) {
  return <Text style={{ color, fontSize: size * 0.75 }}>❯</Text>;
}

export function SettingsIcon({ color, size }: IconProps) {
  return <Text style={{ color, fontSize: size * 0.75 }}>⚙</Text>;
}

export function LogsIcon({ color, size }: IconProps) {
  return <Text style={{ color, fontSize: size * 0.75 }}>≡</Text>;
}

export function UdsIcon({ color, size }: IconProps) {
  return <Text style={{ color, fontSize: size * 0.75 }}>⊕</Text>;
}

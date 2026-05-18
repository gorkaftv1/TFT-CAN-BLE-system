import { Platform } from 'react-native';

export const colors = {
  // Backgrounds
  background:      '#111827', // gray-900
  surface:         '#1F2937', // gray-800
  surfaceElevated: '#374151', // gray-700

  // Borders
  border: '#374151', // gray-700

  // Brand / accent
  primary: '#3B82F6', // blue-500  — trustworthy, modern, not neon

  // Semantic
  success: '#10B981', // emerald-500
  warning: '#F59E0B', // amber-500
  error:   '#EF4444', // red-500

  // Text
  text:          '#F9FAFB', // gray-50
  textSecondary: '#9CA3AF', // gray-400
  textMuted:     '#6B7280', // gray-500
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const fontSize = { xs: 11, sm: 13, md: 16, lg: 20, xl: 28, xxl: 40 };

export const monoFont = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  default: 'monospace',
});

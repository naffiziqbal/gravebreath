import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Alert, Platform, View } from 'react-native';
import { inject } from '@vercel/analytics';
import { MenuAmbience } from '../components/MenuAmbience';

// Vercel Web Analytics for the browser build (gravebreath.vercel.app). Native builds skip it.
if (Platform.OS === 'web' && typeof window !== 'undefined') inject({ framework: 'expo' });

// Test builds only for now: show a JavaScript crash instead of closing silently, so it can be read off the phone.
// Remove before the store release.
const errors = (globalThis as { ErrorUtils?: { setGlobalHandler(h: (e: Error, fatal?: boolean) => void): void } }).ErrorUtils;
if (!__DEV__) errors?.setGlobalHandler((e, fatal) => Alert.alert(fatal ? 'Gravebreath crashed' : 'Gravebreath error', `${e?.message}\n\n${(e?.stack ?? '').slice(0, 900)}`));

export default function RootLayout() {
  const [loaded] = useFonts({
    Nosifer: require('../../assets/fonts/Nosifer-Regular.ttf'),
    Creepster: require('../../assets/fonts/Creepster-Regular.ttf'),
  });
  useEffect(() => {
    if (Platform.OS !== 'web') ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  return (
    <>
      <StatusBar hidden />
      <MenuAmbience />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' }, animation: 'fade' }} />
    </>
  );
}

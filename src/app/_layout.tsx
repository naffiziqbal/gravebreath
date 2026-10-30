import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform, View } from 'react-native';
import { MenuAmbience } from '../components/MenuAmbience';

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

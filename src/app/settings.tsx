// Settings from the title screen (in a run they live in the pause menu).
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SettingsPanel } from '../components/SettingsPanel';

export default function SettingsScreen() {
  return (
    <View style={styles.root}>
      <SettingsPanel onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 16 },
});

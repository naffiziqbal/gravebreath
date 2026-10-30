// Brightness calibration: shown before the first run and from Settings. The game is very dark and phone screens vary,
// so the player raises the brightness until a near-black hand is just visible.
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGame } from '../game/store';
import { brightnessGamma } from '../game/settings';
import { ash, blood, bone, fonts } from '../theme';

/** Roughly how a linear scene value comes out of the game's pipeline (gamma, tone mapping, sRGB) as a grey level. */
function shown(linear: number, gamma: number): string {
  const v = Math.min(1, Math.pow(linear, gamma) * 0.8);
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  const c = Math.round(s * 255);
  return `rgb(${c},${c},${c})`;
}

export default function Calibrate() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const brightness = useGame((s) => s.settings.brightness);
  const update = useGame((s) => s.updateSettings);
  const g = brightnessGamma(brightness);
  const done = () => {
    update({ calibrated: true });
    if (next) router.replace(next.startsWith('/') ? (next as '/play') : '/play');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Brightness</Text>
      <Text style={styles.text}>Raise the brightness until the left hand is only just visible. The right one should be easy to see.</Text>
      <View style={styles.hands}>
        <MaterialCommunityIcons name="hand-back-right" size={96} color={shown(0.0025, g)} />
        <MaterialCommunityIcons name="hand-back-right" size={96} color={shown(0.02, g)} />
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={() => update({ brightness: Math.max(-5, brightness - 1) })} style={styles.stepBtn} hitSlop={8} accessibilityLabel="Darker"><Text style={styles.stepText}>−</Text></Pressable>
        <Text style={styles.value}>{brightness > 0 ? `+${brightness}` : brightness}</Text>
        <Pressable onPress={() => update({ brightness: Math.min(5, brightness + 1) })} style={styles.stepBtn} hitSlop={8} accessibilityLabel="Brighter"><Text style={styles.stepText}>+</Text></Pressable>
      </View>
      <Text style={styles.small}>Turn your screen brightness up and play in a dark room for the best experience.</Text>
      <Pressable onPress={done} style={styles.done}><Text style={styles.doneText}>{next ? 'Continue' : 'Done'}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontFamily: fonts.creepster, fontSize: 32, color: blood },
  text: { marginTop: 6, color: bone, fontSize: 15, textAlign: 'center', maxWidth: 520 },
  hands: { flexDirection: 'row', gap: 80, marginVertical: 18 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(228,216,196,0.3)', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: bone, fontSize: 24, lineHeight: 26 },
  value: { color: bone, fontSize: 20, minWidth: 40, textAlign: 'center' },
  small: { marginTop: 14, color: ash, fontSize: 12, textAlign: 'center' },
  done: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 40, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(163,18,14,0.75)', backgroundColor: 'rgba(20,4,4,0.6)' },
  doneText: { color: bone, fontFamily: fonts.creepster, fontSize: 22 },
});

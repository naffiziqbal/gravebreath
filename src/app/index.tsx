// Title screen.
import { useEffect } from 'react';
import { router } from 'expo-router';
import { AUTOPILOT } from '../game/dev/autopilot';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGame } from '../game/store';
import { ash, blood, bone, fonts } from '../theme';

export default function Title() {
  const meta = useGame((s) => s.meta);
  const reset = useGame((s) => s.reset);
  useEffect(() => {
    if (AUTOPILOT) setTimeout(() => router.push('/play'), 1500);
  }, []);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>GRAVEBREATH</Text>
      <Text style={styles.tag}>Every breath is borrowed.</Text>
      <View style={styles.menu}>
        <Pressable onPress={() => { reset(); router.push('/play'); }} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <Text style={styles.btnText}>{meta.runs === 0 ? 'Wake up' : 'Wake again'}</Text>
        </Pressable>
        {meta.runs > 0 && (
          <Pressable onPress={() => router.push('/ledger')} style={({ pressed }) => [styles.btn, styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.btnText}>The ledger · {meta.victims.length} names</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.headphones}>Play with headphones, in the dark.</Text>
      <Text style={styles.studio}>NEXUS BENDERS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontFamily: fonts.nosifer, fontSize: 54, color: blood, textShadowColor: '#300', textShadowRadius: 18 },
  tag: { marginTop: 10, color: ash, fontSize: 16, fontStyle: 'italic' },
  menu: { marginTop: 36, gap: 12, alignItems: 'center' },
  btn: { minWidth: 240, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(163,18,14,0.7)', alignItems: 'center' },
  secondary: { borderColor: 'rgba(228,216,196,0.25)' },
  pressed: { backgroundColor: 'rgba(163,18,14,0.25)' },
  btnText: { color: bone, fontFamily: fonts.creepster, fontSize: 24, letterSpacing: 1 },
  headphones: { position: 'absolute', bottom: 34, color: ash, fontSize: 12, letterSpacing: 1 },
  studio: { position: 'absolute', bottom: 14, color: 'rgba(143,133,122,0.6)', fontSize: 10, letterSpacing: 3 },
});

// Title screen. Sized to the screen's height so it fits short landscape phones; everything flows top to bottom
// (nothing pinned to the edges), and it scrolls if a screen is tinier still. The studio name lives on the splash.
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { AUTOPILOT } from '../game/dev/autopilot';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGame } from '../game/store';
import { clearRun, loadRun } from '../game/save';
import { ash, blood, bone, fonts } from '../theme';

export default function Title() {
  const meta = useGame((s) => s.meta);
  const reset = useGame((s) => s.reset);
  const settings = useGame((s) => s.settings);
  const [saved] = useState(() => loadRun()); // a run interrupted by a call or app switch
  const [picking, setPicking] = useState(false); // the Descend panel is open
  const { width, height } = useWindowDimensions();
  // scale with the screen: a phone held sideways is often under 400 points tall
  const k = Math.max(0.62, Math.min(1, height / 560, width / 900));
  // shortcuts: start at the entrance of any layer a past victim reached (with less air and fewer matches)
  const deepest = Math.min(5, Math.max(0, ...meta.victims.map((v) => v.layer)));
  const descend = [3, 4, 5].filter((l) => l <= deepest);
  const go = (path: string) => { reset(); router.push(settings.calibrated ? path : `/calibrate?next=${encodeURIComponent(path)}`); };
  useEffect(() => {
    if (AUTOPILOT) setTimeout(() => router.push('/play'), 1500);
  }, []);
  const btn = { paddingVertical: 12 * k, minWidth: 260 * k };
  const btnText = { fontSize: 24 * k };
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingVertical: 18 * k }]} bounces={false} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { fontSize: 54 * k }]} adjustsFontSizeToFit numberOfLines={1}>GRAVEBREATH</Text>
        <Text style={[styles.tag, { fontSize: 16 * k, marginTop: 6 * k }]}>Every breath is borrowed.</Text>
        <View style={[styles.menu, { marginTop: 22 * k, gap: 10 * k }]}>
          {saved && (
            <Pressable onPress={() => go('/play?resume=1')} style={({ pressed }) => [styles.btn, btn, pressed && styles.pressed]}>
              <Text style={[styles.btnText, btnText]}>Continue</Text>
            </Pressable>
          )}
          <Pressable onPress={() => { clearRun(); go('/play'); }} style={({ pressed }) => [styles.btn, btn, saved && styles.secondary, pressed && styles.pressed]}>
            <Text style={[styles.btnText, btnText]}>{meta.runs === 0 ? 'Wake up' : 'Wake again'}</Text>
          </Pressable>
          {descend.length > 0 && (
            <Pressable onPress={() => setPicking(true)} style={({ pressed }) => [styles.btn, btn, styles.secondary, pressed && styles.pressed]}>
              <Text style={[styles.btnText, btnText]}>Descend…</Text>
            </Pressable>
          )}
          {meta.runs > 0 && (
            <Pressable onPress={() => router.push('/ledger')} style={({ pressed }) => [styles.btn, btn, styles.secondary, pressed && styles.pressed]}>
              <Text style={[styles.btnText, btnText]}>The ledger · {meta.victims.length} names</Text>
            </Pressable>
          )}
        </View>
        <Text style={[styles.headphones, { marginTop: 18 * k }]}>Play with headphones, in the dark.</Text>
      </ScrollView>
      {picking && (
        <Pressable style={styles.veil} onPress={() => setPicking(false)} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { padding: 20 * k }]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { fontSize: 30 * k }]}>Where will you wake?</Text>
            <Text style={styles.sheetNote}>You have been this deep before. You start with less air, and only two matches.</Text>
            <View style={{ marginTop: 12 * k, gap: 8 * k }}>
              {descend.map((l) => (
                <Pressable key={l} onPress={() => { setPicking(false); clearRun(); go(`/play?start=${l}`); }}
                  style={({ pressed }) => [styles.layer, { paddingVertical: 10 * k }, pressed && styles.pressed]} accessibilityRole="button">
                  <Text style={[styles.layerName, { fontSize: 22 * k }]}>{LAYERS[l].name}</Text>
                  <Text style={styles.layerLine}>{LAYERS[l].line}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      )}
      <Pressable onPress={() => router.push('/settings')} style={styles.gear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Settings">
        <MaterialCommunityIcons name="cog" size={22} color="rgba(228,216,196,0.8)" />
      </Pressable>
    </View>
  );
}

const LAYERS: Record<number, { name: string; line: string }> = {
  3: { name: 'The catacombs', line: 'Bones line every wall. Something down there is listening.' },
  4: { name: 'The necropolis', line: 'Lanterns move between the tombs. Keep to the dark.' },
  5: { name: 'The graveyard', line: 'Rain, and air at last. The ledger waits in the church porch.' },
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontFamily: fonts.nosifer, color: blood, textShadowColor: '#300', textShadowRadius: 18, maxWidth: '100%' },
  tag: { color: ash, fontStyle: 'italic' },
  menu: { alignItems: 'center' },
  btn: { paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(163,18,14,0.7)', alignItems: 'center' },
  secondary: { borderColor: 'rgba(228,216,196,0.25)' },
  pressed: { backgroundColor: 'rgba(163,18,14,0.25)' },
  btnText: { color: bone, fontFamily: fonts.creepster, letterSpacing: 1 },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(163,18,14,0.55)', backgroundColor: 'rgba(12,6,5,0.97)' },
  sheetTitle: { fontFamily: fonts.creepster, color: blood, textAlign: 'center' },
  sheetNote: { marginTop: 4, color: ash, fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
  layer: { paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(228,216,196,0.18)' },
  layerName: { color: bone, fontFamily: fonts.creepster, letterSpacing: 1 },
  layerLine: { marginTop: 2, color: ash, fontSize: 12 },
  headphones: { color: ash, fontSize: 12, letterSpacing: 1 },
  gear: { position: 'absolute', top: 14, left: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(228,216,196,0.15)' },
});

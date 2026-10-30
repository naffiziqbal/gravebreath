// The story an ending tells: passages fade in one at a time (tap to hurry them), then the end screen.
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { ENDINGS, type Ending } from '../game/sim/endings';
import { ash, blood, bone, fonts } from '../theme';

const HOLD = 5200; // ms each passage stays before the next one comes

export function Epilogue({ ending, onDone }: { ending: Ending; onDone(): void }) {
  const title = ENDINGS[ending].title;
  const story = ENDINGS[ending].story;
  const [shown, setShown] = useState(1);
  const [fades] = useState(() => story.map(() => new Animated.Value(0)));
  const done = shown >= story.length;
  const [canClose, setCanClose] = useState(false); // the last line holds a moment, so a hurried tap can't skip it

  useEffect(() => {
    Animated.timing(fades[shown - 1], { toValue: 1, duration: 1400, useNativeDriver: true }).start();
    if (done) {
      const t = setTimeout(() => setCanClose(true), 2500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((n) => Math.min(story.length, n + 1)), HOLD);
    return () => clearTimeout(t);
  }, [shown, done, fades, story.length]);

  // only the latest few passages stay on screen; older ones scroll away above
  const first = Math.max(0, shown - 4);
  return (
    <Pressable style={styles.root} onPress={() => (done ? canClose && onDone() : setShown((n) => n + 1))}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>
        {story.slice(first, shown).map((p, i) => {
          const k = first + i;
          const last = k === story.length - 1;
          return (
            <Animated.Text key={k} style={[styles.passage, p === p.toUpperCase() && styles.scratch, last && styles.final, { opacity: k === shown - 1 ? fades[k] : 0.55 }]}>{p}</Animated.Text>
          );
        })}
      </View>
      <Text style={styles.hint}>{done ? (canClose ? 'tap to close the ledger' : ' ') : 'tap to continue'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  title: { fontFamily: fonts.creepster, fontSize: 36, color: blood, marginBottom: 18 },
  body: { maxWidth: 640, width: '100%', gap: 14 },
  passage: { color: bone, fontSize: 17, lineHeight: 26, fontStyle: 'italic', textAlign: 'center' },
  scratch: { fontFamily: fonts.nosifer, fontStyle: 'normal', fontSize: 20, color: bone, letterSpacing: 2 }, // words scratched into a lid
  final: { fontFamily: fonts.creepster, fontStyle: 'normal', fontSize: 26, color: blood, marginTop: 6 },
  hint: { position: 'absolute', bottom: 18, color: ash, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
});

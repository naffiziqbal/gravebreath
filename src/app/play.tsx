// A run: the game view, the clue reader (pauses the run), and the screen you see when it ends.
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GameView } from '../components/GameView';
import { useGame } from '../game/store';
import { CLUES } from '../game/data/clues';
import { ash, blood, bone, fonts } from '../theme';

export default function Play() {
  useKeepAwake();
  const clue = useGame((s) => s.clue);
  const end = useGame((s) => s.end);
  const showClue = useGame((s) => s.showClue);
  const reset = useGame((s) => s.reset);
  const [runKey, setRunKey] = useState(0);
  // dev builds only: /play?layer=3&match=1&yaw=1.5 starts a run inside a layer for testing
  const params = useLocalSearchParams<{ layer?: string; match?: string; phone?: string; yaw?: string; listener?: string; seed?: string; autoplay?: string }>();
  const debug = __DEV__ && (params.layer || params.seed || params.autoplay)
    ? {
      layer: params.layer ? Number(params.layer) : undefined, match: params.match === '1', phone: params.phone === '1',
      yaw: params.yaw ? Number(params.yaw) : undefined, listenerNear: params.listener === '1',
      seed: params.seed ? Number(params.seed) : undefined, autoplay: params.autoplay === '1',
    }
    : undefined;

  return (
    <View style={styles.root}>
      <GameView key={runKey} paused={!!clue} debug={debug} />
      {clue && (
        <View style={styles.overlay}>
          <View style={styles.paper}>
            <Text style={styles.clueTitle}>{clue.title}</Text>
            <Text style={styles.clueText}>{clue.text}</Text>
            <Pressable onPress={() => showClue(null)} style={styles.btn}><Text style={styles.btnText}>Keep it</Text></Pressable>
          </View>
        </View>
      )}
      {end && (
        <View style={[styles.overlay, styles.endBg]}>
          <Text style={styles.endTitle}>
            {end.fate === 'escaped' ? (end.layer >= 5 ? 'You climb toward the bells…' : 'You climb toward the cold air…')
              : end.fate === 'taken' ? (end.layer >= 4 ? 'A lantern finds you.' : 'Something found you in the dark.') : 'Your breath runs out.'}
          </Text>
          <Text style={styles.endName}>{end.victim}</Text>
          <Text style={styles.endLine}>
            {end.fate === 'escaped'
              ? (end.layer >= 5 ? 'You climbed out of the flooded chapel. The surface is still being dug.' : 'You climbed the bone stair. The necropolis above is still being dug.')
              : end.fate === 'taken' ? (end.layer >= 4 ? 'The Hushmen carry you back to the ledger.' : 'The Listener drags another body into the bones.') : 'Another name for the ledger.'}
          </Text>
          <Text style={styles.endStats}>
            {end.newClues.length} new clue{end.newClues.length === 1 ? '' : 's'} · {end.saved} saved · {end.abandoned} left behind · {useGame.getState().meta.clues.length}/{CLUES.length} clues in the ledger
          </Text>
          <View style={styles.endButtons}>
            <Pressable onPress={() => { reset(); setRunKey((k) => k + 1); }} style={styles.btn}><Text style={styles.btnText}>Wake again</Text></Pressable>
            <Pressable onPress={() => router.replace('/ledger')} style={[styles.btn, styles.secondary]}><Text style={styles.btnText}>The ledger</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 16 },
  paper: { maxWidth: 520, width: '100%', backgroundColor: '#d9ccb0', padding: 24, borderRadius: 4 },
  clueTitle: { fontFamily: fonts.creepster, fontSize: 26, color: '#3b1e14', marginBottom: 10 },
  clueText: { fontSize: 16, lineHeight: 23, color: '#2a1a12', fontStyle: 'italic', marginBottom: 18 },
  endBg: { backgroundColor: '#000' },
  endTitle: { fontFamily: fonts.creepster, fontSize: 34, color: blood, textAlign: 'center' },
  endName: { marginTop: 14, fontFamily: fonts.nosifer, fontSize: 22, color: bone },
  endLine: { marginTop: 10, color: ash, fontSize: 15, textAlign: 'center' },
  endStats: { marginTop: 8, color: 'rgba(143,133,122,0.8)', fontSize: 12, letterSpacing: 0.5 },
  endButtons: { flexDirection: 'row', gap: 12, marginTop: 26 },
  btn: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(163,18,14,0.75)', alignItems: 'center', backgroundColor: 'rgba(20,4,4,0.6)' },
  secondary: { borderColor: 'rgba(228,216,196,0.25)' },
  btnText: { color: bone, fontFamily: fonts.creepster, fontSize: 22 },
});

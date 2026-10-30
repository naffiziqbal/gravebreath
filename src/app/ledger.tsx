// The ledger: every victim you have played, and every clue found. Doubles as the story codex.
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGame } from '../game/store';
import { CLUES } from '../game/data/clues';
import { ENDINGS } from '../game/sim/endings';
import { ash, blood, bone, fonts } from '../theme';

export default function Ledger() {
  const meta = useGame((s) => s.meta);
  const found = CLUES.filter((c) => meta.clues.includes(c.id));
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Ledger of the Hushmen</Text>
      <View style={styles.cols}>
        <ScrollView style={styles.col} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={styles.head}>Fed to the deep</Text>
          {meta.victims.length === 0 && <Text style={styles.dim}>No names yet.</Text>}
          {meta.victims.map((v, i) => (
            <Text key={i} style={styles.name}>
              {v.name} — {v.year}
              <Text style={v.fate === 'escaped' ? styles.escaped : styles.dim}>   {v.ending ? ENDINGS[v.ending].title.toLowerCase() : v.fate === 'escaped' ? (v.layer >= 5 ? 'climbed out of the chapel' : v.layer >= 4 ? 'climbed the bone stair' : 'reached the catacombs') : v.fate === 'taken' ? (v.layer >= 5 ? 'taken in the graveyard' : v.layer >= 4 ? 'taken by the Hushmen' : 'taken in the catacombs') : v.layer >= 4 ? 'suffocated among the tombs' : v.layer >= 3 ? 'suffocated in the catacombs' : 'suffocated'}</Text>
            </Text>
          ))}
          <Text style={[styles.name, styles.you]}>You — tonight</Text>
          <Text style={[styles.head, { marginTop: 18 }]}>Endings · {meta.endings.length}/3</Text>
          {(['rain', 'bells', 'undertaker'] as const).map((e) => (
            <Text key={e} style={meta.endings.includes(e) ? styles.name : styles.dim}>{meta.endings.includes(e) ? ENDINGS[e].title : '? ? ?'}</Text>
          ))}
        </ScrollView>
        <ScrollView style={styles.col} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={styles.head}>What you have learned · {found.length}/{CLUES.length}</Text>
          {found.length === 0 && <Text style={styles.dim}>Find clues in the crypt. They stay with you after you die.</Text>}
          {found.map((c) => (
            <View key={c.id} style={styles.clue}>
              <Text style={styles.clueTitle}>{c.title}</Text>
              <Text style={styles.clueText}>{c.text}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back}><Text style={styles.backText}>Back</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0806', paddingHorizontal: 28, paddingTop: 18 },
  title: { fontFamily: fonts.creepster, fontSize: 32, color: blood, textAlign: 'center' },
  cols: { flex: 1, flexDirection: 'row', gap: 24, marginTop: 12 },
  col: { flex: 1 },
  head: { color: ash, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  name: { color: bone, fontSize: 16, marginBottom: 8, fontStyle: 'italic' },
  you: { color: blood, fontFamily: fonts.creepster, fontSize: 20, fontStyle: 'normal' },
  dim: { color: ash, fontSize: 13 },
  escaped: { color: '#8fa9d8', fontSize: 13 },
  clue: { marginBottom: 14, borderLeftWidth: 2, borderLeftColor: 'rgba(163,18,14,0.6)', paddingLeft: 10 },
  clueTitle: { color: bone, fontSize: 15, fontWeight: '600' },
  clueText: { color: ash, fontSize: 13, lineHeight: 19, marginTop: 3 },
  back: { position: 'absolute', top: 18, left: 20, padding: 8 },
  backText: { color: ash, fontSize: 14 },
});

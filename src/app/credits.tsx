// Credits: the studio, and the free assets the game is built from (see CREDITS.md for the full list).
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ash, blood, bone, fonts } from '../theme';

const SECTIONS: { head: string; lines: string[] }[] = [
  { head: 'A game by', lines: ['Nexus Benders', 'Dhaka, Bangladesh', 'nexusbenders.bd'] },
  { head: 'Textures, models and the night sky', lines: ['Poly Haven (polyhaven.com), CC0. Thank you to everyone who shares their work there.'] },
  { head: 'Recorded foley', lines: ['Kenney: 50 RPG sound effects (CC0)', 'Fantozzi: Footsteps, grass, sand and stone (CC0)', 'Corsica_S: 42 snow and gravel footsteps (CC0)'] },
  { head: 'Fonts', lines: ['Nosifer and Creepster, by Typomondo and Sideshow (SIL Open Font License)'] },
  { head: 'The voice of Cole', lines: ['Kokoro-82M, by hexgrad (Apache 2.0)'] },
  { head: 'Everything else', lines: ['Ambience, the creatures and their sounds, and the town of Vael were made in-house.'] },
  { head: 'Built with', lines: ['Expo and React Native, three.js'] },
];

export default function Credits() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Credits</Text>
      <ScrollView style={{ alignSelf: 'stretch' }} contentContainerStyle={styles.body}>
        {SECTIONS.map((s) => (
          <View key={s.head} style={styles.section}>
            <Text style={styles.head}>{s.head}</Text>
            {s.lines.map((l) => <Text key={l} style={styles.line}>{l}</Text>)}
          </View>
        ))}
        <Text style={styles.thanks}>Thank you for playing in the dark.</Text>
      </ScrollView>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 18, paddingHorizontal: 16 },
  title: { fontFamily: fonts.creepster, fontSize: 34, color: blood },
  body: { alignItems: 'center', paddingVertical: 12, paddingBottom: 30 },
  section: { alignItems: 'center', marginBottom: 16, maxWidth: 560 },
  head: { color: ash, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  line: { color: bone, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  thanks: { marginTop: 8, color: ash, fontStyle: 'italic', fontSize: 14 },
  back: { position: 'absolute', top: 18, left: 20, padding: 8 },
  backText: { color: ash, fontSize: 14 },
});

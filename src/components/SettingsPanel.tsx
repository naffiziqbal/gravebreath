// The settings list, shared by the pause menu and the title screen. Changes apply at once and are saved.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useGame } from '../game/store';
import type { ButtonSize, Quality } from '../game/settings';
import { ash, blood, bone, fonts } from '../theme';

export function SettingsPanel({ onClose }: { onClose(): void }) {
  const s = useGame((st) => st.settings);
  const update = useGame((st) => st.updateSettings);
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Settings</Text>
      <ScrollView style={styles.list} contentContainerStyle={{ gap: 4 }}>
        <Stepper label="Volume" value={`${Math.round(s.volume * 100)}%`}
          onDown={() => update({ volume: Math.max(0, round(s.volume - 0.1)) })} onUp={() => update({ volume: Math.min(1, round(s.volume + 0.1)) })} />
        <Stepper label="Look sensitivity" value={`${s.sensitivity.toFixed(1)}×`}
          onDown={() => update({ sensitivity: Math.max(0.5, round(s.sensitivity - 0.1)) })} onUp={() => update({ sensitivity: Math.min(2, round(s.sensitivity + 0.1)) })} />
        <Stepper label="Brightness" value={s.brightness > 0 ? `+${s.brightness}` : String(s.brightness)}
          onDown={() => update({ brightness: Math.max(-5, s.brightness - 1) })} onUp={() => update({ brightness: Math.min(5, s.brightness + 1) })} />
        <Pressable onPress={() => router.push('/calibrate')} style={styles.link} hitSlop={6}><Text style={styles.linkText}>Calibrate brightness…</Text></Pressable>
        <Toggle label="Invert look up/down" on={s.invertY} onPress={() => update({ invertY: !s.invertY })} />
        <Toggle label="Vibration" on={s.vibration} onPress={() => update({ vibration: !s.vibration })} />
        <Toggle label="Subtitles" on={s.subtitles} onPress={() => update({ subtitles: !s.subtitles })} />
        <Toggle label="Tips" on={s.hints} onPress={() => update({ hints: !s.hints })} />
        <Row label="Graphics">
          <Segment value={s.quality} options={([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as [Quality, string][]).map(([v, l]) => [v, l])} onPick={(quality) => update({ quality })} />
        </Row>
        <Text style={styles.hint}>Low runs smoothest on older phones. High renders at full resolution.</Text>
        <Row label="Button size">
          <Segment value={s.buttonSize} options={([['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']] as [ButtonSize, string][]).map(([v, l]) => [v, l])} onPick={(buttonSize) => update({ buttonSize })} />
        </Row>
        <Stepper label="Button opacity" value={`${Math.round(s.buttonOpacity * 100)}%`}
          onDown={() => update({ buttonOpacity: Math.max(0.4, round(s.buttonOpacity - 0.1)) })} onUp={() => update({ buttonOpacity: Math.min(1, round(s.buttonOpacity + 0.1)) })} />
        <Toggle label="Left-handed (move on the right)" on={s.leftHanded} onPress={() => update({ leftHanded: !s.leftHanded })} />
        <Pressable onPress={() => router.push('/credits')} style={styles.link} hitSlop={6}><Text style={styles.linkText}>Credits</Text></Pressable>
      </ScrollView>
      <Pressable onPress={onClose} style={styles.done} accessibilityRole="button"><Text style={styles.doneText}>Done</Text></Pressable>
    </View>
  );
}

function Segment<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick(v: T): void }) {
  return (
    <View style={styles.segment}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onPick(v)} style={[styles.segBtn, value === v && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: value === v }}>
          <Text style={[styles.segText, value === v && styles.segTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const round = (v: number) => Math.round(v * 10) / 10;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Stepper({ label, value, onDown, onUp }: { label: string; value: string; onDown(): void; onUp(): void }) {
  return (
    <Row label={label}>
      <View style={styles.stepper}>
        <Pressable onPress={onDown} style={styles.stepBtn} hitSlop={6} accessibilityLabel={`− ${label}`}><Text style={styles.stepText}>−</Text></Pressable>
        <Text style={styles.value}>{value}</Text>
        <Pressable onPress={onUp} style={styles.stepBtn} hitSlop={6} accessibilityLabel={`+ ${label}`}><Text style={styles.stepText}>+</Text></Pressable>
      </View>
    </Row>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress(): void }) {
  return (
    <Row label={label}>
      <Pressable onPress={onPress} style={[styles.toggle, on && styles.toggleOn]} hitSlop={6} accessibilityRole="switch" accessibilityState={{ checked: on }}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </Pressable>
    </Row>
  );
}

const styles = StyleSheet.create({
  panel: { width: '100%', maxWidth: 520, maxHeight: '100%', backgroundColor: 'rgba(10,6,5,0.96)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(163,18,14,0.5)', paddingVertical: 14, paddingHorizontal: 18 },
  title: { fontFamily: fonts.creepster, fontSize: 30, color: blood, textAlign: 'center', marginBottom: 6 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(228,216,196,0.08)' },
  label: { color: bone, fontSize: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(228,216,196,0.3)', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: bone, fontSize: 20, lineHeight: 22 },
  value: { color: bone, fontSize: 15, minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
  toggle: { width: 50, height: 28, borderRadius: 14, backgroundColor: 'rgba(228,216,196,0.15)', padding: 3 },
  toggleOn: { backgroundColor: 'rgba(163,18,14,0.85)' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: ash },
  knobOn: { backgroundColor: bone, transform: [{ translateX: 22 }] },
  segment: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(228,216,196,0.25)', overflow: 'hidden' },
  segBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  segOn: { backgroundColor: 'rgba(163,18,14,0.85)' },
  segText: { color: ash, fontSize: 14 },
  segTextOn: { color: bone, fontWeight: '600' },
  hint: { color: ash, fontSize: 12, marginTop: 6 },
  link: { alignSelf: 'flex-end', paddingVertical: 4 },
  linkText: { color: '#e0a050', fontSize: 13 },
  done: { marginTop: 12, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 36, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(163,18,14,0.75)', backgroundColor: 'rgba(20,4,4,0.6)' },
  doneText: { color: bone, fontFamily: fonts.creepster, fontSize: 22 },
});

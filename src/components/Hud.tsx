// On-screen controls and readouts. Kept sparse: the darkness and the breathing are the real HUD.
import { useEffect, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Game } from '../game/Game';
import { useGame } from '../game/store';
import { blood, bone, fonts } from '../theme';
import { ActionPad } from './ActionPad';
import type { KEYS } from './useDesktopControls';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function Hud({ game, keys }: { game: RefObject<Game | null>; keys?: typeof KEYS }) {
  const hud = useGame((s) => s.hud);
  const subtitle = useGame((s) => (s.settings.subtitles ? s.subtitle : null));
  const g = () => game.current;
  // if the button disappears mid-hold, its release never fires; let go for the player
  useEffect(() => {
    if (!hud.action) game.current?.setInput({ interact: false });
  }, [hud.action, game]);
  if (hud.phase === 'loading') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={styles.loading}>Your eyes adjust to the dark…</Text>
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* air: a thin bar, because breathing alone is hard to read on a phone speaker */}
      <View style={styles.airWrap} pointerEvents="none">
        <View style={[styles.air, { width: `${Math.round(hud.air * 100)}%`, backgroundColor: hud.air < 0.3 ? blood : 'rgba(220,214,204,0.55)' }]} />
      </View>
      {hud.room && <Text style={styles.room} pointerEvents="none">{hud.room}</Text>}
      {hud.noise !== null && <NoiseMeter level={hud.noise} hunted={hud.hunted} huntedLabel={hud.phase === 'necropolis' || hud.phase === 'surface' ? 'THEY SEE YOU' : 'IT HEARS YOU'} />}
      {hud.seen !== null && <SeenMeter level={hud.seen} hunted={hud.hunted} />}
      {hud.debug && <Text style={styles.debug} pointerEvents="none">{hud.debug}</Text>}
      <Pressable onPress={() => useGame.getState().setPaused(true)} style={styles.pause} hitSlop={10} accessibilityRole="button" accessibilityLabel="Pause">
        <MaterialCommunityIcons name="pause" size={20} color="rgba(228,216,196,0.75)" />
      </Pressable>
      {subtitle && <Text style={styles.subtitle} pointerEvents="none">{subtitle}</Text>}

      {hud.prompt && (
        <View style={styles.promptWrap} pointerEvents="none">
          <Text style={styles.prompt}>{hud.prompt}</Text>
          {hud.progress !== null && (
            <View style={styles.progressWrap}><View style={[styles.progress, { width: `${Math.round(hud.progress * 100)}%` }]} /></View>
          )}
        </View>
      )}

      <ActionPad
        action={hud.action} holdAction={hud.holdAction} progress={hud.progress} keys={keys}
        matches={hud.matches} matchLit={hud.matchLit} battery={hud.battery} phoneOn={hud.phoneOn}
        onAction={(down) => g()?.setInput({ interact: down })}
        onMatch={() => g()?.lightMatch()}
        onPhone={() => g()?.usePhone()}
        onCalm={(down) => g()?.setInput({ calming: down })}
        onHoldBreath={(down) => g()?.setInput({ holdingBreath: down })}
      />
    </View>
  );
}

/** How close a Hushman is to spotting you: an eye that opens as the bar fills; red during a chase. */
function SeenMeter({ level, hunted }: { level: number; hunted: boolean }) {
  const color = hunted ? blood : level > 0.5 ? '#e0a050' : 'rgba(228,216,196,0.7)';
  return (
    <View style={styles.seen} pointerEvents="none">
      <MaterialCommunityIcons name={hunted || level > 0.05 ? 'eye' : 'eye-off-outline'} size={16} color={color} />
      <View style={styles.seenBar}><View style={[styles.seenFill, { width: `${Math.round(level * 100)}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

/** How far away you can be heard. Five bars; red when the Listener is coming. */
function NoiseMeter({ level, hunted, huntedLabel }: { level: number; hunted: boolean; huntedLabel: string }) {
  const bars = [0.1, 0.25, 0.45, 0.7, 0.95];
  return (
    <View style={styles.noise} pointerEvents="none">
      <Text style={[styles.noiseLabel, hunted && { color: blood }]}>{hunted ? huntedLabel : level === 0 ? 'SILENT' : 'NOISE'}</Text>
      <View style={styles.noiseBars}>
        {bars.map((t, i) => (
          <View key={i} style={[styles.noiseBar, { height: 5 + i * 3 }, level >= t && { backgroundColor: hunted ? blood : 'rgba(228,216,196,0.7)' }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  loading: { color: bone, fontFamily: fonts.creepster, fontSize: 26, opacity: 0.7 },
  airWrap: { position: 'absolute', top: 14, alignSelf: 'center', width: 220, height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  air: { height: 3 },
  room: { position: 'absolute', top: 24, alignSelf: 'center', color: 'rgba(220,210,200,0.45)', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  noise: { position: 'absolute', top: 44, alignSelf: 'center', alignItems: 'center' },
  noiseLabel: { color: 'rgba(228,216,196,0.5)', fontSize: 9, letterSpacing: 2, marginBottom: 3 },
  noiseBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  noiseBar: { width: 5, borderRadius: 1, backgroundColor: 'rgba(228,216,196,0.15)' },
  seen: { position: 'absolute', top: 44, left: '50%', marginLeft: 46, flexDirection: 'row', alignItems: 'center', gap: 5 },
  seenBar: { width: 46, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  seenFill: { height: 3 },
  pause: { position: 'absolute', top: 12, left: 14, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,8,7,0.45)', borderWidth: 1, borderColor: 'rgba(228,216,196,0.18)' },
  debug: { position: 'absolute', top: 8, left: 62, color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  subtitle: { position: 'absolute', bottom: 34, left: 80, right: 290, textAlign: 'center', color: blood, fontFamily: fonts.creepster, fontSize: 24, textShadowColor: '#000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  promptWrap: { position: 'absolute', top: '58%', alignSelf: 'center', alignItems: 'center' },
  prompt: { color: bone, fontSize: 15, letterSpacing: 1, textShadowColor: '#000', textShadowRadius: 4 },
  progressWrap: { marginTop: 6, width: 140, height: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  progress: { height: 3, backgroundColor: blood },
});

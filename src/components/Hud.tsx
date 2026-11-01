// On-screen controls and readouts. Kept sparse: the darkness and the breathing are the real HUD.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Game } from '../game/Game';
import { useGame, type Hud as HudState } from '../game/store';
import { ash, blood, bone, fonts } from '../theme';
import { LOADING_LINES } from '../game/data/hints';
import { BUTTON_SCALE } from '../game/settings';
import { ActionPad } from './ActionPad';
import { SOUNDS } from '../game/engine/media';
import type { KEYS } from './useDesktopControls';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { G, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import type { ScrapMap } from '../game/sim/catacombs';

export function Hud({ game, keys }: { game: RefObject<Game | null>; keys?: typeof KEYS }) {
  const hud = useGame((s) => s.hud);
  const subtitle = useGame((s) => (s.settings.subtitles ? s.subtitle : null));
  const hint = useGame((s) => s.hint);
  const settings = useGame((s) => s.settings);
  const [loadingLine] = useState(() => LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
  const g = () => game.current;
  // if the button disappears mid-hold, its release never fires; let go for the player
  useEffect(() => {
    if (!hud.action) game.current?.setInput({ interact: false });
  }, [hud.action, game]);
  // a tip stays long enough to read, then fades away on its own
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => useGame.getState().hideHint(), 4000 + hint.length * 45);
    return () => clearTimeout(t);
  }, [hint]);
  if (hud.phase === 'loading') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <LoadingLine />
        <Text style={styles.lore}>{loadingLine}</Text>
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* air: a thin bar, because breathing alone is hard to read on a phone speaker */}
      {hud.objective && <Text style={styles.objective} pointerEvents="none" numberOfLines={2}>{hud.objective}</Text>}
      {!hud.job && <View style={styles.airWrap} pointerEvents="none">
        <View style={[styles.air, { width: `${Math.round(hud.air * 100)}%`, backgroundColor: hud.air < 0.3 ? blood : 'rgba(220,214,204,0.55)' }]} />
      </View>}
      {hud.room && <Text style={styles.room} pointerEvents="none">{hud.room}</Text>}
      {hud.noise !== null && <NoiseMeter level={hud.noise} hunted={hud.hunted} huntedLabel={hud.phase === 'necropolis' || hud.phase === 'surface' ? 'THEY SEE YOU' : 'IT HEARS YOU'} />}
      {hud.seen !== null && <SeenMeter level={hud.seen} hunted={hud.hunted} />}
      {hud.debug && <Text style={styles.debug} pointerEvents="none">{hud.debug}</Text>}
      <Pressable onPress={() => useGame.getState().setPaused(true)} style={styles.pause} hitSlop={10} accessibilityRole="button" accessibilityLabel="Pause">
        <MaterialCommunityIcons name="pause" size={20} color="rgba(228,216,196,0.75)" />
      </Pressable>
      {subtitle && <Text style={styles.subtitle} pointerEvents="none">{subtitle}</Text>}
      {hint && (
        <Pressable style={styles.hint} onPress={() => useGame.getState().hideHint()} accessibilityRole="button" accessibilityLabel={hint}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color="#e0a050" />
          <Text style={styles.hintText}>{hint}</Text>
        </Pressable>
      )}

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
        scale={BUTTON_SCALE[settings.buttonSize]} opacity={settings.buttonOpacity} mirrored={settings.leftHanded}
        matches={hud.matches} matchLit={hud.matchLit} battery={hud.battery} phoneOn={hud.phoneOn}
        onAction={(down) => g()?.setInput({ interact: down })}
        onMatch={() => g()?.lightMatch()}
        onPhone={() => g()?.usePhone()}
        onCalm={(down) => g()?.setInput({ calming: down })}
        onHoldBreath={(down) => g()?.setInput({ holdingBreath: down })}
        hasMap={hud.hasMap}
        onMap={(down) => g()?.setInput({ reading: down })}
      />
      {hud.reading === 'lit' && <MapPage game={game} you={hud.mapYou} />}
      {hud.reading === 'dark' && <Text style={styles.mapDark} pointerEvents="none">Too dark to read. Strike a light.</Text>}
    </View>
  );
}

/** The loop, how loud it starts, and how much louder it gets by the time the line is full. */
const SCORE = [
  { name: 'loading_bed_loop', from: 0.5, by: 0.35, curve: 1 }, // war drums over a low grind
  { name: 'loading_rise_loop', from: 0.08, by: 0.72, curve: 1.6 }, // stabs, shrieks and struck metal
] as const;

/** Music that climbs with the loading line, then stops dead when it unmounts: the world starts in sudden quiet. */
function useLoadingScore(progress: number) {
  const players = useRef<AudioPlayer[]>([]);
  const master = useGame((s) => s.settings.volume);
  const volume = master;
  useEffect(() => {
    try {
      players.current = SCORE.map((t) => {
        const p = createAudioPlayer(SOUNDS[t.name]);
        p.loop = true;
        p.volume = 0;
        p.play();
        return p;
      });
    } catch (e) {
      console.warn('loading score could not start', e); // silence must never stop the game
    }
    return () => {
      for (const p of players.current) p.remove();
      players.current = [];
    };
  }, []);
  useEffect(() => {
    players.current.forEach((p, i) => {
      const t = SCORE[i];
      p.volume = volume * (t.from + t.by * Math.pow(progress, t.curve));
    });
  }, [progress, volume]);
}

/** The loading line fills with blood from the left as the files really arrive, over a faint line that shows the same. */
function LoadingLine() {
  const progress = useGame((s) => s.loadProgress);
  useLoadingScore(progress);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fill, { toValue: progress, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [progress, fill]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: [0, size.width] });
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      <Text style={styles.loading} numberOfLines={1} onLayout={(e) => setSize(e.nativeEvent.layout)}>{LOADING_TEXT}</Text>
      {size.width > 0 && (
        <Animated.View style={[styles.loadingFill, { width, height: size.height }]}>
          <Text style={[styles.loading, styles.loadingRed, { width: size.width }]} numberOfLines={1}>{LOADING_TEXT}</Text>
        </Animated.View>
      )}
      <View style={styles.loadingTrack}><Animated.View style={[styles.loadingBar, { width }]} /></View>
    </View>
  );
}

const LOADING_TEXT = 'Your eyes adjust to the dark…';

/** The scrap of shroud held up to the light: uneven charcoal on torn cloth, with the stair marked. */
function MapPage({ game, you }: { game: RefObject<Game | null>; you: HudState['mapYou'] }) {
  const [map] = useState<ScrapMap | null>(() => game.current?.scrapMap() ?? null);
  if (!map) return null;
  const u = 60, pad = 40;
  const w = (map.cols - 1) * u + pad * 2, h = (map.rows - 1) * u + pad * 2;
  const px = (v: number) => pad + v * u;
  const ex = px(map.exit.x), ey = px(map.exit.y);
  return (
    <View style={styles.mapWrap} pointerEvents="none">
      <Svg width={w * 1.15} height={h * 1.15} viewBox={`0 0 ${w} ${h}`}>
        <Polygon points={`6,14 ${w * 0.3},4 ${w * 0.62},12 ${w - 4},6 ${w - 12},${h * 0.4} ${w - 3},${h * 0.72} ${w - 18},${h - 6} ${w * 0.55},${h - 14} ${w * 0.2},${h - 4} 12,${h - 16} 3,${h * 0.5}`} fill="#b9a988" stroke="#6e5f47" strokeWidth={2} />
        <G stroke="#1d1712" strokeWidth={5} strokeLinecap="round">
          {map.lines.map(([x1, y1, x2, y2]) => <Line key={`${x1},${y1},${x2},${y2}`} x1={px(x1)} y1={px(y1)} x2={px(x2)} y2={px(y2)} />)}
        </G>
        <Path d={`M${ex - 11} ${ey - 11} L${ex + 11} ${ey + 11} M${ex + 11} ${ey - 11} L${ex - 11} ${ey + 11}`} stroke={blood} strokeWidth={5} strokeLinecap="round" />
        <SvgText x={ex} y={ey + (map.exit.y === 0 ? 30 : -18)} fill={blood} fontSize={17} fontWeight="bold" textAnchor="middle">EXIT</SvgText>
        {you && (
          // you: an arrow pointing the way you face (yaw 0 is up the page, and turns left as it grows)
          <Polygon points="0,-13 9,10 0,5 -9,10" fill="#1f5fd0" stroke="#f2ead8" strokeWidth={2}
            transform={`translate(${px(you.x)} ${px(you.y)}) rotate(${(-you.yaw * 180) / Math.PI})`} />
        )}
      </Svg>
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
  loadingFill: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  loadingRed: { color: blood, opacity: 1 },
  loadingTrack: { marginTop: 8, height: 1, backgroundColor: 'rgba(228,216,196,0.08)' },
  loadingBar: { height: 1, backgroundColor: blood },
  mapWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  mapDark: { position: 'absolute', top: '46%', alignSelf: 'center', color: bone, fontSize: 15, fontStyle: 'italic', textShadowColor: '#000', textShadowRadius: 4 },
  lore: { marginTop: 14, color: ash, fontSize: 14, fontStyle: 'italic', textAlign: 'center', maxWidth: 520, paddingHorizontal: 16 },
  hint: { position: 'absolute', top: 44, alignSelf: 'center', maxWidth: 460, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(10,6,5,0.78)', borderWidth: 1, borderColor: 'rgba(224,160,80,0.35)' },
  hintText: { flexShrink: 1, color: bone, fontSize: 13, lineHeight: 18 },
  airWrap: { position: 'absolute', top: 14, alignSelf: 'center', width: 220, height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  air: { height: 3 },
  objective: { position: 'absolute', top: 12, left: 62, maxWidth: 200, color: 'rgba(228,216,196,0.7)', fontSize: 11, lineHeight: 15 },
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

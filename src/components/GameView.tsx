// The 3D view plus the touch layer: left thumb moves, right thumb looks, buttons on the right edge.
import { useEffect, useRef, useState } from 'react';
import { GLView } from 'expo-gl';
import * as Haptics from 'expo-haptics';
import { AppState, Platform, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Game, type DebugStart, type StartOptions } from '../game/Game';
import { saveRun } from '../game/save';
import { trace } from '../game/trace';
import type { GL } from '../game/engine/assets';
import { useGame } from '../game/store';
import type { Settings } from '../game/settings';
import { Hud } from './Hud';
import { AUTOPILOT, runAutopilot } from '../game/dev/autopilot';
import { runDirector } from '../game/dev/director';
import { runBench } from '../game/dev/bench';
import { KEYS, useDesktopControls } from './useDesktopControls';
import { ash, bone, fonts } from '../theme';

type Stick = { id: string; ox: number; oy: number; x: number; y: number };
const STICK_RADIUS = 60;

/** Where a touch is in the view. On native that's locationX/Y; browser touches only have page coordinates. */
const touchAt = (t: { locationX?: number; locationY?: number; pageX: number; pageY: number }) => ({ x: t.locationX ?? t.pageX, y: t.locationY ?? t.pageY });

export function GameView({ paused, debug, opening }: { paused: boolean; debug?: DebugStart; opening?: StartOptions }) {
  const game = useRef<Game | null>(null);
  const width = useRef(1);
  const stick = useRef<Stick | null>(null);
  const looks = useRef(new Map<string, { x: number; y: number }>());
  const [stickView, setStickView] = useState<Stick | null>(null);

  useEffect(() => () => { game.current?.dispose(); game.current = null; }, []);
  useEffect(() => { game.current?.setPaused(paused); }, [paused]);
  // leaving the app mid-run: save it, so a phone call or the system closing the app doesn't lose it
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') return;
      const snap = game.current?.snapshot();
      if (snap) saveRun(snap);
    });
    return () => sub.remove();
  }, []);
  const { desktop, locked } = useDesktopControls(game, paused);
  const loading = useGame((s) => s.hud.phase === 'loading');
  const ended = useGame((s) => !!s.end);
  const settings = useGame((s) => s.settings);
  useEffect(() => { game.current?.applySettings(withDebug(settings, debug)); }, [settings, debug]);
  const chosen = useGame((s) => s.chosen);
  useEffect(() => { if (chosen) game.current?.chooseEnding(chosen); }, [chosen]);

  const onContextCreate = async (gl: GL) => {
    trace('gl context created');
    const store = useGame.getState();
    const g = new Game(gl, store.meta, {
      hud: (h) => useGame.getState().setHud(h),
      say: (t) => useGame.getState().say(t),
      clue: (c) => useGame.getState().showClue(c),
      haptic: (k) => {
        if (Platform.OS === 'web' || !useGame.getState().settings.vibration) return;
        if (k === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        else if (k === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      },
      end: (e, meta) => useGame.getState().finish(e, meta),
      choose: (c) => useGame.getState().choose(c),
      hint: (id, text) => useGame.getState().showHint(id, text),
      loading: (p) => useGame.getState().setLoadProgress(p),
      cards: (kind) => new Promise((done) => useGame.getState().showCards({ kind, done })),
    }, debug, opening);
    game.current = g;
    trace('game constructed');
    g.applySettings(withDebug(useGame.getState().settings, debug));
    try {
      await g.init();
      trace('init done');
      g.start();
      if (AUTOPILOT) runAutopilot(g);
      if (__DEV__ && debug?.autoplay) runDirector(g);
      if (__DEV__ && debug?.bench) runBench(g);
    } catch (e) {
      console.error('game failed to start', e);
    }
  };

  const touches = (e: GestureResponderEvent) => e.nativeEvent.changedTouches ?? [e.nativeEvent];

  const onStart = (e: GestureResponderEvent) => {
    for (const t of touches(e)) {
      const id = String(t.identifier);
      const left = useGame.getState().settings.leftHanded; // left-handed: move with the right thumb
      const at = touchAt(t);
      const inStickZone = left ? at.x > width.current * 0.58 : at.x < width.current * 0.42;
      if (inStickZone && !stick.current) {
        stick.current = { id, ox: at.x, oy: at.y, x: at.x, y: at.y };
        setStickView(stick.current);
      } else {
        looks.current.set(id, { x: t.pageX, y: t.pageY });
      }
    }
  };
  const onMove = (e: GestureResponderEvent) => {
    for (const t of touches(e)) {
      const id = String(t.identifier);
      const s = stick.current;
      if (s && s.id === id) {
        const at = touchAt(t);
        s.x = at.x; s.y = at.y;
        const dx = (s.x - s.ox) / STICK_RADIUS, dy = (s.y - s.oy) / STICK_RADIUS;
        const m = Math.hypot(dx, dy);
        const k = m > 1 ? 1 / m : 1;
        game.current?.setInput({ moveX: dx * k, moveY: -dy * k });
        setStickView({ ...s });
        continue;
      }
      const l = looks.current.get(id);
      if (l) {
        game.current?.look(t.pageX - l.x, t.pageY - l.y);
        l.x = t.pageX; l.y = t.pageY;
      }
    }
  };
  const onEnd = (e: GestureResponderEvent) => {
    for (const t of touches(e)) {
      const id = String(t.identifier);
      if (stick.current?.id === id) {
        stick.current = null;
        setStickView(null);
        game.current?.setInput({ moveX: 0, moveY: 0 });
      }
      looks.current.delete(id);
    }
  };

  return (
    <View style={styles.root} onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width; }}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={0} />
      <View style={[StyleSheet.absoluteFill, Platform.OS === 'web' && ({ touchAction: 'none' } as object)]} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
        {/* in a browser nobody knows the left thumb moves until they see it */}
        {Platform.OS === 'web' && !desktop && !stickView && !loading && !ended && (
          <View style={[styles.stickBase, styles.stickRest, settings.leftHanded ? { right: 40 } : { left: 40 }]} pointerEvents="none">
            <Text style={styles.stickLabel}>MOVE</Text>
          </View>
        )}
        {stickView && (
          <>
            <View style={[styles.stickBase, { left: stickView.ox - STICK_RADIUS, top: stickView.oy - STICK_RADIUS }]} />
            <View style={[styles.stickKnob, {
              left: stickView.ox + clampLen(stickView.x - stickView.ox, stickView.y - stickView.oy)[0] - 22,
              top: stickView.oy + clampLen(stickView.x - stickView.ox, stickView.y - stickView.oy)[1] - 22,
            }]} />
          </>
        )}
      </View>
      <Hud game={game} keys={desktop ? KEYS : undefined} />
      {desktop && !locked && !paused && !loading && !ended && (
        <View style={styles.clickToLook} pointerEvents="none">
          <Text style={styles.clickTitle}>Click to look around</Text>
          <Text style={styles.clickKeys}>
            W A S D  move  ·  Shift  run  ·  Mouse  look{'\n'}E / Space / Left click  push, dig, take, read  ·  F  match  ·  R  phone light{'\n'}Q / Right click  hold breath  ·  C  calm down  ·  Esc / P  pause
          </Text>
        </View>
      )}
    </View>
  );
}

/** Dev: /play?quality=low|medium|high forces a graphics preset over the saved one (the benchmark uses it). */
function withDebug(s: Settings, debug?: DebugStart): Settings {
  return __DEV__ && debug?.quality ? { ...s, quality: debug.quality } : s;
}

function clampLen(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y);
  return m > STICK_RADIUS ? [(x / m) * STICK_RADIUS, (y / m) * STICK_RADIUS] : [x, y];
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  stickBase: { position: 'absolute', width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, borderRadius: STICK_RADIUS, borderWidth: 1.5, borderColor: 'rgba(220,210,200,0.18)' },
  clickToLook: { position: 'absolute', left: 0, right: 0, top: '20%', alignItems: 'center' }, // above the action prompt
  clickTitle: { fontFamily: fonts.creepster, fontSize: 30, color: bone, textShadowColor: '#000', textShadowRadius: 8 },
  clickKeys: { marginTop: 10, color: ash, fontSize: 13, lineHeight: 22, textAlign: 'center', letterSpacing: 0.5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  stickRest: { bottom: 30, alignItems: 'center', justifyContent: 'center' },
  stickLabel: { color: 'rgba(220,210,200,0.4)', fontSize: 11, letterSpacing: 2 },
  stickKnob: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(220,210,200,0.16)' },
});

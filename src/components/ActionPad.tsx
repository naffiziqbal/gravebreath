// Round icon buttons in an arc around the right thumb: the action, the match, the phone, calm and hold breath.
import { useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { blood, bone } from '../theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ACTION_ICON: Record<string, IconName> = {
  PUSH: 'hand-back-right',
  DIG: 'shovel',
  TAKE: 'hand-extended',
  'PICK UP': 'hand-extended',
  READ: 'book-open-page-variant',
  CLIMB: 'stairs-up',
};

const MATCH = '#ffad5c';
const PHONE = '#9fc2ff';

export type ActionPadProps = {
  action: string | null;
  holdAction: boolean;
  progress: number | null;
  matches: number;
  matchLit: boolean;
  battery: number;
  phoneOn: boolean;
  onAction(down: boolean): void;
  onMatch(): void;
  onPhone(): void;
  onCalm(down: boolean): void;
  onHoldBreath(down: boolean): void;
  hasMap: boolean;
  onMap(down: boolean): void;
  /** on a computer: the key for each button, shown as a small keycap */
  keys?: { action: string; match: string; phone: string; breath: string; calm: string; map: string };
  /** player settings: button size, opacity, and the left-handed layout (buttons on the left) */
  scale?: number;
  opacity?: number;
  mirrored?: boolean;
};

export function ActionPad(p: ActionPadProps) {
  const [calm, setCalm] = useState(false);
  const [breath, setBreath] = useState(false);
  // left-handed: the arc of buttons flips to the left edge
  const m = (st: { right: number; bottom: number }) => (p.mirrored ? { left: st.right, bottom: st.bottom } : st);
  const padStyle = [
    p.mirrored ? styles.padLeft : styles.pad,
    { opacity: p.opacity ?? 1, transform: [{ scale: p.scale ?? 1 }], transformOrigin: p.mirrored ? 'bottom left' : 'bottom right' } as const,
  ];
  return (
    <View style={padStyle} pointerEvents="box-none">
      {/* the action: only there when there is something to do */}
      {p.action && (
        <RoundButton size={92} style={[styles.actionBorder, m(styles.action)]} label={p.action} hold={p.holdAction} accent={blood} progress={p.progress} keycap={p.keys?.action}
          icon={ACTION_ICON[p.action] ?? 'gesture-tap'} onDown={() => p.onAction(true)} onUp={() => p.onAction(false)} />
      )}
      <RoundButton size={62} style={m(styles.match)} icon="fire" active={p.matchLit} accent={MATCH} disabled={p.matches === 0 && !p.matchLit}
        badge={String(p.matches)} keycap={p.keys?.match} onPress={p.onMatch} a11y={`Light a match, ${p.matches} left`} />
      <RoundButton size={62} style={m(styles.phone)} icon="flashlight" active={p.phoneOn} accent={PHONE} disabled={p.battery <= 0}
        meter={p.battery} keycap={p.keys?.phone} onPress={p.onPhone} a11y={`Phone light, ${Math.round(p.battery * 100)} percent`} />
      <RoundButton size={58} style={m(styles.breath)} icon="lungs" active={breath} accent={blood} a11y="Hold your breath" keycap={p.keys?.breath}
        onDown={() => { setBreath(true); p.onHoldBreath(true); }} onUp={() => { setBreath(false); p.onHoldBreath(false); }} />
      <RoundButton size={52} style={m(styles.calm)} icon="meditation" active={calm} accent="#c9d6c2" a11y="Calm your breathing" keycap={p.keys?.calm}
        onDown={() => { setCalm(true); p.onCalm(true); }} onUp={() => { setCalm(false); p.onCalm(false); }} />
      {p.hasMap && (
        <RoundButton size={52} style={m(styles.map)} icon="map-outline" accent={bone} a11y="Read the map" keycap={p.keys?.map}
          onDown={() => p.onMap(true)} onUp={() => p.onMap(false)} />
      )}
    </View>
  );
}

type RoundProps = {
  size: number;
  icon: IconName;
  style: object;
  accent: string;
  label?: string;
  hold?: boolean;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  meter?: number; // 0..1, a small bar under the icon (battery)
  progress?: number | null; // 0..1, a ring that fills around the button (pushing, digging)
  keycap?: string; // the keyboard key for this button, on a computer
  a11y?: string;
  onPress?(): void;
  onDown?(): void;
  onUp?(): void;
};

/**
 * Holding a button in a browser: a long touch makes the browser take over (long-press menu, scrolling) and cancel the
 * press, which reads as letting go. So on web a held button follows the pointer itself, until the finger really lifts.
 */
function useWebHold(onDown?: () => void, onUp?: () => void) {
  const node = useRef<ComponentRef<typeof Pressable>>(null);
  const [held, setHeld] = useState(false);
  const calls = useRef({ onDown, onUp });
  useEffect(() => { calls.current = { onDown, onUp }; });
  const holdable = Platform.OS === 'web' && !!onDown;
  useEffect(() => {
    if (!holdable) return;
    const el = node.current as unknown as HTMLElement | null;
    if (!el) return;
    let active: number | null = null;
    const down = (e: PointerEvent) => {
      if (active !== null || e.button > 0) return;
      active = e.pointerId;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* still works without capture while over the button */ }
      setHeld(true);
      calls.current.onDown?.();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = null;
      setHeld(false);
      calls.current.onUp?.();
    };
    const noMenu = (e: Event) => e.preventDefault();
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', noMenu);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('contextmenu', noMenu);
      if (active !== null) calls.current.onUp?.();
    };
  }, [holdable]);
  return { node, held, holdable };
}

const KEY_CODES: Record<string, string[]> = { E: ['KeyE', 'Space'], F: ['KeyF'], R: ['KeyR'], Q: ['KeyQ'], C: ['KeyC'], M: ['KeyM'] };

/** On a computer: is this button's key down right now? So the on-screen button answers the keyboard too. */
function useKeyDown(keycap?: string) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    const codes = keycap ? KEY_CODES[keycap] : undefined;
    if (!codes) return;
    const press = (e: KeyboardEvent) => { if (codes.includes(e.code)) setDown(true); };
    const release = (e: KeyboardEvent) => { if (codes.includes(e.code)) setDown(false); };
    const clear = () => setDown(false);
    window.addEventListener('keydown', press);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', press);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', clear);
    };
  }, [keycap]);
  return down;
}

function RoundButton(b: RoundProps) {
  const { node, held, holdable } = useWebHold(b.onDown, b.onUp);
  const keyDown = useKeyDown(b.keycap);
  const r = b.size / 2;
  const ring = r - 3;
  const circ = 2 * Math.PI * ring;
  return (
    <Pressable
      ref={node} accessibilityRole="button" accessibilityLabel={b.a11y ?? b.label} disabled={b.disabled}
      onPress={b.onPress} onPressIn={holdable ? undefined : b.onDown} onPressOut={holdable ? undefined : b.onUp} hitSlop={6}
      style={({ pressed }) => [
        styles.round, b.style, { width: b.size, height: b.size, borderRadius: r },
        b.active && { borderColor: b.accent, backgroundColor: `${b.accent}2e`, shadowColor: b.accent, shadowOpacity: 0.9, shadowRadius: 12 },
        (pressed || held) && { backgroundColor: `${b.accent}55`, transform: [{ scale: 0.94 }] },
        keyDown && styles.keyDown,
        b.disabled && styles.disabled,
      ]}>
      {b.progress !== undefined && b.progress !== null && (
        <Svg width={b.size} height={b.size} style={StyleSheet.absoluteFill}>
          <Circle cx={r} cy={r} r={ring} stroke="rgba(255,255,255,0.12)" strokeWidth={4} fill="none" />
          <Circle cx={r} cy={r} r={ring} stroke={b.accent} strokeWidth={4} fill="none" strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - b.progress)} transform={`rotate(-90 ${r} ${r})`} />
        </Svg>
      )}
      <MaterialCommunityIcons name={b.icon} size={b.size * 0.42} color={b.active ? b.accent : bone} />
      {b.label && <Text style={styles.label}>{b.label}</Text>}
      {b.hold && <Text style={styles.hold}>HOLD</Text>}
      {b.meter !== undefined && (
        <View style={styles.meter}><View style={[styles.meterFill, { width: `${Math.round(b.meter * 100)}%`, backgroundColor: b.meter < 0.15 ? blood : b.active ? b.accent : 'rgba(228,216,196,0.7)' }]} /></View>
      )}
      {b.badge !== undefined && <View style={styles.badge}><Text style={styles.badgeText}>{b.badge}</Text></View>}
      {b.keycap && <View style={styles.keycap}><Text style={styles.keycapText}>{b.keycap}</Text></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { position: 'absolute', right: 18, bottom: 16, width: 250, height: 200 },
  padLeft: { position: 'absolute', left: 18, bottom: 16, width: 250, height: 200 },
  round: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(228,216,196,0.28)', backgroundColor: 'rgba(12,8,7,0.55)',
  },
  action: { right: 0, bottom: 0 },
  actionBorder: { borderColor: 'rgba(163,18,14,0.75)', borderWidth: 2 },
  breath: { right: 104, bottom: 2 },
  match: { right: 90, bottom: 84 },
  phone: { right: 12, bottom: 108 },
  calm: { right: 176, bottom: 6 },
  map: { right: 168, bottom: 76 },
  disabled: { opacity: 0.35 },
  keyDown: { borderColor: blood, borderWidth: 3, backgroundColor: `${blood}55`, transform: [{ scale: 0.94 }] },
  label: { color: bone, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 1 },
  hold: { color: 'rgba(228,216,196,0.5)', fontSize: 7.5, letterSpacing: 1.5 },
  meter: { position: 'absolute', bottom: 9, width: 24, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  meterFill: { height: 3 },
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10,
    backgroundColor: blood, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1a0806',
  },
  keycap: { position: 'absolute', bottom: -4, left: -4, minWidth: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(228,216,196,0.45)', backgroundColor: 'rgba(12,8,7,0.85)', alignItems: 'center', justifyContent: 'center' },
  keycapText: { color: bone, fontSize: 10, fontWeight: '800' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});

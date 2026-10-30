// Keyboard and mouse for the web build on a computer: WASD to walk, the mouse to look (pointer lock),
// and keys for everything on the touch buttons. Phones and touch screens keep the touch controls.
import { useEffect, useState, type RefObject } from 'react';
import { Platform } from 'react-native';
import type { Game } from '../game/Game';
import { useGame } from '../game/store';

export const KEYS = { action: 'E', match: 'F', phone: 'R', breath: 'Q', calm: 'C' } as const;

const MOUSE_SCALE = 0.5; // mouse pixels are finer than a thumb drag
const WALK = 0.9; // stick magnitude for walking (above 0.92 counts as sprinting)

export function isDesktop() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
}

/** Wires keys and mouse to the game. Returns whether the mouse is captured (pointer locked). */
export function useDesktopControls(game: RefObject<Game | null>, paused: boolean): { desktop: boolean; locked: boolean } {
  const [desktop] = useState(isDesktop);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    const held = new Set<string>();
    const g = () => game.current;
    const blocked = () => {
      const s = useGame.getState();
      return !!(s.clue || s.choices || s.end || s.paused);
    };
    const move = () => {
      if (blocked()) { g()?.setInput({ moveX: 0, moveY: 0 }); return; }
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      const len = Math.hypot(x, y);
      const mag = len === 0 ? 0 : held.has('ShiftLeft') || held.has('ShiftRight') ? 1 : WALK;
      g()?.setInput({ moveX: len ? (x / len) * mag : 0, moveY: len ? (y / len) * mag : 0 });
    };
    const hold = () => {
      const free = !blocked();
      g()?.setInput({
        interact: free && (held.has('KeyE') || held.has('Space') || held.has('Mouse0')),
        holdingBreath: free && (held.has('KeyQ') || held.has('Mouse2')),
        calming: free && held.has('KeyC'),
      });
    };
    const press = (code: string) => {
      const s = useGame.getState();
      if (s.clue) {
        if (code === 'KeyE' || code === 'Space' || code === 'Enter' || code === 'Escape') s.showClue(null);
        return;
      }
      if (code === 'KeyP' && !s.end && !s.choices) { s.setPaused(!s.paused); return; }
      if (blocked()) return;
      if (code === 'KeyF') g()?.lightMatch();
      if (code === 'KeyR') g()?.usePhone();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); // don't scroll the page
      if (!e.repeat) { held.add(e.code); press(e.code); }
      move(); hold();
    };
    const onKeyUp = (e: KeyboardEvent) => { held.delete(e.code); move(); hold(); };
    const onBlur = () => { held.clear(); move(); hold(); };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('[role="button"]')) return; // the on-screen buttons still work with a click
      if (blocked()) return;
      if (document.pointerLockElement !== document.body) {
        // the first click captures the mouse; it doesn't also act
        const req = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
        req?.catch?.(() => {});
        return;
      }
      held.add(`Mouse${e.button}`); hold();
    };
    const onMouseUp = (e: MouseEvent) => { held.delete(`Mouse${e.button}`); hold(); };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== document.body || blocked()) return;
      g()?.look(e.movementX * MOUSE_SCALE, e.movementY * MOUSE_SCALE);
    };
    let wasLocked = false;
    const onLockChange = () => {
      const on = document.pointerLockElement === document.body;
      setLocked(on);
      // Esc frees the mouse mid-run: treat it as pausing, like most games on a computer
      if (wasLocked && !on && !blocked() && useGame.getState().hud.phase !== 'loading') useGame.getState().setPaused(true);
      wasLocked = on;
      if (!on) { for (const k of [...held]) if (k.startsWith('Mouse')) held.delete(k); hold(); }
    };
    const noMenu = (e: MouseEvent) => { if (document.pointerLockElement) e.preventDefault(); };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('contextmenu', noMenu);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', noMenu);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [desktop, game]);

  // reading a clue, choosing an ending, or the run is over: give the mouse back so the buttons can be clicked
  const end = useGame((s) => s.end);
  useEffect(() => {
    if (desktop && (paused || end) && typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
  }, [desktop, paused, end]);

  return { desktop, locked };
}

// Dev-only scripted playthrough for screenshots on a simulator, where nobody can touch the screen.
// Enabled with EXPO_PUBLIC_AUTOPILOT=1 when starting Metro; does nothing otherwise.
import type { Game } from '../Game';

export const AUTOPILOT = __DEV__ && process.env.EXPO_PUBLIC_AUTOPILOT === '1';

export function runAutopilot(game: Game): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (s: number, fn: () => void) => timers.push(setTimeout(fn, s * 1000));
  at(5, () => game.lightMatch());
  at(7, () => game.setInput({ interact: true }));
  at(17, () => game.setInput({ interact: false }));
  at(21, () => { game.usePhone(); game.lightMatch(); });
  at(22, () => game.setInput({ moveY: 0.7 }));
  at(25, () => game.look(-120, 0));
  at(26, () => game.look(120, 0));
  at(28, () => game.setInput({ moveY: 0.8 }));
  at(34, () => game.setInput({ moveY: 0 }));
  return () => timers.forEach(clearTimeout);
}

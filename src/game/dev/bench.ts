// Dev-only benchmark: walks the catacombs, the necropolis and the graveyard for ~20 s each and logs the real frame
// rate and render resolution to the Metro terminal ("[bench]" lines). Start with /play?layer=3&bench=1 (optionally
// &quality=low|medium|high). The creatures are held harmless so the walk never ends early.
import type { Game } from '../Game';

type BenchGame = {
  phase: string; fpsShown: number; listenerDeaf: boolean; hushmenBlind: boolean; ended: boolean;
  renderer: { width: number; height: number; scale: number; stats: { triangles: number; calls: number } };
  setInput(i: { moveX?: number; moveY?: number }): void; look(dx: number, dy: number): void; usePhone(): void;
  goToNecropolis(): void; goToSurface(): void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(g: BenchGame, phase: string) {
  for (let i = 0; i < 600 && g.phase !== phase; i++) await sleep(100);
  await sleep(3500); // let shaders compile and the resolution settle
}

async function walk(g: BenchGame, name: string, seconds: number) {
  const samples: number[] = [];
  const start = Date.now();
  let frames = 0, last = Date.now(), worst = 0;
  let running = true;
  const tick = () => { if (!running) return; const now = Date.now(); worst = Math.max(worst, now - last); last = now; frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  g.setInput({ moveY: 0.8 });
  while (Date.now() - start < seconds * 1000) {
    await sleep(3000);
    const t = (Date.now() - start) / 1000;
    const fps = frames / 3; frames = 0;
    samples.push(fps);
    const r = g.renderer;
    console.log(`[bench] ${name} t=${t.toFixed(0)}s fps=${fps.toFixed(1)} worstFrame=${worst}ms render=${Math.round(r.width * r.scale)}x${Math.round(r.height * r.scale)} (scale ${r.scale.toFixed(2)}) draws=${r.stats.calls} tris=${(r.stats.triangles / 1000).toFixed(0)}k`);
    worst = 0;
    g.look(160, 0); // turn so every direction gets drawn
  }
  running = false;
  g.setInput({ moveY: 0 });
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(`[bench] ${name} SUMMARY avg=${avg.toFixed(1)}fps min=${Math.min(...samples).toFixed(1)}fps settledScale=${g.renderer.scale.toFixed(2)}`);
}

export async function runBench(game: Game) {
  const g = game as unknown as BenchGame;
  g.listenerDeaf = true; g.hushmenBlind = true;
  console.log(`[bench] start ${g.renderer.width}x${g.renderer.height}`);
  await waitFor(g, 'catacombs');
  g.usePhone();
  await walk(g, 'catacombs', 21);
  g.goToNecropolis();
  await waitFor(g, 'necropolis');
  g.hushmenBlind = true;
  await walk(g, 'necropolis', 21);
  g.goToSurface();
  await waitFor(g, 'surface');
  g.hushmenBlind = true;
  await walk(g, 'surface', 21);
  console.log('[bench] done');
}

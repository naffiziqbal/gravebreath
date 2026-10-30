// Dev-only, web-only: records the game canvas to WebM and logs everything the HUD and sound do, then
// uploads both to a local helper (tools/gameplay_server.py) that composes the finished video.
import type { Game } from '../Game';
import { useGame } from '../store';

const SERVER = 'http://localhost:8765';

export type Recording = { event(kind: string, data?: Record<string, unknown>): void; stop(): Promise<void> };

export async function startRecording(game: Game, opts: { bitrate?: number } = {}): Promise<Recording> {
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('no canvas to record');
  const t0 = performance.now();
  const events: { t: number; kind: string; data: Record<string, unknown> }[] = [];
  const event = (kind: string, data: Record<string, unknown> = {}) => events.push({ t: (performance.now() - t0) / 1000, kind, data });

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: opts.bitrate ?? 18_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.start(1000);
  event('start', { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight });

  // HUD, subtitles, clue pages and the end screen
  const unsub = useGame.subscribe((s, prev) => {
    if (s.hud !== prev.hud) event('hud', s.hud as unknown as Record<string, unknown>);
    if (s.subtitle !== prev.subtitle) event('subtitle', { text: s.subtitle });
    if (s.clue !== prev.clue) event('clue', { clue: s.clue });
    if (s.end !== prev.end) event('end', { end: s.end, clues: s.meta.clues.length });
  });

  // sound: every one-shot, and loop volumes / rates sampled ten times a second
  const sound = (game as unknown as { sound: { play(n: string, v?: number): void; loopVolume: Map<string, number>; rates: Map<string, number> } }).sound;
  const play = sound.play.bind(sound);
  sound.play = (name: string, volume = 1) => { event('sfx', { name, volume }); play(name, volume); };
  const sampler = setInterval(() => event('loops', { volume: Object.fromEntries(sound.loopVolume), rate: Object.fromEntries(sound.rates) }), 100);

  return {
    event,
    async stop() {
      clearInterval(sampler);
      unsub();
      await new Promise<void>((r) => { recorder.onstop = () => r(); recorder.stop(); });
      const video = new Blob(chunks, { type: 'video/webm' });
      await fetch(`${SERVER}/video`, { method: 'POST', body: video });
      await fetch(`${SERVER}/events`, { method: 'POST', body: JSON.stringify(events) });
      console.log(`[director] uploaded ${(video.size / 1e6).toFixed(1)} MB and ${events.length} events`);
    },
  };
}

// dev only: lets a console script record staged shots (the trailer) without the director
if (__DEV__) (globalThis as { __startRecording?: typeof startRecording }).__startRecording = startRecording;

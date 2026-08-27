// Split ONE combined SRT covering the narrated scenes into per-scene SRT files.
//
// The model's absolute timeline drifts non-uniformly across a multi-file
// transcription (measured: -8s on scene 1, correct by scene 5), so we do NOT
// trust its clip boundaries. Instead:
//   1. assign each cue to a scene by WORD POSITION in the authored script,
//      which is ground truth and immune to timing drift;
//   2. re-fit each scene's cues onto that clip's real measured duration,
//      keeping the model's relative timings, which are good within a scene.
//
//   node scripts/srt-split.mjs assets/srt/_combined.srt

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VO = join(ROOT, 'assets', 'vo');
const SRT_DIR = join(ROOT, 'assets', 'srt');
mkdirSync(SRT_DIR, { recursive: true });

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/srt-split.mjs <combined.srt>');
  process.exit(1);
}

const script = JSON.parse(readFileSync(join(ROOT, 'script.json'), 'utf8'));
const durations = JSON.parse(readFileSync(join(VO, 'durations.json'), 'utf8'));
const scenes = script.scenes.filter((s) => durations[s.id] != null);

const stamp = (s) => {
  const m = s.trim().match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000 : null;
};
const fmt = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};
const toks = (x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

// ---- parse cues -----------------------------------------------------------
const cues = [];
for (const block of readFileSync(input, 'utf8').replace(/\r/g, '').split(/\n{2,}/)) {
  const lines = block.split('\n').filter((l) => l.trim() !== '');
  const tIdx = lines.findIndex((l) => l.includes('-->'));
  if (tIdx === -1) continue;
  const [a, b] = lines[tIdx].split('-->');
  const start = stamp(a), end = stamp(b);
  if (start == null || end == null) continue;
  const text = lines.slice(tIdx + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (text) cues.push({ start, end, text, n: toks(text).length });
}
if (!cues.length) { console.error('parsed 0 cues'); process.exit(1); }

// ---- scene boundaries in WORD space ---------------------------------------
let acc = 0;
const bounds = scenes.map((s) => {
  const n = toks(s.narration).length;
  const b = { id: s.id, from: acc, to: acc + n, words: n };
  acc += n;
  return b;
});
const refWords = acc;
const srtWords = cues.reduce((a, c) => a + c.n, 0);
const wordScale = refWords / srtWords;

console.log(`${cues.length} cues · ${srtWords} words transcribed vs ${refWords} in script (${(wordScale * 100 - 100).toFixed(1)}% diff)`);
console.log(`srt timeline ends ${cues[cues.length - 1].end.toFixed(1)}s · true total ${bounds.reduce((a, b) => a + durations[b.id], 0).toFixed(1)}s\n`);

// ---- assign by word position, then re-fit time per scene -------------------
const buckets = Object.fromEntries(bounds.map((b) => [b.id, []]));
let w = 0;
for (const c of cues) {
  const mid = (w + c.n / 2) * wordScale;
  const b = bounds.find((x) => mid >= x.from && mid < x.to) || bounds[bounds.length - 1];
  buckets[b.id].push(c);
  w += c.n;
}

let bad = 0;
const out = {};
for (const b of bounds) {
  const got = buckets[b.id];
  const dur = durations[b.id];
  if (!got.length) { console.log(`✗ ${b.id}: 0 cues`); bad += 1; continue; }

  // model's own span for this scene -> stretch onto the real clip length
  const s0 = got[0].start;
  const span = got[got.length - 1].end - s0;
  const k = span > 1 ? dur / span : 1;

  out[b.id] = got.map((c) => ({
    text: c.text,
    start: Math.max(0, (c.start - s0) * k),
    end: Math.min(dur, (c.end - s0) * k),
  }));

  // verify: do these cues actually contain this scene's words?
  const scene = scenes.find((s) => s.id === b.id);
  const heard = new Set(toks(got.map((c) => c.text).join(' ')));
  const want = toks(scene.narration).filter((x) => x.length > 3);
  const hit = want.filter((x) => heard.has(x)).length / want.length;
  const ok = hit > 0.75;
  if (!ok) bad += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${b.id.padEnd(15)} ${String(got.length).padStart(3)} cues · text match ${(hit * 100).toFixed(0)}% · stretched ${((k - 1) * 100).toFixed(1)}% onto ${dur.toFixed(1)}s`
  );
}

if (bad) {
  console.log(`\n${bad} scene(s) failed verification — nothing written.`);
  process.exit(2);
}

for (const id of Object.keys(out)) {
  writeFileSync(
    join(SRT_DIR, `${id}.srt`),
    out[id].map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join('\n')
  );
}
console.log(`\nwrote ${Object.keys(out).length} per-scene SRT files`);
console.log('next:  npm run build');

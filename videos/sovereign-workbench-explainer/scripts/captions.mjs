// Build caption cues by aligning the authored narration to each clip's measured
// duration. We wrote the script, so no ASR is needed: split into phrase-sized
// cues, weight each by character count plus a pause bonus for punctuation, then
// distribute the known duration across those weights.
//
//   node scripts/captions.mjs

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VO = join(ROOT, 'assets', 'vo');

const script = JSON.parse(readFileSync(join(ROOT, 'script.json'), 'utf8'));
const durations = JSON.parse(readFileSync(join(VO, 'durations.json'), 'utf8'));

const MAX_WORDS = 7;
const LEAD_IN = 0.28; // TTS models take a beat before the first syllable

// Extra "characters" of silence a mark buys, tuned against the generated audio.
function pauseBonus(word) {
  if (/[.!?]["')]?$/.test(word)) return 11;
  if (/[:;]$/.test(word)) return 7;
  if (/,$/.test(word)) return 5;
  if (/—$/.test(word)) return 5;
  return 0;
}

function toCues(text) {
  const words = text.trim().split(/\s+/);
  const cues = [];
  let cur = [];
  const flush = () => {
    if (cur.length) cues.push(cur), (cur = []);
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const hardStop = /[.!?]["')]?$/.test(w);
    const softStop = /[,:;—]$/.test(w);
    if (hardStop || cur.length >= MAX_WORDS || (softStop && cur.length >= 4)) flush();
  }
  flush();

  // Merge any runt cue into its neighbour so nothing flashes for one word.
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].length < 2 && cues.length > 1) {
      const into = i > 0 ? i - 1 : 1;
      cues[into] = into < i ? [...cues[into], ...cues[i]] : [...cues[i], ...cues[into]];
      cues.splice(i, 1);
      i -= 1;
    }
  }
  return cues;
}

function weigh(cue) {
  let w = 0;
  for (const word of cue) w += word.length + 1 + pauseBonus(word);
  return w;
}

const all = {};
let totalCues = 0;

for (const scene of script.scenes) {
  const dur = durations[scene.id];
  if (dur == null) continue;

  const cues = toCues(scene.narration);
  const weights = cues.map(weigh);
  const sum = weights.reduce((a, b) => a + b, 0);
  const speakable = Math.max(0.5, dur - LEAD_IN);

  let t = LEAD_IN;
  all[scene.id] = cues.map((cue, i) => {
    const span = (weights[i] / sum) * speakable;
    const entry = {
      text: cue.join(' '),
      start: Number(t.toFixed(3)),
      end: Number((t + span).toFixed(3)),
    };
    t += span;
    return entry;
  });
  // let the last cue hold to the end of the clip
  const last = all[scene.id][all[scene.id].length - 1];
  if (last) last.end = Number(dur.toFixed(3));

  totalCues += cues.length;
  console.log(`ok  ${scene.id}  ${cues.length} cues over ${dur}s`);
}

writeFileSync(join(VO, 'captions.json'), JSON.stringify(all, null, 1));
console.log(`\nwrote ${totalCues} cues across ${Object.keys(all).length} scenes`);

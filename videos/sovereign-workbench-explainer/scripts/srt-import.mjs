// Import hand-supplied SRT files as caption cues, overriding the estimated
// timings for any scene that has one. Drop files in assets/srt/<scene-id>.srt
//
//   node scripts/srt-import.mjs            -> merge every SRT found
//   node scripts/srt-import.mjs --compare  -> report drift vs the estimates, change nothing

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VO = join(ROOT, 'assets', 'vo');
const SRT_DIR = join(ROOT, 'assets', 'srt');
const compareOnly = process.argv.includes('--compare');

const stamp = (s) => {
  const m = s.trim().match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
};

function parseSrt(text) {
  const cues = [];
  // blocks separated by blank lines; tolerate CRLF and a missing index line
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) continue;
    const tIdx = lines.findIndex((l) => l.includes('-->'));
    if (tIdx === -1) continue;
    const [a, b] = lines[tIdx].split('-->');
    const start = stamp(a);
    const end = stamp(b);
    if (start == null || end == null) continue;
    const body = lines
      .slice(tIdx + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (body) cues.push({ text: body, start, end });
  }
  return cues;
}


// A caption band holds roughly two lines. Anything longer is split at a word
// boundary and given a share of its own time slice proportional to characters.
const MAX_CHARS = 78;
function splitLong(cue) {
  if (cue.text.length <= MAX_CHARS) return [cue];
  const words = cue.text.split(/\s+/);
  const parts = Math.ceil(cue.text.length / MAX_CHARS);
  const target = Math.ceil(words.length / parts);
  const chunks = [];
  for (let i = 0; i < words.length; i += target) chunks.push(words.slice(i, i + target).join(' '));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const span = cue.end - cue.start;
  let t = cue.start;
  return chunks.map((text) => {
    const d = (text.length / total) * span;
    const out = { text, start: t, end: t + d };
    t += d;
    return out;
  });
}

if (!existsSync(SRT_DIR)) {
  console.error(`no ${SRT_DIR} — create it and drop <scene-id>.srt files in`);
  process.exit(1);
}

const captions = existsSync(join(VO, 'captions.json'))
  ? JSON.parse(readFileSync(join(VO, 'captions.json'), 'utf8'))
  : {};
const durations = JSON.parse(readFileSync(join(VO, 'durations.json'), 'utf8'));

const files = readdirSync(SRT_DIR).filter((f) => extname(f).toLowerCase() === '.srt');
if (!files.length) {
  console.log(`no .srt files in assets/srt/ yet — nothing to import`);
  process.exit(0);
}

let imported = 0;
for (const f of files) {
  const id = basename(f, extname(f));
  const cues = parseSrt(readFileSync(join(SRT_DIR, f), 'utf8'));
  if (!cues.length) {
    console.warn(`!! ${f}: parsed 0 cues — check the format`);
    continue;
  }
  const dur = durations[id];
  const last = cues[cues.length - 1].end;
  const covers = dur ? ((last / dur) * 100).toFixed(0) : '?';

  if (compareOnly) {
    const est = captions[id];
    if (!est) {
      console.log(`${id}: ${cues.length} SRT cues, no estimate to compare`);
      continue;
    }
    // Anchor on position within the TEXT, not cue index - the two sides group
    // words differently, so comparing cue N to cue N measures nothing.
    const norm = (x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const marks = (arr, key) => {
      let acc = 0;
      const out = arr.map((c) => {
        const p = acc;
        acc += norm(c.text).length + 1;
        return { t: c[key], p };
      });
      return { out, total: acc };
    };
    const S = marks(cues, 'start');
    const E = marks(est, 'start');
    const nearest = (m, want) => m.out.reduce((a, b) => (Math.abs(b.p - want) < Math.abs(a.p - want) ? b : a));
    const drift = [0.1, 0.25, 0.5, 0.75, 0.9].map((f) => {
      const d = nearest(E, f * E.total).t - nearest(S, f * S.total).t;
      return `${(f * 100).toFixed(0)}%:${d >= 0 ? '+' : ''}${d.toFixed(2)}s`;
    });
    const worst = Math.max(
      ...[0.1, 0.25, 0.5, 0.75, 0.9].map((f) => Math.abs(nearest(E, f * E.total).t - nearest(S, f * S.total).t))
    );
    console.log(
      `${id}: srt ${cues.length} cues vs est ${est.length} · ${drift.join(' ')} · worst ${worst.toFixed(
        2
      )}s · srt covers ${covers}% of clip`
    );
    continue;
  }

  captions[id] = cues.flatMap(splitLong).map((c) => ({
    text: c.text,
    start: Number(c.start.toFixed(3)),
    end: Number(c.end.toFixed(3)),
  }));
  imported += 1;
  console.log(`ok  ${id}  ${cues.length} cues from SRT · covers ${covers}% of clip`);
}

if (!compareOnly && imported) {
  writeFileSync(join(VO, 'captions.json'), JSON.stringify(captions, null, 1));
  console.log(`\nimported ${imported} scene(s). Now run:\n  node scripts/build-scenes.mjs && node scripts/build-index.mjs`);
}

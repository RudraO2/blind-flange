// Generate narration WAVs from script.json using Gemini TTS.
// Key is read from the environment only: set GEMINI_API_KEY before running.
//   node scripts/tts.mjs            -> generate any missing scenes
//   node scripts/tts.mjs --force    -> regenerate everything
//   node scripts/tts.mjs s07-residency s09-sticky   -> regenerate named scenes

import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'vo');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Export it, then re-run.');
  process.exit(1);
}

const script = JSON.parse(readFileSync(join(ROOT, 'script.json'), 'utf8'));
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

mkdirSync(OUT_DIR, { recursive: true });
const ai = new GoogleGenAI({ apiKey });

function wavHeader(dataLength, { numChannels, sampleRate, bitsPerSample }) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const b = Buffer.alloc(44);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + dataLength, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(numChannels, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(byteRate, 28);
  b.writeUInt16LE(blockAlign, 32);
  b.writeUInt16LE(bitsPerSample, 34);
  b.write('data', 36);
  b.writeUInt32LE(dataLength, 40);
  return b;
}

function parseMime(mimeType) {
  const [fileType, ...params] = mimeType.split(';').map((s) => s.trim());
  const [, format] = fileType.split('/');
  const options = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 };
  if (format && format.startsWith('L')) {
    const bits = parseInt(format.slice(1), 10);
    if (!Number.isNaN(bits)) options.bitsPerSample = bits;
  }
  for (const param of params) {
    const [key, value] = param.split('=').map((s) => s.trim());
    if (key === 'rate') options.sampleRate = parseInt(value, 10);
  }
  return options;
}

async function speak(scene) {
  const prompt = `${script.styleDirection}\n\n## Transcript:\n${scene.narration}`;
  const response = await ai.models.generateContentStream({
    model: script.model,
    config: {
      temperature: 1,
      responseModalities: ['audio'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: script.voice } },
      },
    },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const chunks = [];
  let mimeType = 'audio/L16;rate=24000';
  for await (const chunk of response) {
    const part = chunk.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData?.data) {
      chunks.push(Buffer.from(part.inlineData.data, 'base64'));
      if (part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
    }
  }
  if (!chunks.length) throw new Error('no audio returned');

  const pcm = Buffer.concat(chunks);
  const opts = parseMime(mimeType);
  const wav = Buffer.concat([wavHeader(pcm.length, opts), pcm]);
  const seconds = pcm.length / ((opts.sampleRate * opts.numChannels * opts.bitsPerSample) / 8);
  return { wav, seconds };
}

const durations = {};
const durPath = join(OUT_DIR, 'durations.json');
if (existsSync(durPath)) Object.assign(durations, JSON.parse(readFileSync(durPath, 'utf8')));

for (const scene of script.scenes) {
  const outPath = join(OUT_DIR, `${scene.id}.wav`);
  const wanted = only.length ? only.includes(scene.id) : true;
  if (!wanted) continue;
  if (existsSync(outPath) && !force && !only.length) {
    console.log(`skip   ${scene.id} (exists)`);
    continue;
  }

  let attempt = 0;
  for (;;) {
    try {
      const { wav, seconds } = await speak(scene);
      writeFileSync(outPath, wav);
      durations[scene.id] = Number(seconds.toFixed(3));
      writeFileSync(durPath, JSON.stringify(durations, null, 2));
      console.log(`ok     ${scene.id}  ${seconds.toFixed(1)}s`);
      break;
    } catch (err) {
      attempt += 1;
      if (attempt >= 4) {
        console.error(`FAILED ${scene.id}: ${err.message}`);
        break;
      }
      const wait = 4000 * attempt;
      console.warn(`retry  ${scene.id} in ${wait / 1000}s (${err.message})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const total = Object.values(durations).reduce((a, b) => a + b, 0);
console.log(`\ntotal narration: ${(total / 60).toFixed(2)} min across ${Object.keys(durations).length} scenes`);

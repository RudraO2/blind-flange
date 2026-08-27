// Assembles index.html: title card -> every built scene, back to back -> end card.
//   node scripts/build-index.mjs

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const scenes = JSON.parse(readFileSync(join(ROOT, 'assets/vo/scene-manifest.json'), 'utf8'));

const TITLE = 6.4;
const END = 7.0;

let t = TITLE;
const mounts = scenes
  .map((s) => {
    const block = `      <div
        id="scene-${s.id}"
        data-composition-id="${s.id}"
        data-composition-src="compositions/${s.id}.html"
        data-start="${t.toFixed(3)}"
        data-duration="${s.duration.toFixed(3)}"
        data-track-index="1"
        data-width="1920"
        data-height="1080"
      ></div>`;
    t += s.duration;
    return block;
  })
  .join('\n');

const endStart = t;
const total = Number((t + END).toFixed(3));

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Blind Flange — from first principles</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      body { margin: 0; background: #08100F; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden;
        background: #08100F; color: #E1EAEB; font-family: "IBM Plex Mono", monospace; }
      .card { position: absolute; inset: 0; display: grid; place-items: center; }
      .inner { width: 1400px; text-align: center; }
      .kick { font-size: 24px; letter-spacing: .3em; color: #FF6E3F; text-transform: uppercase; }
      .big { font-family: Oswald, sans-serif; font-size: 168px; font-weight: 700;
        letter-spacing: .03em; text-transform: uppercase; line-height: .98; margin: 34px 0 0; }
      .sub { font-size: 34px; color: #9DB2B9; margin-top: 34px; line-height: 1.5; }
      .meta { font-size: 22px; color: #8FA4AB; letter-spacing: .18em; margin-top: 54px; }
      .rulebar { width: 200px; height: 5px; background: #FF6E3F; margin: 0 auto; }
      .endline { font-family: Oswald, sans-serif; font-size: 88px; text-transform: uppercase;
        letter-spacing: .03em; line-height: 1.18; }
      .endline .q { color: #FF6E3F; }
      #grid { position: absolute; inset: 0; opacity: .3;
        background-image: linear-gradient(#12211F 1px, transparent 1px), linear-gradient(90deg, #12211F 1px, transparent 1px);
        background-size: 80px 80px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${total}">
      <div id="grid"></div>

      <section id="titlecard" class="clip card" data-start="0" data-duration="${TITLE}" data-track-index="0">
        <div class="inner">
          <div class="rulebar" id="trule"></div>
          <div class="kick" id="tkick" style="margin-top:30px">Smart India Hackathon 2026 · SIH26117</div>
          <h1 class="big" id="tbig">Blind&nbsp;Flange</h1>
          <div class="sub" id="tsub">A sovereign, air-gapped AI workbench for MRPL<br/>— explained from first principles</div>
          <div class="meta" id="tmeta">MANGALORE REFINERY AND PETROCHEMICALS LIMITED</div>
        </div>
      </section>

${mounts}

      <section id="endcard" class="clip card" data-start="${endStart.toFixed(3)}" data-duration="${END}" data-track-index="0">
        <div class="inner">
          <div class="endline" id="e1">Build the <span class="q">proof</span> first.</div>
          <div class="endline" id="e2" style="font-size:52px;color:#9DB2B9;margin-top:34px">The assistant is just the evidence.</div>
          <div class="meta" id="e3">SIH26117 · MRPL · SMART AUTOMATION</div>
        </div>
      </section>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      tl.from("#trule", { scaleX: 0, duration: .7, ease: "power3.inOut" }, .15)
        .from("#tkick", { opacity: 0, y: 14, duration: .6 }, .5)
        .from("#tbig", { opacity: 0, y: 40, duration: .9, ease: "power3.out" }, .7)
        .from("#tsub", { opacity: 0, y: 22, duration: .7, ease: "power3.out" }, 1.35)
        .from("#tmeta", { opacity: 0, duration: .7 }, 1.9)
        .to("#titlecard", { opacity: 0, duration: .5, ease: "power2.in" }, ${(TITLE - 0.55).toFixed(2)});

      tl.from("#e1", { opacity: 0, y: 30, duration: .8, ease: "power3.out" }, ${(endStart + 0.3).toFixed(2)})
        .from("#e2", { opacity: 0, y: 22, duration: .7, ease: "power3.out" }, ${(endStart + 1.1).toFixed(2)})
        .from("#e3", { opacity: 0, duration: .7 }, ${(endStart + 2.0).toFixed(2)});

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

writeFileSync(join(ROOT, 'index.html'), html);
console.log(`index.html: ${scenes.length} scenes, total ${total}s (${(total / 60).toFixed(2)} min)`);

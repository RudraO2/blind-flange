// Generates one sub-composition HTML file per scene from scenes.mjs,
// wrapping each scene's stage markup in shared chrome (title block, caption
// band, progress rail) and wiring narration audio + burned-in caption cues.
//
//   node scripts/build-scenes.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SCENES } from './scenes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMP_DIR = join(ROOT, 'compositions');
mkdirSync(COMP_DIR, { recursive: true });

const durations = JSON.parse(readFileSync(join(ROOT, 'assets/vo/durations.json'), 'utf8'));
const capPath = join(ROOT, 'assets/vo/captions.json');
const captions = existsSync(capPath) ? JSON.parse(readFileSync(capPath, 'utf8')) : {};

const PAD_TAIL = 0.9; // breathing room after narration ends

const SHARED_CSS = `
#root{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;
  background:#08100F;color:#E1EAEB;
  font-family:"IBM Plex Mono",monospace;}
#grid{position:absolute;inset:0;
  background-image:linear-gradient(#12211F 1px,transparent 1px),linear-gradient(90deg,#12211F 1px,transparent 1px);
  background-size:80px 80px;opacity:.35;}
#vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%,transparent 40%,#050B0A 100%);}
#tb{position:absolute;top:64px;left:96px;display:flex;align-items:baseline;gap:22px;}
#tb .n{font-family:"IBM Plex Mono",monospace;font-size:22px;font-weight:700;color:#FF6E3F;letter-spacing:.08em;}
#tb .t{font-family:Oswald,sans-serif;font-size:44px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#E1EAEB;}
#rule{position:absolute;top:132px;left:96px;width:1728px;height:2px;background:#233539;transform-origin:left center;}
#stage{position:absolute;top:196px;left:96px;width:1728px;height:648px;}
#capband{position:absolute;left:260px;right:260px;bottom:84px;height:150px;display:grid;place-items:center;}
.cue{position:absolute;left:0;right:0;top:0;bottom:0;display:grid;place-items:center;
  text-align:center;font-family:"IBM Plex Mono",monospace;font-size:44px;font-weight:400;
  line-height:1.34;color:#F2F7F7;text-shadow:0 3px 18px rgba(5,11,10,.95);}
#prog{position:absolute;bottom:38px;left:96px;right:96px;display:flex;align-items:center;gap:18px;}
#prog .bar{flex:1;height:2px;background:#1A2A2E;position:relative;}
#prog .fill{position:absolute;left:0;top:0;bottom:0;background:#FF6E3F;transform-origin:left center;}
#prog .lbl{font-size:17px;color:#8FA4AB;letter-spacing:.16em;}
.mono{font-family:"IBM Plex Mono",monospace;}
.osw{font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.05em;}
.flare{color:#FF6E3F;} .gauge{color:#46BDB0;} .warn{color:#DFA82F;} .dim{color:#9DB2B9;}
.card{position:absolute;background:#0F1A1D;border:2px solid #233539;border-radius:6px;}
.chip{position:absolute;font-family:"IBM Plex Mono",monospace;font-size:22px;
  padding:9px 16px;border-radius:4px;border:2px solid #233539;background:#0F1A1D;white-space:nowrap;}
`;

function cueMarkup(sceneId) {
  const cues = captions[sceneId] || [];
  if (!cues.length) return '';
  return cues
    .map(
      (c, i) =>
        `        <div class="cue clip" id="cue-${sceneId}-${i}" data-start="${c.start.toFixed(
          3
        )}" data-duration="${Math.max(0.24, c.end - c.start).toFixed(3)}">${c.text}</div>`
    )
    .join('\n');
}

let idx = 0;
const manifest = [];

for (const scene of SCENES) {
  idx += 1;
  const vo = durations[scene.id];
  if (vo == null) {
    console.warn(`!! no narration duration for ${scene.id} — skipping`);
    continue;
  }
  const dur = Number((vo + PAD_TAIL).toFixed(3));
  const num = String(idx).padStart(2, '0');

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>${scene.title}</title></head>
  <body>
    <template>
      <style>${SHARED_CSS}${scene.css || ''}</style>

      <div id="root" data-composition-id="${scene.id}" data-width="1920" data-height="1080" data-duration="${dur}">
        <div id="grid"></div>
        <div id="vig"></div>

        <div id="tb">
          <span class="n">${num}</span>
          <span class="t">${scene.title}</span>
        </div>
        <div id="rule"></div>

        <div id="stage">
${scene.stage}
        </div>

        <div id="capband">
${cueMarkup(scene.id)}
        </div>

        <div id="prog">
          <span class="lbl">${num} / ${String(SCENES.length).padStart(2, '0')}</span>
          <span class="bar"><span class="fill" id="pfill"></span></span>
          <span class="lbl">SIH26117</span>
        </div>

        <audio id="vo-${scene.id}" src="assets/vo/${scene.id}.wav" data-start="0" data-duration="${vo.toFixed(
    3
  )}" data-track-index="${20 + idx}" data-volume="1"></audio>
      </div>

      <script>
        (function () {
          window.__timelines = window.__timelines || {};
          // Every scene shares chrome ids (#pfill, #tb, ...). Selector strings in
          // GSAP resolve against the whole document, and all scenes are mounted
          // at once, so all lookups MUST be scoped to this scene's own root.
          const scope = document.querySelector('[data-composition-id="${scene.id}"]');
          const q = gsap.utils.selector(scope);
          const tl = gsap.timeline({ paused: true });
          const D = ${dur};

          tl.from(q(".n"), { opacity: 0, x: -18, duration: 0.45, ease: "power3.out" }, 0)
            .from(q(".t"), { opacity: 0, x: -26, duration: 0.55, ease: "power3.out" }, 0.08)
            .from(q("#rule"), { scaleX: 0, duration: 0.7, ease: "power3.inOut" }, 0.18)
            .fromTo(q("#pfill"), { scaleX: 0 }, { scaleX: 1, duration: D - 0.05, ease: "none" }, 0);

${scene.anim}

          window.__timelines["${scene.id}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;

  writeFileSync(join(COMP_DIR, `${scene.id}.html`), html);
  manifest.push({ id: scene.id, duration: dur });
  console.log(`built ${scene.id}  ${dur}s`);
}

writeFileSync(join(ROOT, 'assets/vo/scene-manifest.json'), JSON.stringify(manifest, null, 2));
const total = manifest.reduce((a, s) => a + s.duration, 0);
console.log(`\n${manifest.length} scenes, ${(total / 60).toFixed(2)} min total`);

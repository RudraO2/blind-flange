// Per-scene stage markup + GSAP beats. All selectors go through q() so they
// stay scoped to the scene root; chrome ids repeat across every scene.
// Stage box is 1728 x 648.

export const SCENES = [
  /* ─────────────────────────────────────────────── 01 */
  {
    id: 's01-problem',
    title: 'The problem',
    css: `
.doc{position:absolute;left:0;width:330px;height:96px;background:#0F1A1D;border:2px solid #233539;
  border-left:5px solid #46BDB0;border-radius:5px;display:flex;align-items:center;padding-left:22px;font-size:24px;}
#wall{position:absolute;left:560px;top:40px;width:7px;height:560px;background:#FF6E3F;transform-origin:top center;
  box-shadow:0 0 34px rgba(255,110,63,.55);}
#walltag{position:absolute;left:470px;top:612px;font-size:19px;color:#FF6E3F;letter-spacing:.14em;}
#cloud{position:absolute;left:700px;top:36px;width:520px;height:150px;background:#0F1A1D;border:2px dashed #37505A;
  border-radius:8px;display:grid;place-items:center;font-size:34px;color:#9DB2B9;letter-spacing:.06em;}
#strike{position:absolute;left:716px;top:110px;width:488px;height:4px;background:#FF6E3F;transform-origin:left center;}
.out{position:absolute;left:700px;width:900px;padding:26px 30px;background:#0F1A1D;border:2px solid #233539;border-radius:6px;}
.out .h{font-family:Oswald,sans-serif;font-size:31px;letter-spacing:.05em;text-transform:uppercase;}
.out .s{font-size:23px;color:#9DB2B9;margin-top:9px;}`,
    stage: `
          <div class="doc" id="d1" style="top:96px">P&amp;ID drawings</div>
          <div class="doc" id="d2" style="top:242px">Inspection reports</div>
          <div class="doc" id="d3" style="top:388px">Vendor negotiations</div>
          <div id="wall"></div>
          <div id="walltag" class="mono">POLICY</div>
          <div id="cloud">CLOUD&nbsp;AI</div>
          <div id="strike"></div>
          <div class="out" id="o1" style="top:250px"><div class="h warn">Done by hand</div><div class="s">Slow. A productivity cost.</div></div>
          <div class="out" id="o2" style="top:420px"><div class="h flare">Pasted in anyway</div><div class="s">A security incident. This is the real driver.</div></div>`,
    anim: `
          tl.from(q("#d1"), { opacity:0, x:-70, duration:.6, ease:"power3.out" }, 1.0)
            .from(q("#d2"), { opacity:0, x:-70, duration:.6, ease:"power3.out" }, 1.5)
            .from(q("#d3"), { opacity:0, x:-70, duration:.6, ease:"power3.out" }, 2.0)
            .from(q("#cloud"), { opacity:0, scale:.9, duration:.7, ease:"power3.out" }, 9.5)
            .fromTo(q("#wall"), { scaleY:0 }, { scaleY:1, duration:.42, ease:"power4.in" }, 15.5)
            .from(q("#walltag"), { opacity:0, duration:.5 }, 15.9)
            .fromTo(q("#strike"), { scaleX:0 }, { scaleX:1, duration:.5, ease:"power3.inOut" }, 16.2)
            .to(q("#cloud"), { opacity:.32, duration:.6 }, 16.2)
            .from(q("#o1"), { opacity:0, y:26, duration:.6, ease:"power3.out" }, 26.5)
            .from(q("#o2"), { opacity:0, y:26, duration:.6, ease:"power3.out" }, 33.0)
            .to(q("#o2"), { borderColor:"#FF6E3F", duration:.5 }, 41.0)
            .to(q("#o1"), { opacity:.4, duration:.5 }, 41.0);`,
  },

  /* ─────────────────────────────────────────────── 02 */
  {
    id: 's02-what',
    title: 'What we are building',
    css: `
#hub{position:absolute;left:614px;top:8px;width:500px;height:104px;background:#0F1A1D;border:2px solid #FF6E3F;
  border-radius:7px;display:grid;place-items:center;font-family:Oswald,sans-serif;font-size:33px;
  letter-spacing:.09em;text-transform:uppercase;color:#FF6E3F;}
.pil{position:absolute;top:196px;width:396px;height:412px;background:#0F1A1D;border:2px solid #233539;border-radius:7px;padding:30px 28px;}
.pil .k{font-family:"IBM Plex Mono",monospace;font-size:20px;color:#FF6E3F;letter-spacing:.14em;}
.pil .h{font-family:Oswald,sans-serif;font-size:35px;text-transform:uppercase;letter-spacing:.04em;margin-top:16px;line-height:1.14;}
.pil .s{font-size:22px;color:#9DB2B9;margin-top:18px;line-height:1.5;}`,
    stage: `
          <div id="hub">Air-gapped workbench</div>
          <div class="pil" id="p1" style="left:0"><div class="k">01</div><div class="h">Picks its<br/>own brain</div><div class="s">A classifier chooses the model, and shows you why.</div></div>
          <div class="pil" id="p2" style="left:444px"><div class="k">02</div><div class="h">Finishes<br/>the job</div><div class="s">A real Word file or working code. Not a chat reply.</div></div>
          <div class="pil" id="p3" style="left:888px"><div class="k">03</div><div class="h">Reads<br/>paper</div><div class="s">Scans, handwriting, drawings — with the source crop shown.</div></div>
          <div class="pil" id="p4" style="left:1332px"><div class="k">04</div><div class="h">Proves it<br/>is offline</div><div class="s">Blocks a deliberate outbound call, live.</div></div>`,
    anim: `
          tl.from(q("#hub"), { opacity:0, y:-22, duration:.7, ease:"power3.out" }, 1.2)
            .from(q("#p1"), { opacity:0, y:34, duration:.6, ease:"power3.out" }, 19.5)
            .from(q("#p2"), { opacity:0, y:34, duration:.6, ease:"power3.out" }, 28.0)
            .from(q("#p3"), { opacity:0, y:34, duration:.6, ease:"power3.out" }, 37.5)
            .from(q("#p4"), { opacity:0, y:34, duration:.6, ease:"power3.out" }, 45.5)
            .to(q("#p4"), { borderColor:"#FF6E3F", duration:.6 }, 48.5);`,
  },

  /* ─────────────────────────────────────────────── 03 */
  {
    id: 's03-gpu',
    title: 'First principle: the card',
    css: `
#card{position:absolute;left:0;top:36px;width:880px;height:392px;border:3px solid #46BDB0;border-radius:9px;background:#0B1618;}
#cardlbl{position:absolute;left:20px;top:-2px;font-size:21px;color:#46BDB0;letter-spacing:.13em;padding:6px 12px;}
#weights{position:absolute;left:26px;top:60px;width:828px;height:306px;
  background:repeating-linear-gradient(90deg,#16333A 0 8px,#0B1618 8px 15px);border-radius:4px;}
#sweep{position:absolute;left:26px;top:60px;width:70px;height:306px;
  background:linear-gradient(90deg,transparent,rgba(255,110,63,.72),transparent);}
#rd{position:absolute;left:0;top:452px;font-size:25px;color:#FF6E3F;}
.wd{position:absolute;left:1000px;width:300px;height:66px;background:#0F1A1D;border:2px solid #233539;border-radius:5px;
  display:flex;align-items:center;padding-left:20px;font-size:26px;}
#punch{position:absolute;left:0;top:506px;width:1728px;font-family:Oswald,sans-serif;font-size:56px;line-height:1.1;
  letter-spacing:.03em;text-transform:uppercase;color:#FF6E3F;}
#punchsub{position:absolute;left:0;top:596px;font-size:24px;color:#9DB2B9;}`,
    stage: `
          <div id="card"><span id="cardlbl" class="mono" style="position:absolute;background:#08100F;">GPU · 16 GB VRAM</span><div id="weights"></div><div id="sweep"></div></div>
          <div id="rd" class="mono">reads the ENTIRE model — for every single word</div>
          <div class="wd" id="w1" style="top:60px">word 1</div>
          <div class="wd" id="w2" style="top:150px">word 2</div>
          <div class="wd" id="w3" style="top:240px">word 3</div>
          <div class="wd" id="w4" style="top:330px">word 4 …</div>
          <div id="punch">Limited by memory speed — not maths</div>
          <div id="punchsub" class="mono">this one fact drives three later decisions</div>`,
    anim: `
          const sweep = (at) => tl.fromTo(q("#sweep"), { x:0, opacity:0 },
            { x:758, opacity:1, duration:1.15, ease:"none" }, at);
          tl.from(q("#card"), { opacity:0, scale:.94, duration:.8, ease:"power3.out" }, 1.0)
            .from(q("#weights"), { opacity:0, duration:.7 }, 1.6);
          sweep(15.5); tl.from(q("#w1"), { opacity:0, x:26, duration:.4 }, 16.4);
          sweep(18.0); tl.from(q("#w2"), { opacity:0, x:26, duration:.4 }, 18.9);
          sweep(20.5); tl.from(q("#w3"), { opacity:0, x:26, duration:.4 }, 21.4);
          sweep(23.0); tl.from(q("#w4"), { opacity:0, x:26, duration:.4 }, 23.9);
          sweep(26.0); sweep(28.4); sweep(30.8);
          tl.from(q("#rd"), { opacity:0, duration:.6 }, 24.5)
            .from(q("#punch"), { opacity:0, y:26, duration:.75, ease:"power3.out" }, 40.5)
            .from(q("#punchsub"), { opacity:0, duration:.6 }, 47.5);`,
  },

  /* ─────────────────────────────────────────────── 04 */
  {
    id: 's04-planes',
    title: 'Six planes',
    css: `
.pl{position:absolute;left:250px;width:1080px;height:74px;background:#0F1A1D;border:2px solid #233539;border-radius:5px;
  display:flex;align-items:center;padding:0 26px;gap:26px;}
.pl .nm{font-family:Oswald,sans-serif;font-size:29px;text-transform:uppercase;letter-spacing:.06em;width:250px;}
.pl .ds{font-size:22px;color:#9DB2B9;}
#fence{position:absolute;left:206px;top:12px;width:1168px;height:552px;border:3px dashed #FF6E3F;border-radius:12px;}
#fencelbl{position:absolute;left:206px;top:584px;font-size:25px;color:#FF6E3F;letter-spacing:.09em;}`,
    stage: `
          <div id="fence"></div>
          <div class="pl" id="l1" style="top:38px"><span class="nm">Access</span><span class="ds">the screen people use</span></div>
          <div class="pl" id="l2" style="top:126px"><span class="nm">Orchestration</span><span class="ds">plans the work, picks the model</span></div>
          <div class="pl" id="l3" style="top:214px"><span class="nm">Tools</span><span class="ds">read files, run code, search documents</span></div>
          <div class="pl" id="l4" style="top:302px"><span class="nm">Model</span><span class="ds">the open-weight models themselves</span></div>
          <div class="pl" id="l5" style="top:390px"><span class="nm">Data</span><span class="ds">files, search index, audit trail</span></div>
          <div class="pl" id="l6" style="top:478px"><span class="nm">Control</span><span class="ds">firewall, network monitor, audit log</span></div>
          <div id="fencelbl" class="mono">↑ nothing inside this outline has a route out</div>`,
    anim: `
          const lay=["#l1","#l2","#l3","#l4","#l5","#l6"];
          lay.forEach((s,i)=>tl.from(q(s),{opacity:0,x:-46,duration:.55,ease:"power3.out"},9.5+i*3.6));
          tl.from(q("#fence"), { opacity:0, scale:.97, duration:.9, ease:"power3.out" }, 40.0)
            .from(q("#fencelbl"), { opacity:0, duration:.6 }, 43.0);`,
  },

  /* ─────────────────────────────────────────────── 05 */
  {
    id: 's05-registry',
    title: 'Models are configuration',
    css: `
#yml{position:absolute;left:0;top:20px;width:980px;height:560px;background:#0B1618;border:2px solid #233539;border-radius:7px;padding:26px 30px;
  font-size:23px;line-height:1.62;white-space:pre;overflow:hidden;}
#yml .k{color:#46BDB0;} #yml .v{color:#E1EAEB;} #yml .c{color:#8FA4AB;}
.pk{position:absolute;left:1060px;width:668px;height:76px;background:#0F1A1D;border:2px solid #233539;border-radius:5px;
  display:flex;align-items:center;padding:0 24px;gap:18px;font-size:24px;}
.pk .dot{width:13px;height:13px;border-radius:50%;background:#46BDB0;}
#pklbl{position:absolute;left:1060px;top:16px;font-size:20px;color:#8FA4AB;letter-spacing:.14em;}
#refuse{position:absolute;left:1060px;top:512px;width:668px;padding:20px 24px;border:2px solid #FF6E3F;border-radius:6px;
  font-size:22px;color:#FF6E3F;background:rgba(255,110,63,.07);}`,
    stage: `
          <div id="yml"><span class="c"># registry/models.yaml</span>
<span class="k">- id:</span> <span class="v">general-reasoner</span>
  <span class="k">engine:</span> <span class="v">llamacpp</span>
  <span class="k">path:</span> <span class="v">/models/general-30b-a3b-Q4.gguf</span>
  <span class="k">sha256:</span> <span class="v">3f9c…</span>   <span class="c"># tamper check</span>
  <span class="k">vram_gb:</span> <span class="v">6.4</span>
  <span class="k">ctx:</span> <span class="v">32768</span>
  <span class="k">capabilities:</span> <span class="v">[tools, json, reasoning]</span>
  <span class="k">license:</span> <span class="v">apache-2.0</span>
  <span class="k">task_affinity:</span>
    <span class="k">doc_summarize:</span> <span class="v">0.92</span>
    <span class="k">code:</span> <span class="v">0.55</span><span id="ymlnew">

<span class="c"># next year's model — 12 lines, no code change</span>
<span class="k">- id:</span> <span class="v">coder-next</span>
  <span class="k">license:</span> <span class="v">mit</span></span></div>
          <div id="pklbl" class="mono">LOADED MODELS</div>
          <div class="pk" id="k1" style="top:56px"><span class="dot"></span>general-reasoner</div>
          <div class="pk" id="k2" style="top:148px"><span class="dot"></span>coder</div>
          <div class="pk" id="k3" style="top:240px"><span class="dot"></span>vision-document</div>
          <div class="pk" id="k4" style="top:332px"><span class="dot"></span>embedder + reranker</div>
          <div class="pk" id="k5" style="top:424px"><span class="dot" style="background:#FF6E3F"></span>coder-next</div>
          <div id="refuse" class="mono">loader refuses any non-permissive licence</div>`,
    anim: `
          tl.from(q("#yml"), { opacity:0, duration:.8 }, 1.0)
            .from(q("#pklbl"), { opacity:0, duration:.5 }, 2.4);
          ["#k1","#k2","#k3","#k4"].forEach((s,i)=>tl.from(q(s),{opacity:0,x:34,duration:.5,ease:"power3.out"},14.0+i*2.2));
          tl.from(q("#ymlnew"), { opacity:0, duration:.7 }, 33.0)
            .from(q("#k5"), { opacity:0, x:34, scale:.94, duration:.6, ease:"back.out(1.6)" }, 36.0)
            .from(q("#refuse"), { opacity:0, y:20, duration:.6 }, 47.0);`,
  },

  /* ─────────────────────────────────────────────── 06 */
  {
    id: 's06-router',
    title: 'The router',
    css: `
#qin{position:absolute;left:0;top:250px;width:330px;padding:22px 24px;background:#0F1A1D;border:2px solid #46BDB0;border-radius:6px;font-size:23px;}
.stg{position:absolute;width:340px;height:290px;background:#0F1A1D;border:2px solid #233539;border-radius:7px;padding:24px;}
.stg .k{font-size:19px;color:#FF6E3F;letter-spacing:.14em;}
.stg .h{font-family:Oswald,sans-serif;font-size:31px;text-transform:uppercase;margin-top:12px;letter-spacing:.04em;}
.stg .s{font-size:21px;color:#9DB2B9;margin-top:16px;line-height:1.48;}
#scores{position:absolute;left:0;top:474px;width:1728px;font-size:24px;line-height:1.75;}
#scores .win{color:#46BDB0;} #scores .no{color:#8FA4AB;}`,
    stage: `
          <div id="qin" class="mono">"write a script<br/>to reconcile<br/>these tags"</div>
          <div class="stg" id="g0" style="left:396px;top:96px"><div class="k mono">STAGE 0</div><div class="h">Obvious</div><div class="s">Image attached? Then it is the vision model. No thinking needed.</div></div>
          <div class="stg" id="g1" style="left:790px;top:96px"><div class="k mono">STAGE 1</div><div class="h">Classify</div><div class="s">A tiny model sorts the question into a task type. 20 ms, on the CPU.</div></div>
          <div class="stg" id="g2" style="left:1184px;top:96px"><div class="k mono">STAGE 2</div><div class="h">Score</div><div class="s">Which model can actually do it right now — tools, context, is it loaded?</div></div>
          <div id="scores" class="mono">
            <div id="sc1"><span class="win">coder-14b&nbsp;&nbsp;0.87&nbsp;&nbsp;✓ chosen</span> &nbsp;<span class="no">— affinity .94 · tools ok · already resident</span></div>
            <div id="sc2"><span class="no">general-14b&nbsp;&nbsp;0.61&nbsp;&nbsp;— capable, but weaker at code</span></div>
            <div id="sc3"><span class="no">vision-8b&nbsp;&nbsp;&nbsp;&nbsp;——&nbsp;&nbsp;✗ filtered: this task needs tool-calling</span></div>
          </div>`,
    anim: `
          tl.from(q("#qin"), { opacity:0, x:-40, duration:.6, ease:"power3.out" }, 1.2)
            .from(q("#g0"), { opacity:0, y:26, duration:.55, ease:"power3.out" }, 9.0)
            .from(q("#g1"), { opacity:0, y:26, duration:.55, ease:"power3.out" }, 18.5)
            .from(q("#g2"), { opacity:0, y:26, duration:.55, ease:"power3.out" }, 30.0)
            .from(q("#sc1"), { opacity:0, x:-24, duration:.5 }, 43.0)
            .from(q("#sc2"), { opacity:0, x:-24, duration:.5 }, 44.4)
            .from(q("#sc3"), { opacity:0, x:-24, duration:.5 }, 45.8)
            .to(q("#g2"), { borderColor:"#FF6E3F", duration:.5 }, 43.0);`,
  },

  /* ─────────────────────────────────────────────── 07 */
  {
    id: 's07-residency',
    title: 'Never unload',
    css: `
.brow{position:absolute;left:0;width:1728px;height:78px;}
.brow .lb{position:absolute;left:0;top:20px;width:330px;font-family:Oswald,sans-serif;font-size:29px;text-transform:uppercase;letter-spacing:.05em;}
.brow .tr{position:absolute;left:350px;top:16px;height:46px;background:#131F22;border-radius:4px;width:1160px;}
.brow .fl{position:absolute;left:350px;top:16px;height:46px;border-radius:4px;transform-origin:left center;}
.brow .vl{position:absolute;left:1540px;top:22px;font-size:27px;}
.tier{position:absolute;left:0;width:560px;height:150px;background:#0F1A1D;border:2px solid #233539;border-radius:6px;padding:22px 24px;}
.tier .t{font-size:19px;color:#FF6E3F;letter-spacing:.14em;}
.tier .h{font-family:Oswald,sans-serif;font-size:27px;text-transform:uppercase;margin-top:10px;}
.tier .s{font-size:20px;color:#9DB2B9;margin-top:10px;line-height:1.45;}`,
    stage: `
          <div class="brow" id="b1" style="top:20px"><span class="lb">Cold load</span><span class="tr"></span><span class="fl" id="f1" style="width:1160px;background:#FF6E3F"></span><span class="vl flare mono">37–58 s</span></div>
          <div class="brow" id="b2" style="top:120px"><span class="lb">Warm wake</span><span class="tr"></span><span class="fl" id="f2" style="width:30px;background:#46BDB0"></span><span class="vl gauge mono">≈ 1 s</span></div>
          <div class="tier" id="t1" style="top:270px"><div class="t mono">TIER 0</div><div class="h">Pinned in VRAM</div><div class="s">Search + classifier models. Never move. ~2.5 GB.</div></div>
          <div class="tier" id="t2" style="left:584px;top:270px"><div class="t mono">TIER 1</div><div class="h">The active model</div><div class="s">Whichever model is answering right now.</div></div>
          <div class="tier" id="t3" style="left:1168px;top:270px"><div class="t mono">TIER 2</div><div class="h">Warm in system RAM</div><div class="s">Waking one is just a copy. About one second.</div></div>
          <div id="kicker" class="osw" style="position:absolute;left:0;top:470px;font-size:44px;color:#FF6E3F;">System RAM is the spec that matters — not the card</div>`,
    anim: `
          tl.from(q("#b1 .lb"), { opacity:0, duration:.5 }, 12.0)
            .fromTo(q("#f1"), { scaleX:0 }, { scaleX:1, duration:2.4, ease:"power1.inOut" }, 12.4)
            .from(q("#b1 .vl"), { opacity:0, duration:.5 }, 14.6)
            .from(q("#b2 .lb"), { opacity:0, duration:.5 }, 26.0)
            .fromTo(q("#f2"), { scaleX:0 }, { scaleX:1, duration:.28, ease:"power3.out" }, 26.4)
            .from(q("#b2 .vl"), { opacity:0, duration:.5 }, 26.8)
            .from(q("#t1"), { opacity:0, y:26, duration:.5 }, 33.0)
            .from(q("#t2"), { opacity:0, y:26, duration:.5 }, 37.0)
            .from(q("#t3"), { opacity:0, y:26, duration:.5 }, 41.0)
            .from(q("#kicker"), { opacity:0, y:22, duration:.7, ease:"power3.out" }, 49.0);`,
  },

  /* ─────────────────────────────────────────────── 08 */
  {
    id: 's08-moe',
    title: 'Hot and cold',
    css: `
.slot{position:absolute;top:120px;width:760px;height:300px;border:3px solid #46BDB0;border-radius:8px;background:#0B1618;}
.slotlbl{position:absolute;top:82px;font-size:21px;color:#46BDB0;letter-spacing:.13em;}
#dense{position:absolute;left:12px;top:12px;width:806px;height:276px;background:rgba(255,110,63,.2);border:2px solid #FF6E3F;border-radius:5px;
  display:grid;place-items:center;font-size:29px;color:#FF6E3F;transform-origin:left center;}
.moeblk{position:absolute;top:12px;width:238px;height:276px;background:rgba(70,189,176,.16);border:2px solid #46BDB0;border-radius:5px;
  display:grid;place-items:center;font-size:24px;color:#46BDB0;text-align:center;line-height:1.4;}
.cap{position:absolute;top:446px;width:760px;font-size:23px;color:#9DB2B9;line-height:1.5;}
#dots{position:absolute;left:0;top:530px;width:1728px;display:flex;gap:11px;align-items:center;}
#dots .d{width:17px;height:17px;border-radius:50%;background:#1B3238;}
#dots .hot{background:#FF6E3F;}
#dotlbl{position:absolute;left:0;top:576px;font-size:22px;color:#9DB2B9;}`,
    stage: `
          <div class="slotlbl mono" id="sl1" style="left:0">DENSE 27B · Q4</div>
          <div class="slot" id="s1" style="left:0"><div id="dense">17 GB — will not fit</div></div>
          <div class="cap" id="c1" style="left:0">Fills a 16 GB card on its own. Nothing left for working memory.</div>
          <div class="slotlbl mono" id="sl2" style="left:968px">MIXTURE OF EXPERTS</div>
          <div class="slot" id="s2" style="left:968px">
            <div class="moeblk" id="m1" style="left:12px">general<br/>6 GB</div>
            <div class="moeblk" id="m2" style="left:262px">coder<br/>6 GB</div>
            <div class="moeblk" id="m3" style="left:512px">vision<br/>6 GB</div>
          </div>
          <div class="cap" id="c2" style="left:968px">Three models resident at once. No swapping at all.</div>
          <div id="dots"></div>
          <div id="dotlbl" class="mono">hot neurons fire for every word · cold neurons only sometimes</div>`,
    anim: `
          const dots=q("#dots")[0];
          for(let i=0;i<58;i++){const d=document.createElement("span");d.className="d"+(i%9===0?" hot":"");dots.appendChild(d);}
          tl.from(q("#dotlbl"), { opacity:0, duration:.6 }, 8.0)
            .from(dots.children, { opacity:0, scale:.4, duration:.5, stagger:.012, ease:"back.out(2)" }, 8.4)
            .from(q("#sl1"), { opacity:0, duration:.4 }, 30.0)
            .from(q("#s1"), { opacity:0, duration:.5 }, 30.2)
            .fromTo(q("#dense"), { scaleX:.4 }, { scaleX:1, duration:1.0, ease:"power2.out" }, 31.0)
            .from(q("#c1"), { opacity:0, duration:.5 }, 33.5)
            .from(q("#sl2"), { opacity:0, duration:.4 }, 41.0)
            .from(q("#s2"), { opacity:0, duration:.5 }, 41.2)
            .from(q("#m1"), { opacity:0, y:20, duration:.45 }, 42.0)
            .from(q("#m2"), { opacity:0, y:20, duration:.45 }, 43.0)
            .from(q("#m3"), { opacity:0, y:20, duration:.45 }, 44.0)
            .from(q("#c2"), { opacity:0, duration:.5 }, 50.0);`,
  },

  /* ─────────────────────────────────────────────── 09 */
  {
    id: 's09-sticky',
    title: 'Per message, or per chat?',
    css: `
.bub{position:absolute;left:0;width:820px;padding:24px 28px;background:#0F1A1D;border:2px solid #233539;border-radius:8px;font-size:25px;}
.bub .who{font-size:19px;color:#8FA4AB;letter-spacing:.13em;margin-bottom:10px;}
.opt{position:absolute;left:900px;width:828px;padding:22px 26px;border-radius:7px;border:2px solid #233539;background:#0F1A1D;}
.opt .h{font-family:Oswald,sans-serif;font-size:29px;text-transform:uppercase;letter-spacing:.04em;}
.opt .s{font-size:21px;color:#9DB2B9;margin-top:9px;line-height:1.45;}
#calc{position:absolute;left:0;top:430px;width:1728px;padding:26px 30px;background:#0B1618;border:2px solid #FF6E3F;border-radius:7px;
  font-size:25px;line-height:1.62;}
#calc .em{color:#FF6E3F;}`,
    stage: `
          <div class="bub" id="bb1" style="top:20px"><div class="who mono">TURN 1</div>"Summarise this inspection report."</div>
          <div class="bub" id="bb2" style="top:170px"><div class="who mono">TURN 2</div>"Now write me a script to do that."</div>
          <div class="opt" id="op1" style="top:20px"><div class="h warn">Route once per chat</div><div class="s">Fails on exactly that second sentence — and a judge will type exactly that sentence.</div></div>
          <div class="opt" id="op2" style="top:170px"><div class="h warn">Route every message</div><div class="s">Thrashes. Each switch pays a wake-up and throws away the working memory.</div></div>
          <div class="opt" id="op3" style="top:310px;border-color:#46BDB0"><div class="h gauge">Stay put, switch on evidence</div><div class="s">And let the system price the switch out loud.</div></div>
          <div id="calc" class="mono">considered <span class="em">coder-14b</span> (0.79) → stayed on general-14b<br/>because switching costs <span class="em">1.8 s wake-up</span> + <span class="em">4,200 tokens</span> of rebuild</div>`,
    anim: `
          tl.from(q("#bb1"), { opacity:0, x:-34, duration:.55 }, 2.0)
            .from(q("#bb2"), { opacity:0, x:-34, duration:.55 }, 6.5)
            .from(q("#op1"), { opacity:0, x:34, duration:.55 }, 14.0)
            .from(q("#op2"), { opacity:0, x:34, duration:.55 }, 22.5)
            .from(q("#op3"), { opacity:0, x:34, duration:.55 }, 33.0)
            .from(q("#calc"), { opacity:0, y:24, duration:.65, ease:"power3.out" }, 46.0);`,
  },

  /* ─────────────────────────────────────────────── 10 */
  {
    id: 's10-agent',
    title: 'The agent loop',
    css: `
.st{position:absolute;width:250px;height:104px;background:#0F1A1D;border:2px solid #233539;border-radius:6px;
  display:grid;place-items:center;font-family:Oswald,sans-serif;font-size:27px;text-transform:uppercase;letter-spacing:.04em;}
.arw{position:absolute;font-size:30px;color:#46BDB0;top:52px;}
#fail{position:absolute;left:250px;top:190px;width:760px;height:2px;background:#FF6E3F;}
#faillbl{position:absolute;left:520px;top:204px;font-size:21px;color:#FF6E3F;}
.split{position:absolute;top:300px;width:840px;padding:26px 30px;border-radius:7px;background:#0F1A1D;border:2px solid #233539;}
.split .h{font-family:Oswald,sans-serif;font-size:29px;text-transform:uppercase;letter-spacing:.04em;}
.split .s{font-size:21px;color:#9DB2B9;margin-top:12px;line-height:1.5;}`,
    stage: `
          <div class="st" id="a1" style="left:0;top:20px">Plan</div>
          <div class="arw" id="r1" style="left:262px">→</div>
          <div class="st" id="a2" style="left:300px;top:20px">Act</div>
          <div class="arw" id="r2" style="left:562px">→</div>
          <div class="st" id="a3" style="left:600px;top:20px">Observe</div>
          <div class="arw" id="r3" style="left:862px">→</div>
          <div class="st" id="a4" style="left:900px;top:20px">Verify</div>
          <div class="arw" id="r4" style="left:1162px">→</div>
          <div class="st" id="a5" style="left:1200px;top:20px">Deliver</div>
          <div id="fail"></div>
          <div id="faillbl" class="mono">← check failed? go round again</div>
          <div class="split" id="sp1" style="left:0"><div class="h flare">Quarantined model</div><div class="s">Reads the untrusted document. Has no tools at all. Can only return validated, structured data.</div></div>
          <div class="split" id="sp2" style="left:888px"><div class="h gauge">Privileged model</div><div class="s">Holds the tools. Never sees the raw document text, so a hidden instruction cannot reach it.</div></div>`,
    anim: `
          const steps=["#a1","#a2","#a3","#a4","#a5"], arws=["#r1","#r2","#r3","#r4"];
          steps.forEach((s,i)=>tl.from(q(s),{opacity:0,y:20,duration:.45,ease:"power3.out"},2.0+i*1.5));
          arws.forEach((s,i)=>tl.from(q(s),{opacity:0,duration:.3},2.8+i*1.5));
          tl.fromTo(q("#fail"), { scaleX:0 }, { scaleX:1, duration:.7, ease:"power3.inOut" }, 22.0)
            .from(q("#faillbl"), { opacity:0, duration:.5 }, 22.6)
            .from(q("#sp1"), { opacity:0, y:26, duration:.6 }, 42.0)
            .from(q("#sp2"), { opacity:0, y:26, duration:.6 }, 48.0);`,
  },

  /* ─────────────────────────────────────────────── 11 */
  {
    id: 's11-fanout',
    title: 'The card is a budget',
    css: `
#mbox{position:absolute;left:0;top:40px;width:420px;height:180px;background:#0F1A1D;border:2px solid #46BDB0;border-radius:7px;
  display:grid;place-items:center;text-align:center;font-size:26px;line-height:1.45;}
.ag{position:absolute;width:150px;height:80px;background:#0F1A1D;border:2px solid #FF6E3F;border-radius:5px;
  display:grid;place-items:center;font-size:21px;color:#FF6E3F;}
#vram{position:absolute;left:0;top:300px;width:1728px;height:70px;background:#131F22;border-radius:5px;overflow:hidden;}
#vw{position:absolute;left:0;top:0;bottom:0;width:648px;background:rgba(70,189,176,.42);display:grid;place-items:center;font-size:23px;}
#vk{position:absolute;left:648px;top:0;bottom:0;right:0;background:rgba(255,110,63,.2);display:grid;place-items:center;font-size:23px;color:#FF6E3F;transform-origin:left center;}
#thr{position:absolute;left:0;top:412px;font-size:27px;}
#gu{position:absolute;left:0;top:470px;font-size:27px;}
#free{position:absolute;left:0;top:540px;font-size:40px;font-family:Oswald,sans-serif;text-transform:uppercase;color:#FF6E3F;letter-spacing:.03em;}`,
    stage: `
          <div id="mbox">one 10B model<br/>loaded once · 6 GB</div>
          <div class="ag" id="g1" style="left:520px;top:20px">agent 1</div>
          <div class="ag" id="g2" style="left:700px;top:20px">agent 2</div>
          <div class="ag" id="g3" style="left:880px;top:20px">agent 3</div>
          <div class="ag" id="g4" style="left:520px;top:130px">agent 4</div>
          <div class="ag" id="g5" style="left:700px;top:130px">agent 5</div>
          <div class="ag" id="g6" style="left:880px;top:130px">agent 6</div>
          <div id="vram"><div id="vw" class="mono">weights · 6 GB · paid ONCE</div><div id="vk" class="mono">9.5 GB left = 8–15 agents</div></div>
          <div id="thr" class="mono">throughput <span class="gauge">↑ 1.5–3× at five concurrent</span> — not slower</div>
          <div id="gu" class="mono">GPU utilisation <span class="dim">30%</span> → <span class="gauge">85%</span></div>
          <div id="free">The model was already loaded — the parallelism was free</div>`,
    anim: `
          tl.from(q("#mbox"), { opacity:0, scale:.93, duration:.7, ease:"power3.out" }, 1.2)
            .from(q("#vram"), { opacity:0, duration:.6 }, 24.0)
            .fromTo(q("#vk"), { scaleX:0 }, { scaleX:1, duration:1.0, ease:"power3.out" }, 32.0)
            .from(q("#thr"), { opacity:0, x:-22, duration:.55 }, 21.0)
            .from(q("#gu"), { opacity:0, x:-22, duration:.55 }, 38.0);
          ["#g1","#g2","#g3","#g4","#g5","#g6"].forEach((s,i)=>
            tl.from(q(s),{opacity:0,scale:.7,duration:.42,ease:"back.out(1.9)"},44.0+i*.85));
          tl.from(q("#free"), { opacity:0, y:24, duration:.7, ease:"power3.out" }, 52.5);`,
  },

  /* ─────────────────────────────────────────────── 12 */
  {
    id: 's12-documents',
    title: 'Reading paper',
    css: `
.ln{position:absolute;left:0;width:1728px;height:110px;background:#0F1A1D;border:2px solid #233539;border-radius:6px;
  display:flex;align-items:center;padding:0 28px;gap:30px;}
.ln .ic{width:64px;height:64px;border-radius:5px;display:grid;place-items:center;font-size:26px;flex:none;}
.ln .nm{font-family:Oswald,sans-serif;font-size:29px;text-transform:uppercase;letter-spacing:.04em;width:330px;}
.ln .ds{font-size:22px;color:#9DB2B9;flex:1;}
#prov{position:absolute;left:0;top:496px;width:1728px;padding:24px 28px;background:#0B1618;border:2px solid #46BDB0;border-radius:7px;font-size:24px;}
#honest{position:absolute;left:0;top:590px;font-size:23px;color:#DFA82F;}`,
    stage: `
          <div class="ln" id="n1" style="top:10px"><span class="ic" style="background:rgba(70,189,176,.18);color:#46BDB0">◧</span><span class="nm">Born digital</span><span class="ds">Text is already inside the file. Straight through, no guessing.</span></div>
          <div class="ln" id="n2" style="top:130px"><span class="ic" style="background:rgba(70,189,176,.18);color:#46BDB0">▤</span><span class="nm">Scanned</span><span class="ds">A photograph of text. Layout-aware recognition, with a vision model re-reading the bad pages.</span></div>
          <div class="ln" id="n3" style="top:250px"><span class="ic" style="background:rgba(223,168,47,.18);color:#DFA82F">✎</span><span class="nm">Handwriting</span><span class="ds">Ordinary text recognition simply fails here. Goes straight to the vision model.</span></div>
          <div class="ln" id="n4" style="top:370px"><span class="ic" style="background:rgba(255,110,63,.18);color:#FF6E3F">⊞</span><span class="nm">Drawings</span><span class="ds">Title block, symbol detection, tag inventory — a lane of its own.</span></div>
          <div id="prov" class="mono">every extracted fact carries its page and its exact region — click it, the crop lights up</div>
          <div id="honest" class="mono">we do NOT reconstruct full diagram connectivity — that is still an open research problem</div>`,
    anim: `
          ["#n1","#n2","#n3","#n4"].forEach((s,i)=>tl.from(q(s),{opacity:0,x:-40,duration:.5,ease:"power3.out"},7.0+i*3.4));
          tl.from(q("#prov"), { opacity:0, y:22, duration:.6 }, 33.0)
            .from(q("#honest"), { opacity:0, duration:.6 }, 47.0);`,
  },

  /* ─────────────────────────────────────────────── 13 */
  {
    id: 's13-deliverables',
    title: 'Files, not chat',
    css: `
#bad{position:absolute;left:0;top:16px;width:1728px;padding:22px 28px;border:2px solid #FF6E3F;border-radius:7px;
  background:rgba(255,110,63,.07);font-size:26px;color:#FF6E3F;}
#badx{position:absolute;left:0;top:38px;width:1728px;height:3px;background:#FF6E3F;transform-origin:left center;}
.pp{position:absolute;top:150px;width:388px;height:170px;background:#0F1A1D;border:2px solid #233539;border-radius:7px;padding:22px 24px;}
.pp .h{font-family:Oswald,sans-serif;font-size:26px;text-transform:uppercase;letter-spacing:.04em;}
.pp .s{font-size:20px;color:#9DB2B9;margin-top:12px;line-height:1.45;}
.pa{position:absolute;top:218px;font-size:30px;color:#46BDB0;}
#foot{position:absolute;left:0;top:368px;width:1728px;padding:26px 30px;background:#0B1618;border:2px solid #46BDB0;border-radius:7px;
  font-size:23px;line-height:1.72;}
#foot .m{color:#8FA4AB;}`,
    stage: `
          <div id="bad" class="mono">the model writes the .docx file directly</div>
          <div id="badx"></div>
          <div class="pp" id="q1" style="left:0"><div class="h">Model</div><div class="s">Fills in a structured form. Nothing else.</div></div>
          <div class="pa" id="ar1" style="left:398px">→</div>
          <div class="pp" id="q2" style="left:446px"><div class="h gauge">Schema check</div><div class="s">Wrong shape? It never reaches the renderer.</div></div>
          <div class="pa" id="ar2" style="left:844px">→</div>
          <div class="pp" id="q3" style="left:892px"><div class="h">Template</div><div class="s">Ordinary, boring, reliable code fills the company template.</div></div>
          <div class="pa" id="ar3" style="left:1290px">→</div>
          <div class="pp" id="q4" style="left:1338px"><div class="h flare">Real file</div><div class="s">.docx · .xlsx with live formulas · tested code.</div></div>
          <div id="foot" class="mono">
            <div id="fl1">model: general-30b-a3b · Q4 &nbsp;<span class="m">|</span>&nbsp; sources: OISD-118 rev.5, INSP-2291</div>
            <div id="fl2">sha256 a91f… <span class="m">→ linked to the audit record</span></div>
            <div id="fl3" class="flare">AI-DRAFTED — REQUIRES HUMAN APPROVAL</div>
          </div>`,
    anim: `
          tl.from(q("#bad"), { opacity:0, duration:.5 }, 2.0)
            .fromTo(q("#badx"), { scaleX:0 }, { scaleX:1, duration:.5, ease:"power3.inOut" }, 5.0)
            .to(q("#bad"), { opacity:.45, duration:.5 }, 5.2);
          [["#q1",13.0],["#ar1",15.0],["#q2",16.0],["#ar2",18.5],["#q3",19.5],["#ar3",22.5],["#q4",23.5]]
            .forEach(([s,t])=>tl.from(q(s),{opacity:0,y:20,duration:.45,ease:"power3.out"},t));
          tl.from(q("#fl1"), { opacity:0, x:-20, duration:.5 }, 43.0)
            .from(q("#fl2"), { opacity:0, x:-20, duration:.5 }, 45.5)
            .from(q("#fl3"), { opacity:0, scale:.96, duration:.6, ease:"back.out(1.5)" }, 48.5);`,
  },

  /* ─────────────────────────────────────────────── 14 */
  {
    id: 's14-sovereign',
    title: 'Proving the air gap',
    css: `
.ly{position:absolute;left:0;width:1080px;height:82px;background:#0F1A1D;border:2px solid #233539;border-radius:5px;
  display:flex;align-items:center;padding:0 26px;gap:24px;}
.ly .k{font-size:19px;color:#FF6E3F;letter-spacing:.13em;width:74px;flex:none;}
.ly .nm{font-family:Oswald,sans-serif;font-size:27px;text-transform:uppercase;letter-spacing:.04em;width:250px;}
.ly .ds{font-size:21px;color:#9DB2B9;}
#mon{position:absolute;left:1128px;top:8px;width:600px;height:436px;background:#050D0C;border:2px solid #1D3330;border-radius:7px;
  padding:22px 24px;font-size:21px;line-height:1.85;color:#B9D6D0;}
#mon .ok{color:#4FD1C0;} #mon .bad{color:#FF6E3F;} #mon .dm{color:#7FA39C;}
#pkt{position:absolute;left:1160px;top:330px;width:130px;height:34px;background:#FF6E3F;border-radius:4px;
  display:grid;place-items:center;font-size:16px;color:#08100F;}
#zero{position:absolute;left:1128px;top:462px;width:600px;font-size:24px;color:#4FD1C0;}
#why{position:absolute;left:0;top:512px;width:1080px;font-size:26px;color:#FF6E3F;line-height:1.45;}`,
    stage: `
          <div class="ly" id="y1" style="top:8px"><span class="k mono">L1</span><span class="nm">Design</span><span class="ds">nothing is built to call out</span></div>
          <div class="ly" id="y2" style="top:104px"><span class="k mono">L2</span><span class="nm">Enforcement</span><span class="ds">the OS refuses outbound traffic</span></div>
          <div class="ly" id="y3" style="top:200px"><span class="k mono">L3</span><span class="nm">Observation</span><span class="ds">a live panel shows every attempt</span></div>
          <div class="ly" id="y4" style="top:296px;border-color:#FF6E3F"><span class="k mono">L4</span><span class="nm flare">Adversarial</span><span class="ds">we attack it on purpose</span></div>
          <div class="ly" id="y5" style="top:392px"><span class="k mono">L5</span><span class="nm">Attestation</span><span class="ds">a signed report they take away</span></div>
          <div id="mon" class="mono">
            <div class="dm">egress monitor · session 7f2a</div>
            <div id="ml1">14:22:08 127.0.0.1:8000 <span class="ok">ALLOW</span> <span class="dm">ui → orchestrator</span></div>
            <div id="ml2">14:22:11 127.0.0.1:8080 <span class="ok">ALLOW</span> <span class="dm">→ model server</span></div>
            <div id="ml3">14:23:47 8.8.8.8:53&nbsp;&nbsp;&nbsp;&nbsp; <span class="bad">DROP</span> <span class="dm">← canary</span></div>
            <div id="ml4" class="bad">audit: EGRESS_ATTEMPT_BLOCKED recorded</div>
          </div>
          <div id="pkt" class="mono">canary</div>
          <div id="zero" class="mono">external allowed: 0 &nbsp; blocked: 1</div>
          <div id="why">Silence proves nothing until you have shown the alarm works.</div>`,
    anim: `
          ["#y1","#y2","#y3","#y4","#y5"].forEach((s,i)=>tl.from(q(s),{opacity:0,x:-38,duration:.5,ease:"power3.out"},9.0+i*2.6));
          tl.from(q("#mon"), { opacity:0, duration:.6 }, 12.0)
            .from(q("#ml1"), { opacity:0, duration:.4 }, 26.0)
            .from(q("#ml2"), { opacity:0, duration:.4 }, 27.2)
            .set(q("#pkt"), { opacity:1 }, 36.0)
            .fromTo(q("#pkt"), { x:0, opacity:0 }, { x:0, opacity:1, duration:.3 }, 36.0)
            .to(q("#pkt"), { x:330, duration:.7, ease:"power2.in" }, 36.4)
            .to(q("#pkt"), { x:300, opacity:0, duration:.25, ease:"power3.out" }, 37.1)
            .from(q("#ml3"), { opacity:0, duration:.35 }, 37.3)
            .from(q("#ml4"), { opacity:0, duration:.35 }, 37.9)
            .fromTo(q("#mon"), { borderColor:"#1D3330" }, { borderColor:"#FF6E3F", duration:.3, yoyo:true, repeat:3 }, 37.3)
            .from(q("#zero"), { opacity:0, duration:.5 }, 39.5)
            .from(q("#why"), { opacity:0, y:22, duration:.7, ease:"power3.out" }, 42.5);`,
  },

  /* ─────────────────────────────────────────────── 15 */
  {
    id: 's15-stack',
    title: 'The stack, and what wins',
    css: `
.sk{position:absolute;left:0;width:840px;height:66px;background:#0F1A1D;border:2px solid #233539;border-radius:5px;
  display:flex;align-items:center;padding:0 24px;gap:20px;font-size:21px;}
.sk .t{font-family:Oswald,sans-serif;font-size:23px;text-transform:uppercase;letter-spacing:.05em;color:#46BDB0;width:180px;flex:none;}
.win{position:absolute;left:900px;width:828px;padding:24px 28px;background:#0F1A1D;border:2px solid #FF6E3F;border-radius:7px;}
.win .h{font-family:Oswald,sans-serif;font-size:29px;text-transform:uppercase;letter-spacing:.04em;color:#FF6E3F;}
.win .s{font-size:21px;color:#9DB2B9;margin-top:10px;line-height:1.45;}
#last{position:absolute;left:0;top:534px;width:1728px;font-family:Oswald,sans-serif;font-size:52px;
  text-transform:uppercase;letter-spacing:.03em;color:#E1EAEB;}`,
    stage: `
          <div class="sk" id="k1" style="top:6px"><span class="t">Front end</span><span>React · every asset self-hosted</span></div>
          <div class="sk" id="k2" style="top:84px"><span class="t">Back end</span><span>Python · FastAPI · agent loop</span></div>
          <div class="sk" id="k3" style="top:162px"><span class="t">Documents</span><span>Docling · vision fallback · python-docx</span></div>
          <div class="sk" id="k4" style="top:240px"><span class="t">Data</span><span>Postgres · hybrid vector search</span></div>
          <div class="sk" id="k5" style="top:318px"><span class="t">Models</span><span>open weights · one standard interface</span></div>
          <div class="sk" id="k6" style="top:396px"><span class="t">Install</span><span>offline, from a folder of packages</span></div>
          <div class="win" id="w1" style="top:6px"><div class="h">Routing you can open</div><div class="s">Not a dropdown. A decision with scores, on screen.</div></div>
          <div class="win" id="w2" style="top:170px"><div class="h">A signed file</div><div class="s">Not a chat bubble. Opened in LibreOffice, on stage.</div></div>
          <div class="win" id="w3" style="top:334px"><div class="h">A blocked call</div><div class="s">Proved live, not asserted on a slide.</div></div>
          <div id="last">Build the proof first — the assistant is just the evidence</div>`,
    anim: `
          ["#k1","#k2","#k3","#k4","#k5","#k6"].forEach((s,i)=>tl.from(q(s),{opacity:0,x:-34,duration:.45,ease:"power3.out"},2.5+i*2.6));
          tl.from(q("#w1"), { opacity:0, x:34, duration:.55 }, 34.0)
            .from(q("#w2"), { opacity:0, x:34, duration:.55 }, 39.5)
            .from(q("#w3"), { opacity:0, x:34, duration:.55 }, 45.0)
            .from(q("#last"), { opacity:0, y:26, duration:.8, ease:"power3.out" }, 52.0);`,
  },
];

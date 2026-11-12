/* =========================================================
   Pi Run: π runs along the number line.

   One button. Tap to jump, hold for a higher jump, tap again in the air
   for a second jump. Dark signs end the run, gold circles are collected,
   and every so often a gold gate shows the next digit of π. Pass through
   each gate and the run also collects 3.14159... in order.

   The course is fair by construction. Every pattern is laid out around
   one known way through it (a jump started at a known point), and the
   next pattern never starts before π has landed and had the reaction
   time that pattern needs. See "THE COURSE" below.

   The digits are computed here with BigInt (Machin's formula), the same
   way Pi Flight does it.
   ========================================================= */
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const g = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ----- The view fills the screen. Logical units: at least 520 wide and 560 tall. -----
  let W = 520, H = 560, scale = 1, groundY = 420, PX = 104, safeT = 0, safeL = 0, safeB = 0;
  function resize() {
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    scale = Math.min(vw / 520, vh / 560);
    W = vw / scale; H = vh / scale;
    groundY = Math.round(H - clamp(H * 0.36 - 60, 120, 360));
    PX = clamp(W * 0.2, 96, 180);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = vw + "px"; canvas.style.height = vh + "px";
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    try {
      const cs = getComputedStyle($("safe"));
      safeT = (parseFloat(cs.paddingTop) || 0) / scale;
      safeL = (parseFloat(cs.paddingLeft) || 0) / scale;
      safeB = (parseFloat(cs.paddingBottom) || 0) / scale;
    } catch (e) { safeT = safeL = safeB = 0; }
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => { resize(); setTimeout(resize, 300); });
  resize();

  // ----- Colours follow the home page, in light or dark -----
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let C = {};
  function theme() {
    C = darkQuery.matches
      ? { paper: "#14110c", ink: "#f3ead8", gold: "#e8c87a", rgb: "232,200,122", inkRgb: "243,234,216" }
      : { paper: "#fffdf8", ink: "#3b3226", gold: "#8a6d3b", rgb: "138,109,59", inkRgb: "59,50,38" };
  }
  theme();
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", theme);
  const FONT = '"Crimson Pro", Georgia, serif';
  try { if (document.fonts && document.fonts.load) document.fonts.load('600 20px "Crimson Pro"'); } catch (e) {}

  // ====================================================
  // THE DIGITS OF π (as in Pi Flight)
  // ====================================================
  const FIRST_100 = "1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";
  function computePi(n) {
    if (typeof BigInt !== "function") return FIRST_100;
    try {
      const B = BigInt, one = B(10) ** B(n + 12);
      const arctanInv = (x) => {
        const xx = B(x * x);
        let term = one / B(x), sum = term, k = 1, sign = -1;
        while (term > B(0)) {
          term = term / xx; k += 2;
          sum = sign < 0 ? sum - term / B(k) : sum + term / B(k);
          sign = -sign;
        }
        return sum;
      };
      // Machin: π = 16 arctan(1/5) − 4 arctan(1/239)
      const pi = B(16) * arctanInv(5) - B(4) * arctanInv(239);
      const s = pi.toString().slice(1, n + 1);
      return s.slice(0, 100) === FIRST_100 ? s : FIRST_100;   // never show a wrong digit
    } catch (e) { return FIRST_100; }
  }
  const PI_STR = "3" + computePi(2000);          // the gates go 3, 1, 4, 1, 5, 9, ...
  const digitAt = (i) => +PI_STR[i % PI_STR.length];
  const piText = (n) => n <= 0 ? "" : "3" + (n > 1 ? "." + PI_STR.slice(1, n) : "");

  // ====================================================
  // SAVE
  // ====================================================
  const SAVE_KEY = "pi-run-v1";
  let save = { best: 0, circles: 0, streak: 0, look: 0, mute: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  const num = (x) => { x = +x; return isFinite(x) && x > 0 ? x : 0; };      // a damaged save never shows nonsense
  save = { best: Math.round(num(save.best) * 10) / 10, circles: Math.floor(num(save.circles)), streak: Math.floor(num(save.streak)), look: Math.floor(num(save.look)), mute: save.mute === true };
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // Looks for π, unlocked by the total number of circles ever collected.
  const LOOKS = [
    { at: 0,   name: "Gold" },
    { at: 50,  name: "Ink" },
    { at: 200, name: "Sunrise" },
    { at: 500, name: "Spectrum" },
  ];
  const unlockedCount = (circles) => { let k = 0; for (const l of LOOKS) if (circles >= l.at) k++; return k; };
  if (!(save.look >= 0 && save.look < unlockedCount(save.circles))) save.look = 0;

  // ====================================================
  // AUDIO: a few synthesised voices
  // ====================================================
  let ac = null, master = null, noiseBuf = null;
  function audioInit() {
    if (ac) { if (ac.state !== "running") { try { ac.resume(); } catch (e) {} } return; }
    try {
      if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch (e) {} }
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ac.createGain(); master.gain.value = save.mute ? 0 : 0.8;
      master.connect(comp); comp.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  function osc(type, f0, f1, dur, vol, at, attack) {
    if (!ac || save.mute) return;
    try {
      const t = ac.currentTime + (at || 0), s = ac.createOscillator(), v = ac.createGain();
      s.type = type; s.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) s.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      v.gain.setValueAtTime(0.0001, t);
      v.gain.linearRampToValueAtTime(vol, t + (attack || 0.006));
      v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(v); v.connect(master); s.start(t); s.stop(t + dur + 0.03);
    } catch (e) {}
  }
  function noise(dur, vol, f0, f1, type) {
    if (!ac || save.mute) return;
    try {
      const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
      s.buffer = noiseBuf; f.type = type || "lowpass";
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(v); v.connect(master); s.start(t); s.stop(t + dur + 0.03);
    } catch (e) {}
  }
  // Ten notes of a pentatonic scale, one per digit, so π plays as a tune.
  const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
  const sfx = {
    jump() { osc("sine", 300, 520, 0.13, 0.11, 0, 0.012); },
    jump2() { osc("sine", 440, 760, 0.13, 0.1, 0, 0.012); },
    land() { noise(0.05, 0.16, 2600, 900, "bandpass"); osc("sine", 140, 90, 0.05, 0.1); },
    circle(n) { const f = 1568 * Math.pow(1.0595, Math.min(n, 7)); osc("sine", f, f * 1.33, 0.12, 0.08); },
    digit(d) { const f = SCALE[d]; osc("triangle", f, f, 0.55, 0.2); osc("sine", f * 2, f * 2, 0.32, 0.07); },
    miss() { osc("triangle", 330, 196, 0.28, 0.1); },
    mile() { osc("sine", 784, 784, 0.18, 0.07); osc("sine", 1175, 1175, 0.22, 0.06, 0.09); },
    crash() { noise(0.45, 0.6, 1600, 90); osc("sine", 150, 36, 0.6, 0.7); osc("triangle", 330, 98, 0.5, 0.16, 0.04); },
    best() { [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => osc("triangle", f, f, 0.35, 0.16, 0.3 + k * 0.12)); },
  };

  // ====================================================
  // π ITSELF: the site's mark, as a path
  // ====================================================
  const MARK_D = "M 0 79 L 0 158 90.585 158 L 181.171 158 180.702 323.750 C 180.189 505.585, 179.893 515.439, 173.921 550 C 167.099 589.473, 148.234 639.092, 125.705 676.819 C 119.026 688.003, 103.645 708.849, 85.085 731.871 C 78.713 739.775, 67.103 754.175, 59.284 763.871 C 51.465 773.567, 44.265 783.006, 43.284 784.846 L 41.500 788.192 46 792.162 C 67.779 811.375, 160.219 887, 161.926 887 C 164.406 887, 203.422 839.570, 235.136 798 C 280.230 738.893, 313.314 663.477, 329.454 583 C 337.392 543.422, 337.821 531.897, 338.991 327 C 339.513 235.425, 339.954 160.160, 339.971 159.744 C 339.987 159.329, 378.362 159.104, 425.250 159.244 L 510.500 159.500 510.587 390.500 C 510.673 618.837, 511.198 683.440, 513.103 700 C 523.207 787.861, 582.955 856.593, 668.225 878.447 C 696.545 885.706, 733.582 885.714, 766.500 878.469 C 820.969 866.481, 874.399 823.906, 900.740 771.500 C 914.994 743.143, 918.458 728.600, 928.003 657.046 C 933.820 613.443, 933.694 615.388, 930.750 614.663 C 922.311 612.583, 789.603 595, 782.351 595 L 777.142 595 776.074 600.250 C 775.486 603.138, 772.547 622.825, 769.543 644 C 762.332 694.830, 759.720 703.795, 749.503 712.788 C 743.401 718.160, 731.401 723.939, 723.565 725.282 C 705.044 728.454, 684.513 716.921, 675 698.001 L 671 690.044 671 424.522 L 671 159 708.835 159 C 729.645 159, 770.370 158.701, 799.335 158.336 L 852 157.673 852 78.836 L 852 0 426 0 L 0 0 0 79";
  const MARK = new Path2D(MARK_D);
  const MARK_W = 933, MARK_H = 887, PI_SIZE = 40, PI_TALL = PI_SIZE * MARK_H / MARK_W;
  function markFill(look, t) {
    if (look === 1) return C.ink;
    if (look === 2) { const gr = g.createLinearGradient(0, 0, MARK_W, MARK_H); gr.addColorStop(0, "#f7b267"); gr.addColorStop(0.55, "#f25c54"); gr.addColorStop(1, "#7d4e9f"); return gr; }
    if (look === 3) { const gr = g.createLinearGradient(0, 0, MARK_W, 0); for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, "hsl(" + ((k * 60 + t * 80) % 360) + ",75%,55%)"); return gr; }
    return C.gold;
  }
  // drawn standing on (x, y): the squash is about the feet, the spin about the middle
  function drawMark(x, y, angle, look, t, sx, sy) {
    g.save();
    g.translate(x, y); g.scale(sx, sy); g.translate(0, -PI_TALL / 2); g.rotate(angle);
    g.scale(PI_SIZE / MARK_W, PI_SIZE / MARK_W); g.translate(-MARK_W / 2, -MARK_H / 2);
    g.fillStyle = markFill(look, t);
    g.fill(MARK, "evenodd");
    g.restore();
  }

  // ====================================================
  // PHYSICS
  // ====================================================
  const UNIT = 80;                 // one unit of the number line, in logical pixels
  const G = 2400, V0 = 760, V1 = 680, CUT = 220, MIN_HOLD = 0.07, COYOTE = 0.08, BUFFER = 0.12;
  const T_APEX = V0 / G;                         // time to the top of a full jump
  const T_FULL = 2 * V0 / G;                     // air time of a full jump
  const H_FULL = V0 * V0 / (2 * G);              // its height
  const T_APEX2 = T_APEX + V1 / G;               // top of a double jump (second jump at the top of the first)
  const H_DBL = H_FULL + V1 * V1 / (2 * G);
  const T_DBL = T_APEX2 + Math.sqrt(2 * H_DBL / G);
  const HIT_W = 11, HIT_LO = 3, HIT_HI = 30;     // π's hit box: narrower than the drawing
  const speedAt = (x) => 250 + 170 * (1 - Math.exp(-Math.max(0, x) / UNIT / 300));

  // a small seeded random source, so a test can replay a course
  let rngState = 1;
  function rnd() {
    rngState = (rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ====================================================
  // STATE
  // ====================================================
  let state = "ready";            // ready | play | paused | dead
  let time = 0, deadFor = 0, shake = 0, manual = false;
  let P = {};
  let hazards = [], gaps = [], circles = [], gates = [], groups = [], plan = [], hints = [];
  let puffs = [], pops = [];
  let freeX = 0, nextGateU = 0, gateCount = 0, lastKinds = [], seen = {};
  let streak = 0, runBestStreak = 0, runCircles = 0, combo = 0, comboT = 0, nextMile = 50;
  let cause = "", newBest = false, bestAtStart = 0, dustT = 0, overShown = false;
  const symbols = [];             // pale maths drifting in the background
  for (let k = 0; k < 10; k++) symbols.push({ ch: "∑∫√∞θφ∂≈Δλ"[k], x: Math.random() * 1400, y: 0.12 + Math.random() * 0.7, s: 40 + Math.random() * 60, v: 0.1 + Math.random() * 0.2, a: Math.random() * 0.6 - 0.3 });

  function newPlayer() {
    return { x: 0, h: 0, vy: 0, ground: true, jumps: 0, held: false, jt: 9, coy: 0, buf: 0, fell: false,
             sx: 1, sy: 1, spin: 0, tilt: 0, runPh: 0, kvx: 0 };
  }
  let finalD = -1, resumeHold = false;
  const dist = () => finalD >= 0 ? finalD : Math.max(0, P.x / UNIT);

  // ====================================================
  // THE COURSE
  //
  // Each pattern is built at x0, the point where its one known way through
  // begins, at the speed v the run has there:
  //   hop, full   a jump started at x0, so the sign sits under the top of
  //               the arc, v * T_APEX further on. π lands at x0 + v * T_FULL.
  //   double      a jump at x0 and a second one at its top. The sign sits
  //               under the second top. π lands at x0 + v * T_DBL.
  //   under       nothing to do but stay on the line from x0 to the end.
  // Each pattern also names the reaction time it needs. The next pattern's
  // x0 is never closer than (landing point + v * reaction time), so no two
  // patterns ever ask for conflicting things.
  // ====================================================
  const KINDS = {
    minus:    { from: 0,   weight: 3,   react: 0.22, need: "hop",    name: "a minus sign" },
    plus:     { from: 6,   weight: 3,   react: 0.22, need: "hop",    name: "a plus sign" },
    integral: { from: 16,  weight: 3,   react: 0.26, need: "full",   name: "an integral" },
    pair:     { from: 26,  weight: 2,   react: 0.26, need: "full",   name: "a minus sign" },
    infinity: { from: 32,  weight: 2,   react: 0.22, need: "under",  name: "infinity" },
    brackets: { from: 46,  weight: 2.5, react: 0.26, need: "full",   name: "the brackets" },
    gap:      { from: 70,  weight: 2.5, react: 0.28, need: "full",   name: "" },
    sigmas:   { from: 90,  weight: 1.5, react: 0.22, need: "under",  name: "a sigma" },
    brace:    { from: 140, weight: 1.5, react: 0.36, need: "double", name: "a curly brace" },
    widegap:  { from: 190, weight: 1.5, react: 0.36, need: "double", name: "" },
  };
  const HINTS = { integral: "hold to jump higher", brackets: "hold to jump higher", gap: "hold to jump across", infinity: "stay on the line", sigmas: "stay on the line", brace: "jump, then jump again", widegap: "jump, then jump again" };
  const GATE_REACT = { low: 0.2, mid: 0.26, high: 0.36 };
  const GATE_BAND = { low: [0, 62], mid: [66, 160], high: [146, 250] };   // where π's middle must be

  function addHazard(kind, cx, w, y0, y1, draw) {
    const hz = { kind, cx, x0: cx - w / 2, x1: cx + w / 2, y0, y1, draw: draw || kind };
    hazards.push(hz); return hz;
  }
  function addCircle(x, h) { circles.push({ x, h, taken: false }); }
  function arcCircles(x0, v, ts) {             // circles along the full jump that starts at x0
    for (const t of ts) addCircle(x0 + v * t, V0 * t - 0.5 * G * t * t + 17);
  }
  function build(kind, x0, v) {
    const K = KINDS[kind];
    let cx = x0 + v * T_APEX, len = v * T_FULL, top = 0, gx0, gx1;
    const some = rnd() < 0.65;
    if (kind === "minus") {
      addHazard(kind, cx, 26, 0, 18); gx0 = cx - 13; gx1 = cx + 13; top = 18;
      if (some) addCircle(cx, 62);
    } else if (kind === "plus") {
      addHazard(kind, cx, 22, 0, 30); gx0 = cx - 11; gx1 = cx + 11; top = 30;
      if (some) addCircle(cx, 74);
    } else if (kind === "pair") {
      addHazard("minus", cx - 27, 22, 0, 18); addHazard("minus", cx + 27, 22, 0, 18);
      gx0 = cx - 38; gx1 = cx + 38; top = 18;
      if (some) arcCircles(x0, v, [T_APEX - 0.11, T_APEX, T_APEX + 0.11]);
    } else if (kind === "integral") {
      addHazard(kind, cx, 20, 0, 72); gx0 = cx - 10; gx1 = cx + 10; top = 72;
      if (some) arcCircles(x0, v, [T_APEX]);
    } else if (kind === "brackets") {
      addHazard(kind, cx, 44, 0, 60); gx0 = cx - 22; gx1 = cx + 22; top = 60;
      if (some) arcCircles(x0, v, [T_APEX - 0.1, T_APEX + 0.1]);
    } else if (kind === "gap") {
      const w = Math.max(70, v * 0.3);
      gaps.push({ x0: cx - w / 2, x1: cx + w / 2 }); gx0 = cx - w / 2; gx1 = cx + w / 2;
      if (some) arcCircles(x0, v, [T_APEX - 0.13, T_APEX, T_APEX + 0.13]);
    } else if (kind === "infinity") {
      cx = x0 + 12 + HIT_W + 26; len = 24 + 2 * HIT_W + 52;
      addHazard(kind, cx, 52, 48, 78); gx0 = cx - 26; gx1 = cx + 26; top = 78;
      if (some) addCircle(cx, 17);
    } else if (kind === "sigmas") {
      const n = 2 + (rnd() < 0.5 ? 1 : 0), gapW = 78;
      const first = x0 + 12 + HIT_W + 14;
      for (let k = 0; k < n; k++) { addHazard("sigma", first + k * gapW, 28, 48, 80); if (some) addCircle(first + k * gapW, 17); }
      gx0 = first - 14; gx1 = first + (n - 1) * gapW + 14; cx = (gx0 + gx1) / 2; top = 80;
      len = gx1 - x0 + HIT_W + 12;
    } else if (kind === "brace") {
      cx = x0 + v * T_APEX2; len = v * T_DBL;
      addHazard(kind, cx, 24, 0, 140); gx0 = cx - 12; gx1 = cx + 12; top = 140;
      if (some) { addCircle(x0 + v * T_APEX, H_FULL + 17); addCircle(cx, H_DBL + 17); }
    } else if (kind === "widegap") {
      const w = v * 0.62;
      cx = x0 + v * T_DBL / 2; len = v * T_DBL;
      gaps.push({ x0: cx - w / 2, x1: cx + w / 2, wide: true }); gx0 = cx - w / 2; gx1 = cx + w / 2;
      if (some) { addCircle(x0 + v * T_APEX, H_FULL + 17); addCircle(x0 + v * T_APEX2, H_DBL + 17); }
    }
    groups.push({ kind, need: K.need, cx, x0: gx0, x1: gx1, top, jumpX: x0 });
    return len;
  }
  function buildGate(type, x0, v) {
    let gx, len;
    if (type === "low") { gx = x0 + v * 0.12; len = v * 0.24; }
    else if (type === "mid") { gx = x0 + v * T_APEX; len = v * T_FULL; }
    else { gx = x0 + v * T_APEX2; len = v * T_DBL; }
    const band = GATE_BAND[type];
    gates.push({ x: gx, type, lo: band[0], hi: band[1], done: 0, flash: 0 });
    groups.push({ kind: "gate", need: type === "low" ? "under" : type === "mid" ? "full" : "double", cx: gx, x0: gx, x1: gx, top: 0, gate: type, jumpX: x0 });
    return len;
  }
  function pickKind(u) {
    let total = 0; const pool = [];
    const n = lastKinds.length;
    for (const k in KINDS) {
      if (u < KINDS[k].from) continue;
      if (n >= 2 && lastKinds[n - 1] === k && lastKinds[n - 2] === k) continue;   // never three of a kind in a row
      // the newest signs come up a little more often, the oldest a little less
      const w = KINDS[k].weight * (u - KINDS[k].from < 40 ? 1.6 : 1);
      pool.push([k, w]); total += w;
    }
    let r = rnd() * total;
    for (const [k, w] of pool) { r -= w; if (r <= 0) return k; }
    return pool[0][0];
  }
  function generate() {
    const until = P.x - PX + W + 500;
    let guard = 0;
    while (freeX < until && guard++ < 60) {
      const u = freeX / UNIT, v = speedAt(freeX);
      const slack = lerp(0.95, 0.32, clamp(u / 350, 0, 1));
      let kind, react, isGate = false;
      if (u >= nextGateU) {
        isGate = true;
        const r = rnd();
        kind = gateCount < 2 ? "low" : gateCount < 5 ? (r < 0.5 ? "low" : "mid") : (r < 0.2 ? "low" : r < 0.6 ? "mid" : "high");
        react = GATE_REACT[kind];
      } else {
        kind = pickKind(u); react = KINDS[kind].react;
      }
      let extra = 0.05 + rnd() * slack;
      let fresh = false;
      if (!isGate && !seen[kind]) { seen[kind] = true; extra += 0.5; fresh = true; }   // a new sign gets room to be read
      const x0 = freeX + v * (react + extra);
      // a line of circles on the way, when there is room for one
      if (extra > 0.5 && rnd() < 0.6) { const n = Math.min(4, Math.floor(v * (extra - 0.2) / 38)); for (let k = 0; k < n; k++) addCircle(x0 - 20 - k * 38, 17); }
      const v0 = speedAt(x0);
      const len = isGate ? buildGate(kind, x0, v0) : build(kind, x0, v0);
      // a few words over a sign the first time it comes up, until the player has run a fair way
      if (fresh && bestAtStart < 150 && HINTS[kind]) { const q = groups[groups.length - 1]; hints.push({ x: q.cx, h: Math.max(q.top, 40) + 34, text: HINTS[kind], until: q.x1 }); }
      plan.push({ kind: isGate ? "gate-" + kind : kind, from: freeX, x0, len, react, v: v0 });
      if (isGate) { gateCount++; nextGateU = x0 / UNIT + 11 + rnd() * 7; }
      else lastKinds.push(kind);
      if (lastKinds.length > 4) lastKinds.shift();
      freeX = x0 + len;
    }
    // drop what is far behind
    const back = P.x - PX - 300;
    while (hazards.length && hazards[0].x1 < back) hazards.shift();
    while (gaps.length && gaps[0].x1 < back) gaps.shift();
    while (circles.length && circles[0].x < back) circles.shift();
    while (gates.length && gates[0].x < back) gates.shift();
    while (groups.length && groups[0].x1 < back) groups.shift();
    while (hints.length && hints[0].x < back) hints.shift();
    if (plan.length > 400) plan.splice(0, plan.length - 400);
  }
  const gapAt = (x) => { for (const gp of gaps) if (x > gp.x0 + 6 && x < gp.x1 - 6) return gp; return null; };
  const inGapDraw = (x) => { for (const gp of gaps) if (x > gp.x0 - 1 && x < gp.x1 + 1) return true; return false; };

  // ====================================================
  // RUN CONTROL
  // ====================================================
  function clearWorld() {
    hazards = []; gaps = []; circles = []; gates = []; groups = []; plan = []; hints = []; puffs = []; pops = [];
    lastKinds = []; seen = {}; gateCount = 0;
    streak = 0; runBestStreak = 0; runCircles = 0; combo = 0; comboT = 0; nextMile = 50;
    cause = ""; newBest = false; finalD = -1; resumeHold = false; deadFor = 0; shake = 0; overShown = false;
    P = newPlayer();
  }
  function showReady() {
    clearWorld(); state = "ready";
    $("over").hidden = true; $("pause").hidden = true; $("start").hidden = false; $("btn-pause").hidden = true;
    const bits = [];
    if (save.best > 0) bits.push("Best run: " + save.best.toFixed(1) + " units.");
    if (save.streak > 0) bits.push("Best digit streak: " + save.streak + ".");
    if (save.circles > 0) bits.push("Circles: " + save.circles + ".");
    $("start-best").textContent = bits.join(" ");
    renderLooks();
  }
  function startRun(seed) {
    clearWorld();
    rngState = (seed === undefined ? (Math.random() * 4294967296) : seed) | 0;
    state = "play"; bestAtStart = save.best;
    freeX = 4.5 * UNIT; nextGateU = 9;
    $("start").hidden = true; $("over").hidden = true; $("pause").hidden = true; $("btn-pause").hidden = false;
    generate();
  }
  function setPaused(on) {
    if (on && state === "play") { state = "paused"; $("pause").hidden = false; persist(); }
    else if (!on && state === "paused") { state = "play"; $("pause").hidden = true; last = performance.now(); }
  }
  function die(why) {
    if (state !== "play") return;
    state = "dead"; deadFor = 0; cause = why; shake = why === "fall" ? 7 : 12;
    P.held = false; P.buf = 0;
    if (why !== "fall") { P.vy = 380; P.kvx = -150; P.ground = false; }
    sfx.crash();
    const cy = Math.max(0, P.h) + 17;
    for (let k = 0; k < 20; k++) { const a = rnd2() * TAU, sp = 60 + rnd2() * 220; puffs.push({ x: P.x, h: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + rnd2() * 0.5, r: 2 + rnd2() * 3 }); }
    const d = Math.round(dist() * 10) / 10;
    finalD = d;
    newBest = d > save.best;
    if (newBest) save.best = d;
    if (runBestStreak > save.streak) save.streak = runBestStreak;
    persist();
    $("btn-pause").hidden = true;
  }
  const rnd2 = Math.random;        // for effects only, so they never disturb the course
  const CAUSES = {
    minus: "Tripped on a minus sign.", plus: "Stubbed a toe on a plus sign.", integral: "Ran into an integral.",
    brackets: "Got caught in the brackets.", brace: "Ran into a curly brace.", infinity: "Bumped into infinity.",
    sigma: "Bumped into a sigma.", fall: "Fell off the number line.",
  };
  function showOver() {
    overShown = true;
    const d = Math.round(dist() * 10) / 10;
    $("over-count").textContent = d.toFixed(1) + " units";
    $("over-digits").textContent = runBestStreak > 0 ? "π ≈ " + piText(Math.min(runBestStreak, 40)) + (runBestStreak > 40 ? "…" : "") : "";
    $("over-cause").textContent = CAUSES[cause] || "";
    let line = newBest && d > 0 ? "A new best run. " : "Best run: " + save.best.toFixed(1) + " units. ";
    line += "Circles: " + runCircles + " this run, " + save.circles + " in all. ";
    line += "Digits in a row: " + runBestStreak + " this run, " + save.streak + " at best.";
    $("over-best").textContent = line;
    const had = unlockedCount(save.circles - runCircles), has = unlockedCount(save.circles);
    $("over-unlock").hidden = has === had;
    if (has !== had) $("over-unlock").textContent = "New look unlocked: " + LOOKS[has - 1].name + ". Tap it to wear it.";
    renderLooks();
    $("over").hidden = false;
    if (newBest && d > 0) sfx.best();
  }

  // the row of looks, in the start and the end panels
  function lookSvg(k, id) {
    let fill = "var(--gold)", defs = "";
    if (k === 1) fill = "var(--ink)";
    if (k === 2) { defs = '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7b267"/><stop offset="0.55" stop-color="#f25c54"/><stop offset="1" stop-color="#7d4e9f"/></linearGradient>'; fill = "url(#" + id + ")"; }
    if (k === 3) { let st = ""; for (let q = 0; q <= 6; q++) st += '<stop offset="' + (q / 6).toFixed(3) + '" stop-color="hsl(' + q * 60 + ',75%,55%)"/>'; defs = '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0">' + st + "</linearGradient>"; fill = "url(#" + id + ")"; }
    return '<svg viewBox="0 0 933 887" aria-hidden="true"><defs>' + defs + '</defs><path fill-rule="evenodd" fill="' + fill + '" d="' + MARK_D + '"/></svg>';
  }
  function renderLooks() {
    const open = unlockedCount(save.circles);
    for (const host of ["start-looks", "over-looks"]) {
      const box = $(host); box.textContent = "";
      LOOKS.forEach((lk, k) => {
        const b = document.createElement("button");
        b.type = "button";
        const locked = k >= open;
        b.className = (locked ? "is-locked" : "") + (k === save.look ? " is-on" : "");
        b.innerHTML = lookSvg(k, host + "-g" + k) + "<span>" + (locked ? lk.at + " ○" : lk.name) + "</span>";
        b.setAttribute("aria-label", locked ? lk.name + " look. Collect " + lk.at + " circles to unlock it." : lk.name + " look");
        if (locked) b.setAttribute("aria-disabled", "true");
        b.addEventListener("click", () => { audioInit(); if (locked) return; save.look = k; persist(); renderLooks(); sfx.circle(0); });
        box.appendChild(b);
      });
    }
  }

  // ====================================================
  // INPUT: one button
  // ====================================================
  function doJump(second) {
    if (second) { P.vy = V1; P.jumps = 2; P.spin = TAU; sfx.jump2(); }
    else { P.vy = V0; P.jumps = 1; sfx.jump(); }
    P.ground = false; P.coy = 0; P.jt = 0; P.buf = 0;
    P.sx = 0.8; P.sy = 1.28;
    for (let k = 0; k < (second ? 3 : 5); k++) puffs.push({ x: P.x - 4 + rnd2() * 8, h: P.h + 2, vx: -40 - rnd2() * 90, vy: 10 + rnd2() * 60, life: 0.3 + rnd2() * 0.2, r: 2 + rnd2() * 2.5 });
  }
  function tryJump() {
    if (P.fell) return false;
    if ((P.ground && !gapAt(P.x)) || (P.coy > 0 && P.jumps === 0)) { doJump(false); return true; }
    if (!P.ground && P.jumps < 2) { doJump(true); return true; }
    return false;
  }
  function press() {
    audioInit();
    if (state === "ready") { startRun(); return; }
    if (state === "paused") { resumeHold = true; setPaused(false); return; }
    if (state === "dead") { if (deadFor > 0.45) startRun(); return; }
    P.held = true; resumeHold = false;
    if (!tryJump()) P.buf = BUFFER;
  }
  // a pause in the middle of a jump must not cut the jump short, so letting go while paused is ignored
  // the same goes for the end of the tap that resumes the run
  function release() {
    if (state === "paused") return;
    if (resumeHold) { resumeHold = false; return; }
    P.held = false;
  }
  // Only the finger that started the jump can end it. A second finger lifting, or a tap on
  // the pause button, must not cut a held jump short.
  let jumpPtr = null;
  window.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest("button, a")) return;
    if (e.button) return;
    e.preventDefault();
    jumpPtr = e.pointerId;
    press();
  }, { passive: false });
  const pointerEnd = (e) => {
    if (ac && ac.state !== "running") { try { ac.resume(); } catch (err) {} }   // some phones only allow sound from the end of a tap
    if (e.pointerId !== jumpPtr) return;
    jumpPtr = null; release();
  };
  window.addEventListener("pointerup", pointerEnd);
  window.addEventListener("pointercancel", pointerEnd);
  window.addEventListener("blur", () => { if (state === "play") setPaused(true); else release(); });
  window.addEventListener("contextmenu", (e) => { if (!(e.target.closest && e.target.closest("a"))) e.preventDefault(); });
  // keep the page still on a phone: no scroll, no pinch, no double tap zoom
  document.addEventListener("touchmove", (e) => { e.preventDefault(); }, { passive: false });
  document.addEventListener("gesturestart", (e) => { e.preventDefault(); });
  document.addEventListener("dblclick", (e) => { e.preventDefault(); });
  const JUMP_KEYS = { Space: 1, ArrowUp: 1, KeyW: 1, Enter: 1 };
  window.addEventListener("keydown", (e) => {
    if (JUMP_KEYS[e.code]) {
      if (e.code === "Enter" && e.target.closest && e.target.closest("button, a")) return;
      e.preventDefault(); if (!e.repeat) press();
    } else if (e.code === "KeyP" || e.code === "Escape") { if (state === "play") setPaused(true); else if (state === "paused") setPaused(false); }
    else if (e.code === "KeyM") toggleMute();
  });
  window.addEventListener("keyup", (e) => { if (JUMP_KEYS[e.code]) release(); });
  function toggleMute() {
    save.mute = !save.mute; persist();
    if (master) master.gain.value = save.mute ? 0 : 0.8;
    $("btn-mute").classList.toggle("is-off", save.mute);
  }
  $("btn-mute").classList.toggle("is-off", save.mute);
  $("btn-mute").addEventListener("click", (e) => { audioInit(); toggleMute(); e.currentTarget.blur(); });
  $("btn-pause").addEventListener("click", (e) => { audioInit(); setPaused(state === "play"); e.currentTarget.blur(); });
  $("btn-resume").addEventListener("click", (e) => { audioInit(); setPaused(false); e.currentTarget.blur(); });
  $("btn-again").addEventListener("click", (e) => { audioInit(); e.currentTarget.blur(); startRun(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (state === "play") setPaused(true); else { release(); persist(); } }
    else last = performance.now();
  });
  window.addEventListener("pagehide", persist);

  // ====================================================
  // UPDATE
  // ====================================================
  function land() {
    const hard = clamp(-P.vy / 800, 0.3, 1);
    P.h = 0; P.vy = 0; P.ground = true; P.jumps = 0; P.fell = false; P.spin = 0;
    P.sx = 1 + 0.3 * hard; P.sy = 1 - 0.32 * hard;
    sfx.land();
    for (let k = 0; k < 6; k++) { const s = k % 2 ? 1 : -1; puffs.push({ x: P.x + s * 6, h: 2, vx: s * (30 + rnd2() * 90) - 60, vy: 8 + rnd2() * 40, life: 0.28 + rnd2() * 0.2, r: 2 + rnd2() * 2.5 }); }
  }
  function pop(x, h, text, big) { pops.push({ x, h, text, life: big ? 1.0 : 0.7, big: !!big }); }
  function collect(n, x, h) {
    runCircles += n; save.circles += n;
  }
  function stepPlay(dt) {
    const v = speedAt(P.x), prevX = P.x;
    P.x += v * dt;
    P.buf = Math.max(0, P.buf - dt);
    P.runPh += dt * v / 15;

    if (P.ground) {
      if (gapAt(P.x)) { P.ground = false; P.coy = COYOTE; P.jumps = 0; }     // ran off an edge
      else if (P.buf > 0) doJump(false);                                       // a press just before landing
    }
    if (!P.ground) {
      if (P.coy > 0 && P.jumps === 0) {                    // a moment of grace past the edge
        P.coy -= dt;
        if (!gapAt(P.x)) { P.ground = true; P.coy = 0; }
      } else {
        P.jt += dt;
        if (!P.held && P.vy > CUT && P.jt >= MIN_HOLD) P.vy = CUT;             // letting go early cuts the jump short
        P.vy -= G * dt; P.h += P.vy * dt;
        if (P.h <= 0) {
          const over = gapAt(P.x);
          if (P.fell) {
            if (!over) { if (P.h > -12) land(); else { P.x = prevX; return die("fall"); } }
            else if (P.h < -90) return die("fall");
          } else if (!over) land();
          else P.fell = true;
        }
      }
    }
    // squash, stretch and spin ease back
    P.sx = lerp(P.sx, 1, Math.min(1, dt * 11)); P.sy = lerp(P.sy, 1, Math.min(1, dt * 11));
    if (P.spin > 0) P.spin = Math.max(0, P.spin - dt * TAU / 0.38);
    P.tilt = lerp(P.tilt, P.ground ? 0.06 + Math.sin(P.runPh) * 0.07 : clamp(-P.vy / 1400, -0.3, 0.35), Math.min(1, dt * 14));
    if (P.ground) { dustT -= dt; if (dustT <= 0) { dustT = 0.11; puffs.push({ x: P.x - 10, h: 1, vx: -30 - rnd2() * 40, vy: 6 + rnd2() * 22, life: 0.25, r: 1.2 + rnd2() * 1.3 }); } }

    // digit gates
    for (const gt of gates) {
      if (gt.done || !(prevX < gt.x && P.x >= gt.x)) continue;
      const mid = P.h + 17;
      if (mid >= gt.lo && mid <= gt.hi && !P.fell) {
        const d = digitAt(streak);
        streak++; gt.done = 1; gt.flash = 1; gt.digit = d;
        if (streak > runBestStreak) runBestStreak = streak;
        const bonus = Math.min(9, streak);
        collect(bonus);
        sfx.digit(d);
        pop(gt.x, mid + 34, String(d), true);
        pop(gt.x + 34, mid + 6, "+" + bonus + " ○");
      } else {
        gt.done = 2; gt.digit = digitAt(streak);
        if (streak > 0) { pop(P.x + 30, P.h + 60, "digits start again"); sfx.miss(); }
        streak = 0;
      }
    }
    // circles
    comboT -= dt; if (comboT <= 0) combo = 0;
    for (const c of circles) {
      if (c.taken || Math.abs(c.x - P.x) > 30) continue;
      if (Math.hypot(c.x - P.x, c.h - (P.h + 17)) < 26) {
        c.taken = true; collect(1); sfx.circle(combo); combo++; comboT = 0.8;
        for (let k = 0; k < 4; k++) { const a = rnd2() * TAU; puffs.push({ x: c.x, h: c.h, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.25, r: 1.6, gold: true }); }
      }
    }
    // dark signs
    for (const hz of hazards) {
      if (hz.x0 > P.x + HIT_W) break;
      if (hz.x1 < P.x - HIT_W) continue;
      if (P.h + HIT_LO < hz.y1 && P.h + HIT_HI > hz.y0) return die(hz.kind);
    }
    if (dist() >= nextMile) { pops.push({ x: 0, h: 190, text: nextMile + " units", life: 1.2, big: true, fixed: true }); sfx.mile(); nextMile += 50; }
    generate();
  }
  function stepDead(dt) {
    deadFor += dt;
    const k = deadFor < 0.4 ? 0.25 : 1;                 // a short slow motion
    const d = dt * k;
    shake = Math.max(0, shake - dt * 26);
    if (cause === "fall") { P.vy -= G * d; P.h = Math.max(-2000, P.h + P.vy * d); P.spin += d * 5; }
    else {
      P.x += P.kvx * d; P.kvx = lerp(P.kvx, 0, Math.min(1, d * 3));
      if (!P.ground) {
        P.vy -= G * d; P.h += P.vy * d; P.spin -= d * 9;
        if (P.h <= 0 && !gapAt(P.x) && P.h > -14) { P.h = 0; P.vy = 0; P.ground = true; P.kvx = 0; P.spin = -1.45; P.sx = 1.15; P.sy = 0.85; }
        else if (P.h < -2000) P.h = -2000;
      }
    }
    if (deadFor > 0.75 && !overShown) showOver();
  }
  function update(dt) {
    time += dt;
    if (state === "play") stepPlay(dt);
    else if (state === "dead") stepDead(dt);
    else if (state === "ready") { P.runPh += dt * 5; P.tilt = Math.sin(time * 2.2) * 0.05; }
    if (state !== "paused") {
      const k = state === "dead" && deadFor < 0.4 ? 0.25 : 1;
      for (const p of puffs) { p.life -= dt * k; p.x += p.vx * dt * k; p.h += p.vy * dt * k; }
      for (const p of pops) { p.life -= dt * k; p.h += 40 * dt * k; }
      for (const gt of gates) if (gt.flash > 0) gt.flash = Math.max(0, gt.flash - dt * 2.2);
      if (puffs.length > 300) puffs.splice(0, puffs.length - 300);
      puffs = puffs.filter((p) => p.life > 0); pops = pops.filter((p) => p.life > 0);
    }
  }

  // ====================================================
  // RENDER
  // ====================================================
  const gold = (a) => "rgba(" + C.rgb + "," + a + ")";
  const ink = (a) => "rgba(" + C.inkRgb + "," + a + ")";
  function drawSign(hz, sx) {
    const y = groundY;
    g.strokeStyle = C.ink; g.fillStyle = C.ink; g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    if (hz.draw === "minus") {
      const w = hz.x1 - hz.x0 + 4;
      g.roundRect(sx - w / 2, y - 16, w, 9, 3); g.fill();
    } else if (hz.draw === "plus") {
      g.roundRect(sx - 4.5, y - 34, 9, 32, 3); g.roundRect(sx - 16, y - 22.5, 32, 9, 3); g.fill();
    } else if (hz.draw === "integral") {
      g.moveTo(sx + 12, y - 73); g.bezierCurveTo(sx + 10, y - 83, sx + 1, y - 82, sx + 1, y - 66);
      g.lineTo(sx - 1, y - 16); g.bezierCurveTo(sx - 1, y, sx - 10, y + 1, sx - 12, y - 9);
      g.stroke();
    } else if (hz.draw === "brackets") {
      g.moveTo(sx - 12, y - 63); g.lineTo(sx - 21, y - 63); g.lineTo(sx - 21, y - 3); g.lineTo(sx - 12, y - 3);
      g.moveTo(sx + 12, y - 63); g.lineTo(sx + 21, y - 63); g.lineTo(sx + 21, y - 3); g.lineTo(sx + 12, y - 3);
      g.stroke();
      g.fillStyle = ink(0.5); g.beginPath();
      for (let k = -1; k <= 1; k++) { g.moveTo(sx + k * 7 + 2, y - 30); g.arc(sx + k * 7, y - 30, 2, 0, TAU); }
      g.fill();
    } else if (hz.draw === "brace") {
      const t = y - 144, m = y - 73;
      g.moveTo(sx + 10, t); g.bezierCurveTo(sx - 4, t, sx, t + 14, sx, t + 30);
      g.lineTo(sx, m - 18); g.bezierCurveTo(sx, m - 6, sx - 4, m, sx - 11, m);
      g.bezierCurveTo(sx - 4, m, sx, m + 6, sx, m + 18);
      g.lineTo(sx, y - 33); g.bezierCurveTo(sx, y - 17, sx - 4, y - 3, sx + 10, y - 3);
      g.stroke();
    } else if (hz.draw === "infinity") {
      const cy = y - 63 + Math.sin(time * 3 + hz.cx * 0.01) * 2, a = 27;
      for (let k = 0; k <= 48; k++) {
        const t = k / 48 * TAU, den = 1 + Math.sin(t) * Math.sin(t);
        const px = sx + a * Math.cos(t) / den, py = cy + 1.45 * a * Math.sin(t) * Math.cos(t) / den;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    } else if (hz.draw === "sigma") {
      const cy = y - 64 + Math.sin(time * 3 + hz.cx * 0.01) * 2;
      g.moveTo(sx + 13, cy - 13); g.lineTo(sx + 13, cy - 17); g.lineTo(sx - 13, cy - 17); g.lineTo(sx + 2, cy);
      g.lineTo(sx - 13, cy + 17); g.lineTo(sx + 13, cy + 17); g.lineTo(sx + 13, cy + 13);
      g.stroke();
    }
  }
  function gateShape(gt) {            // the hoop: bottom and top heights
    return gt.type === "low" ? [0, 72] : gt.type === "mid" ? [52, 176] : [134, 266];
  }
  function drawGate(gt, sx, front, digit) {
    const [b, t] = gateShape(gt), cy = groundY - (b + t) / 2, ry = (t - b) / 2, rx = 15;
    const a = gt.done === 2 ? 0.25 : gt.done === 1 ? 0.45 + gt.flash * 0.55 : 0.95;
    g.strokeStyle = gold(a); g.lineWidth = 5 + gt.flash * 4; g.lineCap = "round";
    g.beginPath();
    // the far half is drawn behind π and the near half in front, so π passes through
    if (front) g.ellipse(sx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
    else g.ellipse(sx, cy, rx, ry, 0, Math.PI / 2, Math.PI * 1.5);
    g.stroke();
    if (!front) {
      if (gt.type !== "low") {       // a thin stand, so the height reads at a glance
        g.strokeStyle = gold(a * 0.35); g.lineWidth = 2; g.setLineDash([3, 6]);
        g.beginPath(); g.moveTo(sx, groundY - b + 2); g.lineTo(sx, groundY - 2); g.stroke(); g.setLineDash([]);
      }
      if (gt.done !== 1) {
        g.fillStyle = gold(gt.done === 2 ? 0.3 : 1); g.font = "600 40px " + FONT; g.textAlign = "center"; g.textBaseline = "alphabetic";
        g.fillText(String(digit), sx, groundY - t - 12);
      }
    }
  }
  function render() {
    const camX = P.x - PX, sxOf = (wx) => wx - camX;
    g.save();
    if (shake > 0.2) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    g.fillStyle = C.paper; g.fillRect(-20, -20, W + 40, H + 40);

    // ruled paper
    g.strokeStyle = gold(0.08); g.lineWidth = 1;
    g.beginPath();
    for (let y = groundY - 38; y > 20; y -= 38) { g.moveTo(-20, y + 0.5); g.lineTo(W + 20, y + 0.5); }
    g.stroke();
    // pale maths drifting by
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = gold(0.1);
    const span = Math.max(W, 900) + 200;
    for (const s of symbols) {
      const x = ((s.x * span / 1400 - camX * s.v) % span + span) % span - 100;
      g.save(); g.translate(x, groundY * s.y); g.rotate(s.a); g.font = "600 " + s.s + "px " + FONT; g.fillText(s.ch, 0, 0); g.restore();
    }
    // two far curves, like a graph sketched in pencil
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.32 : 0.16, base = groundY - (layer ? 46 : 88), amp = layer ? 22 : 34;
      g.strokeStyle = gold(layer ? 0.16 : 0.1); g.lineWidth = 1.5;
      g.beginPath();
      for (let x = -20; x <= W + 20; x += 10) {
        const wx = x + camX * par;
        const y = base - amp * Math.sin(wx * (layer ? 0.011 : 0.006)) - amp * 0.4 * Math.sin(wx * 0.023 + 1.3);
        if (x === -20) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }

    // below the line: the digits collected so far, large and pale
    const below = H - groundY - safeB;
    if (state !== "ready") {
      let txt = piText(streak);
      if (txt.length > 12) txt = "…" + txt.slice(-11);
      const size = clamp(below * 0.34, 40, 84);
      g.font = "600 " + size + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = gold(0.3);
      const big = streak ? "π ≈ " + txt : "π ≈", bw = g.measureText(big).width;
      if (bw > W - 40) g.font = "600 " + (size * (W - 40) / bw) + "px " + FONT;     // always fits the screen
      g.fillText(big, W / 2, groundY + 50 + (below - 50) * 0.5);
    }

    // the number line, with its gaps
    g.strokeStyle = C.gold; g.lineWidth = 2.5; g.lineCap = "butt";
    g.beginPath();
    let cur = camX - 30;
    for (const gp of gaps) {
      if (gp.x1 < camX - 30 || gp.x0 > camX + W + 30) continue;
      g.moveTo(sxOf(cur), groundY); g.lineTo(sxOf(gp.x0) - 5, groundY); cur = gp.x1 + 5;
    }
    g.moveTo(sxOf(cur), groundY); g.lineTo(W + 30, groundY);
    g.stroke();
    // open ends, as on an open interval
    g.lineWidth = 2; g.fillStyle = C.paper;
    for (const gp of gaps) {
      if (gp.x1 < camX - 30 || gp.x0 > camX + W + 30) continue;
      for (const ex of [gp.x0, gp.x1]) { g.beginPath(); g.arc(sxOf(ex), groundY, 5, 0, TAU); g.fill(); g.stroke(); }
    }
    g.lineWidth = 1.3; g.fillStyle = gold(0.85); g.font = "500 19px " + FONT; g.textBaseline = "top"; g.textAlign = "center";
    const firstTick = Math.floor((camX - 30) / 20), lastTick = Math.ceil((camX + W + 30) / 20);
    g.beginPath();
    for (let k = firstTick; k <= lastTick; k++) {
      const wx = k * 20;
      if (inGapDraw(wx)) continue;
      const major = k % 4 === 0, x = sxOf(wx);
      g.moveTo(x, groundY); g.lineTo(x, groundY + (major ? 13 : 6));
      if (major) g.fillText(String(k / 4).replace("-", "−"), x, groundY + 17);
    }
    g.stroke();
    // a small flag at the best distance so far
    if (state !== "ready" && bestAtStart > 3) {
      const bx = sxOf(bestAtStart * UNIT);
      if (bx > -40 && bx < W + 40) {
        g.strokeStyle = gold(0.7); g.fillStyle = gold(0.7); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(bx, groundY + 40); g.lineTo(bx, groundY + 74); g.stroke();
        g.font = "600 17px " + FONT; g.textBaseline = "top"; g.fillText("best", bx, groundY + 76);
      }
    }

    // gates, far halves
    let pending = 0;
    const gateDigits = [];
    for (const gt of gates) { gateDigits.push(gt.done ? gt.digit : digitAt(streak + pending)); if (!gt.done) pending++; }
    gates.forEach((gt, k) => { const x = sxOf(gt.x); if (x > -60 && x < W + 60) drawGate(gt, x, false, gateDigits[k]); });

    // circles to collect
    g.lineWidth = 3;
    for (const c of circles) {
      if (c.taken) continue;
      const x = sxOf(c.x); if (x < -20 || x > W + 20) continue;
      const r = 8.5 + Math.sin(time * 5 + c.x * 0.05) * 1.1;
      g.strokeStyle = C.gold; g.beginPath(); g.arc(x, groundY - c.h, r, 0, TAU); g.stroke();
      g.fillStyle = gold(0.18); g.fill();
    }
    // dark signs
    for (const hz of hazards) { const x = sxOf(hz.cx); if (x > -60 && x < W + 60) drawSign(hz, x); }

    // a few words over a new sign
    g.font = "600 21px " + FONT; g.textAlign = "center"; g.textBaseline = "alphabetic";
    for (const hn of hints) {
      const x = sxOf(hn.x); if (x < -120 || x > W + 120) continue;
      g.fillStyle = gold(P.x > hn.until ? 0.3 : 0.95);
      g.fillText(hn.text, x, groundY - hn.h);
    }
    // dust
    for (const p of puffs) {
      g.fillStyle = (p.gold ? gold : ink)(clamp(p.life * 1.6, 0, p.gold ? 0.9 : 0.35));
      g.beginPath(); g.arc(sxOf(p.x), groundY - p.h, p.r, 0, TAU); g.fill();
    }
    // π
    const bob = P.ground && state === "play" ? Math.abs(Math.sin(P.runPh)) * 2.5 : state === "ready" ? Math.abs(Math.sin(P.runPh * 0.5)) * 3 : 0;
    if (P.h > -400) {
      // a soft shadow on the line
      if (P.h >= 0 && !gapAt(P.x)) { g.fillStyle = ink(0.12 * clamp(1 - P.h / 260, 0.2, 1)); g.beginPath(); g.ellipse(PX, groundY + 2, 15 * clamp(1 - P.h / 400, 0.4, 1), 3, 0, 0, TAU); g.fill(); }
      drawMark(PX, groundY - P.h - bob, P.tilt - P.spin, save.look, time, P.sx, P.sy);
    }
    // gates, near halves
    gates.forEach((gt, k) => { const x = sxOf(gt.x); if (x > -60 && x < W + 60) drawGate(gt, x, true, gateDigits[k]); });

    // words and digits that pop up
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const p of pops) {
      g.globalAlpha = clamp(p.life * 2, 0, 1); g.fillStyle = C.gold;
      g.font = "600 " + (p.big ? 36 : 21) + "px " + FONT; g.fillText(p.text, p.fixed ? W / 2 : clamp(sxOf(p.x), 70, W - 70), groundY - p.h);
    }
    g.globalAlpha = 1;
    g.restore();

    // the count, top left
    if (state !== "ready") {
      const x = 16 + safeL, y = 12 + safeT;
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillStyle = C.ink; g.font = "600 46px " + FONT;
      const dTxt = dist().toFixed(1);
      g.fillText(dTxt, x, y);
      const dw = g.measureText(dTxt).width;
      g.fillStyle = ink(0.65); g.font = "500 21px " + FONT;
      g.fillText("units", x + dw + 8, y + 21);
      g.fillStyle = C.gold; g.font = "600 24px " + FONT;
      g.fillText("○ " + runCircles + "    digits " + streak, x, y + 54);
    }
  }

  // ====================================================
  // MAIN LOOP
  // ====================================================
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!manual && !document.hidden) {
      // small fixed steps, so a slow frame can never carry π through a sign
      while (dt > 1e-6) { const s = Math.min(dt, 1 / 120); update(s); dt -= s; }
    }
    render();
    requestAnimationFrame(frame);
  }
  showReady();
  requestAnimationFrame(frame);

  // a small handle for automated tests
  window.__pirun = {
    get state() { return state; }, get dist() { return dist(); }, get speed() { return speedAt(P.x); },
    get circles() { return runCircles; }, get streak() { return streak; }, get bestStreak() { return runBestStreak; },
    get cause() { return cause; }, get save() { return JSON.parse(JSON.stringify(save)); },
    get player() { return { x: P.x, h: P.h, vy: P.vy, ground: P.ground, jumps: P.jumps, jt: P.jt, fell: P.fell, held: P.held }; },
    // what is ahead, nearest first, in world pixels. "need" is how to pass it: hop, full, double or under.
    get upcoming() { return groups.filter((q) => q.x1 >= P.x - 12).slice(0, 6).map((q) => Object.assign({}, q)); },
    get next() { const q = groups.find((r) => r.x1 >= P.x - 12); return q ? Object.assign({}, q) : null; },
    get plan() { return plan.map((q) => Object.assign({}, q)); },
    get view() { return { W, H, scale, groundY, PX }; },
    phys: { G, V0, V1, CUT, MIN_HOLD, T_APEX, T_FULL, T_APEX2, T_DBL, H_FULL, H_DBL, UNIT, HIT_W },
    kinds: KINDS, digits: PI_STR, speedAt,
    press, release, start: startRun, pause: setPaused, ready: showReady,
    set manual(v) { manual = !!v; }, get manual() { return manual; },
    step(dt) { update(dt); },
  };
})();

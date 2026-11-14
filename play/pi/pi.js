/* =========================================================
   Pi Flight: fly π through its own digits.

   Every gate is the next decimal digit of π. The digit sets where the gap
   is (9 at the top of the band, 0 at the bottom), so the course is the
   shape of π and is the same on every run. The score is the number of
   decimal places reached. Each gate also plays a note chosen by its
   digit, so a good run plays π as a tune.

   The digits are computed here with BigInt (Machin's formula), not typed
   in, so they are right for as far as anyone can fly.
   ========================================================= */
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const g = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  // the text in the language chosen for the site: English, or Vietnamese
  const TX = (en, vi) => (window.PlayLang ? window.PlayLang.t(en, vi) : en);

  // ----- Logical playfield: 420 wide, height follows the screen -----
  const W = 420;
  let H = 760, scale = 1, groundY = 696;
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    H = clamp(Math.round(W * vh / vw), 620, 900);
    scale = Math.min(vw / W, vh / H);
    groundY = H - 64;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
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

  // ====================================================
  // THE DIGITS OF π
  // ====================================================
  const FIRST_100 = "1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";
  function computePi(n) {
    if (typeof BigInt !== "function") return FIRST_100;
    try {
      const B = BigInt, one = B(10) ** B(n + 12);
      // arctan(1/x) as a fixed-point integer, by its Taylor series
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
  const DIGITS = computePi(3000);
  const digitAt = (i) => +DIGITS[i % DIGITS.length];

  // ====================================================
  // SAVE
  // ====================================================
  const SAVE_KEY = "pi-flight-v1";
  let save = { best: 0, circles: 0, mute: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // Looks for π, unlocked by the total number of circles ever collected.
  const LOOKS = [
    { at: 0,   name: "Gold", vi: "Vàng" },
    { at: 30,  name: "Ink", vi: "Mực" },
    { at: 100, name: "Sunrise", vi: "Bình minh" },
    { at: 250, name: "Spectrum", vi: "Cầu vồng" },
  ];
  const lookFor = (circles) => { let k = 0; for (let i = 0; i < LOOKS.length; i++) if (circles >= LOOKS[i].at) k = i; return k; };
  const RANKS = [
    [0, "Rounding to 3", "Làm tròn thành 3"], [3, "Counting on fingers", "Đếm ngón tay"], [6, "Pocket calculator", "Máy tính bỏ túi"], [10, "Schoolbook π", "π trong sách giáo khoa"],
    [16, "Engineer", "Kỹ sư"], [25, "Astronomer", "Nhà thiên văn"], [40, "Mathematician", "Nhà toán học"], [60, "Human computer", "Máy tính sống"], [100, "Memory champion", "Nhà vô địch trí nhớ"], [200, "Transcendental", "Siêu việt"],
  ];
  const rankFor = (n) => { let r = RANKS[0]; for (const row of RANKS) if (n >= row[0]) r = row; return TX(r[1], r[2]); };
  const places = (n) => TX(n === 1 ? "1 decimal place" : n + " decimal places", n + " chữ số thập phân");

  // ====================================================
  // AUDIO: a few synthesised voices, with a sub-bass layer
  // ====================================================
  let ac = null, master = null, noiseBuf = null;
  function audioInit() {
    if (ac) { if (ac.state !== "running") ac.resume(); return; }
    try {
      if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch (e) {} }
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      const bass = ac.createBiquadFilter();
      bass.type = "lowshelf"; bass.frequency.value = 150; bass.gain.value = 6;
      master = ac.createGain(); master.gain.value = save.mute ? 0 : 0.8;
      master.connect(bass); bass.connect(comp); comp.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  function osc(type, f0, f1, dur, vol, at, attack) {
    if (!ac || save.mute) return;
    const t = ac.currentTime + (at || 0), s = ac.createOscillator(), v = ac.createGain();
    s.type = type; s.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) s.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.linearRampToValueAtTime(vol, t + (attack || 0.006));
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(v); v.connect(master); s.start(t); s.stop(t + dur + 0.03);
  }
  function thud(dur, vol, f0, f1) {
    if (!ac || save.mute) return;
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
    s.buffer = noiseBuf; f.type = "lowpass";
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(v); v.connect(master); s.start(t); s.stop(t + dur + 0.03);
  }
  // Ten notes of a pentatonic scale, one per digit: any order of them sounds
  // pleasant, which is what you want from a tune written by π.
  const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
  const sfx = {
    flap() { osc("sine", 420, 640, 0.09, 0.1); osc("sine", 150, 75, 0.1, 0.22); },
    gate(digit, n) {
      const f = SCALE[digit];
      osc("triangle", f, f, 0.5, 0.2); osc("sine", f * 2, f * 2, 0.3, 0.07);
    },
    circle() { osc("sine", 1568, 2093, 0.12, 0.09); },
    crash() { thud(0.5, 0.7, 1800, 90); osc("sine", 150, 34, 0.7, 0.8); osc("triangle", 392, 98, 0.6, 0.2, 0.05); },
    best() { [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => osc("triangle", f, f, 0.35, 0.18, 0.25 + k * 0.12)); },
  };

  // ====================================================
  // π ITSELF: the site's mark, as a path
  // ====================================================
  const MARK = new Path2D("M 0 79 L 0 158 90.585 158 L 181.171 158 180.702 323.750 C 180.189 505.585, 179.893 515.439, 173.921 550 C 167.099 589.473, 148.234 639.092, 125.705 676.819 C 119.026 688.003, 103.645 708.849, 85.085 731.871 C 78.713 739.775, 67.103 754.175, 59.284 763.871 C 51.465 773.567, 44.265 783.006, 43.284 784.846 L 41.500 788.192 46 792.162 C 67.779 811.375, 160.219 887, 161.926 887 C 164.406 887, 203.422 839.570, 235.136 798 C 280.230 738.893, 313.314 663.477, 329.454 583 C 337.392 543.422, 337.821 531.897, 338.991 327 C 339.513 235.425, 339.954 160.160, 339.971 159.744 C 339.987 159.329, 378.362 159.104, 425.250 159.244 L 510.500 159.500 510.587 390.500 C 510.673 618.837, 511.198 683.440, 513.103 700 C 523.207 787.861, 582.955 856.593, 668.225 878.447 C 696.545 885.706, 733.582 885.714, 766.500 878.469 C 820.969 866.481, 874.399 823.906, 900.740 771.500 C 914.994 743.143, 918.458 728.600, 928.003 657.046 C 933.820 613.443, 933.694 615.388, 930.750 614.663 C 922.311 612.583, 789.603 595, 782.351 595 L 777.142 595 776.074 600.250 C 775.486 603.138, 772.547 622.825, 769.543 644 C 762.332 694.830, 759.720 703.795, 749.503 712.788 C 743.401 718.160, 731.401 723.939, 723.565 725.282 C 705.044 728.454, 684.513 716.921, 675 698.001 L 671 690.044 671 424.522 L 671 159 708.835 159 C 729.645 159, 770.370 158.701, 799.335 158.336 L 852 157.673 852 78.836 L 852 0 426 0 L 0 0 0 79");
  const MARK_W = 933, MARK_H = 887;
  function drawMark(x, y, size, angle, look, t, sx, sy) {
    g.save();
    g.translate(x, y); g.rotate(angle); g.scale((sx || 1) * size / MARK_W, (sy || 1) * size / MARK_W);
    g.translate(-MARK_W / 2, -MARK_H / 2);
    if (look === 1) g.fillStyle = C.ink;
    else if (look === 2) { const gr = g.createLinearGradient(0, 0, MARK_W, MARK_H); gr.addColorStop(0, "#f7b267"); gr.addColorStop(0.55, "#f25c54"); gr.addColorStop(1, "#7d4e9f"); g.fillStyle = gr; }
    else if (look === 3) { const gr = g.createLinearGradient(0, 0, MARK_W, 0); for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, "hsl(" + ((k * 60 + t * 80) % 360) + ",75%,55%)"); g.fillStyle = gr; }
    else g.fillStyle = C.gold;
    g.fill(MARK, "evenodd");
    g.restore();
  }

  // ====================================================
  // WORLD
  // ====================================================
  const PX = W * 0.3, R = 13, GATE_W = 62, SPACING = 240;
  let state = "ready";            // ready | play | dead
  let time = 0, deadFor = 0, scroll = 0;
  let pi = { y: 300, vy: 0, tilt: 0, squash: 0 };
  let gates = [], circles = [], puffs = [], trail = [], pops = [];
  let passed = 0, nextIndex = 0, runCircles = 0, precise = 0, speed = 150, look = lookFor(save.circles), newBest = false;
  let newLook = -1;               // the look this flight unlocked, if any
  const symbols = [];             // pale maths drifting in the background
  for (let k = 0; k < 9; k++) symbols.push({ ch: "∑∫√∞θφ∂≈Δ"[k], x: rand(0, W), y: rand(70, 520), s: rand(40, 90), v: rand(0.12, 0.3), a: rand(-0.3, 0.3) });

  const speedAt = (n) => Math.min(215, 150 + n * 0.9);
  function gateFor(n, x) {
    const d = digitAt(n), sp = speedAt(n);
    // the faster it gets, the narrower the band the gaps live in, so the
    // climb from a 0 to a 9 always stays possible
    const band = Math.min(300 - 70 * (sp - 150) / 65, groundY - 250);
    const mid = groundY / 2 + 8;
    return {
      n, d, x, base: mid + (4.5 - d) / 4.5 * band / 2,
      gap: Math.max(128, 182 - n * 0.55),
      sway: n >= 20 && n % 10 === 9 ? 26 : 0,        // every tenth gate drifts up and down
      ph: n * 1.7, done: false,
    };
  }
  const gateY = (gt) => gt.base + (gt.sway ? Math.sin(time * 2.6 + gt.ph) * gt.sway : 0);
  function reset() {
    state = "ready"; time = 0; deadFor = 0;
    pi = { y: groundY / 2, vy: 0, tilt: 0, squash: 0 };
    gates = []; circles = []; puffs = []; trail = []; pops = [];
    passed = 0; nextIndex = 0; runCircles = 0; precise = 0; speed = 150; newBest = false;
    look = lookFor(save.circles);
    $("over").hidden = true; $("start").hidden = false;
    paintStart();
  }
  function paintStart() {
    $("start-best").textContent = save.best ? TX("Best: " + places(save.best) + " · " + save.circles + (save.circles === 1 ? " circle" : " circles"), "Kỷ lục: " + save.best + " chữ số thập phân · " + save.circles + " vòng tròn") : "";
  }
  function start() {
    state = "play"; $("start").hidden = true;
    let x = W + 140;
    for (let k = 0; k < 4; k++) { addGate(x); x += SPACING; }
  }
  function addGate(x) {
    const gt = gateFor(nextIndex++, x);
    gates.push(gt);
    // a circle to collect on the way to this gate, on the line from the last one
    const prev = gates[gates.length - 2];
    if (prev && gt.n % 2 === 1) circles.push({ x: x - SPACING / 2, y: (prev.base + gt.base) / 2 + ((gt.n * 37) % 41 - 20), taken: false });
  }
  function flap() {
    pi.vy = -400; pi.squash = 1;
    sfx.flap();
    for (let k = 0; k < 3; k++) puffs.push({ x: PX - 10, y: pi.y + 14, vx: rand(-90, -30), vy: rand(20, 90), life: 0.4, r: rand(2, 4) });
  }
  function die() {
    if (state !== "play") return;
    state = "dead"; deadFor = 0;
    sfx.crash();
    for (let k = 0; k < 22; k++) { const a = rand(0, TAU), v = rand(60, 260); puffs.push({ x: PX, y: pi.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9), r: rand(2, 5) }); }
    const before = lookFor(save.circles);
    save.circles += runCircles;
    newBest = passed > save.best;
    if (newBest) save.best = passed;
    persist();
    const after = lookFor(save.circles);
    newLook = after !== before ? after : -1;
    $("over-unlock").hidden = newLook < 0;
    paintOver();
  }
  // the words on the end panel, in the language now chosen
  function paintOver() {
    if (newLook >= 0) $("over-unlock").textContent = TX("New look unlocked: " + LOOKS[newLook].name, "Đã mở khóa diện mạo mới: " + LOOKS[newLook].vi);
    $("over-count").textContent = places(passed);
    $("over-rank").textContent = rankFor(passed);
    $("over-best").textContent = (newBest && passed > 0 ? TX("A new best. ", "Kỷ lục mới. ") : TX("Best: " + save.best + ". ", "Kỷ lục: " + save.best + ". ")) +
      TX("Circles: " + runCircles + " this flight, " + save.circles + " in all.", "Vòng tròn: " + runCircles + " lần bay này, tổng cộng " + save.circles + ".");
    $("btn-share").textContent = TX("Share", "Chia sẻ");
  }
  function showOver() {
    const shown = DIGITS.slice(0, passed);
    $("over-digits").textContent = "π ≈ 3" + (passed ? "." + shown : "");
    paintOver();
    $("btn-share").hidden = !(navigator.share || (navigator.clipboard && navigator.clipboard.writeText));
    $("over").hidden = false;
    if (newBest && passed > 0) sfx.best();
  }

  // ====================================================
  // INPUT: one button
  // ====================================================
  function press() {
    audioInit();
    if (state === "ready") { start(); flap(); }
    else if (state === "play") flap();
    else if (state === "dead" && deadFor > 0.9) { reset(); }
  }
  window.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest("button, a")) return;
    if (e.button) return;
    e.preventDefault();
    press();
  }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Enter") { e.preventDefault(); if (!e.repeat) press(); }
    if (e.code === "KeyM") toggleMute();
  });
  function toggleMute() {
    save.mute = !save.mute; persist();
    if (master) master.gain.value = save.mute ? 0 : 0.8;
    $("btn-mute").classList.toggle("is-off", save.mute);
  }
  $("btn-mute").classList.toggle("is-off", save.mute);
  $("btn-mute").addEventListener("click", () => { audioInit(); toggleMute(); });
  $("btn-again").addEventListener("click", () => { audioInit(); reset(); });
  $("btn-share").addEventListener("click", () => {
    const text = TX("I reached " + places(passed) + " of π in Pi Flight.", "Tôi bay được " + passed + " chữ số thập phân của π trong Pi Flight.") + " https://hnguyenx.com/play/pi/";
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => { $("btn-share").textContent = TX("Copied", "Đã sao chép"); setTimeout(() => { $("btn-share").textContent = TX("Share", "Chia sẻ"); }, 1500); }).catch(() => {});
  });
  // words that are not in the page itself: labels for screen readers, and whatever panel is showing
  function paintLang() {
    canvas.setAttribute("aria-label", TX("Pi Flight game", "Trò chơi Pi Flight"));
    $("btn-mute").setAttribute("aria-label", TX("Sound on or off", "Bật hoặc tắt âm thanh"));
    paintStart();
    if (!$("over").hidden) paintOver();
  }
  if (window.PlayLang) window.PlayLang.onChange(paintLang);
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => { if (document.hidden) hiddenAt = performance.now(); else last = performance.now(); });

  // ====================================================
  // UPDATE
  // ====================================================
  function update(dt) {
    time += dt;
    if (state === "ready") {
      pi.y = groundY / 2 + Math.sin(time * 2.4) * 10;
      pi.tilt = Math.sin(time * 2.4 + 1) * 0.08;
      scroll += 60 * dt;
    } else {
      // flight
      pi.vy = Math.min(620, pi.vy + 1350 * dt);
      pi.y += pi.vy * dt;
      if (pi.y < 20) { pi.y = 20; pi.vy = Math.max(0, pi.vy); }
      pi.tilt = lerp(pi.tilt, state === "dead" ? 2.2 : clamp(pi.vy / 620, -0.45, 1.1), Math.min(1, dt * (state === "dead" ? 5 : 9)));
      pi.squash = Math.max(0, pi.squash - dt * 5);
    }
    if (state === "play") {
      speed = speedAt(passed);
      const dx = speed * dt;
      scroll += dx;
      for (const gt of gates) gt.x -= dx;
      for (const c of circles) c.x -= dx;
      for (const p of trail) p.x -= dx;
      if (gates.length && gates[0].x < -GATE_W) gates.shift();
      if (circles.length && circles[0].x < -30) circles.shift();
      const lastGate = gates[gates.length - 1];
      if (lastGate.x < W + 60) addGate(lastGate.x + SPACING);

      trail.push({ x: PX - 8, y: pi.y, life: 0.5 });
      for (const gt of gates) {
        const cy = gateY(gt), top = cy - gt.gap / 2, bottom = cy + gt.gap / 2;
        if (Math.abs(PX - gt.x) < GATE_W / 2 + R - 2 && (pi.y - R < top || pi.y + R > bottom)) return die();
        if (!gt.done && gt.x + GATE_W / 2 < PX - R) {
          gt.done = true; passed++;
          sfx.gate(gt.d, gt.n);
          const exact = Math.abs(pi.y - cy) < 18;
          precise = exact ? precise + 1 : 0;
          pops.push({ x: gt.x, y: cy, text: String(gt.d), life: 0.9, big: true });
          if (precise >= 3) pops.push({ x: PX + 40, y: pi.y - 30, text: TX("precise ×", "chuẩn ×") + precise, life: 0.8 });
          if (exact && precise >= 3) { runCircles++; }
        }
      }
      for (const c of circles) {
        if (!c.taken && Math.hypot(c.x - PX, c.y - pi.y) < 24) { c.taken = true; runCircles++; sfx.circle(); pops.push({ x: c.x, y: c.y - 14, text: "+1", life: 0.6 }); }
      }
      if (pi.y + R > groundY) { pi.y = groundY - R; return die(); }
    }
    if (state === "dead") {
      deadFor += dt;
      if (pi.y + R > groundY) { pi.y = groundY - R; pi.vy = 0; }
      if (deadFor > 0.8 && $("over").hidden) showOver();
    }
    for (const p of puffs) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (const p of trail) p.life -= dt;
    for (const p of pops) { p.life -= dt; p.y -= 34 * dt; }
    puffs = puffs.filter((p) => p.life > 0); trail = trail.filter((p) => p.life > 0); pops = pops.filter((p) => p.life > 0);
  }

  // ====================================================
  // RENDER
  // ====================================================
  function render() {
    g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
    // ruled paper
    g.strokeStyle = "rgba(" + C.rgb + ",0.09)"; g.lineWidth = 1;
    g.beginPath();
    for (let y = 56; y < groundY; y += 38) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
    g.stroke();
    // pale maths drifting by
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(" + C.rgb + ",0.1)";
    for (const s of symbols) {
      const x = ((s.x - scroll * s.v) % (W + 160) + W + 160) % (W + 160) - 80;
      g.save(); g.translate(x, s.y); g.rotate(s.a); g.font = "600 " + s.s + "px " + FONT; g.fillText(s.ch, 0, 0); g.restore();
    }

    // gates: two pillars engraved with their digit, and the digit large in the gap
    for (const gt of gates) {
      const cy = gateY(gt), top = cy - gt.gap / 2, bottom = cy + gt.gap / 2, x0 = gt.x - GATE_W / 2;
      g.fillStyle = "rgba(" + C.rgb + "," + (gt.done ? 0.5 : 0.92) + ")";
      g.fillRect(x0, 0, GATE_W, top - 10); g.fillRect(x0, bottom + 10, GATE_W, groundY - bottom - 10);
      g.beginPath(); g.roundRect(x0 - 6, top - 12, GATE_W + 12, 12, 4); g.roundRect(x0 - 6, bottom, GATE_W + 12, 12, 4); g.fill();
      g.save();
      g.beginPath(); g.rect(x0, 0, GATE_W, top - 12); g.rect(x0, bottom + 12, GATE_W, groundY - bottom - 12); g.clip();
      g.fillStyle = C.paper; g.globalAlpha = 0.5; g.font = "600 26px " + FONT;
      for (let y = cy % 36 - 36; y < groundY; y += 36) g.fillText(String(gt.d), gt.x, y);
      g.restore();
      if (!gt.done) { g.fillStyle = "rgba(" + C.rgb + ",0.2)"; g.font = "600 76px " + FONT; g.fillText(String(gt.d), gt.x, cy + 4); }
    }
    // circles to collect
    g.lineWidth = 3;
    for (const c of circles) if (!c.taken) {
      const r = 9 + Math.sin(time * 5 + c.x * 0.05) * 1.2;
      g.strokeStyle = C.gold; g.beginPath(); g.arc(c.x, c.y, r, 0, TAU); g.stroke();
      g.fillStyle = "rgba(" + C.rgb + ",0.18)"; g.fill();
    }

    // the number line π flies along
    g.fillStyle = C.paper; g.fillRect(0, groundY, W, H - groundY);
    g.strokeStyle = C.gold; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, groundY); g.lineTo(W, groundY); g.stroke();
    g.lineWidth = 1.2; g.fillStyle = "rgba(" + C.rgb + ",0.75)"; g.font = "500 13px " + FONT; g.textBaseline = "top";
    const first = Math.floor(scroll / 24);
    g.beginPath();
    for (let k = first; k < first + W / 24 + 2; k++) {
      const x = k * 24 - scroll;
      const major = k % 10 === 0;
      g.moveTo(x, groundY); g.lineTo(x, groundY + (major ? 14 : 7));
      if (major) g.fillText(String(k / 10), x, groundY + 18);
    }
    g.stroke();
    g.textBaseline = "middle";

    // trail, puffs, π
    for (const p of trail) { g.fillStyle = "rgba(" + C.rgb + "," + (p.life * 0.5) + ")"; g.beginPath(); g.arc(p.x, p.y, 2.5 * p.life * 2, 0, TAU); g.fill(); }
    for (const p of puffs) { g.fillStyle = "rgba(" + C.rgb + "," + clamp(p.life * 1.6, 0, 0.8) + ")"; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); }
    const sq = pi.squash;
    drawMark(PX, pi.y, 40, pi.tilt, look, time, 1 - 0.14 * sq, 1 + 0.18 * sq);

    // digits popping out of the gates
    for (const p of pops) {
      g.globalAlpha = clamp(p.life * 2, 0, 1); g.fillStyle = C.gold;
      g.font = "600 " + (p.big ? 30 : 17) + "px " + FONT; g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;

    // the value so far, and the count, on a strip of paper so gates never hide them
    if (state !== "ready") {
      g.fillStyle = C.paper; g.globalAlpha = 0.86; g.fillRect(0, 0, W, 76); g.globalAlpha = 1;
      g.strokeStyle = "rgba(" + C.rgb + ",0.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 76.5); g.lineTo(W, 76.5); g.stroke();
      const shown = DIGITS.slice(Math.max(0, passed - 14), passed);
      const text = "π ≈ 3" + (passed ? "." + (passed > 14 ? "…" : "") + shown : "");
      g.fillStyle = C.ink; g.font = "600 26px " + FONT; g.textAlign = "center";
      g.fillText(text, W / 2, 34);
      g.fillStyle = "rgba(" + C.inkRgb + ",0.7)"; g.font = "500 16px " + FONT;
      g.fillText(places(passed) + "  ·  " + runCircles + " ○", W / 2, 60);
    }
  }

  // ====================================================
  // MAIN LOOP
  // ====================================================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  reset();
  paintLang();
  requestAnimationFrame(frame);

  // a small handle for automated tests
  window.__piflight = {
    get state() { return state; }, get passed() { return passed; }, get y() { return pi.y; }, get vy() { return pi.vy; },
    get next() { const gt = gates.find((q) => !q.done); return gt ? { x: gt.x, y: gateY(gt), gap: gt.gap, d: gt.d } : null; },
    digits: DIGITS, press, groundY: () => groundY,
  };
})();

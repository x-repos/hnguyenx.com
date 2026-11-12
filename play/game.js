/* =========================================================
   Starship: an arcade space shooter.
   8 sectors, each 5 waves and a boss (48 stages), then it loops harder.
   Everything is drawn with canvas paths and all sound is synthesised,
   so there are no image or audio files.

   Layout of this file:
     setup and scaling · input · audio · helpers · drawing of ships
     player · enemies and waves · bosses · bullets, pickups, particles
     game flow · HUD · main loop
   ========================================================= */
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const g = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);

  // ----- Logical playfield: 540 wide, height follows the screen -----
  const W = 540;
  let H = 900, scale = 1;
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    H = Math.max(760, Math.min(1200, Math.round(W * vh / vw)));
    scale = Math.min(vw / W, vh / H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  resize();

  const TAU = Math.PI * 2;
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ====================================================
  // SAVE
  // ====================================================
  const SAVE_KEY = "starship-save-v1";
  let save = { best: 0, sector: 0, mute: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // ====================================================
  // AUDIO: tiny synth, created on the first tap or key
  // ====================================================
  let ac = null, master = null;
  function audioInit() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = save.mute ? 0 : 0.5;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function tone(freq, dur, type, vol, slide) {
    if (!ac || save.mute) return;
    const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime;
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    v.gain.setValueAtTime(vol || 0.1, t);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v); v.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dur, vol, lowpass) {
    if (!ac || save.mute) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(), v = ac.createGain(), f = ac.createBiquadFilter(), t = ac.currentTime;
    s.buffer = noiseBuf; f.type = "lowpass";
    f.frequency.setValueAtTime(lowpass || 1800, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    v.gain.setValueAtTime(vol, t);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(v); v.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  let lastShot = 0;
  const sfx = {
    shoot() { const n = performance.now(); if (n - lastShot < 70) return; lastShot = n; tone(880, 0.06, "square", 0.035, 0.5); },
    hit() { tone(220, 0.05, "triangle", 0.06, 0.7); },
    boom(big) { noise(big ? 0.7 : 0.28, big ? 0.5 : 0.22, big ? 2600 : 1600); if (big) tone(90, 0.6, "sawtooth", 0.2, 0.4); },
    pickup() { tone(660, 0.07, "sine", 0.12); setTimeout(() => tone(990, 0.1, "sine", 0.12), 60); },
    hurt() { noise(0.4, 0.4, 900); tone(160, 0.4, "sawtooth", 0.2, 0.3); },
    bomb() { noise(1.0, 0.6, 3200); tone(60, 1.0, "sine", 0.4, 0.5); },
    warn() { tone(440, 0.18, "square", 0.1); setTimeout(() => tone(330, 0.25, "square", 0.1), 220); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.14), i * 110)); },
  };

  // ====================================================
  // INPUT
  // ====================================================
  const keys = {};
  const ptr = { x: W / 2, y: H * 0.8, has: false, touch: false, lastX: 0, lastY: 0, id: null };
  function toField(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  }
  window.addEventListener("keydown", (e) => {
    audioInit();
    keys[e.code] = true;
    if (e.code === "Space") { e.preventDefault(); if (state === "play") fireBomb(); }
    if (e.code === "KeyP" || e.code === "Escape") togglePause();
    if (e.code === "KeyM") toggleMute();
    if (e.code === "Enter" && state === "menu") startGame(0);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  canvas.addEventListener("pointerdown", (e) => {
    audioInit();
    if (e.pointerType === "mouse") {
      if (e.button === 2 && state === "play") fireBomb();
      return;
    }
    ptr.touch = true; ptr.id = e.pointerId;
    [ptr.lastX, ptr.lastY] = toField(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    const [x, y] = toField(e);
    if (e.pointerType === "mouse") { ptr.touch = false; ptr.has = true; ptr.x = x; ptr.y = y; return; }
    if (e.pointerId !== ptr.id) return;
    // touch: the ship moves by how far the finger moves, so the finger never covers it
    if (state === "play" && player) {
      player.tx = clamp(player.tx + (x - ptr.lastX) * 1.25, 18, W - 18);
      player.ty = clamp(player.ty + (y - ptr.lastY) * 1.25, 60, H - 30);
    }
    ptr.lastX = x; ptr.lastY = y;
    e.preventDefault();
  });
  canvas.addEventListener("pointerup", (e) => { if (e.pointerId === ptr.id) ptr.id = null; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("visibilitychange", () => { if (document.hidden && state === "play") togglePause(); });

  // ====================================================
  // DRAWING: every craft is a few canvas paths
  // ====================================================
  function glow(color, blur) { g.shadowColor = color; g.shadowBlur = blur; }
  function noGlow() { g.shadowBlur = 0; }
  function poly(pts, fill, stroke) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
  }
  function drawPlayer(p, t) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.tilt * 0.35);
    // engine flames
    const fl = 14 + Math.sin(t * 40) * 4;
    glow("#6cf", 14);
    poly([-9, 16, -5, 16, -7, 16 + fl], "#9fe8ff");
    poly([5, 16, 9, 16, 7, 16 + fl], "#9fe8ff");
    noGlow();
    // wings
    poly([0, -6, -26, 16, -22, 21, -6, 14, 6, 14, 22, 21, 26, 16], "#4a6fd6", "#cfe0ff");
    // wing guns
    poly([-21, 2, -18, 2, -18, 16, -21, 16], "#cfe0ff");
    poly([18, 2, 21, 2, 21, 16, 18, 16], "#cfe0ff");
    // hull
    poly([0, -26, 8, -4, 9, 16, -9, 16, -8, -4], "#e8eeff", "#ffffff");
    // cockpit
    glow("#8fd6ff", 8);
    poly([0, -15, 4, -3, 0, 4, -4, -3], "#39c6ff");
    noGlow();
    if (p.inv > 0) {
      g.globalAlpha = 0.35 + 0.3 * Math.sin(t * 20);
      g.strokeStyle = "#8fd6ff"; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 32, 0, TAU); g.stroke();
    }
    g.restore();
  }
  // enemy palettes shift with the sector so each one looks different
  const SECTOR_HUES = [200, 130, 30, 290, 0, 170, 55, 320];
  const hsl = (h, s, l, a) => "hsla(" + ((h % 360) + 360) % 360 + "," + s + "%," + l + "%," + (a === undefined ? 1 : a) + ")";
  function drawEnemy(e, t) {
    const h = e.hue, f = e.flash > 0;
    const body = f ? "#fff" : hsl(h, 70, 48), dark = f ? "#fff" : hsl(h, 60, 26), lite = hsl(h, 90, 78);
    g.save();
    g.translate(e.x, e.y);
    g.rotate(e.rot || 0);
    const s = e.r / 16;
    g.scale(s, s);
    switch (e.type) {
      case "drone": {           // beetle-like alien pod
        poly([-14, -4, -8, -13, 8, -13, 14, -4, 12, 10, 0, 15, -12, 10], body, lite);
        poly([-17, -2, -22, 10, -14, 6], dark); poly([17, -2, 22, 10, 14, 6], dark);
        glow("#f44", 8); g.fillStyle = "#ff5050";
        g.beginPath(); g.arc(-5, -2, 3, 0, TAU); g.arc(5, -2, 3, 0, TAU); g.fill(); noGlow();
        break;
      }
      case "jet": {             // swept-wing fighter, nose down
        poly([0, 20, 5, 4, 20, -10, 20, -15, 5, -9, 4, -18, -4, -18, -5, -9, -20, -15, -20, -10, -5, 4], body, lite);
        poly([0, 12, 3, 0, 0, -6, -3, 0], "#ffd35c");
        glow("#fa4", 8); poly([-3, -18, 3, -18, 0, -18 - 7 - Math.sin(t * 30 + e.id) * 3], "#ffb347"); noGlow();
        break;
      }
      case "saucer": {
        g.fillStyle = dark; g.beginPath(); g.ellipse(0, 3, 21, 8, 0, 0, TAU); g.fill();
        g.strokeStyle = lite; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = body; g.beginPath(); g.ellipse(0, -3, 11, 9, 0, Math.PI, 0); g.fill();
        for (let k = -2; k <= 2; k++) {
          g.fillStyle = (Math.floor(t * 6 + k + e.id) % 3 === 0) ? "#fff7a8" : hsl(h, 80, 60);
          g.beginPath(); g.arc(k * 7.5, 4, 1.9, 0, TAU); g.fill();
        }
        break;
      }
      case "bomber": {          // heavy gunship
        poly([-22, -8, -12, -16, 12, -16, 22, -8, 24, 8, 12, 16, -12, 16, -24, 8], body, lite);
        poly([-9, -10, 9, -10, 6, 6, -6, 6], dark);
        poly([-20, 8, -15, 8, -15, 20, -20, 20], lite); poly([15, 8, 20, 8, 20, 20, 15, 20], lite);
        glow("#f55", 10); g.fillStyle = "#ff6b6b"; g.beginPath(); g.arc(0, -2, 4, 0, TAU); g.fill(); noGlow();
        break;
      }
      case "kamikaze": {        // dart
        poly([0, 20, 9, -6, 4, -14, 0, -9, -4, -14, -9, -6], f ? "#fff" : "#ff5a3c", "#ffd0c0");
        glow("#f80", 10); poly([-3, -12, 3, -12, 0, -24], "#ffcc66"); noGlow();
        break;
      }
      case "rock": {
        g.beginPath();
        for (let k = 0; k < 9; k++) {
          const a = k / 9 * TAU, rr = 15 + ((e.id * 7 + k * 13) % 7) - 3;
          k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fillStyle = f ? "#fff" : "#6b5b4d"; g.fill();
        g.strokeStyle = "#b9a48f"; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath(); g.arc(-4, -3, 4, 0, TAU); g.arc(6, 5, 2.5, 0, TAU); g.fill();
        break;
      }
    }
    g.restore();
  }
  function drawBoss(b, t) {
    const f = b.flash > 0, h = b.hue;
    const body = f ? "#fff" : hsl(h, 60, 38), dark = f ? "#fff" : hsl(h, 55, 20), lite = hsl(h, 90, 76);
    g.save();
    g.translate(b.x, b.y);
    if (b.kind === 0) {         // mothership: wide hull with turrets
      poly([-110, -10, -80, -44, 80, -44, 110, -10, 96, 30, 40, 48, -40, 48, -96, 30], body, lite);
      poly([-60, -30, 60, -30, 44, 16, -44, 16], dark);
      for (const tx of [-78, -30, 30, 78]) { poly([tx - 7, 26, tx + 7, 26, tx + 4, 50, tx - 4, 50], lite); }
    } else if (b.kind === 1) {  // twin gunship
      poly([-40, -50, 40, -50, 30, 40, 0, 62, -30, 40], body, lite);
      poly([-96, -30, -42, -40, -42, 30, -80, 44], dark, lite);
      poly([96, -30, 42, -40, 42, 30, 80, 44], dark, lite);
      poly([-84, 30, -70, 30, -74, 62, -80, 62], lite); poly([70, 30, 84, 30, 80, 62, 74, 62], lite);
    } else if (b.kind === 2) {  // spinner: rotating star fortress
      g.rotate(t * 0.6);
      for (let k = 0; k < 6; k++) {
        g.rotate(TAU / 6);
        poly([0, -30, 16, -86, 0, -100, -16, -86], k % 2 ? body : dark, lite);
      }
      g.fillStyle = body; g.beginPath(); g.arc(0, 0, 46, 0, TAU); g.fill();
      g.strokeStyle = lite; g.lineWidth = 2; g.stroke();
    } else {                    // carrier: long deck with a hangar
      poly([-120, -26, 120, -26, 104, 30, -104, 30], body, lite);
      poly([-70, -54, 70, -54, 86, -26, -86, -26], dark, lite);
      poly([-34, 30, 34, 30, 26, 52, -26, 52], dark, lite);
      for (let k = -4; k <= 4; k++) { g.fillStyle = k % 2 ? "#ffe27a" : lite; g.fillRect(k * 22 - 3, 6, 6, 6); }
    }
    // core: gets redder as the boss weakens
    const hp = b.hp / b.maxHp;
    glow(hp < 0.5 ? "#f33" : "#fc5", 20);
    g.fillStyle = hp < 0.5 ? "#ff4d4d" : "#ffd35c";
    g.beginPath(); g.arc(0, 0, 13 + Math.sin(t * 6) * 2, 0, TAU); g.fill();
    noGlow();
    g.restore();
  }

  // ====================================================
  // WORLD STATE
  // ====================================================
  let state = "menu";            // menu | play | paused | over
  let player = null, boss = null;
  let enemies = [], shots = [], eshots = [], pickups = [], parts = [], texts = [];
  let spawnQueue = [];           // [{at, make}] within the current wave
  let stage = 0, waveTime = 0, banner = null, shake = 0, flashAll = 0, time = 0, idSeq = 1;
  let score = 0, loop = 0;
  const STAGES_PER_SECTOR = 6, SECTORS = 8;
  const sectorOf = (s) => Math.floor(s / STAGES_PER_SECTOR) % SECTORS;
  const isBossStage = (s) => s % STAGES_PER_SECTOR === STAGES_PER_SECTOR - 1;
  // difficulty: grows with the stage and again on every loop through the game
  const diff = () => stage + loop * 30;

  const SECTOR_NAMES = ["Outer Rim", "Emerald Drift", "Ember Fields", "Violet Nebula", "Crimson Gate", "Glacier Belt", "Golden Reach", "The Core"];

  // background stars, three depths
  const stars = [];
  for (let i = 0; i < 130; i++) stars.push({ x: rand(W), y: rand(1200), z: rand(0.25, 1), tw: rand(TAU) });

  // ====================================================
  // PLAYER
  // ====================================================
  const WEAPONS = ["Blaster", "Spread", "Laser"];
  function newPlayer() {
    return { x: W / 2, y: H - 120, tx: W / 2, ty: H - 120, tilt: 0, r: 11, lives: 3, bombs: 2,
             weapon: 0, power: 1, cd: 0, inv: 2, dead: 0 };
  }
  function playerFire(p) {
    const lv = p.power, w = p.weapon;
    const add = (dx, vx, vy, dmg, opt) => shots.push(Object.assign({ x: p.x + dx, y: p.y - 22, vx, vy, dmg, r: 4, w }, opt));
    if (w === 0) {                 // Blaster: fast, straight, strong per shot
      p.cd = 0.13;
      const n = lv < 3 ? 1 : lv < 6 ? 2 : lv < 9 ? 3 : 4, dmg = 1 + lv * 0.22;
      for (let k = 0; k < n; k++) add((k - (n - 1) / 2) * 11, 0, -900, dmg);
      if (lv >= 5) { add(-22, -70, -860, dmg * 0.6); add(22, 70, -860, dmg * 0.6); }
    } else if (w === 1) {          // Spread: a fan that covers the screen
      p.cd = 0.19;
      const n = 3 + Math.floor(lv / 2) * 2 > 11 ? 11 : 3 + Math.floor(lv / 2) * 2, dmg = 0.7 + lv * 0.12;
      for (let k = 0; k < n; k++) {
        const a = (k - (n - 1) / 2) * 0.13;
        add(0, Math.sin(a) * 760, -Math.cos(a) * 760, dmg);
      }
    } else {                       // Laser: thin bolts that pass through enemies
      p.cd = 0.085;
      const n = lv < 4 ? 1 : lv < 8 ? 2 : 3, dmg = 0.5 + lv * 0.1;
      for (let k = 0; k < n; k++) add((k - (n - 1) / 2) * 16, 0, -1250, dmg, { pierce: true, r: 3, len: 26 });
    }
    sfx.shoot();
  }
  function hurtPlayer() {
    const p = player;
    if (p.inv > 0 || p.dead > 0) return;
    explode(p.x, p.y, "#8fd6ff", 40, true);
    sfx.hurt(); shake = 14;
    p.lives--;
    p.power = Math.max(1, p.power - 2);
    if (p.lives < 0) { p.dead = 1.6; return; }
    p.inv = 2.6;
    eshots.length = 0;            // a breather after a hit
  }
  function fireBomb() {
    const p = player;
    if (!p || p.dead > 0 || p.bombs <= 0) return;
    p.bombs--; p.inv = Math.max(p.inv, 1.2);
    sfx.bomb(); shake = 18; flashAll = 0.6;
    eshots.length = 0;
    for (const e of enemies) damage(e, 30 + diff() * 1.2);
    if (boss && boss.state === "fight") damage(boss, 60 + diff() * 1.5);
    for (let k = 0; k < 70; k++) parts.push({ x: rand(W), y: rand(H), vx: rand(-200, 200), vy: rand(-200, 200), life: rand(0.3, 0.9), max: 0.9, c: "#ffe9a8", s: rand(2, 5) });
  }

  // ====================================================
  // ENEMIES
  // ====================================================
  const BASE = {
    drone:    { hp: 3,  r: 16, score: 100 },
    jet:      { hp: 4,  r: 17, score: 150 },
    saucer:   { hp: 8,  r: 19, score: 250 },
    bomber:   { hp: 26, r: 26, score: 600 },
    kamikaze: { hp: 2,  r: 13, score: 120 },
    rock:     { hp: 6,  r: 22, score: 80 },
  };
  function mkEnemy(type, x, y, o) {
    const b = BASE[type], d = diff();
    const e = Object.assign({
      id: idSeq++, type, x, y, vx: 0, vy: 0, r: b.r, rot: 0, t: 0, flash: 0,
      hp: b.hp * (1 + d * 0.085), score: b.score,
      hue: SECTOR_HUES[sectorOf(stage)] + (type === "saucer" ? 40 : type === "bomber" ? -30 : 0),
      fire: rand(1, 3.5), ai: "fly",
    }, o);
    e.maxHp = e.hp;
    enemies.push(e);
    return e;
  }
  const bulletSpeed = () => Math.min(360, 150 + diff() * 3.2);
  function eshot(x, y, vx, vy, o) { eshots.push(Object.assign({ x, y, vx, vy, r: 5, c: "#ff7a55" }, o)); }
  function aimed(x, y, speed, spread, o) {
    const a = Math.atan2(player.y - y, player.x - x) + (spread || 0);
    eshot(x, y, Math.cos(a) * speed, Math.sin(a) * speed, o);
  }
  function updateEnemy(e, dt) {
    e.t += dt; e.flash -= dt;
    const d = diff(), sp = bulletSpeed();
    switch (e.ai) {
      case "slot": {     // holds a place in a formation that moves as one
        const f = e.form;
        const tx = f.x + e.sx, ty = f.y + e.sy;
        if (e.t < e.enter) {
          // fly in along a curve from the side, then settle
          const u = e.t / e.enter, k = 1 - u;
          e.x = lerp(e.ex, tx, u * u * (3 - 2 * u)) + Math.sin(u * Math.PI) * e.curve * k;
          e.y = lerp(e.ey, ty, u * u * (3 - 2 * u));
        } else if (e.dive) {
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.y > H + 40) { e.y = -40; e.x = tx; e.dive = false; e.t = e.enter - 0.8; e.ex = e.x; e.ey = e.y; e.curve = 0; }
        } else {
          e.x += (tx - e.x) * Math.min(1, dt * 6); e.y += (ty - e.y) * Math.min(1, dt * 6);
          e.fire -= dt;
          if (e.fire <= 0) {
            e.fire = rand(2.2, 5) / (1 + d * 0.025);
            if (e.type === "jet" && Math.random() < 0.45) {       // peel off and dive at the ship
              e.dive = true;
              const a = Math.atan2(player.y - e.y, player.x - e.x);
              e.vx = Math.cos(a) * 300; e.vy = Math.max(220, Math.sin(a) * 300);
            } else if (e.y > 0) eshot(e.x, e.y + 12, 0, sp * 0.85);
          }
        }
        break;
      }
      case "fly": {      // crosses the screen
        e.x += (e.vx + Math.sin(e.t * e.wob) * e.amp) * dt; e.y += e.vy * dt;
        e.fire -= dt;
        if (e.fire <= 0 && e.y > 20 && e.y < H * 0.7) { e.fire = rand(1.4, 3) / (1 + d * 0.02); eshot(e.x, e.y + 14, 0, sp); }
        if (e.y > H + 50 || e.x < -80 || e.x > W + 80) e.gone = true;
        break;
      }
      case "hover": {    // drops to a height, then strafes and aims
        if (e.y < e.hy) e.y += 160 * dt;
        e.x = clamp(e.hx + Math.sin(e.t * e.wob + e.ph) * e.amp, 24, W - 24);
        e.fire -= dt;
        if (e.fire <= 0 && e.y >= e.hy - 4) {
          e.fire = rand(1.6, 3.2) / (1 + d * 0.02);
          if (e.type === "bomber") { for (const a of [-0.3, 0, 0.3]) aimed(e.x, e.y + 16, sp * 0.8, a, { r: 7, c: "#ffb347" }); }
          else aimed(e.x, e.y + 10, sp);
        }
        break;
      }
      case "ring": {     // orbits a centre that drifts down and holds
        const c = e.form;
        e.x = c.x + Math.cos(e.ang + c.spin) * c.rad; e.y = c.y + Math.sin(e.ang + c.spin) * c.rad;
        e.fire -= dt;
        if (e.fire <= 0 && e.y > 0) { e.fire = rand(2, 4.5) / (1 + d * 0.02); aimed(e.x, e.y, sp * 0.9); }
        break;
      }
      case "dive": {     // homes for a moment, then commits
        if (e.t < 0.9) { e.y += 120 * dt; e.rot = Math.sin(e.t * 20) * 0.2; }
        else {
          if (e.t < 1.6) {
            const a = Math.atan2(player.y - e.y, player.x - e.x);
            e.vx = lerp(e.vx, Math.cos(a) * (380 + d * 3), dt * 5); e.vy = lerp(e.vy, Math.sin(a) * (380 + d * 3), dt * 5);
          }
          e.x += e.vx * dt; e.y += e.vy * dt;
          e.rot = Math.atan2(e.vy, e.vx) - Math.PI / 2;
        }
        if (e.y > H + 50 || e.x < -80 || e.x > W + 80 || e.y < -200) e.gone = true;
        break;
      }
      case "rock": {
        e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.spin * dt;
        if (e.y > H + 60 || e.x < -90 || e.x > W + 90) e.gone = true;
        break;
      }
    }
  }
  function damage(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.06;
    if (e.hp > 0) return;
    e.dead = true;
    if (e === boss) return bossDown();
    score += e.score * (1 + loop);
    explode(e.x, e.y, hsl(e.hue, 90, 70), e.r > 20 ? 34 : 16, e.r > 20);
    sfx.boom(e.r > 20);
    if (e.type === "rock" && e.r > 15) {           // rocks split
      for (const s of [-1, 1]) mkEnemy("rock", e.x, e.y, { ai: "rock", r: e.r * 0.6, hp: e.maxHp * 0.4, vx: s * rand(50, 120), vy: e.vy * 1.15, spin: rand(-3, 3), score: 40 });
    }
    drop(e);
  }
  function drop(e) {
    const r = Math.random(), big = e.type === "bomber" || e.type === "saucer";
    let kind = null;
    if (r < (big ? 0.34 : 0.07)) kind = "power";
    else if (r < (big ? 0.42 : 0.095)) kind = "weapon";
    else if (r < (big ? 0.46 : 0.105)) kind = "bomb";
    else if (r < (big ? 0.475 : 0.109)) kind = "life";
    else if (r < 0.42) kind = "gem";
    if (kind) pickups.push({ x: e.x, y: e.y, vy: 110, kind, t: 0, w: kind === "weapon" ? Math.floor(rand(3)) : 0 });
  }

  // ----- Waves: each returns nothing and fills `enemies` / `spawnQueue` -----
  const later = (at, make) => spawnQueue.push({ at, make });
  const WAVES = {
    grid(n) {                 // a block that marches side to side and creeps down
      const cols = clamp(5 + Math.floor(n / 4), 5, 8), rows = clamp(3 + Math.floor(n / 6), 3, 5);
      const form = { x: W / 2, y: 150, dir: 1, kind: "march", span: (W - cols * 52) / 2 - 8 };
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const side = (r + c) % 2 ? -1 : 1;
        mkEnemy(r === 0 && n > 3 ? "saucer" : "drone", 0, 0, {
          ai: "slot", form, sx: (c - (cols - 1) / 2) * 52, sy: (r - (rows - 1) / 2) * 46,
          enter: 1.2 + (r * cols + c) * 0.035, ex: side * 400 + W / 2, ey: -60 - r * 30, curve: side * 180,
        });
      }
      forms.push(form);
    },
    swoop(n) {                // squadrons of jets fly in, form up, then dive one by one
      const per = clamp(6 + Math.floor(n / 3), 6, 12), form = { x: W / 2, y: 190, dir: 1, kind: "sway", span: 70 };
      for (let k = 0; k < per * 2; k++) {
        const side = k < per ? -1 : 1, i = k % per, col = i % 6, row = Math.floor(i / 6) + (k < per ? 0 : 2);
        later(i * 0.16 + (k < per ? 0 : 1.6), () => mkEnemy("jet", 0, 0, {
          ai: "slot", form, sx: (col - 2.5) * 62, sy: (row - 1.5) * 50, enter: 1.9,
          ex: W / 2 + side * 380, ey: H * 0.45, curve: -side * 260, fire: rand(2, 6),
        }));
      }
      forms.push(form);
    },
    jets(n) {                 // V squadrons streak through; anything missed is gone
      const squads = clamp(4 + Math.floor(n / 3), 4, 10);
      for (let s = 0; s < squads; s++) {
        const cx = rand(90, W - 90), size = 3 + (s % 2) * 2;
        for (let k = 0; k < size; k++) {
          const off = k - (size - 1) / 2;
          later(s * 1.25 + Math.abs(off) * 0.12, () => mkEnemy("jet", cx + off * 34, -40, {
            ai: "fly", vx: 0, vy: 250 + diff() * 2, wob: 2.4, amp: 70, fire: rand(0.4, 1.6),
          }));
        }
      }
    },
    saucers(n) {              // hover and strafe, firing straight at the ship
      const cnt = clamp(4 + Math.floor(n / 3), 4, 10);
      for (let k = 0; k < cnt; k++) later(k * 0.5, () => mkEnemy("saucer", rand(60, W - 60), -40, {
        ai: "hover", hx: rand(110, W - 110), hy: 110 + (k % 3) * 80, wob: rand(0.9, 1.7), ph: rand(TAU), amp: rand(60, 110),
      }));
    },
    rings(n) {                // rotating rings of drones
      const rings = n > 14 ? 3 : 2;
      for (let q = 0; q < rings; q++) {
        const form = { x: W * (q + 1) / (rings + 1), y: -140, ty: 210 + (q % 2) * 110, rad: 78, spin: 0, w: (q % 2 ? -1 : 1) * 1.3, kind: "ring" };
        const cnt = clamp(7 + Math.floor(n / 5), 7, 11);
        for (let k = 0; k < cnt; k++) mkEnemy("drone", 0, -200, { ai: "ring", form, ang: k / cnt * TAU });
        mkEnemy("saucer", 0, -200, { ai: "ring", form: Object.assign({}, form, { rad: 0, link: form }), ang: 0 });
        forms.push(form);
      }
    },
    rocks(n) {                // an asteroid field
      const cnt = clamp(14 + n, 14, 40);
      for (let k = 0; k < cnt; k++) later(k * 0.42, () => mkEnemy("rock", rand(20, W - 20), -50, {
        ai: "rock", vx: rand(-60, 60), vy: rand(120, 230) + diff() * 1.5, spin: rand(-2.5, 2.5), r: rand(16, 30),
      }));
    },
    bombers(n) {              // gunships with fighter escorts
      const cnt = clamp(2 + Math.floor(n / 6), 2, 5);
      for (let k = 0; k < cnt; k++) later(k * 1.4, () => {
        const hx = W * (k + 1) / (cnt + 1);
        mkEnemy("bomber", hx, -60, { ai: "hover", hx, hy: 130 + (k % 2) * 70, wob: 0.7, ph: rand(TAU), amp: 50 });
        for (const s of [-1, 1]) mkEnemy("jet", hx + s * 60, -90, { ai: "hover", hx: hx + s * 62, hy: 190 + (k % 2) * 70, wob: 0.7, ph: rand(TAU), amp: 50 });
      });
    },
    swarm(n) {                // darts that lock on and ram
      const cnt = clamp(12 + n, 12, 36);
      for (let k = 0; k < cnt; k++) later(k * 0.36, () => mkEnemy("kamikaze", rand(30, W - 30), -30, { ai: "dive" }));
      for (let k = 0; k < 3; k++) later(2 + k * 3, () => mkEnemy("saucer", rand(80, W - 80), -40, { ai: "hover", hx: rand(110, W - 110), hy: 120, wob: 1.2, ph: rand(TAU), amp: 90 }));
    },
  };
  // which five waves each sector uses, so every sector has its own mix
  const SECTOR_WAVES = [
    ["grid", "jets", "saucers", "swoop", "rocks"],
    ["swoop", "rings", "jets", "bombers", "grid"],
    ["rocks", "swarm", "grid", "saucers", "swoop"],
    ["rings", "bombers", "swarm", "jets", "grid"],
    ["swoop", "saucers", "rocks", "rings", "bombers"],
    ["jets", "grid", "swarm", "swoop", "saucers"],
    ["bombers", "rings", "swoop", "swarm", "rocks"],
    ["grid", "swarm", "bombers", "rings", "swoop"],
  ];
  let forms = [];
  function updateForms(dt) {
    for (const f of forms) {
      if (f.kind === "march") {
        f.x += f.dir * (34 + diff() * 0.8) * dt;
        if (Math.abs(f.x - W / 2) > f.span) { f.dir *= -1; f.x = W / 2 + Math.sign(f.x - W / 2) * f.span; f.y = Math.min(H * 0.42, f.y + 16); }
      } else if (f.kind === "sway") {
        f.x = W / 2 + Math.sin(waveTime * 0.8) * f.span;
      } else if (f.kind === "ring") {
        f.y += (f.ty - f.y) * Math.min(1, dt * 1.5);
        f.x += Math.sin(waveTime * 0.6 + f.ty) * 22 * dt;
        f.spin += f.w * dt;
      }
    }
    // the saucer at a ring's centre follows that ring
    for (const e of enemies) if (e.ai === "ring" && e.form.link) { e.form.x = e.form.link.x; e.form.y = e.form.link.y; }
  }

  // ====================================================
  // BOSSES: four designs, each returning stronger
  // ====================================================
  function spawnBoss() {
    const sec = sectorOf(stage), kind = sec % 4, d = diff();
    boss = {
      kind, x: W / 2, y: -140, r: 62, hue: SECTOR_HUES[sec], flash: 0, t: 0, state: "enter",
      hp: 420 + d * 46, score: 5000 + d * 200, atk: 0, cd: 2, ang: 0, dead: false,
    };
    boss.maxHp = boss.hp;
    sfx.warn();
    banner = { text: "WARNING", sub: BOSS_NAMES[kind] + " approaching", t: 0, dur: 2.6, warn: true };
  }
  const BOSS_NAMES = ["Mothership", "Twin Gunship", "Star Fortress", "Carrier"];
  function updateBoss(b, dt) {
    b.t += dt; b.flash -= dt;
    if (b.state === "enter") { b.y += (150 - b.y) * Math.min(1, dt * 1.4); if (b.t > 2.6) { b.state = "fight"; b.t = 0; } return; }
    if (b.state === "dying") {
      b.y += 14 * dt; b.dieT -= dt;
      if (Math.random() < 0.5) explode(b.x + rand(-90, 90), b.y + rand(-50, 50), pick(["#ffd35c", "#ff7a55", "#fff"]), 18, false);
      if (b.dieT <= 0) { explode(b.x, b.y, "#fff", 110, true); sfx.boom(true); shake = 22; flashAll = 0.7; boss = null; stageCleared(); }
      return;
    }
    const rage = b.hp < b.maxHp * 0.5, sp = bulletSpeed(), d = diff();
    const rate = (rage ? 0.72 : 1) / (1 + d * 0.012);
    // movement
    if (b.kind === 1) { b.x = W / 2 + Math.sin(b.t * 1.5) * 170; b.y = 150 + Math.sin(b.t * 2.3) * 40; }
    else if (b.kind === 2) { b.x = W / 2 + Math.sin(b.t * 0.6) * 120; b.y = 190 + Math.cos(b.t * 0.45) * 50; }
    else { b.x = W / 2 + Math.sin(b.t * 0.7) * (b.kind === 3 ? 90 : 140); b.y = 150 + Math.sin(b.t * 1.1) * 16; }
    b.cd -= dt;
    if (b.cd > 0) return;
    const fan = (n, spread, speed, o) => { for (let k = 0; k < n; k++) aimed(b.x, b.y + 30, speed, (k - (n - 1) / 2) * spread, o); };
    const ringShot = (n, speed, off, o) => { for (let k = 0; k < n; k++) { const a = k / n * TAU + off; eshot(b.x, b.y, Math.cos(a) * speed, Math.sin(a) * speed, o); } };
    b.atk++;
    if (b.kind === 0) {            // Mothership: turret curtains and aimed fans
      if (b.atk % 4 === 0) { fan(rage ? 9 : 7, 0.17, sp, { r: 7, c: "#ffb347" }); b.cd = 1.5 * rate; }
      else { for (const tx of [-78, -30, 30, 78]) eshot(b.x + tx, b.y + 50, rand(-25, 25), sp * 0.95); b.cd = 0.5 * rate; }
    } else if (b.kind === 1) {     // Twin Gunship: fast aimed bursts from both wings
      for (const s of [-77, 77]) { const a = Math.atan2(player.y - b.y, player.x - (b.x + s)); eshot(b.x + s, b.y + 60, Math.cos(a) * sp * 1.25, Math.sin(a) * sp * 1.25, { c: "#ff5aa0" }); }
      b.cd = (b.atk % 6 < 4 ? 0.16 : 1.1) * rate;
      if (rage && b.atk % 12 === 0) ringShot(14, sp * 0.7, rand(TAU), { r: 6, c: "#ffb347" });
    } else if (b.kind === 2) {     // Star Fortress: spiral arms
      b.ang += 0.31;
      ringShot(rage ? 6 : 4, sp * 0.75, b.ang, { c: "#c9a8ff" });
      if (rage) ringShot(4, sp * 0.55, -b.ang * 1.3, { c: "#8fd6ff" });
      b.cd = 0.17 * rate;
      if (b.atk % 26 === 0) { fan(5, 0.22, sp * 1.1, { r: 7, c: "#ffb347" }); b.cd = 0.9 * rate; }
    } else {                       // Carrier: launches fighters, then a wall with one gap
      if (b.atk % 5 === 0) {
        const gap = rand(70, W - 70);
        for (let x = 14; x < W; x += 26) if (Math.abs(x - gap) > (rage ? 46 : 56)) eshot(x, b.y + 40, 0, sp * 0.75, { c: "#8fd6ff" });
        b.cd = 1.9 * rate;
      } else if (b.atk % 5 === 2 && enemies.length < 10) {
        for (const s of [-1, 1]) for (let k = 0; k < (rage ? 3 : 2); k++) mkEnemy("kamikaze", b.x + s * (40 + k * 26), b.y + 40, { ai: "dive" });
        b.cd = 1.2 * rate;
      } else { fan(5, 0.2, sp, { c: "#ffb347" }); b.cd = 0.8 * rate; }
    }
  }
  function bossDown() {
    boss.state = "dying"; boss.dieT = 2.2;
    score += boss.score * (1 + loop);
    eshots.length = 0;
    for (const e of enemies) { e.dead = true; explode(e.x, e.y, "#ffd35c", 14, false); }
    for (let k = 0; k < 4; k++) pickups.push({ x: boss.x + rand(-70, 70), y: boss.y + rand(-20, 20), vy: 90, kind: k === 0 ? "life" : k === 1 ? "bomb" : "power", t: 0, w: 0 });
  }

  // ====================================================
  // PARTICLES AND TEXT
  // ====================================================
  function explode(x, y, c, n, big) {
    for (let k = 0; k < n; k++) {
      const a = rand(TAU), v = rand(40, big ? 420 : 240);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, big ? 1.0 : 0.6), max: 1, c: Math.random() < 0.3 ? "#fff" : c, s: rand(1.5, big ? 5 : 3.5) });
    }
    if (big) parts.push({ x, y, ring: true, life: 0.5, max: 0.5, c, s: 10 });
  }
  function popText(x, y, s, c) { texts.push({ x, y, s, c: c || "#fff", t: 0 }); }

  // ====================================================
  // GAME FLOW
  // ====================================================
  function show(el, on) { $(el).hidden = !on; }
  function setState(s) {
    state = s;
    document.body.classList.toggle("in-menu", s !== "play");
    show("menu", s === "menu"); show("paused", s === "paused"); show("over", s === "over");
    show("hud", s === "play" || s === "paused"); show("btn-bomb", s === "play");
    if (s === "menu") {
      $("best").textContent = save.best ? "Best score " + save.best.toLocaleString() : "";
      const c = $("btn-continue");
      c.hidden = !save.sector;
      c.textContent = "Continue from sector " + (save.sector + 1) + " · " + SECTOR_NAMES[save.sector % SECTORS];
    }
  }
  function startGame(sector) {
    audioInit();
    stage = sector * STAGES_PER_SECTOR; loop = 0; score = 0;
    player = newPlayer();
    // starting later: a head start on firepower so the sector is fair
    player.power = clamp(1 + sector, 1, 6);
    enemies = []; shots = []; eshots = []; pickups = []; parts = []; texts = []; boss = null;
    beginStage();
    setState("play");
  }
  function beginStage() {
    enemies = []; spawnQueue = []; forms = []; eshots = []; waveTime = 0; boss = null;
    const sec = sectorOf(stage), inSec = stage % STAGES_PER_SECTOR;
    if (inSec === 0) {
      banner = { text: "Sector " + (sec + 1) + (loop ? " · loop " + (loop + 1) : ""), sub: SECTOR_NAMES[sec], t: 0, dur: 2.4 };
      if (sec > save.sector && loop === 0) { save.sector = sec; persist(); }
    }
    if (isBossStage(stage)) return spawnBoss();
    if (inSec !== 0) banner = { text: "Wave " + (inSec + 1), sub: "", t: 0, dur: 1.3 };
    WAVES[SECTOR_WAVES[sec][inSec]](diff());
  }
  function stageCleared() {
    const wasBoss = isBossStage(stage);
    stage++;
    if (stage >= SECTORS * STAGES_PER_SECTOR) { stage = 0; loop++; sfx.win(); }
    if (wasBoss) { sfx.win(); score += 2000 * (1 + loop); player.bombs = Math.min(5, player.bombs + 1); }
    nextAt = wasBoss ? 2.2 : 0.9;
  }
  let nextAt = 0;
  function gameOver() {
    if (score > save.best) { save.best = Math.floor(score); persist(); }
    const sec = sectorOf(stage);
    $("over-title").textContent = "Game over";
    $("over-text").textContent = "Score " + Math.floor(score).toLocaleString() + " · reached sector " + (sec + 1) + ", " + SECTOR_NAMES[sec];
    $("btn-retry").textContent = "Retry sector " + (sec + 1);
    retrySector = sec;
    setState("over");
  }
  let retrySector = 0;
  function togglePause() {
    if (state === "play") setState("paused");
    else if (state === "paused") { last = performance.now(); setState("play"); }
  }
  function toggleMute() {
    save.mute = !save.mute; persist();
    if (master) master.gain.value = save.mute ? 0 : 0.5;
    $("btn-mute").classList.toggle("is-off", save.mute);
  }
  $("btn-new").onclick = () => startGame(0);
  $("btn-continue").onclick = () => startGame(save.sector);
  $("btn-resume").onclick = togglePause;
  $("btn-quit").onclick = () => setState("menu");
  $("btn-menu").onclick = () => setState("menu");
  $("btn-retry").onclick = () => startGame(retrySector);
  $("btn-pause").onclick = togglePause;
  $("btn-mute").onclick = () => { audioInit(); toggleMute(); };
  $("btn-bomb").addEventListener("pointerdown", (e) => { e.preventDefault(); audioInit(); if (state === "play") fireBomb(); });
  $("btn-mute").classList.toggle("is-off", save.mute);

  // ====================================================
  // UPDATE
  // ====================================================
  function update(dt) {
    time += dt; waveTime += dt;
    const p = player;

    // ----- player -----
    if (p.dead > 0) {
      p.dead -= dt;
      if (p.dead <= 0) return gameOver();
    } else {
      const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
      const ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
      if (kx || ky) { p.tx = clamp(p.tx + kx * 430 * dt, 18, W - 18); p.ty = clamp(p.ty + ky * 430 * dt, 60, H - 30); ptr.has = false; }
      else if (ptr.has && !ptr.touch) { p.tx = clamp(ptr.x, 18, W - 18); p.ty = clamp(ptr.y, 60, H - 30); }
      const ox = p.x;
      p.x += (p.tx - p.x) * Math.min(1, dt * 16); p.y += (p.ty - p.y) * Math.min(1, dt * 16);
      p.tilt = lerp(p.tilt, clamp((p.x - ox) / Math.max(dt, 1e-3) / 500, -1, 1), Math.min(1, dt * 10));
      p.inv -= dt; p.cd -= dt;
      if (p.cd <= 0) playerFire(p);
    }

    // ----- spawns, formations, enemies, boss -----
    for (let i = spawnQueue.length - 1; i >= 0; i--) if (waveTime >= spawnQueue[i].at) { spawnQueue[i].make(); spawnQueue.splice(i, 1); }
    updateForms(dt);
    for (const e of enemies) updateEnemy(e, dt);
    if (boss) updateBoss(boss, dt);

    // ----- player shots -----
    for (const s of shots) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y < -30 || s.x < -20 || s.x > W + 20) { s.dead = true; continue; }
      for (const e of enemies) {
        if (e.dead || (s.hit && s.hit.has(e.id))) continue;
        const dx = e.x - s.x, dy = e.y - s.y, rr = e.r + s.r;
        if (dx * dx + dy * dy < rr * rr) {
          damage(e, s.dmg);
          if (!e.dead) sfx.hit();
          parts.push({ x: s.x, y: s.y, vx: rand(-60, 60), vy: rand(20, 120), life: 0.18, max: 0.18, c: "#fff", s: 2 });
          if (s.pierce) { (s.hit || (s.hit = new Set())).add(e.id); } else { s.dead = true; break; }
        }
      }
      if (!s.dead && boss && boss.state === "fight") {
        // the boss is hit across its whole hull, not just a small circle
        if (Math.abs(s.x - boss.x) < 96 && Math.abs(s.y - boss.y) < 48 && !(s.hit && s.hit.has(-1))) {
          damage(boss, s.dmg);
          parts.push({ x: s.x, y: s.y, vx: rand(-80, 80), vy: rand(20, 140), life: 0.2, max: 0.2, c: "#ffd35c", s: 2 });
          if (s.pierce) (s.hit || (s.hit = new Set())).add(-1); else s.dead = true;
        }
      }
    }

    // ----- enemy shots and collisions with the ship -----
    const alive = p.dead <= 0;
    for (const b of eshots) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > H + 20 || b.y < -40 || b.x < -30 || b.x > W + 30) { b.dead = true; continue; }
      if (alive) { const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + p.r - 3; if (dx * dx + dy * dy < rr * rr) { b.dead = true; hurtPlayer(); } }
    }
    if (alive) {
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.r + p.r - 4;
        if (dx * dx + dy * dy < rr * rr) { if (p.inv <= 0) damage(e, 12); hurtPlayer(); }
      }
      if (boss && boss.state === "fight" && Math.abs(p.x - boss.x) < 92 && Math.abs(p.y - boss.y) < 46) hurtPlayer();
    }

    // ----- pickups: they drift down and are pulled in when close -----
    for (const k of pickups) {
      k.t += dt; k.y += k.vy * dt;
      const dx = p.x - k.x, dy = p.y - k.y, d2 = dx * dx + dy * dy;
      if (alive && d2 < 110 * 110) { const d = Math.sqrt(d2) + 1; k.x += dx / d * 340 * dt; k.y += dy / d * 340 * dt; }
      if (alive && d2 < 26 * 26) {
        k.dead = true; sfx.pickup();
        if (k.kind === "gem") { score += 50 * (1 + loop); }
        else if (k.kind === "power") { if (p.power < 10) { p.power++; popText(p.x, p.y - 30, "POWER " + p.power, "#8fd6ff"); } else { score += 500; popText(p.x, p.y - 30, "+500", "#ffd35c"); } }
        else if (k.kind === "weapon") { if (p.weapon === k.w) { p.power = Math.min(10, p.power + 1); } else p.weapon = k.w; popText(p.x, p.y - 30, WEAPONS[p.weapon].toUpperCase(), "#c9a8ff"); }
        else if (k.kind === "bomb") { p.bombs = Math.min(5, p.bombs + 1); popText(p.x, p.y - 30, "MISSILE", "#ffc28a"); }
        else if (k.kind === "life") { p.lives = Math.min(5, p.lives + 1); popText(p.x, p.y - 30, "EXTRA SHIP", "#7dffb0"); }
      }
      if (k.y > H + 30) k.dead = true;
    }

    // ----- particles, floating text -----
    for (const q of parts) { q.life -= dt; if (!q.ring) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.985; q.vy *= 0.985; } }
    for (const q of texts) { q.t += dt; q.y -= 40 * dt; }

    // ----- sweep the dead -----
    enemies = enemies.filter((e) => !e.dead && !e.gone);
    shots = shots.filter((s) => !s.dead);
    eshots = eshots.filter((s) => !s.dead);
    pickups = pickups.filter((s) => !s.dead);
    parts = parts.filter((s) => s.life > 0);
    texts = texts.filter((s) => s.t < 1);
    if (parts.length > 700) parts.splice(0, parts.length - 700);

    // ----- wave finished? -----
    if (nextAt > 0) { nextAt -= dt; if (nextAt <= 0) beginStage(); }
    else if (!boss && !isBossStage(stage) && enemies.length === 0 && spawnQueue.length === 0 && alive) stageCleared();

    if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
    shake = Math.max(0, shake - dt * 40); flashAll = Math.max(0, flashAll - dt * 1.6);
  }

  // ====================================================
  // RENDER
  // ====================================================
  function drawBackground(dt, moving) {
    const sec = state === "menu" ? 0 : sectorOf(stage), hue = SECTOR_HUES[sec];
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, hsl(hue, 55, 7)); bg.addColorStop(0.6, "#03040a"); bg.addColorStop(1, hsl(hue + 40, 50, 6));
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // a soft nebula blob that drifts
    const nb = g.createRadialGradient(W * 0.3 + Math.sin(time * 0.05) * 80, H * 0.35, 10, W * 0.3, H * 0.35, 380);
    nb.addColorStop(0, hsl(hue, 80, 45, 0.16)); nb.addColorStop(1, hsl(hue, 80, 45, 0));
    g.fillStyle = nb; g.fillRect(0, 0, W, H);
    for (const s of stars) {
      if (moving) { s.y += (40 + 240 * s.z * s.z) * dt; if (s.y > H) { s.y = -4; s.x = rand(W); } }
      g.globalAlpha = 0.35 + 0.65 * s.z * (0.7 + 0.3 * Math.sin(time * 3 + s.tw));
      g.fillStyle = "#fff"; g.fillRect(s.x, s.y, 1 + s.z * 1.6, 1 + s.z * (moving ? 5 : 1.6));
    }
    g.globalAlpha = 1;
  }
  const PICK_STYLE = { gem: ["#ffe27a", "◆"], power: ["#8fd6ff", "P"], weapon: ["#c9a8ff", "W"], bomb: ["#ffc28a", "✹"], life: ["#7dffb0", "+"] };
  function render() {
    g.save();
    if (shake > 0) g.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

    for (const k of pickups) {
      const st = PICK_STYLE[k.kind];
      g.save(); g.translate(k.x, k.y);
      glow(st[0], 12);
      if (k.kind === "gem") { g.rotate(k.t * 3); poly([0, -8, 6, 0, 0, 8, -6, 0], st[0]); }
      else {
        g.fillStyle = "rgba(3,6,13,0.85)"; g.strokeStyle = st[0]; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 12 + Math.sin(k.t * 6) * 1.5, 0, TAU); g.fill(); g.stroke();
        noGlow(); g.fillStyle = st[0]; g.font = "700 14px 'Space Grotesk', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(k.kind === "weapon" ? WEAPONS[k.w][0] : st[1], 0, 1);
      }
      g.restore(); noGlow();
    }

    for (const e of enemies) drawEnemy(e, time);
    if (boss) drawBoss(boss, time);

    // player shots
    for (const s of shots) {
      const c = s.w === 0 ? "#9fe8ff" : s.w === 1 ? "#ffd98a" : "#ff8ad8";
      glow(c, 10); g.fillStyle = c;
      if (s.w === 2) g.fillRect(s.x - 1.5, s.y - s.len, 3, s.len * 1.6);
      else { g.beginPath(); g.ellipse(s.x, s.y, 3, 8, Math.atan2(s.vx, -s.vy), 0, TAU); g.fill(); }
    }
    // enemy shots: a bright core in a coloured ring, so they stand out
    for (const b of eshots) {
      glow(b.c, 12); g.fillStyle = b.c; g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
      noGlow(); g.fillStyle = "#fff"; g.beginPath(); g.arc(b.x, b.y, b.r * 0.45, 0, TAU); g.fill();
    }
    noGlow();

    if (player && player.dead <= 0 && state !== "menu") drawPlayer(player, time);

    for (const q of parts) {
      const a = clamp(q.life / q.max, 0, 1);
      g.globalAlpha = a;
      if (q.ring) { g.strokeStyle = q.c; g.lineWidth = 3; g.beginPath(); g.arc(q.x, q.y, (1 - a) * 90 + 10, 0, TAU); g.stroke(); }
      else { g.fillStyle = q.c; g.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); }
    }
    g.globalAlpha = 1;
    g.font = "700 14px 'Space Grotesk', sans-serif"; g.textAlign = "center";
    for (const q of texts) { g.globalAlpha = 1 - q.t; g.fillStyle = q.c; g.fillText(q.s, q.x, q.y); }
    g.globalAlpha = 1;
    g.restore();

    if (flashAll > 0) { g.fillStyle = "rgba(255,255,255," + flashAll * 0.6 + ")"; g.fillRect(0, 0, W, H); }
    if (state === "play" || state === "paused") drawHud();
  }
  function drawHud() {
    const p = player;
    g.textBaseline = "top"; g.textAlign = "left";
    g.fillStyle = "#fff"; g.font = "700 20px 'Space Grotesk', sans-serif";
    g.fillText(Math.floor(score).toLocaleString(), 14, 12);
    g.fillStyle = "#b9c2d6"; g.font = "500 12px 'Space Grotesk', sans-serif";
    const sec = sectorOf(stage), inSec = stage % STAGES_PER_SECTOR;
    g.fillText("SECTOR " + (sec + 1) + " · " + (isBossStage(stage) ? "BOSS" : "WAVE " + (inSec + 1) + "/5") + (loop ? " · LOOP " + (loop + 1) : ""), 14, 37);
    // lives, missiles, weapon along the bottom
    const by = H - 26;
    for (let k = 0; k < Math.max(0, p.lives); k++) { g.save(); g.translate(22 + k * 22, by); g.scale(0.4, 0.4); poly([0, -26, 26, 16, 0, 8, -26, 16], "#e8eeff"); g.restore(); }
    g.fillStyle = "#ffc28a"; g.font = "700 15px 'Space Grotesk', sans-serif"; g.textBaseline = "middle";
    g.fillText("✹".repeat(p.bombs), 22 + Math.max(0, p.lives) * 22 + 8, by + 1);
    g.textAlign = "right"; g.fillStyle = "#c9a8ff"; g.font = "600 12px 'Space Grotesk', sans-serif";
    g.fillText(WEAPONS[p.weapon].toUpperCase() + " " + p.power + "/10", W - 96, by + 1);
    g.textAlign = "left";
    // boss bar
    if (boss && boss.state !== "enter") {
      const w = W - 120, x = 60, y = 64, f = clamp(boss.hp / boss.maxHp, 0, 1);
      g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(x, y, w, 8);
      g.fillStyle = f < 0.5 ? "#ff4d4d" : "#ffd35c"; g.fillRect(x, y, w * f, 8);
      g.fillStyle = "#fff"; g.font = "600 11px 'Space Grotesk', sans-serif"; g.textAlign = "center"; g.textBaseline = "bottom";
      g.fillText(BOSS_NAMES[boss.kind].toUpperCase(), W / 2, y - 3);
    }
    if (banner) {
      const a = Math.min(1, banner.t * 3, (banner.dur - banner.t) * 3);
      g.globalAlpha = clamp(a, 0, 1); g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = banner.warn ? (Math.floor(banner.t * 6) % 2 ? "#ff4d4d" : "#ffd35c") : "#fff";
      g.font = "700 34px 'Space Grotesk', sans-serif"; g.fillText(banner.text, W / 2, H * 0.36);
      if (banner.sub) { g.fillStyle = "#b9c2d6"; g.font = "500 16px 'Space Grotesk', sans-serif"; g.fillText(banner.sub, W / 2, H * 0.36 + 32); }
      g.globalAlpha = 1;
    }
  }

  // ====================================================
  // MAIN LOOP
  // ====================================================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state === "play") update(dt); else time += dt * (state === "menu" ? 1 : 0);
    drawBackground(dt, state !== "paused");
    render();
    requestAnimationFrame(frame);
  }
  setState("menu");
  requestAnimationFrame(frame);

  // a small handle for automated tests
  window.__starship = { get state() { return state; }, get stage() { return stage; }, get score() { return score; },
    get counts() { return { enemies: enemies.length, shots: shots.length, eshots: eshots.length, boss: !!boss, lives: player ? player.lives : null }; },
    skip() { enemies.length = 0; spawnQueue.length = 0; if (boss) { boss.hp = 1; } }, god() { if (player) player.inv = 1e9; } };
})();

/* Lattice: a block placement puzzle. Fit the pieces onto the board; nothing falls. */
(() => {
  "use strict";

  const N = 8;
  const SAVE_KEY = "lattice-v1";
  const $ = (id) => document.getElementById(id);
  // the text in the language chosen for the site: English, or Vietnamese
  const TX = (en, vi) => (window.PlayLang ? window.PlayLang.t(en, vi) : en);

  // ------------------------------------------------------------ pieces
  // Each base shape is one "element" with its own colour. e and h are the
  // draw weights at the start of a game and late in a game.
  const BASES = [
    { key: "H",  name: "hydrogen",  col: [214, 236, 255], art: "#",            e: 2.0, h: 1.2 },
    { key: "He", name: "helium",    col: [143, 214, 255], art: "##",           e: 3.0, h: 1.5 },
    { key: "Li", name: "lithium",   col: [201, 168, 255], art: "###",          e: 3.0, h: 2.0 },
    { key: "Be", name: "beryllium", col: [143, 240, 192], art: "#./##",        e: 3.0, h: 2.4 },
    { key: "B",  name: "boron",     col: [255, 194, 138], art: "####",         e: 2.5, h: 2.4 },
    { key: "C",  name: "carbon",    col: [255, 224, 138], art: "##/##",        e: 3.0, h: 2.4 },
    { key: "N",  name: "nitrogen",  col: [127, 162, 255], art: "###/.#.",      e: 2.0, h: 2.5 },
    { key: "O",  name: "oxygen",    col: [255, 143, 122], art: "#./#./##",     e: 2.0, h: 2.5, mirror: true },
    { key: "F",  name: "fluorine",  col: [198, 240, 138], art: ".##/##.",      e: 1.0, h: 2.5, mirror: true },
    { key: "Ne", name: "neon",      col: [255, 157, 181], art: "#####",        e: 1.0, h: 2.4 },
    { key: "Na", name: "sodium",    col: [111, 224, 224], art: "#../#../###",  e: 0.8, h: 2.4 },
    { key: "Mg", name: "magnesium", col: [236, 168, 255], art: "###/###",      e: 1.0, h: 2.0 },
    { key: "Al", name: "aluminium", col: [255, 178, 102], art: "###/###/###",  e: 0.6, h: 2.2 },
    { key: "Si", name: "silicon",   col: [160, 200, 255], art: ".#./###/.#.",  e: 0.2, h: 1.5 },
    { key: "P",  name: "phosphorus",col: [255, 214, 170], art: "#.#/###",      e: 0.2, h: 1.5 },
    { key: "S",  name: "sulfur",    col: [170, 255, 214], art: "###/.#./.#.",  e: 0.2, h: 1.5 },
  ];
  const VARIANTS = [];
  (function buildVariants() {
    const norm = (cells) => {
      const mr = Math.min(...cells.map((p) => p[0])), mc = Math.min(...cells.map((p) => p[1]));
      return cells.map((p) => [p[0] - mr, p[1] - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    };
    BASES.forEach((b, bi) => {
      let cells = [];
      b.art.split("/").forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === "#") cells.push([r, c]); });
      b.variants = [];
      const seen = new Set();
      const flips = b.mirror ? 2 : 1;
      for (let f = 0; f < flips; f++) {
        let cur = f ? cells.map((p) => [p[0], -p[1]]) : cells;
        for (let rot = 0; rot < 4; rot++) {
          cur = norm(cur.map((p) => [p[1], -p[0]]));
          const sig = JSON.stringify(cur);
          if (seen.has(sig)) continue;
          seen.add(sig);
          const v = {
            id: VARIANTS.length, base: bi, cells: cur, col: bi,
            h: Math.max(...cur.map((p) => p[0])) + 1, w: Math.max(...cur.map((p) => p[1])) + 1,
          };
          VARIANTS.push(v);
          b.variants.push(v);
        }
      }
    });
  })();

  // ------------------------------------------------------------ pure rules
  const fits = (cells, v, r, c) => {
    if (r < 0 || c < 0 || r + v.h > N || c + v.w > N) return false;
    for (let k = 0; k < v.cells.length; k++) if (cells[(r + v.cells[k][0]) * N + c + v.cells[k][1]]) return false;
    return true;
  };
  const anyFit = (cells, v) => {
    for (let r = 0; r <= N - v.h; r++) for (let c = 0; c <= N - v.w; c++) if (fits(cells, v, r, c)) return true;
    return false;
  };
  // rows and columns that are full once v sits at r, c
  const linesFor = (cells, v, r, c) => {
    const mine = new Set(v.cells.map((p) => (r + p[0]) * N + c + p[1]));
    const rows = [], cols = [];
    for (let rr = r; rr < r + v.h; rr++) {
      let full = true;
      for (let cc = 0; cc < N; cc++) { const i = rr * N + cc; if (!cells[i] && !mine.has(i)) { full = false; break; } }
      if (full) rows.push(rr);
    }
    for (let cc = c; cc < c + v.w; cc++) {
      let full = true;
      for (let rr = 0; rr < N; rr++) { const i = rr * N + cc; if (!cells[i] && !mine.has(i)) { full = false; break; } }
      if (full) cols.push(cc);
    }
    return { rows, cols };
  };
  const lineScore = (n, streak) => Math.round((10 * n + 5 * n * (n - 1)) * (1 + 0.5 * (streak - 1)));
  const CLEAN_BONUS = 100;

  // Can every piece in vs be placed one after another, in some order? Returns
  // true, false, or null when the search budget runs out before an answer.
  function solvable(cells, vs, budget) {
    if (!vs.length) return true;
    let unknown = false;
    for (let k = 0; k < vs.length; k++) {
      const v = vs[k];
      if (vs.indexOf(v) < k) continue;
      const rest = vs.filter((_, j) => j !== k);
      for (let r = 0; r <= N - v.h; r++) for (let c = 0; c <= N - v.w; c++) {
        if (--budget.n < 0) return null;
        if (!fits(cells, v, r, c)) continue;
        if (!rest.length) return true;
        const ln = linesFor(cells, v, r, c);
        const next = cells.slice();
        for (const p of v.cells) next[(r + p[0]) * N + c + p[1]] = 1;
        for (const rr of ln.rows) for (let cc = 0; cc < N; cc++) next[rr * N + cc] = 0;
        for (const cc of ln.cols) for (let rr = 0; rr < N; rr++) next[rr * N + cc] = 0;
        const res = solvable(next, rest, budget);
        if (res === true) return true;
        if (res === null) { unknown = true; return null; }
      }
    }
    return unknown ? null : false;
  }

  // ------------------------------------------------------------ save
  const save = { best: 0, mute: false, seen: false, game: null };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  save.best = Number.isFinite(+save.best) && +save.best >= 0 ? Math.floor(+save.best) : 0;
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // ------------------------------------------------------------ game state
  let G = null;
  let modal = null;          // id of the open panel, or null
  let overTimer = 0;

  function rand() { // mulberry32, state kept in G so a reload continues the same sequence
    G.rng = (G.rng + 0x6D2B79F5) | 0;
    let t = G.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function freshGame(seed) {
    G = {
      cells: new Array(N * N).fill(0), pid: new Array(N * N).fill(0),
      tray: [null, null, null], score: 0, streak: 0, placed: 0, lines: 0, nextPid: 1,
      rng: (seed === undefined ? (Math.random() * 4294967296) : seed) | 0,
      over: false, snap: null, undoUsed: false,
    };
    deal();
  }

  function pickSet() {
    const d = Math.min(1, G.score / 2500);
    let filled = 0;
    for (let i = 0; i < N * N; i++) if (G.cells[i]) filled++;
    const crowded = filled / (N * N) > 0.5;
    const pool = BASES.map((b, bi) => {
      const ok = b.variants.filter((v) => anyFit(G.cells, v));
      let w = b.e + (b.h - b.e) * d;
      if (!ok.length) w *= crowded ? 0.25 : 0.6;
      return { bi, ok, w };
    });
    const draw = (list) => {
      let total = 0;
      for (const p of list) total += p.w;
      let x = rand() * total;
      for (const p of list) { x -= p.w; if (x <= 0) return p; }
      return list[list.length - 1];
    };
    const toVariant = (p) => {
      const from = p.ok.length ? p.ok : BASES[p.bi].variants;
      return from[Math.floor(rand() * from.length) % from.length];
    };
    const left = pool.slice(), set = [];
    for (let k = 0; k < 3; k++) {
      const p = draw(left);
      left.splice(left.indexOf(p), 1);
      set.push(toVariant(p));
    }
    // fairness floor: at least one of the three fits when anything fits at all
    if (!set.some((v) => anyFit(G.cells, v))) {
      const fitting = pool.filter((p) => p.ok.length);
      if (fitting.length) set[Math.floor(rand() * 3) % 3] = toVariant(draw(fitting));
    }
    return set;
  }

  function deal() {
    let set = null;
    // prefer a set that can be placed completely, in some order
    for (let attempt = 0; attempt < 10; attempt++) {
      set = pickSet();
      if (solvable(G.cells, set, { n: 30000 }) !== false) break;
    }
    G.tray = set.map((v) => v.id);
    G.snap = null;
    G.undoUsed = false;
    dealT = performance.now();
    kick(500);
  }

  const trayVariant = (i) => (G.tray[i] === null || G.tray[i] === undefined ? null : VARIANTS[G.tray[i]]);
  const hasMove = () => {
    for (let i = 0; i < 3; i++) { const v = trayVariant(i); if (v && anyFit(G.cells, v)) return true; }
    return false;
  };
  const canUndo = () => !!(G && G.snap && !G.undoUsed);

  function place(i, r, c) {
    if (!G || G.over) return false;
    const v = trayVariant(i);
    if (!v || !fits(G.cells, v, r, c)) return false;
    const now = performance.now();
    G.snap = G.undoUsed ? null : {
      cells: G.cells.slice(), pid: G.pid.slice(), tray: G.tray.slice(), score: G.score, streak: G.streak,
      placed: G.placed, lines: G.lines, nextPid: G.nextPid, rng: G.rng, best: save.best,
    };
    const id = G.nextPid++;
    const ln = linesFor(G.cells, v, r, c);
    for (const p of v.cells) {
      const idx = (r + p[0]) * N + c + p[1];
      G.cells[idx] = v.col + 1; G.pid[idx] = id;
      pops[idx] = now;
    }
    let gain = v.cells.length;
    const n = ln.rows.length + ln.cols.length;
    let cleanSlate = false;
    if (n) {
      const gone = new Set();
      for (const rr of ln.rows) for (let cc = 0; cc < N; cc++) gone.add(rr * N + cc);
      for (const cc of ln.cols) for (let rr = 0; rr < N; rr++) gone.add(rr * N + cc);
      for (const idx of gone) {
        clearFx.push({ idx, col: G.cells[idx] - 1, t0: now });
        G.cells[idx] = 0; G.pid[idx] = 0; delete pops[idx];
      }
      for (const rr of ln.rows) bands.push({ row: rr, t0: now });
      for (const cc of ln.cols) bands.push({ col: cc, t0: now });
      G.streak++;
      G.lines += n;
      gain += lineScore(n, G.streak);
      cleanSlate = G.cells.every((x) => !x);
      if (cleanSlate) gain += CLEAN_BONUS;
      burst(gone, now);
    } else {
      G.streak = 0;
    }
    G.score += gain;
    G.placed++;
    if (G.score > save.best) save.best = G.score;
    G.tray[i] = null;
    const dealt = G.tray.every((x) => x === null);
    if (dealt) deal();
    G.over = !hasMove();

    // feedback
    if (L.cell) {
      const fx = L.bx + (c + v.w / 2) * L.cell, fy = L.by + (r + v.h / 2) * L.cell;
      floaters.push({ text: "+" + gain, x: fx, y: fy - L.cell * 0.2, t0: now, big: n > 0, col: n ? "#ffffff" : "rgba(214,236,255,0.9)" });
      if (n && G.streak > 1) floaters.push({ text: TX("Streak ", "Chuỗi ") + G.streak, x: fx, y: fy + L.cell * 0.55, t0: now + 90, big: false, col: "#c9a8ff" });
      if (cleanSlate) floaters.push({ text: TX("Clean slate", "Sạch bàn"), x: L.bx + L.bw / 2, y: L.by + L.bw / 2, t0: now + 200, big: true, col: "#ffc28a" });
    }
    if (n) sndClear(n, G.streak); else sndPlace(v.cells.length);
    kick(1200);
    commit();
    if (G.over) {
      clearTimeout(overTimer);
      overTimer = setTimeout(showOver, n ? 900 : 550);
    }
    return true;
  }

  function undo() {
    if (!canUndo()) return false;
    const s = G.snap;
    clearTimeout(overTimer);
    G.cells = s.cells; G.pid = s.pid; G.tray = s.tray; G.score = s.score; G.streak = s.streak;
    G.placed = s.placed | 0; G.lines = s.lines | 0; G.nextPid = (s.nextPid | 0) || 1; G.rng = s.rng | 0;
    save.best = s.best;
    G.snap = null; G.undoUsed = true; G.over = false;
    clearFx.length = 0; bands.length = 0; particles.length = 0; floaters.length = 0;
    for (const k in pops) delete pops[k];
    kb = null; cancelDrag(false); ret = null;
    if (modal === "over") closePanel();
    sndUndo();
    commit();
    kick(300);
    return true;
  }

  function newGame(seed) {
    clearTimeout(overTimer);
    cancelDrag(false); ret = null;
    kb = null;
    clearFx.length = 0; bands.length = 0; particles.length = 0; floaters.length = 0;
    for (const k in pops) delete pops[k];
    freshGame(seed);
    commit();
    kick(600);
  }

  function commit() {
    save.game = {
      cells: G.cells, pid: G.pid, tray: G.tray, score: G.score, streak: G.streak, placed: G.placed,
      lines: G.lines, nextPid: G.nextPid, rng: G.rng, over: G.over, snap: G.snap, undoUsed: G.undoUsed,
    };
    persist();
    hud();
  }

  function restore() {
    const g = save.game;
    const okBoard = (a) => Array.isArray(a) && a.length === N * N && a.every((x) => Number.isInteger(x) && x >= 0);
    const okTray = (t) => Array.isArray(t) && t.length === 3 && t.every((x) => x === null || (Number.isInteger(x) && x >= 0 && x < VARIANTS.length));
    try {
      if (!g || g.over || !okBoard(g.cells) || !okBoard(g.pid) || !okTray(g.tray)) return false;
      if (!g.cells.every((x) => x <= BASES.length) || g.tray.every((x) => x === null)) return false;
      if (!Number.isFinite(g.score) || !Number.isFinite(g.streak)) return false;
      let snap = null;
      const s = g.snap;
      if (s && okBoard(s.cells) && okBoard(s.pid) && okTray(s.tray) && Number.isFinite(s.score) && Number.isFinite(s.streak) &&
          Number.isFinite(s.best) && Number.isFinite(s.rng) && s.cells.every((x) => x <= BASES.length)) snap = s;
      G = {
        cells: g.cells.slice(), pid: g.pid.slice(), tray: g.tray.slice(), score: g.score, streak: g.streak,
        placed: g.placed | 0, lines: g.lines | 0, nextPid: (g.nextPid | 0) || 1, rng: g.rng | 0,
        over: false, snap, undoUsed: !!g.undoUsed,
      };
      if (!hasMove()) return false;
      return true;
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------ sound
  let ac = null, master = null, echo = null;
  function audio() {
    if (!ac) {
      try {
        if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch (e) {} }
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = save.mute ? 0 : 0.55; master.connect(ac.destination);
        echo = ac.createDelay(0.6); echo.delayTime.value = 0.21;
        const fb = ac.createGain(); fb.gain.value = 0.3;
        const wet = ac.createGain(); wet.gain.value = 0.25;
        echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(master);
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === "suspended") { try { ac.resume().catch(() => {}); } catch (e) {} }
    return ac;
  }
  // a glassy bell: a sine with two quiet inharmonic partials and a fast decay
  function glass(freq, delay, vol, dur) {
    if (save.mute || !ac || ac.state !== "running") return;
    const t = ac.currentTime + (delay || 0);
    const parts = [[1, 1], [2.76, 0.3], [5.4, 0.1]];
    for (const [ratio, amp] of parts) {
      const f = freq * ratio;
      if (f > 12000) continue;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      const d = dur / Math.sqrt(ratio);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(master); g.connect(echo);
      o.start(t); o.stop(t + d + 0.05);
    }
  }
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
  const note = (i) => 392 * Math.pow(2, SCALE[Math.max(0, Math.min(SCALE.length - 1, i))] / 12);
  const sndPick = () => glass(784, 0, 0.05, 0.12);
  const sndPlace = (size) => glass(note(Math.min(4, Math.floor(size / 2))), 0, 0.13, 0.35);
  const sndBad = () => glass(147, 0, 0.12, 0.22);
  function sndClear(n, streak) {
    const start = Math.min(7, streak - 1);       // the chime starts higher as the streak grows
    const count = Math.min(6, 2 + n);
    for (let k = 0; k < count; k++) glass(note(start + k), k * 0.075, 0.16, 0.9);
  }
  const sndUndo = () => { glass(note(4), 0, 0.1, 0.3); glass(note(2), 0.09, 0.1, 0.35); };
  const sndOver = () => { [5, 3, 2, 0].forEach((i, k) => glass(note(i) / 2, k * 0.16, 0.14, 0.9)); };
  const sndDeal = () => { glass(note(7), 0, 0.04, 0.2); };

  function setMute(m) {
    save.mute = !!m; persist();
    $("btn-mute").classList.toggle("is-off", save.mute);
    if (master) master.gain.value = save.mute ? 0 : 0.55;
  }

  // ------------------------------------------------------------ layout
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const L = { cell: 0, bx: 0, by: 0, bw: 0, slots: [], tcell: 0, side: false };
  const sprites = new Map();

  function layout() {
    W = Math.max(200, window.innerWidth); H = Math.max(200, window.innerHeight);
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    sprites.clear();
    const cs = getComputedStyle($("safe"));
    const px = (s) => parseFloat(s) || 0;
    const sb = px(cs.paddingBottom), sl = px(cs.paddingLeft), sr = px(cs.paddingRight);
    const top = $("bar").getBoundingClientRect().bottom + 10;
    const pad = 12, gap = 14;
    const left = pad + sl, right = W - pad - sr, bottom = H - sb - 10;
    const availW = right - left, availH = bottom - top;
    L.side = W > H * 1.25 && availH < 520;
    if (L.side) {
      const bw = Math.max(120, Math.min(availH, (availW - gap) * 0.75));
      const s = bw / 3, total = bw + gap + s;
      L.bw = bw; L.cell = bw / N;
      L.bx = left + (availW - total) / 2; L.by = top + (availH - bw) / 2;
      L.slots = [0, 1, 2].map((i) => ({ x: L.bx + bw + gap, y: L.by + i * s, w: s, h: s }));
      L.tcell = Math.min(L.cell * 0.62, s / 5.6);
    } else {
      const bw = Math.max(120, Math.min(availW, (availH - gap) * 0.75, 560));
      const s = bw / 3, total = bw + gap + s;
      L.bw = bw; L.cell = bw / N;
      L.bx = left + (availW - bw) / 2; L.by = top + Math.max(0, (availH - total) * 0.34);
      L.slots = [0, 1, 2].map((i) => ({ x: L.bx + i * s, y: L.by + bw + gap, w: s, h: s }));
      L.tcell = Math.min(L.cell * 0.62, s / 5.6);
    }
    cancelDrag(false);
    ret = null;
    kick(100);
  }

  // ------------------------------------------------------------ drawing
  let dirtyUntil = 0, dealT = -1e9;
  const kick = (ms) => { dirtyUntil = Math.max(dirtyUntil, performance.now() + (ms || 0) + 34); };
  const pops = {};           // board index -> time the block landed
  const clearFx = [];        // blocks flashing out
  const bands = [];          // row and column flashes
  const particles = [];
  const floaters = [];
  let drag = null;           // the piece under the pointer
  let ret = null;            // a piece gliding back to the tray
  let kb = null;             // keyboard cursor { i, r, c }

  const rgb = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a === undefined ? 1 : a) + ")";
  const mix = (c, to, t) => [0, 1, 2].map((k) => Math.round(c[k] + (to[k] - c[k]) * t));

  // one block: a square tile with a lighter face and a soft edge, drawn once per colour and size
  function blockSprite(colIdx, size) {
    const s = Math.max(4, Math.round(size * dpr));
    const key = colIdx + ":" + s;
    let cv = sprites.get(key);
    if (cv) return cv;
    cv = document.createElement("canvas");
    const m = Math.ceil(s * 0.12);              // margin, so a block can swell a little when it lands
    cv.width = cv.height = s + m * 2;
    cv.margin = m / dpr; cv.span = (s + m * 2) / dpr;
    const g = cv.getContext("2d");
    const col = BASES[colIdx].col, gap = s * 0.045, x = m + gap, w = s - gap * 2, r = s * 0.2;
    const box = (bx, by, bw, bh, br) => {
      g.beginPath();
      g.moveTo(bx + br, by); g.arcTo(bx + bw, by, bx + bw, by + bh, br); g.arcTo(bx + bw, by + bh, bx, by + bh, br);
      g.arcTo(bx, by + bh, bx, by, br); g.arcTo(bx, by, bx + bw, by, br); g.closePath();
    };
    // the body, a little darker towards the bottom
    const body = g.createLinearGradient(0, x, 0, x + w);
    body.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.1)));
    body.addColorStop(1, rgb(mix(col, [8, 10, 24], 0.34)));
    box(x, x, w, w, r); g.fillStyle = body; g.fill();
    // the raised face
    const inset = s * 0.11, face = g.createLinearGradient(0, x + inset, 0, x + w - inset);
    face.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.42)));
    face.addColorStop(1, rgb(mix(col, [255, 255, 255], 0.08)));
    box(x + inset, x + inset, w - inset * 2, w - inset * 2, r * 0.6); g.fillStyle = face; g.fill();
    // a thin dark edge so neighbouring blocks stay separate
    box(x, x, w, w, r); g.strokeStyle = rgb(mix(col, [8, 10, 24], 0.55), 0.9); g.lineWidth = Math.max(1, s * 0.03); g.stroke();
    sprites.set(key, cv);
    return cv;
  }
  function drawBlock(colIdx, cx, cy, size, scale, alpha) {
    const base = size === L.tcell ? L.tcell : L.cell;
    const sp = blockSprite(colIdx, base);
    const span = sp.span * (size / base) * (scale || 1);
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    ctx.drawImage(sp, cx - span / 2, cy - span / 2, span, span);
    ctx.globalAlpha = 1;
  }
  function drawPiece(v, cx, cy, cs, alpha) {
    const x0 = cx - v.w * cs / 2, y0 = cy - v.h * cs / 2;
    for (const p of v.cells) drawBlock(v.col, x0 + (p[1] + 0.5) * cs, y0 + (p[0] + 0.5) * cs, cs, 1, alpha);
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  function drawGhost(v, r, c, ok) {
    const cs = L.cell;
    if (ok) {
      const ln = linesFor(G.cells, v, r, c);
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      for (const row of ln.rows) { rr(L.bx + 2, L.by + row * cs + 2, L.bw - 4, cs - 4, cs * 0.24); ctx.fill(); }
      for (const col of ln.cols) { rr(L.bx + col * cs + 2, L.by + 2, cs - 4, L.bw - 4, cs * 0.24); ctx.fill(); }
      // blocks already on a line that is about to clear get a bright outline
      ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = Math.max(1.5, cs * 0.06);
      const ring = (idx) => {
        if (!G.cells[idx]) return;
        rr(L.bx + (idx % N) * cs + cs * 0.07, L.by + Math.floor(idx / N) * cs + cs * 0.07, cs * 0.86, cs * 0.86, cs * 0.2); ctx.stroke();
      };
      for (const row of ln.rows) for (let cc = 0; cc < N; cc++) ring(row * N + cc);
      for (const col of ln.cols) for (let r2 = 0; r2 < N; r2++) ring(r2 * N + col);
      const willClear = ln.rows.length + ln.cols.length > 0;
      for (const p of v.cells) {
        const x = L.bx + (c + p[1] + 0.5) * cs, y = L.by + (r + p[0] + 0.5) * cs;
        ctx.fillStyle = rgb(BASES[v.col].col, willClear ? 0.5 : 0.3);
        ctx.strokeStyle = willClear ? "rgba(255,255,255,0.95)" : rgb(BASES[v.col].col, 0.95);
        ctx.lineWidth = Math.max(1.5, cs * 0.05);
        rr(x - cs * 0.43, y - cs * 0.43, cs * 0.86, cs * 0.86, cs * 0.2); ctx.fill(); ctx.stroke();
      }
    } else {
      for (const p of v.cells) {
        const rr2 = r + p[0], cc = c + p[1];
        if (rr2 < 0 || cc < 0 || rr2 >= N || cc >= N) continue;
        const x = L.bx + (cc + 0.5) * cs, y = L.by + (rr2 + 0.5) * cs;
        ctx.fillStyle = "rgba(255,110,120,0.16)"; ctx.strokeStyle = "rgba(255,110,120,0.8)";
        ctx.lineWidth = Math.max(1.5, cs * 0.04);
        rr(x - cs * 0.4, y - cs * 0.4, cs * 0.8, cs * 0.8, cs * 0.18); ctx.fill(); ctx.stroke();
      }
    }
  }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!G || !L.cell) return;
    const cs = L.cell;

    // the board: a tray of empty squares
    rr(L.bx - 6, L.by - 6, L.bw + 12, L.bw + 12, cs * 0.34);
    ctx.fillStyle = "rgba(10,14,28,0.78)"; ctx.fill();
    ctx.strokeStyle = "rgba(143,214,255,0.22)"; ctx.lineWidth = 1; ctx.stroke();
    for (let i = 0; i < N * N; i++) {
      const x = L.bx + (i % N) * cs, y = L.by + Math.floor(i / N) * cs;
      rr(x + cs * 0.045, y + cs * 0.045, cs * 0.91, cs * 0.91, cs * 0.2);
      ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fill();
    }
    const dim = G.over ? 0.55 : 1;
    // the blocks on the board
    for (let i = 0; i < N * N; i++) {
      if (!G.cells[i]) continue;
      const x = L.bx + (i % N + 0.5) * cs, y = L.by + (Math.floor(i / N) + 0.5) * cs;
      let sc = 1;
      if (pops[i] !== undefined) {
        const t = (now - pops[i]) / 260;
        if (t >= 1) delete pops[i]; else sc = 1 + 0.22 * Math.sin(Math.PI * Math.max(0, t)) * (1 - t);
      }
      drawBlock(G.cells[i] - 1, x, y, cs, sc, dim);
    }

    // line flashes and blocks flashing out
    for (let k = bands.length - 1; k >= 0; k--) {
      const b = bands[k], t = (now - b.t0) / 420;
      if (t >= 1) { bands.splice(k, 1); continue; }
      ctx.fillStyle = "rgba(255,255,255," + (0.55 * (1 - t)).toFixed(3) + ")";
      const grow = cs * 0.1 * t;
      if (b.row !== undefined) rr(L.bx, L.by + b.row * cs + 3 + grow, L.bw, cs - 6 - grow * 2, cs * 0.3);
      else rr(L.bx + b.col * cs + 3 + grow, L.by, cs - 6 - grow * 2, L.bw, cs * 0.3);
      ctx.fill();
    }
    for (let k = clearFx.length - 1; k >= 0; k--) {
      const f = clearFx[k], t = (now - f.t0) / 340;
      if (t >= 1) { clearFx.splice(k, 1); continue; }
      const x = L.bx + (f.idx % N + 0.5) * cs, y = L.by + (Math.floor(f.idx / N) + 0.5) * cs;
      drawBlock(f.col, x, y, cs, 1 + 0.35 * t, 1 - t);
      ctx.fillStyle = "rgba(255,255,255," + (0.8 * (1 - t) * (1 - t)).toFixed(3) + ")";
      const half = cs * 0.43 * (1 + 0.35 * t);
      rr(x - half, y - half, half * 2, half * 2, cs * 0.2); ctx.fill();
    }

    // ghost
    if (!G.over) {
      if (drag && drag.target) drawGhost(drag.v, drag.target.r, drag.target.c, true);
      else if (drag && drag.bad) drawGhost(drag.v, drag.bad.r, drag.bad.c, false);
      else if (kb && trayVariant(kb.i)) { const v = trayVariant(kb.i); drawGhost(v, kb.r, kb.c, fits(G.cells, v, kb.r, kb.c)); }
    }

    // tray
    const dealAge = (now - dealT) / 380;
    for (let i = 0; i < 3; i++) {
      const s = L.slots[i], v = trayVariant(i);
      rr(s.x + 4, s.y + 4, s.w - 8, s.h - 8, Math.min(18, s.w * 0.16));
      ctx.fillStyle = "rgba(10,14,28,0.55)"; ctx.fill();
      const picked = kb && kb.i === i && v;
      ctx.strokeStyle = picked ? "rgba(143,214,255,0.9)" : "rgba(255,255,255,0.09)";
      ctx.lineWidth = picked ? 2 : 1; ctx.stroke();
      if (!v) continue;
      if ((drag && drag.i === i) || (ret && ret.i === i)) continue;
      const stuck = !G.over && !anyFit(G.cells, v);
      const e = easeOut(dealAge - i * 0.18);
      const a = (stuck ? 0.35 : 1) * e * (G.over ? 0.5 : 1);
      if (a <= 0.01) continue;
      drawPiece(v, s.x + s.w / 2, s.y + s.h / 2 + (1 - e) * 14, L.tcell * (0.8 + 0.2 * e), a);
    }

    // a piece gliding home
    if (ret) {
      const t = (now - ret.t0) / 200;
      if (t >= 1) ret = null;
      else {
        const e = easeOut(t), s = L.slots[ret.i];
        drawPiece(ret.v, ret.x + (s.x + s.w / 2 - ret.x) * e, ret.y + (s.y + s.h / 2 - ret.y) * e, ret.cs + (L.tcell - ret.cs) * e, 1);
      }
    }
    // the piece in hand
    if (drag) {
      const k = 1 - Math.exp(-(now - drag.last) / 38);
      drag.last = now;
      drag.cx += (drag.wantX - drag.cx) * k; drag.cy += (drag.wantY - drag.cy) * k;
      drag.cs += (L.cell * 0.96 - drag.cs) * k;
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
      drawPiece(drag.v, drag.cx, drag.cy, drag.cs, drag.target ? 0.92 : drag.bad ? 0.5 : 1);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    // particles
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k], t = (now - p.t0) / p.life;
      if (t >= 1) { particles.splice(k, 1); continue; }
      if (t < 0) continue;
      const dt = (now - p.t0) / 1000;
      const x = p.x + p.vx * dt * (1 - 0.35 * t), y = p.y + p.vy * dt * (1 - 0.35 * t) + 160 * dt * dt;
      ctx.fillStyle = rgb(p.col, (1 - t) * 0.95);
      ctx.beginPath(); ctx.arc(x, y, p.r * (1 - 0.6 * t), 0, Math.PI * 2); ctx.fill();
    }
    // score floaters
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let k = floaters.length - 1; k >= 0; k--) {
      const f = floaters[k], t = (now - f.t0) / 950;
      if (t >= 1) { floaters.splice(k, 1); continue; }
      if (t < 0) continue;
      const size = Math.max(15, cs * (f.big ? 0.62 : 0.44));
      ctx.font = "700 " + size.toFixed(1) + "px 'Space Grotesk', system-ui, sans-serif";
      ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      const x = Math.max(L.bx + 30, Math.min(L.bx + L.bw - 30, f.x)), y = f.y - easeOut(t) * cs * 0.7;
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(3,4,10,0.85)"; ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.col; ctx.fillText(f.text, x, y);
      ctx.globalAlpha = 1;
    }
  }

  function burst(indexSet, now) {
    const cs = L.cell || 40;
    const per = particles.length > 300 ? 3 : 6;
    for (const idx of indexSet) {
      const f = clearFx.find((x) => x.idx === idx && x.t0 === now);
      const col = f ? mix(BASES[f.col].col, [255, 255, 255], 0.25) : [255, 255, 255];
      const x = L.bx + (idx % N + 0.5) * cs, y = L.by + (Math.floor(idx / N) + 0.5) * cs;
      for (let k = 0; k < per; k++) {
        const a = Math.random() * Math.PI * 2, sp = cs * (1.2 + Math.random() * 3.2);
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - cs * 0.8, r: cs * (0.05 + Math.random() * 0.07),
          col, t0: now + Math.random() * 90, life: 520 + Math.random() * 420 });
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const busy = drag || ret || particles.length || floaters.length || clearFx.length || bands.length || now < dirtyUntil;
    if (busy) draw(now);
  }

  // ------------------------------------------------------------ pointer input
  function liftFor(v, touch) {
    if (!touch) return { x: 0, y: 0 };
    if (L.side) return { x: -(v.w * L.cell / 2 + 40), y: 0 };
    return { x: 0, y: -(v.h * L.cell / 2 + 40) };
  }
  // where the pointer has to be so that piece v lands with its top left block on r, c
  function aimPoint(i, r, c, touch) {
    const v = trayVariant(i); if (!v) return null;
    const lift = liftFor(v, touch);
    return { x: L.bx + (c + v.w / 2) * L.cell - lift.x, y: L.by + (r + v.h / 2) * L.cell - lift.y };
  }
  function aim() {
    const v = drag.v, cs = L.cell;
    const fx = (drag.wantX - v.w * cs / 2 - L.bx) / cs, fy = (drag.wantY - v.h * cs / 2 - L.by) / cs;
    drag.target = null; drag.bad = null;
    if (!drag.armed) return;   // a tap on the tray must never place a piece
    if (fx < -v.w + 0.4 || fy < -v.h + 0.4 || fx > N - 0.4 || fy > N - 0.4) return;   // not over the lattice
    const r0 = Math.round(fy), c0 = Math.round(fx);
    let best = null, bestD = 1.3 * 1.3;
    for (let r = r0 - 2; r <= r0 + 2; r++) for (let c = c0 - 2; c <= c0 + 2; c++) {
      if (!fits(G.cells, v, r, c)) continue;
      const d = (r - fy) * (r - fy) + (c - fx) * (c - fx);
      if (d < bestD) { bestD = d; best = { r, c }; }
    }
    if (best) drag.target = best;
    else drag.bad = { r: Math.max(0, Math.min(N - v.h, r0)), c: Math.max(0, Math.min(N - v.w, c0)) };
  }
  function slotAt(x, y) {
    for (let i = 0; i < 3; i++) {
      const s = L.slots[i];
      if (x >= s.x - 4 && x <= s.x + s.w + 4 && y >= s.y - 8 && y <= s.y + s.h + 12) return i;
    }
    return -1;
  }
  function moveDrag(e) {
    const lift = liftFor(drag.v, drag.touch);
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.armed && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > Math.max(10, L.cell * 0.3)) drag.armed = true;
    drag.wantX = e.clientX + lift.x; drag.wantY = e.clientY + lift.y;
    aim();
  }
  function cancelDrag(glide) {
    if (!drag) return;
    try { canvas.releasePointerCapture(drag.id); } catch (e) {}
    if (glide) ret = { i: drag.i, v: drag.v, x: drag.cx, y: drag.cy, cs: drag.cs, t0: performance.now() };
    drag = null;
    kick(260);
  }
  canvas.addEventListener("pointerdown", (e) => {
    audio();
    if (modal || !G || G.over || drag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const i = slotAt(e.clientX, e.clientY);
    if (i < 0) return;
    const v = trayVariant(i);
    if (!v) return;
    e.preventDefault();
    kb = null; ret = null;
    const s = L.slots[i];
    drag = { i, v, id: e.pointerId, touch: e.pointerType === "touch", cx: s.x + s.w / 2, cy: s.y + s.h / 2, cs: L.tcell,
      last: performance.now(), target: null, bad: null, x: 0, y: 0, wantX: 0, wantY: 0,
      sx: e.clientX, sy: e.clientY, armed: false };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    moveDrag(e);
    sndPick();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    moveDrag(e);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.type === "pointerup") {
      moveDrag(e);
      if (drag.target) {
        const d = drag;
        try { canvas.releasePointerCapture(d.id); } catch (err) {}
        drag = null;
        place(d.i, d.target.r, d.target.c);
        return;
      }
      if (drag.bad) sndBad();
    }
    cancelDrag(true);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (!e.target.closest || !e.target.closest(".panel")) e.preventDefault(); }, { passive: false });
  document.addEventListener("dblclick", (e) => e.preventDefault());

  // ------------------------------------------------------------ keyboard
  function kbPick(i) {
    const v = trayVariant(i);
    if (!v || G.over) return;
    cancelDrag(true);
    if (kb && kb.i === i) { kb = null; kick(); return; }
    let r = kb ? kb.r : Math.floor((N - v.h) / 2), c = kb ? kb.c : Math.floor((N - v.w) / 2);
    kb = { i, r: Math.max(0, Math.min(N - v.h, r)), c: Math.max(0, Math.min(N - v.w, c)) };
    sndPick(); kick();
  }
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    audio();
    const k = e.key;
    if (modal) {
      if (k === "Escape") {
        if (modal === "confirm" || modal === "intro") { closePanel(); e.preventDefault(); }
      }
      return;
    }
    if (k === "m" || k === "M") { setMute(!save.mute); return; }
    if (k === "z" || k === "Z" || k === "u" || k === "U" || k === "Backspace") { undo(); e.preventDefault(); return; }
    if (k === "n" || k === "N") { askNew(); return; }
    if (!G || G.over) return;
    if (k === "1" || k === "2" || k === "3") { kbPick(+k - 1); return; }
    if (!kb) return;
    const v = trayVariant(kb.i);
    if (!v) { kb = null; return; }
    if (k === "ArrowLeft") kb.c = Math.max(0, kb.c - 1);
    else if (k === "ArrowRight") kb.c = Math.min(N - v.w, kb.c + 1);
    else if (k === "ArrowUp") kb.r = Math.max(0, kb.r - 1);
    else if (k === "ArrowDown") kb.r = Math.min(N - v.h, kb.r + 1);
    else if (k === "Enter" || k === " ") {
      if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
      const cur = kb; kb = null;
      if (!place(cur.i, cur.r, cur.c)) { kb = cur; sndBad(); }
    } else if (k === "Escape") kb = null;
    else return;
    e.preventDefault();
    kick();
  });

  // ------------------------------------------------------------ panels and HUD
  const panels = ["intro", "confirm", "over"];
  function openPanel(id) {
    cancelDrag(true); kb = null;
    modal = id;
    for (const p of panels) $(p).hidden = p !== id;
    $("veil").hidden = false;
    const b = $(id).querySelector("button:not([hidden])");
    if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} }
    kick();
  }
  function closePanel() {
    if (modal === "intro" && !save.seen) { save.seen = true; persist(); }
    modal = null;
    for (const p of panels) $(p).hidden = true;
    $("veil").hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (G && G.over) overTimer = setTimeout(showOver, 50);
    kick();
  }
  const bestLine = () => TX("Best score " + save.best + ".", "Kỷ lục: " + save.best + ".");
  // the words that are set from here and not written in the page, in the language now chosen
  let keepPlaying = false;      // the button on the how-to panel reads "Keep playing" once a game is under way
  function paintLang() {
    $("btn-play").textContent = keepPlaying ? TX("Keep playing", "Chơi tiếp") : TX("Play", "Chơi");
    $("intro-best").textContent = save.best > 0 ? bestLine() : "";
    if (G) {
      $("over-text").textContent = TX("None of your pieces fits anywhere on the lattice.", "Không còn khối nào đặt vừa trên bàn.");
      $("over-best").textContent = G.score > 0 && G.score >= save.best ? TX("A new best score.", "Kỷ lục mới.") : bestLine();
    }
    const label = (id, en, vi, title, titleVi) => { $(id).setAttribute("aria-label", TX(en, vi)); if (title) $(id).title = TX(title, titleVi); };
    label("game", "Lattice game board", "Bàn chơi Lattice");
    label("btn-undo", "Undo the last move", "Hoàn tác nước vừa đi", "Undo", "Hoàn tác");
    label("btn-new", "New game", "Ván mới", "New game", "Ván mới");
    label("btn-help", "How to play", "Cách chơi", "How to play", "Cách chơi");
    label("btn-mute", "Sound on or off", "Bật hoặc tắt âm thanh", "Sound", "Âm thanh");
    loadCanvasFont();
  }
  if (window.PlayLang) window.PlayLang.onChange(paintLang);
  // Google serves Space Grotesk in pieces, one for each group of alphabets, and words drawn on the canvas do
  // not make the browser fetch the piece their letters are in. So ask for it, and draw again when it is here.
  function loadCanvasFont() {
    if (!document.fonts || !document.fonts.load) return;
    document.fonts.load("700 16px 'Space Grotesk'", TX("Streak Clean slate", "Chuỗi Sạch bàn đơư")).then(() => kick(300)).catch(() => {});
  }
  function showOver() {
    if (!G || !G.over || modal === "over") return;
    $("over-score").textContent = G.score;
    paintLang();
    $("btn-over-undo").hidden = !canUndo();
    openPanel("over");
    sndOver();
  }
  function askNew() {
    if (!G) return;
    if (G.over || G.placed === 0) { if (modal) closePanel0(); newGame(); return; }
    openPanel("confirm");
  }
  function closePanel0() {   // close without re-opening the game over panel
    modal = null;
    for (const p of panels) $(p).hidden = true;
    $("veil").hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  let shown = { score: -1, best: -1, streak: -1 };
  function hud() {
    const set = (id, key, val) => {
      if (shown[key] === val) return;
      const el = $(id);
      el.textContent = val;
      if (shown[key] !== -1 && val > shown[key]) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
      shown[key] = val;
    };
    set("score", "score", G.score); set("best", "best", save.best); set("streak", "streak", G.streak);
    $("streak-box").classList.toggle("is-hot", G.streak >= 2);
    $("btn-undo").disabled = !canUndo();
  }

  for (const b of document.querySelectorAll(".bar .round")) b.addEventListener("click", () => b.blur());
  $("btn-undo").addEventListener("click", () => { audio(); undo(); });
  $("btn-new").addEventListener("click", () => { audio(); askNew(); });
  $("btn-help").addEventListener("click", () => {
    audio();
    keepPlaying = true;
    paintLang();
    openPanel("intro");
  });
  $("btn-mute").addEventListener("click", () => { audio(); setMute(!save.mute); if (!save.mute) setTimeout(() => glass(note(5), 0, 0.12, 0.4), 60); });
  $("btn-play").addEventListener("click", () => { audio(); closePanel(); sndDeal(); });
  $("btn-confirm").addEventListener("click", () => { audio(); closePanel0(); newGame(); sndDeal(); });
  $("btn-cancel").addEventListener("click", () => { closePanel(); });
  $("btn-again").addEventListener("click", () => { audio(); closePanel0(); newGame(); sndDeal(); });
  $("btn-over-undo").addEventListener("click", () => { audio(); if (!undo()) closePanel(); });
  $("veil").addEventListener("click", () => { if (modal === "confirm") closePanel(); });

  // ------------------------------------------------------------ lifecycle
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelDrag(false); ret = null; }
    else kick(200);
  });
  window.addEventListener("blur", () => cancelDrag(true));
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", () => { layout(); setTimeout(layout, 350); });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(() => {});

  const resumed = restore();
  if (!resumed) freshGame();
  setMute(save.mute);
  layout();
  commit();
  paintLang();
  if (!resumed || !save.seen) openPanel("intro");
  requestAnimationFrame(frame);

  // ------------------------------------------------------------ test handle
  window.__lattice = {
    N, variants: VARIANTS, bases: BASES, lineScore, cleanBonus: CLEAN_BONUS,
    get state() {
      return { cells: G.cells.slice(), tray: G.tray.slice(), score: G.score, best: save.best, streak: G.streak,
        placed: G.placed, lines: G.lines, over: G.over, canUndo: canUndo(), modal, dragging: !!drag, kb: kb ? Object.assign({}, kb) : null };
    },
    get layout() { return { cell: L.cell, bx: L.bx, by: L.by, bw: L.bw, slots: L.slots.map((s) => Object.assign({}, s)), side: L.side, W, H }; },
    fits: (i, r, c) => { const v = trayVariant(i); return !!v && fits(G.cells, v, r, c); },
    moves() {
      const out = [];
      for (let i = 0; i < 3; i++) {
        const v = trayVariant(i); if (!v) continue;
        for (let r = 0; r <= N - v.h; r++) for (let c = 0; c <= N - v.w; c++) if (fits(G.cells, v, r, c)) {
          const ln = linesFor(G.cells, v, r, c);
          out.push({ i, r, c, size: v.cells.length, lines: ln.rows.length + ln.cols.length });
        }
      }
      return out;
    },
    place, undo, newGame, aimPoint,
    closePanel: () => { if (modal) closePanel0(); },
    // test only: put the game in a given position. tray is three variant ids or nulls
    set(o) {
      clearTimeout(overTimer);
      if (modal) closePanel0();
      if (o.cells) { G.cells = o.cells.slice(); G.pid = G.cells.map((x, i) => (x ? 1000 + i : 0)); }
      if (o.tray) G.tray = o.tray.slice();
      if (o.score !== undefined) G.score = o.score;
      if (o.streak !== undefined) G.streak = o.streak;
      G.snap = null; G.undoUsed = false; G.over = !hasMove();
      commit(); kick(300);
      if (G.over) overTimer = setTimeout(showOver, 300);
    },
    redeal() { deal(); G.over = !hasMove(); commit(); return G.tray.slice(); },
    solvable: (cells, ids) => solvable(cells, ids.map((x) => VARIANTS[x]), { n: 2000000 }),
  };
})();

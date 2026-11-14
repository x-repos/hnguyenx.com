/* =========================================================
   Pair Path: join two matching tiles with a path of at most
   three straight segments through empty cells.
   Everything is drawn with canvas paths and all sound is
   synthesised, so there are no image or audio files.

   Layout of this file:
     save · audio · board rules (path search, sliding, solver)
     symbols and sprites · layout · game flow · input
     drawing · panels · main loop · test handle
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const g = canvas.getContext("2d");
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // the text in the language chosen for the site: English, or Vietnamese
  const TX = (en, vi) => (window.PlayLang ? window.PlayLang.t(en, vi) : en);
  // a number as the chosen language writes it: 1,200 and 0.5 in English, 1.200 and 0,5 in Vietnamese
  const num = (n) => n.toLocaleString(TX("en-US", "vi-VN"));
  const fmt = (n) => num(Math.round(n));
  function shuffleArr(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ====================================================
  // SAVE
  // ====================================================
  const SAVE_KEY = "pair-path-v1";
  const LEVEL_COUNT = 100;     // the game had 12 levels at first; saves from then load unchanged
  const save = { mute: false, unlocked: 1, cleared: 0, stars: 0, best: 0, total: LEVEL_COUNT, levels: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (raw && typeof raw === "object") Object.assign(save, raw);
    if (!save.levels || typeof save.levels !== "object") save.levels = {};
    // keep only well formed level records, so a damaged save can never show NaN
    const lv = {};
    let top = 0;               // the highest level cleared
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const r = save.levels[n];
      if (r && typeof r === "object" && Number.isFinite(r.score) && Number.isFinite(r.stars)) { lv[n] = { score: Math.max(0, Math.round(r.score)), stars: clamp(r.stars | 0, 1, 3) }; top = n; }
    }
    save.levels = lv; save.mute = !!save.mute;
    save.cleared = 0; save.stars = 0; save.best = 0;
    for (const k in lv) { save.cleared++; save.stars += lv[k].stars; save.best += lv[k].score; }
    // a level is open once the one before it is cleared. In the 12 level game nothing came after
    // level 12, so a save from then that has level 12 cleared now opens level 13.
    save.unlocked = clamp(Math.max(save.unlocked | 0, top + 1), 1, LEVEL_COUNT);
    save.total = LEVEL_COUNT;
  } catch (e) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // ====================================================
  // AUDIO: soft sine and triangle notes through a low-pass
  // filter and a gentle echo.
  // ====================================================
  let ac = null, master = null, bus = null;
  function audioInit() {
    if (ac) { if (ac.state !== "running") ac.resume().catch(() => {}); return; }
    try {
      // iOS: use the media channel, so the ring/silent switch does not mute the game
      if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch (e) {} }
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = save.mute ? 0 : 0.9;
      master.connect(ac.destination);
      bus = ac.createBiquadFilter(); bus.type = "lowpass"; bus.frequency.value = 3400;
      bus.connect(master);
      const delay = ac.createDelay(0.5); delay.delayTime.value = 0.19;
      const fb = ac.createGain(); fb.gain.value = 0.26;
      const wet = ac.createGain(); wet.gain.value = 0.2;
      bus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    } catch (e) { ac = null; }
  }
  function tone(f, dur, vol, type, at, to) {
    if (!ac || save.mute) return;
    try {
      const t = ac.currentTime + (at || 0);
      const o = ac.createOscillator(), v = ac.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      v.gain.setValueAtTime(0.0001, t);
      v.gain.linearRampToValueAtTime(vol, t + 0.008);
      v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(v); v.connect(bus);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) {}
  }
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // major pentatonic, two octaves
  const note = (k) => 392 * Math.pow(2, SCALE[clamp(k, 0, SCALE.length - 1)] / 12);
  const sfx = {
    select() { tone(560, 0.09, 0.1, "triangle"); },
    match(combo) {                       // the note climbs with the combo
      const f = note(combo - 1);
      tone(f, 0.24, 0.2, "sine"); tone(f * 1.5, 0.32, 0.1, "sine", 0.07); tone(f * 2, 0.2, 0.05, "triangle", 0.02);
    },
    bad() { tone(190, 0.16, 0.16, "sine", 0, 130); },
    hint() { tone(880, 0.2, 0.09); tone(1174.7, 0.3, 0.09, "sine", 0.11); },
    shuffle() { for (let k = 0; k < 7; k++) tone(note(Math.floor(Math.random() * 8)), 0.09, 0.06, "triangle", k * 0.045); },
    tick() { tone(990, 0.05, 0.05); },
    win() { [0, 2, 3, 5, 7].forEach((k, n) => tone(note(k), 0.45, 0.16, "sine", n * 0.11)); tone(note(5) * 2, 0.9, 0.1, "triangle", 0.6); },
    lose() { tone(330, 0.3, 0.14); tone(262, 0.34, 0.14, "sine", 0.22); tone(196, 0.6, 0.14, "sine", 0.46); },
    start() { tone(note(0), 0.16, 0.1); tone(note(3), 0.24, 0.1, "sine", 0.1); }
  };
  function setMute(m) {
    save.mute = !!m; persist();
    if (master) master.gain.value = save.mute ? 0 : 0.9;
    $("btn-mute").classList.toggle("is-off", save.mute);
    $("btn-sound").textContent = soundText();
  }
  const soundText = () => (save.mute ? TX("Sound is off", "Âm thanh đang tắt") : TX("Sound is on", "Âm thanh đang bật"));

  // ====================================================
  // BOARD RULES
  // A board is an Int8Array of (w + 2) by (h + 2) cells. The outer ring is
  // always empty, which is what lets a path run around the outside.
  // Index = y * (w + 2) + x, tiles live at x 1..w and y 1..h, 0 means empty.
  // ====================================================
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  let bufN = 0, seen = null, par = null, queue = null, stamp = 0;

  // Breadth-first search over states of cell, direction and turns used.
  // With t >= 0: returns the list of cells from s to t (both included) or null.
  // With t < 0: returns the index of a reachable tile of the same kind, or -1.
  // Because the search goes one step at a time, the first path found is the
  // shortest among those with at most two turns.
  function search(c, w, h, s, t) {
    const sw = w + 2, sh = h + 2, n = sw * sh;
    if (n * 12 > bufN) { bufN = n * 12; seen = new Uint32Array(bufN); par = new Int32Array(bufN); queue = new Int32Array(bufN); stamp = 0; }
    stamp++;
    const kind = c[s], any = t < 0;
    const sx = s % sw, sy = (s / sw) | 0;
    let qh = 0, qt = 0;
    for (let d = 0; d < 4; d++) {
      const nx = sx + DX[d], ny = sy + DY[d];
      if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
      const ni = ny * sw + nx;
      if (c[ni] !== 0) {
        if (any ? c[ni] === kind : ni === t) return any ? ni : [s, ni];
        continue;
      }
      const st = (ni * 4 + d) * 3;
      seen[st] = stamp; par[st] = -1; queue[qt++] = st;
    }
    while (qh < qt) {
      const st = queue[qh++];
      const turns = st % 3, r = (st - turns) / 3, d = r & 3, i = r >> 2;
      const x = i % sw, y = (i / sw) | 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3)) continue;
        const nt = turns + (nd !== d ? 1 : 0);
        if (nt > 2) continue;
        const nx = x + DX[nd], ny = y + DY[nd];
        if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
        const ni = ny * sw + nx;
        if (c[ni] !== 0) {
          if (any ? (c[ni] === kind && ni !== s) : ni === t) {
            if (any) return ni;
            const out = [ni];
            for (let p = st; p !== -1; p = par[p]) out.push(((p - (p % 3)) / 3) >> 2);
            out.push(s);
            return out.reverse();
          }
          continue;
        }
        const ns = (ni * 4 + nd) * 3 + nt;
        if (seen[ns] === stamp) continue;
        seen[ns] = stamp; par[ns] = st; queue[qt++] = ns;
      }
    }
    return any ? -1 : null;
  }
  // any removable pair, scanning from a given offset so callers can vary it
  function anyPair(c, w, h, off) {
    const n = c.length;
    for (let k = 0; k < n; k++) {
      const i = (off + k) % n;
      if (c[i] !== 0) { const r = search(c, w, h, i, -1); if (r >= 0) return [i, r]; }
    }
    return null;
  }

  // ----- sliding -----
  // Each mode packs lines of cells toward one end. `moves` collects from,to pairs.
  const lineBuf = new Int32Array(64);
  function pack(c, n, moves) {
    let wpos = 0;
    for (let r = 0; r < n; r++) {
      const i = lineBuf[r];
      if (c[i] !== 0) {
        const j = lineBuf[wpos++];
        if (j !== i) { c[j] = c[i]; c[i] = 0; if (moves) moves.push(i, j); }
      }
    }
  }
  function slide(c, w, h, mode, moves) {
    if (mode === "none") return;
    const sw = w + 2;
    const col = (x, y0, y1) => {              // pack toward y0
      if ((y0 <= y1 ? y1 - y0 : y0 - y1) < 1) return;
      let n = 0; const st = y0 <= y1 ? 1 : -1;
      for (let y = y0; y !== y1 + st; y += st) lineBuf[n++] = y * sw + x;
      pack(c, n, moves);
    };
    const row = (y, x0, x1) => {              // pack toward x0
      if ((x0 <= x1 ? x1 - x0 : x0 - x1) < 1) return;
      let n = 0; const st = x0 <= x1 ? 1 : -1;
      for (let x = x0; x !== x1 + st; x += st) lineBuf[n++] = y * sw + x;
      pack(c, n, moves);
    };
    const hx = w >> 1, hy = h >> 1;
    let x, y;
    switch (mode) {
      case "down": for (x = 1; x <= w; x++) col(x, h, 1); break;
      case "up": for (x = 1; x <= w; x++) col(x, 1, h); break;
      case "left": for (y = 1; y <= h; y++) row(y, 1, w); break;
      case "right": for (y = 1; y <= h; y++) row(y, w, 1); break;
      case "inh": for (y = 1; y <= h; y++) { row(y, hx, 1); row(y, hx + 1, w); } break;
      case "outh": for (y = 1; y <= h; y++) { row(y, 1, hx); row(y, w, hx + 1); } break;
      case "inv": for (x = 1; x <= w; x++) { col(x, hy, 1); col(x, hy + 1, h); } break;
      case "outv": for (x = 1; x <= w; x++) { col(x, 1, hy); col(x, h, hy + 1); } break;
      case "zipv": for (x = 1; x <= w; x++) { if (x & 1) col(x, h, 1); else col(x, 1, h); } break;
      case "ziph": for (y = 1; y <= h; y++) { if (y & 1) row(y, w, 1); else row(y, 1, w); } break;
    }
  }
  // what each mode becomes when the board is turned on its side
  const TURNED = { none: "none", down: "right", right: "down", up: "left", left: "up", inh: "inv", inv: "inh", outh: "outv", outv: "outh", zipv: "ziph", ziph: "zipv" };
  const MODE_TEXT = {
    none: ["Tiles stay put", "Các ô đứng yên"], down: ["Tiles fall down", "Các ô rơi xuống"], up: ["Tiles rise up", "Các ô dâng lên"],
    left: ["Tiles slide left", "Các ô trượt sang trái"], right: ["Tiles slide right", "Các ô trượt sang phải"],
    inh: ["Tiles close in sideways", "Các ô dồn ngang vào giữa"], outh: ["Tiles spread sideways", "Các ô dạt sang hai bên"],
    inv: ["Tiles close in up and down", "Các ô dồn dọc vào giữa"], outv: ["Tiles spread up and down", "Các ô dạt lên và xuống"],
    zipv: ["Columns alternate down and up", "Cột xen kẽ xuống, lên"], ziph: ["Rows alternate right and left", "Hàng xen kẽ phải, trái"]
  };
  const modeText = (m) => (MODE_TEXT[m] ? TX(MODE_TEXT[m][0], MODE_TEXT[m][1]) : "");

  // ----- solver: play random legal pairs until the board is empty -----
  // A finished run is a proof that the board can be cleared, and it is kept
  // as the line the Hint button follows.
  function solve(c0, w, h, mode) {
    const c = c0.slice(), out = [];
    let left = 0;
    for (let i = 0; i < c.length; i++) if (c[i] !== 0) left++;
    while (left > 0) {
      const p = anyPair(c, w, h, Math.floor(Math.random() * c.length));
      if (!p) return null;
      out.push(p);
      c[p[0]] = 0; c[p[1]] = 0; left -= 2;
      slide(c, w, h, mode, null);
    }
    return out;
  }
  // ----- a board written from its own way through -----
  // The sure way to a board that can be cleared is to write the way through first. Every tile starts
  // blank. Two tiles that a path can join are picked, given the next kind, and taken off, and the rest
  // moves as the level's mode says, until nothing is left. Such a pair always exists: the top tiles of
  // two columns can be joined around the outside of the board, and two tiles alone in one column have
  // nothing between them. So this never fails, and the steps taken are a way through the board made.
  // occ says where the tiles are (anything but 0), kinds is the kind to give each pair in turn.
  function construct(occ, w, h, mode, kinds) {
    const c = new Int8Array(occ.length), from = new Int32Array(occ.length), out = new Int8Array(occ.length);
    for (let i = 0; i < occ.length; i++) if (occ[i] !== 0) { c[i] = 1; from[i] = i; }
    const sol = [], at = [], moves = [];
    for (let k = 0; k < kinds.length; k++) {
      at.length = 0;
      for (let i = 0; i < c.length; i++) if (c[i] !== 0) at.push(i);
      shuffleArr(at);
      let a = -1, b = -1;
      for (let p = 0; p < at.length && a < 0; p++) {
        const first = Math.floor(Math.random() * at.length);       // partners are tried from a random place on
        for (let q = 0; q < at.length; q++) {
          const t = at[(first + q) % at.length];
          if (t !== at[p] && search(c, w, h, at[p], t)) { a = at[p]; b = t; break; }
        }
      }
      if (a < 0) return null;
      out[from[a]] = kinds[k]; out[from[b]] = kinds[k];
      sol.push([a, b]);
      c[a] = 0; c[b] = 0;
      moves.length = 0;
      slide(c, w, h, mode, moves);
      for (let m = 0; m < moves.length; m += 2) from[moves[m + 1]] = from[moves[m]];
    }
    return { c: out, sol };
  }
  // A board for a level, always with a way through it. First it fills the board at random and lets the
  // solver try it, many times over. If none of those is cleared in the time allowed, it writes a board
  // from its own way through. Either way the board handed out has been cleared once already.
  function generate(w, h, nk, mode, written) {
    const sw = w + 2, N = w * h;
    const ks = shuffleArr(Array.from({ length: SYMBOLS.length }, (_, k) => k + 1)).slice(0, nk);
    const bag = [];
    for (let p = 0; p < N / 2; p++) { bag.push(ks[p % nk], ks[p % nk]); }
    const t0 = performance.now();
    let c, sol = null, tries = 0;
    const fill = () => {
      shuffleArr(bag); c = new Int8Array(sw * (h + 2));
      let q = 0;
      for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) c[y * sw + x] = bag[q++];
    };
    if (!written) do { fill(); sol = solve(c, w, h, mode); tries++; } while (!sol && tries < 600 && performance.now() - t0 < 500);
    let built = false;
    if (!sol) {
      const kinds = [];
      for (let p = 0; p < N / 2; p++) kinds.push(ks[p % nk]);
      fill();
      const b = construct(c, w, h, mode, shuffleArr(kinds));
      if (b) { c = b.c; sol = b.sol; built = true; }
    }
    return { c, sol, tries, built, ms: performance.now() - t0 };
  }

  // ====================================================
  // SYMBOLS: 32 science and maths marks, each drawn in a box from -1 to 1.
  // ====================================================
  const PI_PATH = "M 0 79 L 0 158 90.585 158 L 181.171 158 180.702 323.750 C 180.189 505.585, 179.893 515.439, 173.921 550 C 167.099 589.473, 148.234 639.092, 125.705 676.819 C 119.026 688.003, 103.645 708.849, 85.085 731.871 C 78.713 739.775, 67.103 754.175, 59.284 763.871 C 51.465 773.567, 44.265 783.006, 43.284 784.846 L 41.5 788.192 46 792.162 C 67.779 811.375, 160.219 887, 161.926 887 C 164.406 887, 203.422 839.570, 235.136 798 C 280.230 738.893, 313.314 663.477, 329.454 583 C 337.392 543.422, 337.821 531.897, 338.991 327 C 339.513 235.425, 339.954 160.160, 339.971 159.744 C 339.987 159.329, 378.362 159.104, 425.250 159.244 L 510.5 159.5 510.587 390.5 C 510.673 618.837, 511.198 683.440, 513.103 700 C 523.207 787.861, 582.955 856.593, 668.225 878.447 C 696.545 885.706, 733.582 885.714, 766.5 878.469 C 820.969 866.481, 874.399 823.906, 900.740 771.5 C 914.994 743.143, 918.458 728.6, 928.003 657.046 C 933.820 613.443, 933.694 615.388, 930.750 614.663 C 922.311 612.583, 789.603 595, 782.351 595 L 777.142 595 776.074 600.250 C 775.486 603.138, 772.547 622.825, 769.543 644 C 762.332 694.830, 759.720 703.795, 749.503 712.788 C 743.401 718.160, 731.401 723.939, 723.565 725.282 C 705.044 728.454, 684.513 716.921, 675 698.001 L 671 690.044 671 424.522 L 671 159 708.835 159 C 729.645 159, 770.370 158.701, 799.335 158.336 L 852 157.673 852 78.836 L 852 0 426 0 L 0 0 0 79";
  let piShape = null;
  const poly = (c, pts, close) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]); if (close) c.closePath(); };
  const SYMBOLS = [
    { name: "pi", color: "#f2c96b", draw(c) {
      if (!piShape) piShape = new Path2D(PI_PATH);
      c.save(); c.translate(-0.95, -0.9); c.scale(1.9 / 933, 1.9 / 933); c.fill(piShape, "evenodd"); c.restore();
    } },
    { name: "sigma", color: "#5fd4ff", draw(c) {
      c.lineWidth = 0.2; poly(c, [0.62, -0.5, 0.62, -0.8, -0.6, -0.8, 0.08, 0, -0.6, 0.8, 0.62, 0.8, 0.62, 0.5]); c.stroke();
    } },
    { name: "integral", color: "#ff8fb1", draw(c) {
      c.lineWidth = 0.2; c.beginPath(); c.moveTo(0.5, -0.68);
      c.bezierCurveTo(0.45, -1.0, 0.1, -0.98, 0.06, -0.55); c.lineTo(-0.06, 0.55);
      c.bezierCurveTo(-0.1, 0.98, -0.45, 1.0, -0.5, 0.68); c.stroke();
    } },
    { name: "infinity", color: "#b49bff", draw(c) {
      c.lineWidth = 0.19; c.beginPath();
      for (let k = 0; k <= 60; k++) {
        const t = k / 60 * TAU, q = 1 + Math.sin(t) * Math.sin(t);
        const x = 0.97 * Math.cos(t) / q, y = 1.5 * Math.sin(t) * Math.cos(t) / q;
        if (k) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.closePath(); c.stroke();
    } },
    { name: "atom", color: "#4f9dff", draw(c) {
      c.lineWidth = 0.1;
      for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(0, 0, 0.96, 0.36, k * Math.PI / 3, 0, TAU); c.stroke(); }
      c.fillStyle = "#cfe4ff"; c.beginPath(); c.arc(0, 0, 0.19, 0, TAU); c.fill();
    } },
    { name: "planet", color: "#ff9f5a", draw(c) {
      c.rotate(-0.38); c.lineWidth = 0.12; c.strokeStyle = "#ffe0b8";
      c.beginPath(); c.ellipse(0, 0, 0.98, 0.3, 0, 0, TAU); c.stroke();
      c.beginPath(); c.arc(0, 0, 0.54, 0, TAU); c.fill();
      c.fillStyle = "rgba(0,0,0,0.18)"; c.beginPath(); c.arc(0.12, 0.14, 0.42, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(0, 0, 0.98, 0.3, 0, 0, Math.PI); c.stroke();
    } },
    { name: "wave", color: "#2fe0c0", draw(c) {
      c.lineWidth = 0.06; c.globalAlpha = 0.45; poly(c, [-0.95, 0, 0.95, 0]); c.stroke(); c.globalAlpha = 1;
      c.lineWidth = 0.19; c.beginPath();
      for (let k = 0; k <= 40; k++) { const x = -0.92 + 1.84 * k / 40, y = -0.62 * Math.sin((x + 0.92) / 1.84 * TAU * 1.5); if (k) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
    } },
    { name: "qubit", color: "#cf7bff", draw(c) {
      c.fillStyle = "rgba(207,123,255,0.16)"; c.beginPath(); c.arc(0, 0, 0.88, 0, TAU); c.fill();
      c.lineWidth = 0.1; c.beginPath(); c.arc(0, 0, 0.88, 0, TAU); c.stroke();
      c.lineWidth = 0.06; c.globalAlpha = 0.6; c.beginPath(); c.ellipse(0, 0, 0.88, 0.28, 0, 0, TAU); c.stroke();
      poly(c, [0, -0.88, 0, 0.88]); c.stroke(); c.globalAlpha = 1;
      c.strokeStyle = c.fillStyle = "#fff"; c.lineWidth = 0.13; poly(c, [0, 0, 0.42, -0.5]); c.stroke();
      c.beginPath(); c.arc(0.42, -0.5, 0.16, 0, TAU); c.fill();
    } },
    { name: "crystal", color: "#8ff3f7", draw(c) {
      const pts = [-0.55, -0.78, 0.55, -0.78, 0.95, -0.22, 0, 0.92, -0.95, -0.22];
      c.fillStyle = "rgba(143,243,247,0.25)"; poly(c, pts, true); c.fill();
      c.lineWidth = 0.1; c.stroke();
      c.lineWidth = 0.07; poly(c, [-0.95, -0.22, 0.95, -0.22]); c.stroke();
      poly(c, [-0.55, -0.78, -0.32, -0.22, 0, 0.92, 0.32, -0.22, 0.55, -0.78]); c.stroke();
      poly(c, [-0.32, -0.22, 0, -0.78, 0.32, -0.22]); c.stroke();
    } },
    { name: "rocket", color: "#ff6464", draw(c) {
      c.rotate(Math.PI / 4);
      c.fillStyle = "#ffb347"; poly(c, [-0.2, 0.5, 0, 1.02, 0.2, 0.5], true); c.fill();
      c.fillStyle = "#ff6464"; poly(c, [-0.28, 0.1, -0.72, 0.72, -0.28, 0.52], true); c.fill();
      poly(c, [0.28, 0.1, 0.72, 0.72, 0.28, 0.52], true); c.fill();
      c.fillStyle = "#eef2ff"; c.beginPath(); c.moveTo(0, -1.0);
      c.bezierCurveTo(0.46, -0.6, 0.44, 0.1, 0.3, 0.54); c.lineTo(-0.3, 0.54);
      c.bezierCurveTo(-0.44, 0.1, -0.46, -0.6, 0, -1.0); c.fill();
      c.fillStyle = "#2b6cff"; c.beginPath(); c.arc(0, -0.28, 0.17, 0, TAU); c.fill();
    } },
    { name: "flask", color: "#74e072", draw(c) {
      c.fillStyle = "rgba(116,224,114,0.85)"; c.beginPath(); c.moveTo(-0.5, 0.25); c.lineTo(0.5, 0.25); c.lineTo(0.78, 0.72);
      c.quadraticCurveTo(0.86, 0.9, 0.6, 0.9); c.lineTo(-0.6, 0.9); c.quadraticCurveTo(-0.86, 0.9, -0.78, 0.72); c.closePath(); c.fill();
      c.strokeStyle = "#e6ffe6"; c.lineWidth = 0.11; c.beginPath(); c.moveTo(-0.2, -0.88); c.lineTo(-0.2, -0.28); c.lineTo(-0.78, 0.72);
      c.quadraticCurveTo(-0.86, 0.9, -0.6, 0.9); c.lineTo(0.6, 0.9); c.quadraticCurveTo(0.86, 0.9, 0.78, 0.72);
      c.lineTo(0.2, -0.28); c.lineTo(0.2, -0.88); c.stroke();
      poly(c, [-0.34, -0.88, 0.34, -0.88]); c.stroke();
      c.fillStyle = "#e6ffe6"; c.beginPath(); c.arc(-0.12, 0.55, 0.09, 0, TAU); c.arc(0.2, 0.62, 0.06, 0, TAU); c.fill();
    } },
    { name: "star", color: "#ffe45c", draw(c) {
      c.beginPath();
      for (let k = 0; k < 10; k++) { const r = k & 1 ? 0.42 : 1.0, a = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(r * Math.cos(a), 0.05 + r * Math.sin(a)); }
      c.closePath(); c.fill();
    } },
    { name: "comet", color: "#a9c8ff", draw(c) {
      const gr = c.createLinearGradient(0.45, 0.45, -0.95, -0.95);
      gr.addColorStop(0, "rgba(169,200,255,0.9)"); gr.addColorStop(1, "rgba(169,200,255,0)");
      c.fillStyle = gr; poly(c, [0.72, 0.24, -1.0, -1.0, 0.24, 0.72], true); c.fill();
      c.fillStyle = "#f2f7ff"; c.beginPath(); c.arc(0.5, 0.5, 0.34, 0, TAU); c.fill();
    } },
    { name: "magnet", color: "#ff4763", draw(c) {
      c.lineCap = "butt"; c.lineWidth = 0.46;
      c.beginPath(); c.moveTo(-0.56, 0.86); c.lineTo(-0.56, -0.12); c.arc(0, -0.12, 0.56, Math.PI, 0); c.lineTo(0.56, 0.86); c.stroke();
      c.strokeStyle = "#eef1f8"; poly(c, [-0.56, 0.86, -0.56, 0.5]); c.stroke(); poly(c, [0.56, 0.86, 0.56, 0.5]); c.stroke();
    } },
    { name: "dna", color: "#ff74dc", draw(c) {
      c.rotate(0.35); c.lineWidth = 0.07; c.strokeStyle = "#ffd0f4";
      for (let k = 0; k < 7; k++) { const y = -0.84 + k * 0.28, x = 0.46 * Math.sin(y * 3.3); poly(c, [-x, y, x, y]); c.stroke(); }
      c.lineWidth = 0.15;
      for (let s = -1; s <= 1; s += 2) {
        c.strokeStyle = s < 0 ? "#ff74dc" : "#9fb4ff"; c.beginPath();
        for (let k = 0; k <= 30; k++) { const y = -0.98 + 1.96 * k / 30, x = s * 0.46 * Math.sin(y * 3.3); if (k) c.lineTo(x, y); else c.moveTo(x, y); }
        c.stroke();
      }
    } },
    { name: "root", color: "#c4f24a", draw(c) {
      c.lineWidth = 0.18; poly(c, [-0.96, 0.12, -0.7, 0.02, -0.42, 0.8, -0.08, -0.78, 0.96, -0.78]); c.stroke();
      c.lineWidth = 0.15; poly(c, [0.2, -0.2, 0.8, 0.6]); c.stroke(); poly(c, [0.8, -0.2, 0.2, 0.6]); c.stroke();
    } },
    { name: "delta", color: "#f4f6fb", draw(c) {
      c.lineWidth = 0.2; poly(c, [0, -0.84, 0.9, 0.76, -0.9, 0.76], true); c.stroke();
    } },
    { name: "moon", color: "#efe6b8", draw(c) {
      c.beginPath(); c.arc(-0.08, 0, 0.9, 0, TAU); c.fill();
      c.globalCompositeOperation = "destination-out"; c.beginPath(); c.arc(0.36, -0.22, 0.74, 0, TAU); c.fill();
      c.globalCompositeOperation = "source-over";
    } },
    { name: "bolt", color: "#ffbf1f", draw(c) {
      poly(c, [0.3, -1.0, -0.6, 0.14, -0.06, 0.14, -0.32, 1.0, 0.6, -0.22, 0.06, -0.22], true); c.fill();
    } },
    { name: "gear", color: "#9fb0c8", draw(c) {
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        c.lineTo(0.7 * Math.cos(a - 0.27), 0.7 * Math.sin(a - 0.27)); c.lineTo(0.98 * Math.cos(a - 0.16), 0.98 * Math.sin(a - 0.16));
        c.lineTo(0.98 * Math.cos(a + 0.16), 0.98 * Math.sin(a + 0.16)); c.lineTo(0.7 * Math.cos(a + 0.27), 0.7 * Math.sin(a + 0.27));
      }
      c.closePath(); c.fill();
      c.globalCompositeOperation = "destination-out"; c.beginPath(); c.arc(0, 0, 0.3, 0, TAU); c.fill();
      c.globalCompositeOperation = "source-over";
    } },
    { name: "ring", color: "#62f2a5", draw(c) {
      c.lineWidth = 0.13; c.beginPath();
      for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; c.lineTo(0.94 * Math.cos(a), 0.94 * Math.sin(a)); }
      c.closePath(); c.stroke();
      c.lineWidth = 0.1; c.beginPath(); c.arc(0, 0, 0.47, 0, TAU); c.stroke();
    } },
    { name: "sun", color: "#ff7a3d", draw(c) {
      c.beginPath(); c.arc(0, 0, 0.44, 0, TAU); c.fill();
      c.lineWidth = 0.15;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; poly(c, [0.64 * Math.cos(a), 0.64 * Math.sin(a), 0.95 * Math.cos(a), 0.95 * Math.sin(a)]); c.stroke(); }
    } },
    { name: "cube", color: "#7d86ff", draw(c) {
      const v = []; for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; v.push(0.95 * Math.cos(a), 0.95 * Math.sin(a)); }
      c.fillStyle = "rgba(125,134,255,0.4)"; poly(c, [v[0], v[1], v[2], v[3], 0, 0, v[10], v[11]], true); c.fill();
      c.lineWidth = 0.11; poly(c, v, true); c.stroke();
      poly(c, [v[2], v[3], 0, 0, v[10], v[11]]); c.stroke(); poly(c, [0, 0, v[6], v[7]]); c.stroke();
    } },
    { name: "spiral", color: "#ff8a7a", draw(c) {
      c.lineWidth = 0.15; c.beginPath();
      for (let k = 0; k <= 90; k++) { const t = k / 90, a = t * TAU * 2.4, r = 0.04 + 0.92 * t; if (k) c.lineTo(r * Math.cos(a), r * Math.sin(a)); else c.moveTo(r * Math.cos(a), r * Math.sin(a)); }
      c.stroke();
    } },
    { name: "omega", color: "#f5b0ff", draw(c) {
      c.lineWidth = 0.19; c.beginPath(); c.moveTo(-0.9, 0.82); c.lineTo(-0.34, 0.82); c.lineTo(-0.34, 0.52);
      c.arc(0, -0.12, 0.72, 2.079, 7.346); c.lineTo(0.34, 0.82); c.lineTo(0.9, 0.82); c.stroke();
    } },
    { name: "lambda", color: "#9be15d", draw(c) {
      c.lineWidth = 0.2; c.beginPath(); c.moveTo(-0.62, -0.78); c.quadraticCurveTo(-0.28, -0.92, -0.12, -0.5); c.lineTo(0.64, 0.86); c.stroke();
      poly(c, [0.03, -0.16, -0.62, 0.86]); c.stroke();
    } },
    { name: "psi", color: "#ffd08a", draw(c) {
      c.lineWidth = 0.18; poly(c, [0, -0.92, 0, 0.92]); c.stroke();
      c.beginPath(); c.moveTo(-0.7, -0.7); c.lineTo(-0.7, -0.18); c.arc(0, -0.18, 0.7, Math.PI, 0, true); c.lineTo(0.7, -0.7); c.stroke();
    } },
    { name: "drop", color: "#3ea6ff", draw(c) {
      c.beginPath(); c.moveTo(0, -0.98); c.bezierCurveTo(0.2, -0.42, 0.7, -0.02, 0.7, 0.32); c.arc(0, 0.32, 0.7, 0, Math.PI);
      c.bezierCurveTo(-0.7, -0.02, -0.2, -0.42, 0, -0.98); c.fill();
      c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 0.1; c.beginPath(); c.arc(0, 0.32, 0.44, 2.0, 2.9); c.stroke();
    } },
    { name: "bulb", color: "#fff07a", draw(c) {
      c.fillStyle = "rgba(255,240,122,0.3)"; c.beginPath(); c.arc(0, -0.28, 0.64, 0, TAU); c.fill();
      c.lineWidth = 0.11; c.stroke();
      c.lineWidth = 0.08; poly(c, [-0.22, 0.3, -0.12, -0.2, 0, 0.02, 0.12, -0.2, 0.22, 0.3]); c.stroke();
      c.fillStyle = "#d9dce6"; c.fillRect(-0.27, 0.44, 0.54, 0.17); c.fillRect(-0.2, 0.68, 0.4, 0.14);
    } },
    { name: "venn", color: "#ff9ac2", draw(c) {
      c.save(); c.beginPath(); c.arc(-0.34, 0, 0.6, 0, TAU); c.clip();
      c.fillStyle = "rgba(255,255,255,0.75)"; c.beginPath(); c.arc(0.34, 0, 0.6, 0, TAU); c.fill(); c.restore();
      c.lineWidth = 0.11; c.beginPath(); c.arc(-0.34, 0, 0.6, 0, TAU); c.stroke();
      c.strokeStyle = "#7fc8ff"; c.beginPath(); c.arc(0.34, 0, 0.6, 0, TAU); c.stroke();
    } },
    { name: "hourglass", color: "#e0b98a", draw(c) {
      c.fillStyle = "#ffd9a0"; poly(c, [-0.42, 0.8, 0.42, 0.8, 0, 0.3], true); c.fill(); poly(c, [-0.26, -0.5, 0.26, -0.5, 0, -0.08], true); c.fill();
      c.lineWidth = 0.1; poly(c, [-0.58, -0.86, 0.58, -0.86, 0.09, 0, 0.58, 0.86, -0.58, 0.86, -0.09, 0], true); c.stroke();
      c.lineWidth = 0.16; poly(c, [-0.76, -0.9, 0.76, -0.9]); c.stroke(); poly(c, [-0.76, 0.9, 0.76, 0.9]); c.stroke();
    } },
    { name: "snowflake", color: "#d6f1ff", draw(c) {
      c.lineWidth = 0.11;
      for (let k = 0; k < 6; k++) {
        c.save(); c.rotate(k * Math.PI / 3);
        poly(c, [0, 0, 0, -0.96]); c.stroke(); poly(c, [-0.24, -0.82, 0, -0.58, 0.24, -0.82]); c.stroke();
        c.restore();
      }
    } }
  ];

  // ----- sprites: one small canvas per tile kind, rebuilt when the tile size changes -----
  let sprites = [], spritePx = 0;
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function makeSprite(kind, px) {
    const cv = document.createElement("canvas"); cv.width = cv.height = px;
    const c = cv.getContext("2d");
    const sym = kind ? SYMBOLS[kind - 1] : null, col = sym ? sym.color : "#7b89a8";
    const inset = Math.max(1, px * 0.035), s = px - inset * 2, r = px * 0.19, lift = px * 0.05;
    c.fillStyle = "#04060c"; rr(c, inset, inset + lift, s, s - lift, r); c.fill();          // the tile's edge
    const face = c.createLinearGradient(0, inset, 0, px);
    face.addColorStop(0, "#232c48"); face.addColorStop(1, "#141a2e");
    c.fillStyle = face; rr(c, inset, inset, s, s - lift, r); c.fill();
    c.save(); c.clip();
    const tint = c.createRadialGradient(px / 2, px * 0.46, 0, px / 2, px * 0.46, px * 0.6);
    tint.addColorStop(0, col); tint.addColorStop(1, "rgba(0,0,0,0)");
    c.globalAlpha = sym ? 0.2 : 0.08; c.fillStyle = tint; c.fillRect(0, 0, px, px);
    c.restore();
    c.globalAlpha = sym ? 0.55 : 0.3; c.strokeStyle = col; c.lineWidth = Math.max(1, px * 0.022);
    rr(c, inset + c.lineWidth / 2, inset + c.lineWidth / 2, s - c.lineWidth, s - lift - c.lineWidth, r - c.lineWidth / 2); c.stroke();
    c.globalAlpha = 1;
    if (sym) {
      const layer = document.createElement("canvas"); layer.width = layer.height = px;
      const l = layer.getContext("2d");
      l.translate(px / 2, px / 2 - lift / 2); l.scale(px * 0.285, px * 0.285);
      l.fillStyle = l.strokeStyle = col; l.lineCap = "round"; l.lineJoin = "round"; l.lineWidth = 0.16;
      sym.draw(l);
      c.shadowColor = col; c.shadowBlur = px * 0.14;
      c.drawImage(layer, 0, 0);
      c.shadowBlur = 0;
    }
    return cv;
  }
  function buildSprites(px) {
    px = clamp(Math.round(px), 24, 200);
    if (px === spritePx) return;
    spritePx = px; sprites = [];
    for (let k = 0; k <= SYMBOLS.length; k++) sprites.push(makeSprite(k, px));
  }

  // ====================================================
  // LEVELS: s and l are the short and long side of the board. The long side
  // is stood upright on a phone and laid flat on a wide screen.
  // ====================================================
  const LEVELS = [
    { s: 6, l: 6, kinds: 9, mode: "none" },
    { s: 6, l: 8, kinds: 12, mode: "none" },
    { s: 6, l: 8, kinds: 14, mode: "down" },
    { s: 6, l: 10, kinds: 16, mode: "up" },
    { s: 8, l: 9, kinds: 18, mode: "left" },
    { s: 8, l: 9, kinds: 20, mode: "right" },
    { s: 8, l: 10, kinds: 22, mode: "inh" },
    { s: 8, l: 10, kinds: 24, mode: "outh" },
    { s: 8, l: 11, kinds: 26, mode: "inv" },
    { s: 8, l: 11, kinds: 28, mode: "outv" },
    { s: 8, l: 12, kinds: 30, mode: "zipv" },
    { s: 8, l: 12, kinds: 32, mode: "ziph" }
  ];
  // Levels 13 to 100 come in eight rounds of eleven. A round keeps one board size and goes through the
  // eleven ways the tiles can move, in the order the first twelve levels brought them in. Every round
  // has a bigger board than the one before, from 96 tiles to 140.
  // Where the tiles stay put, spread apart or alternate, the board carries all 32 symbols. Where they
  // pack tightly toward one side or toward the middle, a board with every symbol on it almost never has
  // a way through, so those levels carry fewer kinds, and more of them as the boards grow. The numbers
  // were chosen by measuring: at least about 3 random boards in 100 are cleared by the solver, with the
  // board standing up and with it lying flat, which is no worse than level 9 always was.
  const MODES = ["none", "down", "up", "left", "right", "inh", "outh", "inv", "outv", "zipv", "ziph"];
  const ROUNDS = [
    { s: 8, l: 12,  kinds: [32, 22, 20, 20, 22, 22, 32, 22, 32, 32, 32] },     // levels 13 to 23
    { s: 8, l: 13,  kinds: [32, 22, 20, 20, 22, 22, 32, 22, 32, 32, 32] },     // 24 to 34
    { s: 9, l: 12,  kinds: [32, 22, 20, 22, 22, 24, 32, 24, 32, 32, 32] },     // 35 to 45
    { s: 8, l: 14,  kinds: [32, 22, 20, 22, 22, 24, 32, 24, 32, 32, 32] },     // 46 to 56
    { s: 10, l: 12, kinds: [32, 24, 22, 22, 24, 24, 32, 24, 32, 32, 32] },     // 57 to 67
    { s: 9, l: 14,  kinds: [32, 24, 22, 22, 22, 24, 32, 24, 32, 32, 32] },     // 68 to 78
    { s: 10, l: 13, kinds: [32, 24, 22, 24, 24, 26, 32, 26, 32, 32, 32] },     // 79 to 89
    { s: 10, l: 14, kinds: [32, 24, 22, 24, 24, 26, 32, 26, 32, 32, 32] }      // 90 to 100
  ];
  for (const r of ROUNDS) MODES.forEach((mode, k) => LEVELS.push({ s: r.s, l: r.l, kinds: r.kinds[k], mode }));
  // Seconds allowed for each pair on the board: from 8.2 on level 1 down to 6.55 on level 12, as it
  // always was, and from there more slowly down to 5 on level 100.
  const secondsPerPair = (n) => (n <= 12 ? 8.2 - 0.15 * (n - 1) : 6.55 - 1.55 * (n - 12) / 88);
  // Hints and shuffles a level starts with. The last two rounds give one hint less, the last round one shuffle less.
  const hintsFor = (n) => (n >= 79 ? 3 : n >= 7 ? 4 : 3);
  const shufflesFor = (n) => (n >= 90 ? 2 : n >= 9 ? 3 : 2);
  const COMBO_WINDOW = 4;      // seconds allowed between matches to keep a combo
  const PER_PAGE = 20;         // levels the menu shows at a time

  // ====================================================
  // STATE
  // ====================================================
  let state = "menu";          // menu, play, paused, win, lose
  let level = 1, W = 6, H = 6, SW = 8, mode = "none";
  let cells = new Int8Array(64), tileAt = [], tiles = [];
  let left = 0, score = 0, timeLeft = 0, timeMax = 1, hints = 0, shuffles = 0;
  let combo = 0, comboT = 0, bestCombo = 0, autoShuffles = 0;
  let sel = -1, hint = null, solution = null, solStep = 0, genInfo = null;
  let runId = 0, lastTick = 0, introT = 0;   // introT: the clock waits while the level message shows
  let ghosts = [], parts = [], pathFx = [], floats = [];
  const cur = { x: 1, y: 1, on: false };

  // ====================================================
  // LAYOUT
  // ====================================================
  let vw = 320, vh = 480, dpr = 1, ts = 48, ox = 0, oy = 0, ringX = 8, ringY = 8;
  const area = { x0: 12, y0: 80, x1: 308, y1: 400 };
  const bg = document.createElement("canvas");
  function measure() {
    vw = Math.max(200, window.innerWidth); vh = Math.max(200, window.innerHeight);
    dpr = clamp(window.devicePixelRatio || 1, 1, 3);
    document.body.classList.toggle("wide-short", vw > vh && vh < 560);
    const cs = getComputedStyle($("safe"));
    const sl = parseFloat(cs.paddingLeft) || 0, sr = parseFloat(cs.paddingRight) || 0, sb = parseFloat(cs.paddingBottom) || 0, st = parseFloat(cs.paddingTop) || 0;
    const top = $("top").getBoundingClientRect(), bar = $("bar").getBoundingClientRect();
    const wide = document.body.classList.contains("wide-short");
    area.x0 = 12 + sl; area.x1 = vw - 12 - sr;
    const gap = vh < 620 ? 6 : 10;           // room kept for a path that runs outside the board
    area.y0 = (top.height ? top.bottom : 74 + st) + gap;
    area.y1 = (bar.height && !wide ? bar.top : vh - sb) - gap;
    if (wide && bar.width) area.x1 = bar.left - 10;
    area.top = area.y0 - gap; area.bottom = area.y1 + gap;
  }
  const fitTs = (w, h) => Math.floor(Math.min((area.x1 - area.x0) / w, (area.y1 - area.y0) / h, 92));
  function layout() {
    measure();
    if (state !== "menu" && fitTs(H, W) > fitTs(W, H) * 1.12) turnBoard();
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    ts = Math.max(16, fitTs(W, H));
    ox = Math.round((area.x0 + area.x1 - W * ts) / 2); oy = Math.round((area.y0 + area.y1 - H * ts) / 2);
    ringX = Math.max(4, Math.min(ts * 0.5, ox - 5, vw - (ox + W * ts) - 5));
    ringY = Math.max(4, Math.min(ts * 0.5, oy - area.top - 1, area.bottom - (oy + H * ts) - 1));
    buildSprites(state === "menu" ? 60 * dpr : ts * dpr);
    pathFx = [];
    drawBg();
  }
  function drawBg() {
    bg.width = canvas.width; bg.height = canvas.height;
    const c = bg.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#05070f"; c.fillRect(0, 0, vw, vh);
    const glow = c.createRadialGradient(vw / 2, vh * 0.45, 0, vw / 2, vh * 0.45, Math.max(vw, vh) * 0.75);
    glow.addColorStop(0, "rgba(46,62,120,0.42)"); glow.addColorStop(0.6, "rgba(20,26,56,0.2)"); glow.addColorStop(1, "rgba(5,7,15,0)");
    c.fillStyle = glow; c.fillRect(0, 0, vw, vh);
    c.fillStyle = "rgba(255,255,255,0.5)";
    for (let k = 0; k < 70; k++) {             // a fixed sprinkle of faint dots
      const x = ((k * 7919) % 997) / 997 * vw, y = ((k * 6151) % 991) / 991 * vh;
      c.globalAlpha = 0.12 + (k % 5) * 0.05; c.fillRect(x, y, 1.2, 1.2);
    }
    c.globalAlpha = 1;
    if (state === "menu") return;
    c.strokeStyle = "rgba(143,214,255,0.07)"; c.lineWidth = 1;
    const pad = Math.max(1.5, ts * 0.06);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      rr(c, ox + x * ts + pad, oy + y * ts + pad, ts - pad * 2, ts - pad * 2, ts * 0.16); c.stroke();
    }
  }
  const cellPX = (x) => (x < 1 ? ox - ringX : x > W ? ox + W * ts + ringX : ox + (x - 0.5) * ts);
  const cellPY = (y) => (y < 1 ? oy - ringY : y > H ? oy + H * ts + ringY : oy + (y - 0.5) * ts);

  // turn the board on its side, used when the screen is rotated during a level
  function turnBoard() {
    const nW = H, nH = W, nSW = nW + 2;
    const map = (i) => (i % SW) * nSW + ((i / SW) | 0);
    const nc = new Int8Array(nSW * (nH + 2)), nt = new Array(nc.length).fill(null);
    for (let i = 0; i < cells.length; i++) if (cells[i] !== 0) { const j = map(i); nc[j] = cells[i]; nt[j] = tileAt[i]; }
    for (const t of tiles) { t.i = map(t.i); let q = t.x; t.x = t.y; t.y = q; q = t.dx; t.dx = t.dy; t.dy = q; }
    if (sel >= 0) sel = map(sel);
    if (hint) hint = hint.map(map);
    if (solution) solution = solution.map((p) => [map(p[0]), map(p[1])]);
    const q = cur.x; cur.x = cur.y; cur.y = q;
    cells = nc; tileAt = nt; W = nW; H = nH; SW = nSW; mode = TURNED[mode];
    ghosts = []; floats = [];
    $("bar-mode").textContent = modeText(mode);
  }

  // ====================================================
  // GAME FLOW
  // ====================================================
  function show(id) {
    for (const p of ["menu", "paused", "win", "lose"]) $(p).hidden = p !== id;
    const hud = state !== "menu";
    $("top").hidden = !hud; $("bar").hidden = !hud;
    document.body.classList.toggle("in-menu", state !== "play");
  }
  let toastTimer = 0;
  function toast(msg, ms) {
    const el = $("toast"); el.textContent = msg; el.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("is-on"), ms || 1600);
  }
  function setBoard(c, w, h) {
    W = w; H = h; SW = w + 2; cells = c;
    tileAt = new Array(c.length).fill(null); tiles = []; left = 0;
    for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) {
      const i = y * SW + x;
      if (c[i] === 0) continue;
      const t = { kind: c[i], i, x, y, dx: x, dy: y, hold: 0, pop: -0.012 * (x + y) - 0.05, shake: 0 };
      tileAt[i] = t; tiles.push(t); left++;
    }
  }
  function startLevel(n) {
    n = clamp(n | 0, 1, LEVELS.length);
    runId++;
    level = n; state = "play";
    const L = LEVELS[n - 1];
    show(null);
    measure();
    // stand the long side up on a tall screen, lay it flat on a wide one
    const tall = fitTs(L.s, L.l), flat = fitTs(L.l, L.s);
    const upright = tall > flat || (tall === flat && vh >= vw);
    const w = upright ? L.s : L.l, h = upright ? L.l : L.s;
    mode = L.mode;
    const gen = generate(w, h, L.kinds, mode);
    genInfo = { tries: gen.tries, ms: Math.round(gen.ms), solved: !!gen.sol, built: gen.built };
    setBoard(gen.c, w, h);
    solution = gen.sol; solStep = 0;
    const pairs = left / 2;
    timeMax = Math.round(pairs * secondsPerPair(n));
    timeLeft = timeMax;
    hints = hintsFor(n); shuffles = shufflesFor(n);
    score = 0; combo = 0; comboT = 0; bestCombo = 0; autoShuffles = 0;
    sel = -1; hint = null; cur.on = false; cur.x = 1; cur.y = 1;
    ghosts = []; parts = []; pathFx = []; floats = []; lastTick = 0;
    paintHud();
    hudCache = {};
    layout();
    introT = 1.3;
    toast(TX("Level ", "Màn ") + n + ". " + modeText(mode) + ".", 1300);
    sfx.start();
  }
  function burst(x, y, col, n) {
    const k = ts / 48;
    for (let q = 0; q < n && parts.length < 500; q++) {
      const a = Math.random() * TAU, sp = (50 + Math.random() * 190) * k, life = 0.35 + Math.random() * 0.45;
      parts.push({ x: x + Math.cos(a) * ts * 0.2, y: y + Math.sin(a) * ts * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30 * k, life, max: life, col, r: (1.4 + Math.random() * 2.6) * k });
    }
  }
  function removePair(a, b, path) {
    const ta = tileAt[a], tb = tileAt[b];
    const col = SYMBOLS[ta.kind - 1].color;
    // keep to the known winning line while the player follows it
    if (solution && solStep < solution.length) {
      const s = solution[solStep];
      if ((s[0] === a && s[1] === b) || (s[0] === b && s[1] === a)) solStep++; else solution = null;
    }
    pathFx.push({ pts: path.map((i) => ({ x: cellPX(i % SW), y: cellPY((i / SW) | 0) })), t: 0, col });
    for (const t of [ta, tb]) {
      const px = ox + (t.dx - 0.5) * ts, py = oy + (t.dy - 0.5) * ts;
      ghosts.push({ kind: t.kind, x: px, y: py, t: 0 });
      burst(px, py, col, 16);
      tiles.splice(tiles.indexOf(t), 1);
    }
    cells[a] = 0; cells[b] = 0; tileAt[a] = null; tileAt[b] = null; left -= 2;
    const moves = [];
    slide(cells, W, H, mode, moves);
    for (let k = 0; k < moves.length; k += 2) {
      const t = tileAt[moves[k]], j = moves[k + 1];
      tileAt[moves[k]] = null; tileAt[j] = t;
      t.i = j; t.x = j % SW; t.y = (j / SW) | 0; t.hold = 0.13;
    }
    sel = -1; hint = null;
    // score and combo
    combo = comboT > 0 ? combo + 1 : 1;
    comboT = COMBO_WINDOW; bestCombo = Math.max(bestCombo, combo);
    const gain = 100 + 40 * (Math.min(combo, 10) - 1);
    score += gain;
    const mx = (cellPX(a % SW) + cellPX(b % SW)) / 2, my = (cellPY((a / SW) | 0) + cellPY((b / SW) | 0)) / 2;
    if (combo >= 2) {
      const bonus = Math.min(2, 0.25 + 0.25 * (combo - 1));
      timeLeft = Math.min(timeMax, timeLeft + bonus);
      floats.push({ x: clamp(mx, 108, vw - 108), y: my, text: "Combo x" + combo + "  +" + num(Math.round(bonus * 100) / 100) + " s", t: 0, col: "#ffc28a" });
    } else {
      floats.push({ x: clamp(mx, 40, vw - 40), y: my, text: "+" + gain, t: 0, col: "#ffffff" });
    }
    sfx.match(combo);
    if (left === 0) { win(); return; }
    if (!anyPair(cells, W, H, 0)) {
      autoShuffles++;
      doShuffle();
      toast(TX("No moves left. The tiles were shuffled for you.", "Hết nước đi. Các ô đã được xáo lại giúp bạn."), 2000);
    }
  }
  // Rearranges the remaining tiles among the cells they occupy. What it hands back can always be
  // cleared: either the solver has cleared it, or it was written from its own way through.
  function doShuffle(written) {
    const occ = [];
    for (let i = 0; i < cells.length; i++) if (cells[i] !== 0) occ.push(i);
    const n = occ.length;
    if (n < 2) return;
    const kinds = occ.map((i) => cells[i]), objs = occ.map((i) => tileAt[i]);
    const perm = occ.map((_, k) => k), c2 = cells.slice();
    let ok = false, sol = null;
    for (let attempt = 0; attempt < (written ? 0 : 30) && !ok; attempt++) {
      shuffleArr(perm);
      for (let k = 0; k < n; k++) c2[occ[k]] = kinds[perm[k]];
      sol = solve(c2, W, H, mode); ok = !!sol;
    }
    if (!ok) {
      // none of those was cleared: write the arrangement from its own way through
      const pools = {}, pairKinds = [];
      for (let k = 0; k < n; k++) (pools[kinds[k]] = pools[kinds[k]] || []).push(k);
      for (const kind in pools) for (let q = 0; q + 1 < pools[kind].length; q += 2) pairKinds.push(+kind);
      const b = construct(cells, W, H, mode, shuffleArr(pairKinds));
      if (b) { for (let k = 0; k < n; k++) perm[k] = pools[b.c[occ[k]]].pop(); sol = b.sol; }
    }
    for (let k = 0; k < n; k++) {
      const i = occ[k], t = objs[perm[k]];
      cells[i] = t.kind; tileAt[i] = t; t.i = i; t.x = i % SW; t.y = (i / SW) | 0; t.hold = Math.random() * 0.08;
    }
    solution = sol; solStep = 0; sel = -1; hint = null;
    sfx.shuffle();
  }
  function useShuffle() {
    if (state !== "play") return;
    if (shuffles <= 0) { toast(TX("No shuffles left.", "Hết lượt xáo.")); sfx.bad(); return; }
    shuffles--; combo = 0; comboT = 0;
    doShuffle();
  }
  function useHint() {
    if (state !== "play") return;
    if (hint) return;                                   // one is already showing
    if (hints <= 0) { toast(TX("No hints left.", "Hết gợi ý.")); sfx.bad(); return; }
    let p = solution && solStep < solution.length ? solution[solStep] : null;
    if (!p) p = anyPair(cells, W, H, Math.floor(Math.random() * cells.length));
    if (!p) return;
    hints--; hint = [p[0], p[1]]; sel = -1;
    sfx.hint();
  }
  function pick(i) {
    if (state !== "play" || i < 0 || !tileAt[i]) return;
    if (introT > 0) { introT = 0; $("toast").classList.remove("is-on"); }   // the first pick starts the clock
    if (sel === i) { sel = -1; sfx.select(); return; }
    if (sel < 0 || !tileAt[sel]) { sel = i; sfx.select(); return; }
    if (cells[sel] === cells[i]) {
      const p = search(cells, W, H, sel, i);
      if (p) { removePair(sel, i, p); return; }
      tileAt[sel].shake = 0.3; tileAt[i].shake = 0.3;
      floats.push({ x: clamp(cellPX(i % SW), 50, vw - 50), y: cellPY((i / SW) | 0) - ts * 0.4, text: TX("No path", "Không nối được"), t: 0, col: "#ff9a9a" });
      sfx.bad(); sel = i;
      return;
    }
    sel = i; sfx.select();
  }
  function starsFor(frac) { return frac >= 0.4 ? 3 : frac >= 0.2 ? 2 : 1; }
  function starSvg(on) { return '<svg viewBox="0 0 24 24" class="' + (on ? "on" : "") + '" aria-hidden="true"><path d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7-6.3-3.4-6.3 3.4 1.3-7L1.8 9.200l7.1-.9z"/></svg>'; }
  function win() {
    state = "win"; const run = ++runId;
    const timeBonus = Math.round(timeLeft) * 20, helpBonus = (hints + shuffles) * 150;
    const total = score + timeBonus + helpBonus;
    const stars = starsFor(timeLeft / timeMax);
    const rec = save.levels[level] || { score: 0, stars: 0 };
    const isBest = total > rec.score;
    save.levels[level] = { score: Math.max(rec.score, total), stars: Math.max(rec.stars, stars) };
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, level + 1));
    save.cleared = 0; save.stars = 0; save.best = 0;
    for (const k in save.levels) { save.cleared++; save.stars += save.levels[k].stars; save.best += save.levels[k].score; }
    persist();
    score = total;
    sfx.win();
    for (let k = 0; k < 9; k++) burst(vw * (0.15 + 0.7 * Math.random()), vh * (0.25 + 0.4 * Math.random()), SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].color, 22);
    $("win-stars").innerHTML = starSvg(stars >= 1) + starSvg(stars >= 2) + starSvg(stars >= 3);
    ended = { total, timeBonus, isBest, left: 0 };
    paintEnd();
    $("btn-next").hidden = level >= LEVELS.length;
    setTimeout(() => { if (run === runId && state === "win") show("win"); }, 750);
  }
  function lose() {
    state = "lose"; runId++;
    sfx.lose();
    ended = { total: score, timeBonus: 0, isBest: false, left };
    paintEnd();
    show("lose");
  }
  // the words on the two end panels and in the bars, in the language now chosen
  let ended = null;
  function paintEnd() {
    if (!ended) return;
    $("win-title").textContent = level === LEVELS.length ? TX("Every level cleared", "Đã qua hết các màn") : TX("Level " + level + " cleared", "Đã qua màn " + level);
    $("win-text").textContent = TX("Score " + fmt(ended.total) + ". Time bonus " + fmt(ended.timeBonus) + ". Best combo " + bestCombo + ".", "Điểm " + fmt(ended.total) + ". Thưởng thời gian " + fmt(ended.timeBonus) + ". Combo cao nhất " + bestCombo + ".");
    const rec = save.levels[level];
    $("win-best").textContent = ended.isBest ? TX("New best for this level.", "Kỷ lục mới của màn này.") : rec ? TX("Your best here is " + fmt(rec.score) + ".", "Kỷ lục của bạn ở màn này là " + fmt(rec.score) + ".") : "";
    $("lose-text").textContent = TX(ended.left + " tiles were left on level " + level + ". You scored " + fmt(ended.total) + ".", "Còn " + ended.left + " ô ở màn " + level + ". Bạn được " + fmt(ended.total) + " điểm.");
  }
  function paintHud() {
    if (!level) return;
    $("hud-level").textContent = TX("Level " + level + " of " + LEVELS.length, "Màn " + level + " trên " + LEVELS.length);
    $("bar-mode").textContent = modeText(mode);
  }
  function pause() { if (state !== "play") return; state = "paused"; show("paused"); }
  function resume() { if (state !== "paused") return; state = "play"; show(null); last = performance.now(); }
  let page = 0;                // which twenty levels the menu shows
  const pageOf = (n) => Math.floor((clamp(n, 1, LEVELS.length) - 1) / PER_PAGE);
  function toMenu() {
    state = "menu"; runId++;
    page = pageOf(save.unlocked);          // the menu opens at the player's next level
    tiles = []; ghosts = []; parts = []; pathFx = []; floats = [];
    $("toast").classList.remove("is-on");
    buildMenu(); show("menu"); layout();
  }
  function buildMenu() {
    const box = $("levels"); box.innerHTML = "";
    page = clamp(page, 0, pageOf(LEVELS.length));
    const first = page * PER_PAGE + 1, end = Math.min(LEVELS.length, first + PER_PAGE - 1);
    $("page-label").textContent = TX("Levels ", "Màn ") + first + "–" + end;
    $("btn-page-prev").disabled = page <= 0; $("btn-page-next").disabled = end >= LEVELS.length;
    $("btn-page-prev").setAttribute("aria-label", TX("Earlier levels", "Các màn trước"));
    $("btn-page-next").setAttribute("aria-label", TX("Later levels", "Các màn sau"));
    for (let n = first; n <= end; n++) {
      const rec = save.levels[n], open = n <= save.unlocked;
      const b = document.createElement("button");
      b.type = "button"; b.className = "lv" + (n === save.unlocked && !rec ? " is-next" : ""); b.disabled = !open;
      b.setAttribute("aria-label", TX("Level ", "Màn ") + n + (open ? "" : TX(", locked", ", đã khóa")));
      const st = rec ? rec.stars : 0;
      b.innerHTML = '<span class="lv__n">' + n + '</span><span class="lv__s">' + starSvg(st >= 1) + starSvg(st >= 2) + starSvg(st >= 3) + "</span>";
      b.addEventListener("click", () => { audioInit(); startLevel(n); });
      box.appendChild(b);
    }
    $("btn-play").textContent = save.cleared ? TX("Play level " + save.unlocked, "Chơi màn " + save.unlocked) : TX("Play", "Chơi");
    $("menu-best").textContent = save.cleared ? TX(save.cleared + " of " + LEVELS.length + " levels cleared. " + save.stars + " of " + LEVELS.length * 3 + " stars.", "Đã qua " + save.cleared + " trên " + LEVELS.length + " màn. " + save.stars + " trên " + LEVELS.length * 3 + " sao.") : "";
    $("btn-sound").textContent = soundText();
    $("levels").setAttribute("aria-label", TX("Levels", "Các màn"));
    $("game").setAttribute("aria-label", TX("Pair Path game board", "Bàn chơi Pair Path"));
    $("btn-pause").setAttribute("aria-label", TX("Pause", "Tạm dừng"));
    $("btn-mute").setAttribute("aria-label", TX("Sound on or off", "Bật hoặc tắt âm thanh"));
    $("btn-mute").classList.toggle("is-off", save.mute);
  }

  // ====================================================
  // INPUT
  // ====================================================
  function tileAtPoint(px, py) {
    let hit = -1;
    const half = ts / 2;
    for (const t of tiles) {
      const cx = ox + (t.dx - 0.5) * ts, cy = oy + (t.dy - 0.5) * ts;
      if (Math.abs(px - cx) <= half && Math.abs(py - cy) <= half) hit = t.i;
    }
    return hit;
  }
  canvas.addEventListener("pointerdown", (e) => {
    audioInit();
    if (state !== "play") return;
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cur.on = false;
    pick(tileAtPoint(e.clientX, e.clientY));
  });
  const stop = (e) => e.preventDefault();
  document.addEventListener("gesturestart", stop);
  document.addEventListener("dblclick", stop);
  canvas.addEventListener("touchstart", stop, { passive: false });
  canvas.addEventListener("touchmove", stop, { passive: false });
  canvas.addEventListener("contextmenu", stop);
  document.addEventListener("touchmove", (e) => { if (!e.target.closest || !e.target.closest(".panel")) e.preventDefault(); }, { passive: false });

  const on = (id, fn) => $(id).addEventListener("click", () => { audioInit(); $(id).blur(); fn(); });
  on("btn-play", () => startLevel(save.unlocked));
  on("btn-page-prev", () => { if (page > 0) { page--; buildMenu(); } });
  on("btn-page-next", () => { if (page < pageOf(LEVELS.length)) { page++; buildMenu(); } });
  on("btn-pause", pause);
  on("btn-mute", () => setMute(!save.mute));
  on("btn-sound", () => setMute(!save.mute));
  on("btn-hint", useHint);
  on("btn-shuffle", useShuffle);
  on("btn-resume", resume);
  on("btn-restart", () => startLevel(level));
  on("btn-quit", toMenu);
  on("btn-next", () => startLevel(level + 1));
  on("btn-again", () => startLevel(level));
  on("btn-levels", toMenu);
  on("btn-retry", () => startLevel(level));
  on("btn-lose-levels", toMenu);

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "m" || k === "M") { audioInit(); setMute(!save.mute); return; }
    if (k === "p" || k === "P" || k === "Escape") {
      if (state === "play") pause(); else if (state === "paused") resume();
      return;
    }
    if (state !== "play") {
      // Enter presses the main button of the panel that is showing
      if (k === "Enter" && !(e.target && (e.target.tagName === "BUTTON" || e.target.tagName === "A"))) {
        const id = state === "menu" ? "btn-play" : state === "paused" ? "btn-resume" : state === "lose" ? "btn-retry" : level < LEVELS.length ? "btn-next" : "btn-again";
        if (!$(state === "menu" ? "menu" : state).hidden) { e.preventDefault(); $(id).click(); }
      }
      return;
    }
    audioInit();
    if (k === "h" || k === "H") { useHint(); return; }
    if (k === "s" || k === "S") { useShuffle(); return; }
    const d = { ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3 }[k];
    if (d !== undefined) {
      e.preventDefault();
      if (!cur.on) { cur.on = true; cur.x = clamp(cur.x, 1, W); cur.y = clamp(cur.y, 1, H); return; }
      cur.x = clamp(cur.x + DX[d], 1, W); cur.y = clamp(cur.y + DY[d], 1, H);
      return;
    }
    if (k === "Enter" || k === " ") {
      if (e.target && e.target.tagName === "BUTTON") return;
      e.preventDefault();
      if (cur.on) pick(cur.y * SW + cur.x);
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); else last = performance.now(); });
  window.addEventListener("blur", () => { if (state === "play" && document.hidden) pause(); });
  let resizeT = 0;
  const onResize = () => { layout(); clearTimeout(resizeT); resizeT = setTimeout(layout, 250); };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);

  // ====================================================
  // DRAWING
  // ====================================================
  const floaters = [];
  for (let k = 0; k < 14; k++) floaters.push({ kind: 1 + ((k * 7) % 32), x: Math.random(), y: Math.random(), v: 0.012 + Math.random() * 0.02, s: 0.7 + Math.random() * 0.6, ph: Math.random() * TAU });
  function outline(cx, cy, s, col, widthPx, alpha) {
    g.save(); g.globalAlpha = alpha; g.strokeStyle = col; g.lineWidth = widthPx; g.shadowColor = col; g.shadowBlur = 12;
    const pad = Math.max(1, ts * 0.035), lift = ts * 0.05;
    rr(g, cx - s / 2 + pad, cy - s / 2 + pad, s - pad * 2, s - pad * 2 - lift, s * 0.19); g.stroke(); g.restore();
  }
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  function draw(now) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.drawImage(bg, 0, 0, vw, vh);
    if (state === "menu") {
      for (const f of floaters) {
        const s = 58 * f.s, x = f.x * vw + Math.sin(now / 2600 + f.ph) * 14, y = f.y * (vh + 120) - 60;
        g.globalAlpha = 0.34; g.drawImage(sprites[f.kind], x - s / 2, y - s / 2, s, s);
      }
      g.globalAlpha = 1;
      return;
    }
    const blank = state === "paused";
    for (const q of ghosts) {
      const k = q.t / 0.24, s = ts * (1 + 0.35 * k);
      g.globalAlpha = 1 - k; g.drawImage(sprites[q.kind], q.x - s / 2, q.y - s / 2, s, s);
    }
    g.globalAlpha = 1;
    let top = null;
    for (const t of tiles) {
      if (t.i === sel && !blank) { top = t; continue; }
      const sc = t.pop >= 0.25 ? 1 : easeOut(t.pop / 0.25);
      if (sc <= 0) continue;
      const s = ts * sc, cx = ox + (t.dx - 0.5) * ts + (t.shake > 0 ? Math.sin(t.shake * 70) * t.shake * ts * 0.3 : 0), cy = oy + (t.dy - 0.5) * ts;
      g.drawImage(sprites[blank ? 0 : t.kind], cx - s / 2, cy - s / 2, s, s);
    }
    if (!blank) {
      if (hint) {
        const a = 0.55 + 0.45 * Math.sin(now / 140);
        for (const i of hint) { const t = tileAt[i]; if (t) outline(ox + (t.dx - 0.5) * ts, oy + (t.dy - 0.5) * ts, ts, "#ffd76a", 3, a); }
      }
      if (top) {
        const s = ts * 1.09, cx = ox + (top.dx - 0.5) * ts + (top.shake > 0 ? Math.sin(top.shake * 70) * top.shake * ts * 0.3 : 0), cy = oy + (top.dy - 0.5) * ts;
        g.drawImage(sprites[top.kind], cx - s / 2, cy - s / 2, s, s);
        outline(cx, cy, s, "#ffffff", 2.5, 1);
      }
      if (cur.on && state === "play") outline(cellPX(cur.x), cellPY(cur.y), ts, "#8fd6ff", 2, 0.9);
    }
    // the joining path: a wide soft line under a thin bright one
    g.lineCap = "round"; g.lineJoin = "round";
    for (const p of pathFx) {
      const a = 1 - easeOut(Math.max(0, p.t - 0.12) / 0.33);
      g.beginPath(); p.pts.forEach((q, k) => (k ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.globalAlpha = a * 0.45; g.strokeStyle = p.col; g.lineWidth = Math.max(8, ts * 0.24); g.stroke();
      g.globalAlpha = a; g.strokeStyle = "#ffffff"; g.lineWidth = Math.max(2.5, ts * 0.07); g.stroke();
    }
    g.globalCompositeOperation = "lighter";
    for (const p of parts) {
      g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, p.y, p.r * (0.4 + 0.6 * p.life / p.max), 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-over";
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const f of floats) {
      const k = f.t / 0.9;
      g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      g.font = '700 ' + Math.round(clamp(ts * 0.36, 15, 22)) + 'px "Space Grotesk", system-ui, sans-serif';
      // longer words (the Vietnamese ones) are kept whole inside the screen
      const half = g.measureText(f.text).width / 2 + 6, fx = half * 2 < vw ? clamp(f.x, half, vw - half) : f.x;
      g.lineWidth = 4; g.strokeStyle = "rgba(4,6,12,0.85)"; g.strokeText(f.text, fx, f.y - 26 * easeOut(k));
      g.fillStyle = f.col; g.fillText(f.text, fx, f.y - 26 * easeOut(k));
    }
    g.globalAlpha = 1;
  }

  // ====================================================
  // MAIN LOOP
  // ====================================================
  let hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function hud() {
    const sec = Math.max(0, Math.ceil(timeLeft));
    setText("hud-time", Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"));
    setText("hud-score", fmt(score));
    setText("hint-count", String(hints)); setText("shuffle-count", String(shuffles));
    const f = clamp(timeLeft / timeMax, 0, 1).toFixed(3);
    if (hudCache.f !== f) { hudCache.f = f; $("time-fill").style.transform = "scaleX(" + f + ")"; }
    const cf = (combo >= 1 ? clamp(comboT / COMBO_WINDOW, 0, 1) : 0).toFixed(2);
    if (hudCache.cf !== cf) { hudCache.cf = cf; $("combo-fill").style.transform = "scaleX(" + cf + ")"; }
    const low = state === "play" && timeLeft < Math.max(12, timeMax * 0.15);
    if (hudCache.low !== low) { hudCache.low = low; document.body.classList.toggle("low", low); }
    const he = hints <= 0, se = shuffles <= 0;
    if (hudCache.he !== he) { hudCache.he = he; $("btn-hint").classList.toggle("is-empty", he); }
    if (hudCache.se !== se) { hudCache.se = se; $("btn-shuffle").classList.toggle("is-empty", se); }
  }
  let last = performance.now();
  function settled() {
    for (const t of tiles) if (t.hold > 0 || Math.abs(t.dx - t.x) > 0.02 || Math.abs(t.dy - t.y) > 0.02) return false;
    return true;
  }
  function update(dt) {
    if (state === "play") {
      if (introT > 0) introT -= dt; else timeLeft -= dt;
      if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
      if (timeLeft <= 10 && timeLeft > 0) { const s = Math.ceil(timeLeft); if (s !== lastTick) { lastTick = s; sfx.tick(); } }
      if (timeLeft <= 0) { timeLeft = 0; lose(); }
    }
    if (state === "paused") return;
    const k = 1 - Math.exp(-dt * 20);
    for (const t of tiles) {
      if (t.pop < 0.25) t.pop += dt;
      if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
      if (t.hold > 0) { t.hold -= dt; continue; }
      t.dx += (t.x - t.dx) * k; t.dy += (t.y - t.dy) * k;
      if (Math.abs(t.x - t.dx) < 0.004) t.dx = t.x;
      if (Math.abs(t.y - t.dy) < 0.004) t.dy = t.y;
    }
    for (const q of ghosts) q.t += dt;
    ghosts = ghosts.filter((q) => q.t < 0.24);
    for (const p of pathFx) p.t += dt;
    pathFx = pathFx.filter((p) => p.t < 0.45);
    for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2.2 * dt; p.vy = p.vy * (1 - 2.2 * dt) + 260 * dt; }
    parts = parts.filter((p) => p.life > 0);
    for (const f of floats) f.t += dt;
    floats = floats.filter((f) => f.t < 0.9);
  }
  function frame(now) {
    requestAnimationFrame(frame);          // asked for first, so one bad frame can never stop the loop
    const dt = clamp((now - last) / 1000, 0, 0.1);
    last = now;
    if (!(dt >= 0)) return;
    if (!document.hidden) update(dt);
    if (state !== "menu") hud();
    draw(now);
  }

  setMute(save.mute);
  // Google serves Space Grotesk in pieces, one for each group of alphabets, and words drawn on the canvas do
  // not make the browser fetch the piece their letters are in. So ask for it. The board is drawn again on
  // every frame, so the words change to the right letters as soon as the piece is here.
  function loadCanvasFont() {
    if (!document.fonts || !document.fonts.load) return;
    document.fonts.load('700 16px "Space Grotesk"', TX("No path Combo", "Không nối được Combo")).catch(() => {});
  }
  // the language changed: write out again whatever is on screen
  if (window.PlayLang) window.PlayLang.onChange(() => { hudCache = {}; paintHud(); paintEnd(); buildMenu(); loadCanvasFont(); });
  loadCanvasFont();
  page = pageOf(save.unlocked);
  buildMenu(); show("menu"); layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state !== "menu") layout(); }).catch(() => {});
  requestAnimationFrame(frame);

  // ====================================================
  // TEST HANDLE
  // ====================================================
  const xy = (i) => [i % SW, (i / SW) | 0];
  function boardFromRows(rows) {
    const h = rows.length, w = rows[0].length, sw = w + 2, c = new Int8Array(sw * (h + 2));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = rows[y][x]; if (ch !== "." && ch !== " ") c[(y + 1) * sw + x + 1] = (ch.charCodeAt(0) % 32) + 1; }
    return { c, w, h, sw };
  }
  window.__pairpath = {
    get state() { return state; }, get level() { return level; }, get W() { return W; }, get H() { return H; },
    get mode() { return mode; }, get left() { return left; }, get score() { return score; },
    get time() { return timeLeft; }, get timeMax() { return timeMax; }, get hints() { return hints; }, get shuffles() { return shuffles; },
    get combo() { return combo; }, get autoShuffles() { return autoShuffles; }, get tileSize() { return ts; }, get settled() { return settled(); },
    get gen() { return genInfo; }, get save() { return JSON.parse(JSON.stringify(save)); }, get symbols() { return SYMBOLS.map((s) => s.name); },
    get hint() { return hint ? hint.map(xy) : null; }, get selected() { return sel >= 0 ? xy(sel) : null; },
    get solution() { return solution ? solution.slice(solStep).map((p) => [xy(p[0]), xy(p[1])]) : null; },
    get levels() { return LEVELS.length; },
    grid() { const out = []; for (let y = 1; y <= H; y++) { const r = []; for (let x = 1; x <= W; x++) r.push(cells[y * SW + x]); out.push(r); } return out; },
    start(n) { startLevel(n); },
    menu() { toMenu(); },
    findPair() { const p = anyPair(cells, W, H, 0); return p ? [xy(p[0]), xy(p[1])] : null; },
    path(ax, ay, bx, by) { const p = search(cells, W, H, ay * SW + ax, by * SW + bx); return p ? p.map(xy) : null; },
    cellCenter(x, y) { return { x: cellPX(x), y: cellPY(y) }; },
    tap(x, y) { pick(y * SW + x); },
    setTime(s) { timeLeft = s; introT = 0; },
    unlockAll() { save.unlocked = LEVELS.length; persist(); if (state === "menu") buildMenu(); },
    // rule checks on a hand-written board: rows of text, a dot is an empty cell
    testPath(rows, a, b) {
      const B = boardFromRows(rows);
      const p = search(B.c, B.w, B.h, a[1] * B.sw + a[0], b[1] * B.sw + b[0]);
      if (!p) return null;
      const pts = p.map((i) => [i % B.sw, (i / B.sw) | 0]);
      let turns = 0;
      for (let k = 2; k < pts.length; k++) if ((pts[k][0] - pts[k - 1][0]) !== (pts[k - 1][0] - pts[k - 2][0]) || (pts[k][1] - pts[k - 1][1]) !== (pts[k - 1][1] - pts[k - 2][1])) turns++;
      return { cells: pts, turns };
    },
    testSlide(rows, md) {
      const B = boardFromRows(rows), keep = {};
      for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) if (rows[y][x] !== ".") keep[(rows[y].charCodeAt(x) % 32) + 1] = rows[y][x];
      slide(B.c, B.w, B.h, md, null);
      const out = [];
      for (let y = 1; y <= B.h; y++) { let r = ""; for (let x = 1; x <= B.w; x++) { const v = B.c[y * B.sw + x]; r += v ? keep[v] : "."; } out.push(r); }
      return out;
    },
    testAnyPair(rows) { const B = boardFromRows(rows); const p = anyPair(B.c, B.w, B.h, 0); return p ? [[p[0] % B.sw, (p[0] / B.sw) | 0], [p[1] % B.sw, (p[1] / B.sw) | 0]] : null; },
    // generate and solve boards without playing them, to measure the generator
    testGenerate(n, upright) { const L = LEVELS[n - 1]; const r = generate(upright ? L.s : L.l, upright ? L.l : L.s, L.kinds, L.mode); return { solved: !!r.sol, tries: r.tries, ms: Math.round(r.ms) }; },
    // a board for level n with its way through, for checking outside the game. written: skip the random fillings
    testBoard(n, upright, written) { const L = LEVELS[n - 1], w = upright ? L.s : L.l, h = upright ? L.l : L.s; const r = generate(w, h, L.kinds, L.mode, written); return { w, h, mode: L.mode, cells: Array.from(r.c), sol: r.sol, tries: r.tries, built: r.built, ms: r.ms }; },
    slideCells(cells, w, h, md) { const c = Int8Array.from(cells); slide(c, w, h, md, null); return Array.from(c); },
    levelInfo(n) { const L = LEVELS[n - 1], pairs = L.s * L.l / 2; return { s: L.s, l: L.l, kinds: L.kinds, mode: L.mode, pairs, time: Math.round(pairs * secondsPerPair(n)), perPair: secondsPerPair(n), hints: hintsFor(n), shuffles: shufflesFor(n) }; },
    get page() { return page; }, get built() { return !!(genInfo && genInfo.built); },
    // test only: shuffle what is left. written: skip the random tries and write the arrangement from its way through
    shuffleNow(written) { doShuffle(written); return { hasMove: !!anyPair(cells, W, H, 0), line: !!solution }; },
    forceShuffle() { doShuffle(); return !!anyPair(cells, W, H, 0); },
    setBoardRows(rows, md) { const B = boardFromRows(rows); mode = md || "none"; setBoard(B.c, B.w, B.h); solution = null; hint = null; sel = -1; $("bar-mode").textContent = modeText(mode); layout(); }
  };
})();

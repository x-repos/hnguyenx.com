/* Qubit Flip: a gate puzzle. The state is simulated exactly with complex
   amplitudes. Qubit 0 is the top wire and the left digit of every label. */
(() => {
  "use strict";
  const SAVE_KEY = "qubit-flip-v1";
  const R2 = Math.SQRT1_2;
  const EPS = 1e-7;
  const $ = (id) => document.getElementById(id);

  // ---------- quantum state ----------
  function zero(n) {
    const N = 1 << n, s = { n, re: new Float64Array(N), im: new Float64Array(N) };
    s.re[0] = 1; return s;
  }
  // a move is a token such as "X0", "H1", "CX01" (control 0, target 1), "CZ01", "SW02"
  function parse(tok) {
    const m = /^(X|H|Z|S|CX|CZ|SW)(\d)(\d)?$/.exec(tok);
    if (!m) throw new Error("bad gate " + tok);
    return { t: m[1], a: +m[2], b: m[3] === undefined ? -1 : +m[3] };
  }
  function apply(s, tok) {
    const g = parse(tok), n = s.n, N = 1 << n, re = s.re, im = s.im;
    const ma = 1 << (n - 1 - g.a), mb = g.b >= 0 ? 1 << (n - 1 - g.b) : 0;
    if (g.a >= n || g.b >= n || g.a === g.b) throw new Error("bad qubit in " + tok);
    const two = g.t === "CX" || g.t === "CZ" || g.t === "SW";
    if (two !== (g.b >= 0)) throw new Error("bad gate " + tok);
    let t;
    for (let i = 0; i < N; i++) {
      switch (g.t) {
        case "X": if (!(i & ma)) { const j = i | ma; t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } break;
        case "H": if (!(i & ma)) {
          const j = i | ma, ar = re[i], ai = im[i], br = re[j], bi = im[j];
          re[i] = (ar + br) * R2; im[i] = (ai + bi) * R2; re[j] = (ar - br) * R2; im[j] = (ai - bi) * R2;
        } break;
        case "Z": if (i & ma) { re[i] = -re[i]; im[i] = -im[i]; } break;
        case "S": if (i & ma) { t = re[i]; re[i] = -im[i]; im[i] = t; } break;
        case "CX": if ((i & ma) && !(i & mb)) { const j = i | mb; t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } break;
        case "CZ": if ((i & ma) && (i & mb)) { re[i] = -re[i]; im[i] = -im[i]; } break;
        case "SW": if ((i & ma) && !(i & mb)) { const j = i ^ ma ^ mb; t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } break;
      }
    }
    return s;
  }
  function build(n, circuit) {
    const s = zero(n);
    for (const tok of circuit.split(" ")) if (tok) apply(s, tok);
    return s;
  }
  // remove the global phase: the first tile that is not empty gets phase zero
  function canon(s) {
    const N = 1 << s.n, out = { n: s.n, re: new Float64Array(N), im: new Float64Array(N) };
    let k = -1;
    for (let i = 0; i < N; i++) if (Math.hypot(s.re[i], s.im[i]) > EPS) { k = i; break; }
    if (k < 0) return out;
    const m = Math.hypot(s.re[k], s.im[k]), cr = s.re[k] / m, ci = -s.im[k] / m;
    for (let i = 0; i < N; i++) {
      out.re[i] = s.re[i] * cr - s.im[i] * ci;
      out.im[i] = s.re[i] * ci + s.im[i] * cr;
    }
    return out;
  }
  // how alike two states are, from 0 to 1, ignoring the global phase
  function fidelity(a, b) {
    let r = 0, i = 0;
    for (let k = 0; k < a.re.length; k++) {
      r += a.re[k] * b.re[k] + a.im[k] * b.im[k];
      i += a.re[k] * b.im[k] - a.im[k] * b.re[k];
    }
    return r * r + i * i;
  }
  const same = (a, b) => fidelity(a, b) > 1 - 1e-6;
  function key(s) {
    const c = canon(s); let k = "";
    for (let i = 0; i < c.re.length; i++) k += Math.round(c.re[i] * 1e4) + "," + Math.round(c.im[i] * 1e4) + ";";
    return k;
  }
  function allMoves(n, gates) {
    const out = [];
    for (const t of gates) {
      if (t === "CX") { for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) out.push(t + a + b); }
      else if (t === "CZ" || t === "SW") { for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) out.push(t + a + b); }
      else for (let a = 0; a < n; a++) out.push(t + a);
    }
    return out;
  }
  // breadth-first search over gate sequences: the shortest solution, or null
  function solve(lv) {
    const start = build(lv.n, lv.start), goal = key(build(lv.n, lv.target));
    const moves = allMoves(lv.n, lv.gates);
    const seen = new Map([[key(start), null]]);
    if (key(start) === goal) return [];
    let frontier = [start];
    while (frontier.length) {
      const next = [];
      for (const s of frontier) {
        const ks = key(s);
        for (const mv of moves) {
          const t = apply({ n: s.n, re: s.re.slice(), im: s.im.slice() }, mv), kt = key(t);
          if (seen.has(kt)) continue;
          seen.set(kt, [ks, mv]);
          if (kt === goal) {
            const path = []; let k = kt;
            while (seen.get(k)) { const [p, m] = seen.get(k); path.unshift(m); k = p; }
            return path;
          }
          next.push(t);
        }
      }
      frontier = next;
    }
    return null;
  }

  // ---------- levels ----------
  const GATE = {
    X: { name: "X", sub: "flip", key: "x" }, H: { name: "H", sub: "split", key: "h" },
    Z: { name: "Z", sub: "half turn", key: "z" }, S: { name: "S", sub: "quarter turn", key: "s" },
    CX: { name: "CNOT", sub: "linked flip", key: "c" }, CZ: { name: "CZ", sub: "linked turn", key: "v" },
    SW: { name: "SWAP", sub: "trade", key: "w" },
  };
  const CHAPTERS = [
    { title: "Flip", from: 0 }, { title: "Superposition", from: 3 }, { title: "Phase", from: 7 },
    { title: "Entanglement", from: 12 }, { title: "New gates", from: 19 }, { title: "Three qubits", from: 25 },
  ];
  const L = (name, n, start, target, gates, par, hint) => ({ name, n, start, target, gates: gates.split(" "), par, hint });
  const LEVELS = [
    L("First flip", 1, "", "X0", "X", 1, "X flips a qubit. Tap X to move the disc from 0 to 1."),
    L("Pick a qubit", 2, "", "X1", "X", 1, "With two qubits, tap X and then tap the qubit to flip. Each tile is one answer you could read out."),
    L("Trade places", 2, "X0", "X1", "X", 2, "The left digit is the top qubit q1. The right digit is the bottom qubit q2."),
    L("Half and half", 1, "", "H0", "X H", 1, "H splits a qubit into 0 and 1 at once. The size of a disc is the chance of reading that answer."),
    L("Back again", 1, "H0", "", "X H", 1, "H undoes itself. Use it again to bring the two halves back together."),
    L("Everywhere", 2, "", "H0 H1", "X H", 2, "Put H on both qubits to spread the state over all four tiles."),
    L("Half the board", 2, "", "X0 H1", "X H", 2, "Mix your gates. One qubit gets flipped and the other gets split."),
    L("Turn the hand", 1, "H0", "H0 Z0", "X H Z", 1, "Z turns the hand on the 1 tile half way round. That is phase. The discs keep their size, so the chances stay the same."),
    L("Hidden phase", 1, "H0 Z0", "X0", "H Z", 1, "Phase stays hidden until H reveals it. Tap H and watch the turned hand become a flip."),
    L("Flip without X", 1, "", "X0", "H Z", 3, "There is no X here. Put a Z between two H gates to build your own flip."),
    L("Plus and minus", 2, "", "H0 H1 Z1", "X H Z", 3, "Split both qubits, then turn the hand on just one of them."),
    L("Double reveal", 2, "H0 H1", "X0 X1", "H Z", 4, "Turn the hands first. Then let H reveal them."),
    L("Control", 2, "X0", "X0 X1", "CX", 1, "CNOT flips the target qubit only when the control qubit is 1. Tap CNOT, then the control, then the target."),
    L("Other way round", 2, "X1", "X0 X1", "CX", 1, "Either qubit can be the control. Pick the one that is 1."),
    L("Bell pair", 2, "", "H0 CX01", "H CX", 2, "Split one qubit, then use it as the control. Now the two qubits always agree. That is entanglement."),
    L("Opposites", 2, "", "H0 CX01 X1", "X H CX", 3, "Make a pair that always disagrees."),
    L("Twisted opposites", 2, "", "H0 CX01 X1 Z0", "X H Z CX", 4, "An entangled pair can carry a phase too. Watch the hands."),
    L("Untangle", 2, "H0 CX01", "", "H CX", 2, "Every gate can be undone. Run the Bell pair recipe backwards."),
    L("Three links", 2, "H0 S0 X1", "X0 H1 S1", "CX", 3, "Three CNOTs that take turns as the control will trade two qubits."),
    L("Swap", 2, "X0 H1", "H0 X1", "SW", 1, "SWAP trades two qubits in one move."),
    L("Corner hand", 2, "H0 H1", "H0 H1 CZ01", "H CZ", 1, "CZ turns the hand on the 11 tile only. Both qubits play the same part, so the order of your taps does not matter."),
    L("Bell without CNOT", 2, "", "H0 CX01", "H CZ", 4, "A CZ with an H before and after it on one qubit works just like a CNOT."),
    L("Quarter turn", 1, "H0", "H0 S0", "H S", 1, "S turns the hand a quarter turn. Two of them make a Z."),
    L("Four step flip", 1, "", "X0", "H S", 4, "Build a flip from H and S alone."),
    L("Counter turn", 1, "H0", "H0 S0 S0 S0", "H S Z", 2, "A quarter turn the other way is a half turn plus a quarter turn."),
    L("Eight tiles", 3, "", "X0 X2", "X", 2, "Three qubits have eight answers. The digits read top, middle, bottom."),
    L("Triple link", 3, "", "H0 CX01 CX02", "H CX", 3, "One H and two CNOTs tie all three qubits together. They always agree."),
    L("Pass it along", 3, "H0 CX01", "H0 CX02", "CX SW", 1, "Entanglement can be moved. Hand one half of the pair to the third qubit."),
    L("Odd one out", 3, "", "H0 CX01 CX02 X2", "X H CX", 4, "Tie all three together, but make the bottom qubit disagree with the other two."),
    L("Grand finale", 3, "H0 H1 H2", "H0 CX01 CX12 Z2", "H Z CX CZ", 5, "Gather the spread state into a triple link, then add a half turn."),
  ];

  // ---------- save ----------
  const save = { stars: [], best: [], solved: 0, totalStars: 0, last: 0, muted: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  if (!Array.isArray(save.stars)) save.stars = [];
  if (!Array.isArray(save.best)) save.best = [];
  function tally() {
    let solved = 0, total = 0;
    for (let i = 0; i < LEVELS.length; i++) {
      const st = Math.max(0, Math.min(3, save.stars[i] | 0));
      save.stars[i] = st; save.best[i] = Math.max(0, save.best[i] | 0);
      if (st > 0) solved++; total += st;
    }
    save.stars.length = save.best.length = LEVELS.length;
    save.solved = solved; save.totalStars = total;
    save.last = Math.max(0, Math.min(LEVELS.length - 1, save.last | 0));
  }
  tally();
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
  const unlocked = (i) => i < save.solved + 2 || !!save.stars[i] || (i > 0 && !!save.stars[i - 1]);
  function firstOpen() {
    for (let i = 0; i < LEVELS.length; i++) if (!save.stars[i]) return i;
    return -1;
  }

  // ---------- sound ----------
  let ac = null, master = null;
  function audio() {
    if (ac) { if (ac.state !== "running" && !document.hidden) { try { ac.resume().catch(() => {}); } catch (e) {} } return ac; }
    try {
      if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch (e) {} }
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    } catch (e) { ac = null; }
    return ac;
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (save.muted || !audio()) return;
    const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  const SFX = {
    X: () => tone(420, 640, 0.13, "triangle", 0.28),
    H: () => { tone(523, 523, 0.2, "sine", 0.2); tone(784, 784, 0.22, "sine", 0.16, 0.03); },
    Z: () => tone(660, 330, 0.16, "triangle", 0.26),
    S: () => tone(660, 495, 0.12, "triangle", 0.24),
    CX: () => { tone(294, 294, 0.1, "square", 0.1); tone(440, 660, 0.14, "triangle", 0.26, 0.07); },
    CZ: () => { tone(294, 294, 0.1, "square", 0.1); tone(660, 330, 0.16, "triangle", 0.24, 0.07); },
    SW: () => { tone(392, 587, 0.12, "sine", 0.24); tone(587, 392, 0.12, "sine", 0.24, 0.09); },
    pick: () => tone(880, 880, 0.05, "sine", 0.12),
    undo: () => tone(360, 240, 0.1, "sine", 0.18),
    nope: () => tone(160, 130, 0.12, "square", 0.08),
    win: (stars) => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, f, 0.5, "triangle", 0.2, i * 0.09));
      [261.63, 392, 523.25, 659.25].forEach((f) => tone(f, f, 1.1, "sine", 0.12, 0.4));
      if (stars === 3) tone(1568, 1568, 0.5, "sine", 0.1, 0.5);
    },
  };
  function setMuted(m) {
    save.muted = !!m; persist();
    $("btn-mute").classList.toggle("is-off", save.muted);
    if (!save.muted) tone(660, 880, 0.08, "sine", 0.15);
  }

  // ---------- game state ----------
  let cur = 0, lv = LEVELS[0], hist = [], state = zero(1), target = zero(1);
  let armed = null, pick = -1, solved = false, screen = "menu", lastStars = 0, winTimer = 0;

  const PH = [[143, 214, 255], [201, 168, 255], [255, 194, 138], [126, 232, 181]];
  function phaseColor(deg) {
    const t = ((deg % 360) + 360) % 360 / 90, i = Math.floor(t) % 4, f = t - Math.floor(t);
    const a = PH[i], b = PH[(i + 1) % 4];
    return "rgb(" + [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)).join(",") + ")";
  }
  function label(i, n) {
    let h = "";
    for (let q = 0; q < n; q++) h += '<span class="q' + q + '">' + ((i >> (n - 1 - q)) & 1) + "</span>";
    return h;
  }
  function makeTiles(host, n) {
    let h = "";
    for (let i = 0; i < 1 << n; i++) {
      h += '<div class="tile is-empty"><div class="tile__disc"><svg viewBox="-50 -50 100 100" aria-hidden="true">' +
        '<circle class="ring" r="44"/><circle class="disc" r="44"/><line class="hand" x1="0" y1="0" x2="0" y2="-40"/><circle class="hub" r="4"/>' +
        '</svg></div><div class="tile__label">' + label(i, n) + "</div></div>";
    }
    host.innerHTML = h;
    return [...host.children].map((el) => ({ el, disc: el.querySelector(".disc"), hand: el.querySelector(".hand"), ang: 0 }));
  }
  function paintTiles(tiles, s) {
    const c = canon(s);
    tiles.forEach((t, i) => {
      const mag = Math.min(1, Math.hypot(c.re[i], c.im[i]));
      const empty = mag < 1e-4;
      t.el.classList.toggle("is-empty", empty);
      t.disc.style.transform = "scale(" + (empty ? 0 : mag.toFixed(4)) + ")";
      if (!empty) {
        const deg = Math.atan2(c.im[i], c.re[i]) * 180 / Math.PI;
        const d = ((deg - t.ang) % 360 + 540) % 360 - 180;   // shortest way round
        t.ang += d;
        t.hand.style.transform = "rotate(" + t.ang.toFixed(2) + "deg)";
        t.disc.style.fill = phaseColor(deg);
      }
      t.el.setAttribute("aria-label", "chance " + Math.round(mag * mag * 100) + " percent");
    });
    return c;
  }

  let yoursTiles = [], targetTiles = [], targetCanon = null;

  function startLevel(i) {
    clearTimeout(winTimer);
    cur = Math.max(0, Math.min(LEVELS.length - 1, i | 0)); lv = LEVELS[cur];
    save.last = cur; persist();
    hist = []; armed = null; pick = -1; solved = false;
    target = build(lv.n, lv.target);
    $("states").className = "states n" + lv.n;
    yoursTiles = makeTiles($("tiles-yours"), lv.n);
    targetTiles = makeTiles($("tiles-target"), lv.n);
    $("lv-title").textContent = "Level " + (cur + 1) + ". " + lv.name;
    $("hint").textContent = lv.hint;
    // qubit wires
    let h = '<svg aria-hidden="true"></svg>';
    for (let q = 0; q < lv.n; q++) h += '<button type="button" class="wire q' + q + '" data-q="' + q + '" aria-label="Qubit ' + (q + 1) + '"><span class="wire__name">q' + (q + 1) + "</span></button>";
    $("circuit").innerHTML = h;
    $("circuit").classList.toggle("is-single", lv.n === 1);
    // gate buttons
    $("gates").innerHTML = lv.gates.map((t) => '<button type="button" class="gate" data-g="' + t + '" aria-label="' + GATE[t].name + ", " + GATE[t].sub + '">' +
      '<span class="gate__name' + (GATE[t].name.length > 2 ? " is-long" : "") + '">' + GATE[t].name + '</span><span class="gate__sub">' + GATE[t].sub + '</span><span class="gate__key" aria-hidden="true">' + GATE[t].key.toUpperCase() + "</span></button>").join("");
    showWin(false);
    show("play");
    // paint one frame later so the discs grow in
    requestAnimationFrame(() => { targetCanon = paintTiles(targetTiles, target); refresh(false); });
    targetCanon = canon(target);
    refresh(false);
  }

  function showWin(on) {
    $("win").hidden = !on; $("controls").hidden = on;
    $("stage").classList.toggle("is-won", on);
  }
  function recompute() { state = build(lv.n, lv.start); for (const m of hist) apply(state, m); }

  function refresh(isNew) {
    recompute();
    const c = paintTiles(yoursTiles, state);
    const f = Math.max(0, Math.min(1, fidelity(state, target)));
    const match = same(state, target);
    if (targetCanon) yoursTiles.forEach((t, i) => {
      const eq = Math.abs(c.re[i] - targetCanon.re[i]) < 1e-5 && Math.abs(c.im[i] - targetCanon.im[i]) < 1e-5;
      t.el.classList.toggle("is-same", eq && !t.el.classList.contains("is-empty"));
    });
    let pct = Math.round(f * 100); if (!match && pct > 99) pct = 99; if (match) pct = 100;
    $("match-fill").style.width = pct + "%";
    $("match-text").textContent = "Match " + pct + "%";
    $("match").classList.toggle("is-full", match);
    $("states").classList.toggle("is-match", match);
    $("lv-count").textContent = "Gates " + hist.length + " · Best possible " + lv.par;
    $("btn-undo").disabled = !hist.length; $("btn-reset").disabled = !hist.length;
    paintArmed(); drawCircuit(isNew);
    return match;
  }

  function promptText() {
    if (solved) return "Solved.";
    if (lv.n === 1) return "Tap a gate to use it.";
    if (!armed) return "Tap a gate, then tap a qubit.";
    const nm = GATE[armed].name;
    if (armed === "CX") return pick < 0 ? "CNOT is ready. Tap the control qubit." : "Control is q" + (pick + 1) + ". Now tap the target qubit.";
    if (armed === "CZ" || armed === "SW") return pick < 0 ? nm + " is ready. Tap the first qubit." : "First is q" + (pick + 1) + ". Now tap the second qubit.";
    return nm + " is ready. Tap a qubit.";
  }
  function paintArmed() {
    for (const b of $("gates").children) b.classList.toggle("is-armed", b.dataset.g === armed);
    const c = $("circuit"); c.classList.toggle("is-armed", !!armed && !solved && lv.n > 1);
    for (const w of c.querySelectorAll(".wire")) {
      const on = +w.dataset.q === pick;
      w.classList.toggle("is-picked", on);
      let tag = w.querySelector(".wire__tag");
      if (on && !tag) { tag = document.createElement("span"); tag.className = "wire__tag"; w.appendChild(tag); }
      if (!on && tag) tag.remove();
      if (on) tag.textContent = armed === "CX" ? "control" : "first";
    }
    $("prompt").textContent = promptText();
  }

  function drawCircuit(isNew) {
    const host = $("circuit"), svg = host.querySelector("svg");
    if (!svg) return;
    const W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return;
    const wires = [...host.querySelectorAll(".wire")];
    const ys = wires.map((w) => w.offsetTop + w.offsetHeight / 2);
    const col = ["#8fd6ff", "#c9a8ff", "#ffc28a"];
    const x0 = 78, step = 36, maxCols = Math.max(1, Math.floor((W - x0 - 8) / step));
    const shown = hist.slice(-maxCols), off = hist.length - shown.length;
    let h = "";
    ys.forEach((y, q) => { h += '<line x1="56" y1="' + y + '" x2="' + (W - 10) + '" y2="' + y + '" stroke="' + col[q] + '" stroke-opacity="0.35" stroke-width="2"/>'; });
    if (off > 0) ys.forEach((y) => { h += '<circle cx="58" cy="' + y + '" r="1.6" fill="#fff"/><circle cx="63" cy="' + y + '" r="1.6" fill="#fff"/>'; });
    shown.forEach((tok, k) => {
      const g = parse(tok), x = x0 + k * step, ya = ys[g.a], yb = g.b >= 0 ? ys[g.b] : 0;
      h += '<g class="cg' + (isNew && k === shown.length - 1 ? " is-new" : "") + '">';
      if (g.b < 0) {
        h += '<rect x="' + (x - 13) + '" y="' + (ya - 13) + '" width="26" height="26" rx="7" fill="#0a0e1c" stroke="' + col[g.a] + '" stroke-width="2"/><text x="' + x + '" y="' + (ya + 0.5) + '">' + g.t + "</text>";
      } else {
        h += '<line x1="' + x + '" y1="' + ya + '" x2="' + x + '" y2="' + yb + '" stroke="#fff" stroke-width="2"/>';
        const dot = (y) => '<circle cx="' + x + '" cy="' + y + '" r="5.5" fill="#fff"/>';
        const cross = (y) => '<path d="M' + (x - 6) + " " + (y - 6) + "l12 12m0 -12l-12 12" + '" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
        if (g.t === "CX") h += dot(ya) + '<circle cx="' + x + '" cy="' + yb + '" r="10" fill="#0a0e1c" stroke="#fff" stroke-width="2"/><path d="M' + (x - 10) + " " + yb + "h20M" + x + " " + (yb - 10) + 'v20" stroke="#fff" stroke-width="2"/>';
        else if (g.t === "CZ") h += dot(ya) + dot(yb);
        else h += cross(ya) + cross(yb);
      }
      h += "</g>";
    });
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = h;
  }

  function play(tok) {
    if (solved || screen !== "play") return false;
    try { apply(build(lv.n, lv.start), tok); } catch (e) { return false; }
    if (!lv.gates.includes(parse(tok).t)) return false;
    recompute();
    const before = { n: state.n, re: state.re.slice(), im: state.im.slice() };
    hist.push(tok);
    (SFX[parse(tok).t] || SFX.pick)();
    pick = -1;
    if (refresh(true)) win();
    else if (same(before, state)) $("prompt").textContent = "That gate left this state as it was.";
    return true;
  }
  function win() {
    solved = true; armed = null; pick = -1;
    const n = hist.length, stars = n <= lv.par ? 3 : n <= lv.par + 2 ? 2 : 1;
    lastStars = stars;
    if (stars > (save.stars[cur] | 0)) save.stars[cur] = stars;
    if (!save.best[cur] || n < save.best[cur]) save.best[cur] = n;
    tally(); persist(); paintArmed();
    SFX.win(stars);
    const last = cur === LEVELS.length - 1, all = save.solved === LEVELS.length;
    let txt = "Solved in " + n + (n === 1 ? " gate. " : " gates. ");
    txt += stars === 3 ? "That is the best possible." : "The best possible is " + lv.par + ".";
    if (last && all) txt += " You have solved every level.";
    $("win-text").textContent = txt;
    $("win-stars").innerHTML = [1, 2, 3].map((k) => starSvg(k <= stars)).join("");
    $("btn-next").textContent = last ? "Levels" : "Next level";
    clearTimeout(winTimer);
    winTimer = setTimeout(() => { if (solved) { showWin(true); drawCircuit(false); } }, 420);
  }
  const starSvg = (on) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="star' + (on ? " is-on" : "") + '" d="M12 2.2l2.9 6.2 6.8.8-5 4.7 1.3 6.7-6-3.3-6 3.3 1.3-6.7-5-4.7 6.8-.8z"/></svg>';

  function tapGate(t) {
    if (solved || !lv.gates.includes(t)) return;
    audio();
    const single = t !== "CX" && t !== "CZ" && t !== "SW";
    if (lv.n === 1) { play(t + "0"); return; }
    if (lv.n === 2 && (t === "CZ" || t === "SW")) { armed = null; pick = -1; play(t + "01"); return; }
    if (armed === t && (single || pick < 0)) { armed = null; pick = -1; }
    else { armed = t; pick = -1; }
    SFX.pick(); paintArmed();
  }
  function tapQubit(q) {
    if (solved || q >= lv.n) return;
    audio();
    if (lv.n === 1) return;
    if (!armed) { SFX.nope(); $("prompt").textContent = "Pick a gate first, then tap a qubit."; return; }
    if (armed === "CX" || armed === "CZ" || armed === "SW") {
      if (pick < 0) { pick = q; SFX.pick(); paintArmed(); return; }
      if (pick === q) { pick = -1; SFX.pick(); paintArmed(); return; }
      const a = pick, b = q;
      play(armed === "CX" ? "CX" + a + b : armed + Math.min(a, b) + Math.max(a, b));
      return;
    }
    play(armed + q);
  }
  function undo() {
    if (!hist.length || screen !== "play") return;
    clearTimeout(winTimer);
    hist.pop(); solved = false; pick = -1;
    showWin(false);
    SFX.undo(); refresh(false);
  }
  function reset() {
    if (screen !== "play") return;
    clearTimeout(winTimer);
    const had = hist.length;
    hist = []; solved = false; armed = null; pick = -1;
    showWin(false);
    if (had) SFX.undo();
    refresh(false);
  }

  // ---------- screens ----------
  function show(name) {
    screen = name;
    $("menu").hidden = name !== "menu";
    $("levels").hidden = name !== "levels";
    document.body.classList.toggle("in-menu", name !== "play");
    if (name === "menu") paintMenu();
    if (name === "levels") paintLevels();
    if (name === "play") { $("stage").hidden = false; requestAnimationFrame(() => drawCircuit(false)); }
  }
  function paintMenu() {
    const open = firstOpen();
    $("btn-play").textContent = save.solved === 0 ? "Play" : open < 0 ? "Play again" : "Continue at level " + (open + 1);
    $("best").textContent = save.solved ? save.solved + " of " + LEVELS.length + " solved. " + save.totalStars + " of " + LEVELS.length * 3 + " stars." : "";
  }
  function paintLevels() {
    const open = firstOpen();
    $("levels-sub").textContent = save.totalStars + " of " + LEVELS.length * 3 + " stars. Three stars means the fewest gates possible.";
    let h = "";
    CHAPTERS.forEach((ch, c) => {
      const to = c + 1 < CHAPTERS.length ? CHAPTERS[c + 1].from : LEVELS.length;
      h += "<h3>" + ch.title + '</h3><div class="lv__grid">';
      for (let i = ch.from; i < to; i++) {
        const st = save.stars[i] | 0, ok = unlocked(i);
        h += '<button type="button" class="lv__btn' + (st ? " is-done" : "") + (i === open ? " is-next" : "") + '" data-i="' + i + '"' + (ok ? "" : " disabled") +
          ' aria-label="Level ' + (i + 1) + (ok ? ", " + st + " stars" : ", locked") + '"><span class="lv__num">' + (i + 1) + '</span><span class="lv__stars">' +
          [1, 2, 3].map((k) => starSvg(k <= st)).join("") + "</span></button>";
      }
      h += "</div>";
    });
    $("lv-list").innerHTML = h;
    $("lv-list").scrollTop = 0;
    const nx = $("lv-list").querySelector(".is-next");
    if (nx && nx.scrollIntoView) nx.scrollIntoView({ block: "center" });
  }

  // ---------- input ----------
  $("gates").addEventListener("click", (e) => { const b = e.target.closest(".gate"); if (b) tapGate(b.dataset.g); });
  $("circuit").addEventListener("click", (e) => { const w = e.target.closest(".wire"); if (w) tapQubit(+w.dataset.q); });
  $("btn-undo").addEventListener("click", undo);
  $("btn-reset").addEventListener("click", reset);
  $("btn-again").addEventListener("click", reset);
  $("btn-next").addEventListener("click", () => { audio(); if (cur < LEVELS.length - 1) startLevel(cur + 1); else show("levels"); });
  $("btn-levels").addEventListener("click", () => { audio(); SFX.pick(); show("levels"); });
  $("btn-mute").addEventListener("click", () => { audio(); setMuted(!save.muted); });
  $("btn-play").addEventListener("click", () => { audio(); const o = firstOpen(); startLevel(o < 0 ? 0 : o); });
  $("btn-open-levels").addEventListener("click", () => { audio(); SFX.pick(); show("levels"); });
  $("btn-levels-back").addEventListener("click", () => { audio(); SFX.pick(); show("menu"); });
  $("lv-list").addEventListener("click", (e) => {
    const b = e.target.closest(".lv__btn");
    if (b && !b.disabled) { audio(); startLevel(+b.dataset.i); }
  });
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "m") { audio(); setMuted(!save.muted); return; }
    if (screen === "menu") { if (k === "enter" && document.activeElement === document.body) $("btn-play").click(); return; }
    if (screen === "levels") { if (k === "escape") show("menu"); return; }
    if (k === "escape") { show("levels"); return; }
    if (k === "backspace" || k === "u") { e.preventDefault(); undo(); return; }
    if (k === "r") { reset(); return; }
    if (solved) { if (k === "n" || (k === "enter" && document.activeElement === document.body)) $("btn-next").click(); return; }
    if (k >= "1" && k <= "3") { tapQubit(+k - 1); return; }
    for (const t of lv.gates) if (GATE[t].key === k) { tapGate(t); return; }
  });
  // no pinch or double tap zoom during play
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());
  let rz = 0;
  const onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (screen === "play") drawCircuit(false); }); };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 250));
  document.addEventListener("visibilitychange", () => {
    if (!ac) return;
    try { if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {}); } catch (e) {}
  });

  $("btn-mute").classList.toggle("is-off", save.muted);
  show("menu");

  // test handle
  window.__qubit = {
    levels: LEVELS, save,
    get screen() { return screen; }, get level() { return cur; }, get moves() { return hist.slice(); },
    get solved() { return solved; }, get armed() { return armed; }, get pick() { return pick; }, get lastStars() { return lastStars; },
    get amps() { recompute(); return { re: [...state.re], im: [...state.im] }; },
    get fidelity() { recompute(); return fidelity(state, target); },
    start: startLevel, play, undo, reset, show, unlocked,
    solve: (i) => solve(LEVELS[i]),
    check: (i, seq) => { const l = LEVELS[i], s = build(l.n, l.start); for (const m of seq) apply(s, m); return same(s, build(l.n, l.target)); },
    wipe: () => { save.stars = []; save.best = []; save.last = 0; tally(); persist(); },
  };
})();

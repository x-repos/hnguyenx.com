/* Qubit: a gate puzzle. States are simulated exactly with complex amplitudes.
   Qubit 0 is the top wire and the left digit of every label.

   Two sets of levels: Basics (no equations) and Advanced (Bell states, phase
   kickback, measurement, superdense coding, teleportation), which also shows
   each state in ket notation.

   Measurement splits the state into outcomes. The game keeps every outcome
   (a "world" is the list of them, each with its chance) and a level is only
   solved when the goal holds in all of them, so a protocol has to work
   whatever the measurements read.

   Layout of this file:
     quantum states and gates · worlds and measurement · goals · solver
     levels · save · sound · drawing the states · game flow · screens · input */
(() => {
  "use strict";
  const SAVE_KEY = "qubit-flip-v1";
  const R2 = Math.SQRT1_2;
  const EPS = 1e-7;
  const MAX_OUTCOMES = 4;
  const $ = (id) => document.getElementById(id);
  // tr("English", "Tiếng Việt") gives the text in the language the visitor chose (see ../lang.js)
  const tr = window.PlayLang ? PlayLang.t : (en) => en;

  // ---------- quantum states and gates ----------
  function zero(n) {
    const N = 1 << n, s = { n, re: new Float64Array(N), im: new Float64Array(N) };
    s.re[0] = 1; return s;
  }
  const copy = (s) => ({ n: s.n, re: s.re.slice(), im: s.im.slice() });
  // a move is a token such as "X0", "H1", "CX01" (control 0, target 1), "CZ01", "SW02", "M0" (measure)
  function parse(tok) {
    const m = /^(X|H|Z|S|T|M|CX|CZ|SW)(\d)(\d)?$/.exec(tok);
    if (!m) throw new Error("bad gate " + tok);
    return { t: m[1], a: +m[2], b: m[3] === undefined ? -1 : +m[3] };
  }
  function apply(s, tok) {
    const g = parse(tok), n = s.n, N = 1 << n, re = s.re, im = s.im;
    const ma = 1 << (n - 1 - g.a), mb = g.b >= 0 ? 1 << (n - 1 - g.b) : 0;
    if (g.a >= n || g.b >= n || g.a === g.b) throw new Error("bad qubit in " + tok);
    const two = g.t === "CX" || g.t === "CZ" || g.t === "SW";
    if (two !== (g.b >= 0) || g.t === "M") throw new Error("bad gate " + tok);
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
        case "T": if (i & ma) { t = re[i]; re[i] = (t - im[i]) * R2; im[i] = (t + im[i]) * R2; } break;
        case "CX": if ((i & ma) && !(i & mb)) { const j = i | mb; t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } break;
        case "CZ": if ((i & ma) && (i & mb)) { re[i] = -re[i]; im[i] = -im[i]; } break;
        case "SW": if ((i & ma) && !(i & mb)) { const j = i ^ ma ^ mb; t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } break;
      }
    }
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
  function key(s) {
    const c = canon(s); let k = "";
    for (let i = 0; i < c.re.length; i++) k += Math.round(c.re[i] * 1e4) + "," + Math.round(c.im[i] * 1e4) + ";";
    return k;
  }

  // ---------- worlds and measurement ----------
  // a world is a list of outcomes { p, s }: one outcome until something is measured
  const chanceOfZero = (s, q) => { const m = 1 << (s.n - 1 - q); let p = 0; for (let i = 0; i < s.re.length; i++) if (!(i & m)) p += s.re[i] * s.re[i] + s.im[i] * s.im[i]; return p; };
  // 0 or 1 if this qubit is sure to read that, otherwise -1
  const sureBit = (s, q) => { const p0 = chanceOfZero(s, q); return p0 > 1 - 1e-9 ? 0 : p0 < 1e-9 ? 1 : -1; };
  function measure(world, q) {
    const out = [];
    for (const b of world) {
      const m = 1 << (b.s.n - 1 - q), p0 = chanceOfZero(b.s, q);
      for (let bit = 0; bit < 2; bit++) {
        const pr = bit ? 1 - p0 : p0;
        if (pr < 1e-9) continue;
        const s = copy(b.s), k = 1 / Math.sqrt(pr);
        for (let i = 0; i < s.re.length; i++) { if (!!(i & m) === !!bit) { s.re[i] *= k; s.im[i] *= k; } else { s.re[i] = 0; s.im[i] = 0; } }
        out.push({ p: b.p * pr, s });
      }
    }
    return out;
  }
  function run(world, tok) {
    const g = parse(tok);
    if (g.t === "M") { if (g.a >= world[0].s.n) throw new Error("bad qubit in " + tok); return measure(world, g.a); }
    for (const b of world) apply(b.s, tok);
    return world;
  }
  function build(n, circuit) {
    let w = [{ p: 1, s: zero(n) }];
    for (const tok of (circuit || "").split(" ")) if (tok) w = run(w, tok);
    return w;
  }
  const worldKey = (w) => w.map((b) => Math.round(b.p * 1e4) + ":" + key(b.s)).sort().join("|");

  // ---------- goals ----------
  //   state   every outcome is the target state                            (the usual kind)
  //   world   the outcomes and their chances are the target's
  //   qubit   in every outcome, qubit lv.q alone is in the state lv.want
  // lv.measured lists qubits that must also have been measured and read a sure 0 or 1.
  // Returns how far along the player is, from 0 to 1, and whether the level is solved.
  function judge(lv, world, moves) {
    let f = 0;
    if (lv.goal === "world") {
      const want = lv.targetWorld, used = new Set();
      for (const t of want) {
        let best = 0, pick = -1;
        world.forEach((b, i) => { if (used.has(i)) return; const v = Math.min(t.p, b.p) * fidelity(t.s, b.s); if (v > best) { best = v; pick = i; } });
        if (pick >= 0) used.add(pick);
        f += best;
      }
      if (world.length !== want.length) f = Math.min(f, 0.99);
    } else if (lv.goal === "qubit") {
      const w = lv.wantState, m = 1 << (lv.n - 1 - lv.q);
      for (const b of world) {
        let ov = 0;
        for (let i = 0; i < b.s.re.length; i++) if (!(i & m)) {
          const j = i | m;      // <want| applied to this qubit: conj(w0) a_i + conj(w1) a_j
          const cr = w.re[0] * b.s.re[i] + w.im[0] * b.s.im[i] + w.re[1] * b.s.re[j] + w.im[1] * b.s.im[j];
          const ci = w.re[0] * b.s.im[i] - w.im[0] * b.s.re[i] + w.re[1] * b.s.im[j] - w.im[1] * b.s.re[j];
          ov += cr * cr + ci * ci;
        }
        f += b.p * ov;
      }
    } else {
      for (const b of world) f += b.p * fidelity(b.s, lv.targetWorld[0].s);
    }
    let read = true;
    for (const q of lv.measured || []) {
      if (!moves.includes("M" + q)) read = false;
      for (const b of world) if (sureBit(b.s, q) < 0) read = false;
    }
    f = Math.max(0, Math.min(1, f));
    return { f: read ? f : Math.min(f, 0.99), solved: read && f > 1 - 1e-6 };
  }

  // On some levels one qubit (lv.far) is far away from the others. A two-qubit gate may touch it only
  // when the other qubit has been measured and reads a sure 0 or 1: then the gate is just a message
  // of one plain bit, "flip if I read 1". Returns true if this move is allowed.
  function reachable(lv, world, moves, tok) {
    if (lv.far === undefined) return true;
    const g = parse(tok);
    if (g.b < 0 || (g.a !== lv.far && g.b !== lv.far)) return true;
    const other = g.a === lv.far ? g.b : g.a;
    if (g.t === "SW" || (g.t === "CX" && g.a !== other)) return false;        // the far qubit cannot be the control, or be traded
    return moves.includes("M" + other) && world.every((b) => sureBit(b.s, other) >= 0);
  }

  // ---------- solver: breadth-first over gate sequences, shortest solution or null ----------
  function allMoves(n, gates) {
    const out = [];
    for (const t of gates) {
      if (t === "CX") { for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) out.push(t + a + b); }
      else if (t === "CZ" || t === "SW") { for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) out.push(t + a + b); }
      else for (let a = 0; a < n; a++) out.push(t + a);
    }
    return out;
  }
  const cloneWorld = (w) => w.map((b) => ({ p: b.p, s: copy(b.s) }));
  // opt.gates searches with another set of gates. opt.must only accepts a solution that uses one of
  // those gates: that is how the spare gates on each level are checked to be of no use.
  function solve(lv, maxDepth, maxNodes, opt) {
    const start = build(lv.n, lv.start), moves = allMoves(lv.n, (opt && opt.gates) || lv.gates), must = (opt && opt.must) || null;
    // which qubits have been measured matters for some goals, so it is part of what makes two positions the same
    const tag = (w, done, used) => worldKey(w) + "#" + done + (used ? "!" : "");
    if (!must && judge(lv, start, []).solved) return [];
    const seen = new Set([tag(start, "", false)]);
    let frontier = [{ w: start, path: [], done: "", used: false }], nodes = 0;
    for (let depth = 1; depth <= (maxDepth || 12) && frontier.length; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const mv of moves) {
          if (!reachable(lv, node.w, node.path, mv)) continue;
          let w = run(cloneWorld(node.w), mv);
          if (w.length > MAX_OUTCOMES) continue;
          const g = parse(mv), done = g.t === "M" && !node.done.includes(String(g.a)) ? (node.done + g.a).split("").sort().join("") : node.done;
          const used = node.used || (!!must && must.includes(g.t)), k = tag(w, done, used);
          if (seen.has(k)) continue;
          seen.add(k);
          const path = node.path.concat(mv);
          if ((!must || used) && judge(lv, w, path).solved) return path;
          if (++nodes > (maxNodes || 400000)) return undefined;      // gave up: too many positions
          next.push({ w, path, done, used });
        }
      }
      frontier = next;
    }
    return null;
  }

  // ---------- levels ----------
  const GATE = {
    X: { name: "X", sub: "flip", vi: "lật", key: "x" }, H: { name: "H", sub: "split", vi: "tách đôi", key: "h" },
    Z: { name: "Z", sub: "half turn", vi: "nửa vòng", key: "z" }, S: { name: "S", sub: "quarter turn", vi: "¼ vòng", key: "s" },
    T: { name: "T", sub: "eighth turn", vi: "⅛ vòng", key: "t" }, M: { name: "M", sub: "measure", vi: "đo", key: "d" },
    CX: { name: "CNOT", sub: "linked flip", vi: "lật liên kết", key: "c" }, CZ: { name: "CZ", sub: "linked turn", vi: "xoay liên kết", key: "v" },
    SW: { name: "SWAP", sub: "trade", vi: "đổi chỗ", key: "w" },
  };
  const gateSub = (g) => tr(GATE[g].sub, GATE[g].vi);
  // Most levels offer more gates than they need, so that choosing is part of the puzzle. The spare
  // gates are ones already taught, and were checked by search: no solution within par uses any of them.
  // o: { goal, q, want, measured, after } for the levels that need more than "reach this state"
  const L = (name, n, start, target, gates, par, hint, o) => Object.assign({ name, n, start, target, gates: gates.split(" "), par, hint, goal: "state" }, o || {});
  const BASIC = [
    L("First flip", 1, "", "X0", "X", 1, "X flips a qubit. Drag X onto the qubit to move the disc from 0 to 1."),
    L("Pick a qubit", 2, "", "X1", "X", 1, "With two qubits, drag X onto the one you want to flip. Each tile is one answer you could read out."),
    L("Trade places", 2, "X0", "X1", "X", 2, "The left digit is the top qubit q1. The right digit is the bottom qubit q2."),
    L("Half and half", 1, "", "H0", "X H", 1, "H splits a qubit into 0 and 1 at once. The size of a disc is the chance of reading that answer."),
    L("Back again", 1, "H0", "", "X H", 1, "H undoes itself. Use it again to bring the two halves back together."),
    L("Everywhere", 2, "", "H0 H1", "X H", 2, "Put H on both qubits to spread the state over all four tiles."),
    L("Half the board", 2, "", "X0 H1", "X H", 2, "Mix your gates. One qubit gets flipped and the other gets split."),
    L("Turn the hand", 1, "H0", "H0 Z0", "X H Z", 1, "Z turns the hand on the 1 tile half way round. That is phase. The discs keep their size, so the chances stay the same."),
    L("Hidden phase", 1, "H0 Z0", "X0", "X H Z", 1, "Phase stays hidden until H reveals it. Use H and watch the turned hand become a flip."),
    L("Flip without X", 1, "", "X0", "H Z", 3, "There is no X here. Put a Z between two H gates to build your own flip."),
    L("Plus and minus", 2, "", "H0 H1 Z1", "X H Z", 3, "Split both qubits, then turn the hand on just one of them."),
    L("Double reveal", 2, "H0 H1", "X0 X1", "H Z", 4, "Turn the hands first. Then let H reveal them."),
    L("Control", 2, "X0", "X0 X1", "H Z CX", 1, "CNOT flips the target qubit only when the control qubit is 1. Drop CNOT on the control qubit. The other qubit is the target."),
    L("Other way round", 2, "X1", "X0 X1", "H Z CX", 1, "Either qubit can be the control. Pick the one that is 1."),
    L("Bell pair", 2, "", "H0 CX01", "X H Z CX", 2, "Split one qubit, then use it as the control. Now the two qubits always agree. That is entanglement."),
    L("Opposites", 2, "", "H0 CX01 X1", "X H Z CX", 3, "Make a pair that always disagrees."),
    L("Twisted opposites", 2, "", "H0 CX01 X1 Z0", "X H Z CX", 4, "An entangled pair can carry a phase too. Watch the hands."),
    L("Untangle", 2, "H0 CX01", "", "X H Z CX", 2, "Every gate can be undone. Run the Bell pair recipe backwards."),
    L("Three links", 2, "H0 S0 X1", "X0 H1 S1", "CX", 3, "Three CNOTs that take turns as the control will trade two qubits."),
    L("Swap", 2, "X0 H1", "H0 X1", "X H Z SW", 1, "SWAP trades two qubits in one move."),
    L("Corner hand", 2, "H0 H1", "H0 H1 CZ01", "X H Z CZ", 1, "CZ turns the hand on the 11 tile only. Both qubits play the same part, so it does not matter which one you drop it on."),
    L("Bell without CNOT", 2, "", "H0 CX01", "X H Z CZ", 4, "A CZ with an H before and after it on one qubit works just like a CNOT."),
    L("Quarter turn", 1, "H0", "H0 S0", "X H Z S", 1, "S turns the hand a quarter turn. Two of them make a Z."),
    L("Four step flip", 1, "", "X0", "H S", 4, "Build a flip from H and S alone."),
    L("Counter turn", 1, "H0", "H0 S0 S0 S0", "H Z S", 2, "A quarter turn the other way is a half turn plus a quarter turn."),
    L("Eight tiles", 3, "", "X0 X2", "X H Z S", 2, "Three qubits have eight answers. The digits read top, middle, bottom."),
    L("Triple link", 3, "", "H0 CX01 CX02", "X H Z CX", 3, "One H and two CNOTs tie all three qubits together. They always agree."),
    L("Pass it along", 3, "H0 CX01", "H0 CX02", "X H CX SW", 1, "Entanglement can be moved. Hand one half of the pair to the third qubit."),
    L("Odd one out", 3, "", "H0 CX01 CX02 X2", "X H Z CX", 4, "Tie all three together, but make the bottom qubit disagree with the other two."),
    L("Grand finale", 3, "H0 H1 H2", "H0 CX01 CX12 Z2", "H Z CX CZ", 5, "Gather the spread state into a triple link, then add a half turn."),
  ];
  const ADVANCED = [
    // Bell states
    L("Phi plus", 2, "", "H0 CX01", "X H Z S CX", 2, "The first Bell state, |Φ+⟩ = (|00⟩ + |11⟩)/√2. H on one qubit, then CNOT with it as the control.",
      { after: "Neither qubit has a state of its own any more. Only the pair does." }),
    L("Phi minus", 2, "", "H0 CX01 Z0", "X H Z S CX", 3, "|Φ−⟩ = (|00⟩ − |11⟩)/√2. The same pair with a half turn on the 11 tile.",
      { after: "A Z on either qubit gives the same state. In an entangled pair a phase belongs to the pair, not to one side." }),
    L("Psi plus", 2, "", "H0 CX01 X1", "X H Z S CX", 3, "|Ψ+⟩ = (|01⟩ + |10⟩)/√2. The two qubits always disagree.",
      { after: "Φ+, Φ−, Ψ+ and Ψ− are the four Bell states. Together they form a basis for two qubits." }),
    L("Psi minus", 2, "", "H0 CX01 X1 Z0", "X H S CX SW", 4, "|Ψ−⟩ = (|01⟩ − |10⟩)/√2, the singlet. There is no Z here: get the minus sign from X and H.",
      { after: "The singlet looks the same in every basis: whichever way both sides measure, they disagree." }),
    L("One side only", 2, "H0 CX01", "H0 CX01 X0 Z0", "X H Z S CX", 2, "Alice holds the top qubit of a shared |Φ+⟩. Acting on her qubit alone, turn the pair into |Ψ−⟩.",
      { after: "With I, X, Z or both on one qubit, Alice can reach all four Bell states. That is two bits of choice carried by one qubit." }),
    L("Bell measurement", 2, "H0 CX01 X1 Z0", "X0 X1", "X H Z S CX", 2, "Run the Bell recipe backwards on |Ψ−⟩. Each Bell state unwinds to a different pair of plain bits.",
      { after: "CNOT then H maps Φ+, Ψ+, Φ−, Ψ− to 00, 01, 10, 11. Measuring after it tells the four Bell states apart." }),
    // Phase
    L("Eighth turn", 1, "H0", "H0 T0", "X H Z S T", 1, "T turns the hand an eighth of a turn: a phase of e^(iπ/4) on |1⟩.",
      { after: "T is the gate that takes a computer beyond what can be simulated easily. H, S and CNOT alone are not enough." }),
    L("S from T", 1, "H0", "H0 S0", "X H Z T", 2, "Two eighth turns make a quarter turn."),
    L("Kickback", 2, "H0 X1 H1", "H0 Z0 X1 H1", "X H S T CX", 1, "The bottom qubit is in |−⟩ and a CNOT cannot change it. Watch where the phase goes instead.",
      { after: "The target was left alone and the control got a half turn. This phase kickback is how algorithms read a function without looking at its output." }),
    L("Deutsch", 2, "X1 H1", "X0 X1 H1", "H S T CX CZ", 3, "The bottom qubit is ready in |−⟩. The CNOT is a box for a balanced function: use it once, with the top qubit as control, so that the top qubit reads 1 for certain.",
      { after: "With a constant function the top qubit would read 0. One use of the box tells constant from balanced; classically it takes two." }),
    // Measurement
    L("Collapse", 1, "H0", "H0 M0", "X H Z S M", 1, "M measures a qubit. A superposition does not survive it: the state splits into the possible readings, each with its chance.",
      { goal: "world", after: "From here on the game follows every reading. A level is solved only if it works out in all of them." }),
    L("A different question", 1, "H0 Z0", "X0", "X H Z S M", 2, "This is |−⟩. Measured as it is, it reads 0 or 1 at random. Use H first so that the reading is certain.",
      { measured: [0], after: "H before M measures in the X basis: it asks plus or minus instead of 0 or 1. A state can be certain for one question and random for the other." }),
    L("Both at once", 2, "H0 CX01", "H0 CX01 M0", "X H Z S M", 1, "Measure only the top qubit of a Bell pair and watch the bottom one.",
      { goal: "world", after: "The bottom qubit was never touched, yet it is now certain too. The readings are random, so no message is sent this way." }),
    L("Three way collapse", 3, "H0 CX01 CX02", "H0 CX01 CX02 M0", "X H Z S M", 1, "This is the GHZ state (|000⟩ + |111⟩)/√2. Measure any one qubit.",
      { goal: "world", after: "One reading in the 0 or 1 basis leaves nothing entangled. The next level measures the same state another way." }),
    L("Keep the pair", 3, "H0 CX01 CX02", "H0 CX01 CX02 H0 M0 CZ01", "X H Z CZ M", 3, "Measure the top qubit of the GHZ state so that the other two stay entangled, then use the reading to fix their sign.",
      { goal: "world", after: "Measured in the X basis, the top qubit leaves a Bell pair behind. A CZ from the measured qubit is a Z applied only when it read 1." }),
    // Protocols
    L("Superdense coding", 2, "H0 CX01", "X0 X1", "X H Z CX M", 6, "Alice and Bob share |Φ+⟩. Alice wants to send the bits 11 by sending only her one qubit. Encode on the top qubit, decode with a Bell measurement, and measure both.",
      { measured: [0, 1], after: "Z then X on Alice's qubit made |Ψ−⟩, which decodes to 11. One qubit carried two bits, because the pair was shared beforehand." }),
    L("Teleportation", 3, "H0 T0 H1 CX12", "H0 T0 H1 CX12", "X H CX CZ M", 6, "Move the state of q1 onto q3. q2 and q3 already share a Bell pair, and q3 is far away. Do a Bell measurement on q1 and q2, then correct q3 with a CNOT from q2 and a CZ from q1.",
      { goal: "qubit", q: 2, want: "H0 T0", measured: [0, 1], far: 2, after: "The state now lives on q3 in all four readings, and q1 no longer has it. Only two plain bits travelled, and nothing was copied." }),
  ];
  const LEVELS = BASIC.concat(ADVANCED), ADV = BASIC.length;
  const CHAPTERS = [
    { title: "Flip", vi: "Lật", from: 0 }, { title: "Superposition", vi: "Chồng chập", from: 3 }, { title: "Phase", vi: "Pha", from: 7 },
    { title: "Entanglement", vi: "Vướng víu", from: 12 }, { title: "New gates", vi: "Cổng mới", from: 19 }, { title: "Three qubits", vi: "Ba qubit", from: 25 },
    { title: "Bell states", vi: "Trạng thái Bell", from: ADV, first: true }, { title: "Phase and kickback", vi: "Pha và pha dội ngược", from: ADV + 6 },
    { title: "Measurement", vi: "Phép đo", from: ADV + 10 }, { title: "Protocols", vi: "Giao thức", from: ADV + 15 },
  ];
  // The same levels in Vietnamese, in the same order: name, hint, and the note shown after solving.
  // "ô" is a tile, "đĩa" a disc, "kim" the hand that shows the phase, "kết quả đo" a reading.
  const VI = [
    ["Lật đầu tiên", "X lật một qubit. Kéo X thả vào qubit để đưa đĩa từ 0 sang 1."],
    ["Chọn một qubit", "Với hai qubit, hãy kéo X thả vào qubit bạn muốn lật. Mỗi ô là một kết quả bạn có thể đọc ra."],
    ["Đổi chỗ", "Chữ số bên trái là qubit trên, q1. Chữ số bên phải là qubit dưới, q2."],
    ["Nửa nọ nửa kia", "H tách một qubit thành 0 và 1 cùng lúc. Kích thước của đĩa cho biết khả năng đọc ra kết quả đó."],
    ["Quay trở lại", "H tự đảo ngược chính nó. Dùng H lần nữa để gộp hai nửa lại."],
    ["Khắp mọi nơi", "Đặt H lên cả hai qubit để trải trạng thái ra cả bốn ô."],
    ["Nửa bàn", "Hãy phối hợp các cổng. Một qubit được lật, qubit kia được tách."],
    ["Xoay kim", "Z xoay kim trên ô 1 đi nửa vòng. Đó chính là pha. Các đĩa giữ nguyên kích thước, nên xác suất không đổi."],
    ["Pha ẩn", "Pha vẫn ẩn cho đến khi H làm nó lộ ra. Dùng H và xem cái kim đã xoay biến thành một cú lật."],
    ["Lật mà không cần X", "Ở đây không có X. Hãy đặt một cổng Z giữa hai cổng H để tự tạo ra phép lật."],
    ["Cộng và trừ", "Tách cả hai qubit, rồi xoay kim trên chỉ một qubit."],
    ["Lộ diện kép", "Xoay các kim trước. Sau đó để H làm chúng lộ ra."],
    ["Điều khiển", "CNOT chỉ lật qubit mục tiêu khi qubit điều khiển là 1. Thả CNOT vào qubit điều khiển. Qubit còn lại là mục tiêu."],
    ["Theo chiều ngược lại", "Qubit nào cũng có thể làm điều khiển. Hãy chọn qubit đang là 1."],
    ["Cặp Bell", "Tách một qubit, rồi dùng nó làm điều khiển. Giờ hai qubit luôn cho cùng kết quả. Đó là vướng víu lượng tử."],
    ["Trái ngược", "Hãy tạo một cặp luôn cho kết quả trái ngược nhau."],
    ["Trái ngược, thêm pha", "Một cặp vướng víu cũng có thể mang pha. Hãy quan sát các kim."],
    ["Gỡ rối", "Cổng nào cũng đảo ngược được. Hãy làm ngược lại công thức tạo cặp Bell."],
    ["Ba mối nối", "Ba cổng CNOT lần lượt đổi vai điều khiển sẽ đổi chỗ hai qubit cho nhau."],
    ["Đổi chỗ bằng SWAP", "SWAP đổi chỗ hai qubit cho nhau chỉ trong một nước."],
    ["Kim ở góc", "CZ chỉ xoay kim trên ô 11. Hai qubit có vai trò như nhau, nên thả vào qubit nào cũng được."],
    ["Cặp Bell không cần CNOT", "Một cổng CZ kẹp giữa hai cổng H trên cùng một qubit hoạt động y như CNOT."],
    ["Một phần tư vòng", "S xoay kim một phần tư vòng. Hai cổng S bằng một cổng Z."],
    ["Lật trong bốn bước", "Hãy tạo phép lật chỉ bằng H và S."],
    ["Xoay ngược", "Một phần tư vòng theo chiều ngược lại bằng nửa vòng cộng một phần tư vòng."],
    ["Tám ô", "Ba qubit có tám kết quả. Các chữ số đọc theo thứ tự trên, giữa, dưới."],
    ["Liên kết ba", "Một cổng H và hai cổng CNOT buộc cả ba qubit lại với nhau. Chúng luôn cho cùng kết quả."],
    ["Chuyển tiếp", "Vướng víu có thể chuyển đi được. Hãy trao một nửa của cặp cho qubit thứ ba."],
    ["Kẻ khác biệt", "Buộc cả ba lại với nhau, nhưng để qubit dưới cùng trái ngược với hai qubit kia."],
    ["Màn kết", "Gom trạng thái đang trải rộng thành một liên kết ba, rồi thêm một nửa vòng."],
    ["Phi cộng", "Trạng thái Bell đầu tiên, |Φ+⟩ = (|00⟩ + |11⟩)/√2. Đặt H lên một qubit, rồi CNOT với qubit đó làm điều khiển.", "Không qubit nào còn trạng thái của riêng nó nữa. Chỉ cả cặp mới có trạng thái."],
    ["Phi trừ", "|Φ−⟩ = (|00⟩ − |11⟩)/√2. Vẫn là cặp đó, nhưng kim trên ô 11 xoay nửa vòng.", "Đặt Z lên qubit nào cũng cho cùng một trạng thái. Trong một cặp vướng víu, pha thuộc về cả cặp chứ không thuộc về riêng bên nào."],
    ["Psi cộng", "|Ψ+⟩ = (|01⟩ + |10⟩)/√2. Hai qubit luôn cho kết quả trái ngược nhau.", "Φ+, Φ−, Ψ+ và Ψ− là bốn trạng thái Bell. Chúng hợp thành một cơ sở cho hai qubit."],
    ["Psi trừ", "|Ψ−⟩ = (|01⟩ − |10⟩)/√2, trạng thái singlet. Ở đây không có Z: hãy tạo dấu trừ từ X và H.", "Trạng thái singlet trông như nhau trong mọi cơ sở: hai bên đo theo cách nào thì kết quả cũng trái ngược nhau."],
    ["Chỉ một phía", "Alice giữ qubit trên của một cặp |Φ+⟩ dùng chung. Chỉ tác động lên qubit của cô ấy, hãy biến cặp này thành |Ψ−⟩.", "Với I, X, Z hoặc cả X lẫn Z trên một qubit, Alice tạo được cả bốn trạng thái Bell. Tức là một qubit mang được hai bit lựa chọn."],
    ["Phép đo Bell", "Hãy làm ngược lại công thức tạo cặp Bell trên |Ψ−⟩. Mỗi trạng thái Bell sẽ gỡ ra thành một cặp bit thường khác nhau.", "CNOT rồi H biến Φ+, Ψ+, Φ−, Ψ− thành 00, 01, 10, 11. Đo sau bước này sẽ phân biệt được bốn trạng thái Bell."],
    ["Một phần tám vòng", "T xoay kim một phần tám vòng: một pha e^(iπ/4) trên |1⟩.", "T là cổng đưa máy tính lượng tử vượt ra ngoài những gì mô phỏng được một cách dễ dàng. Chỉ H, S và CNOT thì chưa đủ."],
    ["S từ T", "Hai lần một phần tám vòng thành một phần tư vòng."],
    ["Pha dội ngược", "Qubit dưới đang ở |−⟩ và CNOT không thể thay đổi nó. Hãy xem pha đi về đâu.", "Qubit mục tiêu không đổi, còn qubit điều khiển nhận nửa vòng. Hiện tượng pha dội ngược này là cách các thuật toán đọc một hàm mà không cần nhìn vào đầu ra của nó."],
    ["Deutsch", "Qubit dưới đã sẵn sàng ở |−⟩. Cổng CNOT là hộp đen của một hàm cân bằng: dùng nó một lần, với qubit trên làm điều khiển, để qubit trên chắc chắn đọc ra 1.", "Với hàm hằng, qubit trên sẽ đọc ra 0. Chỉ một lần dùng hộp đen là phân biệt được hàm hằng với hàm cân bằng; theo cách cổ điển phải cần hai lần."],
    ["Sụp đổ", "M đo một qubit. Chồng chập không tồn tại sau phép đo: trạng thái tách thành các kết quả đo có thể có, mỗi kết quả có xác suất riêng.", "Từ đây trò chơi theo dõi mọi kết quả đo. Một màn chỉ được coi là giải xong khi nó đúng trong tất cả các kết quả."],
    ["Một câu hỏi khác", "Đây là |−⟩. Nếu đo ngay, nó đọc ra 0 hoặc 1 một cách ngẫu nhiên. Hãy dùng H trước để kết quả đo là chắc chắn.", "H trước M là đo trong cơ sở X: nó hỏi cộng hay trừ thay vì 0 hay 1. Một trạng thái có thể chắc chắn với câu hỏi này nhưng ngẫu nhiên với câu hỏi kia."],
    ["Cả hai cùng lúc", "Chỉ đo qubit trên của một cặp Bell và quan sát qubit dưới.", "Qubit dưới không hề bị động đến, vậy mà giờ nó cũng chắc chắn. Các kết quả đo là ngẫu nhiên, nên không thể gửi tin theo cách này."],
    ["Sụp đổ bộ ba", "Đây là trạng thái GHZ (|000⟩ + |111⟩)/√2. Hãy đo một qubit bất kỳ.", "Chỉ một lần đo trong cơ sở 0/1 là không còn gì vướng víu nữa. Màn sau sẽ đo cùng trạng thái này theo cách khác."],
    ["Giữ lại cặp", "Hãy đo qubit trên của trạng thái GHZ sao cho hai qubit còn lại vẫn vướng víu, rồi dùng kết quả đo để sửa dấu của chúng.", "Khi đo trong cơ sở X, qubit trên để lại một cặp Bell. Cổng CZ từ qubit đã đo chính là cổng Z chỉ được áp dụng khi nó đọc ra 1."],
    ["Mã hóa siêu dày đặc", "Alice và Bob dùng chung |Φ+⟩. Alice muốn gửi hai bit 11 mà chỉ gửi đi một qubit của mình. Hãy mã hóa trên qubit trên, giải mã bằng phép đo Bell, rồi đo cả hai.", "Z rồi X trên qubit của Alice tạo ra |Ψ−⟩, giải mã ra 11. Một qubit mang được hai bit, vì cặp vướng víu đã được chia sẵn từ trước."],
    ["Dịch chuyển lượng tử", "Hãy chuyển trạng thái của q1 sang q3. q2 và q3 đã dùng chung một cặp Bell, và q3 ở rất xa. Thực hiện phép đo Bell trên q1 và q2, rồi sửa q3 bằng CNOT từ q2 và CZ từ q1.", "Giờ trạng thái nằm trên q3 trong cả bốn kết quả đo, và q1 không còn giữ nó nữa. Chỉ có hai bit thường được truyền đi, và không có gì bị sao chép."],
  ];
  LEVELS.forEach((lv, i) => {
    lv.vi = { name: VI[i][0], hint: VI[i][1], after: VI[i][2] || "" };
    lv.adv = i >= ADV;
    lv.targetWorld = build(lv.n, lv.target);
    if (lv.goal === "qubit") lv.wantState = build(1, lv.want)[0].s;
  });

  const lvName = (l) => tr(l.name, l.vi.name), lvHint = (l) => tr(l.hint, l.vi.hint), lvAfter = (l) => (l.after ? tr(l.after, l.vi.after) : "");

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
    save.solved = solved; save.totalStars = total; save.levels = LEVELS.length;
    save.last = Math.max(0, Math.min(LEVELS.length - 1, save.last | 0));
  }
  tally();
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
  const solvedIn = (from, to) => { let n = 0; for (let i = from; i < to; i++) if (save.stars[i]) n++; return n; };
  // each set opens two levels ahead of what has been solved in it; Advanced is open from the start
  function unlocked(i) {
    const from = i >= ADV ? ADV : 0, to = i >= ADV ? LEVELS.length : ADV;
    return i - from < solvedIn(from, to) + 2 || !!save.stars[i] || (i > from && !!save.stars[i - 1]);
  }
  function firstOpen(adv) {
    const from = adv ? ADV : 0, to = adv ? LEVELS.length : ADV;
    for (let i = from; i < to; i++) if (!save.stars[i]) return i;
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
    T: () => tone(660, 560, 0.1, "triangle", 0.22),
    M: () => { tone(880, 220, 0.18, "sine", 0.2); tone(1320, 1320, 0.05, "square", 0.05, 0.16); },
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

  // ---------- drawing the states ----------
  // the colour of a disc follows its phase, a quarter of the wheel per colour
  const PH = [[47, 111, 181], [124, 77, 196], [200, 112, 28], [42, 150, 100]];
  function phaseColor(deg) {
    const t = ((deg % 360) + 360) % 360 / 90, i = Math.floor(t) % 4, f = t - Math.floor(t);
    const a = PH[i], b = PH[(i + 1) % 4];
    return "rgb(" + [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)).join(",") + ")";
  }
  // tiles for the qubits listed in `show` (indexes into the level's qubits)
  function tilesHtml(show) {
    let h = "";
    for (let i = 0; i < 1 << show.length; i++) {
      let lab = "";
      show.forEach((q, k) => { lab += '<span class="q' + q + '">' + ((i >> (show.length - 1 - k)) & 1) + "</span>"; });
      h += '<div class="tile is-empty"><div class="tile__disc"><svg viewBox="-50 -50 100 100" aria-hidden="true">' +
        '<circle class="ring" r="44"/><circle class="disc" r="44"/><line class="hand hand--edge" x1="0" y1="0" x2="0" y2="-40"/><line class="hand" x1="0" y1="0" x2="0" y2="-40"/><circle class="hub" r="4"/>' +
        '</svg></div><div class="tile__label">' + lab + "</div></div>";
    }
    return h;
  }
  const grab = (host) => [...host.querySelectorAll(".tile")].map((el) => ({ el, disc: el.querySelector(".disc"), hands: [...el.querySelectorAll(".hand")], ang: 0 }));
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
        for (const h of t.hands) h.style.transform = "rotate(" + t.ang.toFixed(2) + "deg)";
        t.disc.style.fill = phaseColor(deg);
      }
      t.el.setAttribute("aria-label", tr("chance " + Math.round(mag * mag * 100) + " percent", "xác suất " + Math.round(mag * mag * 100) + " phần trăm"));
    });
    return c;
  }
  // the state of the qubits in `keep`, once the others are known to be plain bits
  function reduced(s, keep) {
    const out = { n: keep.length, re: new Float64Array(1 << keep.length), im: new Float64Array(1 << keep.length) };
    for (let i = 0; i < s.re.length; i++) {
      if (Math.abs(s.re[i]) + Math.abs(s.im[i]) < 1e-12) continue;
      let k = 0;
      keep.forEach((q) => { k = (k << 1) | ((i >> (s.n - 1 - q)) & 1); });
      out.re[k] += s.re[i]; out.im[k] += s.im[i];
    }
    return out;
  }
  const pct = (p) => { const v = p * 100; return (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)) + "%"; };
  // several outcomes side by side. Qubits that were measured are shown as their reading, the rest as tiles.
  function outcomesHtml(world, read) {
    let h = "";
    for (const b of world) {
      const bits = read.filter((q) => sureBit(b.s, q) >= 0), keep = [];
      for (let q = 0; q < b.s.n; q++) if (!bits.includes(q)) keep.push(q);
      const cap = bits.map((q) => '<span class="q' + q + '">q' + (q + 1) + "=" + sureBit(b.s, q) + "</span>").join(" ");
      h += '<div class="outcome" data-keep="' + keep.join("") + '"><div class="outcome__cap"><b>' + pct(b.p) + "</b> " + cap + "</div>" +
        (keep.length ? '<div class="tiles tiles--mini k' + keep.length + '">' + tilesHtml(keep) + "</div>" : '<div class="outcome__done">' + tr("all read", "đã đo hết") + "</div>") + "</div>";
    }
    return h;
  }
  function paintOutcomes(host, world) {
    [...host.querySelectorAll(".outcome")].forEach((el, i) => {
      const keep = el.dataset.keep.split("").filter(Boolean).map(Number);
      if (keep.length) paintTiles(grab(el), reduced(world[i].s, keep));
    });
  }

  // a state written out, such as (|00⟩ + |11⟩)/√2
  function ket(s) {
    const c = canon(s), terms = [];
    for (let i = 0; i < c.re.length; i++) { const m = Math.hypot(c.re[i], c.im[i]); if (m > 1e-6) terms.push({ i, m, deg: Math.atan2(c.im[i], c.re[i]) * 180 / Math.PI }); }
    const label = (i) => "|" + i.toString(2).padStart(s.n, "0") + "⟩";
    const PHASE = { 0: ["+", ""], 45: ["+", "e^(iπ/4)"], 90: ["+", "i"], 135: ["+", "e^(3iπ/4)"], 180: ["−", ""], 225: ["−", "e^(iπ/4)"], 270: ["−", "i"], 315: ["−", "e^(3iπ/4)"] };
    const phase = (deg) => { const d = Math.round((((deg % 360) + 360) % 360) / 45) * 45 % 360; return Math.abs(((deg - d + 540) % 360) - 180) < 0.5 ? PHASE[d] : null; };
    const same = terms.every((t) => Math.abs(t.m - terms[0].m) < 1e-6), exact = terms.every((t) => phase(t.deg));
    if (!same || !exact) {
      // amplitudes that are not all alike: write each one as a number
      return terms.map((t, k) => { const p = phase(t.deg); const co = t.m.toFixed(3) + (p ? p[1] : "·e^(i" + Math.round(t.deg) + "°)"); return (k ? (p ? " " + p[0] + " " : " + ") : p && p[0] === "−" ? "−" : "") + co + label(t.i); }).join("");
    }
    const body = terms.map((t, k) => { const p = phase(t.deg); return (k ? " " + p[0] + " " : p[0] === "−" ? "−" : "") + p[1] + label(t.i); }).join("");
    const inv = Math.round(1 / (terms[0].m * terms[0].m));           // 1 over the chance of each term
    if (inv === 1) return body;
    const den = { 2: "√2", 4: "2", 8: "2√2", 16: "4" }[inv] || "√" + inv;
    return "(" + body + ")/" + den;
  }

  // ---------- game state ----------
  let cur = 0, lv = LEVELS[0], hist = [], world = [{ p: 1, s: zero(1) }];
  let armed = null, pick = -1, solved = false, screen = "menu", lastStars = 0, winTimer = 0, match = { f: 0, solved: false };
  let yoursTiles = [], yoursShape = "", targetCanon = null;

  const readOf = (moves) => [...new Set(moves.filter((m) => m[0] === "M").map((m) => +m[1]))];
  function recompute() { world = build(lv.n, lv.start); for (const m of hist) world = run(world, m); }

  function paintTarget() {
    const host = $("tiles-target"), head = $("target-head");
    host.className = "tiles";
    if (lv.goal === "qubit") {
      head.textContent = tr("q" + (lv.q + 1) + " must be", "q" + (lv.q + 1) + " phải là");
      host.classList.add("k1");
      host.innerHTML = tilesHtml([lv.q]);
      requestAnimationFrame(() => paintTiles(grab(host), lv.wantState));
    } else if (lv.targetWorld.length > 1) {
      head.textContent = tr("Target", "Mục tiêu");
      host.classList.add("is-outcomes");
      host.innerHTML = outcomesHtml(lv.targetWorld, readOf(lv.target.split(" ")));
      requestAnimationFrame(() => paintOutcomes(host, lv.targetWorld));
    } else {
      head.textContent = tr("Target", "Mục tiêu");
      host.innerHTML = tilesHtml([...Array(lv.n).keys()]);
      const tiles = grab(host);
      requestAnimationFrame(() => { targetCanon = paintTiles(tiles, lv.targetWorld[0].s); });
      targetCanon = canon(lv.targetWorld[0].s);
    }
  }
  function paintYours() {
    const host = $("tiles-yours"), read = readOf(hist);
    const shape = world.length > 1 ? "o:" + world.map((b) => read.map((q) => sureBit(b.s, q)).join("")).join("|") : "one";
    if (world.length > 1) {
      // the picture is rebuilt whenever the set of outcomes changes shape
      if (shape !== yoursShape) { host.className = "tiles is-outcomes"; host.innerHTML = outcomesHtml(world, read); }
      paintOutcomes(host, world);
      yoursTiles = [];
    } else {
      if (shape !== yoursShape) { host.className = "tiles"; host.innerHTML = tilesHtml([...Array(lv.n).keys()]); yoursTiles = grab(host); }
      const c = paintTiles(yoursTiles, world[0].s), single = lv.goal === "state" && targetCanon;
      yoursTiles.forEach((t, i) => {
        const eq = single && Math.abs(c.re[i] - targetCanon.re[i]) < 1e-5 && Math.abs(c.im[i] - targetCanon.im[i]) < 1e-5;
        t.el.classList.toggle("is-same", !!eq && !t.el.classList.contains("is-empty"));
      });
    }
    yoursShape = shape;
    $("states").classList.toggle("has-outcomes", world.length > 1 || lv.targetWorld.length > 1);
    $("states").classList.toggle("has-many", world.length > 2 || lv.targetWorld.length > 2);
  }
  function paintKets() {
    const host = $("kets");
    host.hidden = !lv.adv;
    if (!lv.adv) return;
    const many = (n) => n + tr(" outcomes", " kết quả đo");
    const mine = world.length > 1 ? many(world.length) : ket(world[0].s);
    const goal = lv.goal === "qubit" ? "q" + (lv.q + 1) + " = " + ket(lv.wantState) : lv.targetWorld.length > 1 ? many(lv.targetWorld.length) : ket(lv.targetWorld[0].s);
    host.innerHTML = "<span><b>" + tr("Yours", "Của bạn") + "</b> " + mine + "</span><span><b>" + tr("Target", "Mục tiêu") + "</b> " + goal + "</span>";
  }

  // the words of the level: its title, its hint, and the gates with their captions
  function paintLevelText() {
    $("lv-title").textContent = (lv.adv ? tr("Advanced ", "Nâng cao ") + (cur - ADV + 1) : tr("Level ", "Màn ") + (cur + 1)) + ". " + lvName(lv);
    $("hint").textContent = lvHint(lv);
    $("gates").innerHTML = lv.gates.map((t) => '<button type="button" class="gate" data-g="' + t + '" aria-label="' + GATE[t].name + ", " + gateSub(t) + '">' +
      '<span class="gate__name' + (GATE[t].name.length > 2 ? " is-long" : "") + '">' + GATE[t].name + '</span><span class="gate__sub">' + gateSub(t) + '</span><span class="gate__key" aria-hidden="true">' + GATE[t].key.toUpperCase() + "</span></button>").join("");
    $("gates").classList.toggle("is-many", lv.gates.length > 4);
  }
  function startLevel(i) {
    clearTimeout(winTimer);
    cur = Math.max(0, Math.min(LEVELS.length - 1, i | 0)); lv = LEVELS[cur];
    save.last = cur; persist();
    hist = []; armed = null; pick = -1; solved = false; yoursShape = ""; targetCanon = null;
    $("states").className = "states n" + lv.n + (lv.adv ? " is-adv" : "");
    // qubit wires
    let h = '<svg aria-hidden="true"></svg>';
    for (let q = 0; q < lv.n; q++) h += '<button type="button" class="wire q' + q + '" data-q="' + q + '" aria-label="Qubit ' + (q + 1) + '"><span class="wire__name">q' + (q + 1) + "</span></button>";
    $("circuit").innerHTML = h;
    $("circuit").classList.toggle("is-single", lv.n === 1);
    paintLevelText();
    showWin(false);
    show("play");
    paintTarget();
    refresh(false);
  }

  function showWin(on) {
    $("win").hidden = !on; $("controls").hidden = on;
    $("stage").classList.toggle("is-won", on);
  }

  function refresh(isNew) {
    recompute();
    paintYours();
    match = judge(lv, world, hist);
    let pc = Math.round(match.f * 100); if (!match.solved && pc > 99) pc = 99; if (match.solved) pc = 100;
    $("match-fill").style.width = pc + "%";
    $("match-text").textContent = tr("Match ", "Khớp ") + pc + "%";
    $("match").classList.toggle("is-full", match.solved);
    $("states").classList.toggle("is-match", match.solved);
    $("lv-count").textContent = tr("Gates ", "Số cổng ") + hist.length + tr(" · Best possible ", " · Ít nhất có thể ") + lv.par;
    $("btn-undo").disabled = !hist.length; $("btn-reset").disabled = !hist.length;
    paintKets(); paintArmed(); drawCircuit(isNew);
    return match.solved;
  }

  function promptText() {
    if (solved) return tr("Solved.", "Đã giải xong.");
    if (lv.n === 1) return tr("Drag a gate onto the qubit.", "Kéo một cổng thả vào qubit.");
    if (!armed) return tr("Drag a gate onto a qubit.", "Kéo một cổng thả vào một qubit.");
    const nm = GATE[armed].name, q = "q" + (pick + 1);
    if (armed === "CX") return pick < 0 ? tr("CNOT is ready. Tap the control qubit.", "CNOT đã sẵn sàng. Chạm vào qubit điều khiển.") : tr("Control is " + q + ". Now tap the target qubit.", "Điều khiển là " + q + ". Giờ chạm vào qubit mục tiêu.");
    if (armed === "CZ" || armed === "SW") return pick < 0 ? tr(nm + " is ready. Tap the first qubit.", nm + " đã sẵn sàng. Chạm vào qubit thứ nhất.") : tr("First is " + q + ". Now tap the second qubit.", "Qubit thứ nhất là " + q + ". Giờ chạm vào qubit thứ hai.");
    return armed === "M" ? tr("Measure is ready. Tap a qubit.", "Phép đo đã sẵn sàng. Chạm vào một qubit.") : tr(nm + " is ready. Tap a qubit.", nm + " đã sẵn sàng. Chạm vào một qubit.");
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
      if (on) tag.textContent = armed === "CX" ? tr("control", "điều khiển") : tr("first", "thứ nhất");
    }
    $("prompt").textContent = promptText();
  }

  function drawCircuit(isNew) {
    const host = $("circuit"), svg = host.querySelector("svg");
    if (!svg) return;
    const W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return;
    const css = getComputedStyle(document.documentElement), ink = css.getPropertyValue("--fg").trim() || "#3b3226", paper = css.getPropertyValue("--chip").trim() || "#fffdf8";
    const wires = [...host.querySelectorAll(".wire")];
    const ys = wires.map((w) => w.offsetTop + w.offsetHeight / 2);
    const col = ["--q0", "--q1", "--q2"].map((v) => css.getPropertyValue(v).trim());
    const x0 = 78, step = 36, maxCols = Math.max(1, Math.floor((W - x0 - 8) / step));
    const shown = hist.slice(-maxCols), off = hist.length - shown.length;
    let h = "";
    ys.forEach((y, q) => { h += '<line x1="56" y1="' + y + '" x2="' + (W - 10) + '" y2="' + y + '" stroke="' + col[q] + '" stroke-opacity="0.45" stroke-width="2"/>'; });
    if (off > 0) ys.forEach((y) => { h += '<circle cx="58" cy="' + y + '" r="1.6" fill="' + ink + '"/><circle cx="63" cy="' + y + '" r="1.6" fill="' + ink + '"/>'; });
    shown.forEach((tok, k) => {
      const g = parse(tok), x = x0 + k * step, ya = ys[g.a], yb = g.b >= 0 ? ys[g.b] : 0;
      h += '<g class="cg' + (isNew && k === shown.length - 1 ? " is-new" : "") + '">';
      if (g.b < 0) {
        h += '<rect x="' + (x - 13) + '" y="' + (ya - 13) + '" width="26" height="26" rx="7" fill="' + (g.t === "M" ? col[g.a] : paper) + '" stroke="' + col[g.a] + '" stroke-width="2"/><text x="' + x + '" y="' + (ya + 0.5) + '"' + (g.t === "M" ? ' fill="' + paper + '"' : "") + ">" + g.t + "</text>";
      } else {
        h += '<line x1="' + x + '" y1="' + ya + '" x2="' + x + '" y2="' + yb + '" stroke="' + ink + '" stroke-width="2"/>';
        const dot = (y) => '<circle cx="' + x + '" cy="' + y + '" r="5.5" fill="' + ink + '"/>';
        const cross = (y) => '<path d="M' + (x - 6) + " " + (y - 6) + "l12 12m0 -12l-12 12" + '" stroke="' + ink + '" stroke-width="2.4" stroke-linecap="round"/>';
        if (g.t === "CX") h += dot(ya) + '<circle cx="' + x + '" cy="' + yb + '" r="10" fill="' + paper + '" stroke="' + ink + '" stroke-width="2"/><path d="M' + (x - 10) + " " + yb + "h20M" + x + " " + (yb - 10) + 'v20" stroke="' + ink + '" stroke-width="2"/>';
        else if (g.t === "CZ") h += dot(ya) + dot(yb);
        else h += cross(ya) + cross(yb);
      }
      h += "</g>";
    });
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = h;
  }

  // ---------- game flow ----------
  function play(tok) {
    if (solved || screen !== "play") return false;
    let g, after;
    try { g = parse(tok); after = run(cloneWorld(world), tok); } catch (e) { return false; }
    if (!lv.gates.includes(g.t)) return false;
    if (!reachable(lv, world, hist, tok)) {
      SFX.nope(); armed = null; pick = -1; paintArmed();
      $("prompt").textContent = tr("q" + (lv.far + 1) + " is far away. Only a qubit that has been measured can act on it.", "q" + (lv.far + 1) + " ở rất xa. Chỉ qubit đã được đo mới tác động được lên nó.");
      return false;
    }
    if (after.length > MAX_OUTCOMES) {
      SFX.nope(); armed = null; pick = -1; paintArmed();
      $("prompt").textContent = tr("That would be too many outcomes to follow. Undo a measurement first.", "Như vậy sẽ có quá nhiều kết quả đo để theo dõi. Hãy hoàn tác một phép đo trước.");
      return false;
    }
    const before = worldKey(world), hadRead = hist.includes(tok);
    hist.push(tok);
    (SFX[g.t] || SFX.pick)();
    pick = -1;
    if (refresh(true)) win();
    else if (worldKey(world) === before) $("prompt").textContent = g.t === "M" ? (hadRead ? tr("That qubit was already measured.", "Qubit đó đã được đo rồi.") : tr("That qubit was already certain. Measuring it changed nothing.", "Qubit đó vốn đã chắc chắn. Đo nó không làm thay đổi gì.")) : tr("That gate left this state as it was.", "Cổng đó không làm thay đổi trạng thái này.");
    return true;
  }
  // the words on the solved panel
  function paintWin() {
    const n = hist.length, stars = lastStars, last = cur === LEVELS.length - 1 || cur === ADV - 1;
    let txt = tr("Solved in " + n + (n === 1 ? " gate. " : " gates. "), "Giải xong với " + n + " cổng. ");
    txt += stars === 3 ? tr("That is the best possible.", "Đó là ít nhất có thể.") : tr("The best possible is " + lv.par + ".", "Ít nhất có thể là " + lv.par + ".");
    if (last && solvedIn(lv.adv ? ADV : 0, lv.adv ? LEVELS.length : ADV) === (lv.adv ? LEVELS.length - ADV : ADV)) txt += lv.adv ? tr(" You have solved every advanced level.", " Bạn đã giải hết các màn nâng cao.") : tr(" You have solved every level of the basics.", " Bạn đã giải hết các màn cơ bản.");
    $("win-text").textContent = txt;
    $("win-note").textContent = lvAfter(lv);
    $("win-note").hidden = !lv.after;
    $("btn-next").textContent = last ? tr("Levels", "Các màn") : tr("Next level", "Màn tiếp");
  }
  function win() {
    solved = true; armed = null; pick = -1;
    const n = hist.length, stars = n <= lv.par ? 3 : n <= lv.par + 2 ? 2 : 1;
    lastStars = stars;
    if (stars > (save.stars[cur] | 0)) save.stars[cur] = stars;
    if (!save.best[cur] || n < save.best[cur]) save.best[cur] = n;
    tally(); persist(); paintArmed();
    SFX.win(stars);
    paintWin();
    $("win-stars").innerHTML = [1, 2, 3].map((k) => starSvg(k <= stars)).join("");
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
    if (!armed) { SFX.nope(); $("prompt").textContent = tr("Drag a gate from the row below onto this qubit.", "Hãy kéo một cổng ở hàng bên dưới thả vào qubit này."); return; }
    if (armed === "CX" || armed === "CZ" || armed === "SW") {
      if (pick < 0) { pick = q; SFX.pick(); paintArmed(); return; }
      if (pick === q) { pick = -1; SFX.pick(); paintArmed(); return; }
      const a = pick, b = q;
      play(armed === "CX" ? "CX" + a + b : armed + Math.min(a, b) + Math.max(a, b));
      return;
    }
    play(armed + q);
  }
  // a gate dropped on a qubit. One-qubit gates act there. For a two-qubit gate that qubit is the
  // control (or the first of the pair): with two qubits the other one is the partner, with three
  // the partner is tapped next.
  function dropGate(t, q) {
    if (solved || !lv.gates.includes(t) || q < 0 || q >= lv.n) return;
    const two = t === "CX" || t === "CZ" || t === "SW";
    armed = null; pick = -1;
    if (!two) { play(t + q); return; }
    if (lv.n === 2) { const o = 1 - q; play(t === "CX" ? "CX" + q + o : t + Math.min(q, o) + Math.max(q, o)); return; }
    armed = t; pick = q;
    SFX.pick(); paintArmed();
  }
  let drag = null, lastPointer = 0;
  // which qubit wire is under this point, or -1
  function wireAt(x, y) {
    const box = $("circuit").getBoundingClientRect();
    if (x < box.left - 24 || x > box.right + 24) return -1;
    let found = -1;
    for (const w of $("circuit").querySelectorAll(".wire")) {
      const r = w.getBoundingClientRect();
      if (y >= r.top - 5 && y <= r.bottom + 5) found = +w.dataset.q;
    }
    return found;
  }
  function moveDrag(e) {
    // on a touch screen the gate rides above the finger, so the finger does not hide where it will land
    const x = e.clientX, y = e.clientY - (drag.touch ? 44 : 0);
    drag.ghost.style.transform = "translate(" + (x - 26) + "px," + (y - 26) + "px)";
    const q = wireAt(x, y);
    if (q !== drag.over) {
      drag.over = q;
      for (const w of $("circuit").querySelectorAll(".wire")) w.classList.toggle("is-drop", +w.dataset.q === q);
    }
  }
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null; lastPointer = Date.now();
    try { $("gates").releasePointerCapture(e.pointerId); } catch (err) {}
    d.btn.classList.remove("is-lifted");
    $("circuit").classList.remove("is-dragging");
    for (const w of $("circuit").querySelectorAll(".wire")) w.classList.remove("is-drop");
    if (!d.ghost) { if (!cancelled) tapGate(d.t); return; }       // a plain tap still picks the gate up, as before
    d.ghost.remove();
    if (cancelled) return;
    if (d.over >= 0) dropGate(d.t, d.over); else { SFX.nope(); $("prompt").textContent = tr("Drop the gate on a qubit.", "Hãy thả cổng vào một qubit."); }
  }
  $("gates").addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".gate");
    if (!btn || e.button > 0 || solved || screen !== "play") return;
    audio();
    drag = { id: e.pointerId, t: btn.dataset.g, btn, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse", ghost: null, over: -1 };
    try { $("gates").setPointerCapture(e.pointerId); } catch (err) {}
  });
  $("gates").addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      const g = document.createElement("div");
      g.className = "drag-gate" + (GATE[drag.t].name.length > 2 ? " is-long" : "");
      g.textContent = GATE[drag.t].name;
      document.body.appendChild(g);
      drag.ghost = g;
      drag.btn.classList.add("is-lifted");
      $("circuit").classList.add("is-dragging");
      armed = null; pick = -1; paintArmed();
      SFX.pick();
    }
    moveDrag(e);
  });
  $("gates").addEventListener("pointerup", (e) => endDrag(e, false));
  $("gates").addEventListener("pointercancel", (e) => endDrag(e, true));

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
    const open = firstOpen(false), openAdv = firstOpen(true), nb = solvedIn(0, ADV), na = solvedIn(ADV, LEVELS.length);
    $("btn-play").textContent = nb === 0 ? tr("Play", "Chơi") : open < 0 ? tr("Play the basics again", "Chơi lại phần cơ bản") : tr("Continue at level ", "Chơi tiếp màn ") + (open + 1);
    $("btn-adv").textContent = na === 0 ? tr("Advanced", "Nâng cao") : openAdv < 0 ? tr("Advanced, again", "Nâng cao, chơi lại") : tr("Advanced, level ", "Nâng cao, màn ") + (openAdv - ADV + 1);
    $("best").textContent = !save.solved ? "" : tr(
      "Basics " + nb + " of " + ADV + ". Advanced " + na + " of " + (LEVELS.length - ADV) + ". " + save.totalStars + " of " + LEVELS.length * 3 + " stars.",
      "Cơ bản " + nb + "/" + ADV + ". Nâng cao " + na + "/" + (LEVELS.length - ADV) + ". " + save.totalStars + "/" + LEVELS.length * 3 + " sao.");
  }
  function paintLevels() {
    const open = save.last >= ADV ? firstOpen(true) : firstOpen(false);
    $("levels-sub").textContent = tr(save.totalStars + " of " + LEVELS.length * 3 + " stars. Three stars means the fewest gates possible.", save.totalStars + "/" + LEVELS.length * 3 + " sao. Ba sao nghĩa là dùng ít cổng nhất có thể.");
    let h = "";
    CHAPTERS.forEach((ch, c) => {
      const to = c + 1 < CHAPTERS.length ? CHAPTERS[c + 1].from : LEVELS.length;
      if (ch.first) h += '<p class="lv__part">' + tr("Advanced. Bell states, measurement and protocols, with the states written out.", "Nâng cao. Trạng thái Bell, phép đo và các giao thức, có viết rõ trạng thái bằng ket.") + "</p>";
      h += "<h3>" + tr(ch.title, ch.vi) + '</h3><div class="lv__grid">';
      for (let i = ch.from; i < to; i++) {
        const st = save.stars[i] | 0, ok = unlocked(i), num = i >= ADV ? i - ADV + 1 : i + 1;
        h += '<button type="button" class="lv__btn' + (st ? " is-done" : "") + (i === open ? " is-next" : "") + '" data-i="' + i + '"' + (ok ? "" : " disabled") +
          ' aria-label="' + (i >= ADV ? tr("Advanced level ", "Màn nâng cao ") : tr("Level ", "Màn ")) + num + (ok ? ", " + st + tr(st === 1 ? " star" : " stars", " sao") : tr(", locked", ", chưa mở")) + '"><span class="lv__num">' + num + '</span><span class="lv__stars">' +
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
  $("gates").addEventListener("click", (e) => { const b = e.target.closest(".gate"); if (b && Date.now() - lastPointer > 500) tapGate(b.dataset.g); });
  $("circuit").addEventListener("click", (e) => { const w = e.target.closest(".wire"); if (w) tapQubit(+w.dataset.q); });
  $("btn-undo").addEventListener("click", undo);
  $("btn-reset").addEventListener("click", reset);
  $("btn-again").addEventListener("click", reset);
  $("btn-next").addEventListener("click", () => { audio(); if (cur < LEVELS.length - 1 && cur !== ADV - 1) startLevel(cur + 1); else show("levels"); });
  $("btn-levels").addEventListener("click", () => { audio(); SFX.pick(); show("levels"); });
  $("btn-mute").addEventListener("click", () => { audio(); setMuted(!save.muted); });
  $("btn-play").addEventListener("click", () => { audio(); const o = firstOpen(false); startLevel(o < 0 ? 0 : o); });
  $("btn-adv").addEventListener("click", () => { audio(); const o = firstOpen(true); startLevel(o < 0 ? ADV : o); });
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
  if (window.matchMedia) { try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onResize); } catch (e) {} }
  document.addEventListener("visibilitychange", () => {
    if (!ac) return;
    try { if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {}); } catch (e) {}
  });

  // labels that are not text on the page, and everything painted from here, in the chosen language
  function paintLanguage() {
    $("btn-levels").setAttribute("aria-label", tr("Levels", "Các màn"));
    $("btn-mute").setAttribute("aria-label", tr("Sound on or off", "Bật hoặc tắt âm thanh"));
    $("states").setAttribute("aria-label", tr("Your state and the target state", "Trạng thái của bạn và trạng thái mục tiêu"));
    $("circuit").setAttribute("aria-label", tr("Qubits", "Các qubit"));
    if (screen === "menu") paintMenu();
    if (screen === "levels") paintLevels();
    if (!$("stage").hidden) {          // a level is open, in view or behind a panel
      paintLevelText();
      yoursShape = ""; paintTarget(); refresh(false);
      if (solved) paintWin();
    }
  }
  $("btn-mute").classList.toggle("is-off", save.muted);
  show("menu");
  paintLanguage();
  if (window.PlayLang) PlayLang.onChange(paintLanguage);

  // test handle
  window.__qubit = {
    levels: LEVELS, save, adv: ADV, ket,
    get screen() { return screen; }, get level() { return cur; }, get moves() { return hist.slice(); },
    get solved() { return solved; }, get armed() { return armed; }, get pick() { return pick; }, get lastStars() { return lastStars; },
    get world() { recompute(); return world.map((b) => ({ p: b.p, re: [...b.s.re], im: [...b.s.im], ket: ket(b.s) })); },
    get amps() { recompute(); return { re: [...world[0].s.re], im: [...world[0].s.im] }; },
    get fidelity() { recompute(); return judge(lv, world, hist).f; },
    start: startLevel, play, undo, reset, show, unlocked, dropGate,
    solve: (i, depth, nodes, opt) => solve(LEVELS[i], depth, nodes, opt),
    check: (i, seq) => { const l = LEVELS[i]; let w = build(l.n, l.start); for (const m of seq) w = run(w, m); return judge(l, w, seq).solved; },
    wipe: () => { save.stars = []; save.best = []; save.last = 0; tally(); persist(); },
  };
})();

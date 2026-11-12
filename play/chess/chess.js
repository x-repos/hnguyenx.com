/* =========================================================
   Chess: the board, the menus and the flow of a game.
   The rules and the computer's moves live in engine.js. This file draws
   the position, takes taps and drags, and asks the engine (in a worker)
   for the computer's reply. All sound is synthesised.

   Layout of this file:
     save · sound · game state · drawing · moves and game flow
     the computer · input · menus · start
   ========================================================= */
(() => {
  "use strict";
  const SAVE_KEY = "chess-v1";
  const START = ChessEngine.START;
  const $ = (id) => document.getElementById(id);
  const eng = ChessEngine();

  const LEVELS = [
    { name: "Beginner", opts: { depth: 1, noise: 120, random: 0.25 } },
    { name: "Easy", opts: { depth: 2, noise: 60, random: 0.06, book: true } },
    { name: "Medium", opts: { depth: 3, noise: 20, book: true } },
    { name: "Hard", opts: { depth: 24, time: 1200, nodes: 1500000, book: true } },
  ];
  const WORTH = [0, 1, 3, 3, 5, 9, 0];
  const PIECE = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];
  const sqOf = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);

  // ====================================================
  // SAVE
  // ====================================================
  const save = { level: 1, side: "w", game: null, wins: [0, 0, 0, 0], losses: [0, 0, 0, 0], draws: [0, 0, 0, 0], muted: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  for (const k of ["wins", "losses", "draws"]) {
    if (!Array.isArray(save[k])) save[k] = [];
    for (let i = 0; i < 4; i++) save[k][i] = Math.max(0, save[k][i] | 0);
    save[k].length = 4;
  }
  save.level = Math.max(0, Math.min(3, save.level | 0));
  if (!"wbr".includes(save.side) || save.side.length !== 1) save.side = "w";
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  // ====================================================
  // SOUND
  // ====================================================
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
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  const SFX = {
    move: () => { tone(300, 170, 0.07, "triangle", 0.3); tone(900, 500, 0.03, "sine", 0.06); },
    take: () => { tone(260, 120, 0.09, "triangle", 0.32); tone(180, 90, 0.11, "square", 0.07, 0.03); },
    check: () => tone(620, 830, 0.14, "sine", 0.16, 0.06),
    pick: () => tone(700, 700, 0.04, "sine", 0.08),
    nope: () => tone(170, 140, 0.1, "square", 0.06),
    win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, f, 0.45, "triangle", 0.18, i * 0.1)),
    lose: () => [392, 349.23, 293.66].forEach((f, i) => tone(f, f, 0.5, "triangle", 0.16, i * 0.16)),
    draw: () => [440, 440].forEach((f, i) => tone(f, f, 0.3, "sine", 0.14, i * 0.22)),
  };
  function setMuted(m) {
    save.muted = !!m; persist();
    $("btn-mute").classList.toggle("is-off", save.muted);
    if (!save.muted) tone(660, 880, 0.08, "sine", 0.15);
  }

  // ====================================================
  // GAME STATE
  //   game   { mode: "cpu" | "two", level, human: "w" | "b", moves: [uci], flipped, counted }
  //   ints, sans, caps run alongside game.moves: the move, its written form, what it captured
  // ====================================================
  let game = null, ints = [], sans = [], caps = [];
  let sel = -1, targets = new Map(), state = { over: false, kind: null, winner: null, check: false };
  let thinking = false, reqId = 0, pending = null, screen = "menu", drag = null, promo = null, overTimer = 0;

  const boardEl = $("board"), squaresEl = $("squares"), piecesEl = $("pieces");
  const sqEls = new Array(128);
  const flipped = () => !!(game && game.flipped);
  const humanTurn = () => !!game && (game.mode === "two" || eng.turn() === game.human);
  const canAct = () => screen === "play" && !!game && !state.over && !thinking && !promo && humanTurn();

  function capturedBy(m) {
    const to = (m >> 7) & 127;
    if ((m >> 17) & 1) return 1 | (eng.turn() === "w" ? 8 : 0);       // en passant takes a pawn
    return eng.at(to);
  }
  function replay(moves) {
    eng.load(START, []);
    ints = []; sans = []; caps = [];
    const good = [];
    for (const u of moves || []) {
      const m = eng.fromUci(u);
      if (!m) break;
      sans.push(eng.san(m)); caps.push(capturedBy(m)); ints.push(m); good.push(u);
      eng.make(m);
    }
    return good;
  }

  // ====================================================
  // DRAWING
  // ====================================================
  function buildSquares() {
    let h = "";
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const file = flipped() ? 7 - col : col, rank = flipped() ? row : 7 - row;
      h += '<div class="sq ' + ((file + rank) & 1 ? "l" : "d") + '" data-sq="' + (rank * 16 + file) + '">' +
        (col === 0 ? '<span class="sq__rank">' + (rank + 1) + "</span>" : "") +
        (row === 7 ? '<span class="sq__file">' + "abcdefgh"[file] + "</span>" : "") + "</div>";
    }
    squaresEl.innerHTML = h;
    for (const el of squaresEl.children) sqEls[+el.dataset.sq] = el;
  }
  const sprite = (pc, cls) => '<svg class="' + cls + " " + cls + "--" + (pc & 8 ? "b" : "w") + '" viewBox="0 0 100 100" aria-hidden="true"><use href="#pc-' + (pc & 7) + '"/></svg>';
  function pieceEl(pc) {
    const el = document.createElement("div");
    el.className = "pc pc--" + (pc & 8 ? "b" : "w");
    el.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#pc-' + (pc & 7) + '"/></svg>';
    el._pc = pc;
    return el;
  }
  function place(el, sq) {
    const file = sq & 7, rank = sq >> 4, col = flipped() ? 7 - file : file, row = flipped() ? rank : 7 - rank;
    el._sq = sq;
    el.style.transform = "translate(" + col * 100 + "%," + row * 100 + "%)";
  }
  // make the pieces on screen match the position. A piece that is missing from its square
  // is the nearest spare one of its kind sliding over, so moves, castling and undo all animate.
  function syncPieces(animate) {
    const els = [...piecesEl.children].filter((el) => !el._gone), free = new Set(els), todo = [];
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = eng.at(sq);
      if (!pc) continue;
      const hit = els.find((el) => free.has(el) && el._sq === sq && el._pc === pc);
      if (hit) { free.delete(hit); hit.classList.toggle("is-instant", !animate); place(hit, sq); }
      else todo.push([sq, pc]);
    }
    for (const [sq, pc] of todo) {
      let found = null, dist = 1e9;
      for (const el of free) {
        if (el._pc !== pc) continue;
        const d = Math.abs((el._sq & 7) - (sq & 7)) + Math.abs((el._sq >> 4) - (sq >> 4));
        if (d < dist) { dist = d; found = el; }
      }
      if (found) {
        free.delete(found);
        found.classList.toggle("is-instant", !animate);
        if (animate) { const el = found; el.classList.add("is-moving"); setTimeout(() => el.classList.remove("is-moving"), 260); }
        place(found, sq);
      } else {
        const el = pieceEl(pc);
        el.classList.add("is-instant");
        place(el, sq);
        piecesEl.appendChild(el);
      }
    }
    for (const el of free) {
      if (animate) { el._gone = true; el.classList.add("is-out"); setTimeout(() => el.remove(), 200); }
      else el.remove();
    }
  }

  function paintSquares() {
    for (const el of squaresEl.children) el.classList.remove("is-last", "is-sel", "is-target", "is-capture", "is-check", "is-hover");
    if (!game) return;
    if (game.moves.length) {
      const u = game.moves[game.moves.length - 1];
      sqEls[sqOf(u.slice(0, 2))].classList.add("is-last");
      sqEls[sqOf(u.slice(2, 4))].classList.add("is-last");
    }
    if (sel >= 0) sqEls[sel].classList.add("is-sel");
    for (const [to, list] of targets) {
      sqEls[to].classList.add("is-target");
      if (eng.at(to) || ((list[0] >> 17) & 1)) sqEls[to].classList.add("is-capture");
    }
    if (state.check) sqEls[eng.kingSq(eng.turn())].classList.add("is-check");
  }

  function nameOf(color) {
    if (game.mode === "two") return color === "w" ? "White" : "Black";
    return color === game.human ? "You" : "Computer";
  }
  function paintSides() {
    const bottom = flipped() ? "b" : "w", top = bottom === "w" ? "b" : "w";
    const lost = { w: [], b: [] };
    for (const c of caps) if (c) lost[c & 8 ? "b" : "w"].push(c & 7);
    let lead = 0;                                    // material on the board, white minus black
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = eng.at(sq);
      if (pc) lead += (pc & 8 ? -1 : 1) * WORTH[pc & 7];
    }
    const fill = (host, color) => {
      const other = color === "w" ? "b" : "w", mine = color === "w" ? lead : -lead;
      host.querySelector(".side__dot").className = "side__dot is-" + color;
      host.querySelector(".side__name").textContent = nameOf(color);
      host.classList.toggle("is-turn", !state.over && eng.turn() === color);
      const got = lost[other].slice().sort((a, b) => b - a);
      host.querySelector(".tray").innerHTML = got.map((t) => sprite(t | (other === "b" ? 8 : 0), "mini")).join("") +
        (mine > 0 ? '<span class="tray__adv">+' + mine + "</span>" : "");
    };
    fill($("side-top"), top); fill($("side-bot"), bottom);
  }
  function paintMoves() {
    let h = "";
    for (let i = 0; i < sans.length; i += 2) {
      h += '<li><span class="n">' + (i / 2 + 1) + '.</span><span class="m' + (i === sans.length - 1 ? " is-last" : "") + '">' + sans[i] + "</span>" +
        (i + 1 < sans.length ? '<span class="m' + (i + 1 === sans.length - 1 ? " is-last" : "") + '">' + sans[i + 1] + "</span>" : "") + "</li>";
    }
    const host = $("moves");
    host.innerHTML = h;
    host.scrollLeft = host.scrollWidth; host.scrollTop = host.scrollHeight;
  }
  function resultText() {
    const who = (c) => (game.mode === "two" ? (c === "w" ? "White wins." : "Black wins.") : c === game.human ? "You win." : "The computer wins.");
    switch (state.kind) {
      case "checkmate": return ["Checkmate", who(state.winner)];
      case "stalemate": return ["Stalemate", "The side to move has no legal move and is not in check. It is a draw."];
      case "material": return ["Draw", "Neither side has enough pieces left to give checkmate."];
      case "fifty": return ["Draw", "Fifty moves went by with no capture and no pawn move."];
      case "repetition": return ["Draw", "The same position came up three times."];
    }
    return ["", ""];
  }
  function paintStatus() {
    if (!game) return;
    let s;
    if (state.over) { const r = resultText(); s = state.kind === "checkmate" ? r[0] + ". " + r[1] : r[0]; }
    else if (thinking) s = "The computer is thinking";
    else if (game.mode === "two") s = (state.check ? "Check. " : "") + (eng.turn() === "w" ? "White to move" : "Black to move");
    else s = (state.check ? "Check. " : "") + "Your move";
    $("status").textContent = s;
    $("sub").textContent = game.mode === "two" ? "Two players, one screen" : "You are " + (game.human === "w" ? "White" : "Black") + ". Level: " + LEVELS[game.level].name;
    $("btn-undo").disabled = !game.moves.length;
  }
  function render(animate) {
    syncPieces(animate); paintSquares(); paintSides(); paintMoves(); paintStatus();
  }

  // ====================================================
  // MOVES AND GAME FLOW
  // ====================================================
  function saveGame() { save.game = game; persist(); }
  function select(sq) {
    sel = sq; targets = new Map();
    if (sq >= 0) for (const m of eng.moves()) {
      if ((m & 127) !== sq) continue;
      const to = (m >> 7) & 127;
      if (!targets.has(to)) targets.set(to, []);
      targets.get(to).push(m);
    }
    paintSquares();
  }
  function tryMove(to, instant) {
    const list = targets.get(to);
    if (!list) return false;
    if (list.length > 1) askPromo(list, instant); else commit(list[0], instant);
    return true;
  }
  function commit(m, instant) {
    const cap = capturedBy(m), s = eng.san(m);
    eng.make(m);
    game.moves.push(eng.uci(m)); ints.push(m); sans.push(s); caps.push(cap);
    sel = -1; targets = new Map();
    state = eng.status();
    (cap ? SFX.take : SFX.move)();
    if (state.check && !state.over) SFX.check();
    render(!instant);
    if (state.over) finish();
    else if (game.mode === "cpu" && eng.turn() !== game.human) computerMove();
    saveGame();
  }
  function finish() {
    thinking = false; reqId++;
    const mine = game.mode === "cpu";
    if (mine && !game.counted) {
      const k = state.winner === null ? "draws" : state.winner === game.human ? "wins" : "losses";
      save[k][game.level]++;
      game.counted = true;
    }
    if (state.winner === null) SFX.draw(); else if (!mine || state.winner === game.human) SFX.win(); else SFX.lose();
    paintStatus();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (screen !== "play" || !state.over) return;
      const r = resultText();
      $("over-title").textContent = r[0]; $("over-text").textContent = r[1];
      $("over").hidden = false;
    }, 700);
  }
  function undo() {
    if (screen !== "play" || !game || !game.moves.length) return;
    reqId++; thinking = false; closePromo(); clearTimeout(overTimer); $("over").hidden = true;
    // against the computer, go back to your own last move, so the reply is taken back too
    let n = 1;
    if (game.mode === "cpu" && eng.turn() === game.human && game.moves.length >= 2) n = 2;
    while (n-- > 0) { eng.unmake(ints.pop()); game.moves.pop(); sans.pop(); caps.pop(); }
    sel = -1; targets = new Map();
    state = eng.status();
    SFX.pick();
    render(true); saveGame();
    if (game.mode === "cpu" && eng.turn() !== game.human) computerMove();
  }
  function startGame(mode, level, human) {
    reqId++; thinking = false; closePromo(); clearTimeout(overTimer);
    game = { mode, level: level | 0, human: human === "b" ? "b" : "w", moves: [], flipped: mode === "cpu" && human === "b", counted: false };
    replay([]);
    sel = -1; targets = new Map(); state = eng.status();
    buildSquares(); piecesEl.innerHTML = "";
    show("play"); render(false); saveGame();
    if (mode === "cpu" && eng.turn() !== game.human) computerMove();
  }
  function resume() {
    if (!game) return;
    show("play"); buildSquares(); render(false);
    if (!state.over && game.mode === "cpu" && eng.turn() !== game.human && !thinking) computerMove();
  }
  function flip() {
    if (!game) return;
    game.flipped = !game.flipped;
    buildSquares(); render(false); saveGame();
  }

  // ---------- promotion ----------
  function askPromo(list, instant) {
    promo = { list, instant };
    const black = eng.turn() === "b";
    $("promo-row").innerHTML = [5, 4, 3, 2].map((t) => '<button type="button" data-t="' + t + '" aria-label="' + PIECE[t] + '">' + sprite(t | (black ? 8 : 0), "mini") + "</button>").join("");
    $("promo").hidden = false;
  }
  function closePromo() {
    if (!promo) return;
    promo = null; $("promo").hidden = true;
  }

  // ====================================================
  // THE COMPUTER: asked in a worker so the page stays smooth. If a worker
  // cannot start (for example when the page is opened as a file), think here.
  // ====================================================
  let worker = null, workerOk = true, thinker = null;
  function getWorker() {
    if (worker || !workerOk) return worker;
    try {
      worker = new Worker("engine.js?v=1");
      worker.onmessage = (e) => { if (pending && e.data && e.data.id === pending.id) pending.done(e.data.move); };
      worker.onerror = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        workerOk = false; worker = null;
        if (pending && pending.id === reqId && thinking) thinkHere(pending);
      };
    } catch (e) { workerOk = false; worker = null; }
    return worker;
  }
  function thinkHere(job) {
    setTimeout(() => {
      if (job.id !== reqId) return;
      thinker = thinker || ChessEngine();
      thinker.load(START, game.moves);
      job.done(thinker.uci(thinker.think(job.opts)));
    }, 60);
  }
  function computerMove() {
    thinking = true;
    const id = ++reqId, t0 = Date.now(), opts = LEVELS[game.level].opts;
    paintStatus();
    const done = (uci) => {
      // never answer instantly: leave time to see your own move land
      setTimeout(() => {
        if (id !== reqId || !thinking) return;
        thinking = false; pending = null;
        const m = eng.fromUci(uci);
        if (m) commit(m, false); else paintStatus();
      }, Math.max(0, 550 - (Date.now() - t0)));
    };
    pending = { id, opts, done };
    const w = getWorker();
    if (w) w.postMessage({ id, fen: START, moves: game.moves.slice(), opts }); else thinkHere(pending);
  }

  // ====================================================
  // INPUT: tap a piece then a square, or drag the piece there
  // ====================================================
  function squareAt(x, y) {
    const r = boardEl.getBoundingClientRect();
    const col = Math.floor((x - r.left) / r.width * 8), row = Math.floor((y - r.top) / r.height * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    return (flipped() ? row : 7 - row) * 16 + (flipped() ? 7 - col : col);
  }
  function dragTo(x, y) {
    const r = boardEl.getBoundingClientRect(), cell = r.width / 8;
    drag.el.style.transform = "translate(" + (x - r.left - cell / 2) + "px," + (y - r.top - cell * 0.62) + "px) scale(1.18)";
    const over = squareAt(x, y);
    if (over !== drag.over) {
      if (drag.over >= 0) sqEls[drag.over].classList.remove("is-hover");
      drag.over = over;
      if (over >= 0 && targets.has(over)) sqEls[over].classList.add("is-hover");
    }
  }
  boardEl.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || e.target.closest(".promo")) return;
    audio();
    if (!canAct()) return;
    e.preventDefault();
    const sq = squareAt(e.clientX, e.clientY);
    if (sq < 0) return;
    if (sel >= 0 && sq !== sel && tryMove(sq, false)) return;
    const pc = eng.at(sq), mine = pc && (pc & 8 ? "b" : "w") === eng.turn();
    if (!mine) { if (sel >= 0) select(-1); return; }
    const was = sel === sq;
    select(sq); SFX.pick();
    const el = [...piecesEl.children].find((p) => !p._gone && p._sq === sq);
    if (!el) return;
    drag = { id: e.pointerId, sq, el, x: e.clientX, y: e.clientY, moved: false, over: -1, was };
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) {}
  });
  boardEl.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
      drag.moved = true; drag.el.classList.add("is-drag");
    }
    dragTo(e.clientX, e.clientY);
  });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    try { boardEl.releasePointerCapture(e.pointerId); } catch (err) {}
    if (d.over >= 0) sqEls[d.over].classList.remove("is-hover");
    if (!d.moved) { if (d.was) select(-1); return; }         // a plain tap: second tap on the same piece lets go of it
    d.el.classList.remove("is-drag");
    const to = cancelled ? -1 : squareAt(e.clientX, e.clientY);
    if (to >= 0 && to !== d.sq && targets.has(to)) {
      d.el.classList.add("is-instant"); place(d.el, d.sq);
      tryMove(to, true);
      if (promo) { d.el.classList.add("is-instant"); place(d.el, to); }   // rest on the last rank while choosing
    } else {
      if (to >= 0 && to !== d.sq) SFX.nope();
      d.el.classList.remove("is-instant"); place(d.el, d.sq);
    }
  }
  boardEl.addEventListener("pointerup", (e) => endDrag(e, false));
  boardEl.addEventListener("pointercancel", (e) => endDrag(e, true));
  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  $("promo-row").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !promo) return;
    const t = +btn.dataset.t, p = promo, m = p.list.find((x) => ((x >> 14) & 7) === t);
    closePromo();
    if (m) commit(m, p.instant);
  });
  $("promo-cancel").addEventListener("click", () => { closePromo(); select(-1); syncPieces(true); });

  $("btn-undo").addEventListener("click", () => { audio(); undo(); });
  $("btn-flip").addEventListener("click", () => { audio(); SFX.pick(); flip(); });
  $("btn-new").addEventListener("click", () => { audio(); SFX.pick(); show("menu"); });
  $("btn-menu").addEventListener("click", () => { audio(); SFX.pick(); show("menu"); });
  $("btn-mute").addEventListener("click", () => { audio(); setMuted(!save.muted); });
  $("btn-over-new").addEventListener("click", () => { audio(); show("menu"); });
  $("btn-over-see").addEventListener("click", () => { $("over").hidden = true; });

  // ====================================================
  // MENUS
  // ====================================================
  function show(name) {
    screen = name;
    $("menu").hidden = name !== "menu";
    $("over").hidden = true;
    document.body.classList.toggle("in-menu", name === "menu");
    if (name === "menu") { closePromo(); select(-1); paintMenu(); }
  }
  function paintMenu() {
    for (const b of $("seg-level").children) b.classList.toggle("is-on", +b.dataset.v === save.level);
    for (const b of $("seg-side").children) b.classList.toggle("is-on", b.dataset.v === save.side);
    const live = !!game && game.moves.length > 0 && !state.over;
    $("continue-wrap").hidden = !live;
    $("btn-start").classList.toggle("is-plain", live);
    const won = save.wins.reduce((a, b) => a + b, 0);
    let top = -1;
    save.wins.forEach((n, i) => { if (n) top = i; });
    $("best").textContent = won ? "Games won against the computer: " + won + ". Hardest level beaten: " + LEVELS[top].name + "." : "";
  }
  $("seg-level").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    audio(); SFX.pick(); save.level = +b.dataset.v; persist(); paintMenu();
  });
  $("seg-side").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    audio(); SFX.pick(); save.side = b.dataset.v; persist(); paintMenu();
  });
  $("btn-start").addEventListener("click", () => {
    audio();
    startGame("cpu", save.level, save.side === "r" ? (Math.random() < 0.5 ? "w" : "b") : save.side);
  });
  $("btn-two").addEventListener("click", () => { audio(); startGame("two", save.level, "w"); });
  $("btn-continue").addEventListener("click", () => { audio(); SFX.pick(); resume(); });

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "m") { audio(); setMuted(!save.muted); return; }
    if (screen === "menu") {
      if (k === "enter" && document.activeElement === document.body) ($("continue-wrap").hidden ? $("btn-start") : $("btn-continue")).click();
      return;
    }
    if (k === "escape") { if (promo) $("promo-cancel").click(); else if (!$("over").hidden) $("over").hidden = true; else show("menu"); return; }
    if (k === "u" || k === "backspace") { e.preventDefault(); undo(); return; }
    if (k === "f") flip();
  });
  // no pinch or double tap zoom during play
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());
  document.addEventListener("visibilitychange", () => {
    if (!ac) return;
    try { if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {}); } catch (e) {}
  });

  // ====================================================
  // START: pick up the saved game if there is one
  // ====================================================
  $("btn-mute").classList.toggle("is-off", save.muted);
  const g = save.game;
  if (g && (g.mode === "cpu" || g.mode === "two") && Array.isArray(g.moves)) {
    game = { mode: g.mode, level: Math.max(0, Math.min(3, g.level | 0)), human: g.human === "b" ? "b" : "w", moves: [], flipped: !!g.flipped, counted: !!g.counted };
    game.moves = replay(g.moves);
    state = eng.status();
  } else { replay([]); save.game = null; }
  buildSquares(); syncPieces(false); if (game) { paintSquares(); paintSides(); paintMoves(); paintStatus(); }
  show("menu");

  // test handle
  window.__chess = {
    eng, save, levels: LEVELS,
    get game() { return game; }, get screen() { return screen; }, get thinking() { return thinking; },
    get state() { return state; }, get sans() { return sans.slice(); }, get selected() { return sel; },
    get targets() { return [...targets.keys()]; }, get promo() { return !!promo; }, get workerOk() { return workerOk; },
    start: startGame, undo, flip, show, resume,
    move: (u) => { const m = eng.fromUci(u); if (!m || !game || state.over) return false; commit(m, false); return true; },
    squareAt,
  };
})();

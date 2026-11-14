/* =========================================================
   Chinese chess (cờ tướng): the board, the menus and the flow of a game.
   The rules and the computer's moves live in engine.js. This file draws
   the position, takes taps and drags, asks the engine (in a worker) for
   the computer's reply, and can join two browsers for an online game.
   Every text is in English and Vietnamese (see ../lang.js). All sound is
   synthesised.

   Layout of this file:
     save · sound · game state · drawing · moves and game flow
     the computer · online play · input · menus · start
   ========================================================= */
(() => {
  "use strict";
  const SAVE_KEY = "cotuong-v1";
  const X = XiangqiEngine;
  const $ = (id) => document.getElementById(id);
  const tr = PlayLang.t;
  const eng = X();

  const LEVELS = [
    { en: "Easy", vi: "Dễ", opts: { depth: 1, noise: 130, random: 0.2 } },
    { en: "Medium", vi: "Vừa", opts: { depth: 3, noise: 25, book: true } },
    { en: "Hard", vi: "Khó", opts: { depth: 24, time: 1300, nodes: 1500000, book: true } },
  ];
  // pieces: 1 general, 2 advisor, 3 elephant, 4 horse, 5 chariot, 6 cannon, 7 soldier
  const HAN = { r: ["", "帥", "仕", "相", "傌", "俥", "炮", "兵"], b: ["", "將", "士", "象", "馬", "車", "砲", "卒"] };
  const ABC = { en: ["", "K", "A", "E", "H", "R", "C", "P"], vi: ["", "Tg", "S", "T", "M", "X", "P", "B"] };
  const colorOf = (pc) => (pc & 8 ? "b" : "r");
  const other = (c) => (c === "r" ? "b" : "r");
  // where online games meet (see chess-worker/). A local preview can point at a test relay with ?relay=ws://...
  const RELAY = (() => {
    const q = new URLSearchParams(location.search).get("relay");
    return q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? q : "wss://hnguyenx-chess.hnguyenx.workers.dev/ws?g=cotuong";
  })();

  // ====================================================
  // SAVE
  // ====================================================
  const save = { level: 1, side: "r", style: "han", game: null, wins: [0, 0, 0], losses: [0, 0, 0], draws: [0, 0, 0], muted: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  for (const k of ["wins", "losses", "draws"]) {
    if (!Array.isArray(save[k])) save[k] = [];
    for (let i = 0; i < 3; i++) save[k][i] = Math.max(0, save[k][i] | 0);
    save[k].length = 3;
  }
  save.level = Math.max(0, Math.min(2, save.level | 0));
  if (!["r", "b", "x"].includes(save.side)) save.side = "r";
  if (save.style !== "abc") save.style = "han";
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
    move: () => { tone(330, 180, 0.07, "triangle", 0.3); tone(950, 520, 0.03, "sine", 0.06); },
    take: () => { tone(280, 120, 0.09, "triangle", 0.32); tone(180, 90, 0.11, "square", 0.07, 0.03); },
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
  //   game   { mode: "cpu" | "two" | "online", level, human: "r" | "b", moves: ["h2e2", ...], flipped, counted }
  //          an online game also has room (its name on the relay) and ended (set if someone resigned or left)
  //   ints, notes, caps run alongside game.moves: the move, what is needed to write it down, what it captured
  // ====================================================
  let game = null, ints = [], notes = [], caps = [];
  let sel = -1, targets = new Map(), state = { over: false, kind: null, winner: null, check: false };
  let thinking = false, reqId = 0, pending = null, screen = "menu", drag = null, overTimer = 0, resignArmed = false, copied = 0;
  // online play: the connection, and what it is for: null, "find" (waiting to be paired) or "game"
  const net = { ws: null, want: null, peer: true, tries: 0, timer: 0, ping: 0, pong: 0, failed: false };

  const boardEl = $("board"), piecesEl = $("pieces"), marksEl = $("marks");
  const flipped = () => !!(game && game.flipped);
  const humanTurn = () => !!game && (game.mode === "two" || eng.turn() === game.human);
  const canAct = () => screen === "play" && !!game && !state.over && !thinking && humanTurn();

  // what is needed to write a move down later, in either language. Call it before the move is made.
  function describe(m) {
    const from = m & 255, to = m >> 8, pc = eng.at(from), red = !(pc & 8);
    const f0 = X.file(from), r0 = X.rank(from);
    let tandem = "";
    // a twin on the same file: say whether this is the front or the back one. Advisors and
    // elephants do not need it: for them the direction of the move already tells the two apart.
    if ((pc & 7) > 3) for (let r = 0; r < 10; r++) {
      if (r !== r0 && eng.at(X.sq(f0, r)) === pc) tandem = (red ? r0 > r : r0 < r) ? "f" : "b";
    }
    return { type: pc & 7, red, f0, r0, f1: X.file(to), r1: X.rank(to), tandem };
  }
  // the usual way of writing moves: piece, its file counted from the player's right, then
  // forward, back or sideways. English C2=5 H8+7, Vietnamese P2-5 M8.7. For one of two twins on
  // a file the file number gives way to front or back: English C+=5 C-=5, Vietnamese Pt-5 Ps-5
  function notate(n) {
    const vi = PlayLang.get() === "vi", num = (f) => (n.red ? 9 - f : f + 1);
    const where = n.tandem ? (n.tandem === "f" ? (vi ? "t" : "+") : (vi ? "s" : "-")) : num(n.f0);
    const fwd = n.red ? n.r1 - n.r0 : n.r0 - n.r1, head = ABC[vi ? "vi" : "en"][n.type] + where;
    if (fwd === 0) return head + (vi ? "-" : "=") + num(n.f1);
    return head + (fwd > 0 ? (vi ? "." : "+") : (vi ? "/" : "-")) + (n.f0 === n.f1 ? Math.abs(fwd) : num(n.f1));
  }
  function replay(moves) {
    eng.load([]);
    ints = []; notes = []; caps = [];
    const good = [];
    for (const u of moves || []) {
      const m = eng.fromUci(u);
      if (!m) break;
      notes.push(describe(m)); caps.push(eng.at(m >> 8)); ints.push(m); good.push(u);
      eng.make(m);
    }
    return good;
  }

  // ====================================================
  // DRAWING
  // ====================================================
  // the lines of the board, in a 90 by 100 box: one unit of 10 between crossings, 5 of margin
  (function buildGrid() {
    let d = "";
    for (let r = 0; r < 10; r++) d += "M5 " + (5 + r * 10) + "H85";
    for (let f = 0; f < 9; f++) { const x = 5 + f * 10; d += f === 0 || f === 8 ? "M" + x + " 5V95" : "M" + x + " 5V45M" + x + " 55V95"; }
    d += "M35 5L55 25M55 5L35 25M35 75L55 95M55 75L35 95";            // the two palaces
    // small corner marks where the cannons and the soldiers start
    const spots = [[1, 2], [7, 2], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3]];
    for (const [f, r0] of spots) for (const r of [r0, 9 - r0]) {
      const x = 5 + f * 10, y = 5 + (9 - r) * 10;
      for (const dx of [-1, 1]) {
        if (f + dx < 0 || f + dx > 8) continue;
        for (const dy of [-1, 1]) d += "M" + (x + dx * 1.1) + " " + (y + dy * 3) + "V" + (y + dy * 1.1) + "H" + (x + dx * 3);
      }
    }
    $("grid").innerHTML = '<rect class="frame" x="3.4" y="3.4" width="83.2" height="93.2" rx="0.5"/><path d="' + d + '"/><text x="21.8" y="52.05">楚</text><text x="30.2" y="52.05">河</text><text x="59.8" y="52.05">漢</text><text x="68.2" y="52.05">界</text>';   // baseline 0.38 of the size below the middle of the river
  })();

  const letter = (pc) => ABC[PlayLang.get() === "vi" ? "vi" : "en"][pc & 7];
  // What is written on a piece, in both styles; the stylesheet shows one. The text is SVG so its baseline can
  // be set exactly: a Chinese character fills a square that reaches 0.88 of its size above the baseline and
  // 0.12 below, so the middle of the character is 0.38 above the baseline. A capital letter in Crimson Pro is
  // 0.587 tall, so its middle is 0.29 above.
  const face = (pc) => '<svg class="face"><text class="pc__han" x="50%" y="50%" dy="0.38em">' + HAN[colorOf(pc)][pc & 7] +
    '</text><text class="pc__abc" x="50%" y="50%" dy="0.29em">' + letter(pc) + "</text></svg>";
  function pieceEl(pc) {
    const el = document.createElement("div");
    el.className = "pc pc--" + colorOf(pc);
    el.innerHTML = '<span class="pc__disc">' + face(pc) + "</span>";
    el._pc = pc;
    return el;
  }
  function spot(sq) {
    const f = X.file(sq), r = X.rank(sq);
    return "translate(" + (flipped() ? 8 - f : f) * 100 + "%," + (flipped() ? r : 9 - r) * 100 + "%)";
  }
  function place(el, sq) { el._sq = sq; el.style.transform = spot(sq); }
  // make the pieces on screen match the position. A piece that is missing from its point
  // is the nearest spare one of its kind sliding over, so moves and undo animate.
  function syncPieces(animate) {
    const els = [...piecesEl.children].filter((el) => !el._gone), free = new Set(els), todo = [];
    for (const sq of X.SQUARES) {
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
        const d = Math.abs(X.file(el._sq) - X.file(sq)) + Math.abs(X.rank(el._sq) - X.rank(sq));
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
  function paintMarks() {
    const m = new Map();                     // point -> classes
    const add = (sq, cls) => m.set(sq, (m.get(sq) || "") + " " + cls);
    if (game && ints.length) { const last = ints[ints.length - 1]; add(last & 255, "is-from"); add(last >> 8, "is-last"); }
    if (sel >= 0) add(sel, "is-sel");
    for (const [to] of targets) add(to, eng.at(to) ? "is-capture" : "is-target");
    if (game && state.check) add(eng.kingSq(eng.turn()), "is-check");
    if (drag && drag.over >= 0 && targets.has(drag.over)) add(drag.over, "is-hover");
    let h = "";
    for (const [sq, cls] of m) h += '<i class="mark' + cls + '" style="transform:' + spot(sq) + '"></i>';
    marksEl.innerHTML = h;
  }

  function nameOf(c) {
    if (game.mode === "two") return c === "r" ? tr("Red", "Đỏ") : tr("Black", "Đen");
    return c === game.human ? tr("You", "Bạn") : game.mode === "online" ? tr("Friend", "Đối thủ") : tr("Computer", "Máy");
  }
  const mini = (pc) => '<span class="mini mini--' + colorOf(pc) + '">' + face(pc) + "</span>";
  function paintSides() {
    const bottom = flipped() ? "b" : "r", top = other(bottom);
    const taken = { r: [], b: [] };                  // pieces each colour has lost
    for (const c of caps) if (c) taken[colorOf(c)].push(c);
    const fill = (host, c) => {
      host.querySelector(".side__dot").className = "side__dot is-" + c;
      const turn = !state.over && eng.turn() === c;
      host.classList.toggle("is-turn", turn);
      // in Vietnamese the words come before the name: "Đến lượt Đỏ"
      const tag = '<span class="side__turn">' + tr("to move", "Đến lượt") + "</span>";
      host.querySelector(".side__name").innerHTML = !turn ? nameOf(c) : PlayLang.get() === "vi" ? tag + " " + nameOf(c) : nameOf(c) + " " + tag;
      host.querySelector(".tray").innerHTML = taken[other(c)].slice().sort((a, b) => (a & 7) - (b & 7)).map(mini).join("");
    };
    fill($("side-top"), top); fill($("side-bot"), bottom);
  }
  function paintMoves() {
    const host = $("moves");
    if (!notes.length) { host.innerHTML = '<li class="moves__none">' + tr("The moves will be listed here.", "Các nước đi sẽ hiện ở đây.") + "</li>"; return; }
    const cell = (i) => '<span class="m m--' + (i % 2 ? "b" : "r") + (i === notes.length - 1 ? " is-last" : "") + '">' + notate(notes[i]) + "</span>";
    let h = "";
    for (let i = 0; i < notes.length; i += 2) h += '<li><span class="n">' + (i / 2 + 1) + ".</span>" + cell(i) + (i + 1 < notes.length ? cell(i + 1) : "") + "</li>";
    host.innerHTML = h;
    host.scrollLeft = host.scrollWidth; host.scrollTop = host.scrollHeight;
  }
  function resultText() {
    const who = (c) => (game.mode === "two" ? (c === "r" ? tr("Red wins.", "Đỏ thắng.") : tr("Black wins.", "Đen thắng."))
      : c === game.human ? tr("You win.", "Bạn thắng.") : game.mode === "online" ? tr("Your friend wins.", "Đối thủ thắng.") : tr("The computer wins.", "Máy thắng."));
    switch (state.kind) {
      case "checkmate": return [tr("Checkmate", "Chiếu bí"), who(state.winner)];
      case "stuck": return [tr("No moves left", "Hết nước đi"), who(state.winner)];
      case "material": return [tr("Draw", "Hòa"), tr("Neither side has a piece left that can attack.", "Hai bên không còn quân nào tấn công được.")];
      case "quiet": return [tr("Draw", "Hòa"), tr("Sixty moves each went by with no capture.", "Mỗi bên đã đi 60 nước mà không ăn quân nào.")];
      case "repetition": return [tr("Draw", "Hòa"), tr("The same position came up three times.", "Cùng một thế cờ đã lặp lại ba lần.")];
      case "resign": return [tr("Resigned", "Xin thua"), state.winner === game.human ? tr("Your friend resigned. You win.", "Đối thủ xin thua. Bạn thắng.") : tr("You resigned. Your friend wins.", "Bạn xin thua. Đối thủ thắng.")];
      case "left": return [tr("Game over", "Ván cờ kết thúc"), tr("Your friend left the game.", "Đối thủ đã rời ván.")];
    }
    return ["", ""];
  }
  function paintStatus() {
    const online = !!game && game.mode === "online";
    // online there is no taking back; the same button gives up the game instead, on a second press
    $("btn-undo").textContent = online ? (resignArmed ? tr("Sure?", "Chắc chứ?") : tr("Resign", "Xin thua")) : tr("Undo", "Đi lại");
    $("btn-undo").disabled = online ? state.over : !(game && game.moves.length);
    if (!game) return;
    const check = state.check ? tr("Check. ", "Chiếu. ") : "";
    let s;
    if (state.over) { const r = resultText(); s = state.kind === "checkmate" || state.kind === "stuck" ? r[0] + ". " + r[1] : r[0]; }
    else if (online && !netOpen()) s = tr("Connection lost. Reconnecting", "Mất kết nối. Đang kết nối lại");
    else if (online && !net.peer) s = tr("Your friend is offline. Waiting", "Đối thủ đang ngoại tuyến. Đang chờ");
    else if (online) s = check + (eng.turn() === game.human ? tr("Your move", "Lượt của bạn") : tr("Your friend's move", "Lượt của đối thủ"));
    else if (thinking) s = tr("The computer is thinking", "Máy đang nghĩ");
    else if (game.mode === "two") s = check + (eng.turn() === "r" ? tr("Red to move", "Đỏ đi") : tr("Black to move", "Đen đi"));
    else s = check + tr("Your move", "Lượt của bạn");
    $("status").textContent = s;
    const mine = game.human === "r" ? tr("You are Red", "Bạn cầm quân Đỏ") : tr("You are Black", "Bạn cầm quân Đen");
    $("sub").textContent = game.mode === "two" ? tr("Two players, one screen", "Hai người, một màn hình")
      : mine + (online ? tr(". Online game", ". Ván qua mạng") : tr(". Level: ", ". Cấp độ: ") + tr(LEVELS[game.level].en, LEVELS[game.level].vi));
  }
  function paintOver() {
    if ($("over").hidden) return;
    const r = resultText();
    $("over-title").textContent = r[0]; $("over-text").textContent = r[1];
  }
  function render(animate) {
    syncPieces(animate); paintMarks(); paintSides(); paintMoves(); paintStatus();
  }

  // ====================================================
  // MOVES AND GAME FLOW
  // ====================================================
  function saveGame() { save.game = game; persist(); }
  function select(sq) {
    sel = sq; targets = new Map();
    if (sq >= 0) for (const m of eng.moves()) if ((m & 255) === sq) targets.set(m >> 8, m);
    paintMarks();
  }
  function commit(m, instant, remote) {
    const cap = eng.at(m >> 8), note = describe(m), u = eng.uci(m);
    eng.make(m);
    game.moves.push(u); ints.push(m); notes.push(note); caps.push(cap);
    sel = -1; targets = new Map();
    state = eng.status();
    if (game.mode === "online" && !remote) netSend({ t: "move", n: game.moves.length - 1, uci: u });
    (cap ? SFX.take : SFX.move)();
    if (state.check && !state.over) SFX.check();
    render(!instant);
    if (state.over) finish();
    else if (game.mode === "cpu" && eng.turn() !== game.human) computerMove();
    saveGame();
  }
  function finish() {
    thinking = false; reqId++;
    if (game.mode === "cpu" && !game.counted) {
      const k = state.winner === null ? "draws" : state.winner === game.human ? "wins" : "losses";
      save[k][game.level]++;
      game.counted = true;
    }
    if (state.winner === null) SFX.draw(); else if (game.mode === "two" || state.winner === game.human) SFX.win(); else SFX.lose();
    paintStatus();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (screen !== "play" || !state.over) return;
      $("over").hidden = false;
      paintOver();
    }, 800);
  }
  function undo() {
    if (screen === "play" && game && game.mode === "online") { resign(); return; }
    if (screen !== "play" || !game || !game.moves.length) return;
    reqId++; thinking = false; clearTimeout(overTimer); $("over").hidden = true;
    // against the computer, go back to your own last move, so the reply is taken back too
    let n = 1;
    if (game.mode === "cpu" && eng.turn() === game.human && game.moves.length >= 2) n = 2;
    while (n-- > 0) { eng.unmake(ints.pop()); game.moves.pop(); notes.pop(); caps.pop(); }
    sel = -1; targets = new Map();
    state = eng.status();
    SFX.pick();
    render(true); saveGame();
    if (game.mode === "cpu" && eng.turn() !== game.human) computerMove();
  }
  function startGame(mode, level, human) {
    abandonOnline();
    reqId++; thinking = false; clearTimeout(overTimer);
    game = { mode, level: level | 0, human: human === "b" ? "b" : "r", moves: [], flipped: mode === "cpu" && human === "b", counted: false };
    replay([]);
    sel = -1; targets = new Map(); state = eng.status();
    piecesEl.innerHTML = "";
    show("play"); render(false); saveGame();
    if (mode === "cpu" && eng.turn() !== game.human) computerMove();
  }
  function resume() {
    if (!game) return;
    show("play"); render(false);
    if (game.mode === "online" && net.want !== "game") { net.want = "game"; net.tries = 0; netConnect(); }
    if (!state.over && game.mode === "cpu" && eng.turn() !== game.human && !thinking) computerMove();
  }
  function flip() {
    if (!game) return;
    game.flipped = !game.flipped;
    render(false); saveGame();
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
      thinker = thinker || X();
      thinker.load(game.moves);
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
    if (w) w.postMessage({ id, moves: game.moves.slice(), opts }); else thinkHere(pending);
  }

  // ====================================================
  // ONLINE PLAY: two browsers joined through a small relay (see chess-worker/).
  // The relay pairs two players and passes their messages on. Each side keeps
  // the whole game itself and checks every move it is sent, so after a dropped
  // connection the two only have to compare move lists to be back in step.
  // On the relay the first player is "w" and the second "b": here that is Red and Black.
  // ====================================================
  const netOpen = () => !!net.ws && net.ws.readyState === 1;
  function netSend(obj) { if (netOpen()) { try { net.ws.send(JSON.stringify(obj)); } catch (e) {} } }
  function netHangUp() {
    clearTimeout(net.timer); clearInterval(net.ping);
    const ws = net.ws;
    net.ws = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch (e) {} }
  }
  function netConnect() {
    netHangUp();
    if (!net.want) return;
    let ws;
    try { ws = new WebSocket(RELAY); } catch (e) { netDown(); return; }
    net.ws = ws;
    ws.onopen = () => {
      if (net.ws !== ws) return;
      net.tries = 0; net.pong = Date.now();
      netSend(net.want === "find" ? { t: "find" } : { t: "rejoin", room: game.room, color: game.human === "r" ? "w" : "b" });
      // a heartbeat: keeps the line open and notices when it has died without saying so
      net.ping = setInterval(() => {
        if (net.ws !== ws) return;
        if (Date.now() - net.pong > 50000) { netHangUp(); netDown(); return; }
        try { ws.send("ping"); } catch (e) {}
      }, 20000);
      paintOnline(); paintStatus();
    };
    ws.onmessage = (e) => {
      if (net.ws !== ws) return;
      if (e.data === "pong") { net.pong = Date.now(); return; }
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m && typeof m.t === "string") onNet(m);
    };
    ws.onclose = () => { if (net.ws !== ws) return; net.ws = null; clearInterval(net.ping); netDown(); };
    ws.onerror = () => {};
  }
  // the line dropped: try again, a little slower each time. A game keeps trying; the waiting room gives up.
  function netDown() {
    if (!net.want) return;
    net.tries++;
    if (net.want === "find" && net.tries > 4) { net.want = null; net.failed = true; paintOnline(); return; }
    net.timer = setTimeout(netConnect, Math.min(8000, 500 * Math.pow(1.7, net.tries)));
    paintOnline(); paintStatus();
  }
  // walk away from a live online game, or from the waiting room
  function abandonOnline() {
    if (net.want === "find" || (net.want === "game" && game && game.mode === "online" && !state.over)) netSend({ t: "leave" });
    net.want = null;
    netHangUp();
  }
  function findOnline() {
    // looking for a new game gives up any online game still going
    if (game && game.mode === "online") { game = null; save.game = null; persist(); }
    net.want = "find"; net.tries = 0; net.failed = false;
    show("online"); paintOnline();
    if (netOpen()) netSend({ t: "find" }); else netConnect();
  }
  // the link to send: opening it goes straight to looking for a game, so the two of you are paired
  function inviteLink() {
    const q = new URLSearchParams(location.search), keep = new URLSearchParams();
    keep.set("play", "online");
    if (q.get("relay")) keep.set("relay", q.get("relay"));           // only present in local tests
    return location.origin + location.pathname + "?" + keep.toString();
  }
  function paintOnline() {
    if (screen !== "online") return;
    const text = $("online-text");
    if (net.failed) text.textContent = tr("Could not reach the game server. Check your connection and try again.", "Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.");
    else if (copied < 0) text.textContent = tr("Copy this link and send it to your friend: ", "Hãy sao chép liên kết này và gửi cho bạn bè: ") + inviteLink();
    else text.textContent = netOpen() ? tr("Waiting for another player. Copy the link and send it to your friend. The game starts when they open it.",
      "Đang chờ người chơi khác. Hãy sao chép liên kết và gửi cho bạn bè. Ván cờ bắt đầu khi họ mở liên kết.") : tr("Connecting", "Đang kết nối");
    $("btn-online-retry").hidden = !net.failed;
    $("btn-online-copy").hidden = net.failed;
    $("btn-online-copy").textContent = copied > 0 ? tr("Link copied", "Đã sao chép") : tr("Copy link", "Sao chép liên kết");
  }
  function copyInvite() {
    const link = inviteLink();
    const done = (ok) => {
      copied = ok ? 1 : -1;                      // -1: could not copy, so the link is shown to copy by hand
      paintOnline();
      if (ok) setTimeout(() => { copied = 0; paintOnline(); }, 2200);
    };
    const oldWay = () => {       // for pages that are not allowed to use the clipboard directly
      const ta = document.createElement("textarea");
      ta.value = link; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-999px;top:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      done(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => done(true), oldWay);
    else oldWay();
  }
  function startOnline(room, color) {
    reqId++; thinking = false; clearTimeout(overTimer);
    const human = color === "w" ? "r" : "b";
    game = { mode: "online", level: 0, human, moves: [], flipped: human === "b", counted: true, room, ended: null };
    replay([]);
    sel = -1; targets = new Map(); state = eng.status();
    net.want = "game"; net.peer = true; resignArmed = false;
    piecesEl.innerHTML = "";
    show("play"); render(false); saveGame();
    SFX.check();
  }
  // the game stopped for a reason that is not on the board: someone resigned or left
  function endOnline(kind, winner) {
    game.ended = { kind, winner };
    state = { over: true, kind, winner, check: false };
    sel = -1; targets = new Map();
    render(false); finish(); saveGame();
  }
  function resign() {
    if (state.over) return;
    if (!resignArmed) {
      resignArmed = true; paintStatus();
      setTimeout(() => { resignArmed = false; paintStatus(); }, 3000);
      return;
    }
    resignArmed = false;
    netSend({ t: "resign" });
    endOnline("resign", other(game.human));
  }
  // bring the two copies of the game back in step: whoever is behind plays the moves it is missing
  function onSync(theirs) {
    if (!Array.isArray(theirs) || game.ended) return;
    const mine = game.moves, n = Math.min(mine.length, theirs.length);
    for (let i = 0; i < n; i++) if (mine[i] !== theirs[i]) return;
    if (theirs.length < mine.length) { netSend({ t: "sync", moves: mine }); return; }
    for (let i = mine.length; i < theirs.length && !state.over; i++) {
      const mv = eng.fromUci(String(theirs[i]));
      if (!mv) return;
      commit(mv, i < theirs.length - 1, true);
    }
  }
  function onNet(m) {
    if (m.t === "waiting") { paintOnline(); return; }
    if (m.t === "start") {
      if (net.want === "find" && typeof m.room === "string" && (m.color === "w" || m.color === "b")) startOnline(m.room, m.color);
      return;
    }
    if (!game || game.mode !== "online" || net.want !== "game") return;
    switch (m.t) {
      case "rejoined":
      case "peer":
        net.peer = m.t === "peer" ? !!m.on : !!m.peer;
        if (net.peer) netSend({ t: "sync", moves: game.moves });
        paintStatus();
        break;
      case "move": {
        if (state.over) break;
        const mv = m.n === game.moves.length && eng.turn() !== game.human ? eng.fromUci(String(m.uci)) : 0;
        if (mv) { select(-1); commit(mv, false, true); }
        else if (game.moves[m.n] !== m.uci) netSend({ t: "sync", moves: game.moves });      // out of step: compare notes
        break;
      }
      case "sync": onSync(m.moves); break;
      case "resign": if (!state.over) endOnline("resign", game.human); break;
      case "left": if (!state.over) endOnline("left", null); break;
    }
  }
  document.addEventListener("visibilitychange", () => {
    // coming back to the tab: do not wait for the next retry
    if (!document.hidden && net.want && !netOpen()) { net.tries = 0; netConnect(); }
    if (!ac) return;
    try { if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {}); } catch (e) {}
  });

  // ====================================================
  // INPUT: tap a piece then a point, or drag the piece there
  // ====================================================
  function pointAt(x, y) {
    const r = boardEl.getBoundingClientRect();
    const col = Math.floor((x - r.left) / r.width * 9), row = Math.floor((y - r.top) / r.height * 10);
    if (col < 0 || col > 8 || row < 0 || row > 9) return -1;
    return X.sq(flipped() ? 8 - col : col, flipped() ? row : 9 - row);
  }
  function dragTo(x, y) {
    const r = boardEl.getBoundingClientRect(), cw = r.width / 9, ch = r.height / 10;
    drag.el.style.transform = "translate(" + (x - r.left - cw / 2) + "px," + (y - r.top - ch * (drag.touch ? 0.95 : 0.5)) + "px) scale(1.16)";
    const over = pointAt(x, y - (drag.touch ? ch * 0.45 : 0));
    if (over !== drag.over) { drag.over = over; paintMarks(); }
  }
  boardEl.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    audio();
    if (!canAct()) return;
    e.preventDefault();
    const sq = pointAt(e.clientX, e.clientY);
    if (sq < 0) return;
    if (sel >= 0 && sq !== sel && targets.has(sq)) { commit(targets.get(sq), false); return; }
    const pc = eng.at(sq), mine = pc && colorOf(pc) === eng.turn();
    if (!mine) { if (sel >= 0) select(-1); return; }
    const was = sel === sq;
    select(sq); SFX.pick();
    const el = [...piecesEl.children].find((p) => !p._gone && p._sq === sq);
    if (!el) return;
    drag = { id: e.pointerId, sq, el, x: e.clientX, y: e.clientY, moved: false, over: -1, was, touch: e.pointerType !== "mouse" };
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
    const d = drag;
    drag = null;
    try { boardEl.releasePointerCapture(e.pointerId); } catch (err) {}
    if (!d.moved) { if (d.was) select(-1); return; }         // a plain tap: second tap on the same piece lets go of it
    d.el.classList.remove("is-drag");
    const to = cancelled ? -1 : d.over;
    if (to >= 0 && to !== d.sq && targets.has(to)) {
      d.el.classList.add("is-instant"); place(d.el, d.sq);
      commit(targets.get(to), true);
    } else {
      if (to >= 0 && to !== d.sq) SFX.nope();
      d.el.classList.remove("is-instant"); place(d.el, d.sq);
      paintMarks();
    }
  }
  boardEl.addEventListener("pointerup", (e) => endDrag(e, false));
  boardEl.addEventListener("pointercancel", (e) => endDrag(e, true));
  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  $("btn-undo").addEventListener("click", () => { audio(); undo(); });
  $("btn-flip").addEventListener("click", () => { audio(); SFX.pick(); flip(); });
  $("btn-new").addEventListener("click", () => { audio(); SFX.pick(); show("menu"); });
  $("btn-menu").addEventListener("click", () => { audio(); SFX.pick(); show("menu"); });
  $("btn-mute").addEventListener("click", () => { audio(); setMuted(!save.muted); });
  $("btn-over-new").addEventListener("click", () => { audio(); show("menu"); });
  $("btn-over-see").addEventListener("click", () => { $("over").hidden = true; });
  $("btn-online").addEventListener("click", () => { audio(); SFX.pick(); findOnline(); });
  $("btn-online-retry").addEventListener("click", () => { audio(); findOnline(); });
  $("btn-online-copy").addEventListener("click", () => { audio(); SFX.pick(); copyInvite(); });
  $("btn-online-cancel").addEventListener("click", () => { audio(); abandonOnline(); show("menu"); });

  // ====================================================
  // MENUS
  // ====================================================
  function show(name) {
    screen = name;
    $("menu").hidden = name !== "menu";
    $("online").hidden = name !== "online";
    $("over").hidden = true;
    document.body.classList.toggle("in-menu", name !== "play");
    if (name === "menu") { select(-1); paintMenu(); }
    if (name === "online") { copied = 0; }
  }
  function setStyle(s) {
    save.style = s === "abc" ? "abc" : "han"; persist();
    document.body.classList.toggle("style-abc", save.style === "abc");
  }
  function paintMenu() {
    for (const b of $("seg-level").children) b.classList.toggle("is-on", +b.dataset.v === save.level);
    for (const b of $("seg-side").children) b.classList.toggle("is-on", b.dataset.v === save.side);
    for (const b of $("seg-style").children) b.classList.toggle("is-on", b.dataset.v === save.style);
    const live = !!game && game.moves.length > 0 && !state.over;
    $("continue-wrap").hidden = !live;
    $("btn-start").classList.toggle("is-plain", live);
    const won = save.wins.reduce((a, b) => a + b, 0);
    let top = -1;
    save.wins.forEach((n, i) => { if (n) top = i; });
    $("best").textContent = won ? tr("Games won against the computer: ", "Số ván thắng máy: ") + won + tr(". Hardest level beaten: ", ". Cấp độ cao nhất đã thắng: ") + tr(LEVELS[top].en, LEVELS[top].vi) + "." : "";
  }
  const seg = (id, fn) => $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    audio(); SFX.pick(); fn(b.dataset.v); persist(); paintMenu();
  });
  seg("seg-level", (v) => { save.level = +v; });
  seg("seg-side", (v) => { save.side = v; });
  seg("seg-style", (v) => { setStyle(v); if (game) paintSides(); });
  $("btn-start").addEventListener("click", () => {
    audio();
    startGame("cpu", save.level, save.side === "x" ? (Math.random() < 0.5 ? "r" : "b") : save.side);
  });
  $("btn-two").addEventListener("click", () => { audio(); startGame("two", save.level, "r"); });
  $("btn-continue").addEventListener("click", () => { audio(); SFX.pick(); resume(); });

  // labels that are not text on the page, in the chosen language
  function paintLabels() {
    $("btn-menu").setAttribute("aria-label", tr("Menu", "Menu"));
    $("btn-mute").setAttribute("aria-label", tr("Sound on or off", "Bật hoặc tắt âm thanh"));
    $("board").setAttribute("aria-label", tr("Chinese Chess board", "Bàn cờ tướng"));
    $("moves").setAttribute("aria-label", tr("Moves", "Các nước đi"));
  }
  paintLabels();
  // the language changed: rewrite every text that was set from here. The move list also holds
  // the line shown before any game.
  PlayLang.onChange(() => {
    for (const el of piecesEl.children) el.querySelector(".pc__abc").textContent = letter(el._pc);
    paintLabels(); paintMoves();
    if (game) { paintSides(); paintOver(); }
    paintStatus(); paintMenu(); paintOnline();
  });

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "m") { audio(); setMuted(!save.muted); return; }
    if (screen === "menu") {
      if (k === "enter" && document.activeElement === document.body) ($("continue-wrap").hidden ? $("btn-start") : $("btn-continue")).click();
      return;
    }
    if (screen === "online") { if (k === "escape") $("btn-online-cancel").click(); return; }
    if (k === "escape") { if (!$("over").hidden) $("over").hidden = true; else show("menu"); return; }
    if ((k === "u" || k === "backspace") && game && game.mode !== "online") { e.preventDefault(); undo(); return; }
    if (k === "f") flip();
  });
  // no pinch or double tap zoom during play
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());

  // ====================================================
  // START: pick up the saved game if there is one
  // ====================================================
  $("btn-mute").classList.toggle("is-off", save.muted);
  setStyle(save.style);
  const g = save.game;
  const usable = g && Array.isArray(g.moves) && (g.mode === "cpu" || g.mode === "two" || (g.mode === "online" && typeof g.room === "string" && g.room));
  if (usable) {
    game = { mode: g.mode, level: Math.max(0, Math.min(2, g.level | 0)), human: g.human === "b" ? "b" : "r", moves: [], flipped: !!g.flipped, counted: !!g.counted };
    game.moves = replay(g.moves);
    state = eng.status();
    if (g.mode === "online") {
      game.room = g.room;
      game.ended = g.ended && typeof g.ended === "object" ? { kind: g.ended.kind === "left" ? "left" : "resign", winner: g.ended.winner === "r" || g.ended.winner === "b" ? g.ended.winner : null } : null;
      if (game.ended) state = { over: true, kind: game.ended.kind, winner: game.ended.winner, check: false };
    }
    render(false);
  } else { replay([]); save.game = null; syncPieces(false); paintMoves(); paintStatus(); }
  show("menu");
  // opened from a friend's link: go straight to looking for a game. The mark is taken out of
  // the address so that reloading the page later does not start another search.
  if (new URLSearchParams(location.search).get("play") === "online") {
    const q = new URLSearchParams(location.search);
    q.delete("play");
    try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q.toString() : "") + location.hash); } catch (e) {}
    findOnline();
  }

  // test handle
  window.__cotuong = {
    eng, save, levels: LEVELS, X,
    get game() { return game; }, get screen() { return screen; }, get thinking() { return thinking; },
    get state() { return state; }, get selected() { return sel; }, get targets() { return [...targets.keys()]; },
    get workerOk() { return workerOk; }, get notes() { return notes.map(notate); },
    get online() { return { want: net.want, open: netOpen(), peer: net.peer, relay: RELAY }; },
    start: startGame, undo, flip, show, resume, findOnline, resign, inviteLink, copyInvite, pointAt, setStyle,
    move: (u) => { const m = eng.fromUci(u); if (!m || !game || state.over) return false; commit(m, false); return true; },
    netDrop: () => { if (net.ws) net.ws.close(); },
  };
})();

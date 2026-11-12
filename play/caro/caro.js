/* =========================================================
   Caro: the board, the menus and the flow of a game of five in a row.
   The rules and the computer's moves live in engine.js. This file draws
   the board, takes taps, asks the engine (in a worker) for the computer's
   reply, and can join two browsers for an online game. All sound is synthesised.

   Layout of this file:
     save · sound · game state · drawing · moves and game flow
     the computer · online play · input · menus · start
   ========================================================= */
(() => {
  "use strict";
  const SAVE_KEY = "caro-v1";
  const N = CaroEngine.N, CELLS = N * N;
  const $ = (id) => document.getElementById(id);
  const eng = CaroEngine();

  const LEVELS = [
    { name: "Easy", opts: { depth: 1, wide: 8, noise: 500, blind: 0.25 } },
    { name: "Medium", opts: { depth: 2, wide: 10, noise: 40 } },
    { name: "Hard", opts: { depth: 8, wide: 11, time: 900, nodes: 1200000 } },
  ];
  const MARK = ["", "X", "O"];
  // where online games meet (see chess-worker/). A local preview can point at a test relay with ?relay=ws://...
  const RELAY = (() => {
    const q = new URLSearchParams(location.search).get("relay");
    return q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? q : "wss://hnguyenx-chess.hnguyenx.workers.dev/ws?g=caro";
  })();

  // ====================================================
  // SAVE
  // ====================================================
  const save = { level: 1, side: "x", game: null, wins: [0, 0, 0], losses: [0, 0, 0], draws: [0, 0, 0], muted: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  for (const k of ["wins", "losses", "draws"]) {
    if (!Array.isArray(save[k])) save[k] = [];
    for (let i = 0; i < 3; i++) save[k][i] = Math.max(0, save[k][i] | 0);
    save[k].length = 3;
  }
  save.level = Math.max(0, Math.min(2, save.level | 0));
  if (!["x", "o", "r"].includes(save.side)) save.side = "x";
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
    x: () => tone(360, 220, 0.07, "triangle", 0.3),
    o: () => tone(300, 180, 0.08, "sine", 0.32),
    pick: () => tone(700, 700, 0.04, "sine", 0.08),
    start: () => tone(620, 830, 0.14, "sine", 0.16),
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
  //   game   { mode: "cpu" | "two" | "online", level, human: 1 (X) | 2 (O), moves: [cell], counted }
  //          an online game also has room (its name on the relay) and ended (set if someone resigned or left)
  //   state  { over, winner: 0 | 1 | 2, line: [cells of the five], kind: "five" | "full" | "resign" | "left" }
  // ====================================================
  let game = null, state = { over: false, winner: 0, line: [], kind: null };
  let ghost = -1, thinking = false, reqId = 0, pending = null, screen = "menu", overTimer = 0, resignArmed = false, down = null;
  // online play: the connection, and what it is for: null, "find" (waiting to be paired) or "game"
  const net = { ws: null, want: null, peer: true, tries: 0, timer: 0, ping: 0, pong: 0 };

  const boardEl = $("board"), cellsEl = $("cells");
  const cellEls = [], shown = new Int8Array(CELLS);
  const humanTurn = () => !!game && (game.mode === "two" || eng.turn() === game.human);
  const canAct = () => screen === "play" && !!game && !state.over && !thinking && humanTurn();

  function readState() {
    const s = eng.status();
    return { over: s.over, winner: s.winner, line: s.line, kind: s.over ? (s.winner ? "five" : "full") : null };
  }

  // ====================================================
  // DRAWING
  // ====================================================
  for (let c = 0; c < CELLS; c++) {
    const el = document.createElement("div");
    el.className = "cell";
    cellsEl.appendChild(el);
    cellEls.push(el);
  }
  const markHtml = (p, extra) => '<i class="mk mk--' + (p === 1 ? "x" : "o") + (extra ? " " + extra : "") + '"></i>';
  function paintBoard(animate) {
    const last = game && game.moves.length ? game.moves[game.moves.length - 1] : -1;
    for (let c = 0; c < CELLS; c++) {
      const p = eng.at(c), el = cellEls[c], wantGhost = c === ghost && !p;
      if (shown[c] !== p || el._ghost !== wantGhost) {
        el.innerHTML = p ? markHtml(p, animate && shown[c] !== p && c === last ? "is-new" : "") : wantGhost ? markHtml(eng.turn(), "is-ghost") : "";
        el.classList.toggle("has", !!p);
        shown[c] = p; el._ghost = wantGhost;
      }
      el.classList.toggle("is-last", c === last && !state.line.length);
      el.classList.toggle("is-win", state.line.includes(c));
    }
    const mine = canAct() ? eng.turn() : 0;
    boardEl.classList.toggle("can-x", mine === 1);
    boardEl.classList.toggle("can-o", mine === 2);
  }
  function nameOf(p) {
    if (game.mode === "two") return "Player " + MARK[p];
    return p === game.human ? "You" : game.mode === "online" ? "Friend" : "Computer";
  }
  function paintSides() {
    // the player whose screen this is sits at the bottom; with two players on one screen, X does
    const bottom = game.mode === "two" ? 1 : game.human, top = 3 - bottom;
    const fill = (host, p) => {
      host.querySelector(".side__mark").innerHTML = markHtml(p);
      host.querySelector(".side__name").textContent = nameOf(p);
      host.classList.toggle("is-turn", !state.over && eng.turn() === p);
    };
    fill($("side-top"), top); fill($("side-bot"), bottom);
  }
  function resultText() {
    const who = (p) => (game.mode === "two" ? MARK[p] + " wins." : p === game.human ? "You win." : game.mode === "online" ? "Your friend wins." : "The computer wins.");
    switch (state.kind) {
      case "five": return ["Five in a row", who(state.winner)];
      case "full": return ["Draw", "The board is full."];
      case "resign": return ["Resigned", state.winner === game.human ? "Your friend resigned. You win." : "You resigned. Your friend wins."];
      case "left": return ["Game over", "Your friend left the game."];
    }
    return ["", ""];
  }
  function paintStatus() {
    if (!game) return;
    const online = game.mode === "online";
    let s;
    if (state.over) { const r = resultText(); s = state.kind === "five" ? r[0] + ". " + r[1] : r[0]; }
    else if (online && !netOpen()) s = "Connection lost. Reconnecting";
    else if (online && !net.peer) s = "Your friend is offline. Waiting";
    else if (online) s = eng.turn() === game.human ? "Your move" : "Your friend's move";
    else if (thinking) s = "The computer is thinking";
    else if (game.mode === "two") s = MARK[eng.turn()] + " to move";
    else s = "Your move";
    $("status").textContent = s;
    $("sub").textContent = game.mode === "two" ? "Two players, one screen" : "You are " + MARK[game.human] + (online ? ". Online game" : ". Level: " + LEVELS[game.level].name);
    // online there is no taking back; the same button gives up the game instead, on a second press
    $("btn-undo").textContent = online ? (resignArmed ? "Sure?" : "Resign") : "Undo";
    $("btn-undo").disabled = online ? state.over : !game.moves.length;
    $("hint").textContent = state.over ? "" : ghost >= 0 ? "Tap the same square again to place your " + MARK[eng.turn()] + "."
      : game.moves.length ? "Move " + (game.moves.length + 1) + ". Five in a row wins." : "Five in a row wins. X goes first.";
  }
  function render(animate) { paintBoard(animate); paintSides(); paintStatus(); }

  // ====================================================
  // MOVES AND GAME FLOW
  // ====================================================
  function saveGame() { save.game = game; persist(); }
  function commit(c, remote) {
    const p = eng.turn();
    if (!eng.place(c)) return false;
    game.moves.push(c);
    ghost = -1;
    state = readState();
    (p === 1 ? SFX.x : SFX.o)();
    if (game.mode === "online" && !remote) netSend({ t: "move", n: game.moves.length - 1, at: c });
    render(true);
    if (state.over) finish();
    else if (game.mode === "cpu" && eng.turn() !== game.human) computerMove();
    saveGame();
    return true;
  }
  function finish() {
    thinking = false; reqId++;
    if (game.mode === "cpu" && !game.counted) {
      const k = !state.winner ? "draws" : state.winner === game.human ? "wins" : "losses";
      save[k][game.level]++;
      game.counted = true;
    }
    if (!state.winner) SFX.draw(); else if (game.mode === "two" || state.winner === game.human) SFX.win(); else SFX.lose();
    paintStatus();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (screen !== "play" || !state.over) return;
      const r = resultText();
      $("over-title").textContent = r[0]; $("over-text").textContent = r[1];
      $("over").hidden = false;
    }, 900);
  }
  function undo() {
    if (screen === "play" && game && game.mode === "online") { resign(); return; }
    if (screen !== "play" || !game || !game.moves.length) return;
    reqId++; thinking = false; clearTimeout(overTimer); $("over").hidden = true;
    // against the computer, go back to your own last move, so the reply is taken back too
    let n = 1;
    if (game.mode === "cpu" && eng.turn() === game.human && game.moves.length >= 2) n = 2;
    while (n-- > 0) { eng.undo(); game.moves.pop(); }
    ghost = -1; state = readState();
    SFX.pick();
    render(false); saveGame();
    if (game.mode === "cpu" && eng.turn() !== game.human) computerMove();
  }
  function startGame(mode, level, human) {
    abandonOnline();
    reqId++; thinking = false; clearTimeout(overTimer);
    game = { mode, level: level | 0, human: human === 2 ? 2 : 1, moves: [], counted: false };
    eng.reset(); ghost = -1; state = readState();
    show("play"); render(false); saveGame();
    if (mode === "cpu" && eng.turn() !== game.human) computerMove();
  }
  function resume() {
    if (!game) return;
    show("play"); render(false);
    if (game.mode === "online" && net.want !== "game") { net.want = "game"; net.tries = 0; netConnect(); }
    if (!state.over && game.mode === "cpu" && eng.turn() !== game.human && !thinking) computerMove();
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
      thinker = thinker || CaroEngine();
      thinker.load(game.moves);
      job.done(thinker.think(job.opts));
    }, 60);
  }
  function computerMove() {
    thinking = true;
    const id = ++reqId, t0 = Date.now(), opts = LEVELS[game.level].opts;
    render(false);
    const done = (c) => {
      // never answer instantly: leave time to see your own mark land
      setTimeout(() => {
        if (id !== reqId || !thinking) return;
        thinking = false; pending = null;
        if (!commit(c, false)) render(false);
      }, Math.max(0, 480 - (Date.now() - t0)));
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
  // On the relay the first player is "w" and the second "b": here that is X and O.
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
      netSend(net.want === "find" ? { t: "find" } : { t: "rejoin", room: game.room, color: game.human === 1 ? "w" : "b" });
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
    if (net.want === "find" && net.tries > 4) { net.want = null; paintOnline(true); return; }
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
    net.want = "find"; net.tries = 0;
    show("online"); paintOnline();
    if (netOpen()) netSend({ t: "find" }); else netConnect();
  }
  function paintOnline(failed) {
    if (screen !== "online") return;
    $("online-text").textContent = failed ? "Could not reach the game server. Check your connection and try again."
      : netOpen() ? "Waiting for another player. Copy the link and send it to your friend. The game starts when they open it." : "Connecting";
    $("btn-online-retry").hidden = !failed;
    $("btn-online-copy").hidden = !!failed;
  }
  // the link to send: opening it goes straight to looking for a game, so the two of you are paired
  function inviteLink() {
    const q = new URLSearchParams(location.search), keep = new URLSearchParams();
    keep.set("play", "online");
    if (q.get("relay")) keep.set("relay", q.get("relay"));           // only present in local tests
    return location.origin + location.pathname + "?" + keep.toString();
  }
  function copyInvite() {
    const link = inviteLink(), btn = $("btn-online-copy");
    const done = (ok) => {
      if (!ok) { $("online-text").textContent = "Copy this link and send it to your friend: " + link; return; }
      btn.textContent = "Link copied";
      setTimeout(() => { btn.textContent = "Copy link"; }, 2200);
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
    game = { mode: "online", level: 0, human: color === "w" ? 1 : 2, moves: [], counted: true, room, ended: null };
    eng.reset(); ghost = -1; state = readState();
    net.want = "game"; net.peer = true; resignArmed = false;
    show("play"); render(false); saveGame();
    SFX.start();
  }
  // the game stopped for a reason that is not on the board: someone resigned or left
  function endOnline(kind, winner) {
    game.ended = { kind, winner };
    state = { over: true, winner, line: [], kind };
    ghost = -1;
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
    endOnline("resign", 3 - game.human);
  }
  // bring the two copies of the game back in step: whoever is behind plays the moves it is missing
  function onSync(theirs) {
    if (!Array.isArray(theirs) || game.ended) return;
    const mine = game.moves, n = Math.min(mine.length, theirs.length);
    for (let i = 0; i < n; i++) if (mine[i] !== theirs[i]) return;
    if (theirs.length < mine.length) { netSend({ t: "sync", moves: mine }); return; }
    for (let i = mine.length; i < theirs.length && !state.over; i++) if (!commit(theirs[i], true)) return;
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
      case "move":
        if (state.over) break;
        if (m.n === game.moves.length && eng.turn() !== game.human && commit(m.at, true)) break;
        if (game.moves[m.n] !== m.at) netSend({ t: "sync", moves: game.moves });      // out of step: compare notes
        break;
      case "sync": onSync(m.moves); break;
      case "resign": if (!state.over) endOnline("resign", game.human); break;
      case "left": if (!state.over) endOnline("left", 0); break;
    }
  }
  document.addEventListener("visibilitychange", () => {
    // coming back to the tab: do not wait for the next retry
    if (!document.hidden && net.want && !netOpen()) { net.tries = 0; netConnect(); }
    if (!ac) return;
    try { if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {}); } catch (e) {}
  });

  // ====================================================
  // INPUT: with a mouse, one click places a mark. With a finger the squares are
  // small, so the first tap shows the mark faintly and a second tap confirms it.
  // ====================================================
  function cellAt(x, y) {
    const r = boardEl.getBoundingClientRect();
    const col = Math.floor((x - r.left) / r.width * N), row = Math.floor((y - r.top) / r.height * N);
    return col < 0 || col >= N || row < 0 || row >= N ? -1 : row * N + col;
  }
  function tapCell(c, byMouse) {
    if (!canAct() || c < 0) return;
    if (eng.at(c)) { if (ghost >= 0) { ghost = -1; render(false); } return; }
    if (byMouse || ghost === c) { commit(c, false); return; }
    ghost = c; SFX.pick(); render(false);
  }
  boardEl.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    audio();
    e.preventDefault();
    down = { id: e.pointerId, c: cellAt(e.clientX, e.clientY) };
  });
  boardEl.addEventListener("pointerup", (e) => {
    if (!down || down.id !== e.pointerId) return;
    const c = cellAt(e.clientX, e.clientY), same = c === down.c;
    down = null;
    if (same) tapCell(c, e.pointerType === "mouse");       // a press that slid to another square is ignored
  });
  boardEl.addEventListener("pointercancel", () => { down = null; });
  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  $("btn-undo").addEventListener("click", () => { audio(); undo(); });
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
    if (name === "menu") { ghost = -1; paintMenu(); }
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
    startGame("cpu", save.level, save.side === "r" ? (Math.random() < 0.5 ? 1 : 2) : save.side === "o" ? 2 : 1);
  });
  $("btn-two").addEventListener("click", () => { audio(); startGame("two", save.level, 1); });
  $("btn-continue").addEventListener("click", () => { audio(); SFX.pick(); resume(); });

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
    if ((k === "u" || k === "backspace") && game && game.mode !== "online") { e.preventDefault(); undo(); }
  });
  // no pinch or double tap zoom during play
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());

  // ====================================================
  // START: pick up the saved game if there is one
  // ====================================================
  $("btn-mute").classList.toggle("is-off", save.muted);
  const g = save.game;
  const usable = g && Array.isArray(g.moves) && (g.mode === "cpu" || g.mode === "two" || (g.mode === "online" && typeof g.room === "string" && g.room)) && eng.load(g.moves);
  if (usable) {
    game = { mode: g.mode, level: Math.max(0, Math.min(2, g.level | 0)), human: g.human === 2 ? 2 : 1, moves: g.moves.slice(), counted: !!g.counted };
    state = readState();
    if (g.mode === "online") {
      game.room = g.room;
      game.ended = g.ended && typeof g.ended === "object" ? { kind: g.ended.kind === "left" ? "left" : "resign", winner: g.ended.winner === 1 || g.ended.winner === 2 ? g.ended.winner : 0 } : null;
      if (game.ended) state = { over: true, winner: game.ended.winner, line: [], kind: game.ended.kind };
    }
    render(false);
  } else { eng.reset(); save.game = null; }
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
  window.__caro = {
    eng, save, levels: LEVELS,
    get game() { return game; }, get screen() { return screen; }, get thinking() { return thinking; },
    get state() { return state; }, get ghost() { return ghost; }, get workerOk() { return workerOk; },
    get online() { return { want: net.want, open: netOpen(), peer: net.peer, relay: RELAY }; },
    start: startGame, undo, show, resume, findOnline, resign, cellAt,
    move: (c) => (!!game && !state.over ? commit(c, false) : false),
    netDrop: () => { if (net.ws) net.ws.close(); },
    inviteLink, copyInvite,
  };
})();

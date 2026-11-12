/* =========================================================
   Caro engine: the rules of five in a row and a computer player. No drawing.
   The page uses it to keep the game. The same file also runs in a worker
   to pick the computer's moves, so the page never freezes.

   Board   15 by 15 cells, numbered 0 to 224 row by row. 0 empty, 1 X, 2 O.
           X always moves first. Five or more in a row wins.

   How the computer thinks
           Every straight run of five cells on the board is a "window".
           A window holding only one player's marks is a chance for that
           player: the more marks in it, the bigger the chance. The score
           of a position is X's chances minus O's. A search looks a few
           moves ahead for the move that leaves the best score.

   Layout of this file:
     windows · position (place, take back) · candidates · search · choosing a move · worker hookup
   ========================================================= */
(function (root) {
  "use strict";

  const N = 15, CELLS = N * N;
  const WIN = 1e7;
  // what a window is worth by how many marks one player has in it, when the other has none
  const WORTH = [0, 1, 14, 160, 2600, WIN];

  // ====================================================
  // WINDOWS: every run of five cells, and which windows pass through each cell
  // ====================================================
  const WINDOWS = [], THROUGH = Array.from({ length: CELLS }, () => []);
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const ex = x + dx * 4, ey = y + dy * 4;
      if (ex < 0 || ex >= N || ey < 0 || ey >= N) continue;
      const id = WINDOWS.length, cells = [];
      for (let k = 0; k < 5; k++) { const c = (y + dy * k) * N + x + dx * k; cells.push(c); THROUGH[c].push(id); }
      WINDOWS.push(cells);
    }
  }
  // empty cells near a mark are the only ones worth thinking about
  const NEAR = Array.from({ length: CELLS }, (_, c) => {
    const x = c % N, y = (c / N) | 0, out = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(ny * N + nx);
    }
    return out;
  });

  function createEngine() {
    // ====================================================
    // POSITION
    // ====================================================
    const b = new Int8Array(CELLS);
    const cnt = [null, new Int8Array(WINDOWS.length), new Int8Array(WINDOWS.length)];   // marks of X and of O in each window
    const fours = [0, 0, 0];             // windows where a player has four and the other none: one move from five
    const near = new Int16Array(CELLS);  // how many marks are close to each cell
    let score = 0;                       // X's chances minus O's
    let turn = 1, winner = 0;
    const hist = [];

    const worthOf = (w) => (cnt[2][w] === 0 ? WORTH[cnt[1][w]] : cnt[1][w] === 0 ? -WORTH[cnt[2][w]] : 0);

    function put(c) {
      const me = turn, through = THROUGH[c];
      b[c] = me;
      for (let i = 0; i < through.length; i++) {
        const w = through[i], mine = cnt[me], theirs = cnt[3 - me];
        score -= worthOf(w);
        if (theirs[w] === 0 && mine[w] === 4) fours[me]--;
        if (mine[w] === 0 && theirs[w] === 4) fours[3 - me]--;        // this window is now contested
        mine[w]++;
        if (theirs[w] === 0) { if (mine[w] === 4) fours[me]++; else if (mine[w] === 5) winner = me; }
        score += worthOf(w);
      }
      const nb = NEAR[c];
      for (let i = 0; i < nb.length; i++) near[nb[i]]++;
      hist.push(c);
      turn = 3 - me;
    }
    function take() {
      const c = hist.pop(), me = b[c], through = THROUGH[c];
      turn = me; winner = 0;
      for (let i = 0; i < through.length; i++) {
        const w = through[i], mine = cnt[me], theirs = cnt[3 - me];
        score -= worthOf(w);
        if (theirs[w] === 0 && mine[w] === 4) fours[me]--;
        mine[w]--;
        if (theirs[w] === 0 && mine[w] === 4) fours[me]++;
        if (mine[w] === 0 && theirs[w] === 4) fours[3 - me]++;        // no longer contested
        score += worthOf(w);
      }
      const nb = NEAR[c];
      for (let i = 0; i < nb.length; i++) near[nb[i]]--;
      b[c] = 0;
    }

    function reset() {
      b.fill(0); cnt[1].fill(0); cnt[2].fill(0); near.fill(0);
      fours[1] = fours[2] = 0; score = 0; turn = 1; winner = 0; hist.length = 0;
    }
    // set up a game from its list of moves; false if the list is not a legal game
    function load(moves) {
      reset();
      for (const c of moves || []) if (!place(c)) return false;
      return true;
    }
    function place(c) {
      if (winner || !Number.isInteger(c) || c < 0 || c >= CELLS || b[c]) return false;
      put(c);
      return true;
    }
    function undo() {
      if (!hist.length) return false;
      take();
      return true;
    }
    // the five (or more) cells in a row through the last move, if it won
    function winLine() {
      if (!winner) return [];
      const c = hist[hist.length - 1], x = c % N, y = (c / N) | 0, me = b[c];
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const line = [c];
        for (const s of [1, -1]) {
          let nx = x + dx * s, ny = y + dy * s;
          while (nx >= 0 && nx < N && ny >= 0 && ny < N && b[ny * N + nx] === me) {
            if (s > 0) line.push(ny * N + nx); else line.unshift(ny * N + nx);
            nx += dx * s; ny += dy * s;
          }
        }
        if (line.length >= 5) return line;
      }
      return [];
    }
    const status = () => ({ over: !!winner || hist.length === CELLS, winner, line: winLine() });

    // ====================================================
    // CANDIDATES: which empty cells are worth trying, best first
    // ====================================================
    // the empty cell of every window where this player is one move from five
    function finishers(player) {
      const out = [];
      if (!fours[player]) return out;
      const mine = cnt[player], theirs = cnt[3 - player];
      for (let w = 0; w < WINDOWS.length; w++) {
        if (mine[w] !== 4 || theirs[w] !== 0) continue;
        const cells = WINDOWS[w];
        for (let k = 0; k < 5; k++) if (!b[cells[k]]) { if (!out.includes(cells[k])) out.push(cells[k]); break; }
      }
      return out;
    }
    // how much a mark here would add for the player to move, plus how much it would take from the other
    function promise(c, me, defence) {
      const mine = cnt[me], theirs = cnt[3 - me], through = THROUGH[c];
      let s = 0;
      for (let i = 0; i < through.length; i++) {
        const w = through[i];
        if (theirs[w] === 0) s += WORTH[mine[w] + 1] - WORTH[mine[w]];
        if (mine[w] === 0) s += (WORTH[theirs[w] + 1] - WORTH[theirs[w]]) * defence;
      }
      return s;
    }
    function candidates(limit, defence, careless) {
      const me = turn;
      let must = finishers(me);                      // a winning move: nothing else matters
      if (must.length) return must;
      must = careless ? [] : finishers(3 - me);      // the other side threatens five: it has to be stopped
      if (must.length) return must;
      const list = [];
      for (let c = 0; c < CELLS; c++) if (!b[c] && near[c]) list.push([promise(c, me, defence), c]);
      list.sort((p, q) => q[0] - p[0]);
      if (list.length > limit) list.length = limit;
      return list.map((p) => p[1]);
    }

    // ====================================================
    // SEARCH
    // ====================================================
    let nodes = 0, nodeLimit = 0, stopAt = 0, stopped = false, wide = 10;

    function search(depth, alpha, beta, ply) {
      if ((++nodes & 511) === 0 && (nodes >= nodeLimit || Date.now() >= stopAt)) stopped = true;
      if (stopped) return 0;
      const me = turn;
      if (winner) return -WIN + ply;                 // the side that just moved made five
      if (hist.length === CELLS) return 0;
      if (fours[me]) return WIN - ply - 1;           // I make five on this move
      // out of depth: stop here, unless the other side is one move from five and has to be answered first
      if (depth <= 0 && (!fours[3 - me] || ply > 14)) return me === 1 ? score : -score;
      const list = candidates(ply < 2 ? wide : Math.max(6, wide - 3), 0.9);
      let best = -Infinity;
      for (let i = 0; i < list.length; i++) {
        put(list[i]);
        const s = -search(depth - 1, -beta, -alpha, ply + 1);
        take();
        if (stopped) return 0;
        if (s > best) { best = s; if (s > alpha) { alpha = s; if (s >= beta) break; } }
      }
      return best === -Infinity ? 0 : best;
    }

    // ====================================================
    // CHOOSING A MOVE
    //   opts.depth    how many moves ahead to look
    //   opts.time     thinking time in milliseconds
    //   opts.wide     how many candidate moves to try at each step
    //   opts.noise    blur added to each move's value, so weaker levels slip up
    //   opts.blind    chance of not noticing that the other side must be blocked
    // ====================================================
    let lastInfo = { depth: 0, score: 0, nodes: 0 };
    function think(opts) {
      opts = opts || {};
      lastInfo = { depth: 0, score: 0, nodes: 0 };
      if (winner || hist.length === CELLS) return -1;
      const mid = ((N / 2) | 0) * N + ((N / 2) | 0);
      if (!hist.length) return mid;
      if (hist.length === 1) {                        // answer the first mark from right beside it
        const first = hist[0], x = first % N, y = (first / N) | 0, spots = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((dx || dy) && nx >= 2 && nx < N - 2 && ny >= 2 && ny < N - 2) spots.push(ny * N + nx);
        }
        return spots.length ? spots[(Math.random() * spots.length) | 0] : (b[mid] ? mid + 1 : mid);
      }
      const me = turn;
      const win = finishers(me);
      if (win.length) return win[0];
      const block = finishers(3 - me);
      if (block.length && opts.blind && Math.random() < opts.blind) {
        // a weak level sometimes fails to see the threat and just builds its own line
        const own = candidates(3, 0.2, true);
        if (own.length) return own[(Math.random() * own.length) | 0];
      }
      if (block.length === 1) return block[0];

      nodes = 0; stopped = false;
      nodeLimit = opts.nodes || 3e6;
      stopAt = Date.now() + (opts.time || 5000);
      wide = opts.wide || 10;
      const maxDepth = Math.max(1, opts.depth || 2);
      const rootMoves = block.length > 1 ? block : candidates(wide + 2, opts.noise ? 0.55 : 0.9);
      if (!rootMoves.length) { for (let c = 0; c < CELLS; c++) if (!b[c]) return c; return -1; }

      if (opts.noise !== undefined) {
        // weaker levels: an honest value for every candidate to a fixed depth, then blurred
        let best = rootMoves[0], bestScore = -Infinity;
        for (const c of rootMoves) {
          put(c);
          let s = -search(maxDepth - 1, -Infinity, Infinity, 1);
          take();
          if (stopped) break;
          if (s < WIN / 2 && s > -WIN / 2) s += (Math.random() * 2 - 1) * opts.noise;
          if (s > bestScore) { bestScore = s; best = c; }
        }
        lastInfo = { depth: maxDepth, score: Math.round(bestScore), nodes };
        return best;
      }

      // strongest level: one move deeper each round until the time is up
      let best = rootMoves[0];
      for (let depth = 1; depth <= maxDepth; depth++) {
        let alpha = -Infinity, roundBest = -1, roundScore = -Infinity;
        for (let i = 0; i < rootMoves.length; i++) {
          put(rootMoves[i]);
          const s = -search(depth - 1, -Infinity, -alpha, 1);
          take();
          if (stopped) break;
          if (s > roundScore) { roundScore = s; roundBest = rootMoves[i]; if (s > alpha) alpha = s; }
        }
        if (stopped) break;                           // a round cut short is not trusted: keep the last full one
        best = roundBest;
        rootMoves.splice(rootMoves.indexOf(best), 1); rootMoves.unshift(best);
        lastInfo = { depth, score: roundScore, nodes };
        if (roundScore > WIN / 2 || roundScore < -WIN / 2) break;
      }
      return best;
    }

    return {
      N, CELLS, load, place, undo, status, think, reset,
      at: (c) => b[c],
      turn: () => turn,
      moves: () => hist.slice(),
      get info() { return lastInfo; },
      get debug() { return { score, fours: fours.slice(), near: Array.from(near).reduce((a, v) => a + v, 0) }; },
    };
  }

  createEngine.N = N;
  root.CaroEngine = createEngine;

  // ====================================================
  // WORKER HOOKUP: when this file runs in a worker, it answers "think" requests
  // ====================================================
  if (typeof document === "undefined" && typeof root.postMessage === "function") {
    const eng = createEngine();
    root.onmessage = (e) => {
      const d = e.data || {};
      root.postMessage({ id: d.id, move: eng.load(d.moves || []) ? eng.think(d.opts) : -1 });
    };
  }
})(typeof self !== "undefined" ? self : this);

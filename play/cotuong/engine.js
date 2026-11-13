/* =========================================================
   Chinese chess engine: the rules of cờ tướng and a small search. No drawing.
   The page uses it to know which moves are legal. The same file also runs
   in a worker to pick the computer's moves, so the page never freezes.

   Board   9 files by 10 ranks, kept inside a 16 by 16 array with a margin of
           three squares all round, so no step ever leaves the array:
           square = (rank + 3) * 16 + file + 3.   Red starts on ranks 0 to 4
           and moves first. File 0 is on Red's left.
   Pieces  1 general, 2 advisor, 3 elephant, 4 horse, 5 chariot, 6 cannon,
           7 soldier; Black adds 8.
   Move    from | to << 8.   Written "h2e2": files a to i, ranks 0 to 9.

   Not in here: the tournament rules about perpetual check and perpetual
   chase. A position that comes up three times is simply a draw.

   Layout of this file:
     tables · position (make, unmake, attacks, move list) · notation
     evaluation · search · choosing a move · worker hookup
   ========================================================= */
(function (root) {
  "use strict";

  const K = 1, A = 2, E = 3, H = 4, R = 5, C = 6, P = 7, BLACK = 8;
  const START = "rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR r";
  const INF = 32000, MATE = 30000, MAX_PLY = 64;
  const LINES = [1, -1, 16, -16], SLANTS = [15, 17, -15, -17], EYES = [30, 34, -30, -34];
  // a horse steps one square straight (its leg, which must be free) and then one diagonally
  const HORSE = [[-16, -33], [-16, -31], [16, 31], [16, 33], [-1, -18], [-1, 14], [1, -14], [1, 18]];

  // ====================================================
  // TABLES
  // ====================================================
  const sqOf = (f, r) => (r + 3) * 16 + f + 3;
  const fileOf = (sq) => (sq & 15) - 3, rankOf = (sq) => (sq >> 4) - 3;
  const IN = new Uint8Array(256), PALACE = new Uint8Array(256), SQUARES = [];
  for (let r = 0; r < 10; r++) for (let f = 0; f < 9; f++) {
    const sq = sqOf(f, r);
    IN[sq] = 1; SQUARES.push(sq);
    if (f >= 3 && f <= 5 && (r <= 2 || r >= 7)) PALACE[sq] = 1;
  }
  // what a piece is worth where it stands, seen from Red's side (rank 0 is Red's back rank)
  function worth(type, f, r) {
    const mid = 4 - Math.abs(f - 4);                 // 0 on the edge files, 4 on the middle file
    switch (type) {
      case K: return (f === 4 ? 8 : 0) - r * 10;
      case A: return 200 + (f === 4 && r === 1 ? 6 : 0);
      case E: return 200 + (f === 4 && r === 2 ? 8 : 0) - (f === 0 || f === 8 ? 6 : 0);
      case H: return 400 + mid * 6 + (r >= 2 && r <= 7 ? 12 : 0) + (r >= 5 ? 8 : 0) - (r === 0 ? 10 : 0);
      case R: return 900 + mid * 2 + (r >= 1 ? 6 : 0) + (r >= 5 ? 6 : 0);
      case C: return 450 + mid + (f === 4 ? 12 : 0) + (r === 2 ? 6 : 0);
      // a soldier doubles in worth once it has crossed the river, and more as it nears the palace
      case P: return r <= 4 ? 100 + (f === 4 ? 6 : 0) + (r === 4 ? 10 : 0) : r === 9 ? 130 : 180 + (r - 5) * 14 + mid * 8;
    }
    return 0;
  }
  const WORTH = new Int16Array(16 * 256);            // by piece (with its colour) and square
  for (let type = 1; type <= 7; type++) for (const sq of SQUARES) {
    const f = fileOf(sq), r = rankOf(sq);
    WORTH[type * 256 + sq] = worth(type, f, r);
    WORTH[(type | BLACK) * 256 + sq] = worth(type, f, 9 - r);
  }
  const CAPTURE = [0, 1000, 200, 200, 400, 900, 450, 150];    // for ordering captures: biggest prize first

  // random numbers that give every position a fingerprint (two 32 bit halves)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) | 0;
    };
  }
  const zr = rng(20261113);
  const fill = (n) => { const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = zr(); return a; };
  const ZP_LO = fill(16 * 256), ZP_HI = fill(16 * 256), ZS_LO = zr(), ZS_HI = zr();

  // a few usual first moves, so games do not all start the same way
  const BOOK = {
    "": ["h2e2", "b2e2", "h0g2", "b0c2", "c3c4", "g3g4"],
    "h2e2": ["h9g7", "b9c7", "h7e7"],
    "b2e2": ["b9c7", "h9g7", "b7e7"],
    "h0g2": ["h9g7", "c6c5", "b7e7"],
    "b0c2": ["b9c7", "g6g5", "h7e7"],
    "c3c4": ["g6g5", "b9c7", "h7e7"],
    "g3g4": ["c6c5", "h9g7", "b7e7"],
    "h2e2 h9g7": ["h0g2", "b0c2"],
    "h2e2 b9c7": ["h0g2", "b0c2"],
    "b2e2 b9c7": ["b0c2", "h0g2"],
    "b2e2 h9g7": ["b0c2", "h0g2"],
  };

  const sqName = (sq) => "abcdefghi"[fileOf(sq)] + rankOf(sq);
  const sqFromName = (s) => sqOf(s.charCodeAt(0) - 97, s.charCodeAt(1) - 48);

  function createEngine() {
    // ====================================================
    // POSITION
    // ====================================================
    const b = new Int8Array(256);
    const king = [0, 0];
    let side = 0, half = 0, lo = 0, hi = 0;
    const st = new Int32Array(4 * 8192); let sp = 0;                       // what a move needs to be taken back
    const hLo = new Int32Array(8192), hHi = new Int32Array(8192); let hp = 0;   // fingerprint of every position so far
    const scratch = new Int32Array(160);
    let line = null;                                                       // the moves so far, for the opening book

    function setFen(fen) {
      const parts = fen.trim().split(/\s+/);
      b.fill(0);
      let r = 9, f = 0;
      for (const ch of parts[0]) {
        if (ch === "/") { r--; f = 0; }
        else if (ch >= "1" && ch <= "9") f += +ch;
        else {
          const i = "kaehrcp".indexOf(ch.toLowerCase());
          const pc = (i + 1) | (ch === ch.toLowerCase() ? BLACK : 0);
          b[sqOf(f, r)] = pc;
          if (i === 0) king[pc >> 3] = sqOf(f, r);
          f++;
        }
      }
      side = parts[1] === "b" ? BLACK : 0;
      half = +parts[2] || 0;
      sp = 0; hp = 0; line = null;
      lo = 0; hi = 0;
      for (const sq of SQUARES) if (b[sq]) { lo ^= ZP_LO[b[sq] * 256 + sq]; hi ^= ZP_HI[b[sq] * 256 + sq]; }
      if (side) { lo ^= ZS_LO; hi ^= ZS_HI; }
      hLo[hp] = lo; hHi[hp] = hi; hp++;
    }
    function fen() {
      let s = "";
      for (let r = 9; r >= 0; r--) {
        let gap = 0;
        for (let f = 0; f < 9; f++) {
          const pc = b[sqOf(f, r)];
          if (!pc) { gap++; continue; }
          if (gap) { s += gap; gap = 0; }
          const ch = "kaehrcp"[(pc & 7) - 1];
          s += pc & 8 ? ch : ch.toUpperCase();
        }
        if (gap) s += gap;
        if (r) s += "/";
      }
      return s + (side ? " b" : " r");
    }

    function make(m) {
      const from = m & 255, to = m >> 8, pc = b[from], cap = b[to];
      st[sp++] = cap; st[sp++] = half; st[sp++] = lo; st[sp++] = hi;
      let i = pc * 256 + from; lo ^= ZP_LO[i]; hi ^= ZP_HI[i];
      if (cap) { i = cap * 256 + to; lo ^= ZP_LO[i]; hi ^= ZP_HI[i]; half = 0; } else half++;
      i = pc * 256 + to; lo ^= ZP_LO[i]; hi ^= ZP_HI[i];
      b[from] = 0; b[to] = pc;
      if ((pc & 7) === K) king[pc >> 3] = to;
      lo ^= ZS_LO; hi ^= ZS_HI;
      side ^= 8;
      hLo[hp] = lo; hHi[hp] = hi; hp++;
    }
    function unmake(m) {
      const from = m & 255, to = m >> 8, pc = b[to];
      hp--;
      hi = st[--sp]; lo = st[--sp]; half = st[--sp];
      b[from] = pc; b[to] = st[--sp];
      if ((pc & 7) === K) king[pc >> 3] = from;
      side ^= 8;
    }
    // passing the turn, used only inside the search
    function makeNull() {
      st[sp++] = half; st[sp++] = lo; st[sp++] = hi;
      half = 0; lo ^= ZS_LO; hi ^= ZS_HI; side ^= 8;
      hLo[hp] = lo; hHi[hp] = hi; hp++;
    }
    function unmakeNull() { hp--; hi = st[--sp]; lo = st[--sp]; half = st[--sp]; side ^= 8; }

    // how many earlier times this exact position has been on the board
    function repeats() {
      let n = 0;
      const stop = Math.max(0, hp - 1 - half);
      for (let i = hp - 3; i >= stop; i -= 2) if (hLo[i] === lo && hHi[i] === hi) n++;
      return n;
    }

    // is this square (in practice a general's) attacked by the given side, 0 Red or 8 Black
    function attacked(sq, by) {
      const pawn = P | by, rk = rankOf(sq);
      // a soldier steps forward onto it, or sideways once it is over the river
      if (b[sq + (by ? 16 : -16)] === pawn) return true;
      if ((by ? rk <= 4 : rk >= 5) && (b[sq - 1] === pawn || b[sq + 1] === pawn)) return true;
      const horse = H | by;
      for (let i = 0; i < 8; i++) {
        const h = sq - HORSE[i][1];
        if (b[h] === horse && !b[h + HORSE[i][0]]) return true;
      }
      const rook = R | by, cannon = C | by, gen = K | by;
      for (let i = 0; i < 4; i++) {
        const d = LINES[i];
        let t = sq + d;
        while (IN[t] && !b[t]) t += d;
        if (!IN[t]) continue;
        // the first piece in line: a chariot, or the other general looking down an open file
        if (b[t] === rook || (b[t] === gen && (d === 16 || d === -16))) return true;
        // past that piece, which serves as a screen: a cannon
        t += d;
        while (IN[t] && !b[t]) t += d;
        if (IN[t] && b[t] === cannon) return true;
      }
      return false;
    }
    const inCheck = () => attacked(king[side >> 3], side ^ 8);

    // every move the pieces could make, before checking that the general is safe.
    // quiet = false keeps only captures.
    function gen(moves, quiet) {
      const us = side, them = us ^ 8;
      let n = 0;
      for (let k = 0; k < 90; k++) {
        const sq = SQUARES[k], pc = b[sq];
        if (!pc || (pc & 8) !== us) continue;
        const from = sq;
        switch (pc & 7) {
          case K:
            for (let i = 0; i < 4; i++) {
              const to = sq + LINES[i], t = b[to];
              if (PALACE[to] && (t ? (t & 8) === them : quiet)) moves[n++] = from | to << 8;
            }
            break;
          case A:
            for (let i = 0; i < 4; i++) {
              const to = sq + SLANTS[i], t = b[to];
              if (PALACE[to] && (t ? (t & 8) === them : quiet)) moves[n++] = from | to << 8;
            }
            break;
          case E:
            for (let i = 0; i < 4; i++) {
              const to = sq + EYES[i];
              if (!IN[to] || b[sq + (EYES[i] >> 1)] || (us ? rankOf(to) < 5 : rankOf(to) > 4)) continue;   // blocked eye, or across the river
              const t = b[to];
              if (t ? (t & 8) === them : quiet) moves[n++] = from | to << 8;
            }
            break;
          case H:
            for (let i = 0; i < 8; i++) {
              const to = sq + HORSE[i][1];
              if (!IN[to] || b[sq + HORSE[i][0]]) continue;                                               // blocked leg
              const t = b[to];
              if (t ? (t & 8) === them : quiet) moves[n++] = from | to << 8;
            }
            break;
          case R:
            for (let i = 0; i < 4; i++) {
              const d = LINES[i];
              let to = sq + d;
              while (IN[to]) {
                const t = b[to];
                if (!t) { if (quiet) moves[n++] = from | to << 8; }
                else { if ((t & 8) === them) moves[n++] = from | to << 8; break; }
                to += d;
              }
            }
            break;
          case C:
            for (let i = 0; i < 4; i++) {
              const d = LINES[i];
              let to = sq + d;
              while (IN[to] && !b[to]) { if (quiet) moves[n++] = from | to << 8; to += d; }
              if (!IN[to]) continue;
              to += d;                                             // jump the screen
              while (IN[to] && !b[to]) to += d;
              if (IN[to] && (b[to] & 8) === them) moves[n++] = from | to << 8;
            }
            break;
          case P: {
            const fwd = us ? -16 : 16, rk = rankOf(sq);
            let to = sq + fwd, t = b[to];
            if (IN[to] && (t ? (t & 8) === them : quiet)) moves[n++] = from | to << 8;
            if (us ? rk <= 4 : rk >= 5) {
              to = sq - 1; t = b[to];
              if (IN[to] && (t ? (t & 8) === them : quiet)) moves[n++] = from | to << 8;
              to = sq + 1; t = b[to];
              if (IN[to] && (t ? (t & 8) === them : quiet)) moves[n++] = from | to << 8;
            }
            break;
          }
        }
      }
      return n;
    }

    // the legal moves: the ones that do not leave your own general attacked
    function legalMoves() {
      const us = side, n = gen(scratch, true), list = Array.from(scratch.subarray(0, n)), out = [];
      for (const m of list) {
        make(m);
        if (!attacked(king[us >> 3], side)) out.push(m);
        unmake(m);
      }
      return out;
    }
    function perft(depth) {
      if (depth === 0) return 1;
      let n = 0;
      for (const m of legalMoves()) { make(m); n += perft(depth - 1); unmake(m); }
      return n;
    }
    // neither side has a piece that can cross the river
    function barren() {
      for (const sq of SQUARES) { const t = b[sq] & 7; if (t >= H) return false; }
      return true;
    }
    // where the game stands. A side with no legal move has lost, in check or not.
    function status() {
      const check = inCheck();
      if (!legalMoves().length) return { over: true, kind: check ? "checkmate" : "stuck", winner: side ? "r" : "b", check };
      if (barren()) return { over: true, kind: "material", winner: null, check };
      if (repeats() >= 2) return { over: true, kind: "repetition", winner: null, check };
      if (half >= 120) return { over: true, kind: "quiet", winner: null, check };
      return { over: false, kind: null, winner: null, check };
    }

    // ====================================================
    // NOTATION
    // ====================================================
    const uci = (m) => (m ? sqName(m & 255) + sqName(m >> 8) : "");
    function fromUci(s) {
      if (typeof s !== "string" || !/^[a-i][0-9][a-i][0-9]$/.test(s)) return 0;
      const want = sqFromName(s.slice(0, 2)) | sqFromName(s.slice(2, 4)) << 8;
      for (const m of legalMoves()) if (m === want) return m;
      return 0;
    }
    // set up the start position and replay the moves played since
    function load(moves) {
      setFen(START);
      for (const u of moves || []) {
        const m = fromUci(u);
        if (!m) return false;
        make(m);
      }
      line = (moves || []).join(" ");
      return true;
    }

    // ====================================================
    // EVALUATION: who is better, in hundredths of a soldier, for the side to move
    // ====================================================
    function evaluate() {
      let s = 0;
      for (let k = 0; k < 90; k++) {
        const sq = SQUARES[k], pc = b[sq];
        if (!pc) continue;
        let v = WORTH[pc * 256 + sq];
        if ((pc & 7) === R) {                        // a chariot is worth more with open lines to run on
          for (let i = 0; i < 4; i++) { let t = sq + LINES[i]; while (IN[t] && !b[t]) { v += 3; t += LINES[i]; } }
        }
        s += pc & 8 ? -v : v;
      }
      return side ? -s : s;
    }

    // ====================================================
    // SEARCH: look ahead, assuming both sides play their best move
    // ====================================================
    const TT_BITS = 18, TT_MASK = (1 << TT_BITS) - 1;
    let ttLo, ttHi, ttMove, ttScore, ttDepth, ttFlag, mv, sc, killers, hist;
    let nodes = 0, nodeLimit = 0, stopAt = 0, stopped = false;

    function initSearch() {
      if (!ttLo) {
        const n = 1 << TT_BITS;
        ttLo = new Int32Array(n); ttHi = new Int32Array(n); ttMove = new Int32Array(n);
        ttScore = new Int16Array(n); ttDepth = new Int8Array(n); ttFlag = new Int8Array(n);
        mv = []; sc = [];
        for (let i = 0; i <= MAX_PLY; i++) { mv.push(new Int32Array(160)); sc.push(new Int32Array(160)); }
        killers = new Int32Array(MAX_PLY * 2 + 4);
        hist = new Int32Array(16 * 256);
      }
      killers.fill(0);
      for (let i = 0; i < hist.length; i++) hist[i] >>= 3;
    }
    // most promising moves first: the remembered best move, good captures, then moves that worked before
    function scoreMoves(moves, scores, n, hashMove, ply) {
      for (let i = 0; i < n; i++) {
        const m = moves[i], to = m >> 8, cap = b[to];
        let s;
        if (m === hashMove) s = 1 << 30;
        else if (cap) s = (1 << 24) + CAPTURE[cap & 7] * 16 - CAPTURE[b[m & 255] & 7] / 50;
        else if (m === killers[ply * 2]) s = 1 << 22;
        else if (m === killers[ply * 2 + 1]) s = (1 << 22) - 1;
        else s = hist[b[m & 255] * 256 + to];
        scores[i] = s;
      }
    }
    function pick(moves, scores, i, n) {
      let best = i;
      for (let j = i + 1; j < n; j++) if (scores[j] > scores[best]) best = j;
      if (best !== i) {
        let t = moves[i]; moves[i] = moves[best]; moves[best] = t;
        t = scores[i]; scores[i] = scores[best]; scores[best] = t;
      }
    }
    function hasForce(us) {
      for (let k = 0; k < 90; k++) { const pc = b[SQUARES[k]]; if (pc && (pc & 8) === us && (pc & 7) >= H && (pc & 7) <= C) return true; }
      return false;
    }
    // keep trading until the position is quiet, so a capture is never judged half way through
    function quiesce(alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && (nodes >= nodeLimit || Date.now() >= stopAt)) stopped = true;
      if (stopped) return 0;
      const stand = evaluate();
      if (ply >= MAX_PLY - 1 || stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      const us = side, them = us ^ 8, moves = mv[ply], scores = sc[ply], n = gen(moves, false);
      scoreMoves(moves, scores, n, 0, ply);
      let best = stand;
      for (let i = 0; i < n; i++) {
        pick(moves, scores, i, n);
        const m = moves[i];
        make(m);
        if (attacked(king[us >> 3], them)) { unmake(m); continue; }
        const s = -quiesce(-beta, -alpha, ply + 1);
        unmake(m);
        if (stopped) return 0;
        if (s > best) { best = s; if (s > alpha) { alpha = s; if (s >= beta) break; } }
      }
      return best;
    }
    function search(depth, alpha, beta, ply, canNull) {
      if ((++nodes & 1023) === 0 && (nodes >= nodeLimit || Date.now() >= stopAt)) stopped = true;
      if (stopped) return 0;
      if (half >= 120 || repeats()) return 0;
      if (ply >= MAX_PLY - 1) return evaluate();
      const us = side, them = us ^ 8, check = attacked(king[us >> 3], them);
      if (check) depth++;
      if (depth <= 0) return quiesce(alpha, beta, ply);

      const idx = lo & TT_MASK;
      let hashMove = 0;
      if (ttLo[idx] === lo && ttHi[idx] === hi) {
        hashMove = ttMove[idx];
        if (ttDepth[idx] >= depth) {
          let s = ttScore[idx];
          if (s > MATE - 500) s -= ply; else if (s < -MATE + 500) s += ply;
          const f = ttFlag[idx];
          if (f === 0 || (f === 1 && s >= beta) || (f === 2 && s <= alpha)) return s;
        }
      }
      // if passing the turn would still be good enough, the position is good enough
      if (canNull && !check && depth >= 3 && beta < MATE - 500 && hasForce(us) && evaluate() >= beta) {
        makeNull();
        const s = -search(depth - 3, -beta, -beta + 1, ply + 1, false);
        unmakeNull();
        if (stopped) return 0;
        if (s >= beta) return beta;
      }
      const moves = mv[ply], scores = sc[ply], n = gen(moves, true), alpha0 = alpha;
      scoreMoves(moves, scores, n, hashMove, ply);
      let best = -INF, bestMove = 0, count = 0;
      for (let i = 0; i < n; i++) {
        pick(moves, scores, i, n);
        const m = moves[i];
        make(m);
        if (attacked(king[us >> 3], them)) { unmake(m); continue; }
        count++;
        let s;
        if (count === 1) s = -search(depth - 1, -beta, -alpha, ply + 1, true);
        else {
          s = -search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha && s < beta) s = -search(depth - 1, -beta, -alpha, ply + 1, true);
        }
        unmake(m);
        if (stopped) return 0;
        if (s > best) {
          best = s; bestMove = m;
          if (s > alpha) {
            alpha = s;
            if (s >= beta) {
              if (!b[m >> 8]) {
                if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
                const h = b[m & 255] * 256 + (m >> 8);
                hist[h] += depth * depth;
                if (hist[h] > 1 << 20) for (let k = 0; k < hist.length; k++) hist[k] >>= 1;
              }
              break;
            }
          }
        }
      }
      if (!count) return -MATE + ply;                // no legal move loses, in check or not

      let s = best;
      if (s > MATE - 500) s += ply; else if (s < -MATE + 500) s -= ply;
      ttLo[idx] = lo; ttHi[idx] = hi; ttMove[idx] = bestMove; ttScore[idx] = s; ttDepth[idx] = depth;
      ttFlag[idx] = best <= alpha0 ? 2 : best >= beta ? 1 : 0;
      return best;
    }

    // ====================================================
    // CHOOSING A MOVE
    //   opts.depth   how many moves ahead to look
    //   opts.time    thinking time in milliseconds (searches deeper until it runs out)
    //   opts.nodes   a hard cap on positions looked at
    //   opts.noise   blur added to each move's score, so weaker levels slip up
    //   opts.random  chance of playing any legal move at all
    //   opts.book    use the small opening book
    // ====================================================
    let lastInfo = { depth: 0, score: 0, nodes: 0 };
    function think(opts) {
      opts = opts || {};
      const rootMoves = legalMoves();
      lastInfo = { depth: 0, score: 0, nodes: 0 };
      if (!rootMoves.length) return 0;
      if (rootMoves.length === 1) return rootMoves[0];
      if (opts.book && line !== null && BOOK[line]) {
        const m = fromUci(BOOK[line][(Math.random() * BOOK[line].length) | 0]);
        if (m) return m;
      }
      if (opts.random && Math.random() < opts.random) return rootMoves[(Math.random() * rootMoves.length) | 0];

      initSearch();
      nodes = 0; stopped = false;
      nodeLimit = opts.nodes || 4e6;
      stopAt = Date.now() + (opts.time || 8000);
      const maxDepth = Math.max(1, Math.min(opts.depth || 4, MAX_PLY - 8));

      if (opts.noise !== undefined) {
        // weaker levels: give every move an honest score to a fixed depth, then blur the scores
        let best = rootMoves[0], bestScore = -Infinity;
        for (const m of rootMoves) {
          make(m);
          let s = -search(maxDepth - 1, -INF, INF, 1, true);
          unmake(m);
          if (stopped) break;
          s += (Math.random() * 2 - 1) * opts.noise;
          if (s > bestScore) { bestScore = s; best = m; }
        }
        lastInfo = { depth: maxDepth, score: Math.round(bestScore), nodes };
        return best;
      }
      // strongest level: search one move deeper each round until the time is up
      let best = rootMoves[0];
      for (let depth = 1; depth <= maxDepth; depth++) {
        let alpha = -INF, roundBest = 0, roundScore = -INF;
        for (let i = 0; i < rootMoves.length; i++) {
          const m = rootMoves[i];
          make(m);
          let s;
          if (i === 0) s = -search(depth - 1, -INF, -alpha, 1, true);
          else {
            s = -search(depth - 1, -alpha - 1, -alpha, 1, true);
            if (!stopped && s > alpha) s = -search(depth - 1, -INF, -alpha, 1, true);
          }
          unmake(m);
          if (stopped) break;
          if (s > roundScore) { roundScore = s; roundBest = m; if (s > alpha) alpha = s; }
        }
        // a round cut short still counts: its first move was the previous best, so anything above it is better
        if (roundBest) {
          best = roundBest;
          rootMoves.splice(rootMoves.indexOf(best), 1); rootMoves.unshift(best);
          lastInfo = { depth, score: roundScore, nodes };
        }
        if (stopped || roundScore > MATE - 500 || roundScore < -MATE + 500) break;
      }
      return best;
    }

    return {
      START, setFen, fen, load, make, unmake, perft, think, status, uci, fromUci, evaluate,
      moves: legalMoves, inCheck, repeats,
      at: (sq) => b[sq],
      turn: () => (side ? "b" : "r"),
      kingSq: (color) => king[color === "b" ? 1 : 0],
      get info() { return lastInfo; },
    };
  }

  createEngine.START = START;
  createEngine.sq = sqOf; createEngine.file = fileOf; createEngine.rank = rankOf; createEngine.SQUARES = SQUARES;
  root.XiangqiEngine = createEngine;

  // ====================================================
  // WORKER HOOKUP: when this file runs in a worker, it answers "think" requests
  // ====================================================
  if (typeof document === "undefined" && typeof root.postMessage === "function") {
    const eng = createEngine();
    root.onmessage = (e) => {
      const d = e.data || {};
      root.postMessage({ id: d.id, move: eng.load(d.moves || []) ? eng.uci(eng.think(d.opts)) : "" });
    };
  }
})(typeof self !== "undefined" ? self : this);

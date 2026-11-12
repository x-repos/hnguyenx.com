/* =========================================================
   Chess engine: the rules of chess and a small search. No drawing.
   The page uses it to know which moves are legal. The same file also
   runs in a worker to pick the computer's moves, so the page never freezes.

   Board   0x88 layout: square = rank * 16 + file, a1 = 0, h8 = 119.
   Pieces  1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king; black adds 8.
   Move    from | to << 7 | promotion << 14 | flags << 17
           flags: 1 en passant, 2 castle, 4 double pawn push

   Layout of this file:
     tables · position (make, unmake, attacks, move list) · notation
     evaluation · search · choosing a move · worker hookup
   ========================================================= */
(function (root) {
  "use strict";

  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, BLACK = 8;
  const F_EP = 1, F_CASTLE = 2, F_DOUBLE = 4;
  const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
  const ALL = [-17, -16, -15, -1, 1, 15, 16, 17];
  const DIAG = [-17, -15, 15, 17], ORTH = [-16, -1, 1, 16];
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const INF = 32000, MATE = 30000, MAX_PLY = 64;

  // ====================================================
  // TABLES
  // ====================================================
  const VALUE = [0, 100, 320, 330, 500, 900, 0];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  // where each piece likes to stand, seen from White's side with rank 8 first
  const PST = [null,
    [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    // the king while there are many pieces left: stay home behind the pawns
    [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  ];
  // the king once the board has emptied: come to the middle
  const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

  // a move here or there loses the right to castle
  const CMASK = new Int8Array(128).fill(15);
  CMASK[0] = 13; CMASK[7] = 14; CMASK[4] = 12; CMASK[112] = 7; CMASK[119] = 11; CMASK[116] = 3;

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
  const zr = rng(20261112);
  const fillRandom = (n) => { const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = zr(); return a; };
  const ZP_LO = fillRandom(16 * 128), ZP_HI = fillRandom(16 * 128);
  const ZC_LO = fillRandom(16), ZC_HI = fillRandom(16), ZE_LO = fillRandom(8), ZE_HI = fillRandom(8);
  const ZS_LO = zr(), ZS_HI = zr();

  // a few well known first moves, so games do not all start the same way
  const BOOK = {
    "": ["e2e4", "d2d4", "g1f3", "c2c4"],
    "e2e4": ["e7e5", "c7c5", "e7e6", "c7c6"],
    "d2d4": ["d7d5", "g8f6", "e7e6"],
    "g1f3": ["d7d5", "g8f6"],
    "c2c4": ["e7e5", "g8f6", "c7c5"],
    "e2e4 e7e5": ["g1f3"],
    "e2e4 c7c5": ["g1f3", "b1c3"],
    "e2e4 e7e6": ["d2d4"],
    "e2e4 c7c6": ["d2d4"],
    "d2d4 d7d5": ["c2c4", "g1f3"],
    "d2d4 g8f6": ["c2c4", "g1f3"],
    "e2e4 e7e5 g1f3": ["b8c6", "g8f6"],
    "d2d4 d7d5 c2c4": ["e7e6", "c7c6"],
    "e2e4 e7e5 g1f3 b8c6": ["f1b5", "f1c4", "d2d4"],
  };

  const LETTER = ["", "", "N", "B", "R", "Q", "K"];      // the letter written for each piece; pawns have none
  const sqName = (sq) => "abcdefgh"[sq & 7] + ((sq >> 4) + 1);
  const sqFromName = (s) => (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97);

  function createEngine() {
    // ====================================================
    // POSITION
    // ====================================================
    const b = new Int8Array(128);
    const king = [0, 0];
    let side = 0, castle = 0, ep = -1, half = 0, full = 1, lo = 0, hi = 0;
    const st = new Int32Array(6 * 8192); let sp = 0;                       // what a move needs to be taken back
    const hLo = new Int32Array(8192), hHi = new Int32Array(8192); let hp = 0;   // fingerprint of every position so far
    const scratch = new Int32Array(256);
    let line = null;                                                       // the moves so far, for the opening book

    function hashAll() {
      lo = 0; hi = 0;
      for (let sq = 0; sq < 120; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        if (b[sq]) { lo ^= ZP_LO[b[sq] * 128 + sq]; hi ^= ZP_HI[b[sq] * 128 + sq]; }
      }
      lo ^= ZC_LO[castle]; hi ^= ZC_HI[castle];
      if (ep >= 0) { lo ^= ZE_LO[ep & 7]; hi ^= ZE_HI[ep & 7]; }
      if (side) { lo ^= ZS_LO; hi ^= ZS_HI; }
    }

    function setFen(fen) {
      const parts = fen.trim().split(/\s+/);
      b.fill(0);
      let r = 7, f = 0;
      for (const ch of parts[0]) {
        if (ch === "/") { r--; f = 0; }
        else if (ch >= "1" && ch <= "8") f += +ch;
        else {
          const i = "pnbrqk".indexOf(ch.toLowerCase());
          const pc = (i + 1) | (ch === ch.toLowerCase() ? BLACK : 0);
          b[r * 16 + f] = pc;
          if (i === 5) king[pc >> 3] = r * 16 + f;
          f++;
        }
      }
      side = parts[1] === "b" ? BLACK : 0;
      castle = 0;
      for (const ch of parts[2] || "-") castle |= ch === "K" ? 1 : ch === "Q" ? 2 : ch === "k" ? 4 : ch === "q" ? 8 : 0;
      ep = parts[3] && parts[3] !== "-" ? sqFromName(parts[3]) : -1;
      half = +parts[4] || 0; full = +parts[5] || 1;
      sp = 0; hp = 0; line = null;
      hashAll();
      hLo[hp] = lo; hHi[hp] = hi; hp++;
    }

    function fen() {
      let s = "";
      for (let r = 7; r >= 0; r--) {
        let gap = 0;
        for (let f = 0; f < 8; f++) {
          const pc = b[r * 16 + f];
          if (!pc) { gap++; continue; }
          if (gap) { s += gap; gap = 0; }
          const ch = "pnbrqk"[(pc & 7) - 1];
          s += pc & 8 ? ch : ch.toUpperCase();
        }
        if (gap) s += gap;
        if (r) s += "/";
      }
      const c = (castle & 1 ? "K" : "") + (castle & 2 ? "Q" : "") + (castle & 4 ? "k" : "") + (castle & 8 ? "q" : "");
      return s + (side ? " b " : " w ") + (c || "-") + " " + (ep >= 0 ? sqName(ep) : "-") + " " + half + " " + full;
    }

    function make(m) {
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17;
      const pc = b[from], cap = b[to], us = pc & 8, type = pc & 7;
      st[sp++] = cap; st[sp++] = castle; st[sp++] = ep; st[sp++] = half; st[sp++] = lo; st[sp++] = hi;
      lo ^= ZC_LO[castle]; hi ^= ZC_HI[castle];
      if (ep >= 0) { lo ^= ZE_LO[ep & 7]; hi ^= ZE_HI[ep & 7]; ep = -1; }
      half++;
      let i = pc * 128 + from; lo ^= ZP_LO[i]; hi ^= ZP_HI[i];
      b[from] = 0;
      if (cap) { i = cap * 128 + to; lo ^= ZP_LO[i]; hi ^= ZP_HI[i]; half = 0; }
      let put = pc;
      if (type === P) {
        half = 0;
        if (promo) put = promo | us;
        else if (flag & F_EP) {
          const c = to + (us ? 16 : -16);
          i = b[c] * 128 + c; lo ^= ZP_LO[i]; hi ^= ZP_HI[i];
          b[c] = 0;
        } else if (flag & F_DOUBLE) {
          // remember the square only if an enemy pawn could really take there
          const foe = P | (us ^ 8);
          if ((!((to - 1) & 0x88) && b[to - 1] === foe) || (!((to + 1) & 0x88) && b[to + 1] === foe)) ep = (from + to) >> 1;
        }
      } else if (type === K) {
        king[us >> 3] = to;
        if (flag & F_CASTLE) {
          const rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1, rook = b[rf];
          b[rf] = 0; b[rt] = rook;
          i = rook * 128 + rf; lo ^= ZP_LO[i]; hi ^= ZP_HI[i];
          i = rook * 128 + rt; lo ^= ZP_LO[i]; hi ^= ZP_HI[i];
        }
      }
      b[to] = put;
      i = put * 128 + to; lo ^= ZP_LO[i]; hi ^= ZP_HI[i];
      castle &= CMASK[from] & CMASK[to];
      lo ^= ZC_LO[castle]; hi ^= ZC_HI[castle];
      if (ep >= 0) { lo ^= ZE_LO[ep & 7]; hi ^= ZE_HI[ep & 7]; }
      lo ^= ZS_LO; hi ^= ZS_HI;
      side = us ^ 8;
      if (us) full++;
      hLo[hp] = lo; hHi[hp] = hi; hp++;
    }

    function unmake(m) {
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17;
      hp--;
      hi = st[--sp]; lo = st[--sp]; half = st[--sp]; ep = st[--sp]; castle = st[--sp];
      const cap = st[--sp];
      side ^= 8;
      const us = side;
      if (us) full--;
      let pc = b[to];
      if (promo) pc = P | us;
      b[from] = pc; b[to] = cap;
      const type = pc & 7;
      if (type === P) {
        if (flag & F_EP) b[to + (us ? 16 : -16)] = P | (us ^ 8);
      } else if (type === K) {
        king[us >> 3] = from;
        if (flag & F_CASTLE) {
          const rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1;
          b[rf] = b[rt]; b[rt] = 0;
        }
      }
    }

    // passing the turn, used only inside the search
    function makeNull() {
      st[sp++] = ep; st[sp++] = half; st[sp++] = lo; st[sp++] = hi;
      if (ep >= 0) { lo ^= ZE_LO[ep & 7]; hi ^= ZE_HI[ep & 7]; ep = -1; }
      half = 0;
      lo ^= ZS_LO; hi ^= ZS_HI; side ^= 8;
      hLo[hp] = lo; hHi[hp] = hi; hp++;
    }
    function unmakeNull() {
      hp--;
      hi = st[--sp]; lo = st[--sp]; half = st[--sp]; ep = st[--sp];
      side ^= 8;
    }

    // how many earlier times this exact position has been on the board
    function repeats() {
      let n = 0;
      const stop = Math.max(0, hp - 1 - half);
      for (let i = hp - 3; i >= stop; i -= 2) if (hLo[i] === lo && hHi[i] === hi) n++;
      return n;
    }

    // is this square attacked by the given side (0 white, 8 black)
    function attacked(sq, by) {
      let t;
      if (by) {
        t = sq + 15; if (!(t & 0x88) && b[t] === 9) return true;
        t = sq + 17; if (!(t & 0x88) && b[t] === 9) return true;
      } else {
        t = sq - 15; if (!(t & 0x88) && b[t] === 1) return true;
        t = sq - 17; if (!(t & 0x88) && b[t] === 1) return true;
      }
      const n = N | by, k = K | by, bi = B | by, r = R | by, q = Q | by;
      for (let i = 0; i < 8; i++) {
        t = sq + KNIGHT[i]; if (!(t & 0x88) && b[t] === n) return true;
        t = sq + ALL[i]; if (!(t & 0x88) && b[t] === k) return true;
      }
      for (let i = 0; i < 4; i++) {
        let d = DIAG[i]; t = sq + d;
        while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === bi || p === q) return true; break; } t += d; }
        d = ORTH[i]; t = sq + d;
        while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === r || p === q) return true; break; } t += d; }
      }
      return false;
    }
    const inCheck = () => attacked(king[side >> 3], side ^ 8);

    // every move the pieces could make, before checking that the king is safe.
    // quiet = false keeps only captures and queen promotions.
    function gen(moves, quiet) {
      const us = side, them = us ^ 8;
      let n = 0;
      for (let sq = 0; sq < 120; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const pc = b[sq];
        if (!pc || (pc & 8) !== us) continue;
        const type = pc & 7;
        if (type === P) {
          const dir = us ? -16 : 16, rank = sq >> 4, last = rank === (us ? 1 : 6);
          let to = sq + dir;
          if (!b[to]) {
            if (last) {
              moves[n++] = sq | to << 7 | Q << 14;
              if (quiet) { moves[n++] = sq | to << 7 | R << 14; moves[n++] = sq | to << 7 | B << 14; moves[n++] = sq | to << 7 | N << 14; }
            } else if (quiet) {
              moves[n++] = sq | to << 7;
              if (rank === (us ? 6 : 1) && !b[to + dir]) moves[n++] = sq | (to + dir) << 7 | F_DOUBLE << 17;
            }
          }
          for (let dc = -1; dc <= 1; dc += 2) {
            to = sq + dir + dc;
            if (to & 0x88) continue;
            const t = b[to];
            if (t && (t & 8) === them) {
              if (last) {
                moves[n++] = sq | to << 7 | Q << 14;
                if (quiet) { moves[n++] = sq | to << 7 | R << 14; moves[n++] = sq | to << 7 | B << 14; moves[n++] = sq | to << 7 | N << 14; }
              } else moves[n++] = sq | to << 7;
            } else if (to === ep && !t) moves[n++] = sq | to << 7 | F_EP << 17;
          }
        } else if (type === N || type === K) {
          const offs = type === N ? KNIGHT : ALL;
          for (let i = 0; i < 8; i++) {
            const to = sq + offs[i];
            if (to & 0x88) continue;
            const t = b[to];
            if (!t) { if (quiet) moves[n++] = sq | to << 7; }
            else if ((t & 8) === them) moves[n++] = sq | to << 7;
          }
          if (type === K && quiet) {
            const ks = us ? 4 : 1, qs = us ? 8 : 2, home = us ? 116 : 4;
            if (sq === home && (castle & (ks | qs)) && !attacked(home, them)) {
              if ((castle & ks) && !b[home + 1] && !b[home + 2] && !attacked(home + 1, them)) moves[n++] = sq | (home + 2) << 7 | F_CASTLE << 17;
              if ((castle & qs) && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(home - 1, them)) moves[n++] = sq | (home - 2) << 7 | F_CASTLE << 17;
            }
          }
        } else {
          const dirs = type === B ? DIAG : type === R ? ORTH : ALL;
          for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i];
            let to = sq + d;
            while (!(to & 0x88)) {
              const t = b[to];
              if (!t) { if (quiet) moves[n++] = sq | to << 7; }
              else { if ((t & 8) === them) moves[n++] = sq | to << 7; break; }
              to += d;
            }
          }
        }
      }
      return n;
    }

    // the legal moves: the ones that do not leave your own king attacked
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

    function insufficient() {
      let minors = 0, light = 0, dark = 0;
      for (let sq = 0; sq < 120; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const t = b[sq] & 7;
        if (!t || t === K) continue;
        if (t === P || t === R || t === Q) return false;
        minors++;
        if (t === B) { if (((sq >> 4) + (sq & 7)) & 1) light++; else dark++; }
        else if (minors > 1) return false;
      }
      return minors <= 1 || (minors === light) || (minors === dark);
    }

    // where the game stands: still going, mate, or one of the draws
    function status() {
      const check = inCheck();
      if (!legalMoves().length) return { over: true, kind: check ? "checkmate" : "stalemate", winner: check ? (side ? "w" : "b") : null, check };
      if (insufficient()) return { over: true, kind: "material", winner: null, check };
      if (half >= 100) return { over: true, kind: "fifty", winner: null, check };
      if (repeats() >= 2) return { over: true, kind: "repetition", winner: null, check };
      return { over: false, kind: null, winner: null, check };
    }

    // ====================================================
    // NOTATION
    // ====================================================
    const uci = (m) => (m ? sqName(m & 127) + sqName((m >> 7) & 127) + LETTER[(m >> 14) & 7].toLowerCase() : "");
    function fromUci(s) {
      for (const m of legalMoves()) if (uci(m) === s) return m;
      return 0;
    }
    // the short written form, such as Nf3 or exd5. Call it before the move is made.
    function san(m) {
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17, type = b[from] & 7;
      let s;
      if (flag & F_CASTLE) s = to > from ? "O-O" : "O-O-O";
      else {
        const takes = b[to] || (flag & F_EP);
        if (type === P) s = (takes ? "abcdefgh"[from & 7] + "x" : "") + sqName(to) + (promo ? "=" + LETTER[promo] : "");
        else {
          let twin = false, sameFile = false, sameRank = false;
          for (const o of legalMoves()) {
            const of = o & 127;
            if (of === from || ((o >> 7) & 127) !== to || (b[of] & 7) !== type) continue;
            twin = true;
            if ((of & 7) === (from & 7)) sameFile = true;
            if ((of >> 4) === (from >> 4)) sameRank = true;
          }
          const which = !twin ? "" : !sameFile ? "abcdefgh"[from & 7] : !sameRank ? String((from >> 4) + 1) : sqName(from);
          s = LETTER[type] + which + (takes ? "x" : "") + sqName(to);
        }
      }
      make(m);
      if (inCheck()) s += legalMoves().length ? "+" : "#";
      unmake(m);
      return s;
    }

    // set up a position and replay the moves played since
    function load(startFen, moves) {
      setFen(startFen || START);
      for (const u of moves || []) {
        const m = fromUci(u);
        if (!m) return false;
        make(m);
      }
      line = (startFen || START) === START ? (moves || []).join(" ") : null;
      return true;
    }

    // ====================================================
    // EVALUATION: who is better, in hundredths of a pawn, for the side to move
    // ====================================================
    function evaluate() {
      let mg = 0, eg = 0, phase = 0, wb = 0, bb = 0;
      for (let sq = 0; sq < 120; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const pc = b[sq];
        if (!pc) continue;
        const type = pc & 7;
        phase += PHASE[type];
        if (pc & 8) {
          const i = (sq >> 4) * 8 + (sq & 7);
          if (type === K) { mg -= PST[K][i]; eg -= KING_END[i]; }
          else { const v = VALUE[type] + PST[type][i]; mg -= v; eg -= v; if (type === B) bb++; }
        } else {
          const i = (7 - (sq >> 4)) * 8 + (sq & 7);
          if (type === K) { mg += PST[K][i]; eg += KING_END[i]; }
          else { const v = VALUE[type] + PST[type][i]; mg += v; eg += v; if (type === B) wb++; }
        }
      }
      if (wb >= 2) { mg += 30; eg += 30; }
      if (bb >= 2) { mg -= 30; eg -= 30; }
      if (phase > 24) phase = 24;
      let score = ((mg * phase + eg * (24 - phase)) / 24) | 0;
      if (phase <= 8 && (eg > 300 || eg < -300)) {
        // with a big lead and few pieces, bring the kings together to finish the game
        const d = Math.max(Math.abs((king[0] >> 4) - (king[1] >> 4)), Math.abs((king[0] & 7) - (king[1] & 7)));
        score += (eg > 0 ? 1 : -1) * (7 - d) * 6;
      }
      return side ? -score : score;
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
        for (let i = 0; i <= MAX_PLY; i++) { mv.push(new Int32Array(256)); sc.push(new Int32Array(256)); }
        killers = new Int32Array(MAX_PLY * 2 + 4);
        hist = new Int32Array(16 * 128);
      }
      killers.fill(0);
      for (let i = 0; i < hist.length; i++) hist[i] >>= 3;
    }

    // most promising moves first: the remembered best move, good captures, then moves that worked before
    function scoreMoves(moves, scores, n, hashMove, ply) {
      for (let i = 0; i < n; i++) {
        const m = moves[i], to = (m >> 7) & 127, cap = b[to], promo = (m >> 14) & 7;
        let s;
        if (m === hashMove) s = 1 << 30;
        else if (cap || ((m >> 17) & F_EP)) s = (1 << 24) + (cap ? VALUE[cap & 7] : 100) * 16 - (b[m & 127] & 7) + (promo ? 8000 : 0);
        else if (promo) s = (1 << 23) + promo;
        else if (m === killers[ply * 2]) s = 1 << 22;
        else if (m === killers[ply * 2 + 1]) s = (1 << 22) - 1;
        else s = hist[b[m & 127] * 128 + to];
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
    function hasPieces(us) {
      for (let sq = 0; sq < 120; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const pc = b[sq];
        if (pc && (pc & 8) === us && (pc & 7) > P && (pc & 7) < K) return true;
      }
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
      if (half >= 100 || repeats()) return 0;
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
      if (canNull && !check && depth >= 3 && beta < MATE - 500 && hasPieces(us) && evaluate() >= beta) {
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
              if (!b[(m >> 7) & 127] && !((m >> 14) & 7)) {
                if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
                const h = b[m & 127] * 128 + ((m >> 7) & 127);
                hist[h] += depth * depth;
                if (hist[h] > 1 << 20) for (let k = 0; k < hist.length; k++) hist[k] >>= 1;
              }
              break;
            }
          }
        }
      }
      if (!count) return check ? -MATE + ply : 0;

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
          const k = rootMoves.indexOf(best);
          rootMoves.splice(k, 1); rootMoves.unshift(best);
          lastInfo = { depth, score: roundScore, nodes };
        }
        if (stopped || roundScore > MATE - 500 || roundScore < -MATE + 500) break;
      }
      return best;
    }

    return {
      START, setFen, fen, load, make, unmake, perft, think, status, san, uci, fromUci, evaluate,
      moves: legalMoves, inCheck, repeats,
      at: (sq) => b[sq],
      turn: () => (side ? "b" : "w"),
      kingSq: (color) => king[color === "b" ? 1 : 0],
      get info() { return lastInfo; },
    };
  }

  createEngine.START = START;
  root.ChessEngine = createEngine;

  // ====================================================
  // WORKER HOOKUP: when this file runs in a worker, it answers "think" requests
  // ====================================================
  if (typeof document === "undefined" && typeof root.postMessage === "function") {
    const eng = createEngine();
    root.onmessage = (e) => {
      const d = e.data || {};
      let move = "";
      if (eng.load(d.fen || START, d.moves || [])) move = eng.uci(eng.think(d.opts));
      root.postMessage({ id: d.id, move });
    };
  }
})(typeof self !== "undefined" ? self : this);

/* =====================================================================
   machines-space.js: the spaceship of the ProMachines cycle (machines.js
   holds the framework; machines-sky.js the fighter). Plain browser
   script; loads after machines-sky.js (also in Node). Its "starship"
   replaces the older, unmeasured one defined there (the later definition
   wins).

     starship  a Starship-like upper stage (the ship, Block 2 as flown in
               2025), built from measurements: the published length (52.1
               m), diameter (9 m), ring height and Raptor nozzle sizes, and
               the outline traced in metres on photos of Ships 33, 35 and
               36 (the engine layout on Ship 25). A 9 m stainless-steel
               cylinder with a blunt tangent-ogive nose, two forward flaps
               (140 deg apart, both turned 20 deg toward the leeward side)
               and two aft flaps, the black heat-shield tiles over the
               windward side (the whole nose cap; round the nose only
               windward of the forward flaps' hinges, with a short cheek
               behind each flap; on the barrel a little past the aft
               flaps' hinge plane; the windward faces and edges of the
               flaps), the aft flaps' hinge fairings, and on the leeward
               steel the payload door's slot, the two long raceways and
               the faint weld seams of the steel rings. In the open skirt
               six Raptors: three sea-level engines in the middle, three
               vacuum engines with big bells round them, their exits flush
               with the skirt. It flies nose first with all six engines
               lit; the flaps trim a little.

   The ship lies along x (nose -x) with its steel (leeward) side toward the
   viewer: the flaps stand in the plane of the screen, so their planform
   and the round hull both read, and the black tiles show where they wrap
   round to that side (the cap, the cheeks, the flaps' edges), as in
   photos of the ships taken from that side. It is seen nearly side-on
   (yaw 0.1): turned further, the page's close perspective camera makes
   the 9 m cylinder taper like a cone and the forward flaps look bigger
   than the aft ones.
   No brand marks: no logos, flags, numbers or names on any machine.
   ===================================================================== */
(function (G) {
  "use strict";
  const PM = G.ProMachines;
  if (!PM || typeof PM.defineMode !== "function") return;
  const PI = Math.PI, TAU = 2 * Math.PI, DEG = PI / 180;

  /* ------------------------------------------------------------------
     The measured ship (metres). Frame of the tables: x from the nose tip
     (0) to the skirt bottom (52.1); rho = distance from the ship's axis;
     th = the angle round the axis from the leeward centre line (0) toward
     the starboard side (+90 deg, where the starboard flaps are hinged),
     the windward centre line at 180 deg.
     In the machine frame: x = (x - 26.05) * K, the axis at y = YC, z = 0;
     the leeward side faces +z (the viewer), starboard is up (+y).
     ------------------------------------------------------------------ */
  const LEN = 52.1, K = 3.75 / LEN, XC = LEN / 2, YC = -0.25;
  const RB = 4.505;                       // barrel radius (traced 9.009 m across; published 9 m)
  const ROLL = 0;                         // roll about the axis (radians; + turns the leeward side up, the tiles show below)
  // the hull's side profile [x, rho]: a blunt tip cap (sphere radius 0.87 m), a tangent ogive to 13.663 m, the barrel
  const HULL = [[0, 0], [0.05, 0.291], [0.1, 0.405], [0.15, 0.488], [0.2, 0.555], [0.25, 0.58], [0.5, 0.737], [1, 1.041],
    [1.5, 1.329], [2, 1.602], [2.5, 1.86], [3, 2.104], [3.5, 2.334], [4, 2.552], [4.5, 2.756], [5, 2.948], [5.5, 3.127],
    [6, 3.295], [6.5, 3.451], [7, 3.596], [7.5, 3.729], [8, 3.852], [8.5, 3.963], [9, 4.064], [9.5, 4.154], [10, 4.234],
    [10.5, 4.303], [11, 4.362], [11.5, 4.41], [12, 4.449], [12.5, 4.478], [13, 4.496], [13.5, 4.504], [13.663, 4.505], [LEN, 4.505]];
  const XN = 13.663;                      // where the nose meets the barrel
  const RING = 1.83;                      // the steel rings' height (the barrel is 21 rings)
  // The black tiles, as the edge's angle from the leeward centre line (tiled beyond it), measured on leeward
  // photos of Ships 33 and 35 (Block 2), each photo's viewing angle fixed by its forward flaps' tips and its
  // payload door (centred on the leeward line): the nose cap all round to 3.5 m; along the forward flaps the
  // tiles stop at the flaps' hinges (70 deg), the nose between them bare steel; behind each flap a cheek of
  // tiles reaches in to about 55 deg (9.3 to 12.8 m); on the barrel the edge lies a little leeward of the aft
  // flaps' hinge plane (about 80 deg; the tiles wrap past the hinges, black over them)
  const TILE = { cap: 3.5, hinge: 70 * DEG, cheek: 55 * DEG, barrel: 80 * DEG, c0: 9.3, c1: 9.9, c2: 10.6, c3: 12.8 };
  const TILE_CAP = TILE.cap;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function tileEdge(x) {
    if (x < TILE.cap) return 0;
    if (x < TILE.c0) return TILE.hinge;
    if (x < TILE.c2) return TILE.hinge + (TILE.cheek - TILE.hinge) * smooth(TILE.c0, TILE.c1, x);
    return TILE.cheek + (TILE.barrel - TILE.cheek) * smooth(TILE.c2, TILE.c3, x);
  }
  // forward flaps (Block 2): hinged 70 deg from the leeward centre line (140 deg apart); their true planform
  // [x, rho]: leading edge from the nose at 3.5 m to the tip corner, the tip edge parallel to the axis, the
  // trailing edge back to the hull at 9.82 m, and the root along the nose
  const FWD = { th: 70 * DEG, le0: [3.5, 2.334], le1: [8.43, 7.61], te1: [10.53, 7.61], te0: [9.82, 4.206], t0: 0.45, t1: 0.25 };
  // aft flaps: hinged in the plane through the axis (90 deg), leading edge from the hull at 38.2 m to the tip
  // corner at 44.7 m, 8.17 m from the axis (16.34 m tip to tip), the tip edge and the bottom edge to the skirt
  // bottom; about 0.6 m thick at the root and 0.3 m at the tip (estimated)
  const AFT = { th: 90 * DEG, le0: [38.2, RB], le1: [44.7, 8.17], te1: [LEN, 8.17], te0: [LEN, RB], t0: 0.6, t1: 0.3 };
  // their hinge fairings: from 38.0 m to the base, standing to rho 4.9 m; tiled (black) like the hinge line
  const FAIR = { x0: 38.0, x1: LEN, h: 0.4, hw: 0.45 };
  // the payload door (Block 2, for Starlink): a slot with round ends across the leeward steel, centred on the
  // leeward line, about 7.3 m wide seen straight on (published; +-54 deg) and 1 m tall, 15.6 to 16.6 m from the
  // tip (measured on Ship 35); drawn at the tiles' density, so it reads as a dark slot
  const DOOR = { x0: 15.6, x1: 16.6, half: 54 * DEG };
  // the two long raceways on the leeward steel, from just behind the door to the aft section (16.9 to 46.8 m),
  // at -23 and +12 deg (measured on Ships 33 and 35, whose photos do not tell port from starboard), about 0.4
  // m wide and standing 0.25 m off the skin
  const RACE = { x0: 16.9, x1: 46.8, at: [-23 * DEG, 12 * DEG], hw: 0.2, dr: 0.25 };
  // the six Raptors (rear view, [starboard, leeward] from the axis; exits flush with the skirt bottom):
  // three vacuum engines (exit 2.3 m, 4.6 m tall) 3.1 m from the axis, one on the port flap line, and three
  // sea-level engines (exit 1.3 m, 3.1 m tall) 0.87 m from the axis, turned 60 deg
  const RVAC = { re: 1.15, top: LEN - 4.6, at: [[-3.10, 0], [1.55, -2.685], [1.55, 2.685]] };
  const RSL = { re: 0.65, top: LEN - 3.1, at: [[0.87, 0], [-0.435, 0.753], [-0.435, -0.753]] };
  // the engine bay: the aft dome above the engines (its rim at x0, bulging 1 m toward the base), the skirt's
  // bottom rim (inner radius rin)
  const BAY = { x0: 46.6, dome: 1.0, rin: 4.42 };
  // a bell glows hot only where it lies at least this far inside the skin: nearer, the page's depth test (it
  // lets through what lies within about 0.7 m behind the surface at this scale) would show it red through the
  // skirt; there it is only warmed (pale, like the skin's own dots)
  const GLOW_CLEAR = 0.85, GLOW_DIM = 0.3;

  /* ------------------------------------------------------------------
     Geometry (authoring only: runs once, when the rig is built)
     ------------------------------------------------------------------ */
  // monotone cubic through [[x, y], ...], flat outside
  function curve(pts) {
    const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const h = [], m = [], d = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / h[i]; }
    d[0] = m[0]; d[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) d[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * d[lo] + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h[lo] * d[lo + 1];
    };
  }
  // the hull radius, tabulated every 2 mm along the nose: r and r * dr/dx (from a curve through r^2, smooth at
  // the blunt tip, where r * dr/dx stays finite and the normal turns to face straight ahead)
  const HT_N = 7000, HT_X = 14.0, HS = { r: 0, rr: 0 };
  let HT = null;
  function hullR(x) {
    if (!HT) {
      const r2 = curve(HULL.filter((p) => p[0] <= HT_X + 1).map((p) => [p[0], p[1] * p[1]]));
      HT = new Float64Array((HT_N + 1) * 2);
      for (let i = 0; i <= HT_N; i++) {
        const xi = HT_X * i / HT_N, a = Math.max(0, xi - 1e-3), b = Math.min(HT_X, xi + 1e-3);
        HT[i * 2] = Math.sqrt(Math.max(0, r2(xi))); HT[i * 2 + 1] = 0.5 * (r2(b) - r2(a)) / (b - a);
      }
    }
    if (x >= XN) { HS.r = RB; HS.rr = 0; return HS; }
    let f = x / HT_X * HT_N;
    f = f < 0 ? 0 : f > HT_N - 1e-9 ? HT_N - 1e-9 : f;
    const i = f | 0, w = f - i, o = i * 2;
    HS.r = HT[o] + (HT[o + 2] - HT[o]) * w; HS.rr = HT[o + 1] + (HT[o + 3] - HT[o + 1]) * w;
    return HS;
  }
  // a surface that writes its own outward normal in q[3..5]
  function analytic(sh) { for (const pt of sh) if (pt && pt.p && pt.p.nrm === false) pt.p.nrm = true; return sh; }
  const fnOf = (a) => (typeof a === "function" ? a : () => a);
  // a band of the hull from x0 to x1 between the angles a0 .. a1 (radians; numbers or functions of x),
  // dr: drawn that far off the skin (metres); null where it has no width
  function hullBand(S, x0, x1, a0, a1, o) {
    o = o || {};
    const fa0 = fnOf(a0), fa1 = fnOf(a1), dr = o.dr || 0;
    let span = 0;
    for (let i = 0; i <= 40; i++) { const x = x0 + (x1 - x0) * i / 40; span = Math.max(span, fa1(x) - fa0(x)); }
    if (!(span > 1e-4) || !(x1 - x0 > 1e-4)) return null;
    const gv = o.gv || Math.max(3, Math.min(60, Math.round((x1 - x0) * (x0 < XN ? 3 : 1.2)))), gu = o.gu || Math.max(3, Math.min(40, Math.round(span * 10)));
    // (its ends a hair inside x0 .. x1: a band cut at a knot, where its angles jump, takes them from its own side)
    const e = Math.min(1e-4, (x1 - x0) * 1e-3), xa = x0 + e, xl = x1 - x0 - 2 * e;
    return analytic(S.param(function (u, v, q) {
      const x = xa + xl * v, A0 = fa0(x), A1 = Math.max(A0, fa1(x)), th = A0 + (A1 - A0) * u, h = hullR(x), r = h.r + dr;
      const s = Math.sin(th), c = Math.cos(th);
      q[0] = x; q[1] = r * s; q[2] = r * c;
      q[3] = -h.rr; q[4] = h.r * s; q[5] = h.r * c;
      if (h.r < 1e-6) { q[3] = -1; q[4] = 0; q[5] = 0; }
    }, { gu, gv, w: o.w, heat: o.heat, glow: o.glow }));
  }
  // A lane: the hull from x0 to x1, made of bands (each { a0, a1: angles, numbers or functions of x; w: its
  // density weight; x0, x1: where along the hull it lies, if not all of it; knots: where its angles change
  // fast, so its patches are cut there; dr: drawn that far off the skin; seams: the steel rings' weld seams drawn
  // as thin lines, narrow bands of the extra weight seams.w at the positions seams.at }), cut along x into pieces
  // in proportion to the weights of the entries [part, weight], in order (by area: square metres times the
  // weights). Returns [[part, shape, xa, xb], ...].
  function lane(S, x0, x1, bands, entries) {
    const n = 5000, dx = (x1 - x0) / n, cum = new Float64Array(n + 1), A0 = bands.map((b) => fnOf(b.a0)), A1 = bands.map((b) => fnOf(b.a1));
    // the seams' extra weight at x (their positions sorted)
    const seamW = (sm, x) => {
      for (const xs of sm.at) { if (xs - sm.hw > x) break; if (x - xs < sm.hw) return sm.w; }
      return 0;
    };
    for (let i = 1; i <= n; i++) {
      const x = x0 + dx * (i - 0.5), h = hullR(x), r = h.r, ds = Math.sqrt(r * r + h.rr * h.rr) * dx / Math.max(1e-9, r);
      let a = 0, sm = null, sw = 0;
      for (let j = 0; j < bands.length; j++) {
        const b = bands[j];
        if ((b.x0 != null && x < b.x0) || (b.x1 != null && x > b.x1)) continue;
        if (b.seams && b.seams !== sm) { sm = b.seams; sw = seamW(sm, x); }
        a += Math.max(0, A1[j](x) - A0[j](x)) * (r + (b.dr || 0)) * ((b.w == null ? 1 : b.w) + (b.seams ? sw : 0));
      }
      cum[i] = cum[i - 1] + a * ds;
    }
    const xAt = (A) => {
      let lo = 0, hi = n;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < A) lo = m; else hi = m; }
      return x0 + dx * (lo + Math.min(1, Math.max(0, (A - cum[lo]) / Math.max(1e-12, cum[hi] - cum[lo]))));
    };
    let tw = 0;
    for (const e of entries) tw += e[1];
    const out = [];
    let acc = 0, xa = x0;
    for (let k = 0; k < entries.length; k++) {
      acc += entries[k][1] / tw * cum[n];
      const xb = k === entries.length - 1 ? x1 : Math.min(x1, xAt(acc));
      if (xb > xa + 1e-6) {
        const sh = [];
        for (const b of bands) {
          const ba = Math.max(xa, b.x0 == null ? xa : b.x0), bb = Math.min(xb, b.x1 == null ? xb : b.x1);
          if (!(bb > ba + 1e-6)) continue;
          // the band's pieces between its knots
          const cuts = [ba];
          for (const kx of b.knots || []) if (kx > ba + 1e-6 && kx < bb - 1e-6) cuts.push(kx);
          cuts.push(bb);
          for (let c = 0; c + 1 < cuts.length; c++) {
            const pa = cuts[c], pb = cuts[c + 1];
            sh.push(hullBand(S, pa, pb, b.a0, b.a1, { w: b.w, dr: b.dr, heat: b.heat, glow: b.glow, gu: b.gu, gv: b.gvPerM ? Math.max(3, Math.round((pb - pa) * b.gvPerM)) : null }));
            if (b.seams) for (const xs of b.seams.at) {
              const sa = Math.max(pa, xs - b.seams.hw), sb = Math.min(pb, xs + b.seams.hw);
              if (sb > sa + 1e-4) sh.push(hullBand(S, sa, sb, b.a0, b.a1, { w: b.seams.w, dr: 0.004, gv: 1, gu: 24, heat: b.heat, glow: b.glow }));
            }
          }
        }
        out.push([entries[k][0], S.join(sh.filter(Boolean)), xa, xb]);
      }
      xa = xb;
    }
    return out;
  }
  // A flap: a plate in the plane through the axis at the angle th, its planform a polygon [x, rho] (the root
  // along the hull may be a curve) that every line rho = const crosses once, the thickness falling from t0 at
  // the root to t1 at the tip. Returns its faces (lee: the one toward the leeward side, wind: the other) and
  // the strips along its free edges (the edge from vertex i to i + 1 for i in free).
  function flap(S, poly, free, th, t0, t1, o) {
    o = o || {};
    let r0 = 1e9, r1 = -1e9;
    for (const p of poly) { r0 = Math.min(r0, p[1]); r1 = Math.max(r1, p[1]); }
    const NT = 400, span = new Float64Array((NT + 1) * 2);
    for (let i = 0; i <= NT; i++) {
      const rho = r0 + (r1 - r0) * Math.min(1 - 1e-9, Math.max(1e-9, i / NT));
      let a = 1e9, b = -1e9;
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length];
        if ((p[1] - rho) * (q[1] - rho) > 0 || p[1] === q[1]) continue;
        const x = p[0] + (q[0] - p[0]) * (rho - p[1]) / (q[1] - p[1]);
        a = Math.min(a, x); b = Math.max(b, x);
      }
      span[i * 2] = a; span[i * 2 + 1] = Math.max(a, b);
    }
    const sn = Math.sin(th), cs = Math.cos(th), sl = sn > 0 ? -1 : 1;   // sl: the leeward face's side
    const thick = (x, rho) => { const h = hullR(Math.min(x, XN)).r, tip = r1 - h; return t0 + (t1 - t0) * Math.min(1, Math.max(0, (rho - h) / Math.max(1e-6, tip))); };
    const at = (x, rho, s, q) => { const t = thick(x, rho) / 2 * s; q[0] = x; q[1] = rho * sn + t * cs; q[2] = rho * cs - t * sn; return q; };
    const face = (s, w) => analytic(S.param(function (u, v, q) {
      const f = v * NT, i = f >= NT ? NT - 1 : f | 0, ww = f - i;
      const a = span[i * 2] + (span[i * 2 + 2] - span[i * 2]) * ww, b = span[i * 2 + 1] + (span[i * 2 + 3] - span[i * 2 + 1]) * ww;
      at(a + (b - a) * u, r0 + (r1 - r0) * v, s, q);
      q[3] = 0; q[4] = s * cs; q[5] = -s * sn;
    }, { gu: o.gu || 16, gv: o.gv || 16, w, heat: o.heat, glow: o.glow }));
    const edges = [], A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0], D = [0, 0, 0];
    let cx = 0, cr = 0;
    for (const p of poly) { cx += p[0] / poly.length; cr += p[1] / poly.length; }
    for (const k of free) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      at(p[0], p[1], -1, A); at(q[0], q[1], -1, B); at(p[0], p[1], 1, C); at(q[0], q[1], 1, D);
      // outward: away from the planform's middle
      const mx = (p[0] + q[0]) / 2 - cx, mr = (p[1] + q[1]) / 2 - cr, ex = q[0] - p[0], er = q[1] - p[1];
      const out = (er * mx - ex * mr) * (sl > 0 ? 1 : -1) * (sn > 0 ? 1 : -1);
      edges.push(out >= 0 ? S.quad(A.slice(), B.slice(), C.slice(), D.slice(), { w: o.we }) : S.quad(B.slice(), A.slice(), D.slice(), C.slice(), { w: o.we }));
    }
    return { lee: face(sl, o.wl), wind: face(-sl, o.ww), edges: S.join(edges) };
  }
  // the planforms: forward flap (its root along the nose, every 0.25 m) and aft flap
  function fwdPoly() {
    const P = [FWD.le0, FWD.le1, FWD.te1, FWD.te0];
    for (let x = FWD.te0[0] - 0.25; x > FWD.le0[0] + 0.01; x -= 0.25) P.push([x, hullR(x).r]);
    return P;
  }
  const aftPoly = () => [AFT.le0, AFT.le1, AFT.te1, AFT.te0];
  // a hinge fairing along x at the angle th: a half-round section h tall and 2 hw wide standing on the hull,
  // its front end rounded off over 1.5 m
  function fairing(S, F, th, o) {
    o = o || {};
    const sn = Math.sin(th), cs = Math.cos(th), L = 1.5;
    return analytic(S.param(function (u, v, q) {
      const x = F.x0 + (F.x1 - F.x0) * v, ph = -PI / 2 + PI * u, k = Math.sqrt(Math.max(0, Math.min(1, (x - F.x0) / L) * (2 - Math.min(1, (x - F.x0) / L))));
      const e = Math.cos(ph) * F.h * k, t = Math.sin(ph) * F.hw * Math.max(0.15, k), rho = RB - 0.02 + e;
      q[0] = x; q[1] = rho * sn + t * cs; q[2] = rho * cs - t * sn;
      q[3] = 0; q[4] = Math.cos(ph) / F.h * sn + Math.sin(ph) / F.hw * cs; q[5] = Math.cos(ph) / F.h * cs - Math.sin(ph) / F.hw * sn;
    }, { gu: o.gu || 10, gv: o.gv || 30, w: o.w, heat: o.heat, glow: o.glow }));
  }
  // an engine at [starboard, leeward] = c: the powerhead from its top to the throat (a short drum), then the
  // bell from the throat (radius rt) to the exit (radius re) at the skirt bottom, outer and inner walls. The
  // inside glows hot when it burns where it lies GLOW_CLEAR or more inside the skin, and only warms nearer it
  // (the bell is cut into sectors round its axis and bands along it, each lit or not); the outside, close to
  // the skirt, never glows.
  function engine(S, c, top, xt, rt, re, ph, o) {
    o = o || {};
    const y0 = c[0], z0 = c[1], L = LEN - xt, NSEC = 12, NB = 4;
    const prof = (s) => rt + (re - rt) * Math.pow(s, 0.62);
    const dprof = (s) => (re - rt) * 0.62 * Math.pow(Math.max(s, 1e-3), -0.38) / L;
    const piece = (inner, u0, u1, s0, s1, w, glow) => analytic(S.param(function (u, v, q) {
      const a = TAU * (u0 + (u1 - u0) * u), s = s0 + (s1 - s0) * v, x = xt + L * s, r = prof(s) * (inner ? 0.965 : 1), ca = Math.cos(a), sa = Math.sin(a), sg = inner ? -1 : 1;
      q[0] = x; q[1] = y0 + r * sa; q[2] = z0 + r * ca;
      q[3] = -dprof(s) * sg; q[4] = sa * sg; q[5] = ca * sg;
    }, { gu: Math.max(2, Math.round(28 * (u1 - u0))), gv: Math.max(2, Math.round(12 * (s1 - s0))), w, heat: o.heat, glow }));
    // the farthest a piece of the bell reaches from the ship's axis
    const reach = (u0, u1, s1) => {
      let m = 0;
      for (let k = 0; k <= 8; k++) { const a = TAU * (u0 + (u1 - u0) * k / 8), r = prof(s1); m = Math.max(m, Math.hypot(y0 + r * Math.sin(a), z0 + r * Math.cos(a))); }
      return m;
    };
    const inner = [], outer = piece(false, 0, 1, 0, 1, o.wo == null ? o.w : o.wo, 0);
    for (let i = 0; i < NSEC; i++) for (let j = 0; j < NB; j++) {
      const u0 = i / NSEC, u1 = (i + 1) / NSEC, s0 = j / NB, s1 = (j + 1) / NB;
      inner.push(piece(true, u0, u1, s0, s1, o.w, reach(u0, u1, s1) <= RB - GLOW_CLEAR ? 1 : GLOW_DIM));
    }
    const drum = analytic(S.param(function (u, v, q) {
      const a = TAU * u, x = top + (xt - top) * v, r = ph * (1 - 0.35 * v), ca = Math.cos(a), sa = Math.sin(a);
      q[0] = x; q[1] = y0 + r * sa; q[2] = z0 + r * ca; q[3] = 0.35 * ph / Math.max(1e-6, xt - top); q[4] = sa; q[5] = ca;
    }, { gu: 16, gv: 4, w: o.wd == null ? o.w : o.wd, heat: o.heat, glow: 0 }));
    return { outer, inner: S.join(inner), drum };
  }
  // the engine bay, seen only from behind: the aft dome over the engines and the skirt's bottom rim
  function dome(S, a0, a1, o) {
    o = o || {};
    return analytic(S.param(function (u, v, q) {
      const a = a0 + (a1 - a0) * u, s = Math.sin(v * PI / 2), r = BAY.rin * s, c = Math.cos(v * PI / 2), x = BAY.x0 + BAY.dome * c;
      q[0] = x; q[1] = r * Math.sin(a); q[2] = r * Math.cos(a);
      // outward on the engines' side: the ellipse's gradient (x / dome^2, r / rin^2)
      q[3] = c / BAY.dome; q[4] = s / BAY.rin * Math.sin(a); q[5] = s / BAY.rin * Math.cos(a);
    }, { gu: o.gu || 24, gv: o.gv || 8, w: o.w, heat: o.heat, glow: o.glow }));
  }
  function rim(S, a0, a1, o) {
    o = o || {};
    return analytic(S.param(function (u, v, q) {
      const a = a0 + (a1 - a0) * u, r = BAY.rin + (RB - BAY.rin) * v;
      q[0] = LEN; q[1] = r * Math.sin(a); q[2] = r * Math.cos(a); q[3] = 1; q[4] = 0; q[5] = 0;
    }, { gu: o.gu || 48, gv: 2, w: o.w, heat: o.heat, glow: o.glow }));
  }

  /* ------------------------------------------------------------------
     The parts. Everything is drawn in metres in the ship's frame above and
     placed into the machine frame (scale K, the roll, the axis at YC).
     The rig's parts (L: starboard, up; R: port, down):
       neck       the nose cap (tiles)
       scapL/R    the forward flaps              flankL/R  the aft flaps' leeward faces
       haunchL/R  the aft flaps' tiled faces and edges (they ride on flankL/R)
       hl_up/hr_up            the aft flaps' hinge fairings
       hl_paw, hr_paw, fl_paw the vacuum Raptors (fl: the one on the port flap line)
       hl_lo, hr_lo, fl_lo    the sea-level Raptors (fl: the one on the starboard flap line)
       fr_paw     the aft dome                   fr_lo  the skirt's bottom rim
     and every one of them (but the flaps) a ring section of the hull behind
     the cap, its steel (the nose's, between the forward flaps; the barrel's,
     with the door, the raceways and the weld seams) and its tiles, front to
     back as listed in AL.RING (chest, belly, hips, head, jaw and the mane,
     back and tail plates are only that). The sections' sizes are chosen so
     that every part gets about the share of the points the other machines
     give it.
     ------------------------------------------------------------------ */
  const ENG = ["fl_paw", "hr_paw", "hl_paw", "fl_lo", "hl_lo", "hr_lo"];     // the engines' parts
  const SHIP_AT = [-XC * K, YC, 0];
  const SHIP_R = [1, 0, 0, 0, Math.cos(ROLL), Math.sin(ROLL), 0, -Math.sin(ROLL), Math.cos(ROLL)];
  const toM = (p) => [(p[0] - XC) * K, YC + K * (p[1] * Math.cos(ROLL) + p[2] * Math.sin(ROLL)), K * (p[2] * Math.cos(ROLL) - p[1] * Math.sin(ROLL))];
  // How the surfaces are shared out among the rig's parts (tuned so that every part gets about the share of
  // the points the other machines give it: the report shows the densities alike): the hull behind the cap is
  // cut into ring sections (steel and tiles) in proportion to these weights, front to back.
  const AL = {
    RING: [["head", 50.59], ["jaw", 23.40], ["neck", 8.63], ["maneL1", 24.30], ["maneR1", 41.75],
      ["chest", 76.30], ["maneL2", 26.43],
      ["maneR2", 41.75], ["back1", 23.40], ["belly", 76.61],
      ["back2", 50.67], ["maneL3", 28.05], ["maneR3", 41.90], ["back3", 23.37],
      ["tail1", 32.97], ["hips", 67.91], ["tail2", 31.57], ["tail3", 27.66], ["tail4", 17.48], ["hl_up", 22.59], ["hr_up", 22.65],
      ["fr_lo", 20.95], ["fl_up", 14.00], ["fr_up", 13.96],
      ["fl_lo", 19.50], ["hl_lo", 20.87], ["hr_lo", 20.91], ["fr_paw", 16.52], ["fl_paw", 15.98], ["hl_paw", 33.45], ["hr_paw", 33.35]],
    // density weights (steel = 1). The tiles are drawn sparser, so they read black: those the usual view sees
    // sparsest (TC the nose cap, seen at a slant; TN the nose's round the forward flaps and the aft flaps' hinge
    // fairings; TD the door's slot), those it does not see denser (TB the barrel's windward side, TE the same
    // over the engine bay, where the glowing bells lie behind it; the flaps' windward faces), so that a visitor
    // who turns the ship does not see through them to the far side
    TN: 0.28, TC: 0.24, TB: 0.5, TE: 0.7, TD: 0.35,
    SEAM: { hw: 0.045, w: 1.2 },    // the weld seams: 9 cm wide lines of 2.2 times the steel's density
    RW: 1.4,                        // the raceways
    WD: 0.15,                       // the aft dome (seen only from behind)
    FW: { ww: 0.56, we: 0.45 },     // the flaps' tiled faces and edges (forward / aft): denser than the hull's tiles,
    AW: { wl: 0.95, ww: 0.4, we: 0.45 },  // so the flaps get their share; their windward faces are on the far side
    WE: [0.1, 0.5, 0.1],            // the engines (seen only from behind): bells' outer walls, inner walls, powerheads
  };
  function shipParts(S, H) {
    const SH = {}, PV = {}, PA = {};
    const add = (name, sh, pivot) => { if (!sh) return; (SH[name] = SH[name] || []).push(sh); if (pivot && !PV[name]) PV[name] = pivot; };
    const E = tileEdge, nE = (x) => -tileEdge(x);
    // ---- the nose cap: tiles all round (neck) ----
    add("neck", hullBand(S, 0, TILE_CAP, -PI, PI, { w: AL.TC }), [1.5, 0, 0]);
    // ---- the hull behind the cap in ring sections: the leeward steel between the tiles' edges (with the door's
    // slot cut out of it, the weld seams on the barrel), the tiles beyond (sparser on the nose, which the usual
    // view sees at its edges, than on the barrel's windward side), the raceways on top of the steel (a ring
    // section in an engine's part does not glow with the engine) ----
    const seams = { at: [], hw: AL.SEAM.hw, w: AL.SEAM.w };
    for (let k = 0; XN + k * RING < LEN - 0.5; k++) seams.at.push(XN + k * RING);
    const dh = (DOOR.x1 - DOOR.x0) / 2, dxc = (DOOR.x0 + DOOR.x1) / 2, dHalf = DOOR.half * RB;
    // the door's half-angle at x: a slot with round ends (in arc length round the barrel)
    const door = (x) => {
      const e = x - dxc;
      if (!(Math.abs(e) < dh)) return 0;
      return (dHalf - dh + Math.sqrt(Math.max(0, dh * dh - e * e))) / RB;
    };
    const KN = [TILE.c0, TILE.c1, TILE.c2, TILE.c3, XN, DOOR.x0, DOOR.x1];
    const bands = [
      { a0: nE, a1: (x) => -door(x), w: 1, seams, knots: KN, gvPerM: 4 },
      { a0: (x) => -door(x), a1: door, w: AL.TD, x0: DOOR.x0, x1: DOOR.x1, gvPerM: 14, gu: 24 },
      { a0: door, a1: E, w: 1, seams, knots: KN, gvPerM: 4 },
      { a0: E, a1: (x) => TAU - E(x), w: AL.TN, x1: XN, knots: KN, gvPerM: 4 },
      { a0: E, a1: (x) => TAU - E(x), w: AL.TB, x0: XN, x1: BAY.x0 - 0.6 },
      { a0: E, a1: (x) => TAU - E(x), w: AL.TE, x0: BAY.x0 - 0.6 },
    ];
    for (const a of RACE.at) {
      const hw = RACE.hw / (RB + RACE.dr);
      bands.push({ a0: a - hw, a1: a + hw, w: AL.RW, dr: RACE.dr, x0: RACE.x0, x1: RACE.x1, gu: 3 });
    }
    for (const [n, sh, xa, xb] of lane(S, TILE_CAP, LEN, bands, AL.RING)) add(n, ENG.indexOf(n) >= 0 ? S.tag(sh, { glow: 0 }) : sh, [(xa + xb) / 2, 0, hullR((xa + xb) / 2).r]);
    // ---- the flaps (L: starboard, up; R: port, down): their faces and edges; the aft flaps' hinge fairings ----
    const fp = fwdPoly(), ap = aftPoly();
    for (const [sd, sg] of [["L", 1], ["R", -1]]) {
      const f = flap(S, fp, [0, 1, 2], sg * FWD.th, FWD.t0, FWD.t1, AL.FW);
      add("scap" + sd, S.join(f.lee, f.wind, f.edges), [FWD.te0[0], sg * FWD.te0[1] * Math.sin(FWD.th), FWD.te0[1] * Math.cos(FWD.th)]);
      const a = flap(S, ap, [0, 1, 2], sg * AFT.th, AFT.t0, AFT.t1, Object.assign({ gu: 18, gv: 12 }, AL.AW));
      const hinge = [(AFT.le0[0] + LEN) / 2, sg * (RB + 0.2), 0];
      add("flank" + sd, a.lee, hinge);
      add("haunch" + sd, S.join(a.wind, a.edges), hinge); PA["haunch" + sd] = "flank" + sd;
      const up = (sg > 0 ? "hl" : "hr") + "_up";
      add(up, fairing(S, FAIR, sg * AFT.th, { w: AL.TN }), [(FAIR.x0 + LEN) / 2, sg * (RB + 0.3), 0]);
    }
    // ---- the engines: vacuum Raptors (paw), sea-level Raptors (lo); their pivots at the centres of their exits ----
    const eng = (name, c, big) => {
      const o = { w: AL.WE[1], wo: AL.WE[0], wd: AL.WE[2] }, e = big ? engine(S, c, RVAC.top, RVAC.top + 1.1, 0.22, RVAC.re, 0.55, o) : engine(S, c, RSL.top, RSL.top + 1.0, 0.16, RSL.re, 0.42, o);
      add(name, S.join(e.outer, e.inner, e.drum));
      PV[name] = [LEN, c[0], c[1]];       // (the exhaust leaves from the pivot)
    };
    eng("fl_paw", RVAC.at[0], true); eng("hr_paw", RVAC.at[1], true); eng("hl_paw", RVAC.at[2], true);
    eng("fl_lo", RSL.at[0], false); eng("hl_lo", RSL.at[1], false); eng("hr_lo", RSL.at[2], false);
    // ---- the engine bay (seen from behind, through the open skirt, whose skin is its wall): the aft dome over the
    // engines (fr_paw, which also has its ring section), the skirt's bottom rim ----
    add("fr_paw", dome(S, -PI, PI, { w: AL.WD }));
    PV.fr_paw = [BAY.x0 + 0.5, 0, 0];
    add("fr_lo", rim(S, -PI, PI), [LEN, 0, 0]);
    // ---- into the machine frame: each part's shapes and its pivot (ship metres) ----
    const P = {};
    for (const name of PM.PARTS) {
      if (!SH[name]) throw new Error("starship: no shape for " + name);
      const at = toM(PV[name] || [XC, 0, 0]);
      const sh = S.place(S.join(SH[name]), SHIP_AT, SHIP_R, K);
      P[name] = { at, rot: null, parent: PA[name] || null, world: true, shape: S.place(sh, [-at[0], -at[1], -at[2]]) };
    }
    return P;
  }

  /* ------------------------------------------------------------------
     The motion: it flies nose first with all six engines lit (their bells
     glow and flicker); the four flaps trim a little, slowly, and are back
     at rest before the dwell ends.
     ------------------------------------------------------------------ */
  const S_DWELL = 5.0;
  // the forward flaps' hinge: the chord of their root, from the leading edge's root to the trailing edge's
  const FAX = (function () {
    const out = {};
    for (const [sd, sg] of [["L", 1], ["R", -1]]) {
      const th = sg * FWD.th, a = toM([FWD.le0[0], FWD.le0[1] * Math.sin(th), FWD.le0[1] * Math.cos(th)]), b = toM([FWD.te0[0], FWD.te0[1] * Math.sin(th), FWD.te0[1] * Math.cos(th)]);
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]);
      out[sd] = [d[0] / L, d[1] / L, d[2] / L];
    }
    return out;
  })();
  function shipAnimate(A, t, age, aim, H) {
    const k = H.smooth(0.3, 1.2, age) * (1 - H.smooth(S_DWELL - 1.3, S_DWELL - 0.45, age));
    if (k > 0) {
      // the aft flaps work together (pitch) with a little difference (roll); the forward ones answer
      const p = Math.sin(t * 0.83 + 0.4), r = Math.sin(t * 0.57 + 2.1);
      A.wr("flankL", 1, 0, 0, (0.11 * p + 0.035 * r) * k);
      A.wr("flankR", 1, 0, 0, -(0.11 * p - 0.035 * r) * k);
      const f = FAX.L, g = FAX.R, q = Math.sin(t * 0.71 + 1.2);
      A.wr("scapL", f[0], f[1], f[2], (0.09 * q - 0.03 * r) * k);
      A.wr("scapR", g[0], g[1], g[2], -(0.09 * q + 0.03 * r) * k);
    }
    // the engines burn: the bells glow hot and flicker
    for (let i = 0; i < ENG.length; i++) A.glow(ENG[i], 0.78 + 0.14 * Math.sin(t * 31.0 + i * 1.7) * Math.sin(t * 13.0 + i * 2.3));
  }
  // The jets, straight back from the exits: three streams, so that the air keeps slots free for the visitor's
  // cursor (the page pushes each jet three times; the air takes twelve pushes a step): the vacuum engine on the
  // port flap line alone, the two starboard vacuum engines as one (from between their exits, the area of both),
  // and the three sea-level engines as one (from the axis, the area of all three)
  const jet = (part, at, re, phase) => ({ part, at, dir: [1, 0, 0], speed: 3.6, nozzle: re * K, heat: 1,
    power: (age, t) => 0.92 + 0.08 * Math.sin(t * 23.0 + phase) * Math.sin(t * 7.0) });

  PM.defineMode({
    name: "starship", kind: "vehicle", yaw: 0.1, dwell: S_DWELL,
    parts: shipParts,
    animate: shipAnimate,
    exhaust: [
      jet("fl_paw", [0, 0, 0], RVAC.re, 0),
      jet("hl_paw", [0, 0, -RVAC.at[2][1] * K], RVAC.re * Math.SQRT2, 2.1),
      jet("fl_lo", [0, -RSL.at[0][0] * K, 0], RSL.re * Math.sqrt(3), 4.2),
    ],
  });
})(typeof window !== "undefined" ? window : globalThis);

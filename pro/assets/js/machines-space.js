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
               windward half (the whole nose cap, the cheeks round the
               forward flaps, the windward faces and edges of the flaps),
               the hinge fairings of the aft flaps, the steel rings'
               weld seams, and in the open skirt six Raptors: three
               sea-level engines in the middle, three vacuum engines with
               big bells round them, their exits flush with the skirt.
               It flies nose first with all six engines lit; the flaps
               trim a little.

   The ship lies along x (nose -x) with its steel (leeward) side toward the
   viewer: the flaps stand in the plane of the screen, so their planform
   and the round hull both read, and the tiles show where they wrap round
   to that side.
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
  const ROLL = 0;                         // roll about the axis (radians; + turns the starboard side toward the viewer)
  // the hull's side profile [x, rho]: a blunt tip cap (sphere radius 0.87 m), a tangent ogive to 13.663 m, the barrel
  const HULL = [[0, 0], [0.05, 0.291], [0.1, 0.405], [0.15, 0.488], [0.2, 0.555], [0.25, 0.58], [0.5, 0.737], [1, 1.041],
    [1.5, 1.329], [2, 1.602], [2.5, 1.86], [3, 2.104], [3.5, 2.334], [4, 2.552], [4.5, 2.756], [5, 2.948], [5.5, 3.127],
    [6, 3.295], [6.5, 3.451], [7, 3.596], [7.5, 3.729], [8, 3.852], [8.5, 3.963], [9, 4.064], [9.5, 4.154], [10, 4.234],
    [10.5, 4.303], [11, 4.362], [11.5, 4.41], [12, 4.449], [12.5, 4.478], [13, 4.496], [13.5, 4.504], [13.663, 4.505], [LEN, 4.505]];
  const XN = 13.663;                      // where the nose meets the barrel
  const RING = 1.83;                      // the steel rings' height (the barrel is 21 rings)
  // the black tiles: the nose cap all round to 3.5 m; then all but a bare band +-30 deg about the leeward
  // centre line to 12.2 m; the edge drops to the aft flaps' hinge plane (90 deg) by 12.8 m and stays there
  const TILE_CAP = 3.5;
  function tileEdge(x) {                  // the edge's angle from the leeward centre line (0: all tiled)
    if (x < TILE_CAP) return 0;
    if (x < 12.2) return 30 * DEG;
    if (x < 12.8) return (30 + 60 * (x - 12.2) / 0.6) * DEG;
    return 90 * DEG;
  }
  // forward flaps (Block 2): hinged 70 deg from the leeward centre line (140 deg apart); their true planform
  // [x, rho]: leading edge from the nose at 3.5 m to the tip corner, the tip edge parallel to the axis, the
  // trailing edge back to the hull at 9.82 m, and the root along the nose
  const FWD = { th: 70 * DEG, le0: [3.5, 2.334], le1: [8.43, 7.61], te1: [10.53, 7.61], te0: [9.82, 4.206], t0: 0.45, t1: 0.25 };
  // aft flaps: hinged in the plane through the axis (90 deg), leading edge from the hull at 38.2 m to the tip
  // corner at 44.7 m, 8.17 m from the axis (16.34 m tip to tip), the tip edge and the bottom edge to the skirt
  // bottom; about 0.6 m thick at the root and 0.3 m at the tip (estimated)
  const AFT = { th: 90 * DEG, le0: [38.2, RB], le1: [44.7, 8.17], te1: [LEN, 8.17], te0: [LEN, RB], t0: 0.6, t1: 0.3 };
  // their hinge fairings: from 38.0 m to the base, standing to rho 4.9 m
  const FAIR = { x0: 38.0, x1: LEN, h: 0.4, hw: 0.45 };
  // the six Raptors (rear view, [starboard, leeward] from the axis; exits flush with the skirt bottom):
  // three vacuum engines (exit 2.3 m, 4.6 m tall) 3.1 m from the axis, one on the port flap line, and three
  // sea-level engines (exit 1.3 m, 3.1 m tall) 0.87 m from the axis, turned 60 deg
  const RVAC = { re: 1.15, top: LEN - 4.6, at: [[-3.10, 0], [1.55, -2.685], [1.55, 2.685]] };
  const RSL = { re: 0.65, top: LEN - 3.1, at: [[0.87, 0], [-0.435, 0.753], [-0.435, -0.753]] };
  // the engine bay: the aft dome above the engines, the skirt's inner wall and its bottom rim
  const BAY = { x0: 46.6, dome: 1.0, rin: 4.42 };
  // the heat-shield tiles are drawn sparser than the steel (they read dark)
  const WT = 0.45;

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
  // where the nose reaches the radius rho (x from 0 to XN)
  function hullX(rho) {
    if (rho >= RB) return XN;
    let lo = 0, hi = XN;
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (hullR(mid).r < rho) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
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
    return analytic(S.param(function (u, v, q) {
      const x = x0 + (x1 - x0) * v, A0 = fa0(x), A1 = Math.max(A0, fa1(x)), th = A0 + (A1 - A0) * u, h = hullR(x), r = h.r + dr;
      const s = Math.sin(th), c = Math.cos(th);
      q[0] = x; q[1] = r * s; q[2] = r * c;
      q[3] = -h.rr; q[4] = h.r * s; q[5] = h.r * c;
      if (h.r < 1e-6) { q[3] = -1; q[4] = 0; q[5] = 0; }
    }, { gu, gv, w: o.w, heat: o.heat, glow: o.glow }));
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
  // bell from the throat (radius rt) to the exit (radius re) at the skirt bottom, outer and inner walls
  function engine(S, c, top, xt, rt, re, ph, o) {
    o = o || {};
    const y0 = c[0], z0 = c[1], L = LEN - xt;
    const prof = (s) => rt + (re - rt) * Math.pow(s, 0.62);
    const dprof = (s) => (re - rt) * 0.62 * Math.pow(Math.max(s, 1e-3), -0.38) / L;
    const bell = (inner) => analytic(S.param(function (u, v, q) {
      const a = TAU * u, s = v, x = xt + L * s, r = prof(s) * (inner ? 0.965 : 1), ca = Math.cos(a), sa = Math.sin(a), sg = inner ? -1 : 1;
      q[0] = x; q[1] = y0 + r * sa; q[2] = z0 + r * ca;
      q[3] = -dprof(s) * sg; q[4] = sa * sg; q[5] = ca * sg;
    }, { gu: o.gu || 28, gv: o.gv || 12, w: o.w, heat: o.heat, glow: o.glow }));
    const drum = analytic(S.param(function (u, v, q) {
      const a = TAU * u, x = top + (xt - top) * v, r = ph * (1 - 0.35 * v), ca = Math.cos(a), sa = Math.sin(a);
      q[0] = x; q[1] = y0 + r * sa; q[2] = z0 + r * ca; q[3] = 0.35 * ph / Math.max(1e-6, xt - top); q[4] = sa; q[5] = ca;
    }, { gu: 16, gv: 4, w: o.w, heat: o.heat, glow: 0 }));
    return { outer: bell(false), inner: bell(true), drum };
  }
  // the engine bay, seen only from behind: the aft dome over the engines (its rim on the skirt's inner wall at
  // x0, bulging dome metres toward the base), the skirt's inner wall from there to the base, its bottom rim
  function dome(S, a0, a1, o) {
    o = o || {};
    return analytic(S.param(function (u, v, q) {
      const a = a0 + (a1 - a0) * u, s = Math.sin(v * PI / 2), r = BAY.rin * s, c = Math.cos(v * PI / 2), x = BAY.x0 + BAY.dome * c;
      q[0] = x; q[1] = r * Math.sin(a); q[2] = r * Math.cos(a);
      // outward on the engines' side: the ellipse's gradient (x / dome^2, r / rin^2)
      q[3] = c / BAY.dome; q[4] = s / BAY.rin * Math.sin(a); q[5] = s / BAY.rin * Math.cos(a);
    }, { gu: o.gu || 24, gv: o.gv || 8, w: o.w, heat: o.heat, glow: o.glow }));
  }
  function skirtWall(S, a0, a1, o) {
    o = o || {};
    return analytic(S.param(function (u, v, q) {
      const a = a0 + (a1 - a0) * u, x = BAY.x0 + (LEN - BAY.x0) * v;
      q[0] = x; q[1] = BAY.rin * Math.sin(a); q[2] = BAY.rin * Math.cos(a); q[3] = 0; q[4] = -Math.sin(a); q[5] = -Math.cos(a);
    }, { gu: o.gu || 24, gv: o.gv || 6, w: o.w, heat: o.heat, glow: o.glow }));
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
     placed into the machine frame by SHIP (scale K, the roll, the axis at
     YC). Where the rig's parts split the surfaces (chosen so that every
     part gets about the share of the points the other machines give it):
       neck      the nose cap (tiles)            head   the nose's steel band
       jaw       the tiled cheeks round the forward flaps (near side)
       maneL1/R1 the nose's far side (tiles), starboard / port
       chest, belly, hips   the leeward steel barrel's middle band, front to back
       maneL2-3 / R2-3      its starboard / port bands
       back1-3, tail1-4     the windward (tiled) barrel, front to back
       scapL/R   the forward flaps          flankL/R + haunchL/R  the aft flaps
                 (L starboard, up; R port)  (the leeward face and edges / the tiled face)
       hl_up/hr_up  the aft flaps' hinge fairings
       hl_paw/hr_paw/fl_paw  the vacuum Raptors   hl_lo/hr_lo/fl_lo  the sea-level Raptors
       fr_paw    the aft dome    fl_up/fr_up  the skirt's inner wall   fr_lo  its bottom rim
     ------------------------------------------------------------------ */
  const SHIP_AT = [-XC * K, YC, 0];
  const SHIP_R = [1, 0, 0, 0, Math.cos(ROLL), Math.sin(ROLL), 0, -Math.sin(ROLL), Math.cos(ROLL)];
  const toM = (p) => [(p[0] - XC) * K, YC + K * (p[1] * Math.cos(ROLL) + p[2] * Math.sin(ROLL)), K * (p[2] * Math.cos(ROLL) - p[1] * Math.sin(ROLL))];
  // where the barrel's bands are split (metres along x; the middle band's half angle)
  const AL = { TC: 45 * DEG, XC1: 26.5, XC2: 39.3, XM: 33, XB: [XN, 19, 25, 31, 37, 43, 48, LEN] };
  function shipParts(S, H) {
    const P = {};
    const place = (sh) => S.place(S.join(sh), SHIP_AT, SHIP_R, K);
    // a part from ship geometry (metres), its pivot at the ship point c (metres)
    const put = (name, c, parent, ...shapes) => {
      const at = toM(c);
      P[name] = { at, rot: null, parent: parent || null, world: true, shape: S.place(place(shapes), [-at[0], -at[1], -at[2]]) };
    };
    const T = { w: WT }, E = tileEdge, nE = (x) => -tileEdge(x), R90 = 90 * DEG;
    // ---- the nose ----
    put("neck", [1.5, 0, 0], null, hullBand(S, 0, TILE_CAP, -PI, PI, T));
    put("head", [8, 0, 3], null, hullBand(S, TILE_CAP, XN, nE, E));
    put("jaw", [8, 0, 3], null, hullBand(S, TILE_CAP, 12.8, E, R90, T), hullBand(S, TILE_CAP, 12.8, -R90, nE, T));
    put("maneL1", [8, 3, -1], null, hullBand(S, TILE_CAP, XN, R90, PI, T));
    put("maneR1", [8, -3, -1], null, hullBand(S, TILE_CAP, XN, -PI, -R90, T));
    // ---- the barrel: the leeward steel (middle band and its sides), the windward tiles ----
    put("chest", [(XN + AL.XC1) / 2, 0, RB], null, hullBand(S, XN, AL.XC1, -AL.TC, AL.TC));
    put("belly", [(AL.XC1 + AL.XC2) / 2, 0, RB], null, hullBand(S, AL.XC1, AL.XC2, -AL.TC, AL.TC));
    put("hips", [(AL.XC2 + LEN) / 2, 0, RB], null, hullBand(S, AL.XC2, LEN, -AL.TC, AL.TC));
    put("maneL2", [(XN + AL.XM) / 2, RB * 0.9, RB * 0.4], null, hullBand(S, XN, AL.XM, AL.TC, R90));
    put("maneL3", [(AL.XM + LEN) / 2, RB * 0.9, RB * 0.4], null, hullBand(S, AL.XM, LEN, AL.TC, R90));
    put("maneR2", [(XN + AL.XM) / 2, -RB * 0.9, RB * 0.4], null, hullBand(S, XN, AL.XM, -R90, -AL.TC));
    put("maneR3", [(AL.XM + LEN) / 2, -RB * 0.9, RB * 0.4], null, hullBand(S, AL.XM, LEN, -R90, -AL.TC));
    const XB = AL.XB, WIND = ["back1", "back2", "back3", "tail1", "tail2", "tail3", "tail4"];
    for (let i = 0; i < WIND.length; i++) put(WIND[i], [(XB[i] + XB[i + 1]) / 2, 0, -RB], null, hullBand(S, XB[i], XB[i + 1], R90, 1.5 * PI, T));
    // ---- the flaps (L: starboard, up; R: port, down) ----
    const fp = fwdPoly(), ap = aftPoly();
    for (const [sd, sg] of [["L", 1], ["R", -1]]) {
      const f = flap(S, fp, [0, 1, 2], sg * FWD.th, FWD.t0, FWD.t1, { ww: WT, we: WT });
      put("scap" + sd, [FWD.te0[0], sg * FWD.te0[1] * Math.sin(FWD.th), FWD.te0[1] * Math.cos(FWD.th)], null, f.lee, f.wind, f.edges);
      const a = flap(S, ap, [0, 1, 2], sg * AFT.th, AFT.t0, AFT.t1, { ww: WT, we: WT, gu: 18, gv: 12 });
      put("flank" + sd, [(AFT.le0[0] + LEN) / 2, sg * (RB + 0.2), 0], null, a.lee, a.edges);
      put("haunch" + sd, [(AFT.le0[0] + LEN) / 2, sg * (RB + 0.2), 0], "flank" + sd, a.wind);
      put((sg > 0 ? "hl" : "hr") + "_up", [(FAIR.x0 + LEN) / 2, sg * (RB + 0.2), 0], null, fairing(S, FAIR, sg * AFT.th));
    }
    // ---- the engines: vacuum Raptors (paw), sea-level Raptors (lo) ----
    const XVT = RVAC.top + 1.1, XST = RSL.top + 1.0;
    const eng = (name, c, big) => {
      const e = big ? engine(S, c, RVAC.top, XVT, 0.22, RVAC.re, 0.55) : engine(S, c, RSL.top, XST, 0.16, RSL.re, 0.42);
      put(name, [LEN, c[0], c[1]], null, e.outer, e.inner, e.drum);
    };
    eng("fl_paw", RVAC.at[0], true); eng("hr_paw", RVAC.at[1], true); eng("hl_paw", RVAC.at[2], true);
    eng("fl_lo", RSL.at[0], false); eng("hl_lo", RSL.at[1], false); eng("hr_lo", RSL.at[2], false);
    // ---- the engine bay and the skirt ----
    const IN = { w: 0.5 };
    put("fr_paw", [BAY.x0 + 0.5, 0, 0], null, dome(S, -PI, PI, IN));
    put("fl_up", [49, RB * 0.7, 0], null, skirtWall(S, 0, PI, IN));
    put("fr_up", [49, -RB * 0.7, 0], null, skirtWall(S, -PI, 0, IN));
    put("fr_lo", [LEN, 0, 0], null, rim(S, -PI, PI));
    return P;
  }

  /* ------------------------------------------------------------------
     The motion: it flies nose first with all six engines lit (their bells
     glow and flicker); the four flaps trim a little, slowly, and are back
     at rest before the dwell ends.
     ------------------------------------------------------------------ */
  const S_DWELL = 5.0;
  const ENG = ["fl_paw", "hr_paw", "hl_paw", "fl_lo", "hl_lo", "hr_lo"];
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
      A.wr("flankL", 1, 0, 0, (0.07 * p + 0.025 * r) * k);
      A.wr("flankR", 1, 0, 0, -(0.07 * p - 0.025 * r) * k);
      const f = FAX.L, g = FAX.R, q = Math.sin(t * 0.71 + 1.2);
      A.wr("scapL", f[0], f[1], f[2], (0.06 * q - 0.02 * r) * k);
      A.wr("scapR", g[0], g[1], g[2], -(0.06 * q + 0.02 * r) * k);
    }
    // the engines burn: the bells glow hot and flicker
    for (let i = 0; i < ENG.length; i++) A.glow(ENG[i], 0.78 + 0.14 * Math.sin(t * 31.0 + i * 1.7) * Math.sin(t * 13.0 + i * 2.3));
  }
  // one jet per engine, from the centre of its exit (its pivot), straight back
  const jet = (part, re, phase) => ({ part, at: [0, 0, 0], dir: [1, 0, 0], speed: 3.6, nozzle: re * K, heat: 1,
    power: (age, t) => 0.92 + 0.08 * Math.sin(t * 23.0 + phase) * Math.sin(t * 7.0) });

  PM.defineMode({
    name: "starship", kind: "vehicle", yaw: 0.35, dwell: S_DWELL,
    parts: shipParts,
    animate: shipAnimate,
    exhaust: [jet("fl_paw", RVAC.re, 0), jet("hr_paw", RVAC.re, 2.1), jet("hl_paw", RVAC.re, 4.2),
      jet("fl_lo", RSL.re, 1.0), jet("hl_lo", RSL.re, 3.1), jet("hr_lo", RSL.re, 5.2)],
  });
})(typeof window !== "undefined" ? window : globalThis);

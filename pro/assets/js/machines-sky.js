/* =====================================================================
   machines-sky.js: the flying end of the ProMachines cycle (machines.js
   loads first; this file only calls ProMachines.defineMode). Plain
   browser script; also loads in Node.

     jet       an F-35-like single-engine stealth fighter: a pointed,
               chined nose, a single-seat bubble canopy, side intakes with
               their bumps, trapezoid wings (swept leading edge, forward-
               swept trailing edge), twin canted fins, all-moving tails and
               one big round nozzle. It flies banked toward the viewer, so
               its planform reads, with a gentle bank and pitch, its
               control surfaces working a little and its engine glowing.
     starship  a stainless-steel rocket (Starship-like): ogive nose, two
               forward and two aft flaps, six engine bells.

   No brand marks: no logos, insignia, numbers or names. No weapons.
   ===================================================================== */
(function (G) {
  "use strict";
  const PM = G.ProMachines;
  if (!PM || typeof PM.defineMode !== "function") return;
  const S = PM.S, H = PM.H, PI = Math.PI, TAU = 2 * Math.PI;
  const smooth = H.smooth, clamp = H.clamp;

  /* ------------------------------------------------------------------
     Authoring helpers (used once, while a mode's parts are built)
     ------------------------------------------------------------------ */
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function mul(a, b) {
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  }
  function tr(R) { return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]; }
  function app(R, v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; }
  const RX = (a) => H.euler(a, 0, 0), RY = (a) => H.euler(0, a, 0), RZ = (a) => H.euler(0, 0, a);
  // canonical local frames, in a body whose nose is -x, back +y, left +z
  const F_CORE = I3;                                          // torso, head, jaw, neck, tail (tail grows +x)
  const F_PLATE = H.frame({ y: [0, 0, 1], z: [0, 1, 0] });    // plate: grows outboard (+z), outer face up, width along x
  const F_AFT = H.frame({ y: [1, 0, 0], z: [0, 1, 0] });      // plate that grows aft, outer face up
  const F_LIMB = RZ(PI / 2);                                  // limb swung fully back: hangs aft (+x), front up
  // a part from geometry authored in the machine frame: pivot at, local frame R
  function part(at, R, shape) {
    const Rt = tr(R), o = app(Rt, at);
    return { at: at.slice(), rot: R, shape: S.place(S.join(shape), [-o[0], -o[1], -o[2]], Rt) };
  }
  // move every entry rigidly: p' = R (p - c) + c + d (shapes stay in their local frames)
  function rigid(P, R, c, d) {
    for (const k in P) {
      const e = P[k], a = e.at;
      const v = app(R, [a[0] - c[0], a[1] - c[1], a[2] - c[2]]);
      e.at = [v[0] + c[0] + d[0], v[1] + c[1] + d[1], v[2] + c[2] + d[2]];
      e.rot = mul(R, H.rot(e.rot));
    }
    return P;
  }
  const mir = (e) => H.mirror(e);
  // monotone cubic through (xs, ys)
  function pchip(xs, ys) {
    const n = xs.length;
    if (n === 1) return () => ys[0];
    const h = [], m = [], d = new Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / (h[i] || 1e-9); }
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
  // stations [x, c1, c2, ...] -> a dense table; at(x) fills and returns one reused row
  function stations(rows, ns) {
    ns = ns || 161;
    rows = rows.slice().sort((a, b) => a[0] - b[0]);
    const xs = rows.map((r) => r[0]), nc = rows[0].length - 1, fs = [];
    for (let c = 1; c <= nc; c++) fs.push(pchip(xs, rows.map((r) => r[c])));
    const x0 = xs[0], x1 = xs[xs.length - 1], tab = new Float64Array(ns * nc), row = new Float64Array(nc);
    for (let j = 0; j < ns; j++) { const x = x0 + (x1 - x0) * j / (ns - 1); for (let c = 0; c < nc; c++) tab[j * nc + c] = fs[c](x); }
    return {
      x0, x1,
      at(x) {
        let f = (x - x0) / (x1 - x0) * (ns - 1);
        if (f < 0) f = 0; else if (f > ns - 1) f = ns - 1;
        let j = f | 0; if (j > ns - 2) j = ns - 2;
        const w = f - j, a = j * nc, b = a + nc;
        for (let c = 0; c < nc; c++) row[c] = tab[a + c] + (tab[b + c] - tab[a + c]) * w;
        return row;
      },
    };
  }
  // NACA-like thickness: round nose, sharp tail, 1 at xi = 0.3
  function naca(xi) {
    if (!(xi > 0 && xi < 1)) return 0;
    const s = Math.sqrt(xi), x2 = xi * xi;
    return Math.max(0, (0.2969 * s - 0.126 * xi - 0.3516 * x2 + 0.2843 * x2 * xi - 0.1036 * x2 * x2) / 0.1003);
  }

  /* ==================================================================
     JET: an F-35A-like stealth fighter, built from measurements: the
     published dimensions (Lockheed Martin fast facts, USAF fact sheet) and
     the outline traced from the official three-view CAD renders and checked
     on photos (tables in metres). x runs aft from the nose tip, y up from the
     bottom of the fuselage (gear up), z toward the jet's left (port, the
     near side). Everything is authored in metres in this frame, scaled by
     JK so the whole jet (nose tip to the stabilators' inboard trailing
     corners, 15.67 m) is 3.75 long, then banked toward the viewer.
     ================================================================== */
  const JK = 3.75 / 15.667, JXC = 15.667 / 2, JYR = 1.28;   // scale; the flat frame's origin: mid-length, wing plane
  const JT = { BANK: 0.52, PITCH: 0.04, YC: -0.2 };
  const J_DWELL = 4.5;
  // metres (outline frame) -> the flat machine frame (before the bank)
  const jm = (x, y, z) => [(x - JXC) * JK, (y - JYR) * JK, (z || 0) * JK];
  const J_OFF = [-JXC * JK, -JYR * JK, 0];
  // linear table lookup in rows [x, a, b, ...] (column c)
  function lin(rows, c) {
    const xs = rows.map((r) => r[0]), ys = rows.map((r) => r[c]), n = xs.length;
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
      return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
    };
  }
  const pc = (rows, c) => pchip(rows.map((r) => r[0]), rows.map((r) => r[c]));
  // side view: [x, top, bottom] (top is the canopy glass from 1.98 to 4.57)
  const JS_SIDE = [[0.0,1.044,1.033],[0.06,1.082,1.009],[0.12,1.122,0.983],[0.24,1.157,0.927],[0.36,1.209,0.874],[0.47,1.275,0.813],[0.59,1.315,0.751],[0.7,1.357,0.725],[0.82,1.386,0.686],[0.94,1.421,0.657],[1.06,1.454,0.629],[1.18,1.489,0.587],[1.29,1.504,0.508],[1.41,1.528,0.466],[1.53,1.564,0.455],[1.64,1.621,0.444],[1.76,1.662,0.421],[1.88,1.752,0.445],[2.0,1.782,0.484],[2.2,1.909,0.495],[2.4,2.03,0.486],[2.6,2.158,0.466],[2.8,2.267,0.461],[3.0,2.347,0.452],[3.3,2.404,0.437],[3.6,2.415,0.423],[3.9,2.403,0.408],[4.2,2.388,0.394],[4.5,2.35,0.382],[4.8,2.32,0.371],[5.1,2.294,0.359],[5.4,2.28,0.348],[5.6,2.27,0.321],[5.75,2.263,0.291],[5.9,2.255,0.262],[6.1,2.252,0.229],[6.33,2.241,0.191],[6.45,2.196,0.197],[6.6,2.175,0.191],[7.0,2.173,0.202],[7.5,2.173,0.219],[8.0,2.161,0.207],[8.5,2.136,0.191],[9.0,2.118,0.175],[9.5,2.106,0.18],[10.0,2.099,0.184],[10.4,2.085,0.17],[10.55,2.083,0.163],[10.7,2.078,0.134],[10.8,2.077,0.114],[10.9,2.072,0.09],[11.0,2.077,0.066],[11.13,2.066,0.035],[11.25,2.061,0.022],[11.37,2.055,0.011],[11.49,2.055,0.023],[11.6,2.05,0.05],[11.72,2.044,0.079],[11.84,2.038,0.095],[11.95,2.033,0.134],[12.07,2.032,0.146],[12.19,2.026,0.197],[12.31,2.018,0.226],[12.42,2.008,0.24],[12.54,1.995,0.28],[12.66,1.979,0.298],[12.77,1.962,0.353],[12.89,1.94,0.382],[13.0,1.918,0.414],[13.13,1.887,0.445],[13.24,1.858,0.471],[13.36,1.823,0.5]];
  // plan view: half width of the body at the chine (forebody, the intake cowl from its lip, the
  // wing roots, then (not traced: the booms carry the rest) the boat-tail closing on the nozzle base)
  const JS_ZC = [[0.0,0.003],[0.13,0.089],[0.27,0.142],[0.4,0.207],[0.53,0.28],[0.65,0.327],[0.78,0.378],[0.92,0.425],[1.05,0.464],[1.18,0.487],[1.31,0.505],[1.44,0.517],[1.7,0.545],[2.0,0.588],[2.5,0.645],[3.0,0.707],[3.5,0.769],[4.0,0.834],[4.18,0.87],[4.235,0.95],
    [4.254,1.471],[4.299,1.499],[4.355,1.527],[4.411,1.561],[4.467,1.589],[4.523,1.617],[4.579,1.645],[4.636,1.673],[4.692,1.679],[5.0,1.692],[5.5,1.713],[6.0,1.735],[6.5,1.756],[7.05,1.78],[7.5,1.786],[8.5,1.801],[9.5,1.817],[10.5,1.831],[11.5,1.846],[12.4,1.86],
    [12.6,1.83],[12.8,1.68],[13.0,1.42],[13.2,1.02],[13.36,0.7]];
  // the forebody's own half width where the intakes stand beside it (the body without the cowls)
  const JS_ZF = [[4.0,0.834],[4.18,0.87],[4.31,0.909],[4.445,0.949],[4.574,1.005],[4.692,1.03],[5.3,1.08]];
  // the canopy glass: [x, top (on the centre line), sill (its lower edge, side view)]
  const JS_CAN = [[1.979,1.752,1.735],[2.05,1.799,1.678],[2.15,1.86,1.673],[2.3,1.954,1.668],[2.45,2.049,1.662],[2.6,2.14,1.657],[2.8,2.252,1.657],[3.0,2.332,1.675],[3.2,2.371,1.725],[3.4,2.387,1.782],[3.6,2.398,1.837],[3.8,2.392,1.892],[4.0,2.375,1.949],[4.2,2.359,2.004],[4.35,2.343,2.046],[4.44,2.336,2.074],[4.47,2.331,2.144],[4.5,2.33,2.206],[4.54,2.33,2.28],[4.574,2.33,2.302]];
  const JC_X0 = 1.979, JC_X1 = 4.574;
  // the canopy's half width at its base (plan view: 1.06 m wide at x 3.0-3.5, pointed at both ends)
  const JS_CW = [[1.979,0],[2.1,0.17],[2.3,0.29],[2.6,0.4],[3.0,0.49],[3.3,0.52],[3.6,0.51],[3.9,0.46],[4.2,0.37],[4.4,0.25],[4.5,0.16],[4.574,0]];
  // the section's shape along the jet: [x, chine height, upper exponents pU qU, lower pL qL, taper of the
  // lower side]: a round radome with a sharp chine, the flat sloping deck beside the canopy and behind it,
  // the intake trunks' flat walls (leaning in at the bottom) and flat belly, the wing roots' sloping lower
  // sides, then round again at the nozzle
  const JS_SEC = [
    [0.0, 1.035, 2.0, 1.7, 1.7, 1.3, 0], [0.6, 1.05, 2.0, 1.7, 1.7, 1.3, 0], [1.3, 1.08, 1.9, 1.55, 1.75, 1.3, 0],
    [2.0, 1.115, 1.5, 1.2, 1.9, 1.4, 0], [3.0, 1.16, 1.3, 1.05, 2.1, 1.5, 0], [4.0, 1.2, 1.25, 1.0, 2.3, 1.7, 0.02],
    [4.25, 1.21, 1.0, 1.0, 2.6, 2.0, 0.06], [4.75, 1.235, 0.95, 1.0, 3.0, 3.6, 0.12], [5.5, 1.25, 0.98, 1.0, 2.8, 3.6, 0.06],
    [7.1, 1.28, 1.0, 1.0, 2.8, 3.6, 0.12], [8.0, 1.28, 1.04, 1.0, 2.8, 3.4, 0.22], [11.5, 1.28, 1.08, 1.0, 2.8, 3.0, 0.22], [12.4, 1.28, 1.15, 1.0, 2.6, 2.2, 0.15],
    [13.0, 1.24, 1.6, 1.4, 2.3, 2.0, 0.08], [13.36, 1.21, 2.0, 2.0, 2.0, 2.0, 0],
  ];
  const JS_LOW = [[0, 0, 0, 0], [7.2, 0, 0, 0], [7.9, 0.2, 0.1, 0.1], [8.6, 0.45, 0.14, 0.22], [9.4, 0.58, 0.15, 0.29], [10.8, 0.58, 0.15, 0.29],
    [11.6, 0.4, 0.12, 0.2], [12.2, 0.12, 0.04, 0.05], [12.45, 0, 0, 0], [13.36, 0, 0, 0]];
  const J_SL = 0.3;                 // the share of the lower section's parameter taken by the lobe
  const JS_BELLY = [[10.4, 0.17], [11.3, 0.185], [12.2, 0.2]];
  const JH_X1 = 13.36, JH_N = 1336, JH_C = 15;
  let JH = null;
  // the hull section at x, tabulated every 1 cm: [yS (top centre, or the canopy's sill), yC, zC, yB, pU, 1/qU, pL, 1/qL, tap, wc,
  // zL, yL (the lower side's top edge: the chine, or the wing root fairing's outer edge under the wing), keel depth]
  const JSec = { yS: 0, yC: 0, zC: 0, yB: 0, pU: 2, iqU: 1, pL: 2, iqL: 1, tap: 0, wc: 0, zL: 0, yL: 0, keel: 0, zM: 0, yM: 0 };
  function jSec(x) {
    if (!JH) {
      JH = new Float64Array((JH_N + 1) * JH_C);
      const top = lin(JS_SIDE, 1), bot = lin(JS_SIDE, 2), zc = lin(JS_ZC, 1), sill = pc(JS_CAN, 2), cw = pc(JS_CW, 1);
      const f = [1, 2, 3, 4, 5, 6].map((c) => pc(JS_SEC, c)), dz = pc(JS_LOW, 1), dy = pc(JS_LOW, 2), dd = pc(JS_LOW, 3), bel = pc(JS_BELLY, 1);
      for (let i = 0; i <= JH_N; i++) {
        const xi = JH_X1 * i / JH_N, o = i * JH_C, inC = xi > JC_X0 && xi < JC_X1;
        const b = bot(xi), yb = xi > 10.4 && xi < 12.2 ? Math.min(bel(xi), Math.max(b, bel(xi))) : b;
        JH[o] = inC ? sill(xi) : top(xi); JH[o + 1] = f[0](xi); JH[o + 2] = Math.max(0.003, zc(xi)); JH[o + 3] = yb;
        JH[o + 4] = f[1](xi); JH[o + 5] = 1 / f[2](xi); JH[o + 6] = f[3](xi); JH[o + 7] = 1 / f[4](xi); JH[o + 8] = f[5](xi);
        JH[o + 9] = inC ? Math.max(0, Math.min(cw(xi), 0.95 * JH[o + 2])) : 0;
        JH[o + 10] = JH[o + 2] + Math.max(0, dz(xi)); JH[o + 11] = JH[o + 1] - Math.max(0, dy(xi)); JH[o + 12] = Math.max(0, yb - b);
        const lobe = Math.min(1, Math.max(0, dz(xi)) / 0.2);
        JH[o + 13] = JH[o + 2] + 0.05 * lobe; JH[o + 14] = JH[o + 11] - Math.max(0, dd(xi));
      }
    }
    let fx = x / JH_X1 * JH_N;
    fx = fx < 0 ? 0 : fx > JH_N - 1e-9 ? JH_N - 1e-9 : fx;
    const i = fx | 0, w = fx - i, o = i * JH_C, H = JH, o2 = o + JH_C;
    JSec.yS = H[o] + (H[o2] - H[o]) * w; JSec.yC = H[o + 1] + (H[o2 + 1] - H[o + 1]) * w; JSec.zC = H[o + 2] + (H[o2 + 2] - H[o + 2]) * w;
    JSec.yB = H[o + 3] + (H[o2 + 3] - H[o + 3]) * w; JSec.pU = H[o + 4] + (H[o2 + 4] - H[o + 4]) * w; JSec.iqU = H[o + 5] + (H[o2 + 5] - H[o + 5]) * w;
    JSec.pL = H[o + 6] + (H[o2 + 6] - H[o + 6]) * w; JSec.iqL = H[o + 7] + (H[o2 + 7] - H[o + 7]) * w; JSec.tap = H[o + 8] + (H[o2 + 8] - H[o + 8]) * w;
    JSec.wc = H[o + 9] + (H[o2 + 9] - H[o + 9]) * w; JSec.zL = H[o + 10] + (H[o2 + 10] - H[o + 10]) * w; JSec.yL = H[o + 11] + (H[o2 + 11] - H[o + 11]) * w;
    JSec.keel = H[o + 12] + (H[o2 + 12] - H[o + 12]) * w; JSec.zM = H[o + 13] + (H[o2 + 13] - H[o + 13]) * w; JSec.yM = H[o + 14] + (H[o2 + 14] - H[o + 14]) * w;
    return JSec;
  }
  // a point of the hull at x and section parameter s: 0 = the top centre (or the canopy's edge), 1 = the
  // chine, 2 = the bottom centre; on the near side (z >= 0)
  function jHull(x, s, q) {
    const c = jSec(x);
    if (s <= 1) {
      const m = Math.sin(s * PI / 2), a = c.wc / c.zC;
      q[2] = c.zC * (a + (1 - a) * m);
      q[1] = c.yC + (c.yS - c.yC) * Math.pow(Math.max(0, 1 - Math.pow(m, c.pU)), c.iqU);
    } else {
      if (s < 1 + J_SL) {
        // the lobe under the wing root: an elliptic arc about (zM, yL)
        const t = (s - 1) / J_SL * PI / 2;
        q[2] = c.zM + (c.zL - c.zM) * Math.cos(t); q[1] = c.yL - (c.yL - c.yM) * Math.sin(t);
      } else {
        const m = Math.cos((s - 1 - J_SL) / (1 - J_SL) * PI / 2), f = Math.pow(Math.max(0, 1 - Math.pow(m, c.pL)), c.iqL);
        q[1] = c.yM - (c.yM - c.yB) * f;
        q[2] = c.zM * m * (1 - c.tap * f);
        if (c.keel > 0) { const k = 1 - q[2] * q[2] / 0.11; if (k > 0) q[1] -= c.keel * Math.pow(k, 0.7); }
      }
    }
    q[0] = x;
    return q;
  }
  // the section parameter of the hull point nearest to (z, y) at x (authoring only)
  function jHullS(x, z, y, s0, s1) {
    const q = [0, 0, 0];
    let best = s0, bd = Infinity;
    for (let k = 0; k <= 400; k++) {
      const s = s0 + (s1 - s0) * k / 400;
      jHull(x, s, q);
      const d = (q[2] - z) * (q[2] - z) + (q[1] - y) * (q[1] - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // the forebody's half width inside the intakes (the duct's inner wall); the bump of the diverterless
  // inlet on the forebody's side (x 3.6 .. 5.0 m, ~0.12 m high, peaking just ahead of the lips)
  const jZF = lin(JS_ZF, 1);
  function jBump(x, s) {
    const sl = (s - 1 - J_SL) / (1 - J_SL);
    if (x < 3.55 || x > 5.1 || sl < 0 || sl > 0.8) return 0;
    const fx = x < 4.25 ? smooth(3.55, 4.25, x) : 1 - smooth(4.35, 5.1, x), fs = Math.sin(PI * sl / 0.8);
    return 0.12 * fx * fs * fs;
  }
  // the hull with the bump (ahead of the lips), and the forebody continued inside the intakes (zF wide)
  function jHullB(x, s, q, fore) {
    if (fore) {
      const c = jSec(x), zc = c.zC;
      c.zC = Math.min(zc, jZF(x)); c.yC = 1.21 + 0.03 * smooth(4.24, 5.1, x);
      if (c.wc > 0.95 * c.zC) c.wc = 0.95 * c.zC;
      // the same formulas with the narrower section (jSec's row is not re-read below)
      const m = Math.cos(Math.max(0, (s - 1 - J_SL) / (1 - J_SL)) * PI / 2), f = Math.pow(Math.max(0, 1 - Math.pow(m, c.pL)), c.iqL);
      q[0] = x; q[1] = c.yC - (c.yC - c.yB) * f; q[2] = c.zC * m * (1 - c.tap * f);
      c.zC = zc;
    } else jHull(x, s, q);
    if (s > 1) q[2] += jBump(x, s);
    return q;
  }
  const fnOr = (f, x) => (typeof f === "function" ? f(x) : f);
  // a band of the hull from x0 to x1 between the section parameters s0 and s1 (numbers or functions of
  // x, tabulated along the band), on the near side (side 1) or mirrored onto the far side (-1)
  function jBand(x0, x1, s0, s1, side, o) {
    o = o || {};
    const NB = 32, A0 = new Float64Array(NB + 1), A1 = new Float64Array(NB + 1), fore = !!o.fore;
    let span = 0;
    for (let i = 0; i <= NB; i++) { const x = x0 + (x1 - x0) * i / NB; A0[i] = fnOr(s0, x); A1[i] = fnOr(s1, x); span = Math.max(span, A1[i] - A0[i]); }
    return S.param(function (u, v, q) {
      const f = u * NB, i = f >= NB ? NB - 1 : f | 0, w = f - i;
      const a = A0[i] + (A0[i + 1] - A0[i]) * w, b = A1[i] + (A1[i + 1] - A1[i]) * w;
      jHullB(x0 + (x1 - x0) * u, a + (b - a) * v, q, fore);
      q[2] *= side;
    }, { gu: o.gu || Math.max(3, Math.round((x1 - x0) * 18)), gv: o.gv || Math.max(3, Math.round(span * 16)), flip: side > 0, w: o.w, heat: o.heat, glow: o.glow });
  }
  const jBoth = (x0, x1, s0, s1, o) => [jBand(x0, x1, s0, s1, 1, o), jBand(x0, x1, s0, s1, -1, o)];
  // ---- the intake lip (near side): upper-inboard A, upper-outboard B, lower-outboard C, lower-inboard D
  const JL = { A: [4.72, 1.46, 1.02], B: [4.254, 1.21, 1.471], C: [4.798, 0.536, 1.2], D: [5.05, 0.54, 0.59] };
  // section parameters along the lip (tabulated once): the upper lip cuts the deck between the forebody
  // and the cowl's top; the outer and lower lips start the cowl's walls
  let JLT = null;
  function jLipTabs() {
    if (JLT) return JLT;
    const NX = 48, X0 = 4.24, X1 = 5.06, sF = [], sU = [], sL = [], sI = [];
    const zul = (x) => JL.B[2] + (JL.A[2] - JL.B[2]) * clamp((x - JL.B[0]) / (JL.A[0] - JL.B[0]), 0, 1);
    for (let i = 0; i <= NX; i++) {
      const x = X0 + (X1 - X0) * i / NX, c = jSec(x), zC = c.zC, wc = c.wc;
      const sOf = (z) => { const a = wc / zC, m = clamp((z / zC - a) / (1 - a), 0, 1); return Math.asin(m) * 2 / PI; };
      sF.push(sOf(Math.min(jZF(x), zC)));
      sU.push(x <= JL.A[0] ? sOf(Math.min(zul(x), zC)) : sOf(Math.min(jZF(x), zC)));
      // the outer lip B -> C, then the lower lip C -> D
      let p;
      if (x <= JL.B[0]) p = JL.B;
      else if (x <= JL.C[0]) { const t = (x - JL.B[0]) / (JL.C[0] - JL.B[0]); p = [x, JL.B[1] + (JL.C[1] - JL.B[1]) * t, JL.B[2] + (JL.C[2] - JL.B[2]) * t]; }
      else { const t = Math.min(1, (x - JL.C[0]) / (JL.D[0] - JL.C[0])); p = [x, JL.C[1] + (JL.D[1] - JL.C[1]) * t, JL.C[2] + (JL.D[2] - JL.C[2]) * t]; }
      sL.push(jHullS(x, p[2], p[1], 1, 2));
      sI.push(jHullS(x, JL.D[2], JL.D[1], 1, 2));
    }
    const tab = (arr) => (x) => { const f = clamp((x - X0) / (X1 - X0), 0, 1) * NX, i = Math.min(NX - 1, f | 0), w = f - i; return arr[i] + (arr[i + 1] - arr[i]) * w; };
    JLT = { sF: tab(sF), sU: tab(sU), sL: tab(sL), sI: tab(sI) };
    return JLT;
  }
  // the duct's inner wall (the forebody's side with the bump, behind the lips) from x0 to x1: from the
  // forebody's chine down to the lower-inboard lip line
  function jInner(x0, x1, side, o) {
    o = o || {};
    const L = jLipTabs();
    return jBand(x0, x1, 1 + J_SL, (x) => Math.max(1 + J_SL + 0.02, L.sI(x)), side, Object.assign({ fore: true }, o));
  }
  // a thin round line through 3D points (lip edges, frames)
  function jLine(pts, r, o) {
    const P = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]);
      if (L < 1e-6) continue;
      P.push(S.cyl(r, L, Object.assign({ at: a, rot: { y: [d[0] / L, d[1] / L, d[2] / L] }, caps: false, gu: 8, gv: Math.max(2, Math.round(L * 12)) }, o)));
    }
    return P;
  }
  // ---- the canopy: a one-piece transparency from its base on the deck to its top line (near half)
  const jGT = pc(JS_CAN, 1);
  function jCanopy(x0, x1, side, o) {
    o = o || {};
    return S.param(function (u, v, q) {
      const x = x0 + (x1 - x0) * u, c = jSec(x), ph = v * PI / 2, top = jGT(x);
      q[0] = x; q[1] = c.yS + (top - c.yS) * Math.cos(ph); q[2] = side * c.wc * Math.sin(ph);
    }, { gu: o.gu || 40, gv: o.gv || 10, flip: side > 0, w: o.w, heat: o.heat, glow: o.glow });
  }
  // ---- the wing (near side): leading edge from the body side (7.118, 1.78) with the 63 deg glove to the
  // kink (7.96, 2.288), then 34 deg to the tip (10.016, 5.368); trailing edge forward-swept 14 deg from
  // the tip (11.575, 5.368) to the body (12.448, 1.862); the chord plane 1.31 m up, a little anhedral
  const JW_TIP = 5.368;
  const wLE = (z) => (z < 2.288 ? 7.118 + (z - 1.78) * (0.842 / 0.508) : 7.96 + (z - 2.288) * (2.056 / 3.08));
  const wTE = (z) => 12.448 - (z - 1.862) * (0.873 / 3.506);
  const wY = (z) => 1.29 + 0.004 * (z - 1.8);
  const wT = (z) => 0.031 - 0.004 * (z - 1.8) / 3.57;           // half thickness / chord (6.2 % at the root)
  // camber, and a washout of 3 deg at the tip (the leading edge lower, the trailing edge higher)
  function jWingPt(z, xi, up, q) {
    const le = wLE(z), c = wTE(z) - le, e = (z - 1.8) / 3.57;
    q[0] = le + xi * c; q[2] = z;
    q[1] = wY(z) + c * (0.004 * 4 * xi * (1 - xi) + 0.052 * e * (xi - 0.35)) + (up ? 1 : -1) * wT(z) * c * naca(xi);
    return q;
  }
  // where the lower surface leaves the wing root's fairing (under the root chord at x)
  const jZL = (x) => jSec(x).zL;
  // a panel: span z0..z1 (the root follows the body side), chord fractions xi0..xi1; side -1 mirrors it
  function jWing(z0, z1, xi0, xi1, up, o) {
    o = o || {};
    return S.param(function (u, v, q) {
      const xi = xi0 + (xi1 - xi0) * v, zr = Math.max(z0, 1.79 + 0.072 * xi, up ? 0 : jZL(7.12 + 5.33 * xi) - 0.03);
      jWingPt(zr + (z1 - zr) * u, xi, up, q);
    }, { gu: o.gu || Math.max(3, Math.round((z1 - z0) * 10)), gv: o.gv || Math.max(3, Math.round((xi1 - xi0) * 24)), flip: !up, w: o.w, heat: o.heat, glow: o.glow });
  }
  const jWing2 = (z0, z1, xi0, xi1, o) => [jWing(z0, z1, xi0, xi1, true, o), jWing(z0, z1, xi0, xi1, false, o)];
  // ---- the fin (near side) in its plane, canted 20.3 deg out: mid-plane z = 0.370 y + 0.899
  const JF = { rLE: [11.509, 1.395], rTE: [13.848, 1.603], tLE: [13.492, 3.672], tTE: [14.892, 3.672], a: 0.37, b: 0.899, t: 0.021 };
  const JF_NY = -0.37 / Math.hypot(1, 0.37), JF_NZ = 1 / Math.hypot(1, 0.37);
  function jFinPt(u, v, face, q) {
    const F = JF, xr = F.rLE[0] + (F.rTE[0] - F.rLE[0]) * v, yr = F.rLE[1] + (F.rTE[1] - F.rLE[1]) * v;
    const xt = F.tLE[0] + (F.tTE[0] - F.tLE[0]) * v, yt = F.tLE[1] + (F.tTE[1] - F.tLE[1]) * v;
    const y = yr + (yt - yr) * u, c = (F.rTE[0] - F.rLE[0]) * (1 - u) + (F.tTE[0] - F.tLE[0]) * u, th = face * F.t * c * naca(v);
    q[0] = xr + (xt - xr) * u; q[1] = y + th * JF_NY; q[2] = F.a * y + F.b + th * JF_NZ;
    return q;
  }
  function jFin(u0, u1, v0, v1, face, o) {
    o = o || {};
    return S.param(function (u, v, q) { jFinPt(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v, face, q); },
      { gu: o.gu || Math.max(3, Math.round((u1 - u0) * 22)), gv: o.gv || Math.max(3, Math.round((v1 - v0) * 22)), flip: face > 0, w: o.w, heat: o.heat, glow: o.glow });
  }
  const jFin2 = (u0, u1, v0, v1, o) => [jFin(u0, u1, v0, v1, 1, o), jFin(u0, u1, v0, v1, -1, o)];
  // ---- the stabilator (near side, production shape: 6.86 m span): root LE (12.896, 2.11), tip LE
  // (13.786, 3.43), tip TE (15.144, 3.43), root TE (15.667, 1.0); plane 1.23 m up
  const JHT = { rLE: [12.896, 2.11], tLE: [13.786, 3.43], tTE: [15.144, 3.43], rTE: [15.667, 1.0], y: 1.23, t: 0.022 };
  function jStabPt(u, v, up, q) {
    const H = JHT, lx = H.rLE[0] + (H.tLE[0] - H.rLE[0]) * u, lz = H.rLE[1] + (H.tLE[1] - H.rLE[1]) * u;
    const tx = H.rTE[0] + (H.tTE[0] - H.rTE[0]) * u, tz = H.rTE[1] + (H.tTE[1] - H.rTE[1]) * u, c = Math.hypot(tx - lx, tz - lz);
    q[0] = lx + (tx - lx) * v; q[2] = lz + (tz - lz) * v; q[1] = H.y + (up ? 1 : -1) * H.t * c * naca(v);
    return q;
  }
  function jStab(u0, u1, v0, v1, up, o) {
    o = o || {};
    return S.param(function (u, v, q) { jStabPt(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v, up, q); },
      { gu: o.gu || 16, gv: o.gv || 20, flip: !up, w: o.w, heat: o.heat, glow: o.glow });
  }
  const jStab2 = (u0, u1, v0, v1, o) => [jStab(u0, u1, v0, v1, true, o), jStab(u0, u1, v0, v1, false, o)];
  // ---- the nozzle: base 1.29 m across at x 13.36, exit 0.73 m at 14.05 (dry), axis 1.21 m up; the
  // outer flaps end in a sawtooth rim
  const JN = { x0: 13.36, x1: 14.05, r0: 0.645, r1: 0.365, y: 1.21, teeth: 15, tooth: 0.075 };
  function jNozzle(a0, a1, inner, o) {
    o = o || {};
    const N = JN;
    return S.param(function (u, v, q) {
      const a = a0 + (a1 - a0) * u, saw = Math.abs(((a * N.teeth / TAU) % 1 + 1) % 1 - 0.5) * 2;
      const xs = inner ? N.x0 + 0.3 : N.x0, xe = N.x1 - N.tooth * saw, x = xs + (xe - xs) * v, f = (x - N.x0) / (N.x1 - N.x0);
      const r = (N.r0 + (N.r1 - N.r0) * Math.pow(f, 0.9)) * (inner ? 0.9 : 1);
      q[0] = x; q[1] = N.y + r * Math.cos(a); q[2] = r * Math.sin(a);
    }, { gu: o.gu || 60, gv: o.gv || 8, flip: !inner, w: o.w, heat: o.heat, glow: o.glow });
  }
  // the cuts between the rig's parts (metres along x; section parameters s: 0 top, 1 chine, 2 bottom)
  const JP = {
    XN: 1.3, XJ: 2.7, sJ: 1.65,                // radome | forward fuselage; the chin below sJ
    XM: 5.6, XW: 7.1, sM: 1.73,                // the cowl | the trunk wall; the wall above sM, the belly below
    sS: 0.42, XB: 9.4, XB2: 11.2, XH: 9.9,     // spine | deck; the decks end, the spine ends, belly | hips
    XA: 12.4,                                  // the aft end around the nozzle
    ZW1: 3.1, ZW2: 4.15, ZW3: 4.75, XF: 0.13, XT: 0.78, VR: 0.7,   // wing panels; LE flap, flaperon; rudder
  };
  // the bank toward the viewer (top to +z) and a touch of nose-up, about the flat frame's origin
  const J_ROT = mul(RZ(-JT.PITCH), RX(JT.BANK));
  // a machine-frame axis (after the bank) from a flat-frame direction in metres
  const jAxis = (d) => { const v = app(J_ROT, d), L = Math.hypot(v[0], v[1], v[2]); return [v[0] / L, v[1] / L, v[2] / L]; };
  // hinge lines (near side, flat frame): the flaperon (along its leading edge), the stabilator's pivot
  // (spanwise), the rudder (along its leading edge in the fin plane), the LE flap (along its rear edge)
  const J_HINGE = (function () {
    const q0 = jWingPt(1.95, JP.XT, true, [0, 0, 0]), q1 = jWingPt(JP.ZW2, JP.XT, true, [0, 0, 0]);
    const f0 = jFinPt(0.05, JP.VR, 0, [0, 0, 0]), f1 = jFinPt(0.95, JP.VR, 0, [0, 0, 0]);
    const l0 = jWingPt(2.4, JP.XF, true, [0, 0, 0]), l1 = jWingPt(5.2, JP.XF, true, [0, 0, 0]);
    const d = (a, b) => [b[0] - a[0], b[1] - a[1], b[2] - a[2]], mz = (v) => [v[0], v[1], -v[2]];
    const fl = d(q0, q1), ru = d(f0, f1), le = d(l0, l1), st = [0.12, 0, 1];
    return {
      scapL: jAxis(fl), scapR: jAxis(mz(fl)), hl_paw: jAxis(st), hr_paw: jAxis(mz(st)),
      hl_lo: jAxis(ru), hr_lo: jAxis(mz(ru)), fl_up: jAxis(le), fr_up: jAxis(mz(le)),
      pScap: [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2, (q0[2] + q1[2]) / 2], pFin: [(f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2, (f0[2] + f1[2]) / 2],
      pLe: [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2, (l0[2] + l1[2]) / 2],
    };
  })();
  function jetParts() {
    const P = {};
    const L = jLipTabs(), X = JP;
    // a part from shapes in metres: pivot in metres, local frame R
    const put = (name, at, R, ...shapes) => { P[name] = part(jm(at[0], at[1], at[2]), R, S.place(S.join(shapes), J_OFF, null, JK)); };
    const GL = { w: 0.42, heat: 0.06 };                                  // glazing: sparse and a little warm
    // ---- the radome, the chin with the targeting window, the forward fuselage, the canopy
    put("neck", [0.8, 1.15, 0], F_CORE, jBoth(0, X.XN, 0, 2));
    put("jaw", [2.0, 0.6, 0], F_CORE, jBoth(X.XN, X.XJ, X.sJ, 2),
      S.ellipsoid(0.3, 0.08, 0.2, { at: [1.72, 0.5, 0], theta: [PI / 2, PI], w: 0.5, heat: 0.18 }));
    put("chest", [3.0, 1.2, 0], F_CORE, jBoth(X.XN, 4.24, 0, 1), jBoth(X.XN, X.XJ, 1, X.sJ), jBoth(X.XJ, 3.55, 1, 2),
      jBoth(4.24, 4.72, X.sS, L.sF), jBoth(4.72, X.XW, X.sS, 1));
    put("head", [3.3, 2.0, 0], F_CORE, S.tag(S.join(jCanopy(JC_X0, JC_X1, 1), jCanopy(JC_X0, JC_X1, -1)), GL));
    // ---- the intakes (near side; the far side mirrors): the cowl with its lips (mane 1), the trunk's wall
    // (mane 2), the bump and the duct's inner wall (mane 3)
    const lip = [JL.A, JL.B, JL.C, JL.D].map((p) => [p[0], p[1], p[2]]);
    put("maneL1", [4.9, 0.95, 1.5], F_PLATE, jBand(4.254, 5.05, 1, L.sL, 1), jBand(5.05, X.XM, 1, X.sM, 1),
      jBand(4.254, 4.72, L.sU, 1, 1), jLine(lip, 0.028, { heat: 0.05 }));
    put("maneL2", [6.3, 0.95, 1.6], F_PLATE, jBand(X.XM, X.XW, 1, X.sM, 1));
    put("maneL3", [4.3, 0.9, 1.0], F_PLATE, jBand(3.55, 4.24, 1, 2, 1), jInner(4.24, 5.15, 1, { w: 0.6 }));
    // ---- the belly (the bays' doors between the intake trunks) and the aft fuselage
    put("belly", [8.0, 0.25, 0], F_CORE, jBoth(4.24, 5.05, L.sI, 2), jBoth(5.05, X.XW, X.sM, 2), jBoth(X.XW, X.XH, 1, 2));
    put("hips", [11.2, 1.0, 0], F_CORE, jBoth(X.XH, X.XA, 1, 2), jBoth(X.XB, X.XA, X.sS, 1), jBoth(X.XB2, X.XA, 0, X.sS));
    // ---- the spine (back 2) and the decks over the wing roots (back 1 near, back 3 far)
    put("back2", [8.0, 2.1, 0], F_AFT, jBoth(4.24, X.XB2, 0, X.sS));
    put("back1", [8.2, 1.6, 1.0], F_AFT, jBand(X.XW, X.XB, X.sS, 1, 1));
    // ---- the wing (near): LE flap (fl_up), inner box (flank), flaperon (scap), outer box (fl_paw), tip (fl_lo)
    put("fl_up", J_HINGE.pLe, F_LIMB, jWing2(1.79, JW_TIP, 0, X.XF));
    put("flankL", [9.6, 1.3, 2.4], F_PLATE, jWing2(1.79, X.ZW1, X.XF, X.XT));
    put("scapL", J_HINGE.pScap, F_PLATE, jWing2(1.79, X.ZW2, X.XT, 1));
    put("fl_paw", [9.9, 1.3, 3.6], F_LIMB, jWing2(X.ZW1, X.ZW3, X.XF, X.XT), jWing2(X.ZW2, X.ZW3, X.XT, 1));
    put("fl_lo", [10.6, 1.3, 5.0], F_LIMB, jWing2(X.ZW3, JW_TIP, X.XF, 1));
    // ---- the tails (near): fin (hl_up), rudder (hl_lo), stabilator (hl_paw), boom (haunch)
    put("hl_up", jFinPt(0.3, 0.35, 0, [0, 0, 0]), F_LIMB, jFin2(0, 1, 0, X.VR));
    put("hl_lo", J_HINGE.pFin, F_LIMB, jFin2(0, 1, X.VR, 1));
    put("hl_paw", [14.0, 1.23, 2.0], F_LIMB, jStab2(0, 1, 0, 1));
    // (the booms: inner and outer edges from the plan view, filling between the nozzle and the stabilators)
    const boom = [[11.4, 1.6, 1.75, 0.03], [11.9, 1.42, 1.95, 0.13], [12.6, 1.3, 2.0, 0.17], [13.0, 1.0, 2.04, 0.18], [13.36, 0.66, 1.95, 0.17],
      [13.8, 0.6, 1.75, 0.12], [14.12, 0.62, 1.6, 0.07], [14.2, 0.8, 1.45, 0.02]].map((r) => [r[0], Math.min(0.14, r[3]), (r[2] - r[1]) / 2, 1.24 - 0.01 * (r[0] - 11.4) / 2.8, (r[1] + r[2]) / 2]);
    put("haunchL", [13.0, 1.25, 1.5], F_PLATE, S.loft(boom, { n: 3 }));
    // ---- the aft end and the nozzle: top (tail 1), bottom (tail 2), the hot inside (tail 3), the
    // burner face (tail 4, the exhaust's source at the exit)
    put("tail1", [13.2, 1.7, 0], F_CORE, jBoth(X.XA, JH_X1, 0, 1), jNozzle(-PI / 2, PI / 2, false));
    put("tail2", [13.2, 0.7, 0], F_CORE, jBoth(X.XA, JH_X1, 1, 2), jNozzle(PI / 2, 3 * PI / 2, false));
    put("tail3", [13.9, 1.21, 0], F_CORE, S.tag(jNozzle(0, TAU, true), { heat: 0.35 }));
    put("tail4", [JN.x1, JN.y, 0], F_CORE, S.disc(0, 0.34, { axis: "x", at: [13.76, JN.y, 0], heat: 0.5 }));
    // ---- the far side mirrors the near side
    for (const n of ["maneL1", "maneL2", "maneL3", "flankL", "scapL", "haunchL"]) P[n.replace(/L(\d?)$/, "R$1")] = mir(P[n]);
    for (const n of ["fl_up", "fl_lo", "fl_paw", "hl_up", "hl_lo", "hl_paw"]) P[n[0] + "r" + n.slice(2)] = mir(P[n]);
    P.back3 = mir(P.back1);
    return rigid(P, J_ROT, [0, 0, 0], [0, JT.YC, 0]);
  }
  const JH_ = J_HINGE;
  function jetAnimate(A, t, age) {
    // the afterburner: the nozzle burns hot and flickers
    const g = 0.8 + 0.12 * Math.sin(t * 9.1) * Math.sin(t * 5.3);
    A.glow("tail3", g).glow("tail4", g);
    // the control surfaces work a little (all at rest at both ends of the dwell)
    const a = age > 0 ? age : 0, k = smooth(0.2, 0.9, a) * (1 - smooth(J_DWELL - 1.3, J_DWELL - 0.45, a));
    if (k <= 0) return;
    const w1 = Math.sin(TAU * a / 2.3), w2 = Math.sin(TAU * a / 1.6 + 0.9), w3 = Math.sin(TAU * a / 2.9 + 2.1);
    const roll = 0.09 * w1 * k, pitch = 0.05 * w2 * k, yaw = 0.07 * w3 * k, lef = 0.05 * k;
    let h = JH_.scapL; A.wr("scapL", h[0], h[1], h[2], roll + 0.3 * pitch);
    h = JH_.scapR; A.wr("scapR", h[0], h[1], h[2], roll - 0.3 * pitch);
    h = JH_.hl_paw; A.wr("hl_paw", h[0], h[1], h[2], pitch + 0.4 * roll);
    h = JH_.hr_paw; A.wr("hr_paw", h[0], h[1], h[2], -pitch + 0.4 * roll);
    h = JH_.hl_lo; A.wr("hl_lo", h[0], h[1], h[2], yaw);
    h = JH_.hr_lo; A.wr("hr_lo", h[0], h[1], h[2], -yaw);
    h = JH_.fl_up; A.wr("fl_up", h[0], h[1], h[2], lef);
    h = JH_.fr_up; A.wr("fr_up", h[0], h[1], h[2], -lef);
  }
  // the nozzle's exit in tail4's own frame is its pivot
  PM.defineMode({
    name: "jet", kind: "vehicle", yaw: 0.4, dwell: J_DWELL,
    parts: function () { return jetParts(); },
    animate: jetAnimate,
    // the engine's jet: a fast, hot stream from the nozzle (afterburner), flickering a little; in
    // afterburner the nozzle opens to about 1.1 m across (0.73 m dry), so the jet is that wide
    exhaust: [{ part: "tail4", at: [0, 0, 0], dir: [1, 0, 0], speed: 3.6, nozzle: 0.55 * JK, heat: 1,
      power: (age, t) => 0.92 + 0.08 * Math.sin(t * 23.0) * Math.sin(t * 7.0) }],
  });

  /* ==================================================================
     STARSHIP
     Flat (natural) frame: belly-flop attitude, nose -x, the heat-shield
     side down (-y), the steel side up (+y), L = +z. The hull angle th is
     measured from +y toward +z. The whole ship is then rolled +90 deg
     about x: its steel side faces the viewer, the L flaps point down.
     ================================================================== */
  const SS = { XT: -1.86, XO: -0.62, XS: 1.3, XE: 1.46, R: 0.34, YC: 0.13 };
  const S_DWELL = 5.0, S_FLIP = [3.15, 4.35], S_LIGHT = 3.75;
  const S_ENG = ["fl_paw", "fr_paw", "hl_paw", "hr_paw", "fl_lo", "fr_lo"];
  function sR(x) {
    if (x >= SS.XO) return SS.R;
    const t = clamp((x - SS.XT) / (SS.XO - SS.XT), 0, 1);
    return SS.R * Math.pow(t * (2 - t), 0.6);
  }
  // hull panel: x in [x0, x1], th in [a0, a1] (degrees); normals outward (inward if o.inner)
  function sPanel(x0, x1, a0, a1, o) {
    o = o || {};
    const r0 = o.dr || 0, A0 = a0 * PI / 180, A1 = a1 * PI / 180;
    const gu = Math.max(4, Math.min(24, Math.round((a1 - a0) / 9))), gv = Math.max(4, Math.min(24, Math.round((x1 - x0) * 16)));
    return S.param(function (u, v, q) {
      const th = A0 + (A1 - A0) * u, x = x0 + (x1 - x0) * v, r = sR(x) + r0;
      q[0] = x; q[1] = r * Math.cos(th); q[2] = r * Math.sin(th);
    }, { gu, gv, flip: !!o.inner, heat: o.heat, w: o.w });
  }
  // a bell along +x: throat at x0 (radius rt), exit at x0 + len (radius re); outer and inner walls
  function sBell(x0, len, rt, re, cy, cz, heat) {
    const st = [], sti = [];
    for (let k = 0; k <= 6; k++) {
      const f = k / 6, r = rt + (re - rt) * Math.pow(f, 0.62);
      st.push([x0 + len * f, r, r, cy, cz]); sti.push([x0 + len * f, r * 0.93, r * 0.93, cy, cz]);
    }
    return [S.loft(st, { axis: "x", caps: false, heat }), S.loft(sti, { axis: "x", caps: false, heat: heat + 0.1 })];
  }
  // an engine: powerhead and bell, centred at (cy, cz) in the hull section
  function sEngine(x0, len, rt, re, cy, cz, ph) {
    return [sBell(x0, len, rt, re, cy, cz, 0.12), S.cyl(ph, 0.11, { axis: "x", at: [x0 - 0.11, cy, cz], r1: ph * 0.8 })];
  }
  const polar = (r, th) => [r * Math.cos(th * PI / 180), r * Math.sin(th * PI / 180)];   // [y, z]

  function starshipParts() {
    const P = {};
    const R = SS.R, XS = SS.XS, XE = SS.XE;
    const X0 = SS.XT + 0.2, X1 = -1.3, XJ = -0.98, X2 = -0.22, X3 = 0.5;
    const TOP = 92, SIDE = 140, TILE = { heat: -0.06 };
    // ---- nose
    P.neck = part([X0, 0, 0], F_CORE, [sPanel(SS.XT, X0, -180, 180)]);
    P.head = part([X1, 0, 0], F_CORE, [sPanel(X0, X1, -180, 180)]);
    // ---- the hull: steel top strips (core), side panels (mane), heat-shield tiles below
    P.chest = part([(X1 + X2) / 2, 0, 0], F_CORE, [sPanel(X1, X2, -TOP, TOP)]);
    P.belly = part([(X2 + X3) / 2, 0, 0], F_CORE, [sPanel(X2, X3, -TOP, TOP)]);
    P.hips = part([(X3 + XS) / 2, 0, 0], F_CORE, [sPanel(X3, XS, -TOP, TOP)]);
    P.maneL1 = part([X1, 0, sR(X1)], F_PLATE, [sPanel(X1, X2, TOP, SIDE)]);
    P.maneL2 = part([X2, 0, R], F_PLATE, [sPanel(X2, X3, TOP, SIDE)]);
    P.maneL3 = part([X3, 0, R], F_PLATE, [sPanel(X3, XS, TOP, SIDE)]);
    P.jaw = part([X1, -sR(X1), 0], F_CORE, [sPanel(X1, XJ, SIDE, 360 - SIDE, TILE)]);
    P.back1 = part([XJ, -R, 0], F_AFT, [sPanel(XJ, X2, SIDE, 360 - SIDE, TILE)]);
    P.back2 = part([X2, -R, 0], F_AFT, [sPanel(X2, X3, SIDE, 360 - SIDE, TILE)]);
    P.back3 = part([X3, -R, 0], F_AFT, [sPanel(X3, XS, SIDE, 360 - SIDE, TILE)]);
    // ---- flaps, hinged along the hull side (th = 90)
    const flap = (x0, x1, span, tip0, tip1, t) => {
      const xm = (x0 + x1) / 2, z0 = sR(xm) - 0.012;
      // S.plate in the plate frame: local x = machine -x
      return { at: [xm, 0, z0], rot: F_PLATE, shape: S.plate(x1 - x0, span, t, { w1: tip1 - tip0, sweep: -((tip0 + tip1) / 2 - xm) }) };
    };
    P.scapL = flap(-1.32, -0.9, 0.25, -1.1, -0.92, 0.026);
    P.flankL = flap(0.74, 1.4, 0.38, 0.98, 1.4, 0.034);
    // ---- hinge fairings (aerocovers) at the flap roots
    const cover = (x0, x1, rr) => {
      const xm = (x0 + x1) / 2;
      return part([x0, 0, sR(xm)], F_LIMB, [S.ellipsoid((x1 - x0) / 2, rr, rr, { at: [xm, 0, sR(xm) - 0.01], phi: [0, PI] })]);
    };
    P.fl_up = cover(-1.4, -0.8, 0.058);
    P.hl_up = cover(0.68, 1.44, 0.075);
    // ---- the chine: a strake along the hull side between the flaps
    P.hl_lo = part([-0.84, 0, R], F_LIMB, [S.box(1.54, 0.014, 0.05, { at: [-0.07, 0, R + 0.012], r: 0.006 })]);
    // ---- engine section: the skirt in quarters, the aft dome in halves
    const skirt = (a0, a1) => [sPanel(XS, XE, a0, a1), sPanel(XS, XE, a0, a1, { dr: -0.012, inner: true })];
    P.haunchL = part([XS, 0, R], F_PLATE, skirt(45, 135));
    P.tail3 = part([XS, 0, 0], F_CORE, skirt(-45, 45));
    P.tail4 = part([XS, 0, 0], F_CORE, skirt(135, 225));
    const dome = (t0, t1) => S.ellipsoid(0.06, 0.27, 0.27, { at: [XS + 0.03, 0, 0], theta: [t0, t1], phi: [-PI / 2, PI / 2], heat: 0.05 });
    P.tail1 = part([XS + 0.03, 0, 0], F_CORE, [dome(0, PI / 2)]);
    P.tail2 = part([XS + 0.03, 0, 0], F_CORE, [dome(PI / 2, PI)]);
    // six engines: four vacuum bells on the outer ring, two sea-level engines inside
    const XV = XS + 0.06;
    const vac = (th) => { const [y, z] = polar(0.215, th); return part([XV, y, z], F_LIMB, sEngine(XV, 0.42, 0.035, 0.1, y, z, 0.05)); };
    const sl = (th) => { const [y, z] = polar(0.085, th); return part([XV + 0.02, y, z], F_LIMB, sEngine(XV + 0.02, 0.2, 0.022, 0.055, y, z, 0.04)); };
    P.fl_paw = vac(45); P.hl_paw = vac(135); P.fl_lo = sl(90);
    // mirrors
    for (const n of ["maneL1", "maneL2", "maneL3", "scapL", "flankL", "haunchL"]) P[n.replace(/L(\d?)$/, "R$1")] = mir(P[n]);
    for (const n of ["fl_up", "hl_up", "fl_lo", "hl_lo", "fl_paw", "hl_paw"]) P[n[0] + "r" + n.slice(2)] = mir(P[n]);
    // roll the steel side toward the viewer
    return rigid(P, RX(PI / 2), [0, 0, 0], [0, SS.YC, 0]);
  }

  PM.defineMode({
    name: "starship", kind: "vehicle", yaw: 0.3, dwell: S_DWELL,
    parts: function () { return starshipParts(); },
    animate: function (A, t, age, aim, H_) {
      const a = age > 0 ? age : 0;
      // belly-flop: the flaps work in pairs, the hull rocks
      const k = smooth(0, 0.7, a) * (1 - smooth(S_FLIP[0] - 0.2, S_FLIP[0] + 0.3, a));
      const w1 = Math.sin(TAU * a / 1.9), w2 = Math.sin(TAU * a / 1.4 + 1.3);
      A.rx("scapL", (0.3 * w1 + 0.12 * w2) * k).rx("scapR", (0.3 * w1 - 0.12 * w2) * k);
      A.rx("flankL", (-0.22 * w1 + 0.1 * w2) * k).rx("flankR", (-0.22 * w1 - 0.1 * w2) * k);
      A.turn(0, 0, 1, 0.045 * w1 * k, 0, SS.YC, 0).turn(1, 0, 0, 0.05 * w2 * k, 0, SS.YC, 0);
      A.shift(0, 0.03 * Math.sin(TAU * a / 2.6) * k, 0);
      // the flip: nose up, the flaps fold for the climb, the engines light
      const f = smooth(S_FLIP[0], S_FLIP[1], a), fold = smooth(S_FLIP[0] + 0.3, S_FLIP[1] + 0.2, a);
      const over = 0.08 * Math.sin(PI * smooth(S_FLIP[1] - 0.25, S_FLIP[1] + 0.25, a));
      A.rx("scapL", -0.9 * fold).rx("scapR", -0.9 * fold).rx("flankL", -0.75 * fold).rx("flankR", -0.75 * fold);
      A.turn(0, 0, 1, -(PI / 2) * f - over * 0.4, 0, SS.YC, 0);
      const fire = smooth(S_LIGHT, S_LIGHT + 0.5, a);
      if (fire > 0) {
        const fl = fire * (0.82 + 0.18 * Math.sin(t * 37) * Math.sin(t * 23));
        for (let j = 0; j < S_ENG.length; j++) A.glow(S_ENG[j], fl);
        A.glow("tail1", 0.6 * fl).glow("tail2", 0.6 * fl).glow("haunchL", 0.3 * fl).glow("haunchR", 0.3 * fl).glow("tail3", 0.3 * fl).glow("tail4", 0.3 * fl);
      }
    },
    exhaust: [
      { part: "fl_paw", at: [0, -0.42, 0], dir: [0, -1, 0], power: (age) => 0.8 * smooth(S_LIGHT, S_LIGHT + 0.5, age) },
      { part: "fr_paw", at: [0, -0.42, 0], dir: [0, -1, 0], power: (age) => 0.8 * smooth(S_LIGHT, S_LIGHT + 0.5, age) },
      { part: "hl_paw", at: [0, -0.42, 0], dir: [0, -1, 0], power: (age) => 0.8 * smooth(S_LIGHT, S_LIGHT + 0.5, age) },
      { part: "hr_paw", at: [0, -0.42, 0], dir: [0, -1, 0], power: (age) => 0.8 * smooth(S_LIGHT, S_LIGHT + 0.5, age) },
      // cold-gas RCS puffs from the nose while it flies belly first
      { part: "head", at: [0.1, 0, 0.22], dir: [0, 0, 1], power: (age) => (age < S_FLIP[0] ? 0.35 * Math.pow(Math.max(0, Math.sin(age * 4.1)), 8) : 0) },
    ],
  });
})(typeof window !== "undefined" ? window : globalThis);

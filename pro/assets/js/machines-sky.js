/* =====================================================================
   machines-sky.js: the fighter of the ProMachines cycle (machines.js
   loads first; this file only calls ProMachines.defineMode; the
   spaceship lives in machines-space.js). Plain browser script; also
   loads in Node.

     jet       an F-35A-like single-engine stealth fighter, built from
               measurements (published dimensions and the official three-
               view outline traced in metres, checked on photos): the
               chined radome, the one-piece canopy, the intakes with their
               swept lips and bumps, the wing-root fairings, trapezoid wings
               (34 deg leading edge, forward-swept trailing edge), twin fins
               canted 20 deg, the stabilators on their booms and the round
               nozzle. It flies banked toward the viewer, so its planform
               reads; its control surfaces work a little; the afterburner
               glows and flickers.

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
  // plan view: half width of the body at the chine (forebody up to the cowl's forward point B, the intake
  // cowl from there, the wing roots, then (not traced: the booms carry the rest) the boat-tail closing on the
  // nozzle base)
  const JS_ZC = [[0.0,0.003],[0.13,0.089],[0.27,0.142],[0.4,0.207],[0.53,0.28],[0.65,0.327],[0.78,0.378],[0.92,0.425],[1.05,0.464],[1.18,0.487],[1.31,0.505],[1.44,0.517],[1.7,0.545],[2.0,0.588],[2.5,0.645],[3.0,0.707],[3.5,0.769],[4.0,0.834],[4.18,0.87],[4.24,0.888],[4.25,0.891],
    [4.26,1.471],[4.299,1.499],[4.355,1.527],[4.411,1.561],[4.467,1.589],[4.523,1.617],[4.579,1.645],[4.636,1.673],[4.692,1.679],[5.0,1.692],[5.5,1.713],[6.0,1.735],[6.5,1.756],[7.05,1.78],[7.5,1.786],[8.5,1.801],[9.5,1.817],[10.5,1.831],[11.5,1.846],[12.4,1.86],
    [12.54,1.888],[12.6,1.91],[12.8,1.98],[13.0,2.03],[13.36,1.95]];
  // the canopy glass: [x, top (on the centre line), sill (its lower edge, side view)]
  const JS_CAN = [[1.979,1.752,1.735],[2.05,1.799,1.678],[2.15,1.86,1.673],[2.3,1.954,1.668],[2.45,2.049,1.662],[2.6,2.14,1.657],[2.8,2.252,1.657],[3.0,2.332,1.675],[3.2,2.371,1.725],[3.4,2.387,1.782],[3.6,2.398,1.837],[3.8,2.392,1.892],[4.0,2.375,1.949],[4.2,2.359,2.004],[4.35,2.343,2.046],[4.44,2.336,2.074],[4.47,2.331,2.144],[4.5,2.33,2.206],[4.54,2.33,2.28],[4.574,2.33,2.302]];
  const JC_X0 = 1.979, JC_X1 = 4.574;
  // the canopy's frame (sill lines and the bow), drawn bold enough to show at N = 18000; the bow's place
  const JC_R = 0.03, JC_FR = { w: 2.4, heat: -0.25 }, JC_BOW = { w: 2.4, heat: -0.25 }, JB_X = 2.94, JB_LEAN = 0.12;
  // the intake's lip line (bold, so the swept mouth reads) and the wall that closes the duct behind it
  const JL_R = 0.03, JL_LN = { w: 1.5, heat: 0.05 }, JD_XW = 5.15;
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
  const JW_LB0 = 7.2, JW_LB1 = 12.45;   // where the lobe under the wing root starts and ends
  const JS_LOW = [[0, 0, 0, 0], [7.2, 0, 0, 0], [7.9, 0.2, 0.1, 0.1], [8.6, 0.45, 0.14, 0.22], [9.4, 0.58, 0.15, 0.29], [10.8, 0.58, 0.15, 0.29],
    [11.6, 0.4, 0.12, 0.2], [12.2, 0.12, 0.04, 0.05], [12.45, 0, 0, 0], [13.36, 0, 0, 0]];
  const J_SL = 0.3;                 // the share of the lower section's parameter taken by the lobe
  const JS_BELLY = [[10.4, 0.17], [11.3, 0.185], [12.2, 0.2]];
  // the forebody's own half width where the intakes stand beside it (the body without the cowls)
  const JS_ZF = [[4.0,0.834],[4.18,0.87],[4.31,0.909],[4.445,0.949],[4.574,1.005],[4.692,1.03],[5.3,1.08]];
  const jZF = lin(JS_ZF, 1);
  // the intake lip (near side): upper-inboard A (on the forebody's edge), upper-outboard B (the cowl's forward
  // point), lower-outboard C, lower-inboard D; the deck at the intakes blends back into the regular deck by JD_X1
  const JL = { A: [4.72, 1.46, 1.032], B: [4.26, 1.21, 1.471], C: [4.798, 0.536, 1.2], D: [5.05, 0.54, 0.59] };
  const JD_X0 = 4.24, JD_X1 = 5.6;
  const JH_X1 = 13.36, JH_N = 1336, JH_C = 21;
  let JH = null;
  // the hull section at x, tabulated every 1 cm: [yS (top centre, or the canopy's sill), yC, zC, yB, pU, 1/qU, pL, 1/qL, tap, wc,
  // zL, yL (the lower side's top edge: the chine, or the wing root fairing's outer edge under the wing), keel depth, zM, yM,
  // and at the intakes: zJ, yJ (the forebody's deck edge), zU, yU (the upper lip), bl (0: the intake's deck, 1: the
  // regular deck), yE (the deck's height over the forebody's side)]
  const JSec = { yS: 0, yC: 0, zC: 0, yB: 0, pU: 2, iqU: 1, pL: 2, iqL: 1, tap: 0, wc: 0, zL: 0, yL: 0, keel: 0, zM: 0, yM: 0,
    zJ: 0, yJ: 0, zU: 0, yU: 0, bl: 1, yE: 0 };
  // the deck's height at z (near side) in the section c: the regular deck is a superellipse from the top centre (or
  // the canopy's edge) down to the chine; at the intakes it is the forebody's own deck down to its edge J, flat
  // across the open mouth to the upper lip U, then the cowl's top from the lip down to the chine; aft of A it
  // blends back into the regular deck
  function jDeckY(c, z) {
    const zc = c.zC, a = c.wc / zc, m = Math.min(1, Math.max(0, (z / zc - a) / (1 - a)));
    let y = c.yC + (c.yS - c.yC) * Math.pow(Math.max(0, 1 - Math.pow(m, c.pU)), c.iqU);
    if (c.bl < 1) {
      let y2;
      if (z <= c.zJ) {
        const mi = Math.min(1, Math.max(0, (z - c.wc) / Math.max(1e-6, c.zJ - c.wc)));
        y2 = c.yJ + (c.yS - c.yJ) * Math.pow(Math.max(0, 1 - Math.pow(mi, c.pU)), c.iqU);
      } else if (z <= c.zU) y2 = c.yJ;
      else y2 = c.yU + (c.yC - c.yU) * (z - c.zU) / Math.max(1e-6, zc - c.zU);
      y = y2 + (y - y2) * c.bl;
    }
    return y;
  }
  const JROW = Object.assign({}, JSec);
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
        // the deck at the intakes: the forebody's edge J rises with the upper lip from B to A (where they meet),
        // the lip U runs from B to A; aft of A the junction stays at A and fades into the regular deck
        const A = JL.A, B = JL.B, t = clamp((xi - B[0]) / (A[0] - B[0]), 0, 1);
        if (xi <= JD_X0 || xi >= JD_X1) { JH[o + 15] = JH[o + 17] = JH[o + 2]; JH[o + 16] = JH[o + 18] = JH[o + 1]; JH[o + 19] = 1; }
        else if (xi <= A[0]) {
          JH[o + 15] = Math.min(jZF(xi), JH[o + 2]); JH[o + 16] = B[1] + (A[1] - B[1]) * t;
          JH[o + 17] = xi < B[0] ? JH[o + 2] : B[2] + (A[2] - B[2]) * t; JH[o + 18] = JH[o + 16]; JH[o + 19] = 0;
        } else { JH[o + 15] = JH[o + 17] = A[2]; JH[o + 16] = JH[o + 18] = A[1]; JH[o + 19] = smooth(A[0], JD_X1, xi); }
        const R = JROW;
        R.yS = JH[o]; R.yC = JH[o + 1]; R.zC = JH[o + 2]; R.pU = JH[o + 4]; R.iqU = JH[o + 5]; R.wc = JH[o + 9];
        R.zJ = JH[o + 15]; R.yJ = JH[o + 16]; R.zU = JH[o + 17]; R.yU = JH[o + 18]; R.bl = JH[o + 19];
        JH[o + 20] = jDeckY(R, Math.min(jZF(xi), JH[o + 2]));
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
    JSec.zJ = H[o + 15] + (H[o2 + 15] - H[o + 15]) * w; JSec.yJ = H[o + 16] + (H[o2 + 16] - H[o + 16]) * w; JSec.zU = H[o + 17] + (H[o2 + 17] - H[o + 17]) * w;
    JSec.yU = H[o + 18] + (H[o2 + 18] - H[o + 18]) * w; JSec.bl = H[o + 19] + (H[o2 + 19] - H[o + 19]) * w; JSec.yE = H[o + 20] + (H[o2 + 20] - H[o + 20]) * w;
    return JSec;
  }
  // a point of the hull at x and section parameter s: 0 = the top centre (or the canopy's edge), 1 = the
  // chine, 2 = the bottom centre; on the near side (z >= 0)
  function jHull(x, s, q) {
    const c = jSec(x);
    if (s <= 1) {
      const m = Math.sin(s * PI / 2), a = c.wc / c.zC;
      q[2] = c.zC * (a + (1 - a) * m);
      q[1] = jDeckY(c, q[2]);
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
  // the bump of the diverterless inlet on the forebody's side, under its chine: it rises from x 3.55, stands
  // out up to 0.1 m about 1.0 m up (1.15 m inside the opening, where its inboard edge bulges most in the
  // front view) and fades by the wall that closes the duct; yTop is the side's upper edge (it fades below it)
  function jBump(x, y, yTop) {
    if (x < 3.55 || x > JD_XW) return 0;
    const fx = smooth(3.55, 4.4, x) * (1 - smooth(4.95, JD_XW, x)), d = (y - 1.0 - 0.15 * smooth(4.3, 4.8, x)) / 0.24;
    return 0.1 * fx * Math.exp(-d * d) * smooth(yTop - 0.02, yTop - 0.2, y);
  }
  // the hull with the bump on the forebody's side (ahead of the lips), and the forebody continued inside the
  // intakes (its own narrower section, up to the deck's edge); seen from above the bump never stands out
  // past the side's upper edge until the deck covers it (behind A)
  function jHullB(x, s, q, fore) {
    let zTop, yTop;
    if (fore) {
      const c = jSec(x), zc = c.zC;
      c.zC = Math.min(zc, jZF(x)); c.yC = c.yE;
      if (c.wc > 0.95 * c.zC) c.wc = 0.95 * c.zC;
      // the same formulas with the narrower section (jSec's row is not re-read below)
      const m = Math.cos(Math.max(0, (s - 1 - J_SL) / (1 - J_SL)) * PI / 2), f = Math.pow(Math.max(0, 1 - Math.pow(m, c.pL)), c.iqL);
      // (inside the opening its lower part leans in toward the floor's inboard corner D)
      const f3 = f * f * f;
      q[0] = x; q[1] = c.yC - (c.yC - c.yB) * f; q[2] = c.zC * m * (1 - c.tap * f) * (1 - 0.35 * smooth(JD_X0, 4.6, x) * f3);
      zTop = c.zC; yTop = c.yC;
      c.zC = zc;
    } else { jHull(x, s, q); zTop = JSec.zC; yTop = JSec.yC; }
    if (s > 1 + J_SL - 1e-9 && (fore || x < JD_X0)) {
      const b = jBump(x, q[1], yTop);
      if (b > 0) {
        let z = q[2] + b;
        if (x < JL.A[0]) { const lim = zTop + 0.01 + 0.3 * smooth(4.55, JL.A[0], x); if (z > lim) z = lim; }
        q[2] = z;
      }
    }
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
  // ---- the intake lip (JL, near side)
  // section parameters along the lip (tabulated once): the upper lip cuts the deck between the forebody
  // and the cowl's top; the outer and lower lips start the cowl's walls; the inboard edge of the opening
  // (A -> D, sA on the forebody's side) parts the side ahead of the opening from the duct behind it
  let JLT = null;
  function jLipTabs() {
    if (JLT) return JLT;
    const NX = 60, X0 = 4.24, X1 = 5.24, sF = [], sU = [], sL = [], sI = [], sA = [], q = [0, 0, 0];
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
      // (the lobe under the wing root has no size here: search the lower side only)
      sL.push(jHullS(x, p[2], p[1], 1 + J_SL, 2));
      const si = jHullS(x, JL.D[2], JL.D[1], 1 + J_SL, 2);
      sI.push(si);
      // where the forebody's side (its own section) crosses the height of the line A -> D at this x
      const yAD = JL.A[1] + (JL.D[1] - JL.A[1]) * (x - JL.A[0]) / (JL.D[0] - JL.A[0]);
      if (x <= JL.A[0]) sA.push(1 + J_SL);
      else if (x >= JL.D[0]) sA.push(si);
      else {
        let lo = 1 + J_SL, hi = si;
        for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; jHullB(x, mid, q, true); if (q[1] > yAD) lo = mid; else hi = mid; }
        sA.push((lo + hi) / 2);
      }
    }
    const tab = (arr) => (x) => { const f = clamp((x - X0) / (X1 - X0), 0, 1) * NX, i = Math.min(NX - 1, f | 0), w = f - i; return arr[i] + (arr[i + 1] - arr[i]) * w; };
    JLT = { sF: tab(sF), sU: tab(sU), sL: tab(sL), sI: tab(sI), sA: tab(sA) };
    return JLT;
  }
  // the forebody's side inside the intake (with the bump), from the deck's edge down to the duct's floor: the
  // part ahead of the opening's inboard edge A -> D (out in the air, as bright as the skin), or the part behind
  // it (inside the duct: sparse, so the mouth reads dark)
  function jInner(x0, x1, inside, side, o) {
    o = o || {};
    const L = jLipTabs(), sB = (x) => Math.max(1 + J_SL + 0.02, L.sI(x));
    return inside ? jBand(x0, x1, 1 + J_SL, (x) => Math.min(sB(x), L.sA(x)), side, Object.assign({ fore: true }, o))
      : jBand(x0, x1, (x) => Math.min(sB(x), L.sA(x)), sB, side, Object.assign({ fore: true }, o));
  }
  // the duct closed a little behind the opening (at x): a sparse wall across the duct, between the forebody's
  // side and the hull round it (the deck over the duct, the cowl's wall, the floor), so the mouth reads dark
  // and nothing deeper shows through it; it faces forward, and its heat is taken down to the skin's
  function jDuctWall(x, side, o) {
    o = o || {};
    const L = jLipTabs(), q = [0, 0, 0], s0 = L.sF(x), s1 = L.sI(x), f1 = Math.max(1 + J_SL + 0.02, s1);
    return S.param(function (u, v, out) {
      jHull(x, s0 + (s1 - s0) * u, q); const oy = q[1], oz = q[2];
      jHullB(x, 1 + J_SL + (f1 - 1 - J_SL) * u, q, true);
      out[0] = x; out[1] = oy + (q[1] - oy) * v; out[2] = side * (oz + (q[2] - oz) * v);
    }, { gu: 28, gv: 6, flip: side > 0, w: o.w, heat: o.heat, glow: o.glow });
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
  // ---- the aft fairing (x 12.6 .. 13.36): the hull's section at 12.6 turns into the nozzle's base circle
  // (1.29 m across, axis 1.21 m up) in the middle and the flat tail booms to the sides (1.08 .. 1.38 m up,
  // out to 1.95 m), where the booms and the nozzle carry on aft
  const JA_X0 = 12.6, JA_X1 = 13.36;
  function jAftPt(x, s, side, q) {
    jHull(JA_X0, s, q);
    const t = smooth(JA_X0, JA_X1, x), zw = q[2] * (1 + 0.045 * Math.sin(PI * Math.min(1, (x - JA_X0) / 0.5)) * 0 + (1.95 / 1.91 - 1) * t);
    const z = zw, r = 0.645, up = s <= 1, c = z < r ? Math.sqrt(r * r - z * z) : 0;
    let yt = up ? Math.max(1.38, 1.21 + c) : Math.min(1.08, 1.21 - c);
    if (z > 1.7) { const e = Math.min(1, (z - 1.7) / 0.25); yt += (1.23 - yt) * e * e; }
    q[0] = x; q[1] = q[1] + (yt - q[1]) * t; q[2] = side * z;
    return q;
  }
  function jAft(s0, s1, side, o) {
    o = o || {};
    return S.param(function (u, v, q) { jAftPt(JA_X0 + (JA_X1 - JA_X0) * u, s0 + (s1 - s0) * v, side, q); },
      { gu: o.gu || 16, gv: o.gv || 28, flip: side > 0, w: o.w, heat: o.heat, glow: o.glow });
  }
  const jAftBoth = (s0, s1, o) => [jAft(s0, s1, 1, o), jAft(s0, s1, -1, o)];
  // ---- the nozzle: base 1.29 m across at x 13.36, exit at 14.05, axis 1.21 m up; the outer flaps end in a
  // sawtooth rim. The afterburner is always lit, and lit the F135's nozzle opens from its dry 0.73 m to about
  // 1.1 m across: drawn open, the exit is the engine's jet (the exhaust below)
  const JN = { x0: 13.36, x1: 14.05, r0: 0.645, r1: 0.55, y: 1.21, teeth: 15, tooth: 0.075 };
  function jNozzle(a0, a1, inner, o) {
    o = o || {};
    const N = JN, v0 = o.v0 || 0, v1 = o.v1 == null ? 1 : o.v1;
    return S.param(function (u, v, q) {
      const a = a0 + (a1 - a0) * u, saw = Math.abs(((a * N.teeth / TAU) % 1 + 1) % 1 - 0.5) * 2;
      const xs = N.x0, xe = N.x1 - N.tooth * saw, x = xs + (xe - xs) * (v0 + (v1 - v0) * v), f = (x - N.x0) / (N.x1 - N.x0);
      const r = (N.r0 + (N.r1 - N.r0) * Math.pow(f, 0.9)) * (inner ? 0.9 : 1);
      q[0] = x; q[1] = N.y + r * Math.cos(a); q[2] = r * Math.sin(a);
    }, { gu: o.gu || 60, gv: o.gv || 8, flip: !!inner, w: o.w, heat: o.heat, glow: o.glow });
  }
  // the cuts between the rig's parts (metres along x; section parameters s: 0 top, 1 chine, 2 bottom)
  const JP = {
    XN: 1.3, XR: 1.75, sJ: 1.58, XS: 1.5, sH: 0.6,   // radome | forward fuselage (the radome's deck runs on to XR); the chin
                                               // below sJ; side | bump; the cockpit deck down to sH, the forebody's side below it
    XM: 7.1, XW: 7.1, sM: 1.73, sN: 1.9, XL2: 9.4,    // the cowl | the trunk wall; the wall above sM, the belly below
    XQ: 4.72, sS: 0.3, sR: 0.55, XC: 7.6, XB: 11.3, XH: 10.7, XT: 12.0, XT1: 11.8, XY: 6.6,  // cockpit deck end (A); spine | deck; the far shoulder (mane R1) from sR; ...; the aft deck's tail1 from XT1
    XA: 12.6,                                  // the aft fairing round the nozzle's base
    ZW1: 3.25, ZW2: 4.15, ZW3: 4.4, XF: 0.11, XE: 0.78, VR: 0.6,   // wing panels; LE flap, flaperon; rudder
  };
  // the bank toward the viewer (top to +z) and a touch of nose-up, about the flat frame's origin
  const J_ROT = mul(RZ(-JT.PITCH), RX(JT.BANK));
  // a machine-frame axis (after the bank) from a flat-frame direction in metres
  const jAxis = (d) => { const v = app(J_ROT, d), L = Math.hypot(v[0], v[1], v[2]); return [v[0] / L, v[1] / L, v[2] / L]; };
  // hinge lines (near side, flat frame): the flaperon (along its leading edge), the stabilator's pivot
  // (spanwise), the rudder (along its leading edge in the fin plane), the LE flap (along its rear edge)
  const J_HINGE = (function () {
    const q0 = jWingPt(1.95, JP.XE, true, [0, 0, 0]), q1 = jWingPt(JP.ZW2, JP.XE, true, [0, 0, 0]);
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
    const GL = { w: 0.22, heat: 0.06 };                                  // glazing: sparse (dark) and a little warm
    const LN = { w: 0.5 };                                               // detail lines: subtle
    const DUCT = { w: 0.25 }, DUCTW = { w: 0.14, heat: -0.6 };           // the duct inside the mouth: sparse (dark)
    const along = (x0, x1, n, f) => { const o = []; for (let k = 0; k <= n; k++) o.push(f(x0 + (x1 - x0) * k / n)); return o; };
    const frame = (side) => along(JC_X0, JC_X1, 28, (x) => { const c = jSec(x); return [x, c.yS, side * c.wc]; });
    // the canopy's frame bow: an arch over the glass 37 % of the way back (measured on photos), leaning aft at the top
    const bow = along(-1, 1, 24, (k) => { const ph = k * PI / 2, x = JB_X + JB_LEAN * Math.cos(ph), c = jSec(x), top = jGT(x);
      return [x, c.yS + (top - c.yS) * Math.cos(ph), c.wc * Math.sin(ph)]; });
    const crease = (x0, x1, side) => along(x0, x1, Math.round((x1 - x0) * 8), (x) => { const q = jHull(x, 1, [0, 0, 0]); return [q[0], q[1], side * q[2]]; });
    // the forebody's chine, rising from B's height to A beside the open mouth (the deck's edge)
    const edge = (side) => along(JD_X0, JL.A[0], 10, (x) => { const c = jSec(x); return [x, c.yE, side * Math.min(jZF(x), c.zC)]; });
    // ---- the radome, the chin with the targeting window, the forward fuselage, the canopy
    put("neck", [0.8, 1.15, 0], F_CORE, jBoth(0, X.XN, 0, 1), jBoth(0, X.XN, 1 + J_SL, 2), jBoth(X.XN, X.XR, 0, 1));
    put("jaw", [2.6, 0.6, 0], F_CORE, jBoth(X.XN, 4.24, X.sJ, 2),
      S.ellipsoid(0.3, 0.08, 0.2, { at: [1.72, 0.5, 0], theta: [PI / 2, PI], w: 0.5, heat: 0.18 }));
    put("chest", [4.8, 1.0, 0], F_CORE, jBoth(X.XN, X.XS, 1 + J_SL, X.sJ), jBand(X.XQ, X.XC, 0, 1, 1), jBand(X.XQ, X.XC, 0, X.sR, -1),
      jBand(4.24, 5.05, L.sI, 2, 1), jBand(5.05, X.XY, X.sN, 2, 1), jLine(crease(0.25, 4.24, 1).concat(edge(1)), 0.016, LN), jLine(crease(0.25, 4.24, -1).concat(edge(-1)), 0.016, LN));
    put("head", [3.3, 1.9, 0], F_CORE, S.tag(S.join(jCanopy(JC_X0, JC_X1, 1), jCanopy(JC_X0, JC_X1, -1)), GL), jBoth(X.XR, JC_X0, 0, 1), jBoth(JC_X0, 4.24, 0, X.sH),
      jBoth(4.24, X.XQ, 0, L.sF), jLine(frame(1), JC_R, JC_FR), jLine(frame(-1), JC_R, JC_FR), jLine(bow, JC_R, JC_BOW));
    // ---- the intakes (near side; the far side mirrors): the cowl with its lips (mane 1), the trunk's wall
    // (mane 2), the forebody's side under the cockpit deck, the bump, the duct's inner wall and the wall that
    // closes the duct (mane 3)
    const lip = [JL.A, JL.B, JL.C, JL.D].map((p) => [p[0], p[1], p[2]]);
    put("maneL1", [4.9, 0.95, 1.5], F_PLATE, jBand(JL.B[0] + 0.005, 5.05, 1 + J_SL, L.sL, 1), jBand(5.05, X.XM, 1 + J_SL, X.sM, 1),
      jBand(JL.B[0] + 0.005, JL.A[0], L.sU, 1, 1), jLine(lip, JL_R, JL_LN), jLine(crease(JL.B[0] + 0.04, 7.15, 1), 0.016, LN));
    put("maneL2", [7.0, 0.95, 1.7], F_PLATE, jBand(X.XM, JW_LB0, 1 + J_SL, X.sM, 1), jBand(JW_LB0, X.XL2, 1 + 1e-6, X.sM, 1));
    put("maneL3", [4.0, 0.9, 0.9], F_PLATE, jBand(JC_X0, 4.24, X.sH, 1, 1), jBand(X.XS, 4.24, 1 + J_SL, X.sJ, 1), jInner(4.24, JL.D[0], false, 1), jInner(JL.A[0], JD_XW, true, 1, DUCT),
      S.tag(jDuctWall(JD_XW, 1), DUCTW), jBand(5.05, X.XY, X.sM, X.sN, 1));
    // ---- the belly (the bays' doors between the intake trunks) and the aft fuselage
    put("belly", [8.7, 0.25, 0], F_CORE, jBoth(X.XY, X.XH, X.sM, 2), jBand(X.XL2, X.XH, 1 + 1e-6, X.sM, 1));
    put("hips", [10.8, 0.8, 0], F_CORE, jBoth(X.XH, X.XT, 1 + 1e-6, 2), jBoth(X.XB, X.XT1, 0, 1));
    // ---- the spine (back 2) and the decks over the wing roots (back 1 near, back 3 far)
    put("back2", [8.3, 2.1, 0], F_AFT, jBoth(X.XC, X.XB, 0, X.sS));
    put("back1", [8.8, 1.6, 1.1], F_AFT, jBand(X.XC, X.XB, X.sS, 1, 1));
    // ---- the wing (near): LE flap (fl_up), inner box (flank), flaperon (scap), outer box (fl_paw), tip (fl_lo)
    const G = 0.006;                                                     // half the hinge gaps (chord fractions)
    put("fl_up", J_HINGE.pLe, F_LIMB, jWing2(1.79, JW_TIP, 0, X.XF - G));
    put("flankL", [9.6, 1.3, 2.4], F_PLATE, jWing2(1.79, X.ZW1, X.XF + G, X.XE - G));
    put("scapL", J_HINGE.pScap, F_PLATE, jWing2(1.79, X.ZW2, X.XE + G, 1));
    put("fl_paw", [9.9, 1.3, 3.6], F_LIMB, jWing2(X.ZW1, X.ZW3, X.XF + G, X.XE - G), jWing2(X.ZW2, X.ZW3, X.XE - G, 1));
    put("fl_lo", [10.6, 1.3, 5.0], F_LIMB, jWing2(X.ZW3, JW_TIP, X.XF + G, 1));
    // ---- the tails (near): fin (hl_up), rudder (hl_lo), stabilator (hl_paw), boom (haunch)
    put("hl_up", jFinPt(0.3, 0.35, 0, [0, 0, 0]), F_LIMB, jFin2(0, 1, 0, X.VR - 0.008));
    put("hl_lo", J_HINGE.pFin, F_LIMB, jFin2(0.04, 0.97, X.VR + 0.008, 1), jFin2(0, 0.04, X.VR - 0.008, 1), jFin2(0.97, 1, X.VR - 0.008, 1));
    put("hl_paw", [14.0, 1.23, 2.0], F_LIMB, jStab2(0, 1, 0, 1));
    // (the booms: inner and outer edges from the plan view, filling between the nozzle and the stabilators)
    const boom = [[13.22, 0.8, 1.85, 0.06], [13.36, 0.66, 1.95, 0.15], [13.6, 0.62, 1.86, 0.14],
      [13.8, 0.6, 1.75, 0.12], [14.12, 0.62, 1.6, 0.07], [14.2, 0.8, 1.45, 0.02]].map((r) => [r[0], Math.min(0.14, r[3]), (r[2] - r[1]) / 2, 1.24 - 0.01 * (r[0] - 11.4) / 2.8, (r[1] + r[2]) / 2]);
    put("haunchL", [13.0, 1.25, 1.5], F_PLATE, S.loft(boom, { n: 3, caps: false }));
    // ---- the aft end and the nozzle: top (tail 1), bottom (tail 2), the upper flaps and the hot liner (tail 3),
    // the lower flaps and the burner face (tail 4, the exhaust's source at the exit)
    put("tail1", [12.4, 1.7, 0], F_CORE, jBoth(X.XT1, X.XA, 0, 1), jAftBoth(0.3, 1));
    put("tail2", [12.4, 0.7, 0], F_CORE, jBoth(X.XT, JW_LB1, 1 + 1e-6, 2), jBoth(JW_LB1, X.XA, 1 + J_SL, 2), jAftBoth(1 + J_SL, 1.84));
    // (the liner glows only near the exit: further in, a few cm under the flaps, it would show through them)
    put("tail3", [13.6, 1.5, 0], F_CORE, jNozzle(0, TAU, true, { v1: 0.82, gv: 6, glow: 0 }), jNozzle(0, TAU, true, { v0: 0.82, gv: 2, heat: 0.35 }),
      S.tag(S.join(jNozzle(-PI / 2, PI / 2, false), jAftBoth(0, 0.3)), { glow: 0.12 }));
    put("tail4", [JN.x1, JN.y, 0], F_CORE, S.disc(0, 0.34, { axis: "x", at: [13.76, JN.y, 0], heat: 0.5 }),
      S.tag(S.join(jNozzle(PI / 2, 3 * PI / 2, false), jAftBoth(1.84, 2)), { glow: 0.12 }));
    // ---- the far side mirrors the near side
    for (const n of ["maneL1", "maneL2", "maneL3", "flankL", "scapL", "haunchL"]) P[n.replace(/L(\d?)$/, "R$1")] = mir(P[n]);
    for (const n of ["fl_up", "fl_lo", "fl_paw", "hl_up", "hl_lo", "hl_paw"]) P[n[0] + "r" + n.slice(2)] = mir(P[n]);
    P.back3 = mir(P.back1);
    // the other machines give their far-side plates (mane R) far more points than the near ones (mane L): the far
    // intake carries some of the far side's skin next to it (the shoulder above it, the belly behind it, the floor
    // under it), so it is about as dense as the near one
    const addTo = (name, ...shapes) => { const e = P[name], Rt = tr(H.rot(e.rot)), o = app(Rt, e.at);
      e.shape = S.join(e.shape, S.place(S.place(S.join(shapes), J_OFF, null, JK), [-o[0], -o[1], -o[2]], Rt)); };
    addTo("maneR1", jBand(X.XQ, X.XC, X.sR, 1, -1));
    addTo("maneR2", jBand(X.XL2, X.XH, 1 + 1e-6, X.sM, -1));
    addTo("maneR3", jBand(4.24, 5.05, L.sI, 2, -1), jBand(5.05, X.XY, X.sN, 2, -1));
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
    // the engine's jet: a fast, hot stream from the nozzle (afterburner), flickering a little
    // THE OWNER ASKED FOR AN AGGRESSIVE JET: the afterburner is lit, and lit the F135 nozzle opens to
    // about 1.1 m across (0.73 m is its closed, dry exit), so the jet is 0.55 m in radius (JN.r1, the
    // drawn exit): keep it so
    exhaust: [{ part: "tail4", at: [0, 0, 0], dir: [1, 0, 0], speed: 3.6, nozzle: JN.r1 * JK, heat: 1,
      power: (age, t) => 0.92 + 0.08 * Math.sin(t * 23.0) * Math.sin(t * 7.0) }],
  });
})(typeof window !== "undefined" ? window : globalThis);

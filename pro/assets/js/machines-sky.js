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
     JET: an F-35-like stealth fighter
     Flat frame: fuselage datum y = 0, nose at x = -1.75, span along z
     (L = +z). Every part is authored in this frame, then the whole set
     is banked toward the viewer (its top tilts to +z) and lifted to YC.
     ================================================================== */
  const JT = { BANK: 0.52, PITCH: 0.04, YC: 0.0, XL: -0.68 };
  const J_DWELL = 4.5;
  // the deck: everything above the chine. [x, zC (chine half width), yC (chine height), yT (top), mU (chine slope)]
  const J_DECK = stations([
    [-1.75, 0.0, -0.02, -0.02, 2.4], [-1.66, 0.042, -0.018, 0.008, 2.4], [-1.52, 0.082, -0.012, 0.04, 2.5],
    [-1.36, 0.116, -0.005, 0.07, 2.5], [-1.2, 0.143, 0.002, 0.094, 2.4], [-1.04, 0.163, 0.008, 0.11, 2.2],
    [-0.88, 0.177, 0.014, 0.12, 2.0], [-0.76, 0.186, 0.018, 0.126, 1.8],
    [-0.66, 0.30, 0.026, 0.132, 0.6], [-0.45, 0.33, 0.03, 0.142, 0.4], [-0.17, 0.36, 0.032, 0.155, 0.3],
    [0.4, 0.36, 0.032, 0.162, 0.3], [1.07, 0.36, 0.032, 0.14, 0.3], [1.25, 0.29, 0.03, 0.13, 0.6], [1.42, 0.165, 0.02, 0.135, 1.4],
  ]);
  // the forward fuselage below the chine: [x, zC, yC, yB, phiL (deg), lamL, kL]
  const J_FWD = stations([
    [-1.75, 0.0, -0.02, -0.02, 35, 0.5, 0.6], [-1.66, 0.042, -0.018, -0.05, 38, 0.5, 0.6], [-1.52, 0.082, -0.012, -0.086, 40, 0.5, 0.6],
    [-1.36, 0.116, -0.005, -0.112, 45, 0.5, 0.62], [-1.2, 0.143, 0.002, -0.136, 50, 0.55, 0.65], [-1.04, 0.163, 0.008, -0.155, 55, 0.6, 0.7],
    [-0.88, 0.177, 0.014, -0.17, 60, 0.6, 0.7], [-0.76, 0.186, 0.018, -0.18, 62, 0.6, 0.72], [-0.6, 0.19, 0.02, -0.186, 64, 0.6, 0.72],
  ]);
  // the main body below the chine (intake trunks, weapon bays): [x, zC, yC, yB, phiL, lamL, kL]
  const J_MAIN = stations([
    [-0.68, 0.30, 0.026, -0.19, 76, 0.7, 0.8], [-0.45, 0.33, 0.03, -0.2, 76, 0.7, 0.82], [-0.17, 0.36, 0.032, -0.205, 75, 0.7, 0.82],
    [0.4, 0.36, 0.032, -0.205, 74, 0.7, 0.82], [1.07, 0.36, 0.032, -0.18, 70, 0.7, 0.8], [1.25, 0.29, 0.03, -0.15, 64, 0.6, 0.75],
    [1.42, 0.165, 0.02, -0.12, 55, 0.55, 0.7],
  ]);
  // the canopy: footprint half width and height over the deck
  const J_CAN = { x0: -1.13, x1: -0.4, W: 0.094, H: 0.125 };
  function canW(x) {
    const t = (x - J_CAN.x0) / (J_CAN.x1 - J_CAN.x0);
    if (!(t > 0 && t < 1)) return 0;
    return J_CAN.W * Math.sqrt(Math.sin(PI * Math.pow(t, 0.756)));
  }
  function canH(x) {
    const t = (x - J_CAN.x0) / (J_CAN.x1 - J_CAN.x0);
    if (!(t > 0 && t < 1)) return 0;
    return J_CAN.H * Math.pow(Math.sin(PI * Math.pow(t, 0.66)), 0.8);
  }
  // deck height at (x, z >= 0)
  function deckY(x, z) {
    const d = J_DECK.at(x), zC = d[0];
    if (zC < 1e-6) return d[1];
    let w = z / zC; if (w > 1) w = 1;
    const w2 = w * w, w3 = w2 * w, g = 2 * w3 - 3 * w2 + 1 - d[3] * (w3 - w2);
    return d[1] + (d[2] - d[1]) * g;
  }
  // deck skin over x in [x0, x1], from the canopy edge (or z = 0) out to the fraction f1 of the chine
  function jDeck(x0, x1, f0, f1, o) {
    o = o || {};
    return S.param(function (u, v, q) {
      const x = x0 + (x1 - x0) * v, d = J_DECK.at(x), zC = d[0], wc = canW(x);
      const za = Math.max(wc, f0 * zC), zb = f1 * zC, z = za + (zb - za) * u;
      q[0] = x; q[1] = deckY(x, z); q[2] = z;
    }, { gu: o.gu || 16, gv: o.gv || Math.max(6, Math.min(40, Math.round((x1 - x0) * 30))), heat: o.heat, w: o.w });
  }
  // lower skin (chine -> bottom centre, Bezier parameter s0..s1) of a table T
  function lowerPt(T, x, s, q) {
    const r = T.at(x), zC = r[0], yC = r[1], yB = r[2], ph = r[3] * PI / 180, lam = r[4] * (yC - yB), kL = r[5];
    const ax = zC, ay = yC, bx = zC - lam * Math.cos(ph), by = yC - lam * Math.sin(ph), cx = kL * zC, cy = yB, dx = 0, dy = yB;
    const t = s, it = 1 - t, b0 = it * it * it, b1 = 3 * it * it * t, b2 = 3 * it * t * t, b3 = t * t * t;
    q[0] = x; q[1] = b0 * ay + b1 * by + b2 * cy + b3 * dy; q[2] = b0 * ax + b1 * bx + b2 * cx + b3 * dx;
  }
  function jLower(T, x0, x1, s0, s1, o) {
    o = o || {};
    return S.param(function (u, v, q) { lowerPt(T, x0 + (x1 - x0) * v, s0 + (s1 - s0) * u, q); },
      { gu: o.gu || 16, gv: o.gv || Math.max(6, Math.min(40, Math.round((x1 - x0) * 30))), flip: true, heat: o.heat, w: o.w });
  }
  // the canopy bubble (L half; u: crown -> sill)
  function jCanopy(x0, x1, o) {
    o = o || {};
    return S.param(function (u, v, q) {
      const x = x0 + (x1 - x0) * v, ps = u * PI / 2, wc = canW(x), z = wc * Math.sin(ps);
      q[0] = x; q[1] = deckY(x, z) + canH(x) * Math.cos(ps); q[2] = z;
    }, { gu: o.gu || 12, gv: o.gv || 24, heat: o.heat, w: o.w });
  }
  // a lifting surface: span u (z0..z1), chord v (xi0..xi1) of the planform g = {le, te, y, t}
  function jWing(g, z0, z1, xi0, xi1, up, o) {
    o = o || {};
    return S.param(function (u, v, q) {
      const z = z0 + (z1 - z0) * u, xi = xi0 + (xi1 - xi0) * v, le = g.le(z), c = g.te(z) - le;
      q[0] = le + xi * c; q[1] = g.y(z) + (up ? 1 : -1) * g.t(z) * c * naca(xi); q[2] = z;
    }, { gu: o.gu || Math.max(4, Math.min(30, Math.round((z1 - z0) * 24))), gv: o.gv || Math.max(4, Math.min(30, Math.round((xi1 - xi0) * 20))), flip: !up, heat: o.heat, w: o.w });
  }
  const jWing2 = (g, z0, z1, xi0, xi1, o) => [jWing(g, z0, z1, xi0, xi1, true, o), jWing(g, z0, z1, xi0, xi1, false, o)];
  // the wing (L): root on the chine at z = 0.36
  const J_WING = {
    le: (z) => -0.17 + 0.7 * (z - 0.36), te: (z) => 1.07 - 0.268 * (z - 0.36),
    y: (z) => 0.032 - 0.02 * (z - 0.36), t: (z) => 0.024 - 0.006 * (z - 0.36),
  };
  // the stabilator (L), root at the boom
  const J_HT = {
    le: (z) => 1.06 + 0.78 * (z - 0.3), te: (z) => 1.76 - 0.27 * (z - 0.3),
    y: (z) => 0.0, t: (z) => 0.02,
  };
  // the fin (L): in its own plane, canted outward; s = height along the cant, root at (z, y)
  const J_FIN = { z: 0.235, cant: 25 * PI / 180, h: 0.47, le0: 0.68, le1: 1.05, te0: 1.30, te1: 1.29, t: 0.022 };
  function jFin(s0, s1, xi0, xi1, side, o) {
    o = o || {};
    const F = J_FIN, ca = Math.cos(F.cant), sa = Math.sin(F.cant);
    return S.param(function (u, v, q) {
      const s = (s0 + (s1 - s0) * u) * F.h, xi = xi0 + (xi1 - xi0) * v, f = s / F.h;
      const le = F.le0 + (F.le1 - F.le0) * f, te = F.te0 + (F.te1 - F.te0) * f, c = te - le, x = le + xi * c;
      const y0 = deckY(x, F.z) - 0.01, th = side * F.t * c * naca(xi);
      q[0] = x; q[1] = y0 + s * ca - th * sa; q[2] = F.z + s * sa + th * ca;
    }, { gu: o.gu || 14, gv: o.gv || 14, flip: side < 0, heat: o.heat, w: o.w });
  }
  const jFin2 = (s0, s1, xi0, xi1, o) => [jFin(s0, s1, xi0, xi1, 1, o), jFin(s0, s1, xi0, xi1, -1, o)];
  // the nozzle: a slightly convergent round nozzle with a sawtooth rim
  const J_NOZ = { x0: 1.4, x1: 1.66, r0: 0.152, r1: 0.13, y: 0.0, teeth: 12, tooth: 0.035 };
  function jNozzle(a0, a1, inner, o) {
    o = o || {};
    const N = J_NOZ;
    return S.param(function (u, v, q) {
      const a = a0 + (a1 - a0) * u, saw = Math.abs(((a * N.teeth / TAU) % 1 + 1) % 1 - 0.5) * 2;
      const xe = N.x1 - N.tooth * saw, x = N.x0 + (xe - N.x0) * v, f = (x - N.x0) / (N.x1 - N.x0);
      const r = (N.r0 + (N.r1 - N.r0) * f) * (inner ? 0.86 : 1);
      q[0] = x; q[1] = N.y + r * Math.cos(a); q[2] = r * Math.sin(a);
    }, { gu: o.gu || 36, gv: o.gv || 8, flip: !inner, heat: o.heat, w: o.w, glow: o.glow });
  }

  function jetParts() {
    const P = {};
    const XL = JT.XL;
    const both = (sh) => [sh, S.mirror(sh)];
    // ---- nose (radome), forward fuselage, chin
    P.neck = part([-1.5, 0, 0], F_CORE, both([jDeck(-1.75, -1.38, 0, 1), jLower(J_FWD, -1.75, -1.38, 0, 1)]));
    P.chest = part([-1.0, 0, 0], F_CORE, both([jDeck(-1.38, XL, 0, 1), jLower(J_FWD, -1.38, XL + 0.06, 0, 0.55)]));
    P.jaw = part([-1.2, -0.13, 0], F_CORE, both([jLower(J_FWD, -1.38, XL + 0.06, 0.55, 1)]));
    // ---- canopy
    P.head = part([-0.8, 0.2, 0], F_CORE, both([jCanopy(J_CAN.x0, J_CAN.x1, { heat: 0.12 })]));
    // ---- main body: bottom (belly), aft deck (hips), forward deck halves (back1/3), spine strip (back2)
    P.belly = part([0.2, -0.2, 0], F_CORE, both([jLower(J_MAIN, XL, 1.42, 0.4, 1)]));
    P.hips = part([0.9, 0.1, 0], F_CORE, both([jDeck(0.35, 1.42, 0, 1)]));
    P.back1 = part([-0.2, 0.1, 0.15], F_AFT, [jDeck(XL, 0.35, 0.3, 1)]);
    P.back3 = mir(P.back1);
    P.back2 = part([-0.2, 0.15, 0], F_AFT, both([jDeck(XL, 0.35, 0, 0.3)]));
    // ---- intakes: the trunk wall (mane1), the lip frame (mane2), the side behind the trunk (mane3)
    P.maneL1 = part([XL, 0, 0.3], F_PLATE, [jLower(J_MAIN, XL, -0.2, 0, 0.4)]);
    P.maneL3 = part([0.3, 0, 0.36], F_PLATE, [jLower(J_MAIN, -0.2, 1.42, 0, 0.4)]);
    P.maneL2 = part([XL, -0.08, 0.25], F_PLATE, [S.box(0.04, 0.2, 0.11, { at: [XL + 0.02, -0.08, 0.245] })]);
    // ---- wing L: LE flap (fl_up), inner box (flank), mid (fl_paw), outer (fl_lo), flaperon (scap)
    P.fl_up = part([0.1, 0.03, 0.8], F_LIMB, jWing2(J_WING, 0.36, 1.2, 0, 0.12));
    P.flankL = part([0.4, 0.03, 0.36], F_PLATE, jWing2(J_WING, 0.36, 0.66, 0.12, 0.78));
    P.fl_paw = part([0.4, 0.03, 0.8], F_LIMB, jWing2(J_WING, 0.66, 0.96, 0.12, 0.78));
    P.fl_lo = part([0.5, 0.03, 1.08], F_LIMB, [jWing2(J_WING, 0.96, 1.2, 0.12, 1)]);
    P.scapL = part([0.95, 0.03, 0.6], F_PLATE, jWing2(J_WING, 0.36, 0.96, 0.78, 1));
    // ---- tails: fin (hl_up) and rudder (hl_lo), stabilator (hl_paw), boom (haunch)
    P.hl_up = part([0.9, 0.08, J_FIN.z], F_LIMB, jFin2(0, 1, 0, 0.72));
    P.hl_lo = part([1.2, 0.08, J_FIN.z], F_LIMB, jFin2(0, 1, 0.72, 1));
    P.hl_paw = part([1.3, 0, 0.3], F_LIMB, jWing2(J_HT, 0.3, 0.76, 0, 1));
    P.haunchL = part([1.3, 0, 0.27], F_PLATE, [S.loft([[1.0, 0.04, 0.04], [1.3, 0.045, 0.045], [1.74, 0.012, 0.012]], { axis: "x", at: [0, 0, 0.27] })]);
    // ---- nozzle and tail cone
    P.tail1 = part([1.42, 0, 0], F_CORE, [jNozzle(0, PI, false)]);
    P.tail2 = part([1.42, 0, 0], F_CORE, [jNozzle(PI, TAU, false)]);
    P.tail3 = part([1.5, 0, 0], F_CORE, [jNozzle(0, TAU, true, { heat: 0.35 })]);
    P.tail4 = part([1.45, 0, 0], F_CORE, [S.disc(0.02, 0.11, { axis: "x", at: [1.46, J_NOZ.y, 0], heat: 0.5 })]);
    // mirrors
    for (const n of ["maneL1", "maneL2", "maneL3", "flankL", "scapL", "haunchL"]) P[n.replace(/L(\d?)$/, "R$1")] = mir(P[n]);
    for (const n of ["fl_up", "fl_lo", "fl_paw", "hl_up", "hl_lo", "hl_paw"]) P[n[0] + "r" + n.slice(2)] = mir(P[n]);
    // bank toward the viewer, a touch of nose-up
    return rigid(P, mul(RZ(-JT.PITCH), RX(JT.BANK)), [0, 0, 0], [0, JT.YC, 0]);
  }

  PM.defineMode({
    name: "jet", kind: "vehicle", yaw: 0.4, dwell: J_DWELL,
    parts: function () { return jetParts(); },
    animate: function (A, t, age, aim, H_) {
      // the afterburner: the nozzle burns hot and flickers
      const g = 0.8 + 0.12 * Math.sin(t * 9.1) * Math.sin(t * 5.3);
      A.glow("tail3", g).glow("tail4", g);
    },
    // the engine's jet: a fast, hot stream from the nozzle (afterburner), flickering a little
    exhaust: [{ part: "tail4", at: [0.25, 0, 0], dir: [1, 0, 0], speed: 3.6, nozzle: 0.14, heat: 1,
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

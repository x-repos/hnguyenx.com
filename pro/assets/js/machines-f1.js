/* =====================================================================
   machines-f1.js: the F1 car of ProMachines (machines.js loads first;
   this file only calls ProMachines.defineMode). Plain browser script;
   also loads in Node after machines.js.

     f1   a modern F1 car: a needle nose on a four-element front wing with
          endplates, the halo over the cockpit, sidepods with undercuts,
          the airbox and roll hoop, a long floor with its diffuser, big
          exposed wheels (wider at the rear) on visible wishbones, and a
          two-element rear wing with endplates, a beam wing and the DRS
          flap. The wheels spin, the DRS flap opens once and closes again,
          the car hums. No brand marks: no logos, numbers or names.

   Roles of the rig's parts:
     chest      monocoque, cockpit opening, driver's helmet
     belly      floor (centre) and plank
     hips       engine cover, gearbox
     neck       airbox and roll hoop
     head       nose
     jaw        halo
     maneL1/R1  sidepod inlet and mirror
     maneL2/R2  sidepod body
     maneL3/R3  sidepod tail (downwash ramp)
     back1/3    front wing, outer halves
     back2      front wing, centre
     flankL/R   floor, outer sections and edges
     scapL/R    front wing tips and endplates
     haunchL/R  rear wing endplates
     *_up       wishbones, push and pull rods, track rods, driveshafts
     *_lo       rims, wheel covers, hubs
     *_paw      tyres
     tail1      diffuser
     tail2      beam wing, crash structure, rain light
     tail3      rear wing main plane and pylon
     tail4      DRS flap
   ===================================================================== */
(function (G) {
  "use strict";
  const PM = G.ProMachines;
  if (!PM || typeof PM.defineMode !== "function") return;
  const PI = Math.PI, TAU = 2 * Math.PI, GY = PM.GROUND;

  /* ------------------------------------------------------------------
     Layout (machine units: front at -x, ground at GY)
     ------------------------------------------------------------------ */
  const WR = 0.25, RIM = 0.158, WY = GY + WR;          // tyre radius, rim radius, axle height
  const FX = -1.10, FZ = 0.555, FW = 0.20;             // front axle x, tyre centre z, tyre width
  const RX = 1.25, RZ = 0.52, RW = 0.27;               // rear
  const FL0 = GY + 0.035, FL1 = GY + 0.055;            // floor underside, top
  const F1_D = 4.0;                                    // dwell (s)
  const WHEEL_W = 21;                                  // wheel speed (rad/s)
  // DRS flap: hinge at its trailing edge; opens once, closes well before the end of the dwell
  const DRS = { x: 1.615, y: -0.758, c: 0.115, a: 0.80, open: -0.56 };
  DRS.px = DRS.x + DRS.c * Math.cos(DRS.a); DRS.py = DRS.y + DRS.c * Math.sin(DRS.a);

  /* ------------------------------------------------------------------
     Authoring helpers (run once, while the rig is built)
     ------------------------------------------------------------------ */
  const spow = (v, e) => (v < 0 ? -Math.pow(-v, e) : Math.pow(v, e));
  const sm01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  // monotone cubic through [[x, y], ...], flat outside
  function curve(pts) {
    const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    if (n === 1) return () => ys[0];
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
  // a part from a shape written in machine coordinates, pivot `at`
  function part(S, at, rot, parent, shape) {
    return { at, rot: rot || null, parent: parent || null, world: true, shape: S.place(shape, [-at[0], -at[1], -at[2]]) };
  }
  // a skin along x: at each x, f(x, q) gives the superellipse section q = {ry, rz, cy, cz, a0, a1}
  // (angle 0 = top, PI/2 = +z side, PI = bottom); exponent n; the lower half may have its own
  // half height q.ry2 and exponent o.nb (a sidepod's undercut)
  function sloft(S, x0, x1, f, o) {
    o = o || {};
    const q = { ry: 0, ry2: -1, rz: 0, cy: 0, cz: 0, a0: 0, a1: TAU }, e = 2 / (o.n || 2), eb = 2 / (o.nb || o.n || 2);
    return S.param((u, v, out) => {
      const x = x0 + (x1 - x0) * u;
      q.a0 = 0; q.a1 = TAU; q.ry2 = -1;
      f(x, q);
      const a = q.a0 + (q.a1 - q.a0) * v, c = Math.cos(a), lo = c < 0, ee = lo ? eb : e;
      out[0] = x; out[1] = q.cy + (lo && q.ry2 >= 0 ? q.ry2 : q.ry) * spow(c, ee); out[2] = q.cz + q.rz * spow(Math.sin(a), ee);
    }, Object.assign({ gu: 40, gv: 40, flip: true }, o));
  }
  // a wing element spanning z0..z1: f(z, q) gives the leading edge q.x, q.y, chord q.c, angle q.a
  // (trailing edge up), thickness q.t and camber q.k (fractions of the chord; camber bulges down)
  function foil(S, z0, z1, f, o) {
    const q = { x: 0, y: 0, c: 0.1, a: 0, t: 0.1, k: 0.04 };
    return S.param((u, v, out) => {
      const z = z0 + (z1 - z0) * u;
      q.t = 0.1; q.k = 0.04;
      f(z, q);
      const s0 = v < 0.5 ? 1 - 2 * v : 2 * v - 1, s = 0.5 - 0.5 * Math.cos(PI * s0);
      const yt = 5 * q.t * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s * s * s - 0.1036 * s * s * s * s);
      const ly = (-q.k * 4 * s * (1 - s) + (v < 0.5 ? yt : -yt)) * q.c, lx = s * q.c;
      const ca = Math.cos(q.a), sa = Math.sin(q.a);
      out[0] = q.x + lx * ca - ly * sa; out[1] = q.y + lx * sa + ly * ca; out[2] = z;
    }, Object.assign({ gu: 28, gv: 24, flip: true }, o));
  }
  // a tube along path(s, out), s in 0..1; section half axes a (toward `ref`) and b
  function tube(S, path, a, b, ref, o) {
    const P0 = [0, 0, 0], P1 = [0, 0, 0], C = [0, 0, 0];
    return S.param((u, v, out) => {
      const e = 1e-3;
      path(Math.max(0, u - e), P0); path(Math.min(1, u + e), P1); path(u, C);
      let dx = P1[0] - P0[0], dy = P1[1] - P0[1], dz = P1[2] - P0[2];
      const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      const k = ref[0] * dx + ref[1] * dy + ref[2] * dz;
      let ex = ref[0] - k * dx, ey = ref[1] - k * dy, ez = ref[2] - k * dz;
      const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      const fx = dy * ez - dz * ey, fy = dz * ex - dx * ez, fz = dx * ey - dy * ex;
      const ang = TAU * v, ca = Math.cos(ang) * a, sa = Math.sin(ang) * b;
      out[0] = C[0] + ex * ca + fx * sa; out[1] = C[1] + ey * ca + fy * sa; out[2] = C[2] + ez * ca + fz * sa;
    }, Object.assign({ gu: 24, gv: 10, flip: true }, o));
  }
  // a straight strut from p to q (section half axes a along `ref`, b across)
  function strut(S, p, q, a, b, ref, o) {
    return tube(S, (s, out) => { out[0] = p[0] + (q[0] - p[0]) * s; out[1] = p[1] + (q[1] - p[1]) * s; out[2] = p[2] + (q[2] - p[2]) * s; }, a, b, ref || [1, 0, 0], o);
  }
  // a smooth path through points (Catmull-Rom)
  function spline(pts) {
    const n = pts.length - 1;
    return (s, out) => {
      const f = Math.min(n - 1e-9, Math.max(0, s * n)), i = Math.floor(f), t = f - i;
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
      const t2 = t * t, t3 = t2 * t;
      for (let k = 0; k < 3; k++) {
        out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      }
    };
  }
  // a tyre around the axle (z) at c: radius R, rim radius r, width w, rounded shoulders
  function tyre(S, c, R, r, w, o) {
    const rs = Math.min(0.06, w * 0.3), hw = w / 2, prof = [];
    prof.push([r, hw]);
    for (let k = 0; k <= 6; k++) { const a = PI / 2 * k / 6; prof.push([R - rs + rs * Math.sin(a), hw - rs + rs * Math.cos(a)]); }
    for (let k = 0; k <= 6; k++) { const a = PI / 2 * k / 6; prof.push([R - rs + rs * Math.cos(a), -hw + rs - rs * Math.sin(a)]); }
    prof.push([r, -hw]);
    const L = [0];
    for (let i = 1; i < prof.length; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    const tot = L[L.length - 1];
    return S.param((u, v, out) => {
      const d = v * tot;
      let i = 1;
      while (i < L.length - 1 && L[i] < d) i++;
      const t = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), rho = prof[i - 1][0] + (prof[i][0] - prof[i - 1][0]) * t, z = prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * t;
      const a = TAU * u;
      out[0] = c[0] + rho * Math.cos(a); out[1] = c[1] + rho * Math.sin(a); out[2] = c[2] + z;
    }, Object.assign({ gu: 72, gv: 24, flip: true }, o));
  }
  // a plate from a polygon, extruded by t: its faces sparse (weight fw: a light fill, it is often
  // seen face on), its edges dense (weight ew: a crisp outline)
  function slab(S, pts, t, fw, ew) {
    const sh = S.extrude(pts, t);
    for (const pt of sh) pt.w = pt.p && pt.p.n ? fw : ew;
    return sh;
  }
  // a flat plate from a plan-view polygon [[x, z], ...] at height y, thickness t
  function plan(S, pts, y, t, fw, ew) {
    return S.place(slab(S, pts, t, fw == null ? 1 : fw, ew == null ? 1 : ew), [0, y, 0], [PI / 2, 0, 0]);
  }
  // a flat plate from a side-view polygon [[x, y], ...] at z, thickness t
  function side(S, pts, z, t, fw, ew) {
    return S.place(slab(S, pts, t, fw == null ? 1 : fw, ew == null ? 1 : ew), [0, 0, z]);
  }

  /* ------------------------------------------------------------------
     The car
     ------------------------------------------------------------------ */
  // front wing elements: leading edge x, y at the centre, chord, angle, rise at the tips
  const FWE = [
    [-1.81, -1.240, 0.140, 0.06, 0.020],
    [-1.69, -1.215, 0.100, 0.30, 0.050],
    [-1.61, -1.180, 0.090, 0.52, 0.075],
    [-1.545, -1.135, 0.080, 0.74, 0.100],
  ];
  const FWZ = 0.565;   // front wing endplate z
  function frontWing(S, z0, z1) {
    return S.join(...FWE.map((e, k) => foil(S, z0, z1, (z, q) => {
      const r = e[4] * Math.pow(sm01((Math.abs(z) - 0.12) / (FWZ - 0.12)), 1.5);
      q.x = e[0] + 0.03 * sm01((Math.abs(z) - 0.3) / 0.26); q.y = e[1] + r; q.c = e[2]; q.a = e[3] + 2.2 * r; q.t = k ? 0.09 : 0.08; q.k = 0.05;
    }, { gu: Math.max(6, Math.round(Math.abs(z1 - z0) * 60)) })));
  }

  function f1Parts(S, H) {
    const P = {};
    // ---- the body: one skin from the nose to the gearbox (sections: top, bottom, half width; n = 3) ----
    const bTop = curve([[-1.83, -1.19], [-1.80, -1.165], [-1.70, -1.145], [-1.45, -1.065], [-1.15, -0.955], [-0.80, -0.877], [-0.55, -0.862],
      [-0.30, -0.855], [0.06, -0.845], [0.40, -0.85], [0.80, -0.90], [1.10, -0.97], [1.42, -1.04]]);
    const bBot = curve([[-1.83, -1.20], [-1.80, -1.225], [-1.70, -1.232], [-1.45, -1.19], [-1.15, -1.14], [-0.80, -1.12], [-0.66, -1.225], [-0.55, -1.245], [1.42, -1.245]]);
    const bHW = curve([[-1.83, 0.012], [-1.80, 0.04], [-1.70, 0.055], [-1.45, 0.075], [-1.15, 0.10], [-0.80, 0.13], [-0.55, 0.175], [-0.30, 0.195],
      [0.06, 0.20], [0.40, 0.20], [0.80, 0.155], [1.10, 0.11], [1.42, 0.065]]);
    const EB = 2 / 3;
    const body = (x, q) => { const t = bTop(x), b = bBot(x); q.cy = (t + b) / 2; q.ry = (t - b) / 2; q.rz = bHW(x); q.cz = 0; };
    // angle (from the top) where the body side is at height y, and the half width there
    const bodyAng = (x, y) => { const t = bTop(x), b = bBot(x), c = Math.max(-1, Math.min(1, (2 * y - t - b) / (t - b))); return Math.acos(spow(c, 1 / EB)); };
    const bodyZ = (x, y) => bHW(x) * Math.pow(Math.sin(bodyAng(x, y)), EB);
    // sidepods: top, undercut bottom (at the body), outer side; the widest line a little below the top
    const SP0 = -0.55, SP1 = 0.98;
    const spTop = curve([[-0.55, -0.935], [-0.40, -0.925], [-0.10, -0.93], [0.25, -0.95], [0.55, -1.00], [0.80, -1.10], [0.98, -1.235]]);
    const spBot = curve([[-0.55, -1.05], [-0.30, -1.08], [0.0, -1.14], [0.30, -1.20], [0.55, -1.235], [0.98, -1.245]]);
    const spOut = curve([[-0.55, 0.43], [-0.42, 0.455], [-0.15, 0.46], [0.15, 0.44], [0.45, 0.37], [0.70, 0.28], [0.98, 0.21]]);
    const sideLimit = (x) => (x < SP1 ? spTop(x) : FL1 + 0.01);
    const sidepod = (x, q) => {
      const t = spTop(x), cz = bodyZ(x, t), drop = Math.min(0.035, (t - spBot(x)) * 0.4);
      q.cz = cz; q.cy = t - drop; q.ry = drop; q.ry2 = Math.max(0.002, q.cy - spBot(x)); q.rz = Math.max(0.004, spOut(x) - cz);
    };
    const spSkin = (x0, x1, a0, a1, o) => sloft(S, x0, x1, (x, q) => { sidepod(x, q); q.a0 = a0; q.a1 = a1; }, Object.assign({ n: 4, nb: 1.5, gu: 24, gv: 22 }, o));
    const SPA = PI / 2 + 0.25;   // the sidepod skin: above this angle the upper pod (mane), below it the undercut (flank)

    // ---- nose (head) ----
    P.head = part(S, [-1.30, -1.08, 0], null, "chest", sloft(S, -1.83, -0.80, body, { n: 3, gu: 44, gv: 28 }));

    // ---- monocoque with the cockpit opening, and the helmet (chest) ----
    const cockpit = (x) => { const c = (x + 0.20) / 0.22; return c * c < 1 ? 0.62 * Math.sqrt(1 - c * c) : 0; };   // x -0.42 .. 0.02
    const aT = (x) => bodyAng(x, spTop(x)), aB = (x) => bodyAng(x, spBot(x)), aF = (x) => bodyAng(x, FL1 + 0.012);
    P.chest = part(S, [-0.40, -1.0, 0], null, null, S.join(
      sloft(S, -0.80, SP0, body, { n: 3, gu: 14, gv: 36 }),
      sloft(S, SP0, 0.06, (x, q) => { body(x, q); q.a0 = cockpit(x); q.a1 = aT(x); }, { n: 3, gu: 36, gv: 10 }),
      sloft(S, SP0, 0.06, (x, q) => { body(x, q); q.a0 = TAU - aT(x); q.a1 = TAU - cockpit(x); }, { n: 3, gu: 36, gv: 10 }),
      sloft(S, SP0, 0.06, (x, q) => { body(x, q); q.a0 = aB(x); q.a1 = aF(x); }, { n: 3, gu: 36, gv: 6 }),
      sloft(S, SP0, 0.06, (x, q) => { body(x, q); q.a0 = TAU - aF(x); q.a1 = TAU - aB(x); }, { n: 3, gu: 36, gv: 6 }),
      S.sphere(0.072, { at: [-0.13, -0.80, 0] }),
    ));

    // ---- halo (jaw) ----
    const halo = spline([[0.02, -0.86, 0.165], [-0.06, -0.78, 0.17], [-0.22, -0.752, 0.15], [-0.36, -0.75, 0.08], [-0.42, -0.752, 0],
      [-0.36, -0.75, -0.08], [-0.22, -0.752, -0.15], [-0.06, -0.78, -0.17], [0.02, -0.86, -0.165]]);
    P.jaw = part(S, [-0.42, -0.80, 0], null, "chest", S.join(
      tube(S, halo, 0.026, 0.017, [0, 1, 0], { gu: 64, gv: 10 }),
      strut(S, [-0.42, -0.755, 0], [-0.50, -0.87, 0], 0.028, 0.017, [1, 0, 0]),
    ));

    // ---- airbox and roll hoop (neck) ----
    const abR = curve([[0.04, 0.13], [0.10, 0.14], [0.35, 0.10], [0.70, 0.02]]);
    const abW = curve([[0.04, 0.065], [0.10, 0.08], [0.35, 0.10], [0.70, 0.12]]);
    P.neck = part(S, [0.10, -0.75, 0], null, "chest", S.join(
      sloft(S, 0.04, 0.70, (x, q) => { q.ry = abR(x); q.rz = abW(x); q.cy = bTop(x) - 0.006; q.a0 = -PI / 2; q.a1 = PI / 2; }, { n: 2.4, gu: 30, gv: 24 }),
      side(S, [[0.03, -0.665], [0.20, -0.665], [0.16, -0.632], [0.06, -0.632]], 0, 0.024),
    ));

    // ---- engine cover, gearbox and crash structure (hips) ----
    P.hips = part(S, [0.70, -0.95, 0], null, "chest", S.join(
      sloft(S, 0.06, 1.42, (x, q) => { body(x, q); const a = bodyAng(x, sideLimit(x)); q.a0 = -a; q.a1 = a; }, { n: 3, gu: 44, gv: 30 }),
      S.box(0.32, 0.085, 0.10, { at: [1.56, -1.105, 0], r: 0.025 }),
    ));

    // ---- sidepods: inlet, mirror (mane 1), body (mane 2), tail (mane 3); the undercut (flank) ----
    const lipPath = (s, out) => {
      const q = {};
      sidepod(SP0, q);
      if (s < 0.82) {
        const a = PI * s / 0.82, c = Math.cos(a), lo = c < 0, ee = lo ? 2 / 1.5 : 0.5;
        out[0] = SP0; out[1] = q.cy + (lo ? q.ry2 : q.ry) * spow(c, ee); out[2] = q.cz + q.rz * spow(Math.sin(a), ee);
      } else {
        const f = (s - 0.82) / 0.18;
        out[0] = SP0; out[1] = q.cy - q.ry2 + (q.ry2 + q.ry) * f; out[2] = q.cz;
      }
    };
    const radiator = S.param((u, v, out) => {
      const q = {}, x = SP0 + 0.10;
      sidepod(x, q);
      const a = PI * u, c = Math.cos(a), lo = c < 0, ee = lo ? 2 / 1.5 : 0.5, r = 0.97 * v;
      out[0] = x; out[1] = q.cy + r * (lo ? q.ry2 : q.ry) * spow(c, ee); out[2] = q.cz + r * q.rz * spow(Math.sin(a), ee);
    }, { gu: 12, gv: 6, heat: 0.3, w: 0.7 });
    P.maneL1 = part(S, [-0.40, -0.98, 0.32], null, "chest", S.join(
      spSkin(SP0, -0.12, 0, SPA),
      tube(S, lipPath, 0.009, 0.009, [1, 0, 0], { gu: 40, gv: 6 }),
      radiator,
      S.box(0.05, 0.045, 0.10, { at: [-0.40, -0.85, 0.34], r: 0.015 }),
      strut(S, [-0.40, -0.925, 0.27], [-0.40, -0.86, 0.32], 0.012, 0.006, [1, 0, 0]),
    ));
    P.maneL2 = part(S, [0.10, -0.96, 0.36], null, "chest", spSkin(-0.12, 0.40, 0, SPA));
    P.maneL3 = part(S, [0.60, -1.05, 0.30], null, "chest", spSkin(0.40, SP1, 0, SPA));
    P.maneR1 = H.mirror(P.maneL1); P.maneR2 = H.mirror(P.maneL2); P.maneR3 = H.mirror(P.maneL3);

    // ---- floor (belly): the whole floor, sparse faces and dense edges, and the diffuser roof ----
    const FLP = [[-0.74, 0.0], [-0.72, 0.16], [-0.62, 0.36], [-0.48, 0.45], [-0.25, 0.475], [0.55, 0.475], [0.80, 0.445], [0.95, 0.37], [1.0, 0.25], [1.0, 0.0]];
    const floorPoly = FLP.concat(FLP.slice(1, -1).reverse().map((p) => [p[0], -p[1]]));
    P.belly = part(S, [0.10, FL0, 0], null, "chest", S.join(
      plan(S, floorPoly, (FL0 + FL1) / 2, FL1 - FL0, 0.25, 1.6),
      S.tag(S.quad([1.0, FL1, 0.36], [1.56, -1.10, 0.36], [1.0, FL1, -0.36], [1.56, -1.10, -0.36]), { w: 0.4 }),
    ));
    // ---- the undercut, the floor fences and the floor edge (flank) ----
    P.flankL = part(S, [0.0, -1.15, 0.32], null, "chest", S.join(
      spSkin(SP0, SP1, SPA, PI, { gu: 40, gv: 10 }),
      ...[0.25, 0.31, 0.37].map((z) => side(S, [[-0.70, FL1], [-0.40, FL1], [-0.43, FL1 + 0.07], [-0.66, FL1 + 0.095]], z, 0.008, 0.6, 1.4)),
      side(S, [[-0.30, FL1], [0.55, FL1], [0.50, FL1 + 0.03], [-0.25, FL1 + 0.03]], 0.47, 0.008, 0.6, 1.4),
    ));
    P.flankR = H.mirror(P.flankL);

    // ---- front wing (back 1..3, scap) ----
    P.back2 = part(S, [-1.66, -1.20, 0], null, "head", frontWing(S, -0.14, 0.14));
    P.back1 = part(S, [-1.66, -1.18, 0.30], null, "head", frontWing(S, 0.14, 0.46));
    P.back3 = H.mirror(P.back1);
    P.scapL = part(S, [-1.62, -1.12, 0.52], null, "head", S.join(
      frontWing(S, 0.46, FWZ),
      side(S, [[-1.83, GY + 0.045], [-1.44, GY + 0.045], [-1.44, -1.10], [-1.47, -1.0], [-1.55, -0.97], [-1.70, -1.05], [-1.82, -1.16]], FWZ + 0.006, 0.012, 0.4, 1.8),
    ));
    P.scapR = H.mirror(P.scapL);

    // ---- rear wing: main plane and pylon (tail3), DRS flap (tail4), endplates (haunch) ----
    const RWZ = 0.335;
    P.tail3 = part(S, [1.55, -0.80, 0], null, "chest", S.join(
      foil(S, -RWZ, RWZ, (z, q) => { q.x = 1.47; q.y = -0.80; q.c = 0.17; q.a = 0.22; q.t = 0.1; q.k = 0.06; }, { gu: 40 }),
      side(S, [[1.51, -1.06], [1.57, -1.06], [1.57, -0.795], [1.51, -0.795]], 0, 0.012, 0.5, 1.4),
    ));
    P.tail4 = part(S, [DRS.px, DRS.py, 0], null, "tail3",
      foil(S, -RWZ, RWZ, (z, q) => { q.x = DRS.x; q.y = DRS.y; q.c = DRS.c; q.a = DRS.a; q.t = 0.09; q.k = 0.05; }, { gu: 40 }));
    P.haunchL = part(S, [1.60, -0.84, RWZ], null, "tail3",
      side(S, [[1.42, -1.03], [1.63, -1.03], [1.76, -0.93], [1.77, -0.64], [1.50, -0.64], [1.42, -0.74]], RWZ + 0.007, 0.014, 0.45, 1.8));
    P.haunchR = H.mirror(P.haunchL);
    // ---- beam wing and rain light (tail2); diffuser walls and strakes (tail1) ----
    P.tail2 = part(S, [1.52, -1.03, 0], null, "chest", S.join(
      foil(S, -0.30, 0.30, (z, q) => { q.x = 1.47; q.y = -1.035; q.c = 0.075; q.a = 0.15; }, { gu: 30 }),
      foil(S, -0.30, 0.30, (z, q) => { q.x = 1.535; q.y = -1.005; q.c = 0.065; q.a = 0.45; }, { gu: 30 }),
      S.box(0.012, 0.03, 0.05, { at: [1.725, -1.105, 0], heat: 0.85 }),
    ));
    const dwall = (z) => side(S, [[1.0, FL0], [1.56, FL0 + 0.02], [1.56, -1.10], [1.0, FL1]], z, 0.008, 0.5, 1.6);
    P.tail1 = part(S, [1.25, -1.20, 0], null, "chest", S.join(dwall(0.36), dwall(-0.36), dwall(0.18), dwall(-0.18)));

    // ---- wheels: tyres (paw), rims and covers (lo), suspension (up) ----
    const wheelLo = (cx, cz, w) => {
      const zo = cz + w / 2 - 0.006;
      return S.join(
        S.disc(0.03, RIM, { at: [cx, WY, zo] }),
        S.cyl(RIM, w * 0.9, { axis: "z", at: [cx, WY, cz - w * 0.45], caps: false, w: 0.5 }),
        S.cyl(0.032, 0.03, { axis: "z", at: [cx, WY, zo], heat: 0.4 }),
        ...[0, 1, 2, 3, 4].map((k) => { const a = TAU * k / 5; return S.box(RIM - 0.05, 0.022, 0.012, { at: [cx + Math.cos(a) * (RIM + 0.03) / 2, WY + Math.sin(a) * (RIM + 0.03) / 2, zo + 0.006], rot: [0, 0, a] }); }),
      );
    };
    P.fl_paw = part(S, [FX, WY, FZ], null, null, tyre(S, [FX, WY, FZ], WR, RIM, FW));
    P.fl_lo = part(S, [FX, WY, FZ], null, null, wheelLo(FX, FZ, FW));
    P.hl_paw = part(S, [RX, WY, RZ], null, null, tyre(S, [RX, WY, RZ], WR, RIM, RW));
    P.hl_lo = part(S, [RX, WY, RZ], null, null, wheelLo(RX, RZ, RW));
    const ws = (p, q) => strut(S, p, q, 0.02, 0.006, [1, 0, 0]);
    P.fl_up = part(S, [FX, -1.05, 0.30], null, "chest", S.join(
      ws([-1.28, -0.94, 0.10], [-1.10, -0.95, 0.45]), ws([-0.92, -0.92, 0.12], [-1.10, -0.95, 0.45]),
      ws([-1.32, -1.12, 0.09], [-1.10, -1.15, 0.46]), ws([-0.90, -1.13, 0.12], [-1.10, -1.15, 0.46]),
      ws([-1.10, -1.14, 0.43], [-1.02, -0.90, 0.13]), ws([-1.02, -1.04, 0.11], [-1.04, -1.05, 0.45]),
    ));
    P.hl_up = part(S, [RX, -1.05, 0.28], null, "chest", S.join(
      ws([1.02, -0.93, 0.13], [1.25, -0.92, 0.39]), ws([1.42, -0.95, 0.10], [1.25, -0.92, 0.39]),
      ws([0.98, -1.15, 0.14], [1.25, -1.17, 0.40]), ws([1.45, -1.13, 0.10], [1.25, -1.17, 0.40]),
      ws([1.25, -0.94, 0.38], [1.10, -1.12, 0.12]),
      S.cyl(0.018, 0.30, { axis: "z", at: [RX, WY, 0.10], caps: false }),
    ));
    for (const n of ["up", "lo", "paw"]) { P["fr_" + n] = H.mirror(P["fl_" + n]); P["hr_" + n] = H.mirror(P["hl_" + n]); }
    return P;
  }

  function f1Animate(A, t, age, aim, H) {
    // the wheels roll forward (into the wind)
    const w = WHEEL_W * t;
    A.rz("fl_paw", w).rz("fl_lo", w).rz("fr_paw", w).rz("fr_lo", w);
    A.rz("hl_paw", w).rz("hl_lo", w).rz("hr_paw", w).rz("hr_lo", w);
    // DRS: the flap opens once on the straight and closes before the end of the dwell
    const d = H.env(age, 1.0, 1.22, 2.55, 2.8);
    if (d > 0) A.rz("tail4", DRS.open * d);
    // the engine hums through the chassis
    A.move("chest", 0, 0.0022 * Math.sin(t * 57) + 0.0014 * Math.sin(t * 31 + 1.3), 0);
  }

  PM.defineMode({
    name: "f1", kind: "vehicle", yaw: 0.4, dwell: F1_D,
    parts: f1Parts,
    animate: f1Animate,
    exhaust: [{ part: "tail2", at: [0.16, 0.03, 0], dir: [1, 0.12, 0], power: 0.22 }],
  });
})(typeof window !== "undefined" ? window : globalThis);

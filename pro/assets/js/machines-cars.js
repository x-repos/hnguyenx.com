/* =====================================================================
   machines-cars.js: the hypercar of the ProMachines cycle (machines.js
   loads first; this file only calls ProMachines.defineMode). Plain
   browser script; also loads in Node after machines.js.

     hypercar  a long, low and wide mid-engined hypercar: a bubble cabin
               on a wide body, a sculpted side with a big swept intake in
               front of the rear wheel, a long roof that sweeps down into
               a short tail, a full-width light bar, a large rear
               diffuser, big multi-spoke wheels with brake discs and an
               active rear wing. The wheels roll; once during its stay
               the wing rises, stands up as an airbrake and settles back.

   No brand marks: no logos, badges, numbers or names, and the grille
   and the side line are its own.

   Frame (shared): x = length, nose at -x (into the wind); y up; z toward
   the viewer ("L" parts on +z). Ground y = -1.3. The car is 3.4 long,
   1.58 wide and 0.9 tall. Every shape is written in the machine frame
   (heights h above the ground) and handed to the rig with world: true.

   Role of each rig part:
     chest      hood and the front fender tops
     jaw        nose centre: the grille
     scapL/R    nose corners: headlights and the corner intakes
     neck       windscreen
     head       roof, side windows, A-pillars, the spine
     belly      splitter, floor, diffuser ramp
     hips       engine cover and rear deck
     maneL1/R1  front fender sides
     maneL2/R2  doors
     maneL3/R3  the side intakes
     flankL/R   rear fenders (sides and tops)
     haunchL/R  side skirts
     back1/3    the rear wing (left and right halves)
     back2      tail panel
     *_up       wheel arches        *_lo  brake discs and calipers
     *_paw      wheels (tyre, rim, ten spokes)
     tail1      diffuser fins       tail2  exhausts
     tail3      the wing's swing arms
     tail4      the light bar
   ===================================================================== */
(function (G) {
  "use strict";
  const PM = G.ProMachines;
  if (!PM || typeof PM.defineMode !== "function") return;
  const PI = Math.PI, TAU = 2 * Math.PI, GY = PM.GROUND != null ? PM.GROUND : -1.3;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  // Monotone cubic through [[x, y], ...] (no overshoot), flat outside, tabulated for speed
  function curve(pts, n) {
    const m = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const h = [], s = [], d = new Array(m).fill(0);
    for (let i = 0; i < m - 1; i++) { h[i] = xs[i + 1] - xs[i]; s[i] = (ys[i + 1] - ys[i]) / h[i]; }
    d[0] = s[0]; d[m - 1] = s[m - 2];
    for (let i = 1; i < m - 1; i++) {
      if (s[i - 1] * s[i] <= 0) d[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / s[i - 1] + w2 / s[i]); }
    }
    const exact = (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[m - 1]) return ys[m - 1];
      let lo = 0, hi = m - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * d[lo] + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h[lo] * d[lo + 1];
    };
    // a fine table, read with linear interpolation
    const N = n || 512, x0 = xs[0], x1 = xs[m - 1], dx = (x1 - x0) / N, T = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) T[i] = exact(x0 + i * dx);
    return function (x) {
      if (x <= x0) return T[0];
      if (x >= x1) return T[N];
      const f = (x - x0) / dx, i = f | 0, w = f - i;
      return T[i] + (T[i + 1] - T[i]) * w;
    };
  }

  /* ------------------------------------------------------------------
     Dimensions (h = height above the ground)
     ------------------------------------------------------------------ */
  const XS0 = -1.62, XS1 = 1.66;           // where the sides meet the nose and the tail panel
  const XF = -0.98, XR = 1.06;             // axles
  const WF = { R: 0.255, w: 0.21, z: 0.655 }, WR = { R: 0.272, w: 0.25, z: 0.645 };
  const AF = 0.292, AR = 0.31;             // arch radii
  const HB = 0.10;                         // bottom of the body sides
  const WMAX = curve([[-1.62, 0.635], [-1.50, 0.705], [-1.30, 0.76], [-0.98, 0.782], [-0.70, 0.772], [-0.45, 0.752], [-0.10, 0.742],
    [0.30, 0.752], [0.70, 0.778], [1.06, 0.792], [1.40, 0.782], [1.60, 0.76], [1.66, 0.75]]);
  const HSH = curve([[-1.62, 0.42], [-1.45, 0.52], [-1.20, 0.595], [-0.98, 0.625], [-0.75, 0.615], [-0.50, 0.595], [0.0, 0.59],
    [0.40, 0.615], [0.75, 0.655], [1.06, 0.685], [1.40, 0.68], [1.66, 0.65]]);
  const INSET = curve([[-1.62, 0.05], [-1.3, 0.07], [1.66, 0.07]]);
  const CROWN = curve([[-1.62, 0.0], [-1.40, -0.03], [-0.98, -0.055], [-0.66, -0.04], [-0.30, 0.0], [1.0, 0.0], [1.66, 0.015]]);
  // the cabin: a bubble from the windscreen to the tail
  const XG0 = -0.70;
  const HR = curve([[-0.70, 0.52], [-0.62, 0.575], [-0.40, 0.70], [-0.15, 0.835], [0.05, 0.893], [0.22, 0.905], [0.42, 0.885],
    [0.70, 0.83], [1.00, 0.765], [1.30, 0.715], [1.50, 0.69], [1.66, 0.67]]);
  const WG = curve([[-0.70, 0.66], [-0.40, 0.66], [0.0, 0.64], [0.40, 0.60], [0.80, 0.52], [1.20, 0.44], [1.66, 0.40]]);
  const CABM = 2.4;

  const wsh = (x) => WMAX(x) - INSET(x);
  // the side skin: half width at (x, h), widest a little below the middle, tucked in at the sill
  function zSide(x, h) {
    const hs = HSH(x), wm = WMAX(x), hm = HB + 0.38 * (hs - HB);
    if (h <= hm) { const t = (hm - h) / (hm - HB); return wm - 0.045 * t * t; }
    const t = (h - hm) / (hs - hm);
    return wm - INSET(x) * Math.pow(t > 1 ? 1 : t, 1.7);
  }
  // the top: the deck (hood valley between the fenders) and the cabin bubble above it
  function deck(x, z) {
    const s = Math.min(1, Math.abs(z) / wsh(x));
    return HSH(x) + CROWN(x) * (1 - s * s);
  }
  function cab(x, z) {
    if (x < XG0) return -1;
    const s = Math.abs(z) / WG(x);
    if (s >= 1) return -1;
    const hb = HSH(x) - 0.06, hr = HR(x);
    return hb + (hr - hb) * Math.pow(1 - Math.pow(s, CABM), 1 / CABM);
  }
  const top = (x, z) => Math.max(deck(x, z), cab(x, z));
  // where the cabin rises out of the deck (half width), tabulated
  const ZC = (function () {
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const x = XG0 + (XS1 - XG0) * i / 96;
      let lo = 0, hi = WG(x);
      if (!(cab(x, 0) > deck(x, 0))) { pts.push([x, 0]); continue; }
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (cab(x, m) > deck(x, m)) lo = m; else hi = m; }
      pts.push([x, lo]);
    }
    return curve(pts);
  })();
  // the arches: the height of the opening's edge over x (or -1 outside it)
  function archTop(x) {
    let d = x - XF;
    if (d > -AF && d < AF) return WF.R + Math.sqrt(AF * AF - d * d);
    d = x - XR;
    if (d > -AR && d < AR) return WR.R + Math.sqrt(AR * AR - d * d);
    return -1;
  }
  // the cabin as a superellipse arc: angle phi from the top (0) to the side (pi/2)
  function cabAt(x, ph, q) {
    const wg = WG(x), hb = HSH(x) - 0.06, hr = HR(x), s = Math.sin(ph), c = Math.cos(ph < 0 ? -ph : ph), e = 2 / CABM;
    q[0] = x; q[1] = GY + hb + (hr - hb) * Math.pow(c, e); q[2] = (s < 0 ? -1 : 1) * wg * Math.pow(s < 0 ? -s : s, e);
  }
  // the angle where the cabin meets the deck, tabulated (0 where the cabin is still under it)
  const PHE = (function () {
    const pts = [], q = [0, 0, 0];
    for (let i = 0; i <= 96; i++) {
      const x = XG0 + (XS1 - XG0) * i / 96;
      cabAt(x, 0, q);
      if (!(q[1] - GY > deck(x, 0))) { pts.push([x, 0]); continue; }
      let lo = 0, hi = PI / 2;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; cabAt(x, m, q); if (q[1] - GY > deck(x, q[2])) lo = m; else hi = m; }
      pts.push([x, lo]);
    }
    return curve(pts);
  })();
  const zcab = (x) => { const ph = PHE(x); return ph > 0 ? WG(x) * Math.pow(Math.sin(ph), 2 / CABM) : 0; };

  /* ------------------------------------------------------------------
     Surfaces (machine frame); each returns patches
     ------------------------------------------------------------------ */
  function kit(S) {
    const K = {};
    const P = (fn, gu, gv, o) => S.param(fn, Object.assign({ gu, gv }, o || {}));
    K.P = P;
    // side skin (L): v = eta from the sill (HB) to the shoulder, u along x from xa(eta) to xb(eta);
    // ea(x): where the skin starts above the sill (the arches); dz(x, eta): pushed in by
    K.side = (xa, xb, ea, gu, gv, o, dz) => P((u, v, q) => {
      const a = xa(v), b = xb(v), x = a + (b - a) * u, e0 = ea ? ea(x) : 0, e = e0 + (1 - e0) * v;
      const h = HB + (HSH(x) - HB) * e;
      q[0] = x; q[1] = GY + h; q[2] = zSide(x, h) - (dz ? dz(x, e, u) : 0);
    }, gu, gv, o);
    // the top between z = za(x) and zb(x) (signed), y = top(x, z); normals up
    K.top = (x0, x1, za, zb, gu, gv, o) => P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, a = za(x), b = zb(x), z = a + (b - a) * v;
      q[0] = x; q[1] = GY + top(x, z); q[2] = z;
    }, gu, gv, Object.assign({ flip: true }, o));
    // the cabin between angles k0*phe(x) and k1*phe(x)
    K.cab = (x0, x1, k0, k1, gu, gv, o) => P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, ph = PHE(x) * (k0 + (k1 - k0) * v);
      cabAt(x, ph, q);
    }, gu, gv, Object.assign({ flip: true }, o));
    return K;
  }
  const arch = (x) => { const a = archTop(x); return a < 0 ? 0 : clamp01((a - HB) / (HSH(x) - HB)); };
  const cst = (c) => () => c;

  // the side intake: its front edge sweeps up and back, its rear wall stands in front of the rear wheel
  const XIA = (e) => 0.06 + 0.44 * Math.pow(e, 1.5), XIB = (e) => 0.64 + 0.09 * e, ID = 0.13;
  function intakeDepth(x, e, u) {
    const win = sstep(0.0, 0.1, e) * (1 - sstep(0.86, 0.98, e));
    return ID * win * sstep(0.0, 0.8, u) * (1 - sstep(0.95, 1.0, u));
  }
  // the nose: x over (z, h), bulging forward below the hood's edge
  const HN0 = 0.085, HN1 = 0.42;
  function xNose(z, h) {
    const e = (h - HN0) / (HN1 - HN0), zs = zSide(XS0, h), s = Math.min(1, Math.abs(z) / zs), b = (e - 0.38) / 0.62;
    return XS0 - 0.085 * (1 - b * b) * (1 - s * s * s);
  }
  function grille(z, e) { const a = Math.abs(z) / 0.25, b = Math.abs(e - 0.42) / 0.27; return 1 - sstep(0.7, 1.0, Math.pow(a, 6) + Math.pow(b, 6)); }
  function cornerIntake(z, e) { const a = Math.abs(Math.abs(z) - 0.455) / 0.12, b = Math.abs(e - 0.3) / 0.21; return 1 - sstep(0.7, 1.0, Math.pow(a, 4) + Math.pow(b, 4)); }
  // the tail: x over (z, h)
  const HT0 = 0.31;
  function xTail(z, h) { const zs = zSide(XS1, Math.min(h, HSH(XS1))), s = Math.min(1, Math.abs(z) / zs); return XS1 + 0.04 * (1 - s * s * s * s); }
  // the diffuser ramp height
  const XD0 = 0.95;
  const hDiff = (x) => 0.065 + (HT0 - 0.065) * Math.pow(clamp01((x - XD0) / (XS1 - XD0)), 1.6);

  // the rear wing at rest: leading edge, chord, thickness, rest angle; its swing arms
  const WX = 1.29, WH = 0.712, WC = 0.34, WT = 0.10, WA = -0.04, WZ = 0.70;
  const AH = [1.10, 0.724], AL = 0.23, AZ = 0.36;
  const ATIP = [AH[0] + AL, AH[1] - 0.02];
  const DWELL = 4.5;

  // a wheel in its own frame (axle along z, the outer face +z): tyre, sidewall, rim, ten spokes in pairs, hub
  function wheelShape(S, R, w) {
    const rim = R * 0.70, hub = R * 0.17, zo = w / 2, out = [
      S.cyl(R, w, { axis: "z", at: [0, 0, -zo], caps: false }),
      S.disc(rim, R, { at: [0, 0, zo] }),
      S.tag(S.disc(rim, R, { at: [0, 0, -zo], axis: "-z" }), { w: 0.35 }),
      S.tag(S.cyl(rim, w * 0.75, { axis: "z", at: [0, 0, -w * 0.4], caps: false }), { w: 0.4 }),
      S.cyl(hub, 0.03, { axis: "z", at: [0, 0, zo - 0.035] }),
    ];
    for (let k = 0; k < 10; k++) {
      const a = TAU * (k >> 1) / 5 + (k & 1 ? 0.11 : -0.11), r = (rim + hub) / 2;
      out.push(S.box(rim - hub + 0.01, 0.02, 0.024, { at: [Math.cos(a) * r, Math.sin(a) * r, zo - 0.022], rot: [0, 0, a] }));
    }
    return S.join(out);
  }

  function hypercarParts(S, H) {
    const K = kit(S), P = {}, y = (h) => GY + h;
    // a part from shapes written in the machine frame, pivot at
    const part = (at, shapes, extra) => Object.assign({ at, world: true, shape: S.place(S.join(shapes), [-at[0], -at[1], -at[2]]) }, extra || {});
    const neg = (f) => (x) => -f(x);

    // ---- the top: hood, windscreen, roof, engine cover, rear deck ----
    P.chest = part([-1.1, y(0.55), 0], [
      K.top(XS0, -0.66, neg(wsh), wsh, 40, 24),
      K.top(-0.66, -0.30, zcab, wsh, 14, 6), K.top(-0.66, -0.30, neg(wsh), neg(zcab), 14, 6),
    ]);
    P.neck = part([-0.4, y(0.72), 0], [K.cab(XG0, -0.12, -0.62, 0.62, 24, 20, { w: 0.6 })]);
    const spine = (x0, x1) => [
      K.P((u, v, q) => { const x = x0 + (x1 - x0) * u; q[0] = x; q[1] = y(HR(x) - 0.004 + 0.026 * v); q[2] = 0.006; }, 30, 2),
      K.P((u, v, q) => { const x = x0 + (x1 - x0) * u; q[0] = x; q[1] = y(HR(x) - 0.004 + 0.026 * v); q[2] = -0.006; }, 30, 2, { flip: true }),
    ];
    P.head = part([0.15, y(0.88), 0], [
      K.cab(-0.12, 0.45, -1, 1, 30, 30),
      K.cab(XG0, -0.12, 0.62, 1, 20, 8), K.cab(XG0, -0.12, -1, -0.62, 20, 8),
      spine(0.0, 1.5),
    ]);
    P.hips = part([1.0, y(0.75), 0], [
      K.cab(0.45, 1.25, -1, 1, 30, 30),
      K.top(1.25, XS1, neg(wsh), wsh, 16, 30),
    ]);

    // ---- the L side (the R side mirrors it) ----
    P.maneL1 = part([-1.1, y(0.4), 0.75], [
      K.side(cst(XS0), cst(XF - AF), null, 14, 14),
      K.side(cst(XF - AF), cst(XF + AF), arch, 24, 10),
      K.side(cst(XF + AF), cst(-0.55), null, 6, 14),
    ]);
    P.maneL2 = part([-0.2, y(0.4), 0.74], [
      K.side(cst(-0.55), XIA, null, 30, 16),
      K.top(-0.30, 0.45, zcab, wsh, 20, 5),
    ]);
    P.maneL3 = part([0.45, y(0.35), 0.68], [K.side(XIA, XIB, null, 40, 30, null, intakeDepth)]);
    P.flankL = part([1.1, y(0.45), 0.77], [
      K.side(XIB, cst(XR - AR), null, 6, 14),
      K.side(cst(XR - AR), cst(XR + AR), arch, 24, 10),
      K.side(cst(XR + AR), cst(XS1), null, 10, 14),
      K.top(0.45, 1.25, zcab, wsh, 20, 5),
    ]);
    const x0s = XF + AF, x1s = XR - AR, zo = (x) => zSide(x, HB) + 0.02;
    P.haunchL = part([0.03, y(0.08), 0.76], [
      K.P((u, v, q) => { const x = x0s + (x1s - x0s) * u; q[0] = x; q[1] = y(0.05 + (HB - 0.05) * v); q[2] = zo(x); }, 30, 4),
      K.P((u, v, q) => { const x = x0s + (x1s - x0s) * u, a = zo(x) - 0.02; q[0] = x; q[1] = y(HB); q[2] = a + 0.02 * v; }, 30, 2, { flip: true }),
      K.P((u, v, q) => { const x = x0s + (x1s - x0s) * u; q[0] = x; q[1] = y(0.05); q[2] = 0.5 + (zo(x) - 0.5) * v; }, 30, 4),
    ]);
    // wheel arches: the liner over the wheel
    const liner = (xc, R, hc) => K.P((u, v, q) => {
      const th = -0.25 + (PI + 0.5) * u;
      q[0] = xc + R * Math.cos(th); q[1] = y(hc + R * Math.sin(th)); q[2] = 0.56 + 0.215 * v;
    }, 30, 4, { w: 0.8 });
    P.fl_up = part([XF, y(WF.R + AF), 0.66], [liner(XF, AF, WF.R)]);
    P.hl_up = part([XR, y(WR.R + AR), 0.66], [liner(XR, AR, WR.R)]);
    // brakes: a disc and a caliper (they do not turn)
    const brake = (xc, hc, zc, r, ca) => S.join(
      S.disc(0.06, r, { at: [xc, y(hc), zc], back: true }),
      S.box(0.10, 0.05, 0.055, { at: [xc + (r - 0.01) * Math.cos(ca), y(hc) + (r - 0.01) * Math.sin(ca), zc], rot: [0, 0, ca + PI / 2] }),
    );
    P.fl_lo = part([XF, y(WF.R), WF.z - 0.05], [brake(XF, WF.R, WF.z - 0.05, 0.165, 0.9)]);
    P.hl_lo = part([XR, y(WR.R), WR.z - 0.06], [brake(XR, WR.R, WR.z - 0.06, 0.175, 0.9)]);
    // wheels (their own frame: the axle along z)
    P.fl_paw = { at: [XF, y(WF.R), WF.z], shape: wheelShape(S, WF.R, WF.w) };
    P.hl_paw = { at: [XR, y(WR.R), WR.z], shape: wheelShape(S, WR.R, WR.w) };

    // ---- the nose: grille in the middle, the corners with their lamps and intakes ----
    P.jaw = part([-1.70, y(0.25), 0], [K.P((u, v, q) => {
      const h = HN0 + (HN1 - HN0) * v, z = -0.30 + 0.60 * u;
      q[0] = xNose(z, h) + 0.045 * grille(z, v); q[1] = y(h); q[2] = z;
    }, 30, 24)]);
    const lamps = [];
    for (let k = 0; k < 4; k++) {
      const z = 0.36 + 0.07 * k, h = HN0 + 0.80 * (HN1 - HN0);
      lamps.push(S.box(0.03, 0.03, 0.05, { at: [xNose(z, h) - 0.004, y(h), z], heat: 0.3 }));
    }
    P.scapL = part([-1.66, y(0.3), 0.45], [K.P((u, v, q) => {
      const h = HN0 + (HN1 - HN0) * v, zs = zSide(XS0, h), z = 0.30 + (zs - 0.30) * u;
      q[0] = xNose(z, h) + 0.06 * cornerIntake(z, v); q[1] = y(h); q[2] = z;
    }, 24, 24), lamps]);

    // ---- underbody: splitter, floor, diffuser ramp ----
    const xsp = (z) => xNose(z, HN0) - 0.055;
    P.belly = part([-0.2, y(0.065), 0], [
      K.P((u, v, q) => { const z = -0.62 + 1.24 * u; q[0] = xsp(z) + 0.13 * v; q[1] = y(0.062); q[2] = z; }, 30, 4),
      K.P((u, v, q) => { const z = -0.62 + 1.24 * u; q[0] = xsp(z) + 0.13 * v; q[1] = y(0.05); q[2] = z; }, 30, 4, { flip: true }),
      K.P((u, v, q) => { const z = -0.62 + 1.24 * u; q[0] = xsp(z); q[1] = y(0.05 + 0.012 * v); q[2] = z; }, 30, 2),
      K.P((u, v, q) => { const x = -1.50 + (XD0 + 1.50) * u; q[0] = x; q[1] = y(0.065); q[2] = -0.5 + v; }, 30, 8, { w: 0.15 }),
      K.P((u, v, q) => {
        const x = XD0 + (XS1 - XD0) * u, zr = 0.5 + 0.18 * sstep(1.36, 1.5, x);
        q[0] = x; q[1] = y(hDiff(x)); q[2] = (2 * v - 1) * zr;
      }, 20, 10, { w: 0.6 }),
    ]);
    P.tail1 = part([1.4, y(0.15), 0], [-0.38, -0.16, 0.16, 0.38].map((zf) => [
      K.P((u, v, q) => { const x = 1.10 + 0.56 * u, h = 0.058 + (hDiff(x) - 0.058) * v; q[0] = x; q[1] = y(h); q[2] = zf + 0.005; }, 12, 6, { w: 0.6 }),
      K.P((u, v, q) => { const x = 1.10 + 0.56 * u, h = 0.058 + (hDiff(x) - 0.058) * v; q[0] = x; q[1] = y(h); q[2] = zf - 0.005; }, 12, 6, { w: 0.6, flip: true }),
    ]));

    // ---- the tail: panel, light bar, exhausts ----
    const LB0 = 0.535, LB1 = 0.585;
    P.back2 = part([1.68, y(0.45), 0], [
      K.P((u, v, q) => { const h = HT0 + (LB0 - HT0) * v, zs = zSide(XS1, h), z = (2 * u - 1) * zs; q[0] = xTail(z, h); q[1] = y(h); q[2] = z; }, 30, 12, { flip: true }),
      K.P((u, v, q) => {
        const zs = zSide(XS1, LB1), z = (2 * u - 1) * zs, h1 = top(XS1, z), h = LB1 + (h1 - LB1) * v;
        q[0] = xTail(z, h); q[1] = y(h); q[2] = z;
      }, 30, 4, { flip: true }),
    ]);
    P.tail4 = part([1.70, y(0.56), 0], [
      K.P((u, v, q) => { const z = (2 * u - 1) * 0.70, h = LB0 + (LB1 - LB0) * v; q[0] = xTail(z, h) + 0.012; q[1] = y(h); q[2] = z; }, 40, 3, { flip: true, heat: 0.65 }),
      K.P((u, v, q) => { const z = (2 * u - 1) * 0.70; q[0] = xTail(z, LB1) - 0.01 + 0.022 * v; q[1] = y(LB1); q[2] = z; }, 40, 2, { heat: 0.6 }),
      K.P((u, v, q) => { const z = (2 * u - 1) * 0.70; q[0] = xTail(z, LB0) - 0.01 + 0.022 * v; q[1] = y(LB0); q[2] = z; }, 40, 2, { flip: true, heat: 0.6 }),
    ]);
    const pipes = [];
    for (const [hz, hc] of [[-0.08, 0.375], [0.08, 0.375], [-0.08, 0.455], [0.08, 0.455]]) {
      pipes.push(S.cyl(0.036, 0.08, { axis: "x", at: [1.645, y(hc), hz], caps: false, heat: 0.12 }));
      pipes.push(S.disc(0.026, 0.036, { axis: "x", at: [1.725, y(hc), hz], heat: 0.12 }));
      pipes.push(S.tag(S.cyl(0.026, 0.05, { axis: "x", at: [1.675, y(hc), hz], caps: false }), { heat: 0.35, w: 0.6 }));
    }
    P.tail2 = part([1.70, y(0.415), 0], [pipes,
      S.box(0.03, 0.012, 0.36, { at: [1.705, y(0.508), 0] }), S.box(0.03, 0.012, 0.36, { at: [1.705, y(0.322), 0] }),
      S.box(0.03, 0.18, 0.012, { at: [1.705, y(0.415), 0.174] }), S.box(0.03, 0.18, 0.012, { at: [1.705, y(0.415), -0.174] }),
    ]);

    // ---- the active rear wing on two swing arms ----
    const ca = Math.cos(WA), sa = Math.sin(WA);
    const foil = (z0, z1) => K.P((u, v, q) => {
      const lower = u < 0.5, s = lower ? 1 - 2 * u : 2 * u - 1, xi = (1 - Math.cos(PI * s)) / 2;
      const yt = 5 * WT * WC * (0.2969 * Math.sqrt(xi) - 0.126 * xi - 0.3516 * xi * xi + 0.2843 * xi * xi * xi - 0.1036 * xi * xi * xi * xi);
      const yy = 0.07 * WC * xi * (1 - xi) + (lower ? -yt : yt), xx = xi * WC;
      q[0] = WX + xx * ca - yy * sa; q[1] = y(WH + xx * sa + yy * ca); q[2] = z0 + (z1 - z0) * v;
    }, 32, 20, { flip: true });
    P.back1 = part([ATIP[0], y(ATIP[1]), 0], [foil(0.0, WZ),
      S.box(WC + 0.04, 0.085, 0.008, { at: [WX + WC / 2, y(WH - 0.012), WZ + 0.004], rot: [0, 0, WA] })], { parent: "tail3" });
    const arm = (zc) => {
      const dx = ATIP[0] - AH[0], dh = ATIP[1] - AH[1];
      return S.join(
        S.box(Math.hypot(dx, dh) + 0.02, 0.036, 0.02, { at: [AH[0] + dx / 2, y(AH[1] + dh / 2), zc], rot: [0, 0, Math.atan2(dh, dx)] }),
        S.cyl(0.02, 0.05, { axis: "z", at: [AH[0], y(AH[1]), zc - 0.025] }),
      );
    };
    P.tail3 = part([AH[0], y(AH[1]), 0], [arm(AZ), arm(-AZ)]);

    // ---- mirrors ----
    for (const n of ["maneL1", "maneL2", "maneL3", "flankL", "haunchL", "scapL"]) P[n.replace(/L(\d?)$/, "R$1")] = H.mirror(P[n]);
    for (const n of ["up", "lo", "paw"]) { P["fr_" + n] = H.mirror(P["fl_" + n]); P["hr_" + n] = H.mirror(P["hl_" + n]); }
    P.back3 = H.mirror(P.back1);
    return P;
  }

  /* ------------------------------------------------------------------
     Motion: the wheels roll; the wing rises, stands up as an airbrake
     and settles back, at rest again well before the stay ends
     ------------------------------------------------------------------ */
  const SPIN = TAU * 1.1;
  function hypercarAnimate(A, t, age, aim, H) {
    const sf = SPIN * t, sr = sf * WF.R / WR.R;
    A.rz("fl_paw", sf).rz("fr_paw", sf).rz("hl_paw", sr).rz("hr_paw", sr);
    const a = age > 0 ? age : 0;
    const up = sstep(0.55, 1.25, a) * (1 - sstep(DWELL - 1.3, DWELL - 0.55, a));
    const brake = sstep(1.5, 1.9, a) * (1 - sstep(2.8, 3.25, a));
    const armA = 0.95 * up, tilt = 0.08 * up + 0.78 * brake;
    if (armA !== 0) A.rz("tail3", armA);
    if (tilt !== armA) { A.rz("back1", tilt - armA); A.rz("back3", tilt - armA); }
  }

  PM.defineMode({
    name: "hypercar", kind: "vehicle", yaw: 0.4, dwell: DWELL,
    parts: hypercarParts,
    animate: hypercarAnimate,
    // a faint breath from the exhausts
    exhaust: [{ part: "tail2", at: [0.04, 0, 0], dir: [1, 0.05, 0], power: 0.16 }],
  });
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
   machines-f1.js: the F1 car of ProMachines (machines.js loads first;
   this file only calls ProMachines.defineMode). Plain browser script;
   also loads in Node after machines.js.

     f1   a current Formula 1 car of the 2022-2025 ground-effect rules,
          built from its measured outline: the FIA 2022-2025 technical
          regulations (reference volumes in Appendix 1), the published
          figures (wheelbase 3.60 m, width 2.00 m, Pirelli 305/720-18 and
          405/720-18 tyres, bodywork 970 mm above the reference plane)
          and a traced three-view set of one 2025 car (outline.json, in
          metres, length 5.605 m, checked against the published figures).
          The long narrow nose on a four-element front wing with its end
          plates, 18-inch wheels with their covers and the small winglets
          over the front tyres, the halo over the cockpit and a plain
          helmet, the mirrors, the sidepods with their inlets, undercuts
          and downwash ramps, the airbox under the roll-hoop camera, the
          engine cover, the floor with its fences and edges, the
          diffuser, the beam wing and the big rear wing with the DRS flap
          on its swan-neck pylon. It drives on the moving floor: the
          wheels roll at the floor's speed, the rain light blinks red and
          a small hot exhaust leaves the tailpipe.

   No brand marks: no logos, numbers, names or liveries; a plain car.

   Frame (shared): x = length, nose at -x (into the wind); y up; z toward
   the viewer ("L" parts on +z, the car's left side). Ground y = -1.3.
   The tables below are in metres as measured: x back from the front tip
   (0 .. 5.605), y up from the tyres' contact line, z to the car's left.
   The machine frame is the same scaled by K = 3.75 / 5.605 (0.669 units
   a metre) and moved so that the car is centred on x = 0 with its tyres
   on the ground line. Every shape is written in metres in the machine's
   orientation and handed to the rig with world: true.

   Roles of the rig's parts:
     chest      monocoque: the chassis top and sides, the cockpit opening
                and its inner walls, the driver's plain helmet
     head       nose
     jaw        halo; the mirrors
     neck       airbox and roll hoop, the roll-hoop camera
     hips       engine cover
     maneL1/R1  sidepod front: inlet, lip, radiator face
     maneL2/R2  sidepod middle (top and outer side)
     maneL3/R3  sidepod rear: the downwash ramp
     flankL/R   the undercut and the floor's outer edge
     belly      floor, fences and plank
     back1/3    front wing, outer halves
     back2      front wing, centre
     scapL/R    front wing end plates
     haunchL/R  rear wing end plates
     *_up       suspension (and the winglets over the front tyres)
     *_lo       rims with their covers
     *_paw      tyres
     tail1      diffuser
     tail2      gearbox and crash structure, beam wing, rain light, tailpipe
     tail3      rear wing main plane and the swan-neck pylon
     tail4      DRS flap
   ===================================================================== */
(function (G) {
  "use strict";
  const PM = G.ProMachines;
  if (!PM || typeof PM.defineMode !== "function") return;
  const PI = Math.PI, TAU = 2 * Math.PI, GY = PM.GROUND != null ? PM.GROUND : -1.3;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const spow = (v, e) => (v < 0 ? -Math.pow(-v, e) : Math.pow(v, e));

  /* ------------------------------------------------------------------
     Scale: metres -> machine units
     ------------------------------------------------------------------ */
  const LEN = 5.6051, K = 3.75 / LEN, XC = LEN / 2;
  const OFF = [-XC * K, GY, 0];
  const toM = (p) => [(p[0] - XC) * K, GY + p[1] * K, (p[2] || 0) * K];

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
    const N = n || 1024, x0 = xs[0], x1 = xs[m - 1], dx = (x1 - x0) / N, T = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) T[i] = exact(x0 + i * dx);
    return function (x) {
      if (x <= x0) return T[0];
      if (x >= x1) return T[N];
      const f = (x - x0) / dx, i = f | 0, w = f - i;
      return T[i] + (T[i + 1] - T[i]) * w;
    };
  }

  /* ------------------------------------------------------------------
     The measured outline (metres; outline.json: the traced side, plan
     and front views, the FIA reference volumes where a part is hidden)
     ------------------------------------------------------------------ */
  // wheels: centres (wheelbase 3.600, tracks 1.621 / 1.549), the tyre radius (720 mm), the traced
  // sidewall-to-sidewall widths, the tread widths (305 / 405 mm), the rim widths (13.2 / 16.9 in) and
  // the 18-inch rim's flange radius
  const WFR = { x: 1.3203, y: 0.36, z: 0.8106, w: 0.370, tread: 0.305, rim: 0.3353 };
  const WRE = { x: 4.9203, y: 0.36, z: 0.7744, w: 0.462, tread: 0.405, rim: 0.4293 };
  const TR = 0.36, RIMR = 0.245;
  // centre line: top of the nose and the chassis (the cockpit rim from x 2.0), its underside down to
  // the floor; the plan half width of the nose and the chassis
  const TOPN = curve([[0, 0.23], [0.2703, 0.31], [0.5022, 0.3835], [0.7444, 0.4432], [1.0703, 0.53], [1.3203, 0.595], [1.6492, 0.6687],
    [1.9041, 0.6749], [2.006, 0.6575], [2.159, 0.6709], [2.4139, 0.7025], [2.6687, 0.7622], [2.9236, 0.776], [3.1607, 0.777]]);
  const BOTN = curve([[0, 0.15], [0.5022, 0.2612], [0.7189, 0.2621], [1.0203, 0.27], [1.3203, 0.25], [1.6203, 0.18], [1.70, 0.125], [1.75, 0.11], [3.2, 0.11]]);
  const NCW = curve([[0, 0.012], [0.0203, 0.03], [0.0803, 0.06], [0.2203, 0.085], [0.4924, 0.0987], [0.7002, 0.107], [0.8872, 0.1153], [1.3203, 0.15],
    [1.5703, 0.165], [1.808, 0.1807], [1.9319, 0.1972], [2.0558, 0.2137], [2.3203, 0.26], [2.7203, 0.29], [3.1703, 0.30]]);
  // the engine cover: its top (the airbox at 1.027, falling to 0.71 before the rear axle) and the half
  // width at its foot (traced in plan)
  const ECT = curve([[3.16, 1.006], [3.18, 1.027], [3.31, 1.027], [3.41, 1.015], [3.5, 1.008], [3.6, 0.99], [3.7, 0.97], [3.8, 0.951], [3.9, 0.931],
    [4.0, 0.909], [4.1, 0.888], [4.2, 0.869], [4.3, 0.849], [4.4, 0.822], [4.5, 0.796], [4.6, 0.765], [4.7, 0.726], [4.76, 0.717], [4.86, 0.71], [4.92, 0.64], [4.97, 0.56]]);
  const ECW = curve([[3.17, 0.22], [3.4203, 0.30], [3.7045, 0.3856], [3.9101, 0.3445], [4.1158, 0.3116], [4.3215, 0.2787], [4.486, 0.254], [4.6094, 0.2375],
    [4.7328, 0.2293], [4.8562, 0.2046], [4.97, 0.14]]);
  // sidepods: the top line (the shoulder's crease), the undercut line (the lower edge of the outer
  // side) and the plan half width; where the undercut's inner end meets the chassis or the floor
  const SPT = curve([[2.4266, 0.6714], [2.4523, 0.672], [2.6879, 0.6683], [2.8765, 0.6526], [3.2772, 0.6189], [3.6307, 0.5615], [3.9842, 0.4804],
    [4.3377, 0.3877], [4.5734, 0.3179], [4.64, 0.30]]);
  const SPB = curve([[2.4266, 0.5648], [2.5259, 0.559], [2.6897, 0.5129], [2.8301, 0.4784], [3.1576, 0.3512], [3.4617, 0.2823], [3.8126, 0.2533],
    [4.2103, 0.2386], [4.491, 0.2281], [4.64, 0.24]]);
  const SPW = curve([[2.4266, 0.6694], [2.5507, 0.6529], [2.6749, 0.686], [2.8818, 0.7274], [3.0888, 0.7605], [3.2957, 0.7522], [3.5026, 0.7274],
    [3.7095, 0.686], [3.9165, 0.6446], [4.1234, 0.5784], [4.3303, 0.5039], [4.48, 0.42], [4.64, 0.30]]);
  const SPYU = curve([[2.43, 0.445], [2.7, 0.40], [3.0, 0.30], [3.3, 0.17], [3.5, 0.125], [4.64, 0.125]]);
  const SPZU = curve([[2.43, 0.29], [2.8, 0.30], [3.2, 0.34], [3.6, 0.38], [4.2, 0.36], [4.64, 0.29]]);
  const SPX0 = 2.4266, SPX1 = 4.64;
  // floor: plan half width (the fences' sweep at the front, the cut ahead of the rear tyres, then the
  // diffuser), the floor edge (bottom and top of its lip), the plank under the middle
  const FLW = curve([[1.7203, 0.25], [1.9703, 0.5], [2.2803, 0.685], [2.5444, 0.7667], [2.5703, 0.78], [2.6709, 0.8004], [2.8818, 0.792],
    [3.0927, 0.7877], [3.3036, 0.7962], [3.5146, 0.7498], [3.7255, 0.7413], [3.9364, 0.7413], [4.1473, 0.7245], [4.3582, 0.6907], [4.5269, 0.657],
    [4.5803, 0.495], [4.9203, 0.44], [5.3703, 0.375]]);
  const FEB = curve([[1.6981, 0.0766], [2.2428, 0.0698], [2.9236, 0.0749], [3.8314, 0.0832], [4.5577, 0.0886]]);
  const FET = curve([[1.6981, 0.1219], [2.2428, 0.1015], [2.9236, 0.1044], [3.8314, 0.1128], [4.5577, 0.1203]]);
  const PLANK = { x0: 1.75, x1: 4.22, y0: 0.037, y1: 0.047, z: 0.125 };
  const FLX0 = 1.7203, FLX1 = 4.5577;
  // the diffuser: its roof on the centre line and the side walls' top edge
  const DIFR = curve([[4.2203, 0.0471], [4.4703, 0.1842], [4.7203, 0.2363], [4.9203, 0.278], [5.1203, 0.3197], [5.3703, 0.3719]]);
  const DIFT = (x) => 0.132 + (x - 4.2203) / 1.15 * 0.24;
  // the cockpit opening (plan): from x 2.34 to the airbox face at 3.16, half width 0.225
  const CK = { x0: 2.34, x1: 3.16, w: 0.225 };
  const ckW = (x) => { const u = clamp01((x - CK.x0) / 0.2); return x > CK.x1 ? 0 : CK.w * Math.sqrt(1 - (1 - u) * (1 - u)); };

  /* ------------------------------------------------------------------
     Sections
     ------------------------------------------------------------------ */
  // ---- the centre body (nose and chassis): a superellipse section at x and angle a (0 = the top,
  // PI/2 = the near side, PI = the bottom), its widest line at yw; rounder above than below. Over the
  // cockpit the crown stands above the traced line, which is the rim at the opening's edge ----
  const BS = { t: 0, b: 0, w: 0, yw: 0, eu: 1, el: 1 };
  const BNU = curve([[0, 2.3], [1.0, 2.5], [1.6, 3.0], [2.3, 3.4], [3.2, 3.4]]), BNL = curve([[0, 2.3], [1.0, 2.6], [1.6, 3.6], [3.2, 4.2]]);
  const BYW = curve([[0, 0.5], [1.3, 0.5], [1.8, 0.42], [3.2, 0.36]]);
  function rimLift(x) {
    // how far the crown stands above the rim at the opening's full width
    const t = TOPN(x), b = Math.min(BOTN(x), t - 0.01), yw = b + (t - b) * BYW(x), eu = 2 / BNU(x), w = NCW(x);
    const sa = Math.pow(Math.min(0.99, CK.w / w), 1 / eu), f = Math.pow(Math.sqrt(1 - sa * sa), eu);
    return (t - yw) * (1 / f - 1);
  }
  const RIML = curve([[2.2, 0], [2.3, 0], [2.4, 0.5], [2.6, 1], [3.2, 1]].map((p) => [p[0], p[1] * rimLift(Math.max(2.4, p[0]))]));
  function bodySec(x) {
    const t = TOPN(x) + RIML(x), b = Math.min(BOTN(x), t - 0.01);
    BS.t = t; BS.b = b; BS.w = NCW(x); BS.yw = b + (t - b) * BYW(x); BS.eu = 2 / BNU(x); BS.el = 2 / BNL(x);
    return BS;
  }
  function bodyPt(x, a, q) {
    const s = bodySec(x), c = Math.cos(a), sn = Math.sin(a), e = c >= 0 ? s.eu : s.el;
    q[0] = x;
    q[1] = c >= 0 ? s.yw + (s.t - s.yw) * Math.pow(c, e) : s.yw - (s.yw - s.b) * Math.pow(-c, e);
    q[2] = sn >= 0 ? s.w * Math.pow(sn, e) : -s.w * Math.pow(-sn, e);
    return q;
  }
  // the near-side angle where the body is at height y, and where its upper half is at half width z
  function bodyAng(x, y) {
    const s = bodySec(x);
    if (y >= s.yw) { const r = Math.min(1, Math.max(0, (y - s.yw) / Math.max(1e-6, s.t - s.yw))); return Math.acos(Math.pow(r, 1 / s.eu)); }
    const r = Math.min(1, Math.max(0, (s.yw - y) / Math.max(1e-6, s.yw - s.b)));
    return PI - Math.acos(Math.pow(r, 1 / s.el));
  }
  function bodyAngZ(x, z) { const s = bodySec(x); return Math.asin(Math.pow(Math.min(1, z / Math.max(1e-6, s.w)), 1 / s.eu)); }

  // ---- the sidepod at x: its inner edge (zi, yi) on the chassis side or the engine cover's foot, the
  // top (rising gently inboard) to the shoulder's crease (yt), the shoulder (radius r), the outer side
  // (zo) down to the undercut line (yb), then the undercut scooping in to (zu, yu) ----
  const SPZI = curve([[2.43, 0.268], [2.72, 0.29], [3.05, 0.30], [3.16, 0.27], [3.30, 0.275], [3.42, 0.30], [3.7045, 0.3856], [3.9101, 0.3445],
    [4.1158, 0.3116], [4.3215, 0.2787], [4.486, 0.254], [4.64, 0.236]]);
  const SPYI = curve([[2.43, 0.672], [2.69, 0.668], [2.88, 0.662], [3.05, 0.70], [3.16, 0.745], [3.3, 0.70], [3.5, 0.635], [3.63, 0.60],
    [3.98, 0.52], [4.34, 0.43], [4.57, 0.355], [4.64, 0.33]]);
  const SPS = { zi: 0, yi: 0, yt: 0, zo: 0, r: 0, yb: 0, zu: 0, yu: 0 };
  function podSec(x) {
    const s = SPS;
    s.zi = SPZI(x); s.yi = SPYI(x); s.yt = SPT(x); s.zo = Math.max(s.zi + 0.02, SPW(x)); s.yb = Math.min(SPB(x), s.yt - 0.02);
    s.r = Math.min(0.07, (s.yt - s.yb) * 0.45, (s.zo - s.zi) * 0.4); s.zu = Math.min(SPZU(x), s.zo - 0.02); s.yu = Math.min(SPYU(x), s.yb - 0.01);
    return s;
  }
  // the top: v 0 at the inner edge .. 1 at the shoulder's start (a slight crown)
  function podTop(x, v, q) {
    const s = podSec(x), z1 = s.zo - s.r;
    q[0] = x; q[2] = s.zi + (z1 - s.zi) * v; q[1] = s.yi + (s.yt - s.yi) * v + 0.012 * Math.sin(PI * v) * Math.min(1, (z1 - s.zi) / 0.3);
    return q;
  }
  // the shoulder and the outer side: v 0 at the shoulder's start .. 1 at the undercut line
  function podSide(x, v, q) {
    const s = podSec(x), arc = s.r * PI / 2, side = Math.max(0, s.yt - s.r - s.yb), L = arc + side, d = v * L;
    q[0] = x;
    if (d < arc) { const a = d / s.r; q[1] = s.yt - s.r + s.r * Math.cos(a); q[2] = s.zo - s.r + s.r * Math.sin(a); }
    else { q[1] = s.yt - s.r - (d - arc); q[2] = s.zo; }
    return q;
  }
  // the undercut: v 0 at the outer edge .. 1 at its inner end; a scoop (superellipse quarter about the
  // lower outer corner)
  function podUnder(x, v, q) {
    const s = podSec(x), a = v * PI / 2, e = 2 / 2.6;
    q[0] = x; q[2] = s.zo - (s.zo - s.zu) * Math.pow(Math.sin(a), e); q[1] = s.yu + (s.yb - s.yu) * Math.pow(Math.cos(a), e);
    return q;
  }

  // ---- the engine cover (x 3.16 .. 4.97): from its near foot (on the sidepod's inner edge) over the
  // top to the far foot; v 0 = the top, 1 = the near foot. Narrow-topped over the roll hoop ----
  const ECN = curve([[3.16, 2.2], [3.5, 2.4], [4.2, 2.6], [4.97, 2.6]]), ECTP = curve([[3.16, 0.42], [3.45, 0.30], [3.8, 0.12], [4.3, 0.05], [4.97, 0.05]]);
  const ECYF = curve([[3.16, 0.745], [3.3, 0.70], [3.5, 0.635], [3.63, 0.60], [3.98, 0.52], [4.34, 0.43], [4.57, 0.355], [4.66, 0.29], [4.8, 0.27], [4.97, 0.30]]);
  const ECZF = curve([[3.16, 0.27], [3.30, 0.275], [3.42, 0.30], [3.7045, 0.3856], [3.9101, 0.3445], [4.1158, 0.3116], [4.3215, 0.2787], [4.486, 0.254],
    [4.6094, 0.2375], [4.7328, 0.2293], [4.8562, 0.2046], [4.97, 0.15]]);
  function coverPt(x, v, q) {
    const a = v * PI / 2, e = 2 / ECN(x), c = Math.cos(a), t = ECT(x), yf = Math.min(ECYF(x), t - 0.02);
    q[0] = x; q[1] = yf + (t - yf) * Math.pow(c, e); q[2] = ECZF(x) * Math.pow(Math.sin(a), e) * (1 - ECTP(x) * c * c);
    return q;
  }

  // ---- the gearbox and the crash structure (x 4.86 .. 5.50): a rounded box under the rear wing ----
  const CST = curve([[4.86, 0.62], [4.94, 0.545], [5.27, 0.47], [5.50, 0.42]]);
  const CSB = curve([[4.86, 0.27], [4.92, 0.28], [5.12, 0.32], [5.30, 0.33], [5.50, 0.30]]);
  const CSW = curve([[4.86, 0.17], [4.95, 0.13], [5.30, 0.085], [5.50, 0.07]]);
  function crashPt(x, a, q) {
    const t = CST(x), b = CSB(x), w = CSW(x), c = Math.cos(a), sn = Math.sin(a), e = 2 / 3.2, yc = (t + b) / 2;
    q[0] = x; q[1] = yc + (t - yc) * spow(c, e); q[2] = w * spow(sn, e);
    return q;
  }

  /* ------------------------------------------------------------------
     Surface builders (metres; authoring only)
     ------------------------------------------------------------------ */
  // a surface over x0 .. x1 (u) and a profile v in 0 .. 1: fn(x, v, q) writes a point of the near
  // side; side -1 mirrors it onto the far side. flip: the near side's profile runs so that du x dv
  // points inward (top to bottom, inner to outer)
  function sweep(S, x0, x1, fn, side, o) {
    o = o || {};
    const f = o.flip !== false;
    return S.param(function (u, v, q) { fn(x0 + (x1 - x0) * u, v, q); if (side < 0) q[2] = -q[2]; },
      { gu: o.gu || Math.max(4, Math.round((x1 - x0) * 26)), gv: o.gv || 12, flip: side > 0 ? f : !f, w: o.w, heat: o.heat, glow: o.glow });
  }
  const both = (S, x0, x1, fn, o) => S.join(sweep(S, x0, x1, fn, 1, o), sweep(S, x0, x1, fn, -1, o));
  // a band of the centre body between the near-side angles a0(x) .. a1(x) (numbers or functions)
  const angAt = (f, x) => (typeof f === "function" ? f(x) : f);
  function bodyBand(S, x0, x1, a0, a1, side, o) {
    const Q = [0, 0, 0];
    return sweep(S, x0, x1, (x, v, q) => { const A = angAt(a0, x), B = angAt(a1, x); bodyPt(x, A + (B - A) * v, Q); q[0] = Q[0]; q[1] = Q[1]; q[2] = Q[2]; }, side, o);
  }
  // a wing element spanning z0 .. z1: f(z, q) gives the leading edge (q.x, q.y), the chord q.c, its
  // angle q.a (trailing edge up), thickness q.t and camber q.k (fractions of the chord; the camber of
  // these inverted wings bulges down)
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
    }, Object.assign({ gu: 28, gv: 16, flip: z1 > z0 }, o));
  }
  // a tube along path(s, out), s in 0 .. 1; section half axes a (toward `ref`) and b
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
    }, Object.assign({ gu: 24, gv: 8, flip: true }, o));
  }
  // a straight strut from p to q (section half axes a along `ref`, b across)
  function strut(S, p, q, a, b, ref, o) {
    return tube(S, (s, out) => { out[0] = p[0] + (q[0] - p[0]) * s; out[1] = p[1] + (q[1] - p[1]) * s; out[2] = p[2] + (q[2] - p[2]) * s; }, a, b, ref || [1, 0, 0],
      Object.assign({ gu: Math.max(4, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) * 40)) }, o));
  }
  // a smooth path through points (Catmull-Rom)
  function spline(pts) {
    const n = pts.length - 1;
    return (s, out) => {
      const f = Math.min(n - 1e-9, Math.max(0, s * n)), i = Math.floor(f), t = f - i;
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
      const t2 = t * t, t3 = t2 * t;
      for (let k = 0; k < 3; k++) out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    };
  }
  // a closed loop through points in a plane x = const ([z, y] pairs), as a path
  const loopX = (x, zy) => spline(zy.concat([zy[0]]).map((p) => [x, p[1], p[0]]));
  // a plate from a polygon, extruded by t: its faces lighter (fw: it is often seen face on), its edges
  // denser (ew: a crisp outline)
  function slab(S, pts, t, fw, ew) {
    const sh = S.extrude(pts, t);
    for (const pt of sh) pt.w = pt.p && pt.p.n ? fw : ew;
    return sh;
  }
  // a flat plate from a side-view polygon [[x, y], ...] at z, thickness t
  const sidePlate = (S, pts, z, t, fw, ew) => S.place(slab(S, pts, t, fw == null ? 1 : fw, ew == null ? 1 : ew), [0, 0, z]);
  // a tyre around the axle (z) at c: radius R, the flange radius r, the profile (section width w,
  // tread width tw, rim width rw): the sidewall bulges out past the rim and rolls over the shoulder
  function tyre(S, c, R, r, w, tw, rw, o) {
    const prof = [], hb = rw / 2 + 0.006, hs = w / 2, ht = tw / 2, rs = R - 0.035;
    // from the outer bead round the tread to the inner bead: [radius, z]
    const outer = [[r, hb], [r + 0.02, hs - 0.004], [r + 0.05, hs], [rs - 0.02, hs - 0.003], [rs, hs - 0.012]];
    for (let k = 0; k <= 5; k++) { const a = PI / 2 * k / 5; outer.push([rs + (R - rs) * Math.sin(a), ht + (hs - 0.012 - ht) * Math.cos(a)]); }
    for (const p of outer) prof.push(p);
    for (let i = outer.length - 1; i >= 0; i--) prof.push([outer[i][0], -outer[i][1]]);
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
    }, Object.assign({ gu: 90, gv: 26, flip: true }, o));
  }
  // a face in the plane x between an inner ellipse (centre zc, yc; half axes rz, ry) and an outer closed
  // outline ([z, y] polygon), filled along rays from the centre; nx: the side it faces (-1 forward)
  function ringFace(S, x, outer, zc, yc, rz, ry, nx, o) {
    const NR = 720, R = new Float64Array(NR + 1);
    for (let i = 0; i <= NR; i++) {
      const ph = TAU * i / NR, dz = Math.cos(ph), dy = Math.sin(ph);
      let best = 0;
      for (let j = 0; j < outer.length; j++) {
        const p = outer[j], q = outer[(j + 1) % outer.length], ez = q[0] - p[0], ey = q[1] - p[1], den = dz * ey - dy * ez;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((p[0] - zc) * ey - (p[1] - yc) * ez) / den, s = ((p[0] - zc) * dy - (p[1] - yc) * dz) / den;
        if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && t > best) best = t;
      }
      R[i] = best;
    }
    return S.param((u, v, q) => {
      const f = u * NR, i = Math.min(NR - 1, f | 0), w = f - i, ph = TAU * u, dz = Math.cos(ph), dy = Math.sin(ph);
      const rin = rz > 0 ? 1 / Math.sqrt((dz / rz) * (dz / rz) + (dy / ry) * (dy / ry)) : 0, rout = R[i] + (R[i + 1] - R[i]) * w;
      const r = rin + (Math.max(rin, rout) - rin) * v;
      q[0] = x; q[1] = yc + r * dy; q[2] = zc + r * dz;
    }, Object.assign({ gu: 64, gv: 6, flip: nx < 0 }, o));
  }
  // the outline of a closed loop of [z, y] points as a list (for the faces), and as a lip tube at x
  function lip(S, x, zy, r, o) { return tube(S, loopX(x, zy), r, r, [1, 0, 0], Object.assign({ gu: Math.max(24, zy.length * 3), gv: 6 }, o)); }

  /* ------------------------------------------------------------------
     The car
     ------------------------------------------------------------------ */
  function f1Parts(S, H) {
    const P = {};
    // a part from geometry in metres (its pivot in metres too)
    const put = (name, at, parent, ...shapes) => {
      const atM = toM(at);
      P[name] = { at: atM, rot: null, parent: parent || null, world: true, shape: S.place(S.place(S.join(shapes), OFF, null, K), [-atM[0], -atM[1], -atM[2]]) };
    };
    const Q = [0, 0, 0];

    // ---- nose (head): the full section from the tip to the front bulkhead, the tip's round face ----
    const NX1 = 1.25;
    const tip = S.param((u, v, q) => { bodyPt(0.004, TAU * u, Q); const s = bodySec(0.004), yc = (s.t + s.b) / 2; q[0] = 0.004 - 0.004 * (1 - v); q[1] = yc + (Q[1] - yc) * v; q[2] = Q[2] * v; },
      { gu: 24, gv: 3, flip: true });
    put("head", [0.65, 0.40, 0], "chest", bodyBand(S, 0.004, NX1, 0, PI, 1, { gu: 40, gv: 14 }), bodyBand(S, 0.004, NX1, 0, PI, -1, { gu: 40, gv: 14 }), tip);

    // ---- monocoque (chest): the chassis down to the floor ahead of the sidepods, above the sidepods
    // alongside the cockpit; the opening's inner walls; the helmet ----
    const aOpen = (x) => (ckW(x) > 0.002 ? bodyAngZ(x, ckW(x)) : 0);
    const aFloor = (x) => bodyAng(x, 0.135);
    const aPod = (x) => bodyAng(x, SPYI(x));
    const wall = (side) => sweep(S, CK.x0 + 0.003, CK.x1, (x, v, q) => {
      const w = ckW(x); bodyPt(x, aOpen(x), Q); q[0] = x; q[2] = w; q[1] = Q[1] - 0.11 * v;
    }, side, { gu: 30, gv: 4, w: 0.55, flip: false });
    put("chest", [2.3, 0.45, 0], null,
      bodyBand(S, NX1, 1.75, 0, PI, 1, { gu: 14, gv: 16 }), bodyBand(S, NX1, 1.75, 0, PI, -1, { gu: 14, gv: 16 }),
      bodyBand(S, 1.75, SPX0, aOpen, aFloor, 1, { gu: 18, gv: 16 }), bodyBand(S, 1.75, SPX0, aOpen, aFloor, -1, { gu: 18, gv: 16 }),
      bodyBand(S, SPX0, CK.x1, aOpen, aPod, 1, { gu: 20, gv: 5 }), bodyBand(S, SPX0, CK.x1, aOpen, aPod, -1, { gu: 20, gv: 5 }),
      wall(1), wall(-1),
      S.ellipsoid(0.135, 0.12, 0.112, { at: [2.80, 0.745, 0], theta: [0, 1.42] }));

    // ---- airbox and roll hoop (neck): the top of the cover over the roll hoop, its face round the
    // intake, the intake's lip, the roll-hoop camera on top ----
    const NKX = 3.45;
    const face = [];
    for (let k = 0; k <= 24; k++) { coverPt(3.161, 1 - k / 24, Q); face.push([Q[2], Q[1]]); }
    for (let k = 1; k <= 24; k++) { coverPt(3.161, k / 24, Q); face.push([-Q[2], Q[1]]); }
    const intake = []; for (let k = 0; k < 24; k++) { const a = TAU * k / 24; intake.push([0.085 * Math.cos(a), 0.905 + 0.07 * Math.sin(a)]); }
    const TCAM = [[3.4028, 1.02], [3.4028, 1.0329], [3.3875, 1.117], [3.3569, 1.1398], [3.2601, 1.1394], [3.2397, 1.1087], [3.2244, 1.02]];
    put("neck", [3.3, 0.9, 0], "chest",
      both(S, 3.161, NKX, coverPt, { gu: 10, gv: 14 }),
      ringFace(S, 3.161, face, 0, 0.905, 0.085, 0.07, -1),
      lip(S, 3.166, intake, 0.008),
      sidePlate(S, TCAM, 0, 0.034, 0.7, 1.2),
      S.box(0.10, 0.035, 0.25, { at: [3.31, 1.1225, 0], r: 0.012 }));

    // ---- engine cover (hips) ----
    put("hips", [4.1, 0.65, 0], "chest", both(S, NKX, 4.97, coverPt, { gu: 42, gv: 14 }));

    // ---- sidepods (mane): top and outer side in three lengths; the inlet's lip and the radiator face
    // behind it in the first ----
    const pod = (x0, x1, gu) => S.join(sweep(S, x0, x1, podTop, 1, { gu, gv: 8 }), sweep(S, x0, x1, podSide, 1, { gu, gv: 10 }));
    const inlet = [];
    for (let k = 0; k <= 12; k++) { podTop(SPX0, k / 12, Q); inlet.push([Q[2], Q[1]]); }
    for (let k = 1; k <= 14; k++) { podSide(SPX0, k / 14, Q); inlet.push([Q[2], Q[1]]); }
    for (let k = 1; k <= 12; k++) { podUnder(SPX0, k / 12, Q); inlet.push([Q[2], Q[1]]); }
    let cz = 0, cy = 0;
    for (const p of inlet) { cz += p[0] / inlet.length; cy += p[1] / inlet.length; }
    const core = inlet.map((p) => [cz + (p[0] - cz) * 0.9, cy + (p[1] - cy) * 0.9]);
    const SP1 = 2.95, SP2 = 3.70;
    put("maneL1", [2.65, 0.58, 0.5], "chest", pod(SPX0, SP1, 16), lip(S, SPX0 + 0.004, inlet, 0.011),
      ringFace(S, SPX0 + 0.09, core, cz, cy, 0, 0, -1, { w: 0.5, heat: 0.22, gv: 5 }));
    put("maneL2", [3.3, 0.52, 0.62], "chest", pod(SP1, SP2, 22));
    put("maneL3", [4.15, 0.40, 0.5], "chest", pod(SP2, SPX1, 26));
    P.maneR1 = H.mirror(P.maneL1); P.maneR2 = H.mirror(P.maneL2); P.maneR3 = H.mirror(P.maneL3);

    // ---- the undercut, the chassis side inside it, the floor's edge (flank) ----
    const cave = sweep(S, SPX0, 3.35, (x, v, q) => { const yu = SPYU(x); q[0] = x; q[2] = SPZU(x); q[1] = yu + (0.115 - yu) * v; }, 1, { gu: 18, gv: 6, w: 0.7 });
    const edge = sweep(S, 1.70, 4.53, (x, v, q) => { q[0] = x; q[2] = FLW(x); q[1] = FET(x) + (FEB(x) - FET(x)) * v; }, 1, { gu: 70, gv: 3, w: 1.3 });
    put("flankL", [3.3, 0.25, 0.55], "chest", sweep(S, SPX0, 4.6, podUnder, 1, { gu: 44, gv: 10 }), cave, edge);
    P.flankR = H.mirror(P.flankL);

    // ---- floor (belly): its top from the chassis or the undercut's foot out to the edge, the fences
    // under the front of the chassis, the plank ----
    const FZI = curve([[1.72, 0.17], [1.8, 0.18], [2.06, 0.214], [2.32, 0.26], [2.43, 0.285], [2.8, 0.30], [3.2, 0.34], [3.6, 0.38], [4.2, 0.36], [4.45, 0.30], [4.58, 0.27]]);
    const floorTop = (x, v, q) => { const zi = Math.min(FZI(x), FLW(x) - 0.01); q[0] = x; q[2] = zi + (FLW(x) - zi) * v; q[1] = FET(x); };
    const fence = (z, side) => {
      // from the floor's swept leading edge at z, rearward
      let x0 = FLX0;
      for (let k = 0; k < 60 && FLW(x0) < z; k++) x0 += 0.01;
      return S.place(slab(S, [[x0, 0.07], [x0 + 0.55, 0.07], [x0 + 0.55, 0.115], [x0 + 0.05, 0.20], [x0, 0.19]], 0.008, 0.5, 1.4), [0, 0, side * z]);
    };
    put("belly", [3.0, 0.1, 0], "chest", both(S, FLX0, 4.58, floorTop, { gu: 60, gv: 8, w: 0.85, flip: false }),
      fence(0.30, 1), fence(0.40, 1), fence(0.50, 1), fence(0.30, -1), fence(0.40, -1), fence(0.50, -1),
      S.box(PLANK.x1 - PLANK.x0, 0.06, 2 * PLANK.z, { at: [(PLANK.x0 + PLANK.x1) / 2, 0.07, 0], r: 0.01, w: 0.5 }));

    // ---- halo (jaw): the hoop round the cockpit on its rear mounts and the centre pillar; the mirrors
    // on their stalks over the sidepod inlets ----
    const hoop = spline([[2.86, 0.75, 0.275], [2.81, 0.785, 0.287], [2.70, 0.826, 0.312], [2.56, 0.850, 0.310], [2.45, 0.862, 0.255], [2.385, 0.866, 0.15],
      [2.36, 0.866, 0], [2.385, 0.866, -0.15], [2.45, 0.862, -0.255], [2.56, 0.850, -0.310], [2.70, 0.826, -0.312], [2.81, 0.785, -0.287], [2.86, 0.75, -0.275]]);
    const mirror = (s) => S.join(
      S.box(0.23, 0.075, 0.155, { at: [2.38, 0.725, s * 0.62], r: 0.03 }),
      strut(S, [2.42, 0.69, s * 0.59], [2.45, 0.66, s * 0.55], 0.018, 0.01, [1, 0, 0]));
    put("jaw", [2.5, 0.8, 0], "chest", tube(S, hoop, 0.024, 0.02, [0, 1, 0], { gu: 90, gv: 8 }),
      strut(S, [2.065, 0.66, 0], [2.37, 0.866, 0], 0.016, 0.028, [0, 0, 1]), mirror(1), mirror(-1));

    // ---- front wing: four elements (back2 the centre under the nose, back1/back3 the outer halves),
    // swept back in plan, the flaps rising toward the end plates (scap) ----
    const LE0 = curve([[0, 0.004], [0.083, 0.033], [0.51, 0.19], [0.95, 0.362]]);
    const TE0 = curve([[0, 0.5525], [0.246, 0.4813], [0.552, 0.6614], [0.868, 0.8416], [0.95, 0.83]]);
    // per element: its share of the stack's plan length, heights of its leading and trailing edges at the
    // centre and at the end plate (the side view's chords)
    const FWE = [
      { f: [0, 0.40], y0: [0.17, 0.19], y1: [0.16, 0.19] },
      { f: [0.36, 0.66], y0: [0.21, 0.25], y1: [0.21, 0.27] },
      { f: [0.62, 0.86], y0: [0.25, 0.30], y1: [0.28, 0.35] },
      { f: [0.82, 1.0], y0: [0.29, 0.34], y1: [0.36, 0.44] },
    ];
    const fwEl = (e) => (z, q) => {
      const s = Math.abs(z), g = Math.pow(sstep(0.2, 0.93, s), 1.2), le = LE0(s), L = TE0(s) - le;
      const xa = le + L * e.f[0], xb = le + L * e.f[1], ya = lerp(e.y0[0], e.y1[0], g), yb = lerp(e.y0[1], e.y1[1], g);
      q.x = xa; q.y = ya; q.c = Math.hypot(xb - xa, yb - ya); q.a = Math.atan2(yb - ya, xb - xa); q.t = 0.09; q.k = 0.05;
    };
    const fwing = (z0, z1, gu) => S.join(FWE.map((e) => foil(S, z0, z1, fwEl(e), { gu, gv: 12 })));
    put("back2", [0.3, 0.2, 0], "head", fwing(-0.25, 0.25, 16));
    put("back1", [0.45, 0.26, 0.6], "head", fwing(0.25, 0.944, 26));
    P.back3 = H.mirror(P.back1);
    const FEP = S.rounded([[0.8173, 0.4966], [0.6621, 0.4782], [0.5468, 0.44], [0.467, 0.3598], [0.4072, 0.2665], [0.385, 0.2109], [0.3961, 0.1733],
      [0.5956, 0.1564], [0.8173, 0.1618]], 0.03, 3);
    put("scapL", [0.6, 0.33, 0.952], "head", sidePlate(S, FEP, 0.952, 0.012, 0.5, 1.6),
      S.quad([0.40, 0.162, 0.958], [0.817, 0.162, 0.958], [0.40, 0.158, 0.90], [0.817, 0.162, 0.90], { w: 0.6 }));
    P.scapR = H.mirror(P.scapL);

    // ---- rear wing: the main plane and the swan-neck pylon over it (tail3), the DRS flap (tail4), the
    // end plates leaning out with the rounded tips (haunch) ----
    const RWS = 0.585;
    const PYL = [[5.3119, 1.0009], [4.9348, 0.9993], [4.8594, 0.911], [4.8393, 0.7852], [4.8971, 0.7855], [4.9549, 0.9165], [5.3119, 0.9582]];
    put("tail3", [5.15, 0.88, 0], "chest",
      foil(S, -RWS, RWS, (z, q) => { q.x = 5.025; q.y = 0.853; q.c = 0.30; q.a = 0.07; q.t = 0.12; q.k = 0.07; }, { gu: 60, gv: 16 }),
      sidePlate(S, PYL, 0, 0.03, 0.6, 1.3));
    put("tail4", [5.39, 0.93, 0], "tail3",
      foil(S, -RWS, RWS, (z, q) => { q.x = 5.27; q.y = 0.878; q.c = 0.25; q.a = 0.39; q.t = 0.10; q.k = 0.05; }, { gu: 60, gv: 16 }));
    const REP = S.rounded([[5.6051, 0.8432], [5.3747, 0.8492], [5.0683, 0.855], [5.0683, 0.6028], [5.2805, 0.4388], [5.4525, 0.3263], [5.5279, 0.3927],
      [5.57, 0.6286], [5.6051, 0.80]], 0.03, 3);
    const tipR = S.param((u, v, q) => {
      const a = v * PI / 2; q[0] = 5.03 + 0.50 * u; q[1] = 0.85 + 0.135 * Math.sin(a); q[2] = 0.505 + 0.10 * Math.cos(a);
    }, { gu: 20, gv: 6, flip: true, w: 0.8 });
    put("haunchL", [5.33, 0.62, 0.55], "tail3", S.place(slab(S, REP, 0.012, 0.5, 1.6), [0, 0, 0.46 - 0.27 * 0.33], [1, 0, 0, 0, 1, 0, 0, 0.27, 1]), tipR);
    P.haunchR = H.mirror(P.haunchL);

    // ---- gearbox and crash structure with the rain light and the tailpipe, the two-element beam wing
    // (tail2); the diffuser: side walls, roof and strakes (tail1) ----
    const csEnd = S.param((u, v, q) => { crashPt(5.50, TAU * u, Q); const yc = (CST(5.5) + CSB(5.5)) / 2; q[0] = 5.50; q[1] = yc + (Q[1] - yc) * v; q[2] = Q[2] * v; },
      { gu: 24, gv: 3, flip: false });
    const crash = S.join(sweep(S, 4.86, 5.50, (x, v, q) => crashPt(x, v * PI, q), 1, { gu: 18, gv: 10 }),
      sweep(S, 4.86, 5.50, (x, v, q) => crashPt(x, v * PI, q), -1, { gu: 18, gv: 10 }), csEnd);
    const beam = (x, y, c, a) => foil(S, -0.45, 0.45, (z, q) => { q.x = x; q.y = y; q.c = c; q.a = a; q.t = 0.10; q.k = 0.05; }, { gu: 30, gv: 12 });
    put("tail2", [5.2, 0.42, 0], "chest",
      S.tag(S.join(crash, beam(5.19, 0.391, 0.254, 0.18), beam(5.22, 0.491, 0.25, 0.205),
        S.cyl(0.042, 0.22, { axis: "x", at: [4.93, 0.575, 0], caps: false }),
        S.torus(0.04, 0.006, { axis: "x", at: [5.15, 0.575, 0], heat: 0.5 })), { glow: 0 }),
      S.box(0.012, 0.05, 0.075, { at: [5.508, 0.36, 0], r: 0.005, heat: 0.55 }));
    const dWall = (side) => sweep(S, 4.58, 5.37, (x, v, q) => { q[0] = x; q[2] = FLW(x); q[1] = 0.062 + (DIFT(x) - 0.062) * v; }, side, { gu: 24, gv: 5, w: 0.8, flip: false });
    const strake = (z) => sidePlate(S, [[4.45, 0.062], [5.30, 0.062], [5.30, DIFR(5.30)], [4.45, DIFR(4.45)]], z, 0.006, 0.4, 1.2);
    put("tail1", [4.9, 0.2, 0], "chest", dWall(1), dWall(-1),
      both(S, 4.40, 5.37, (x, v, q) => { q[0] = x; q[2] = FLW(x) * v; q[1] = DIFR(x); }, { gu: 18, gv: 8, w: 0.35 }),
      strake(0.17), strake(-0.17), strake(0.30), strake(-0.30));

    // ---- wheels: tyres (paw), rims with their covers, the lip and the hub nut (lo) ----
    const rimL = (c, rw) => {
      const zo = c[2] + rw / 2 + 0.004, zi = c[2] - rw / 2 + 0.01;
      return S.join(
        S.disc(0.036, RIMR - 0.012, { at: [c[0], c[1], zo] }),
        S.torus(RIMR - 0.006, 0.007, { at: [c[0], c[1], zo - 0.004] }),
        S.cyl(0.034, 0.012, { axis: "z", at: [c[0], c[1], zo] }),
        S.disc(0.12, RIMR - 0.01, { at: [c[0], c[1], zi], axis: "-z", w: 0.5 }));
    };
    const CF = [WFR.x, WFR.y, WFR.z], CR = [WRE.x, WRE.y, WRE.z];
    put("fl_paw", CF, null, tyre(S, CF, TR, RIMR, WFR.w, WFR.tread, WFR.rim));
    put("fl_lo", CF, null, rimL(CF, WFR.rim));
    put("hl_paw", CR, null, tyre(S, CR, TR, RIMR, WRE.w, WRE.tread, WRE.rim));
    put("hl_lo", CR, null, rimL(CR, WRE.rim));

    // ---- suspension (up): faired wishbones, push or pull rods, track rods, the brake drums; the
    // winglet over each front tyre; the rear driveshafts ----
    const arm = (p, q) => strut(S, p, q, 0.032, 0.011, [1, 0, 0]);
    const winglet = S.param((u, v, q) => {
      const a = 1.20 + 0.58 * u, R = 0.374 + 0.02 * v; q[0] = WFR.x + R * Math.cos(a); q[1] = WFR.y + R * Math.sin(a); q[2] = 0.625 + 0.05 * v;
    }, { gu: 16, gv: 4, flip: true });
    put("fl_up", [1.33, 0.40, 0.42], "chest",
      arm([1.12, 0.53, 0.15], [1.33, 0.56, 0.655]), arm([1.58, 0.56, 0.16], [1.33, 0.56, 0.655]),
      arm([1.08, 0.29, 0.13], [1.32, 0.17, 0.665]), arm([1.62, 0.25, 0.15], [1.32, 0.17, 0.665]),
      arm([1.32, 0.19, 0.64], [1.40, 0.55, 0.16]), arm([1.20, 0.37, 0.15], [1.22, 0.38, 0.655]),
      S.cyl(0.13, 0.075, { axis: "z", at: [WFR.x, WFR.y, WFR.z - WFR.rim / 2 - 0.075], w: 0.7 }),
      winglet);
    put("hl_up", [4.92, 0.38, 0.38], "chest",
      arm([4.72, 0.52, 0.17], [4.93, 0.56, 0.58]), arm([5.08, 0.50, 0.13], [4.93, 0.56, 0.58]),
      arm([4.70, 0.26, 0.20], [4.92, 0.16, 0.60]), arm([5.12, 0.29, 0.12], [4.92, 0.16, 0.60]),
      arm([4.80, 0.30, 0.20], [4.78, 0.30, 0.59]), arm([4.92, 0.52, 0.56], [4.80, 0.27, 0.15]),
      strut(S, [4.92, 0.36, 0.12], [4.92, 0.36, 0.56], 0.022, 0.022, [0, 1, 0]),
      S.cyl(0.14, 0.06, { axis: "z", at: [WRE.x, WRE.y, WRE.z - WRE.rim / 2 - 0.06], w: 0.7 }));
    for (const n of ["up", "lo", "paw"]) { P["fr_" + n] = H.mirror(P["fl_" + n]); P["hr_" + n] = H.mirror(P["hl_" + n]); }
    return P;
  }

  /* ------------------------------------------------------------------
     Motion: the wheels roll at the floor's speed, the rain light blinks,
     the engine hums through the chassis
     ------------------------------------------------------------------ */
  const F1_D = 4.0;
  const FLOOR_V = 3.4;                       // the rolling road's speed on screen (machine units a second)
  const WHEEL_W = FLOOR_V / (TR * K);        // so the tyres' contact patches move with it
  function f1Animate(A, t, age, aim, H) {
    const w = WHEEL_W * t;
    A.rz("fl_paw", w).rz("fl_lo", w).rz("fr_paw", w).rz("fr_lo", w);
    A.rz("hl_paw", w).rz("hl_lo", w).rz("hr_paw", w).rz("hr_lo", w);
    const b = 0.5 + 0.5 * Math.cos(TAU * 2.2 * t);
    A.glow("tail2", 0.45 * b * b);
    A.move("chest", 0, 0.0012 * Math.sin(t * 57) + 0.0008 * Math.sin(t * 31 + 1.3), 0);
  }
  // the tailpipe's end in tail2's frame
  const PIPE = [(5.15 - 5.2) * K, (0.575 - 0.42) * K, 0];

  PM.defineMode({
    name: "f1", kind: "vehicle", yaw: 0.4, dwell: F1_D,
    parts: f1Parts,
    animate: f1Animate,
    exhaust: [{ part: "tail2", at: PIPE, dir: [1, 0.06, 0], power: 0.8, speed: 1.0, nozzle: 0.042 * K, heat: 0.5 }],
  });
})(typeof window !== "undefined" ? window : globalThis);

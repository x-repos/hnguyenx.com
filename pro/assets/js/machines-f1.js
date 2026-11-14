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
          over the front tyres, the halo over the empty cockpit (its seat,
          no driver), the mirrors, the sidepods with their inlets,
          undercuts and downwash ramps, the airbox under the roll-hoop
          camera, the engine cover, the floor with its fences and edges,
          the diffuser, the beam wing and the big rear wing with the DRS
          flap on its swan-neck pylon, its tips rolled down into the end
          plates (the 2022 rules' rounded tips). It drives on the moving
          floor: the wheels roll at the floor's speed, the rain light
          blinks red and a small hot exhaust streams out behind the car.

   No brand marks: no logos, numbers, names or liveries; a plain car.

   Frame (shared): x = length, nose at -x (into the wind); y up; z toward
   the viewer ("L" parts on +z, the car's left side). Ground y = -1.3.
   The tables below are in metres as measured: x back from the front tip
   (0 .. 5.605), y up from the tyres' contact line, z to the car's left.
   The machine frame is the same scaled by K = 3.75 / 5.605 (0.669 units
   a metre) and moved so that the car is centred on x = 0 with its tyres
   on the ground line. Every shape is written in metres in the machine's
   orientation and handed to the rig with world: true.

   Roles of the rig's parts. The page moves the particles between two
   machines by where they are (intro.js), not by part, so a part here is
   only a share of the points: each part covers about the share of the
   car that the other machines give it, so every surface gets about the
   same number of points per square metre (report(N) shows it; check it
   again when another machine changes):
     back2      front wing, the centre (|z| < 0.36), with the nose's front
                (x < 0.86; its tip rests on the wing, no underside in it)
     back1/3    front wing, outer halves (to |z| 0.70); the winglet over
                the front tyre; the front brake drum
     scapL/R    front wing tips: the elements' outer ends, the end plate,
                the foot plate; the front track rod
     head       nose (x 0.86 .. 1.85)
     chest      monocoque from x 1.85: chassis, the cockpit's seat (NO
                DRIVER: the owner asked for the driver to be taken out; do
                not add one), the steering wheel; the floor ahead of the
                left sidepod with its fences
     jaw        halo, mirrors, the headrest, the roll-hoop camera's post
     neck       airbox and roll hoop, the camera's cross bar
     hips       engine cover (less the lower halves of its flanks that the
                sidepods carry), the gearbox and crash structure
     maneL1-3   left sidepod: front (inlet, lip, radiator face), middle,
                rear (the downwash ramp); L1 also the chassis side beside
                the cockpit and inside the undercut, L2 the cockpit's left
                wall, L3 the diffuser's left wall and the cover's lower
                flank behind x 4.6
     maneR1-3   right sidepod, the same, and more of the right side: the
                helicopter gives its rotor's outer halves (these slots)
                about twice the share of the root halves (the L slots), so
                the rig gives maneR1-3 about 1.6x the points of maneL1-3;
                to keep both sides of the car equally dense the R slots
                also carry the floor ahead of the right sidepod with its
                fences and a diffuser strake (R1), the right cover flank's
                lower half and the cockpit's right wall (R2), the diffuser's
                right wall and roof (R3). If the helicopter's L and R shares
                become equal, give these pieces back (chest, hips, tail1)
                and mirror maneL1-3.
     flankL/R   the undercut, the floor edge
     belly      floor beside and behind the sidepods, the plank
     haunchL/R  rear wing end plates with the flap's rolled tips
     *_up       suspension; rear: the driveshafts, the brake-duct housings
     *_lo       rims with their covers and rim lips, the tyres' inner
                sides and part of the tread (they turn together)
     *_paw      tyres
     tail1      diffuser (left roof, strake), the main plane's rolled tips,
                the swan-neck pylon
     tail2      beam wing, rain light, tailpipe
     tail3      rear wing main plane
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
    const N = n || 512, x0 = xs[0], x1 = xs[m - 1], dx = (x1 - x0) / N, T = new Float64Array(N + 1);
    for (let i = 0, lo = 0; i <= N; i++) {
      const x = Math.min(x1, x0 + i * dx);
      while (lo < m - 2 && xs[lo + 1] <= x) lo++;
      const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
      T[i] = (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * d[lo] + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h[lo] * d[lo + 1];
    }
    return function (x) {
      if (x <= x0) return T[0];
      if (x >= x1) return T[N];
      const f = (x - x0) / dx, i = f | 0, w = f - i;
      return T[i] + (T[i + 1] - T[i]) * w;
    };
  }

  // k values of x tabulated over x0 .. x1 (n steps; linear between them, held outside): the sections
  // below are looked up very often while the points are sampled
  function table(x0, x1, n, k, fill) {
    const T = new Float64Array((n + 1) * k), v = new Float64Array(k), dx = (x1 - x0) / n;
    for (let i = 0; i <= n; i++) { fill(x0 + i * dx, v); T.set(v, i * k); }
    return function (x, out) {
      const f = Math.min(n - 1e-9, Math.max(0, (x - x0) / dx)), i = f | 0, w = f - i, o = i * k;
      for (let j = 0; j < k; j++) out[j] = T[o + j] + (T[o + k + j] - T[o + j]) * w;
      return out;
    };
  }

  /* ------------------------------------------------------------------
     The measured outline (metres; outline.json: the traced side, plan
     and front views, the FIA reference volumes where a part is hidden)
     ------------------------------------------------------------------ */
  // wheels: centres (wheelbase 3.600, tracks 1.621 / 1.549), the tyre radius (720 mm), the traced
  // sidewall-to-sidewall widths, the tread widths (305 / 405 mm), the rim widths (13.2 / 16.9 in) and
  // the 18-inch rim's flange radius (490.6 mm over the lip)
  // (the axles stand a hair higher than the tyre radius: the points' sampling jitter, 3 mm on screen,
  // must not put any below the floor line)
  const WFR = { x: 1.3203, y: 0.3645, z: 0.8106, w: 0.370, tread: 0.305, rim: 0.3353 };
  const WRE = { x: 4.9203, y: 0.3645, z: 0.7744, w: 0.462, tread: 0.405, rim: 0.4293 };
  const TR = 0.36, RIMR = 0.245;
  // centre line: top of the nose and the chassis (the cockpit rim from x 2.0), its underside down to
  // the floor; the plan half width of the nose and the chassis
  const TOPN = curve([[0, 0.23], [0.2703, 0.31], [0.5022, 0.3835], [0.7444, 0.4432], [1.0703, 0.53], [1.3203, 0.595], [1.6492, 0.6687],
    [1.9041, 0.6749], [2.006, 0.6575], [2.159, 0.6709], [2.4139, 0.7025], [2.6687, 0.7622], [2.9236, 0.776], [3.1607, 0.777]]);
  const BOTN = curve([[0, 0.15], [0.5022, 0.2612], [0.7189, 0.2621], [1.0203, 0.27], [1.3203, 0.25], [1.6203, 0.18], [1.70, 0.125], [1.75, 0.11], [3.2, 0.11]]);
  const NCW = curve([[0, 0.012], [0.0203, 0.03], [0.0803, 0.06], [0.2203, 0.085], [0.4924, 0.0987], [0.7002, 0.107], [0.8872, 0.1153], [1.3203, 0.15],
    [1.5703, 0.165], [1.808, 0.1807], [1.9319, 0.1972], [2.0558, 0.2137], [2.3203, 0.26], [2.7203, 0.29], [3.1703, 0.30]]);
  // the engine cover's top (the airbox at 1.027, falling to 0.71 before the rear axle; its half width
  // at the foot, traced in plan, is ECZF below)
  const ECT = curve([[3.16, 1.006], [3.18, 1.027], [3.31, 1.027], [3.41, 1.015], [3.5, 1.008], [3.6, 0.99], [3.7, 0.97], [3.8, 0.951], [3.9, 0.931],
    [4.0, 0.909], [4.1, 0.888], [4.2, 0.869], [4.3, 0.849], [4.4, 0.822], [4.5, 0.796], [4.6, 0.765], [4.7, 0.726], [4.76, 0.717], [4.86, 0.71], [4.92, 0.64], [4.97, 0.56]]);
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
  const PLANK = { x0: 1.75, x1: 4.22, y0: 0.04, y1: 0.10, z: 0.125 };
  const FLX0 = 1.7203;
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
  const BST = table(0, 3.2, 1600, 6, (x, v) => {
    const t = TOPN(x) + RIML(x), b = Math.min(BOTN(x), t - 0.01);
    v[0] = t; v[1] = b; v[2] = NCW(x); v[3] = b + (t - b) * BYW(x); v[4] = 2 / BNU(x); v[5] = 2 / BNL(x);
  }), BSV = new Float64Array(6);
  function bodySec(x) {
    BST(x, BSV);
    BS.t = BSV[0]; BS.b = BSV[1]; BS.w = BSV[2]; BS.yw = BSV[3]; BS.eu = BSV[4]; BS.el = BSV[5];
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
  const SPST = table(SPX0, SPX1, 1100, 8, (x, v) => {
    const zi = SPZI(x), yt = SPT(x), zo = Math.max(zi + 0.02, SPW(x)), yb = Math.min(SPB(x), yt - 0.02);
    v[0] = zi; v[1] = SPYI(x); v[2] = yt; v[3] = zo; v[4] = Math.min(0.07, (yt - yb) * 0.45, (zo - zi) * 0.4); v[5] = yb;
    v[6] = Math.min(SPZU(x), zo - 0.02); v[7] = Math.min(SPYU(x), yb - 0.01);
  }), SPV = new Float64Array(8);
  function podSec(x) {
    const s = SPS;
    SPST(x, SPV);
    s.zi = SPV[0]; s.yi = SPV[1]; s.yt = SPV[2]; s.zo = SPV[3]; s.r = SPV[4]; s.yb = SPV[5]; s.zu = SPV[6]; s.yu = SPV[7];
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
  // top to the far foot; v 0 = the top, 1 = the near foot. Narrow-topped over the roll hoop. Its foot:
  // height ECYF, half width ECZF (the traced plan from x 3.42; the roll hoop's base before it) ----
  const ECN = curve([[3.16, 2.2], [3.5, 2.4], [4.2, 2.6], [4.97, 2.6]]), ECTP = curve([[3.16, 0.42], [3.45, 0.30], [3.8, 0.12], [4.3, 0.05], [4.97, 0.05]]);
  const ECYF = curve([[3.16, 0.745], [3.3, 0.70], [3.5, 0.635], [3.63, 0.60], [3.98, 0.52], [4.34, 0.43], [4.57, 0.355], [4.66, 0.29], [4.8, 0.27], [4.97, 0.30]]);
  const ECZF = curve([[3.16, 0.27], [3.30, 0.275], [3.42, 0.30], [3.7045, 0.3856], [3.9101, 0.3445], [4.1158, 0.3116], [4.3215, 0.2787], [4.486, 0.254],
    [4.6094, 0.2375], [4.7328, 0.2293], [4.8562, 0.2046], [4.97, 0.15]]);
  const ECST = table(3.16, 4.97, 905, 5, (x, v) => { const t = ECT(x); v[0] = 2 / ECN(x); v[1] = t; v[2] = Math.min(ECYF(x), t - 0.02); v[3] = ECZF(x); v[4] = ECTP(x); });
  const ECV5 = new Float64Array(5);
  function coverPt(x, v, q) {
    ECST(x, ECV5);
    const a = v * PI / 2, e = ECV5[0], c = Math.cos(a), t = ECV5[1], yf = ECV5[2];
    q[0] = x; q[1] = yf + (t - yf) * Math.pow(c, e); q[2] = ECV5[3] * Math.pow(Math.sin(a), e) * (1 - ECV5[4] * c * c);
    return q;
  }

  // ---- the gearbox and the crash structure (x 4.86 .. 5.50): a rounded box under the rear wing ----
  const CST = curve([[4.86, 0.62], [4.94, 0.545], [5.27, 0.47], [5.50, 0.42]]);
  const CSB = curve([[4.86, 0.27], [4.95, 0.28], [5.2, 0.29], [5.38, 0.265], [5.50, 0.29]]);
  const CSW = curve([[4.86, 0.17], [4.95, 0.13], [5.30, 0.085], [5.50, 0.07]]);
  function crashPt(x, a, q) {
    const t = CST(x), b = CSB(x), w = CSW(x), c = Math.cos(a), sn = Math.sin(a), e = 2 / 3.2, yc = (t + b) / 2;
    q[0] = x; q[1] = yc + (t - yc) * spow(c, e); q[2] = w * spow(sn, e);
    return q;
  }

  // ---- the front wing: four elements swept back in plan (leading edge LE0, the stack's trailing edge
  // TE0, both against |z|), the flaps rising toward the end plates. Per element: its share of the
  // stack's plan length, heights of its leading and trailing edges at the centre and at the end plate
  // (the side view's chords). Tabulated against |z| (the sampler calls them very often) ----
  const LE0 = curve([[0, 0.004], [0.083, 0.033], [0.51, 0.19], [0.95, 0.362]]);
  const TE0 = curve([[0, 0.5525], [0.246, 0.4813], [0.552, 0.6614], [0.868, 0.8416], [0.95, 0.815]]);
  const FWE = [
    { f: [0, 0.40], y0: [0.17, 0.19], y1: [0.16, 0.19] },
    { f: [0.36, 0.66], y0: [0.21, 0.25], y1: [0.21, 0.27] },
    { f: [0.62, 0.86], y0: [0.25, 0.30], y1: [0.28, 0.35] },
    { f: [0.82, 1.0], y0: [0.29, 0.34], y1: [0.36, 0.44] },
  ];
  const NZT = 240, ZMX = 0.95;
  const FWT = FWE.map((e) => {
    const T = new Float64Array((NZT + 2) * 6);
    for (let i = 0; i <= NZT + 1; i++) {
      const s = Math.min(ZMX, ZMX * i / NZT), g = Math.pow(sstep(0.2, 0.93, s), 1.2), le = LE0(s), L = TE0(s) - le;
      const xa = le + L * e.f[0], xb = le + L * e.f[1], ya = lerp(e.y0[0], e.y1[0], g), yb = lerp(e.y0[1], e.y1[1], g), an = Math.atan2(yb - ya, xb - xa);
      T.set([xa, ya, Math.hypot(xb - xa, yb - ya), an, Math.cos(an), Math.sin(an)], i * 6);
    }
    return T;
  });
  // the element k's section at z (the angle's cosine and sine too)
  const fwEl = (k) => {
    const T = FWT[k];
    return (z, q) => {
      const f = Math.min(NZT, Math.abs(z) / ZMX * NZT), i = f | 0, w = f - i, o = i * 6;
      q.x = T[o] + (T[o + 6] - T[o]) * w; q.y = T[o + 1] + (T[o + 7] - T[o + 1]) * w; q.c = T[o + 2] + (T[o + 8] - T[o + 2]) * w;
      q.a = T[o + 3] + (T[o + 9] - T[o + 3]) * w; q.ca = T[o + 4] + (T[o + 10] - T[o + 4]) * w; q.sa = T[o + 5] + (T[o + 11] - T[o + 5]) * w; q.t = 0.09; q.k = 0.05;
    };
  };
  // the top of the stack on the centre line (the nose's tip rests on it: no nose surface inside the wing)
  const FWX0 = LE0(0), FWL0 = TE0(0) - LE0(0);
  function stackTop(x) {
    let y = -1;
    for (const e of FWE) {
      const xa = FWX0 + FWL0 * e.f[0], xb = FWX0 + FWL0 * e.f[1];
      if (x >= xa && x <= xb) y = Math.max(y, e.y0[0] + (e.y0[1] - e.y0[0]) * (x - xa) / (xb - xa));
    }
    return y + 0.004;
  }

  /* ------------------------------------------------------------------
     Surface builders (metres; authoring only)
     ------------------------------------------------------------------ */
  // a surface over x0 .. x1 (u) and a profile v in v0 .. v1: fn(x, v, q) writes a point of the near
  // side; side -1 mirrors it onto the far side. flip: the near side's profile runs so that du x dv
  // points inward (top to bottom, inner to outer)
  function sweep(S, x0, x1, fn, side, o) {
    o = o || {};
    const f = o.flip !== false, v0 = o.v0 || 0, v1 = o.v1 == null ? 1 : o.v1;
    return S.param(function (u, v, q) { fn(x0 + (x1 - x0) * u, v0 + (v1 - v0) * v, q); if (side < 0) q[2] = -q[2]; },
      { gu: o.gu || Math.max(4, Math.round((x1 - x0) * 26)), gv: o.gv || 12, flip: side > 0 ? f : !f, w: o.w, heat: o.heat, glow: o.glow });
  }
  const both = (S, x0, x1, fn, o) => S.join(sweep(S, x0, x1, fn, 1, o), sweep(S, x0, x1, fn, -1, o));
  // a band of the centre body between the near-side angles a0(x) .. a1(x) (numbers or functions)
  const angAt = (f, x) => (typeof f === "function" ? f(x) : f);
  function bodyBand(S, x0, x1, a0, a1, side, o) {
    // the bounds tabulated along the band (they are smooth; the sampler calls this very often)
    const NB = 48, A0 = new Float64Array(NB + 1), A1 = new Float64Array(NB + 1), Q = [0, 0, 0];
    for (let i = 0; i <= NB; i++) { const x = x0 + (x1 - x0) * i / NB; A0[i] = angAt(a0, x); A1[i] = angAt(a1, x); }
    return sweep(S, x0, x1, (x, v, q) => {
      const f = (x - x0) / (x1 - x0) * NB, i = f >= NB ? NB - 1 : f < 0 ? 0 : f | 0, w = f - i;
      const A = A0[i] + (A0[i + 1] - A0[i]) * w, B = A1[i] + (A1[i + 1] - A1[i]) * w;
      bodyPt(x, A + (B - A) * v, Q); q[0] = Q[0]; q[1] = Q[1]; q[2] = Q[2];
    }, side, o);
  }
  // a wing section: the point at v (0 .. 0.5 the upper surface from the trailing edge to the leading
  // edge, 0.5 .. 1 the lower one back) of an element with leading edge (q.x, q.y), chord q.c, angle q.a
  // (trailing edge up), thickness q.t and camber q.k (fractions of the chord; the camber of these
  // inverted wings bulges down)
  // the chordwise station s and the unit thickness (NACA 4-digit) at v, tabulated
  const NSV = 512, SEC = new Float64Array((NSV + 1) * 2);
  for (let i = 0; i <= NSV; i++) {
    const v = i / NSV, s0 = v < 0.5 ? 1 - 2 * v : 2 * v - 1, s = 0.5 - 0.5 * Math.cos(PI * s0);
    SEC[i * 2] = s; SEC[i * 2 + 1] = (v < 0.5 ? 5 : -5) * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s * s * s - 0.1036 * s * s * s * s);
  }
  function section(q, v, out) {
    const g = v * NSV, i = g >= NSV ? NSV - 1 : g | 0, w = g - i, o = i * 2;
    const s = SEC[o] + (SEC[o + 2] - SEC[o]) * w, yt = q.t * (SEC[o + 1] + (SEC[o + 3] - SEC[o + 1]) * w);
    const ly = (-q.k * 4 * s * (1 - s) + yt) * q.c, lx = s * q.c;
    const ca = q.ca == null ? Math.cos(q.a) : q.ca, sa = q.sa == null ? Math.sin(q.a) : q.sa;
    out[0] = q.x + lx * ca - ly * sa; out[1] = q.y + lx * sa + ly * ca;
  }
  // a wing element spanning z0 .. z1: f(z, q) gives its section there
  function foil(S, z0, z1, f, o) {
    const q = { x: 0, y: 0, c: 0.1, a: 0, t: 0.1, k: 0.04 }, v0 = (o && o.v0) || 0, v1 = (o && o.v1) || 1;
    return S.param((u, vv, out) => {
      const z = z0 + (z1 - z0) * u;
      q.t = 0.1; q.k = 0.04;
      f(z, q);
      section(q, v0 + (v1 - v0) * vv, out); out[2] = z;
    }, Object.assign({ gu: 28, gv: 16, flip: z1 > z0 }, o));
  }
  // a wing element as its upper surface, its underside and a crisp line along the trailing edge
  function blade(S, z0, z1, f, o) {
    o = o || {};
    const q = { x: 0, y: 0, c: 0.1, a: 0, t: 0.1, k: 0.04 }, gu = o.gu || 28, gv = o.gv || 16;
    const te = (s, out) => { const z = z0 + (z1 - z0) * s; f(z, q); out[0] = q.x + q.c * Math.cos(q.a); out[1] = q.y + q.c * Math.sin(q.a); out[2] = z; };
    return S.join(
      foil(S, z0, z1, f, { gu, gv: Math.ceil(gv / 2), v0: 0, v1: 0.5 }),
      foil(S, z0, z1, f, { gu, gv: Math.ceil(gv / 2), v0: 0.5, v1: 1, w: o.wl == null ? 1 : o.wl }),
      tube(S, te, 0.0035, 0.0035, [0, 1, 0], { gu: Math.max(8, gu), gv: 4, w: o.wt == null ? 1.6 : o.wt }));
  }
  // a rear-wing element's rounded tip (the 2022 rules): its section at |z| = zr turned about the x axis
  // through (ya, zr) by 0 .. 90 degrees, outward and down into the end plate's top; cz scales the
  // outward reach (so the tip stays inside the traced half span). Upper and lower surfaces and the
  // trailing edge's line, on the side sd
  function rollTip(S, f, zr, ya, cz, sd, o) {
    o = o || {};
    const q = { x: 0, y: 0, c: 0.1, a: 0, t: 0.1, k: 0.04 }, P = [0, 0];
    f(zr, q);
    const map = (x, y, th, out) => { const r = y - ya; out[0] = x; out[1] = ya + r * Math.cos(th); out[2] = sd * (zr + cz * r * Math.sin(th)); };
    const surf = (v0, v1, w) => S.param((u, vv, out) => { section(q, v0 + (v1 - v0) * vv, P); map(P[0], P[1], u * PI / 2, out); },
      { gu: o.gu || 10, gv: o.gv || 8, flip: sd > 0, w });
    const xte = q.x + q.c * Math.cos(q.a), yte = q.y + q.c * Math.sin(q.a);
    return S.join(surf(0, 0.5, 1), surf(0.5, 1, o.wl == null ? 1 : o.wl),
      tube(S, (s, out) => map(xte, yte, s * PI / 2, out), 0.0035, 0.0035, [1, 0, 0], { gu: 10, gv: 4, w: o.wt == null ? 1.6 : o.wt, flip: sd > 0 }));
  }
  // a tube along path(s, out), s in 0 .. 1; section half axes a (toward `ref`) and b. The path and its
  // frame are tabulated first (the sampler calls the surface very often)
  function tube(S, path, a, b, ref, o) {
    o = o || {};
    const NT = Math.max(32, (o.gu || 24) * 2), T = new Float64Array((NT + 1) * 9), P0 = [0, 0, 0], P1 = [0, 0, 0], C = [0, 0, 0];
    for (let i = 0; i <= NT; i++) {
      const u = i / NT, e = 1e-3;
      path(Math.max(0, u - e), P0); path(Math.min(1, u + e), P1); path(u, C);
      let dx = P1[0] - P0[0], dy = P1[1] - P0[1], dz = P1[2] - P0[2];
      const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      const k = ref[0] * dx + ref[1] * dy + ref[2] * dz;
      let ex = ref[0] - k * dx, ey = ref[1] - k * dy, ez = ref[2] - k * dz;
      const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      const o9 = i * 9;
      T[o9] = C[0]; T[o9 + 1] = C[1]; T[o9 + 2] = C[2]; T[o9 + 3] = ex; T[o9 + 4] = ey; T[o9 + 5] = ez;
      T[o9 + 6] = dy * ez - dz * ey; T[o9 + 7] = dz * ex - dx * ez; T[o9 + 8] = dx * ey - dy * ex;
    }
    return S.param((u, v, out) => {
      const g = u * NT, i = g >= NT ? NT - 1 : g | 0, w = g - i, o0 = i * 9;
      const ang = TAU * v, ca = Math.cos(ang) * a, sa = Math.sin(ang) * b;
      for (let k = 0; k < 3; k++) {
        const c = T[o0 + k] + (T[o0 + 9 + k] - T[o0 + k]) * w, e = T[o0 + 3 + k] + (T[o0 + 12 + k] - T[o0 + 3 + k]) * w, f = T[o0 + 6 + k] + (T[o0 + 15 + k] - T[o0 + 6 + k]) * w;
        out[k] = c + e * ca + f * sa;
      }
    }, Object.assign({ gu: 24, gv: 6, flip: true }, o));
  }
  // a straight strut from p to q (section half axes a along `ref`, b across)
  function strut(S, p, q, a, b, ref, o) {
    return tube(S, (s, out) => { out[0] = p[0] + (q[0] - p[0]) * s; out[1] = p[1] + (q[1] - p[1]) * s; out[2] = p[2] + (q[2] - p[2]) * s; }, a, b, ref || [1, 0, 0],
      Object.assign({ gu: Math.max(4, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) * 28)) }, o));
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
  // a tyre round the axle (z) at c, from its measured section: radius R, tread half width ht, section
  // half width hs (the sidewall's bulge), the bead on the 18-inch rim's flange (radius r, rim half width
  // hb): per side the shoulder (a quarter torus), the sidewall (a flat ring) and the bead's short cone,
  // and the tread between z0 and z1; analytic patches (cheap to sample)
  function tyreSide(S, c, R, r, hs, ht, hb, sd, w) {
    const rt = hs - ht, R1 = R - rt, rb = r + 0.015, o = { w };
    return S.join(
      S.torus(R1, rt, Object.assign({ at: [c[0], c[1], c[2] + sd * ht], tube: sd > 0 ? [0, PI / 2] : [-PI / 2, 0], gu: 48, gv: 4 }, o)),
      S.disc(rb, R1, Object.assign({ at: [c[0], c[1], c[2] + sd * hs], axis: sd > 0 ? "z" : "-z" }, o)),
      sd > 0 ? S.cyl(r, hs - hb, Object.assign({ r1: rb, axis: "z", at: [c[0], c[1], c[2] + hb], caps: false, gu: 40, gv: 2 }, o))
        : S.cyl(rb, hs - hb, Object.assign({ r1: r, axis: "z", at: [c[0], c[1], c[2] - hs], caps: false, gu: 40, gv: 2 }, o)));
  }
  const tread = (S, c, R, z0, z1) => S.cyl(R, z1 - z0, { axis: "z", at: [c[0], c[1], c[2] + z0], caps: false, gu: 48, gv: 3 });
  // a face in the plane x between an inner ellipse (centre zc, yc; half axes rz, ry) and an outer closed
  // outline ([z, y] polygon), filled along rays from the centre; nx: the side it faces (-1 forward)
  function ringFace(S, x, outer, zc, yc, rz, ry, nx, o) {
    const NR = 360, R = new Float64Array(NR + 1);
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
    }, Object.assign({ gu: 40, gv: 4, flip: nx < 0 }, o));
  }
  // a lip: a thin tube round a closed loop of [z, y] points in the plane x
  function lip(S, x, zy, r, o) { return tube(S, loopX(x, zy), r, r, [1, 0, 0], Object.assign({ gu: Math.max(24, Math.round(zy.length * 1.5)), gv: 5 }, o)); }

  /* ------------------------------------------------------------------
     The car
     ------------------------------------------------------------------ */
  function f1Parts(S, H) {
    const P = {};
    // a part from geometry in metres (its pivot in metres too)
    const put = (name, at, parent, ...shapes) => {
      const atM = toM(at);
      P[name] = { at: atM, rot: null, parent: parent || null, world: true, shape: S.place(S.join(shapes), [OFF[0] - atM[0], OFF[1] - atM[1], OFF[2] - atM[2]], null, K) };
    };
    const Q = [0, 0, 0], NEAR = 1, FAR = -1;

    // ---- nose: its tip (x < 0.48) rests on the front wing's stack (the band from the top down to the
    // stack on each side, and the tip's round face), the full section behind it. back2 carries it up to
    // x 0.86, head from there to 1.85 ----
    const NA = 0.48, NB = 0.86, NC = 1.85;
    const aStack = (x) => bodyAng(x, Math.max(stackTop(x), bodySec(x).b + 0.004));
    const tipA = aStack(0.004);
    const noseTip = S.join(
      bodyBand(S, 0.004, NA, 0, aStack, NEAR, { gu: 12, gv: 8 }), bodyBand(S, 0.004, NA, 0, aStack, FAR, { gu: 12, gv: 8 }),
      S.param((u, v, q) => {
        bodyPt(0.004, tipA * (2 * u - 1), Q); const s = bodySec(0.004), yc = (s.t + stackTop(0.004)) / 2;
        q[0] = 0.004 - 0.004 * (1 - v); q[1] = yc + (Q[1] - yc) * v; q[2] = Q[2] * v;
      }, { gu: 16, gv: 3, flip: false }));
    const noseMid = S.join(bodyBand(S, NA, NB, 0, PI, NEAR, { gu: 10, gv: 10 }), bodyBand(S, NA, NB, 0, PI, FAR, { gu: 10, gv: 10 }));
    const noseRear = S.join(bodyBand(S, NB, NC, 0, PI, NEAR, { gu: 24, gv: 11 }), bodyBand(S, NB, NC, 0, PI, FAR, { gu: 24, gv: 11 }));

    // ---- front wing: four elements (back2 the centre, |z| < 0.36, with the neutral section; back1/3
    // the outer halves to |z| 0.70; scap the outer ends), each element its upper and lower surfaces and
    // a crisp trailing edge; the end plates (traced, with scap) and their foot plates ----
    const ZW = 0.36, ZS = 0.70;
    const fwing = (z0, z1, gu) => S.join(FWE.map((e, k) => blade(S, z0, z1, fwEl(k), { gu, gv: 8 })));
    const FEP = S.rounded([[0.8173, 0.4966], [0.6621, 0.4782], [0.5468, 0.44], [0.467, 0.3598], [0.4072, 0.2665], [0.385, 0.2109], [0.3961, 0.1733],
      [0.5956, 0.1564], [0.8173, 0.1618]], 0.03, 3);
    const fwPlate = (sd) => S.place(slab(S, FEP, 0.012, 1, 1.6), [0, 0, sd * 0.952]);
    const fwFoot = (sd) => S.quad([0.40, 0.162, sd * 0.958], [0.817, 0.162, sd * 0.958], [0.40, 0.158, sd * 0.90], [0.817, 0.162, sd * 0.90], { w: 0.6 });

    // ---- the floor: its top from the chassis or the undercut's foot out to the edge; the fences under
    // the front of the chassis (four a side) ----
    const FZI = curve([[1.72, 0.17], [1.8, 0.18], [2.06, 0.214], [2.32, 0.26], [2.43, 0.285], [2.8, 0.30], [3.2, 0.34], [3.6, 0.38], [4.2, 0.36], [4.45, 0.30], [4.58, 0.27]]);
    const floorTop = (x, v, q) => { const zi = Math.min(FZI(x), FLW(x) - 0.01); q[0] = x; q[2] = zi + (FLW(x) - zi) * v; q[1] = FET(x); };
    const fence = (z, sd) => {
      // from the floor's swept leading edge at z, rearward
      let x0 = FLX0;
      for (let k = 0; k < 60 && FLW(x0) < z; k++) x0 += 0.01;
      return S.place(slab(S, [[x0, 0.07], [x0 + 0.55, 0.07], [x0 + 0.55, 0.115], [x0 + 0.05, 0.20], [x0, 0.19]], 0.008, 0.5, 1.4), [0, 0, sd * z]);
    };
    const fences = (sd) => S.join(fence(0.25, sd), fence(0.35, sd), fence(0.45, sd), fence(0.55, sd));
    const floorAhead = (sd) => sweep(S, FLX0, SPX0, floorTop, sd, { gu: 16, gv: 8, w: 0.6 });

    // ---- monocoque: the chassis down to the floor ahead of the sidepods, above the sidepods alongside
    // the cockpit; the cockpit's walls down to its seat, the seat, the steering wheel. NO DRIVER (the
    // owner asked): no helmet, no body; do not add one ----
    const aOpen = (x) => (ckW(x) > 0.002 ? bodyAngZ(x, ckW(x)) : 0);
    const aFloor = (x) => bodyAng(x, 0.135);
    const aPod = (x) => bodyAng(x, SPYI(x));
    // the seat: a shallow moulded dish about 0.3 m under the rim, its back rising to the rim at the rear
    const YSEAT = curve([[2.34, 0.54], [2.45, 0.47], [2.62, 0.41], [2.82, 0.385], [2.96, 0.395], [3.05, 0.47], [3.11, 0.60], [3.16, 0.74]]);
    const seatY = (x, zr) => YSEAT(x) + 0.085 * Math.pow(Math.min(1, Math.abs(zr)), 2.4);
    const RIMT = table(CK.x0, CK.x1, 400, 2, (x, t) => { bodyPt(x, aOpen(x), Q); t[0] = Q[1]; t[1] = Math.min(Q[1] - 0.02, seatY(x, 1)); }), RV = new Float64Array(2);
    const wall = (sd) => sweep(S, CK.x0 + 0.003, CK.x1, (x, v, q) => {
      RIMT(x, RV); q[0] = x; q[2] = ckW(x); q[1] = RV[0] + (RV[1] - RV[0]) * v;
    }, sd, { gu: 30, gv: 5, w: 0.55, flip: false });
    const seat = S.param((u, v, q) => {
      const x = CK.x0 + 0.01 + (CK.x1 - 0.004 - CK.x0 - 0.01) * u, w = Math.max(0.002, ckW(x) - 0.004), zr = 2 * v - 1;
      q[0] = x; q[2] = w * zr; q[1] = seatY(x, zr);
    }, { gu: 26, gv: 10, flip: true });
    const chassisBand = (x0, x1, a0, a1, sd, gu, gv) => bodyBand(S, x0, x1, a0, a1, sd, { gu, gv });

    // ---- airbox and roll hoop: the top of the cover over the roll hoop, its face round the intake, the
    // intake's lip, the roll-hoop camera on top ----
    const NKX = 3.45;
    const face = [];
    for (let k = 0; k <= 24; k++) { coverPt(3.161, 1 - k / 24, Q); face.push([Q[2], Q[1]]); }
    for (let k = 1; k <= 24; k++) { coverPt(3.161, k / 24, Q); face.push([-Q[2], Q[1]]); }
    const intake = []; for (let k = 0; k < 24; k++) { const a = TAU * k / 24; intake.push([0.085 * Math.cos(a), 0.905 + 0.07 * Math.sin(a)]); }
    const TCAM = [[3.4028, 1.02], [3.4028, 1.0329], [3.3875, 1.117], [3.3569, 1.1398], [3.2601, 1.1394], [3.2397, 1.1087], [3.2244, 1.02]];

    // ---- engine cover (v 0 the top .. 1 the foot), the gearbox and crash structure ----
    const ECV = 0.5;   // the right flank's lower half (v > ECV) goes with the right sidepod
    const csEnd = S.param((u, v, q) => { crashPt(5.50, TAU * u, Q); const yc = (CST(5.5) + CSB(5.5)) / 2; q[0] = 5.50; q[1] = yc + (Q[1] - yc) * v; q[2] = Q[2] * v; },
      { gu: 24, gv: 3, flip: false });
    // (its underside sits on the diffuser's roof, out of sight: the sides stop above it)
    const crash = S.join(sweep(S, 4.86, 5.50, (x, v, q) => crashPt(x, v * 0.78 * PI, q), NEAR, { gu: 18, gv: 8 }),
      sweep(S, 4.86, 5.50, (x, v, q) => crashPt(x, v * 0.78 * PI, q), FAR, { gu: 18, gv: 8 }), csEnd);

    // ---- sidepods: top and outer side in three lengths; the inlet's lip and the radiator face behind
    // it in the first ----
    const pod = (x0, x1, gu, sd) => S.join(sweep(S, x0, x1, podTop, sd, { gu, gv: 6 }), sweep(S, x0, x1, podSide, sd, { gu, gv: 8 }));
    const inlet = [];
    for (let k = 0; k <= 12; k++) { podTop(SPX0, k / 12, Q); inlet.push([Q[2], Q[1]]); }
    for (let k = 1; k <= 14; k++) { podSide(SPX0, k / 14, Q); inlet.push([Q[2], Q[1]]); }
    for (let k = 1; k <= 12; k++) { podUnder(SPX0, k / 12, Q); inlet.push([Q[2], Q[1]]); }
    let cz = 0, cy = 0;
    for (const p of inlet) { cz += p[0] / inlet.length; cy += p[1] / inlet.length; }
    const core = inlet.map((p) => [cz + (p[0] - cz) * 0.9, cy + (p[1] - cy) * 0.9]);
    const podInlet = (sd) => {
      const sh = S.join(lip(S, SPX0 + 0.004, inlet, 0.011), ringFace(S, SPX0 + 0.09, core, cz, cy, 0, 0, -1, { w: 0.5, heat: 0.22, gv: 5 }));
      return sd > 0 ? sh : S.mirror(sh);
    };
    const SP1 = 3.05, SP2 = 3.70;

    // ---- the undercut, the chassis side inside it, the floor's edge (flank) ----
    const cave = (sd) => sweep(S, SPX0, 3.35, (x, v, q) => { const yu = SPYU(x); q[0] = x; q[2] = SPZU(x); q[1] = yu + (0.115 - yu) * v; }, sd, { gu: 18, gv: 6, w: 0.7 });
    const flank = (sd) => S.join(sweep(S, SPX0, 4.6, podUnder, sd, { gu: 36, gv: 8 }),
      sweep(S, 1.70, 4.53, (x, v, q) => { q[0] = x; q[2] = FLW(x); q[1] = FET(x) + (FEB(x) - FET(x)) * v; }, sd, { gu: 56, gv: 2, w: 0.9 }));

    // ---- the plank under the floor: its underside and its sides (its top is inside the body) ----
    const PK = PLANK;
    const plank = S.join(
      S.quad([PK.x0, PK.y0, -PK.z], [PK.x1, PK.y0, -PK.z], [PK.x0, PK.y0, PK.z], [PK.x1, PK.y0, PK.z]),
      S.quad([PK.x0, PK.y0, PK.z], [PK.x1, PK.y0, PK.z], [PK.x0, PK.y1, PK.z], [PK.x1, PK.y1, PK.z]),
      S.quad([PK.x1, PK.y0, -PK.z], [PK.x0, PK.y0, -PK.z], [PK.x1, PK.y1, -PK.z], [PK.x0, PK.y1, -PK.z]),
      S.quad([PK.x0, PK.y0, -PK.z], [PK.x0, PK.y0, PK.z], [PK.x0, PK.y1, -PK.z], [PK.x0, PK.y1, PK.z]));
    S.tag(plank, { w: 0.5 });

    // ---- halo: the hoop round the cockpit on its rear mounts and the centre pillar; the mirrors on
    // their stalks over the sidepod inlets; the headrest ----
    const hoop = spline([[2.86, 0.75, 0.275], [2.81, 0.785, 0.287], [2.70, 0.826, 0.312], [2.56, 0.850, 0.310], [2.45, 0.862, 0.255], [2.385, 0.866, 0.15],
      [2.36, 0.866, 0], [2.385, 0.866, -0.15], [2.45, 0.862, -0.255], [2.56, 0.850, -0.310], [2.70, 0.826, -0.312], [2.81, 0.785, -0.287], [2.86, 0.75, -0.275]]);
    const mirror = (s) => S.join(
      S.box(0.23, 0.073, 0.155, { at: [2.38, 0.7315, s * 0.62], r: 0.03 }),
      strut(S, [2.42, 0.70, s * 0.59], [2.45, 0.665, s * 0.55], 0.018, 0.01, [1, 0, 0]));

    // ---- rear wing: the main plane and the DRS flap between the tips (|z| < 0.48, a slightly deeper
    // centre), each rolling down at its ends into the end plate about the FIA tip axis (z 0.48, y 0.73);
    // the end plates (traced, leaning out) below the tips; the swan-neck pylon down into the engine
    // cover ----
    const ZR = 0.48, YA = 0.73;
    const mid = (z) => { const r = z / ZR; return r * r < 1 ? 1 - r * r : 0; };
    const mainF = (z, q) => { const m = mid(z); q.x = 5.025 - 0.02 * m; q.y = 0.857 - 0.006 * m; q.c = 0.30 + 0.02 * m; q.a = 0.08 + 0.02 * m; q.t = 0.10; q.k = 0.035; };
    const flapF = (z, q) => { const m = mid(z); q.x = 5.29; q.y = 0.888; q.c = 0.204; q.a = 0.44 + 0.03 * m; q.t = 0.10; q.k = 0.05; };
    // the outward reach: the main plane lands on the end plate's top, the flap's trailing edge reaches the
    // traced half span (0.612)
    const CZM = (0.568 - ZR) / (0.866 - YA), CZF = (0.612 - ZR) / (0.98 - YA);
    const PYL = [[5.3119, 1.0009], [4.9348, 0.9993], [4.8594, 0.911], [4.8393, 0.7852], [4.8393, 0.66], [4.8971, 0.66], [4.8971, 0.7855], [4.9549, 0.9165], [5.3119, 0.9582]];
    const REP = S.rounded([[5.6051, 0.8432], [5.50, 0.835], [5.48, YA + 0.004], [5.0683, YA], [5.0683, 0.6028], [5.2805, 0.4388], [5.4525, 0.3263], [5.5279, 0.3927],
      [5.57, 0.6286], [5.6051, 0.80]], 0.03, 3);
    const endPlate = (sd) => S.place(slab(S, REP, 0.012, 1, 1.6), [0, 0, sd * (0.46 - 0.27 * 0.33)], [1, 0, 0, 0, 1, 0, 0, sd * 0.27, 1]);

    // ---- the two-element beam wing (the lower one arched, the upper one twisted a little toward its
    // tips), the tailpipe and the rain light on the crash structure's end; the diffuser: side walls,
    // roof (higher in its outer channels) and strakes ----
    // (each element in two halves either side of the crash structure, which carries them)
    const beam = (f) => S.join(blade(S, -0.45, -0.095, f, { gu: 10, gv: 10, wt: 1, wl: 0.8 }), blade(S, 0.095, 0.45, f, { gu: 10, gv: 10, wt: 1, wl: 0.8 }));
    const beamLo = (z, q) => { const r = z / 0.45; q.x = 5.19; q.y = 0.391 + 0.022 * r * r; q.c = 0.254; q.a = 0.18; q.t = 0.10; q.k = 0.05; };
    const beamHi = (z, q) => { const r = z / 0.45; q.x = 5.22 + 0.01 * r * r; q.y = 0.491; q.c = 0.25 - 0.02 * r * r; q.a = 0.205 - 0.05 * r * r; q.t = 0.10; q.k = 0.05; };
    const zWall = (x) => (x < 4.58 ? 0.50 : FLW(x));
    const roofY = (x, v) => 0.062 + (DIFR(x) - 0.062) * (0.80 + 0.20 * sstep(0.12, 0.6, v));
    const dWall = (sd) => sweep(S, 4.2203, 5.375, (x, v, q) => { q[0] = x; q[2] = zWall(x); q[1] = 0.062 + (DIFT(x) - 0.062) * v; }, sd, { gu: 30, gv: 5, w: 0.8, flip: false });
    const dRoof = (sd) => sweep(S, 4.40, 5.37, (x, v, q) => { q[0] = x; q[2] = zWall(x) * v; q[1] = roofY(x, v); }, sd, { gu: 18, gv: 8, flip: false });
    const strake = (sd) => {
      const z = 0.17, top = (x) => roofY(x, z / zWall(x));
      return sidePlate(S, [[4.45, 0.062], [5.30, 0.062], [5.30, top(5.30)], [4.875, top(4.875)], [4.45, top(4.45)]], sd * z, 0.006, 0.4, 1.2);
    };

    // ---- wheels: tyres (paw); rims (lo): the cover over the rim's face, the rim's lip (a crisp ring
    // between the cover and the tyre), the hub nut, the rim's inner face; the front brake drum ----
    // (the rear rim's inner face is behind the brake-duct housing: rIn 0 leaves it out)
    const rimL = (c, rw, rIn) => {
      const zo = c[2] + rw / 2 + 0.004, zi = c[2] - rw / 2 + 0.01;
      return S.join(
        S.disc(0.036, RIMR - 0.016, { at: [c[0], c[1], zo], w: 0.7 }),
        S.tag(S.torus(RIMR - 0.009, 0.009, { at: [c[0], c[1], zo - 0.004] }), { w: 1.8 }),
        S.cyl(0.034, 0.012, { axis: "z", at: [c[0], c[1], zo] }),
        rIn > 0 ? S.disc(rIn, RIMR - 0.01, { at: [c[0], c[1], zi], axis: "-z", w: 0.4 }) : null);
    };
    const CF = [WFR.x, WFR.y, WFR.z], CR = [WRE.x, WRE.y, WRE.z], DRF = 0.13;
    const ziF = WFR.z - WFR.rim / 2 + 0.01;
    const drum = (sd) => S.place(S.join(S.cyl(DRF, 0.075, { axis: "z", at: [CF[0], CF[1], ziF - 0.075], caps: false }),
      S.disc(0, DRF, { at: [CF[0], CF[1], ziF - 0.075], axis: "-z" })), null, sd > 0 ? null : [1, 0, 0, 0, 1, 0, 0, 0, -1]);

    // ---- suspension (up): faired wishbones, push and pull rods, track and toe links (a little off the
    // axle line); the winglet over each front tyre; the rear driveshafts and brake-duct housings ----
    const arm = (p, q) => strut(S, p, q, 0.032, 0.011, [1, 0, 0]);
    // the front track rod (a little off the axle line) rides with the front wing's tip (scap)
    const trackRod = (sd) => (sd > 0 ? arm([1.17, 0.36, 0.15], [1.24, 0.385, 0.655]) : S.mirror(arm([1.17, 0.36, 0.15], [1.24, 0.385, 0.655])));
    const winglet = (sd) => S.param((u, v, q) => {
      const a = 1.20 + 0.58 * u, R = 0.374 + 0.02 * v; q[0] = WFR.x + R * Math.cos(a); q[1] = WFR.y + R * Math.sin(a); q[2] = sd * (0.625 + 0.05 * v);
    }, { gu: 16, gv: 4, flip: sd < 0 });

    /* ---------------- the parts ---------------- */
    // front wing and nose
    put("back2", [0.3, 0.22, 0], "head", fwing(-ZW, ZW, 18), noseTip, noseMid);
    put("back1", [0.45, 0.26, 0.56], "head", fwing(ZW, ZS, 16), winglet(NEAR), drum(NEAR));
    put("back3", [0.45, 0.26, -0.56], "head", fwing(-ZS, -ZW, 16), winglet(FAR), drum(FAR));
    put("scapL", [0.62, 0.33, 0.90], "head", fwing(ZS, 0.944, 8), fwPlate(NEAR), fwFoot(NEAR), trackRod(NEAR));
    put("scapR", [0.62, 0.33, -0.90], "head", fwing(-0.944, -ZS, 8), fwPlate(FAR), fwFoot(FAR), trackRod(FAR));
    put("head", [1.3, 0.45, 0], "chest", noseRear);

    // monocoque, cockpit, the floor ahead of the left sidepod
    put("chest", [2.3, 0.45, 0], null,
      chassisBand(NC, SPX0, aOpen, aFloor, NEAR, 14, 16), chassisBand(NC, SPX0, aOpen, aFloor, FAR, 14, 16),
      chassisBand(SPX0, CK.x1, aOpen, aPod, FAR, 20, 5),
      seat,
      S.box(0.04, 0.11, 0.26, { at: [2.42, 0.655, 0], w: 0.8 }),
      floorAhead(NEAR), fences(NEAR));

    // airbox; halo, mirrors, headrest and the roll-hoop camera
    put("neck", [3.3, 0.9, 0], "chest",
      both(S, 3.161, NKX, coverPt, { gu: 10, gv: 14 }),
      ringFace(S, 3.161, face, 0, 0.905, 0.085, 0.07, -1),
      lip(S, 3.166, intake, 0.008),
      S.box(0.10, 0.035, 0.25, { at: [3.31, 1.1225, 0] }));
    put("jaw", [2.5, 0.8, 0], "chest", tube(S, hoop, 0.024, 0.02, [0, 1, 0], { gu: 60, gv: 6 }),
      strut(S, [2.06, 0.66, 0], [2.335, 0.866, 0], 0.018, 0.018, [0, 0, 1]), mirror(1), mirror(-1),
      tube(S, spline([[2.72, 0.752, 0.205], [2.86, 0.762, 0.19], [3.0, 0.764, 0.17], [3.12, 0.76, 0.12], [3.15, 0.757, 0], [3.12, 0.76, -0.12], [3.0, 0.764, -0.17],
        [2.86, 0.762, -0.19], [2.72, 0.752, -0.205]]), 0.022, 0.032, [0, 1, 0], { gu: 32, gv: 6 }),
      sidePlate(S, TCAM, 0, 0.034, 1, 1.2));

    // engine cover (the lower halves of its flanks ahead of x 4.2 with the sidepods' middles; the right
    // one's rear with the right sidepod too), gearbox, crash structure
    put("hips", [4.3, 0.62, 0], "chest",
      sweep(S, NKX, 4.97, coverPt, NEAR, { gu: 34, gv: 6, v1: ECV }), sweep(S, NKX, 4.6, coverPt, NEAR, { gu: 26, gv: 6, v0: ECV }),
      sweep(S, NKX, 4.97, coverPt, FAR, { gu: 34, gv: 6, v1: ECV }), crash);

    // sidepods (the right side carries more of the right side: see the header)
    put("maneL1", [2.65, 0.58, 0.5], "chest", pod(SPX0, SP1, 16, NEAR), podInlet(NEAR), chassisBand(SPX0, CK.x1, aOpen, aPod, NEAR, 20, 5), cave(NEAR));
    put("maneL2", [3.3, 0.52, 0.62], "chest", pod(SP1, SP2, 22, NEAR), wall(NEAR));
    put("maneL3", [4.15, 0.40, 0.5], "chest", pod(SP2, SPX1, 26, NEAR), dWall(NEAR), sweep(S, 4.6, 4.97, coverPt, NEAR, { gu: 10, gv: 6, v0: ECV }));
    put("maneR1", [2.65, 0.58, -0.5], "chest", pod(SPX0, SP1, 16, FAR), podInlet(FAR), floorAhead(FAR), fences(FAR), strake(FAR), cave(FAR));
    put("maneR2", [3.3, 0.52, -0.62], "chest", pod(SP1, SP2, 22, FAR), sweep(S, NKX, 4.97, coverPt, FAR, { gu: 34, gv: 6, v0: ECV }), wall(FAR));
    put("maneR3", [4.15, 0.40, -0.5], "chest", pod(SP2, SPX1, 26, FAR), dWall(FAR), dRoof(FAR));

    // undercut and floor edges, the floor and the plank
    put("flankL", [3.3, 0.25, 0.55], "chest", flank(NEAR));
    put("flankR", [3.3, 0.25, -0.55], "chest", flank(FAR));
    put("belly", [3.4, 0.1, 0], "chest", both(S, SPX0, 4.58, floorTop, { gu: 36, gv: 6, w: 0.8 }), plank);

    // rear wing: main plane and pylon; the flap; the end plates with the flap's tips
    put("tail3", [5.15, 0.88, 0], "chest", blade(S, -ZR, ZR, mainF, { gu: 32, gv: 12 }));
    put("tail4", [5.39, 0.93, 0], "tail3", blade(S, -ZR, ZR, flapF, { gu: 32, gv: 12 }));
    put("haunchL", [5.33, 0.62, 0.55], "tail3", endPlate(NEAR), rollTip(S, flapF, ZR, YA, CZF, NEAR));
    put("haunchR", [5.33, 0.62, -0.55], "tail3", endPlate(FAR), rollTip(S, flapF, ZR, YA, CZF, FAR));

    // beam wing, tailpipe, rain light; the diffuser's left half with the main plane's tips
    put("tail2", [5.2, 0.42, 0], "chest",
      S.tag(S.join(beam(beamLo), beam(beamHi),
        S.cyl(0.042, 0.22, { axis: "x", at: [4.93, 0.575, 0], caps: false }),
        S.torus(0.04, 0.006, { axis: "x", at: [5.15, 0.575, 0], heat: 0.5 })), { glow: 0 }),
      S.box(0.012, 0.05, 0.075, { at: [5.508, 0.36, 0], heat: 0.12 }));
    // (the pylon is a 30 mm plate on the centre line: the air goes round it, so it does not block the page's
    // 2D air, which would otherwise see a wall from the engine cover up to the wing and trap a vortex there)
    put("tail1", [4.9, 0.2, 0], "chest", dRoof(NEAR), strake(NEAR), rollTip(S, mainF, ZR, YA, CZM, NEAR), rollTip(S, mainF, ZR, YA, CZM, FAR),
      S.tag(sidePlate(S, PYL, 0, 0.03, 1, 1.3), { solid: 0 }));

    // wheels: the tyres (the front one's inner shoulder and sidewall, the rear one's inner sidewall go
    // with the rims: both turn together)
    const sideF = (sd, w) => tyreSide(S, CF, TR, RIMR, WFR.w / 2, WFR.tread / 2, WFR.rim / 2 + 0.006, sd, w);
    const sideR = (sd, w) => tyreSide(S, CR, TR, RIMR, WRE.w / 2, WRE.tread / 2, WRE.rim / 2 + 0.006, sd, w);
    const HTF = WFR.tread / 2, HTR = WRE.tread / 2;
    put("fl_paw", CF, null, sideF(1, 1), tread(S, CF, TR, -0.3 * HTF, HTF));
    put("fl_lo", CF, null, rimL(CF, WFR.rim, DRF), tread(S, CF, TR, -HTF, -0.3 * HTF), sideF(-1, 0.2));
    put("hl_paw", CR, null, sideR(1, 1), tread(S, CR, TR, -0.85 * HTR, HTR));
    put("hl_lo", CR, null, rimL(CR, WRE.rim, 0), tread(S, CR, TR, -HTR, -0.85 * HTR), sideR(-1, 0.35));

    // suspension
    put("fl_up", [1.33, 0.40, 0.42], "chest",
      arm([1.12, 0.53, 0.15], [1.33, 0.56, 0.655]), arm([1.58, 0.56, 0.16], [1.33, 0.56, 0.655]),
      arm([1.08, 0.29, 0.13], [1.32, 0.17, 0.665]), arm([1.62, 0.25, 0.15], [1.32, 0.17, 0.665]),
      arm([1.32, 0.19, 0.64], [1.40, 0.55, 0.16]));
    put("hl_up", [4.92, 0.38, 0.38], "chest",
      arm([4.72, 0.52, 0.17], [4.93, 0.56, 0.58]), arm([5.08, 0.50, 0.13], [4.93, 0.56, 0.58]),
      arm([4.70, 0.26, 0.20], [4.92, 0.16, 0.60]), arm([5.12, 0.29, 0.12], [4.92, 0.16, 0.60]),
      arm([4.76, 0.29, 0.20], [4.83, 0.31, 0.58]), arm([4.92, 0.52, 0.56], [4.80, 0.27, 0.15]),
      strut(S, [4.90, 0.335, 0.12], [4.92, 0.3645, 0.485], 0.022, 0.022, [0, 1, 0]),
      S.box(0.30, 0.40, 0.04, { at: [4.93, 0.37, 0.505], w: 0.6 }));
    for (const n of ["up", "lo", "paw"]) { P["fr_" + n] = H.mirror(P["fl_" + n]); P["hr_" + n] = H.mirror(P["hl_" + n]); }
    return P;
  }

  /* ------------------------------------------------------------------
     Motion: the wheels roll at the floor's speed, the rain light blinks,
     the engine hums through the chassis
     ------------------------------------------------------------------ */
  const F1_D = 4.0;
  // the rolling road moves with the wind: half the screen's longer side a second, 3.65 machine units a
  // second on a 1440 x 900 screen, 4.1 at 1920 x 1080, 4.2 on a phone (intro.js layout, flow.js inflow)
  const FLOOR_V = 3.9;
  const WHEEL_W = FLOOR_V / (TR * K);        // so the tyres' contact patches move with it
  function f1Animate(A, t, age, aim, H) {
    const w = WHEEL_W * t;
    A.rz("fl_paw", w).rz("fl_lo", w).rz("fr_paw", w).rz("fr_lo", w);
    A.rz("hl_paw", w).rz("hl_lo", w).rz("hr_paw", w).rz("hr_lo", w);
    // the rain light pulses red, softly (about twice a second); it faces back, so it shows when the
    // visitor turns the car round (the page's own view is from ahead of it)
    const b = 0.5 + 0.5 * Math.cos(TAU * 2.2 * t);
    A.glow("tail2", 0.75 * b * b);
    A.move("chest", 0, 0.0012 * Math.sin(t * 57) + 0.0008 * Math.sin(t * 31 + 1.3), 0);
  }
  // The exhaust: the tailpipe (x 5.15, y 0.575 on the centre line) sits under the rear wing, inside the
  // car's outline as the 2D air sees it (the air does not move there), so its hot gas is let into the
  // air where it comes out from behind the car (x 5.95), in tail2's frame. 1.3 x 0.8 = about the inflow's
  // speed: a small warm stream through the slower wake
  const PIPE = [(5.95 - 5.2) * K, (0.575 - 0.42) * K, 0];

  PM.defineMode({
    name: "f1", kind: "vehicle", yaw: 0.4, dwell: F1_D,
    parts: f1Parts,
    animate: f1Animate,
    exhaust: [{ part: "tail2", at: PIPE, dir: [1, 0.04, 0], power: 0.8, speed: 1.3, nozzle: 0.05 * K, heat: 0.5 }],
  });
})(typeof window !== "undefined" ? window : globalThis);

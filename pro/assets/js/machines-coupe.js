/* =====================================================================
   machines-coupe.js: the first car of the ProMachines cycle (machines.js
   loads first; this file only calls ProMachines.defineMode). Plain browser
   script; also loads in Node after machines.js.

     coupe  a Porsche-911-like sports coupe of the 992 generation, measured
            as the 992.1 Carrera S (2019-2024): length 4.519 m, width
            1.852 m (2.024 m with the mirrors), height 1.300 m, wheelbase
            2.450 m, tracks 1.589 / 1.557 m, 245/35 ZR20 front and 305/30
            ZR21 rear tyres (the base Carrera has the same body on 19 / 20
            inch wheels, 1.298 m high). The body is built from the traced
            side, plan, front and rear views of a dimensioned four-view
            drawing scaled to those figures (outline.json, metres) and
            checked against photos: the long roof falling in one line to
            the rear-engine deck, the narrow glass house on the wide body,
            the front fenders standing above the front lid with the round
            headlights in them, the wide rear haunches, the full-width rear
            light bar, the engine lid's slatted grille with the third brake
            light, the deployable rear spoiler, flush door handles, the door
            mirrors and five-double-spoke wheels. It drives on the moving
            floor: the wheels roll at the floor's speed, the spoiler rises
            as at speed, the headlights glow white a little and the light
            bar red, and a small hot exhaust leaves the two outlets.

   No brand marks: no crest, no name, lettering or numbers anywhere. The
   lamps, the louvres and the creases are there by their shapes only.

   Frame (shared): x = length, nose at -x (into the wind); y up; z toward
   the viewer ("L" parts on +z, the car's left side). Ground y = -1.3.
   The tables below are in metres as measured: x back from the front tip
   (0 .. 4.519), y up from the tyres' contact line, z to the car's left.
   The machine frame is the same scaled by K = 3.75 / 4.519 (0.830 units
   a metre) and moved so that the car is centred on x = 0 with its tyres
   on the ground line. Every shape is written in metres in the machine's
   orientation and handed to the rig with world: true.

   Role of each rig part:
     chest      the front lid with its two creases
     neck       the windscreen, the cowl and the A-pillars
     belly      the roof
     hips       the rear window and the engine lid with its grille and the
                third brake light
     head       the floor under the body
     jaw        the front bumper's face: the three intakes and the lip
     scapL/R    the front corners: the fender's nose with the round
                headlight and its four-point daytime light, the bumper's
                corner with the side intake
     maneL1/R1  the front fenders
     flankL/R   the doors with the flush handles
     maneL2/R2  the shoulder over the door and the rear quarter (the
                start of the haunch)
     maneL3/R3  the rear haunches
     back1/3    the glass house of each side: side glass, quarter window,
                the frames, the B-pillar line
     back2      the rear bumper's face
     haunchL/R  the rear corners with the ends of the light bar
     *_up       wheel-well liners and brake calipers (rear: and the sill)
     *_lo       rims: five double spokes, the hub
     *_paw      tyres
     tail1      the lower front bumper, the chin and the floor under the nose
     tail2      the rear bumper's lower part, the diffuser, the outlets
     tail3      the deployable rear spoiler and the light bar
     tail4      the door mirrors
   ===================================================================== */
(function (G) {
  "use strict";
  const PM = G.ProMachines;
  if (!PM || typeof PM.defineMode !== "function") return;
  const PI = Math.PI, TAU = 2 * Math.PI, GY = PM.GROUND != null ? PM.GROUND : -1.3;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ------------------------------------------------------------------
     Scale: metres -> machine units
     ------------------------------------------------------------------ */
  const LEN = 4.519, K = 3.75 / LEN, XC = LEN / 2;
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
  const zip = (xs, ys) => xs.map((x, i) => [x, ys[i]]);

  /* ------------------------------------------------------------------
     The measured outline (metres; outline.json, traced from the drawing
     and checked against the published figures and the photos)
     ------------------------------------------------------------------ */
  // side-view stations every 5 cm: the silhouette's top (front lid / fender crests, windscreen, roof, rear
  // window, engine lid), the body's underside (the arch lips in the wheel openings); plan half width without
  // the mirrors
  const SX = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1,
    1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2, 2.05, 2.1, 2.15, 2.2, 2.25, 2.3, 2.35,
    2.4, 2.45, 2.5, 2.55, 2.6, 2.65, 2.7, 2.75, 2.8, 2.85, 2.9, 2.95, 3, 3.05, 3.1, 3.15, 3.2, 3.25, 3.3, 3.35, 3.4, 3.45, 3.5, 3.55, 3.6,
    3.65, 3.7, 3.75, 3.8, 3.85, 3.9, 3.95, 4, 4.05, 4.1, 4.15, 4.2, 4.25, 4.3, 4.35, 4.4, 4.45, 4.5, 4.519];
  const S_TOP = [0.149, 0.491, 0.535, 0.567, 0.595, 0.619, 0.642, 0.664, 0.685, 0.706, 0.73, 0.766, 0.794, 0.811, 0.82, 0.826, 0.829,
    0.832, 0.834, 0.837, 0.842, 0.849, 0.857, 0.864, 0.872, 0.88, 0.885, 0.881, 0.891, 0.921, 0.951, 0.98, 1.008, 1.036, 1.063, 1.089,
    1.114, 1.139, 1.163, 1.186, 1.209, 1.231, 1.252, 1.266, 1.278, 1.286, 1.292, 1.296, 1.299, 1.3, 1.3, 1.299, 1.298, 1.295, 1.292, 1.287,
    1.282, 1.275, 1.267, 1.259, 1.249, 1.239, 1.228, 1.213, 1.202, 1.19, 1.177, 1.165, 1.152, 1.139, 1.125, 1.111, 1.097, 1.083, 1.068,
    1.054, 1.039, 1.024, 1.009, 0.993, 0.977, 0.96, 0.943, 0.925, 0.907, 0.89, 0.87, 0.85, 0.829, 0.743, 0.69, 0.473];
  const S_BOT = [0.148, 0.188, 0.188, 0.188, 0.188, 0.188, 0.184, 0.159, 0.136, 0.136, 0.136, 0.136, 0.136, 0.142, 0.528, 0.595, 0.639,
    0.671, 0.693, 0.707, 0.714, 0.714, 0.708, 0.695, 0.675, 0.646, 0.605, 0.545, 0.442, 0.134, 0.134, 0.135, 0.135, 0.135, 0.136, 0.136,
    0.136, 0.137, 0.137, 0.137, 0.138, 0.138, 0.138, 0.139, 0.139, 0.139, 0.14, 0.14, 0.14, 0.141, 0.141, 0.141, 0.142, 0.142, 0.143,
    0.143, 0.143, 0.144, 0.144, 0.144, 0.145, 0.145, 0.475, 0.577, 0.637, 0.679, 0.709, 0.731, 0.745, 0.752, 0.753, 0.748, 0.736, 0.717,
    0.689, 0.65, 0.595, 0.508, 0.185, 0.186, 0.19, 0.193, 0.196, 0.199, 0.202, 0.206, 0.21, 0.214, 0.222, 0.245, 0.456, 0.47];
  const S_HW = [0.048, 0.413, 0.524, 0.614, 0.689, 0.749, 0.793, 0.826, 0.849, 0.865, 0.872, 0.885, 0.896, 0.905, 0.912, 0.917, 0.921,
    0.923, 0.924, 0.925, 0.925, 0.925, 0.926, 0.925, 0.925, 0.924, 0.922, 0.919, 0.912, 0.903, 0.893, 0.887, 0.885, 0.884, 0.883, 0.883,
    0.882, 0.881, 0.881, 0.88, 0.879, 0.878, 0.878, 0.877, 0.877, 0.876, 0.876, 0.876, 0.876, 0.876, 0.876, 0.876, 0.877, 0.877, 0.878,
    0.879, 0.88, 0.882, 0.884, 0.889, 0.898, 0.91, 0.92, 0.924, 0.925, 0.925, 0.925, 0.925, 0.925, 0.925, 0.925, 0.925, 0.924, 0.923,
    0.922, 0.92, 0.917, 0.912, 0.902, 0.888, 0.872, 0.854, 0.834, 0.811, 0.785, 0.754, 0.716, 0.666, 0.595, 0.482, 0.273, 0.018];
  // wheels (Carrera S): centres from the drawing, tyres 245/35 ZR20 and 305/30 ZR21, the published tracks
  const XF = 1.0343, XR = 3.4843, WYF = 0.3399, WYR = 0.3595;
  const TRF = 0.3399, TRR = 0.3595, TWF = 0.245, TWR = 0.285;      // tyre radii and widths (rear: the tread inside the body)
  const TZF = 1.589 / 2, TZR = 1.557 / 2, RIMF = 0.2715, RIMR = 0.284;

  const TOP = curve(zip(SX, S_TOP)), BOT = curve(zip(SX, S_BOT)), HW = curve(zip(SX, S_HW));

  /* ------------------------------------------------------------------
     The body's sections. At every x the half section (the near side; the
     far side mirrors it) runs in four segments:
       0 side      from the underside (bot) up the near-vertical body side
                   to the shoulder (ysh), at the plan half width (hw)
       1 shoulder  rolls in from (hw, ysh) to the crest line (zb, yb): along
                   the front the fender's crest, along the cabin the side
                   glass's lower edge, along the tail the haunch's top
       2 inner     from the crest line to (zr, yr): the fender's inner side
                   down to the front lid's shut line, the side glass up to
                   the roof's edge, the haunch's top up to the deck's edge
       3 top       from (zr, yr) to the centre line (top): the front lid
                   (lower than the fenders), the windscreen, the roof, the
                   rear window, the engine lid
     Heights from the traced side view, widths from the plan, the glass
     house's lean from the front and rear views.
     ------------------------------------------------------------------ */
  const XCOWL = 1.37, XHDR = 2.07, XRW = 3.13, XRWE = 3.86;             // windscreen foot and header, rear window top and foot
  // the front lid's centre line (lower than the fender crests; the silhouette in front of the headlights)
  const LID = curve([[0, 0.149], [0.05, 0.491], [0.1, 0.535], [0.15, 0.567], [0.2, 0.595], [0.25, 0.619], [0.3, 0.642], [0.35, 0.664],
    [0.4, 0.684], [0.5, 0.718], [0.7, 0.77], [0.9, 0.806], [1.1, 0.836], [1.25, 0.856], [XCOWL, 0.871]]);
  // centre line top: the front lid, then the windscreen, roof, rear window and engine lid (the silhouette)
  const TOPC = (x) => (x < XCOWL ? Math.min(LID(x), TOP(x)) : x < 1.45 ? lerp(0.871, TOP(1.45), sstep(XCOWL, 1.45, x)) : TOP(x));
  // the crest line: the front fenders' crest (the silhouette from x 0.45), the side glass's lower edge (the
  // frame's outer edge), the haunch's top behind the quarter window
  const YB = curve([[0, 0.149], [0.05, 0.47], [0.1, 0.52], [0.2, 0.585], [0.3, 0.635], [0.4, 0.684], [0.45, 0.706], [0.5, 0.73],
    [0.55, 0.766], [0.6, 0.794], [0.65, 0.811], [0.7, 0.82], [0.8, 0.829], [0.9, 0.834], [1.0, 0.842], [1.1, 0.857], [1.2, 0.872],
    [1.3, 0.882], [1.4, 0.886], [1.55, 0.888], [1.7, 0.878], [2.04, 0.877], [2.28, 0.884], [2.52, 0.891], [2.76, 0.899], [3.0, 0.912],
    [3.24, 0.93], [3.38, 0.945], [3.5, 0.932], [3.61, 0.924], [3.77, 0.919], [3.93, 0.904], [4.09, 0.877], [4.24, 0.838], [4.35, 0.80],
    [4.42, 0.77], [4.5, 0.70], [4.519, 0.47]]);
  const ZBT = curve([[0, 0.03], [0.05, 0.33], [0.1, 0.45], [0.2, 0.57], [0.3, 0.64], [0.4, 0.69], [0.55, 0.725], [0.8, 0.771], [0.97, 0.787],
    [1.13, 0.796], [1.3, 0.80], [1.45, 0.80], [1.55, 0.795], [1.7, 0.765], [1.8, 0.745], [2.0, 0.742], [2.3, 0.740], [2.5, 0.735],
    [2.7, 0.726], [2.9, 0.713], [3.1, 0.698], [3.3, 0.68], [3.45, 0.675], [3.6, 0.668], [3.8, 0.655], [4.0, 0.635], [4.15, 0.61],
    [4.3, 0.57], [4.4, 0.50], [4.47, 0.40], [4.519, 0.02]]);
  // the inner line: the front lid's edge (its shut line with the fender), the A-pillar, the roof's edge
  // (drip rail), the rear window's and the engine lid's side edge
  const ZRT = curve([[0, 0.02], [0.05, 0.2], [0.113, 0.26], [0.136, 0.289], [0.362, 0.446], [0.65, 0.531], [0.942, 0.604], [1.238, 0.659],
    [XCOWL, 0.69], [1.45, 0.695], [1.6, 0.66], [1.8, 0.615], [1.95, 0.57], [2.07, 0.54], [2.15, 0.533], [2.4, 0.516], [2.7, 0.496],
    [3.0, 0.477], [3.1, 0.47], [3.2, 0.50], [3.3, 0.515], [3.6, 0.513], [3.9, 0.504], [4.1, 0.50], [4.25, 0.50], [4.4, 0.45],
    [4.47, 0.36], [4.519, 0.015]]);
  const YRT = curve([[0, 0.149], [0.05, 0.47], [0.1, 0.52], [0.2, 0.585], [0.3, 0.635], [0.4, 0.679], [0.5, 0.722], [0.6, 0.78],
    [0.765, 0.822], [1.045, 0.838], [1.345, 0.848], [XCOWL, 0.86], [1.45, 0.91], [1.57, 0.982], [1.675, 1.04], [1.782, 1.095],
    [1.889, 1.15], [1.998, 1.20], [2.07, 1.215], [2.18, 1.214], [2.33, 1.245], [2.5, 1.258], [2.65, 1.256], [2.8, 1.243], [2.97, 1.218],
    [3.1, 1.192], [3.27, 1.136], [3.48, 1.083], [3.69, 1.026], [3.9, 0.965], [4.12, 0.906], [4.33, 0.859], [4.42, 0.81], [4.5, 0.71],
    [4.519, 0.47]]);
  // the shoulder's foot: where the side starts to roll in (the widest line of the body)
  const YSH = curve([[0, 0.149], [0.05, 0.40], [0.15, 0.46], [0.3, 0.53], [0.5, 0.62], [0.7, 0.68], [0.9, 0.70], [1.4, 0.70],
    [2.0, 0.70], [2.8, 0.70], [3.1, 0.71], [3.6, 0.72], [4.2, 0.72], [4.4, 0.70], [4.5, 0.66], [4.519, 0.47]]);
  // the inner segment's bow: the side glass leans in more toward its top (the glass house's tumblehome)
  const PIN = (x) => 1 + 0.8 * sstep(1.75, 2.05, x) * (1 - sstep(3.2, 3.45, x));
  // the shoulder's roundness (superellipse exponent: 2 round, toward 1 a straight chamfer at the haunches)
  const NSH = (x) => lerp(2, 1.35, sstep(2.9, 3.4, x));
  const TUCK = 0.03;                     // the side tucks in this much at its lower edge
  const NROOF = 2.2;                     // the crown of the roof, windscreen and rear window across

  // the section tables (every 2.5 mm): bot, hw, ysh, zb, yb, zr, yr, top, inner bow, shoulder exponent
  const X0 = 0, X1 = LEN, NT = 1808, DXT = (X1 - X0) / NT, NC = 10, ST = new Float64Array((NT + 1) * NC);
  for (let i = 0; i <= NT; i++) {
    const x = X0 + i * DXT, o = i * NC, hw = HW(x), bot = BOT(x), top = TOPC(x);
    const zb = Math.min(ZBT(x), hw - 0.03), yb = Math.min(YB(x), Math.max(top, TOP(x)) - 0.002);
    const ysh = Math.max(bot + 0.02, Math.min(YSH(x), yb - 0.03));
    const zr = Math.min(ZRT(x), zb - 0.02), yr = YRT(x);
    ST[o] = bot; ST[o + 1] = hw; ST[o + 2] = ysh; ST[o + 3] = zb; ST[o + 4] = yb; ST[o + 5] = zr; ST[o + 6] = yr; ST[o + 7] = top;
    ST[o + 8] = PIN(x); ST[o + 9] = NSH(x);
  }
  const SC = new Float64Array(NC);
  function sec(x) {
    let f = (x - X0) / DXT;
    f = f < 0 ? 0 : f > NT - 1e-9 ? NT - 1e-9 : f;
    const i = f | 0, w = f - i, o = i * NC;
    for (let k = 0; k < NC; k++) SC[k] = ST[o + k] + (ST[o + NC + k] - ST[o + k]) * w;
    return SC;
  }
  const spow = (c, e) => (c < 0 ? -Math.pow(-c, e) : Math.pow(c, e));
  // the top segment's height at fraction s of the way out (0 = centre, 1 = the inner line): a crown where the
  // centre is the highest (roof, windscreen, rear deck), a gentle trough where the fenders stand above it (front lid)
  function topAt(top, yr, s) {
    if (top >= yr) return top - (top - yr) * Math.pow(s, NROOF);
    return top + (yr - top) * 0.5 * (1 - Math.cos(PI * s));
  }
  // a point of the near-side skin: segment k (0..3) at fraction v (0 = its lower / outer end)
  function skin(x, k, v, q) {
    const s = sec(x), bot = s[0], hw = s[1], ysh = s[2], zb = s[3], yb = s[4], zr = s[5], yr = s[6], top = s[7];
    q[0] = x;
    if (k === 0) {
      const y = bot + (ysh - bot) * v, t = 1 - Math.min(1, (y - bot) / 0.12);
      q[1] = y; q[2] = hw - TUCK * t * t;
    } else if (k === 1) {
      const th = v * PI / 2, e = 2 / s[9];
      q[1] = ysh + (yb - ysh) * spow(Math.sin(th), e); q[2] = zb + (hw - zb) * spow(Math.cos(th), e);
    } else if (k === 2) {
      q[1] = yb + (yr - yb) * v; q[2] = zb + (zr - zb) * Math.pow(v, s[8]);
    } else {
      const sz = 1 - v;
      q[1] = topAt(top, yr, sz); q[2] = zr * sz;
    }
    return q;
  }
  // the near-side skin at height y on the side or the shoulder (y between bot and yb)
  function skinY(x, y, q) {
    const s = sec(x), bot = s[0], hw = s[1], ysh = s[2], zb = s[3], yb = s[4];
    q[0] = x; q[1] = y;
    if (y <= ysh) { const t = 1 - Math.min(1, Math.max(0, (y - bot) / 0.12)); q[2] = hw - TUCK * t * t; }
    else {
      const e = 2 / s[9], r = Math.min(1, (y - ysh) / Math.max(1e-6, yb - ysh)), sn = Math.pow(r, 1 / e);
      q[2] = zb + (hw - zb) * Math.pow(Math.sqrt(Math.max(0, 1 - sn * sn)), e);
    }
    return q;
  }
  // any point of the near-side skin at (x, y): side, shoulder, glass house or (above the inner line) the top
  function surfY(x, y, q) {
    const s = sec(x), yb = s[4];
    if (y <= yb) return skinY(x, y, q);
    const zb = s[3], zr = s[5], yr = s[6], top = s[7];
    q[0] = x; q[1] = y;
    if (y <= yr && yr - yb > 1e-4) { const v = (y - yb) / (yr - yb); q[2] = zb + (zr - zb) * Math.pow(v, s[8]); }
    else { const r = Math.min(1, Math.max(0, (top - y) / Math.max(1e-6, top - Math.max(yr, yb)))); q[2] = (yr > yb ? zr : zb) * Math.pow(r, 1 / NROOF); }
    return q;
  }
  const fx = (f, x) => (typeof f === "function" ? f(x) : f);
  // the skin's half width at (x, y), or -1 above the top there
  const QS = [0, 0, 0];
  const zAt = (x, y) => { const s = sec(x); return y > Math.max(s[7], s[4]) || y < s[0] ? -1 : surfY(x, y, QS)[2]; };
  // the nose: the first x (from the front tip) where the skin at height y reaches half width z
  function noseAt(z, y, q) {
    let lo = 0, hi = 0.7;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (zAt(m, y) >= z) hi = m; else lo = m; }
    q[0] = hi; q[1] = y; q[2] = z;
    return q;
  }
  // the tail: the last x (toward the rear) where the skin at height y still reaches half width z
  function tailAt(z, y, q) {
    let lo = 3.9, hi = X1;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (zAt(m, y) >= z) lo = m; else hi = m; }
    q[0] = lo; q[1] = y; q[2] = z;
    return q;
  }

  /* ------------------------------------------------------------------
     Surface builders (metres, machine orientation; side 1 = near (+z),
     -1 = the far side). Patches are S.param grids; the sampler spreads
     points by area, so the grids only need to follow the curvature.
     ------------------------------------------------------------------ */
  function kit(S) {
    const Kt = {};
    const Q = [0, 0, 0];
    const P = (fn, gu, gv, o) => S.param(fn, Object.assign({ gu: Math.max(2, gu | 0), gv: Math.max(2, gv | 0) }, o || {}));
    // a band of segment k from x0 to x1, v from v0(x) to v1(x)
    Kt.band = (x0, x1, k, v0, v1, side, o) => {
      const gu = Math.max(3, Math.round((x1 - x0) * (k === 3 ? 24 : 30))), gv = k === 3 ? 12 : k === 2 ? 6 : k === 1 ? 6 : 10;
      return P((u, v, q) => {
        const x = x0 + (x1 - x0) * u, a = fx(v0, x), b = fx(v1, x);
        skin(x, k, a + (b - a) * v, q); q[2] *= side;
      }, gu, gv, Object.assign({ flip: side < 0 }, o));
    };
    // a band of the skin between heights ya(x) and yb(x) (side, shoulder, glass house or top)
    Kt.bandY = (x0, x1, ya, yb, side, o, gv) => {
      const gu = Math.max(3, Math.round((x1 - x0) * 30));
      return P((u, v, q) => {
        const x = x0 + (x1 - x0) * u, a = fx(ya, x), b = fx(yb, x);
        surfY(x, a + (b - a) * v, q); q[2] *= side;
      }, gu, gv || 8, Object.assign({ flip: side < 0 }, o));
    };
    // a region of the nose / the tail face given in the front / rear view: |z| from z0 to z1, y from ya(z)
    // to yb(z), lifted off the skin by d
    Kt.noseZY = (z0, z1, ya, yb, side, o, d) => P((u, v, q) => {
      const z = z0 + (z1 - z0) * u, a = fx(ya, z), b = fx(yb, z);
      noseAt(z, a + (b - a) * v, q); q[0] -= d || 0.003; q[2] *= side;
    }, Math.max(3, Math.round((z1 - z0) * 30)), 6, Object.assign({ flip: side < 0 }, o));
    Kt.rearZY = (z0, z1, ya, yb, side, o, d) => P((u, v, q) => {
      const z = z0 + (z1 - z0) * u, a = fx(ya, z), b = fx(yb, z);
      tailAt(z, a + (b - a) * v, q); q[0] += d || 0.003; q[2] *= side;
    }, Math.max(3, Math.round((z1 - z0) * 30)), 6, Object.assign({ flip: side > 0 }, o));
    // a thin tube along a polyline of 3D points (resampled every ~2 cm), radius r
    Kt.tube = (pts, r, o) => {
      const C = [pts[0].slice()];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / 0.02));
        for (let k = 1; k <= n; k++) C.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, a[2] + (b[2] - a[2]) * k / n]);
      }
      const M = C.length - 1;
      if (M < 1) return [];
      const T = C.map((_, k) => { const a = C[Math.max(0, k - 1)], b = C[Math.min(M, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L]; });
      const Nn = [], B = [];
      let nn = Math.abs(T[0][2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      for (let k = 0; k <= M; k++) {
        const t = T[k], d = nn[0] * t[0] + nn[1] * t[1] + nn[2] * t[2];
        let n = [nn[0] - t[0] * d, nn[1] - t[1] * d, nn[2] - t[2] * d];
        const L = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / L, n[1] / L, n[2] / L];
        Nn.push(n); B.push([t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]); nn = n;
      }
      return P((u, v, q) => {
        const f = v * M, k = Math.min(M - 1, f | 0), w = f - k, a = TAU * u, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        for (let j = 0; j < 3; j++) {
          const c = C[k][j] + (C[k + 1][j] - C[k][j]) * w;
          q[j] = c + ca * (Nn[k][j] + (Nn[k + 1][j] - Nn[k][j]) * w) + sa * (B[k][j] + (B[k + 1][j] - B[k][j]) * w);
        }
      }, 5, Math.max(2, Math.min(80, M)), o);
    };
    // a line drawn on the side of the body along side-view points [x, y] (lifted off the skin by r)
    Kt.sideLine = (xy, side, r, o) => Kt.tube(xy.map((p) => { surfY(p[0], p[1], Q); return [Q[0], Q[1], (Q[2] + r * 0.6) * side]; }), r, o);
    // a line on the nose along front-view points [z, y]; on the tail along rear-view points [z, y]
    Kt.noseLine = (zy, side, r, o) => Kt.tube(zy.map((p) => { noseAt(Math.abs(p[0]), p[1], Q); return [Q[0] - r * 0.6, Q[1], Q[2] * side]; }), r, o);
    Kt.rearLine = (zy, side, r, o) => Kt.tube(zy.map((p) => { tailAt(Math.abs(p[0]), p[1], Q); return [Q[0] + r * 0.6, Q[1], Q[2] * side]; }), r, o);
    // a line on the top segment (front lid, roof, decks) along plan points [x, z]
    Kt.topLine = (xz, side, r, o) => Kt.tube(xz.map((p) => {
      const s = sec(p[0]), zr = s[5], ss = Math.min(1, Math.abs(p[1]) / Math.max(0.01, zr));
      return [p[0], topAt(s[7], s[6], ss) + r * 0.6, p[1] * side];
    }), r, o);
    Kt.P = P;
    return Kt;
  }

  /* ------------------------------------------------------------------
     Panel lines and openings (metres, from the traced side, plan, front
     and rear views)
     ------------------------------------------------------------------ */
  const XLID = 0.11, XFB = 0.62, XD1 = 1.565, XD2 = 2.80, XQ = 3.45, XT = 4.30;    // lid front, bumper / fender, door, quarter, haunch / corner
  // the side glass (the opening's lower and upper edges) and the B-pillar line
  const DLOB = curve([[1.91, 0.981], [1.985, 0.93], [2.046, 0.89], [2.266, 0.897], [2.487, 0.904], [2.708, 0.911], [2.928, 0.921],
    [3.148, 0.935], [3.368, 0.959], [3.40, 0.985]]);
  const DLOT = curve([[1.91, 0.981], [1.985, 1.031], [2.08, 1.09], [2.18, 1.135], [2.29, 1.165], [2.395, 1.179], [2.505, 1.186],
    [2.616, 1.185], [2.725, 1.177], [2.835, 1.164], [2.943, 1.143], [3.051, 1.119], [3.157, 1.089], [3.263, 1.056], [3.33, 1.02], [3.40, 0.985]]);
  const XDLO0 = 1.91, XDLO1 = 3.40, XBP = 2.79;
  const SEC = (k) => (x) => sec(x)[k];
  const ybelt = SEC(4), yinner = SEC(6), yshd = SEC(2), ybot = SEC(0);
  const GLASS = { w: 0.2, heat: 0.04, glow: 0 }, BLACK = { w: 0.45, glow: 0 };
  const mx = (a, b) => (x) => Math.max(fx(a, x), fx(b, x));
  const mn = (a, b) => (x) => Math.min(fx(a, x), fx(b, x));
  // the arches: the flare's edge round each wheel opening (side view)
  const ARCHF = curve([[0.62, 0.45], [0.66, 0.56], [0.705, 0.607], [0.763, 0.663], [0.83, 0.707], [0.904, 0.738], [0.983, 0.754],
    [1.063, 0.755], [1.142, 0.742], [1.218, 0.713], [1.286, 0.671], [1.346, 0.618], [1.395, 0.554], [1.431, 0.482], [1.453, 0.405],
    [1.462, 0.325], [1.462, 0.315]]);
  const ARCHR = curve([[3.038, 0.299], [3.041, 0.41], [3.069, 0.516], [3.122, 0.613], [3.198, 0.693], [3.291, 0.753], [3.395, 0.788],
    [3.505, 0.796], [3.614, 0.777], [3.714, 0.731], [3.8, 0.662], [3.866, 0.573], [3.908, 0.471], [3.924, 0.362], [3.929, 0.282]]);
  // the floor line under the body (the side view's underside with the wheel openings bridged)
  const SILL = curve(SX.map((x, i) => [x, S_BOT[i]]).filter((p) => p[0] < 0.66 || (p[0] > 1.43 && p[0] < 3.08) || p[0] > 3.88));

  function coupeParts(S, H) {
    const Kt = kit(S), P = {};
    // a part from shapes written in metres (machine orientation), pivot given in metres
    const put = (name, at, shapes, extra) => {
      const m = toM(at);
      P[name] = Object.assign({ at: m, world: true, shape: S.place(S.place(S.join(shapes), OFF, null, K), [-m[0], -m[1], -m[2]]) }, extra || {});
    };
    // more shapes (metres) for a part already put
    const addTo = (name, shapes) => { const e = P[name]; e.shape = e.shape.concat(S.place(S.place(S.join(shapes), OFF, null, K), [-e.at[0], -e.at[1], -e.at[2]])); };
    const both = (f) => [f(1), f(-1)];

    // ---- the top: front lid (chest), windscreen and cowl (neck), roof (belly), rear window and engine lid (hips) ----
    put("chest", [0.75, 0.80, 0], [both((s) => Kt.band(XLID, XCOWL, 3, 0, 1, s))]);
    put("neck", [1.75, 1.05, 0], [
      both((s) => Kt.band(XCOWL, 1.45, 3, 0, 1, s)),                                   // the cowl under the windscreen's foot
      both((s) => Kt.band(1.45, XHDR, 3, 0, 1, s, GLASS)),
    ]);
    put("belly", [2.6, 1.28, 0], both((s) => Kt.band(XHDR, XRW, 3, 0, 1, s)));
    put("hips", [3.9, 1.0, 0], [
      both((s) => Kt.band(XRW, XRWE, 3, 0.1, 1, s, { w: 0.28, heat: 0.04, glow: 0 })), both((s) => Kt.band(XRW, XRWE, 3, 0, 0.1, s)),
      both((s) => Kt.band(XRWE, 4.42, 3, 0, 1, s)),
    ]);

    // ---- the glass house of each side (back1 near, back3 far): side glass, quarter window, the pillars ----
    const house = (s) => [
      Kt.bandY(XDLO0, XBP, ybelt, mx(ybelt, DLOT), s, GLASS),
      Kt.bandY(XBP, XDLO1, mx(ybelt, DLOB), mx(DLOB, DLOT), s, GLASS),
      Kt.bandY(XDLO1, XQ, ybelt, yinner, s),                                          // the C-pillar's foot
      Kt.bandY(XDLO0, XDLO1, mx(ybelt, DLOT), yinner, s),                             // the frame over the glass, up to the roof's edge
      Kt.bandY(1.45, XDLO0, ybelt, yinner, s),                                         // the A-pillar's side
    ];
    put("back1", [2.6, 1.05, 0.68], house(1));
    put("back3", [2.6, 1.05, -0.68], house(-1));

    // ---- the sides (L; the R parts mirror them) ----
    const YSK = 0.245, YCR = 0.48;                    // the sill's top (the door's lower edge), the rear bumper's crease
    put("maneL1", [1.0, 0.75, 0.88], [Kt.bandY(XFB, XD1, mx(ybot, (x) => (x > 1.43 ? YSK : 0)), yshd, 1), Kt.band(XFB, XD1, 1, 0, 1, 1),
      Kt.band(0.62, 1.45, 2, 0, 1, 1)]);
    put("flankL", [2.2, 0.55, 0.88], [Kt.bandY(XD1, XD2, YSK, yshd, 1), Kt.band(XD1, XD2, 1, 0, 1, 1)]);
    put("maneL2", [3.1, 0.6, 0.9], [Kt.bandY(XD2, XQ, mx(ybot, (x) => (x < 3.06 ? YSK : 0)), yshd, 1), Kt.band(XD2, XQ, 1, 0, 1, 1)]);
    put("maneL3", [3.9, 0.85, 0.85], [Kt.bandY(XQ, XT, mx(ybot, YCR), yshd, 1), Kt.band(XQ, XT, 1, 0, 1, 1), Kt.band(XQ, XT, 2, 0, 1, 1)]);
    put("haunchL", [4.42, 0.75, 0.7], [Kt.bandY(XT, X1 - 0.001, 0.70, yshd, 1), Kt.band(XT, X1 - 0.001, 1, 0, 1, 1), Kt.band(XT, 4.42, 2, 0, 1, 1)]);
    put("scapL", [0.35, 0.6, 0.75], [Kt.bandY(0.15, XFB, mx(0.45, ybot), yshd, 1), Kt.band(0.15, XFB, 1, 0, 1, 1), Kt.band(XLID, 0.62, 2, 0, 1, 1)]);

    // ---- the nose: the front face (jaw), the tail: the rear face below the light bar (back2) ----
    put("jaw", [0.06, 0.4, 0], [both((s) => Kt.bandY(0.0005, 0.15, mx(0.30, ybot), yshd, s)), both((s) => Kt.band(0.0005, 0.15, 1, 0, 1, s)),
      both((s) => Kt.band(0.0005, XLID, 3, 0, 1, s)), both((s) => Kt.band(0.0005, XLID, 2, 0, 1, s))]);
    put("back2", [4.45, 0.55, 0], [both((s) => Kt.bandY(XT, X1 - 0.001, 0.45, 0.70, s)), both((s) => Kt.band(4.42, X1 - 0.001, 2, 0, 1, s)),
      both((s) => Kt.band(4.42, X1 - 0.001, 3, 0, 1, s))]);
    // the floor under the body (head): inside the wheels at the arches, faint (it is seldom seen)
    const FLOOR = { w: 0.12, glow: 0 };
    const floor = (x0, x1, zw) => Kt.P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, z = zw == null ? sec(x)[1] - TUCK : zw, zz = (2 * v - 1) * z, sl = SILL(x);
      q[0] = x; q[1] = sl; q[2] = zz;
    }, Math.round((x1 - x0) * 12) + 2, 8, FLOOR);
    put("head", [2.3, 0.14, 0], [floor(0.66, 1.43, 0.64), floor(1.43, 3.08, null), floor(3.08, 3.88, 0.60), floor(3.88, 4.40, null)]);
    // the lower front: the bumper's corners below the side intakes' top, the chin and the floor under the nose (tail1)
    put("tail1", [0.3, 0.3, 0], [both((s) => Kt.bandY(0.15, XFB, ybot, mx(0.45, ybot), s)), both((s) => Kt.bandY(0.0005, 0.15, ybot, mx(0.30, ybot), s)),
      floor(0.002, 0.66, null)]);
    // the lower rear: the bumper's lower face and corners, the diffuser (tail2)
    put("tail2", [4.4, 0.35, 0], [both((s) => Kt.bandY(XT, X1 - 0.001, ybot, 0.45, s)), both((s) => Kt.bandY(3.89, XT, ybot, YCR, s))]);

    // ---- the wheel wells: liners over the wheels and the brake calipers (front: fl_up); rear (hl_up): and the sill ----
    const liner = (x0, x1, zi) => Kt.P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, z = zi + (sec(x)[1] - TUCK - zi) * v; q[0] = x; q[1] = BOT(x) + 0.004; q[2] = z;
    }, 60, 3, { w: 0.6, glow: 0 });
    const caliper = (xc, yc, zc, r) => S.join(
      S.torus(r, 0.022, { at: [xc, yc, zc], arc: [0.35 * PI, 0.95 * PI] }),
      S.box(0.1, 0.07, 0.045, { at: [xc - r * 0.62, yc + r * 0.62, zc], rot: [0, 0, PI / 4] }));
    put("fl_up", [XF, 0.62, 0.8], [liner(0.645, 1.425, 0.60), caliper(XF, WYF, TZF - 0.06, 0.205)]);
    put("hl_up", [XR, 0.62, 0.8], [liner(3.04, 3.89, 0.58), caliper(XR, WYR, TZR - 0.07, 0.215),
      Kt.bandY(1.43, 3.06, ybot, YSK, 1)]);

    // ---- wheels: 245/35 ZR20 and 305/30 ZR21 tyres (paw), five-double-spoke rims with the hub (lo) ----
    const SH = 0.03;
    const tyre = (xc, yc, tr, tw, tz, rim, wi) => {
      const zo = tz + tw / 2, zi = tz - tw / 2;
      return [
        S.cyl(tr, tw - 2 * SH, { axis: "z", at: [xc, yc, zi + SH], caps: false }),
        S.tag(S.torus(tr - SH, SH, { at: [xc, yc, zo - SH], tube: [0, PI / 2] }), { w: 0.8 }),
        S.tag(S.torus(tr - SH, SH, { at: [xc, yc, zi + SH], tube: [-PI / 2, 0] }), { w: 0.5 }),
        S.tag(S.disc(rim + 0.006, tr - SH, { at: [xc, yc, zo] }), { w: 0.6 }),
        S.tag(S.disc(rim + 0.006, tr - SH, { at: [xc, yc, zi], axis: "-z" }), { w: wi }),
      ];
    };
    const rimShape = (xc, yc, tz, tw, rim) => {
      const out = [], zo = tz + tw / 2, zf = zo - 0.035;
      out.push(S.tag(S.torus(rim, 0.009, { at: [xc, yc, zo - 0.012] }), { w: 2.0 }));                 // the rim's lip
      out.push(S.tag(S.cyl(rim - 0.012, 0.16, { axis: "z", at: [xc, yc, zf - 0.16], caps: false }), { w: 0.25 }));   // the barrel
      out.push(S.tag(S.disc(0.07, rim - 0.01, { at: [xc, yc, zf - 0.11] }), { w: 0.35 }));             // the brake disc behind
      out.push(S.disc(0, 0.062, { at: [xc, yc, zf - 0.005] }), S.cyl(0.062, 0.03, { axis: "z", at: [xc, yc, zf - 0.035], caps: false }));
      // five double spokes from the hub to the lip, a little concave
      const r0 = 0.064, r1 = rim - 0.01;
      for (let k = 0; k < 10; k++) {
        const a0 = TAU * (k >> 1) / 5 + PI / 2 + (k & 1 ? 0.085 : -0.085);
        const half = (r) => 0.011 + 0.010 * (r - r0) / (r1 - r0);
        const ang = (r) => a0 + (k & 1 ? 1 : -1) * 0.07 * (r - r0) / (r1 - r0);
        const zs = (r) => zf - 0.004 + 0.022 * Math.pow((r - r0) / (r1 - r0), 1.5);
        out.push(Kt.P((u, v, q) => {
          const r = r0 + (r1 - r0) * v, a = ang(r), h = (2 * u - 1) * half(r);
          q[0] = xc + r * Math.cos(a) - h * Math.sin(a); q[1] = yc + r * Math.sin(a) + h * Math.cos(a); q[2] = zs(r);
        }, 3, 10, { w: 2.4 }));
        for (const sd of [-1, 1]) out.push(Kt.P((u, v, q) => {
          const r = r0 + (r1 - r0) * v, a = ang(r), h = sd * half(r);
          q[0] = xc + r * Math.cos(a) - h * Math.sin(a); q[1] = yc + r * Math.sin(a) + h * Math.cos(a); q[2] = zs(r) - 0.04 * u;
        }, 2, 10, { w: 0.5 }));
      }
      return out;
    };
    put("fl_paw", [XF, WYF, TZF], tyre(XF, WYF, TRF, TWF, TZF, RIMF, 0.3));
    put("hl_paw", [XR, WYR, TZR], tyre(XR, WYR, TRR, TWR, TZR, RIMR, 0.3));
    put("fl_lo", [XF, WYF, TZF], rimShape(XF, WYF, TZF, TWF, RIMF));
    put("hl_lo", [XR, WYR, TZR], rimShape(XR, WYR, TZR, TWR, RIMR));

    // ---- door mirrors (tail4): the head on an arm from the door, at the published 2.024 m across ----
    const mirror = (s) => [
      S.ellipsoid(0.115, 0.066, 0.098, { at: [1.94, 0.925, 0.912 * s], rot: [0, 0.12 * s, 0] }),
      S.box(0.10, 0.035, 0.07, { at: [1.86, 0.86, 0.84 * s], rot: [0.5 * s, 0.25 * s, 0] }),
    ];
    put("tail4", [1.92, 0.9, 0], both(mirror));

    // ---- the deployable rear spoiler (tail3): the deck's tail between the grille and the light bar, raised ----
    const SPX0 = 4.20, SPX1 = 4.42, SPZ = 0.67;
    const deckAt = (x, z) => { const s = sec(x); return topAt(s[7], s[6], Math.min(1, Math.abs(z) / Math.max(0.01, s[5]))); };
    const spoiler = (s) => [
      Kt.P((u, v, q) => { const x = SPX0 + (SPX1 - SPX0) * u, z = SPZ * (1 - v * v); q[0] = x; q[1] = deckAt(x, Math.min(z, 0.45)) + 0.012; q[2] = z * s; }, 8, 10, { flip: s < 0 }),
      Kt.P((u, v, q) => { const x = SPX0 + (SPX1 - SPX0) * u, z = SPZ * (1 - v * v); q[0] = x; q[1] = deckAt(x, Math.min(z, 0.45)) - 0.004; q[2] = z * s; }, 8, 10, { flip: s > 0, w: 0.5 }),
      Kt.P((u, v, q) => { const z = SPZ * u, y0 = deckAt(SPX1, Math.min(z, 0.45)); q[0] = SPX1; q[1] = y0 - 0.004 + 0.016 * v; q[2] = z * s; }, 12, 2, { w: 1.4 }),
    ];
    put("tail3", [SPX0, 0.92, 0], [both(spoiler)]);

    // ---- lamps: the round headlights with the four-point daytime lights, the light bar, the third brake light ----
    const HEAD = { heat: -0.22, glow: 1, w: 1.6 }, DRL = { heat: -0.3, glow: 1, w: 3.0 }, TAIL = { heat: 0.55, glow: 1, w: 1.8 };
    const ring = (zc, yc, rz, ry, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = TAU * i / n; o.push([zc + rz * Math.cos(a), yc + ry * Math.sin(a)]); } return o; };
    const HLZ = 0.70, HLY = 0.695;                                                  // headlight centre (front view)
    const lens = (rz, ry) => Kt.noseZY(HLZ - rz, HLZ + rz, (z) => HLY - ry * Math.sqrt(Math.max(0, 1 - ((z - HLZ) / rz) ** 2)),
      (z) => HLY + ry * Math.sqrt(Math.max(0, 1 - ((z - HLZ) / rz) ** 2)), 1, HEAD, 0.004);
    addTo("scapL", [
      lens(0.118, 0.108),
      Kt.noseLine(ring(HLZ, HLY, 0.131, 0.119, 40), 1, 0.007, { w: 2.0, heat: -0.1 }),        // the lamp's chrome ring
      Kt.noseLine(ring(HLZ, HLY, 0.088, 0.078, 30), 1, 0.005, { w: 1.6, heat: -0.15, glow: 0.6 }),
      // the four-point daytime light: four short bars round the lens's centre
      [0.25, 0.75, 1.25, 1.75].map((f) => { const a = PI * f; return Kt.noseLine([[HLZ + 0.045 * Math.cos(a - 0.22), HLY + 0.042 * Math.sin(a - 0.22)],
        [HLZ + 0.045 * Math.cos(a + 0.22), HLY + 0.042 * Math.sin(a + 0.22)]], 1, 0.008, DRL); }),
    ]);
    // the light bar: a thin red strip across the tail, under the spoiler (back2), the lamp units at its ends
    // wrapping round the corners and running forward along the haunches (haunchL)
    const LBT = curve([[0, 0.817], [0.306, 0.816], [0.461, 0.814], [0.616, 0.805], [0.771, 0.788], [0.924, 0.765]]);
    addTo("back2", [both((s) => Kt.rearZY(0, 0.46, (z) => LBT(z) - 0.03, LBT, s, TAIL, 0.004))]);
    const TLU = curve([[0.46, 0.79], [0.6, 0.80], [0.70, 0.79], [0.77, 0.785], [0.83, 0.775]]);
    const TLL = curve([[0.46, 0.742], [0.492, 0.717], [0.612, 0.71], [0.732, 0.704], [0.811, 0.705], [0.83, 0.74]]);
    const SLU = curve([[3.91, 0.764], [3.95, 0.786], [4.04, 0.792], [4.13, 0.798], [4.22, 0.804], [4.31, 0.811], [4.40, 0.817]]);
    const SLL = curve([[3.91, 0.764], [3.987, 0.719], [4.076, 0.704], [4.166, 0.705], [4.256, 0.708], [4.346, 0.712], [4.40, 0.735]]);
    addTo("haunchL", [Kt.rearZY(0.46, 0.83, TLL, TLU, 1, TAIL, 0.004), Kt.bandY(3.92, 4.40, SLL, SLU, 1, TAIL, 4)]);
    // the third brake light in the engine grille's middle
    addTo("hips", [Kt.topLine([[3.88, 0], [4.20, 0]], 1, 0.012, { heat: 0.5, glow: 1, w: 2.0 })]);

    // ---- the exhaust outlets: two oval tips in the rear bumper (tail2) ----
    const EXZ = 0.43, EXY = 0.345;
    addTo("tail2", [both((s) => Kt.rearLine(ring(EXZ, EXY, 0.075, 0.05, 28), s, 0.008, { w: 2.2, heat: 0.15 })),
      both((s) => Kt.rearLine(ring(EXZ, EXY, 0.058, 0.036, 24), s, 0.006, { w: 1.6, heat: 0.3 }))]);

    // ---- the far side mirrors the near side ----
    for (const n of ["maneL1", "maneL2", "maneL3", "flankL", "haunchL", "scapL"]) P[n.replace(/L(\d?)$/, "R$1")] = H.mirror(P[n]);
    for (const n of ["up", "lo", "paw"]) { P["fr_" + n] = H.mirror(P["fl_" + n]); P["hr_" + n] = H.mirror(P["hl_" + n]); }
    return P;
  }

  /* ------------------------------------------------------------------
     Motion: it drives on the moving floor. The floor moves with the wind
     (0.5 screen widths a second: about 3.65 machine units a second on a
     computer screen), so the wheels roll at that speed (they turn about
     their axles the SUV's way: + about z, the bottom moving with the
     floor). The spoiler rises as the car comes up to speed (it stays up:
     the rest pose has it raised); the body rides gently on its springs and
     settles before it changes; the headlights glow white a little, the
     light bar red.
     ------------------------------------------------------------------ */
  const DWELL = 4.5;
  const FLOOR_V = 3.65, SPINF = FLOOR_V / (TRF * K), SPINR = FLOOR_V / (TRR * K);
  // the spoiler's raised position (estimate: no figure is published): its trailing edge ~8 cm up and 3 cm
  // back, its leading edge ~4.5 cm up; the stowed one lies on the deck
  const SP_UP = 0.045 * K, SP_BACK = 0.02 * K, SP_TILT = Math.atan2(0.08 - 0.045, 0.22);
  const BODY = ["chest", "belly", "hips", "neck", "head", "jaw", "maneL1", "maneL2", "maneL3", "maneR1", "maneR2", "maneR3", "back1", "back2", "back3",
    "flankL", "flankR", "scapL", "scapR", "haunchL", "haunchR", "fl_up", "fr_up", "hl_up", "hr_up", "tail1", "tail2", "tail3", "tail4"];
  const BODY_IX = BODY.map((n) => PM.PARTS.indexOf(n));
  const PIV = toM([2.3, 0.5, 0]);
  function coupeAnimate(A, t, age, aim, H) {
    const wf = SPINF * t, wr = SPINR * t;
    A.rz("fl_paw", wf).rz("fr_paw", wf).rz("hl_paw", wr).rz("hr_paw", wr);
    A.rz("fl_lo", wf).rz("fr_lo", wf).rz("hl_lo", wr).rz("hr_lo", wr);
    // the spoiler: stowed when the car forms, up between 0.5 and 1.3 s
    const d = 1 - H.smooth(0.5, 1.3, age);
    if (d > 0) { A.rz("tail3", -SP_TILT * d); A.move("tail3", -SP_BACK * d, -SP_UP * d, 0); }
    // the body on its springs: a slow heave and a little pitch, faded in and out within the stay
    const e = H.env(age, 0.2, 0.9, DWELL - 1.0, DWELL - 0.4);
    if (e > 0) {
      const dy = e * 0.0035 * Math.sin(t * 7.3) * Math.sin(t * 1.3 + 0.4), th = e * 0.0018 * Math.sin(t * 5.1 + 1.1);
      for (let i = 0; i < BODY.length; i++) A.wr(BODY[i], 0, 0, 1, th);
      bodyShift(A, dy, th);
    }
    A.glow("scapL", 0.12).glow("scapR", 0.12);
    A.glow("haunchL", 0.3).glow("haunchR", 0.3).glow("back2", 0.12);
  }
  function bodyShift(A, dy, th) {
    // keep the turned parts together: each pivot moves as a point of the body turning about PIV
    const W = A.md.restW, c = Math.cos(th) - 1, s = Math.sin(th);
    for (let i = 0; i < BODY.length; i++) {
      const o = BODY_IX[i] * 12, px = W[o + 3] - PIV[0], py = W[o + 7] - PIV[1];
      A.move(BODY[i], c * px - s * py, s * px + c * py + dy, 0);
    }
  }

  // the outlets' centres in tail2's frame (its pivot at [4.4, 0.35, 0] m)
  const EXL = [(4.49 - 4.4) * K, (0.345 - 0.35) * K, 0.43 * K];
  PM.defineMode({
    name: "coupe", kind: "vehicle", yaw: 0.35, dwell: DWELL,
    parts: function (S, H) {
      const P = coupeParts(S, H);
      // the spoiler's rest pose is the raised one: turn the stowed shape up about its leading edge, lift it
      const e = P.tail3, c = Math.cos(SP_TILT), s = Math.sin(SP_TILT);
      e.shape = S.place(e.shape, [SP_BACK, SP_UP, 0], [c, -s, 0, s, c, 0, 0, 0, 1]);
      return P;
    },
    animate: coupeAnimate,
    // a small hot breath from the two outlets
    exhaust: [
      { part: "tail2", at: [EXL[0], EXL[1], EXL[2]], dir: [1, 0.03, 0], power: 0.35, speed: 1.0, nozzle: 0.06 * K, heat: 0.4 },
      { part: "tail2", at: [EXL[0], EXL[1], -EXL[2]], dir: [1, 0.03, 0], power: 0.35, speed: 1.0, nozzle: 0.06 * K, heat: 0.4 },
    ],
  });
})(typeof window !== "undefined" ? window : globalThis);

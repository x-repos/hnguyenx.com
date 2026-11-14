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
            the front lid high in the middle of a crowned nose, the round
            headlights set on the fenders' front slopes (a dark lens, the
            bezel, the four-point daytime light), the wide rear haunches, the
            full-width rear light bar, the engine lid's slatted grille with
            the third brake light, the deployable rear spoiler, flush door
            handles, the door mirrors, the dark intakes and diffuser, a cabin
            seen through the glass, and wheels with ten slim spokes in five
            pairs on dark tyres, red calipers behind. It drives on the moving
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

   Role of each rig part (the parts' areas follow the other machines'
   shares, so every part has about the same density of points):
     chest      the front lid with its shut lines and two creases (on the
                far side only its inner part: maneR1 takes the outer strip)
     neck       the windscreen, the cowl under it and the cowl's line
     belly      the roof, the frame over the near side glass, the A-pillars
                (the far side's roof edge, frame and pillar are maneR2's)
     hips       the rear window and the engine lid: its slatted grille with
                the third brake light, the deck under the spoiler
     head       the cabin: the rear seats' backs and the parcel shelf (they
                hide the tail lamps from the windows), the front seats'
                backs; the floor under the body, faint
     jaw        the front bumper's face: the central intake, the lid's edge
     scapL/R    the front corners: the round headlight with its four-point
                daytime light, the light over the side intake
     maneL1/R1  the front fenders with their crests and arch flares
     flankL/R   the doors: shut lines, the flush handle, the low crease
     maneL2/R2  the shoulder over the door and the rear quarter
     maneL3/R3  the rear haunches with the hip line and the arch flares
                (the far side's parts also take some of the far half of the
                top and the cabin: the rig gives them more points)
     back1/3    the glass house of each side: side glass, the frames, the
                B-pillar lines, the window sill (back1: the quarter window;
                the far one is maneR3's)
     back2      the rear face: the light bar's strip, the bumper and its
                creases
     haunchL/R  the rear corners with the light bar's lamp units, which
                run forward along the haunches
     *_up       wheel-well liners and the red brake calipers (rear: the sill)
     *_lo       the rims' ten spokes and the hub
     *_paw      the tyres, the rims' lip and barrel, the brake disc (rear:
                and the drive shaft)
     tail1      the lower front bumper: the side intakes and their slats
     tail2      the rear bumper's lower part, the diffuser, the two outlets
     tail3      the deployable rear spoiler (raised in the rest pose)
     tail4      the door mirrors, the windscreen's header line
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
  // window, engine lid), the body's underside (the arch lips in the wheel openings; at the nose the front
  // lip's blade, 0.138); plan half width without the mirrors
  const SX = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1,
    1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2, 2.05, 2.1, 2.15, 2.2, 2.25, 2.3, 2.35,
    2.4, 2.45, 2.5, 2.55, 2.6, 2.65, 2.7, 2.75, 2.8, 2.85, 2.9, 2.95, 3, 3.05, 3.1, 3.15, 3.2, 3.25, 3.3, 3.35, 3.4, 3.45, 3.5, 3.55, 3.6,
    3.65, 3.7, 3.75, 3.8, 3.85, 3.9, 3.95, 4, 4.05, 4.1, 4.15, 4.2, 4.25, 4.3, 4.35, 4.4, 4.45, 4.5, 4.519];
  const S_TOP = [0.149, 0.491, 0.535, 0.567, 0.595, 0.619, 0.642, 0.664, 0.685, 0.706, 0.73, 0.766, 0.794, 0.811, 0.82, 0.826, 0.829,
    0.832, 0.834, 0.837, 0.842, 0.849, 0.857, 0.864, 0.872, 0.88, 0.885, 0.881, 0.891, 0.921, 0.951, 0.98, 1.008, 1.036, 1.063, 1.089,
    1.114, 1.139, 1.163, 1.186, 1.209, 1.231, 1.252, 1.266, 1.278, 1.286, 1.292, 1.296, 1.299, 1.3, 1.3, 1.299, 1.298, 1.295, 1.292, 1.287,
    1.282, 1.275, 1.267, 1.259, 1.249, 1.239, 1.228, 1.213, 1.202, 1.19, 1.177, 1.165, 1.152, 1.139, 1.125, 1.111, 1.097, 1.083, 1.068,
    1.054, 1.039, 1.024, 1.009, 0.993, 0.977, 0.96, 0.943, 0.925, 0.907, 0.89, 0.87, 0.85, 0.829, 0.743, 0.69, 0.473];
  const S_BOT = [0.145, 0.138, 0.138, 0.138, 0.138, 0.138, 0.138, 0.138, 0.136, 0.136, 0.136, 0.136, 0.136, 0.142, 0.528, 0.595, 0.639,
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
  // (the centres 4 mm above the tyres' radii: the points' 3 mm scatter then keeps the tread on the floor, not in it)
  const TRF = 0.3399, TRR = 0.3595, TWF = 0.245, TWR = 0.305;      // tyre radii and section widths
  const XF = 1.0343, XR = 3.4843, WYF = TRF + 0.004, WYR = TRR + 0.004;
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
  const LID = curve([[0, 0.30], [0.01, 0.40], [0.025, 0.448], [0.05, 0.491], [0.1, 0.535], [0.15, 0.567], [0.2, 0.595], [0.25, 0.619], [0.3, 0.642], [0.35, 0.664],
    [0.4, 0.684], [0.5, 0.718], [0.7, 0.77], [0.9, 0.806], [1.1, 0.836], [1.25, 0.856], [XCOWL, 0.871]]);
  // centre line top: the front lid, then the windscreen, roof, rear window and engine lid (the silhouette)
  const TOPC = (x) => (x < XCOWL ? Math.min(LID(x), TOP(x)) : x < 1.45 ? lerp(0.871, TOP(1.45), sstep(XCOWL, 1.45, x)) : TOP(x));
  // the crest line: the nose's corner ahead of the headlights (the bumper's top, low: the nose is crowned,
  // the front lid high in the middle), then the headlight's inner upper edge (the silhouette from x 0.45 to
  // 0.76: the lamp sits on the fender's front slope, its top the fender's crest), the fenders' crest, the
  // side glass's lower edge (the frame's outer edge), the haunch's top behind the quarter window
  const YB = curve([[0, 0.30], [0.01, 0.39], [0.025, 0.43], [0.05, 0.47], [0.1, 0.515], [0.15, 0.538], [0.2, 0.552], [0.25, 0.561], [0.3, 0.571],
    [0.35, 0.586], [0.39, 0.607], [0.42, 0.645], [0.45, 0.683], [0.5, 0.731], [0.55, 0.766], [0.6, 0.794], [0.65, 0.811], [0.7, 0.82],
    [0.76, 0.827], [0.8, 0.829], [0.9, 0.834], [1.0, 0.842], [1.1, 0.857], [1.2, 0.872],
    [1.3, 0.882], [1.4, 0.886], [1.55, 0.888], [1.7, 0.878], [2.04, 0.877], [2.28, 0.884], [2.52, 0.891], [2.76, 0.899], [3.0, 0.912],
    [3.24, 0.93], [3.38, 0.945], [3.5, 0.932], [3.61, 0.924], [3.77, 0.919], [3.93, 0.904], [4.09, 0.877], [4.24, 0.838], [4.35, 0.80],
    [4.42, 0.77], [4.5, 0.70], [4.519, 0.47]]);
  const ZBT = curve([[0, 0.03], [0.05, 0.33], [0.1, 0.45], [0.15, 0.53], [0.2, 0.575], [0.25, 0.61], [0.3, 0.628], [0.35, 0.622], [0.4, 0.60],
    [0.45, 0.578], [0.5, 0.567], [0.55, 0.573], [0.6, 0.594], [0.65, 0.628], [0.7, 0.686], [0.75, 0.737], [0.8, 0.7715], [0.97, 0.787],
    [1.13, 0.796], [1.3, 0.80], [1.45, 0.80], [1.55, 0.795], [1.7, 0.765], [1.8, 0.745], [2.0, 0.742], [2.3, 0.740], [2.5, 0.735],
    [2.7, 0.726], [2.9, 0.713], [3.1, 0.698], [3.3, 0.68], [3.45, 0.675], [3.6, 0.668], [3.8, 0.655], [4.0, 0.635], [4.15, 0.61],
    [4.3, 0.57], [4.4, 0.50], [4.47, 0.40], [4.519, 0.02]]);
  // the inner line: the front lid's edge (its shut line with the fender), the A-pillar, the roof's edge
  // (drip rail), the rear window's and the engine lid's side edge
  const ZRT = curve([[0, 0.02], [0.05, 0.2], [0.113, 0.26], [0.136, 0.289], [0.362, 0.446], [0.65, 0.531], [0.942, 0.604], [1.238, 0.659],
    [XCOWL, 0.69], [1.45, 0.695], [1.6, 0.66], [1.8, 0.615], [1.95, 0.57], [2.07, 0.54], [2.15, 0.533], [2.4, 0.516], [2.7, 0.496],
    [3.0, 0.477], [3.1, 0.47], [3.2, 0.50], [3.3, 0.515], [3.6, 0.513], [3.9, 0.504], [4.1, 0.50], [4.25, 0.50], [4.4, 0.45],
    [4.47, 0.36], [4.519, 0.015]]);
  const YRT = curve([[0, 0.30], [0.01, 0.39], [0.025, 0.43], [0.05, 0.47], [0.1, 0.52], [0.2, 0.567], [0.25, 0.59], [0.3, 0.612], [0.35, 0.637],
    [0.4, 0.659], [0.45, 0.682], [0.5, 0.712], [0.6, 0.775], [0.765, 0.822], [1.045, 0.838], [1.345, 0.848], [XCOWL, 0.86], [1.45, 0.91], [1.57, 0.982], [1.675, 1.04], [1.782, 1.095],
    [1.889, 1.15], [1.998, 1.20], [2.07, 1.215], [2.18, 1.214], [2.33, 1.245], [2.5, 1.258], [2.65, 1.256], [2.8, 1.243], [2.97, 1.218],
    [3.1, 1.192], [3.27, 1.136], [3.48, 1.083], [3.69, 1.026], [3.9, 0.965], [4.12, 0.906], [4.33, 0.859], [4.42, 0.81], [4.5, 0.71],
    [4.519, 0.47]]);
  // the shoulder's foot: where the side starts to roll in (the widest line of the body)
  // (round the headlights the shoulder is the lamp's slope: from the crest down to the lamp's outer edge)
  const YSH = curve([[0, 0.25], [0.025, 0.35], [0.05, 0.40], [0.15, 0.455], [0.25, 0.475], [0.3, 0.49], [0.4, 0.53], [0.45, 0.55], [0.5, 0.585],
    [0.55, 0.62], [0.6, 0.655], [0.65, 0.675], [0.7, 0.685], [0.8, 0.693], [0.9, 0.70], [1.4, 0.70], [2.0, 0.70], [2.8, 0.70], [3.1, 0.71], [3.6, 0.72], [4.2, 0.72], [4.4, 0.70], [4.5, 0.66], [4.519, 0.47]]);
  // the inner segment's bow: the side glass leans in more toward its top (the glass house's tumblehome)
  const PIN = (x) => 1 + 0.8 * sstep(1.75, 2.05, x) * (1 - sstep(3.2, 3.45, x));
  // the shoulder's roundness (superellipse exponent: 2 round, toward 1 a straight chamfer: the headlights'
  // slope on the fenders' fronts, the haunches)
  const NSH = (x) => lerp(2, 1.15, sstep(0.22, 0.38, x) * (1 - sstep(0.70, 0.86, x))) + (1.35 - 2) * sstep(2.9, 3.4, x);
  const TUCK = 0.03;                     // the side tucks in this much at its lower edge
  const NROOF = 2.2;                     // the crown of the roof, windscreen and rear window across

  // the section tables (every 2.5 mm): bot, hw, ysh, zb, yb, zr, yr, top, inner bow, shoulder exponent
  const X0 = 0, X1 = LEN, NT = 1808, DXT = (X1 - X0) / NT, NC = 10, ST = new Float64Array((NT + 1) * NC);
  for (let i = 0; i <= NT; i++) {
    const x = X0 + i * DXT, o = i * NC, hw = HW(x), bot = BOT(x), top = TOPC(x);
    const zb = Math.max(0.55 * hw, Math.min(ZBT(x), hw - 0.03)), yb = Math.min(YB(x), Math.max(top, TOP(x)) - 0.002);   // (no fold at the tips)
    const ysh = Math.max(bot + 0.02, Math.min(YSH(x), yb - 0.03));
    const zr = Math.max(0.4 * zb, Math.min(ZRT(x), zb - 0.02)), yr = YRT(x);
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
  // the nose: the first x (from the front tip) where the skin at height y reaches half width z (where it never
  // does within the search, the point is pulled in onto the skin there instead of being left in the air)
  const NOSE_X = 0.9, TAIL_X = 3.9;
  function noseAt(z, y, q) {
    let lo = 0, hi = NOSE_X;
    for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (zAt(m, y) >= z) hi = m; else lo = m; }
    q[0] = hi; q[1] = y; q[2] = hi >= NOSE_X ? Math.min(z, Math.max(0, zAt(hi, y))) : z;
    return q;
  }
  // the tail: the last x (toward the rear) where the skin at height y still reaches half width z (likewise)
  function tailAt(z, y, q) {
    let lo = TAIL_X, hi = X1;
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (zAt(m, y) >= z) lo = m; else hi = m; }
    q[0] = lo; q[1] = y; q[2] = lo <= TAIL_X ? Math.min(z, Math.max(0, zAt(lo, y))) : z;
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
    // a band of segment k from x0 to x1, v from v0(x) to v1(x) (grid gu x gv, or one that follows the curvature)
    Kt.band = (x0, x1, k, v0, v1, side, o, gu0, gv0) => {
      const gu = gu0 || Math.max(3, Math.round((x1 - x0) * (k === 3 ? 24 : 30))), gv = gv0 || (k === 3 ? 12 : k === 2 ? 6 : k === 1 ? 6 : 10);
      return P((u, v, q) => {
        const x = x0 + (x1 - x0) * u, a = fx(v0, x), b = fx(v1, x);
        skin(x, k, a + (b - a) * v, q); q[2] *= side;
      }, gu, gv, Object.assign({ flip: side < 0 }, o));
    };
    // a band of the skin between heights ya(x) and yb(x) (side, shoulder, glass house or top); set in by d
    // (along the plan's inward normal: a recess)
    Kt.bandY = (x0, x1, ya, yb, side, o, gv, gu0, d) => {
      const gu = gu0 || Math.max(3, Math.round((x1 - x0) * 30));
      return P((u, v, q) => {
        const x = x0 + (x1 - x0) * u, a = fx(ya, x), b = fx(yb, x);
        surfY(x, a + (b - a) * v, q);
        if (d) { const sl = (sec(x + 0.002)[1] - sec(x - 0.002)[1]) / 0.004, L = Math.hypot(1, sl); q[0] += d * sl / L; q[2] -= d / L; }
        q[2] *= side;
      }, gu, gv || 8, Object.assign({ flip: side < 0 }, o));
    };
    // the nose's side band from ya to yb with the intakes cut out of the paint: the paint below and above each
    // opening, and the opening itself (dark, set 3 cm into the nose); the openings at half width z = hw(x)
    Kt.bandYcut = (x0, x1, ya, yb, side, o, gu) => {
      const cut = (k) => (x) => { const a = fx(ya, x), b = fx(yb, x), r = intakeY(sec(x)[1]); return r ? Math.min(b, Math.max(a, r[k])) : b; };
      return [Kt.bandY(x0, x1, ya, cut(0), side, o, 6, gu), Kt.bandY(x0, x1, cut(1), yb, side, o, 4, gu),
        Kt.bandY(x0, x1, cut(0), cut(1), side, INTAKE, 4, gu, 0.03)];
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
  const SPX0 = 4.20, SPX1 = 4.42, SPZ = 0.67;                                    // the spoiler: lies on the deck from x 4.20 to 4.42
  const XLID = 0.11, XFB = 0.62, XD1 = 1.565, XD2 = 2.80, XQ = 3.36, XT = 4.30;    // lid front, bumper / fender, door, quarter, haunch / corner
  // the side glass (the opening's lower and upper edges) and the B-pillar line
  const DLOB = curve([[1.91, 0.981], [1.985, 0.93], [2.046, 0.89], [2.266, 0.897], [2.487, 0.904], [2.708, 0.911], [2.928, 0.921],
    [3.148, 0.935], [3.368, 0.959], [3.40, 0.985]]);
  const DLOT = curve([[1.91, 0.981], [1.985, 1.031], [2.08, 1.09], [2.18, 1.135], [2.29, 1.165], [2.395, 1.179], [2.505, 1.186],
    [2.616, 1.185], [2.725, 1.177], [2.835, 1.164], [2.943, 1.143], [3.051, 1.119], [3.157, 1.089], [3.263, 1.056], [3.33, 1.02], [3.40, 0.985]]);
  const XDLO0 = 1.91, XDLO1 = 3.40, XBP = 2.79;
  const SEC = (k) => (x) => sec(x)[k];
  const ybelt = SEC(4), yinner = SEC(6), yshd = SEC(2), ybot = SEC(0);
  const GLASS = { w: 0.2, heat: 0.04, glow: 0 };
  const mx = (a, b) => (x) => Math.max(fx(a, x), fx(b, x));
  // the arches: the flare's edge round each wheel opening (side view)
  const ARCHF = curve([[0.62, 0.45], [0.66, 0.56], [0.705, 0.607], [0.763, 0.663], [0.83, 0.707], [0.904, 0.738], [0.983, 0.754],
    [1.063, 0.755], [1.142, 0.742], [1.218, 0.713], [1.286, 0.671], [1.346, 0.618], [1.395, 0.554], [1.431, 0.482], [1.453, 0.405],
    [1.462, 0.325], [1.462, 0.315]]);
  const ARCHR = curve([[3.038, 0.299], [3.041, 0.41], [3.069, 0.516], [3.122, 0.613], [3.198, 0.693], [3.291, 0.753], [3.395, 0.788],
    [3.505, 0.796], [3.614, 0.777], [3.714, 0.731], [3.8, 0.662], [3.866, 0.573], [3.908, 0.471], [3.924, 0.362], [3.929, 0.282]]);
  // the floor line under the body (the side view's underside with the wheel openings bridged)
  const SILL = curve(SX.map((x, i) => [x, S_BOT[i]]).filter((p) => p[0] < 0.66 || (p[0] > 1.43 && p[0] < 3.08) || p[0] > 3.88));
  // the nose's intakes in the front view (the traced outlines): the central one (|z| < 0.346, y 0.233 .. 0.383,
  // its ends rounded off over the last 1.2 cm) and the side ones; [lo, hi] at half width z, or null
  const pwl = (pts) => (z) => { let i = 1; while (i < pts.length - 1 && pts[i][0] < z) i++; const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * Math.min(1, Math.max(0, (z - a[0]) / (b[0] - a[0]))); };
  const INS_LO = pwl([[0.353, 0.382], [0.40, 0.30], [0.447, 0.215], [0.58, 0.217], [0.718, 0.22], [0.75, 0.32], [0.787, 0.423]]);
  const INS_HI = pwl([[0.353, 0.382], [0.40, 0.435], [0.528, 0.443], [0.66, 0.44], [0.787, 0.423]]);
  const INR = [0, 0];
  function intakeY(z) {
    if (z < 0.346) { const t = Math.sqrt(Math.max(0, 1 - Math.max(0, (z - 0.334) / 0.012) ** 2)); INR[0] = 0.308 - 0.075 * t; INR[1] = 0.308 + 0.075 * t; return INR; }
    if (z > 0.353 && z < 0.787) { INR[0] = INS_LO(z); INR[1] = INS_HI(z); return INR; }
    return null;
  }
  const INTAKE = { w: 0.3, glow: 0, heat: -0.2 };            // the openings: dark (sparse), set in
  // the headlight: a circle in the front view (the measured rings: centre z 0.70, y 0.695; the bezel 0.265
  // across, 0.242 tall) on the fender's front slope. Where the shoulder's skin falls inside it is the lens:
  // shoulder fractions va(x) .. vb(x) (the paint is cut away there); x from HLX0 to HLX1
  const HLZ = 0.70, HLY = 0.695, HRZ = 0.1325, HRY = 0.121, HLX0 = 0.35, HLX1 = 0.74;
  let LAMPV = null;
  function lampV() {
    if (LAMPV) return LAMPV;
    const q = [0, 0, 0], NX = Math.round((HLX1 - HLX0) / 0.005), A = new Float64Array(NX + 1), B = new Float64Array(NX + 1);
    for (let i = 0; i <= NX; i++) {
      const x = HLX0 + (HLX1 - HLX0) * i / NX;
      let a = -1, b = -1, best = 0, bd = 1e9;
      for (let k = 0; k <= 240; k++) {
        const v = k / 240; skin(x, 1, v, q);
        const d = ((q[2] - HLZ) / HRZ) ** 2 + ((q[1] - HLY) / HRY) ** 2;
        if (d < 1) { if (a < 0) a = v; b = v; }
        if (d < bd) { bd = d; best = v; }
      }
      A[i] = a < 0 ? best : a; B[i] = a < 0 ? best : b;
    }
    const at = (T) => (x) => { const f = Math.min(NX, Math.max(0, (x - HLX0) / (HLX1 - HLX0) * NX)), i = Math.min(NX - 1, f | 0), w = f - i; return T[i] + (T[i + 1] - T[i]) * w; };
    LAMPV = { va: at(A), vb: at(B) };
    return LAMPV;
  }

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
    // (the far side's parts hold more points than the near side's in the rig, so they take some of the far
    // half of the top: maneR1 the front lid's outer strip and the fender's inner side, maneR2 the roof's outer
    // strip, the frame over the side glass and the A-pillar's side, maneR3 the far half of the rear seats'
    // backs and the quarter window; see the end)
    put("chest", [0.75, 0.80, 0], [Kt.band(XLID, XCOWL, 3, 0, 1, 1), Kt.band(XLID, XCOWL, 3, 0.35, 1, -1), Kt.band(XLID, 0.62, 2, 0, 1, 1)]);
    put("neck", [1.75, 1.05, 0], [
      both((s) => Kt.band(XCOWL, 1.45, 3, 0, 1, s)),                                   // the cowl under the windscreen's foot
      both((s) => Kt.band(1.45, XHDR, 3, 0, 1, s, GLASS)),
    ]);
    put("belly", [2.6, 1.28, 0], [Kt.band(XHDR, XRW, 3, 0, 1, 1), Kt.band(XHDR, XRW, 3, 0.15, 1, -1),
      Kt.bandY(XDLO0, XDLO1, mx(ybelt, DLOT), yinner, 1),                              // the frame over the side glass, up to the roof's edge
      Kt.bandY(1.45, XDLO0, ybelt, yinner, 1)]);                                       // the A-pillar's side
    put("hips", [3.9, 1.0, 0], [
      both((s) => Kt.band(XRW, XRWE, 3, 0.1, 1, s, { w: 0.28, heat: 0.04, glow: 0 })), both((s) => Kt.band(XRW, XRWE, 3, 0, 0.1, s)),
      both((s) => Kt.band(XRWE, SPX0, 3, 0, 1, s, { w: 0.55 })),                         // the grille (black louvres)
      both((s) => Kt.band(SPX0, 4.42, 3, 0, 1, s)),                                    // the deck under the spoiler
    ]);

    // ---- the glass house of each side (back1 near, back3 far): side glass, quarter window, the pillars ----
    const SIDEGLASS = { w: 0.28, heat: 0.04, glow: 0 };
    const quarter = (s) => [Kt.bandY(XBP, XDLO1, mx(ybelt, DLOB), mx(DLOB, DLOT), s, SIDEGLASS),
      Kt.bandY(XDLO1, XQ, ybelt, yinner, s)];                                          // the quarter window, the C-pillar's foot
    const house = (s) => [
      Kt.bandY(XDLO0, XBP, ybelt, mx(ybelt, DLOT), s, SIDEGLASS),
      Kt.band(XD1, XD2, 1, 0.8, 1, s),                                                 // the window sill (the door's shoulder top)
    ];
    put("back1", [2.6, 1.05, 0.68], [house(1), quarter(1)]);
    put("back3", [2.6, 1.05, -0.68], house(-1));

    // ---- the sides (L; the R parts mirror them) ----
    const YSK = 0.245, YCR = 0.48;                    // the sill's top (the door's lower edge), the rear bumper's crease
    const LV = lampV();                                // the headlight's lens on the shoulder (the paint cut round it)
    put("maneL1", [1.0, 0.75, 0.88], [Kt.bandY(XFB, XD1, mx(ybot, (x) => (x > 1.43 ? YSK : 0)), yshd, 1),
      Kt.band(XFB, HLX1, 1, 0, LV.va, 1, null, 10, 6), Kt.band(XFB, HLX1, 1, LV.vb, 1, 1, null, 10, 3), Kt.band(HLX1, XD1, 1, 0, 1, 1),
      Kt.band(0.62, 1.45, 2, 0, 1, 1)]);
    put("flankL", [2.2, 0.55, 0.88], [Kt.bandY(XD1, XD2, YSK, yshd, 1)]);
    put("maneL2", [3.0, 0.7, 0.88], [Kt.bandY(XD2, XQ, mx(ybot, (x) => (x < 3.06 ? YSK : 0)), yshd, 1), Kt.band(XD2, XQ, 1, 0, 1, 1),
      Kt.band(XD1, XD2, 1, 0, 0.8, 1)]);
    const XH = 4.20;                                   // the haunch's top ends here; the rear corner (haunchL) takes over
    put("maneL3", [3.9, 0.85, 0.85], [Kt.bandY(XQ, XH, mx(ybot, YCR), yshd, 1), Kt.band(XQ, XH, 1, 0, 1, 1), Kt.band(XQ, XH, 2, 0, 1, 1)]);
    const DARK = { glow: 0 };
    const XE = 4.50, ZE = HW(XE) - TUCK;                // the tail's bands end at XE; the face behind it is drawn in the rear view
    put("haunchL", [4.42, 0.7, 0.7], S.tag(S.join(Kt.bandY(XH, XT, YCR, yshd, 1, null, 4), Kt.bandY(XT, XE, 0.45, yshd, 1), Kt.band(XH, XE, 1, 0, 1, 1),
      Kt.band(XH, 4.42, 2, 0, 1, 1)), DARK));
    put("scapL", [0.35, 0.6, 0.75], S.tag(S.join(Kt.bandY(0.15, XFB, mx(0.45, ybot), yshd, 1), Kt.band(0.15, HLX0, 1, 0, 1, 1),
      Kt.band(HLX0, XFB, 1, 0, LV.va, 1, null, 24, 6), Kt.band(HLX0, XFB, 1, LV.vb, 1, 1, null, 24, 3)), DARK));

    // ---- the nose: the front face (jaw), the tail: the rear face below the light bar (back2) ----
    const XN = 0.025, ZN = HW(XN) - TUCK;            // the face in front of XN, in the front view
    put("jaw", [0.06, 0.4, 0], [both((s) => Kt.bandYcut(XN, 0.15, mx(0.30, ybot), yshd, s, null, 16)), both((s) => Kt.band(XN, 0.15, 1, 0, 1, s)),
      both((s) => Kt.band(XN, XLID, 3, 0, 1, s)), both((s) => Kt.band(XN, XLID, 2, 0, 1, s)),
      both((s) => Kt.noseZY(0.004, ZN, 0.383, (z) => Math.min(sec(XN)[7], sec(XN)[4]) - 0.004, s, null, 0.001)),
      both((s) => Kt.noseZY(0.004, ZN, 0.30, 0.383, s, INTAKE, -0.03))]);                  // the central intake's upper half
    put("back2", [4.45, 0.55, 0], S.tag(S.join(both((s) => Kt.band(4.42, XE, 2, 0, 1, s)),
      both((s) => Kt.band(4.42, XE, 3, 0, 1, s)),
      both((s) => Kt.rearZY(0.004, ZE, 0.456, 0.684, s, null, 0.001))), DARK));          // the face behind XE (the bumper's top bulge)
    // the cabin (head): the rear seats' backs and the parcel shelf behind them up to the rear window's foot (they
    // close the view through the windows to the tail lamps and the far side, as a real cabin does), the front
    // seats' backs; and the floor under the body, faint (inside the wheels at the arches; it is seldom seen)
    const FLOOR = { w: 0.04, glow: 0 }, CABIN = { glow: 0, heat: -0.1 };
    const floor = (x0, x1, zw) => Kt.P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, z = zw == null ? sec(x)[1] - TUCK : zw, zz = (2 * v - 1) * z, sl = SILL(x);
      q[0] = x; q[1] = sl; q[2] = zz;
    }, Math.round((x1 - x0) * 12) + 2, 8, FLOOR);
    // a flat panel from the side-view points a (its lower / front edge) to b, half widths za (at a) and zb (at b);
    // across from fraction f0 to f1 of its width (-1 the far edge, 1 the near edge)
    const panel = (a, b, za, zb, w, f0, f1, gu, gv) => Kt.P((u, v, q) => {
      const hz = za + (zb - za) * v; q[0] = a[0] + (b[0] - a[0]) * v; q[1] = a[1] + (b[1] - a[1]) * v; q[2] = (f0 + (f1 - f0) * u) * hz;
    }, gu || 10, gv || 6, Object.assign({ w }, CABIN));
    const RSB = [[3.05, 0.30], [3.25, 0.88], 0.78, 0.64, 0.6];                          // the rear seats' backs
    const seat = (s) => Kt.P((u, v, q) => {                                          // a front seat's back (narrowing upward)
      const hw = 0.25 - 0.08 * v; q[0] = 2.50 + 0.18 * v; q[1] = 0.32 + 0.70 * v; q[2] = s * (0.37 + (2 * u - 1) * hw);
    }, 6, 8, Object.assign({ w: 0.25 }, CABIN));
    put("head", [2.3, 0.14, 0], [floor(0.002, 0.66, null), floor(0.66, 1.43, 0.64), floor(1.43, 3.08, null), floor(3.08, 3.88, 0.60),
      panel(...RSB, 0, 1, 6), panel([3.25, 0.88], [3.84, 0.97], 0.64, 0.50, 0.45, -1, 1), seat(1), seat(-1)]);
    // the lower front: the bumper's corners below the side intakes' top, the chin and the floor under the nose (tail1)
    put("tail1", [0.3, 0.3, 0], [both((s) => Kt.bandYcut(0.15, XFB, ybot, mx(0.45, ybot), s, null, 24)), both((s) => Kt.bandYcut(XN, 0.15, ybot, mx(0.30, ybot), s, null, 16)),
      both((s) => Kt.noseZY(0.004, ZN, 0.142, 0.233, s, null, 0.001)), both((s) => Kt.noseZY(0.004, ZN, 0.233, 0.30, s, INTAKE, -0.03)),
    ]);
    // the lower rear: the bumper's lower face and corners, the diffuser (tail2)
    // (the diffuser: a dark band across the tail's lower face up to 0.40 m, round the outlets)
    const DIFF = { w: 0.32, glow: 0, heat: -0.2 };
    put("tail2", [4.4, 0.35, 0], [both((s) => Kt.bandY(XT, XE, ybot, 0.40, s, DIFF)), both((s) => Kt.bandY(XT, XE, 0.40, 0.45, s, null, 3)), floor(3.88, 4.42, null),
      both((s) => Kt.rearZY(0.004, 0.33, 0.226, 0.40, s, DIFF, 0.001)), both((s) => Kt.rearZY(0.004, 0.33, 0.40, 0.456, s, null, 0.001))]);
    addTo("back2", S.tag(S.join(both((s) => Kt.bandY(3.89, XT, ybot, YCR, s))), { glow: 0 }));

    // ---- the wheel wells: liners over the wheels and the brake calipers (front: fl_up); rear (hl_up): and the sill ----
    // (the wheels, the wells and the lines drawn on the body face the wind with their fronts: a little cooler, so
    // only the nose's face and the lamps take the stagnation's red)
    const LINER = { w: 0.6, glow: 0, heat: -0.25 };
    const liner = (x0, x1, zi) => Kt.P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, z = zi + (sec(x)[1] - TUCK - zi) * v; q[0] = x; q[1] = BOT(x) + 0.004; q[2] = z;
    }, 60, 3, LINER);
    // the red calipers on the brake discs (front: behind the axle; rear: ahead of it), over arc a0 .. a1
    const CALIPER = { heat: 0.75, glow: 0 };
    const caliper = (xc, yc, zc, r, a0, a1) => S.tag(S.join(
      S.torus(r, 0.022, { at: [xc, yc, zc], arc: [a0, a1] }),
      S.box(0.1, 0.07, 0.045, { at: [xc + r * 0.88 * Math.cos((a0 + a1) / 2), yc + r * 0.88 * Math.sin((a0 + a1) / 2), zc], rot: [0, 0, (a0 + a1) / 2 + PI / 2] })), CALIPER);
    put("fl_up", [XF, 0.62, 0.8], [liner(0.645, 1.425, 0.60), caliper(XF, WYF, TZF + TWF / 2 - 0.12, 0.19, -0.2 * PI, 0.25 * PI)]);
    put("hl_up", [XR, 0.62, 0.8], [liner(3.04, 3.89, 0.58), caliper(XR, WYR, TZR + TWR / 2 - 0.12, 0.19, 0.78 * PI, 1.2 * PI),
      Kt.bandY(1.43, 3.06, ybot, YSK, 1)]);

    // ---- wheels: 245/35 ZR20 and 305/30 ZR21 tyres (paw: the dark rubber, the rim's lip, its barrel and the
    // brake behind the spokes), the rims' spokes (lo): ten slim spokes in five pairs (the pairs 30 degrees
    // apart at the lip, 42 between the pairs, each spoke about 2.6 cm wide and 5 cm deep, turned a little as it
    // runs out) round the hub. The tyre's part has more points than its rubber should show, so the brake, the
    // rim's backing and (at the rear) the drive shaft take them: the rubber stays the darkest, the spokes and
    // the lip the brightest ----
    const SH = 0.03, TYRE = { heat: -0.25, glow: 0 };
    const tyre = (xc, yc, tr, tw, tz, rim, more) => {
      const zo = tz + tw / 2, zi = tz - tw / 2, rb = rim - 0.012;
      return S.tag([more || [],
        S.tag(S.cyl(tr, tw - 2 * SH, { axis: "z", at: [xc, yc, zi + SH], caps: false }), { w: 0.18 }),          // the tread (seen slanting: sparse)
        S.tag(S.torus(tr - SH, SH, { at: [xc, yc, zo - SH], tube: [0, PI / 2] }), { w: 0.32 }),
        S.tag(S.torus(tr - SH, SH, { at: [xc, yc, zi + SH], tube: [-PI / 2, 0] }), { w: 0.25 }),
        S.tag(S.disc(rim + 0.006, tr - SH, { at: [xc, yc, zo] }), { w: 0.38 }),                                  // the sidewall
        S.tag(S.disc(rim + 0.006, tr - SH, { at: [xc, yc, zi], axis: "-z" }), { w: 0.25 }),
        // the rim's lip: its face a bright ring round the spokes, its rolled edge; the barrel inside, dim
        S.tag(S.disc(rim - 0.014, rim + 0.004, { at: [xc, yc, zo - 0.006] }), { w: 3.0 }),
        S.tag(S.torus(rim + 0.004, 0.006, { at: [xc, yc, zo - 0.012], tube: [-PI / 2, PI / 2] }), { w: 1.2 }),
        S.tag(S.cyl(rb, 0.15, { axis: "z", at: [xc, yc, zo - 0.2], caps: false }), { w: 0.15 }),
        // the brake disc (350 mm), grey through the gaps between the spokes, its hat, and the backing round it
        S.tag(S.disc(0.085, 0.175, { at: [xc, yc, zo - 0.13] }), { w: 1.0 }),
        S.tag(S.cyl(0.085, 0.09, { axis: "z", at: [xc, yc, zo - 0.13], caps: false }), { w: 0.6 }),
        S.tag(S.disc(0.175, rb, { at: [xc, yc, zo - 0.2] }), { w: 0.5 }),
      ], TYRE);
    };
    const rimShape = (xc, yc, tz, tw, rim, sideW) => {
      const out = [], zo = tz + tw / 2, zf = zo - 0.035, RIMW = { heat: -0.25, glow: 0 };
      // the hub
      out.push(S.tag(S.disc(0, 0.062, { at: [xc, yc, zf - 0.005] }), { w: 2.2 }), S.tag(S.cyl(0.062, 0.03, { axis: "z", at: [xc, yc, zf - 0.035], caps: false }), { w: 0.8 }));
      // the spokes: pairs centred 72 degrees apart; at the hub each spoke is 0.30 rad off its pair's middle, at
      // the lip 0.265, and the pair turns back 0.08 rad from hub to lip; the face is dished (the hub sits deeper)
      const r0 = 0.068, r1 = rim - 0.012;
      for (let k = 0; k < 10; k++) {
        const ac = TAU * (k >> 1) / 5 + PI / 2, sg = k & 1 ? 1 : -1;
        const ang = (t) => ac + sg * (0.30 - 0.035 * t) - 0.08 * t;
        const half = (t) => 0.014 - 0.002 * t;
        const zs = (t) => zf - 0.004 + 0.022 * Math.pow(t, 1.5);
        out.push(Kt.P((u, v, q) => {
          const r = r0 + (r1 - r0) * v, a = ang(v), h = (2 * u - 1) * half(v);
          q[0] = xc + r * Math.cos(a) - h * Math.sin(a); q[1] = yc + r * Math.sin(a) + h * Math.cos(a); q[2] = zs(v);
        }, 3, 12, { w: 4.6 }));
        for (const sd of [-1, 1]) out.push(Kt.P((u, v, q) => {
          const r = r0 + (r1 - r0) * v, a = ang(v), h = sd * half(v);
          q[0] = xc + r * Math.cos(a) - h * Math.sin(a); q[1] = yc + r * Math.sin(a) + h * Math.cos(a); q[2] = zs(v) - 0.05 * u;
        }, 2, 12, { w: sideW }));
      }
      return S.tag(out, RIMW);
    };
    put("fl_paw", [XF, WYF, TZF], tyre(XF, WYF, TRF, TWF, TZF, RIMF));
    put("hl_paw", [XR, WYR, TZR], tyre(XR, WYR, TRR, TWR, TZR, RIMR, [S.tag(S.cyl(0.035, 0.5, { axis: "z", at: [XR, WYR, 0.13], caps: false }), { w: 1.5 })]));
    put("fl_lo", [XF, WYF, TZF], rimShape(XF, WYF, TZF, TWF, RIMF, 1.2));
    put("hl_lo", [XR, WYR, TZR], rimShape(XR, WYR, TZR, TWR, RIMR, 0.95));

    // ---- door mirrors (tail4): the head on an arm from the door, at the published 2.024 m across ----
    const mirror = (s) => [
      S.ellipsoid(0.115, 0.066, 0.098, { at: [1.94, 0.925, 0.912 * s], rot: [0, 0.12 * s, 0] }),
      S.box(0.10, 0.035, 0.07, { at: [1.86, 0.86, 0.84 * s], rot: [0.5 * s, 0.25 * s, 0] }),
    ];
    put("tail4", [1.92, 0.9, 0], both(mirror));

    // ---- the deployable rear spoiler (tail3): the deck's tail between the grille and the light bar, raised ----
    const spz = (x) => Math.min(SPZ, HW(x) - 0.07);            // its span (1.34 m) follows the tail's rounding in plan
    const deckAt = (x, z) => { const s = sec(x); return topAt(s[7], s[6], Math.min(1, Math.abs(z) / Math.max(0.01, s[5]))); };
    const spoiler = (s) => [
      Kt.P((u, v, q) => { const x = SPX0 + (SPX1 - SPX0) * u, z = spz(x) * (1 - v * v); q[0] = x; q[1] = deckAt(x, Math.min(z, 0.45)) + 0.012; q[2] = z * s; }, 8, 10, { flip: s < 0 }),
      Kt.P((u, v, q) => { const x = SPX0 + (SPX1 - SPX0) * u, z = spz(x) * (1 - v * v); q[0] = x; q[1] = deckAt(x, Math.min(z, 0.45)) - 0.004; q[2] = z * s; }, 8, 10, { flip: s > 0, w: 0.9 }),
      S.box(0.10, 0.07, 0.025, { at: [4.30, deckAt(4.30, 0.3) - 0.035, 0.3 * s] }),            // a strut (hidden in the deck when stowed)
      Kt.P((u, v, q) => { const z = spz(SPX1) * u, y0 = deckAt(SPX1, Math.min(z, 0.45)); q[0] = SPX1; q[1] = y0 - 0.004 + 0.016 * v; q[2] = z * s; }, 12, 2, { w: 1.4 }),
    ];
    put("tail3", [SPX0, 0.92, 0], [both(spoiler)]);

    // ---- lamps: the round headlights with the four-point daytime lights, the light bar, the third brake light ----
    const LENS = { w: 0.7, heat: -0.4, glow: 1 }, BEZEL = { w: 2.2, heat: -0.35, glow: 0.5 }, DRL = { heat: -0.35, glow: 1, w: 4.0 };
    const TAIL = { heat: 0.55, glow: 1, w: 1.8 }, TAILLIT = { heat: 0.55, glow: 1, w: 1.8 }, HOUSING = { heat: 0.45, glow: 0.3, w: 0.45 };
    const ring = (zc, yc, rz, ry, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = TAU * i / n; o.push([zc + rz * Math.cos(a), yc + ry * Math.sin(a)]); } return o; };
    addTo("scapL", [
      Kt.band(HLX0, HLX1, 1, LV.va, LV.vb, 1, LENS, 40, 10),                                  // the lens: dark glass, sparse
      Kt.noseLine(ring(HLZ, HLY, HRZ - 0.004, HRY - 0.004, 48), 1, 0.008, BEZEL),             // the bezel round it
      Kt.noseLine(ring(HLZ, HLY, 0.108, 0.098, 40), 1, 0.004, { w: 0.8, heat: -0.35, glow: 0.6 }),   // the thin inner ring
      // the four-point daytime light: four short bars on the diagonals (4 cm long, about halfway out), each
      // leaning a little toward the horizontal
      [1, 3, 5, 7].map((k) => { const a = PI * k / 4, sg = k === 1 || k === 5 ? 1 : -1;
        return Kt.noseLine([[HLZ + 0.057 * Math.cos(a + sg * 0.1), HLY + 0.052 * Math.sin(a + sg * 0.1)],
          [HLZ + 0.097 * Math.cos(a - sg * 0.02), HLY + 0.0885 * Math.sin(a - sg * 0.02)]], 1, 0.009, DRL); }),
    ]);
    addTo("scapL", [Kt.noseLine([[0.56, 0.432], [0.66, 0.437], [0.77, 0.428]], 1, 0.007, { heat: -0.25, glow: 1, w: 1.8 })]);   // the light over the side intake
    // the light bar: a thin red strip across the tail, under the spoiler (back2), the lamp units at its ends
    // wrapping round the corners and running forward along the haunches (haunchL)
    const LBT = curve([[0, 0.817], [0.306, 0.816], [0.461, 0.814], [0.616, 0.805], [0.771, 0.788], [0.924, 0.765]]);
    addTo("back2", [both((s) => Kt.rearZY(0.004, 0.46, (z) => LBT(z) - 0.022, LBT, s, TAILLIT, 0.004)),
      both((s) => Kt.rearLine([[0.004, 0.808], [0.306, 0.807], [0.461, 0.805], [0.616, 0.796], [0.771, 0.779], [0.86, 0.768]], s, 0.006, Object.assign({}, TAIL, { w: 1.5 })))]);
    const TLU = curve([[0.46, 0.79], [0.6, 0.80], [0.70, 0.79], [0.77, 0.785], [0.83, 0.775]]);
    const TLL = curve([[0.46, 0.742], [0.492, 0.717], [0.612, 0.71], [0.732, 0.704], [0.811, 0.705], [0.83, 0.74]]);
    const SLU = curve([[3.91, 0.764], [3.95, 0.786], [4.04, 0.792], [4.13, 0.798], [4.22, 0.804], [4.31, 0.811], [4.40, 0.817]]);
    const SLL = curve([[3.91, 0.764], [3.987, 0.719], [4.076, 0.704], [4.166, 0.705], [4.256, 0.708], [4.346, 0.712], [4.40, 0.735]]);
    // the lamp units: smoked housings (dark, a little red) with the bar's lit line along their tops
    addTo("haunchL", [Kt.rearZY(0.46, 0.83, TLL, (z) => TLU(z) - 0.024, 1, HOUSING, 0.004), Kt.rearZY(0.46, 0.83, (z) => TLU(z) - 0.024, TLU, 1, TAILLIT, 0.004),
      Kt.bandY(3.92, 4.40, SLL, (x) => SLU(x) - 0.022, 1, HOUSING, 4), Kt.bandY(3.92, 4.40, (x) => SLU(x) - 0.022, SLU, 1, TAILLIT, 3)]);
    // the third brake light in the engine grille's middle
    addTo("hips", [Kt.topLine([[3.88, 0], [4.20, 0]], 1, 0.012, { heat: 0.5, glow: 1, w: 2.0 })]);

    // ---- the exhaust outlets: two oval tips in the rear bumper (tail2) ----
    const EXZ = 0.43, EXY = 0.345;
    addTo("tail2", [both((s) => Kt.rearLine(ring(EXZ, EXY, 0.075, 0.05, 28), s, 0.008, { w: 2.2, heat: 0.15 })),
      both((s) => Kt.rearLine(ring(EXZ, EXY, 0.058, 0.036, 24), s, 0.006, { w: 1.6, heat: 0.3 }))]);

    // ---- lines: the frames round the side glass, shut lines, creases, the intakes' outlines (traced features) ----
    const along = (f, x0, x1, n, dy) => { const o = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; o.push([x, f(x) + (dy || 0)]); } return o; };
    // (heat -0.25: the lines' fronts face the wind; cooled, so they stay white and only the nose's face goes red)
    const FRAME = { w: 1.9, glow: 0, heat: -0.25 }, SEAM = { w: 1.4, glow: 0, heat: -0.25 }, CREASE = { w: 1.1, glow: 0, heat: -0.25 };
    // the side glass's opening and the frame's outer edge, the B-pillar's two lines
    const DLO = [[2.046, 0.89], [2.266, 0.897], [2.487, 0.904], [2.708, 0.911], [2.928, 0.921], [3.148, 0.935], [3.368, 0.959], [3.263, 1.056],
      [3.051, 1.119], [2.835, 1.164], [2.616, 1.185], [2.395, 1.179], [2.18, 1.135], [1.985, 1.031], [1.91, 0.981], [2.046, 0.89]];
    const FRO = [[2.039, 0.875], [2.279, 0.882], [2.519, 0.89], [2.759, 0.898], [2.999, 0.91], [3.238, 0.928], [3.414, 1.005], [3.193, 1.095],
      [2.961, 1.156], [2.724, 1.193], [2.484, 1.2], [2.246, 1.169], [2.027, 1.075], [1.827, 0.942], [1.72, 0.868]];
    const house2 = (s) => [Kt.sideLine(DLO, s, 0.006, FRAME), Kt.sideLine(FRO, s, 0.006, SEAM),
      Kt.sideLine([[2.759, 0.913], [2.797, 1.04], [2.835, 1.164]], s, 0.005, SEAM), Kt.sideLine([[2.741, 0.912], [2.78, 1.04], [2.819, 1.167]], s, 0.005, SEAM)];
    addTo("back1", house2(1)); addTo("back3", house2(-1));
    // the windscreen's edges (A-pillars) and its header, the cowl's line, the rear window's frame
    const edge3 = (x0, x1, n, dy) => { const o = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, sc = sec(x); o.push([x, sc[6] + (dy || 0), sc[5]]); } return o; };
    addTo("belly", [both((s) => Kt.tube(edge3(1.40, 2.10, 18, 0.004).map((p) => [p[0], p[1], p[2] * s]), 0.009, FRAME))]);
    addTo("tail4", [both((s) => Kt.topLine([[XHDR, 0], [XHDR, 0.3], [XHDR - 0.01, 0.45], [XHDR + 0.01, 0.53]], s, 0.007, FRAME))]);
    addTo("neck", [both((s) => Kt.topLine([[1.452, 0], [1.452, 0.4], [1.44, 0.6], [1.42, 0.69]], s, 0.006, SEAM))]);
    addTo("hips", [both((s) => Kt.topLine([[XRW + 0.02, 0], [XRW + 0.02, 0.36], [3.16, 0.46], [3.30, 0.475], [3.55, 0.48], [3.75, 0.47], [3.84, 0.40],
      [XRWE - 0.03, 0.2], [XRWE - 0.03, 0]], s, 0.006, FRAME))]);
    // the engine lid: its grille's slats either side of the brake light, the lid's shut line, the deck creases
    const slats = [];
    for (let k = 1; k <= 9; k++) { const z = 0.054 + k * 0.046; slats.push(Kt.topLine([[3.875 - 0.04 * (z / 0.5) ** 3, z], [4.19, z]], 1, 0.0055, { w: 1.5, glow: 0 })); }
    addTo("hips", [slats, S.mirror(slats), both((s) => Kt.topLine([[3.84, 0], [3.84, 0.49], [4.0, 0.505], [4.2, 0.50]], s, 0.006, SEAM))]);
    // the front lid: its shut lines along the fenders and over the bumper, its two creases
    const LIDO = [[0.113, 0], [0.13, 0.2], [0.136, 0.289], [0.25, 0.38], [0.362, 0.446], [0.5, 0.49], [0.65, 0.531], [0.8, 0.57], [0.942, 0.604],
      [1.1, 0.635], [1.238, 0.659], [1.35, 0.675]];
    addTo("chest", [both((s) => Kt.topLine(LIDO.map((p) => [p[0], p[1] - 0.004]), s, 0.006, SEAM)),
      both((s) => Kt.topLine([[1.232, 0.331], [1.054, 0.308], [0.874, 0.29], [0.695, 0.275], [0.515, 0.264], [0.335, 0.256], [0.175, 0.252]], s, 0.005, CREASE))]);
    // the fenders' crests (where they meet the lid, outboard of the shut line) and the arch flares' edges
    const crest3 = (x0, x1, n) => { const o = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, sc = sec(x); o.push([x, sc[4] + 0.005, sc[3]]); } return o; };
    addTo("maneL1", [Kt.tube(crest3(0.70, 1.55, 16), 0.006, CREASE),
      Kt.sideLine(along(ARCHF, 0.66, 1.462, 26), 1, 0.006, SEAM)]);
    addTo("maneL2", [Kt.sideLine(along(ARCHR, 3.04, 3.45, 10), 1, 0.006, SEAM)]);
    addTo("maneL3", [Kt.sideLine(along(ARCHR, 3.45, 3.929, 12), 1, 0.006, SEAM),
      // the haunch's hip line and the shoulder crease down to the rear arch
      Kt.sideLine([[3.22, 0.887], [3.369, 0.908], [3.529, 0.921], [3.689, 0.922], [3.85, 0.913], [4.009, 0.892], [4.167, 0.859], [4.244, 0.838]], 1, 0.005, CREASE),
      Kt.sideLine([[3.605, 0.735], [3.662, 0.759], [3.723, 0.769], [3.815, 0.776], [3.887, 0.782]], 1, 0.005, CREASE)]);
    // the door: its shut lines, the flush handle, the crease low on the door
    addTo("flankL", [Kt.sideLine([[1.585, 0.237], [1.571, 0.336], [1.561, 0.436], [1.556, 0.536], [1.556, 0.637], [1.569, 0.736], [1.615, 0.825], [1.658, 0.867]], 1, 0.005, SEAM),
      Kt.sideLine([[1.425, 0.233], [1.706, 0.241], [1.986, 0.249], [2.266, 0.262], [2.406, 0.271], [2.544, 0.295], [2.662, 0.369], [2.745, 0.481], [2.804, 0.608],
        [2.837, 0.744], [2.795, 0.875], [2.763, 0.913]], 1, 0.005, SEAM),
      Kt.sideLine([[2.607, 0.691], [2.649, 0.667], [2.699, 0.668], [2.747, 0.679], [2.772, 0.722], [2.732, 0.738], [2.682, 0.737], [2.632, 0.735], [2.582, 0.73],
        [2.546, 0.699], [2.607, 0.691]], 1, 0.005, { w: 1.6, glow: 0, heat: -0.25 }),
      Kt.sideLine([[1.623, 0.315], [1.884, 0.328], [2.184, 0.34], [2.485, 0.347], [2.686, 0.348], [2.885, 0.321], [2.981, 0.295]], 1, 0.005, CREASE)]);
    // the front bumper's lines on the side: its top over to the headlight, its side crease
    addTo("scapL", [Kt.sideLine([[0.448, 0.679], [0.392, 0.655], [0.337, 0.63], [0.282, 0.603], [0.228, 0.576], [0.174, 0.547], [0.145, 0.539]], 1, 0.005, SEAM),
      Kt.sideLine([[0.604, 0.285], [0.603, 0.345], [0.61, 0.406], [0.625, 0.465], [0.649, 0.521], [0.668, 0.556]], 1, 0.005, SEAM)]);
    // the nose: the side intakes' frames and slats, the central intake, the chin
    const IN_O = [[0.353, 0.382], [0.40, 0.30], [0.447, 0.215], [0.58, 0.217], [0.718, 0.22], [0.75, 0.32], [0.787, 0.423], [0.66, 0.44], [0.528, 0.443],
      [0.40, 0.435], [0.353, 0.382]];
    // (the openings themselves are cut out of the paint and set in, dark: see bandYcut)
    const INFRAME = { w: 1.2, glow: 0, heat: -0.25 }, SLAT = { w: 0.8, glow: 0, heat: -0.25 };
    addTo("tail1", [both((s) => Kt.noseLine(IN_O, s, 0.007, INFRAME)),
      both((s) => [0.26, 0.30, 0.345, 0.385].map((y) => Kt.noseLine([[0.39 + (y - 0.215) * 0.3, y], [0.76 - (0.443 - y) * 0.3, y]], s, 0.0045, SLAT)))]);
    addTo("jaw", [both((s) => Kt.noseLine([[0, 0.383], [0.346, 0.383], [0.346, 0.233], [0, 0.233]], s, 0.007, INFRAME)),
      both((s) => [0.27, 0.308, 0.346].map((y) => Kt.noseLine([[0, y], [0.336, y]], s, 0.0045, SLAT))),
      both((s) => Kt.noseLine([[0, 0.54], [0.193, 0.54], [0.31, 0.55], [0.382, 0.559]], s, 0.005, SEAM)),
      both((s) => Kt.noseLine([[0, 0.184], [0.268, 0.184], [0.543, 0.184], [0.70, 0.17]], s, 0.005, CREASE))]);
    // the tail: the bumper's crease, the diffuser's outline, the reflectors
    addTo("back2", [both((s) => Kt.rearLine([[0, 0.51], [0.283, 0.51], [0.573, 0.506], [0.718, 0.499], [0.80, 0.485]], s, 0.005, SEAM)),
      both((s) => Kt.rearLine([[0, 0.674], [0.278, 0.672], [0.568, 0.664], [0.712, 0.649], [0.80, 0.60]], s, 0.005, CREASE)),
      both((s) => Kt.rearLine([[0, 0.748], [0.256, 0.747], [0.516, 0.742], [0.646, 0.738]], s, 0.004, CREASE))]);
    addTo("tail2", [both((s) => Kt.rearLine([[0, 0.461], [0.306, 0.445], [0.616, 0.445], [0.80, 0.37], [0.608, 0.262], [0.301, 0.282], [0, 0.296]], s, 0.006, SEAM)),
      both((s) => Kt.rearLine([[0.599, 0.405], [0.689, 0.401], [0.78, 0.399], [0.84, 0.398]], s, 0.005, { w: 1.6, heat: 0.5, glow: 0.6 }))]);

    // ---- the far side mirrors the near side ----
    for (const n of ["maneL1", "maneL2", "maneL3", "flankL", "haunchL", "scapL"]) P[n.replace(/L(\d?)$/, "R$1")] = H.mirror(P[n]);
    // the far half of the top that the far side's parts take (see chest and belly)
    addTo("maneR1", [Kt.band(XLID, XCOWL, 3, 0, 0.35, -1), Kt.band(XLID, 0.62, 2, 0, 1, -1)]);
    addTo("maneR2", [Kt.band(XHDR, XRW, 3, 0, 0.15, -1), Kt.bandY(XDLO0, XDLO1, mx(ybelt, DLOT), yinner, -1), Kt.bandY(1.45, XDLO0, ybelt, yinner, -1)]);
    addTo("maneR3", [quarter(-1), panel(...RSB, -1, 0, 6)]);
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
    A.glow("scapL", 0.2).glow("scapR", 0.2);
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

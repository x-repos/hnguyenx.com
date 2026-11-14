/* =====================================================================
   machines-cars.js: the SUV of the ProMachines cycle (machines.js loads
   first; this file only calls ProMachines.defineMode). Plain browser
   script; also loads in Node after machines.js.

     suv  a Lexus-RX-450h-like hybrid crossover (fourth generation, AL20,
          2016-2019), built from its measured outline: the published
          dimensions (length 4.890 m, width 1.895 m, wheelbase 2.790 m,
          track 1.625 m, overhangs 1.080 / 1.020 m, 235/55 R20 tyres) and
          the traced side, plan and front views of a dimensioned
          four-view drawing that matches them (outline.json, metres). The
          body is lofted from its traced stations: the bonnet, the steep
          windscreen, the long roof with its rails and the roof spoiler
          over the raked rear glass, the glass house leaning in above the
          shoulder, the black arch and sill cladding, the spindle grille,
          the swept headlamps, the wrap-around tail lamps, the mirrors on
          the doors and twisted ten-spoke 20-inch wheels. It drives on the
          moving floor: the wheels roll at the floor's speed, the body
          rides gently on its springs, the headlamps glow white and the
          tail lamps red, and a faint breath leaves the rear outlets.

   No brand marks: no badge, no name or lettering anywhere. The grille,
   the lamps and the creases are there by their shapes only.

   Frame (shared): x = length, nose at -x (into the wind); y up; z toward
   the viewer ("L" parts on +z, the car's left side). Ground y = -1.3.
   The tables below are in metres as measured: x back from the front tip
   (0 .. 4.89), y up from the tyres' contact line, z to the car's left.
   The machine frame is the same scaled by K = 3.75 / 4.89 (0.767 units
   a metre) and moved so that the car is centred on x = 0 with its tyres
   on the ground line. Every shape is written in metres in the machine's
   orientation and handed to the rig with world: true.

   Role of each rig part:
     chest      bonnet (and the front fenders' tops)
     jaw        the spindle grille
     scapL/R    front bumper corners: headlamps, fog-lamp bezels
     neck       windscreen and cowl
     belly      roof
     head       the floor under the body (and the front air dam)
     hips       tailgate: rear glass, the hatch and its lip
     maneL1/R1  front fender sides
     maneL2/R2  front doors
     maneL3/R3  rear doors
     flankL/R   rear quarters with the black D-pillar glass
     back1/3    the glass house of each side: side glass and pillars
     back2      the rear bumper's face
     haunchL/R  rear bumper corners: the tail lamps
     *_up       arch cladding and wheel-well liners (the sill cladding
                rides with the rear ones)
     *_lo       rims: ten twisted spokes, hub, brake disc
     *_paw      tyres
     tail1      the lower front bumper and air dam
     tail2      rear diffuser and the chrome outlet trims
     tail3      roof rails and the roof spoiler
     tail4      door mirrors
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
  const LEN = 4.89, K = 3.75 / LEN, XC = LEN / 2;
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
     and checked against the published figures and the press photos)
     ------------------------------------------------------------------ */
  // side-view stations: top of the silhouette (roof rails on the roof, the spoiler at the back) and the
  // underside of the body (it follows the wheel-arch openings); plan half width without the mirrors
  const SX = [0, 0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25,
    1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2, 2.05, 2.1, 2.15, 2.2, 2.25, 2.3, 2.35, 2.4, 2.45, 2.5, 2.55, 2.6, 2.65, 2.7, 2.75,
    2.8, 2.85, 2.9, 2.95, 3, 3.05, 3.1, 3.15, 3.2, 3.25, 3.3, 3.35, 3.4, 3.45, 3.5, 3.55, 3.6, 3.65, 3.7, 3.75, 3.8, 3.85, 3.9, 3.95, 4, 4.05, 4.1, 4.15, 4.2, 4.25,
    4.3, 4.35, 4.4, 4.45, 4.5, 4.55, 4.6, 4.65, 4.7, 4.75, 4.8, 4.85, 4.865, 4.88];
  const S_TOP = [0.794, 0.808, 0.831, 0.866, 0.898, 0.947, 0.982, 1.007, 1.033, 1.057, 1.071, 1.085, 1.1, 1.109, 1.117, 1.126, 1.135, 1.14, 1.149, 1.158, 1.163, 1.172,
    1.178, 1.186, 1.184, 1.184, 1.189, 1.201, 1.23, 1.256, 1.285, 1.313, 1.339, 1.365, 1.394, 1.42, 1.443, 1.469, 1.492, 1.516, 1.539, 1.562, 1.585, 1.602, 1.614,
    1.622, 1.634, 1.643, 1.648, 1.654, 1.66, 1.666, 1.669, 1.671, 1.677, 1.677, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68, 1.68,
    1.68, 1.674, 1.671, 1.669, 1.663, 1.66, 1.654, 1.648, 1.645, 1.64, 1.634, 1.628, 1.622, 1.617, 1.611, 1.605, 1.599, 1.593, 1.588, 1.585, 1.449, 1.42, 1.391, 1.36,
    1.328, 1.296, 1.262, 1.236, 1.23, 1.169, 1.083, 0.742];
  const S_BOT = [0.354, 0.354, 0.333, 0.302, 0.299, 0.296, 0.279, 0.27, 0.264, 0.256, 0.25, 0.244, 0.244, 0.244, 0.24, 0.228, 0.632, 0.702, 0.751, 0.779, 0.794, 0.805,
    0.811, 0.817, 0.82, 0.82, 0.82, 0.814, 0.8, 0.768, 0.716, 0.635, 0.222, 0.234, 0.241, 0.244, 0.244, 0.244, 0.232, 0.221, 0.221, 0.221, 0.221, 0.244, 0.244, 0.244,
    0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.244, 0.238, 0.189, 0.186, 0.186, 0.186, 0.186, 0.186, 0.186, 0.186,
    0.186, 0.188, 0.188, 0.615, 0.693, 0.745, 0.777, 0.797, 0.805, 0.814, 0.817, 0.82, 0.823, 0.82, 0.811, 0.794, 0.759, 0.699, 0.603, 0.297, 0.303, 0.31, 0.319,
    0.325, 0.333, 0.339, 0.348, 0.354, 0.362, 0.377, 0.455, 0.466, 0.518];
  const S_HW = [0.114, 0.173, 0.353, 0.499, 0.598, 0.66, 0.698, 0.757, 0.825, 0.881, 0.896, 0.908, 0.916, 0.928, 0.934, 0.94, 0.946, 0.949, 0.952, 0.952, 0.952, 0.952,
    0.949, 0.949, 0.949, 0.949, 0.949, 0.949, 0.95, 0.95, 0.952, 0.952, 0.952, 0.949, 0.946, 0.943, 0.943, 0.943, 0.943, 0.943, 0.943, 0.943, 0.943, 0.943, 0.943,
    0.946, 0.946, 0.946, 0.946, 0.946, 0.949, 0.949, 0.949, 0.949, 0.949, 0.952, 0.952, 0.952, 0.952, 0.95, 0.949, 0.949, 0.949, 0.946, 0.946, 0.946, 0.944, 0.943,
    0.943, 0.943, 0.946, 0.949, 0.952, 0.952, 0.952, 0.952, 0.952, 0.952, 0.952, 0.952, 0.952, 0.949, 0.949, 0.949, 0.949, 0.949, 0.947, 0.946, 0.934, 0.925, 0.916,
    0.91, 0.9, 0.888, 0.875, 0.854, 0.822, 0.763, 0.68, 0.542, 0.424, 0.272];
  const XF = 1.078, XR = 3.870, WY = 0.382;          // axles (wheelbase 2.792), wheel centre height (the tyre on the ground)
  const TR = 0.382, TW = 0.245, RIM = 0.2715;        // 235/55 R20: tyre radius, width (with the bulge), rim flange radius
  const TZ = 0.8126;                                 // track 1.625: wheel centre planes at z = +-0.8126

  const TOP = curve(zip(SX, S_TOP)), BOT = curve(zip(SX, S_BOT)), HW = curve(zip(SX, S_HW));

  /* ------------------------------------------------------------------
     The body's sections. At every x the half section (the near side; the
     far side mirrors it) runs in four segments:
       0 side      from the underside (bot) up the near-vertical body side
                   to the shoulder (ysh), at the plan half width (hw)
       1 shoulder  rolls in from (hw, ysh) to the beltline (zb, yb): the
                   glass's lower edge (along the bonnet: the bonnet's edge)
       2 glass     the glass house leaning in from the beltline to the roof
                   edge (zr, yr) (none along the bonnet)
       3 top       from the roof edge to the centre line (top): the bonnet,
                   the windscreen, the roof, the rear glass
     All heights from the traced side view, the widths from the plan; the
     front view's tumblehome (beltline 0.82, roof edge 0.65-0.73) gives the
     glass house.
     ------------------------------------------------------------------ */
  // the roof rails stand 0.032 above the roof (side view top = rail tops from x 2.1 to 4.2)
  const RAILH = 0.032;
  const rail = (x) => sstep(2.02, 2.15, x) * (1 - sstep(4.12, 4.25, x));
  // centre line top: the bonnet, windscreen, roof (rails off), then down under the spoiler onto the rear glass
  const TOPC = curve(SX.filter((x) => x <= 4.25).map((x) => [x, TOP(x) - RAILH * rail(x)]).concat([
    [4.30, 1.556], [4.33, 1.530], [4.36, 1.482], [4.41, 1.44], [4.48, 1.40], [4.54, 1.36], [4.61, 1.32], [4.67, 1.28], [4.73, 1.245], [4.78, 1.232],
    [4.82, 1.218], [4.85, 1.169], [4.865, 1.083], [4.88, 0.742]]));
  // beltline height (the glass's lower edge; along the bonnet its side edge, the shut line)
  const YB = curve([[0, 0.70], [0.05, 0.78], [0.1, 0.835], [0.2, 0.90], [0.3, 0.945], [0.45, 0.98], [0.6, 1.0], [0.81, 1.02], [1.0, 1.04], [1.15, 1.07],
    [1.25, 1.11], [1.35, 1.15], [1.45, 1.178], [1.55, 1.19], [1.65, 1.172], [1.8, 1.155], [1.95, 1.16], [2.1, 1.172], [2.3, 1.182], [2.6, 1.19], [2.8, 1.198],
    [3.1, 1.21], [3.4, 1.226], [3.5, 1.24], [3.6, 1.272], [3.7, 1.297], [4.0, 1.29], [4.2, 1.28], [4.4, 1.262], [4.5, 1.245], [4.6, 1.225], [4.7, 1.20],
    [4.8, 1.17], [4.85, 1.12], [4.88, 0.70]]);
  // beltline half width (plan); along the bonnet the bonnet's edge
  const ZBT = curve([[0, 0.07], [0.05, 0.38], [0.1, 0.48], [0.2, 0.58], [0.3, 0.70], [0.4, 0.78], [0.6, 0.82], [0.8, 0.832], [1.2, 0.832], [1.55, 0.829],
    [1.6, 0.817], [1.9, 0.82], [2.2, 0.823], [2.7, 0.821], [3.0, 0.814], [3.35, 0.815], [3.5, 0.803], [3.65, 0.785], [3.9, 0.775], [4.2, 0.765], [4.4, 0.745],
    [4.55, 0.72], [4.7, 0.66], [4.8, 0.56], [4.85, 0.45], [4.88, 0.20]]);
  // roof edge half width (plan): the windscreen's side edge, the roof's edge, the rear glass's side edge
  const ZRT = curve([[1.2, 0.735], [1.4, 0.732], [1.6, 0.728], [1.8, 0.712], [2.0, 0.695], [2.2, 0.679], [2.4, 0.662], [2.6, 0.658], [2.8, 0.653],
    [3.0, 0.649], [3.2, 0.644], [3.4, 0.643], [3.6, 0.64], [3.8, 0.635], [4.0, 0.63], [4.2, 0.62], [4.35, 0.63], [4.5, 0.655], [4.65, 0.645], [4.75, 0.6],
    [4.8, 0.52], [4.85, 0.42], [4.88, 0.18]]);
  // how far the roof edge sits below the centre line (the crown of the windscreen, roof and rear glass)
  const DYR = curve([[1.2, 0.03], [2.0, 0.035], [2.2, 0.045], [4.2, 0.045], [4.4, 0.03], [4.9, 0.03]]);
  // the shoulder's depth (how far below the beltline the roll starts)
  const DSH = curve([[0, 0.05], [0.2, 0.09], [0.5, 0.12], [4.6, 0.12], [4.8, 0.10], [4.88, 0.05]]);
  // the floor line under the body (the side view's underside with the wheel arches bridged)
  const SILL = curve(SX.map((x, i) => [x, S_BOT[i]]).filter((p) => p[0] < 0.66 || (p[0] > 1.49 && p[0] < 3.46) || p[0] > 4.29));
  // top of the black cladding: round the arches (their traced outer edges) and along the sills
  const ARCHF = curve([[0.575, 0.30], [0.58, 0.55], [0.61, 0.58], [0.66, 0.67], [0.76, 0.75], [0.82, 0.83], [0.94, 0.86], [1.06, 0.87], [1.19, 0.87],
    [1.31, 0.86], [1.43, 0.78], [1.50, 0.66], [1.535, 0.56], [1.545, 0.36]]);
  const ARCHR = curve([[3.415, 0.36], [3.425, 0.42], [3.46, 0.52], [3.50, 0.63], [3.56, 0.72], [3.60, 0.82], [3.71, 0.86], [3.81, 0.88], [4.03, 0.88],
    [4.15, 0.84], [4.25, 0.74], [4.28, 0.60], [4.305, 0.42], [4.315, 0.33]]);
  const SILLC = curve([[1.545, 0.36], [1.65, 0.34], [2.0, 0.348], [2.6, 0.362], [3.1, 0.37], [3.3, 0.36], [3.415, 0.36]]);
  const CLAD = (x) => (x >= 0.575 && x <= 1.545 ? ARCHF(x) : x >= 3.415 && x <= 4.315 ? ARCHR(x) : x > 1.545 && x < 3.415 ? SILLC(x) : BOT(x) + 0.015);
  const TUCK = 0.025;                     // the side tucks in this much at its lower edge

  // the section tables (every 2.5 mm): bot, hw, ysh, zb, yb, zr, yr, top
  const X0 = 0, X1 = 4.88, NT = 1952, DXT = (X1 - X0) / NT, NC = 8, ST = new Float64Array((NT + 1) * NC);
  for (let i = 0; i <= NT; i++) {
    const x = X0 + i * DXT, o = i * NC, hw = HW(x), bot = BOT(x), top = TOPC(x);
    const zb = Math.min(ZBT(x), hw - 0.03), yb = Math.min(YB(x), top - 0.01);
    const ysh = Math.max(bot + 0.02, yb - Math.min(DSH(x), 0.6 * (yb - bot)));
    const g = sstep(1.18, 1.32, x);       // 0 along the bonnet: no glass house there
    const zr = Math.min(zb - 0.015, lerp(zb, ZRT(x), g)), yr = Math.max(yb, lerp(yb, top - DYR(x), g));
    ST[o] = bot; ST[o + 1] = hw; ST[o + 2] = ysh; ST[o + 3] = zb; ST[o + 4] = yb; ST[o + 5] = zr; ST[o + 6] = yr; ST[o + 7] = top;
  }
  const SC = new Float64Array(NC);
  function sec(x) {
    let f = (x - X0) / DXT;
    f = f < 0 ? 0 : f > NT - 1e-9 ? NT - 1e-9 : f;
    const i = f | 0, w = f - i, o = i * NC;
    for (let k = 0; k < NC; k++) SC[k] = ST[o + k] + (ST[o + NC + k] - ST[o + k]) * w;
    return SC;
  }
  const BOW = 0.012, NROOF = 2.2;
  // a point of the near-side skin: segment k (0..3) at fraction v (0 = its lower / outer end)
  function skin(x, k, v, q) {
    const s = sec(x), bot = s[0], hw = s[1], ysh = s[2], zb = s[3], yb = s[4], zr = s[5], yr = s[6], top = s[7];
    q[0] = x;
    if (k === 0) {
      const y = bot + (ysh - bot) * v, t = 1 - Math.min(1, (y - bot) / 0.12);
      q[1] = y; q[2] = hw - TUCK * t * t;
    } else if (k === 1) {
      const th = v * PI / 2;
      q[1] = ysh + (yb - ysh) * Math.sin(th); q[2] = zb + (hw - zb) * Math.cos(th);
    } else if (k === 2) {
      q[1] = yb + (yr - yb) * v; q[2] = zb + (zr - zb) * v + BOW * Math.sin(PI * v) * (yr - yb) / 0.4;
    } else {
      const sz = 1 - v;
      q[1] = top - (top - yr) * Math.pow(sz, NROOF); q[2] = zr * sz;
    }
    return q;
  }
  // the near-side skin at height y (on the side or the shoulder; y between bot and yb)
  function skinY(x, y, q) {
    const s = sec(x), bot = s[0], hw = s[1], ysh = s[2], zb = s[3], yb = s[4];
    q[0] = x; q[1] = y;
    if (y <= ysh) { const t = 1 - Math.min(1, Math.max(0, (y - bot) / 0.12)); q[2] = hw - TUCK * t * t; }
    else { const r = Math.min(1, (y - ysh) / Math.max(1e-6, yb - ysh)); q[2] = zb + (hw - zb) * Math.sqrt(1 - r * r); }
    return q;
  }
  // any point of the near-side skin at (x, y): side, shoulder, glass house or (above the roof edge) the top
  function surfY(x, y, q) {
    const s = sec(x), yb = s[4];
    if (y <= yb) return skinY(x, y, q);
    const zb = s[3], zr = s[5], yr = s[6], top = s[7];
    q[0] = x; q[1] = y;
    if (y <= yr && yr - yb > 1e-4) { const v = (y - yb) / (yr - yb); q[2] = zb + (zr - zb) * v + BOW * Math.sin(PI * v) * (yr - yb) / 0.4; }
    else { const r = Math.min(1, Math.max(0, (top - y) / Math.max(1e-6, top - yr))); q[2] = zr * Math.pow(r, 1 / NROOF); }
    return q;
  }
  const fx = (f, x) => (typeof f === "function" ? f(x) : f);
  // the skin's half width at (x, y), or -1 above the top there
  const QS = [0, 0, 0];
  const zAt = (x, y) => { const s = sec(x); return y > s[7] || y < s[0] ? -1 : surfY(x, y, QS)[2]; };
  // the nose: the first x (from the front tip) where the skin at height y reaches half width z
  function noseAt(z, y, q) {
    let lo = 0, hi = 0.9;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (zAt(m, y) >= z) hi = m; else lo = m; }
    q[0] = hi; q[1] = y; q[2] = z;
    return q;
  }
  // the plan outline's last x reaching half width z (the tail's corners)
  function xPlanTail(z) {
    let lo = 4.0, hi = X1;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (HW(m) >= z) lo = m; else hi = m; }
    return lo;
  }
  // the tail: the last x (toward the rear) where the skin at height y still reaches half width z
  function tailAt(z, y, q) {
    let lo = 4.0, hi = X1;
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
      const gu = Math.max(3, Math.round((x1 - x0) * (k === 3 ? 22 : 30))), gv = k === 3 ? 12 : k === 2 ? 6 : k === 1 ? 5 : 10;
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
    Kt.P = P;
    return Kt;
  }

  /* ------------------------------------------------------------------
     Panel lines and openings (metres, from the traced side, front and
     rear views)
     ------------------------------------------------------------------ */
  const XG = 0.11, XFB = 0.58, XD1 = 1.585, XD2 = 2.675, XD3 = 3.47, XQ = 4.32, XT = 4.72;   // grille, bumper corner, doors, quarter, rear face
  const XCOWL = 1.25, XHDR = 2.05, XRR = 4.33;                                                 // windscreen foot and header, rear glass top
  const YLB = 0.42, YRB = 0.72;                                                                // lower front bumper line, rear bumper top
  // the side glass: tops of the front and rear door glass, the black D-pillar glass's top
  const DLOF = curve([[1.62, 1.19], [1.70, 1.255], [1.78, 1.31], [1.87, 1.355], [1.96, 1.40], [2.05, 1.44], [2.14, 1.48], [2.24, 1.515], [2.33, 1.54],
    [2.42, 1.553], [2.51, 1.56], [2.58, 1.552], [2.635, 1.535]]);
  const DLOR = curve([[2.785, 1.58], [2.95, 1.582], [3.10, 1.58], [3.26, 1.57], [3.39, 1.55], [3.47, 1.48], [3.55, 1.40], [3.60, 1.275]]);
  const DTOP = curve([[3.39, 1.556], [3.45, 1.546], [3.53, 1.52], [3.62, 1.50], [3.70, 1.47], [3.79, 1.44], [3.87, 1.42], [3.96, 1.39], [4.05, 1.37],
    [4.14, 1.36], [4.22, 1.34], [4.31, 1.32], [4.40, 1.29], [4.47, 1.255]]);
  const SEC = (k) => (x) => sec(x)[k];
  const ybelt = SEC(4), yroof = SEC(6), yshd = SEC(2), ybot = SEC(0);
  const GLASS = { w: 0.18, heat: 0.04, glow: 0 }, BLACK = { w: 0.4, glow: 0 };

  function suvParts(S, H) {
    const Kt = kit(S), P = {};
    // a part from shapes written in metres (machine orientation), pivot given in metres
    const put = (name, at, shapes, extra) => {
      const m = toM(at);
      P[name] = Object.assign({ at: m, world: true, shape: S.place(S.place(S.join(shapes), OFF, null, K), [-m[0], -m[1], -m[2]]) }, extra || {});
    };
    const both = (f) => [f(1), f(-1)];
    const mx = (a, b) => (x) => Math.max(fx(a, x), fx(b, x));

    // ---- the top: bonnet (chest), windscreen (neck), roof (belly), rear glass and tailgate (hips) ----
    put("chest", [0.7, 1.08, 0], [both((s) => Kt.band(0, XCOWL, 3, 0, 1, s)), both((s) => Kt.band(0, XG, 1, 0, 1, s))]);
    put("neck", [1.65, 1.38, 0], [
      both((s) => Kt.band(XCOWL, XHDR, 3, 0.04, 1, s, GLASS)),
      both((s) => Kt.band(XCOWL, XHDR, 3, 0, 0.04, s)),
      // the cowl under the windscreen's foot
      both((s) => Kt.P((u, v, q) => { const z = 0.74 * u, x = XCOWL - 0.02 + 0.07 * v; skin(x, 3, 1 - z / Math.max(0.01, sec(x)[5]), q); q[1] += 0.004; q[2] = z * s; }, 16, 3, { flip: s < 0 })),
    ]);
    put("belly", [3.0, 1.64, 0], both((s) => Kt.band(XHDR, 3.95, 3, 0, 1, s)));
    put("hips", [4.7, 1.1, 0], [
      both((s) => Kt.band(XRR, X1, 3, 0.05, 1, s, GLASS)), both((s) => Kt.band(XRR, X1, 3, 0, 0.05, s)),
      both((s) => Kt.band(4.47, X1, 2, 0, 1, s)), both((s) => Kt.band(XT, X1, 1, 0, 1, s)),
      both((s) => Kt.bandY(XT, X1, YRB, yshd, s)),
      both((s) => Kt.band(3.95, XRR, 3, 0, 1, s)),                                    // the roof's end, under the spoiler
    ]);

    // ---- the glass house of each side (back1 near, back3 far): glass, pillars, the roof's side ----
    const house = (s) => [
      Kt.bandY(1.62, 2.635, ybelt, mx(ybelt, DLOF), s, GLASS),
      Kt.bandY(2.635, 2.785, ybelt, yroof, s, BLACK),                                 // B-pillar
      Kt.bandY(2.785, 3.60, ybelt, mx(ybelt, DLOR), s, GLASS),
      Kt.bandY(2.785, 3.39, mx(ybelt, DLOR), yroof, s),
      Kt.bandY(3.39, 3.60, mx(ybelt, DLOR), DTOP, s, BLACK), Kt.bandY(3.39, 3.60, DTOP, yroof, s),   // C-pillar
    ];
    put("back1", [2.4, 1.4, 0.75], [house(1), Kt.band(XD2, XD3, 1, 0, 1, 1)]);
    put("back3", [2.4, 1.4, -0.75], [house(-1), Kt.band(XD2, XD3, 1, 0, 1, -1)]);

    // ---- the sides (L; the R parts mirror them) ----
    put("maneL1", [1.0, 0.95, 0.94], [Kt.bandY(XFB, XD1, mx(CLAD, ybot), yshd, 1), Kt.band(XFB, XD1, 1, 0, 1, 1),
      Kt.bandY(XCOWL, 1.62, ybelt, yroof, 1), Kt.bandY(1.62, 2.635, mx(ybelt, DLOF), yroof, 1)]);   // with the A-pillar and the mirror sail
    put("flankL", [2.1, 0.75, 0.95], [Kt.bandY(XD1, XD2, mx(CLAD, ybot), yshd, 1), Kt.band(XD1, XD2, 1, 0, 1, 1)]);
    put("maneL2", [3.05, 0.75, 0.95], [Kt.bandY(XD2, XD3, mx(CLAD, ybot), yshd, 1)]);
    put("maneL3", [3.9, 1.1, 0.9], [
      Kt.bandY(XD3, XQ, mx(CLAD, ybot), yshd, 1), Kt.band(XD3, XQ, 1, 0, 1, 1),
      Kt.bandY(3.60, 4.47, ybelt, mx(ybelt, DTOP), 1, { w: 0.35, glow: 0 }), Kt.bandY(3.60, 4.47, mx(ybelt, DTOP), yroof, 1),
    ]);
    put("haunchL", [4.55, 0.95, 0.85], [Kt.bandY(XQ, XT, YRB, yshd, 1), Kt.band(XQ, XT, 1, 0, 1, 1)]);
    put("scapL", [0.3, 0.75, 0.75], [Kt.bandY(XG, XFB, mx(YLB, ybot), yshd, 1), Kt.band(XG, XFB, 1, 0, 1, 1)]);

    // ---- the nose: the spindle grille (jaw) ----
    put("jaw", [0.05, 0.65, 0], [
      both((s) => Kt.bandY(0, XG, mx(YLB, ybot), yshd, s)),
    ]);
    // ---- the tail: the rear bumper's face (back2) ----
    put("back2", [4.7, 0.6, 0], [both((s) => Kt.bandY(XT, X1, 0.60, YRB, s)), Kt.bandY(XQ, XT, mx(CLAD, ybot), YRB, 1), Kt.bandY(XQ, XT, mx(CLAD, ybot), YRB, -1)]);
    // the nose's very tip (the grille's centre) and the tail's last section, closed flat
    const cap = (x, ya, yb, sx) => both((s) => Kt.P((u, v, q) => {
      const sc = sec(x), y = ya + (yb - ya) * v; q[0] = x; q[1] = y; q[2] = u * zAt(x, Math.min(sc[7] - 1e-4, Math.max(sc[0] + 1e-4, y))) * s;
    }, 4, 6, { flip: (s * sx) > 0 }));
    P.jaw.shape = P.jaw.shape.concat(S.place(S.place(S.join(cap(0.0005, sec(0.0005)[0] + 0.001, sec(0.0005)[7] - 0.001, -1)), OFF, null, K), [-P.jaw.at[0], -P.jaw.at[1], -P.jaw.at[2]]));
    P.back2.shape = P.back2.shape.concat(S.place(S.place(S.join(cap(X1 - 0.0005, sec(X1 - 0.0005)[0] + 0.001, sec(X1 - 0.0005)[7] - 0.001, 1)), OFF, null, K), [-P.back2.at[0], -P.back2.at[1], -P.back2.at[2]]));

    // ---- the floor under the body (head): inside the wheels at the arches, faint (it is seldom seen) ----
    const FLOOR = { w: 0.15, glow: 0 };
    const floor = (x0, x1, zw) => Kt.P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, z = zw == null ? sec(x)[1] - TUCK : zw, zz = (2 * v - 1) * z, sl = SILL(x);
      q[0] = x; q[1] = sl + Math.max(0, 0.245 - sl) * sstep(z, z - 0.25, Math.abs(zz)); q[2] = zz;
    }, Math.round((x1 - x0) * 12) + 2, 8, FLOOR);
    put("head", [2.45, 0.24, 0], [floor(0.672, 1.488, 0.66), floor(1.488, 3.428, null), floor(3.428, 4.308, 0.66)]);
    // the lower front bumper and air dam with the floor under the nose (tail1)
    put("tail1", [0.25, 0.33, 0], [both((s) => Kt.bandY(0, XFB, ybot, mx(YLB, ybot), s)), floor(0.002, 0.672, null)]);

    // ---- arches: the black cladding round the openings and along the sills, the wheel-well liners and the
    // brake calipers (front: fl_up; rear: hl_up with the sill cladding) ----
    const liner = (x0, x1) => Kt.P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, z = 0.62 + (sec(x)[1] - TUCK - 0.62) * v; q[0] = x; q[1] = BOT(x); q[2] = z;
    }, 60, 3, { w: 0.6, glow: 0 });
    const caliper = (xc) => S.box(0.09, 0.13, 0.05, { at: [xc + 0.16, WY + 0.06, TZ - 0.05], rot: [0, 0, 0.35] });
    put("fl_up", [XF, 0.75, 0.9], [Kt.bandY(0.575, 1.545, ybot, mx(CLAD, ybot), 1), liner(0.668, 1.492), caliper(XF)]);
    put("hl_up", [XR, 0.75, 0.9], [Kt.bandY(3.415, 4.315, ybot, mx(CLAD, ybot), 1), liner(3.428, 4.302), caliper(XR),
      Kt.bandY(1.545, 3.415, ybot, mx(CLAD, ybot), 1)]);

    // ---- wheels: 235/55 R20 tyres (paw) and twisted ten-spoke rims with the brake discs (lo) ----
    const ZO = TZ + TW / 2, ZI = TZ - TW / 2, SH = 0.035;
    const disc = (xc) => S.tag(S.disc(0.07, 0.175, { at: [xc, WY, TZ - 0.035] }), { w: 0.45 });   // the brake disc behind the spokes
    const tyre = (xc, wi) => {
      const c = [xc, WY, 0];
      return [
        S.cyl(TR, TW - 2 * SH, { axis: "z", at: [xc, WY, ZI + SH], caps: false }),
        S.tag(S.torus(TR - SH, SH, { at: [xc, WY, ZO - SH], tube: [0, PI / 2] }), { w: 0.8 }), S.tag(S.torus(TR - SH, SH, { at: [xc, WY, ZI + SH], tube: [-PI / 2, 0] }), { w: 0.6 }),
        S.tag(S.disc(RIM + 0.006, TR - SH, { at: [xc, WY, ZO] }), { w: 0.25 }), S.tag(S.disc(RIM + 0.006, TR - SH, { at: [xc, WY, ZI], axis: "-z" }), { w: wi }),
      ];
    };
    const rimShape = (xc) => {
      const out = [], zf = ZO - 0.045;
      out.push(S.tag(S.torus(RIM, 0.009, { at: [xc, WY, ZO - 0.012] }), { w: 2.2 }));
      out.push(S.tag(S.cyl(RIM - 0.012, 0.16, { axis: "z", at: [xc, WY, zf - 0.16], caps: false }), { w: 0.3 }));
      out.push(S.disc(0, 0.068, { at: [xc, WY, zf - 0.02] }), S.cyl(0.068, 0.02, { axis: "z", at: [xc, WY, zf - 0.04], caps: false }));
      // ten twisted spokes in five pairs, rising from the recessed hub to the rim's lip
      const r0 = 0.07, r1 = RIM - 0.012;
      for (let k = 0; k < 10; k++) {
        const a0 = TAU * (k >> 1) / 5 + (k & 1 ? 0.13 : -0.13);
        const at = (r) => a0 + 0.42 * (r - r0) / (r1 - r0) * (k & 1 ? 1 : 0.85);
        const half = (r) => 0.012 + 0.014 * (r - r0) / (r1 - r0);
        const zs = (r) => zf - 0.02 + 0.028 * (r - r0) / (r1 - r0);
        out.push(Kt.P((u, v, q) => {
          const r = r0 + (r1 - r0) * v, a = at(r), h = (2 * u - 1) * half(r);
          q[0] = xc + r * Math.cos(a) - h * Math.sin(a); q[1] = WY + r * Math.sin(a) + h * Math.cos(a); q[2] = zs(r);
        }, 3, 10, { w: 2.6 }));
        for (const sd of [-1, 1]) out.push(Kt.P((u, v, q) => {
          const r = r0 + (r1 - r0) * v, a = at(r), h = sd * half(r);
          q[0] = xc + r * Math.cos(a) - h * Math.sin(a); q[1] = WY + r * Math.sin(a) + h * Math.cos(a); q[2] = zs(r) - 0.045 * u;
        }, 2, 10, { w: 0.6 }));
      }
      return out;
    };
    put("fl_paw", [XF, WY, TZ], tyre(XF, 0.3));
    put("hl_paw", [XR, WY, TZ], [tyre(XR, 0.5), disc(XR)]);
    put("fl_lo", [XF, WY, TZ], [rimShape(XF), disc(XF)]);
    put("hl_lo", [XR, WY, TZ], rimShape(XR));

    // ---- door mirrors (tail4): housing on a short stalk from the door, swept back ----
    const mirror = (s) => [
      S.ellipsoid(0.105, 0.078, 0.125, { at: [1.865, 1.235, 0.965 * s], rot: [0, 0.38 * s, 0] }),
      S.box(0.12, 0.05, 0.10, { at: [1.72, 1.175, 0.865 * s], rot: [0, 0.3 * s, 0] }),
    ];
    put("tail4", [1.85, 1.22, 0], both(mirror));

    // ---- roof rails and the roof spoiler (tail3) ----
    const RZ0 = 0.525, RZ1 = 0.575;
    const roofAt = (x, z) => { const s = sec(x), r = Math.min(1, Math.abs(z) / Math.max(0.01, s[5])); return s[7] - (s[7] - s[6]) * Math.pow(r, NROOF); };
    const railTop = (x) => lerp(roofAt(x, 0.55) + 0.012, TOP(x), sstep(2.04, 2.2, x) * (1 - sstep(4.0, 4.16, x)));
    const rails = (s) => [
      Kt.P((u, v, q) => { const x = 2.04 + 2.12 * u, z = RZ0 + (RZ1 - RZ0) * v; q[0] = x; q[1] = railTop(x); q[2] = z * s; }, 60, 2, { flip: s < 0 }),
      Kt.P((u, v, q) => { const x = 2.04 + 2.12 * u, y0 = roofAt(x, RZ1); q[0] = x; q[1] = y0 + (railTop(x) - y0) * v; q[2] = RZ1 * s; }, 60, 2, { flip: s < 0 }),
      Kt.P((u, v, q) => { const x = 2.04 + 2.12 * u, y0 = roofAt(x, RZ0); q[0] = x; q[1] = y0 + (railTop(x) - y0) * v; q[2] = RZ0 * s; }, 60, 2, { flip: s > 0 }),
    ];
    const spoiler = (s) => [
      Kt.P((u, v, q) => { const x = XRR + (4.395 - XRR) * u, z = 0.6 * (1 - v); q[0] = x; q[1] = TOP(Math.min(x, 4.35)) - 0.012 * v * v - 0.02 * u * u; q[2] = z * s; }, 6, 8, { flip: s < 0 }),
      Kt.P((u, v, q) => { const x = XRR + (4.395 - XRR) * u, z = 0.6 * (1 - v); q[0] = x; q[1] = 1.53 + 0.035 * u; q[2] = z * s; }, 6, 8, { flip: s > 0 }),
    ];
    put("tail3", [3.2, 1.62, 0], [both(rails), both(spoiler)]);

    // ---- the rear bumper's lower part with the chrome outlet trims in its corners (tail2) ----
    put("tail2", [4.85, 0.45, 0], [
      both((s) => Kt.bandY(XT, X1, ybot, 0.60, s)), floor(4.308, X1 - 0.002, null),
      both((s) => Kt.rearZY(0.46, 0.78, 0.415, 0.485, s, { w: 1.4, heat: 0.08 }, 0.008)),
    ]);

    // ---- lamps (glowing lenses on the skin) ----
    const chain = (pts) => curve(pts);
    // headlamp (front view [z, y], round the corner onto the fender top in the side view)
    const HLU = chain([[0.45, 0.792], [0.502, 0.839], [0.543, 0.908], [0.606, 0.934], [0.675, 0.948], [0.739, 0.962], [0.808, 0.978], [0.88, 1.004]]);
    const HLL = chain([[0.45, 0.792], [0.52, 0.801], [0.589, 0.811], [0.658, 0.820], [0.727, 0.830], [0.797, 0.839], [0.814, 0.869], [0.864, 0.914], [0.88, 0.97]]);
    const HEAD = { heat: -0.22, glow: 1, w: 2.6 }, TAIL = { heat: 0.5, glow: 1, w: 2.2 };
    P.scapL.shape = P.scapL.shape.concat(S.place(S.place(S.join(
      Kt.noseZY(0.45, 0.88, HLL, HLU, 1, HEAD, 0.006),
      // the fog-lamp bezel (an arrow head) and the headlamp's outline
      Kt.noseLine([[0.828, 0.716], [0.791, 0.703], [0.756, 0.689], [0.722, 0.671], [0.688, 0.650], [0.707, 0.630], [0.742, 0.610], [0.776, 0.591], [0.810, 0.582],
        [0.779, 0.605], [0.797, 0.620], [0.827, 0.631], [0.840, 0.660], [0.835, 0.694], [0.828, 0.716]], 1, 0.008, { w: 2.6 }),
      Kt.noseLine([[0.45, 0.792], [0.502, 0.839], [0.543, 0.908], [0.606, 0.934], [0.675, 0.948], [0.739, 0.962], [0.808, 0.978], [0.88, 1.004],
        [0.888, 0.983], [0.864, 0.914], [0.814, 0.869], [0.797, 0.839], [0.727, 0.830], [0.658, 0.820], [0.589, 0.811], [0.52, 0.801], [0.45, 0.792]], 1, 0.007, { w: 2.4, heat: -0.15 }),
    ), OFF, null, K), [-P.scapL.at[0], -P.scapL.at[1], -P.scapL.at[2]]));
    // tail lamps: the side part (side view [x, y]) and the rear part (rear view [z, y])
    const TLU = chain([[4.28, 1.16], [4.37, 1.17], [4.45, 1.18], [4.54, 1.19], [4.63, 1.18], [4.70, 1.165]]);
    const TLL = chain([[4.28, 1.16], [4.31, 1.12], [4.39, 1.09], [4.48, 1.06], [4.56, 1.02], [4.65, 0.99], [4.70, 0.99]]);
    const TRU = chain([[0.351, 1.078], [0.414, 1.100], [0.483, 1.115], [0.556, 1.130], [0.625, 1.147], [0.694, 1.165], [0.763, 1.181], [0.80, 1.17]]);
    const TRL = chain([[0.351, 1.078], [0.417, 1.012], [0.481, 0.989], [0.550, 0.989], [0.619, 0.989], [0.689, 0.989], [0.758, 0.989], [0.80, 1.01]]);
    P.haunchL.shape = P.haunchL.shape.concat(S.place(S.place(S.join(
      Kt.bandY(4.28, 4.70, TLL, TLU, 1, TAIL, 6), Kt.rearZY(0.351, 0.80, TRL, TRU, 1, TAIL, 0.006),
    ), OFF, null, K), [-P.haunchL.at[0], -P.haunchL.at[1], -P.haunchL.at[2]]));

    // ---- lines: the chrome round the side glass, door shut lines, creases, the grille's outline ----
    const addTo = (name, shapes) => { const e = P[name]; e.shape = e.shape.concat(S.place(S.place(S.join(shapes), OFF, null, K), [-e.at[0], -e.at[1], -e.at[2]])); };
    const along = (f, x0, x1, n, dy) => { const o = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; o.push([x, f(x) + (dy || 0)]); } return o; };
    const CHROME = { w: 2.6 }, SEAM = { w: 2.0, glow: 0 };
    // the upper chrome: along the front glass's top, over the B-pillar, the rear glass's top and the D-pillar glass
    const upper = along(DLOF, 1.62, 2.6, 14).concat([[2.70, 1.574]], along(DLOR, 2.785, 3.39, 8), along(DTOP, 3.45, 4.47, 12));
    addTo("back1", [Kt.sideLine(upper, 1, 0.007, CHROME), Kt.sideLine(along(ybelt, 1.60, 4.47, 40, 0.004), 1, 0.007, CHROME),
      Kt.sideLine([[2.635, 1.19], [2.65, 1.54]], 1, 0.005, SEAM), Kt.sideLine([[2.785, 1.20], [2.785, 1.575]], 1, 0.005, SEAM),
      Kt.sideLine([[3.51, 1.235], [3.51, 1.43]], 1, 0.008, SEAM)]);
    addTo("back3", [Kt.sideLine(upper, -1, 0.007, CHROME), Kt.sideLine(along(ybelt, 1.60, 4.47, 40, 0.004), -1, 0.007, CHROME),
      Kt.sideLine([[2.635, 1.19], [2.65, 1.54]], -1, 0.005, SEAM), Kt.sideLine([[2.785, 1.20], [2.785, 1.575]], -1, 0.005, SEAM),
      Kt.sideLine([[3.51, 1.235], [3.51, 1.43]], -1, 0.008, SEAM)]);
    addTo("flankL", [Kt.sideLine([[1.575, 1.16], [1.565, 0.95], [1.57, 0.70], [1.585, 0.45], [1.60, 0.36]], 1, 0.005, SEAM),
      Kt.sideLine([[1.66, 0.42], [1.75, 0.47], [1.85, 0.50], [2.04, 0.51], [2.33, 0.53], [2.62, 0.54]], 1, 0.005, SEAM),
      Kt.sideLine([[1.45, 0.36], [1.70, 0.37], [1.98, 0.39], [2.26, 0.41], [2.6, 0.435]], 1, 0.005, SEAM)]);
    addTo("maneL2", [Kt.sideLine([[2.69, 1.17], [2.67, 0.85], [2.67, 0.46], [2.68, 0.33]], 1, 0.005, SEAM),
      Kt.sideLine([[2.7, 0.548], [2.81, 0.56], [2.97, 0.56]], 1, 0.005, SEAM),
      Kt.sideLine([[2.7, 0.445], [2.82, 0.48], [2.95, 0.51], [3.09, 0.54], [3.23, 0.57], [3.38, 0.60]], 1, 0.005, SEAM),
      Kt.sideLine([[3.49, 1.22], [3.48, 1.0], [3.47, 0.86]], 1, 0.005, SEAM)]);
    addTo("maneL3", [Kt.sideLine([[4.20, 0.80], [4.27, 0.83], [4.34, 0.86], [4.39, 0.90], [4.45, 0.90], [4.52, 0.95], [4.57, 1.01]], 1, 0.005, SEAM)]);
    addTo("chest", both((s) => Kt.sideLine(along(ybelt, 0.81, 1.25, 10, 0.002), s, 0.005, SEAM)));
    // the shoulder's character line, from behind the headlamp to the tail lamp (where the side rolls in)
    const shoulder = (x0, x1) => Kt.sideLine(along((x) => sec(x)[2] + 0.012, x0, x1, Math.max(2, Math.round((x1 - x0) * 12))), 1, 0.006, SEAM);
    addTo("maneL1", [shoulder(0.80, XD1)]); addTo("flankL", [shoulder(XD1, XD2)]); addTo("maneL2", [shoulder(XD2, XD3)]); addTo("maneL3", [shoulder(XD3, 4.30)]);
    // the black cladding's upper edges round the arches and along the sills
    addTo("fl_up", [Kt.sideLine(along(ARCHF, 0.58, 1.54, 24), 1, 0.006, SEAM)]);
    addTo("hl_up", [Kt.sideLine(along(ARCHR, 3.425, 4.305, 24), 1, 0.006, SEAM), Kt.sideLine(along(SILLC, 1.55, 3.41, 20), 1, 0.006, SEAM)]);
    // the spindle grille's frame (front view, near half): wide top, the waist where the headlamps reach in,
    // flaring to the lower corners; slats across it
    const SPINDLE = [[0.0, 0.925], [0.50, 0.924], [0.53, 0.92], [0.465, 0.915], [0.43, 0.885], [0.375, 0.83], [0.337, 0.787], [0.362, 0.749], [0.409, 0.68],
      [0.454, 0.611], [0.48, 0.60], [0.515, 0.605], [0.54, 0.573], [0.583, 0.504], [0.618, 0.434], [0.56, 0.446], [0.533, 0.429], [0.505, 0.406], [0.47, 0.404], [0.0, 0.403]];
    const spw = curve([[0.403, 0.48], [0.434, 0.60], [0.504, 0.575], [0.573, 0.53], [0.611, 0.445], [0.68, 0.40], [0.749, 0.355], [0.787, 0.33], [0.83, 0.37], [0.885, 0.42], [0.915, 0.46]]);
    addTo("jaw", [both((s) => Kt.noseLine(SPINDLE, s, 0.011, { w: 2.6 })),
      both((s) => [0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.89].map((y) => Kt.noseLine([[0, y], [spw(y) * 0.5, y], [spw(y) - 0.02, y]], s, 0.0045, { w: 1.4 })))]);
    // the bonnet's front edge above the grille and along the headlamps' tops
    addTo("chest", both((s) => Kt.noseLine([[0, 0.94], [0.3, 0.94], [0.5, 0.938], [0.6, 0.952], [0.74, 0.975], [0.88, 1.016]], s, 0.006, SEAM)));

    // ---- the far side mirrors the near side ----
    for (const n of ["maneL1", "maneL2", "maneL3", "flankL", "haunchL", "scapL"]) P[n.replace(/L(\d?)$/, "R$1")] = H.mirror(P[n]);
    for (const n of ["up", "lo", "paw"]) { P["fr_" + n] = H.mirror(P["fl_" + n]); P["hr_" + n] = H.mirror(P["hl_" + n]); }
    return P;
  }

  /* ------------------------------------------------------------------
     Motion: it drives on the moving floor. The floor moves with the wind
     (0.5 screen widths a second: about 3.65 machine units a second on a
     computer screen), so the wheels roll at that speed (they turn about
     their axles the old cars' way: + about z, the bottom moving with the
     floor). The body rides gently on its springs and settles before it
     changes; the headlamps glow white a little, the tail lamps red.
     ------------------------------------------------------------------ */
  const DWELL = 4.5;
  const FLOOR_V = 3.65, SPIN = FLOOR_V / (TR * K);
  const BODY = ["chest", "belly", "hips", "neck", "head", "jaw", "maneL1", "maneL2", "maneL3", "maneR1", "maneR2", "maneR3", "back1", "back2", "back3",
    "flankL", "flankR", "scapL", "scapR", "haunchL", "haunchR", "fl_up", "fr_up", "hl_up", "hr_up", "tail1", "tail2", "tail3", "tail4"];
  const BODY_IX = BODY.map((n) => PM.PARTS.indexOf(n));
  const PIV = toM([2.45, 0.6, 0]);
  function suvAnimate(A, t, age, aim, H) {
    const w = SPIN * t;
    A.rz("fl_paw", w).rz("fr_paw", w).rz("hl_paw", w).rz("hr_paw", w);
    A.rz("fl_lo", w).rz("fr_lo", w).rz("hl_lo", w).rz("hr_lo", w);
    // the body on its springs: a slow heave and a little pitch, faded in and out within the stay
    const e = H.env(age, 0.2, 0.9, DWELL - 1.0, DWELL - 0.4);
    if (e > 0) {
      const dy = e * 0.0045 * Math.sin(t * 7.1) * Math.sin(t * 1.3 + 0.4), th = e * 0.0022 * Math.sin(t * 5.3 + 1.1);
      for (let i = 0; i < BODY.length; i++) A.wr(BODY[i], 0, 0, 1, th);
      bodyShift(A, dy, th);
    }
    A.glow("scapL", 0.12).glow("scapR", 0.12);
    A.glow("haunchL", 0.3).glow("haunchR", 0.3);
  }
  function bodyShift(A, dy, th) {
    // keep the turned parts together: each pivot moves as a point of the body turning about PIV
    const W = A.md.restW, c = Math.cos(th) - 1, s = Math.sin(th);
    for (let i = 0; i < BODY.length; i++) {
      const o = BODY_IX[i] * 12, px = W[o + 3] - PIV[0], py = W[o + 7] - PIV[1];
      A.move(BODY[i], c * px - s * py, s * px + c * py + dy, 0);
    }
  }

  PM.defineMode({
    name: "suv", kind: "vehicle", yaw: 0.4, dwell: DWELL,
    parts: suvParts,
    animate: suvAnimate,
    // a faint breath from the two outlets in the rear bumper's corners
    exhaust: [
      { part: "tail2", at: [0.03 * K, 0, 0.62 * K], dir: [1, 0.02, 0], power: 0.3, speed: 0.8, nozzle: 0.04 * K, heat: 0.3 },
      { part: "tail2", at: [0.03 * K, 0, -0.62 * K], dir: [1, 0.02, 0], power: 0.3, speed: 0.8, nozzle: 0.04 * K, heat: 0.3 },
    ],
  });
})(typeof window !== "undefined" ? window : globalThis);

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
          windscreen, the long roof crowned level with its rails, the roof
          spoiler over the raked rear glass, the glass house leaning in
          above the shoulder, the dark glass and the black "floating roof"
          D pillar, the black arch and sill cladding, the spindle grille
          (a dark mesh in a bright frame), the swept headlamps, the
          wrap-around tail lamps, wedge mirrors on the doors and 20-inch
          wheels with five split spokes. It drives on the moving floor:
          the wheels roll at the floor's speed, the body rides gently on
          its springs, the headlamps glow white and the tail lamps red, and
          a faint breath leaves the rear outlets.

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

   How dense each surface looks is set by its weight w: painted panels 1,
   glass and the black pillars about half, the cladding and the tyres
   darker still, the chrome lines, the grille's frame and the spokes'
   faces bright (front-facing chrome also gets a white tint against the
   red of the nose's stagnation pressure). The rig gives every part a
   fixed number of points (from all the machines' shares), so the
   surfaces (named regions, built in suvParts) are dealt to the parts in
   the PARTS table to give each part about the share of the SUV's weighted
   area that the other machines give it: every part then has about the
   same density (1.0-1.4 when this was dealt), and the weights alone decide
   the look. The two sides of a centre surface stay in one part (or in a
   mirrored pair); the far side's parts may hold a little more than the
   near side's (the helicopter gives maneR1-3 more points than maneL1-3).
   If the other machines change a lot, re-deal the table (move surfaces
   between parts; each surface must be in exactly one part, which is
   checked). Only round things go in the spinning wheel parts. Roles:
     chest      the bonnet
     neck       the windscreen's glass
     belly      the roof (darker between the rails, like glass), the
                windscreen's frame and cowl
     hips       the rear glass, the roof's end under the spoiler, the
                hatch's face, the faint floor under the body
     head       the front door glass, the bonnet's creases and edge lines,
                the near A pillar and some of the near side's chrome and
                shoulder
     jaw        the spindle grille: its dark mesh and its bright frame
     scapL/R    the nose round the grille: headlamps and their light
                strips, the fog-lamp bezels
     maneL1/R1  front fenders and the front doors' front halves
     flankL/R   front doors (their back halves, lower parts and shoulders)
     maneL2/R2  rear doors
     maneL3/R3  rear quarters with the C pillars and the strip over the
                black D-pillar glass
     back1/3    the rear side glass, the B pillars, the black D-pillar
                glass and the chrome round the glass
     back2      the rear bumper: its face, its corners up to the crease
     haunchL/R  the rear corners with the tail lamps
     *_up       arch cladding, wheel-well liners and brake calipers (the
                rear ones with the sill cladding)
     *_lo       rims: five split spokes and the hub (the front ones with
                the lip)
     *_paw      tyres with the brake discs and the rims' barrels (the rear
                ones with the lip)
     tail1      the front bumper's corners and lower part, the nose's lip,
                the grille's slats
     tail2      the rear corners above the bumper, the outlet trims
     tail3      roof rails and the roof spoiler
     tail4      door mirrors (and the strip over the near front glass)
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
  const XF = 1.078, XR = 3.870, WY = 0.386;          // axles (wheelbase 2.792), wheel centre height (the tyre just on the ground)
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
     front view's tumblehome (beltline 0.82, roof edge 0.62-0.73) gives the
     glass house, and its shoulder (0.92 at 1.1 m) where the side rolls in.
     ------------------------------------------------------------------ */
  // centre line top: the side view's top line, which along the roof is the roof's crown (the front view shows the
  // crown level with the rail tops, 1.68 m), then down under the spoiler onto the rear glass and the hatch; the hatch's
  // lower face stands 5 cm behind the bumper (the rear profile: 4.83-4.84 m from 0.8 to 1.0 m, the bumper 4.89 m at
  // 0.55-0.7 m), so behind it the sections end at the bumper's top ledge (0.775 m)
  const XSTEP = 4.836;
  const TOPC = curve(SX.filter((x) => x <= 4.25).map((x) => [x, TOP(x)]).concat([
    [4.30, 1.556], [4.33, 1.530], [4.36, 1.482], [4.41, 1.44], [4.48, 1.40], [4.54, 1.36], [4.61, 1.32], [4.67, 1.28], [4.73, 1.245], [4.78, 1.232],
    [4.81, 1.222], [4.826, 1.205], [XSTEP, 0.80], [4.842, 0.776], [4.86, 0.771], [4.875, 0.765], [4.88, 0.742]]), 4096);
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
  // how far the roof edge sits below the centre line (the crown of the windscreen, roof and rear glass): along the roof
  // the front view's section (0.62 wide at 1.63 m, 0.645 at 1.595 m) under a 1.68 m crown
  const DYR = curve([[1.2, 0.03], [2.0, 0.035], [2.25, 0.06], [4.1, 0.06], [4.3, 0.035], [4.4, 0.03], [4.9, 0.03]]);
  // the crown's shape (the exponent of the top's section): flatter across the roof
  const NRF = (x) => 2.2 + 0.8 * sstep(2.0, 2.3, x) * (1 - sstep(4.05, 4.3, x));
  // the shoulder's depth (how far below the beltline the roll starts): the front and rear views roll the side in from
  // about 0.95 m (0.945 half width up to 0.97, 0.94 at 1.0, 0.92 at 1.1), the rear quarter (higher beltline) as well
  const DSH = curve([[0, 0.05], [0.2, 0.09], [0.5, 0.12], [1.0, 0.14], [1.5, 0.19], [1.7, 0.22], [2.6, 0.235], [3.3, 0.29], [3.6, 0.37], [4.25, 0.38],
    [4.5, 0.30], [4.65, 0.2], [4.8, 0.10], [4.88, 0.05]]);
  // top of the black cladding: round the arches (their traced outer edges) and along the sills
  const ARCHF = curve([[0.575, 0.30], [0.58, 0.55], [0.61, 0.58], [0.66, 0.67], [0.76, 0.75], [0.82, 0.83], [0.94, 0.86], [1.06, 0.87], [1.19, 0.87],
    [1.31, 0.86], [1.43, 0.78], [1.50, 0.66], [1.535, 0.56], [1.545, 0.36]]);
  const ARCHR = curve([[3.415, 0.36], [3.425, 0.42], [3.46, 0.52], [3.50, 0.63], [3.56, 0.72], [3.60, 0.82], [3.71, 0.86], [3.81, 0.88], [4.03, 0.88],
    [4.15, 0.84], [4.25, 0.74], [4.28, 0.60], [4.305, 0.42], [4.315, 0.33]]);
  const SILLC = curve([[1.545, 0.36], [1.65, 0.34], [2.0, 0.348], [2.6, 0.362], [3.1, 0.37], [3.3, 0.36], [3.415, 0.36]]);
  const CLAD = (x) => (x >= 0.575 && x <= 1.545 ? ARCHF(x) : x >= 3.415 && x <= 4.315 ? ARCHR(x) : x > 1.545 && x < 3.415 ? SILLC(x) : BOT(x) + 0.015);
  const TUCK = 0.025;                     // the side tucks in this much at its lower edge
  // the floor line under the body (the side view's underside with the wheel arches bridged)
  const SILL = curve(SX.map((x, i) => [x, S_BOT[i]]).filter((p) => p[0] < 0.66 || (p[0] > 1.49 && p[0] < 3.46) || p[0] > 4.29));

  // the section tables (every 2.5 mm): bot, hw, ysh, zb, yb, zr, yr, top, the crown's exponent
  const X0 = 0, X1 = 4.88, NT = 1952, DXT = (X1 - X0) / NT, NC = 9, ST = new Float64Array((NT + 1) * NC);
  for (let i = 0; i <= NT; i++) {
    const x = X0 + i * DXT, o = i * NC, hw = HW(x), bot = BOT(x), top = TOPC(x);
    const zb = Math.min(ZBT(x), hw - 0.03), yb = Math.min(YB(x), top - 0.01);
    const ysh = Math.max(bot + 0.02, yb - Math.min(DSH(x), 0.85 * (yb - bot)));
    const g = sstep(1.18, 1.32, x);       // 0 along the bonnet: no glass house there
    const zr = Math.min(zb - 0.015, lerp(zb, ZRT(x), g)), yr = Math.max(yb, lerp(yb, top - DYR(x), g));
    ST[o] = bot; ST[o + 1] = hw; ST[o + 2] = ysh; ST[o + 3] = zb; ST[o + 4] = yb; ST[o + 5] = zr; ST[o + 6] = yr; ST[o + 7] = top; ST[o + 8] = NRF(x);
  }
  const SC = new Float64Array(NC);
  function sec(x) {
    let f = (x - X0) / DXT;
    f = f < 0 ? 0 : f > NT - 1e-9 ? NT - 1e-9 : f;
    const i = f | 0, w = f - i, o = i * NC;
    for (let k = 0; k < NC; k++) SC[k] = ST[o + k] + (ST[o + NC + k] - ST[o + k]) * w;
    return SC;
  }
  const BOW = 0.012;
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
      q[1] = top - (top - yr) * Math.pow(sz, s[8]); q[2] = zr * sz;
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
    else { const r = Math.min(1, Math.max(0, (top - y) / Math.max(1e-6, top - yr))); q[2] = zr * Math.pow(r, 1 / s[8]); }
    return q;
  }
  const fx = (f, x) => (typeof f === "function" ? f(x) : f);
  // the skin's half width at (x, y), or -1 above the top there
  const QS = [0, 0, 0], QN = [0, 0, 0];
  const zAt = (x, y) => { const s = sec(x); return y > s[7] || y < s[0] ? -1 : surfY(x, y, QS)[2]; };
  // the nose: the first x (from the front tip) where the skin at height y reaches half width z
  function noseAt(z, y, q) {
    let lo = 0, hi = 0.9;
    for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (zAt(m, y) >= z) hi = m; else lo = m; }
    q[0] = hi; q[1] = y; q[2] = z;
    return q;
  }
  // the tail: the last x (toward the rear) where the skin at height y still reaches half width z
  function tailAt(z, y, q) {
    let lo = 4.0, hi = X1;
    for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (zAt(m, y) >= z) lo = m; else hi = m; }
    q[0] = lo; q[1] = y; q[2] = z;
    return q;
  }
  // the first x where the centre line's top reaches height y (the nose above the grille's top)
  function xTopAt(y) {
    let lo = 0, hi = 1.2;
    if (TOPC(0) >= y) return 0;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (TOPC(m) >= y) hi = m; else lo = m; }
    return hi;
  }

  /* ------------------------------------------------------------------
     Surface builders (metres, machine orientation; side 1 = near (+z),
     -1 = the far side). Patches are S.param grids; the sampler spreads
     points by area, so the grids only need to follow the curvature.
     ------------------------------------------------------------------ */
  function kit(S) {
    const Kt = {};
    const Q = [0, 0, 0];
    // a patch from fn(u, v, q) -> q[0..2]; its normal from one-sided differences inside fn's own call (3 evaluations of
    // fn a point instead of the sampler's 5), or from nfn(u, v, q) -> q[0..5] when the normal is known
    const FA = new Float64Array(3), FB = new Float64Array(3);
    const P = (fn, gu, gv, o, nfn) => {
      const pts = S.param(fn, Object.assign({ gu: Math.max(2, gu | 0), gv: Math.max(2, gv | 0), glow: 0 }, o || {}));
      const p = pts[0] && pts[0].p;
      if (!p || typeof p.f !== "function" || !("nrm" in p)) return pts;   // (a framework without this patch layout)
      const sg = p.sgn || 1;
      p.f = nfn ? function (u, v, q) { nfn(u, v, q); q[3] *= sg; q[4] *= sg; q[5] *= sg; } : function (u, v, q) {
        fn(u, v, q);
        const h = 1e-3, du = u < 1 - h ? h : -h, dv = v < 1 - h ? h : -h, x = q[0], y = q[1], z = q[2];
        fn(u + du, v, FA); fn(u, v + dv, FB);
        const ux = (FA[0] - x) / du, uy = (FA[1] - y) / du, uz = (FA[2] - z) / du, vx = (FB[0] - x) / dv, vy = (FB[1] - y) / dv, vz = (FB[2] - z) / dv;
        q[0] = x; q[1] = y; q[2] = z;
        q[3] = (uy * vz - uz * vy) * sg; q[4] = (uz * vx - ux * vz) * sg; q[5] = (ux * vy - uy * vx) * sg;
      };
      p.nrm = true;
      return pts;
    };
    // a band of segment k from x0 to x1, v from v0(x) to v1(x)
    Kt.band = (x0, x1, k, v0, v1, side, o, gu) => {
      gu = gu || Math.max(3, Math.round((x1 - x0) * (k === 3 ? 22 : 30)));
      const gv = k === 3 ? 12 : k === 2 ? 6 : k === 1 ? 5 : 10;
      return P((u, v, q) => {
        const x = x0 + (x1 - x0) * u, a = fx(v0, x), b = fx(v1, x);
        skin(x, k, a + (b - a) * v, q); q[2] *= side;
      }, gu, gv, Object.assign({ flip: side < 0 }, o));
    };
    // a band of the skin between heights ya(x) and yb(x) (side, shoulder, glass house or top)
    Kt.bandY = (x0, x1, ya, yb, side, o, gv, gu) => {
      gu = gu || Math.max(3, Math.round((x1 - x0) * 30));
      return P((u, v, q) => {
        const x = x0 + (x1 - x0) * u, a = fx(ya, x), b = fx(yb, x);
        surfY(x, a + (b - a) * v, q); q[2] *= side;
      }, gu, gv || 8, Object.assign({ flip: side < 0 }, o));
    };
    // the same given row by row: for each height y from y0 to y1, x from xa(y) to xb(y) (pushed back by push(y))
    Kt.bandX = (y0, y1, xa, xb, side, o, gu, gv, push) => P((u, v, q) => {
      const y = y0 + (y1 - y0) * u, a = fx(xa, y), b = fx(xb, y);
      surfY(a + (b - a) * v, y, q); if (push) q[0] += fx(push, y); q[2] *= side;
    }, gu || Math.max(4, Math.round((y1 - y0) * 40)), gv || 6, Object.assign({ flip: side > 0 }, o));
    // a region of the nose / the tail face given in the front / rear view: |z| from z0 to z1, y from ya(z) to yb(z),
    // lifted off the skin by d; the skin's x is looked up once on the patch's grid (noseAt / tailAt are slow)
    Kt.faceZY = (front, z0, z1, ya, yb, side, o, d, nu, nv) => {
      nu = nu || Math.max(3, Math.round((z1 - z0) * 30)); nv = nv || 6;
      const r = nu + 1, T = new Float64Array(r * (nv + 1)), dd = d || 0.003;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const z = z0 + (z1 - z0) * i / nu, a = fx(ya, z), b = fx(yb, z), y = a + (b - a) * j / nv;
        T[j * r + i] = front ? noseAt(z, y, QN)[0] - dd : tailAt(z, y, QN)[0] + dd;
      }
      return P((u, v, q) => {
        const z = z0 + (z1 - z0) * u, a = fx(ya, z), b = fx(yb, z), fu = u * nu, fv = v * nv;
        const i = Math.min(nu - 1, fu | 0), j = Math.min(nv - 1, fv | 0), wu = fu - i, wv = fv - j, o0 = j * r + i;
        q[0] = (T[o0] * (1 - wu) + T[o0 + 1] * wu) * (1 - wv) + (T[o0 + r] * (1 - wu) + T[o0 + r + 1] * wu) * wv;
        q[1] = a + (b - a) * v; q[2] = z * side;
      }, nu, nv, Object.assign({ flip: front ? side < 0 : side > 0 }, o));
    };
    // a thin tube along a polyline of 3D points (resampled every ~2.5 cm), radius r
    Kt.tube = (pts, r, o) => {
      const C = [pts[0].slice()];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / 0.025));
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
      // flat tables for the evaluation (no arrays per call)
      const F = new Float64Array((M + 1) * 9);
      for (let k = 0; k <= M; k++) for (let j = 0; j < 3; j++) { F[k * 9 + j] = C[k][j]; F[k * 9 + 3 + j] = Nn[k][j]; F[k * 9 + 6 + j] = B[k][j]; }
      // a point and its normal (the tube's radial direction)
      const pt = (u, v, q) => {
        const f = v * M, k = Math.min(M - 1, f | 0), w = f - k, a = TAU * u, ca = Math.cos(a), sa = Math.sin(a), o0 = k * 9, o1 = o0 + 9;
        for (let j = 0; j < 3; j++) {
          const nj = ca * (F[o0 + 3 + j] + (F[o1 + 3 + j] - F[o0 + 3 + j]) * w) + sa * (F[o0 + 6 + j] + (F[o1 + 6 + j] - F[o0 + 6 + j]) * w);
          q[j] = F[o0 + j] + (F[o1 + j] - F[o0 + j]) * w + r * nj; q[3 + j] = nj;
        }
      };
      return P(pt, 5, Math.max(2, Math.min(40, M)), o, pt);
    };
    // a line drawn on the side of the body along side-view points [x, y] (lifted off the skin by r)
    Kt.sideLine = (xy, side, r, o) => Kt.tube(xy.map((p) => { surfY(p[0], p[1], Q); return [Q[0], Q[1], (Q[2] + r * 0.6) * side]; }), r, o);
    // a line on the nose along front-view points [z, y]; on the tail along rear-view points [z, y]
    Kt.noseLine = (zy, side, r, o, d) => Kt.tube(zy.map((p) => { noseAt(Math.abs(p[0]), p[1], Q); return [Q[0] - r * 0.6 + (d || 0), Q[1], Q[2] * side]; }), r, o);
    Kt.rearLine = (zy, side, r, o) => Kt.tube(zy.map((p) => { tailAt(Math.abs(p[0]), p[1], Q); return [Q[0] + r * 0.6, Q[1], Q[2] * side]; }), r, o);
    Kt.P = P;
    return Kt;
  }

  /* ------------------------------------------------------------------
     Panel lines and openings (metres, from the traced side, front and
     rear views)
     ------------------------------------------------------------------ */
  const XFB = 0.58, XD1 = 1.585, XD2 = 2.675, XD3 = 3.47, XQ = 4.32, XT = 4.72;   // bumper corner, doors, quarter, rear face
  const XCOWL = 1.25, XHDR = 2.05, XRR = 4.33, XRG = 4.76;                        // windscreen foot and header, rear glass top and foot
  const YLF = 0.60, YRB = 0.72, YRL = 0.56;          // lower front bumper line, rear bumper top, the rear bumper's lower section
  // the side glass: tops of the front and rear door glass, the black D-pillar glass's top
  const DLOF = curve([[1.62, 1.19], [1.70, 1.255], [1.78, 1.31], [1.87, 1.355], [1.96, 1.40], [2.05, 1.44], [2.14, 1.48], [2.24, 1.515], [2.33, 1.54],
    [2.42, 1.553], [2.51, 1.56], [2.58, 1.552], [2.635, 1.535]]);
  const DLOR = curve([[2.785, 1.58], [2.95, 1.582], [3.10, 1.58], [3.26, 1.57], [3.39, 1.55], [3.47, 1.48], [3.55, 1.40], [3.60, 1.275]]);
  const DTOP = curve([[3.39, 1.556], [3.45, 1.546], [3.53, 1.52], [3.62, 1.50], [3.70, 1.47], [3.79, 1.44], [3.87, 1.42], [3.96, 1.39], [4.05, 1.37],
    [4.14, 1.36], [4.22, 1.34], [4.31, 1.32], [4.40, 1.29], [4.47, 1.255]]);
  // the rear bumper's upper edge on the side: the crease from behind the arch up to the tail lamp's corner, then the lamp's foot
  const CRQ = curve([[4.30, 0.845], [4.38, 0.876], [4.45, 0.903], [4.50, 0.933], [4.575, 0.995], [4.62, 1.0], [4.72, 0.99]]);
  const SEC = (k) => (x) => sec(x)[k];
  const ybelt = SEC(4), yroof = SEC(6), yshd = SEC(2), ybot = SEC(0), ytop = SEC(7);
  // the bumper's top on the rear face (where the last sections are lower than it, just under their shoulder)
  const yrb = (x) => Math.min(YRB, sec(x)[2] - 0.002);
  // the spindle grille in the front view: its half width at each height (the traced outline), the frame's width round it
  const YGB = 0.403, YGT = 0.925, FW = 0.05, FWB = 0.03, FWT = 0.028;
  const SPW = curve([[0.403, 0.47], [0.42, 0.53], [0.445, 0.575], [0.483, 0.598], [0.52, 0.58], [0.573, 0.54], [0.62, 0.475], [0.677, 0.416], [0.73, 0.37],
    [0.766, 0.349], [0.787, 0.345], [0.83, 0.375], [0.885, 0.43], [0.908, 0.453], [0.925, 0.48]]);
  // the mesh sits back behind the frame and the slats; the lower opening deeper (the side view's notch at 0.42-0.50 m)
  const RECESS = (y) => 0.025 + 0.04 * sstep(0.41, 0.425, y) * (1 - sstep(0.49, 0.51, y));
  const SLATS = [0.47, 0.545, 0.62, 0.695, 0.775, 0.855];
  // the doors' upper crease (the front door's sweep, then the rear door's upper crease): the lower doors below it
  const YDL = curve([[1.585, 0.40], [1.66, 0.42], [1.75, 0.47], [1.85, 0.50], [2.04, 0.51], [2.33, 0.53], [2.675, 0.545], [2.81, 0.56], [2.97, 0.565],
    [3.2, 0.575], [3.47, 0.60]]);

  // how each kind of surface looks: its density weight (painted panels 1), a darker tint for the dark ones
  const GLASS = { w: 0.42, heat: -0.2, glow: 0 }, BLACK = { w: 0.55, heat: -0.2, glow: 0 }, ROOFC = { w: 0.45, glow: 0 };
  const CLADW = { w: 0.42, heat: -0.15, glow: 0 }, LINERW = { w: 0.4, glow: 0 };
  const MESH = { w: 0.2, glow: 0 }, FRAME = { w: 4.0, heat: -0.45 }, SLAT = { w: 1.3, heat: -0.35 }, WSGLASS = { w: 0.32, heat: -0.2, glow: 0 };
  const CHROME = { w: 2.4 }, SEAM = { w: 1.5, glow: 0 }, EDGE = { w: 2.0, glow: 0 }, RCH = 0.0065;
  const TYRE = { w: 0.42, heat: -0.15, glow: 0 }, TREAD = { w: 0.6, heat: -0.1, glow: 0 }, SHOULDER = { w: 0.5, heat: -0.1, glow: 0 };
  const HEAD = { heat: -0.35, glow: 1, w: 2.4 }, DRL = { heat: -0.3, glow: 1, w: 3.0 }, TAIL = { heat: 0.5, glow: 1, w: 1.3 };

  // which surfaces each part holds ("name:L" the near side, ":R" the far side, ":B" both) and its pivot (metres).
  // The parts' shares of the SUV's weighted area follow the other machines' shares (see the header).
  const PARTS = {
    chest: [[0.75, 1.06, 0], "bonnetF:B", "bonnetR:B"],
    belly: [[2.65, 1.58, 0], "roofCB:B", "roofCF:B", "roofO:B", "wsFrame:B"],
    hips: [[4.1, 1.14, 0], "floor:B", "hatch:B", "rGlass:B", "rGlassFrame:B", "roofEnd:B"],
    neck: [[1.65, 1.4, 0], "wsGlass:B"],
    head: [[1.87, 1.19, 0.36], "aPillar:L", "beltChrome:L", "bonnetLines:B", "fglass:B", "rdoorShoulder:L"],
    jaw: [[0.06, 0.65, 0], "grilleFrame:B", "grilleMesh:B"],
    maneL1: [[1.35, 0.87, 0.93], "fdoorF:L", "fender:L", "fenderShoulder:L"],
    maneL2: [[3.08, 0.91, 0.88], "drip2:L", "rdoor:L", "rdoorLines:L", "rdoorLow:L"],
    maneL3: [[3.83, 1.26, 0.81], "cpillar:L", "dabove:L", "quarter:L", "quarterShoulder:L"],
    maneR1: [[1.52, 1.08, -0.86], "aPillar:R", "drip1:R", "fdoorF:R", "fender:R", "fenderShoulder:R"],
    maneR2: [[3.06, 0.97, -0.86], "beltChrome:R", "drip2:R", "rdoor:R", "rdoorLines:R", "rdoorLow:R"],
    maneR3: [[3.67, 1.23, -0.83], "cpillar:R", "dabove:R", "quarter:R", "quarterShoulder:R", "rdoorShoulder:R"],
    back1: [[3.22, 1.4, 0.75], "bpillar:L", "chrome:L", "dglass:L", "rglass:L"],
    back2: [[4.52, 0.68, 0], "quarterLines:B", "rbumperFace:B", "rbumperSide:B", "rearLower:B"],
    back3: [[3.22, 1.4, -0.75], "bpillar:R", "chrome:R", "dglass:R", "rglass:R"],
    flankL: [[2.18, 0.78, 0.94], "fdoorB:L", "fdoorLines:L", "fdoorLow:L", "fdoorShoulder:L"],
    flankR: [[2.18, 0.78, -0.93], "fdoorB:R", "fdoorLines:R", "fdoorLow:R", "fdoorShoulder:R"],
    scapL: [[0.24, 0.75, 0.58], "bonnetFront:L", "fog:L", "headlamp:L", "noseBesideLo:L", "noseBesideUp:L"],
    scapR: [[0.24, 0.75, -0.58], "bonnetFront:R", "fog:R", "headlamp:R", "noseBesideLo:R", "noseBesideUp:R"],
    haunchL: [[4.53, 1.05, 0.83], "rcorner:L", "tailLamp:L"],
    haunchR: [[4.53, 1.05, -0.82], "rcorner:R", "tailLamp:R"],
    fl_up: [[1.13, 0.58, 0.82], "archF:L", "caliperF:L", "linerF:L"],
    fl_lo: [[1.078, 0.386, 0.8126], "lipF:L", "rimF:L"],
    fl_paw: [[1.078, 0.386, 0.8126], "barrelF:L", "discF:L", "tyreF:L"],
    fr_up: [[1.13, 0.58, -0.82], "archF:R", "caliperF:R", "linerF:R"],
    fr_lo: [[1.078, 0.386, -0.8126], "lipF:R", "rimF:R"],
    fr_paw: [[1.078, 0.386, -0.8126], "barrelF:R", "discF:R", "tyreF:R"],
    hl_up: [[3.57, 0.51, 0.85], "archR:L", "caliperR:L", "linerR:L", "sill:L"],
    hl_lo: [[3.87, 0.386, 0.8126], "rimR:L"],
    hl_paw: [[3.87, 0.386, 0.8126], "barrelR:L", "discR:L", "lipR:L", "tyreR:L"],
    hr_up: [[3.57, 0.51, -0.85], "archR:R", "caliperR:R", "linerR:R", "sill:R"],
    hr_lo: [[3.87, 0.386, -0.8126], "rimR:R"],
    hr_paw: [[3.87, 0.386, -0.8126], "barrelR:R", "discR:R", "lipR:R", "tyreR:R"],
    tail1: [[0.23, 0.57, 0], "bumperCorner:B", "grilleSlats:B", "lowerFront:B", "noseLip:B"],
    tail2: [[4.84, 0.73, 0], "exhaust:B", "hatchSide:B"],
    tail3: [[3.73, 1.61, 0], "rails:B", "spoiler:B"],
    tail4: [[1.93, 1.34, 0.23], "drip1:L", "mirror:B"],
  };

  function suvParts(S, H) {
    const Kt = kit(S), P = {};
    const mx = (a, b) => (x) => Math.max(fx(a, x), fx(b, x));
    const along = (f, x0, x1, n, dy) => { const o = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; o.push([x, f(x) + (dy || 0)]); } return o; };
    const mir = (shapes, s) => (s > 0 ? shapes : S.mirror(S.join(shapes)));

    // ---- the nose zone: where the skin is at each height of the grille (from its outline in the front view) ----
    const tXF = [], tSP = [], tFR = [], tSL = [];
    for (let j = 0; j <= 52; j++) {
      const y = YGB + (YGT - YGB) * j / 52, w = SPW(y);
      tXF.push([y, xTopAt(y)]);
      tSP.push([y, noseAt(w, y, QN)[0]]); tFR.push([y, noseAt(w + FW, y, QN)[0]]); tSL.push([y, noseAt(Math.max(0.02, w - 0.012), y, QN)[0]]);
    }
    const xf = curve(tXF, 256), xsp = curve(tSP, 256), xfr = curve(tFR, 256), xsl = curve(tSL, 256);
    let XNZ = 0;
    for (const p of tFR) XNZ = Math.max(XNZ, p[1]);
    XNZ += 0.03;                                    // the nose zone: x < XNZ is laid out row by row round the grille
    const X925 = xTopAt(YGT);
    // the flat centre of the skin's first or last section (the nose's tip: sx -1; the tail's end: sx 1), from y0 to y1,
    // pushed back by push(y)
    const cap = (x, y0, y1, s, o, push, sx) => Kt.P((u, v, q) => {
      const y = y0 + (y1 - y0) * v, sc = sec(x), yy = Math.min(sc[7] - 1e-4, Math.max(sc[0] + 1e-4, y));
      q[0] = x + (push ? fx(push, y) : 0); q[1] = y; q[2] = u * Math.max(0, zAt(x, yy)) * s;
    }, 4, 6, Object.assign({ flip: s * (sx || -1) > 0 }, o));

    const R = {};
    // ---- the top: bonnet, windscreen, roof, rear glass and hatch ----
    R.bonnetF = (s) => [Kt.band(XNZ, 0.78, 3, 0, 1, s)];
    R.bonnetR = (s) => [Kt.band(0.78, XCOWL, 3, 0, 1, s)];
    R.bonnetFront = (s) => [Kt.bandY(X925, XNZ, YGT, ytop, s, null, 4)];
    // the bonnet's two creases, its front edge over the grille and the headlamps, the shut line along its side
    const topLine = (pts, sd) => Kt.tube(pts.map((p) => { const sc = sec(p[0]), r = Math.min(1, p[1] / Math.max(0.01, sc[5])); return [p[0], sc[7] - (sc[7] - sc[6]) * Math.pow(r, sc[8]) + 0.004, p[1] * sd]; }), 0.006, SEAM);
    R.bonnetLines = (s) => [topLine([[1.2, 0.56], [0.9, 0.545], [0.6, 0.525], [0.35, 0.50], [0.17, 0.47]], s),
      Kt.noseLine([[0, 0.94], [0.3, 0.94], [0.5, 0.938], [0.6, 0.952], [0.74, 0.975], [0.88, 1.016]], s, 0.006, SEAM),
      Kt.sideLine(along(ybelt, 0.81, 1.25, 10, 0.002), s, 0.005, SEAM)];
    R.wsGlass = (s) => [Kt.band(XCOWL, XHDR, 3, 0.05, 1, s, WSGLASS)];
    R.wsFrame = (s) => [Kt.band(XCOWL, XHDR, 3, 0, 0.05, s),
      Kt.P((u, v, q) => { const z = 0.74 * u, x = XCOWL - 0.02 + 0.07 * v; skin(x, 3, 1 - z / Math.max(0.01, sec(x)[5]), q); q[1] += 0.004; q[2] = z * s; }, 16, 3, { flip: s < 0 })];
    R.roofCF = (s) => [Kt.band(XHDR, 3.0, 3, 0.2, 1, s, ROOFC)];
    R.roofCB = (s) => [Kt.band(3.0, 3.95, 3, 0.2, 1, s, ROOFC)];
    R.roofO = (s) => [Kt.band(XHDR, 3.95, 3, 0, 0.2, s)];
    R.roofEnd = (s) => [Kt.band(3.95, XRR, 3, 0, 1, s)];
    R.rGlass = (s) => [Kt.band(XRR, XRG, 3, 0.05, 1, s, GLASS)];
    R.rGlassFrame = (s) => [Kt.band(XRR, XRG, 3, 0, 0.05, s)];
    // the hatch below the glass: its face drops down at XSTEP to the bumper's top ledge (fine grids across the drop)
    const XS0 = XSTEP - 0.012, XS1 = XSTEP + 0.008;
    const across = (f) => [f(XS0 - 0.06, XS0, 3), f(XS0, XS1, 14), f(XS1, X1, 3)];
    R.hatch = (s) => [Kt.band(XRG, XS0 - 0.06, 3, 0, 1, s), across((a, b, g) => Kt.band(a, b, 3, 0, 1, s, null, g))];
    R.hatchSide = (s) => [Kt.band(4.47, XS0 - 0.06, 2, 0, 1, s), across((a, b, g) => Kt.band(a, b, 2, 0, 1, s, null, g)),
      Kt.band(XT, XS0 - 0.06, 1, 0, 1, s), across((a, b, g) => Kt.band(a, b, 1, 0, 1, s, null, g)),
      Kt.bandY(XT, XS0 - 0.06, yrb, yshd, s), across((a, b, g) => Kt.bandY(a, b, yrb, yshd, s, null, 8, g))];
    R.spoiler = (s) => [
      Kt.P((u, v, q) => { const x = XRR + (4.395 - XRR) * u, z = 0.6 * (1 - v); q[0] = x; q[1] = TOP(Math.min(x, 4.35)) - 0.012 * v * v - 0.02 * u * u; q[2] = z * s; }, 6, 8, { flip: s < 0 }),
      Kt.P((u, v, q) => { const x = XRR + (4.395 - XRR) * u, z = 0.6 * (1 - v); q[0] = x; q[1] = 1.53 + 0.035 * u; q[2] = z * s; }, 6, 8, { flip: s > 0 }),
    ];

    // ---- the nose: the spindle grille (a dark mesh set back in a bright frame, bright slats), the bumper round it ----
    R.grilleMesh = (s) => [Kt.bandX(YGB + FWB, YGT - FWT, xf, xsp, s, MESH, 24, 8, RECESS), cap(0.0005, YGB + FWB, TOPC(0) - 0.001, s, MESH, RECESS)];
    R.grilleFrame = (s) => [Kt.bandX(YGB + FWB, YGT - FWT, xsp, xfr, s, FRAME, 24, 3), Kt.bandX(YGT - FWT, YGT, xf, xfr, s, FRAME, 3, 10),
      Kt.bandX(YGB, YGB + FWB, xf, xfr, s, FRAME, 3, 10), cap(0.0005, YGB, YGB + FWB, s, FRAME)];
    R.grilleSlats = (s) => SLATS.map((y) => [Kt.bandX(y - 0.006, y + 0.006, xf, xsl, s, SLAT, 2, 10), y + 0.006 < TOPC(0) ? cap(0.0005, y - 0.006, y + 0.006, s, SLAT) : []]);
    R.noseBesideUp = (s) => [Kt.bandX(YLF, YGT, xfr, XNZ, s, null, 14, 4)];
    R.noseBesideLo = (s) => [Kt.bandX(YGB, YLF, xfr, XNZ, s, null, 8, 4)];
    R.noseLip = (s) => [Kt.bandY(0, XNZ, ybot, YGB, s, null, 4), cap(0.0005, sec(0.0005)[0] + 0.001, YGB, s)];
    R.lowerFront = (s) => [Kt.bandY(XNZ, XFB, ybot, mx(YLF, ybot), s)];
    R.bumperCorner = (s) => [Kt.bandY(XNZ, XFB, mx(YLF, ybot), yshd, s), Kt.band(XNZ, XFB, 1, 0, 1, s)];
    // headlamp (its outline in the front view, round the corner onto the fender top in the side view): a bright
    // outline, the light strip along its lower edge (the strips glow white)
    R.headlamp = (s) => [
      Kt.bandY(0.58, 0.785, curve([[0.58, 0.945], [0.64, 0.96], [0.71, 0.98], [0.785, 1.005]]), curve([[0.58, 0.99], [0.63, 0.995], [0.71, 1.0], [0.785, 1.008]]), s, HEAD, 3),
      Kt.noseLine([[0.45, 0.792], [0.502, 0.839], [0.543, 0.908], [0.606, 0.934], [0.675, 0.948], [0.739, 0.962], [0.808, 0.978], [0.88, 1.004],
        [0.888, 0.983], [0.864, 0.914], [0.814, 0.869], [0.797, 0.839], [0.727, 0.830], [0.658, 0.820], [0.589, 0.811], [0.52, 0.801], [0.45, 0.792]], s, 0.006, HEAD),
      Kt.noseLine([[0.46, 0.799], [0.52, 0.807], [0.589, 0.817], [0.658, 0.826], [0.727, 0.836], [0.797, 0.845], [0.814, 0.874], [0.864, 0.919], [0.884, 0.975]], s, 0.008, DRL),
    ];
    // the fog-lamp bezel: an arrowhead frame
    R.fog = (s) => [Kt.noseLine([[0.828, 0.716], [0.791, 0.703], [0.756, 0.689], [0.722, 0.671], [0.688, 0.650], [0.707, 0.630], [0.742, 0.610], [0.776, 0.591], [0.810, 0.582],
      [0.779, 0.605], [0.797, 0.620], [0.827, 0.631], [0.840, 0.660], [0.835, 0.694], [0.828, 0.716]], s, 0.008, { w: 2.6, heat: -0.45 })];

    // ---- the sides ----
    // door handles (a grip over a shallow recess), both at the same height
    const handle = (x0, x1, s) => { const y = () => 0.995; return [Kt.sideLine([[x0, y(x0)], [(x0 + x1) / 2, y((x0 + x1) / 2) + 0.012], [x1, y(x1)]], s, 0.009, { w: 1.6 }),
      Kt.sideLine([[x0 - 0.01, y(x0) - 0.012], [(x0 + x1) / 2, y((x0 + x1) / 2) - 0.022], [x1 + 0.01, y(x1) - 0.012]], s, 0.004, SEAM)]; };
    R.fender = (s) => [Kt.bandY(XFB, XD1, mx(CLAD, ybot), yshd, s)];
    R.fenderShoulder = (s) => [Kt.band(XFB, XD1, 1, 0, 1, s)];
    R.aPillar = (s) => [Kt.bandY(XCOWL, 1.62, ybelt, yroof, s)];
    R.drip1 = (s) => [Kt.bandY(1.62, 2.635, mx(ybelt, DLOF), yroof, s)];
    R.drip2 = (s) => [Kt.bandY(2.785, 3.39, mx(ybelt, DLOR), yroof, s)];
    // the doors: above and below their upper crease (the lower doors carry the creases)
    R.fdoorF = (s) => [Kt.bandY(XD1, 2.13, YDL, yshd, s)];
    R.fdoorB = (s) => [Kt.bandY(2.13, XD2, YDL, yshd, s)];
    R.fdoorShoulder = (s) => [Kt.band(XD1, XD2, 1, 0, 1, s)];
    R.fdoorLines = (s) => [Kt.sideLine([[1.575, 1.16], [1.565, 0.95], [1.57, 0.70], [1.585, 0.45], [1.60, 0.36]], s, 0.005, SEAM), handle(2.45, 2.64, s)];
    R.fdoorLow = (s) => [Kt.bandY(XD1, XD2, mx(CLAD, ybot), YDL, s, null, 4),
      Kt.sideLine([[1.66, 0.42], [1.75, 0.47], [1.85, 0.50], [2.04, 0.51], [2.33, 0.53], [2.62, 0.54]], s, 0.005, SEAM),
      Kt.sideLine([[1.45, 0.36], [1.70, 0.37], [1.98, 0.39], [2.26, 0.41], [2.6, 0.435]], s, 0.005, SEAM)];
    R.rdoor = (s) => [Kt.bandY(XD2, XD3, YDL, yshd, s)];
    R.rdoorShoulder = (s) => [Kt.band(XD2, XD3, 1, 0, 1, s)];
    R.rdoorLines = (s) => [Kt.sideLine([[2.69, 1.17], [2.67, 0.85], [2.67, 0.46], [2.68, 0.33]], s, 0.005, SEAM),
      Kt.sideLine([[3.49, 1.22], [3.48, 1.0], [3.47, 0.86]], s, 0.005, SEAM), handle(3.38, 3.56, s)];
    R.rdoorLow = (s) => [Kt.bandY(XD2, XD3, mx(CLAD, ybot), YDL, s, null, 4),
      Kt.sideLine([[2.7, 0.548], [2.81, 0.56], [2.97, 0.56]], s, 0.005, SEAM),
      Kt.sideLine([[2.7, 0.445], [2.82, 0.48], [2.95, 0.51], [3.09, 0.54], [3.23, 0.57], [3.38, 0.60]], s, 0.005, SEAM)];
    R.fglass = (s) => [Kt.bandY(1.62, 2.635, ybelt, mx(ybelt, DLOF), s, GLASS)];
    R.bpillar = (s) => [Kt.bandY(2.635, 2.785, ybelt, yroof, s, BLACK)];
    R.rglass = (s) => [Kt.bandY(2.785, 3.60, ybelt, mx(ybelt, DLOR), s, GLASS)];
    R.cpillar = (s) => [Kt.bandY(3.39, 3.60, mx(ybelt, DLOR), DTOP, s, BLACK), Kt.bandY(3.39, 3.60, DTOP, yroof, s)];
    // the chrome round the glass: along the front glass's top, over the B pillar, the rear glass's top and the D-pillar
    // glass (the "floating roof" line), and the beltline; the B pillar's edges and the C pillar's seam
    const upper = along(DLOF, 1.62, 2.6, 14).concat([[2.70, 1.574]], along(DLOR, 2.785, 3.39, 8), along(DTOP, 3.45, 4.47, 12));
    R.chrome = (s) => [Kt.sideLine(upper, s, RCH, CHROME),
      Kt.sideLine([[2.635, 1.19], [2.65, 1.54]], s, 0.005, SEAM), Kt.sideLine([[2.785, 1.20], [2.785, 1.575]], s, 0.005, SEAM),
      Kt.sideLine([[3.51, 1.235], [3.51, 1.43]], s, 0.007, SEAM)];
    R.beltChrome = (s) => [Kt.sideLine(along(ybelt, 1.60, 4.47, 40, 0.004), s, RCH, CHROME)];
    R.quarter = (s) => [Kt.bandY(XD3, XQ, mx(CLAD, ybot), yshd, s)];
    R.quarterShoulder = (s) => [Kt.band(XD3, XQ, 1, 0, 1, s)];
    R.quarterLines = (s) => [Kt.sideLine([[3.60, 1.268], [3.645, 1.18], [3.67, 1.07], [3.66, 0.95], [3.62, 0.87]], s, 0.005, SEAM),
      Kt.sideLine([[4.20, 0.804], [4.25, 0.826], [4.30, 0.845]], s, 0.005, SEAM),
      // the fuel door (the left side only)
      s > 0 ? Kt.sideLine([[3.998, 1.077], [4.10, 1.087], [4.19, 1.077], [4.204, 1.0], [4.199, 0.951], [4.10, 0.928], [4.002, 0.933], [3.991, 1.0], [3.998, 1.077]], s, 0.004, SEAM) : []];
    R.dglass = (s) => [Kt.bandY(3.60, 4.47, ybelt, mx(ybelt, DTOP), s, BLACK)];
    R.dabove = (s) => [Kt.bandY(3.60, 4.47, mx(ybelt, DTOP), yroof, s)];
    R.rcorner = (s) => [Kt.bandY(XQ, XT, CRQ, yshd, s), Kt.band(XQ, XT, 1, 0, 1, s)];
    // the rear bumper: its corners up to the crease (with the crease line and the reflector), its face down to its lower section
    R.rbumperSide = (s) => [Kt.bandY(XQ, XT, mx(CLAD, ybot), CRQ, s), Kt.sideLine(along(CRQ, XQ, 4.575, 8), s, 0.005, SEAM),
      Kt.sideLine([[4.705, 0.675], [4.75, 0.681], [4.753, 0.66], [4.737, 0.599], [4.715, 0.535], [4.682, 0.498], [4.64, 0.48], [4.705, 0.518], [4.735, 0.59], [4.752, 0.668], [4.705, 0.675]], s, 0.006, { w: 1.6, heat: 0.5 })];
    R.rbumperFace = (s) => [Kt.bandY(XT, X1, mx(YRL, ybot), yrb, s), cap(X1 - 0.0005, Math.max(YRL, sec(X1 - 0.0005)[0] + 0.001), sec(X1 - 0.0005)[7] - 0.001, s, null, null, 1)];
    R.rearLower = (s) => [Kt.bandY(XT, X1, ybot, mx(YRL, ybot), s), cap(X1 - 0.0005, sec(X1 - 0.0005)[0] + 0.001, Math.max(YRL, sec(X1 - 0.0005)[0] + 0.002), s, null, null, 1)];
    // the chrome outlet trims in the rear bumper's lower corners
    R.exhaust = (s) => [Kt.faceZY(false, 0.46, 0.78, 0.415, 0.485, s, { w: 2.0, heat: 0.08 }, 0.008, 6, 2),
      Kt.rearLine([[0.46, 0.415], [0.78, 0.415], [0.78, 0.485], [0.46, 0.485], [0.46, 0.415]], s, 0.006, { w: 2.4 })];
    // tail lamps: the side part (side view [x, y]) and the rear part (rear view [z, y]), with their outlines
    const TLU = curve([[4.28, 1.16], [4.37, 1.17], [4.45, 1.18], [4.54, 1.19], [4.63, 1.18], [4.70, 1.165]]);
    const TLL = curve([[4.28, 1.16], [4.31, 1.12], [4.39, 1.09], [4.48, 1.06], [4.56, 1.02], [4.65, 0.99], [4.70, 0.99]]);
    const TRU = curve([[0.351, 1.078], [0.414, 1.100], [0.483, 1.115], [0.556, 1.130], [0.625, 1.147], [0.694, 1.165], [0.763, 1.181], [0.80, 1.17]]);
    const TRL = curve([[0.351, 1.078], [0.417, 1.012], [0.481, 0.989], [0.550, 0.989], [0.619, 0.989], [0.689, 0.989], [0.758, 0.989], [0.80, 1.01]]);
    R.tailLamp = (s) => [Kt.bandY(4.28, 4.70, TLL, TLU, s, TAIL, 6), Kt.faceZY(false, 0.351, 0.80, TRL, TRU, s, TAIL, 0.006, 10, 4),
      Kt.sideLine([[4.70, 0.99], [4.65, 0.99], [4.56, 1.02], [4.48, 1.06], [4.39, 1.09], [4.31, 1.12], [4.28, 1.16], [4.37, 1.17], [4.45, 1.18], [4.54, 1.19], [4.63, 1.18], [4.70, 1.165]], s, 0.006, { w: 1.6, heat: 0.45 }),
      Kt.rearLine([[0.80, 1.01], [0.758, 0.989], [0.619, 0.989], [0.481, 0.989], [0.417, 1.012], [0.351, 1.078], [0.414, 1.100], [0.556, 1.130], [0.694, 1.165], [0.763, 1.181], [0.80, 1.17]], s, 0.006, { w: 1.6, heat: 0.45 })];

    // ---- the black cladding round the arches and along the sills (darker, a bright edge on top), the wheel wells ----
    R.archF = (s) => [Kt.bandY(0.575, 1.545, ybot, mx(CLAD, ybot), s, CLADW), Kt.sideLine(along(ARCHF, 0.58, 1.54, 24), s, 0.006, EDGE)];
    R.archR = (s) => [Kt.bandY(3.415, 4.315, ybot, mx(CLAD, ybot), s, CLADW), Kt.sideLine(along(ARCHR, 3.425, 4.305, 24), s, 0.006, EDGE)];
    R.sill = (s) => [Kt.bandY(1.545, 3.415, ybot, mx(CLAD, ybot), s, CLADW), Kt.sideLine(along(SILLC, 1.55, 3.41, 20), s, 0.006, EDGE)];
    const liner = (x0, x1, s) => Kt.P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, z = 0.62 + (sec(x)[1] - TUCK - 0.62) * v; q[0] = x; q[1] = BOT(x); q[2] = z * s;
    }, 60, 3, Object.assign({ flip: s < 0 }, LINERW));
    R.linerF = (s) => [liner(0.668, 1.492, s)];
    R.linerR = (s) => [liner(3.428, 4.302, s)];
    const caliper = (xc, s) => mir([S.box(0.09, 0.13, 0.05, { at: [xc + 0.16, WY + 0.06, TZ - 0.05], rot: [0, 0, 0.35], w: 0.8 })], s);
    R.caliperF = (s) => [caliper(XF, s)];
    R.caliperR = (s) => [caliper(XR, s)];

    // ---- wheels: 235/55 R20 tyres (dark sidewalls) and rims with five split spokes (bright faces) ----
    const ZO = TZ + TW / 2, ZI = TZ - TW / 2, SHR = 0.035;
    const tyre = (xc) => [
      S.tag(S.cyl(TR, TW - 2 * SHR, { axis: "z", at: [xc, WY, ZI + SHR], caps: false }), TREAD),
      S.tag(S.torus(TR - SHR, SHR, { at: [xc, WY, ZO - SHR], tube: [0, PI / 2] }), SHOULDER), S.tag(S.torus(TR - SHR, SHR, { at: [xc, WY, ZI + SHR], tube: [-PI / 2, 0] }), SHOULDER),
      S.tag(S.disc(RIM + 0.006, TR - SHR, { at: [xc, WY, ZO] }), TYRE), S.tag(S.disc(RIM + 0.006, TR - SHR, { at: [xc, WY, ZI], axis: "-z" }), { w: 0.6, glow: 0 }),
    ];
    const rimShape = (xc) => {
      const out = [], zf = ZO - 0.045;
      out.push(S.tag(S.disc(0, 0.068, { at: [xc, WY, zf - 0.02] }), { w: 2.0 }), S.tag(S.cyl(0.068, 0.02, { axis: "z", at: [xc, WY, zf - 0.04], caps: false }), { w: 1.0 }));
      // five split spokes: each pair leaves the hub together and parts toward the rim (a V), slender and a little twisted
      const r0 = 0.07, r1 = RIM - 0.012;
      for (let k = 0; k < 10; k++) {
        const sg = k & 1 ? 1 : -1, a0 = TAU * (k >> 1) / 5;
        const at = (r) => { const t = (r - r0) / (r1 - r0); return a0 + sg * (0.07 + 0.15 * t) + 0.12 * t; };
        const half = (r) => 0.009 + 0.003 * (r - r0) / (r1 - r0);
        const zs = (r) => zf - 0.02 + 0.028 * (r - r0) / (r1 - r0);
        out.push(Kt.P((u, v, q) => {
          const r = r0 + (r1 - r0) * v, a = at(r), h = (2 * u - 1) * half(r);
          q[0] = xc + r * Math.cos(a) - h * Math.sin(a); q[1] = WY + r * Math.sin(a) + h * Math.cos(a); q[2] = zs(r);
        }, 3, 10, { w: 4.0, flip: true }));
        for (const sd of [-1, 1]) out.push(Kt.P((u, v, q) => {
          const r = r0 + (r1 - r0) * v, a = at(r), h = sd * half(r);
          q[0] = xc + r * Math.cos(a) - h * Math.sin(a); q[1] = WY + r * Math.sin(a) + h * Math.cos(a); q[2] = zs(r) - 0.045 * u;
        }, 2, 10, { w: 1.0, flip: sd > 0 }));
      }
      return out;
    };
    const disc = (xc) => S.tag(S.disc(0.07, 0.175, { at: [xc, WY, TZ - 0.035] }), { w: 0.45, glow: 0 });
    // the rim's lip (the flange round the spokes)
    const lip = (xc) => S.tag(S.torus(RIM, 0.009, { at: [xc, WY, ZO - 0.012] }), { w: 1.6 });
    // the rim's barrel behind the spokes (a dim backdrop in the spokes' gaps)
    const barrel = (xc) => S.tag(S.cyl(RIM - 0.012, 0.16, { axis: "z", at: [xc, WY, ZO - 0.045 - 0.16], caps: false }), { w: 0.45, glow: 0 });
    R.tyreF = (s) => [mir(tyre(XF), s)];
    R.tyreR = (s) => [mir(tyre(XR), s)];
    R.rimF = (s) => [mir(rimShape(XF), s)];
    R.rimR = (s) => [mir(rimShape(XR), s)];
    R.discF = (s) => [mir([disc(XF)], s)];
    R.discR = (s) => [mir([disc(XR)], s)];
    R.barrelF = (s) => [mir([barrel(XF)], s)];
    R.barrelR = (s) => [mir([barrel(XR)], s)];
    R.lipF = (s) => [mir([lip(XF)], s)];
    R.lipR = (s) => [mir([lip(XR)], s)];

    // ---- the floor under the body: faint (the tunnel's camera never sees it), it closes the underside; inside the
    // wheels at the arches, rising to the front underside's height (0.245 m) between them ----
    const FLOOR = { w: 0.04, glow: 0 };
    const floor = (x0, x1, zw, s) => Kt.P((u, v, q) => {
      const x = x0 + (x1 - x0) * u, z = zw == null ? sec(x)[1] - TUCK : zw, zz = z * v, sl = SILL(x);
      q[0] = x; q[1] = sl + Math.max(0, 0.245 - sl) * sstep(z, z - 0.25, zz); q[2] = zz * s;
    }, Math.round((x1 - x0) * 12) + 2, 5, Object.assign({ flip: s < 0 }, FLOOR));
    R.floor = (s) => [floor(0.002, 0.672, null, s), floor(0.672, 1.488, 0.66, s), floor(1.488, 3.428, null, s), floor(3.428, 4.308, 0.66, s), floor(4.308, X1 - 0.002, null, s)];

    // ---- door mirrors: a wedge housing (rounded front, flat glass at the back, swept back in plan) on a thin arm ----
    // stations along z: [z, front x, back x, centre y, half height] (the traced side and plan outlines)
    const MST = [[0.875, 1.75, 1.89, 1.228, 0.07], [0.92, 1.775, 1.915, 1.235, 0.082], [1.0, 1.83, 1.955, 1.238, 0.083], [1.05, 1.875, 1.975, 1.238, 0.078],
      [1.075, 1.905, 1.982, 1.236, 0.06], [1.087, 1.935, 1.98, 1.235, 0.028]];
    const mf = [1, 2, 3, 4].map((k) => curve(MST.map((r) => [r[0], r[k]]), 64)), MZ0 = MST[0][0], MZ1 = MST[MST.length - 1][0];
    const sp = (c, e) => (c < 0 ? -Math.pow(-c, e) : Math.pow(c, e));
    const mirror = (s) => [
      // the shell: from the top round the front to the bottom (a squarish half section)
      Kt.P((u, v, q) => {
        const z = MZ0 + (MZ1 - MZ0) * u, th = PI * v, xf0 = mf[0](z), xb = mf[1](z), yc = mf[2](z), h = mf[3](z);
        q[0] = xb - (xb - xf0) * sp(Math.sin(th), 0.6); q[1] = yc + h * sp(Math.cos(th), 0.6); q[2] = z * s;
      }, 10, 12, { flip: s < 0 }),
      // the glass at the back, set in a little
      Kt.P((u, v, q) => { const z = MZ0 + (MZ1 - MZ0) * u, yc = mf[2](z), h = mf[3](z); q[0] = mf[1](z) - 0.004; q[1] = yc + h * (2 * v - 1); q[2] = z * s; }, 6, 4, { flip: s > 0, w: 0.6 }),
      // the inboard end and the arm from the door's top corner
      Kt.P((u, v, q) => { const th = PI * v, xf0 = mf[0](MZ0), xb = mf[1](MZ0), yc = mf[2](MZ0), h = mf[3](MZ0) * u;
        q[0] = xb - (xb - xf0) * sp(Math.sin(th), 0.6) * u; q[1] = yc + h * sp(Math.cos(th), 0.6); q[2] = MZ0 * s; }, 3, 8, { flip: s > 0 }),
      S.place(S.box(0.13, 0.035, 0.07, { r: 0.012 }), [1.70, 1.175, 0.85 * s], [0, 0.35 * s, -0.12]),
    ];
    R.mirror = (s) => mirror(s);

    // ---- roof rails: they stand 3.3 cm off the roof at |z| 0.525-0.575 (tops level with the crown), on feet at the ends ----
    const RZ0 = 0.525, RZ1 = 0.575, RAILH = 0.033;
    const roofAt = (x, z) => { const sc = sec(x), r = Math.min(1, Math.abs(z) / Math.max(0.01, sc[5])); return sc[7] - (sc[7] - sc[6]) * Math.pow(r, sc[8]); };
    const railTop = (x) => roofAt(x, 0.55) + 0.006 + (RAILH - 0.006) * sstep(2.04, 2.2, x) * (1 - sstep(4.0, 4.16, x));
    R.rails = (s) => [
      Kt.P((u, v, q) => { const x = 2.04 + 2.12 * u, z = RZ0 + (RZ1 - RZ0) * v; q[0] = x; q[1] = railTop(x); q[2] = z * s; }, 60, 2, { flip: s > 0 }),
      Kt.P((u, v, q) => { const x = 2.04 + 2.12 * u, y0 = roofAt(x, RZ1); q[0] = x; q[1] = y0 + (railTop(x) - y0) * v; q[2] = RZ1 * s; }, 60, 2, { flip: s < 0 }),
      Kt.P((u, v, q) => { const x = 2.04 + 2.12 * u, y0 = roofAt(x, RZ0); q[0] = x; q[1] = y0 + (railTop(x) - y0) * v; q[2] = RZ0 * s; }, 60, 2, { flip: s > 0 }),
    ];

    // ---- the parts from the table (every surface once, on each side) ----
    const used = Object.create(null);
    const tagReg = G.__SUV_REG ? (shapes, key) => { for (const pt of shapes) pt.p._reg = key; return shapes; } : (shapes) => shapes;
    for (const name in PARTS) {
      const row = PARTS[name], at = row[0], m = toM(at), shapes = [];
      for (let i = 1; i < row.length; i++) {
        const [rn, sd] = row[i].split(":"), f = R[rn];
        if (!f) throw new Error("suv: no region " + rn);
        for (const s of sd === "B" ? [1, -1] : sd === "R" ? [-1] : [1]) {
          const key = rn + (s > 0 ? ":L" : ":R");
          if (used[key]) throw new Error("suv: " + key + " is in two parts");
          used[key] = 1;
          shapes.push(tagReg(S.place(S.place(S.join(f(s)), OFF, null, K), [-m[0], -m[1], -m[2]]), rn + ":" + (s > 0 ? "L" : "R")));
        }
      }
      P[name] = { at: m, world: true, shape: S.join(shapes) };
    }
    for (const rn in R) for (const sd of [":L", ":R"]) if (!used[rn + sd]) throw new Error("suv: " + rn + sd + " is in no part");
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
  // the parts that hold the lamps (from the PARTS table): they glow (only the lamps' own surfaces have glow)
  const holding = (rn) => Object.keys(PARTS).filter((p) => PARTS[p].some((k) => typeof k === "string" && k.split(":")[0] === rn));
  const GLOW_HEAD = holding("headlamp"), GLOW_TAIL = holding("tailLamp");
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
    for (let i = 0; i < GLOW_HEAD.length; i++) A.glow(GLOW_HEAD[i], 0.12);
    for (let i = 0; i < GLOW_TAIL.length; i++) A.glow(GLOW_TAIL[i], 0.3);
  }
  function bodyShift(A, dy, th) {
    // keep the turned parts together: each pivot moves as a point of the body turning about PIV
    const W = A.md.restW, c = Math.cos(th) - 1, s = Math.sin(th);
    for (let i = 0; i < BODY.length; i++) {
      const o = BODY_IX[i] * 12, px = W[o + 3] - PIV[0], py = W[o + 7] - PIV[1];
      A.move(BODY[i], c * px - s * py, s * px + c * py + dy, 0);
    }
  }

  // the outlets' breath: from the chrome trims' middle (4.885 m back, 0.45 m up, 0.62 m out), in the part that holds them
  const EXP = holding("exhaust")[0] || "tail2";
  const exAt = (s) => { const o = toM([4.885, 0.45, 0.62 * s]), pv = toM(PARTS[EXP][0]); return [o[0] - pv[0], o[1] - pv[1], o[2] - pv[2]]; };

  PM.defineMode({
    name: "suv", kind: "vehicle", yaw: 0.4, dwell: DWELL,
    parts: suvParts,
    animate: suvAnimate,
    // a faint breath from the two outlets in the rear bumper's corners
    exhaust: [
      { part: EXP, at: exAt(1), dir: [1, 0.02, 0], power: 0.3, speed: 0.8, nozzle: 0.04 * K, heat: 0.3 },
      { part: EXP, at: exAt(-1), dir: [1, 0.02, 0], power: 0.3, speed: 0.8, nozzle: 0.04 * K, heat: 0.3 },
    ],
  });
})(typeof window !== "undefined" ? window : globalThis);

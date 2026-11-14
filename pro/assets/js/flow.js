/*
 * ProFlow: the air of the opening wind tunnel on the Pro page.
 *
 * A live 2D incompressible fluid, solved on the GPU around an obstacle that
 * the page draws every frame (the particle machine), and one full-screen
 * layer that draws the air as smoke-wire streaks coloured by local speed.
 * Plain script, global THREE (r160, WebGL2); defines window.ProFlow.
 *
 *   const flow = ProFlow.create(renderer, { mobile });
 *   if (flow.supported) {
 *     scene.add(flow.display);
 *     flow.resize(cssW, cssH, pixelRatio);           // on every canvas resize
 *     flow.warmup(60, 1 / 60);                       // once, after the first mask
 *     // each frame: clear flow.mask, draw the machine into it in white with the
 *     // page camera, then
 *     flow.step(dt, { time, inflow: 1, band: [0.25, 0.75], crossFlow: 0.35 });
 *   }
 *   flow.stir(x, y, dx, dy[, heat])   NDC; a jet of air at (x, y) along (dx, dy)
 *                                     (motion per 60 Hz frame): the cursor, a
 *                                     muzzle, an engine.  Called every frame at
 *                                     the same place it holds a steady jet, it
 *                                     never piles up.  heat 0..1 (optional, 0)
 *                                     tints the jet as hot exhaust.
 *   flow.rotor(x0, y0, x1, y1, dx, dy[, power])  NDC; a rotor disc seen edge-on
 *                                     (its two tips): across the whole disc the
 *                                     air is driven along (dx, dy), the shaft,
 *                                     up to the wash speed, and the stream
 *                                     sweeps the wash back.  Called every frame.
 *   flow.pulse(x, y, power)           NDC; a blast: a ring wave that runs out
 *                                     through the smoke, a puff of expanding
 *                                     gas, and a hot flash carried off by the
 *                                     wind.  power 0..3 (1 = a click).
 *   flow.setOpacity(a)  flow.stats  flow.params  flow.dispose()
 *
 * The solver works on a grid of square cells covering the canvas, velocity in
 * cells per second.  One step:
 *   obstacle    the page mask (2x the grid) -> solid fraction per cell
 *               (tent filter over 3x3 cells, then a soft threshold: a cloud of
 *               points becomes a solid body, stray points do not)
 *   advect      MacCormack (semi-Lagrangian predictor, RK2 back-trace, then a
 *               limited corrector); inflow sponge at the left edge; free slip
 *               top and bottom; jets (stir); a gentle relaxation of the far
 *               wake toward the free stream, standing in for the 3D turbulence
 *               that wears real wakes out; u *= 1 - solid
 *   curl        vorticity
 *   confine     vorticity confinement (kept off the cells touching the body,
 *               so the shear layers leave it clean) and a little viscosity, so
 *               the wake rolls up into a street of large vortices instead of
 *               grid-scale noise
 *   divergence  minus the volume sources of blasts; also packs the
 *               warm-started pressure and the solid fraction into one texture
 *   multigrid   one V-cycle: weighted Jacobi smoothing, residual restriction
 *               down to a grid of a few cells, back up with bilinear
 *               prolongation.  Neumann at solid neighbours, p = 0 beyond the
 *               outflow.  It converges the large scales, which plain Jacobi
 *               cannot in a frame's budget: the air really goes round the body
 *               and speeds up over it.
 *   gradient    subtract grad p, re-apply the boundary conditions
 *   dye x 2     MacCormack (predict + correct with the Selle et al. limiter)
 *               on a grid twice as fine, plus the blast rings, which push the
 *               smoke as they run out.  The dye stores, per parcel of air,
 *                 R  the height at which it entered (the smoke-wire label)
 *                 G  how far its smoke has mixed
 *                 B  its age in seconds
 *                 A  heat (blast flashes, hot exhaust), cooling as it goes
 *               The streaks are drawn as iso-lines of R, so they stay
 *               pixel-sharp at any grid size.  Where the flow folds R finer
 *               than the grid can hold (a rolled-up wake), the MacCormack
 *               error estimate measures the loss and adds it to G, and the
 *               display turns those streaks into a soft haze, as real smoke
 *               mixes.  Air the wake has held back (age beyond the free
 *               stream's) and well-mixed smoke fade, so the shear layers and
 *               the vortices they roll up stay crisp and the far wake calms.
 *
 * Colour: the page colormap cmap() of local speed relative to the inflow:
 * the free stream mid-scale (cyan-green), air sped up round the body yellow
 * to red, the slow wake blue.  Alpha is the smoke density; nothing is drawn
 * inside the body or where there is no smoke.
 *
 * The page renderer is used as found and left exactly as found (render
 * target, autoClear, clear colour/alpha, viewport, scissor).  No readPixels
 * or other CPU sync in step(); nothing is allocated per frame.
 */
(function () {
  "use strict";

  const MAX_STIRS = 12;      // jets per step (velocity)
  const MAX_ROTORS = 2;      // rotor discs per step (velocity)
  const MAX_HEAT = 8;        // heat sources per step (dye)
  const MAX_BLASTS = 6;      // blast waves alive at once
  const fin = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

  // The page colormap, copied exactly from home.js.
  const CMAP = `
      // Simulation-style colormap: deep blue -> cyan -> yellow -> red.
      vec3 cmap(float x) {
        x = clamp(x, 0.0, 1.0);
        return clamp(vec3(1.6 - abs(4.0*x - 3.2), 1.5 - abs(4.0*x - 2.0), 1.6 - abs(4.0*x - 0.75)), 0.0, 1.0);
      }
`;

  const PREC = `precision highp float;
precision highp int;
precision highp sampler2D;
`;

  // One full-screen triangle in clip space, shared by every pass and the display.
  const VERT = PREC + `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

  // Every pass writes fragColor in its main(), renamed passMain(); the real
  // main() (FTAIL) stores it.  Many GPUs (AMD, NVIDIA through ANGLE/Vulkan)
  // truncate fp32 -> fp16 when they write a half-float target: a bias of
  // half an ulp a pass, which slows the free stream by 4% across the screen
  // and drifts the smoke-wire labels by several streaks.  On those GPUs
  // (found by a probe at create), half an ulp is added first, which makes
  // the truncation round to nearest.
  const FHEAD = PREC + `
uniform vec2 uRes;            // size of the target being written
uniform float uOpen;          // 1: the top and bottom are open air (p = 0), 0: free-slip walls
out vec4 fragOut;
vec4 fragColor;
#define main passMain
// exact texel, clamped to the edge
vec4 tx(sampler2D s, ivec2 p) { return texelFetch(s, clamp(p, ivec2(0), textureSize(s, 0) - 1), 0); }
// speed limit and NaN/Inf guard for velocities
vec2 guardVel(vec2 v, float vmax) {
  float m = length(v);
  if (isnan(m) || isinf(m) || !(m < 1e20)) return vec2(0.0);
  return m > vmax ? v * (vmax / m) : v;
}
`;

  const ftail = (rtz) => `
#undef main
void main() {
  passMain();
  vec4 v = fragColor;
  ${rtz ? "v += sign(v) * exp2(floor(log2(max(abs(v), vec4(6.1035e-5)))) - 11.0);" : ""}
  fragOut = v;
}
`;

  // The blast waves: rings running out from where something went off.  Each
  // pushes the air it passes outward and lets it fall most of the way back,
  // like a pressure wave.  It moves the smoke only (an incompressible flow
  // carries no sound), so it never upsets the solver.  Units: velocity-grid
  // cells and cells per second.
  const BLAST = `
uniform int uBlastN;
uniform vec4 uBlastA[${MAX_BLASTS}];   // xy origin (cells), z ring radius (cells), w peak speed (cells/s)
uniform vec4 uBlastB[${MAX_BLASTS}];   // x front half-width (cells), y flash 0..1
vec2 blastVel(vec2 c) {
  vec2 v = vec2(0.0);
  for (int i = 0; i < ${MAX_BLASTS}; i++) {
    if (i >= uBlastN) break;
    vec4 a = uBlastA[i];
    vec2 d = c - a.xy;
    float r = length(d);
    float s = (r - a.z) / uBlastB[i].x;
    float f = exp(-s * s) - 0.4 * exp(-(s + 1.7) * (s + 1.7) * 0.6);
    v += d * (a.w * f / max(r, 1e-3)) * smoothstep(0.0, 1.5, r);
  }
  return v;
}
`;

  // ---------------------------------------------------------------- passes

  // Page mask (2x the grid) -> solid fraction.  Each bilinear tap averages
  // the 2x2 mask texels of one cell; 9 taps weighted 1-2-1 give a tent filter
  // over 3x3 cells.  R = solid fraction, G = raw coverage, B = the solid
  // fraction of the step before (what the body let go of is released air).
  // A = the floor: below the page's floor line (uFloor, in cells; < 0 none) the
  // cells are solid and move with the wind, as the rolling road of a car wind
  // tunnel, so the air goes over the car instead of under it and no slow layer
  // grows along the ground.
  const FRAG_OBSTACLE = FHEAD + `
uniform sampler2D uMask;
uniform sampler2D uPrev;
uniform vec2 uMaskTexel;
uniform vec2 uThresh;
uniform float uFloor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 o = 2.0 * uMaskTexel;
  float c = 4.0 * texture(uMask, uv).r
    + 2.0 * (texture(uMask, uv + vec2(o.x, 0.0)).r + texture(uMask, uv - vec2(o.x, 0.0)).r
           + texture(uMask, uv + vec2(0.0, o.y)).r + texture(uMask, uv - vec2(0.0, o.y)).r)
    + texture(uMask, uv + o).r + texture(uMask, uv - o).r
    + texture(uMask, uv + vec2(o.x, -o.y)).r + texture(uMask, uv + vec2(-o.x, o.y)).r;
  c *= 0.0625;
  if (isnan(c)) c = 0.0;
  float fl = uFloor < 0.0 ? 0.0 : clamp(uFloor - gl_FragCoord.y + 0.5, 0.0, 1.0);
  fragColor = vec4(max(smoothstep(uThresh.x, uThresh.y, c), fl), c, texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0).r, fl);
}
`;

  // Air from beyond the open edges (top, bottom, or back in past the
  // outflow) is free-stream air.
  const FARFIELD = `
uniform vec2 uInflow;
bool outside(vec2 q) { return q.x > 1.0 || (uOpen > 0.5 && (q.y < 0.0 || q.y > 1.0)); }
vec2 velAt(sampler2D s, vec2 q) { return outside(q) ? uInflow : texture(s, q).xy; }
`;

  // Velocity, predictor: semi-Lagrangian with an RK2 back-trace.
  const FRAG_ADVECT = FHEAD + FARFIELD + `
uniform sampler2D uVel;
uniform float uDt;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 v0 = texture(uVel, uv).xy;
  vec2 v1 = velAt(uVel, uv - 0.5 * uDt * v0 / uRes);
  fragColor = vec4(velAt(uVel, uv - uDt * v1 / uRes), 0.0, 1.0);
}
`;

  // Velocity, corrector (MacCormack): far less numerical viscosity than the
  // plain scheme, so bodies shed.  Then the forces and boundary conditions:
  // jets, the inlet, the far-wake relaxation, free slip top and bottom, and no
  // air inside the body.
  const FRAG_ADVECT_CORRECT = FHEAD + FARFIELD + `
uniform sampler2D uVel;
uniform sampler2D uHat;
uniform sampler2D uObs;
uniform float uDt;
uniform float uMacCormack;
uniform float uSponge;
uniform vec3 uRelax;          // x, y: where it starts and is full (fractions of the width), z: rate (1/s)
uniform sampler2D uDye;       // for the age of the air here
uniform vec4 uWake;           // x, y: held-back time (s) where wake ageing starts and is full, z: rate (1/s), w: inflow (cells/s)
uniform float uMaxSpeed;
uniform int uStirN;
uniform vec4 uStirA[${MAX_STIRS}];   // xy centre (cells), zw jet velocity (cells/s)
uniform vec4 uStirB[${MAX_STIRS}];   // x 1/radius^2 (1/cells^2), y share of the gap closed per step
uniform int uRotN;
uniform vec4 uRotA[${MAX_ROTORS}];   // the disc's two tips (cells)
uniform vec4 uRotB[${MAX_ROTORS}];   // xy wash velocity (cells/s), z share of the gap closed per 60 Hz step, w half-thickness (cells)
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  ivec2 p = ivec2(fc);
  vec2 hat = tx(uHat, p).xy;
  vec2 v0 = tx(uVel, p).xy;
  vec2 vb = texture(uVel, uv - 0.5 * uDt * v0 / uRes).xy;
  vec2 vf = texture(uVel, uv + 0.5 * uDt * v0 / uRes).xy;
  vec2 back = uv - uDt * vb / uRes;
  vec2 bar = texture(uHat, uv + uDt * vf / uRes).xy;
  ivec2 i0 = ivec2(floor(back * uRes - 0.5));
  vec2 c00 = tx(uVel, i0).xy;
  vec2 c10 = tx(uVel, i0 + ivec2(1, 0)).xy;
  vec2 c01 = tx(uVel, i0 + ivec2(0, 1)).xy;
  vec2 c11 = tx(uVel, i0 + ivec2(1, 1)).xy;
  vec2 lo = min(min(c00, c10), min(c01, c11));
  vec2 hi = max(max(c00, c10), max(c01, c11));
  vec2 v = clamp(hat + uMacCormack * 0.5 * (v0 - bar), lo, hi);
  if (outside(back)) v = hat;
  // jets: raise the speed along the jet up to the jet's own, never past it,
  // so a jet held every frame stays a steady jet
  for (int i = 0; i < ${MAX_STIRS}; i++) {
    if (i >= uStirN) break;
    vec4 a = uStirA[i];
    vec4 b = uStirB[i];
    vec2 d = fc - a.xy;
    float g = exp(-dot(d, d) * b.x);
    float V = length(a.zw);
    vec2 dir = a.zw / max(V, 1e-6);
    v += dir * (max(0.0, V - dot(v, dir)) * g * b.y);
  }
  // rotors: an actuator disc seen edge-on.  Across the disc (thinning over
  // the outer quarter toward the tips) the air is driven along the shaft up
  // to the wash speed, never past it; the free stream then sweeps the wash
  // back, and the pressure pass draws the air above down into the disc
  for (int i = 0; i < ${MAX_ROTORS}; i++) {
    if (i >= uRotN) break;
    vec4 a = uRotA[i];
    vec4 b = uRotB[i];
    vec2 c = 0.5 * (a.xy + a.zw);
    vec2 e = 0.5 * (a.zw - a.xy);
    float L = max(length(e), 1.0);
    vec2 t = e / L;
    vec2 d = fc - c;
    float s = dot(d, t) / L;
    float n = (d.x * t.y - d.y * t.x) / max(b.w, 0.5);
    float g = (1.0 - smoothstep(0.75, 1.0, abs(s))) * exp(-n * n);
    float V = length(b.xy);
    vec2 dir = b.xy / max(V, 1e-6);
    float k = 1.0 - pow(1.0 - clamp(b.z, 0.0, 0.99), uDt * 60.0);
    v += dir * (max(0.0, V - dot(v, dir)) * g * k);
  }
  // the wake wears out toward the free stream, as real (3D) wakes do: air
  // the body has held back for a while, and all air near the outflow
  float held = texture(uDye, uv).b - fc.x / uWake.w;
  float rate = uWake.z * smoothstep(uWake.x, uWake.y, held) + uRelax.z * smoothstep(uRelax.x, uRelax.y, uv.x);
  v = mix(v, uInflow, 1.0 - exp(-rate * uDt));
  // inlet: the first columns are held at the inflow
  v = mix(v, uInflow, 1.0 - smoothstep(0.0, uSponge, fc.x - 0.5));
  // free slip at the top and bottom (unless they are open)
  if ((fc.y < 1.0 || fc.y > uRes.y - 1.0) && uOpen < 0.5) v.y = 0.0;
  // air the body has just let go of (a part moved on, or the machine flew
  // apart) must not stay behind as a still pocket, which the stream would
  // wrap round like a ghost of the body for seconds: it takes the speed of
  // the settled open air next to it, or the free stream's deep inside
  vec4 ob = texelFetch(uObs, p, 0);
  float rel = ob.b - ob.r;
  if (rel > 0.002) {
    vec2 nb = vec2(0.0);
    float ws = 0.0;
    for (int k = 0; k < 4; k++) {
      ivec2 q = p + (k == 0 ? ivec2(-1, 0) : k == 1 ? ivec2(1, 0) : k == 2 ? ivec2(0, -1) : ivec2(0, 1));
      vec4 oq = tx(uObs, q);
      float w = (1.0 - oq.r) * (1.0 - oq.b);
      nb += w * tx(uVel, q).xy;
      ws += w;
    }
    vec2 fresh = mix(uInflow, nb / max(ws, 1e-4), smoothstep(0.0, 1.5, ws));
    v = mix(v, fresh, clamp(rel / max(ob.b, 1e-3), 0.0, 1.0));
  }
  // no air inside the body; the floor moves with the wind
  v = mix(v * (1.0 - ob.r), vec2(length(uInflow), 0.0), ob.a);
  fragColor = vec4(guardVel(v, uMaxSpeed), 0.0, 1.0);
}
`;

  const FRAG_CURL = FHEAD + `
uniform sampler2D uVel;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float L = tx(uVel, p - ivec2(1, 0)).y;
  float R = tx(uVel, p + ivec2(1, 0)).y;
  float B = tx(uVel, p - ivec2(0, 1)).x;
  float T = tx(uVel, p + ivec2(0, 1)).x;
  float w = 0.5 * ((R - L) - (T - B));
  fragColor = vec4((isnan(w) || isinf(w)) ? 0.0 : w, 0.0, 0.0, 1.0);
}
`;

  // Vorticity confinement and viscosity.
  const FRAG_CONFINE = FHEAD + `
uniform sampler2D uVel;
uniform sampler2D uCurl;
uniform sampler2D uObs;
uniform float uDt;
uniform float uEps;
uniform float uWall;
uniform float uNu;            // viscosity x dt, cells^2 (kept below the explicit limit)
uniform float uMaxSpeed;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float L = abs(tx(uCurl, p - ivec2(1, 0)).x);
  float R = abs(tx(uCurl, p + ivec2(1, 0)).x);
  float B = abs(tx(uCurl, p - ivec2(0, 1)).x);
  float T = abs(tx(uCurl, p + ivec2(0, 1)).x);
  float C = tx(uCurl, p).x;
  vec2 g = 0.5 * vec2(R - L, T - B);
  vec2 N = g / (length(g) + 1e-4);
  vec4 ob = texelFetch(uObs, p, 0);
  // none inside the body, and less in the cells that touch it
  float keep = (1.0 - ob.r) * (1.0 - uWall * smoothstep(0.0, 0.25, ob.g));
  vec2 v = tx(uVel, p).xy;
  vec2 lap = tx(uVel, p - ivec2(1, 0)).xy + tx(uVel, p + ivec2(1, 0)).xy
           + tx(uVel, p - ivec2(0, 1)).xy + tx(uVel, p + ivec2(0, 1)).xy - 4.0 * v;
  v += uDt * uEps * C * vec2(N.y, -N.x) * keep + uNu * lap;
  fragColor = vec4(guardVel(v, uMaxSpeed), 0.0, 1.0);
}
`;

  // -> (warm-start pressure, divergence - sources, solid fraction).  Blasts
  // add volume (their hot gas expands): a source the projection keeps.
  const FRAG_DIVERGENCE = FHEAD + `
uniform sampler2D uVel;
uniform sampler2D uObs;
uniform sampler2D uP;
uniform vec2 uInflow;
uniform float uKeep;
uniform int uSrcN;
uniform vec4 uSrc[${MAX_BLASTS}];   // xy centre (cells), z 1/radius^2, w peak rate (1/s)
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 L = tx(uVel, p - ivec2(1, 0)).xy;
  vec2 R = tx(uVel, p + ivec2(1, 0)).xy;
  vec2 B = tx(uVel, p - ivec2(0, 1)).xy;
  vec2 T = tx(uVel, p + ivec2(0, 1)).xy;
  if (p.x == 0) L = uInflow;
  float div = 0.5 * ((R.x - L.x) + (T.y - B.y));
  float sol = texelFetch(uObs, p, 0).r;
  vec2 fc = gl_FragCoord.xy;
  for (int i = 0; i < ${MAX_BLASTS}; i++) {
    if (i >= uSrcN) break;
    vec2 d = fc - uSrc[i].xy;
    div -= uSrc[i].w * exp(-dot(d, d) * uSrc[i].z) * (1.0 - sol);
  }
  float pr = tx(uP, p).x * uKeep;
  if (isnan(pr) || isinf(pr) || abs(pr) > 3e4) pr = 0.0;
  if (isnan(div) || isinf(div)) div = 0.0;
  fragColor = vec4(pr, div, sol, 1.0);
}
`;

  // The pressure equation, A p = b with A the 5-point Laplacian, on every
  // multigrid level.  Each level knows where its edges are, in its own cells
  // (uB: the outflow at x = uB.x, the top at y = uB.y; the left and bottom
  // edges at 0), so a coarse level whose cells overhang the screen still puts
  // the edges where the finest level has them.  The outflow, and the top and
  // bottom when they are open air, hold p = 0 on the edge itself: the ghost
  // cell beyond is extrapolated linearly to zero there, and taken into the
  // smoother implicitly so it stays stable however close the edge is.  The
  // left edge (the inlet) and solid neighbours mirror this cell (Neumann).
  // Cells beyond the edges are inactive (0).
  const MG = `
uniform sampler2D uP;
uniform vec2 uB;              // this level's edges, in its cells
// the ghost cell's factor on a cell d cells from a zero edge
float ghostK(float d) { d = max(d, 0.25); return (d - 1.0) / d; }
bool beyond(ivec2 p, vec2 b) { return float(p.x) + 0.5 >= b.x || float(p.y) + 0.5 >= b.y; }
// -> x: the sum of the four neighbours that are not ghosts, y: the ghosts' factor on C
vec2 nbSum(ivec2 p, float C, vec4 L, vec4 R, vec4 B, vec4 T, vec2 b) {
  vec2 pc = vec2(p) + 0.5;
  float s = mix(L.x, C, L.z), g = 0.0;
  if (pc.x + 1.0 >= b.x) g += ghostK(b.x - pc.x); else s += mix(R.x, C, R.z);
  if (p.y == 0 && uOpen > 0.5) g -= 1.0; else s += mix(B.x, C, B.z);
  if (pc.y + 1.0 >= b.y) { if (uOpen > 0.5) g += ghostK(b.y - pc.y); else s += C; } else s += mix(T.x, C, T.z);
  return vec2(s, g);
}
vec4 at(ivec2 p) { return tx(uP, p); }
`;

  // Weighted Jacobi (any level).  (p, b, solid) -> (p', b, solid)
  const FRAG_SMOOTH = FHEAD + MG + `
uniform float uOmega;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (beyond(p, uB)) { fragColor = vec4(0.0); return; }
  vec4 C = at(p);
  vec2 n = nbSum(p, C.x, at(p - ivec2(1, 0)), at(p + ivec2(1, 0)), at(p - ivec2(0, 1)), at(p + ivec2(0, 1)), uB);
  float pn = mix(C.x, (n.x - C.y) / (4.0 - n.y), uOmega);
  if (isnan(pn) || isinf(pn) || abs(pn) > 3e4) pn = 0.0;
  fragColor = vec4(pn, C.y, C.z, 1.0);
}
`;

  // Down a level: the residual of the finer level (edges uBF) averaged over
  // this cell's children inside the edges (x4: the coarse cell's area), the
  // mean solid fraction, and the first smoothing step from a zero correction.
  const FRAG_RESTRICT = FHEAD + MG + `
uniform vec2 uBF;
uniform float uOmega;
void main() {
  ivec2 P = ivec2(gl_FragCoord.xy);
  if (beyond(P, uB)) { fragColor = vec4(0.0); return; }
  float r = 0.0, sol = 0.0, n = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 p = 2 * P + ivec2(k & 1, k >> 1);
    if (beyond(p, uBF)) continue;
    vec4 C = at(p);
    vec2 s = nbSum(p, C.x, at(p - ivec2(1, 0)), at(p + ivec2(1, 0)), at(p - ivec2(0, 1)), at(p + ivec2(0, 1)), uBF);
    r += (C.y - (s.x + (s.y - 4.0) * C.x)) * (1.0 - C.z);
    sol += C.z;
    n += 1.0;
  }
  n = max(n, 1.0);
  float b = 4.0 * r / n;
  if (isnan(b) || isinf(b) || abs(b) > 3e4) b = 0.0;
  fragColor = vec4(-0.25 * uOmega * b, b, sol / n, 1.0);
}
`;

  // Up a level: add the coarser level's correction (bilinear, with the same
  // edge rules) and smooth once.
  const FRAG_PROLONG = FHEAD + MG + `
uniform sampler2D uE;          // the coarser level's correction
uniform vec2 uBC;              // its edges
uniform float uOmega;
uniform float uCorr;
float ce(ivec2 i) {
  ivec2 last = ivec2(ceil(uBC - 0.5)) - 1;
  float k = 1.0;
  if (i.x > last.x) { k *= ghostK(uBC.x - (float(last.x) + 0.5)); i.x = last.x; }
  if (i.x < 0) i.x = 0;
  if (i.y > last.y) { if (uOpen > 0.5) k *= ghostK(uBC.y - (float(last.y) + 0.5)); i.y = last.y; }
  if (i.y < 0) { if (uOpen > 0.5) k = -k; i.y = 0; }
  return k * texelFetch(uE, i, 0).x;
}
vec4 atc(ivec2 q) {
  vec4 v = at(q);
  q = clamp(q, ivec2(0), ivec2(ceil(uB - 0.5)) - 1);
  vec2 cc = (vec2(q) + 0.5) * 0.5 - 0.5;
  ivec2 i0 = ivec2(floor(cc));
  vec2 f = cc - vec2(i0);
  float a = mix(ce(i0), ce(i0 + ivec2(1, 0)), f.x);
  float b = mix(ce(i0 + ivec2(0, 1)), ce(i0 + ivec2(1, 1)), f.x);
  v.x += uCorr * mix(a, b, f.y);
  return v;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (beyond(p, uB)) { fragColor = vec4(0.0); return; }
  vec4 C = atc(p);
  vec2 n = nbSum(p, C.x, atc(p - ivec2(1, 0)), atc(p + ivec2(1, 0)), atc(p - ivec2(0, 1)), atc(p + ivec2(0, 1)), uB);
  float pn = mix(C.x, (n.x - C.y) / (4.0 - n.y), uOmega);
  if (isnan(pn) || isinf(pn) || abs(pn) > 3e4) pn = 0.0;
  fragColor = vec4(pn, C.y, C.z, 1.0);
}
`;

  // Velocity -= grad p (finest level: the edges are half a cell beyond the
  // outer cells, so a ghost is minus its cell), then the boundary conditions.
  const FRAG_GRADIENT = FHEAD + `
uniform sampler2D uP;
uniform sampler2D uVel;
uniform vec2 uInflow;
uniform float uMaxSpeed;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 hi = ivec2(uRes) - 1;
  vec4 C = tx(uP, p);
  vec4 L = tx(uP, p - ivec2(1, 0));
  vec4 R = tx(uP, p + ivec2(1, 0));
  vec4 B = tx(uP, p - ivec2(0, 1));
  vec4 T = tx(uP, p + ivec2(0, 1));
  float pL = mix(L.x, C.x, L.z);
  float pR = p.x >= hi.x ? -C.x : mix(R.x, C.x, R.z);
  float pB = p.y <= 0 && uOpen > 0.5 ? -C.x : mix(B.x, C.x, B.z);
  float pT = p.y >= hi.y && uOpen > 0.5 ? -C.x : mix(T.x, C.x, T.z);
  vec2 v = tx(uVel, p).xy - 0.5 * vec2(pR - pL, pT - pB);
  if (p.x == 0) v = uInflow;
  if ((p.y == 0 || p.y >= hi.y) && uOpen < 0.5) v.y = 0.0;
  v *= 1.0 - C.z;
  fragColor = vec4(guardVel(v, uMaxSpeed), 0.0, 1.0);
}
`;

  // Dye, predictor: plain semi-Lagrangian, with the blast rings.  The left
  // column is the smoke wire (label = height, no mixing, age 0, cold).
  // Cells of the body next to the air take the average of their open
  // neighbours, so the advection never drags stale values out of the body;
  // cells deeper inside drift towards well-mixed, old wake smoke, so space the
  // body vacates fills with faint haze rather than leaving a hole.  Heat is
  // added where something went off or an engine burns, and cools.
  const FRAG_DYE_PREDICT = FHEAD + BLAST + `
bool outside(vec2 q) { return q.x > 1.0 || (uOpen > 0.5 && (q.y < 0.0 || q.y > 1.0)); }
uniform float uAgeU;        // inflow, cells/s (the age of free-stream air at x is x / U)
uniform sampler2D uDye;
uniform sampler2D uVel;
uniform sampler2D uObs;
uniform vec2 uVelRes;
uniform float uDt;
uniform float uAgeMax;
uniform vec4 uFill;         // wake smoke for deep inside the body: label, mixing, age; rate
uniform float uCool;        // heat kept per step
uniform int uHeatN;
uniform vec4 uHeat[${MAX_HEAT}];   // xy centre (velocity cells), z 1/radius^2, w heat 0..1
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 d;
  if (p.x == 0) {
    d = vec4(uv.y, 0.0, 0.0, 0.0);
  } else {
    vec2 c = uv * uVelRes;
    if (texture(uObs, uv).r > 0.5) {
      vec2 t = 1.0 / uRes;
      float wl = 1.0 - texture(uObs, uv - vec2(t.x, 0.0)).r;
      float wr = 1.0 - texture(uObs, uv + vec2(t.x, 0.0)).r;
      float wb = 1.0 - texture(uObs, uv - vec2(0.0, t.y)).r;
      float wt = 1.0 - texture(uObs, uv + vec2(0.0, t.y)).r;
      float ws = wl + wr + wb + wt;
      vec4 own = tx(uDye, p);
      vec4 nb = (tx(uDye, p - ivec2(1, 0)) * wl + tx(uDye, p + ivec2(1, 0)) * wr
               + tx(uDye, p - ivec2(0, 1)) * wb + tx(uDye, p + ivec2(0, 1)) * wt + own * 0.02) / (ws + 0.02);
      vec4 fill = mix(own, vec4(uFill.xyz, own.a), uFill.w);
      d = mix(fill, nb, smoothstep(0.0, 0.3, ws));
    } else {
      vec2 v0 = texture(uVel, uv).xy;
      vec2 v1 = texture(uVel, uv - 0.5 * uDt * v0 / uVelRes).xy;
      vec2 q = uv - uDt * (v1 + blastVel(c)) / uVelRes;
      // air from beyond an open edge: clean free-stream air, labelled by its height
      d = outside(q) ? vec4(q.y, 0.0, q.x * uVelRes.x / uAgeU - uDt, 0.0) : texture(uDye, q);
      // heat moves with the air only, not with the blast wave: the flash stays where it went off
      q = uv - uDt * v1 / uVelRes;
      d.a = outside(q) ? 0.0 : texture(uDye, q).a;
    }
    d.b = min(d.b + uDt, uAgeMax);
    d.a *= uCool;
    for (int i = 0; i < ${MAX_HEAT}; i++) {
      if (i >= uHeatN) break;
      vec2 e = c - uHeat[i].xy;
      float h = uHeat[i].w * exp(-dot(e, e) * uHeat[i].z);
      d.a = d.a + h * (1.0 - d.a);
    }
  }
  if (isnan(d.r + d.g + d.b + d.a) || isinf(d.r + d.g + d.b + d.a)) d = vec4(uv.y, 0.0, uAgeMax, 0.0);
  d.a = clamp(d.a, 0.0, 1.0);
  fragColor = d;
}
`;

  // Dye, corrector (MacCormack): undo the prediction with the reversed flow,
  // take half the round-trip error back, and clamp to the four texels the
  // back-trace fell between.  The error is also the smear the plain scheme
  // would have made: it becomes mixing.  (Heat stays as predicted: soft.)
  const FRAG_DYE_CORRECT = FHEAD + BLAST + `
uniform sampler2D uDye;
uniform sampler2D uHat;
uniform sampler2D uVel;
uniform sampler2D uObs;
uniform vec2 uVelRes;
uniform float uDt;
uniform float uAgeMax;
uniform float uMixGain;   // mixing per label unit of smear (= gain / streak period)
uniform float uMixMax;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 hat = tx(uHat, p);
  if (p.x == 0 || texture(uObs, uv).r > 0.5) { fragColor = hat; return; }
  vec2 vbl = blastVel(uv * uVelRes);
  vec2 v0 = texture(uVel, uv).xy;
  vec2 vb = texture(uVel, uv - 0.5 * uDt * v0 / uVelRes).xy + vbl;
  vec2 vf = texture(uVel, uv + 0.5 * uDt * v0 / uVelRes).xy + vbl;
  vec2 back = uv - uDt * vb / uVelRes;
  if (back.x > 1.0 || (uOpen > 0.5 && (back.y < 0.0 || back.y > 1.0))) { fragColor = hat; return; }
  vec4 bar = texture(uHat, uv + uDt * vf / uVelRes);
  vec4 orig = tx(uDye, p);
  float eL = 0.5 * (orig.r - bar.r);
  float eA = 0.5 * (orig.b + uDt - bar.b);
  ivec2 i0 = ivec2(floor(back * uRes - 0.5));
  vec4 c00 = tx(uDye, i0);
  vec4 c10 = tx(uDye, i0 + ivec2(1, 0));
  vec4 c01 = tx(uDye, i0 + ivec2(0, 1));
  vec4 c11 = tx(uDye, i0 + ivec2(1, 1));
  vec4 lo = min(min(c00, c10), min(c01, c11));
  vec4 hi = max(max(c00, c10), max(c01, c11));
  float lab = min(max(hat.r + eL, lo.r), hi.r);
  float age = min(min(max(hat.b + eA, lo.b + uDt), hi.b + uDt), uAgeMax);
  float mixd = min(hat.g + uMixGain * abs(eL), uMixMax);
  vec4 o = vec4(lab, mixd, age, hat.a);
  if (isnan(o.r + o.g + o.b) || isinf(o.r + o.g + o.b)) o = hat;
  fragColor = o;
}
`;

  const FRAG_INIT = FHEAD + `
uniform int uMode;          // 0 velocity, 1 dye, 2 zero
uniform vec2 uInflow;
uniform float uAgeScale;    // seconds for the inflow to cross the screen
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  if (uMode == 0) fragColor = vec4(uInflow, 0.0, 1.0);
  else if (uMode == 1) fragColor = vec4(uv.y, 0.0, uv.x * uAgeScale, 0.0);
  else fragColor = vec4(0.0);
}
`;

  // Resampling a field into a grid of another size (on resize).
  const FRAG_COPY = FHEAD + `
uniform sampler2D uSrc;
uniform vec4 uScale;
void main() {
  vec4 v = texture(uSrc, gl_FragCoord.xy / uRes) * uScale;
  if (any(isnan(v)) || any(isinf(v))) v = vec4(0.0);
  fragColor = v;
}
`;

  // ---------------------------------------------------------------- display

  const FRAG_DISPLAY = PREC + BLAST + `
uniform sampler2D uDye;
uniform sampler2D uVel;
uniform sampler2D uObs;
uniform vec2 uVelRes;
uniform vec2 uDyeRes;
uniform float uU;           // inflow speed, cells/s: colour is speed relative to it
uniform float uOpacity;
uniform float uPR;          // device pixels per CSS pixel
uniform vec2 uBand;         // dyed band of inlet heights
uniform float uPeriod;      // label distance between streaks
uniform float uWidth;       // streak half-width, fraction of the period
uniform float uGain;
uniform float uHaze;
uniform float uMixWiden;    // streak widening per unit of mixing, in periods
uniform vec3 uFade;         // x: seconds held back for the smoke to fade by e; y: the faintest it gets; z: mixing that halves it
uniform vec4 uSpeedMap;     // colormap value at the inflow speed, at the top speed, top speed / U, slow-end gamma
uniform float uContour;
uniform float uBanding;
uniform float uRim;
uniform vec3 uHeatLook;     // x heat gain, y ring glow, z flash
uniform vec4 uDev;          // x: deviation from the inflow (/ U) from the floor to the top of the colormap;
                            // y: the floor; z: how softly the filled colour comes in; w: how much the streaks lighten it
uniform float uCalm;        // brightness of the streaks where the air is calm
in vec2 vUv;
out vec4 fragColor;
${CMAP}
float hash0(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
// per-streak brightness, 0.62..1: real smoke wires are uneven
float hash1(float n) { return 0.62 + 0.38 * hash0(n); }
// Cubic B-spline filtering from four bilinear taps: a smooth (C2) field, so
// the streak iso-lines have no kinks and their gradient no steps at texels.
vec4 bspline(sampler2D tex, vec2 uv, vec2 res) {
  vec2 st = uv * res - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 s0 = w0 + w1, s1 = w2 + w3;
  vec2 t0 = (i - 0.5 + w1 / s0) / res;
  vec2 t1 = (i + 1.5 + w3 / s1) / res;
  return (texture(tex, t0) * s0.x + texture(tex, vec2(t1.x, t0.y)) * s1.x) * s0.y
       + (texture(tex, vec2(t0.x, t1.y)) * s0.x + texture(tex, t1) * s1.x) * s1.y;
}
// speed / inflow -> colormap: 0 deep blue, 1 mid-scale cyan-green, the top
// of the scale red.  The slow end is lifted by a gamma, so a wake reads blue.
float speedToX(float s) {
  return s < 1.0 ? uSpeedMap.x * pow(max(s, 0.0), uSpeedMap.w)
                 : uSpeedMap.x + (uSpeedMap.y - uSpeedMap.x) * (s - 1.0) / max(uSpeedMap.z - 1.0, 1e-3);
}
void main() {
  vec4 d = bspline(uDye, vUv, uDyeRes);
  vec2 c = vUv * uVelRes;
  vec2 bv = blastVel(c);
  vec2 vel = texture(uVel, vUv).xy + bv;
  float s = texture(uObs, vUv).r;
  float l = d.r;
  float mixd = max(d.g, 0.0);
  float age = max(d.b, 0.0);
  float heat = clamp(d.a, 0.0, 1.0);

  // all screen-space derivatives first, in uniform control flow
  vec2 dl = vec2(dFdx(l), dFdy(l));
  vec2 ds = vec2(dFdx(s), dFdy(s));
  float x = speedToX(length(vel) / uU);
  float fx = fwidth(x);

  // smoke-wire streaks: iso-lines of the inlet height.  Each streak is a
  // Gaussian across the label; its width grows with mixing (the smoke
  // spreads) and never drops below about a pixel (anti-aliasing), and its
  // peak falls as it widens, so the amount of smoke is kept.
  float g = max(length(dl), 1e-7);            // label change per device pixel
  float t = (l - uBand.x) / uPeriod;          // streak k sits at t = k + 0.5
  float n = (uBand.y - uBand.x) / uPeriod;
  float k = floor(t);
  float o = fract(t) - 0.5;
  float wPix = 0.7 * uPR * g / uPeriod;       // one pixel and a bit, in periods
  float wMix = uMixWiden * mixd;
  float w = sqrt(uWidth * uWidth + wPix * wPix + wMix * wMix);
  float iw2 = 1.0 / (w * w);
  float prof = hash1(k) * exp(-o * o * iw2)
             + hash1(k + 1.0) * exp(-(o - 1.0) * (o - 1.0) * iw2)
             + hash1(k - 1.0) * exp(-(o + 1.0) * (o + 1.0) * iw2);
  // a period's average (sqrt(pi) w0 x mean brightness): what is left of the
  // streaks once they are folded finer than a pixel or mixed
  float meanD = 1.7725 * uWidth * 0.81;
  float dens = mix(prof * (uWidth / w), meanD, smoothstep(0.45, 0.85, w));
  dens = max(dens, uHaze);
  dens *= smoothstep(-0.3, 0.3, t) * smoothstep(n + 0.3, n - 0.3, t);
  // air the wake has held back fades, and so does well-mixed smoke: the
  // shear layers and the vortices they roll up stay crisp, the far wake calms
  float held = max(age - c.x / uU, 0.0);
  float fade = mix(uFade.y, 1.0, exp(-held / uFade.x)) / (1.0 + mixd / uFade.z);

  // THE LOOK: wind everywhere, as in a wind-tunnel photograph, coloured as in a CFD picture.
  //  - the smoke streaks run across the whole tunnel; where the air is calm they are dim blue;
  //  - where the machine disturbs the air (d = |u - U| / U above a floor) the colour fills in and
  //    climbs the colormap: cyan, green, yellow, red at the body and in the core of the wake;
  //  - dead air right behind the body (slow and calm) goes dark, so the wake shows its eddies.
  // uDev: x the deviation from the floor to the top of the colormap, y the floor, z how softly the
  // filled colour comes in, w how much the streaks lighten it. uCalm: how bright the calm streaks are.
  vec2 vs = bspline(uVel, vUv, uVelRes).xy + bv;
  float dv = length(vs - vec2(uU, 0.0)) / uU;
  float tcol = clamp((dv - uDev.y) / uDev.x, 0.0, 1.0);
  float field = smoothstep(0.0, uDev.z, tcol);
  float smoke = clamp(dens * fade * uGain, 0.0, 1.0);
  vec3 hot = cmap(max(tcol, 0.06));
  hot = mix(hot, min(hot + vec3(0.35), vec3(1.0)), smoke * uDev.w);
  vec2 tv = 1.0 / uVelRes;
  float curl = (texture(uVel, vUv + vec2(tv.x, 0.0)).y - texture(uVel, vUv - vec2(tv.x, 0.0)).y
              - texture(uVel, vUv + vec2(0.0, tv.y)).x + texture(uVel, vUv - vec2(0.0, tv.y)).x) * 0.5 / uU;
  float slow = 1.0 - smoothstep(0.25, 0.6, length(vs) / uU);
  float calm = 1.0 - smoothstep(0.01, 0.06, abs(curl));
  hot *= 1.0 - 0.85 * slow * calm;
  vec3 col = mix(cmap(0.1) * 0.95, hot, field);
  float open = 1.0 - smoothstep(0.35, 0.6, s);
  float a = max(smoke * uCalm, field) * open * uOpacity;
  vec3 C = col * a;
  float A = a;

  // rim light along the body, coloured by the speed just outside it
  float sg = length(ds);
  float rd = abs(s - 0.5) / max(sg, 1e-4);
  float rw = 1.1 * uPR;
  vec2 nrm = -ds / max(sg, 1e-6);
  vec2 vo = texture(uVel, vUv + nrm * 2.5 / uVelRes).xy;
  float ra = uRim * uOpacity * exp(-rd * rd / (rw * rw)) * smoothstep(0.004, 0.03, sg);
  C = C * (1.0 - ra) + cmap(speedToX(length(vo) / uU)) * ra;
  A = A + ra * (1.0 - A);

  // heat: blast flashes and hot exhaust, yellow cooling to red
  float ha = clamp(heat * uHeatLook.x, 0.0, 1.0) * open * uOpacity;
  vec3 hc = cmap(0.97 - 0.32 * heat) + vec3(1.0, 0.85, 0.55) * uHeatLook.z * smoothstep(0.55, 1.0, heat);
  C = C * (1.0 - ha) + hc * ha;
  A = A + ha * (1.0 - A);

  // the blast fronts themselves, a faint fast ring even where there is no smoke
  float ring = clamp(length(bv) / uU, 0.0, 1.0) * uHeatLook.y * open * uOpacity;
  C = C * (1.0 - ring) + cmap(0.72) * ring;
  A = A + ring * (1.0 - A);

  fragColor = vec4(C / max(A, 1e-5), clamp(A, 0.0, 1.0));
}
`;

  // ---------------------------------------------------------------- support test

  // B: 1 + 0.7 ulp, which reads back as 1 + 1 ulp where the GPU rounds to
  // nearest and as 1 where it truncates
  const FRAG_TEST_WRITE = FHEAD + `
void main() { fragColor = vec4(gl_FragCoord.x < 1.0 ? -1.0 : 3.0, 0.25, 1.0 + 0.7 / 1024.0, 1.0); }
`;
  const FRAG_TEST_READ = FHEAD + `
uniform sampler2D uSrc;
void main() {
  vec4 v = texture(uSrc, vec2(0.5, 0.5));   // halfway between the two texels: (1.0, 0.25)
  fragColor = vec4(v.r * 0.5, v.g * 2.0, clamp((v.b - 1.0) * 1024.0, 0.0, 1.0), 1.0);
}
`;

  // ---------------------------------------------------------------- module

  function create(renderer, opts) {
    opts = opts || {};
    const T = window.THREE;
    const mobile = !!opts.mobile;
    const noop = function () {};
    const flow = {
      supported: false,
      mask: null,
      maskPointScale: 1,
      display: null,
      stats: { gridW: 0, gridH: 0, dyeW: 0, dyeH: 0, iterations: 0, levels: 0, maskW: 0, maskH: 0, passes: 0, steps: 0, blasts: 0 },
      params: null,
      resize: noop, step: noop, warmup: noop, stir: noop, rotor: noop, pulse: noop, setOpacity: noop, dispose: noop,
    };
    if (!T || !renderer || typeof renderer.getContext !== "function") return flow;

    // Tunables. The page may change them at any time.
    const P = flow.params = Object.assign({
      speed: 0.5,                // inflow, in lengths of the grid's longer side per second
      // pressure: one multigrid V-cycle a step
      preSmooth: mobile ? 1 : 2, postSmooth: 2, // weighted Jacobi sweeps on the finest grid
      coarseSmooth: 1,           // sweeps each way on the coarser grids
      coarsest: 10,              // sweeps on the coarsest
      omega: 0.8,
      vcycles: 1,
      corr: 1,                   // weight of the coarse-grid correction
      pressureKeep: 0.98,        // warm start of the pressure solve
      confinement: 0.5,          // vorticity confinement
      wallConfinement: 1,        // how much less of it in the cells touching the body (0..1)
      viscosity: 8,              // cells^2/s: large vortices live, grid-scale noise dies
      velMacCormack: 1,          // 1 = MacCormack velocity advection, 0 = plain semi-Lagrangian
      wakeFrom: 0.8, wakeTo: 3, wakeRate: 0.8, // air held back this long (s) by the wake relaxes to the free stream (1/s)
      relaxFrom: 0.85, relaxTo: 1.02, relax: 0.6, // and all air near the outflow
      wobble: 0.07,              // inflow angle swing (radians) at crossFlow = 1
      sponge: 2.5,               // inlet cells held at the inflow
      open: 1,                   // top and bottom: open air (1) or free-slip walls (0)
      maskLo: 0.05, maskHi: 0.3, // coverage -> solid
      // jets (stir) and blasts (pulse)
      stirGain: 0.35,            // cursor motion -> jet speed
      stirRadius: 0.03,          // of the grid's longer side
      stirMax: 2.2,              // fastest jet, x the inflow
      stirGrip: 0.6,             // share of the gap to the jet speed closed per step
      stirHeat: 0.7,             // heat of an engine's jet (a stir held in place), unless the call says
      rotorWash: 0.9,            // a rotor's wash speed at power 1, x the inflow
      rotorGrip: 0.2,            // share of the gap to the wash speed closed per 60 Hz step
      rotorThick: 0.012,         // half-thickness of the band the disc drives, of the grid's longer side
      blastSpeed: 0.8,           // ring speed, screen heights per second
      blastPush: 1.6,            // ring's peak speed, x its own speed, at power 1
      blastLife: 1.4,            // s
      blastDecay: 0.6,           // s
      blastWidth: 0.03,          // front half-width, of the screen height (it widens as it goes)
      blastPuff: 0.06,           // radius of the gas puff at power 1, of the screen height
      blastPuffTime: 0.09,       // s
      flash: 1,                  // heat at the blast's origin at power 1
      flashRadius: 0.018,        // of the screen height
      cool: 0.22,                // s for heat to fall by e
      // the look
      streakPx: 11,              // CSS px between smoke streaks at the inlet
      streakWidth: 0.11,         // streak half-width, fraction of the spacing
      gain: 0.75,                // overall brightness of the smoke
      haze: 0.03,                // faint smoke between the streaks
      fadeHeld: 2.2,             // s held back by the wake for the smoke to fade by e ...
      fadeFloor: 0.12,           // ... down to this
      fadeMix: 2.5,              // mixing that halves the smoke
      mixGain: 0.14,             // mixing recorded per streak period of smear
      mixWiden: 0.12,            // streak widening per unit of mixing (periods)
      speedMid: 0.44,            // colormap value at the inflow speed (cyan-green)
      speedTop: 0.94,            // colormap value at speedTopU
      speedTopU: 1.8,            // speed (in units of the inflow) shown as the top of the scale
      speedGamma: 0.75,          // lifts the slow end of the scale
      contour: 0.18, banding: 0.22,
      rim: 0.3,
      heatGain: 1.3, ringGlow: 0.22, flashWhite: 0.6,
      ageMax: 40, mixMax: 6,
    }, opts.params || {});

    const gl = renderer.getContext();

    // ---- scene for the passes
    const triGeo = new T.BufferGeometry();
    triGeo.setAttribute("position", new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const passScene = new T.Scene();
    const passCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new T.Mesh(triGeo);
    quad.frustumCulled = false;
    passScene.add(quad);
    passScene.matrixWorldAutoUpdate = false;

    const materials = [];
    const openU = { value: 1 };
    let rtz = false;            // this GPU truncates half-float writes (the probe in testSupport)
    function mat(frag, uniforms, exact) {
      const m = new T.RawShaderMaterial({
        glslVersion: T.GLSL3,
        vertexShader: VERT,
        fragmentShader: frag + ftail(rtz && !exact),
        uniforms: Object.assign({ uRes: { value: new T.Vector2(1, 1) }, uOpen: openU }, uniforms),
        depthTest: false,
        depthWrite: false,
        blending: T.NoBlending,
      });
      materials.push(m);
      return m;
    }

    function rtOptions(type, format, filter) {
      return {
        type, format,
        minFilter: filter, magFilter: filter,
        wrapS: T.ClampToEdgeWrapping, wrapT: T.ClampToEdgeWrapping,
        depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
      };
    }
    const halfRT = (w, h, format) => new T.WebGLRenderTarget(w, h, rtOptions(T.HalfFloatType, format, T.LinearFilter));
    const byteRT = (w, h, filter) => new T.WebGLRenderTarget(w, h, rtOptions(T.UnsignedByteType, T.RGBAFormat, filter || T.LinearFilter));

    // ---- renderer state, saved around everything this module draws
    const saved = { rt: null, face: 0, mip: 0, autoClear: true, infoReset: true, vp: new T.Vector4(), tmp: new T.Vector4() };
    function begin() {
      saved.rt = renderer.getRenderTarget();
      saved.face = renderer.getActiveCubeFace();
      saved.mip = renderer.getActiveMipmapLevel();
      saved.autoClear = renderer.autoClear;
      saved.infoReset = renderer.info.autoReset;
      renderer.getCurrentViewport(saved.vp);
      renderer.autoClear = false;
      renderer.info.autoReset = false;
    }
    function end() {
      renderer.setRenderTarget(saved.rt, saved.face, saved.mip);
      // a viewport the page set with setViewport() while its own target was
      // bound: binding the target again brought back the target's own
      if (!renderer.getCurrentViewport(saved.tmp).equals(saved.vp)) {
        renderer.getViewport(saved.tmp);
        renderer.setViewport(saved.tmp);
        if (!renderer.getCurrentViewport(saved.tmp).equals(saved.vp) && renderer.state) renderer.state.viewport(saved.vp);
      }
      renderer.autoClear = saved.autoClear;
      renderer.info.autoReset = saved.infoReset;
      saved.rt = null;
    }
    const invalidate = mobile && typeof gl.invalidateFramebuffer === "function";
    const ATTACH0 = [gl.COLOR_ATTACHMENT0];
    let passCount = 0;
    function run(m, target) {
      quad.material = m;
      m.uniforms.uRes.value.set(target.width, target.height);
      renderer.setRenderTarget(target);
      // tilers: the old contents are about to be overwritten, never load them
      if (invalidate) gl.invalidateFramebuffer(gl.FRAMEBUFFER, ATTACH0);
      renderer.render(passScene, passCam);
      passCount++;
    }

    // ---- can we render to and filter half floats?
    let fmtRG = T.RGFormat, fmtR = T.RedFormat;
    function testSupport() {
      if (!renderer.capabilities || !renderer.capabilities.isWebGL2) return false;
      const ext = renderer.extensions;
      if (!ext.has("EXT_color_buffer_float") && !ext.has("EXT_color_buffer_half_float")) return false;
      const a = halfRT(2, 1, T.RGBAFormat);
      const b = byteRT(1, 1, T.NearestFilter);
      const mw = mat(FRAG_TEST_WRITE, {}, true);
      const mr = mat(FRAG_TEST_READ, { uSrc: { value: a.texture } }, true);
      const complete = (rt) => {
        renderer.setRenderTarget(rt);
        return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      };
      let ok = false;
      begin();
      try {
        if (complete(a)) {
          run(mw, a);
          run(mr, b);
          const px = new Uint8Array(4);
          renderer.readRenderTargetPixels(b, 0, 0, 1, 1, px);
          ok = Math.abs(px[0] - 128) <= 4 && Math.abs(px[1] - 128) <= 4;
          rtz = px[2] < 128;
        }
        if (ok) {
          const rg = halfRT(1, 1, T.RGFormat);
          if (!complete(rg)) fmtRG = T.RGBAFormat;
          rg.dispose();
          const r = halfRT(1, 1, T.RedFormat);
          if (!complete(r)) fmtR = T.RGBAFormat;
          r.dispose();
        }
      } catch (e) {
        ok = false;
      }
      end();
      a.dispose(); b.dispose();
      mw.dispose(); mr.dispose();
      materials.length = 0;
      while (gl.getError() !== gl.NO_ERROR) { /* drop errors from the probe */ }
      return ok;
    }

    let supported = false;
    try { supported = testSupport(); } catch (e) { supported = false; }

    if (!supported) {
      // Safe stand-ins, so a page that forgets to check never throws.
      flow.mask = byteRT(1, 1);
      flow.display = new T.Mesh(triGeo, new T.MeshBasicMaterial({ visible: false }));
      flow.display.visible = false;
      flow.display.frustumCulled = false;
      flow.dispose = function () { flow.mask.dispose(); triGeo.dispose(); flow.display.material.dispose(); };
      return flow;
    }
    flow.supported = true;
    flow.stats.roundFix = rtz;

    // ---- materials
    const blastA = [], blastB = [];
    for (let i = 0; i < MAX_BLASTS; i++) { blastA.push(new T.Vector4()); blastB.push(new T.Vector4(1, 0, 0, 0)); }
    const blastU = () => ({ uBlastN: { value: 0 }, uBlastA: { value: blastA }, uBlastB: { value: blastB } });
    const mObstacle = mat(FRAG_OBSTACLE, {
      uMask: { value: null }, uPrev: { value: null }, uMaskTexel: { value: new T.Vector2() }, uThresh: { value: new T.Vector2() }, uFloor: { value: -1 },
    }, true);
    const stirA = [], stirB = [];
    for (let i = 0; i < MAX_STIRS; i++) { stirA.push(new T.Vector4()); stirB.push(new T.Vector4()); }
    const rotA = [], rotB = [];
    for (let i = 0; i < MAX_ROTORS; i++) { rotA.push(new T.Vector4()); rotB.push(new T.Vector4()); }
    let rotorN = 0;
    const mAdvect = mat(FRAG_ADVECT, { uVel: { value: null }, uDt: { value: 0 }, uInflow: { value: new T.Vector2() } });
    const mAdvectCorrect = mat(FRAG_ADVECT_CORRECT, {
      uVel: { value: null }, uHat: { value: null }, uObs: { value: null }, uDt: { value: 0 },
      uMacCormack: { value: 1 }, uInflow: { value: new T.Vector2() }, uSponge: { value: 2 },
      uRelax: { value: new T.Vector3() }, uDye: { value: null }, uWake: { value: new T.Vector4(1, 2, 0, 1) }, uMaxSpeed: { value: 1 },
      uStirN: { value: 0 }, uStirA: { value: stirA }, uStirB: { value: stirB },
      uRotN: { value: 0 }, uRotA: { value: rotA }, uRotB: { value: rotB },
    });
    const mCurl = mat(FRAG_CURL, { uVel: { value: null } });
    const mConfine = mat(FRAG_CONFINE, {
      uVel: { value: null }, uCurl: { value: null }, uObs: { value: null },
      uDt: { value: 0 }, uEps: { value: 0 }, uWall: { value: 0 }, uNu: { value: 0 }, uMaxSpeed: { value: 1 },
    });
    const srcU = [];
    for (let i = 0; i < MAX_BLASTS; i++) srcU.push(new T.Vector4());
    const mDivergence = mat(FRAG_DIVERGENCE, {
      uVel: { value: null }, uObs: { value: null }, uP: { value: null },
      uInflow: { value: new T.Vector2() }, uKeep: { value: 1 }, uSrcN: { value: 0 }, uSrc: { value: srcU },
    });
    const mSmooth = mat(FRAG_SMOOTH, { uP: { value: null }, uB: { value: new T.Vector2() }, uOmega: { value: 0.8 } });
    const mRestrict = mat(FRAG_RESTRICT, { uP: { value: null }, uB: { value: new T.Vector2() }, uBF: { value: new T.Vector2() }, uOmega: { value: 0.8 } });
    const mProlong = mat(FRAG_PROLONG, { uP: { value: null }, uE: { value: null }, uB: { value: new T.Vector2() }, uBC: { value: new T.Vector2() },
      uOmega: { value: 0.8 }, uCorr: { value: 1 } });
    const mGradient = mat(FRAG_GRADIENT, {
      uP: { value: null }, uVel: { value: null }, uInflow: { value: new T.Vector2() }, uMaxSpeed: { value: 1 },
    });
    const heatU = [];
    for (let i = 0; i < MAX_HEAT; i++) heatU.push(new T.Vector4());
    const mPredict = mat(FRAG_DYE_PREDICT, Object.assign(blastU(), {
      uDye: { value: null }, uVel: { value: null }, uObs: { value: null },
      uVelRes: { value: new T.Vector2() }, uDt: { value: 0 }, uAgeMax: { value: 40 },
      uFill: { value: new T.Vector4() }, uCool: { value: 1 }, uHeatN: { value: 0 }, uHeat: { value: heatU }, uAgeU: { value: 1 },
    }));
    const mCorrect = mat(FRAG_DYE_CORRECT, Object.assign(blastU(), {
      uDye: { value: null }, uHat: { value: null }, uVel: { value: null }, uObs: { value: null },
      uVelRes: { value: new T.Vector2() }, uDt: { value: 0 }, uAgeMax: { value: 40 },
      uMixGain: { value: 0 }, uMixMax: { value: 6 },
    }));
    const mInit = mat(FRAG_INIT, { uMode: { value: 0 }, uInflow: { value: new T.Vector2() }, uAgeScale: { value: 1 } });
    const mCopy = mat(FRAG_COPY, { uSrc: { value: null }, uScale: { value: new T.Vector4(1, 1, 1, 1) } });

    const du = Object.assign(blastU(), {
      uDye: { value: null }, uVel: { value: null }, uObs: { value: null },
      uVelRes: { value: new T.Vector2(1, 1) }, uDyeRes: { value: new T.Vector2(2, 2) },
      uU: { value: 1 }, uOpacity: { value: 1 }, uPR: { value: 1 },
      uBand: { value: new T.Vector2(0.25, 0.75) }, uPeriod: { value: 0.0125 },
      uWidth: { value: P.streakWidth }, uGain: { value: P.gain }, uHaze: { value: P.haze },
      uMixWiden: { value: P.mixWiden }, uFade: { value: new T.Vector3(P.fadeHeld, P.fadeFloor, P.fadeMix) },
      uSpeedMap: { value: new T.Vector4(P.speedMid, P.speedTop, P.speedTopU, P.speedGamma) },
      uContour: { value: P.contour }, uBanding: { value: P.banding }, uRim: { value: P.rim },
      uHeatLook: { value: new T.Vector3(P.heatGain, P.ringGlow, P.flashWhite) },
      uDev: { value: new T.Vector4(0.75, 0.22, 0.12, 0.45) }, uCalm: { value: 0.9 },
    });
    const displayMat = new T.RawShaderMaterial({
      glslVersion: T.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG_DISPLAY,
      uniforms: du,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: T.NormalBlending,
    });
    const display = new T.Mesh(triGeo, displayMat);
    display.frustumCulled = false;
    display.renderOrder = -10;
    display.name = "ProFlow.display";
    display.matrixAutoUpdate = false;
    flow.display = display;

    // ---- fields
    const mask = byteRT(2, 2);
    mask.texture.name = "ProFlow.mask";
    flow.mask = mask;
    let W = 0, H = 0, DW = 0, DH = 0, cssW = 0, cssH = 0, cellPx = 1;
    let vel = null, curl = null, pres = null, obs = null, obsPrev = null, dye = null;
    // multigrid levels: lv[0] is the pressure itself (pres), lv[1..] the corrections
    let lv = [];
    let needInit = false;
    let opacity = 1;
    let simTime = 0, acc = 0, lastDt = 1 / 60;
    let lastInflow = 1, lastCross = 0.5;
    const inflowVec = new T.Vector2();
    const bandNow = new T.Vector2(0.25, 0.75);
    let floorNow = -1;          // the floor line, a fraction of the height from the bottom (< 0: none)
    let stirN = 0, heatN = 0;
    // where the jets of this step and the last one were (cells), to tell engines from cursors
    const prevX = new Float32Array(MAX_STIRS), prevY = new Float32Array(MAX_STIRS), curX = new Float32Array(MAX_STIRS), curY = new Float32Array(MAX_STIRS);
    let prevN = 0, curN = 0;
    // blasts alive: origin (cells), start time, power
    const blasts = [];
    for (let i = 0; i < MAX_BLASTS; i++) blasts.push({ on: false, x: 0, y: 0, t0: 0, p: 0 });

    function gridFor(w, h) {
      const aspect = w / h;
      let gw, gh, cap;
      if (mobile) { gw = aspect > 1 ? 192 : 128; cap = 288; }
      else { gw = 256; cap = 200; }
      gh = gw / aspect;
      if (gh > cap) { gw = gw * cap / gh; gh = cap; }
      // multiples of 8, so the multigrid levels line up with the edges
      const r8 = (v) => Math.max(16, 8 * Math.round(v / 8));
      return [r8(gw), r8(gh)];
    }
    function baseU() { return P.speed * Math.max(W, H); }

    function allocate(nw, nh) {
      const old = vel ? { vel, pres, dye, curl, obs, obsPrev, cellPx, lv } : null;
      W = nw; H = nh; DW = nw * 2; DH = nh * 2;
      vel = [halfRT(W, H, fmtRG), halfRT(W, H, fmtRG), halfRT(W, H, fmtRG)];
      curl = halfRT(W, H, fmtR);
      pres = [halfRT(W, H, T.RGBAFormat), halfRT(W, H, T.RGBAFormat)];
      obs = byteRT(W, H);
      obsPrev = byteRT(W, H);
      dye = [halfRT(DW, DH, T.RGBAFormat), halfRT(DW, DH, T.RGBAFormat), halfRT(DW, DH, T.RGBAFormat)];
      // levels down to a few cells; each knows where the screen's edges fall in its cells
      lv = [{ rt: pres, i: 0, w: W, h: H, bx: W, by: H }];
      let bx = W, by = H;
      while (Math.min(bx, by) > 6 && lv.length < 9) {
        bx /= 2; by /= 2;
        const w = Math.ceil(bx), h = Math.ceil(by);
        lv.push({ rt: [halfRT(w, h, T.RGBAFormat), halfRT(w, h, T.RGBAFormat)], i: 0, w, h, bx, by });
      }
      mask.setSize(W * 2, H * 2);
      cellPx = cssW / W;
      begin();
      // no body until the page draws one; pressure starts at rest
      mInit.uniforms.uMode.value = 2;
      if (!old) { run(mInit, obs); run(mInit, obsPrev); }
      run(mInit, pres[0]);
      run(mInit, pres[1]);
      for (let l = 1; l < lv.length; l++) { run(mInit, lv[l].rt[0]); run(mInit, lv[l].rt[1]); }
      if (old) {
        // carry the running flow over to the new grid: the speed in screen
        // pixels stays the same, the cells changed size
        const k = old.cellPx / cellPx;
        mCopy.uniforms.uSrc.value = old.vel[0].texture;
        mCopy.uniforms.uScale.value.set(isFinite(k) && k > 0 ? k : 1, isFinite(k) && k > 0 ? k : 1, 1, 1);
        run(mCopy, vel[0]);
        mCopy.uniforms.uSrc.value = old.dye[0].texture;
        mCopy.uniforms.uScale.value.set(1, 1, 1, 1);
        run(mCopy, dye[0]);
        // and the body, until the next step redraws it from the mask
        mCopy.uniforms.uSrc.value = old.obs.texture;
        run(mCopy, obs);
        run(mCopy, obsPrev);
        mCopy.uniforms.uSrc.value = null;
        old.obs.dispose();
        old.obsPrev.dispose();
        old.vel.forEach((r) => r.dispose());
        old.pres.forEach((r) => r.dispose());
        old.dye.forEach((r) => r.dispose());
        old.curl.dispose();
        for (let l = 1; l < old.lv.length; l++) old.lv[l].rt.forEach((r) => r.dispose());
      } else {
        initFields();
      }
      end();
      flow.stats.gridW = W; flow.stats.gridH = H;
      flow.stats.dyeW = DW; flow.stats.dyeH = DH;
      flow.stats.maskW = W * 2; flow.stats.maskH = H * 2;
      flow.stats.levels = lv.length;
      bindDisplay();
    }

    function initFields() {
      const U = baseU() * lastInflow;
      mInit.uniforms.uMode.value = 0;
      mInit.uniforms.uInflow.value.set(U, 0);
      run(mInit, vel[0]);
      mInit.uniforms.uMode.value = 1;
      mInit.uniforms.uAgeScale.value = W / Math.max(U, 1e-3);
      run(mInit, dye[0]);
      mInit.uniforms.uMode.value = 2;
      run(mInit, pres[0]);
      run(mInit, pres[1]);
      for (let l = 1; l < lv.length; l++) { run(mInit, lv[l].rt[0]); run(mInit, lv[l].rt[1]); }
      for (let i = 0; i < MAX_BLASTS; i++) blasts[i].on = false;
    }

    function bindDisplay() {
      du.uDye.value = dye[0].texture;
      du.uVel.value = vel[0].texture;
      du.uObs.value = obs.texture;
      du.uVelRes.value.set(W, H);
      du.uDyeRes.value.set(DW, DH);
    }

    function streakPeriod() {
      // a whole number of streaks across the band, about streakPx apart
      const span = Math.max(0.01, bandNow.y - bandNow.x);
      const per = Math.max(2, P.streakPx) / Math.max(1, cssH);
      return span / Math.max(3, Math.round(span / per));
    }

    function updateDisplayUniforms() {
      const U = Math.max(baseU() * lastInflow, 1e-3 * baseU() + 1e-6);
      du.uU.value = U;
      du.uOpacity.value = opacity;
      du.uWidth.value = P.streakWidth;
      du.uGain.value = P.gain;
      du.uHaze.value = P.haze;
      du.uMixWiden.value = P.mixWiden;
      du.uFade.value.set(Math.max(0.05, P.fadeHeld), P.fadeFloor, Math.max(0.05, P.fadeMix));
      du.uSpeedMap.value.set(P.speedMid, P.speedTop, P.speedTopU, P.speedGamma);
      du.uContour.value = P.contour;
      du.uBanding.value = P.banding;
      du.uRim.value = P.rim;
      du.uHeatLook.value.set(P.heatGain, P.ringGlow, P.flashWhite);
      du.uBand.value.copy(bandNow);
      du.uPeriod.value = streakPeriod();
    }

    // The blast rings alive now -> uniforms (shared by the dye passes and the
    // display), and the gas puffs of the young ones -> volume sources.
    function updateBlasts(time) {
      const U = Math.max(baseU(), 1);
      const speed = Math.max(1, P.blastSpeed * H);            // cells/s
      let n = 0, ns = 0;
      for (let i = 0; i < MAX_BLASTS; i++) {
        const b = blasts[i];
        if (!b.on) continue;
        const age = time - b.t0;
        if (!(age <= P.blastLife) || age < -1) { b.on = false; continue; }
        if (age < 0) continue;
        const R = 0.5 + speed * age;
        // the front weakens as it spreads and as it ages, and widens
        const amp = P.blastPush * speed * b.p * Math.exp(-age / Math.max(0.05, P.blastDecay)) / Math.sqrt(1 + R / (0.25 * H))
          * Math.min(1, age / 0.04 + 0.2) * Math.min(1, (P.blastLife - age) / 0.25);
        const width = Math.max(1.2, P.blastWidth * H) * (1 + 0.6 * age);
        blastA[n].set(b.x, b.y, R, Math.min(amp, 3 * U));
        blastB[n].set(width, 0, 0, 0);
        n++;
        // the puff: gas from the blast, a source of volume for a moment
        if (age < P.blastPuffTime && ns < MAX_BLASTS) {
          const r = Math.max(1.5, 0.35 * P.blastPuff * H);
          const area = Math.PI * Math.pow(P.blastPuff * H, 2) * b.p;          // cells^2 at the end
          const rate = area / Math.max(0.02, P.blastPuffTime);                  // cells^2/s
          srcU[ns].set(b.x, b.y, 1 / (r * r), Math.min(rate / (Math.PI * r * r), 40 * U / r));
          ns++;
        }
      }
      mPredict.uniforms.uBlastN.value = n;
      mCorrect.uniforms.uBlastN.value = n;
      du.uBlastN.value = n;
      mDivergence.uniforms.uSrcN.value = ns;
      flow.stats.blasts = n;
    }

    function smoothAt(L, sweeps) {
      mSmooth.uniforms.uB.value.set(L.bx, L.by);
      for (let k = 0; k < sweeps; k++) {
        mSmooth.uniforms.uP.value = L.rt[L.i].texture;
        run(mSmooth, L.rt[1 - L.i]);
        L.i = 1 - L.i;
      }
    }
    // One V-cycle on lv[0] (which holds the warm pressure, the divergence and
    // the solid fraction).
    function vcycle() {
      const nl = lv.length, om = Math.max(0.3, Math.min(1, P.omega));
      mSmooth.uniforms.uOmega.value = om;
      mRestrict.uniforms.uOmega.value = om;
      mProlong.uniforms.uOmega.value = om;
      mProlong.uniforms.uCorr.value = Math.max(0, Math.min(1.5, P.corr));
      const pre = Math.max(0, Math.round(P.preSmooth)), post = Math.max(1, Math.round(P.postSmooth));
      const cs = Math.max(1, Math.round(P.coarseSmooth)), cn = Math.max(1, Math.round(P.coarsest));
      if (nl < 2) { smoothAt(lv[0], pre + post + cn); return; }
      smoothAt(lv[0], pre);
      for (let l = 1; l < nl; l++) {
        mRestrict.uniforms.uP.value = lv[l - 1].rt[lv[l - 1].i].texture;
        mRestrict.uniforms.uB.value.set(lv[l].bx, lv[l].by);
        mRestrict.uniforms.uBF.value.set(lv[l - 1].bx, lv[l - 1].by);
        run(mRestrict, lv[l].rt[0]);
        lv[l].i = 0;
        smoothAt(lv[l], (l === nl - 1 ? cn : cs) - 1);
      }
      for (let l = nl - 2; l >= 0; l--) {
        const L = lv[l], C = lv[l + 1];
        mProlong.uniforms.uP.value = L.rt[L.i].texture;
        mProlong.uniforms.uE.value = C.rt[C.i].texture;
        mProlong.uniforms.uB.value.set(L.bx, L.by);
        mProlong.uniforms.uBC.value.set(C.bx, C.by);
        run(mProlong, L.rt[1 - L.i]);
        L.i = 1 - L.i;
        smoothAt(L, (l === 0 ? post : cs) - 1);
      }
    }

    // ---- one step of the solver
    function simulate(h, time, inflowK, cross) {
      const U = baseU() * inflowK;
      const ang = P.wobble * cross * (0.65 * Math.sin(time * 0.53) + 0.35 * Math.sin(time * 1.37 + 1.1));
      const spd = U * (1 + 0.025 * cross * Math.sin(time * 0.71 + 0.4));
      inflowVec.set(spd * Math.cos(ang), spd * Math.sin(ang));
      const maxSpeed = 4 * Math.max(baseU(), 1);
      openU.value = P.open ? 1 : 0;
      updateBlasts(time);

      // obstacle from the page mask
      mObstacle.uniforms.uMask.value = mask.texture;
      mObstacle.uniforms.uMaskTexel.value.set(1 / mask.width, 1 / mask.height);
      mObstacle.uniforms.uThresh.value.set(P.maskLo, Math.max(P.maskLo + 0.01, P.maskHi));
      { const t = obsPrev; obsPrev = obs; obs = t; }
      mObstacle.uniforms.uPrev.value = obsPrev.texture;
      mObstacle.uniforms.uFloor.value = floorNow >= 0 ? floorNow * H : -1;
      run(mObstacle, obs);

      // advect: predict into vel[1], correct (+ jets, inflow, walls, body) into vel[2]
      mAdvect.uniforms.uVel.value = vel[0].texture;
      mAdvect.uniforms.uDt.value = h;
      mAdvect.uniforms.uInflow.value.copy(inflowVec);
      run(mAdvect, vel[1]);
      const ua = mAdvectCorrect.uniforms;
      ua.uVel.value = vel[0].texture;
      ua.uHat.value = vel[1].texture;
      ua.uObs.value = obs.texture;
      ua.uDt.value = h;
      ua.uMacCormack.value = P.velMacCormack;
      ua.uInflow.value.copy(inflowVec);
      ua.uSponge.value = P.sponge;
      ua.uRelax.value.set(P.relaxFrom, Math.max(P.relaxFrom + 0.01, P.relaxTo), Math.max(0, P.relax));
      ua.uDye.value = dye[0].texture;
      ua.uWake.value.set(P.wakeFrom, Math.max(P.wakeFrom + 0.01, P.wakeTo), Math.max(0, P.wakeRate), Math.max(U, 1e-3));
      ua.uMaxSpeed.value = maxSpeed;
      ua.uStirN.value = stirN;
      ua.uRotN.value = rotorN;
      run(mAdvectCorrect, vel[2]);
      stirN = 0;
      rotorN = 0;
      prevX.set(curX); prevY.set(curY); prevN = curN; curN = 0;

      // vorticity confinement and viscosity
      mCurl.uniforms.uVel.value = vel[2].texture;
      run(mCurl, curl);
      const uc = mConfine.uniforms;
      uc.uVel.value = vel[2].texture;
      uc.uCurl.value = curl.texture;
      uc.uObs.value = obs.texture;
      uc.uDt.value = h;
      uc.uEps.value = P.confinement;
      uc.uWall.value = P.wallConfinement;
      uc.uNu.value = Math.min(Math.max(0, P.viscosity) * h, 0.2);
      uc.uMaxSpeed.value = maxSpeed;
      run(mConfine, vel[0]);

      // projection
      const L0 = lv[0];
      const ud = mDivergence.uniforms;
      ud.uVel.value = vel[0].texture;
      ud.uObs.value = obs.texture;
      ud.uP.value = pres[L0.i].texture;
      ud.uInflow.value.copy(inflowVec);
      // the pressure scales with the step: carry it over in proportion
      ud.uKeep.value = P.pressureKeep * Math.min(2, Math.max(0.5, h / lastDt));
      run(mDivergence, pres[1 - L0.i]);
      L0.i = 1 - L0.i;
      for (let c = Math.max(1, Math.min(8, Math.round(P.vcycles))); c > 0; c--) vcycle();
      const ug = mGradient.uniforms;
      ug.uP.value = pres[L0.i].texture;
      ug.uVel.value = vel[0].texture;
      ug.uInflow.value.copy(inflowVec);
      ug.uMaxSpeed.value = maxSpeed;
      run(mGradient, vel[1]);
      { const t = vel[0]; vel[0] = vel[1]; vel[1] = t; }

      // dye: MacCormack on the finer grid, in substeps of at most about a
      // 60 Hz frame on the same velocity field.  Longer steps carry the smoke
      // farther than the round trip of the corrector can follow where the
      // flow turns, and the streaks come out as a sawtooth (30 Hz phones).
      const nsub = Math.max(1, Math.min(3, Math.ceil(h * 60 - 0.05)));
      const hs = h / nsub;
      const up = mPredict.uniforms;
      up.uVel.value = vel[0].texture;
      up.uObs.value = obs.texture;
      up.uVelRes.value.set(W, H);
      up.uDt.value = hs;
      up.uAgeMax.value = P.ageMax;
      // deep inside the body: mid-band, fully mixed smoke a few seconds old
      up.uFill.value.set(0.5 * (bandNow.x + bandNow.y), P.mixMax, 6, 1 - Math.exp(-hs * 3));
      up.uCool.value = Math.exp(-hs / Math.max(0.05, P.cool));
      up.uAgeU.value = Math.max(U, 1e-3);
      const uk = mCorrect.uniforms;
      uk.uVel.value = vel[0].texture;
      uk.uObs.value = obs.texture;
      uk.uVelRes.value.set(W, H);
      uk.uDt.value = hs;
      uk.uAgeMax.value = P.ageMax;
      uk.uMixGain.value = P.mixGain / streakPeriod();
      uk.uMixMax.value = P.mixMax;
      for (let s = 0; s < nsub; s++) {
        // the rings run on between substeps; heat is added once a step
        if (nsub > 1) updateBlasts(time - h + (s + 1) * hs);
        up.uHeatN.value = s === 0 ? heatN : 0;
        up.uDye.value = dye[0].texture;
        run(mPredict, dye[2]);
        uk.uDye.value = dye[0].texture;
        uk.uHat.value = dye[2].texture;
        run(mCorrect, dye[1]);
        const t = dye[0]; dye[0] = dye[1]; dye[1] = t;
      }
      heatN = 0;

      lastDt = h;
      flow.stats.steps++;
    }

    function readParams(params) {
      if (!params) return;
      if (params.inflow !== undefined) lastInflow = Math.max(0, Math.min(3, fin(params.inflow, 1)));
      if (params.crossFlow !== undefined) lastCross = Math.max(0, Math.min(1, fin(params.crossFlow, 0.5)));
      if (params.floor !== undefined) { const f = +params.floor; floorNow = isFinite(f) && f > 0 ? Math.min(0.95, f) : -1; }
      const b = params.band;
      if (b && b.length >= 2) {
        const y0 = Math.max(0, Math.min(1, fin(b[0], 0.25)));
        const y1 = Math.max(0, Math.min(1, fin(b[1], 0.75)));
        bandNow.set(Math.min(y0, y1), Math.max(Math.max(y0, y1), Math.min(y0, y1) + 0.01));
      }
    }

    // ---- public API
    flow.resize = function (w, h, pixelRatio) {
      w = Math.max(1, Math.min(16384, Math.round(+w || 1)));
      h = Math.max(1, Math.min(16384, Math.round(+h || 1)));
      const pr = Math.max(0.25, Math.min(4, +pixelRatio || 1));
      du.uPR.value = pr;
      cssW = w; cssH = h;
      const g = gridFor(w, h);
      if (g[0] !== W || g[1] !== H) allocate(g[0], g[1]);
      cellPx = cssW / W;
      flow.maskPointScale = (W * 2) / cssW;
      updateDisplayUniforms();
    };

    flow.step = function (dt, params) {
      if (!W) return;
      readParams(params);
      dt = +dt;
      if (!(dt > 0) || !isFinite(dt)) dt = 0;
      let time = params && typeof params.time === "number" && isFinite(params.time) ? params.time : simTime + dt;
      // a clock that jumps (a hidden tab, a reset) moves the blasts with it
      if (Math.abs(time - simTime - dt) > 1) {
        const shift = time - simTime - Math.min(dt, 0.25);
        for (let i = 0; i < MAX_BLASTS; i++) blasts[i].t0 += shift;
      }
      simTime = time;
      updateDisplayUniforms();
      if (needInit) { begin(); initFields(); end(); needInit = false; }
      // High refresh rates: step the air at most ~75 times a second.  Steps
      // are at most 1/30 s; what is left over carries into the next (a
      // little: a slow device never piles up a backlog).
      acc += Math.min(dt, 0.25);
      if (acc < 1 / 75) { updateBlasts(time); return; }
      const h = Math.min(acc, 1 / 30);
      acc = Math.min(acc - h, 1 / 60);
      begin();
      passCount = 0;
      simulate(h, time, lastInflow, lastCross);
      flow.stats.passes = passCount;
      end();
      bindDisplay();
    };

    flow.warmup = function (steps, dt) {
      if (!W) return;
      steps = Math.max(0, Math.min(2000, Math.floor(+steps || 0)));
      dt = Math.max(1 / 240, Math.min(1 / 30, +dt || 1 / 60));
      if (needInit) { begin(); initFields(); end(); needInit = false; }
      updateDisplayUniforms();
      begin();
      for (let i = 0; i < steps; i++) {
        simTime += dt;
        passCount = 0;
        simulate(dt, simTime, lastInflow, lastCross);
        flow.stats.passes = passCount;
      }
      end();
      acc = 0;
      bindDisplay();
    };

    // NDC -> velocity-grid cells
    const cellX = (x) => (x * 0.5 + 0.5) * W, cellY = (y) => (y * 0.5 + 0.5) * H;

    function addHeat(cx, cy, r, amount) {
      if (!(amount > 0)) return;
      let i = heatN;
      if (i >= MAX_HEAT) {
        // full: the weakest gives way
        i = 0;
        for (let k = 1; k < MAX_HEAT; k++) if (heatU[k].w < heatU[i].w) i = k;
        if (heatU[i].w >= amount) return;
      } else heatN++;
      heatU[i].set(cx, cy, 1 / (r * r), Math.min(1, amount));
    }

    flow.stir = function (x, y, dx, dy, heat) {
      if (!W) return;
      x = +x; y = +y; dx = +dx || 0; dy = +dy || 0;
      if (!isFinite(x) || !isFinite(y) || !isFinite(dx) || !isFinite(dy)) return;
      if (dx === 0 && dy === 0) return;
      if (Math.abs(x) > 1.5 || Math.abs(y) > 1.5) return;
      // (dx, dy) is the motion since the last call, taken as one 60 Hz frame
      const U = Math.max(baseU(), 1);
      let vx = dx * 0.5 * W * 60 * P.stirGain;
      let vy = dy * 0.5 * H * 60 * P.stirGain;
      const m = Math.hypot(vx, vy), lim = Math.max(0.1, P.stirMax) * U;
      if (!(m > 0)) return;
      if (m > lim) { vx *= lim / m; vy *= lim / m; }
      const r = Math.max(1.5, P.stirRadius * Math.max(W, H));
      const cx = cellX(x), cy = cellY(y), grip = Math.max(0, Math.min(1, P.stirGrip));
      if (stirN >= MAX_STIRS) {
        // full: merge with the nearest (mean place, summed jet, same speed limit)
        let i = 0, best = Infinity;
        for (let k = 0; k < MAX_STIRS; k++) {
          const e = Math.hypot(stirA[k].x - cx, stirA[k].y - cy);
          if (e < best) { best = e; i = k; }
        }
        const a = stirA[i];
        let sx = a.z + vx, sy = a.w + vy;
        const sm = Math.hypot(sx, sy);
        if (sm > lim) { sx *= lim / sm; sy *= lim / sm; }
        a.set((a.x + cx) * 0.5, (a.y + cy) * 0.5, sx, sy);
      } else {
        const i = stirN;
        stirA[i].set(cx, cy, vx, vy);
        stirB[i].set(1 / (r * r), grip, 0, 0);
        stirN++;
      }
      // A jet held at the same place step after step is an engine: it burns
      // hot unless the call says otherwise.  A cursor's stir moves on by its
      // own motion every time, so it never does.
      let hh = +heat;
      if (heat === undefined || !isFinite(hh)) {
        const dm = Math.hypot(dx * 0.5 * W, dy * 0.5 * H);
        let near = Infinity;
        for (let k = 0; k < prevN; k++) near = Math.min(near, Math.hypot(prevX[k] - cx, prevY[k] - cy));
        hh = near < 0.3 * dm ? P.stirHeat : 0;
      }
      if (curN < MAX_STIRS) { curX[curN] = cx; curY[curN] = cy; curN++; }
      hh = Math.max(0, Math.min(1, hh)) * Math.min(1, m / U);
      // the heat leaves the nozzle a little downstream of it, in the jet
      if (hh > 0) addHeat(cx + vx / m * r * 0.6, cy + vy / m * r * 0.6, r * 0.6, hh * 0.5);
    };

    flow.rotor = function (x0, y0, x1, y1, dx, dy, power) {
      if (!W) return;
      x0 = +x0; y0 = +y0; x1 = +x1; y1 = +y1; dx = +dx || 0; dy = +dy || 0;
      if (![x0, y0, x1, y1, dx, dy].every(isFinite)) return;
      if (Math.abs(x0) > 3 || Math.abs(x1) > 3 || Math.abs(y0) > 3 || Math.abs(y1) > 3) return;
      let p = power === undefined ? 1 : +power;
      if (!isFinite(p)) return;
      p = Math.max(0, Math.min(1, p));
      // the shaft direction in cells (the grid is not square in NDC)
      const vx = dx * 0.5 * W, vy = dy * 0.5 * H, m = Math.hypot(vx, vy);
      if (!(m > 0) || p <= 0) return;
      const V = Math.max(0, P.rotorWash) * Math.max(baseU(), 1) * p;
      const ax = cellX(x0), ay = cellY(y0), bx = cellX(x1), by = cellY(y1);
      // the same disc called again before the step ran (a fast screen) replaces itself
      let i = rotorN;
      for (let k = 0; k < rotorN; k++) {
        if (Math.hypot((rotA[k].x + rotA[k].z) * 0.5 - (ax + bx) * 0.5, (rotA[k].y + rotA[k].w) * 0.5 - (ay + by) * 0.5) < 10) { i = k; break; }
      }
      if (i >= MAX_ROTORS) i = MAX_ROTORS - 1;
      rotA[i].set(ax, ay, bx, by);
      rotB[i].set(vx / m * V, vy / m * V, Math.max(0, Math.min(0.99, P.rotorGrip)), Math.max(0.75, P.rotorThick * Math.max(W, H)));
      if (i === rotorN) rotorN++;
    };

    flow.pulse = function (x, y, strength) {
      if (!W) return;
      x = +x; y = +y;
      let s = strength === undefined ? 1 : +strength;
      if (!isFinite(x) || !isFinite(y) || !isFinite(s)) return;
      if (Math.abs(x) > 1.5 || Math.abs(y) > 1.5) return;
      s = Math.min(3, Math.abs(s));
      if (s < 0.01) return;
      const cx = cellX(x), cy = cellY(y);
      // a free slot, or the oldest gives way
      let i = 0, oldest = Infinity;
      for (let k = 0; k < MAX_BLASTS; k++) {
        if (!blasts[k].on) { i = k; oldest = -Infinity; break; }
        if (blasts[k].t0 < oldest) { oldest = blasts[k].t0; i = k; }
      }
      const b = blasts[i];
      b.on = true; b.x = cx; b.y = cy; b.t0 = simTime; b.p = s;
      addHeat(cx, cy, Math.max(1.2, P.flashRadius * H * Math.sqrt(s)), P.flash * Math.min(1, s));
    };

    flow.setOpacity = function (a) {
      a = +a;
      opacity = isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
      du.uOpacity.value = opacity;
      display.visible = opacity > 0.002;
    };

    function onRestored() { needInit = true; }
    const canvas = renderer.domElement;
    if (canvas && canvas.addEventListener) canvas.addEventListener("webglcontextrestored", onRestored);

    flow.dispose = function () {
      if (display.parent) display.parent.remove(display);
      if (canvas && canvas.removeEventListener) canvas.removeEventListener("webglcontextrestored", onRestored);
      [vel && vel[0], vel && vel[1], vel && vel[2], curl, pres && pres[0], pres && pres[1], obs, obsPrev,
        dye && dye[0], dye && dye[1], dye && dye[2], mask].forEach((r) => { if (r) r.dispose(); });
      for (let l = 1; l < lv.length; l++) lv[l].rt.forEach((r) => r.dispose());
      lv = [];
      materials.forEach((m) => m.dispose());
      displayMat.dispose();
      triGeo.dispose();
      W = H = 0;
      flow.supported = false;
    };

    // Internals for the lab page only.
    flow._debug = function () {
      return { vel: vel && vel[0].texture, dye: dye && dye[0].texture, obs: obs && obs.texture,
        pres: pres && lv[0] && pres[lv[0].i].texture, curl: curl && curl.texture, U: baseU() * lastInflow, W, H, DW, DH,
        levels: lv.map((L) => L.w + "x" + L.h) };
    };

    // the pressure passes per step (smoothing, restriction, prolongation)
    Object.defineProperty(flow.stats, "iterations", {
      get: () => {
        const nl = lv.length || 1, pre = Math.max(0, Math.round(P.preSmooth)), post = Math.max(1, Math.round(P.postSmooth));
        const cs = Math.max(1, Math.round(P.coarseSmooth)), cn = Math.max(1, Math.round(P.coarsest));
        // (the prolongation onto a level does its first smoothing sweep)
        if (nl < 2) return pre + post + cn;
        return pre + (post - 1) + (nl - 1) * 2 + Math.max(0, nl - 2) * 2 * (cs - 1) + (cn - 1);
      },
      enumerable: true,
    });
    return flow;
  }

  window.ProFlow = { create, version: 2 };
})();

/* =========================================================
   Pro Mode — one particle cloud, many scales.
   A single cloud of points flows from shape to shape as you
   scroll: qubit lattice -> Bloch sphere -> electron orbital ->
   silica network -> mantle -> Earth -> solar system -> galaxy -> π.
   Every particle survives every transition; nothing fades and
   swaps. Colours follow a simulation-style colormap.
   ========================================================= */
(function () {
  "use strict";

  if (!window.THREE || !window.gsap || !window.ScrollTrigger) {
    document.body.classList.add("home-fallback");
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  const isMobile =
    window.matchMedia("(max-width: 720px)").matches ||
    window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  if (isMobile) {
    // Keep iOS Safari from refreshing ScrollTrigger every time its address
    // bar collapses — a source of mid-scroll hitches.
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    document.body.classList.add("home-fallback");
    return;
  }

  const canvas = document.getElementById("home-canvas");
  if (!canvas) return;

  // ----- Smooth scrolling (desktop wheel/trackpad only) -----
  // Lenis leaves touch scrolling native, so phones keep their own momentum.
  let lenis = null;
  if (window.Lenis && !isMobile) {
    lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // ----- Renderer / scene / camera -----
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  const PR = isMobile ? 1 : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(PR);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 0, 6.5);

  // ====================================================
  // Small helpers
  // ====================================================
  const TAU = Math.PI * 2;
  const rand = Math.random;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  function onSphere(r) {
    const u = rand() * 2 - 1, th = rand() * TAU, s = Math.sqrt(1 - u * u);
    return [r * s * Math.cos(th), r * u, r * s * Math.sin(th)];
  }
  function gauss() {
    return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(TAU * rand());
  }
  // Cheap 3D value noise for the continents.
  function hash3(x, y, z) {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
    return lerp(
      lerp(lerp(c(0,0,0), c(1,0,0), u), lerp(c(0,1,0), c(1,1,0), u), v),
      lerp(lerp(c(0,0,1), c(1,0,1), u), lerp(c(0,1,1), c(1,1,1), u), v), w);
  }
  function fbm(x, y, z) {
    let s = 0, a = 0.5;
    for (let i = 0; i < 5; i++) { s += a * vnoise(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
    return s;
  }

  // ====================================================
  // SHAPES — each fills exactly N particles.
  // pos: xyz.  field: heat (0..1 on the colormap), tint (0 = white,
  // 1 = full colormap), spin (how much the point turns with the
  // slow rotation), alpha.
  // ====================================================
  const N = isMobile ? 18000 : 64000;
  // Extra "time" the planet's interior has been stirred by (cursor motion and
  // clicks speed the convection up), and the decaying click surge behind it.
  let flowClock = 0, flowSurge = 0;

  // `aux` floats per particle can be stored for shapes that keep moving
  // after they form (see the `animate` hooks below).
  function makeShape(tilt, fill, aux = 0) {
    const pos = new Float32Array(N * 3);
    const field = new Float32Array(N * 4);
    const ax = new Float32Array(N * Math.max(aux, 1));
    let i = 0;
    function add(p, heat, tint, spin, alpha, extra) {
      if (i >= N) return false;
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      field[i * 4] = heat; field[i * 4 + 1] = tint; field[i * 4 + 2] = spin; field[i * 4 + 3] = alpha;
      if (extra) for (let q = 0; q < aux; q++) ax[i * aux + q] = extra[q];
      i++;
      return true;
    }
    fill(add, () => N - i);
    // Anything a generator left over joins the last real point, so no
    // particle sits at the origin.
    const last = Math.max(0, i - 1);
    while (i < N) {
      add([pos[last * 3] + gauss() * 0.02, pos[last * 3 + 1] + gauss() * 0.02, pos[last * 3 + 2] + gauss() * 0.02],
          field[last * 4], field[last * 4 + 1], field[last * 4 + 2], field[last * 4 + 3],
          aux ? Array.from(ax.subarray(last * aux, last * aux + aux)) : null);
    }
    // Order particles left-to-right (with a diagonal bias) so that, during a
    // morph, neighbours travel together and the cloud reads as one flow.
    const idx = new Array(N);
    const key = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      idx[k] = k;
      key[k] = pos[k * 3] + 0.35 * pos[k * 3 + 1] + (rand() - 0.5) * 0.6;
    }
    idx.sort((a, b) => key[a] - key[b]);
    const p2 = new Float32Array(N * 3), f2 = new Float32Array(N * 4), a2 = new Float32Array(N * Math.max(aux, 1));
    for (let k = 0; k < N; k++) {
      const j = idx[k];
      p2[k * 3] = pos[j * 3]; p2[k * 3 + 1] = pos[j * 3 + 1]; p2[k * 3 + 2] = pos[j * 3 + 2];
      f2[k * 4] = field[j * 4]; f2[k * 4 + 1] = field[j * 4 + 1]; f2[k * 4 + 2] = field[j * 4 + 2]; f2[k * 4 + 3] = field[j * 4 + 3];
      for (let q = 0; q < aux; q++) a2[k * aux + q] = ax[j * aux + q];
    }
    return { pos: p2, field: f2, aux: a2, tilt, animate: null };
  }

  // 1) Qubit lattice: 9×6 grid of qubits joined by couplers.
  //    Alive at rest: every qubit spins and Rabi-oscillates between |0⟩ (blue)
  //    and |1⟩ (red), a ripple runs through the chip, and gate pulses sweep
  //    across the couplers while current streams along them.
  //    aux: [kind (0 qubit, 1 coupler), site/edge index, ox, oy, oz, t0]
  function shapeLattice() {
    const COLS = 9, ROWS = 6, SP = 0.56;
    const sites = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        sites.push({
          x: (c - (COLS - 1) / 2) * SP, y: (r - (ROWS - 1) / 2) * SP, h: 0.15 + rand() * 0.8,
          w: 1.2 + rand() * 2.4, rabi: 0.7 + rand() * 1.6, ph: rand() * TAU,
          ax: onSphere(1), z: 0, heat: 0,
        });
    const edges = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const a = r * COLS + c;
        if (c < COLS - 1) edges.push([a, a + 1]);
        if (r < ROWS - 1) edges.push([a, a + COLS]);
      }
    const shape = makeShape(-0.35, (add, left) => {
      const nodePts = Math.floor(left() * 0.62);
      for (let k = 0; k < nodePts; k++) {
        const si = k % sites.length, s = sites[si];
        const p = onSphere(0.085 + rand() * 0.025);
        add([s.x + p[0], s.y + p[1], p[2]], s.h, 0.95, 0, 1, [0, si, p[0], p[1], p[2], 0]);
      }
      while (left() > 0) {
        const ei = Math.floor(rand() * edges.length), e = edges[ei];
        const t = 0.2 + rand() * 0.6;
        const a = sites[e[0]], b = sites[e[1]];
        const j = [gauss() * 0.006, gauss() * 0.006, gauss() * 0.006];
        add([lerp(a.x, b.x, t) + j[0], lerp(a.y, b.y, t) + j[1], j[2]], 0, 0, 0, 0.55, [1, ei, j[0], j[1], j[2], t]);
      }
    }, 6);
    shape.animate = (t, P, F) => {
      // Gate pulse: a bright front crossing the chip every few seconds.
      const front = ((t * 0.55) % 3.2) * 2.4 - 3.4;
      const burst = (t - pokeAt) * 3.2; // click: a ring of gates spreading from the centre
      for (const s of sites) {
        s.z = 0.16 * Math.sin(1.9 * s.x - 1.3 * s.y - t * 2.1) + 0.06 * Math.sin(3.1 * s.y + t * 3.3 + s.ph);
        s.heat = 0.5 + 0.47 * Math.sin(t * s.rabi + s.ph);
        s.ang = t * s.w;
        s.g = Math.exp(-Math.pow((s.x * 0.8 + s.y * 0.6) - front, 2) / 0.08);
        if (burst < 6) {
          const b = Math.exp(-Math.pow(Math.hypot(s.x, s.y) - burst, 2) / 0.1);
          s.g = Math.max(s.g, b);
          s.z += 0.45 * b;
          s.heat = lerp(s.heat, 1, b);
        }
      }
      const A = shape.aux;
      for (let k = 0; k < N; k++) {
        const o = k * 6, kind = A[o], idx = A[o + 1];
        if (kind === 0) {
          const s = sites[idx];
          // spin the qubit's little sphere about its own axis (Rodrigues)
          const ux = s.ax[0], uy = s.ax[1], uz = s.ax[2];
          const vx = A[o + 2], vy = A[o + 3], vz = A[o + 4];
          const c = Math.cos(s.ang), sn = Math.sin(s.ang), dot = ux * vx + uy * vy + uz * vz;
          const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
          const sc = 1 + 0.35 * s.g + 0.12 * Math.sin(t * 4 + s.ph);
          P[k * 3]     = s.x + sc * (vx * c + cx * sn + ux * dot * (1 - c));
          P[k * 3 + 1] = s.y + sc * (vy * c + cy * sn + uy * dot * (1 - c));
          P[k * 3 + 2] = s.z + sc * (vz * c + cz * sn + uz * dot * (1 - c));
          F[k * 4] = s.heat;
          F[k * 4 + 3] = 0.85 + 0.15 * s.g;
        } else {
          const e = edges[idx], a = sites[e[0]], b = sites[e[1]];
          // current streams along the coupler, direction alternating
          let u = (A[o + 5] + t * (idx % 2 ? 0.35 : -0.35)) % 1;
          if (u < 0) u += 1;
          const tt = 0.12 + 0.76 * u;
          P[k * 3]     = lerp(a.x, b.x, tt) + A[o + 2];
          P[k * 3 + 1] = lerp(a.y, b.y, tt) + A[o + 3];
          P[k * 3 + 2] = lerp(a.z, b.z, tt) + A[o + 4];
          const g = Math.max(a.g, b.g);
          F[k * 4] = 0.75 + 0.25 * g;
          F[k * 4 + 1] = g;
          F[k * 4 + 3] = 0.45 + 0.55 * g;
        }
      }
      return 3;
    };
    let pokeAt = -99;
    shape.poke = (t) => { pokeAt = t; };
    return shape;
  }

  // 2) Bloch sphere: shell, great circles, axes, and a live state vector.
  //    |ψ⟩ precesses about z (Larmor) while θ nutates (a detuned Rabi drive),
  //    leaving a fading trail of where its tip has been. Click = a π pulse
  //    that flips the state through the sphere.
  //    aux: [kind, a, b, c]  kind 0 frame, 1 vector, 2 tip, 3 trail
  function shapeBloch() {
    const R = 1.45;
    const shape = makeShape(0.32, (add, left) => {
      const total = left();
      for (let k = 0; k < total * 0.3; k++) add(onSphere(R), 0, 0, 1, 0.28, [0, 0, 0, 0]);
      for (let k = 0; k < total * 0.2; k++) {
        const a = rand() * TAU, which = k % 3;
        const c = Math.cos(a) * R, s = Math.sin(a) * R;
        add(which === 0 ? [c, 0, s] : which === 1 ? [c, s, 0] : [0, s, c], 0, 0, 1, 0.7, [0, 0, 0, 0]);
      }
      for (let k = 0; k < total * 0.08; k++) {
        const t = (rand() * 2 - 1) * R * 1.12, which = k % 3;
        add(which === 0 ? [t, 0, 0] : which === 1 ? [0, t, 0] : [0, 0, t], 0, 0, 1, 0.45, [0, 0, 0, 0]);
      }
      for (let k = 0; k < total * 0.15; k++) {
        const t = Math.pow(rand(), 0.7);
        const j = 0.012 + 0.03 * Math.max(0, (t - 0.85) / 0.15);
        add([0, R * t, 0], 0.55 + 0.45 * t, 1, 1, 1, [1, t, gauss() * j, gauss() * j]);
      }
      for (let k = 0; k < total * 0.06; k++) {
        const q = onSphere(0.075);
        add([q[0], R + q[1], q[2]], 1, 1, 1, 1, [2, q[0], q[1], q[2]]);
      }
      while (left() > 0) add([0, R, 0], 0.4, 1, 1, 0.9, [3, rand(), gauss() * 0.012, gauss() * 0.012]);
    }, 4);
    let flip = 0, flipTarget = 0;
    const state = (t, out) => {
      const th = (50 + 28 * Math.sin(t * 0.83) + 9 * Math.sin(t * 2.9)) * Math.PI / 180 + flip * Math.PI * 0.72;
      const ph = t * 1.7 + 0.5 * Math.sin(t * 0.41);
      out[0] = Math.sin(th) * Math.cos(ph); out[1] = Math.cos(th); out[2] = Math.sin(th) * Math.sin(ph);
    };
    const d = [0, 0, 0], e = [0, 0, 0];
    let last = 0;
    shape.animate = (t, P, F) => {
      const dt = Math.min(0.05, Math.max(0, t - last)); last = t;
      flip += (flipTarget - flip) * Math.min(1, dt * 5);
      state(t, d);
      const A = shape.aux, B = shape.pos, pulse = 1 + 0.025 * Math.sin(t * 2.2);
      for (let k = 0; k < N; k++) {
        const o = k * 4, kind = A[o];
        if (kind === 0) {
          P[k * 3] = B[k * 3] * pulse; P[k * 3 + 1] = B[k * 3 + 1] * pulse; P[k * 3 + 2] = B[k * 3 + 2] * pulse;
        } else if (kind === 1) {
          const u = A[o + 1] * R;
          P[k * 3] = d[0] * u + A[o + 2]; P[k * 3 + 1] = d[1] * u + A[o + 3]; P[k * 3 + 2] = d[2] * u + A[o + 2];
        } else if (kind === 2) {
          const g = 1 + 0.5 * Math.sin(t * 6 + k);
          P[k * 3] = d[0] * R + A[o + 1] * g; P[k * 3 + 1] = d[1] * R + A[o + 2] * g; P[k * 3 + 2] = d[2] * R + A[o + 3] * g;
        } else {
          const age = A[o + 1];
          state(t - age * 2.6, e);
          P[k * 3] = e[0] * R + A[o + 2]; P[k * 3 + 1] = e[1] * R + A[o + 3]; P[k * 3 + 2] = e[2] * R + A[o + 2];
          F[k * 4] = 0.95 - 0.7 * age;
          F[k * 4 + 3] = 0.95 * (1 - age) * (1 - age);
        }
      }
    };
    shape.poke = () => { flipTarget = flipTarget ? 0 : 1; };
    return shape;
  }

  // 3) Electron orbital: hydrogen 3d_z², sampled directly from |ψ|²
  //    (slightly sharpened so the lobes read crisply).
  //    |ψ|² r² ∝ r⁶ e^(−2r/3) · (3cos²θ − 1)², so r is Gamma-distributed
  //    and cosθ is drawn by rejection — no 3D trial-and-error.
  function shapeOrbital() {
    const SHARP = 1.35, S = 1.6 / 18;
    const shape = makeShape(0.2, (add, left) => {
      const pts = [];
      let maxD = 0;
      const n = left();
      for (let k = 0; k < n; k++) {
        let r = 0;
        for (let j = 0; j < 7; j++) r -= Math.log(rand() + 1e-12);
        r *= 1.5 / SHARP;
        let u;
        do { u = rand() * 2 - 1; } while (rand() * 4 > Math.pow((3 * u * u - 1) * (3 * u * u - 1), SHARP) * Math.pow(4, 1 - SHARP));
        const ph = rand() * TAU, sn = Math.sqrt(1 - u * u);
        const ang = (3 * u * u - 1);
        const d = Math.pow(r, 4) * Math.exp(-2 * r / 3) * ang * ang;
        if (d > maxD) maxD = d;
        pts.push([r * sn * Math.cos(ph) * S, r * u * S, r * sn * Math.sin(ph) * S, d]);
      }
      for (const q of pts) add([q[0], q[1], q[2]], Math.pow(Math.min(1, q[3] / maxD * 1.3), 0.5), 0.9, 1, 1);
    });
    // The cloud is a standing wave: probability sloshes between the lobes and
    // the ring, shells breathe outward, and every point drifts around the axis
    // at its own rate. Click = excite it (a burst of radial oscillation).
    let kick = 0, last = 0;
    shape.animate = (t, P, F) => {
      const dt = Math.min(0.05, Math.max(0, t - last)); last = t;
      kick *= Math.exp(-dt * 1.4);
      const B = shape.pos, F0 = shape.field;
      for (let k = 0; k < N; k++) {
        const x = B[k * 3], y = B[k * 3 + 1], z = B[k * 3 + 2];
        const rho = Math.hypot(x, z), r = Math.hypot(rho, y) + 1e-6;
        const a = t * (0.9 / (0.35 + rho * 1.6)) * (y > 0 ? 1 : -1);
        const c = Math.cos(a), sn = Math.sin(a);
        const wave = Math.sin(r * 7 - t * 2.6);
        const sc = 1 + 0.07 * wave + kick * 0.35 * Math.sin(r * 9 - t * 14);
        const lobe = Math.abs(y) / r; // 1 on the axis lobes, 0 in the ring
        const slosh = 1 + 0.16 * Math.sin(t * 1.1) * (lobe * 2 - 1);
        P[k * 3] = (c * x + sn * z) * sc * (2 - slosh);
        P[k * 3 + 1] = y * sc * slosh;
        P[k * 3 + 2] = (-sn * x + c * z) * sc * (2 - slosh);
        F[k * 4] = clamp01(F0[k * 4] + 0.16 * wave + kick * 0.3);
      }
    };
    shape.poke = () => { kick = 1; };
    return shape;
  }

  // 4) Silica network: Si on a diamond lattice, O at every Si–Si midpoint
  //    (the β-cristobalite motif). Atoms only, no bond lines. It is a running
  //    simulation: every atom vibrates thermally and a pressure wave squeezes
  //    through the cell. Click = shock it.
  //    aux: [kind (0 Si, 1 O), index, ox, oy, oz]
  function shapeSilica() {
    const A0 = 1.25, si = [];
    const basis = [[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0],[.25,.25,.25],[.25,.75,.75],[.75,.25,.75],[.75,.75,.25]];
    for (let a = -2; a <= 1; a++) for (let b = -2; b <= 1; b++) for (let c = -2; c <= 1; c++)
      for (const q of basis) {
        const p = [(a + q[0]) * A0, (b + q[1]) * A0, (c + q[2]) * A0];
        if (Math.hypot(p[0], p[1], p[2] * 1.4) < 1.75) si.push(p);
      }
    const nn = A0 * Math.sqrt(3) / 4 * 1.05;
    const bonds = [];
    for (let i = 0; i < si.length; i++) for (let j = i + 1; j < si.length; j++) {
      const d = Math.hypot(si[i][0] - si[j][0], si[i][1] - si[j][1], si[i][2] - si[j][2]);
      if (d < nn) bonds.push([i, j]);
    }
    const mk = (p) => ({ p, w: [1.3 + rand() * 1.4, 1.3 + rand() * 1.4, 1.3 + rand() * 1.4], ph: [rand() * TAU, rand() * TAU, rand() * TAU], c: [0, 0, 0], e: 0 });
    const siA = si.map(mk);
    const oxA = bonds.map(([i, j]) => mk([(si[i][0] + si[j][0]) / 2, (si[i][1] + si[j][1]) / 2, (si[i][2] + si[j][2]) / 2]));
    const shape = makeShape(0.35, (add, left) => {
      const total = left();
      // atoms only, no bond lines: big Si (warm), small O (blue)
      for (let k = 0; k < total * 0.55; k++) {
        const i = k % si.length, c = si[i], p = onSphere(0.13 * Math.cbrt(0.4 + 0.6 * rand()));
        add([c[0] + p[0], c[1] + p[1], c[2] + p[2]], 0.82 + rand() * 0.12, 1, 1, 1, [0, i, p[0], p[1], p[2]]);
      }
      while (left() > 0) {
        const i = Math.floor(rand() * oxA.length), c = oxA[i].p, p = onSphere(0.08 * Math.cbrt(0.4 + 0.6 * rand()));
        add([c[0] + p[0], c[1] + p[1], c[2] + p[2]], 0.3 + rand() * 0.08, 1, 1, 1, [1, i, p[0], p[1], p[2]]);
      }
    }, 5);
    let shockAt = -99;
    function move(atoms, t, amp) {
      const sh = (t - shockAt) * 1.6;
      for (const a of atoms) {
        const p = a.p;
        // pressure wave along a body diagonal + thermal jiggle
        const press = Math.sin(1.9 * (p[0] + 0.6 * p[1]) - t * 0.9);
        let sq = 1 - 0.07 * (0.5 + 0.5 * Math.sin(t * 0.35)) - 0.035 * press;
        let e = 0.5 + 0.5 * press;
        const r = Math.hypot(p[0], p[1], p[2]);
        if (sh < 5) {
          const b = Math.exp(-Math.pow(r - sh, 2) / 0.12) * Math.exp(-sh * 0.4);
          sq += 0.3 * b; e = Math.max(e, b * 1.5);
        }
        a.c[0] = p[0] * sq + amp * Math.sin(t * a.w[0] + a.ph[0]);
        a.c[1] = p[1] * sq + amp * Math.sin(t * a.w[1] + a.ph[1]);
        a.c[2] = p[2] * sq + amp * Math.sin(t * a.w[2] + a.ph[2]);
        a.e = e;
      }
    }
    shape.animate = (t, P, F) => {
      move(siA, t, 0.035); move(oxA, t, 0.06);
      const A = shape.aux;
      for (let k = 0; k < N; k++) {
        const o = k * 5, kind = A[o], i = A[o + 1];
        const at = kind === 0 ? siA[i] : oxA[i], c = at.c;
        P[k * 3] = c[0] + A[o + 2]; P[k * 3 + 1] = c[1] + A[o + 3]; P[k * 3 + 2] = c[2] + A[o + 4];
        F[k * 4] = kind === 0 ? 0.72 + 0.26 * at.e : 0.22 + 0.3 * at.e;
      }
    };
    shape.poke = (t) => { shockAt = t; };
    return shape;
  }

  // 5) Mantle: a globe with one octant cut away, turning so you can see it
  //    is a solid planet. The three cut faces show the real layering (PREM
  //    radii: inner core 1221 km, core–mantle boundary 3480 km, surface
  //    6371 km) and they are convecting: cells turn over, hot plumes rise
  //    from the core–mantle boundary, cold slabs sink from the surface, and
  //    the liquid outer core churns faster. Colour is temperature, ~300 K
  //    (blue) to ~6000 K (red). Click or stir with the cursor = a surge of flow.
  //    aux: [kind, face, cell, rho, phase, speed]
  //    kind 0 surface, 1 inner core, 2 outer core, 3 mantle, 4 lithosphere
  //    face 0: z = 0 plane, 1: x = 0 plane, 2: y = 0 plane (the floor)
  function shapeMantle() {
    const R = 1.62, Q = Math.PI / 2;
    const R_IC = 1221 / 6371, R_CMB = 3480 / 6371, R_LITH = 6230 / 6371;
    const heatOfT = (T) => Math.pow(clamp01((T - 300) / 5700), 0.85);
    // Convection cells across each quarter-disk face; neighbours turn opposite ways.
    function cells(m) {
      return [0, 1, 2].map(() => {
        const w = [];
        for (let c = 0; c < m; c++) w.push(0.7 + rand() * 0.7);
        const sum = w.reduce((a, b) => a + b, 0);
        let th = 0;
        const d0 = rand() < 0.5 ? 1 : -1;
        return w.map((wi, c) => {
          const th0 = th; th += Q * wi / sum;
          return { th0, th1: th, dir: c % 2 ? -d0 : d0 };
        });
      });
    }
    const mantleCells = cells(3), coreCells = cells(2);
    const fo = new Float32Array(5); // x, y, z, heat, glow
    function onFace(f, r, th) {
      const a = r * Math.cos(th) * R, b = r * Math.sin(th) * R;
      if (f === 0) { fo[0] = a; fo[1] = b; fo[2] = 0; }
      else if (f === 1) { fo[0] = 0; fo[1] = b; fo[2] = a; }
      else { fo[0] = a; fo[1] = 0; fo[2] = b; }
    }
    // A particle on a closed streamline of its cell. Inner streamlines are
    // round, outer ones hug the cell walls, so the cells tile with no gaps.
    function flow(kind, f, c, rho, a) {
      const core = kind === 2;
      const cell = (core ? coreCells : mantleCells)[f][c];
      const q = 1 - 0.72 * rho, ca = Math.cos(a), sa = Math.sin(a);
      const lu = rho * (ca < 0 ? -1 : 1) * Math.pow(Math.abs(ca), q);
      const lv = rho * (sa < 0 ? -1 : 1) * Math.pow(Math.abs(sa), q);
      const r0 = core ? R_IC : R_CMB, r1 = core ? R_CMB : R_LITH;
      const r = (r0 + r1) / 2 + lv * (r1 - r0) / 2;
      const th = (cell.th0 + cell.th1) / 2 + lu * (cell.th1 - cell.th0) / 2;
      // Temperature: adiabat + thermal boundary layers + plume / slab.
      const zz = (r - r0) / (r1 - r0), sd = cell.dir;
      const up = Math.exp(-Math.pow((lu - sd) / 0.28, 2)), down = Math.exp(-Math.pow((lu + sd) / 0.28, 2));
      const T = core
        ? 4200 + 1200 * (1 - zz) + 450 * up - 350 * down
        : 2500 - 900 * zz + 1400 * Math.exp(-zz / 0.08) - 1100 * Math.exp(-(1 - zz) / 0.07)
          + 1300 * up * (1 - 0.35 * zz) - 1200 * down * (0.35 + 0.65 * zz);
      onFace(f, r, th);
      fo[3] = heatOfT(T); fo[4] = Math.max(up, down);
    }
    const shape = makeShape(0.42, (add, left) => {
      const total = left();
      // The globe: continents and ocean everywhere except the missing octant.
      const nSurf = Math.floor(total * 0.42);
      for (let k = 0; k < nSurf;) {
        const p = onSphere(1);
        if (p[0] > 0 && p[1] > 0 && p[2] > 0) continue;
        const land = fbm(p[0] * 1.8 + 3.1, p[1] * 1.8, p[2] * 1.8) > 0.5 || Math.abs(p[1]) > 0.88;
        if (!land && rand() > 0.5) continue;
        add([p[0] * R, p[1] * R, p[2] * R], land ? 0 : 0.16, land ? 0 : 0.9, 0, land ? 1.25 : 0.7, [0, 0, 0, 0, land ? 1.25 : 0.7, 0]);
        k++;
      }
      // The three cut faces.
      while (left() > 0) {
        const f = Math.floor(rand() * 3), roll = rand();
        if (roll < 0.04) {
          const r = R_IC * Math.sqrt(rand()), th = rand() * Q;
          onFace(f, r, th);
          add([fo[0], fo[1], fo[2]], heatOfT(5400 + 600 * (1 - r / R_IC)), 1, 0, 1, [1, f, 0, 0, 0, 0]);
        } else if (roll < 0.25) {
          const c = Math.floor(rand() * 2), rho = Math.pow(rand(), 0.42), a = rand() * TAU;
          flow(2, f, c, rho, a);
          add([fo[0], fo[1], fo[2]], fo[3], 1, 0, 0.9, [2, f, c, rho, a, 0.7 + rand() * 0.6]);
        } else if (roll < 0.9) {
          const c = Math.floor(rand() * 3), rho = Math.pow(rand(), 0.42), a = rand() * TAU;
          flow(3, f, c, rho, a);
          add([fo[0], fo[1], fo[2]], fo[3], 1, 0, 0.85, [3, f, c, rho, a, 0.7 + rand() * 0.6]);
        } else {
          const r = R_LITH + (1 - R_LITH) * rand(), th = rand() * Q;
          onFace(f, r, th);
          add([fo[0], fo[1], fo[2]], heatOfT(300 + 1200 * (1 - r) / (1 - R_LITH)), 0.6, 0, 1, [4, f, 0, 0, 0, 0]);
        }
      }
    }, 6);
    shape.animate = (t, P, F) => {
      const A = shape.aux, B = shape.pos;
      // The planet turns back and forth through the cut, far enough to show
      // the round far side and each face in turn.
      const yaw = -Math.PI / 4 + 0.72 * Math.sin(t * 0.33) + 0.1 * Math.sin(t * 0.71);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const tt = t + flowClock;
      for (let k = 0; k < N; k++) {
        const o = k * 6, kind = A[o];
        let x, y, z;
        if (kind === 2 || kind === 3) {
          const f = A[o + 1], c = A[o + 2], rho = A[o + 3];
          const dir = (kind === 2 ? coreCells : mantleCells)[f][c].dir;
          // vortex-like turnover: inner streamlines circulate faster
          flow(kind, f, c, rho, A[o + 4] + dir * tt * A[o + 5] * (kind === 2 ? 1.0 : 0.55) * (1.35 - 0.7 * rho));
          x = fo[0]; y = fo[1]; z = fo[2];
          F[k * 4] = fo[3];
          F[k * 4 + 3] = 0.7 + 0.5 * fo[4];
        } else {
          x = B[k * 3]; y = B[k * 3 + 1]; z = B[k * 3 + 2];
          if (kind === 1) F[k * 4 + 3] = 0.8 + 0.2 * Math.sin(t * 6 + k); // solid inner core shimmers
        }
        const zr = -sy * x + cy * z;
        P[k * 3] = cy * x + sy * z;
        P[k * 3 + 1] = y;
        P[k * 3 + 2] = zr;
        // the far side of the globe is dimmer, so the sphere reads as solid
        if (kind === 0) F[k * 4 + 3] = A[o + 4] * (0.2 + 0.8 * smooth(-0.6, 0.3, zr / R));
      }
    };
    shape.poke = () => { flowSurge = 1; };
    return shape;
  }

  // 6) Earth: continents in white, oceans in deep blue — and earthquakes.
  //    Every few seconds a rupture fires somewhere; P, S and surface-wave
  //    fronts spread from the epicentre at their real relative speeds
  //    (S ≈ 0.55 P, surface ≈ 0.5 P), lift the ground as they pass, fade
  //    with distance and focus again at the antipode. Click = a new quake.
  //    aux: [heat0, tint0, alpha0]
  function shapeEarth() {
    const R = 1.55;
    const shape = makeShape(0.4, (add, left) => {
      while (left() > 0) {
        const p = onSphere(1);
        const land = fbm(p[0] * 1.8 + 3.1, p[1] * 1.8, p[2] * 1.8) > 0.5;
        const ice = Math.abs(p[1]) > 0.88;
        const q = [p[0] * R, p[1] * R, p[2] * R];
        if (land || ice) add(q, 0, 0, 1, 0.7, [0, 0, 0.7]);
        else if (rand() < 0.42) add(q, 0.16, 0.9, 1, 0.6, [0.16, 0.9, 0.6]);
      }
    }, 3);
    const quakes = [];
    let nextAt = 0.4;
    function fire(t, mag) {
      quakes.push({ e: onSphere(1), t0: t, mag });
      if (quakes.length > 3) quakes.shift();
    }
    const VP = 0.8, FRONTS = [[1, 0.9, 0.005], [0.55, 1.1, 0.009], [0.5, 0.7, 0.022]]; // speed/VP, amp, width
    shape.animate = (t, P, F) => {
      if (t > nextAt) { fire(t, 0.6 + rand() * 0.4); nextAt = t + 2.2 + rand() * 2.2; }
      while (quakes.length && (t - quakes[0].t0) * VP * 0.5 > Math.PI + 0.6) quakes.shift();
      const B = shape.pos, A = shape.aux, nq = quakes.length;
      for (let k = 0; k < N; k++) {
        const x = B[k * 3] / R, y = B[k * 3 + 1] / R, z = B[k * 3 + 2] / R;
        let amp = 0;
        for (let q = 0; q < nq; q++) {
          const Q = quakes[q], age = t - Q.t0;
          const dot = x * Q.e[0] + y * Q.e[1] + z * Q.e[2];
          const d = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot);
          // geometric spreading on a sphere: energy ∝ 1 / sin(d)
          const spread = Q.mag / Math.sqrt(Math.max(0.12, Math.sin(d)));
          for (let w = 0; w < 3; w++) {
            const fr = FRONTS[w], x0 = d - age * VP * fr[0];
            if (x0 > 0.5 || x0 < -0.5) continue;
            amp += fr[1] * spread * Math.exp(-x0 * x0 / fr[2]) * Math.exp(-age * 0.28);
          }
          if (age < 0.7 && d < 0.14) amp += (1 - age / 0.7) * 2; // rupture flash
        }
        if (amp > 1.6) amp = 1.6;
        const lift = 1 + 0.03 * amp;
        P[k * 3] = B[k * 3] * lift; P[k * 3 + 1] = B[k * 3 + 1] * lift; P[k * 3 + 2] = B[k * 3 + 2] * lift;
        const a = amp > 1 ? 1 : amp;
        F[k * 4] = lerp(A[k * 3], 0.42 + 0.58 * a * a, a);
        F[k * 4 + 1] = lerp(A[k * 3 + 1], 1, a);
        F[k * 4 + 3] = lerp(A[k * 3 + 2], 1.3, a);
      }
    };
    shape.poke = (t) => { fire(t, 1.3); nextAt = t + 2.5; };
    return shape;
  }

  // 7) Solar system: a convecting Sun, six planets on Keplerian orbits
  //    (ω ∝ r^-3/2, so the inner ones race), a moon, Saturn's ring and an
  //    asteroid belt. Click = a solar flare.
  //    aux: [kind, i, a, b, c]  0 sun, 1 planet, 2 orbit, 3 asteroid, 4 moon, 5 ring
  function shapeSolar() {
    const orbits = [0.5, 0.72, 0.97, 1.24, 1.78, 2.2];
    const sizes  = [0.035, 0.05, 0.055, 0.045, 0.12, 0.1];
    const heats  = [0.7, 0.62, 0.22, 0.85, 0.6, 0.55];
    const ang0 = orbits.map(() => rand() * TAU);
    const omega = (r) => 0.55 * Math.pow(r, -1.5);
    const shape = makeShape(0.42, (add, left) => {
      const total = left();
      for (let k = 0; k < total * 0.25; k++) {
        const u = onSphere(1), rr = Math.cbrt(rand()) * 0.26;
        add([u[0] * rr, u[1] * rr, u[2] * rr], 0.82 + rand() * 0.18, 1, 1, 1, [0, rr, u[0], u[1], u[2]]);
      }
      for (let k = 0; k < total * 0.15; k++) {
        const o = k % orbits.length, p = onSphere(sizes[o]);
        add([orbits[o] + p[0], p[1], p[2]], heats[o], 1, 1, 1, [1, o, p[0], p[1], p[2]]);
      }
      for (let k = 0; k < total * 0.012; k++) {
        const p = onSphere(0.016);
        add([orbits[2], 0, 0], 0, 0, 1, 1, [4, 0, p[0], p[1], p[2]]);
      }
      for (let k = 0; k < total * 0.035; k++) {
        const a = rand() * TAU, rr = 0.15 + rand() * 0.07;
        add([orbits[5], 0, 0], 0.5, 0.5, 1, 0.7, [5, 0, Math.cos(a) * rr, 0, Math.sin(a) * rr]);
      }
      for (let k = 0; k < total * 0.16; k++) {
        const rr = 1.42 + gauss() * 0.07, a = rand() * TAU;
        add([Math.cos(a) * rr, 0, Math.sin(a) * rr], 0.6, 0.35, 1, 0.5, [3, rr, a, gauss() * 0.02, 0]);
      }
      while (left() > 0) {
        const o = Math.floor(rand() * orbits.length), a = rand() * TAU;
        add([Math.cos(a) * orbits[o], gauss() * 0.004, Math.sin(a) * orbits[o]], 0, 0, 1, 0.42, [2, o, a, 0, 0]);
      }
    }, 5);
    let flareAt = -99;
    const fdir = [1, 0, 0];
    shape.animate = (t, P, F) => {
      const A = shape.aux, B = shape.pos;
      const pa = orbits.map((r, o) => ang0[o] + t * omega(r));
      const fl = t - flareAt;
      for (let k = 0; k < N; k++) {
        const o = k * 5, kind = A[o];
        if (kind === 0) {
          const ux = A[o + 2], uy = A[o + 3], uz = A[o + 4];
          // granulation + prominences that loop out and fall back
          let rr = A[o + 1] * (1 + 0.1 * Math.sin(ux * 9 + t * 2.1) * Math.sin(uy * 8 - t * 1.7) + 0.06 * Math.sin(uz * 13 + t * 3.3));
          const prom = Math.pow(Math.max(0, Math.sin(ux * 3.1 + uy * 2.3 + uz * 2.7 + t * 0.6)), 14);
          rr *= 1 + 1.1 * prom * (0.5 + 0.5 * Math.sin(t * 2 + k));
          if (fl < 2.5) {
            const al = ux * fdir[0] + uy * fdir[1] + uz * fdir[2];
            if (al > 0.75) rr += (al - 0.75) * 4 * fl * 1.3 * Math.exp(-fl * 1.2) * (0.4 + (k % 7) / 7);
          }
          P[k * 3] = ux * rr; P[k * 3 + 1] = uy * rr; P[k * 3 + 2] = uz * rr;
          F[k * 4] = 0.8 + 0.2 * Math.sin(t * 3 + k) * 0.5 + 0.1;
        } else if (kind === 1) {
          const i = A[o + 1], r = orbits[i], a = pa[i], sp = t * (2 + i);
          const c = Math.cos(sp), sn = Math.sin(sp);
          P[k * 3] = Math.cos(a) * r + c * A[o + 2] + sn * A[o + 4];
          P[k * 3 + 1] = A[o + 3];
          P[k * 3 + 2] = Math.sin(a) * r - sn * A[o + 2] + c * A[o + 4];
        } else if (kind === 4) {
          const a = pa[2], m = t * 4.2;
          P[k * 3] = Math.cos(a) * orbits[2] + Math.cos(m) * 0.1 + A[o + 2];
          P[k * 3 + 1] = Math.sin(m) * 0.02 + A[o + 3];
          P[k * 3 + 2] = Math.sin(a) * orbits[2] + Math.sin(m) * 0.1 + A[o + 4];
        } else if (kind === 5) {
          const a = pa[5], w = t * 1.5, c = Math.cos(w), sn = Math.sin(w);
          const lx = c * A[o + 2] + sn * A[o + 4], lz = -sn * A[o + 2] + c * A[o + 4];
          P[k * 3] = Math.cos(a) * orbits[5] + lx;
          P[k * 3 + 1] = lx * 0.42;
          P[k * 3 + 2] = Math.sin(a) * orbits[5] + lz;
        } else if (kind === 3) {
          const r = A[o + 1], a = A[o + 2] + t * omega(r);
          P[k * 3] = Math.cos(a) * r; P[k * 3 + 1] = A[o + 3]; P[k * 3 + 2] = Math.sin(a) * r;
        } else {
          // orbit lines: a bright wake trails each planet
          const i = A[o + 1];
          let da = (pa[i] - A[o + 2]) % TAU; if (da < 0) da += TAU;
          const wake = Math.exp(-da * 1.6);
          F[k * 4] = 0.75; F[k * 4 + 1] = wake; F[k * 4 + 3] = 0.3 + 0.7 * wake;
        }
      }
    };
    shape.poke = (t) => { flareAt = t; const d = onSphere(1); fdir[0] = d[0]; fdir[1] = d[1] * 0.4; fdir[2] = d[2]; };
    return shape;
  }

  // 8) Galaxy: a face-on, many-armed (flocculent) spiral, filled from the
  //    core to the edge. A pale warm bulge, an exponential disc of blue-white
  //    stars, pink-red star-forming knots and bright blue clusters strung
  //    along the arms, and a faint outer halo. Stars orbit on a flat rotation
  //    curve while the arms turn as slower density waves: stars drift through
  //    them, bunching up and brightening inside. Supernovae go off now and
  //    then (click = one more).
  //    aux: [kind (0 bulge, 1 disc, 2 knot/cluster), r, theta0, y, heat0, tint0, alpha0]
  function shapeGalaxy() {
    const RMAX = 2.35, WIND = 1.7;
    const shape = makeShape(1.12, (add, left) => {
      const total = left();
      const put = (kind, r, th, y, h, tint, al) =>
        add([Math.cos(th) * r, y, Math.sin(th) * r], h, tint, 1, al, [kind, r, th, y, h, tint, al]);
      // bulge: dense, pale and warm
      for (let k = 0; k < total * 0.09; k++) {
        const r = Math.abs(gauss()) * 0.17, th = rand() * TAU;
        put(0, r, th, gauss() * 0.07 * Math.exp(-r * 3), 0.56 + rand() * 0.1, 0.25 + 0.35 * Math.min(1, r * 4), 1);
      }
      // star-forming knots (red) and young clusters (blue), in clumps
      const clumps = [];
      for (let c = 0; c < 150; c++) {
        const r = 0.3 + Math.pow(rand(), 0.8) * (RMAX - 0.45);
        clumps.push({ r, th: rand() * TAU, red: rand() < 0.5, s: 0.015 + rand() * 0.035 });
      }
      for (let k = 0; k < total * 0.12; k++) {
        const c = clumps[k % clumps.length];
        const x = Math.cos(c.th) * c.r + gauss() * c.s, z = Math.sin(c.th) * c.r + gauss() * c.s;
        put(2, Math.hypot(x, z), Math.atan2(z, x), gauss() * 0.012, c.red ? 0.93 + rand() * 0.07 : 0.2 + rand() * 0.1, 1, 1);
      }
      // faint outer halo
      for (let k = 0; k < total * 0.04; k++) {
        const r = RMAX * (0.9 + rand() * 0.45);
        put(1, r, rand() * TAU, gauss() * 0.05, 0.2, 0.4, 0.3);
      }
      // the disc: exponential in radius, so it is full all the way out
      while (left() > 0) {
        let r;
        do { r = 0.12 - Math.log(1 - rand() * 0.985) * 1.25; } while (r > RMAX);
        const inner = Math.exp(-r / 0.5);
        put(1, r, rand() * TAU, gauss() * 0.03 * (1.2 - r / RMAX),
            lerp(0.2, 0.55, inner) + rand() * 0.06, lerp(0.5 + rand() * 0.3, 0.3, inner), 1.0);
      }
    }, 7);
    const novae = [];
    let nextNova = 2;
    const nova = (t) => {
      const r = 0.4 + rand() * 1.6, a = rand() * TAU;
      novae.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, t0: t });
      if (novae.length > 3) novae.shift();
    };
    shape.animate = (t, P, F) => {
      if (t > nextNova) { nova(t); nextNova = t + 2.5 + rand() * 4; }
      const A = shape.aux, pattern = t * 0.09, nn = novae.length;
      for (let k = 0; k < N; k++) {
        const o = k * 7, kind = A[o], r = A[o + 1];
        let x, y = A[o + 3], z;
        if (kind === 0) {
          const a = A[o + 2] + t * 0.8 / (0.25 + r);
          x = Math.cos(a) * r; z = Math.sin(a) * r;
          F[k * 4] = A[o + 4]; F[k * 4 + 1] = A[o + 5]; F[k * 4 + 3] = A[o + 6];
        } else {
          const th = A[o + 2] + t * 0.28 / (0.45 + r); // flat rotation curve
          const tw = Math.log(1 + r * 2.2) * WIND * 2.1;  // log-spiral winding
          // two grand arms + a five-armed, kinked overtone = flocculent arms
          const psi = 2 * (th - tw - pattern);
          const c2 = Math.cos(psi);
          const c5 = Math.cos(5 * (th - tw * 0.8 - pattern * 1.3) + 2.5 * Math.sin(r * 3.7));
          const arm = 0.56 * (0.5 + 0.5 * c2) + 0.44 * (0.5 + 0.5 * c5);
          const a = th - 0.22 * Math.sin(psi); // stars linger in the arms
          const rr = r * (1 + 0.03 * c2);
          x = Math.cos(a) * rr; z = Math.sin(a) * rr;
          const a2 = arm * arm;
          if (kind === 1) {
            F[k * 4] = A[o + 4]; F[k * 4 + 1] = A[o + 5];
            F[k * 4 + 3] = A[o + 6] * (0.4 + 1.1 * a2);
          } else { // knots and clusters only light up inside the arms
            F[k * 4] = A[o + 4]; F[k * 4 + 1] = 1;
            F[k * 4 + 3] = 0.2 + 1.6 * a2 * arm;
          }
        }
        for (let n = 0; n < nn; n++) {
          const nv = novae[n], age = t - nv.t0;
          if (age > 3) continue;
          const dx = x - nv.x, dz = z - nv.z, d = Math.hypot(dx, dz) + 1e-4;
          if (d > 1.3) continue;
          const ring = Math.exp(-Math.pow(d - age * 0.35, 2) / 0.004) * Math.exp(-age * 1.1);
          const core = Math.exp(-d * d / 0.003) * Math.exp(-age * 2.5);
          const b = ring + core * 2;
          if (b > 0.01) {
            x += dx / d * ring * 0.08; z += dz / d * ring * 0.08; y += core * 0.1 * Math.sin(k);
            F[k * 4] = Math.min(1, F[k * 4] + b); F[k * 4 + 1] = Math.min(1, F[k * 4 + 1] + b); F[k * 4 + 3] = Math.min(1.6, F[k * 4 + 3] + b);
          }
        }
        P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z;
      }
    };
    shape.poke = (t) => nova(t);
    return shape;
  }

  // 9) π — the site's own mark (the same outline as the home page and the
  //    favicon), as a thin slab of particles.
  const PI_MARK = "M 0 79 L 0 158 90.585 158 L 181.171 158 180.702 323.750 C 180.189 505.585, 179.893 515.439, 173.921 550 C 167.099 589.473, 148.234 639.092, 125.705 676.819 C 119.026 688.003, 103.645 708.849, 85.085 731.871 C 78.713 739.775, 67.103 754.175, 59.284 763.871 C 51.465 773.567, 44.265 783.006, 43.284 784.846 L 41.500 788.192 46 792.162 C 67.779 811.375, 160.219 887, 161.926 887 C 164.406 887, 203.422 839.570, 235.136 798 C 280.230 738.893, 313.314 663.477, 329.454 583 C 337.392 543.422, 337.821 531.897, 338.991 327 C 339.513 235.425, 339.954 160.160, 339.971 159.744 C 339.987 159.329, 378.362 159.104, 425.250 159.244 L 510.500 159.500 510.587 390.500 C 510.673 618.837, 511.198 683.440, 513.103 700 C 523.207 787.861, 582.955 856.593, 668.225 878.447 C 696.545 885.706, 733.582 885.714, 766.500 878.469 C 820.969 866.481, 874.399 823.906, 900.740 771.500 C 914.994 743.143, 918.458 728.600, 928.003 657.046 C 933.820 613.443, 933.694 615.388, 930.750 614.663 C 922.311 612.583, 789.603 595, 782.351 595 L 777.142 595 776.074 600.250 C 775.486 603.138, 772.547 622.825, 769.543 644 C 762.332 694.830, 759.720 703.795, 749.503 712.788 C 743.401 718.160, 731.401 723.939, 723.565 725.282 C 705.044 728.454, 684.513 716.921, 675 698.001 L 671 690.044 671 424.522 L 671 159 708.835 159 C 729.645 159, 770.370 158.701, 799.335 158.336 L 852 157.673 852 78.836 L 852 0 426 0 L 0 0 0 79";
  function shapePi() {
    const c = document.createElement("canvas");
    c.width = c.height = 240;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#fff";
    // the mark's viewBox is -141.9 -165.1 1150 1150; fit it a little larger
    const k = 240 / 1150 * 1.12;
    g.translate(120, 120); g.scale(k, k); g.translate(-(-141.9 + 575), -(-165.1 + 575));
    g.fill(new Path2D(PI_MARK), "evenodd");
    const img = g.getImageData(0, 0, 240, 240).data;
    const ink = [];
    for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++)
      if (img[(y * 240 + x) * 4 + 3] > 128) ink.push(y * 240 + x);
    const shape = makeShape(0, (add, left) => {
      if (!ink.length) return;
      while (left() > 0) {
        const v = ink[Math.floor(rand() * ink.length)], x = v % 240, y = (v - x) / 240;
        const px = (x + rand() - 120) / 240 * 3.6, py = -(y + rand() - 120) / 240 * 3.6;
        add([px, py, gauss() * 0.05], clamp01(0.1 + (px + 1.4) / 2.8 * 0.85), 0.8, 0, 1);
      }
    });
    // A flag of particles: waves run through the slab and the colormap
    // scrolls across it. Click = a ripple from the centre.
    let rippleAt = -99;
    shape.animate = (t, P, F) => {
      const B = shape.pos, rp = (t - rippleAt) * 2.4;
      for (let k = 0; k < N; k++) {
        const x = B[k * 3], y = B[k * 3 + 1];
        let z = B[k * 3 + 2] + 0.16 * Math.sin(2.2 * x - t * 1.8) + 0.09 * Math.sin(3.1 * y + t * 2.3);
        if (rp < 6) z += 0.5 * Math.exp(-Math.pow(Math.hypot(x, y) - rp, 2) / 0.08) * Math.exp(-rp * 0.4);
        P[k * 3 + 2] = z;
        let h = (0.1 + (x + 1.4) / 2.8 * 0.85 + t * 0.07) % 1.7;
        F[k * 4] = h > 0.85 ? 1.7 - h : h;
      }
    };
    shape.poke = (t) => { rippleAt = t; };
    return shape;
  }

  // Section -> shape. Order matches the page.
  const SHAPE_FOR_SCENE = {
    qubits: shapeLattice, quantum: shapeBloch, dft: shapeOrbital, md: shapeSilica,
    mantle: shapeMantle, planet: shapeEarth, solar: shapeSolar, galaxy: shapeGalaxy, outro: shapePi,
  };
  const sections = Array.from(document.querySelectorAll(".home-scene"));
  const builders = sections.map((s) => SHAPE_FOR_SCENE[s.dataset.scene] || shapeLattice);
  // Only the first two shapes are needed for the first frame; the rest are
  // built in idle time (or on demand, if someone scrolls very fast).
  const shapes = new Array(sections.length);
  function getShape(i) {
    return shapes[i] || (shapes[i] = builders[i]());
  }
  getShape(0);
  getShape(1);
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
  (function buildNext(k) {
    if (k >= shapes.length) return;
    idle(() => { getShape(k); buildNext(k + 1); });
  })(2);
  // ====================================================
  // PARTICLE CLOUD
  // ====================================================
  const geo = new THREE.BufferGeometry();
  const aPosA = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  const aPosB = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  const aFieldA = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
  const aFieldB = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
  [aPosA, aPosB, aFieldA, aFieldB].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
  const aRand = new Float32Array(N);
  for (let k = 0; k < N; k++) aRand[k] = rand();
  geo.setAttribute("position", aPosA); // three needs one; the shader reads A/B
  geo.setAttribute("aPosA", aPosA);
  geo.setAttribute("aPosB", aPosB);
  geo.setAttribute("aFieldA", aFieldA);
  geo.setAttribute("aFieldB", aFieldB);
  geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);

  const uniforms = {
    uMorph:    { value: 0 },
    uTime:     { value: 0 },
    uSpin:     { value: 0 },
    uTiltA:    { value: 0 },
    uTiltB:    { value: 0 },
    uYaw:      { value: 0 },
    uPitch:    { value: 0 },
    uChaos:    { value: 0 },
    uSize:     { value: isMobile ? 2.2 : 1.85 },
    uPR:       { value: PR },
    uOpacity:  { value: 1 },
    uMouse:    { value: new THREE.Vector2(9, 9) },
    uMouseStr: { value: 0 },
    uAspect:   { value: 1 },
    uShock:    { value: [new THREE.Vector3(0, 0, 99), new THREE.Vector3(0, 0, 99), new THREE.Vector3(0, 0, 99)] },
  };
  const cloudMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aPosA;
      attribute vec3 aPosB;
      attribute vec4 aFieldA;
      attribute vec4 aFieldB;
      attribute float aRand;
      uniform float uMorph, uTime, uSpin, uTiltA, uTiltB, uYaw, uPitch, uChaos, uSize, uPR, uMouseStr, uAspect;
      uniform vec2 uMouse;
      uniform vec3 uShock[3]; // xy = where (NDC), z = age in seconds
      varying vec3 vColor;
      varying float vAlpha;

      vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
      vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }
      vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c*p.x - s*p.y, s*p.x + c*p.y, p.z); }
      // Simulation-style colormap: deep blue -> cyan -> yellow -> red.
      vec3 cmap(float x) {
        x = clamp(x, 0.0, 1.0);
        return clamp(vec3(1.6 - abs(4.0*x - 3.2), 1.5 - abs(4.0*x - 2.0), 1.6 - abs(4.0*x - 0.75)), 0.0, 1.0);
      }
      // Cheap divergence-free-looking turbulence (two octaves of crossed sines).
      vec3 turb(vec3 p, float t) {
        vec3 a = sin(p.yzx * 2.7 + t * 1.3) * cos(p.zxy * 1.9 - t * 0.9);
        vec3 b = sin(p.zxy * 6.1 - t * 2.1) * cos(p.yzx * 5.3 + t * 1.7);
        return a + 0.5 * b;
      }

      void main() {
        // Each particle leaves on its own beat, so a transition pours
        // rather than snaps.
        float k = clamp((uMorph - aRand * 0.4) / 0.6, 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);

        vec3 a = rotY(aPosA, uSpin * aFieldA.z);
        vec3 b = rotY(aPosB, uSpin * aFieldB.z);
        vec3 p = mix(a, b, k);

        // Mid-flight the cloud is torn apart: it blows outward, twists into
        // a vortex and tumbles in turbulence before it condenses again.
        float flight = sin(3.14159 * k);
        float s = uTime * 0.6 + aRand * 6.2831;
        vec3 drift = vec3(sin(s + p.y * 2.3), cos(s * 1.1 + p.z * 2.7), sin(s * 0.9 + p.x * 3.1));
        p = rotZ(p, flight * (aRand - 0.35) * 2.6);
        p = rotY(p, flight * (0.5 - aRand) * 1.8);
        p *= 1.0 + flight * (0.25 + 0.9 * fract(aRand * 7.31));
        p += drift * (0.01 + 0.5 * flight);
        p += turb(p + aRand, uTime) * (0.35 * flight + uChaos * (0.12 + 0.3 * fract(aRand * 3.7)));

        p = rotY(p, uYaw);
        p = rotX(p, mix(uTiltA, uTiltB, k) + uPitch);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depthScale = -mv.z / 6.5;

        vec4 clip = projectionMatrix * mv;
        vec2 ndc = clip.xy / clip.w;

        // Cursor: particles are flung outward and swirl around it.
        vec2 d = (ndc - uMouse) * vec2(uAspect, 1.0);
        float push = uMouseStr * exp(-dot(d, d) / 0.03);
        vec2 dn = normalize(d + 1e-5);
        mv.xy += (dn * 0.3 + vec2(-dn.y, dn.x) * 0.22) * push * depthScale;

        // Click shockwaves: an expanding ring that throws particles outward.
        float glow = 0.0;
        for (int q = 0; q < 3; q++) {
          vec2 ds = (ndc - uShock[q].xy) * vec2(uAspect, 1.0);
          float age = uShock[q].z;
          float dist = length(ds);
          // the front widens as it goes and only fades once it is past the screen edge
          float ring = exp(-pow(dist - age * 1.5, 2.0) / (0.012 + 0.02 * age)) * exp(-age * 0.75);
          mv.xy += normalize(ds + 1e-5) * ring * 0.55 * depthScale;
          glow += ring;
        }

        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * clamp(6.5 / -mv.z, 0.6, 1.8) * (1.0 + 0.8 * glow + 0.5 * push);

        vec4 f = mix(aFieldA, aFieldB, k);
        float heat = f.x + 0.06 * sin(uTime * 1.3 + aRand * 20.0) * f.y;
        vColor = mix(vec3(0.93, 0.96, 1.0), cmap(heat), f.y) * (0.9 + aRand * 0.2);
        vColor = mix(vColor, vec3(1.0), clamp(glow, 0.0, 0.8));
        vAlpha = f.w * (0.85 + 0.3 * flight) + glow * 0.5;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25) discard;
        // a bright core with a soft halo
        float a = exp(-d * 16.0) + 0.35 * exp(-d * 5.0);
        gl_FragColor = vec4(vColor * 1.2, a * vAlpha * uOpacity * 1.05);
      }
    `,
  });
  const cloud = new THREE.Points(geo, cloudMat);
  cloud.frustumCulled = false;
  cloud.renderOrder = 5;
  scene.add(cloud);

  // ====================================================
  // BACKGROUND — a different sky behind every scale.
  //   stars      twinkling, everywhere (brighter out in space)
  //   foam       quantum scenes: virtual particles that blink in and out
  //   gas        atomic scenes: a jittering, Brownian gas
  //   embers     mantle: sparks rising off the hot interior
  //   galaxies   galaxy scene: distant spirals and ellipticals, turning
  //   streaks    comets and meteors in space; fast particle tracks below
  // Each layer fades with the scene weights in `sceneW`.
  // ====================================================
  const SCENE_KEYS = sections.map((s) => s.dataset.scene);
  const sceneW = {};
  function weightOf() {
    let w = 0;
    for (let a = 0; a < arguments.length; a++) w += sceneW[arguments[a]] || 0;
    return Math.min(1, w);
  }

  const AMB = isMobile ? 1500 : 4200;
  const ambUniforms = {
    uTime: { value: 0 }, uPR: { value: PR }, uScroll: { value: 0 },
    uW: { value: new THREE.Vector4(1, 0, 0, 0) }, // stars, foam, gas, embers
    uShock: uniforms.uShock, uAspect: uniforms.uAspect,
  };
  {
    const pos = new Float32Array(AMB * 3), seed = new Float32Array(AMB * 4), grp = new Float32Array(AMB);
    for (let k = 0; k < AMB; k++) {
      const g = k < AMB * 0.4 ? 0 : k < AMB * 0.6 ? 1 : k < AMB * 0.8 ? 2 : 3;
      grp[k] = g;
      let q;
      if (g === 0) q = onSphere(35 + rand() * 70);
      else q = [(rand() - 0.5) * 22, (rand() - 0.5) * 13, -11 + rand() * 12.5];
      pos[k * 3] = q[0]; pos[k * 3 + 1] = q[1]; pos[k * 3 + 2] = q[2];
      seed[k * 4] = rand(); seed[k * 4 + 1] = rand(); seed[k * 4 + 2] = rand(); seed[k * 4 + 3] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    g.setAttribute("aGroup", new THREE.BufferAttribute(grp, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    const m = new THREE.ShaderMaterial({
      uniforms: ambUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec4 aSeed;
        attribute float aGroup;
        uniform float uTime, uPR, uScroll, uAspect;
        uniform vec4 uW;
        uniform vec3 uShock[3];
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float t = uTime, size = 1.6, alpha = 0.0;
          vec3 col = vec3(1.0);
          if (aGroup < 0.5) {            // stars
            float tw = sin(t * (1.0 + aSeed.x * 4.0) + aSeed.y * 40.0);
            alpha = (0.25 + 0.75 * tw * tw) * (0.3 + 0.7 * aSeed.z) * uW.x;
            size = 1.0 + 2.2 * aSeed.z * aSeed.z;
            col = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), aSeed.w);
            float a = t * 0.012; float c = cos(a), s = sin(a);
            p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
          } else if (aGroup < 1.5) {     // quantum foam
            float life = fract(t * (0.25 + aSeed.x * 0.5) + aSeed.y);
            float cyc = floor(t * (0.25 + aSeed.x * 0.5) + aSeed.y);
            p.xy += (fract(sin(vec2(cyc, cyc + 3.7) * (12.9898 + aSeed.z)) * 43758.5453) - 0.5) * 5.0;
            p += 0.6 * vec3(sin(t * 2.0 + aSeed.x * 30.0), cos(t * 2.3 + aSeed.y * 30.0), 0.0) * life;
            alpha = sin(3.14159 * life) * uW.y * (0.4 + 0.6 * aSeed.w);
            size = 1.5 + 4.0 * aSeed.w * sin(3.14159 * life);
            col = mix(vec3(0.35, 0.8, 1.0), vec3(0.75, 0.5, 1.0), aSeed.z);
          } else if (aGroup < 2.5) {     // Brownian gas
            p += 0.9 * vec3(sin(t * 0.7 + aSeed.x * 50.0) + 0.4 * sin(t * 7.0 + aSeed.y * 90.0),
                            cos(t * 0.6 + aSeed.y * 50.0) + 0.4 * sin(t * 6.3 + aSeed.z * 90.0),
                            sin(t * 0.5 + aSeed.z * 50.0));
            alpha = (0.3 + 0.5 * aSeed.w) * uW.z;
            size = 1.6 + 3.2 * aSeed.w;
            col = mix(vec3(0.6, 0.85, 1.0), vec3(1.0, 0.95, 0.8), aSeed.x);
          } else {                       // embers
            float sp = 0.5 + 1.6 * aSeed.x;
            p.y = mod(p.y + t * sp + 6.5, 13.0) - 6.5;
            p.x += 0.5 * sin(t * (0.8 + aSeed.y) + aSeed.z * 20.0 + p.y * 0.7);
            float up = (p.y + 6.5) / 13.0;
            alpha = (1.0 - up) * (0.5 + 0.5 * sin(t * 9.0 * aSeed.w + aSeed.y * 30.0)) * uW.w;
            size = 1.5 + 3.5 * aSeed.w * (1.0 - up);
            col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.8, 0.3), aSeed.z * (1.0 - up));
          }
          if (aGroup > 0.5) p.y = mod(p.y + uScroll * (0.5 + aSeed.w) + 6.5, 13.0) - 6.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // click shockwaves sweep through the background as well
          vec4 clip = projectionMatrix * mv;
          vec2 ndc = clip.xy / clip.w;
          float glow = 0.0;
          for (int q = 0; q < 3; q++) {
            vec2 ds = (ndc - uShock[q].xy) * vec2(uAspect, 1.0);
            float age = uShock[q].z;
            float ring = exp(-pow(length(ds) - age * 1.5, 2.0) / (0.012 + 0.02 * age)) * exp(-age * 0.75);
            mv.xy += normalize(ds + 1e-5) * ring * 0.09 * -mv.z;
            glow += ring;
          }
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * uPR * (1.0 + 1.5 * glow);
          vColor = mix(col, vec3(1.0), clamp(glow, 0.0, 0.7)); vAlpha = alpha * (1.0 + 3.0 * glow);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25 || vAlpha < 0.004) discard;
          gl_FragColor = vec4(vColor, exp(-d * 12.0) * vAlpha);
        }
      `,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 1;
    scene.add(pts);
  }

  // Distant galaxies.
  const galUniforms = { uTime: { value: 0 }, uPR: { value: PR }, uW: { value: 0 } };
  {
    const NG = isMobile ? 9 : 16, PER = isMobile ? 260 : 420, n = NG * PER;
    const cen = new Float32Array(n * 3), U = new Float32Array(n * 3), V = new Float32Array(n * 3);
    const pol = new Float32Array(n * 4), col = new Float32Array(n * 3);
    let k = 0;
    for (let g = 0; g < NG; g++) {
      const c = [(rand() - 0.5) * 46, (rand() - 0.5) * 26, -22 - rand() * 26];
      { // keep the middle of the frame for the main cloud
        const k0 = Math.max(Math.abs(c[0]) / 13, Math.abs(c[1]) / 7.5) * (22 / -c[2]);
        if (k0 < 1) { c[0] /= k0 + 0.05; c[1] /= k0 + 0.05; }
      }
      const u = onSphere(1), w = onSphere(1);
      const v = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const vl = Math.hypot(v[0], v[1], v[2]) || 1;
      const size = 1.2 + rand() * 2.6, spiral = rand() < 0.7, arms = 2 + Math.floor(rand() * 2);
      const wind = 1.5 + rand() * 2.5, sense = rand() < 0.5 ? -1 : 1;
      const tint = [0.75 + rand() * 0.25, 0.75 + rand() * 0.2, 0.8 + rand() * 0.2];
      for (let q = 0; q < PER; q++, k++) {
        let r, th;
        if (!spiral || q < PER * 0.3) { r = Math.abs(gauss()) * 0.22 * size * (spiral ? 1 : 1.8); th = rand() * TAU; }
        else {
          const t = Math.pow(rand(), 0.8);
          r = (0.15 + t * 0.85) * size;
          th = sense * t * wind + Math.floor(rand() * arms) * TAU / arms + gauss() * 0.22;
        }
        cen.set(c, k * 3); U.set(u, k * 3);
        V[k * 3] = v[0] / vl; V[k * 3 + 1] = v[1] / vl; V[k * 3 + 2] = v[2] / vl;
        pol[k * 4] = r; pol[k * 4 + 1] = th; pol[k * 4 + 2] = sense * (0.05 + rand() * 0.05); pol[k * 4 + 3] = rand();
        const core = Math.exp(-r / (0.3 * size));
        col[k * 3] = lerp(tint[0] * 0.75, 1.0, core); col[k * 3 + 1] = lerp(tint[1] * 0.8, 0.9, core); col[k * 3 + 2] = lerp(tint[2], 0.75, core);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(cen, 3));
    g.setAttribute("aU", new THREE.BufferAttribute(U, 3));
    g.setAttribute("aV", new THREE.BufferAttribute(V, 3));
    g.setAttribute("aPol", new THREE.BufferAttribute(pol, 4));
    g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    const m = new THREE.ShaderMaterial({
      uniforms: galUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aU, aV, aCol;
        attribute vec4 aPol;
        uniform float uTime, uPR, uW;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float th = aPol.y + uTime * aPol.z * (1.0 + 1.0 / (0.6 + aPol.x));
          vec3 p = position + (cos(th) * aU + sin(th) * aV) * aPol.x
                 + cross(aU, aV) * (aPol.w - 0.5) * 0.08 * aPol.x;
          p.x += sin(uTime * 0.03 + position.y) * 0.6; // the whole field drifts
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.0 + 1.6 * aPol.w) * uPR;
          vColor = aCol;
          vAlpha = uW * (0.2 + 0.5 * aPol.w);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25 || vAlpha < 0.004) discard;
          gl_FragColor = vec4(vColor, exp(-d * 10.0) * vAlpha);
        }
      `,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 0;
    scene.add(pts);
  }

  // Click sparks: each click throws a ring of sparks from the pointer that
  // keeps going until it is off-screen, so the wave has no edge.
  const SPARKS = isMobile ? 160 : 320, BURSTS = 3;
  const spStart = new Float32Array(SPARKS * BURSTS * 3), spDir = new Float32Array(SPARKS * BURSTS * 3), spBirth = new Float32Array(SPARKS * BURSTS).fill(-99);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute("position", new THREE.BufferAttribute(spStart, 3).setUsage(THREE.DynamicDrawUsage));
  spGeo.setAttribute("aDir", new THREE.BufferAttribute(spDir, 3).setUsage(THREE.DynamicDrawUsage));
  spGeo.setAttribute("aBirth", new THREE.BufferAttribute(spBirth, 1).setUsage(THREE.DynamicDrawUsage));
  spGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
  const spUniforms = { uTime: uniforms.uTime, uPR: { value: PR } };
  {
    const m = new THREE.ShaderMaterial({
      uniforms: spUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aDir;   // xy = direction * speed, z = seed
        attribute float aBirth;
        uniform float uTime, uPR;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float age = uTime - aBirth;
          float life = 2.6 + aDir.z;
          vec3 p = position;
          p.xy += aDir.xy * age * (1.0 + 0.35 * age);            // accelerating outward
          p.xy += 0.12 * age * vec2(sin(age * 5.0 + aDir.z * 40.0), cos(age * 4.3 + aDir.z * 31.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          float k = clamp(1.0 - age / life, 0.0, 1.0);
          vAlpha = (age < 0.0 || age > life) ? 0.0 : k * k;
          gl_PointSize = (1.5 + 3.5 * fract(aDir.z * 7.7)) * uPR * (0.6 + 0.8 * k);
          vColor = mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 0.8, 0.55), fract(aDir.z * 3.3));
          vColor = mix(vColor, vec3(1.0), k * k);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25 || vAlpha < 0.004) discard;
          gl_FragColor = vec4(vColor, exp(-d * 10.0) * vAlpha);
        }
      `,
    });
    const pts = new THREE.Points(spGeo, m);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    scene.add(pts);
  }
  let spBurst = 0;
  function emitSparks(wx, wy, t) {
    const o = spBurst * SPARKS;
    spBurst = (spBurst + 1) % BURSTS;
    for (let k = 0; k < SPARKS; k++) {
      const a = rand() * TAU, sp = 1.6 + rand() * 3.2, i3 = (o + k) * 3;
      spStart[i3] = wx; spStart[i3 + 1] = wy; spStart[i3 + 2] = 0.2;
      spDir[i3] = Math.cos(a) * sp; spDir[i3 + 1] = Math.sin(a) * sp; spDir[i3 + 2] = rand();
      spBirth[o + k] = t;
    }
    spGeo.attributes.position.needsUpdate = spGeo.attributes.aDir.needsUpdate = spGeo.attributes.aBirth.needsUpdate = true;
  }

  // Streaks: comets and meteors in space, fast particle tracks at small scales.
  const STREAKS = isMobile ? 5 : 9, TAIL = 64;
  const stPos = new Float32Array(STREAKS * TAIL * 3), stCol = new Float32Array(STREAKS * TAIL * 4), stSize = new Float32Array(STREAKS * TAIL);
  const stGeo = new THREE.BufferGeometry();
  stGeo.setAttribute("position", new THREE.BufferAttribute(stPos, 3).setUsage(THREE.DynamicDrawUsage));
  stGeo.setAttribute("aCol", new THREE.BufferAttribute(stCol, 4).setUsage(THREE.DynamicDrawUsage));
  stGeo.setAttribute("aSize", new THREE.BufferAttribute(stSize, 1).setUsage(THREE.DynamicDrawUsage));
  stGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
  {
    const m = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: PR } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec4 aCol;
        attribute float aSize;
        uniform float uPR;
        varying vec4 vCol;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPR;
          vCol = aCol;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vCol;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25 || vCol.a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb, exp(-d * 9.0) * vCol.a);
        }
      `,
    });
    const pts = new THREE.Points(stGeo, m);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    scene.add(pts);
  }
  const streaks = [];
  for (let q = 0; q < STREAKS; q++) streaks.push({ life: 0, dur: 1, jit: Array.from({ length: TAIL * 2 }, gauss) });
  let streakTimer = 0.5;
  function spawnStreak(space, micro) {
    const st = streaks.find((x) => x.life <= 0);
    if (!st) return;
    const z = -9 + rand() * 6, hw = 12 * (1 - z / 14), hh = 7 * (1 - z / 14);
    const comet = space > micro ? rand() < 0.45 : false;
    const fromLeft = rand() < 0.5;
    st.x = (fromLeft ? -1 : 1) * hw * (0.5 + rand() * 0.6);
    st.y = hh * (0.2 + rand() * 0.9) * (micro > space && rand() < 0.4 ? -1 : 1);
    st.z = z;
    const speed = micro > space ? 22 + rand() * 18 : comet ? 2.2 + rand() * 2 : 9 + rand() * 10;
    const ang = (fromLeft ? 0 : Math.PI) + (fromLeft ? -1 : 1) * (0.25 + rand() * 0.5) * (st.y > 0 ? 1 : -1);
    st.vx = Math.cos(ang) * speed; st.vy = Math.sin(ang) * speed;
    st.len = micro > space ? 1.6 + rand() * 2 : comet ? 2.6 + rand() * 2.5 : 1.2 + rand() * 1.6;
    st.width = comet ? 0.16 : 0.015;
    st.head = comet ? 7 : 3.2;
    st.dur = (2 * hw + 6) / speed;
    st.life = st.dur;
    st.col = micro > space ? (rand() < 0.5 ? [0.45, 0.85, 1] : [0.8, 0.6, 1]) : comet ? [0.65, 0.9, 1] : [1, 0.93, 0.8];
    st.curve = micro > space ? (rand() - 0.5) * 9 : 0; // charged tracks bend in a field
  }
  function updateStreaks(dt, space, micro) {
    streakTimer -= dt * (0.35 + 1.5 * space + 1.1 * micro);
    if (streakTimer <= 0) { spawnStreak(space, micro); streakTimer = 0.5 + rand() * 1.1; }
    for (let q = 0; q < STREAKS; q++) {
      const st = streaks[q], o = q * TAIL;
      if (st.life <= 0) { for (let j = 0; j < TAIL; j++) stCol[(o + j) * 4 + 3] = 0; continue; }
      st.life -= dt;
      if (st.curve) { const c = Math.cos(st.curve * dt * 0.1), sn = Math.sin(st.curve * dt * 0.1), vx = st.vx; st.vx = c * vx - sn * st.vy; st.vy = sn * vx + c * st.vy; }
      st.x += st.vx * dt; st.y += st.vy * dt;
      const sp = Math.hypot(st.vx, st.vy), dx = st.vx / sp, dy = st.vy / sp;
      const fade = Math.min(1, st.life / 0.4, (st.dur - st.life) / 0.25);
      for (let j = 0; j < TAIL; j++) {
        const u = j / (TAIL - 1), w = st.width * u * 2;
        const i3 = (o + j) * 3, i4 = (o + j) * 4;
        stPos[i3] = st.x - dx * u * st.len - dy * st.jit[j * 2] * w;
        stPos[i3 + 1] = st.y - dy * u * st.len + dx * st.jit[j * 2] * w + st.jit[j * 2 + 1] * w * 0.5;
        stPos[i3 + 2] = st.z;
        const a = (1 - u) * (1 - u) * fade;
        stCol[i4] = lerp(1, st.col[0], Math.min(1, u * 3)); stCol[i4 + 1] = lerp(1, st.col[1], Math.min(1, u * 3)); stCol[i4 + 2] = lerp(1, st.col[2], Math.min(1, u * 3));
        stCol[i4 + 3] = a;
        stSize[o + j] = j === 0 ? st.head : 1.2 + 2.2 * (1 - u);
      }
    }
    stGeo.attributes.position.needsUpdate = stGeo.attributes.aCol.needsUpdate = stGeo.attributes.aSize.needsUpdate = true;
  }

  // Upload the pair of shapes the cloud is travelling between.
  let loadedPair = -1;
  function loadPair(i) {
    if (i === loadedPair) return;
    loadedPair = i;
    const A = getShape(i), B = getShape(Math.min(i + 1, shapes.length - 1));
    aPosA.array.set(A.pos); aPosB.array.set(B.pos);
    aFieldA.array.set(A.field); aFieldB.array.set(B.field);
    aPosA.needsUpdate = aPosB.needsUpdate = aFieldA.needsUpdate = aFieldB.needsUpdate = true;
    uniforms.uTiltA.value = A.tilt;
    uniforms.uTiltB.value = B.tilt;
  }

  // ====================================================
  // SCROLL -> story position.
  // s = i + f means "between section i and i+1, f of the way", measured
  // between section centres. Shapes hold while their section is centred
  // and pour into the next one in between.
  // ====================================================
  let centres = [];
  function measure() {
    const y = window.scrollY;
    centres = sections.map((s) => {
      const r = s.getBoundingClientRect();
      return r.top + y + Math.min(r.height, window.innerHeight) / 2;
    });
  }
  function storyPosition() {
    const y = window.scrollY + window.innerHeight / 2;
    if (!centres.length || y <= centres[0]) return 0;
    for (let i = 0; i < centres.length - 1; i++) {
      if (y < centres[i + 1]) return i + (y - centres[i]) / (centres[i + 1] - centres[i]);
    }
    return centres.length - 1;
  }

  // ----- Resize -----
  // Measure the canvas itself, never the window: on iOS the canvas is the
  // large viewport and stays put when the address bar collapses, while
  // innerHeight jumps ~100px. Sizing from the element keeps the scene still.
  let W = 0, H = 0;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uAspect.value = w / h;
    measure();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  window.addEventListener("load", measure);
  resize();

  // ----- Scale ruler + progress bar -----
  const progressBar = document.querySelector(".home-progress__bar");
  const scaleDot   = document.getElementById("home-scale-dot");
  const scaleLabel = document.getElementById("home-scale-label");
  // Exponents are set with <sup>, not Unicode superscript characters: those
  // come from different parts of a font (¹ vs ⁵) and render at uneven sizes.
  const sci = (e) => "10<sup>" + String(e).replace("-", "\u2212") + "</sup> m";
  const SCALE_FOR_SCENE = {
    qubits: sci(-15), quantum: sci(-15), dft: sci(-10), md: sci(-9),
    mantle: sci(6), planet: sci(7), solar: sci(11), galaxy: sci(21), outro: sci(21),
  };
  let shownLabel = "";
  let labelSeeded = false;
  function applyReadout(s) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    if (progressBar) progressBar.style.transform = "scaleX(" + (pct / 100).toFixed(4) + ")";
    if (scaleDot) scaleDot.style.top = pct.toFixed(2) + "%";
    if (!scaleLabel) return;
    const sec = sections[Math.min(sections.length - 1, Math.round(s))];
    const label = (sec && SCALE_FOR_SCENE[sec.dataset.scene]) || shownLabel;
    if (label !== shownLabel) {
      shownLabel = label;
      scaleLabel.innerHTML = label;
      if (labelSeeded) {
        gsap.fromTo(scaleLabel, { y: 8, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.45, ease: "power2.out", overwrite: true });
      }
    }
    labelSeeded = true;
  }

  // ----- Pointer -----
  // Moving the cursor pushes and swirls the particles near it; it does not
  // rotate the shapes.
  // Clicking / tapping empty space sends a shockwave through the cloud and
  // triggers the current scene's own event (a gate pulse, a π pulse, a
  // shock, a surge of convection, an earthquake, a flare, a supernova…).
  const pointer = { x: 9, y: 9, active: 0, px: 0, py: 0, speed: 0 };
  const lean = { x: 0, y: 0 };
  let chaosKick = 0;
  let shockSlot = 0;
  const clock = new THREE.Clock();
  if (!isMobile) {
    window.addEventListener("pointermove", (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -((e.clientY / window.innerHeight) * 2 - 1);
      if (pointer.active) {
        const dx = x - pointer.x, dy = y - pointer.y;
        pointer.speed = Math.min(3, pointer.speed + Math.hypot(dx, dy) * 6);
      }
      pointer.x = x; pointer.y = y;
      pointer.active = 1;
    }, { passive: true });
    document.addEventListener("pointerleave", () => { pointer.active = 0; });
  }
  window.addEventListener("pointerdown", (e) => {
    if (e.button || (e.target.closest && e.target.closest("a, button, input, textarea, select, label, nav, form, .home-outro__card"))) return;
    const v = uniforms.uShock.value[shockSlot];
    shockSlot = (shockSlot + 1) % 3;
    // Screen position; the shader's projection already includes the view shift.
    v.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1), 0);
    // the same point in the cloud's plane (z = 0), for the sparks
    const halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
    emitSparks((v.x - viewShift * 2) * halfH * camera.aspect + camera.position.x, v.y * halfH + camera.position.y, clock.elapsedTime);
    chaosKick = Math.min(1.5, chaosKick + 0.8);
    const sh = shapes[Math.min(shapes.length - 1, Math.round(story))];
    if (sh && sh.poke) sh.poke(clock.elapsedTime);
  }, { passive: true });

  // ====================================================
  // EQUATIONS — the maths behind each scale, as part of the picture (not in
  // the copy). Each scene's equations stream around the particle figure on a
  // tilted ring: they pass in front of it large and bright, swing round the
  // back small and dim, and the whole ring speeds up while you scroll.
  // Typeset with KaTeX when it has loaded; skipped otherwise.
  // ====================================================
  const EQUATIONS = {
    qubits: [   // quantum annealing / QUBO
      "H(s) = -A(s)\\sum_i \\sigma^x_i + B(s)\\Big[\\sum_{i<j} J_{ij}\\,\\sigma^z_i \\sigma^z_j + \\sum_i h_i\\,\\sigma^z_i\\Big]",
      "\\min_{x \\in \\{0,1\\}^n} \\|A x - b\\|^2 = x^{\\mathsf T}(A^{\\mathsf T}\\!A)\\,x - 2\\,b^{\\mathsf T}\\!A\\,x + b^{\\mathsf T} b",
      "t_f \\gg \\max_{s}\\frac{\\big|\\langle 1(s)|\\,\\partial_s H\\,|0(s)\\rangle\\big|}{\\Delta_{\\min}^2}",
      "\\dot\\rho = -\\tfrac{i}{\\hbar}[H,\\rho] + \\sum_k \\Big(L_k\\,\\rho\\,L_k^\\dagger - \\tfrac12\\big\\{L_k^\\dagger L_k,\\rho\\big\\}\\Big)",
      "p(\\mathbf s) = \\frac{e^{-\\beta E(\\mathbf s)}}{\\sum_{\\mathbf s'} e^{-\\beta E(\\mathbf s')}}",
      "m_k = \\sum_{r=0}^{R-1} 2^{\\,r-R}\\,q_{k,r}\\,\\Delta m + m_k^{\\min}",
    ],
    quantum: [  // gate-based and hybrid quantum–classical inversion
      "|\\psi\\rangle = \\cos\\tfrac{\\theta}{2}\\,|0\\rangle + e^{i\\varphi}\\sin\\tfrac{\\theta}{2}\\,|1\\rangle",
      "U(t) = \\mathcal T \\exp\\!\\Big(-\\tfrac{i}{\\hbar}\\int_0^t \\hat H(t')\\,dt'\\Big)",
      "|\\psi(\\boldsymbol\\theta)\\rangle = \\prod_{l=1}^{L} W_l\\,\\Big[\\bigotimes_{q} R_y(\\theta_{l,q})\\Big]\\,|0\\rangle^{\\otimes n}",
      "\\boldsymbol\\theta^* = \\arg\\min_{\\boldsymbol\\theta} \\,\\langle\\psi(\\boldsymbol\\theta)|\\hat H|\\psi(\\boldsymbol\\theta)\\rangle",
      "\\frac{\\partial \\langle \\hat O\\rangle}{\\partial\\theta_k} = \\tfrac12\\Big[\\langle \\hat O\\rangle_{\\theta_k+\\frac{\\pi}{2}} - \\langle \\hat O\\rangle_{\\theta_k-\\frac{\\pi}{2}}\\Big]",
      "\\mathcal L = \\lambda_{\\mathrm{PDE}}\\Big\\|\\frac{1}{\\alpha^2}\\frac{\\partial^2\\phi}{\\partial t^2} - \\nabla^2\\phi\\Big\\|^2 + \\lambda_{\\mathrm{data}}\\big\\|\\nabla\\phi - \\mathbf u_{\\mathrm{obs}}\\big\\|^2",
    ],
    dft: [      // density functional theory
      "\\Big[-\\tfrac{\\hbar^2}{2m}\\nabla^2 + v_{\\mathrm{eff}}(\\mathbf r)\\Big]\\varphi_i(\\mathbf r) = \\varepsilon_i\\,\\varphi_i(\\mathbf r)",
      "v_{\\mathrm{eff}}(\\mathbf r) = v_{\\mathrm{ext}}(\\mathbf r) + \\int \\frac{n(\\mathbf r')}{|\\mathbf r - \\mathbf r'|}\\,d\\mathbf r' + \\frac{\\delta E_{xc}[n]}{\\delta n(\\mathbf r)}",
      "E[n] = T_s[n] + \\int v_{\\mathrm{ext}}\\,n\\,d\\mathbf r + \\tfrac12\\!\\iint \\frac{n(\\mathbf r)\\,n(\\mathbf r')}{|\\mathbf r - \\mathbf r'|}\\,d\\mathbf r\\,d\\mathbf r' + E_{xc}[n]",
      "E_{xc}^{\\mathrm{GGA}}[n] = \\int n(\\mathbf r)\\,\\varepsilon_{xc}\\big(n, \\nabla n\\big)\\,d\\mathbf r",
      "\\mathbf F_I = -\\Big\\langle \\psi \\Big| \\frac{\\partial \\hat H}{\\partial \\mathbf R_I} \\Big| \\psi \\Big\\rangle",
      "\\psi_{n\\mathbf k}(\\mathbf r) = \\sum_{\\mathbf G} c_{n,\\mathbf k+\\mathbf G}\\,e^{i(\\mathbf k+\\mathbf G)\\cdot\\mathbf r}",
      "\\psi_{320} = \\frac{1}{81\\sqrt{6\\pi}}\\,a_0^{-3/2}\\Big(\\frac{r}{a_0}\\Big)^{2} e^{-r/3a_0}\\,(3\\cos^2\\theta - 1)",
    ],
    md: [       // molecular dynamics of silica
      "\\mathbf r(t+\\Delta t) = 2\\mathbf r(t) - \\mathbf r(t-\\Delta t) + \\frac{\\mathbf F(t)}{m}\\Delta t^2 + \\mathcal O(\\Delta t^4)",
      "U_{ij} = \\frac{q_i q_j}{4\\pi\\varepsilon_0 r_{ij}} + A_{ij}\\,e^{-r_{ij}/\\rho_{ij}} - \\frac{C_{ij}}{r_{ij}^6}",
      "\\dot\\xi = \\frac{1}{Q}\\Big(\\sum_i \\frac{\\mathbf p_i^2}{m_i} - 3N k_B T\\Big), \\quad \\dot{\\mathbf p}_i = \\mathbf F_i - \\xi\\,\\mathbf p_i",
      "P = \\frac{N k_B T}{V} + \\frac{1}{3V}\\Big\\langle \\sum_{i<j} \\mathbf r_{ij}\\cdot\\mathbf F_{ij} \\Big\\rangle",
      "g(r) = \\frac{V}{4\\pi r^2 N^2}\\Big\\langle \\sum_{i\\neq j} \\delta(r - r_{ij}) \\Big\\rangle",
      "S(q) = 1 + 4\\pi\\rho\\int_0^\\infty r^2\\,\\big[g(r) - 1\\big]\\frac{\\sin qr}{qr}\\,dr",
    ],
    mantle: [   // mantle convection and high-pressure mineral physics
      "\\mathrm{Ra} = \\frac{\\rho\\, g\\, \\alpha\\, \\Delta T\\, d^3}{\\kappa\\,\\eta}",
      "-\\nabla p + \\nabla\\cdot\\Big[\\eta\\big(\\nabla\\mathbf u + \\nabla\\mathbf u^{\\mathsf T}\\big)\\Big] + \\rho_0\\, g\\, \\alpha\\,(T - T_0)\\,\\hat{\\mathbf r} = 0",
      "\\rho c_p\\Big(\\frac{\\partial T}{\\partial t} + \\mathbf u\\cdot\\nabla T\\Big) = \\nabla\\cdot(k\\,\\nabla T) + \\rho H + \\boldsymbol\\tau : \\dot{\\boldsymbol\\varepsilon}",
      "P = \\tfrac{3K_0}{2}\\Big[\\big(\\tfrac{V_0}{V}\\big)^{7/3} - \\big(\\tfrac{V_0}{V}\\big)^{5/3}\\Big]\\Big\\{1 + \\tfrac34 (K_0' - 4)\\Big[\\big(\\tfrac{V_0}{V}\\big)^{2/3} - 1\\Big]\\Big\\}",
      "P(V,T) = P_{0}(V) + \\frac{\\gamma(V)}{V}\\Big[E_{\\mathrm{th}}(V,T) - E_{\\mathrm{th}}(V,T_0)\\Big]",
      "E_{\\mathrm{th}} = 9 n R\\,T\\Big(\\frac{T}{\\Theta_D}\\Big)^{3}\\int_0^{\\Theta_D/T} \\frac{x^3}{e^x - 1}\\,dx",
      "\\eta = \\eta_0 \\exp\\!\\Big(\\frac{E^* + P V^*}{R\\,T}\\Big)",
    ],
    planet: [   // seismology, ambient noise, full-waveform inversion
      "\\rho\\,\\frac{\\partial^2 u_i}{\\partial t^2} = \\frac{\\partial}{\\partial x_j}\\Big(c_{ijkl}\\,\\frac{\\partial u_k}{\\partial x_l}\\Big) + f_i",
      "\\chi(\\mathbf m) = \\tfrac12 \\sum_{s,r}\\int_0^T \\big\\| \\mathbf d_{\\mathrm{obs}}(\\mathbf x_r,t) - \\mathbf u(\\mathbf x_r,t;\\mathbf m) \\big\\|^2 dt",
      "\\frac{\\partial \\chi}{\\partial m} = -\\int_0^T\\!\\!\\int_\\Omega \\mathbf u^{\\dagger}(\\mathbf x, T-t)\\cdot\\frac{\\partial \\mathcal L}{\\partial m}\\,\\mathbf u(\\mathbf x,t)\;d\\mathbf x\\,dt",
      "\\frac{d}{dt}\\,C_{AB}(t) \\propto -G_{AB}(t) + G_{AB}(-t)",
      "\\int_\\Omega \\rho\\,\\mathbf w\\cdot\\ddot{\\mathbf u}\\,d\\Omega + \\int_\\Omega \\nabla\\mathbf w : \\mathbf c : \\nabla\\mathbf u\\,d\\Omega = \\int_\\Omega \\mathbf w\\cdot\\mathbf f\\,d\\Omega",
      "\\mathbf m_{k+1} = \\mathbf m_k - \\alpha_k\\,\\mathbf H_k^{-1}\\,\\nabla_{\\mathbf m}\\chi(\\mathbf m_k)",
    ],
    solar: [    // orbits and planetary interiors
      "v^2 = G M\\Big(\\frac{2}{r} - \\frac{1}{a}\\Big), \\quad T^2 = \\frac{4\\pi^2}{G M}\\,a^3",
      "\\frac{dP}{dr} = -\\frac{G\\,m(r)\\,\\rho(r)}{r^2}, \\quad \\frac{dm}{dr} = 4\\pi r^2 \\rho(r)",
      "\\frac{1}{\\xi^2}\\frac{d}{d\\xi}\\Big(\\xi^2\\frac{d\\theta}{d\\xi}\\Big) = -\\theta^{\\,n}",
      "\\dot E_{\\mathrm{tidal}} = -\\frac{21}{2}\\,\\mathrm{Im}(k_2)\\,\\frac{n^5 R^5}{G}\\,e^2",
      "T_{\\mathrm{eq}} = T_\\star \\sqrt{\\frac{R_\\star}{2a}}\\,(1 - A)^{1/4}",
      "\\frac{R_p}{R_\\oplus} \\approx \\Big(\\frac{M_p}{M_\\oplus}\\Big)^{0.27}",
    ],
    galaxy: [   // galactic dynamics and cosmology
      "\\frac{\\partial f}{\\partial t} + \\mathbf v\\cdot\\nabla_{\\mathbf x} f - \\nabla\\Phi\\cdot\\nabla_{\\mathbf v} f = 0",
      "\\nabla^2\\Phi = 4\\pi G\\rho, \\quad v_c^2(r) = r\\,\\frac{\\partial\\Phi}{\\partial r}",
      "\\rho(r) = \\frac{\\rho_0}{\\dfrac{r}{r_s}\\Big(1 + \\dfrac{r}{r_s}\\Big)^{2}}",
      "Q = \\frac{\\sigma_R\\,\\kappa}{3.36\\,G\\,\\Sigma} > 1",
      "m^2(\\Omega_p - \\Omega)^2 = \\kappa^2 - 2\\pi G\\,\\Sigma\\,|k|",
      "\\Big(\\frac{\\dot a}{a}\\Big)^2 = \\frac{8\\pi G}{3}\\rho - \\frac{k c^2}{a^2} + \\frac{\\Lambda c^2}{3}",
    ],
    outro: [    // π
      "\\frac{1}{\\pi} = \\frac{2\\sqrt2}{9801}\\sum_{k=0}^{\\infty}\\frac{(4k)!\\,(1103 + 26390k)}{(k!)^4\\,396^{4k}}",
      "\\pi = \\sum_{k=0}^{\\infty}\\frac{1}{16^k}\\Big(\\frac{4}{8k+1} - \\frac{2}{8k+4} - \\frac{1}{8k+5} - \\frac{1}{8k+6}\\Big)",
      "\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}",
      "\\zeta(2) = \\sum_{n=1}^{\\infty}\\frac{1}{n^2} = \\prod_{p}\\frac{1}{1 - p^{-2}} = \\frac{\\pi^2}{6}",
      "n! = \\sqrt{2\\pi n}\\,\\Big(\\frac{n}{e}\\Big)^n\\Big(1 + \\frac{1}{12n} + \\mathcal O(n^{-2})\\Big)",
      "\\frac{\\pi}{2} = \\prod_{n=1}^{\\infty} \\frac{4n^2}{4n^2 - 1}",
    ],
  };
  const eqItems = [];
  let eqLayer = null;
  (function buildEquations() {
    if (!window.katex) return;
    eqLayer = document.createElement("div");
    eqLayer.className = "home-eqs";
    eqLayer.setAttribute("aria-hidden", "true");
    canvas.insertAdjacentElement("afterend", eqLayer);
    SCENE_KEYS.forEach((key) => {
      const list = (EQUATIONS[key] || []).slice(0, isMobile ? 3 : 99);
      const centred = key === "qubits" || key === "outro";
      list.forEach((tex, n) => {
        const el = document.createElement("div");
        el.className = "home-eq";
        try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); }
        catch (err) { return; }
        eqLayer.appendChild(el);
        eqItems.push({
          el, key, centred,
          a0: (n + rand() * 0.6) / list.length * TAU, // where it first appears around the figure
          x: 0, y: 0, vx: 0, vy: 0, placed: false, hw: 0, hh: 0,
          f: [0.6 + rand() * 0.8, 0.6 + rand() * 0.8, 0.6 + rand() * 0.8, 0.6 + rand() * 0.8],
          ph: [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU],
          shown: -1,
        });
      });
    });
  })();
  // Each equation is a little body that wanders on its own: a slowly turning
  // random heading pushes it around, the figure's core pushes it out, the
  // edges of its region and the other equations push it back, and scrolling
  // gives everything a shove. Depth (size, brightness) drifts independently.
  function updateEquations(t, dt) {
    if (!eqLayer) return;
    const cx = W * (0.5 + viewShift), cy = H * 0.5;
    const active = [];
    for (const q of eqItems) {
      let w = sceneW[q.key] || 0;
      w = w * w * (3 - 2 * w);
      if (w < 0.004) {
        if (q.shown !== 0) { q.shown = 0; q.placed = false; q.el.style.opacity = "0"; q.el.style.visibility = "hidden"; }
        continue;
      }
      q.shown = 1; q.w = w;
      // the figure's footprint, and the region the equations may roam
      q.ax = isMobile ? W * 0.3 : q.centred ? W * 0.26 : H * 0.31;
      q.ay = isMobile ? H * 0.22 : H * 0.3;
      if (!q.hw) { q.hw = q.el.offsetWidth / 2 || 80; q.hh = q.el.offsetHeight / 2 || 20; }
      if (!q.placed) {
        q.placed = true;
        q.x = cx + Math.cos(q.a0) * q.ax * 1.25; q.y = cy + Math.sin(q.a0) * q.ay * 1.25;
        q.vx = (rand() - 0.5) * 40; q.vy = (rand() - 0.5) * 40;
      }
      active.push(q);
    }
    for (const q of active) {
      // wander: a heading that turns smoothly and unpredictably
      const th = Math.sin(t * 0.17 * q.f[0] + q.ph[0]) * 3.3 + Math.sin(t * 0.093 * q.f[1] + q.ph[1]) * 2.9 + t * 0.05 * (q.f[2] - 1);
      let fx = Math.cos(th) * 26, fy = Math.sin(th) * 22;
      // stay out of the figure's core, but don't stray far from it
      const dx = q.x - cx, dy = q.y - cy;
      const e = Math.hypot(dx / q.ax, dy / q.ay) + 1e-3;
      if (e < 0.95) { const k = (0.95 - e) * 260 / e; fx += dx / q.ax * k; fy += dy / q.ay * k; }
      else if (e > 1.7) { const k = (e - 1.7) * 60 / e; fx -= dx / q.ax * k; fy -= dy / q.ay * k; }
      // region walls (beside the copy, the left wall is the text column)
      const xmin = (!q.centred && !isMobile ? W * 0.44 : 16) + q.hw, xmax = W - (isMobile ? 16 : 70) - q.hw;
      const ymin = H * 0.12 + q.hh, ymax = H * 0.93 - q.hh;
      if (q.x < xmin) fx += (xmin - q.x) * 4; else if (q.x > xmax) fx -= (q.x - xmax) * 4;
      if (q.y < ymin) fy += (ymin - q.y) * 4; else if (q.y > ymax) fy -= (q.y - ymax) * 4;
      // equations keep clear of one another
      for (const o of active) {
        if (o === q) continue;
        const ox = (q.hw + o.hw + 18) - Math.abs(q.x - o.x), oy = (q.hh + o.hh + 12) - Math.abs(q.y - o.y);
        if (ox > 0 && oy > 0) {
          if (ox * 0.35 < oy) fx += (q.x < o.x ? -1 : 1) * Math.min(ox, 90) * 4.5;
          else fy += (q.y < o.y ? -1 : 1) * Math.min(oy, 90) * 7;
        }
      }
      fy -= scrollVel * 55 * q.f[3];
      q.vx = (q.vx + fx * dt) * Math.exp(-dt * 0.9);
      q.vy = (q.vy + fy * dt) * Math.exp(-dt * 0.9);
      const sp = Math.hypot(q.vx, q.vy);
      if (sp > 150) { q.vx *= 150 / sp; q.vy *= 150 / sp; }
      q.x += q.vx * dt; q.y += q.vy * dt;

      const near = 0.5 + 0.5 * Math.sin(t * 0.23 * q.f[3] + q.ph[3]);  // 0 far … 1 near
      const w = q.w;
      const x = q.x - lean.x * 30 * (0.4 + near);
      const y = q.y + lean.y * 20 * (0.4 + near) + (1 - w) * 60 * (q.y > cy ? 1 : -1);
      q.el.style.visibility = "visible";
      q.el.style.opacity = (w * (0.45 + 0.55 * near)).toFixed(3);
      q.el.style.zIndex = near > 0.5 ? "2" : "1";
      const blur = (1 - w) * 7 + (1 - near) * 0.6;
      q.el.style.filter = blur < 0.3 ? "none" : "blur(" + blur.toFixed(1) + "px)";
      q.el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) translate(-50%,-50%) rotate(" +
        (Math.sin(t * 0.21 * q.f[2] + q.ph[2]) * 6 + q.vx * 0.03).toFixed(2) + "deg) scale(" + ((0.72 + 0.34 * near) * (0.86 + 0.14 * w)).toFixed(3) + ")";
    }
  }

  // ====================================================
  // PORTRAIT ORBITS — three electrons circling the hero photo on tilted
  // orbits. Each one is in front of the photo for half its orbit and behind
  // it for the other half: the near half is drawn on a canvas above the
  // photo, the far half on a canvas beneath it.
  // ====================================================
  let drawOrbits = null;
  (function buildOrbits() {
    const host = document.querySelector(".hero-portrait-flip");
    if (!host) return;
    const mk = (cls) => {
      const c = document.createElement("canvas");
      c.className = "hero-orbits " + cls;
      c.setAttribute("aria-hidden", "true");
      return c;
    };
    const back = mk("hero-orbits--back"), front = mk("hero-orbits--front");
    host.insertBefore(back, host.firstChild);
    host.appendChild(front);
    const gb = back.getContext("2d"), gf = front.getContext("2d");
    const ORBITS = [
      { tilt: -0.35, speed: 1.9,  ph: 0.0, col: [143, 214, 255] },
      { tilt: 0.75,  speed: -1.45, ph: 2.1, col: [255, 170, 120] },
      { tilt: 1.95,  speed: 1.15, ph: 4.2, col: [201, 168, 255] },
    ];
    let size = 0;
    function fit() {
      const w = Math.round(back.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
      if (w && w !== size) { size = w; back.width = back.height = front.width = front.height = w; }
    }
    const SEG = 46, TAIL = 2.3; // tail length in radians
    drawOrbits = (t) => {
      fit();
      if (!size) return;
      gb.clearRect(0, 0, size, size); gf.clearRect(0, 0, size, size);
      const c = size / 2, R = size / 1.9 / 2;       // R = the photo's radius
      const a = R * 1.5, b = R * 0.5;               // orbit seen at an angle
      for (const o of ORBITS) {
        const ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
        const at = (phi) => { const x = a * Math.cos(phi), y = b * Math.sin(phi); return [c + x * ct - y * st, c + x * st + y * ct]; };
        const rgb = o.col.join(",");
        // faint orbit line: the half with sin(phi) > 0 is the near side
        for (const [g, from] of [[gf, 0], [gb, Math.PI]]) {
          g.beginPath();
          for (let k = 0; k <= 32; k++) { const p = at(from + k / 32 * Math.PI); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
          g.strokeStyle = "rgba(" + rgb + "," + (g === gf ? 0.2 : 0.1) + ")";
          g.lineWidth = size / 300;
          g.stroke();
        }
        // the electron and its fading tail
        const phi0 = o.ph + t * o.speed, dir = o.speed > 0 ? -1 : 1;
        for (let k = SEG; k >= 0; k--) {
          const u = k / SEG, phi = phi0 + dir * u * TAIL;
          const near = Math.sin(phi) > 0, g = near ? gf : gb;
          const p = at(phi), q = at(phi0 + dir * Math.min(1, u + 1 / SEG) * TAIL);
          const depth = 0.75 + 0.25 * Math.sin(phi);     // nearer = larger, brighter
          g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]);
          g.strokeStyle = "rgba(" + rgb + "," + ((1 - u) * (1 - u) * (near ? 0.95 : 0.5)).toFixed(3) + ")";
          g.lineWidth = size / 95 * (1 - u * 0.8) * depth;
          g.lineCap = "round";
          g.stroke();
          if (k === 0) {
            const r = size / 52 * depth;
            const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 3.2);
            gr.addColorStop(0, "rgba(255,255,255," + (near ? 1 : 0.6) + ")");
            gr.addColorStop(0.3, "rgba(" + rgb + "," + (near ? 0.9 : 0.45) + ")");
            gr.addColorStop(1, "rgba(" + rgb + ",0)");
            g.fillStyle = gr;
            g.beginPath(); g.arc(p[0], p[1], r * 3.2, 0, TAU); g.fill();
          }
        }
      }
    };
  })();

  // ====================================================
  // RENDER LOOP
  // ====================================================
  let story = storyPosition();
  let firstFrame = true;
  let viewShift = 0;
  let lastScrollY = window.scrollY, scrollVel = 0, scrollDrift = 0;
  const wide = () => W >= 960;

  function animateInto(shape, posAttr, fieldAttr, t) {
    if (!shape || !shape.animate) return;
    shape.animate(t, posAttr.array, fieldAttr.array);
    posAttr.needsUpdate = fieldAttr.needsUpdate = true;
  }

  function tick() {
    const frameT0 = performance.now();
    const dt = Math.min(clock.getDelta(), 1 / 30);
    const t = clock.elapsedTime;

    // Ease toward the scroll position: an extra layer of glide on top of
    // Lenis, and the only smoothing on phones.
    const target = storyPosition();
    story += (target - story) * Math.min(1, dt * 5);
    const i = Math.min(Math.floor(story), shapes.length - 1);
    const f = story - i;
    loadPair(i);
    const morph = smooth(0.18, 0.82, f);
    uniforms.uMorph.value = morph;
    uniforms.uTime.value = t;
    uniforms.uSpin.value += dt * 0.16;
    applyReadout(target);

    // Scroll speed and clicks shake the cloud; it calms down by itself.
    const sy = window.scrollY;
    scrollVel += ((sy - lastScrollY) / Math.max(1, H) / Math.max(dt, 1e-3) - scrollVel) * Math.min(1, dt * 8);
    lastScrollY = sy;
    scrollDrift += scrollVel * dt * 3;
    chaosKick *= Math.exp(-dt * 2.2);
    pointer.speed *= Math.exp(-dt * 3);
    const chaos = Math.min(1.6, Math.abs(scrollVel) * 0.5 + chaosKick + pointer.speed * 0.12);
    uniforms.uChaos.value += (chaos - uniforms.uChaos.value) * Math.min(1, dt * 6);

    // Stirring (cursor motion) and clicks speed up the planet's interior.
    flowSurge *= Math.exp(-dt * 0.9);
    flowClock += dt * (pointer.speed * 1.5 + flowSurge * 9);

    // The shapes are live simulations: advance whichever are on screen.
    const last = shapes.length - 1;
    if (morph < 0.999) animateInto(shapes[i], aPosA, aFieldA, t);
    if (morph > 0.001 && i < last) animateInto(shapes[i + 1], aPosB, aFieldB, t);

    // Cursor influence fades in and out instead of switching.
    uniforms.uMouse.value.set(pointer.x, pointer.y);
    uniforms.uMouseStr.value += ((pointer.active ? 1 : 0) - uniforms.uMouseStr.value) * Math.min(1, dt * 3);
    for (const v of uniforms.uShock.value) v.z += dt;

    // Background layers follow the scene.
    for (let k = 0; k < SCENE_KEYS.length; k++) sceneW[SCENE_KEYS[k]] = Math.max(0, 1 - Math.abs(story - k));
    const space = weightOf("planet", "solar", "galaxy", "outro"), micro = weightOf("qubits", "quantum", "dft", "md");
    ambUniforms.uTime.value = t;
    ambUniforms.uScroll.value = scrollDrift;
    ambUniforms.uW.value.set(0.35 + 0.65 * space, weightOf("qubits", "quantum"), weightOf("dft", "md"), weightOf("mantle"));
    galUniforms.uTime.value = t;
    galUniforms.uW.value = weightOf("galaxy") + 0.35 * weightOf("solar", "outro");
    updateStreaks(dt, space, micro);

    // On wide screens the copy sits in a left column, so the cloud moves to
    // the right half; the hero and the outro stay centred.
    const shift = wide() ? 0.2 * smooth(0.5, 1.2, story) * (1 - smooth(sections.length - 1.75, sections.length - 1.2, story)) : 0;
    viewShift = shift;
    camera.setViewOffset(W, H, -W * shift, 0, W, H);

    updateEquations(t, dt);
    if (drawOrbits && story < 0.85) drawOrbits(t);

    // Outro: π sits behind the contact cards, so let it recede.
    uniforms.uOpacity.value = 1 - 0.6 * smooth(sections.length - 1.6, sections.length - 1, story);

    const ease = Math.min(1, dt * 2.2);
    lean.x += ((pointer.active ? pointer.x : 0) - lean.x) * ease;
    lean.y += ((pointer.active ? pointer.y : 0) - lean.y) * ease;
    // Narrow portrait screens: pull back until a ~3.4-unit object fits.
    // Scrolling fast punches the camera back; it also never sits quite still.
    const zBase = Math.max(6.5, 3.4 / (0.828 * camera.aspect));
    camera.position.z = zBase * (1 + 0.1 * Math.min(1.5, uniforms.uChaos.value)) + Math.sin(t * 0.31) * 0.12;
    camera.position.x = lean.x * 0.25 + Math.sin(t * 0.23) * 0.14;
    camera.position.y = lean.y * 0.15 + Math.cos(t * 0.19) * 0.1;
    camera.lookAt(0, 0, 0);
    camera.rotation.z += Math.sin(t * 0.13) * 0.012;

    renderer.render(scene, camera);
    window.__proFrameMs = performance.now() - frameT0;
    if (firstFrame) {
      firstFrame = false;
      canvas.classList.add("is-ready");
    }
    requestAnimationFrame(tick);
  }
  tick();

  // ====================================================
  // COPY REVEALS — hero settles in on load; every later scene's text
  // rises into place as it arrives, and sinks back if you scroll up.
  // ====================================================
  const heroInner = document.querySelector(".home-scene--hero .home-scene__inner");
  if (heroInner) {
    gsap.from(heroInner.querySelectorAll(".home-scene__eyebrow, .home-scene__title, .home-scene__sub, .home-scene__cta"), {
      y: 22, autoAlpha: 0, duration: 1.2, ease: "power3.out", stagger: 0.12, delay: 0.25,
    });
  }
  gsap.utils.toArray(".home-scene:not(.home-scene--hero) .home-scene__inner").forEach((inner) => {
    const items = inner.querySelectorAll(
      ".home-scene__eyebrow, .home-scene__title, .home-scene__body, .home-outro__grid, .home-outro__contact, .home-ask, .home-visitors"
    );
    if (!items.length) return;
    gsap.from(items, {
      y: 32,
      autoAlpha: 0,
      duration: 1.0,
      ease: "power3.out",
      stagger: 0.09,
      scrollTrigger: {
        trigger: inner,
        start: "top 82%",
        toggleActions: "play none none reverse",
      },
    });
  });

  // Nudge ScrollTrigger after fonts/images load (avoids miscalc)
  window.addEventListener("load", () => { ScrollTrigger.refresh(); measure(); });

  // ----------------------------------------------------------
  // Visitor country detection (best-effort, fails gracefully).
  // Hello line localizes between EN ("Hello from X.") and VI
  // ("Xin chào từ X."), and re-renders when the user toggles lang.
  // ----------------------------------------------------------
  (function lookupVisitor() {
    const el = document.getElementById("home-visitor-country");
    if (!el) return;
    const flagEl  = el.querySelector(".home-visitors__flag");
    const helloEl = el.querySelector(".home-visitors__hello");
    if (!helloEl) return;

    // Convert ISO 3166-1 alpha-2 to flag emoji
    function flagFor(code) {
      if (!code || code.length !== 2) return "🌍";
      const A = 0x1F1E6;
      return String.fromCodePoint(
        A + code.toUpperCase().charCodeAt(0) - 65,
        A + code.toUpperCase().charCodeAt(1) - 65
      );
    }

    let detected = null; // { code, name } once we get a response

    function render() {
      const lang = document.documentElement.getAttribute("lang") || "en";
      if (!detected) {
        // Keep the static greeting spans from HTML — they handle the
        // pre-detection state in both languages.
        return;
      }
      const greet =
        lang === "vi" ? "Xin chào từ " + detected.name + "." :
                        "Hello from "  + detected.name + ".";
      // Replace any existing children with a single localized text node,
      // so the static EN/VI <span> placeholders get overwritten.
      helloEl.textContent = greet;
    }

    fetch("https://ipapi.co/json/", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        if (!d || !d.country_code) return;
        detected = { code: d.country_code, name: d.country_name || d.country_code };
        if (flagEl) flagEl.textContent = flagFor(detected.code);
        render();
      })
      .catch(() => { /* silent fallback — static greeting stays visible */ });

    document.addEventListener("site:langchange", render);
  })();

  // ----------------------------------------------------------
  // Anonymous question form — AJAX submit to FormSubmit.
  // ----------------------------------------------------------
  (function () {
    const form = document.getElementById("home-ask-form");
    if (!form) return;
    const status = document.getElementById("home-ask-status");
    const button = form.querySelector(".home-ask__send");

    // Localize placeholders + status messages on lang change
    function applyPlaceholders() {
      const lang = document.documentElement.getAttribute("lang") || "en";
      const key = "ph" + (lang === "vi" ? "Vi" : "En");
      form.querySelectorAll("[data-ph-en]").forEach(function (el) {
        el.placeholder = el.dataset[key] || el.placeholder;
      });
    }
    applyPlaceholders();
    document.addEventListener("site:langchange", applyPlaceholders);

    function msg(en, vi) {
      const lang = document.documentElement.getAttribute("lang") || "en";
      return lang === "vi" ? vi : en;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!status) return;

      // Honeypot — silently drop bot submissions
      const honey = form.querySelector(".home-ask__honey");
      if (honey && honey.value) return;

      status.hidden = false;
      status.className = "home-ask__status";
      status.textContent = msg("Sending…", "Đang gửi…");
      if (button) button.disabled = true;

      const action = form.getAttribute("action");
      const ajaxUrl = action.replace(
        "https://formsubmit.co/",
        "https://formsubmit.co/ajax/"
      );

      const payload = {
        message: form.message.value,
        name:    form.name.value  || "(anonymous)",
        email:   form.email.value || "(not provided)",
        _subject: "Anonymous question from hnguyenx.com",
        _captcha: "false"
      };

      fetch(ajaxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json"
        },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function () {
          form.reset();
          status.className = "home-ask__status is-success";
          status.textContent = msg(
            "Thanks, your message landed in my inbox.",
            "Cảm ơn, tin nhắn của bạn đã đến hộp thư của tôi."
          );
        })
        .catch(function () {
          status.className = "home-ask__status is-error";
          status.textContent = msg(
            "Couldn't send right now. Try again, or email me directly.",
            "Không gửi được lúc này. Hãy thử lại, hoặc email cho tôi trực tiếp."
          );
        })
        .then(function () {
          if (button) button.disabled = false;
        });
    });
  })();
})();

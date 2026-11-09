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
  const N = isMobile ? 12000 : 30000;

  function makeShape(tilt, fill) {
    const pos = new Float32Array(N * 3);
    const field = new Float32Array(N * 4);
    let i = 0;
    function add(p, heat, tint, spin, alpha) {
      if (i >= N) return false;
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      field[i * 4] = heat; field[i * 4 + 1] = tint; field[i * 4 + 2] = spin; field[i * 4 + 3] = alpha;
      i++;
      return true;
    }
    fill(add, () => N - i);
    // Anything a generator left over joins the last real point, so no
    // particle sits at the origin.
    const last = Math.max(0, i - 1);
    while (i < N) {
      add([pos[last * 3] + gauss() * 0.02, pos[last * 3 + 1] + gauss() * 0.02, pos[last * 3 + 2] + gauss() * 0.02],
          field[last * 4], field[last * 4 + 1], field[last * 4 + 2], field[last * 4 + 3]);
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
    const p2 = new Float32Array(N * 3), f2 = new Float32Array(N * 4);
    for (let k = 0; k < N; k++) {
      const j = idx[k];
      p2[k * 3] = pos[j * 3]; p2[k * 3 + 1] = pos[j * 3 + 1]; p2[k * 3 + 2] = pos[j * 3 + 2];
      f2[k * 4] = field[j * 4]; f2[k * 4 + 1] = field[j * 4 + 1]; f2[k * 4 + 2] = field[j * 4 + 2]; f2[k * 4 + 3] = field[j * 4 + 3];
    }
    return { pos: p2, field: f2, tilt };
  }

  // 1) Qubit lattice: 9×6 grid of qubits joined by couplers.
  function shapeLattice() {
    return makeShape(-0.35, (add, left) => {
      const COLS = 9, ROWS = 6, SP = 0.56;
      const sites = [];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          sites.push({ x: (c - (COLS - 1) / 2) * SP, y: (r - (ROWS - 1) / 2) * SP, h: 0.15 + rand() * 0.8 });
      const nodePts = Math.floor(left() * 0.62);
      for (let k = 0; k < nodePts; k++) {
        const s = sites[k % sites.length];
        const p = onSphere(0.085 + rand() * 0.025);
        add([s.x + p[0], s.y + p[1], p[2]], s.h, 0.95, 0, 1);
      }
      const edges = [];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const a = sites[r * COLS + c];
          if (c < COLS - 1) edges.push([a, sites[r * COLS + c + 1]]);
          if (r < ROWS - 1) edges.push([a, sites[(r + 1) * COLS + c]]);
        }
      while (left() > 0) {
        const e = edges[Math.floor(rand() * edges.length)];
        const t = 0.2 + rand() * 0.6;
        add([lerp(e[0].x, e[1].x, t) + gauss() * 0.006, lerp(e[0].y, e[1].y, t) + gauss() * 0.006, gauss() * 0.006], 0, 0, 0, 0.55);
      }
    });
  }

  // 2) Bloch sphere: shell, great circles, axes, state vector + precession.
  function shapeBloch() {
    return makeShape(0.32, (add, left) => {
      const R = 1.45;
      const total = left();
      for (let k = 0; k < total * 0.3; k++) add(onSphere(R), 0, 0, 1, 0.28);
      for (let k = 0; k < total * 0.2; k++) {
        const a = rand() * TAU, which = k % 3;
        const c = Math.cos(a) * R, s = Math.sin(a) * R;
        add(which === 0 ? [c, 0, s] : which === 1 ? [c, s, 0] : [0, s, c], 0, 0, 1, 0.7);
      }
      for (let k = 0; k < total * 0.08; k++) {
        const t = (rand() * 2 - 1) * R * 1.12, which = k % 3;
        add(which === 0 ? [t, 0, 0] : which === 1 ? [0, t, 0] : [0, 0, t], 0, 0, 1, 0.45);
      }
      // |ψ⟩ at θ = 50°, φ = 40°
      const th = 50 * Math.PI / 180, ph = 40 * Math.PI / 180;
      const dir = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      for (let k = 0; k < total * 0.17; k++) {
        const t = Math.pow(rand(), 0.7);
        const j = 0.012 + 0.03 * Math.max(0, (t - 0.85) / 0.15);
        add([dir[0] * R * t + gauss() * j, dir[1] * R * t + gauss() * j, dir[2] * R * t + gauss() * j], 0.55 + 0.45 * t, 1, 1, 1);
      }
      for (let k = 0; k < total * 0.06; k++) {
        const p = onSphere(0.07);
        add([dir[0] * R + p[0], dir[1] * R + p[1], dir[2] * R + p[2]], 1, 1, 1, 1);
      }
      const rr = R * Math.sin(th), yy = R * Math.cos(th);
      while (left() > 0) {
        const a = rand() * TAU;
        if (Math.sin(a * 12) < 0) continue; // dashed path
        add([Math.cos(a) * rr, yy, Math.sin(a) * rr], 0.38, 1, 1, 0.9);
      }
    });
  }

  // 3) Electron orbital: hydrogen 3d_z², sampled directly from |ψ|²
  //    (slightly sharpened so the lobes read crisply).
  //    |ψ|² r² ∝ r⁶ e^(−2r/3) · (3cos²θ − 1)², so r is Gamma-distributed
  //    and cosθ is drawn by rejection — no 3D trial-and-error.
  function shapeOrbital() {
    const SHARP = 1.35, S = 1.6 / 18;
    return makeShape(0.2, (add, left) => {
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
  }

  // 4) Silica network: Si on a diamond lattice, O at every Si–Si midpoint
  //    (the β-cristobalite motif), bonds traced in white.
  function shapeSilica() {
    return makeShape(0.35, (add, left) => {
      const A = 1.25, si = [];
      const basis = [[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0],[.25,.25,.25],[.25,.75,.75],[.75,.25,.75],[.75,.75,.25]];
      for (let a = -2; a <= 1; a++) for (let b = -2; b <= 1; b++) for (let c = -2; c <= 1; c++)
        for (const q of basis) {
          const p = [(a + q[0]) * A, (b + q[1]) * A, (c + q[2]) * A];
          if (Math.hypot(p[0], p[1], p[2] * 1.4) < 1.75) si.push(p);
        }
      const nn = A * Math.sqrt(3) / 4 * 1.05;
      const bonds = [];
      for (let i = 0; i < si.length; i++) for (let j = i + 1; j < si.length; j++) {
        const d = Math.hypot(si[i][0] - si[j][0], si[i][1] - si[j][1], si[i][2] - si[j][2]);
        if (d < nn) bonds.push([si[i], si[j]]);
      }
      const ox = bonds.map(([p, q]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
      const total = left();
      for (let k = 0; k < total * 0.42; k++) {
        const c = si[k % si.length], p = onSphere(0.12);
        add([c[0] + p[0], c[1] + p[1], c[2] + p[2]], 0.82 + rand() * 0.12, 1, 1, 1);
      }
      for (let k = 0; k < total * 0.33; k++) {
        const c = ox[k % ox.length], p = onSphere(0.07);
        add([c[0] + p[0], c[1] + p[1], c[2] + p[2]], 0.3 + rand() * 0.08, 1, 1, 1);
      }
      while (left() > 0) {
        const [p, q] = bonds[Math.floor(rand() * bonds.length)];
        const t = rand();
        add([lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)], 0, 0, 1, 0.5);
      }
    });
  }

  // 5) Mantle: a cut-away slice through a rocky planet, convection plumes
  //    rising from the core–mantle boundary.
  function shapeMantle() {
    return makeShape(-0.5, (add, left) => {
      const R = 1.75;
      while (left() > 0) {
        const r = Math.sqrt(rand()) * R, a = rand() * TAU, x = r / R;
        const p = [Math.cos(a) * r, Math.sin(a) * r, gauss() * 0.025];
        if (x < 0.2) add(p, 1.0, 1, 0, 1);
        else if (x < 0.53) add(p, 0.8 + 0.05 * rand(), 1, 0, 0.8);
        else if (x < 0.965) {
          const m = (x - 0.53) / 0.435;
          const plume = Math.pow(Math.max(0, Math.cos(a * 5 + m * 1.8)), 10);
          const heat = Math.min(1, 0.5 - 0.42 * m + 0.5 * plume);
          add(p, heat, 1, 0, 0.55 + 0.45 * plume);
        } else add(p, 0, 0, 0, 1);
      }
    });
  }

  // 6) Earth: continents in white, oceans in deep blue, seismic wavefronts
  //    spreading from an epicentre.
  function shapeEarth() {
    return makeShape(0.4, (add, left) => {
      const R = 1.55, epi = [0.45, 0.35, 0.82];
      const el = Math.hypot(epi[0], epi[1], epi[2]);
      while (left() > 0) {
        const p = onSphere(1);
        const land = fbm(p[0] * 1.8 + 3.1, p[1] * 1.8, p[2] * 1.8) > 0.5;
        const ice = Math.abs(p[1]) > 0.88;
        const d = Math.acos((p[0] * epi[0] + p[1] * epi[1] + p[2] * epi[2]) / el);
        const wave = d < 1.3 && Math.sin(d * 16) > 0.82;
        const q = [p[0] * R, p[1] * R, p[2] * R];
        if (wave) add(q, 0.95 - d * 0.45, 1, 1, 1);
        else if (land || ice) add(q, 0, 0, 1, 1);
        else if (rand() < 0.3) add(q, 0.16, 0.9, 1, 0.6);
      }
    });
  }

  // 7) Solar system: the Sun, six orbits, the planets on them.
  function shapeSolar() {
    return makeShape(0.42, (add, left) => {
      const orbits = [0.5, 0.72, 0.97, 1.24, 1.72, 2.15];
      const sizes  = [0.035, 0.05, 0.055, 0.045, 0.12, 0.1];
      const heats  = [0.7, 0.62, 0.22, 0.85, 0.6, 0.55];
      const total = left();
      for (let k = 0; k < total * 0.27; k++) {
        const p = onSphere(Math.cbrt(rand()) * 0.26);
        add(p, 0.82 + rand() * 0.18, 1, 1, 1);
      }
      const ang = orbits.map(() => rand() * TAU);
      for (let k = 0; k < total * 0.16; k++) {
        const o = k % orbits.length, p = onSphere(sizes[o]);
        add([Math.cos(ang[o]) * orbits[o] + p[0], p[1], Math.sin(ang[o]) * orbits[o] + p[2]], heats[o], 1, 1, 1);
      }
      while (left() > 0) {
        const o = Math.floor(rand() * orbits.length), a = rand() * TAU;
        add([Math.cos(a) * orbits[o], gauss() * 0.004, Math.sin(a) * orbits[o]], 0, 0, 1, 0.42);
      }
    });
  }

  // 8) Galaxy: two-armed log spiral with a warm bulge and red star-forming
  //    knots along the arms.
  function shapeGalaxy() {
    return makeShape(0.62, (add, left) => {
      const RMAX = 2.25, WIND = 2.6;
      while (left() > 0) {
        const roll = rand();
        if (roll < 0.2) {
          const p = [gauss() * 0.24, gauss() * 0.09, gauss() * 0.24];
          add(p, 0.68 + rand() * 0.12, 0.85, 1, 1);
          continue;
        }
        const arm = rand() < 0.5 ? 0 : Math.PI;
        const t = Math.pow(rand(), 0.75);
        const r = 0.35 + t * (RMAX - 0.35);
        const th = t * WIND * TAU * 0.5 + arm + gauss() * 0.18;
        const spread = 0.06 + 0.16 * t;
        const p = [Math.cos(th) * r + gauss() * spread, gauss() * 0.04 * (1.3 - t), Math.sin(th) * r + gauss() * spread];
        if (roll < 0.235) add(p, 0.93 + rand() * 0.07, 1, 1, 1);      // star-forming knots
        else if (roll < 0.55) add(p, 0.18 + rand() * 0.12, 0.6, 1, 0.8); // young blue stars
        else add(p, 0, 0, 1, 0.65);
      }
    });
  }

  // 9) π — the site's mark, as a thin slab of particles.
  function shapePi() {
    const c = document.createElement("canvas");
    c.width = c.height = 240;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = 'italic 600 220px "Source Serif 4", Georgia, serif';
    g.fillText("π", 120, 113);
    const img = g.getImageData(0, 0, 240, 240).data;
    const ink = [];
    for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++)
      if (img[(y * 240 + x) * 4 + 3] > 128) ink.push(y * 240 + x);
    return makeShape(0, (add, left) => {
      if (!ink.length) return;
      while (left() > 0) {
        const v = ink[Math.floor(rand() * ink.length)], x = v % 240, y = (v - x) / 240;
        const px = (x + rand() - 120) / 240 * 3.6, py = -(y + rand() - 120) / 240 * 3.6;
        add([px, py, gauss() * 0.05], clamp01(0.1 + (px + 1.4) / 2.8 * 0.85), 0.8, 0, 1);
      }
    });
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
  // π needs the display font; rebuild it once fonts are in.
  const piIndex = sections.findIndex((s) => s.dataset.scene === "outro");
  if (piIndex >= 0 && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      idle(() => {
        shapes[piIndex] = shapePi();
        loadedPair = -1; // force a re-upload
      });
    });
  }

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
    uSize:     { value: isMobile ? 2.1 : 1.9 },
    uPR:       { value: PR },
    uOpacity:  { value: 1 },
    uMouse:    { value: new THREE.Vector2(9, 9) },
    uMouseStr: { value: 0 },
    uAspect:   { value: 1 },
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
      uniform float uMorph, uTime, uSpin, uTiltA, uTiltB, uSize, uPR, uMouseStr, uAspect;
      uniform vec2 uMouse;
      varying vec3 vColor;
      varying float vAlpha;

      vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
      vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }
      // Simulation-style colormap: deep blue -> cyan -> yellow -> red.
      vec3 cmap(float x) {
        x = clamp(x, 0.0, 1.0);
        return clamp(vec3(1.6 - abs(4.0*x - 3.2), 1.5 - abs(4.0*x - 2.0), 1.6 - abs(4.0*x - 0.75)), 0.0, 1.0);
      }

      void main() {
        // Each particle leaves on its own beat, so a transition pours
        // rather than snaps.
        float k = clamp((uMorph - aRand * 0.4) / 0.6, 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);

        vec3 a = rotY(aPosA, uSpin * aFieldA.z);
        vec3 b = rotY(aPosB, uSpin * aFieldB.z);
        vec3 p = mix(a, b, k);

        // Mid-flight the cloud swirls; at rest it only breathes.
        float flight = sin(3.14159 * k);
        float s = uTime * 0.35 + aRand * 6.2831;
        vec3 drift = vec3(sin(s + p.y * 2.3), cos(s * 1.1 + p.z * 2.7), sin(s * 0.9 + p.x * 3.1));
        p += drift * (0.006 + 0.42 * flight);

        p = rotX(p, mix(uTiltA, uTiltB, k));

        vec4 mv = modelViewMatrix * vec4(p, 1.0);

        // Cursor pushes nearby particles aside (measured on screen).
        vec4 clip = projectionMatrix * mv;
        vec2 ndc = clip.xy / clip.w;
        vec2 d = (ndc - uMouse) * vec2(uAspect, 1.0);
        float push = uMouseStr * exp(-dot(d, d) / 0.018);
        mv.xy += normalize(d + 1e-5) * push * 0.22 * (-mv.z / 6.5);

        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * clamp(6.5 / -mv.z, 0.6, 1.8);

        vec4 f = mix(aFieldA, aFieldB, k);
        float heat = f.x + 0.06 * sin(uTime * 1.3 + aRand * 20.0) * f.y;
        vColor = mix(vec3(0.93, 0.96, 1.0), cmap(heat), f.y) * (0.9 + aRand * 0.2);
        vAlpha = f.w * (0.85 + 0.3 * flight);
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
        gl_FragColor = vec4(vColor, exp(-d * 14.0) * vAlpha * uOpacity * 0.8);
      }
    `,
  });
  const cloud = new THREE.Points(geo, cloudMat);
  cloud.frustumCulled = false;
  scene.add(cloud);

  // Faint dust far behind, for depth when the camera leans.
  const dustMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.3 * PR, sizeAttenuation: false,
    transparent: true, opacity: 0.35, depthWrite: false,
  });
  {
    const n = isMobile ? 350 : 900;
    const p = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const q = onSphere(40 + rand() * 80);
      p[k * 3] = q[0]; p[k * 3 + 1] = q[1]; p[k * 3 + 2] = q[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, dustMat));
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
  const SCALE_FOR_SCENE = {
    qubits: "10⁻¹⁵ m", quantum: "10⁻¹⁵ m", dft: "10⁻¹⁰ m", md: "10⁻⁹ m",
    mantle: "10⁶ m", planet: "10⁷ m", solar: "10¹¹ m", galaxy: "10²¹ m", outro: "10²¹ m",
  };
  let shownLabel = scaleLabel ? scaleLabel.textContent : "";
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
      scaleLabel.textContent = label;
      if (labelSeeded) {
        gsap.fromTo(scaleLabel, { y: 8, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.45, ease: "power2.out", overwrite: true });
      }
    }
    labelSeeded = true;
  }

  // ----- Pointer -----
  const pointer = { x: 9, y: 9, active: 0 };
  const lean = { x: 0, y: 0 };
  if (!isMobile) {
    window.addEventListener("pointermove", (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      pointer.active = 1;
    }, { passive: true });
    document.addEventListener("pointerleave", () => { pointer.active = 0; });
  }

  // ====================================================
  // RENDER LOOP
  // ====================================================
  const clock = new THREE.Clock();
  let story = storyPosition();
  let firstFrame = true;
  const wide = () => W >= 960;

  function tick() {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    const t = clock.elapsedTime;

    // Ease toward the scroll position: an extra layer of glide on top of
    // Lenis, and the only smoothing on phones.
    const target = storyPosition();
    story += (target - story) * Math.min(1, dt * 5);
    const i = Math.min(Math.floor(story), shapes.length - 1);
    const f = story - i;
    loadPair(i);
    uniforms.uMorph.value = smooth(0.18, 0.82, f);
    uniforms.uTime.value = t;
    uniforms.uSpin.value += dt * 0.12;
    applyReadout(target);

    // Cursor influence fades in and out instead of switching.
    uniforms.uMouse.value.set(pointer.x, pointer.y);
    uniforms.uMouseStr.value += ((pointer.active ? 1 : 0) - uniforms.uMouseStr.value) * Math.min(1, dt * 3);

    // On wide screens the copy sits in a left column, so the cloud moves to
    // the right half; the hero and the outro stay centred.
    const shift = wide() ? 0.2 * smooth(0.5, 1.2, story) * (1 - smooth(sections.length - 2.6, sections.length - 2, story)) : 0;
    camera.setViewOffset(W, H, -W * shift, 0, W, H);

    // Outro: π sits behind the contact cards, so let it recede.
    uniforms.uOpacity.value = 1 - 0.6 * smooth(sections.length - 1.6, sections.length - 1, story);

    const ease = Math.min(1, dt * 2.2);
    lean.x += ((pointer.active ? pointer.x : 0) - lean.x) * ease;
    lean.y += ((pointer.active ? pointer.y : 0) - lean.y) * ease;
    // Narrow portrait screens: pull back until a ~3.4-unit object fits.
    camera.position.z = Math.max(6.5, 3.4 / (0.828 * camera.aspect));
    camera.position.x = lean.x * 0.4 + Math.sin(t * 0.11) * 0.06;
    camera.position.y = lean.y * 0.25 + Math.cos(t * 0.09) * 0.05;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
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
      ".home-scene__eyebrow, .home-scene__title, .home-scene__body, .home-outro__card, .home-outro__contact, .home-ask, .home-visitors"
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
            "Thanks — your message landed in my inbox.",
            "Cảm ơn — tin nhắn của bạn đã đến hộp thư của tôi."
          );
        })
        .catch(function () {
          status.className = "home-ask__status is-error";
          status.textContent = msg(
            "Couldn't send right now — try again, or email me directly.",
            "Không gửi được lúc này — hãy thử lại, hoặc email cho tôi trực tiếp."
          );
        })
        .then(function () {
          if (button) button.disabled = false;
        });
    });
  })();
})();

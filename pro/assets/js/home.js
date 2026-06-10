/* =========================================================
   Home — scroll-driven cinematic journey
   Earth -> Seismic -> Mantle -> Atoms -> Quantum -> Outro
   Single Three.js canvas, scrubbed by GSAP ScrollTrigger.
   ========================================================= */
(function () {
  "use strict";

  if (!window.THREE || !window.gsap || !window.ScrollTrigger) {
    document.body.classList.add("home-fallback");
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  // Keep iOS Safari from refreshing ScrollTrigger every time its
  // address bar collapses — that was also a source of mid-scroll
  // hitches. (We DON'T enable normalizeScroll because it replaces
  // native momentum scroll, which feels worse than the occasional
  // scrub-catchup hitch it would fix.)
  if (
    window.matchMedia("(max-width: 720px)").matches ||
    window.matchMedia("(pointer: coarse) and (hover: none)").matches
  ) {
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    document.body.classList.add("home-fallback");
    return;
  }

  const canvas = document.getElementById("home-canvas");
  if (!canvas) return;

  // ----- Renderer / scene / camera -----
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  // Reduce render load on phones — touch scroll gets blocked when the
  // GPU/CPU can't keep up with the timeline scrub.
  // Detect by either narrow width OR touch-only input (so landscape
  // phones still get the lighter render path).
  const _isMobile =
    window.matchMedia("(max-width: 720px)").matches ||
    window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  renderer.setPixelRatio(_isMobile ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 0, 6);

  // ----- Lighting -----
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
  sun.position.set(5, 3, 5);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x223355, 0.45);
  scene.add(ambient);
  const rim = new THREE.DirectionalLight(0x6cc7ff, 0.35);
  rim.position.set(-5, -1, -3);
  scene.add(rim);

  // ====================================================
  // 1) STARFIELD (always visible, fades during atoms/quantum)
  // ====================================================
  const starGroup = new THREE.Group();
  {
    const STAR_COUNT = _isMobile ? 900 : 2400;
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 60 + Math.random() * 240;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = 0.5 + Math.random() * 1.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.6,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const stars = new THREE.Points(geo, mat);
    starGroup.add(stars);
  }
  scene.add(starGroup);

  // ====================================================
  // 2) EARTH (proc. shader — no external texture needed)
  // ====================================================
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  // Earth sphere with procedural continents (cheap fbm-ish noise in shader)
  const earthMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0.6, 0.3, 0.8).normalize() },
      uWavePhase: { value: 0 }, // 0..1, seismic ripple intensity
      uHeat: { value: 0 },      // 0..1, mantle heat tint
      uOpacity: { value: 1 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vNormal;
      varying vec3 vPos;
      uniform float uTime;
      uniform vec3  uLightDir;
      uniform float uWavePhase;
      uniform float uHeat;
      uniform float uOpacity;

      // hash + value noise
      float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise(vec3 x){
        vec3 p = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(p+vec3(0,0,0)),hash(p+vec3(1,0,0)),f.x),
                       mix(hash(p+vec3(0,1,0)),hash(p+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(p+vec3(0,0,1)),hash(p+vec3(1,0,1)),f.x),
                       mix(hash(p+vec3(0,1,1)),hash(p+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbm(vec3 p){
        float v=0.0, a=0.5;
        for(int i=0;i<5;i++){ v += a*noise(p); p*=2.02; a*=0.5; }
        return v;
      }

      void main(){
        vec3 n = normalize(vNormal);
        vec3 p = normalize(vPos);

        // continents
        float c = fbm(p*2.2);
        float land = smoothstep(0.48, 0.52, c);

        vec3 ocean = mix(vec3(0.02,0.08,0.20), vec3(0.05,0.22,0.45), c);
        vec3 landCol = mix(vec3(0.10,0.22,0.08), vec3(0.45,0.38,0.20), fbm(p*5.0));
        vec3 col = mix(ocean, landCol, land);

        // polar ice
        float ice = smoothstep(0.78, 0.95, abs(p.y));
        col = mix(col, vec3(0.92,0.96,1.0), ice);

        // seismic ripple — concentric waves emanating from a point
        vec3 epi = normalize(vec3(0.4, 0.2, 0.9));
        float d = acos(clamp(dot(p, epi), -1.0, 1.0)); // 0..pi
        float ripple = sin(d*22.0 - uTime*4.0);
        ripple *= exp(-d*1.6) * uWavePhase;
        col += vec3(0.6, 0.85, 1.0) * ripple * 0.35;

        // mantle heat (glows from below as we descend)
        col = mix(col, vec3(1.0, 0.35, 0.1), uHeat * 0.55);

        // lighting
        float lambert = max(dot(n, uLightDir), 0.0);
        float ambient = 0.18;
        col *= (ambient + lambert*0.95);

        // rim glow
        float rim = pow(1.0 - max(dot(n, vec3(0,0,1)),0.0), 2.5);
        col += vec3(0.25, 0.55, 1.0) * rim * 0.35;

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, _isMobile ? 48 : 96, _isMobile ? 48 : 96),
    earthMat
  );
  earthGroup.add(earth);

  // Atmosphere glow
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1.0 } },
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vNormal;
      void main(){
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      uniform float uOpacity;
      void main(){
        float intensity = pow(0.7 - dot(vNormal, vec3(0,0,1.0)), 3.0);
        gl_FragColor = vec4(0.35, 0.6, 1.0, 1.0) * intensity * uOpacity;
      }
    `,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.55, 64, 64), atmoMat);
  earthGroup.add(atmo);

  // ====================================================
  // 3) MANTLE DESCENT — streak particles falling downward
  // ====================================================
  const mantleGroup = new THREE.Group();
  scene.add(mantleGroup);
  mantleGroup.visible = false;
  {
    const N = 600;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = Math.random() * 14 - 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: 0xff8a4a,
      size: 0.06,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mantleGroup.add(new THREE.Points(g, m));
  }

  // ====================================================
  // 4) ATOMS (SiO2-ish: small O atoms around larger Si atoms,
  //    bonds drawn between near neighbors)
  // ====================================================
  const atomsGroup = new THREE.Group();
  scene.add(atomsGroup);
  atomsGroup.visible = false;

  const atomData = [];
  {
    const SI_COUNT = 22;
    const O_COUNT  = 44;
    const siGeo = new THREE.SphereGeometry(0.12, 24, 24);
    const siMat = new THREE.MeshStandardMaterial({
      color: 0xffb066, emissive: 0x441a05, roughness: 0.4, metalness: 0.1,
    });
    const oGeo  = new THREE.SphereGeometry(0.07, 20, 20);
    const oMat  = new THREE.MeshStandardMaterial({
      color: 0x6cc7ff, emissive: 0x0a2a44, roughness: 0.4, metalness: 0.1,
    });
    const R = 2.2;
    for (let i = 0; i < SI_COUNT; i++) {
      const m = new THREE.Mesh(siGeo, siMat);
      const p = new THREE.Vector3(
        (Math.random()-0.5)*R*2,
        (Math.random()-0.5)*R*2,
        (Math.random()-0.5)*R*0.6
      );
      m.position.copy(p);
      atomsGroup.add(m);
      atomData.push({ mesh: m, base: p.clone(), kind: "si", phase: Math.random()*Math.PI*2 });
    }
    for (let i = 0; i < O_COUNT; i++) {
      const m = new THREE.Mesh(oGeo, oMat);
      const p = new THREE.Vector3(
        (Math.random()-0.5)*R*2,
        (Math.random()-0.5)*R*2,
        (Math.random()-0.5)*R*0.6
      );
      m.position.copy(p);
      atomsGroup.add(m);
      atomData.push({ mesh: m, base: p.clone(), kind: "o", phase: Math.random()*Math.PI*2 });
    }
  }
  // Bond lines (recomputed each frame when atoms scene is active)
  const bondMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false,
  });
  const bondGeo = new THREE.BufferGeometry();
  bondGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(900), 3));
  const bonds = new THREE.LineSegments(bondGeo, bondMat);
  atomsGroup.add(bonds);

  // ====================================================
  // 5) QUANTUM LATTICE — grid of glowing qubits + entanglement pulse
  // ====================================================
  const quantumGroup = new THREE.Group();
  scene.add(quantumGroup);
  const qubitData = [];
  const qEdges = []; // list of edges (each {a:Vec3, b:Vec3}) for pulse to travel along
  let pulseEdgeIdx = 0;
  let pulseT = 0;
  let pulseMesh;
  {
    const COLS = 9, ROWS = 6;
    const spacing = 0.6;
    const qGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const qMatBase = new THREE.MeshBasicMaterial({ color: 0xb48bff, transparent: true, opacity: 0.9 });
    const linePts = [];
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        const x = (c - (COLS-1)/2) * spacing;
        const y = (r - (ROWS-1)/2) * spacing;
        const z = 0;
        const mat = qMatBase.clone();
        const m = new THREE.Mesh(qGeo, mat);
        m.position.set(x, y, z);
        quantumGroup.add(m);
        qubitData.push({ mesh: m, phase: Math.random()*Math.PI*2, state: Math.random() });
        grid[r][c] = new THREE.Vector3(x, y, z);
        if (c < COLS - 1) { linePts.push(x, y, z, x + spacing, y, z); }
        if (r < ROWS - 1) { linePts.push(x, y, z, x, y + spacing, z); }
      }
    }
    // build edge list (horizontal + vertical neighbours)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) qEdges.push({ a: grid[r][c], b: grid[r][c + 1] });
        if (r < ROWS - 1) qEdges.push({ a: grid[r][c], b: grid[r + 1][c] });
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linePts), 3));
    const lm = new THREE.LineBasicMaterial({
      color: 0x6cc7ff, transparent: true, opacity: 0.25, depthWrite: false,
    });
    quantumGroup.add(new THREE.LineSegments(lg, lm));

    // Pulse: a bright glowing dot that travels along a random edge, jumping each cycle
    pulseMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 })
    );
    quantumGroup.add(pulseMesh);
  }

  // ====================================================
  // 6) DFT ELECTRON CLOUD — particle cloud that morphs
  //    between s, p, d orbital shapes
  // ====================================================
  const dftGroup = new THREE.Group();
  scene.add(dftGroup);
  dftGroup.visible = false;

  const DFT_N = _isMobile ? 700 : 1800;
  const dftBase = new Float32Array(DFT_N * 3); // r, theta, phi (unit-sphere-ish samples)
  const dftPos = new Float32Array(DFT_N * 3);
  const dftCol = new Float32Array(DFT_N * 3);
  for (let i = 0; i < DFT_N; i++) {
    // sample direction uniformly on sphere
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const sin = Math.sqrt(1 - u * u);
    // radial sample biased toward shell (looks more orbital-like)
    const r = 1.0 + Math.random() * 0.9;
    dftBase[i * 3]     = r;
    dftBase[i * 3 + 1] = Math.acos(u); // polar (0..pi)
    dftBase[i * 3 + 2] = theta;        // azimuth (0..2pi)
    // initial color: cyan-violet
    dftCol[i * 3]     = 0.55;
    dftCol[i * 3 + 1] = 0.80;
    dftCol[i * 3 + 2] = 1.00;
  }
  const dftGeo = new THREE.BufferGeometry();
  dftGeo.setAttribute("position", new THREE.BufferAttribute(dftPos, 3));
  dftGeo.setAttribute("color", new THREE.BufferAttribute(dftCol, 3));
  const dftMat = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  dftGroup.add(new THREE.Points(dftGeo, dftMat));

  // Nucleus: small bright sphere(s)
  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0 })
  );
  dftGroup.add(nucleus);

  // ====================================================
  // 7) SOLAR SYSTEM — central sun + a few orbiting planets
  // ====================================================
  const solarGroup = new THREE.Group();
  scene.add(solarGroup);
  solarGroup.visible = false;

  // Sun (bright emissive)
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 })
  );
  solarGroup.add(sunMesh);
  // Sun glow (BackSide trick)
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 32, 32),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vN; uniform float uOpacity; void main(){ float i = pow(0.75 - dot(vN,vec3(0,0,1)),3.0); gl_FragColor = vec4(1.0,0.78,0.32,1.0)*i*uOpacity; }`,
    })
  );
  solarGroup.add(sunGlow);

  // Planets and orbit lines
  const planetDefs = [
    { r: 0.7,  size: 0.05, speed: 1.50, color: 0xd4a36a }, // Mercury-ish
    { r: 1.0,  size: 0.07, speed: 1.10, color: 0xe7c89a }, // Venus
    { r: 1.4,  size: 0.075, speed: 0.85, color: 0x6fb5ff }, // Earth (cyan-blue)
    { r: 1.8,  size: 0.06, speed: 0.65, color: 0xd07a4a }, // Mars
    { r: 2.5,  size: 0.13, speed: 0.40, color: 0xd9b483 }, // Jupiter
    { r: 3.1,  size: 0.10, speed: 0.28, color: 0xc8a06c }, // Saturn
  ];
  const planetMeshes = [];
  planetDefs.forEach((p) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 18, 18),
      new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0 })
    );
    m.userData = { r: p.r, speed: p.speed, phase: Math.random() * Math.PI * 2 };
    solarGroup.add(m);
    planetMeshes.push(m);

    // Orbit ring
    const orbitGeo = new THREE.BufferGeometry();
    const segs = 96;
    const pts = new Float32Array((segs + 1) * 3);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts[i * 3]     = Math.cos(a) * p.r;
      pts[i * 3 + 1] = Math.sin(a) * p.r * 0.18; // squash for tilt
      pts[i * 3 + 2] = Math.sin(a) * p.r * 0.55;
    }
    orbitGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    const orbitLine = new THREE.Line(
      orbitGeo,
      new THREE.LineBasicMaterial({ color: 0x8aa4d8, transparent: true, opacity: 0, depthWrite: false })
    );
    orbitLine.userData = { isOrbit: true };
    solarGroup.add(orbitLine);
  });

  // ====================================================
  // 8) GALAXY — log-spiral particle cloud + bulge
  // ====================================================
  const galaxyGroup = new THREE.Group();
  scene.add(galaxyGroup);
  galaxyGroup.visible = false;

  const GAL_N = _isMobile ? 2500 : 7000;
  const galPos = new Float32Array(GAL_N * 3);
  const galCol = new Float32Array(GAL_N * 3);
  const galPhase = new Float32Array(GAL_N);
  {
    const ARMS = 2;
    const armWindings = 2.8;
    const Rmax = 4.0;
    for (let i = 0; i < GAL_N; i++) {
      // mix: ~25% bulge, ~75% disk in arms
      const inBulge = Math.random() < 0.22;
      let x, y, z, r, color;
      if (inBulge) {
        // small ellipsoid bulge
        const u = (Math.random() - 0.5) * 2;
        const v = (Math.random() - 0.5) * 2;
        const w = (Math.random() - 0.5) * 2;
        r = Math.sqrt(u*u + v*v + w*w);
        if (r > 1) { i--; continue; } // reject outside unit ball
        x = u * 0.6;
        z = w * 0.6;
        y = v * 0.25;
        color = [1.0, 0.92, 0.7];
      } else {
        const arm = Math.floor(Math.random() * ARMS);
        const tPar = Math.pow(Math.random(), 0.6); // bias toward outer
        const theta = tPar * armWindings * Math.PI * 2 + arm * (Math.PI * 2 / ARMS);
        r = 0.7 + tPar * (Rmax - 0.7);
        // perturb perpendicular to arm for thickness
        const jitter = (Math.random() - 0.5) * 0.6 * (0.4 + tPar);
        const ang = theta + (Math.random() - 0.5) * 0.25;
        x = Math.cos(ang) * r + Math.cos(ang + Math.PI / 2) * jitter;
        z = Math.sin(ang) * r + Math.sin(ang + Math.PI / 2) * jitter;
        y = (Math.random() - 0.5) * 0.08 * (1.5 - tPar); // thin disk
        // color: hot orange near center -> blue-white outer
        const t = Math.min(1, r / Rmax);
        color = [
          1.0 - 0.4 * t,
          0.85 - 0.2 * t,
          0.6 + 0.4 * t,
        ];
      }
      galPos[i * 3]     = x;
      galPos[i * 3 + 1] = y;
      galPos[i * 3 + 2] = z;
      galCol[i * 3]     = color[0];
      galCol[i * 3 + 1] = color[1];
      galCol[i * 3 + 2] = color[2];
      galPhase[i] = Math.random() * Math.PI * 2;
    }
  }
  const galGeo = new THREE.BufferGeometry();
  galGeo.setAttribute("position", new THREE.BufferAttribute(galPos, 3));
  galGeo.setAttribute("color", new THREE.BufferAttribute(galCol, 3));
  const galMat = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  galaxyGroup.add(new THREE.Points(galGeo, galMat));
  // Tilt galaxy so we see it 3/4 view
  galaxyGroup.rotation.x = 0.55;

  // ====================================================
  // STATE — the master "playhead" that scroll controls.
  // Each scene reads from this in the render loop.
  // ====================================================
  const state = {
    progress: 0,         // 0..1 across the whole page

    // Camera + ambient
    cameraZ: 7,
    cameraY: 0,
    starOpacity: 0.35,
    starRotation: 0,

    // Qubits (scene 1) — start ON
    quantumOpacity: 1.0,
    quantumRot: 0,
    quantumActivity: 1.0,
    quantumPulse: 0,     // 0..1, position of entanglement pulse along an edge

    // DFT electron cloud (scene 2)
    dftOpacity: 0,
    dftShape: 0,         // 0=s, 0.5=p, 1=d (continuous)
    dftRot: 0,

    // Molecular dynamics atoms (scene 3) — start OFF
    atomsOpacity: 0,
    atomsCompactness: 0,
    atomsRot: 0,

    // Mantle streaks (scene 4)
    mantleOpacity: 0,

    // Earth (scene 5) — appears later, large and hot first, then cools and shrinks
    earthOpacity: 0,
    earthScale: 3.4,
    wavePhase: 0,
    heat: 1.0,

    // Solar system (scene 6)
    solarOpacity: 0,
    solarScale: 1.0,
    solarSpin: 1.0,

    // Galaxy (scene 7)
    galaxyOpacity: 0,
    galaxyScale: 1.0,
    galaxySpin: 1.0,
  };

  // ----- Resize -----
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ====================================================
  // SCROLL TIMELINE — one master timeline scrubbed by ScrollTrigger
  // ====================================================
  // On mobile, a high scrub value feels like the page is "sticky" or
  // resisting touch drag — drop it down so finger flicks feel responsive.
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: "#home-main",
      start: "top top",
      end: "bottom bottom",
      // Use the same higher scrub on mobile as desktop: more inertia
      // = smoother glide. The lower 0.6 value felt jittery because
      // every tiny finger twitch yanked the scenes.
      scrub: 1.4,
    },
  });

  // Narrative: Qubits -> DFT -> MD atoms -> Mantle -> Earth -> Cosmos
  // Each "unit" of the timeline ~= one scroll viewport.

  // Transitions are tuned so each scene's fade-out *overlaps* the next
  // scene's fade-in (both run ~0.9 in length, starting from the same
  // anchor), giving a real crossfade instead of a hand-off. Camera Z
  // changes are anchored slightly before the opacity shift so the move
  // begins while the previous scene is still partly visible.

  // Scene 1 (Hero, qubits) + Scene 2 (Quantum computing prose, same qubits visual):
  // hold qubits at full intensity for ~2 timeline units, gentle camera drift.
  tl.to(state, { quantumRot: 0.3, cameraZ: 6.5, duration: 2.0, ease: "sine.inOut" }, 0);

  // Scene 2 -> 3: fade qubits, bring DFT cloud + nucleus
  tl.to(state, { quantumOpacity: 0.0, quantumActivity: 0.0, duration: 0.9, ease: "sine.inOut" }, 1.9)
    .to(state, { dftOpacity: 1.0, duration: 0.9, ease: "sine.inOut" }, 1.9)
    .to(state, { dftShape: 1.0, dftRot: 0.8, duration: 1.4, ease: "sine.inOut" }, 2.0);

  // Scene 3 -> 4: fade DFT, atoms appear scattered then bond
  tl.to(state, { dftOpacity: 0.0, duration: 0.9, ease: "sine.inOut" }, 3.1)
    .to(state, { atomsOpacity: 1.0, duration: 0.9, ease: "sine.inOut" }, 3.1)
    .to(state, { cameraZ: 5.4, duration: 1.1, ease: "power1.inOut" }, 3.0)
    .to(state, { atomsCompactness: 1.0, atomsRot: 0.6, duration: 1.4, ease: "power2.inOut" }, 3.3);

  // Scene 4 -> 5: atoms fade, mantle plumes rise (heat building)
  tl.to(state, { atomsOpacity: 0.0, duration: 0.9, ease: "sine.inOut" }, 4.3)
    .to(state, { mantleOpacity: 1.0, duration: 0.9, ease: "sine.inOut" }, 4.3)
    .to(state, { cameraZ: 6.5, duration: 1.2, ease: "power1.inOut" }, 4.2);

  // Scene 5 -> 6: fade mantle, Earth emerges large + hot, then cools and shrinks
  tl.to(state, { mantleOpacity: 0.0, duration: 0.9, ease: "sine.inOut" }, 5.3)
    .to(state, { earthOpacity: 1.0, duration: 0.9, ease: "sine.inOut" }, 5.3)
    .to(state, { earthScale: 1.2, heat: 0.0, duration: 1.4, ease: "power2.inOut" }, 5.4)
    .to(state, { wavePhase: 1.0, duration: 0.9, ease: "power2.in" }, 5.9);

  // Scene 6 -> 7 (Solar): Earth shrinks to a tiny dot, solar system fades in
  tl.to(state, { earthOpacity: 0.0, earthScale: 0.0, duration: 0.9, ease: "sine.inOut" }, 6.5)
    .to(state, { solarOpacity: 1.0, duration: 0.9, ease: "sine.inOut" }, 6.5)
    .to(state, { cameraZ: 8.0, duration: 1.2, ease: "power1.inOut" }, 6.4);

  // Scene 7 -> 8 (Galaxy): solar shrinks to a glowing core, galaxy reveals
  tl.to(state, { solarOpacity: 0.0, solarScale: 0.05, duration: 0.9, ease: "sine.inOut" }, 7.5)
    .to(state, { galaxyOpacity: 1.0, duration: 0.9, ease: "sine.inOut" }, 7.5)
    .to(state, { cameraZ: 9.5, duration: 1.2, ease: "power1.inOut" }, 7.4);

  // Scene 8 -> 9 (Outro): galaxy recedes, stars dominate
  tl.to(state, { galaxyScale: 0.45, duration: 1.4, ease: "power2.inOut" }, 8.5)
    .to(state, { starOpacity: 1.0, starRotation: 0.1, duration: 1.4, ease: "power2.out" }, 8.5);

  // Always-on: progress bar + scale ruler
  const progressBar = document.querySelector(".home-progress__bar");
  const scaleDot   = document.getElementById("home-scale-dot");
  const scaleLabel = document.getElementById("home-scale-label");
  // (scroll-progress band → label, dot color). Order matches narrative.
  // Nine scenes: hero, quantum, dft, md, mantle, planet, solar, galaxy, outro.
  // Bands split scroll progress proportionally (each ~1/9 ≈ 0.111).
  const SCALE_BANDS = [
    { until: 0.222, label: "10⁻¹⁵ m", color: "#b48bff", caption: "qubit" },     // hero + quantum
    { until: 0.333, label: "10⁻¹⁰ m", color: "#9aa6ff", caption: "orbital" },
    { until: 0.444, label: "10⁻⁹ m",  color: "#6cc7ff", caption: "atomic" },
    { until: 0.555, label: "10⁵ m",   color: "#ffb066", caption: "mantle" },
    { until: 0.666, label: "10⁷ m",   color: "#4dd28a", caption: "planet" },
    { until: 0.777, label: "10¹¹ m",  color: "#ffd27a", caption: "solar" },
    { until: 1.010, label: "10²¹ m",  color: "#dde3ff", caption: "galaxy" },
  ];
  ScrollTrigger.create({
    trigger: "#home-main",
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      state.progress = self.progress;
      const pct = self.progress * 100;
      if (progressBar) progressBar.style.width = pct.toFixed(2) + "%";
      if (scaleDot)   scaleDot.style.top       = pct.toFixed(2) + "%";
      if (scaleLabel) {
        const band = SCALE_BANDS.find(b => self.progress < b.until) || SCALE_BANDS[SCALE_BANDS.length - 1];
        if (scaleLabel.textContent !== band.label) scaleLabel.textContent = band.label;
        if (scaleDot) {
          scaleDot.style.background = band.color;
          scaleDot.style.boxShadow  = `0 0 12px ${band.color}`;
        }
      }
    },
  });

  // ====================================================
  // RENDER LOOP — continuous ambient motion + state apply
  // ====================================================
  const clock = new THREE.Clock();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function tick() {
    const dt = Math.min(clock.getDelta(), 1/30);
    const t = clock.elapsedTime;

    // --- Stars: slow drift + opacity ---
    starGroup.rotation.y += dt * 0.01 + state.starRotation * 0.0;
    starGroup.rotation.x = state.starRotation * 0.4;
    starGroup.children[0].material.opacity = state.starOpacity;

    // --- Earth ---
    earth.visible = state.earthOpacity > 0.01;
    atmo.visible = earth.visible;
    if (earth.visible) {
      earthGroup.rotation.y += dt * 0.08;
      earthGroup.scale.setScalar(state.earthScale);
      earthMat.uniforms.uTime.value = t;
      earthMat.uniforms.uWavePhase.value = state.wavePhase;
      earthMat.uniforms.uHeat.value = state.heat;
      earthMat.uniforms.uOpacity.value = state.earthOpacity;
      atmoMat.uniforms.uOpacity.value = state.earthOpacity;
    }

    // --- Mantle plumes (rise upward — we are ascending) ---
    mantleGroup.visible = state.mantleOpacity > 0.01;
    if (mantleGroup.visible) {
      const pts = mantleGroup.children[0];
      pts.material.opacity = state.mantleOpacity * 0.95;
      const arr = pts.geometry.attributes.position.array;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] += dt * (1.4 + 0.7 * Math.sin(i + t));
        if (arr[i] > 8) arr[i] = -8 - Math.random() * 4;
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }

    // --- DFT electron cloud ---
    dftGroup.visible = state.dftOpacity > 0.01;
    if (dftGroup.visible) {
      dftGroup.rotation.y = state.dftRot + t * 0.15;
      dftGroup.rotation.x = Math.sin(t * 0.3) * 0.2;
      const shape = state.dftShape; // 0..1
      const arr = dftPos;
      const col = dftCol;
      for (let i = 0; i < DFT_N; i++) {
        const r = dftBase[i * 3];
        const ph = dftBase[i * 3 + 1]; // polar 0..pi
        const az = dftBase[i * 3 + 2]; // azimuth
        // Angular weight: s (isotropic) -> p_z (cos^2 polar) -> d_xy (sin^2*sin(2az))
        // Use a continuous parameter to morph
        const sWeight = 1.0;
        const pWeight = Math.abs(Math.cos(ph)); // p_z lobe
        const dWeight = Math.abs(Math.sin(ph) * Math.sin(ph) * Math.sin(2 * az + t * 0.4));
        let w;
        if (shape < 0.5) {
          const k = shape * 2; // 0..1 (s -> p)
          w = sWeight * (1 - k) + pWeight * k;
        } else {
          const k = (shape - 0.5) * 2; // 0..1 (p -> d)
          w = pWeight * (1 - k) + dWeight * k;
        }
        // breathing
        const breathe = 0.85 + 0.15 * Math.sin(t * 0.8 + i * 0.01);
        const R = r * (0.6 + 1.4 * w) * breathe;
        const sx = Math.sin(ph) * Math.cos(az);
        const sy = Math.cos(ph);
        const sz = Math.sin(ph) * Math.sin(az);
        arr[i * 3]     = sx * R;
        arr[i * 3 + 1] = sy * R;
        arr[i * 3 + 2] = sz * R;
        // color: brighter where probability is higher
        const intensity = Math.min(1, w);
        col[i * 3]     = 0.55 + 0.35 * intensity;
        col[i * 3 + 1] = 0.75 + 0.15 * intensity;
        col[i * 3 + 2] = 1.00;
      }
      dftGeo.attributes.position.needsUpdate = true;
      dftGeo.attributes.color.needsUpdate = true;
      dftMat.opacity = state.dftOpacity * 0.85;
      // Nucleus pulses
      nucleus.material.opacity = state.dftOpacity;
      const ns = 1 + 0.1 * Math.sin(t * 4);
      nucleus.scale.setScalar(ns);
    }

    // --- Atoms ---
    atomsGroup.visible = state.atomsOpacity > 0.01;
    if (atomsGroup.visible) {
      atomsGroup.rotation.y = state.atomsRot + t * 0.06;
      atomsGroup.rotation.x = Math.sin(t * 0.2) * 0.05;
      const k = state.atomsCompactness;
      // pull atoms from "scattered base" toward a tighter cluster center
      const bondPositions = [];
      for (let i = 0; i < atomData.length; i++) {
        const a = atomData[i];
        const breathe = Math.sin(t * 1.4 + a.phase) * 0.06;
        const targetScale = 1.0 - 0.55 * k; // compact when k=1
        tmpA.copy(a.base).multiplyScalar(targetScale);
        tmpA.x += Math.sin(t * 0.7 + a.phase) * (0.05 + 0.05 * (1 - k));
        tmpA.y += Math.cos(t * 0.6 + a.phase * 1.3) * (0.05 + 0.05 * (1 - k));
        tmpA.z += breathe;
        a.mesh.position.lerp(tmpA, 0.12);
        // opacity via material
        a.mesh.material.opacity = state.atomsOpacity;
        a.mesh.material.transparent = true;
      }
      // bonds: connect every Si to up to 2 nearest atoms, only when compact
      const bondArr = bonds.geometry.attributes.position.array;
      let b = 0;
      if (k > 0.3) {
        for (let i = 0; i < atomData.length && b < bondArr.length - 6; i++) {
          if (atomData[i].kind !== "si") continue;
          // find 2 nearest atoms
          const pi = atomData[i].mesh.position;
          let n1 = -1, n2 = -1, d1 = Infinity, d2 = Infinity;
          for (let j = 0; j < atomData.length; j++) {
            if (j === i) continue;
            const dj = pi.distanceToSquared(atomData[j].mesh.position);
            if (dj < d1) { d2 = d1; n2 = n1; d1 = dj; n1 = j; }
            else if (dj < d2) { d2 = dj; n2 = j; }
          }
          for (const n of [n1, n2]) {
            if (n < 0 || b >= bondArr.length - 6) break;
            const pj = atomData[n].mesh.position;
            bondArr[b++] = pi.x; bondArr[b++] = pi.y; bondArr[b++] = pi.z;
            bondArr[b++] = pj.x; bondArr[b++] = pj.y; bondArr[b++] = pj.z;
          }
        }
      }
      // zero the rest
      while (b < bondArr.length) bondArr[b++] = 0;
      bonds.geometry.attributes.position.needsUpdate = true;
      bondMat.opacity = state.atomsOpacity * 0.28 * Math.min(1, (k - 0.2) * 1.5);
    }

    // --- Quantum lattice ---
    quantumGroup.visible = state.quantumOpacity > 0.01;
    if (quantumGroup.visible) {
      quantumGroup.rotation.y = state.quantumRot + Math.sin(t * 0.2) * 0.1;
      quantumGroup.rotation.x = Math.cos(t * 0.15) * 0.08;
      for (let i = 0; i < qubitData.length; i++) {
        const q = qubitData[i];
        const flick = 0.5 + 0.5 * Math.sin(t * 3 + q.phase);
        const c = new THREE.Color().lerpColors(
          new THREE.Color(0xb48bff),
          new THREE.Color(0x6cc7ff),
          flick * state.quantumActivity
        );
        q.mesh.material.color.copy(c);
        q.mesh.material.opacity = state.quantumOpacity * (0.55 + 0.45 * flick);
        const s = 1 + 0.25 * Math.sin(t * 2 + q.phase) * state.quantumActivity;
        q.mesh.scale.setScalar(s);
      }
      // Entanglement pulse: travels along an edge, picks a new edge each cycle
      if (qEdges.length && pulseMesh) {
        pulseT += dt * 1.6;
        if (pulseT >= 1) {
          pulseT = 0;
          pulseEdgeIdx = Math.floor(Math.random() * qEdges.length);
        }
        const e = qEdges[pulseEdgeIdx];
        pulseMesh.position.lerpVectors(e.a, e.b, pulseT);
        pulseMesh.material.opacity = state.quantumOpacity * (1 - Math.abs(pulseT - 0.5) * 2);
      }
    } else if (pulseMesh) {
      pulseMesh.material.opacity = 0;
    }

    // --- Solar system ---
    solarGroup.visible = state.solarOpacity > 0.01;
    if (solarGroup.visible) {
      solarGroup.scale.setScalar(state.solarScale);
      // Slight tilt + slow rotation
      solarGroup.rotation.x = 0.35;
      solarGroup.rotation.y += dt * 0.05 * state.solarSpin;
      sunMesh.material.opacity = state.solarOpacity;
      sunGlow.material.uniforms.uOpacity.value = state.solarOpacity * 0.9;
      // Sun pulse
      const sp = 1 + 0.05 * Math.sin(t * 2.0);
      sunMesh.scale.setScalar(sp);
      // Orbit children: planets advance, orbit rings show
      for (const child of solarGroup.children) {
        if (child === sunMesh || child === sunGlow) continue;
        if (child.userData && child.userData.isOrbit) {
          child.material.opacity = state.solarOpacity * 0.28;
        } else if (child.userData && typeof child.userData.r === "number") {
          // planet
          const u = child.userData;
          const ang = t * u.speed + u.phase;
          const x = Math.cos(ang) * u.r;
          // matching squash from orbit ring (y: small, z: bigger)
          const y = Math.sin(ang) * u.r * 0.18;
          const z = Math.sin(ang) * u.r * 0.55;
          child.position.set(x, y, z);
          child.material.opacity = state.solarOpacity;
        }
      }
    }

    // --- Galaxy ---
    galaxyGroup.visible = state.galaxyOpacity > 0.01;
    if (galaxyGroup.visible) {
      galaxyGroup.scale.setScalar(state.galaxyScale);
      galaxyGroup.rotation.z += dt * 0.04 * state.galaxySpin;
      // Subtle twinkle: oscillate alpha by perturbing colors slightly
      const pts = galaxyGroup.children[0];
      pts.material.opacity = state.galaxyOpacity * 0.95;
      const cArr = galGeo.attributes.color.array;
      const pArr = galGeo.attributes.position.array;
      // Twinkle only a fraction of particles for performance
      for (let i = 0; i < GAL_N; i += 6) {
        const tw = 0.85 + 0.15 * Math.sin(t * 2.5 + galPhase[i]);
        // re-derive a base brightness from radial distance
        const r = Math.sqrt(pArr[i*3]*pArr[i*3] + pArr[i*3+2]*pArr[i*3+2]);
        const tFrac = Math.min(1, r / 4.0);
        cArr[i * 3]     = (1.0 - 0.4 * tFrac) * tw;
        cArr[i * 3 + 1] = (0.85 - 0.2 * tFrac) * tw;
        cArr[i * 3 + 2] = (0.6 + 0.4 * tFrac) * tw;
      }
      galGeo.attributes.color.needsUpdate = true;
    }

    // --- Camera ---
    camera.position.z = state.cameraZ;
    camera.position.y = state.cameraY;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  // Nudge ScrollTrigger after fonts/images load (avoids miscalc)
  window.addEventListener("load", () => ScrollTrigger.refresh());

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
        _subject: "Anonymous question from x-repos.github.io",
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

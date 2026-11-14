/* =========================================================
   Pro Mode — the first page: a wind tunnel.
   One machine made of particles stands in a live airflow and keeps
   rebuilding itself: a hypercar, an F1 car, a battle tank, an attack
   helicopter, a stealth bomber and a Starship, which launches, and round
   again (the forms and the transformations come from machines.js and the
   files after it). The air is a 2D fluid solved on the GPU around the
   machine's own silhouette (flow.js); engines and the rotor's downwash
   blow into it. Between two machines the particles fly apart, swirl and
   settle into the next one, as they do between the scales further down.
   This page is separate from the rest of Pro Mode: its own canvas, which
   moves with the page, so scrolling carries the whole page away to the
   portrait page underneath (home.js snaps between the two).
   ========================================================= */
(function () {
  "use strict";

  const section = document.querySelector(".home-intro");
  const canvas = document.getElementById("intro-canvas");
  if (!section || !canvas || !window.THREE) return;
  const readout = section.querySelector(".flow-readout");
  const still = () => { if (readout) readout.classList.add("is-still"); };

  const isMobile =
    window.matchMedia("(max-width: 720px)").matches ||
    window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  // Reduce Motion is respected (the page says so in a note), unless the visitor asked to play anyway
  let forceMotion = false;
  try { forceMotion = localStorage.getItem("pro-motion") === "1"; } catch (e) {}
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && !forceMotion) { still(); return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    still();
    return;
  }
  const PR = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(PR);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 0, 6.5);

  const TAU = Math.PI * 2;
  const rand = Math.random;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  // ====================================================
  // SIZE — the canvas is as big as its page
  // ====================================================
  let W = 0, H = 0, zBase = 6.5;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (w === W && h === H) return false;
    W = w; H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    U.uAspect.value = w / h;
    // narrow portrait screens: pull back until a 3.4-unit-wide object fits, as the rest of Pro Mode does
    zBase = Math.max(6.5, 3.4 / (0.828 * camera.aspect));
    if (air) { air.resize(w, h, PR); paintGrid(); }
    return true;
  }

  // ====================================================
  // THE MACHINE
  // ====================================================
  const N = isMobile ? 18000 : 64000;
  const LABEL = {
    hypercar: ["Hypercar", "Siêu xe"], f1: ["F1 car", "Xe đua F1"], tank: ["Battle tank", "Xe tăng chiến đấu"],
    helicopter: ["Light helicopter", "Trực thăng hạng nhẹ"], jet: ["Stealth fighter", "Tiêm kích tàng hình"],
    bomber: ["Stealth bomber", "Máy bay ném bom tàng hình"],
    starship: ["Starship", "Tàu vũ trụ Starship"], cylinder: ["Cylinder", "Hình trụ"],
    leopard: ["Leopard", "Báo hoa mai"], lion: ["Lion", "Sư tử"], robot: ["Battle robot", "Robot chiến đấu"],
    car: ["Car", "Ô tô"], humanoid: ["Humanoid robot", "Robot hình người"], drone: ["Drone", "Drone"],
    dog: ["Robot dog", "Chó robot"], rover: ["Mars rover", "Xe tự hành sao Hỏa"],
  };
  // What the wind tunnel shows: the form's name, where the machine sits (CSS pixels) and how far it
  // reaches, and the band of air around it (fractions of the height, from the bottom). Also on window
  // for tests.
  const tunnel = { name: "", band: [0.25, 0.75], cx: 0, cy: 0, rx: 1, ry: 1, kick: null, grounded: false, floorK: 0 };
  window.__proTunnel = tunnel;

  // The machine's own frame: x from -1.9 (its front, into the wind) to 1.9, y from the ground at -1.3
  // up to 1.6. Wide screens: it sits left of centre, so its wake can stream across to the right above
  // the words. Tall screens: higher up and larger, with the words underneath.
  const FRAME = { x0: -1.9, x1: 1.9, y0: -1.3, y1: 0.8 };   // the cars stand on y = -1.3, the flyers sit around 0
  const place = { s: 1, ox: 0, oy: 0, yaw: 0.35, c: 1, sn: 0, px: 0, py: 0 };
  function layout(yaw) {
    const w = W || window.innerWidth, h = H || window.innerHeight, aspect = w / h;
    const halfH = Math.tan(camera.fov * Math.PI / 360) * zBase, halfW = halfH * aspect;
    const wide = smooth(0.75, 1.35, aspect);            // 0 = a phone held upright, 1 = a computer screen
    const fw = FRAME.x1 - FRAME.x0, fh = FRAME.y1 - FRAME.y0;
    const s = Math.min(lerp(0.98, 0.58, wide) * 2 * halfW / fw, lerp(0.5, 0.46, wide) * 2 * halfH / fh);
    const nx = lerp(0, -0.24, wide), ny = lerp(0.36, 0.3, wide);    // the middle of the frame, in -1..1
    const midY = (FRAME.y0 + FRAME.y1) / 2;
    place.s = s; place.ox = nx * halfW; place.oy = ny * halfH - midY * s;
    place.yaw = yaw; place.c = Math.cos(yaw) * s; place.sn = Math.sin(yaw) * s;
    place.px = place.ox; place.py = place.oy + 0.15 * s;   // what a drag turns it about
    const lo = 0.5 + (place.oy + FRAME.y0 * s) / (2 * halfH), hi = 0.5 + (place.oy + FRAME.y1 * s) / (2 * halfH);
    tunnel.band[0] = Math.max(0.03, lo - 0.08);
    tunnel.band[1] = Math.min(0.98, hi + 0.08);
    tunnel.cx = (0.5 + nx / 2) * w; tunnel.cy = (0.5 - ny / 2) * h;
    tunnel.rx = fw / 2 * s / (2 * halfW) * w; tunnel.ry = fh / 2 * s / (2 * halfH) * h;
  }

  // Engine jets and rotor downwash of this frame, in world coordinates, for the air.
  const FX_MAX = 8;
  const jets = Array.from({ length: FX_MAX }, () => ({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, power: 0, r: 0 }));
  let nJets = 0;
  function pushJet(e) {
    if (nJets >= FX_MAX || !e || !e.pos || !e.dir) return;
    const o = jets[nJets++], p = e.pos, d = e.dir, s = place.s;
    const cy = Math.cos(place.yaw), sy = Math.sin(place.yaw);
    o.x = (cy * p[0] + sy * p[2]) * s + place.ox; o.y = p[1] * s + place.oy; o.z = (-sy * p[0] + cy * p[2]) * s;
    o.dx = cy * d[0] + sy * d[2]; o.dy = d[1]; o.dz = -sy * d[0] + cy * d[2];
    o.power = clamp01(+e.power || 0);
    o.r = Math.max(0, +e.radius || 0) * s;      // > 0: a rotor disc of this radius
  }
  const pointer = { x: 9, y: 9, active: 0, speed: 0 };

  // The particles. Two sets of places and heat: A, the machine standing in the tunnel, and B, the one
  // it is turning into. Between two machines every particle travels straight from its place on one to
  // its place on the next (the shader, from uMorph), in a sweep from the front to the back, so the
  // machine reshapes in place as one solid body and the air keeps flowing round it (the owner asked
  // for no explosion here). Which point of the next machine a particle goes to is chosen when the
  // change starts, by matching the two shapes along a Hilbert curve over their own outlines: nose to
  // nose, wheels to wheels, short paths, nothing crossing the screen.
  const posA = new Float32Array(N * 3), posB = new Float32Array(N * 3);
  const heatA = new Float32Array(N), heatB = new Float32Array(N), seed = new Float32Array(N), sweep = new Float32Array(N);
  for (let k = 0; k < N; k++) seed[k] = rand();
  // particle p shows point mapA[p] of the machine standing, and mapB[p] of the one it turns into
  let mapA = new Int32Array(N), mapB = new Int32Array(N);
  for (let k = 0; k < N; k++) mapA[k] = mapB[k] = k;
  const geo = new THREE.BufferGeometry();
  const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
  const posAttrA = dyn(posA, 3), posAttrB = dyn(posB, 3), heatAttrA = dyn(heatA, 1), heatAttrB = dyn(heatB, 1);
  geo.setAttribute("position", posAttrA);
  geo.setAttribute("aPosB", posAttrB);
  geo.setAttribute("aHeatA", heatAttrA);
  geo.setAttribute("aHeatB", heatAttrB);
  geo.setAttribute("aRand", new THREE.BufferAttribute(seed, 1));
  const sweepAttr = dyn(sweep, 1);
  geo.setAttribute("aSweep", sweepAttr);
  // whether a particle's point blocks the air, on machine A and on machine B (the air passes through a
  // rotor's blur disc: those points are left out of the obstacle)
  const solidA = new Float32Array(N).fill(1), solidB = new Float32Array(N).fill(1);
  const solidAttrA = dyn(solidA, 1), solidAttrB = dyn(solidB, 1);
  geo.setAttribute("aSolidA", solidAttrA);
  geo.setAttribute("aSolidB", solidAttrB);
  function writeSolid(m, map, out, attr) {
    const so = m && m.solid;
    for (let k = 0; k < N; k++) out[k] = so ? so[map[k]] : 1;
    attr.needsUpdate = true;
  }
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);

  // A machine (in its own frame) into a set of particles: turned toward the viewer by its own yaw,
  // scaled and moved into place.
  const srcA = new Float32Array(N * 3), srcHeatA = new Float32Array(N);
  const srcB = new Float32Array(N * 3), srcHeatB = new Float32Array(N);
  function writeSet(src, srcHeat, yaw, map, pos, heat, posAttr, heatAttr) {
    const c = Math.cos(yaw) * place.s, sn = Math.sin(yaw) * place.s, s = place.s, ox = place.ox, oy = place.oy;
    for (let k = 0; k < N; k++) {
      const m = map[k], x = src[m * 3], y = src[m * 3 + 1], z = src[m * 3 + 2];
      pos[k * 3] = c * x + sn * z + ox;
      pos[k * 3 + 1] = y * s + oy;
      pos[k * 3 + 2] = -sn * x + c * z;
      heat[k] = srcHeat[m];
    }
    posAttr.needsUpdate = heatAttr.needsUpdate = true;
  }
  // Index along a Hilbert curve (16 bits a side) of a point in the unit square.
  function hilbert(fx, fy) {
    const n = 65536;
    let x = Math.min(n - 1, Math.max(0, Math.floor(fx * n))), y = Math.min(n - 1, Math.max(0, Math.floor(fy * n))), d = 0;
    for (let s = n >> 1; s > 0; s >>= 1) {
      const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
        const tt = x; x = y; y = tt;
      }
    }
    return d;
  }
  // Points (x, y of xyz triples, through an optional map) sorted along the Hilbert curve over their
  // own bounding box. Returns the order (indices) in out.
  const keyBuf = new Float64Array(N), SHIFT = 1048576;    // 2^20 > N: the index rides in the key
  function curveOrder(xyz, map, out) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < N; k++) {
      const m = map ? map[k] : k, x = xyz[m * 3], y = xyz[m * 3 + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const sx = 1 / Math.max(1e-6, x1 - x0), sy = 1 / Math.max(1e-6, y1 - y0);
    for (let k = 0; k < N; k++) {
      const m = map ? map[k] : k;
      keyBuf[k] = hilbert((xyz[m * 3] - x0) * sx, (xyz[m * 3 + 1] - y0) * sy) * SHIFT + k;
    }
    keyBuf.sort();
    for (let i = 0; i < N; i++) out[i] = keyBuf[i] - Math.floor(keyBuf[i] / SHIFT) * SHIFT;
    return { x0, x1 };
  }
  // A change is starting: which point of the next machine (its places now, in tmpB) each particle goes
  // to, and when it sets off (the front of the machine first).
  const orderP = new Int32Array(N), orderB = new Int32Array(N), tmpB = new Float32Array(N * 3);
  function matchShapes() {
    const span = curveOrder(posA, null, orderP);
    curveOrder(tmpB, null, orderB);
    for (let i = 0; i < N; i++) mapB[orderP[i]] = orderB[i];
    const ix = 1 / Math.max(1e-6, span.x1 - span.x0);
    for (let k = 0; k < N; k++) sweep[k] = (posA[k * 3] - span.x0) * ix;
    sweepAttr.needsUpdate = true;
  }
  const MORPH_TIME = 2.6;     // seconds from one machine to the next
  const FULL_BAND = [0.02, 0.98];   // the wind fills the whole tunnel (the owner asked for wind everywhere)
  const GROUND = -1.3;              // the machines' ground line, in their own frame (the cars stand on it)
  const GROUNDED = { hypercar: 1, f1: 1, tank: 1 };   // the machines that stand on the floor
  let morphing = false, yawA = 0.35, yawB = 0.35;
  function writeParticles() {
    writeSet(srcA, srcHeatA, yawA, mapA, posA, heatA, posAttrA, heatAttrA);
    if (morphing) writeSet(srcB, srcHeatB, yawB, mapB, posB, heatB, posAttrB, heatAttrB);
  }

  // The cycle of machines. Without machines.js: a cylinder across the stream, which sheds a vortex street.
  const machine = (function () {
    const M = window.ProMachines;
    const cylinder = () => {
      const base = new Float32Array(N * 3), h = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const th = rand() * TAU, nx = Math.cos(th), ny = Math.sin(th);
        base[k * 3] = 0.62 * nx; base[k * 3 + 1] = 0.62 * ny - 0.6; base[k * 3 + 2] = (rand() - 0.5) * 1.8;
        h[k] = 0.2 + 0.8 * Math.pow(Math.max(0, -nx), 2) + 0.15 * Math.max(0, nx);
      }
      tunnel.name = "cylinder";
      return { frame() { layout(0.35); yawA = 0.35; srcA.set(base); srcHeatA.set(h); }, poke() {} };
    };
    if (!M || typeof M.make !== "function") return cylinder();
    const D = M.DURATION || { dwell: 5 };
    // the machines shown, in this order (the owner's choice: no tank and no Starship; the helicopter is
    // a Chinook-like tandem-rotor one); any of them that is missing is skipped
    const SHOW = ["hypercar", "f1", "helicopter", "jet"];
    const all = (Array.isArray(M.CYCLE) && M.CYCLE.length ? M.CYCLE : (M.NAMES || []).map((name) => ({ name, dwell: D.dwell })))
      .filter((c) => c && c.name).map((c) => ({ name: c.name, dwell: +c.dwell > 0 ? +c.dwell : D.dwell || 5 }));
    const shown = SHOW.map((n) => all.find((c) => c.name === n)).filter(Boolean);
    const cycle = shown.length ? shown : all;
    if (!cycle.length) return cylinder();
    const names = cycle.map((c) => c.name), built = {};
    const get = (k) => built[names[k]] || (built[names[k]] = M.make(names[k], N, 11));
    // ?machine=tank in the address starts at that machine, and &stay holds it until a click;
    // &morph=0.4 holds the change into the next machine at that point (for looking at it closely)
    let cur = 0, stay = false, hold = -1;
    try {
      const q = new URLSearchParams(location.search);
      cur = Math.max(0, names.indexOf(q.get("machine")));
      stay = q.has("stay");
      if (q.has("morph")) { hold = Math.min(1, Math.max(0, parseFloat(q.get("morph")) || 0)); stay = true; }
    } catch (e) { cur = 0; }
    try { get(cur); } catch (e) { return cylinder(); }
    writeSolid(built[names[cur]], mapA, solidA, solidAttrA);
    // the first machine is needed now; the others are built in idle time, one at a time
    const cur0 = cur;
    const later = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 600 }) : (fn) => setTimeout(fn, 60);
    (function buildRest(k) {
      if (k >= names.length) return;
      later(() => { try { get((cur0 + k) % names.length); } catch (e) { /* that machine is left out */ } buildRest(k + 1); });
    })(1);
    const yawOf = (m) => (m && typeof m.yaw === "number" ? m.yaw : 0.35);
    // cur: the machine standing in the tunnel; to: the one it is turning into (-1 while it stands)
    let to = -1, since = null, kick = false, lastAge = 0;
    const nextBuilt = () => {
      for (let j = 1; j < names.length; j++) { const k = (cur + j) % names.length; if (built[names[k]]) return k; }
      return -1;
    };
    tunnel.name = names[cur];
    return {
      frame(t) {
        if (since === null) since = t;
        if (to < 0 && (kick || hold >= 0 || (!stay && t - since >= cycle[cur].dwell))) {
          const k = nextBuilt();
          if (k >= 0) {
            kick = false; to = k; since = t;
            // where the next machine's points are now (placed as it will be shown), matched to the particles
            const b = built[names[to]], yb = yawOf(b) + 0.04 * Math.sin(t * 0.21);
            srcHeatB.set(b.heat); b.pose(t, srcB, 0, srcHeatB, null);
            const c = Math.cos(yb) * place.s, sn = Math.sin(yb) * place.s;
            for (let i = 0; i < N; i++) {
              const x = srcB[i * 3], y = srcB[i * 3 + 1], z = srcB[i * 3 + 2];
              tmpB[i * 3] = c * x + sn * z + place.ox; tmpB[i * 3 + 1] = y * place.s + place.oy; tmpB[i * 3 + 2] = -sn * x + c * z;
            }
            matchShapes();
            writeSolid(b, mapB, solidB, solidAttrB);
          }
        }
        if (hold >= 0 && to >= 0) since = t - hold * MORPH_TIME;
        if (to >= 0 && t - since >= MORPH_TIME && hold < 0) {
          cur = to; to = -1; since = t; lastAge = 0;
          const keep = mapA; mapA = mapB; mapB = keep;      // the particles now show the new machine
          writeSolid(built[names[cur]], mapA, solidA, solidAttrA);
        }
        const a = built[names[cur]], sway = 0.04 * Math.sin(t * 0.21);
        yawA = yawOf(a) + sway;
        layout(yawA);
        if (to >= 0) {
          // on the way: both machines keep their own motion (wheels, rotors) while the cloud travels
          const b = built[names[to]], u = (t - since) / MORPH_TIME;
          yawB = yawOf(b) + sway;
          srcHeatA.set(a.heat); a.pose(t, srcA, cycle[cur].dwell, srcHeatA, null);
          srcHeatB.set(b.heat); b.pose(t, srcB, 0, srcHeatB, null);
          morphing = true;
          U.uMorph.value = Math.min(1, Math.max(0, u));
          tunnel.name = names[u < 0.5 ? cur : to];
          tunnel.grounded = !!GROUNDED[tunnel.name];
          // a car turning into the jet takes off: the floor drops away below the screen as it rises;
          // the jet turning into a car lands: the floor comes back up to meet it
          const f0 = GROUNDED[names[cur]] ? 1 : 0, f1 = GROUNDED[names[to]] ? 1 : 0, e = Math.min(1, Math.max(0, u));
          tunnel.floorK = f0 + (f1 - f0) * e * e * (3 - 2 * e);
        } else {
          // a machine that holds plays its own animation (wheels, tracks, rotors, flaps, engines);
          // no weapons: nothing aims at the cursor and nothing fires
          morphing = false;
          U.uMorph.value = 0;
          const age = Math.min(t - since, cycle[cur].dwell);
          srcHeatA.set(a.heat);
          a.pose(t, srcA, age, srcHeatA, null);
          if (typeof a.exhaust === "function") {
            const ex = a.exhaust(age);
            if (ex) for (let i = 0; i < ex.length; i++) pushJet(ex[i]);
          }
          lastAge = age;
          tunnel.name = names[cur];
          tunnel.grounded = !!GROUNDED[tunnel.name];
          tunnel.floorK = tunnel.grounded ? 1 : 0;
        }
      },
      poke() { if (to < 0) kick = true; },
    };
  })();
  tunnel.kick = () => machine.poke();

  // ====================================================
  // THE LOOK — the same particles as the rest of Pro Mode: soft additive
  // dots, white with a tint of the simulation colormap (here the surface
  // pressure, and the hot spots: muzzle flashes, engines, a transformation's
  // glow). The cursor pushes them aside, a click sends a ring through them,
  // and a drag turns the machine.
  // ====================================================
  const U = {
    uTime: { value: 0 }, uSize: { value: isMobile ? 2.2 : 1.85 }, uPR: { value: PR },
    uYaw: { value: 0 }, uPitch: { value: 0 }, uPivot: { value: new THREE.Vector3() },
    uMouse: { value: new THREE.Vector2(9, 9) }, uMouseStr: { value: 0 }, uAspect: { value: 1 },
    uShock: { value: [new THREE.Vector3(0, 0, 99), new THREE.Vector3(0, 0, 99), new THREE.Vector3(0, 0, 99)] },
    uMaskSize: { value: 2 }, uMorph: { value: 0 }, uChaos: { value: 0 },
  };
  // Where a particle is: on machine A, on machine B, or in flight between them, exactly as the cloud
  // flies between the scales further down the page (home.js), but about the machine's own centre.
  // The cloud and the air's silhouette share it, so they always agree.
  const PLACE = `
    attribute vec3 aPosB;
    attribute float aHeatA;
    attribute float aHeatB;
    attribute float aRand;
    attribute float aSweep;
    attribute float aSolidA;
    attribute float aSolidB;
    uniform float uTime, uYaw, uPitch, uMorph, uChaos;
    uniform vec3 uPivot;
    float kM;              // how far this particle is on its way from machine A to machine B (0..1)
    vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
    vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }
    vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c*p.x - s*p.y, s*p.x + c*p.y, p.z); }
    // cheap divergence-free-looking turbulence (two octaves of crossed sines)
    vec3 turb(vec3 p, float t) {
      vec3 a = sin(p.yzx * 2.7 + t * 1.3) * cos(p.zxy * 1.9 - t * 0.9);
      vec3 b = sin(p.zxy * 6.1 - t * 2.1) * cos(p.yzx * 5.3 + t * 1.7);
      return a + 0.5 * b;
    }
    vec3 placed() {
      // straight from its place on machine A to its place on machine B, setting off in a sweep from the
      // front of the machine to the back (and a hair of randomness so the sweep is not a hard edge)
      kM = clamp((uMorph - (aSweep * 0.4 + aRand * 0.05)) / 0.55, 0.0, 1.0);
      kM = kM * kM * (3.0 - 2.0 * kM);
      vec3 p = mix(position, aPosB, kM);
      float s = uTime * 0.6 + aRand * 6.2831;
      vec3 drift = vec3(sin(s + p.y * 2.3), cos(s * 1.1 + p.z * 2.7), sin(s * 0.9 + p.x * 3.1));
      p += drift * 0.01;
      p += turb(p + aRand, uTime) * (uChaos * (0.12 + 0.3 * fract(aRand * 3.7)));
      // the turn the visitor gives the machine by dragging, about its centre
      return rotX(rotY(p - uPivot, uYaw), uPitch) + uPivot;
    }`;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uSize, uPR, uMouseStr, uAspect;
      uniform vec2 uMouse;
      uniform vec3 uShock[3];
      varying vec3 vColor;
      varying float vAlpha;
      ${PLACE}
      // Simulation-style colormap: deep blue -> cyan -> yellow -> red.
      vec3 cmap(float x) {
        x = clamp(x, 0.0, 1.0);
        return clamp(vec3(1.6 - abs(4.0*x - 3.2), 1.5 - abs(4.0*x - 2.0), 1.6 - abs(4.0*x - 0.75)), 0.0, 1.0);
      }
      void main() {
        vec4 mv = modelViewMatrix * vec4(placed(), 1.0);
        float depthScale = -mv.z / 6.5;
        vec4 clip = projectionMatrix * mv;
        vec2 ndc = clip.xy / clip.w;
        // the cursor flings particles aside and swirls them
        vec2 d = (ndc - uMouse) * vec2(uAspect, 1.0);
        float push = uMouseStr * exp(-dot(d, d) / 0.03);
        vec2 dn = normalize(d + 1e-5);
        mv.xy += (dn * 0.3 + vec2(-dn.y, dn.x) * 0.22) * push * depthScale;
        // rings from clicks, roars and big guns
        float glow = 0.0;
        for (int q = 0; q < 3; q++) {
          vec2 ds = (ndc - uShock[q].xy) * vec2(uAspect, 1.0);
          float age = uShock[q].z;
          float ring = exp(-pow(length(ds) - age * 1.5, 2.0) / (0.012 + 0.02 * age)) * exp(-age * 0.75);
          mv.xy += normalize(ds + 1e-5) * ring * 0.55 * depthScale;
          glow += ring;
        }
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * clamp(6.5 / -mv.z, 0.6, 1.8) * (1.0 + 0.8 * glow + 0.5 * push);
        // mostly white with a tint of the surface pressure; hot spots take the full colour, and in
        // flight the particles show the colormap, as the cloud does further down the page
        float heat = mix(aHeatA, aHeatB, kM);
        float tint = 0.3 + 0.7 * smoothstep(0.8, 1.0, heat);
        float h = heat + 0.06 * sin(uTime * 1.3 + aRand * 20.0) * tint;
        vColor = mix(vec3(0.93, 0.96, 1.0), cmap(h), tint) * (0.9 + aRand * 0.2);
        vColor = mix(vColor, vec3(1.0), clamp(glow, 0.0, 0.8));
        vAlpha = 0.85 + glow * 0.5;
      }`,
    fragmentShader: `
      precision highp float;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25) discard;
        float a = exp(-d * 16.0) + 0.35 * exp(-d * 5.0);
        gl_FragColor = vec4(vColor * 1.2, a * vAlpha * 1.05);
      }`,
  });
  const cloud = new THREE.Points(geo, cloudMat);
  cloud.frustumCulled = false;
  cloud.renderOrder = 5;
  scene.add(cloud);

  // ====================================================
  // THE AIR — flow.js, around the silhouette drawn from the same particles
  // ====================================================
  let air = null, maskScene = null, warmed = false;
  if (window.ProFlow && typeof window.ProFlow.create === "function") {
    try {
      const f = window.ProFlow.create(renderer, { mobile: isMobile });
      if (f && f.supported && f.mask && f.display) {
        const maskMat = new THREE.ShaderMaterial({
          uniforms: U,
          depthTest: false,
          depthWrite: false,
          vertexShader: `
            uniform float uMaskSize;
            ${PLACE}
            void main() {
              vec4 mv = modelViewMatrix * vec4(placed(), 1.0);
              gl_Position = projectionMatrix * mv;
              // the machine stays one solid body while it changes, so the air keeps flowing round it;
              // the points the air passes through (a rotor's blur disc) are moved out of view
              gl_PointSize = uMaskSize * clamp(6.5 / -mv.z, 0.6, 1.8);
              if (mix(aSolidA, aSolidB, kM) < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            }`,
          fragmentShader: `
            precision highp float;
            void main() {
              vec2 c = gl_PointCoord - 0.5;
              if (dot(c, c) > 0.25) discard;
              gl_FragColor = vec4(1.0);
            }`,
        });
        maskScene = new THREE.Scene();
        const maskCloud = new THREE.Points(geo, maskMat);
        maskCloud.frustumCulled = false;
        maskScene.add(maskCloud);
        f.display.frustumCulled = false;
        f.display.renderOrder = -10;
        scene.add(f.display);
        air = f;
      } else if (f && typeof f.dispose === "function") {
        f.dispose();
      }
    } catch (e) {
      air = null;
    }
  }
  if (!air) still();
  const gridEl = document.getElementById("flow-grid");
  function paintGrid() {
    const st = air && air.stats;
    if (!gridEl || !st || !st.gridW) return;
    const g = st.gridW + " × " + st.gridH;
    gridEl.innerHTML = '<span lang="en">Grid ' + g + '</span><span lang="vi">Lưới ' + g + "</span>";
  }

  // ====================================================
  // READOUT — the form's name, in both languages
  // ====================================================
  const nameEl = document.getElementById("flow-name");
  let shownName = null;
  function paintName() {
    if (!nameEl || !tunnel.name || tunnel.name === shownName) return;
    const first = shownName === null;
    shownName = tunnel.name;
    const lab = LABEL[tunnel.name] || [tunnel.name, tunnel.name];
    nameEl.innerHTML = '<span lang="en"></span><span lang="vi"></span>';
    nameEl.children[0].textContent = lab[0];
    nameEl.children[1].textContent = lab[1];
    if (!first && nameEl.animate) nameEl.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "ease-out" });
  }

  // ====================================================
  // POINTER — move to stir the air, press and drag to turn the machine,
  // click (or tap) to transform it now. Only on this page.
  // ====================================================
  const toNdc = (x, y) => {
    const r = canvas.getBoundingClientRect();
    return [((x - r.left) / (r.width || 1)) * 2 - 1, -(((y - r.top) / (r.height || 1)) * 2 - 1), r];
  };
  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const onControl = (el) => !!(el && el.closest && el.closest("a, button, input, textarea, select, label, nav, form, .home-intro__words"));
  if (!isMobile) {
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const [x, y, r] = toNdc(e.clientX, e.clientY);
      if (!inside(r, e.clientX, e.clientY)) { pointer.active = 0; return; }
      if (pointer.active) pointer.speed = Math.min(3, pointer.speed + Math.hypot(x - pointer.x, y - pointer.y) * 6);
      pointer.x = x; pointer.y = y; pointer.active = 1;
    }, { passive: true });
    document.addEventListener("pointerleave", () => { pointer.active = 0; });
  }
  const turn = { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, idle: 9 };
  const TURN = 0.0065, PITCH_MAX = 1.0, TURN_COAST = 3.2;
  let press = null, shockSlot = 0, shake = 0;
  section.addEventListener("pointerdown", (e) => {
    if (e.button || onControl(e.target)) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), t0: performance.now(),
      mouse: e.pointerType === "mouse", moved: false };
  }, { passive: true });
  window.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.moved) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < (press.mouse ? 5 : 10)) return;
      press.moved = true;
      if (press.mouse) document.documentElement.classList.add("is-turning");
    }
    if (press.mouse) {
      const now = performance.now(), dt = Math.max(0.008, (now - press.lt) / 1000);
      const dyaw = (e.clientX - press.lx) * TURN, dpitch = (e.clientY - press.ly) * TURN;
      turn.yaw += dyaw;
      turn.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, turn.pitch + dpitch));
      const cap = (v) => Math.max(-TURN_COAST, Math.min(TURN_COAST, v));
      turn.vyaw = cap(turn.vyaw + (dyaw / dt - turn.vyaw) * 0.5); turn.vpitch = cap(turn.vpitch + (dpitch / dt - turn.vpitch) * 0.5);
      turn.idle = 0;
      press.lt = now;
    }
    press.lx = e.clientX; press.ly = e.clientY;
  }, { passive: true });
  const release = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    document.documentElement.classList.remove("is-turning");
    if (e.type !== "pointerup" || p.moved || performance.now() - p.t0 > 600) return;
    // a click or a tap: a ring through the particles, a blast in the air, and the next form now
    const [x, y] = toNdc(e.clientX, e.clientY);
    const v = U.uShock.value[shockSlot];
    shockSlot = (shockSlot + 1) % 3;
    v.set(x, y, 0);
    if (air) air.pulse(x, y, 1);
    shake = Math.min(1, shake + 0.3);
    machine.poke();
  };
  window.addEventListener("pointerup", release, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });

  // ====================================================
  // ENGINES — jets of air behind engines and under a rotor
  // ====================================================
  const fa = new THREE.Vector3(), fb = new THREE.Vector3();
  function effects() {
    if (air) {
      for (let i = 0; i < nJets; i++) {
        const e = jets[i];
        if (e.r > 0) {
          // a rotor: its disc seen edge-on, from tip to tip across the shaft; the air is driven
          // down along the shaft across the whole disc and the wind sweeps the wash back
          if (typeof air.rotor !== "function") continue;
          const dl = Math.hypot(e.dx, e.dy) || 1, tx = -e.dy / dl * e.r, ty = e.dx / dl * e.r;
          fa.set(e.x - tx, e.y - ty, e.z).project(camera);
          fb.set(e.x + tx, e.y + ty, e.z).project(camera);
          const ax = fa.x, ay = fa.y, bx = fb.x, by = fb.y;
          fa.set(e.x, e.y, e.z).project(camera);
          fb.set(e.x + e.dx * 0.3, e.y + e.dy * 0.3, e.z + e.dz * 0.3).project(camera);
          air.rotor(ax, ay, bx, by, fb.x - fa.x, fb.y - fa.y, e.power);
          continue;
        }
        fa.set(e.x, e.y, e.z).project(camera);
        fb.set(e.x + e.dx * 0.3, e.y + e.dy * 0.3, e.z + e.dz * 0.3).project(camera);
        air.stir(fa.x, fa.y, (fb.x - fa.x) * e.power, (fb.y - fa.y) * e.power);
      }
    }
    nJets = 0;
  }

  // ====================================================
  // LOOP — runs only while the page is on screen and the tab is visible;
  // its clock stops with it, so nothing is skipped while away.
  // ====================================================
  let t = 0, last = 0, running = false, visible = true, raf = 0, first = true;
  const lean = { x: 0, y: 0 };
  let px = 9, py = 9;
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    t += dt;
    if (dirty) { dirty = false; resize(); }

    machine.frame(t);
    writeParticles();
    paintName();

    // the turn the visitor gave the machine: coasts, slows, and eases back to facing front
    if (!(press && press.moved && press.mouse)) {
      turn.idle += dt;
      turn.yaw += turn.vyaw * dt;
      turn.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, turn.pitch + turn.vpitch * dt));
      const slow = Math.exp(-dt * 3.6);
      turn.vyaw *= slow; turn.vpitch *= slow;
      if (turn.idle > 1.6) {
        const back = 1 - Math.exp(-dt * 1.2);
        turn.yaw = Math.atan2(Math.sin(turn.yaw), Math.cos(turn.yaw));
        turn.yaw -= turn.yaw * back; turn.pitch -= turn.pitch * back;
      }
    }
    U.uYaw.value = turn.yaw;
    U.uPitch.value = turn.pitch;
    U.uPivot.value.set(place.px, place.py, 0);
    U.uTime.value = t;
    U.uMouse.value.set(pointer.x, pointer.y);
    U.uMouseStr.value += ((pointer.active ? 1 : 0) - U.uMouseStr.value) * Math.min(1, dt * 3);
    for (const v of U.uShock.value) v.z += dt;
    pointer.speed *= Math.exp(-dt * 3);

    // the camera: a slow drift, a lean toward the cursor, and a little shake from a click (which also
    // stirs the particles, as clicks do further down the page)
    shake *= Math.exp(-dt * 5);
    U.uChaos.value += (Math.min(1.2, shake * 1.2) - U.uChaos.value) * Math.min(1, dt * 6);
    const ease = Math.min(1, dt * 2.2);
    lean.x += ((pointer.active ? pointer.x : 0) - lean.x) * ease;
    lean.y += ((pointer.active ? pointer.y : 0) - lean.y) * ease;
    camera.position.z = zBase + Math.sin(t * 0.31) * 0.1;
    camera.position.x = lean.x * 0.15 + Math.sin(t * 0.23) * 0.08 + (rand() - 0.5) * 0.08 * shake;
    camera.position.y = lean.y * 0.1 + Math.cos(t * 0.19) * 0.06 + (rand() - 0.5) * 0.08 * shake;
    camera.lookAt(camera.position.x * 0.5, camera.position.y * 0.5, 0);

    effects();
    if (air) {
      // the silhouette, from the particles as they are this frame
      U.uMaskSize.value = Math.max(1.5, (air.maskPointScale || 0.2) * U.uSize.value * 2.6);
      renderer.setRenderTarget(air.mask);
      renderer.render(maskScene, camera);
      renderer.setRenderTarget(null);
      if (!warmed) { warmed = true; air.warmup(isMobile ? 30 : 60, 1 / 60); }
      if (pointer.active) {
        const dx = pointer.x - px, dy = pointer.y - py;
        if (px < 5 && (dx !== 0 || dy !== 0)) air.stir(pointer.x, pointer.y, dx, dy);
        px = pointer.x; py = pointer.y;
      } else {
        px = py = 9;
      }
      // the floor the cars stand on (the wind tunnel's rolling road): where their near wheels touch the
      // ground on screen; the flyers have none
      let floor = -1;
      if (tunnel.floorK > 0.001) {
        fa.set(place.ox, place.oy + GROUND * place.s, 0.75 * place.s).project(camera);
        const ground = 0.5 + 0.5 * fa.y;
        floor = -0.06 + (ground + 0.06) * tunnel.floorK;     // below the screen when it has gone
        if (floor <= 0.005) floor = -1;
      }
      air.step(dt, { time: t, inflow: 1, band: FULL_BAND, crossFlow: 0.35, floor });
      air.setOpacity(1);
    }
    renderer.render(scene, camera);
    if (first) { first = false; canvas.classList.add("is-ready"); }
  }
  function update() {
    const want = visible && document.visibilityState === "visible";
    if (want && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; cancelAnimationFrame(raf); }
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); }, { rootMargin: "80px 0px" }).observe(section);
  }
  document.addEventListener("visibilitychange", update);
  // the canvas follows its page, which holds a steady height on phones (home.js): resize only when it changes
  let dirty = false;
  if ("ResizeObserver" in window) new ResizeObserver(() => { dirty = true; }).observe(canvas);
  else window.addEventListener("resize", () => { dirty = true; });
  resize();
  paintGrid();
  update();
})();

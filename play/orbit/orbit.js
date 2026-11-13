/* =========================================================
   Orbit Sling: a gravity slingshot puzzle.
   Drag back like a slingshot, let go, and a probe flies under real
   inverse-square gravity from every planet and moon on the level.
   Everything is drawn with canvas and all sound is synthesised,
   so there are no image or audio files.

   Layout of this file:
     levels · physics (pure, shared with the tests) · setup and layout
     save · audio · drawing · game flow · input · menus · main loop
   ========================================================= */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // the text in the language chosen for the site: English, or Vietnamese
  const TX = (en, vi) => (window.PlayLang ? window.PlayLang.t(en, vi) : en);

  // ====================================================
  // WORLD AND LEVELS
  // The playfield is always 600 by 1000 units, y pointing down.
  //   L   launch point [x, y]
  //   T   target ring [x, y, radius]; To puts it on a circular rail
  //   B   bodies [x, y, radius, GM, look, rail]
  //   G   gates [x1, y1, x2, y2], all must be crossed before the ring opens
  //   W   debris walls [x1, y1, x2, y2], touching one ends the flight
  //   rail = [centre x, centre y, radius, period in seconds, start angle in degrees]
  //          a negative period turns the other way
  //   pmax launch speed limit, par probes allowed for three stars
  // ====================================================
  const W = 600, H = 1000;
  const DT = 1 / 240;        // fixed physics step
  const MAX_T = 20;          // a probe runs out of power after this many seconds
  const PROBE_R = 4, OUT = 6;
  const PMIN = 60, PMAX = 460;

  const LEVELS = [
    { n: "First Light", L: [300, 860], T: [300, 220, 48],
      tip: "Drag back anywhere like a slingshot, then let go." },
    { n: "Sidestep", L: [140, 870], T: [455, 210, 44],
      tip: "Pull further back for more power. The dots show where the probe starts to go." },
    { n: "Gentle Pull", L: [300, 880], T: [300, 170, 40], B: [[130, 520, 44, 3e6, "ice"]],
      tip: "Planets pull the probe toward them. Aim a little away." },
    { n: "The Bend", L: [110, 870], T: [490, 170, 40], B: [[300, 520, 50, 4e6, "rock"]],
      tip: "The planet is in the way. Let it bend the path around." },
    { n: "Narrow Pass", L: [300, 880], T: [300, 140, 38], B: [[165, 500, 54, 5e6, "gas"], [425, 470, 32, 2e6, "ice"]],
      tip: "Two pulls at once. The big planet pulls harder." },
    { n: "Half Orbit", pmax: 190, L: [300, 810], T: [300, 235, 34], B: [[300, 500, 60, 6e6, "gas"]],
      tip: "This launcher is weak. Fall around the planet instead of fighting it." },
    { n: "Wandering Moon", L: [300, 880], T: [300, 140, 38], B: [[0, 0, 30, 2.5e6, "moon", [300, 500, 170, 7, 0]]],
      tip: "Moons start moving at launch. More power gets there sooner." },
    { n: "First Gate", par: 4, L: [300, 880], T: [480, 180, 44], G: [[70, 480, 200, 480]], B: [[300, 420, 46, 4e6, "violet"]],
      tip: "Fly through the gate first. Then the ring opens." },
    { n: "Planet and Moon", L: [120, 880], T: [470, 150, 36], B: [[300, 470, 48, 4.5e6, "green"], [0, 0, 18, 8e5, "moon", [300, 470, 130, 5, 200]]] },
    { n: "Over the Wall", par: 4, L: [120, 880], T: [480, 700, 48], W: [[310, 520, 310, 1010]], B: [[310, 380, 44, 6e6, "rock"]],
      tip: "Debris stops a probe. Swing around the planet to get past it." },
    { n: "Twin Suns", L: [300, 890], T: [300, 120, 36], B: [[0, 0, 40, 3e6, "sun", [300, 480, 110, 9, 0]], [0, 0, 40, 3e6, "sun2", [300, 480, 110, 9, 180]]],
      tip: "Two suns circle each other. They pull hardest when they are close." },
    { n: "Moving Station", L: [300, 890], T: [0, 0, 26], To: [300, 400, 160, 10, 270], B: [[300, 400, 50, 5e6, "green"]],
      tip: "The ring is on the move. Aim for where it will be." },
    { n: "Slalom", par: 4, L: [300, 890], T: [300, 110, 36], G: [[365, 650, 455, 650], [145, 350, 235, 350]], B: [[300, 650, 40, 3.5e6, "rock"], [300, 350, 40, 3.5e6, "ice"]],
      tip: "Two gates, one on each side. Any order works." },
    { n: "Round Trip", par: 4, pmax: 190, L: [300, 800], T: [180, 775, 30], G: [[300, 150, 300, 260]], B: [[300, 500, 60, 6e6, "gas"]],
      tip: "A weak launcher again. Go all the way around." },
    { n: "Two Wells", pmax: 240, L: [70, 720], T: [530, 300, 28], W: [[300, 400, 300, 620]], B: [[190, 720, 44, 3.5e6, "rock"], [410, 300, 44, 3.5e6, "ice"]] },
    { n: "Borrowed Speed", par: 4, pmax: 165, L: [300, 800], T: [300, 110, 30], B: [[300, 560, 54, 6e6, "gas"], [0, 0, 20, 1.2e6, "moon", [300, 560, 170, 6.2, 90]]],
      tip: "This launcher is too weak alone. Pass close behind the moon for a tow." },
    { n: "Shepherd Moons", L: [300, 900], T: [300, 120, 26], B: [[300, 520, 46, 4.5e6, "gas"], [0, 0, 16, 7e5, "moon", [300, 520, 115, 4, 0]], [0, 0, 20, 1e6, "moon", [300, 520, 200, -9, 180]]] },
    { n: "The Cup", par: 5, L: [110, 880], T: [460, 760, 34], W: [[380, 660, 380, 840], [380, 840, 540, 840], [540, 660, 540, 840]], B: [[300, 300, 50, 6e6, "violet"]] },
    { n: "Between the Twins", par: 4, L: [300, 890], T: [300, 120, 34], G: [[262, 480, 338, 480]], B: [[0, 0, 36, 3e6, "sun", [300, 480, 120, 8, 40]], [0, 0, 36, 3e6, "sun2", [300, 480, 120, 8, 220]]] },
    { n: "Eclipse", L: [300, 900], T: [300, 318, 20], W: [[262, 262, 262, 340], [338, 262, 338, 340]], B: [[300, 420, 52, 5e6, "rock"], [0, 0, 20, 8e5, "moon", [300, 420, 170, 6, 30]]],
      tip: "The ring hides behind the planet." },
    { n: "Three Gates", par: 4, L: [300, 900], T: [300, 90, 34], G: [[230, 690, 320, 690], [280, 480, 370, 480], [230, 270, 320, 270]], B: [[170, 690, 40, 3.5e6, "rock"], [430, 480, 40, 3.5e6, "violet"], [170, 270, 40, 3.5e6, "ice"]] },
    { n: "Waltz", L: [300, 900], T: [0, 0, 24], To: [300, 450, 230, -14, 250], B: [[0, 0, 36, 3e6, "sun", [300, 450, 100, 8, 0]], [0, 0, 36, 3e6, "sun2", [300, 450, 100, 8, 180]]] },
    { n: "Long Way Round", par: 5, L: [480, 880], T: [120, 860, 32], G: [[380, 480, 480, 480], [120, 480, 220, 480]], B: [[300, 480, 50, 5e6, "gas"], [0, 0, 18, 8e5, "moon", [300, 480, 250, 10, 270]]] },
    { n: "Grand Tour", par: 5, L: [300, 910], T: [300, 100, 30], G: [[262, 500, 338, 500]], W: [[-10, 250, 230, 250], [370, 250, 610, 250]], B: [[0, 0, 34, 3e6, "sun", [300, 500, 115, 8, 0]], [0, 0, 34, 3e6, "sun2", [300, 500, 115, 8, 180]], [0, 0, 16, 7e5, "moon", [300, 500, 235, -11, 90]]] },
  ];

  // The levels' names and tips in Vietnamese, in the same order.
  const LEVELS_VI = [
    ["Ánh sáng đầu tiên", "Kéo lùi ở bất kỳ đâu như kéo ná cao su, rồi thả tay."],
    ["Né sang bên", "Kéo lùi xa hơn để phóng mạnh hơn. Các chấm cho thấy tàu sẽ bắt đầu bay về đâu."],
    ["Lực hút nhẹ", "Hành tinh hút tàu về phía mình. Hãy ngắm lệch ra một chút."],
    ["Khúc cong", "Hành tinh chắn ngay giữa đường. Hãy để nó bẻ cong đường bay vòng qua."],
    ["Khe hẹp", "Hai lực hút cùng lúc. Hành tinh lớn hút mạnh hơn."],
    ["Nửa vòng quỹ đạo", "Bệ phóng này yếu. Hãy để tàu rơi vòng quanh hành tinh thay vì cưỡng lại nó."],
    ["Trăng lang thang", "Mặt trăng bắt đầu chuyển động khi tàu được phóng. Phóng mạnh hơn thì tới nơi sớm hơn."],
    ["Cổng đầu tiên", "Hãy bay qua cổng trước. Sau đó vòng đích mới mở."],
    ["Hành tinh và trăng", ""],
    ["Vượt tường", "Mảnh vỡ sẽ chặn tàu lại. Hãy lượn vòng quanh hành tinh để vượt qua."],
    ["Hai mặt trời", "Hai mặt trời quay quanh nhau. Chúng hút mạnh nhất khi ở gần."],
    ["Trạm di động", "Vòng đích đang di chuyển. Hãy ngắm vào nơi nó sắp tới."],
    ["Lượn zíc zắc", "Hai cổng, mỗi bên một cổng. Qua cổng nào trước cũng được."],
    ["Trọn một vòng", "Lại một bệ phóng yếu. Hãy bay trọn một vòng."],
    ["Hai giếng", ""],
    ["Mượn tốc độ", "Chỉ riêng bệ phóng này thì quá yếu. Hãy bay sát phía sau mặt trăng để được kéo theo."],
    ["Trăng chăn dắt", ""],
    ["Chiếc cốc", ""],
    ["Giữa hai mặt trời", ""],
    ["Nhật thực", "Vòng đích nấp sau hành tinh."],
    ["Ba cổng", ""],
    ["Điệu van", ""],
    ["Đường vòng xa", ""],
    ["Đại hành trình", ""],
  ];
  const levelName = (l) => TX(l.n, (LEVELS_VI[l.i] || [])[0]);
  // the tip of a level. Where a level has none, a weak launcher still gets a word when the level opens.
  const levelTip = (l, opening) => (l.tip ? TX(l.tip, (LEVELS_VI[l.i] || [])[1])
    : opening && l.pmax < PMAX ? TX("This launcher is weak. The dashed circle shows its full power.", "Bệ phóng này yếu. Vòng tròn nét đứt cho thấy lực phóng tối đa của nó.") : "");

  // fill in defaults and turn rail angles into radians
  function prepare(lv, i) {
    lv.i = i;
    lv.pmax = lv.pmax || PMAX;
    lv.par = lv.par || 3;
    lv.G = lv.G || []; lv.W = lv.W || [];
    lv.B = (lv.B || []).map((b) => ({
      x: b[0], y: b[1], r: b[2], gm: b[3], kind: b[4] || "rock",
      o: b[5] ? [b[5][0], b[5][1], b[5][2], b[5][3], b[5][4] * Math.PI / 180] : null,
    }));
    if (lv.To) lv.To = [lv.To[0], lv.To[1], lv.To[2], lv.To[3], lv.To[4] * Math.PI / 180];
    return lv;
  }
  LEVELS.forEach(prepare);

  // ====================================================
  // PHYSICS: pure functions, no drawing. The game and the solver in the
  // tests both fly probes through makeFlight, so they cannot disagree.
  // Velocity Verlet with a fixed step keeps energy steady on close passes.
  // ====================================================
  function railX(o, t) { return o[0] + o[2] * Math.cos(o[4] + TAU * t / o[3]); }
  function railY(o, t) { return o[1] + o[2] * Math.sin(o[4] + TAU * t / o[3]); }
  function targetPos(lv, t) {
    return lv.To ? [railX(lv.To, t), railY(lv.To, t)] : [lv.T[0], lv.T[1]];
  }
  // do segments a-b and c-d cross
  function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const den = rx * sy - ry * sx;
    if (den === 0) return false;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
    const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function makeFlight(lv, angleDeg, power, gscale) {
    const gs = gscale === undefined ? 1 : gscale;
    const a = angleDeg * Math.PI / 180;
    const B = lv.B, n = B.length;
    const bx = new Float64Array(n), by = new Float64Array(n);
    const f = {
      x: lv.L[0], y: lv.L[1], vx: Math.cos(a) * power, vy: -Math.sin(a) * power,
      ax: 0, ay: 0, t: 0, result: null, pull: 0,
      gates: lv.G.map(() => false), gatesLeft: lv.G.length, newGate: -1,
      bx, by, tx: 0, ty: 0,
    };
    function place(t) {
      for (let i = 0; i < n; i++) {
        const b = B[i];
        if (b.o) { bx[i] = railX(b.o, t); by[i] = railY(b.o, t); } else { bx[i] = b.x; by[i] = b.y; }
      }
      if (lv.To) { f.tx = railX(lv.To, t); f.ty = railY(lv.To, t); } else { f.tx = lv.T[0]; f.ty = lv.T[1]; }
    }
    let hit = false;
    function accel(x, y) {
      let ax = 0, ay = 0;
      hit = false;
      for (let i = 0; i < n; i++) {
        const dx = bx[i] - x, dy = by[i] - y;
        const d2 = dx * dx + dy * dy;
        const rr = B[i].r + PROBE_R;
        if (d2 < rr * rr) hit = true;
        const k = gs * B[i].gm / (d2 * Math.sqrt(d2) + 1e-9);
        ax += dx * k; ay += dy * k;
      }
      f.ax = ax; f.ay = ay;
    }
    place(0); accel(f.x, f.y);

    f.step = function () {
      if (f.result) return f.result;
      const x0 = f.x, y0 = f.y, ax0 = f.ax, ay0 = f.ay;
      const x1 = x0 + f.vx * DT + 0.5 * ax0 * DT * DT;
      const y1 = y0 + f.vy * DT + 0.5 * ay0 * DT * DT;
      f.t += DT;
      place(f.t);
      accel(x1, y1);
      f.vx += 0.5 * (ax0 + f.ax) * DT;
      f.vy += 0.5 * (ay0 + f.ay) * DT;
      f.x = x1; f.y = y1;
      f.pull = Math.sqrt(f.ax * f.ax + f.ay * f.ay);
      f.newGate = -1;

      for (let i = 0; i < lv.W.length; i++) {
        const w = lv.W[i];
        if (crosses(x0, y0, x1, y1, w[0], w[1], w[2], w[3])) return (f.result = "wall");
      }
      if (hit) return (f.result = "crash");
      for (let i = 0; i < lv.G.length; i++) {
        if (f.gates[i]) continue;
        const q = lv.G[i];
        if (crosses(x0, y0, x1, y1, q[0], q[1], q[2], q[3])) { f.gates[i] = true; f.gatesLeft--; f.newGate = i; }
      }
      if (f.gatesLeft === 0) {
        const dx = x1 - f.tx, dy = y1 - f.ty;
        if (dx * dx + dy * dy < lv.T[2] * lv.T[2]) return (f.result = "win");
      }
      if (x1 < -OUT || x1 > W + OUT || y1 < -OUT || y1 > H + OUT) return (f.result = "out");
      if (f.t >= MAX_T) return (f.result = "fuel");
      return null;
    };
    return f;
  }

  function simulate(lv, angleDeg, power, gscale) {
    const f = makeFlight(lv, angleDeg, power, gscale);
    let r = null;
    while (!r) r = f.step();
    return { result: r, t: f.t, gatesLeft: f.gatesLeft };
  }

  // ====================================================
  // SETUP AND LAYOUT
  // ====================================================
  const canvas = document.getElementById("game");
  const g = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const hud = $("hud"), ctl = $("ctl"), tipEl = $("tip");

  let vw = 1, vh = 1, dpr = 1;
  let sc = 1, ox = 0, oy = 0;      // world to screen: scale and offset in CSS pixels
  function layout() {
    vw = Math.max(1, window.innerWidth); vh = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    const top = Math.max(0, hud.getBoundingClientRect().bottom) + 6;
    const cr = ctl.getBoundingClientRect();
    const tr = tipEl.getBoundingClientRect();
    const bot = Math.max(0, vh - (tr.height > 0 ? Math.min(cr.top, tr.top) : cr.top)) + 6;
    const availH = Math.max(120, vh - top - bot);
    sc = Math.min(vw / W, availH / H);
    ox = (vw - W * sc) / 2;
    oy = top + (availH - H * sc) / 2;
  }
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", () => { layout(); setTimeout(layout, 300); });

  // ====================================================
  // SAVE
  // ====================================================
  const SAVE_KEY = "orbit-sling-v1";
  let save = { stars: {}, best: {}, last: 0, mute: false };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (s && typeof s === "object") {
      if (s.stars && typeof s.stars === "object") save.stars = s.stars;
      if (s.best && typeof s.best === "object") save.best = s.best;
      if (Number.isInteger(s.last)) save.last = clamp(s.last, 0, LEVELS.length - 1);
      save.mute = !!s.mute;
    }
  } catch (e) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
  const starsOf = (i) => clamp(save.stars[i] | 0, 0, 3);
  const unlocked = (i) => i === 0 || starsOf(i - 1) > 0 || (i > 1 && starsOf(i - 2) > 0);
  const totalStars = () => LEVELS.reduce((s, lv, i) => s + starsOf(i), 0);
  const doneCount = () => LEVELS.reduce((s, lv, i) => s + (starsOf(i) > 0 ? 1 : 0), 0);
  const starsFor = (lv, probes) => (probes <= lv.par ? 3 : probes <= lv.par * 2 + 1 ? 2 : 1);

  // ====================================================
  // AUDIO: all synthesised. A whoosh on launch, a low hum that swells
  // as gravity gets stronger, a chime on success and a thud on a crash.
  // ====================================================
  let ac = null, master = null, noiseBuf = null, humGain = null, humA = null, humB = null;
  function audioInit() {
    if (ac) { if (ac.state !== "running" && !document.hidden) ac.resume().catch(() => {}); return; }
    try {
      if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch (e) {} }
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = save.mute ? 0 : 0.7;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // the hum: two detuned low voices through a soft filter, silent until a flight
      humGain = ac.createGain(); humGain.gain.value = 0;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
      humA = ac.createOscillator(); humA.type = "sawtooth"; humA.frequency.value = 62;
      humB = ac.createOscillator(); humB.type = "triangle"; humB.frequency.value = 124.6;
      humA.connect(lp); humB.connect(lp); lp.connect(humGain); humGain.connect(master);
      humA.start(); humB.start();
    } catch (e) { ac = null; }
  }
  function setHum(level) {
    if (!ac || !humGain) return;
    const t = ac.currentTime, v = clamp(level, 0, 1);
    humGain.gain.setTargetAtTime(v * 0.3, t, 0.06);
    humA.frequency.setTargetAtTime(58 + v * 46, t, 0.08);
    humB.frequency.setTargetAtTime(116.5 + v * 92, t, 0.08);
  }
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), v = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v); v.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(ftype, f0, f1, q, dur, vol, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = ftype; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const v = ac.createGain();
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.3));
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(v); v.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  const sfx = {
    whoosh(p) { noise("bandpass", 350, 2600 + 1400 * p, 1.2, 0.42, 0.5); tone("sine", 150, 420 + 300 * p, 0.3, 0.16); },
    chime() { [659.3, 880, 1318.5, 1760].forEach((f, i) => { tone("sine", f, f, 1.1, 0.22, i * 0.09); tone("triangle", f * 2, f * 2, 0.5, 0.05, i * 0.09); }); },
    thud() { tone("sine", 150, 36, 0.32, 0.7); noise("lowpass", 900, 120, 0.7, 0.2, 0.5); },
    lost() { tone("sine", 440, 190, 0.34, 0.16); },
    gate() { tone("sine", 990, 990, 0.16, 0.16); tone("sine", 1485, 1485, 0.24, 0.12, 0.07); },
    ui() { tone("triangle", 620, 620, 0.06, 0.1); },
    tick() { tone("sine", 1400, 1400, 0.03, 0.04); },
    star(i) { tone("sine", 880 * Math.pow(1.26, i), 880 * Math.pow(1.26, i), 0.4, 0.16); },
  };
  function applyMute() {
    $("btn-mute").classList.toggle("is-muted", save.mute);
    if (master) master.gain.value = save.mute ? 0 : 0.7;
  }

  // ====================================================
  // GAME STATE
  // ====================================================
  let state = "menu";            // menu, levels, aim, fly, won
  let lv = LEVELS[0];
  let probes = 0;                // probes launched on this visit to the level
  let aim = { angle: 90, power: 220 };
  let lastAim = null;            // the previous launch, drawn as a ghost
  let flight = null, lastResult = null;
  let trail = [];                // current flight path, x and y pairs
  let oldTrails = [];            // the last few attempts
  let particles = [];
  let acc = 0, wonT = 0, clock = 0, toastUntil = 0;
  let preview = [], previewKey = "";
  let drag = null;

  const KEEP_TRAILS = 4;
  const ARROW = 2.2;             // launch speed units per world unit of arrow

  function setAim(angle, power) {
    angle = ((angle % 360) + 360) % 360;
    aim.angle = Math.round(angle * 10) / 10;
    if (aim.angle >= 360) aim.angle = 0;
    aim.power = Math.round(clamp(power, PMIN, lv.pmax));
  }

  function buildPreview() {
    const key = lv.i + ":" + aim.angle + ":" + aim.power;
    if (key === previewKey) return;
    previewKey = key; preview = [];
    const f = makeFlight(lv, aim.angle, aim.power);
    for (let i = 1; i <= 16 * 14; i++) {
      if (f.step()) break;
      if (i % 14 === 0) preview.push(f.x, f.y);
    }
  }

  // the tip is given as a function, so that it can be written out again when the language changes
  let tipText = () => "";
  function showTip(text, toast) {
    tipText = text;
    tipEl.textContent = text() || "";
    tipEl.classList.toggle("is-toast", !!toast);
    toastUntil = toast ? clock + 2.6 : 0;
  }

  function updateHud() {
    $("hud-title").textContent = (lv.i + 1) + " · " + levelName(lv);
    $("hud-probes").textContent = TX("Probes ", "Số tàu ") + probes;
    const would = starsFor(lv, state === "aim" ? probes + 1 : Math.max(1, probes));
    const els = $("hud-stars").children;
    for (let i = 0; i < 3; i++) els[i].classList.toggle("lit", i < would);
    $("read-angle").textContent = TX("Angle ", "Góc ") + aim.angle.toFixed(1) + "°";
    $("read-power").textContent = TX("Power ", "Lực ") + aim.power + (lv.pmax < PMAX ? TX(" of ", " / ") + lv.pmax : "");
    $("btn-launch").textContent = state === "fly" ? TX("Recall", "Gọi về") : TX("Launch", "Phóng");
  }

  function startLevel(i) {
    lv = LEVELS[clamp(i, 0, LEVELS.length - 1)];
    save.last = lv.i; persist();
    probes = 0; flight = null; lastResult = null; lastAim = null;
    trail = []; oldTrails = []; particles = []; acc = 0; drag = null;
    // the first level opens aimed at the ring so one pull or one press wins it.
    // every later level opens aimed straight up, so the player has to aim.
    const tp = targetPos(lv, 0);
    setAim(lv.i === 0 ? Math.atan2(-(tp[1] - lv.L[1]), tp[0] - lv.L[0]) * 180 / Math.PI : 90, Math.min(240, lv.pmax * 0.8));
    for (let k = 0; lv.i > 0 && k < 6 && simulate(lv, aim.angle, aim.power).result === "win"; k++) setAim(aim.angle, aim.power - 25);
    setState("aim");
    showTip(() => levelTip(lv, true));
  }

  function setState(s) {
    state = s;
    const playing = s === "aim" || s === "fly" || s === "won";
    document.body.classList.toggle("in-menu", !playing);
    hud.classList.toggle("is-off", !playing);
    ctl.classList.toggle("is-off", s !== "aim" && s !== "fly");
    tipEl.classList.toggle("is-off", s !== "aim" && s !== "fly");
    $("menu").hidden = s !== "menu";
    $("levels").hidden = s !== "levels";
    $("won").hidden = true;
    if (s !== "fly") setHum(0);
    if (s === "menu") refreshMenu();
    if (s === "levels") refreshLevels();
    if (playing) updateHud();
  }

  function launch() {
    if (state !== "aim") return;
    audioInit();
    flight = makeFlight(lv, aim.angle, aim.power);
    lastAim = { angle: aim.angle, power: aim.power };
    trail = [lv.L[0], lv.L[1]];
    probes++; acc = 0; lastResult = null;
    state = "fly";
    sfx.whoosh(aim.power / PMAX);
    if (toastUntil) showTip(() => levelTip(lv));
    updateHud();
  }

  const FAIL_TEXT = {
    crash: ["Crashed. A new probe is ready.", "Va chạm rồi. Tàu mới đã sẵn sàng."],
    wall: ["Hit the debris. A new probe is ready.", "Đâm vào mảnh vỡ. Tàu mới đã sẵn sàng."],
    out: ["Drifted out of range. A new probe is ready.", "Trôi ra ngoài tầm. Tàu mới đã sẵn sàng."],
    fuel: ["The probe ran out of power after 20 seconds. A new one is ready.", "Tàu hết năng lượng sau 20 giây. Tàu mới đã sẵn sàng."],
    recall: ["Probe recalled. A new one is ready.", "Đã gọi tàu về. Tàu mới đã sẵn sàng."],
  };

  function burst(x, y, rgb, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.4 + Math.random() * 0.5, rgb, r: 1.2 + Math.random() * 2.2 });
    }
    if (particles.length > 400) particles.splice(0, particles.length - 400);
  }

  function endFlight(result) {
    lastResult = result;
    setHum(0);
    if (result === "win") {
      const got = starsFor(lv, probes);
      if (got > starsOf(lv.i)) save.stars[lv.i] = got;
      if (!save.best[lv.i] || probes < save.best[lv.i]) save.best[lv.i] = probes;
      persist();
      state = "won"; wonT = 0;
      ctl.classList.add("is-off"); tipEl.classList.add("is-off");
      sfx.chime();
      burst(flight.tx, flight.ty, "125,255,176", 46, 190);
      burst(flight.tx, flight.ty, "255,215,106", 24, 120);
      updateHud();
      return;
    }
    oldTrails.push({ pts: trail, end: result });
    if (oldTrails.length > KEEP_TRAILS) oldTrails.shift();
    trail = [];
    if (result === "crash" || result === "wall") { sfx.thud(); burst(flight.x, flight.y, "255,170,110", 30, 150); }
    else if (result !== "recall") sfx.lost();
    flight = null; acc = 0;
    state = "aim";
    showTip(() => (FAIL_TEXT[result] ? TX(FAIL_TEXT[result][0], FAIL_TEXT[result][1]) : ""), true);
    updateHud();
  }

  // the words on the panel shown when the ring is reached, in the language now chosen
  function paintWon() {
    const got = starsFor(lv, probes);
    const last = lv.i === LEVELS.length - 1;
    const allDone = doneCount() === LEVELS.length;
    $("won-title").textContent = last && allDone ? TX("Every level cleared", "Đã qua hết các màn") : TX("Target reached", "Đã tới đích");
    let text = probes === 1 ? TX("First probe. Perfect.", "Ngay tàu đầu tiên. Hoàn hảo.") : TX("Reached with probe " + probes + ".", "Tới đích bằng tàu thứ " + probes + ".");
    if (got < 3) text += TX(" Use " + lv.par + " or fewer for three stars.", " Dùng " + lv.par + " tàu trở xuống để được ba sao.");
    if (last) text += allDone ? TX(" You have " + totalStars() + " of " + LEVELS.length * 3 + " stars.", " Bạn có " + totalStars() + " trên " + LEVELS.length * 3 + " sao.") : TX(" Some earlier levels are still open.", " Vẫn còn vài màn trước chưa qua.");
    $("won-text").textContent = text;
  }
  function showWon() {
    const got = starsFor(lv, probes);
    const last = lv.i === LEVELS.length - 1;
    paintWon();
    $("btn-next").hidden = last;
    const els = $("won-stars").children;
    for (let i = 0; i < 3; i++) els[i].classList.remove("lit");
    for (let i = 0; i < got; i++) setTimeout(() => { if (state === "won") { els[i].classList.add("lit"); sfx.star(i); } }, 150 + i * 260);
    $("won").hidden = false;
  }

  // ====================================================
  // DRAWING
  // ====================================================
  const stars = [];
  { let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 170; i++) stars.push({ x: rnd(), y: rnd(), r: 0.4 + rnd() * rnd() * 1.6, p: rnd() * TAU, s: 0.4 + rnd() * 1.6, c: rnd() }); }

  const LOOK = {
    rock:   { a: "#ffd2a8", b: "#c4703c", c: "#2c1208", glow: "255,154,90", spots: true },
    ice:    { a: "#f2fbff", b: "#62aee8", c: "#0d2850", glow: "143,214,255" },
    gas:    { a: "#fff0c8", b: "#dc9c4c", c: "#4a2810", glow: "255,194,138", bands: true },
    violet: { a: "#f0e2ff", b: "#9c6ce8", c: "#241250", glow: "201,168,255", ring: true },
    green:  { a: "#dcffe6", b: "#48c088", c: "#0a3424", glow: "120,230,170", bands: true },
    sun:    { a: "#fffde8", b: "#ffc850", c: "#ff7c1c", glow: "255,176,80", sun: true },
    sun2:   { a: "#f6fcff", b: "#96d8ff", c: "#3c7cff", glow: "143,200,255", sun: true },
    moon:   { a: "#f4f6fa", b: "#9aa2b4", c: "#30364a", glow: "200,210,230", spots: true },
  };

  function drawBackground() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#03040a"; g.fillRect(0, 0, vw, vh);
    let gr = g.createRadialGradient(vw * 0.2, vh * 0.15, 0, vw * 0.2, vh * 0.15, Math.max(vw, vh) * 0.7);
    gr.addColorStop(0, "rgba(60,50,130,0.22)"); gr.addColorStop(1, "rgba(60,50,130,0)");
    g.fillStyle = gr; g.fillRect(0, 0, vw, vh);
    gr = g.createRadialGradient(vw * 0.85, vh * 0.8, 0, vw * 0.85, vh * 0.8, Math.max(vw, vh) * 0.6);
    gr.addColorStop(0, "rgba(20,90,120,0.2)"); gr.addColorStop(1, "rgba(20,90,120,0)");
    g.fillStyle = gr; g.fillRect(0, 0, vw, vh);
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(clock * s.s + s.p);
      g.globalAlpha = tw * (0.35 + 0.65 * s.c);
      g.fillStyle = s.c > 0.8 ? "#ffd9b0" : s.c < 0.2 ? "#b0d8ff" : "#ffffff";
      g.beginPath(); g.arc(s.x * vw, s.y * vh, s.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawBody(b, x, y, seed) {
    const k = LOOK[b.kind] || LOOK.rock, r = b.r;
    // the dashed circle marks where the pull reaches a fixed strength, so heavier bodies show a wider one
    if (b.gm > 0) {
      const wr = Math.sqrt(b.gm / 260);
      g.strokeStyle = "rgba(" + k.glow + ",0.16)"; g.lineWidth = 1.2; g.setLineDash([3, 7]);
      g.beginPath(); g.arc(x, y, wr, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    let gr = g.createRadialGradient(x, y, r * 0.8, x, y, r * (k.sun ? 2.6 : 2));
    gr.addColorStop(0, "rgba(" + k.glow + "," + (k.sun ? 0.55 : 0.32) + ")"); gr.addColorStop(1, "rgba(" + k.glow + ",0)");
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * (k.sun ? 2.6 : 2), 0, TAU); g.fill();
    if (k.ring) {
      g.strokeStyle = "rgba(" + k.glow + ",0.45)"; g.lineWidth = r * 0.11;
      g.beginPath(); g.ellipse(x, y, r * 1.5, r * 0.4, -0.35, Math.PI, TAU); g.stroke();
    }
    if (k.sun) gr = g.createRadialGradient(x, y, 0, x, y, r);
    else gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.08, x - r * 0.1, y - r * 0.1, r * 1.25);
    gr.addColorStop(0, k.a); gr.addColorStop(k.sun ? 0.6 : 0.45, k.b); gr.addColorStop(1, k.c);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (k.bands || k.spots) {
      g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
      let s = (seed + 1) * 7919;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      if (k.bands) {
        for (let i = 0; i < 5; i++) {
          const yy = y - r + (i + 0.3 + rnd() * 0.5) * r * 0.4;
          g.fillStyle = i % 2 ? "rgba(255,255,255,0.13)" : "rgba(40,10,0,0.16)";
          g.beginPath(); g.ellipse(x, yy, r * 1.2, r * (0.06 + rnd() * 0.07), -0.12, 0, TAU); g.fill();
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const a = rnd() * TAU, d = rnd() * r * 0.7, cr = r * (0.08 + rnd() * 0.14);
          g.fillStyle = "rgba(20,10,10,0.2)";
          g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, 0, TAU); g.fill();
          g.strokeStyle = "rgba(255,255,255,0.14)"; g.lineWidth = 1;
          g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, 0.3, 2.2); g.stroke();
        }
      }
      g.restore();
    }
    if (k.ring) {
      g.strokeStyle = "rgba(" + k.glow + ",0.7)"; g.lineWidth = r * 0.11;
      g.beginPath(); g.ellipse(x, y, r * 1.5, r * 0.4, -0.35, 0, Math.PI); g.stroke();
    }
    g.strokeStyle = "rgba(" + k.glow + ",0.5)"; g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  }

  // the dotted circle a moon or the ring travels on, with arrows for the direction
  function drawRail(o, rgb) {
    g.strokeStyle = "rgba(" + rgb + ",0.2)"; g.lineWidth = 1.2; g.setLineDash([2, 9]);
    g.beginPath(); g.arc(o[0], o[1], o[2], 0, TAU); g.stroke(); g.setLineDash([]);
    if (state !== "aim") return;
    const dir = o[3] > 0 ? 1 : -1;
    g.fillStyle = "rgba(" + rgb + ",0.55)";
    for (let i = 1; i <= 2; i++) {
      const th = o[4] + dir * i * 0.34 * Math.min(1.6, 110 / o[2] + 0.5);
      const x = o[0] + o[2] * Math.cos(th), y = o[1] + o[2] * Math.sin(th);
      const fx = -Math.sin(th) * dir, fy = Math.cos(th) * dir;   // direction of travel
      g.beginPath();
      g.moveTo(x + fx * 7, y + fy * 7);
      g.lineTo(x - fx * 4 - fy * 5, y - fy * 4 + fx * 5);
      g.lineTo(x - fx * 4 + fy * 5, y - fy * 4 - fx * 5);
      g.closePath(); g.fill();
    }
  }

  function drawWall(w, wi) {
    const dx = w[2] - w[0], dy = w[3] - w[1], len = Math.hypot(dx, dy);
    g.strokeStyle = "rgba(255,150,110,0.22)"; g.lineWidth = 9; g.lineCap = "round";
    g.beginPath(); g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); g.stroke();
    let s = (wi + 3) * 104729;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const n = Math.max(2, Math.round(len / 12));
    for (let i = 0; i <= n; i++) {
      const t = i / n, cx = w[0] + dx * t + (rnd() - 0.5) * 5, cy = w[1] + dy * t + (rnd() - 0.5) * 5;
      const rr = 3.5 + rnd() * 4, a0 = rnd() * TAU;
      g.fillStyle = rnd() > 0.5 ? "#8a7a72" : "#6a5c58";
      g.beginPath();
      for (let j = 0; j < 6; j++) {
        const a = a0 + j / 6 * TAU, q = rr * (0.7 + rnd() * 0.45);
        if (j) g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); else g.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
      }
      g.closePath(); g.fill();
      g.strokeStyle = "rgba(255,220,200,0.28)"; g.lineWidth = 0.8; g.stroke();
    }
  }

  function drawGate(q, done) {
    const rgb = done ? "125,255,176" : "255,194,138";
    g.strokeStyle = "rgba(" + rgb + ",0.22)"; g.lineWidth = 10; g.lineCap = "round";
    g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[2], q[3]); g.stroke();
    g.strokeStyle = "rgba(" + rgb + "," + (done ? 0.5 : 0.95) + ")"; g.lineWidth = 2.4;
    g.setLineDash([6, 6]); g.lineDashOffset = done ? 0 : -clock * 14;
    g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[2], q[3]); g.stroke();
    g.setLineDash([]); g.lineDashOffset = 0;
    for (let e = 0; e < 2; e++) {
      const x = q[e * 2], y = q[e * 2 + 1];
      g.fillStyle = "rgb(" + rgb + ")";
      g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 9, y); g.lineTo(x, y + 9); g.lineTo(x - 9, y); g.closePath(); g.fill();
      g.fillStyle = "#03040a"; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
    }
  }

  function drawTarget(x, y, r, open) {
    const pulse = 0.5 + 0.5 * Math.sin(clock * 3);
    if (open) {
      const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r * 2.1);
      gr.addColorStop(0, "rgba(125,255,176," + (0.3 + 0.14 * pulse) + ")"); gr.addColorStop(1, "rgba(125,255,176,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.1, 0, TAU); g.fill();
      g.strokeStyle = "#7dffb0"; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      g.strokeStyle = "rgba(125,255,176,0.6)"; g.lineWidth = 2; g.setLineDash([5, 8]); g.lineDashOffset = clock * 12;
      g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU); g.stroke();
      g.setLineDash([]); g.lineDashOffset = 0;
      g.fillStyle = "#eafff2"; g.beginPath(); g.arc(x, y, 3.5 + pulse * 1.5, 0, TAU); g.fill();
    } else {
      g.strokeStyle = "rgba(255,194,138,0.6)"; g.lineWidth = 2.4; g.setLineDash([7, 7]);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.setLineDash([]);
      g.strokeStyle = "rgba(255,194,138,0.45)"; g.lineWidth = 2.4;   // a small padlock shape: closed until the gates are done
      g.beginPath(); g.arc(x, y - 3, 6, Math.PI, TAU); g.stroke();
      g.fillStyle = "rgba(255,194,138,0.5)"; g.fillRect(x - 8, y - 3, 16, 12);
    }
  }

  function drawTrailLine(pts, style, width) {
    if (pts.length < 4) return;
    g.strokeStyle = style; g.lineWidth = width; g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  }

  function drawScene() {
    drawBackground();
    if (state === "menu" || state === "levels") { drawMenuScene(); return; }
    g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);

    // the playfield edge: leave it and the probe is lost
    g.fillStyle = "rgba(143,214,255,0.022)"; g.strokeStyle = "rgba(143,214,255,0.2)"; g.lineWidth = 1.5;
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, W, H, 14); else g.rect(0, 0, W, H);
    g.fill(); g.stroke();
    g.save(); g.beginPath(); g.rect(-OUT, -OUT, W + OUT * 2, H + OUT * 2); g.clip();

    const t = flight ? flight.t : 0;
    const f = flight;

    // earlier attempts, the newest brightest
    for (let i = 0; i < oldTrails.length; i++) {
      const o = oldTrails[i], age = oldTrails.length - i;
      const al = [0.42, 0.27, 0.17, 0.1][age - 1] || 0.1;
      drawTrailLine(o.pts, "rgba(143,214,255," + al + ")", 1.6);
      const n = o.pts.length;
      if (n >= 2) {
        const x = o.pts[n - 2], y = o.pts[n - 1];
        g.strokeStyle = "rgba(255,170,130," + Math.min(0.8, al * 1.8) + ")"; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke();
      }
    }

    for (const b of lv.B) if (b.o) drawRail(b.o, "200,210,230");
    if (lv.To) drawRail(lv.To, "125,255,176");
    lv.W.forEach(drawWall);
    lv.G.forEach((q, i) => drawGate(q, f ? f.gates[i] : false));
    const tp = f ? [f.tx, f.ty] : targetPos(lv, 0);
    drawTarget(tp[0], tp[1], lv.T[2], f ? f.gatesLeft === 0 : lv.G.length === 0);
    lv.B.forEach((b, i) => {
      const x = b.o ? railX(b.o, t) : b.x, y = b.o ? railY(b.o, t) : b.y;
      drawBody(b, x, y, lv.i * 10 + i);
    });

    // launch pad
    const lx = lv.L[0], ly = lv.L[1];
    g.strokeStyle = "rgba(143,214,255,0.8)"; g.lineWidth = 2;
    g.beginPath(); g.arc(lx, ly, 11, 0, TAU); g.stroke();
    g.strokeStyle = "rgba(143,214,255,0.3)"; g.lineWidth = 1;
    g.beginPath(); g.arc(lx, ly, 17, 0, TAU); g.stroke();

    if (state === "aim") {
      buildPreview();
      // full power circle
      g.strokeStyle = "rgba(255,255,255,0.13)"; g.lineWidth = 1.2; g.setLineDash([4, 8]);
      g.beginPath(); g.arc(lx, ly, lv.pmax / ARROW, 0, TAU); g.stroke(); g.setLineDash([]);
      if (lastAim) {
        const a = lastAim.angle * Math.PI / 180, len = lastAim.power / ARROW;
        const ex = lx + Math.cos(a) * len, ey = ly - Math.sin(a) * len;
        g.strokeStyle = "rgba(255,255,255,0.3)"; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(lx, ly); g.lineTo(ex, ey); g.stroke();
        g.beginPath(); g.arc(ex, ey, 4, 0, TAU); g.stroke();
      }
      for (let i = 0; i < preview.length; i += 2) {
        g.fillStyle = "rgba(255,255,255," + (0.85 - 0.6 * i / preview.length) + ")";
        g.beginPath(); g.arc(preview[i], preview[i + 1], 2.6, 0, TAU); g.fill();
      }
      const a = aim.angle * Math.PI / 180, len = aim.power / ARROW;
      const cx = Math.cos(a), cy = -Math.sin(a);
      const ex = lx + cx * len, ey = ly + cy * len;
      g.strokeStyle = "#8fd6ff"; g.lineWidth = 3; g.lineCap = "round";
      g.beginPath(); g.moveTo(lx + cx * 11, ly + cy * 11); g.lineTo(ex, ey); g.stroke();
      g.fillStyle = "#8fd6ff";
      g.beginPath(); g.moveTo(ex + cx * 12, ey + cy * 12);
      g.lineTo(ex - cy * 7, ey + cx * 7); g.lineTo(ex + cy * 7, ey - cx * 7); g.closePath(); g.fill();
      if (drag && drag.live) {
        // the slingshot band: from the pad back along the pull
        g.strokeStyle = "rgba(255,194,138,0.7)"; g.lineWidth = 2; g.setLineDash([3, 5]);
        g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx - cx * len * 0.5, ly - cy * len * 0.5); g.stroke(); g.setLineDash([]);
        g.fillStyle = "rgba(255,194,138,0.9)";
        g.beginPath(); g.arc(lx - cx * len * 0.5, ly - cy * len * 0.5, 5, 0, TAU); g.fill();
      }
      g.fillStyle = "#fff"; g.beginPath(); g.arc(lx, ly, PROBE_R + 1, 0, TAU); g.fill();
    }

    if (f && (state === "fly" || state === "won")) {
      drawTrailLine(trail, "rgba(143,214,255,0.9)", 2.4);
      if (state === "fly") {
        const glow = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 16);
        glow.addColorStop(0, "rgba(143,214,255,0.7)"); glow.addColorStop(1, "rgba(143,214,255,0)");
        g.fillStyle = glow; g.beginPath(); g.arc(f.x, f.y, 16, 0, TAU); g.fill();
        g.fillStyle = "#fff"; g.beginPath(); g.arc(f.x, f.y, PROBE_R + 1, 0, TAU); g.fill();
      }
    }
    if (state === "won" && f) {
      const k = clamp(wonT / 0.8, 0, 1);
      g.strokeStyle = "rgba(125,255,176," + (1 - k) + ")"; g.lineWidth = 4 * (1 - k) + 1;
      g.beginPath(); g.arc(f.tx, f.ty, lv.T[2] + k * 120, 0, TAU); g.stroke();
    }
    for (const p of particles) {
      g.fillStyle = "rgba(" + p.rgb + "," + (1 - p.life / p.max) + ")";
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
    }
    g.restore();
  }

  // behind the menus: a planet with a probe circling it
  const MENU_PLANET = { r: 64, gm: 0, kind: "violet" };
  function drawMenuScene() {
    const s = Math.min(vw / 600, vh / 760);
    const cx = vw / 2, cy = vh / 2;
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * cx, dpr * cy);
    const rx = 330, ry = 400, tilt = -0.5;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const at = (th) => { const x = rx * Math.cos(th), y = ry * Math.sin(th); return [x * ct - y * st, x * st + y * ct]; };
    g.lineCap = "round";
    const head = clock * 0.5;
    for (let i = 60; i > 0; i--) {
      const p = at(head - i * 0.022), q = at(head - (i - 1) * 0.022);
      g.strokeStyle = "rgba(143,214,255," + (0.7 * (1 - i / 60)) + ")"; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    const hp = at(head);
    g.fillStyle = "#fff"; g.beginPath(); g.arc(hp[0], hp[1], 5, 0, TAU); g.fill();
    drawBody(MENU_PLANET, -250, -330, 5);
  }

  // ====================================================
  // INPUT: slingshot aiming. Drag back anywhere, the probe flies the
  // opposite way, and the length of the pull sets the power.
  // ====================================================
  const FULL_PULL = 150;        // CSS pixels of drag for full power
  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "aim" && state !== "fly") return;
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    audioInit();
    if (state === "fly") endFlight("recall");
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, live: false, len: 0 };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id || state !== "aim") return;
    const dx = drag.sx - e.clientX, dy = drag.sy - e.clientY;
    drag.len = Math.hypot(dx, dy);
    if (drag.len < 10) { drag.live = false; return; }
    drag.live = true;
    setAim(Math.atan2(-dy, dx) * 180 / Math.PI, drag.len * PMAX / FULL_PULL);
    updateHud();
  });
  function endDrag(e, fire) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (fire && d.live && d.len >= 16 && state === "aim") launch();
  }
  canvas.addEventListener("pointerup", (e) => endDrag(e, true));
  canvas.addEventListener("pointercancel", (e) => endDrag(e, false));
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  // keep the page still on a phone: no pinch zoom, no double tap zoom, no rubber band
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (!e.target.closest || !e.target.closest(".panel")) e.preventDefault(); }, { passive: false });
  document.addEventListener("dblclick", (e) => e.preventDefault());

  function nudge(da, dp) {
    if (state === "fly") endFlight("recall");
    if (state !== "aim") return;
    setAim(aim.angle + da, aim.power + dp);
    sfx.tick();
    updateHud();
  }
  // the small buttons repeat while held
  function holdButton(id, da, dp) {
    const el = $(id);
    let timer = null, count = 0;
    const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const tickOnce = () => {
      count++;
      const big = count > 14 ? 5 : 1;
      nudge(da * big, dp * big);
      timer = setTimeout(tickOnce, count === 1 ? 380 : 70);
    };
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); audioInit(); stop(); count = 0; tickOnce(); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, stop);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", stop);
  }
  holdButton("btn-ccw", 0.2, 0);
  holdButton("btn-cw", -0.2, 0);
  holdButton("btn-less", 0, -1);
  holdButton("btn-more", 0, 1);
  $("btn-launch").addEventListener("click", () => {
    // drop focus, or in some browsers a later Space press would also click this button and recall the probe
    $("btn-launch").blur();
    audioInit();
    if (state === "fly") endFlight("recall");
    else launch();
  });

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    if (k === "KeyM") { toggleMute(); return; }
    if (state === "aim" || state === "fly") {
      const big = e.shiftKey;
      if (k === "ArrowLeft") { nudge(big ? 1 : 0.2, 0); e.preventDefault(); }
      else if (k === "ArrowRight") { nudge(big ? -1 : -0.2, 0); e.preventDefault(); }
      else if (k === "ArrowUp") { nudge(0, big ? 5 : 1); e.preventDefault(); }
      else if (k === "ArrowDown") { nudge(0, big ? -5 : -1); e.preventDefault(); }
      else if (k === "Space" || k === "Enter") {
        e.preventDefault();
        if (e.repeat) return;
        audioInit();
        if (state === "aim") launch();
      }
      else if (k === "KeyR" && state === "fly") endFlight("recall");
      else if (k === "Escape") { sfx.ui(); setState("levels"); }
    } else if (state === "won") {
      const onButton = document.activeElement && /^(BUTTON|A)$/.test(document.activeElement.tagName);
      if ((k === "Space" || k === "Enter") && !$("won").hidden && !e.repeat && !onButton) {
        e.preventDefault();
        if (lv.i < LEVELS.length - 1) startLevel(lv.i + 1); else setState("levels");
      } else if (k === "Escape") setState("levels");
    } else if (state === "levels") {
      if (k === "Escape") setState("menu");
    } else if (state === "menu") {
      if ((k === "Space" || k === "Enter") && !e.repeat && document.activeElement === document.body) { e.preventDefault(); audioInit(); play(); }
    }
  });

  // ====================================================
  // MENUS
  // ====================================================
  function refreshMenu() {
    const d = doneCount();
    $("btn-play").textContent = d === 0 ? TX("Play", "Chơi") : d === LEVELS.length ? TX("Choose a level", "Chọn màn") : TX("Continue", "Chơi tiếp");
    $("best").textContent = d ? TX(d + " of " + LEVELS.length + " levels · " + totalStars() + " of " + LEVELS.length * 3 + " stars", d + " trên " + LEVELS.length + " màn · " + totalStars() + " trên " + LEVELS.length * 3 + " sao") : "";
  }
  function nextOpen() {
    for (let i = 0; i < LEVELS.length; i++) if (!starsOf(i) && unlocked(i)) return i;
    return -1;
  }
  function play() {
    const i = nextOpen();
    if (i < 0) setState("levels"); else startLevel(i);
  }
  function refreshLevels() {
    const grid = $("grid");
    grid.textContent = "";
    const nx = nextOpen();
    LEVELS.forEach((l, i) => {
      const b = document.createElement("button");
      b.type = "button";
      const open = unlocked(i), st = starsOf(i);
      b.disabled = !open;
      if (i === nx) b.className = "is-next";
      b.setAttribute("aria-label", TX("Level ", "Màn ") + (i + 1) + ", " + levelName(l) + (open ? ", " + st + TX(" stars", " sao") : TX(", locked", ", đã khóa")));
      const num = document.createElement("b"); num.textContent = String(i + 1);
      const ss = document.createElement("span"); ss.className = "stars";
      for (let s = 0; s < 3; s++) { const el = document.createElement("i"); el.textContent = "★"; if (s < st) el.className = "lit"; ss.appendChild(el); }
      b.appendChild(num); b.appendChild(ss);
      b.addEventListener("click", () => { audioInit(); sfx.ui(); startLevel(i); });
      grid.appendChild(b);
    });
    $("levels-sub").textContent = TX(totalStars() + " of " + LEVELS.length * 3 + " stars. Finish a level to open the next two.", totalStars() + " trên " + LEVELS.length * 3 + " sao. Qua một màn để mở hai màn kế tiếp.");
  }
  function toggleMute() {
    save.mute = !save.mute; persist(); applyMute();
    if (!save.mute) { audioInit(); sfx.ui(); }
  }
  const onClick = (id, fn) => $(id).addEventListener("click", () => { audioInit(); sfx.ui(); fn(); });
  onClick("btn-play", play);
  onClick("btn-select", () => setState("levels"));
  onClick("btn-back", () => setState("menu"));
  onClick("btn-levels", () => setState("levels"));
  onClick("btn-next", () => startLevel(lv.i + 1));
  onClick("btn-again", () => startLevel(lv.i));
  onClick("btn-won-levels", () => setState("levels"));
  $("btn-mute").addEventListener("click", toggleMute);

  // ====================================================
  // MAIN LOOP
  // ====================================================
  let lastFrame = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;         // a hidden tab or a long hitch must not jump the probe ahead
    clock += dt;

    if (state === "fly" && flight) {
      acc += dt;
      let res = null, n = 0;
      while (acc >= DT && !res) {
        acc -= DT;
        res = flight.step();
        if ((++n & 1) === 0 || res) trail.push(flight.x, flight.y);
        if (flight.newGate >= 0) { sfx.gate(); const q = lv.G[flight.newGate]; burst((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, "125,255,176", 14, 90); }
      }
      setHum(Math.pow(Math.min(1, flight.pull / 1400), 0.55));
      if (res) endFlight(res);
    } else if (state === "won") {
      const before = wonT;
      wonT += dt;
      if (before < 0.9 && wonT >= 0.9) showWon();
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97;
      if (p.life >= p.max) particles.splice(i, 1);
    }
    if (toastUntil && clock > toastUntil && state === "aim") showTip(() => levelTip(lv));
    drawScene();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { setHum(0); drag = null; if (ac && ac.state === "running") ac.suspend().catch(() => {}); }
    else { lastFrame = performance.now(); if (ac && ac.state !== "running") ac.resume().catch(() => {}); }
  });

  // words that are not written in the page: labels for screen readers, and whatever is on screen now
  function paintLang() {
    const label = (id, en, vi) => $(id).setAttribute("aria-label", TX(en, vi));
    label("game", "Orbit Sling game", "Trò chơi Orbit Sling");
    label("btn-mute", "Sound on or off", "Bật hoặc tắt âm thanh");
    label("btn-levels", "Levels", "Các màn");
    label("btn-ccw", "Turn the aim left", "Xoay hướng ngắm sang trái");
    label("btn-cw", "Turn the aim right", "Xoay hướng ngắm sang phải");
    label("btn-less", "Less power", "Giảm lực");
    label("btn-more", "More power", "Tăng lực");
    tipEl.textContent = tipText() || "";
    refreshMenu();
    if (state === "levels") refreshLevels();
    if (lv) { updateHud(); if (state === "won") paintWon(); }
    layout();
  }
  if (window.PlayLang) window.PlayLang.onChange(paintLang);
  applyMute();
  setState("menu");
  paintLang();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(() => {});
  requestAnimationFrame((t) => { lastFrame = t; requestAnimationFrame(frame); });

  // ====================================================
  // TEST HANDLE
  // ====================================================
  window.__orbit = {
    get state() { return state; }, get level() { return lv.i; }, get probes() { return probes; },
    get aim() { return { angle: aim.angle, power: aim.power }; },
    get result() { return lastResult; }, get save() { return JSON.parse(JSON.stringify(save)); },
    get view() { return { sc, ox, oy, vw, vh }; },
    get flight() { return flight ? { x: flight.x, y: flight.y, vx: flight.vx, vy: flight.vy, t: flight.t } : null; },
    count: LEVELS.length, W, H, DT, MAX_T, PMIN, PMAX,
    info: (i) => { const l = LEVELS[i]; return { n: l.n, pmax: l.pmax, par: l.par, L: l.L, T: l.T, bodies: l.B.length, gates: l.G.length, walls: l.W.length, moving: l.B.some((b) => b.o) || !!l.To }; },
    simulate: (i, angle, power, gscale) => simulate(typeof i === "number" ? LEVELS[i] : i, angle, power, gscale),
    prepare: (raw) => prepare(raw, -1),
    go: (i) => startLevel(i), setAim: (a, p) => { setAim(a, p); updateHud(); }, launch,
    // run the current flight to its end without waiting for frames
    finish: () => { let r = null; while (state === "fly" && flight && !r) { r = flight.step(); trail.push(flight.x, flight.y); } if (r) endFlight(r); return r; },
    showWon: () => { if (state === "won" && $("won").hidden) { wonT = 1; showWon(); } },
  };
})();

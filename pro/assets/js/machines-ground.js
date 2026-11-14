/* =====================================================================
   machines-ground.js: the ground and rotor forms of ProMachines:

     tank        a Leopard-2-like main battle tank: low hull, side skirts,
                 tracks on seven road wheels, a turret with wedge-shaped
                 add-on armour and a long smoothbore gun with a thermal
                 sleeve. The tracks roll and the turret follows the aim
                 (the gun never fires; the tank is not in the cycle).
     helicopter  an EC120-Colibri-like light helicopter, built from the
                 measured outline (published dimensions, the maker's
                 three-view drawing and the owner's photo, in metres): the
                 egg-shaped glazed cabin, the engine and gearbox fairing,
                 a compact three-blade rotor head with long slender blades,
                 the slender boom, the swept fin with its ducted fan, the
                 stabiliser with end plates and the skid gear. It hovers
                 nose down a little with a gentle bob; the rotor turns
                 clockwise seen from above and the tail fan spins.

   Plain browser script; loads after machines.js (also in Node, after it).
   No brand marks: no logos, insignia, numbers or names on any machine.

   Roles of the rig's parts here (the shared table; in the tank the heavy
   front skirt panels are part of scapL/R):
     part      tank                          helicopter
     chest     hull front, glacis            nose and windscreen
     belly     hull middle                   cabin roof (roof window) and belly
     hips      engine deck                   rear fuselage underside
     neck      commander and gunner sights   rotor head: mast, swashplate,
                                             hub and domed cap (it turns)
     head      turret roof and ring          the engine fairing's crest
     jaw       gun mantlet                   engine exhaust, stabiliser end plates
     mane 1-3  turret wedges, side armour    blade 1-3: L root half with its
                                             sleeve, R outer half (+ a very
                                             faint ring at the tip path)
     back 1-3  bustle halves, basket         tail boom: top, underside, rear sides
     flank     light side skirts             the fin's two faces (round the duct)
     scap      heavy front skirt, guard      faired rear gear leg, step bar
     haunch    rear plate grilles, guard     stabiliser halves
     fl_up     suspension arms, rollers      cabin side under the doors, door lines
     fl_lo     road wheels                   skid, turning up into the front cross tube
     fl_paw    track runs, idler             cabin side with the door windows
     hl_up     suspension arms, rollers      the engine fairing's sides
     hl_lo     road wheels                   tail boom sides (front)
     hl_paw    track runs, sprocket          rear fuselage sides
     tail 1-4  the gun, mantlet to muzzle    fin edges; stators, tail bumper,
                                             antenna and beacon; the duct and its
                                             lips; the fan (it spins)
   ===================================================================== */
(function (G) {
  "use strict";
  const PM = G.ProMachines;
  if (!PM || typeof PM.defineMode !== "function") return;
  const PI = Math.PI, TAU = 2 * Math.PI, GY = PM.GROUND;

  /* ------------------------------------------------------------------
     Shape helpers (authoring only: they run once, when the rig is built)
     ------------------------------------------------------------------ */
  // polyhedron: vertices + faces (3 or 4 indices, counter-clockwise seen from outside)
  function poly(S, V, F, o) {
    const P = [];
    for (const f of F) {
      const a = V[f[0]], b = V[f[1]], c = V[f[2]];
      P.push(f.length > 3 ? S.quad(a, b, V[f[3]], c) : S.quad(a, b, c, c));
    }
    return S.place(P, o && o.at, o && o.rot, 1, o);
  }
  // the six faces of a box with vertices 0..7 = (x0|x1, y0|y1, z0|z1) as in cube()
  const BOXF = { nx: [0, 4, 7, 3], px: [1, 2, 6, 5], ny: [0, 1, 5, 4], py: [3, 7, 6, 2], nz: [0, 3, 2, 1], pz: [4, 5, 6, 7] };
  const FACES = Object.keys(BOXF);
  // box by its ranges; open: faces left out ("nx", "px", "ny", "py", "nz", "pz")
  function cube(S, x0, x1, y0, y1, z0, z1, open, o) {
    return hexa(S, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], open, o);
  }
  // one face of such a box
  function face(S, x0, x1, y0, y1, z0, z1, which, o) { return cube(S, x0, x1, y0, y1, z0, z1, FACES.filter((f) => f !== which), o); }
  // a box given by its 8 corners in cube() order, some faces left out
  function hexa(S, V, open, o) {
    const F = [];
    for (const k of FACES) if (!open || open.indexOf(k) < 0) F.push(BOXF[k]);
    return poly(S, V, F, o);
  }
  // prism: a counter-clockwise polygon in x-y extruded along z from z0 to z1;
  // open: edge indices (pts[i] -> pts[i+1]) and "z0" / "z1" (the caps) left out
  function prism(S, pts, z0, z1, open, o) {
    let A = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; A += a[0] * b[1] - b[0] * a[1]; }
    if (A < 0) throw new Error("machines-ground: prism polygon must be counter-clockwise");
    const sh = S.extrude(pts, z1 - z0, { at: [0, 0, (z0 + z1) / 2] });
    const n = pts.length;
    open = open || [];
    const keep = sh.filter((_, i) => (i < n ? open.indexOf(i) < 0 : ((i - n) % 2 === 0 ? open.indexOf("z1") < 0 : open.indexOf("z0") < 0)));
    return o ? S.place(keep, o.at, o.rot, 1, o) : keep;
  }
  // a part whose shape is written in machine coordinates, pivot `at`
  function part(S, at, rot, parent, shape) {
    return { at, rot: rot || null, parent: parent || null, world: true, shape: S.place(shape, [-at[0], -at[1], -at[2]]) };
  }
  // wheel with its axle along z: tyre, outer face, hub cap (zs = +1: outer side +z); inner: also the inner face
  function wheel(S, c, r, w, zs, o) {
    o = o || {};
    const hub = o.hub || r * 0.36, zo = c[2] + zs * w / 2;
    return S.join(
      S.cyl(r, w, { axis: "z", at: [c[0], c[1], c[2] - w / 2], caps: false }),
      S.disc(hub, r, { at: [c[0], c[1], zo], axis: zs > 0 ? "z" : "-z" }),
      o.inner ? S.disc(hub, r, { at: [c[0], c[1], c[2] - zs * w / 2], axis: zs > 0 ? "-z" : "z" }) : null,
      S.cyl(hub, w * 0.25, { axis: "z", at: [c[0], c[1], zs > 0 ? zo : zo - w * 0.25], heat: o.hubHeat || 0 }),
    );
  }

  /* ==================================================================
     TANK: a Leopard-2-like main battle tank
     ================================================================== */
  const TK = {
    // hull: deck, top of the lower hull, floor, nose tip x, rear plate x, half widths, section cuts
    deck: -0.70, spon: -0.88, bot: -1.11, nose: -0.95, rear: 1.56, hz: 0.56, lz: 0.31, c1: -0.10, c2: 0.90,
    // running gear: track centre z, width, end radius, thickness, extent; road wheel radius
    tz: 0.435, tw: 0.10, tr: 0.135, tt: 0.032, tx0: -0.745, tx1: 1.445, rw: 0.094,
    // turret: ring centre x, roof, front face, side, bustle start / end, gun axis height, trunnions
    ox: 0.15, roof: -0.36, tf: -0.22, ts: 0.44, b0: 0.62, b1: 0.98, gy: -0.53, trun: -0.25,
  };
  TK.tcx = (TK.tx0 + TK.tx1) / 2; TK.tlen = TK.tx1 - TK.tx0 - 2 * TK.tr; TK.tcy = GY + TK.tr;
  TK.idler = TK.tcx - TK.tlen / 2; TK.sprocket = TK.tcx + TK.tlen / 2;
  TK.wheels = [1, 2, 3, 4, 5, 6, 7].map((k) => TK.idler + k * TK.tlen / 8);
  // the gun: four segments from the mantlet to the muzzle, its axis a hair above level
  const GUN_EPS = 0.004, GUN_DIR = [Math.cos(PI - GUN_EPS), Math.sin(PI - GUN_EPS), 0];
  const GUN_ROT = [0, 0, PI - GUN_EPS];          // local +x along the barrel to the muzzle, local +y down
  const GUN_LEN = [0.30, 0.25, 0.48, 0.36], GUN_X0 = -0.47;
  const TANK_SHOTS = [];          // no weapons on the site: the gun never fires (the owner asked)
  const TANK_D = 5.0;

  function tankParts(S, H) {
    const P = {};
    // a horizontal plate facing up (decks, roof), sparse: it is seen edge-on from the side
    const dq = (x0, x1, z0, z1, y, o) => S.quad([x0, y, z1], [x1, y, z1], [x0, y, z0], [x1, y, z0], Object.assign({ w: 0.6 }, o));
    const floor = (x0, x1) => S.tag(face(S, x0, x1, TK.bot, TK.bot, -TK.lz, TK.lz, "ny"), { w: 0.3 });
    // ---- hull: three open sections (no walls between them) ----
    P.belly = part(S, [0.40, -0.85, 0], null, null, S.join(
      prism(S, [[TK.c1, TK.spon], [TK.c2, TK.spon], [TK.c2, TK.deck], [TK.c1, TK.deck]], -TK.hz, TK.hz, [0, 1, 2, 3]),
      // the deck, open over the turret ring
      dq(TK.c1, 0.56, 0.41, TK.hz, TK.deck), dq(TK.c1, 0.56, -TK.hz, -0.41, TK.deck), dq(0.56, TK.c2, -TK.hz, TK.hz, TK.deck),
      floor(TK.c1, TK.c2),
    ));
    P.chest = part(S, [-0.52, -0.85, 0], null, "belly", S.join(
      // upper hull: deck front, the long full-width glacis, the sides above the skirts
      prism(S, [[-0.897, TK.spon], [TK.c1, TK.spon], [TK.c1, TK.deck], [-0.42, TK.deck]], -TK.hz, TK.hz, [0, 1, 2]),
      dq(-0.42, TK.c1, -TK.hz, TK.hz, TK.deck),
      // lower hull between the tracks: the glacis runs on to the nose, the lower nose plate, the floor
      prism(S, [[-0.80, TK.bot], [TK.c1, TK.bot], [TK.c1, TK.spon], [-0.897, TK.spon], [TK.nose, -0.90]], -TK.lz, TK.lz, [0, 1, 2, "z0", "z1"]),
      floor(-0.80, TK.c1),
      // driver's hatch and periscope block
      cube(S, -0.37, -0.19, TK.deck, TK.deck + 0.022, -0.36, -0.16, ["ny"]),
      cube(S, -0.43, -0.38, TK.deck - 0.012, TK.deck + 0.03, -0.34, -0.18, ["ny"], { heat: 0.2 }),
    ));
    P.hips = part(S, [1.20, -0.85, 0], null, "belly", S.join(
      // the sides above the skirts and the chamfer to the rear plate
      prism(S, [[TK.c2, TK.spon], [TK.rear, TK.spon], [TK.rear, -0.74], [TK.rear - 0.05, TK.deck], [TK.c2, TK.deck]], -TK.hz, TK.hz, [0, 1, 3, 4]),
      // engine deck with its two grilles (warm)
      dq(TK.c2, 0.95, -TK.hz, TK.hz, TK.deck), dq(0.95, 1.20, -0.46, 0.46, TK.deck, { heat: 0.16 }), dq(1.20, 1.25, -TK.hz, TK.hz, TK.deck),
      dq(1.25, 1.46, -0.46, 0.46, TK.deck, { heat: 0.16 }), dq(1.46, TK.rear - 0.05, -TK.hz, TK.hz, TK.deck),
      dq(0.95, 1.20, 0.46, TK.hz, TK.deck), dq(0.95, 1.20, -TK.hz, -0.46, TK.deck), dq(1.25, 1.46, 0.46, TK.hz, TK.deck), dq(1.25, 1.46, -TK.hz, -0.46, TK.deck),
      // rear plate (the middle: the sides carry the exhaust grilles), lower rear plate, floor
      face(S, TK.rear, TK.rear, TK.spon, -0.74, -0.22, 0.22, "px"),
      prism(S, [[TK.c2, TK.bot], [1.44, TK.bot], [TK.rear, TK.spon], [TK.c2, TK.spon]], -TK.lz, TK.lz, [0, 2, 3, "z0", "z1"]),
      floor(TK.c2, 1.44),
    ));

    // ---- turret ----
    P.head = part(S, [TK.ox, TK.deck, 0], null, "belly", S.join(
      dq(TK.tf, TK.b0, -TK.ts, TK.ts, TK.roof),                                        // roof
      S.cyl(0.40, 0.03, { axis: "y", at: [TK.ox, TK.deck, 0], caps: false }),          // turret ring
      S.cyl(0.085, 0.016, { axis: "y", at: [0.36, TK.roof, 0.21] }),                 // loader's hatch
      face(S, TK.tf, TK.tf, -0.665, TK.roof, -0.135, 0.135, "nx"),                   // front plate behind the mantlet
    ));
    // front wedges of the add-on armour (an arrowhead seen from above)
    const wedge = (z0, z1) => poly(S,
      [[-0.70, -0.675, z0], [TK.tf, -0.675, z0], [TK.tf, -0.675, z1], [-0.635, -0.462, z0], [TK.tf, TK.roof, z0], [TK.tf, TK.roof, z1]],
      [[0, 1, 2], [3, 5, 4], [0, 2, 5, 3], [0, 3, 4, 1], [1, 4, 5, 2]]);
    P.maneL1 = part(S, [TK.tf, -0.675, 0.29], { y: [0, 1, 0], z: [-0.54, 0, 0.84] }, "head", wedge(0.135, 0.445));
    // side armour modules with two rows of smoke dischargers
    const smokeDir = H.norm([-0.45, 0.62, 0.64]);
    const sideA = S.join(
      prism(S, [[TK.tf, -0.675], [0.32, -0.675], [0.32, -0.395], [0.29, TK.roof], [TK.tf, TK.roof]], TK.ts, TK.ts + 0.06),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => S.cyl(0.017, 0.085, { axis: "y", rot: { y: smokeDir }, at: [0.13 + (k % 4) * 0.042, -0.405 - (k >> 2) * 0.05, TK.ts + 0.07], heat: 0.08 })),
    );
    P.maneL2 = part(S, [0.05, -0.675, TK.ts + 0.03], { y: [0, 1, 0], z: [0, 0, 1] }, "head", sideA);
    const sideB = S.join(
      cube(S, 0.32, TK.b0, -0.675, TK.roof, TK.ts, TK.ts + 0.03),
      cube(S, 0.345, 0.605, -0.655, -0.415, TK.ts + 0.03, TK.ts + 0.14, ["nz"]),
    );
    P.maneL3 = part(S, [0.47, -0.675, TK.ts + 0.03], { y: [0, 1, 0], z: [0, 0, 1] }, "head", sideB);
    P.maneR1 = H.mirror(P.maneL1); P.maneR2 = H.mirror(P.maneL2); P.maneR3 = H.mirror(P.maneL3);
    // the bustle: two halves (top, side, bottom, rear) and the stowage basket
    const bustleHalf = hexa(S, [[TK.b0, -0.65, 0], [TK.b1, -0.62, 0], [TK.b1, -0.39, 0], [TK.b0, TK.roof, 0],
      [TK.b0, -0.65, TK.ts], [TK.b1, -0.62, 0.36], [TK.b1, -0.39, 0.36], [TK.b0, TK.roof, TK.ts]], ["nx", "nz"]);
    P.back1 = part(S, [TK.b0, -0.38, 0.2], { y: [1, 0, 0], z: [0, 1, 0] }, "head", bustleHalf);
    P.back3 = H.mirror(P.back1);
    P.back2 = part(S, [TK.b1, -0.50, 0], { y: [1, 0, 0], z: [0, 1, 0] }, "head", S.join(
      cube(S, TK.b1, 1.17, -0.61, -0.43, -0.35, 0.35, ["nx", "py"]),
      cube(S, TK.b1, 1.17, -0.43, -0.415, -0.35, -0.335), cube(S, TK.b1, 1.17, -0.43, -0.415, 0.335, 0.35),
      cube(S, 1.155, 1.17, -0.43, -0.415, -0.335, 0.335),
    ));
    // gun mantlet (pivot at the trunnions) with the gun shield
    P.jaw = part(S, [TK.trun, TK.gy, 0], null, "head", S.join(
      hexa(S, [[-0.43, -0.60, -0.115], [-0.20, -0.635, -0.135], [-0.20, -0.425, -0.135], [-0.43, -0.46, -0.115],
        [-0.43, -0.60, 0.115], [-0.20, -0.635, 0.135], [-0.20, -0.425, 0.135], [-0.43, -0.46, 0.115]], ["px"]),
      S.cyl(0.075, 0.05, { axis: "-x", at: [-0.43, TK.gy, 0], r1: 0.062 }),
    ));
    // the sights on the roof: the gunner's sight housing at the front and the commander's panoramic sight
    P.neck = part(S, [0.33, TK.roof, -0.24], null, "head", S.join(
      S.cyl(0.062, 0.02, { axis: "y", at: [0.33, TK.roof, -0.24] }),
      S.cyl(0.032, 0.085, { axis: "y", at: [0.33, TK.roof + 0.02, -0.24], caps: false }),
      cube(S, 0.265, 0.40, TK.roof + 0.10, TK.roof + 0.175, -0.30, -0.18),
      cube(S, 0.258, 0.266, TK.roof + 0.115, TK.roof + 0.16, -0.285, -0.195, null, { heat: 0.55 }),
      cube(S, -0.205, 0.04, TK.roof, TK.roof + 0.085, -0.41, -0.22, ["ny"]),
      cube(S, -0.215, -0.2, TK.roof + 0.02, TK.roof + 0.065, -0.385, -0.245, null, { heat: 0.5 }),
    ));
    // the gun: thermal sleeve, fume extractor, barrel with clamps, muzzle with its reference box
    const gs = [
      S.join(S.cyl(0.058, GUN_LEN[0], { axis: "x", caps: false }), S.cyl(0.066, 0.04, { axis: "x", at: [0.0, 0, 0], caps: false }),
        S.cyl(0.064, 0.025, { axis: "x", at: [0.17, 0, 0], caps: false })),
      S.loft([[0, 0.058], [0.04, 0.08], [0.21, 0.08], [GUN_LEN[1], 0.054]], { caps: false }),
      S.join(S.cyl(0.049, GUN_LEN[2], { axis: "x", caps: false }), S.cyl(0.057, 0.026, { axis: "x", at: [0.15, 0, 0] }), S.cyl(0.057, 0.026, { axis: "x", at: [0.33, 0, 0] })),
      S.join(S.cyl(0.045, GUN_LEN[3], { axis: "x", caps: false }), S.disc(0.022, 0.045, { axis: "x", at: [GUN_LEN[3], 0, 0] }),
        S.cyl(0.05, 0.03, { axis: "x", at: [GUN_LEN[3] - 0.03, 0, 0], caps: false }), cube(S, 0.24, 0.31, -0.082, -0.044, -0.024, 0.024, ["py"])),
    ];
    let gx = 0;
    for (let k = 0; k < 4; k++) {
      P["tail" + (k + 1)] = { at: [GUN_X0 + GUN_DIR[0] * gx, TK.gy + GUN_DIR[1] * gx, 0], rot: GUN_ROT, parent: k ? "tail" + k : "jaw", shape: gs[k] };
      gx += GUN_LEN[k];
    }

    // ---- skirts: four light panels (flank) and the heavy armoured front panel with the track guard (scap) ----
    P.flankL = part(S, [0.58, -0.86, 0.585], { y: [0, -1, 0], z: [0, 0, 1] }, "belly",
      S.join(...[0, 1, 2, 3, 4].map((k) => cube(S, -0.28 + k * 0.344, -0.28 + k * 0.344 + 0.33, -1.10, -0.86, 0.575, 0.595))));
    const guard = (cx, a0, a1) => S.loft([[0.36, 0.172, 0.172], [0.51, 0.172, 0.172]], { axis: "z", arc: [a0, a1], caps: false, at: [cx, TK.tcy, 0] });
    P.scapL = part(S, [-0.55, -0.86, 0.588], { y: [0, -1, 0], z: [0, 0, 1] }, "chest", S.join(
      prism(S, [[-0.80, -0.99], [-0.70, -1.10], [-0.30, -1.10], [-0.30, -0.86], [-0.80, -0.86]], 0.56, 0.615),
      guard(TK.idler, 0.15, 1.75),
      cube(S, -0.905, -0.845, -0.895, -0.845, 0.40, 0.50, ["px"], { heat: 0.6 }),
    ));
    // ---- the rear: exhaust grilles in the rear plate, tail light, track guard ----
    P.haunchL = part(S, [TK.rear, -0.82, 0.39], { y: [1, 0, 0], z: [0, 0, 1] }, "hips", S.join(
      face(S, TK.rear, TK.rear, TK.spon, -0.74, 0.22, TK.hz, "px"),
      cube(S, TK.rear, TK.rear + 0.028, -0.88, -0.77, 0.25, 0.50, ["nx"], { heat: 0.3 }),
      ...[0, 1, 2, 3].map((k) => cube(S, TK.rear + 0.028, TK.rear + 0.04, -0.865 + k * 0.026, -0.857 + k * 0.026, 0.26, 0.49, ["nx"], { heat: 0.35 })),
      cube(S, TK.rear, TK.rear + 0.024, -0.762, -0.722, 0.44, 0.535, ["nx"], { heat: 0.92 }),
      guard(TK.sprocket, -1.75, -0.15),
      cube(S, TK.rear, TK.rear + 0.05, -0.95, -0.90, 0.30, 0.36, ["nx"]), cube(S, TK.rear, TK.rear + 0.05, -0.95, -0.90, 0.12, 0.18, ["nx"]),
    ));
    P.flankR = H.mirror(P.flankL); P.scapR = H.mirror(P.scapL); P.haunchR = H.mirror(P.haunchL);

    // ---- running gear (left side; the right mirrors it) ----
    const wy = TK.tcy - 0.004;
    const arms = (ks) => S.join(...ks.map((k) => {
      const x = TK.wheels[k];
      return S.join(
        S.box(0.17, 0.034, 0.036, { at: [x - 0.07, wy + 0.045, 0.335], rot: [0, 0, -0.56] }),
        S.cyl(0.024, 0.07, { axis: "z", at: [x - 0.14, wy + 0.088, 0.29] }),
      );
    }));
    const roller = (x) => wheel(S, [x, TK.tcy + TK.tr - TK.tt - 0.034, TK.tz], 0.034, 0.07, 1);
    P.fl_up = part(S, [TK.wheels[1], wy + 0.09, 0.32], null, null, S.join(arms([0, 1, 2, 3]), roller(TK.wheels[0] + 0.12), roller(TK.wheels[2] + 0.12)));
    P.hl_up = part(S, [TK.wheels[5], wy + 0.09, 0.32], null, null, S.join(arms([4, 5, 6]), roller(TK.wheels[4] + 0.12), roller(TK.wheels[5] + 0.12)));
    const roadWheels = (ks) => S.join(...ks.map((k) => wheel(S, [TK.wheels[k], wy, TK.tz], TK.rw, 0.056, 1, { hubHeat: 0.05 })));
    P.fl_lo = part(S, [(TK.wheels[1] + TK.wheels[2]) / 2, wy, TK.tz], null, "fl_up", roadWheels([0, 1, 2, 3]));
    P.hl_lo = part(S, [TK.wheels[5], wy, TK.tz], null, "hl_up", roadWheels([4, 5, 6]));
    // the track: its outer run with the idler, its inner run with the drive sprocket
    const tread = S.tread(TK.tr, TK.tlen, TK.tw, { t: TK.tt, ridge: 0.022, grousers: 54, at: [TK.tcx, TK.tcy, TK.tz] });
    const sprocket = (c) => {
      const pts = [];
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, r = i % 2 ? 0.072 : 0.096; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
      return S.join(prism(S, pts, c[2] + 0.02, c[2] + 0.05), S.cyl(0.04, 0.03, { axis: "z", at: [c[0], c[1], c[2] + 0.05] }));
    };
    P.fl_paw = part(S, [TK.idler, TK.tcy, TK.tz], null, "fl_lo", S.join(tread[0], wheel(S, [TK.idler, TK.tcy, TK.tz], 0.088, 0.07, 1)));
    P.hl_paw = part(S, [TK.sprocket, TK.tcy, TK.tz], null, "hl_lo", S.join(S.tag([tread[1]], { w: 0.6 }), sprocket([TK.sprocket, TK.tcy, TK.tz])));
    for (const n of ["up", "lo", "paw"]) { P["fr_" + n] = H.mirror(P["fl_" + n]); P["hr_" + n] = H.mirror(P["hl_" + n]); }
    return P;
  }

  // scratch (no allocation per frame)
  const TANK_AIM = [0, 0, 0];

  function tankAnimate(A, t, age, aim, H) {
    // the tracks roll (the hull drives into the wind), the engine shakes the hull a little
    const s = t * 0.3;
    A.scroll("fl_paw", s).scroll("hl_paw", s).scroll("fr_paw", s).scroll("hr_paw", s);
    A.move("belly", 0, 0.0035 * Math.sin(t * 27) + 0.004 * Math.sin(t * 2.1), 0);
    // the turret slews to the target, the gun lays, fires twice, and all is centred again by the end
    const end = 1 - H.smooth(TANK_D - 1.1, TANK_D - 0.42, age);
    const r = H.smooth(0.3, 1.15, age) * end;
    let az = 0;
    if (r > 0) {
      const a = H.clampAim(aim, -2.3, 2.3, -0.1, 0.42, TANK_AIM);
      az = Math.atan2(a[2], -a[0]) * r;
      A.ry("head", az);
      A.rz("jaw", -Math.asin(a[1]) * r);
    }
    // recoil: the barrel runs back into the mantlet, the hull pitches back and rocks on its suspension
    let kick = 0, rock = 0;
    for (let j = 0; j < TANK_SHOTS.length; j++) {
      const dt = age - TANK_SHOTS[j];
      if (dt < 0) continue;
      const k = H.pulse(dt, 0.02, 0.2);
      if (k > kick) kick = k;
      rock += Math.sin(dt * 12) * Math.exp(-dt / 0.33) * H.smooth(0, 0.02, dt);
    }
    if (kick > 0.001) {
      A.move("tail1", 0.15 * kick, 0, 0);
      A.glow("tail4", kick).glow("tail3", 0.55 * kick).glow("tail2", 0.25 * kick).glow("jaw", 0.25 * kick);
    }
    if (rock !== 0) A.wr("belly", Math.sin(az), 0, Math.cos(az), -0.045 * rock * end);
  }

  PM.defineMode({
    name: "tank", kind: "vehicle", yaw: 0.42, dwell: TANK_D,
    parts: tankParts,
    animate: tankAnimate,
    events: TANK_SHOTS.map((a) => ({ age: a, type: "blast", part: "tail4", at: [GUN_LEN[3] + 0.01, 0, 0], dir: [1, 0, 0], power: 1 })),
    // a faint exhaust from the rear grilles
    exhaust: [
      { part: "hips", at: [TK.rear + 0.04 - 1.20, -0.82 + 0.85, 0.37], dir: [1, 0.15, 0.25], power: 0.22 },
      { part: "hips", at: [TK.rear + 0.04 - 1.20, -0.82 + 0.85, -0.37], dir: [1, 0.15, -0.25], power: 0.22 },
    ],
  });

  /* ==================================================================
     HELICOPTER: an EC120-Colibri-like light helicopter, built from
     measurements: the published dimensions (EASA type certificate data,
     the maker's three-view drawing) and the owner's photo, traced into
     tables in metres. An egg-shaped glazed cabin with a big curved
     windscreen and door windows, the engine and gearbox fairing on the
     roof with the exhaust, a low mast with a compact three-blade hub
     under a domed cap and three long slender blades (10 m across), the
     cabin's underside sweeping up into a slender boom, a swept fin with a
     ducted tail fan (a shroud ring and eight fan blades), a fin extension
     below, a horizontal stabiliser with end plates, and skid gear: two
     skids that turn up at the front into the front cross tube, a faired
     rear cross tube and a step bar on each side.
     The tables: x aft of the nose tip, y up from the bottom of the skids,
     z toward the helicopter's left (the near side). The machine frame is
     the same, scaled by HK and moved so that the whole machine, rotor tips
     included, spans x -1.85 .. 1.85 and the cabin sits around y = -0.3.
     ================================================================== */
  const HELI_D = 5.0;
  const HK = 0.32, HXC = 3.825, HYC = 1.405, HYM = -0.3;
  const HOFF = [-HXC * HK, HYM - HYC * HK, 0];
  const toM = (p) => [(p[0] - HXC) * HK, (p[1] - HYC) * HK + HYM, (p[2] || 0) * HK];
  const EC = {
    hubX: 3.05, hubY: 2.954, R: 5.0, chord: 0.26, cone: 0.045,   // rotor: axis, blade plane, radius, chord, coning
    mastY: 2.70, domeY: 2.965, domeR: 0.34, domeH: 0.17,           // mast foot (fairing top), hub cap
    fen: [8.733, 1.847], duct: 0.385, lip: 0.429, fhub: 0.149,     // ducted tail fan: centre, radii
    W: 14, WF: 11,                                                  // rotor and fan speeds (rad/s)
  };
  const spow = (v, e) => (v < 0 ? -Math.pow(-v, e) : Math.pow(v, e));
  // monotone cubic through [[x, y], ...], flat outside
  function curve(pts) {
    const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    if (n === 1) return () => ys[0];
    const h = [], m = [], d = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / h[i]; }
    d[0] = m[0]; d[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) d[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * d[lo] + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h[lo] * d[lo + 1];
    };
  }
  const zipc = (xs, ys) => curve(xs.map((x, i) => [x, ys[i]]));
  // ---- the hull (cabin, rear fuselage, boom), side view and plan view (metres) ----
  const HX = [0, 0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
    2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2, 4.4, 4.6, 4.8, 5.0, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.6, 8.0];
  // top: the roof, then (2.0 .. 4.8, under the engine fairing) the top of the fuselage, then the boom
  const H_TOP = zipc(HX, [1.185, 1.263, 1.311, 1.367, 1.449, 1.51, 1.57, 1.667, 1.752, 1.827, 1.897, 1.961, 2.021, 2.077, 2.129, 2.176, 2.215, 2.243, 2.26, 2.27, 2.275, 2.279, 2.282, 2.286,
    2.29, 2.29, 2.287, 2.28, 2.268, 2.25, 2.225, 2.195, 2.165, 2.135, 2.105, 2.085, 2.072, 2.068, 2.066, 2.039, 2.022, 2.009, 1.995, 1.982, 1.969, 1.956, 1.943, 1.929]);
  const H_BOT = zipc(HX, [1.18, 1.108, 1.067, 1.021, 0.961, 0.921, 0.882, 0.827, 0.784, 0.749, 0.72, 0.695, 0.674, 0.656, 0.639, 0.625, 0.614, 0.607, 0.599, 0.591, 0.583, 0.575, 0.567, 0.559,
    0.552, 0.54, 0.531, 0.528, 0.532, 0.544, 0.565, 0.596, 0.638, 0.69, 0.773, 0.867, 0.969, 1.079, 1.195, 1.317, 1.432, 1.452, 1.471, 1.49, 1.51, 1.529, 1.549, 1.568]);
  const H_HW = zipc(HX, [0, 0.118, 0.176, 0.239, 0.323, 0.378, 0.433, 0.508, 0.564, 0.608, 0.643, 0.671, 0.692, 0.709, 0.721, 0.729, 0.734, 0.738, 0.742, 0.745, 0.748, 0.749, 0.75, 0.75,
    0.749, 0.744, 0.736, 0.724, 0.708, 0.691, 0.671, 0.646, 0.618, 0.587, 0.554, 0.519, 0.484, 0.448, 0.413, 0.379, 0.346, 0.32, 0.297, 0.275, 0.253, 0.23, 0.208, 0.186]);
  // section exponents: round at the nose and along the boom; the cabin's front silhouette is a fuller
  // superellipse above its widest line (n 2.95) and an almost boxy one below it (n 4.7)
  const H_NU = curve([[0, 2.0], [0.3, 2.2], [1.0, 2.95], [3.0, 2.95], [4.2, 2.6], [5.2, 2.4], [8.0, 2.4]]);
  const H_NL = curve([[0, 2.0], [0.3, 2.6], [1.2, 4.7], [3.0, 4.7], [3.7, 3.4], [4.5, 2.4], [5.2, 2.1], [8.0, 2.0]]);
  // the engine and gearbox fairing on the roof: its top (side view) and half width at its foot (plan)
  const F_TOP = curve([[1.84, 2.284], [1.9, 2.286], [2.0, 2.31], [2.1, 2.372], [2.2, 2.432], [2.3, 2.487], [2.4, 2.536], [2.5, 2.578], [2.6, 2.613], [2.8, 2.665], [3.0, 2.695],
    [3.2, 2.708], [3.4, 2.708], [3.6, 2.695], [3.8, 2.676], [4.0, 2.657], [4.2, 2.638], [4.4, 2.618], [4.5, 2.609], [4.545, 2.6], [4.575, 2.44], [4.7, 2.222], [4.8, 2.066]]);
  const F_HW = curve([[1.84, 0], [1.87, 0.17], [1.9, 0.243], [2.0, 0.319], [2.1, 0.375], [2.2, 0.418], [2.3, 0.452], [2.4, 0.478], [2.5, 0.499], [2.6, 0.515], [2.8, 0.504], [3.0, 0.493],
    [3.4, 0.469], [3.8, 0.446], [4.2, 0.423], [4.5, 0.406], [4.6, 0.393], [4.7, 0.216], [4.8, 0]]);
  const F_X0 = 1.84, F_X1 = 4.8;
  // the hull section at x: top, bottom, the widest line, half width, the two exponents (the curves
  // tabulated every 2 mm when the shapes are first built: the sampler evaluates them very often)
  const HS = { t: 0, b: 0, yw: 0, hw: 0, nu: 2, nl: 2 };
  const TB_X1 = 8.0, TB_N = 4000;
  let TB = null;
  function hullSec(x) {
    if (!TB) {
      TB = new Float64Array((TB_N + 1) * 5);
      for (let i = 0; i <= TB_N; i++) {
        const xi = TB_X1 * i / TB_N, o = i * 5;
        TB[o] = H_TOP(xi); TB[o + 1] = H_BOT(xi); TB[o + 2] = H_HW(xi); TB[o + 3] = H_NU(xi); TB[o + 4] = H_NL(xi);
      }
    }
    let f = x / TB_X1 * TB_N;
    f = f < 0 ? 0 : f > TB_N - 1e-9 ? TB_N - 1e-9 : f;
    const i = f | 0, w = f - i, o = i * 5;
    const t = TB[o] + (TB[o + 5] - TB[o]) * w, b = TB[o + 1] + (TB[o + 6] - TB[o + 1]) * w;
    HS.t = t; HS.b = b < t ? b : t; HS.yw = (t + HS.b) / 2; HS.hw = Math.max(0, TB[o + 2] + (TB[o + 7] - TB[o + 2]) * w);
    HS.nu = TB[o + 3] + (TB[o + 8] - TB[o + 3]) * w; HS.nl = TB[o + 4] + (TB[o + 9] - TB[o + 4]) * w;
    return HS;
  }
  // a point of the hull at x and angle a (0 = top, PI/2 = the near side (+z), PI = the bottom, 3PI/2 = far side)
  function hullPt(x, a, q) {
    const s = hullSec(x), c = Math.cos(a), sn = Math.sin(a), e = 2 / (c >= 0 ? s.nu : s.nl);
    q[0] = x;
    q[1] = c >= 0 ? s.yw + (s.t - s.yw) * Math.pow(c, e) : s.yw - (s.yw - s.b) * Math.pow(-c, e);
    q[2] = sn >= 0 ? s.hw * Math.pow(sn, e) : -s.hw * Math.pow(-sn, e);
    return q;
  }
  // the near-side angle where the hull is at height y (a in 0..PI)
  function hullAng(x, y) {
    const s = hullSec(x);
    if (y >= s.yw) { const r = Math.min(1, (y - s.yw) / Math.max(1e-6, s.t - s.yw)); return Math.acos(Math.pow(r, s.nu / 2)); }
    const r = Math.min(1, (s.yw - y) / Math.max(1e-6, s.yw - s.b));
    return PI - Math.acos(Math.pow(r, s.nl / 2));
  }
  // the engine fairing at x (tabulated too): the angle where its foot meets the hull (0 where there is
  // no fairing), the height of its foot, its top and its half width
  const FT_N = 1500, FS = { a: 0, y0: 0, top: 0, w: 0 }, FQ = [0, 0, 0];
  let FT = null;
  function fairSec(x) {
    if (!FT) {
      FT = new Float64Array((FT_N + 1) * 4);
      for (let i = 0; i <= FT_N; i++) {
        const xi = F_X0 + (F_X1 - F_X0) * i / FT_N, s = hullSec(xi), w = Math.max(0, F_HW(xi)), o = i * 4;
        const a = xi > F_X0 && xi < F_X1 && s.hw > 1e-6 && w > 0 ? Math.asin(Math.min(1, Math.pow(Math.min(1, w / s.hw), s.nu / 2))) : 0;
        hullPt(xi, a, FQ);
        FT[o] = a; FT[o + 1] = FQ[1]; FT[o + 2] = Math.max(FQ[1], F_TOP(xi)); FT[o + 3] = w;
      }
    }
    let f = (x - F_X0) / (F_X1 - F_X0) * FT_N;
    f = f < 0 ? 0 : f > FT_N - 1e-9 ? FT_N - 1e-9 : f;
    const i = f | 0, w = f - i, o = i * 4;
    FS.a = FT[o] + (FT[o + 4] - FT[o]) * w; FS.y0 = FT[o + 1] + (FT[o + 5] - FT[o + 1]) * w;
    FS.top = FT[o + 2] + (FT[o + 6] - FT[o + 2]) * w; FS.w = FT[o + 3] + (FT[o + 7] - FT[o + 3]) * w;
    return FS;
  }
  const fairAng = (x) => (x <= F_X0 || x >= F_X1 ? 0 : fairSec(x).a);
  // ---- surface builders (metres; authoring only) ----
  const ang = (f, x) => (typeof f === "function" ? f(x) : f);
  // a band of the hull from x0 to x1 between the angles a0(x) and a1(x) (numbers or functions of x),
  // on the near side (side 1) or mirrored onto the far side (side -1)
  function hullBand(S, x0, x1, a0, a1, side, o) {
    o = o || {};
    // the bounds tabulated along the band (they are smooth; the sampler calls this function very often)
    const NB = 24, A0 = new Float64Array(NB + 1), A1 = new Float64Array(NB + 1);
    let span = 0;
    for (let i = 0; i <= NB; i++) { const x = x0 + (x1 - x0) * i / NB; A0[i] = ang(a0, x); A1[i] = ang(a1, x); span = Math.max(span, A1[i] - A0[i]); }
    return S.param(function (u, v, q) {
      const f = u * NB, i = f >= NB ? NB - 1 : f | 0, w = f - i;
      const a = A0[i] + (A0[i + 1] - A0[i]) * w, b = A1[i] + (A1[i + 1] - A1[i]) * w;
      hullPt(x0 + (x1 - x0) * u, a + (b - a) * v, q);
      q[2] *= side;
    }, { gu: o.gu || Math.max(2, Math.round((x1 - x0) * 20)), gv: o.gv || Math.min(16, Math.max(2, Math.round(span * 8))), flip: side > 0, w: o.w, heat: o.heat, glow: o.glow });
  }
  // the same band on both sides
  const hullBoth = (S, x0, x1, a0, a1, o) => S.join(hullBand(S, x0, x1, a0, a1, 1, o), hullBand(S, x0, x1, a0, a1, -1, o));
  // the engine fairing: a rounded trapezoid section standing on the hull where its foot meets it;
  // a in [-PI/2, PI/2]: -PI/2 the far foot, 0 the crest, PI/2 the near foot
  function fairPt(x, a, q) {
    const f = fairSec(x), c = Math.cos(a), vv = Math.sqrt(c > 0 ? c : 0);
    q[0] = x; q[1] = f.y0 + (f.top - f.y0) * vv; q[2] = f.w * spow(Math.sin(a), 0.5) * (1 - 0.34 * vv);
    return q;
  }
  function fairBand(S, x0, x1, a0, a1, o) {
    o = o || {};
    return S.param(function (u, v, q) { fairPt(x0 + (x1 - x0) * u, a0 + (a1 - a0) * v, q); },
      { gu: o.gu || Math.max(4, Math.round((x1 - x0) * 30)), gv: o.gv || 16, flip: true, w: o.w, heat: o.heat, glow: o.glow });
  }
  // a smooth path through points (centripetal-ish Catmull-Rom, tabulated by arc length) with frames
  // carried along it; tube(S, path, ra, rb) sweeps an ellipse (ra along the frame's n, rb along b)
  function path(pts, nref) {
    const P = pts.map((p) => p.slice()), n = P.length, raw = [];
    const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    for (let i = 0; i < n - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
      for (let k = 0; k < 24; k++) { const t = k / 24; raw.push([0, 1, 2].map((j) => cr(p0[j], p1[j], p2[j], p3[j], t))); }
    }
    raw.push(P[n - 1].slice());
    const L = [0];
    for (let i = 1; i < raw.length; i++) L.push(L[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1], raw[i][2] - raw[i - 1][2]));
    const tot = L[L.length - 1], M = 96, C = [], T = [], N = [], B = [];
    for (let k = 0; k <= M; k++) {
      const s = tot * k / M;
      let i = 1;
      while (i < L.length - 1 && L[i] < s) i++;
      const f = (s - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]);
      C.push([0, 1, 2].map((j) => raw[i - 1][j] + (raw[i][j] - raw[i - 1][j]) * f));
    }
    for (let k = 0; k <= M; k++) {
      const a = C[Math.max(0, k - 1)], b = C[Math.min(M, k + 1)];
      T.push(H_.norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
    }
    // parallel transport of the reference normal
    let nn = H_.norm(nref || [0, 1, 0]);
    for (let k = 0; k <= M; k++) {
      const t = T[k], d = H_.dot(nn, t);
      nn = H_.norm([nn[0] - t[0] * d, nn[1] - t[1] * d, nn[2] - t[2] * d]);
      N.push(nn); B.push(H_.cross(t, nn));
    }
    return { C, T, N, B, M, len: tot };
  }
  function tube(S, pth, ra, rb, o) {
    o = o || {};
    rb = rb == null ? ra : rb;
    return S.param(function (u, v, q) {
      const f = v * pth.M, k = Math.min(pth.M - 1, f | 0), w = f - k, a = TAU * u, ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j < 3; j++) {
        const c = pth.C[k][j] + (pth.C[k + 1][j] - pth.C[k][j]) * w, n = pth.N[k][j] + (pth.N[k + 1][j] - pth.N[k][j]) * w, b = pth.B[k][j] + (pth.B[k + 1][j] - pth.B[k][j]) * w;
        q[j] = c + ra * ca * n + rb * sa * b;
      }
    }, { gu: o.gu || 12, gv: o.gv || Math.max(6, Math.round(pth.len * 24)), flip: false, w: o.w, heat: o.heat, glow: o.glow });
  }
  // a round end cap of a tube path (k = 0 or M), facing outward
  function tubeEnd(S, pth, k, r, o) {
    const c = pth.C[k], t = pth.T[k], s = k ? 1 : -1;
    return S.disc(0, r, Object.assign({ at: c, rot: { z: [t[0] * s, t[1] * s, t[2] * s] } }, o));
  }
  // a round strut from p to q
  function strut(S, p, q, r, o) {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(d[0], d[1], d[2]);
    return S.cyl(r, L, Object.assign({ at: p, rot: { y: [d[0] / L, d[1] / L, d[2] / L] }, caps: false }, o));
  }
  // the fin with the fan shroud: its side outline (metres), counter-clockwise
  const FIN = [[8.998, 3.394], [8.933, 3.333], [8.0, 1.929], [7.979, 1.93], [7.978, 1.564], [8.796, 0.892], [9.176, 0.917], [9.237, 0.945], [9.256, 1.016], [9.204, 1.453],
    [9.459, 1.625], [9.496, 1.673], [9.509, 1.716], [9.5, 1.774], [9.28, 2.219], [9.259, 2.291], [9.255, 2.362], [9.278, 2.485], [9.518, 3.299], [9.599, 3.301], [9.6, 3.383]];
  // where a ray from the fan centre at angle phi leaves the outline (the far hit: fills the small notch under the tip cap)
  function finReachRaw(phi) {
    const dx = Math.cos(phi), dy = Math.sin(phi), C = EC.fen;
    let best = 0;
    for (let i = 0; i < FIN.length; i++) {
      const p = FIN[i], q = FIN[(i + 1) % FIN.length], ex = q[0] - p[0], ey = q[1] - p[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p[0] - C[0]) * ey - (p[1] - C[1]) * ex) / den, s = ((p[0] - C[0]) * dy - (p[1] - C[1]) * dx) / den;
      if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && t > best) best = t;
    }
    return best;
  }
  const FR_N = 4096;
  let FR = null;
  function finReach(phi) {
    if (!FR) { FR = new Float64Array(FR_N + 1); for (let i = 0; i <= FR_N; i++) FR[i] = finReachRaw(TAU * i / FR_N); }
    let f = phi / TAU;
    f = (f - Math.floor(f)) * FR_N;
    const i = Math.min(FR_N - 1, f | 0), w = f - i;
    return FR[i] + (FR[i + 1] - FR[i]) * w;
  }
  // half thickness of the tail at (x, y): the thick shroud round the duct (as wide as the plan view's
  // tail), the thin fin above it and the thin fin extension below
  const SHROUD_HW = curve([[7.98, 0.186], [8.2, 0.175], [8.4, 0.165], [8.6, 0.156], [8.8, 0.148], [9.0, 0.139], [9.2, 0.126], [9.4, 0.108], [9.6, 0.09]]);
  const H_ = PM.H;
  function finHalf(x, y) {
    const d = Math.hypot(x - EC.fen[0], y - EC.fen[1]);
    const near = 1 - H_.smooth(0.5, 0.78, d);
    const root = (1 - H_.smooth(8.2, 8.55, x)) * H_.smooth(1.42, 1.56, y) * (1 - H_.smooth(1.93, 2.08, y));
    return 0.045 + (SHROUD_HW(x) - 0.045) * Math.max(near, root);
  }
  // one side face of the fin (side 1 near, -1 far): rays from the duct edge to the outline
  function finFace(S, side, phi0, phi1, o) {
    o = o || {};
    const C = EC.fen, r0 = EC.duct;
    return S.param(function (u, v, q) {
      const phi = phi0 + (phi1 - phi0) * u, R = finReach(phi), r = r0 + (R - r0) * v;
      q[0] = C[0] + r * Math.cos(phi); q[1] = C[1] + r * Math.sin(phi); q[2] = side * finHalf(q[0], q[1]);
    }, { gu: o.gu || 90, gv: o.gv || 14, flip: side > 0, w: o.w, heat: o.heat, glow: o.glow });
  }
  // the fin's edges: a strip round the outline from one face to the other (not along the boom root)
  function finEdge(S, o) {
    const P = [];
    for (let i = 0; i < FIN.length; i++) {
      const p = FIN[i], q = FIN[(i + 1) % FIN.length];
      if (Math.abs(p[0] - 7.979) < 0.01 && Math.abs(q[0] - 7.978) < 0.01) continue;      // the boom root
      const hp = finHalf(p[0], p[1]), hq = finHalf(q[0], q[1]);
      P.push(S.quad([p[0], p[1], hp], [q[0], q[1], hq], [p[0], p[1], -hp], [q[0], q[1], -hq], o));
    }
    return S.join(P);
  }
  // ---- the glazing: side-view outlines (metres) of the windscreen, the two door windows and the roof
  // window, each as its upper and lower chain from its front point to its rear point ----
  const WINS = [
    { up: [[0.078, 1.202], [0.081, 1.273], [0.138, 1.419], [0.214, 1.527], [0.308, 1.627], [0.565, 1.841], [0.851, 2.029], [1.14, 2.173], [1.164, 2.118]],
      lo: [[0.078, 1.202], [0.096, 1.116], [0.135, 1.033], [0.193, 0.953], [0.334, 0.841], [0.502, 0.764], [0.566, 0.785], [0.624, 0.854], [1.16, 2.095], [1.164, 2.118]] },
    { up: [[0.945, 1.291], [1.24, 2.042], [1.81, 2.07]], lo: [[0.945, 1.291], [0.953, 1.283], [0.998, 1.293], [1.643, 1.45], [1.81, 2.07]] },
    { up: [[1.748, 1.48], [1.908, 2.071], [2.173, 2.074], [2.488, 2.074], [2.507, 2.06], [2.559, 1.976], [2.592, 1.884], [2.6, 1.773]],
      lo: [[1.748, 1.48], [2.52, 1.671], [2.572, 1.71], [2.6, 1.773]] },
    { up: [[1.221, 2.21], [1.301, 2.242], [1.416, 2.266], [1.643, 2.269]], lo: [[1.221, 2.21], [1.266, 2.122], [1.554, 2.138], [1.575, 2.145], [1.643, 2.269]] },
  ];
  // the doors' outline and the line between them (panel lines)
  const DOOR = [[0.704, 0.879], [2.468, 0.852], [2.483, 0.863], [2.749, 1.919], [2.673, 2.17], [1.828, 2.16], [1.219, 2.106], [0.704, 0.879]];
  const DOOR_DIV = [[1.555, 0.857], [1.87, 2.154]];
  function chainY(ch, x) {
    if (x <= ch[0][0]) return ch[0][1];
    for (let i = 1; i < ch.length; i++) if (x <= ch[i][0]) { const a = ch[i - 1], b = ch[i], f = (x - a[0]) / Math.max(1e-9, b[0] - a[0]); return a[1] + (b[1] - a[1]) * f; }
    return ch[ch.length - 1][1];
  }
  const GLASS = { w: 0.33, heat: 0.04 };
  // the cabin skin from x0 to x1 between the angles aT(x) .. aB(x) on one side, the glazing sparse
  // (dark) and the rest of the skin around it
  function cabinSkin(S, x0, x1, side, aT, aB, o) {
    const xs = [x0, x1];
    for (const w of WINS) for (const p of w.up.concat(w.lo)) if (p[0] > x0 + 1e-6 && p[0] < x1 - 1e-6) xs.push(p[0]);
    xs.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i], xb = xs[i + 1];
      if (xb - xa < 1e-4) continue;
      const xm = (xa + xb) / 2;
      const ws = WINS.filter((w) => w.up[0][0] <= xa + 1e-6 && w.up[w.up.length - 1][0] >= xb - 1e-6).sort((p, q) => chainY(q.up, xm) - chainY(p.up, xm));
      const clampA = (f) => (x) => Math.min(ang(aB, x), Math.max(ang(aT, x), f(x)));
      let cur = aT;
      for (const w of ws) {
        const top = clampA((x) => hullAng(x, chainY(w.up, x))), bot = clampA((x) => hullAng(x, chainY(w.lo, x)));
        out.push(hullBand(S, xa, xb, cur, top, side, o), hullBand(S, xa, xb, top, bot, side, Object.assign({}, o, GLASS)));
        cur = bot;
      }
      out.push(hullBand(S, xa, xb, cur, aB, side, o));
    }
    return out;
  }
  // a line drawn on the hull along a side-view polyline (window frames, panel lines): a thin tube
  function hullLine(S, pts, side, r, o) {
    const P = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05));
      for (let k = i ? 1 : 0; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n, q = hullPt(x, hullAng(x, y), [0, 0, 0]);
        q[2] *= side; P.push(q);
      }
    }
    return tube(S, path(P, [0, 0, side]), r, r, Object.assign({ gu: 6 }, o));
  }
  const winLoop = (w) => w.lo.concat(w.up.slice().reverse().slice(1));
  // the frames of some of the windows (indices into WINS) on one side
  const frames = (S, side, which) => S.join(which.map((i) => hullLine(S, winLoop(WINS[i]), side, 0.011, { w: 0.75 })));
  // 3x3 products (row-major)
  function mm3(a, b) {
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  }
  const RY = (a) => H_.euler(0, a, 0), RZ = (a) => H_.euler(0, 0, a), RX = (a) => H_.euler(a, 0, 0);
  function heliParts(S, H) {
    const P = {};
    // a part from geometry in metres (pivot in metres too)
    const put = (name, at, parent, ...shapes) => { P[name] = part(S, toM(at), null, parent, S.place(S.join(shapes), HOFF, null, HK)); };
    const fa = (x) => fairAng(x);
    const C1 = 1.12, C2 = 2.9, C3 = 4.8, C4 = 8.0, CB = 6.35;       // cabin front, mid, rear fuselage, boom
    const AT = 0.8, AB = 1.7, AL = 2.05, RB = 1.88, BT = 0.78, BB = 2.36, AF = 1.0;  // angle cuts (0 top .. PI bottom)
    // ---- the hull ----
    put("chest", [0.6, 1.4, 0], null, cabinSkin(S, 0, C1, 1, 0, PI), cabinSkin(S, 0, C1, -1, 0, PI), frames(S, 1, [0]), frames(S, -1, [0]));
    put("belly", [1.9, 0.8, 0], null, cabinSkin(S, C1, C2, 1, fa, AT), cabinSkin(S, C1, C2, -1, fa, AT), frames(S, 1, [3]), frames(S, -1, [3]),
      hullBoth(S, C1, C2, AL, PI));
    put("fl_paw", [1.9, 1.7, 0.72], null, cabinSkin(S, C1, C2, 1, AT, AB), frames(S, 1, [1, 2]));
    put("fl_up", [1.9, 0.75, 0.7], null, hullBand(S, C1, C2, AB, AL, 1),
      hullLine(S, DOOR, 1, 0.008, { w: 0.6 }), hullLine(S, DOOR_DIV, 1, 0.008, { w: 0.6 }));
    put("hips", [3.6, 0.8, 0], null, hullBoth(S, C2, C3, RB, PI));
    put("hl_paw", [3.6, 1.6, 0.6], null, hullBand(S, C2, C3, fa, RB, 1));
    // ---- the engine and gearbox fairing: its crest (head) and its sides (hl/hr_up) ----
    put("head", [3.3, 2.6, 0], null, fairBand(S, F_X0, F_X1, -AF, AF));
    put("hl_up", [3.3, 2.3, 0.45], null, fairBand(S, F_X0, F_X1, AF, PI / 2));
    // ---- the tail boom: top (back1), bottom (back2), sides (hl/hr_lo front, back3 rear) ----
    put("back1", [6.4, 2.0, 0], null, hullBoth(S, C3, C4, 0, BT));
    put("back2", [6.4, 1.5, 0], null, hullBoth(S, C3, C4, BB, PI));
    put("hl_lo", [5.5, 1.75, 0.3], null, hullBand(S, C3, CB, BT, BB, 1));
    put("back3", [7.1, 1.75, 0], null, hullBoth(S, CB, C4, BT, BB));
    // ---- the fin with the fan shroud: faces (flankL/R), edges (tail1) ----
    put("flankL", [8.8, 2.0, 0.1], null, finFace(S, 1, 0, TAU));
    put("tail1", [8.8, 2.1, 0], null, finEdge(S));
    // ---- the ducted fan: the duct and its lips (tail3), the fan (tail4, it spins), the stators and the
    // gearbox housing on the air's way out (tail2; the air leaves on the right, -z) ----
    const FC = EC.fen, hd = SHROUD_HW(FC[0]);
    put("tail3", [FC[0], FC[1], 0], null,
      S.cyl(EC.duct, 2 * hd, { axis: "z", at: [FC[0], FC[1], -hd], caps: false }),
      S.torus((EC.duct + EC.lip) / 2, (EC.lip - EC.duct) / 2, { at: [FC[0], FC[1], hd - 0.01] }),
      S.torus((EC.duct + EC.lip) / 2, (EC.lip - EC.duct) / 2, { at: [FC[0], FC[1], -hd + 0.01] }));
    const fan = [];
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8, rm = (EC.fhub + EC.duct) / 2;
      fan.push(S.box(EC.duct - EC.fhub - 0.012, 0.075, 0.012, { at: [FC[0] + rm * Math.cos(a), FC[1] + rm * Math.sin(a), 0.035], rot: mm3(RZ(a), RX(0.55)) }));
    }
    put("tail4", [FC[0], FC[1], 0], null, fan, S.cyl(EC.fhub, 0.11, { axis: "z", at: [FC[0], FC[1], -0.02], caps: false }),
      S.ellipsoid(EC.fhub, 0.045, EC.fhub, { at: [FC[0], FC[1], 0.09], theta: [0, PI / 2], rot: RX(PI / 2) }));
    const stat = [];
    for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) * TAU / 10, rm = (EC.fhub + EC.duct) / 2;
      stat.push(S.box(EC.duct - EC.fhub - 0.01, 0.05, 0.01, { at: [FC[0] + rm * Math.cos(a), FC[1] + rm * Math.sin(a), -0.07], rot: RZ(a + 0.12) }));
    }
    put("tail2", [FC[0], FC[1], -0.06], null, stat, S.cyl(EC.fhub * 0.92, 0.12, { axis: "z", at: [FC[0], FC[1], -0.12], caps: false }),
      S.disc(0, EC.fhub * 0.92, { axis: "-z", at: [FC[0], FC[1], -0.12] }),
      // the tail bumper under the fin extension, an antenna under the boom, the beacon on the fin's top
      S.tag(S.join(strut(S, [8.70, 0.96, 0], [9.06, 0.67, 0], 0.022), S.sphere(0.022, { at: [9.06, 0.67, 0] }),
        strut(S, [7.17, 1.55, 0], [7.42, 1.23, 0], 0.012)), { solid: 0 }),
      S.ellipsoid(0.045, 0.06, 0.035, { at: [9.115, 3.39, 0], theta: [0, PI / 2], heat: 0.5 }));
    // ---- the horizontal stabiliser (an inverted airfoil through the boom), one half each side ----
    const stab = (z0, z1) => S.param(function (u, v, q) {
      const z = z0 + (z1 - z0) * u, a = TAU * v, ca = Math.cos(a), sa = Math.sin(a);
      q[0] = 7.43 + 0.24 * ca; q[1] = 1.735 + 0.03 * sa - 0.012 * (1 - ca * ca); q[2] = z;
    }, { gu: 30, gv: 16, flip: true });
    // (thin plates seen almost edge-on: the air passes through them, as through the blades)
    put("haunchL", [7.43, 1.73, 0.75], null, S.tag(stab(0.2, 1.272), { solid: 0 }));
    // ---- the end plates at the stabiliser's tips and the engine exhaust (jaw) ----
    const plate = S.rounded([[7.2, 1.585], [7.62, 1.585], [7.68, 1.955], [7.37, 1.955]], 0.04, 3);
    const XP = [[4.48, 2.5, -0.21], [4.58, 2.517, -0.25], [4.68, 2.525, -0.3]], xp = path(XP, [0, 1, 0]);
    put("jaw", [4.7, 2.3, 0], null,
      S.tag(S.extrude(plate, 0.028, { at: [0, 0, 1.286] }), { glow: 0, solid: 0 }), S.tag(S.extrude(plate, 0.028, { at: [0, 0, -1.286] }), { glow: 0, solid: 0 }),
      tube(S, xp, 0.085, 0.085, { gu: 14 }), S.torus(0.075, 0.012, { at: xp.C[xp.M], rot: { z: xp.T[xp.M] }, heat: 0.35 }),
      S.disc(0, 0.07, { at: xp.C[xp.M - 3], rot: { z: xp.T[xp.M] }, heat: 0.55 }));
    // ---- skid gear: the skid turning up at the front into the front cross tube (fl_lo), the faired
    // rear cross tube leg and the step bar (scap) ----
    const legZ = (y, z0, y0) => z0 + (0.9925 - z0) * Math.sin(Math.acos(Math.min(1, Math.max(0, (y - 0.0425) / (y0 - 0.0425)))));
    const SK = [[4.16, 0.0425], [3.2, 0.0425], [2.2, 0.0425], [1.639, 0.0425], [1.549, 0.11], [1.472, 0.2], [1.386, 0.3], [1.3, 0.4], [1.214, 0.5], [1.104, 0.629]]
      .map((p) => [p[0], p[1], legZ(p[1], 0.5, 0.629)]);
    const sk = path(SK, [0, 1, 0]);
    put("fl_lo", [2.6, 0.05, 0.99], null, tube(S, sk, 0.0425), tubeEnd(S, sk, 0, 0.0425),
      tube(S, path([[1.104, 0.629, 0.5], [1.104, 0.629, 0.25], [1.104, 0.629, 0]], [0, 1, 0]), 0.0425));
    // the faired rear leg arcs from the skid up and inboard to the hull's underside (where the hull is at |z| = 0.42)
    const XL = 3.765, ZL = 0.42, q = [0, 0, 0];
    let lo = PI / 2, hi = PI;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (hullPt(XL, mid, q)[2] > ZL) lo = mid; else hi = mid; }
    const YL = hullPt(XL, lo, q)[1] + 0.02, LEG = [];
    for (let k = 0; k <= 8; k++) { const al = k / 8 * PI / 2; LEG.push([XL, 0.0425 + (YL - 0.0425) * Math.cos(al), ZL + (0.9925 - ZL) * Math.sin(al)]); }
    put("scapL", [3.76, 0.35, 0.85], null, tube(S, path(LEG, [1, 0, 0]), 0.155, 0.04, { gu: 16 }),
      tube(S, path([[1.39, 0.49, 0.86], [2.5, 0.49, 0.86], [3.61, 0.49, 0.86]], [0, 1, 0]), 0.03));
    // ---- the main rotor: mast, swashplate, pitch links, hub and its domed cap (neck; it turns); each
    // blade in two halves (mane L: root with its sleeve, R: outer half) and a very faint ring at the tip
    // path (the blades and the ring let the air through: solid 0) ----
    const HB = [EC.hubX, EC.hubY, 0];
    const head = [
      S.cyl(0.0485, EC.hubY - 0.03 - EC.mastY, { at: [HB[0], EC.mastY, 0], caps: false }),
      S.cyl(0.15, 0.03, { at: [HB[0], 2.765, 0] }),
      S.ellipsoid(EC.domeR, EC.domeH, EC.domeR, { at: [HB[0], EC.domeY, 0], theta: [0, PI / 2] }),
    ];
    for (let k = 0; k < 3; k++) {
      const a = PI + k * TAU / 3, c = Math.cos(a), s = -Math.sin(a), b = a + 0.5, cb = Math.cos(b), sb = -Math.sin(b);
      head.push(S.box(0.3, 0.05, 0.13, { at: [HB[0] + 0.15 * c, EC.hubY - 0.035, 0.15 * s], rot: RY(a) }));
      head.push(strut(S, [HB[0] + 0.15 * cb, 2.795, 0.15 * sb], [HB[0] + 0.24 * cb, 2.93, 0.24 * sb], 0.012));
    }
    put("neck", HB, null, head);
    const R0 = 0.58, RM = 2.79, ch = EC.chord / 2, th = 0.016;
    for (let k = 0; k < 3; k++) {
      const a = PI + k * TAU / 3, Rb = mm3(RY(a), mm3(RZ(EC.cone), RX(-0.08)));
      const inner = S.loft([[R0, 0.012, 0.07], [0.7, 0.016, 0.11], [0.85, th, ch], [RM, th, ch]], { caps: false });
      const outer = S.loft([[RM, th, ch], [EC.R - 0.22, th, ch], [EC.R - 0.07, 0.012, 0.1], [EC.R, 0.004, 0.045]], { caps: false });
      const sleeve = S.capsule(0.062, 0.36, { axis: "x", at: [0.2, 0, 0], r1: 0.055 });
      const ring = S.tag(S.param(function (u, v, q) {
        const ph = (u - 0.5) * TAU / 3, r = EC.R - 0.45 * (1 - v);
        q[0] = r * Math.cos(ph); q[1] = r * Math.sin(EC.cone); q[2] = -r * Math.sin(ph);
      }, { gu: 30, gv: 3 }), { w: 0.02, glow: 0, solid: 0, heat: 0 });
      put("maneL" + (k + 1), HB, "neck", S.tag(S.place(S.join(inner, sleeve), HB, Rb), { solid: 0 }));
      put("maneR" + (k + 1), HB, "neck", S.tag(S.place(outer, HB, Rb), { solid: 0 }), S.place(ring, HB, RY(a)));
    }
    // ---- the right side mirrors the left ----
    for (const n of ["flankL", "scapL", "haunchL"]) P[n.slice(0, -1) + "R"] = H.mirror(P[n]);
    for (const n of ["up", "lo", "paw"]) { P["fr_" + n] = H.mirror(P["fl_" + n]); P["hr_" + n] = H.mirror(P["hl_" + n]); }
    return P;
  }
  const HUBM = toM([EC.hubX, EC.hubY, 0]);
  function heliAnimate(A, t, age, aim, H) {
    // the rotor turns clockwise seen from above (as the real one), the fan spins in its duct
    A.wr("neck", 0, 1, 0, -EC.W * t);
    A.wr("tail4", 0, 0, 1, EC.WF * t);
    // the engine exhaust glows a little
    A.glow("jaw", 0.28 + 0.06 * Math.sin(t * 7.3) * Math.sin(t * 3.1));
    // hover: a slight nose-down attitude (as in the photo), a gentle bob and sway, about the rotor hub
    A.turn(0, 0, 1, 0.062 + 0.01 * Math.sin(t * 0.83 + 0.4), HUBM[0], HUBM[1], 0);
    A.turn(1, 0, 0, 0.012 * Math.sin(t * 0.61 + 1.1), HUBM[0], HUBM[1], 0);
    A.shift(0, 0.022 * Math.sin(t * 1.15), 0);
  }
  // exhaust points in a part's own frame (its pivot as put() placed it), from metres
  const rel = (p, pivot) => [(p[0] - pivot[0]) * HK, (p[1] - pivot[1]) * HK, (p[2] - pivot[2]) * HK];

  PM.defineMode({
    name: "helicopter", kind: "vehicle", yaw: 0.28, dwell: HELI_D,
    parts: heliParts,
    animate: heliAnimate,
    exhaust: [
      // the rotor: radius makes it a rotor disc for the page's air (the wash is driven down across the
      // whole disc and the wind sweeps it back), centred on the shaft just under the blade plane
      { part: "head", at: rel([EC.hubX, EC.hubY - 0.05, 0], [3.3, 2.6, 0]), dir: [0.1, -1, 0], power: 1, radius: EC.R * HK },
      // the engine exhaust on the right side, aft and a little up and out
      { part: "jaw", at: rel([4.74, 2.53, -0.33], [4.7, 2.3, 0]), dir: [1, 0.08, -0.5], power: 0.15 },
    ],
  });

  /* ==================================================================
     TRANSFORMATIONS
     ================================================================== */
  PM.defineTransform("f1", "tank", { time: 2.6 });
})(typeof window !== "undefined" ? window : globalThis);

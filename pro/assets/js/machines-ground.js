/* =====================================================================
   machines-ground.js: the ground and rotor forms of ProMachines:

     tank        a Leopard-2-like main battle tank: low hull, side skirts,
                 tracks on seven road wheels, a turret with wedge-shaped
                 add-on armour and a long smoothbore gun with a thermal
                 sleeve. The tracks roll and the turret follows the aim
                 (the gun never fires; the tank is not in the cycle).
     helicopter  an EC120-Colibri-like light helicopter, built from the
                 measured outline (published dimensions, the maker's
                 three-view drawing and photos, in metres): the egg-shaped
                 glazed cabin, the engine and gearbox fairing with the
                 exhaust on its left, a compact three-blade rotor head, the
                 slender boom, the swept fin with its ducted fan, the
                 stabiliser with its tip lights and the skid gear. It hovers
                 nose down a little with a gentle bob; the rotor turns
                 clockwise seen from above, each blade drawn as a thin blade
                 with the faint blur it leaves behind, and the tail fan spins.

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
     jaw       gun mantlet                   engine exhaust, stabiliser tip lights
     mane 1-3  turret wedges, side armour    blade 1-3 and its blur: L the root
                                             half with its sleeve, R the outer half
     back 1-3  bustle halves, basket         tail boom: top, underside, and a strip
                                             along each side above and below
     flank     light side skirts             the fin's two faces
     scap      heavy front skirt, guard      faired rear gear leg, step bar
     haunch    rear plate grilles, guard     stabiliser halves (sparse: seen edge
                                             on), the boom's rear sides and the
                                             faces of the fin extension
     fl_up     suspension arms, rollers      cabin side under the doors, door lines
     fl_lo     road wheels                   skid, turning up into the front cross tube
     fl_paw    track runs, idler             cabin side with the door windows
     hl_up     suspension arms, rollers      the engine fairing's sides
     hl_lo     road wheels                   tail boom sides (front)
     hl_paw    track runs, sprocket          rear fuselage sides
     tail 1-4  the gun, mantlet to muzzle    fin edges; stators, the fin extension's
                                             edges, tail bumper, antenna, lights; the
                                             duct, its lips and the shroud ring; the
                                             fan, hub and gearbox housing (it spins)
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
     the maker's three-view drawing) and photos, traced into tables in
     metres. An egg-shaped glazed cabin with a big curved windscreen and
     door windows, the engine and gearbox fairing on the roof with the
     exhaust pipe on its left, a low mast with a compact three-blade hub
     under a domed cap and three long slender blades, the cabin's underside
     sweeping up into a slender boom, a swept fin with a ducted tail fan (a
     shroud ring, eight thin fan blades, ten stators and a big hub), a fin
     extension below, a horizontal stabiliser with small tip lights, and
     skid gear: two skids that turn up at the front into the front cross
     tube, a faired rear cross tube and a step bar on each side.
     The tables: x aft of the nose tip, y up from the bottom of the skids,
     z toward the helicopter's left (the near side). The machine frame is
     the same, scaled by HK and moved so that the whole machine, rotor tips
     included, is centred on x = 0 and the cabin sits around y = -0.3.
     Every proportion is the real one, the 10.0 m rotor included (the owner
     asked for real dimensions): its tips reach |z| = 1.6 in depth, which
     only moves them nearer or further (the air is 2D), and across the
     screen the whole machine, the rotor's forward tip to the fin, spans
     11.55 m: x -1.85 .. 1.85 at this scale.
     ================================================================== */
  const HELI_D = 5.0;
  const HK = 0.32, HXC = 3.825, HYC = 1.405, HYM = -0.3;
  const HOFF = [-HXC * HK, HYM - HYC * HK, 0];
  const toM = (p) => [(p[0] - HXC) * HK, (p[1] - HYC) * HK + HYM, (p[2] || 0) * HK];
  const EC = {
    hubX: 3.05, hubY: 2.954, R: 5.0, chord: 0.26, cone: 0.045,    // rotor: axis, blade plane, radius (the real 10 m rotor), chord, coning
    mastY: 2.70, domeY: 2.965, domeR: 0.34, domeH: 0.17,            // mast foot (fairing top), hub cap
    fen: [8.733, 1.847], duct: 0.385, lip: 0.429, fhub: 0.149,      // ducted tail fan: centre, radii
    stab: [7.46, 7.94, 1.735, 0.2, 1.27],                            // stabiliser: leading and trailing edge, height, root and tip z
    W: 22, WF: 11,                                                   // rotor and fan speeds (rad/s)
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
  // the hull section at x: top, bottom, the widest line (half way), half width, the two exponents, and
  // their slopes along x (the curves tabulated every 5 mm when the shapes are first built: the sampler
  // evaluates them very often)
  const HS = { t: 0, b: 0, yw: 0, hw: 0, nu: 2, nl: 2, dt: 0, db: 0, dhw: 0, dnu: 0, dnl: 0 };
  const TB_X1 = 8.0, TB_N = 1600, TB_K = 10;
  let TB = null;
  function hullSec(x) {
    if (!TB) {
      TB = new Float64Array((TB_N + 1) * TB_K);
      for (let i = 0; i <= TB_N; i++) {
        const xi = TB_X1 * i / TB_N, o = i * TB_K, t = H_TOP(xi);
        TB[o] = t; TB[o + 1] = Math.min(t, H_BOT(xi)); TB[o + 2] = Math.max(0, H_HW(xi)); TB[o + 3] = H_NU(xi); TB[o + 4] = H_NL(xi);
      }
      for (let i = 0; i <= TB_N; i++) {
        const a = i > 0 ? i - 1 : 0, b = i < TB_N ? i + 1 : TB_N, h = (b - a) * TB_X1 / TB_N;
        for (let k = 0; k < 5; k++) TB[i * TB_K + 5 + k] = (TB[b * TB_K + k] - TB[a * TB_K + k]) / h;
      }
    }
    let f = x / TB_X1 * TB_N;
    f = f < 0 ? 0 : f > TB_N - 1e-9 ? TB_N - 1e-9 : f;
    const i = f | 0, w = f - i, o = i * TB_K, p = o + TB_K;
    HS.t = TB[o] + (TB[p] - TB[o]) * w; HS.b = TB[o + 1] + (TB[p + 1] - TB[o + 1]) * w; HS.hw = TB[o + 2] + (TB[p + 2] - TB[o + 2]) * w;
    HS.nu = TB[o + 3] + (TB[p + 3] - TB[o + 3]) * w; HS.nl = TB[o + 4] + (TB[p + 4] - TB[o + 4]) * w;
    HS.dt = TB[o + 5] + (TB[p + 5] - TB[o + 5]) * w; HS.db = TB[o + 6] + (TB[p + 6] - TB[o + 6]) * w; HS.dhw = TB[o + 7] + (TB[p + 7] - TB[o + 7]) * w;
    HS.dnu = TB[o + 8] + (TB[p + 8] - TB[o + 8]) * w; HS.dnl = TB[o + 9] + (TB[p + 9] - TB[o + 9]) * w;
    HS.yw = (HS.t + HS.b) / 2;
    return HS;
  }
  // a point of the hull at x and angle a (0 = top, PI/2 = the near side (+z), PI = the bottom), with its
  // outward normal in q[3..5] (the gradient of the section's superellipse |(y - yw)/Y|^n + |z/hw|^n,
  // which also follows the section's change along x)
  function hullPt(x, a, q) {
    const s = hullSec(x), c = Math.cos(a), sn = Math.sin(a), up = c >= 0, n = up ? s.nu : s.nl, e = 2 / n;
    const ac = c < 0 ? -c : c, as = sn < 0 ? -sn : sn;
    const C = ac > 1e-12 ? Math.pow(ac, e) : 0, Z1 = as > 1e-12 ? Math.pow(as, e) : 0;
    const Y = Math.max(1e-4, (s.t - s.b) / 2), Z = Math.max(1e-4, s.hw);
    const eta = up ? C : -C, zeta = sn >= 0 ? Z1 : -Z1;
    q[0] = x; q[1] = s.yw + Y * eta; q[2] = s.hw * zeta;
    const gy = (ac > 1e-12 ? Math.pow(ac, 2 - e) : 0) * (up ? 1 : -1) / Y;
    const gz = (as > 1e-12 ? Math.pow(as, 2 - e) : 0) * (sn >= 0 ? 1 : -1) / Z;
    let gx = -gy * ((s.dt + s.db) / 2 + eta * (s.dt - s.db) / 2) - gz * zeta * s.dhw;
    const dn = up ? s.dnu : s.dnl;
    if (dn !== 0) gx += (c * c * (ac > 1e-9 ? Math.log(ac) : 0) + sn * sn * (as > 1e-9 ? Math.log(as) : 0)) * e * dn / n;
    q[3] = gx; q[4] = gy; q[5] = gz;
    return q;
  }
  // the near-side angle where the hull is at height y (a in 0..PI)
  function hullAng(x, y) {
    const s = hullSec(x), Y = Math.max(1e-6, (s.t - s.b) / 2);
    if (y >= s.yw) { const r = Math.min(1, (y - s.yw) / Y); return Math.acos(Math.pow(r, s.nu / 2)); }
    const r = Math.min(1, (s.yw - y) / Y);
    return PI - Math.acos(Math.pow(r, s.nl / 2));
  }
  // The section's angle a from an even parameter s (0..1 the upper quarter, 1..2 the lower): near the
  // crest, the widest line and the keel the plain angle bunches the points (the superellipse's sides
  // run as a power of it), so a moves as s^(n/2) there, which spreads them evenly.
  function warpA(s, nu, nl) {
    const lo = s > 1, p = (lo ? nl : nu) / 2, t = lo ? (s > 2 ? 1 : s - 1) : (s < 0 ? 0 : s);
    const A = Math.pow(t, p), B = Math.pow(1 - t, p);
    return (lo ? PI / 2 : 0) + (PI / 2) * A / (A + B);
  }
  function unwarpA(a, nu, nl) {
    const lo = a > PI / 2, w = Math.min(1, Math.max(0, (lo ? a - PI / 2 : a) / (PI / 2)));
    const s = w <= 0 ? 0 : w >= 1 ? 1 : (function () { const r = Math.pow(w / (1 - w), 2 / (lo ? nl : nu)); return r / (1 + r); })();
    return lo ? 1 + s : s;
  }
  // a surface that writes its own outward normal in q[3..5] (no finite differences: 5x fewer evaluations;
  // S.param's patches carry nrm: false, the framework's loft caps use nrm: true the same way)
  function analytic(sh) { for (const pt of sh) if (pt && pt.p && pt.p.nrm === false) pt.p.nrm = true; return sh; }
  // ---- surface builders (metres; authoring only) ----
  const ang = (f, x) => (typeof f === "function" ? f(x) : f);
  // a band of the hull from x0 to x1 between the angles lo and hi (numbers, functions of x, or arrays
  // tabulated at NB + 1 even steps from x0 to x1), on the near side (side 1) or mirrored onto the far side
  // (side -1); null where it has no width
  const NB = 32;
  function hullBand(S, x0, x1, lo, hi, side, o) {
    o = o || {};
    const S0 = new Float64Array(NB + 1), S1 = new Float64Array(NB + 1);
    let span = 0;
    for (let i = 0; i <= NB; i++) {
      const x = x0 + (x1 - x0) * i / NB, a0 = ArrayBuffer.isView(lo) ? lo[i] : ang(lo, x), a1 = Math.max(a0, ArrayBuffer.isView(hi) ? hi[i] : ang(hi, x));
      const s = hullSec(x);
      S0[i] = unwarpA(a0, s.nu, s.nl); S1[i] = unwarpA(a1, s.nu, s.nl);
      if (a1 - a0 > span) span = a1 - a0;
    }
    if (span < 2e-3) return null;
    return analytic(S.param(function (u, v, q) {
      const f = u * NB, i = f >= NB ? NB - 1 : f | 0, w = f - i, x = x0 + (x1 - x0) * u;
      const s0 = S0[i] + (S0[i + 1] - S0[i]) * w, s1 = S1[i] + (S1[i + 1] - S1[i]) * w, sec = hullSec(x);
      hullPt(x, warpA(s0 + (s1 - s0) * v, sec.nu, sec.nl), q);
      if (side < 0) { q[2] = -q[2]; q[5] = -q[5]; }
    }, { gu: o.gu || Math.max(3, Math.round((x1 - x0) * 22)), gv: o.gv || Math.min(20, Math.max(3, Math.round(span * 9))), w: o.w, heat: o.heat, glow: o.glow }));
  }
  // the same band on both sides
  const hullBoth = (S, x0, x1, a0, a1, o) => S.join(hullBand(S, x0, x1, a0, a1, 1, o), hullBand(S, x0, x1, a0, a1, -1, o));
  // the engine fairing at x (tabulated too): the angle where its foot meets the hull (0 where there is
  // no fairing), the height of its foot, its top and its half width
  const FT_N = 1000, FS = { a: 0, y0: 0, top: 0, w: 0 }, FQ = [0, 0, 0, 0, 0, 0];
  let FT = null;
  function fairSec(x) {
    if (!FT) {
      FT = new Float64Array((FT_N + 1) * 4);
      for (let i = 0; i <= FT_N; i++) {
        const xi = F_X0 + (F_X1 - F_X0) * i / FT_N, s = hullSec(xi), hw = s.hw, nu = s.nu, w = Math.max(0, F_HW(xi)), o = i * 4;
        const a = xi > F_X0 && xi < F_X1 && hw > 1e-6 && w > 0 ? Math.asin(Math.min(1, Math.pow(Math.min(1, w / hw), nu / 2))) : 0;
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
  // the engine fairing: a rounded trapezoid section standing on the hull where its foot meets it;
  // a in [-PI/2, PI/2]: -PI/2 the far foot, 0 the crest, PI/2 the near foot
  function fairPt(x, a, q) {
    const f = fairSec(x), c = Math.cos(a), vv = Math.sqrt(c > 0 ? c : 0);
    q[0] = x; q[1] = f.y0 + (f.top - f.y0) * vv; q[2] = f.w * spow(Math.sin(a), 0.5) * (1 - 0.34 * vv);
    return q;
  }
  // its angle from an even parameter s in [-1, 1] (it runs as a square root of the angle at the crest
  // and at the foot: the same cure as the hull's)
  const fairWarp = (s) => { const t = s < 0 ? -s : s > 1 ? 1 : s, A = t * t, B = (1 - t) * (1 - t); return (s < 0 ? -1 : 1) * (PI / 2) * A / (A + B); };
  const fairUnwarp = (a) => { const w = Math.min(1, Math.abs(a) / (PI / 2)); if (w >= 1) return a < 0 ? -1 : 1; const r = Math.sqrt(w / (1 - w)); return (a < 0 ? -1 : 1) * r / (1 + r); };
  function fairBand(S, x0, x1, a0, a1, o) {
    o = o || {};
    const s0 = fairUnwarp(a0), s1 = fairUnwarp(a1);
    return S.param(function (u, v, q) { fairPt(x0 + (x1 - x0) * u, fairWarp(s0 + (s1 - s0) * v), q); },
      { gu: o.gu || Math.max(4, Math.round((x1 - x0) * 30)), gv: o.gv || 12, flip: true, w: o.w, heat: o.heat, glow: o.glow });
  }
  // A smooth path through points (Catmull-Rom), resampled evenly by arc length, with a frame carried
  // along it (parallel transport of nref): flat arrays C (centres), T, N, B of M + 1 samples.
  function path(pts, nref) {
    const n = pts.length, SUB = 10, NR = (n - 1) * SUB + 1, raw = new Float64Array(NR * 3), L = new Float64Array(NR);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i > 0 ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 < n ? i + 2 : n - 1];
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB, t2 = t * t, t3 = t2 * t, o = (i * SUB + k) * 3;
        for (let j = 0; j < 3; j++) raw[o + j] = 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
      }
    }
    const pe = pts[n - 1], oe = (NR - 1) * 3;
    raw[oe] = pe[0]; raw[oe + 1] = pe[1]; raw[oe + 2] = pe[2];
    for (let i = 1; i < NR; i++) { const o = i * 3; L[i] = L[i - 1] + Math.hypot(raw[o] - raw[o - 3], raw[o + 1] - raw[o - 2], raw[o + 2] - raw[o - 1]); }
    const tot = L[NR - 1], M = Math.max(8, Math.min(160, Math.ceil(tot / 0.025)));
    const C = new Float64Array((M + 1) * 3), T = new Float64Array((M + 1) * 3), N = new Float64Array((M + 1) * 3), B = new Float64Array((M + 1) * 3);
    let i = 1;
    for (let k = 0; k <= M; k++) {
      const s = tot * k / M;
      while (i < NR - 1 && L[i] < s) i++;
      const f = Math.min(1, Math.max(0, (s - L[i - 1]) / Math.max(1e-12, L[i] - L[i - 1]))), o = k * 3, a = (i - 1) * 3, b = i * 3;
      for (let j = 0; j < 3; j++) C[o + j] = raw[a + j] + (raw[b + j] - raw[a + j]) * f;
    }
    for (let k = 0; k <= M; k++) {
      const a = (k > 0 ? k - 1 : 0) * 3, b = (k < M ? k + 1 : M) * 3, o = k * 3;
      const tx = C[b] - C[a], ty = C[b + 1] - C[a + 1], tz = C[b + 2] - C[a + 2], l = Math.hypot(tx, ty, tz) || 1;
      T[o] = tx / l; T[o + 1] = ty / l; T[o + 2] = tz / l;
    }
    let nx = nref ? nref[0] : 0, ny = nref ? nref[1] : 1, nz = nref ? nref[2] : 0;
    for (let k = 0; k <= M; k++) {
      const o = k * 3, tx = T[o], ty = T[o + 1], tz = T[o + 2], d = nx * tx + ny * ty + nz * tz;
      nx -= tx * d; ny -= ty * d; nz -= tz * d;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      N[o] = nx; N[o + 1] = ny; N[o + 2] = nz;
      B[o] = ty * nz - tz * ny; B[o + 1] = tz * nx - tx * nz; B[o + 2] = tx * ny - ty * nx;
    }
    return { C, T, N, B, M, len: tot };
  }
  // a tube along a path: an ellipse (ra along the frame's N, rb along B; numbers or functions of the
  // fraction along the path) swept along it, with its outward normal
  function tube(S, pth, ra, rb, o) {
    o = o || {};
    rb = rb == null ? ra : rb;
    const C = pth.C, N = pth.N, B = pth.B, T = pth.T, M = pth.M, L = pth.len, fa = typeof ra === "function", fb = typeof rb === "function";
    return analytic(S.param(function (u, v, q) {
      const f = v * M, k = f >= M ? M - 1 : f | 0, w = f - k, a = TAU * u, ca = Math.cos(a), sa = Math.sin(a), k0 = k * 3, k1 = k0 + 3;
      const A = fa ? ra(v) : ra, Bv = fb ? rb(v) : rb;
      // a radius that grows along the path tilts the normal back
      const dA = fa ? (ra(Math.min(1, v + 0.01)) - ra(Math.max(0, v - 0.01))) / (0.02 * L) : 0, dB = fb ? (rb(Math.min(1, v + 0.01)) - rb(Math.max(0, v - 0.01))) / (0.02 * L) : 0;
      const nn = Bv * ca, nb = A * sa, nt = -(dA * Bv * ca * ca + dB * A * sa * sa);
      for (let j = 0; j < 3; j++) {
        const n = N[k0 + j] + (N[k1 + j] - N[k0 + j]) * w, b = B[k0 + j] + (B[k1 + j] - B[k0 + j]) * w, t = T[k0 + j] + (T[k1 + j] - T[k0 + j]) * w;
        q[j] = C[k0 + j] + (C[k1 + j] - C[k0 + j]) * w + A * ca * n + Bv * sa * b;
        q[3 + j] = nn * n + nb * b + nt * t;
      }
    }, { gu: o.gu || 10, gv: o.gv || Math.max(6, Math.round(L * 14)), w: o.w, heat: o.heat, glow: o.glow }));
  }
  // a round end cap of a tube path (end 0 or M), facing outward
  function tubeEnd(S, pth, k, r, o) {
    const j = k * 3, s = k ? 1 : -1, T = pth.T;
    return S.disc(0, r, Object.assign({ at: [pth.C[j], pth.C[j + 1], pth.C[j + 2]], rot: { z: [T[j] * s, T[j + 1] * s, T[j + 2] * s] } }, o));
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
  const FR_N = 2048;
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
  // one side face of the fin (side 1 near, -1 far): rays from the duct's lip to the outline
  // (o.r0 / o.r1: from and to these distances from the fan centre, within the outline)
  function finFace(S, side, phi0, phi1, o) {
    o = o || {};
    const C = EC.fen, ra = o.r0 || (EC.lip + EC.duct) / 2, rb = o.r1 || 99;
    return S.param(function (u, v, q) {
      const phi = phi0 + (phi1 - phi0) * u, R = finReach(phi), r0 = Math.min(ra, R), r = r0 + (Math.min(rb, R) - r0) * v;
      q[0] = C[0] + r * Math.cos(phi); q[1] = C[1] + r * Math.sin(phi); q[2] = side * finHalf(q[0], q[1]);
    }, { gu: o.gu || Math.max(6, Math.round(48 * (phi1 - phi0) / TAU)), gv: o.gv || 10, flip: side > 0, w: o.w, heat: o.heat, glow: o.glow });
  }
  // the fin's edges: a strip round the outline from one face to the other (not along the boom root),
  // facing outward
  // (lower: only the edges of the fin extension below the boom, or all the others)
  function finEdge(S, lower, o) {
    const P = [];
    for (let i = 0; i < FIN.length; i++) {
      const p = FIN[i], q = FIN[(i + 1) % FIN.length];
      if (Math.abs(p[0] - 7.979) < 0.01 && Math.abs(q[0] - 7.978) < 0.01) continue;      // the boom root
      if ((i >= 4 && i <= 8) !== lower) continue;
      const hp = finHalf(p[0], p[1]), hq = finHalf(q[0], q[1]);
      P.push(S.quad([p[0], p[1], -hp], [q[0], q[1], -hq], [p[0], p[1], hp], [q[0], q[1], hq], o));
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
  for (const w of WINS) { w.x0 = w.up[0][0]; w.x1 = w.up[w.up.length - 1][0]; }
  // the doors' outline and the line between them (panel lines)
  const DOOR = [[0.704, 0.879], [2.468, 0.852], [2.483, 0.863], [2.749, 1.919], [2.673, 2.17], [1.828, 2.16], [1.219, 2.106], [0.704, 0.879]];
  const DOOR_DIV = [[1.555, 0.857], [1.87, 2.154]];
  function chainY(ch, x) {
    if (x <= ch[0][0]) return ch[0][1];
    for (let i = 1; i < ch.length; i++) if (x <= ch[i][0]) { const a = ch[i - 1], b = ch[i], f = (x - a[0]) / Math.max(1e-9, b[0] - a[0]); return a[1] + (b[1] - a[1]) * f; }
    return ch[ch.length - 1][1];
  }
  const GLASS = { w: 0.33, heat: 0.04 };
  // the cabin skin from x0 to x1 between the angles aT(x) .. aB(x) on one side: the glazing sparse (dark)
  // and the skin round it, in pieces from one window's end to the next
  function cabinSkin(S, x0, x1, side, aT, aB, o) {
    const xs = [x0, x1];
    for (const w of WINS) for (const xe of [w.x0, w.x1]) if (xe > x0 + 1e-6 && xe < x1 - 1e-6) xs.push(xe);
    xs.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i], xb = xs[i + 1];
      if (xb - xa < 1e-3) continue;
      const xm = (xa + xb) / 2;
      const ws = WINS.filter((w) => w.x0 <= xa + 1e-6 && w.x1 >= xb - 1e-6).sort((p, q) => chainY(q.up, xm) - chainY(p.up, xm));
      // the bounds along the piece: skin, glass, skin, glass, ..., skin (each window kept below the last)
      let prev = new Float64Array(NB + 1);
      const end = new Float64Array(NB + 1);
      for (let k = 0; k <= NB; k++) { const x = xa + (xb - xa) * k / NB; prev[k] = ang(aT, x); end[k] = Math.max(prev[k], ang(aB, x)); }
      for (const w of ws) {
        const top = new Float64Array(NB + 1), low = new Float64Array(NB + 1);
        for (let k = 0; k <= NB; k++) {
          const x = xa + (xb - xa) * k / NB;
          top[k] = Math.min(end[k], Math.max(prev[k], hullAng(x, chainY(w.up, x))));
          low[k] = Math.min(end[k], Math.max(top[k], hullAng(x, chainY(w.lo, x))));
        }
        out.push(hullBand(S, xa, xb, prev, top, side, o), hullBand(S, xa, xb, top, low, side, Object.assign({}, o, GLASS)));
        prev = low;
      }
      out.push(hullBand(S, xa, xb, prev, end, side, o));
    }
    return out.filter(Boolean);
  }
  // a line drawn on the hull along a side-view polyline (window frames, panel lines): a thin tube
  function hullLine(S, pts, side, r, o) {
    const P = [], q = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
      for (let k = i ? 1 : 0; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
        hullPt(x, hullAng(x, y), q);
        P.push([q[0], q[1], q[2] * side]);
      }
    }
    return tube(S, path(P, [0, 0, side]), r, r, Object.assign({ gu: 6 }, o));
  }
  const winLoop = (w) => w.lo.concat(w.up.slice().reverse().slice(1));
  // the frames of some of the windows (indices into WINS) on one side
  const frames = (S, side, which) => S.join(which.map((i) => hullLine(S, winLoop(WINS[i]), side, 0.011, { w: 0.75 })));
  const RY = (a) => H_.euler(0, a, 0), RX = (a) => H_.euler(a, 0, 0);
  // Where the rig's parts split the surfaces, chosen so that every part gets about its share of the
  // points (the counts are set by the other modes, the helicopter sets none): x stations along the hull
  // (cabin front, cabin middle, rear fuselage to boom, boom sides front / rear, boom end; where tail1 and
  // tail2 take over the boom's top and underside), hull angles (0 the top .. PI the bottom: the cabin's
  // window band, door band and belly; the rear fuselage's side and underside; the boom's top, upper and
  // lower side strips, side and underside), the fairing's crest and where its rear end (with the exhaust)
  // starts, the blades' halves (radius), the fin's sectors round the fan (the extension: PH0..PH1; then
  // DB for tail2 and, before PH0, DA for tail1), the shroud ring round the duct (radius), and the weights
  // of the duct's wall, its lips, the stabiliser, the step bar and the front cross tube.
  const K = { C1: 0.969, C2: 2.427, C3: 3.991, CB: 5.538, C4: 8.0, AT: 0.695, AB: 1.665, AL: 2.101, RB: 1.641, BT1: 0.685, BT: 1.1, BB: 1.934, BB1: 2.041,
    AF: 0.942, RM: 2.694, PH0: 4.322, PH1: 5.164, AN: 0.442, DW: 0.1, LW: 8, SW: 0.3, DA: 0.673, DB: 1.251, XJ: 4.589, XT1: 6.926, XT2: 7.124,
    GS: 0.68, GC: 0.962 };
  const { C1, C2, C3, CB, C4, AT, AB, AL, RB, BT1, BT, BB, BB1, AF } = K;
  function heliParts(S, H) {
    const P = {};
    // a part from geometry in metres (pivot in metres too)
    const put = (name, at, parent, ...shapes) => { P[name] = part(S, toM(at), null, parent, S.place(S.join(shapes), HOFF, null, HK)); };
    const fa = (x) => fairAng(x);
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
    put("head", [3.1, 2.6, 0], null, fairBand(S, F_X0, K.XJ, -AF, AF));
    put("hl_up", [3.1, 2.3, 0.45], null, fairBand(S, F_X0, K.XJ, AF, PI / 2));
    // ---- the tail boom: its top (back1), a strip along each side above and below (back3), its underside
    // (back2), its sides (hl/hr_lo at the front, haunchL/R at the rear with the stabiliser) ----
    // (ahead of the fairing's end the boom's bands start at the fairing's foot; the rear of the boom's top
    // and underside go with the fin's edges, tail1 and tail2)
    const above = (b) => (x) => Math.max(fa(x), b);
    put("back1", [6.0, 2.0, 0], null, hullBoth(S, C3, K.XT1, fa, above(BT1)));
    put("back3", [6.0, 1.75, 0], null, hullBoth(S, C3, C4, above(BT1), above(BT)), hullBoth(S, C3, C4, BB, BB1));
    put("back2", [6.0, 1.5, 0], null, hullBoth(S, C3, K.XT2, BB1, PI));
    put("hl_lo", [5.6, 1.75, 0.3], null, hullBand(S, C3, CB, above(BT), BB, 1));
    // ---- the fin with the fan shroud: its faces (flankL/R; the ring round the duct is the duct's, the fin
    // extension below the boom goes with the stabiliser), its edges (tail1; the fin extension's: tail2) ----
    // (round the fan centre, counter-clockwise from the fin extension: tail2's sector, the flank's, tail1's)
    const QB = K.PH1 + K.DB, QA = K.PH0 - K.DA;
    put("flankL", [8.8, 2.3, 0.1], null, finFace(S, 1, QB - TAU, QA, { r0: K.AN }));
    put("tail1", [8.2, 1.9, 0], null, finEdge(S, false), finFace(S, 1, QA, K.PH0, { r0: K.AN }), finFace(S, -1, QA, K.PH0, { r0: K.AN }),
      hullBoth(S, K.XT1, C4, 0, BT1));
    // ---- the ducted fan, seen through: the duct (inward facing, very sparse: dark) with its two lips and
    // the shroud's faces round them (tail3); the fan (tail4, it spins): eight thin blades and the big hub
    // with its cap and, behind it, the gearbox housing; on the air's way out (the right side, -z) the ten
    // thin stators (tail2) ----
    const FC = EC.fen, hd = SHROUD_HW(FC[0]), rl = (EC.lip - EC.duct) / 2, rm = (EC.lip + EC.duct) / 2;
    put("tail3", [FC[0], FC[1], 0], null,
      S.param(function (u, v, q) { const a = TAU * u; q[0] = FC[0] + EC.duct * Math.cos(a); q[1] = FC[1] + EC.duct * Math.sin(a); q[2] = -hd + 2 * hd * v; },
        { gu: 36, gv: 3, flip: true, w: K.DW, heat: -0.16 }),
      // the lips: the quarter of each rounded edge that shows, from the fin's face into the duct (denser: a crisp ring)
      S.torus(rm, rl, { at: [FC[0], FC[1], hd - rl], tube: [PI / 2, PI], w: K.LW, gu: 36, gv: 3 }), S.torus(rm, rl, { at: [FC[0], FC[1], -hd + rl], tube: [PI, 1.5 * PI], w: K.LW, gu: 36, gv: 3 }),
      // and the shroud's faces round them
      finFace(S, 1, 0, TAU, { r1: K.AN, gu: 36, gv: 2 }), finFace(S, -1, 0, TAU, { r1: K.AN, gu: 36, gv: 2 }));
    const FZ = 0.035, fan = [];
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8, ca = Math.cos(a), sa = Math.sin(a), r0 = EC.fhub, r1 = EC.duct - 0.01, hc = 0.035, pc = Math.cos(0.5) * hc, pz = Math.sin(0.5) * hc;
      // a thin blade from the hub to the duct: its chord (7 cm) along the turn, pitched 0.5 rad out of the fan's plane
      const at = (r, s) => [FC[0] + r * ca - s * pc * sa, FC[1] + r * sa + s * pc * ca, FZ + s * pz];
      fan.push(S.quad(at(r0, -1), at(r1, -1), at(r0, 1), at(r1, 1)));
    }
    put("tail4", [FC[0], FC[1], 0], null, S.tag(S.join(fan), { solid: 0 }),
      S.cyl(EC.fhub, 0.1, { axis: "z", at: [FC[0], FC[1], -0.02], caps: false, gu: 16, gv: 2 }),
      S.ellipsoid(EC.fhub, 0.1, EC.fhub, { at: [FC[0], FC[1], 0.08], theta: [0, PI / 2], rot: RX(PI / 2), gu: 16, gv: 5 }),
      // the gearbox housing behind it, on the stators' side (round: it may turn with the fan)
      S.cyl(EC.fhub * 0.92, 0.13, { axis: "z", at: [FC[0], FC[1], -0.15], caps: false, gu: 16, gv: 3 }), S.disc(0, EC.fhub * 0.92, { axis: "-z", at: [FC[0], FC[1], -0.15], gu: 16, gv: 3 }));
    const stat = [];
    for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) * TAU / 10, r0 = EC.fhub * 0.92, r1 = EC.duct - 0.01;
      // a thin vane from the gearbox housing to the duct, its chord along the duct (4 cm), leaning with the swirl
      const at = (r, s) => { const b = a + 0.18 * (r - r0) / (r1 - r0); return [FC[0] + r * Math.cos(b), FC[1] + r * Math.sin(b), -0.075 + s * 0.02]; };
      stat.push(S.quad(at(r0, -1), at(r1, -1), at(r0, 1), at(r1, 1)));
    }
    put("tail2", [FC[0], FC[1], -0.06], null, S.tag(S.join(stat), { solid: 0 }), finEdge(S, true),
      finFace(S, 1, K.PH1, QB, { r0: K.AN }), finFace(S, -1, K.PH1, QB, { r0: K.AN }), hullBoth(S, K.XT2, C4, BB1, PI),
      // the tail bumper under the fin extension, an antenna under the boom, the beacon on the fin's top, the light at its tip
      strut(S, [8.70, 0.96, 0], [9.06, 0.67, 0], 0.022, { gu: 8, gv: 4 }), S.sphere(0.024, { at: [9.06, 0.67, 0], gu: 8, gv: 5 }),
      strut(S, [7.17, 1.55, 0], [7.42, 1.23, 0], 0.012, { gu: 6, gv: 3 }),
      S.ellipsoid(0.045, 0.06, 0.035, { at: [9.115, 3.39, 0], theta: [0, PI / 2], heat: 0.5, gu: 10, gv: 4 }),
      S.sphere(0.035, { at: [9.62, 3.34, 0], heat: 0.3, gu: 10, gv: 5 }));
    // ---- the horizontal stabiliser: a thin plate with a little (inverted) camber through the boom, one
    // half each side; seen almost edge on, so it is sparse; with the boom's rear sides and the fin
    // extension's faces (haunchL/R) ----
    const [sx0, sx1, sy, sz0, sz1] = EC.stab;
    const stab = S.param(function (u, v, q) {
      const s = v; q[0] = sx0 + (sx1 - sx0) * s; q[1] = sy - 0.03 * 4 * s * (1 - s) + 0.012 * (1 - s); q[2] = sz0 + (sz1 - sz0) * u;
    }, { gu: 20, gv: 6, w: K.SW });
    put("haunchL", [7.6, 1.6, 0.3], null, stab, hullBand(S, CB, C4, BT, BB, 1), finFace(S, 1, K.PH0, K.PH1, { r0: K.AN }));
    // ---- the fairing's rear end and the engine exhaust on the left (the near side): a short pipe from the
    // fairing's rear flank, turning aft, up and out, flaring to its outlet; and the stabiliser's tip lights
    // (jaw) ----
    const XP = [[4.47, 2.25, 0.33], [4.6, 2.29, 0.44], [4.74, 2.33, 0.5], [4.86, 2.36, 0.53]], xp = path(XP, [0, 1, 0]);
    const flare = (v) => 0.1 + 0.055 * v * v, xe = xp.M * 3, XO = [xp.C[xe], xp.C[xe + 1], xp.C[xe + 2]], XT = [xp.T[xe], xp.T[xe + 1], xp.T[xe + 2]];
    put("jaw", [4.7, 2.3, 0.4], null,
      // the fairing's rear end and its rounded rear lip, overhanging the exhaust
      S.tag(S.join(fairBand(S, K.XJ, F_X1, -PI / 2, PI / 2), S.capsule(0.07, 0.6, { axis: "z", rz: 0.085, at: [4.61, 2.515, -0.3], gu: 16, gv: 12 })), { glow: 0 }),
      tube(S, xp, flare, flare, { gu: 16, heat: -0.2, glow: 0.4 }),
      // the inside of the bell, seen from behind (warm), and its lip
      S.cyl(0.148, 0.12, { r1: 0.09, at: XO, rot: { y: [-XT[0], -XT[1], -XT[2]] }, caps: false, heat: 0.35, gu: 20, gv: 3 }),
      S.torus(0.155, 0.012, { at: XO, rot: { z: XT }, heat: 0.2, gu: 24, gv: 4 }),
      S.tag(S.join(S.ellipsoid(0.07, 0.026, 0.035, { at: [sx0 + 0.11, sy + 0.005, sz1 + 0.025], gu: 10, gv: 6 }), S.ellipsoid(0.07, 0.026, 0.035, { at: [sx0 + 0.11, sy + 0.005, -sz1 - 0.025], gu: 10, gv: 6 })),
        { glow: 0, heat: 0.25 }));
    // ---- skid gear: the skid turning up at the front into the front cross tube (fl_lo), the faired
    // rear cross tube leg and the step bar (scap) ----
    const legZ = (y, z0, y0) => z0 + (0.9925 - z0) * Math.sin(Math.acos(Math.min(1, Math.max(0, (y - 0.0425) / (y0 - 0.0425)))));
    const SK = [[4.16, 0.0425], [3.2, 0.0425], [2.2, 0.0425], [1.639, 0.0425], [1.549, 0.11], [1.472, 0.2], [1.386, 0.3], [1.3, 0.4], [1.214, 0.5], [1.104, 0.629]]
      .map((p) => [p[0], p[1], legZ(p[1], 0.5, 0.629)]);
    const sk = path(SK, [0, 1, 0]);
    put("fl_lo", [2.6, 0.05, 0.99], null, tube(S, sk, 0.0425), tubeEnd(S, sk, 0, 0.0425),
      tube(S, path([[1.104, 0.629, 0.5], [1.104, 0.629, 0.25], [1.104, 0.629, 0]], [0, 1, 0]), 0.0425, null, { w: K.GC }));
    // the faired rear leg arcs from the skid up and inboard to the hull's underside (where the hull is at |z| = 0.42)
    const XL = 3.765, ZL = 0.42, q6 = [0, 0, 0, 0, 0, 0];
    let lo = PI / 2, hi = PI;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (hullPt(XL, mid, q6)[2] > ZL) lo = mid; else hi = mid; }
    const YL = hullPt(XL, lo, q6)[1] + 0.02, LEG = [];
    for (let k = 0; k <= 8; k++) { const al = k / 8 * PI / 2; LEG.push([XL, 0.0425 + (YL - 0.0425) * Math.cos(al), ZL + (0.9925 - ZL) * Math.sin(al)]); }
    put("scapL", [3.76, 0.35, 0.85], null, tube(S, path(LEG, [1, 0, 0]), 0.155, 0.04, { gu: 16 }),
      tube(S, path([[1.39, 0.49, 0.86], [2.5, 0.49, 0.86], [3.61, 0.49, 0.86]], [0, 1, 0]), 0.03, null, { w: K.GS }));
    // ---- the main rotor: mast, swashplate, pitch links, hub and its domed cap (neck; it turns) ----
    const HB = [EC.hubX, EC.hubY, 0];
    const head = [
      S.cyl(0.0485, EC.hubY - 0.03 - EC.mastY, { at: [HB[0], EC.mastY, 0], caps: false, gu: 12, gv: 4 }),
      S.cyl(0.15, 0.03, { at: [HB[0], 2.765, 0], gu: 24, gv: 2 }),
      S.ellipsoid(EC.domeR, EC.domeH, EC.domeR, { at: [HB[0], EC.domeY, 0], theta: [0, PI / 2], gu: 28, gv: 8 }),
    ];
    for (let k = 0; k < 3; k++) {
      const b = PI + k * TAU / 3 + 0.5, cb = Math.cos(b), sb = -Math.sin(b);
      head.push(strut(S, [HB[0] + 0.15 * cb, 2.795, 0.15 * sb], [HB[0] + 0.24 * cb, 2.93, 0.24 * sb], 0.012, { gu: 6, gv: 3 }));
    }
    put("neck", HB, null, head);
    // ---- the blades, each in two halves (mane L: the root half with its sleeve, R: the outer half), each
    // half a thin blade and the blur it leaves behind: the rotor turns clockwise seen from above, so in a
    // blade's own frame (along +x, coned up) it moves toward +z and the blur trails toward -z, fading over
    // about 50 degrees (the air passes through all of it: solid 0) ----
    const R0 = 0.58, RM = K.RM, PHI = 0.9, BLUR = [0.42, 0.34, 0.25, 0.16, 0.07];
    const cc = Math.cos(EC.cone), sc = Math.sin(EC.cone);
    const blade = (r0, r1) => S.param(function (u, v, q) {
      const r = r0 + (r1 - r0) * u, ch = EC.chord * Math.min(1, 0.45 + 0.55 * (EC.R - r) / 0.25), c = (v - 0.5) * ch;
      q[0] = r * cc; q[1] = r * sc + c * 0.08; q[2] = c;
    }, { gu: Math.max(4, Math.round((r1 - r0) * 10)), gv: 2, w: 0.2 });
    const blur = (r0, r1) => BLUR.map((w, j) => S.param(function (u, v, q) {
      const r = r0 + (r1 - r0) * u, ph = PHI * (j + v) / BLUR.length, rr = r * cc;
      q[0] = rr * Math.cos(ph); q[1] = r * sc; q[2] = -rr * Math.sin(ph);
    }, { gu: Math.max(4, Math.round((r1 - r0) * 6)), gv: 3, w }));
    for (let k = 0; k < 3; k++) {
      const Rk = RY(PI + k * TAU / 3);
      // the hub arm and the blade's sleeve on it
      const sleeve = S.tag(S.join(S.box(0.3, 0.05, 0.13, { at: [0.15, -0.035, 0] }), S.capsule(0.062, 0.36, { axis: "x", at: [0.2, 0, 0], r1: 0.055, gu: 12, gv: 10 })), { w: 0.6 });
      put("maneL" + (k + 1), HB, "neck", S.tag(S.place(S.join(blade(R0, RM), blur(R0, RM), sleeve), HB, Rk), { solid: 0 }));
      put("maneR" + (k + 1), HB, "neck", S.tag(S.place(S.join(blade(RM, EC.R), blur(RM, EC.R)), HB, Rk), { solid: 0 }));
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
  const XOUT = [4.9, 2.37, 0.545], XDIR = [0.85, 0.25, 0.46];

  PM.defineMode({
    name: "helicopter", kind: "vehicle", yaw: 0.28, dwell: HELI_D,
    parts: heliParts,
    animate: heliAnimate,
    exhaust: [
      // the rotor: radius makes it a rotor disc for the page's air (the wash is driven down across the
      // whole disc and the wind sweeps it back), centred on the shaft just under the blade plane
      { part: "head", at: rel([EC.hubX, EC.hubY - 0.05, 0], [3.3, 2.6, 0]), dir: [0.1, -1, 0], power: 1, radius: EC.R * HK },
      // the ducted tail fan, seen face-on: its air comes out sideways (on the right, -z) and the wind sweeps
      // it back, so the page streams it off the fin behind the fan, weaving with the fan's turn, lightly tinted
      { part: "tail4", at: [0, 0, 0], dir: [0, 0, -1], power: 1, radius: EC.duct * HK, swirl: 1, speed: 1.6, heat: 0.5 },
      // the engine exhaust on the left side, aft and a little up and out
      { part: "jaw", at: rel(XOUT, [4.7, 2.3, 0.4]), dir: XDIR, power: 0.15 },
    ],
  });

  /* ==================================================================
     TRANSFORMATIONS
     ================================================================== */
  PM.defineTransform("f1", "tank", { time: 2.6 });
})(typeof window !== "undefined" ? window : globalThis);

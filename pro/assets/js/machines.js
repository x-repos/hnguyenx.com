/* =====================================================================
   ProMachines: ONE transforming machine made of particles, for the wind
   tunnel at the top of the Pro page. It drives, races, rolls into battle,
   lifts off, flies and launches:

     hypercar -> f1 -> helicopter -> jet -> starship -> hypercar

   Plain browser script, no dependencies, no THREE. It defines
   ProMachines on window (or on globalThis, so it also loads in Node).
   This file is the framework. The modes live in their own files, which
   load after this one and call ProMachines.defineMode:
     machines-cars.js     hypercar
     machines-f1.js       f1
     machines-ground.js   tank, helicopter
     machines-sky.js      jet (an F-35-like stealth fighter), starship
   A missing file just leaves its modes out of the cycle. (Parts of the
   guide below still describe the leopard, lion and robot of an earlier
   design; their specs are kept outside the site as examples.)

   ---------------------------------------------------------------------
   API (the page integration in home.js is written against this)
   ---------------------------------------------------------------------
   ProMachines.CYCLE   [{name, dwell}]  the defined modes, always in the order
                       above (kept up to date in place as modes are defined)
   ProMachines.NAMES   the CYCLE names
   ProMachines.DURATION { dwell: 4.5, transform: 2.2 }  fallbacks
   ProMachines.transformTime(a, b)  seconds for the transformation a -> b
   ProMachines.make(name, N, seed)  -> machine (cached; deterministic)
   ProMachines.blend(a, b, u, t, out, outHeat, aim)
        the transformation a -> b at progress u in [0, 1] (u linear in
        time). u = 0 is exactly a.pose(t, out, a.dwell, ...), u = 1 is
        exactly b.pose(t, out, 0, ...). out Float32Array(N*3), outHeat
        Float32Array(N).
   ProMachines.defineMode(spec)       register a mode (see WRITING A MODE)
   ProMachines.defineTransform(a, b, spec)  override a choreography (extra)
   ProMachines.S, .H, .PARTS, .GROUND, .report(N)   tools (extra)

   machine = {
     name, N, kind ("animal" | "robot" | "vehicle"), yaw (preferred view
     yaw around +y), dwell,
     base Float32Array(N*3)    rest pose
     normal Float32Array(N*3)  unit normals of base
     heat Float32Array(N)      surface-pressure look 0..1 at rest
     area, alpha               (extra) surface area; brightness hint 0.4..1
                               (scale the points' alpha by it and every mode
                               looks about as bright; small modes are denser)
     pose(t, out, age, outHeat, aim)
        positions at time t (s) and age = seconds since this mode was
        reached (0 .. dwell). Writes out and outHeat (pressure from the
        current normals + glows: muzzle flash, engines, the roar...).
        aim = unit [x,y,z] toward the target (cursor) in the machine
        frame, or null (forward-left, a little up, toward the viewer).
        At age >= dwell - 0.35 every mode is at rest (weapons down).
     shots(age0, age1, aim) -> events in (age0, age1]:
        { type: "blast" | "roar" | "missile", pos, dir, power, age }
        pos/dir in the machine frame, consistent with pose at that age
        (the time of the last pose() call is used for the t part).
        No events: one shared empty array. The returned array and its
        objects are reused by the next call.
     exhaust(age) -> [{ pos, dir, power }] continuous thrust this frame
        (reused arrays; one shared empty array for modes without engines)
   }

   ---------------------------------------------------------------------
   FRAME (machine coordinates, the same for every mode)
   ---------------------------------------------------------------------
   x = length, the FRONT faces -x (into the wind, which blows toward +x);
   y = up; z = depth toward the viewer. "L" parts are on the +z (near)
   side, "R" parts on -z. GROUND y = -1.3 (leopard, lion, robot, f1 and
   tank stand on it; the jet and starship fly around y = -0.1 .. 0.2).
   Keep everything in x [-1.9, 1.9], y [-1.3, 1.6], z [-1.3, 1.3].
   Sizes (one scale for all): leopard ~2.8 long with the tail, lion ~3.0
   long / 1.6 tall, robot ~2.8 tall, f1 ~3.6 long, tank ~3.4 long with
   the gun, jet ~3.5, starship ~3.7.

   ---------------------------------------------------------------------
   THE RIG: 37 named parts, the same in every mode
   ---------------------------------------------------------------------
   Each part has a fixed number of particles (from the largest SHARE of
   its mode's surface area it has in any mode; exactly N in all), and in
   every mode a SHAPE (in its own local frame, pivot = local origin) and
   a POSE (pivot position + rotation). A transformation moves each part
   as one solid piece along a curved path while its shape reshapes, so
   every part must play a real, visible role in every mode (no parts
   hidden inside the body: they show through as bright blobs), and its
   area should be about the same share of the whole in every mode
   (report() and the lab list the density of each part per mode; keep it
   under ~1.8x).

   Canonical local frames (keep them in every mode, so the slerp between
   modes turns parts the way you expect and point i of a part lands on
   the "same place" of the part in every mode):
     torso (chest, belly, hips): pivot at the segment centre; local -x =
       toward the head end, +y = the back (dorsal), +z = left (near).
       Animals: rot 0. Robot: rot z = -90 deg (head end up, belly forward).
     neck: pivot at its base; local +y along the neck toward the head,
       -x = throat / front.        head: pivot at the back of the skull,
       face toward local -x, up +y.  jaw: pivot at the hinge, extends to -x.
     legs (*_up, *_lo, *_paw): pivot at the upper joint, the segment
       hangs along local -y, front is -x. Rot z > 0 swings the foot back.
     tail1..4: pivot at the near end, the segment extends along local +x.
     plates (mane*, back*, flank*, scap*, haunch*): pivot at the root edge,
       the plate grows along local +y, outer face = local +z, width = x.

   part     | leopard        | lion            | robot             | f1 (suggest)      | tank (suggest)    | jet (suggest)       | starship (suggest)
   ---------+----------------+-----------------+-------------------+-------------------+-------------------+---------------------+-------------------
   chest    | ribcage        | chest           | upper torso       | monocoque, cockpit| hull front, glacis| forward fuselage    | forward hull
   belly    | waist          | belly           | abdomen           | floor / mid tub   | hull middle       | centre fuselage     | mid hull
   hips     | rump           | rump            | pelvis            | engine cover      | engine deck       | aft fuselage        | aft hull, reactor
   neck     | neck           | neck (in mane)  | HEAD (rises last) | airbox, roll hoop | commander cupola  | nose cone, radome   | sensor prow
   head     | head, eyes     | head, eyes      | chest plate (the  | nose cone         | turret            | canopy              | bridge
            |                |                 | lion face)        |                   |                   |                     |
   jaw      | lower jaw      | jaw (roars)     | chin plate        | halo              | gun mantlet       | chin / gun port     | bridge keel
   maneL1-3 | neck + cheek   | mane plates     | left pauldron     | left sidepod      | turret armour L   | left intake         | fins / vanes
   maneR1-3 |  armour plates |  round the head | right pauldron    | right sidepod     | turret armour R   | right intake        | fins / vanes
   back1-3  | dorsal plates  | dorsal plates   | back blades (fan) | front wing        | turret bustle,    | dorsal spine,       | dorsal plates
            |                |                 |                   |                   |  deck grilles     |  airbrake           |
   flankL/R | rib plates     | flank plates    | hip skirts        | floor edges,      | side skirts       | wing roots (LERX)   | hull side panels
            |                |                 |                   |  bargeboards      |                   |                     |
   scapL/R  | shoulder plates| shoulder plates | upper-arm armour  | front wing        | front mudguards   | missiles, pylons    | forward canards
            |                |                 |                   |  endplates        |                   |                     |
   haunchL/R| hip plates     | hip plates      | knee guards       | rear diffuser /   | rear fenders,     | horizontal tails    | aft fins
            |                |                 |                   |  wing endplates   |  exhausts         |                     |
   fl_up/fr | upper fore legs| upper fore legs | upper arms        | front suspension  | sprockets, upper  | wing inner panels   | wing inner panels
   fl_lo/fr | fore legs      | fore legs       | forearms (left    | front tyres       | track loops       | wing outer panels   | wing outer panels
            |                |                 |  carries cannon)  |                   |  (front half)     |                     |
   fl_paw/fr| fore paws      | fore paws       | hands             | front rims, hubs  | road wheels       | wingtip rails       | wingtip pods
   hl_up/hr | thighs         | thighs          | thighs            | rear suspension   | idlers, upper run | vertical tails      | engine pod mounts
   hl_lo/hr | shins          | shins           | shins             | rear tyres        | track loops (rear)| tail fins / ruddevs | engine pods
   hl_paw/hr| hind feet      | hind feet       | feet              | rear rims, hubs   | road wheels       | engine nozzles      | engine nozzles
   tail1-4  | tail           | tail, tuft = 4  | ARM CANNON on the | rear wing: pillar,| main gun: sleeve, | tail cone, nozzles' | spine
            |                |                 |  left forearm:    |  main plane, flap,|  barrel, barrel,  |  fairing, hook      |
            |                |                 |  housing, body,   |  endplates        |  muzzle brake     |                     |
            |                |                 |  barrel, muzzle   |                   |                   |                     |
   (vehicle columns are suggestions; their authors may change them.)

   ---------------------------------------------------------------------
   WRITING A MODE (a mode file is a plain script loaded after this one)
   ---------------------------------------------------------------------
   ProMachines.defineMode({
     name: "tank", kind: "vehicle", yaw: 0.35,   // dwell optional (default table)
     parts: function (S, H) {                    // called once, lazily
       const P = {};
       P.head = { shape: S.box(0.8, 0.3, 0.7, { r: 0.05 }), at: [0.1, -0.55, 0] };
       P.tail1 = { shape: S.cyl(0.05, 0.5, { axis: "x" }), at: [-0.3, -0.5, 0],
                   rot: [0, Math.PI, 0], parent: "head" };    // gun points to -x
       P.fr_up = H.mirror(P.fl_up);              // R parts mirror their L part
       ...                                        // ALL 37 parts, no others
       return P;
     },
     animate: function (A, t, age, aim, H) { A.ry("head", ...); },     // optional
     events: [{ age: 1.6, type: "blast", part: "tail4", at: [0.12, 0, 0],
                dir: [1, 0, 0], power: 1 }],      // optional, see SHOTS
     exhaust: [{ part: "hl_paw", at: [0.2, 0, 0], dir: [1, 0, 0],
                 power: function (age, t) { return 0.8; } }],  // optional
       (an exhaust entry with radius: R is a rotor disc of that radius
       centred at "at", its shaft along dir: the wind tunnel drives the air
       along the shaft across the whole disc; with swirl: +1 / -1 too it is a
       ducted fan seen face-on, whose air leaves turning that way; speed: k
       (x the inflow) with nozzle: r and heat: h is an engine's jet)
     into: { jet: { ...choreography... } },      // optional, see TRANSFORMATIONS
   });
   Part entry: { shape, at: pivot [x,y,z] in the machine frame, rot, parent,
     world }. rot = Euler [rx, ry, rz] (R = Rz*Ry*Rx), or {y:[..], z:[..]}
     (any two of x/y/z: where the part's local axes point), or a 3x3
     row-major array. parent = another part (its pose follows the parent
     when the mode animates). world: true means the shape is drawn in the
     machine's orientation around the pivot (the framework turns it into
     the local frame with the inverse of rot): handy for the robot torso.
   Conventions: wheels spin about local z (A.rz). Tracks: S.tread + A.scroll.
   Rest pose = pose at age >= dwell - 0.35 (weapons down, turret centred).
   Continuous motion (gait, wheels, engines) may use t; event-like motion
   (aim, recoil, roar) must use age so shots() matches pose().

   SHAPES (S): every function returns an array of surface patches in the
   part's local frame. Common options o: at [x,y,z], rot (as above),
   heat (added to the pressure colour: eyes, lamps, nozzles: +0.6..0.9),
   glow (0..1, how much A.glow lights it; default 1), w (density weight),
   solid (0: the air passes through it, as through a rotor's blur disc; the
   wind tunnel leaves such points out of the obstacle; default 1).
     S.box(sx, sy, sz, {r})              rounded box, centred
     S.plate(w, h, t, {w1, bend, curl, sweep})  armour plate: root edge at
        y = 0, grows to y = h, width w (tip w1), thickness t, outer face +z;
        bend = radius of curvature about y, curl = about x, sweep = tip x shift
     S.loft([[x, ry, rz, cy, cz], ...], {n, axis, caps, arc})  body of
        revolution-like loft along x (or axis "y", "-y", "z", ...); stations
        sorted or not; n = superellipse exponent (2 round, 4 boxy)
     S.cyl(r, len, {r1, rz, n, axis="y", caps}) / S.cone(r, len, o)
     S.capsule(r, len, {r1, rz, n, axis="y"})  rounded pod from 0 to len
     S.disc(r0, r1, {axis="z", arc, back})  S.ellipsoid(rx, ry, rz, {theta, phi})
     S.sphere(r, o)  S.torus(R, r, {axis="z", arc, tube})
     S.extrude([[x,y],...], depth, o)    polygon in x-y, extruded along z
     S.rounded(points, r, seg)           rounds a polygon's corners (helper)
     S.wedge(len, h0, h1, depth, o)      ramp: x -len/2..len/2, y 0..h0/h1
     S.tread(R, len, w, {t, grousers, ridge})  track loop in x-y (scrollable)
     S.wheel(R, w, {rim, spokes, hub})   tyre + rim + spokes, axle along z
     S.param(fn(u, v, out), {gu, gv, flip})  any surface
     S.place(shape, at, rot, scale)  S.mirror(shape)  S.join(a, b, ...)
     S.tag(shape, {heat, glow, w, solid})

   ANIMATION (A), inside animate(A, t, age, aim, H):
     A.rx/ry/rz(part, angle)        turn about the part's own local axes
     A.wr(part, wx, wy, wz, angle)  turn about a machine-frame axis (rest)
     A.move(part, dx, dy, dz)       shift the pivot (machine axes, at rest)
     A.point(part, lx, ly, lz, dx, dy, dz, w)  turn so local axis l points
                                    along machine direction d (weight w)
     A.glow(part, g)                light the part (heat toward 1 by g*glow)
     A.scroll(part, s)              roll S.tread loops by s (in loops)
     A.turn(ax, ay, az, angle, px, py, pz) / A.shift(dx, dy, dz)  whole machine
     A.pos(part, lx, ly, lz) -> [x,y,z]  where a local point is right now
   Joint calls accumulate in call order; ancestors first if you use point.
   H: ease, smooth, env(x, a, b, c, d), pulse(dt, attack, decay),
     clampAim(aim, azMin, azMax, elMin, elMax), aimAngles(aim) ->
     {az, el} (az 0 = forward -x, + toward +z), euler, frame, mirror(entry),
     swapSide(name), joints(start, segs), GROUND, TAU, lerp, clamp.

   SHOTS: events: [{ age, type, part, at, dir, power }] (at/dir in the
   part's local frame; dir "aim" = straight along the aim). shots()
   evaluates the pose at each event's age, so the muzzle is where the
   gun is. A custom spec.shots(age0, age1, aim, ctx) may replace it.
   EXHAUST: [{ part, at, dir, power: number | fn(age, t) }].

   ---------------------------------------------------------------------
   TRANSFORMATIONS (the blend engine)
   ---------------------------------------------------------------------
   Every part has a window [s, e] inside u = 0..1. Inside it the part
   travels as a solid piece from its pose in a to its pose in b along a
   quadratic curve through a waypoint (swinging away from the body and
   back), turns about its pivot (slerp), reshapes its own shape into its
   shape in b, glows while it moves, arrives fast, overshoots ~5% and
   settles (the clunk). A part whose parent is the same in a and b is
   LINKED: it rides on its parent and only unfolds relative to it, so
   limbs and tails swing as one piece and stay attached.
   Defaults: plates open first (long windows, big waypoints), the body
   turns, limbs swing and lock, the tail follows, head and neck last.
   Override per transformation (defineTransform(a, b, spec), or a mode's
   into: { b: spec } / from: { a: spec }; later registrations win):
     time: 2.4                       seconds
     style: "mech" | "warp"          warp = the non-mechanical jump
     win:   { part: [s, e] }         windows (0..1)
     delay: { part: ds }             shift a default window
     via:   { part: [dx, dy, dz] }   waypoint = straight midpoint + this
     lift:  { part: k }              scale the automatic waypoint push
     spin:  { part: [ax, ay, az, turns] }  extra turns about a world axis
     morph: { part: [s, e] }         reshape inside the window (fractions)
     link:  { part: "parent" | null }      ride on another part / free
     pre:  [{ parts | except, from, to, about, rot, move }]
             rigid motion of a group's FROM poses (e.g. the lion rears up
             about its hips before it unfolds); applied from u = from to to
     post: [{ ... }]  same on the TO poses, fading out from..to (a crouch
             the new shape rises out of)
     glow: 1                         strength of the moving glow
   Check every transformation in the lab filmstrip: no part may cross
   the body in a straight line, nothing may fly apart.

   ---------------------------------------------------------------------
   PITFALLS
   ---------------------------------------------------------------------
   - Every part in every mode, visible, with a similar share of the area.
   - Keep the canonical local frames, or the slerp will twist parts.
   - pose() must not allocate; animate runs every frame (no arrays).
   - Mode files must load before the first make() (the rig depends on
     all modes' areas; defining a mode later rebuilds it).
   - L parts on +z, R on -z, mirrored (H.mirror does it right).

   ---------------------------------------------------------------------
   LAB (scratch site, http://localhost:8766/machlab/)
   ---------------------------------------------------------------------
     ?mode=tank&N=64000&age=1.6&t=0&aim=-1,0.2,0.3     one mode
     ?from=tank&to=jet&u=0.4                            one blend frame
     ?strip=tank>jet&frames=8                           filmstrip u = 0..1
     ?anim=tank&ages=0,1,1.6,1.7,2,3,4,4.4              mode at several ages
     ?anim=leopard&ts=0,0.06,0.12,...                   several times t
     &hl=tail1  highlight a part   &report=1 density table   &live=1 play
   ===================================================================== */
(function (G) {
  "use strict";

  /* ------------------------------------------------------------------
     0. Constants
     ------------------------------------------------------------------ */
  const PI = Math.PI, TAU = 2 * Math.PI;
  const GROUND = -1.3;
  // the tank was taken out (the owner asked); the SUV replaces the hypercar (the hypercar stays listed
  // only until the SUV exists)
  const ORDER = ["suv", "hypercar", "f1", "helicopter", "jet", "starship"];
  const DWELL = { suv: 4.5, hypercar: 4.5, f1: 4.0, tank: 5.0, helicopter: 5.0, jet: 4.5, starship: 5.0 };
  const DURATION = { dwell: 4.5, transform: 2.2 };
  const JITTER = 0.003;
  const EMPTY = Object.freeze([]);
  const REST_MARGIN = 0.35;

  /* ------------------------------------------------------------------
     1. The rig: the part list ([name, group, sort axes])
     ------------------------------------------------------------------ */
  const PART_DEFS = [
    ["chest", "core", "xyz"], ["belly", "core", "xyz"], ["hips", "core", "xyz"],
    ["neck", "head", "yxz"], ["head", "head", "xyz"], ["jaw", "head", "xyz"],
    ["maneL1", "mane", "yxz"], ["maneL2", "mane", "yxz"], ["maneL3", "mane", "yxz"],
    ["maneR1", "mane", "yxz"], ["maneR2", "mane", "yxz"], ["maneR3", "mane", "yxz"],
    ["back1", "plate", "yxz"], ["back2", "plate", "yxz"], ["back3", "plate", "yxz"],
    ["flankL", "plate", "yxz"], ["flankR", "plate", "yxz"],
    ["scapL", "plate", "yxz"], ["scapR", "plate", "yxz"],
    ["haunchL", "plate", "yxz"], ["haunchR", "plate", "yxz"],
    ["fl_up", "limb", "yxz"], ["fl_lo", "limb", "yxz"], ["fl_paw", "limb", "yxz"],
    ["fr_up", "limb", "yxz"], ["fr_lo", "limb", "yxz"], ["fr_paw", "limb", "yxz"],
    ["hl_up", "limb", "yxz"], ["hl_lo", "limb", "yxz"], ["hl_paw", "limb", "yxz"],
    ["hr_up", "limb", "yxz"], ["hr_lo", "limb", "yxz"], ["hr_paw", "limb", "yxz"],
    ["tail1", "tail", "xyz"], ["tail2", "tail", "xyz"], ["tail3", "tail", "xyz"], ["tail4", "tail", "xyz"],
  ];
  const NP = PART_DEFS.length;
  const PART_NAMES = PART_DEFS.map((d) => d[0]);
  const PART_GROUP = PART_DEFS.map((d) => d[1]);
  const PART_AXES = PART_DEFS.map((d) => d[2].split("").map((c) => "xyz".indexOf(c)));
  const IX = Object.create(null);
  PART_NAMES.forEach((n, i) => { IX[n] = i; });
  function pix(p) {
    if (typeof p === "number") return p;
    const i = IX[p];
    if (i === undefined) throw new Error("ProMachines: no part named " + p);
    return i;
  }
  function swapSide(name) {
    if (/^[fh][lr]_/.test(name)) return name[0] + (name[1] === "l" ? "r" : "l") + name.slice(2);
    let m = /^mane([LR])(\d)$/.exec(name);
    if (m) return "mane" + (m[1] === "L" ? "R" : "L") + m[2];
    m = /^(.*)([LR])$/.exec(name);
    if (m && IX[m[1] + (m[2] === "L" ? "R" : "L")] !== undefined) return m[1] + (m[2] === "L" ? "R" : "L");
    return name;
  }

  /* ------------------------------------------------------------------
     2. Math: numbers, 3x3 rotations (authoring), 3x4 affines and
        quaternions (runtime, in typed arrays, no allocation)
     ------------------------------------------------------------------ */
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function rng(seed) {
    let a = (seed >>> 0) ^ 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function hash01(n) {
    let x = Math.imul((n | 0) ^ 0x27d4eb2d, 0x9e3779b1);
    x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  function vnorm(v) { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // 3x3 row-major rotations, used while building shapes
  function rx3(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function ry3(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rz3(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function mul3(a, b) {
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  }
  function tr3(R) { return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]; }
  function app3(R, v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; }
  function euler3(rx, ry, rz) { return mul3(rz3(rz || 0), mul3(ry3(ry || 0), rx3(rx || 0))); }
  // A frame from where (two of) its local axes point in the machine frame
  function frame3(o) {
    let x = o.x && vnorm(o.x), y = o.y && vnorm(o.y), z = o.z && vnorm(o.z);
    const orth = (a, b) => { const d = vdot(a, b); return vnorm([a[0] - b[0] * d, a[1] - b[1] * d, a[2] - b[2] * d]); };
    if (y && z) { z = orth(z, y); x = vcross(y, z); }
    else if (x && y) { y = orth(y, x); z = vcross(x, y); }
    else if (x && z) { x = orth(x, z); y = vcross(z, x); }
    else if (y) { z = orth(Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], y); x = vcross(y, z); }
    else if (z) { y = orth(Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], z); x = vcross(y, z); }
    else if (x) { y = orth(Math.abs(x[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1], x); z = vcross(x, y); }
    else return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  }
  function rot3(r) {
    if (!r) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (Array.isArray(r) || ArrayBuffer.isView(r)) {
      if (r.length === 9) return Array.from(r);
      if (r.length === 3) return euler3(r[0], r[1], r[2]);
    }
    if (typeof r === "object") return frame3(r);
    throw new Error("ProMachines: bad rotation");
  }
  const MIRZ = [1, 0, 0, 0, 1, 0, 0, 0, -1];

  // 3x4 affine [r00 r01 r02 tx | r10 r11 r12 ty | r20 r21 r22 tz]
  function aIdent(m, o) {
    m[o] = 1; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
  }
  function aMul(a, ao, b, bo, c, co) { // c = a * b (c may alias a or b)
    const a0 = a[ao], a1 = a[ao + 1], a2 = a[ao + 2], a3 = a[ao + 3], a4 = a[ao + 4], a5 = a[ao + 5], a6 = a[ao + 6], a7 = a[ao + 7], a8 = a[ao + 8], a9 = a[ao + 9], a10 = a[ao + 10], a11 = a[ao + 11];
    const b0 = b[bo], b1 = b[bo + 1], b2 = b[bo + 2], b3 = b[bo + 3], b4 = b[bo + 4], b5 = b[bo + 5], b6 = b[bo + 6], b7 = b[bo + 7], b8 = b[bo + 8], b9 = b[bo + 9], b10 = b[bo + 10], b11 = b[bo + 11];
    c[co] = a0 * b0 + a1 * b4 + a2 * b8; c[co + 1] = a0 * b1 + a1 * b5 + a2 * b9; c[co + 2] = a0 * b2 + a1 * b6 + a2 * b10; c[co + 3] = a0 * b3 + a1 * b7 + a2 * b11 + a3;
    c[co + 4] = a4 * b0 + a5 * b4 + a6 * b8; c[co + 5] = a4 * b1 + a5 * b5 + a6 * b9; c[co + 6] = a4 * b2 + a5 * b6 + a6 * b10; c[co + 7] = a4 * b3 + a5 * b7 + a6 * b11 + a7;
    c[co + 8] = a8 * b0 + a9 * b4 + a10 * b8; c[co + 9] = a8 * b1 + a9 * b5 + a10 * b9; c[co + 10] = a8 * b2 + a9 * b6 + a10 * b10; c[co + 11] = a8 * b3 + a9 * b7 + a10 * b11 + a11;
  }
  function aInv(a, ao, c, co) { // inverse of a rigid motion
    const r0 = a[ao], r1 = a[ao + 1], r2 = a[ao + 2], tx = a[ao + 3], r3 = a[ao + 4], r4 = a[ao + 5], r5 = a[ao + 6], ty = a[ao + 7], r6 = a[ao + 8], r7 = a[ao + 9], r8 = a[ao + 10], tz = a[ao + 11];
    c[co] = r0; c[co + 1] = r3; c[co + 2] = r6; c[co + 3] = -(r0 * tx + r3 * ty + r6 * tz);
    c[co + 4] = r1; c[co + 5] = r4; c[co + 6] = r7; c[co + 7] = -(r1 * tx + r4 * ty + r7 * tz);
    c[co + 8] = r2; c[co + 9] = r5; c[co + 10] = r8; c[co + 11] = -(r2 * tx + r5 * ty + r8 * tz);
  }
  function aFromRT(R, t) {
    const m = new Float64Array(12);
    m[0] = R[0]; m[1] = R[1]; m[2] = R[2]; m[3] = t ? t[0] : 0;
    m[4] = R[3]; m[5] = R[4]; m[6] = R[5]; m[7] = t ? t[1] : 0;
    m[8] = R[6]; m[9] = R[7]; m[10] = R[8]; m[11] = t ? t[2] : 0;
    return m;
  }
  // quaternions [x y z w]
  function qFromA(m, mo, q, qo) {
    const m00 = m[mo], m01 = m[mo + 1], m02 = m[mo + 2], m10 = m[mo + 4], m11 = m[mo + 5], m12 = m[mo + 6], m20 = m[mo + 8], m21 = m[mo + 9], m22 = m[mo + 10];
    const tr = m00 + m11 + m22;
    let x, y, z, w;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    const L = Math.hypot(x, y, z, w) || 1;
    q[qo] = x / L; q[qo + 1] = y / L; q[qo + 2] = z / L; q[qo + 3] = w / L;
  }
  function aSetQ(q, qo, m, mo) { // rotation part from a quaternion (translation untouched)
    const x = q[qo], y = q[qo + 1], z = q[qo + 2], w = q[qo + 3];
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    m[mo] = 1 - 2 * (yy + zz); m[mo + 1] = 2 * (xy - wz); m[mo + 2] = 2 * (xz + wy);
    m[mo + 4] = 2 * (xy + wz); m[mo + 5] = 1 - 2 * (xx + zz); m[mo + 6] = 2 * (yz - wx);
    m[mo + 8] = 2 * (xz - wy); m[mo + 9] = 2 * (yz + wx); m[mo + 10] = 1 - 2 * (xx + yy);
  }
  function qMul(a, ao, b, bo, c, co) { // c = a (x) b (c may alias)
    const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3], bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
    c[co] = aw * bx + ax * bw + ay * bz - az * by;
    c[co + 1] = aw * by - ax * bz + ay * bw + az * bx;
    c[co + 2] = aw * bz + ax * by - ay * bx + az * bw;
    c[co + 3] = aw * bw - ax * bx - ay * by - az * bz;
  }
  function qAxis(ax, ay, az, ang, q, qo) {
    const L = Math.hypot(ax, ay, az) || 1, s = Math.sin(ang / 2) / L;
    q[qo] = ax * s; q[qo + 1] = ay * s; q[qo + 2] = az * s; q[qo + 3] = Math.cos(ang / 2);
  }
  // slerp that also extrapolates a little (t slightly > 1: the overshoot)
  function qSlerp(a, ao, b, bo, t, c, co, keep) {
    const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
    let bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
    let d = ax * bx + ay * by + az * bz + aw * bw;
    if (d < 0 && !keep) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let wa, wb;
    if (d > 0.9995) { wa = 1 - t; wb = t; }
    else { const th = Math.acos(clamp(d, -1, 1)), s = Math.sin(th); wa = Math.sin((1 - t) * th) / s; wb = Math.sin(t * th) / s; }
    let x = wa * ax + wb * bx, y = wa * ay + wb * by, z = wa * az + wb * bz, w = wa * aw + wb * bw;
    const L = Math.hypot(x, y, z, w) || 1;
    c[co] = x / L; c[co + 1] = y / L; c[co + 2] = z / L; c[co + 3] = w / L;
  }

  // Surface pressure look from the x part of the normal: facing upstream
  // (nx = -1) 0.95, side-on 0.22, facing downstream 0.35.
  function pressure(nx) { return nx < 0 ? 0.22 - nx * (0.40 - 0.33 * nx) : 0.22 + 0.13 * nx; }

  // Monotone cubic interpolation (no overshoot) through (xs, ys)
  function pchip(xs, ys) {
    const n = xs.length;
    if (n === 1) return () => ys[0];
    const h = new Float64Array(n - 1), m = new Float64Array(n - 1), d = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / (h[i] || 1e-9); }
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

  // The mechanical ease of a part inside its window: starts from rest,
  // arrives fast at x = 0.72, overshoots ~5% and settles (a clunk).
  function easeMech(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x < 0.72) { const y = x / 0.72; return y * y * (1.8 - 0.8 * y); }
    const z = (x - 0.72) / 0.28;
    return 1 + 0.099 * Math.sin(1.5 * PI * z) * (1 - z) * (1 - z);
  }
  function easeMorph(x) { return smooth(0.08, 0.7, x); }
  function glowCurve(x) {
    if (x <= 0 || x >= 1) return 0;
    const s = Math.sin(PI * x), f = (x - 0.73) / 0.07;
    return 0.6 * s * Math.sqrt(s) + 0.55 * Math.exp(-f * f);
  }

  /* ------------------------------------------------------------------
     3. Shapes: surface patches with near-uniform sampling
     ------------------------------------------------------------------ */
  const K_QUAD = 0, K_TUBE = 1, K_DISC = 2, K_ELL = 3, K_TOR = 4, K_FN = 5, K_TRI = 6, K_TREAD = 7;
  // Patch: intrinsic surface (u, v in [0,1]) + M (3x4, intrinsic -> part local)
  function mkPatch(k, p, o, gu, gv) {
    o = o || {};
    const R = rot3(o.rot), sc = o.scale || 1;
    const M = aFromRT(R.map((v) => v * sc), o.at);
    return {
      k, p, M, sc,
      w: o.w == null ? 1 : o.w, heat: o.heat || 0, glow: o.glow == null ? 1 : o.glow,
      solid: o.solid == null ? 1 : o.solid,
      gu: Math.max(1, o.gu || gu), gv: Math.max(1, o.gv || gv), cum: null, area: -1,
    };
  }
  function copyPatch(pt, M, sc) {
    return { k: pt.k, p: pt.p, M, sc, w: pt.w, heat: pt.heat, glow: pt.glow, solid: pt.solid, gu: pt.gu, gv: pt.gv, cum: pt.cum, area: pt.area };
  }
  // where intrinsic +x goes, for tubes and lofts
  const AXIS = { x: [1, 0, 0, 0, 1, 0, 0, 0, 1], "-x": ry3(PI), y: rz3(PI / 2), "-y": rz3(-PI / 2), z: ry3(-PI / 2), "-z": ry3(PI / 2) };
  // where intrinsic +z goes, for discs and tori
  const NAXIS = { z: [1, 0, 0, 0, 1, 0, 0, 0, 1], "-z": ry3(PI), x: ry3(PI / 2), "-x": ry3(-PI / 2), y: rx3(-PI / 2), "-y": rx3(PI / 2) };
  function withAxis(o, table, axis, def) {
    const A = table[axis || def];
    if (!A) throw new Error("ProMachines: bad axis " + axis);
    const R = mul3(rot3(o && o.rot), A);
    return Object.assign({}, o, { rot: R });
  }

  const EV = new Float64Array(6);   // intrinsic position + normal of one evaluation
  const FNO = new Float64Array(6), FNA = new Float64Array(6), FNB = new Float64Array(6);
  function evalPatch(pt, u, v) {
    const p = pt.p;
    let nx, ny, nz;
    switch (pt.k) {
      case K_QUAD: {
        const a = p.a, b = p.b, c = p.c, d = p.d, iu = 1 - u, iv = 1 - v;
        EV[0] = a[0] * iu * iv + b[0] * u * iv + c[0] * iu * v + d[0] * u * v;
        EV[1] = a[1] * iu * iv + b[1] * u * iv + c[1] * iu * v + d[1] * u * v;
        EV[2] = a[2] * iu * iv + b[2] * u * iv + c[2] * iu * v + d[2] * u * v;
        const ux = (b[0] - a[0]) * iv + (d[0] - c[0]) * v, uy = (b[1] - a[1]) * iv + (d[1] - c[1]) * v, uz = (b[2] - a[2]) * iv + (d[2] - c[2]) * v;
        const vx = (c[0] - a[0]) * iu + (d[0] - b[0]) * u, vy = (c[1] - a[1]) * iu + (d[1] - b[1]) * u, vz = (c[2] - a[2]) * iu + (d[2] - b[2]) * u;
        nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
        break;
      }
      case K_TUBE: {
        const n1 = p.NS - 1, f = v * n1;
        let j = f | 0; if (j >= n1) j = n1 - 1;
        const w = f - j, T = p.tab, o0 = j * 8, o1 = o0 + 8;
        const ry = T[o0] + (T[o1] - T[o0]) * w, rz = T[o0 + 1] + (T[o1 + 1] - T[o0 + 1]) * w;
        const cy = T[o0 + 2] + (T[o1 + 2] - T[o0 + 2]) * w, cz = T[o0 + 3] + (T[o1 + 3] - T[o0 + 3]) * w;
        const dry = T[o0 + 4] + (T[o1 + 4] - T[o0 + 4]) * w, drz = T[o0 + 5] + (T[o1 + 5] - T[o0 + 5]) * w;
        const dcy = T[o0 + 6] + (T[o1 + 6] - T[o0 + 6]) * w, dcz = T[o0 + 7] + (T[o1 + 7] - T[o0 + 7]) * w;
        const ang = p.a0 + u * (p.a1 - p.a0), c = Math.cos(ang), s = Math.sin(ang);
        let ce = c, se = s, gy, gz;
        if (p.n !== 2) {
          ce = c < 0 ? -Math.pow(-c, p.e) : Math.pow(c, p.e);
          se = s < 0 ? -Math.pow(-s, p.e) : Math.pow(s, p.e);
          gy = (ce < 0 ? -Math.pow(-ce, p.n - 1) : Math.pow(ce, p.n - 1)) / (ry > 1e-4 ? ry : 1e-4);
          gz = (se < 0 ? -Math.pow(-se, p.n - 1) : Math.pow(se, p.n - 1)) / (rz > 1e-4 ? rz : 1e-4);
        } else {
          gy = ce / (ry > 1e-4 ? ry : 1e-4); gz = se / (rz > 1e-4 ? rz : 1e-4);
        }
        EV[0] = p.x0 + v * (p.x1 - p.x0); EV[1] = cy + ry * ce; EV[2] = cz + rz * se;
        nx = -(gy * (dcy + ce * dry) + gz * (dcz + se * drz)); ny = gy; nz = gz;
        break;
      }
      case K_DISC: {
        const r = p.r0 + v * (p.r1 - p.r0), ang = p.a0 + u * (p.a1 - p.a0);
        EV[0] = r * Math.cos(ang) * p.sx; EV[1] = r * Math.sin(ang) * p.sy; EV[2] = 0;
        nx = 0; ny = 0; nz = p.nz;
        break;
      }
      case K_ELL: {
        const th = p.t0 + v * (p.t1 - p.t0), ph = p.f0 + u * (p.f1 - p.f0);
        const st = Math.sin(th);
        const x = p.rx * st * Math.cos(ph), y = p.ry * Math.cos(th), z = p.rz * st * Math.sin(ph);
        EV[0] = x; EV[1] = y; EV[2] = z;
        nx = x / (p.rx * p.rx); ny = y / (p.ry * p.ry); nz = z / (p.rz * p.rz);
        break;
      }
      case K_TOR: {
        const a = p.a0 + u * (p.a1 - p.a0), b = p.b0 + v * (p.b1 - p.b0);
        const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), rr = p.R + p.r * cb;
        EV[0] = rr * ca; EV[1] = rr * sa; EV[2] = p.r * sb;
        nx = cb * ca; ny = cb * sa; nz = sb;
        break;
      }
      case K_FN: {
        const f = p.f;
        f(u, v, FNO);
        EV[0] = FNO[0]; EV[1] = FNO[1]; EV[2] = FNO[2];
        if (p.nrm) { nx = FNO[3]; ny = FNO[4]; nz = FNO[5]; }
        else {
          const h = 1e-3, u0 = u > h ? u - h : u, u1 = u < 1 - h ? u + h : u, v0 = v > h ? v - h : v, v1 = v < 1 - h ? v + h : v;
          f(u1, v, FNA); f(u0, v, FNB);
          const ux = FNA[0] - FNB[0], uy = FNA[1] - FNB[1], uz = FNA[2] - FNB[2];
          f(u, v1, FNA); f(u, v0, FNB);
          const vx = FNA[0] - FNB[0], vy = FNA[1] - FNB[1], vz = FNA[2] - FNB[2];
          nx = (uy * vz - uz * vy) * p.sgn; ny = (uz * vx - ux * vz) * p.sgn; nz = (ux * vy - uy * vx) * p.sgn;
        }
        break;
      }
      case K_TRI: {
        const s = Math.sqrt(u), a = p.a, b = p.b, c = p.c, wa = 1 - s, wb = s * (1 - v), wc = s * v;
        EV[0] = a[0] * wa + b[0] * wb + c[0] * wc; EV[1] = a[1] * wa + b[1] * wb + c[1] * wc; EV[2] = a[2] * wa + b[2] * wb + c[2] * wc;
        nx = p.n[0]; ny = p.n[1]; nz = p.n[2];
        break;
      }
      case K_TREAD: {
        // stadium loop in x-y: bottom run (+x), right arc, top run (-x), left arc
        const R = p.R, len = p.len, Lp = 2 * len + 2 * PI * R;
        let d = (u - Math.floor(u)) * Lp, rho, z, sgn = 1;
        if (p.layer === 0) { rho = R + p.ridge * Math.pow(Math.max(0, Math.sin(TAU * u * p.count)), 6); z = -p.w / 2 + v * p.w; }
        else if (p.layer === 1) { rho = R - p.t; z = -p.w / 2 + v * p.w; sgn = -1; }
        else { rho = R - p.t + v * p.t; z = p.layer === 2 ? p.w / 2 : -p.w / 2; }
        let cx, cy, ex, ey;
        if (d < len) { cx = -len / 2 + d; cy = 0; ex = 0; ey = -1; }
        else if ((d -= len) < PI * R) { const a = -PI / 2 + d / R; cx = len / 2; cy = 0; ex = Math.cos(a); ey = Math.sin(a); }
        else if ((d -= PI * R) < len) { cx = len / 2 - d; cy = 0; ex = 0; ey = 1; }
        else { d -= len; const a = PI / 2 + d / R; cx = -len / 2; cy = 0; ex = Math.cos(a); ey = Math.sin(a); }
        EV[0] = cx + ex * rho; EV[1] = cy + ey * rho; EV[2] = z;
        if (p.layer < 2) { nx = ex * sgn; ny = ey * sgn; nz = 0; } else { nx = 0; ny = 0; nz = p.layer === 2 ? 1 : -1; }
        break;
      }
    }
    const L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    EV[3] = nx / L; EV[4] = ny / L; EV[5] = nz / L;
  }
  // area of each grid cell (intrinsic), cumulative
  function patchGrid(pt) {
    if (pt.cum) return;
    if (pt.k === K_TRI) {
      const a = pt.p.a, b = pt.p.b, c = pt.p.c;
      const cr = vcross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
      const ar = 0.5 * Math.hypot(cr[0], cr[1], cr[2]);
      pt.gu = pt.gv = 1; pt.cum = Float64Array.of(ar); pt.area = ar;
      return;
    }
    const gu = pt.gu, gv = pt.gv, G3 = new Float64Array((gu + 1) * (gv + 1) * 3);
    for (let j = 0; j <= gv; j++) for (let i = 0; i <= gu; i++) {
      evalPatch(pt, i / gu, j / gv);
      const o = (j * (gu + 1) + i) * 3;
      G3[o] = EV[0]; G3[o + 1] = EV[1]; G3[o + 2] = EV[2];
    }
    const cum = new Float64Array(gu * gv);
    let acc = 0;
    const tri = (a, b, c) => {
      const ux = G3[b] - G3[a], uy = G3[b + 1] - G3[a + 1], uz = G3[b + 2] - G3[a + 2];
      const vx = G3[c] - G3[a], vy = G3[c + 1] - G3[a + 1], vz = G3[c + 2] - G3[a + 2];
      return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    };
    for (let j = 0; j < gv; j++) for (let i = 0; i < gu; i++) {
      const a = (j * (gu + 1) + i) * 3, b = a + 3, c = a + (gu + 1) * 3, d = c + 3;
      acc += tri(a, b, d) + tri(a, d, c);
      cum[j * gu + i] = acc;
    }
    pt.cum = cum; pt.area = acc;
  }
  function flat(args, out) {
    out = out || [];
    for (const a of args) {
      if (!a) continue;
      if (Array.isArray(a)) flat(a, out);
      else out.push(a);
    }
    return out;
  }

  const S = {};
  S.quad = function (a, b, c, d, o) { return [mkPatch(K_QUAD, { a, b, c, d }, o, 3, 3)]; };
  // Loft along intrinsic x through stations [x, ry, rz, cy, cz] with a superellipse section
  S.loft = function (st, o) {
    o = o || {};
    st = st.map((s) => [s[0], s[1], s[2] == null ? s[1] : s[2], s[3] || 0, s[4] || 0]).sort((a, b) => a[0] - b[0]);
    const xs = st.map((s) => s[0]);
    const f = [1, 2, 3, 4].map((k) => pchip(xs, st.map((s) => s[k])));
    const NS = 65, x0 = xs[0], x1 = xs[xs.length - 1], h = (x1 - x0) / (NS - 1) || 1e-6, tab = new Float64Array(NS * 8);
    for (let j = 0; j < NS; j++) {
      const x = x0 + j * h, xa = Math.max(x0, x - h * 0.5), xb = Math.min(x1, x + h * 0.5);
      for (let k = 0; k < 4; k++) {
        tab[j * 8 + k] = k < 2 ? Math.max(0, f[k](x)) : f[k](x);
        tab[j * 8 + 4 + k] = (f[k](xb) - f[k](xa)) / (xb - xa || 1e-9);
      }
    }
    const n = o.n || 2, arc = o.arc || [0, TAU];
    const oo = withAxis(o, AXIS, o.axis, "x");
    const prm = { NS, tab, x0, x1, n, e: 2 / n, a0: arc[0], a1: arc[1] };
    const out = [mkPatch(K_TUBE, prm, oo, o.gu || 40, o.gv || Math.min(56, Math.max(12, st.length * 7)))];
    if (o.caps !== false) {
      const cap = (j, x, sign) => {
        const ry = tab[j * 8], rz = tab[j * 8 + 1], cy = tab[j * 8 + 2], cz = tab[j * 8 + 3];
        if (Math.max(ry, rz) < 0.006) return;
        const e = 2 / n;
        const fn = function (u, v, q) {
          const ang = arc[0] + u * (arc[1] - arc[0]), c = Math.cos(ang), s = Math.sin(ang);
          const ce = n === 2 ? c : (c < 0 ? -Math.pow(-c, e) : Math.pow(c, e)), se = n === 2 ? s : (s < 0 ? -Math.pow(-s, e) : Math.pow(s, e));
          q[0] = x; q[1] = cy + v * ry * ce; q[2] = cz + v * rz * se; q[3] = sign; q[4] = 0; q[5] = 0;
        };
        out.push(mkPatch(K_FN, { f: fn, nrm: true, sgn: 1 }, oo, 24, 6));
      };
      cap(0, x0, -1); cap(NS - 1, x1, 1);
    }
    return out;
  };
  S.cyl = function (r, len, o) {
    o = o || {};
    const r1 = o.r1 == null ? r : o.r1, rz = o.rz == null ? r : o.rz, rz1 = o.rz1 == null ? rz * (r ? r1 / r : 1) : o.rz1;
    return S.loft([[0, r, rz], [len, r1, rz1]], Object.assign({ axis: "y" }, o, { axis: o.axis || "y" }));
  };
  S.cone = function (r, len, o) { return S.cyl(r, len, Object.assign({}, o, { r1: 0, rz1: 0 })); };
  // rounded pod from 0 to len along the axis (radius r at the start, r1 at the end)
  S.capsule = function (r, len, o) {
    o = o || {};
    const r1 = o.r1 == null ? r : o.r1, k = o.rz == null ? 1 : o.rz / r, cs = [[0.906, 0.423], [0.643, 0.766], [0.342, 0.94]];
    const st = [];
    for (const [c, s] of cs) st.push([-r * c, r * s, r * s * k]);
    st.push([0, r, r * k]);
    if (o.mid) st.push([len * 0.5, o.mid, o.mid * k]);
    st.push([len, r1, r1 * k]);
    for (let i = cs.length - 1; i >= 0; i--) st.push([len + r1 * cs[i][0], r1 * cs[i][1], r1 * cs[i][1] * k]);
    return S.loft(st, Object.assign({}, o, { axis: o.axis || "y" }));
  };
  S.disc = function (r0, r1, o) {
    o = o || {};
    const arc = o.arc || [0, TAU];
    const oo = withAxis(o, NAXIS, o.axis, "z");
    const out = [mkPatch(K_DISC, { r0, r1, a0: arc[0], a1: arc[1], sx: o.sx || 1, sy: o.sy || 1, nz: 1 }, oo, 24, Math.max(2, Math.round(6 * (r1 - r0) / Math.max(r1, 1e-6))))];
    if (o.back) out.push(mkPatch(K_DISC, { r0, r1, a0: arc[0], a1: arc[1], sx: o.sx || 1, sy: o.sy || 1, nz: -1 }, oo, 24, 6));
    return out;
  };
  S.ellipsoid = function (rx, ry, rz, o) {
    o = o || {};
    const th = o.theta || [0, PI], ph = o.phi || [0, TAU];
    return [mkPatch(K_ELL, { rx, ry, rz, t0: th[0], t1: th[1], f0: ph[0], f1: ph[1] }, o, 32, 18)];
  };
  S.sphere = function (r, o) { return S.ellipsoid(r, r, r, o); };
  S.torus = function (R, r, o) {
    o = o || {};
    const arc = o.arc || [0, TAU], tube = o.tube || [0, TAU];
    const oo = withAxis(o, NAXIS, o.axis, "z");
    return [mkPatch(K_TOR, { R, r, a0: arc[0], a1: arc[1], b0: tube[0], b1: tube[1] }, oo, 40, 14)];
  };
  S.param = function (fn, o) {
    o = o || {};
    return [mkPatch(K_FN, { f: function (u, v, q) { fn(u, v, q); }, nrm: false, sgn: o.flip ? -1 : 1 }, o, o.gu || 24, o.gv || 24)];
  };
  S.box = function (sx, sy, sz, o) {
    o = o || {};
    const r = Math.max(0, Math.min(o.r || 0, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4));
    const hx = sx / 2 - r, hy = sy / 2 - r, hz = sz / 2 - r, X = sx / 2, Y = sy / 2, Z = sz / 2;
    const P = [];
    const Q = (a, b, c, d) => P.push(mkPatch(K_QUAD, { a, b, c, d }, null, 3, 3));
    // faces: du x dv points out
    Q([X, -hy, hz], [X, -hy, -hz], [X, hy, hz], [X, hy, -hz]);
    Q([-X, -hy, -hz], [-X, -hy, hz], [-X, hy, -hz], [-X, hy, hz]);
    Q([-hx, Y, hz], [hx, Y, hz], [-hx, Y, -hz], [hx, Y, -hz]);
    Q([-hx, -Y, -hz], [hx, -Y, -hz], [-hx, -Y, hz], [hx, -Y, hz]);
    Q([-hx, -hy, Z], [hx, -hy, Z], [-hx, hy, Z], [hx, hy, Z]);
    Q([hx, -hy, -Z], [-hx, -hy, -Z], [hx, hy, -Z], [-hx, hy, -Z]);
    if (r > 0) {
      // 12 quarter-round edges (a tube along x is rotated to each edge)
      const edge = (axis, at, a0) => {
        const len = axis === "x" ? 2 * hx : axis === "y" ? 2 * hy : 2 * hz;
        const ps = S.loft([[-len / 2, r, r], [len / 2, r, r]], { axis, caps: false, arc: [a0, a0 + PI / 2], at, gu: 6, gv: 8 });
        P.push(ps[0]);
      };
      // along x: section (y, z): angle 0 = +y, 90 = +z
      for (const sy_ of [1, -1]) for (const sz_ of [1, -1]) {
        const a0 = sy_ > 0 ? (sz_ > 0 ? 0 : -PI / 2) : (sz_ > 0 ? PI / 2 : PI);
        edge("x", [0, sy_ * hy, sz_ * hz], a0);
      }
      // along y (axis "y" = rz3(90): intrinsic y -> -x, z -> z): angle 0 = -x, 90 = +z
      for (const sx_ of [1, -1]) for (const sz_ of [1, -1]) {
        const a0 = sx_ < 0 ? (sz_ > 0 ? 0 : -PI / 2) : (sz_ > 0 ? PI / 2 : PI);
        edge("y", [sx_ * hx, 0, sz_ * hz], a0);
      }
      // along z (axis "z" = ry3(-90): intrinsic y -> y, z -> -x): angle 0 = +y, 90 = -x
      for (const sx_ of [1, -1]) for (const sy_ of [1, -1]) {
        const a0 = sy_ > 0 ? (sx_ < 0 ? 0 : -PI / 2) : (sx_ < 0 ? PI / 2 : PI);
        edge("z", [sx_ * hx, sy_ * hy, 0], a0);
      }
      // 8 corners
      for (const sx_ of [1, -1]) for (const sy_ of [1, -1]) for (const sz_ of [1, -1]) {
        const th = sy_ > 0 ? [0, PI / 2] : [PI / 2, PI];
        const f0 = sx_ > 0 ? (sz_ > 0 ? 0 : 1.5 * PI) : (sz_ > 0 ? 0.5 * PI : PI);
        P.push(mkPatch(K_ELL, { rx: r, ry: r, rz: r, t0: th[0], t1: th[1], f0, f1: f0 + PI / 2 }, { at: [sx_ * hx, sy_ * hy, sz_ * hz] }, 6, 6));
      }
    }
    return S.place(P, o.at, o.rot, 1, o);
  };
  // Armour plate: root edge at y = 0, tip at y = h; width w (tip w1); thickness t; outer face +z.
  S.plate = function (w, h, t, o) {
    o = o || {};
    const w1 = o.w1 == null ? w : o.w1, bend = o.bend || 0, curl = o.curl || 0, sweep = o.sweep || 0;
    const map = (xn, yn, zn, q) => {
      const y0 = yn * h, hw = (w + (w1 - w) * yn) / 2, x0 = xn * hw + sweep * yn, z0 = zn * t / 2;
      let x = x0, z = z0, y = y0;
      if (bend) { const R = bend + z0, ph = x0 / bend; x = R * Math.sin(ph); z = R * Math.cos(ph) - bend; }
      if (curl) { const Rc = curl + z, ps = y0 / curl; y = Rc * Math.sin(ps); z = Rc * Math.cos(ps) - curl; }
      q[0] = x; q[1] = y; q[2] = z;
    };
    const P = [];
    const F = (fn, flip, gu, gv) => P.push(mkPatch(K_FN, { f: fn, nrm: false, sgn: flip ? -1 : 1 }, null, gu, gv));
    F((u, v, q) => map(2 * u - 1, v, 1, q), false, 14, 14);
    F((u, v, q) => map(2 * u - 1, v, -1, q), true, 14, 14);
    F((u, v, q) => map(-1, v, 2 * u - 1, q), false, 2, 12);
    F((u, v, q) => map(1, v, 2 * u - 1, q), true, 2, 12);
    F((u, v, q) => map(2 * u - 1, 0, 2 * v - 1, q), false, 12, 2);
    F((u, v, q) => map(2 * u - 1, 1, 2 * v - 1, q), true, 12, 2);
    return S.place(P, o.at, o.rot, 1, o);
  };
  S.rounded = function (pts, r, seg) {
    seg = seg || 4;
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const da = vnorm([a[0] - p[0], a[1] - p[1], 0]), db = vnorm([b[0] - p[0], b[1] - p[1], 0]);
      const cosT = clamp(da[0] * db[0] + da[1] * db[1], -1, 1), th = Math.acos(cosT);
      const rr = Math.min(r, 0.45 * Math.hypot(a[0] - p[0], a[1] - p[1]) * Math.tan(th / 2), 0.45 * Math.hypot(b[0] - p[0], b[1] - p[1]) * Math.tan(th / 2));
      if (!(th > 0.01 && th < PI - 0.01) || rr <= 1e-5) { out.push(p); continue; }
      const d = rr / Math.tan(th / 2);
      const p1 = [p[0] + da[0] * d, p[1] + da[1] * d], p2 = [p[0] + db[0] * d, p[1] + db[1] * d];
      const bis = vnorm([da[0] + db[0], da[1] + db[1], 0]), cd = rr / Math.sin(th / 2);
      const c = [p[0] + bis[0] * cd, p[1] + bis[1] * cd];
      let a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), a2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
      let da_ = a2 - a1;
      while (da_ > PI) da_ -= TAU;
      while (da_ < -PI) da_ += TAU;
      for (let k = 0; k <= seg; k++) { const an = a1 + da_ * k / seg; out.push([c[0] + rr * Math.cos(an), c[1] + rr * Math.sin(an)]); }
    }
    return out;
  };
  function triangulate(pts) {
    const idx = pts.map((_, i) => i), tris = [];
    const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const inTri = (p, a, b, c) => cr(a, b, p) >= -1e-12 && cr(b, c, p) >= -1e-12 && cr(c, a, p) >= -1e-12;
    let guard = 0;
    while (idx.length > 3 && guard++ < 20000) {
      let found = false;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
        if (cr(pts[a], pts[b], pts[c]) <= 1e-12) continue;
        let inside = false;
        for (const j of idx) { if (j !== a && j !== b && j !== c && inTri(pts[j], pts[a], pts[b], pts[c])) { inside = true; break; } }
        if (inside) continue;
        tris.push([a, b, c]); idx.splice(i, 1); found = true; break;
      }
      if (!found) break;
    }
    if (idx.length === 3) tris.push(idx.slice());
    return tris;
  }
  S.extrude = function (pts, depth, o) {
    o = o || {};
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) pts = pts.slice().reverse();
    const hz = depth / 2, P = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-7) continue;
      P.push(mkPatch(K_QUAD, { a: [a[0], a[1], -hz], b: [b[0], b[1], -hz], c: [a[0], a[1], hz], d: [b[0], b[1], hz] }, null, 2, 3));
    }
    for (const [i, j, k] of triangulate(pts)) {
      const a = pts[i], b = pts[j], c = pts[k];
      P.push(mkPatch(K_TRI, { a: [a[0], a[1], hz], b: [b[0], b[1], hz], c: [c[0], c[1], hz], n: [0, 0, 1] }, null, 1, 1));
      P.push(mkPatch(K_TRI, { a: [a[0], a[1], -hz], b: [c[0], c[1], -hz], c: [b[0], b[1], -hz], n: [0, 0, -1] }, null, 1, 1));
    }
    return S.place(P, o.at, o.rot, 1, o);
  };
  S.wedge = function (len, h0, h1, depth, o) {
    return S.extrude([[-len / 2, 0], [len / 2, 0], [len / 2, h1], [-len / 2, h0]], depth, o);
  };
  S.tread = function (R, len, w, o) {
    o = o || {};
    const t = o.t || Math.min(0.05, R * 0.3), P = [];
    for (let layer = 0; layer < 4; layer++) {
      P.push(mkPatch(K_TREAD, { R, len, w, t, layer, ridge: o.ridge == null ? 0.012 : o.ridge, count: o.grousers || Math.round((2 * len + 2 * PI * R) / 0.07) }, null, 96, layer < 2 ? 4 : 2));
    }
    return S.place(P, o.at, o.rot, 1, o);
  };
  S.wheel = function (R, w, o) {
    o = o || {};
    const rim = o.rim || R * 0.62, spokes = o.spokes == null ? 5 : o.spokes, hub = o.hub || R * 0.16, P = [];
    P.push(S.cyl(R, w, { axis: "z", at: [0, 0, -w / 2], caps: false }));
    P.push(S.disc(rim, R, { at: [0, 0, w / 2] }), S.disc(rim, R, { at: [0, 0, -w / 2], axis: "-z" }));
    P.push(S.cyl(rim, w * 0.8, { axis: "z", at: [0, 0, -w * 0.4], caps: false, w: 0.6 }));
    P.push(S.cyl(hub, w * 0.9, { axis: "z", at: [0, 0, -w * 0.45] }));
    for (let k = 0; k < spokes; k++) {
      const a = TAU * k / spokes;
      P.push(S.box(rim - hub, R * 0.1, w * 0.18, { at: [Math.cos(a) * (rim + hub) / 2, Math.sin(a) * (rim + hub) / 2, w * 0.3], rot: [0, 0, a] }));
    }
    return S.place(flat(P), o.at, o.rot, 1, o);
  };
  // place a shape: M' = [scale * rot | at] * M ; o: {heat, glow, w} override (if given)
  S.place = function (shape, at, rot, scale, o) {
    shape = flat([shape]);
    const R = rot3(rot), sc = scale || 1;
    const A = aFromRT(R.map((v) => v * sc), at);
    const out = shape.map((pt) => {
      const M = new Float64Array(12);
      aMul(A, 0, pt.M, 0, M, 0);
      const q = copyPatch(pt, M, pt.sc * sc);
      return q;
    });
    if (o) S.tag(out, o);
    return out;
  };
  S.mirror = function (shape) { return S.place(shape, null, MIRZ); };
  S.join = function () { return flat(Array.prototype.slice.call(arguments)); };
  S.tag = function (shape, o) {
    for (const pt of flat([shape])) {
      if (o.heat != null) pt.heat = o.heat;
      if (o.glow != null) pt.glow = o.glow;
      if (o.w != null) pt.w = o.w;
      if (o.solid != null) pt.solid = o.solid;
    }
    return shape;
  };
  function shapeArea(shape) {
    let a = 0;
    for (const pt of shape) { patchGrid(pt); a += pt.area * pt.sc * pt.sc * pt.w; }
    return a;
  }

  /* ------------------------------------------------------------------
     4. Sampling a part, and the within-part order (Knothe-Rosenblatt on
        the part's normalised local coordinates: equal-count slabs along
        its main axis, cells along the second, sorted along the third), so
        point i sits at the same relative place of the part in every mode
     ------------------------------------------------------------------ */
  function samplePart(shape, n, R, L, NL, B, GW, SO, TI, TU, TV, off, treadList) {
    if (n <= 0) return;
    let total = 0;
    const pc = new Float64Array(shape.length);
    for (let j = 0; j < shape.length; j++) {
      const pt = shape[j];
      patchGrid(pt);
      total += pt.area * pt.sc * pt.sc * pt.w;
      pc[j] = total;
    }
    if (!(total > 0)) throw new Error("ProMachines: a part has no area");
    let tIdx = null;
    if (TI) tIdx = shape.map((pt) => (pt.k === K_TREAD ? treadList.push(pt) - 1 : -1));
    for (let k = 0; k < n; k++) {
      const s = (k + R()) / n * total;
      let j = 0;
      while (j < shape.length - 1 && s >= pc[j]) j++;
      const pt = shape[j], f2 = pt.sc * pt.sc * pt.w;
      const sl = (s - (j ? pc[j - 1] : 0)) / f2;
      const cum = pt.cum, nc = cum.length;
      let lo = 0, hi = nc - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < sl) lo = mid + 1; else hi = mid; }
      const c0 = lo ? cum[lo - 1] : 0, ca = cum[lo] - c0;
      const fr = ca > 0 ? clamp((sl - c0) / ca, 0, 0.9999) : R();
      const cu = lo % pt.gu, cv = (lo / pt.gu) | 0;
      const u = (cu + fr) / pt.gu, v = (cv + R()) / pt.gv;
      evalPatch(pt, u, v);
      const M = pt.M, x = EV[0], y = EV[1], z = EV[2];
      let nx = M[0] * EV[3] + M[1] * EV[4] + M[2] * EV[5], ny = M[4] * EV[3] + M[5] * EV[4] + M[6] * EV[5], nz = M[8] * EV[3] + M[9] * EV[4] + M[10] * EV[5];
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const jt = (R() - 0.5) * 2 * JITTER, i = off + k;
      L[i * 3] = M[0] * x + M[1] * y + M[2] * z + M[3] + nx * jt;
      L[i * 3 + 1] = M[4] * x + M[5] * y + M[6] * z + M[7] + ny * jt;
      L[i * 3 + 2] = M[8] * x + M[9] * y + M[10] * z + M[11] + nz * jt;
      NL[i * 3] = nx; NL[i * 3 + 1] = ny; NL[i * 3 + 2] = nz;
      B[i] = pt.heat; GW[i] = pt.glow; SO[i] = pt.solid == null ? 1 : pt.solid;
      if (TI) { TI[i] = tIdx[j]; TU[i] = u; TV[i] = v; }
    }
  }
  const SH = 131072; // 2^17: index field of the packed sort keys
  let KEYS = new Float64Array(4096);
  function krOrder(L, off, n, axes, ord) {
    if (KEYS.length < n) KEYS = new Float64Array(n * 2);
    const K = KEYS, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const v = L[(off + i) * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    const sc = [0, 1, 2].map((a) => 1048575 / Math.max(1e-6, mx[a] - mn[a]));
    const key = (j, a) => Math.floor((L[(off + j) * 3 + a] - mn[a]) * sc[a]) * SH + j;
    const a0 = axes[0], a1 = axes[1], a2 = axes[2];
    for (let i = 0; i < n; i++) K[i] = key(i, a0);
    K.subarray(0, n).sort();
    for (let i = 0; i < n; i++) ord[i] = K[i] % SH;
    const n1 = Math.max(1, Math.round(Math.cbrt(n)));
    for (let s = 0; s < n1; s++) {
      const lo = Math.floor(s * n / n1), hi = Math.floor((s + 1) * n / n1);
      for (let i = lo; i < hi; i++) K[i] = key(ord[i], a1);
      K.subarray(lo, hi).sort();
      for (let i = lo; i < hi; i++) ord[i] = K[i] % SH;
      const m = hi - lo, n2 = Math.max(1, Math.round(Math.sqrt(m)));
      for (let c = 0; c < n2; c++) {
        const clo = lo + Math.floor(c * m / n2), chi = lo + Math.floor((c + 1) * m / n2);
        for (let i = clo; i < chi; i++) K[i] = key(ord[i], a2);
        K.subarray(clo, chi).sort();
        for (let i = clo; i < chi; i++) ord[i] = K[i] % SH;
      }
    }
  }
  function permute(arr, stride, off, n, ord, tmp) {
    for (let i = 0; i < n; i++) for (let c = 0; c < stride; c++) tmp[i * stride + c] = arr[(off + ord[i]) * stride + c];
    for (let i = 0; i < n * stride; i++) arr[off * stride + i] = tmp[i];
  }

  /* ------------------------------------------------------------------
     5. Modes, the cycle, the rig
     ------------------------------------------------------------------ */
  const MODES = Object.create(null);
  const MODE_ORDER = [];         // definition order (extras after ORDER)
  const CYCLE = [], NAMES = [];
  const TRANS = Object.create(null);
  let VERSION = 0;
  function rebuildCycle() {
    CYCLE.length = 0; NAMES.length = 0;
    // only the machines of the cycle, in its order (a mode defined under another name is left out)
    const names = ORDER.filter((n) => MODES[n]);
    for (const n of names) { CYCLE.push({ name: n, dwell: MODES[n].dwell }); NAMES.push(n); }
  }
  function defineMode(spec) {
    if (!spec || typeof spec.name !== "string") throw new Error("ProMachines.defineMode: a name is needed");
    const name = spec.name;
    const md = {
      name, spec,
      kind: spec.kind || "vehicle",
      yaw: spec.yaw == null ? (spec.kind === "robot" ? 0.75 : 0.35) : spec.yaw,
      dwell: spec.dwell || DWELL[name] || DURATION.dwell,
      animate: typeof spec.animate === "function" ? spec.animate : null,
      events: (spec.events || []).map((e) => Object.assign({}, e, { pi: pix(e.part) })).sort((a, b) => a.age - b.age),
      exh: (spec.exhaust || []).map((e) => Object.assign({}, e, { pi: pix(e.part) })),
      parts: null, area: null, total: 0,
    };
    if (!MODES[name]) MODE_ORDER.push(name);
    MODES[name] = md;
    if (spec.into) for (const b in spec.into) defineTransform(name, b, spec.into[b]);
    if (spec.from) for (const a in spec.from) defineTransform(a, name, spec.from[a]);
    VERSION++;
    rebuildCycle();
    return md;
  }
  function defineTransform(a, b, spec) {
    TRANS[a + ">" + b] = spec || {};
    VERSION++;
  }
  // Resolve a mode's part entries (lazily, once)
  function resolveMode(md) {
    if (md.parts) return md.parts;
    const raw = typeof md.spec.parts === "function" ? md.spec.parts(S, H) : md.spec.parts;
    if (!raw) throw new Error("ProMachines: mode " + md.name + " has no parts");
    for (const k in raw) if (IX[k] === undefined) throw new Error("ProMachines: mode " + md.name + " has an unknown part " + k);
    const parts = new Array(NP), area = new Float64Array(NP);
    let total = 0;
    for (let p = 0; p < NP; p++) {
      const e = raw[PART_NAMES[p]];
      if (!e || !e.shape) throw new Error("ProMachines: mode " + md.name + " is missing part " + PART_NAMES[p]);
      const R = rot3(e.rot);
      let shape = flat([e.shape]);
      if (e.world) shape = S.place(shape, null, tr3(R));
      const parent = e.parent == null ? -1 : pix(e.parent);
      if (parent === p) throw new Error("ProMachines: part " + PART_NAMES[p] + " is its own parent");
      parts[p] = { shape, R, at: e.at || [0, 0, 0], parent };
      area[p] = shapeArea(shape);
      total += area[p];
    }
    // parents first
    const order = [], state = new Uint8Array(NP);
    const visit = (p) => {
      if (state[p] === 2) return;
      if (state[p] === 1) throw new Error("ProMachines: parent loop at " + PART_NAMES[p] + " in " + md.name);
      state[p] = 1;
      if (parts[p].parent >= 0) visit(parts[p].parent);
      state[p] = 2; order.push(p);
    };
    for (let p = 0; p < NP; p++) visit(p);
    // rest world and parent-relative transforms
    const restW = new Float64Array(NP * 12), restRel = new Float64Array(NP * 12), tmp = new Float64Array(12);
    for (let p = 0; p < NP; p++) restW.set(aFromRT(parts[p].R, parts[p].at), p * 12);
    for (let p = 0; p < NP; p++) {
      const q = parts[p].parent;
      if (q < 0) restRel.set(restW.subarray(p * 12, p * 12 + 12), p * 12);
      else { aInv(restW, q * 12, tmp, 0); aMul(tmp, 0, restW, p * 12, restRel, p * 12); }
    }
    md.parts = parts; md.area = area; md.total = total; md.order = Int16Array.from(order);
    md.restW = restW; md.restRel = restRel;
    md.parent = Int16Array.from(parts.map((e) => e.parent));
    md.hasTread = parts.some((e) => e.shape.some((pt) => pt.k === K_TREAD));
    return parts;
  }
  function definedModes() { return NAMES.map((n) => MODES[n]); }

  const RIGS = new Map();
  function getRig(N) {
    N = N | 0;
    if (!(N > NP * 4)) throw new Error("ProMachines: N too small");
    const key = N + ":" + VERSION;
    let rig = RIGS.get(key);
    if (rig) return rig;
    const modes = definedModes();
    if (!modes.length) throw new Error("ProMachines: no modes defined");
    for (const md of modes) resolveMode(md);
    const w = new Float64Array(NP);
    for (let p = 0; p < NP; p++) for (const md of modes) w[p] = Math.max(w[p], md.area[p] / md.total);
    let W = 0;
    for (let p = 0; p < NP; p++) W += w[p];
    const minc = Math.max(12, Math.round(N * 0.002)), count = new Int32Array(NP);
    const fr = [];
    let used = 0;
    for (let p = 0; p < NP; p++) {
      const x = Math.max(minc, N * w[p] / W);
      count[p] = Math.floor(x); used += count[p]; fr.push([x - count[p], p]);
    }
    fr.sort((a, b) => b[0] - a[0]);
    let k = 0;
    while (used < N) { count[fr[k % NP][1]]++; used++; k++; }
    while (used > N) { // only if the minimum pushed it over
      let big = 0;
      for (let p = 1; p < NP; p++) if (count[p] > count[big]) big = p;
      count[big]--; used--;
    }
    const off = new Int32Array(NP + 1);
    for (let p = 0; p < NP; p++) off[p + 1] = off[p] + count[p];
    rig = {
      N, version: VERSION, count, off, share: w, wsum: W, machines: new Map(),
      sL: new Float32Array(N * 3), sN: new Float32Array(N * 3),           // scrolled tread points
      tA: new Float32Array(N * 3), tHA: new Float32Array(N),              // warp scratch
      spare: null,
    };
    let maxA = 0;
    for (const md of modes) maxA = Math.max(maxA, md.total);
    rig.maxArea = maxA;
    RIGS.set(key, rig);
    return rig;
  }

  /* ------------------------------------------------------------------
     6. Animation: joints, forward kinematics
     ------------------------------------------------------------------ */
  function Anim() {
    this.jq = new Float64Array(NP * 4);
    this.jt = new Float64Array(NP * 3);
    this.glw = new Float32Array(NP);
    this.scr = new Float32Array(NP);
    this.W = new Float64Array(NP * 12);
    this.G = new Float64Array(12);
    this.md = null;
    this.q1 = new Float64Array(8);
    this.m1 = new Float64Array(24);
    this.out3 = [0, 0, 0];
  }
  const AP = Anim.prototype;
  AP.reset = function (md) {
    this.md = md;
    const jq = this.jq;
    for (let p = 0; p < NP; p++) { jq[p * 4] = 0; jq[p * 4 + 1] = 0; jq[p * 4 + 2] = 0; jq[p * 4 + 3] = 1; }
    this.jt.fill(0); this.glw.fill(0); this.scr.fill(0);
    aIdent(this.G, 0);
  };
  AP.rot = function (part, ax, ay, az, a) {
    if (!a) return this;
    const p = pix(part);
    qAxis(ax, ay, az, a, this.q1, 0);
    qMul(this.jq, p * 4, this.q1, 0, this.jq, p * 4);
    return this;
  };
  AP.rx = function (part, a) { return this.rot(part, 1, 0, 0, a); };
  AP.ry = function (part, a) { return this.rot(part, 0, 1, 0, a); };
  AP.rz = function (part, a) { return this.rot(part, 0, 0, 1, a); };
  // turn about a machine-frame axis (as the part sits at rest), through its pivot
  AP.wr = function (part, wx, wy, wz, a) {
    if (!a) return this;
    const p = pix(part), R = this.md.restW, o = p * 12;
    const lx = R[o] * wx + R[o + 4] * wy + R[o + 8] * wz, ly = R[o + 1] * wx + R[o + 5] * wy + R[o + 9] * wz, lz = R[o + 2] * wx + R[o + 6] * wy + R[o + 10] * wz;
    // the joint sits after the rest rotation and any joint turns so far: apply in front of them
    qAxis(lx, ly, lz, a, this.q1, 0);
    qMul(this.q1, 0, this.jq, p * 4, this.jq, p * 4);
    return this;
  };
  AP.move = function (part, dx, dy, dz) {
    const p = pix(part), md = this.md, q = md.parent[p], o = p * 3;
    if (q < 0) { this.jt[o] += dx; this.jt[o + 1] += dy; this.jt[o + 2] += dz; }
    else {
      const R = md.restW, r = q * 12; // into the parent's frame (at rest)
      this.jt[o] += R[r] * dx + R[r + 4] * dy + R[r + 8] * dz;
      this.jt[o + 1] += R[r + 1] * dx + R[r + 5] * dy + R[r + 9] * dz;
      this.jt[o + 2] += R[r + 2] * dx + R[r + 6] * dy + R[r + 10] * dz;
    }
    return this;
  };
  AP.glow = function (part, g) { const p = pix(part); if (g > this.glw[p]) this.glw[p] = g; return this; };
  AP.scroll = function (part, s) { this.scr[pix(part)] += s; return this; };
  AP.turn = function (ax, ay, az, a, px, py, pz) {
    if (!a) return this;
    const m = this.m1;
    qAxis(ax, ay, az, a, this.q1, 0);
    aIdent(m, 0); aSetQ(this.q1, 0, m, 0);
    px = px || 0; py = py || 0; pz = pz || 0;
    m[3] = px - (m[0] * px + m[1] * py + m[2] * pz);
    m[7] = py - (m[4] * px + m[5] * py + m[6] * pz);
    m[11] = pz - (m[8] * px + m[9] * py + m[10] * pz);
    aMul(m, 0, this.G, 0, this.G, 0);
    return this;
  };
  AP.shift = function (dx, dy, dz) { this.G[3] += dx; this.G[7] += dy; this.G[11] += dz; return this; };
  AP.solve = function () {
    const md = this.md, W = this.W, rel = md.restRel, ord = md.order, par = md.parent, m = this.m1;
    for (let k = 0; k < NP; k++) {
      const p = ord[k], o = p * 12;
      // local = T(jt) * restRel * R(jq)
      aIdent(m, 12); aSetQ(this.jq, p * 4, m, 12);
      aMul(rel, o, m, 12, m, 0);
      m[3] += this.jt[p * 3]; m[7] += this.jt[p * 3 + 1]; m[11] += this.jt[p * 3 + 2];
      const q = par[p];
      if (q < 0) aMul(this.G, 0, m, 0, W, o);
      else aMul(W, q * 12, m, 0, W, o);
    }
    return this;
  };
  AP.point = function (part, lx, ly, lz, dx, dy, dz, w) {
    if (!(w > 0)) return this;
    const p = pix(part);
    this.solve();
    const W = this.W, o = p * 12;
    // current world direction of the local axis
    let ax = W[o] * lx + W[o + 1] * ly + W[o + 2] * lz, ay = W[o + 4] * lx + W[o + 5] * ly + W[o + 6] * lz, az = W[o + 8] * lx + W[o + 9] * ly + W[o + 10] * lz;
    const La = Math.hypot(ax, ay, az) || 1, Ld = Math.hypot(dx, dy, dz) || 1;
    ax /= La; ay /= La; az /= La; dx /= Ld; dy /= Ld; dz /= Ld;
    let cx = ay * dz - az * dy, cy = az * dx - ax * dz, cz = ax * dy - ay * dx;
    const s = Math.hypot(cx, cy, cz), c = ax * dx + ay * dy + az * dz;
    let ang = Math.atan2(s, c);
    if (ang < 1e-6) return this;
    if (s < 1e-6) { // opposite: any perpendicular axis
      cx = Math.abs(ax) < 0.9 ? 0 : -ay; cy = Math.abs(ax) < 0.9 ? -az : ax; cz = Math.abs(ax) < 0.9 ? ay : 0;
    }
    ang *= Math.min(1, w);
    // world rotation Q about axis c; joint' = (W_R^T Q W_R) applied after the current joint
    const Lc = Math.hypot(cx, cy, cz) || 1;
    cx /= Lc; cy /= Lc; cz /= Lc;
    const lx2 = W[o] * cx + W[o + 4] * cy + W[o + 8] * cz, ly2 = W[o + 1] * cx + W[o + 5] * cy + W[o + 9] * cz, lz2 = W[o + 2] * cx + W[o + 6] * cy + W[o + 10] * cz;
    qAxis(lx2, ly2, lz2, ang, this.q1, 0);
    qMul(this.jq, p * 4, this.q1, 0, this.jq, p * 4);
    return this;
  };
  AP.pos = function (part, lx, ly, lz) {
    const p = pix(part);
    this.solve();
    const W = this.W, o = p * 12, r = this.out3;
    r[0] = W[o] * lx + W[o + 1] * ly + W[o + 2] * lz + W[o + 3];
    r[1] = W[o + 4] * lx + W[o + 5] * ly + W[o + 6] * lz + W[o + 7];
    r[2] = W[o + 8] * lx + W[o + 9] * ly + W[o + 10] * lz + W[o + 11];
    return r;
  };

  /* ------------------------------------------------------------------
     7. Helpers for mode authors (H)
     ------------------------------------------------------------------ */
  const DEFAULT_AIM = vnorm([-1, 0.22, 0.34]);
  const H = {
    PI, TAU, GROUND, clamp, clamp01, lerp, smooth,
    ease: easeMech,
    euler: euler3, frame: frame3, rot: rot3, norm: vnorm, cross: vcross, dot: vdot,
    // trapezoid envelope: 0 before a, rises to 1 at b, holds, falls to 0 at d
    env(x, a, b, c, d) { return smooth(a, b, x) * (1 - smooth(c, d, x)); },
    // a kick: rises in `attack` s, decays with time constant `decay`
    pulse(dt, attack, decay) {
      if (dt < 0) return 0;
      attack = attack || 0.03; decay = decay || 0.12;
      return dt < attack ? dt / attack : Math.exp(-(dt - attack) / decay);
    },
    aimAngles(aim) {
      const a = aim || DEFAULT_AIM;
      return { az: Math.atan2(a[2], -a[0]), el: Math.asin(clamp(a[1], -1, 1)) };
    },
    // clamp an aim direction to azimuth / elevation limits; writes out (or a new array)
    clampAim(aim, azMin, azMax, elMin, elMax, out) {
      const a = aim || DEFAULT_AIM;
      const az = clamp(Math.atan2(a[2], -a[0]), azMin, azMax), el = clamp(Math.asin(clamp(a[1], -1, 1)), elMin, elMax);
      out = out || [0, 0, 0];
      out[0] = -Math.cos(el) * Math.cos(az); out[1] = Math.sin(el); out[2] = Math.cos(el) * Math.sin(az);
      return out;
    },
    DEFAULT_AIM,
    swapSide,
    // R part from an L part entry: mirrored shape, pivot and rotation, parent swapped
    mirror(e) {
      const R = rot3(e.rot);
      return {
        shape: S.mirror(flat([e.shape])),
        at: [e.at[0], e.at[1], -e.at[2]],
        rot: mul3(MIRZ, mul3(R, MIRZ)),
        parent: e.parent ? swapSide(e.parent) : e.parent,
        world: e.world,
      };
    },
    // joint positions along a chain: start, then [dx, dy, dz, len] per segment (unit dir)
    joints(start, segs) {
      const out = [start.slice()];
      let p = start.slice();
      for (const s of segs) {
        const d = vnorm(s);
        p = [p[0] + d[0] * s[3], p[1] + d[1] * s[3], p[2] + d[2] * s[3]];
        out.push(p);
      }
      return out;
    },
    // a direction at pitch angle a (rot z) from straight down (legs) or along +x (tails)
    down(a) { return [Math.sin(a), -Math.cos(a), 0]; },
    along(a) { return [Math.cos(a), Math.sin(a), 0]; },
  };

  /* ------------------------------------------------------------------
     8. Mode data (sampled points) and the machine object
     ------------------------------------------------------------------ */
  function buildModeData(rig, md, seed) {
    const parts = resolveMode(md), N = rig.N;
    const L = new Float32Array(N * 3), NL = new Float32Array(N * 3), B = new Float32Array(N), GW = new Float32Array(N);
    const SO = new Uint8Array(N);       // 1 where the point blocks the air
    let TI = null, TU = null, TV = null;
    const treadList = [];
    if (md.hasTread) { TI = new Int16Array(N).fill(-1); TU = new Float32Array(N); TV = new Float32Array(N); }
    let maxc = 0;
    for (let p = 0; p < NP; p++) maxc = Math.max(maxc, rig.count[p]);
    const ord = new Int32Array(maxc), tmp = new Float32Array(maxc * 3), tmpI = TI ? new Int16Array(maxc) : null;
    const treadPart = new Uint8Array(NP);
    for (let p = 0; p < NP; p++) {
      const n = rig.count[p], off = rig.off[p];
      const R = rng(hashStr(md.name + "/" + PART_NAMES[p]) ^ Math.imul((seed | 0) + 1, 0x9e3779b1));
      samplePart(parts[p].shape, n, R, L, NL, B, GW, SO, TI, TU, TV, off, treadList);
      krOrder(L, off, n, PART_AXES[p], ord);
      permute(L, 3, off, n, ord, tmp); permute(NL, 3, off, n, ord, tmp);
      permute(B, 1, off, n, ord, tmp); permute(GW, 1, off, n, ord, tmp); permute(SO, 1, off, n, ord, tmp);
      if (TI) {
        permute(TU, 1, off, n, ord, tmp); permute(TV, 1, off, n, ord, tmp);
        for (let i = 0; i < n; i++) tmpI[i] = TI[off + ord[i]];
        for (let i = 0; i < n; i++) TI[off + i] = tmpI[i];
        for (let i = 0; i < n; i++) if (TI[off + i] >= 0) { treadPart[p] = 1; break; }
      }
    }
    return { L, NL, B, GW, SO, TI, TU, TV, treadList, treadPart };
  }
  // local points of a part with its treads rolled by s loops (into the rig scratch)
  function scrolled(rig, d, p, s) {
    const off = rig.off[p], end = rig.off[p + 1], L = d.L, NL = d.NL, sL = rig.sL, sN = rig.sN;
    for (let i = off; i < end; i++) {
      const k = i * 3, ti = d.TI[i];
      if (ti < 0) { sL[k] = L[k]; sL[k + 1] = L[k + 1]; sL[k + 2] = L[k + 2]; sN[k] = NL[k]; sN[k + 1] = NL[k + 1]; sN[k + 2] = NL[k + 2]; continue; }
      const pt = d.treadList[ti];
      evalPatch(pt, d.TU[i] + s, d.TV[i]);
      const M = pt.M, x = EV[0], y = EV[1], z = EV[2];
      sL[k] = M[0] * x + M[1] * y + M[2] * z + M[3]; sL[k + 1] = M[4] * x + M[5] * y + M[6] * z + M[7]; sL[k + 2] = M[8] * x + M[9] * y + M[10] * z + M[11];
      const nx = M[0] * EV[3] + M[1] * EV[4] + M[2] * EV[5], ny = M[4] * EV[3] + M[5] * EV[4] + M[6] * EV[5], nz = M[8] * EV[3] + M[9] * EV[4] + M[10] * EV[5];
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      sN[k] = nx / nl; sN[k + 1] = ny / nl; sN[k + 2] = nz / nl;
    }
  }
  // run a mode's animation for (t, age, aim) and solve its joints
  function evalMode(md, A, t, age, aim) {
    A.reset(md);
    if (md.animate) md.animate(A, t, age, aim || DEFAULT_AIM, H);
    A.solve();
  }
  // world points (and heat) of a whole mode from solved joints
  function emit(rig, d, A, out, outHeat) {
    const W = A.W, off = rig.off, B = d.B, GW = d.GW;
    for (let p = 0; p < NP; p++) {
      let L = d.L, NLp = d.NL;
      if (d.TI && d.treadPart[p] && A.scr[p] !== 0) { scrolled(rig, d, p, A.scr[p]); L = rig.sL; NLp = rig.sN; }
      const o = p * 12;
      const r00 = W[o], r01 = W[o + 1], r02 = W[o + 2], tx = W[o + 3], r10 = W[o + 4], r11 = W[o + 5], r12 = W[o + 6], ty = W[o + 7], r20 = W[o + 8], r21 = W[o + 9], r22 = W[o + 10], tz = W[o + 11];
      const g = A.glw[p], e = off[p + 1];
      if (outHeat) {
        for (let i = off[p]; i < e; i++) {
          const k = i * 3, x = L[k], y = L[k + 1], z = L[k + 2];
          out[k] = r00 * x + r01 * y + r02 * z + tx;
          out[k + 1] = r10 * x + r11 * y + r12 * z + ty;
          out[k + 2] = r20 * x + r21 * y + r22 * z + tz;
          const nx = r00 * NLp[k] + r01 * NLp[k + 1] + r02 * NLp[k + 2];
          const h = (nx < 0 ? 0.22 - nx * (0.40 - 0.33 * nx) : 0.22 + 0.13 * nx) + B[i] + g * GW[i];
          outHeat[i] = h < 0 ? 0 : h > 1 ? 1 : h;
        }
      } else {
        for (let i = off[p]; i < e; i++) {
          const k = i * 3, x = L[k], y = L[k + 1], z = L[k + 2];
          out[k] = r00 * x + r01 * y + r02 * z + tx;
          out[k + 1] = r10 * x + r11 * y + r12 * z + ty;
          out[k + 2] = r20 * x + r21 * y + r22 * z + tz;
        }
      }
    }
  }

  function Machine(rig, md, seed) {
    const d = buildModeData(rig, md, seed), N = rig.N;
    this.name = md.name; this.N = N; this.kind = md.kind; this.yaw = md.yaw; this.dwell = md.dwell;
    this._rig = rig; this._md = md; this._d = d;
    this._A = new Anim(); this._E = new Anim();
    this._t0 = null; this._lastAge = null;
    this.parts = PART_NAMES;
    this.partOffsets = rig.off;
    // rest pose (no animation)
    const A = this._A;
    A.reset(md); A.solve();
    this.base = new Float32Array(N * 3); this.heat = new Float32Array(N); this.normal = new Float32Array(N * 3);
    this.solid = d.SO;      // 1 where the point blocks the air, 0 where the air passes (rotor blur discs)
    emit(rig, d, A, this.base, this.heat);
    const W = A.W;
    for (let p = 0; p < NP; p++) {
      const o = p * 12;
      for (let i = rig.off[p]; i < rig.off[p + 1]; i++) {
        const k = i * 3, a = d.NL[k], b = d.NL[k + 1], c = d.NL[k + 2];
        this.normal[k] = W[o] * a + W[o + 1] * b + W[o + 2] * c;
        this.normal[k + 1] = W[o + 4] * a + W[o + 5] * b + W[o + 6] * c;
        this.normal[k + 2] = W[o + 8] * a + W[o + 9] * b + W[o + 10] * c;
      }
    }
    this.area = md.total;
    this.alpha = clamp(Math.pow(md.total / rig.maxArea, 0.75), 0.4, 1);
    // shots / exhaust scratch (reused, never reallocated per call)
    this._ev = md.events.map(() => ({ type: "", pos: [0, 0, 0], dir: [0, 0, 0], power: 0, age: 0 }));
    this._evOut = [];
    this._ex = md.exh.map((e) => ({
      pos: [0, 0, 0], dir: [0, 0, 0], power: 0, radius: +e.radius > 0 ? +e.radius : 0, swirl: +e.swirl || 0,
      speed: +e.speed > 0 ? +e.speed : 0, nozzle: +e.nozzle > 0 ? +e.nozzle : 0, heat: e.heat == null ? null : +e.heat,
    }));
    this._exOut = this._ex.slice();
  }
  const MP = Machine.prototype;
  MP.pose = function (t, out, age, outHeat, aim) {
    age = age || 0;
    this._t0 = t - age; this._lastAge = age;
    evalMode(this._md, this._A, t, age, aim);
    emit(this._rig, this._d, this._A, out, outHeat);
    return out;
  };
  function xform(W, o, v, out, dirOnly) {
    out[0] = W[o] * v[0] + W[o + 1] * v[1] + W[o + 2] * v[2] + (dirOnly ? 0 : W[o + 3]);
    out[1] = W[o + 4] * v[0] + W[o + 5] * v[1] + W[o + 6] * v[2] + (dirOnly ? 0 : W[o + 7]);
    out[2] = W[o + 8] * v[0] + W[o + 9] * v[1] + W[o + 10] * v[2] + (dirOnly ? 0 : W[o + 11]);
    if (dirOnly) { const L = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= L; out[1] /= L; out[2] /= L; }
    return out;
  }
  MP.shots = function (age0, age1, aim) {
    const md = this._md;
    if (typeof md.spec.shots === "function") return md.spec.shots(age0, age1, aim || DEFAULT_AIM, { machine: this, H }) || EMPTY;
    const evs = md.events;
    if (!evs.length || !(age1 > age0)) return EMPTY;
    let k = 0;
    const out = this._evOut;
    out.length = 0;
    for (let j = 0; j < evs.length; j++) {
      const ev = evs[j];
      if (!(ev.age > age0 && ev.age <= age1)) continue;
      const E = this._E, t = this._t0 == null ? ev.age : this._t0 + ev.age;
      evalMode(md, E, t, ev.age, aim);
      const o = ev.pi * 12, r = this._ev[j];
      r.type = ev.type; r.power = ev.power == null ? 1 : ev.power; r.age = ev.age;
      xform(E.W, o, ev.at || [0, 0, 0], r.pos, false);
      if (ev.dir === "aim") { const a = aim || DEFAULT_AIM; r.dir[0] = a[0]; r.dir[1] = a[1]; r.dir[2] = a[2]; }
      else xform(E.W, o, ev.dir || [-1, 0, 0], r.dir, true);
      out.push(r); k++;
    }
    return k ? out : EMPTY;
  };
  MP.exhaust = function (age) {
    const md = this._md;
    if (!md.exh.length) return EMPTY;
    let A = this._A;
    if (this._lastAge !== age) { A = this._E; evalMode(md, A, this._t0 == null ? age : this._t0 + age, age, null); }
    const t = this._t0 == null ? age : this._t0 + age;
    for (let j = 0; j < md.exh.length; j++) {
      const e = md.exh[j], r = this._ex[j], o = e.pi * 12;
      xform(A.W, o, e.at || [0, 0, 0], r.pos, false);
      xform(A.W, o, e.dir || [1, 0, 0], r.dir, true);
      r.power = typeof e.power === "function" ? e.power(age, t) : (e.power == null ? 1 : e.power);
    }
    return this._exOut;
  };

  function make(name, N, seed) {
    const md = MODES[name];
    if (!md) throw new Error("ProMachines: unknown mode " + name);
    const rig = getRig(N);
    const key = name + ":" + (seed == null ? 1 : seed);
    let m = rig.machines.get(key);
    if (!m) { m = new Machine(rig, md, seed == null ? 1 : seed); rig.machines.set(key, m); }
    return m;
  }

  /* ------------------------------------------------------------------
     9. The blend engine (choreography, waypoints, slerp, glow, warp)
     ------------------------------------------------------------------ */
  // default windows by group
  function defaultWindow(p) {
    const g = PART_GROUP[p], n = PART_NAMES[p], jit = (hash01(p * 7 + 3) - 0.5) * 0.04;
    if (g === "plate") { const k = ["back1", "back2", "back3", "flankL", "flankR", "scapL", "scapR", "haunchL", "haunchR"].indexOf(n); return [0.0 + 0.025 * k + jit, 0.66 + 0.025 * k + jit]; }
    if (g === "mane") { const k = ["maneL1", "maneR1", "maneL2", "maneR2", "maneL3", "maneR3"].indexOf(n); return [0.06 + 0.035 * k, 0.70 + 0.035 * k]; }
    if (g === "core") { const k = ["chest", "belly", "hips"].indexOf(n); return [0.10 + 0.03 * k, 0.62 + 0.03 * k]; }
    if (g === "limb") {
      const seg = n.slice(3), hind = n[0] === "h" ? 0.03 : 0, right = n[1] === "r" ? 0.015 : 0;
      const s = seg === "up" ? 0.18 : seg === "lo" ? 0.24 : 0.30;
      return [s + hind + right, s + 0.5 + hind + right];
    }
    if (g === "tail") { const k = +n[4] - 1; return [0.26 + 0.04 * k, 0.76 + 0.04 * k]; }
    if (n === "head") return [0.34, 0.86];
    if (n === "jaw") return [0.36, 0.88];
    return [0.46, 0.98]; // neck
  }
  const LIFT = { plate: 1.0, mane: 0.9, core: 0.12, limb: 0.45, tail: 0.6, head: 0.35 };

  const CHOREO = new Map();
  function compileMoves(list) {
    return (list || []).map((mv) => {
      const mask = new Uint8Array(NP);
      if (mv.parts) for (const n of mv.parts) mask[pix(n)] = 1;
      else mask.fill(1);
      if (mv.except) for (const n of mv.except) mask[pix(n)] = 0;
      const q = new Float64Array(4);
      const R = rot3(mv.rot || [0, 0, 0]);
      qFromA(aFromRT(R, null), 0, q, 0);
      return { mask, from: mv.from || 0, to: mv.to == null ? 1 : mv.to, about: mv.about || [0, 0, 0], move: mv.move || [0, 0, 0], q, ease: mv.ease === "smooth" ? "smooth" : "mech" };
    });
  }
  function getChoreo(ma, mb) {
    const key = ma.name + ">" + mb.name;
    let C = CHOREO.get(key);
    if (C && C.version === VERSION) return C;
    const spec = TRANS[key] || {};
    resolveMode(ma); resolveMode(mb);
    C = {
      version: VERSION, spec,
      style: spec.style || "mech",
      time: spec.time || (spec.style === "warp" ? 1.6 : DURATION.transform),
      glow: spec.glow == null ? 1 : spec.glow,
      ws: new Float32Array(NP), we: new Float32Array(NP), via: new Float32Array(NP * 3), hasVia: new Uint8Array(NP),
      lift: new Float32Array(NP), spin: new Float32Array(NP * 4), mS: new Float32Array(NP), mE: new Float32Array(NP),
      link: new Int16Array(NP), order: null,
      pre: compileMoves(spec.pre), post: compileMoves(spec.post),
      // reference orientations (rest poses): which way each part turns is fixed by them,
      // so the slerp never flips to the other side between two frames
      qra: new Float64Array(NP * 4), qrb: new Float64Array(NP * 4), srel: new Int8Array(NP),
    };
    for (let p = 0; p < NP; p++) {
      const n = PART_NAMES[p];
      let w = defaultWindow(p);
      if (spec.delay && spec.delay[n] != null) w = [w[0] + spec.delay[n], w[1] + spec.delay[n]];
      if (spec.win && spec.win[n]) w = spec.win[n];
      C.ws[p] = clamp(w[0], 0, 0.98); C.we[p] = clamp(Math.max(w[1], C.ws[p] + 0.02), 0.02, 1);
      C.lift[p] = LIFT[PART_GROUP[p]] * (spec.lift && spec.lift[n] != null ? spec.lift[n] : 1);
      if (spec.via && spec.via[n]) { C.via.set(spec.via[n], p * 3); C.hasVia[p] = 1; }
      if (spec.spin && spec.spin[n]) C.spin.set(spec.spin[n], p * 4);
      const mo = (spec.morph && spec.morph[n]) || [0.08, 0.7];
      C.mS[p] = mo[0]; C.mE[p] = mo[1];
      // linked if the parent is the same in both modes
      let l = ma.parent[p] >= 0 && ma.parent[p] === mb.parent[p] ? ma.parent[p] : -1;
      if (spec.link && n in spec.link) l = spec.link[n] == null ? -1 : pix(spec.link[n]);
      C.link[p] = l;
    }
    // processing order: linked parts after their link parents
    const ord = [], st = new Uint8Array(NP);
    const visit = (p) => {
      if (st[p] === 2) return;
      if (st[p] === 1) { C.link[p] = -1; return; }
      st[p] = 1;
      if (C.link[p] >= 0) visit(C.link[p]);
      st[p] = 2; ord.push(p);
    };
    for (let p = 0; p < NP; p++) visit(p);
    C.order = Int16Array.from(ord);
    const tmp = new Float64Array(36);
    for (let p = 0; p < NP; p++) {
      const l = C.link[p];
      if (l < 0) { qFromA(ma.restW, p * 12, C.qra, p * 4); qFromA(mb.restW, p * 12, C.qrb, p * 4); }
      else {
        aInv(ma.restW, l * 12, tmp, 0); aMul(tmp, 0, ma.restW, p * 12, tmp, 12); qFromA(tmp, 12, C.qra, p * 4);
        aInv(mb.restW, l * 12, tmp, 0); aMul(tmp, 0, mb.restW, p * 12, tmp, 12); qFromA(tmp, 12, C.qrb, p * 4);
      }
      const d = C.qra[p * 4] * C.qrb[p * 4] + C.qra[p * 4 + 1] * C.qrb[p * 4 + 1] + C.qra[p * 4 + 2] * C.qrb[p * 4 + 2] + C.qra[p * 4 + 3] * C.qrb[p * 4 + 3];
      C.srel[p] = d < 0 ? -1 : 1;
    }
    CHOREO.set(key, C);
    return C;
  }
  function transformTime(a, b) {
    const ma = MODES[a], mb = MODES[b];
    if (!ma || !mb) return DURATION.transform;
    const spec = TRANS[a + ">" + b];
    if (spec && spec.time) return spec.time;
    if (spec && spec.style === "warp") return 1.6;
    return DURATION.transform;
  }

  // scratch for the blend (one set; blend is not re-entrant)
  const BS = {
    WA: null, WB: null, BW: new Float64Array(NP * 12), qa: new Float64Array(4), qb: new Float64Array(4), q: new Float64Array(4),
    qs: new Float64Array(4), m: new Float64Array(36), x: new Float32Array(NP), e: new Float32Array(NP), mo: new Float32Array(NP),
    g: new Float32Array(NP), gd: new Float32Array(NP), spare: null,
  };
  function applyMoves(list, W, u, fade) {
    const m = BS.m, q = BS.qs;
    for (const mv of list) {
      const x = clamp01((u - mv.from) / Math.max(1e-6, mv.to - mv.from));
      let w = mv.ease === "smooth" ? x * x * (3 - 2 * x) : easeMech(x);
      if (fade) w = 1 - w;
      if (w === 0) continue;
      // M = T(about + move*w) * R(slerp(I, q, w)) * T(-about)
      BS.qa[0] = 0; BS.qa[1] = 0; BS.qa[2] = 0; BS.qa[3] = 1;
      qSlerp(BS.qa, 0, mv.q, 0, w, q, 0);
      aIdent(m, 0); aSetQ(q, 0, m, 0);
      const ax = mv.about[0], ay = mv.about[1], az = mv.about[2];
      m[3] = ax + mv.move[0] * w - (m[0] * ax + m[1] * ay + m[2] * az);
      m[7] = ay + mv.move[1] * w - (m[4] * ax + m[5] * ay + m[6] * az);
      m[11] = az + mv.move[2] * w - (m[8] * ax + m[9] * ay + m[10] * az);
      for (let p = 0; p < NP; p++) if (mv.mask[p]) aMul(m, 0, W, p * 12, W, p * 12);
    }
  }

  // put qa, qb on the sides of their reference orientations, and qb on the side
  // the references chose: the turn is then the same every frame
  function alignQ(qa, qb, C, p) {
    const o = p * 4, ra = C.qra, rb = C.qrb;
    if (qa[0] * ra[o] + qa[1] * ra[o + 1] + qa[2] * ra[o + 2] + qa[3] * ra[o + 3] < 0) { qa[0] = -qa[0]; qa[1] = -qa[1]; qa[2] = -qa[2]; qa[3] = -qa[3]; }
    let sb = qb[0] * rb[o] + qb[1] * rb[o + 1] + qb[2] * rb[o + 2] + qb[3] * rb[o + 3] < 0 ? -1 : 1;
    sb *= C.srel[p];
    if (sb < 0) { qb[0] = -qb[0]; qb[1] = -qb[1]; qb[2] = -qb[2]; qb[3] = -qb[3]; }
  }
  function blend(a, b, u, t, out, outHeat, aim) {
    if (!(u > 0)) return a.pose(t, out, a.dwell, outHeat, aim);
    if (u >= 1) return b.pose(t, out, 0, outHeat, aim);
    const rig = a._rig;
    if (b._rig !== rig) return b.pose(t, out, 0, outHeat, aim);
    const ma = a._md, mb = b._md, C = getChoreo(ma, mb), T = C.time;
    if (C.style === "warp") return warp(a, b, u, t, out, outHeat, aim, C);
    const AA = a._A;
    let AB = b._A;
    if (a === b) { AB = BS.spare || (BS.spare = new Anim()); }
    evalMode(ma, AA, t, a.dwell + u * T, aim);
    evalMode(mb, AB, t, -(1 - u) * T, aim);
    const WA = AA.W, WB = AB.W;
    if (C.pre.length) applyMoves(C.pre, WA, u, false);
    if (C.post.length) applyMoves(C.post, WB, u, true);
    // the body centre (for automatic waypoints)
    let cx = 0, cy = 0, cz = 0;
    for (let p = 0; p < 3; p++) { cx += WA[p * 12 + 3] + WB[p * 12 + 3]; cy += WA[p * 12 + 7] + WB[p * 12 + 7]; cz += WA[p * 12 + 11] + WB[p * 12 + 11]; }
    cx /= 6; cy /= 6; cz /= 6;
    const BW = BS.BW, m = BS.m, qa = BS.qa, qb = BS.qb, q = BS.q;
    for (let k = 0; k < NP; k++) {
      const p = C.order[k], o = p * 12;
      const x = clamp01((u - C.ws[p]) / (C.we[p] - C.ws[p])), e = easeMech(x);
      BS.x[p] = x; BS.e[p] = e;
      const ms = C.mS[p], me = C.mE[p];
      BS.mo[p] = x <= ms ? 0 : x >= me ? 1 : smooth(ms, me, x);
      BS.g[p] = glowCurve(x) * C.glow;
      BS.gd[p] = AA.glw[p] + (AB.glw[p] - AA.glw[p]) * clamp01(e);
      const l = C.link[p];
      if (l < 0) {
        if (x <= 0) { BW.set(WA.subarray(o, o + 12), o); continue; }
        if (x >= 1) { BW.set(WB.subarray(o, o + 12), o); continue; }
        qFromA(WA, o, qa, 0); qFromA(WB, o, qb, 0);
        alignQ(qa, qb, C, p);
        qSlerp(qa, 0, qb, 0, e, q, 0, true);
        const sp = p * 4;
        if (C.spin[sp + 3]) {
          const sx = clamp01(x / 0.85);
          qAxis(C.spin[sp], C.spin[sp + 1], C.spin[sp + 2], C.spin[sp + 3] * TAU * sx * sx * (3 - 2 * sx), BS.qs, 0);
          qMul(BS.qs, 0, q, 0, q, 0);
        }
        aSetQ(q, 0, BW, o);
        // path: quadratic through the waypoint W at the middle
        const ax = WA[o + 3], ay = WA[o + 7], az = WA[o + 11], bx = WB[o + 3], by = WB[o + 7], bz = WB[o + 11];
        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
        let wx, wy, wz;
        if (C.hasVia[p]) { wx = mx + C.via[p * 3]; wy = my + C.via[p * 3 + 1]; wz = mz + C.via[p * 3 + 2]; }
        else {
          const dist = Math.hypot(bx - ax, by - ay, bz - az);
          let dx = mx - cx, dy = (my - cy) * 0.6 + 0.12, dz = (mz - cz) * 1.6;
          const dl = Math.hypot(dx, dy, dz) || 1;
          const amt = C.lift[p] * Math.min(0.9, 0.1 + 0.32 * dist);
          wx = mx + dx / dl * amt; wy = my + dy / dl * amt; wz = mz + dz / dl * amt;
        }
        const ccx = 2 * wx - mx, ccy = 2 * wy - my, ccz = 2 * wz - mz;
        const i0 = (1 - e) * (1 - e), i1 = 2 * (1 - e) * e, i2 = e * e;
        BW[o + 3] = i0 * ax + i1 * ccx + i2 * bx;
        BW[o + 7] = i0 * ay + i1 * ccy + i2 * by;
        BW[o + 11] = i0 * az + i1 * ccz + i2 * bz;
      } else {
        // linked: interpolate the pose relative to the link parent, ride on it
        const lo = l * 12;
        aInv(WA, lo, m, 0); aMul(m, 0, WA, o, m, 12);   // relA
        aInv(WB, lo, m, 0); aMul(m, 0, WB, o, m, 24);   // relB
        qFromA(m, 12, qa, 0); qFromA(m, 24, qb, 0);
        alignQ(qa, qb, C, p);
        qSlerp(qa, 0, qb, 0, e, q, 0, true);
        aIdent(m, 0); aSetQ(q, 0, m, 0);
        m[3] = m[15] + (m[27] - m[15]) * e; m[7] = m[19] + (m[31] - m[19]) * e; m[11] = m[23] + (m[35] - m[23]) * e;
        aMul(BW, lo, m, 0, BW, o);
      }
    }
    // points
    const da = a._d, db = b._d, off = rig.off;
    for (let p = 0; p < NP; p++) {
      const o = p * 12, mo = BS.mo[p], gt = BS.g[p], gd = BS.gd[p];
      const r00 = BW[o], r01 = BW[o + 1], r02 = BW[o + 2], tx = BW[o + 3], r10 = BW[o + 4], r11 = BW[o + 5], r12 = BW[o + 6], ty = BW[o + 7], r20 = BW[o + 8], r21 = BW[o + 9], r22 = BW[o + 10], tz = BW[o + 11];
      const i0 = off[p], i1 = off[p + 1];
      if (mo <= 0 || mo >= 1) {
        const d = mo <= 0 ? da : db, Am = mo <= 0 ? AA : AB;
        let L = d.L, NL = d.NL;
        if (d.TI && d.treadPart[p] && Am.scr[p] !== 0) { scrolled(rig, d, p, Am.scr[p]); L = rig.sL; NL = rig.sN; }
        const B = d.B, GW = d.GW;
        for (let i = i0; i < i1; i++) {
          const k = i * 3, x = L[k], y = L[k + 1], z = L[k + 2];
          out[k] = r00 * x + r01 * y + r02 * z + tx;
          out[k + 1] = r10 * x + r11 * y + r12 * z + ty;
          out[k + 2] = r20 * x + r21 * y + r22 * z + tz;
          if (outHeat) {
            const nx = r00 * NL[k] + r01 * NL[k + 1] + r02 * NL[k + 2];
            let h = (nx < 0 ? 0.22 - nx * (0.40 - 0.33 * nx) : 0.22 + 0.13 * nx) + B[i] + gd * GW[i];
            h = h < 0 ? 0 : h > 1 ? 1 : h;
            outHeat[i] = h + (1 - h) * (gt > 1 ? 1 : gt);
          }
        }
      } else {
        let LA = da.L, NA = da.NL, LB = db.L, NB = db.NL;
        if (da.TI && da.treadPart[p] && AA.scr[p] !== 0) { scrolled(rig, da, p, AA.scr[p]); LA = rig.sL; NA = rig.sN; }
        if (db.TI && db.treadPart[p] && AB.scr[p] !== 0) {
          // the A side may already use the scratch: copy it first
          if (LA === rig.sL) { LA = rig.tA.subarray(0); for (let i = i0 * 3; i < i1 * 3; i++) LA[i] = rig.sL[i]; NA = da.NL; }
          scrolled(rig, db, p, AB.scr[p]); LB = rig.sL; NB = rig.sN;
        }
        const BA = da.B, BB = db.B, GA = da.GW, GB = db.GW, im = 1 - mo;
        for (let i = i0; i < i1; i++) {
          const k = i * 3;
          const x = LA[k] * im + LB[k] * mo, y = LA[k + 1] * im + LB[k + 1] * mo, z = LA[k + 2] * im + LB[k + 2] * mo;
          out[k] = r00 * x + r01 * y + r02 * z + tx;
          out[k + 1] = r10 * x + r11 * y + r12 * z + ty;
          out[k + 2] = r20 * x + r21 * y + r22 * z + tz;
          if (outHeat) {
            const nx = r00 * (NA[k] * im + NB[k] * mo) + r01 * (NA[k + 1] * im + NB[k + 1] * mo) + r02 * (NA[k + 2] * im + NB[k + 2] * mo);
            let h = (nx < 0 ? 0.22 - nx * (0.40 - 0.33 * nx) : 0.22 + 0.13 * nx) + BA[i] * im + BB[i] * mo + gd * (GA[i] * im + GB[i] * mo);
            h = h < 0 ? 0 : h > 1 ? 1 : h;
            outHeat[i] = h + (1 - h) * (gt > 1 ? 1 : gt);
          }
        }
      }
    }
    return out;
  }

  // The warp: the ship stretches and streaks away to -x, then the particles
  // come back as speed lines and the next mode forms out of them, already moving.
  function warp(a, b, u, t, out, outHeat, aim, C) {
    const rig = a._rig, N = rig.N, T = C.time, PA = rig.tA, HA = rig.tHA;
    a.pose(t, PA, a.dwell + u * T, HA, aim);
    b.pose(t, out, -(1 - u) * T, outHeat, aim);
    let xmin = 1e9, xmax = -1e9;
    const base = a.base;
    for (let i = 0; i < N; i += 7) { const x = base[i * 3]; if (x < xmin) xmin = x; if (x > xmax) xmax = x; }
    const span = Math.max(0.5, xmax - xmin);
    for (let i = 0; i < N; i++) {
      const k = i * 3, r1 = hash01(i * 3 + 1), r2 = hash01(i * 3 + 2);
      const ax = PA[k], ay = PA[k + 1], az = PA[k + 2];
      const delay = 0.14 * clamp01((ax - xmin) / span) + 0.03 * r1;
      const pd = clamp01((u - delay) / 0.3);
      const pa = clamp01((u - (0.44 + 0.16 * r1)) / 0.4);
      if (pa <= 0) {
        // departing: accelerate forward, squeeze into a streak
        const s = pd * pd * Math.sqrt(pd);
        out[k] = ax - 8.5 * s - 0.6 * pd * (ax - xmin);
        out[k + 1] = ay + (0.0 - ay) * 0.5 * pd;
        out[k + 2] = az * (1 - 0.6 * pd);
        if (outHeat) outHeat[i] = HA[i] + (1 - HA[i]) * pd;
      } else {
        // arriving: speed lines in the lanes of the new shape, closing in
        const ea = 1 - (1 - pa) * (1 - pa) * (1 - pa);
        const lag = (1 - ea) * (6 + 4 * r2);
        out[k] -= lag;
        out[k + 1] += (1 - ea) * (r2 - 0.5) * 0.06;
        if (outHeat) { const h = outHeat[i]; outHeat[i] = 0.12 + (h - 0.12) * ea * ea; }
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------
     10. Report: area share and density of every part in every mode
     ------------------------------------------------------------------ */
  function report(N) {
    const rig = getRig(N || 64000), rows = [];
    for (const md of definedModes()) {
      for (let p = 0; p < NP; p++) {
        const share = md.area[p] / md.total, dens = (rig.count[p] / rig.N) / share * (rig.wsum ? 1 / rig.wsum : 1);
        rows.push({ mode: md.name, part: PART_NAMES[p], area: +md.area[p].toFixed(4), share: +share.toFixed(4), count: rig.count[p], density: +(rig.share[p] / share).toFixed(2) });
      }
    }
    return { N: rig.N, totals: definedModes().map((md) => ({ mode: md.name, area: +md.total.toFixed(3) })), rows };
  }

  /* ==================================================================
     11. THE MODES live in their own files, which load after this one:
         machines-cars.js    hypercar, f1
         machines-ground.js  tank, helicopter
         machines-sky.js     bomber, starship
     (Examples of complete mode specs from an earlier design, a leopard, a
     lion and a robot, are kept outside the site for reference.)
     ================================================================== */

  /* ------------------------------------------------------------------
     13. Export
     ------------------------------------------------------------------ */
  const API = {
    CYCLE, NAMES, DURATION,
    transformTime, make, blend, defineMode, defineTransform,
    S, H, GROUND, PARTS: PART_NAMES.slice(), GROUPS: PART_GROUP.slice(),
    report,
    get version() { return VERSION; },
    _rig: getRig, _modes: MODES, _trans: TRANS,
  };
  G.ProMachines = API;
})(typeof window !== "undefined" ? window : globalThis);

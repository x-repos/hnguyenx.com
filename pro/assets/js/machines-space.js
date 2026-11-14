/* =====================================================================
   machines-space.js: the spaceship of the ProMachines cycle (machines.js
   holds the framework; machines-sky.js the fighter). Being built: a ship
   shaped like SpaceX's Starship upper stage, from its real dimensions.
   Plain browser script; loads after machines-sky.js (also in Node).
   No brand marks: no logos, flags, numbers or names on any machine.
   ===================================================================== */
(function (G) {
  "use strict";
  const PM = G.ProMachines;
  if (!PM || typeof PM.defineMode !== "function") return;
})(typeof window !== "undefined" ? window : globalThis);

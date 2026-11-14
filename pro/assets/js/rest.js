/* =========================================================
   Pro Mode — the scripts the wind tunnel does not need.
   The page loads three.js, the machines, the air and the intro first,
   so the tunnel starts as soon as they arrive. This file runs once those
   files are in, and only then fetches the rest: GSAP and ScrollTrigger,
   Lenis, home.js (the page turn and the pages below the tunnel) and
   KaTeX last, since only the equations need it. They run in this order;
   one that fails to load is skipped, and home.js then shows the page
   without its animations. If three.js itself did not load, that still
   page is all there is to show, so only home.js is fetched.
   KaTeX's arrival is announced with a "pro:katex" event: intro.js and
   home.js typeset their equations then.
   ========================================================= */
(function () {
  "use strict";
  var CDN = "https://cdn.jsdelivr.net/npm/";
  var HOME = ["assets/js/home.js?v=46"];
  var LIST = window.THREE ? [
    [CDN + "gsap@3.12.5/dist/gsap.min.js", "sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt"],
    [CDN + "gsap@3.12.5/dist/ScrollTrigger.min.js", "sha384-Z3REaz79l2IaAZqJsSABtTbhjgOUYyV3p90XNnAPCSHg3EMTz1fouunq9WZRtj3d"],
    [CDN + "lenis@1.1.13/dist/lenis.min.js", "sha384-B2WBjDzEjJpYvhmi2UyEn7rektqkf5suS6sNoyyrf0EBAwBHdkiXxIlU0V5Ru2ed"],
    HOME,
    [CDN + "katex@0.16.9/dist/katex.min.js", "sha384-XjKyOOlGwcjNTAIQHIpgOno0Hl1YQqzUOEleOLALmuqehneUG+vnGctmUb0ZY0l8", "pro:katex"],
  ] : [HOME];
  LIST.forEach(function (item) {
    var s = document.createElement("script");
    s.src = item[0];
    s.async = false;                       // scripts added this way then run in the order added
    if (item[1]) { s.integrity = item[1]; s.crossOrigin = "anonymous"; }
    if (item[2]) s.onload = function () { document.dispatchEvent(new Event(item[2])); };
    document.body.appendChild(s);
  });
})();

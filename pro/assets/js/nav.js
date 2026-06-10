/* ============================================================
   Language toggle — EN / VI, persisted in localStorage.
   Runs immediately (not on DOMContentLoaded) so the right language
   is applied before the first paint, avoiding a flash.
   ============================================================ */
(function () {
  const KEY = "site-lang";
  function applyLang(lang) {
    if (lang !== "en" && lang !== "vi") lang = "en";
    document.documentElement.setAttribute("lang", lang);
    try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ }
    document.querySelectorAll(".lang-switch__btn").forEach(function (btn) {
      const isActive = btn.getAttribute("data-lang") === lang;
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    document.dispatchEvent(new CustomEvent("site:langchange", { detail: lang }));
  }
  // Apply ASAP (before DOM ready) — but only if the <html> attribute exists.
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "vi") {
      document.documentElement.setAttribute("lang", saved);
    }
  } catch (e) { /* ignore */ }

  document.addEventListener("DOMContentLoaded", function () {
    let saved = "en";
    try { saved = localStorage.getItem(KEY) || "en"; } catch (e) { /* ignore */ }
    applyLang(saved);
    document.querySelectorAll(".lang-switch__btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        applyLang(btn.getAttribute("data-lang"));
      });
    });
  });
})();

/* Tiny hamburger-menu toggle shared across all layouts. */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const toggles = document.querySelectorAll(".nav-toggle");
    toggles.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const nav = btn.closest("nav");
        if (!nav) return;
        const open = nav.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });

    // Close the menu when a link inside it is tapped (so the dropdown
    // doesn't hang around after navigating to a hash on the same page).
    document.querySelectorAll("nav.home-topnav a, nav.site-nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        const nav = a.closest("nav");
        if (nav && nav.classList.contains("is-open")) {
          nav.classList.remove("is-open");
          const btn = nav.querySelector(".nav-toggle");
          if (btn) btn.setAttribute("aria-expanded", "false");
        }
      });
    });
  });
})();

/* ============================================================
   Hero portrait flip — click the avatar to spin to the alt image.
   ============================================================ */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const flip = document.querySelector(".hero-portrait-flip");
    if (!flip) return;

    flip.addEventListener("click", function () {
      // Lazy-load the back image the first time we flip. Keeping it
      // out of the initial HTML stops social scrapers (Facebook,
      // iMessage, etc.) from ever seeing it as a share-preview
      // candidate — they only see the og:image.
      const back = flip.querySelector(".hero-portrait--back");
      if (back && back.dataset.src && back.src.startsWith("data:")) {
        back.src = back.dataset.src;
      }
      const pressed = flip.getAttribute("aria-pressed") === "true";
      flip.setAttribute("aria-pressed", pressed ? "false" : "true");
    });
  });
})();

/* ============================================================
   Ben10 reveal — click the "Ben10" word in the hero, watch the
   Omnitrix flash, get the explanation that it's just a nickname.
   ============================================================ */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const trigger = document.querySelector(".hero-ben10");
    if (!trigger) return;

    trigger.addEventListener("click", openOmni);
    trigger.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openOmni();
      }
    });
  });

  function openOmni() {
    if (!document.getElementById("omni-styles")) {
      const style = document.createElement("style");
      style.id = "omni-styles";
      style.textContent = `
        .omni-overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 28px;
          padding: 48px 24px;
          background: radial-gradient(ellipse at center, rgba(0,32,0,0.35) 0%, rgba(0,0,0,0.95) 70%);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .omni-overlay.is-open { opacity: 1; }
        .omni-flash {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(circle at center, rgba(127,255,127,0.55) 0%, rgba(127,255,127,0) 35%);
          opacity: 0;
        }
        .omni-overlay.is-open .omni-flash { animation: omni-flash 0.7s ease-out; }
        @keyframes omni-flash {
          0%   { opacity: 0; transform: scale(0.4); }
          25%  { opacity: 1; transform: scale(1.0); }
          100% { opacity: 0; transform: scale(1.7); }
        }
        .omnitrix {
          width: clamp(160px, 30vw, 220px);
          height: clamp(160px, 30vw, 220px);
          filter: drop-shadow(0 0 22px rgba(127,255,127,0.55));
          transform: scale(0.25) rotate(-40deg);
          opacity: 0;
          transition: transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
                      opacity 0.5s ease;
          overflow: visible;
        }
        .omnitrix * { transform-box: fill-box; }
        .omni-overlay.is-open .omnitrix {
          transform: scale(1) rotate(0);
          opacity: 1;
          animation: omni-pulse 2.4s ease-in-out infinite 0.8s;
        }
        @keyframes omni-pulse {
          0%, 100% { filter: drop-shadow(0 0 22px rgba(127,255,127,0.55)); }
          50%      { filter: drop-shadow(0 0 42px rgba(127,255,127,0.85)); }
        }

        /* Hourglass: subtle wobble + colour cycle through alien colours on entry */
        .omni-hourglass-group {
          transform-origin: 100px 100px;
          transform-box: view-box;
          animation: omni-wobble 5s ease-in-out 2.5s infinite;
        }
        .omni-hourglass    { fill: #7fff7f; }
        .omni-hourglass-hl { fill: #b6ffb6; }
        .omni-overlay.is-open .omni-hourglass    { animation: omni-hg-color    1.6s ease-out 0.8s 1 forwards; }
        .omni-overlay.is-open .omni-hourglass-hl { animation: omni-hg-color-hl 1.6s ease-out 0.8s 1 forwards; }
        @keyframes omni-hg-color {
          0%   { fill: #7fff7f; }   /* green   — default Omnitrix */
          18%  { fill: #ff5e5e; }   /* red     — Heatblast / Four Arms */
          36%  { fill: #ffa726; }   /* orange  — Wildmutt */
          54%  { fill: #6cc7ff; }   /* blue    — XLR8 / Ripjaws */
          72%  { fill: #fff45e; }   /* yellow  — Stinkfly */
          100% { fill: #7fff7f; }   /* back to green */
        }
        @keyframes omni-hg-color-hl {
          0%   { fill: #b6ffb6; }
          18%  { fill: #ffb6b6; }
          36%  { fill: #ffd690; }
          54%  { fill: #b6e0ff; }
          72%  { fill: #fffbb6; }
          100% { fill: #b6ffb6; }
        }
        @keyframes omni-wobble {
          0%, 100% { transform: rotate(-3deg); }
          50%      { transform: rotate(3deg); }
        }

        /* Orbiting sparks */
        .omni-spark { transform-origin: 100px 100px; transform-box: view-box; }
        .omni-spark--1 { animation: omni-spark-orbit 5.0s linear infinite; }
        .omni-spark--2 { animation: omni-spark-orbit 6.5s linear infinite reverse; animation-delay: -1.0s; }
        .omni-spark--3 { animation: omni-spark-orbit 4.2s linear infinite; animation-delay: -2.0s; }
        .omni-spark--4 { animation: omni-spark-orbit 5.5s linear infinite reverse; animation-delay: -0.5s; }
        .omni-spark--5 { animation: omni-spark-orbit 7.0s linear infinite; animation-delay: -3.0s; }
        .omni-spark--6 { animation: omni-spark-orbit 5.8s linear infinite reverse; animation-delay: -1.5s; }
        @keyframes omni-spark-orbit {
          0%   { transform: rotate(0deg);   opacity: 0.95; }
          50%  { opacity: 0.45; }
          100% { transform: rotate(360deg); opacity: 0.95; }
        }

        /* Scanning pulse rings — expand from center, fade out */
        .omni-ring {
          transform-origin: 100px 100px;
          transform-box: view-box;
          opacity: 0;
        }
        .omni-overlay.is-open .omni-ring--1 { animation: omni-ring-pulse 2.4s ease-out 1.5s infinite; }
        .omni-overlay.is-open .omni-ring--2 { animation: omni-ring-pulse 2.4s ease-out 2.7s infinite; }
        @keyframes omni-ring-pulse {
          0%   { transform: scale(0.2); opacity: 0.7; }
          80%  { opacity: 0.05; }
          100% { transform: scale(4.5); opacity: 0; }
        }
        .omni-text {
          max-width: 540px;
          text-align: center;
          color: #ffffff;
          transform: translateY(18px);
          opacity: 0;
          transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.5s,
                      opacity 0.5s ease 0.5s;
        }
        .omni-overlay.is-open .omni-text {
          transform: translateY(0);
          opacity: 1;
        }
        .omni-title {
          font-family: "Source Serif 4", Georgia, serif;
          font-weight: 600;
          font-size: clamp(1.5rem, 4vw, 2.1rem);
          margin: 0 0 12px;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0,0,0,0.7);
        }
        .omni-title .omni-title__hl {
          color: #7fff7f;
          font-style: italic;
        }
        .omni-body {
          color: #d3d8e3;
          font-size: 1rem;
          line-height: 1.65;
          margin: 0 0 14px;
        }
        .omni-real {
          color: #c9a8ff;
          font-family: "Source Serif 4", Georgia, serif;
          font-style: italic;
          font-size: 1.05rem;
          margin: 0;
        }
        .omni-hint {
          position: absolute; bottom: 28px; left: 0; right: 0;
          text-align: center;
          font-family: Inter, sans-serif;
          font-size: 10px;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
        }
        @media (prefers-reduced-motion: reduce) {
          .omni-overlay, .omnitrix, .omni-text { transition: none; animation: none; }
        }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement("div");
    overlay.className = "omni-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Ben10 explained");
    overlay.innerHTML = `
      <div class="omni-flash" aria-hidden="true"></div>
      <svg class="omnitrix" viewBox="0 0 200 200" aria-hidden="true">
        <!-- watch face -->
        <circle cx="100" cy="100" r="96" fill="#0a0e1a" stroke="#2a2a2a" stroke-width="3"/>
        <circle cx="100" cy="100" r="86" fill="none" stroke="#1a1a1a" stroke-width="2"/>

        <!-- Scanning pulse rings (expand outward from center) -->
        <circle class="omni-ring omni-ring--1" cx="100" cy="100" r="20" fill="none" stroke="#7fff7f" stroke-width="1.5"/>
        <circle class="omni-ring omni-ring--2" cx="100" cy="100" r="20" fill="none" stroke="#7fff7f" stroke-width="1.5"/>

        <!-- Green hourglass — wrapped in <g> so we can wobble + cycle colour -->
        <g class="omni-hourglass-group">
          <path class="omni-hourglass"
                d="M 45 48 L 155 48 L 100 100 L 155 152 L 45 152 L 100 100 Z"
                stroke="#5eff5e" stroke-width="2" stroke-linejoin="round"/>
          <path class="omni-hourglass-hl"
                d="M 65 58 L 135 58 L 100 95 L 135 142 L 65 142 L 100 95 Z"
                opacity="0.45"/>
        </g>

        <!-- Center pinhole -->
        <circle cx="100" cy="100" r="6" fill="#0a0e1a" opacity="0.6"/>

        <!-- Orbiting sparks: 6 dots circling at varied radii, speeds, and
             directions to feel like Omnitrix energy crackling around the dial. -->
        <g class="omni-sparks">
          <circle class="omni-spark omni-spark--1" cx="100" cy="-8"  r="3"   fill="#7fff7f"/>
          <circle class="omni-spark omni-spark--2" cx="100" cy="-25" r="2"   fill="#a5ffa5"/>
          <circle class="omni-spark omni-spark--3" cx="100" cy="-3"  r="2.5" fill="#7fff7f"/>
          <circle class="omni-spark omni-spark--4" cx="100" cy="-18" r="1.8" fill="#a5ffa5"/>
          <circle class="omni-spark omni-spark--5" cx="100" cy="-28" r="2.2" fill="#7fff7f"/>
          <circle class="omni-spark omni-spark--6" cx="100" cy="-12" r="1.5" fill="#b6ffb6"/>
        </g>
      </svg>
      <div class="omni-text">
        <h2 class="omni-title">
          <span lang="en">It's a <span class="omni-title__hl">nickname</span>, not my real name.</span>
          <span lang="vi"><span class="omni-title__hl">Biệt danh</span>, không phải tên thật.</span>
        </h2>
        <p class="omni-body">
          <span lang="en">
            “Ben” comes from the Cartoon Network show <em>Ben 10</em> —
            <em>Ben Tennyson</em> and his <em>Omnitrix</em>, a watch that lets him
            transform into ten different aliens. I watched a lot of it. It stuck.
          </span>
          <span lang="vi">
            “Ben” đến từ bộ phim hoạt hình <em>Ben 10</em> của Cartoon Network —
            <em>Ben Tennyson</em> và chiếc <em>Omnitrix</em>, đồng hồ giúp cậu ấy
            biến thành mười người ngoài hành tinh khác nhau. Tôi xem nhiều lắm.
            Nó dính lại với tôi.
          </span>
        </p>
        <p class="omni-real">
          <span lang="en">My real name: Hoang Anh.</span>
          <span lang="vi">Tên thật của tôi: Hoàng Anh.</span>
        </p>
      </div>
      <p class="omni-hint">
        <span lang="en">click anywhere to dismiss</span>
        <span lang="vi">bấm bất kỳ đâu để đóng</span>
      </p>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });

    function close() {
      overlay.classList.remove("is-open");
      setTimeout(function () { overlay.remove(); }, 550);
      document.removeEventListener("keydown", onKey);
    }
    overlay.addEventListener("click", close);
    function onKey(ev) { if (ev.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
  }
})();

/* ============================================================
   Easter egg: click π five times rapidly → reveal a hidden quote.
   ============================================================ */
(function () {
  let count = 0;
  let resetTimer = null;
  let navTimer = null;
  let pendingHref = null;

  document.addEventListener("click", function (e) {
    const pi = e.target.closest(".brand-pi");
    if (!pi) return;

    // Always intercept so the click counter survives. We'll navigate
    // manually after a brief delay if it turns out to be a single click.
    e.preventDefault();
    const link = pi.closest("a");
    if (link) pendingHref = link.href;

    count++;
    clearTimeout(resetTimer);
    clearTimeout(navTimer);

    if (count >= 5) {
      count = 0;
      pendingHref = null;
      reveal();
      return;
    }

    // If the user doesn't click again within ~350ms, treat the click
    // as a normal "go home" click and navigate.
    navTimer = setTimeout(function () {
      if (pendingHref) window.location.href = pendingHref;
    }, 350);

    // Hard reset after 1.5s as a safety net.
    resetTimer = setTimeout(function () { count = 0; }, 1500);
  });

  function reveal() {
    // Inject styles once
    if (!document.getElementById("egg-styles")) {
      const style = document.createElement("style");
      style.id = "egg-styles";
      style.textContent = `
        .egg-overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          padding: 48px 24px;
          background: radial-gradient(ellipse at center, rgba(8,12,28,0.78) 0%, rgba(0,0,0,0.95) 100%);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .egg-overlay.is-open { opacity: 1; }
        .egg-card {
          max-width: 720px;
          text-align: center;
          color: #ffffff;
          transform: translateY(18px) scale(0.985);
          transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .egg-overlay.is-open .egg-card { transform: translateY(0) scale(1); }
        .egg-quote {
          font-family: "Source Serif 4", Georgia, serif;
          font-style: italic;
          font-weight: 400;
          font-size: clamp(1.4rem, 3.6vw, 2.4rem);
          line-height: 1.4;
          margin: 0 0 22px;
          text-shadow: 0 2px 14px rgba(0,0,0,0.8);
        }
        .egg-quote .egg-quote__mark {
          color: #8fd6ff;
          font-style: normal;
          margin: 0 0.06em;
        }
        .egg-attrib {
          margin: 0 0 28px;
          font-family: "Inter", sans-serif;
          font-size: 12px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #8fd6ff;
        }
        .egg-mini {
          font-family: "Source Serif 4", Georgia, serif;
          font-style: italic;
          font-size: 14px;
          color: rgba(255,255,255,0.55);
          margin: 0;
        }
        .egg-hint {
          position: absolute;
          bottom: 28px;
          left: 0; right: 0;
          text-align: center;
          font-family: "Inter", sans-serif;
          font-size: 10px;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
        }
        @media (prefers-reduced-motion: reduce) {
          .egg-overlay, .egg-card { transition: none; }
        }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement("div");
    overlay.className = "egg-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Hidden quote");
    overlay.innerHTML = `
      <div class="egg-card">
        <p class="egg-quote">
          <span class="egg-quote__mark">“</span>What I cannot create,
          I do not understand.<span class="egg-quote__mark">”</span>
        </p>
        <p class="egg-attrib">— Richard Feynman</p>
        <p class="egg-mini">π · you found it.</p>
      </div>
      <p class="egg-hint">click anywhere to dismiss</p>
    `;
    document.body.appendChild(overlay);
    // Force reflow so the transition runs
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });

    function close() {
      overlay.classList.remove("is-open");
      setTimeout(function () { overlay.remove(); }, 550);
      document.removeEventListener("keydown", onKey);
    }
    overlay.addEventListener("click", close);
    function onKey(ev) { if (ev.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
  }
})();

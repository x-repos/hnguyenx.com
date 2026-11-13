/* Language for the games: the same English / Vietnamese choice as the rest of the site.
   The choice is kept in localStorage under "site-lang". It is set by the switch in the
   site's top bar, or by the small switch a game shows in its menu.

   In HTML   <span lang="en">Play</span><span lang="vi">Chơi</span>    only the chosen one shows
   In JS     PlayLang.t("Play", "Chơi")       the text in the chosen language
             PlayLang.get()                   "en" or "vi"
             PlayLang.onChange(fn)            fn runs after the language changes, to repaint text set from JS
   A switch  <span data-lang-pick></span>     becomes two buttons, EN and VI

   Load it in the <head>, before the game's own script, so the page never shows the wrong language first. */
(function () {
  "use strict";
  var KEY = "site-lang", lang = "en", subs = [];
  try { if (localStorage.getItem(KEY) === "vi") lang = "vi"; } catch (e) {}
  document.documentElement.setAttribute("lang", lang);

  var css = document.createElement("style");
  css.textContent =
    'html[lang="en"] [lang="vi"], html[lang="vi"] [lang="en"] { display: none !important; }' +
    // the switch takes its colour from the text around it, so it suits every game's look
    "[data-lang-pick] { display: inline-flex; align-items: center; gap: 2px; font: 600 14px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: 0.04em; }" +
    "[data-lang-pick] button { -webkit-appearance: none; appearance: none; margin: 0; border: 1px solid transparent; border-radius: 999px; background: none; color: inherit; font: inherit; cursor: pointer; min-width: 44px; min-height: 36px; padding: 0 10px; opacity: 0.55; }" +
    '[data-lang-pick] button[aria-pressed="true"] { opacity: 1; border-color: currentColor; }';
  document.head.appendChild(css);

  function paintPickers() {
    var all = document.querySelectorAll("[data-lang-pick] button");
    for (var i = 0; i < all.length; i++) all[i].setAttribute("aria-pressed", all[i].getAttribute("data-lang") === lang ? "true" : "false");
  }
  function set(next, quiet) {
    next = next === "vi" ? "vi" : "en";
    if (next === lang) return;
    lang = next;
    document.documentElement.setAttribute("lang", lang);
    if (!quiet) { try { localStorage.setItem(KEY, lang); } catch (e) {} }
    paintPickers();
    for (var i = 0; i < subs.length; i++) { try { subs[i](lang); } catch (e) {} }
  }
  function buildPickers() {
    var hosts = document.querySelectorAll("[data-lang-pick]");
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].firstChild) continue;
      hosts[i].setAttribute("role", "group");
      hosts[i].setAttribute("aria-label", "Language");
      hosts[i].innerHTML = '<button type="button" data-lang="en">EN</button><button type="button" data-lang="vi">VI</button>';
      hosts[i].addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("button[data-lang]") : null;
        if (b) set(b.getAttribute("data-lang"));
      });
    }
    paintPickers();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildPickers); else buildPickers();
  // the language was changed in another tab
  window.addEventListener("storage", function (e) { if (e.key === KEY) set(e.newValue, true); });

  window.PlayLang = {
    get: function () { return lang; },
    set: function (l) { set(l); },
    t: function (en, vi) { return lang === "vi" && vi != null ? vi : en; },
    onChange: function (fn) { subs.push(fn); },
    refresh: buildPickers,
  };
})();

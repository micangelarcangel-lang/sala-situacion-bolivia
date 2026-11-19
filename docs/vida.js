/* Sala de Situación Bolivia — movimiento: inclinación 3D con brillo en tarjetas, contadores animados.
   Respeta «Movimiento: reducido» (Apariencia) y prefers-reduced-motion. Sin dependencias. */
(function () {
  "use strict";
  var root = document.documentElement, reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function anima() { return !reduce && root.getAttribute("data-mov") !== "off"; }
  function tilt() { return anima() && root.getAttribute("data-estilo") !== "plano"; }

  /* ---- inclinación 3D y brillo que sigue al puntero ---- */
  var cur = null;
  function quita(t) { if (!t) return; t.style.setProperty("--rx", "0deg"); t.style.setProperty("--ry", "0deg"); }
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    var t = e.target.closest ? e.target.closest(".tipo,.kpi") : null;
    if (cur && cur !== t) { quita(cur); cur = null; }
    if (!t || !tilt()) return;
    cur = t;
    var r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, m = t.classList.contains("tipo") ? 7 : 4;
    t.style.setProperty("--ry", ((x - .5) * 2 * m).toFixed(2) + "deg");
    t.style.setProperty("--rx", ((.5 - y) * 2 * m).toFixed(2) + "deg");
    t.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    t.style.setProperty("--my", (y * 100).toFixed(1) + "%");
  }, {passive: true});
  document.addEventListener("mouseleave", function () { quita(cur); cur = null; });

  /* ---- contadores: cifras que suben al aparecer (el texto final no cambia) ---- */
  var SEL = ".tipo-n,.kpi .v", RX = /^(\d+|\d{1,3}(?:[.  ]\d{3})+)(\s.*|[^\d,.\s].*)?$/;
  function cuenta(el) {
    if (el.dataset.cu) return; el.dataset.cu = "1";
    var txt = el.textContent.trim(), m = RX.exec(txt); if (!m || !anima() || document.hidden) return;
    var fin = parseInt(m[1].replace(/[.  ]/g, ""), 10), suf = m[2] || ""; if (!(fin > 0) || fin > 1e7) return;
    var t0 = performance.now(), dur = fin > 500 ? 1100 : 800, fmt = function (v) { return v >= 1000 ? v.toLocaleString("es-BO") : String(v); };
    (function paso(t) {
      var k = Math.min(1, (t - t0) / dur), v = Math.round(fin * (1 - Math.pow(1 - k, 3)));
      el.textContent = k >= 1 ? txt : fmt(v) + suf;
      if (k < 1) requestAnimationFrame(paso);
    })(t0);
  }
  function barre(n) {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches(SEL)) cuenta(n);
    if (n.querySelectorAll) [].forEach.call(n.querySelectorAll(SEL), cuenta);
  }
  function inicia() {
    barre(document.body);
    new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, barre); }); }).observe(document.body, {childList: true, subtree: true});
  }
  if (document.body) inicia(); else document.addEventListener("DOMContentLoaded", inicia);
})();

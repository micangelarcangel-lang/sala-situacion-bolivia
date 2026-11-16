/* Distribución de los municipios por departamento: violín + un punto por municipio (estilo seaborn). */
var DIST = (function () {
  var S = SALA, A;
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  var X = {};
  function ex(m, k) { var x = X[m.k]; return x ? x[k] : null; }
  var IND = [
    ["R", "Riesgo (índice relativo 0–10)", function (m, T, I) { return I[m.k].R; }, ""],
    ["A", "Amenaza", function (m, T, I) { return I[m.k].A; }, ""],
    ["V", "Vulnerabilidad", function (m, T, I) { return I[m.k].V; }, ""],
    ["L", "Falta de capacidad de respuesta", function (m, T, I) { return I[m.k].L; }, ""],
    ["nbi", "Pobreza por NBI (INE 2024)", function (m, T) { var x = T.nb && T.nb.municipios[m.k]; return x ? x.nbi24 : null; }, " %"],
    ["ext", "Pobreza extrema (INE 2024)", function (m, T) { var x = T.nb && T.nb.municipios[m.k]; return x ? x.ext24 : null; }, " %"],
    ["agua", "Agua y saneamiento inadecuados (INE 2024)", function (m, T) { var x = T.nb && T.nb.municipios[m.k]; return x ? x.agua24 : null; }, " %"],
    ["sal", "Inadecuada atención en salud (INE 2024)", function (m, T) { var x = T.nb && T.nb.municipios[m.k]; return x ? x.sal24 : null; }, " %"],
    ["anal", "Analfabetismo (INE 2024)", function (m, T) { var x = T.ed && T.ed.municipios[m.k]; return x && x.alf24 != null ? 100 - x.alf24 : null; }, " %"],
    ["asi", "Asistencia escolar 4–17 años (INE 2024)", function (m) { return ex(m, "asi24"); }, " %"],
    ["emi", "Viviendas con emigrantes (INE 2024)", function (m) { return ex(m, "emi24"); }, " %"],
    ["fall", "Viviendas con fallecidos declarados (INE 2024)", function (m) { return ex(m, "fall24"); }, " %"],
    ["est", "Años promedio de estudio (INE 2024)", function (m, T) { var x = T.ed && T.ed.municipios[m.k]; return x ? x.est24 : null; }, " años"]
  ];
  function kde(vals, lo, hi, n) {
    var N = vals.length, mu = vals.reduce(function (s, v) { return s + v; }, 0) / N, sd = Math.sqrt(vals.reduce(function (s, v) { return s + (v - mu) * (v - mu); }, 0) / Math.max(1, N - 1)) || 1, h = Math.max(1.06 * sd * Math.pow(N, -0.2), (hi - lo) / 60), out = [];
    for (var i = 0; i <= n; i++) { var x = lo + (hi - lo) * i / n, d = 0; for (var j = 0; j < N; j++) { var z = (x - vals[j]) / h; d += Math.exp(-0.5 * z * z); } out.push([x, d / (N * h * 2.5066)]); }
    return out;
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((h >>> 0) % 1000) / 1000; }
  function med(a) { var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; }
  function montar(T, host, st) {
    fetch("ine_extra_mun.json?v=20261116b").then(function (r) { return r.json(); }).then(function (j) { X = j.municipios || {}; }).catch(function () {}).then(function () { montar2(T, host, st); });
  }
  function montar2(T, host, st) {
    A = TERR.api; var I = A.indices(T); st = st || {};
    host.innerHTML = '<div class="dsb"><div><h3 style="margin:0">Cómo se reparte entre los municipios</h3><div class="nota">Cada punto es un municipio; el violín muestra dónde se concentran. Color del punto = nivel de riesgo del municipio. Clic en un punto abre su ficha.</div></div><select id="dsi">' + IND.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join("") + '</select></div><div class="dsw"><svg id="dss" viewBox="0 0 1000 440" role="img" aria-label="Distribución por departamento"></svg><div id="dst" class="dstt"></div></div><div class="nota" id="dsn"></div>';
    var sel = host.querySelector("#dsi"), svg = host.querySelector("#dss"), tip = host.querySelector("#dst");
    function dib() {
      var def = IND.filter(function (x) { return x[0] === sel.value; })[0], G = {}, all = [];
      T.lista.forEach(function (m) { var v = def[2](m, T, I); if (v == null || isNaN(v)) return; (G[m.d] = G[m.d] || []).push({m: m, v: +v}); all.push(+v); });
      var deps = Object.keys(G).sort(function (a, b) { return med(G[a].map(function (z) { return z.v; })) - med(G[b].map(function (z) { return z.v; })); });
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * .05 || 1; lo -= pad; hi += pad; if (def[0] !== "est" && def[0] !== "R" && def[0] !== "A" && def[0] !== "V" && def[0] !== "L") { lo = Math.max(0, lo); } 
      var W = 1000, Hh = 425, L = 54, R = 10, Tp = 12, B = 58, pw = (W - L - R) / deps.length, y = function (v) { return Tp + (Hh - Tp - B) * (1 - (v - lo) / (hi - lo)); }, o = "";
      var rg = hi - lo, st0 = Math.pow(10, Math.floor(Math.log10(rg / 5))), stp = [1, 2, 2.5, 5, 10].map(function (k) { return k * st0; }).filter(function (k) { return rg / k <= 7; })[0] || st0 * 10; for (var tv = Math.ceil(lo / stp) * stp; tv <= hi; tv += stp) { tv = Math.round(tv / stp) * stp; o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(tv).toFixed(1) + '" y2="' + y(tv).toFixed(1) + '" stroke="currentColor" opacity=".12"/><text x="' + (L - 6) + '" y="' + (y(tv) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">' + (Math.round(tv * 10) / 10) + '</text>'; }
      var nm = med(all); o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(nm).toFixed(1) + '" y2="' + y(nm).toFixed(1) + '" stroke="#d7263d" stroke-dasharray="5 4" opacity=".8"/><text x="' + (W - R - 2) + '" y="' + (y(nm) - 4).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="#d7263d">mediana de Bolivia ' + (Math.round(nm * 10) / 10) + '</text>';
      var pts = "";
      deps.forEach(function (d, i) {
        var vs = G[d].map(function (z) { return z.v; }), cx = L + pw * (i + .5), dens = kde(vs, Math.max(lo, Math.min.apply(null, vs)), Math.min(hi, Math.max.apply(null, vs)), 40), mx = Math.max.apply(null, dens.map(function (p) { return p[1]; })) || 1, hw = pw * .42;
        if (vs.length > 2) { var pr = dens.map(function (p) { return (cx + p[1] / mx * hw).toFixed(1) + "," + y(p[0]).toFixed(1); }), pl = dens.slice().reverse().map(function (p) { return (cx - p[1] / mx * hw).toFixed(1) + "," + y(p[0]).toFixed(1); }); o += '<polygon points="' + pr.concat(pl).join(" ") + '" fill="#5b7fb5" opacity=".22" stroke="#5b7fb5" stroke-width="1"/>'; }
        var md = med(vs); o += '<line x1="' + (cx - hw * .5) + '" x2="' + (cx + hw * .5) + '" y1="' + y(md).toFixed(1) + '" y2="' + y(md).toFixed(1) + '" stroke="currentColor" stroke-width="2.2"/>';
        o += '<text x="' + cx + '" y="' + (Hh - 24) + '" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">' + esc(d) + '</text><text x="' + cx + '" y="' + (Hh - 24 + 13) + '" text-anchor="middle" font-size="10.5" fill="currentColor" opacity=".7">' + vs.length + ' municipios</text><text x="' + cx + '" y="' + (Hh - 24 + 25) + '" text-anchor="middle" font-size="10.5" fill="currentColor" opacity=".7">mediana ' + (Math.round(md * 10) / 10) + '</text>';
        G[d].forEach(function (z) { var jx = (hash(z.m.k) - .5) * hw * 1.1, r = 2.6 + Math.min(3.4, Math.sqrt((z.m.pob || 0) / 20000)); pts += '<a href="municipio.html?d=' + encodeURIComponent(z.m.d) + '&amp;m=' + encodeURIComponent(z.m.n) + '"><circle class="dp" cx="' + (cx + jx).toFixed(1) + '" cy="' + y(z.v).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + A.nivelR(I[z.m.k].R)[2] + '" stroke="#0b1220" stroke-width=".6" opacity=".9" data-n="' + esc(z.m.n) + '" data-d="' + esc(z.m.d) + '" data-v="' + (Math.round(z.v * 10) / 10) + '" data-p="' + (z.m.pob || 0) + '" data-r="' + (Math.round(I[z.m.k].R * 10) / 10) + '"/></a>'; });
      });
      svg.innerHTML = o + pts;
      host.querySelector("#dsn").textContent = def[1] + ": " + all.length + " municipios con dato. Tamaño del punto = población. Fuente: INE (Censo 2024) y cálculo del sistema; el riesgo es relativo y está por validar con CCES." + (def[0] === "fall" ? " Son viviendas que declararon algún fallecido en el período del Censo: no es una tasa de mortalidad." : "") + (all.length < T.lista.length ? " Municipios sin dato: " + (T.lista.length - all.length) + " (nombre no coincide entre fuentes)." : "");
      svg.querySelectorAll(".dp").forEach(function (c) {
        c.onmousemove = function (e) { var b = svg.parentNode.getBoundingClientRect(); tip.style.display = "block"; tip.style.left = Math.min(b.width - 190, e.clientX - b.left + 12) + "px"; tip.style.top = (e.clientY - b.top + 12) + "px"; tip.innerHTML = '<b>' + c.dataset.n + '</b> · ' + c.dataset.d + '<br>' + def[1].split(" (")[0] + ': <b>' + c.dataset.v + def[3] + '</b><br>Riesgo ' + c.dataset.r + ' · ' + Number(c.dataset.p).toLocaleString("es-BO") + ' hab.'; };
        c.onmouseleave = function () { tip.style.display = "none"; };
      });
    }
    sel.onchange = dib; dib();
  }
  function css() {
    if (document.getElementById("dscss")) return; var s = document.createElement("style"); s.id = "dscss";
    s.textContent = ".dsc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-top:14px}.dsb{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}.dsb select{padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:inherit;font:inherit;max-width:360px}.dsw{position:relative}.dsw svg{width:100%;height:auto;display:block}.dp{cursor:pointer}.dp:hover{stroke:#fff;stroke-width:2}.dstt{display:none;position:absolute;z-index:5;background:rgba(9,13,21,.94);color:#fff;border-radius:8px;padding:7px 10px;font-size:12px;pointer-events:none;width:180px}";
    document.head.appendChild(s);
  }
  return {montar: montar, css: css};
})();

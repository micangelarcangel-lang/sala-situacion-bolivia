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
    fetch("ine_extra_mun.json?v=20261116d").then(function (r) { return r.json(); }).then(function (j) { X = j.municipios || {}; }).catch(function () {}).then(function () { montar2(T, host, st); });
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

  function salud(host) {
    fetch("salud_dep.json?v=20261116d").then(function (r) { return r.json(); }).then(function (J) {
      var cs = getComputedStyle(document.body), tx = cs.color, dep = Object.keys(J.dc.dep).filter(function (d) { return d !== "BOLIVIA"; }).sort(function (a, b) { return J.dc.dep[b][2] - J.dc.dep[a][2]; });
      host.innerHTML = '<div class="dsb"><div><h3 style="margin:0">Salud infantil por departamento</h3><div class="nota">Menores de 5 años. Cada celda es un dato oficial del INE; no hay cifras municipales para estos indicadores.</div></div></div><div class="shg"><div><div class="nota shh">Infección respiratoria aguda (IRA), % de menores de 5 años</div><div id="shA" class="shc"></div></div><div><div class="nota shh">Enfermedad diarreica aguda (EDA), % de menores de 5 años</div><div id="shB" class="shc"></div></div><div><div class="nota shh">Desnutrición crónica (talla para la edad), % — 2008 → 2016 → 2023</div><div id="shC" class="shc"></div></div></div><div class="nota">' + esc(J.meta.fuente) + '. ' + esc(J.meta.nota) + '.</div>';
      function heat(id, K, col) {
        var o = J[K], ys = o.anios, d2 = dep.slice().reverse(), data = [], mx = 0;
        d2.forEach(function (d, i) { o.dep[d].forEach(function (c, j) { if (c.v != null) { data.push([j, i, c.v, c.m ? "*" : ""]); mx = Math.max(mx, c.v); } }); });
        var ch = echarts.init(document.getElementById(id), null, {renderer: "svg"});
        ch.setOption({textStyle: {color: tx}, grid: {left: 84, right: 8, top: 4, bottom: 34}, tooltip: {formatter: function (p) { return d2[p.value[1]] + " · " + ys[p.value[0]] + "<br><b>" + p.value[2].toFixed(1) + " %</b>" + p.value[3]; }}, xAxis: {type: "category", data: ys, splitArea: {show: false}, axisLine: {show: false}, axisTick: {show: false}, axisLabel: {color: tx, fontSize: 10, interval: 0}}, yAxis: {type: "category", data: d2, axisLine: {show: false}, axisTick: {show: false}, axisLabel: {color: tx, fontSize: 11}}, visualMap: {dimension: 2, min: 10, max: mx, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 90, show: false, inRange: {color: col}}, series: [{type: "heatmap", data: data, label: {show: true, fontSize: 9, color: function (p) { return p.value[2] >= (K === "eda" ? 27 : 52) ? "#fff" : "#111"; }, formatter: function (p) { return Math.round(p.value[2]) + p.value[3]; }}, itemStyle: {borderColor: cs.backgroundColor, borderWidth: 1.5, borderRadius: 3}}]});
        window.addEventListener("resize", function () { ch.resize(); });
      }
      heat("shA", "ira", ["#fff3c4", "#f9b44c", "#e4572e", "#8c1d40"]); heat("shB", "eda", ["#e3f2fd", "#7fb8e6", "#2f78c4", "#123a7a"]);
      var cc = echarts.init(document.getElementById("shC"), null, {renderer: "svg"}), ser = dep.map(function (d, i) { return {name: d, type: "line", data: J.dc.dep[d], symbolSize: 7, lineStyle: {width: 2}, endLabel: {show: true, formatter: "{a}", color: tx, fontSize: 10}, emphasis: {focus: "series"}, labelLayout: {moveOverlap: "shiftY"}}; });
      ser.push({name: "Bolivia", type: "line", data: J.dc.dep.BOLIVIA, symbolSize: 8, lineStyle: {width: 3, type: "dashed", color: "#d7263d"}, itemStyle: {color: "#d7263d"}, endLabel: {show: true, formatter: "Bolivia", color: "#d7263d", fontSize: 10, fontWeight: 700}, labelLayout: {moveOverlap: "shiftY"}});
      cc.setOption({textStyle: {color: tx}, color: ["#6c8ebf", "#e4572e", "#2e9e5b", "#b58900", "#8e5ea2", "#17a2b8", "#d17a22", "#5c6b73", "#c2185b"], grid: {left: 34, right: 78, top: 8, bottom: 26}, tooltip: {trigger: "axis"}, xAxis: {type: "category", data: J.dc.anios, boundaryGap: false, axisLabel: {color: tx}}, yAxis: {type: "value", axisLabel: {color: tx, formatter: "{value} %"}, splitLine: {lineStyle: {opacity: .15}}}, series: ser});
      window.addEventListener("resize", function () { cc.resize(); });
    }).catch(function () { host.innerHTML = '<p class="nota">No se pudo cargar los datos de salud infantil.</p>'; });
  }
  function css() {
    if (document.getElementById("dscss")) return; var s = document.createElement("style"); s.id = "dscss";
    s.textContent = ".dsc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-top:14px}.dsb{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}.dsb select{padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:inherit;font:inherit;max-width:360px}.dsw{position:relative}.dsw svg{width:100%;height:auto;display:block}.dp{cursor:pointer}.dp:hover{stroke:#fff;stroke-width:2}.shg{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.shc{height:300px}.shh{margin-bottom:2px;font-weight:600}.dstt{display:none;position:absolute;z-index:5;background:rgba(9,13,21,.94);color:#fff;border-radius:8px;padding:7px 10px;font-size:12px;pointer-events:none;width:180px}";
    document.head.appendChild(s);
  }
  return {montar: montar, salud: salud, css: css};
})();

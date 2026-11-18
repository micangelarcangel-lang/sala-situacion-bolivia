/* Evidencia: triangulación por familias de fuentes INDEPENDIENTES (institucional, instrumental, satélite, modelo, prensa), por tipo de evento.
   Solo usa los archivos reales del sistema. Sin dato → "sin señal"; familia que no existe para el tipo → "sin fuente conectada" (punto ciego). */
var EVI = (function () {
  var S = SALA, X = S2, DIA = 864e5;
  var FAM = [
    {k: "ofi", n: "Institucional", c: "#4c8dff", d: "Avisos y boletines oficiales"},
    {k: "ins", n: "Instrumental", c: "#a67cff", d: "Sensores (sismógrafos)"},
    {k: "sat", n: "Satélite", c: "#ff8a3d", d: "NASA FIRMS"},
    {k: "mod", n: "Modelo", c: "#19b8a6", d: "Pronósticos y índices"},
    {k: "pre", n: "Prensa", c: "#8d98ab", d: "Notas de medios"}
  ];
  var FC = {}; FAM.forEach(function (f) { FC[f.k] = f; });
  var MAPF = {senamhi: "ofi", epidemiologia: "ofi", gdacs: "ofi", sismo: "ins", usgs: "ins", foco: "sat", eonet: "sat", modelo: "mod", caudal: "mod", sequia: "mod", prensa: "pre"};
  var TIPOS = [["geológica", "Geológica"], ["meteorológica", "Meteorológica"], ["hidrológica", "Hidrológica"], ["climatológica", "Climatológica"], ["biológica", "Biológica"], ["tecnológica", "Tecnológica"], ["antropogénica", "Antropogénica"], ["otra", "Sin clasificar"]];
  /* cada tipo de evento ordena las familias según lo que más pesa en él */
  var ORDEN = {"geológica": ["ins", "pre", "ofi", "sat", "mod"], "meteorológica": ["ofi", "mod", "pre", "sat", "ins"], "hidrológica": ["mod", "ofi", "pre", "sat", "ins"], "climatológica": ["sat", "mod", "pre", "ofi", "ins"], "biológica": ["ofi", "pre", "mod", "sat", "ins"], "tecnológica": ["pre", "ofi", "mod", "sat", "ins"], "antropogénica": ["pre", "ofi", "mod", "sat", "ins"]};
  var CV = ["#8d98ab", "#f5b700", "#f26a1b", "#d7263d", "#a3004d"];
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function fmt(n) { return n == null ? "—" : Number(n).toLocaleString("es-BO"); }
  function dec(t) { var x = document.createElement("textarea"); x.innerHTML = String(t || ""); return x.value.replace(/\u00a0/g, " "); }
  function cut(t, n) { t = dec(t); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
  function fechaC(s) { return s ? new Date(s + "T12:00:00").toLocaleDateString("es-BO", {day: "2-digit", month: "short"}) : "—"; }
  function mag(x) { return String(x).replace(".", ","); }

  /* ---------- qué familias existen para cada tipo (según los datos reales del sistema) ---------- */
  function hay(D) {
    var h = {}; TIPOS.forEach(function (t) { h[t[0]] = {}; });
    (D.ev || []).forEach(function (e) { var f = MAPF[e.origen], c = h[e.categoria] ? e.categoria : "otra"; if (f) h[c][f] = 1; });
    if (((D.senamhi_alertas || {}).alertas || []).length) { h["meteorológica"].ofi = 1; h["hidrológica"].ofi = 1; }
    if (((D.sismos_oficiales || {}).sismos || []).length) h["geológica"].ins = 1;
    if (((D.focos_puntos || {}).puntos || []).length) h["climatológica"].sat = 1;
    if (((D.caudales || {}).puntos || []).length) h["hidrológica"].mod = 1;
    if (D.sequia && D.sequia.departamentos) h["climatológica"].mod = 1;
    return h;
  }
  function ev(D, tipo, fam, dias) { var d0 = Date.now() - dias * DIA; return (D.ev || []).filter(function (e) { return e.categoria === tipo && MAPF[e.origen] === fam && (e.ts || 0) >= d0; }); }
  function depsDe(m) { var o = {}; (m || []).forEach(function (z) { var x = /\(([^)]+)\)\s*$/.exec(z); if (x) o[x[1]] = 1; }); return Object.keys(o); }

  /* ---------- señales de cada familia para un tipo ---------- */
  function senal(D, tipo, fam) {
    var HOY = S.diaKey(Date.now()), r = {n: 0, unit: "", items: [], deps: {}, nota: ""};
    function dep(x) { [].concat(x || []).forEach(function (d) { if (d) r.deps[d] = 1; }); }
    if (fam === "ofi" && (tipo === "meteorológica" || tipo === "hidrológica")) {
      var A = ((D.senamhi_alertas || {}).alertas || []).filter(function (a) { var t = a.tipo || (/HIDROL/i.test(a.titulo || "") ? "hidrológica" : "meteorológica"); return t === tipo; });
      var vig = A.filter(function (a) { return a.inicio <= HOY && (a.fin || "9999") >= HOY; }), prox = A.filter(function (a) { return a.inicio > HOY && (a.fin || "9999") >= HOY; }).length;
      vig.sort(function (a, b) { return (b.nivel_num || 0) - (a.nivel_num || 0); });
      r.n = vig.length; r.unit = vig.length === 1 ? "aviso SENAMHI vigente" : "avisos SENAMHI vigentes"; if (prox) r.nota = prox + " por iniciar";
      vig.slice(0, 3).forEach(function (a) {
        var dd = (a.departamentos && a.departamentos.length) ? a.departamentos : depsDe(a.municipios); dep(dd);
        r.items.push({t: (a.nivel || "").toLowerCase() + " · " + (a.fenomeno || a.titulo), s: "hasta " + fechaC(a.fin) + " · " + ((a.municipios || []).length ? (a.n_municipios || a.municipios.length) + " municipios" : dd.length ? dd.join(", ") : "sin zonas ubicadas"), u: a.url || a.pdf});
      });
      vig.forEach(function (a) { dep((a.departamentos && a.departamentos.length) ? a.departamentos : depsDe(a.municipios)); });
    } else if (fam === "ins" && tipo === "geológica") {
      var q = ((D.sismos_oficiales || {}).sismos || []).map(function (s) { s._t = new Date(String(s.fecha_local).replace(" ", "T") + "-04:00").getTime(); return s; }).filter(function (s) { return s._t >= Date.now() - 7 * DIA; });
      var q4 = q.filter(function (s) { return s.mag >= 4; }).sort(function (a, b) { return b.mag - a.mag; });
      r.n = q4.length; r.unit = "sismos M ≥ 4,0"; r.nota = q.length + " sismos en total (San Calixto, 7 d)";
      q4.slice(0, 3).forEach(function (s) { dep(s.departamento); r.items.push({t: "M " + mag(s.mag) + " · " + s.departamento, s: s.fecha_local.slice(8, 10) + "/" + s.fecha_local.slice(5, 7) + " · prof. " + fmt(s.prof_km) + " km"}); });
    } else if (fam === "sat" && tipo === "climatológica") {
      var P = (D.focos_puntos || {}).puntos || [], d3 = S.diaKey(Date.now() - 2 * DIA), d6 = S.diaKey(Date.now() - 5 * DIA), a3 = {}, n3 = 0, np = 0;
      P.forEach(function (p) { if (p[3] >= d3) { n3++; var k = p[5] + " (" + p[4] + ")"; a3[k] = (a3[k] || 0) + 1; dep(p[4]); } else if (p[3] >= d6) np++; });
      r.n = n3; r.unit = "focos de calor en 3 días"; r.nota = np ? (n3 >= np ? "▲ " : "▼ ") + Math.round(Math.abs(n3 - np) / np * 100) + " % vs. los 3 días anteriores (" + fmt(np) + "). Incluye quemas agrícolas" : "Incluye quemas agrícolas";
      Object.keys(a3).sort(function (a, b) { return a3[b] - a3[a]; }).slice(0, 3).forEach(function (k) { r.items.push({t: k, s: fmt(a3[k]) + " focos"}); });
    } else if (fam === "mod" && tipo === "hidrológica") {
      var C = ((D.caudales || {}).puntos || []), al = C.filter(function (p) { return (p.nivel || 0) >= 2; }).sort(function (a, b) { return (b.ratio_p90_max_10d || 0) - (a.ratio_p90_max_10d || 0); });
      r.n = al.length; r.unit = "de " + C.length + " ríos sobre el umbral alto (P90)";
      al.slice(0, 3).forEach(function (p) { dep(p.departamento); r.items.push({t: p.rio + " · " + p.nombre, s: Math.round((p.ratio_p90_max_10d || 0) * 100) + " % del P90 (máx. 10 d)"}); });
    } else if (fam === "mod" && tipo === "climatológica") {
      var Q = (D.sequia || {}).departamentos || {}, sq = Object.keys(Q).filter(function (k) { return Q[k].spi3 != null && Q[k].spi3 <= -1; });
      r.n = sq.length; r.unit = "departamentos con déficit de lluvia (SPI-3 ≤ −1)"; sq.slice(0, 3).forEach(function (k) { dep(k); r.items.push({t: k, s: "SPI-3 " + mag(Q[k].spi3)}); });
      if (!sq.length) r.nota = "Índice calculado para " + Object.keys(Q).length + " departamentos";
    } else {
      var dias = fam === "pre" ? 7 : fam === "mod" ? 3 : 30, L = ev(D, tipo, fam, dias).sort(function (a, b) { return b.ts - a.ts; });
      r.n = L.length; r.unit = fam === "pre" ? "notas de prensa (7 d)" : fam === "mod" ? "pronósticos de modelo" : "publicaciones oficiales (30 d)";
      if (fam === "pre") { var loc = L.filter(function (e) { return e.lat != null || (e.departamentos || []).length; }).length; r.nota = loc + " con ubicación"; }
      L.forEach(function (e) { dep(e.departamentos); });
      L.slice(0, 3).forEach(function (e) { r.items.push({t: cut(e.titulo, 90), s: (e.fuente || "") + " · " + X.ago(e.ts), u: "evento.html?id=" + encodeURIComponent(e.id)}); });
    }
    r.deps = Object.keys(r.deps); return r;
  }

  function css() {
    if (document.getElementById("eviCss")) return;
    var s = document.createElement("style"); s.id = "eviCss";
    s.textContent = ".ev-p{border:1px solid var(--line);border-radius:16px;background:var(--card);padding:14px 16px;margin:14px 0}.ev-top{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;justify-content:space-between}" +
      ".ev-eye{font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--mut);font-weight:700}.ev-p h2{font-size:19px;line-height:1.3;margin:4px 0 0;max-width:900px}.ev-p h2 b{box-shadow:inset 0 -3px 0 var(--c)}" +
      ".ev-lanes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:10px;margin-top:12px}.ev-l{border:1px solid var(--line);border-top:4px solid var(--c);border-radius:12px;padding:10px 12px;background:var(--soft);min-width:0}" +
      ".ev-l.off{background:transparent}.ev-lh{display:flex;justify-content:space-between;gap:8px;align-items:center}.ev-lh b{font-size:13.5px}.ev-chip{font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px;color:#fff;background:var(--c)}.ev-l.off .ev-chip{background:transparent;color:var(--mut);border:1px solid var(--line)}" +
      ".ev-n{font-size:30px;font-weight:800;line-height:1.1;margin-top:6px}.ev-n small{display:block;font-size:12px;font-weight:500;color:var(--mut);margin-top:1px}.ev-l ul{list-style:none;margin:8px 0 0;padding:0;font-size:12.5px;line-height:1.35}.ev-l li{margin:6px 0}.ev-l li span{display:block;color:var(--mut);font-size:11.5px}.ev-l a{color:var(--brand2)}.ev-nt{margin-top:6px;font-size:11.5px;color:var(--mut)}" +
      ".ev-ciego{margin-top:10px;padding:9px 13px;border-left:4px solid #f5b700;background:var(--soft);border-radius:0 10px 10px 0;font-size:13px;line-height:1.45}.ev-nota{margin-top:8px;font-size:11.5px;color:var(--mut)}" +
      ".cm-t{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}.cm-t th{font-size:11.5px;color:var(--mut);font-weight:700;text-align:center;padding:6px;border-bottom:2px solid var(--line)}.cm-t th:first-child{text-align:left}.cm-t th i{display:block;height:3px;border-radius:2px;background:var(--c);margin-bottom:5px}" +
      ".cm-t td{padding:5px 6px;border-bottom:1px solid var(--line);text-align:center;height:46px}.cm-t td:first-child{text-align:left;font-weight:600;white-space:nowrap}.cm-t td:last-child{text-align:left;font-size:12.5px}.cm-d{display:inline-flex;align-items:center;justify-content:center;width:var(--s);height:var(--s);border-radius:50%;background:var(--c);color:#fff;font-weight:800;font-size:11.5px}" +
      ".cm-z{color:var(--mut);opacity:.55}.cm-nf{background:repeating-linear-gradient(135deg,transparent 0 5px,var(--line) 5px 6px);color:var(--mut);font-size:11px}.cm-lec{display:inline-block;border-radius:8px;padding:2px 9px;font-weight:700;font-size:12px;color:#fff;background:var(--c)}" +
      ".cm-ciego{margin-top:10px;padding:10px 14px;border-left:4px solid #f5b700;background:var(--soft);border-radius:0 10px 10px 0;font-size:13.2px;line-height:1.45}@media(max-width:700px){.cm-t{display:block;overflow-x:auto}}";
    document.head.appendChild(s);
  }

  /* ---------- panel de un tipo de evento ---------- */
  function panel(el, tipo, D) {
    if (typeof el === "string") el = document.getElementById(el); if (!el || !ORDEN[tipo]) return;
    css(); var H = hay(D), col = S.COLCAT[tipo] || "#1d6fb8", ord = ORDEN[tipo], con = [], ciegos = [], SG = {};
    ord.forEach(function (f) { if (H[tipo][f]) { SG[f] = senal(D, tipo, f); con.push(f); } else ciegos.push(f); });
    var sig = con.filter(function (f) { return SG[f].n > 0; }), dm = {};
    sig.forEach(function (f) { SG[f].deps.forEach(function (d) { (dm[d] = dm[d] || []).push(f); }); });
    var coin = Object.keys(dm).filter(function (d) { return dm[d].length >= 2; }).sort(function (a, b) { return dm[b].length - dm[a].length; });
    var head;
    if (!sig.length) head = 'Sin señal de ninguna fuente conectada en los últimos 7 días.';
    else if (sig.length === 1) head = 'Solo <b>' + FC[sig[0]].n.toLowerCase() + '</b> tiene señal: <b>por confirmar</b>' + (con.length > 1 ? '; las otras familias conectadas no ven nada' : '; es la única familia conectada para este tipo') + '.';
    else if (coin.length) head = 'Coinciden <b>' + sig.length + ' familias</b> de fuentes. Mismo departamento: ' + coin.slice(0, 3).map(function (d) { return '<b>' + esc(d) + '</b> (' + dm[d].map(function (f) { return FC[f].n.toLowerCase(); }).join(" + ") + ')'; }).join("; ") + '.';
    else head = 'Hay señal en <b>' + sig.length + ' familias</b>, pero en lugares distintos: <b>no se refuerzan entre sí</b>.';
    var h = '<section class="ev-p" style="--c:' + col + '"><div class="ev-top"><div><div class="ev-eye">Triangulación · ' + esc(tipo) + ' · últimos 7 días</div><h2>' + head + '</h2></div><a class="btn s" href="centro.html">Ver todos los tipos en el Centro de mando</a></div><div class="ev-lanes">';
    con.forEach(function (f) {
      var s = SG[f], on = s.n > 0;
      h += '<div class="ev-l' + (on ? '' : ' off') + '" style="--c:' + FC[f].c + '"><div class="ev-lh"><b>' + FC[f].n + '</b><span class="ev-chip">' + (on ? 'Con señal' : 'Sin señal') + '</span></div><div class="ev-n">' + fmt(s.n) + '<small>' + esc(s.unit) + '</small></div>' +
        (s.items.length ? '<ul>' + s.items.map(function (i) { return '<li>' + (i.u ? '<a href="' + esc(i.u) + '"' + (/^http/.test(i.u) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(i.t) + '</a>' : esc(i.t)) + '<span>' + esc(i.s) + '</span></li>'; }).join("") + '</ul>' : '') + (s.nota ? '<div class="ev-nt">' + esc(s.nota) + '</div>' : '') + '</div>';
    });
    h += '</div>';
    if (ciegos.length) h += '<div class="ev-ciego"><b>Punto ciego:</b> para ' + esc(tipo) + ' el sistema no tiene conectada ninguna fuente ' + ciegos.map(function (f) { return '<b>' + FC[f].n.toLowerCase() + '</b>'; }).join(", ") + (con.length <= 1 ? '. Con una sola familia no se puede triangular: todo lo que aparece aquí queda <b>por confirmar</b>.' : '.') + '</div>';
    h += '<div class="ev-nota">Familias independientes = distinta forma de producir la información. Lectura automática, por validar con el CCES. Una coincidencia entre familias refuerza un hecho, pero no lo confirma por sí sola.</div></section>';
    el.innerHTML = h;
  }

  /* ---------- matriz de todos los tipos ---------- */
  function matriz(D) {
    var H = hay(D), c7 = {}, d0 = Date.now() - 7 * DIA; TIPOS.forEach(function (t) { c7[t[0]] = {}; });
    (D.ev || []).forEach(function (e) {
      var f = MAPF[e.origen], c = c7[e.categoria] ? e.categoria : "otra"; if (!f || (e.ts || 0) < d0) return;
      var k = e.origen === "foco" ? "f:" + (e.lugar || e.id) : e.id; (c7[c][f] = c7[c][f] || {})[k] = 1;
    });
    return TIPOS.map(function (t) {
      var fam = {}, n = 0; FAM.forEach(function (f) { var c = c7[t[0]][f.k] ? Object.keys(c7[t[0]][f.k]).length : 0; fam[f.k] = {c: c, hay: !!H[t[0]][f.k]}; if (c) n++; });
      return {k: t[0], n: t[1], fam: fam, nf: n, nHay: FAM.filter(function (f) { return H[t[0]][f.k]; }).length};
    });
  }
  function tabla(el, D, opt) {
    if (typeof el === "string") el = document.getElementById(el); if (!el) return; css(); opt = opt || {};
    var M = matriz(D), h = '<table class="cm-t"><thead><tr><th>Tipo de evento</th>' + FAM.map(function (f) { return '<th style="--c:' + f.c + '"><i></i>' + f.n + '</th>'; }).join("") + '<th style="text-align:left">Lectura</th></tr></thead><tbody>';
    M.forEach(function (r) {
      var lnk = r.k !== "otra" ? '<a href="modulo.html?t=' + encodeURIComponent(r.k) + '" style="color:inherit;text-decoration:none">' + r.n + '</a>' : r.n;
      h += '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;background:' + (S.COLCAT[r.k] || "#999") + '"></span>' + lnk + '</td>';
      FAM.forEach(function (f) { var c = r.fam[f.k]; h += !c.hay ? '<td class="cm-nf" title="Sin fuente conectada de esta familia para este tipo">sin fuente</td>' : c.c === 0 ? '<td><span class="cm-z" title="Fuente conectada, sin señal en 7 días">0</span></td>' : '<td><span class="cm-d" style="--c:' + f.c + ';--s:' + Math.round(Math.max(22, Math.min(46, 16 + 5 * Math.sqrt(c.c)))) + 'px" title="' + c.c + ' hechos en 7 días">' + (c.c > 99 ? "99+" : c.c) + '</span></td>'; });
      h += '<td><span class="cm-lec" style="--c:' + CV[Math.min(r.nf, 4)] + '">' + (r.nf === 0 ? 'Sin señal' : r.nf === 1 ? 'Una fuente' : 'Coinciden ' + r.nf) + '</span> <small style="color:var(--mut)">de ' + r.nHay + (r.nHay === 1 ? ' conectada' : ' conectadas') + '</small></td></tr>';
    });
    h += '</tbody></table>';
    var ciegos = M.filter(function (r) { return r.k !== "otra" && r.nHay <= 2; });
    if (ciegos.length) h += '<div class="cm-ciego"><b>Puntos ciegos del sistema:</b> ' + ciegos.map(function (r) { var q = FAM.filter(function (f) { return r.fam[f.k].hay; }).map(function (f) { return f.n.toLowerCase(); }); return '<b>' + r.n + '</b> solo tiene ' + (q.length ? q.join(" y ") : 'ninguna fuente'); }).join("; ") + '. Con tan pocas familias casi no hay con qué triangular: es donde conviene conectar más fuentes.</div>';
    el.innerHTML = h;
  }
  return {panel: panel, tabla: tabla, FAM: FAM, FC: FC, TIPOS: TIPOS, MAPF: MAPF, hay: hay};
})();

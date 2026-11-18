/* Centro de mando: dónde coinciden hoy fuentes INDEPENDIENTES (institucional, instrumental, satélite, modelo, prensa).
   Todo se calcula en el navegador con los archivos reales del repositorio. Si no hay dato, se dice "sin señal" o "sin fuente conectada". */
var CMD = (function () {
  var S = SALA, X = S2, A, T, DIA = 864e5, AHORA = Date.now(), HOY = S.diaKey(AHORA), map = null, modo = "conv", sel = null, SG = {}, R = {}, LISTA = [], LAB = [], cap = {ofi: 1, ins: 1, sat: 1, mod: 1, pre: 1}, NO = {};
  var FAM = [
    {k: "ofi", n: "Institucional", d: "Avisos y boletines oficiales (SENAMHI, Min. Salud, GDACS)", c: "#4c8dff"},
    {k: "ins", n: "Instrumental", d: "Sensores: sismógrafos San Calixto y USGS (M ≥ 4,0, 7 días)", c: "#a67cff"},
    {k: "sat", n: "Satélite", d: "NASA FIRMS: focos de calor (últimos 3 días)", c: "#ff8a3d"},
    {k: "mod", n: "Modelo", d: "GloFAS: ríos sobre el umbral alto P90", c: "#19b8a6"},
    {k: "pre", n: "Prensa", d: "Notas con ubicación (7 días)", c: "#8d98ab"}
  ];
  var FC = {}; FAM.forEach(function (f) { FC[f.k] = f; });
  var MAPF = {senamhi: "ofi", epidemiologia: "ofi", gdacs: "ofi", sismo: "ins", usgs: "ins", foco: "sat", eonet: "sat", modelo: "mod", caudal: "mod", sequia: "mod", prensa: "pre"};
  var TIPOS = [["geológica", "Geológica"], ["meteorológica", "Meteorológica"], ["hidrológica", "Hidrológica"], ["climatológica", "Climatológica"], ["biológica", "Biológica"], ["tecnológica", "Tecnológica"], ["antropogénica", "Antropogénica"], ["otra", "Sin clasificar"]];
  var CV = ["#8d98ab", "#f5b700", "#f26a1b", "#d7263d", "#a3004d"], CVT = ["Sin señal", "1 fuente", "2 fuentes", "3 fuentes", "4+ fuentes"];
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function $(i) { return document.getElementById(i); }
  function fmt(n, d) { return A.fmt(n, d); }
  function cv(n) { return CV[Math.min(n, 4)]; }
  function fechaC(s) { return s ? new Date(s + "T12:00:00").toLocaleDateString("es-BO", {day: "2-digit", month: "short"}) : "—"; }
  function ms(iso) { var t = Date.parse(iso); return isNaN(t) ? null : t; }
  function osc() { return document.documentElement.getAttribute("data-theme") === "dark"; }

  /* ---------- señales por municipio ---------- */
  function vacio() { return {ofi: [], ins: [], sat: 0, mod: [], pre: []}; }
  function calcular() {
    var D = T.D, idx = {}; SG = {}; LISTA = []; NO = {sinUbicar: [], proximos: 0, vigentes: 0, maxNiv: -1};
    T.lista.forEach(function (m) { idx[m.n + " (" + m.d + ")"] = m; SG[m.k] = vacio(); });
    /* institucional: avisos SENAMHI vigentes hoy (inicio <= hoy <= fin) con municipios ubicados */
    T.avisos.forEach(function (a) {
      if (a.inicio > HOY) { NO.proximos++; return; }
      NO.vigentes++; NO.maxNiv = Math.max(NO.maxNiv, a.nivel_num != null ? a.nivel_num : -1);
      var mm = (a.municipios || []).map(function (z) { return idx[z]; }).filter(Boolean);
      if (!mm.length) NO.sinUbicar.push(a);
      mm.forEach(function (m) { SG[m.k].ofi.push(a); });
    });
    /* instrumental: sismos M>=4,0 en 7 días (criterio de alerta del CCES) */
    var sis = ((D.sismos_oficiales || {}).sismos) || [];
    NO.sismos = sis.filter(function (s) { var t = ms(String(s.fecha_local).replace(" ", "T") + "-04:00"); s._t = t; return t && t >= AHORA - 7 * DIA && s.mag >= 4; });
    NO.sismos.forEach(function (s) { var m = T.donde(+s.lat, +s.lon); if (m) SG[m.k].ins.push(s); });
    /* satélite: focos de calor de los últimos 3 días */
    var d0 = S.diaKey(AHORA - 2 * DIA); NO.focos3 = 0; NO.focosDep = {};
    T.focos.forEach(function (p) { if (p[3] < d0) return; NO.focos3++; NO.focosDep[p[4]] = (NO.focosDep[p[4]] || 0) + 1; var m = T.M[p[4] + "|" + p[5]] || T.donde(p[0], p[1]); if (m) SG[m.k].sat++; });
    /* modelo: ríos con caudal previsto sobre P90 (nivel >= 2) */
    var pts = ((D.caudales || {}).puntos) || []; NO.rios = pts; NO.riosAltos = pts.filter(function (p) { return (p.nivel || 0) >= 2; });
    NO.riosAltos.forEach(function (p) { var m = T.donde(+p.lat, +p.lon); p._m = m; if (m) SG[m.k].mod.push(p); });
    /* prensa: notas de 7 días con coordenadas (las que solo traen departamento no se pueden poner en un municipio) */
    NO.prensa7 = 0; NO.prensaSinPunto = 0;
    D.ev.forEach(function (e) {
      if (e.origen !== "prensa" || e.ts < AHORA - 7 * DIA) return; NO.prensa7++;
      if (e.lat == null || e.lon == null) { NO.prensaSinPunto++; return; }
      var m = T.donde(+e.lat, +e.lon); if (m) SG[m.k].pre.push(e);
    });
    var RI = A.indices(T);
    T.lista.forEach(function (m) {
      var s = SG[m.k], por = {};
      function suma(c, f) { if (c === "otra" || !c) return; (por[c] = por[c] || {})[f] = 1; }
      s.ofi.forEach(function (a) { suma(catAviso(a), "ofi"); }); s.ins.forEach(function () { suma("geológica", "ins"); });
      if (s.sat > 0) suma("climatológica", "sat"); s.mod.forEach(function () { suma("hidrológica", "mod"); }); s.pre.forEach(function (e) { suma(e.categoria, "pre"); });
      var best = null; Object.keys(por).forEach(function (c) { var n = Object.keys(por[c]).length; if (!best || n > best.n) best = {c: c, n: n, f: Object.keys(por[c])}; });
      var hay = []; if (s.ofi.length) hay.push("ofi"); if (s.ins.length) hay.push("ins"); if (s.sat > 0) hay.push("sat"); if (s.mod.length) hay.push("mod"); if (s.pre.length) hay.push("pre");
      var sev = Math.max(-1, s.ofi.reduce(function (a, x) { return Math.max(a, x.nivel_num != null ? x.nivel_num : 0); }, -1), s.mod.reduce(function (a, p) { return Math.max(a, p.nivel || 0); }, -1));
      var o = {m: m, f: best ? best.f : [], n: best ? best.n : (hay.length ? 1 : 0), cat: best ? best.c : null, hay: hay, por: por, sev: sev, R: (RI[m.k] || {}).R, ri: RI[m.k]}; R[m.k] = o; if (o.n) LISTA.push(o);
    });
    LISTA.sort(function (a, b) { return b.n - a.n || b.sev - a.sev || (b.R || 0) - (a.R || 0); });
  }
  function catAviso(a) { var t = a.tipo || ((/HIDROL/i.test(a.titulo || "") ? "hidrológica" : /METEOR/i.test(a.titulo || "") ? "meteorológica" : /GEOL/i.test(a.titulo || "") ? "geológica" : "")); return t; }

  /* ---------- HTML ---------- */
  function actual(iso) { var t = typeof iso === "number" ? iso : ms(iso); return t ? X.ago(t) : "sin dato"; }
  function html() {
    var D = T.D, h = "";
    h += '<div class="cm-top"><div class="cm-parte" id="cmP"></div><div class="cm-fam" id="cmF"></div></div>';
    h += '<div class="cm-tool" id="cmT"><button data-m="conv" class="on" data-tip="Cuántas familias de fuentes independientes tienen señal en cada municipio hoy">Convergencia de fuentes</button><button data-m="risk" data-tip="Índice de riesgo relativo entre los 339 municipios (por validar con el CCES)">Riesgo base</button><button data-m="av" data-tip="Nivel máximo de aviso SENAMHI vigente">Avisos SENAMHI</button><button id="cmBol" data-tip="Volver a la vista de todo el país">Ver toda Bolivia</button><span class="sp"></span><label><input type="checkbox" id="cmFoc"> Focos de calor</label><label><input type="checkbox" id="cmSis" checked> Sismos M≥4</label><label><input type="checkbox" id="cmRio" checked> Ríos</label></div>';
    h += '<div class="cm-main"><div><div class="cm-mw"><div class="cm-map" id="cmMap"></div><div class="cm-lab" id="cmLab"></div></div><div class="cm-leg" id="cmLeg"></div></div>';
    h += '<div class="cm-side"><div class="cm-box cm-fi" id="cmFi"><div style="color:var(--mut);font-size:13px">Toque un municipio del mapa o de la lista para ver qué dice cada fuente.</div></div><div class="cm-box"><h2>Prioridades de hoy</h2><div class="cap" id="cmCap"></div><ol class="cm-rk" id="cmRk"></ol></div></div></div>';
    h += '<section class="cm-mx"><h2>Matriz de evidencia por tipo de evento <span style="font-weight:500;font-size:13px;color:var(--mut)">· últimos 7 días</span></h2><div class="cap">Cuántos hechos distintos aporta cada familia de fuentes. Una trama rayada significa que el sistema no tiene ninguna fuente conectada de esa familia para ese tipo: es un punto ciego.</div><div id="cmM"></div></section>';
    h += '<div class="cm-nota"><b>Cómo se lee.</b> «Convergencia» cuenta cuántas familias de fuentes independientes señalan el <b>mismo tipo de peligro</b> en el mismo municipio (por ejemplo, satélite y prensa sobre incendios); un aviso meteorológico y un accidente de tránsito no se refuerzan entre sí. No es una probabilidad ni un nivel de riesgo. Una sola familia = por confirmar; dos o más = coinciden. Los focos de calor incluyen quemas agrícolas. Las notas de prensa sin coordenadas no se pueden poner en un municipio y por eso no cuentan en el mapa. Lectura automática, <b>por validar con el CCES</b>. Datos de cada fuente: ver «Fuentes y estado».</div>';
    return h;
  }
  function parte() {
    var n2 = LISTA.filter(function (o) { return o.n >= 2; }), n1 = LISTA.length - n2.length, top = LISTA.slice(0, 3).filter(function (o) { return o.n >= 2; });
    var fd = Object.keys(NO.focosDep).sort(function (a, b) { return NO.focosDep[b] - NO.focosDep[a]; })[0], rA = NO.riosAltos, mx = NO.sismos.slice().sort(function (a, b) { return b.mag - a.mag; })[0];
    var NN = ["verde", "amarillo", "naranja", "rojo"];
    var h = '<div class="cm-eye">Parte de situación · ' + new Date(AHORA).toLocaleDateString("es-BO", {weekday: "long", day: "numeric", month: "long", timeZone: "America/La_Paz"}) + '</div>';
    h += '<h1>' + (n2.length ? '<b>' + n2.length + '</b> municipio' + (n2.length > 1 ? 's' : '') + ' con coincidencia de 2 o más fuentes' : 'Ningún municipio con coincidencia de 2 o más fuentes') + '</h1>';
    if (top.length) h += '<div class="cm-ln"><i style="--c:#d7263d"></i><div>Mayor convergencia: <b>' + top.map(function (o) { return esc(o.m.n) + ' (' + esc(o.m.d) + ', ' + esc(o.cat) + ')'; }).join('; ') + '</b>. ' + '<small>' + n1 + ' municipios más con una sola fuente: por confirmar.</small></div></div>';
    else h += '<div class="cm-ln"><i style="--c:#f5b700"></i><div><small>' + n1 + ' municipios con una sola fuente: por confirmar.</small></div></div>';
    h += '<div class="cm-ln"><i style="--c:' + FC.ofi.c + '"></i><div><b>SENAMHI:</b> ' + NO.vigentes + ' aviso' + (NO.vigentes === 1 ? '' : 's') + ' vigente' + (NO.vigentes === 1 ? '' : 's') + (NO.maxNiv >= 0 ? ' (nivel máximo ' + NN[NO.maxNiv] + ')' : '') + (NO.proximos ? ', ' + NO.proximos + ' por iniciar' : '') + '.' + (NO.sinUbicar.length ? ' <small>' + NO.sinUbicar.length + ' sin zonas ubicadas: no aparece' + (NO.sinUbicar.length > 1 ? 'n' : '') + ' en el mapa.</small>' : '') + '</div></div>';
    h += '<div class="cm-ln"><i style="--c:' + FC.mod.c + '"></i><div><b>Ríos (GloFAS):</b> ' + (rA.length ? rA.length + ' de ' + NO.rios.length + ' puntos sobre el umbral alto: ' + rA.map(function (p) { return esc(p.rio) + ' en ' + esc(p.nombre) + ' (' + Math.round((p.ratio_p90_max_10d || 0) * 100) + ' % del P90)'; }).join('; ') : 'ninguno de los ' + NO.rios.length + ' puntos supera el umbral alto') + '.</div></div>';
    h += '<div class="cm-ln"><i style="--c:' + FC.sat.c + '"></i><div><b>Satélite:</b> ' + fmt(NO.focos3) + ' focos de calor en 3 días' + (fd ? ', la mayoría en ' + esc(fd) : '') + '. <b>Sismos M≥4,0 (7 d):</b> ' + NO.sismos.length + (mx ? ', el mayor de ' + String(mx.mag).replace(".", ",") + ' en ' + esc(mx.departamento) : '') + '.</div></div>';
    $("cmP").innerHTML = h;
    var F = FAM;
    var fu = {ofi: (T.D.senamhi_alertas || {}).actualizado, ins: (T.D.sismos_oficiales || {}).actualizado, sat: (T.D.focos_detectados || {}).actualizado, mod: (T.D.caudales || {}).actualizado, pre: (T.D.eventos_unificados || {}).generado};
    $("cmF").innerHTML = F.map(function (f) { return '<div class="cm-f" style="--c:' + f.c + '"><b>' + f.n + '</b><span>' + f.d + '</span><em>' + actual(fu[f.k]) + '</em></div>'; }).join("");
  }
  function chips(o) { return '<span class="cm-ch">' + FAM.map(function (f) { return '<i class="' + (o.f.indexOf(f.k) < 0 ? 'off' : '') + '" style="--c:' + f.c + '" title="' + f.n + '"></i>'; }).join("") + '</span>'; }
  function lista() {
    var L = LISTA.slice(0, 10), n2 = LISTA.filter(function (o) { return o.n >= 2; }).length;
    $("cmCap").innerHTML = n2 + ' con 2 o más fuentes · ' + (LISTA.length - n2) + ' con una. Orden: fuentes que coinciden, gravedad del aviso o río, riesgo base.';
    $("cmRk").innerHTML = L.length ? L.map(function (o, i) { return '<li data-k="' + esc(o.m.k) + '"><span class="n">' + (i + 1) + '</span><span class="t"><b>' + esc(o.m.n) + '</b><small>' + esc(o.m.d) + ' · ' + (o.n >= 2 ? esc(o.cat) : 'una fuente') + '</small></span><span style="display:flex;flex-direction:column;gap:4px;align-items:flex-end"><span class="cm-cv" style="--c:' + cv(o.n) + '">' + o.n + '</span>' + chips(o) + '</span></li>'; }).join("") : '<li style="grid-template-columns:1fr;cursor:default"><span style="color:var(--mut);font-size:13px">Hoy ningún municipio tiene señal de ninguna fuente.</span></li>';
    [].forEach.call(document.querySelectorAll("#cmRk li[data-k]"), function (li) { li.onclick = function () { elegir(li.dataset.k, true); }; });
  }
  function ficha() {
    var o = sel && R[sel], box = $("cmFi"); if (!o) { box.innerHTML = '<div style="color:var(--mut);font-size:13px">Toque un municipio del mapa o de la lista para ver qué dice cada fuente.</div>'; return; }
    var s = SG[o.m.k], h = '<h3>' + esc(o.m.n) + ' <small>' + esc(o.m.d) + '</small></h3><div style="margin-top:4px;font-size:12.5px"><span class="cm-cv" style="--c:' + cv(o.n) + '">' + o.n + ' ' + (o.n === 1 ? 'fuente' : 'fuentes') + '</span> &nbsp;riesgo base: <b>' + (o.ri ? esc(o.ri.niv[1]) + ' (' + fmt(o.R, 1) + ')' : 'sin dato') + '</b> <small style="color:var(--mut)">· relativo entre municipios</small></div>' + (o.n >= 2 ? '<div style="margin-top:6px;font-size:12.8px"><b>Coinciden en ' + esc(o.cat) + ':</b> ' + o.f.map(function (k) { return FC[k].n.toLowerCase(); }).join(' + ') + '.</div>' : (o.n === 1 ? '<div style="margin-top:6px;font-size:12.8px;color:var(--mut)">Ningún tipo de peligro tiene dos fuentes distintas aquí: por confirmar.</div>' : ''));
    function fila(k, ok, tx) { return '<div class="cm-fr' + (ok ? '' : ' no') + '" style="--c:' + FC[k].c + '"><i></i><div><b>' + FC[k].n + ':</b> ' + tx + '</div></div>'; }
    h += fila("ofi", s.ofi.length, s.ofi.length ? s.ofi.map(function (a) { return '<a href="' + esc(a.url || a.pdf) + '" target="_blank" rel="noopener">' + esc((a.nivel || "").toLowerCase()) + ' · ' + esc(a.fenomeno || a.titulo) + '</a> (hasta ' + fechaC(a.fin) + ')'; }).join("; ") : 'sin aviso vigente');
    h += fila("ins", s.ins.length, s.ins.length ? s.ins.map(function (q) { return 'M ' + String(q.mag).replace(".", ",") + ', ' + esc(q.fecha_local.slice(5, 10).split("-").reverse().join("/")) + ', prof. ' + fmt(q.prof_km) + ' km'; }).join("; ") : 'sin sismo M≥4 en 7 días');
    h += fila("sat", s.sat > 0, s.sat > 0 ? fmt(s.sat) + ' focos de calor en 3 días' : 'sin focos en 3 días');
    h += fila("mod", s.mod.length, s.mod.length ? s.mod.map(function (p) { return esc(p.rio) + ' (' + esc(p.nombre) + '): ' + Math.round((p.ratio_p90_max_10d || 0) * 100) + ' % del P90' + ', máx. 10 d ' + fmt(p.caudal_max_10d) + ' m³/s'; }).join("; ") : 'sin río sobre P90 en este municipio');
    h += fila("pre", s.pre.length, s.pre.length ? s.pre.slice().sort(function (a, b) { return ((b.categoria === o.cat) - (a.categoria === o.cat)) || b.ts - a.ts; }).slice(0, 3).map(function (e) { var ok = o.n >= 2 && e.categoria === o.cat; return '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.titulo.length > 90 ? e.titulo.slice(0, 88) + "…" : e.titulo) + '</a> <small>(' + esc(e.fuente) + ' · ' + (ok ? '<b>corrobora: ' + esc(e.categoria) + '</b>' : 'otro tema: ' + esc(e.categoria)) + ')</small>'; }).join("<br>") + (s.pre.length > 3 ? '<br><small>y ' + (s.pre.length - 3) + ' más</small>' : '') : 'sin notas con ubicación en 7 días');
    h += '<div class="cm-act"><a class="btn p s" href="municipio.html?d=' + encodeURIComponent(o.m.d) + '&m=' + encodeURIComponent(o.m.n) + '">Ficha completa</a><a class="btn s" href="reporte.html?dep=' + encodeURIComponent(o.m.d) + '&mun=' + encodeURIComponent(o.m.n) + '">Reporte</a></div>';
    box.innerHTML = h;
  }
  function tablaMatriz() { EVI.tabla($("cmM"), T.D); }

  /* ---------- mapa ---------- */
  function colorFeat(o) {
    if (modo === "conv") return o.n === 1 ? "#8fa6c8" : o.n ? cv(o.n) : "rgba(0,0,0,0)";
    if (modo === "av") { var x = o.m.av; return x < 0 ? "rgba(0,0,0,0)" : ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"][x]; }
    return o.ri ? o.ri.niv[2] : "rgba(0,0,0,0)";
  }
  function geoMun() { return {type: "FeatureCollection", features: T.lista.map(function (m) { var o = R[m.k], c = colorFeat(o); return {type: "Feature", properties: {k: m.k, c: c, o: modo === "risk" ? .8 : modo === "av" ? (m.av >= 0 ? .78 : 0) : (o.n >= 2 ? .85 : o.n === 1 ? .3 : 0), s: m.k === sel ? 1 : 0}, geometry: m.f.geometry}; })}; }
  function geoRio() { return {type: "FeatureCollection", features: NO.rios.map(function (p, i) { var al = (p.nivel || 0) >= 2; return {type: "Feature", properties: {i: i, al: al ? 1 : 0, r: al ? 9 : 5}, geometry: {type: "Point", coordinates: [+p.lon, +p.lat]}}; })}; }
  function geoSis() { return {type: "FeatureCollection", features: NO.sismos.map(function (s, i) { return {type: "Feature", properties: {i: i, r: 4 + (s.mag - 4) * 7}, geometry: {type: "Point", coordinates: [+s.lon, +s.lat]}}; })}; }
  function geoFoc() { var d0 = S.diaKey(AHORA - 2 * DIA); return {type: "FeatureCollection", features: T.focos.filter(function (p) { return p[3] >= d0; }).map(function (p) { return {type: "Feature", properties: {}, geometry: {type: "Point", coordinates: [p[1], p[0]]}}; })}; }
  function leyenda() {
    var h = ""; if (modo === "conv") h = [0, 1, 2, 3, 4].map(function (n) { return '<span><i style="background:' + (n === 1 ? "#8fa6c8" : n ? CV[n] : "transparent") + ';opacity:' + (n === 1 ? .5 : 1) + '"></i>' + (n === 1 ? '1 fuente (tenue: por confirmar)' : n >= 2 ? CVT[n] + ' sobre el mismo peligro' : 'Sin señal') + '</span>'; }).join("");
    else if (modo === "av") h = ["Verde", "Amarillo", "Naranja", "Rojo"].map(function (t, i) { return '<span><i style="background:' + ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"][i] + '"></i>' + t + '</span>'; }).join("") + '<span>Sin color = sin aviso vigente ubicado</span>';
    else h = [[0, "Muy bajo"], [1, "Bajo"], [2, "Medio"], [3, "Alto"], [4, "Muy alto"]].map(function (z) { return '<span><i style="background:' + ["#2e9e5b", "#8bc34a", "#f5b700", "#f26a1b", "#d7263d"][z[0]] + '"></i>' + z[1] + '</span>'; }).join("") + '<span>Riesgo base relativo (339 municipios)</span>';
    $("cmLeg").innerHTML = h;
  }
  function crearMapa() {
    var d = osc();
    map = new maplibregl.Map({container: "cmMap", style: {version: 8, sources: {carto: {type: "raster", tiles: ["a", "b", "c", "d"].map(function (s) { return "https://" + s + ".basemaps.cartocdn.com/rastertiles/" + (d ? "dark_all" : "voyager") + "/{z}/{x}/{y}.png"; }), tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap, © CARTO"}}, layers: [{id: "bg", type: "background", paint: {"background-color": d ? "#0e1420" : "#dfe6ee"}}, {id: "carto", type: "raster", source: "carto", paint: {"raster-opacity": d ? .8 : .9}}]}, bounds: [[-69.8, -22.9], [-57.4, -9.6]], fitBoundsOptions: {padding: 8}, attributionControl: {compact: true}});
    map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); map.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-right");
    var pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
    map.on("load", function () {
      map.addSource("mun", {type: "geojson", data: geoMun()}); map.addSource("dep", {type: "geojson", data: T.D.geoDep}); map.addSource("rio", {type: "geojson", data: geoRio()}); map.addSource("sis", {type: "geojson", data: geoSis()}); map.addSource("foc", {type: "geojson", data: geoFoc()});
      map.addLayer({id: "mun-f", type: "fill", source: "mun", paint: {"fill-color": ["get", "c"], "fill-opacity": ["get", "o"]}});
      map.addLayer({id: "mun-l", type: "line", source: "mun", paint: {"line-color": d ? "#9fb0c8" : "#44546a", "line-width": .35, "line-opacity": .5}});
      map.addLayer({id: "dep-l", type: "line", source: "dep", paint: {"line-color": d ? "#e8eef7" : "#10233d", "line-width": 1.3, "line-opacity": .85}});
      map.addLayer({id: "sel-l", type: "line", source: "mun", filter: ["==", ["get", "s"], 1], paint: {"line-color": "#ffffff", "line-width": 3}});
      map.addLayer({id: "sel-l2", type: "line", source: "mun", filter: ["==", ["get", "s"], 1], paint: {"line-color": "#0b4f94", "line-width": 1.3}});
      map.addLayer({id: "foc", type: "circle", source: "foc", layout: {visibility: "none"}, paint: {"circle-radius": 1.8, "circle-color": "#ff8a3d", "circle-opacity": .75}});
      map.addLayer({id: "sis", type: "circle", source: "sis", paint: {"circle-radius": ["get", "r"], "circle-color": "#a67cff", "circle-opacity": .55, "circle-stroke-color": "#fff", "circle-stroke-width": 2}});
      map.addLayer({id: "rio", type: "circle", source: "rio", paint: {"circle-radius": ["get", "r"], "circle-color": ["case", ["==", ["get", "al"], 1], "#19b8a6", "#6b7a90"], "circle-stroke-color": ["case", ["==", ["get", "al"], 1], "#fff", "#cfd8e3"], "circle-stroke-width": 2}});
      map.on("mousemove", "mun-f", function (e) { var o = R[e.features[0].properties.k]; if (!o) return; map.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(o.m.n) + '</b> · ' + esc(o.m.d) + '<br>' + (o.n >= 2 ? 'coinciden ' + o.n + ' fuentes en ' + esc(o.cat) : o.n === 1 ? 'una fuente (por confirmar)' : 'sin señal hoy') + '</div>').addTo(map); });
      map.on("mouseleave", "mun-f", function () { map.getCanvas().style.cursor = ""; pop.remove(); });
      map.on("click", "mun-f", function (e) { elegir(e.features[0].properties.k, false); });
      map.on("mousemove", "rio", function (e) { var p = NO.rios[e.features[0].properties.i]; map.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.rio) + ' · ' + esc(p.nombre) + '</b><br>' + Math.round((p.ratio_p90_max_10d || 0) * 100) + ' % del P90 · ' + esc(p.estado) + '</div>').addTo(map); });
      map.on("mouseleave", "rio", function () { pop.remove(); });
      map.on("mousemove", "sis", function (e) { var q = NO.sismos[e.features[0].properties.i]; map.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">Sismo M ' + String(q.mag).replace(".", ",") + '</b><br>' + esc(q.fecha_local) + ' · ' + esc(q.departamento) + ' · prof. ' + fmt(q.prof_km) + ' km</div>').addTo(map); });
      map.on("mouseleave", "sis", function () { pop.remove(); });
      map.on("move", rotular); rotular();
    });
  }
  function rotular() {
    if (!map) return; var e = $("cmLab"), L = LISTA.filter(function (o) { return o.n >= 2; }).slice(0, 12).map(function (o) { return o.m.k; }); if (sel && L.indexOf(sel) < 0) L.push(sel);
    e.innerHTML = L.map(function (k) { var m = R[k].m, c = A.cenPoly(m.f.geometry), p = map.project(c); return '<span class="' + (k === sel ? "sel" : "") + '" style="left:' + p.x + 'px;top:' + p.y + 'px">' + esc(m.n) + '</span>'; }).join("");
  }
  function refrescar() { if (!map || !map.getSource("mun")) return; map.getSource("mun").setData(geoMun()); leyenda(); rotular(); }
  function elegir(k, vuela) {
    sel = k; ficha(); [].forEach.call(document.querySelectorAll("#cmRk li"), function (li) { li.classList.toggle("on", li.dataset.k === k); });
    if (map && vuela && R[k]) { var b = R[k].m.bb; map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: 90, maxZoom: 7.2, duration: 700}); }
    refrescar();
  }
  function iniciar() {
    TERR.cargar().then(function (t) {
      T = t; A = TERR.api; A.estilos(); X.header("centro.html"); document.title = "Centro de mando — Sala de Situación Bolivia";
      X.live(T.D.eventos_unificados && T.D.eventos_unificados.generado); calcular(); $("app").innerHTML = html(); parte(); lista(); tablaMatriz(); leyenda(); crearMapa();
      [].forEach.call(document.querySelectorAll("#cmT button"), function (b) { b.onclick = function () { modo = b.dataset.m; [].forEach.call(document.querySelectorAll("#cmT button"), function (z) { z.classList.toggle("on", z === b); }); refrescar(); }; });
      function vis(id, l) { $(id).onchange = function () { if (map && map.getLayer(l)) map.setLayoutProperty(l, "visibility", this.checked ? "visible" : "none"); }; }
      $("cmBol").onclick = function () { sel = null; ficha(); [].forEach.call(document.querySelectorAll("#cmRk li"), function (li) { li.classList.remove("on"); }); map.fitBounds([[-69.8, -22.9], [-57.4, -9.6]], {padding: 8, duration: 600}); refrescar(); };
      vis("cmFoc", "foc"); vis("cmSis", "sis"); vis("cmRio", "rio");
    });
  }
  return {iniciar: iniciar};
})();

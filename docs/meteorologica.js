/* Módulo Meteorológica: avisos oficiales SENAMHI por municipio (mapa), cronología tipo Gantt, población bajo aviso, pronóstico de modelo y prensa. */
var MET = (function () {
  var LG = {d: "", m: ""}, S = SALA, X = S2, A, T, AV = [], PR = [], FC = [], st = {p: "vig", f: "", pr: true}, sel = null, map = null, rq = 0, DEPC = {};
  var NC = ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"], NT = ["Verde", "Amarillo", "Naranja", "Rojo"], SIN = "#7b8794";
  var DIA = 864e5, HOY = S.diaKey(Date.now());
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function $(i) { return document.getElementById(i); }
  function nv(a) { if (a.nivel_num != null) return a.nivel_num; var i = NT.map(function (x) { return x.toUpperCase(); }).indexOf(String(a.nivel || "").toUpperCase().replace(/O$/, "O")); return i < 0 ? 1 : i; }
  function fen(a) { var f = (a.fenomeno || "").trim(); if (f) return f.replace(/\s+/g, " "); var m = /—\s*(.+)$/.exec(a.titulo || ""); return m ? m[1].trim() : "Aviso meteorológico"; }
  function fechaC(s) { return s ? new Date(s + "T12:00:00").toLocaleDateString("es-BO", {day: "2-digit", month: "short"}) : "—"; }
  function dentro(a, p) { if (p === "vig") return a.inicio <= HOY && a.fin >= HOY; if (p === "todo") return true; var d = S.diaKey(Date.now() - (+p) * DIA); return a.fin >= d; }
  function enA(a) { return !LG.d || ((a.departamentos || []).indexOf(LG.d) >= 0 && (!LG.m || (a.municipios || []).indexOf(LG.m + " (" + LG.d + ")") >= 0)); }
  function enM(m) { return !LG.d || (m.d === LG.d && (!LG.m || m.n === LG.m)); }
  function filtrados() { return AV.filter(function (a) { return dentro(a, st.p) && (!st.f || a._f === st.f) && enA(a); }); }
  function mapaNivel(L) { var o = {}; L.forEach(function (a) { (a.municipios || []).forEach(function (n) { var m = /^(.*) \((.*)\)$/.exec(n); if (!m) return; var k = m[2] + "|" + m[1]; o[k] = Math.max(o[k] == null ? -1 : o[k], a._n); }); }); return o; }

  function preparar(D) {
    AV = (((D.senamhi_alertas || {}).alertas) || []).filter(function (a) { return a.tipo !== "hidrológica" && !/HIDROL/i.test(a.titulo || ""); }).map(function (a) { a._n = nv(a); a._f = fen(a); return a; }).sort(function (a, b) { return (b.publicada || "").localeCompare(a.publicada || ""); });
    FC = D.ev.filter(function (e) { return e.categoria === "meteorológica" && e.origen === "modelo"; }).sort(function (a, b) { return a.ts - b.ts; });
    var R = /granizada|helada|nevada|lluvia|tormenta|vient|temporal|ola de (frío|calor)|sequ[ií]a|heladas|descenso/i;
    PR = D.ev.filter(function (e) { return e.categoria === "meteorológica" && e.origen === "prensa" && ((e.departamentos && e.departamentos.length) || e.lat != null) && R.test(e.titulo); });
  }
  function html() {
    var fens = {}; AV.forEach(function (a) { fens[a._f] = 1; });
    return '<nav class="tnav"><a href="index.html">Tablero</a><span class="tsep">›</span><b>Tipo de evento · Meteorológica</b></nav><h1 class="th">Meteorológica <small>avisos oficiales del SENAMHI y pronóstico</small></h1>' +
      '<div class="cap">Los <b>avisos</b> son oficiales (SENAMHI). El <b>pronóstico de modelo</b> (Open-Meteo) no es un aviso. Los avisos disponibles cubren unas semanas: <b>no permiten estimar frecuencia</b>. Información preliminar.</div>' +
      '<div class="xq"><div class="xs1" id="lgBox"></div><div class="xs1"><b>Período</b><select id="mP"><option value="vig">Vigentes hoy</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="todo">Todo lo disponible</option></select></div>' +
      '<div class="xs1"><b>Fenómeno</b><select id="mF"><option value="">Todos</option>' + Object.keys(fens).sort().map(function (f) { return '<option>' + esc(f) + '</option>'; }).join("") + '</select></div>' +
      '<div class="xs1"><b>Capas</b><label><input type="checkbox" id="mPr" checked> Reportes de prensa</label></div></div>' +
      '<div class="xhelp" id="mH"></div><div class="xg"><div class="xmw"><div class="xtool"><button data-b="osm" class="on">Calles</button><button data-b="sat">Satélite</button><button data-b="none">Sin mapa</button><label><input type="checkbox" id="mN" checked> Departamentos</label></div><div class="xmap" id="mMap"></div><div class="xleg" id="mL"></div><div class="xlab" id="mLb"></div></div>' +
      '<div class="xside"><div id="mK"></div><div id="mDet"></div><div id="mLs"></div></div></div><div id="eviP"></div>' +
      '<div class="xc" style="margin-top:12px"><h3>Cronología de avisos</h3><div id="mGm" class="nota"></div><div id="mG"></div><p class="nota">Cada barra es un aviso, del primer al último día de vigencia; el color es el nivel.</p></div>' +
      '<div class="xc" style="margin-top:12px"><div class="xtabs"><button class="on" data-s="mTa">Avisos (lista)</button><button data-s="mTf">Pronóstico de modelo</button><button data-s="mTp">Prensa</button></div><div id="mTa"></div><div id="mTf" style="display:none"></div><div id="mTp" style="display:none"></div></div>';
  }
  function popAfect(L) { var ms = mapaNivel(L), pob = 0, sd = 0, nn = 0; Object.keys(ms).forEach(function (k) { var m = T.M[k]; if (m && enM(m)) { if (m.pob == null) sd++; else pob += m.pob; } }); return {n: Object.keys(ms).filter(function (k) { return T.M[k] && enM(T.M[k]); }).length, pob: pob, sd: sd}; }
  function leyenda() { $("mL").innerHTML = '<b>Nivel de aviso (máximo)</b>' + NT.slice(1).map(function (n, i) { return '<span><i style="background:' + NC[i + 1] + '"></i>' + n + '</span>'; }).join("") + '<span><i style="background:#6b7a8c;opacity:.35"></i>Sin aviso en el filtro</span>' + (st.pr ? '<span style="margin-top:6px"><i style="background:#2d7fb8;border:2px solid #fff;border-radius:50%;width:11px;height:11px;box-sizing:border-box"></i>Reporte de prensa (aprox.)</span>' : ""); }
  function geoMun(L) { var ms = mapaNivel(L); return {type: "FeatureCollection", features: T.lista.map(function (m) { var v = enM(m) ? ms[m.k] : null; return {type: "Feature", geometry: m.f.geometry, properties: {k: m.k, c: v == null ? SIN : NC[Math.min(3, v)], o: v == null ? .1 : .72, s: sel === m.k ? 1 : 0}}; })}; }
  function geoPr() { return {type: "FeatureCollection", features: st.pr ? PR.filter(function (e) { return e.lat != null && LUGAR.ev(T, LG, e); }).map(function (e) { return {type: "Feature", geometry: {type: "Point", coordinates: [e.lon, e.lat]}, properties: {t: e.titulo, f: e.fuente || ""}}; }) : []}; }
  function rotular() { var l = $("mLb"); if (!map || !l) return; if (!$("mN").checked) { l.innerHTML = ""; return; } var o = ""; Object.keys(DEPC).forEach(function (d) { var p = map.project(DEPC[d]); o += '<span style="left:' + p.x.toFixed(0) + 'px;top:' + p.y.toFixed(0) + 'px">' + esc(d) + '</span>'; }); l.innerHTML = o; }
  function crearMapa() {
    var osc = document.documentElement.getAttribute("data-theme") === "dark";
    map = new maplibregl.Map({container: "mMap", style: {version: 8, sources: {osm: {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap"}, sat: {type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 17, attribution: "Imagen © Esri, Maxar"}}, layers: [{id: "bg", type: "background", paint: {"background-color": X.css("--soft") || "#e6ebf2"}}, {id: "osm", type: "raster", source: "osm", paint: {"raster-opacity": osc ? .5 : .8}}, {id: "sat", type: "raster", source: "sat", layout: {visibility: "none"}}]}, bounds: [[-70.2, -23.2], [-56.8, -8.8]], fitBoundsOptions: {padding: 10}, attributionControl: {compact: true}});
    map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); map.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-right");
    var pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
    map.on("load", function () {
      map.addSource("m", {type: "geojson", data: geoMun([])}); map.addSource("dep", {type: "geojson", data: {type: "FeatureCollection", features: T.D.geoDep.features}}); map.addSource("pr", {type: "geojson", data: geoPr()});
      map.addLayer({id: "m-f", type: "fill", source: "m", paint: {"fill-color": ["get", "c"], "fill-opacity": ["get", "o"]}});
      map.addLayer({id: "m-l", type: "line", source: "m", paint: {"line-color": "#ffffff", "line-width": .4, "line-opacity": .5}});
      LUGAR.capa(map); map.addLayer({id: "d-l", type: "line", source: "dep", paint: {"line-color": "#10233d", "line-width": 1.4, "line-opacity": .85}});
      map.addLayer({id: "m-s", type: "line", source: "m", filter: ["==", ["get", "s"], 1], paint: {"line-color": "#10233d", "line-width": 3.5}});
      map.addLayer({id: "pr", type: "circle", source: "pr", paint: {"circle-radius": 6, "circle-color": "#2d7fb8", "circle-stroke-color": "#fff", "circle-stroke-width": 2}});
      map.on("mousemove", "m-f", function (e) { var m = T.M[e.features[0].properties.k]; if (!m) return; map.getCanvas().style.cursor = "pointer"; var v = mapaNivel(filtrados())[m.k]; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(m.n) + ' <span style="font-weight:400">' + esc(m.d) + '</span></b>' + (v == null ? "Sin aviso en el filtro" : "Aviso " + NT[v].toLowerCase()) + ' · clic para ver el detalle</div>').addTo(map); });
      map.on("mouseleave", "m-f", function () { pop.remove(); map.getCanvas().style.cursor = ""; });
      map.on("click", "m-f", function (e) { sel = e.features[0].properties.k; selecciona(); });
      map.on("mousemove", "pr", function (e) { var p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.t) + '</b>' + esc(p.f) + ' · ubicación aproximada</div>').addTo(map); }); map.on("mouseleave", "pr", function () { pop.remove(); });
      map.on("move", function () { if (!rq) rq = requestAnimationFrame(function () { rq = 0; rotular(); }); }); map.on("resize", rotular);
      map._ok = 1; LUGAR.ajusta(map, T, LG, false); dibuja();
    });
    [].forEach.call(document.querySelectorAll(".xtool button"), function (b) { b.onclick = function () { [].forEach.call(document.querySelectorAll(".xtool button"), function (z) { z.classList.toggle("on", z === b); }); map.setLayoutProperty("osm", "visibility", b.dataset.b === "osm" ? "visible" : "none"); map.setLayoutProperty("sat", "visibility", b.dataset.b === "sat" ? "visible" : "none"); }; });
  }
  function selecciona() { if (map && map._ok) { map.getSource("m").setData(geoMun(filtrados())); } detalle(); }
  function avDe(m, L) { return L.filter(function (a) { return (a.municipios || []).indexOf(m.n + " (" + m.d + ")") >= 0; }); }
  function detalle() {
    var el = $("mDet"); if (!sel) { el.innerHTML = '<div class="xc xhint">Haga clic en un municipio coloreado para ver los avisos que lo incluyen.</div>'; return; }
    var m = T.M[sel], L = avDe(m, filtrados()), I = A.indices(T)[m.k];
    el.innerHTML = '<div class="xc"><h3>' + esc(m.n) + ' <span class="nota">' + esc(m.d) + '</span></h3>' + (L.length ? '<ul class="xl">' + L.map(function (a) { return '<li><b style="color:' + NC[Math.min(3, a._n)] + '">' + NT[Math.min(3, a._n)] + '</b> · ' + esc(a._f) + ' <span class="nota">(' + fechaC(a.inicio) + (a.fin !== a.inicio ? "–" + fechaC(a.fin) : "") + ')</span>' + (a.pdf ? ' <a href="' + esc(S.urlOk(a.pdf)) + '" target="_blank" rel="noopener">aviso</a>' : "") + '</li>'; }).join("") + '</ul>' : '<p class="nota">Sin avisos en el filtro actual.</p>') + '<p class="nota" style="margin:4px 0">' + A.fmt(m.pob) + ' hab. · riesgo integral ' + A.fmt(I.R, 1) + '/10 (por validar con CCES).</p><div class="xact"><a class="btn p" href="municipio.html?d=' + encodeURIComponent(m.d) + '&m=' + encodeURIComponent(m.n) + '">Ficha completa</a></div></div>';
  }
  function kpis(L) {
    var pa = popAfect(L), mx = L.reduce(function (a, x) { return Math.max(a, x._n); }, -1), vig = AV.filter(function (a) { return a.inicio <= HOY && a.fin >= HOY; });
    $("mK").innerHTML = '<div class="xc"><div class="xk"><div><b>' + L.length + '</b><span>avisos en el filtro</span></div><div><b style="color:' + (mx < 0 ? "inherit" : NC[Math.min(3, mx)]) + '">' + (mx < 0 ? "—" : NT[Math.min(3, mx)]) + '</b><span>nivel máximo</span></div><div><b>' + pa.n + '</b><span>municipios</span></div></div><p class="nota" style="margin:8px 0 0">' + (pa.pob ? 'Población en municipios bajo aviso: <b>' + A.fmt(pa.pob) + '</b>' + (pa.sd ? ' (' + pa.sd + ' sin dato)' : '') + '. ' : '') + (vig.length ? vig.length + ' aviso(s) vigente(s) hoy.' : '<b>No hay avisos meteorológicos vigentes hoy.</b>') + '</p></div>';
  }
  function lateral(L) {
    var o = {}; L.forEach(function (a) { var d = o[a._f] || (o[a._f] = {n: 0, mx: 0}); d.n++; d.mx = Math.max(d.mx, a._n); });
    var k = Object.keys(o).sort(function (a, b) { return o[b].n - o[a].n; });
    $("mLs").innerHTML = '<div class="xc"><h3>Por fenómeno</h3>' + (k.length ? '<table class="xt2">' + k.map(function (f) { return '<tr data-f="' + esc(f) + '"><td><i class="xdot" style="background:' + NC[Math.min(3, o[f].mx)] + '"></i>' + esc(f) + '</td><td style="text-align:right">' + o[f].n + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin avisos en el filtro.</p>') + '</div>';
    [].forEach.call(document.querySelectorAll("#mLs tr[data-f]"), function (r) { r.onclick = function () { $("mF").value = r.dataset.f; st.f = r.dataset.f; dibuja(); }; });
  }
  function gantt(L) {
    var el = $("mG"); $("mGm").textContent = L.length ? "" : "Sin avisos en el filtro."; if (!L.length) { el.style.height = "0"; var c0 = echarts.getInstanceByDom(el); if (c0) c0.clear(); return; }
    var fs = []; L.forEach(function (a) { if (fs.indexOf(a._f) < 0) fs.push(a._f); });
    var t0 = Math.min.apply(0, L.map(function (a) { return Date.parse(a.inicio + "T00:00:00-04:00"); })), t1 = Math.max.apply(0, L.map(function (a) { return Date.parse(a.fin + "T23:59:59-04:00"); }));
    el.style.height = (70 + fs.length * 34) + "px"; var ch = echarts.getInstanceByDom(el) || echarts.init(el, null, {renderer: "svg"}), tx = X.css("--mut") || "#888", ln = X.css("--line") || "#ccc";
    ch.setOption({animation: false, grid: {left: 190, right: 16, top: 10, bottom: 30}, tooltip: {formatter: function (p) { var a = p.data[3]; return esc(a._f) + '<br>' + NT[Math.min(3, a._n)] + ' · ' + fechaC(a.inicio) + ' – ' + fechaC(a.fin) + '<br>' + (a.n_municipios || (a.municipios || []).length) + ' municipios'; }}, xAxis: {type: "time", min: t0, max: t1 + DIA, axisLabel: {color: tx, fontSize: 11}, splitLine: {lineStyle: {color: ln}}}, yAxis: {type: "category", data: fs, inverse: true, axisLabel: {color: tx, fontSize: 11, width: 170, overflow: "truncate"}, axisLine: {lineStyle: {color: ln}}},
      series: [{type: "custom", renderItem: function (p, api) { var ci = api.value(0), s = api.coord([api.value(1), ci]), e = api.coord([api.value(2), ci]), h = Math.min(api.size([0, 1])[1] * .6, 20); return {type: "rect", shape: {x: s[0], y: s[1] - h / 2, width: Math.max(4, e[0] - s[0]), height: h, r: 3}, style: {fill: api.visual("color"), opacity: .9}}; }, encode: {x: [1, 2], y: 0}, data: L.map(function (a) { return {value: [fs.indexOf(a._f), Date.parse(a.inicio + "T00:00:00-04:00"), Date.parse(a.fin + "T23:59:59-04:00"), a], itemStyle: {color: NC[Math.min(3, a._n)]}}; })}]}, true);
    ch.resize();
  }
  function tablas(L) {
    $("mTa").innerHTML = L.length ? '<table class="xt2"><tr><th align="left">Publicado</th><th align="left">Fenómeno</th><th>Nivel</th><th align="left">Vigencia</th><th align="left">Departamentos</th><th>Muni.</th></tr>' + L.map(function (a) { return '<tr><td>' + esc((a.publicada || "").slice(0, 16)) + '</td><td>' + (a.pdf ? '<a href="' + esc(S.urlOk(a.pdf)) + '" target="_blank" rel="noopener">' + esc(a._f) + '</a>' : esc(a._f)) + '</td><td align="center"><i class="xdot" style="background:' + NC[Math.min(3, a._n)] + '"></i>' + NT[Math.min(3, a._n)] + '</td><td>' + fechaC(a.inicio) + (a.fin !== a.inicio ? " – " + fechaC(a.fin) : "") + '</td><td>' + esc((a.departamentos || []).join(", ")) + '</td><td align="center">' + (a.n_municipios || (a.municipios || []).length) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin avisos con este filtro.</p>';
    var fut = FC.filter(function (e) { return e.ts >= Date.now() - DIA; });
    $("mTf").innerHTML = '<p class="nota"><b>Pronóstico de modelo (Open-Meteo), no es un aviso oficial.</b> Son umbrales superados en las ciudades capitales; compárelo siempre con SENAMHI.</p>' + (FC.length ? '<table class="xt2">' + FC.slice().reverse().slice(0, 40).map(function (e) { return '<tr><td style="white-space:nowrap">' + esc(e.titulo.split(":")[0]) + '</td><td>' + esc(e.titulo.split(": ").slice(1).join(": ")) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin datos de modelo.</p>');
    $("mTp").innerHTML = '<p class="nota">Notas de prensa con lugar identificado. La posición es aproximada.</p>' + (PR.filter(function (e) { return LUGAR.ev(T, LG, e); }).length ? '<table class="xt2">' + PR.filter(function (e) { return LUGAR.ev(T, LG, e); }).map(function (e) { return '<tr><td style="white-space:nowrap">' + esc(new Date(e.ts).toLocaleDateString("es-BO", {day: "2-digit", month: "short"})) + '</td><td>' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.titulo) + '</a>' : esc(e.titulo)) + '</td><td class="nota">' + esc(e.fuente || "") + '</td><td class="nota">' + esc((e.departamentos || []).join(", ")) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin notas.</p>');
  }
  function dibuja() {
    var L = filtrados(); leyenda();
    $("mH").innerHTML = '<b>' + L.length + ' aviso' + (L.length === 1 ? "" : "s") + '</b> en ' + esc(LUGAR.etiqueta(LG)) + ' · ' + ({vig: "vigentes hoy", 7: "últimos 7 días", 30: "últimos 30 días", todo: "todo lo disponible"})[st.p] + (st.f ? " · " + esc(st.f) : "") + ' <span class="nota">— Fuente: SENAMHI (avisos meteorológicos). Excluye los hidrológicos, que están en su propio módulo.</span>';
    if (map && map._ok) { map.getSource("m").setData(geoMun(L)); map.getSource("pr").setData(geoPr()); rotular(); }
    kpis(L); lateral(L); gantt(L); tablas(L); detalle();
  }
  function iniciar() {
    TERR.cargar().then(function (t) { T = t; A = TERR.api; A.estilos(); X.header("modulo.html"); document.title = "Meteorológica — Sala de Situación Bolivia"; preparar(T.D); $("app").innerHTML = html(); if (window.EVI) EVI.panel("eviP", "meteorológica", T.D);
      (T.D.geoDep.features || []).forEach(function (f) { DEPC[f.properties.n] = A.cenPoly(f.geometry); });
      LUGAR.init(T, $("lgBox"), LG, function () { sel = null; dibuja(); LUGAR.ajusta(map, T, LG); }); $("mP").onchange = function () { st.p = this.value; dibuja(); }; $("mF").onchange = function () { st.f = this.value; dibuja(); }; $("mPr").onchange = function () { st.pr = this.checked; dibuja(); }; $("mN").onchange = rotular;
      [].forEach.call(document.querySelectorAll(".xtabs button"), function (b) { b.onclick = function () { [].forEach.call(document.querySelectorAll(".xtabs button"), function (z) { z.classList.toggle("on", z === b); $(z.dataset.s).style.display = z === b ? "" : "none"; }); }; });
      crearMapa(); dibuja(); });
  }
  return {iniciar: iniciar};
})();

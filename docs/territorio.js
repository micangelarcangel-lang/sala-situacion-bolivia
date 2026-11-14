/* Arquitectura territorial: Bolivia › Departamento › Municipio. Mismas secciones en cada nivel, de lo general a lo específico. */
var TERR = (function () {
  var S = SALA, X = S2, C = {}, ANIO = Math.min(2034, new Date().getFullYear()), COL = {salud: "#2e7d32", bomberos: "#c62828", rescate: "#ef6c00", "policía": "#1565c0", focos: "#ff6d00", sismos: "#6a1b9a"};
  var SD = '<span class="sd">sin dato</span>';
  function jget(u) { return C[u] || (C[u] = fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })); }
  function fmt(n, d) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("es-BO", {maximumFractionDigits: d || 0}); }
  function hav(a, b, c, d) { var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, q = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 12742 * Math.asin(Math.sqrt(q)); }
  function polys(g) { return g.type === "Polygon" ? [g.coordinates] : g.coordinates; }
  function bbox(g) { var b = [180, 90, -180, -90]; polys(g).forEach(function (p) { p[0].forEach(function (c) { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; }); }); return b; }
  function area(g) { var t = 0; polys(g).forEach(function (p) { p.forEach(function (r, i) { var k = 111.32 * Math.cos(r[0][1] * Math.PI / 180), q = 0; for (var j = 0; j < r.length - 1; j++) q += (r[j][0] * k) * (r[j + 1][1] * 110.57) - (r[j + 1][0] * k) * (r[j][1] * 110.57); t += (i ? -1 : 1) * Math.abs(q) / 2; }); }); return t; }
  function dentro(g, lat, lon) { return polys(g).some(function (p) { var r = p[0], ins = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { if (((r[i][1] > lat) !== (r[j][1] > lat)) && (lon < (r[j][0] - r[i][0]) * (lat - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0])) ins = !ins; } return ins; }); }
  function pad(b, k) { return [b[0] - k, b[1] - k, b[2] + k, b[3] + k]; }
  function cargar() {
    return Promise.all([X.datos(), jget("poblacion_mun.json"), jget("establecimientos_salud.json"), jget("servicios_emergencia.json"), jget("desastres_historicos.json"), jget("indicadores_dep.json")]).then(function (r) {
      var D = r[0], T = {D: D, pob: r[1], est: (r[2] || {}).puntos || [], emer: (r[3] || {}).puntos || [], dh: r[4], ind: r[5], M: {}, DEP: {}, lista: []};
      ((D.geoMun || {}).features || []).forEach(function (f) { var k = f.properties.d + "|" + f.properties.n, p = T.pob && T.pob.municipios[k]; var m = {k: k, d: f.properties.d, n: f.properties.n, f: f, bb: bbox(f.geometry), km2: area(f.geometry), pob: p ? p.est[ANIO] : null, est: [], bom: [], pol: [], res: [], foc: 0}; T.M[k] = m; T.lista.push(m); (T.DEP[m.d] = T.DEP[m.d] || []).push(m); });
      function donde(lat, lon) { for (var i = 0; i < T.lista.length; i++) { var m = T.lista[i]; if (lon >= m.bb[0] && lon <= m.bb[2] && lat >= m.bb[1] && lat <= m.bb[3] && dentro(m.f.geometry, lat, lon)) return m; } return null; }
      T.donde = donde;
      T.est.forEach(function (p) { var m = donde(p[0], p[1]); if (m) m.est.push(p); });
      T.emer.forEach(function (p) { var m = donde(p[0], p[1]); if (m) (p[3] === "bomberos" ? m.bom : p[3] === "rescate" ? m.res : m.pol).push(p); });
      var fp = (D.focos_puntos || {}).puntos || []; T.focos = fp; fp.forEach(function (p) { var m = donde(p[0], p[1]); if (m) m.foc++; });
      return T;
    });
  }
  function densidad(m) { return m.pob != null && m.km2 ? m.pob / m.km2 : null; }
  function popDep(T, d) { var p = T.pob && T.pob.departamentos[d]; return p ? p[ANIO] : null; }
  function popPais(T) { var p = T.pob && T.pob.departamentos.Bolivia; return p ? p[ANIO] : null; }
  /* más cercano en línea recta (referencial) */
  function cercano(lista, lat, lon, filtro) { var b = null; lista.forEach(function (p) { if (filtro && !filtro(p)) return; var d = hav(lat, lon, p[0], p[1]); if (!b || d < b.km) b = {km: d, p: p}; }); return b; }
  function esHosp(p) { return /hospital/i.test(p[2]); }
  function centroM(m) { return [(m.bb[1] + m.bb[3]) / 2, (m.bb[0] + m.bb[2]) / 2]; }
  /* antecedentes DesInventar */
  function antM(T, k) { var R = (T.dh && T.dh.municipios[k]) || []; var o = {n: R.length, m: 0, a: 0, tipos: {}}; R.forEach(function (r) { o.m += r[3]; o.a += r[5]; o.tipos[r[2]] = (o.tipos[r[2]] || 0) + 1; }); return o; }
  function antD(T, d) { var E = (T.dh && T.dh.departamentos[d]) || {}, o = {n: 0, m: 0, a: 0, tipos: {}}; Object.keys(E).forEach(function (t) { o.n += E[t][0]; o.m += E[t][1]; o.a += E[t][2]; o.tipos[t] = E[t][0]; }); return o; }
  function antP(T) { var o = {n: 0, m: 0, a: 0, tipos: {}}; Object.keys((T.dh && T.dh.departamentos) || {}).forEach(function (d) { var x = antD(T, d); o.n += x.n; o.m += x.m; o.a += x.a; Object.keys(x.tipos).forEach(function (t) { o.tipos[t] = (o.tipos[t] || 0) + x.tipos[t]; }); }); return o; }
  function topTipos(o, n) { return Object.keys(o.tipos).sort(function (a, b) { return o.tipos[b] - o.tipos[a]; }).slice(0, n || 5); }
  /* eventos del sistema en un territorio */
  function eventosT(T, d, m) { return T.D.ev.filter(function (e) { if (e.origen === "modelo") return false; if (m) { if ((e.departamentos || []).indexOf(d) < 0 && e.departamentos && e.departamentos.length) return false; if (e.lat != null && e.lon != null) return dentro(m.f.geometry, +e.lat, +e.lon); return String(e.lugar || "").toLowerCase().indexOf(m.n.toLowerCase()) >= 0; } return (e.departamentos || []).indexOf(d) >= 0; }).sort(function (a, b) { return b.ts - a.ts; }); }
  function listaEv(L, n) { if (!L.length) return '<p class="nota">Sin eventos registrados por el sistema en este territorio (el historial propio empieza el 22 de octubre de 2026).</p>'; return L.slice(0, n || 8).map(function (e) { return '<a class="alert" href="evento.html?id=' + encodeURIComponent(e.id) + '" style="--c:' + (S.COLCAT[e.categoria] || "#888") + '"><b>' + S.esc((e.titulo || "").slice(0, 110)) + '</b><span>' + S.fecha(e.ts, true) + ' · ' + S.esc(e.categoria) + '</span></a>'; }).join("") + (L.length > (n || 8) ? '<p class="nota">+ ' + (L.length - (n || 8)) + ' evento(s) más en el reporte.</p>' : ""); }
  /* ---- bloques HTML comunes ---- */
  function crumbs(d, m) { return '<div class="crumbs"><a href="index.html">Bolivia</a>' + (d ? ' › <a href="departamento.html?d=' + encodeURIComponent(d) + '">' + S.esc(d) + '</a>' : '') + (m ? ' › <b>' + S.esc(m) + '</b>' : "") + '</div>'; }
  function kpis(a) { return '<div class="xm-k tk">' + a.map(function (x) { return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join("") + '</div>'; }
  function tabla(cab, filas) { return '<div class="xm-l"><table class="tt"><tr>' + cab.map(function (c, i) { return '<th' + (i ? ' style="text-align:right"' : "") + '>' + c + '</th>'; }).join("") + '</tr>' + filas.map(function (f) { return '<tr>' + f.map(function (c, i) { return '<td' + (i ? ' style="text-align:right"' : "") + '>' + c + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></div>'; }
  function porMil(n, p, k) { return n != null && p ? fmt(n / p * (k || 1000), 1) : SD; }
  var SDIND = [["Pobreza (NBI)", "% de hogares con necesidades básicas insatisfechas"], ["Agua y saneamiento", "% de viviendas con acceso"], ["Electricidad", "% de viviendas con acceso"], ["Educación", "analfabetismo, años de estudio, asistencia"], ["Índice de Desarrollo Humano", "PNUD Bolivia"]];
  function bloqueDesarrollo(nivel, dep) { return '<div class="card"><h2>Desarrollo humano y condiciones de vida</h2><div class="cap">Se compara ' + nivel + ' con ' + (dep ? "el país" : "su departamento y con el país") + ' cuando existan los datos oficiales. <b>Aún no están cargados</b>: no se estiman ni se inventan.</div>' + tabla(dep ? ["Indicador", "Departamento", "Bolivia"] : ["Indicador", "Municipio", "Departamento", "Bolivia"], SDIND.map(function (r) { return [S.esc(r[0]) + '<br><span class="nota">' + r[1] + '</span>'].concat(dep ? [SD, SD] : [SD, SD, SD]); })) + '<p class="nota">Pendiente: cuadros del INE por municipio (Censo 2024 / geoportal) y del PNUD.</p></div>'; }
  function lineaVial() { return '<p class="nota">Red vial y ríos: aún no incorporadas al mapa (siguiente fase).</p>'; }
  /* ---- mapa con capas ---- */
  function mapa(id, T, opt) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark";
    var m = new maplibregl.Map({container: id, style: {version: 8, sources: {base: {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap"}}, layers: [{id: "bg", type: "background", paint: {"background-color": X.css("--soft")}}, {id: "base", type: "raster", source: "base", paint: {"raster-opacity": osc ? .6 : .85, "raster-brightness-max": osc ? .6 : 1}}]}, bounds: [[opt.bb[0], opt.bb[1]], [opt.bb[2], opt.bb[3]]], fitBoundsOptions: {padding: 30}});
    m.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right");
    var B = pad(opt.bb, opt.margen == null ? .3 : opt.margen);
    function en(p) { return p[1] >= B[0] && p[1] <= B[2] && p[0] >= B[1] && p[0] <= B[3]; }
    function fc(arr, fn) { return {type: "FeatureCollection", features: arr.filter(en).map(function (p) { return {type: "Feature", geometry: {type: "Point", coordinates: [p[1], p[0]]}, properties: fn(p)}; })}; }
    var capas = {
      salud: {n: "Salud (OSM)", g: fc(T.est, function (p) { return {t: p[2], s: p[3] + " · " + (p[4] || "")}; }), r: 3.5, on: true},
      bomberos: {n: "Bomberos", g: fc(T.emer.filter(function (p) { return p[3] === "bomberos"; }), function (p) { return {t: p[2], s: "Bomberos"}; }), r: 6, on: true},
      rescate: {n: "Rescate", g: fc(T.emer.filter(function (p) { return p[3] === "rescate"; }), function (p) { return {t: p[2], s: "Rescate"}; }), r: 6, on: true},
      "policía": {n: "Policía", g: fc(T.emer.filter(function (p) { return p[3] === "policía"; }), function (p) { return {t: p[2], s: "Policía"}; }), r: 3.5, on: true},
      focos: {n: "Focos de calor (14 d)", g: fc(T.focos, function (p) { return {t: "Foco de calor", s: p[3] + " · " + p[2] + " MW"}; }), r: 3, on: true},
      sismos: {n: "Sismos", g: {type: "FeatureCollection", features: (((T.D.sismos_oficiales || {}).sismos) || []).filter(function (s) { return en([s.lat, s.lon]); }).map(function (s) { return {type: "Feature", geometry: {type: "Point", coordinates: [s.lon, s.lat]}, properties: {t: "Sismo M " + s.mag, s: s.fecha_local}}; })}, r: 6, on: true},
      eventos: {n: "Eventos del sistema", g: {type: "FeatureCollection", features: T.D.ev.filter(function (e) { return e.lat != null && e.lon != null && e.origen !== "foco" && en([+e.lat, +e.lon]); }).map(function (e) { return {type: "Feature", geometry: {type: "Point", coordinates: [+e.lon, +e.lat]}, properties: {t: e.titulo, s: e.categoria, c: S.COLCAT[e.categoria] || "#888", id: e.id}}; })}, r: 7, on: true}
    };
    m.on("load", function () {
      m.addSource("mun", {type: "geojson", data: opt.geo}); m.addSource("dep", {type: "geojson", data: T.D.geoDep || {type: "FeatureCollection", features: []}});
      m.addLayer({id: "mun-f", type: "fill", source: "mun", paint: {"fill-color": opt.relleno || "#1d6fb8", "fill-opacity": opt.op || .12}});
      m.addLayer({id: "mun-l", type: "line", source: "mun", paint: {"line-color": "#0b3b6e", "line-width": opt.resalta ? 2.4 : .8, "line-opacity": .8}});
      if (opt.otros) { m.addSource("otros", {type: "geojson", data: opt.otros}); m.addLayer({id: "otros-l", type: "line", source: "otros", paint: {"line-color": "#6b7a90", "line-width": .6, "line-opacity": .6}}, "mun-f"); }
      Object.keys(capas).forEach(function (k) { var c = capas[k]; m.addSource("c-" + k, {type: "geojson", data: c.g}); m.addLayer({id: "c-" + k, type: "circle", source: "c-" + k, paint: {"circle-radius": c.r, "circle-color": k === "eventos" ? ["get", "c"] : COL[k] || "#888", "circle-opacity": .9, "circle-stroke-width": 1, "circle-stroke-color": "#fff"}}); m.on("click", "c-" + k, function (e) { var p = e.features[0].properties; new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop"><b>' + S.esc(p.t) + '</b>' + S.esc(p.s || "") + (p.id ? '<br><a href="evento.html?id=' + encodeURIComponent(p.id) + '">Ver hecho</a>' : "") + '</div>').addTo(m); }); m.on("mouseenter", "c-" + k, function () { m.getCanvas().style.cursor = "pointer"; }); m.on("mouseleave", "c-" + k, function () { m.getCanvas().style.cursor = ""; }); });
      if (opt.alCargar) opt.alCargar(m);
    });
    var chk = '<div class="mb-g">' + Object.keys(capas).map(function (k) { return '<label class="ck"><input type="checkbox" data-c="' + k + '" checked> <i class="dot" style="background:' + (COL[k] || "#555") + '"></i>' + capas[k].n + ' <span class="nota">(' + capas[k].g.features.length + ')</span></label>'; }).join("") + '</div><p class="nota">Salud, bomberos, rescate y policía provienen de OpenStreetMap (mapeo voluntario, incompleto en zonas rurales). Red vial y ríos: siguiente fase.</p>';
    return {map: m, capas: capas, ctl: chk, ligar: function (el) { el.querySelectorAll("input[data-c]").forEach(function (i) { i.onchange = function () { try { m.setLayoutProperty("c-" + i.dataset.c, "visibility", i.checked ? "visible" : "none"); } catch (e) {} }; }); }};
  }
  /* ---- contexto sectorial INE por departamento ---- */
  function bloqueSector(T, d) {
    var I = T.ind; if (!I) return '<div class="card"><h2>Contexto sectorial (INE)</h2><p class="nota">No se pudo cargar.</p></div>';
    function ult(o, k) { var v = o.datos[k]; if (!v) return null; for (var i = v.length - 1; i >= 0; i--) if (v[i] != null) return {a: o.anios[i], v: v[i], i: i}; return null; }
    var pd = popDep(T, d), pp = popPais(T), pa = I.parque_automotor, de = I.desmonte_ha, it = I.internet, pob24d = T.pob && T.pob.departamentos[d] && T.pob.departamentos[d]["2024"], pob24p = T.pob && T.pob.departamentos.Bolivia["2024"];
    var vd = ult(pa, d), vp = ult(pa, "Bolivia"), dd = ult(de, d), dp = ult(de, "Bolivia");
    function tot(k) { var x = it.datos[k]; return x ? x.fija + x.inalambrica + x.movil : null; }
    var tp = 0; Object.keys(it.datos).forEach(function (k) { tp += tot(k); });
    function sum5(k) { var v = de.datos[k]; if (!v) return null; var s = 0, n = v.length; for (var i = Math.max(0, n - 5); i < n; i++) s += v[i] || 0; return s; }
    return '<div class="card"><h2>Contexto sectorial del departamento (INE)</h2><div class="cap">Cuadros departamentales del INE: movilidad, conectividad y presión sobre el bosque. No existen por municipio.</div>' + tabla(["Indicador", S.esc(d), "Bolivia"], [
      ["Parque automotor " + (vd ? vd.a : "") + " (vehículos)", vd ? fmt(vd.v) : SD, vp ? fmt(vp.v) : SD],
      ["Vehículos por 1.000 hab. (población " + ANIO + ")", vd && pd ? fmt(vd.v / pd * 1000, 0) : SD, vp && pp ? fmt(vp.v / pp * 1000, 0) : SD],
      ["Conexiones de internet (" + it.periodo + ")", tot(d) != null ? fmt(tot(d)) : SD, fmt(tp)],
      ["Conexiones por 1.000 hab. (ref.: población 2024)", tot(d) != null && pob24d ? fmt(tot(d) / pob24d * 1000, 0) : SD, fmt(tp / pob24p * 1000, 0)],
      ["Desmonte autorizado " + (dd ? dd.a : "") + " (ha)", dd ? fmt(dd.v) : SD, dp ? fmt(dp.v) : SD],
      ["Desmonte autorizado, últimos 5 años (ha)", sum5(d) != null ? fmt(sum5(d)) : SD, fmt(sum5("Bolivia"))]
    ]) + '<p class="nota">Fuente: INE (RUAT, ATT, ABT). Las conexiones suman fija, inalámbrica y móvil (líneas, no personas). ' + S.esc(I.meta.aviso) + '</p></div>';
  }
  /* ---- reportes (botones) ---- */
  function bloqueReporte(d, m) {
    var q = "dep=" + encodeURIComponent(d) + (m ? "&mun=" + encodeURIComponent(m) : "");
    return '<div class="card noimp"><h2>Reportes de este territorio</h2><div class="cap">PDF con contexto territorial, situación y antecedentes. Elija el período; «todos los eventos» o un solo tipo.</div><div class="mb-g"><label class="nota">Período <select id="rpPer"><option value="7">7 días</option><option value="30" selected>30 días</option><option value="90">90 días</option><option value="365">12 meses</option><option value="400">Todo el historial</option></select></label><label class="nota">Tipo <select id="rpCat"><option value="">Todos los eventos</option>' + S.CAT.slice(0, 7).map(function (c) { return '<option>' + c + '</option>'; }).join("") + '</select></label><a class="btn p" id="rpGo" href="#">Generar reporte (PDF)</a></div></div>';
  }
  function ligarReporte(d, m) {
    var a = document.getElementById("rpGo"); if (!a) return;
    function u() { var c = document.getElementById("rpCat").value; a.href = "reporte.html?dep=" + encodeURIComponent(d) + (m ? "&mun=" + encodeURIComponent(m) : "") + "&per=" + document.getElementById("rpPer").value + (c ? "&cat=" + encodeURIComponent(c) : ""); }
    document.getElementById("rpPer").onchange = u; document.getElementById("rpCat").onchange = u; u();
  }
  function barras(id, o, tit) { var k = topTipos(o, 8).reverse(); if (!k.length) { document.getElementById(id).innerHTML = '<p class="nota">Sin antecedentes registrados.</p>'; return; } X.chart(id, {grid: {left: 120, right: 20, top: 6, bottom: 20}, xAxis: {type: "value"}, yAxis: {type: "category", data: k}, series: [{type: "bar", data: k.map(function (t) { return o.tipos[t]; }), itemStyle: {color: "#1d6fb8"}}], tooltip: {trigger: "axis"}}, 220); }
  /* ---- contexto para el reporte PDF (HTML liviano) ---- */
  function contexto(D, d, mn) {
    return cargar().then(function (T) {
      var m = mn ? T.lista.filter(function (x) { return x.d === d && x.n === mn; })[0] : null, h = '', ant, pob, km2, nm;
      if (mn && !m) return '<p class="nota">Municipio no encontrado.</p>';
      var L = m ? [m] : (T.DEP[d] || []);
      pob = L.reduce(function (s, x) { return s + (x.pob || 0); }, 0); km2 = L.reduce(function (s, x) { return s + x.km2; }, 0);
      ant = m ? antM(T, m.k) : antD(T, d);
      var nE = L.reduce(function (s, x) { return s + x.est.length; }, 0), nB = L.reduce(function (s, x) { return s + x.bom.length + x.res.length; }, 0), nP = L.reduce(function (s, x) { return s + x.pol.length; }, 0), nF = L.reduce(function (s, x) { return s + x.foc; }, 0);
      h += '<h2>Contexto territorial · ' + S.esc(m ? m.n + " (" + d + ")" : d) + '</h2><table><tr><th>Habitantes ' + ANIO + ' (INE)</th><th>Superficie</th><th>Densidad</th><th>Estab. de salud (OSM)</th><th>Bomberos/rescate</th><th>Policía</th><th>Focos 14 d</th></tr><tr><td>' + fmt(pob) + '</td><td>' + fmt(km2) + ' km²</td><td>' + fmt(pob / km2, 1) + ' hab/km²</td><td>' + nE + '</td><td>' + nB + '</td><td>' + nP + '</td><td>' + nF + '</td></tr></table>';
      if (m) { var c = centroM(m), hp = cercano(T.est, c[0], c[1], esHosp), bo = cercano(T.emer, c[0], c[1], function (p) { return p[3] === "bomberos" || p[3] === "rescate"; }); h += '<p style="margin:4px 0 0">Hospital más cercano al centro del municipio: <b>' + (m.est.some(esHosp) ? "dentro del municipio" : hp ? S.esc(hp.p[2]) + ", ≈" + Math.round(hp.km) + " km en línea recta" : "sin dato") + '</b>. Bomberos o rescate más cercano: <b>' + (m.bom.length || m.res.length ? "dentro del municipio" : bo ? S.esc(bo.p[2]) + ", ≈" + Math.round(bo.km) + " km" : "sin dato") + '</b>. <span class="nota">Distancias en línea recta, referenciales.</span></p>'; }
      h += '<h2>Antecedentes históricos (DesInventar, hasta 2015)</h2><p style="margin:0">' + (ant.n ? fmt(ant.n) + " registro(s) de desastres, " + fmt(ant.m) + " fallecido(s), " + fmt(ant.a) + " afectado(s). Principales: " + topTipos(ant, 5).map(function (t) { return S.esc(t) + " (" + ant.tipos[t] + ")"; }).join(", ") + "." : "Sin antecedentes registrados en DesInventar para este territorio.") + ' <span class="nota">Subregistro probable; la base termina en 2015.</span></p>';
      h += '<h2>Desarrollo humano</h2><p style="margin:0">Pobreza (NBI), servicios básicos, educación e IDH: <b>sin dato</b> (aún no cargados desde fuentes oficiales).</p>';
      if (!m) return h;
      if (!window.PERFIL) return h;
      var ce = centroM(m);
      return PERFIL.clima(ce[0], ce[1]).then(function (cl) { var z = PERFIL.zona(cl.elev, d, ce[0], ce[1]), A = PERFIL.amenazas(cl, z, d, 0); return h + '<h2>Amenazas que enfrenta el municipio (lectura deducida, por validar con CCES)</h2><p class="nota" style="margin:0 0 3px">Zona: ' + S.esc(z) + ' · altitud ≈' + fmt(cl.elev) + ' m</p><table><tr><th style="width:24%">Amenaza</th><th>Evidencia</th><th>Complicaciones para la salud</th></tr>' + A.map(function (a) { return '<tr><td><b>' + S.esc(a[0]) + '</b></td><td>' + S.esc(a[1]) + '</td><td>' + S.esc(a[2]) + '</td></tr>'; }).join("") + '</table>'; }).catch(function () { return h + '<p class="nota">No se pudo obtener el clima histórico para deducir amenazas.</p>'; });
    });
  }
  /* ================= PÁGINAS ================= */
  function paginaDep(d) {
    X.header("departamento.html");
    cargar().then(function (T) {
      var app = document.getElementById("app"), L = T.DEP[d];
      if (!d || !L) { app.innerHTML = crumbs() + '<div class="card"><h2>Departamentos de Bolivia</h2><div class="mb-g">' + Object.keys(T.DEP).sort().map(function (x) { return '<a class="btn" href="departamento.html?d=' + encodeURIComponent(x) + '">' + S.esc(x) + '</a>'; }).join("") + '</div></div>'; return; }
      document.title = d + " — Sala de Situación Bolivia";
      var pd = popDep(T, d), pp = popPais(T), km2 = L.reduce(function (s, x) { return s + x.km2; }, 0), nE = L.reduce(function (s, x) { return s + x.est.length; }, 0), nB = L.reduce(function (s, x) { return s + x.bom.length + x.res.length; }, 0), nP = L.reduce(function (s, x) { return s + x.pol.length; }, 0), nF = L.reduce(function (s, x) { return s + x.foc; }, 0), ant = antD(T, d), ev = eventosT(T, d), reciente = ev.filter(function (e) { return e.ts > Date.now() - 30 * 864e5; });
      var sinE = L.filter(function (x) { return !x.est.length; }), sinB = L.filter(function (x) { return !x.bom.length && !x.res.length; }), sinP = L.filter(function (x) { return !x.pol.length; });
      var h = crumbs(d) + '<h1 class="th">' + S.esc(d) + '</h1><div class="cap">Nivel departamental: contexto para leer cada municipio. Todo lo que falta se muestra como <b>sin dato</b>.</div>';
      h += kpis([[fmt(pd), "habitantes " + ANIO + " (INE) · " + fmt(pd / pp * 100, 1) + " % del país"], [fmt(km2) + " km²", L.length + " municipios en el mapa"], [fmt(pd / km2, 1), "hab/km²"], [fmt(ant.n), "desastres históricos DesInventar (" + fmt(ant.m) + " fallecidos)"], [reciente.length, "eventos del sistema, últimos 30 días"], [fmt(nF), "focos de calor, últimos 14 días"]]);
      h += '<div class="card"><h2>Mapa del departamento</h2><div class="mb-g"><label class="nota">Colorear municipios por <select id="colVar"><option value="pob">Población</option><option value="dens">Densidad</option><option value="his">Desastres históricos</option><option value="foc">Focos de calor 14 d</option></select></label></div><div class="map" id="tMap" style="height:520px"></div><div id="tCtl"></div></div>';
      h += '<div class="card"><h2>Municipios del departamento</h2><div class="cap">Haga clic en un municipio para abrir su ficha. Ordene por la columna que le interese.</div><div class="mb-g" id="ordBtn"></div><div id="tabMun"></div></div>';
      h += '<div class="grid g2"><div class="card"><h2>Red de servicios</h2>' + kpis([[nE, "establecimientos de salud (OSM)"], [nB, "bomberos / rescate"], [nP, "policía"]]) + '<p class="nota" style="margin:0">Municipios sin registro (OSM, puede ser vacío de mapeo y no ausencia real): salud <b>' + sinE.length + '</b> · bomberos o rescate <b>' + sinB.length + '</b> · policía <b>' + sinP.length + '</b> de ' + L.length + '.</p></div><div class="card"><h2>Antecedentes del departamento</h2><div class="cap">Tipos de desastre más registrados (DesInventar, hasta 2015)</div><div id="chAnt" style="height:220px"></div></div></div>';
      h += '<div class="grid g2">' + bloqueSector(T, d) + bloqueDesarrollo("el departamento", 1) + '</div>';
      h += '<div class="card"><h2>Situación actual</h2>' + listaEv(reciente, 8) + '</div>' + bloqueReporte(d);
      app.innerHTML = h; ligarReporte(d); barras("chAnt", ant);
      var bb = [180, 90, -180, -90]; L.forEach(function (x) { bb = [Math.min(bb[0], x.bb[0]), Math.min(bb[1], x.bb[1]), Math.max(bb[2], x.bb[2]), Math.max(bb[3], x.bb[3])]; });
      var geo = {type: "FeatureCollection", features: L.map(function (x) { return {type: "Feature", geometry: x.f.geometry, properties: {n: x.n, d: x.d, pob: x.pob || 0, dens: densidad(x) || 0, his: antM(T, x.k).n, foc: x.foc}}; })};
      var R = mapa("tMap", T, {bb: bb, geo: geo, relleno: "#1d6fb8", op: .35, margen: .1});
      document.getElementById("tCtl").innerHTML = R.ctl; R.ligar(document.getElementById("tCtl"));
      var tm = R.map;
      function colorear() { var v = document.getElementById("colVar").value, mx = 1; geo.features.forEach(function (f) { f.properties.v = Math.sqrt(f.properties[v]); mx = Math.max(mx, f.properties.v); }); tm.getSource("mun").setData(geo); tm.setPaintProperty("mun-f", "fill-color", ["interpolate", ["linear"], ["get", "v"], 0, "#e8eef7", mx, "#08306b"]); tm.setPaintProperty("mun-f", "fill-opacity", .7); }
      tm.on("load", function () { colorear(); tm.on("click", "mun-f", function (e) { if (tm.queryRenderedFeatures(e.point).some(function (f) { return /^c-/.test(f.layer.id); })) return; var p = e.features[0].properties; new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop"><b>' + S.esc(p.n) + '</b>' + fmt(p.pob) + ' hab.<br><a href="municipio.html?d=' + encodeURIComponent(d) + '&m=' + encodeURIComponent(p.n) + '">Abrir ficha del municipio</a></div>').addTo(tm); }); });
      document.getElementById("colVar").onchange = colorear;
      var ORD = [["pob", "Población"], ["dens", "Densidad"], ["his", "Desastres históricos"], ["foc", "Focos 14 d"], ["est", "Estab. de salud"]], sel = "pob";
      function val(x, k) { return k === "pob" ? x.pob || 0 : k === "dens" ? densidad(x) || 0 : k === "his" ? antM(T, x.k).n : k === "foc" ? x.foc : x.est.length; }
      function tab() { document.getElementById("ordBtn").innerHTML = ORD.map(function (o) { return '<button class="btn s' + (o[0] === sel ? " p" : "") + '" data-o="' + o[0] + '">' + o[1] + '</button>'; }).join(""); document.querySelectorAll("#ordBtn button").forEach(function (b) { b.onclick = function () { sel = b.dataset.o; tab(); }; });
        var S2L = L.slice().sort(function (a, b) { return val(b, sel) - val(a, sel); }); document.getElementById("tabMun").innerHTML = tabla(["Municipio", "Población " + ANIO, "hab/km²", "Desastres hist.", "Focos 14 d", "Salud", "Bomb./resc.", "Policía"], S2L.map(function (x) { return ['<a href="municipio.html?d=' + encodeURIComponent(d) + '&m=' + encodeURIComponent(x.n) + '">' + S.esc(x.n) + '</a>', fmt(x.pob), fmt(densidad(x), 1), antM(T, x.k).n, x.foc, x.est.length, x.bom.length + x.res.length, x.pol.length]; })); }
      tab();
    });
  }
  function paginaMun(d, n) {
    X.header("municipio.html");
    cargar().then(function (T) {
      var app = document.getElementById("app"), m = T.M[d + "|" + n];
      if (!m) { app.innerHTML = crumbs(d) + '<div class="card"><p class="vacio">Municipio no encontrado. Vuelva al <a href="' + (d ? "departamento.html?d=" + encodeURIComponent(d) : "index.html") + '">departamento</a>.</p></div>'; return; }
      document.title = n + " (" + d + ") — Sala de Situación Bolivia";
      var L = T.DEP[d], pd = popDep(T, d), pp = popPais(T), kmD = L.reduce(function (s, x) { return s + x.km2; }, 0), ce = centroM(m), ant = antM(T, m.k), antd = antD(T, d), antp = antP(T), ev = eventosT(T, d, m);
      var enM = m.est.filter(esHosp), hp = enM.length ? null : cercano(T.est, ce[0], ce[1], esHosp), bo = cercano(T.emer, ce[0], ce[1], function (p) { return p[3] === "bomberos"; }), re = cercano(T.emer, ce[0], ce[1], function (p) { return p[3] === "rescate"; }), po = cercano(T.emer, ce[0], ce[1], function (p) { return p[3] === "policía"; });
      var nEd = L.reduce(function (s, x) { return s + x.est.length; }, 0), nEp = T.lista.reduce(function (s, x) { return s + x.est.length; }, 0), fD = L.reduce(function (s, x) { return s + x.foc; }, 0), fP = T.lista.reduce(function (s, x) { return s + x.foc; }, 0);
      var h = crumbs(d, n) + '<h1 class="th">' + S.esc(n) + ' <small>' + S.esc(d) + '</small></h1><div class="cap">Ficha municipal: el departamento da el contexto; el municipio, el detalle. Lo que falta aparece como <b>sin dato</b>.</div>';
      h += kpis([[fmt(m.pob), "habitantes " + ANIO + " (INE)"], [fmt(m.km2) + " km²", fmt(densidad(m), 1) + " hab/km²"], [m.est.length, "establecimientos de salud en el municipio (OSM)"], [m.est.length ? (enM.length ? "En el municipio" : (hp ? "≈" + Math.round(hp.km) + " km" : "sin dato")) : (hp ? "≈" + Math.round(hp.km) + " km" : "sin dato"), "hospital más cercano (línea recta)"], [ant.n, "desastres históricos (DesInventar)"], [m.foc, "focos de calor, últimos 14 días"]]);
      h += '<div class="card"><h2>Mapa del municipio</h2><div class="map" id="tMap" style="height:500px"></div><div id="tCtl"></div></div>';
      h += '<div class="card"><h2>Comparación: municipio · departamento · país</h2>' + tabla(["Indicador", S.esc(n), S.esc(d), "Bolivia"], [
        ["Población " + ANIO, fmt(m.pob), fmt(pd), fmt(pp)], ["% de la población del departamento / país", fmt(m.pob / pd * 100, 1) + " % / " + fmt(m.pob / pp * 100, 2) + " %", fmt(pd / pp * 100, 1) + " % del país", "100 %"],
        ["Densidad (hab/km²)", fmt(densidad(m), 1), fmt(pd / kmD, 1), fmt(pp / T.lista.reduce(function (s, x) { return s + x.km2; }, 0), 1)],
        ["Establecimientos de salud por 10.000 hab. (OSM)", porMil(m.est.length, m.pob, 10000), porMil(nEd, pd, 10000), porMil(nEp, pp, 10000)],
        ["Desastres históricos por 100.000 hab.", porMil(ant.n, m.pob, 100000), porMil(antd.n, pd, 100000), porMil(antp.n, pp, 100000)],
        ["Focos de calor 14 días por 1.000 km²", fmt(m.foc / m.km2 * 1000, 1), fmt(fD / kmD * 1000, 1), fmt(fP / T.lista.reduce(function (s, x) { return s + x.km2; }, 0) * 1000, 1)],
        ["Pobreza (NBI)", SD, SD, SD], ["Agua y saneamiento", SD, SD, SD], ["Educación", SD, SD, SD], ["Índice de Desarrollo Humano", SD, SD, SD]
      ]) + '<p class="nota">Los indicadores de desarrollo humano se cargarán desde fuentes oficiales; no se estiman. Establecimientos: mapeo voluntario (OSM), no el registro oficial SNIS.</p></div>';
      function fil(t, x) { return '<tr><td>' + t + '</td><td>' + (x ? S.esc(x.p[2] || "(sin nombre en OSM)") : "sin dato") + '</td><td style="text-align:right">' + (x ? "≈" + Math.round(x.km) + " km" : SD) + '</td></tr>'; }
      h += '<div class="card"><h2>Red de servicios y distancia a la atención</h2><div class="cap">Distancia en <b>línea recta</b> desde el centro aproximado del municipio (no por carretera). Aún no hay lista de establecimientos de referencia con nivel de atención: se usa el hospital más cercano registrado en OSM.</div><table class="tt"><tr><th>Servicio</th><th>Más cercano</th><th style="text-align:right">Distancia</th></tr>' +
        (enM.length ? '<tr><td>Hospital</td><td>' + S.esc(enM[0][2]) + '</td><td style="text-align:right">en el municipio</td></tr>' : fil("Hospital", hp)) + (m.bom.length ? '<tr><td>Bomberos</td><td>' + S.esc(m.bom[0][2]) + '</td><td style="text-align:right">en el municipio</td></tr>' : fil("Bomberos", bo)) + (m.res.length ? '<tr><td>Rescate</td><td>' + S.esc(m.res[0][2]) + '</td><td style="text-align:right">en el municipio</td></tr>' : fil("Rescate", re)) + (m.pol.length ? '<tr><td>Policía</td><td>' + S.esc(m.pol[0][2] || "(sin nombre en OSM)") + '</td><td style="text-align:right">en el municipio</td></tr>' : fil("Policía", po)) + '</table>' + kpis([[m.est.length, "establecimientos de salud"], [m.bom.length + m.res.length, "bomberos / rescate"], [m.pol.length, "policía"]]) + '</div>';
      h += bloqueDesarrollo("el municipio") + '<div class="card" id="tPerfil"></div><div class="card"><h2>Situación actual</h2>' + listaEv(ev, 8) + '</div>' + bloqueReporte(d, n);
      app.innerHTML = h; ligarReporte(d, n);
      var R = mapa("tMap", T, {bb: m.bb, geo: {type: "FeatureCollection", features: [m.f]}, otros: {type: "FeatureCollection", features: L.filter(function (x) { return x !== m; }).map(function (x) { return x.f; })}, relleno: "#1d6fb8", op: .08, resalta: true, margen: .15});
      document.getElementById("tCtl").innerHTML = R.ctl; R.ligar(document.getElementById("tCtl"));
      if (window.PERFIL) PERFIL.render(document.getElementById("tPerfil"), m.f, {D: T.D});
    });
  }
  function pertenece(D, e, d, n) { var f = ((D.geoMun || {}).features || []).filter(function (z) { return z.properties.d === d && z.properties.n === n; })[0]; if (e.departamentos && e.departamentos.length && e.departamentos.indexOf(d) < 0) return false; if (e.lat != null && e.lon != null && f) return dentro(f.geometry, +e.lat, +e.lon); return String(e.lugar || "").toLowerCase().indexOf(n.toLowerCase()) >= 0; }
  return {pertenece: pertenece, dep: paginaDep, mun: paginaMun, contexto: contexto, cargar: cargar};
})();

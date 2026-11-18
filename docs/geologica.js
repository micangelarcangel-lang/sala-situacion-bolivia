/* Módulo Geológica: sismos (mapa de epicentros por magnitud y profundidad), exposición por radio, derrumbes/deslizamientos de prensa y antecedentes. */
var GEO = (function () {
  var LG = {d: "", m: ""}, S = SALA, X = S2, A, T, Q = [], P = [], st = {p: 30, m: 0, pr: true}, sel = null, map = null, DEPC = {}, rq = 0;
  var PROF = [[70, "Superficial (< 70 km)", "#d7263d"], [300, "Intermedio (70–300 km)", "#f2a41b"], [1e5, "Profundo (> 300 km)", "#4f5bd5"]];
  var BOL = /bolivia|la paz|potos|cochabamba|santa cruz|tarija|oruro|beni|pando|chuquisaca|yungas|el alto/i;
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function fmt(n, d) { return d ? (n == null ? "—" : Number(n).toFixed(d).replace(".", ",")) : A.fmt(n); }
  function pc(km) { for (var i = 0; i < 3; i++) if (km < PROF[i][0]) return i; return 2; }
  function hav(a, b, c, d) { var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, q = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 12742 * Math.asin(Math.sqrt(q)); }
  function hora(ts) { return new Date(ts).toLocaleString("es-BO", {timeZone: "America/La_Paz", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false}); }
  function hace(ts) { var h = (Date.now() - ts) / 36e5; return h < 1 ? "hace " + Math.max(1, Math.round(h * 60)) + " min" : h < 48 ? "hace " + Math.round(h) + " h" : "hace " + Math.round(h / 24) + " días"; }
  function circulo(lat, lon, km) { var o = [], i, r = Math.PI / 180; for (i = 0; i <= 64; i++) { var a = i / 64 * 2 * Math.PI, dl = km / 111.32 * Math.cos(a), dn = km / (111.32 * Math.cos(lat * r)) * Math.sin(a); o.push([lon + dn, lat + dl]); } return o; }

  function preparar(D, off) {
    var of = (off.sismos || []).map(function (s) { return {id: s.id, ts: Date.parse(s.fecha_local.replace(" ", "T") + "-04:00"), lat: s.lat, lon: s.lon, mag: s.mag, prof: s.prof_km, lugar: (s.provincia ? s.provincia + ", " : "") + s.departamento, dep: s.departamento, fuente: s.fuente, sentido: !!s.probable_sentido}; });
    D.ev.filter(function (e) { return e.origen === "usgs" && e.lat != null; }).forEach(function (e) {
      var m = /M\s*([\d.]+)/.exec(e.titulo), p = /(\d+(?:[.,]\d+)?)\s*km/.exec(e.detalle || ""); if (!m) return;
      if (of.some(function (o) { return Math.abs(o.ts - e.ts) < 180000 && hav(o.lat, o.lon, e.lat, e.lon) < 150; })) return;
      var mu = T.donde(e.lat, e.lon); of.push({id: e.id, ts: e.ts, lat: e.lat, lon: e.lon, mag: +m[1], prof: p ? +p[1].replace(",", ".") : null, lugar: e.lugar, dep: mu ? mu.d : "fuera de Bolivia", fuente: "USGS", sentido: false});
    });
    of.sort(function (a, b) { return b.ts - a.ts; }); return of;
  }
  function prensa(D) {
    var G = D.ev.filter(function (e) { return e.categoria === "geológica" && e.origen === "prensa"; }), out = {sis: [], mm: [], sin: [], desc: 0};
    G.forEach(function (e) {
      var loc = (e.departamentos && e.departamentos.length) || e.lat != null, tipo = /sismo|terremoto|tembl/i.test(e.titulo) ? "sis" : "mm";
      if (loc) out[tipo].push(e); else if (BOL.test(e.titulo)) out.sin.push(e); else out.desc++;
    });
    return out;
  }
  function enLugar(q) { if (!LG.d) return true; if (LG.m) { var m = T.M[LG.d + "|" + LG.m]; if (!m._c) m._c = A.cenPoly(m.f.geometry); return hav(q.lat, q.lon, m._c[1], m._c[0]) <= 50; } return q.dep === LG.d; }
  function filtrado() { var t0 = st.p ? Date.now() - st.p * 864e5 : 0; return Q.filter(function (q) { return q.ts >= t0 && q.mag >= st.m && enLugar(q); }); }
  function expo(q) {
    var r = {n50: 0, n100: 0, p50: 0, p100: 0, sd: 0, h100: 0, mu: []};
    T.lista.forEach(function (m) { if (!m._c) m._c = A.cenPoly(m.f.geometry); var d = hav(q.lat, q.lon, m._c[1], m._c[0]); if (d <= 100) { r.n100++; r.p100 += m.pob || 0; if (m.pob == null) r.sd++; r.h100 += m.est.filter(function (p) { return /hospital/i.test(p[2]); }).length; r.mu.push({m: m, d: d}); if (d <= 50) { r.n50++; r.p50 += m.pob || 0; } } });
    r.mu.sort(function (a, b) { return a.d - b.d; }); return r;
  }

  function html() {
    return '<nav class="tnav"><a href="index.html">Tablero</a><span class="tsep">›</span><b>Tipo de evento · Geológica</b></nav><h1 class="th">Geológica <small>sismos, derrumbes y deslizamientos</small></h1>' +
      '<div class="cap">Fuentes: Observatorio San Calixto (boletín sísmico), USGS y prensa. Historia disponible desde el 22-oct-2026: <b>sirve para vigilancia, no para estimar frecuencia ni amenaza</b>. Información preliminar.</div>' +
      '<div class="xq"><div class="xs1" id="lgBox"></div><div class="xs1"><b>Período</b><select id="gP"><option value="7">Últimos 7 días</option><option value="30" selected>Últimos 30 días</option><option value="0">Todo lo disponible</option></select></div>' +
      '<div class="xs1"><b>Magnitud mínima</b><select id="gM"><option value="0">Todas</option><option value="3.5">≥ 3,5</option><option value="4">≥ 4</option><option value="5">≥ 5</option></select></div>' +
      '<div class="xs1"><b>Capas</b><label><input type="checkbox" id="gPr" checked> Derrumbes y deslizamientos (prensa)</label></div></div>' +
      '<div id="eviP"></div><div class="xhelp" id="gH"></div><div class="xg"><div class="xmw"><div class="xtool"><button data-b="osm" class="on">Calles</button><button data-b="sat">Satélite</button><button data-b="none">Sin mapa</button><label><input type="checkbox" id="gN" checked> Departamentos</label></div><div class="xmap" id="gMap"></div><div class="xleg" id="gL"></div><div class="xlab" id="gLb"></div></div>' +
      '<div class="xside"><div id="gUlt"></div><div id="gK"></div><div id="gDet"></div></div></div>' +
      '<div class="xg2"><div class="xc"><h3>Magnitud en el tiempo</h3><div id="gCh" style="height:240px"></div><p class="nota">Cada punto es un sismo; el color indica la profundidad.</p></div><div class="xc"><h3 id="gDepT">Por departamento</h3><div id="gDep"></div></div></div>' +
      '<div class="xc" style="margin-top:12px"><div class="xtabs"><button class="on" data-s="gTs">Sismos (lista)</button><button data-s="gTm">Derrumbes y deslizamientos</button><button data-s="gTp">Prensa sobre sismos</button><button data-s="gTa">Antecedentes 1970–2015</button></div><div id="gTs"></div><div id="gTm" style="display:none"></div><div id="gTp" style="display:none"></div><div id="gTa" style="display:none"></div></div>';
  }
  function $(i) { return document.getElementById(i); }

  function rotular() {
    var l = $("gLb"); if (!map || !l) return; if (!$("gN").checked) { l.innerHTML = ""; return; }
    var o = ""; Object.keys(DEPC).forEach(function (d) { var p = map.project(DEPC[d]); o += '<span style="left:' + p.x.toFixed(0) + 'px;top:' + (p.y - 34 + 34).toFixed(0) + 'px">' + esc(d) + '</span>'; }); l.innerHTML = o;
  }
  function geoSism(L) { return {type: "FeatureCollection", features: L.map(function (q) { return {type: "Feature", geometry: {type: "Point", coordinates: [q.lon, q.lat]}, properties: {id: q.id, mag: q.mag, c: PROF[q.prof == null ? 1 : pc(q.prof)][2], s: sel && sel.id === q.id ? 1 : 0}}; })}; }
  function geoPrensa() { return {type: "FeatureCollection", features: st.pr ? P.mm.filter(function (e) { return e.lat != null && LUGAR.ev(T, LG, e); }).map(function (e) { return {type: "Feature", geometry: {type: "Point", coordinates: [e.lon, e.lat]}, properties: {t: e.titulo, f: e.fuente || "", u: e.metodo || "ubicación aproximada"}}; }) : []}; }
  function geoExp() {
    var f = []; if (sel) { var r = expo(sel); r.mu.forEach(function (x) { f.push({type: "Feature", geometry: x.m.f.geometry, properties: {n: x.d <= 50 ? 2 : 1}}); }); f.push({type: "Feature", geometry: {type: "Polygon", coordinates: [circulo(sel.lat, sel.lon, 100)]}, properties: {r: 100}}, {type: "Feature", geometry: {type: "Polygon", coordinates: [circulo(sel.lat, sel.lon, 50)]}, properties: {r: 50}}); }
    return {type: "FeatureCollection", features: f};
  }
  function leyenda() {
    var h = '<b>Epicentros</b><span class="xs"><i style="width:7px;height:7px;border-radius:50%;background:#fff"></i><i style="width:11px;height:11px;border-radius:50%;background:#fff"></i><i style="width:18px;height:18px;border-radius:50%;background:#fff"></i> tamaño = magnitud (3 · 4 · 5)</span><b style="margin-top:6px">Profundidad (color)</b>' + PROF.map(function (p) { return '<span><i style="background:' + p[2] + ';border-radius:50%;width:11px;height:11px"></i>' + p[1] + '</span>'; }).join("");
    if (st.pr) h += '<span style="margin-top:6px"><i style="background:#7b4a2b;border:2px solid #fff;border-radius:50%;width:11px;height:11px;box-sizing:border-box"></i>Derrumbe / deslizamiento (prensa, ubicación aproximada)</span>';
    $("gL").innerHTML = h;
  }
  function crearMapa() {
    var osc = document.documentElement.getAttribute("data-theme") === "dark";
    map = new maplibregl.Map({container: "gMap", style: {version: 8, sources: {osm: {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap"}, sat: {type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 17, attribution: "Imagen © Esri, Maxar"}}, layers: [{id: "bg", type: "background", paint: {"background-color": X.css("--soft") || "#e6ebf2"}}, {id: "osm", type: "raster", source: "osm", paint: {"raster-opacity": osc ? .5 : .8}}, {id: "sat", type: "raster", source: "sat", layout: {visibility: "none"}}]}, bounds: [[-70.2, -23.2], [-56.8, -8.8]], fitBoundsOptions: {padding: 10}, attributionControl: {compact: true}});
    map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); map.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-right");
    var pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
    map.on("load", function () {
      map.addSource("dep", {type: "geojson", data: {type: "FeatureCollection", features: T.D.geoDep.features}});
      map.addSource("ex", {type: "geojson", data: geoExp()}); map.addSource("sis", {type: "geojson", data: geoSism([])}); map.addSource("pr", {type: "geojson", data: geoPrensa()});
      map.addLayer({id: "d-f", type: "fill", source: "dep", paint: {"fill-color": "#ffffff", "fill-opacity": .08}});
      LUGAR.capa(map); map.addLayer({id: "d-l", type: "line", source: "dep", paint: {"line-color": "#10233d", "line-width": 1.2, "line-opacity": .8}});
      map.addLayer({id: "ex-f", type: "fill", source: "ex", filter: ["has", "n"], paint: {"fill-color": "#f26a1b", "fill-opacity": ["match", ["get", "n"], 2, .4, .18]}});
      map.addLayer({id: "ex-l", type: "line", source: "ex", filter: ["has", "r"], paint: {"line-color": "#10233d", "line-width": 1.5, "line-dasharray": [3, 2]}});
      map.addLayer({id: "pr", type: "circle", source: "pr", paint: {"circle-radius": 7, "circle-color": "#7b4a2b", "circle-stroke-color": "#fff", "circle-stroke-width": 2}});
      map.addLayer({id: "sis", type: "circle", source: "sis", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2, 3.5, 3, 6, 4, 10, 5, 16, 6, 24], "circle-color": ["get", "c"], "circle-opacity": .78, "circle-stroke-color": ["case", ["==", ["get", "s"], 1], "#000", "#fff"], "circle-stroke-width": ["case", ["==", ["get", "s"], 1], 3, 1]}});
      map.on("mousemove", "sis", function (e) { var q = Q.filter(function (z) { return z.id === e.features[0].properties.id; })[0]; if (!q) return; map.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">M ' + fmt(q.mag, 1) + ' · ' + esc(q.lugar) + '</b>' + hora(q.ts) + (q.prof != null ? ' · prof. ' + fmt(q.prof) + ' km' : '') + ' · clic para ver la exposición</div>').addTo(map); });
      map.on("mouseleave", "sis", function () { pop.remove(); map.getCanvas().style.cursor = ""; });
      map.on("click", "sis", function (e) { sel = Q.filter(function (z) { return z.id === e.features[0].properties.id; })[0] || null; selecciona(); });
      map.on("mousemove", "pr", function (e) { var p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.t) + '</b>' + esc(p.f) + ' · ' + esc(p.u) + '</div>').addTo(map); }); map.on("mouseleave", "pr", function () { pop.remove(); });
      map.on("move", function () { if (!rq) rq = requestAnimationFrame(function () { rq = 0; rotular(); }); }); map.on("resize", rotular);
      map._ok = 1; LUGAR.ajusta(map, T, LG, false); dibuja();
    });
    document.querySelectorAll(".xtool button").forEach(function (b) { b.onclick = function () { document.querySelectorAll(".xtool button").forEach(function (z) { z.classList.toggle("on", z === b); }); map.setLayoutProperty("osm", "visibility", b.dataset.b === "osm" ? "visible" : "none"); map.setLayoutProperty("sat", "visibility", b.dataset.b === "sat" ? "visible" : "none"); }; });
  }
  function selecciona() {
    if (map && map._ok) { map.getSource("sis").setData(geoSism(filtrado())); map.getSource("ex").setData(geoExp()); if (sel) map.fitBounds([[sel.lon - 1.6, sel.lat - 1.4], [sel.lon + 1.6, sel.lat + 1.4]], {duration: 500}); }
    detalle(); rotular();
  }
  function detalle() {
    var el = $("gDet"); if (!sel) { el.innerHTML = '<div class="xc xhint">Haga clic en un sismo del mapa o de la lista: se dibujan los radios de 50 y 100 km y se calcula la población cercana.</div>'; return; }
    var q = sel, r = expo(q), cl = q.prof == null ? 1 : pc(q.prof), prof = q.prof != null && q.prof > 300;
    el.innerHTML = '<div class="xc"><h3>Sismo M ' + fmt(q.mag, 1) + ' · ' + esc(q.lugar) + '</h3><div class="xval" style="border-left:6px solid ' + PROF[cl][2] + '">' + hora(q.ts) + ' · ' + (q.prof != null ? 'prof. ' + fmt(q.prof) + ' km (' + PROF[cl][1].split(" (")[0].toLowerCase() + ')' : 'profundidad sin dato') + '</div>' +
      '<table class="xt2"><tr><td></td><td style="text-align:right"><b>≤ 50 km</b></td><td style="text-align:right"><b>≤ 100 km</b></td></tr><tr><td>Municipios</td><td style="text-align:right">' + r.n50 + '</td><td style="text-align:right">' + r.n100 + '</td></tr><tr><td>Población (est.)</td><td style="text-align:right">' + fmt(r.p50) + '</td><td style="text-align:right">' + fmt(r.p100) + '</td></tr><tr><td>Hospitales (OSM)</td><td></td><td style="text-align:right">' + r.h100 + '</td></tr></table>' +
      (r.mu.length ? '<p class="nota" style="margin:6px 0">Más cercanos: ' + r.mu.slice(0, 4).map(function (x) { return '<a href="municipio.html?d=' + encodeURIComponent(x.m.d) + '&m=' + encodeURIComponent(x.m.n) + '">' + esc(x.m.n) + '</a> (' + fmt(x.d) + ' km)'; }).join(", ") + '.</p>' : '<p class="nota">Ningún municipio a menos de 100 km del epicentro.</p>') +
      '<p class="nota">' + (prof ? '<b>Sismo profundo:</b> la energía llega muy atenuada a la superficie; los radios indican cercanía al epicentro, no daño esperado. ' : 'Los radios miden distancia al epicentro, no intensidad; no estiman daños. ') + (r.sd ? r.sd + ' municipio(s) sin dato de población. ' : '') + 'Fuente: ' + esc(q.fuente) + '.</p></div>';
  }
  function dibuja() {
    var L = filtrado(); if (sel && !L.some(function (q) { return q.id === sel.id; })) sel = null;
    leyenda(); $("gH").innerHTML = '<b>' + L.length + ' sismos</b> en ' + esc(LUGAR.etiqueta(LG)) + (LG.m ? ' (≤ 50 km del centro del municipio)' : "") + ' · ' + (st.p ? 'últimos ' + st.p + ' días' : 'todo el período disponible') + (st.m ? ' · M ≥ ' + st.m : '') + ' <span class="nota">— Magnitudes y profundidades preliminares; pueden diferir entre San Calixto y USGS.</span>';
    if (map && map._ok) { map.getSource("sis").setData(geoSism(L)); map.getSource("pr").setData(geoPrensa()); map.getSource("ex").setData(geoExp()); rotular(); }
    antecedentes(); document.querySelector(".xg2").style.display = L.length ? "" : "none"; tabsPrensa(); ultimo(L); kpis(L); if (L.length) { grafico(L); porDep(L); } lista(L); antecedentes(); detalle();
  }
  function ultimo(L) {
    var q = L[0];
    if (!q) {
      var t0 = st.p ? Date.now() - st.p * 864e5 : 0, c = LG.m ? (T.M[LG.d + "|" + LG.m]._c || A.cenPoly(T.M[LG.d + "|" + LG.m].f.geometry)) : LG.d ? DEPC[LG.d] : null, best = null;
      if (c) Q.forEach(function (z) { if (z.ts < t0 || z.mag < st.m) return; var d = hav(c[1], c[0], z.lat, z.lon); if (!best || d < best.d) best = {d: d, q: z}; });
      $("gUlt").innerHTML = '<div class="xc"><h3>Sin sismos en ' + esc(LUGAR.etiqueta(LG)) + '</h3><p class="nota" style="margin:0 0 6px">No hay sismos registrados con este filtro. Eso no descarta sismos pequeños que no detectó la red.</p>' + (best ? '<p style="margin:0;font-size:13px"><b>Más cercano:</b> M ' + fmt(best.q.mag, 1) + ' a ' + fmt(best.d) + ' km, ' + esc(best.q.lugar) + ' · ' + hora(best.q.ts) + '.</p>' : "") + (st.p ? '<button class="xlink" id="gTodo">Ver todo el período disponible →</button>' : "") + '</div>';
      var bt = $("gTodo"); if (bt) bt.onclick = function () { st.p = 0; $("gP").value = "0"; dibuja(); };
      return;
    }
    $("gUlt").innerHTML = '<div class="xc"><h3>Último sismo registrado</h3><div class="xk"><div><b style="color:' + PROF[q.prof == null ? 1 : pc(q.prof)][2] + '">M ' + fmt(q.mag, 1) + '</b><span>' + hace(q.ts) + '</span></div></div><p style="margin:6px 0 2px;font-size:13px">' + esc(q.lugar) + ' · ' + hora(q.ts) + (q.prof != null ? ' · prof. ' + fmt(q.prof) + ' km' : '') + '</p>' + (q.sentido ? '<p class="nota" style="margin:0"><b>Marcado como probablemente sentido</b> por la fuente.</p>' : '') + '<button class="xlink" id="gUv">Ver exposición →</button></div>';
    $("gUv").onclick = function () { sel = q; selecciona(); };
  }
  function kpis(L) {
    var mx = L.reduce(function (a, q) { return !a || q.mag > a.mag ? q : a; }, null), c4 = L.filter(function (q) { return q.mag >= 4; }).length, cd = {}; L.forEach(function (q) { cd[q.dep] = (cd[q.dep] || 0) + 1; }); var td = Object.keys(cd).sort(function (a, b) { return cd[b] - cd[a]; })[0];
    $("gK").innerHTML = '<div class="xc"><div class="xk"><div><b>' + L.length + '</b><span>sismos</span></div><div><b>' + (mx ? fmt(mx.mag, 1) : "—") + '</b><span>magnitud máx.</span></div><div><b>' + c4 + '</b><span>de M ≥ 4</span></div></div>' + (td ? '<p class="nota" style="margin:8px 0 0">Más activo: <b>' + esc(td) + '</b> (' + cd[td] + ').</p>' : '') + '</div>';
  }
  function grafico(L) {
    var el0 = $("gCh"); el0.style.height = L.length ? "240px" : "90px"; if (!L.length) { var c0 = echarts.getInstanceByDom(el0); if (c0) c0.dispose(); el0.innerHTML = '<p class="nota" style="padding:18px 4px">Sin sismos con este filtro. En zonas de baja sismicidad es lo esperable; pruebe «Todo lo disponible» (el registro empieza el 22-oct-2026).</p>'; return; } if (!echarts.getInstanceByDom(el0)) el0.innerHTML = "";
    var ch = echarts.getInstanceByDom($("gCh")) || echarts.init($("gCh"), null, {renderer: "svg"}), tx = X.css("--mut") || "#888", ln = X.css("--line") || "#ccc";
    ch.setOption({animation: false, grid: {left: 38, right: 12, top: 10, bottom: 28}, tooltip: {formatter: function (p) { var q = p.data[3]; return 'M ' + fmt(q.mag, 1) + ' · ' + esc(q.lugar) + '<br>' + hora(q.ts) + (q.prof != null ? ' · ' + fmt(q.prof) + ' km' : ''); }}, xAxis: {type: "time", axisLabel: {color: tx, fontSize: 11}, axisLine: {lineStyle: {color: ln}}, splitLine: {show: false}}, yAxis: {type: "value", name: "M", nameTextStyle: {color: tx}, min: 2.5, axisLabel: {color: tx, fontSize: 11}, splitLine: {lineStyle: {color: ln}}},
      series: PROF.map(function (p, i) { return {type: "scatter", name: p[1], symbolSize: 9, itemStyle: {color: p[2], opacity: .85, borderColor: "#fff", borderWidth: .8}, data: L.filter(function (q) { return (q.prof == null ? 1 : pc(q.prof)) === i; }).map(function (q) { return [q.ts, q.mag, q.prof, q]; })}; })}, true);
    ch.off("click"); ch.on("click", function (p) { sel = p.data[3]; selecciona(); });
  }
  function porDep(L) {
    var o = {}; $("gDepT").textContent = LG.d ? "Por municipio (epicentro)" : "Por departamento"; L.forEach(function (q) { var kk = q.dep; if (LG.d) { var mu = T.donde(q.lat, q.lon); kk = mu ? mu.n : "fuera de Bolivia"; } var d = o[kk] || (o[kk] = {n: 0, mx: 0}); d.n++; d.mx = Math.max(d.mx, q.mag); }); var k = Object.keys(o).sort(function (a, b) { return o[b].n - o[a].n; }), mx = k.length ? o[k[0]].n : 1;
    $("gDep").innerHTML = k.length ? '<table class="xt2">' + k.map(function (d) { return '<tr><td>' + esc(d) + '</td><td style="width:42%"><div class="xt" style="height:9px;background:var(--soft);border-radius:5px;overflow:hidden"><i style="display:block;height:100%;width:' + (o[d].n / mx * 100) + '%;background:#4f6fd5"></i></div></td><td style="text-align:right">' + o[d].n + ' <span class="nota">· M máx ' + fmt(o[d].mx, 1) + '</span></td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin sismos.</p>';
  }
  function lista(L) {
    if (!L.length) { $("gTs").innerHTML = '<p class="nota">Sin sismos con este filtro.</p>'; return; }
    $("gTs").innerHTML = '<table class="xt2"><tr><th align="left">Fecha (hora de Bolivia)</th><th align="left">Lugar</th><th>M</th><th>Prof. km</th><th align="left">Fuente</th></tr>' + L.slice(0, 40).map(function (q) { return '<tr data-id="' + esc(q.id) + '"><td>' + hora(q.ts) + '</td><td>' + esc(q.lugar) + '</td><td style="text-align:center"><i class="xdot" style="background:' + PROF[q.prof == null ? 1 : pc(q.prof)][2] + '"></i>' + fmt(q.mag, 1) + '</td><td style="text-align:center">' + (q.prof != null ? fmt(q.prof) : "sin dato") + '</td><td>' + esc(q.fuente) + '</td></tr>'; }).join("") + '</table>' + (L.length > 40 ? '<p class="nota">Se muestran los 40 más recientes de ' + L.length + '.</p>' : "");
    [].forEach.call(document.querySelectorAll("#gTs tr[data-id]"), function (r) { r.onclick = function () { sel = L.filter(function (q) { return q.id === r.dataset.id; })[0]; selecciona(); window.scrollTo({top: $("gMap").getBoundingClientRect().top + scrollY - 140, behavior: "smooth"}); }; });
  }
  function noticias(L, vacio) { return L.length ? '<table class="xt2">' + L.map(function (e) { return '<tr><td style="white-space:nowrap">' + hora(e.ts) + '</td><td>' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.titulo) + '</a>' : esc(e.titulo)) + '</td><td class="nota">' + esc(e.fuente || "") + '</td><td class="nota">' + esc((e.departamentos || []).join(", ") || (e.lat == null ? "sin coordenada" : "")) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">' + vacio + '</p>'; }
  function antecedentes() {
    var tipos = ["Deslizamiento", "Sismo"], h = (T.dh && T.dh.departamentos) || {}, el = $("gTa"), cab = '<p class="nota"><b>Limitación:</b> DesInventar (UNDRR) cubre 1970–2015, con subregistro, y no incluye eventos recientes. Solo sirve de contexto.</p>';
    if (LG.m) {
      var R = ((T.dh && T.dh.municipios) || {})[LG.d + "|" + LG.m] || [], o = {}; R.forEach(function (r) { if (tipos.indexOf(r[2]) >= 0) { var x = o[r[2]] || (o[r[2]] = {n: 0, m: 0}); x.n++; x.m += r[3]; } });
      el.innerHTML = cab + (Object.keys(o).length ? '<table class="xt2"><tr><th align="left">Evento</th><th>Registros</th><th>Fallecidos</th></tr>' + Object.keys(o).map(function (t) { return '<tr><td>' + t + '</td><td align="center">' + o[t].n + '</td><td align="center">' + o[t].m + '</td></tr>'; }).join("") + '</table><p class="nota">Registros de ' + esc(LUGAR.etiqueta(LG)) + '.</p>' : '<p class="nota">Sin registros de deslizamientos ni sismos para este municipio en DesInventar (puede ser subregistro).</p>'); return;
    }
    var k = Object.keys(h).sort().filter(function (d) { return !LG.d || d === LG.d; });
    var fil = k.map(function (d) { var f = tipos.map(function (t) { return h[d][t] || [0, 0, 0]; }); return {d: d, f: f, tot: f[0][0] + f[1][0]}; }).sort(function (a, b) { return b.tot - a.tot; });
    el.innerHTML = cab + '<table class="xt2"><tr><th align="left">Departamento</th><th>Deslizamientos</th><th>Fallecidos</th><th>Sismos</th><th>Fallecidos</th></tr>' + fil.map(function (r) { return '<tr><td>' + esc(r.d) + '</td><td align="center">' + r.f[0][0] + '</td><td align="center">' + r.f[0][1] + '</td><td align="center">' + r.f[1][0] + '</td><td align="center">' + r.f[1][1] + '</td></tr>'; }).join("") + '</table>';
  }
  function tabsPrensa() {
      $("gTm").innerHTML = '<p class="nota">Reportes de prensa. La posición es aproximada (se deduce del lugar nombrado) y no es la del evento exacto. ' + P.sin.length + ' notas más no tienen lugar identificable y no se grafican.</p>' + noticias(P.mm.filter(function(e) { return LUGAR.ev(T, LG, e); }), "Sin reportes en este lugar.");
      $("gTp").innerHTML = '<p class="nota">Notas de prensa sobre sismos: sirven para corroborar, no se grafican (el mapa usa las fuentes instrumentales). ' + (P.desc ? P.desc + ' notas clasificadas como geológicas se descartaron por no referirse a Bolivia (p. ej. terremotos en otros países o usos figurados).' : '') + '</p>' + noticias(P.sis.filter(function(e) { return LUGAR.ev(T, LG, e); }), "Sin notas en este lugar.");
  }
  function iniciar() {
    TERR.cargar().then(function (t) {
      T = t; A = TERR.api; A.estilos(); X.header("modulo.html"); document.title = "Geológica — Sala de Situación Bolivia";
      return fetch("sismos_oficiales.json").then(function (r) { return r.json(); }).catch(function () { return {sismos: []}; });
    }).then(function (off) {
      Q = preparar(T.D, off); P = prensa(T.D);
      $("app").innerHTML = html(); if (window.EVI) EVI.panel("eviP", "geológica", T.D);
      (T.D.geoDep.features || []).forEach(function (f) { DEPC[f.properties.n] = A.cenPoly(f.geometry); });
      LUGAR.init(T, $("lgBox"), LG, function () { sel = null; dibuja(); LUGAR.ajusta(map, T, LG); }); $("gP").onchange = function () { st.p = +this.value; dibuja(); }; $("gM").onchange = function () { st.m = +this.value; dibuja(); }; $("gPr").onchange = function () { st.pr = this.checked; dibuja(); }; $("gN").onchange = rotular;
      [].forEach.call(document.querySelectorAll(".xtabs button"), function (b) { b.onclick = function () { [].forEach.call(document.querySelectorAll(".xtabs button"), function (z) { z.classList.toggle("on", z === b); $(z.dataset.s).style.display = z === b ? "" : "none"; }); }; });
      crearMapa(); dibuja();
    });
  }
  return {iniciar: iniciar};
})();

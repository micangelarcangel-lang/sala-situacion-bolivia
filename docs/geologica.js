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
    var r = {n50: 0, n100: 0, p50: 0, p100: 0, sd: 0, h100: 0, e100: 0, b100: 0, mu: []};
    T.lista.forEach(function (m) { if (!m._c) m._c = A.cenPoly(m.f.geometry); var d = hav(q.lat, q.lon, m._c[1], m._c[0]); if (d <= 100) { r.n100++; r.p100 += m.pob || 0; if (m.pob == null) r.sd++; r.h100 += m.est.filter(function (p) { return /hospital/i.test(p[2]); }).length; r.e100 += m.est.length; r.b100 += m.bom.length + m.res.length; r.mu.push({m: m, d: d}); if (d <= 50) { r.n50++; r.p50 += m.pob || 0; } } });
    r.mu.sort(function (a, b) { return a.d - b.d; }); return r;
  }

  function html() {
    return '<nav class="tnav"><a href="index.html">Tablero</a><span class="tsep">›</span><b>Tipo de evento · Geológica</b></nav><h1 class="th">Geológica <small>sismos, derrumbes y deslizamientos</small></h1>' +
      '<div class="cap">Fuentes: Observatorio San Calixto (boletín sísmico), USGS y prensa. Registro disponible desde el ' + desde() + ': <b>sirve para vigilancia, no para estimar frecuencia ni amenaza</b>. Información preliminar.</div>' +
      '<div class="gpulso"><div class="card gult" id="gUlt"></div><div class="gkp" id="gK"></div><div class="card gsp"><h3>Ritmo diario</h3><div id="gSp" style="height:112px"></div><div class="nota" id="gSpN"></div></div></div>' +
      '<div class="xq"><div class="xs1" id="lgBox"></div><div class="xs1"><b>Período</b><select id="gP"><option value="7">Últimos 7 días</option><option value="30" selected>Últimos 30 días</option><option value="0">Todo lo disponible</option></select></div>' +
      '<div class="xs1"><b>Magnitud mínima</b><select id="gM"><option value="0">Todas</option><option value="3.5">≥ 3,5</option><option value="4">≥ 4</option><option value="5">≥ 5</option></select></div>' +
      '<div class="xs1"><b>Capas</b><label><input type="checkbox" id="gPr" checked> Derrumbes y deslizamientos (prensa)</label></div></div>' +
      '<div id="eviP"></div><div class="xhelp" id="gH"></div><div class="xg"><div class="xmw"><div class="xtool"><button data-b="osm" class="on">Calles</button><button data-b="sat">Satélite</button><button data-b="none">Sin mapa</button><label><input type="checkbox" id="gN" checked> Departamentos</label></div><div class="xmap" id="gMap"></div><div class="xleg" id="gL"></div><div class="xlab" id="gLb"></div></div>' +
      '<div class="xside"><div id="gDet"></div></div></div>' +
      '<div class="g3"><div class="card"><h3>Magnitud y energía en el tiempo</h3><div id="gCh" style="height:250px"></div><p class="nota" id="gChN"></p></div>' +
      '<div class="card"><h3>Corte de profundidad</h3><div id="gCor" style="height:250px"></div><p class="nota" id="gCorN"></p></div>' +
      '<div class="card"><h3 id="gMmT">Sismos por municipio</h3><div class="gmm" id="gMm"></div><div class="leg" id="gMmL"></div><p class="nota" id="gMmN"></p></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="xtabs"><button class="on" data-s="gTs">Sismos (lista)</button><button data-s="gTm">Prensa geológica</button><button data-s="gTa">Antecedentes 1970–2015</button></div><div id="gTs"></div><div id="gTm" style="display:none"></div><div id="gTa" style="display:none"></div></div>';
  }
  function $(i) { return document.getElementById(i); }
  function desde() { var t = Q.length ? Q[Q.length - 1].ts : Date.now(); return new Date(t).toLocaleDateString("es-BO", {timeZone: "America/La_Paz", day: "numeric", month: "short", year: "numeric"}).replace(/\./g, ""); }

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
  function hospCerca(q) { var b = null; T.est.forEach(function (p) { if (!/hospital/i.test(p[2])) return; var d = hav(q.lat, q.lon, p[0], p[1]); if (!b || d < b.d) b = {d: d, p: p}; }); return b; }
  function detalle() {
    var el = $("gDet");
    if (!sel) { el.innerHTML = '<div class="xc xhint"><h3>Sin sismo para mostrar</h3>No hay sismos con este filtro. Cambie el período o la magnitud para ver la exposición de uno.</div>'; return; }
    var q = sel, r = expo(q), cl = q.prof == null ? 1 : pc(q.prof), prof = q.prof != null && q.prof > 300, hc = hospCerca(q), ficha = T.D.ev.some(function (e) { return e.id === q.id; }), nP = P.sis.filter(function (e) { return Math.abs(e.ts - q.ts) < 432e5 && (e.departamentos || []).indexOf(q.dep) >= 0; }).length;
    el.innerHTML = '<div class="xc gfi"><div class="gfi-h"><div class="gfi-m" style="--c:' + PROF[cl][2] + '">M ' + fmt(q.mag, 1) + '</div><div><h3>' + esc(q.lugar) + '</h3><div class="nota">' + hora(q.ts) + ' · ' + hace(q.ts) + '</div></div></div>' +
      '<div class="xval" style="border-left:6px solid ' + PROF[cl][2] + '">' + (q.prof != null ? 'Profundidad ' + fmt(q.prof) + ' km · ' + PROF[cl][1].split(" (")[0].toLowerCase() : 'profundidad sin dato') + (q.sentido ? ' · probablemente sentido' : '') + '</div>' +
      '<table class="xt2 gfi-t"><tr><td></td><td style="text-align:right"><b>≤ 50 km</b></td><td style="text-align:right"><b>≤ 100 km</b></td></tr><tr><td>Municipios</td><td style="text-align:right">' + r.n50 + '</td><td style="text-align:right">' + r.n100 + '</td></tr><tr><td>Población (est.)</td><td style="text-align:right">' + fmt(r.p50) + '</td><td style="text-align:right">' + fmt(r.p100) + '</td></tr>' +
      '<tr><td>Establecimientos de salud (OSM)</td><td></td><td style="text-align:right">' + fmt(r.e100) + '</td></tr><tr><td>De ellos, hospitales</td><td></td><td style="text-align:right">' + r.h100 + '</td></tr><tr><td>Bomberos y rescate</td><td></td><td style="text-align:right">' + r.b100 + '</td></tr></table>' +
      (hc ? '<p class="nota" style="margin:6px 0">Hospital más cercano: <b>' + esc(hc.p[2]) + '</b>, a ' + fmt(hc.d) + ' km del epicentro.</p>' : "") +
      (r.mu.length ? '<p class="nota" style="margin:6px 0">Municipios más cercanos: ' + r.mu.slice(0, 4).map(function (x) { return '<a href="municipio.html?d=' + encodeURIComponent(x.m.d) + '&m=' + encodeURIComponent(x.m.n) + '">' + esc(x.m.n) + '</a> (' + fmt(x.d) + ' km)'; }).join(", ") + '.</p>' : '<p class="nota">Ningún municipio a menos de 100 km del epicentro.</p>') +
      '<p class="nota">' + (prof ? '<b>Sismo profundo:</b> la energía llega muy atenuada a la superficie; los radios indican cercanía al epicentro, no daño esperado. ' : 'Los radios miden distancia al epicentro, no intensidad; no estiman daños. ') + (r.sd ? r.sd + ' municipio(s) sin dato de población. ' : '') + (nP ? nP + ' nota(s) de prensa del mismo día en ' + esc(q.dep) + '. ' : 'Sin notas de prensa del mismo día en ' + esc(q.dep) + '. ') + 'Fuente: ' + esc(q.fuente) + '.</p>' +
      (ficha ? '<a class="btn" href="evento.html?id=' + encodeURIComponent(q.id) + '">Abrir ficha del hecho →</a>' : "") + '</div>';
  }
  function dibuja() {
    var L = filtrado(); if (sel && !L.some(function (q) { return q.id === sel.id; })) sel = null; if (!sel && L.length) sel = L[0];
    leyenda(); $("gH").innerHTML = '<b>' + L.length + ' sismos</b> en ' + esc(LUGAR.etiqueta(LG)) + (LG.m ? ' (≤ 50 km del centro del municipio)' : "") + ' · ' + (st.p ? 'últimos ' + st.p + ' días' : 'todo el período disponible') + (st.m ? ' · M ≥ ' + st.m : '') + ' <span class="nota">— Magnitudes y profundidades preliminares; pueden diferir entre San Calixto y USGS.</span>';
    if (map && map._ok) { map.getSource("sis").setData(geoSism(L)); map.getSource("pr").setData(geoPrensa()); map.getSource("ex").setData(geoExp()); rotular(); }
    pulso(); detalle(); serie(L); corte(L); munMapa(L); lista(L); tabsPrensa(); antecedentes();
  }
  function base() { return Q.filter(enLugar); }
  function mayor(L) { return L.reduce(function (a, q) { return !a || q.mag > a.mag ? q : a; }, null); }
  function pulso() {
    var B = base(), now = Date.now(), q = B[0], n24 = B.filter(function (z) { return z.ts > now - 864e5; }), n7 = B.filter(function (z) { return z.ts > now - 7 * 864e5; }), c4 = B.filter(function (z) { return z.mag >= 4; }), mx = mayor(B), mx24 = mayor(n24), mx7 = mayor(n7);
    if (!q) {
      var c = LG.m ? (T.M[LG.d + "|" + LG.m]._c || A.cenPoly(T.M[LG.d + "|" + LG.m].f.geometry)) : LG.d ? DEPC[LG.d] : null, best = null;
      if (c) Q.forEach(function (z) { var d = hav(c[1], c[0], z.lat, z.lon); if (!best || d < best.d) best = {d: d, q: z}; });
      $("gUlt").innerHTML = '<span class="eye">Último sismo registrado</span><h3 style="margin:4px 0">Sin sismos en ' + esc(LUGAR.etiqueta(LG)) + '</h3><p class="nota" style="margin:0 0 6px">La red no registró sismos aquí desde el ' + desde() + '. Eso no descarta sismos pequeños que no detecta la red.</p>' + (best ? '<p style="margin:0;font-size:13px"><b>Más cercano:</b> M ' + fmt(best.q.mag, 1) + ' a ' + fmt(best.d) + ' km, ' + esc(best.q.lugar) + ' · ' + hora(best.q.ts) + '.</p>' : "");
    } else {
      var cl = q.prof == null ? 1 : pc(q.prof);
      $("gUlt").innerHTML = '<span class="eye">Último sismo registrado · ' + hace(q.ts) + '</span><div class="gl-m"><div class="gl-n" style="--c:' + PROF[cl][2] + '"><u></u><u></u><u></u><i></i><b>M ' + fmt(q.mag, 1) + '</b></div><div><div class="gl-lug">' + esc(q.lugar) + '</div><div class="gl-sub">' + hora(q.ts) + '</div><div class="gl-sub">' + (q.prof != null ? 'prof. ' + fmt(q.prof) + ' km · ' + PROF[cl][1].split(" (")[0].toLowerCase() : 'profundidad sin dato') + '</div></div></div>' +
        '<div class="nota">' + esc(q.fuente) + (q.sentido ? ' · <b>probablemente sentido</b>' : "") + '</div><div><button class="btn p" id="gUv">Ver exposición de este sismo</button></div>';
      $("gUv").onclick = function () { sel = q; selecciona(); };
    }
    var kk = function (l, v, d, col) { return '<div class="card kpi" style="--k:' + col + '"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; };
    $("gK").innerHTML = kk("Últimas 24 horas", n24.length, mx24 ? "máxima M " + fmt(mx24.mag, 1) : "sin sismos", "#4f5bd5") + kk("Últimos 7 días", n7.length, mx7 ? "máxima M " + fmt(mx7.mag, 1) : "sin sismos", "#f2a41b") +
      kk("Todo el registro", B.length, c4.length + " de M ≥ 4 · desde el " + desde().replace(/ de? \d{4}$| \d{4}$/, ""), "#a1887f") + kk("Mayor magnitud", mx ? "M " + fmt(mx.mag, 1) : "—", mx ? esc(mx.lugar) + " · " + hora(mx.ts) : "sin sismos", "#d7263d");
    /* ritmo diario */
    var dk = [], i, hoy = Date.now(), cnt = {}; B.forEach(function (z) { var k = S.diaKey(z.ts); cnt[k] = (cnt[k] || 0) + 1; });
    for (i = 29; i >= 0; i--) dk.push(S.diaKey(hoy - i * 864e5));
    var el = $("gSp"), ch = echarts.getInstanceByDom(el) || echarts.init(el, null, {renderer: "svg"}), tx = X.css("--mut") || "#888", ln = X.css("--line") || "#ccc";
    ch.setOption({animation: true, grid: {left: 26, right: 8, top: 8, bottom: 20}, tooltip: {trigger: "axis", formatter: function (p) { return p[0].axisValue.slice(8) + "/" + p[0].axisValue.slice(5, 7) + ": <b>" + p[0].data + "</b> sismo(s)"; }}, xAxis: {type: "category", data: dk, boundaryGap: false, axisLabel: {color: tx, fontSize: 10, interval: 6, formatter: function (v) { return v.slice(8) + "/" + v.slice(5, 7); }}, axisLine: {lineStyle: {color: ln}}, axisTick: {show: false}}, yAxis: {type: "value", minInterval: 1, axisLabel: {color: tx, fontSize: 10}, splitLine: {lineStyle: {color: ln, opacity: .5}}},
      series: [{type: "line", smooth: .35, symbol: "none", lineStyle: {width: 2.4, color: "#5aa9f0"}, areaStyle: {color: {type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{offset: 0, color: "rgba(90,169,240,.5)"}, {offset: 1, color: "rgba(90,169,240,0)"}]}}, data: dk.map(function (k) { return cnt[k] || 0; })}]}, true);
    var pk = dk.reduce(function (a, k) { return (cnt[k] || 0) > (cnt[a] || 0) ? k : a; }, dk[0]);
    $("gSpN").textContent = B.length ? "Pico: " + (cnt[pk] || 0) + " sismo(s) el " + pk.slice(8) + "/" + pk.slice(5, 7) + ". Solo cuenta lo que detecta la red." : "Sin sismos en el período.";
  }
  function serie(L) {
    var el = $("gCh"), c0 = echarts.getInstanceByDom(el);
    if (!L.length) { if (c0) c0.dispose(); el.style.height = "90px"; el.innerHTML = '<p class="nota" style="padding:18px 4px">Sin sismos con este filtro. En zonas de baja sismicidad es lo esperable; pruebe «Todo lo disponible» (el registro empieza el ' + desde() + ').</p>'; $("gChN").textContent = ""; return; }
    if (!c0) el.innerHTML = ""; el.style.height = "250px";
    var ch = echarts.getInstanceByDom(el) || echarts.init(el, null, {renderer: "svg"}), tx = X.css("--mut") || "#888", ln = X.css("--line") || "#ccc";
    var asc = L.slice().sort(function (a, b) { return a.ts - b.ts; }), E = 0, cum = asc.map(function (q) { E += Math.pow(10, 1.5 * q.mag + 4.8); return [q.ts, +((Math.log(E) / Math.LN10 - 4.8) / 1.5).toFixed(2)]; });
    ch.setOption({animation: false, grid: {left: 38, right: 44, top: 22, bottom: 28}, legend: {top: 0, right: 0, textStyle: {color: tx, fontSize: 11}, itemWidth: 12, itemHeight: 8, data: ["Magnitud equivalente acumulada"]},
      tooltip: {formatter: function (p) { if (p.seriesType === "line") return "M equivalente acumulada: <b>" + fmt(p.data[1], 1) + "</b>"; var q = p.data[3]; return 'M ' + fmt(q.mag, 1) + ' · ' + esc(q.lugar) + '<br>' + hora(q.ts) + (q.prof != null ? ' · ' + fmt(q.prof) + ' km' : ''); }},
      xAxis: {type: "time", axisLabel: {color: tx, fontSize: 11}, axisLine: {lineStyle: {color: ln}}, splitLine: {show: false}},
      yAxis: [{type: "value", name: "M", nameTextStyle: {color: tx}, min: 2.5, axisLabel: {color: tx, fontSize: 11}, splitLine: {lineStyle: {color: ln, opacity: .6}}}, {type: "value", name: "M eq.", nameTextStyle: {color: "#19b8a6"}, scale: true, axisLabel: {color: "#19b8a6", fontSize: 11}, splitLine: {show: false}}],
      series: PROF.map(function (p, i) { return {type: "scatter", name: p[1], symbolSize: 9, itemStyle: {color: p[2], opacity: .85, borderColor: "#fff", borderWidth: .8}, data: L.filter(function (q) { return (q.prof == null ? 1 : pc(q.prof)) === i; }).map(function (q) { return [q.ts, q.mag, q.prof, q]; })}; }).concat([{type: "line", name: "Magnitud equivalente acumulada", yAxisIndex: 1, step: "end", symbol: "none", lineStyle: {width: 2.2, color: "#19b8a6"}, areaStyle: {color: "rgba(25,184,166,.12)"}, data: cum, z: 1}])}, true);
    ch.off("click"); ch.on("click", function (p) { if (p.data && p.data[3]) { sel = p.data[3]; selecciona(); } });
    $("gChN").innerHTML = 'Puntos: sismos (color = profundidad). Línea verde: la energía liberada acumulada expresada como <b>un solo sismo equivalente</b> (log E = 1,5 M + 4,8); sube a saltos cuando ocurre uno grande.';
  }
  function corte(L) {
    var el = $("gCor"), c0 = echarts.getInstanceByDom(el), D = L.filter(function (q) { return q.prof != null; });
    if (!D.length) { if (c0) c0.dispose(); el.style.height = "90px"; el.innerHTML = '<p class="nota" style="padding:18px 4px">Sin sismos con profundidad en este filtro.</p>'; $("gCorN").textContent = ""; return; }
    if (!c0) el.innerHTML = ""; el.style.height = "250px";
    var ch = echarts.getInstanceByDom(el) || echarts.init(el, null, {renderer: "svg"}), tx = X.css("--mut") || "#888", ln = X.css("--line") || "#ccc", mp = Math.max(100, Math.ceil(D.reduce(function (a, q) { return Math.max(a, q.prof); }, 0) / 100) * 100);
    ch.setOption({animation: false, grid: {left: 54, right: 14, top: 14, bottom: 36}, tooltip: {formatter: function (p) { var q = p.data[3]; return 'M ' + fmt(q.mag, 1) + ' · ' + esc(q.lugar) + '<br>prof. ' + fmt(q.prof) + ' km · ' + hora(q.ts); }},
      xAxis: {type: "value", min: -70, max: -57, interval: 2, name: "Longitud (oeste → este)", nameLocation: "middle", nameGap: 22, nameTextStyle: {color: tx, fontSize: 11}, axisLabel: {color: tx, fontSize: 10, formatter: function (v) { return Math.abs(v) + "°O"; }}, axisLine: {lineStyle: {color: ln}}, splitLine: {lineStyle: {color: ln, opacity: .4}}},
      yAxis: {type: "value", inverse: true, min: 0, max: mp, name: "Profundidad (km)", nameLocation: "middle", nameGap: 38, nameTextStyle: {color: tx, fontSize: 11}, axisLabel: {color: tx, fontSize: 10}, splitLine: {lineStyle: {color: ln, opacity: .4}}},
      series: PROF.map(function (p, i) { return {type: "scatter", name: p[1], symbolSize: function (v) { return 5 + Math.max(0, v[2] - 2.5) * 4.5; }, itemStyle: {color: p[2], opacity: .85, borderColor: "#fff", borderWidth: .8}, data: D.filter(function (q) { return pc(q.prof) === i; }).map(function (q) { return [q.lon, q.prof, q.mag, q]; }),
        markLine: i === 0 ? {silent: true, symbol: "none", label: {color: tx, fontSize: 10, position: "insideEndTop"}, lineStyle: {color: tx, type: "dashed", opacity: .55}, data: [{yAxis: 70, label: {formatter: "70 km"}}, {yAxis: 300, label: {formatter: "300 km"}}]} : undefined}; })}, true);
    ch.off("click"); ch.on("click", function (p) { if (p.data && p.data[3]) { sel = p.data[3]; selecciona(); } });
    $("gCorN").innerHTML = 'Cada punto es un hipocentro (tamaño = magnitud). En los Andes la profundidad suele aumentar hacia el este, donde la placa de Nazca se hunde bajo Sudamérica.' + (L.length > D.length ? ' ' + (L.length - D.length) + ' sismo(s) sin dato de profundidad no se muestran.' : "");
  }
  var MM = null;
  function munMapa(L) {
    var cnt = {}, mxk = null; L.forEach(function (q) { var m = T.donde(q.lat, q.lon); if (!m) return; var k = m.d + "|" + m.n; cnt[k] = (cnt[k] || 0) + 1; });
    var ks = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
    $("gMmT").textContent = LG.d ? "Sismos por municipio · " + LG.d : "Sismos por municipio";
    $("gMmN").innerHTML = ks.length ? 'Más sismos: ' + ks.slice(0, 3).map(function (k) { var p = k.split("|"); return '<a href="municipio.html?d=' + encodeURIComponent(p[0]) + '&m=' + encodeURIComponent(p[1]) + '">' + esc(p[1]) + '</a> (' + cnt[k] + ')'; }).join(", ") + '. Según el epicentro; no mide efectos.' : 'Sin epicentros dentro de un municipio con este filtro.';
    $("gMmL").innerHTML = [["1", "#5b6fd5"], ["2–3", "#a67cff"], ["4–7", "#f2a41b"], ["8+", "#d7263d"]].map(function (x) { return '<span><i style="background:' + x[1] + '"></i>' + x[0] + '</span>'; }).join("") + '<span><i style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3)"></i>0</span>';
    var fc = {type: "FeatureCollection", features: ((T.D.geoMun && T.D.geoMun.features) || []).map(function (f) { return {type: "Feature", geometry: f.geometry, properties: {n: f.properties.n, d: f.properties.d, c: cnt[f.properties.d + "|" + f.properties.n] || 0}}; })};
    if (!MM) {
      MM = new maplibregl.Map({container: "gMm", style: {version: 8, sources: {}, layers: [{id: "bg", type: "background", paint: {"background-color": "rgba(0,0,0,0)"}}]}, bounds: [[-70.2, -23.2], [-56.8, -8.8]], fitBoundsOptions: {padding: 6}, attributionControl: false, scrollZoom: false});
      MM.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right");
      MM.on("load", function () {
        MM.addSource("m", {type: "geojson", data: fc}); MM.addSource("dp", {type: "geojson", data: {type: "FeatureCollection", features: T.D.geoDep.features}});
        MM.addLayer({id: "m-f", type: "fill", source: "m", paint: {"fill-color": ["step", ["get", "c"], "rgba(255,255,255,.07)", 1, "#5b6fd5", 2, "#a67cff", 4, "#f2a41b", 8, "#d7263d"], "fill-opacity": ["case", [">", ["get", "c"], 0], .92, 1]}});
        MM.addLayer({id: "m-l", type: "line", source: "m", paint: {"line-color": "rgba(255,255,255,.18)", "line-width": .4}});
        MM.addLayer({id: "dp-l", type: "line", source: "dp", paint: {"line-color": "rgba(255,255,255,.7)", "line-width": 1}});
        var pp = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 6});
        MM.on("mousemove", "m-f", function (e) { var p = e.features[0].properties; MM.getCanvas().style.cursor = "pointer"; pp.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.n) + ' (' + esc(p.d) + ')</b>' + (+p.c ? p.c + ' sismo(s) con epicentro aquí' : 'sin sismos') + '</div>').addTo(MM); });
        MM.on("mouseleave", "m-f", function () { pp.remove(); MM.getCanvas().style.cursor = ""; });
        MM.on("click", "m-f", function (e) { var p = e.features[0].properties; location.href = "municipio.html?d=" + encodeURIComponent(p.d) + "&m=" + encodeURIComponent(p.n); });
        MM._ok = 1; MM._fc = fc; ajustaMM();
      });
    } else if (MM._ok) { MM.getSource("m").setData(fc); ajustaMM(); }
  }
  function ajustaMM() { if (!MM || !MM._ok) return; var f = LUGAR.feat(T, LG), b = f ? bboxG(f.geometry) : [-70.2, -23.2, -56.8, -8.8]; MM.resize(); MM.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: 8, duration: 0, maxZoom: 9}); }
  function bboxG(g) { var b = [180, 90, -180, -90]; (function rec(c) { if (typeof c[0] === "number") b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; else c.forEach(rec); })(g.coordinates); return b; }
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
  function avisoLluvia(e) {
    var A = ((T.D.senamhi_alertas && T.D.senamhi_alertas.alertas) || []), d = S.diaKey(e.ts), rx = /lluvia|precipitaci|tormenta|granizo|desborde|crecida|riada|inundaci/i;
    return A.filter(function (a) { return rx.test((a.titulo || "") + " " + (a.fenomeno || "")) && a.inicio && a.fin && d >= a.inicio && d <= a.fin && (a.departamentos || []).some(function (x) { return (e.departamentos || []).indexOf(x) >= 0; }); })[0] || null;
  }
  function tabsPrensa() {
    var MM_ = P.mm.filter(function (e) { return LUGAR.ev(T, LG, e); }), nAv = MM_.filter(function (e) { return (e.departamentos || []).length && avisoLluvia(e); }).length, SS = P.sis.filter(function (e) { return LUGAR.ev(T, LG, e); });
    $("gTm").innerHTML = '<p class="nota">Reportes de prensa de derrumbes, deslizamientos y similares. La posición es aproximada (se deduce del lugar nombrado). Se cruzan con los <b>avisos de lluvia del SENAMHI</b> vigentes el día de la nota en el mismo departamento: es una coincidencia de fecha y lugar, <b>no prueba que la lluvia fuera la causa</b>. ' + P.sin.length + ' notas no tienen lugar identificable y no se grafican.</p>' + (MM_.length ? '<p style="margin:6px 0;font-size:13.5px"><b>' + nAv + ' de ' + MM_.length + '</b> reportes coinciden con un aviso de lluvia del SENAMHI (fecha y departamento).</p>' : "") +
      (MM_.length ? '<table class="xt2"><tr><th align="left">Fecha</th><th align="left">Nota</th><th align="left">Medio</th><th align="left">Departamento</th><th align="left">Aviso SENAMHI de lluvia ese día</th></tr>' + MM_.map(function (e) { var av = (e.departamentos || []).length ? avisoLluvia(e) : null; return '<tr><td style="white-space:nowrap">' + hora(e.ts) + '</td><td>' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.titulo) + '</a>' : esc(e.titulo)) + '</td><td class="nota">' + esc(e.fuente || "") + '</td><td class="nota">' + esc((e.departamentos || []).join(", ") || "sin lugar") + '</td><td>' + ((e.departamentos || []).length ? (av ? '<a href="' + esc(av.url) + '" target="_blank" rel="noopener"><b style="color:' + (av.nivel === "ROJO" ? "#d7263d" : av.nivel === "NARANJA" ? "#f2831b" : "#d9a400") + '">' + esc(av.nivel) + '</b></a> <span class="nota">' + esc((av.inicio === av.fin ? av.inicio : av.inicio + " a " + av.fin)) + '</span>' : '<span class="nota">sin aviso registrado</span>') : '<span class="nota">sin dato</span>') + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin reportes de derrumbes o deslizamientos en este lugar.</p>') +
      '<details class="gdet"><summary>Notas de prensa sobre sismos (' + SS.length + ') — sirven para corroborar, no se grafican</summary><p class="nota">El mapa usa solo fuentes instrumentales.' + (P.desc ? ' ' + P.desc + ' notas clasificadas como geológicas se descartaron por no referirse a Bolivia (terremotos en otros países, usos figurados).' : '') + '</p>' + noticias(SS, "Sin notas en este lugar.") + '</details>';
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

/* Tablero principal — Sala de Situación Bolivia 2.0 */
(function () {
  var S = SALA, X = S2, D = null, INIT = {}, MAPS = {};
  var TABS = [["res", "Resumen", "home", "Lo más importante de hoy: tipos de evento, alertas prioritarias y gráficos"], ["map", "Mapa", "map", "Mapa interactivo con capas. Permite llegar hasta municipio"],
    ["sal", "Salud", "virus", "Eventos biológicos: brotes, epidemias, boletín del Ministerio de Salud y alertas OPS/OMS"], ["tra", "Tránsito", "car", "Accidentes detectados en la prensa, con nivel de confianza por número de medios"],
    ["inc", "Incendios", "fire", "Focos de calor por satélite (NASA FIRMS) y complejos de incendio"], ["seq", "Sequías", "sun", "Índice de sequía SPI por departamento"], ["rio", "Ríos", "water", "Caudales de ríos y riesgo de crecida (modelo GloFAS)"],
    ["ev", "Eventos", "list", "Tabla de todos los eventos con filtros por tipo, departamento y municipio; descarga en CSV/Excel/JSON"], ["rep", "Reportes PDF", "doc", "Alertas, reportes diarios, semanales y por solicitud en PDF"], ["dat", "Datos", "db", "Descargar la base de datos completa (CSV, Excel, JSON, GeoJSON)"]];
  X.header("index.html", TABS.filter(function (t) { return ["res", "map", "ev", "rep", "dat"].indexOf(t[0]) >= 0; }));
  var wrap = document.querySelector(".wrap"), IC = {INFO: "info", ALERT: "shield", PULSE: "pulse", MAP: "map", LIST: "list", FIRE: "fire", SUN: "sun", WATER: "water", DL: "dl", DOC: "doc"};
  wrap.innerHTML = wrap.innerHTML.replace(/__I_(\w+)__/g, function (_, k) { return X.ic(IC[k]); });
  function $(id) { return document.getElementById(id); }
  var HOY = S.diaKey(Date.now()), DIA = 86400000;
  var NIVN = {"VERDE": 0, "AMARILLO": 1, "AMARILLA": 1, "NARANJA": 2, "ROJO": 2.99, "ROJA": 3};
  function nivN(t) { t = (t || "").toUpperCase(); return t === "ROJO" || t === "ROJA" ? 3 : t === "NARANJA" ? 2 : t.indexOf("AMARIL") === 0 ? 1 : t === "VERDE" ? 0 : -1; }
  function fichaUrl(id) { return "evento.html?id=" + encodeURIComponent(id); }
  function kpi(l, v, d, col, ic) { return '<div class="card kpi" style="--k:' + col + '"><div class="ic" style="color:' + col + '">' + X.ic(ic) + '</div><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; }
  function mesesAtras(um, n) { var p = um.split("-"), y = +p[0], m = +p[1], o = []; for (var i = n - 1; i >= 0; i--) { var t = y * 12 + (m - 1) - i; o.push(Math.floor(t / 12) + "-" + ("0" + (t % 12 + 1)).slice(-2)); } return o; }
  var SPICOL = ["#c0392b", -2, "#ef8a3b", -1.5, "#f7c873", -1, "#eef1f5", 1, "#8fc0e8", 1.5, "#3b82c4", 2, "#1d4e9c"];
  var SPICLS = [["Extrema", "#c0392b"], ["Severa", "#ef8a3b"], ["Moderada", "#f7c873"], ["Normal", "#eef1f5"], ["Húmedo", "#8fc0e8"], ["Muy húmedo", "#3b82c4"], ["Extremo húmedo", "#1d4e9c"]];
  function spiColor(v) { if (v == null) return "#ccd3dd"; var c = SPICOL[0]; for (var i = 1; i < SPICOL.length; i += 2) if (v >= SPICOL[i]) c = SPICOL[i + 1]; return c; }
  var COLNIV = {0: "#2e9e5b", 1: "#f5b700", 2: "#f26a1b", 3: "#d7263d"};

  /* ---------- datos derivados ---------- */
  function derivar() {
    var d = D, P = (d.focos_puntos && d.focos_puntos.puntos) || [], dias = (d.focos_puntos && d.focos_puntos.dias) || [];
    d.P = P; d.dias = dias; d.ultDia = dias.length ? dias[dias.length - 1] : null;
    d.sis = ((d.sismos_oficiales && d.sismos_oficiales.sismos) || []).map(function (s) { s.ts = new Date(s.fecha_local.replace(" ", "T") + "-04:00").getTime(); return s; });
    d.avisos = ((d.senamhi_alertas && d.senamhi_alertas.alertas) || []).filter(function (a) { return (a.fin || "9999") >= HOY; });
    d.sq = (d.sequia && d.sequia.departamentos) || {};
    d.cau = ((d.caudales && d.caudales.puntos) || []).filter(function (p) { return p.fechas; });
    var ts = [d.eventos_unificados && d.eventos_unificados.generado, d.focos_puntos && d.focos_puntos.actualizado && Date.parse(d.focos_puntos.actualizado), d.estado_fuentes && d.estado_fuentes.generado].filter(function (x) { return x && !isNaN(x); });
    X.live(Math.max.apply(null, ts.concat([0])) || null);
  }

  /* ---------- RESUMEN ---------- */
  function resumen() {
    tipos();
    var ev = D.ev, now = Date.now(), ult24 = ev.filter(function (e) { return e.ts > now - DIA && e.origen !== "modelo" && e.origen !== "epidemiologia"; });
    var av2 = D.avisos.filter(function (a) { return nivN(a.nivel) >= 2; }), avR = D.avisos.filter(function (a) { return nivN(a.nivel) === 3; });
    var nHoy = 0, nAyer = 0; D.P.forEach(function (p) { if (p[3] === D.ultDia) nHoy++; });
    var di = D.dias.length > 1 ? D.dias[D.dias.length - 2] : null; if (di) D.P.forEach(function (p) { if (p[3] === di) nAyer++; });
    var cp = (D.focos_complejos && D.focos_complejos.complejos) || [], mayor = cp[0];
    var sis7 = D.sis.filter(function (s) { return s.ts > now - 7 * DIA; }), mx = sis7.reduce(function (a, s) { return Math.max(a, s.mag); }, 0);
    var seq = Object.keys(D.sq).filter(function (k) { return D.sq[k].spi3 != null && D.sq[k].spi3 <= -1; });
    var rios = D.cau.filter(function (p) { return (p.nivel || 0) >= 1; });
    var fr = [];
    fr.push(av2.length ? av2.length + " aviso" + (av2.length > 1 ? "s" : "") + " naranja/rojo vigente" + (av2.length > 1 ? "s" : "") + " del SENAMHI" + (avR.length ? " (" + avR.length + " rojo)" : "") : "sin avisos naranja o rojos vigentes del SENAMHI");
    if (!D.focos_puntos) fr.push("focos de calor: datos en preparación"); else if (D.ultDia) fr.push(nHoy + " focos de calor detectados el " + D.ultDia.slice(8) + "/" + D.ultDia.slice(5, 7) + (mayor ? ", el mayor complejo en " + mayor.municipio + " (" + mayor.departamento + ", " + mayor.n + " focos)" : ""));
    fr.push(sis7.length ? sis7.length + " sismos en 7 días (máx. M " + mx.toFixed(1) + ")" : "sin sismos registrados en 7 días");
    if (seq.length) fr.push("déficit de lluvia (SPI-3) en " + seq.join(", ")); if (rios.length) fr.push(rios.length + " río" + (rios.length > 1 ? "s" : "") + " con caudal sobre lo normal");
    $("heroT").textContent = "Hoy: " + fr.join(" · ") + ".";
    $("kpis").innerHTML = kpi("Avisos SENAMHI vigentes", D.avisos.length, av2.length + " naranja/rojo", av2.length ? "#f26a1b" : "#2e9e5b", "shield") +
      kpi("Focos de calor (último día)", nHoy.toLocaleString("es-BO"), di ? (nHoy >= nAyer ? '<span class="up">▲ ' : '<span class="dn">▼ ') + Math.abs(nHoy - nAyer).toLocaleString("es-BO") + "</span> vs. día anterior" : "NASA FIRMS", "#d7263d", "fire") +
      kpi("Sismos en 7 días", sis7.length, sis7.length ? "máxima M " + mx.toFixed(1) : "—", "#8d6e63", "pulse") +
      kpi("Sequía (SPI-3 ≤ −1)", seq.length + " dep.", seq.length ? seq.join(", ") : "Sin déficit relevante", seq.length ? "#ef8a3b" : "#2e9e5b", "sun");
    /* prioritarios */
    var pr = [];
    ev.forEach(function (e) {
      var s = 0;
      if (e.origen === "senamhi" && e.nivel >= 2 && ((e.cifras && e.cifras.fin) || "9") >= HOY) s = 100 + e.nivel * 10;
      else if (e.origen === "foco" && e.cifras && e.cifras.detecciones >= 40 && e.ts > now - 2 * DIA) s = 60 + Math.min(30, e.cifras.detecciones / 10);
      else if (e.origen === "caudal") s = 70;
      else if (e.origen === "sismo" && e.cifras && e.cifras.magnitud >= 4.5 && e.ts > now - 7 * DIA) s = 65 + e.cifras.magnitud;
      else if (e.origen === "sequia") s = 50;
      else if (e.origen === "prensa" && e.nivel >= 2 && e.ts > now - 2 * DIA) s = 55 + e.nivel;
      if (s) pr.push([s, e]);
    });
    pr.sort(function (a, b) { return b[0] - a[0] || b[1].ts - a[1].ts; });
    $("prior").innerHTML = pr.slice(0, 6).map(function (p) {
      var e = p[1], c = e.nivel != null ? COLNIV[e.nivel] : (S.COLCAT[e.categoria] || "#999");
      return '<a class="alert" href="' + fichaUrl(e.id) + '" style="--c:' + c + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(e.titulo) + '</div><div class="m">' + S.esc(e.lugar || (e.departamentos || []).join(", ")) + ' · ' + S.fecha(e.ts) + '</div></div><div style="text-align:right;display:flex;gap:4px;flex-direction:column;align-items:flex-end">' + S.badgeNivel(e) + X.confBadge(e) + '</div></a>';
    }).join("") || '<p class="vacio">No hay alertas prioritarias en este momento.</p>';
    /* gráficos */
    var cnt = {"Alta": 0, "Media": 0, "Baja": 0}; ev.forEach(function (e) { if (e.confianza && e.origen !== "modelo") cnt[e.confianza.nivel]++; });
    X.chart("chConf", {tooltip: {trigger: "item"}, legend: {bottom: 0}, series: [{type: "pie", radius: ["48%", "72%"], center: ["50%", "44%"], itemStyle: {borderRadius: 6, borderColor: X.css("--card"), borderWidth: 2}, label: {formatter: "{b}\n{c}", color: X.css("--ink")}, data: [{name: "Alta", value: cnt.Alta, itemStyle: {color: "#0b7a53"}}, {name: "Media", value: cnt.Media, itemStyle: {color: "#d9a400"}}, {name: "Baja", value: cnt.Baja, itemStyle: {color: "#8896ab"}}]}]});
    var cats = S.CAT.slice(0, 7), dd = []; for (var i = 29; i >= 0; i--) dd.push(S.diaKey(now - i * DIA));
    var m = {}; ev.forEach(function (e) { if (e.origen === "modelo") return; var k = S.diaKey(e.ts); (m[e.categoria] = m[e.categoria] || {})[k] = (m[e.categoria][k] || 0) + 1; });
    X.chart("chEvol", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 36, right: 10, top: 62, bottom: 30}, xAxis: {type: "category", data: dd.map(function (k) { return k.slice(5); }), boundaryGap: false}, yAxis: {type: "value"},
      series: cats.map(function (c) { return {name: c, type: "line", stack: "t", smooth: true, symbol: "none", areaStyle: {opacity: .75}, lineStyle: {width: 1}, itemStyle: {color: S.COLCAT[c]}, data: dd.map(function (k) { return (m[c] || {})[k] || 0; })}; })});
    var h = {}; ev.forEach(function (e) { if (e.origen === "modelo" || e.ts < now - 30 * DIA) return; (e.departamentos || []).forEach(function (dp) { var k = dp + "|" + e.categoria; h[k] = (h[k] || 0) + 1; }); });
    var hd = [], hm = 1; S.DEPS.forEach(function (dp, y) { cats.forEach(function (c, x) { var v = h[dp + "|" + c] || 0; hm = Math.max(hm, v); hd.push([x, y, v || null]); }); });
    X.chart("chHeat", {tooltip: {formatter: function (p) { return S.DEPS[p.value[1]] + " · " + cats[p.value[0]] + ": <b>" + (p.value[2] || 0) + "</b>"; }}, grid: {left: 100, right: 14, top: 10, bottom: 70}, xAxis: {type: "category", data: cats, axisLabel: {rotate: 35}, splitArea: {show: true}}, yAxis: {type: "category", data: S.DEPS, inverse: true},
      visualMap: {min: 0, max: hm, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 140, inRange: {color: ["#e8f1fb", "#7fb2e5", "#1d6fb8", "#0b3b6e"]}, textStyle: {color: X.css("--mut")}},
      series: [{type: "heatmap", data: hd, label: {show: true, color: "#fff", formatter: function (p) { return p.value[2] || ""; }}, itemStyle: {borderColor: X.css("--card"), borderWidth: 2, borderRadius: 4}}]});
    graficosExtra(ev, now);
    /* sankey */
    var fam = {prensa: "Prensa", senamhi: "SENAMHI", sismo: "San Calixto", foco: "NASA FIRMS", epidemiologia: "Epidemiología MSD/OPS", modelo: "Modelos abiertos", gdacs: "GDACS/USGS", usgs: "GDACS/USGS", sequia: "Modelos abiertos", caudal: "Modelos abiertos"}, lk = {}, nodes = {};
    ev.forEach(function (e) { if (e.ts < now - 30 * DIA && e.origen !== "sequia" && e.origen !== "epidemiologia") return; var a = fam[e.origen] || e.origen, b = e.categoria; lk[a + "|" + b] = (lk[a + "|" + b] || 0) + 1; nodes[a] = 1; nodes[b] = 1; });
    X.chart("chSank", {tooltip: {trigger: "item"}, series: [{type: "sankey", left: 8, right: 90, top: 8, bottom: 8, nodeGap: 10, emphasis: {focus: "adjacency"}, lineStyle: {color: "gradient", curveness: .5, opacity: .45}, label: {color: X.css("--ink"), fontSize: 12},
      data: Object.keys(nodes).map(function (n) { return {name: n, itemStyle: {color: S.COLCAT[n] || "#1d6fb8"}}; }), links: Object.keys(lk).map(function (k) { var p = k.split("|"); return {source: p[0], target: p[1], value: lk[k]}; })}]});
    X.chart("chSis", {tooltip: {formatter: function (p) { var s = p.data[3]; return "<b>M " + p.data[1] + "</b><br>" + s.fecha_local + "<br>" + s.provincia + ", " + s.departamento + "<br>Prof. " + s.prof_km + " km"; }}, grid: {left: 40, right: 14, top: 14, bottom: 60}, xAxis: {type: "time"}, yAxis: {type: "value", name: "Magnitud", min: 2, nameTextStyle: {color: X.css("--mut")}},
      visualMap: {dimension: 2, min: 0, max: 300, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 120, text: ["profundo", "superficial"], inRange: {color: ["#d7263d", "#f5b700", "#2a7fd1"]}, textStyle: {color: X.css("--mut")}},
      series: [{type: "scatter", symbolSize: function (v) { return 5 + Math.pow(v[1], 2) * 1.2; }, itemStyle: {opacity: .85, borderColor: "#fff", borderWidth: 1}, data: D.sis.map(function (s) { return [s.ts, s.mag, s.prof_km, s]; })}]});
  }

  /* ---------- MAPA ---------- */
  function estilo(base) {
    var l = [{id: "bg", type: "background", paint: {"background-color": X.css("--soft") || "#f3f6fb"}}], src = {};
    var osc = document.documentElement.getAttribute("data-theme") === "dark";
    if (base) { src.osm = {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 18, attribution: "© OpenStreetMap"}; l.push({id: "osm", type: "raster", source: "osm", paint: {"raster-opacity": osc ? .55 : .75, "raster-brightness-max": osc ? .42 : 1, "raster-saturation": osc ? -.4 : 0}}); }
    return {version: 8, sources: src, layers: l};
  }
  function geoCopia(g) { return JSON.parse(JSON.stringify(g || {type: "FeatureCollection", features: []})); }
  function puntosGeo(P, dias) { var s = D.dias.slice(-dias); return {type: "FeatureCollection", features: P.filter(function (p) { return s.indexOf(p[3]) >= 0; }).map(function (p) { return {type: "Feature", properties: {frp: p[2], f: p[3], dep: p[4], mun: p[5]}, geometry: {type: "Point", coordinates: [p[1], p[0]]}}; })}; }
  function nuevoMapa(id, base) {
    var m = new maplibregl.Map({container: id, style: estilo(base !== false), bounds: [[-69.9, -23.1], [-57.2, -9.4]], fitBoundsOptions: {padding: 10}, attributionControl: {compact: true}, preserveDrawingBuffer: true});
    m.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); m.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-left"); return m;
  }
  function capaHeat(m, dias, vis) {
    m.addSource("focos", {type: "geojson", data: puntosGeo(D.P, dias)});
    m.addLayer({id: "heat", type: "heatmap", source: "focos", maxzoom: 11, layout: {visibility: vis ? "visible" : "none"}, paint: {"heatmap-weight": ["interpolate", ["linear"], ["get", "frp"], 0, .25, 30, 1], "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, .35, 6, .7, 9, 1.8], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 6, 12, 9, 28], "heatmap-opacity": .88,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,255,178,0)", .1, "rgba(254,217,118,.55)", .3, "#feb24c", .5, "#fd8d3c", .7, "#f03b20", .9, "#bd0026", 1, "#7a0026"]}});
    m.addLayer({id: "focoPt", type: "circle", source: "focos", minzoom: 8.5, layout: {visibility: vis ? "visible" : "none"}, paint: {"circle-radius": ["interpolate", ["linear"], ["get", "frp"], 0, 3, 40, 8], "circle-color": "#f03b20", "circle-opacity": .8, "circle-stroke-color": "#fff", "circle-stroke-width": 1}});
    m.on("click", "focoPt", function (e) { var p = e.features[0].properties; new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop"><b>Foco de calor</b>' + S.esc(p.mun) + ", " + S.esc(p.dep) + "<br>" + S.esc(p.f) + " · FRP " + p.frp + " MW</div>").addTo(m); });
  }
  function popEv(m, capa, fn) { m.on("click", capa, function (e) { new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop">' + fn(e.features[0].properties) + '</div>').addTo(m); }); m.on("mouseenter", capa, function () { m.getCanvas().style.cursor = "pointer"; }); m.on("mouseleave", capa, function () { m.getCanvas().style.cursor = ""; }); }
  function depSpi(escala) { var g = geoCopia(D.geoDep); g.features.forEach(function (f) { var v = D.sq[f.properties.n]; f.properties.spi = v ? v["spi" + escala] : null; f.properties.cl = v ? v["clase" + escala] : ""; }); return g; }
  function mapaGeneral() {
    var m = MAPS.gen = nuevoMapa("mapa", true); controlesTerr();
    m.on("load", function () {
      var mun = geoCopia(D.geoMun), niv = {}; D.avisos.forEach(function (a) { var n = nivN(a.nivel); if (n < 0) return; (a.municipios || []).forEach(function (t) { var k = t; if (niv[k] == null || n > niv[k]) niv[k] = n; }); });
      mun.features.forEach(function (f) { var v = niv[f.properties.n + " (" + f.properties.d + ")"]; f.properties.niv = v == null ? -1 : v; });
      m.addSource("mun", {type: "geojson", data: mun}); m.addSource("dep", {type: "geojson", data: depSpi(3)});
      m.addLayer({id: "mun-fill", type: "fill", source: "mun", layout: {visibility: "none"}, paint: {"fill-color": ["match", ["round", ["get", "niv"]], 0, "#bfe5c9", 1, "#f9dc6b", 2, "#f7a15e", 3, "#e5576a", "rgba(0,0,0,0)"], "fill-opacity": ["case", [">=", ["get", "niv"], 0], .75, 0]}});
      m.addLayer({id: "dep-fill", type: "fill", source: "dep", layout: {visibility: "none"}, paint: {"fill-color": ["step", ["coalesce", ["get", "spi"], 0]].concat(SPICOL), "fill-opacity": .7}});
      m.addLayer({id: "dep-line", type: "line", source: "dep", paint: {"line-color": "#4b5a70", "line-width": 1.2}});
      capasMun(m);
      capaHeat(m, 3, true);
      var cp = ((D.focos_complejos && D.focos_complejos.complejos) || []).map(function (c) { return {type: "Feature", properties: {n: c.n, frp: c.frp_mw, lugar: c.municipio + ", " + c.departamento, id: "complejo:" + c.id + ":" + c.departamento}, geometry: {type: "Point", coordinates: [c.lon, c.lat]}}; });
      m.addSource("comp", {type: "geojson", data: {type: "FeatureCollection", features: cp}});
      m.addLayer({id: "comp", type: "circle", source: "comp", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "n"], 8, 7, 120, 20], "circle-color": "rgba(215,38,61,.15)", "circle-stroke-color": "#d7263d", "circle-stroke-width": 2.5}});
      popEv(m, "comp", function (p) { return "<b>Complejo de focos</b>" + S.esc(p.lugar) + "<br>" + p.n + " detecciones · " + p.frp + " MW<br><a href='" + fichaUrl(p.id) + "'>Abrir informe →</a>"; });
      var sis = D.sis.filter(function (s) { return s.ts > Date.now() - 7 * DIA; }).map(function (s) { return {type: "Feature", properties: {mag: s.mag, t: s.fecha_local, l: s.provincia + ", " + s.departamento, p: s.prof_km, id: "sismo:" + s.id}, geometry: {type: "Point", coordinates: [s.lon, s.lat]}}; });
      m.addSource("sis", {type: "geojson", data: {type: "FeatureCollection", features: sis}});
      m.addLayer({id: "sis", type: "circle", source: "sis", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2, 4, 6, 18], "circle-color": ["interpolate", ["linear"], ["get", "p"], 0, "#d7263d", 100, "#f5b700", 300, "#2a7fd1"], "circle-opacity": .8, "circle-stroke-color": "#fff", "circle-stroke-width": 1.2}});
      popEv(m, "sis", function (p) { return "<b>Sismo M " + p.mag + "</b>" + S.esc(p.l) + "<br>" + p.t + " · prof. " + p.p + " km<br><a href='" + fichaUrl(p.id) + "'>Abrir informe →</a>"; });
      var rio = D.cau.map(function (c) { return {type: "Feature", properties: {n: c.nombre, r: c.rio, e: c.estado, v: c.nivel || 0, id: "caudal:" + c.nombre + ":" + c.hoy}, geometry: {type: "Point", coordinates: [c.lon, c.lat]}}; });
      m.addSource("rio", {type: "geojson", data: {type: "FeatureCollection", features: rio}});
      m.addLayer({id: "rio", type: "circle", source: "rio", paint: {"circle-radius": 8, "circle-color": ["match", ["get", "v"], 0, "#2a9d8f", 1, "#f5b700", 2, "#f26a1b", "#d7263d"], "circle-stroke-color": "#fff", "circle-stroke-width": 2}});
      popEv(m, "rio", function (p) { return "<b>" + S.esc(p.r) + " — " + S.esc(p.n) + "</b>" + S.esc(p.e) + "<br><a href='" + fichaUrl(p.id) + "'>Abrir informe →</a> <a href='#' onclick=\"document.querySelector('[data-t=rio]').click();return false\">Ver caudales</a>"; });
      var evs = D.ev.filter(function (e) { return e.lat != null && ["foco", "sismo", "caudal", "modelo"].indexOf(e.origen) < 0; }).map(function (e) { return {type: "Feature", properties: {t: e.titulo, c: e.categoria, id: e.id, l: e.lugar || ""}, geometry: {type: "Point", coordinates: [e.lon, e.lat]}}; });
      var col = ["match", ["get", "c"]]; Object.keys(S.COLCAT).forEach(function (k) { col.push(k, S.COLCAT[k]); }); col.push("#777");
      m.addSource("evs", {type: "geojson", data: {type: "FeatureCollection", features: evs}});
      m.addLayer({id: "evs", type: "circle", source: "evs", paint: {"circle-radius": 6, "circle-color": col, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5}});
      popEv(m, "evs", function (p) { return "<b>" + S.esc(p.t) + "</b>" + S.esc(p.l) + "<br><a href='" + fichaUrl(p.id) + "'>Abrir informe →</a>"; });
      m.on("mouseenter", "comp", function () { m.getCanvas().style.cursor = "pointer"; });
      ligarCapas(m); leyenda();
    });
  }
  function vis(m, ids, on) { ids.forEach(function (i) { if (m.getLayer(i)) m.setLayoutProperty(i, "visibility", on ? "visible" : "none"); }); }
  function ligarCapas(m) {
    $("lHeat").onchange = function () { vis(m, ["heat", "focoPt"], this.checked); };
    $("lComp").onchange = function () { vis(m, ["comp"], this.checked); };
    $("lSis").onchange = function () { vis(m, ["sis"], this.checked); };
    $("lRio").onchange = function () { vis(m, ["rio"], this.checked); };
    $("lEv").onchange = function () { vis(m, ["evs"], this.checked); };
    $("lBase").onchange = function () { vis(m, ["osm"], this.checked); };
    $("rgDias").max = Math.max(1, D.dias.length || 10);
    $("rgDias").oninput = function () { $("lblDias").textContent = this.value == 1 ? "Último día" : "Últimos " + this.value + " días"; m.getSource("focos").setData(puntosGeo(D.P, +this.value)); };
    [].forEach.call(document.querySelectorAll("input[name=fill]"), function (r) { r.onchange = function () { vis(m, ["mun-fill"], r.value === "avisos" && r.checked); vis(m, ["dep-fill"], r.value === "spi" && r.checked); leyenda(); }; });
  }
  function leyenda() {
    var f = (document.querySelector("input[name=fill]:checked") || {}).value, h = '<span><i style="background:linear-gradient(90deg,#feb24c,#f03b20,#7a0026)"></i>Densidad de focos</span><span><i style="border:2px solid #d7263d;background:none"></i>Complejo</span>';
    if (f === "avisos") h += ["#bfe5c9", "#f9dc6b", "#f7a15e", "#e5576a"].map(function (c, i) { return '<span><i style="background:' + c + '"></i>Aviso ' + S.NIVTXT[i].toLowerCase() + '</span>'; }).join("");
    if (f === "spi") h += SPICLS.map(function (c) { return '<span><i style="background:' + c[1] + '"></i>' + c[0] + '</span>'; }).join("");
    $("legMap").innerHTML = h + '<span><i style="background:#2a9d8f;border-radius:50%"></i>Río normal</span><span><i style="background:#f26a1b;border-radius:50%"></i>Río elevado</span>';
  }

  /* ---------- INCENDIOS ---------- */
  function incendios() {
    if (!D.focos_puntos) { $("t-inc").innerHTML = '<div class="card vacio"><b>Aún no hay datos de focos de calor del módulo nuevo.</b><br>Se generan en la próxima actualización automática (cada 30 minutos). Si pasaron más de 2 horas, revise <a href="fuentes.html">Estado de las fuentes</a>.</div>'; return; }
    var P = D.P, dias = D.dias, pd = {}, dd = {}, mm = {}, tot = 0, frp = 0;
    dias.forEach(function (d) { pd[d] = {n: 0, f: 0}; });
    P.forEach(function (p) { if (!pd[p[3]]) return; pd[p[3]].n++; pd[p[3]].f += p[2] || 0; tot++; frp += p[2] || 0; var k = p[4] + "|" + p[3]; dd[k] = (dd[k] || 0) + 1; var mk = p[5] + " (" + p[4] + ")"; mm[mk] = (mm[mk] || 0) + 1; });
    var cp = ((D.focos_complejos && D.focos_complejos.complejos) || []), u = dias[dias.length - 1], pu = pd[u] || {n: 0, f: 0};
    $("kInc").innerHTML = kpi("Focos del último día", pu.n.toLocaleString("es-BO"), u || "", "#d7263d", "fire") + kpi("Focos en 10 días", tot.toLocaleString("es-BO"), "NASA FIRMS · VIIRS NOAA-21", "#f26a1b", "fire") + kpi("Potencia total (último día)", Math.round(pu.f).toLocaleString("es-BO") + " MW", "FRP: intensidad del fuego", "#c0392b", "pulse") + kpi("Complejos de incendio", cp.length, cp[0] ? "mayor: " + cp[0].municipio + " (" + cp[0].n + ")" : "", "#8d6e63", "map");
    var m = MAPS.inc = nuevoMapa("mapaInc", true); m.on("load", function () { m.addSource("dep", {type: "geojson", data: geoCopia(D.geoDep)}); m.addLayer({id: "dep-line", type: "line", source: "dep", paint: {"line-color": "#4b5a70", "line-width": 1.2}}); capaHeat(m, 3, true);
      var f = cp.map(function (c) { return {type: "Feature", properties: {n: c.n, lugar: c.municipio + ", " + c.departamento, frp: c.frp_mw, id: "complejo:" + c.id + ":" + c.departamento}, geometry: {type: "Point", coordinates: [c.lon, c.lat]}}; });
      m.addSource("comp", {type: "geojson", data: {type: "FeatureCollection", features: f}}); m.addLayer({id: "comp", type: "circle", source: "comp", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "n"], 8, 7, 120, 20], "circle-color": "rgba(215,38,61,.12)", "circle-stroke-color": "#d7263d", "circle-stroke-width": 2.2}});
      popEv(m, "comp", function (p) { return "<b>Complejo de focos</b>" + S.esc(p.lugar) + "<br>" + p.n + " detecciones · " + p.frp + " MW<br><a href='" + fichaUrl(p.id) + "'>Abrir informe →</a>"; }); });
    $("listaComp").innerHTML = cp.length ? '<table>' + cp.slice(0, 25).map(function (c) { return '<tr><td><a href="' + fichaUrl("complejo:" + c.id + ":" + c.departamento) + '"><b>' + S.esc(c.municipio) + '</b></a><br><span class="nota">' + S.esc(c.departamento) + '</span></td><td style="text-align:right"><b>' + c.n + '</b> focos<br><span class="nota">' + Math.round(c.frp_mw) + ' MW</span></td></tr>'; }).join("") + '</table>' : '<p class="vacio">Sin complejos en el último día.</p>';
    X.chart("chIncDia", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 50, right: 50, top: 40, bottom: 30}, xAxis: {type: "category", data: dias.map(function (d) { return d.slice(5); })}, yAxis: [{type: "value", name: "Focos"}, {type: "value", name: "MW", splitLine: {show: false}}],
      series: [{name: "Focos", type: "bar", data: dias.map(function (d) { return pd[d].n; }), itemStyle: {color: "#f26a1b", borderRadius: [4, 4, 0, 0]}}, {name: "Potencia (MW)", type: "line", yAxisIndex: 1, smooth: true, symbolSize: 7, itemStyle: {color: "#7a0026"}, lineStyle: {width: 3}, data: dias.map(function (d) { return Math.round(pd[d].f); })}]});
    var dp = {}; P.forEach(function (p) { dp[p[4]] = (dp[p[4]] || 0) + 1; });
    X.chart("chIncDep", {tooltip: {trigger: "item", formatter: "{b}: {c} ({d}%)"}, series: [{type: "pie", roseType: "radius", radius: ["15%", "72%"], center: ["50%", "52%"], itemStyle: {borderRadius: 5, borderColor: X.css("--card"), borderWidth: 2}, label: {color: X.css("--ink")}, data: Object.keys(dp).sort(function (a, b) { return dp[b] - dp[a]; }).map(function (k) { return {name: k, value: dp[k]}; }), color: ["#c0392b", "#e67e22", "#f1c40f", "#8d6e63", "#2a7fd1", "#16a085", "#8e44ad", "#7f8c8d", "#d35400"]}]});
    var hd = [], hm = 1; S.DEPS.forEach(function (dep, y) { dias.forEach(function (d, x) { var v = dd[dep + "|" + d] || 0; hm = Math.max(hm, v); hd.push([x, y, v]); }); });
    X.chart("chIncHeat", {tooltip: {formatter: function (p) { return S.DEPS[p.value[1]] + " · " + dias[p.value[0]] + ": <b>" + p.value[2] + "</b> focos"; }}, grid: {left: 82, right: 14, top: 10, bottom: 60}, xAxis: {type: "category", data: dias.map(function (d) { return d.slice(5); }), splitArea: {show: true}}, yAxis: {type: "category", data: S.DEPS, inverse: true},
      visualMap: {min: 0, max: hm, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 140, inRange: {color: ["#fff5e0", "#fdbf6f", "#f26a1b", "#bd0026", "#5a0019"]}, textStyle: {color: X.css("--mut")}}, series: [{type: "heatmap", data: hd, itemStyle: {borderColor: X.css("--card"), borderWidth: 2, borderRadius: 3}}]});
    var tm = Object.keys(mm).sort(function (a, b) { return mm[b] - mm[a]; }).slice(0, 12).reverse();
    X.chart("chIncMun", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, grid: {left: 150, right: 30, top: 10, bottom: 20}, xAxis: {type: "value"}, yAxis: {type: "category", data: tm, axisLabel: {width: 140, overflow: "truncate"}}, series: [{type: "bar", data: tm.map(function (k) { return mm[k]; }), itemStyle: {borderRadius: [0, 4, 4, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{offset: 0, color: "#fdbf6f"}, {offset: 1, color: "#bd0026"}])}, label: {show: true, position: "right", color: X.css("--ink")}}]});
    var pr = D.focos_propension;
    if (pr && pr.dias) {
      var ds = Object.keys(pr.dias).sort(), filas = {}; ds.forEach(function (d) { pr.dias[d].forEach(function (r) { var k = r.departamento + " · " + r.region; (filas[k] = filas[k] || {})[d] = r.propension; }); });
      var cc = function (t) { t = t || ""; return /muy/i.test(t) ? "#d7263d" : /poco/i.test(t) ? "#2e9e5b" : /propensa/i.test(t) ? "#f26a1b" : "#7a8aa3"; };
      $("propCap").innerHTML = 'Boletín del ' + S.esc(pr.boletin) + ' · <a target="_blank" rel="noopener" href="' + S.esc(pr.url) + '">abrir PDF oficial</a>. ' + S.esc((pr.aclaracion || "").slice(0, 200));
      $("propT").innerHTML = '<table><tr><th>Departamento · región</th>' + ds.map(function (d) { return '<th>' + d.slice(5) + '</th>'; }).join("") + '</tr>' + Object.keys(filas).map(function (k) { return '<tr><td><b>' + S.esc(k) + '</b></td>' + ds.map(function (d) { var t = filas[k][d]; return '<td>' + (t ? '<span class="badge" style="background:' + cc(t) + '">' + S.esc(t) + '</span>' : "—") + '</td>'; }).join("") + '</tr>'; }).join("") + '</table>';
    } else $("cProp").style.display = "none";
  }

  /* ---------- SEQUÍAS ---------- */
  var ESC = 3, DEPSEL = null;
  function sequia() {
    var sq = D.sq, deps = Object.keys(sq); if (!deps.length) { $("t-seq").innerHTML = '<div class="card vacio"><b>Aún no hay datos de sequía.</b><br>El índice SPI se calcula una vez al día en la actualización automática; aparecerá aquí tras el próximo ciclo. Si pasaron más de 2 horas, revise <a href="fuentes.html">Estado de las fuentes</a>.</div>'; return; }
    var um = D.sequia.ultimo_mes, peor = deps.slice().sort(function (a, b) { return (sq[a].spi3 == null ? 9 : sq[a].spi3) - (sq[b].spi3 == null ? 9 : sq[b].spi3); })[0], n1 = deps.filter(function (k) { return sq[k].spi3 != null && sq[k].spi3 <= -1; }).length, n2 = deps.filter(function (k) { return sq[k].spi12 != null && sq[k].spi12 <= -1; }).length;
    $("kSeq").innerHTML = kpi("Más seco (SPI-3)", peor, "SPI-3 = " + sq[peor].spi3 + " · " + sq[peor].clase3, spiColor(sq[peor].spi3), "sun") + kpi("Con déficit a 3 meses", n1 + " de " + deps.length, "SPI-3 ≤ −1", "#ef8a3b", "sun") + kpi("Con déficit a 12 meses", n2 + " de " + deps.length, "sequía de largo plazo", "#c0392b", "water") + kpi("Último mes analizado", um, "Referencia " + D.sequia.referencia, "#1d6fb8", "list");
    $("selSpi").innerHTML = '<span class="chips" style="display:inline-flex;margin-left:6px">' + [1, 3, 6, 12].map(function (k) { return '<button class="chip' + (k === ESC ? " on" : "") + '" data-e="' + k + '">SPI-' + k + '</button>'; }).join("") + '</span>';
    $("selDep").innerHTML = deps.map(function (k) { return '<option>' + k + '</option>'; }).join(""); DEPSEL = peor; $("selDep").value = peor;
    $("legSpi").innerHTML = SPICLS.map(function (c) { return '<span><i style="background:' + c[1] + '"></i>' + c[0] + '</span>'; }).join("");
    var m = MAPS.seq = nuevoMapa("mapaSeq", false);
    m.on("load", function () { m.addSource("dep", {type: "geojson", data: depSpi(ESC)}); m.addLayer({id: "dep-fill", type: "fill", source: "dep", paint: {"fill-color": ["step", ["coalesce", ["get", "spi"], 0]].concat(SPICOL), "fill-opacity": .9}}); m.addLayer({id: "dep-line", type: "line", source: "dep", paint: {"line-color": "#4b5a70", "line-width": 1.4}});
      m.on("click", "dep-fill", function (e) { var p = e.features[0].properties; $("selDep").value = p.n; DEPSEL = p.n; trazaSpi(); new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop"><b>' + S.esc(p.n) + '</b>SPI-' + ESC + ': ' + p.spi + '<br>' + S.esc(p.cl) + '</div>').addTo(m); }); m.on("mouseenter", "dep-fill", function () { m.getCanvas().style.cursor = "pointer"; }); m.on("mouseleave", "dep-fill", function () { m.getCanvas().style.cursor = ""; }); });
    $("selSpi").onclick = function (e) { var b = e.target.closest("[data-e]"); if (!b) return; ESC = +b.dataset.e; [].forEach.call($("selSpi").querySelectorAll(".chip"), function (c) { c.classList.toggle("on", c === b); }); if (m.getSource("dep")) m.getSource("dep").setData(depSpi(ESC)); };
    $("selDep").onchange = function () { DEPSEL = this.value; trazaSpi(); };
    var mes = mesesAtras(um, 24), hd = []; deps.forEach(function (d, y) { (sq[d].serie_spi1 || []).forEach(function (v) { var x = mes.indexOf(v[0]); if (x >= 0) hd.push([x, y, v[1]]); }); });
    X.chart("chSpiHeat", {tooltip: {formatter: function (p) { return deps[p.value[1]] + " · " + mes[p.value[0]] + ": SPI-1 <b>" + p.value[2] + "</b>"; }}, grid: {left: 84, right: 14, top: 10, bottom: 70}, xAxis: {type: "category", data: mes.map(function (k) { return k.slice(2); }), axisLabel: {interval: 2}}, yAxis: {type: "category", data: deps, inverse: true},
      visualMap: {type: "piecewise", orient: "horizontal", left: "center", bottom: 0, pieces: [{max: -2, color: "#c0392b", label: "≤−2"}, {min: -2, max: -1.5, color: "#ef8a3b", label: "−2…−1,5"}, {min: -1.5, max: -1, color: "#f7c873", label: "−1,5…−1"}, {min: -1, max: 1, color: "#eef1f5", label: "normal"}, {min: 1, max: 1.5, color: "#8fc0e8", label: "1…1,5"}, {min: 1.5, max: 2, color: "#3b82c4", label: "1,5…2"}, {min: 2, color: "#1d4e9c", label: "≥2"}], textStyle: {color: X.css("--mut")}, itemWidth: 14, itemHeight: 10},
      series: [{type: "heatmap", data: hd, itemStyle: {borderColor: X.css("--card"), borderWidth: 1.5, borderRadius: 3}}]});
    X.chart("chPre", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, legend: {top: 0}, grid: {left: 44, right: 12, top: 40, bottom: 60}, xAxis: {type: "category", data: deps, axisLabel: {rotate: 30}}, yAxis: {type: "value", name: "mm"},
      series: [{name: "Lluvia del mes", type: "bar", data: deps.map(function (d) { return {value: sq[d].precip_mes_mm, itemStyle: {color: sq[d].pct_normal != null && sq[d].pct_normal < 70 ? "#ef8a3b" : "#2a7fd1", borderRadius: [4, 4, 0, 0]}}; })}, {name: "Normal 1991–2020", type: "scatter", symbol: "diamond", symbolSize: 13, itemStyle: {color: "#0b3b6e"}, data: deps.map(function (d) { return sq[d].normal_mes_mm; })}]});
    $("tSeq").innerHTML = '<table><tr><th>Departamento</th><th>SPI-1</th><th>SPI-3</th><th>SPI-6</th><th>SPI-12</th><th>Lluvia mes</th><th>% de lo normal</th><th>Estado (SPI-3)</th></tr>' + deps.map(function (d) { var v = sq[d], c = function (x) { return '<td><span class="badge" style="background:' + spiColor(x) + ';color:' + (x != null && Math.abs(x) >= 1 ? "#fff" : "#222") + '">' + (x == null ? "—" : x) + '</span></td>'; }; return '<tr><td><b>' + d + '</b></td>' + c(v.spi1) + c(v.spi3) + c(v.spi6) + c(v.spi12) + '<td>' + v.precip_mes_mm + ' mm</td><td>' + v.pct_normal + ' %</td><td>' + S.esc(v.clase3 || "") + '</td></tr>'; }).join("") + '</table>';
    $("notaSeq").textContent = D.sequia.nota || ""; trazaSpi();
  }
  var chSpi = null;
  function trazaSpi() {
    var v = D.sq[DEPSEL]; if (!v) return; $("depSel").textContent = DEPSEL; var ser = v.serie_spi3 || [], mes = ser.map(function (r) { return r[0]; }), s = ser.map(function (r) { return r[1]; });
    var opt = {tooltip: {trigger: "axis", formatter: function (p) { p = p[0]; return p.axisValue + "<br>SPI-3: <b>" + p.value + "</b>"; }}, grid: {left: 40, right: 56, top: 14, bottom: 30}, xAxis: {type: "category", data: mes.map(function (k) { return k.slice(2); }), boundaryGap: false, axisLabel: {interval: 3}}, yAxis: {type: "value", min: -3.5, max: 3.5},
      visualMap: {show: false, dimension: 1, pieces: [{lte: -2, color: "#c0392b"}, {gt: -2, lte: -1.5, color: "#ef8a3b"}, {gt: -1.5, lte: -1, color: "#d9a400"}, {gt: -1, lt: 1, color: "#5b6b82"}, {gte: 1, lt: 1.5, color: "#5fa8dd"}, {gte: 1.5, color: "#1d4e9c"}]},
      series: [{type: "line", smooth: true, symbolSize: 5, lineStyle: {width: 3}, areaStyle: {opacity: .12}, data: s, markLine: {symbol: "none", silent: true, label: {formatter: "{b}", color: X.css("--mut"), position: "end"}, lineStyle: {type: "dashed", opacity: .7}, data: [{yAxis: -1, name: "Moderada", lineStyle: {color: "#d9a400"}}, {yAxis: -1.5, name: "Severa", lineStyle: {color: "#ef8a3b"}}, {yAxis: -2, name: "Extrema", lineStyle: {color: "#c0392b"}}, {yAxis: 0, lineStyle: {color: "#8896ab", type: "solid"}, label: {show: false}}]}}]};
    if (chSpi) chSpi.dispose(); chSpi = X.chart("chSpi", opt);
  }

  /* ---------- RÍOS ---------- */
  function rios() {
    if (!D.cau.length) { $("rios").innerHTML = '<div class="card vacio" style="grid-column:1/-1">Aún no hay datos de caudales (se calculan una vez al día).</div>'; return; }
    $("rios").innerHTML = D.cau.map(function (c, i) { var col = ["#2a9d8f", "#f5b700", "#f26a1b", "#d7263d"][Math.min(3, c.nivel || 0)]; return '<div class="card"><h2>' + X.ic("water", col) + S.esc(c.rio) + ' · ' + S.esc(c.nombre) + '</h2><div class="cap">' + S.esc(c.departamento) + ' · <span class="badge" style="background:' + col + ';color:' + (c.nivel === 1 ? "#222" : "#fff") + '">' + S.esc(c.estado) + '</span> · máx. 10 d: <b>' + Math.round(c.caudal_max_10d) + '</b> m³/s</div><div class="ch s" id="rio' + i + '"></div></div>'; }).join("");
    D.cau.forEach(function (c, i) { var ix = c.fechas.indexOf(c.hoy);
      X.chart("rio" + i, {tooltip: {trigger: "axis"}, legend: {top: 0, itemWidth: 14, textStyle: {fontSize: 11}}, grid: {left: 46, right: 10, top: 34, bottom: 24}, xAxis: {type: "category", data: c.fechas.map(function (f) { return f.slice(5); }), boundaryGap: false, axisLabel: {interval: 6}}, yAxis: {type: "value", name: "m³/s", scale: true},
        series: [{name: "Caudal", type: "line", smooth: true, symbol: "none", lineStyle: {width: 3, color: "#1d6fb8"}, areaStyle: {color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: "rgba(29,111,184,.35)"}, {offset: 1, color: "rgba(29,111,184,0)"}])}, data: c.caudal_m3s, markLine: ix >= 0 ? {symbol: "none", silent: true, label: {formatter: "hoy", color: X.css("--mut")}, lineStyle: {color: "#8896ab", type: "dashed"}, data: [{xAxis: ix}]} : undefined},
          {name: "Normal (P50)", type: "line", symbol: "none", lineStyle: {type: "dashed", color: "#2a9d8f", width: 2}, data: c.p50}, {name: "Alto (P90)", type: "line", symbol: "none", lineStyle: {type: "dashed", color: "#d7263d", width: 2}, data: c.p90}]}); });
  }

  /* ---------- EVENTOS ---------- */
  var CATSEL = {};
  function eventos() {
    S.DEPS.forEach(function (d) { var o = document.createElement("option"); o.textContent = d; $("fDep").appendChild(o); });
    $("fCat").innerHTML = S.CAT.slice(0, 7).map(function (c) { CATSEL[c] = true; return '<button class="chip on" data-c="' + c + '"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + S.COLCAT[c] + ';margin-right:6px"></span>' + c + '</button>'; }).join("");
    $("fCat").onclick = function (e) { var b = e.target.closest("[data-c]"); if (!b) return; CATSEL[b.dataset.c] = !CATSEL[b.dataset.c]; b.classList.toggle("on"); pintaEv(); };
    $("fDep").addEventListener("change", function () { llenaMun("fDep", "fMun", "Todos"); });
    ["fPer", "fDep", "fMun", "fOrg", "fConf", "fNiv"].forEach(function (i) { $(i).onchange = pintaEv; }); $("fQ").oninput = pintaEv; pintaEv();
    $("bCsv").onclick = function () { S.descargar("eventos_sala_bolivia.csv", S.csv(FIL), "text/csv"); };
    $("bJson").onclick = function () { S.descargar("eventos_sala_bolivia.json", JSON.stringify(FIL, null, 1), "application/json"); };
    $("bXls").onclick = function () { X.descargarXlsx("eventos_sala_bolivia.xlsx", X.filasXls(FIL), "Eventos"); };
  }
  var FIL = [];
  function pintaEv() {
    var per = +$("fPer").value, dep = $("fDep").value, mun = $("fMun").value, org = $("fOrg").value, cf = $("fConf").value, nv = +$("fNiv").value, q = $("fQ").value.toLowerCase().trim(), now = Date.now();
    FIL = D.ev.filter(function (e) {
      if (per < 400 && e.ts < now - per * DIA) return false; if (dep && (e.departamentos || []).indexOf(dep) < 0) return false;
      if (mun && !(evMun(e) === mun + " (" + dep + ")" || ((e.lugar || "") + " " + e.titulo).toLowerCase().indexOf(mun.toLowerCase()) >= 0)) return false;
      if (org === "of" && !e.oficial) return false; if (org === "prensa" && e.origen !== "prensa") return false; if (org === "modelo" && ["modelo", "foco", "sequia", "caudal", "gdacs", "usgs"].indexOf(e.origen) < 0) return false;
      if (cf === "Alta" && !(e.confianza && e.confianza.nivel === "Alta")) return false; if (cf === "Media" && !(e.confianza && e.confianza.nivel !== "Baja")) return false;
      if (nv >= 0 && !(e.nivel != null && e.nivel >= nv)) return false; if (CATSEL[e.categoria] === false) return false;
      if (q && (e.titulo + " " + (e.lugar || "") + " " + (e.detalle || "")).toLowerCase().indexOf(q) < 0) return false; return true;
    }).sort(function (a, b) { return b.ts - a.ts; });
    $("fN").textContent = FIL.length + " eventos" + (FIL.length > 300 ? " (se muestran los 300 más recientes; la descarga incluye todos)" : "");
    $("tEv").innerHTML = '<tr><th>Fecha</th><th>Tipo</th><th>Evento</th><th>Lugar</th><th>Nivel</th><th>Confianza</th><th>Fuente</th></tr>' + FIL.slice(0, 300).map(function (e) { return '<tr><td style="white-space:nowrap">' + S.fecha(e.ts) + '</td><td>' + X.catChip(e.categoria) + '</td><td><a href="' + fichaUrl(e.id) + '"><b>' + S.esc(e.titulo) + '</b></a></td><td>' + S.esc(e.lugar || (e.departamentos || []).join(", ")) + '</td><td>' + S.badgeNivel(e) + '</td><td>' + (X.confBadge(e) || "") + '</td><td>' + X.badgeOrigen(e) + '</td></tr>'; }).join("");
  }

  /* ---------- TRÁNSITO ---------- */
  var CONFCOL = {Alta: "#2e9e5b", Media: "#f5b700", Baja: "#8896ab"}, TRF = [];
  function trLista() { return (D.transito && D.transito.hechos) || []; }
  function vict(h) { return (h.fallecidos || 0) + (h.heridos || 0); }
  function trCard(h) {
    var c = h.confianza || {}, cl = {Alta: "ba", Media: "bm", Baja: "bb"}[c.nivel] || "bb";
    var enl = (h.enlaces || []).map(function (e) { return '<li><a href="' + S.esc(S.urlOk(e.url)) + '" target="_blank" rel="noopener">' + S.esc(e.medio || "medio") + '</a> — ' + S.esc(e.titulo) + '</li>'; }).join("");
    return '<details style="border-bottom:1px solid var(--line);padding:9px 2px"><summary style="cursor:pointer;list-style:none"><div style="display:flex;gap:8px;justify-content:space-between;align-items:flex-start"><b style="font-size:13.5px">' + S.esc(h.titulo) + '</b><span class="badge ' + cl + '">Confianza ' + (c.nivel || "").toLowerCase() + '</span></div>' +
      '<div class="nota" style="margin-top:3px">' + S.fecha(h.ts) + ' · ' + S.esc(h.lugar || h.departamento || "sin ubicar") + ' · ' + S.esc(h.tipo || "") + ' · ' + h.n_medios + ' medio(s)' + (vict(h) ? ' · <b>' + h.fallecidos + ' fallecidos, ' + h.heridos + ' heridos</b>' : '') + '</div></summary>' +
      '<div class="nota" style="margin:8px 0 4px">' + S.esc(c.razon || "") + '</div><ul style="margin:4px 0 4px 18px;font-size:12.5px">' + enl + '</ul></details>';
  }
  function transito() {
    var T = trLista(), now = Date.now(), r = (D.transito && D.transito.resumen) || {};
    var t30 = T.filter(function (h) { return h.ts > now - 30 * DIA; });
    $("kTra").innerHTML = kpi("Hechos en 24 h", r.hechos_24h || 0, "prensa boliviana, preliminar", "#d7263d", "shield") + kpi("Hechos en 7 días", r.hechos_7d || 0, (r.alta_7d || 0) + " con confianza alta", "#f26a1b", "list") +
      kpi("Fallecidos (7 días)", r.fallecidos_7d || 0, "máximo reportado por hecho", "#8d6e63", "pulse") + kpi("Heridos (7 días)", r.heridos_7d || 0, "máximo reportado por hecho", "#1d6fb8", "pulse");
    $("listaTra").innerHTML = T.length ? T.slice(0, 40).map(trCard).join("") : '<p class="nota">Sin hechos de tránsito registrados todavía.</p>';
    var m = MAPS.tra = nuevoMapa("mapaTra", true);
    m.on("load", function () {
      m.addSource("dep", {type: "geojson", data: geoCopia(D.geoDep)}); m.addLayer({id: "dep-line", type: "line", source: "dep", paint: {"line-color": "#4b5a70", "line-width": 1.2}});
      var f = T.filter(function (h) { return h.lat != null; }).map(function (h) { return {type: "Feature", properties: {t: h.titulo, l: h.lugar, v: vict(h), c: h.confianza.nivel, n: h.n_medios, f: S.fecha(h.ts)}, geometry: {type: "Point", coordinates: [h.lon, h.lat]}}; });
      m.addSource("tra", {type: "geojson", data: {type: "FeatureCollection", features: f}});
      m.addLayer({id: "traHeat", type: "heatmap", source: "tra", maxzoom: 7, paint: {"heatmap-weight": ["interpolate", ["linear"], ["get", "v"], 0, .4, 10, 1], "heatmap-radius": 28, "heatmap-opacity": .55, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,255,255,0)", .3, "#fdd49e", .6, "#fc8d59", 1, "#b30000"]}});
      m.addLayer({id: "traPt", type: "circle", source: "tra", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "v"], 0, 6, 10, 12, 30, 20], "circle-color": ["match", ["get", "c"], "Alta", CONFCOL.Alta, "Media", CONFCOL.Media, CONFCOL.Baja], "circle-opacity": .9, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5}});
      popEv(m, "traPt", function (p) { return "<b>" + S.esc(p.t) + "</b>" + S.esc(p.l) + "<br>" + p.f + " · " + p.n + " medio(s) · confianza " + p.c.toLowerCase() + (p.v ? "<br>" + p.v + " víctimas reportadas" : ""); });
    });
    var dias = []; for (var i = 29; i >= 0; i--) dias.push(S.diaKey(now - i * DIA)), 0;
    var nd = {}, vd = {}; dias.forEach(function (d) { nd[d] = 0; vd[d] = 0; });
    t30.forEach(function (h) { var k = S.diaKey(h.ts); if (k in nd) { nd[k]++; vd[k] += vict(h); } });
    X.chart("chTraDia", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 40, right: 40, top: 40, bottom: 30}, xAxis: {type: "category", data: dias.map(function (d) { return d.slice(5); })}, yAxis: [{type: "value", minInterval: 1}, {type: "value", minInterval: 1}],
      series: [{name: "Hechos", type: "bar", data: dias.map(function (d) { return nd[d]; }), itemStyle: {color: "#d7263d", borderRadius: [4, 4, 0, 0]}}, {name: "Víctimas", type: "line", yAxisIndex: 1, smooth: true, data: dias.map(function (d) { return vd[d]; }), itemStyle: {color: "#1d6fb8"}}]});
    var dp = {}; S.DEPS.forEach(function (d) { dp[d] = [0, 0]; }); t30.forEach(function (h) { if (dp[h.departamento]) { dp[h.departamento][0] += h.fallecidos; dp[h.departamento][1] += h.heridos; } });
    var ds = S.DEPS.slice().sort(function (a, b) { return (dp[a][0] + dp[a][1]) - (dp[b][0] + dp[b][1]); });
    X.chart("chTraDep", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, legend: {top: 0}, grid: {left: 90, right: 20, top: 36, bottom: 20}, xAxis: {type: "value", minInterval: 1}, yAxis: {type: "category", data: ds},
      series: [{name: "Fallecidos", type: "bar", stack: "v", data: ds.map(function (d) { return dp[d][0]; }), itemStyle: {color: "#7a1f2b"}}, {name: "Heridos", type: "bar", stack: "v", data: ds.map(function (d) { return dp[d][1]; }), itemStyle: {color: "#f26a1b"}}]});
    function cuenta(k) { var o = {}; t30.forEach(function (h) { var v = h[k] || "No precisado"; o[v] = (o[v] || 0) + 1; }); return Object.keys(o).map(function (n) { return {name: n, value: o[n]}; }); }
    X.chart("chTraTipo", {tooltip: {trigger: "item"}, legend: {show: false}, series: [{type: "pie", roseType: "radius", radius: ["18%", "70%"], itemStyle: {borderRadius: 5, borderColor: "#fff", borderWidth: 2}, label: {formatter: "{b}\n{c}"}, data: cuenta("tipo")}]});
    X.chart("chTraVeh", {tooltip: {}, series: [{type: "treemap", roam: false, nodeClick: false, breadcrumb: {show: false}, label: {formatter: "{b}\n{c}"}, data: cuenta("vehiculo")}]});
    var cf = {Alta: 0, Media: 0, Baja: 0}; t30.forEach(function (h) { cf[h.confianza.nivel]++; });
    X.chart("chTraConf", {tooltip: {trigger: "item"}, legend: {show: false}, series: [{type: "pie", radius: ["45%", "72%"], label: {formatter: "{b}: {c}"}, data: ["Alta", "Media", "Baja"].map(function (k) { return {name: k, value: cf[k], itemStyle: {color: CONFCOL[k]}}; })}]});
    S.DEPS.forEach(function (d) { var o = document.createElement("option"); o.textContent = d; $("tDep").appendChild(o); });
    ["tPer", "tDep", "tConf"].forEach(function (i) { $(i).onchange = pintaTra; }); pintaTra();
    $("tCsv").onclick = function () { S.descargar("transito_sala_bolivia.csv", "﻿" + [["fecha", "titulo", "tipo", "vehiculo", "departamento", "lugar", "lat", "lon", "fallecidos", "heridos", "confianza", "medios", "notas"].join(",")].concat(TRF.map(function (h) { return [S.fecha(h.ts), h.titulo, h.tipo, h.vehiculo, h.departamento, h.lugar, h.lat == null ? "" : h.lat, h.lon == null ? "" : h.lon, h.fallecidos, h.heridos, h.confianza.nivel, h.medios.join("; "), h.n_notas].map(function (v) { v = String(v == null ? "" : v); return '"' + v.replace(/"/g, '""') + '"'; }).join(","); })).join("\n"), "text/csv"); };
    $("tJson").onclick = function () { S.descargar("transito_sala_bolivia.json", JSON.stringify(TRF, null, 1), "application/json"); };
    $("tXls").onclick = function () { X.descargarXlsx("transito_sala_bolivia.xlsx", TRF.map(function (h) { return {"Fecha (La Paz)": S.fecha(h.ts), Título: h.titulo, Tipo: h.tipo, Vehículo: h.vehiculo, Departamento: h.departamento, Lugar: h.lugar, Latitud: h.lat, Longitud: h.lon, Fallecidos: h.fallecidos, Heridos: h.heridos, Confianza: h.confianza.nivel, Medios: h.medios.join("; "), Notas: h.n_notas, Enlaces: h.enlaces.map(function (e) { return e.url; }).join(" | ")}; }), "Tránsito"); };
  }
  function pintaTra() {
    var per = +$("tPer").value, dep = $("tDep").value, cf = $("tConf").value, now = Date.now();
    TRF = trLista().filter(function (h) { return (per >= 400 || h.ts > now - per * DIA) && (!dep || h.departamento === dep) && (!cf || h.confianza.nivel === "Alta" || (cf === "Media" && h.confianza.nivel === "Media")); });
    $("tN").textContent = TRF.length + " hechos";
    $("tTra").innerHTML = '<tr><th>Fecha</th><th>Hecho</th><th>Lugar</th><th>Tipo</th><th>Vehículo</th><th>Fallec.</th><th>Heridos</th><th>Confianza</th><th>Medios</th></tr>' + TRF.map(function (h) { var cl = {Alta: "ba", Media: "bm", Baja: "bb"}[h.confianza.nivel]; return '<tr><td style="white-space:nowrap">' + S.fecha(h.ts) + '</td><td><b>' + S.esc(h.titulo) + '</b></td><td>' + S.esc(h.lugar || h.departamento) + '</td><td>' + S.esc(h.tipo) + '</td><td>' + S.esc(h.vehiculo) + '</td><td>' + h.fallecidos + '</td><td>' + h.heridos + '</td><td><span class="badge ' + cl + '">' + h.confianza.nivel + '</span></td><td title="' + S.esc(h.medios.join(", ")) + '">' + h.n_medios + '</td></tr>'; }).join("");
  }

  /* ---------- REPORTES PDF ---------- */
  var TIPOREP = {alerta: "Alerta inmediata", diario: "Reporte diario", semanal: "Reporte semanal", mensual: "Reporte mensual", solicitud: "Por solicitud", hecho: "Informe de un hecho", sismos: "Sismo", brote: "Brote / OPS-OMS", evento: "Evento", otro: "Otros"}, REPSEL = "";
  function limpiaTit(t) { return String(t || "").replace(/:[a-z_]+:/g, "").replace(/<!channel>/g, "").replace(/\s+/g, " ").trim(); }
  function reportes() {
    S.cargar("reportes/lista.json").then(function (L) {
      L.sort(function (a, b) { return (b.fecha || "").localeCompare(a.fecha || ""); });
      var tipos = {}; L.forEach(function (x) { tipos[x.tipo] = (tipos[x.tipo] || 0) + 1; });
      $("rChips").innerHTML = '<button class="chip on" data-r="">Todos (' + L.length + ')</button>' + Object.keys(tipos).map(function (k) { return '<button class="chip" data-r="' + k + '">' + (TIPOREP[k] || k) + ' (' + tipos[k] + ')</button>'; }).join("");
      var u = L.filter(function (x) { return x.tipo === "diario"; })[0] || L[0]; if (u) $("rUlt").href = "reportes/" + u.archivo;
      function pinta() {
        var F = L.filter(function (x) { return !REPSEL || x.tipo === REPSEL; });
        $("rN").textContent = F.length + " reportes (los más recientes primero)";
        $("tRep").innerHTML = '<tr><th>Fecha</th><th>Tipo</th><th>Título</th><th></th></tr>' + F.slice(0, 200).map(function (x) { return '<tr><td style="white-space:nowrap">' + S.esc((x.fecha || "").replace("T", " ")) + '</td><td>' + (TIPOREP[x.tipo] || x.tipo) + '</td><td>' + S.esc(limpiaTit(x.titulo)) + '</td><td><a class="btn s" href="reportes/' + S.esc(x.archivo) + '" target="_blank" rel="noopener">' + X.ic("dl") + 'PDF</a></td></tr>'; }).join("");
      }
      $("rChips").onclick = function (e) { var b = e.target.closest("[data-r]"); if (!b) return; REPSEL = b.dataset.r; [].forEach.call($("rChips").children, function (c) { c.classList.toggle("on", c === b); }); pinta(); };
      pinta();
    }).catch(function () { $("rN").textContent = "Aún no hay reportes generados."; });
  }

  /* ---------- DATOS ---------- */
  function datosTab() {
    var A = [["Todos los eventos (base unificada)", "Sismos, avisos SENAMHI, focos, sequía, ríos, brotes y prensa, con nivel de confianza.", [["CSV", "datos/eventos_unificados.csv"], ["JSON", "eventos_unificados.json"]]],
      ["Hechos de tránsito y accidentes", "Un registro por accidente, con medios, cifras y confianza.", [["CSV", "datos/transito_hechos.csv"], ["JSON", "transito.json"]]],
      ["Libro Excel completo", "Varias hojas: eventos, hechos, sismos, focos y metadatos.", [["Excel", "datos/datos_bolivia.xlsx"]]],
      ["Mapa de hechos (GIS)", "Capa para QGIS / ArcGIS / Google Earth.", [["GeoJSON", "datos/hechos.geojson"]]],
      ["Hechos de prensa agrupados", "Notas del mismo hecho unidas (cifras = máximo reportado).", [["CSV", "datos/hechos_agrupados.csv"], ["JSON", "datos/hechos_agrupados.json"]]],
      ["Histórico de eventos", "Registro acumulado para análisis de series de tiempo.", [["CSV", "datos/historico_eventos.csv"]]],
      ["Sismos (San Calixto)", "Historial de sismos registrados en Bolivia.", [["CSV", "datos/sismos_historico.csv"]]],
      ["Focos de calor por día", "Detecciones satelitales NASA FIRMS por día.", [["CSV", "datos/focos_detectados_diario.csv"]]],
      ["Diccionario de datos y metadatos", "Qué significa cada columna, fuentes y advertencias.", [["Diccionario CSV", "datos/diccionario_datos.csv"], ["Metadatos", "datos/metadatos.json"]]]];
    $("gDat").innerHTML = A.map(function (a) { return '<div class="card"><h2>' + S.esc(a[0]) + '</h2><div class="cap">' + S.esc(a[1]) + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + a[2].map(function (f) { return '<a class="btn" href="' + f[1] + '" download>' + X.ic("dl") + f[0] + '</a>'; }).join("") + '</div></div>'; }).join("");
  }
  function pie() {
    var t = D.eventos_unificados && D.eventos_unificados.generado; $("foot").innerHTML = '<span><i class="dot"></i> Base de datos conectada' + (t ? " · actualizada " + X.ago(t) : "") + '</span><span>' + (D.ev || []).length + ' eventos · ' + trLista().length + ' hechos de tránsito</span><span><a href="informes.html">Generar reporte</a> · <a href="#rep" onclick="document.querySelector(\'[data-t=rep]\').click();return false">Ver PDF</a> · <a href="#dat" onclick="document.querySelector(\'[data-t=dat]\').click();return false">Descargar datos</a></span>';
  }

  function graficosExtra(ev, now) {
    var util = ev.filter(function (e) { return e.origen !== "modelo" && e.origen !== "foco"; }), k;
    var cal = {}; util.forEach(function (e) { if (e.ts > now - 120 * DIA) { k = S.diaKey(e.ts); cal[k] = (cal[k] || 0) + 1; } });
    var cd = Object.keys(cal).map(function (x) { return [x, cal[x]]; }), mx = Math.max.apply(null, [1].concat(cd.map(function (x) { return x[1]; })));
    X.chart("chCal", {tooltip: {formatter: function (p) { return p.value[0] + ": <b>" + p.value[1] + "</b> eventos"; }}, visualMap: {min: 0, max: mx, show: false, inRange: {color: [X.css("--soft"), "#1d6fb8", "#d7263d"]}}, calendar: {range: [S.diaKey(now - 120 * DIA), S.diaKey(now)], cellSize: [15, 15], top: 28, left: 30, right: 10, itemStyle: {borderWidth: 2, borderColor: X.css("--card"), color: X.css("--soft")}, splitLine: {show: false}, dayLabel: {color: X.css("--mut"), nameMap: "ES"}, monthLabel: {color: X.css("--mut"), nameMap: "ES"}, yearLabel: {show: false}}, series: [{type: "heatmap", coordinateSystem: "calendar", data: cd}]});
    var mm = {}; util.filter(function (e) { return e.origen === "prensa" && e.ts > now - 30 * DIA; }).forEach(function (e) { (e.medios && e.medios.length ? e.medios : [e.fuente]).forEach(function (m) { if (m) { m = m.replace(/ - .*/, ""); mm[m] = (mm[m] || 0) + 1; } }); });
    var mk = Object.keys(mm).sort(function (a, b) { return mm[a] - mm[b]; }).slice(-10);
    X.chart("chMed", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, grid: {left: 120, right: 24, top: 8, bottom: 18}, xAxis: {type: "value", minInterval: 1}, yAxis: {type: "category", data: mk, axisLabel: {width: 110, overflow: "truncate"}}, series: [{type: "bar", data: mk.map(function (m) { return mm[m]; }), itemStyle: {color: "#0aa3a3", borderRadius: [0, 5, 5, 0]}, label: {show: true, position: "right"}}]});
    var mu = {}; util.forEach(function (e) { if (e.ts > now - 30 * DIA && e.lat != null) { var q = munDe(e.lat, e.lon); if (q) { var n = q.n + " (" + q.d.slice(0, 3) + ")"; mu[n] = (mu[n] || 0) + 1; } } });
    var uk = Object.keys(mu).sort(function (a, b) { return mu[a] - mu[b]; }).slice(-10);
    X.chart("chMun", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, grid: {left: 130, right: 24, top: 8, bottom: 18}, xAxis: {type: "value", minInterval: 1}, yAxis: {type: "category", data: uk.length ? uk : ["Sin eventos ubicados"], axisLabel: {width: 120, overflow: "truncate"}}, series: [{type: "bar", data: uk.map(function (m) { return mu[m]; }), itemStyle: {color: "#ef6c00", borderRadius: [0, 5, 5, 0]}, label: {show: true, position: "right"}}]});
    var hij = {}; util.forEach(function (e) { if (e.ts > now - 30 * DIA) { var o = S.ORIGEN[e.origen] || e.origen; hij[e.categoria] = hij[e.categoria] || {}; hij[e.categoria][o] = (hij[e.categoria][o] || 0) + 1; } });
    X.chart("chSun", {tooltip: {trigger: "item"}, series: [{type: "sunburst", radius: ["14%", "92%"], sort: null, itemStyle: {borderColor: X.css("--card"), borderWidth: 2, borderRadius: 4}, label: {rotate: "radial", fontSize: 10, minAngle: 8},
      data: Object.keys(hij).map(function (c) { return {name: c, itemStyle: {color: S.COLCAT[c]}, children: Object.keys(hij[c]).map(function (o) { return {name: o.replace(/ \(.*\)/, ""), value: hij[c][o]}; })}; })}]});
  }

  /* ---------- MUNICIPIOS (punto en polígono) ---------- */
  var MUNIDX = null;
  function munIdx() {
    if (MUNIDX) return MUNIDX;
    MUNIDX = ((D.geoMun && D.geoMun.features) || []).map(function (f) {
      var g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates, b = [180, 90, -180, -90];
      polys.forEach(function (p) { p[0].forEach(function (c) { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }); });
      return {n: f.properties.n, d: f.properties.d, b: b, p: polys};
    });
    return MUNIDX;
  }
  function enAnillo(x, y, r) { var d = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) d = !d; } return d; }
  function munDe(lat, lon) {
    var I = munIdx();
    for (var k = 0; k < I.length; k++) {
      var m = I[k]; if (lon < m.b[0] || lon > m.b[2] || lat < m.b[1] || lat > m.b[3]) continue;
      for (var q = 0; q < m.p.length; q++) { var p = m.p[q]; if (enAnillo(lon, lat, p[0]) && !p.slice(1).some(function (h) { return enAnillo(lon, lat, h); })) return m; }
    }
    return null;
  }
  var EMC = {};
  function evMun(e) { if (EMC[e.id] === undefined) { var m = e.lat != null ? munDe(e.lat, e.lon) : null; EMC[e.id] = m ? m.n + " (" + m.d + ")" : ""; } return EMC[e.id]; }
  function munDeDep(dep) { return munIdx().filter(function (m) { return m.d === dep; }).map(function (m) { return m.n; }).sort(function (a, b) { return a.localeCompare(b, "es"); }); }
  function llenaMun(selDep, selMun, todos) {
    var dep = $(selDep).value, s = $(selMun); s.innerHTML = '<option value="">' + (todos || "Todos los municipios") + '</option>';
    if (!dep) { s.disabled = true; return; }
    munDeDep(dep).forEach(function (n) { var o = document.createElement("option"); o.textContent = n; s.appendChild(o); }); s.disabled = false;
  }
  function boxTerr(dep, mun) {
    var b = [180, 90, -180, -90];
    munIdx().forEach(function (m) { if (m.d === dep && (!mun || m.n === mun)) { b[0] = Math.min(b[0], m.b[0]); b[1] = Math.min(b[1], m.b[1]); b[2] = Math.max(b[2], m.b[2]); b[3] = Math.max(b[3], m.b[3]); } });
    return b[0] > b[2] ? null : b;
  }
  function irTerritorio(dep, mun) {
    var m = MAPS.gen; if (!m) return;
    if (m.getLayer("mun-sel")) { var f = dep ? (mun ? ["all", ["==", ["get", "d"], dep], ["==", ["get", "n"], mun]] : ["==", ["get", "d"], dep]) : ["==", ["get", "n"], "__ninguno__"]; m.setFilter("mun-sel", f); m.setFilter("mun-sel-l", f); }
    if (!dep) { m.fitBounds([[-69.9, -23.1], [-57.2, -9.4]], {padding: 10}); $("munPanel").style.display = "none"; return; }
    var b = boxTerr(dep, mun); if (b) m.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: 40, maxZoom: mun ? 10 : 7.5});
    panelTerr(dep, mun);
  }
  function panelTerr(dep, mun) {
    var now = Date.now(), nom = mun ? mun + " (" + dep + ")" : "Departamento de " + dep, clave = mun ? nom : null;
    var d3 = D.dias.slice(-3), f3 = 0, f10 = 0; D.P.forEach(function (p) { if (p[4] === dep && (!mun || p[5] === mun)) { f10++; if (d3.indexOf(p[3]) >= 0) f3++; } });
    var av = D.avisos.filter(function (a) { return mun ? (a.municipios || []).indexOf(clave) >= 0 : (a.departamentos || []).indexOf(dep) >= 0; });
    var evs = D.ev.filter(function (e) {
      if (e.origen === "modelo" || e.origen === "foco" || e.ts < now - 30 * DIA) return false;
      if (mun) return evMun(e) === clave || ((e.lugar || "") + " " + e.titulo).toLowerCase().indexOf(mun.toLowerCase()) >= 0;
      return (e.departamentos || []).indexOf(dep) >= 0;
    }).sort(function (a, b) { return b.ts - a.ts; });
    var sq = D.sq[dep], spi = sq && sq.spi3 != null ? sq.spi3 : null;
    var h = '<div class="card" style="border-top:4px solid var(--brand2)"><h2>' + X.ic("map") + S.esc(nom) + '</h2><div class="grid g4" style="margin:10px 0">' +
      '<div class="mini"><b>' + f3 + '</b><span>focos de calor (3 días)</span></div><div class="mini"><b>' + f10 + '</b><span>focos (' + D.dias.length + ' días)</span></div>' +
      '<div class="mini"><b>' + av.length + '</b><span>avisos SENAMHI vigentes</span></div><div class="mini"><b>' + (mun ? "—" : (spi == null ? "—" : spi.toFixed(2))) + '</b><span>' + (mun ? "sequía: ver departamento" : "sequía SPI-3") + '</span></div></div>';
    h += '<div class="cap"><b>' + evs.length + ' evento(s)</b> registrados en 30 días' + (mun ? " (ubicados por coordenadas o por el texto de la nota)" : "") + '</div>';
    h += evs.slice(0, 12).map(function (e) { return '<a class="alert" href="' + fichaUrl(e.id) + '" style="--c:' + (S.COLCAT[e.categoria] || "#999") + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(e.titulo) + '</div><div class="m">' + S.fecha(e.ts) + ' · ' + S.esc(e.categoria) + ' · ' + S.esc(S.ORIGEN[e.origen] || e.origen) + '</div></div>' + X.confBadge(e) + '</a>'; }).join("") || '<p class="nota">Sin eventos registrados en este territorio en los últimos 30 días.</p>';
    $("munPanel").innerHTML = h + '</div>'; $("munPanel").style.display = "";
  }
  function controlesTerr() {
    S.DEPS.forEach(function (d) { var o = document.createElement("option"); o.textContent = d; $("mDep").appendChild(o); });
    $("mDep").onchange = function () { llenaMun("mDep", "mMun"); irTerritorio(this.value, ""); };
    $("mMun").onchange = function () { irTerritorio($("mDep").value, this.value); };
  }
  function capasMun(m) {
    m.addLayer({id: "mun-hit", type: "fill", source: "mun", paint: {"fill-color": "#000", "fill-opacity": 0.001}});
    m.addLayer({id: "mun-line", type: "line", source: "mun", minzoom: 4.8, paint: {"line-color": "#6c7d96", "line-width": 0.6, "line-opacity": 0.6}});
    m.addLayer({id: "mun-sel", type: "fill", source: "mun", filter: ["==", ["get", "n"], "__ninguno__"], paint: {"fill-color": "#1d6fb8", "fill-opacity": 0.16}});
    m.addLayer({id: "mun-sel-l", type: "line", source: "mun", filter: ["==", ["get", "n"], "__ninguno__"], paint: {"line-color": "#0b3b6e", "line-width": 2.4}});
    var pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
    m.on("mousemove", "mun-hit", function (e) { var p = e.features[0].properties; m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + S.esc(p.n) + '</b>' + S.esc(p.d) + ' · clic para ver detalle</div>').addTo(m); });
    m.on("mouseleave", "mun-hit", function () { m.getCanvas().style.cursor = ""; pop.remove(); });
    m.on("click", "mun-hit", function (e) {
      var capas = ["comp", "sis", "rio", "evs", "focoPt"].filter(function (c) { return m.getLayer(c); });
      if (capas.length && m.queryRenderedFeatures(e.point, {layers: capas}).length) return;
      var p = e.features[0].properties; $("mDep").value = p.d; llenaMun("mDep", "mMun"); $("mMun").value = p.n; irTerritorio(p.d, p.n);
    });
  }

  /* ---------- TIPOS DE EVENTO (Resumen) ---------- */
  var TIPDEF = {
    "geológica": {n: "Geológica", ej: "Sismos, deslizamientos, actividad volcánica", fu: "San Calixto · USGS · prensa", ic: "mount"},
    "meteorológica": {n: "Meteorológica", ej: "Tormentas, granizo, heladas, vientos, olas de calor o frío", fu: "SENAMHI · modelo Open-Meteo · prensa", ic: "sun"},
    "hidrológica": {n: "Hidrológica", ej: "Inundaciones, desbordes, crecidas, riadas", fu: "SENAMHI · GloFAS · prensa", ic: "water"},
    "climatológica": {n: "Climatológica", ej: "Sequía, incendios forestales, El Niño / La Niña", fu: "NASA FIRMS · SPI · prensa", ic: "fire"},
    "biológica": {n: "Biológica (salud)", ej: "Brotes, epidemias, zoonosis, intoxicaciones", fu: "Min. Salud · OPS/OMS · prensa", ic: "virus"},
    "tecnológica": {n: "Tecnológica", ej: "Derrames, explosiones, incendios de edificios, colapsos", fu: "Prensa", ic: "bolt"},
    "antropogénica": {n: "Antropogénica", ej: "Accidentes de tránsito, conflictos, bloqueos", fu: "Prensa · GDELT", ic: "car"}
  };
  function tipos() {
    var now = Date.now(), tr7 = ((D.transito && D.transito.resumen) || {}).hechos_7d || 0;
    $("tipos").innerHTML = S.CAT.slice(0, 7).map(function (c) {
      var df = TIPDEF[c], col = S.COLCAT[c], L = D.ev.filter(function (e) { return e.categoria === c && e.origen !== "modelo" && e.ts > now - 30 * DIA; });
      var n24 = L.filter(function (e) { return e.ts > now - DIA; }).length, mx = L.reduce(function (a, e) { return Math.max(a, e.nivel == null ? -1 : e.nivel); }, -1);
      var of = L.filter(function (e) { return e.oficial || ["senamhi", "sismo", "epidemiologia"].indexOf(e.origen) >= 0; }).length;
      var extra = c === "antropogénica" ? tr7 + ' hechos de tránsito en 7 días' : of + ' de fuente oficial · ' + (L.length - of) + ' prensa/satélite';
      return '<button class="tipo" data-c="' + c + '" style="--c:' + col + '" data-tip="Abrir el módulo de amenazas ' + c + 's: mapa, gráficos e informes"><div class="tipo-top"><span class="tipo-ic">' + X.ic(df.ic) + '</span><span class="tipo-n">' + L.length + '</span></div>' +
        '<div class="tipo-t">' + df.n + '</div><div class="tipo-ej">' + df.ej + '</div><div class="tipo-m"><span class="pill">' + n24 + ' en 24 h</span>' + (mx >= 0 ? '<span class="pill" style="background:' + COLNIV[Math.min(3, Math.floor(mx))] + ';color:' + (mx === 1 ? '#222' : '#fff') + '">nivel máx. ' + S.NIVTXT[Math.min(3, Math.floor(mx))].toLowerCase() + '</span>' : '') + '</div>' +
        '<div class="tipo-f">' + (L.length ? extra : 'Sin eventos en 30 días') + '<br><span>Fuentes: ' + df.fu + '</span></div></button>';
    }).join("") + (function () {
      var L = D.ev.filter(function (e) { return e.origen !== "modelo" && e.ts > now - 30 * DIA; }), ok = L.filter(function (e) { return e.confianza && e.confianza.nivel !== "Baja"; }).length;
      return '<button class="tipo" data-c="__todos__" style="--c:#0b3b6e" data-tip="Abrir la tabla con todos los eventos"><div class="tipo-top"><span class="tipo-ic">' + X.ic("list") + '</span><span class="tipo-n">' + L.length + '</span></div><div class="tipo-t">Todos los eventos</div>' +
        '<div class="tipo-ej">Base unificada de todas las fuentes, con triangulación</div><div class="tipo-m"><span class="pill">' + ok + ' con confianza media o alta</span></div><div class="tipo-f">' + (D.transito ? trLista().length + ' hechos de tránsito unidos por medios' : '') + '<br><span>Tabla descargable en CSV, Excel y JSON</span></div></button>';
    })();
    $("tipos").onclick = function (e) { var b = e.target.closest(".tipo"); if (!b) return; if (b.dataset.c !== "__todos__") { location.href = "modulo.html?t=" + encodeURIComponent(b.dataset.c); return; } irEventos(b.dataset.c); };
  }
  function irEventos(c) {
    mostrar("ev"); S.CAT.slice(0, 7).forEach(function (k) { CATSEL[k] = c === "__todos__" || k === c; });
    [].forEach.call(document.querySelectorAll("#fCat .chip"), function (b) { b.classList.toggle("on", c === "__todos__" || b.dataset.c === c); });
    $("fPer").value = "30"; pintaEv(); window.scrollTo(0, 0);
  }

  /* ---------- SALUD (eventos biológicos) ---------- */
  function salud() {
    var now = Date.now(), O = D.epidemio_oficial || {}, intl = O.internacional || [], bol = (O.boletines || []).slice().sort(function (a, b) { return b.semana - a.semana; });
    var B = D.ev.filter(function (e) { return e.categoria === "biológica" && !e.internacional && (e.origen === "prensa" || (e.origen === "epidemiologia" && /Bolivia/.test(e.titulo))); }).sort(function (a, b) { return b.ts - a.ts; });
    var b30 = B.filter(function (e) { return e.origen === "prensa" && e.ts > now - 30 * DIA; }), i30 = intl.filter(function (x) { return Date.parse(x.fecha) > now - 30 * DIA; });
    $("kSal").innerHTML = kpi("Eventos de salud en Bolivia", b30.length, "prensa, últimos 30 días", "#8e24aa", "virus") + kpi("Alertas OPS/OMS", i30.length, "últimos 30 días", "#1d6fb8", "info") +
      kpi("Último boletín MSyD", bol[0] ? "SE " + bol[0].semana : "—", bol[0] ? S.esc(bol[0].periodo) : "sin boletín", "#0aa3a3", "doc") + kpi("Con confianza media o alta", b30.filter(function (e) { return e.confianza && e.confianza.nivel !== "Baja"; }).length, "varios medios coinciden", "#2e9e5b", "shield");
    $("listaSal").innerHTML = B.slice(0, 40).map(function (e) { return '<a class="alert" href="' + fichaUrl(e.id) + '" style="--c:#8e24aa;color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(e.titulo) + '</div><div class="m">' + S.fecha(e.ts) + ' · ' + S.esc(e.lugar || (e.departamentos || []).join(", ") || "Bolivia") + ' · ' + S.esc(S.ORIGEN[e.origen] || e.origen) + '</div></div>' + X.confBadge(e) + '</a>'; }).join("") || '<p class="vacio">Sin eventos de salud registrados.</p>';
    $("listaOms").innerHTML = intl.slice(0, 24).map(function (x) { return '<div style="border-bottom:1px solid var(--line);padding:8px 2px"><a href="' + S.esc(S.urlOk(x.url)) + '" target="_blank" rel="noopener"><b>' + S.esc(x.titulo) + '</b></a><div class="nota">' + S.esc(x.fuente) + ' · ' + S.esc(x.fecha) + '</div></div>'; }).join("") || '<p class="vacio">Sin alertas.</p>';
    var ENF = [["Dengue", /dengue/i], ["Chikungunya", /chikungunya/i], ["Ébola", /ebola/i], ["Sarampión", /sarampi|measles/i], ["Influenza / gripe", /influenza|gripe|h5n1|ah5/i], ["Coxsackie / mano-pie-boca", /coxsackie/i], ["Rabia", /rabia/i], ["Fiebre amarilla", /fiebre amarilla|yellow fever/i], ["Tosferina", /tosferina|coqueluche|pertussis/i],
      ["Difteria", /difteria/i], ["Mpox", /mpox/i], ["Malaria", /malaria|paludismo/i], ["Miasis", /miasis/i], ["Intoxicación", /intoxicaci/i], ["COVID / respiratorias", /covid|respiratori|coronavirus/i], ["Fiebre aftosa / animal", /aftosa|aviar|brucel|zoono/i]];
    var cnt = {}, txt = B.filter(function (e) { return e.ts > now - 90 * DIA; }).map(function (e) { return e.titulo; }).concat(intl.map(function (x) { return x.titulo; }));
    txt.forEach(function (t) { ENF.forEach(function (p) { if (p[1].test(t)) cnt[p[0]] = (cnt[p[0]] || 0) + 1; }); });
    var ks = Object.keys(cnt).sort(function (a, b) { return cnt[a] - cnt[b]; });
    X.chart("chSalEnf", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, grid: {left: 150, right: 24, top: 10, bottom: 20}, xAxis: {type: "value", minInterval: 1}, yAxis: {type: "category", data: ks.length ? ks : ["Sin menciones"]},
      series: [{type: "bar", data: ks.map(function (k) { return {value: cnt[k], itemStyle: {color: "#8e24aa", borderRadius: [0, 5, 5, 0]}}; }), label: {show: true, position: "right"}}]});
    $("boletinSal").innerHTML = bol[0] ? '<div class="nota" style="margin-bottom:6px">Semana epidemiológica ' + bol[0].semana + ' · ' + S.esc(bol[0].periodo) + ' · <a href="' + S.esc(S.urlOk(bol[0].url)) + '" target="_blank" rel="noopener">abrir boletín</a></div><ul style="margin:0 0 0 18px;font-size:13px">' + (bol[0].frases || []).slice(0, 8).map(function (f) { return '<li style="margin-bottom:5px">' + S.esc(f) + '</li>'; }).join("") + '</ul>' : '<p class="vacio">Sin boletín leído todavía.</p>';
  }

  /* ---------- ayudas: los recuadros explicativos quedan plegados; botones con globo de ayuda ---------- */
  var TIPS = {"#bCsv": "Descargar los eventos filtrados en CSV (Excel)", "#bXls": "Descargar los eventos filtrados como libro de Excel", "#bJson": "Descargar los eventos filtrados en JSON", "#tCsv": "Descargar los hechos de tránsito filtrados en CSV", "#tXls": "Descargar los hechos de tránsito en Excel", "#tJson": "Descargar los hechos de tránsito en JSON",
    "#rUlt": "Abrir el último reporte diario en PDF", "#mDep": "Elegir un departamento: el mapa se acerca y se resume lo que ocurre allí", "#mMun": "Elegir un municipio para ver sus eventos, focos de calor y avisos", "#fMun": "Filtrar por municipio (según coordenadas o texto de la nota)", "#fCat": "Active o desactive tipos de evento",
    "#lHeat": "Zonas con más focos de calor detectados por satélite", "#lComp": "Grupos de focos vecinos que forman un incendio", "#rgDias": "Cuántos días de focos de calor mostrar", "#fConf": "Confianza = cuántas fuentes independientes coinciden", "#fNiv": "Nivel preliminar de gravedad (no es una alerta oficial)"};
  function ayudas() {
    Object.keys(TIPS).forEach(function (q) { [].forEach.call(document.querySelectorAll(q), function (el) { el.setAttribute("data-tip", TIPS[q]); }); });
    [].forEach.call(document.querySelectorAll("a.btn[href='informes.html']"), function (el) { el.setAttribute("data-tip", "Crear un informe PDF de un hecho concreto"); });
    [].forEach.call(document.querySelectorAll(".callout"), function (c) {
      var d = document.createElement("details"); d.className = "ayuda"; d.innerHTML = "<summary>" + X.ic("info") + "Qué muestra esta pestaña</summary><div class='ayuda-c'>" + c.querySelector("div").innerHTML + "</div>"; c.replaceWith(d);
    });
    [].forEach.call(document.querySelectorAll(".foot a"), function (a) { a.setAttribute("data-tip", a.textContent.indexOf("Descargar") >= 0 ? "Ir a la pestaña Datos" : a.textContent.indexOf("PDF") >= 0 ? "Ir a Reportes PDF" : "Crear un informe específico"); });
  }

  /* ---------- pestañas ---------- */
  function mostrar(t) {
    TABS.forEach(function (x) { $("t-" + x[0]).style.display = x[0] === t ? "" : "none"; });
    [].forEach.call(document.querySelectorAll(".tab"), function (b) { b.classList.toggle("on", b.dataset.t === t); });
    if (D && !INIT[t]) { INIT[t] = 1; ({res: resumen, map: mapaGeneral, sal: salud, inc: incendios, seq: sequia, rio: rios, ev: eventos, tra: transito, rep: reportes, dat: datosTab}[t])(); }
    setTimeout(function () { X.resizeAll(); for (var k in MAPS) try { MAPS[k].resize(); } catch (e) {} }, 40);
    history.replaceState(null, "", "#" + t);
  }
  $("tabs").onclick = function (e) { var b = e.target.closest(".tab"); if (b) { mostrar(b.dataset.t); window.scrollTo(0, 0); } };
  window.addEventListener("hashchange", function () { var h = location.hash.slice(1); if (TABS.some(function (t) { return t[0] === h; })) mostrar(h); });
  $("btnTour").onclick = guia;
  function guia() {
    X.tour([
      {t: "Bienvenido a la Sala de Situación", x: "En 1 minuto verá cómo leer esta página. Todo se actualiza solo cada 30 minutos con datos oficiales, satélites y prensa.", sel: ".hdr h1", antes: function () { mostrar("res"); }},
      {t: "Estas son las secciones", x: "<b>Resumen</b> (lo importante de hoy), <b>Mapa</b>, <b>Incendios</b>, <b>Sequías</b>, <b>Ríos</b> y <b>Eventos</b> (tabla descargable).", sel: "#tabs"},
      {t: "La situación en una frase", x: "Aquí se resume qué está pasando hoy. Debajo, los indicadores clave.", sel: "#hero"},
      {t: "Alertas prioritarias", x: "Toque cualquiera para abrir su <b>informe específico</b> con mapa, tablas, gráficos y PDF. La etiqueta <b>Confianza</b> indica cuántas fuentes independientes lo respaldan.", sel: "#cAlertas"},
      {t: "Mapa de calor de focos", x: "Capas a la izquierda, mapa a la derecha. Active avisos del SENAMHI o sequía por territorio y mueva los días de los focos.", sel: "#layers", antes: function () { mostrar("map"); }},
      {t: "Incendios", x: "Mapa de calor, complejos de incendio y gráficos variados (por día, por departamento, por municipio).", sel: "#kInc", antes: function () { mostrar("inc"); }},
      {t: "Sequías", x: "Se mide con el SPI (método OMM). Elija la escala (1, 3, 6 o 12 meses) y toque un departamento para ver su historia.", sel: "#selSpi", antes: function () { mostrar("seq"); }},
      {t: "Tránsito y accidentes", x: "Accidentes detectados en la prensa. Las notas del mismo hecho se unen y la <b>confianza</b> sube con el número de medios que lo reportan.", sel: "#kTra", antes: function () { mostrar("tra"); }},
      {t: "Reportes PDF y datos", x: "En <b>Reportes PDF</b> están las alertas, reportes diarios y semanales. En <b>Datos</b> descarga todo en CSV, Excel, JSON y GeoJSON.", sel: "#tabs"},
      {t: "Base de eventos y informes", x: "Filtre y descargue todo en CSV, Excel o JSON. Para un informe de un hecho puntual (accidente, brote, sismo de hoy…) use <b>Informes</b> arriba.", sel: "#fCat", antes: function () { mostrar("ev"); }}
    ]);
  }
  X.datos().then(function (d) {
    D = d; derivar(); pie(); var h = (location.hash || "#res").slice(1); mostrar(TABS.some(function (t) { return t[0] === h; }) ? h : "res");
    ayudas();
  }).catch(function (e) { $("heroT").textContent = "No se pudieron cargar los datos: " + e.message; });
})();

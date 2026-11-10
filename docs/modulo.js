/* Módulo por tipo de evento — indicadores, gráficos, mapa e informes propios de cada amenaza */
(function () {
  var S = SALA, X = S2, DIA = 864e5, D = {}, PER = (function () { var v = parseInt(new URLSearchParams(location.search).get("p"), 10); return v === 0 ? 36500 : (v > 0 ? v : 1); })(), ND = Math.max(14, Math.min(PER, 90)),
      PL = PER >= 36500 ? "todo el historial" : PER === 1 ? "24 horas" : PER === 365 ? "1 año" : PER + " días", PLU = PER >= 36500 ? "Todo el historial" : PER === 1 ? "Últimas 24 horas" : PER === 365 ? "Último año" : "Últimos " + PER + " días",
      act = function (e) { return Math.max(e.ts || 0, e.ts_ult || 0, e.ultima_nota || 0); }, T = (new URLSearchParams(location.search).get("t") || "geológica"), HOY = S.diaKey(Date.now());
  function $(i) { return document.getElementById(i); }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
  var COLN = ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"], NIVT = ["Verde", "Amarilla", "Naranja", "Roja"];
  function nivN(t) { t = (t || "").toUpperCase(); return t === "ROJO" || t === "ROJA" ? 3 : t === "NARANJA" ? 2 : t.indexOf("AMARIL") === 0 ? 1 : t === "VERDE" ? 0 : -1; }
  var DEF = {
    "geológica": {n: "Amenazas geológicas", def: "Sismos, deslizamientos y actividad volcánica. En Bolivia la fuente oficial abierta es el Observatorio San Calixto; el sistema complementa con USGS y GDACS.", fu: ["Observatorio San Calixto", "EMSC", "USGS", "GDACS", "Prensa"]},
    "meteorológica": {n: "Amenazas meteorológicas", def: "Tormentas, granizo, heladas, vientos fuertes y temperaturas extremas. Los avisos oficiales los emite el SENAMHI; el modelo Open-Meteo solo orienta.", fu: ["SENAMHI (avisos oficiales)", "Open-Meteo (modelo)", "Prensa"]},
    "hidrológica": {n: "Amenazas hidrológicas", def: "Crecidas, desbordes e inundaciones. Avisos hidrológicos del SENAMHI y caudales previstos por el modelo GloFAS (Copernicus) en 9 puntos de grandes cuencas.", fu: ["SENAMHI (avisos hidrológicos)", "GloFAS / Copernicus (modelo)", "Prensa"]},
    "climatológica": {n: "Amenazas climatológicas", def: "Sequía, incendios forestales y variabilidad climática. Focos de calor por satélite (NASA FIRMS) y sequía con el índice SPI (método OMM).", fu: ["NASA FIRMS", "INPE (GOES, 10 min)", "SPI / ERA5", "SENAMHI (propensión)", "NASA EONET", "Prensa"]},
    "biológica": {n: "Amenazas biológicas (salud)", def: "Brotes, epidemias, zoonosis e intoxicaciones. Se separa la vigilancia oficial (OPS, OMS, Ministerio de Salud y Deportes) de las notas de prensa, que son preliminares.", fu: ["OPS / OMS", "ECDC (Europa)", "Ministerio de Salud y Deportes", "Prensa (aparte)"]},
    "tecnológica": {n: "Amenazas tecnológicas", def: "Derrames, explosiones, incendios de edificios, colapsos de infraestructura. No existe fuente oficial abierta: se detecta por prensa y requiere verificación.", fu: ["Prensa boliviana"]},
    "salud": {n: "Salud humana: accidentes y hechos con víctimas", def: "Mortalidad, morbilidad y novedades de los hechos que comprometen la salud humana (accidentes de tránsito y otros hechos con víctimas). Son los mismos hechos de Antropogénica/Tecnológica, vistos desde la salud; no se duplican. Fuente: prensa boliviana triangulada; no sustituye el registro de Policía, SUMA 161 o el SNIS.", fu: ["Prensa boliviana (triangulada)", "Fotografías de los medios, con crédito"]},
    "antropogénica": {n: "Amenazas antropogénicas", def: "Hechos causados por la actividad humana: conflictos, bloqueos, violencia y accidentes. Los accidentes con víctimas tienen su propio módulo de Salud humana.", fu: ["Prensa boliviana", "GDELT"]}
  };
  var CDEF = DEF[T] || DEF["geológica"], COL = T === "salud" ? "#c62828" : (S.COLCAT[T] || "#1d6fb8");
  X.header("modulo.html");
  [].forEach.call(document.querySelectorAll(".tn"), function (a) { if (decodeURIComponent((a.getAttribute("href") || "").split("t=")[1] || "") === T) a.classList.add("on"); });

  /* ---------- utilidades ---------- */
  function dias(n) { var o = []; for (var i = n - 1; i >= 0; i--) o.push(S.diaKey(Date.now() - i * DIA)); return o; }
  function contar(arr, kf) { var o = {}; arr.forEach(function (x) { var ks = [].concat(kf(x)); ks.forEach(function (k) { if (k != null && k !== "") o[k] = (o[k] || 0) + 1; }); }); return o; }
  function topK(o, n, asc) { var k = Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n); return asc ? k.reverse() : k; }
  function barH(id, o, color, n) { var k = topK(o, n || 12, true); X.chart(id, {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, grid: {left: 120, right: 30, top: 8, bottom: 18}, xAxis: {type: "value", minInterval: 1}, yAxis: {type: "category", data: k.length ? k : ["Sin datos"], axisLabel: {width: 110, overflow: "truncate"}}, series: [{type: "bar", data: k.map(function (x) { return o[x]; }), itemStyle: {color: color, borderRadius: [0, 5, 5, 0]}, label: {show: true, position: "right"}}]}); }
  function barDia(id, arr, tsf, n, color) { var ks = dias(n), c = contar(arr, function (x) { return S.diaKey(tsf(x)); }); X.chart(id, {tooltip: {trigger: "axis"}, grid: {left: 34, right: 10, top: 14, bottom: 28}, xAxis: {type: "category", data: ks.map(function (k) { return k.slice(5); })}, yAxis: {type: "value", minInterval: 1}, series: [{type: "bar", data: ks.map(function (k) { return c[k] || 0; }), itemStyle: {color: color, borderRadius: [4, 4, 0, 0]}}]}); }
  function pie(id, o, colors) { X.chart(id, {tooltip: {trigger: "item"}, legend: {bottom: 0}, series: [{type: "pie", radius: ["42%", "70%"], center: ["50%", "44%"], itemStyle: {borderRadius: 5, borderColor: X.css("--card"), borderWidth: 2}, label: {formatter: "{b}: {c}"}, data: Object.keys(o).map(function (k) { return {name: k, value: o[k], itemStyle: colors && colors[k] ? {color: colors[k]} : undefined}; })}]}); }
  function kpi(l, v, d, col, ic) { return '<div class="card kpi" style="--k:' + col + '"><div class="ic" style="color:' + col + '">' + X.ic(ic) + '</div><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; }
  function evs(f) { return D.ev.filter(function (e) { return e.categoria === T && f(e); }); }
  function card(t, cap, id, cls, extra) { return '<div class="card"><h2>' + t + '</h2>' + (cap ? '<div class="cap">' + cap + '</div>' : '') + (extra || '') + '<div class="ch ' + (cls || "s") + '" id="' + id + '"></div></div>'; }
  function lista(arr, max) {
    return arr.slice(0, max || 12).map(function (e) { return '<a class="alert" href="evento.html?id=' + encodeURIComponent(e.id) + '" style="--c:' + (e.nivel != null ? COLN[Math.min(3, e.nivel)] : COL) + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(e.titulo) + '</div><div class="m">' + S.fecha(e.ts) + ' · ' + S.esc(e.lugar || (e.departamentos || []).join(", ") || "Bolivia") + ' · ' + S.esc(S.ORIGEN[e.origen] || e.origen) + '</div></div>' + X.confBadge(e) + '</a>'; }).join("") || '<p class="nota">Sin registros en este período.</p>';
  }
  function avisosSen() { return (((D.senamhi_alertas || {}).alertas) || []).map(function (a) { a._t = a.tipo || (/HIDROL/i.test(a.titulo || "") ? "hidrológica" : "meteorológica"); a._n = nivN(a.nivel); a._v = (a.fin || "9999") >= HOY; return a; }); }
  function mapa(id, fn, alto) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark", sat = T === "climatológica";
    var src = sat ? {type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 17, attribution: "Imagen satelital © Esri, Maxar, Earthstar Geographics"} : {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap"};
    var calles = (T === "antropogénica" || T === "tecnológica" || T === "salud"), op = sat ? 1 : calles ? (osc ? .75 : 1) : (osc ? .5 : .75);
    var m = new maplibregl.Map({container: id, style: {version: 8, sources: {base: src}, layers: [{id: "bg", type: "background", paint: {"background-color": X.css("--soft")}}, {id: "base", type: "raster", source: "base", paint: {"raster-opacity": op, "raster-brightness-max": (osc && !sat) ? (calles ? .7 : .42) : 1, "raster-saturation": (osc && !sat && !calles) ? -.4 : 0}}]}, bounds: [[-69.9, -23.1], [-57.2, -9.4]], fitBoundsOptions: {padding: 8}, attributionControl: {compact: true}});
    m.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right");
    m.on("load", function () {
      m.addSource("dep", {type: "geojson", data: D.geoDep || {type: "FeatureCollection", features: []}});
      m.addSource("mun", {type: "geojson", data: D.geoMun || {type: "FeatureCollection", features: []}});
      fn(m);
      m.addLayer({id: "dep-line", type: "line", source: "dep", paint: {"line-color": sat ? "#ffffff" : osc ? "#9fb3cc" : "#4b5a70", "line-width": sat ? 1.4 : 1.2, "line-opacity": sat ? .8 : 1}});
      try { herramientas(m, id); } catch (x) { console.error("herramientas", x); }
    });
    function pop(capa, f) { m.on("click", capa, function (e) { new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop">' + f(e.features[0].properties) + '</div>').addTo(m); }); m.on("mouseenter", capa, function () { m.getCanvas().style.cursor = "pointer"; }); m.on("mouseleave", capa, function () { m.getCanvas().style.cursor = ""; }); }
    m.pop = pop; (window.__mapas = window.__mapas || {})[id] = m; return m;
  }

  /* ---------- herramientas de mapa: mapa base, desglose municipal y vista 3D ---------- */
  var ESRI = function (n) { return "https://server.arcgisonline.com/ArcGIS/rest/services/" + n + "/MapServer/tile/{z}/{y}/{x}"; };
  var BASES = {calles: {n: "Calles (OSM)", t: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], o: 1, b: 1, s: 0}, claro: {n: "Claro (contexto)", t: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], o: .6, b: 1, s: -.2},
    sat: {n: "Satélite (Esri)", t: [ESRI("World_Imagery")], o: 1, b: 1, s: 0}, topo: {n: "Topográfico (Esri)", t: [ESRI("World_Topo_Map")], o: 1, b: 1, s: 0}, relieve: {n: "Relieve sombreado", t: [ESRI("Elevation/World_Hillshade")], o: 1, b: 1, s: 0}, oscuro: {n: "Oscuro", t: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], o: .5, b: .42, s: -.4}};
  var BASE_DEF = {"geológica": "topo", "meteorológica": "claro", "hidrológica": "topo", "climatológica": "sat", "biológica": "claro", "tecnológica": "calles", "antropogénica": "calles", "salud": "calles"};
  function puntosTipo() {
    var P = [];
    try {
      if (T === "geológica") ((D.sismos_oficiales || {}).sismos || []).forEach(function (s) { if (s.ts > Date.now() - PER * DIA) P.push([s.lon, s.lat, 1]); });
      if (T === "climatológica") { var fp = D.focos_puntos || {}; (fp.puntos || []).forEach(function (p) { P.push([p[1], p[0], 1]); }); }
      D.ev.forEach(function (e) { if (e.lat != null && e.lon != null && (e.categoria === T || (T === "salud" && e.cifras && (e.cifras.fallecidos || e.cifras.heridos))) && act(e) > Date.now() - PER * DIA && e.origen !== "modelo" && T !== "geológica" && T !== "climatológica") P.push([e.lon, e.lat, 1]); });
    } catch (x) {}
    return P;
  }
  function herramientas(m, id) {
    var cont = m.getContainer(), q = new URLSearchParams(location.search), osc = document.documentElement.getAttribute("data-theme") === "dark";
    var cur = q.get("b") && BASES[q.get("b")] ? q.get("b") : (BASE_DEF[T] || "calles");
    function base(k) {
      var b = BASES[k]; cur = k; m.getSource("base").setTiles(b.t);
      m.setPaintProperty("base", "raster-opacity", b.o); m.setPaintProperty("base", "raster-brightness-max", b.b); m.setPaintProperty("base", "raster-saturation", b.s);
      var sat = (k === "sat" || k === "oscuro"); if (m.getLayer("dep-line")) m.setPaintProperty("dep-line", "line-color", sat ? "#ffffff" : "#4b5a70");
    }
    var cnt = null;
    function conteo() {
      if (cnt) return cnt; var c = {}; puntosTipo().forEach(function (p) { var k = munDe(p[0], p[1]); if (k) c[k] = (c[k] || 0) + 1; });
      var g = geoCopia(D.geoMun), mx = 1; g.features.forEach(function (f) { var v = c[f.properties.n + " (" + f.properties.d + ")"] || 0; f.properties.v = v; mx = Math.max(mx, v); });
      return cnt = {g: g, mx: mx, n: Object.keys(c).length};
    }
    function desglose(on) {
      ["mt-f", "mt-l"].forEach(function (i) { if (m.getLayer(i)) m.removeLayer(i); }); if (m.getSource("mt")) m.removeSource("mt");
      if (!on) return;
      var c = conteo(); m.addSource("mt", {type: "geojson", data: c.g});
      m.addLayer({id: "mt-f", type: "fill", source: "mt", paint: {"fill-color": ["interpolate", ["linear"], ["get", "v"], 0, "rgba(0,0,0,0)", 1, "#ffe9b0", 1 + c.mx * .5, COL, 1 + c.mx, "#3a0a1e"], "fill-opacity": ["case", [">", ["get", "v"], 0], .7, 0]}}, "dep-line");
      m.addLayer({id: "mt-l", type: "line", source: "mt", paint: {"line-color": "#5b6b82", "line-width": .5, "line-opacity": .75}}, "dep-line");
      m.on("click", "mt-f", function (e) { var p = e.features[0].properties; new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop"><b>' + S.esc(p.n) + '</b>' + S.esc(p.d) + '<br>' + p.v + ' registro(s) en ' + PL + '</div>').addTo(m); });
    }
    function vista3d(on) {
      if (m.getLayer("mt-3d")) m.removeLayer("mt-3d");
      if (on) {
        var c = conteo(); if (!m.getSource("mt3")) m.addSource("mt3", {type: "geojson", data: c.g});
        m.addLayer({id: "mt-3d", type: "fill-extrusion", source: "mt3", filter: [">", ["get", "v"], 0], paint: {"fill-extrusion-color": ["interpolate", ["linear"], ["get", "v"], 1, "#ffd166", 1 + c.mx * .5, COL, 1 + c.mx, "#3a0a1e"], "fill-extrusion-height": ["*", ["get", "v"], 150000 / c.mx], "fill-extrusion-opacity": .86}}, "dep-line");
        m.easeTo({pitch: 58, bearing: -18, duration: 900});
      } else m.easeTo({pitch: 0, bearing: 0, duration: 700});
    }
    var d = document.createElement("div"); d.className = "mtools";
    d.innerHTML = '<label>Mapa base <select data-r="b">' + Object.keys(BASES).map(function (k) { return '<option value="' + k + '"' + (k === cur ? " selected" : "") + '>' + BASES[k].n + '</option>'; }).join("") + '</select></label>' +
      '<label>Desglose <select data-r="d"><option value="dep">Departamento</option><option value="mun">Municipio (intensidad)</option></select></label><label class="ck"><input type="checkbox" data-r="3"> Vista 3D</label>';
    cont.appendChild(d); d.addEventListener("change", function (e) { var r = e.target.dataset.r; if (r === "b") base(e.target.value); if (r === "d") { desglose(e.target.value === "mun"); if (e.target.value !== "mun") { var t3 = d.querySelector('[data-r="3"]'); if (t3.checked) { t3.checked = false; vista3d(false); } } } if (r === "3") { if (e.target.checked && d.querySelector('[data-r="d"]').value !== "mun") { d.querySelector('[data-r="d"]').value = "mun"; desglose(true); } vista3d(e.target.checked); } });

    if (T === "geológica") {
      var G = document.createElement("div"); G.className = "mtools mctx";
      G.innerHTML = '<b>Contexto</b><label class="ck"><input type="checkbox" data-c="lab"> Nombres de lugares</label><label class="ck"><input type="checkbox" data-c="pla"> Placas tectónicas</label><label class="ck"><input type="checkbox" data-c="pob"> Densidad de población</label><label class="ck"><input type="checkbox" data-c="usgs"> Alertas USGS (PAGER / sentido)</label>';
      cont.appendChild(G);
      var ant = function () { return m.getLayer("mt-f") ? "mt-f" : "dep-line"; };
      var on = {
        lab: function (v) { if (v) { m.addSource("c-lab", {type: "raster", tiles: [ESRI("Reference/World_Boundaries_and_Places")], tileSize: 256, maxzoom: 17}); m.addLayer({id: "c-lab", type: "raster", source: "c-lab"}); } else { if (m.getLayer("c-lab")) m.removeLayer("c-lab"); if (m.getSource("c-lab")) m.removeSource("c-lab"); } },
        pob: function (v) { if (v) { m.addSource("c-pob", {type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png"], tileSize: 256, maxzoom: 7, attribution: "SEDAC/CIESIN GPW v4 vía NASA GIBS"}); m.addLayer({id: "c-pob", type: "raster", source: "c-pob", paint: {"raster-opacity": .62}}, "dep-line"); } else { if (m.getLayer("c-pob")) m.removeLayer("c-pob"); if (m.getSource("c-pob")) m.removeSource("c-pob"); } },
        pla: function (v) {
          if (!v) { if (m.getLayer("c-pla")) m.removeLayer("c-pla"); if (m.getSource("c-pla")) m.removeSource("c-pla"); return; }
          fetch("https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json").then(function (r) { return r.json(); }).then(function (g) {
            if (m.getSource("c-pla")) return; m.addSource("c-pla", {type: "geojson", data: g});
            m.addLayer({id: "c-pla", type: "line", source: "c-pla", paint: {"line-color": "#e11d48", "line-width": 2.4, "line-dasharray": [2, 1.2]}}, "dep-line");
            m.on("click", "c-pla", function (e) { new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop"><b>Límite de placas</b>' + S.esc(String(e.features[0].properties.Name || "").replace(/-/g, " – ")) + '<br><span class="nota">Bird (2003), PB2002</span></div>').addTo(m); });
          }).catch(function () { G.querySelector('[data-c="pla"]').checked = false; });
        },
        usgs: function (v) {
          if (!v) { ["c-us"].forEach(function (i) { if (m.getLayer(i)) m.removeLayer(i); }); if (m.getSource("c-us")) m.removeSource("c-us"); return; }
          var ini = new Date(Date.now() - Math.max(PER, 7) * DIA).toISOString().slice(0, 10);
          fetch("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=-27&maxlatitude=-5&minlongitude=-74&maxlongitude=-52&minmagnitude=3.5&orderby=time&limit=400&starttime=" + ini).then(function (r) { return r.json(); }).then(function (g) {
            if (m.getSource("c-us")) return; m.addSource("c-us", {type: "geojson", data: g});
            m.addLayer({id: "c-us", type: "circle", source: "c-us", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "mag"], 3, 5, 7, 22], "circle-color": ["match", ["get", "alert"], "green", "#2e9e5b", "yellow", "#f5b700", "orange", "#f26a1b", "red", "#d7263d", "#8b95a5"], "circle-opacity": .78, "circle-stroke-color": ["case", [">", ["coalesce", ["get", "felt"], 0], 0], "#111", "#fff"], "circle-stroke-width": ["case", [">", ["coalesce", ["get", "felt"], 0], 0], 2.4, 1]}}, "dep-line");
            m.on("click", "c-us", function (e) { var p = e.features[0].properties; new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop"><b>USGS M ' + p.mag + '</b>' + S.esc(p.place || "") + '<br>' + new Date(p.time).toLocaleString("es-BO", {timeZone: "America/La_Paz"}) + '<br>Alerta PAGER: ' + (p.alert || "sin alerta") + ' · reportes «lo sentí»: ' + (p.felt || 0) + '<br><a href="' + p.url + '" target="_blank" rel="noopener">Ver en USGS</a></div>').addTo(m); });
          }).catch(function () { G.querySelector('[data-c="usgs"]').checked = false; });
        }
      };
      G.addEventListener("change", function (e) { var c = e.target.dataset.c; if (c && on[c]) on[c](e.target.checked); });
    }

    if (T === "meteorológica") {
      var W = document.createElement("div"); W.className = "mtools mctx";
      W.innerHTML = '<b>Capas del tiempo</b><label class="ck"><input type="checkbox" data-w="viento"> Viento animado</label><label class="ck"><input type="checkbox" data-w="nubes"> Nubes (GOES-East)</label><label class="ck"><input type="checkbox" data-w="lluvia"> Lluvia (IMERG, NASA)</label><label class="ck"><input type="checkbox" data-w="pron"> Pronóstico al tocar el mapa</label><a class="nota" target="_blank" rel="noopener" href="https://www.windy.com/-16.5/-64.6?-16.5,-64.6,5">Abrir en Windy ↗</a>';
      cont.appendChild(W);
      /* viento animado: partículas sobre una grilla Open-Meteo (modelo; no es observación) */
      var VT = {raf: 0, cv: null, grid: null};
      var NIVV = {"": ["Superficie (10 m)", "10m", "wind_speed_10m", "wind_direction_10m"], "850": ["850 hPa (~1,5 km)", "850", "wind_speed_850hPa", "wind_direction_850hPa"], "700": ["700 hPa (~3 km)", "700", "wind_speed_700hPa", "wind_direction_700hPa"], "500": ["500 hPa (~5,5 km)", "500", "wind_speed_500hPa", "wind_direction_500hPa"]};
      function gridViento() {
        if (VT.data) return Promise.resolve(VT.data);
        var la = [], lo = [], NL = 8, NO = 8; for (var i = 0; i < NL; i++) la.push(-23 + i * (13.6 / (NL - 1))); for (var j = 0; j < NO; j++) lo.push(-70 + j * (13.4 / (NO - 1)));
        var LA = [], LO = []; la.forEach(function (a) { lo.forEach(function (o) { LA.push(a.toFixed(2)); LO.push(o.toFixed(2)); }); });
        var ck = "viento_v2_" + new Date().toISOString().slice(0, 13);
        try { var c = sessionStorage.getItem(ck); if (c) { VT.data = JSON.parse(c); return Promise.resolve(VT.data); } } catch (x) {}
        var vars = []; Object.keys(NIVV).forEach(function (k) { vars.push(NIVV[k][2], NIVV[k][3]); });
        return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + LA.join(",") + "&longitude=" + LO.join(",") + "&hourly=" + vars.join(",") + "&forecast_days=3&timezone=America%2FLa_Paz&wind_speed_unit=kmh").then(function (r) { return r.json(); }).then(function (a) {
          a = [].concat(a); var D_ = {la: la, lo: lo, t: a[0].hourly.time, sp: {}, dr: {}};
          Object.keys(NIVV).forEach(function (k) { D_.sp[k] = a.map(function (p) { return p.hourly[NIVV[k][2]]; }); D_.dr[k] = a.map(function (p) { return p.hourly[NIVV[k][3]]; }); });
          try { sessionStorage.setItem(ck, JSON.stringify(D_)); } catch (x) {}
          return VT.data = D_;
        });
      }
      function campoViento(D_, h, k) {
        var u = [], v = []; D_.sp[k].forEach(function (arr, i) { var sp = arr[h] == null ? 0 : arr[h], d = (D_.dr[k][i][h] || 0) * Math.PI / 180; u.push(-sp * Math.sin(d)); v.push(-sp * Math.cos(d)); });
        return {la: D_.la, lo: D_.lo, u: u, v: v};
      }
      function muestra(g, lon, lat) {
        var fy = (lat - g.la[0]) / (g.la[g.la.length - 1] - g.la[0]) * (g.la.length - 1), fx = (lon - g.lo[0]) / (g.lo[g.lo.length - 1] - g.lo[0]) * (g.lo.length - 1);
        if (fy < 0 || fx < 0 || fy > g.la.length - 1 || fx > g.lo.length - 1) return null;
        var y0 = Math.floor(fy), x0 = Math.floor(fx), y1 = Math.min(y0 + 1, g.la.length - 1), x1 = Math.min(x0 + 1, g.lo.length - 1), ty = fy - y0, tx = fx - x0, N = g.lo.length;
        function bi(A) { return (A[y0 * N + x0] * (1 - tx) + A[y0 * N + x1] * tx) * (1 - ty) + (A[y1 * N + x0] * (1 - tx) + A[y1 * N + x1] * tx) * ty; }
        return [bi(g.u), bi(g.v)];
      }
      function viento(on) {
        if (!on) { cancelAnimationFrame(VT.raf); clearInterval(VT.pl); if (VT.cv) { VT.cv.remove(); VT.cv = null; } if (VT.bar) { VT.bar.remove(); VT.bar = null; } return; }
        gridViento().then(function (D_) {
          var ahora = new Date(Date.now() - 4 * 36e5).toISOString().slice(0, 13), h0 = Math.max(0, D_.t.findIndex(function (t) { return t.slice(0, 13) >= ahora; }));
          var hh = h0, kk = "";
          VT.g = campoViento(D_, hh, kk);
          var cv = document.createElement("canvas"); cv.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:3"; cont.appendChild(cv); VT.cv = cv;
          var DIAS_ = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
          var bar = document.createElement("div"); bar.className = "mtools mtime"; VT.bar = bar;
          bar.innerHTML = '<button type="button" class="btn s" data-t="play">▶</button><input type="range" min="0" max="' + (D_.t.length - 1) + '" value="' + hh + '" data-t="r"><b data-t="lb"></b><select data-t="niv">' + Object.keys(NIVV).map(function (k) { return '<option value="' + k + '">' + NIVV[k][0] + '</option>'; }).join("") + '</select><span class="mleg"><i></i> 0 · 8 · 18 · 30+ km/h</span>';
          cont.appendChild(bar);
          function etiqueta() { var t = D_.t[hh], d = new Date(t + ":00"); bar.querySelector('[data-t="lb"]').textContent = DIAS_[d.getDay()] + " " + t.slice(8, 10) + "/" + t.slice(5, 7) + " " + t.slice(11, 16) + " (hora Bolivia)" + (hh === h0 ? " · ahora" : ""); }
          function pon(h) { hh = h; VT.g = campoViento(D_, hh, kk); bar.querySelector('[data-t="r"]').value = hh; etiqueta(); }
          bar.addEventListener("input", function (e) { if (e.target.dataset.t === "r") pon(+e.target.value); });
          bar.addEventListener("change", function (e) { if (e.target.dataset.t === "niv") { kk = e.target.value; pon(hh); } });
          bar.querySelector('[data-t="play"]').onclick = function () { var b = this; if (VT.pl) { clearInterval(VT.pl); VT.pl = 0; b.textContent = "▶"; return; } b.textContent = "⏸"; VT.pl = setInterval(function () { pon(hh + 1 >= D_.t.length ? 0 : hh + 1); }, 700); };
          etiqueta();
          var ctx, w, h, P = [];
          function dim() { var r = cont.getBoundingClientRect(); w = cv.width = r.width; h = cv.height = r.height; ctx = cv.getContext("2d"); ctx.clearRect(0, 0, w, h); }
          function nace(p) { p.x = Math.random() * w; p.y = Math.random() * h; p.vida = 40 + Math.random() * 60; return p; }
          dim(); for (var i = 0; i < 1100; i++) P.push(nace({}));
          m.on("move", function () { if (VT.cv) ctx.clearRect(0, 0, w, h); }); window.addEventListener("resize", dim);
          function paso() {
            if (!VT.cv) return;
            ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0,.07)"; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = 1.3;
            P.forEach(function (p) {
              var ll = m.unproject([p.x, p.y]), uv = muestra(VT.g, ll.lng, ll.lat); if (!uv || --p.vida < 0) { nace(p); return; }
              var sp = Math.hypot(uv[0], uv[1]), nx = p.x + uv[0] * .055, ny = p.y - uv[1] * .055;
              ctx.strokeStyle = sp < 8 ? "rgba(70,130,200,.85)" : sp < 18 ? "rgba(40,160,120,.9)" : sp < 30 ? "rgba(235,170,20,.95)" : "rgba(215,38,61,.95)";
              ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke(); p.x = nx; p.y = ny;
            });
            VT.raf = requestAnimationFrame(paso);
          }
          paso();
        }).catch(function () { W.querySelector('[data-w="viento"]').checked = false; });
      }
      /* capas raster de la NASA (GIBS) */
      function gibsCapa(id, capa, ext, nivel, op, sub) {
        return function (v) {
          if (!v) { if (m.getLayer(id)) m.removeLayer(id); if (m.getSource(id)) m.removeSource(id); return; }
          var t = sub ? new Date(Math.floor((Date.now() - 50 * 60e3) / 6e5) * 6e5).toISOString().slice(0, 19) + "Z" : new Date(Date.now() - 36e5 * 30).toISOString().slice(0, 10);
          m.addSource(id, {type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + capa + "/default/" + t + "/GoogleMapsCompatible_Level" + nivel + "/{z}/{y}/{x}." + ext], tileSize: 256, maxzoom: nivel, attribution: "NASA GIBS / EOSDIS"});
          m.addLayer({id: id, type: "raster", source: id, paint: {"raster-opacity": op}}, "dep-line");
        };
      }
      /* pronóstico del punto (modelo Open-Meteo) */
      var PF = {on: false, mk: null, box: null, ll: null};
      function pronostico(ll) {
        PF.ll = ll; if (PF.mk) PF.mk.remove(); PF.mk = new maplibregl.Marker({color: "#1d6fb8"}).setLngLat(ll).addTo(m);
        if (!PF.box) { PF.box = document.createElement("div"); PF.box.className = "mfor"; cont.appendChild(PF.box); }
        var mod = (PF.box.querySelector("select") || {}).value || "";
        PF.box.innerHTML = '<div class="mfh"><b>Pronóstico del punto</b><button type="button" class="mfx">×</button></div><div class="nota">Cargando…</div>';
        PF.box.querySelector(".mfx").onclick = function () { PF.box.remove(); PF.box = null; if (PF.mk) PF.mk.remove(); };
        fetch("https://api.open-meteo.com/v1/forecast?latitude=" + ll.lat.toFixed(3) + "&longitude=" + ll.lng.toFixed(3) + "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,precipitation,wind_gusts_10m&forecast_days=3&timezone=America%2FLa_Paz&wind_speed_unit=kmh" + (mod ? "&models=" + mod : "")).then(function (r) { return r.json(); }).then(function (d) {
          var c = d.current, hrs = d.hourly.time.slice(0, 48), sfx = mod ? "_" + mod : "";
          var T2 = d.hourly["temperature_2m" + sfx] || d.hourly.temperature_2m, PR = d.hourly["precipitation" + sfx] || d.hourly.precipitation, G = d.hourly["wind_gusts_10m" + sfx] || d.hourly.wind_gusts_10m;
          PF.box.innerHTML = '<div class="mfh"><b>Pronóstico del punto</b><button type="button" class="mfx">×</button></div><div class="mfs"><span><b>' + (c ? Math.round(c.temperature_2m) : "–") + ' °C</b> ahora</span><span>Humedad ' + (c ? c.relative_humidity_2m : "–") + ' %</span><span>Viento ' + (c ? Math.round(c.wind_speed_10m) : "–") + ' km/h (ráf. ' + (c ? Math.round(c.wind_gusts_10m) : "–") + ')</span></div><label class="nota">Modelo <select><option value="">Automático</option><option value="ecmwf_ifs025">ECMWF</option><option value="gfs_seamless">GFS</option><option value="icon_seamless">ICON</option></select></label><div id="pfChart" style="height:150px"></div><div class="nota">' + ll.lat.toFixed(2) + ', ' + ll.lng.toFixed(2) + ' · próximas 48 h · modelo Open-Meteo, no es un pronóstico oficial</div>';
          PF.box.querySelector("select").value = mod; PF.box.querySelector("select").onchange = function () { pronostico(PF.ll); };
          PF.box.querySelector(".mfx").onclick = function () { PF.box.remove(); PF.box = null; if (PF.mk) PF.mk.remove(); };
          X.chart("pfChart", {tooltip: {trigger: "axis"}, legend: {top: 0, textStyle: {fontSize: 10}}, grid: {left: 30, right: 30, top: 24, bottom: 20}, xAxis: {type: "category", data: hrs.map(function (t) { return t.slice(8, 10) + "/" + t.slice(11, 13) + "h"; }), axisLabel: {interval: 7, fontSize: 9}}, yAxis: [{type: "value", name: "°C"}, {type: "value", name: "mm", splitLine: {show: false}}], series: [{name: "Temp.", type: "line", smooth: true, data: T2.slice(0, 48), itemStyle: {color: "#d7263d"}, showSymbol: false}, {name: "Lluvia", type: "bar", yAxisIndex: 1, data: PR.slice(0, 48), itemStyle: {color: "#1e88e5"}}, {name: "Ráfaga km/h", type: "line", data: G.slice(0, 48), itemStyle: {color: "#8e24aa"}, lineStyle: {type: "dashed", width: 1}, showSymbol: false, yAxisIndex: 0}]});
        }).catch(function () { PF.box.querySelector(".nota").textContent = "No se pudo cargar el pronóstico (sin conexión al servicio)."; });
      }
      m.on("click", function (e) { if (PF.on) pronostico(e.lngLat); });
      var ow = {viento: viento, nubes: gibsCapa("w-nub", "GOES-East_ABI_GeoColor", "png", 7, .8, true), lluvia: gibsCapa("w-llu", "IMERG_Precipitation_Rate", "png", 6, .7, false), pron: function (v) { PF.on = v; m.getCanvas().style.cursor = v ? "crosshair" : ""; if (!v && PF.box) { PF.box.remove(); PF.box = null; if (PF.mk) PF.mk.remove(); } }};
      W.addEventListener("change", function (e) { var c = e.target.dataset.w; if (c && ow[c]) ow[c](e.target.checked); });
    }
    base(cur); if (q.get("d") === "mun") { d.querySelector('[data-r="d"]').value = "mun"; desglose(true); }
  }

  /* ---------- filtros propios de cada módulo (actualizan KPIs, gráficas, mapa y lista) ---------- */
  function filtrosHtml(B) {
    if (!B.filtros) return "";
    return '<div class="card fmod"><h2>' + X.ic("list") + 'Filtros de análisis</h2><div class="sx-ctl">' + B.filtros.ctl.map(function (c) { return '<label>' + c.l + ' <select data-f="' + c.id + '">' + c.o.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join("") + '</select></label>'; }).join("") + '<button class="btn s" id="fReset" type="button">Quitar filtros</button></div><div class="nota" id="fRes"></div></div>' + (B.wb ? '<div class="card"><h2>' + X.ic("info") + 'Contexto de Bolivia · tendencias (Banco Mundial)</h2><div class="grid g4" id="wbCtx"></div></div>' : "");
  }
  function filtrosInit(B) {
    if (!B.filtros) return;
    var box = document.querySelector(".fmod");
    function vals() { var v = {}; [].forEach.call(box.querySelectorAll("select[data-f]"), function (e) { v[e.dataset.f] = e.value; }); return v; }
    function aplica() {
      var r = B.filtros.aplica(vals()); $("fRes").innerHTML = r || "";
      var gk = document.querySelector(".grid.g4"); if (gk && B.kpiF) gk.innerHTML = B.kpiF();
      B.charts.forEach(function (c) { try { c.f(); } catch (x) { console.error(x); } });
      var m = (window.__mapas || {}).mmap; if (m && B.filtros.mapa) { try { B.filtros.mapa(m); } catch (x) { console.error(x); } }
      var l = $("aLista"); if (l && B.filtros.lista) l.innerHTML = B.filtros.lista();
    }
    box.addEventListener("change", aplica);
    $("fReset").onclick = function () { [].forEach.call(box.querySelectorAll("select[data-f]"), function (e) { e.selectedIndex = 0; }); aplica(); };
    aplica(); if (B.wb) contextoWB();
  }
  var ITEM_AV = function (a) { return '<a class="alert" href="' + S.esc(S.urlOk(a.pdf || a.url)) + '" target="_blank" rel="noopener" style="--c:' + COLN[Math.max(0, a._n)] + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(a.titulo) + '</div><div class="m">Vigente ' + S.esc(a.inicio || "") + ' → ' + S.esc(a.fin || "") + ' · ' + S.esc((a.departamentos || []).join(", ")) + (a.n_municipios ? ' · ' + a.n_municipios + ' municipios' : '') + '</div></div><span class="badge b' + Math.max(0, a._n) + '">' + NIVT[Math.max(0, a._n)] + '</span></a>'; };
  function filtrosAvisos(ALL, AV, vig, extra) {
    var deps = {}; ALL.forEach(function (a) { (a.departamentos || []).forEach(function (d) { deps[d] = 1; }); });
    var fen = {}; ALL.forEach(function (a) { if (a.fenomeno) fen[a.fenomeno.trim()] = 1; });
    var ctl = [{id: "niv", l: "Nivel", o: [["", "Todos"], ["1", "Amarilla"], ["2", "Naranja"], ["3", "Roja"]]}, {id: "dep", l: "Departamento", o: [["", "Todos"]].concat(Object.keys(deps).sort().map(function (d) { return [d, d]; }))}, {id: "vig", l: "Estado", o: [["", "Últimos 60 días"], ["1", "Solo vigentes"]]}];
    if (extra && Object.keys(fen).length) ctl.push({id: "fen", l: "Fenómeno", o: [["", "Todos"]].concat(Object.keys(fen).sort().map(function (d) { return [d, d]; }))});
    function lista() { return vig.length ? vig.map(ITEM_AV).join("") : '<p class="nota">Sin avisos con esos filtros.</p>'; }
    return {ctl: ctl, lista: lista, aplica: function (v) {
      var L = ALL.filter(function (a) { return (!v.niv || a._n === +v.niv) && (!v.dep || (a.departamentos || []).indexOf(v.dep) >= 0) && (!v.fen || (a.fenomeno || "").trim() === v.fen) && (!v.vig || a._v); });
      AV.length = 0; L.forEach(function (a) { AV.push(a); }); vig.length = 0; AV.filter(function (a) { return a._v; }).forEach(function (a) { vig.push(a); });
      return "Mostrando " + AV.length + " de " + ALL.length + " avisos de los últimos 60 días · " + vig.length + " vigentes";
    }, mapa: function (m) { var niv = {}; vig.forEach(function (a) { (a.municipios || []).forEach(function (t) { if (niv[t] == null || a._n > niv[t]) niv[t] = a._n; }); }); var g = geoCopia(D.geoMun); g.features.forEach(function (f) { var q = niv[f.properties.n + " (" + f.properties.d + ")"]; f.properties.niv = q == null ? -1 : q; }); if (m.getSource("mun")) m.getSource("mun").setData(g); }};
  }

  var HECHO_RX = /muri|muert|fallec|herid|accident|choque|colisi|vuelc|embarranc|atropell|bloque|marcha|paro |protesta|enfrentamient|conflict|asesin|feminicid|homicid|incendi|explosi|robo|atraco|secuestr|detenid|aprehend|rescat|derrumb|intoxic|ahog|derrame|fuga|colaps/i, RUIDO_RX = /econom|\bINE\b|unesco|whatsapp|seguro|artistas|m[uú]sica|pacto global|https?:\/\/|campa[nñ]a|premio|libro|festival|aniversario|impunidad|informe/i;
  function esHecho(e) { var t = e.titulo || ""; return HECHO_RX.test(t) && !RUIDO_RX.test(t); }
  function embudo(rev, sen, conf, desc) { return '<span class="emb"><b>' + rev + '</b> notas revisadas</span><span class="emb">→ <b>' + sen + '</b> señales (1 medio)</span><span class="emb">→ <b>' + conf + '</b> hechos triangulados (2+ medios)</span><span class="emb dsc"><b>' + desc + '</b> descartadas (no son un hecho)</span>'; }
  function filtrosPrensa(ORIG, L, L30, SUB) {
    var deps = {}; ORIG.forEach(function (e) { (e.departamentos || []).forEach(function (d) { deps[d] = 1; }); });
    return {ctl: [{id: "per", l: "Pertinencia", o: [["h", "Solo hechos concretos"], ["", "Todas las notas"]]}, {id: "sub", l: "Tipo de hecho", o: [["", "Todos"]].concat(SUB.map(function (x) { return [x[0], x[0]]; }))}, {id: "dep", l: "Departamento", o: [["", "Todos"]].concat(Object.keys(deps).sort().map(function (d) { return [d, d]; }))}, {id: "cf", l: "Confianza", o: [["", "Todas"], ["m", "Media o alta (2+ medios)"], ["b", "Una sola fuente"]]}, {id: "vi", l: "Víctimas", o: [["", "Todos"], ["v", "Con víctimas"], ["f", "Con fallecidos"]]}],
      lista: function () { return lista(L, 10); },
      aplica: function (v) {
        var base = ORIG.filter(function (e) { return v.per ? esHecho(e) : true; }), now = Date.now();
        var f = base.filter(function (e) { var c = e.cifras || {}, n = e.confianza ? e.confianza.nivel : "Baja"; return (!v.sub || subtipo(e) === v.sub) && (!v.dep || (e.departamentos || []).indexOf(v.dep) >= 0) && (!v.cf || (v.cf === "m" ? n !== "Baja" : n === "Baja")) && (!v.vi || (v.vi === "f" ? (c.fallecidos || 0) > 0 : ((c.fallecidos || 0) + (c.heridos || 0)) > 0)); });
        L.length = 0; f.forEach(function (e) { L.push(e); }); L30.length = 0; f.filter(function (e) { return act(e) > now - PER * DIA; }).forEach(function (e) { L30.push(e); });
        var p = ORIG.filter(function (e) { return act(e) > now - PER * DIA; }), hs = p.filter(esHecho), tri = hs.filter(function (e) { return e.confianza && e.confianza.nivel !== "Baja"; }).length;
        return embudo(p.length, hs.length - tri, tri, p.length - hs.length) + '<span class="emb ok">Mostrando <b>' + L30.length + '</b> en ' + PL + '</span>';
      },
      mapa: function (m) {
        var pts = L30.filter(function (e) { return e.lat != null; });
        if (m.getSource("e")) m.getSource("e").setData({type: "FeatureCollection", features: pts.map(function (e) { return {type: "Feature", properties: {t: e.titulo, c: e.confianza ? e.confianza.nivel : "Baja", id: e.id}, geometry: {type: "Point", coordinates: [e.lon, e.lat]}}; })});
        if (m.getSource("me")) { var c = {}; pts.forEach(function (e) { var k = munDe(e.lon, e.lat); if (k) c[k] = (c[k] || 0) + 1; }); var g = geoCopia(D.geoMun); g.features.forEach(function (q) { q.properties.v = c[q.properties.n + " (" + q.properties.d + ")"] || 0; }); m.getSource("me").setData(g); }
      }};
  }
  function filtrosBio(ALL, intl, vig, alta) {
    var enf = {}, fu = {}; ALL.forEach(function (x) { enf[x._c.enf] = 1; fu[x.fuente] = 1; });
    function item(x) { return '<a class="alert" href="' + S.esc(S.urlOk(x.url)) + '" target="_blank" rel="noopener" style="--c:' + PRIOC[x._c.prio] + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(x.titulo) + '</div><div class="m">' + S.esc(x.fuente) + ' · ' + S.esc(x.fecha) + ' · ' + x._c.enf + '</div></div></a>'; }
    return {ctl: [{id: "enf", l: "Enfermedad", o: [["", "Todas"]].concat(Object.keys(enf).sort().map(function (d) { return [d, d]; }))}, {id: "pr", l: "Prioridad", o: [["", "Todas"], ["Alta", "Alta"], ["Media", "Media"], ["Baja", "Baja"]]}, {id: "fu", l: "Fuente", o: [["", "Todas"]].concat(Object.keys(fu).sort().map(function (d) { return [d, d]; }))}, {id: "vg", l: "Estado", o: [["", "Todas (60 días)"], ["1", "Solo vigentes"]]}],
      lista: function () { var L = (alta.length ? alta : vig).slice(0, 8); return L.map(item).join("") || '<p class="nota">Sin alertas con esos filtros.</p>'; },
      aplica: function (v) {
        var f = ALL.filter(function (x) { return (!v.enf || x._c.enf === v.enf) && (!v.pr || x._c.prio === v.pr) && (!v.fu || x.fuente === v.fu) && (!v.vg || x._c.vig); });
        intl.length = 0; f.forEach(function (x) { intl.push(x); }); vig.length = 0; intl.filter(function (x) { return x._c.vig; }).forEach(function (x) { vig.push(x); }); alta.length = 0; vig.filter(function (x) { return x._c.prio === "Alta"; }).forEach(function (x) { alta.push(x); });
        return '<span class="emb ok">Mostrando <b>' + intl.length + '</b> de ' + ALL.length + ' publicaciones oficiales · ' + vig.length + ' vigentes · ' + alta.length + ' de prioridad alta</span>';
      }};
  }
  /* contexto de Bolivia (Banco Mundial, API abierta): tendencia de indicadores de salud y población */
  function contextoWB() {
    var box = $("wbCtx"); if (!box) return;
    var IND = [["SH.DYN.MORT", "Mortalidad en menores de 5 años", "por 1.000 nacidos vivos", "#c62828"], ["SP.DYN.LE00.IN", "Esperanza de vida al nacer", "años", "#1d6fb8"], ["SH.IMM.MEAS", "Vacunación contra sarampión (12–23 m)", "% de niños", "#2e9e5b"], ["SP.POP.TOTL", "Población total", "personas", "#6a1b9a"]];
    box.innerHTML = IND.map(function (i, k) { return '<div class="card kpi" style="--k:' + i[3] + '"><div class="l">' + i[1] + '</div><div class="v" id="wb' + k + 'v">…</div><div class="d" id="wb' + k + 'd">' + i[2] + '</div><div id="wb' + k + 'c" style="height:70px;margin-top:6px"></div></div>'; }).join("");
    IND.forEach(function (i, k) {
      fetch("https://api.worldbank.org/v2/country/BOL/indicator/" + i[0] + "?format=json&per_page=40&mrv=30").then(function (r) { return r.json(); }).then(function (a) {
        var d = (a[1] || []).filter(function (x) { return x.value != null; }).reverse(); if (!d.length) throw 0; var u = d[d.length - 1];
        $("wb" + k + "v").textContent = u.value >= 1e6 ? (u.value / 1e6).toFixed(2).replace(".", ",") + " M" : u.value.toFixed(1).replace(".", ","); $("wb" + k + "d").textContent = i[2] + " · " + u.date + " · Banco Mundial";
        X.chart("wb" + k + "c", {grid: {left: 4, right: 4, top: 6, bottom: 4}, tooltip: {trigger: "axis"}, xAxis: {type: "category", data: d.map(function (x) { return x.date; }), show: false}, yAxis: {type: "value", show: false, scale: true}, series: [{type: "line", smooth: true, showSymbol: false, data: d.map(function (x) { return x.value; }), lineStyle: {color: i[3], width: 2}, areaStyle: {color: i[3], opacity: .12}}]});
      }).catch(function () { $("wb" + k + "v").textContent = "—"; $("wb" + k + "d").textContent = "sin conexión al Banco Mundial"; });
    });
  }
  function nuevo(pref) { var o = D.nuevas || {}, k = Object.keys(o).filter(function (x) { return x.indexOf(pref) === 0; }); return k.length ? o[k[0]] : []; }
  function geoCopia(g) { return JSON.parse(JSON.stringify(g || {type: "FeatureCollection", features: []})); }

  /* ---------- mapas: capas conmutables, municipios y NASA GIBS ---------- */
  function ctrl(m, items, extra) {
    var d = document.createElement("div"); d.className = "mctrl";
    d.innerHTML = '<b>Capas</b>' + items.map(function (i) { return '<label><input type="checkbox" data-l="' + i.id + '"' + (i.on === false ? "" : " checked") + '> ' + i.label + '</label>'; }).join("") + (extra || "");
    m.getContainer().appendChild(d);
    function aplica(i, v) { i.layers.forEach(function (l) { if (m.getLayer(l)) m.setLayoutProperty(l, "visibility", v ? "visible" : "none"); }); }
    d.addEventListener("change", function (e) { var l = e.target.dataset && e.target.dataset.l; items.forEach(function (i) { if (i.id === l) aplica(i, e.target.checked); }); });
    items.forEach(function (i) { if (i.on === false) aplica(i, false); });
    return d;
  }
  function ringIn(x, y, r) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; } return c; }
  function enGeom(x, y, g) { var P = g.type === "Polygon" ? [g.coordinates] : g.coordinates; for (var k = 0; k < P.length; k++) { if (ringIn(x, y, P[k][0])) { var hole = false; for (var h = 1; h < P[k].length; h++) if (ringIn(x, y, P[k][h])) hole = true; if (!hole) return true; } } return false; }
  function bb(g) { var P = g.type === "Polygon" ? [g.coordinates] : g.coordinates, a = [1e9, 1e9, -1e9, -1e9]; P.forEach(function (p) { p[0].forEach(function (c) { a[0] = Math.min(a[0], c[0]); a[1] = Math.min(a[1], c[1]); a[2] = Math.max(a[2], c[0]); a[3] = Math.max(a[3], c[1]); }); }); return a; }
  var MB = null;
  function munDe(lon, lat) { if (!D.geoMun) return null; if (!MB) MB = D.geoMun.features.map(function (f) { return bb(f.geometry); }); for (var i = 0; i < MB.length; i++) { var b = MB[i]; if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3] && enGeom(lon, lat, D.geoMun.features[i].geometry)) { var p = D.geoMun.features[i].properties; return p.n + " (" + p.d + ")"; } } return null; }
  /* choropleth municipal: pts = [[lon,lat,peso?]]; devuelve {capa, n municipios} */
  function capaMun(m, id, pts, color, antes) {
    var c = {}; pts.forEach(function (p) { var k = munDe(p[0], p[1]); if (k) c[k] = (c[k] || 0) + (p[2] || 1); });
    var g = geoCopia(D.geoMun), mx = 1; g.features.forEach(function (f) { var v = c[f.properties.n + " (" + f.properties.d + ")"] || 0; f.properties.v = v; mx = Math.max(mx, v); });
    m.addSource(id, {type: "geojson", data: g});
    m.addLayer({id: id + "f", type: "fill", source: id, paint: {"fill-color": ["interpolate", ["linear"], ["get", "v"], 0, "rgba(0,0,0,0)", 1, "#ffe9b0", 1 + mx * .5, color, 1 + mx, "#3a0a1e"], "fill-opacity": ["case", [">", ["get", "v"], 0], .72, 0]}}, antes || undefined);
    m.addLayer({id: id + "l", type: "line", source: id, paint: {"line-color": "#7b8aa3", "line-width": .35, "line-opacity": .5}}, antes || undefined);
    m.pop(id + "f", function (p) { return "<b>" + S.esc(p.n) + "</b>" + S.esc(p.d) + "<br>" + p.v + " registro(s) en el período"; });
    return Object.keys(c).length;
  }
  function gibs(m, fecha, capa, ext, nivel, op) { var id = "g_" + capa; return {id: id, src: {type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + capa + "/default/" + fecha + "/GoogleMapsCompatible_Level" + nivel + "/{z}/{y}/{x}." + ext], tileSize: 256, maxzoom: nivel, attribution: "Imágenes NASA GIBS / EOSDIS"}, op: op}; }

  /* ---------- subtipos (Ley 602 art. 36 → subtipo → nivel) ---------- */
  var SUBX = {"tecnológica": [["Explosión / incendio", /explosi|incendio|fuego|llamas/], ["Derrame / contaminación", /derrame|contamin|fuga|gas/], ["Colapso / estructura", /colaps|derrumb|puente|edificio/], ["Intoxicación", /intoxic/], ["Otro", /./]], "antropogénica": [["Accidente de tránsito", /accident|choque|colisi|vuelc|atropell|embarranc/], ["Conflicto / bloqueo", /bloqueo|conflicto|marcha|protesta|paro/], ["Violencia / delito", /asesin|homicid|robo|asalto|detenid|aprehend|secuestr|feminicid/], ["Incendio", /incendio|quema/], ["Otro", /./]]};
  var SUBR = {"geológica": [["Sismo", /sismo|temblor|terremoto/], ["Volcánico", /volc|ceniza/], ["Deslizamiento / derrumbe", /deslizam|derrumb|mazamorra|socav/], ["Otro", /./]], "meteorológica": [["Helada", /helada/], ["Granizada", /granizo/], ["Vientos fuertes", /viento|rafaga/], ["Nevada", /nevada|nieve/], ["Lluvias y tormentas", /tormenta|lluvia|precipit|electric/], ["Temperaturas extremas", /calor|temperatur|frio/], ["Otro", /./]], "hidrológica": [["Inundación", /inundaci|anegam/], ["Crecida / desborde / riada", /desborde|riada|crecida|caudal|rio /], ["Otro", /./]], "climatológica": [["Incendio forestal", /incendio|quema|foco/], ["Sequía", /sequi|spi|deficit/], ["Otro", /./]]};
  function subtipo(e) {
    if (e.tipo) return e.tipo;
    if (T === "biológica") return enfermedad(e.titulo);
    if (e.origen === "sismo" || e.origen === "usgs") return "Sismo";
    if (e.origen === "foco" || e.origen === "complejo") return "Incendio forestal";
    if (e.origen === "sequia") return "Sequía";
    if (e.origen === "caudal") return "Crecida / desborde / riada";
    var L = SUBX[T] || SUBR[T] || [["Otro", /./]], t = norm(e.titulo + " " + (e.detalle || ""));
    for (var i = 0; i < L.length; i++) if (L[i][1].test(t)) return L[i][0];
    return "Otro";
  }
  var NIVSUB = ["Verde / informativo", "Amarillo", "Naranja", "Rojo", "Sin nivel"];
  function subNivel(id, arr) {
    var m = {}, ks = [];
    arr.forEach(function (e) { var k = subtipo(e), n = (e.nivel == null || e.nivel < 0) ? 4 : Math.min(3, e.nivel); if (!m[k]) { m[k] = [0, 0, 0, 0, 0]; ks.push(k); } m[k][n]++; });
    ks.sort(function (a, b) { var f = function (k) { return m[k].reduce(function (x, y) { return x + y; }, 0); }; return f(a) - f(b); });
    var COLS = [COLN[0], COLN[1], COLN[2], COLN[3], "#8896ab"];
    X.chart(id, {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, legend: {top: 0}, grid: {left: 150, right: 20, top: 36, bottom: 16}, xAxis: {type: "value", minInterval: 1}, yAxis: {type: "category", data: ks.length ? ks : ["Sin datos"], axisLabel: {width: 140, overflow: "truncate"}}, series: NIVSUB.map(function (n, i) { return {name: n, type: "bar", stack: "n", data: ks.map(function (k) { return m[k][i]; }), itemStyle: {color: COLS[i]}}; })});
  }

  /* ---------- constructores por tipo ---------- */
  function bGeo() {
    var now = Date.now(), sis = (((D.sismos_oficiales || {}).sismos) || []).map(function (s) { s.ts = new Date(s.fecha_local.replace(" ", "T") + "-04:00").getTime(); return s; }), s7 = sis.filter(function (s) { return s.ts > now - 7 * DIA; }), s30 = sis.filter(function (s) { return s.ts > now - PER * DIA; });
    var mx = s30.reduce(function (a, s) { return Math.max(a, s.mag); }, 0), sen = s30.filter(function (s) { return s.probable_sentido; }), pm = s30.length ? s30.reduce(function (a, s) { return a + s.prof_km; }, 0) / s30.length : 0;
    return {
      kpiF: function () { var now = Date.now(), s7 = s30.filter(function (s) { return s.ts > now - 7 * DIA; }), mx = s30.reduce(function (a, s) { return Math.max(a, s.mag); }, 0), sen = s30.filter(function (s) { return s.probable_sentido; }); return kpi("Sismos en 7 días", s7.length, "Observatorio San Calixto", COL, "pulse") + kpi("Sismos en 30 días", s30.length, "registro oficial", "#a1887f", "list") + kpi("Magnitud máxima (30 d)", mx ? "M " + mx.toFixed(1) : "—", "mayor del período", "#d7263d", "mount") + kpi("Probablemente sentidos", sen.length, "M ≥ 4,0 y prof. ≤ 100 km", "#f26a1b", "shield"); },
      charts: [
        {t: "Magnitud en el tiempo", c: "Cada círculo es un sismo: tamaño = magnitud, color = profundidad.", id: "g1", f: function () { X.chart("g1", {tooltip: {formatter: function (p) { var s = p.data[3]; return "<b>M " + s.mag + "</b><br>" + s.fecha_local + "<br>" + s.provincia + ", " + s.departamento + "<br>prof. " + s.prof_km + " km"; }}, grid: {left: 40, right: 14, top: 10, bottom: 40}, xAxis: {type: "time"}, yAxis: {type: "value", name: "M", min: 1.5}, visualMap: {dimension: 2, min: 0, max: 300, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 110, text: ["profundo", "superficial"], inRange: {color: ["#d7263d", "#f5b700", "#2a7fd1"]}, textStyle: {color: X.css("--mut")}}, series: [{type: "scatter", symbolSize: function (v) { return 5 + Math.pow(v[1], 2) * 1.1; }, data: s30.map(function (s) { return [s.ts, s.mag, s.prof_km, s]; }), itemStyle: {opacity: .85, borderColor: "#fff", borderWidth: 1}}]}); }},
        {t: "Distribución por magnitud", c: "Pocos sismos grandes y muchos pequeños (relación de Gutenberg-Richter).", id: "g2", f: function () { var b = {}; s30.forEach(function (s) { var k = Math.floor(s.mag * 2) / 2; b[k.toFixed(1)] = (b[k.toFixed(1)] || 0) + 1; }); var ks = Object.keys(b).sort(function (a, c) { return a - c; }); X.chart("g2", {tooltip: {trigger: "axis"}, grid: {left: 34, right: 10, top: 14, bottom: 28}, xAxis: {type: "category", data: ks.map(function (k) { return "M " + k; })}, yAxis: {type: "value", minInterval: 1}, series: [{type: "bar", data: ks.map(function (k) { return b[k]; }), itemStyle: {color: COL, borderRadius: [4, 4, 0, 0]}, label: {show: true, position: "top"}}]}); }},
        {t: "Profundidad según magnitud", c: "Los sismos profundos (> 100 km) casi nunca se sienten en superficie.", id: "g3", f: function () { X.chart("g3", {tooltip: {formatter: function (p) { return "M " + p.data[0] + " · " + p.data[1] + " km"; }}, grid: {left: 44, right: 14, top: 10, bottom: 30}, xAxis: {type: "value", name: "Magnitud", min: 1.5}, yAxis: {type: "value", name: "km", inverse: true}, series: [{type: "scatter", symbolSize: 9, data: s30.map(function (s) { return [s.mag, s.prof_km]; }), itemStyle: {color: "#8d6e63", opacity: .75}, markLine: {silent: true, symbol: "none", lineStyle: {color: "#d7263d", type: "dashed"}, data: [{yAxis: 100}], label: {formatter: "100 km"}}}]}); }},
        {t: "Sismos por departamento", c: "Últimos 30 días.", id: "g4", f: function () { barH("g4", contar(s30, function (s) { return s.departamento; }), "#8d6e63"); }},
        {t: "Sismos por día", c: "Últimos 30 días.", id: "g5", f: function () { barDia("g5", s30, function (s) { return s.ts; }, ND, "#a1887f"); }},
        {t: "Hora del día (La Paz)", c: "Distribución horaria de los sismos registrados.", id: "g6", f: function () { var h = []; for (var i = 0; i < 24; i++) h.push(0); s30.forEach(function (s) { h[+s.fecha_local.slice(11, 13)]++; }); X.chart("g6", {tooltip: {}, angleAxis: {type: "category", data: h.map(function (_, i) { return i + "h"; }), axisLabel: {color: X.css("--mut")}}, radiusAxis: {axisLabel: {show: false}}, polar: {radius: "78%"}, series: [{type: "bar", coordinateSystem: "polar", data: h, itemStyle: {color: COL}}]}); }}],
      map: {t: "Mapa de sismos", c: "Círculos de color = Observatorio San Calixto (oficial). Círculos blancos huecos = EMSC (fuente complementaria, incluye sismos de países vecinos). Toque un círculo.", f: function (m) { m.addSource("s", {type: "geojson", data: {type: "FeatureCollection", features: s30.map(function (s) { return {type: "Feature", properties: {mag: s.mag, p: s.prof_km, t: s.fecha_local, l: s.provincia + ", " + s.departamento}, geometry: {type: "Point", coordinates: [s.lon, s.lat]}}; })}}); m.addLayer({id: "s", type: "circle", source: "s", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2, 4, 6, 18], "circle-color": ["interpolate", ["linear"], ["get", "p"], 0, "#d7263d", 100, "#f5b700", 300, "#2a7fd1"], "circle-stroke-color": "#fff", "circle-stroke-width": 1, "circle-opacity": .8}}); var em = nuevo("EMSC").filter(function (x) { return x.lat != null && x.lon != null; }); m.addSource("em", {type: "geojson", data: {type: "FeatureCollection", features: em.map(function (x) { return {type: "Feature", properties: {m: x.mag, r: x.region, t: x.fecha_utc, p: x.prof_km}, geometry: {type: "Point", coordinates: [x.lon, x.lat]}}; })}}); m.addLayer({id: "em", type: "circle", source: "em", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "m"], 2, 3, 6, 14], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.6, "circle-opacity": .9}}); m.pop("em", function (p) { return "<b>EMSC M " + p.m + "</b>" + S.esc(p.r) + "<br>" + p.t + " · " + p.p + " km (fuente complementaria)"; });
      capaMun(m, "ms", s30.map(function (s) { return [s.lon, s.lat, 1]; }), "#8d6e63", "s"); ctrl(m, [{id: "mm", label: "Sismos por municipio (30 d)", layers: ["msf", "msl"]}, {id: "sc", label: "Sismos San Calixto", layers: ["s"]}, {id: "se", label: "Sismos EMSC", layers: ["em"]}]);
      m.pop("s", function (p) { return "<b>Sismo M " + p.mag + "</b>" + S.esc(p.l) + "<br>" + p.t + " · " + p.p + " km"; }); }},
      vig: {t: "Sismos del período · " + PL, h: '<div class="sx-ctl"><label>Ordenar <select id="sSort"><option value="t">Más recientes</option><option value="m">Mayor magnitud</option><option value="p">Más superficiales</option></select></label><label>Magnitud <select id="sMin"><option value="0">Todas</option><option value="3">≥ 3</option><option value="4">≥ 4</option></select></label><label>Profundidad <select id="sProf"><option value="">Todas</option><option value="s">Superficial (&lt; 70 km)</option><option value="i">Intermedia (70–300)</option><option value="p">Profunda (&gt; 300)</option></select></label><label>Departamento <select id="sDep"><option value="">Todos</option>' + S.DEPS.map(function (d) { return '<option>' + d + '</option>'; }).join("") + '</select></label><label class="ck"><input type="checkbox" id="sSen"> Solo probablemente sentidos</label></div><div class="nota" id="sRes"></div><div id="sLista" class="sx-lista"></div>', hook: function (B) {
        var ALL = s30.slice(), F = [];
        function filtra() { var mn = +$("sMin").value, pf = $("sProf").value, dp = $("sDep").value, sn = $("sSen").checked; return ALL.filter(function (x) { return x.mag >= mn && (!dp || x.departamento === dp) && (!sn || x.probable_sentido) && (!pf || (pf === "s" ? x.prof_km < 70 : pf === "i" ? (x.prof_km >= 70 && x.prof_km <= 300) : x.prof_km > 300)); }); }
        function pinta(redibuja) {
          F = filtra(); var o = $("sSort").value, L = F.slice().sort(function (a, b) { return o === "m" ? b.mag - a.mag : o === "p" ? a.prof_km - b.prof_km : b.ts - a.ts; });
          $("sRes").textContent = "Mostrando " + F.length + " de " + ALL.length + " sismos del período" + (F.length ? " · M máx. " + Math.max.apply(null, F.map(function (x) { return x.mag; })).toFixed(1) : "");
          $("sLista").innerHTML = L.length ? L.slice(0, 40).map(function (x) { var sen = x.probable_sentido; return '<a class="alert sx" data-i="' + ALL.indexOf(x) + '" style="--c:' + (sen ? "#f26a1b" : "#8d6e63") + ';color:inherit;text-decoration:none;cursor:pointer"><div style="flex:1"><div class="t"><b>M ' + x.mag.toFixed(1) + '</b> · ' + S.esc(x.provincia || "") + ', ' + S.esc(x.departamento) + (sen ? ' <span class="badge" style="background:#f26a1b">probablemente sentido</span>' : '') + '</div><div class="m">' + x.fecha_local + ' · prof. ' + x.prof_km + ' km</div></div></a>'; }).join("") : '<p class="nota">Sin sismos con ese filtro en el período.</p>';
          if (redibuja) { s30.length = 0; F.forEach(function (x) { s30.push(x); }); B.charts.forEach(function (c) { c.f(); }); var gk = document.querySelector(".grid.g4"); if (gk && B.kpiF) gk.innerHTML = B.kpiF(); var m = (window.__mapas || {}).mmap; if (m && m.getSource("s")) m.getSource("s").setData({type: "FeatureCollection", features: F.map(function (s) { return {type: "Feature", properties: {mag: s.mag, p: s.prof_km, t: s.fecha_local, l: s.provincia + ", " + s.departamento}, geometry: {type: "Point", coordinates: [s.lon, s.lat]}}; })}); }
        }
        ["sMin", "sProf", "sDep", "sSen"].forEach(function (i) { $(i).onchange = function () { pinta(true); }; }); $("sSort").onchange = function () { pinta(false); }; pinta(false);
        $("sLista").onclick = function (e) { var a = e.target.closest(".sx"); if (!a) return; var x = ALL[+a.dataset.i], m = (window.__mapas || {}).mmap; if (m) { m.flyTo({center: [x.lon, x.lat], zoom: 8, duration: 900}); new maplibregl.Popup().setLngLat([x.lon, x.lat]).setHTML('<div class="pop"><b>M ' + x.mag + '</b>' + S.esc(x.provincia + ", " + x.departamento) + '<br>' + x.fecha_local + ' · ' + x.prof_km + ' km</div>').addTo(m); } };
      }},      reg: evs(function (e) { return e.origen !== "sismo"; })
    };
  }
  function bMeteo() {
    var AV = avisosSen().filter(function (a) { return a._t === "meteorológica"; }), vig = AV.filter(function (a) { return a._v; }), now = Date.now();
    var raf = {}; evs(function (e) { return e.origen === "modelo"; }).forEach(function (e) { var m = /(\d+(?:\.\d+)?) km\/h/.exec(e.titulo); if (m && e.lugar) raf[e.lugar] = Math.max(raf[e.lugar] || 0, +m[1]); });
    var nivMax = vig.reduce(function (a, x) { return Math.max(a, x._n); }, -1), nmun = {}; vig.forEach(function (a) { (a.municipios || []).forEach(function (m) { nmun[m] = 1; }); });
    var ALLAV = AV.slice();
    return {
      filtros: filtrosAvisos(ALLAV, AV, vig, true),
      kpiF: function () { var nivMax = vig.reduce(function (a, x) { return Math.max(a, x._n); }, -1), nmun = {}; vig.forEach(function (a) { (a.municipios || []).forEach(function (m) { nmun[m] = 1; }); }); return kpi("Avisos vigentes", vig.length, "SENAMHI meteorológicos", COL, "shield") + kpi("Nivel más alto vigente", nivMax >= 0 ? NIVT[nivMax] : "Sin aviso", "escala del aviso SENAMHI", nivMax >= 0 ? COLN[nivMax] : "#2e9e5b", "sun") + kpi("Municipios con aviso", Object.keys(nmun).length, "en avisos vigentes", "#1d6fb8", "map") + kpi("Avisos en 30 días", AV.filter(function (a) { return Date.parse((a.publicada || "").replace(" ", "T")) > now - PER * DIA; }).length, "emitidos", "#5c6bc0", "list"); },
      charts: [
        {t: "Fenómenos × nivel de aviso", c: "Avisos de los últimos 60 días.", id: "m1", f: function () { var fen = {}; AV.forEach(function (a) { var f = (a.fenomeno || "Otro").trim(); fen[f] = fen[f] || [0, 0, 0, 0]; if (a._n >= 0) fen[f][a._n]++; }); var ks = Object.keys(fen); X.chart("m1", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, legend: {top: 0}, grid: {left: 150, right: 14, top: 36, bottom: 14}, xAxis: {type: "value", minInterval: 1}, yAxis: {type: "category", data: ks, axisLabel: {width: 140, overflow: "truncate"}}, series: [1, 2, 3].map(function (n) { return {name: NIVT[n], type: "bar", stack: "n", data: ks.map(function (k) { return fen[k][n]; }), itemStyle: {color: COLN[n]}}; })}); }},
        {t: "Línea de tiempo de avisos", c: "Cada barra es un aviso, de su inicio a su fin (color = nivel).", id: "m2", f: function () { var L = AV.filter(function (a) { return a.inicio && a.fin; }).sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; }).slice(0, 14).reverse(); X.chart("m2", {tooltip: {formatter: function (p) { var a = L[p.dataIndex]; return "<b>" + S.esc(a.titulo || "") + "</b><br>" + a.inicio + " → " + a.fin + "<br>Nivel " + (a.nivel || ""); }}, grid: {left: 70, right: 14, top: 10, bottom: 30}, xAxis: {type: "time"}, yAxis: {type: "category", data: L.map(function (a) { return "N° " + (a.numero || ""); })}, series: [{type: "custom", renderItem: function (p, api) { var y = api.value(0), s = api.coord([api.value(1), y]), e = api.coord([api.value(2), y]), h = api.size([0, 1])[1] * .62; return {type: "rect", shape: {x: s[0], y: s[1] - h / 2, width: Math.max(4, e[0] - s[0]), height: h, r: 4}, style: api.style()}; }, encode: {x: [1, 2], y: 0}, data: L.map(function (a, i) { return {value: [i, new Date(a.inicio + "T00:00:00-04:00").getTime(), new Date(a.fin + "T23:59:00-04:00").getTime()], itemStyle: {color: COLN[Math.max(0, a._n)]}}; })}]}); }},
        {t: "Departamentos con avisos", c: "Número de avisos (60 días) que incluyen cada departamento.", id: "m3", f: function () { barH("m3", contar(AV, function (a) { return a.departamentos || []; }), "#1e88e5"); }},
        {t: "Alcance de cada aviso (municipios)", c: "Cuántos municipios abarca cada aviso reciente.", id: "m4", f: function () { var L = AV.slice().sort(function (a, b) { return (b.n_municipios || 0) - (a.n_municipios || 0); }).slice(0, 10).reverse(); X.chart("m4", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, grid: {left: 150, right: 30, top: 8, bottom: 18}, xAxis: {type: "value"}, yAxis: {type: "category", data: L.map(function (a) { return (a.fenomeno || "Aviso").trim().slice(0, 24) + " N° " + (a.numero || ""); }), axisLabel: {width: 140, overflow: "truncate"}}, series: [{type: "bar", data: L.map(function (a) { return {value: +a.n_municipios || 0, itemStyle: {color: COLN[Math.max(0, a._n)]}}; }), label: {show: true, position: "right"}}]}); }},
        {t: "Ráfagas pronosticadas por departamento", c: "Modelo Open-Meteo (km/h, próximos días). No es un aviso oficial.", id: "m5", f: function () { barH("m5", raf, "#5c6bc0"); }},
        {t: "Avisos por semana", c: "Emitidos por el SENAMHI (12 semanas).", id: "m6", f: function () { var w = {}; AV.forEach(function (a) { var t = Date.parse((a.publicada || "").replace(" ", "T")); if (isNaN(t)) return; var k = S.diaKey(t - ((new Date(t).getDay() + 6) % 7) * DIA).slice(5); w[k] = (w[k] || 0) + 1; }); var ks = Object.keys(w).sort(); X.chart("m6", {tooltip: {trigger: "axis"}, grid: {left: 30, right: 10, top: 14, bottom: 28}, xAxis: {type: "category", data: ks}, yAxis: {type: "value", minInterval: 1}, series: [{type: "line", smooth: true, areaStyle: {opacity: .35}, data: ks.map(function (k) { return w[k]; }), itemStyle: {color: COL}}]}); }}],
      map: {t: "Municipios con aviso SENAMHI vigente", c: "Color = nivel del aviso. Gris = sin aviso.", f: function (m) { var niv = {}; vig.forEach(function (a) { (a.municipios || []).forEach(function (t) { if (niv[t] == null || a._n > niv[t]) niv[t] = a._n; }); }); var g = geoCopia(D.geoMun); g.features.forEach(function (f) { var v = niv[f.properties.n + " (" + f.properties.d + ")"]; f.properties.niv = v == null ? -1 : v; }); m.getSource("mun").setData(g); m.addLayer({id: "mf", type: "fill", source: "mun", paint: {"fill-color": ["match", ["get", "niv"], 0, "#bfe5c9", 1, "#f9dc6b", 2, "#f7a15e", 3, "#e5576a", "rgba(0,0,0,0)"], "fill-opacity": .72}}); m.addLayer({id: "ml", type: "line", source: "mun", paint: {"line-color": "#7b8aa3", "line-width": .4, "line-opacity": .5}}); m.pop("mf", function (p) { return "<b>" + S.esc(p.n) + "</b>" + S.esc(p.d) + "<br>" + (p.niv >= 0 ? "Aviso " + NIVT[p.niv].toLowerCase() : "Sin aviso vigente"); }); }},
      vig: {t: "Avisos meteorológicos vigentes", h: '<div id="aLista">' + (vig.length ? vig.map(function (a) { return '<a class="alert" href="' + S.esc(S.urlOk(a.pdf || a.url)) + '" target="_blank" rel="noopener" style="--c:' + COLN[Math.max(0, a._n)] + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(a.titulo) + '</div><div class="m">Vigente ' + S.esc(a.inicio || "") + ' → ' + S.esc(a.fin || "") + ' · ' + S.esc((a.departamentos || []).join(", ")) + ' · ' + (a.n_municipios || 0) + ' municipios</div></div><span class="badge b' + Math.max(0, a._n) + '">' + (NIVT[Math.max(0, a._n)]) + '</span></a>'; }).join("") : '<p class="nota">No hay avisos meteorológicos vigentes del SENAMHI.</p>') + '</div>'},
      reg: evs(function (e) { return e.origen !== "senamhi"; })
    };
  }
  function bHidro() {
    var AV = avisosSen().filter(function (a) { return a._t === "hidrológica"; }), vig = AV.filter(function (a) { return a._v; }), R = ((D.caudales || {}).puntos) || [];
    R.forEach(function (r) { var i = r.fechas ? r.fechas.indexOf(r.hoy) : -1; r._i = i >= 0 ? i : (r.fechas ? r.fechas.length - 1 : 0); });
    var sobre = R.filter(function (r) { return (r.nivel || 0) >= 1; }), p90 = R.filter(function (r) { return (r.ratio_p90_max_10d || 0) >= 1; });
    var ALLAV = AV.slice();
    return {
      filtros: filtrosAvisos(ALLAV, AV, vig, false),
      kpiF: function () {  return kpi("Avisos hidrológicos vigentes", vig.length, "SENAMHI", COL, "water") + kpi("Ríos monitoreados", R.length, "modelo GloFAS (9 puntos)", "#1d6fb8", "wave") + kpi("Ríos sobre la mediana", sobre.length, "caudal por encima de lo normal", "#f5b700", "pulse") + kpi("Ríos sobre el umbral P90", p90.length, "posible crecida", p90.length ? "#d7263d" : "#2e9e5b", "shield"); },
      charts: [
        {t: "Caudal máximo (10 días) respecto al umbral alto", c: "1,0 = umbral P90 (1993–2022). Sobre 1,0 = caudal excepcionalmente alto.", id: "h1", f: function () { var L = R.slice().sort(function (a, b) { return (a.ratio_p90_max_10d || 0) - (b.ratio_p90_max_10d || 0); }); X.chart("h1", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, grid: {left: 130, right: 30, top: 8, bottom: 18}, xAxis: {type: "value", min: 0}, yAxis: {type: "category", data: L.map(function (r) { return r.nombre; })}, series: [{type: "bar", data: L.map(function (r) { return {value: r.ratio_p90_max_10d || 0, itemStyle: {color: (r.ratio_p90_max_10d || 0) >= 1 ? "#d7263d" : (r.ratio_p90_max_10d || 0) >= .75 ? "#f5b700" : "#2a9d8f"}}; }), label: {show: true, position: "right", formatter: function (p) { return p.value.toFixed(2); }}, markLine: {silent: true, symbol: "none", lineStyle: {color: "#d7263d", type: "dashed"}, data: [{xAxis: 1}], label: {formatter: "P90"}}}]}); }},
        {t: "Caudal del río seleccionado", c: "", extra: '<select id="selRio" style="margin-bottom:6px"></select>', id: "h2", f: function () { var s = $("selRio"); R.forEach(function (r, i) { var o = document.createElement("option"); o.value = i; o.textContent = r.rio + " — " + r.nombre; s.appendChild(o); }); function draw() { var r = R[+s.value || 0]; if (!r) return; X.chart("h2", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 52, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: r.fechas.map(function (f) { return f.slice(5); })}, yAxis: {type: "value", name: "m³/s"}, series: [{name: "Caudal", type: "line", smooth: true, data: r.caudal_m3s, itemStyle: {color: "#1d6fb8"}, areaStyle: {opacity: .25}}, {name: "Mediana (P50)", type: "line", data: r.p50, symbol: "none", lineStyle: {type: "dashed", color: "#2a9d8f"}}, {name: "Umbral alto (P90)", type: "line", data: r.p90, symbol: "none", lineStyle: {type: "dashed", color: "#d7263d"}}]}); } s.onchange = draw; draw(); }},
        {t: "Caudal de hoy frente a lo normal", c: "Barras agrupadas por río (m³/s).", id: "h3", f: function () { X.chart("h3", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 46, right: 10, top: 34, bottom: 56}, xAxis: {type: "category", data: R.map(function (r) { return r.nombre; }), axisLabel: {rotate: 35, interval: 0}}, yAxis: {type: "value"}, series: [{name: "Hoy", type: "bar", data: R.map(function (r) { return r.caudal_m3s ? r.caudal_m3s[r._i] : 0; }), itemStyle: {color: "#1d6fb8"}}, {name: "Mediana", type: "bar", data: R.map(function (r) { return r.p50 ? r.p50[r._i] : 0; }), itemStyle: {color: "#2a9d8f"}}, {name: "P90", type: "bar", data: R.map(function (r) { return r.p90 ? r.p90[r._i] : 0; }), itemStyle: {color: "#d7263d"}}]}); }},
        {t: "Avisos hidrológicos por nivel", c: "Últimos 60 días.", id: "h4", f: function () { var o = contar(AV, function (a) { return a._n >= 0 ? NIVT[a._n] : "Sin nivel"; }); pie("h4", o, {"Amarilla": COLN[1], "Naranja": COLN[2], "Roja": COLN[3], "Verde": COLN[0]}); }},
        {t: "Departamentos con avisos hidrológicos", c: "Número de avisos que los incluyen.", id: "h5", f: function () { barH("h5", contar(AV, function (a) { return a.departamentos || []; }), "#00897b"); }},
        {t: "Notas de prensa sobre crecidas e inundaciones", c: "Por día (30 días). Preliminar: no verificadas.", id: "h6", f: function () { barDia("h6", evs(function (e) { return e.origen === "prensa"; }), function (e) { return e.ts; }, ND, "#26a69a"); }}],
      map: {t: "Ríos monitoreados y municipios con aviso", c: "Círculo = punto de río (color = estado). Fondo = aviso hidrológico vigente.", f: function (m) { var niv = {}; vig.forEach(function (a) { (a.municipios || []).forEach(function (t) { if (niv[t] == null || a._n > niv[t]) niv[t] = a._n; }); }); var g = geoCopia(D.geoMun); g.features.forEach(function (f) { var v = niv[f.properties.n + " (" + f.properties.d + ")"]; f.properties.niv = v == null ? -1 : v; }); m.getSource("mun").setData(g); m.addLayer({id: "mf", type: "fill", source: "mun", paint: {"fill-color": ["match", ["get", "niv"], 0, "#bfe5c9", 1, "#f9dc6b", 2, "#f7a15e", 3, "#e5576a", "rgba(0,0,0,0)"], "fill-opacity": .6}}); m.addSource("r", {type: "geojson", data: {type: "FeatureCollection", features: R.map(function (r) { return {type: "Feature", properties: {n: r.nombre, r: r.rio, e: r.estado, v: r.nivel || 0}, geometry: {type: "Point", coordinates: [r.lon, r.lat]}}; })}}); m.addLayer({id: "r", type: "circle", source: "r", paint: {"circle-radius": 9, "circle-color": ["match", ["get", "v"], 0, "#2a9d8f", 1, "#f5b700", 2, "#f26a1b", "#d7263d"], "circle-stroke-color": "#fff", "circle-stroke-width": 2}}); m.pop("r", function (p) { return "<b>" + S.esc(p.r) + " — " + S.esc(p.n) + "</b>" + S.esc(p.e); }); }},
      vig: {t: "Avisos hidrológicos vigentes y ríos en observación", h: '<div id="aLista">' + (vig.length ? vig.map(function (a) { return '<a class="alert" href="' + S.esc(S.urlOk(a.pdf || a.url)) + '" target="_blank" rel="noopener" style="--c:' + COLN[Math.max(0, a._n)] + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(a.titulo) + '</div><div class="m">Vigente ' + S.esc(a.inicio || "") + ' → ' + S.esc(a.fin || "") + ' · ' + S.esc((a.departamentos || []).join(", ")) + '</div></div><span class="badge b' + Math.max(0, a._n) + '">' + NIVT[Math.max(0, a._n)] + '</span></a>'; }).join("") : '<p class="nota">No hay avisos hidrológicos vigentes del SENAMHI.</p>') + '</div>' + sobre.map(function (r) { return '<div class="alert" style="--c:#f5b700"><div style="flex:1"><div class="t">' + S.esc(r.rio) + ' — ' + S.esc(r.nombre) + '</div><div class="m">' + S.esc(r.estado) + ' (modelo GloFAS)</div></div></div>'; }).join("")},
      reg: evs(function (e) { return e.origen !== "senamhi" && e.origen !== "caudal"; })
    };
  }
  function bClima() {
    var P = (D.focos_puntos && D.focos_puntos.puntos) || [], dd = (D.focos_puntos && D.focos_puntos.dias) || [], u = dd[dd.length - 1], ult3 = dd.slice(-3), SQ = (D.sequia && D.sequia.departamentos) || {};
    var hoy = P.filter(function (p) { return p[3] === u; }), cp = (D.focos_complejos && D.focos_complejos.complejos) || [], seq = Object.keys(SQ).filter(function (k) { return SQ[k].spi3 != null && SQ[k].spi3 <= -1; });
    var frp = hoy.reduce(function (a, p) { return a + p[2]; }, 0);
    function spiCol(v) { return v == null ? "#9aa7ba" : v <= -2 ? "#c0392b" : v <= -1.5 ? "#ef8a3b" : v <= -1 ? "#f7c873" : v < 1 ? "#9fb3cc" : v < 1.5 ? "#8fc0e8" : "#3b82c4"; }
    var ALLP = P.slice(), ALLCP = cp.slice(), UL = ult3.slice();
    var depsC = {}; ALLP.forEach(function (p) { depsC[p[4]] = 1; });
    return {
      filtros: {ctl: [{id: "per", l: "Período de focos", o: [["3", "Últimos 3 días"], ["1", "Último día"], ["7", "Todo el período disponible"]]}, {id: "dep", l: "Departamento", o: [["", "Todos"]].concat(Object.keys(depsC).sort().map(function (d) { return [d, d]; }))}, {id: "frp", l: "Potencia mínima", o: [["0", "Todos los focos"], ["10", "≥ 10 MW"], ["30", "≥ 30 MW"], ["100", "≥ 100 MW"]]}],
        aplica: function (v) { ult3 = v.per === "7" ? dd.slice() : dd.slice(-(+v.per || 3)); var mn = +v.frp || 0; P.length = 0; ALLP.forEach(function (p) { if ((!v.dep || p[4] === v.dep) && p[2] >= mn) P.push(p); }); cp.length = 0; ALLCP.forEach(function (c) { if (!v.dep || c.departamento === v.dep) cp.push(c); });
          var n = P.filter(function (p) { return ult3.indexOf(p[3]) >= 0; }); return "Mostrando " + n.length.toLocaleString("es-BO") + " focos en " + ult3.length + " día(s)" + (v.dep ? " · " + v.dep : "") + (mn ? " · potencia ≥ " + mn + " MW" : "") + " · " + cp.length + " complejos"; },
        mapa: function (m) { if (m.getSource("f")) m.getSource("f").setData({type: "FeatureCollection", features: P.filter(function (p) { return ult3.indexOf(p[3]) >= 0; }).map(function (p) { return {type: "Feature", properties: {frp: p[2]}, geometry: {type: "Point", coordinates: [p[1], p[0]]}}; })}); if (m.getSource("c")) m.getSource("c").setData({type: "FeatureCollection", features: cp.map(function (c) { return {type: "Feature", properties: {n: c.n, l: c.municipio + ", " + c.departamento, frp: c.frp_mw}, geometry: {type: "Point", coordinates: [c.lon, c.lat]}}; })}); }},
      kpiF: function () { var hoy = P.filter(function (p) { return p[3] === u; }), frp = hoy.reduce(function (a, p) { return a + p[2]; }, 0); return kpi("Focos de calor (último día)", hoy.length.toLocaleString("es-BO"), "NASA FIRMS · " + (u || ""), COL, "fire") + kpi("Potencia radiativa (último día)", Math.round(frp).toLocaleString("es-BO") + " MW", "suma de focos", "#d7263d", "pulse") + kpi("Complejos de incendio", cp.length, "grupos de focos vecinos", "#f26a1b", "map") + kpi("Departamentos con sequía (SPI-3 ≤ −1)", seq.length, seq.join(", ") || "Sin déficit relevante", seq.length ? "#ef8a3b" : "#2e9e5b", "sun"); },
      charts: [
        {t: "Focos de calor por día", c: "Barras = número de focos; línea = potencia radiativa (MW).", id: "k1", f: function () { var n = {}, w = {}; P.forEach(function (p) { n[p[3]] = (n[p[3]] || 0) + 1; w[p[3]] = (w[p[3]] || 0) + p[2]; }); X.chart("k1", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 44, right: 44, top: 34, bottom: 28}, xAxis: {type: "category", data: dd.map(function (d) { return d.slice(5); })}, yAxis: [{type: "value"}, {type: "value"}], series: [{name: "Focos", type: "bar", data: dd.map(function (d) { return n[d] || 0; }), itemStyle: {color: "#f03b20", borderRadius: [4, 4, 0, 0]}}, {name: "MW", type: "line", yAxisIndex: 1, smooth: true, data: dd.map(function (d) { return Math.round(w[d] || 0); }), itemStyle: {color: "#6a1b9a"}}]}); }},
        {t: "Focos por departamento (3 días)", c: "Detecciones de los últimos tres días.", id: "k2", f: function () { barH("k2", contar(P.filter(function (p) { return ult3.indexOf(p[3]) >= 0; }), function (p) { return p[4]; }), "#ef6c00"); }},
        {t: "Municipios con más focos (3 días)", c: "Los diez con más detecciones.", id: "k3", f: function () { barH("k3", contar(P.filter(function (p) { return ult3.indexOf(p[3]) >= 0; }), function (p) { return p[5] + " (" + p[4].slice(0, 3) + ")"; }), "#d7263d", 10); }},
        {t: "Sequía por departamento (SPI-3)", c: "Rojo/naranja = déficit de lluvia; azul = húmedo (método OMM).", id: "k4", f: function () { var ks = Object.keys(SQ).sort(function (a, b) { return (SQ[a].spi3 || 0) - (SQ[b].spi3 || 0); }); X.chart("k4", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}, formatter: function (p) { var d = SQ[p[0].name]; return "<b>" + p[0].name + "</b><br>SPI-3: " + p[0].value + " (" + (d.clase3 || "") + ")<br>Lluvia del mes: " + d.pct_normal + " % de lo normal"; }}, grid: {left: 90, right: 24, top: 8, bottom: 18}, xAxis: {type: "value", min: -3, max: 3}, yAxis: {type: "category", data: ks}, series: [{type: "bar", data: ks.map(function (k) { return {value: SQ[k].spi3, itemStyle: {color: spiCol(SQ[k].spi3)}}; }), label: {show: true, position: "right", formatter: function (p) { return (+p.value).toFixed(1); }}}]}); }},
        {t: "Historia del SPI-3 del departamento", c: "", extra: '<select id="selDep" style="margin-bottom:6px"></select>', id: "k5", f: function () { var s = $("selDep"); Object.keys(SQ).forEach(function (k) { var o = document.createElement("option"); o.textContent = k; s.appendChild(o); }); function draw() { var d = SQ[s.value]; if (!d || !d.serie_spi3) return; X.chart("k5", {tooltip: {trigger: "axis"}, grid: {left: 36, right: 12, top: 12, bottom: 28}, xAxis: {type: "category", data: d.serie_spi3.map(function (x) { return x[0]; })}, yAxis: {type: "value", min: -3, max: 3}, visualMap: {show: false, pieces: [{lte: -2, color: "#c0392b"}, {gt: -2, lte: -1, color: "#ef8a3b"}, {gt: -1, lt: 1, color: "#9fb3cc"}, {gte: 1, color: "#3b82c4"}], seriesIndex: 0}, series: [{type: "bar", data: d.serie_spi3.map(function (x) { return x[1]; })}]}); } s.onchange = draw; draw(); }},
        {t: "Departamento × día (focos)", c: "Mapa de calor de detecciones.", id: "k6", f: function () { var deps = S.DEPS, c = {}; P.forEach(function (p) { var k = p[4] + "|" + p[3]; c[k] = (c[k] || 0) + 1; }); var data = [], mx = 1; deps.forEach(function (d, y) { dd.forEach(function (f, x) { var v = c[d + "|" + f] || 0; mx = Math.max(mx, v); data.push([x, y, v || null]); }); }); X.chart("k6", {tooltip: {formatter: function (p) { return deps[p.value[1]] + " · " + dd[p.value[0]] + ": <b>" + (p.value[2] || 0) + "</b>"; }}, grid: {left: 84, right: 10, top: 6, bottom: 50}, xAxis: {type: "category", data: dd.map(function (d) { return d.slice(5); })}, yAxis: {type: "category", data: deps}, visualMap: {min: 0, max: mx, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 100, inRange: {color: ["#fff3cd", "#fd8d3c", "#bd0026", "#4a0014"]}, textStyle: {color: X.css("--mut")}}, series: [{type: "heatmap", data: data, itemStyle: {borderColor: X.css("--card"), borderWidth: 2, borderRadius: 3}}]}); }}],
      map: {t: "Focos de calor, complejos y sequía", c: "Mapa de calor (3 días, NASA) · círculos rojos = complejos · puntos celestes = focos GOES (INPE, cada 10 min). Use el panel «Capas» para ver focos por municipio, imagen NASA con fecha y sequía.", f: function (m) { var g = geoCopia(D.geoDep); g.features.forEach(function (f) { var d = SQ[f.properties.n]; f.properties.c = spiCol(d ? d.spi3 : null); }); m.getSource("dep").setData(g); m.addLayer({id: "df", type: "fill", source: "dep", paint: {"fill-color": ["get", "c"], "fill-opacity": .45}}); m.addSource("f", {type: "geojson", data: {type: "FeatureCollection", features: P.filter(function (p) { return ult3.indexOf(p[3]) >= 0; }).map(function (p) { return {type: "Feature", properties: {frp: p[2]}, geometry: {type: "Point", coordinates: [p[1], p[0]]}}; })}}); m.addLayer({id: "heat", type: "heatmap", source: "f", maxzoom: 11, paint: {"heatmap-weight": ["interpolate", ["linear"], ["get", "frp"], 0, .25, 30, 1], "heatmap-radius": 14, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,255,178,0)", .2, "rgba(254,217,118,.6)", .5, "#fd8d3c", .8, "#e31a1c", 1, "#7a0026"]}}); m.addSource("c", {type: "geojson", data: {type: "FeatureCollection", features: cp.map(function (c) { return {type: "Feature", properties: {n: c.n, l: c.municipio + ", " + c.departamento, frp: c.frp_mw}, geometry: {type: "Point", coordinates: [c.lon, c.lat]}}; })}}); m.addLayer({id: "c", type: "circle", source: "c", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "n"], 8, 7, 120, 20], "circle-color": "rgba(215,38,61,.15)", "circle-stroke-color": "#d7263d", "circle-stroke-width": 2.5}}); var gs = {}; nuevo("INPE").forEach(function (g) { var k = g.lat.toFixed(3) + "," + g.lon.toFixed(3); if (!gs[k] || g.hora_gmt > gs[k].hora_gmt) gs[k] = g; }); var goes = Object.keys(gs).map(function (k) { return gs[k]; }); m.addSource("go", {type: "geojson", data: {type: "FeatureCollection", features: goes.map(function (g) { return {type: "Feature", properties: {h: g.hora_gmt, s: g.satelite}, geometry: {type: "Point", coordinates: [g.lon, g.lat]}}; })}}); m.addLayer({id: "go", type: "circle", source: "go", paint: {"circle-radius": 5, "circle-color": "#00e5ff", "circle-stroke-color": "#003c47", "circle-stroke-width": 1.5, "circle-opacity": .9}}); m.pop("go", function (p) { return "<b>Foco GOES (cada 10 min)</b>" + p.s + "<br>" + p.h + " GMT · INPE"; });
      m.pop("c", function (p) { return "<b>Complejo de focos</b>" + S.esc(p.l) + "<br>" + p.n + " detecciones · " + p.frp + " MW"; });
      var pm = P.filter(function (p) { return ult3.indexOf(p[3]) >= 0; }).map(function (p) { return [p[1], p[0], 1]; }); capaMun(m, "mc", pm, "#e65100", "heat");
      var hoyUTC = new Date(Date.now() - 864e5), f0 = hoyUTC.toISOString().slice(0, 10), ctl = ctrl(m, [{id: "sp", label: "Sequía SPI-3 (departamentos)", layers: ["df"], on: false}, {id: "mc", label: "Focos por municipio (3 días)", layers: ["mcf", "mcl"]}, {id: "hm", label: "Mapa de calor NASA (3 días)", layers: ["heat"]}, {id: "cp", label: "Complejos de incendio", layers: ["c"]}, {id: "go", label: "Focos GOES (cada 10 min)", layers: ["go"]}], '<hr><b>Imagen NASA (VIIRS)</b><label><input type="checkbox" id="gTc"> Color verdadero</label><label><input type="checkbox" id="gTa"> Anomalías térmicas NASA</label><label>Fecha <input type="range" id="gF" min="0" max="7" value="1" style="width:110px"> <span id="gFt">' + f0 + '</span></label>');
      function aplicaG() { var d = new Date(Date.now() - (+ctl.querySelector("#gF").value) * 864e5).toISOString().slice(0, 10); ctl.querySelector("#gFt").textContent = d;
        [["gTc", gibs(m, d, "VIIRS_SNPP_CorrectedReflectance_TrueColor", "jpg", 9, 1), "heat"], ["gTa", gibs(m, d, "VIIRS_NOAA20_Thermal_Anomalies_375m_All", "png", 9, .9), "c"]].forEach(function (x) { var id = x[1].id; if (m.getLayer(id)) m.removeLayer(id); if (m.getSource(id)) m.removeSource(id); if (ctl.querySelector("#" + x[0]).checked) { m.addSource(id, x[1].src); m.addLayer({id: id, type: "raster", source: id, paint: {"raster-opacity": x[1].op}}, x[2] === "heat" ? "mcf" : "heat"); } }); }
      ["gTc", "gTa", "gF"].forEach(function (i) { ctl.querySelector("#" + i).addEventListener("input", aplicaG); }); }},
      vig: {t: "Complejos de incendio mayores y sequía", h: cp.slice(0, 8).map(function (c) { return '<a class="alert" href="evento.html?id=' + encodeURIComponent("complejo:" + c.id + ":" + c.departamento) + '" style="--c:#d7263d;color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(c.municipio) + ', ' + S.esc(c.departamento) + '</div><div class="m">' + c.n + ' detecciones · ' + c.frp_mw + ' MW</div></div></a>'; }).join("") + (seq.length ? '<div class="alert" style="--c:#ef8a3b"><div style="flex:1"><div class="t">Déficit de lluvia (SPI-3 ≤ −1)</div><div class="m">' + S.esc(seq.join(", ")) + '</div></div></div>' : ''), },
      reg: evs(function (e) { return e.origen !== "foco" && e.origen !== "sequia"; })
    };
  }
  /* ---- biológica: vigilancia oficial separada de la prensa ---- */
  var ENF = [["Dengue", /dengue/], ["Chikungunya", /chikungunya/], ["Ébola", /ebola/], ["Sarampión", /sarampi|measles/], ["Influenza", /influenza|gripe|h5n1|ah5/], ["Coxsackie", /coxsackie/], ["Rabia", /rabia/], ["Fiebre amarilla", /fiebre amarilla/], ["Tosferina", /tosferina|coqueluche|pertussis/], ["Difteria", /difteria/], ["Mpox", /mpox/], ["Miasis", /miasis|cochliomyia/], ["MERS-CoV", /mers|middle east respiratory/], ["Neumonía", /pneumonia|neumonia/], ["Dermatofilosis", /dermatofilosis/], ["Intoxicación", /intoxicaci/]];
  function enfermedad(t) { t = norm(t); for (var i = 0; i < ENF.length; i++) if (ENF[i][1].test(t)) return ENF[i][0]; return "Otra / sin especificar"; }
  function claseOps(x) {
    var t = norm((x.titulo || "") + " " + (x.resumen || "")), f = norm(x.fuente || "");
    var tipo = /alerta epidemiologica/.test(t) ? "Alerta epidemiológica" : /actualizacion epidemiologica/.test(t) ? "Actualización epidemiológica" : /nota informativa/.test(t) ? "Nota informativa" : /oms|disease outbreak/.test(f) ? "Brote (OMS)" : "Publicación";
    var dias = (Date.now() - Date.parse(x.fecha)) / DIA, vig = dias <= 60, bol = /bolivia/.test(t), reg = /americas|brasil|peru|argentina|chile|paraguay/.test(t);
    return {tipo: tipo, enf: enfermedad(x.titulo + " " + (x.resumen || "")), vig: vig, bol: bol, reg: reg, dias: Math.round(dias), prio: (bol && vig) || (tipo === "Alerta epidemiológica" && vig && reg) ? "Alta" : (vig && (reg || tipo === "Alerta epidemiológica")) ? "Media" : "Baja"};
  }
  var PRIOC = {Alta: "#d7263d", Media: "#f5a000", Baja: "#7a8aa3"};
  function bBio() {
    var O = D.epidemio_oficial || {}, ecdc = nuevo("ECDC").concat([]).concat(((D.nuevas || {})[Object.keys(D.nuevas || {}).filter(function (x) { return x.indexOf("ECDC") === 0; })[1]]) || []).filter(function (x) { return x.titulo && !isNaN(Date.parse(x.fecha)); }).map(function (x) { return {fuente: "ECDC", titulo: x.titulo, fecha: new Date(Date.parse(x.fecha)).toISOString().slice(0, 10), url: x.url, resumen: x.resumen || ""}; }), vistos = {}, intl = (O.internacional || []).concat(ecdc).filter(function (x) { if (vistos[x.url]) return false; vistos[x.url] = 1; return true; }).map(function (x) { x._c = claseOps(x); return x; }), bol = (O.boletines || []).slice().sort(function (a, b) { return b.semana - a.semana; }), now = Date.now();
    var vig = intl.filter(function (x) { return x._c.vig; }), alta = vig.filter(function (x) { return x._c.prio === "Alta"; }), dec = ((D.declaratorias || {}).declaratorias) || [];
    var pr = evs(function (e) { return e.origen === "prensa" && !e.internacional; }).sort(function (a, b) { return b.ts - a.ts; }), pr30 = pr.filter(function (e) { return act(e) > now - PER * DIA; });
    var ALLI = intl.slice(), alta2 = alta;
    return {
      wb: true, filtros: filtrosBio(ALLI, intl, vig, alta),
      kpiF: function () {  return kpi("Publicaciones oficiales vigentes", vig.length, "OPS, OMS y ECDC · últimos 60 días", COL, "virus") + kpi("Prioridad alta para Bolivia", alta.length, "menciona a Bolivia o alerta regional vigente", alta.length ? "#d7263d" : "#2e9e5b", "shield") + kpi("Último boletín MSyD", bol[0] ? "SE " + bol[0].semana : "—", bol[0] ? S.esc(bol[0].periodo) : "sin boletín", "#0aa3a3", "doc") + kpi("Declaratorias registradas", dec.length, "internacional · nacional · local", "#1d6fb8", "info"); },
      bio: {intl: intl, vig: vig, bol: bol, dec: dec, pr: pr, pr30: pr30},
      charts: [
        {t: "Prioridad de vigilancia", c: "Criterio del sistema (no oficial): Alta = menciona Bolivia o alerta epidemiológica regional vigente; Media = vigente y regional; Baja = resto.", id: "b1", f: function () { var o = contar(intl.filter(function (x) { return x._c.vig; }), function (x) { return x._c.prio; }); pie("b1", o, PRIOC); }},
        {t: "Enfermedades con publicaciones oficiales", c: "Color = prioridad más alta de esa enfermedad.", id: "b2", f: function () { var o = contar(intl, function (x) { return x._c.enf; }), pm = {}; intl.forEach(function (x) { var r = {Alta: 3, Media: 2, Baja: 1}; if ((r[x._c.prio] || 0) > (pm[x._c.enf] || 0)) pm[x._c.enf] = r[x._c.prio]; }); var k = topK(o, 12, true); X.chart("b2", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, grid: {left: 130, right: 30, top: 8, bottom: 18}, xAxis: {type: "value", minInterval: 1}, yAxis: {type: "category", data: k}, series: [{type: "bar", data: k.map(function (e) { return {value: o[e], itemStyle: {color: pm[e] === 3 ? PRIOC.Alta : pm[e] === 2 ? PRIOC.Media : PRIOC.Baja, borderRadius: [0, 5, 5, 0]}}; }), label: {show: true, position: "right"}}]}); }},
        {t: "Línea de tiempo de publicaciones", c: "Cada punto es una publicación de OPS/OMS (tamaño = prioridad).", id: "b3", f: function () { var ks = topK(contar(intl, function (x) { return x._c.enf; }), 10, true); X.chart("b3", {tooltip: {formatter: function (p) { var x = p.data[3]; return "<b>" + S.esc(x.titulo) + "</b><br>" + S.esc(x.fuente) + " · " + x.fecha + "<br>Prioridad " + x._c.prio; }}, grid: {left: 120, right: 14, top: 10, bottom: 28}, xAxis: {type: "time"}, yAxis: {type: "category", data: ks}, series: [{type: "scatter", symbolSize: function (v) { return v[2] * 7 + 6; }, data: intl.filter(function (x) { return ks.indexOf(x._c.enf) >= 0; }).map(function (x) { return {value: [Date.parse(x.fecha), x._c.enf, {Alta: 3, Media: 2, Baja: 1}[x._c.prio], x], itemStyle: {color: PRIOC[x._c.prio]}}; })}]}); }},
        {t: "Tipo de publicación", c: "Alertas, actualizaciones, notas informativas y brotes.", id: "b4", f: function () { pie("b4", contar(intl, function (x) { return x._c.tipo; })); }}],
      map: {t: "Notas de prensa sobre salud por departamento (30 días)", c: "Solo prensa, preliminar: no es confirmación del Ministerio de Salud.", f: function (m) { var c = contar(pr30, function (e) { return e.departamentos || []; }), mx = 1; Object.keys(c).forEach(function (k) { mx = Math.max(mx, c[k]); }); var g = geoCopia(D.geoDep); g.features.forEach(function (f) { f.properties.v = c[f.properties.n] || 0; }); m.getSource("dep").setData(g); m.addLayer({id: "df", type: "fill", source: "dep", paint: {"fill-color": ["interpolate", ["linear"], ["get", "v"], 0, "#e9d7f2", mx, "#6a1b9a"], "fill-opacity": .75}}); m.pop("df", function (p) { return "<b>" + S.esc(p.n) + "</b>" + p.v + " nota(s) de prensa"; }); var pts = pr30.filter(function (e) { return e.lat != null; }); m.addSource("bp", {type: "geojson", data: {type: "FeatureCollection", features: pts.map(function (e) { return {type: "Feature", properties: {t: e.titulo, id: e.id}, geometry: {type: "Point", coordinates: [e.lon, e.lat]}}; })}}); m.addLayer({id: "bp", type: "circle", source: "bp", paint: {"circle-radius": 7, "circle-color": "#8e24aa", "circle-stroke-color": "#fff", "circle-stroke-width": 2}}); m.pop("bp", function (p) { return "<b>" + S.esc(p.t) + "</b><a href='evento.html?id=" + encodeURIComponent(p.id) + "'>Abrir ficha →</a>"; }); }},
      vig: {t: "Alertas oficiales de mayor prioridad", h: '<div id="aLista">' + ((alta.length ? alta : vig).slice(0, 8).map(function (x) { return '<a class="alert" href="' + S.esc(S.urlOk(x.url)) + '" target="_blank" rel="noopener" style="--c:' + PRIOC[x._c.prio] + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(x.titulo) + '</div><div class="m">' + S.esc(x.fuente) + ' · ' + S.esc(x.fecha) + ' · ' + x._c.enf + '</div></div></a>'; }).join("") || '<p class="nota">Sin alertas oficiales vigentes.</p>') + '</div>'},
      reg: []
    };
  }
  function bPrensa() {
    var now = Date.now(), L = evs(function (e) { return e.origen === "prensa"; }), L30 = L.filter(function (e) { return act(e) > now - PER * DIA; });
    var SUB = {"tecnológica": [["Explosión / incendio", /explosi|incendio|fuego|llamas/], ["Derrame / contaminación", /derrame|contamin|fuga|gas/], ["Colapso / estructura", /colaps|derrumb|puente|edificio/], ["Intoxicación", /intoxic/], ["Otro", /./]], "antropogénica": [["Accidente de tránsito", /accident|choque|colisi|vuelc|atropell/], ["Conflicto / bloqueo", /bloqueo|conflicto|marcha|protesta|paro/], ["Violencia / delito", /asesin|homicid|robo|asalto|detenid|aprehend|secuestr|feminicid/], ["Incendio", /incendio|quema/], ["Otro", /./]]}[T] || [["Otro", /./]];
    function sub(e) { return subtipo(e); }
    var vic = L30.filter(function (e) { return ((e.cifras || {}).fallecidos || 0) + ((e.cifras || {}).heridos || 0) > 0; });
    var ORIGL = L.slice();
    return {
      filtros: filtrosPrensa(ORIGL, L, L30, SUB),
      kpiF: function () { var vic = L30.filter(function (e) { return ((e.cifras || {}).fallecidos || 0) + ((e.cifras || {}).heridos || 0) > 0; }); return kpi("Notas en 30 días", L30.length, "hechos únicos (ya unidos)", COL, "list") + kpi("En 24 horas", L.filter(function (e) { return e.ts > now - DIA; }).length, "prensa boliviana", "#f26a1b", "pulse") + kpi("Con víctimas", vic.length, "fallecidos o heridos reportados", "#d7263d", "heart") + kpi("Con confianza media o alta", L30.filter(function (e) { return e.confianza && e.confianza.nivel !== "Baja"; }).length, "2 o más fuentes independientes", "#2e9e5b", "shield"); },
      charts: [
        {t: "Hechos por día", c: "Últimos 30 días.", id: "p1", f: function () { barDia("p1", L30, function (e) { return e.ts; }, ND, COL); }},
        {t: "Tipo de hecho", c: "Clasificación por palabras clave del titular.", id: "p2", f: function () { pie("p2", contar(L30, sub)); }},
        {t: "Por departamento", c: "Últimos 30 días.", id: "p3", f: function () { barH("p3", contar(L30, function (e) { return e.departamentos || []; }), "#1d6fb8"); }},
        {t: "Medios que reportan", c: "Notas por medio.", id: "p4", f: function () { barH("p4", contar(L30, function (e) { return (e.medios && e.medios.length ? e.medios : [e.fuente]).map(function (m) { return (m || "").replace(/ - .*/, ""); }); }), "#0aa3a3", 10); }},
        {t: "Confianza (triangulación)", c: "Alta = 3+ fuentes independientes · Media = 2 · Baja = 1.", id: "p5", f: function () { pie("p5", contar(L30, function (e) { return e.confianza ? e.confianza.nivel : "Baja"; }), {Alta: "#2e9e5b", Media: "#f5b700", Baja: "#8896ab"}); }},
        {t: "Víctimas reportadas por día", c: "Máximo reportado por hecho.", id: "p6", f: function () { var ks = dias(ND), f = {}, h = {}; L30.forEach(function (e) { var k = S.diaKey(e.ts); f[k] = (f[k] || 0) + ((e.cifras || {}).fallecidos || 0); h[k] = (h[k] || 0) + ((e.cifras || {}).heridos || 0); }); X.chart("p6", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 34, right: 10, top: 34, bottom: 28}, xAxis: {type: "category", data: ks.map(function (k) { return k.slice(5); })}, yAxis: {type: "value", minInterval: 1}, series: [{name: "Fallecidos", type: "bar", stack: "v", data: ks.map(function (k) { return f[k] || 0; }), itemStyle: {color: "#7a1f2b"}}, {name: "Heridos", type: "bar", stack: "v", data: ks.map(function (k) { return h[k] || 0; }), itemStyle: {color: "#f26a1b"}}]}); }}],
      map: {t: "Mapa de hechos", c: "Punto = hecho con ubicación (color = confianza).", f: function (m) { m.addSource("e", {type: "geojson", data: {type: "FeatureCollection", features: L30.filter(function (e) { return e.lat != null; }).map(function (e) { return {type: "Feature", properties: {t: e.titulo, c: e.confianza ? e.confianza.nivel : "Baja", id: e.id}, geometry: {type: "Point", coordinates: [e.lon, e.lat]}}; })}}); capaMun(m, "me", L30.filter(function (e) { return e.lat != null; }).map(function (e) { return [e.lon, e.lat, 1]; }), "#ef6c00", null); ctrl(m, [{id: "mm", label: "Hechos por municipio (30 d)", layers: ["mef", "mel"]}, {id: "pp", label: "Hechos (puntos)", layers: ["e"]}]);
      m.addLayer({id: "e", type: "circle", source: "e", paint: {"circle-radius": 8, "circle-color": ["match", ["get", "c"], "Alta", "#2e9e5b", "Media", "#f5b700", "#8896ab"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5}}); m.pop("e", function (p) { return "<b>" + S.esc(p.t) + "</b>Confianza " + p.c.toLowerCase() + "<br><a href='evento.html?id=" + encodeURIComponent(p.id) + "'>Abrir ficha →</a>"; }); }},
      vig: {t: "Hechos recientes", h: '<div id="aLista">' + lista(L, 10) + '</div>' + (T === "antropogénica" ? '<a class="btn p" style="margin-top:10px" href="index.html#tra">' + X.ic("heart") + 'Ir a Salud humana: accidentes con víctimas</a>' : '')},
      reg: L
    };
  }

  function bSalud() {
    var now = Date.now(), HO = (((D.transito || {}).hechos) || []).filter(function (h) { return act(h) > now - PER * DIA; }), H = HO.slice();
    var O = D.ev.filter(function (e) { return e.categoria !== "biológica" && e.origen === "prensa" && act(e) > now - PER * DIA && ((e.cifras || {}).fallecidos || 0) + ((e.cifras || {}).heridos || 0) > 0 && !/transito/.test(e.id) && e.lat != null && !/españa|mexican|vocalista|muertos|toledo|estados unidos|texas|pensilvania|china|india|rusia|ucrania|gaza|israel/.test(norm(e.titulo)); });
    function tot() { var fa = H.reduce(function (a, h) { return a + (h.fallecidos || 0); }, 0), he = H.reduce(function (a, h) { return a + (h.heridos || 0); }, 0); return {fa: fa, he: he, l: fa + he ? Math.round(100 * fa / (fa + he)) : 0}; }
    function listas() { var conF = H.filter(function (h) { return h.fallecidos > 0; }), conH = H.filter(function (h) { return h.heridos > 0; }); return (conF.length ? conF.sort(function (a, b) { return b.ts - a.ts; }).slice(0, 8).map(f).join("") : '<p class="nota">Sin fallecidos con esos filtros.</p>') + '<h3 style="margin:14px 0 6px;font-size:14px">Morbilidad: hechos con heridos</h3>' + (conH.length ? conH.sort(function (a, b) { return b.ts - a.ts; }).slice(0, 8).map(f).join("") : '<p class="nota">Sin heridos con esos filtros.</p>'); }
    var T0 = tot();
    function f(h) { return '<a class="alert" href="evento.html?id=' + encodeURIComponent(h.id) + '" style="--c:' + (h.fallecidos ? "#7a1f2b" : "#f26a1b") + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(h.titulo) + '</div><div class="m">' + S.fecha(h.ts) + ' · ' + S.esc(h.lugar || h.departamento || "") + ' · ' + h.fallecidos + ' fallecido(s) · ' + h.heridos + ' herido(s)</div></div>' + (h.confianza ? '<span class="badge">' + S.esc(h.confianza.nivel) + '</span>' : '') + '</a>'; }
    function fotoCard(h) { return '<a class="fcard" href="evento.html?id=' + encodeURIComponent(h.id) + '" style="color:inherit;text-decoration:none">' + (h.imagen ? '<img loading="lazy" referrerpolicy="no-referrer" src="' + S.esc(h.imagen) + '" alt="" onerror="this.style.display=\'none\'">' : '<div class="nofoto">' + X.ic("heart") + '</div>') + '<div class="fb"><div class="t">' + S.esc(h.titulo) + '</div><div class="m">' + S.fecha(h.ts) + ' · ' + S.esc(h.lugar || "") + '</div>' + (h.imagen ? '<div class="cred">Foto: ' + S.esc(h.imagen_medio || "medio de prensa") + '</div>' : '') + '</div></a>'; }
    var rec = H.slice().sort(function (a, b) { return (b.ultima_nota || b.ts) - (a.ultima_nota || a.ts); }).slice(0, 9);
    return {
      kpiF: function () { var t = tot(); return kpi("Fallecidos (30 días)", t.fa, "reportados por prensa", "#7a1f2b", "heart") + kpi("Heridos (30 días)", t.he, "morbilidad reportada", "#f26a1b", "pulse") + kpi("Hechos (30 días)", H.length, "únicos, ya triangulados", "#1d6fb8", "list") + kpi("Letalidad", t.l + " %", "fallecidos / (fallecidos + heridos)", "#c62828", "shield"); },
      filtros: {ctl: [{id: "gr", l: "Gravedad", o: [["", "Todos"], ["f", "Con fallecidos"], ["h", "Con heridos"], ["m", "Múltiples víctimas (3+)"]]}, {id: "ti", l: "Tipo de accidente", o: [["", "Todos"]].concat(Object.keys(contar(HO, function (h) { return h.tipo; })).sort().map(function (d) { return [d, d]; }))}, {id: "dp", l: "Departamento", o: [["", "Todos"]].concat(Object.keys(contar(HO, function (h) { return h.departamento || "Sin ubicar"; })).sort().map(function (d) { return [d, d]; }))}, {id: "ve", l: "Vehículo", o: [["", "Todos"]].concat(Object.keys(contar(HO, function (h) { return h.vehiculo || "Sin precisar"; })).sort().map(function (d) { return [d, d]; }))}, {id: "cf", l: "Confianza", o: [["", "Todas"], ["m", "Media o alta (2+ medios)"], ["b", "Una sola fuente"]]}],
        lista: listas,
        aplica: function (v) { var f = HO.filter(function (h) { var n = h.confianza ? h.confianza.nivel : "Baja", vc = (h.fallecidos || 0) + (h.heridos || 0); return (!v.gr || (v.gr === "f" ? h.fallecidos > 0 : v.gr === "h" ? h.heridos > 0 : vc >= 3)) && (!v.ti || h.tipo === v.ti) && (!v.dp || (h.departamento || "Sin ubicar") === v.dp) && (!v.ve || (h.vehiculo || "Sin precisar") === v.ve) && (!v.cf || (v.cf === "m" ? n !== "Baja" : n === "Baja")); }); H.length = 0; f.forEach(function (h) { H.push(h); }); return '<span class="emb ok">Mostrando <b>' + H.length + '</b> de ' + HO.length + ' hechos en ' + PL + '</span>'; },
        mapa: function (m) { var pts = H.filter(function (h) { return h.lat != null; }); if (m.getSource("e")) m.getSource("e").setData({type: "FeatureCollection", features: pts.map(function (h) { return {type: "Feature", properties: {t: h.titulo, f: h.fallecidos || 0, h: h.heridos || 0, id: h.id}, geometry: {type: "Point", coordinates: [h.lon, h.lat]}}; })}); if (m.getSource("ms")) { var c = {}; pts.forEach(function (h) { var k = munDe(h.lon, h.lat); if (k) c[k] = (c[k] || 0) + ((h.fallecidos || 0) + (h.heridos || 0) || 1); }); var g = geoCopia(D.geoMun); g.features.forEach(function (q) { q.properties.v = c[q.properties.n + " (" + q.properties.d + ")"] || 0; }); m.getSource("ms").setData(g); } }},
      charts: [
        {t: "Mortalidad y morbilidad por día", c: "Fallecidos y heridos reportados (30 días).", id: "s1", f: function () { var ks = dias(ND), a = {}, b = {}; H.forEach(function (h) { var k = S.diaKey(h.ts); a[k] = (a[k] || 0) + (h.fallecidos || 0); b[k] = (b[k] || 0) + (h.heridos || 0); }); X.chart("s1", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 34, right: 10, top: 34, bottom: 28}, xAxis: {type: "category", data: ks.map(function (k) { return k.slice(5); })}, yAxis: {type: "value", minInterval: 1}, series: [{name: "Fallecidos", type: "bar", stack: "v", data: ks.map(function (k) { return a[k] || 0; }), itemStyle: {color: "#7a1f2b"}}, {name: "Heridos", type: "bar", stack: "v", data: ks.map(function (k) { return b[k] || 0; }), itemStyle: {color: "#f26a1b"}}]}); }},
        {t: "Tipo de accidente", c: "Hechos por tipo (30 días).", id: "s2", f: function () { pie("s2", contar(H, function (h) { return h.tipo; })); }},
        {t: "Vehículo involucrado", c: "Según el titular de la nota.", id: "s3", f: function () { barH("s3", contar(H, function (h) { return h.vehiculo || "Sin precisar"; }), "#5c6bc0"); }},
        {t: "Víctimas por departamento", c: "Fallecidos + heridos reportados.", id: "s4", f: function () { var o = {}; H.forEach(function (h) { var d = h.departamento || "Sin ubicar"; o[d] = (o[d] || 0) + (h.fallecidos || 0) + (h.heridos || 0); }); barH("s4", o, "#c62828"); }},
        {t: "Confianza (triangulación)", c: "Alta: 3+ fuentes independientes · Media: 2 · Baja: 1.", id: "s5", f: function () { pie("s5", contar(H, function (h) { return h.confianza ? h.confianza.nivel : "Baja"; }), {Alta: "#2e9e5b", Media: "#f5b700", Baja: "#8896ab"}); }},
        {t: "Medios que reportan", c: "Hechos por medio.", id: "s6", f: function () { barH("s6", contar(H, function (h) { return h.medios || []; }), "#0aa3a3", 10); }}],
      map: {t: "Mapa de hechos con víctimas (calles y carreteras)", c: "Círculo rojo = con fallecidos; naranja = con heridos; gris = sin víctimas reportadas. Acerque para ver calles.", f: function (m) { m.addSource("e", {type: "geojson", data: {type: "FeatureCollection", features: H.filter(function (h) { return h.lat != null; }).map(function (h) { return {type: "Feature", properties: {t: h.titulo, f: h.fallecidos || 0, h: h.heridos || 0, id: h.id}, geometry: {type: "Point", coordinates: [h.lon, h.lat]}}; })}}); capaMun(m, "ms", H.filter(function (h) { return h.lat != null; }).map(function (h) { return [h.lon, h.lat, (h.fallecidos || 0) + (h.heridos || 0) || 1]; }), "#c62828", null); ctrl(m, [{id: "mm", label: "Víctimas por municipio (30 d)", layers: ["msf", "msl"]}, {id: "pp", label: "Hechos (puntos)", layers: ["e"]}]);
      m.addLayer({id: "e", type: "circle", source: "e", paint: {"circle-radius": ["+", 6, ["*", 2, ["min", 4, ["+", ["get", "f"], ["get", "h"]]]]], "circle-color": ["case", [">", ["get", "f"], 0], "#b71c1c", [">", ["get", "h"], 0], "#f26a1b", "#8896ab"], "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-opacity": .9}}); m.pop("e", function (p) { return "<b>" + S.esc(p.t) + "</b>" + p.f + " fallecido(s) · " + p.h + " herido(s)<br><a href='evento.html?id=" + encodeURIComponent(p.id) + "'>Abrir ficha →</a>"; }); }},
      vig: {t: "Mortalidad: hechos con fallecidos", h: '<div id="aLista">' + listas() + '</div>'},
      extra: '<div class="secb" id="s-act" style="--c:' + COL + '">Actualizaciones y fotografías de los medios</div><div class="cap" style="margin:-4px 0 10px">Se enlaza la imagen original del medio, con crédito; el sistema no la copia. Si el medio no publica foto, se muestra un recuadro.</div><div class="fgrid">' + rec.map(fotoCard).join("") + '</div>' + (O.length ? '<div class="secb" style="--c:#7a8aa3">Otros hechos con víctimas (no tránsito)</div><div class="grid g3">' + O.slice(0, 6).map(function (e) { return '<div class="card">' + lista([e], 1) + '</div>'; }).join("") + '</div>' : ''),
      reg: H.map(function (h) { return {id: h.id, ts: h.ts, titulo: h.titulo, lugar: h.lugar, departamentos: [h.departamento], nivel: h.fallecidos ? 3 : h.heridos ? 2 : 1, confianza: h.confianza, origen: "prensa", tipo: h.tipo, fallecidos: h.fallecidos || 0, heridos: h.heridos || 0, fuente: (h.medios || []).join(", ")}; })
    };
  }
  /* ---------- armado de la página ---------- */
  var CATS_INF = {"salud": "antropogénica"};
  function panel(k) {
    var P = $("pnl"); if (!k) { P.style.display = "none"; return; }
    P.style.display = "";
    if (k === "per") {
      P.innerHTML = '<h2>' + X.ic("doc") + 'Informe general de este tipo de evento por período</h2><div class="cap">Consolidado con gráficos y tabla; se imprime o se guarda en PDF.</div><div class="filtros"><label>Período<select id="rPer"><option value="7">7 días</option><option value="30" selected>30 días</option><option value="90">90 días</option><option value="365">12 meses</option></select></label><label>Departamento<select id="rDep"><option value="">Todos</option>' + S.DEPS.map(function (d) { return '<option>' + d + '</option>'; }).join("") + '</select></label></div><button class="btn p" id="rGo" style="margin-top:12px">' + X.ic("doc") + 'Generar informe</button>';
      $("rGo").onclick = function () { window.open("informes.html?cat=" + encodeURIComponent(CATS_INF[T] || T) + "&per=" + $("rPer").value + "&dep=" + encodeURIComponent($("rDep").value), "_blank"); };
    } else {
      P.innerHTML = '<h2>' + X.ic("list") + 'Buscar un hecho con varios datos</h2><div class="cap">Dé al menos 2 datos además del tipo (este módulo). El sistema califica cada hecho según cuántos datos coinciden y le muestra el porcentaje.</div>' +
        '<div class="filtros"><label>Lugar (municipio, departamento o calle)<input type="text" id="fL" placeholder="ej. Caranavi"></label><label>Fecha aproximada<input type="date" id="fF"></label><label>Palabra clave<input type="text" id="fK" placeholder="ej. bus, dengue, M 4, bloqueo"></label>' + (T === "salud" || T === "antropogénica" || T === "tecnológica" ? '<label>Víctimas<select id="fV"><option value="">No sé</option><option value="f">Con fallecidos</option><option value="h">Con heridos</option></select></label>' : '') + '</div><div id="hRes" style="margin-top:10px"></div>';
      var tm = null; ["fL", "fF", "fK", "fV"].forEach(function (i) { var el = $(i); if (el) el.oninput = el.onchange = function () { clearTimeout(tm); tm = setTimeout(buscarHecho, 200); }; });
      buscarHecho();
    }
    P.scrollIntoView({behavior: "smooth", block: "nearest"});
  }
  function buscarHecho() {
    var L = $("fL").value.trim(), F = $("fF").value, K = $("fK").value.trim(), V = $("fV") ? $("fV").value : "", dados = [L, F, K, V].filter(Boolean).length;
    if (dados < 2) { $("hRes").innerHTML = '<div class="resmsg no">Dé al menos 2 datos (lugar, fecha, palabra clave' + ($("fV") ? " o víctimas" : "") + ').</div>'; return; }
    var base = T === "salud" ? REG : D.ev.filter(function (e) { return e.categoria === T && e.origen !== "modelo"; }), nl = norm(L), nk = norm(K), tf = F ? new Date(F + "T12:00:00-04:00").getTime() : 0;
    var peso = {l: L ? 35 : 0, f: F ? 25 : 0, k: K ? 25 : 0, v: V ? 15 : 0}, tot = peso.l + peso.f + peso.k + peso.v;
    var r = base.map(function (e) {
      var tx = norm(e.titulo + " " + (e.lugar || "") + " " + (e.departamentos || []).join(" ") + " " + (e.detalle || "")), pts = 0, ok = [];
      if (L && nl.split(" ").every(function (w) { return tx.indexOf(w) >= 0; })) { pts += peso.l; ok.push("lugar"); }
      if (F) { var d = Math.abs(e.ts - tf) / DIA; if (d <= 2) { pts += peso.f; ok.push("fecha"); } else if (d <= 7) { pts += peso.f * .5; ok.push("fecha (±7 d)"); } }
      if (K && nk.split(" ").every(function (w) { return tx.indexOf(w) >= 0; })) { pts += peso.k; ok.push("palabra clave"); }
      if (V) { var c = e.cifras || {}, f = c.fallecidos != null ? c.fallecidos : (e.fallecidos || 0), h = c.heridos != null ? c.heridos : (e.heridos || 0); if ((V === "f" && f > 0) || (V === "h" && h > 0)) { pts += peso.v; ok.push("víctimas"); } }
      return {e: e, p: Math.round(100 * pts / tot), ok: ok};
    }).filter(function (x) { return x.p >= 25; }).sort(function (a, b) { return b.p - a.p || b.e.ts - a.e.ts; });
    var mejor = r.length ? r[0].p : 0, q = [L, K].filter(Boolean).join(" ") + (F ? " " + F : ""), fuerte = mejor >= 60;
    $("hRes").innerHTML = '<div class="resmsg ' + (fuerte ? "si" : "no") + '">' + (fuerte ? "Se encontró el hecho con <b>" + mejor + " %</b> de coincidencia." : r.length ? "Hay posibles coincidencias, pero ninguna segura (la mejor: " + mejor + " %)." : "No se encontró ningún hecho que coincida en la base de este tipo.") + '</div>' +
      r.slice(0, 5).map(function (x) { return '<div style="border-bottom:1px solid var(--line);padding:7px 0;display:flex;gap:10px;align-items:flex-start"><div class="badge" style="background:' + (x.p >= 60 ? "#2e9e5b" : "#f5a000") + ';min-width:48px;text-align:center">' + x.p + ' %</div><div><a href="evento.html?id=' + encodeURIComponent(x.e.id) + '" target="_blank"><b>' + S.esc(x.e.titulo.slice(0, 100)) + '</b></a><div class="nota">' + S.fecha(x.e.ts, true) + ' · coinciden: ' + x.ok.join(", ") + ' · abrir ficha con mapa, gráficos y PDF</div></div></div>'; }).join("") +
      '<div style="margin-top:10px"><div class="nota">' + (fuerte ? "¿Quiere más detalle (lectura de notas, cifras por medio)? " : "Para buscarlo en la prensa de 12 meses y en fuentes oficiales: ") + 'copie este texto, abra el formulario y péguelo. El informe llega a su correo en unos 5–10 minutos.</div><div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap"><input type="text" readonly id="fQ" value="' + S.esc(q) + '" style="flex:1;min-width:200px" onclick="this.select()"><button class="btn s" onclick="var i=document.getElementById(\'fQ\');i.select();document.execCommand(\'copy\');this.textContent=\'Copiado\'">' + X.ic("doc") + 'Copiar</button><a class="btn p s" href="' + S.URL_PEDIR + '" target="_blank" rel="noopener">' + X.ic("db") + 'Abrir formulario</a><a class="btn s" href="tema.html?q=' + encodeURIComponent(q) + '" target="_blank">' + X.ic("list") + 'Ver en Informe por tema</a></div></div>';
  }
  var REG = [];
  function registro(arr, titulo) {
    var hoyK = S.diaKey(Date.now()), f = arr.filter(function (e) { return act(e) > Date.now() - PER * DIA || (e.origen === "senamhi" && ((e.cifras || {}).fin || "") >= hoyK); }).sort(function (a, b) { return act(b) - act(a); });
    return '<details class="ayuda" id="s-reg" style="margin-top:14px"><summary>' + X.ic("list") + titulo + ' (' + f.length + ')</summary><div class="ayuda-c" style="overflow:auto;max-height:480px"><table><tr><th>Fecha</th><th>Evento</th><th>Lugar</th><th>Nivel</th><th>Confianza</th><th>Fuente</th></tr>' + f.slice(0, 120).map(function (e) { return '<tr><td style="white-space:nowrap">' + S.fecha(e.ts, true) + (act(e) - e.ts > 36e5 ? '<br><small style="color:#2e9e5b">actualizado ' + S.fecha(act(e), true) + '</small>' : "") + '</td><td><a href="evento.html?id=' + encodeURIComponent(e.id) + '">' + S.esc(e.titulo) + '</a></td><td>' + S.esc(e.lugar || (e.departamentos || []).join(", ")) + '</td><td>' + X.nivBadge(e) + '</td><td>' + X.confBadge(e) + '</td><td>' + (e.origen === "prensa" && e.fuente ? S.esc(e.fuente) : X.badgeOrigen(e)) + '</td></tr>'; }).join("") + '</table></div></details>';
  }
  function render() {
    var B = T === "geológica" ? bGeo() : T === "meteorológica" ? bMeteo() : T === "hidrológica" ? bHidro() : T === "climatológica" ? bClima() : T === "biológica" ? bBio() : T === "salud" ? bSalud() : bPrensa();
    REG = B.reg || [];
    var h = '<div class="mhero" style="--c:' + COL + '"><h1>' + X.ic(T === "salud" ? "heart" : (X.CATICON[T] || "shield")) + CDEF.n + '</h1><p>' + CDEF.def + '</p><div class="src">' + CDEF.fu.map(function (s) { return '<span>' + S.esc(s) + '</span>'; }).join("") + '</div></div>';
    h += '<div class="mbar" id="mbar"><div class="mb-g"><a href="#s-mapa" class="btn s">' + X.ic("map") + 'Mapa</a><a href="#s-sub" class="btn s">' + X.ic("list") + 'Subtipos y niveles</a><a href="#s-graf" class="btn s">' + X.ic("pulse") + 'Indicadores</a>' + (B.extra ? '<a href="#s-act" class="btn s">' + X.ic("heart") + 'Actualizaciones</a>' : '') + '<a href="#s-reg" class="btn s">' + X.ic("db") + 'Registro</a></div><div class="mb-g"><label class="btn s" style="cursor:default">Periodo <select id="selPer" style="margin-left:6px;background:transparent;color:inherit;border:0;font:inherit"><option value="1">24 horas</option><option value="7">7 días</option><option value="30">30 días</option><option value="365">1 año</option><option value="0">Todo</option></select></label><button class="btn p s" data-p="per">' + X.ic("doc") + 'Informe por período</button><button class="btn p s" data-p="hecho">' + X.ic("list") + 'Buscar hecho o tema</button><a class="btn s" href="indicadores.html?t=' + encodeURIComponent(T) + '" target="_blank" data-tip="Definición, fórmula, fuente y límite de cada indicador de este tipo">' + X.ic("info") + 'Indicadores' + '</a><button class="btn s" onclick="window.print()">' + X.ic("print") + 'PDF</button><a class="btn s" href="datos/eventos_unificados.csv" download>' + X.ic("dl") + 'CSV</a></div></div><div class="card" id="pnl" style="display:none;margin-bottom:14px"></div>';
    h += '<div class="grid g4" style="margin-bottom:6px">' + (B.kpiF ? B.kpiF() : B.kpis) + '</div>' + filtrosHtml(B);
    h += '<div class="secb" id="s-mapa" style="--c:' + COL + '">Mapa y situación vigente</div><div class="grid g21"><div class="card"><h2>' + X.ic("map") + B.map.t + '</h2><div class="cap">' + B.map.c + '</div><div class="map" id="mmap" style="height:470px"></div></div><div class="card"><h2>' + X.ic("shield") + B.vig.t + '</h2><div style="max-height:500px;overflow:auto">' + B.vig.h + '</div></div></div>';
    h += '<div class="secb" id="s-sub" style="--c:' + COL + '">Subtipos y nivel de importancia</div><div class="card"><div class="cap">Cada fenómeno dentro de este tipo, desglosado por nivel (últimos 30 días). El nivel viene de la fuente oficial cuando existe; en prensa es «sin nivel» hasta que se confirme.</div><div class="ch s" id="chSub"></div></div>';
    if (B.extra) h += B.extra;
    if (T === "biológica") h += bioHtml(B.bio); else h += '<div class="secb" id="s-graf" style="--c:' + COL + '">Indicadores y gráficos de análisis</div><div class="grid g3">' + B.charts.map(function (c) { return card(c.t, c.c, c.id, "s", c.extra); }).join("") + '</div>';
    if (T !== "biológica") h += registro(B.reg, "Registro de eventos");
    h = h.replace(/Últimos 30 días/g, PLU).replace(/\(30 días\)/g, "(" + PL + ")").replace(/30 días/g, PL);
    $("app").innerHTML = h;
    (function () { var s = document.getElementById("selPer"); if (!s) return; s.value = String(PER >= 36500 ? 0 : PER); s.onchange = function () { var u = new URL(location.href); u.searchParams.set("p", s.value); location.href = u.toString(); }; })();
    mapa("mmap", B.map.f); if (B.vig && B.vig.hook) B.vig.hook(B); filtrosInit(B);
    var arrSub = T === "salud" ? B.reg : D.ev.filter(function (e) { return e.categoria === T && e.origen !== "modelo" && act(e) > Date.now() - PER * DIA; });
    subNivel("chSub", arrSub);
    if (T === "biológica") bioCharts(B); else B.charts.forEach(function (c) { c.f(); });
    [].forEach.call(document.querySelectorAll("#mbar [data-p]"), function (b) { b.onclick = function () { panel(b.dataset.p); }; });
  }
  function bioHtml(b) {
    var h = '<div class="secb" style="--c:' + COL + '">Vigilancia oficial (OPS · OMS · Ministerio de Salud y Deportes)</div><div class="grid g2">' + B_c("b1") + B_c("b2") + '</div><div class="grid g2" style="margin-top:16px">' + B_c("b3", "t") + B_c("b4") + '</div>';
    h += '<div class="grid g2" style="margin-top:16px"><div class="card"><h2>' + X.ic("shield") + 'Alertas y publicaciones vigentes (60 días)</h2><div class="cap">Ordenadas por prioridad de vigilancia para Bolivia.</div><div style="max-height:460px;overflow:auto">' + (b.vig.slice().sort(function (a, c) { var r = {Alta: 0, Media: 1, Baja: 2}; return r[a._c.prio] - r[c._c.prio] || Date.parse(c.fecha) - Date.parse(a.fecha); }).map(function (x) { return '<a class="alert" href="' + S.esc(S.urlOk(x.url)) + '" target="_blank" rel="noopener" style="--c:' + PRIOC[x._c.prio] + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(x.titulo) + '</div><div class="m">' + S.esc(x.fuente) + ' · ' + S.esc(x.fecha) + ' · ' + x._c.tipo + ' · ' + x._c.enf + (x._c.bol ? ' · menciona Bolivia' : '') + '</div></div><span class="badge" style="background:' + PRIOC[x._c.prio] + '">Prioridad ' + x._c.prio.toLowerCase() + '</span></a>'; }).join("") || '<p class="nota">No hay publicaciones vigentes.</p>') + '</div></div>';
    h += '<div class="card"><h2>' + X.ic("doc") + 'Boletín epidemiológico del Ministerio de Salud y Deportes</h2>' + (b.bol[0] ? '<div class="nota" style="margin-bottom:6px">Semana epidemiológica ' + b.bol[0].semana + ' · ' + S.esc(b.bol[0].periodo) + ' · <a href="' + S.esc(S.urlOk(b.bol[0].url)) + '" target="_blank" rel="noopener">abrir boletín</a></div><ul style="margin:0 0 0 18px;font-size:13px">' + (b.bol[0].frases || []).slice(0, 8).map(function (f) { return '<li style="margin-bottom:5px">' + S.esc(f) + '</li>'; }).join("") + '</ul>' : '<p class="nota">Sin boletín leído todavía.</p>') + '</div></div>';
    h += '<div class="card" style="margin-top:16px"><h2>' + X.ic("info") + 'Declaratorias de alerta (internacional · nacional · departamental · municipal)</h2><div class="cap">Las declaratorias no tienen una fuente abierta automática: se registran en el archivo <b>docs/declaratorias.json</b> (fecha, ámbito, nivel, evento, norma, enlace).</div>' + (b.dec.length ? '<table><tr><th>Fecha</th><th>Ámbito</th><th>Nivel</th><th>Evento</th><th>Norma</th></tr>' + b.dec.map(function (d) { return '<tr><td>' + S.esc(d.fecha || "") + '</td><td>' + S.esc(d.ambito || "") + '</td><td>' + S.esc(d.nivel || "") + '</td><td>' + S.esc(d.evento || "") + '</td><td>' + (d.url ? '<a href="' + S.esc(S.urlOk(d.url)) + '" target="_blank">' + S.esc(d.norma || "ver") + '</a>' : S.esc(d.norma || "")) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Aún no hay declaratorias registradas.</p>') + '</div>';
    h += '<div class="sep"><div class="secb" style="--c:#7a8aa3">Prensa sobre salud en Bolivia <small class="nota">(preliminar, no verificada — separada de la vigilancia oficial)</small></div><div class="grid g3">' + B_c("b5") + B_c("b6") + '<div class="card"><h2>Notas recientes</h2><div style="max-height:260px;overflow:auto">' + lista(b.pr, 8) + '</div></div></div></div>';
    return h;
  }
  function B_c(id, cls) { var m = {b1: ["Prioridad de vigilancia", "Criterio del sistema (no oficial). Alta: menciona Bolivia o alerta regional vigente. Media: vigente y regional. Baja: el resto."], b2: ["Enfermedades con publicaciones oficiales", "Color = prioridad más alta."], b3: ["Línea de tiempo de publicaciones", "Cada punto es una publicación OPS/OMS (tamaño = prioridad)."], b4: ["Tipo de publicación", "Alertas, actualizaciones y brotes."], b5: ["Prensa: enfermedades mencionadas", "Últimos 90 días."], b6: ["Prensa: notas por día", "Últimos 30 días."]}[id]; return card(m[0], m[1], id, cls || "s"); }
  function bioCharts(B) {
    B.charts.forEach(function (c) { c.f(); });
    var pr = B.bio.pr, now = Date.now();
    barH("b5", contar(pr.filter(function (e) { return e.ts > now - 90 * DIA; }), function (e) { return enfermedad(e.titulo); }), "#8e24aa");
    barDia("b6", pr, function (e) { return e.ts; }, ND, "#8e24aa");
    registroBio();
  }
  function registroBio() { }
  X.datos().then(function (d) {
    D = d; X.live(d.eventos_unificados && d.eventos_unificados.generado);
    var opt = function (u) { return fetch(u + "?t=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    Promise.all([opt("declaratorias.json"), opt("fuentes_nuevas.json")]).then(function (r) { D.declaratorias = r[0]; D.nuevas = r[1] ? r[1].datos || {} : {}; render(); });
  }).catch(function (e) { $("app").innerHTML = '<div class="card vacio">No se pudieron cargar los datos: ' + S.esc(e.message) + '</div>'; });
})();

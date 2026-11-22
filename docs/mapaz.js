/* MAPAZ: herramientas comunes de mapa para los módulos de amenaza.
   Mapa base con respaldo y aviso si falla, infraestructura (OpenStreetMap vía HOT/HDX; cobertura incompleta) y exposición por radio
   (población dentro del radio, establecimientos de salud, bomberos/rescate y policía).
   Población: si existe poblacion_malla.json (poblacion_malla.py: WorldPop ~1 km repartida y reescalada al total INE de cada municipio) se cuentan las celdas
   cuyo centro cae dentro del radio; si no, se usa el método anterior (municipios cuyo centro cae dentro del radio, total INE). */
var MAPAZ = (function () {
  var S = SALA, X = S2, T, A, INF = [];
  var INFN = {hosp: "Hospital (por nombre)", cli: "Centro, puesto o clínica", cons: "Consultorio", bom: "Bomberos", res: "Rescate", pol: "Policía"};
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function fmt(n, d) { return d ? (n == null ? "—" : Number(n).toFixed(d).replace(".", ",")) : A.fmt(n); }
  function fmtP(n) { return n >= 1e6 ? fmt(n / 1e6, 1) + " M" : A.fmt(n); }
  function hav(a, b, c, d) { var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, q = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 12742 * Math.asin(Math.sqrt(q)); }
  function circulo(lat, lon, km) { var o = [], i, r = Math.PI / 180; for (i = 0; i <= 64; i++) { var a = i / 64 * 2 * Math.PI, dl = km / 111.32 * Math.cos(a), dn = km / (111.32 * Math.cos(lat * r)) * Math.sin(a); o.push([lon + dn, lat + dl]); } return o; }
  function fc(f) { return {type: "FeatureCollection", features: f}; }
  function cen(m) { if (!m._c) m._c = A.cenPoly(m.f.geometry); return m._c; }

  function iniciar(t) {
    T = t; A = TERR.api; INF = []; cargaMalla();
    T.est.forEach(function (p) { INF.push({lat: p[0], lon: p[1], n: p[2] || "(sin nombre)", k: /hospital/i.test(p[2] || "") ? "hosp" : p[3] === "consultorio" ? "cons" : "cli", op: p[4] || "", esp: p[5] || "", dep: p[6] || "", mun: p[7] || ""}); });
    T.emer.forEach(function (p) { INF.push({lat: p[0], lon: p[1], n: p[2] || "(sin nombre)", k: p[3] === "bomberos" ? "bom" : p[3] === "rescate" ? "res" : "pol", op: "", esp: "", dep: p[4] || "", mun: p[5] || ""}); });
  }
  function cerca(lat, lon, km) { var o = []; INF.forEach(function (p) { var d = hav(lat, lon, p.lat, p.lon); if (d <= km) o.push({p: p, d: d}); }); o.sort(function (a, b) { return a.d - b.d; }); return o; }

  /* ---------- malla de población ~1 km ---------- */
  var MG = null, MGE = "pend", MGI = false, MGL = [];
  var PAL = [["#e6dcff", "< 10"], ["#c9b8ff", "10–50"], ["#a68cff", "50–250"], ["#8461f0", "250–1 000"], ["#6338d6", "1 000–5 000"], ["#3f1fa3", "> 5 000"]];
  function malla(fn) { if (MGE !== "pend") fn(); else MGL.push(fn); }
  function hayMalla() { return !!MG; }
  function cargaMalla() {
    if (MGI) return; MGI = true;
    fetch("poblacion_malla.json").then(function (r) { if (!r.ok) throw new Error("sin malla"); return r.json(); }).then(function (j) {
      var g = j.grid, n = j.p.length, nc = g.nc, F = 0, i, r, c, row = new Int32Array(n), lat = new Float64Array(n), lon = new Float64Array(n), rs = new Int32Array(g.nr + 2), k = 0;
      for (i = 0; i < n; i++) { F += j.i[i]; r = Math.floor(F / nc); c = F - r * nc; row[i] = r; lat[i] = g.lat0 - (r + .5) * g.d; lon[i] = g.lon0 + (c + .5) * g.d; }
      for (r = 0; r <= g.nr + 1; r++) { while (k < n && row[k] < r) k++; rs[r] = k; }
      MG = {meta: j.meta, g: g, n: n, lat: lat, lon: lon, m: Int32Array.from(j.m), p: Int32Array.from(j.p), rs: rs, munis: j.munis}; MGE = "ok";
    }).catch(function () { MG = null; MGE = "no"; }).then(function () { var f = MGL.splice(0); f.forEach(function (fn) { try { fn(); } catch (e) { console.warn("MAPAZ malla " + e.message); } }); });
  }
  /* celdas cuyo centro está a ≤ km del punto (recorre solo las filas de latitud necesarias) */
  function celdas(lat, lon, km) {
    var g = MG.g, dl = km / 111.32, dn = dl / Math.cos(lat * Math.PI / 180) * 1.02, r1 = Math.max(0, Math.floor((g.lat0 - lat - dl) / g.d) - 1), r2 = Math.min(g.nr - 1, Math.ceil((g.lat0 - lat + dl) / g.d) + 1), ci = [], cd = [], i, d;
    for (i = r1 <= r2 ? MG.rs[r1] : 0; r1 <= r2 && i < MG.rs[r2 + 1]; i++) { if (Math.abs(MG.lon[i] - lon) > dn) continue; d = hav(lat, lon, MG.lat[i], MG.lon[i]); if (d <= km) { ci.push(i); cd.push(d); } }
    return {ci: ci, cd: cd};
  }
  function ring0(radios) { return radios.map(function (r) { return {km: r, n: 0, pob: 0, sd: 0, hosp: 0, cli: 0, cons: 0, bom: 0, pol: 0}; }); }
  function expoMalla(lat, lon, radios, km) {
    var c = celdas(lat, lon, km), mm = {}, R = ring0(radios), j, k, e, mi, p, d, mu = [];
    for (j = 0; j < c.ci.length; j++) {
      mi = MG.m[c.ci[j]]; p = MG.p[c.ci[j]]; d = c.cd[j]; e = mm[mi] || (mm[mi] = {pr: 0, d: 1e9, rg: radios.map(function () { return 0; })});
      e.pr += p; if (d < e.d) e.d = d;
      for (k = 0; k < radios.length; k++) if (d <= radios[k]) { R[k].pob += p; e.rg[k] += p; }
    }
    Object.keys(mm).forEach(function (q) { var m = T.M[MG.munis[q]]; if (m) mu.push({m: m, d: mm[q].d, pr: mm[q].pr, rg: mm[q].rg}); });
    var ya = T.donde ? T.donde(lat, lon) : null;
    if (ya) { var h = mu.filter(function (x) { return x.m === ya; })[0]; if (h) h.en = true; else mu.push({m: ya, d: 0, pr: 0, rg: radios.map(function () { return 0; }), en: true}); }
    mu.sort(function (a, b) { return a.d - b.d; });
    R.forEach(function (o, q) { mu.forEach(function (x) { if (x.rg[q] > 0 || x.en) o.n++; }); });
    T.lista.forEach(function (m) { if (m.pob == null) { var c0 = cen(m), d0 = hav(lat, lon, c0[1], c0[0]); R.forEach(function (o) { if (d0 <= o.km) o.sd++; }); } });
    return {mu: mu, R: R, grid: true, km: km, cel: c};
  }
  function expoMun(lat, lon, radios, km) {
    var mu = []; T.lista.forEach(function (m) { var c = cen(m), d = hav(lat, lon, c[1], c[0]); if (d <= km) mu.push({m: m, d: d}); });
    var ya = T.donde ? T.donde(lat, lon) : null;
    if (ya) { var h = mu.filter(function (x) { return x.m === ya; })[0]; if (h) h.en = true; else { var c0 = cen(ya); mu.push({m: ya, d: hav(lat, lon, c0[1], c0[0]), en: true}); } }
    mu.sort(function (a, b) { return a.d - b.d; });
    var R = ring0(radios); R.forEach(function (o) { mu.forEach(function (x) { if (x.d <= o.km || x.en) { o.n++; if (x.m.pob == null) o.sd++; else o.pob += x.m.pob; } }); });
    return {mu: mu, R: R};
  }
  /* exposición alrededor de un punto: radios en km; km = radio máximo de búsqueda */
  function expo(lat, lon, radios, km) {
    var E = MG ? expoMalla(lat, lon, radios, km) : expoMun(lat, lon, radios, km), C = cerca(lat, lon, km);
    E.R.forEach(function (o) { C.forEach(function (x) { if (x.d <= o.km) { var k = x.p.k === "res" ? "bom" : x.p.k; o[k]++; } }); });
    E.C = C; E.lat = lat; E.lon = lon; return E;
  }
  function popX(x, E) { return E && E.grid ? x.pr : x.m.pob; }
  function habX(x, E) { var v = popX(x, E); return v != null ? fmtP(v) : "s/d"; }
  function cabHab(E) { return E && E.grid ? "En el radio" : "Hab."; }
  /* municipios principales: el del punto primero, luego por habitantes (dentro del radio si hay malla) */
  function principales(E, n) { return E.mu.slice().sort(function (a, b) { return (b.en ? 1 : 0) - (a.en ? 1 : 0) || (popX(b, E) || 0) - (popX(a, E) || 0); }).slice(0, n); }
  function notaPob(E) {
    var R = E.R[E.R.length - 1], sd = R.sd ? ' ' + R.sd + ' municipio(s) sin dato de población.' : '';
    if (E.grid) return 'Población = celdas de ~1 km cuyo centro cae dentro del radio (malla WorldPop repartida dentro de cada municipio y reescalada a su total INE ' + esc(MG.meta.anio_ine) + '). «Distancia» = a la celda habitada más cercana del municipio. Establecimientos y servicios: OpenStreetMap, cobertura incompleta.' + sd;
    return 'Población = municipios cuyo centro cae dentro del radio, más el municipio donde está el punto (estimación INE; se cuenta el municipio entero). Establecimientos y servicios: OpenStreetMap, cobertura incompleta.' + sd;
  }
  function leyendaPob(celdas) {
    if (celdas === false || !MG) return '<div class="glg"><b>Población del municipio</b><div><span class="gesc">' + [["#c9b8ff", "< 1 mil"], ["#a68cff", "1–5 mil"], ["#8461f0", "5–20 mil"], ["#6338d6", "20–100 mil"], ["#3f1fa3", "> 100 mil"]].map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + x[1] + '</span>'; }).join("") + '</span></div></div>';
    return '<div class="glg"><b>Población por celda de ~1 km</b><div><span class="gesc">' + PAL.map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + x[1] + '</span>'; }).join("") + '</span><br><small>hab./km² · WorldPop repartida y reescalada al total INE de cada municipio</small></div></div>';
  }
  /* capa de celdas (se dibuja bajo los contornos); evitar = capas del módulo que tienen su propia ventanita al pasar el cursor */
  function capaMalla(map, evitar) {
    if (map.getSource("pg")) return;
    map.addSource("pg", {type: "geojson", data: fc([])});
    map.addLayer({id: "pg-f", type: "fill", source: "pg", paint: {"fill-color": ["step", ["get", "h"], PAL[0][0], 10, PAL[1][0], 50, PAL[2][0], 250, PAL[3][0], 1000, PAL[4][0], 5000, PAL[5][0]], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, .6, 10, .7], "fill-antialias": false}});
    var pg = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8, maxWidth: "260px"}), otras = ["inf-s", "inf-e"].concat(evitar || []);
    map.on("mousemove", "pg-f", function (e) {
      var ls = otras.filter(function (id) { return map.getLayer(id); });
      if (ls.length && map.queryRenderedFeatures(e.point, {layers: ls}).length) { pg.remove(); return; }
      var p = e.features[0].properties; map.getCanvas().style.cursor = "help";
      pg.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">≈ ' + A.fmt(+p.p) + ' hab.</b>celda de ~1 km · ' + fmt(+p.h, 0) + ' hab./km²<br>' + esc(p.n) + '<br><i>estimación: WorldPop reescalada al total INE</i></div>').addTo(map);
    });
    map.on("mouseleave", "pg-f", function () { pg.remove(); map.getCanvas().style.cursor = ""; });
  }
  function pintaMalla(map, E) {
    if (!map || !map._ok || !map.getSource("pg")) return;
    var g = !!(E && E.grid && MG), f = [];
    if (g) {
      var G = MG.g, h2 = G.d / 2, kx = Math.pow(G.d * 111.32, 2), r5 = function (v) { return Math.round(v * 1e5) / 1e5; };
      E.cel.ci.forEach(function (i) {
        var la = MG.lat[i], lo = MG.lon[i], p = MG.p[i], a = kx * Math.cos(la * Math.PI / 180), nm = MG.munis[MG.m[i]].split("|")[1];
        f.push({type: "Feature", geometry: {type: "Polygon", coordinates: [[[r5(lo - h2), r5(la - h2)], [r5(lo + h2), r5(la - h2)], [r5(lo + h2), r5(la + h2)], [r5(lo - h2), r5(la + h2)], [r5(lo - h2), r5(la - h2)]]]}, properties: {p: p, h: Math.round(p / a * 10) / 10, n: nm}});
      });
    }
    map.getSource("pg").setData(fc(f));
    if (map.getLayer("ex-f")) map.setPaintProperty("ex-f", "fill-opacity", g ? 0 : .5);
  }
  function primero(C, ks) { for (var i = 0; i < C.length; i++) if (ks.indexOf(C[i].p.k) >= 0) return C[i]; return null; }
  function filaR(t, f) { return '<tr><td>' + t + '</td>' + f.map(function (v) { return '<td style="text-align:right">' + v + '</td>'; }).join("") + '</tr>'; }
  function tablaAn(R) {
    return '<table class="xt2 gfi-t"><tr><td></td>' + R.map(function (r) { return '<td style="text-align:right"><b>≤ ' + r.km + ' km</b></td>'; }).join("") + '</tr>' +
      filaR("Municipios", R.map(function (r) { return r.n; })) + filaR(MG ? "Población (malla)" : "Población (est.)", R.map(function (r) { return r.n ? fmtP(r.pob) : "—"; })) +
      filaR(ico("hosp") + 'Hospitales', R.map(function (r) { return r.hosp; })) + filaR(ico("cli") + 'Centros, puestos, clínicas', R.map(function (r) { return r.cli; })) + filaR(ico("cons") + 'Consultorios', R.map(function (r) { return r.cons; })) +
      filaR(ico("bom") + 'Bomberos y rescate', R.map(function (r) { return r.bom; })) + filaR(ico("pol") + 'Policía', R.map(function (r) { return r.pol; })) + '</table>';
  }
  function legendaInfra() {
    return leyendaPob() +
      '<div class="glg"><b>Infraestructura (OpenStreetMap)</b><div>' + ["hosp", "cli", "cons", "bom", "pol"].map(function (k) { return '<span class="gic">' + ico(k, 18) + ICO[k].n + '</span>'; }).join("") + '</div></div>';
  }

  /* ---------- iconos: cada clase tiene forma y color propios (los peligros son círculos o triángulos; los servicios, formas con glifo) ---------- */
  function estrella(r1, r2) { var p = [], k, a; for (k = 0; k < 10; k++) { a = (-90 + 36 * k) * Math.PI / 180; p.push((24 + (k % 2 ? r2 : r1) * Math.cos(a)).toFixed(1) + " " + (24 + (k % 2 ? r2 : r1) * Math.sin(a)).toFixed(1)); } return "M" + p.join("L") + "Z"; }
  var RR = "M14 6H34Q42 6 42 14V34Q42 42 34 42H14Q6 42 6 34V14Q6 6 14 6Z";
  var ICO = {
    hosp: {f: "#1b8a4e", d: RR, g: "M15 13h5v8h8v-8h5v22h-5v-9h-8v9h-5Z", gc: "#fff", n: "Hospital"},
    cli: {f: "#2fae6c", d: RR, g: "M21 12h6v9h9v6h-9v9h-6v-9h-9v-6h9Z", gc: "#fff", n: "Centro / puesto / clínica"},
    cons: {f: "#a7dcbf", d: RR, g: "M21 12h6v9h9v6h-9v9h-6v-9h-9v-6h9Z", gc: "#14532d", n: "Consultorio"},
    bom: {f: "#b3261e", d: "M24 2L46 24L24 46L2 24Z", g: "M25 9C25.5 15 33 19 33 28C33 35 28.500 39 24 39C19.500 39 15 35 15 28C15 23.500 17.500 20.500 20 17.500C20.500 21 22 22.500 23.500 23C22.500 18.500 22.500 13 25 9Z", gc: "#fff", n: "Bomberos / rescate"},
    pol: {f: "#1d4ed8", d: "M24 3L42 9L41 26Q39 38 24 45Q9 38 7 26L6 9Z", g: estrella(9.5, 4), gc: "#fff", n: "Policía"},
    der: {f: "#8a4b1f", d: "M24 4L45 41L3 41Z", g: "M21.2 17h5.6l-1 14h-3.6ZM24 33.4a3 3 0 1 1 0 6a3 3 0 1 1 0-6Z", gc: "#fff", n: "Derrumbe / deslizamiento"}
  };
  function icono(map, k) {
    var I = ICO[k], c = document.createElement("canvas"); c.width = c.height = 48; var g = c.getContext("2d"), p = new Path2D(I.d);
    g.lineJoin = "round"; g.strokeStyle = "#fff"; g.lineWidth = 5; g.stroke(p); g.fillStyle = I.f; g.fill(p); g.fillStyle = I.gc; g.fill(new Path2D(I.g));
    if (!map.hasImage("i-" + k)) map.addImage("i-" + k, g.getImageData(0, 0, 48, 48), {pixelRatio: 2});
  }
  function iconos(map) { Object.keys(ICO).forEach(function (k) { icono(map, k); }); }
  /* el mismo dibujo, en SVG, para leyendas y tablas */
  function ico(k, px) { var I = ICO[k]; return '<svg class="gs" viewBox="0 0 48 48" width="' + (px || 16) + '" height="' + (px || 16) + '" aria-hidden="true"><path d="' + I.d + '" fill="' + I.f + '" stroke="#fff" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke"/><path d="' + I.g + '" fill="' + I.gc + '"/></svg>'; }
  var BASES = function (osc) { return {
    calles: {t: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], a: "© colaboradores de OpenStreetMap", z: 19, p: osc ? {"raster-brightness-max": .82, "raster-saturation": -.2} : {}},
    calles2: {t: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"], a: "© Esri, HERE, Garmin, OpenStreetMap", z: 19, p: osc ? {"raster-brightness-max": .82, "raster-saturation": -.2} : {}},
    topo: {t: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"], a: "© Esri, HERE, Garmin, OSM", z: 17, p: {}},
    sat: {t: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], a: "Imagen © Esri, Maxar", z: 17, p: {}}}; };
  /* «calles» (OpenStreetMap) y su respaldo «calles2» (Esri) no necesitan clave; CARTO pasó a exigirla */
  var BK = ["calles", "calles2", "topo", "sat"], SIG = {calles: "calles2", calles2: "topo"}, ALIAS = {calles2: "calles"};
  function estiloBase(osc) {
    var B = BASES(osc), src = {}, lay = [{id: "bg", type: "background", paint: {"background-color": X.css("--soft") || "#e6ebf2"}}];
    BK.forEach(function (k) { src["b-" + k] = {type: "raster", tiles: B[k].t, tileSize: 256, maxzoom: B[k].z, attribution: B[k].a}; lay.push({id: "b-" + k, type: "raster", source: "b-" + k, paint: B[k].p, layout: {visibility: k === "calles" ? "visible" : "none"}}); });
    return {version: 8, sources: src, layers: lay};
  }
  function baseVis(map, id) { BK.forEach(function (k) { map.setLayoutProperty("b-" + k, "visibility", k === id ? "visible" : "none"); }); }

  /* o: {id, av, tool, bajo(map), alto(map), listo(map), refInfra} */
  function crear(o) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark", st = {act: "calles", ok: {}, err: {}}, av = document.getElementById(o.av), tool = o.tool;
    var map = new maplibregl.Map({container: o.id, style: estiloBase(osc), bounds: [[-70.2, -23.2], [-56.8, -8.8]], fitBoundsOptions: {padding: 10}, attributionControl: {compact: true}});
    map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); map.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-right");
    var pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 10, maxWidth: "300px"}); map._pop = pop;
    function botones() { return [].slice.call(document.querySelectorAll(tool + " button[data-b]")); }
    function pon(id) { st.act = id; baseVis(map, id); botones().forEach(function (z) { z.classList.toggle("on", z.dataset.b === (ALIAS[id] || id)); }); if (id === "none" || st.ok[id] || !st.err[id]) av.hidden = true; }
    function fallo(id) {
      if (id !== st.act || st.ok[id]) return; st.err[id] = (st.err[id] || 0) + 1; if (st.err[id] < 4) return;
      var sig = SIG[id]; if (sig && !st.err[sig]) { pon(sig); return; }
      av.hidden = false; av.innerHTML = 'No se pudo cargar el mapa base (sin conexión con el servidor de mapas o bloqueo de la red). <b>Los municipios y las capas del módulo se muestran igual.</b> <button class="xlink" type="button" id="' + o.av + 'R">Reintentar</button>';
      document.getElementById(o.av + "R").onclick = function () { st.err = {}; st.ok = {}; av.hidden = true; pon("calles"); };
    }
    map.on("error", function (e) { if (e && e.sourceId && e.sourceId.indexOf("b-") === 0) fallo(e.sourceId.slice(2)); else if (e && e.error) console.warn("MAPAZ " + e.error.message); });
    map.on("data", function (e) { if (e.sourceId && e.sourceId.indexOf("b-") === 0 && e.tile) { var id = e.sourceId.slice(2); st.ok[id] = 1; if (id === st.act) av.hidden = true; } });
    botones().forEach(function (b) { b.onclick = function () { if (b.dataset.b === "none") { baseVis(map, "none"); botones().forEach(function (z) { z.classList.toggle("on", z === b); }); st.act = "none"; av.hidden = true; } else { st.err[b.dataset.b] = 0; pon(b.dataset.b); } }; });
    map.on("load", function () {
      iconos(map);
      map.addSource("dep", {type: "geojson", data: fc(T.D.geoDep.features)}); map.addSource("mun", {type: "geojson", data: fc(((T.D.geoMun || {}).features) || [])});
      map.addSource("ex", {type: "geojson", data: fc([])}); map.addSource("an", {type: "geojson", data: fc([])}); map.addSource("inf", {type: "geojson", data: fc([])});
      map.addLayer({id: "d-f", type: "fill", source: "dep", paint: {"fill-color": "#ffffff", "fill-opacity": osc ? .05 : .03}});
      LUGAR.capa(map);
      if (o.bajo) o.bajo(map);
      map.addLayer({id: "ex-f", type: "fill", source: "ex", paint: {"fill-color": ["case", ["<", ["get", "pob"], 0], "#9aa3b2", ["step", ["get", "pob"], "#c9b8ff", 1000, "#a68cff", 5000, "#8461f0", 20000, "#6338d6", 100000, "#3f1fa3"]], "fill-opacity": .5}});
      capaMalla(map, o.evitar);
      map.addLayer({id: "ex-l", type: "line", source: "ex", paint: {"line-color": osc ? "#ffffff" : "#25165c", "line-width": 1.1, "line-opacity": .75}});
      map.addLayer({id: "m-l", type: "line", source: "mun", minzoom: 6, paint: {"line-color": osc ? "#ffffff" : "#10233d", "line-width": .5, "line-opacity": .22}});
      map.addLayer({id: "d-l", type: "line", source: "dep", paint: {"line-color": osc ? "#e6efff" : "#10233d", "line-width": 1.3, "line-opacity": .8}});
      map.addLayer({id: "an-f", type: "fill", source: "an", paint: {"fill-color": "#f26a1b", "fill-opacity": ["match", ["get", "r"], 10, .16, 25, .12, 50, .09, .06]}});
      map.addLayer({id: "an-l", type: "line", source: "an", paint: {"line-color": "#f26a1b", "line-width": 1.6, "line-dasharray": [3, 2]}});
      if (o.alto) o.alto(map);
      var ik = function (a, z) { return ["interpolate", ["linear"], ["zoom"], 6, a, 12, z]; }, ikm = function (h, c, ot, h2, c2, o2) { return ["interpolate", ["linear"], ["zoom"], 6, ["match", ["get", "k"], "hosp", h, "cli", c, ot], 12, ["match", ["get", "k"], "hosp", h2, "cli", c2, o2]]; };
      map.addLayer({id: "inf-s", type: "symbol", source: "inf", filter: ["in", ["get", "k"], ["literal", ["hosp", "cli", "cons"]]], layout: {"icon-image": ["match", ["get", "k"], "hosp", "i-hosp", "cli", "i-cli", "i-cons"], "icon-size": ikm(.9, .75, .6, 1.5, 1.25, 1.0), "icon-allow-overlap": true, "icon-ignore-placement": true}});
      map.addLayer({id: "inf-e", type: "symbol", source: "inf", filter: ["in", ["get", "k"], ["literal", ["bom", "res", "pol"]]], layout: {"icon-image": ["match", ["get", "k"], "pol", "i-pol", "i-bom"], "icon-size": ik(.8, 1.3), "icon-allow-overlap": true, "icon-ignore-placement": true}});
      ["inf-s", "inf-e"].forEach(function (L) {
        map.on("mousemove", L, function (e) { var p = e.features[0].properties; map.getCanvas().style.cursor = "help"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.n) + '</b>' + esc(INFN[p.k]) + (p.e && p.e !== "general" ? ' · ' + esc(p.e) : '') + (p.op ? ' · ' + esc(p.op) : '') + '<br>a ' + fmt(+p.d, 1) + ' km ' + esc(o.refInfra || "del punto") + (p.m ? ' · ' + esc(p.m) : '') + '<br><i>OpenStreetMap: cobertura incompleta</i></div>').addTo(map); });
        map.on("mouseleave", L, function () { pop.remove(); map.getCanvas().style.cursor = ""; });
      });
      map._ok = 1; if (o.listo) o.listo(map);
    });
    return map;
  }
  function vis(map, id, on) { if (map && map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none"); if (id === "ex-f" && map && map.getLayer("pg-f")) map.setLayoutProperty("pg-f", "visibility", on ? "visible" : "none"); }
  /* dibuja la selección: exposición (municipios), anillos e infraestructura */
  function selec(map, E, radios) {
    if (!map || !map._ok) return;
    map.getSource("ex").setData(fc(E ? E.mu.map(function (x) { return {type: "Feature", geometry: x.m.f.geometry, properties: {pob: x.m.pob == null ? -1 : x.m.pob, n: x.m.n}}; }) : []));
    map.getSource("an").setData(fc(E ? radios.slice().sort(function (a, b) { return b - a; }).map(function (r) { return {type: "Feature", geometry: {type: "Polygon", coordinates: [circulo(E.lat, E.lon, r)]}, properties: {r: r}}; }) : []));
    map.getSource("inf").setData(fc(E ? E.C.map(function (x) { return {type: "Feature", geometry: {type: "Point", coordinates: [x.p.lon, x.p.lat]}, properties: {k: x.p.k, n: x.p.n, d: +x.d.toFixed(1), op: x.p.op, m: x.p.mun, e: x.p.esp}}; }) : []));
    pintaMalla(map, E);
  }
  return {iniciar: iniciar, crear: crear, iconos: iconos, ico: ico, estiloBase: estiloBase, baseVis: baseVis, SIG: SIG, ALIAS: ALIAS, expo: expo, malla: malla, hayMalla: hayMalla, capaMalla: capaMalla, pintaMalla: pintaMalla, leyendaPob: leyendaPob, notaPob: notaPob, principales: principales, habX: habX, cabHab: cabHab, cerca: cerca, primero: primero, tablaAn: tablaAn, legendaInfra: legendaInfra, selec: selec, vis: vis, hav: hav, circulo: circulo, fc: fc, cen: cen, fmtP: fmtP, fmt: fmt, esc: esc};
})();

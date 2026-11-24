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
      mi = MG.m[c.ci[j]]; p = MG.p[c.ci[j]]; d = c.cd[j]; e = mm[mi] || (mm[mi] = {pr: 0, d: 1e9, la: 0, lo: 0, rg: radios.map(function () { return 0; })});
      e.pr += p; e.la += MG.lat[c.ci[j]] * p; e.lo += MG.lon[c.ci[j]] * p; if (d < e.d) e.d = d;
      for (k = 0; k < radios.length; k++) if (d <= radios[k]) { R[k].pob += p; e.rg[k] += p; }
    }
    Object.keys(mm).forEach(function (q) { var m = T.M[MG.munis[q]]; if (m) mu.push({m: m, d: mm[q].d, pr: mm[q].pr, rg: mm[q].rg, la: mm[q].pr ? mm[q].la / mm[q].pr : null, lo: mm[q].pr ? mm[q].lo / mm[q].pr : null}); });
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
  /* celdas de un municipio (para dibujar dónde vive la gente dentro de él); null si no hay malla */
  function mallaMun(key) {
    if (!MG) return null; var q = MG.munis.indexOf(key); if (q < 0) return null;
    var ci = [], pob = 0, i; for (i = 0; i < MG.n; i++) if (MG.m[i] === q) { ci.push(i); pob += MG.p[i]; }
    return {grid: true, cel: {ci: ci, cd: ci.map(function () { return 0; })}, pob: pob, n: ci.length, anio: MG.meta.anio_ine};
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
    if (celdas === false || !MG) return '<div class="glg"><b>Población del municipio</b><div><span class="gesc">' + [["#c9b8ff", "< 1 mil"], ["#a68cff", "1–5 mil"], ["#8461f0", "5–20 mil"], ["#6338d6", "20–100 mil"], ["#3f1fa3", "> 100 mil"]].map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + x[1] + '</span>'; }).join("") + '</span></div><div class="gbub"><i></i> Burbuja = habitantes del municipio (el área es proporcional)</div></div>';
    return '<div class="glg"><b>Población por celda de ~1 km</b><div><span class="gesc">' + PAL.map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + x[1] + '</span>'; }).join("") + '</span><br><small>hab./km² · WorldPop repartida y reescalada al total INE de cada municipio</small></div><div class="gbub"><i></i> Burbuja = habitantes del municipio dentro del radio (el área es proporcional)</div></div>';
  }
  /* capa de celdas (se dibuja bajo los contornos); evitar = capas del módulo que tienen su propia ventanita al pasar el cursor */
  function capaMalla(map, evitar) {
    if (map.getSource("pg")) return;
    map.addSource("pg", {type: "geojson", data: fc([])});
    map.addLayer({id: "pg-f", type: "fill", source: "pg", paint: {"fill-color": ["step", ["get", "h"], PAL[0][0], 10, PAL[1][0], 50, PAL[2][0], 250, PAL[3][0], 1000, PAL[4][0], 5000, PAL[5][0]], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, .6, 10, .7], "fill-antialias": false}});
    var pg = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8, maxWidth: "260px"}), otras = ["inf-c", "inf-s", "inf-e", "pb-c"].concat(evitar || []);
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
    if (map.getLayer("ex-f")) map.setPaintProperty("ex-f", "fill-opacity", g ? 0 : .14);
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

  /* ---------- pronóstico de modelo (Open-Meteo, consultado desde el navegador): lo comparten Meteorológica e Hidrológica ----------
     ~270 puntos (9 capitales + una rejilla de 1° dentro de Bolivia), 7 días: tx, tn (°C), pp (mm), ra (ráfaga km/h). Caché de 1 h en el navegador. */
  var CAPS = [["La Paz", -16.50, -68.15, "La Paz"], ["Santa Cruz", -17.78, -63.18, "Santa Cruz"], ["Cochabamba", -17.39, -66.16, "Cochabamba"], ["Oruro", -17.97, -67.11, "Oruro"], ["Potosí", -19.58, -65.75, "Potosí"], ["Sucre", -19.04, -65.26, "Chuquisaca"], ["Tarija", -21.53, -64.73, "Tarija"], ["Trinidad", -14.83, -64.90, "Beni"], ["Cobija", -11.02, -68.77, "Pando"]];
  var PRON = {estado: "idle", pts: [], dias: [], msg: "", t: 0}, PRONL = [];
  function rejilla() {
    var P = [], la, lo; T.lista.forEach(function (m) { cen(m); });
    for (la = -22.5; la <= -9.5; la += 1) for (lo = -69.5; lo <= -57.5; lo += 1) {
      var ok = !!T.donde(la, lo); if (!ok) for (var i = 0; i < T.lista.length; i++) { var c = T.lista[i]._c; if (Math.abs(c[1] - la) < 1 && Math.abs(c[0] - lo) < 1 && hav(la, lo, c[1], c[0]) <= 70) { ok = true; break; } }
      if (ok && !CAPS.some(function (c) { return hav(la, lo, c[1], c[2]) < 70; })) P.push([la, lo]);
    }
    return P;
  }
  function puntosPron() { var P = CAPS.map(function (c) { return {n: c[0], lat: c[1], lon: c[2], dep: c[3], cap: 1}; }); rejilla().forEach(function (g) { P.push({n: null, lat: g[0], lon: g[1], cap: 0}); }); return P; }
  function nombrePunto(p) { if (p.n) return p.n; var m = T.donde(p.lat, p.lon); if (!m) { var b = null, bd = 1e9; T.lista.forEach(function (z) { var c = cen(z), d = hav(p.lat, p.lon, c[1], c[0]); if (d < bd) { bd = d; b = z; } }); return b ? "cerca de " + b.n : "punto del modelo"; } return m.n; }
  function pron(fn, forzar) {
    if (fn) PRONL.push(fn);
    var fin = function () { PRONL.splice(0).forEach(function (f) { try { f(PRON); } catch (e) { console.error(e); } }); };
    if (PRON.estado === "cargando") return;
    if (PRON.estado === "ok" && !forzar) { fin(); return; }
    PRON.estado = "cargando"; PRON.msg = "";
    var KEY = "sala_pron_v1", ahora = Date.now();
    try { var c = !forzar && JSON.parse(localStorage.getItem(KEY) || "null"); if (c && ahora - c.t < 60 * 6e4 && c.pts && c.pts.length) { PRON.pts = c.pts; PRON.dias = c.dias; PRON.t = c.t; PRON.estado = "ok"; fin(); return; } } catch (e) {}
    var P = puntosPron(), u = "https://api.open-meteo.com/v1/forecast?latitude=" + P.map(function (g) { return g.lat; }).join(",") + "&longitude=" + P.map(function (g) { return g.lon; }).join(",") + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&timezone=America%2FLa_Paz&forecast_days=7";
    fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status === 429 ? "el servicio limitó las consultas (error 429); reintente en unos minutos" : "el servicio respondió " + r.status); return r.json(); }).then(function (j) {
      var arr = Array.isArray(j) ? j : [j], rd = function (v) { return (v || []).map(function (x) { return x == null ? null : Math.round(x * 10) / 10; }); };
      P.forEach(function (p, i) { var d = (arr[i] || {}).daily || {}; p.tx = rd(d.temperature_2m_max); p.tn = rd(d.temperature_2m_min); p.pp = rd(d.precipitation_sum); p.ra = rd(d.wind_gusts_10m_max); });
      PRON.pts = P.filter(function (p) { return p.tx.length; }); PRON.dias = ((arr[0] || {}).daily || {}).time || []; PRON.t = Date.now(); PRON.estado = PRON.pts.length ? "ok" : "error"; if (!PRON.pts.length) PRON.msg = "respuesta vacía";
      try { if (PRON.pts.length) localStorage.setItem(KEY, JSON.stringify({t: PRON.t, pts: PRON.pts, dias: PRON.dias})); } catch (e) {}
      fin();
    }).catch(function (e) { PRON.estado = "error"; PRON.msg = (e && e.message && !/failed to fetch|networkerror|load failed/i.test(e.message)) ? e.message : "sin conexión con Open-Meteo (red o bloqueo del navegador)"; fin(); });
  }

  /* ---------- iconos: cada clase tiene forma y color propios (los peligros son círculos o triángulos; los servicios, formas con glifo) ---------- */
  function estrella(r1, r2) { var p = [], k, a; for (k = 0; k < 10; k++) { a = (-90 + 36 * k) * Math.PI / 180; p.push((24 + (k % 2 ? r2 : r1) * Math.cos(a)).toFixed(1) + " " + (24 + (k % 2 ? r2 : r1) * Math.sin(a)).toFixed(1)); } return "M" + p.join("L") + "Z"; }
  var RR = "M14 6H34Q42 6 42 14V34Q42 42 34 42H14Q6 42 6 34V14Q6 6 14 6Z";
  var HEX = "M24 3L43 13.5V34.5L24 45L5 34.5V13.5Z";
  /* banda ondulada de 4 unidades de alto, centrada en y0 (glifo de agua) */
  function onda(y0) { var a = [], b = [], i, x, y; for (i = 0; i <= 16; i++) { x = 10 + i * 1.75; y = y0 + 2.4 * Math.sin((x - 10) / 28 * Math.PI * 3); a.push(x.toFixed(1) + " " + y.toFixed(1)); b.unshift(x.toFixed(1) + " " + (y + 4).toFixed(1)); } return "M" + a.concat(b).join("L") + "Z"; }
  var ICO = {
    hosp: {f: "#1b8a4e", d: RR, g: "M15 13h5v8h8v-8h5v22h-5v-9h-8v9h-5Z", gc: "#fff", n: "Hospital"},
    cli: {f: "#2fae6c", d: RR, g: "M21 12h6v9h9v6h-9v9h-6v-9h-9v-6h9Z", gc: "#fff", n: "Centro / puesto / clínica"},
    cons: {f: "#a7dcbf", d: RR, g: "M21 12h6v9h9v6h-9v9h-6v-9h-9v-6h9Z", gc: "#14532d", n: "Consultorio"},
    bom: {f: "#b3261e", d: "M24 2L46 24L24 46L2 24Z", g: "M25 9C25.5 15 33 19 33 28C33 35 28.500 39 24 39C19.500 39 15 35 15 28C15 23.500 17.500 20.500 20 17.500C20.500 21 22 22.500 23.500 23C22.500 18.500 22.500 13 25 9Z", gc: "#fff", n: "Bomberos / rescate"},
    pol: {f: "#1d4ed8", d: "M24 3L42 9L41 26Q39 38 24 45Q9 38 7 26L6 9Z", g: estrella(9.5, 4), gc: "#fff", n: "Policía"},
    der: {f: "#8a4b1f", d: "M24 4L45 41L3 41Z", g: "M21.2 17h5.6l-1 14h-3.6ZM24 33.4a3 3 0 1 1 0 6a3 3 0 1 1 0-6Z", gc: "#fff", n: "Derrumbe / deslizamiento"},
    /* fenómenos meteorológicos: hexágonos (forma que no usa ningún otro tipo de hecho) con un glifo y un color por fenómeno */
    vie: {f: "#0f8b8d", d: HEX, g: "M15 15h16a2 2 0 0 1 0 4H15a2 2 0 0 1 0-4ZM13 22h22a2 2 0 0 1 0 4H13a2 2 0 0 1 0-4ZM18 29h10a2 2 0 0 1 0 4H18a2 2 0 0 1 0-4Z", gc: "#fff", n: "Viento"},
    llu: {f: "#2563eb", d: HEX, g: "M27.5 7.5L14 26.5h8.2L19.5 40.5L34 20.5h-9Z", gc: "#fff", n: "Lluvia con tormenta eléctrica"},
    fri: {f: "#7c3aed", d: HEX, g: "M19 12a3 3 0 0 1 6 0v14.2a7 7 0 1 1-6 0ZM30 16h9l-4.5 8Z", gc: "#fff", n: "Descenso de temperatura / helada"},
    cal: {f: "#db2777", d: HEX, g: "M24 17.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13ZM34.5 22.1L40 22.1L40 25.9L34.5 25.9ZM32.8 30.1L36.7 34L34 36.7L30.1 32.8ZM25.9 34.5L25.9 40L22.1 40L22.1 34.5ZM17.9 32.8L14 36.7L11.3 34L15.2 30.1ZM13.5 25.9L8 25.9L8 22.1L13.5 22.1ZM15.2 17.9L11.3 14L14 11.3L17.9 15.2ZM22.1 13.5L22.1 8L25.9 8L25.9 13.5ZM30.1 15.2L34 11.3L36.7 14L32.8 17.9Z", gc: "#fff", n: "Ascenso de temperatura / calor"},
    gra: {f: "#475569", d: HEX, g: "M17 14.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9ZM31 14.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9ZM24 25.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9Z", gc: "#fff", n: "Granizada"},
    nev: {f: "#38bdf8", d: HEX, g: "M9.5 22.1L38.5 22.1L38.5 25.9L9.5 25.9ZM18.4 10.5L32.9 35.6L29.6 37.5L15.1 12.4ZM32.9 12.4L18.4 37.5L15.1 35.6L29.6 10.5Z", gc: "#0c4a6e", n: "Nevada"},
    otr: {f: "#64748b", d: HEX, g: "M21.2 12h5.6l-1 17h-3.6ZM24 31.4a3 3 0 1 1 0 6a3 3 0 1 1 0-6Z", gc: "#fff", n: "Otro fenómeno"},
    fle: {f: "#0f8b8d", d: "M24 3L41 28H29.5V45H18.5V28H7Z", g: "", gc: "#fff", n: "Dirección del viento"},
    ola: {f: "#0369a1", d: HEX, g: onda(13) + onda(22) + onda(31), gc: "#fff", n: "Aviso hidrológico"}
  };
  /* color mezclado con blanco ("w") o negro ("b") en proporción t */
  function mez(h, c, t) { var n = parseInt(h.slice(1), 16), v = [n >> 16, (n >> 8) & 255, n & 255], d = c === "w" ? 255 : 0; return "rgb(" + v.map(function (x) { return Math.round(x + (d - x) * t); }).join(",") + ")"; }
  /* dibuja un ícono en un contexto 2D: s = píxeles por unidad (la figura mide 48 u; deja 6 u de margen para la sombra).
     Capas: sombra suave, aro blanco, relleno con degradado, brillo superior y glifo con relieve ligero. */
  function pinta(g, k, s) {
    var I = ICO[k], p = new Path2D(I.d), q = new Path2D(I.g), gr;
    g.save(); g.scale(s, s); g.translate(6, 6); g.lineJoin = "round"; g.lineCap = "round";
    g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 3.6 * s; g.shadowOffsetY = 1.5 * s; g.strokeStyle = "#fff"; g.lineWidth = 4.8; g.stroke(p); g.restore();
    g.strokeStyle = "#fff"; g.lineWidth = 4.8; g.stroke(p);
    gr = g.createLinearGradient(0, 3, 0, 45); gr.addColorStop(0, mez(I.f, "w", .2)); gr.addColorStop(1, mez(I.f, "b", .2));
    g.fillStyle = gr; g.strokeStyle = gr; g.lineWidth = 2.4; g.fill(p); g.stroke(p);
    g.save(); g.clip(p); gr = g.createLinearGradient(0, 2, 0, 28); gr.addColorStop(0, "rgba(255,255,255,.34)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 48, 30);
    g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = 1.2; g.stroke(p); g.restore();
    g.save(); g.shadowColor = "rgba(0,0,0,.3)"; g.shadowBlur = 1.3 * s; g.shadowOffsetY = .7 * s; g.fillStyle = I.gc; g.fill(q); g.restore();
    g.restore();
  }
  function icono(map, k) {
    if (map.hasImage("i-" + k)) return;
    var dpr = window.devicePixelRatio || 1, s = dpr >= 1.5 ? 3 : 2, c = document.createElement("canvas"); c.width = c.height = 60 * s;
    pinta(c.getContext("2d"), k, s);
    map.addImage("i-" + k, c.getContext("2d").getImageData(0, 0, c.width, c.height), {pixelRatio: s * 2});
  }
  function iconos(map) { Object.keys(ICO).forEach(function (k) { icono(map, k); }); }
  /* el mismo dibujo, en SVG, para leyendas y tablas (el brillo usa un degradado compartido) */
  function defsSvg() {
    if (document.getElementById("mz-defs")) return;
    var d = document.createElement("div"); d.id = "mz-defs"; d.setAttribute("aria-hidden", "true"); d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    d.innerHTML = '<svg width="0" height="0"><defs><linearGradient id="mz-gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs></svg>';
    (document.body || document.documentElement).appendChild(d);
  }
  function ico(k, px) {
    var I = ICO[k]; defsSvg();
    return '<svg class="gs" viewBox="-4 -4 56 56" width="' + (px || 16) + '" height="' + (px || 16) + '" aria-hidden="true"><path d="' + I.d + '" fill="' + I.f + '" stroke="#fff" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/><path d="' + I.d + '" fill="url(#mz-gl)"/><path d="' + I.g + '" fill="' + I.gc + '"/></svg>';
  }
  var BASES = function (osc) { return {
    osm: {t: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], a: "© colaboradores de OpenStreetMap", z: 19, p: osc ? {"raster-brightness-max": .82, "raster-saturation": -.2} : {}},
    calles2: {t: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"], a: "© Esri, HERE, Garmin, OpenStreetMap", z: 19, p: osc ? {"raster-brightness-max": .82, "raster-saturation": -.2} : {}},
    topo: {t: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"], a: "© Esri, HERE, Garmin, OSM", z: 17, p: {}},
    sat: {t: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], a: "Imagen © Esri, Maxar", z: 17, p: {}}}; };
  /* «calles» = mapa vectorial de OpenFreeMap (base_vec.js): se redibuja nítido a cada acercamiento, con ríos, caminos y nombres.
     Si no carga, cae a OpenStreetMap en imagen («osm»), luego a Esri y por último a relieve; ninguno necesita clave. */
  var VEC = typeof BASEVEC !== "undefined", VIDS = VEC ? BASEVEC.capas(true).map(function (l) { return l.id; }) : [];
  var BK = ["osm", "calles2", "topo", "sat"], SIG = VEC ? {calles: "osm", osm: "calles2", calles2: "topo"} : {calles: "osm", osm: "calles2", calles2: "topo"}, ALIAS = {osm: "calles", calles2: "calles"};
  function estiloBase(osc) {
    var B = BASES(osc), src = {}, lay = [{id: "bg", type: "background", paint: {"background-color": X.css("--soft") || "#e6ebf2"}}];
    BK.forEach(function (k) { src["b-" + k] = {type: "raster", tiles: B[k].t, tileSize: 256, maxzoom: B[k].z, attribution: B[k].a}; lay.push({id: "b-" + k, type: "raster", source: "b-" + k, paint: B[k].p, layout: {visibility: !VEC && k === "osm" ? "visible" : "none"}}); });
    var st = {version: 8, glyphs: VEC ? BASEVEC.glyphs : "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf", sources: src, layers: lay};
    if (VEC) {
      src.ofm = BASEVEC.fuente;
      BASEVEC.capas(osc).forEach(function (l) { l.layout = l.layout || {}; l.layout.visibility = "visible"; lay.push(l); });
    }
    return st;
  }
  /* id: calles (vectorial) · osm · calles2 · topo · sat · none */
  function baseVis(map, id) {
    BK.forEach(function (k) { map.setLayoutProperty("b-" + k, "visibility", k === id || (!VEC && id === "calles" && k === "osm") ? "visible" : "none"); });
    if (VEC) VIDS.forEach(function (l) { if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", id === "calles" ? "visible" : "none"); });
  }
  /* botones de mapa base + aviso + respaldo en cadena (vectorial → OpenStreetMap → Esri → relieve); o = {av: id del aviso, tool: selector de la barra, msg: qué se muestra igual} */
  function baseControl(map, o) {
    var av = document.getElementById(o.av), st = {act: "calles", ok: {}, err: {}};
    function botones() { return [].slice.call(document.querySelectorAll(o.tool + " button[data-b]")); }
    function pon(id) { st.act = id; baseVis(map, id); botones().forEach(function (z) { z.classList.toggle("on", z.dataset.b === (ALIAS[id] || id)); }); if (id === "none" || st.ok[id] || !st.err[id]) av.hidden = true; }
    /* sinTesela = falló el descriptor de la fuente (TileJSON) y no una tesela suelta: no hay nada más que esperar */
    function fallo(id, sinTesela) {
      if (id !== st.act || st.ok[id]) return; st.err[id] = (st.err[id] || 0) + 1; if (st.err[id] < (sinTesela ? 1 : 4)) return;
      var sig = SIG[id]; if (sig && !st.err[sig]) { pon(sig); return; }
      av.hidden = false; av.innerHTML = 'No se pudo cargar el mapa base (sin conexión con el servidor de mapas o bloqueo de la red). <b>' + (o.msg || "Los municipios y las capas del módulo se muestran igual.") + '</b> <button class="xlink" type="button" id="' + o.av + 'R">Reintentar</button>';
      document.getElementById(o.av + "R").onclick = function () { st.err = {}; st.ok = {}; av.hidden = true; pon("calles"); };
    }
    var idDe = function (e) { var s = e && e.sourceId; return s === "ofm" ? "calles" : s && s.indexOf("b-") === 0 ? s.slice(2) : null; };
    map.on("error", function (e) { var id = idDe(e); if (id) fallo(id, id === "calles" && !e.tile); else if (e && e.error) console.warn("MAPAZ " + e.error.message); });
    map.on("data", function (e) { var id = e.tile ? idDe(e) : null; if (id) { st.ok[id] = 1; if (id === st.act) av.hidden = true; } });
    botones().forEach(function (b) { b.onclick = function () { if (b.dataset.b === "none") { baseVis(map, "none"); botones().forEach(function (z) { z.classList.toggle("on", z === b); }); st.act = "none"; av.hidden = true; } else { st.err[b.dataset.b] = 0; pon(b.dataset.b); } }; });
    return {pon: pon, st: st};
  }

  /* o: {id, av, tool, bajo(map), alto(map), listo(map), refInfra} */
  function crear(o) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark", av = document.getElementById(o.av), tool = o.tool;
    var map = new maplibregl.Map({container: o.id, style: estiloBase(osc), bounds: [[-70.2, -23.2], [-56.8, -8.8]], fitBoundsOptions: {padding: 10}, attributionControl: {compact: true}});
    map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); map.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-right");
    var pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 10, maxWidth: "300px"}); map._pop = pop;
    map._bc = baseControl(map, {av: o.av, tool: tool});
    map.on("load", function () {
      iconos(map);
      map.addSource("dep", {type: "geojson", data: fc(T.D.geoDep.features)}); map.addSource("mun", {type: "geojson", data: fc(((T.D.geoMun || {}).features) || [])});
      map.addSource("ex", {type: "geojson", data: fc([])}); map.addSource("an", {type: "geojson", data: fc([])});
      map.addLayer({id: "d-f", type: "fill", source: "dep", paint: {"fill-color": "#ffffff", "fill-opacity": osc ? .05 : .03}});
      LUGAR.capa(map);
      if (o.bajo) o.bajo(map);
      map.addLayer({id: "ex-f", type: "fill", source: "ex", paint: {"fill-color": ["case", ["<", ["get", "pob"], 0], "#9aa3b2", ["step", ["get", "pob"], "#c9b8ff", 1000, "#a68cff", 5000, "#8461f0", 20000, "#6338d6", 100000, "#3f1fa3"]], "fill-opacity": .14}});
      capaMalla(map, o.evitar);
      map.addLayer({id: "ex-l", type: "line", source: "ex", paint: {"line-color": osc ? "#ffffff" : "#25165c", "line-width": 1.1, "line-opacity": .75}});
      map.addLayer({id: "m-l", type: "line", source: "mun", minzoom: 6, paint: {"line-color": osc ? "#ffffff" : "#10233d", "line-width": .5, "line-opacity": .22}});
      map.addLayer({id: "d-l", type: "line", source: "dep", paint: {"line-color": osc ? "#e6efff" : "#10233d", "line-width": 1.3, "line-opacity": .8}});
      capasPob(map, osc);
      map.addLayer({id: "an-f", type: "fill", source: "an", paint: {"fill-color": "#f26a1b", "fill-opacity": ["match", ["get", "r"], 10, .16, 25, .12, 50, .09, .06]}});
      map.addLayer({id: "an-l", type: "line", source: "an", paint: {"line-color": "#f26a1b", "line-width": 1.6, "line-dasharray": [3, 2]}});
      if (o.alto) o.alto(map);
      capasInfra(map, {ref: o.refInfra});
      map._ok = 1; if (o.listo) o.listo(map);
    });
    return map;
  }
  /* ---------- burbujas de población: área ∝ habitantes; crecen al acercar y se ven siempre, sin tapar el mapa ---------- */
  function rBurb() {
    var f = function (a, mn, mx) { return ["case", ["<", ["get", "pob"], 0], 4, ["max", mn, ["min", mx, ["*", ["sqrt", ["get", "pob"]], a]]]]; };
    return ["interpolate", ["linear"], ["zoom"], 4, f(.016, 3.5, 30), 7, f(.045, 4.5, 50), 10, f(.08, 5.5, 66), 13, f(.15, 6.5, 92)];
  }
  function capasPob(map, osc) {
    map.addSource("pb", {type: "geojson", data: fc([])});
    map.addLayer({id: "pb-c", type: "circle", source: "pb", paint: {"circle-radius": rBurb(), "circle-color": "#8b5cf6", "circle-opacity": ["interpolate", ["linear"], ["zoom"], 9, .34, 12, .2], "circle-stroke-color": osc ? "#c4b5fd" : "#5b21b6", "circle-stroke-width": 1.5, "circle-stroke-opacity": .9}});
    var pp = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8, maxWidth: "260px"});
    map.on("mousemove", "pb-c", function (e) {
      var p = e.features[0].properties; map.getCanvas().style.cursor = "help";
      pp.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.n) + '</b>' + (+p.pob >= 0 ? '≈ ' + A.fmt(+p.pob) + ' hab. ' + esc(p.nota || "") : 'sin dato de población') + '<br><i>burbuja: el área es proporcional a los habitantes</i></div>').addTo(map);
    });
    map.on("mouseleave", "pb-c", function () { pp.remove(); map.getCanvas().style.cursor = ""; });
  }
  /* una burbuja por municipio de la exposición: en el centro de gravedad de sus celdas dentro del radio (o en su centro si no hay malla) */
  function burbujasExpo(E) {
    if (!E) return [];
    return E.mu.filter(function (x) { return E.grid ? x.pr > 0 : x.m.pob != null; }).map(function (x) {
      var c = E.grid && x.la != null ? [x.lo, x.la] : cen(x.m);
      return {lon: c[0], lat: c[1], pob: E.grid ? x.pr : x.m.pob, n: x.m.n, nota: E.grid ? "dentro del radio" : "(municipio entero)"};
    });
  }
  function pobData(map, items) {
    if (!map || !map._ok || !map.getSource("pb")) return;
    map.getSource("pb").setData(fc((items || []).map(function (b) { return {type: "Feature", geometry: {type: "Point", coordinates: [b.lon, b.lat]}, properties: {pob: b.pob == null ? -1 : b.pob, n: b.n, nota: b.nota || ""}}; })));
  }

  /* ---------- infraestructura: íconos que se agrupan al alejar (el número es la cantidad) y se abren al acercar ---------- */
  var SAL = ["hosp", "cli", "cons"], EME = ["bom", "res", "pol"];
  function grupoInf(k) { return EME.indexOf(k) >= 0 ? "e" : "s"; }
  function infoFeat(x) { return {type: "Feature", geometry: {type: "Point", coordinates: [x.p.lon, x.p.lat]}, properties: {k: x.p.k, g: grupoInf(x.p.k), n: x.p.n, d: +x.d.toFixed(1), op: x.p.op, m: x.p.mun, e: x.p.esp}}; }
  function infRefresca(map) {
    if (!map || !map._ok || !map.getSource("inf")) return;
    var on = map._infOn || {s: true, e: true};
    map.getSource("inf").setData(fc((map._infF || []).filter(function (f) { return on[f.properties.g]; })));
  }
  function infData(map, feats) { if (!map) return; map._infF = feats || []; infRefresca(map); }
  function capasInfra(map, o) {
    var pop = map._pop || new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 10, maxWidth: "300px"}), noC = ["!", ["has", "point_count"]];
    var ik = function (a, z) { return ["interpolate", ["linear"], ["zoom"], 6, a, 12, z]; }, ikm = function (h, c, ot, h2, c2, o2) { return ["interpolate", ["linear"], ["zoom"], 6, ["match", ["get", "k"], "hosp", h, "cli", c, ot], 12, ["match", ["get", "k"], "hosp", h2, "cli", c2, o2]]; };
    map.addSource("inf", {type: "geojson", data: fc([]), cluster: true, clusterMaxZoom: 11, clusterRadius: 42, clusterProperties: {sal: ["+", ["case", ["in", ["get", "k"], ["literal", SAL]], 1, 0]], eme: ["+", ["case", ["in", ["get", "k"], ["literal", EME]], 1, 0]]}});
    map.addLayer({id: "inf-c", type: "circle", source: "inf", filter: ["has", "point_count"], paint: {"circle-radius": ["step", ["get", "point_count"], 13, 10, 17, 50, 22, 200, 27], "circle-color": ["case", [">=", ["get", "sal"], ["get", "eme"]], "#13795b", "#b3261e"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.4, "circle-opacity": .94}});
    map.addLayer({id: "inf-cn", type: "symbol", source: "inf", filter: ["has", "point_count"], layout: {"text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true}, paint: {"text-color": "#ffffff"}});
    map.addLayer({id: "inf-s", type: "symbol", source: "inf", filter: ["all", noC, ["in", ["get", "k"], ["literal", SAL]]], layout: {"icon-image": ["match", ["get", "k"], "hosp", "i-hosp", "cli", "i-cli", "i-cons"], "icon-size": ikm(.9, .75, .6, 1.5, 1.25, 1.0), "icon-allow-overlap": true, "icon-ignore-placement": true}});
    map.addLayer({id: "inf-e", type: "symbol", source: "inf", filter: ["all", noC, ["in", ["get", "k"], ["literal", EME]]], layout: {"icon-image": ["match", ["get", "k"], "pol", "i-pol", "i-bom"], "icon-size": ik(.8, 1.3), "icon-allow-overlap": true, "icon-ignore-placement": true}});
    ["inf-s", "inf-e"].forEach(function (L) {
      map.on("mousemove", L, function (e) { var p = e.features[0].properties, r = typeof o.ref === "function" ? o.ref() : (o.ref || "del punto"); map.getCanvas().style.cursor = "help"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.n) + '</b>' + esc(INFN[p.k]) + (p.e && p.e !== "general" ? ' · ' + esc(p.e) : '') + (p.op ? ' · ' + esc(p.op) : '') + '<br>a ' + fmt(+p.d, 1) + ' km ' + esc(r) + (p.m ? ' · ' + esc(p.m) : '') + '<br><i>OpenStreetMap: cobertura incompleta</i></div>').addTo(map); });
      map.on("mouseleave", L, function () { pop.remove(); map.getCanvas().style.cursor = ""; });
    });
    map.on("mousemove", "inf-c", function (e) { var p = e.features[0].properties; map.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + p.point_count + ' establecimientos y servicios</b>' + p.sal + ' de salud · ' + p.eme + ' bomberos, rescate o policía<br><i>clic para acercar y separarlos</i></div>').addTo(map); });
    map.on("mouseleave", "inf-c", function () { pop.remove(); map.getCanvas().style.cursor = ""; });
    map.on("click", "inf-c", function (e) { var f = e.features[0]; map.getSource("inf").getClusterExpansionZoom(f.properties.cluster_id).then(function (z) { map.easeTo({center: f.geometry.coordinates, zoom: Math.min(z + .3, 16)}); }).catch(function () { map.easeTo({center: f.geometry.coordinates, zoom: map.getZoom() + 2}); }); });
  }
  /* escala real de un píxel de satélite: círculo cuyo diámetro mide `m` metros sobre el terreno (a la latitud de Bolivia), nunca menor que `min` px.
     Devuelve la expresión de radio para circle-radius: crece al acercar (cada zoom duplica el tamaño) y no se pierde al alejar. */
  function radioEscala(m, min) {
    var st = [], z, mpp, r;
    for (z = 4; z <= 19; z++) { mpp = 156543.03 * Math.cos(16 * Math.PI / 180) / Math.pow(2, z); r = (m / 2) / mpp; st.push(z, typeof min === "number" ? Math.max(min, r) : ["max", min, r]); }
    return ["interpolate", ["exponential", 2], ["zoom"]].concat(st);
  }
  function vis(map, id, on) {
    if (!map) return;
    if (id === "inf-s" || id === "inf-e") { var q = id === "inf-s" ? "s" : "e"; map._infOn = map._infOn || {s: true, e: true}; if (map._infOn[q] !== !!on) { map._infOn[q] = !!on; infRefresca(map); } return; }
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    if (id === "ex-f") ["pg-f", "pb-c"].forEach(function (l) { if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", on ? "visible" : "none"); });
  }
  /* dibuja la selección: exposición (municipios), anillos e infraestructura */
  function selec(map, E, radios) {
    if (!map || !map._ok) return;
    map.getSource("ex").setData(fc(E ? E.mu.map(function (x) { return {type: "Feature", geometry: x.m.f.geometry, properties: {pob: x.m.pob == null ? -1 : x.m.pob, n: x.m.n}}; }) : []));
    map.getSource("an").setData(fc(E ? radios.slice().sort(function (a, b) { return b - a; }).map(function (r) { return {type: "Feature", geometry: {type: "Polygon", coordinates: [circulo(E.lat, E.lon, r)]}, properties: {r: r}}; }) : []));
    infData(map, E ? E.C.map(infoFeat) : []);
    pobData(map, burbujasExpo(E));
    pintaMalla(map, E);
  }
  return {iniciar: iniciar, crear: crear, iconos: iconos, ico: ico, ICO: ICO, pinta: pinta, estiloBase: estiloBase, baseVis: baseVis, baseControl: baseControl, capasInfra: capasInfra, infData: infData, infoFeat: infoFeat, capasPob: capasPob, pobData: pobData, burbujasExpo: burbujasExpo, radioEscala: radioEscala, SIG: SIG, ALIAS: ALIAS, expo: expo, malla: malla, mallaMun: mallaMun, hayMalla: hayMalla, capaMalla: capaMalla, pintaMalla: pintaMalla, leyendaPob: leyendaPob, notaPob: notaPob, principales: principales, habX: habX, cabHab: cabHab, cerca: cerca, primero: primero, tablaAn: tablaAn, legendaInfra: legendaInfra, selec: selec, vis: vis, hav: hav, circulo: circulo, fc: fc, cen: cen, fmtP: fmtP, fmt: fmt, esc: esc, pron: pron, PRON: PRON, CAPS: CAPS, nombrePunto: nombrePunto};
})();

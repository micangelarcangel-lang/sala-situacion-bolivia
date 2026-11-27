/* HMAP: cartografía hidrográfica de Hidrológica.
   Se parte de la red de ríos (OpenStreetMap, hidro_rios.json), las cuencas (HydroBASINS, hidro_cuencas.json) y los lagos (contorno de referencia, hidro_lagos.json);
   encima se dibuja lo monitoreado: el TRAMO del río que representa cada punto del modelo de caudal (GloFAS) con su punto de medición, los ríos citados en los avisos del SENAMHI
   (recortados al departamento del aviso) y la superficie de lluvia prevista. Datos solo al pasar el cursor. Nada se inventa: lo que no tiene trazado se dice. */
var HMAP = (function () {
  "use strict";
  var M = MAPAZ, D = {est: "pend", rios: null, cuencas: null, lagos: null}, CBL = [], RN = {}, TRC = {}, RCL = {}, H = {cb: null, map: null, vista: "avisos", lluvia: null, hv: null};
  var REDUC = false; try { REDUC = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
  var CAPAS_HIT = ["h-pt-c", "h-tr-l", "h-ar-l", "h-rio-hit", "h-rio-hitc"];
  function esc(s) { return M.esc(s); }
  function fc(f) { return {type: "FeatureCollection", features: f}; }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function simple(s) { return norm(s).replace(/^(rio|quebrada|corixo)\s+/, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function tokens(s) { return norm(s).replace(/\b(rio|del|de|la|el|los|las|y)\b/g, " ").split(/[^a-z0-9ñ]+/).filter(function (t) { return t.length >= 4; }); }
  function lineas(f) { var g = f.geometry; return g.type === "MultiLineString" ? g.coordinates : g.type === "LineString" ? [g.coordinates] : []; }

  /* ---------- carga ---------- */
  function carga(cb) {
    if (D.est === "ok") { cb(); return; } CBL.push(cb); if (D.est === "cargando") return; D.est = "cargando";
    Promise.all(["hidro_rios.json", "hidro_cuencas.json", "hidro_lagos.json"].map(function (f) { return fetch(f).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); })).then(function (a) {
      D.rios = a[0]; D.cuencas = a[1]; D.lagos = a[2]; D.est = "ok";
      ((D.rios && D.rios.features) || []).forEach(function (f) { RN[f.properties.n] = f; });
      CBL.splice(0).forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
    });
  }
  function hay() { return D.est === "ok" && !!(D.rios && D.rios.features && D.rios.features.length); }
  function meta() { return {rios: D.rios && D.rios.meta, cuencas: D.cuencas && D.cuencas.meta, lagos: D.lagos && D.lagos.meta}; }

  /* ---------- punto en polígono ---------- */
  function enAnillo(x, y, r) { var d = false, i, j, n = r.length; for (i = 0, j = n - 1; i < n; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) d = !d; } return d; }
  function polis(g) { return g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []; }
  function bbG(g) {
    if (g._bb) return g._bb; var b = [1e9, 1e9, -1e9, -1e9]; polis(g).forEach(function (P) { P[0].forEach(function (c) { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; }); });
    return (g._bb = b);
  }
  function enGeom(x, y, g) {
    var b = bbG(g); if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
    var P = polis(g), i, k, h; for (i = 0; i < P.length; i++) { if (!enAnillo(x, y, P[i][0])) continue; h = false; for (k = 1; k < P[i].length; k++) if (enAnillo(x, y, P[i][k])) { h = true; break; } if (!h) return true; }
    return false;
  }

  /* ---------- tramo del río que representa un punto del modelo ---------- */
  function proy(lon, lat, A, B) { var c = Math.cos(lat * Math.PI / 180), ax = A[0] * c, ay = A[1], bx = B[0] * c, by = B[1], dx = bx - ax, dy = by - ay, t = (dx || dy) ? (((lon * c) - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy) : 0; t = Math.max(0, Math.min(1, t)); return {t: t, x: A[0] + (B[0] - A[0]) * t, y: A[1] + (B[1] - A[1]) * t}; }
  function masCercano(lon, lat, feats) {
    var best = null; feats.forEach(function (f) { lineas(f).forEach(function (L, li) { var i, p, d; for (i = 0; i < L.length - 1; i++) { if (Math.abs(L[i][1] - lat) > 1.2 && Math.abs(L[i + 1][1] - lat) > 1.2) continue; p = proy(lon, lat, L[i], L[i + 1]); d = M.hav(lat, lon, p.y, p.x); if (!best || d < best.d) best = {f: f, li: li, vi: i, x: p.x, y: p.y, d: d}; } }); });
    return best;
  }
  /* camina km a lo largo de la línea desde (x,y) en el segmento vi→vi+1; dir +1 hacia vi+1, -1 hacia vi; continúa por otras partes de la misma entidad si el extremo coincide (≤ 2 km) */
  function camina(f, li, vi, x, y, km, dir) {
    var out = [], acc = 0, px = x, py = y, L = lineas(f)[li], i = dir > 0 ? vi + 1 : vi, hop = 0, usados = {};
    usados[li] = 1;
    while (acc < km) {
      while (i >= 0 && i < L.length && acc < km) {
        var q = L[i], d = M.hav(py, px, q[1], q[0]);
        if (acc + d >= km && d > 0) { var k = (km - acc) / d; out.push([px + (q[0] - px) * k, py + (q[1] - py) * k]); acc = km; break; }
        out.push(q); acc += d; px = q[0]; py = q[1]; i += dir;
      }
      if (acc >= km || ++hop > 8) break;
      var sig = null, P = lineas(f); P.forEach(function (S, sj) { if (usados[sj] || sig) return; if (M.hav(py, px, S[0][1], S[0][0]) <= 2) sig = {j: sj, i: 0, d: 1}; else if (M.hav(py, px, S[S.length - 1][1], S[S.length - 1][0]) <= 2) sig = {j: sj, i: S.length - 1, d: -1}; });
      if (!sig) break; usados[sig.j] = 1; L = P[sig.j]; i = sig.i; dir = sig.d;
    }
    return {pts: out, km: acc};
  }
  /* devuelve {rio, d (km del punto al trazado), coords, km} o null */
  function tramo(p, km) {
    var k = "t|" + p.nombre + "|" + km; if (k in TRC) return TRC[k]; var r = null;
    if (hay()) {
      var tk = tokens(p.rio), todos = D.rios.features, cand = todos.filter(function (f) { var n = norm(f.properties.n); return tk.some(function (t) { return n.indexOf(t) >= 0; }); }), b = cand.length ? masCercano(p.lon, p.lat, cand) : null;
      if (!b || b.d > 30) { var b2 = masCercano(p.lon, p.lat, todos); b = b2 && b2.d <= 20 ? b2 : null; }
      if (b) { var a = camina(b.f, b.li, b.vi, b.x, b.y, km, -1), z = camina(b.f, b.li, b.vi, b.x, b.y, km, 1); r = {rio: b.f.properties.n, d: b.d, km: a.km + z.km, x: b.x, y: b.y, coords: a.pts.reverse().concat([[b.x, b.y]], z.pts)}; }
    }
    TRC[k] = r; return r;
  }

  /* ---------- ríos citados en un aviso, recortados al departamento ---------- */
  function riosAviso(rio, depGeom) {
    var q = simple(rio), k = "r|" + q + "|" + (depGeom ? depGeom._k || (depGeom._k = Math.random()) : ""); if (k in RCL) return RCL[k];
    var fs = hay() ? D.rios.features.filter(function (f) { return simple(f.properties.n) === q; }) : [], out = [];
    fs.forEach(function (f) {
      lineas(f).forEach(function (L) {
        if (!depGeom) { out.push(L); return; }
        var cur = [], i; for (i = 0; i < L.length; i++) { if (enGeom(L[i][0], L[i][1], depGeom)) cur.push(L[i]); else { if (cur.length > 1) out.push(cur); cur = []; } }
        if (cur.length > 1) out.push(cur);
      });
    });
    return (RCL[k] = {n: fs.length ? fs[0].properties.n : null, lineas: out, hay: fs.length > 0});
  }

  /* ---------- lluvia prevista: superficie suave por IDW, recortada a Bolivia ---------- */
  var LO0 = -70.3, LO1 = -56.3, LA0 = -23.3, LA1 = -8.4;
  function my(la) { return Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)); }
  var RAMP = [[0, [90, 170, 245, 0]], [1, [120, 190, 250, .2]], [5, [90, 170, 245, .4]], [20, [52, 135, 240, .56]], [50, [37, 99, 235, .7]], [100, [124, 58, 237, .8]], [200, [88, 28, 135, .88]]];
  function colLl(v) {
    var i, a, b, t; if (v <= 0) return RAMP[0][1]; for (i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) { a = RAMP[i - 1]; b = RAMP[i]; t = (v - a[0]) / (b[0] - a[0]); return [0, 1, 2, 3].map(function (k) { return a[1][k] + (b[1][k] - a[1][k]) * t; }); }
    return RAMP[RAMP.length - 1][1];
  }
  function gradLl() { return "linear-gradient(90deg," + [0, 1, 5, 20, 50, 100, 200].map(function (v) { var c = colLl(v + (v ? 0 : .5)); return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + Math.max(.35, c[3]).toFixed(2) + ")"; }).join(",") + ")"; }
  function idw(pts, lon, lat) {
    var s = 0, w = 0, dm = 1e9, n = null, i, c = Math.cos(lat * Math.PI / 180);
    for (i = 0; i < pts.length; i++) { var dx = (pts[i].lon - lon) * c, dy = pts[i].lat - lat, d2 = dx * dx + dy * dy; if (d2 < dm) { dm = d2; n = pts[i]; } if (d2 > 6.3) continue; var ww = 1 / (d2 + .02); s += pts[i].v * ww; w += ww; }
    return {v: w ? s / w : null, dm: Math.sqrt(dm), n: n};
  }
  function superficie(pts, deps) {
    var W = 200, wx = (LO1 - LO0) * Math.PI / 180, hy = my(LA1) - my(LA0), H0 = Math.round(W * hy / wx), cv = document.createElement("canvas"), g, im, d, x, y, lon, lat, o, r, c;
    cv.width = W; cv.height = H0; g = cv.getContext("2d"); im = g.createImageData(W, H0); d = im.data;
    for (y = 0; y < H0; y++) { lat = (2 * Math.atan(Math.exp(my(LA1) - (y + .5) / H0 * hy)) - Math.PI / 2) * 180 / Math.PI; for (x = 0; x < W; x++) { lon = LO0 + (x + .5) / W * (LO1 - LO0); r = idw(pts, lon, lat); o = (y * W + x) * 4; if (r.v == null || r.dm > 2.4) { d[o + 3] = 0; continue; } c = colLl(r.v); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = Math.round(c[3] * 255 * Math.max(0, Math.min(1, 1 - (r.dm - 1.3) / 1.1))); } }
    g.putImageData(im, 0, 0);
    var S = 4, big = document.createElement("canvas"); big.width = W * S; big.height = H0 * S; var bg = big.getContext("2d"); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = "high";
    bg.save(); bg.beginPath();
    (deps || []).forEach(function (geom) { polis(geom).forEach(function (P) { P.forEach(function (ring) { ring.forEach(function (q, i) { var px = (q[0] - LO0) / (LO1 - LO0) * big.width, py = (my(LA1) - my(q[1])) / hy * big.height; if (i) bg.lineTo(px, py); else bg.moveTo(px, py); }); bg.closePath(); }); }); });
    if (deps && deps.length) bg.clip("evenodd");
    bg.drawImage(cv, 0, 0, big.width, big.height); bg.restore();
    return {url: big.toDataURL("image/png"), coordinates: [[LO0, LA1], [LO1, LA1], [LO1, LA0], [LO0, LA0]]};
  }

  /* ---------- capas ---------- */
  function cols(osc) { return {rio: osc ? "#5fd0ff" : "#1d6fb8", flujo: osc ? "#e4f7ff" : "#dff2ff", cuA: "#22b8cf", cuP: "#8b8cff", cuE: "#e0a85c", lago: osc ? "#46b2ff" : "#2377c9", hv: osc ? "#ffffff" : "#0b2a4a"}; }
  /* bajo: cuencas, aportante y lagos (debajo de los rellenos del módulo y de la población) */
  function bajo(m) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark", C = cols(osc), G = [], A = [], L = [];
    ((D.cuencas && D.cuencas.features) || []).forEach(function (f) { (f.properties.t === "grande" ? G : A).push(f); });
    ((D.lagos && D.lagos.features) || []).forEach(function (f) { L.push(f); });
    m.addSource("h-cu", {type: "geojson", data: fc(G)}); m.addSource("h-ca", {type: "geojson", data: fc(A)}); m.addSource("h-lg", {type: "geojson", data: fc(L)});
    m.addLayer({id: "h-cu-f", type: "fill", source: "h-cu", paint: {"fill-color": ["match", ["get", "n"], "Cuenca del Amazonas", C.cuA, "Cuenca del Plata", C.cuP, C.cuE], "fill-opacity": osc ? .13 : .16}});
    m.addLayer({id: "h-cu-l", type: "line", source: "h-cu", paint: {"line-color": ["match", ["get", "n"], "Cuenca del Amazonas", C.cuA, "Cuenca del Plata", C.cuP, C.cuE], "line-width": 1.2, "line-opacity": .6}});
    m.addLayer({id: "h-ca-f", type: "fill", source: "h-ca", filter: ["==", ["get", "p"], ""], paint: {"fill-color": "#ffd166", "fill-opacity": .16}});
    m.addLayer({id: "h-ca-l", type: "line", source: "h-ca", filter: ["==", ["get", "p"], ""], paint: {"line-color": "#ffd166", "line-width": 2, "line-dasharray": [3, 2], "line-opacity": .95}});
    m.addLayer({id: "h-lg-f", type: "fill", source: "h-lg", paint: {"fill-color": C.lago, "fill-opacity": .34}});
    m.addLayer({id: "h-lg-l", type: "line", source: "h-lg", paint: {"line-color": C.lago, "line-width": 1.3, "line-dasharray": [3, 2], "line-opacity": .95}});
  }
  /* alto: red de ríos, tramos, ríos con aviso y puntos de medición (sobre departamentos y población) */
  function alto(m) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark", C = cols(osc), ab = ["any", ["==", ["get", "c"], "A"], ["==", ["get", "c"], "B"]], wAB = ["interpolate", ["linear"], ["zoom"], 4, ["match", ["get", "c"], "A", 1.3, .8], 8, ["match", ["get", "c"], "A", 3.2, 2], 12, ["match", ["get", "c"], "A", 5, 3.2]];
    m.addSource("h-rio", {type: "geojson", data: fc((D.rios && D.rios.features) || [])}); m.addSource("h-hv", {type: "geojson", data: fc([])}); m.addSource("h-ar", {type: "geojson", data: fc([])}); m.addSource("h-tr", {type: "geojson", data: fc([])}); m.addSource("h-pt", {type: "geojson", data: fc([])});
    m.addLayer({id: "h-rio-c", type: "line", source: "h-rio", minzoom: 6, filter: ["==", ["get", "c"], "C"], layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": C.rio, "line-opacity": .55, "line-width": ["interpolate", ["linear"], ["zoom"], 6, .7, 10, 1.7, 13, 2.6]}});
    m.addLayer({id: "h-rio-ab", type: "line", source: "h-rio", filter: ab, layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": C.rio, "line-opacity": ["match", ["get", "c"], "A", .92, .75], "line-width": wAB}});
    m.addLayer({id: "h-rio-fl", type: "line", source: "h-rio", filter: ["==", ["get", "c"], "A"], paint: {"line-color": C.flujo, "line-opacity": .5, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 8, 1.6, 12, 2.4], "line-dasharray": DASH[0]}});
    m.addLayer({id: "h-hv-l", type: "line", source: "h-hv", layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": C.hv, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.6, 10, 5], "line-opacity": .85}});
    m.addLayer({id: "h-ar-k", type: "line", source: "h-ar", layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 7, 10, 14], "line-opacity": .26, "line-blur": 2}});
    m.addLayer({id: "h-ar-l", type: "line", source: "h-ar", layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3.2, 10, 6.5], "line-opacity": .97}});
    m.addLayer({id: "h-ar-fl", type: "line", source: "h-ar", paint: {"line-color": "#ffffff", "line-opacity": .55, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.4, 10, 2.6], "line-dasharray": DASH[0]}});
    var F0 = ["==", ["get", "lg"], 0], F1 = ["==", ["get", "lg"], 1];
    m.addLayer({id: "h-tr-w", type: "line", source: "h-tr", filter: F1, layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.2, 10, 5], "line-opacity": .42}});
    m.addLayer({id: "h-tr-k", type: "line", source: "h-tr", filter: F0, layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": osc ? "#050d1c" : "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 7, 10, 15], "line-opacity": .85}});
    m.addLayer({id: "h-tr-l", type: "line", source: "h-tr", filter: F0, layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 10], "line-opacity": 1}});
    m.addLayer({id: "h-tr-fl", type: "line", source: "h-tr", filter: F0, paint: {"line-color": "#ffffff", "line-opacity": .6, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 10, 2.8], "line-dasharray": DASH[0]}});
    m.addLayer({id: "h-rio-hit", type: "line", source: "h-rio", filter: ab, paint: {"line-width": 14, "line-opacity": 0}});
    m.addLayer({id: "h-rio-hitc", type: "line", source: "h-rio", minzoom: 6, filter: ["==", ["get", "c"], "C"], paint: {"line-width": 12, "line-opacity": 0}});
    m.addLayer({id: "h-pt-p", type: "circle", source: "h-pt", filter: ["==", ["get", "p"], 1], paint: {"circle-radius": 12, "circle-color": ["get", "c"], "circle-opacity": .25, "circle-stroke-width": 0}});
    m.addLayer({id: "h-pt-c", type: "circle", source: "h-pt", paint: {"circle-radius": ["case", ["==", ["get", "s"], 1], 8.5, 6.5], "circle-color": osc ? "#0a1426" : "#ffffff", "circle-stroke-color": ["get", "c"], "circle-stroke-width": 3}});
    m.addLayer({id: "h-pt-i", type: "circle", source: "h-pt", paint: {"circle-radius": 2.2, "circle-color": ["get", "c"]}});
    H.map = m; animar(m); vista(H.vista);
  }

  /* ---------- animación: flujo en los tramos y pulso en los puntos altos (se detiene con la pestaña oculta o con «reducir movimiento») ---------- */
  var ANI = null;
  function animar(m) {
    if (REDUC || ANI) return; var paso = 0, ult = 0, ph = 0;
    function tic(ts) {
      ANI = requestAnimationFrame(tic); if (document.hidden || !H.map || !H.map.isStyleLoaded || ts - ult < 80) return; ult = ts; paso = (paso + 1) % DASH.length; ph += .12;
      var mp = H.map; ["h-rio-fl", "h-ar-fl", "h-tr-fl"].forEach(function (id) { if (mp.getLayer(id) && mp.getLayoutProperty(id, "visibility") !== "none") mp.setPaintProperty(id, "line-dasharray", DASH[paso]); });
      if (mp.getLayer("h-pt-p") && mp.getLayoutProperty("h-pt-p", "visibility") !== "none") { var k = (Math.sin(ph) + 1) / 2; mp.setPaintProperty("h-pt-p", "circle-radius", 9 + 9 * k); mp.setPaintProperty("h-pt-p", "circle-opacity", .38 - .3 * k); }
    }
    ANI = requestAnimationFrame(tic);
  }

  /* ---------- datos del monitoreo ---------- */
  function setData(m, id, feats) { if (m && m.getSource(id)) m.getSource(id).setData(fc(feats)); }
  function aportante(m, nombre) {
    if (!m || !m.getLayer("h-ca-f")) return; var f = ["==", ["get", "p"], nombre || ""]; m.setFilter("h-ca-f", f); m.setFilter("h-ca-l", f);
  }
  function cuencaDe(nombre) { var r = null; ((D.cuencas && D.cuencas.features) || []).forEach(function (f) { if (f.properties.t === "aportante" && f.properties.p === nombre) r = f; }); return r; }
  /* lluvia media prevista dentro de la cuenca: promedia los puntos del modelo que caen dentro del polígono; fn(p) → mm acumulados */
  function lluviaCuenca(nombre, pts, fns) {
    var f = cuencaDe(nombre); if (!f || !pts || !pts.length) return null; var dentro = pts.filter(function (p) { return enGeom(p.lon, p.lat, f.geometry); }); if (!dentro.length) return {n: 0};
    var o = {n: dentro.length}; Object.keys(fns).forEach(function (k) { var s = 0; dentro.forEach(function (p) { s += fns[k](p); }); o[k] = s / dentro.length; }); return o;
  }
  function departamentoDe(lon, lat, deps) { var r = null; (deps || []).forEach(function (f) { if (!r && enGeom(lon, lat, f.geometry)) r = f.properties.n; }); return r; }

  /* ---------- enlaces (hover, clic) ---------- */
  function resalta(m, nombre) {
    if (H.hv === nombre) return; H.hv = nombre; var f = nombre && RN[nombre]; if (m.getSource("h-hv")) m.getSource("h-hv").setData(fc(f ? [f] : []));
  }
  function enlaza(m, cb) {
    H.cb = cb; var pop = m._pop || new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 12, maxWidth: "290px"}), rq = 0, ev = null;
    function vis(id) { return m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== "none"; }
    function hit(pt) { var ls = CAPAS_HIT.filter(vis); return ls.length ? m.queryRenderedFeatures(pt, {layers: ls}).sort(function (a, b) { return CAPAS_HIT.indexOf(a.layer.id) - CAPAS_HIT.indexOf(b.layer.id); }) : []; }
    function tip(e) {
      var fs = hit(e.point), f = fs[0], p, h = "", nom = null;
      if (f) {
        p = f.properties;
        if (f.layer.id === "h-pt-c" || f.layer.id === "h-tr-l") h = cb.tip ? cb.tip("cq", +p.i) : "";
        else if (f.layer.id === "h-ar-l") h = cb.tip ? cb.tip("ar", +p.ai, p) : "";
        else { nom = p.n; var rf = RN[p.n]; h = '<b style="margin:0">' + esc(p.n) + '</b>' + (rf ? esc(M.fmt(rf.properties.km)) + ' km dentro de Bolivia (OpenStreetMap)<br><i>' + (rf.properties.c === "A" ? "río principal por longitud" : rf.properties.c === "B" ? "río mediano por longitud" : "río menor por longitud") + '; la clase no es el orden hidrológico</i>' : ""); }
        if (f.layer.id === "h-ar-l" || f.layer.id === "h-tr-l") nom = p.rn || null;
      } else {
        var bl = ["h-lg-f", "h-cu-f"].filter(vis), o = bl.length ? m.queryRenderedFeatures(e.point, {layers: bl}) : [], g = o[0];
        if (g && g.layer.id === "h-lg-f") h = H.cb.tipLago ? H.cb.tipLago(g.properties.n, g.properties.t) : '<b style="margin:0">' + esc(g.properties.n) + '</b>contorno de referencia, no la superficie de agua de hoy<br><i>' + esc(((D.lagos && D.lagos.meta && D.lagos.meta.fuente) || "")) + '</i>';
        else if (g && !(H.cb.cuencaHover === false)) h = '<b style="margin:0">' + esc(g.properties.n) + '</b>' + (g.properties.km2 ? esc(M.fmt(g.properties.km2)) + ' km² dentro de Bolivia' : "") + '<br><i>HydroBASINS (nivel 6)</i>';
      }
      resalta(m, nom); return h;
    }
    m.on("mousemove", function (e) {
      ev = e; if (rq) return;
      rq = requestAnimationFrame(function () {
        rq = 0; if (!ev) return; var e2 = ev, h = "", tt;
        if (vis("pn-c") && m.queryRenderedFeatures(e2.point, {layers: ["pn-c"]}).length) return;
        if (H.vista === "lluvia" && H.lluvia && !hit(e2.point).length) {
          var r = idw(H.lluvia.pts, e2.lngLat.lng, e2.lngLat.lat);
          if (r.v != null && r.dm <= 1.6) h = cb.tipLluvia(r.v, r.n);
        } else h = tip(e2);
        if (!h) { if (H.mostrado) { pop.remove(); H.mostrado = false; } m.getCanvas().style.cursor = ""; return; }
        m.getCanvas().style.cursor = hit(e2.point).length ? "pointer" : "";
        pop.setLngLat(e2.lngLat).setHTML('<div class="pop">' + h + '</div>').addTo(m); H.mostrado = true;
      });
    });
    m.getCanvas().addEventListener("mouseleave", function () { pop.remove(); H.mostrado = false; resalta(m, null); });
    m.on("click", function (e) {
      var fs = hit(e.point), f = fs[0];
      if (!f) { if (H.cb.clicLago && vis("h-lg-f")) { var lg = m.queryRenderedFeatures(e.point, {layers: ["h-lg-f"]})[0]; if (lg) H.cb.clicLago(lg.properties.n, lg.properties.t); } return; }
      var p = f.properties;
      if (f.layer.id === "h-pt-c" || f.layer.id === "h-tr-l") cb.clic("cq", +p.i); else if (f.layer.id === "h-ar-l") cb.clic("ar", +p.ai);
    });
  }
  /* en la vista de caudal la red de ríos se atenúa para que destaque el tramo monitoreado */
  function vista(v) {
    H.vista = v; var mp = H.map; if (!mp || !mp.getLayer("h-rio-ab")) return; var c = v === "caudal";
    mp.setPaintProperty("h-rio-ab", "line-opacity", c ? .32 : ["match", ["get", "c"], "A", .92, .75]); mp.setPaintProperty("h-rio-c", "line-opacity", c ? .22 : .55);
  }
  function ponLluvia(m, pts, deps) {
    if (!pts || !pts.length) { if (m.getLayer("h-ll")) m.setLayoutProperty("h-ll", "visibility", "none"); H.lluvia = null; return; }
    var S = superficie(pts, deps); H.lluvia = {pts: pts};
    if (m.getSource("h-ll")) m.getSource("h-ll").updateImage({url: S.url, coordinates: S.coordinates});
    else { m.addSource("h-ll", {type: "image", url: S.url, coordinates: S.coordinates}); m.addLayer({id: "h-ll", type: "raster", source: "h-ll", layout: {visibility: "none"}, paint: {"raster-opacity": .92, "raster-resampling": "linear", "raster-fade-duration": 0}}, m.getLayer("h-rio-c") ? "h-rio-c" : undefined); }
  }
  function lago(n) { var r = null; ((D.lagos && D.lagos.features) || []).forEach(function (f) { if (!r && f.properties.n === n) r = f; }); return r; }
  return {lago: lago, bbox: bbG, carga: carga, hay: hay, meta: meta, bajo: bajo, alto: alto, enlaza: enlaza, vista: vista, tramo: tramo, riosAviso: riosAviso, setData: setData, aportante: aportante, cuencaDe: cuencaDe, lluviaCuenca: lluviaCuenca, departamentoDe: departamentoDe, ponLluvia: ponLluvia, gradLl: gradLl, colLl: colLl, idw: idw, enGeom: enGeom, norm: norm, simple: simple, CAPAS_HIT: CAPAS_HIT, fc: fc, _depura: function () { return {D: D, H: H}; }};
})();

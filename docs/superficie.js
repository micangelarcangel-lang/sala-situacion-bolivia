/* SUPF: superficie continua (interpolación IDW) para variables del modelo en puntos dispersos (~1°), dibujada como imagen del mapa y recortada a Bolivia.
   No inventa datos: lejos de todo punto del modelo la imagen queda transparente. Se usa en el pronóstico de Meteorológica. */
var SUPF = (function () {
  "use strict";
  var LO0 = -70.3, LO1 = -56.3, LA0 = -23.3, LA1 = -8.4, K = {};
  function my(la) { return Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)); }
  function hex(h) { h = String(h).replace("#", ""); if (h.length === 3) h = h.replace(/(.)/g, "$1$1"); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function idw(pts, lon, lat) {
    var s = 0, w = 0, dm = 1e9, n = null, i, c = Math.cos(lat * Math.PI / 180);
    for (i = 0; i < pts.length; i++) { var dx = (pts[i].lon - lon) * c, dy = pts[i].lat - lat, d2 = dx * dx + dy * dy; if (d2 < dm) { dm = d2; n = pts[i]; } if (d2 > 6.3) continue; var ww = 1 / (d2 + .02); s += pts[i].v * ww; w += ww; }
    return {v: w ? s / w : null, dm: Math.sqrt(dm), n: n};
  }
  /* clases [[tope, "#hex", etiqueta]…] → v ↦ [r,g,b]: mezcla entre los centros de clase (el color cambia suave, no por escalones) */
  function deClases(cl) {
    var n = cl.length, st = [], i, lo, hi, d0 = n > 1 ? cl[1][0] - cl[0][0] : 1, dn = n > 2 ? cl[n - 2][0] - cl[n - 3][0] : d0;
    for (i = 0; i < n; i++) { lo = i ? cl[i - 1][0] : cl[0][0] - d0; hi = i === n - 1 ? lo + dn : cl[i][0]; st.push([(lo + hi) / 2, hex(cl[i][1])]); }
    return function (v) {
      var j, a, b, t; if (v <= st[0][0]) return st[0][1]; for (j = 1; j < st.length; j++) if (v <= st[j][0]) { a = st[j - 1]; b = st[j]; t = (v - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (k) { return a[1][k] + (b[1][k] - a[1][k]) * t; }); }
      return st[st.length - 1][1];
    };
  }
  function polis(g) { return !g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []; }
  /* col(v) → [r,g,b]; alfa(v) → 0..1 */
  function crea(pts, col, alfa, deps) {
    var W = 200, wx = (LO1 - LO0) * Math.PI / 180, hy = my(LA1) - my(LA0), H0 = Math.round(W * hy / wx), cv = document.createElement("canvas"), g, im, d, x, y, lon, lat, o, r, c;
    cv.width = W; cv.height = H0; g = cv.getContext("2d"); im = g.createImageData(W, H0); d = im.data;
    for (y = 0; y < H0; y++) {
      lat = (2 * Math.atan(Math.exp(my(LA1) - (y + .5) / H0 * hy)) - Math.PI / 2) * 180 / Math.PI;
      for (x = 0; x < W; x++) {
        lon = LO0 + (x + .5) / W * (LO1 - LO0); r = idw(pts, lon, lat); o = (y * W + x) * 4; if (r.v == null || r.dm > 2.4) { d[o + 3] = 0; continue; }
        c = col(r.v); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = Math.round(255 * alfa(r.v) * Math.max(0, Math.min(1, 1 - (r.dm - 1.3) / 1.1)));
      }
    }
    g.putImageData(im, 0, 0);
    var S = 4, big = document.createElement("canvas"); big.width = W * S; big.height = H0 * S; var bg = big.getContext("2d"); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = "high";
    bg.save(); bg.beginPath();
    (deps || []).forEach(function (geom) { polis(geom).forEach(function (P) { P.forEach(function (ring) { ring.forEach(function (q, i) { var px = (q[0] - LO0) / (LO1 - LO0) * big.width, py = (my(LA1) - my(q[1])) / hy * big.height; if (i) bg.lineTo(px, py); else bg.moveTo(px, py); }); bg.closePath(); }); }); });
    if (deps && deps.length) bg.clip("evenodd");
    bg.drawImage(cv, 0, 0, big.width, big.height); bg.restore();
    return {url: big.toDataURL("image/png"), coordinates: [[LO0, LA1], [LO1, LA1], [LO1, LA0], [LO0, LA0]]};
  }
  /* pone o actualiza la capa `id` (clave `k` evita recalcular lo mismo); `antes` = id de la capa que debe quedar encima */
  function pon(m, id, pts, col, alfa, deps, antes, k, op) {
    if (!m) return; if (k && K[id] === k && m.getSource(id)) return; K[id] = k || ""; var S = crea(pts, col, alfa, deps);
    if (m.getSource(id)) m.getSource(id).updateImage({url: S.url, coordinates: S.coordinates});
    else { m.addSource(id, {type: "image", url: S.url, coordinates: S.coordinates}); m.addLayer({id: id, type: "raster", source: id, layout: {visibility: "none"}, paint: {"raster-opacity": op || .92, "raster-resampling": "linear", "raster-fade-duration": 0}}, antes && m.getLayer(antes) ? antes : undefined); }
  }
  function quita(m, id) { if (m && m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none"); K[id] = ""; }
  return {idw: idw, deClases: deClases, crea: crea, pon: pon, quita: quita};
})();

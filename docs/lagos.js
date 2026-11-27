/* LAGOS: espejo de agua de lagos y salares de Bolivia para el mapa de sequía.
   Datos: lagos_serie.json (lo genera lagos_serie.py con Sentinel-2 L2A: área de píxeles «agua» por mes, 24 meses). Es EXTENSIÓN del espejo de agua, no el nivel (cota).
   Si el archivo aún no existe o un lago no tiene medición, se muestra solo el contorno de referencia (hidro_lagos.json) y se dice «sin dato»: nunca se inventa.
   Capas del mapa: lg-ag-f / lg-ag-l (agua medida en la última escena válida) y lg-sel (lago elegido). El contorno de referencia lo dibuja HMAP (h-lg-f / h-lg-l). */
var LAGOS = (function () {
  "use strict";
  var M = MAPAZ, D = {est: "pend", j: null, msg: ""}, SELID = "";
  function esc(s) { return M.esc(s); }
  function f1(x, d) { return x == null ? "—" : Number(x).toFixed(d == null ? 1 : d).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function sg(v, d) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d == null ? 1 : d).replace(".", ","); }
  function fd(s) { try { return new Date(s + "T12:00:00").toLocaleDateString("es-BO", {day: "numeric", month: "short", year: "numeric"}).replace(/\./g, ""); } catch (e) { return s || "—"; } }
  function fm(m) { try { return new Date(m + "-15T12:00:00").toLocaleDateString("es-BO", {month: "short", year: "numeric"}).replace(/\./g, ""); } catch (e) { return m || "—"; } }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
  function claro() { return document.documentElement.getAttribute("data-theme") === "light"; }

  function cargar(cb) {
    if (D.est === "ok" || D.est === "sin") { if (cb) cb(); return; }
    var fin = function () { if (cb) cb(); };
    fetch("lagos_serie.json?v=" + Math.floor(Date.now() / 36e5), {cache: "no-cache"}).then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? "aún no se ha generado" : "HTTP " + r.status); return r.json(); })
      .then(function (j) { D.j = j && j.lagos ? j : null; D.est = D.j ? "ok" : "sin"; D.msg = D.j ? "" : "archivo vacío"; })
      .catch(function (e) { D.est = "sin"; D.msg = (e && e.message) || "sin conexión"; }).then(fin, fin);
  }
  function hay() { return D.est === "ok" && !!D.j; }
  function lista() { return hay() ? D.j.lagos : []; }
  function reg(nombre) { var n = norm(nombre), r = null; lista().forEach(function (l) { if (!r && (norm(l.nombre) === n || l.id === n)) r = l; }); return r; }
  function meta() { return hay() ? D.j.meta : null; }
  function medido(l) { return !!(l && l.estado === "ok" && l.actual && l.actual.agua_km2 != null); }
  function generado() { return hay() ? D.j.generado : null; }

  /* ---------- capas ---------- */
  function feats() { return lista().filter(function (l) { return l.poligono; }).map(function (l) { return {type: "Feature", geometry: l.poligono, properties: {id: l.id, n: l.nombre, f: l.poligono_fecha || ""}}; }); }
  function alto(m) {
    var osc = !claro();
    m.addSource("lg-ag", {type: "geojson", data: M.fc(feats())});
    m.addLayer({id: "lg-ag-f", type: "fill", source: "lg-ag", paint: {"fill-color": osc ? "#6fd3ff" : "#0b6fb8", "fill-opacity": osc ? .66 : .7}});
    m.addLayer({id: "lg-ag-l", type: "line", source: "lg-ag", paint: {"line-color": osc ? "#d6f3ff" : "#05406f", "line-width": 1.2, "line-opacity": .9}});
    m.addLayer({id: "lg-sel", type: "line", source: "lg-ag", filter: ["==", ["get", "id"], ""], paint: {"line-color": osc ? "#ffffff" : "#000000", "line-width": 3}});
  }
  function refresca(m) { if (m && m.getSource("lg-ag")) m.getSource("lg-ag").setData(M.fc(feats())); }
  function elige(m, id) { SELID = id || ""; if (m && m.getLayer("lg-sel")) m.setFilter("lg-sel", ["==", ["get", "id"], SELID]); }

  /* ---------- lectura ---------- */
  function comp(l) {
    var a = l.actual, p = l.anterior; if (!a) return null;
    return {ahora: a.agua_km2, fecha: a.fecha, antes: p ? p.agua_km2 : null, fAntes: p ? p.fecha : null, pct: l.variacion_pct, bo: a.agua_bo_km2, boRef: l.ref_bo_km2};
  }
  /* texto de la ventanita al pasar el cursor por un lago (nombre = contorno de referencia de HMAP) */
  function tip(nombre, tipo) {
    var l = reg(nombre), t = '<b style="margin:0">' + esc(nombre) + '</b>' + esc(tipo === "salar" ? "salar" : "lago") + ' · contorno de referencia';
    if (D.est !== "ok") return t + '<br><i>Superficie de agua medida por satélite: ' + (D.est === "sin" ? "aún no disponible (" + esc(D.msg) + ")" : "consultando…") + '</i>';
    if (!l) return t + '<br><i>sin medición satelital (solo contorno de referencia)</i>';
    if (!medido(l)) return t + '<br>Superficie de agua: <b>sin dato</b><br><i>' + esc(l.razon || "ninguna escena útil en el período") + '</i><br>clic para ver el detalle';
    var c = comp(l);
    return t + '<br>Espejo de agua (' + esc(fd(c.fecha)) + '): <b>' + f1(c.ahora) + ' km²</b>' + (c.antes != null ? '<br>Hace un año: ' + f1(c.antes) + ' km² · <b>' + sg(c.pct) + ' %</b>' : '<br>Sin escena comparable de hace un año') + '<br><i>extensión del agua, no el nivel · clic para ver la serie</i>';
  }
  /* resumen para tarjetas: lagos medidos y el de mayor pérdida frente al año anterior */
  function resumen() {
    var L = lista().filter(medido), con = L.filter(function (l) { return l.variacion_pct != null; }), pe = con.slice().sort(function (a, b) { return a.variacion_pct - b.variacion_pct; })[0] || null;
    return {n: L.length, total: lista().length, comparables: con.length, peor: pe};
  }

  /* ---------- gráfico de la serie mensual (SVG; el eje no parte de cero y se dice) ---------- */
  function svgSerie(l) {
    var S = (l.serie || []), W = 300, H = 96, ml = 4, mr = 4, mt = 8, mb = 14, ok = S.filter(function (s) { return s.estado === "ok" && s.agua_km2 != null; });
    if (ok.length < 2) return '<p class="nota">Menos de dos meses con medición válida: no hay serie que dibujar.</p>';
    var mn = Math.min.apply(null, ok.map(function (s) { return s.agua_km2; })), mx = Math.max.apply(null, ok.map(function (s) { return s.agua_km2; })), pad = Math.max((mx - mn) * .15, mx * .01, .05), y0 = Math.max(0, mn - pad), y1 = mx + pad, n = S.length;
    var X = function (i) { return ml + i * (W - ml - mr) / Math.max(1, n - 1); }, Y = function (v) { return mt + (1 - (v - y0) / (y1 - y0)) * (H - mt - mb); };
    var pts = [], seg = [], d = "", i;
    S.forEach(function (s, k) { if (s.estado === "ok" && s.agua_km2 != null) seg.push([X(k), Y(s.agua_km2), s, k]); else { if (seg.length) pts.push(seg); seg = []; } }); if (seg.length) pts.push(seg);
    var line = pts.map(function (g) { return g.length > 1 ? '<path d="M' + g.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L") + '" fill="none" stroke="#3aa8ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' : ""; }).join("");
    var dots = ok.map(function (s) { var k = S.indexOf(s); return '<circle cx="' + X(k).toFixed(1) + '" cy="' + Y(s.agua_km2).toFixed(1) + '" r="2.4" fill="#3aa8ff"><title>' + esc(fm(s.mes)) + ': ' + f1(s.agua_km2) + ' km² (' + f1(s.validos_pct, 0) + ' % de píxeles válidos)</title></circle>'; }).join("");
    var gaps = S.map(function (s, k) { return s.estado === "ok" ? "" : '<rect x="' + (X(k) - 1.2).toFixed(1) + '" y="' + (H - mb - 5) + '" width="2.4" height="5" rx="1" fill="currentColor" opacity=".35"><title>' + esc(fm(s.mes)) + ': sin escena válida</title></rect>'; }).join("");
    var u = ok[ok.length - 1];
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Extensión mensual del espejo de agua" style="width:100%;height:96px;color:var(--mut,#8aa)">' +
      '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(mx).toFixed(1) + '" y2="' + Y(mx).toFixed(1) + '" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="2 3"/><line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(mn).toFixed(1) + '" y2="' + Y(mn).toFixed(1) + '" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="2 3"/>' +
      gaps + line + dots + '<circle cx="' + X(S.indexOf(u)).toFixed(1) + '" cy="' + Y(u.agua_km2).toFixed(1) + '" r="4.2" fill="none" stroke="#fff" stroke-width="1.6"/></svg>' +
      '<div class="nota" style="display:flex;justify-content:space-between"><span>' + esc(fm(S[0].mes)) + '</span><span>máx. ' + f1(mx) + ' · mín. ' + f1(mn) + ' km²</span><span>' + esc(fm(S[S.length - 1].mes)) + '</span></div>';
  }

  /* ---------- ficha del lago (panel lateral); dato(k,v,full) y pie(txt) son los del módulo que la muestra ---------- */
  function ficha(nombre, tipo, dato, pie) {
    var l = reg(nombre), c = l && medido(l) ? comp(l) : null, col = c && c.pct != null ? (c.pct <= -10 ? "#d7263d" : c.pct <= -3 ? "#f26a1b" : c.pct < 3 ? "#9aa7ba" : "#2d9cdb") : "#9aa7ba";
    var h = '<div class="xc gfi"><div class="gfi-h"><div class="gfi-m" style="--c:' + col + ';font-size:13px">' + (c && c.pct != null ? sg(c.pct, 0) + ' %' : '—') + '</div><div><h3>' + esc(nombre) + '</h3><div class="nota">' + esc(tipo === "salar" ? "Salar" : "Lago") + ' · espejo de agua frente al mismo mes del año anterior</div></div></div>';
    if (D.est !== "ok") return h + pie('La serie de superficie de agua por satélite <b>aún no está disponible</b> (' + esc(D.msg || "consultando…") + '). Se muestra solo el contorno de referencia. La serie se construye con Sentinel-2 en una corrida semanal automática.') + '</div>';
    if (!l) return h + pie('Este cuerpo de agua tiene contorno de referencia pero <b>no se mide</b> por satélite en esta versión.') + '</div>';
    if (!c) return h + '<div class="gpars">' + dato("Superficie de agua", "sin dato", true) + dato("Razón", esc(l.razon || "ninguna escena alcanzó el mínimo de píxeles válidos"), true) + '</div>' + pie('Sin dato no significa sin agua: significa que ninguna imagen de los últimos meses fue lo bastante limpia (nubes, sombra, brillo de sal) para medirla.') + '</div>';
    h += '<div class="gsec">Extensión del espejo de agua · Sentinel-2</div>' + svgSerie(l) + '<div class="gpars">' +
      dato("Última escena válida", f1(c.ahora) + ' km² <small>(' + esc(fd(c.fecha)) + ')</small>') +
      dato("Un año antes", c.antes != null ? f1(c.antes) + ' km² <small>(' + esc(fd(c.fAntes)) + ')</small>' : "sin escena comparable") +
      dato("Variación", c.pct != null ? sg(c.pct) + ' %' : "sin dato") + dato("Contorno de referencia", f1(l.ref_km2) + ' km²') +
      (c.bo != null ? dato("Parte en Bolivia", f1(c.bo) + ' km²' + (c.boRef ? ' <small>(ref. ' + f1(c.boRef) + ' km²)</small>' : "")) : "") +
      dato("Píxeles válidos de la zona", l.actual.validos_pct != null ? f1(l.actual.validos_pct, 0) + ' %' : "—") + '</div>';
    if (l.aviso) h += '<p class="nota" style="color:#f5b700">' + esc(l.aviso) + '</p>';
    var m = meta(), lim = m && m.limitaciones ? m.limitaciones.slice(0, 3) : [];
    return h + pie('<b>Es extensión, no nivel:</b> el nivel (cota) lo mide el SENAMHI y no está conectado a este sistema. Fuente: ' + esc((m && m.fuente) || "Sentinel-2 L2A") + '. ' + (lim.length ? esc(lim.join(" ")) : "") + (generado() ? ' Actualizado: ' + esc(generado().replace("T", " ").slice(0, 16)) + ' UTC.' : "")) + '</div>';
  }
  function leyenda() {
    return '<span class="glin" style="--c:' + (claro() ? "#0b6fb8" : "#6fd3ff") + '"><i class="s" style="background:' + (claro() ? "rgba(11,111,184,.7)" : "rgba(111,211,255,.66)") + '"></i>Agua medida por satélite (última escena válida)</span>' +
      '<span class="glin" style="--c:#46b2ff"><i class="s"></i>Contorno de referencia: donde el lago llegó en otros años, no la superficie de hoy</span><small>Extensión del agua (Sentinel-2), no el nivel. ' + (D.est === "ok" ? "" : "<b>Serie aún no disponible: solo se ve el contorno de referencia.</b>") + '</small>';
  }
  return {cargar: cargar, hay: hay, estado: function () { return D.est; }, mensaje: function () { return D.msg; }, lista: lista, reg: reg, medido: medido, resumen: resumen, alto: alto, refresca: refresca, elige: elige, tip: tip, ficha: ficha, leyenda: leyenda, svgSerie: svgSerie, _depura: function () { return D; }};
})();

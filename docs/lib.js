/* Utilidades compartidas: formato, mapa SVG, gráficos SVG, carga de datos */
var SALA = (function () {
  var DEPS = ["La Paz", "Cochabamba", "Santa Cruz", "Oruro", "Potosí", "Chuquisaca", "Tarija", "Beni", "Pando"];
  var CAT = ["geológica", "meteorológica", "hidrológica", "climatológica", "biológica", "tecnológica", "antropogénica", "otra"];
  var COLCAT = {"geológica": "#8d6e63", "meteorológica": "#1e88e5", "hidrológica": "#00897b", "climatológica": "#ef6c00", "biológica": "#8e24aa", "tecnológica": "#546e7a", "antropogénica": "#c62828", "otra": "#9e9e9e"};
  var ORIGEN = {eonet: "NASA EONET (satélite)", prensa: "Prensa", senamhi: "SENAMHI (oficial)", sismo: "Observatorio San Calixto (oficial)", foco: "NASA FIRMS (satélite)", epidemiologia: "Epidemiología (MSD, OPS/OMS)", modelo: "Modelo meteorológico (pronóstico)", gdacs: "GDACS (ONU/UE)", usgs: "USGS (oficial)"};
  var NIVTXT = ["Verde", "Amarilla", "Naranja", "Roja"];
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
  function fecha(ms, solo) {
    try { return new Date(ms).toLocaleString("es-BO", {timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", year: "numeric", hour: solo ? undefined : "2-digit", minute: solo ? undefined : "2-digit", hour12: false}); }
    catch (e) { return new Date(ms).toISOString(); }
  }
  function diaKey(ms) { try { return new Date(ms).toLocaleDateString("en-CA", {timeZone: "America/La_Paz"}); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } }
  function badgeNivel(e) {
    if (e.nivel === null || e.nivel === undefined) return '<span class="badge bn">Sin nivel</span>';
    return '<span class="badge b' + e.nivel + '">' + NIVTXT[e.nivel] + '</span>';
  }
  function badgeOrigen(e) { return e.oficial ? '<span class="badge bo">Fuente oficial</span>' : (e.origen === "modelo" ? '<span class="badge bn">Pronóstico de modelo</span>' : '<span class="badge bp">Prensa · preliminar</span>'); }
  function urlOk(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function cargar(ruta) { return fetch(ruta + "?t=" + Date.now(), {cache: "no-store"}).then(function (r) { if (!r.ok) throw new Error(ruta + " " + r.status); return r.json(); }); }

  /* ---------- mapa SVG de Bolivia ---------- */
  var LON0 = -69.7, LON1 = -57.4, LAT0 = -22.95, LAT1 = -9.6, K = 100, SX = Math.cos(16 * Math.PI / 180);
  function px(lon) { return (lon - LON0) * SX * K; }
  function py(lat) { return (LAT1 - lat) * K; }
  function mapaSVG(geo, opts) {
    opts = opts || {};
    var W = Math.round((LON1 - LON0) * SX * K), H = Math.round((LAT1 - LAT0) * K), s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.titulo || "Mapa de Bolivia") + '" style="width:100%;height:auto;background:var(--bg);border:1px solid var(--line);border-radius:8px">';
    (geo || []).forEach(function (d) {
      var sel = opts.resaltar && opts.resaltar.indexOf(d.n) >= 0, fill = opts.relleno ? opts.relleno(d.n) : (sel ? "#f6c77a" : "var(--card)");
      var p = d.r.map(function (ring) { return "M" + ring.map(function (c) { return px(c[0]).toFixed(1) + "," + py(c[1]).toFixed(1); }).join("L") + "Z"; }).join("");
      s += '<path d="' + p + '" fill="' + fill + '" stroke="#6b7686" stroke-width="1.4" fill-rule="evenodd"><title>' + esc(d.n) + (opts.titulo_dep ? " — " + esc(opts.titulo_dep(d.n)) : "") + '</title></path>';
    });
    (geo || []).forEach(function (d) {
      var xs = [], ys = [], mx = 0, best = null; d.r.forEach(function (r) { var a = 0; r.forEach(function (c) { a++; }); if (a > mx) { mx = a; best = r; } });
      if (!best) return; var cx = 0, cy = 0; best.forEach(function (c) { cx += px(c[0]); cy += py(c[1]); }); cx /= best.length; cy /= best.length;
      s += '<text x="' + cx.toFixed(0) + '" y="' + cy.toFixed(0) + '" text-anchor="middle" font-size="19" class="mut" style="font-style:italic">' + esc(d.n.toUpperCase()) + '</text>';
      if (opts.etiqueta_dep) { var t = opts.etiqueta_dep(d.n); if (t) s += '<text x="' + cx.toFixed(0) + '" y="' + (cy + 26).toFixed(0) + '" text-anchor="middle" font-size="24" font-weight="700">' + esc(t) + '</text>'; }
    });
    (opts.puntos || []).forEach(function (p) {
      if (p.lat == null || p.lon == null) return;
      s += '<circle cx="' + px(p.lon).toFixed(1) + '" cy="' + py(p.lat).toFixed(1) + '" r="' + (p.r || 9) + '" fill="' + (p.color || "#c62828") + '" fill-opacity="' + (p.op || .85) + '" stroke="#fff" stroke-width="2"><title>' + esc(p.t || "") + '</title></circle>';
    });
    return s + '</svg>';
  }

  /* ---------- gráficos SVG ---------- */
  function barrasH(items, opts) {
    opts = opts || {}; if (!items.length) return '<p class="nota">Sin datos para graficar.</p>';
    var max = Math.max.apply(null, items.map(function (i) { return i.v; })) || 1, h = 22, W = 520, L = opts.izq || 130, s = '<svg viewBox="0 0 ' + W + ' ' + (items.length * h + 6) + '" style="width:100%;height:auto">';
    items.forEach(function (it, k) {
      var w = Math.max(1, (W - L - 50) * it.v / max), y = k * h + 3;
      s += '<text x="' + (L - 6) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11.5">' + esc(it.n) + '</text><rect x="' + L + '" y="' + y + '" width="' + w.toFixed(1) + '" height="16" rx="3" fill="' + (it.c || "#0b5cab") + '"/><text x="' + (L + w + 5).toFixed(1) + '" y="' + (y + 13) + '" font-size="11.5" font-weight="700">' + it.v + '</text>';
    });
    return s + '</svg>';
  }
  function serieDiaria(dias, cats, colores, opts) {
    /* dias: [{d:'2026-10-24', c:{cat:n}}] apilado */
    opts = opts || {}; if (!dias.length) return '<p class="nota">Sin datos para graficar.</p>';
    var W = 560, H = 190, L = 30, B = 34, T = 10, n = dias.length, bw = Math.max(4, Math.min(34, (W - L - 8) / n - 3));
    var tot = dias.map(function (d) { return cats.reduce(function (a, c) { return a + (d.c[c] || 0); }, 0); }), max = Math.max.apply(null, tot) || 1;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto">';
    (max < 4 ? Array.apply(null, Array(max + 1)).map(function (_, i) { return i / max; }) : [0, .5, 1]).forEach(function (f) { var y = T + (H - T - B) * (1 - f); s += '<line x1="' + L + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)"/><text x="' + (L - 4) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" class="mut">' + Math.round(max * f) + '</text>'; });
    dias.forEach(function (d, i) {
      var x = L + 6 + i * ((W - L - 12) / n), y = H - B;
      cats.forEach(function (c) { var v = d.c[c] || 0; if (!v) return; var hh = (H - T - B) * v / max; y -= hh; s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw + '" height="' + hh.toFixed(1) + '" fill="' + (colores[c] || "#999") + '"><title>' + esc(d.d + " · " + c + ": " + v) + '</title></rect>'; });
      if (n <= 16 || i % Math.ceil(n / 12) === 0) s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - B + 13) + '" text-anchor="middle" font-size="9.5" class="mut">' + esc(d.d.slice(5)) + '</text>';
    });
    return s + '</svg>';
  }
  function leyenda(cats, colores) { return '<div class="nota" style="margin-top:4px">' + cats.map(function (c) { return '<span style="display:inline-block;width:10px;height:10px;background:' + colores[c] + ';border-radius:2px;margin:0 4px 0 10px"></span>' + esc(c); }).join("") + '</div>'; }
  function descargar(nombre, contenido, tipo) { var b = new Blob([contenido], {type: tipo}), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function csv(filas) {
    var cab = ["id", "fecha_hora_La_Paz", "origen", "categoria", "titulo", "nivel", "oficial", "lugar", "departamentos", "lat", "lon", "fuente", "url", "cifras", "detalle"];
    var q = function (v) { v = v == null ? "" : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return "﻿" + [cab.join(",")].concat(filas.map(function (e) { return [e.id, fecha(e.ts), e.origen, e.categoria, e.titulo, e.nivel_txt, e.oficial ? "sí" : "no", e.lugar, (e.departamentos || []).join("; "), e.lat == null ? "" : e.lat, e.lon == null ? "" : e.lon, e.fuente, e.url, JSON.stringify(e.cifras || {}), (e.detalle || "").slice(0, 600)].map(q).join(","); })).join("\r\n");
  }
  var URL_PEDIR = "https://script.google.com/macros/s/AKfycbzxWSLP0Vz_vJdugCpOngN-uYVsTEwW9b64phK1Q-xdmLJwiUhGhrUHqLp3srPE5sP0/exec?pedir=1";
  return {DEPS: DEPS, CAT: CAT, COLCAT: COLCAT, ORIGEN: ORIGEN, NIVTXT: NIVTXT, esc: esc, fecha: fecha, diaKey: diaKey, badgeNivel: badgeNivel, badgeOrigen: badgeOrigen, urlOk: urlOk, cargar: cargar,
    mapaSVG: mapaSVG, barrasH: barrasH, serieDiaria: serieDiaria, leyenda: leyenda, descargar: descargar, csv: csv, URL_PEDIR: URL_PEDIR};
})();

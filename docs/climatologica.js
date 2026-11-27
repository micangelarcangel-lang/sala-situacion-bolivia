/* Módulo Climatológica: incendios (focos de calor satelitales), sequía (SPI), propensión a incendios (SENAMHI) y aire y humo (modelo CAMS).
   Mapa: contexto a pedido desde el panel «Capas»; datos solo al pasar el cursor. Fuego distingue foco de calor (detección), complejo (grupo de focos) e incendio reportado; sequía suma lagos y salares (Sentinel-2).
   Cada fenómeno tiene su propia vista en el mapa y su propia ficha. Los datos de aire se piden al navegador (Open-Meteo Air Quality); si no hay conexión se avisa. */
var CLIM2 = (function () {
  var S = SALA, X = S2, M = MAPAZ, A, T, D, map = null, PN = null, LG = {d: "", m: ""}, MK = [], rq = 0, SEL = null, EX = null, FL = [];
  var st = {v: "fuego", dias: 3, frp: 0, cx: true, spi: 6, dia: null, fo: true, pob: false, sal: false, eme: false, dep: true};
  var FP = [], DIAS = [], CX = [], CXD = "", PRO = null, SQ = {}, DET = null;
  var AQ = {estado: "idle", pts: [], dias: [], msg: "", asig: null};
  var COLF = ["#d50000", "#ff6d00", "#ffab00", "#ffe082"];
  var AQC = [[15, "#43a047", "Dentro de la guía OMS (≤ 15)"], [25, "#fdd835", "Sobre la guía OMS (15–25)"], [37.5, "#fb8c00", "Meta interina 4 superada (25–37,5)"], [50, "#e53935", "Meta interina 3 superada (37,5–50)"], [75, "#8e24aa", "Meta interina 2 superada (50–75)"], [1e9, "#4a148c", "Meta interina 1 superada (> 75)"]];
  var SPIC = [[-2, "#a50f15", "extrema"], [-1.5, "#de2d26", "severa"], [-1, "#fb6a4a", "moderada"], [1, "#b8c4d6", "normal"], [1.5, "#9ecae1", "húmeda"], [2, "#4292c6", "muy húmeda"], [9, "#08519c", "extremadamente húmeda"]];
  var ESC = [1, 3, 6, 12];
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function $(i) { return document.getElementById(i); }
  function fmt(n, d) { return d ? (n == null ? "—" : Number(n).toFixed(d).replace(".", ",")) : M.fmt(n); }
  function sg(v, d) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d == null ? 1 : d).replace(".", ","); }
  function fd(s) { return s ? new Date(s + "T12:00:00").toLocaleDateString("es-BO", {day: "numeric", month: "short"}).replace(/\./g, "") : "—"; }
  function hoy() { return S.diaKey(Date.now()); }
  function edadDias(s) { return Math.round((Date.parse(hoy() + "T12:00:00") - Date.parse(s + "T12:00:00")) / 864e5); }
  function rg(a, u) { return !a ? "—" : (a[0] === a[1] ? a[0] : a[0] + "–" + a[1]) + (u || ""); }
  function colSPI(v) { if (v == null) return "#9aa7ba"; for (var i = 0; i < SPIC.length; i++) if (v < SPIC[i][0]) return SPIC[i][1]; return SPIC[SPIC.length - 1][1]; }
  function claseSPI(v) { if (v == null) return "sin dato"; for (var i = 0; i < SPIC.length; i++) if (v < SPIC[i][0]) return SPIC[i][2]; return "extremadamente húmeda"; }
  function claseAQ(v) { if (v == null) return null; for (var i = 0; i < AQC.length; i++) if (v <= AQC[i][0]) return AQC[i]; return AQC[AQC.length - 1]; }
  function depsAlcance() { var k = Object.keys(SQ).sort(); return LG.d ? k.filter(function (d) { return d === LG.d; }) : k; }
  function enLugar(p) { if (!LG.d) return true; if (p.dep !== LG.d) return false; return !LG.m || p.mun === LG.m; }
  function enLugarC(c) { if (!LG.d) return true; if (c.departamento !== LG.d) return false; return !LG.m || (c.municipios || [c.municipio]).indexOf(LG.m) >= 0; }
  function spark(v, col, bar) {
    var n = v.length, W = 240, H = 46, mx = Math.max.apply(0, v.concat([1])); if (!n) return "";
    if (bar) { var bw = Math.max(2, (W - 8) / n - 2); return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Serie diaria">' + v.map(function (a, i) { var h = Math.max(1.5, a / mx * (H - 8)); return '<rect x="' + (4 + i * (W - 8) / n).toFixed(1) + '" y="' + (H - 4 - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5" fill="' + col + '" opacity="' + (i === n - 1 ? 1 : .7) + '"/>'; }).join("") + '</svg>'; }
    var P = v.map(function (a, i) { return [(4 + i * (W - 8) / Math.max(1, n - 1)).toFixed(1), (H - 4 - a / mx * (H - 10)).toFixed(1)]; }), d = "M" + P.map(function (p) { return p.join(","); }).join("L");
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><path d="' + d + 'L' + P[n - 1][0] + ',' + H + 'L' + P[0][0] + ',' + H + 'Z" fill="' + col + '" opacity=".22"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
  }
  function sparkSPI(L) {
    var n = L.length, W = 240, H = 46, bw = (W - 8) / n - 3; if (!n) return "";
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="SPI por departamento"><line x1="0" x2="' + W + '" y1="' + H / 2 + '" y2="' + H / 2 + '" stroke="currentColor" opacity=".25"/>' + L.map(function (x, i) { var h = Math.min(H / 2 - 2, Math.abs(x.v || 0) / 3 * (H / 2 - 2)); return '<rect x="' + (4 + i * (W - 8) / n).toFixed(1) + '" y="' + ((x.v || 0) >= 0 ? H / 2 - h : H / 2).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1.5, h).toFixed(1) + '" rx="1.5" fill="' + colSPI(x.v) + '"/>'; }).join("") + '</svg>';
  }

  /* ---------- datos de incendios ---------- */
  function prep() {
    FP = (T.focos || []).map(function (p) { return {lat: p[0], lon: p[1], frp: p[2] || 0, f: p[3], dep: p[4], mun: p[5]}; });
    DIAS = (T.dias || []).slice().sort(); CX = ((D.focos_complejos || {}).complejos) || []; CXD = (D.focos_complejos || {}).dia || "";
    SQ = (D.sequia && D.sequia.departamentos) || {}; PRO = D.focos_propension || null; DET = D.focos_detectados || null;
  }
  function focos() { var d0 = DIAS[Math.max(0, DIAS.length - st.dias)] || ""; return FP.filter(function (p) { return p.f >= d0 && p.frp >= st.frp && enLugar(p); }); }
  function edadF(f) { var i = DIAS.indexOf(f); return i < 0 ? 9 : DIAS.length - 1 - i; }
  function cxLugar() { return CX.filter(enLugarC).sort(function (a, b) { return b.frp_mw - a.frp_mw; }); }
  /* ¿incendio o solo detección? Un complejo es «reportado» si hay nota de prensa u otro reporte no satelital de incendio/quema en el mismo lugar (±4 días) */
  var REP = {};
  function reportes(c) {
    if (REP[c.id] !== undefined) return REP[c.id];
    var ev = ((D.eventos_unificados || {}).eventos) || [], t = Date.parse(CXD + "T12:00:00-04:00"), rad = radioCx(c) + 12, out = [];
    ev.forEach(function (e) {
      if (e.origen === "foco" || e.categoria !== "climatológica" || !/incendi|quema|fuego|conflagrac/i.test(e.titulo || "")) return;
      if (Math.abs((e.ts || 0) - t) > 4 * 864e5) return;
      var cerca = e.lat != null && e.lon != null && M.hav(c.lat, c.lon, e.lat, e.lon) <= rad, mismo = c.municipio && (e.lugar || "").indexOf(c.municipio) >= 0;
      if (cerca || mismo) out.push(e);
    });
    return REP[c.id] = out;
  }
  function casco(P) {
    P = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }); if (P.length < 3) return null;
    var cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }, lo = [], up = [], i;
    for (i = 0; i < P.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], P[i]) <= 0) lo.pop(); lo.push(P[i]); }
    for (i = P.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], P[i]) <= 0) up.pop(); up.push(P[i]); }
    up.pop(); lo.pop(); var h = lo.concat(up); return h.length >= 3 ? h : null;
  }
  function geoHull() {
    var d0 = DIAS[Math.max(0, DIAS.length - 2)] || "";
    return M.fc(st.cx ? cxLugar().map(function (c) {
      var b = c.bbox; if (!b) return null; var P = FP.filter(function (p) { return p.f >= d0 && p.lon >= b[0] - .01 && p.lon <= b[2] + .01 && p.lat >= b[1] - .01 && p.lat <= b[3] + .01; }).map(function (p) { return [p.lon, p.lat]; }), h = casco(P);
      if (!h) return null; h.push(h[0]); return {type: "Feature", geometry: {type: "Polygon", coordinates: [h]}, properties: {id: c.id, r: reportes(c).length ? 1 : 0}};
    }).filter(Boolean) : []);
  }
  function porDia(L, fn) { return DIAS.map(function (d) { return L.reduce(function (a, p) { return a + (p.f === d ? fn(p) : 0); }, 0); }); }
  function evol(lat, lon, km) { var n = DIAS.map(function () { return 0; }), w = n.slice(); FP.forEach(function (p) { var i = DIAS.indexOf(p.f); if (i >= 0 && M.hav(lat, lon, p.lat, p.lon) <= km) { n[i]++; w[i] += p.frp; } }); return {n: n, w: w}; }
  function radioCx(c) { var b = c.bbox; if (!b) return 4; return Math.max(3, M.hav(b[1], b[0], b[3], b[2]) / 2 + 2); }
  function proDe(dep) {
    if (!PRO || !PRO.dias) return null; var ks = Object.keys(PRO.dias).sort(), h = hoy(), k = ks.indexOf(h) >= 0 ? h : ks[ks.length - 1]; if (!k) return null;
    var rows = (PRO.dias[k] || []).filter(function (x) { return x.departamento === dep; }); if (!rows.length) return null;
    var ord = function (x) { return /muy/i.test(x.propension) ? 2 : /^propensa$/i.test(String(x.propension).trim()) ? 1 : 0; }, r = rows.slice().sort(function (a, b) { return ord(b) - ord(a); })[0];
    return {d: k, rows: rows, r: r, edad: edadDias(k), ord: ord};
  }
  function proTxt(pr) {
    var g = {}; pr.rows.forEach(function (x) { (g[x.propension] = g[x.propension] || []).push(x.region); });
    return Object.keys(g).map(function (k) { return '<b>' + esc(k) + '</b>: ' + esc(g[k].join(", ")); }).join(" · ");
  }
  function proResumen() {
    if (!PRO || !PRO.dias) return null; var ks = Object.keys(PRO.dias).sort(); if (!ks.length) return null; var h = hoy(), k = ks.indexOf(h) >= 0 ? h : ks[ks.length - 1], L = (PRO.dias[k] || []).filter(function (x) { return !LG.d || x.departamento === LG.d; });
    var muy = L.filter(function (x) { return /muy/i.test(x.propension); }), pro = L.filter(function (x) { return /^propensa$/i.test(String(x.propension).trim()); });
    var b = String(PRO.boletin || ""), bol = /^\d{8}$/.test(b) ? b.slice(0, 4) + "-" + b.slice(4, 6) + "-" + b.slice(6) : null;
    return {k: k, edad: edadDias(k), muy: muy, pro: pro, n: L.length, bol: bol, url: PRO.url};
  }

  /* ---------- aire y humo (modelo CAMS vía Open-Meteo Air Quality) ---------- */
  function rejilla() {
    var P = [], la, lo; T.lista.forEach(function (m) { M.cen(m); });
    for (la = -22.5; la <= -9.5; la += 1) for (lo = -69.5; lo <= -57.5; lo += 1) {
      var ok = !!T.donde(la, lo); if (!ok) for (var i = 0; i < T.lista.length; i++) { var c = T.lista[i]._c; if (Math.abs(c[1] - la) < 1 && Math.abs(c[0] - lo) < 1 && M.hav(la, lo, c[1], c[0]) <= 70) { ok = true; break; } }
      if (ok) P.push([la, lo]);
    }
    return P;
  }
  function resumenAire(j, G) {
    var arr = Array.isArray(j) ? j : [j], dias = {}, pts = [];
    if (arr.length !== G.length) throw new Error("el modelo devolvió " + arr.length + " puntos de " + G.length);
    arr.forEach(function (o, i) {
      var h = o && o.hourly; if (!h || !h.time || !h.pm2_5) throw new Error("respuesta sin datos horarios");
      var por = {}; h.time.forEach(function (t, k) { var d = String(t).slice(0, 10), v = h.pm2_5[k], w = h.pm10 ? h.pm10[k] : null; var q = por[d] || (por[d] = {a: [], b: []}); if (v != null) q.a.push(v); if (w != null) q.b.push(w); });
      var dd = {}; Object.keys(por).forEach(function (d) { var q = por[d]; if (q.a.length >= 12) { dd[d] = {m: q.a.reduce(function (s, x) { return s + x; }, 0) / q.a.length, x: Math.max.apply(0, q.a), p: q.b.length >= 12 ? q.b.reduce(function (s, x) { return s + x; }, 0) / q.b.length : null}; dias[d] = 1; } });
      pts.push({lat: G[i][0], lon: G[i][1], d: dd});
    });
    return {pts: pts, dias: Object.keys(dias).sort()};
  }
  function asignarAire() {
    var G = AQ.pts, asig = G.map(function () { return []; });
    T.lista.forEach(function (m) { var c = M.cen(m), b = -1, bd = 1e9; G.forEach(function (g, i) { var d = M.hav(c[1], c[0], g.lat, g.lon); if (d < bd) { bd = d; b = i; } }); if (b >= 0 && bd <= 120) asig[b].push({m: m, d: bd}); });
    AQ.asig = asig;
  }
  function cargarAire(forzar) {
    AQ.estado = "cargando"; AQ.msg = ""; AQ.asig = null; pintaAire(); if (st.v === "aire") dibuja();
    var KEY = "sala_aire_v1", ahora = Date.now();
    try { var c = !forzar && JSON.parse(localStorage.getItem(KEY) || "null"); if (c && ahora - c.t < 3 * 36e5 && c.pts && c.pts.length) { AQ.pts = c.pts; AQ.dias = c.dias; AQ.t = c.t; AQ.estado = "ok"; asignarAire(); aireListo(); return; } } catch (e) {}
    var G = rejilla(), u = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + G.map(function (g) { return g[0]; }).join(",") + "&longitude=" + G.map(function (g) { return g[1]; }).join(",") + "&hourly=pm2_5,pm10&past_days=2&forecast_days=3&timezone=America%2FLa_Paz";
    fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status === 429 ? "el servicio limitó las consultas (error 429); reintente en unos minutos" : "el servicio respondió " + r.status); return r.json(); }).then(function (j) {
      var R = resumenAire(j, G); AQ.pts = R.pts; AQ.dias = R.dias; AQ.t = Date.now(); AQ.estado = "ok"; asignarAire();
      try { localStorage.setItem(KEY, JSON.stringify({t: AQ.t, pts: AQ.pts, dias: AQ.dias})); } catch (e) {}
      aireListo();
    }).catch(function (e) { AQ.estado = "error"; AQ.msg = (e && e.message) || "sin conexión"; aireListo(); });
  }
  function diaAire() { var h = hoy(); if (st.dia && AQ.dias.indexOf(st.dia) >= 0) return st.dia; return AQ.dias.indexOf(h) >= 0 ? h : AQ.dias[AQ.dias.length - 1]; }
  function puntosAire() { var d = diaAire(); return AQ.pts.map(function (g, i) { var q = g.d[d]; return {i: i, lat: g.lat, lon: g.lon, v: q ? q.m : null, x: q ? q.x : null, p: q ? q.p : null}; }); }
  function aireAlcance() { var P = puntosAire().filter(function (p) { return p.v != null; }); if (!LG.d) return P; return P.filter(function (p) { return (AQ.asig[p.i] || []).some(function (z) { return z.m.d === LG.d && (!LG.m || z.m.n === LG.m); }); }); }
  function pobSobre(v0) { var tot = 0, sobre = 0, P = puntosAire(); T.lista.forEach(function (m) { if (m.pob == null) return; if (LG.d && (m.d !== LG.d || (LG.m && m.n !== LG.m))) return; var c = M.cen(m), b = null, bd = 1e9; P.forEach(function (g) { if (g.v == null) return; var d = M.hav(c[1], c[0], g.lat, g.lon); if (d < bd) { bd = d; b = g; } }); tot += m.pob; if (b && bd <= 120 && b.v > v0) sobre += m.pob; }); return {tot: tot, sobre: sobre}; }

  /* ---------- pulso: cuatro fenómenos ---------- */
  function tarjeta(col, ic, tit, big, sub, extra, sp) { return '<div class="card cpc" style="--k:' + col + '"><div class="eye">' + X.ic(ic) + '<span>' + tit + '</span></div><div class="big">' + big + '</div><div class="sub">' + sub + '</div>' + (extra || "") + '<div class="sp" style="color:' + col + '">' + (sp || "") + '</div></div>'; }
  function chipLagos() {
    var r = LAGOS.resumen(), t, c;
    if (LAGOS.estado() === "pend" || LAGOS.estado() === "carga") { c = "#7b8794"; t = "Lagos (satélite): consultando…"; }
    else if (LAGOS.estado() !== "ok") { c = "#7b8794"; t = "Lagos (satélite): serie aún no disponible"; }
    else if (!r.n) { c = "#7b8794"; t = "Lagos (satélite): sin escenas útiles"; }
    else if (r.peor) { c = r.peor.variacion_pct <= -10 ? "#d7263d" : r.peor.variacion_pct <= -3 ? "#f26a1b" : "#2377c9"; t = "Lagos: " + esc(r.peor.nombre) + " " + sg(r.peor.variacion_pct, 0) + " % en un año · " + r.n + " de " + r.total + " medidos"; }
    else { c = "#2377c9"; t = "Lagos (satélite): " + r.n + " de " + r.total + " medidos, sin año previo comparable"; }
    return '<div style="margin-top:6px"><span class="cchip" style="--v:' + c + '">' + t + '</span></div>';
  }
  function pulso() {
    var h = "", ult = DIAS[DIAS.length - 1], L = FP.filter(enLugar), nd = porDia(L, function () { return 1; }), uv = nd[nd.length - 1] || 0, prev = nd.slice(-4, -1), pm = prev.length ? prev.reduce(function (a, b) { return a + b; }, 0) / prev.length : 0;
    var dl = pm > 0 ? Math.round((uv - pm) / pm * 100) : null, cl = cxLugar(), mw = L.filter(function (p) { return p.f === ult; }).reduce(function (a, p) { return a + p.frp; }, 0);
    h += tarjeta("#ef6c00", "fire", "Incendios", fmt(uv) + ' <small>focos el ' + fd(ult) + '</small>', (dl == null ? "sin días previos para comparar" : '<span class="' + (dl > 0 ? "cup" : "cdn") + '">' + (dl > 0 ? "▲ " : "▼ ") + Math.abs(dl) + ' %</span> frente al promedio de los 3 días previos') + ' · ' + cl.length + ' complejo(s) · ' + fmt(mw) + ' MW', "", spark(nd, "#ef6c00", true));
    var ds = depsAlcance(), v6 = ds.map(function (d) { return {d: d, v: SQ[d].spi6}; }), n6 = v6.filter(function (x) { return x.v != null && x.v <= -1; }).length, n12 = ds.filter(function (d) { return SQ[d].spi12 != null && SQ[d].spi12 <= -1; }).length;
    if (ds.length === 1) {
      var q = SQ[ds[0]] || {}, mu = !!LG.m;
      h += tarjeta(colSPI(q.spi6), "sun", "Sequía (SPI) · " + esc(ds[0]), sg(q.spi6, 1) + ' <small>SPI-6: ' + esc(claseSPI(q.spi6)) + '</small>', 'SPI-3: ' + sg(q.spi3, 1) + ' (' + esc(claseSPI(q.spi3)) + ') · SPI-12: ' + sg(q.spi12, 1) + ' (' + esc(claseSPI(q.spi12)) + '). ' + (mu ? 'Dato del departamento, no del municipio. ' : '') + 'Calculado hasta ' + esc(D.sequia && D.sequia.ultimo_mes || "—") + '.', chipLagos(), sparkSPI(ESC.map(function (e) { return {v: q["spi" + e]}; })));
    } else
    h += tarjeta("#8d6e63", "sun", "Sequía (SPI)", n6 + ' <small>de ' + ds.length + ' dep. con déficit</small>', 'SPI-6 ≤ −1 (lluvia de 6 meses). Con SPI-12: ' + n12 + ' de ' + ds.length + '. Calculado hasta ' + esc(D.sequia && D.sequia.ultimo_mes || "—") + '.', chipLagos(), sparkSPI(v6));
    var pr = proResumen(), ve = pr && pr.edad > 0;
    h += tarjeta("#d84315", "shield", "Propensión a incendios (SENAMHI)", pr ? (pr.muy.length + pr.pro.length) + ' <small>de ' + pr.n + ' zonas propensas' + (ve ? ' (último boletín)' : '') + '</small>' : '—', pr ? (pr.muy.length ? 'Muy propensa: ' + esc(pr.muy.map(function (x) { return x.departamento + " (" + x.region + ")"; }).join(", ")) + '. ' : '') + (pr.pro.length ? 'Propensa: ' + esc(pr.pro.slice(0, 4).map(function (x) { return x.departamento + " (" + x.region + ")"; }).join(", ")) + (pr.pro.length > 4 ? "…" : "") + '.' : 'Ninguna zona propensa.') : 'Sin boletín cargado.', pr ? '<div style="margin-top:6px"><span class="cchip" style="--v:' + (ve ? "#b7791f" : "#2e9e5b") + '">' + (pr.bol ? 'Boletín del ' + fd(pr.bol) + ' · ' : '') + 'pronóstico del ' + fd(pr.k) + (ve ? ' · desactualizado (hace ' + pr.edad + ' d)' : ' · vigente') + '</span></div>' : "", "");
    h += '<div class="card cpc" id="cAireP" style="--k:#5e35b1"></div>';
    $("cPul").innerHTML = h; pintaAire();
  }
  function pintaAire() {
    var el = $("cAireP"); if (!el) return; var tit = '<div class="eye">' + X.ic("wave") + '<span>Aire y humo (modelo)</span></div>', r;
    if (AQ.estado === "cargando" || AQ.estado === "idle") r = tit + '<div class="big" style="font-size:22px;margin-top:10px">Consultando el modelo…</div><div class="sub">Estimación CAMS por Open-Meteo para ~100 puntos de Bolivia.</div>';
    else if (AQ.estado === "error") r = tit + '<div class="big" style="font-size:20px;margin-top:10px">Sin datos de aire</div><div class="sub">No se pudo consultar el modelo: ' + esc(AQ.msg) + '. El resto del módulo funciona igual.</div><div style="margin-top:6px"><button class="btn s" type="button" id="cAireR">Reintentar</button></div>';
    else {
      var P = aireAlcance(), mx = P.reduce(function (a, p) { return !a || p.v > a.v ? p : a; }, null), sobre = P.filter(function (p) { return p.v > 15; }).length, po = pobSobre(15), d = diaAire();
      var serie = AQ.dias.map(function (k) { var vs = AQ.pts.map(function (g) { return g.d[k] ? g.d[k].m : null; }).filter(function (x) { return x != null; }); return vs.length ? Math.max.apply(0, vs) : 0; });
      var cl = mx ? claseAQ(mx.v) : null;
      r = tit + '<div class="big">' + (mx ? fmt(mx.v, 0) : "—") + ' <small>µg/m³ PM2,5 (máx.)</small></div><div class="sub">' + (mx ? sobre + ' de ' + P.length + ' puntos sobre la guía OMS (15) ' + (d === hoy() ? "hoy" : "el " + fd(d)) + (po.tot ? ' · ' + Math.round(po.sobre / po.tot * 100) + ' % de la población' : "") + '.' : 'Sin puntos en este lugar.') + '</div>' + (cl ? '<div style="margin-top:6px"><span class="cchip" style="--v:' + cl[1] + '">' + esc(cl[2]) + '</span></div>' : "") + '<div class="sp">' + spark(serie, "#5e35b1", true) + '</div>';
    }
    el.innerHTML = r; var b = $("cAireR"); if (b) b.onclick = function () { cargarAire(true); };
    avisoAire();
  }
  function avisoAire() {
    var av = $("cAq"); if (!av) return; if (st.v !== "aire" || AQ.estado === "ok") { av.hidden = true; return; }
    av.hidden = false; av.innerHTML = AQ.estado === "error" ? 'No se pudo cargar el aire y humo (' + esc(AQ.msg) + '). El resto del módulo funciona. <button class="xlink" type="button" id="cAq2">Reintentar</button>' : 'Consultando el modelo de calidad del aire…';
    var b = $("cAq2"); if (b) b.onclick = function () { cargarAire(true); };
  }
  function aireListo() { pintaAire(); if (st.v === "aire") dibuja(); }

  /* ---------- html ---------- */
  var GRUPOS = [
    {t: "Base", items: [{id: "dep", t: "Departamentos", on: true, sw: "#cfe0f7"}, {id: "mun", t: "Límites municipales", on: true, sw: "#9db4d4", h: "Se ven al acercar el mapa"}]},
    {t: "Fuego: qué es cada cosa", items: [{id: "den", t: "Densidad de focos", on: true, v: "fuego", sw: "#ff9800", h: "Mapa de calor de las detecciones"}, {id: "fo", t: "Focos de calor (detecciones)", on: true, v: "fuego", sw: "#ff6d00", h: "Aparecen al acercar el mapa"}, {id: "cxa", t: "Complejos de focos (sin reporte)", on: true, v: "fuego", sw: "#ffb02e"}, {id: "inc", t: "Incendios reportados", on: true, v: "fuego", sw: "#ff4d3d", h: "Complejos con nota de prensa u otro reporte en el lugar"}]},
    {t: "Sequía", items: [{id: "spi", t: "SPI por departamento", on: true, v: "sequia", sw: "#de2d26"}, {id: "lag", t: "Lagos y salares (satélite)", on: true, v: "sequia", sw: "#46b2ff", h: "Contorno de referencia y agua medida con Sentinel-2"}, {id: "cu", t: "Cuencas", on: false, v: "sequia", sw: "#22b8cf"}, {id: "rio", t: "Red de ríos", on: false, v: "sequia", sw: "#5fd0ff"}]},
    {t: "Aire", items: [{id: "fo2", t: "Focos de calor", on: true, v: "aire", sw: "#ff5722"}]},
    {t: "Contexto (a pedido)", items: [{id: "pob", t: "Población", on: false, v: "fuego|aire", sw: "#8461f0"}, {id: "sal", t: "Hospitales y centros de salud", on: false, v: "fuego|aire", sw: "#34d17a"}, {id: "eme", t: "Bomberos y policía", on: false, v: "fuego|aire", sw: "#ff6b5e"}]}
  ];
  function html() {
    return '<nav class="tnav"><a href="index.html">Tablero</a><span class="tsep">›</span><b>Tipo de evento · Climatológica</b></nav><h1 class="th">Climatológica <small>incendios, sequía, propensión y aire</small></h1>' +
      '<div class="cap">Fuentes: NASA FIRMS (focos de calor), SPI con ERA5 (Open-Meteo), SENAMHI (propensión) y modelo CAMS (aire). <b>Un foco es una detección satelital de calor, no un incendio confirmado</b> (incluye quemas agrícolas). «Incendio reportado» = hay una nota de prensa u otro reporte en el mismo lugar. Información preliminar.</div>' +
      '<div class="cpul" id="cPul"></div>' +
      '<div class="xq"><div class="xs1" id="lgBox"></div></div>' +
      '<div class="cvw"><b>Ver en el mapa</b><button type="button" data-v="fuego">' + X.ic("fire") + 'Incendios</button><button type="button" data-v="sequia">' + X.ic("sun") + 'Sequía y lluvia</button><button type="button" data-v="aire">' + X.ic("wave") + 'Aire y humo</button></div>' +
      '<div class="cvc" id="cCtl"></div><div class="xhelp" id="cH"></div>' +
      '<div class="xg"><div class="xmw"><div class="xtool" id="cTool"><span class="xtl">Mapa base</span><button type="button" data-b="calles" class="on">Calles</button><button type="button" data-b="topo">Relieve</button><button type="button" data-b="sat">Satélite</button><button type="button" data-b="none">Sin mapa</button></div><div style="position:relative"><div class="xmap" id="cMap"></div><div id="cCapas"></div><div class="xav" id="cAv" style="top:14px" hidden></div><div class="xav" id="cAq" style="top:70px" hidden></div></div><div class="xleg" id="cL"></div></div>' +
      '<div class="xside"><div id="cDet"></div></div></div><div id="eviP"></div>' +
      '<div class="g3"><div class="card"><h3>Focos por día y potencia</h3><div id="cG1" style="height:260px"></div><p class="nota" id="cG1n"></p></div>' +
      '<div class="card"><h3>Departamento × día (focos)</h3><div id="cG2" style="height:260px"></div><p class="nota" id="cG2n"></p></div>' +
      '<div class="card"><h3>Sequía: SPI por escala y departamento</h3><div id="cG3" style="height:260px"></div><p class="nota" id="cG3n"></p></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="xtabs"><button class="on" data-s="cTc">Complejos de incendio</button><button data-s="cTm">Municipios con más focos</button><button data-s="cTs">Sequía por departamento</button><button data-s="cTp">Prensa climatológica</button></div><div id="cTc"></div><div id="cTm" style="display:none"></div><div id="cTs" style="display:none"></div><div id="cTp" style="display:none"></div></div>' +
      '<div id="cMon">' + (window.CLIMA ? CLIMA.seccion("clima", cfgMon()) : "") + '</div>';
  }
  function cfgMon() { return {col: "#ef6c00", geoMun: D.geoMun, colN: ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"], nivT: ["Verde", "Amarilla", "Naranja", "Roja"], avisos: function (k) { return T.avisos.filter(function (a) { return (a.municipios || []).indexOf(k) >= 0; }); }}; }

  /* ---------- controles por vista ---------- */
  function controles() {
    var h = "", v = st.v, ch = function (t, k, val, cur) { return '<button type="button" data-k="' + k + '" data-v="' + val + '"' + (String(cur) === String(val) ? ' class="on"' : "") + '>' + t + '</button>'; };
    if (v === "fuego") h = '<div class="cg"><b>Período</b>' + [[1, "1 día"], [3, "3 días"], [7, "7 días"], [14, "14 días"]].map(function (x) { return ch(x[1], "dias", x[0], st.dias); }).join("") + '</div><div class="cg"><b>Potencia (FRP)</b>' + [[0, "Todos"], [10, "≥ 10 MW"], [50, "≥ 50 MW"]].map(function (x) { return ch(x[1], "frp", x[0], st.frp); }).join("") + '</div>';
    else if (v === "sequia") h = '<div class="cg"><b>Escala SPI</b>' + ESC.map(function (e) { return ch("SPI-" + e, "spi", e, st.spi); }).join("") + '</div><span class="nota">SPI-1 es poco informativo en la estación seca; use 6 o 12 meses. Sequía meteorológica, no declaratoria.</span>';
    else if (AQ.estado === "ok") h = '<div class="cg"><b>Día</b>' + AQ.dias.map(function (k) { var e = edadDias(k), t = e === 0 ? "Hoy" : e === 1 ? "Ayer" : e === -1 ? "Mañana" : fd(k); return ch(t + (e === 0 ? "" : ""), "dia", k, diaAire()); }).join("") + '</div><span class="nota">Promedio de 24 h de PM2,5, punto del modelo cada ~1°.</span>';
    $("cCtl").innerHTML = h;
    [].forEach.call($("cCtl").querySelectorAll("button[data-k]"), function (b) { b.onclick = function () { var k = b.dataset.k; st[k] = k === "dia" ? b.dataset.v : +b.dataset.v; SEL = k === "dia" ? SEL : null; dibuja(); }; });
  }

  /* ---------- selección automática ---------- */
  function autoSel() {
    if (st.v === "fuego") {
      if (SEL && SEL.t === "cx" && cxLugar().some(function (c) { return c.id === SEL.c.id; })) return; if (SEL && SEL.t === "fo" && focos().indexOf(SEL.p) >= 0) return;
      var c = cxLugar()[0]; if (c) { SEL = {t: "cx", c: c}; return; }
      var F = focos().sort(function (a, b) { return b.frp - a.frp; })[0]; SEL = F ? {t: "fo", p: F} : null;
    } else if (st.v === "sequia") {
      if (SEL && SEL.t === "lg") return; var ds = depsAlcance(); if (SEL && SEL.t === "dep" && ds.indexOf(SEL.d) >= 0) return;
      var w = ds.slice().sort(function (a, b) { return (SQ[a]["spi" + st.spi] == null ? 9 : SQ[a]["spi" + st.spi]) - (SQ[b]["spi" + st.spi] == null ? 9 : SQ[b]["spi" + st.spi]); })[0]; SEL = w ? {t: "dep", d: w} : null;
    } else {
      if (SEL && SEL.t === "aq") return; var P = aireAlcance().sort(function (a, b) { return b.v - a.v; })[0]; SEL = P ? {t: "aq", i: P.i} : null;
    }
  }
  function expoSel() {
    EX = null; var r = [10, 25, 50];
    if (SEL && SEL.t === "cx") EX = M.expo(SEL.c.lat, SEL.c.lon, r, 50); else if (SEL && SEL.t === "fo") EX = M.expo(SEL.p.lat, SEL.p.lon, r, 50);
    else if (SEL && SEL.t === "aq" && AQ.asig) { var g = AQ.pts[SEL.i]; EX = {mu: (AQ.asig[SEL.i] || []).map(function (z) { return {m: z.m, d: z.d}; }), C: [], lat: g.lat, lon: g.lon, aq: 1}; r = []; }
    return r;
  }

  /* ---------- fichas ---------- */
  function dato(k, v, full) { return '<div class="gpar' + (full ? " full" : "") + '"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function pie(txt) { return '<p class="nota" style="margin:8px 0 0">' + txt + '</p>'; }
  function cerc(E, km) {
    var hc = M.primero(E.C, ["hosp"]), bc = M.primero(E.C, ["bom", "res"]), pr = M.principales(E, 4);
    return '<div class="gsec">Qué hay cerca</div>' + M.tablaAn(E.R) + '<p class="nota" style="margin:6px 0">' + M.notaPob(E) + '</p>' +
      dato("Hospital más cercano", hc ? esc(hc.p.n) + ' · ' + fmt(hc.d, 1) + ' km' : 'ninguno a ≤ ' + km + ' km en el mapa') + dato("Bomberos / rescate", bc ? esc(bc.p.n) + ' · ' + fmt(bc.d, 1) + ' km' : 'ninguno a ≤ ' + km + ' km en el mapa') +
      (pr.length ? '<div class="gsec">Poblaciones principales (en el punto o a ≤ ' + km + ' km)</div><table class="xt2 gfi-t"><tr><td></td><td style="text-align:right"><b>' + M.cabHab(E) + '</b></td><td style="text-align:right"><b>Distancia</b></td></tr>' + pr.map(function (x) { return '<tr><td><a href="municipio.html?d=' + encodeURIComponent(x.m.d) + '&m=' + encodeURIComponent(x.m.n) + '">' + esc(x.m.n) + '</a></td><td style="text-align:right">' + M.habX(x, E) + '</td><td style="text-align:right">' + (x.en ? "aquí" : fmt(x.d) + ' km') + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Ningún municipio a menos de ' + km + ' km.</p>');
  }
  function aireCerca(lat, lon) {
    if (AQ.estado !== "ok") return AQ.estado === "error" ? "sin datos (el modelo no respondió)" : "consultando…";
    var d = diaAire(), b = null, bd = 1e9; AQ.pts.forEach(function (g, i) { var q = g.d[d], dist = M.hav(lat, lon, g.lat, g.lon); if (q && dist < bd) { bd = dist; b = {q: q, d: dist}; } });
    if (!b) return "sin dato"; var c = claseAQ(b.q.m); return '<span class="cchip" style="--v:' + c[1] + '">' + fmt(b.q.m, 0) + ' µg/m³</span> PM2,5 (punto del modelo a ' + fmt(b.d) + ' km)';
  }
  function fichaFuego() {
    var c = SEL.t === "cx" ? SEL.c : null, p = SEL.t === "fo" ? SEL.p : null, lat = c ? c.lat : p.lat, lon = c ? c.lon : p.lon, dep = c ? c.departamento : p.dep, mun = c ? c.municipio : p.mun, E = EX, km = 50, h = "";
    var rad = c ? radioCx(c) : 3, ev = evol(lat, lon, rad), ult = ev.n.length - 1, a3 = ev.n.slice(-3).reduce(function (s, x) { return s + x; }, 0), b3 = ev.n.slice(-6, -3).reduce(function (s, x) { return s + x; }, 0), act = ev.n.filter(function (x) { return x > 0; }).length;
    var tend = b3 > 0 ? Math.round((a3 - b3) / b3 * 100) : null, mx = FP.filter(function (q) { return q.f === (c ? CXD : p.f) && M.hav(lat, lon, q.lat, q.lon) <= rad; }).reduce(function (a, q) { return Math.max(a, q.frp); }, 0), pr = proDe(dep), prim = DIAS.filter(function (d, i) { return ev.n[i] > 0; })[0];
    h += '<div class="xc gfi"><div class="gfi-h"><div class="gfi-m" style="--c:#d84315;font-size:' + (c && c.n > 99 ? 13 : 15) + 'px">' + (c ? c.n + " focos" : fmt(p.frp, 1) + " MW") + '</div><div><h3>' + esc(mun || dep) + (mun ? ', ' + esc(dep) : '') + '</h3><div class="nota">' + (c ? 'Complejo de incendio del ' + fd(CXD) : 'Foco del ' + fd(p.f) + ' (' + (edadF(p.f) === 0 ? "último día" : "hace " + edadF(p.f) + " d") + ')') + '</div></div></div>';
    h += '<div class="gsec">Parámetros ' + (c ? 'del complejo' : 'del foco') + '</div><div class="gpars">' + (c ? dato("Focos detectados", c.n) + dato("Potencia radiativa total", fmt(c.frp_mw, 1) + " MW") + dato("Foco más intenso", fmt(mx, 1) + " MW") + dato("Extensión aprox.", fmt(rad * 2) + " km") + dato("Municipios", esc((c.municipios || [c.municipio]).join(", "))) : dato("Potencia radiativa (FRP)", fmt(p.frp, 1) + " MW") + dato("Fecha de detección", fd(p.f)) + dato("Municipio", esc(mun || "—"))) +
      dato("Días con detección (≤ " + fmt(rad) + " km, " + DIAS.length + " d)", act + " de " + DIAS.length) + dato("Primera detección en el período", prim ? fd(prim) : "—") + dato("Tendencia 3 d vs. 3 d previos", tend == null ? "sin referencia" : '<span class="' + (tend > 0 ? "cup" : "cdn") + '">' + (tend > 0 ? "▲ " : "▼ ") + Math.abs(tend) + ' %</span>') + '</div>';
    if (c) { var rp = reportes(c); h += '<div class="gsec">¿Incendio o solo detección?</div><div class="gpars">' + dato("Estado", rp.length ? '<span class="cchip" style="--v:#ff4d3d">Incendio reportado</span> ' + rp.length + ' reporte(s) en el mismo lugar' : '<span class="cchip" style="--v:#ffb02e">Solo detección satelital</span> sin reportes en ±4 días', 1) + '</div>' + (rp.length ? '<div class="nota">' + rp.slice(0, 3).map(function (e) { return (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' : '') + esc(e.titulo) + (e.url ? '</a>' : '') + ' · ' + esc(e.fuente || "") + ' · ' + fd(new Date(e.ts).toISOString().slice(0, 10)); }).join("<br>") + '</div>' : '<div class="nota">Un complejo agrupa focos vecinos de 2 días; incluye quemas agrícolas y no equivale a un incendio confirmado.</div>'); }
    else h += '<div class="nota">Un foco es una detección térmica puntual (un píxel de 375 m del satélite): indica calor, no confirma un incendio.</div>';
    h += '<div class="gsec">Focos por día en el área (≤ ' + fmt(rad) + ' km)</div><div class="gsp2" style="color:#d84315">' + spark(ev.n, "#d84315", true) + '</div><div class="nota" style="display:flex;justify-content:space-between"><span>' + fd(DIAS[0]) + '</span><span>' + fd(DIAS[DIAS.length - 1]) + '</span></div>';
    h += '<div class="gsec">Condiciones</div><div class="gpars">' + dato("Propensión SENAMHI (" + esc(dep) + ")", pr ? proTxt(pr) + '<br>Zona más propensa (' + esc(pr.r.region) + '): Tmax ' + rg(pr.r.tmax, " °C") + ' · HR ' + rg(pr.r.hr, " %") + ' · viento ' + rg(pr.r.viento_kmh, " km/h") + ' <small>(pronóstico del ' + fd(pr.d) + (pr.edad > 0 ? ", desactualizado" : "") + ')</small>' : "sin dato", 1) + dato("Aire (modelo)", aireCerca(lat, lon), 1) + '</div>';
    h += cerc(E, km) + pie('<b>Detecciones térmicas del satélite VIIRS, no incendios confirmados:</b> incluyen quemas agrícolas. No hay datos de cobertura vegetal, viento local ni área quemada, así que <b>no se estima propagación ni daño</b>. Fuente: NASA FIRMS.') + '</div>'; return h;
  }
  function fichaDep() {
    var d = SEL.d, s = SQ[d] || {}, ms = T.DEP[d] || [], pob = ms.reduce(function (a, m) { return a + (m.pob || 0); }, 0), nf = FP.filter(function (p) { return p.dep === d && p.f >= DIAS[Math.max(0, DIAS.length - 3)]; }).length, pr = proDe(d), ser = (s.serie_spi3 || []).map(function (x) { return x[1]; });
    var barras = '<div class="cbars">' + ESC.map(function (e) { var v = s["spi" + e]; return '<div><b>' + sg(v, 2) + '</b><i style="height:' + Math.max(3, Math.min(60, Math.abs(v || 0) / 3 * 60)) + 'px;background:' + colSPI(v) + ';opacity:' + (e === st.spi ? 1 : .6) + '"></i>SPI-' + e + '</div>'; }).join("") + '</div>';
    return '<div class="xc gfi"><div class="gfi-h"><div class="gfi-m" style="--c:' + colSPI(s["spi" + st.spi]) + ';font-size:13px">' + sg(s["spi" + st.spi], 1) + '</div><div><h3>' + esc(d) + '</h3><div class="nota">SPI-' + st.spi + ': ' + esc(claseSPI(s["spi" + st.spi])) + ' · hasta ' + esc(D.sequia && D.sequia.ultimo_mes || "—") + '</div></div></div>' +
      '<div class="gsec">Índice de precipitación estandarizado</div>' + barras + '<div class="gpars">' + dato("Precipitación del último mes", s.precip_mes_mm != null ? fmt(s.precip_mes_mm, 1) + " mm de " + fmt(s.normal_mes_mm, 1) + " normales (" + fmt(s.pct_normal, 0) + " %)" : "sin dato") +
      dato("Clase por escala", ESC.map(function (e) { return 'SPI-' + e + ': ' + esc(claseSPI(s["spi" + e])); }).join("<br>")) + '</div>' +
      (ser.length ? '<div class="gsec">SPI-3 de los últimos ' + ser.length + ' meses</div><div class="gsp2">' + sparkSPI(ser.map(function (v) { return {v: v}; })) + '</div><div class="nota" style="display:flex;justify-content:space-between"><span>' + esc(s.serie_spi3[0][0]) + '</span><span>' + esc(s.serie_spi3[ser.length - 1][0]) + '</span></div>' : '') +
      '<div class="gsec">Cruce con otros fenómenos</div><div class="gpars">' + dato("Focos de calor (3 días)", fmt(nf)) + dato("Propensión a incendios", pr ? esc(pr.r.propension) + ' <small>(pronóstico del ' + fd(pr.d) + (pr.edad > 0 ? ", desactualizado" : "") + ')</small>' : "sin dato") + dato("Población (suma de municipios, est. INE)", pob ? M.fmtP(pob) : "sin dato") + '</div>' +
      '<a class="btn" href="departamento.html?d=' + encodeURIComponent(d) + '">Abrir ficha de ' + esc(d) + ' →</a>' +
      pie('El SPI es una medida de <b>sequía meteorológica</b> (déficit de lluvia respecto de 1991–2020), por departamento: no es una declaratoria ni mide efectos en cultivos, agua o personas. Fuente: ERA5 vía Open-Meteo, método OMM.') + '</div>';
  }
  function fichaAire() {
    var g = AQ.pts[SEL.i], d0 = diaAire(), E = EX, asig = E ? E.mu : [], pobt = asig.reduce(function (a, z) { return a + (z.m.pob || 0); }, 0), q = g.d[d0] || {}, c = claseAQ(q.m);
    var foc = FP.filter(function (p) { return p.f === DIAS[DIAS.length - 1] && M.hav(g.lat, g.lon, p.lat, p.lon) <= 50; }), mw = foc.reduce(function (a, p) { return a + p.frp; }, 0), top = asig.slice().sort(function (a, b) { return (b.m.pob || 0) - (a.m.pob || 0); }).slice(0, 5);
    var barras = '<div class="cbars">' + AQ.dias.map(function (k) { var v = g.d[k] ? g.d[k].m : null, cc = v != null ? claseAQ(v)[1] : "#9aa7ba", e = edadDias(k); return '<div><b>' + (v != null ? fmt(v, 0) : "—") + '</b><i style="height:' + Math.max(3, Math.min(60, (v || 0) / 80 * 60)) + 'px;background:' + cc + ';opacity:' + (k === d0 ? 1 : .6) + '"></i>' + (e === 0 ? "Hoy" : e === 1 ? "Ayer" : e === -1 ? "Mañ." : fd(k)) + '</div>'; }).join("") + '</div>';
    return '<div class="xc gfi"><div class="gfi-h"><div class="gfi-m" style="--c:' + (c ? c[1] : "#9aa7ba") + ';font-size:15px">' + (q.m != null ? fmt(q.m, 0) : "—") + '</div><div><h3>Punto del modelo ' + fmt(g.lat, 1) + '°, ' + fmt(g.lon, 1) + '°</h3><div class="nota">PM2,5 · promedio de 24 h · ' + (edadDias(d0) === 0 ? "hoy" : fd(d0)) + '</div></div></div>' +
      '<div class="gsec">Material particulado estimado</div>' + barras + '<div class="gpars">' + dato("PM2,5 (24 h)", q.m != null ? fmt(q.m, 1) + " µg/m³ <small>(" + fmt(q.m / 15, 1) + " × la guía OMS)</small>" : "sin dato") + dato("PM2,5 máximo horario", q.x != null ? fmt(q.x, 1) + " µg/m³" : "—") + dato("PM10 (24 h)", q.p != null ? fmt(q.p, 1) + " µg/m³" : "—") + dato("Lectura", c ? esc(c[2]) : "—") + '</div>' +
      '<div class="gsec">Población y focos alrededor</div><div class="gpars">' + dato("Municipios asignados a este punto", asig.length) + dato("Población (est. INE)", pobt ? M.fmtP(pobt) : "sin dato") + dato("Focos de calor a ≤ 50 km (" + fd(DIAS[DIAS.length - 1]) + ")", foc.length + (foc.length ? " · " + fmt(mw) + " MW" : "")) + '</div>' +
      (top.length ? '<table class="xt2 gfi-t"><tr><td></td><td style="text-align:right"><b>Hab.</b></td></tr>' + top.map(function (x) { return '<tr><td><a href="municipio.html?d=' + encodeURIComponent(x.m.d) + '&m=' + encodeURIComponent(x.m.n) + '">' + esc(x.m.n) + '</a> <small>(' + esc(x.m.d) + ')</small></td><td style="text-align:right">' + (x.m.pob != null ? M.fmtP(x.m.pob) : "s/d") + '</td></tr>'; }).join("") + '</table>' : "") +
      pie('<b>Estimación del modelo CAMS (Open-Meteo), no medición:</b> la resolución es de decenas de km y se muestra un punto cada ~1°. El humo puede viajar cientos de km, por eso la cercanía de focos no prueba el origen. Guía OMS 2021: PM2,5 de 24 h ≤ 15 µg/m³ (no es un límite de seguridad absoluto). El sistema no tiene estaciones de superficie conectadas.') + '</div>';
  }
  function detalle() {
    var el = $("cDet"); if (!el) return;
    if (st.v === "aire" && AQ.estado !== "ok") { el.innerHTML = '<div class="xc xhint"><h3>Aire y humo</h3>' + (AQ.estado === "error" ? 'No se pudo consultar el modelo (' + esc(AQ.msg) + '). Use «Reintentar» en la tarjeta de aire.' : 'Consultando el modelo de calidad del aire…') + '</div>'; return; }
    if (!SEL) { el.innerHTML = '<div class="xc xhint"><h3>Sin elementos para mostrar</h3>No hay datos con este filtro. Cambie el período, la potencia o el lugar.</div>'; return; }
    el.innerHTML = SEL.t === "dep" ? fichaDep() : SEL.t === "lg" ? LAGOS.ficha(SEL.n, SEL.tipo, dato, pie) : SEL.t === "aq" ? fichaAire() : fichaFuego();
  }

  /* ---------- mapa ---------- */
  function geoFocos() { FL = focos(); return M.fc(FL.map(function (p, i) { return {type: "Feature", geometry: {type: "Point", coordinates: [p.lon, p.lat]}, properties: {i: i, frp: p.frp, a: edadF(p.f), s: SEL && SEL.t === "fo" && SEL.p === p ? 1 : 0}}; })); }
  function geoCx() { return M.fc(st.cx ? cxLugar().map(function (c) { return {type: "Feature", geometry: {type: "Point", coordinates: [c.lon, c.lat]}, properties: {id: c.id, n: c.n, w: c.frp_mw, r: reportes(c).length ? 1 : 0, nr: reportes(c).length, s: SEL && SEL.t === "cx" && SEL.c.id === c.id ? 1 : 0}}; }) : []); }
  function geoSeq() { return M.fc(T.D.geoDep.features.map(function (f) { var s = SQ[f.properties.n] || {}, v = s["spi" + st.spi]; return {type: "Feature", geometry: f.geometry, properties: {n: f.properties.n, v: v == null ? -99 : v, c: colSPI(v)}}; })); }
  function geoAire() { return M.fc(puntosAire().filter(function (p) { return p.v != null; }).map(function (p) { return {type: "Feature", geometry: {type: "Point", coordinates: [p.lon, p.lat]}, properties: {i: p.i, v: p.v, c: claseAQ(p.v)[1], s: SEL && SEL.t === "aq" && SEL.i === p.i ? 1 : 0}}; })); }
  function bajo(m) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark";
    HMAP.bajo(m);
    m.addSource("sq", {type: "geojson", data: geoSeq()});
    m.addLayer({id: "sq-f", type: "fill", source: "sq", layout: {visibility: "none"}, paint: {"fill-color": ["get", "c"], "fill-opacity": .72}});
    m.addLayer({id: "sq-o", type: "line", source: "sq", layout: {visibility: "none"}, filter: ["==", ["get", "n"], ""], paint: {"line-color": osc ? "#ffffff" : "#000000", "line-width": 3.2}});
    m.moveLayer("h-lg-f"); m.moveLayer("h-lg-l");
  }
  function alto(m) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark", ROJO = "#ff4d3d", AMB = "#ffb02e", R1 = ["==", ["get", "r"], 1], R0 = ["==", ["get", "r"], 0];
    LAGOS.alto(m); HMAP.alto(m);
    m.addSource("fo", {type: "geojson", data: geoFocos()}); m.addSource("cx", {type: "geojson", data: geoCx()});
    m.addLayer({id: "fo-h", type: "heatmap", source: "fo", maxzoom: 9, paint: {"heatmap-weight": ["interpolate", ["linear"], ["get", "frp"], 0, .25, 30, 1], "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, .6, 8, 1.6], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 6, 14, 8, 26], "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,235,59,0)", .2, "rgba(255,235,59,.5)", .45, "rgba(255,152,0,.7)", .7, "rgba(244,67,54,.8)", 1, "rgba(183,28,28,.9)"], "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 6.5, .85, 9, 0]}});
    m.addSource("cxh", {type: "geojson", data: geoHull()});
    m.addLayer({id: "cxh-n-f", type: "fill", source: "cxh", filter: R0, paint: {"fill-color": AMB, "fill-opacity": .1}});
    m.addLayer({id: "cxh-n-l", type: "line", source: "cxh", filter: R0, paint: {"line-color": AMB, "line-width": 1.4, "line-dasharray": [3, 2]}});
    m.addLayer({id: "cxh-r-f", type: "fill", source: "cxh", filter: R1, paint: {"fill-color": ROJO, "fill-opacity": .24}});
    m.addLayer({id: "cxh-r-l", type: "line", source: "cxh", filter: R1, paint: {"line-color": ROJO, "line-width": 2.4}});
    m.addLayer({id: "fo", type: "circle", source: "fo", paint: {"circle-radius": M.radioEscala(375, ["+", 1.5, ["*", .55, ["min", 9, ["sqrt", ["max", 0, ["get", "frp"]]]]]]), "circle-color": ["step", ["get", "a"], COLF[0], 1, COLF[1], 2, COLF[2], 3, COLF[3]], "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 0, 7, .8, 13, .62], "circle-stroke-color": ["case", ["==", ["get", "s"], 1], osc ? "#fff" : "#000", "rgba(255,255,255,.7)"], "circle-stroke-width": ["case", ["==", ["get", "s"], 1], 3, .8], "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 0, 7, 1]}});
    m.addSource("aq", {type: "geojson", data: geoAire()});
    m.addLayer({id: "aq-c", type: "circle", source: "aq", layout: {visibility: "none"}, paint: {"circle-radius": ["interpolate", ["exponential", 1.6], ["zoom"], 4, 16, 6, 38, 8, 110, 10, 300], "circle-color": ["get", "c"], "circle-opacity": .5, "circle-blur": .55}});
    m.addLayer({id: "aq-p", type: "circle", source: "aq", layout: {visibility: "none"}, paint: {"circle-radius": ["case", ["==", ["get", "s"], 1], 7, 4], "circle-color": ["get", "c"], "circle-stroke-color": ["case", ["==", ["get", "s"], 1], osc ? "#fff" : "#000", "rgba(255,255,255,.8)"], "circle-stroke-width": ["case", ["==", ["get", "s"], 1], 3, 1]}});
    m.addLayer({id: "fo2", type: "circle", source: "fo", layout: {visibility: "none"}, paint: {"circle-radius": 2.4, "circle-color": "#ff5722", "circle-opacity": .85}});
    var rad = ["interpolate", ["linear"], ["get", "n"], 5, 7, 70, 16], sel = ["case", ["==", ["get", "s"], 1], osc ? "#ffffff" : "#000000"];
    m.addLayer({id: "cx-n", type: "circle", source: "cx", filter: R0, paint: {"circle-radius": rad, "circle-color": "rgba(255,176,46,.10)", "circle-stroke-color": sel.concat([AMB]), "circle-stroke-width": ["case", ["==", ["get", "s"], 1], 3, 1.2], "circle-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 10.5, .2], "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 8, .85, 10.5, .3]}});
    m.addLayer({id: "cx-p", type: "circle", source: "cx", filter: R1, paint: {"circle-radius": 14, "circle-color": "rgba(255,77,61,0)", "circle-stroke-color": ROJO, "circle-stroke-width": 1.6, "circle-stroke-opacity": .6, "circle-opacity": 0}});
    m.addLayer({id: "cx-r", type: "circle", source: "cx", filter: R1, paint: {"circle-radius": ["interpolate", ["linear"], ["get", "n"], 5, 8, 70, 18], "circle-color": "rgba(255,77,61,.30)", "circle-stroke-color": sel.concat([ROJO]), "circle-stroke-width": ["case", ["==", ["get", "s"], 1], 3.4, 2.4], "circle-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 10.5, .25], "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 10.5, .3]}});
    pulsa(m);
  }
  /* pulso de los incendios reportados (se detiene con la pestaña oculta o con «reducir movimiento») */
  var PUL = 0;
  function pulsa(m) {
    var red = false; try { red = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-mov") === "off"; } catch (e) {}
    if (red || PUL) return; var ph = 0, ult = 0;
    function tic(ts) {
      PUL = requestAnimationFrame(tic); if (document.hidden || ts - ult < 60 || !m.getLayer("cx-p") || m.getLayoutProperty("cx-p", "visibility") === "none") return; ult = ts; ph = (ph + .035) % 1;
      m.setPaintProperty("cx-p", "circle-radius", 10 + 20 * ph); m.setPaintProperty("cx-p", "circle-stroke-opacity", .8 * (1 - ph)); m.setPaintProperty("cx-p", "circle-stroke-width", 2.2 - 1.2 * ph);
    }
    PUL = requestAnimationFrame(tic);
  }
  function listo(m) {
    var pop = m._pop, sobreLago = function (e) { return m.getLayoutProperty("h-lg-f", "visibility") !== "none" && m.queryRenderedFeatures(e.point, {layers: ["h-lg-f"]}).length > 0; };
    HMAP.enlaza(m, {tipLago: function (n, t) { return LAGOS.tip(n, t); }, clicLago: function (n, t) { if (st.v !== "sequia") return; SEL = {t: "lg", n: n, tipo: t}; selecciona(true); }, cuencaHover: true});
    ["cx-n", "cx-r"].forEach(function (L) {
      m.on("mousemove", L, function (e) { var p = e.features[0].properties; m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + (+p.r ? 'Incendio reportado' : 'Complejo de focos: solo detección satelital') + ' · ' + p.n + ' focos · ' + fmt(+p.w, 0) + ' MW</b>' + (+p.r ? p.nr + ' reporte(s) de prensa u oficial en el mismo lugar (no es confirmación de una autoridad)' : 'sin reportes en el lugar (puede ser quema agrícola)') + '<br>clic para ver población e infraestructura cercanas</div>').addTo(m); });
      m.on("mouseleave", L, function () { pop.remove(); m.getCanvas().style.cursor = ""; });
      m.on("click", L, function (e) { var id = e.features[0].properties.id, c = CX.filter(function (z) { return z.id === id; })[0]; if (c) { SEL = {t: "cx", c: c}; selecciona(true); } });
    });
    m.on("mousemove", "fo", function (e) { var q = FL[e.features[0].properties.i]; if (!q) return; m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">Foco de calor · ' + fmt(q.frp, 1) + ' MW</b>' + fd(q.f) + ' · ' + esc(q.mun || "") + ', ' + esc(q.dep || "") + '<br><i>detección satelital (VIIRS, ~375 m): calor, no incendio confirmado</i><br>clic para ver qué hay cerca</div>').addTo(m); });
    m.on("mouseleave", "fo", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "fo", function (e) { var q = FL[e.features[0].properties.i]; if (q && !m.queryRenderedFeatures(e.point, {layers: ["cx-n", "cx-r"].filter(function (l) { return m.getLayoutProperty(l, "visibility") !== "none"; })}).length) { SEL = {t: "fo", p: q}; selecciona(true); } });
    m.on("mousemove", "sq-f", function (e) { if (sobreLago(e)) return; var p = e.features[0].properties, s = SQ[p.n] || {}; m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.n) + '</b>SPI-' + st.spi + ': ' + sg(s["spi" + st.spi], 2) + ' · ' + esc(claseSPI(s["spi" + st.spi])) + '<br>clic para ver el detalle</div>').addTo(m); });
    m.on("mouseleave", "sq-f", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "sq-f", function (e) { if (sobreLago(e)) return; SEL = {t: "dep", d: e.features[0].properties.n}; selecciona(true); });
    m.on("mousemove", "aq-p", function (e) { var q = puntosAire()[e.features[0].properties.i]; if (!q) return; var c = claseAQ(q.v); m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">PM2,5 ≈ ' + fmt(q.v, 0) + ' µg/m³</b>' + esc(c[2]) + '<br>estimación del modelo · clic para ver el detalle</div>').addTo(m); });
    m.on("mouseleave", "aq-p", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "aq-p", function (e) { SEL = {t: "aq", i: e.features[0].properties.i}; selecciona(true); });
    LUGAR.ajusta(m, T, LG, false); capasVista(); dibuja();
  }
  function capasVista() {
    if (!map || !map._ok || !PN) return; var v = st.v, on = function (id) { return PN.get(id); }, V = function (ids, x) { ids.forEach(function (i) { M.vis(map, i, x); }); };
    V(["fo-h"], v === "fuego" && on("den")); V(["fo"], v === "fuego" && on("fo")); V(["cxh-n-f", "cxh-n-l", "cx-n"], v === "fuego" && on("cxa")); V(["cxh-r-f", "cxh-r-l", "cx-r", "cx-p"], v === "fuego" && on("inc")); V(["fo2"], v === "aire" && on("fo2"));
    V(["sq-f", "sq-o"], v === "sequia" && on("spi")); V(["aq-c", "aq-p"], v === "aire");
    V(["h-lg-f", "h-lg-l"], v === "sequia" && on("lag")); V(["lg-ag-f", "lg-ag-l", "lg-sel"], v === "sequia" && on("lag"));
    V(["h-cu-f", "h-cu-l"], v === "sequia" && on("cu")); V(["h-rio-c", "h-rio-ab", "h-rio-fl", "h-rio-hit", "h-rio-hitc"], v === "sequia" && on("rio")); V(["h-hv-l", "h-ar-k", "h-ar-l", "h-ar-fl", "h-tr-w", "h-tr-k", "h-tr-l", "h-tr-fl", "h-pt-p", "h-pt-c", "h-pt-i", "h-ca-f", "h-ca-l"], false);
    M.vis(map, "d-l", on("dep")); M.vis(map, "m-l", on("mun"));
    M.vis(map, "ex-f", on("pob")); M.vis(map, "ex-l", on("pob")); M.vis(map, "inf-s", on("sal")); M.vis(map, "inf-e", on("eme"));
  }
  function etiquetas() { }
  function leyenda() {
    if (!PN) return; var g = function (t, b) { return '<div class="glg"><b>' + t + '</b><div>' + b + '</div></div>'; }, h = "", v = st.v, on = function (i) { return PN.get(i); }, ln = function (c, t, k) { return '<span class="glin" style="--c:' + c + '"><i' + (k ? ' class="' + k + '"' : "") + '></i>' + t + '</span>'; };
    if (v === "fuego") {
      h += g("¿Foco de calor o incendio?", '<span class="gic"><i style="background:#ff6d00;border-radius:50%;width:9px;height:9px"></i><b>Foco de calor</b>: el satélite (VIIRS, ~375 m) detectó calor. Puede ser incendio, quema agrícola o industria.</span>' +
        '<span class="gic"><i style="border:2px dashed #ffb02e;background:rgba(255,176,46,.14);width:16px;height:12px;box-sizing:border-box;border-radius:3px"></i><b>Complejo de focos</b>: grupo de focos vecinos de 2 días, sin reporte en el lugar.</span>' +
        '<span class="gic"><i class="gpl" style="border:2px solid #ff4d3d;background:rgba(255,77,61,.3);width:16px;height:12px;box-sizing:border-box;border-radius:3px"></i><b>Incendio reportado</b> (anillo que pulsa): hay nota de prensa u otro reporte en el mismo lugar; no es una confirmación oficial.</span>');
      if (on("fo")) h += g("Antigüedad del foco", COLF.map(function (c, i) { return '<span><i style="background:' + c + ';border-radius:50%;width:11px;height:11px"></i>' + (i === 0 ? "último día" : i === 3 ? "hace 3 días o más" : "hace " + i + (i === 1 ? " día" : " días")) + '</span>'; }).join(" ") + '<small>Al alejar, el tamaño indica la potencia (FRP); al acercar, cada círculo mide ~375 m (un píxel del satélite).</small>');
      if (on("den")) h += g("Densidad de focos", '<span class="grmp" style="background:linear-gradient(90deg,rgba(255,235,59,.1),rgba(255,235,59,.55),rgba(255,152,0,.75),rgba(244,67,54,.85),rgba(183,28,28,.95))"></span><span class="grmpt"><i>pocos</i><i>muchos</i></span>');
      if (EX) h += g("Distancia al punto", '<span><i class="gbn"></i>Bandas de 10, 25 y 50 km</span>');
    } else if (v === "sequia") {
      h += g("SPI-" + st.spi + " (sequía ←→ húmedo)", '<span class="gesc">' + [["#a50f15", "≤ −2"], ["#de2d26", "−2 a −1,5"], ["#fb6a4a", "−1,5 a −1"], ["#b8c4d6", "−1 a 1"], ["#9ecae1", "1 a 1,5"], ["#4292c6", "1,5 a 2"], ["#08519c", "≥ 2"]].map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + x[1] + '</span>'; }).join("") + '</span><small>Déficit de lluvia por departamento (sequía meteorológica); no es una declaratoria.</small>');
      if (on("lag")) h += g("Lagos y salares", LAGOS.leyenda());
      if (on("cu") || on("rio")) h += g("Base hidrográfica", (on("rio") ? ln("#5fd0ff", "Ríos (más grueso = más longitud en Bolivia)") : "") + (on("cu") ? ln("#22b8cf", "Cuenca del Amazonas", "s") + ln("#8b8cff", "Cuenca del Plata", "s") + ln("#e0a85c", "Cuenca endorreica del Altiplano", "s") : ""));
    } else { h += g("PM2,5 (24 h) · modelo", '<span class="gesc">' + AQC.map(function (x) { return '<span><i style="background:' + x[1] + '"></i>' + x[2] + '</span>'; }).join("") + '</span>'); if (EX) h += M.leyendaPob(false); }
    if (on("pob")) h += M.leyendaPob(); if (on("sal") || on("eme")) h += M.legendaInfra();
    $("cL").innerHTML = h;
  }
  function refrescaAire() { if (map && map._ok) map.getSource("aq").setData(geoAire()); }
  function refrescaMapa() {
    if (!map || !map._ok) return; var r = expoSel();
    map.getSource("fo").setData(geoFocos()); map.getSource("cx").setData(geoCx()); map.getSource("cxh").setData(geoHull()); map.getSource("sq").setData(geoSeq()); refrescaAire(); LAGOS.refresca(map); LAGOS.elige(map, SEL && SEL.t === "lg" ? (LAGOS.reg(SEL.n) || {}).id || "" : "");
    map.setFilter("sq-o", ["==", ["get", "n"], st.v === "sequia" && SEL && SEL.t === "dep" ? SEL.d : ""]);
    M.selec(map, st.v === "sequia" ? null : EX, r); capasVista(); leyenda();
  }
  function volar() {
    if (!map || !map._ok || !SEL) return;
    if (EX) { var km = EX.aq ? 90 : 55, dl = km / 111.32, dn = dl / Math.cos(EX.lat * Math.PI / 180); map.fitBounds([[EX.lon - dn, EX.lat - dl], [EX.lon + dn, EX.lat + dl]], {duration: 600, padding: 24, maxZoom: 10}); }
    else if (SEL.t === "lg") { var lf = HMAP.lago(SEL.n); if (lf) { var bq = HMAP.bbox(lf.geometry); map.fitBounds([[bq[0], bq[1]], [bq[2], bq[3]]], {duration: 600, padding: 60, maxZoom: 10}); } }
    else if (SEL.t === "dep") { var ms = T.DEP[SEL.d] || [], b = ms.reduce(function (o, m) { return o ? [Math.min(o[0], m.bb[0]), Math.min(o[1], m.bb[1]), Math.max(o[2], m.bb[2]), Math.max(o[3], m.bb[3])] : m.bb.slice(); }, null); if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {duration: 600, padding: 30}); }
  }
  function selecciona(vuela) { expoSel(); refrescaMapa(); detalle(); if (vuela) volar(); }

  /* ---------- gráficos y tablas ---------- */
  function seriesFocos() {
    var f = DET && DET.dias ? Object.keys(DET.dias).sort() : [], by = {}; FP.filter(enLugar).forEach(function (p) { by[p.f] = (by[p.f] || 0) + p.frp; });
    var n = f.map(function (d) { var o = DET.dias[d] || {}; return LG.d ? (o[LG.d] || 0) : Object.keys(o).reduce(function (a, k) { return a + o[k]; }, 0); });
    if (LG.m || !f.length) { f = DIAS.slice(); n = porDia(FP.filter(enLugar), function () { return 1; }); }
    return {f: f, n: n, w: f.map(function (d) { return by[d] != null ? +by[d].toFixed(0) : null; })};
  }
  function graficos() {
    var s = seriesFocos(), tx = X.css("--mut") || "#888";
    X.chart("cG1", {tooltip: {trigger: "axis"}, legend: {top: 0, textStyle: {color: tx}, data: ["Focos", "Potencia (MW)"]}, grid: {left: 48, right: 56, top: 30, bottom: 26}, xAxis: {type: "category", data: s.f.map(fd), axisLabel: {color: tx, fontSize: 10, interval: Math.ceil(s.f.length / 7) - 1}}, yAxis: [{type: "value", axisLabel: {color: tx, formatter: function (v) { return M.fmt(v); }}, splitLine: {lineStyle: {opacity: .25}}}, {type: "value", axisLabel: {color: "#b266d6", formatter: function (v) { return M.fmt(v); }}, splitLine: {show: false}}], series: [{name: "Focos", type: "bar", data: s.n, itemStyle: {color: "#ef6c00", borderRadius: [3, 3, 0, 0]}}, {name: "Potencia (MW)", type: "line", yAxisIndex: 1, data: s.w, connectNulls: false, smooth: .3, symbol: "circle", symbolSize: 5, lineStyle: {color: "#7b1fa2", width: 2}, itemStyle: {color: "#7b1fa2"}}]});
    $("cG1n").textContent = (LG.m ? "Últimos " + DIAS.length + " días (detalle municipal)." : "Barras: focos por día desde " + fd(s.f[0]) + " (conteo diario del sistema). Línea: potencia radiativa; solo hay puntos de los últimos " + DIAS.length + " días.") + " Una caída súbita puede deberse a nubes, no a menos fuego.";
    var deps = Object.keys(T.DEP).sort(), dd = DET && DET.dias ? Object.keys(DET.dias).sort() : [], dat = [], mx = 1;
    dd.forEach(function (d, x) { deps.forEach(function (p, y) { var v = (DET.dias[d] || {})[p] || 0; mx = Math.max(mx, v); dat.push([x, y, v]); }); });
    X.chart("cG2", {tooltip: {formatter: function (p) { return esc(deps[p.value[1]]) + " · " + fd(dd[p.value[0]]) + ": <b>" + p.value[2] + "</b> focos"; }}, grid: {left: 76, right: 12, top: 8, bottom: 52}, xAxis: {type: "category", data: dd.map(fd), axisLabel: {color: tx, fontSize: 10, interval: Math.ceil(dd.length / 6) - 1}, splitArea: {show: false}}, yAxis: {type: "category", data: deps, inverse: true, axisLabel: {color: tx, fontSize: 11}}, visualMap: {min: 0, max: mx, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 110, text: [M.fmt(mx) + " focos", "0"], calculable: false, textStyle: {color: tx, fontSize: 10}, inRange: {color: ["#fff3cd", "#ffb300", "#ef6c00", "#b71c1c", "#4a0000"]}}, series: [{type: "heatmap", data: dat, itemStyle: {borderColor: "rgba(0,0,0,.25)", borderWidth: 1, borderRadius: 2}}]});
    $("cG2n").textContent = "Cada celda es el número de focos del departamento ese día; sirve para ver cuándo y dónde se concentra el fuego.";
    var ds = Object.keys(SQ).sort(), dat3 = []; ds.forEach(function (d, y) { ESC.forEach(function (e, x) { var v = SQ[d]["spi" + e]; if (v != null) dat3.push({value: [x, y, v], itemStyle: {color: colSPI(v)}, label: {show: true, formatter: sg(v, 1), color: "#fff", fontSize: 11, fontWeight: 700}}); }); });
    X.chart("cG3", {tooltip: {formatter: function (p) { var v = p.value[2]; return esc(ds[p.value[1]]) + " · SPI-" + ESC[p.value[0]] + ": <b>" + sg(v, 2) + "</b> (" + esc(claseSPI(v)) + ")"; }}, grid: {left: 76, right: 10, top: 24, bottom: 8}, xAxis: {type: "category", position: "top", data: ESC.map(function (e) { return "SPI-" + e; }), axisLabel: {color: tx}, splitLine: {show: false}, axisTick: {show: false}}, yAxis: {type: "category", data: ds, inverse: true, axisLabel: {color: tx, fontSize: 11}}, series: [{type: "heatmap", data: dat3, itemStyle: {borderColor: "rgba(0,0,0,.3)", borderWidth: 2, borderRadius: 3}}]});
    var c3 = X.chart && echarts.getInstanceByDom($("cG3")); if (c3) { c3.off("click"); c3.on("click", function (p) { if (p.value) { st.spi = ESC[p.value[0]]; st.v = "sequia"; SEL = {t: "dep", d: ds[p.value[1]]}; vista("sequia", true); } }); }
    $("cG3n").textContent = "Cada fila es un departamento y cada columna una escala de meses. Toque una celda para abrirla en el mapa de sequía. Hasta " + (D.sequia && D.sequia.ultimo_mes || "—") + ".";
  }
  function tablas() {
    var L = cxLugar();
    $("cTc").innerHTML = '<p class="nota">Grupos de focos vecinos del <b>' + fd(CXD) + '</b>. Toque una fila para verla en el mapa.</p>' + (L.length ? '<table class="xt2"><tr><th align="left">Municipio</th><th align="left">Departamento</th><th align="right">Focos</th><th align="right">MW</th></tr>' + L.slice(0, 30).map(function (c) { return '<tr data-c="' + esc(c.id) + '"><td>' + esc((c.municipios || [c.municipio]).join(", ")) + '</td><td>' + esc(c.departamento) + '</td><td align="right">' + c.n + '</td><td align="right">' + fmt(c.frp_mw, 0) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin complejos en este lugar.</p>');
    [].forEach.call(document.querySelectorAll("#cTc tr[data-c]"), function (r) { r.onclick = function () { var c = CX.filter(function (z) { return z.id === r.dataset.c; })[0]; if (c) { st.v = "fuego"; SEL = {t: "cx", c: c}; vista("fuego", true); window.scrollTo({top: $("cMap").getBoundingClientRect().top + scrollY - 150, behavior: "smooth"}); } }; });
    var cnt = {}; focos().forEach(function (p) { var k = p.mun + "|" + p.dep; var o = cnt[k] || (cnt[k] = {n: 0, w: 0, m: p.mun, d: p.dep}); o.n++; o.w += p.frp; });
    var K = Object.keys(cnt).map(function (k) { return cnt[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 20);
    $("cTm").innerHTML = '<p class="nota">Detecciones del período elegido (' + st.dias + (st.dias === 1 ? " día" : " días") + '). Incluyen quemas agrícolas.</p>' + (K.length ? '<table class="xt2"><tr><th align="left">Municipio</th><th align="left">Departamento</th><th align="right">Focos</th><th align="right">MW</th></tr>' + K.map(function (o) { return '<tr><td><a href="municipio.html?d=' + encodeURIComponent(o.d) + '&m=' + encodeURIComponent(o.m) + '">' + esc(o.m) + '</a></td><td>' + esc(o.d) + '</td><td align="right">' + o.n + '</td><td align="right">' + fmt(o.w, 0) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin focos en este lugar.</p>');
    var ds = depsAlcance();
    $("cTs").innerHTML = '<p class="nota">SPI por escala (departamento), hasta ' + esc(D.sequia && D.sequia.ultimo_mes || "—") + '. Referencia 1991–2020. Toque una fila para abrirla en el mapa.</p><table class="xt2"><tr><th align="left">Departamento</th>' + ESC.map(function (e) { return '<th>SPI-' + e + '</th>'; }).join("") + '<th>Lluvia del mes</th></tr>' + ds.map(function (d) { var s = SQ[d]; return '<tr data-d="' + esc(d) + '"><td>' + esc(d) + '</td>' + ESC.map(function (e) { return '<td style="text-align:center"><span class="cspi" style="background:' + colSPI(s["spi" + e]) + '">' + sg(s["spi" + e], 2) + '</span></td>'; }).join("") + '<td style="text-align:center">' + (s.pct_normal != null ? fmt(s.pct_normal, 0) + ' % de lo normal' : '—') + '</td></tr>'; }).join("") + '</table>';
    [].forEach.call(document.querySelectorAll("#cTs tr[data-d]"), function (r) { r.onclick = function () { SEL = {t: "dep", d: r.dataset.d}; vista("sequia", true); window.scrollTo({top: $("cMap").getBoundingClientRect().top + scrollY - 150, behavior: "smooth"}); }; });
    var d14 = Date.now() - 14 * 864e5, E = (D.ev || []).filter(function (e) { return e.categoria === "climatológica" && e.origen === "prensa" && (e.ts || 0) >= d14 && LUGAR.ev(T, LG, e); }).sort(function (a, b) { return b.ts - a.ts; });
    $("cTp").innerHTML = '<p class="nota">Notas de prensa de los últimos 14 días clasificadas como climatológicas (incendios, sequía, humo). Sirven para corroborar, no para medir.</p>' + (E.length ? '<table class="xt2">' + E.slice(0, 40).map(function (e) { return '<tr><td style="white-space:nowrap">' + new Date(e.ts).toLocaleDateString("es-BO", {day: "numeric", month: "short", timeZone: "America/La_Paz"}) + '</td><td>' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.titulo) + '</a>' : esc(e.titulo)) + '</td><td class="nota">' + esc(e.fuente || "") + '</td><td class="nota">' + esc((e.departamentos || []).join(", ") || "sin lugar") + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin notas en este lugar.</p>');
  }

  /* ---------- orquestación ---------- */
  function vista(v, vuela) {
    if (!vuela) SEL = null; st.v = v;
    [].forEach.call(document.querySelectorAll(".cvw button"), function (b) { b.classList.toggle("on", b.dataset.v === v); });
    if (v === "aire" && AQ.estado === "idle") cargarAire();
    if (PN) PN.vista(v);
    if (!vuela && map && map._ok) LUGAR.ajusta(map, T, LG);
    dibuja(); if (vuela) volar();
  }
  function ayuda() {
    var v = st.v, L = focos(), cl = cxLugar(), h;
    if (v === "fuego") h = '<b>' + fmt(L.length) + ' focos</b> en ' + esc(LUGAR.etiqueta(LG)) + ' · últimos ' + st.dias + (st.dias === 1 ? " día" : " días") + (st.frp ? ' · ≥ ' + st.frp + ' MW' : '') + ' · ' + cl.length + ' complejo(s) <span class="nota">— Toque un complejo o un foco para ver población e infraestructura cercanas.</span>';
    else if (v === "sequia") h = '<b>SPI-' + st.spi + '</b> por departamento · lluvia de ' + st.spi + (st.spi === 1 ? " mes" : " meses") + ' frente a 1991–2020 <span class="nota">— Toque un departamento para ver su detalle y el cruce con fuego.</span>';
    else h = '<b>PM2,5 estimado</b> (modelo CAMS) · ' + (AQ.estado === "ok" ? (edadDias(diaAire()) === 0 ? "hoy" : fd(diaAire())) : AQ.estado === "error" ? "sin conexión con el modelo" : "consultando…") + ' <span class="nota">— Toque un punto para ver población asignada y focos cercanos.</span>';
    $("cH").innerHTML = h;
  }
  function dibuja() {
    if (st.v === "aire" && AQ.estado === "ok" && !AQ.asig) asignarAire();
    autoSel(); expoSel(); ayuda(); controles(); pulso(); refrescaMapa(); detalle(); graficos(); tablas(); avisoAire();
  }
  function iniciar() {
    TERR.cargar().then(function (t) {
      T = t; A = TERR.api; D = T.D; A.estilos(); X.header("modulo.html"); document.title = "Climatológica — Sala de Situación Bolivia"; M.iniciar(T); M.malla(function () { if (map && map._ok) { if (SEL) selecciona(false); else leyenda(); } }); prep();
      $("app").innerHTML = html(); if (window.EVI) EVI.panel("eviP", "climatológica", D);
      LUGAR.init(T, $("lgBox"), LG, function () { SEL = null; dibuja(); LUGAR.ajusta(map, T, LG); if (LG.m && window.CLIMA) CLIMA.irMun(LG.m + " (" + LG.d + ")"); });
      [].forEach.call(document.querySelectorAll(".cvw button"), function (b) { b.onclick = function () { vista(b.dataset.v, false); }; });
      [].forEach.call(document.querySelectorAll(".xtabs button"), function (b) { b.onclick = function () { [].forEach.call(document.querySelectorAll(".xtabs button"), function (z) { z.classList.toggle("on", z === b); $(z.dataset.s).style.display = z === b ? "" : "none"; }); }; });
      [].forEach.call(document.querySelectorAll(".cvw button"), function (b) { b.classList.toggle("on", b.dataset.v === st.v); });
      pulso(); if (window.CLIMA) CLIMA.iniciar("clima", cfgMon());
      cargarAire();
      HMAP.carga(function () { LAGOS.cargar(function () {
        map = M.crear({id: "cMap", av: "cAv", tool: "#cTool", bajo: bajo, alto: alto, listo: listo, refInfra: "del punto", evitar: ["fo", "fo2", "cx-n", "cx-r", "aq-p"].concat(HMAP.CAPAS_HIT, ["h-lg-f"])});
        PN = M.panelCapas($("cCapas"), GRUPOS, function () { capasVista(); leyenda(); }, {vista: st.v});
        pulso();
      }); });
    });
  }
  return {iniciar: iniciar};
})();

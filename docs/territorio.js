/* Arquitectura territorial: Bolivia › Departamento › Municipio.
   Cada nivel muestra SOLO la información de su propio nivel; la comparación con el nivel superior queda aparte y plegada. */
var TERR = (function () {
  var S = SALA, X = S2, ANIO = Math.min(2034, new Date().getFullYear()), HOY = S.diaKey(Date.now()), DIA = 864e5;
  var COL = {salud: "#2e7d32", bomberos: "#c62828", rescate: "#ef6c00", "policía": "#1565c0"};
  var SD = '<span class="sd">sin dato</span>', C = {}, TP = null;
  var SPICOL = ["#c0392b", -2, "#ef8a3b", -1.5, "#f7c873", -1, "#eef1f5", 1, "#8fc0e8", 1.5, "#3b82c4", 2, "#1d4e9c"];
  function jget(u) { return C[u] || (C[u] = fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })); }
  function fmt(n, d) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("es-BO", {maximumFractionDigits: d || 0}); }
  function hav(a, b, c, d) { var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, q = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 12742 * Math.asin(Math.sqrt(q)); }
  function polys(g) { return g.type === "Polygon" ? [g.coordinates] : g.coordinates; }
  function bbox(g) { var b = [180, 90, -180, -90]; polys(g).forEach(function (p) { p[0].forEach(function (c) { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; }); }); return b; }
  function area(g) { var t = 0; polys(g).forEach(function (p) { p.forEach(function (r, i) { var k = 111.32 * Math.cos(r[0][1] * Math.PI / 180), q = 0; for (var j = 0; j < r.length - 1; j++) q += (r[j][0] * k) * (r[j + 1][1] * 110.57) - (r[j + 1][0] * k) * (r[j][1] * 110.57); t += (i ? -1 : 1) * Math.abs(q) / 2; }); }); return t; }
  function dentro(g, lat, lon) { return polys(g).some(function (p) { var r = p[0], ins = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { if (((r[i][1] > lat) !== (r[j][1] > lat)) && (lon < (r[j][0] - r[i][0]) * (lat - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0])) ins = !ins; } return ins; }); }
  function pad(b, k) { return [b[0] - k, b[1] - k, b[2] + k, b[3] + k]; }
  function unir(L) { var b = [180, 90, -180, -90]; L.forEach(function (x) { b = [Math.min(b[0], x.bb[0]), Math.min(b[1], x.bb[1]), Math.max(b[2], x.bb[2]), Math.max(b[3], x.bb[3])]; }); return b; }
  function nivN(t) { t = (t || "").toUpperCase(); return t === "ROJO" || t === "ROJA" ? 3 : t === "NARANJA" ? 2 : t.indexOf("AMARIL") === 0 ? 1 : t === "VERDE" ? 0 : -1; }

  /* ---------- datos (se cargan una sola vez) ---------- */
  function cargar() {
    return TP || (TP = Promise.all([X.datos(), jget("poblacion_mun.json"), jget("establecimientos_salud.json"), jget("servicios_emergencia.json"), jget("desastres_historicos.json"), jget("indicadores_dep.json"), jget("parque_mun.json"), jget("educ_mun.json"), jget("nbi_mun.json"), jget("linea_base_snis.json")]).then(function (r) {
      var D = r[0], T = {D: D, pob: r[1], est: (r[2] || {}).puntos || [], emer: (r[3] || {}).puntos || [], dh: r[4], ind: r[5], pa: r[6], ed: r[7], nb: r[8], snis: r[9], M: {}, DEP: {}, lista: []};
      T.avisos = ((D.senamhi_alertas && D.senamhi_alertas.alertas) || []).filter(function (a) { return (a.fin || "9999") >= HOY; });
      T.sq = (D.sequia && D.sequia.departamentos) || {};
      T.focos = (D.focos_puntos && D.focos_puntos.puntos) || []; T.dias = (D.focos_puntos && D.focos_puntos.dias) || [];
      ((D.geoMun || {}).features || []).forEach(function (f) { var k = f.properties.d + "|" + f.properties.n, p = T.pob && T.pob.municipios[k], m = {k: k, d: f.properties.d, n: f.properties.n, f: f, bb: bbox(f.geometry), km2: area(f.geometry), pob: p ? p.est[ANIO] : null, est: [], bom: [], pol: [], res: [], foc: 0}; T.M[k] = m; T.lista.push(m); (T.DEP[m.d] = T.DEP[m.d] || []).push(m); });
      function donde(lat, lon) { for (var i = 0; i < T.lista.length; i++) { var m = T.lista[i]; if (lon >= m.bb[0] && lon <= m.bb[2] && lat >= m.bb[1] && lat <= m.bb[3] && dentro(m.f.geometry, lat, lon)) return m; } return null; }
      T.donde = donde;
      T.est.forEach(function (p) { var m = donde(p[0], p[1]); if (m) m.est.push(p); });
      T.emer.forEach(function (p) { var m = donde(p[0], p[1]); if (m) (p[3] === "bomberos" ? m.bom : p[3] === "rescate" ? m.res : m.pol).push(p); });
      T.focos.forEach(function (p) { var m = donde(p[0], p[1]); if (m) m.foc++; });
      T.lista.forEach(function (m) { var A = T.avisos.filter(function (a) { return (a.municipios || []).indexOf(m.n + " (" + m.d + ")") >= 0; }); m.av = A.length ? Math.max.apply(0, A.map(function (a) { return nivN(a.nivel); })) : -1; });
      return T;
    }));
  }
  function densidad(m) { return m.pob != null && m.km2 ? m.pob / m.km2 : null; }
  function popDep(T, d) { var p = T.pob && T.pob.departamentos[d]; return p ? p[ANIO] : null; }
  function popPais(T) { var p = T.pob && T.pob.departamentos.Bolivia; return p ? p[ANIO] : null; }
  function cercano(lista, lat, lon, filtro) { var b = null; lista.forEach(function (p) { if (filtro && !filtro(p)) return; var d = hav(lat, lon, p[0], p[1]); if (!b || d < b.km) b = {km: d, p: p}; }); return b; }
  function esHosp(p) { return /hospital/i.test(p[2]); }
  function centroM(m) { return [(m.bb[1] + m.bb[3]) / 2, (m.bb[0] + m.bb[2]) / 2]; }
  function antM(T, k) { var R = (T.dh && T.dh.municipios[k]) || []; var o = {n: R.length, m: 0, a: 0, tipos: {}}; R.forEach(function (r) { o.m += r[3]; o.a += r[5]; o.tipos[r[2]] = (o.tipos[r[2]] || 0) + 1; }); return o; }
  function antD(T, d) { var E = (T.dh && T.dh.departamentos[d]) || {}, o = {n: 0, m: 0, a: 0, tipos: {}}; Object.keys(E).forEach(function (t) { o.n += E[t][0]; o.m += E[t][1]; o.a += E[t][2]; o.tipos[t] = E[t][0]; }); return o; }
  function antP(T) { var o = {n: 0, m: 0, a: 0, tipos: {}}; Object.keys((T.dh && T.dh.departamentos) || {}).forEach(function (d) { var x = antD(T, d); o.n += x.n; o.m += x.m; o.a += x.a; }); return o; }
  function topTipos(o, n) { return Object.keys(o.tipos).sort(function (a, b) { return o.tipos[b] - o.tipos[a]; }).slice(0, n || 5); }
  function pertenece(D, e, d, n) { var f = ((D.geoMun || {}).features || []).filter(function (z) { return z.properties.d === d && z.properties.n === n; })[0]; if (e.departamentos && e.departamentos.length && e.departamentos.indexOf(d) < 0) return false; if (e.lat != null && e.lon != null && f) return dentro(f.geometry, +e.lat, +e.lon); return String(e.lugar || "").toLowerCase().indexOf(n.toLowerCase()) >= 0; }
  function eventosT(T, d, m) { return T.D.ev.filter(function (e) { if (e.origen === "modelo") return false; return m ? pertenece(T.D, e, d, m.n) : (e.departamentos || []).indexOf(d) >= 0; }).sort(function (a, b) { return b.ts - a.ts; }); }
  function avisosT(T, d, m) { return T.avisos.filter(function (a) { return m ? (a.municipios || []).indexOf(m.n + " (" + d + ")") >= 0 : (a.departamentos || []).indexOf(d) >= 0; }); }
  function paM(T, k) { var v = T.pa && T.pa.municipios[k]; return v ? v[v.length - 1] : null; }
  function paDep(T, d) { var v = T.ind && T.ind.parque_automotor.datos[d]; return v ? v[v.length - 1] : null; }

  /* ---------- indicadores de condiciones de vida ---------- */
  var NBI = [["nbi24", "Pobreza por NBI, % de población", "nbi12"], ["ext24", "Pobreza extrema (indigente + marginal), %", "ext12"], ["agua24", "Servicios de agua y saneamiento inadecuados, %", "agua12"], ["ener24", "Insumos energéticos inadecuados, %", "ener12"], ["esp24", "Espacios insuficientes en la vivienda, %", null], ["sal24", "Inadecuada atención en salud, %", null]];
  var EDI = [["alf24", "Alfabetismo, 15+ años (%)", "alf12"], ["est24", "Años promedio de estudio, 19+", "est12"], ["asis24", "Asistencia escolar, 4–17 años (%)", "asis12"], ["ning24", "Sin instrucción, 19+ años (%)", null]];
  function v1(x, k) { return x && x[k] != null ? fmt(x[k], 1) : SD; }
  /* filas solo del propio nivel: indicador | 2024 | 2012 */
  function filasPropias(x, L) { return L.map(function (e) { return [e[1], v1(x, e[0]), e[2] ? v1(x, e[2]) : '<span class="nota">—</span>']; }); }
  /* filas para la comparación plegada: propio | nivel superior | Bolivia */
  function filasComp(x, sup, pais, L) { return L.map(function (e) { return [e[1], v1(x, e[0]), v1(sup, e[0]), v1(pais, e[0])]; }); }

  /* ---------- piezas HTML ---------- */
  function kpis(a) { return '<div class="xm-k tk">' + a.map(function (x) { return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join("") + '</div>'; }
  function tabla(cab, filas, cls) { return '<div class="xm-l"><table class="tt ' + (cls || "") + '"><tr>' + cab.map(function (c, i) { return '<th' + (i ? ' style="text-align:right"' : "") + '>' + c + '</th>'; }).join("") + '</tr>' + filas.map(function (f) { return '<tr>' + f.map(function (c, i) { return '<td' + (i ? ' style="text-align:right"' : "") + '>' + c + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></div>'; }
  function barras(id, o) { var k = topTipos(o, 8).reverse(); if (!k.length) { document.getElementById(id).innerHTML = '<p class="nota">Sin antecedentes registrados.</p>'; return; } X.chart(id, {grid: {left: 120, right: 20, top: 6, bottom: 20}, xAxis: {type: "value"}, yAxis: {type: "category", data: k}, series: [{type: "bar", data: k.map(function (t) { return o.tipos[t]; }), itemStyle: {color: "#1d6fb8"}}], tooltip: {trigger: "axis"}}, 220); }
  function listaEv(L, n) { if (!L.length) return '<p class="nota">Sin eventos registrados por el sistema en este territorio (el historial propio empieza el 22 de octubre de 2026).</p>'; return L.slice(0, n || 8).map(function (e) { return '<a class="alert" href="evento.html?id=' + encodeURIComponent(e.id) + '" style="--c:' + (S.COLCAT[e.categoria] || "#888") + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc((e.titulo || "").slice(0, 120)) + '</div><div class="m">' + S.fecha(e.ts, true) + ' · ' + S.esc(e.categoria) + '</div></div></a>'; }).join("") + (L.length > (n || 8) ? '<p class="nota">+ ' + (L.length - (n || 8)) + ' evento(s) más en el reporte.</p>' : ""); }
  function listaAv(L) { if (!L.length) return '<p class="nota">Sin avisos vigentes del SENAMHI en este territorio.</p>'; return L.map(function (a) { var n = nivN(a.nivel); return '<a class="alert" href="' + S.esc(a.pdf || "#") + '" target="_blank" rel="noopener" style="--c:' + ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"][Math.max(0, n)] + ';color:inherit;text-decoration:none"><div style="flex:1"><div class="t">' + S.esc(a.titulo) + '</div><div class="m">Nivel ' + S.esc((a.nivel || "").toLowerCase()) + ' · vigente hasta ' + S.esc(a.fin || "") + ' · SENAMHI</div></div></a>'; }).join(""); }

  /* ---------- barra de navegación territorial (reemplaza el menú nacional) ---------- */
  function barra(T, d, m) {
    X.header("mapa.html");
    var deps = Object.keys(T.DEP).sort(), h = '<nav class="tnav" aria-label="Navegación territorial"><a href="index.html">Tablero</a><span class="tsep">›</span>' + (d ? '<a href="mapa.html">Bolivia</a><span class="tsep">›</span>' : '<b>Bolivia</b>');
    if (d) h += (m ? '<a href="departamento.html?d=' + encodeURIComponent(d) + '">' + S.esc(d) + '</a>' : '<b>' + S.esc(d) + '</b>');
    if (m) h += '<span class="tsep">›</span><b>' + S.esc(m.n) + '</b>';
    h += '<span class="sp"></span><label>Departamento <select id="nvDep"><option value="">Elegir…</option>' + deps.map(function (x) { return '<option' + (x === d ? " selected" : "") + '>' + x + '</option>'; }).join("") + '</select></label>';
    if (d && T.DEP[d]) h += '<label>Municipio <select id="nvMun"><option value="">' + (m ? "Elegir…" : "Todo el departamento") + '</option>' + T.DEP[d].slice().sort(function (a, b) { return a.n.localeCompare(b.n, "es"); }).map(function (x) { return '<option' + (m && x.n === m.n ? " selected" : "") + '>' + S.esc(x.n) + '</option>'; }).join("") + '</select></label>';
    h += '</nav>';
    var a = document.getElementById("app"); a.insertAdjacentHTML("afterbegin", h);
    document.getElementById("nvDep").onchange = function () { location.href = this.value ? "departamento.html?d=" + encodeURIComponent(this.value) : "departamento.html"; };
    var nm = document.getElementById("nvMun"); if (nm) nm.onchange = function () { location.href = this.value ? "municipio.html?d=" + encodeURIComponent(d) + "&m=" + encodeURIComponent(this.value) : "departamento.html?d=" + encodeURIComponent(d); };
  }

  /* ---------- reportes: solo del territorio abierto ---------- */
  function bloqueReporte(d, m) {
    var nom = m ? m.n + " (" + d + ")" : d;
    return '<div class="card noimp"><h2>Reporte de ' + S.esc(nom) + '</h2><div class="cap">PDF solo de este territorio: contexto, mapa de servicios, situación actual y antecedentes. Elija el período y si desea todos los eventos o un solo tipo.</div><div class="mb-g"><label class="nota">Período <select id="rpPer"><option value="7">7 días</option><option value="30" selected>30 días</option><option value="90">90 días</option><option value="365">12 meses</option><option value="400">Todo el historial</option></select></label><label class="nota">Tipo <select id="rpCat"><option value="">Todos los eventos</option>' + S.CAT.slice(0, 7).map(function (c) { return '<option>' + c + '</option>'; }).join("") + '</select></label><a class="btn p" id="rpGo" href="#">Generar reporte (PDF)</a></div></div>';
  }
  function ligarReporte(d, mn) {
    var a = document.getElementById("rpGo"); if (!a) return;
    function u() { var c = document.getElementById("rpCat").value; a.href = "reporte.html?dep=" + encodeURIComponent(d) + (mn ? "&mun=" + encodeURIComponent(mn) : "") + "&per=" + document.getElementById("rpPer").value + (c ? "&cat=" + encodeURIComponent(c) : ""); }
    document.getElementById("rpPer").onchange = u; document.getElementById("rpCat").onchange = u; u();
  }


  /* ---------- iconos por naturaleza del punto (dibujados en canvas) ---------- */
  var ICO = {};
  function dibuja(tipo) {
    if (ICO[tipo]) return ICO[tipo];
    var c = document.createElement("canvas"); c.width = c.height = 64; var g = c.getContext("2d"); g.lineCap = "round"; g.lineJoin = "round";
    function disco(col) { g.beginPath(); g.arc(32, 32, 28, 0, 6.2832); g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke(); }
    function llama(x, y, s, col) { g.save(); g.translate(x, y); g.scale(s, s); g.beginPath(); g.moveTo(0, -20); g.bezierCurveTo(12, -8, 16, 0, 14, 8); g.bezierCurveTo(12, 18, 4, 22, 0, 22); g.bezierCurveTo(-6, 22, -14, 18, -14, 8); g.bezierCurveTo(-14, 2, -10, -2, -6, -6); g.bezierCurveTo(-5, 0, -2, 2, 0, 2); g.bezierCurveTo(2, -6, 0, -14, 0, -20); g.closePath(); g.fillStyle = col; g.fill(); g.restore(); }
    if (tipo === "salud") { disco("#2e7d32"); g.fillStyle = "#fff"; g.fillRect(27, 15, 10, 34); g.fillRect(15, 27, 34, 10); }
    else if (tipo === "policía") { g.beginPath(); g.moveTo(32, 4); g.lineTo(56, 13); g.lineTo(56, 32); g.quadraticCurveTo(56, 53, 32, 61); g.quadraticCurveTo(8, 53, 8, 32); g.lineTo(8, 13); g.closePath(); g.fillStyle = "#1565c0"; g.fill(); g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke(); g.beginPath(); for (var i = 0; i < 10; i++) { var r = i % 2 ? 6 : 15, a = -1.5708 + i * 0.6283; g.lineTo(32 + r * Math.cos(a), 33 + r * Math.sin(a)); } g.closePath(); g.fillStyle = "#fff"; g.fill(); }
    else if (tipo === "bomberos") { disco("#c62828"); llama(32, 33, 1, "#fff"); }
    else if (tipo === "rescate") { disco("#ef6c00"); g.strokeStyle = "#fff"; g.lineWidth = 10; g.beginPath(); g.arc(32, 32, 14, 0, 6.2832); g.stroke(); g.strokeStyle = "#ef6c00"; g.lineWidth = 12; [0.785, 2.356, 3.927, 5.498].forEach(function (a) { g.beginPath(); g.moveTo(32 + 8 * Math.cos(a), 32 + 8 * Math.sin(a)); g.lineTo(32 + 20 * Math.cos(a), 32 + 20 * Math.sin(a)); g.stroke(); }); }
    else if (tipo.indexOf("rio") === 0) { disco(["#2a9d8f", "#f5b700", "#f26a1b", "#d7263d"][+tipo.slice(3)] || "#2a9d8f"); g.strokeStyle = "#fff"; g.lineWidth = 5; [24, 38].forEach(function (y) { g.beginPath(); for (var x = 14; x <= 50; x += 2) { var yy = y + 4 * Math.sin((x - 14) / 36 * 6.2832 * 1.5); x === 14 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); }); }
    else if (tipo === "complejo") { llama(32, 34, 1.25, "#fff"); llama(32, 34, 1.05, "#e53935"); llama(32, 40, .55, "#ffca28"); }
    return (ICO[tipo] = {url: c.toDataURL(), data: g.getImageData(0, 0, 64, 64).data});
  }
  function ico(tipo, px) { return '<img src="' + dibuja(tipo).url + '" width="' + (px || 16) + '" height="' + (px || 16) + '" alt="" style="vertical-align:middle">'; }

  /* ---------- indicadores de riesgo del municipio (método tipo INFORM, relativo a los 339 municipios) ---------- */
  function cenPoly(g) { var pol = g.type === "Polygon" ? [g.coordinates] : g.coordinates, best = null, ba = -1; pol.forEach(function (p) { var r = p[0], a = 0, cx = 0, cy = 0; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; } var aa = Math.abs(a / 2); if (aa > ba && a) { ba = aa; best = [cx / (3 * a), cy / (3 * a)]; } }); if (!best) { var c0 = pol[0][0][0]; best = [c0[0], c0[1]]; } return best; }
  function percentiles(vals) { var s = vals.filter(function (v) { return v != null && !isNaN(v); }).slice().sort(function (a, b) { return a - b; }); return function (v) { if (v == null || isNaN(v) || !s.length) return null; var lo = 0, hi = s.length; while (lo < hi) { var md = (lo + hi) >> 1; if (s[md] < v) lo = md + 1; else hi = md; } var a = lo; lo = a; hi = s.length; while (lo < hi) { var m2 = (lo + hi) >> 1; if (s[m2] <= v) lo = m2 + 1; else hi = m2; } return (a + lo) / 2 / s.length; }; }
  var NIVR = [[2, "Muy bajo", "#2e9e5b"], [4, "Bajo", "#8bc34a"], [6, "Medio", "#f5b700"], [8, "Alto", "#f26a1b"], [11, "Muy alto", "#d7263d"]];
  function nivelR(v) { for (var i = 0; i < NIVR.length; i++) if (v < NIVR[i][0]) return NIVR[i]; return NIVR[4]; }
  function indices(T) {
    if (T._ri) return T._ri;
    var D = T.D, ahora = Date.now(), evc = {};
    D.ev.forEach(function (e) { if (e.origen === "foco" || e.origen === "modelo" || e.ts < ahora - 30 * DIA || e.lat == null || e.lon == null) return; var mm = T.donde(+e.lat, +e.lon); if (mm) evc[mm.k] = (evc[mm.k] || 0) + 1; });
    var raw = T.lista.map(function (m) {
      var c = centroM(m), nb = (T.nb && T.nb.municipios[m.k]) || {}, ed = (T.ed && T.ed.municipios[m.k]) || {}, hp = m.est.some(esHosp) ? 0 : ((cercano(T.est, c[0], c[1], esHosp) || {}).km), bo = (m.bom.length || m.res.length) ? 0 : ((cercano(T.emer, c[0], c[1], function (p) { return p[3] === "bomberos" || p[3] === "rescate"; }) || {}).km), pa = paM(T, m.k);
      return {m: m, nbi: nb.nbi24, ext: nb.ext24, agua: nb.agua24, anal: ed.alf24 != null ? 100 - ed.alf24 : null, estu: ed.est24, sal: nb.sal24, hosp: hp, bomb: bo, estab: m.pob ? m.est.length / m.pob * 1e4 : null, veh: pa != null && m.pob ? pa / m.pob * 1000 : null, hist: antM(T, m.k).n, ev: evc[m.k] || 0};
    });
    var P = {}; ["nbi", "ext", "agua", "anal", "estu", "sal", "hosp", "bomb", "estab", "veh", "hist"].forEach(function (k) { P[k] = percentiles(raw.map(function (r) { return r[k]; })); });
    var VUL = [["nbi", "Pobreza por NBI", 1, "%"], ["ext", "Pobreza extrema", 1, "%"], ["agua", "Agua y saneamiento inadecuados", 1, "%"], ["anal", "Analfabetismo", 1, "%"], ["estu", "Pocos años de estudio", -1, " años"], ["sal", "Inadecuada atención en salud", 1, "%"]];
    var CAP = [["hosp", "Distancia al hospital", 1, " km"], ["bomb", "Distancia a bomberos/rescate", 1, " km"], ["estab", "Pocos establecimientos por habitante", -1, " /10.000 hab."], ["veh", "Pocos vehículos por habitante", -1, " /1.000 hab."]];
    function comp(r, L) { var o = []; L.forEach(function (d) { var p = P[d[0]](r[d[0]]); if (p == null) return; var s = d[2] > 0 ? p : 1 - p; o.push({n: d[1], v: r[d[0]], u: d[3], s: s}); }); return o; }
    function media(o) { return o.length ? o.reduce(function (a, b) { return a + b.s; }, 0) / o.length * 10 : null; }
    var out = {}, arr = [];
    raw.forEach(function (r) {
      var V = comp(r, VUL), Lc = comp(r, CAP), m = r.m, hist = P.hist(r.hist) * 10, av = m.av < 0 ? 0 : [1, 4, 7, 10][m.av], fo = m.foc >= 100 ? 10 : m.foc >= 30 ? 7 : m.foc >= 10 ? 4 : m.foc >= 1 ? 2 : 0, ev = r.ev >= 5 ? 8 : r.ev >= 2 ? 5 : r.ev >= 1 ? 3 : 0, act = Math.max(av, fo, ev);
      var Av = media(V), Lv = media(Lc), Am = 0.6 * hist + 0.4 * act;
      /* Sin imputación: si falta todo un componente, se calcula con los disponibles y se marca como parcial. */
      var pz = [Math.max(.5, Am)]; if (Av != null) pz.push(Math.max(.5, Av)); if (Lv != null) pz.push(Math.max(.5, Lv));
      var R = Math.pow(pz.reduce(function (a, b) { return a * b; }, 1), 1 / pz.length), falta = [];
      VUL.forEach(function (d) { if (!V.some(function (c) { return c.n === d[1]; })) falta.push({g: "la vulnerabilidad", n: d[1], t: VUL.length, h: V.length}); });
      CAP.forEach(function (d) { if (!Lc.some(function (c) { return c.n === d[1]; })) falta.push({g: "la capacidad de respuesta", n: d[1], t: CAP.length, h: Lc.length}); });
      var A = [{n: "Antecedentes de desastres (DesInventar)", v: r.hist, u: " registros", s: hist / 10}, {n: "Avisos SENAMHI vigentes", v: m.av < 0 ? "ninguno" : S.NIVTXT[m.av].toLowerCase(), u: "", s: av / 10}, {n: "Focos de calor", v: m.foc, u: " en " + T.dias.length + " d", s: fo / 10}, {n: "Eventos del sistema (30 d)", v: r.ev, u: "", s: ev / 10}];
      var o = {k: m.k, d: m.d, A: Am, V: Av, L: Lv, R: R, niv: nivelR(R), cA: A, cV: V, cL: Lc, hist: hist, act: act, falta: falta, parcial: pz.length < 3, sinHist: r.hist === 0};
      out[m.k] = o; arr.push(o);
    });
    arr.slice().sort(function (a, b) { return b.R - a.R; }).forEach(function (o, i) { o.rank = i + 1; });
    var byD = {}; arr.forEach(function (o) { (byD[o.d] = byD[o.d] || []).push(o); }); Object.keys(byD).forEach(function (d) { byD[d].sort(function (a, b) { return b.R - a.R; }).forEach(function (o, i) { o.rankD = i + 1; o.nD = byD[d].length; }); });
    out._n = arr.length; return (T._ri = out);
  }
  /* Aviso de calidad de datos: nunca se inventa un valor; lo que falta se dice. */
  function avisoDatos(o) {
    var t = [];
    if (o.parcial) t.push("<b>Índice parcial:</b> falta un componente completo; se calculó con los disponibles.");
    if (o.falta && o.falta.length) {
      var g = {}; o.falta.forEach(function (f) { (g[f.g] = g[f.g] || {t: f.t, h: f.h, n: []}).n.push(f.n.toLowerCase()); });
      Object.keys(g).forEach(function (k) { t.push("<b>Datos incompletos:</b> " + k + " se calculó con " + g[k].h + " de " + g[k].t + " indicadores (falta: " + g[k].n.join(", ") + "). No se imputó ningún valor."); });
    }
    if (o.sinHist) t.push("<b>Sin registros históricos:</b> DesInventar no tiene eventos para este municipio (la base termina en 2015 y subregistra). Que no haya registro no significa que no haya amenaza.");
    if (!t.length) return "";
    return '<div class="avd" role="note" style="margin:10px 0;padding:8px 12px;border-left:3px solid #f5b700;background:rgba(245,183,0,.12);font-size:13px;line-height:1.45">' + t.join("<br>") + "</div>";
  }
  function factores(o) { var f = []; [["V", "cV", "Vulnerabilidad"], ["L", "cL", "Capacidad de respuesta"], ["A", "cA", "Amenaza"]].forEach(function (z) { o[z[1]].slice().sort(function (a, b) { return b.s - a.s; }).slice(0, 2).forEach(function (c) { if (c.s >= .6) f.push({g: z[2], c: c}); }); }); return f; }
  /* ---------- ficha de riesgo (página y reporte) ---------- */
  function estilos() {
    if (document.getElementById("tcss")) return;
    var s = document.createElement("style"); s.id = "tcss";
    s.textContent = ".fch{border:1px solid var(--line,#d5dbe5);border-radius:14px;background:var(--card,#fff);padding:16px 18px;margin-top:14px}.fch>h2{margin:0 0 2px;font-size:17px}.fch .sub{color:var(--mut,#5b6678);font-size:12.5px;margin-bottom:12px}" +
      ".fg{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.fbox{border:1px solid var(--line,#d5dbe5);border-radius:12px;padding:12px 14px;break-inside:avoid}.fbox h3{margin:0 0 8px;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut,#5b6678);font-weight:700}" +
      ".gz svg{display:block;width:100%;max-width:250px;margin:0 auto}.gz .pos{text-align:center;font-size:12.5px;color:var(--mut,#5b6678);margin-top:2px}" +
      ".bl{display:grid;grid-template-columns:128px 1fr 34px;gap:8px;align-items:center;margin:11px 0;font-size:12.5px}.bt{position:relative;height:13px;background:rgba(128,140,160,.2);border-radius:7px}.bt i{position:absolute;left:0;top:0;bottom:0;border-radius:7px}.bt u{position:absolute;top:-4px;bottom:-4px;width:2px;text-decoration:none;background:currentColor}.bt u.n{background:none;border-left:2px dotted currentColor;opacity:.55}.bl b{text-align:right}.bk{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--mut,#5b6678);margin-top:4px}.bk u{display:inline-block;width:2px;height:11px;background:currentColor;vertical-align:-2px;margin-right:4px;text-decoration:none}.bk u.n{background:none;border-left:2px dotted currentColor}" +
      ".strip{width:100%;height:auto;display:block}.strip text{fill:currentColor;font-size:10px}" +
      ".lect{font-size:14px;line-height:1.55;margin:12px 0 0;padding:10px 14px;border-left:4px solid var(--brand2,#1d6fb8);background:rgba(120,140,170,.1);border-radius:0 8px 8px 0}.lect small{color:var(--mut,#5b6678)}" +
      ".fxh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}.fxh b{font-size:14px}.fxh span{font-size:12px;color:var(--mut,#5b6678)}.fxr{display:grid;grid-template-columns:minmax(0,1fr) 78px;gap:2px 8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line,#d5dbe5);font-size:12.5px}.fxr em{font-style:normal;text-align:right;font-weight:600;white-space:nowrap}.fxr .b{grid-column:1/3;height:6px;border-radius:3px;background:rgba(128,140,160,.2)}.fxr .b i{display:block;height:100%;border-radius:3px}" +
      ".dist{display:flex;height:24px;border-radius:7px;overflow:hidden;margin:8px 0 6px}.dist span{color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:24px}.dk{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--mut,#5b6678)}.dk i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px}" +
      ".dgrid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));margin-top:8px}.dcard{display:block;border:1px solid var(--line,#d5dbe5);border-radius:12px;padding:12px 14px;background:var(--card,#fff);color:inherit;text-decoration:none}.dcard:hover{box-shadow:0 4px 16px rgba(0,0,0,.2)}.dh{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.dh b{font-size:16px}.chip{color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700}.dm{display:flex;flex-wrap:wrap;gap:3px 12px;font-size:12px;color:var(--mut,#5b6678)}.ch2{width:100%;height:340px}.kpr{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:8px 0}.kpr div{border:1px solid var(--line,#d5dbe5);border-radius:10px;padding:8px 10px}.kpr b{display:block;font-size:19px}.kpr span{font-size:11.5px;color:var(--mut,#5b6678)}.mapr{width:100%;height:auto;display:block;border:1px solid var(--line,#d5dbe5);border-radius:10px}";
    document.head.appendChild(s);
  }
  function med(a) { a = a.filter(function (v) { return v != null && !isNaN(v); }).sort(function (x, y) { return x - y; }); if (!a.length) return null; var h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; }
  function ang(cx, cy, r, th) { var t = th * Math.PI / 180; return [cx - r * Math.cos(t), cy - r * Math.sin(t)]; }
  function gauge(v, niv) {
    var cx = 110, cy = 114, R1 = 94, R0 = 68, s = '<svg viewBox="0 0 220 144" role="img" aria-label="Índice de riesgo ' + fmt(v, 1) + ' de 10">';
    NIVR.forEach(function (x, i) { var a = i * 36 + .8, b = (i + 1) * 36 - .8, p1 = ang(cx, cy, R1, a), p2 = ang(cx, cy, R1, b), p3 = ang(cx, cy, R0, b), p4 = ang(cx, cy, R0, a); s += '<path d="M' + p1 + 'A' + R1 + ' ' + R1 + ' 0 0 1 ' + p2 + 'L' + p3 + 'A' + R0 + ' ' + R0 + ' 0 0 0 ' + p4 + 'Z" fill="' + x[2] + '" opacity="' + (nivelR(v)[1] === x[1] ? 1 : .5) + '"/>'; });
    var th = Math.max(0, Math.min(10, v)) / 10 * 180, tip = ang(cx, cy, R1 + 2, th), pa = ang(cx, cy, R1 + 13, th - 4.5), pb = ang(cx, cy, R1 + 13, th + 4.5);
    s += '<polygon points="' + tip + ' ' + pa + ' ' + pb + '" fill="currentColor"/>';
    s += '<text x="' + cx + '" y="' + (cy - 26) + '" text-anchor="middle" font-size="34" font-weight="800" fill="currentColor">' + fmt(v, 1) + '</text><text x="' + cx + '" y="' + (cy - 12) + '" text-anchor="middle" font-size="10" fill="currentColor" opacity=".65">de 10</text>';
    s += '<text x="' + cx + '" y="' + (cy + 24) + '" text-anchor="middle" font-size="16" font-weight="800" fill="' + niv[2] + '">' + niv[1] + '</text></svg>';
    return s;
  }
  function bullet(nom, v, md, mn) {
    if (v == null) return '<div class="bl"><span>' + nom + '</span><div class="bt"></div><b>—</b></div>';
    return '<div class="bl"><span>' + nom + '</span><div class="bt"><i style="width:' + Math.min(100, v * 10) + '%;background:' + nivelR(v)[2] + '"></i>' + (md != null ? '<u style="left:' + md * 10 + '%" title="Mediana del departamento"></u>' : "") + (mn != null ? '<u class="n" style="left:' + mn * 10 + '%" title="Mediana de Bolivia"></u>' : "") + '</div><b>' + fmt(v, 1) + '</b></div>';
  }
  function strip(T, d, k) {
    var I = indices(T), L = T.DEP[d], X0 = 12, X1 = 408, W = 420, H = 108;
    function X(v) { return X0 + (X1 - X0) * v / 10; }
    var s = '<svg class="strip" viewBox="0 0 ' + W + ' ' + H + '">';
    NIVR.forEach(function (x, i) { var a = i ? NIVR[i - 1][0] : 0, b = i === 4 ? 10 : x[0]; s += '<rect x="' + X(a) + '" y="22" width="' + (X(b) - X(a)) + '" height="46" fill="' + x[2] + '" opacity=".17"/><text x="' + (X(a) + X(b)) / 2 + '" y="16" text-anchor="middle" style="fill:' + x[2] + ';font-weight:700;font-size:10.5px">' + x[1] + '</text>'; });
    for (var t = 0; t <= 10; t += 2) s += '<text x="' + X(t) + '" y="82" text-anchor="middle" opacity=".7">' + t + '</text>';
    var sel = null; L.forEach(function (m, i) { var o = I[m.k]; if (m.k === k) { sel = o; return; } s += '<circle cx="' + X(o.R).toFixed(1) + '" cy="' + (45 + ((i * 37) % 5 - 2) * 7) + '" r="3.4" fill="rgba(110,125,148,.8)" stroke="#fff" stroke-width=".6"/>'; });
    if (sel) { var x = X(sel.R), an = x < 70 ? "start" : x > 350 ? "end" : "middle"; s += '<circle cx="' + x.toFixed(1) + '" cy="45" r="8" fill="' + sel.niv[2] + '" stroke="currentColor" stroke-width="2.2"/><text x="' + x.toFixed(1) + '" y="100" text-anchor="' + an + '" style="font-size:12px;font-weight:800">' + S.esc(T.M[k].n) + " " + fmt(sel.R, 1) + '</text>'; }
    return s + '</svg><div class="bk"><span>● cada punto es un municipio de ' + S.esc(d) + '</span><span>Eje: índice de riesgo 0–10</span></div>';
  }
  function fxCol(tit, val, cs) {
    var h = '<div class="fxh"><b>' + tit + '</b><span>' + (val == null ? "sin dato" : fmt(val, 1) + " / 10") + '</span></div>';
    if (!cs.length) return h + '<p class="nota">Sin indicadores con dato.</p>';
    return h + cs.slice().sort(function (a, b) { return b.s - a.s; }).map(function (c) { var col = c.s >= .75 ? "#d7263d" : c.s >= .5 ? "#f5a300" : "#6dae3f"; return '<div class="fxr"><span>' + S.esc(c.n) + '</span><em>' + (typeof c.v === "number" ? fmt(c.v, c.v < 10 ? 1 : 0) : S.esc(c.v)) + S.esc(c.u) + '</em><div class="b" title="Peor que ' + Math.round(c.s * 100) + '% de los municipios"><i style="width:' + Math.max(3, Math.round(c.s * 100)) + '%;background:' + col + '"></i></div></div>'; }).join("");
  }
  function lectMun(T, d, m, o) {
    var comp = [["la amenaza", o.A], ["la vulnerabilidad", o.V], ["la falta de capacidad de respuesta", o.L]].filter(function (x) { return x[1] != null; }).sort(function (a, b) { return b[1] - a[1]; }), f = factores(o).slice(0, 3);
    return '<b>Riesgo ' + o.niv[1].toLowerCase() + ' (' + fmt(o.R, 1) + ' de 10).</b> ' + S.esc(m.n) + ' ocupa el puesto ' + o.rankD + ' de ' + o.nD + ' municipios de ' + S.esc(d) + ' y el ' + o.rank + ' de ' + indices(T)._n + ' en Bolivia (1 = mayor riesgo). ' + (comp.length ? 'Pesa más ' + comp[0][0] + ' (' + fmt(comp[0][1], 1) + '). ' : "") + (f.length ? 'Factores más desfavorables: ' + f.map(function (x) { return S.esc(x.c.n.toLowerCase()) + ' (' + (typeof x.c.v === "number" ? fmt(x.c.v, x.c.v < 10 ? 1 : 0) : S.esc(x.c.v)) + S.esc(x.c.u) + ')'; }).join("; ") + '. ' : "") + '<small>Índice relativo, no una probabilidad; por validar con el CCES.</small>';
  }
  function fichaHtml(T, d, m, p) {
    estilos();
    var I = indices(T), L = T.DEP[d], LL = L.map(function (x) { return I[x.k]; }), all = T.lista.map(function (x) { return I[x.k]; });
    if (m) {
      var o = I[m.k], mdA = med(LL.map(function (z) { return z.A; })), mdV = med(LL.map(function (z) { return z.V; })), mdL = med(LL.map(function (z) { return z.L; })), mnA = med(all.map(function (z) { return z.A; })), mnV = med(all.map(function (z) { return z.V; })), mnL = med(all.map(function (z) { return z.L; }));
      return '<section class="fch" style="border-top:4px solid ' + o.niv[2] + '"><h2>Ficha de riesgo · ' + S.esc(m.n) + '</h2><div class="sub">Amenaza × vulnerabilidad × falta de capacidad de respuesta, medidos frente a los 339 municipios del país. Lectura automática <b>por validar con el CCES</b>.</div>' + avisoDatos(o) +
        '<div class="fg"><div class="fbox gz"><h3>Nivel de riesgo</h3>' + gauge(o.R, o.niv) + '<div class="pos">Puesto <b>' + o.rankD + '</b> de ' + o.nD + ' en ' + S.esc(d) + ' · <b>' + o.rank + '</b> de ' + I._n + ' en Bolivia</div></div>' +
        '<div class="fbox"><h3>Componentes (0 = mejor · 10 = peor)</h3>' + bullet("Amenaza", o.A, mdA, mnA) + bullet("Vulnerabilidad", o.V, mdV, mnV) + bullet("Falta de capacidad de respuesta", o.L, mdL, mnL) + '<div class="bk"><span><u></u>mediana del departamento</span><span><u class="n"></u>mediana de Bolivia</span></div></div>' +
        '<div class="fbox"><h3>Posición entre los municipios del departamento</h3>' + strip(T, d, m.k) + '</div></div>' +
        '<p class="lect">' + lectMun(T, d, m, o) + '</p>' +
        '<div class="fg" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class="fbox">' + fxCol("Amenaza", o.A, o.cA) + '</div><div class="fbox">' + fxCol("Vulnerabilidad", o.V, o.cV) + '</div><div class="fbox">' + fxCol("Falta de capacidad de respuesta", o.L, o.cL) + '</div></div>' +
        '<div class="bk" style="margin-top:8px"><span>Cada barra indica qué tan desfavorable es el valor frente a los demás municipios (barra llena = entre los peores).</span><span>Servicios de OSM (incompletos) · antecedentes DesInventar hasta 2015.</span></div></section>';
    }
    var tot = L.reduce(function (s, x) { return s + (x.pob || 0); }, 0) || 1, Rw = LL.reduce(function (s, o2) { return s + o2.R * (T.M[o2.k].pob || 0); }, 0) / tot, n = nivelR(Rw), cnt = NIVR.map(function (x) { return LL.filter(function (o2) { return o2.niv[1] === x[1]; }).length; }), top = LL.slice().sort(function (a, b) { return b.R - a.R; }).slice(0, 3);
    var alto = cnt[3] + cnt[4];
    return '<section class="fch" style="border-top:4px solid ' + n[2] + '"><h2>Riesgo de los municipios de ' + S.esc(d) + '</h2><div class="sub">Índice 0–10 por municipio (amenaza × vulnerabilidad × falta de capacidad de respuesta), relativo a los 339 municipios del país. <b>Por validar con el CCES.</b></div>' +
      '<div class="fg"><div class="fbox gz"><h3>Riesgo medio del departamento</h3>' + gauge(Rw, n) + '<div class="pos">Ponderado por población</div></div>' +
      '<div class="fbox"><h3>Municipios por nivel de riesgo</h3><div class="dist">' + NIVR.map(function (x, i) { return cnt[i] ? '<span style="flex:' + cnt[i] + ';background:' + x[2] + '" title="' + x[1] + ': ' + cnt[i] + '">' + cnt[i] + '</span>' : ""; }).join("") + '</div><table style="width:100%;font-size:13px;border-collapse:collapse">' + NIVR.map(function (x, i) { return '<tr><td style="padding:3px 0"><i style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + x[2] + ';margin-right:7px;vertical-align:-1px"></i>' + x[1] + ' (' + (i ? NIVR[i - 1][0] : 0) + '–' + (i === 4 ? 10 : x[0]) + ')</td><td style="text-align:right"><b>' + cnt[i] + '</b> municipio' + (cnt[i] === 1 ? "" : "s") + '</td></tr>'; }).join("") + '</table></div>' +
      '<div class="fbox" style="grid-column:1/-1"><h3>Amenaza y vulnerabilidad por municipio (el tamaño indica población)</h3><div class="ch2" id="' + p + 'Sc"></div></div></div>' +
      '<p class="lect"><b>Riesgo ' + n[1].toLowerCase() + ' en promedio (' + fmt(Rw, 1) + ' de 10).</b> ' + alto + ' de ' + L.length + ' municipios están en nivel alto o muy alto. Mayor riesgo: ' + top.map(function (o2) { return S.esc(T.M[o2.k].n) + ' (' + fmt(o2.R, 1) + ')'; }).join(", ") + '. <small>Índice relativo, no una probabilidad de ocurrencia.</small></p>' +
      '<div class="fbox" style="margin-top:14px"><h3>Los 12 municipios con mayor riesgo</h3><div class="ch2" id="' + p + 'Rk" style="height:' + (60 + 26 * Math.min(12, L.length)) + 'px"></div></div></section>';
  }
  function tcolor() { return getComputedStyle(document.body).color || "#222"; }
  function fichaInit(T, d, m, p, nav) {
    if (m || !window.echarts) return;
    var I = indices(T), L = T.DEP[d], col = tcolor(), ln = "rgba(128,140,160,.35)", maxp = Math.max.apply(null, L.map(function (x) { return x.pob || 1; }));
    var el = document.getElementById(p + "Sc"), el2 = document.getElementById(p + "Rk");
    function ir(par) { if (nav && par && par.data && par.data.n) location.href = "municipio.html?d=" + encodeURIComponent(d) + "&m=" + encodeURIComponent(par.data.n); }
    if (el) {
      var top6 = L.slice().sort(function (a, b) { return I[b.k].R - I[a.k].R; }).slice(0, 7).map(function (x) { return x.k; }), data = L.filter(function (x) { return I[x.k].A != null && I[x.k].V != null; }).map(function (x) { var o = I[x.k]; return {n: x.n, value: [+o.A.toFixed(2), +o.V.toFixed(2), x.pob || 0, o.R], itemStyle: {color: o.niv[2], opacity: .82, borderColor: "#fff", borderWidth: 1}, label: {show: top6.indexOf(x.k) >= 0, formatter: x.n, position: "right", fontSize: 10.5, color: col}}; });
      var c = echarts.init(el, null, {renderer: "svg"});
      c.setOption({animation: false, textStyle: {color: col}, grid: {left: 52, right: 40, top: 14, bottom: 42}, tooltip: {formatter: function (q) { return "<b>" + S.esc(q.data.n) + "</b><br>Riesgo " + fmt(q.data.value[3], 1) + " · amenaza " + fmt(q.data.value[0], 1) + " · vulnerabilidad " + fmt(q.data.value[1], 1) + "<br>" + fmt(q.data.value[2]) + " hab."; }},
        xAxis: {name: "Amenaza (0–10)", nameLocation: "middle", nameGap: 26, min: 0, max: 10, splitLine: {lineStyle: {color: ln}}, axisLine: {lineStyle: {color: ln}}, axisLabel: {color: col}}, yAxis: {name: "Vulnerabilidad (0–10)", nameLocation: "middle", nameGap: 34, min: 0, max: 10, splitLine: {lineStyle: {color: ln}}, axisLine: {lineStyle: {color: ln}}, axisLabel: {color: col}},
        series: [{type: "scatter", data: data, symbolSize: function (v) { return 8 + 30 * Math.sqrt((v[2] || 0) / maxp); }, markLine: {silent: true, symbol: "none", lineStyle: {color: "#999", type: "dashed"}, label: {show: false}, data: [{xAxis: 5}, {yAxis: 5}]}, markArea: {silent: true, itemStyle: {color: "rgba(215,38,61,.07)"}, label: {show: true, position: "insideTopRight", formatter: "Amenaza y vulnerabilidad altas", color: "#d7263d", fontSize: 10.5}, data: [[{xAxis: 5, yAxis: 5}, {xAxis: 10, yAxis: 10}]]}}]});
      c.on("click", ir); window.addEventListener("resize", function () { c.resize(); });
    }
    if (el2) {
      var rk = L.slice().sort(function (a, b) { return I[b.k].R - I[a.k].R; }).slice(0, 12).reverse(), c2 = echarts.init(el2, null, {renderer: "svg"});
      c2.setOption({animation: false, textStyle: {color: col}, grid: {left: 150, right: 44, top: 6, bottom: 22}, tooltip: {formatter: function (q) { return "<b>" + S.esc(q.data.n) + "</b><br>Riesgo " + fmt(q.data.value, 1) + " (" + q.data.niv + ")"; }}, xAxis: {min: 0, max: 10, splitLine: {lineStyle: {color: ln}}, axisLabel: {color: col}}, yAxis: {type: "category", data: rk.map(function (x) { return x.n; }), axisLabel: {color: col, fontSize: 11.5}, axisLine: {lineStyle: {color: ln}}},
        series: [{type: "bar", barWidth: 14, data: rk.map(function (x) { var o = I[x.k]; return {n: x.n, niv: o.niv[1], value: +o.R.toFixed(2), itemStyle: {color: o.niv[2], borderRadius: [0, 4, 4, 0]}}; }), label: {show: true, position: "right", color: col, formatter: function (q) { return fmt(q.value, 1); }}}]});
      c2.on("click", ir); window.addEventListener("resize", function () { c2.resize(); });
    }
  }
  /* mapa estático (SVG) de riesgo para el reporte */
  function svgMapa(T, d, m) {
    var I = indices(T), bb = m ? pad(m.bb, .3) : pad(unir(T.DEP[d]), .04), kx = Math.cos((bb[1] + bb[3]) / 2 * Math.PI / 180), W = 900, sc = W / ((bb[2] - bb[0]) * kx), H = Math.round((bb[3] - bb[1]) * sc);
    function x(l) { return (l - bb[0]) * kx * sc; } function y(l) { return (bb[3] - l) * sc; }
    function path(g) { var s = ""; (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach(function (pl) { pl.forEach(function (r) { s += "M" + r.map(function (c) { return x(c[0]).toFixed(1) + "," + y(c[1]).toFixed(1); }).join("L") + "Z"; }); }); return s; }
    var vis = T.lista.filter(function (z) { return !(z.bb[2] < bb[0] || z.bb[0] > bb[2] || z.bb[3] < bb[1] || z.bb[1] > bb[3]); }), s = '<svg class="mapr"' + (H > W * 1.2 ? ' style="max-width:62%;margin:0 auto"' : "") + ' viewBox="0 0 ' + W + ' ' + H + '"><rect width="' + W + '" height="' + H + '" fill="#e9f0f7"/>', labs = [];
    vis.forEach(function (z) { var o = I[z.k], en = z.d === d && (!m || z.k === m.k), op = en ? .88 : .34; s += '<path d="' + path(z.f.geometry) + '" fill="' + o.niv[2] + '" fill-opacity="' + op + '" stroke="' + (m && z.k === m.k ? "#10233d" : "#fff") + '" stroke-width="' + (m && z.k === m.k ? 3 : 1) + '" fill-rule="evenodd"/>'; });
    vis.slice().sort(function (a, b) { return (m && b.k === m.k) - (m && a.k === m.k) || b.km2 - a.km2; }).forEach(function (z) { if (labs.length >= 55) return; var c = cenPoly(z.f.geometry), px = x(c[0]), py = y(c[1]), selz = m && z.k === m.k, fs = selz ? 19 : 12, w = z.n.length * fs * .58, b = [px - w / 2, py - fs / 2, px + w / 2, py + fs / 2]; if (b[0] < 4 || b[2] > W - 4 || b[1] < 4 || b[3] > H - 4) return; for (var i = 0; i < labs.length; i++) { var q = labs[i]; if (b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]) return; } labs.push(b); s += '<text x="' + px.toFixed(1) + '" y="' + (py + fs * .35).toFixed(1) + '" text-anchor="middle" font-size="' + fs + '" font-weight="' + (selz ? 800 : 600) + '" fill="#10233d" stroke="#fff" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round">' + S.esc(z.n) + '</text>'; });
    if (m) {
      T.est.forEach(function (q) { if (q[1] >= bb[0] && q[1] <= bb[2] && q[0] >= bb[1] && q[0] <= bb[3] && dentro(m.f.geometry, q[0], q[1])) s += '<circle cx="' + x(q[1]).toFixed(1) + '" cy="' + y(q[0]).toFixed(1) + '" r="5.5" fill="#1f9d55" stroke="#fff" stroke-width="1.6"/>'; });
      T.emer.forEach(function (q) { if (q[1] >= bb[0] && q[1] <= bb[2] && q[0] >= bb[1] && q[0] <= bb[3] && dentro(m.f.geometry, q[0], q[1])) s += q[3] === "policía" ? '<circle cx="' + x(q[1]).toFixed(1) + '" cy="' + y(q[0]).toFixed(1) + '" r="4.5" fill="#1f5fbf" stroke="#fff" stroke-width="1.5"/>' : '<path d="M' + x(q[1]).toFixed(1) + ',' + (y(q[0]) - 6).toFixed(1) + 'l6,11l-12,0z" fill="#d7263d" stroke="#fff" stroke-width="1.5"/>'; });
    }
    var lx = 14, ly = H - 20 - 5 * 18 - (m ? 22 : 0);
    s += '<rect x="' + (lx - 6) + '" y="' + (ly - 22) + '" width="214" height="' + (5 * 18 + 30 + (m ? 22 : 0)) + '" rx="8" fill="#fff" fill-opacity=".92" stroke="#c9d3e0"/><text x="' + lx + '" y="' + (ly - 6) + '" font-size="12" font-weight="800" fill="#10233d">Nivel de riesgo (relativo)</text>';
    NIVR.forEach(function (q, i) { s += '<rect x="' + lx + '" y="' + (ly + i * 18) + '" width="22" height="12" rx="3" fill="' + q[2] + '"/><text x="' + (lx + 30) + '" y="' + (ly + i * 18 + 10) + '" font-size="11.5" fill="#10233d">' + q[1] + ' (' + (i ? NIVR[i - 1][0] : 0) + '–' + (i === 4 ? 10 : q[0]) + ')</text>'; });
    if (m) s += '<circle cx="' + (lx + 8) + '" cy="' + (ly + 5 * 18 + 8) + '" r="5" fill="#1f9d55"/><text x="' + (lx + 20) + '" y="' + (ly + 5 * 18 + 12) + '" font-size="11" fill="#10233d">salud</text><circle cx="' + (lx + 70) + '" cy="' + (ly + 5 * 18 + 8) + '" r="4.5" fill="#1f5fbf"/><text x="' + (lx + 80) + '" y="' + (ly + 5 * 18 + 12) + '" font-size="11" fill="#10233d">policía</text><path d="M' + (lx + 136) + ',' + (ly + 5 * 18 + 2) + 'l6,11l-12,0z" fill="#d7263d"/><text x="' + (lx + 146) + '" y="' + (ly + 5 * 18 + 12) + '" font-size="11" fill="#10233d">bomberos</text>';
    return s + '</svg>';
  }

  /* ---------- mapa con TODAS las capas del mapa nacional + servicios ---------- */
  var VARS = [
    ["none", "Sin color", null],
    ["riesgo", "Índice de riesgo (0–10)", function (m, T) { return indices(T)[m.k].R; }, "lin", "/10"],
    ["amen", "Amenaza (0–10)", function (m, T) { return indices(T)[m.k].A; }, "lin", "/10"],
    ["vul", "Vulnerabilidad (0–10)", function (m, T) { return indices(T)[m.k].V; }, "lin", "/10"],
    ["cap", "Falta de capacidad de respuesta (0–10)", function (m, T) { return indices(T)[m.k].L; }, "lin", "/10"],
    ["pob", "Población", function (m) { return m.pob; }, "raiz", "hab."],
    ["dens", "Densidad", function (m) { return densidad(m); }, "raiz", "hab/km²"],
    ["his", "Desastres históricos (DesInventar)", function (m, T) { return antM(T, m.k).n; }, "raiz", "registros"],
    ["foc", "Focos de calor (14 d)", function (m) { return m.foc; }, "raiz", "focos"],
    ["av", "Avisos SENAMHI vigentes", function (m) { return m.av; }, "aviso", ""],
    ["nbi", "Pobreza por NBI (%)", function (m, T) { var x = T.nb && T.nb.municipios[m.k]; return x ? x.nbi24 : null; }, "lin", "%"],
    ["alf", "Alfabetismo (%)", function (m, T) { var x = T.ed && T.ed.municipios[m.k]; return x ? x.alf24 : null; }, "lin", "%"],
    ["est", "Años de estudio", function (m, T) { var x = T.ed && T.ed.municipios[m.k]; return x ? x.est24 : null; }, "lin", "años"]
  ];
  function mapaCapas(T, o) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark", B = pad(o.bb, o.margen), uid = "m" + Math.random().toString(36).slice(2, 6);
    function en(lat, lon) { return lon >= B[0] && lon <= B[2] && lat >= B[1] && lat <= B[3]; }
    function pts(arr, fn, test) { return {type: "FeatureCollection", features: arr.filter(test || function (p) { return en(p[0], p[1]); }).map(function (p) { return {type: "Feature", geometry: {type: "Point", coordinates: [p[1], p[0]]}, properties: fn(p)}; })}; }
    var D = T.D;
    var cap = {
      salud: pts(T.est, function (p) { return {t: p[2] || "(sin nombre)", s: "Salud · " + p[3] + " · " + (p[4] || "")}; }),
      bomberos: pts(T.emer.filter(function (p) { return p[3] === "bomberos"; }), function (p) { return {t: p[2] || "(sin nombre)", s: "Bomberos"}; }),
      rescate: pts(T.emer.filter(function (p) { return p[3] === "rescate"; }), function (p) { return {t: p[2] || "(sin nombre)", s: "Rescate"}; }),
      "policía": pts(T.emer.filter(function (p) { return p[3] === "policía"; }), function (p) { return {t: p[2] || "(sin nombre)", s: "Policía"}; }),
      sis: {type: "FeatureCollection", features: (((D.sismos_oficiales || {}).sismos) || []).filter(function (s) { return en(s.lat, s.lon); }).map(function (s) { return {type: "Feature", geometry: {type: "Point", coordinates: [s.lon, s.lat]}, properties: {mag: s.mag, p: s.prof_km, t: "Sismo M " + s.mag, s: s.fecha_local + " · prof. " + s.prof_km + " km", id: "sismo:" + s.id}}; })},
      rio: {type: "FeatureCollection", features: (((D.caudales || {}).puntos) || []).filter(function (c) { return c.fechas && en(+c.lat, +c.lon); }).map(function (c) { return {type: "Feature", geometry: {type: "Point", coordinates: [+c.lon, +c.lat]}, properties: {t: c.rio + " — " + c.nombre, s: c.estado, v: +c.nivel || 0, id: "caudal:" + c.nombre + ":" + c.hoy}}; })},
      comp: {type: "FeatureCollection", features: (((D.focos_complejos || {}).complejos) || []).filter(function (c) { return en(c.lat, c.lon); }).map(function (c) { return {type: "Feature", geometry: {type: "Point", coordinates: [c.lon, c.lat]}, properties: {n: c.n, t: "Complejo de focos — " + (c.municipio || "") + ", " + (c.departamento || ""), s: c.n + " detecciones · " + c.frp_mw + " MW", id: "complejo:" + c.id + ":" + c.departamento}}; })},
      evs: {type: "FeatureCollection", features: D.ev.filter(function (e) { return e.lat != null && e.lon != null && ["foco", "sismo", "caudal", "modelo"].indexOf(e.origen) < 0 && en(+e.lat, +e.lon); }).map(function (e) { return {type: "Feature", geometry: {type: "Point", coordinates: [+e.lon, +e.lat]}, properties: {t: e.titulo, s: e.categoria + " · " + S.fecha(e.ts, true), c: S.COLCAT[e.categoria] || "#777", id: e.id}}; })}
    };
    var nF = {salud: cap.salud.features.length, bomberos: cap.bomberos.features.length, rescate: cap.rescate.features.length, "policía": cap["policía"].features.length};
    function focosGeo(dias) { var s = T.dias.slice(-dias); return pts(T.focos, function (p) { return {frp: p[2], t: "Foco de calor", s: p[3] + " · " + p[2] + " MW"}; }, function (p) { return en(p[0], p[1]) && s.indexOf(p[3]) >= 0; }); }
    var nAv = o.munis.filter(function (m) { return m.av >= 0; }).length;
    /* panel de capas (misma estructura que el mapa nacional) */
    var panel = '<div class="card lay" id="' + uid + 'L"><h2>Capas</h2><div class="sec">Servicios (a pedido · OpenStreetMap)</div>' +
      [["salud", "Salud", 1], ["bomberos", "Bomberos"], ["rescate", "Rescate"], ["policía", "Policía", 1]].map(function (x) { return '<label><input type="checkbox" data-c="' + x[0] + '">' + ico(x[0], 18) + ' ' + x[1] + ' <span class="nota">(' + nF[x[0]] + (x[2] ? ", al acercar" : "") + ')</span></label>'; }).join("") +
      '<div class="sec">Incendios (NASA FIRMS)</div><label><input type="checkbox" data-c="heat" checked> Mapa de calor de focos</label><label><input type="checkbox" data-c="comp" checked>' + ico("complejo", 18) + ' Complejos de incendio <span class="nota">(' + cap.comp.features.length + ')</span></label><div class="nota" id="' + uid + 'D">Últimos ' + Math.min(3, T.dias.length) + ' días</div><input type="range" id="' + uid + 'R" min="1" max="' + Math.max(1, T.dias.length) + '" value="' + Math.min(3, Math.max(1, T.dias.length)) + '">' +
      '<div class="sec">Otros eventos</div><label><input type="checkbox" data-c="sis" checked> Sismos <span class="nota">(' + cap.sis.features.length + ')</span></label><label><input type="checkbox" data-c="rio">' + ico("rio0", 18) + ' Estaciones de ríos (GloFAS) <span class="nota">(' + cap.rio.features.length + ')</span></label><label><input type="checkbox" data-c="evs"> Otros eventos con ubicación <span class="nota">(' + cap.evs.features.length + ')</span></label>' +
      '<div class="sec">Rótulos</div><label><input type="checkbox" data-c="nom"> Nombres de municipios (fijos)</label><div class="sec">Colorear ' + o.unidad + ' por</div>' + VARS.map(function (v, i) { return '<label><input type="radio" name="' + uid + 'F" value="' + v[0] + '"' + (i === 0 ? " checked" : "") + '> ' + v[1] + '</label>'; }).join("") +
      '<div class="sec">Mapa base</div><label><input type="radio" name="' + uid + 'B" value="osm" checked> Calles y relieve (OSM)</label><label><input type="radio" name="' + uid + 'B" value="sat"> Imagen satelital (Esri)</label><label><input type="radio" name="' + uid + 'B" value="none"> Sin mapa base</label>' +
      '<p class="nota">Red vial y ríos del mapa topográfico: siguiente fase.</p></div>';
    var html = '<div class="maplayout">' + panel + '<div class="card" style="padding:10px;position:relative"><div class="map" id="' + uid + 'M" style="height:' + o.alto + 'px"></div><div class="mleg" id="' + uid + 'G"></div></div></div>';
    o.el.innerHTML = html;
    var m = new maplibregl.Map({container: uid + "M", style: {version: 8, sources: {osm: {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap"}, sat: {type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 17, attribution: "Imagen © Esri, Maxar, Earthstar Geographics"}}, layers: [{id: "bg", type: "background", paint: {"background-color": X.css("--soft")}}, {id: "osm", type: "raster", source: "osm", paint: {"raster-opacity": osc ? .6 : .9, "raster-brightness-max": osc ? .6 : 1}}, {id: "sat", type: "raster", source: "sat", layout: {visibility: "none"}}]}, bounds: [[o.bb[0], o.bb[1]], [o.bb[2], o.bb[3]]], fitBoundsOptions: {padding: 30}});
    m.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); m.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-left");
    var geo = {type: "FeatureCollection", features: o.munis.map(function (x) { return {type: "Feature", geometry: x.f.geometry, properties: {n: x.n, d: x.d, sel: o.sel && x.k === o.sel ? 1 : 0, v: null, txt: ""}}; })};
    var popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
    function ver(id, on) { if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none"); }
    function pop(capa) { m.on("click", capa, function (e) { var p = e.features[0].properties; new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pop"><b>' + S.esc(p.t) + '</b>' + S.esc(p.s || "") + (p.id ? '<br><a href="evento.html?id=' + encodeURIComponent(p.id) + '">Abrir informe →</a>' : "") + '</div>').addTo(m); }); m.on("mouseenter", capa, function () { m.getCanvas().style.cursor = "pointer"; }); m.on("mouseleave", capa, function () { m.getCanvas().style.cursor = ""; }); }
    function colorear(clave) {
      var v = VARS.filter(function (x) { return x[0] === clave; })[0], g = document.getElementById(uid + "G"), mx = 0, mn = 1e12;
      geo.features.forEach(function (f, i) { var x = o.munis[i], val = v[2] ? v[2](x, T) : null; f.properties.raw = val; f.properties.txt = val == null ? "sin dato" : (v[3] === "aviso" ? (val < 0 ? "sin aviso" : "aviso " + S.NIVTXT[val].toLowerCase()) : fmt(val, v[3] === "lin" ? 1 : 0) + " " + v[4]); var t = val == null ? null : v[3] === "raiz" ? Math.sqrt(Math.max(0, val)) : val; f.properties.v = t; if (t != null) { mx = Math.max(mx, t); mn = Math.min(mn, t); } });
      m.getSource("mun").setData(geo); g.innerHTML = "";
      var tit = '<b>' + S.esc(v[1]) + '</b>';
      if (!v[2]) { m.setPaintProperty("mun-f", "fill-color", "#1d6fb8"); m.setPaintProperty("mun-f", "fill-opacity", ["case", ["==", ["get", "sel"], 1], .22, .06]); return; }
      if (v[3] === "aviso") { m.setPaintProperty("mun-f", "fill-color", ["match", ["round", ["coalesce", ["get", "v"], -1]], 0, "#bfe5c9", 1, "#f9dc6b", 2, "#f7a15e", 3, "#e5576a", "rgba(0,0,0,0)"]); m.setPaintProperty("mun-f", "fill-opacity", .75); g.innerHTML = tit + ["#bfe5c9", "#f9dc6b", "#f7a15e", "#e5576a"].map(function (c, i) { return '<span><i style="background:' + c + '"></i>Aviso ' + S.NIVTXT[i].toLowerCase() + '</span>'; }).join("") + '<span><i style="background:rgba(120,130,150,.25)"></i>Sin aviso vigente</span>'; return; }
      if (v[4] === "/10") { m.setPaintProperty("mun-f", "fill-color", ["case", ["==", ["typeof", ["get", "v"]], "number"], ["step", ["get", "v"], NIVR[0][2], 2, NIVR[1][2], 4, NIVR[2][2], 6, NIVR[3][2], 8, NIVR[4][2]], "#cfd6df"]); m.setPaintProperty("mun-f", "fill-opacity", .66); g.innerHTML = tit + NIVR.map(function (x, i) { return '<span><i style="background:' + x[2] + '"></i>' + x[1] + ' (' + (i ? NIVR[i - 1][0] : 0) + '–' + (i === 4 ? 10 : x[0]) + ')</span>'; }).join("") + '<span><i style="background:#cfd6df"></i>sin dato</span><em>Relativo entre municipios · por validar con CCES</em>'; return; }
      if (mx <= mn) mx = mn + 1;
      m.setPaintProperty("mun-f", "fill-color", ["case", ["==", ["typeof", ["get", "v"]], "number"], ["interpolate", ["linear"], ["get", "v"], mn, "#e8eef7", mx, "#08306b"], "#cfd6df"]); m.setPaintProperty("mun-f", "fill-opacity", .75);
      var a = v[3] === "raiz" ? mn * mn : mn, b = v[3] === "raiz" ? mx * mx : mx; g.innerHTML = tit + '<span><i style="width:70px;background:linear-gradient(90deg,#e8eef7,#08306b)"></i>' + fmt(a, v[3] === "lin" ? 1 : 0) + ' → ' + fmt(b, v[3] === "lin" ? 1 : 0) + ' ' + v[4] + '</span><span><i style="background:#cfd6df"></i>sin dato</span>';
    }
    m.on("load", function () {
      var lab = document.createElement("div"); lab.className = "mlab"; m.getContainer().appendChild(lab);
      var cents = o.munis.map(function (x) { var c = cenPoly(x.f.geometry); return {n: x.n, x: c[0], y: c[1], a: x.km2 || 0, sel: o.sel && x.k === o.sel ? 1 : 0}; }).sort(function (a, b) { return b.sel - a.sel || b.a - a.a; }), nomOn = false, rq = 0;
      function rotular() { if (!nomOn) { lab.innerHTML = ""; return; } var W = m.getContainer().clientWidth, H = m.getContainer().clientHeight, cj = [], out = "", n = 0; cents.forEach(function (it) { if (n > 80) return; var p = m.project([it.x, it.y]); if (p.x < 24 || p.y < 14 || p.x > W - 24 || p.y > H - 14) return; var w = it.n.length * 6.4 + 10, h = 15, b = [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2]; for (var i = 0; i < cj.length; i++) { var q = cj[i]; if (b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]) return; } cj.push(b); n++; out += '<span' + (it.sel ? ' class="sel"' : "") + ' style="left:' + p.x.toFixed(0) + 'px;top:' + p.y.toFixed(0) + 'px">' + S.esc(it.n) + '</span>'; }); lab.innerHTML = out; }
      function pedir() { if (rq) return; rq = requestAnimationFrame(function () { rq = 0; rotular(); }); }
      m.on("move", pedir); m.on("moveend", rotular); m.on("resize", rotular); setTimeout(rotular, 300);
      m._nom = function (on) { nomOn = on; rotular(); };
      m.addSource("mun", {type: "geojson", data: geo});
      m.addLayer({id: "mun-f", type: "fill", source: "mun", paint: {"fill-color": "#1d6fb8", "fill-opacity": ["case", ["==", ["get", "sel"], 1], .22, .06]}});
      m.addLayer({id: "mun-l", type: "line", source: "mun", paint: {"line-color": "#0b3b6e", "line-width": ["case", ["==", ["get", "sel"], 1], 3, .8], "line-opacity": .85}});
      m.addSource("focos", {type: "geojson", data: focosGeo(Math.min(3, T.dias.length) || 1)});
      m.addLayer({id: "heat", type: "heatmap", source: "focos", paint: {"heatmap-weight": ["interpolate", ["linear"], ["get", "frp"], 0, .35, 50, 1], "heatmap-intensity": 1.2, "heatmap-radius": 22, "heatmap-opacity": .8, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,120,0,0)", .15, "rgba(255,140,0,.55)", .4, "rgba(255,69,0,.8)", .7, "rgba(214,25,25,.92)", 1, "rgba(122,0,38,1)"]}});
      m.addLayer({id: "focoHalo", type: "circle", source: "focos", minzoom: 7, paint: {"circle-radius": 10, "circle-color": "rgba(255,60,0,.34)", "circle-blur": 1, "circle-opacity": .9}});
      m.addLayer({id: "focoPt", type: "circle", source: "focos", minzoom: 7, paint: {"circle-radius": 3.6, "circle-color": "#ff3d00", "circle-stroke-color": "#ffd180", "circle-stroke-width": 1.4}});
      ["salud", "bomberos", "rescate", "policía", "complejo", "rio0", "rio1", "rio2", "rio3"].forEach(function (k) { var d = dibuja(k).data; m.addImage("i-" + k, {width: 64, height: 64, data: d}); });
      var TAM = ["interpolate", ["linear"], ["zoom"], 5, .16, 8, .26, 11, .38, 14, .52];
      Object.keys(cap).forEach(function (k) {
        m.addSource("c-" + k, {type: "geojson", data: cap[k]});
        if (COL[k]) { m.addLayer({id: "c-" + k, type: "symbol", source: "c-" + k, minzoom: k === "salud" || k === "policía" ? 9 : 0, layout: {"icon-image": "i-" + k, "icon-size": k === "salud" || k === "policía" ? TAM : ["interpolate", ["linear"], ["zoom"], 5, .22, 8, .32, 11, .44, 14, .6], "icon-allow-overlap": true}}); }
        else if (k === "rio") { m.addLayer({id: "c-rio", type: "symbol", source: "c-rio", layout: {"icon-image": ["concat", "i-rio", ["to-string", ["get", "v"]]], "icon-size": ["interpolate", ["linear"], ["zoom"], 5, .26, 9, .36, 13, .5], "icon-allow-overlap": true}}); }
        else if (k === "comp") {
          m.addLayer({id: "c-comp-h", type: "circle", source: "c-comp", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "n"], 8, 12, 120, 26], "circle-color": "rgba(255,70,0,.40)", "circle-blur": 1, "circle-opacity": .9}});
          m.addLayer({id: "c-comp", type: "symbol", source: "c-comp", layout: {"icon-image": "i-complejo", "icon-size": ["interpolate", ["linear"], ["get", "n"], 8, .3, 120, .55], "icon-allow-overlap": true}});
        }
        else if (k === "sis") {
          m.addLayer({id: "c-sis-h", type: "circle", source: "c-sis", paint: {"circle-radius": ["*", ["interpolate", ["linear"], ["get", "mag"], 2, 3.5, 3, 6, 4, 10, 5, 16, 6, 24], 2], "circle-color": ["step", ["coalesce", ["get", "p"], 30], "#d7263d", 70, "#f2a41b", 300, "#5b6cff"], "circle-opacity": .14, "circle-blur": 1}});
          m.addLayer({id: "c-sis", type: "circle", source: "c-sis", paint: {"circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2, 3.5, 3, 6, 4, 10, 5, 16, 6, 24], "circle-color": ["step", ["coalesce", ["get", "p"], 30], "#d7263d", 70, "#f2a41b", 300, "#5b6cff"], "circle-opacity": .2, "circle-stroke-color": ["step", ["coalesce", ["get", "p"], 30], "#d7263d", 70, "#f2a41b", 300, "#5b6cff"], "circle-stroke-width": 1.8}});
        }
        else { m.addLayer({id: "c-" + k, type: "circle", source: "c-" + k, paint: {"circle-radius": 4.5, "circle-color": ["get", "c"], "circle-opacity": .9, "circle-stroke-color": "#fff", "circle-stroke-width": 1.4}}); }
        pop("c-" + k);
      });
      /* pulso suave de los halos de fuego */
      var tp = 0; var pulso = setInterval(function () { if (!m.getLayer("focoHalo")) return; tp += .18; try { m.setPaintProperty("focoHalo", "circle-radius", 10 + 3 * Math.sin(tp)); m.setPaintProperty("c-comp-h", "circle-opacity", .65 + .3 * Math.sin(tp)); } catch (e) { clearInterval(pulso); } }, 90);
      pop("focoPt");
      m.on("mousemove", "mun-f", function (e) { if (m.queryRenderedFeatures(e.point).some(function (f) { return /^c-|^focoPt/.test(f.layer.id); })) { popup.remove(); return; } var p = e.features[0].properties; m.getCanvas().style.cursor = o.click ? "pointer" : ""; popup.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + S.esc(p.n) + '</b>' + S.esc(p.txt && p.txt !== "" ? p.txt : "") + (o.click ? ' · ' + (o.clicTxt || 'clic para abrir') : "") + '</div>').addTo(m); });
      m.on("mouseleave", "mun-f", function () { popup.remove(); });
      ["c-salud", "c-bomberos", "c-rescate", "c-policía", "c-rio", "c-comp"].forEach(function (id) { m.on("mouseenter", id, function () { popup.remove(); }); });
      if (o.click) m.on("click", "mun-f", function (e) { if (m.queryRenderedFeatures(e.point).some(function (f) { return /^c-|^focoPt/.test(f.layer.id); })) return; o.click(e.features[0].properties); });
      var P = document.getElementById(uid + "L");
      P.querySelectorAll("input[data-c]").forEach(function (i) { i.onchange = function () { var c = i.dataset.c; if (c === "nom") { m._nom(i.checked); } else if (c === "heat") { ver("heat", i.checked); ver("focoPt", i.checked); ver("focoHalo", i.checked); } else { ver("c-" + c, i.checked); if (c === "comp") ver("c-comp-h", i.checked); if (c === "sis") ver("c-sis-h", i.checked); } }; });
      P.querySelectorAll("input[data-c]").forEach(function (i) { i.onchange(); });
      P.querySelectorAll("input[name=" + uid + "F]").forEach(function (r) { r.onchange = function () { colorear(r.value); }; });
      P.querySelectorAll("input[name=" + uid + "B]").forEach(function (r) { r.onchange = function () { ver("osm", r.value === "osm"); ver("sat", r.value === "sat"); }; });
      var R = document.getElementById(uid + "R"); R.oninput = function () { document.getElementById(uid + "D").textContent = this.value == 1 ? "Último día" : "Últimos " + this.value + " días"; m.getSource("focos").setData(focosGeo(+this.value)); };
      ["salud", "policía"].forEach(function (k) { ver("c-" + k, false); });
      var v0 = o.unidad === "municipios" ? "riesgo" : "none"; P.querySelector("input[name=" + uid + "F][value=" + v0 + "]").checked = true; colorear(v0);
    });
    return m;
  }

  /* ---------- salud: línea base SNIS departamental ---------- */
  function snisDep(T, d, el) {
    var sn = T.snis, dk = sn && Object.keys(sn.deps).filter(function (k) { return sn.deps[k] === d; })[0];
    if (!dk) { el.innerHTML = '<p class="nota">Sin línea base SNIS para este departamento.</p>'; return; }
    el.innerHTML = '<div class="xm-b"><label>Enfermedad <select id="snEn">' + Object.keys(sn.d).map(function (e) { return '<option>' + e + '</option>'; }).join("") + '</select></label></div><div class="ch s" id="snCh" style="height:210px"></div><p class="nota">Casos por mes, promedio de los años disponibles del SNIS-VE (2001–2021).</p>';
    function dib() { var e = document.getElementById("snEn").value, Y = sn.d[e], s = Array(12).fill(0), ny = 0; Object.keys(Y).forEach(function (y) { var v = Y[y][dk]; if (v) { ny++; v.forEach(function (x, i) { s[i] += x; }); } }); X.chart("snCh", {tooltip: {trigger: "axis"}, grid: {left: 40, right: 12, top: 10, bottom: 24}, xAxis: {type: "category", data: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]}, yAxis: {type: "value"}, series: [{type: "bar", data: s.map(function (v) { return Math.round(v / (ny || 1)); }), itemStyle: {color: "#1d6fb8"}}]}, 210); }
    document.getElementById("snEn").onchange = dib; dib();
  }

  /* ---------- contexto sectorial INE (solo departamento) ---------- */
  function bloqueSector(T, d) {
    var I = T.ind; if (!I) return "";
    function ult(o, k) { var v = o.datos[k]; if (!v) return null; for (var i = v.length - 1; i >= 0; i--) if (v[i] != null) return {a: o.anios[i], v: v[i]}; return null; }
    var pd = popDep(T, d), pob24 = T.pob && T.pob.departamentos[d] && T.pob.departamentos[d]["2024"], vd = ult(I.parque_automotor, d), dd = ult(I.desmonte_ha, d), x = I.internet.datos[d], t = x ? x.fija + x.inalambrica + x.movil : null, v5 = I.desmonte_ha.datos[d];
    var s5 = v5 ? v5.slice(-5).reduce(function (s, y) { return s + (y || 0); }, 0) : null;
    return '<div class="card"><h2>Contexto sectorial (INE)</h2><div class="cap">Movilidad, conectividad y presión sobre el bosque del departamento.</div>' + tabla(["Indicador", S.esc(d)], [
      ["Parque automotor " + (vd ? vd.a : "") + " (vehículos)", vd ? fmt(vd.v) : SD], ["Vehículos por 1.000 hab. (población " + ANIO + ")", vd && pd ? fmt(vd.v / pd * 1000, 0) : SD],
      ["Conexiones de internet (" + I.internet.periodo + ")", t != null ? fmt(t) : SD], ["Conexiones por 1.000 hab. (ref.: población 2024)", t != null && pob24 ? fmt(t / pob24 * 1000, 0) : SD],
      ["Desmonte autorizado " + (dd ? dd.a : "") + " (ha)", dd ? fmt(dd.v) : SD], ["Desmonte autorizado, últimos 5 años (ha)", s5 != null ? fmt(s5) : SD]]) + '<p class="nota">Fuente: INE (RUAT, ATT, ABT). Conexiones = líneas, no personas. ' + S.esc(I.meta.aviso) + '</p></div>';
  }

  /* ---------- comparación con el nivel superior (plegada, aparte) ---------- */
  function compDep(T, d) {
    var pd = popDep(T, d), pp = popPais(T), kmD = T.DEP[d].reduce(function (s, x) { return s + x.km2; }, 0), kmP = T.lista.reduce(function (s, x) { return s + x.km2; }, 0), nE = T.DEP[d].reduce(function (s, x) { return s + x.est.length; }, 0), nP = T.lista.reduce(function (s, x) { return s + x.est.length; }, 0), a = antD(T, d), ap = antP(T), vp = T.ind && T.ind.parque_automotor.datos.Bolivia;
    var F = [["Población " + ANIO, fmt(pd), fmt(pp)], ["Participación en la población del país", fmt(pd / pp * 100, 1) + " %", "100 %"], ["Densidad (hab/km²)", fmt(pd / kmD, 1), fmt(pp / kmP, 1)], ["Establecimientos de salud por 10.000 hab. (OSM)", fmt(nE / pd * 1e4, 1), fmt(nP / pp * 1e4, 1)], ["Desastres históricos por 100.000 hab.", fmt(a.n / pd * 1e5, 1), fmt(ap.n / pp * 1e5, 1)]];
    if (T.ind && vp) F.push(["Vehículos por 1.000 hab.", paDep(T, d) ? fmt(paDep(T, d) / pd * 1000, 0) : SD, fmt(vp[vp.length - 1] / pp * 1000, 0)]);
    [NBI, EDI].forEach(function (L, i) { var E = i ? T.ed : T.nb; if (E) L.forEach(function (e) { F.push([e[1], v1(E.departamentos[d], e[0]), v1(E.pais, e[0])]); }); });
    return '<details class="card cmp"><summary><b>Comparar con Bolivia</b> <span class="nota">(nivel superior; desplegar solo si lo necesita)</span></summary>' + tabla(["Indicador", S.esc(d), "Bolivia"], F) + '</details>';
  }
  function compMun(T, m) {
    var d = m.d, pd = popDep(T, d), kmD = T.DEP[d].reduce(function (s, x) { return s + x.km2; }, 0), nE = T.DEP[d].reduce(function (s, x) { return s + x.est.length; }, 0), a = antD(T, d), am = antM(T, m.k), F = [["Población " + ANIO, fmt(m.pob), fmt(pd)], ["Participación en la población del departamento", fmt(m.pob / pd * 100, 1) + " %", "100 %"], ["Densidad (hab/km²)", fmt(densidad(m), 1), fmt(pd / kmD, 1)], ["Establecimientos de salud por 10.000 hab. (OSM)", m.pob ? fmt(m.est.length / m.pob * 1e4, 1) : SD, fmt(nE / pd * 1e4, 1)], ["Desastres históricos por 100.000 hab.", m.pob ? fmt(am.n / m.pob * 1e5, 1) : SD, fmt(a.n / pd * 1e5, 1)]];
    if (paM(T, m.k) != null && paDep(T, d)) F.push(["Vehículos por 1.000 hab.", fmt(paM(T, m.k) / m.pob * 1000, 0), fmt(paDep(T, d) / pd * 1000, 0)]);
    [[NBI, T.nb], [EDI, T.ed]].forEach(function (z) { if (z[1]) z[0].forEach(function (e) { F.push([e[1], v1(z[1].municipios[m.k], e[0]), v1(z[1].departamentos[d], e[0])]); }); });
    return '<details class="card cmp"><summary><b>Comparar con el departamento de ' + S.esc(d) + '</b> <span class="nota">(nivel superior; desplegar solo si lo necesita)</span></summary>' + tabla(["Indicador", S.esc(m.n), S.esc(d)], F) + '</details>';
  }

  /* ================= PÁGINA DEPARTAMENTO ================= */
  function paginaBolivia() {
    cargar().then(function (T) {
      estilos(); document.title = "Bolivia por territorios — Sala de Situación Bolivia";
      var app = document.getElementById("app"), I = indices(T), deps = Object.keys(T.DEP).sort(), pobT = T.lista.reduce(function (s, x) { return s + (x.pob || 0); }, 0);
      var rows = deps.map(function (d) { var L = T.DEP[d], LL = L.map(function (x) { return I[x.k]; }), pob = L.reduce(function (s, x) { return s + (x.pob || 0); }, 0) || 1, Rw = LL.reduce(function (s, o) { return s + o.R * (T.M[o.k].pob || 0); }, 0) / pob, cnt = NIVR.map(function (x) { return LL.filter(function (o) { return o.niv[1] === x[1]; }).length; }); return {d: d, pob: pob, Rw: Rw, niv: nivelR(Rw), cnt: cnt, n: L.length, foc: L.reduce(function (s, x) { return s + x.foc; }, 0)}; }).sort(function (a, b) { return b.Rw - a.Rw; });
      var conAv = T.lista.filter(function (m) { return m.av >= 0; }).length, nF = T.lista.reduce(function (s, x) { return s + x.foc; }, 0);
      var h = '<h1 class="th">Bolivia por territorios</h1><div class="cap">Elija un departamento y, dentro de él, un municipio. Cada nivel muestra solo su propia información: mapa por capas, ficha de riesgo y reporte.</div>';
      h += kpis([[fmt(pobT), "habitantes " + ANIO + " (INE)"], [deps.length + " · " + T.lista.length, "departamentos · municipios"], [conAv, "municipios con aviso SENAMHI vigente"], [fmt(nF), "focos de calor, últimos " + T.dias.length + " días"]]);
      h += '<section class="msec"><h2>Departamentos, de mayor a menor riesgo</h2><div class="cap">Riesgo medio ponderado por población (0–10, relativo entre los 339 municipios; por validar con el CCES). La barra cuenta los municipios de cada nivel.</div><div class="dgrid">' + rows.map(function (r) { var alto = r.cnt[3] + r.cnt[4]; return '<a class="dcard" href="departamento.html?d=' + encodeURIComponent(r.d) + '" style="border-top:4px solid ' + r.niv[2] + '"><div class="dh"><b>' + S.esc(r.d) + '</b><span class="chip" style="background:' + r.niv[2] + '">' + fmt(r.Rw, 1) + ' · ' + r.niv[1] + '</span></div><div class="dist" style="height:16px;margin:6px 0">' + NIVR.map(function (x, i) { return r.cnt[i] ? '<span style="flex:' + r.cnt[i] + ';background:' + x[2] + ';line-height:16px;font-size:10px" title="' + x[1] + ': ' + r.cnt[i] + '">' + r.cnt[i] + '</span>' : ""; }).join("") + '</div><div class="dm"><span>' + fmt(r.pob) + ' hab.</span><span>' + r.n + ' municipios</span><span>' + alto + ' en riesgo alto o muy alto</span><span>' + fmt(r.foc) + ' focos 14 d</span></div></a>'; }).join("") + '</div></section>';
      h += '<section class="msec"><h2>Mapa de Bolivia</h2><div class="cap">Capas del sistema y servicios. Los municipios se colorean por riesgo; haga clic en uno para abrir su departamento.</div><div id="tMapa"></div></section>';
      h += '<section class="fch"><h2>Los 15 municipios con mayor riesgo en Bolivia</h2><div class="sub">Haga clic en una barra para abrir el municipio. Índice relativo, por validar con el CCES.</div><div class="ch2" id="bRk" style="height:480px"></div></section>';
      h += '<p class="nota" style="margin-top:14px">Sala de Situación Bolivia · información preliminar de fuentes abiertas (INE, SENAMHI, NASA FIRMS, OpenStreetMap, DesInventar).</p>';
      app.innerHTML = h; barra(T, null, null);
      mapaCapas(T, {el: document.getElementById("tMapa"), bb: unir(T.lista), margen: .3, munis: T.lista, unidad: "municipios", alto: 620, clicTxt: "clic para abrir su departamento", click: function (p) { location.href = "departamento.html?d=" + encodeURIComponent(p.d); }});
      var el = document.getElementById("bRk");
      if (el && window.echarts) {
        var col = tcolor(), ln = "rgba(128,140,160,.35)", top = T.lista.slice().sort(function (a, b) { return I[b.k].R - I[a.k].R; }).slice(0, 15).reverse(), c = echarts.init(el, null, {renderer: "svg"});
        c.setOption({animation: false, textStyle: {color: col}, grid: {left: 210, right: 44, top: 6, bottom: 22}, tooltip: {formatter: function (q) { return "<b>" + S.esc(q.data.n) + "</b> (" + S.esc(q.data.d) + ")<br>Riesgo " + fmt(q.data.value, 1) + " · " + q.data.niv; }}, xAxis: {min: 0, max: 10, splitLine: {lineStyle: {color: ln}}, axisLabel: {color: col}}, yAxis: {type: "category", data: top.map(function (x) { return x.n + " (" + x.d + ")"; }), axisLabel: {color: col, fontSize: 11.5}, axisLine: {lineStyle: {color: ln}}},
          series: [{type: "bar", barWidth: 14, data: top.map(function (x) { var o = I[x.k]; return {n: x.n, d: x.d, niv: o.niv[1], value: +o.R.toFixed(2), itemStyle: {color: o.niv[2], borderRadius: [0, 4, 4, 0]}}; }), label: {show: true, position: "right", color: col, formatter: function (q) { return fmt(q.value, 1); }}}]});
        c.on("click", function (q) { location.href = "municipio.html?d=" + encodeURIComponent(q.data.d) + "&m=" + encodeURIComponent(q.data.n); }); window.addEventListener("resize", function () { c.resize(); });
      }
    });
  }
  function paginaDep(d) { if (!d) { location.replace("mapa.html"); return; }
    cargar().then(function (T) {
      var app = document.getElementById("app"), L = T.DEP[d];
      if (!d || !L) { paginaBolivia(); return; }
      document.title = d + " — Sala de Situación Bolivia";
      var pd = popDep(T, d), km2 = L.reduce(function (s, x) { return s + x.km2; }, 0), nE = L.reduce(function (s, x) { return s + x.est.length; }, 0), nB = L.reduce(function (s, x) { return s + x.bom.length + x.res.length; }, 0), nP = L.reduce(function (s, x) { return s + x.pol.length; }, 0), nF = L.reduce(function (s, x) { return s + x.foc; }, 0), ant = antD(T, d), ev = eventosT(T, d), rec = ev.filter(function (e) { return e.ts > Date.now() - 30 * DIA; }), av = avisosT(T, d, null), sq = T.sq[d];
      var sinE = L.filter(function (x) { return !x.est.length; }), sinB = L.filter(function (x) { return !x.bom.length && !x.res.length; }), sinP = L.filter(function (x) { return !x.pol.length; });
      var h = '<h1 class="th">' + S.esc(d) + '</h1><div class="cap">Departamento: información propia de este nivel. Para ver un municipio, elíjalo en el mapa, en la tabla o en el selector superior.</div>';
      h += kpis([[fmt(pd), "habitantes " + ANIO + " (INE)"], [fmt(km2) + " km²", L.length + " municipios · " + fmt(pd / km2, 1) + " hab/km²"], [av.length, "avisos SENAMHI vigentes"], [rec.length, "eventos del sistema, 30 días"], [fmt(nF), "focos de calor, últimos " + T.dias.length + " días"], [sq && sq.spi3 != null ? sq.spi3.toFixed(2) : "—", "sequía SPI-3" + (sq ? " · " + S.esc(sq.clase3) : "")], [fmt(ant.n), "desastres históricos (" + fmt(ant.m) + " fallecidos)"]]);
      h += '<section class="msec"><h2>Mapa del departamento</h2><div class="cap">Capas del mapa nacional más servicios, a escala departamental. Coloree los municipios por la variable que le interese; haga clic en uno para abrir su ficha.</div><div id="tMapa"></div></section>';
      h += fichaHtml(T, d, null, "p");
      h += '<div class="card"><h2>Municipios</h2><div class="cap">Ordene por la columna que le interese.</div><div class="mb-g" id="ordBtn"></div><div id="tabMun"></div></div>';
      h += '<details class="cmp"><summary>Más información del departamento: servicios, condiciones de vida y salud</summary>';
      h += '<div class="grid g2"><div class="card"><h2>Red de servicios</h2>' + kpis([[nE, "establecimientos de salud (OSM)"], [nB, "bomberos / rescate"], [nP, "policía"]]) + '<p class="nota" style="margin:0">Municipios sin registro en OSM (puede ser vacío de mapeo y no ausencia real): salud <b>' + sinE.length + '</b> · bomberos o rescate <b>' + sinB.length + '</b> · policía <b>' + sinP.length + '</b> de ' + L.length + '.</p></div><div class="card"><h2>Antecedentes de desastres</h2><div class="cap">Tipos más registrados (DesInventar, hasta 2015; con subregistro)</div><div id="chAnt" style="height:220px"></div></div></div>';
      h += '<div class="grid g2"><div class="card"><h2>Condiciones de vida</h2><div class="cap">Censo 2024 (INE). Comparable con 2012 solo en este mismo departamento.</div>' + tabla(["Indicador", "2024", "2012"], filasPropias(T.nb && T.nb.departamentos[d], NBI).concat(filasPropias(T.ed && T.ed.departamentos[d], EDI)).concat([["Índice de Desarrollo Humano (PNUD)", SD, SD]])) + '</div>' + bloqueSector(T, d) + '</div>';
      h += '<div class="card"><h2>Salud: línea base del departamento</h2><div id="tSnis"></div></div>';
      h += '</details>';
      h += '<div class="grid g2"><div class="card"><h2>Avisos SENAMHI vigentes</h2>' + listaAv(av) + '</div><div class="card"><h2>Situación actual</h2>' + listaEv(rec, 8) + '</div></div>';
      h += bloqueReporte(d, null) + compDep(T, d);
      app.innerHTML = h; fichaInit(T, d, null, "p", true); barra(T, d, null); ligarReporte(d, null); barras("chAnt", ant); snisDep(T, d, document.getElementById("tSnis"));
      mapaCapas(T, {el: document.getElementById("tMapa"), bb: unir(L), margen: .05, munis: L, unidad: "municipios", alto: 560, click: function (p) { location.href = "municipio.html?d=" + encodeURIComponent(d) + "&m=" + encodeURIComponent(p.n); }});
      var ORD = [["pob", "Población"], ["dens", "Densidad"], ["nbi", "Pobreza NBI"], ["alf", "Alfabetismo"], ["his", "Desastres hist."], ["foc", "Focos 14 d"], ["est", "Estab. salud"]], sel = "pob";
      function val(x, k) { return k === "pob" ? x.pob || 0 : k === "dens" ? densidad(x) || 0 : k === "nbi" ? ((T.nb && T.nb.municipios[x.k] || {}).nbi24 || 0) : k === "alf" ? ((T.ed && T.ed.municipios[x.k] || {}).alf24 || 0) : k === "his" ? antM(T, x.k).n : k === "foc" ? x.foc : x.est.length; }
      function tab() { document.getElementById("ordBtn").innerHTML = ORD.map(function (o) { return '<button class="btn s' + (o[0] === sel ? " p" : "") + '" data-o="' + o[0] + '">' + o[1] + '</button>'; }).join(""); document.querySelectorAll("#ordBtn button").forEach(function (b) { b.onclick = function () { sel = b.dataset.o; tab(); }; });
        var SL = L.slice().sort(function (a, b) { return val(b, sel) - val(a, sel); }); document.getElementById("tabMun").innerHTML = tabla(["Municipio", "Población " + ANIO, "hab/km²", "Pobreza NBI %", "Alfabet. %", "Desastres hist.", "Focos 14 d", "Salud", "Bomb./resc.", "Policía"], SL.map(function (x) { var nb = (T.nb && T.nb.municipios[x.k]) || {}, ed = (T.ed && T.ed.municipios[x.k]) || {}; return ['<a href="municipio.html?d=' + encodeURIComponent(d) + '&m=' + encodeURIComponent(x.n) + '">' + S.esc(x.n) + '</a>', fmt(x.pob), fmt(densidad(x), 1), nb.nbi24 != null ? fmt(nb.nbi24, 1) : SD, ed.alf24 != null ? fmt(ed.alf24, 1) : SD, antM(T, x.k).n, x.foc, x.est.length, x.bom.length + x.res.length, x.pol.length]; })); }
      tab();
    });
  }

  /* ================= PÁGINA MUNICIPIO ================= */
  function paginaMun(d, n) {
    cargar().then(function (T) {
      var app = document.getElementById("app"), m = T.M[d + "|" + n];
      if (!m) { app.innerHTML = '<div class="card"><p class="vacio">Municipio no encontrado. Vuelva al <a href="' + (d ? "departamento.html?d=" + encodeURIComponent(d) : "departamento.html") + '">departamento</a>.</p></div>'; barra(T, d && T.DEP[d] ? d : "", null); return; }
      document.title = n + " (" + d + ") — Sala de Situación Bolivia";
      var L = T.DEP[d], ce = centroM(m), ant = antM(T, m.k), ev = eventosT(T, d, m), rec = ev.filter(function (e) { return e.ts > Date.now() - 30 * DIA; }), av = avisosT(T, d, m);
      var enM = m.est.filter(esHosp), hp = enM.length ? null : cercano(T.est, ce[0], ce[1], esHosp), bo = cercano(T.emer, ce[0], ce[1], function (p) { return p[3] === "bomberos"; }), re = cercano(T.emer, ce[0], ce[1], function (p) { return p[3] === "rescate"; }), po = cercano(T.emer, ce[0], ce[1], function (p) { return p[3] === "policía"; });
      var pam = paM(T, m.k);
      var h = '<h1 class="th">' + S.esc(n) + ' <small>municipio de ' + S.esc(d) + '</small></h1><div class="cap">Municipio: información propia de este nivel. Lo que falta aparece como <b>sin dato</b>.</div>';
      h += kpis([[fmt(m.pob), "habitantes " + ANIO + " (INE)"], [fmt(m.km2) + " km²", fmt(densidad(m), 1) + " hab/km²"], [av.length, "avisos SENAMHI vigentes"], [m.foc, "focos de calor, últimos " + T.dias.length + " días"], [m.est.length, "establecimientos de salud (OSM)"], [enM.length ? "En el municipio" : hp ? "≈" + Math.round(hp.km) + " km" : "sin dato", "hospital más cercano (línea recta)"], [ant.n, "desastres históricos (DesInventar)"]]);
      h += '<section class="msec"><h2>Mapa del municipio</h2><div class="cap">Capas del mapa nacional más servicios, a escala municipal. El municipio aparece resaltado dentro de su departamento.</div><div id="tMapa"></div></section>';
      h += fichaHtml(T, d, m, "p");
      h += '<details class="cmp"><summary>Más información del municipio: condiciones de vida y servicios</summary>';
      h += '<div class="grid g2"><div class="card"><h2>Condiciones de vida</h2><div class="cap">Censo 2024 (INE) y, cuando existe, Censo 2012.</div>' + tabla(["Indicador", "2024", "2012"], filasPropias(T.nb && T.nb.municipios[m.k], NBI).concat(filasPropias(T.ed && T.ed.municipios[m.k], EDI)).concat([["Vehículos registrados por 1.000 hab. (2025)", pam != null && m.pob ? fmt(pam / m.pob * 1000, 0) : SD, '<span class="nota">—</span>'], ["Índice de Desarrollo Humano (PNUD)", SD, SD]])) + '<p class="nota">NBI = necesidades básicas insatisfechas (método INE).</p></div>';
      function fil(t, x) { return '<tr><td>' + t + '</td><td>' + (x ? S.esc(x.p[2] || "(sin nombre en OSM)") : "sin dato") + '</td><td style="text-align:right">' + (x ? "≈" + Math.round(x.km) + " km" : SD) + '</td></tr>'; }
      function dnt(t, L2, x) { return L2.length ? '<tr><td>' + t + '</td><td>' + S.esc(L2[0][2] || "(sin nombre en OSM)") + '</td><td style="text-align:right">en el municipio</td></tr>' : fil(t, x); }
      h += '<div class="card"><h2>Red de servicios y distancia a la atención</h2><div class="cap">Distancia en <b>línea recta</b> desde el centro aproximado del municipio (no por carretera). Sin lista de establecimientos de referencia con nivel de atención: se usa el hospital más cercano registrado en OSM.</div><table class="tt"><tr><th>Servicio</th><th>Más cercano</th><th style="text-align:right">Distancia</th></tr>' + dnt("Hospital", enM, hp) + dnt("Bomberos", m.bom, bo) + dnt("Rescate", m.res, re) + dnt("Policía", m.pol, po) + '</table>' + kpis([[m.est.length, "establecimientos de salud"], [m.bom.length + m.res.length, "bomberos / rescate"], [m.pol.length, "policía"]]) + '<p class="nota">OpenStreetMap: mapeo voluntario con cobertura incompleta; «0» no significa que no exista.</p></div></div>';
      h += '<div class="card" id="tPerfil"></div>';
      h += '</details>';
      h += '<div class="grid g2"><div class="card"><h2>Avisos SENAMHI vigentes</h2>' + listaAv(av) + '</div><div class="card"><h2>Situación actual</h2>' + listaEv(rec, 8) + '</div></div>';
      h += bloqueReporte(d, m) + compMun(T, m);
      app.innerHTML = h; fichaInit(T, d, m, "p", true); barra(T, d, m); ligarReporte(d, n);
      mapaCapas(T, {el: document.getElementById("tMapa"), bb: m.bb, margen: .3, munis: L, sel: m.k, unidad: "municipios", alto: 540, click: function (p) { if (p.n !== n) location.href = "municipio.html?d=" + encodeURIComponent(d) + "&m=" + encodeURIComponent(p.n); }});
      if (window.PERFIL) PERFIL.render(document.getElementById("tPerfil"), m.f, {D: T.D, sinFicha: 1, sinSnis: 1, sinRecursos: 1});
    });
  }

  /* ================= CONTEXTO PARA EL REPORTE PDF (solo el territorio pedido) ================= */
  function contexto(D, d, mn) {
    return cargar().then(function (T) {
      var m = mn ? T.M[d + "|" + mn] : null, h = "";
      if (mn && !m) return '<p class="nota">Municipio no encontrado.</p>';
      var L = m ? [m] : (T.DEP[d] || []), pob = L.reduce(function (s, x) { return s + (x.pob || 0); }, 0), km2 = L.reduce(function (s, x) { return s + x.km2; }, 0), ant = m ? antM(T, m.k) : antD(T, d);
      var nE = L.reduce(function (s, x) { return s + x.est.length; }, 0), nB = L.reduce(function (s, x) { return s + x.bom.length + x.res.length; }, 0), nP = L.reduce(function (s, x) { return s + x.pol.length; }, 0), nF = L.reduce(function (s, x) { return s + x.foc; }, 0), av = avisosT(T, d, m);
      estilos();
      h += '<h2>Contexto territorial · ' + S.esc(m ? m.n + " (" + d + ")" : d) + '</h2><div class="kpr"><div><b>' + fmt(pob) + '</b><span>habitantes ' + ANIO + ' (INE)</span></div><div><b>' + fmt(km2) + ' km²</b><span>superficie</span></div><div><b>' + fmt(pob / km2, 1) + '</b><span>hab/km²</span></div><div><b>' + nE + '</b><span>establecimientos de salud (OSM)</span></div><div><b>' + nB + ' · ' + nP + '</b><span>bomberos/rescate · policía</span></div><div><b>' + nF + '</b><span>focos de calor, ' + T.dias.length + ' d</span></div><div><b>' + av.length + '</b><span>avisos SENAMHI vigentes</span></div></div>';
      if (av.length) h += '<p class="nota" style="margin:3px 0 0">Avisos vigentes: ' + av.map(function (a) { return S.esc(a.titulo) + " (" + S.esc((a.nivel || "").toLowerCase()) + ")"; }).join("; ") + '.</p>';
      h += fichaHtml(T, d, m, "r");
      h += '<h2>Mapa de riesgo' + (m ? " del municipio y su entorno" : " por municipio") + '</h2>' + svgMapa(T, d, m) + '<div class="nota">Color = nivel del índice de riesgo (relativo entre los 339 municipios del país). ' + (m ? "Los municipios vecinos aparecen atenuados. " : "") + 'Servicios de OpenStreetMap (mapeo voluntario, incompleto).</div>';
      if (m) { var c = centroM(m), hp = cercano(T.est, c[0], c[1], esHosp), bo = cercano(T.emer, c[0], c[1], function (p) { return p[3] === "bomberos" || p[3] === "rescate"; }); h += '<div class="kpr" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))"><div><b>' + (m.est.some(esHosp) ? "En el municipio" : hp ? "≈" + Math.round(hp.km) + " km" : "sin dato") + '</b><span>hospital más cercano' + (hp && !m.est.some(esHosp) ? ": " + S.esc(hp.p[2]) : "") + '</span></div><div><b>' + (m.bom.length || m.res.length ? "En el municipio" : bo ? "≈" + Math.round(bo.km) + " km" : "sin dato") + '</b><span>bomberos o rescate más cercano' + (bo && !(m.bom.length || m.res.length) ? ": " + S.esc(bo.p[2]) : "") + '</span></div></div><div class="nota">Distancias en línea recta desde el centro aproximado del municipio; referenciales.</div>'; }
      h += '<h2>Antecedentes históricos (DesInventar, hasta 2015)</h2><p style="margin:0">' + (ant.n ? fmt(ant.n) + " registro(s) de desastres, " + fmt(ant.m) + " fallecido(s), " + fmt(ant.a) + " afectado(s). Principales: " + topTipos(ant, 5).map(function (t) { return S.esc(t) + " (" + ant.tipos[t] + ")"; }).join(", ") + "." : "Sin antecedentes registrados en DesInventar para este territorio.") + ' <span class="nota">Subregistro probable; la base termina en 2015.</span></p>';
      if (!m || !window.PERFIL) return h;
      var ce = centroM(m);
      return PERFIL.clima(ce[0], ce[1]).then(function (cl) { var z = PERFIL.zona(cl.elev, d, ce[0], ce[1]), A = PERFIL.amenazas(cl, z, d, 0); return h + '<h2>Amenazas que enfrenta el municipio (lectura deducida, por validar con CCES)</h2><p class="nota" style="margin:0 0 3px">Zona: ' + S.esc(z) + ' · altitud ≈' + fmt(cl.elev) + ' m</p><table><tr><th style="width:24%">Amenaza</th><th>Evidencia</th><th>Complicaciones para la salud</th></tr>' + A.map(function (a) { return '<tr><td><b>' + S.esc(a[0]) + '</b></td><td>' + S.esc(a[1]) + '</td><td>' + S.esc(a[2]) + '</td></tr>'; }).join("") + '</table>'; }).catch(function () { return h + '<p class="nota">No se pudo obtener el clima histórico para deducir amenazas.</p>'; });
    });
  }
  /* datos para dibujar el mapa de servicios del reporte (lo dibuja reporte.html con su propio SVG) */
  function datosMapa(d, mn) { return cargar().then(function (T) { var m = mn ? T.M[d + "|" + mn] : null, L = m ? [m] : T.DEP[d] || [], bb = pad(unir(L), m ? .12 : .05), pts = []; T.est.forEach(function (p) { if (p[1] >= bb[0] && p[1] <= bb[2] && p[0] >= bb[1] && p[0] <= bb[3]) pts.push({lat: p[0], lon: p[1], color: COL.salud, sq: 1}); }); T.emer.forEach(function (p) { if (p[1] >= bb[0] && p[1] <= bb[2] && p[0] >= bb[1] && p[0] <= bb[3]) pts.push({lat: p[0], lon: p[1], color: COL[p[3]], tri: p[3] !== "policía", ring: p[3] === "policía"}); }); return {bb: bb, sel: L.map(function (x) { return x.f; }), todos: m ? (T.DEP[d] || []).map(function (x) { return x.f; }) : L.map(function (x) { return x.f; }), pts: pts}; }); }
  function iniciar(d, mn) { return cargar().then(function (T) { fichaInit(T, d, mn ? T.M[d + "|" + mn] : null, "r", false); }); }
  return {pertenece: pertenece, dep: paginaDep, mun: paginaMun, contexto: contexto, datosMapa: datosMapa, cargar: cargar, iniciar: iniciar, api: {indices: indices, NIVR: NIVR, nivelR: nivelR, cenPoly: cenPoly, fmt: fmt, avisosT: avisosT, estilos: estilos}};
})();

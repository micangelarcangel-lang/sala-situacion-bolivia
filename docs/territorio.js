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
    X.header("");
    var nv = document.querySelector(".hdr .nv"); if (nv) nv.style.display = "none";
    var deps = Object.keys(T.DEP).sort(), h = '<nav class="tnav" aria-label="Navegación territorial"><a href="index.html">Bolivia</a>';
    h += '<span class="tsep">›</span>' + (m ? '<a href="departamento.html?d=' + encodeURIComponent(d) + '">' + S.esc(d) + '</a>' : '<b>' + S.esc(d || "Departamentos") + '</b>');
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

  /* ---------- mapa con TODAS las capas del mapa nacional + servicios ---------- */
  var VARS = [
    ["none", "Sin color", null],
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
    var panel = '<div class="card lay" id="' + uid + 'L"><h2>Capas</h2><div class="sec">Servicios (OpenStreetMap)</div>' +
      [["salud", "Salud"], ["bomberos", "Bomberos"], ["rescate", "Rescate"], ["policía", "Policía"]].map(function (x) { return '<label><input type="checkbox" data-c="' + x[0] + '" checked><i class="dot" style="background:' + COL[x[0]] + '"></i>' + x[1] + ' <span class="nota">(' + nF[x[0]] + ')</span></label>'; }).join("") +
      '<div class="sec">Incendios (NASA FIRMS)</div><label><input type="checkbox" data-c="heat" checked> Mapa de calor de focos</label><label><input type="checkbox" data-c="comp" checked> Complejos de incendio <span class="nota">(' + cap.comp.features.length + ')</span></label><div class="nota" id="' + uid + 'D">Últimos ' + Math.min(3, T.dias.length) + ' días</div><input type="range" id="' + uid + 'R" min="1" max="' + Math.max(1, T.dias.length) + '" value="' + Math.min(3, Math.max(1, T.dias.length)) + '">' +
      '<div class="sec">Otros eventos</div><label><input type="checkbox" data-c="sis" checked> Sismos <span class="nota">(' + cap.sis.features.length + ')</span></label><label><input type="checkbox" data-c="rio" checked> Ríos (GloFAS) <span class="nota">(' + cap.rio.features.length + ')</span></label><label><input type="checkbox" data-c="evs" checked> Otros eventos con ubicación <span class="nota">(' + cap.evs.features.length + ')</span></label>' +
      '<div class="sec">Colorear ' + o.unidad + ' por</div>' + VARS.map(function (v, i) { return '<label><input type="radio" name="' + uid + 'F" value="' + v[0] + '"' + (i === 0 ? " checked" : "") + '> ' + v[1] + '</label>'; }).join("") +
      '<div class="sec">Mapa base</div><label><input type="radio" name="' + uid + 'B" value="osm" checked> Calles y relieve (OSM)</label><label><input type="radio" name="' + uid + 'B" value="sat"> Imagen satelital (Esri)</label><label><input type="radio" name="' + uid + 'B" value="none"> Sin mapa base</label>' +
      '<div class="leg" id="' + uid + 'G"></div><p class="nota">Red vial y ríos del mapa topográfico: siguiente fase.</p></div>';
    var html = '<div class="maplayout">' + panel + '<div class="card" style="padding:10px"><div class="map" id="' + uid + 'M" style="height:' + o.alto + 'px"></div></div></div>';
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
      if (!v[2]) { m.setPaintProperty("mun-f", "fill-color", "#1d6fb8"); m.setPaintProperty("mun-f", "fill-opacity", ["case", ["==", ["get", "sel"], 1], .22, .06]); return; }
      if (v[3] === "aviso") { m.setPaintProperty("mun-f", "fill-color", ["match", ["round", ["coalesce", ["get", "v"], -1]], 0, "#bfe5c9", 1, "#f9dc6b", 2, "#f7a15e", 3, "#e5576a", "rgba(0,0,0,0)"]); m.setPaintProperty("mun-f", "fill-opacity", .75); g.innerHTML = ["#bfe5c9", "#f9dc6b", "#f7a15e", "#e5576a"].map(function (c, i) { return '<span><i style="background:' + c + '"></i>Aviso ' + S.NIVTXT[i].toLowerCase() + '</span>'; }).join("") + '<span class="nota">Sin color = sin aviso vigente</span>'; return; }
      if (mx <= mn) mx = mn + 1;
      m.setPaintProperty("mun-f", "fill-color", ["case", ["==", ["typeof", ["get", "v"]], "number"], ["interpolate", ["linear"], ["get", "v"], mn, "#e8eef7", mx, "#08306b"], "#cfd6df"]); m.setPaintProperty("mun-f", "fill-opacity", .75);
      var a = v[3] === "raiz" ? mn * mn : mn, b = v[3] === "raiz" ? mx * mx : mx; g.innerHTML = '<span><i style="background:linear-gradient(90deg,#e8eef7,#08306b)"></i>' + fmt(a, v[3] === "lin" ? 1 : 0) + ' → ' + fmt(b, v[3] === "lin" ? 1 : 0) + ' ' + v[4] + '</span><span><i style="background:#cfd6df"></i>sin dato</span>';
    }
    m.on("load", function () {
      m.addSource("mun", {type: "geojson", data: geo});
      m.addLayer({id: "mun-f", type: "fill", source: "mun", paint: {"fill-color": "#1d6fb8", "fill-opacity": ["case", ["==", ["get", "sel"], 1], .22, .06]}});
      m.addLayer({id: "mun-l", type: "line", source: "mun", paint: {"line-color": "#0b3b6e", "line-width": ["case", ["==", ["get", "sel"], 1], 3, .8], "line-opacity": .85}});
      m.addSource("focos", {type: "geojson", data: focosGeo(Math.min(3, T.dias.length) || 1)});
      m.addLayer({id: "heat", type: "heatmap", source: "focos", paint: {"heatmap-weight": ["interpolate", ["linear"], ["get", "frp"], 0, .3, 50, 1], "heatmap-intensity": 1.2, "heatmap-radius": 22, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(254,178,76,0)", .3, "#feb24c", .6, "#f03b20", 1, "#7a0026"]}});
      m.addLayer({id: "focoPt", type: "circle", source: "focos", minzoom: 8, paint: {"circle-radius": 4, "circle-color": "#f03b20", "circle-stroke-color": "#fff", "circle-stroke-width": 1}});
      Object.keys(cap).forEach(function (k) {
        m.addSource("c-" + k, {type: "geojson", data: cap[k]});
        var paint = {"circle-opacity": .92, "circle-stroke-color": "#fff", "circle-stroke-width": 1.2};
        if (COL[k]) { paint["circle-radius"] = k === "salud" || k === "policía" ? 3.5 : 6; paint["circle-color"] = COL[k]; }
        else if (k === "sis") { paint["circle-radius"] = ["interpolate", ["linear"], ["get", "mag"], 2, 4, 6, 18]; paint["circle-color"] = ["interpolate", ["linear"], ["get", "p"], 0, "#d7263d", 100, "#f5b700", 300, "#2a7fd1"]; }
        else if (k === "rio") { paint["circle-radius"] = 8; paint["circle-color"] = ["match", ["get", "v"], 0, "#2a9d8f", 1, "#f5b700", 2, "#f26a1b", "#d7263d"]; paint["circle-stroke-width"] = 2; }
        else if (k === "comp") { paint["circle-radius"] = ["interpolate", ["linear"], ["get", "n"], 8, 7, 120, 20]; paint["circle-color"] = "rgba(215,38,61,.15)"; paint["circle-stroke-color"] = "#d7263d"; paint["circle-stroke-width"] = 2.5; }
        else if (k === "evs") { paint["circle-radius"] = 6.5; paint["circle-color"] = ["get", "c"]; }
        m.addLayer({id: "c-" + k, type: "circle", source: "c-" + k, paint: paint}); pop("c-" + k);
      });
      pop("focoPt");
      m.on("mousemove", "mun-f", function (e) { if (m.queryRenderedFeatures(e.point).some(function (f) { return /^c-|^focoPt/.test(f.layer.id); })) { popup.remove(); return; } var p = e.features[0].properties; m.getCanvas().style.cursor = o.click ? "pointer" : ""; popup.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + S.esc(p.n) + '</b>' + S.esc(p.txt && p.txt !== "" ? p.txt : "") + (o.click ? ' · clic para abrir' : "") + '</div>').addTo(m); });
      m.on("mouseleave", "mun-f", function () { popup.remove(); });
      if (o.click) m.on("click", "mun-f", function (e) { if (m.queryRenderedFeatures(e.point).some(function (f) { return /^c-|^focoPt/.test(f.layer.id); })) return; o.click(e.features[0].properties); });
      var P = document.getElementById(uid + "L");
      P.querySelectorAll("input[data-c]").forEach(function (i) { i.onchange = function () { var c = i.dataset.c; if (c === "heat") { ver("heat", i.checked); ver("focoPt", i.checked); } else ver("c-" + c, i.checked); }; });
      P.querySelectorAll("input[name=" + uid + "F]").forEach(function (r) { r.onchange = function () { colorear(r.value); }; });
      P.querySelectorAll("input[name=" + uid + "B]").forEach(function (r) { r.onchange = function () { ver("osm", r.value === "osm"); ver("sat", r.value === "sat"); }; });
      var R = document.getElementById(uid + "R"); R.oninput = function () { document.getElementById(uid + "D").textContent = this.value == 1 ? "Último día" : "Últimos " + this.value + " días"; m.getSource("focos").setData(focosGeo(+this.value)); };
      colorear("none");
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
  function paginaDep(d) {
    cargar().then(function (T) {
      var app = document.getElementById("app"), L = T.DEP[d];
      if (!d || !L) { app.innerHTML = '<div class="card"><h2>Departamentos de Bolivia</h2><div class="mb-g">' + Object.keys(T.DEP).sort().map(function (x) { return '<a class="btn" href="departamento.html?d=' + encodeURIComponent(x) + '">' + S.esc(x) + '</a>'; }).join("") + '</div></div>'; barra(T, "", null); return; }
      document.title = d + " — Sala de Situación Bolivia";
      var pd = popDep(T, d), km2 = L.reduce(function (s, x) { return s + x.km2; }, 0), nE = L.reduce(function (s, x) { return s + x.est.length; }, 0), nB = L.reduce(function (s, x) { return s + x.bom.length + x.res.length; }, 0), nP = L.reduce(function (s, x) { return s + x.pol.length; }, 0), nF = L.reduce(function (s, x) { return s + x.foc; }, 0), ant = antD(T, d), ev = eventosT(T, d), rec = ev.filter(function (e) { return e.ts > Date.now() - 30 * DIA; }), av = avisosT(T, d, null), sq = T.sq[d];
      var sinE = L.filter(function (x) { return !x.est.length; }), sinB = L.filter(function (x) { return !x.bom.length && !x.res.length; }), sinP = L.filter(function (x) { return !x.pol.length; });
      var h = '<h1 class="th">' + S.esc(d) + '</h1><div class="cap">Departamento: información propia de este nivel. Para ver un municipio, elíjalo en el mapa, en la tabla o en el selector superior.</div>';
      h += kpis([[fmt(pd), "habitantes " + ANIO + " (INE)"], [fmt(km2) + " km²", L.length + " municipios · " + fmt(pd / km2, 1) + " hab/km²"], [av.length, "avisos SENAMHI vigentes"], [rec.length, "eventos del sistema, 30 días"], [fmt(nF), "focos de calor, últimos " + T.dias.length + " días"], [sq && sq.spi3 != null ? sq.spi3.toFixed(2) : "—", "sequía SPI-3" + (sq ? " · " + S.esc(sq.clase3) : "")], [fmt(ant.n), "desastres históricos (" + fmt(ant.m) + " fallecidos)"]]);
      h += '<section class="msec"><h2>Mapa del departamento</h2><div class="cap">Capas del mapa nacional más servicios, a escala departamental. Coloree los municipios por la variable que le interese; haga clic en uno para abrir su ficha.</div><div id="tMapa"></div></section>';
      h += '<div class="card"><h2>Municipios</h2><div class="cap">Ordene por la columna que le interese.</div><div class="mb-g" id="ordBtn"></div><div id="tabMun"></div></div>';
      h += '<div class="grid g2"><div class="card"><h2>Red de servicios</h2>' + kpis([[nE, "establecimientos de salud (OSM)"], [nB, "bomberos / rescate"], [nP, "policía"]]) + '<p class="nota" style="margin:0">Municipios sin registro en OSM (puede ser vacío de mapeo y no ausencia real): salud <b>' + sinE.length + '</b> · bomberos o rescate <b>' + sinB.length + '</b> · policía <b>' + sinP.length + '</b> de ' + L.length + '.</p></div><div class="card"><h2>Antecedentes de desastres</h2><div class="cap">Tipos más registrados (DesInventar, hasta 2015; con subregistro)</div><div id="chAnt" style="height:220px"></div></div></div>';
      h += '<div class="grid g2"><div class="card"><h2>Condiciones de vida</h2><div class="cap">Censo 2024 (INE). Comparable con 2012 solo en este mismo departamento.</div>' + tabla(["Indicador", "2024", "2012"], filasPropias(T.nb && T.nb.departamentos[d], NBI).concat(filasPropias(T.ed && T.ed.departamentos[d], EDI)).concat([["Índice de Desarrollo Humano (PNUD)", SD, SD]])) + '</div>' + bloqueSector(T, d) + '</div>';
      h += '<div class="card"><h2>Salud: línea base del departamento</h2><div id="tSnis"></div></div>';
      h += '<div class="grid g2"><div class="card"><h2>Avisos SENAMHI vigentes</h2>' + listaAv(av) + '</div><div class="card"><h2>Situación actual</h2>' + listaEv(rec, 8) + '</div></div>';
      h += bloqueReporte(d, null) + compDep(T, d);
      app.innerHTML = h; barra(T, d, null); ligarReporte(d, null); barras("chAnt", ant); snisDep(T, d, document.getElementById("tSnis"));
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
      h += '<div class="grid g2"><div class="card"><h2>Condiciones de vida</h2><div class="cap">Censo 2024 (INE) y, cuando existe, Censo 2012.</div>' + tabla(["Indicador", "2024", "2012"], filasPropias(T.nb && T.nb.municipios[m.k], NBI).concat(filasPropias(T.ed && T.ed.municipios[m.k], EDI)).concat([["Vehículos registrados por 1.000 hab. (2025)", pam != null && m.pob ? fmt(pam / m.pob * 1000, 0) : SD, '<span class="nota">—</span>'], ["Índice de Desarrollo Humano (PNUD)", SD, SD]])) + '<p class="nota">NBI = necesidades básicas insatisfechas (método INE).</p></div>';
      function fil(t, x) { return '<tr><td>' + t + '</td><td>' + (x ? S.esc(x.p[2] || "(sin nombre en OSM)") : "sin dato") + '</td><td style="text-align:right">' + (x ? "≈" + Math.round(x.km) + " km" : SD) + '</td></tr>'; }
      function dnt(t, L2, x) { return L2.length ? '<tr><td>' + t + '</td><td>' + S.esc(L2[0][2] || "(sin nombre en OSM)") + '</td><td style="text-align:right">en el municipio</td></tr>' : fil(t, x); }
      h += '<div class="card"><h2>Red de servicios y distancia a la atención</h2><div class="cap">Distancia en <b>línea recta</b> desde el centro aproximado del municipio (no por carretera). Sin lista de establecimientos de referencia con nivel de atención: se usa el hospital más cercano registrado en OSM.</div><table class="tt"><tr><th>Servicio</th><th>Más cercano</th><th style="text-align:right">Distancia</th></tr>' + dnt("Hospital", enM, hp) + dnt("Bomberos", m.bom, bo) + dnt("Rescate", m.res, re) + dnt("Policía", m.pol, po) + '</table>' + kpis([[m.est.length, "establecimientos de salud"], [m.bom.length + m.res.length, "bomberos / rescate"], [m.pol.length, "policía"]]) + '<p class="nota">OpenStreetMap: mapeo voluntario con cobertura incompleta; «0» no significa que no exista.</p></div></div>';
      h += '<div class="card" id="tPerfil"></div>';
      h += '<div class="grid g2"><div class="card"><h2>Avisos SENAMHI vigentes</h2>' + listaAv(av) + '</div><div class="card"><h2>Situación actual</h2>' + listaEv(rec, 8) + '</div></div>';
      h += bloqueReporte(d, m) + compMun(T, m);
      app.innerHTML = h; barra(T, d, m); ligarReporte(d, n);
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
      h += '<h2>Contexto territorial · ' + S.esc(m ? m.n + " (" + d + ")" : d) + '</h2><table><tr><th>Habitantes ' + ANIO + ' (INE)</th><th>Superficie</th><th>Densidad</th><th>Estab. de salud (OSM)</th><th>Bomberos/rescate</th><th>Policía</th><th>Focos ' + T.dias.length + ' d</th><th>Avisos SENAMHI</th></tr><tr><td>' + fmt(pob) + '</td><td>' + fmt(km2) + ' km²</td><td>' + fmt(pob / km2, 1) + ' hab/km²</td><td>' + nE + '</td><td>' + nB + '</td><td>' + nP + '</td><td>' + nF + '</td><td>' + av.length + '</td></tr></table>';
      if (av.length) h += '<p class="nota" style="margin:3px 0 0">Avisos vigentes: ' + av.map(function (a) { return S.esc(a.titulo) + " (" + S.esc((a.nivel || "").toLowerCase()) + ")"; }).join("; ") + '.</p>';
      h += '<div id="mapaTerr"></div>';
      if (m) { var c = centroM(m), hp = cercano(T.est, c[0], c[1], esHosp), bo = cercano(T.emer, c[0], c[1], function (p) { return p[3] === "bomberos" || p[3] === "rescate"; }); h += '<p style="margin:4px 0 0">Hospital más cercano al centro del municipio: <b>' + (m.est.some(esHosp) ? "dentro del municipio" : hp ? S.esc(hp.p[2]) + ", ≈" + Math.round(hp.km) + " km en línea recta" : "sin dato") + '</b>. Bomberos o rescate más cercano: <b>' + (m.bom.length || m.res.length ? "dentro del municipio" : bo ? S.esc(bo.p[2]) + ", ≈" + Math.round(bo.km) + " km" : "sin dato") + '</b>. <span class="nota">Distancias en línea recta, referenciales.</span></p>'; }
      else {
        var top = L.filter(function (x) { return T.nb && T.nb.municipios[x.k]; }).sort(function (a, b) { return T.nb.municipios[b.k].nbi24 - T.nb.municipios[a.k].nbi24; }).slice(0, 8);
        h += '<h2>Municipios de mayor pobreza por NBI</h2><table><tr><th>Municipio</th><th style="width:90px">Población</th><th style="width:90px">NBI %</th><th style="width:100px">Alfabet. %</th><th style="width:100px">Estab. salud</th></tr>' + top.map(function (x) { return '<tr><td>' + S.esc(x.n) + '</td><td style="text-align:right">' + fmt(x.pob) + '</td><td style="text-align:right">' + fmt(T.nb.municipios[x.k].nbi24, 1) + '</td><td style="text-align:right">' + v1(T.ed && T.ed.municipios[x.k], "alf24") + '</td><td style="text-align:right">' + x.est.length + '</td></tr>'; }).join("") + '</table><p class="nota" style="margin:2px 0 0">Municipios del departamento sin establecimiento de salud registrado en OSM: ' + L.filter(function (x) { return !x.est.length; }).length + ' de ' + L.length + ' (puede ser vacío de mapeo).</p>';
      }
      h += '<h2>Condiciones de vida (Censo 2024, INE)</h2>' + '<table><tr><th>Indicador</th><th style="width:90px;text-align:right">2024</th><th style="width:90px;text-align:right">2012</th></tr>' + filasPropias(m ? T.nb && T.nb.municipios[m.k] : T.nb && T.nb.departamentos[d], NBI).concat(filasPropias(m ? T.ed && T.ed.municipios[m.k] : T.ed && T.ed.departamentos[d], EDI)).map(function (f) { return '<tr><td>' + f[0] + '</td><td style="text-align:right">' + f[1] + '</td><td style="text-align:right">' + f[2] + '</td></tr>'; }).join("") + '</table><p class="nota" style="margin:2px 0 0">IDH (PNUD): sin dato.</p>';
      h += '<h2>Antecedentes históricos (DesInventar, hasta 2015)</h2><p style="margin:0">' + (ant.n ? fmt(ant.n) + " registro(s) de desastres, " + fmt(ant.m) + " fallecido(s), " + fmt(ant.a) + " afectado(s). Principales: " + topTipos(ant, 5).map(function (t) { return S.esc(t) + " (" + ant.tipos[t] + ")"; }).join(", ") + "." : "Sin antecedentes registrados en DesInventar para este territorio.") + ' <span class="nota">Subregistro probable; la base termina en 2015.</span></p>';
      if (!m || !window.PERFIL) return h;
      var ce = centroM(m);
      return PERFIL.clima(ce[0], ce[1]).then(function (cl) { var z = PERFIL.zona(cl.elev, d, ce[0], ce[1]), A = PERFIL.amenazas(cl, z, d, 0); return h + '<h2>Amenazas que enfrenta el municipio (lectura deducida, por validar con CCES)</h2><p class="nota" style="margin:0 0 3px">Zona: ' + S.esc(z) + ' · altitud ≈' + fmt(cl.elev) + ' m</p><table><tr><th style="width:24%">Amenaza</th><th>Evidencia</th><th>Complicaciones para la salud</th></tr>' + A.map(function (a) { return '<tr><td><b>' + S.esc(a[0]) + '</b></td><td>' + S.esc(a[1]) + '</td><td>' + S.esc(a[2]) + '</td></tr>'; }).join("") + '</table>'; }).catch(function () { return h + '<p class="nota">No se pudo obtener el clima histórico para deducir amenazas.</p>'; });
    });
  }
  /* datos para dibujar el mapa de servicios del reporte (lo dibuja reporte.html con su propio SVG) */
  function datosMapa(d, mn) { return cargar().then(function (T) { var m = mn ? T.M[d + "|" + mn] : null, L = m ? [m] : T.DEP[d] || [], bb = pad(unir(L), m ? .12 : .05), pts = []; T.est.forEach(function (p) { if (p[1] >= bb[0] && p[1] <= bb[2] && p[0] >= bb[1] && p[0] <= bb[3]) pts.push({lat: p[0], lon: p[1], color: COL.salud, sq: 1}); }); T.emer.forEach(function (p) { if (p[1] >= bb[0] && p[1] <= bb[2] && p[0] >= bb[1] && p[0] <= bb[3]) pts.push({lat: p[0], lon: p[1], color: COL[p[3]], tri: p[3] !== "policía", ring: p[3] === "policía"}); }); return {bb: bb, sel: L.map(function (x) { return x.f; }), todos: m ? (T.DEP[d] || []).map(function (x) { return x.f; }) : L.map(function (x) { return x.f; }), pts: pts}; }); }
  return {pertenece: pertenece, dep: paginaDep, mun: paginaMun, contexto: contexto, datosMapa: datosMapa, cargar: cargar};
})();

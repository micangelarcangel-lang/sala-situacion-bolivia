/* Perfil de riesgo municipal: población, clima 1991-2020 (ERA5), amenazas por zona, antecedentes y recursos cercanos */
var PERFIL = (function () {
  var S = SALA, X = S2, C = {}, MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function jget(u) { return C[u] || (C[u] = fetch(u).then(function (r) { return r.json(); }).catch(function () { return null; })); }
  function hav(a, b, c, d) { var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, q = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 12742 * Math.asin(Math.sqrt(q)); }
  function polys(g) { return g.type === "Polygon" ? [g.coordinates] : g.coordinates; }
  function area(g) { var t = 0; polys(g).forEach(function (p) { p.forEach(function (r, i) { var a = 0, k = 111.32 * Math.cos(r[0][1] * Math.PI / 180); for (var j = 0; j < r.length - 1; j++) a += r[j][0] * k * r[j + 1][1] * 111.32 - r[j + 1][0] * k * r[j][1] * 111.32; a = Math.abs(a / 2); t += i === 0 ? a : -a; }); }); return t; }
  function centro(g) { var b = [180, 90, -180, -90]; polys(g).forEach(function (p) { p[0].forEach(function (c) { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; }); }); return [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2]; }
  function fmt(n) { return Math.round(n).toLocaleString("es-BO"); }
  /* ---- clima 1991-2020 desde Open-Meteo (reanálisis ERA5); se guarda solo el resumen ---- */
  function clima(lat, lon) {
    var k = "perfilclima:" + lat.toFixed(2) + "," + lon.toFixed(2);
    try { var c = JSON.parse(localStorage.getItem(k)); if (c && c.v === 2) return Promise.resolve(c); } catch (e) {}
    var u = "https://archive-api.open-meteo.com/v1/archive?latitude=" + lat.toFixed(3) + "&longitude=" + lon.toFixed(3) + "&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America%2FLa_Paz";
    function get(n) { return fetch(u).then(function (r) { if (r.status === 429 && n < 2) return new Promise(function (ok) { setTimeout(ok, 20000); }).then(function () { return get(n + 1); }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); }
    return get(0).then(function (j) {
      var d = j.daily, tx = Array(12).fill(0), tn = Array(12).fill(0), pr = Array(12).fill(0), nm = Array(12).fill(0), hel = 0, cal = 0, mx = 0, an = {};
      d.time.forEach(function (t, i) { var m = +t.slice(5, 7) - 1, y = t.slice(0, 4), a = d.temperature_2m_max[i], b = d.temperature_2m_min[i], p = d.precipitation_sum[i]; if (a == null) return; tx[m] += a; tn[m] += b; pr[m] += p || 0; nm[m]++; if (b < 0) hel++; if (a >= 35) cal++; if ((p || 0) > mx) mx = p; an[y] = (an[y] || 0) + (p || 0); });
      var yrs = Object.keys(an).length || 30, o = {v: 2, elev: j.elevation, tx: tx.map(function (v, i) { return v / (nm[i] || 1); }), tn: tn.map(function (v, i) { return v / (nm[i] || 1); }), pr: pr.map(function (v) { return v / yrs; }), hel: hel / yrs, cal: cal / yrs, mx: mx, pa: pr.reduce(function (a, b) { return a + b; }, 0) / yrs};
      try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} return o;
    });
  }
  /* ---- tipo de zona: regla simple por altitud, departamento y ubicación (por validar) ---- */
  function zona(el, dep, lat, lon) {
    if (el >= 3500) return "Altiplano / puna";
    if (el >= 2500) return "Valle alto / altiplano bajo";
    if (el >= 1500) return "Valle";
    if (el >= 500 && ["La Paz", "Cochabamba", "Santa Cruz", "Chuquisaca", "Tarija"].indexOf(dep) >= 0) return "Subandino / yungas";
    if (dep === "Beni" || dep === "Pando" || (dep === "La Paz" && lat > -15)) return "Llanura amazónica";
    if (lat < -19.5 && lon > -64.5) return "Chaco";
    if (dep === "Santa Cruz") return "Chiquitania / llanura cruceña";
    return "Zona de transición";
  }
  function amenazas(c, z, dep, nSis) {
    var L = [], seco = c.pr.filter(function (v) { return v < 40; }).length, mesLl = c.pr.indexOf(Math.max.apply(0, c.pr)), baja = c.elev < 1500, ll = c.pa;
    if (c.hel >= 15) L.push(["Heladas", "≈" + Math.round(c.hel) + " días al año con temperatura mínima bajo 0 °C", "Infecciones respiratorias agudas, hipotermia, afectación de cultivos y seguridad alimentaria"]);
    if (c.elev >= 2800 && ll < 600) L.push(["Sequía y granizo", "Lluvia anual ≈" + fmt(ll) + " mm en zona alta", "Inseguridad alimentaria, desnutrición, escasez de agua segura"]);
    if (c.elev < 800 && ll > 1100) L.push(["Inundación y crecida de ríos", "Zona baja (" + fmt(c.elev) + " m) con lluvia anual ≈" + fmt(ll) + " mm; mes más lluvioso: " + MES[mesLl], "Diarreas, leptospirosis, dengue posterior, aislamiento de comunidades"]);
    if (c.elev >= 500 && c.elev < 3200 && ll > 800) L.push(["Deslizamientos y mazamorras", "Zona de relieve con lluvia anual ≈" + fmt(ll) + " mm; mes más lluvioso: " + MES[mesLl], "Traumatismos, aislamiento, daño a servicios de salud"]);
    if (baja && seco >= 3) L.push(["Incendios forestales y de pastizal", seco + " meses secos al año (< 40 mm) en zona baja", "Infecciones respiratorias, descompensación de asma y EPOC, quemaduras"]);
    if (baja && c.tn.reduce(function (a, b) { return a + b; }, 0) / 12 > 16) L.push(["Dengue y otras arbovirosis", "Zona baja y cálida (T mínima media " + (c.tn.reduce(function (a, b) { return a + b; }, 0) / 12).toFixed(0) + " °C)" + (z === "Llanura amazónica" || z === "Subandino / yungas" ? ". También malaria" : ""), "Dengue, chikungunya, zika" + (z === "Llanura amazónica" || z === "Subandino / yungas" ? ", malaria" : "")]);
    if (c.cal >= 15) L.push(["Olas de calor", "≈" + Math.round(c.cal) + " días al año con máxima ≥ 35 °C", "Golpe de calor, deshidratación, descompensación de enfermedades crónicas"]);
    if (nSis) L.push(["Sismos", nSis + " sismo(s) registrados a ≤150 km en el historial del sistema (desde octubre de 2026)", "Lesionados, daño a establecimientos de salud"]);
    return L;
  }
  function render(el, f, o) {
    var D = o.D, n = f.properties.n, dep = f.properties.d, key = dep + "|" + n, ce = centro(f.geometry);
    el.innerHTML = '<h2>Perfil de riesgo del municipio</h2><div class="cap">Qué amenazas enfrenta ' + S.esc(n) + ' según su ubicación, clima y los antecedentes disponibles. Lectura deducida de datos, <b>por validar con el CCES</b>.</div><div id="pfB" class="nota" style="margin-top:8px">Calculando el perfil…</div>';
    Promise.all([jget("poblacion_mun.json"), jget("establecimientos_salud.json"), jget("servicios_emergencia.json"), jget("linea_base_snis.json"), clima(ce[0], ce[1]).catch(function (e) { return {error: e.message}; })]).then(function (r) {
      var pob = r[0], est = r[1], emer = r[2], snis = r[3], c = r[4], p = pob && pob.municipios[key], anio = Math.min(2034, new Date().getFullYear()), ar = area(f.geometry), h = '';
      var sis = ((D.sismos_oficiales || {}).sismos || []).filter(function (s) { return hav(ce[0], ce[1], s.lat, s.lon) <= 150; });
      /* 1 ficha */
      h += '<h4 class="xm-t">1. Ficha del municipio</h4><div class="xm-k"><div><b>' + (p ? fmt(p.est[anio]) : "—") + '</b><span>habitantes ' + anio + ' (INE)</span></div><div><b>' + fmt(ar) + ' km²</b><span>superficie</span></div><div><b>' + (p ? (p.est[anio] / ar).toFixed(1) : "—") + '</b><span>hab/km²</span></div>' + (c.error ? '' : '<div><b>' + fmt(c.elev) + ' m</b><span>altitud del centro</span></div>') + '</div>';
      var z = c.error ? "" : zona(c.elev, dep, ce[0], ce[1]);
      if (z) h += '<p class="nota" style="margin:4px 0 0">Tipo de zona (regla por altitud y ubicación): <b>' + z + '</b></p>';
      /* 2 clima */
      if (c.error) h += '<h4 class="xm-t">2. Clima del lugar</h4><p class="nota">No se pudo obtener el clima histórico ahora (' + S.esc(c.error) + '). Reintente en unos minutos.</p>';
      else h += '<h4 class="xm-t">2. Clima del lugar (promedio 1991–2020)</h4><div class="ch s" id="pfCh" style="height:230px"></div><div class="xm-k"><div><b>' + fmt(c.pa) + ' mm</b><span>lluvia anual</span></div><div><b>' + Math.round(c.hel) + '</b><span>días/año T mín &lt; 0 °C</span></div><div><b>' + Math.round(c.cal) + '</b><span>días/año T máx ≥ 35 °C</span></div><div><b>' + Math.round(c.mx) + ' mm</b><span>lluvia máxima en un día</span></div></div><p class="nota" style="margin:2px 0 0">Reanálisis ERA5 (Open-Meteo), celda de ~25 km en el centro del municipio: no son datos de una estación SENAMHI.</p>';
      /* 3 amenazas */
      if (!c.error) { var A = amenazas(c, z, dep, sis.length); h += '<h4 class="xm-t">3. Amenazas propias de la zona</h4>' + (A.length ? '<table><tr><th>Amenaza</th><th>Por qué</th><th>Complicaciones para la salud</th></tr>' + A.map(function (a) { return '<tr><td><b>' + a[0] + '</b></td><td>' + a[1] + '</td><td>' + a[2] + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Con las reglas aplicadas no se identifican amenazas dominantes por clima o ubicación.</p>') + '<p class="nota" style="margin:2px 0 0">Se deducen de clima y altitud con reglas del sistema; no son un registro de desastres ocurridos. Faltan pendiente y cercanía a ríos.</p>'; }
      /* 4 antecedentes */
      h += '<h4 class="xm-t">4. Antecedentes disponibles</h4>';
      var dk = snis && Object.keys(snis.deps).filter(function (k) { return snis.deps[k] === dep; })[0];
      h += '<p class="nota" style="margin:0 0 4px">Eventos del sistema: solo desde el 22/10/2026 (ver la sección superior). Los registros históricos de desastres por municipio (DesInventar, VIDECI) aún no están cargados.</p>';
      if (sis.length) h += '<p style="margin:0 0 4px"><b>Sismos a ≤150 km:</b> ' + sis.length + ' · mayor M ' + Math.max.apply(0, sis.map(function (s) { return s.mag; })).toFixed(1) + '</p>';
      if (dk) h += '<div class="xm-b"><label>Enfermedad (SNIS, departamento de ' + S.esc(dep) + ') <select id="pfEn">' + Object.keys(snis.d).map(function (e) { return '<option>' + e + '</option>'; }).join("") + '</select></label></div><div class="ch s" id="pfSn" style="height:200px"></div><p class="nota" style="margin:2px 0 0">Casos por mes, promedio de los años disponibles en el SNIS-VE (2001–2021). Es dato departamental, no municipal.</p>';
      /* 5 recursos */
      function cerca(L, f2) { return (L || []).filter(f2 || function () { return true; }).map(function (q) { return {n: q[2] || "(sin nombre)", t: q[3], km: hav(ce[0], ce[1], q[0], q[1])}; }).sort(function (a, b) { return a.km - b.km; }); }
      var SA = cerca(est && est.puntos), BO = cerca(emer && emer.puntos, function (q) { return q[3] !== "policía"; }), PO = cerca(emer && emer.puntos, function (q) { return q[3] === "policía"; });
      function lst(t, L) { return '<div><b>' + t + '</b>' + (L.length ? '<table>' + L.slice(0, 3).map(function (q) { return '<tr><td>' + S.esc(q.n.slice(0, 40)) + '</td><td style="text-align:right;white-space:nowrap">' + Math.round(q.km) + ' km</td></tr>'; }).join("") + '</table>' : '<div class="nota">Ninguno registrado en la fuente</div>') + '<div class="nota">' + L.filter(function (q) { return q.km <= 15; }).length + ' a ≤15 km del centro</div></div>'; }
      h += '<h4 class="xm-t">5. Recursos cercanos al centro del municipio</h4><div class="grid g3">' + lst("Salud", SA) + lst("Bomberos / rescate", BO) + lst("Policía", PO) + '</div><p class="nota" style="margin:2px 0 0">OpenStreetMap (oct. 2026): mapeo voluntario con cobertura incompleta; «ninguno registrado» no significa que no exista.</p>';
      var B = document.getElementById("pfB"); if (!B) return; B.className = ""; B.innerHTML = h;
      if (!c.error && document.getElementById("pfCh")) X.chart("pfCh", {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 40, right: 40, top: 34, bottom: 24}, xAxis: {type: "category", data: MES}, yAxis: [{type: "value", name: "°C"}, {type: "value", name: "mm", splitLine: {show: false}}], series: [{name: "Lluvia (mm/mes)", type: "bar", yAxisIndex: 1, data: c.pr.map(function (v) { return Math.round(v); }), itemStyle: {color: "#7fb2e5"}}, {name: "T máx", type: "line", data: c.tx.map(function (v) { return +v.toFixed(1); }), itemStyle: {color: "#d7263d"}}, {name: "T mín", type: "line", data: c.tn.map(function (v) { return +v.toFixed(1); }), itemStyle: {color: "#1d6fb8"}}]});
      if (dk && document.getElementById("pfEn")) { var dibuja = function () { var e = document.getElementById("pfEn").value, Y = snis.d[e], s = Array(12).fill(0), ny = 0; Object.keys(Y).forEach(function (y) { var v = Y[y][dk]; if (v) { ny++; v.forEach(function (x, i) { s[i] += x; }); } }); X.chart("pfSn", {tooltip: {trigger: "axis"}, grid: {left: 44, right: 10, top: 10, bottom: 24}, xAxis: {type: "category", data: MES}, yAxis: {type: "value"}, series: [{type: "bar", data: s.map(function (v) { return ny ? Math.round(v / ny) : 0; }), itemStyle: {color: "#8e24aa"}}]}); }; document.getElementById("pfEn").onchange = dibuja; dibuja(); }
    });
  }
  return {render: render, zona: zona, amenazas: amenazas};
})();

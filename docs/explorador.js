/* Explorador territorial: qué ver → nivel → dónde → cuándo → mapa + tabla + detalle. Un solo patrón para Bolivia, departamento y municipio. */
var EXP = (function () {
  var S = SALA, X = S2, A = null, DIA = 864e5;
  var VARS = {
    riesgo: {t: "Índice de riesgo (0–10)", u: "/10", per: false, ayuda: "Amenaza × vulnerabilidad × falta de capacidad de respuesta, relativo entre los 339 municipios. Por validar con el CCES."},
    focos: {t: "Focos de calor (NASA FIRMS)", u: "focos", per: true, ayuda: "Detecciones satelitales VIIRS; incluyen quemas agrícolas y no equivalen a incendios confirmados."},
    avisos: {t: "Avisos SENAMHI vigentes", u: "", per: false, ayuda: "Mayor nivel de aviso oficial vigente que incluye al territorio."}
  };
  var CF = ["#e6ebf2", "#ffd966", "#ff9e3d", "#e5471f", "#8b0a1f"], SIN = "#e6ebf2";
  function esc(s) { return S.esc(s); }
  function fmt(n, d) { return A.fmt(n, d); }
  function leyenda(q, T) {
    var v = q.v;
    if (v === "riesgo") return {t: VARS.riesgo.t, it: A.NIVR.map(function (x, i) { return {c: x[2], l: x[1] + " (" + (i ? A.NIVR[i - 1][0] : 0) + "–" + (i === 4 ? 10 : x[0]) + ")"}; })};
    if (v === "focos") { var b = q.n === "dep" ? [0, 1, 100, 500, 2000] : [0, 1, 10, 50, 200], L = ["Ninguno"].concat([1, 2, 3].map(function (i) { return fmt(b[i]) + "–" + fmt(b[i + 1] - 1); })).concat([fmt(b[4]) + " o más"]); return {t: "Focos de calor, últimos " + q.p + " d", it: CF.map(function (c, i) { return {c: c, l: L[i]}; })}; }
    return {t: VARS.avisos.t, it: [{c: SIN, l: "Sin aviso vigente"}].concat(S.NIVTXT.slice(0, 4).map(function (n, i) { return {c: ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"][i], l: "Aviso " + n.toLowerCase()}; }))};
  }
  function color(q, v) {
    if (v == null) return SIN;
    if (q.v === "riesgo") return A.nivelR(v)[2];
    if (q.v === "focos") { var b = q.n === "dep" ? [1, 100, 500, 2000] : [1, 10, 50, 200], i = 0; while (i < 4 && v >= b[i]) i++; return CF[i]; }
    return v < 0 ? SIN : ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"][Math.min(3, v)];
  }
  function texto(q, v) {
    if (v == null) return "sin dato";
    if (q.v === "riesgo") return fmt(v, 1) + " / 10 · " + A.nivelR(v)[1].toLowerCase();
    if (q.v === "focos") return fmt(v) + " foco" + (v === 1 ? "" : "s");
    return v < 0 ? "sin aviso vigente" : "aviso " + S.NIVTXT[Math.min(3, v)].toLowerCase();
  }
  /* focos asignados a municipio una sola vez */
  function focosPorMuni(T) {
    if (T._fx) return T._fx;
    var o = []; T.focos.forEach(function (p) { var m = T.donde(p[0], p[1]); if (m) o.push([m.k, p[3], p[2] || 0]); }); return (T._fx = o);
  }
  function unidades(T, q) {
    var I = A.indices(T), out = [], dias = T.dias.slice(-q.p), fx = null, cnt = {}, mw = {};
    if (q.v === "focos") { fx = focosPorMuni(T); fx.forEach(function (r) { if (dias.indexOf(r[1]) >= 0) { cnt[r[0]] = (cnt[r[0]] || 0) + 1; mw[r[0]] = (mw[r[0]] || 0) + r[2]; } }); }
    var ok = function (d) { return !q.d.length || q.d.indexOf(d) >= 0; };
    if (q.n === "mun") {
      T.lista.forEach(function (m) { if (!ok(m.d)) return; var v = q.v === "riesgo" ? I[m.k].R : q.v === "focos" ? (cnt[m.k] || 0) : m.av; out.push({k: m.k, n: m.n, d: m.d, f: m.f, v: v, mw: mw[m.k] || 0, pob: m.pob || 0, m: m}); });
    } else {
      var gd = {}; ((T.D.geoDep || {}).features || []).forEach(function (f) { gd[f.properties.n] = f; });
      Object.keys(T.DEP).sort().forEach(function (d) {
        if (!ok(d) || !gd[d]) return; var L = T.DEP[d], pob = L.reduce(function (s, x) { return s + (x.pob || 0); }, 0) || 1, v;
        if (q.v === "riesgo") v = L.reduce(function (s, x) { return s + I[x.k].R * (x.pob || 0); }, 0) / pob; else if (q.v === "focos") v = L.reduce(function (s, x) { return s + (cnt[x.k] || 0); }, 0); else v = L.reduce(function (s, x) { return Math.max(s, x.av); }, -1);
        out.push({k: d, n: d, d: d, f: gd[d], v: v, mw: L.reduce(function (s, x) { return s + (mw[x.k] || 0); }, 0), pob: pob, L: L});
      });
    }
    out.forEach(function (u) { u.c = color(q, u.v); u.txt = texto(q, u.v); });
    return out;
  }
  function bboxU(U) { var b = [180, 90, -180, -90]; U.forEach(function (u) { (function rec(c) { if (typeof c[0] === "number") { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; } else c.forEach(rec); })(u.f.geometry.coordinates); }); return b; }
  function barra(nom, v, tope) { if (v == null) return '<div class="xb"><span>' + nom + '</span><div class="xt"></div><b>—</b></div>'; return '<div class="xb"><span>' + nom + '</span><div class="xt"><i style="width:' + Math.min(100, v / (tope || 10) * 100) + '%;background:' + A.nivelR(v)[2] + '"></i></div><b>' + fmt(v, 1) + '</b></div>'; }

  function vista(T, host, q0, o) {
    var q = {v: q0.v, n: q0.n, d: q0.d.slice(), p: q0.p}, uid = "x" + Math.random().toString(36).slice(2, 6), U = [], sel = null, map = null, nomOn = true, base = "osm", todos = false;
    var deps = Object.keys(T.DEP).sort(), I = A.indices(T);
    host.innerHTML = '<div class="xv"><div class="xq"><div class="xs1"><b>1 · Qué ver</b><select id="' + uid + 'v">' + Object.keys(VARS).map(function (k) { return '<option value="' + k + '">' + VARS[k].t + '</option>'; }).join("") + '</select></div>' +
      '<div class="xs1"><b>2 · Nivel</b><label><input type="radio" name="' + uid + 'n" value="dep"> Departamentos</label><label><input type="radio" name="' + uid + 'n" value="mun"> Municipios</label></div>' +
      '<div class="xs1"><b>3 · Dónde</b><details class="xdd" id="' + uid + 'dd"><summary id="' + uid + 'ds"></summary><div class="xdl"><label><input type="checkbox" id="' + uid + 'all"> Todo Bolivia</label>' + deps.map(function (d) { return '<label><input type="checkbox" class="' + uid + 'dc" value="' + esc(d) + '"> ' + esc(d) + '</label>'; }).join("") + '</div></details></div>' +
      '<div class="xs1"><b>4 · Cuándo</b><select id="' + uid + 'p"></select></div><button class="xgo" id="' + uid + 'go">IR →</button></div>' +
      '<div class="xhelp" id="' + uid + 'h"></div>' +
      '<div class="xg"><div class="xmw"><div class="xtool"><button data-b="osm" class="on">Calles</button><button data-b="sat">Satélite</button><button data-b="none">Sin mapa</button><label><input type="checkbox" id="' + uid + 'nm" checked> Nombres</label></div><div class="xmap" id="' + uid + 'm"></div><div class="xleg" id="' + uid + 'l"></div><div class="xlab" id="' + uid + 'lb"></div></div>' +
      '<div class="xside"><div id="' + uid + 'sum"></div><div id="' + uid + 'det"></div><div id="' + uid + 'rk"></div></div></div></div>';
    function $(s) { return document.getElementById(uid + s); }
    /* controles ← estado */
    function pintaControles() {
      $("v").value = q.v; host.querySelectorAll("input[name=" + uid + "n]").forEach(function (r) { r.checked = r.value === q.n; });
      var ch = host.querySelectorAll("." + uid + "dc"); ch.forEach(function (c) { c.checked = q.d.indexOf(c.value) >= 0; }); $("all").checked = !q.d.length;
      $("ds").textContent = q.d.length ? (q.d.length > 2 ? q.d.length + " departamentos" : q.d.join(", ")) : "Todo Bolivia";
      var p = $("p"), per = VARS[q.v].per, mx = T.dias.length || 14, op = [1, 3, 7, 14].filter(function (x) { return x <= mx; });
      p.innerHTML = per ? op.map(function (x) { return '<option value="' + x + '">' + (x === 1 ? "Último día" : "Últimos " + x + " días") + '</option>'; }).join("") : '<option>Situación actual</option>'; p.disabled = !per; if (per) { if (op.indexOf(q.p) < 0) q.p = op[op.length - 1]; p.value = q.p; }
      $("h").innerHTML = '<b>' + esc(VARS[q.v].t) + '</b> · ' + (q.n === "dep" ? "por departamento" : "por municipio") + ' · ' + (q.d.length ? esc(q.d.join(", ")) : "todo Bolivia") + (VARS[q.v].per ? " · últimos " + q.p + " días" : "") + '<span class="nota"> — ' + esc(VARS[q.v].ayuda) + '</span>';
    }
    function leeControles() {
      q.v = $("v").value; var r = host.querySelector("input[name=" + uid + "n]:checked"); q.n = r ? r.value : "mun";
      q.d = $("all").checked ? [] : [].slice.call(host.querySelectorAll("." + uid + "dc")).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (VARS[q.v].per) q.p = +$("p").value || q.p;
    }
    host.querySelectorAll("." + uid + "dc").forEach(function (c) { c.onchange = function () { if (c.checked) $("all").checked = false; if (![].some.call(host.querySelectorAll("." + uid + "dc"), function (x) { return x.checked; })) $("all").checked = true; leeControles(); pintaControles(); }; });
    $("all").onchange = function () { if ($("all").checked) host.querySelectorAll("." + uid + "dc").forEach(function (c) { c.checked = false; }); leeControles(); pintaControles(); };
    $("v").onchange = function () { leeControles(); pintaControles(); };
    host.querySelectorAll("input[name=" + uid + "n]").forEach(function (r) { r.onchange = function () { leeControles(); pintaControles(); }; });
    $("go").onclick = function () { $("dd").removeAttribute("open"); leeControles(); pintaControles(); dibuja(); if (o.alCambiar) o.alCambiar(q); };

    /* mapa */
    var cents = [], rq = 0;
    function rotular() {
      var lab = $("lb"); if (!map || !lab) return; if (!nomOn) { lab.innerHTML = ""; return; }
      var W = map.getContainer().clientWidth, H = map.getContainer().clientHeight, cj = [], out = "", n = 0;
      cents.forEach(function (it) { if (n > 90) return; var p = map.project([it.x, it.y]); if (p.x < 26 || p.y < 14 || p.x > W - 26 || p.y > H - 14) return; var w = it.n.length * 6.3 + 10, h = 15, b = [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2]; for (var i = 0; i < cj.length; i++) { var z = cj[i]; if (b[0] < z[2] && b[2] > z[0] && b[1] < z[3] && b[3] > z[1]) return; } cj.push(b); n++; out += '<span' + (sel === it.k ? ' class="sel"' : "") + ' style="left:' + p.x.toFixed(0) + 'px;top:' + p.y.toFixed(0) + 'px">' + esc(it.n) + '</span>'; });
      lab.innerHTML = out;
    }
    function geo() { return {type: "FeatureCollection", features: U.map(function (u) { return {type: "Feature", geometry: u.f.geometry, properties: {k: u.k, n: u.n, c: u.c, t: u.txt, s: sel === u.k ? 1 : 0}}; })}; }
    function crearMapa() {
      var osc = document.documentElement.getAttribute("data-theme") === "dark";
      map = new maplibregl.Map({container: uid + "m", style: {version: 8, sources: {osm: {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap"}, sat: {type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 17, attribution: "Imagen © Esri, Maxar"}}, layers: [{id: "bg", type: "background", paint: {"background-color": X.css("--soft") || "#e6ebf2"}}, {id: "osm", type: "raster", source: "osm", paint: {"raster-opacity": osc ? .55 : .85}}, {id: "sat", type: "raster", source: "sat", layout: {visibility: "none"}}]}, center: [-64.5, -16.7], zoom: 4.6, attributionControl: {compact: true}});
      map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); map.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-right");
      var pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
      map.on("load", function () {
        map.addSource("u", {type: "geojson", data: geo()});
        map.addSource("dep", {type: "geojson", data: {type: "FeatureCollection", features: (T.D.geoDep || {}).features || []}});
        map.addLayer({id: "u-f", type: "fill", source: "u", paint: {"fill-color": ["get", "c"], "fill-opacity": .78}});
        map.addLayer({id: "u-l", type: "line", source: "u", paint: {"line-color": "#fff", "line-width": .7, "line-opacity": .9}});
        map.addLayer({id: "d-l", type: "line", source: "dep", paint: {"line-color": "#10233d", "line-width": 1.6, "line-opacity": .85}});
        map.addLayer({id: "u-s", type: "line", source: "u", filter: ["==", ["get", "s"], 1], paint: {"line-color": "#10233d", "line-width": 4}});
        map.on("mousemove", "u-f", function (e) { var p = e.features[0].properties; map.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(p.n) + '</b>' + esc(p.t) + ' · clic para ver el detalle</div>').addTo(map); });
        map.on("mouseleave", "u-f", function () { pop.remove(); map.getCanvas().style.cursor = ""; });
        map.on("click", "u-f", function (e) { selecciona(e.features[0].properties.k, false); });
        map.on("move", function () { if (rq) return; rq = requestAnimationFrame(function () { rq = 0; rotular(); }); }); map.on("moveend", rotular); map.on("resize", rotular);
        map._ok = 1; map.resize(); dibuja();
      });
      host.querySelectorAll(".xtool button").forEach(function (b) { b.onclick = function () { base = b.dataset.b; host.querySelectorAll(".xtool button").forEach(function (z) { z.classList.toggle("on", z === b); }); if (map.getLayer("osm")) { map.setLayoutProperty("osm", "visibility", base === "osm" ? "visible" : "none"); map.setLayoutProperty("sat", "visibility", base === "sat" ? "visible" : "none"); } }; });
      $("nm").onchange = function () { nomOn = this.checked; rotular(); };
    }
    function selecciona(k, vuela) {
      sel = k; var u = U.filter(function (z) { return z.k === k; })[0]; if (map && map.getSource("u")) { map.getSource("u").setData(geo()); }
      detalle(u); tabla(); if (vuela && u && map) { var b = bboxU([u]); map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: 60, duration: 600, maxZoom: 9}); } rotular();
    }
    function resumen() {
      var vs = U.map(function (u) { return u.v; }).filter(function (v) { return v != null; }), h;
      if (!U.length) { $("sum").innerHTML = '<div class="xc"><b>Sin territorios</b><p class="nota">No hay unidades para esta selección.</p></div>'; return; }
      if (q.v === "riesgo") { var tot = U.reduce(function (s, u) { return s + u.pob; }, 0) || 1, m = U.reduce(function (s, u) { return s + (u.v || 0) * u.pob; }, 0) / tot, c = A.NIVR.map(function (x) { return U.filter(function (u) { return A.nivelR(u.v)[1] === x[1]; }).length; }); h = '<div class="xk"><div><b style="color:' + A.nivelR(m)[2] + '">' + fmt(m, 1) + '</b><span>riesgo medio (ponderado por población) · ' + A.nivelR(m)[1].toLowerCase() + '</span></div></div><div class="xd">' + A.NIVR.map(function (x, i) { return c[i] ? '<span style="flex:' + c[i] + ';background:' + x[2] + '" title="' + x[1] + ': ' + c[i] + '">' + c[i] + '</span>' : ""; }).join("") + '</div><div class="xdk">' + A.NIVR.map(function (x, i) { return '<span><i style="background:' + x[2] + '"></i>' + x[1] + ' ' + c[i] + '</span>'; }).join("") + '</div>'; }
      else if (q.v === "focos") { var t = vs.reduce(function (s, v) { return s + v; }, 0), con = vs.filter(function (v) { return v > 0; }).length, mw = U.reduce(function (s, u) { return s + u.mw; }, 0); h = '<div class="xk"><div><b>' + fmt(t) + '</b><span>focos en ' + q.p + ' d</span></div><div><b>' + con + '</b><span>de ' + U.length + ' con focos</span></div><div><b>' + fmt(mw) + '</b><span>MW (potencia)</span></div></div>'; }
      else { var n = [0, 1, 2, 3].map(function (l) { return U.filter(function (u) { return u.v === l; }).length; }), sa = U.filter(function (u) { return u.v >= 0; }).length; h = '<div class="xk"><div><b>' + sa + '</b><span>de ' + U.length + ' con aviso vigente</span></div><div><b>' + (n[2] + n[3]) + '</b><span>en naranja o rojo</span></div></div>'; }
      $("sum").innerHTML = '<div class="xc"><h3>Resumen de la selección</h3>' + h + '</div>';
    }
    function tabla() {
      var ord = U.slice().sort(function (a, b) { return (b.v == null ? -9 : b.v) - (a.v == null ? -9 : a.v) || (b.pob - a.pob); }), mx = todos ? ord.length : 12;
      $("rk").innerHTML = '<div class="xc"><h3>Mayor a menor · ' + esc(VARS[q.v].t) + '</h3><table class="xt2">' + ord.slice(0, mx).map(function (u, i) { return '<tr data-k="' + esc(u.k) + '"' + (sel === u.k ? ' class="on"' : "") + '><td class="xn">' + (i + 1) + '</td><td>' + esc(u.n) + (q.n === "mun" ? ' <span class="nota">' + esc(u.d) + '</span>' : "") + '</td><td style="text-align:right"><i class="xdot" style="background:' + u.c + '"></i>' + esc(u.txt) + '</td></tr>'; }).join("") + '</table>' + (ord.length > 12 ? '<button class="xlink" id="' + uid + 'mas">' + (todos ? "Ver solo los 12 primeros" : "Ver los " + ord.length) + '</button>' : "") + '</div>';
      host.querySelectorAll("#" + uid + "rk tr[data-k]").forEach(function (r) { r.onclick = function () { selecciona(r.dataset.k, true); }; });
      var b = $("mas"); if (b) b.onclick = function () { todos = !todos; tabla(); };
    }
    function detalle(u) {
      var el = $("det"); if (!u) { el.innerHTML = '<div class="xc xhint">Haga clic en un territorio del mapa o de la lista para ver su detalle.</div>'; return; }
      var h = '<div class="xc"><h3>' + esc(u.n) + (q.n === "mun" ? ' <span class="nota">' + esc(u.d) + '</span>' : "") + '</h3><div class="xval" style="border-left:6px solid ' + u.c + '">' + esc(u.txt) + '</div>';
      if (q.n === "mun") {
        var o2 = I[u.k], m = u.m; h += '<div class="xbs">' + barra("Amenaza", o2.A) + barra("Vulnerabilidad", o2.V) + barra("Falta de capacidad", o2.L) + '</div><p class="nota" style="margin:2px 0 6px">Riesgo ' + fmt(o2.R, 1) + ' · puesto ' + o2.rankD + ' de ' + o2.nD + ' en ' + esc(u.d) + ' · ' + o2.rank + ' de ' + I._n + ' en Bolivia. ' + fmt(m.pob) + ' hab.</p>';
        var av = A.avisosT(T, u.d, m); if (q.v === "avisos") h += av.length ? '<ul class="xl">' + av.map(function (a) { return '<li>' + esc(a.titulo) + ' <span class="nota">(' + esc((a.nivel || "").toLowerCase()) + ')</span></li>'; }).join("") + '</ul>' : '<p class="nota">Sin avisos vigentes.</p>';
        h += '<div class="xact"><a class="btn p" href="municipio.html?d=' + encodeURIComponent(u.d) + '&m=' + encodeURIComponent(u.n) + '">Ficha completa</a><a class="btn" href="reporte.html?dep=' + encodeURIComponent(u.d) + '&mun=' + encodeURIComponent(u.n) + '&per=30" target="_blank" rel="noopener">Reporte PDF</a></div>';
      } else {
        var L = u.L, c = A.NIVR.map(function (x) { return L.filter(function (z) { return A.nivelR(I[z.k].R)[1] === x[1]; }).length; });
        h += '<p class="nota" style="margin:2px 0 6px">' + fmt(u.pob) + ' hab. · ' + L.length + ' municipios. Por nivel de riesgo: ' + A.NIVR.map(function (x, i) { return x[1].toLowerCase() + " " + c[i]; }).join(" · ") + '.</p>';
        h += '<div class="xact"><button class="btn p" id="' + uid + 'dm">Ver sus municipios en el mapa</button><a class="btn" href="departamento.html?d=' + encodeURIComponent(u.d) + '">Ficha del departamento</a><a class="btn" href="reporte.html?dep=' + encodeURIComponent(u.d) + '&per=30" target="_blank" rel="noopener">Reporte PDF</a></div>';
      }
      el.innerHTML = h + '</div>';
      var bt = $("dm"); if (bt) bt.onclick = function () { q.n = "mun"; q.d = [u.d]; sel = null; pintaControles(); dibuja(); if (o.alCambiar) o.alCambiar(q); };
    }
    function dibuja() {
      U = unidades(T, q); if (sel && !U.some(function (u) { return u.k === sel; })) sel = null;
      cents = U.map(function (u) { var c = A.cenPoly(u.f.geometry); return {k: u.k, n: u.n, x: c[0], y: c[1], a: u.f ? 1 : 0, pob: u.pob}; }).sort(function (a, b) { return (b.k === sel) - (a.k === sel) || b.pob - a.pob; });
      var L = leyenda(q, T); $("l").innerHTML = '<b>' + esc(L.t) + '</b>' + L.it.map(function (x) { return '<span><i style="background:' + x.c + '"></i>' + esc(x.l) + '</span>'; }).join("") + (q.v === "riesgo" ? '<em>Relativo entre municipios · por validar con CCES</em>' : "");
      if (map && map._ok) { map.getSource("u").setData(geo()); if (U.length) { var b = bboxU(U); map.resize(); map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: 40, duration: 0}); } }
      resumen(); tabla(); detalle(sel ? U.filter(function (u) { return u.k === sel; })[0] : null); setTimeout(rotular, 600);
    }
    pintaControles(); crearMapa(); detalle(null);
    return {q: q, destruir: function () { try { map.remove(); } catch (e) {} host.innerHTML = ""; }};
  }

  function iniciar() {
    var app = document.getElementById("app");
    TERR.cargar().then(function (T) {
      A = TERR.api; A.estilos(); X.header("explorador.html");
      var P = new URLSearchParams(location.search), deps = (P.get("d") || "").split("|").filter(Boolean);
      var q0 = {v: VARS[P.get("v")] ? P.get("v") : "riesgo", n: P.get("n") === "dep" ? "dep" : "mun", d: deps.filter(function (d) { return T.DEP[d]; }), p: +P.get("p") || 14};
      if (!P.get("n")) q0.n = "dep";
      document.title = "Explorador territorial — Sala de Situación Bolivia";
      app.innerHTML = '<nav class="tnav" aria-label="Ruta"><a href="index.html">Tablero</a><span class="tsep">›</span><b>Territorios · Explorador</b><span class="sp"></span><button class="btn" id="xcmp">Comparar lado a lado ◂▸</button></nav><h1 class="th">Explorador territorial</h1><div class="cap">Elija <b>qué ver</b>, a qué <b>nivel</b>, <b>dónde</b> y <b>cuándo</b>, y pulse IR. Cada mapa muestra solo la selección; para comparar, abra un segundo mapa al lado.</div><div class="xrow" id="xrow"><div id="xa"></div><div id="xb" style="display:none"></div></div>';
      var va = vista(T, document.getElementById("xa"), q0, {alCambiar: function (q) { var u = new URL(location.href); u.search = "?v=" + q.v + "&n=" + q.n + "&d=" + encodeURIComponent(q.d.join("|")) + "&p=" + q.p; history.replaceState(null, "", u.toString()); }}), vb = null;
      var dh = document.createElement("div"); dh.className = "dsc"; document.getElementById("xrow").insertAdjacentElement("afterend", dh); DIST.css(); DIST.montar(T, dh); var dh2 = document.createElement("div"); dh2.className = "dsc"; dh.insertAdjacentElement("afterend", dh2); DIST.salud(dh2);
      document.getElementById("xcmp").onclick = function () {
        var row = document.getElementById("xrow"), xb = document.getElementById("xb");
        if (vb) { vb.destruir(); vb = null; xb.style.display = "none"; row.classList.remove("dos"); this.textContent = "Comparar lado a lado ◂▸"; setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 50); return; }
        var q2 = {v: va.q.v === "riesgo" ? "focos" : "riesgo", n: va.q.n, d: va.q.d.slice(), p: va.q.p}; xb.style.display = ""; row.classList.add("dos"); vb = vista(T, xb, q2, {}); this.textContent = "Cerrar la comparación"; setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 50);
      };
    });
  }
  return {iniciar: iniciar};
})();

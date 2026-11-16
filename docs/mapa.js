/* Mapa dinámico de Bolivia: coropletas por departamento o por municipio, con catálogo de indicadores (INE + sistema). */
var MAPA = (function () {
  var S = SALA, X = S2, A, T, EX = {municipios: {}, departamentos: {}, pais: {}}, SAL = null, I = null, esc = S.esc, fmt;
  var G = {n: "mun", d: "", nom: true, base: "carto", cmp: false, cortes: "q", act: 0};
  var P = [{i: "nbi", y: null}, {i: "riesgo", y: null}];
  var CAT = [], CI = {}, CACHE = {}, sel = null, panes = [], timer = null;
  var PAL = {
    rd: ["#fde8e4", "#f9b3a5", "#ef6f5b", "#c8321f", "#7a1010"], or: ["#fff1d6", "#ffc973", "#f59a3d", "#d9621b", "#8f2d0a"],
    bl: ["#e6f0fb", "#a9cdee", "#5aa0dc", "#2a6fb5", "#123f7c"], gr: ["#e8f5e6", "#b4dcae", "#6fbd7a", "#2f8f4e", "#0d5a2f"], pu: ["#f0eaf7", "#cdb7e6", "#a07fd0", "#7048ae", "#432379"], te: ["#e0f5f2", "#9fdcd3", "#4fbdb0", "#1f8f87", "#0b5a58"]
  };
  var AVC = ["#9aa3b2", "#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"], AVT = ["Sin aviso vigente", "Aviso verde", "Aviso amarillo", "Aviso naranja", "Aviso rojo"];
  function osc() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function $(id) { return document.getElementById(id); }

  /* ---------------- catálogo ---------------- */
  function Im() { return I || (I = A.indices(T)); }
  function nb(m, k) { var x = T.nb && T.nb.municipios[m.k]; return x && x[k] != null ? x[k] : null; }
  function nbd(d, k) { var x = T.nb && T.nb.departamentos[d]; return x && x[k] != null ? x[k] : null; }
  function ed(m, k) { var x = T.ed && T.ed.municipios[m.k]; return x && x[k] != null ? x[k] : null; }
  function edd(d, k) { var x = T.ed && T.ed.departamentos[d]; return x && x[k] != null ? x[k] : null; }
  function ex(m, k) { var x = EX.municipios[m.k]; return x && x[k] != null ? x[k] : null; }
  function exd(d, k) { var x = EX.departamentos[d]; return x && x[k] != null ? x[k] : null; }
  function popM(m, y) { var p = T.pob && T.pob.municipios[m.k]; return p && p.est && p.est[y] != null ? p.est[y] : null; }
  function popD(d, y) { var p = T.pob && T.pob.departamentos[d]; return p && p[y] != null ? p[y] : null; }
  function fcache(p) { var k = "f" + p; if (CACHE[k]) return CACHE[k]; var dias = T.dias.slice(-p), c = {}; T.focos.forEach(function (q) { if (dias.indexOf(q[3]) < 0) return; var m = T.donde(q[0], q[1]); if (m) c[m.k] = (c[m.k] || 0) + 1; }); return (CACHE[k] = c); }
  function dsum(f) { var o = {}; T.lista.forEach(function (m) { var v = f(m); if (v != null) o[m.d] = (o[m.d] || 0) + v; }); return o; }
  function wmean(f) { var s = {}, w = {}; T.lista.forEach(function (m) { var v = f(m), p = m.pob || 0; if (v == null || !p) return; s[m.d] = (s[m.d] || 0) + v * p; w[m.d] = (w[m.d] || 0) + p; }); var o = {}; Object.keys(s).forEach(function (d) { o[d] = s[d] / w[d]; }); return o; }
  function antM(m) { var R = (T.dh && T.dh.municipios[m.k]) || []; return R.length; }
  function antD(d) { var E = (T.dh && T.dh.departamentos[d]) || {}, n = 0; Object.keys(E).forEach(function (t) { n += E[t][0]; }); return n; }
  function pIdx(arr, y) { return arr ? arr[y] : null; }
  function add(o) { o.lv = o.lv || ["dep", "mun"]; CAT.push(o); CI[o.id] = o; }
  function censo(id, g, t, k, pal, def, kk12, nota) { add({id: id, g: g, t: t, u: " %", dec: 1, pal: pal, yrs: kk12 ? [2012, 2024] : null, src: "INE, Censo 2024" + (kk12 ? " y 2012" : ""), def: def, nota: nota, mun: function (m, y) { return nb(m, y === 2012 && kk12 ? kk12 : k); }, dep: function (d, y) { return nbd(d, y === 2012 && kk12 ? kk12 : k); }, pais: function (y) { var x = T.nb && T.nb.pais; return x ? x[y === 2012 && kk12 ? kk12 : k] : null; }}); }
  function educ(id, t, k, pal, def, kk12, u) { add({id: id, g: "Educación", t: t, u: u || " %", dec: 1, pal: pal, yrs: kk12 ? [2012, 2024] : null, src: "INE, Censos 2012 y 2024 (cuadros 3.02.05.01–04)", def: def, mun: function (m, y) { return ed(m, y === 2012 && kk12 ? kk12 : k); }, dep: function (d, y) { return edd(d, y === 2012 && kk12 ? kk12 : k); }, pais: function (y) { var x = T.ed && T.ed.pais; return x ? x[y === 2012 && kk12 ? kk12 : k] : null; }}); }
  function catalogo() {
    var RG = "Riesgo y alertas";
    add({id: "riesgo", g: RG, t: "Índice de riesgo (0–10)", u: "", dec: 1, fijo: true, src: "Cálculo del sistema con datos INE, DesInventar, SENAMHI, NASA FIRMS y OpenStreetMap", def: "Media geométrica de tres componentes: Amenaza × Vulnerabilidad × Falta de capacidad de respuesta. Es RELATIVO: compara los 339 municipios entre sí, no mide una probabilidad.", nota: "Por validar con el CCES. Amenaza = 60 % antecedentes de desastres (DesInventar 1970–2015) + 40 % situación actual (aviso SENAMHI, focos, eventos 30 d). Vulnerabilidad = pobreza NBI, pobreza extrema, agua y saneamiento, analfabetismo, años de estudio y atención en salud. Capacidad = distancia a hospital y bomberos, establecimientos y vehículos por habitante. Cada variable se convierte en percentil entre municipios. Departamento = promedio ponderado por población.", mun: function (m) { return Im()[m.k].R; }, dep: function (d) { return wmean(function (m) { return Im()[m.k].R; })[d]; }});
    add({id: "amenaza", g: RG, t: "Componente: amenaza (0–10)", u: "", dec: 1, pal: "rd", src: "Cálculo del sistema", def: "60 % antecedentes de desastres (DesInventar) + 40 % situación actual (aviso, focos, eventos 30 d).", mun: function (m) { return Im()[m.k].A; }, dep: function (d) { return wmean(function (m) { return Im()[m.k].A; })[d]; }});
    add({id: "vuln", g: RG, t: "Componente: vulnerabilidad (0–10)", u: "", dec: 1, pal: "rd", src: "Cálculo del sistema con INE 2024", def: "Promedio de percentiles de: NBI, pobreza extrema, agua y saneamiento inadecuados, analfabetismo, pocos años de estudio, atención en salud inadecuada.", mun: function (m) { return Im()[m.k].V; }, dep: function (d) { return wmean(function (m) { return Im()[m.k].V; })[d]; }});
    add({id: "cap", g: RG, t: "Componente: falta de capacidad (0–10)", u: "", dec: 1, pal: "rd", src: "Cálculo del sistema con OSM/MINSALUD/RUAT", def: "Distancia al hospital y a bomberos/rescate, pocos establecimientos y pocos vehículos por habitante.", mun: function (m) { return Im()[m.k].L; }, dep: function (d) { return wmean(function (m) { return Im()[m.k].L; })[d]; }});
    add({id: "avisos", g: RG, t: "Aviso SENAMHI vigente", cat: true, src: "SENAMHI (avisos meteorológicos e hidrológicos)", def: "Nivel máximo de aviso vigente hoy que menciona al territorio.", nota: "Un aviso es una alerta oficial, no un hecho confirmado.", mun: function (m) { return m.av + 1; }, dep: function (d) { var mx = -1; T.lista.forEach(function (m) { if (m.d === d && m.av > mx) mx = m.av; }); return mx + 1; }});
    add({id: "focos", g: RG, t: "Focos de calor", u: " focos", dec: 0, pal: "or", zero: true, yrs: [1, 3, 7, 14], yl: function (y) { return y === 1 ? "Último día" : "Últimos " + y + " días"; }, yd: 7, src: "NASA FIRMS (VIIRS/MODIS)", def: "Detecciones satelitales de calor en el período. Un foco no es necesariamente un incendio.", mun: function (m, y) { return fcache(y)[m.k] || 0; }, dep: function (d, y) { var c = fcache(y), s = 0; T.lista.forEach(function (m) { if (m.d === d) s += c[m.k] || 0; }); return s; }});
    add({id: "antec", g: RG, t: "Antecedentes de desastres (1970–2015)", u: " registros", dec: 0, pal: "pu", zero: true, src: "DesInventar", def: "Registros históricos de desastres (inundación, deslizamiento, sequía, incendio, etc.).", nota: "Subregistro desigual entre municipios.", mun: function (m) { return antM(m); }, dep: function (d) { return antD(d); }});
    var PO = "Población y territorio";
    add({id: "pob", g: PO, t: "Población proyectada", u: " hab.", dec: 0, pal: "bl", yrs: [2024, 2026, 2028, 2030, 2032, 2034], yd: 2026, src: "INE, Proyecciones de población, Revisión 2025", def: "Población al 1 de enero según proyección oficial.", nota: "TIOC sin municipio propio no se incluyen; la suma municipal puede ser menor al total departamental.", mun: function (m, y) { return popM(m, y); }, dep: function (d, y) { return popD(d, y); }, pais: function (y) { return popD("Bolivia", y); }});
    add({id: "dens", g: PO, t: "Densidad de población", u: " hab./km²", dec: 1, pal: "bl", src: "INE (población 2026) y superficie calculada del mapa", def: "Habitantes por km² (superficie calculada sobre los límites del mapa).", mun: function (m) { return m.pob != null && m.km2 ? m.pob / m.km2 : null; }, dep: function (d) { var p = 0, a = 0; T.lista.forEach(function (m) { if (m.d === d) { p += m.pob || 0; a += m.km2 || 0; } }); return a ? p / a : null; }});
    var CV = "Pobreza y vivienda (Censo)";
    censo("nbi", CV, "Pobreza por NBI", "nbi24", "rd", "% de población con al menos una necesidad básica insatisfecha (vivienda, servicios, educación, salud).", "nbi12");
    censo("ext", CV, "Pobreza extrema", "ext24", "rd", "% de población indigente + marginal por NBI.", "ext12");
    censo("agua", CV, "Agua y saneamiento inadecuados", "agua24", "rd", "% de población con servicios de agua y saneamiento inadecuados.", "agua12");
    censo("ener", CV, "Insumos energéticos inadecuados", "ener24", "rd", "% de población con insumos energéticos inadecuados para cocinar o iluminar.", "ener12");
    censo("mat", CV, "Materiales de vivienda inadecuados", "mat24", "rd", "% de población en viviendas con materiales inadecuados.");
    censo("esp", CV, "Espacios insuficientes en la vivienda", "esp24", "rd", "% de población con hacinamiento o espacios insuficientes.");
    censo("edu", CV, "Insuficiencia en educación (NBI)", "edu24", "rd", "% de población con insuficiencia educativa según el componente NBI.");
    censo("sal", CV, "Inadecuada atención en salud (NBI)", "sal24", "rd", "% de población sin atención adecuada de salud según el componente NBI.");
    educ("alf", "Alfabetismo (15+ años)", "alf24", "bl", "% de la población de 15 años o más que sabe leer y escribir.", "alf12");
    educ("asis", "Asistencia escolar (4–17 años)", "asis24", "bl", "% de niñas, niños y adolescentes de 4 a 17 años que asisten a un centro educativo.", "asis12");
    educ("estu", "Años promedio de estudio (19+)", "est24", "bl", "Años promedio de estudio de la población de 19 años o más.", "est12", " años");
    educ("ning", "Sin instrucción (19+ años)", "ning24", "or", "% de la población de 19 años o más sin ningún nivel de instrucción.");
    educ("sup", "Con estudios superiores (19+ años)", "sup24", "bl", "% de la población de 19 años o más con nivel superior.");
    var HM = "Hogares y migración (Censo)";
    add({id: "emi", g: HM, t: "Viviendas con emigrantes", u: " %", dec: 1, pal: "te", yrs: [2012, 2024], src: "INE, Censos 2012 y 2024 (cuadro 3.09.05.01)", def: "% de viviendas particulares con al menos un integrante que emigró.", mun: function (m, y) { return ex(m, y === 2012 ? "emi12" : "emi24"); }, dep: function (d, y) { return exd(d, y === 2012 ? "emi12" : "emi24"); }, pais: function (y) { return EX.pais[y === 2012 ? "emi12" : "emi24"]; }});
    add({id: "fall", g: HM, t: "Viviendas con fallecidos declarados", u: " %", dec: 1, pal: "pu", yrs: [2012, 2024], src: "INE, Censos 2012 y 2024 (cuadro 3.09.04.01)", def: "% de viviendas que declararon algún fallecido en el período de referencia del Censo.", nota: "No es una tasa de mortalidad; los períodos de referencia de 2012 y 2024 no son idénticos.", mun: function (m, y) { return ex(m, y === 2012 ? "fall12" : "fall24"); }, dep: function (d, y) { return exd(d, y === 2012 ? "fall12" : "fall24"); }, pais: function (y) { return EX.pais[y === 2012 ? "fall12" : "fall24"]; }});
    var SV = "Servicios y movilidad";
    add({id: "estab", g: SV, t: "Establecimientos de salud (mapeados)", u: "", dec: 0, pal: "gr", zero: true, src: "OpenStreetMap / HOT", def: "Cantidad de establecimientos de salud mapeados dentro del territorio.", nota: "OSM puede estar incompleto en zonas rurales.", mun: function (m) { return m.est.length; }, dep: function (d) { var s = 0; T.lista.forEach(function (m) { if (m.d === d) s += m.est.length; }); return s; }});
    add({id: "est10", g: SV, t: "Establecimientos por 10.000 hab.", u: "", dec: 1, pal: "gr", src: "OpenStreetMap y INE", def: "Establecimientos de salud mapeados por cada 10.000 habitantes.", mun: function (m) { return m.pob ? m.est.length / m.pob * 1e4 : null; }, dep: function (d) { var s = 0, p = 0; T.lista.forEach(function (m) { if (m.d === d) { s += m.est.length; p += m.pob || 0; } }); return p ? s / p * 1e4 : null; }});
    if (T.pa) {
      var an = T.pa.anios || [], ia = function (y) { return an.indexOf(y); };
      add({id: "veh", g: SV, t: "Parque automotor", u: " veh.", dec: 0, pal: "bl", yrs: an.filter(function (y) { return y % 2 === 1 || y === an[an.length - 1]; }), yd: an[an.length - 1], src: "INE (RUAT), Parque automotor", def: "Vehículos registrados en el territorio.", nota: "Pando 2003–2021 subregistra vehículos (zona franca, nota INE).", mun: function (m, y) { var v = T.pa.municipios[m.k]; return v ? v[ia(y)] : null; }, dep: function (d, y) { var v = T.ind && T.ind.parque_automotor && T.ind.parque_automotor.datos[d]; return v ? v[ia(y)] : null; }});
    }
    var SI = "Salud infantil (encuestas, solo departamental)";
    if (SAL) {
      var sy = function (k) { return SAL[k].anios; };
      add({id: "ira", g: SI, t: "Infección respiratoria aguda, <5 años", u: " %", dec: 1, lv: ["dep"], pal: "or", yrs: sy("ira"), src: "INE, Encuesta de Hogares 2011–2021 (cuadro 3.01.02.06)", def: "% de menores de 5 años que tuvo IRA en las dos semanas previas.", nota: "La EH 2020 no captó IRA. Dato muestral: celdas con * así las marca el INE.", dep: function (d, y) { var o = SAL.ira.dep[d]; return o ? o[SAL.ira.anios.indexOf(y)].v : null; }});
      add({id: "eda", g: SI, t: "Enfermedad diarreica aguda, <5 años", u: " %", dec: 1, lv: ["dep"], pal: "bl", yrs: sy("eda"), src: "INE, Encuesta de Hogares 2011–2021 (cuadro 3.01.02.05)", def: "% de menores de 5 años que tuvo EDA en las dos semanas previas.", dep: function (d, y) { var o = SAL.eda.dep[d]; return o ? o[SAL.eda.anios.indexOf(y)].v : null; }});
      add({id: "dc", g: SI, t: "Desnutrición crónica, <5 años", u: " %", dec: 1, lv: ["dep"], pal: "rd", yrs: sy("dc"), src: "INE, ENDSA 2008, 2016 y 2023 (cuadro 3.01.03.03)", def: "% de menores de 5 años con talla para la edad por debajo de −2 desviaciones estándar.", dep: function (d, y) { var o = SAL.dc.dep[d]; return o ? o[SAL.dc.anios.indexOf(y)] : null; }});
    }
    if (T.ind && T.ind.desmonte_ha) {
      var da = T.ind.desmonte_ha.anios;
      add({id: "desm", g: "Ambiente (solo departamental)", t: "Superficie autorizada para desmonte", u: " ha", dec: 0, lv: ["dep"], pal: "or", yrs: da.filter(function (y) { return y >= 2010; }), yd: da[da.length - 1], src: "INE / ABT, Superficie autorizada para desmonte", def: "Hectáreas autorizadas para desmonte en el año.", nota: "Es una autorización, no deforestación medida.", dep: function (d, y) { var v = T.ind.desmonte_ha.datos[d]; return v ? v[da.indexOf(y)] : null; }});
    }
    CAT.forEach(function (o) { if (o.yd == null && o.yrs) o.yd = o.yrs[o.yrs.length - 1]; });
  }

  /* ---------------- valores y clases ---------------- */
  function unidades() {
    if (G.n === "dep") { return ((T.D.geoDep || {}).features || []).map(function (f) { return {k: f.properties.n, n: f.properties.n, d: f.properties.n, f: f}; }); }
    return T.lista.filter(function (m) { return !G.d || m.d === G.d; }).map(function (m) { return {k: m.k, n: m.n, d: m.d, f: m.f, m: m}; });
  }
  function yDef(pn) { var o = CI[P[pn].i]; return o.yrs ? (P[pn].y != null && o.yrs.indexOf(P[pn].y) >= 0 ? P[pn].y : o.yd) : null; }
  function valores(id, lv, y) {
    var key = id + "|" + lv + "|" + y; if (CACHE[key]) return CACHE[key];
    var o = CI[id], r = {};
    if (lv === "dep") { var f = o.dep; if (!f) return (CACHE[key] = r); var all = ((T.D.geoDep || {}).features || []).map(function (z) { return z.properties.n; }); all.forEach(function (d) { var v = f(d, y); if (v != null && !isNaN(v)) r[d] = +v; }); }
    else { var g = o.mun; if (!g) return (CACHE[key] = r); T.lista.forEach(function (m) { var v = g(m, y); if (v != null && !isNaN(v)) r[m.k] = +v; }); }
    return (CACHE[key] = r);
  }
  function fnum(o, v) { return v == null ? "sin dato" : fmt(v, o.dec) + (o.u || ""); }
  function clases(o, vals) {
    var pal = o.pal ? PAL[o.pal] : null, neu = osc() ? "#303846" : "#e4e9f0", a = vals.slice().sort(function (x, y) { return x - y; });
    if (o.cat) { return {cls: AVT.map(function (t, i) { return {c: AVC[i], l: t, lo: i, hi: i}; }), idx: function (v) { return Math.round(v); }}; }
    if (o.fijo) { var N = A.NIVR; return {cls: N.map(function (n, i) { return {c: n[2], l: n[1] + " (" + (i ? N[i - 1][0] : 0) + "–" + (i === 4 ? 10 : n[0]) + ")", lo: i ? N[i - 1][0] : -1e9, hi: n[0]}; }), idx: function (v) { for (var i = 0; i < N.length; i++) if (v < N[i][0]) return i; return 4; }}; }
    if (!a.length) return {cls: [], idx: function () { return -1; }};
    var cls = [], br = [], zero = o.zero && a.filter(function (v) { return v === 0; }).length / a.length >= .25, base = zero ? a.filter(function (v) { return v > 0; }) : a, k = zero ? 4 : 5, mn = base[0], mx = base[base.length - 1];
    if (G.cortes === "q" && base.length > k) { for (var i = 1; i < k; i++) { var q = base[Math.floor(base.length * i / k)]; if (!br.length || q > br[br.length - 1]) br.push(q); } } else { for (var j = 1; j < k; j++) br.push(mn + (mx - mn) * j / k); }
    var cut = []; br.forEach(function (b) { b = +(+b).toFixed(o.dec > 0 ? o.dec : 0); if (!cut.length || b > cut[cut.length - 1]) cut.push(b); });
    var colors = zero ? pal.slice(1) : pal, nc = cut.length + 1; var cc = []; for (var z = 0; z < nc; z++) cc.push(colors[Math.round(z * (colors.length - 1) / Math.max(1, nc - 1))]);
    if (zero) cls.push({c: neu, l: "0 (ninguno)", lo: 0, hi: 0});
    var lo = zero ? mn : mn;
    for (var t = 0; t < nc; t++) { var from = t ? cut[t - 1] : lo, to = t < cut.length ? cut[t] : mx; cls.push({c: cc[t], l: (t === 0 ? fmt(from, o.dec) : "> " + fmt(from, o.dec)) + " – " + fmt(to, o.dec), lo: from, hi: t < cut.length ? cut[t] : 1e18}); }
    return {cls: cls, idx: function (v) { if (zero && v === 0) return 0; var s = zero ? 1 : 0; for (var i = 0; i < cut.length; i++) if (v <= cut[i]) return s + i; return s + cut.length; }};
  }

  /* ---------------- panel de mapa ---------------- */
  function Pane(pn, host) {
    var me = {pn: pn, map: null, U: [], vals: {}, K: null, hov: null}, o, y, uid = "p" + pn;
    host.innerHTML = '<div class="mph"><div><b id="' + uid + 't"></b><div class="sb" id="' + uid + 's"></div></div><div class="yr" id="' + uid + 'y"></div></div><div class="mmap"><div class="m" id="' + uid + 'm"></div><div class="mlb" id="' + uid + 'l"></div><div class="mtool" id="' + uid + 'tl"></div><div class="mlg" id="' + uid + 'g"></div></div>';
    function base() { return {version: 8, sources: {carto: {type: "raster", tiles: ["a", "b", "c", "d"].map(function (s) { return "https://" + s + ".basemaps.cartocdn.com/rastertiles/" + (osc() ? "dark_all" : "voyager") + "/{z}/{x}/{y}.png"; }), tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap, © CARTO"}, osm: {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap"}, sat: {type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 17, attribution: "Imagen © Esri, Maxar"}}, layers: [{id: "bg", type: "background", paint: {"background-color": osc() ? "#0e1420" : "#dfe6ee"}}, {id: "carto", type: "raster", source: "carto"}, {id: "osm", type: "raster", source: "osm", layout: {visibility: "none"}}, {id: "sat", type: "raster", source: "sat", layout: {visibility: "none"}}]}; }
    function vis() { if (!me.map || !me.map.getLayer("carto")) return; ["carto", "osm", "sat"].forEach(function (b) { me.map.setLayoutProperty(b, "visibility", G.base === b ? "visible" : "none"); }); if (me.map.getLayer("u-f")) me.map.setPaintProperty("u-f", "fill-opacity", ["case", ["==", ["get", "nd"], 1], .25, G.base === "none" ? .95 : .74]); me.map.getCanvas().parentNode.parentNode.style.background = ""; }
    function geo() { var F = me.U.map(function (u) { var v = me.vals[u.k], c = me.K && v != null ? me.K.cls[me.K.idx(v)] : null; return {type: "Feature", geometry: u.f.geometry, properties: {k: u.k, n: u.n, c: c ? c.c : "#94a3b8", nd: v == null ? 1 : 0, v: v == null ? "" : v, s: sel === u.k ? 1 : 0}}; }); return {type: "FeatureCollection", features: F}; }
    function crear() {
      var map = me.map = new maplibregl.Map({container: uid + "m", style: base(), bounds: [[-69.8, -22.9], [-57.4, -9.6]], fitBoundsOptions: {padding: 12}, attributionControl: {compact: true}});
      map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right"); map.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-right");
      var pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
      map.on("load", function () {
        map.addSource("u", {type: "geojson", data: geo()}); map.addSource("dep", {type: "geojson", data: {type: "FeatureCollection", features: (T.D.geoDep || {}).features || []}});
        map.addLayer({id: "u-f", type: "fill", source: "u", paint: {"fill-color": ["get", "c"], "fill-opacity": ["case", ["==", ["get", "nd"], 1], .25, .74]}});
        map.addLayer({id: "u-l", type: "line", source: "u", paint: {"line-color": osc() ? "#0b1220" : "#ffffff", "line-width": G.n === "dep" ? 1.2 : .6, "line-opacity": .9}});
        map.addLayer({id: "d-l", type: "line", source: "dep", paint: {"line-color": osc() ? "#e8eefc" : "#10233d", "line-width": G.n === "dep" ? 1.4 : 1.8, "line-opacity": .9}});
        map.addLayer({id: "u-s", type: "line", source: "u", filter: ["==", ["get", "s"], 1], paint: {"line-color": "#f5b700", "line-width": 4}});
        map.addLayer({id: "u-h", type: "line", source: "u", filter: ["==", ["get", "k"], ""], paint: {"line-color": "#ffffff", "line-width": 3}});
        map.on("mousemove", "u-f", function (e) { var p = e.features[0].properties, v = p.nd ? null : +p.v; map.getCanvas().style.cursor = "pointer"; map.setFilter("u-h", ["==", ["get", "k"], p.k]); var rk = rank(me, p.k); pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b>' + esc(p.n) + '</b>' + esc(o.t) + ': <b style="display:inline">' + esc(fnum(o, v)) + '</b>' + (rk ? '<br><span style="opacity:.7">puesto ' + rk[0] + ' de ' + rk[1] + '</span>' : "") + '<br><span style="opacity:.7">clic para ver todo</span></div>').addTo(map); });
        map.on("mouseleave", "u-f", function () { pop.remove(); map.getCanvas().style.cursor = ""; map.setFilter("u-h", ["==", ["get", "k"], ""]); });
        map.on("click", "u-f", function (e) { seleccionar(e.features[0].properties.k); });
        map.on("move", rotular); map.on("moveend", rotular); map.on("resize", rotular);
        me.ok = 1; dibuja(true); if (panes[0] && panes[0].o) { lateral(); catalogoUI(); }
      });
    }
    function rotular() {
      var lab = $(uid + "l"); if (!lab || !me.map || !G.nom) { if (lab) lab.innerHTML = ""; return; }
      var W = me.map.getContainer().clientWidth, H = me.map.getContainer().clientHeight, cj = [], out = "", n = 0, zm = me.map.getZoom();
      var items = (G.n === "dep" ? me.U : me.U.slice().sort(function (a, b) { return (b.m.pob || 0) - (a.m.pob || 0); }));
      if (G.n === "mun" && !G.d && zm < 6.2) { items = []; }
      items.forEach(function (u) { if (n > 110) return; var c = u.c || (u.c = A.cenPoly(u.f.geometry)), p = me.map.project([c[0], c[1]]); if (p.x < 24 || p.y < 12 || p.x > W - 24 || p.y > H - 12) return; var w = u.n.length * 6.4 + 10, h = 15, b = [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2]; for (var i = 0; i < cj.length; i++) { var z = cj[i]; if (b[0] < z[2] && b[2] > z[0] && b[1] < z[3] && b[3] > z[1]) return; } cj.push(b); n++; out += '<span' + (G.n === "dep" ? ' class="d"' : "") + ' style="left:' + p.x.toFixed(0) + 'px;top:' + p.y.toFixed(0) + 'px">' + esc(u.n) + '</span>'; });
      if (G.n === "mun" && (G.d || zm >= 6.2)) { /* nombres de departamento más tenues no se dibujan en modo municipal */ }
      lab.innerHTML = out;
    }
    function ajusta(vuela) {
      if (!me.map || !me.ok) return; var f = G.d ? ((T.D.geoDep || {}).features || []).filter(function (z) { return z.properties.n === G.d; })[0] : null, b = [180, 90, -180, -90];
      (function rec(c) { if (typeof c[0] === "number") b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; else c.forEach(rec); })(f ? f.geometry.coordinates : [[-69.7, -22.9], [-57.4, -9.6]]);
      me.map.resize(); me.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: f ? 36 : 14, duration: vuela ? 700 : 0, maxZoom: 9});
    }
    function leyenda() {
      var g = $(uid + "g"), cnt = me.K ? me.K.cls.map(function () { return 0; }) : [], nd = 0;
      me.U.forEach(function (u) { var v = me.vals[u.k]; if (v == null) nd++; else if (me.K) cnt[me.K.idx(v)]++; });
      g.innerHTML = '<b>' + esc(o.t) + (y != null ? " · " + esc(o.yl ? o.yl(y) : y) : "") + '</b>' + (me.K ? me.K.cls.map(function (c, i) { return '<span><i style="background:' + c.c + '"></i>' + esc(c.l) + '<em>' + cnt[i] + '</em></span>'; }).join("") : "") + (nd ? '<span><i style="background:#94a3b8;opacity:.4"></i>Sin dato<em>' + nd + '</em></span>' : "") + (o.fijo ? '<span style="color:#f5b700">Relativo · por validar con CCES</span>' : (o.cat ? "" : '<span style="color:#aab4c6">Cortes por ' + (G.cortes === "q" ? "cuantiles (misma cantidad de territorios por color)" : "intervalos iguales") + '</span>'));
    }
    function cabecera() {
      $(uid + "t").textContent = o.t + (y != null ? " · " + (o.yl ? o.yl(y) : y) : ""); $(uid + "s").textContent = (G.n === "dep" ? "Por departamento" : "Por municipio") + (G.n === "mun" && G.d ? " · " + G.d : " · todo Bolivia") + " · " + o.src;
      var yb = $(uid + "y"); if (o.yrs) { yb.innerHTML = (o.yrs.length > 2 ? '<button id="' + uid + 'pl" title="Reproducir la serie">▶</button>' : "") + '<select id="' + uid + 'sy">' + o.yrs.map(function (v) { return '<option value="' + v + '"' + (v === y ? " selected" : "") + '>' + esc(o.yl ? o.yl(v) : v) + '</option>'; }).join("") + '</select>'; $(uid + "sy").onchange = function () { P[pn].y = +this.value; refresca(); }; var pl = $(uid + "pl"); if (pl) pl.onclick = function () { animar(pn); }; } else yb.innerHTML = "";
      var tl = $(uid + "tl"); if (!tl.innerHTML) { tl.innerHTML = '<button data-b="carto">Calles</button><button data-b="sat">Satélite</button><button data-b="none">Sin mapa</button><label><input type="checkbox" id="' + uid + 'nm"> Nombres</label>'; tl.querySelectorAll("button").forEach(function (b) { b.onclick = function () { G.base = b.dataset.b; panes.forEach(function (q) { q.vis(); q.tools(); }); }; }); $(uid + "nm").onchange = function () { G.nom = this.checked; panes.forEach(function (q) { q.rotular(); q.tools(); }); }; }
      tools();
    }
    function tools() { var tl = $(uid + "tl"); if (!tl) return; tl.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.b === G.base); }); var c = $(uid + "nm"); if (c) c.checked = G.nom; }
    function dibuja(fit) {
      o = CI[P[pn].i]; y = yDef(pn); me.o = o; me.y = y; me.U = unidades(); me.U.forEach(function (u) { u.c = null; });
      var lvOk = o.lv.indexOf(G.n) >= 0; me.vals = lvOk ? valores(o.id, G.n, y) : {};
      me.K = clases(o, me.U.map(function (u) { return me.vals[u.k]; }).filter(function (v) { return v != null; }));
      cabecera(); leyenda();
      if (me.ok) { me.map.getSource("u").setData(geo()); me.map.setPaintProperty("u-l", "line-width", G.n === "dep" ? 1.2 : .6); me.map.setPaintProperty("d-l", "line-width", G.n === "dep" ? 1.4 : 1.8); vis(); if (fit) ajusta(false); setTimeout(rotular, 400); }
    }
    me.dibuja = dibuja; me.vis = vis; me.ajusta = ajusta; me.rotular = rotular; me.tools = tools; me.resalta = function () { if (me.ok) { me.map.getSource("u").setData(geo()); } };
    crear(); return me;
  }
  function rank(pane, k) { var v = pane.vals[k]; if (v == null) return null; var n = 0, t = 0; pane.U.forEach(function (u) { var z = pane.vals[u.k]; if (z != null) { t++; if (z > v) n++; } }); return [n + 1, t]; }

  /* ---------------- interacción ---------------- */
  function url() { var u = new URL(location.href), q = u.searchParams; ["n", "i", "y", "d", "j", "yb", "c", "k"].forEach(function (x) { q.delete(x); }); q.set("n", G.n); q.set("i", P[0].i); if (P[0].y != null) q.set("y", P[0].y); if (G.d) q.set("d", G.d); if (G.cmp) { q.set("c", 1); q.set("j", P[1].i); if (P[1].y != null) q.set("yb", P[1].y); } history.replaceState(null, "", u.toString()); }
  function refresca() { panes.forEach(function (p) { p.dibuja(false); }); lateral(); catalogoUI(); url(); }
  function seleccionar(k) { sel = sel === k ? null : k; panes.forEach(function (p) { p.resalta(); }); lateral(); }
  function animar(pn) { var o = CI[P[pn].i]; if (timer) { clearInterval(timer); timer = null; return; } var i = Math.max(0, o.yrs.indexOf(yDef(pn))); timer = setInterval(function () { i = (i + 1) % o.yrs.length; P[pn].y = o.yrs[i]; refresca(); if (i === o.yrs.length - 1) { clearInterval(timer); timer = null; } }, 1100); }
  function pon(id) {
    var o = CI[id]; if (!o) return; if (o.lv.indexOf(G.n) < 0) { G.n = o.lv[0]; sincroniza(); }
    P[G.act].i = id; P[G.act].y = null; refresca();
  }
  function sincroniza() { document.querySelectorAll("#mn button").forEach(function (b) { b.classList.toggle("on", b.dataset.n === G.n); }); var sd = $("md"); if (sd) sd.value = G.d; }
  function fijaNivel(n) {
    G.n = n; if (n === "dep") { /* el filtro de departamento se conserva solo como zoom */ }
    P.forEach(function (p) { var o = CI[p.i]; if (o.lv.indexOf(n) < 0) { p.i = "riesgo"; p.y = null; } }); sel = null; sincroniza(); refresca(); panes.forEach(function (q) { q.ajusta(true); });
  }

  /* ---------------- paneles laterales ---------------- */
  function catalogoUI() {
    var box = $("mcat"); if (!box) return; var q = ($("mq") && $("mq").value || "").toLowerCase(), grupos = {}, ord = [];
    CAT.forEach(function (o) { if (q && (o.t + " " + o.g).toLowerCase().indexOf(q) < 0) return; if (!grupos[o.g]) { grupos[o.g] = []; ord.push(o.g); } grupos[o.g].push(o); });
    var h = G.cmp ? '<div class="mab"><button data-a="0" class="' + (G.act === 0 ? "on" : "") + '">Mapa A</button><button data-a="1" class="' + (G.act === 1 ? "on" : "") + '">Mapa B</button></div>' : "";
    h += ord.map(function (g) { var has = grupos[g].some(function (o) { return o.id === P[0].i || (G.cmp && o.id === P[1].i); }); return '<details' + (has || q ? " open" : "") + '><summary>' + esc(g) + '</summary>' + grupos[g].map(function (o) { var off = o.lv.indexOf(G.n) < 0, cl = "mi" + (o.id === P[0].i ? " A" : "") + (G.cmp && o.id === P[1].i ? " B" : ""); return '<button class="' + cl + '" data-i="' + o.id + '" title="' + esc(o.def) + '">' + esc(o.t) + '<em>' + (o.lv.length === 1 ? "solo " + (o.lv[0] === "dep" ? "dpto." : "mun.") : (o.yrs ? o.yrs.length + " períodos" : "")) + '</em></button>'; }).join("") + '</details>'; }).join("");
    box.innerHTML = h || '<p class="nota">Sin resultados.</p>';
    box.querySelectorAll(".mi").forEach(function (b) { b.onclick = function () { pon(b.dataset.i); }; });
    box.querySelectorAll(".mab button").forEach(function (b) { b.onclick = function () { G.act = +b.dataset.a; catalogoUI(); }; });
  }
  function stats(pane) { var v = pane.U.map(function (u) { return pane.vals[u.k]; }).filter(function (z) { return z != null; }).sort(function (a, b) { return a - b; }); if (!v.length) return null; return {n: v.length, min: v[0], max: v[v.length - 1], med: v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2}; }
  var rkTab = "alto";
  function lateral() {
    var sd = $("msd"); if (!sd) return; var pa = panes[0], o = pa.o, y = pa.y, st = stats(pa), h = "";
    h += '<div class="mc"><h3>Qué mide · ' + esc(o.t) + (y != null ? " (" + esc(o.yl ? o.yl(y) : y) + ")" : "") + '</h3><p>' + esc(o.def) + '</p><p class="nota"><b>Fuente:</b> ' + esc(o.src) + '.</p>' + (o.nota ? '<p class="nota">' + esc(o.nota) + '</p>' : "") + '</div>';
    if (G.cmp && panes[1]) { var r = correl(panes[0], panes[1]); h += '<div class="cor"><b>A vs B</b> · ' + (r ? 'r de Pearson = <b>' + fmt(r.p, 2) + '</b> · Spearman = <b>' + fmt(r.s, 2) + '</b> (n = ' + r.n + '). ' + esc(interp(r.s)) + ' Una asociación entre territorios no prueba causa.' : 'No hay territorios con dato en ambos mapas para este nivel.') + '</div>'; }
    if (st) { var pais = o.pais ? o.pais(y) : null; h += '<div class="mc"><h3>Resumen del mapa A</h3><div class="mk"><div><b>' + fnum(o, st.med) + '</b><span>mediana</span></div><div><b>' + fnum(o, st.min) + '</b><span>mínimo</span></div><div><b>' + fnum(o, st.max) + '</b><span>máximo</span></div>' + (pais != null ? '<div><b>' + fnum(o, pais) + '</b><span>Bolivia</span></div>' : "") + '</div><p class="nota">' + st.n + ' de ' + pa.U.length + ' territorios con dato.</p>';
      var ord = pa.U.filter(function (u) { return pa.vals[u.k] != null; }).sort(function (a, b) { return rkTab === "alto" ? pa.vals[b.k] - pa.vals[a.k] : pa.vals[a.k] - pa.vals[b.k]; }).slice(0, 8);
      h += '<div class="tabs"><button data-t="alto" class="' + (rkTab === "alto" ? "on" : "") + '">Más altos</button><button data-t="bajo" class="' + (rkTab === "bajo" ? "on" : "") + '">Más bajos</button></div><table class="rk">' + ord.map(function (u, i) { var c = pa.K.cls[pa.K.idx(pa.vals[u.k])]; return '<tr data-k="' + esc(u.k) + '"' + (sel === u.k ? ' class="on"' : "") + '><td>' + (i + 1) + '. <i style="background:' + (c ? c.c : "#999") + '"></i>' + esc(u.n) + (G.n === "mun" ? ' <span class="nota">' + esc(u.d) + '</span>' : "") + '</td><td>' + esc(fnum(o, pa.vals[u.k])) + '</td></tr>'; }).join("") + '</table></div>'; }
    h += '<div class="mc" id="mfi"></div>'; sd.innerHTML = h;
    sd.querySelectorAll(".tabs button").forEach(function (b) { b.onclick = function () { rkTab = b.dataset.t; lateral(); }; });
    sd.querySelectorAll(".rk tr").forEach(function (r) { r.onclick = function () { seleccionar(r.dataset.k); }; });
    ficha();
  }
  function ficha() {
    var el = $("mfi"); if (!el) return; if (!sel) { el.innerHTML = '<h3>Territorio</h3><p class="nota">Haga clic en una zona del mapa o en la lista para ver todos sus indicadores.</p>'; return; }
    var u = panes[0].U.filter(function (z) { return z.k === sel; })[0]; if (!u) { el.innerHTML = '<h3>Territorio</h3><p class="nota">El territorio seleccionado no está en la vista actual.</p>'; return; }
    var h = '<h3>' + esc(u.n) + (G.n === "mun" ? ' <span class="nota">' + esc(u.d) + '</span>' : "") + '</h3>', g0 = null;
    CAT.forEach(function (o) { if (o.lv.indexOf(G.n) < 0) return; var y = o.yrs ? o.yd : null, vs = valores(o.id, G.n, y), v = vs[u.k]; if (o.cat) { h += (g0 !== o.g ? '<div class="sg">' + esc(o.g) + '</div>' : "") + '<div class="sl"><span>' + esc(o.t) + '</span><b>' + esc(AVT[Math.round(v == null ? 0 : v)]) + '</b><span></span></div>'; g0 = o.g; return; } var tot = Object.keys(vs).length, n = 0; Object.keys(vs).forEach(function (k) { if (vs[k] > v) n++; }); if (g0 !== o.g) { h += '<div class="sg">' + esc(o.g) + '</div>'; g0 = o.g; } h += '<div class="sl"><span>' + esc(o.t) + (y != null ? ' <span class="nota">' + esc(o.yl ? o.yl(y) : y) + '</span>' : "") + '</span><b>' + esc(fnum(o, v)) + '</b><span class="rkn">' + (v != null ? "#" + (n + 1) + "/" + tot : "") + '</span></div>'; });
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + (G.n === "mun" ? '<a class="btn p" href="municipio.html?d=' + encodeURIComponent(u.d) + '&m=' + encodeURIComponent(u.n) + '">Ficha completa</a><a class="btn" target="_blank" rel="noopener" href="reporte.html?dep=' + encodeURIComponent(u.d) + '&mun=' + encodeURIComponent(u.n) + '&per=30">Reporte PDF</a>' : '<button class="btn p" id="mvm">Ver sus municipios</button><a class="btn" href="departamento.html?d=' + encodeURIComponent(u.d) + '">Ficha del departamento</a>') + '</div>';
    el.innerHTML = h; var b = $("mvm"); if (b) b.onclick = function () { G.d = u.d; sel = null; fijaNivel("mun"); };
  }
  function correl(a, b) {
    var x = [], y = []; a.U.forEach(function (u) { var p = a.vals[u.k], q = b.vals[u.k]; if (p != null && q != null) { x.push(p); y.push(q); } }); var n = x.length; if (n < 5) return null;
    function pe(x, y) { var mx = x.reduce(function (s, v) { return s + v; }, 0) / n, my = y.reduce(function (s, v) { return s + v; }, 0) / n, sxy = 0, sxx = 0, syy = 0; for (var i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); } return sxy / Math.sqrt(sxx * syy || 1); }
    function rk(v) { var s = v.map(function (z, i) { return [z, i]; }).sort(function (p, q) { return p[0] - q[0]; }), r = new Array(n); for (var i = 0; i < n;) { var j = i; while (j + 1 < n && s[j + 1][0] === s[i][0]) j++; for (var k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; }
    return {p: pe(x, y), s: pe(rk(x), rk(y)), n: n};
  }
  function interp(r) { var a = Math.abs(r), t = a >= .7 ? "fuerte" : a >= .4 ? "moderada" : a >= .2 ? "débil" : "muy débil o nula"; return "Asociación " + t + (a >= .2 ? (r > 0 ? " directa: donde sube A tiende a subir B." : " inversa: donde sube A tiende a bajar B.") : "."); }

  /* ---------------- arranque ---------------- */
  function iniciar() {
    var app = $("app");
    Promise.all([TERR.cargar(), fetch("ine_extra_mun.json?v=20261116d").then(function (r) { return r.json(); }).catch(function () { return null; }), fetch("salud_dep.json?v=20261116d").then(function (r) { return r.json(); }).catch(function () { return null; })]).then(function (r) {
      T = r[0]; A = TERR.api; fmt = A.fmt; A.estilos(); X.header("mapa.html"); if (r[1]) EX = r[1]; SAL = r[2]; catalogo();
      var Q = new URLSearchParams(location.search); G.n = Q.get("n") === "dep" ? "dep" : "mun"; if (!Q.get("n")) G.n = "mun"; if (Q.get("d") && T.DEP[Q.get("d")]) G.d = Q.get("d");
      if (Q.get("i") && CI[Q.get("i")]) P[0].i = Q.get("i"); if (Q.get("y")) P[0].y = +Q.get("y"); if (Q.get("j") && CI[Q.get("j")]) { P[1].i = Q.get("j"); if (Q.get("yb")) P[1].y = +Q.get("yb"); } G.cmp = Q.get("c") === "1";
      P.forEach(function (p) { if (CI[p.i].lv.indexOf(G.n) < 0) G.n = CI[p.i].lv[0]; });
      var deps = Object.keys(T.DEP).sort();
      document.title = "Mapa de Bolivia — Sala de Situación Bolivia";
      app.innerHTML = '<nav class="tnav" aria-label="Ruta"><a href="index.html">Tablero</a><span class="tsep">›</span><b>Territorios · Mapa</b></nav><div class="mtop"><div class="ms"><b>1 · Nivel</b><div class="seg" id="mn"><button data-n="dep">Departamentos</button><button data-n="mun">Municipios</button></div></div><div class="ms"><b>2 · Dónde</b><select id="md"><option value="">Todo Bolivia</option>' + deps.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join("") + '</select></div><div class="ms"><b>3 · Cortes de color</b><div class="seg" id="mc"><button data-c="q">Cuantiles</button><button data-c="e">Intervalos iguales</button></div></div><div class="mgo"><span class="nota" style="font-size:12px">Elija el indicador en la lista de la izquierda. Pase el cursor o haga clic en una zona.</span><button id="mcmp">Comparar dos mapas</button><button id="mcp">Copiar enlace</button></div></div><div class="mg"><div class="mcat"><h3>Indicadores</h3><input type="search" id="mq" placeholder="Buscar indicador…"><div id="mcat"></div></div><div><div class="mmaps" id="mmaps"></div></div><div class="msd" id="msd"></div></div>';
      sincroniza(); $("md").value = G.d;
      document.querySelectorAll("#mn button").forEach(function (b) { b.onclick = function () { fijaNivel(b.dataset.n); }; });
      document.querySelectorAll("#mc button").forEach(function (b) { b.classList.toggle("on", b.dataset.c === G.cortes); b.onclick = function () { G.cortes = b.dataset.c; document.querySelectorAll("#mc button").forEach(function (z) { z.classList.toggle("on", z === b); }); refresca(); }; });
      $("md").onchange = function () { G.d = this.value; sel = null; refresca(); panes.forEach(function (p) { p.ajusta(true); }); };
      $("mq").oninput = catalogoUI; $("mcp").onclick = function () { navigator.clipboard && navigator.clipboard.writeText(location.href); this.textContent = "Enlace copiado"; var b = this; setTimeout(function () { b.textContent = "Copiar enlace"; }, 1600); };
      $("mcmp").onclick = function () { G.cmp = !G.cmp; armar(); };
      armar();
    });
  }
  function armar() {
    var m = $("mmaps"); panes.forEach(function (p) { try { p.map.remove(); } catch (e) {} }); panes = []; m.innerHTML = '<div class="mp" id="mpa"></div>' + (G.cmp ? '<div class="mp" id="mpb"></div>' : ""); m.classList.toggle("dos", G.cmp); $("mcmp").classList.toggle("on", G.cmp); $("mcmp").textContent = G.cmp ? "Cerrar comparación" : "Comparar dos mapas";
    panes.push(Pane(0, $("mpa"))); if (G.cmp) { panes.push(Pane(1, $("mpb"))); G.act = 0; var a = panes[0], b = panes[1], lk = 0; [[a, b], [b, a]].forEach(function (z) { z[0].map.on("move", function () { if (lk) return; lk = 1; z[1].map.jumpTo({center: z[0].map.getCenter(), zoom: z[0].map.getZoom()}); lk = 0; }); }); } else G.act = 0;
    setTimeout(function () { panes.forEach(function (p) { p.map.resize(); }); }, 80); url();
  }
  return {iniciar: iniciar};
})();

/* Módulo Meteorológica: avisos oficiales del SENAMHI por municipio (nivel, fenómeno, intensidad y dirección leídos del texto oficial),
   población y servicios bajo aviso (INE + malla de ~1 km), pronóstico de modelo a 7 días (Open-Meteo) y reportes de prensa con ícono por fenómeno.
   Mapa y fichas comparten el código de MAPAZ (mapa base, íconos, población). Los avisos cubren pocas semanas: no permiten estimar frecuencia. */
var MET = (function () {
  var S = SALA, X = S2, M = MAPAZ, A, T, D, map = null, LG = {d: "", m: ""}, MK = [], rq = 0, SEL = null;
  var st = {v: "avisos", p: "vig", f: "", pp: 7, vr: "tx", dia: 0, nd: false, pob: false, sal: false, eme: false};
  var AV = [], PR = [], FC = [], FX = M.PRON;
  var NC = ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"], NT = ["Verde", "Amarillo", "Naranja", "Rojo"], SIN = "#7b8794", DIA = 864e5, HOY = S.diaKey(Date.now());
  /* fenómenos: orden de clasificación = orden de la lista (granizada y nevada antes que lluvia y frío) */
  var FEN = [
    {k: "vie", n: "Viento", col: "#0f8b8d", re: /viento|r[aá]faga/i},
    {k: "llu", n: "Lluvia con tormenta", col: "#2563eb", re: /lluvia|tormenta|chubasco|precipitaci/i},
    {k: "fri", n: "Descenso de temperatura", col: "#7c3aed", re: /descenso|helada|frente fr[ií]o|fr[ií]o/i},
    {k: "cal", n: "Ascenso de temperatura", col: "#db2777", re: /ascenso|calor|temperaturas altas/i},
    {k: "gra", n: "Granizada", col: "#475569", re: /granizo|granizada/i},
    {k: "nev", n: "Nevada", col: "#38bdf8", re: /nevada|nieve/i}
  ], OTR = {k: "otr", n: "Otros avisos", col: "#64748b"};
  var ORD = ["gra", "nev", "vie", "fri", "cal", "llu"];
  /* variables del pronóstico: clases descriptivas (no son niveles de aviso) */
  var VR = {
    tx: {n: "Temp. máxima", u: "°C", k: "tx", cl: [[20, "#4575b4", "< 20"], [25, "#91bfdb", "20–25"], [30, "#fee090", "25–30"], [35, "#fc8d59", "30–35"], [40, "#d73027", "35–40"], [999, "#7f0000", "≥ 40"]]},
    tn: {n: "Temp. mínima", u: "°C", k: "tn", cl: [[-5, "#313695", "≤ −5"], [0, "#4575b4", "−5 a 0 (helada)"], [5, "#91bfdb", "0–5"], [10, "#d9ecf5", "5–10"], [15, "#fee090", "10–15"], [999, "#fc8d59", "> 15"]]},
    pp: {n: "Lluvia (24 h)", u: "mm", k: "pp", cl: [[1, "#e3ebf5", "< 1"], [10, "#a6d9f7", "1–10"], [25, "#4aa3f5", "10–25"], [50, "#2563eb", "25–50"], [100, "#6d28d9", "50–100"], [9999, "#4c1d95", "> 100"]]},
    ra: {n: "Ráfaga máxima", u: "km/h", k: "ra", cl: [[30, "#d8efec", "< 30"], [50, "#80cbc4", "30–50"], [70, "#26a69a", "50–70"], [90, "#f9a825", "70–90"], [999, "#c62828", "> 90"]]}
  };
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function $(i) { return document.getElementById(i); }
  function fmt(n, d) { return d ? (n == null ? "—" : Number(n).toFixed(d).replace(".", ",")) : M.fmt(n); }
  function fd(s) { return s ? new Date(s + "T12:00:00").toLocaleDateString("es-BO", {day: "numeric", month: "short"}).replace(/\./g, "") : "—"; }
  function fdl(s) { return s ? new Date(s + "T12:00:00").toLocaleDateString("es-BO", {weekday: "short", day: "numeric"}).replace(/\./g, "") : "—"; }
  function ts0(s) { return Date.parse(s + "T00:00:00-04:00"); }
  function ts1(s) { return Date.parse(s + "T23:59:59-04:00"); }
  function dur(ms) { var h = Math.max(1, Math.round(ms / 36e5)); if (h < 48) return h + " h"; var d = Math.floor(h / 24), r = h % 24; return d + " d" + (r ? " " + r + " h" : ""); }
  function resta(a) { var n = Date.now(); if (n < ts0(a.inicio)) return "inicia en " + dur(ts0(a.inicio) - n); if (n <= ts1(a.fin)) return "termina en " + dur(ts1(a.fin) - n); return "terminó hace " + dur(n - ts1(a.fin)); }
  function vig(a) { return a.inicio <= HOY && a.fin >= HOY; }
  function ndias(a) { return Math.round((ts1(a.fin) - ts0(a.inicio)) / DIA); }
  function vigTxt(a) { return a.inicio === a.fin ? fd(a.inicio) : fd(a.inicio) + " – " + fd(a.fin); }
  function rg(a, u) { return !a ? "" : (a[0] === a[1] ? a[0] : a[0] + "–" + a[1]) + (u || ""); }
  function fenDe(k) { for (var i = 0; i < FEN.length; i++) if (FEN[i].k === k) return FEN[i]; return OTR; }
  function clasifica(t) { for (var i = 0; i < ORD.length; i++) { var f = fenDe(ORD[i]); if (f.re.test(t || "")) return f.k; } return "otr"; }
  function nv(a) { if (a.nivel_num != null) return a.nivel_num; var i = NT.map(function (x) { return x.toUpperCase(); }).indexOf(String(a.nivel || "").toUpperCase()); return i < 0 ? 1 : i; }
  function fen(a) { var f = (a.fenomeno || "").trim(); if (f) return f.replace(/\s+/g, " "); var m = /—\s*(.+)$/.exec(a.titulo || ""); return m ? m[1].trim() : "Aviso meteorológico"; }

  /* ---------- lectura de la intensidad y la dirección en el texto oficial ---------- */
  var BR = {"NORTE": 0, "NORESTE": 45, "ESTE": 90, "SURESTE": 135, "SUDESTE": 135, "SUR": 180, "SUROESTE": 225, "SUDOESTE": 225, "OESTE": 270, "NOROESTE": 315};
  var SEC = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"], SECN = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
  function dirDe(txt) {
    var ps = String(txt || "").toUpperCase().replace(/Ó/g, "O").split(/[\s\-–]+/).filter(function (x) { return BR[x] != null; });
    if (!ps.length) return null; var x = 0, y = 0; ps.forEach(function (p) { var r = BR[p] * Math.PI / 180; x += Math.sin(r); y += Math.cos(r); });
    var g = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360, i = Math.round(g / 45) % 8; return {de: g, hacia: (g + 180) % 360, s: SEC[i], n: SECN[i], h: SEC[Math.round(((g + 180) % 360) / 45) % 8]};
  }
  function parsea(a) {
    var t = String(a.descripcion || a.texto || "").replace(/\s+/g, " "), o = {}, m;
    if ((m = /(?:VELOCIDADES?|R[ÁA]FAGAS?)[^.]{0,80}?ENTRE\s+(\d+)\s*Y\s*(\d+)\s*KM\s*\/\s*H/i.exec(t)) || (m = /(\d+)\s*Y\s*(\d+)\s*KM\s*\/\s*H/i.exec(t))) o.vel = [+m[1], +m[2]];
    if ((m = /MONTOS?[^.]{0,60}?ENTRE\s+(\d+)\s*(?:MM)?\s*Y\s*(\d+)\s*MM/i.exec(t))) o.mm = [+m[1], +m[2]];
    if ((m = /ENTRE\s+(-?\d+)\s*°\s*C\s*Y\s*(-?\d+)\s*°\s*C/i.exec(t))) { if (/POR DEBAJO/i.test(t)) o.dT = [+m[1], +m[2]]; else o.t = [+m[1], +m[2]]; }
    if ((m = /DIRECCI[ÓO]N\s+([A-ZÁÉÍÓÚ]+(?:\s*[-–]\s*[A-ZÁÉÍÓÚ]+)?)/i.exec(t))) o.dir = dirDe(m[1]);
    return o;
  }
  function parTxt(a) {
    var p = a._p, o = [];
    if (p.vel) o.push(rg(p.vel, " km/h") + (p.dir ? " del " + p.dir.s : ""));
    if (p.mm) o.push(rg(p.mm, " mm"));
    if (p.t) o.push(rg(p.t, " °C") + (a._k === "cal" ? " (máx.)" : ""));
    if (p.dT) o.push(rg(p.dT, " °C") + " bajo lo normal");
    return o.length ? o.join(" · ") : "sin cifras en el aviso";
  }

  /* ---------- filtros ---------- */
  function dentro(a, p) { if (p === "vig") return vig(a); if (p === "todo") return true; return a.fin >= S.diaKey(Date.now() - (+p) * DIA) && a.inicio <= HOY; }
  function enA(a) { return !LG.d || ((a.departamentos || []).indexOf(LG.d) >= 0 && (!LG.m || (a.municipios || []).indexOf(LG.m + " (" + LG.d + ")") >= 0)); }
  function enM(m) { return !LG.d || (m.d === LG.d && (!LG.m || m.n === LG.m)); }
  function filtrados() { return AV.filter(function (a) { return dentro(a, st.p) && (!st.f || a._k === st.f) && enA(a); }); }
  function mapaNivel(L) { var o = {}; L.forEach(function (a) { a._ms.forEach(function (k) { o[k] = Math.max(o[k] == null ? -1 : o[k], a._n); }); }); return o; }
  function claveMun(n) { var m = /^(.*) \((.*)\)$/.exec(n); return m ? m[2] + "|" + m[1] : null; }
  function popMuns(keys) { var pob = 0, sd = 0, n = 0; keys.forEach(function (k) { var m = T.M[k]; if (m && enM(m)) { n++; if (m.pob == null) sd++; else pob += m.pob; } }); return {n: n, pob: pob, sd: sd}; }
  function infraDe(keys) {
    var o = {hosp: 0, cli: 0, cons: 0, bom: 0, pol: 0};
    keys.forEach(function (k) { var m = T.M[k]; if (!m) return; m.est.forEach(function (p) { o[/hospital/i.test(p[2] || "") ? "hosp" : p[3] === "consultorio" ? "cons" : "cli"]++; }); o.bom += m.bom.length + m.res.length; o.pol += m.pol.length; });
    return o;
  }
  function centro(m) { return M.cen(m); }

  function preparar() {
    AV = (((D.senamhi_alertas || {}).alertas) || []).filter(function (a) { return a.tipo === "meteorológica"; }).map(function (a, i) {
      a._n = nv(a); a._f = fen(a); a._k = clasifica(a._f); a._p = parsea(a);
      a._ms = (a.municipios || []).map(claveMun).filter(function (k) { return k && T.M[k]; }); return a;
    }).sort(function (a, b) { return (b.publicada || "").localeCompare(a.publicada || ""); });
    AV.forEach(function (a, i) { a._i = i; });
    FC = D.ev.filter(function (e) { return e.categoria === "meteorológica" && e.origen === "modelo"; }).sort(function (a, b) { return a.ts - b.ts; });
    var R = /granizada|helada|nevada|lluvia|tormenta|vient|temporal|ola de (fr[ií]o|calor)|sequ[ií]a|descenso|ascenso|r[aá]faga/i;
    PR = D.ev.filter(function (e) { return e.categoria === "meteorológica" && e.origen === "prensa" && ((e.departamentos && e.departamentos.length) || e.lat != null) && R.test(e.titulo); }).map(function (e) { e._k = clasifica(e.titulo); return e; });
  }

  /* ---------- pronóstico de modelo (Open-Meteo, desde el navegador) ---------- */
  function cargarPron(forzar) { M.pron(pronListo, forzar); if (st.v === "pron") dibuja(); }
  function pronListo() { if (st.dia >= FX.dias.length) st.dia = 0; avisoPron(); graficos(); if (st.v === "pron") dibuja(); }
  function vPunto(p, vr, d) { var a = p[VR[vr].k]; return a && a[d] != null ? a[d] : null; }
  function clasePron(vr, v) { if (v == null) return null; var c = VR[vr].cl; for (var i = 0; i < c.length; i++) if (v <= c[i][0]) return c[i]; return c[c.length - 1]; }
  var CLARO = /^#(fee090|d9ecf5|e3ebf5|d8efec|91bfdb|a6d9f7|80cbc4)$/i;
  function avisoPron() {
    var el = $("mAq"); if (!el) return; if (st.v !== "pron" || FX.estado === "ok") { el.hidden = true; return; }
    el.hidden = false; el.innerHTML = FX.estado === "cargando" || FX.estado === "idle" ? 'Consultando el pronóstico del modelo Open-Meteo…' : 'No se pudo consultar el pronóstico (' + esc(FX.msg) + '). <button class="xlink" type="button" id="mAqR">Reintentar</button>';
    var r = $("mAqR"); if (r) r.onclick = function () { cargarPron(true); };
  }

  /* ---------- pulso: una tarjeta por fenómeno ---------- */
  function faja(k) {
    var L = AV.filter(function (a) { return a._k === k && enA(a); }), n = 17, w = 100 / n, h = "";
    for (var i = 0; i < n; i++) {
      var d = S.diaKey(Date.now() + (i - 13) * DIA), mx = -1; L.forEach(function (a) { if (a.inicio <= d && a.fin >= d) mx = Math.max(mx, a._n); });
      h += '<rect x="' + (i * w + .25).toFixed(2) + '%" y="3" width="' + (w - .5).toFixed(2) + '%" height="14" rx="2" fill="' + (mx < 0 ? "currentColor" : NC[Math.min(3, mx)]) + '" opacity="' + (mx < 0 ? .13 : 1) + '"' + (i === 13 ? ' stroke="currentColor" stroke-width="1.6"' : "") + '><title>' + fd(d) + (i === 13 ? " (hoy)" : "") + ": " + (mx < 0 ? "sin aviso" : NT[Math.min(3, mx)]) + '</title></rect>';
    }
    return '<svg class="mst" viewBox="0 0 100 20" preserveAspectRatio="none" aria-label="Avisos de los últimos 14 días y próximos 3">' + h + '</svg>';
  }
  function tarjeta(f) {
    var todos = AV.filter(function (a) { return a._k === f.k && enA(a); }), v = todos.filter(vig), prox = todos.filter(function (a) { return a.inicio > HOY; }), mx = v.reduce(function (a, x) { return Math.max(a, x._n); }, -1);
    var keys = {}; v.forEach(function (a) { a._ms.forEach(function (k) { keys[k] = 1; }); }); var pm = popMuns(Object.keys(keys)), top = v.slice().sort(function (a, b) { return b._n - a._n || b.fin.localeCompare(a.fin); })[0];
    var ult = todos.filter(function (a) { return a.fin < HOY; }).sort(function (a, b) { return b.fin.localeCompare(a.fin); })[0];
    var big = v.length ? '<span style="color:' + NC[Math.min(3, mx)] + '">' + NT[Math.min(3, mx)] + '</span>' : '<span style="color:var(--mut);font-weight:700">Sin aviso</span>';
    var sub = v.length ? pm.n + ' municipio' + (pm.n === 1 ? "" : "s") + ' · ' + (pm.pob ? M.fmtP(pm.pob) + ' hab.' : 'sin población') + (v.length > 1 ? ' · ' + v.length + ' avisos' : '') : (prox.length ? 'Próximo: inicia el ' + fd(prox[prox.length - 1].inicio) : ult ? 'Último aviso: ' + fd(ult.fin) + ' (hace ' + Math.max(1, Math.round((Date.parse(HOY + "T12:00:00") - Date.parse(ult.fin + "T12:00:00")) / DIA)) + ' d)' : 'sin avisos en el período disponible');
    return '<div class="card cpc mf' + (st.f === f.k ? " on" : "") + (v.length ? "" : " off") + '" data-f="' + f.k + '" role="button" tabindex="0" style="--k:' + f.col + '" title="Filtrar el mapa por este fenómeno"><div class="eye">' + M.ico(f.k === "otr" ? "otr" : f.k, 20) + '<span>' + esc(f.n) + '</span></div><div class="big">' + big + '</div><div class="sub">' + sub + '</div>' +
      (top ? '<div class="mpar" style="color:' + f.col + '">' + esc(parTxt(top)) + '</div><div class="sub">' + vigTxt(top) + ' · ' + resta(top) + '</div>' : '') + faja(f.k) + '</div>';
  }
  function pulso() {
    var fs = FEN.slice(); if (AV.some(function (a) { return a._k === "otr" && enA(a) && dentro(a, 30); })) fs.push(OTR);
    $("mPul").className = "cpul c" + (fs.length > 6 ? 7 : 6); $("mPul").innerHTML = fs.map(tarjeta).join("");
    [].forEach.call(document.querySelectorAll("#mPul .mf"), function (c) { var go = function () { st.f = st.f === c.dataset.f ? "" : c.dataset.f; SEL = null; dibuja(); }; c.onclick = go; c.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
  }

  /* ---------- página ---------- */
  function html() {
    return '<nav class="tnav"><a href="index.html">Tablero</a><span class="tsep">›</span><b>Tipo de evento · Meteorológica</b></nav><h1 class="th">Meteorológica <small>avisos del SENAMHI y pronóstico</small></h1>' +
      '<div class="cap">Los <b>avisos</b> son oficiales (SENAMHI); la intensidad y la dirección se leen de su texto. El <b>pronóstico de modelo</b> (Open-Meteo) no es un aviso. Los avisos disponibles cubren pocas semanas: <b>no permiten estimar frecuencia</b>. Información preliminar.</div>' +
      '<div class="cpul c6" id="mPul"></div>' +
      '<div class="xq"><div class="xs1" id="lgBox"></div></div>' +
      '<div class="cvw"><b>Ver en el mapa</b><button type="button" data-v="avisos">' + X.ic("shield") + 'Avisos</button><button type="button" data-v="pron">' + X.ic("sun") + 'Pronóstico 7 días</button><button type="button" data-v="prensa">' + X.ic("doc") + 'Prensa</button></div>' +
      '<div class="cvc" id="mCtl"></div><div class="xhelp" id="mH"></div>' +
      '<div class="xg"><div class="xmw"><div class="xtool" id="mTool"><span class="xtl">Mapa base</span><button type="button" data-b="calles" class="on">Calles</button><button type="button" data-b="topo">Relieve</button><button type="button" data-b="sat">Satélite</button><button type="button" data-b="none">Sin mapa</button><span class="xsp"></span><span class="xtl">Añadir al mapa</span><label><input type="checkbox" id="mNd"> Nombres de departamentos</label><label><input type="checkbox" id="mLp"> Población</label><label><input type="checkbox" id="mLs"> Hospitales y centros de salud</label><label><input type="checkbox" id="mLe"> Bomberos y policía</label></div>' +
      '<div style="position:relative"><div class="xmap" id="mMap"></div><div class="xav" id="mAv" style="top:14px" hidden></div><div class="xav" id="mAq" style="top:14px" hidden></div><div class="xlab" id="mLb" style="top:0;bottom:0;height:auto;min-height:0"></div></div><div class="xleg" id="mL"></div></div>' +
      '<div class="xside"><div id="mDet"></div></div></div><div id="eviP"></div>' +
      '<div class="card" style="margin-top:12px"><h3>Cronología de avisos por fenómeno</h3><div id="mG1" style="height:230px"></div><p class="nota" id="mG1n"></p></div>' +
      '<div class="xg2"><div class="card"><h3>Población bajo aviso, por día</h3><div id="mG2" style="height:230px"></div><p class="nota" id="mG2n"></p></div>' +
      '<div class="card"><h3>Pronóstico por capital</h3><div id="mG3" style="height:230px"></div><p class="nota" id="mG3n"></p></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="xtabs"><button class="on" data-s="mTa">Avisos (lista)</button><button data-s="mTp">Prensa</button><button data-s="mTf">Alertas de modelo del sistema</button></div><div id="mTa"></div><div id="mTp" style="display:none"></div><div id="mTf" style="display:none"></div></div>' +
      '<div id="mMon">' + (window.CLIMA ? CLIMA.seccion("meteo", cfgMon()) : "") + '</div>';
  }
  function cfgMon() { return {col: "#0f8b8d", geoMun: D.geoMun, colN: NC, nivT: ["Verde", "Amarillo", "Naranja", "Rojo"], avisos: function (k) { return AV.filter(function (a) { return (a.municipios || []).indexOf(k) >= 0; }); }}; }
  function ayuda() {
    var v = st.v, h, fl = st.f ? '<span class="mfil">' + esc(fenDe(st.f).n) + '<button type="button" id="mFq" title="Quitar el filtro" aria-label="Quitar el filtro">×</button></span> ' : "";
    if (v === "avisos") { var L = filtrados(); h = '<b>' + L.length + ' aviso' + (L.length === 1 ? "" : "s") + '</b> en ' + esc(LUGAR.etiqueta(LG)) + ' · ' + ({vig: "vigentes hoy", 7: "últimos 7 días", 30: "últimos 30 días", todo: "todo lo disponible"})[st.p] + ' ' + fl + '<span class="nota">— Toque un municipio o un ícono para ver parámetros, población y servicios. Excluye los avisos hidrológicos (módulo Hidrológica).</span>'; }
    else if (v === "pron") h = '<b>' + esc(VR[st.vr].n) + '</b> · ' + (FX.estado === "ok" ? (st.dia === 0 ? "hoy" : fd(FX.dias[st.dia])) : FX.estado === "error" ? "sin conexión con el modelo" : "consultando…") + ' <span class="nota">— Modelo Open-Meteo en puntos de ~1°, no son estaciones. Contorno naranja: municipio con aviso vigente.</span>';
    else h = '<b>' + prensaL().length + ' reportes</b> de prensa con lugar en ' + esc(LUGAR.etiqueta(LG)) + ' <span class="nota">— Ubicación aproximada (lugar nombrado en la nota); son hechos reportados, no avisos.</span>';
    $("mH").innerHTML = h; var q = $("mFq"); if (q) q.onclick = function () { st.f = ""; SEL = null; dibuja(); };
  }
  function controles() {
    var h = "", ch = function (t, k, val, cur) { return '<button type="button" data-k="' + k + '" data-v="' + val + '"' + (String(cur) === String(val) ? ' class="on"' : "") + '>' + t + '</button>'; };
    if (st.v === "avisos") h = '<div class="cg"><b>Período</b>' + [["vig", "Vigentes hoy"], ["7", "7 días"], ["30", "30 días"], ["todo", "Todo lo disponible"]].map(function (x) { return ch(x[1], "p", x[0], st.p); }).join("") + '</div>';
    else if (st.v === "pron") { h = '<div class="cg"><b>Variable</b>' + Object.keys(VR).map(function (k) { return ch(VR[k].n, "vr", k, st.vr); }).join("") + '</div>'; if (FX.estado === "ok") h += '<div class="cg"><b>Día</b>' + FX.dias.map(function (d, i) { return ch(i === 0 ? "Hoy" : i === 1 ? "Mañana" : fdl(d), "dia", i, st.dia); }).join("") + '</div>'; }
    else h = '<div class="cg"><b>Período</b>' + [["1", "24 h"], ["7", "7 días"], ["30", "30 días"]].map(function (x) { return ch(x[1], "pp", x[0], st.pp); }).join("") + '</div>';
    $("mCtl").innerHTML = h;
    [].forEach.call($("mCtl").querySelectorAll("button[data-k]"), function (b) { b.onclick = function () { var k = b.dataset.k; st[k] = (k === "p") ? b.dataset.v : (k === "vr") ? b.dataset.v : +b.dataset.v; if (k !== "dia" && k !== "vr") SEL = null; if (k === "vr" && SEL && SEL.t !== "fx") SEL = null; dibuja(); }; });
  }

  /* ---------- fichas ---------- */
  function dato(k, v, full) { return '<div class="gpar' + (full ? " full" : "") + '"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function cab(badge, col, tit, sub, tc) { return '<div class="gfi-h"><div class="gfi-m" style="--c:' + col + ';font-size:11px' + (tc ? ';color:' + tc : "") + '">' + badge + '</div><div><h3>' + tit + '</h3><div class="nota">' + sub + '</div></div></div>'; }
  function contexto(a) {
    var mis = AV.filter(function (z) { return z._k === a._k && z !== a; }), ant = mis.filter(function (z) { return z.fin < a.inicio || (z.inicio < a.inicio && z.fin <= a.fin); }).sort(function (x, y) { return y.fin.localeCompare(x.fin); })[0], sig = mis.filter(function (z) { return z.inicio > a.fin || (z.inicio > a.inicio && z.fin > a.fin); }).sort(function (x, y) { return x.inicio.localeCompare(y.inicio); })[0];
    var ini = AV.reduce(function (m, z) { return !m || z.inicio < m ? z.inicio : m; }, "");
    return dato("Avisos de este fenómeno", (mis.length + 1) + ' desde el ' + fd(ini)) +
      (ant ? dato("Aviso anterior", '<a href="#" data-av="' + ant._i + '">' + esc(ant.numero || "") + '</a> · ' + vigTxt(ant)) : "") + (sig ? dato("Aviso siguiente", '<a href="#" data-av="' + sig._i + '">' + esc(sig.numero || "") + '</a> · ' + vigTxt(sig)) : "");
  }
  function fichaAviso(a) {
    var f = fenDe(a._k), p = a._p, pm = popMuns(a._ms), I = infraDe(a._ms), pr = a._ms.map(function (k) { return T.M[k]; }).sort(function (x, y) { return (y.pob || 0) - (x.pob || 0); }).slice(0, 5), sin = (a.n_municipios || 0) - a._ms.length;
    var di = p.dir ? p.dir.n + ' (' + p.dir.s + '): el viento sopla del ' + p.dir.s + ' hacia el ' + p.dir.h : null;
    return '<div class="xc gfi">' + cab(NT[Math.min(3, a._n)], NC[Math.min(3, a._n)], M.ico(a._k, 20) + ' ' + esc(a._f), 'Aviso ' + esc(a.numero || "") + ' · publicado ' + esc((a.publicada || "").slice(0, 16)) + ' · SENAMHI') +
      '<div class="gsec">Parámetros del aviso</div><div class="gpars">' + dato("Nivel", '<span style="color:' + NC[Math.min(3, a._n)] + '">' + NT[Math.min(3, a._n)] + '</span>') + dato("Vigencia", vigTxt(a) + ' <small>(' + ndias(a) + ' día' + (ndias(a) === 1 ? "" : "s") + ')</small>') + dato("Estado", resta(a)) +
      (p.vel ? dato("Velocidad del viento", rg(p.vel, " km/h")) : "") + (di ? dato("Dirección", di, true) : "") + (p.mm ? dato("Lluvia acumulada", rg(p.mm, " mm")) : "") + (p.t ? dato(a._k === "cal" ? "Temperatura máxima" : "Temperatura", rg(p.t, " °C")) : "") + (p.dT ? dato("Descenso", rg(p.dT, " °C") + ' <small>bajo lo normal de cada región</small>') : "") +
      dato("Departamentos", esc((a.departamentos || []).join(", ")) || "—", true) + dato("Municipios", (a.n_municipios || a._ms.length) + (sin > 0 ? ' <small>(' + sin + ' sin identificar en el mapa)</small>' : "")) + dato("Cifras en el aviso", parTxt(a) === "sin cifras en el aviso" ? "no indica" : "sí") + '</div>' +
      '<div class="gsec">Población y servicios bajo aviso</div><div class="gpars">' + dato("Población (INE)", pm.pob ? M.fmtP(pm.pob) + ' hab.' : "sin dato") + dato("Hospitales", I.hosp) + dato("Centros, puestos, clínicas", I.cli) + dato("Consultorios", I.cons) + dato("Bomberos y rescate", I.bom) + dato("Policía", I.pol) + '</div>' +
      (pr.length ? '<table class="xt2 gfi-t"><tr><td></td><td style="text-align:right"><b>Hab.</b></td></tr>' + pr.map(function (m) { return '<tr><td><a href="#" data-mun="' + esc(m.k) + '">' + esc(m.n) + '</a> <small class="nota">' + esc(m.d) + '</small></td><td style="text-align:right">' + (m.pob != null ? M.fmtP(m.pob) : "s/d") + '</td></tr>'; }).join("") + '</table>' : '') +
      '<p class="nota" style="margin:6px 0">Población: total municipal (INE); un aviso alcanza municipios enteros, aunque la zona afectada puede ser menor. Establecimientos y servicios: OpenStreetMap, cobertura incompleta.</p>' +
      '<div class="gsec">Contexto</div><div class="gpars">' + contexto(a) + '</div>' +
      '<details class="mdet" style="margin-top:8px"><summary>Texto oficial del aviso</summary><p>' + esc(a.descripcion || a.texto || "—") + '</p></details>' +
      '<p class="nota" style="margin:8px 0 0">Es un pronóstico oficial, no una observación. Las cifras de intensidad se leen del texto; si el aviso no las trae, no se inventan.</p>' +
      (a.url ? '<a class="btn" href="' + esc(a.url) + '" target="_blank" rel="noopener">Abrir en SENAMHI →</a>' : "") + '</div>';
  }
  function fichaMun(k) {
    var m = T.M[k], L = AV.filter(function (a) { return a._ms.indexOf(k) >= 0; }), Lf = filtrados().filter(function (a) { return a._ms.indexOf(k) >= 0; }), I = infraDe([k]), mg = M.mallaMun(k), por = {};
    L.forEach(function (a) { por[a._k] = (por[a._k] || 0) + 1; });
    var mx = Lf.reduce(function (a, x) { return Math.max(a, x._n); }, -1), hosp = m.est.filter(function (p) { return /hospital/i.test(p[2] || ""); }).slice(0, 3).map(function (p) { return esc(p[2]); });
    var dens = mg && mg.n ? mg.cel.ci.reduce(function (a, i) { return a; }, 0) : 0;
    return '<div class="xc gfi">' + cab(mx < 0 ? "Sin aviso" : NT[Math.min(3, mx)], mx < 0 ? SIN : NC[Math.min(3, mx)], esc(m.n), esc(m.d) + ' · municipio') +
      '<div class="gsec">Avisos en el filtro</div>' + (Lf.length ? '<table class="mlist">' + Lf.map(function (a) { return '<tr data-i="' + a._i + '"><td>' + M.ico(a._k, 16) + '</td><td><b style="color:' + NC[Math.min(3, a._n)] + '">' + NT[Math.min(3, a._n)] + '</b> · ' + esc(a._f) + '<br><small class="nota">' + esc(parTxt(a)) + ' · ' + vigTxt(a) + ' · ' + resta(a) + '</small></td></tr>'; }).join("") + '</table>' : '<p class="nota">Ningún aviso en este filtro. Cambie el período o el fenómeno.</p>') +
      '<div class="gsec">Municipio</div><div class="gpars">' + dato("Población (INE)", m.pob != null ? A.fmt(m.pob) + ' hab.' : "sin dato") + dato("Superficie", fmt(m.km2) + " km²") + dato("Densidad media", m.pob != null && m.km2 ? fmt(m.pob / m.km2, 1) + ' hab./km²' : "—") +
      dato("Avisos en el período disponible", L.length ? L.length + ' · ' + Object.keys(por).map(function (q) { return esc(fenDe(q).n) + ' ' + por[q]; }).join(", ") : "ninguno", true) + '</div>' +
      '<div class="gsec">Qué hay en el municipio</div><div class="gpars">' + dato("Hospitales", I.hosp + (hosp.length ? ' <small>' + hosp.join(", ") + '</small>' : "")) + dato("Centros, puestos, clínicas", I.cli) + dato("Consultorios", I.cons) + dato("Bomberos y rescate", I.bom) + dato("Policía", I.pol) + '</div>' +
      '<p class="nota" style="margin:6px 0">' + (mg ? 'El mapa muestra dónde vive la gente: celdas de ~1 km (malla WorldPop repartida y reescalada al total INE ' + esc(mg.anio) + '; ' + A.fmt(mg.n) + ' celdas pobladas). ' : 'Sin la malla de población, se pinta el municipio entero. ') + 'Establecimientos y servicios: OpenStreetMap, cobertura incompleta.</p>' +
      '<div class="xact"><a class="btn" href="municipio.html?d=' + encodeURIComponent(m.d) + '&m=' + encodeURIComponent(m.n) + '">Perfil del municipio →</a><a class="btn s" href="#mMon" id="mIrMon">Monitoreo climático ↓</a></div></div>';
  }
  function fichaPron(i) {
    var p = FX.pts[i]; if (!p) return '<div class="xc xhint">Punto no disponible.</div>'; var vr = st.vr, v = vPunto(p, vr, st.dia), c = clasePron(vr, v), m = T.donde(p.lat, p.lon), av = AV.filter(function (a) { return vig(a) && m && a._ms.indexOf(m.k) >= 0; });
    var mx = function (k, f) { var a = p[k] || [], b = -1e9, j = -1; a.forEach(function (x, n) { if (x != null && (f ? x > b : -x > b)) { b = f ? x : -x; j = n; } }); return j < 0 ? "—" : fmt(f ? b : -b, 1) + " " + (k === "tn" || k === "tx" ? "°C" : k === "pp" ? "mm" : "km/h") + " (" + fd(FX.dias[j]) + ")"; };
    var tot = (p.pp || []).reduce(function (a, x) { return a + (x || 0); }, 0);
    return '<div class="xc gfi">' + cab(v == null ? "—" : fmt(v, 0) + '<small> ' + VR[vr].u + '</small>', c ? c[1] : SIN, esc(M.nombrePunto(p)) + (p.cap ? ' <small class="nota">capital</small>' : ""), 'Punto del modelo · ' + (st.dia === 0 ? "hoy" : fd(FX.dias[st.dia])) + ' · ' + esc(VR[vr].n), c && CLARO.test(c[1]) ? "#10233d" : "") +
      '<div id="mFxC" style="height:200px"></div><div class="gsec">Próximos 7 días en este punto</div><div class="gpars">' + dato("Temp. máxima más alta", mx("tx", 1)) + dato("Temp. mínima más baja", mx("tn", 0)) + dato("Lluvia en 7 días", fmt(tot, 1) + ' mm') + dato("Día más lluvioso", mx("pp", 1)) + dato("Ráfaga más fuerte", mx("ra", 1), true) + '</div>' +
      '<div class="gsec">Aviso oficial en el municipio</div>' + (av.length ? '<table class="mlist">' + av.map(function (a) { return '<tr data-i="' + a._i + '"><td>' + M.ico(a._k, 16) + '</td><td><b style="color:' + NC[Math.min(3, a._n)] + '">' + NT[Math.min(3, a._n)] + '</b> · ' + esc(a._f) + '<br><small class="nota">' + esc(parTxt(a)) + ' · ' + vigTxt(a) + '</small></td></tr>'; }).join("") + '</table>' : '<p class="nota">' + (m ? 'Sin aviso meteorológico vigente en ' + esc(m.n) + '.' : 'El punto no cae dentro de un municipio.') + '</p>') +
      '<p class="nota" style="margin:8px 0 0">Valor de un punto de modelo (~1°), no de una estación: puede diferir mucho en valles y montañas. Compárelo siempre con SENAMHI. Las clases de color son descriptivas, no niveles de aviso.</p></div>';
  }
  function fichaPrensa(e) {
    var f = fenDe(e._k), ok = D.ev.some(function (z) { return z.id === e.id; });
    return '<div class="xc gfi">' + cab(M.ico(e._k, 26), f.col, esc(e.titulo), esc(S.fecha ? S.fecha(e.ts) : new Date(e.ts).toLocaleString("es-BO")) + ' · ' + esc(e.fuente || "prensa")) +
      '<div class="gpars">' + dato("Fenómeno (por el titular)", esc(f.n)) + dato("Lugar", esc(e.lugar || (e.departamentos || []).join(", ") || "—")) + dato("Ubicación en el mapa", esc(e.metodo || "aproximada"), true) + '</div>' +
      '<p class="nota" style="margin:8px 0 0">Hecho reportado por la prensa: no es un aviso ni está confirmado. El punto marca el lugar nombrado en la nota, no el sitio exacto.</p>' + (e.url ? '<a class="btn" href="' + esc(e.url) + '" target="_blank" rel="noopener">Abrir la nota →</a> ' : '') + (ok ? '<a class="btn" href="evento.html?id=' + encodeURIComponent(e.id) + '">Abrir ficha del hecho →</a>' : '') + '</div>';
  }
  function detalle() {
    var el = $("mDet"); if (!el) return; var h;
    if (!SEL) h = '<div class="xc xhint"><h3>' + (st.v === "avisos" ? "Avisos" : st.v === "pron" ? "Pronóstico" : "Prensa") + '</h3>' + (st.v === "avisos" ? 'Toque un municipio coloreado o un ícono de fenómeno para ver los parámetros del aviso, la población y los servicios.' : st.v === "pron" ? (FX.estado === "ok" ? 'Toque un punto del mapa para ver su pronóstico de 7 días y el aviso oficial del municipio.' : 'El pronóstico se consulta al modelo Open-Meteo desde su navegador.') : 'Toque un reporte para ver su detalle.') + '</div>';
    else if (SEL.t === "av") h = fichaAviso(AV[SEL.i]); else if (SEL.t === "mun") h = fichaMun(SEL.k); else if (SEL.t === "fx") h = fichaPron(SEL.i); else h = fichaPrensa(SEL.e);
    el.innerHTML = h;
    [].forEach.call(el.querySelectorAll("a[data-av]"), function (a) { a.onclick = function (e) { e.preventDefault(); SEL = {t: "av", i: +a.dataset.av}; selecciona(true); }; });
    [].forEach.call(el.querySelectorAll("a[data-mun]"), function (a) { a.onclick = function (e) { e.preventDefault(); SEL = {t: "mun", k: a.dataset.mun}; selecciona(true); }; });
    [].forEach.call(el.querySelectorAll("tr[data-i]"), function (r) { r.onclick = function () { SEL = {t: "av", i: +r.dataset.i}; selecciona(true); }; });
    var ir = $("mIrMon"); if (ir) ir.onclick = function (e) { e.preventDefault(); var m = SEL && T.M[SEL.k]; if (m && window.CLIMA) CLIMA.irMun(m.n + " (" + m.d + ")"); var s = $("mMon"); if (s) s.scrollIntoView({behavior: "smooth"}); };
    if (SEL && SEL.t === "fx") serieFx(FX.pts[SEL.i]);
  }
  function serieFx(p) {
    if (!p || !$("mFxC")) return; var tx = X.css("--mut") || "#888", d = FX.dias.map(fdl);
    X.chart("mFxC", {tooltip: {trigger: "axis"}, legend: {top: 0, textStyle: {color: tx, fontSize: 11}, data: ["Máx.", "Mín.", "Lluvia (mm)"]}, grid: {left: 36, right: 40, top: 28, bottom: 22}, xAxis: {type: "category", data: d, axisLabel: {color: tx, fontSize: 10}},
      yAxis: [{type: "value", axisLabel: {color: tx, formatter: "{value}°"}, splitLine: {lineStyle: {opacity: .25}}}, {type: "value", axisLabel: {color: "#2563eb"}, splitLine: {show: false}, min: 0}],
      series: [{name: "Lluvia (mm)", type: "bar", yAxisIndex: 1, data: p.pp, itemStyle: {color: "#4aa3f5", opacity: .75, borderRadius: [3, 3, 0, 0]}}, {name: "Máx.", type: "line", data: p.tx, smooth: .3, symbol: "circle", symbolSize: 5, lineStyle: {color: "#d73027", width: 2}, itemStyle: {color: "#d73027"}}, {name: "Mín.", type: "line", data: p.tn, smooth: .3, symbol: "circle", symbolSize: 5, lineStyle: {color: "#4575b4", width: 2}, itemStyle: {color: "#4575b4"}}]});
  }

  /* ---------- datos del mapa ---------- */
  function prensaL() { var t0 = Date.now() - st.pp * DIA; return PR.filter(function (e) { return e.lat != null && e.ts >= t0 && LUGAR.ev(T, LG, e); }); }
  function geoMun(L) {
    var ms = mapaNivel(L), vg = {}; AV.forEach(function (a) { if (vig(a)) a._ms.forEach(function (k) { vg[k] = 1; }); });
    return M.fc(T.lista.map(function (m) { var v = enM(m) ? ms[m.k] : null; return {type: "Feature", geometry: m.f.geometry, properties: {k: m.k, c: v == null ? SIN : NC[Math.min(3, v)], o: st.v === "avisos" ? (v == null ? .08 : .7) : 0, s: SEL && SEL.t === "mun" && SEL.k === m.k ? 1 : 0, a: vg[m.k] ? 1 : 0}}; }));
  }
  /* un ícono por fenómeno y departamento, en el centro de los municipios alcanzados */
  function geoIconos(L) {
    var g = {}; L.forEach(function (a) { a._ms.forEach(function (k) { var m = T.M[k]; if (!m || !enM(m)) return; var key = a._k + "|" + m.d, o = g[key] || (g[key] = {k: a._k, d: m.d, n: 0, mx: 0, av: {}, ms: {}, x: 0, y: 0}); if (!o.ms[k]) { o.ms[k] = 1; var c = centro(m); o.x += c[0]; o.y += c[1]; o.n++; } o.mx = Math.max(o.mx, a._n); o.av[a._i] = 1; }); });
    var por = {}; Object.keys(g).forEach(function (q) { (por[g[q].d] = por[g[q].d] || []).push(g[q]); });
    var f = []; Object.keys(por).forEach(function (d) { var l = por[d].sort(function (a, b) { return ORD.indexOf(a.k) - ORD.indexOf(b.k); }); l.forEach(function (o, j) { f.push({type: "Feature", geometry: {type: "Point", coordinates: [o.x / o.n, o.y / o.n]}, properties: {ic: o.k, k: o.k, d: d, n: o.n, mx: o.mx, na: Object.keys(o.av).length, off: l.length + "_" + j, ai: Object.keys(o.av).map(Number).sort(function (x, y) { return AV[y]._n - AV[x]._n; })[0]}}); }); });
    return M.fc(f);
  }
  function geoViento(L) {
    var f = [], vistos = {}; L.forEach(function (a) { if (a._k !== "vie" || !a._p.dir) return; a._ms.forEach(function (k) { var m = T.M[k]; if (!m || !enM(m)) return; var c = centro(m), q = Math.round(c[0] / .6) + "," + Math.round(c[1] / .6) + "," + Math.round(a._p.dir.hacia); if (vistos[q]) return; vistos[q] = 1; f.push({type: "Feature", geometry: {type: "Point", coordinates: c}, properties: {rot: a._p.dir.hacia, i: a._i}}); }); });
    return M.fc(f);
  }
  function geoPrensa() { return M.fc(prensaL().map(function (e, i) { return {type: "Feature", geometry: {type: "Point", coordinates: [e.lon, e.lat]}, properties: {i: i, ic: e._k, s: SEL && SEL.t === "pn" && SEL.e === e ? 1 : 0}}; })); }
  function geoPron() {
    if (FX.estado !== "ok") return M.fc([]);
    return M.fc(FX.pts.map(function (p, i) { var v = vPunto(p, st.vr, st.dia), c = clasePron(st.vr, v); return v == null ? null : {type: "Feature", geometry: {type: "Point", coordinates: [p.lon, p.lat]}, properties: {i: i, v: v, c: c[1], s: SEL && SEL.t === "fx" && SEL.i === i ? 1 : 0}}; }).filter(Boolean));
  }
  var OFS = (function () { var e = ["match", ["get", "off"]], n, j; for (n = 1; n <= 6; n++) for (j = 0; j < n; j++) { e.push(n + "_" + j); e.push(["literal", [(j - (n - 1) / 2) * 27, 0]]); } e.push(["literal", [0, 0]]); return e; })();
  function bajo(m) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark";
    m.addSource("mv", {type: "geojson", data: geoMun([])});
    m.addLayer({id: "mv-f", type: "fill", source: "mv", paint: {"fill-color": ["get", "c"], "fill-opacity": ["get", "o"]}});
    m.addLayer({id: "mv-o", type: "line", source: "mv", layout: {visibility: "none"}, filter: ["==", ["get", "a"], 1], paint: {"line-color": "#f26a1b", "line-width": 1.8, "line-dasharray": [2, 1.5]}});
    m.addLayer({id: "mv-s", type: "line", source: "mv", filter: ["==", ["get", "s"], 1], paint: {"line-color": osc ? "#ffffff" : "#10233d", "line-width": 3}});
  }
  function alto(m) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark", ik = ["interpolate", ["linear"], ["zoom"], 4, .62, 7, .85, 10, 1.15];
    m.addSource("wd", {type: "geojson", data: geoViento([])}); m.addSource("ai", {type: "geojson", data: geoIconos([])}); m.addSource("pn", {type: "geojson", data: geoPrensa()}); m.addSource("fx", {type: "geojson", data: geoPron()});
    m.addLayer({id: "fx-b", type: "circle", source: "fx", layout: {visibility: "none"}, paint: {"circle-radius": ["interpolate", ["exponential", 1.6], ["zoom"], 4, 16, 6, 38, 8, 110, 10, 300], "circle-color": ["get", "c"], "circle-opacity": .55, "circle-blur": .55}});
    m.addLayer({id: "fx-c", type: "circle", source: "fx", layout: {visibility: "none"}, paint: {"circle-radius": ["case", ["==", ["get", "s"], 1], 8, 5], "circle-color": ["get", "c"], "circle-stroke-color": ["case", ["==", ["get", "s"], 1], osc ? "#fff" : "#000", "rgba(255,255,255,.85)"], "circle-stroke-width": ["case", ["==", ["get", "s"], 1], 3, 1.2]}});
    m.addLayer({id: "wd", type: "symbol", source: "wd", layout: {"icon-image": "i-fle", "icon-size": ["interpolate", ["linear"], ["zoom"], 4, .42, 7, .6, 10, .95], "icon-rotate": ["get", "rot"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true}, paint: {"icon-opacity": .92}});
    m.addLayer({id: "ai", type: "symbol", source: "ai", layout: {"icon-image": ["concat", "i-", ["get", "ic"]], "icon-size": ik, "icon-offset": OFS, "icon-allow-overlap": true, "icon-ignore-placement": true}});
    m.addLayer({id: "pn-i", type: "symbol", source: "pn", layout: {"icon-image": ["concat", "i-", ["get", "ic"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["==", ["get", "s"], 1], .8, .62], 7, ["case", ["==", ["get", "s"], 1], 1.1, .85], 10, ["case", ["==", ["get", "s"], 1], 1.5, 1.15]], "icon-allow-overlap": true, "icon-ignore-placement": true}});
  }
  function listo(m) {
    var pop = m._pop, mun = function (e) { return T.M[e.features[0].properties.k]; };
    m.on("mousemove", "mv-f", function (e) {
      var q = mun(e); if (!q || st.v !== "avisos") return; var L = filtrados().filter(function (a) { return a._ms.indexOf(q.k) >= 0; }); if (m.queryRenderedFeatures(e.point, {layers: ["ai"]}).length) return; m.getCanvas().style.cursor = "pointer";
      pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(q.n) + ' <span style="font-weight:400">' + esc(q.d) + '</span></b>' + (L.length ? L.map(function (a) { return '<span style="color:' + NC[Math.min(3, a._n)] + '">●</span> ' + esc(a._f) + ' · ' + esc(parTxt(a)); }).join("<br>") : "sin aviso en el filtro") + '<br>clic para ver el detalle</div>').addTo(m);
    });
    m.on("mouseleave", "mv-f", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "mv-f", function (e) { var q = mun(e); if (!q || st.v !== "avisos" || m.queryRenderedFeatures(e.point, {layers: ["ai"]}).length) return; SEL = {t: "mun", k: q.k}; selecciona(false); });
    m.on("mousemove", "ai", function (e) { var p = e.features[0].properties; m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(fenDe(p.k).n) + ' · ' + esc(NT[Math.min(3, +p.mx)]) + '</b>' + esc(p.d) + ' · ' + p.n + ' municipio' + (+p.n === 1 ? "" : "s") + (+p.na > 1 ? ' · ' + p.na + ' avisos' : '') + '<br>clic para ver el aviso</div>').addTo(m); });
    m.on("mouseleave", "ai", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "ai", function (e) { SEL = {t: "av", i: +e.features[0].properties.ai}; selecciona(false); });
    m.on("mousemove", "pn-i", function (e) { var q = prensaL()[e.features[0].properties.i]; if (!q) return; m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(q.titulo) + '</b>' + esc(q.fuente || "") + ' · ubicación aproximada</div>').addTo(m); });
    m.on("mouseleave", "pn-i", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "pn-i", function (e) { var q = prensaL()[e.features[0].properties.i]; if (q) { SEL = {t: "pn", e: q}; selecciona(false); } });
    m.on("mousemove", "fx-c", function (e) { var q = FX.pts[e.features[0].properties.i]; if (!q) return; var v = vPunto(q, st.vr, st.dia); m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(M.nombrePunto(q)) + ': ' + fmt(v, 1) + ' ' + VR[st.vr].u + '</b>' + esc(VR[st.vr].n) + ' · modelo · clic para ver 7 días</div>').addTo(m); });
    m.on("mouseleave", "fx-c", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "fx-c", function (e) { SEL = {t: "fx", i: e.features[0].properties.i}; selecciona(false); });
    m.on("zoomend", etiquetas); m.on("move", function () { if (!rq) rq = requestAnimationFrame(function () { rq = 0; rotular(); }); }); m.on("resize", rotular);
    LUGAR.ajusta(m, T, LG, false); capasVista(); dibuja();
  }
  function capasVista() {
    if (!map || !map._ok) return; var v = st.v, mu = v === "avisos" && SEL && SEL.t === "mun";
    M.vis(map, "mv-f", v === "avisos"); M.vis(map, "mv-o", v === "pron"); M.vis(map, "ai", v === "avisos"); M.vis(map, "wd", v === "avisos" && (!st.f || st.f === "vie")); M.vis(map, "pn-i", v === "prensa"); M.vis(map, "fx-b", v === "pron"); M.vis(map, "fx-c", v === "pron");
    ["mLp", "mLs", "mLe"].forEach(function (i) { var l = $(i) && $(i).parentNode; if (l) l.style.display = mu ? "" : "none"; });
    M.vis(map, "ex-f", st.pob && mu); M.vis(map, "ex-l", st.pob && mu); M.vis(map, "inf-s", st.sal && mu); M.vis(map, "inf-e", st.eme && mu);
  }
  function rotular() {
    var l = $("mLb"); if (!map || !l) return; if (!$("mNd").checked || (st.v === "pron" && FX.estado === "ok")) { l.innerHTML = ""; return; }
    var o = ""; (T.D.geoDep.features || []).forEach(function (f) { var p = map.project(A.cenPoly(f.geometry)); o += '<span style="left:' + p.x.toFixed(0) + 'px;top:' + p.y.toFixed(0) + 'px">' + esc(f.properties.n) + '</span>'; }); l.innerHTML = o;
  }
  function limpiaMK() { MK.forEach(function (m) { m.remove(); }); MK = []; }
  function marca(html, cls, lon, lat) { var el = document.createElement("div"); el.className = cls; el.innerHTML = html; MK.push(new maplibregl.Marker({element: el, anchor: "center"}).setLngLat([lon, lat]).addTo(map)); }
  function etiquetas() {
    limpiaMK(); if (!map || !map._ok) return;
    if (st.v === "pron" && FX.estado === "ok") FX.pts.forEach(function (p) { var v = vPunto(p, st.vr, st.dia); if (v != null) marca(fmt(v, st.vr === "pp" || st.vr === "ra" ? 0 : 0), "fx-lab" + (p.cap ? " cap" : ""), p.lon, p.lat); });
    if (st.v === "avisos" && SEL && SEL.t === "mun" && map.getZoom() >= 6) { var m = T.M[SEL.k], c = centro(m); marca('<span class="gm-n">' + esc(m.n) + '</span><small>' + (m.pob != null ? M.fmtP(m.pob) + ' hab.' : 'sin dato') + '</small>', "gm-lab", c[0], c[1]); }
  }
  function leyenda() {
    var g = function (t, b) { return '<div class="glg"><b>' + t + '</b><div>' + b + '</div></div>'; }, h = "", v = st.v;
    if (v === "avisos") {
      var mu0 = SEL && SEL.t === "mun";
      h += g("Nivel de aviso (máximo)", '<span class="gesc">' + [1, 2, 3].map(function (i) { return '<span><i style="background:' + NC[i] + '"></i>' + NT[i] + '</span>'; }).join("") + '<span><i style="background:#7b8794;opacity:.4"></i>Sin aviso en el filtro</span></span>');
      var ks = {}; filtrados().forEach(function (a) { ks[a._k] = 1; }); var fl = FEN.concat([OTR]).filter(function (f) { return ks[f.k]; });
      if (!mu0) h += g("Fenómeno", (fl.length ? fl : FEN).map(function (f) { return '<span class="gic">' + M.ico(f.k, 18) + esc(f.n) + '</span>'; }).join("") + (ks.vie ? '<span class="gic">' + M.ico("fle", 18) + 'Flecha: hacia dónde sopla</span><small>El aviso indica de dónde viene el viento.</small>' : ""));
      if (mu0) h += M.leyendaPob() + g("Infraestructura (OpenStreetMap)", ["hosp", "cli", "cons", "bom", "pol"].map(function (k) { return '<span class="gic">' + M.ico(k, 18) + ({hosp: "Hospital", cli: "Centro / puesto / clínica", cons: "Consultorio", bom: "Bomberos / rescate", pol: "Policía"})[k] + '</span>'; }).join(""));
    } else if (v === "pron") {
      h += g(esc(VR[st.vr].n) + " (" + VR[st.vr].u + ") · modelo", '<span class="gesc">' + VR[st.vr].cl.map(function (x) { return '<span><i style="background:' + x[1] + '"></i>' + x[2] + '</span>'; }).join("") + '</span><br><small>Clases descriptivas, no niveles de aviso.</small>') + g("Contorno", '<span><i style="border:2px dashed #f26a1b;background:transparent;box-sizing:border-box"></i>Municipio con aviso vigente hoy</span>');
    } else h += g("Fenómeno (según el titular)", FEN.concat([OTR]).map(function (f) { return '<span class="gic">' + M.ico(f.k, 18) + esc(f.n) + '</span>'; }).join(""));
    $("mL").innerHTML = h;
  }
  function refrescaMapa() {
    if (!map || !map._ok) return; var L = filtrados();
    map.getSource("mv").setData(geoMun(L)); map.getSource("ai").setData(geoIconos(L)); map.getSource("wd").setData(geoViento(L)); map.getSource("pn").setData(geoPrensa()); map.getSource("fx").setData(geoPron());
    var m = st.v === "avisos" && SEL && SEL.t === "mun" ? T.M[SEL.k] : null;
    if (m) { var c = centro(m), C = []; m.est.forEach(function (p) { C.push({d: 0, p: {lat: p[0], lon: p[1], n: p[2] || "(sin nombre)", k: /hospital/i.test(p[2] || "") ? "hosp" : p[3] === "consultorio" ? "cons" : "cli", op: p[4] || "", esp: p[5] || "", dep: p[6] || "", mun: p[7] || ""}}); }); [["bom", "bom"], ["res", "res"], ["pol", "pol"]].forEach(function (z) { m[z[0]].forEach(function (p) { C.push({d: 0, p: {lat: p[0], lon: p[1], n: p[2] || "(sin nombre)", k: z[1], op: "", esp: "", dep: p[4] || "", mun: p[5] || ""}}); }); });
      M.selec(map, {mu: [{m: m, d: 0, en: true}], C: C, R: [], lat: c[1], lon: c[0]}, []); var mg = M.mallaMun(m.k); if (mg) M.pintaMalla(map, mg); }
    else M.selec(map, null, []);
    capasVista(); leyenda(); etiquetas(); rotular();
  }
  function volar() {
    if (!map || !map._ok || !SEL) return; var b = null, ext = function (m) { b = b ? [Math.min(b[0], m.bb[0]), Math.min(b[1], m.bb[1]), Math.max(b[2], m.bb[2]), Math.max(b[3], m.bb[3])] : m.bb.slice(); };
    if (SEL.t === "mun") ext(T.M[SEL.k]); else if (SEL.t === "av") AV[SEL.i]._ms.forEach(function (k) { ext(T.M[k]); }); else if (SEL.t === "fx") { var p = FX.pts[SEL.i]; map.flyTo({center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 6.5), duration: 600}); return; } else if (SEL.t === "pn") { map.flyTo({center: [SEL.e.lon, SEL.e.lat], zoom: Math.max(map.getZoom(), 8), duration: 600}); return; }
    if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {duration: 600, padding: 40, maxZoom: 10});
  }
  function selecciona(vuela) { refrescaMapa(); detalle(); if (vuela !== false) volar(); else if (SEL && SEL.t === "mun") volar(); }

  /* ---------- gráficos ---------- */
  function graficos() {
    var tx = X.css("--mut") || "#888", L = AV.filter(function (a) { return enA(a); });
    var fs = FEN.concat([OTR]).filter(function (f) { return L.some(function (a) { return a._k === f.k; }); });
    var el = $("mG1"); if (!L.length) { el.style.height = "60px"; $("mG1n").textContent = "Sin avisos en este lugar."; var c0 = echarts.getInstanceByDom(el); if (c0) c0.clear(); }
    else {
      el.style.height = (80 + fs.length * 34) + "px"; var t0 = Math.min.apply(0, L.map(function (a) { return ts0(a.inicio); })), t1 = Math.max.apply(0, L.map(function (a) { return ts1(a.fin); }), Date.now() + 3 * DIA);
      var dat = L.map(function (a) { return {value: [fs.map(function (f) { return f.k; }).indexOf(a._k), ts0(a.inicio), ts1(a.fin), a._i], itemStyle: {color: NC[Math.min(3, a._n)]}}; });
      X.chart("mG1", {animation: false, grid: {left: 150, right: 16, top: 14, bottom: 30}, tooltip: {formatter: function (p) { if (!p.value) return ""; var a = AV[p.value[3]]; return esc(a._f) + ' · ' + NT[Math.min(3, a._n)] + '<br>' + vigTxt(a) + ' · ' + esc(parTxt(a)) + '<br>' + (a.n_municipios || a._ms.length) + ' municipios'; }},
        xAxis: {type: "time", min: t0, max: t1, axisLabel: {color: tx, fontSize: 10, formatter: function (v) { return fd(S.diaKey(v)); }}, splitLine: {lineStyle: {opacity: .2}}}, yAxis: {type: "category", data: fs.map(function (f) { return f.n; }), inverse: true, axisLabel: {color: tx, fontSize: 11.5}, axisLine: {show: false}, axisTick: {show: false}},
        series: [{type: "custom", renderItem: function (p, api) { var ci = api.value(0), s = api.coord([api.value(1), ci]), e = api.coord([api.value(2), ci]), h = Math.min(api.size([0, 1])[1] * .62, 22); return {type: "rect", shape: {x: s[0], y: s[1] - h / 2, width: Math.max(5, e[0] - s[0]), height: h, r: 4}, style: api.style()}; }, encode: {x: [1, 2], y: 0}, data: dat},
          {type: "line", data: [], markLine: {silent: true, symbol: "none", data: [{xAxis: Date.now(), label: {formatter: "hoy", color: tx, fontSize: 10}}], lineStyle: {type: "dashed", color: tx, width: 1.3}}}]});
      var ch = echarts.getInstanceByDom(el); if (ch) { ch.off("click"); ch.on("click", function (p) { if (p.value && p.value[3] != null) { SEL = {t: "av", i: p.value[3]}; if (st.v !== "avisos") st.v = "avisos"; vista("avisos", true); } }); }
      $("mG1n").textContent = "Cada barra es un aviso (del primer al último día de vigencia); el color es el nivel. Toque una barra para abrirla en el mapa. Línea punteada: hoy.";
    }
    /* población bajo aviso por día (municipios únicos por día) */
    var d0 = L.length ? S.diaKey(Math.min.apply(0, L.map(function (a) { return ts0(a.inicio); }))) : HOY, dias = [], t = Date.parse(d0 + "T12:00:00"); while (t <= Date.parse(HOY + "T12:00:00") + 3 * DIA) { dias.push(S.diaKey(t)); t += DIA; }
    var pob = dias.map(function (d) { var ks = {}, ph = {}; L.forEach(function (a) { if (a.inicio <= d && a.fin >= d) { ph[a._k] = 1; a._ms.forEach(function (k) { ks[k] = 1; }); } }); var r = popMuns(Object.keys(ks)); return {v: r.pob, n: r.n, f: Object.keys(ph)}; });
    X.chart("mG2", {tooltip: {trigger: "axis", formatter: function (p) { var q = pob[p[0].dataIndex]; return fd(dias[p[0].dataIndex]) + '<br><b>' + M.fmtP(q.v) + ' hab.</b> en ' + q.n + ' municipios<br>' + (q.f.length ? q.f.map(function (k) { return esc(fenDe(k).n); }).join(", ") : "sin aviso"); }}, grid: {left: 52, right: 12, top: 12, bottom: 26}, xAxis: {type: "category", data: dias.map(fd), axisLabel: {color: tx, fontSize: 10, interval: Math.ceil(dias.length / 8) - 1}}, yAxis: {type: "value", axisLabel: {color: tx, formatter: function (v) { return M.fmtP(v); }}, splitLine: {lineStyle: {opacity: .25}}},
      series: [{type: "bar", data: pob.map(function (q, i) { return {value: q.v, itemStyle: {color: dias[i] > HOY ? "#f9b27f" : "#f26a1b", borderRadius: [3, 3, 0, 0]}}; }), markLine: {silent: true, symbol: "none", data: [{xAxis: dias.indexOf(HOY), label: {formatter: "hoy", color: tx, fontSize: 10}}], lineStyle: {type: "dashed", color: tx}}}]});
    $("mG2n").textContent = "Habitantes (INE) de los municipios con algún aviso vigente ese día, sin contar dos veces a un municipio con varios avisos. Los días futuros (claro) son avisos ya emitidos.";
    /* faja de pronóstico por capital */
    var e3 = $("mG3"); if (FX.estado !== "ok") { var c3 = echarts.getInstanceByDom(e3); if (c3) c3.clear(); e3.innerHTML = '<p class="nota" style="padding:12px">' + (FX.estado === "error" ? 'No se pudo consultar el modelo (' + esc(FX.msg) + ').' : 'Consultando el modelo Open-Meteo…') + '</p>'; $("mG3n").textContent = ""; return; }
    if (e3.firstChild && e3.firstChild.tagName === "P") e3.innerHTML = "";
    var caps = FX.pts.filter(function (p) { return p.cap; }), dat3 = []; caps.forEach(function (p, y) { FX.dias.forEach(function (d, x) { var v = vPunto(p, st.vr, x), c = clasePron(st.vr, v); if (v != null) dat3.push({value: [x, y, v], itemStyle: {color: c[1]}, label: {show: true, formatter: fmt(v, 0), color: CLARO.test(c[1]) ? "#10233d" : "#fff", fontSize: 11, fontWeight: 700}}); }); });
    X.chart("mG3", {tooltip: {formatter: function (p) { return esc(caps[p.value[1]].n) + ' · ' + fd(FX.dias[p.value[0]]) + ': <b>' + fmt(p.value[2], 1) + ' ' + VR[st.vr].u + '</b>'; }}, grid: {left: 82, right: 8, top: 24, bottom: 4}, xAxis: {type: "category", position: "top", data: FX.dias.map(fdl), axisLabel: {color: tx, fontSize: 10}, axisTick: {show: false}, splitLine: {show: false}}, yAxis: {type: "category", data: caps.map(function (p) { return p.n; }), inverse: true, axisLabel: {color: tx, fontSize: 11}, axisTick: {show: false}}, series: [{type: "heatmap", data: dat3, itemStyle: {borderColor: "rgba(0,0,0,.3)", borderWidth: 2, borderRadius: 3}}]});
    var c4 = echarts.getInstanceByDom(e3); if (c4) { c4.off("click"); c4.on("click", function (p) { if (p.value) { st.dia = p.value[0]; var i = FX.pts.indexOf(caps[p.value[1]]); SEL = {t: "fx", i: i}; vista("pron", true); } }); }
    $("mG3n").textContent = VR[st.vr].n + " (" + VR[st.vr].u + ") en las 9 capitales, modelo Open-Meteo. Toque una celda para abrirla en el mapa. El modelo no sustituye al aviso oficial.";
  }
  function tablas() {
    var L = filtrados();
    $("mTa").innerHTML = L.length ? '<table class="mlist"><tr><th></th><th>Fenómeno</th><th>Nivel</th><th>Intensidad</th><th>Vigencia</th><th>Departamentos</th><th>Muni.</th></tr>' + L.map(function (a) { return '<tr data-i="' + a._i + '"><td>' + M.ico(a._k, 16) + '</td><td>' + esc(a._f) + ' <small class="nota">' + esc(a.numero || "") + '</small></td><td><b style="color:' + NC[Math.min(3, a._n)] + '">' + NT[Math.min(3, a._n)] + '</b></td><td>' + esc(parTxt(a)) + '</td><td style="white-space:nowrap">' + vigTxt(a) + '</td><td>' + esc((a.departamentos || []).join(", ")) + '</td><td>' + (a.n_municipios || a._ms.length) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin avisos con este filtro.</p>';
    [].forEach.call($("mTa").querySelectorAll("tr[data-i]"), function (r) { r.onclick = function () { SEL = {t: "av", i: +r.dataset.i}; if (st.v !== "avisos") { vista("avisos", true); } else selecciona(true); window.scrollTo({top: $("mMap").getBoundingClientRect().top + scrollY - 150, behavior: "smooth"}); }; });
    var P = PR.filter(function (e) { return e.ts >= Date.now() - 30 * DIA && LUGAR.ev(T, LG, e); });
    $("mTp").innerHTML = '<p class="nota">Notas de prensa con lugar identificado (últimos 30 días). La posición es aproximada.</p>' + (P.length ? '<table class="mlist"><tr><th></th><th>Fecha</th><th>Titular</th><th>Fuente</th></tr>' + P.map(function (e) { return '<tr><td>' + M.ico(e._k, 16) + '</td><td style="white-space:nowrap">' + esc(new Date(e.ts).toLocaleDateString("es-BO", {day: "2-digit", month: "short"})) + '</td><td>' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.titulo) + '</a>' : esc(e.titulo)) + '</td><td>' + esc(e.fuente || "") + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin notas.</p>');
    var F = FC.slice().reverse().slice(0, 40).filter(function (e) { return !LG.d || (e.departamentos || []).indexOf(LG.d) >= 0; });
    $("mTf").innerHTML = '<p class="nota"><b>Alertas de modelo del sistema (Open-Meteo), no son avisos oficiales.</b> Son umbrales superados en las ciudades capitales; compárelas siempre con SENAMHI.</p>' + (F.length ? '<table class="mlist"><tr><th>Fecha</th><th>Lugar</th><th>Nivel</th><th>Detalle</th></tr>' + F.map(function (e) { return '<tr><td style="white-space:nowrap">' + esc(new Date(e.ts).toLocaleDateString("es-BO", {day: "2-digit", month: "short"})) + '</td><td>' + esc(e.lugar || "") + '</td><td>' + esc(e.nivel_txt || "") + '</td><td>' + esc(e.titulo) + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin alertas de modelo.</p>');
  }
  function vista(v, vuela) {
    if (!vuela) SEL = null; st.v = v;
    [].forEach.call(document.querySelectorAll(".cvw button"), function (b) { b.classList.toggle("on", b.dataset.v === v); });
    if (v === "pron" && FX.estado === "idle") cargarPron();
    dibuja(); if (vuela) volar(); else if (map && map._ok) LUGAR.ajusta(map, T, LG);
  }
  function dibuja() {
    ayuda(); controles(); pulso(); refrescaMapa(); detalle(); graficos(); tablas(); avisoPron();
  }
  function iniciar() {
    TERR.cargar().then(function (t) {
      T = t; A = TERR.api; D = T.D; A.estilos(); X.header("modulo.html"); document.title = "Meteorológica — Sala de Situación Bolivia"; M.iniciar(T); M.malla(function () { if (map && map._ok) { if (SEL && SEL.t === "mun") selecciona(false); else leyenda(); } }); preparar();
      $("app").innerHTML = html(); if (window.EVI) EVI.panel("eviP", "meteorológica", D);
      LUGAR.init(T, $("lgBox"), LG, function () { SEL = null; dibuja(); LUGAR.ajusta(map, T, LG); if (LG.m && window.CLIMA) CLIMA.irMun(LG.m + " (" + LG.d + ")"); });
      [].forEach.call(document.querySelectorAll(".cvw button"), function (b) { b.onclick = function () { vista(b.dataset.v, false); }; b.classList.toggle("on", b.dataset.v === st.v); });
      [].forEach.call(document.querySelectorAll(".xtabs button"), function (b) { b.onclick = function () { [].forEach.call(document.querySelectorAll(".xtabs button"), function (z) { z.classList.toggle("on", z === b); $(z.dataset.s).style.display = z === b ? "" : "none"; }); }; });
      $("mNd").onchange = rotular; $("mLp").onchange = function () { st.pob = this.checked; capasVista(); }; $("mLs").onchange = function () { st.sal = this.checked; capasVista(); }; $("mLe").onchange = function () { st.eme = this.checked; capasVista(); };
      map = M.crear({id: "mMap", av: "mAv", tool: "#mTool", bajo: bajo, alto: alto, listo: listo, refInfra: "del municipio", evitar: ["ai", "pn-i", "fx-c", "wd"]});
      pulso(); if (window.CLIMA) CLIMA.iniciar("meteo", cfgMon());
      cargarPron();
    });
  }
  return {iniciar: iniciar, _depura: function () { return {map: map, st: st, SEL: SEL, FX: FX, AV: AV, PR: PR}; }};
})();

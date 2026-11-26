/* Módulo Hidrológica: avisos hidrológicos del SENAMHI (por departamento, ríos y poblados; el sistema lee el texto oficial), población y servicios en los municipios nombrados
   (INE + malla de ~1 km), caudal modelado GloFAS en 9 puntos de grandes ríos frente a lo normal (P50–P90), lluvia prevista (Open-Meteo, 7 días) y prensa.
   Mapa: base hidrográfica (cuencas, ríos y lagos de HMAP) y, encima, lo monitoreado; el contexto (población, servicios, prensa) se añade a pedido desde el panel «Capas».
   Límites: los avisos no traen polígonos ni municipios (se ubican por el nombre del poblado y se dibujan los ríos citados dentro del departamento); GloFAS no ve crecidas repentinas de ríos menores. */
var HID = (function () {
  var S = SALA, X = S2, M = MAPAZ, A, T, D, map = null, LG = {d: "", m: ""}, MK = [], rq = 0, SEL = null;
  var st = {v: "avisos", p: "vig", cd: "max", ac: 3}, PN = null, SINT = [], LLK = "", TRAMO_KM = 80, TRAMO_KM_LG = 320;
  var AV = [], ST = [], PR = [], FX = M.PRON, IDX = {}, DEPC = {};
  var NC = ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"], NT = ["Verde", "Amarillo", "Naranja", "Rojo"], SIN = "#7b8794", DIA = 864e5, HOY = S.diaKey(Date.now()), COL = "#0369a1";
  var DEPS = ["La Paz", "Cochabamba", "Santa Cruz", "Beni", "Pando", "Oruro", "Potosí", "Chuquisaca", "Tarija"];
  var CQ = [["Dentro de lo normal", NC[0]], ["Algo sobre la mediana", NC[1]], ["Sobre el P90 (caudal alto)", NC[2]], ["Más de 150 % del P90", NC[3]]];
  var LL = [[5, "#e3ebf5", "< 5"], [20, "#a6d9f7", "5–20"], [50, "#4aa3f5", "20–50"], [100, "#2563eb", "50–100"], [200, "#6d28d9", "100–200"], [99999, "#4c1d95", "> 200"]];
  var CLARO = /^#(e3ebf5|a6d9f7)$/i;
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function $(i) { return document.getElementById(i); }
  function fmt(n, d) { return d ? (n == null ? "—" : Number(n).toFixed(d).replace(".", ",")) : M.fmt(n); }
  function fd(s) { return s ? new Date(s + "T12:00:00").toLocaleDateString("es-BO", {day: "numeric", month: "short"}).replace(/\./g, "") : "—"; }
  function fdl(s) { return s ? new Date(s + "T12:00:00").toLocaleDateString("es-BO", {weekday: "short", day: "numeric"}).replace(/\./g, "") : "—"; }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function normP(s) { return norm(s).replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function ts0(s) { return Date.parse(s + "T00:00:00-04:00"); }
  function ts1(s) { return Date.parse(s + "T23:59:59-04:00"); }
  function dur(ms) { var h = Math.max(1, Math.round(ms / 36e5)); if (h < 48) return h + " h"; var d = Math.floor(h / 24), r = h % 24; return d + " d" + (r ? " " + r + " h" : ""); }
  function resta(a) { var n = Date.now(); if (n < ts0(a.inicio)) return "inicia en " + dur(ts0(a.inicio) - n); if (n <= ts1(a.fin)) return "termina en " + dur(ts1(a.fin) - n); return "terminó hace " + dur(n - ts1(a.fin)); }
  function vig(a) { return a.inicio <= HOY && a.fin >= HOY; }
  function ndias(a) { return Math.round((ts1(a.fin) - ts0(a.inicio)) / DIA); }
  function vigTxt(a) { return a.inicio === a.fin ? fd(a.inicio) : fd(a.inicio) + " – " + fd(a.fin); }
  function dep0(n) { var q = normP(n); return DEPS.filter(function (d) { var p = normP(d); return q === p || q.indexOf(p + " ") === 0; })[0] || String(n || "").trim(); }
  function uniq(l) { var v = {}, o = []; l.forEach(function (x) { var k = norm(x); if (x && !v[k]) { v[k] = 1; o.push(x); } }); return o; }
  function centro(m) { return M.cen(m); }

  /* ---------- lectura del texto oficial: departamento → cuenca → río → poblados, con el período de cada departamento ---------- */
  function lista(txt) {
    var o = [], v = {};
    String(txt || "").replace(/\([^)]*\)/g, " ").replace(/\.\s*$/, "").split(/,|\s+y\s+(?=[A-ZÁÉÍÓÚÑ])/).forEach(function (n) {
      n = n.replace(/^\s*(?:y|e|como)\s+/i, "").replace(/\s*(?:y\s+)?(?:las\s+)?(?:poblaciones|poblados|comunidades|localidades|sectores|zonas|áreas)(?:\s+(?:cercan[oa]s?|aledañ[oa]s?))?\s*$/i, "").replace(/[.\s]+$/, "").trim();
      if (n.length > 2 && !/^(poblaciones|poblados|comunidades)/i.test(n) && !v[n.toLowerCase()]) { v[n.toLowerCase()] = 1; o.push(n); }
    });
    return o;
  }
  function iso(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
  function parseAv(a) {
    var t = String(a.texto || "").replace(/\s+/g, " "), re = /(?:DEL\s+(\d{1,2})\s+AL\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[:.]?\s*)?(?:[✓✔➢•●◦]|\bo\b)\s*Departamento\s+de\s+([^(:➢✓]+?)\s*(?:\(([^)]*)\))?\s*:/gi, m, P = [], R = [];
    while ((m = re.exec(t))) P.push({i: m.index, e: re.lastIndex, m: m});
    P.forEach(function (q, j) {
      var blk = t.slice(q.e, j + 1 < P.length ? P[j + 1].i : t.length), g = q.m, b = {d: dep0(g[5]), cu: (g[6] || "").replace(/^Cuencas?\s+(?:de[l]?\s+)?/i, "").trim(), ini: null, fin: null, it: []};
      if (g[1]) { var d1 = +g[1], d2 = +g[2], mm = +g[3], y = +g[4], m1 = d1 > d2 ? mm - 1 : mm; b.ini = iso(m1 < 1 ? y - 1 : y, m1 < 1 ? 12 : m1, d1); b.fin = iso(y, mm, d2); }
      blk.split("➢").slice(1).forEach(function (x) {
        var s = x.replace(/\s+/g, " ").trim(); if (!s) return;
        var nm = /^(.*?)(?:,|\s+ascensos?\b)/i.exec(s), nombre = (nm ? nm[1] : s.slice(0, 40)).replace(/^R[ií]o\s+/i, "").replace(/\s+y\s+afluentes.*$/i, "").trim();
        var i = s.lastIndexOf(":"), pob = i >= 0 ? s.slice(i + 1) : ((/\bcomo\s+(.+)$/i.exec(s) || /\bdesbordes\s+(?:que\s+afectar[aá]n\s+)?(?:a\s+|en\s+|para\s+)(?:los\s+|las\s+)?(?:poblados?\s+de\s+|poblaciones\s+de\s+)?(.+)$/i.exec(s) || [])[1] || ""), tp = /(ascensos?[^:]*?)(?=\s+(?:en|próxim)|:|$)/i.exec(s);
        b.it.push({rio: nombre, tipo: tp ? tp[1].trim() : "ascenso de nivel", pob: lista(pob), txt: pob.trim().replace(/\.$/, ""), ms: munNom(b.d, lista(pob))});
      });
      if (b.it.length) R.push(b);
    });
    return R.length ? R : parseTabla(t);
  }
  /* formato antiguo (ene–may): tabla «N° Río / Afluente · Tipo de amenaza · Áreas y poblaciones en riesgo» por departamento */
  function parseTabla(t) {
    var re = /(?:^|\s)\d\.\s+(?:DEPARTAMENTO\s+DE\s+)?(La Paz|Cochabamba|Santa Cruz|Beni|Pando|Oruro|Potos[ií]|Chuquisaca|Tarija)\b/gi, m, P = [], R = [], fin = t.search(/\sSENAMHI,\s/i);
    while ((m = re.exec(t))) P.push({i: m.index, e: re.lastIndex, d: m[1]});
    P.forEach(function (q, j) {
      var fl = j + 1 < P.length ? P[j + 1].i : (fin > q.e ? fin : t.length), blk = t.slice(q.e, fl), k = blk.search(/[ÁA]reas\s+y\s+poblaciones\s+en\s+riesgo/i);
      if (k < 0) return;
      var cab = blk.slice(0, k), cm = /^\s*\(?\s*(Cuencas?.*?)\)?\s+N°\s+R[ií]o/i.exec(cab), b = {d: dep0(q.d), cu: cm ? cm[1].replace(/^Cuencas?\s+(?:afluentes\s+)?(?:de[l]?\s+)?(?:r[ií]o\s+)?/i, "").trim() : "", ini: null, fin: null, it: []};
      blk.slice(k).replace(/^[^\d]*/, "").split(/\s(?=\d{1,2}\s+(?:R[ií]o|Quebrada)\s)/).forEach(function (r) {
        var x = /^\d{1,2}\s+(?:R[ií]o|Quebrada)\s+(.+?)\s+((?:Crecidas?|Ascensos?|Activaci[oó]n)\b.*?\bdesbordes?)\s+(.+)$/i.exec(r.trim()); if (!x) return;
        var pob = x[3].replace(/\s*\.\s*$/, ""); b.it.push({rio: x[1].replace(/\s+y\s+afluentes.*$/i, "").trim(), tipo: x[2].trim(), pob: lista(pob), txt: pob.replace(/\([^)]*\)/g, "").trim(), ms: munNom(b.d, lista(pob))});
      });
      if (b.it.length) R.push(b);
    });
    return R;
  }
  function munNom(d, arr) {
    var tx = " " + normP((arr || []).join(" ; ")) + " ", o = [];
    (IDX[d] || (IDX[d] = (T.DEP[d] || []).map(function (m) { return {k: m.k, n: normP(m.n)}; }).filter(function (x) { return x.n.length >= 4; }))).forEach(function (x) { if (tx.indexOf(" " + x.n + " ") >= 0) o.push(x.k); });
    return o;
  }
  function poblFlat(a) { var o = []; (a.poblaciones || []).forEach(function (x) { lista(String(x).replace(/\s*DEL \d+.*$/i, "")).forEach(function (n) { o.push(n); }); }); return uniq(o); }
  function cuencas(a) { var m = /CUENCAS?(?:\s+DE\s+LOS\s+R[ÍI]OS)?:?\s+(.+?)\s+(?:AFECTANDO|CON\s+POSIBLES\s+AFECTACI)/i.exec(String(a.texto || "").replace(/\s+/g, " ")); return m ? uniq(m[1].split(/,|\s+Y\s+/).map(function (x) { return x.replace(/\(.*?\)/g, "").trim(); }).filter(function (x) { return x.length > 2; })) : []; }

  function preparar() {
    AV = (((D.senamhi_alertas || {}).alertas) || []).filter(function (a) { return a.tipo !== "meteorológica"; }).map(function (a) {
      a._n = a.nivel_num != null ? a.nivel_num : 1; a._sin = !a.texto; a._b = a._sin ? [] : parseAv(a);
      var rios = a._b.length ? [].concat.apply([], a._b.map(function (b) { return b.it.map(function (i) { return i.rio; }); })) : (a.rios || []).map(function (r) { return String(r).replace(/^R[ií]o\s+/i, "").replace(/\s+(?:ascensos?|crecidas?)\b.*$/i, "").trim(); });
      a._rios = uniq(rios); a._pob = a._b.length ? uniq([].concat.apply([], a._b.map(function (b) { return [].concat.apply([], b.it.map(function (i) { return i.pob; })); }))) : poblFlat(a);
      a._d = (a.departamentos && a.departamentos.length) ? a.departamentos.slice() : uniq(a._b.map(function (b) { return b.d; }));
      var ms = {}; if (a._b.length) a._b.forEach(function (b) { b.it.forEach(function (i) { i.ms.forEach(function (k) { ms[k] = 1; }); }); }); else a._d.forEach(function (d) { munNom(d, a._pob).forEach(function (k) { ms[k] = 1; }); });
      a._ms = Object.keys(ms); a._cu = a._b.length ? uniq(a._b.map(function (b) { return b.cu; }).filter(Boolean)) : cuencas(a); return a;
    }).sort(function (a, b) { return (b.publicada || "").localeCompare(a.publicada || ""); });
    AV.forEach(function (a, i) { a._i = i; });
    ST = ((D.caudales || {}).puntos) || [];
    var R = /río|rio|inundaci|riada|desborde|crecida|mazamorra|cauce|lluvia/i;
    PR = D.ev.filter(function (e) { return e.categoria === "hidrológica" && e.origen === "prensa" && ((e.departamentos && e.departamentos.length) || e.lat != null) && R.test(e.titulo); });
    (T.D.geoDep.features || []).forEach(function (f) { DEPC[f.properties.n] = A.cenPoly(f.geometry); });
  }

  /* ---------- filtros ---------- */
  function dentro(a, p) { if (p === "vig") return vig(a); if (p === "todo") return true; return a.fin >= S.diaKey(Date.now() - (+p) * DIA) && a.inicio <= HOY; }
  function enA(a) { return !LG.d || a._d.indexOf(LG.d) >= 0; }
  function enM(k) { var m = T.M[k]; return !!m && (!LG.d || (m.d === LG.d && (!LG.m || m.n === LG.m))); }
  function enS(p) { return !LG.d || p.departamento === LG.d; }
  function enP(p) { if (!LG.d) return true; if (p._d === undefined) { var m = T.donde(p.lat, p.lon); p._d = p.cap ? p.dep : (m ? m.d : null); p._m = m ? m.n : null; } return p._d === LG.d && (!LG.m || p._m === LG.m); }
  function filtrados() { return AV.filter(function (a) { return dentro(a, st.p) && enA(a); }); }
  function nivDep(L) { var o = {}; L.forEach(function (a) { a._d.forEach(function (d) { o[d] = Math.max(o[d] == null ? -1 : o[d], a._n); }); }); return o; }
  function nivMun(L) { var o = {}; L.forEach(function (a) { a._ms.forEach(function (k) { if (enM(k)) o[k] = Math.max(o[k] == null ? -1 : o[k], a._n); }); }); return o; }
  function keysDe(L) { var o = {}; L.forEach(function (a) { a._ms.forEach(function (k) { if (enM(k)) o[k] = 1; }); }); return Object.keys(o); }
  function popMuns(keys) { var pob = 0, sd = 0; keys.forEach(function (k) { var m = T.M[k]; if (m) { if (m.pob == null) sd++; else pob += m.pob; } }); return {n: keys.length, pob: pob, sd: sd}; }
  function infraDe(keys) {
    var o = {hosp: 0, cli: 0, cons: 0, bom: 0, pol: 0};
    keys.forEach(function (k) { var m = T.M[k]; if (!m) return; m.est.forEach(function (p) { o[/hospital/i.test(p[2] || "") ? "hosp" : p[3] === "consultorio" ? "cons" : "cli"]++; }); o.bom += m.bom.length + m.res.length; o.pol += m.pol.length; });
    return o;
  }
  function topAv(L) { return L.slice().sort(function (a, b) { return b._n - a._n || b.fin.localeCompare(a.fin); })[0]; }

  /* ---------- caudal modelado (GloFAS) ---------- */
  function iHoy(p) { var i = p.fechas.indexOf(p.hoy); return i < 0 ? p.fechas.length - 1 : i; }
  function ratioCq(p) { if (st.cd === "max") return p.ratio_p90_max_10d; var i = iHoy(p) + (+st.cd), q = p.caudal_m3s[i], b = p.p90 && p.p90[i]; return q == null || !b ? null : q / b; }
  function claseCq(p) { var r = ratioCq(p); if (r == null) return 0; if (r >= 1.5) return 3; if (r >= 1) return 2; var i = st.cd === "max" ? -1 : iHoy(p) + (+st.cd), q = st.cd === "max" ? p.caudal_max_10d : p.caudal_m3s[i], m = st.cd === "max" ? (p.p50 || [])[iHoy(p)] : (p.p50 || [])[i]; return m && q != null && q > m * 1.2 ? 1 : 0; }
  function sinDetVig() { return AV.filter(function (a) { return vig(a) && !a._d.length; }); }
  function notaSin() { var n = sinDetVig().length; return n ? ' Además hay ' + n + ' aviso' + (n === 1 ? "" : "s") + ' vigente' + (n === 1 ? "" : "s") + ' cuyo detalle no se pudo leer (PDF no disponible): podría' + (n === 1 ? "" : "n") + ' incluir este departamento.' : ""; }
  function vigDep(d) { return AV.filter(function (a) { return vig(a) && a._d.indexOf(d) >= 0; }); }
  function prDep(d) { var t = Date.now() - 30 * DIA; return PR.filter(function (e) { return e.ts >= t && (e.departamentos || []).indexOf(d) >= 0; }); }
  function lecturaP(p) {
    var alto = (p.nivel || 0) >= 2, av = vigDep(p.departamento).length > 0;
    if (alto && av) return {t: "Concordante", c: "#d7263d", f: "#fff", d: "El modelo y el SENAMHI señalan crecida en el departamento."};
    if (alto) return {t: "Solo modelo", c: "#f26a1b", f: "#fff", d: "Sin aviso oficial vigente con ubicación legible: vigilar y confirmar con el SENAMHI." + notaSin()};
    if (av) return {t: "Solo oficial", c: "#f5b700", f: "#10233d", d: "Hay aviso oficial vigente en el departamento; puede referirse a otros ríos que el modelo no cubre."};
    return {t: "Sin señal", c: "#2e9e5b", f: "#fff", d: "Ninguna fuente señala crecida en este punto." + notaSin()};
  }

  /* ---------- lluvia prevista (modelo compartido con Meteorológica) ---------- */
  function acum(p, n) { var s = 0, k; for (k = 0; k < Math.min(n, (p.pp || []).length); k++) s += p.pp[k] || 0; return Math.round(s * 10) / 10; }
  function claseLl(v) { for (var i = 0; i < LL.length; i++) if (v < LL[i][0]) return LL[i]; return LL[LL.length - 1]; }
  function avisoPron() {
    var el = $("hAq"); if (!el) return; if (st.v !== "lluvia" || FX.estado === "ok") { el.hidden = true; return; }
    el.hidden = false; el.innerHTML = FX.estado === "error" ? 'No se pudo consultar la lluvia prevista (' + esc(FX.msg) + '). <button class="xlink" type="button" id="hAqR">Reintentar</button>' : 'Consultando el pronóstico del modelo Open-Meteo…';
    var r = $("hAqR"); if (r) r.onclick = function () { M.pron(pronListo, true); dibuja(); };
  }
  function pronListo() { avisoPron(); pulso(); graficos(); if (st.v === "lluvia") dibuja(); else if (SEL && SEL.t === "cq") detalle(); }

  /* ---------- pulso ---------- */
  function tarjeta(col, ic, tit, big, sub, extra, sp, off) { return '<div class="card cpc' + (off ? " off" : "") + '" style="--k:' + col + '"><div class="eye">' + X.ic(ic) + '<span>' + tit + '</span></div><div class="big">' + big + '</div><div class="sub">' + sub + '</div>' + (extra || "") + '<div class="sp" style="color:' + col + '">' + (sp || "") + '</div></div>'; }
  function faja() {
    var L = AV.filter(enA), n = 17, w = 100 / n, h = "";
    for (var i = 0; i < n; i++) {
      var d = S.diaKey(Date.now() + (i - 13) * DIA), mx = -1; L.forEach(function (a) { if (a.inicio <= d && a.fin >= d) mx = Math.max(mx, a._n); });
      h += '<rect x="' + (i * w + .25).toFixed(2) + '%" y="3" width="' + (w - .5).toFixed(2) + '%" height="14" rx="2" fill="' + (mx < 0 ? "currentColor" : NC[Math.min(3, mx)]) + '" opacity="' + (mx < 0 ? .13 : 1) + '"' + (i === 13 ? ' stroke="currentColor" stroke-width="1.6"' : "") + '><title>' + fd(d) + (i === 13 ? " (hoy)" : "") + ": " + (mx < 0 ? "sin aviso" : NT[Math.min(3, mx)]) + '</title></rect>';
    }
    return '<svg class="mst" viewBox="0 0 100 20" preserveAspectRatio="none" aria-label="Avisos de los últimos 14 días y próximos 3">' + h + '</svg>';
  }
  function barrasCq(P) {
    if (!P.length) return ""; var w = 100 / P.length, h = "";
    P.forEach(function (p, i) { var r = Math.min(1.6, Math.max(.03, p.ratio_p90_max_10d || 0)), hh = r / 1.6 * 17; h += '<rect x="' + (i * w + 1).toFixed(2) + '%" y="' + (19 - hh).toFixed(1) + '" width="' + (w - 2).toFixed(2) + '%" height="' + hh.toFixed(1) + '" rx="1.5" fill="' + NC[Math.min(3, p.nivel || 0)] + '"><title>' + esc(p.nombre) + ': ' + Math.round((p.ratio_p90_max_10d || 0) * 100) + ' % del P90</title></rect>'; });
    h += '<line x1="0" x2="100" y1="' + (19 - 1 / 1.6 * 17).toFixed(1) + '" y2="' + (19 - 1 / 1.6 * 17).toFixed(1) + '" stroke="currentColor" stroke-width=".8" stroke-dasharray="2 2" opacity=".6"/>';
    return '<svg class="mst" viewBox="0 0 100 20" preserveAspectRatio="none" aria-label="Caudal modelado en cada punto, como porcentaje del umbral P90 (línea punteada = 100 %)">' + h + '</svg>';
  }
  function pulso() {
    var v = AV.filter(function (a) { return vig(a) && enA(a); }), mx = v.reduce(function (a, x) { return Math.max(a, x._n); }, -1), top = topAv(v), h = "";
    var rios = uniq([].concat.apply([], v.map(function (a) { return a._rios; }))), deps = uniq([].concat.apply([], v.map(function (a) { return a._d; }))), sinD = v.filter(function (a) { return a._sin; }).length;
    var ult = AV.filter(function (a) { return enA(a) && a.fin < HOY; }).sort(function (a, b) { return b.fin.localeCompare(a.fin); })[0];
    h += tarjeta(COL, "shield", "Avisos hidrológicos", v.length ? '<span style="color:' + NC[Math.min(3, mx)] + '">' + NT[Math.min(3, mx)] + '</span>' : '<span style="color:var(--mut)">Sin aviso</span>',
      v.length ? v.length + ' aviso' + (v.length > 1 ? "s" : "") + ' vigente' + (v.length > 1 ? "s" : "") + (deps.length ? ' · ' + esc(deps.join(", ")) : "") : (ult ? 'Último aviso: ' + vigTxt(ult) : 'sin avisos en el período disponible') + (LG.d && sinDetVig().length ? '. Hay ' + sinDetVig().length + ' vigente' + (sinDetVig().length === 1 ? "" : "s") + ' sin detalle legible: podría' + (sinDetVig().length === 1 ? "" : "n") + ' incluir este lugar' : ''),
      v.length ? '<div class="mpar" style="color:' + COL + '">' + (rios.length ? esc(rios.slice(0, 4).join(", ")) + (rios.length > 4 ? " y " + (rios.length - 4) + " más" : "") : (sinD === v.length ? "sin detalle de ríos: el PDF no estuvo disponible" : "ríos no indicados")) + '</div><div class="sub">' + vigTxt(top) + ' · ' + resta(top) + '</div>' : "", faja(), !v.length);
    var ks = keysDe(v), pm = popMuns(ks), pobl = uniq([].concat.apply([], v.map(function (a) { return a._pob; })));
    h += tarjeta("#8461f0", "home", "Población en municipios nombrados", v.length && ks.length ? M.fmtP(pm.pob) + ' <small>hab.</small>' : '<span style="color:var(--mut)">' + (v.length ? "Sin dato" : "Sin aviso") + '</span>',
      v.length && ks.length ? ks.length + ' municipio' + (ks.length > 1 ? "s" : "") + ' · ' + rios.length + ' río' + (rios.length === 1 ? "" : "s") + ' · ' + pobl.length + ' poblado' + (pobl.length === 1 ? "" : "s") : (v.length ? 'los avisos vigentes no permiten nombrar municipios' : 'sin avisos vigentes'),
      v.length && ks.length ? '<div class="sub">Total INE de cada municipio nombrado; el aviso puede afectar solo una parte.</div>' : "", "", !(v.length && ks.length));
    var P = ST.filter(enS), alt = P.filter(function (p) { return (p.nivel || 0) >= 2; }).length, mp = P.slice().sort(function (a, b) { return (b.ratio_p90_max_10d || 0) - (a.ratio_p90_max_10d || 0); })[0];
    h += tarjeta("#1d6fb8", "wave", "Caudal de ríos (modelo)", P.length ? '<span style="color:' + (alt ? NC[2] : NC[0]) + '">' + alt + '</span> <small>de ' + P.length + ' sobre el P90</small>' : '<span style="color:var(--mut)">Sin punto</span>',
      mp ? 'Mayor: ' + esc(mp.nombre) + ' · ' + esc(mp.rio) + ', ' + Math.round((mp.ratio_p90_max_10d || 0) * 100) + ' % del P90 (10 días)' : 'sin puntos del modelo en este lugar', '<div class="sub">GloFAS: solo grandes ríos, no es aviso.</div>', barrasCq(P), !P.length);
    var Q = FX.estado === "ok" ? FX.pts.filter(enP) : [], mq = Q.slice().sort(function (a, b) { return acum(b, 3) - acum(a, 3); })[0], n50 = Q.filter(function (p) { return acum(p, 3) >= 50; }).length;
    h += tarjeta("#2563eb", "water", "Lluvia prevista 72 h (modelo)", FX.estado === "ok" && mq ? fmt(acum(mq, 3), 0) + ' <small>mm, máximo</small>' : '<span style="color:var(--mut)">' + (FX.estado === "error" ? "Sin conexión" : FX.estado === "ok" ? "Sin punto" : "Consultando…") + '</span>',
      FX.estado === "ok" && mq ? esc(M.nombrePunto(mq)) + ' · ' + n50 + ' punto' + (n50 === 1 ? "" : "s") + ' con ≥ 50 mm' : (FX.estado === "error" ? esc(FX.msg) : 'Open-Meteo, puntos de ~1°'), '<div class="sub">Pronóstico del modelo, no es aviso.</div>', "", FX.estado !== "ok");
    $("hPul").innerHTML = h;
  }

  /* ---------- página ---------- */
  var GRUPOS = [
    {t: "Base hidrográfica", items: [{id: "cu", t: "Cuencas", on: true, sw: "#22b8cf", h: "Grandes cuencas de Bolivia (HydroBASINS)"}, {id: "rio", t: "Red de ríos", on: true, sw: "#5fd0ff", h: "Ríos con nombre de más de 40 km en Bolivia (OpenStreetMap)"}, {id: "lg", t: "Lagos y salares (referencia)", on: true, sw: "#46b2ff", h: "Contorno de referencia; no es la superficie de agua de hoy"}, {id: "dep", t: "Departamentos", on: true, sw: "#cfe0f7"}]},
    {t: "Monitoreo de esta vista", items: [{id: "ar", t: "Ríos con aviso", on: true, v: "avisos", sw: "#f26a1b"}, {id: "mn", t: "Municipios nombrados", on: true, v: "avisos", sw: "#f5b700"}, {id: "tr", t: "Tramos y puntos de caudal", on: true, v: "caudal", sw: "#2e9e5b"}, {id: "ca", t: "Cuenca aportante del punto", on: true, v: "caudal", sw: "#ffd166"}, {id: "ll", t: "Lluvia prevista (superficie)", on: true, v: "lluvia", sw: "#2563eb"}]},
    {t: "Contexto (a pedido)", items: [{id: "pob", t: "Población", on: false, sw: "#8461f0"}, {id: "sal", t: "Hospitales y centros de salud", on: false, sw: "#34d17a"}, {id: "eme", t: "Bomberos y policía", on: false, sw: "#ff6b5e"}, {id: "pr", t: "Prensa (ubicación aproximada)", on: false, sw: "#7fc4ff"}]}
  ];
  function html() {
    return '<nav class="tnav"><a href="index.html">Tablero</a><span class="tsep">›</span><b>Tipo de evento · Hidrológica</b></nav><h1 class="th">Hidrológica <small>crecidas, desbordes e inundaciones</small></h1>' +
      '<div class="cap">Los <b>avisos</b> son oficiales (SENAMHI) y se publican por río y poblado, sin polígono ni municipio: el sistema los ubica por el <b>nombre</b> del poblado. El <b>caudal</b> (GloFAS, 9 puntos de grandes ríos) y la <b>lluvia prevista</b> (Open-Meteo) son modelos, no avisos. Información preliminar.</div>' +
      '<div class="cpul h4" id="hPul"></div>' +
      '<div class="xq"><div class="xs1" id="lgBox"></div></div>' +
      '<div class="cvw"><b>Ver en el mapa</b><button type="button" data-v="avisos">' + X.ic("shield") + 'Avisos</button><button type="button" data-v="caudal">' + X.ic("wave") + 'Caudal de ríos</button><button type="button" data-v="lluvia">' + X.ic("water") + 'Lluvia 7 días</button></div>' +
      '<div class="cvc" id="hCtl"></div><div class="xhelp" id="hH"></div>' +
      '<div class="xg"><div class="xmw"><div class="xtool" id="hTool"><span class="xtl">Mapa base</span><button type="button" data-b="calles" class="on">Calles</button><button type="button" data-b="topo">Relieve</button><button type="button" data-b="sat">Satélite</button><button type="button" data-b="none">Sin mapa</button></div>' +
      '<div style="position:relative"><div class="xmap" id="hMap"></div><div id="hCapas"></div><div class="xav" id="hAv" style="top:14px" hidden></div><div class="xav" id="hAq" style="top:14px;left:auto;right:56px;transform:none" hidden></div></div><div class="xleg" id="hL"></div></div>' +
      '<div class="xside"><div id="hDet"></div></div></div><div id="eviP"></div>' +
      '<div class="card" style="margin-top:12px"><h3>Cronología de avisos por departamento</h3><div id="hG1" style="height:230px"></div><p class="nota" id="hG1n"></p></div>' +
      '<div class="xg2"><div class="card"><h3>Avisos por mes</h3><div id="hG2" style="height:230px"></div><p class="nota" id="hG2n"></p></div>' +
      '<div class="card"><h3>Ríos que más figuran en los avisos</h3><div id="hG3" style="height:230px"></div><p class="nota" id="hG3n"></p></div></div>' +
      '<div class="card" style="margin-top:12px"><h3>Caudal modelado por punto (% del umbral P90)</h3><div id="hG4" style="height:300px"></div><p class="nota" id="hG4n"></p></div>' +
      '<div class="card" style="margin-top:12px"><div class="xtabs"><button class="on" data-s="hTa">Avisos (lista)</button><button data-s="hTp">Prensa</button><button data-s="hTh">Antecedentes 1970–2015</button></div><div id="hTa"></div><div id="hTp" style="display:none"></div><div id="hTh" style="display:none"></div></div>' +
      '<div id="hMon">' + (window.CLIMA ? CLIMA.seccion("hidro", cfgMon()) : "") + '</div>';
  }
  function cfgMon() { return {col: COL, geoMun: D.geoMun, colN: NC, nivT: NT, avisos: function (k) { return AV.filter(function (a) { return a._ms.indexOf(k) >= 0; }); }}; }
  function ayuda() {
    var v = st.v, h;
    if (v === "avisos") {
      var L = filtrados(), sinU = L.filter(function (a) { return !a._d.length; }).length, as = SEL && SEL.t === "av" ? AV[SEL.i] : null, mu = LG.m ? (T.M[LG.d + "|" + LG.m] && L.some(function (a) { return a._ms.indexOf(LG.d + "|" + LG.m) >= 0; })) : null;
      if (as) h = '<b>Aviso N° ' + esc(as.numero || "") + ' · ' + NT[Math.min(3, as._n)] + '</b> · ' + vigTxt(as) + ' — el mapa muestra solo este aviso. <a href="#" id="hTodos">Ver los ' + L.length + ' del filtro</a>' + (as._d.length ? "" : ' · <b>sin ubicación: no se puede dibujar (PDF del SENAMHI no disponible)</b>');
      else h = '<b>' + L.length + ' aviso' + (L.length === 1 ? "" : "s") + '</b> hidrológico' + (L.length === 1 ? "" : "s") + ' en ' + esc(LUGAR.etiqueta(LG)) + ' · ' + ({vig: "vigentes hoy", 7: "últimos 7 días", 30: "últimos 30 días", todo: "todo lo disponible"})[st.p] + (mu === true ? ' — <b>el municipio figura por nombre</b> en un aviso' : mu === false ? ' — el municipio <b>no figura por nombre</b> (el aviso es del departamento)' : '') +
        ' <span class="nota">— El río encendido es el citado en el aviso (dentro de su departamento); relleno claro: departamento con aviso; fuerte: municipio nombrado por un poblado.' + (sinU ? '</span> <b>' + sinU + ' aviso' + (sinU === 1 ? "" : "s") + ' sin ubicación</b> <span class="nota">(no se pudo leer el PDF del SENAMHI): no se dibuja' + (sinU === 1 ? "" : "n") + ' en el mapa.' : '') + '</span>';
    } else if (v === "caudal") h = '<b>Caudal modelado</b> · ' + ({max: "máximo de los próximos 10 días", 0: "hoy", 3: "en 3 días", 7: "en 7 días"})[st.cd] + ' <span class="nota">— GloFAS (Copernicus): cada punto de medición del modelo se dibuja sobre su río, con el tramo que representa, coloreado frente al umbral alto (P90) de 1993–2022. Toque un punto o un tramo para ver su cuenca aportante.</span>';
    else h = '<b>Lluvia acumulada ' + ({1: "24 h", 3: "72 h", 7: "7 días"})[st.ac] + '</b> · ' + (FX.estado === "ok" ? "modelo Open-Meteo" : FX.estado === "error" ? "sin conexión con el modelo" : "consultando…") + ' <span class="nota">— Superficie interpolada entre puntos de ~1° (no son estaciones); pase el cursor para ver el valor. Contorno naranja: departamento con aviso hidrológico vigente.</span>';
    $("hH").innerHTML = h; var tt = $("hTodos"); if (tt) tt.onclick = function (e) { e.preventDefault(); SEL = null; dibuja(); LUGAR.ajusta(map, T, LG); };
  }
  function controles() {
    var h = "", ch = function (t, k, val, cur) { return '<button type="button" data-k="' + k + '" data-v="' + val + '"' + (String(cur) === String(val) ? ' class="on"' : "") + '>' + t + '</button>'; };
    if (st.v === "avisos") h = '<div class="cg"><b>Período</b>' + [["vig", "Vigentes hoy"], ["7", "7 días"], ["30", "30 días"], ["todo", "Todo lo disponible"]].map(function (x) { return ch(x[1], "p", x[0], st.p); }).join("") + '</div>';
    else if (st.v === "caudal") h = '<div class="cg"><b>Día</b>' + [["max", "Máx. 10 días"], [0, "Hoy"], [3, "En 3 días"], [7, "En 7 días"]].map(function (x) { return ch(x[1], "cd", x[0], st.cd); }).join("") + '</div>';
    else h = '<div class="cg"><b>Acumulado</b>' + [[1, "24 h"], [3, "72 h"], [7, "7 días"]].map(function (x) { return ch(x[1], "ac", x[0], st.ac); }).join("") + '</div>';
    $("hCtl").innerHTML = h;
    [].forEach.call($("hCtl").querySelectorAll("button[data-k]"), function (b) { b.onclick = function () { var k = b.dataset.k; st[k] = k === "p" || (k === "cd" && b.dataset.v === "max") ? b.dataset.v : +b.dataset.v; if (k === "p") SEL = null; dibuja(); }; });
  }

  /* ---------- fichas ---------- */
  function dato(k, v, full) { return '<div class="gpar' + (full ? " full" : "") + '"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function cab(badge, col, tit, sub, tc) { return '<div class="gfi-h"><div class="gfi-m" style="--c:' + col + ';font-size:11px' + (tc ? ';color:' + tc : "") + '">' + badge + '</div><div><h3>' + tit + '</h3><div class="nota">' + sub + '</div></div></div>'; }
  function filaAv(a) { return '<tr data-i="' + a._i + '"><td>' + M.ico("ola", 16) + '</td><td><b style="color:' + NC[Math.min(3, a._n)] + '">' + NT[Math.min(3, a._n)] + '</b> · N° ' + esc(a.numero || "—") + '<br><small class="nota">' + vigTxt(a) + ' · ' + resta(a) + (a._d.length ? ' · ' + esc(a._d.join(", ")) : ' · sin ubicación') + '</small></td></tr>'; }
  function contexto(a) {
    var mis = AV.filter(function (z) { return z !== a && z._d.some(function (d) { return a._d.indexOf(d) >= 0; }); }), ant = mis.filter(function (z) { return z.fin < a.inicio; }).sort(function (x, y) { return y.fin.localeCompare(x.fin); })[0], ini = AV.reduce(function (m, z) { return !m || z.inicio < m ? z.inicio : m; }, "");
    var n30 = AV.filter(function (z) { return z.fin >= S.diaKey(Date.now() - 30 * DIA) && z._d.some(function (d) { return a._d.indexOf(d) >= 0; }); }).length;
    return dato("Avisos desde el " + fd(ini), AV.length + ' en total') + (a._d.length ? dato("En estos departamentos, 30 días", n30 + ' aviso' + (n30 === 1 ? "" : "s")) : "") + (ant ? dato("Aviso anterior", '<a href="#" data-av="' + ant._i + '">N° ' + esc(ant.numero || "") + '</a> · ' + vigTxt(ant)) : "");
  }
  function fichaAviso(a) {
    var pm = popMuns(a._ms), I = infraDe(a._ms), pr = a._ms.map(function (k) { return T.M[k]; }).filter(Boolean).sort(function (x, y) { return (y.pob || 0) - (x.pob || 0); }).slice(0, 5), col = NC[Math.min(3, a._n)];
    var det = a._b.length ? a._b.map(function (b, j) {
      return '<details class="mdet" style="margin-top:6px"' + (a._b.length <= 2 || j === 0 ? " open" : "") + '><summary>' + esc(b.d) + (b.ini ? ' · ' + (b.ini === b.fin ? fd(b.ini) : fd(b.ini) + ' – ' + fd(b.fin)) : '') + (b.cu ? ' · cuenca ' + esc(b.cu) : '') + '</summary><table class="mlist">' + b.it.map(function (i) { return '<tr><td style="white-space:nowrap"><b>' + esc(i.rio) + '</b></td><td>' + esc(i.txt || "—") + '<br><small class="nota">' + esc(i.tipo) + (i.ms.length ? ' · municipio' + (i.ms.length > 1 ? "s" : "") + ': ' + esc(i.ms.map(function (k) { return T.M[k].n; }).join(", ")) : '') + '</small></td></tr>'; }).join("") + '</table></details>';
    }).join("") : (a._rios.length || a._pob.length ? '<div class="gsec">Ríos y poblados citados</div>' + (a._rios.length ? '<div class="xchips">' + a._rios.slice(0, 40).map(function (r) { return '<span>' + esc(r) + '</span>'; }).join("") + '</div>' : '') + (a._pob.length ? '<div class="xchips">' + a._pob.map(function (r) { return '<span>' + esc(r) + '</span>'; }).join("") + '</div>' : '') : '');
    return '<div class="xc gfi">' + cab(NT[Math.min(3, a._n)], col, M.ico("ola", 20) + ' Aviso hidrológico', 'N° ' + esc(a.numero || "—") + ' · publicado ' + esc((a.publicada || "").slice(0, 16)) + ' · SENAMHI') +
      (a._sin ? '<div class="xval" style="border-left:6px solid #d7263d;font-weight:600">El detalle de este aviso (ríos, poblados y departamentos) no se pudo leer: el PDF del SENAMHI no estaba disponible. Solo se conocen el nivel y la vigencia. Verifíquelo en el enlace oficial.</div>' : '') +
      '<div class="gsec">Parámetros del aviso</div><div class="gpars">' + dato("Nivel", '<span style="color:' + col + '">' + NT[Math.min(3, a._n)] + '</span>') + dato("Vigencia", vigTxt(a) + ' <small>(' + ndias(a) + ' día' + (ndias(a) === 1 ? "" : "s") + ')</small>') + dato("Estado", resta(a)) + dato("Ríos citados", a._rios.length || "—") +
      dato("Departamentos", esc(a._d.join(", ")) || "sin dato", true) + (a._cu.length ? dato("Cuencas", esc(a._cu.join(", ")), true) : "") + dato("Poblados citados", a._pob.length || "—") + dato("Municipios nombrados", a._ms.length ? a._ms.length : "ninguno") + '</div>' + det +
      (a._ms.length ? '<div class="gsec">Población y servicios en los municipios nombrados</div><div class="gpars">' + dato("Población (INE)", pm.pob ? M.fmtP(pm.pob) + ' hab.' : "sin dato") + dato("Hospitales", I.hosp) + dato("Centros, puestos, clínicas", I.cli) + dato("Consultorios", I.cons) + dato("Bomberos y rescate", I.bom) + dato("Policía", I.pol) + '</div>' +
        '<table class="xt2 gfi-t"><tr><td></td><td style="text-align:right"><b>Hab.</b></td></tr>' + pr.map(function (m) { return '<tr><td><a href="#" data-mun="' + esc(m.k) + '">' + esc(m.n) + '</a> <small class="nota">' + esc(m.d) + '</small></td><td style="text-align:right">' + (m.pob != null ? M.fmtP(m.pob) : "s/d") + '</td></tr>'; }).join("") + '</table>' +
        '<p class="nota" style="margin:6px 0">Los municipios se identifican por el <b>nombre</b> de los poblados del aviso (aproximado). Se cuenta el total del municipio (INE); la zona afectada es la cercana al río. Servicios: OpenStreetMap, cobertura incompleta.</p>' : '') +
      '<div class="gsec">Contexto</div><div class="gpars">' + contexto(a) + '</div>' +
      (a.definicion ? '<details class="mdet" style="margin-top:8px"><summary>Qué significa este nivel (SENAMHI)</summary><p>' + esc(a.definicion) + '</p></details>' : '') +
      (a.texto ? '<details class="mdet" style="margin-top:6px"><summary>Texto oficial del aviso</summary><p>' + esc(a.texto) + '</p></details>' : '') +
      '<p class="nota" style="margin:8px 0 0">Es un pronóstico oficial, no una observación. El aviso no delimita la zona exacta.</p><div class="xact">' + (a.pdf ? '<a class="btn" href="' + esc(S.urlOk ? S.urlOk(a.pdf) : a.pdf) + '" target="_blank" rel="noopener">Abrir aviso del SENAMHI →</a>' : '') + '<a class="btn s" href="https://www.senamhi.gob.bo/alertas2.php" target="_blank" rel="noopener">Todos los avisos</a></div></div>';
  }
  function antM(k) { var R = (T.dh && T.dh.municipios && T.dh.municipios[k]) || [], o = {n: R.length, m: 0, a: 0, tipos: {}}; R.forEach(function (r) { o.m += r[3] || 0; o.a += r[5] || 0; o.tipos[r[2]] = (o.tipos[r[2]] || 0) + 1; }); return o; }
  function fichaMun(k) {
    var m = T.M[k], L = AV.filter(function (a) { return a._ms.indexOf(k) >= 0; }), Lf = filtrados().filter(function (a) { return a._ms.indexOf(k) >= 0; }), I = infraDe([k]), mg = M.mallaMun(k), dd = AV.filter(function (a) { return a._d.indexOf(m.d) >= 0 && vig(a) && a._ms.indexOf(k) < 0; });
    var mx = Lf.reduce(function (a, x) { return Math.max(a, x._n); }, -1), ant = antM(k), hosp = m.est.filter(function (p) { return /hospital/i.test(p[2] || ""); }).slice(0, 3).map(function (p) { return esc(p[2]); });
    return '<div class="xc gfi">' + cab(mx < 0 ? "Sin aviso" : NT[Math.min(3, mx)], mx < 0 ? SIN : NC[Math.min(3, mx)], esc(m.n), esc(m.d) + ' · municipio') +
      '<div class="gsec">Avisos que nombran este municipio</div>' + (Lf.length ? '<table class="mlist">' + Lf.map(filaAv).join("") + '</table>' : '<p class="nota">' + (L.length ? 'Ningún aviso del filtro lo nombra (' + L.length + ' en todo el período: cambie el período).' : 'Ningún aviso lo nombra por el nombre de un poblado.') + (dd.length ? ' Hay ' + dd.length + ' aviso' + (dd.length === 1 ? "" : "s") + ' vigente' + (dd.length === 1 ? "" : "s") + ' en ' + esc(m.d) + ' que no lo nombra' + (dd.length === 1 ? "" : "n") + '.' : '') + '</p>') +
      '<div class="gsec">Municipio</div><div class="gpars">' + dato("Población (INE)", m.pob != null ? A.fmt(m.pob) + ' hab.' : "sin dato") + dato("Superficie", fmt(m.km2) + " km²") + dato("Densidad media", m.pob != null && m.km2 ? fmt(m.pob / m.km2, 1) + ' hab./km²' : "—") + dato("Avisos que lo nombran (período disponible)", L.length || "ninguno", true) + '</div>' +
      '<div class="gsec">Qué hay en el municipio</div><div class="gpars">' + dato("Hospitales", I.hosp + (hosp.length ? ' <small>' + hosp.join(", ") + '</small>' : "")) + dato("Centros, puestos, clínicas", I.cli) + dato("Consultorios", I.cons) + dato("Bomberos y rescate", I.bom) + dato("Policía", I.pol) + '</div>' +
      '<div class="gsec">Antecedentes (DesInventar 1970–2015)</div><div class="gpars">' + dato("Registros de inundación, riada y similares", ant.n || "ninguno", true) + (ant.n ? dato("Muertos", ant.m) + dato("Afectados", A.fmt(ant.a)) : "") + '</div>' +
      '<p class="nota" style="margin:6px 0">' + (mg ? 'El mapa muestra dónde vive la gente: celdas de ~1 km (malla WorldPop reescalada al total INE ' + esc(mg.anio) + '). ' : '') + 'Servicios: OpenStreetMap, cobertura incompleta. DesInventar tiene subregistro y no incluye eventos recientes.</p>' +
      '<div class="xact"><a class="btn" href="municipio.html?d=' + encodeURIComponent(m.d) + '&m=' + encodeURIComponent(m.n) + '">Perfil del municipio →</a><a class="btn s" href="#hMon" id="hIrMon">Monitoreo climático ↓</a></div></div>';
  }
  function secCuenca(p) {
    var f = HMAP.cuencaDe(p.nombre), tr = HMAP.tramo(p, TRAMO_KM), h = '<div class="gsec">Tramo y cuenca aportante</div><div class="gpars">';
    h += dato("Tramo dibujado", tr ? esc(tr.rio) + ' · ±' + TRAMO_KM + ' km' + (tr.d >= 1 ? ' <small>(punto a ' + fmt(tr.d, 1) + ' km del trazado)</small>' : "") : "sin trazado del río en la red cargada", true);
    if (!f) return h + dato("Cuenca aportante", "sin dato: no está en la red cargada", true) + '</div>';
    var ll = FX.estado === "ok" ? HMAP.lluviaCuenca(p.nombre, FX.pts, {a1: function (q) { return acum(q, 1); }, a3: function (q) { return acum(q, 3); }, a7: function (q) { return acum(q, 7); }}) : null;
    h += dato("Área aportante (HydroBASINS)", fmt(f.properties.km2) + ' km²') + dato("Subcuencas unidas", f.properties.sub);
    h += ll ? (ll.n ? dato("Lluvia prevista media en la cuenca", fmt(ll.a1, 1) + ' mm en 24 h · ' + fmt(ll.a3, 1) + ' mm en 72 h · ' + fmt(ll.a7, 1) + ' mm en 7 días <small>(' + ll.n + ' punto' + (ll.n === 1 ? "" : "s") + ' del modelo)</small>', true) : dato("Lluvia prevista en la cuenca", "sin punto del modelo dentro de la cuenca", true)) : dato("Lluvia prevista en la cuenca", FX.estado === "error" ? "sin dato (sin conexión con el modelo)" : "consultando…", true);
    return h + '</div><p class="nota" style="margin:4px 0 6px">La cuenca es la unión de las subcuencas HydroBASINS (nivel 6) que drenan al punto: incluye toda la subcuenca que lo contiene y puede abarcar tramos aguas abajo. La lluvia es el promedio de los puntos del modelo (~1°) dentro de ella, no de estaciones.</p>';
  }
  function fichaCq(i) {
    var p = ST[i]; if (!p) return '<div class="xc xhint">Punto no disponible.</div>'; var c = claseCq(p), r = ratioCq(p), lec = lecturaP(p), vd = vigDep(p.departamento), pd = prDep(p.departamento), k = iHoy(p);
    return '<div class="xc gfi">' + cab(r == null ? "—" : '<span style="white-space:nowrap">' + Math.round(r * 100) + '<small>%</small></span>', NC[c], esc(p.nombre) + ' <small class="nota">' + esc(p.rio) + '</small>', 'Punto del modelo GloFAS · ' + ({max: "máximo de 10 días", 0: "hoy", 3: "en 3 días", 7: "en 7 días"})[st.cd] + ' · % del umbral P90', c === 1 ? "#10233d" : "") +
      '<div id="hCqC" style="height:215px"></div><div class="gsec">Caudal modelado</div><div class="gpars">' + dato("Estado (próximos 10 días)", esc(p.estado), true) + dato("Hoy", A.fmt(p.caudal_m3s[k]) + ' m³/s') + dato("Máximo en 10 días", A.fmt(p.caudal_max_10d) + ' m³/s') + dato("Mediana de la fecha", A.fmt((p.p50 || [])[k]) + ' m³/s') + dato("Umbral alto (P90)", A.fmt((p.p90 || [])[k]) + ' m³/s') + '</div>' +
      secCuenca(p) + '<div class="gsec">Lectura de las fuentes</div><div class="xval" style="border-left:6px solid ' + lec.c + '">' + lec.t + '</div><p class="nota" style="margin:2px 0 4px">' + esc(lec.d) + '</p><div class="gpars">' +
      dato("SENAMHI en " + esc(p.departamento), vd.length ? vd.length + ' aviso' + (vd.length === 1 ? "" : "s") + ' vigente' + (vd.length === 1 ? "" : "s") + ' (' + NT[Math.min(3, Math.max.apply(0, vd.map(function (a) { return a._n; })))].toLowerCase() + ')' : "ninguno vigente con ubicación legible", true) + dato("Prensa, 30 días en " + esc(p.departamento), pd.length + ' nota' + (pd.length === 1 ? "" : "s"), true) + '</div>' +
      (vd.length ? '<table class="mlist">' + vd.map(filaAv).join("") + '</table>' : "") +
      '<p class="nota" style="margin:8px 0 0">Línea azul: caudal modelado (continua hasta hoy; discontinua = previsión); no es caudal observado. Banda gris: entre la mediana y el umbral P90 de 1993–2022. Actualizado: ' + esc(((D.caudales || {}).actualizado || "").slice(0, 16).replace("T", " ")) + ' UTC. GloFAS no ve crecidas repentinas de ríos menores.</p></div>';
  }
  function serieCq(p) {
    if (!p || !$("hCqC")) return; var tx = X.css("--mut") || "#888", ln = X.css("--line") || "#ccc", i = iHoy(p), pas = p.caudal_m3s.map(function (v, k) { return k <= i ? v : null; }), fut = p.caudal_m3s.map(function (v, k) { return k >= i ? v : null; }), ban = (p.p90 || []).map(function (v, k) { return Math.max(0, v - (p.p50 || [])[k]); });
    X.chart("hCqC", {animation: false, grid: {left: 46, right: 10, top: 14, bottom: 24}, tooltip: {trigger: "axis", confine: true, formatter: function (ps) { var k = ps[0].dataIndex; return fd(p.fechas[k]) + (k > i ? " (previsto)" : "") + '<br>Caudal modelado: <b>' + A.fmt(p.caudal_m3s[k]) + '</b> m³/s<br>Mediana: ' + A.fmt((p.p50 || [])[k]) + ' · P90: ' + A.fmt((p.p90 || [])[k]); }},
      xAxis: {type: "category", data: p.fechas, boundaryGap: false, axisLabel: {color: tx, fontSize: 9.5, interval: 6, formatter: function (v) { return fd(v); }}, axisLine: {lineStyle: {color: ln}}, axisTick: {show: false}}, yAxis: {type: "value", min: 0, splitNumber: 3, axisLabel: {color: tx, fontSize: 9.5, formatter: function (v) { return v >= 1000 ? (v / 1000) + " mil" : v; }}, splitLine: {lineStyle: {color: ln}}},
      series: [{type: "line", data: p.p50 || [], stack: "b", symbol: "none", lineStyle: {opacity: 0}, silent: true}, {type: "line", data: ban, stack: "b", symbol: "none", lineStyle: {opacity: 0}, areaStyle: {color: "#8a97a8", opacity: .28}, silent: true}, {type: "line", data: p.p90 || [], symbol: "none", lineStyle: {width: 1, type: "dashed", color: "#d7263d"}, silent: true},
        {type: "line", data: pas, symbol: "none", lineStyle: {width: 2.2, color: "#1d6fb8"}, markLine: {symbol: "none", silent: true, label: {formatter: "hoy", color: tx, fontSize: 9.5}, lineStyle: {color: tx, type: "solid", width: 1}, data: [{xAxis: p.hoy}]}}, {type: "line", data: fut, symbol: "none", lineStyle: {width: 2.2, color: "#1d6fb8", type: "dashed"}}]});
  }
  function fichaLl(i) {
    var p = FX.pts[i]; if (!p) return '<div class="xc xhint">Punto no disponible.</div>'; var v = acum(p, st.ac), c = claseLl(v), m = T.donde(p.lat, p.lon), av = m ? AV.filter(function (a) { return vig(a) && a._d.indexOf(m.d) >= 0; }) : [], dmx = -1, jm = -1;
    (p.pp || []).forEach(function (x, j) { if (x != null && x > dmx) { dmx = x; jm = j; } });
    return '<div class="xc gfi">' + cab('<span style="white-space:nowrap">' + fmt(v, 0) + '<small>mm</small></span>', c[1], esc(M.nombrePunto(p)) + (p.cap ? ' <small class="nota">capital</small>' : ""), 'Punto del modelo · lluvia acumulada ' + ({1: "24 h", 3: "72 h", 7: "7 días"})[st.ac], CLARO.test(c[1]) ? "#10233d" : "") +
      '<div id="hLlC" style="height:200px"></div><div class="gsec">Lluvia prevista en este punto</div><div class="gpars">' + dato("24 h", fmt(acum(p, 1), 1) + ' mm') + dato("72 h", fmt(acum(p, 3), 1) + ' mm') + dato("7 días", fmt(acum(p, 7), 1) + ' mm') + dato("Día más lluvioso", jm < 0 ? "—" : fmt(dmx, 1) + ' mm (' + fd(FX.dias[jm]) + ')') + '</div>' +
      '<div class="gsec">Aviso hidrológico vigente en ' + esc(m ? m.d : "el departamento") + '</div>' + (av.length ? '<table class="mlist">' + av.map(filaAv).join("") + '</table>' : '<p class="nota">' + (m ? 'Ninguno vigente con ubicación legible.' : 'El punto no cae dentro de un municipio.') + notaSin() + '</p>') +
      '<p class="nota" style="margin:8px 0 0">Valor de un punto del modelo (~1°), no de una estación: puede diferir mucho en valles y montañas. La lluvia prevista no es un aviso; compárela con el SENAMHI. Más variables en <a href="meteorologica.html">Meteorológica</a>.</p></div>';
  }
  function serieLl(p) {
    if (!p || !$("hLlC")) return; var tx = X.css("--mut") || "#888", d = FX.dias.map(fdl), ac = [], s = 0; (p.pp || []).forEach(function (x) { s += x || 0; ac.push(Math.round(s * 10) / 10); });
    X.chart("hLlC", {tooltip: {trigger: "axis"}, legend: {top: 0, textStyle: {color: tx, fontSize: 11}, data: ["Lluvia diaria", "Acumulado"]}, grid: {left: 36, right: 40, top: 28, bottom: 22}, xAxis: {type: "category", data: d, axisLabel: {color: tx, fontSize: 10}}, yAxis: [{type: "value", min: 0, axisLabel: {color: tx}, splitLine: {lineStyle: {opacity: .25}}}, {type: "value", min: 0, axisLabel: {color: "#6d28d9"}, splitLine: {show: false}}],
      series: [{name: "Lluvia diaria", type: "bar", data: p.pp, itemStyle: {color: "#4aa3f5", opacity: .85, borderRadius: [3, 3, 0, 0]}}, {name: "Acumulado", type: "line", yAxisIndex: 1, data: ac, smooth: .3, symbol: "circle", symbolSize: 5, lineStyle: {color: "#6d28d9", width: 2}, itemStyle: {color: "#6d28d9"}}]});
  }
  function fichaPrensa(e) {
    return '<div class="xc gfi">' + cab(M.ico("ola", 26), COL, esc(e.titulo), esc(new Date(e.ts).toLocaleString("es-BO")) + ' · ' + esc(e.fuente || "prensa")) + '<div class="gpars">' + dato("Lugar", esc(e.lugar || (e.departamentos || []).join(", ") || "—")) + dato("Ubicación en el mapa", esc(e.metodo || "aproximada"), true) + '</div>' +
      '<p class="nota" style="margin:8px 0 0">Hecho reportado por la prensa: no es un aviso ni está confirmado. El punto marca el lugar nombrado en la nota, no el sitio exacto.</p>' + (e.url ? '<a class="btn" href="' + esc(e.url) + '" target="_blank" rel="noopener">Abrir la nota →</a> ' : '') + (e.id && D.ev.some(function (z) { return z.id === e.id; }) ? '<a class="btn s" href="evento.html?id=' + encodeURIComponent(e.id) + '">Ficha del hecho →</a>' : '') + '</div>';
  }
  function hint() {
    if (st.v !== "avisos") return '<div class="xc xhint"><h3>' + (st.v === "caudal" ? "Caudal de ríos" : "Lluvia prevista") + '</h3>' + (st.v === "caudal" ? 'Toque un punto del mapa para ver el caudal modelado frente a lo normal y la lectura de las fuentes.' : (FX.estado === "ok" ? 'Toque un punto para ver la lluvia diaria y acumulada de 7 días.' : 'La lluvia prevista se consulta al modelo Open-Meteo desde su navegador.')) + '</div>';
    var L = filtrados(); return '<div class="xc"><h3>Avisos (' + L.length + ')</h3>' + (L.length ? '<table class="mlist">' + L.slice(0, 12).map(filaAv).join("") + '</table>' + (L.length > 12 ? '<p class="nota">Y ' + (L.length - 12) + ' más en la lista de abajo.</p>' : '') + '<p class="nota" style="margin:6px 0 0">Toque un aviso, un ícono o un municipio coloreado del mapa.</p>' : '<p class="nota">Ningún aviso en este filtro. Cambie el período.</p>') + '</div>';
  }
  function detalle() {
    var el = $("hDet"); if (!el) return; var h;
    if (!SEL) h = hint(); else if (SEL.t === "av") h = fichaAviso(AV[SEL.i]); else if (SEL.t === "mun") h = fichaMun(SEL.k); else if (SEL.t === "cq") h = fichaCq(SEL.i); else if (SEL.t === "ll") h = fichaLl(SEL.i); else h = fichaPrensa(SEL.e);
    el.innerHTML = h;
    [].forEach.call(el.querySelectorAll("a[data-av]"), function (a) { a.onclick = function (e) { e.preventDefault(); SEL = {t: "av", i: +a.dataset.av}; selecciona(true); }; });
    [].forEach.call(el.querySelectorAll("a[data-mun]"), function (a) { a.onclick = function (e) { e.preventDefault(); SEL = {t: "mun", k: a.dataset.mun}; selecciona(true); }; });
    [].forEach.call(el.querySelectorAll("tr[data-i]"), function (r) { r.onclick = function () { SEL = {t: "av", i: +r.dataset.i}; if (st.v !== "avisos") { st.v = "avisos"; vistaBtn(); } selecciona(true); }; });
    var ir = $("hIrMon"); if (ir) ir.onclick = function (e) { e.preventDefault(); var m = SEL && T.M[SEL.k]; if (m && window.CLIMA) CLIMA.irMun(m.n + " (" + m.d + ")"); var s = $("hMon"); if (s) s.scrollIntoView({behavior: "smooth"}); };
    if (SEL && SEL.t === "cq") serieCq(ST[SEL.i]); if (SEL && SEL.t === "ll") serieLl(FX.pts[SEL.i]);
  }

  /* ---------- datos del mapa ---------- */
  function prensaL() { var t0 = Date.now() - 30 * DIA; return PR.filter(function (e) { return e.lat != null && e.ts >= t0 && LUGAR.ev(T, LG, e); }); }
  function geoDep(L) {
    var o = nivDep(L), vg = {}; AV.forEach(function (a) { if (vig(a)) a._d.forEach(function (d) { vg[d] = 1; }); });
    return M.fc((T.D.geoDep.features || []).map(function (f) { var d = f.properties.n, v = o[d]; return {type: "Feature", geometry: f.geometry, properties: {n: d, c: v == null ? SIN : NC[Math.min(3, v)], o: st.v === "avisos" && v != null && (!LG.d || d === LG.d) ? .12 : 0, a: vg[d] ? 1 : 0}}; }));
  }
  function geoMun(L) {
    var o = nivMun(L), f = Object.keys(o).map(function (k) { return {type: "Feature", geometry: T.M[k].f.geometry, properties: {k: k, c: NC[Math.min(3, o[k])], o: .66, s: SEL && SEL.t === "mun" && SEL.k === k ? 1 : 0}}; });
    if (SEL && SEL.t === "mun" && o[SEL.k] == null && T.M[SEL.k]) f.push({type: "Feature", geometry: T.M[SEL.k].f.geometry, properties: {k: SEL.k, c: SIN, o: 0, s: 1}});
    return M.fc(f);
  }
  function geoPrensa() { return M.fc(prensaL().map(function (e, i) { return {type: "Feature", geometry: {type: "Point", coordinates: [e.lon, e.lat]}, properties: {i: i, s: SEL && SEL.t === "pn" && SEL.e === e ? 1 : 0}}; })); }
  /* tramo del río y punto de medición de cada punto del modelo de caudal (el tramo es indicativo: ±TRAMO_KM a lo largo del río más cercano) */
  function datosCq() {
    var tr = [], pt = [];
    ST.forEach(function (p, i) {
      if (!enS(p)) return; var c = claseCq(p), t = HMAP.tramo(p, TRAMO_KM), sel = SEL && SEL.t === "cq" && SEL.i === i ? 1 : 0;
      if (t) { var t2 = HMAP.tramo(p, TRAMO_KM_LG); if (t2 && t2.coords.length > t.coords.length) tr.push({type: "Feature", geometry: {type: "LineString", coordinates: t2.coords}, properties: {i: i, c: NC[c], rn: t.rio, lg: 1}}); tr.push({type: "Feature", geometry: {type: "LineString", coordinates: t.coords}, properties: {i: i, c: NC[c], rn: t.rio, lg: 0}}); }
      pt.push({type: "Feature", geometry: {type: "Point", coordinates: [t ? t.x : p.lon, t ? t.y : p.lat]}, properties: {i: i, c: NC[c], p: (p.nivel || 0) >= 2 ? 1 : 0, s: sel}});
    });
    return {tr: tr, pt: pt};
  }
  /* ríos citados en los avisos del filtro, recortados al departamento del aviso; los que no tienen trazado en la red cargada se cuentan aparte */
  function datosAv(L) {
    var o = {}, sin = {}, dg = {}; (T.D.geoDep.features || []).forEach(function (f) { dg[f.properties.n] = f.geometry; });
    L.forEach(function (a) {
      var it = [];
      if (a._b.length) a._b.forEach(function (b) { b.it.forEach(function (i) { it.push({r: i.rio, d: b.d}); }); }); else a._d.forEach(function (d) { a._rios.forEach(function (r) { it.push({r: r, d: d}); }); });
      it.forEach(function (x) {
        if (!x.d || !dg[x.d] || (LG.d && x.d !== LG.d)) return; var r = HMAP.riosAviso(x.r, dg[x.d]), k = HMAP.simple(x.r) + "|" + x.d;
        if (!r.hay) { sin[HMAP.simple(x.r)] = x.r; return; } if (!r.lineas.length) return;
        if (!o[k] || o[k].properties.nv < a._n) o[k] = {type: "Feature", geometry: {type: "MultiLineString", coordinates: r.lineas}, properties: {c: NC[Math.min(3, a._n)], nv: a._n, ai: a._i, rn: r.n, d: x.d}};
      });
    });
    SINT = Object.keys(sin).map(function (k) { return sin[k]; });
    return Object.keys(o).map(function (k) { return o[k]; });
  }
  function bajo(m) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark";
    HMAP.bajo(m);
    m.addSource("hd", {type: "geojson", data: geoDep([])}); m.addSource("mv", {type: "geojson", data: geoMun([])});
    m.addLayer({id: "hd-f", type: "fill", source: "hd", paint: {"fill-color": ["get", "c"], "fill-opacity": ["get", "o"]}});
    m.addLayer({id: "hd-o", type: "line", source: "hd", layout: {visibility: "none"}, filter: ["==", ["get", "a"], 1], paint: {"line-color": "#f26a1b", "line-width": 2, "line-dasharray": [2, 1.5]}});
    m.addLayer({id: "mv-f", type: "fill", source: "mv", paint: {"fill-color": ["get", "c"], "fill-opacity": ["get", "o"]}});
    m.addLayer({id: "mv-s", type: "line", source: "mv", filter: ["==", ["get", "s"], 1], paint: {"line-color": osc ? "#ffffff" : "#10233d", "line-width": 3}});
  }
  function alto(m) {
    var osc = document.documentElement.getAttribute("data-theme") === "dark";
    HMAP.alto(m);
    m.addSource("pn", {type: "geojson", data: geoPrensa()});
    m.addLayer({id: "pn-c", type: "circle", source: "pn", layout: {visibility: "none"}, paint: {"circle-radius": ["case", ["==", ["get", "s"], 1], 8, 5], "circle-color": "rgba(45,127,184,.35)", "circle-stroke-color": ["case", ["==", ["get", "s"], 1], osc ? "#fff" : "#000", "#7fc4ff"], "circle-stroke-width": ["case", ["==", ["get", "s"], 1], 3, 1.6]}});
  }
  function tipCb(k, i, p) {
    if (k === "cq") {
      var q = ST[i]; if (!q) return ""; var r = ratioCq(q), t = HMAP.tramo(q, TRAMO_KM);
      return '<b style="margin:0">' + esc(q.nombre) + ' · ' + esc(q.rio) + '</b><span style="color:' + NC[claseCq(q)] + '">●</span> ' + esc(CQ[claseCq(q)][0]) + (r == null ? "" : ' · ' + Math.round(r * 100) + ' % del P90') + '<br>' + M.fmt(q.caudal_m3s[iHoy(q)]) + ' m³/s hoy (modelo GloFAS)<br><i>' + (t ? 'tramo indicativo de ±' + TRAMO_KM + ' km sobre ' + esc(t.rio) : 'sin trazado del río en la red cargada') + '</i><br>clic para ver el detalle';
    }
    var a = AV[i]; if (!a) return "";
    return '<b style="margin:0">Aviso hidrológico · ' + esc(NT[Math.min(3, a._n)]) + '</b>' + esc(p.rn || "") + ' en ' + esc(p.d || "") + '<br>N° ' + esc(a.numero || "—") + ' · ' + vigTxt(a) + '<br>clic para ver el aviso';
  }
  function listo(m) {
    var pop = m._pop, mun = function (e) { return T.M[e.features[0].properties.k]; }, sobre = function (e, caps) { var ls = caps.filter(function (l) { return m.getLayer(l) && m.getLayoutProperty(l, "visibility") !== "none"; }); return ls.length > 0 && m.queryRenderedFeatures(e.point, {layers: ls}).length > 0; }, TOP = HMAP.CAPAS_HIT.concat(["pn-c"]);
    HMAP.enlaza(m, {
      tip: tipCb,
      tipLluvia: function (v, n) { return '<b style="margin:0">≈ ' + fmt(v, v < 10 ? 1 : 0) + ' mm</b>acumulados en ' + ({1: "24 h", 3: "72 h", 7: "7 días"})[st.ac] + '<br>punto del modelo más cercano: ' + esc(n && n.p ? M.nombrePunto(n.p) : "—") + '<br><i>modelo Open-Meteo (~1°), no es una estación</i>'; },
      clic: function (k, i) { SEL = k === "cq" ? {t: "cq", i: i} : {t: "av", i: i}; selecciona(true); }
    });
    m.on("mousemove", "mv-f", function (e) { var q = mun(e); if (!q || st.v !== "avisos" || sobre(e, TOP)) return; var L = filtrados().filter(function (a) { return a._ms.indexOf(q.k) >= 0; }); m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(q.n) + ' <span style="font-weight:400">' + esc(q.d) + '</span></b>' + L.map(function (a) { return '<span style="color:' + NC[Math.min(3, a._n)] + '">●</span> N° ' + esc(a.numero || "") + ' · ' + esc(a._rios.slice(0, 3).join(", ")); }).join("<br>") + '<br>clic para ver el detalle</div>').addTo(m); });
    m.on("mouseleave", "mv-f", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "mv-f", function (e) { var q = mun(e); if (!q || st.v !== "avisos" || sobre(e, TOP)) return; SEL = {t: "mun", k: q.k}; selecciona(false); });
    m.on("click", "hd-f", function (e) { if (st.v !== "avisos" || sobre(e, TOP.concat(["mv-f"]))) return; var d = e.features[0].properties.n, L = filtrados().filter(function (a) { return a._d.indexOf(d) >= 0; }), a = topAv(L); if (a) { SEL = {t: "av", i: a._i}; selecciona(false); } });
    m.on("mousemove", "pn-c", function (e) { var q = prensaL()[e.features[0].properties.i]; if (!q) return; m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">' + esc(q.titulo) + '</b>' + esc(q.fuente || "prensa") + ' · ' + esc(new Date(q.ts).toLocaleDateString("es-BO")) + '<br><i>ubicación aproximada · clic para ver la nota</i></div>').addTo(m); });
    m.on("mouseleave", "pn-c", function () { pop.remove(); m.getCanvas().style.cursor = ""; });
    m.on("click", "pn-c", function (e) { var q = prensaL()[e.features[0].properties.i]; if (q) { SEL = {t: "pn", e: q}; selecciona(false); } });
    m.on("zoomend", etiquetas);
    LUGAR.ajusta(m, T, LG, false); capasVista(); dibuja();
  }
  function capasVista() {
    if (!map || !map._ok || !PN) return; var v = st.v, on = function (id) { return PN.get(id); }, mu = SEL && SEL.t === "mun", V = function (ids, x) { ids.forEach(function (i) { M.vis(map, i, x); }); };
    V(["h-cu-f", "h-cu-l"], on("cu")); V(["h-rio-c", "h-rio-ab", "h-rio-fl", "h-rio-hit", "h-rio-hitc"], on("rio")); V(["h-lg-f", "h-lg-l"], on("lg")); M.vis(map, "d-l", on("dep"));
    M.vis(map, "hd-f", v === "avisos"); M.vis(map, "hd-o", v !== "avisos" && on("dep")); V(["mv-f", "mv-s"], v === "avisos" && on("mn"));
    V(["h-ar-k", "h-ar-l", "h-ar-fl"], v === "avisos" && on("ar")); V(["h-tr-w", "h-tr-k", "h-tr-l", "h-tr-fl", "h-pt-p", "h-pt-c", "h-pt-i"], v === "caudal" && on("tr")); V(["h-ca-f", "h-ca-l"], v === "caudal" && on("ca")); M.vis(map, "h-ll", v === "lluvia" && on("ll"));
    M.vis(map, "pn-c", on("pr")); M.vis(map, "ex-f", on("pob")); M.vis(map, "ex-l", mu); M.vis(map, "inf-s", on("sal")); M.vis(map, "inf-e", on("eme"));
  }
  function limpiaMK() { MK.forEach(function (m) { m.remove(); }); MK = []; }
  function marca(html, cls, lon, lat, top) { var el = document.createElement("div"); el.className = cls; el.innerHTML = html; MK.push(new maplibregl.Marker({element: el, anchor: top ? "top" : "center", offset: top ? [0, 14] : [0, 0]}).setLngLat([lon, lat]).addTo(map)); }
  function etiquetas() {
    limpiaMK(); if (!map || !map._ok) return;
    if (st.v === "avisos" && SEL && SEL.t === "mun" && map.getZoom() >= 6) { var m = T.M[SEL.k], c = centro(m); marca('<span class="gm-n">' + esc(m.n) + '</span><small>' + (m.pob != null ? M.fmtP(m.pob) + ' hab.' : 'sin dato') + '</small>', "gm-lab", c[0], c[1]); }
  }
  function leyenda() {
    if (!PN) return; var g = function (t, b) { return '<div class="glg"><b>' + t + '</b><div>' + b + '</div></div>'; }, h = "", v = st.v, on = function (i) { return PN.get(i); }, ln = function (c, t, k) { return '<span class="glin" style="--c:' + c + '"><i' + (k ? ' class="' + k + '"' : "") + '></i>' + t + '</span>'; };
    var base = ""; if (on("rio")) base += ln("#5fd0ff", "Ríos (más grueso = más longitud dentro de Bolivia)"); if (on("cu")) base += ln("#22b8cf", "Cuenca del Amazonas", "s") + ln("#8b8cff", "Cuenca del Plata", "s") + ln("#e0a85c", "Cuenca endorreica del Altiplano", "s"); if (on("lg")) base += ln("#46b2ff", "Lagos y salares: contorno de referencia, no la superficie de hoy", "s");
    if (base) h += g("Base hidrográfica", base + '<small>Ríos: OpenStreetMap (los de más de 40 km en Bolivia) · cuencas: HydroBASINS. Pase el cursor para ver el nombre.</small>');
    if (v === "avisos") {
      h += g("Aviso hidrológico (nivel)", '<span class="gesc">' + [1, 2, 3].map(function (i) { return '<span><i style="background:' + NC[i] + '"></i>' + NT[i] + '</span>'; }).join("") + '<span><i style="background:#7b8794;opacity:.4"></i>Sin aviso</span></span><small>El río encendido es el citado en el aviso, dentro del departamento del aviso. Relleno claro = departamento con aviso · fuerte = municipio nombrado por un poblado.' + (SINT.length ? ' <b>' + SINT.length + ' río' + (SINT.length === 1 ? "" : "s") + ' citado' + (SINT.length === 1 ? "" : "s") + ' sin trazado en la red cargada</b> (' + esc(SINT.slice(0, 6).join(", ")) + (SINT.length > 6 ? "…" : "") + '): ríos menores.' : '') + '</small>');
    } else if (v === "caudal") {
      h += g("Caudal modelado frente al P90", '<span class="gesc">' + CQ.map(function (x) { return '<span><i style="background:' + x[1] + '"></i>' + x[0] + '</span>'; }).join("") + '</span><span class="gic"><span class="gring" style="--c:' + NC[0] + '"></span>Punto de medición del modelo (sobre el río)</span><small>El tramo grueso (±' + TRAMO_KM + ' km) es lo que representa el punto GloFAS (celda de ~5 km); el trazo fino es el resto del curso del mismo río, solo de referencia. No son estaciones. Pulso = sobre el P90.</small>') + g("Contorno", '<span><i style="border:2px dashed #f26a1b;background:transparent;box-sizing:border-box"></i>Departamento con aviso vigente hoy</span><span><i style="border:2px dashed #ffd166;background:transparent;box-sizing:border-box"></i>Cuenca aportante del punto elegido (aproximada)</span>');
    } else {
      h += g("Lluvia acumulada " + ({1: "24 h", 3: "72 h", 7: "7 días"})[st.ac] + " (mm) · modelo", '<span class="grmp" style="background:' + HMAP.gradLl() + '"></span><span class="grmpt"><i>0</i><i>5</i><i>20</i><i>50</i><i>100</i><i>200+</i></span><small>Interpolación entre puntos del modelo Open-Meteo (~1°); no son estaciones ni un aviso. Pase el cursor para ver el valor.</small>');
    }
    if (on("pob")) h += M.leyendaPob(); if (on("sal") || on("eme")) h += g("Infraestructura (OpenStreetMap)", ["hosp", "cli", "cons", "bom", "pol"].filter(function (k) { return (k === "bom" || k === "pol") ? on("eme") : on("sal"); }).map(function (k) { return '<span class="gic">' + M.ico(k, 18) + ({hosp: "Hospital", cli: "Centro / puesto / clínica", cons: "Consultorio", bom: "Bomberos / rescate", pol: "Policía"})[k] + '</span>'; }).join(""));
    if (on("pr")) h += g("Prensa", '<span class="gic"><i style="background:rgba(45,127,184,.35);border:1.6px solid #7fc4ff"></i>Reporte de prensa (ubicación aproximada)</span>');
    $("hL").innerHTML = h;
  }
  function listaMapa() { return st.v === "avisos" && SEL && SEL.t === "av" && AV[SEL.i] ? [AV[SEL.i]] : filtrados(); }
  function lluviaMapa() {
    if (!map || !map._ok) return; var k = st.ac + "|" + FX.t + "|" + FX.estado;
    if (FX.estado !== "ok") { HMAP.ponLluvia(map, null); LLK = ""; return; } if (k === LLK) return; LLK = k;
    HMAP.ponLluvia(map, FX.pts.map(function (p) { return {lon: p.lon, lat: p.lat, v: acum(p, st.ac), p: p}; }), (T.D.geoDep.features || []).map(function (f) { return f.geometry; }));
  }
  function infraMapa(m) {
    var on = function (i) { return PN && PN.get(i); }; if (!on("sal") && !on("eme")) { M.infData(map, []); return; }
    if (m) return;
    var f = M.infTodos(function (p) { return !LG.d || p.dep === LG.d; }).map(M.infoFeat); M.infData(map, f);
  }
  function refrescaMapa() {
    if (!map || !map._ok) return; var L = listaMapa();
    map.getSource("hd").setData(geoDep(L)); map.getSource("mv").setData(geoMun(L)); map.getSource("pn").setData(geoPrensa());
    HMAP.setData(map, "h-ar", datosAv(L)); var c = datosCq(); HMAP.setData(map, "h-tr", c.tr); HMAP.setData(map, "h-pt", c.pt); HMAP.aportante(map, SEL && SEL.t === "cq" && ST[SEL.i] ? ST[SEL.i].nombre : ""); lluviaMapa();
    var m = st.v === "avisos" && SEL && SEL.t === "mun" ? T.M[SEL.k] : null;
    if (m) { var c0 = centro(m), C = []; m.est.forEach(function (p) { C.push({d: 0, p: {lat: p[0], lon: p[1], n: p[2] || "(sin nombre)", k: /hospital/i.test(p[2] || "") ? "hosp" : p[3] === "consultorio" ? "cons" : "cli", op: p[4] || "", esp: p[5] || "", dep: p[6] || "", mun: p[7] || ""}}); }); [["bom", "bom"], ["res", "res"], ["pol", "pol"]].forEach(function (z) { m[z[0]].forEach(function (p) { C.push({d: 0, p: {lat: p[0], lon: p[1], n: p[2] || "(sin nombre)", k: z[1], op: "", esp: "", dep: p[4] || "", mun: p[5] || ""}}); }); });
      M.selec(map, {mu: [{m: m, d: 0, en: true}], C: C, R: [], lat: c0[1], lon: c0[0]}, []); var mg = M.mallaMun(m.k); if (mg) M.pintaMalla(map, mg); }
    else M.selec(map, null, []);
    infraMapa(m); capasVista(); leyenda(); etiquetas();
  }
  function volar() {
    if (!map || !map._ok || !SEL) return; var b = null, ext = function (m) { b = b ? [Math.min(b[0], m.bb[0]), Math.min(b[1], m.bb[1]), Math.max(b[2], m.bb[2]), Math.max(b[3], m.bb[3])] : m.bb.slice(); };
    if (SEL.t === "mun") ext(T.M[SEL.k]); else if (SEL.t === "av") { var a = AV[SEL.i]; if (a._ms.length) a._ms.forEach(function (k) { ext(T.M[k]); }); else a._d.forEach(function (d) { (T.DEP[d] || []).forEach(ext); }); }
    else if (SEL.t === "cq") { var p = ST[SEL.i], tq = HMAP.tramo(p, TRAMO_KM); if (tq && tq.coords.length > 1) { var bq = tq.coords.reduce(function (z, c) { return [Math.min(z[0], c[0]), Math.min(z[1], c[1]), Math.max(z[2], c[0]), Math.max(z[3], c[1])]; }, [1e9, 1e9, -1e9, -1e9]); map.fitBounds([[bq[0], bq[1]], [bq[2], bq[3]]], {duration: 600, padding: 70, maxZoom: 8.5}); } else map.flyTo({center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 6.5), duration: 600}); return; } else if (SEL.t === "ll") { var q = FX.pts[SEL.i]; map.flyTo({center: [q.lon, q.lat], zoom: Math.max(map.getZoom(), 6.5), duration: 600}); return; }
    else if (SEL.t === "pn") { map.flyTo({center: [SEL.e.lon, SEL.e.lat], zoom: Math.max(map.getZoom(), 8), duration: 600}); return; }
    if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {duration: 600, padding: 40, maxZoom: 10});
  }
  function selecciona(vuela) { ayuda(); refrescaMapa(); detalle(); if (vuela !== false) volar(); else if (SEL && SEL.t === "mun") volar(); }

  /* ---------- gráficos ---------- */
  function graficos() {
    var tx = X.css("--mut") || "#888", L = AV.filter(enA), el = $("hG1");
    var fs = DEPS.filter(function (d) { return L.some(function (a) { return a._d.indexOf(d) >= 0; }); }); if (L.some(function (a) { return !a._d.length; })) fs.push("Sin ubicar");
    if (!L.length) { el.style.height = "60px"; $("hG1n").textContent = "Sin avisos en este lugar."; var c0 = echarts.getInstanceByDom(el); if (c0) c0.clear(); }
    else {
      el.style.height = (80 + fs.length * 30) + "px"; var t0 = Math.min.apply(0, L.map(function (a) { return ts0(a.inicio); })), t1 = Math.max.apply(0, L.map(function (a) { return ts1(a.fin); }), Date.now() + 3 * DIA), dat = [];
      L.forEach(function (a) { (a._d.length ? a._d : ["Sin ubicar"]).forEach(function (d) { if (fs.indexOf(d) >= 0) dat.push({value: [fs.indexOf(d), ts0(a.inicio), ts1(a.fin), a._i], itemStyle: {color: NC[Math.min(3, a._n)]}}); }); });
      X.chart("hG1", {animation: false, grid: {left: 96, right: 16, top: 14, bottom: 30}, tooltip: {formatter: function (p) { if (!p.value) return ""; var a = AV[p.value[3]]; return 'Aviso N° ' + esc(a.numero || "") + ' · ' + NT[Math.min(3, a._n)] + '<br>' + vigTxt(a) + '<br>' + esc(a._rios.slice(0, 5).join(", ")); }},
        xAxis: {type: "time", min: t0, max: t1, axisLabel: {color: tx, fontSize: 10, formatter: function (v) { return fd(S.diaKey(v)); }}, splitLine: {lineStyle: {opacity: .2}}}, yAxis: {type: "category", data: fs, inverse: true, axisLabel: {color: tx, fontSize: 11.5}, axisLine: {show: false}, axisTick: {show: false}},
        series: [{type: "custom", renderItem: function (p, api) { var ci = api.value(0), s = api.coord([api.value(1), ci]), e = api.coord([api.value(2), ci]), h = Math.min(api.size([0, 1])[1] * .6, 20); return {type: "rect", shape: {x: s[0], y: s[1] - h / 2, width: Math.max(4, e[0] - s[0]), height: h, r: 3}, style: api.style()}; }, encode: {x: [1, 2], y: 0}, data: dat},
          {type: "line", data: [], markLine: {silent: true, symbol: "none", data: [{xAxis: Date.now(), label: {formatter: "hoy", color: tx, fontSize: 10}}], lineStyle: {type: "dashed", color: tx, width: 1.3}}}]});
      var ch = echarts.getInstanceByDom(el); if (ch) { ch.resize(); ch.off("click"); ch.on("click", function (p) { if (p.value && p.value[3] != null) { SEL = {t: "av", i: p.value[3]}; vista("avisos", true); } }); }
      $("hG1n").textContent = "Cada barra es un aviso (primer a último día de vigencia); el color es el nivel. Un aviso que abarca varios departamentos aparece en cada uno. Toque una barra para abrirla. Línea punteada: hoy.";
    }
    /* avisos por mes y nivel */
    var m0 = L.length ? L.reduce(function (m, a) { return !m || a.inicio < m ? a.inicio : m; }, "").slice(0, 7) : HOY.slice(0, 7), meses = [], y = +m0.slice(0, 4), mo = +m0.slice(5, 7), fin = HOY.slice(0, 7);
    while (true) { var k = y + "-" + String(mo).padStart(2, "0"); meses.push(k); if (k >= fin) break; if (++mo > 12) { mo = 1; y++; } }
    var por = [1, 2, 3].map(function (n) { return meses.map(function (k) { return L.filter(function (a) { return a._n === n && a.inicio.slice(0, 7) === k; }).length; }); }), multi = meses[0].slice(0, 4) !== meses[meses.length - 1].slice(0, 4);
    X.chart("hG2", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}}, legend: {top: 0, textStyle: {color: tx, fontSize: 11}}, grid: {left: 30, right: 10, top: 28, bottom: 24}, xAxis: {type: "category", data: meses.map(function (k) { return new Date(k + "-15T12:00:00").toLocaleDateString("es-BO", multi ? {month: "short", year: "2-digit"} : {month: "short"}).replace(/\./g, ""); }), axisLabel: {color: tx, fontSize: 10}}, yAxis: {type: "value", minInterval: 1, axisLabel: {color: tx}, splitLine: {lineStyle: {opacity: .25}}},
      series: [1, 2, 3].map(function (n, i) { return {name: NT[n], type: "bar", stack: "n", data: por[i], itemStyle: {color: NC[n]}}; })});
    $("hG2n").textContent = "Avisos emitidos por mes de inicio (desde " + fd(L.reduce(function (m, a) { return !m || a.inicio < m ? a.inicio : m; }, "")) + "); la temporada de lluvias va de noviembre a marzo. Es un registro de pocos meses: no permite hablar de frecuencia histórica.";
    /* ríos más repetidos */
    var cnt = {}, nom = {}; L.forEach(function (a) { a._rios.forEach(function (r) { var k = norm(r); cnt[k] = (cnt[k] || 0) + 1; nom[k] = nom[k] || r; }); });
    var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || (nom[a] < nom[b] ? -1 : 1); }).slice(0, 10).reverse(), e3 = $("hG3");
    if (!top.length) { var c3 = echarts.getInstanceByDom(e3); if (c3) c3.clear(); $("hG3n").textContent = "Sin ríos leídos en los avisos de este lugar."; }
    else { X.chart("hG3", {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}, formatter: function (p) { return esc(p[0].name) + ': <b>' + p[0].value + '</b> aviso' + (p[0].value === 1 ? "" : "s"); }}, grid: {left: 96, right: 20, top: 8, bottom: 22}, xAxis: {type: "value", minInterval: 1, axisLabel: {color: tx}, splitLine: {lineStyle: {opacity: .25}}}, yAxis: {type: "category", data: top.map(function (k) { return nom[k]; }), axisLabel: {color: tx, fontSize: 11}, axisTick: {show: false}},
        series: [{type: "bar", data: top.map(function (k) { return cnt[k]; }), itemStyle: {color: COL, borderRadius: [0, 4, 4, 0]}, label: {show: true, position: "right", color: tx, fontSize: 11}}]}); $("hG3n").textContent = "Número de avisos en que figura cada río (según el texto oficial; los avisos sin PDF legible no cuentan). Los ríos se nombran como en el aviso, a veces por tramo o afluente."; }
    /* caudal por punto y día */
    var e4 = $("hG4"), P = ST.filter(enS).slice().sort(function (a, b) { return (b.ratio_p90_max_10d || 0) - (a.ratio_p90_max_10d || 0); });
    if (!P.length) { var c4 = echarts.getInstanceByDom(e4); if (c4) c4.clear(); $("hG4n").textContent = "Sin puntos del modelo en este lugar."; return; }
    e4.style.height = (70 + P.length * 30) + "px"; var i0 = iHoy(P[0]), dias = P[0].fechas.slice(i0 - 4, i0 + 11), dat4 = [], col4 = ["#cfe8dc", "#f5e6a1", "#f6b26b", "#d7263d"];
    P.forEach(function (p, y) { var j0 = iHoy(p); dias.forEach(function (d, x) { var j = j0 - 4 + x, q = p.caudal_m3s[j], b = p.p90 && p.p90[j]; if (q == null || !b) return; var r = q / b, c = r >= 1.5 ? 3 : r >= 1 ? 2 : r >= .75 ? 1 : 0; dat4.push({value: [x, y, Math.round(r * 100)], itemStyle: {color: col4[c]}, label: {show: true, formatter: Math.round(r * 100), color: c === 3 ? "#fff" : "#10233d", fontSize: 10.5, fontWeight: 700}}); }); });
    X.chart("hG4", {tooltip: {formatter: function (p) { return esc(P[p.value[1]].nombre) + ' · ' + esc(P[p.value[1]].rio) + '<br>' + fd(dias[p.value[0]]) + (dias[p.value[0]] === P[0].hoy ? " (hoy)" : dias[p.value[0]] > P[0].hoy ? " (previsto)" : "") + ': <b>' + p.value[2] + ' % del P90</b>'; }}, grid: {left: 196, right: 8, top: 26, bottom: 4}, xAxis: {type: "category", position: "top", data: dias.map(function (d) { return d === P[0].hoy ? "hoy" : fd(d); }), axisLabel: {color: tx, fontSize: 10, interval: 1}, axisTick: {show: false}}, yAxis: {type: "category", data: P.map(function (p) { return p.nombre + " · " + p.rio.replace(/^R[ií]o /, ""); }), inverse: true, axisLabel: {color: tx, fontSize: 11}, axisTick: {show: false}}, series: [{type: "heatmap", data: dat4, itemStyle: {borderColor: "rgba(0,0,0,.25)", borderWidth: 2, borderRadius: 3}}]});
    var ch4 = echarts.getInstanceByDom(e4); if (ch4) { ch4.resize(); ch4.off("click"); ch4.on("click", function (p) { if (p.value) { SEL = {t: "cq", i: ST.indexOf(P[p.value[1]])}; vista("caudal", true); } }); }
    $("hG4n").textContent = "Caudal diario modelado como porcentaje del umbral alto (P90) de la misma fecha, 4 días atrás y 10 por delante. Verde < 75 %, amarillo 75–100 %, naranja ≥ 100 %, rojo ≥ 150 %. Toque una celda para abrir el punto. GloFAS no es un aviso.";
  }
  function tablas() {
    var L = filtrados();
    $("hTa").innerHTML = L.length ? '<table class="mlist"><tr><th></th><th>N°</th><th>Nivel</th><th>Vigencia</th><th>Departamentos</th><th>Ríos</th><th>Muni.</th></tr>' + L.map(function (a) { return '<tr data-i="' + a._i + '"><td>' + M.ico("ola", 16) + '</td><td>' + esc(a.numero || "—") + '</td><td><b style="color:' + NC[Math.min(3, a._n)] + '">' + NT[Math.min(3, a._n)] + '</b></td><td style="white-space:nowrap">' + vigTxt(a) + '</td><td>' + (esc(a._d.join(", ")) || '<small class="nota">sin detalle</small>') + '</td><td>' + (a._rios.length ? esc(a._rios.slice(0, 6).join(", ")) + (a._rios.length > 6 ? " +" + (a._rios.length - 6) : "") : "—") + '</td><td>' + a._ms.length + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin avisos con este filtro.</p>';
    [].forEach.call($("hTa").querySelectorAll("tr[data-i]"), function (r) { r.onclick = function () { SEL = {t: "av", i: +r.dataset.i}; if (st.v !== "avisos") vista("avisos", true); else selecciona(true); window.scrollTo({top: $("hMap").getBoundingClientRect().top + scrollY - 150, behavior: "smooth"}); }; });
    var P = PR.filter(function (e) { return e.ts >= Date.now() - 30 * DIA && LUGAR.ev(T, LG, e); }).sort(function (a, b) { return b.ts - a.ts; });
    $("hTp").innerHTML = '<p class="nota">Notas de prensa de los últimos 30 días con lugar identificado. La posición es aproximada.</p>' + (P.length ? '<table class="mlist"><tr><th>Fecha</th><th>Titular</th><th>Lugar</th><th>Fuente</th></tr>' + P.map(function (e) { return '<tr><td style="white-space:nowrap">' + esc(new Date(e.ts).toLocaleDateString("es-BO", {day: "2-digit", month: "short"})) + '</td><td>' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.titulo) + '</a>' : esc(e.titulo)) + '</td><td>' + esc(e.lugar || "") + '</td><td>' + esc(e.fuente || "") + '</td></tr>'; }).join("") + '</table>' : '<p class="nota">Sin notas.</p>');
    var h = (T.dh && T.dh.departamentos) || {}, tp = ["Inundación", "Riada", "Aluvión", "Desbordamiento", "Flujo Lodo"], fil = Object.keys(h).sort().filter(function (d) { return !LG.d || d === LG.d; }).map(function (d) { var n = 0, mu = 0, af = 0; tp.forEach(function (t) { var r = h[d][t]; if (r) { n += r[0]; mu += r[1]; af += r[2]; } }); return '<tr><td>' + esc(d) + '</td><td align="right">' + A.fmt(n) + '</td><td align="right">' + A.fmt(mu) + '</td><td align="right">' + A.fmt(af) + '</td></tr>'; });
    $("hTh").innerHTML = '<p class="nota"><b>Limitación:</b> DesInventar (UNDRR) cubre 1970–2015, con subregistro, y no incluye eventos recientes. Suma inundación, riada, aluvión, desbordamiento y flujo de lodo. Solo es contexto.</p><table class="mlist"><tr><th>Departamento</th><th style="text-align:right">Registros</th><th style="text-align:right">Muertos</th><th style="text-align:right">Afectados</th></tr>' + fil.join("") + '</table>';
  }
  function vistaBtn() { [].forEach.call(document.querySelectorAll(".cvw button"), function (b) { b.classList.toggle("on", b.dataset.v === st.v); }); }
  function vista(v, vuela) {
    if (!vuela) SEL = null; st.v = v; vistaBtn(); HMAP.vista(v); if (PN) PN.vista(v); if (v === "lluvia" && FX.estado === "idle") M.pron(pronListo);
    dibuja(); if (vuela) volar(); else if (map && map._ok) LUGAR.ajusta(map, T, LG);
  }
  function dibuja() { ayuda(); controles(); pulso(); refrescaMapa(); detalle(); graficos(); tablas(); avisoPron(); }
  function iniciar() {
    TERR.cargar().then(function (t) {
      T = t; A = TERR.api; D = T.D; A.estilos(); X.header("modulo.html"); document.title = "Hidrológica — Sala de Situación Bolivia"; M.iniciar(T); M.malla(function () { if (map && map._ok) { if (SEL && SEL.t === "mun") selecciona(false); else refrescaMapa(); } }); preparar();
      $("app").innerHTML = html(); if (window.EVI) EVI.panel("eviP", "hidrológica", D);
      LUGAR.init(T, $("lgBox"), LG, function () { SEL = LG.m ? {t: "mun", k: LG.d + "|" + LG.m} : null; if (SEL && st.v !== "avisos") { st.v = "avisos"; vistaBtn(); } dibuja(); LUGAR.ajusta(map, T, LG); if (LG.m && window.CLIMA) CLIMA.irMun(LG.m + " (" + LG.d + ")"); });
      [].forEach.call(document.querySelectorAll(".cvw button"), function (b) { b.onclick = function () { vista(b.dataset.v, false); }; });
      vistaBtn();
      [].forEach.call(document.querySelectorAll(".xtabs button"), function (b) { b.onclick = function () { [].forEach.call(document.querySelectorAll(".xtabs button"), function (z) { z.classList.toggle("on", z === b); $(z.dataset.s).style.display = z === b ? "" : "none"; }); }; });
      HMAP.vista(st.v); pulso(); if (window.CLIMA) CLIMA.iniciar("hidro", cfgMon());
      HMAP.carga(function () {
        map = M.crear({id: "hMap", av: "hAv", tool: "#hTool", bajo: bajo, alto: alto, listo: listo, refInfra: "del municipio", evitar: HMAP.CAPAS_HIT.concat(["pn-c"])});
        PN = M.panelCapas($("hCapas"), GRUPOS, function () { refrescaMapa(); }, {vista: st.v, mapa: function () { return map; }});
      });
      M.pron(pronListo);
    });
  }
  return {iniciar: iniciar, _depura: function () { return {map: map, st: st, SEL: SEL, FX: FX, AV: AV, ST: ST, PR: PR}; }};
})();

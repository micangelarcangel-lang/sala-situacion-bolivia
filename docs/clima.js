/* Monitoreo climático e hidrológico en el tiempo: serie histórica completa (1940–hoy) por lugar.
   Fuente: Open-Meteo (reanálisis ERA5 y modelo GloFAS). Normal de referencia OMM 1991–2020.
   Indicadores estándar: anomalías de temperatura, acumulado de lluvia por temporada, SPI (1/3/6/12), extremos tipo ETCCDI
   (heladas, días muy cálidos, noches frías, racha seca), ráfagas sobre P95 y caudal frente a percentiles.
   Se consulta desde el navegador: no se guarda la serie en el repositorio. */
var CLIMA = (function () {
  var S = SALA, X = S2, DIA = 864e5, R0 = 1991, R1 = 2020, MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var CAPS = [["La Paz", -16.50, -68.15, "La Paz"], ["Santa Cruz de la Sierra", -17.78, -63.18, "Santa Cruz"], ["Cochabamba", -17.39, -66.16, "Cochabamba"], ["Oruro", -17.97, -67.11, "Oruro"], ["Potosí", -19.58, -65.75, "Potosí"], ["Sucre", -19.04, -65.26, "Chuquisaca"], ["Tarija", -21.53, -64.73, "Tarija"], ["Trinidad", -14.83, -64.90, "Beni"], ["Cobija", -11.02, -68.77, "Pando"]];
  var $ = function (i) { return document.getElementById(i); }, E = S.esc;
  var O = {}, ST = {modo: "meteo", lugar: null, n: 90, datos: null, an: null, cache: {}, tok: 0};
  /* ---------- utilidades numéricas ---------- */
  function mean(a) { var s = 0, n = 0; a.forEach(function (v) { if (v != null && !isNaN(v)) { s += v; n++; } }); return n ? s / n : null; }
  function pct(a, p) { if (!a.length) return null; var i = (a.length - 1) * p, f = Math.floor(i), c = Math.ceil(i); return a[f] + (a[c] - a[f]) * (i - f); }
  function f1(v, d) { return v == null || isNaN(v) ? "—" : (+v).toFixed(d == null ? 1 : d).replace(".", ","); }
  function sg(v, d) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d == null ? 1 : d).replace(".", ","); }
  function lg(x) { var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5], y = x, t = x + 5.5; t -= (x + .5) * Math.log(t); var s = 1.000000000190015; for (var j = 0; j < 6; j++) s += c[j] / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function gp(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) { var ap = a, del = 1 / a, sum = del; for (var n = 0; n < 300; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-10) break; } return sum * Math.exp(-x + a * Math.log(x) - lg(a)); }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (var i = 1; i < 300; i++) { var an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; var de = d * c; h *= de; if (Math.abs(de - 1) < 1e-10) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - lg(a)) * h;
  }
  function probit(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - .5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function claseSPI(v) { return v == null ? "sin dato" : v >= 2 ? "extremadamente húmedo" : v >= 1.5 ? "muy húmedo" : v >= 1 ? "moderadamente húmedo" : v > -1 ? "normal" : v > -1.5 ? "moderadamente seco" : v > -2 ? "severamente seco" : "extremadamente seco"; }
  function colSPI(v) { return v == null ? "#9aa7ba" : v <= -2 ? "#c0392b" : v <= -1.5 ? "#e8743b" : v <= -1 ? "#f2b34a" : v < 1 ? "#8aa4c4" : v < 1.5 ? "#5fa8de" : "#2f7fc6"; }
  /* ---------- descarga ---------- */
  function get(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); }
  function hoyLP() { return new Date(Date.now() - 4 * 36e5).toISOString().slice(0, 10); }
  function isoMas(s, d) { return new Date(Date.parse(s + "T12:00:00Z") + d * DIA).toISOString().slice(0, 10); }
  var V5 = "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,et0_fao_evapotranspiration", V3 = "temperature_2m_max,temperature_2m_min,precipitation_sum", KS = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "wind_gusts_10m_max", "et0_fao_evapotranspiration"];
  /* Open-Meteo limita el "peso" de las consultas (≈600 por minuto, 10 000 por día): una serie de 80 años en una sola llamada la rechaza (HTTP 429).
     Por eso se baja por tramos, en dos fases, con presupuesto por minuto, reintentos y caché local (IndexedDB) de los años ya cerrados. */
  var GASTO = [];
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function presupuesto(w) { var now = Date.now(); GASTO = GASTO.filter(function (g) { return now - g[0] < 61000; }); var s = GASTO.reduce(function (a, g) { return a + g[1]; }, 0); if (s + w <= 520) { GASTO.push([now, w]); return Promise.resolve(); } var t = GASTO.length ? 61500 - (now - GASTO[0][0]) : 1000; return esperar(Math.max(1000, t)).then(function () { return presupuesto(w); }); }
  function peso(a, b, nv) { return Math.max(1, Math.ceil((Date.parse(b) - Date.parse(a)) / DIA / 14 * nv / 10)); }
  function getR(u, n) { n = n || 0; return fetch(u).then(function (r) { if (r.status === 429 && n < 3) { if (ST.msg) ST.msg("Open-Meteo pide esperar (límite de consultas); reintentando en " + 20 * (n + 1) + " s…"); return esperar(20000 * (n + 1)).then(function () { return getR(u, n + 1); }); } if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); }
  var _db = null;
  function idb() { if (_db) return _db; return _db = new Promise(function (res) { try { var r = indexedDB.open("sala-clima", 1); r.onupgradeneeded = function () { r.result.createObjectStore("c"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; } catch (e) { res(null); } }); }
  function idbGet(k) { return idb().then(function (db) { return !db ? null : new Promise(function (res) { try { var q = db.transaction("c").objectStore("c").get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } }); }); }
  function idbSet(k, v) { idb().then(function (db) { if (!db) return; try { db.transaction("c", "readwrite").objectStore("c").put(v, k); } catch (e) {} }); }
  function tramo(p, c, nv) {
    var key = p.lat + "," + p.lon + "," + c.id + c.b;
    return (c.cache ? idbGet(key) : Promise.resolve(null)).then(function (h) {
      if (h) return h;
      return presupuesto(peso(c.a, c.b, nv)).then(function () { return getR(c.url); }).then(function (j) { if (c.cache && j && j.daily) idbSet(key, j.daily); return j.daily; });
    });
  }
  function unir(listas, hoy) {
    var M = {}; listas.forEach(function (d, w) { if (!d || !d.time) return; d.time.forEach(function (t, i) { var o = M[t] = M[t] || {}; KS.forEach(function (k, z) { var v = d[k] ? d[k][i] : null; if (v != null) o[z] = v; }); }); });
    var T = Object.keys(M).sort(), out = {d: T, tx: [], tn: [], pr: [], wg: [], et: [], hoy: hoy, fc: []};
    T.forEach(function (t) { var o = M[t]; out.tx.push(o[0] == null ? null : o[0]); out.tn.push(o[1] == null ? null : o[1]); out.pr.push(o[2] == null ? null : o[2]); out.wg.push(o[3] == null ? null : o[3]); out.et.push(o[4] == null ? null : o[4]); out.fc.push(t > hoy); });
    return out;
  }
  function bajarClima(p, cb) {
    var hoy = hoyLP(), Y = +hoy.slice(0, 4), fin = isoMas(hoy, -6), q = "latitude=" + p.lat + "&longitude=" + p.lon + "&timezone=America%2FLa_Paz";
    function C(id, a, b, v, fase, cache) { return {id: id, a: a, b: b, v: v, fase: fase, cache: cache, url: "https://archive-api.open-meteo.com/v1/archive?" + q + "&daily=" + v + "&start_date=" + a + "&end_date=" + b}; }
    var T = [C("a", "1940-01-01", "1969-12-31", V3, 2, 1), C("b", "1970-01-01", "1990-12-31", V3, 2, 1), C("c", "1991-01-01", "2005-12-31", V5, 1, 1), C("d", "2006-01-01", (Y - 1) + "-12-31", V5, 1, 1), C("e", Y + "-01-01", fin, V5, 1, 0)].filter(function (c) { return c.b >= c.a; });
    var fc = get("https://api.open-meteo.com/v1/forecast?" + q + "&daily=" + V5 + "&past_days=14&forecast_days=7").then(function (j) { return j.daily; }).catch(function () { return null; });
    var got = {};
    function fase(n) { return T.filter(function (c) { return c.fase === n; }).reduce(function (pr, c) { return pr.then(function () { if (ST.msg) ST.msg("Descargando " + c.a.slice(0, 4) + "–" + c.b.slice(0, 4) + "…"); return tramo(p, c, c.v === V5 ? 5 : 3).then(function (d) { got[c.id] = d; }); }); }, Promise.resolve()); }
    function armar() { return unir(["a", "b", "c", "d", "e"].map(function (k) { return got[k]; }).concat([got.fc]), hoy); }
    return fase(1).then(function () { return fc; }).then(function (f) { got.fc = f; cb(armar(), false); return fase(2).then(function () { cb(armar(), true); }, function (e) { if (ST.msg) ST.msg("No se pudo bajar 1940–1990 (" + e.message + "); se muestran los datos desde 1991."); cb(armar(), true); }); });
  }
  function bajarCaudal(p) {
    var hoy = hoyLP(), Y = +hoy.slice(0, 4), q = "latitude=" + p.lat + "&longitude=" + p.lon + "&daily=river_discharge&timezone=America%2FLa_Paz";
    var a = {id: "q", a: "1984-01-01", b: (Y - 1) + "-12-31", cache: 1, url: "https://flood-api.open-meteo.com/v1/flood?" + q + "&start_date=1984-01-01&end_date=" + (Y - 1) + "-12-31"}, b = {id: "q", a: Y + "-01-01", b: isoMas(hoy, 7), cache: 0, url: "https://flood-api.open-meteo.com/v1/flood?" + q + "&start_date=" + Y + "-01-01&end_date=" + isoMas(hoy, 7)};
    return tramo(p, a, 1).then(function (d1) { return tramo(p, b, 1).then(function (d2) { var T = (d1.time || []).concat(d2.time || []), Qv = (d1.river_discharge || []).concat(d2.river_discharge || []); return {d: T, q: Qv, hoy: hoy}; }); });
  }

  /* ---------- análisis ---------- */
  function fecha(s) { return {y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, dd: +s.slice(8, 10)}; }
  function doyDe(y, m, d) { return Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / DIA); }
  function clim(v, yr, doy, w) {
    var by = [], d, k, i, M = [], lo = [], hi = []; for (d = 0; d < 366; d++) by[d] = [];
    for (i = 0; i < v.length; i++) if (yr[i] >= R0 && yr[i] <= R1 && v[i] != null) by[doy[i]].push(v[i]);
    for (d = 0; d < 366; d++) { var pool = []; for (k = -w; k <= w; k++) pool = pool.concat(by[(d + k + 366) % 366]); pool.sort(function (a, b) { return a - b; }); M[d] = mean(pool); lo[d] = pct(pool, .1); hi[d] = pct(pool, .9); }
    return {m: M, lo: lo, hi: hi};
  }
  function analizar(raw) {
    var n = raw.d.length, yr = [], mo = [], doy = [], idx = {}, yIni = {}, tm = [], i;
    for (i = 0; i < n; i++) { var f = fecha(raw.d[i]); yr[i] = f.y; mo[i] = f.m; doy[i] = doyDe(f.y, f.m, f.dd); idx[raw.d[i]] = i; if (yIni[f.y] == null) yIni[f.y] = i; tm[i] = raw.tx[i] != null && raw.tn[i] != null ? (raw.tx[i] + raw.tn[i]) / 2 : null; }
    var iObs = n - 1; while (iObs > 0 && (raw.fc[iObs] || raw.tx[iObs] == null)) iObs--;
    var A = {raw: raw, n: n, yr: yr, mo: mo, doy: doy, idx: idx, yIni: yIni, tm: tm, iObs: iObs, cur: yr[iObs]};
    A.nTx = clim(raw.tx, yr, doy, 7); A.nTn = clim(raw.tn, yr, doy, 7); A.nTm = clim(tm, yr, doy, 7);
    /* anual: anomalía, extremos */
    var Y = {};
    for (i = 0; i <= iObs; i++) {
      var y = yr[i], o = Y[y] = Y[y] || {n: 0, an: 0, na: 0, fd: 0, hot: 0, cold: 0, cdd: 0, run: 0, pr: 0};
      o.n++; if (tm[i] != null) { o.an += tm[i] - A.nTm.m[doy[i]]; o.na++; }
      if (raw.tn[i] != null && raw.tn[i] < 0) o.fd++;
      if (raw.tx[i] != null && raw.tx[i] > A.nTx.hi[doy[i]]) o.hot++;
      if (raw.tn[i] != null && raw.tn[i] < A.nTn.lo[doy[i]]) o.cold++;
      if (raw.pr[i] != null) { o.pr += raw.pr[i]; if (raw.pr[i] < 1) { o.run++; if (o.run > o.cdd) o.cdd = o.run; } else o.run = 0; }
    }
    A.Y = Y; A.anios = Object.keys(Y).map(Number).sort();
    var cx = [], cy = []; A.anios.forEach(function (y) { if (Y[y].n >= 360 && Y[y].na >= 340) { cx.push(y); cy.push(Y[y].an / Y[y].na); } });
    if (cx.length > 10) { var mx = mean(cx), my = mean(cy), sxy = 0, sxx = 0; cx.forEach(function (x, k) { sxy += (x - mx) * (cy[k] - my); sxx += (x - mx) * (x - mx); }); A.tend = {b: sxy / sxx, a: my - sxy / sxx * mx, y0: cx[0], y1: cx[cx.length - 1]}; }
    /* mensual */
    var Mt = {}, Pm = {}, Pc = {};
    for (i = 0; i <= iObs; i++) { var k = yr[i] + "-" + mo[i]; if (tm[i] != null) (Mt[k] = Mt[k] || []).push(tm[i]); if (raw.pr[i] != null) { Pm[k] = (Pm[k] || 0) + raw.pr[i]; Pc[k] = (Pc[k] || 0) + 1; } }
    A.Mt = Mt; A.Pm = Pm; A.Pc = Pc;
    /* SPI: sumas mensuales completas */
    var y0 = A.anios[0], nm = (A.cur - y0 + 1) * 12, mon = [], mi;
    for (mi = 0; mi < nm; mi++) { var yy = y0 + Math.floor(mi / 12), mm = mi % 12, dm = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate(), kk = yy + "-" + mm; mon[mi] = (Pc[kk] === dm) ? Pm[kk] : null; }
    A.mon = mon; A.y0 = y0; A.spi = {};
    [1, 3, 6, 12].forEach(function (kz) {
      var Sk = mon.map(function (v, m) { if (m < kz - 1) return null; var s = 0; for (var j = 0; j < kz; j++) { var x = mon[m - j]; if (x == null) return null; s += x; } return s; }), out = [];
      for (var mo2 = 0; mo2 < 12; mo2++) {
        var ref = [], pos = [], zeros = 0, cnt = 0, m;
        for (m = mo2; m < nm; m += 12) { var yy2 = y0 + Math.floor(m / 12); if (yy2 >= R0 && yy2 <= R1 && Sk[m] != null) { cnt++; if (Sk[m] > 0) pos.push(Sk[m]); else zeros++; } }
        var q = cnt ? zeros / cnt : 0, al = null, be = null;
        if (pos.length >= 8) { var mn = mean(pos), A2 = Math.log(mn) - mean(pos.map(Math.log)); if (A2 > 0) { al = (1 + Math.sqrt(1 + 4 * A2 / 3)) / (4 * A2); be = mn / al; } }
        for (m = mo2; m < nm; m += 12) { var x = Sk[m]; if (x == null || al == null) { out[m] = null; continue; } var H = x <= 0 ? q : q + (1 - q) * gp(al, x / be); H = Math.min(.9995, Math.max(.0005, H)); out[m] = probit(H); }
      }
      A.spi[kz] = out;
    });
    /* temporada hidrológica (1 sep – 31 ago) */
    var curS = A.mo[iObs] >= 8 ? A.cur : A.cur - 1, acc = {};
    for (var s = y0; s <= curS; s++) {
      var st = idx[s + "-09-01"]; if (st == null) continue; var c = 0, arr = []; for (var k2 = 0; k2 < 366; k2++) { var j = st + k2; if (j > iObs || j >= n) break; if (raw.pr[j] != null) c += raw.pr[j]; arr.push(c); }
      acc[s] = arr;
    }
    A.curS = curS; A.acc = acc; A.kObs = acc[curS] ? acc[curS].length - 1 : 0;
    A.accN = {m: [], lo: [], hi: []};
    for (var k3 = 0; k3 < 365; k3++) { var vs = []; for (var s2 = R0; s2 <= R1 - 1; s2++) if (acc[s2] && acc[s2][k3] != null) vs.push(acc[s2][k3]); vs.sort(function (a, b) { return a - b; }); A.accN.m[k3] = mean(vs); A.accN.lo[k3] = pct(vs, .1); A.accN.hi[k3] = pct(vs, .9); }
    /* ráfagas P95 (referencia) */
    var wr = []; for (i = 0; i <= iObs; i++) if (yr[i] >= R0 && yr[i] <= R1 && raw.wg[i] != null) wr.push(raw.wg[i]); wr.sort(function (a, b) { return a - b; }); A.wg95 = pct(wr, .95);
    /* lluvia 30 días frente a lo normal */
    var i0 = Math.max(0, iObs - 29), d0 = doy[i0], d1 = doy[iObs], tot = [];
    for (var y3 = R0; y3 <= R1; y3++) { var s3 = 0, ok = 0; for (var k4 = 0; k4 < 30; k4++) { var dk = d0 + k4, yy3 = y3; if (dk > 365) dk -= 366; else if (d0 > d1) yy3 = y3 - 1; if (d0 > d1 && dk < d0 && dk <= d1) yy3 = y3; var jj = yIni[yy3] != null ? yIni[yy3] + dk : null; if (jj != null && raw.pr[jj] != null) { s3 += raw.pr[jj]; ok++; } } if (ok > 25) tot.push(s3); }
    A.pr30n = mean(tot);
    return A;
  }
  /* ---------- estadísticas del momento ---------- */
  function actuales(A) {
    var r = A.raw, iO = A.iObs, a = {}, w7 = [], w30 = [];
    for (var i = Math.max(0, iO - 6); i <= iO; i++) w7.push(i); for (i = Math.max(0, iO - 29); i <= iO; i++) w30.push(i);
    a.dTx = mean(w7.map(function (i) { return r.tx[i] == null ? null : r.tx[i] - A.nTx.m[A.doy[i]]; }));
    a.dTn = mean(w7.map(function (i) { return r.tn[i] == null ? null : r.tn[i] - A.nTn.m[A.doy[i]]; }));
    a.tx7 = mean(w7.map(function (i) { return r.tx[i]; })); a.tn7 = mean(w7.map(function (i) { return r.tn[i]; }));
    a.pr30 = w30.reduce(function (s, i) { return s + (r.pr[i] || 0); }, 0); a.pr30p = A.pr30n ? 100 * a.pr30 / A.pr30n : null;
    a.fd30 = w30.filter(function (i) { return r.tn[i] != null && r.tn[i] < 0; }).length;
    a.wg30 = Math.max.apply(null, w30.map(function (i) { return r.wg[i] == null ? 0 : r.wg[i]; })); a.wgN = w30.filter(function (i) { return r.wg[i] != null && r.wg[i] > A.wg95; }).length;
    var rs = 0; for (i = iO; i >= 0 && r.pr[i] != null && r.pr[i] < 1; i--) rs++; a.racha = rs;
    var mi = (A.cur - A.y0) * 12 + A.mo[iO] - 1; if (mi < 0) mi = 0; var mm = ((A.mo[iO] + 11) % 12); a.spiMes = MES[mm] + " " + (A.mo[iO] === 0 ? A.cur - 1 : A.cur);
    a.spi = {}; [1, 3, 6, 12].forEach(function (k) { a.spi[k] = A.spi[k][mi]; });
    var kO = A.kObs, ac = A.acc[A.curS] || [], ap = A.acc[A.curS - 1] || []; a.temp = {mm: ac[kO], prev: ap[kO], norm: A.accN.m[kO]};
    return a;
  }
  /* ---------- gráficas ---------- */
  var COL = {tx: "#e4572e", tn: "#3a86d8", pr: "#2a9df4", prev: "#f2a33a", nor: "#8c99ad", banda: "#8c99ad"};
  function rango(A, n, conPron) { var a = Math.max(0, A.iObs - n + 1), b = conPron ? Math.min(A.n - 1, A.iObs + 7) : A.iObs, L = []; for (var i = a; i <= b; i++) L.push(i); return L; }
  function lab(A, i) { var s = A.raw.d[i]; return s.slice(8, 10) + "/" + s.slice(5, 7); }
  function banda(lo, hi, c) { return [{type: "line", data: lo, stack: "b" + c, symbol: "none", lineStyle: {opacity: 0}, silent: true, tooltip: {show: false}, z: 1}, {type: "line", data: hi.map(function (v, k) { return v == null || lo[k] == null ? null : v - lo[k]; }), stack: "b" + c, symbol: "none", lineStyle: {opacity: 0}, areaStyle: {color: c, opacity: .16}, silent: true, tooltip: {show: false}, z: 1}]; }
  function sombraPron(A, L) { var k = L.findIndex(function (i) { return A.raw.fc[i]; }); return k < 0 ? [] : [{name: "pronóstico", type: "line", data: [], markArea: {silent: true, itemStyle: {color: "rgba(140,153,173,.13)"}, label: {show: true, position: "insideTop", color: "#8c99ad", formatter: "pronóstico", fontSize: 11}, data: [[{xAxis: k}, {xAxis: L.length - 1}]]}}]; }
  var CH = {
    temp: {t: "Temperatura diaria y rango normal", c: function (A) { return "Máxima y mínima de los últimos " + ST.n + " días y 7 de pronóstico. Banda = rango normal (percentiles 10–90, " + R0 + "–" + R1 + ")."; }, f: function (A, id) {
      var L = rango(A, ST.n, true), r = A.raw;
      X.chart(id, {tooltip: {trigger: "axis", formatter: function (p) { var i = L[p[0].dataIndex]; return "<b>" + lab(A, i) + (r.fc[i] ? " (pronóstico)" : "") + "</b><br>Máx. " + f1(r.tx[i]) + " °C (normal " + f1(A.nTx.m[A.doy[i]]) + ")<br>Mín. " + f1(r.tn[i]) + " °C (normal " + f1(A.nTn.m[A.doy[i]]) + ")"; }}, legend: {top: 0, data: ["Máxima", "Mínima", "Normal máx.", "Normal mín."]}, grid: {left: 42, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: L.map(function (i) { return lab(A, i); }), boundaryGap: false}, yAxis: {type: "value", scale: true, name: "°C"},
        series: banda(L.map(function (i) { return A.nTx.lo[A.doy[i]]; }), L.map(function (i) { return A.nTx.hi[A.doy[i]]; }), "#e4572e").concat(banda(L.map(function (i) { return A.nTn.lo[A.doy[i]]; }), L.map(function (i) { return A.nTn.hi[A.doy[i]]; }), "#3a86d8")).concat([
          {name: "Normal máx.", type: "line", data: L.map(function (i) { return A.nTx.m[A.doy[i]]; }), symbol: "none", lineStyle: {color: COL.tx, type: "dashed", width: 1, opacity: .7}}, {name: "Normal mín.", type: "line", data: L.map(function (i) { return A.nTn.m[A.doy[i]]; }), symbol: "none", lineStyle: {color: COL.tn, type: "dashed", width: 1, opacity: .7}},
          {name: "Máxima", type: "line", data: L.map(function (i) { return r.tx[i]; }), symbol: "none", lineStyle: {color: COL.tx, width: 2}, itemStyle: {color: COL.tx}}, {name: "Mínima", type: "line", data: L.map(function (i) { return r.tn[i]; }), symbol: "none", lineStyle: {color: COL.tn, width: 2}, itemStyle: {color: COL.tn}}]).concat(sombraPron(A, L))});
    }},
    anom: {t: "Anomalía de temperatura", c: function () { return "Diferencia de la temperatura media diaria con su normal (" + R0 + "–" + R1 + "). Rojo = más cálido que lo normal; azul = más frío. Línea = media de 7 días."; }, f: function (A, id) {
      var L = rango(A, ST.n, false), an = L.map(function (i) { return A.tm[i] == null ? null : A.tm[i] - A.nTm.m[A.doy[i]]; }), mv = an.map(function (v, k) { var s = an.slice(Math.max(0, k - 6), k + 1); return mean(s); });
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (v) { return sg(v) + " °C"; }}, legend: {top: 0}, grid: {left: 42, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: L.map(function (i) { return lab(A, i); })}, yAxis: {type: "value", name: "°C"}, series: [{name: "Anomalía diaria", type: "bar", data: an.map(function (v) { return {value: v == null ? null : +v.toFixed(2), itemStyle: {color: v >= 0 ? "#e4572e" : "#3a86d8"}}; })}, {name: "Media 7 días", type: "line", data: mv.map(function (v) { return v == null ? null : +v.toFixed(2); }), symbol: "none", lineStyle: {color: "#222", width: 2}, itemStyle: {color: "#8c99ad"}}]});
    }},
    tmes: {t: "Temperatura mensual: este año, el anterior y lo normal", c: function (A) { return "Media mensual de la temperatura. Compara " + A.cur + ", " + (A.cur - 1) + " y la normal " + R0 + "–" + R1 + "."; }, f: function (A, id) {
      function mm(y) { return MES.map(function (_, m) { var v = A.Mt[y + "-" + m]; return v && v.length >= 15 ? +mean(v).toFixed(2) : null; }); }
      var nor = MES.map(function (_, m) { var s = []; for (var y = R0; y <= R1; y++) { var v = A.Mt[y + "-" + m]; if (v && v.length >= 15) s.push(mean(v)); } return +mean(s).toFixed(2); });
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (v) { return f1(v) + " °C"; }}, legend: {top: 0}, grid: {left: 42, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: MES}, yAxis: {type: "value", scale: true, name: "°C"}, series: [{name: "Normal " + R0 + "–" + R1, type: "line", data: nor, symbol: "none", lineStyle: {color: COL.nor, type: "dashed", width: 2}, itemStyle: {color: COL.nor}}, {name: String(A.cur - 1), type: "line", data: mm(A.cur - 1), symbolSize: 5, lineStyle: {color: COL.prev, width: 2}, itemStyle: {color: COL.prev}}, {name: String(A.cur), type: "line", data: mm(A.cur), symbolSize: 7, lineStyle: {color: COL.tx, width: 3}, itemStyle: {color: COL.tx}}]});
    }},
    plluv: {t: "Lluvia diaria", c: function () { return "Precipitación de cada día (mm), últimos " + ST.n + " días y pronóstico. Naranja = día con ≥ 20 mm (lluvia intensa)."; }, f: function (A, id) {
      var L = rango(A, ST.n, true), r = A.raw;
      X.chart(id, {legend: {show: false}, tooltip: {trigger: "axis", valueFormatter: function (v) { return f1(v) + " mm"; }}, grid: {left: 42, right: 14, top: 14, bottom: 28}, xAxis: {type: "category", data: L.map(function (i) { return lab(A, i); })}, yAxis: {type: "value", name: "mm", min: 0}, series: [{name: "Lluvia", type: "bar", data: L.map(function (i) { var v = r.pr[i]; return {value: v, itemStyle: {color: r.fc[i] ? "#9ec9ee" : v >= 20 ? "#f26a1b" : COL.pr}}; })}].concat(sombraPron(A, L))});
    }},
    pacum: {t: "Lluvia acumulada de la temporada", c: function (A) { return "Desde el 1 de septiembre (inicio de la temporada de lluvias) hasta hoy: temporada " + A.curS + "/" + (A.curS + 1) + " frente a la anterior y a la normal (banda = percentiles 10–90)."; }, f: function (A, id) {
      var k0 = doyDe(2001, 8, 1), X2 = []; for (var k = 0; k < 365; k++) { var d = new Date(Date.UTC(2001, 8, 1) + k * DIA); X2.push(("0" + d.getUTCDate()).slice(-2) + " " + MES[d.getUTCMonth()]); }
      var cur = A.acc[A.curS] || [], prev = A.acc[A.curS - 1] || [];
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (v) { return f1(v, 0) + " mm"; }, formatter: function (p) { var k = p[0].dataIndex, h = "<b>" + X2[k] + "</b>"; [["Temporada actual", cur[k]], ["Temporada anterior", prev[k]], ["Normal", A.accN.m[k]], ["P10", A.accN.lo[k]], ["P90", A.accN.hi[k]]].forEach(function (z) { if (z[1] != null) h += "<br>" + z[0] + ": " + f1(z[1], 0) + " mm"; }); return h; }}, legend: {top: 0, data: ["Temporada actual", "Temporada anterior", "Normal"]}, grid: {left: 48, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: X2, boundaryGap: false, axisLabel: {interval: 0, formatter: function (v) { return v.slice(0, 2) === "01" ? v.slice(3) : ""; }}}, yAxis: {type: "value", name: "mm", min: 0},
        series: banda(A.accN.lo, A.accN.hi, "#2a9df4").concat([{name: "Normal", type: "line", data: A.accN.m.map(function (v) { return v == null ? null : +v.toFixed(1); }), symbol: "none", lineStyle: {color: COL.nor, type: "dashed", width: 2}, itemStyle: {color: COL.nor}}, {name: "Temporada anterior", type: "line", data: prev, symbol: "none", lineStyle: {color: COL.prev, width: 2}, itemStyle: {color: COL.prev}}, {name: "Temporada actual", type: "line", data: cur, symbol: "none", lineStyle: {color: "#1d6fb8", width: 3.5}, itemStyle: {color: "#1d6fb8"}, areaStyle: {color: "#1d6fb8", opacity: .1}}])});
    }},
    pmes: {t: "Lluvia mensual: este año, el anterior y lo normal", c: function (A) { return "Total de lluvia por mes (mm). Un mes con barra muy por debajo de la normal indica déficit."; }, f: function (A, id) {
      function mm(y) { return MES.map(function (_, m) { var k = y + "-" + m, v = A.Pm[k]; return v != null && A.Pc[k] >= 25 || (v != null && y === A.cur && m === A.mo[A.iObs]) ? +v.toFixed(1) : null; }); }
      var nor = MES.map(function (_, m) { var s = []; for (var y = R0; y <= R1; y++) { var v = A.Pm[y + "-" + m]; if (v != null) s.push(v); } return +mean(s).toFixed(1); });
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (v) { return f1(v) + " mm"; }}, legend: {top: 0}, grid: {left: 42, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: MES}, yAxis: {type: "value", name: "mm", min: 0}, series: [{name: "Normal " + R0 + "–" + R1, type: "bar", data: nor, itemStyle: {color: COL.nor, opacity: .55}}, {name: String(A.cur - 1), type: "bar", data: mm(A.cur - 1), itemStyle: {color: COL.prev}}, {name: String(A.cur), type: "bar", data: mm(A.cur), itemStyle: {color: "#1d6fb8"}}]});
    }},
    viento: {t: "Ráfagas máximas diarias", c: function (A) { return "Ráfaga más fuerte de cada día (km/h). La línea es el percentil 95 histórico (" + f1(A.wg95, 0) + " km/h): por encima, el viento es excepcional para este lugar."; }, f: function (A, id) {
      var L = rango(A, ST.n, true), r = A.raw;
      X.chart(id, {legend: {show: false}, tooltip: {trigger: "axis", valueFormatter: function (v) { return f1(v, 0) + " km/h"; }}, grid: {left: 42, right: 14, top: 14, bottom: 28}, xAxis: {type: "category", data: L.map(function (i) { return lab(A, i); })}, yAxis: {type: "value", name: "km/h", min: 0}, series: [{name: "Ráfaga", type: "bar", data: L.map(function (i) { var v = r.wg[i]; return {value: v, itemStyle: {color: v != null && v > A.wg95 ? "#d7263d" : r.fc[i] ? "#b9c2f0" : "#5c6bc0"}}; }), markLine: {silent: true, symbol: "none", lineStyle: {color: "#d7263d", type: "dashed"}, label: {formatter: "P95", position: "insideEndTop"}, data: [{yAxis: A.wg95}]}}].concat(sombraPron(A, L))});
    }},
    anual: {t: "Anomalía anual de temperatura desde 1940", c: function (A) { return "Cada barra es un año frente a la normal " + R0 + "–" + R1 + " (tendencia: " + (A.tend ? sg(A.tend.b * 10, 2) + " °C por década" : "—") + "). Línea negra = media móvil de 10 años."; }, f: function (A, id) {
      var ys = A.anios.filter(function (y) { return A.Y[y].na >= 200; }), v = ys.map(function (y) { return +(A.Y[y].an / A.Y[y].na).toFixed(2); }), mv = v.map(function (_, k) { return k < 9 ? null : +mean(v.slice(k - 9, k + 1)).toFixed(2); });
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (x) { return sg(x, 2) + " °C"; }}, legend: {top: 0, data: ["Anomalía anual", "Media móvil 10 años", "Tendencia lineal"]}, grid: {left: 42, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: ys.map(String), axisLabel: {interval: 9}}, yAxis: {type: "value", name: "°C"}, dataZoom: [{type: "inside"}],
        series: [{name: "Anomalía anual", type: "bar", data: v.map(function (x) { return {value: x, itemStyle: {color: x >= 0 ? "#e4572e" : "#3a86d8"}}; })}, {name: "Media móvil 10 años", type: "line", data: mv, symbol: "none", lineStyle: {color: "#222", width: 2}, itemStyle: {color: "#8c99ad"}}, {name: "Tendencia lineal", type: "line", data: A.tend ? ys.map(function (y) { return +(A.tend.a + A.tend.b * y).toFixed(2); }) : [], symbol: "none", lineStyle: {color: "#9b59b6", type: "dashed", width: 2}, itemStyle: {color: "#9b59b6"}}]});
    }},
    extremos: {t: "Extremos de temperatura por año", c: function (A) { return "Días al año con helada (mínima < 0 °C), días muy cálidos (máxima sobre el P90 normal) y noches muy frías (mínima bajo el P10). El último año está incompleto."; }, f: function (A, id) {
      var ys = A.anios.filter(function (y) { return A.Y[y].n >= 200; }), hay = ys.some(function (y) { return A.Y[y].fd > 0; });
      var ser = [{name: "Días muy cálidos (> P90)", type: "line", data: ys.map(function (y) { return A.Y[y].hot; }), symbol: "none", lineStyle: {color: "#e4572e", width: 2}, itemStyle: {color: "#e4572e"}}, {name: "Noches muy frías (< P10)", type: "line", data: ys.map(function (y) { return A.Y[y].cold; }), symbol: "none", lineStyle: {color: "#3a86d8", width: 2}, itemStyle: {color: "#3a86d8"}}];
      if (hay) ser.unshift({name: "Días con helada", type: "bar", data: ys.map(function (y) { return A.Y[y].fd; }), itemStyle: {color: "#8fb8e8", opacity: .75}});
      X.chart(id, {tooltip: {trigger: "axis"}, legend: {top: 0}, grid: {left: 42, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: ys.map(String), axisLabel: {interval: 9}}, yAxis: {type: "value", name: "días"}, dataZoom: [{type: "inside"}], series: ser});
    }},
    spi: {t: "Índice de sequía SPI por escala", c: function (A) { return "SPI estándar OMM (ajuste gamma, base " + R0 + "–" + R1 + "). Negativo = déficit de lluvia; ≤ −1 sequía moderada; ≤ −2 extrema. Último mes completo: " + actuales(A).spiMes + "."; }, f: function (A, id) {
      var a = actuales(A), ks = [1, 3, 6, 12];
      X.chart(id, {tooltip: {trigger: "axis", axisPointer: {type: "shadow"}, formatter: function (p) { var v = a.spi[ks[p[0].dataIndex]]; return "<b>SPI-" + ks[p[0].dataIndex] + "</b>: " + sg(v, 2) + "<br>" + claseSPI(v); }}, grid: {left: 52, right: 20, top: 14, bottom: 28}, xAxis: {type: "category", data: ks.map(function (k) { return "SPI-" + k; })}, yAxis: {type: "value", min: -3, max: 3, name: "SPI"}, series: [{type: "bar", barWidth: "46%", data: ks.map(function (k) { var v = a.spi[k]; return {value: v == null ? null : +v.toFixed(2), itemStyle: {color: colSPI(v)}}; }), label: {show: true, position: "top", formatter: function (p) { return p.value == null ? "s/d" : sg(p.value, 2); }}, markLine: {silent: true, symbol: "none", data: [{yAxis: -1}, {yAxis: -2}], lineStyle: {color: "#c0392b", type: "dashed", opacity: .6}, label: {formatter: "{c}"}}}]});
    }},
    spih: {t: "Historia del SPI-3 y SPI-12", c: function () { return "Sequías y períodos húmedos desde 1941. SPI-3 = lluvia de 3 meses (agricultura); SPI-12 = año hidrológico (agua y embalses). Acerque con la rueda del ratón."; }, f: function (A, id) {
      var nm = A.mon.length, X2 = [], s3 = [], s12 = []; for (var m = 0; m < nm; m++) { var y = A.y0 + Math.floor(m / 12); X2.push(y + "-" + ("0" + (m % 12 + 1)).slice(-2)); s3.push(A.spi[3][m] == null ? null : +A.spi[3][m].toFixed(2)); s12.push(A.spi[12][m] == null ? null : +A.spi[12][m].toFixed(2)); }
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (v) { return sg(v, 2); }}, legend: {top: 0}, grid: {left: 42, right: 14, top: 34, bottom: 36}, xAxis: {type: "category", data: X2, axisLabel: {interval: 119, formatter: function (v) { return v.slice(0, 4); }}}, yAxis: {type: "value", min: -3, max: 3, name: "SPI"}, dataZoom: [{type: "inside", start: Math.max(0, 100 - 100 * 180 / nm), end: 100}],
        series: [{name: "SPI-3", type: "bar", data: s3.map(function (v) { return {value: v, itemStyle: {color: colSPI(v)}}; }), barCategoryGap: "0%"}, {name: "SPI-12", type: "line", data: s12, symbol: "none", lineStyle: {color: "#222", width: 2}, itemStyle: {color: "#8c99ad"}, markLine: {silent: true, symbol: "none", data: [{yAxis: -1}], lineStyle: {color: "#c0392b", type: "dashed"}, label: {show: false}}}]});
    }},
    racha: {t: "Racha seca máxima por año", c: function (A) { var a = actuales(A); return "Mayor número de días seguidos con menos de 1 mm de lluvia en cada año (indicador CDD). Racha seca actual: " + a.racha + " días."; }, f: function (A, id) {
      var ys = A.anios.filter(function (y) { return A.Y[y].n >= 200; });
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (v) { return v + " días"; }}, grid: {left: 42, right: 14, top: 14, bottom: 28}, xAxis: {type: "category", data: ys.map(String), axisLabel: {interval: 9}}, yAxis: {type: "value", name: "días"}, dataZoom: [{type: "inside"}], series: [{type: "bar", data: ys.map(function (y) { return A.Y[y].cdd; }), itemStyle: {color: "#c98a3b"}, markLine: {silent: true, symbol: "none", lineStyle: {color: "#8c99ad", type: "dashed"}, label: {formatter: "media"}, data: [{yAxis: mean(ys.map(function (y) { return A.Y[y].cdd; }))}]}}]});
    }},
    balance: {t: "Balance hídrico: lluvia menos evapotranspiración", c: function () { return "Acumulado de (lluvia − ET₀) en los últimos " + ST.n + " días y en el mismo tramo del año pasado. Hacia abajo = el suelo pierde más agua de la que recibe."; }, f: function (A, id) {
      var L = rango(A, ST.n, false), r = A.raw, off = 365;
      function ac(idx) { var c = 0; return idx.map(function (i) { if (i < 0 || r.pr[i] == null || r.et[i] == null) return null; c += r.pr[i] - r.et[i]; return +c.toFixed(1); }); }
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (v) { return f1(v, 0) + " mm"; }}, legend: {top: 0}, grid: {left: 48, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: L.map(function (i) { return lab(A, i); })}, yAxis: {type: "value", name: "mm"}, series: [{name: "Año pasado", type: "line", data: ac(L.map(function (i) { return i - off; })), symbol: "none", lineStyle: {color: COL.prev, width: 2}, itemStyle: {color: COL.prev}}, {name: "Actual", type: "line", data: ac(L), symbol: "none", lineStyle: {color: "#1d6fb8", width: 3}, itemStyle: {color: "#1d6fb8"}, areaStyle: {color: "#1d6fb8", opacity: .1}}]});
    }}
  };
  /* ---------- hidrología: caudal (GloFAS) ---------- */
  function analizarQ(q) {
    var n = q.d.length, yr = [], doy = [], iObs = n - 1, i; for (i = 0; i < n; i++) { var f = fecha(q.d[i]); yr[i] = f.y; doy[i] = doyDe(f.y, f.m, f.dd); }
    while (iObs > 0 && (q.d[iObs] > q.hoy || q.q[iObs] == null)) iObs--;
    var N = clim(q.q, yr, doy, 7), pk = {}, ref = [], by = []; for (i = 0; i < 366; i++) by[i] = [];
    for (i = 0; i <= iObs; i++) { if (q.q[i] == null) continue; if (pk[yr[i]] == null || q.q[i] > pk[yr[i]].v) pk[yr[i]] = {v: q.q[i], d: q.d[i]}; if (yr[i] >= R0 && yr[i] <= R1) ref.push(q.q[i]); if (yr[i] >= R0 && yr[i] <= R1) by[doy[i]].push(q.q[i]); }
    ref.sort(function (a, b) { return a - b; });
    var pool = []; for (var k = -7; k <= 7; k++) pool = pool.concat(by[(doy[iObs] + k + 366) % 366]); var hoy = q.q[iObs], rank = pool.length ? pool.filter(function (v) { return v <= hoy; }).length / pool.length * 100 : null;
    var m10 = Math.max.apply(null, q.q.slice(Math.max(0, iObs - 9), iObs + 1).map(function (v) { return v == null ? 0 : v; }));
    return {q: q, n: n, yr: yr, doy: doy, iObs: iObs, N: N, pk: pk, ref: ref, hoy: hoy, rank: rank, m10: m10, p90: pct(ref, .9)};
  }
  function labQ(Q, i) { var s = Q.q.d[i]; return s.slice(8, 10) + "/" + s.slice(5, 7); }
  var CQ = {
    q1: {t: "Caudal diario frente a lo normal", c: function () { return "Caudal del río (m³/s) en los últimos " + Math.max(ST.n, 180) + " días y 7 de pronóstico, contra el año pasado y la banda normal (percentiles 10–90 de " + R0 + "–" + R1 + ")."; }, f: function (A, id) {
      var Q = ST.q, N = Math.max(ST.n, 180), a = Math.max(0, Q.iObs - N + 1), b = Math.min(Q.n - 1, Q.iObs + 7), L = []; for (var i = a; i <= b; i++) L.push(i);
      X.chart(id, {tooltip: {trigger: "axis", valueFormatter: function (v) { return f1(v, 0) + " m³/s"; }}, legend: {top: 0, data: ["Caudal", "Año pasado", "Mediana normal"]}, grid: {left: 52, right: 14, top: 34, bottom: 28}, xAxis: {type: "category", data: L.map(function (i) { return labQ(Q, i); }), boundaryGap: false}, yAxis: {type: "value", name: "m³/s", min: 0},
        series: banda(L.map(function (i) { return Q.N.lo[Q.doy[i]]; }), L.map(function (i) { return Q.N.hi[Q.doy[i]]; }), "#1d6fb8").concat([{name: "Mediana normal", type: "line", data: L.map(function (i) { return Q.N.m[Q.doy[i]]; }), symbol: "none", lineStyle: {color: COL.nor, type: "dashed", width: 2}, itemStyle: {color: COL.nor}}, {name: "Año pasado", type: "line", data: L.map(function (i) { var j = i - 365; return j >= 0 ? Q.q.q[j] : null; }), symbol: "none", lineStyle: {color: COL.prev, width: 2}, itemStyle: {color: COL.prev}}, {name: "Caudal", type: "line", data: L.map(function (i) { return Q.q.q[i]; }), symbol: "none", lineStyle: {color: "#1d6fb8", width: 3}, itemStyle: {color: "#1d6fb8"}}, {name: "pron", type: "line", data: [], markArea: {silent: true, itemStyle: {color: "rgba(140,153,173,.13)"}, label: {show: true, position: "insideTop", color: "#8c99ad", formatter: "pronóstico", fontSize: 11}, data: [[{xAxis: Q.iObs - a + 1}, {xAxis: L.length - 1}]]}}])});
    }},
    q2: {t: "Crecida máxima de cada año (1984–hoy)", c: function () { return "Caudal diario más alto de cada año: la serie base para saber qué tan grande es una crecida. Línea = umbral P90 de todos los días."; }, f: function (A, id) {
      var Q = ST.q, ys = Object.keys(Q.pk).map(Number).sort();
      X.chart(id, {tooltip: {trigger: "axis", formatter: function (p) { var y = ys[p[0].dataIndex]; return "<b>" + y + "</b><br>Máximo " + f1(Q.pk[y].v, 0) + " m³/s<br>el " + Q.pk[y].d.split("-").reverse().join("/"); }}, grid: {left: 52, right: 14, top: 14, bottom: 28}, xAxis: {type: "category", data: ys.map(String)}, yAxis: {type: "value", name: "m³/s", min: 0}, series: [{type: "bar", data: ys.map(function (y) { return {value: +Q.pk[y].v.toFixed(0), itemStyle: {color: y === Q.yr[Q.iObs] ? "#d7263d" : "#2a7fd4"}}; }), markLine: {silent: true, symbol: "none", lineStyle: {color: "#d7263d", type: "dashed"}, label: {formatter: "P90"}, data: [{yAxis: Q.p90}]}}]});
    }},
    q3: {t: "Curva de duración de caudales", c: function () { return "Con qué frecuencia el río supera cada caudal (" + R0 + "–" + R2() + "). El punto rojo es el caudal de hoy."; }, f: function (A, id) {
      var Q = ST.q, r = Q.ref, pts = [], n = r.length, st = Math.max(1, Math.floor(n / 200)); for (var i = 0; i < n; i += st) pts.push([+(100 * (1 - i / n)).toFixed(2), +r[i].toFixed(1)]);
      var hx = Q.rank == null ? null : [+(100 - Q.rank).toFixed(1), +Q.hoy.toFixed(1)];
      X.chart(id, {tooltip: {trigger: "axis", formatter: function (p) { return "Superado el " + f1(p[0].value[0], 0) + " % de los días: " + f1(p[0].value[1], 0) + " m³/s"; }}, grid: {left: 56, right: 14, top: 14, bottom: 34}, xAxis: {type: "value", name: "% de días en que se supera", nameLocation: "middle", nameGap: 22, min: 0, max: 100, inverse: true}, yAxis: {type: "log", name: "m³/s", min: Math.max(1, Math.floor(r[0] || 1))}, series: [{type: "line", data: pts, symbol: "none", lineStyle: {color: "#1d6fb8", width: 2.5}, areaStyle: {color: "#1d6fb8", opacity: .1}}, {type: "scatter", data: hx ? [hx] : [], symbolSize: 13, itemStyle: {color: "#d7263d"}, label: {show: true, formatter: "hoy", position: "top"}}]});
    }}
  };
  function R2() { return R1; }
  /* ---------- tarjetas, KPI y lectura ---------- */
  function kp(l, v, d, col, ic) { return '<div class="card kpi" style="--k:' + col + '"><div class="ic" style="color:' + col + '">' + X.ic(ic) + '</div><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; }
  function card(t, c, id) { return '<div class="card"><h2>' + t + '</h2><div class="cap" id="' + id + 'c">' + c + '</div><div class="ch s" id="' + id + '"></div></div>'; }
  var MODOS = {
    meteo: {t: "Monitoreo del tiempo: temperatura, lluvia y viento", L: ["temp", "anom", "plluv", "pacum", "viento", "tmes", "pmes", "anual", "extremos"]},
    clima: {t: "Monitoreo del clima: sequía, calor y lluvia", L: ["spi", "spih", "pacum", "anom", "balance", "racha", "anual", "extremos", "pmes"]},
    hidro: {t: "Monitoreo hidrológico: caudales y lluvia", L: ["q1", "q2", "q3", "plluv", "pacum", "balance"]}
  };
  function kpis(A, a) {
    var m = ST.modo;
    if (m === "hidro") { var Q = ST.q; return kp("Caudal de hoy", Q ? f1(Q.hoy, 0) + " m³/s" : "—", Q ? "mediana normal " + f1(Q.N.m[Q.doy[Q.iObs]], 0) + " m³/s" : "sin dato", "#1d6fb8", "wave") + kp("Percentil del caudal", Q && Q.rank != null ? f1(Q.rank, 0) + " %" : "—", "frente a esta época del año (" + R0 + "–" + R1 + ")", Q && Q.rank >= 90 ? "#d7263d" : Q && Q.rank <= 10 ? "#e8743b" : "#2e9e5b", "pulse") + kp("Máximo de 10 días", Q ? f1(Q.m10, 0) + " m³/s" : "—", Q ? "umbral alto P90: " + f1(Q.p90, 0) + " m³/s" : "", Q && Q.m10 >= Q.p90 ? "#d7263d" : "#5c6bc0", "shield") + kp("Lluvia de 30 días", f1(a.pr30, 0) + " mm", a.pr30p != null ? f1(a.pr30p, 0) + " % de lo normal" : "", "#2a9df4", "water"); }
    if (m === "clima") return kp("SPI-3 (último mes)", sg(a.spi[3], 2), claseSPI(a.spi[3]) + " · " + a.spiMes, colSPI(a.spi[3]), "sun") + kp("SPI-12 (año)", sg(a.spi[12], 2), claseSPI(a.spi[12]), colSPI(a.spi[12]), "water") + kp("Racha seca actual", a.racha + " días", "seguidos con < 1 mm", a.racha >= 30 ? "#d7263d" : "#c98a3b", "pulse") + kp("Temperatura 7 días", sg(a.dTx) + " °C", "máxima frente a lo normal · mínima " + sg(a.dTn) + " °C", a.dTx >= 2 ? "#e4572e" : "#5c6bc0", "sun");
    return kp("Temperatura máxima (7 d)", f1(a.tx7) + " °C", sg(a.dTx) + " °C frente a lo normal", a.dTx >= 2 ? "#e4572e" : a.dTx <= -2 ? "#3a86d8" : "#5c6bc0", "sun") + kp("Temperatura mínima (7 d)", f1(a.tn7) + " °C", sg(a.dTn) + " °C frente a lo normal · heladas en 30 d: " + a.fd30, a.dTn <= -2 ? "#3a86d8" : "#5c6bc0", "pulse") + kp("Lluvia de 30 días", f1(a.pr30, 0) + " mm", a.pr30p != null ? f1(a.pr30p, 0) + " % de lo normal" : "", a.pr30p != null && a.pr30p < 60 ? "#e8743b" : "#2a9df4", "water") + kp("Ráfaga máxima (30 d)", f1(a.wg30, 0) + " km/h", a.wgN + " día(s) sobre el P95 histórico", a.wgN ? "#d7263d" : "#5c6bc0", "wave");
  }
  function lectura(A, a) {
    var p = [], m = ST.modo;
    if (m === "hidro" && ST.q) { var Q = ST.q; p.push("El río lleva <b>" + f1(Q.hoy, 0) + " m³/s</b>, " + (Q.rank == null ? "" : "percentil " + f1(Q.rank, 0) + " para esta época del año" + (Q.rank >= 90 ? " (caudal alto: posible crecida)" : Q.rank <= 10 ? " (caudal bajo)" : " (dentro de lo normal)")) + "."); }
    if (m !== "hidro") p.push("Últimos 7 días: máximas <b>" + sg(a.dTx) + " °C</b> y mínimas <b>" + sg(a.dTn) + " °C</b> respecto a lo normal.");
    p.push("Lluvia de 30 días: <b>" + f1(a.pr30, 0) + " mm</b>" + (a.pr30p != null ? " (" + f1(a.pr30p, 0) + " % de lo normal" + (a.pr30p < 60 ? ", déficit" : a.pr30p > 140 ? ", exceso" : "") + ")" : "") + ".");
    if (a.temp.mm != null && a.temp.norm != null) p.push("Temporada desde el 1 de septiembre: <b>" + f1(a.temp.mm, 0) + " mm</b> (año pasado " + f1(a.temp.prev, 0) + ", normal " + f1(a.temp.norm, 0) + ").");
    if (m !== "hidro") p.push("SPI-3 al cierre de " + a.spiMes + ": <b>" + sg(a.spi[3], 2) + "</b> (" + claseSPI(a.spi[3]) + ").");
    if (A.tend && m !== "hidro") p.push("Tendencia " + A.tend.y0 + "–" + A.tend.y1 + ": <b>" + sg(A.tend.b * 10, 2) + " °C por década</b>.");
    return p.join(" ");
  }
  /* ---------- lugar, ficha, mapa ---------- */
  function cenMun(f) { var g = f.geometry, rings = g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map(function (p) { return p[0]; }), best = rings.reduce(function (a, r) { return r.length > a.length ? r : a; }, rings[0]), sx = 0, sy = 0; best.forEach(function (c) { sx += c[0]; sy += c[1]; }); return [sx / best.length, sy / best.length]; }
  function lugares() {
    var L = CAPS.map(function (c) { return {k: "cap:" + c[0], n: c[0] + " (" + c[3] + ")", lat: c[1], lon: c[2], dep: c[3], mun: null}; });
    ST.mun = {}; ((O.geoMun || {}).features || []).forEach(function (f) { var c = cenMun(f), k = f.properties.n + " (" + f.properties.d + ")"; ST.mun[k] = {k: "mun:" + k, n: k, lat: +c[1].toFixed(3), lon: +c[0].toFixed(3), dep: f.properties.d, mun: f}; });
    ST.caps = L; return L;
  }
  function pideLugar(k) {
    if (!k) return ST.caps[0]; if (k.indexOf("mun:") === 0) return ST.mun[k.slice(4)] || ST.caps[0];
    var n = k.replace(/^cap:/, ""); return ST.caps.filter(function (c) { return c.k === "cap:" + n; })[0] || ST.caps[0];
  }
  function svgMun(f, col) {
    var g = f.geometry, rings = g.type === "Polygon" ? g.coordinates : [].concat.apply([], g.coordinates), mn = [180, 90], mx = [-180, -90];
    rings.forEach(function (r) { r.forEach(function (c) { mn = [Math.min(mn[0], c[0]), Math.min(mn[1], c[1])]; mx = [Math.max(mx[0], c[0]), Math.max(mx[1], c[1])]; }); });
    var kx = Math.cos(((mn[1] + mx[1]) / 2) * Math.PI / 180), w = (mx[0] - mn[0]) * kx, h = mx[1] - mn[1], s = 150 / Math.max(w, h), W = Math.round(w * s) + 12, H = Math.round(h * s) + 12;
    var d = rings.map(function (r) { return "M" + r.map(function (c) { return (((c[0] - mn[0]) * kx * s) + 6).toFixed(1) + "," + (((mx[1] - c[1]) * s) + 6).toFixed(1); }).join("L") + "Z"; }).join("");
    return '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;max-height:170px" role="img" aria-label="Forma del municipio"><path d="' + d + '" fill="' + col + '" fill-opacity=".35" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }
  function resaltar(p) {
    var m = (window.__mapas || {}).mmap; if (!m) return;
    function hacer() {
      try {
        ["clsel-f", "clsel-l"].forEach(function (i) { if (m.getLayer(i)) m.removeLayer(i); }); if (m.getSource("clsel")) m.removeSource("clsel");
        if (p.mun) {
          m.addSource("clsel", {type: "geojson", data: {type: "FeatureCollection", features: [p.mun]}}); m.addLayer({id: "clsel-f", type: "fill", source: "clsel", paint: {"fill-color": "#58a6ff", "fill-opacity": .18}}); m.addLayer({id: "clsel-l", type: "line", source: "clsel", paint: {"line-color": "#0b5fd1", "line-width": 3}});
          var g = p.mun.geometry, pts = g.type === "Polygon" ? g.coordinates[0] : [].concat.apply([], g.coordinates.map(function (q) { return q[0]; })), b = [180, 90, -180, -90]; pts.forEach(function (c) { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; }); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: 60, maxZoom: 10, duration: 800});
        } else m.flyTo({center: [p.lon, p.lat], zoom: 8, duration: 800});
      } catch (e) { console.error("resaltar", e); }
    }
    if (m.loaded && m.loaded()) hacer(); else m.once("load", hacer);
  }
  function ficha(A, p) {
    var box = $("clFicha"); if (!box) return;
    if (!p.mun || !A) { box.style.display = "none"; return; }
    var r = A.raw, i0 = A.iObs + 1, L = []; for (var i = i0; i < Math.min(A.n, i0 + 7); i++) L.push(i);
    box.innerHTML = '<h3 style="margin:0 0 4px;font-size:16px">Municipio de ' + E(p.mun.properties.n) + ' (' + E(p.dep) + ')</h3><div class="nota" style="margin-bottom:6px">Las gráficas de abajo son de este municipio (punto ' + p.lat + ', ' + p.lon + '). Pronóstico de 7 días:</div>' + (L.length ? '<table class="t-mun"><tr><th></th>' + L.map(function (i) { return '<th>' + lab(A, i) + '</th>'; }).join("") + '</tr><tr><td>Máx. °C</td>' + L.map(function (i) { return '<td>' + f1(r.tx[i], 0) + '</td>'; }).join("") + '</tr><tr><td>Mín. °C</td>' + L.map(function (i) { return '<td>' + f1(r.tn[i], 0) + '</td>'; }).join("") + '</tr><tr><td>Lluvia mm</td>' + L.map(function (i) { return '<td>' + f1(r.pr[i], 0) + '</td>'; }).join("") + '</tr></table>' : "");
    box.style.display = "";
  }
  /* ---------- armado ---------- */
  function seccion(modo, o) {
    O = o; ST.modo = modo; var M = MODOS[modo];
    return '<div class="secb" id="s-mon" style="--c:' + o.col + '">' + M.t + '</div>' +
      '<div class="card cl-top"><div class="cl-bar"><label>Lugar de análisis<select id="clLug"></select></label><label>Ventana<span class="seg" id="clVen"><button type="button" data-n="30">1 mes</button><button type="button" class="on" data-n="90">90 días</button><button type="button" data-n="180">180 días</button><button type="button" data-n="365">1 año</button></span></label><button class="btn s" id="clCsv" type="button">' + X.ic("dl") + 'Serie (CSV)</button></div>' +
      '<div class="cl-lect" id="clLect"><span class="nota">Consultando la serie histórica…</span></div><div class="nota" id="clFte"></div><div class="nota" id="clFte2" style="color:var(--accent,#58a6ff)"></div></div>' +
      '<div class="card" id="clFicha" style="display:none;margin-bottom:14px"></div>' +
      '<div class="grid g4" id="clKpi" style="margin:12px 0"></div><div class="grid g3" id="clGraf">' + M.L.map(function (k) { var d = (CQ[k] || CH[k]); return card(d.t, "", "cl_" + k); }).join("") + '</div>';
  }
  function pintar() {
    var A = ST.an, M = MODOS[ST.modo], a = actuales(A);
    $("clKpi").innerHTML = kpis(A, a); $("clLect").innerHTML = lectura(A, a);
    $("clFte").innerHTML = (ST.modo === "hidro" ? "Caudal: modelo GloFAS (Open-Meteo) · lluvia: reanálisis ERA5. " : "Reanálisis ERA5 (Open-Meteo), serie " + A.y0 + "–" + A.raw.d[A.iObs].slice(0, 4) + ". ") + "Normal OMM " + R0 + "–" + R1 + ". Es una estimación del modelo para el punto " + ST.lugar.lat + ", " + ST.lugar.lon + ", no una estación del SENAMHI: en terreno de montaña puede diferir varios grados.";
    M.L.forEach(function (k) { var d = CQ[k] || CH[k], id = "cl_" + k; if (CQ[k] && !ST.q) { $(id).innerHTML = '<p class="nota" style="padding:16px">Sin serie de caudal para este punto (el modelo GloFAS solo cubre cauces de río). Elija un punto sobre un río o una capital cercana a uno.</p>'; return; } $(id + "c").textContent = d.c(A); try { d.f(A, id); } catch (e) { console.error(k, e); $(id).innerHTML = '<p class="nota">No se pudo dibujar este gráfico.</p>'; } });
    ficha(A, ST.lugar);
  }
  function cargar() {
    var p = ST.lugar, tok = ++ST.tok, key = p.lat + "," + p.lon;
    ST.msg = function (t) { if (tok === ST.tok && $("clFte2")) $("clFte2").textContent = t; };
    $("clKpi").innerHTML = ""; $("clLect").innerHTML = '<span class="nota">Consultando la serie histórica de ' + E(p.n) + '… la primera vez en cada lugar tarda; después queda guardada en su navegador.</span>';
    if (ST.cache[key]) { ST.an = ST.cache[key]; ST.msg(""); var pq0 = ST.modo === "hidro" ? bajarCaudal(p).then(analizarQ).catch(function () { return null; }) : Promise.resolve(null); pq0.then(function (q) { if (tok !== ST.tok) return; ST.q = q; pintar(); }); return; }
    var pq = ST.modo === "hidro" ? bajarCaudal(p).then(analizarQ).catch(function () { return null; }) : Promise.resolve(null);
    bajarClima(p, function (raw, fin) { pq.then(function (q) { if (tok !== ST.tok) return; var A = analizar(raw); ST.an = A; ST.q = q; if (fin) { ST.cache[key] = A; ST.msg(""); } else ST.msg("Datos 1991–hoy listos; completando la serie 1940–1990 en segundo plano…"); pintar(); }); }).catch(function (e) { if (tok !== ST.tok) return; $("clLect").innerHTML = '<span class="nota">No se pudo consultar Open-Meteo ahora (' + E(e.message) + '). Si dice HTTP 429 es el límite de consultas gratuitas: espere un minuto y vuelva a elegir el lugar.</span>'; });
  }
  function elegir(p, desdeUsuario) {
    ST.lugar = p; var s = $("clLug"); if (p.mun) s.value = ""; else s.value = p.k;
    try { var u = new URL(location.href); u.searchParams.set("lug", p.k); history.replaceState(null, "", u.toString()); } catch (e) {}
    ficha(null, p); if (!p.mun && desdeUsuario) resaltar(p); cargar();
  }
  function iniciar(modo, o) {
    O = o; ST.modo = modo; lugares();
    var s = $("clLug"); s.innerHTML = '<option value="">— municipio (elegido arriba) —</option><optgroup label="Capitales de departamento">' + ST.caps.map(function (c) { return '<option value="' + E(c.k) + '">' + E(c.n) + '</option>'; }).join("") + '</optgroup>';
    s.onchange = function () { if (s.value) elegir(pideLugar(s.value), true); };
    $("clVen").onclick = function (e) { var b = e.target.closest("[data-n]"); if (!b) return; ST.n = +b.dataset.n; [].forEach.call($("clVen").children, function (c) { c.classList.toggle("on", c === b); }); if (ST.an) pintar(); };
    $("clCsv").onclick = function () { var A = ST.an; if (!A) return; var r = A.raw, L = ["fecha,tmax_c,tmin_c,lluvia_mm,rafaga_kmh,et0_mm"]; for (var i = 0; i < A.n; i++) L.push([r.d[i], r.tx[i], r.tn[i], r.pr[i], r.wg[i], r.et[i]].map(function (v) { return v == null ? "" : v; }).join(",")); var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + L.join("\n")], {type: "text/csv"})); a.download = "serie_" + ST.lugar.n.replace(/[^a-z0-9]+/gi, "_") + ".csv"; a.click(); };
    var q = new URLSearchParams(location.search).get("lug"), ini = q ? pideLugar(q) : (modo === "hidro" ? ST.caps[7] : ST.caps[0]);
    elegir(ini, !!q && q.indexOf("mun:") === 0);
  }
  /* bloque para el informe consolidado: serie de la capital del departamento (o La Paz) */
  function informe(el, dep) {
    var c = CAPS.filter(function (x) { return x[3] === dep; })[0] || CAPS[0], p = {n: c[0] + " (" + c[3] + ")", lat: c[1], lon: c[2]}, L = ["temp", "pacum", "anom", "anual", "spi", "extremos"];
    el.innerHTML = '<div class="card"><h2>Monitoreo del fenómeno en el tiempo · ' + E(p.n) + '</h2><div class="cap">Serie histórica completa (reanálisis ERA5, Open-Meteo), normal OMM ' + R0 + '–' + R1 + '. ' + (dep ? "" : "Referencia: La Paz (elija un departamento para cambiarla). ") + 'Estimación del modelo, no estación del SENAMHI.</div><div class="nota" id="rmLect">Consultando…</div></div><div class="grid g2" style="margin-top:12px">' + L.map(function (k) { return card(CH[k].t, "", "rm_" + k); }).join("") + '</div>';
    ST.modo = "meteo"; ST.lugar = p; ST.n = 90; ST.q = null; ST.an = null;
    ST.msg = function (t) { var n = $("rmLect"); if (n && !ST.an) n.textContent = t; };
    bajarClima(p, function (r, fin) { if (!fin) return; var A = analizar(r); ST.an = A; $("rmLect").innerHTML = lectura(A, actuales(A)); L.forEach(function (k) { $("rm_" + k + "c").textContent = CH[k].c(A); try { CH[k].f(A, "rm_" + k); } catch (e) { console.error(k, e); } }); }).catch(function (e) { $("rmLect").textContent = "No se pudo consultar Open-Meteo (" + e.message + "). Si es HTTP 429, espere un minuto y recargue."; });
  }
  function irMun(k) { if (ST.mun && ST.mun[k]) elegir(ST.mun[k], false); }
  return {irMun: irMun, seccion: seccion, iniciar: iniciar, analizar: analizar, informe: informe, MODOS: MODOS};
})();

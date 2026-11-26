/* VIENTO: viento (partículas animadas) y nubosidad sobre un mapa MapLibre.
   Datos: Open-Meteo (modelo, rejilla de 1°: -23,5…-8,5 lat, -70,5…-56,5 lon), consultados desde el navegador: viento a 10 m (velocidad y dirección) y cobertura de nubes,
   por hora (1 día atrás + 3 días adelante; se usa desde la hora actual). Caché de 1 h en localStorage (sala_viento_v1).
   NO son observaciones: es un modelo de ~1° que no resuelve valles ni montañas. Sin dato = sin dibujo (nunca se inventa).
   Partículas: canvas propio sobre el mapa; las partículas viven en pantalla y leen el viento de una rejilla de pantalla que se recalcula al mover el mapa o cambiar la hora.
   Nubosidad: capa de imagen del mapa (canvas), interpolada con bicúbica en el espacio y, entre horas, siguiendo el viento a 10 m (aproximación visual).
   Con «movimiento reducido» (sistema o Apariencia) no hay partículas: solo flechas estáticas. */
var VIENTO = (function () {
  "use strict";
  var LA0 = -23.5, LO0 = -70.5, NY = 16, NX = 15, LA1 = LA0 + NY - 1, LO1 = LO0 + NX - 1, LOTE = 80, KEY = "sala_viento_v1", TTL = 60 * 6e4, HMS = 36e5, FS = 6, G = 12;
  var D = {estado: "idle", msg: "", t: 0, ts: [], U: [], V: [], C: [], H: 0}, CF = {};
  var S = {th: 0, nub: true, est: "part", pausa: false, play: false, act: false, ahora: 0};
  var O = {}, map = null, cv = null, cx = null, W = 0, H = 0, dpr = 1, UIEL = null, pop = null, marker = null, rafId = 0, last = 0, vis = true, lento = 0, tAnt = 0;
  var CARD = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  var RAMPA = {
    dark: [[0, [62, 199, 240]], [12, [143, 227, 247]], [25, [242, 251, 255]], [40, [255, 211, 122]], [60, [255, 159, 28]]],
    light: [[0, [31, 111, 148]], [15, [23, 59, 107]], [30, [122, 47, 109]], [50, [181, 57, 15]], [60, [181, 57, 15]]]
  };
  var NB = 13, BIN = 5, LUT = [], CVN = null, CXN = null, WC = 360, HC = 0, LATF = null, LONC = null;
  var P = {n: 0, x: null, y: null, a: null, m: null, seg: [], cnt: null}, GW = 0, GH = 0, GU = null, GV = null, OUT = [0, 0, 0];
  var pend = {g: 0, n: 0, ui: 0, ro: 0};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
  function f1(x, d) { return (+x).toFixed(d == null ? 1 : d).replace(".", ","); }
  function claro() { return document.documentElement.getAttribute("data-theme") === "light"; }
  function reducido() { var r = document.documentElement.getAttribute("data-mov") === "off"; try { r = r || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {} return !!r; }
  function cl(x, a, b) { return x < a ? a : x > b ? b : x; }
  function cardinal(d) { return CARD[Math.round((((d % 360) + 360) % 360) / 22.5) % 16]; }
  function fHora(ms) { try { return new Date(ms).toLocaleString("es-BO", {weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz", hour12: false}).replace(/\./g, ""); } catch (e) { return new Date(ms).toISOString(); } }

  /* ---------- rampa de color por velocidad ---------- */
  function rampa(sp) {
    var R = RAMPA[claro() ? "light" : "dark"], i, a, b, t;
    if (sp <= R[0][0]) return R[0][1]; for (i = 1; i < R.length; i++) if (sp <= R[i][0]) { a = R[i - 1]; b = R[i]; t = (sp - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (k) { return a[1][k] + (b[1][k] - a[1][k]) * t; }); }
    return R[R.length - 1][1];
  }
  function lut() { LUT = []; for (var b = 0; b < NB; b++) { var c = rampa(b * BIN + BIN / 2); LUT.push("rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (claro() ? .88 : .92) + ")"); } }
  function degradado() { var R = RAMPA[claro() ? "light" : "dark"]; return "linear-gradient(90deg," + R.map(function (s) { return "rgb(" + s[1].join(",") + ") " + (s[0] / 60 * 100).toFixed(1) + "%"; }).join(",") + ")"; }

  /* ---------- datos ---------- */
  function puntos() { var p = [], iy, ix; for (iy = 0; iy < NY; iy++) for (ix = 0; ix < NX; ix++) p.push([LA0 + iy, LO0 + ix]); return p; }
  function epoca(t) { return Date.parse(t + ":00-04:00"); }
  /* a: {ts: [ms…], sp: [[240]…], dr: [[240]…], cc: [[240]…]} (por hora; null = sin dato) → D desde la hora actual; false si no alcanzan las horas */
  function aplica(a) {
    var now = Date.now(), i0 = -1, i, h, k, n = NX * NY;
    for (i = 0; i < a.ts.length; i++) if (a.ts[i] <= now) i0 = i; else break;
    if (i0 < 0) i0 = 0; var Hh = a.ts.length - i0; if (Hh < 49) return false;
    D.ts = a.ts.slice(i0); D.H = Hh; D.U = []; D.V = []; D.C = []; CF = {};
    for (h = 0; h < Hh; h++) {
      var U = new Float32Array(n), V = new Float32Array(n), C = new Float32Array(n), sp = a.sp[i0 + h], dr = a.dr[i0 + h], cc = a.cc[i0 + h];
      for (k = 0; k < n; k++) {
        if (sp[k] == null || dr[k] == null) { U[k] = NaN; V[k] = NaN; } else { var r = dr[k] * Math.PI / 180; U[k] = -sp[k] * Math.sin(r); V[k] = -sp[k] * Math.cos(r); }
        C[k] = cc[k] == null ? NaN : cc[k];
      }
      D.U.push(U); D.V.push(V); D.C.push(C);
    }
    S.ahora = cl((now - D.ts[0]) / HMS, 0, 1);
    return true;
  }
  function descargaLote(pts) {
    var u = "https://api.open-meteo.com/v1/forecast?latitude=" + pts.map(function (p) { return p[0]; }).join(",") + "&longitude=" + pts.map(function (p) { return p[1]; }).join(",") + "&hourly=wind_speed_10m,wind_direction_10m,cloud_cover&timezone=America%2FLa_Paz&forecast_days=3&past_days=1";
    return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status === 429 ? "el servicio limitó las consultas (error 429); reintente en unos minutos" : "el servicio respondió " + r.status); return r.json(); }).then(function (j) {
      var arr = Array.isArray(j) ? j : [j]; if (arr.length !== pts.length || !arr[0] || !arr[0].hourly) throw new Error((j && j.reason) || "respuesta incompleta");
      return arr;
    });
  }
  function cargar(forzar) {
    if (D.estado === "cargando") return;
    D.estado = "cargando"; D.msg = ""; estado();
    try {
      var c = !forzar && JSON.parse(localStorage.getItem(KEY) || "null");
      if (c && Date.now() - c.t < TTL && c.ts && c.s && aplica({ts: c.ts, sp: c.s.map(function (r) { return r.map(function (x) { return x < 0 ? null : x / 10; }); }), dr: c.d.map(function (r) { return r.map(function (x) { return x < 0 ? null : x; }); }), cc: c.c.map(function (r) { return r.map(function (x) { return x < 0 ? null : x; }); })})) { D.t = c.t; D.estado = "ok"; estado(); listoDatos(); return; }
    } catch (e) {}
    var P = puntos(), lotes = [], i; for (i = 0; i < P.length; i += LOTE) lotes.push(P.slice(i, i + LOTE));
    Promise.all(lotes.map(descargaLote)).then(function (res) {
      var all = [].concat.apply([], res), t0 = all[0].hourly.time || [], n = all.length, ts = t0.map(epoca), mk = function () { return t0.map(function () { return new Array(n); }); }, sp = mk(), dr = mk(), cc = mk(), k, h;
      for (k = 0; k < n; k++) { var hh = all[k].hourly, a = hh.wind_speed_10m || [], b = hh.wind_direction_10m || [], c = hh.cloud_cover || []; for (h = 0; h < t0.length; h++) { sp[h][k] = a[h] == null ? null : a[h]; dr[h][k] = b[h] == null ? null : b[h]; cc[h][k] = c[h] == null ? null : c[h]; } }
      if (!aplica({ts: ts, sp: sp, dr: dr, cc: cc})) throw new Error("el modelo devolvió menos de 48 h de pronóstico");
      D.t = Date.now(); D.estado = "ok";
      try { var q = function (A, f) { return A.map(function (r) { return r.map(f); }); }; localStorage.setItem(KEY, JSON.stringify({t: D.t, ts: ts, s: q(sp, function (x) { return x == null ? -1 : Math.round(x * 10); }), d: q(dr, function (x) { return x == null ? -1 : Math.round(x); }), c: q(cc, function (x) { return x == null ? -1 : Math.round(x); })})); } catch (e) {}
      estado(); listoDatos();
    }).catch(function (e) { D.estado = "error"; D.msg = (e && e.message && !/failed to fetch|networkerror|load failed/i.test(e.message)) ? e.message : "sin conexión con Open-Meteo (red o bloqueo del navegador)"; estado(); ui(UIEL); });
  }
  function estado() {
    var el = O.banner && document.getElementById(O.banner); if (!el) return;
    if (!S.act || D.estado === "ok") { el.hidden = true; return; }
    el.hidden = false;
    if (D.estado === "error") { el.innerHTML = 'No se pudo consultar el viento ni la nubosidad (' + esc(D.msg) + '). <b>Sin dato: no se dibuja nada.</b> <button class="xlink" type="button" id="viRe">Reintentar</button>'; var b = document.getElementById("viRe"); if (b) b.onclick = function () { cargar(true); }; }
    else el.innerHTML = 'Consultando el viento y la nubosidad del modelo Open-Meteo…';
  }
  function listoDatos() { S.th = S.ahora; ui(UIEL); if (S.act) { refresca(true); arranca(); } if (O.alCambiar) O.alCambiar(); }

  /* ---------- muestreo (bilineal en el espacio, lineal en el tiempo) ---------- */
  function celda(lat, lon) {
    var fy = lat - LA0, fx = lon - LO0; if (fy < 0 || fx < 0 || fy > NY - 1 || fx > NX - 1) return null;
    var iy = Math.min(NY - 2, Math.floor(fy)), ix = Math.min(NX - 2, Math.floor(fx)); return [iy * NX + ix, fx - ix, fy - iy];
  }
  function bil(A, k, tx, ty) {
    var a = A[k], b = A[k + 1], c = A[k + NX], d = A[k + NX + 1], wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty, s = 0, w = 0;
    if (a === a) { s += a * wa; w += wa; } if (b === b) { s += b * wb; w += wb; } if (c === c) { s += c * wc; w += wc; } if (d === d) { s += d * wd; w += wd; }
    return w > .5 ? s / w : NaN;
  }
  function hi(th) { var h0 = Math.floor(th); if (h0 > D.H - 2) h0 = D.H - 2; if (h0 < 0) h0 = 0; return h0; }
  /* viento (u hacia el este, v hacia el norte; km/h) en lat/lon y hora th (horas desde la hora actual redondeada); false si está fuera de la rejilla o sin dato */
  function uvEn(lat, lon, th, o) {
    var c = celda(lat, lon); if (!c) return false; var h0 = hi(th), f = cl(th - h0, 0, 1), u = bil(D.U[h0], c[0], c[1], c[2]), v = bil(D.V[h0], c[0], c[1], c[2]);
    if (u !== u || v !== v) return false;
    if (f > 0 && h0 + 1 < D.H) { var u1 = bil(D.U[h0 + 1], c[0], c[1], c[2]), v1 = bil(D.V[h0 + 1], c[0], c[1], c[2]); if (u1 === u1 && v1 === v1) { u += (u1 - u) * f; v += (v1 - v) * f; } }
    o[0] = u; o[1] = v; return true;
  }
  /* nubosidad: la rejilla de 1° se refina ×6 con bicúbica (Catmull-Rom) para que no haya cuadros */
  function cr(p0, p1, p2, p3, t) { return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t); }
  function fina(h) {
    if (CF[h]) return CF[h]; var A = D.C[h], nx = (NX - 1) * FS + 1, ny = (NY - 1) * FS + 1, F = new Float32Array(nx * ny), i, j, m, n;
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      var gx = i / FS, gy = j / FS, ix = Math.min(NX - 2, Math.floor(gx)), iy = Math.min(NY - 2, Math.floor(gy)), tx = gx - ix, ty = gy - iy, ok = true, rows = [];
      for (m = -1; m <= 2 && ok; m++) { var yy = cl(iy + m, 0, NY - 1), q = []; for (n = -1; n <= 2; n++) { var v = A[yy * NX + cl(ix + n, 0, NX - 1)]; if (v !== v) { ok = false; break; } q.push(v); } rows.push(q); }
      if (ok) F[j * nx + i] = cl(cr(cr(rows[0][0], rows[0][1], rows[0][2], rows[0][3], tx), cr(rows[1][0], rows[1][1], rows[1][2], rows[1][3], tx), cr(rows[2][0], rows[2][1], rows[2][2], rows[2][3], tx), cr(rows[3][0], rows[3][1], rows[3][2], rows[3][3], tx), ty), 0, 100);
      else F[j * nx + i] = bil(A, iy * NX + ix, tx, ty);
    }
    CF[h] = F; return F;
  }
  function finaEn(h, lat, lon) {
    var F = fina(h), nx = (NX - 1) * FS + 1, ny = (NY - 1) * FS + 1, fy = (lat - LA0) * FS, fx = (lon - LO0) * FS; if (fy < 0 || fx < 0 || fy > ny - 1 || fx > nx - 1) return NaN;
    var j = Math.min(ny - 2, Math.floor(fy)), i = Math.min(nx - 2, Math.floor(fx)), tx = fx - i, ty = fy - j, a = F[j * nx + i], b = F[j * nx + i + 1], c = F[(j + 1) * nx + i], d = F[(j + 1) * nx + i + 1];
    if (a !== a || b !== b || c !== c || d !== d) return NaN; return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
  /* cobertura de nubes (%) en lat/lon y hora th; entre dos horas se mezclan las dos rejillas «corridas» según el viento a 10 m (aproximación) */
  var UVA = [0, 0], UVB = [0, 0];
  function nubeEn(lat, lon, th) {
    var h0 = hi(th), f = cl(th - h0, 0, 1), c0, c1, k = Math.cos(lat * Math.PI / 180) * 111.32;
    if (f < .002 || h0 + 1 >= D.H) return finaEn(h0, lat, lon);
    var a = uvEn(lat, lon, h0, UVA), b = uvEn(lat, lon, h0 + 1, UVB);
    c0 = a ? finaEn(h0, lat - UVA[1] * f / 111.32, lon - UVA[0] * f / k) : finaEn(h0, lat, lon);
    c1 = b ? finaEn(h0 + 1, lat + UVB[1] * (1 - f) / 111.32, lon + UVB[0] * (1 - f) / k) : finaEn(h0 + 1, lat, lon);
    if (c0 !== c0) return c1; if (c1 !== c1) return c0; return c0 * (1 - f) + c1 * f;
  }
  /* valores en un punto (para popup y ficha): {sp km/h, ms, dr (grados de donde viene), hacia, c %, ms epoch} o null */
  function en(lat, lon, th) {
    if (D.estado !== "ok") return null; th = cl(th == null ? S.th : th, 0, D.H - 1); var o = [0, 0]; if (!uvEn(lat, lon, th, o)) return null;
    var sp = Math.hypot(o[0], o[1]), dr = (Math.atan2(-o[0], -o[1]) * 180 / Math.PI + 360) % 360, c = nubeEn(lat, lon, th);
    return {sp: sp, ms: sp / 3.6, dr: dr, hacia: (dr + 180) % 360, c: c === c ? c : null, t: D.ts[0] + th * HMS};
  }
  function serie(lat, lon) {
    if (D.estado !== "ok") return null; var r = {t: [], sp: [], dr: [], c: []}, h;
    for (h = 0; h < D.H; h++) { var q = en(lat, lon, h); r.t.push(D.ts[h]); r.sp.push(q ? q.sp : null); r.dr.push(q ? q.dr : null); r.c.push(q && q.c != null ? q.c : null); }
    return r;
  }

  /* ---------- rejilla de pantalla (viento en px: u a la derecha, v hacia arriba) ---------- */
  function rejillaPantalla() {
    pend.g = 0; if (!map || D.estado !== "ok" || !W) return;
    GW = Math.ceil(W / G) + 2; GH = Math.ceil(H / G) + 2; if (!GU || GU.length !== GW * GH) { GU = new Float32Array(GW * GH); GV = new Float32Array(GW * GH); }
    var i, j, ll, o = OUT; for (j = 0; j < GH; j++) for (i = 0; i < GW; i++) { ll = map.unproject([i * G, j * G]); if (uvEn(ll.lat, ll.lng, S.th, o)) { GU[j * GW + i] = o[0]; GV[j * GW + i] = o[1]; } else { GU[j * GW + i] = NaN; GV[j * GW + i] = NaN; } }
  }
  function enPantalla(x, y, o) {
    var gx = x / G, gy = y / G, i = Math.floor(gx), j = Math.floor(gy); if (i < 0 || j < 0 || i >= GW - 1 || j >= GH - 1) return false;
    var tx = gx - i, ty = gy - j, k = j * GW + i, a = GU[k], b = GU[k + 1], c = GU[k + GW], d = GU[k + GW + 1]; if (a !== a || b !== b || c !== c || d !== d) return false;
    var wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
    o[0] = a * wa + b * wb + c * wc + d * wd; o[1] = GV[k] * wa + GV[k + 1] * wb + GV[k + GW] * wc + GV[k + GW + 1] * wd; return true;
  }

  /* ---------- partículas ---------- */
  function dimensiona() {
    if (!map || !cv) return; var c = map.getContainer(); W = c.clientWidth; H = c.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = cl(Math.round(W * H / 260), 700, 5200); if (lento) n = Math.max(600, Math.round(n * Math.pow(.8, lento)));
    P.n = n; P.x = new Float32Array(n); P.y = new Float32Array(n); P.a = new Float32Array(n); P.m = new Float32Array(n); P.seg = []; for (var b = 0; b < NB; b++) P.seg.push(new Float32Array(n * 4)); P.cnt = new Int32Array(NB);
    for (var i = 0; i < n; i++) { P.a[i] = -1; }
  }
  function semilla(i, o) {
    for (var t = 0; t < 8; t++) { var x = Math.random() * W, y = Math.random() * H; if (enPantalla(x, y, o)) { P.x[i] = x; P.y[i] = y; P.a[i] = 0; P.m[i] = 60 + Math.random() * 70; return true; } }
    P.a[i] = -1; return false;
  }
  var K = .075;
  function paso(dt) {
    var o = OUT, i, b, n = P.n, w = W, h = H, nx, ny, sp, cnt = P.cnt, seg = P.seg;
    for (b = 0; b < NB; b++) cnt[b] = 0;
    for (i = 0; i < n; i++) {
      if (P.a[i] < 0 || P.a[i] > P.m[i]) { if (!semilla(i, o)) continue; }
      if (!enPantalla(P.x[i], P.y[i], o)) { P.a[i] = -1; continue; }
      nx = P.x[i] + o[0] * K * dt; ny = P.y[i] - o[1] * K * dt; sp = Math.sqrt(o[0] * o[0] + o[1] * o[1]);
      if (nx < 0 || nx > w || ny < 0 || ny > h) { P.a[i] = -1; continue; }
      b = Math.min(NB - 1, (sp / BIN) | 0); var q = cnt[b]++ * 4, s = seg[b]; s[q] = P.x[i]; s[q + 1] = P.y[i]; s[q + 2] = nx; s[q + 3] = ny;
      P.x[i] = nx; P.y[i] = ny; P.a[i] += dt;
    }
    cx.globalCompositeOperation = "destination-out"; cx.fillStyle = "rgba(0,0,0," + (1 - Math.pow(1 - .07, dt)).toFixed(3) + ")"; cx.fillRect(0, 0, w, h);
    cx.globalCompositeOperation = "source-over"; cx.lineWidth = claro() ? 1.5 : 1.35; cx.lineCap = "round";
    for (b = 0; b < NB; b++) { var m = cnt[b]; if (!m) continue; cx.strokeStyle = LUT[b]; cx.beginPath(); var s2 = seg[b]; for (i = 0; i < m; i++) { cx.moveTo(s2[i * 4], s2[i * 4 + 1]); cx.lineTo(s2[i * 4 + 2], s2[i * 4 + 3]); } cx.stroke(); }
  }
  /* flechas estáticas suavizadas (movimiento reducido o estilo «Flechas») */
  function flechas() {
    if (!cx || D.estado !== "ok") return; cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H); if (!GU) rejillaPantalla();
    var st = 56, o = OUT, x, y; cx.lineCap = "round"; cx.lineJoin = "round"; cx.lineWidth = 1.7;
    for (y = st / 2; y < H; y += st) for (x = st / 2 + ((Math.round(y / st) % 2) ? st / 2 : 0); x < W; x += st) {
      if (!enPantalla(x, y, o)) continue; var sp = Math.hypot(o[0], o[1]), L = 9 + Math.min(sp, 40) * .55, dx = sp ? o[0] / sp : 0, dy = sp ? -o[1] / sp : 0, ex = x + dx * L / 2, ey = y + dy * L / 2, bx = x - dx * L / 2, by = y - dy * L / 2, hs = 4.2;
      cx.strokeStyle = LUT[Math.min(NB - 1, (sp / BIN) | 0)]; cx.beginPath(); cx.moveTo(bx, by); cx.lineTo(ex, ey); cx.moveTo(ex - dx * hs - dy * hs * .6, ey - dy * hs + dx * hs * .6); cx.lineTo(ex, ey); cx.lineTo(ex - dx * hs + dy * hs * .6, ey - dy * hs - dx * hs * .6); cx.stroke();
    }
  }
  function limpia() { if (cx) { cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H); } }

  /* ---------- nubosidad (imagen del mapa) ---------- */
  function preparaNubes() {
    if (CVN) return; var y0 = Math.log(Math.tan(Math.PI / 4 + LA0 * Math.PI / 360)), y1 = Math.log(Math.tan(Math.PI / 4 + LA1 * Math.PI / 360)), r = (y1 - y0) / ((LO1 - LO0) * Math.PI / 180);
    HC = Math.round(WC * r); CVN = document.createElement("canvas"); CVN.width = WC; CVN.height = HC; CXN = CVN.getContext("2d"); LATF = new Float32Array(HC); LONC = new Float32Array(WC);
    for (var j = 0; j < HC; j++) { var y = y1 - (j + .5) / HC * (y1 - y0); LATF[j] = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI; }
    for (var i = 0; i < WC; i++) LONC[i] = LO0 + (i + .5) / WC * (LO1 - LO0);
  }
  function dibujaNubes() {
    pend.n = 0; if (!map || D.estado !== "ok" || !map.getSource("vi-nub")) return; preparaNubes();
    var im = CXN.createImageData(WC, HC), d = im.data, c = claro(), R = c ? 78 : 206, Gc = c ? 96 : 224, B = c ? 132 : 255, AM = c ? .46 : .6, i, j, k = 0, th = cl(S.th, 0, D.H - 1);
    for (j = 0; j < HC; j++) { var lat = LATF[j]; for (i = 0; i < WC; i++, k += 4) {
      var v = nubeEn(lat, LONC[i], th); if (v !== v) { d[k + 3] = 0; continue; }
      var e = Math.min(lat - LA0, LA1 - lat, LONC[i] - LO0, LO1 - LONC[i]), fe = e >= .9 ? 1 : e <= 0 ? 0 : e / .9, a = Math.pow(v / 100, 1.15) * AM * fe;
      d[k] = R; d[k + 1] = Gc; d[k + 2] = B; d[k + 3] = Math.round(a * 255);
    } }
    CXN.putImageData(im, 0, 0); var src = map.getSource("vi-nub"); if (src && src.play) { src.play(); src.pause(); } map.triggerRepaint();
  }

  /* ---------- tiempo ---------- */
  function thMax() { return Math.min(D.H - 1, S.ahora + 48); }
  function refresca(ya) {
    if (D.estado !== "ok") return;
    if (ya) { rejillaPantalla(); if (S.nub) dibujaNubes(); if (S.est === "flech" || reducido()) { flechas(); } actualizaUI(); if (O.alCambiar) O.alCambiar(); return; }
    if (!pend.g) pend.g = setTimeout(function () { rejillaPantalla(); if (S.est === "flech") flechas(); }, 70);
    if (S.nub && !pend.n) pend.n = setTimeout(dibujaNubes, 180);
    if (!pend.ui) pend.ui = setTimeout(function () { pend.ui = 0; actualizaUI(); }, 90);
  }
  function ponHora(th) { S.th = cl(th, 0, thMax()); refresca(false); }
  function pasoTiempo(dt) { var t = S.th + dt * (2 / 60); if (t > thMax()) t = S.ahora; S.th = t; refresca(false); }

  /* ---------- bucle ---------- */
  function debe() { return S.act && D.estado === "ok" && !document.hidden && vis && ((S.est === "part" && !S.pausa && !reducido()) || S.play); }
  function frame(t) {
    rafId = 0; if (!debe()) return; var dt = tAnt ? cl((t - tAnt) / 16.67, .25, 3) : 1;
    if (tAnt && t - tAnt > 26) { lento++; } else if (lento > 0 && t - tAnt < 20) { lento = Math.max(0, lento - .02); }
    if (lento > 90 && P.n > 700) { lento = 0; P.n = Math.max(600, Math.round(P.n * .8)); }
    tAnt = t; if (S.play) pasoTiempo(dt); if (S.est === "part" && !S.pausa && !reducido() && !map._vmov) paso(dt);
    rafId = requestAnimationFrame(frame);
  }
  function arranca() { if (!rafId && debe()) { tAnt = 0; rafId = requestAnimationFrame(frame); } }
  function para() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } tAnt = 0; }

  /* ---------- interfaz ---------- */
  function etq(th) { return fHora(D.ts[0] + th * HMS); }
  function ui(el) {
    if (el) UIEL = el; el = UIEL; if (!el || !S.act) return;
    var red = reducido(), ok = D.estado === "ok", mx = ok ? Math.floor(thMax() - S.ahora + 1e-6) : 48, pre = [[0, "Ahora"], [6, "+6 h"], [12, "+12 h"], [24, "+24 h"], [48, "+48 h"]];
    if (red && S.est !== "flech") S.est = "flech";
    el.innerHTML = '<div class="cg vi-cg"><b>Hora</b>' + pre.map(function (p) { return '<button type="button" data-h="' + p[0] + '"' + (!ok || p[0] > mx ? " disabled" : "") + '>' + p[1] + '</button>'; }).join("") +
      '<input type="range" class="vi-r" id="viR" min="0" max="' + mx + '" step="0.25" value="' + (ok ? (S.th - S.ahora).toFixed(2) : 0) + '"' + (ok ? "" : " disabled") + ' aria-label="Horas desde ahora"><span class="vi-t" id="viT"></span></div>' +
      '<div class="cg vi-cg"><b>Animación</b><button type="button" id="viPl"' + (ok ? "" : " disabled") + '></button>' + (red ? "" : '<button type="button" id="viPa"' + (ok && S.est === "part" ? "" : " disabled") + '></button>') +
      '<b>Estilo</b><button type="button" data-e="part"' + (red ? ' disabled title="Desactivado: movimiento reducido"' : "") + '>Partículas</button><button type="button" data-e="flech">Flechas</button>' +
      '<label class="vi-lb"><input type="checkbox" id="viN"' + (S.nub ? " checked" : "") + '> Nubosidad</label>' + (red ? '<span class="nota">Movimiento reducido: solo flechas.</span>' : "") + '</div>';
    [].forEach.call(el.querySelectorAll("button[data-h]"), function (b) { b.onclick = function () { S.play = false; ponHora(S.ahora + (+b.dataset.h)); arranca(); actualizaUI(); }; });
    var r = el.querySelector("#viR"); if (r) { r.oninput = function () { S.play = false; ponHora(S.ahora + (+r.value)); actualizaUI(); }; }
    var pl = el.querySelector("#viPl"); if (pl) pl.onclick = function () { S.play = !S.play; if (S.play) { if (S.th >= thMax() - .01) S.th = S.ahora; arranca(); } actualizaUI(); };
    var pa = el.querySelector("#viPa"); if (pa) pa.onclick = function () { S.pausa = !S.pausa; if (!S.pausa) arranca(); actualizaUI(); };
    [].forEach.call(el.querySelectorAll("button[data-e]"), function (b) { b.onclick = function () { if (red && b.dataset.e === "part") return; S.est = b.dataset.e; limpia(); if (S.est === "flech") { rejillaPantalla(); flechas(); } else { for (var i = 0; i < P.n; i++) P.a[i] = -1; arranca(); } actualizaUI(); }; });
    var nb = el.querySelector("#viN"); if (nb) nb.onchange = function () { S.nub = nb.checked; capas(); if (S.nub) dibujaNubes(); if (O.alCambiar) O.alCambiar(); };
    actualizaUI();
  }
  function actualizaUI() {
    var el = UIEL; if (!el || !S.act) return; var ok = D.estado === "ok";
    [].forEach.call(el.querySelectorAll("button[data-h]"), function (b) { b.classList.toggle("on", ok && Math.abs(S.th - S.ahora - (+b.dataset.h)) < .26); });
    [].forEach.call(el.querySelectorAll("button[data-e]"), function (b) { b.classList.toggle("on", b.dataset.e === S.est); });
    var r = el.querySelector("#viR"); if (r && document.activeElement !== r) r.value = (S.th - S.ahora).toFixed(2);
    var t = el.querySelector("#viT"); if (t) t.textContent = ok ? etq(S.th) + (S.th - S.ahora >= .5 ? " · +" + Math.round(S.th - S.ahora) + " h" : " · ahora") : (D.estado === "error" ? "sin dato" : "consultando…");
    var pl = el.querySelector("#viPl"); if (pl) { pl.textContent = S.play ? "⏸ Detener la hora" : "▶ Reproducir 48 h"; pl.classList.toggle("on", S.play); }
    var pa = el.querySelector("#viPa"); if (pa) { pa.textContent = S.pausa ? "▶ Reanudar viento" : "⏸ Pausar viento"; pa.disabled = !(ok && S.est === "part"); pa.classList.toggle("on", S.pausa); }
    if (O.alHora) O.alHora(ok ? etq(S.th) : "");
  }
  function leyenda() {
    var g = function (t, b) { return '<div class="glg"><b>' + t + '</b><div>' + b + '</div></div>'; };
    return g("Viento a 10 m (km/h)", '<span class="vi-gr" style="background:' + degradado() + '"></span><span class="vi-gt"><i>0</i><i>15</i><i>30</i><i>45</i><i>60+</i></span><small>' + (reducido() || S.est === "flech" ? "Flechas: hacia dónde sopla; el largo crece con la velocidad." : "Cada trazo es una partícula que sigue el viento; el color es la velocidad.") + '</small>') +
      g("Nubosidad (%)", '<span class="vi-gr vi-nb' + (claro() ? " cl" : "") + '"></span><span class="vi-gt"><i>0</i><i>25</i><i>50</i><i>75</i><i>100</i></span><small>Cobertura de nubes del modelo' + (S.nub ? "" : " (capa apagada)") + '.</small>') +
      g("Qué es", '<small style="display:block;max-width:300px">Modelo Open-Meteo de ~1°: <span style="font-weight:700">no son observaciones</span> y no resuelve valles ni montañas. El viento es a 10 m. Entre horas, las nubes se desplazan con ese viento (aproximación visual). Pase el cursor para ver el valor.</small>');
  }
  function popup(e) {
    if (!S.act || D.estado !== "ok") { pop.remove(); return; }
    var q = en(e.lngLat.lat, e.lngLat.lng); if (!q) { pop.remove(); map.getCanvas().style.cursor = ""; return; }
    map.getCanvas().style.cursor = "crosshair"; var nm = O.nombre ? O.nombre(e.lngLat.lat, e.lngLat.lng) : "";
    pop.setLngLat(e.lngLat).setHTML('<div class="pop"><b style="margin:0">Viento ' + Math.round(q.sp) + ' km/h <span style="font-weight:400">(' + f1(q.ms) + ' m/s)</span></b>del ' + cardinal(q.dr) + ' (' + Math.round(q.dr) + '°) · sopla hacia el ' + cardinal(q.hacia) + '<br>Nubosidad ' + (q.c == null ? "sin dato" : "≈ " + Math.round(q.c) + " %") + (nm ? '<br>' + esc(nm) : '') + '<br><i>' + esc(fHora(q.t)) + ' · modelo Open-Meteo ~1°, no son observaciones</i></div>').addTo(map);
  }

  /* ---------- mapa ---------- */
  function capas() {
    if (!map || !map.getLayer("vi-nub")) return; map.setLayoutProperty("vi-nub", "visibility", S.act && S.nub ? "visible" : "none");
  }
  function adjunta(m, o) {
    if (map === m) { O = o || O; return; } map = m; O = o || {}; lut();
    cv = document.createElement("canvas"); cv.className = "vi-cv"; cv.setAttribute("aria-hidden", "true"); m.getCanvasContainer().appendChild(cv); cx = cv.getContext("2d");
    preparaNubes(); m.addSource("vi-nub", {type: "canvas", canvas: CVN, coordinates: [[LO0, LA1], [LO1, LA1], [LO1, LA0], [LO0, LA0]], animate: false});
    m.addLayer({id: "vi-nub", type: "raster", source: "vi-nub", layout: {visibility: "none"}, paint: {"raster-opacity": 1, "raster-resampling": "linear", "raster-fade-duration": 0}}, m.getLayer("ex-l") ? "ex-l" : undefined);
    pop = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 12, maxWidth: "300px"});
    var rq = 0, ev = null;
    m.on("mousemove", function (e) { if (!S.act) return; ev = e; if (rq) return; rq = requestAnimationFrame(function () { rq = 0; if (ev) popup(ev); }); });
    m.getCanvas().addEventListener("mouseleave", function () { pop.remove(); });
    m.on("click", function (e) { if (!S.act || D.estado !== "ok" || !celda(e.lngLat.lat, e.lngLat.lng)) return; if (O.alElegir) O.alElegir(e.lngLat.lat, e.lngLat.lng); });
    m.on("movestart", function () { m._vmov = 1; cv.style.opacity = "0"; });
    m.on("moveend", function () { m._vmov = 0; if (!S.act) return; limpia(); rejillaPantalla(); for (var i = 0; i < P.n; i++) P.a[i] = -1; cv.style.opacity = "1"; if (S.est === "flech" || reducido()) flechas(); arranca(); });
    m.on("resize", function () { dimensiona(); if (S.act) { rejillaPantalla(); if (S.est === "flech" || reducido()) flechas(); } });
    try { new MutationObserver(function () { lut(); if (S.act) { if (S.nub) dibujaNubes(); if (S.est === "flech" || reducido()) flechas(); if (reducido()) { S.est = "flech"; S.play = false; } ui(UIEL); if (O.alCambiar) O.alCambiar(); } }).observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme", "data-mov"]}); } catch (e) {}
    try { new IntersectionObserver(function (es) { vis = es[0].isIntersecting; if (vis) arranca(); }).observe(m.getContainer()); } catch (e) {}
    document.addEventListener("visibilitychange", function () { if (!document.hidden) arranca(); });
    try { var mq = matchMedia("(prefers-reduced-motion: reduce)"); (mq.addEventListener || mq.addListener).call(mq, "change", function () { if (reducido()) { S.est = "flech"; S.play = false; } ui(UIEL); }); } catch (e) {}
    dimensiona(); if (S.act) activa(true);
  }
  function activa(on) {
    on = !!on; if (!map) { S.act = on; return; }
    if (on === S.act && (on ? cv.style.display !== "none" : true)) return; S.act = on;
    if (!on) { para(); S.play = false; cv.style.display = "none"; limpia(); pop.remove(); capas(); estado(); marca(null); map.getCanvas().style.cursor = ""; return; }
    cv.style.display = ""; cv.style.opacity = "1"; capas(); lut(); dimensiona();
    if (reducido()) S.est = "flech";
    if (D.estado === "idle" || D.estado === "error") cargar(D.estado === "error"); else if (D.estado === "ok") { S.th = cl(S.th, 0, D.H - 1); refresca(true); arranca(); }
    estado();
  }
  function marca(ll) {
    if (!map) return; if (!ll) { if (marker) { marker.remove(); marker = null; } return; }
    if (!marker) { var el = document.createElement("div"); el.className = "vi-sel"; marker = new maplibregl.Marker({element: el}).setLngLat([ll[1], ll[0]]).addTo(map); } else marker.setLngLat([ll[1], ll[0]]);
  }
  return {adjunta: adjunta, activa: activa, ui: ui, leyenda: leyenda, en: en, serie: serie, marca: marca, cardinal: cardinal, fHora: fHora, cargar: cargar, ponHora: ponHora,
    estado: function () { return D.estado; }, hora: function () { return D.estado === "ok" ? etq(S.th) : ""; }, mensaje: function () { return D.msg; },
    _depura: function () { return {D: D, S: S, P: P, map: map, lento: lento}; }};
})();

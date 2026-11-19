/* Fondos animados de la Sala de Situación (canvas, sin dependencias).
   Escenas: mundo (mapamundi de puntos), globo (esfera ortográfica), relieve (curvas de nivel andinas), red (nodos y señales).
   Modo: auto | mundo | globo | relieve | red | off  (se guarda en localStorage «sala_fondo»).
   En «auto» la escena es función de la hora (Date.now()), así cada página continúa donde quedó la anterior.
   Los puntos del mapa vienen de fondo_datos.js (Natural Earth + límites del sitio); es decorativo: no representa datos del sistema. */
(function () {
  "use strict";
  if (window.FONDO) return;
  var DAT = window.FONDO_DATOS || null;
  var TAU = Math.PI * 2, RAD = Math.PI / 180, PERIODO = 28000, FUNDIDO = 2500;
  var ESC_TODAS = ["mundo", "globo", "relieve", "red"], MODOS = ["auto", "mundo", "globo", "relieve", "red", "off"];
  var cv = null, cx = null, W = 0, H = 0, dpr = 1, bs = null, bsx = null, gr = null;
  var modo = "auto", prevModo = null, tCambio = 0, raf = 0, last = 0, tema = "dark", P = null, reducido = false, errores = 0;
  var BOL = {lat: -16.7, lon: -64.7};

  /* ---------- datos ---------- */
  var M = {ok: false}, E = {ok: false}, B = {ok: false}, C = {ok: false};
  function decodifica() {
    if (!DAT || !DAT.mapa || !DAT.esf) return;
    try {
      var xn = [], yn = [], i, k, j, row, lat, n, st, ln;
      for (i = 0; i < DAT.mapa.length; i++) {
        row = DAT.mapa[i]; lat = DAT.lat0 + i * DAT.paso;
        for (k = 0; k < row.length; k += 2) for (j = row[k]; j < row[k] + row[k + 1]; j++) { xn.push((j + 0.5) / DAT.nLon); yn.push((84 - lat) / 142); }
      }
      M.xn = new Float32Array(xn); M.yn = new Float32Array(yn); M.n = xn.length; M.ok = M.n > 100;
      var la = [], lo = [];
      for (i = 0; i < DAT.esf.length; i++) {
        row = DAT.esf[i]; lat = DAT.lat0 + i * DAT.paso; n = Math.max(1, Math.round(360 * Math.cos(lat * RAD) / DAT.paso));
        for (k = 0; k < row.length; k += 2) for (j = row[k]; j < row[k] + row[k + 1]; j++) { la.push(lat * RAD); lo.push((-180 + (j + 0.5) * (360 / n)) * RAD); }
      }
      E.lat = new Float32Array(la); E.lon = new Float32Array(lo); E.n = la.length; E.sl = new Float32Array(E.n); E.cl = new Float32Array(E.n);
      for (i = 0; i < E.n; i++) { E.sl[i] = Math.sin(E.lat[i]); E.cl[i] = Math.cos(E.lat[i]); }
      E.ok = E.n > 100;
      if (DAT.bol && DAT.bol.rows) {
        var bla = [], blo = [], b = DAT.bol;
        for (i = 0; i < b.rows.length; i++) { row = b.rows[i]; lat = b.lat0 + (i + 0.5) * b.paso; for (k = 0; k < row.length; k += 2) for (j = row[k]; j < row[k] + row[k + 1]; j++) { bla.push(lat); blo.push(b.lon0 + (j + 0.5) * b.paso); } }
        B.lat = new Float32Array(bla); B.lon = new Float32Array(blo); B.n = bla.length; B.ok = B.n > 20;
        B.xn = new Float32Array(B.n); B.yn = new Float32Array(B.n); B.sl = new Float32Array(B.n); B.cl = new Float32Array(B.n); B.lr = new Float32Array(B.n);
        for (i = 0; i < B.n; i++) { B.xn[i] = (B.lon[i] + 180) / 360; B.yn[i] = (84 - B.lat[i]) / 142; B.sl[i] = Math.sin(B.lat[i] * RAD); B.cl[i] = Math.cos(B.lat[i] * RAD); B.lr[i] = B.lon[i] * RAD; }
      }
      if (DAT.contorno && DAT.contorno[0]) {
        var f = DAT.contorno[0], c = {lon: [], lat: []};
        for (i = 0; i < f.length; i += 2) { c.lon.push(f[i] / 100); c.lat.push(f[i + 1] / 100); }
        C.lon = c.lon; C.lat = c.lat; C.n = c.lon.length; C.ok = C.n > 10;
      }
    } catch (e) { M.ok = E.ok = B.ok = C.ok = false; }
  }

  /* ---------- paleta ---------- */
  function paleta() {
    P = tema === "light"
      ? {osc: false, c0: "#f1f6fd", c1: "#eaf1fb", c2: "#dbe8f7",
         blobs: [[0.84, 0.08, 0.62, "125,172,238", 0.34], [0.08, 0.92, 0.55, "150,214,232", 0.26], [0.5, 0.5, 0.7, "190,182,242", 0.16]],
         dot: "42,82,148", acc: "10,104,214", lin: "60,104,176", vig: "186,208,238", vigA: 0.32, grano: "30,60,110", granoA: 0.035, esf0: "255,255,255", esf1: "120,160,215", dotMin: 0.16, dotMax: 0.42}
      : {osc: true, c0: "#02040a", c1: "#071226", c2: "#0b2347",
         blobs: [[0.84, 0.08, 0.62, "30,102,218", 0.30], [0.08, 0.92, 0.55, "8,152,198", 0.15], [0.5, 0.5, 0.7, "88,62,198", 0.10]],
         dot: "132,178,255", acc: "70,205,255", lin: "112,172,255", vig: "1,3,8", vigA: 0.55, grano: "255,255,255", granoA: 0.03, esf0: "40,112,222", esf1: "2,8,24", dotMin: 0.12, dotMax: 0.52};
  }
  function leeTema() { var t = "dark"; try { t = document.documentElement.getAttribute("data-theme") || "dark"; } catch (e) {} return t === "light" ? "light" : "dark"; }

  /* ---------- lienzo ---------- */
  function crea() {
    cv = document.createElement("canvas"); cv.id = "fondo"; cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block";
    var b = document.body; if (b.firstChild) b.insertBefore(cv, b.firstChild); else b.appendChild(cv);
    cx = cv.getContext("2d");
    bs = document.createElement("canvas"); bsx = bs.getContext("2d");
    var g = document.createElement("canvas"); g.width = g.height = 160; var gx = g.getContext("2d"), im = gx.createImageData(160, 160), d = im.data, i;
    for (i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.random() * 255; }
    gx.putImageData(im, 0, 0); gr = g;
    tamano();
  }
  var rt = 0;
  function tamano() {
    W = Math.max(320, window.innerWidth || 1280); H = Math.max(240, window.innerHeight || 800);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    bs.width = Math.ceil(W / 4); bs.height = Math.ceil(H / 4);
    iniciaRed(); relieveInit();
    pintaEstatico();
  }

  /* ---------- base: degradado + manchas ---------- */
  function base(t) {
    var sw = bs.width, sh = bs.height, i, b, g, px, py, r, gg;
    gg = bsx.createLinearGradient(0, 0, sw, sh); gg.addColorStop(0, P.c0); gg.addColorStop(0.5, P.c1); gg.addColorStop(1, P.c2);
    bsx.globalCompositeOperation = "source-over"; bsx.fillStyle = gg; bsx.fillRect(0, 0, sw, sh);
    for (i = 0; i < P.blobs.length; i++) {
      b = P.blobs[i];
      px = b[0] * sw + Math.sin(t / (17 + i * 5) + i * 2.1) * 0.07 * sw; py = b[1] * sh + Math.cos(t / (23 + i * 4) + i * 1.3) * 0.08 * sh; r = b[2] * Math.max(sw, sh);
      g = bsx.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, "rgba(" + b[3] + "," + b[4] + ")"); g.addColorStop(1, "rgba(" + b[3] + ",0)");
      bsx.fillStyle = g; bsx.fillRect(0, 0, sw, sh);
    }
    cx.globalAlpha = 1; cx.imageSmoothingEnabled = true; if (cx.imageSmoothingQuality) cx.imageSmoothingQuality = "high";
    cx.drawImage(bs, 0, 0, W, H);
  }
  function acabado() {
    var g = cx.createRadialGradient(W * 0.55, H * 0.45, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, "rgba(" + (P.osc ? "1,3,8" : P.vig) + ",0)"); g.addColorStop(1, "rgba(" + P.vig + "," + P.vigA + ")");
    cx.globalAlpha = 1; cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    if (gr) {
      var pt = cx.createPattern(gr, "repeat");
      if (pt) { cx.globalAlpha = P.granoA * (P.osc ? 1 : 0.8); cx.fillStyle = pt; cx.fillRect(0, 0, W, H); cx.globalAlpha = 1; }
    }
  }

  /* ---------- puntos por cubetas de opacidad ---------- */
  var NB = 6, bX = null, bY = null, bK = null;
  function bufs(n) { if (!bX || bX.length < n) { bX = new Float32Array(n); bY = new Float32Array(n); bK = new Int8Array(n); } }
  function dibujaPuntos(n, r, rgb, a0, a1) {
    var b, i;
    for (b = 0; b < NB; b++) {
      cx.beginPath(); var c = 0;
      for (i = 0; i < n; i++) if (bK[i] === b) { cx.moveTo(bX[i] + r, bY[i]); cx.arc(bX[i], bY[i], r, 0, TAU); c++; }
      if (c) { cx.fillStyle = "rgba(" + rgb + "," + (a0 + (a1 - a0) * (b + 0.5) / NB).toFixed(3) + ")"; cx.fill(); }
    }
  }
  function cub(a, a0, a1) { var k = Math.floor((a - a0) / (a1 - a0) * NB); return k < 0 ? 0 : k >= NB ? NB - 1 : k; }

  /* ---------- escena: mundo ---------- */
  function sMundo(t) {
    if (!M.ok) return;
    var mh = H * 1.04, mw = mh * 360 / 142, i, k, x, y, a, n = 0;
    var bxn = (BOL.lon + 180) / 360, byn = (84 - BOL.lat) / 142;
    var x0 = W * 0.64 - bxn * mw + Math.sin(t * 0.05) * mw * 0.04, y0 = H * 0.56 - byn * mh + Math.sin(t * 0.037) * H * 0.012;
    var bx = x0 + bxn * mw, by = y0 + byn * mh;
    // retícula tenue
    cx.lineWidth = 1; cx.strokeStyle = "rgba(" + P.lin + "," + (P.osc ? 0.055 : 0.08) + ")"; cx.beginPath();
    for (i = -150; i <= 150; i += 30) { x = x0 + (i + 180) / 360 * mw; for (k = -1; k <= 1; k++) { cx.moveTo(x + k * mw, 0); cx.lineTo(x + k * mw, H); } }
    for (i = -60; i <= 80; i += 20) { y = y0 + (84 - i) / 142 * mh; cx.moveTo(0, y); cx.lineTo(W, y); }
    cx.stroke();
    cx.strokeStyle = "rgba(" + P.acc + "," + (P.osc ? 0.12 : 0.16) + ")"; cx.setLineDash([2, 7]); cx.beginPath(); y = y0 + 84 / 142 * mh; cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); cx.setLineDash([]);
    // tierra
    bufs(M.n); var scan = (t * 0.011) % 1, r = Math.max(1.15, mh * 0.0021), d, kk;
    for (kk = -1; kk <= 1; kk++) {
      n = 0;
      for (i = 0; i < M.n; i++) {
        x = x0 + M.xn[i] * mw + kk * mw; if (x < -6 || x > W + 6) continue; y = y0 + M.yn[i] * mh; if (y < -6 || y > H + 6) continue;
        d = M.xn[i] - scan; d -= Math.round(d);
        a = P.dotMin + (P.dotMax - P.dotMin) * (0.38 + 0.2 * Math.sin(M.xn[i] * 31 + M.yn[i] * 17 + t * 0.7)) + (P.osc ? 0.2 : 0.16) * Math.exp(-(d * d) / 0.0012);
        bX[n] = x; bY[n] = y; bK[n] = cub(a, P.dotMin, P.dotMax + 0.12); n++;
      }
      dibujaPuntos(n, r, P.dot, P.dotMin, P.dotMax + 0.12);
    }
    if (!B.ok) return;
    // Bolivia: halo + puntos + contorno + anillos
    var g = cx.createRadialGradient(bx, by, 0, bx, by, mh * 0.12); g.addColorStop(0, "rgba(" + P.acc + "," + (P.osc ? 0.26 : 0.2) + ")"); g.addColorStop(1, "rgba(" + P.acc + ",0)");
    cx.fillStyle = g; cx.fillRect(bx - mh * 0.12, by - mh * 0.12, mh * 0.24, mh * 0.24);
    bufs(B.n); n = 0;
    for (i = 0; i < B.n; i++) { bX[n] = x0 + B.xn[i] * mw; bY[n] = y0 + B.yn[i] * mh; bK[n] = cub(0.55 + 0.25 * Math.sin(t * 1.2 + i * 0.37), 0.3, 0.9); n++; }
    dibujaPuntos(n, Math.max(0.7, mh * 0.0011), P.acc, 0.3, 0.9);
    if (C.ok) { trazaContorno(function (lo, la) { return [x0 + (lo + 180) / 360 * mw, y0 + (84 - la) / 142 * mh]; }, 0.14, 5, 0.75, 1.3); }
    var p, ph;
    for (i = 0; i < 2; i++) { ph = ((t / 3.6) + i * 0.5) % 1; p = ph * mh * 0.13; cx.beginPath(); cx.arc(bx, by, p, 0, TAU); cx.strokeStyle = "rgba(" + P.acc + "," + ((1 - ph) * (1 - ph) * 0.55).toFixed(3) + ")"; cx.lineWidth = 1.3; cx.stroke(); }
    cx.beginPath(); cx.arc(bx, by, 2.4, 0, TAU); cx.fillStyle = "rgba(" + P.acc + ",0.95)"; cx.fill();
  }
  function trazaContorno(proy, aHalo, wHalo, aLin, wLin) {
    var i, q;
    cx.beginPath(); for (i = 0; i < C.n; i++) { q = proy(C.lon[i], C.lat[i]); if (!q) { continue; } if (i === 0 || q.corte) cx.moveTo(q[0], q[1]); else cx.lineTo(q[0], q[1]); }
    cx.closePath(); cx.lineJoin = "round"; cx.strokeStyle = "rgba(" + P.acc + "," + aHalo + ")"; cx.lineWidth = wHalo; cx.stroke();
    cx.strokeStyle = "rgba(" + P.acc + "," + aLin + ")"; cx.lineWidth = wLin; cx.stroke();
  }

  /* ---------- escena: globo ---------- */
  function sGlobo(t) {
    if (!E.ok) return;
    var R = Math.min(H * 0.58, W * 0.34), gx = W * 0.7, gy = H * 0.54, i, j, a, g;
    var l0 = (-64 + 38 * Math.sin(t * 0.085)) * RAD, p0 = (-12 + 5 * Math.sin(t * 0.06 + 1)) * RAD, sp = Math.sin(p0), cp = Math.cos(p0);
    var acc = P.acc;
    // atmósfera
    g = cx.createRadialGradient(gx, gy, R * 0.92, gx, gy, R * 1.32); g.addColorStop(0, "rgba(" + acc + "," + (P.osc ? 0.2 : 0.16) + ")"); g.addColorStop(0.35, "rgba(" + acc + "," + (P.osc ? 0.06 : 0.05) + ")"); g.addColorStop(1, "rgba(" + acc + ",0)");
    cx.fillStyle = g; cx.beginPath(); cx.arc(gx, gy, R * 1.32, 0, TAU); cx.fill();
    orbita(t, gx, gy, R, false);
    // cuerpo
    g = cx.createRadialGradient(gx - R * 0.32, gy - R * 0.36, R * 0.05, gx, gy, R);
    g.addColorStop(0, "rgba(" + P.esf0 + "," + (P.osc ? 0.26 : 0.55) + ")"); g.addColorStop(0.6, "rgba(" + (P.osc ? "14,48,118" : "200,222,248") + "," + (P.osc ? 0.12 : 0.28) + ")"); g.addColorStop(1, "rgba(" + P.esf1 + "," + (P.osc ? 0.5 : 0.22) + ")");
    cx.fillStyle = g; cx.beginPath(); cx.arc(gx, gy, R, 0, TAU); cx.fill();
    // retícula
    cx.lineWidth = 1; cx.strokeStyle = "rgba(" + P.lin + "," + (P.osc ? 0.1 : 0.13) + ")"; cx.beginPath();
    var lat, lon, cz, x, y, ab;
    function pr(lo, la) { var dl = lo - l0, cl = Math.cos(la); cz = sp * Math.sin(la) + cp * cl * Math.cos(dl); x = gx + R * cl * Math.sin(dl); y = gy - R * (cp * Math.sin(la) - sp * cl * Math.cos(dl)); return cz > 0.01; }
    for (lon = -180; lon < 180; lon += 20) { ab = false; for (lat = -80; lat <= 80; lat += 5) { if (pr(lon * RAD, lat * RAD)) { if (!ab) { cx.moveTo(x, y); ab = true; } else cx.lineTo(x, y); } else ab = false; } }
    for (lat = -60; lat <= 80; lat += 20) { ab = false; for (lon = -180; lon <= 180; lon += 5) { if (pr(lon * RAD, lat * RAD)) { if (!ab) { cx.moveTo(x, y); ab = true; } else cx.lineTo(x, y); } else ab = false; } }
    cx.stroke();
    // tierra
    bufs(E.n); var n = 0, dl, cl, cz2, rr = Math.max(1.1, R * 0.0034);
    for (i = 0; i < E.n; i++) {
      dl = E.lon[i] - l0; cl = E.cl[i] * Math.cos(dl); cz2 = sp * E.sl[i] + cp * cl; if (cz2 < 0.03) continue;
      bX[n] = gx + R * E.cl[i] * Math.sin(dl); bY[n] = gy - R * (cp * E.sl[i] - sp * cl); a = P.dotMin * 0.6 + (P.dotMax - P.dotMin * 0.6) * Math.pow(cz2, 0.8) * (0.8 + 0.2 * Math.sin(E.lon[i] * 9 + E.lat[i] * 7 + t * 0.8)); bK[n] = cub(a, P.dotMin * 0.5, P.dotMax + 0.1); n++;
    }
    dibujaPuntos(n, rr, P.dot, P.dotMin * 0.5, P.dotMax + 0.1);
    // Bolivia
    if (B.ok) {
      n = 0; bufs(B.n);
      for (i = 0; i < B.n; i++) { dl = B.lr[i] - l0; cl = B.cl[i] * Math.cos(dl); cz2 = sp * B.sl[i] + cp * cl; if (cz2 < 0.05) continue; bX[n] = gx + R * B.cl[i] * Math.sin(dl); bY[n] = gy - R * (cp * B.sl[i] - sp * cl); bK[n] = cub((0.45 + 0.2 * Math.sin(t * 1.2 + i * 0.37)) * Math.min(1, cz2 * 1.6), 0.15, 0.9); n++; }
      dibujaPuntos(n, Math.max(0.7, R * 0.0021), acc, 0.15, 0.9);
      if (C.ok) trazaContorno(function (lo, la) { var l2 = lo * RAD, a2 = la * RAD; if (!pr(l2, a2)) return null; return [x, y]; }, 0.14, 5, 0.75, 1.3);
      var bl = BOL.lon * RAD, ba = BOL.lat * RAD, k, ph, rho, bg, la2, lo2;
      if (pr(bl, ba)) {
        var bxx = x, byy = y;
        for (k = 0; k < 2; k++) {
          ph = ((t / 3.6) + k * 0.5) % 1; rho = ph * 0.24; cx.beginPath(); var ok = false;
          for (bg = 0; bg <= 360; bg += 10) { var b = bg * RAD; la2 = Math.asin(Math.sin(ba) * Math.cos(rho) + Math.cos(ba) * Math.sin(rho) * Math.cos(b)); lo2 = bl + Math.atan2(Math.sin(b) * Math.sin(rho) * Math.cos(ba), Math.cos(rho) - Math.sin(ba) * Math.sin(la2)); if (pr(lo2, la2)) { if (!ok) { cx.moveTo(x, y); ok = true; } else cx.lineTo(x, y); } else ok = false; }
          cx.strokeStyle = "rgba(" + acc + "," + ((1 - ph) * (1 - ph) * 0.6).toFixed(3) + ")"; cx.lineWidth = 1.3; cx.stroke();
        }
        cx.beginPath(); cx.arc(bxx, byy, 2.4, 0, TAU); cx.fillStyle = "rgba(" + acc + ",0.95)"; cx.fill();
      }
    }
    // borde
    g = cx.createRadialGradient(gx, gy, R * 0.86, gx, gy, R); g.addColorStop(0, "rgba(" + acc + ",0)"); g.addColorStop(1, "rgba(" + acc + "," + (P.osc ? 0.2 : 0.16) + ")");
    cx.fillStyle = g; cx.beginPath(); cx.arc(gx, gy, R, 0, TAU); cx.fill();
    cx.strokeStyle = "rgba(" + acc + "," + (P.osc ? 0.34 : 0.3) + ")"; cx.lineWidth = 1; cx.beginPath(); cx.arc(gx, gy, R, 0, TAU); cx.stroke();
    orbita(t, gx, gy, R, true);
  }
  function orbita(t, gx, gy, R, frente) {
    var rx = R * 1.3, ry = R * 0.3, rot = -0.3, i, th, x, y, c = Math.cos(rot), s = Math.sin(rot), ok = false;
    cx.beginPath();
    for (i = 0; i <= 120; i++) {
      th = i / 120 * TAU; if ((Math.sin(th) > 0) !== frente) { ok = false; continue; }
      x = rx * Math.cos(th); y = ry * Math.sin(th); var X = gx + x * c - y * s, Y = gy + x * s + y * c;
      if (!ok) { cx.moveTo(X, Y); ok = true; } else cx.lineTo(X, Y);
    }
    cx.strokeStyle = "rgba(" + P.lin + "," + (P.osc ? 0.16 : 0.2) + ")"; cx.lineWidth = 1; cx.stroke();
    th = (t * 0.16) % TAU; if ((Math.sin(th) > 0) === frente) {
      for (i = 0; i < 26; i++) { var q = th - i * 0.012; x = rx * Math.cos(q); y = ry * Math.sin(q); cx.beginPath(); cx.arc(gx + x * c - y * s, gy + x * s + y * c, 1.8 * (1 - i / 26) + 0.3, 0, TAU); cx.fillStyle = "rgba(" + P.acc + "," + (0.55 * (1 - i / 26)).toFixed(3) + ")"; cx.fill(); }
    }
  }

  /* ---------- escena: relieve (curvas de nivel) ---------- */
  var HX = 0, HY = 0, CS = 18, FLD = null;
  function relieveInit() { CS = Math.max(14, Math.round(Math.max(W, H) / 85)); HX = Math.ceil(W / CS) + 1; HY = Math.ceil(H / CS) + 1; FLD = new Float32Array(HX * HY); }
  function hsh(ix, iy) { var h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vn(x, y) { var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), a = hsh(ix, iy), b = hsh(ix + 1, iy), c = hsh(ix, iy + 1), d = hsh(ix + 1, iy + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
  function fbm(x, y) { return 0.5 * vn(x, y) + 0.25 * vn(x * 2.03 + 7.1, y * 2.03 - 3.3) + 0.125 * vn(x * 4.1 - 5.7, y * 4.1 + 1.9) + 0.0625 * vn(x * 8.3 + 2.2, y * 8.3 - 8.4); }
  function sRelieve(t) {
    if (!FLD) return;
    var gx, gy, u, v, p, q, f, rr, i = 0, ca = Math.cos(-0.52), sa = Math.sin(-0.52), sc = Math.max(W, H), tt = t * 0.012;
    for (gy = 0; gy < HY; gy++) for (gx = 0; gx < HX; gx++) {
      u = gx * CS / sc * 2.1; v = gy * CS / sc * 2.1; p = u * ca + v * sa; q = -u * sa + v * ca;
      rr = 1 - Math.abs(2 * fbm(p * 1.5 + tt, q * 0.75 - tt * 0.6 + 4) - 1);
      f = 0.5 * fbm(u * 1.9 + tt * 1.3, v * 1.9 - tt) + 0.32 * rr * rr + 0.85 * Math.exp(-Math.pow(q - 0.62 - 0.1 * Math.sin(p * 2.3 + t * 0.03), 2) / 0.07);
      FLD[i++] = f;
    }
    var STEP = 0.062, cl, c00, c10, c11, c01, mn, mx, L, l0, l1, idx, k, x0, y0, tA, tB, tC, tD;
    var mp = new Path2D(), Mp = new Path2D();
    for (gy = 0; gy < HY - 1; gy++) for (gx = 0; gx < HX - 1; gx++) {
      c00 = FLD[gy * HX + gx]; c10 = FLD[gy * HX + gx + 1]; c11 = FLD[(gy + 1) * HX + gx + 1]; c01 = FLD[(gy + 1) * HX + gx];
      mn = Math.min(c00, c10, c11, c01); mx = Math.max(c00, c10, c11, c01);
      l0 = Math.ceil(mn / STEP); l1 = Math.floor(mx / STEP); x0 = gx * CS; y0 = gy * CS;
      for (k = l0; k <= l1; k++) {
        L = k * STEP; idx = (c00 > L ? 8 : 0) | (c10 > L ? 4 : 0) | (c11 > L ? 2 : 0) | (c01 > L ? 1 : 0); if (idx === 0 || idx === 15) continue;
        tA = x0 + CS * (L - c00) / (c10 - c00); tB = y0 + CS * (L - c10) / (c11 - c10); tC = x0 + CS * (L - c01) / (c11 - c01); tD = y0 + CS * (L - c00) / (c01 - c00);
        var pa = (k % 4 === 0) ? Mp : mp, X1, Y1, X2, Y2, X3, Y3, X4, Y4;
        // bordes: arriba (tA,y0), derecha (x0+CS,tB), abajo (tC,y0+CS), izquierda (x0,tD)
        switch (idx) {
          case 1: case 14: pa.moveTo(x0, tD); pa.lineTo(tC, y0 + CS); break;
          case 2: case 13: pa.moveTo(tC, y0 + CS); pa.lineTo(x0 + CS, tB); break;
          case 3: case 12: pa.moveTo(x0, tD); pa.lineTo(x0 + CS, tB); break;
          case 4: case 11: pa.moveTo(tA, y0); pa.lineTo(x0 + CS, tB); break;
          case 5: pa.moveTo(x0, tD); pa.lineTo(tA, y0); pa.moveTo(tC, y0 + CS); pa.lineTo(x0 + CS, tB); break;
          case 6: case 9: pa.moveTo(tA, y0); pa.lineTo(tC, y0 + CS); break;
          case 7: case 8: pa.moveTo(x0, tD); pa.lineTo(tA, y0); break;
          case 10: pa.moveTo(tA, y0); pa.lineTo(x0 + CS, tB); pa.moveTo(x0, tD); pa.lineTo(tC, y0 + CS); break;
        }
      }
    }
    cx.lineJoin = "round"; cx.lineCap = "round";
    cx.strokeStyle = "rgba(" + P.lin + "," + (P.osc ? 0.13 : 0.2) + ")"; cx.lineWidth = 1; cx.stroke(mp);
    cx.strokeStyle = "rgba(" + P.acc + "," + (P.osc ? 0.3 : 0.32) + ")"; cx.lineWidth = 1.35; cx.stroke(Mp);
    // foco suave sobre la cordillera
    var g = cx.createRadialGradient(W * 0.72, H * 0.4, 0, W * 0.72, H * 0.4, Math.max(W, H) * 0.55); g.addColorStop(0, "rgba(" + P.acc + "," + (P.osc ? 0.06 : 0.05) + ")"); g.addColorStop(1, "rgba(" + P.acc + ",0)");
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  }

  /* ---------- escena: red de nodos y señales ---------- */
  var NODOS = [], SEN = [], MAXD = 150;
  function iniciaRed() {
    var n = Math.max(30, Math.min(95, Math.round(W * H / 17000))), i, s = 12345;
    function rnd() { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }
    NODOS = []; SEN = [];
    for (i = 0; i < n; i++) NODOS.push({x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 9, vy: (rnd() - 0.5) * 9, hub: rnd() < 0.1, ph: rnd() * TAU});
    MAXD = 1.55 * Math.sqrt(W * H / n);
    for (i = 0; i < 34; i++) SEN.push({a: (rnd() * n) | 0, b: -1, p: rnd(), v: 0.22 + rnd() * 0.3});
  }
  var tPrevRed = 0;
  function sRed(t) {
    var n = NODOS.length, i, j, a, b, d, dt = Math.min(0.1, Math.max(0, t - tPrevRed)); tPrevRed = t; if (dt > 0.1 || dt <= 0) dt = 0.033;
    for (i = 0; i < n; i++) { a = NODOS[i]; a.x += a.vx * dt; a.y += a.vy * dt; if (a.x < -20) a.x = W + 20; else if (a.x > W + 20) a.x = -20; if (a.y < -20) a.y = H + 20; else if (a.y > H + 20) a.y = -20; }
    cx.lineWidth = 1;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      a = NODOS[i]; b = NODOS[j]; d = Math.hypot(a.x - b.x, a.y - b.y); if (d > MAXD) continue;
      cx.strokeStyle = "rgba(" + P.lin + "," + ((1 - d / MAXD) * (P.osc ? 0.2 : 0.26)).toFixed(3) + ")"; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
    }
    for (i = 0; i < n; i++) {
      a = NODOS[i]; var r = a.hub ? 3.1 : 1.7, al = 0.4 + 0.25 * Math.sin(t * 0.9 + a.ph);
      if (a.hub) { var g = cx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 22); g.addColorStop(0, "rgba(" + P.acc + ",0.28)"); g.addColorStop(1, "rgba(" + P.acc + ",0)"); cx.fillStyle = g; cx.beginPath(); cx.arc(a.x, a.y, 22, 0, TAU); cx.fill(); }
      cx.beginPath(); cx.arc(a.x, a.y, r, 0, TAU); cx.fillStyle = "rgba(" + (a.hub ? P.acc : P.dot) + "," + (a.hub ? 0.85 : al).toFixed(3) + ")"; cx.fill();
    }
    for (i = 0; i < SEN.length; i++) {
      var s = SEN[i], A = NODOS[s.a], Bn, cand;
      if (s.b < 0 || !NODOS[s.b] || Math.hypot(A.x - NODOS[s.b].x, A.y - NODOS[s.b].y) > MAXD) {
        cand = []; for (j = 0; j < n; j++) if (j !== s.a && Math.hypot(A.x - NODOS[j].x, A.y - NODOS[j].y) < MAXD) cand.push(j);
        if (!cand.length) { s.a = (Math.random() * n) | 0; s.b = -1; continue; } s.b = cand[(Math.random() * cand.length) | 0]; s.p = 0;
      }
      Bn = NODOS[s.b]; s.p += s.v * dt;
      if (s.p >= 1) { s.a = s.b; s.b = -1; continue; }
      var sx = A.x + (Bn.x - A.x) * s.p, sy = A.y + (Bn.y - A.y) * s.p, tx = A.x + (Bn.x - A.x) * Math.max(0, s.p - 0.16), ty = A.y + (Bn.y - A.y) * Math.max(0, s.p - 0.16);
      var lg = cx.createLinearGradient(tx, ty, sx, sy); lg.addColorStop(0, "rgba(" + P.acc + ",0)"); lg.addColorStop(1, "rgba(" + P.acc + ",0.8)");
      cx.strokeStyle = lg; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(tx, ty); cx.lineTo(sx, sy); cx.stroke();
      cx.beginPath(); cx.arc(sx, sy, 2, 0, TAU); cx.fillStyle = "rgba(" + P.acc + ",0.95)"; cx.fill();
    }
  }

  /* ---------- composición ---------- */
  var DIB = {mundo: sMundo, globo: sGlobo, relieve: sRelieve, red: sRed};
  function disponibles() { var o = [], i; for (i = 0; i < ESC_TODAS.length; i++) { var e = ESC_TODAS[i]; if ((e === "mundo" && !M.ok) || (e === "globo" && !E.ok)) continue; o.push(e); } return o.length ? o : ["relieve"]; }
  function activa(ms) {
    var lst = disponibles(), N = lst.length, r = {a: null, fa: 1, b: null, fb: 0};
    if (modo === "off") return r;
    if (modo === "auto") {
      var pos = ms % (PERIODO * N), idx = Math.floor(pos / PERIODO), ph = pos - idx * PERIODO, f = ph > PERIODO - FUNDIDO ? (ph - (PERIODO - FUNDIDO)) / FUNDIDO : 0;
      f = f * f * (3 - 2 * f); r.a = lst[idx]; r.fa = 1 - f; if (f > 0 && N > 1) { r.b = lst[(idx + 1) % N]; r.fb = f; }
      return r;
    }
    var m = (modo === "mundo" && !M.ok) || (modo === "globo" && !E.ok) ? "relieve" : modo, k = Math.min(1, (ms - tCambio) / 900);
    r.a = m; r.fa = 1;
    if (prevModo && k < 1 && prevModo !== m) { var pm = prevModo === "auto" ? lst[0] : prevModo; r.b = pm; r.fb = 1 - k * k * (3 - 2 * k); r.fa = 1; }
    return r;
  }
  function dibuja(ms, quieto) {
    if (!cx) return;
    try {
      var t = (ms % 1000000) / 1000; cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = "source-over";
      base(t); var s = activa(ms);
      if (s.b && s.fb > 0.001) { cx.globalAlpha = s.fb; cx.save(); try { DIB[s.b](t); } finally { cx.restore(); } }
      if (s.a) { cx.globalAlpha = s.fa; cx.save(); try { DIB[s.a](t); } finally { cx.restore(); } }
      cx.globalAlpha = 1; acabado();
    } catch (e) { if (errores++ < 3 && window.console) console.warn("fondo:", e && e.message); }
  }
  function pintaEstatico() { if (!cx) return; if (reducido || modo === "off" || !raf) dibuja(estaticoMs(), true); }
  function estaticoMs() { return reducido && modo === "auto" ? PERIODO * 0.35 + 0 : Date.now(); }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 30) return; last = now; dibuja(Date.now());
  }
  function arranca() { if (raf || reducido || modo === "off" || document.hidden) return; last = 0; raf = requestAnimationFrame(frame); }
  function para() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ---------- API ---------- */
  function guarda() { try { localStorage.setItem("sala_fondo", modo); } catch (e) {} }
  function set(m) {
    if (MODOS.indexOf(m) < 0 || m === modo) return modo;
    prevModo = modo; tCambio = Date.now(); modo = m; guarda();
    if (modo === "off") { para(); dibuja(Date.now(), true); } else { arranca(); if (!raf) dibuja(estaticoMs(), true); }
    return modo;
  }
  function inicia() {
    try { var g = localStorage.getItem("sala_fondo"); if (g && MODOS.indexOf(g) >= 0) modo = g; } catch (e) {}
    try { reducido = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
    tema = leeTema(); paleta(); decodifica(); crea();
    var rz = 0; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(tamano, 120); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) para(); else arranca(); });
    if (window.MutationObserver) new MutationObserver(function () { var t = leeTema(); if (t !== tema) { tema = t; paleta(); pintaEstatico(); } }).observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]});
    if (reducido || modo === "off") dibuja(estaticoMs(), true); else arranca();
  }
  window.FONDO = {set: set, modo: function () { return modo; }, escenas: ESC_TODAS.slice(), modos: MODOS.slice()};
  if (document.body) inicia(); else document.addEventListener("DOMContentLoaded", inicia);
})();

/* Sala de Situación Bolivia 2.0 — núcleo compartido (cabecera, datos, gráficos, guía) */
(function () { var t = "dark"; try { t = localStorage.getItem("sala_theme") || "dark"; } catch (e) {} document.documentElement.setAttribute("data-theme", t); })();
var S2 = (function () {
  var S = SALA;
  var P = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
    fire: '<path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    dl: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    wave: '<path d="M2 12c2.5-4 5-4 7.5 0s5 4 7.5 0 3-3 5-2M2 18c2.5-4 5-4 7.5 0s5 4 7.5 0 3-3 5-2"/>',
    pulse: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
    virus: '<circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    car: '<path d="M5 17V12l2-5h10l2 5v5M3 17h18M7.5 13.5h.01M16.5 13.5h.01M6 17v2M18 17v2"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    mount: '<path d="M2 20l7-12 4 7 3-4 6 9z"/>',
    heart: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/>'
  };
  function ic(n, c) { return '<svg viewBox="0 0 24 24" fill="none" stroke="' + (c || "currentColor") + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (P[n] || "") + '</svg>'; }
  var CATICON = {"geológica": "mount", "meteorológica": "sun", "hidrológica": "water", "climatológica": "fire", "biológica": "virus", "tecnológica": "bolt", "antropogénica": "car"};
  var NIVCOL = ["#2e9e5b", "#f5b700", "#f26a1b", "#d7263d"];
  var NIVTXT = ["Verde", "Amarilla", "Naranja", "Roja"];

  function header(activo, tabs) {
    var nav = [["index.html", "Tablero", "home", "Pantalla principal con todos los eventos"], ["informes.html", "Informes", "doc", "Informe de un hecho puntual (sismo, accidente, brote) o consolidado por período"], ["tema.html", "Informe por tema", "doc", "Escribir un tema (sarampión, dengue, accidente…) y obtener un informe con gráficos, confianza y PDF"], ["fuentes.html", "Fuentes", "db", "De dónde vienen los datos y si cada fuente funciona"]];
    var h = '<div class="hdr"><div class="hdr-row"><div class="logo"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg></div>' +
      '<div><h1>Sala de Situación · Bolivia</h1><div class="sub">Vigilancia de eventos con datos abiertos · actualización automática cada 30 min</div></div><span class="live off" id="live"><i></i><span id="liveT">cargando…</span></span><span class="sp"></span>' +
      nav.map(function (n) { return '<a class="btn w s" data-tip="' + n[3] + '" href="' + n[0] + '" style="' + (activo === n[0] ? "background:rgba(255,255,255,.3)" : "") + '">' + ic(n[2]) + n[1] + '</a>'; }).join("") +
      '<button class="btn w s themebtn" id="btnTema" data-tip="Cambiar entre tablero oscuro y claro">' + ic("sun") + (document.documentElement.getAttribute("data-theme") === "dark" ? "Modo claro" : "Modo oscuro") + '</button>' +
      '<button class="btn w s" id="btnTour" data-tip="Recorrido guiado de 1 minuto (opcional)">' + ic("help") + 'Guía de uso</button></div>';
    if (tabs) h += '<div class="tabs" id="tabs">' + tabs.map(function (t, i) { return '<button class="tab' + (i ? "" : " on") + '" data-t="' + t[0] + '" data-tip="' + (t[3] || "") + '">' + ic(t[2]) + t[1] + '</button>'; }).join("") + '</div>';
    document.getElementById("hdr").innerHTML = h + '</div>'; if (!window.__tips) { window.__tips = 1; tips(); }
    var bt = document.getElementById("btnTema"); if (bt) bt.onclick = function () { var n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; try { localStorage.setItem("sala_theme", n); } catch (e) {} location.reload(); };
  }
  function tips() {
    var el = document.createElement("div"); el.className = "tipbox"; document.body.appendChild(el);
    function ocultar() { el.style.display = "none"; }
    document.addEventListener("mouseover", function (e) {
      var t = e.target.closest && e.target.closest("[data-tip]"); if (!t || !t.dataset.tip) return ocultar();
      el.textContent = t.dataset.tip; el.style.display = "block";
      var r = t.getBoundingClientRect(), w = el.offsetWidth, x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8), y = r.bottom + 10;
      if (y + el.offsetHeight > innerHeight - 8) y = r.top - el.offsetHeight - 10; el.style.left = x + "px"; el.style.top = y + "px";
    });
    document.addEventListener("mouseout", function (e) { if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest("[data-tip]"))) ocultar(); });
    document.addEventListener("scroll", ocultar, true); document.addEventListener("click", ocultar, true);
  }
  function ago(ms) { var m = Math.round((Date.now() - ms) / 60000); if (m < 1) return "hace instantes"; if (m < 60) return "hace " + m + " min"; if (m < 2880) return "hace " + Math.round(m / 60) + " h"; return "hace " + Math.round(m / 1440) + " días"; }
  function live(ms) { var el = document.getElementById("live"); if (!el || !ms) return; var v = (Date.now() - ms) < 3 * 3600e3; el.className = "live" + (v ? "" : " off"); document.getElementById("liveT").textContent = "Datos " + ago(ms); el.title = "Última actualización: " + S.fecha(ms) + " (hora La Paz)"; }

  function opt(p) { return S.cargar(p).catch(function () { return null; }); }
  function datos() {
    var k = ["eventos_unificados", "transito", "data", "focos_puntos", "focos_complejos", "sequia", "caudales", "sismos_oficiales", "senamhi_alertas", "epidemio_oficial", "focos_propension", "focos_detectados", "estado_fuentes"];
    return Promise.all(k.map(function (n) { return opt(n + ".json"); }).concat([opt("geo_dep.geojson"), opt("geo_mun.geojson")])).then(function (r) {
      var o = {}; k.forEach(function (n, i) { o[n] = r[i]; }); o.geoDep = r[k.length]; o.geoMun = r[k.length + 1]; o.ev = (o.eventos_unificados && o.eventos_unificados.eventos) || []; return o;
    });
  }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  var CH = [];
  function chart(el, option, h) {
    if (typeof el === "string") el = document.getElementById(el); if (!el) return null;
    var dark = document.documentElement.getAttribute("data-theme") === "dark", ink = css("--ink") || "#0f1b2d", mut = css("--mut") || "#5b6b82", line = css("--line") || "#e1e7f0";
    var c = echarts.init(el, null, {renderer: "canvas"});
    var base = {textStyle: {fontFamily: "Inter,system-ui,sans-serif", color: ink}, animationDuration: 600, tooltip: {confine: true, backgroundColor: dark ? "#1b2433" : "#fff", borderColor: line, textStyle: {color: ink, fontSize: 12.5}}, legend: {textStyle: {color: mut}, type: "scroll"}};
    Object.keys(option).forEach(function (k) { base[k] = option[k]; });
    [].concat(base.xAxis || [], base.yAxis || []).forEach(function (a) { a.axisLabel = Object.assign({color: mut}, a.axisLabel || {}); a.axisLine = a.axisLine || {lineStyle: {color: line}}; a.splitLine = a.splitLine || {lineStyle: {color: line, opacity: .7}}; });
    if (base.legend && !base.legend.textStyle) base.legend.textStyle = {color: ink}; if (base.legend && !base.legend.type) base.legend.type = "scroll";
    c.setOption(base); CH.push(c); return c;
  }
  window.addEventListener("resize", function () { CH.forEach(function (c) { try { c.resize(); } catch (e) {} }); });
  window.addEventListener("beforeprint", function () { CH.forEach(function (c) { try { c.resize({width: "auto"}); } catch (e) {} }); });
  try { matchMedia("print").addListener(function () { CH.forEach(function (c) { try { c.resize(); } catch (e) {} }); }); } catch (e) {}
  function resizeAll() { setTimeout(function () { CH.forEach(function (c) { try { c.resize(); } catch (e) {} }); }, 30); }

  function confBadge(e) {
    var c = e && e.confianza; if (!c) return "";
    var cl = {Alta: "ba", Media: "bm", Baja: "bb"}[c.nivel] || "bb";
    return '<span class="badge ' + cl + '" title="Triangulación: ' + S.esc((c.familias || []).join(" + ")) + (c.medios > 1 ? " · " + c.medios + " medios" : "") + '">Confianza ' + c.nivel.toLowerCase() + '</span>';
  }
  function badgeOrigen(e) {
    var o = e.origen;
    if (o === "prensa") return '<span class="badge bp">Prensa · preliminar</span>';
    if (o === "foco") return '<span class="badge bo">Satélite NASA FIRMS</span>';
    if (o === "modelo" || o === "sequia" || o === "caudal") return '<span class="badge bn">Modelo abierto · indicador</span>';
    if (o === "gdacs" || o === "usgs") return '<span class="badge bo">Sistema internacional</span>';
    return '<span class="badge bo">Fuente oficial</span>';
  }
  function nivBadge(e) { return S.badgeNivel(e); }
  function catChip(c) { return '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:' + (S.COLCAT[c] || "#999") + '"></span>' + S.esc(c) + '</span>'; }

  /* guía interactiva */
  function tour(steps) {
    var i = 0, bg, hl, box;
    function fin() { [bg, hl, box].forEach(function (x) { x && x.remove(); }); try { localStorage.setItem("sala_tour", "1"); } catch (e) {} }
    function paso() {
      var s = steps[i], el = s.sel && document.querySelector(s.sel);
      if (s.antes) s.antes();
      setTimeout(function () {
        el = s.sel && document.querySelector(s.sel);
        if (el) el.scrollIntoView({block: "center", behavior: "instant"});
        var r = el ? el.getBoundingClientRect() : null;
        if (!hl) { bg = document.createElement("div"); hl = document.createElement("div"); hl.className = "tour-hl"; box = document.createElement("div"); box.className = "tour-box"; document.body.appendChild(hl); document.body.appendChild(box); }
        if (r) { hl.style.cssText = "left:" + (r.left - 6) + "px;top:" + (r.top - 6) + "px;width:" + (r.width + 12) + "px;height:" + (r.height + 12) + "px"; } else { hl.style.cssText = "left:50%;top:40%;width:0;height:0"; }
        box.innerHTML = '<h3>' + S.esc(s.t) + '</h3><p>' + s.x + '</p><div class="row"><span class="st">' + (i + 1) + ' de ' + steps.length + '</span><button class="btn s" id="tSalir">Salir</button>' + (i ? '<button class="btn s" id="tAnt">Anterior</button>' : '') + '<button class="btn p s" id="tSig">' + (i < steps.length - 1 ? "Siguiente" : "Terminar") + '</button></div>';
        var bw = Math.min(380, innerWidth - 24), top = r ? (r.bottom + 14 + 230 < innerHeight ? r.bottom + 14 : Math.max(12, r.top - 14 - 210)) : innerHeight * .3, left = r ? Math.min(Math.max(12, r.left), innerWidth - bw - 12) : (innerWidth - bw) / 2;
        box.style.cssText = "width:" + bw + "px;left:" + left + "px;top:" + top + "px";
        document.getElementById("tSalir").onclick = fin; document.getElementById("tSig").onclick = function () { if (i < steps.length - 1) { i++; paso(); } else fin(); };
        var a = document.getElementById("tAnt"); if (a) a.onclick = function () { i--; paso(); };
      }, s.antes ? 250 : 0);
    }
    paso();
  }
  function descargarXlsx(nombre, filas, hoja) {
    function go() { var ws = XLSX.utils.json_to_sheet(filas), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, hoja || "Datos"); XLSX.writeFile(wb, nombre); }
    if (window.XLSX) return go(); var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = go; s.onerror = function () { alert("No se pudo cargar el generador de Excel. Use CSV."); }; document.head.appendChild(s);
  }
  function filasXls(evs) { return evs.map(function (e) { return {ID: e.id, "Fecha (La Paz)": S.fecha(e.ts), Origen: S.ORIGEN[e.origen] || e.origen, Categoría: e.categoria, Título: e.titulo, Nivel: e.nivel_txt, Oficial: e.oficial ? "sí" : "no", Confianza: e.confianza ? e.confianza.nivel : "", Lugar: e.lugar, Departamentos: (e.departamentos || []).join("; "), Latitud: e.lat, Longitud: e.lon, Fuente: e.fuente, Enlace: e.url, Detalle: (e.detalle || "").slice(0, 500)}; }); }
  return {tips: tips, S: S, ic: ic, CATICON: CATICON, NIVCOL: NIVCOL, NIVTXT: NIVTXT, header: header, live: live, ago: ago, datos: datos, chart: chart, resizeAll: resizeAll, confBadge: confBadge, badgeOrigen: badgeOrigen, nivBadge: nivBadge, catChip: catChip, tour: tour, descargarXlsx: descargarXlsx, filasXls: filasXls, css: css};
})();

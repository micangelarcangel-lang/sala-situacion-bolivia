/* Selector "Dónde" común a todos los módulos: Todo Bolivia → departamento → municipio. Estado en la URL (?d=&m=). */
var LUGAR = (function () {
  var S = SALA;
  function esc(s) { return S.esc(s == null ? "" : String(s)); }
  function bboxG(g) { var b = [180, 90, -180, -90]; (function rec(c) { if (typeof c[0] === "number") b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; else c.forEach(rec); })(g.coordinates); return b; }
  function feat(T, st) {
    if (st.m && T.M[st.d + "|" + st.m]) return T.M[st.d + "|" + st.m].f;
    if (st.d) return (T.D.geoDep.features || []).filter(function (f) { return f.properties.n === st.d; })[0] || null;
    return null;
  }
  function init(T, box, st, cb) {
    var P = new URLSearchParams(location.search), deps = Object.keys(T.DEP).sort();
    st.d = T.DEP[P.get("d")] ? P.get("d") : ""; st.m = st.d && T.M[st.d + "|" + P.get("m")] ? P.get("m") : "";
    box.innerHTML = '<b>Dónde</b><div style="display:flex;gap:6px;flex-wrap:wrap"><select id="lgD"><option value="">Todo Bolivia</option>' + deps.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join("") + '</select><select id="lgM"></select></div><div class="lgl" id="lgL"></div>';
    var D = document.getElementById("lgD"), M = document.getElementById("lgM");
    function llena() {
      M.innerHTML = '<option value="">' + (st.d ? "Todos los municipios" : "— elija un departamento —") + '</option>' + (st.d ? T.DEP[st.d].map(function (m) { return m.n; }).sort(function (a, b) { return a.localeCompare(b, "es"); }).map(function (n) { return '<option>' + esc(n) + '</option>'; }).join("") : ""); M.disabled = !st.d; M.value = st.m; D.value = st.d;
      var tn = document.querySelector(".tnav"); var cur = tn && tn.querySelector("b");
      if (cur) { cur.setAttribute("data-b", cur.getAttribute("data-b") || cur.textContent); var base = cur.getAttribute("data-b"); cur.innerHTML = st.d ? '<a href="' + location.pathname.split("/").pop() + '">' + esc(base) + '</a>' : esc(base); var nx = tn.querySelectorAll(".lgc"); [].forEach.call(nx, function (x) { x.remove(); }); if (st.d) cur.insertAdjacentHTML("afterend", '<span class="tsep lgc">›</span>' + (st.m ? '<a class="lgc" href="' + location.pathname.split("/").pop() + '?d=' + encodeURIComponent(st.d) + '">' + esc(st.d) + '</a><span class="tsep lgc">›</span><b class="lgc">' + esc(st.m) + '</b>' : '<b class="lgc">' + esc(st.d) + '</b>')); }
      var L = document.getElementById("lgL"); L.innerHTML = st.d ? '<a href="' + (st.m ? "municipio.html?d=" + encodeURIComponent(st.d) + "&m=" + encodeURIComponent(st.m) : "departamento.html?d=" + encodeURIComponent(st.d)) + '">Ficha de ' + esc(st.m || st.d) + ' →</a> · <a href="explorador.html' + (st.d ? "?n=mun&d=" + encodeURIComponent(st.d) : "") + '">Explorador</a>' : "";
    }
    function url() { var u = new URL(location.href); u.searchParams.delete("d"); u.searchParams.delete("m"); if (st.d) u.searchParams.set("d", st.d); if (st.m) u.searchParams.set("m", st.m); history.replaceState(null, "", u.toString()); }
    D.onchange = function () { st.d = D.value; st.m = ""; llena(); url(); cb(); };
    M.onchange = function () { st.m = M.value; llena(); url(); cb(); };
    llena();
  }
  function capa(map) {
    map.addSource("area", {type: "geojson", data: {type: "FeatureCollection", features: []}});
    map.addLayer({id: "area-l", type: "line", source: "area", paint: {"line-color": "#10233d", "line-width": 3.2}});
    map.addLayer({id: "area-l2", type: "line", source: "area", paint: {"line-color": "#ffffff", "line-width": 1.2, "line-dasharray": [2, 2]}});
  }
  function ajusta(map, T, st, vuelo) {
    var f = feat(T, st), ok = map && map.getSource("area"); if (!ok) return;
    map.getSource("area").setData({type: "FeatureCollection", features: f ? [f] : []});
    var b = f ? bboxG(f.geometry) : [-70.2, -23.2, -56.8, -8.8], pad = f ? 40 : 10; map.resize();
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: pad, duration: vuelo === false ? 0 : 600, maxZoom: st.m ? 10 : 9});
  }
  function etiqueta(st) { return st.m ? st.m + " (" + st.d + ")" : st.d || "todo Bolivia"; }
  function ev(T, st, e) { if (!st.d) return true; if (e.lat != null && e.lon != null) { var m = T.donde(e.lat, e.lon); if (m) return st.m ? m.d === st.d && m.n === st.m : m.d === st.d; } if (st.m) return false; return (e.departamentos || []).indexOf(st.d) >= 0; }
  return {init: init, capa: capa, ajusta: ajusta, feat: feat, etiqueta: etiqueta, ev: ev};
})();

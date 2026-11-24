/* Mapa base vectorial (nítido a cualquier acercamiento: ríos, caminos y nombres se redibujan en vez de agrandar una imagen).
   Datos: OpenFreeMap (https://openfreemap.org, sin clave) = teselas OpenMapTiles con datos de OpenStreetMap.
   Estilo propio en dos versiones (oscuro/claro) para que armonice con el sitio; usa el esquema OpenMapTiles (capas water, waterway, transportation, place…).
   Sin íconos de sprite: solo líneas, rellenos y texto (tipografías Noto Sans del propio OpenFreeMap). */
var BASEVEC = (function () {
  var FUENTE = {type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · datos © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>', maxzoom: 14};
  var GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
  var PRE = "v-";
  var NOM = ["coalesce", ["get", "name:es"], ["get", "name"]];
  var P = {
    osc: {bg: "#0b1524", bosque: "#0e2233", resid: "#112238", parque: "#10263a", agua: "#0f3a60", rio: "#4a9be0", rioFino: "#3a82c4", cMin: "#1f3350", cSec: "#2d4a70", cPri: "#4a6c9c", cAut: "#6b8fc6", cas: "rgba(5,10,20,.55)", riel: "#3a4a63", fronte: "#8fb3e8", edif: "#13253d", edifL: "#1d3556",
      tCiu: "#eaf2fd", tPue: "#bfd2ec", tAld: "#93abcb", tOtr: "#6f88a8", tHalo: "#08111e", tAgua: "#6fb0ee", tVia: "#8aa3c4", tPais: "#a9bfdd"},
    cla: {bg: "#edf0f4", bosque: "#dbe8d6", resid: "#e4e7ec", parque: "#d3e5cf", agua: "#b4d3ee", rio: "#5a9bd4", rioFino: "#78aedc", cMin: "#ffffff", cSec: "#fffaf0", cPri: "#fde9b4", cAut: "#f8cf74", cas: "#c9d0da", riel: "#aab3c0", fronte: "#6b7b95", edif: "#dde1e7", edifL: "#c8ced8",
      tCiu: "#1a2638", tPue: "#2f3e55", tAld: "#4b5b73", tOtr: "#6b7a90", tHalo: "#ffffff", tAgua: "#2f6ea8", tVia: "#52627a", tPais: "#44546d"}
  };
  var LIN = ["LineString", "MultiLineString"], POL = ["Polygon", "MultiPolygon"];
  function g(tipos) { return ["match", ["geometry-type"], tipos, true, false]; }
  function exp(b, st) { return ["interpolate", ["exponential", b], ["zoom"]].concat(st); }
  function lin(st) { return ["interpolate", ["linear"], ["zoom"]].concat(st); }
  function cls(l) { return ["match", ["get", "class"], l, true, false]; }
  function sinTunel() { return ["!=", ["get", "brunnel"], "tunnel"]; }

  function capas(osc) {
    var c = osc ? P.osc : P.cla, L = [];
    function add(o) { o.id = PRE + o.id; o.source = "ofm"; L.push(o); }
    function carretera(id, clases, minz, b, st, color, cas) {
      var f = ["all", g(LIN), sinTunel(), cls(clases)], st2 = st.map(function (v, i) { return i % 2 ? v * 1.6 + .6 : v; });
      if (cas) add({id: id + "-c", type: "line", "source-layer": "transportation", minzoom: minz, filter: f, layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": c.cas, "line-width": exp(b, st2)}});
      add({id: id, type: "line", "source-layer": "transportation", minzoom: minz, filter: f, layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": color, "line-width": exp(b, st)}});
    }
    add({id: "fondo", type: "background", paint: {"background-color": c.bg}});
    delete L[0].source;
    add({id: "bosque", type: "fill", "source-layer": "landcover", minzoom: 6, filter: ["all", g(POL), cls(["wood", "forest", "grass", "farmland"])], paint: {"fill-color": c.bosque, "fill-opacity": lin([6, 0, 9, .55, 13, .35]), "fill-antialias": false}});
    add({id: "urbano", type: "fill", "source-layer": "landuse", maxzoom: 16, filter: ["all", g(POL), cls(["residential", "suburb", "neighbourhood"])], paint: {"fill-color": c.resid, "fill-opacity": lin([6, .5, 12, .9])}});
    add({id: "parque", type: "fill", "source-layer": "park", filter: g(POL), paint: {"fill-color": c.parque, "fill-opacity": .8}});
    add({id: "agua", type: "fill", "source-layer": "water", filter: ["all", g(POL), sinTunel()], paint: {"fill-color": c.agua, "fill-antialias": true}});
    add({id: "rio", type: "line", "source-layer": "waterway", filter: ["all", g(LIN), cls(["river", "canal"])], layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": c.rio, "line-opacity": lin([3, .55, 8, .9]), "line-width": exp(1.6, [3, .45, 8, 1.1, 12, 2.4, 16, 7])}});
    add({id: "arroyo", type: "line", "source-layer": "waterway", minzoom: 10, filter: ["all", g(LIN), cls(["stream", "drain", "ditch"])], layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": c.rioFino, "line-opacity": .85, "line-width": exp(1.6, [10, .4, 14, 1.2, 18, 4])}});
    add({id: "edif", type: "fill", "source-layer": "building", minzoom: 13, filter: g(POL), paint: {"fill-color": c.edif, "fill-outline-color": c.edifL, "fill-opacity": lin([13, 0, 15, 1])}});
    add({id: "riel", type: "line", "source-layer": "transportation", minzoom: 9, filter: ["all", g(LIN), sinTunel(), cls(["rail", "transit"])], paint: {"line-color": c.riel, "line-width": lin([9, .5, 16, 1.6]), "line-dasharray": [3, 2]}});
    add({id: "sendero", type: "line", "source-layer": "transportation", minzoom: 14, filter: ["all", g(LIN), cls(["path", "pedestrian"])], layout: {"line-cap": "round"}, paint: {"line-color": c.cSec, "line-opacity": .7, "line-width": lin([14, .6, 19, 2.2]), "line-dasharray": [2, 2]}});
    carretera("via-min", ["minor", "service", "track"], 11, 1.55, [11, .5, 14, 1.8, 20, 18], c.cMin, false);
    carretera("via-sec", ["secondary", "tertiary"], 8, 1.5, [8, .5, 11, 1.3, 14, 3, 20, 20], c.cSec, true);
    carretera("via-pri", ["primary", "trunk"], 5, 1.45, [5, .7, 8, 1.4, 11, 2.4, 14, 4.5, 20, 24], c.cPri, true);
    carretera("via-aut", ["motorway"], 5, 1.45, [5, .9, 8, 1.8, 11, 3, 14, 5.5, 20, 28], c.cAut, true);
    add({id: "frontera", type: "line", "source-layer": "boundary", filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]], layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": c.fronte, "line-opacity": .9, "line-width": exp(1.3, [2, .8, 10, 1.8, 16, 4]), "line-dasharray": [3, 2]}});
    /* rótulos */
    function txt(id, sl, minz, maxz, filtro, font, tam, color, extra, lay) {
      var o = {id: id, type: "symbol", "source-layer": sl, filter: filtro, layout: {"text-field": NOM, "text-font": [font], "text-size": tam, "text-max-width": 7, "text-padding": 3}, paint: {"text-color": color, "text-halo-color": c.tHalo, "text-halo-width": 1.4, "text-halo-blur": .4}};
      if (minz != null) o.minzoom = minz; if (maxz != null) o.maxzoom = maxz;
      Object.keys(lay || {}).forEach(function (k) { o.layout[k] = lay[k]; });
      add(o);
    }
    txt("t-agua", "water_name", 0, null, g(["Point", "MultiPoint"]), "Noto Sans Italic", lin([2, 10, 8, 13]), c.tAgua, null, {"text-letter-spacing": .15});
    txt("t-rio", "waterway", 9, null, ["all", g(LIN), cls(["river", "canal"])], "Noto Sans Italic", lin([9, 11, 14, 14]), c.tAgua, null, {"symbol-placement": "line", "symbol-spacing": 360, "text-letter-spacing": .12});
    txt("t-arroyo", "waterway", 13, null, ["all", g(LIN), cls(["stream"])], "Noto Sans Italic", 11, c.tAgua, null, {"symbol-placement": "line", "symbol-spacing": 300});
    txt("t-via", "transportation_name", 12, null, ["all", g(LIN), cls(["motorway", "trunk", "primary", "secondary", "tertiary"])], "Noto Sans Regular", lin([12, 10, 16, 13]), c.tVia, null, {"symbol-placement": "line", "text-rotation-alignment": "map"});
    txt("t-via-menor", "transportation_name", 15, null, ["all", g(LIN), cls(["minor", "service", "track"])], "Noto Sans Regular", 11, c.tVia, null, {"symbol-placement": "line", "text-rotation-alignment": "map"});
    txt("t-otro", "place", 12, null, cls(["hamlet", "suburb", "neighbourhood", "isolated_dwelling", "quarter"]), "Noto Sans Regular", lin([12, 10, 16, 12]), c.tOtr, null, {"text-transform": "uppercase", "text-letter-spacing": .06});
    txt("t-aldea", "place", 9, null, cls(["village"]), "Noto Sans Regular", lin([9, 10, 14, 13]), c.tAld);
    txt("t-pueblo", "place", 7, null, cls(["town"]), "Noto Sans Regular", lin([7, 11, 12, 14]), c.tPue);
    txt("t-ciudad", "place", 4, null, cls(["city"]), "Noto Sans Bold", lin([4, 11, 8, 14, 12, 17]), c.tCiu);
    txt("t-pais", "place", 2, 8, cls(["country"]), "Noto Sans Bold", lin([2, 10, 7, 16]), c.tPais, null, {"text-transform": "uppercase", "text-letter-spacing": .12});
    return L;
  }
  return {fuente: FUENTE, glyphs: GLYPHS, pre: PRE, capas: capas};
})();

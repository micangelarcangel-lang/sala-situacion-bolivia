#!/usr/bin/env python3
"""Red hidrográfica de Bolivia para el mapa de Hidrológica (datos abiertos, sin claves).

Tres productos independientes; si uno falla, los demás se guardan y el archivo anterior de ese producto NO se toca:
  docs/hidro_rios.json     Ríos con nombre (OpenStreetMap vía Overpass, ODbL), unidos por nombre y clasificados por longitud dentro de Bolivia.
  docs/hidro_lagos.json    Lagos y salares (Natural Earth, dominio público) + lagos con nombre de OpenStreetMap.
  docs/hidro_cuencas.json  Grandes cuencas de Bolivia (Amazonas, del Plata, Altiplano/endorreica) y cuenca aportante a cada punto de caudal
                           (HydroBASINS nivel 6, HydroSHEDS; Lehner y Grill 2013; uso libre con atribución).
Nada se inventa: la cuenca aportante es la unión de las subcuencas HydroBASINS que drenan hacia el punto (aproximada: incluye toda la
subcuenca que contiene al punto).  Uso: python hidro_red.py [--solo rios|lagos|cuencas]
"""
import argparse
import io
import json
import math
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import tempfile

RAIZ = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(RAIZ, "docs")
BBOX = (-70.6, -23.1, -57.3, -9.5)          # O, S, E, N de Bolivia con margen
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter"]
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
HYBAS = ["https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_sa_lev06_v1c.zip",
         "https://data.hydrosheds.org/file/hydrobasins/standard/hybas_sa_lev06_v1c.zip"]
UA = {"User-Agent": "sala-situacion-bolivia/1.0 (+https://github.com/micangelarcangel-lang/sala-situacion-bolivia)"}


def get(url, data=None, timeout=300, intentos=3):
    ult = None
    for n in range(intentos):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            ult = e
        except Exception as e:
            ult = e
        time.sleep(4 * (n + 1))
    raise ult


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn").strip()


def guardar(obj, ruta):
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, ruta)
    print("Escrito %s (%.2f MB)" % (os.path.basename(ruta), os.path.getsize(ruta) / 1e6), flush=True)


def km_linea(g):
    """Longitud aproximada en km (proyección equirectangular local)."""
    from shapely.geometry import MultiLineString
    tot = 0.0
    for l in (g.geoms if isinstance(g, MultiLineString) else [g]):
        c = list(l.coords)
        for (x1, y1), (x2, y2) in zip(c, c[1:]):
            tot += math.hypot((x2 - x1) * math.cos(math.radians((y1 + y2) / 2)), y2 - y1) * 111.32
    return tot


def redondea(g, nd=4):
    from shapely import wkt
    from shapely.geometry import mapping
    m = mapping(g)

    def r(c):
        return [round(c[0], nd), round(c[1], nd)] if isinstance(c[0], (int, float)) else [r(k) for k in c]
    return {"type": m["type"], "coordinates": r(m["coordinates"])}


# ---------------------------------------------------------------- bolivia
def contorno_bolivia():
    from shapely.geometry import shape
    from shapely.ops import unary_union
    d = json.load(open(os.path.join(DOCS, "geo_dep.geojson"), encoding="utf-8"))
    fs = d["features"]
    return unary_union([shape(f["geometry"]).buffer(0) for f in fs])


def puntos_caudal():
    d = json.load(open(os.path.join(DOCS, "caudales.json"), encoding="utf-8"))
    return [(p["nombre"], p["rio"], float(p["lat"]), float(p["lon"])) for p in d["puntos"]]


# ---------------------------------------------------------------- ríos (OSM)
def rios():
    from shapely.geometry import LineString, MultiLineString
    from shapely.ops import linemerge
    q = ('[out:json][timeout:600];area["ISO3166-1"="BO"]["admin_level"="2"]->.a;'
         '(way["waterway"="river"]["name"](area.a););out geom tags qt;')
    crudo = None
    for u in OVERPASS:
        try:
            print("Overpass:", u, flush=True)
            crudo = json.loads(get(u, data=urllib.parse.urlencode({"data": q}).encode(), timeout=900, intentos=2))
            if crudo.get("elements"):
                break
        except Exception as e:
            print("  falló:", str(e)[:150], flush=True)
    if not crudo or not crudo.get("elements"):
        raise RuntimeError("Overpass no devolvió ríos")
    por = {}
    for el in crudo["elements"]:
        g = el.get("geometry") or []
        if len(g) < 2:
            continue
        nom = (el.get("tags") or {}).get("name:es") or el["tags"].get("name")
        por.setdefault(nom, []).append(LineString([(p["lon"], p["lat"]) for p in g]))
    print("Ríos con nombre (ways agrupados):", len(por), flush=True)
    feats = []
    for nom, ls in por.items():
        g = linemerge(ls) if len(ls) > 1 else ls[0]
        km = km_linea(g)
        if km < 40:
            continue
        g = g.simplify(0.003, preserve_topology=False)
        if g.is_empty:
            continue
        clase = "A" if km >= 400 else "B" if km >= 120 else "C"
        feats.append({"type": "Feature", "geometry": redondea(g), "properties": {"n": nom, "km": round(km), "c": clase}})
    feats.sort(key=lambda f: -f["properties"]["km"])
    print("Ríos guardados:", len(feats), [f["properties"]["n"] for f in feats[:25]], flush=True)
    return {"type": "FeatureCollection", "meta": {
        "fuente": "© colaboradores de OpenStreetMap (ODbL), vía Overpass API",
        "metodo": "waterway=river con nombre dentro de Bolivia; tramos unidos por nombre; solo ≥ 40 km dentro de Bolivia; clase A ≥ 400 km, B ≥ 120 km, C resto (longitud en Bolivia, no orden hidrológico); simplificado a ~300 m",
        "generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, "features": feats}


# ---------------------------------------------------------------- lagos
NOMBRES_LAGO = {"lago titicaca": "Lago Titicaca", "lago poopo": "Lago Poopó", "lago concepcion": "Laguna Concepción", "laguna ragaguado": "Laguna Rogaguado",
                "salar de uyuni": "Salar de Uyuni", "salar de coipasa": "Salar de Coipasa", "laguna huaitunas": "Laguna Huaitunas"}


def lagos():
    from shapely.geometry import shape
    feats, vistos = [], set()
    for arch in ("ne_10m_lakes", "ne_10m_playas"):
        d = json.loads(get(NE + arch + ".geojson", timeout=120))
        for f in d["features"]:
            g = f.get("geometry")
            if not g:
                continue
            s = shape(g)
            if s.is_empty or not s.intersects(__import__("shapely.geometry", fromlist=["box"]).box(*BBOX)):
                continue
            nom = f["properties"].get("name") or f["properties"].get("name_es") or ""
            clave = norm(nom)
            if clave not in NOMBRES_LAGO:
                continue
            vistos.add(clave)
            tipo = "salar" if arch.endswith("playas") else "lago"
            feats.append({"type": "Feature", "geometry": redondea(s.simplify(0.002)), "properties": {"n": NOMBRES_LAGO[clave], "t": tipo}})
    # lagos con nombre de OSM que Natural Earth no trae (p. ej. Uru Uru)
    try:
        q = ('[out:json][timeout:300];area["ISO3166-1"="BO"]["admin_level"="2"]->.a;'
             '(nwr["natural"="water"]["name"~"Uru Uru|Poop|Titicaca|Coipasa"](area.a););out geom tags;')
        for u in OVERPASS:
            try:
                r = json.loads(get(u, data=urllib.parse.urlencode({"data": q}).encode(), timeout=400, intentos=2))
                break
            except Exception as e:
                print("  lagos OSM falló:", str(e)[:100], flush=True)
                r = None
        from shapely.geometry import Polygon
        for el in (r or {}).get("elements", []):
            nom = (el.get("tags") or {}).get("name", "")
            if "uru uru" not in norm(nom) or "uru uru" in vistos:
                continue
            g = el.get("geometry")
            if el["type"] == "way" and g and len(g) > 3:
                p = Polygon([(a["lon"], a["lat"]) for a in g]).buffer(0)
                if not p.is_empty:
                    vistos.add("uru uru")
                    feats.append({"type": "Feature", "geometry": redondea(p.simplify(0.002)), "properties": {"n": "Lago Uru Uru", "t": "lago"}})
    except Exception as e:
        print("Lagos OSM omitidos:", str(e)[:120], flush=True)
    print("Lagos y salares:", sorted(f["properties"]["n"] for f in feats), flush=True)
    if not feats:
        raise RuntimeError("sin lagos")
    return {"type": "FeatureCollection", "meta": {
        "fuente": "Natural Earth (dominio público) y © colaboradores de OpenStreetMap (ODbL)",
        "metodo": "Contornos de referencia (no son la superficie de agua de hoy); el nivel o la superficie actual requiere una fuente satelital aún no conectada",
        "generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, "features": feats}


# ---------------------------------------------------------------- cuencas (HydroBASINS)
GRANDES = {"Cuenca del Amazonas": [(-66.1, -10.99), (-65.35, -10.82), (-64.9, -14.83)],
           "Cuenca del Plata": [(-63.47, -21.26), (-58.3, -16.35), (-64.3, -22.7)],
           "Cuenca endorreica del Altiplano": [(-67.1, -17.97), (-66.8, -20.4), (-69.3, -16.3)]}


def cuencas():
    import shapefile
    from shapely.geometry import Point, shape, box
    from shapely.ops import unary_union
    from shapely.strtree import STRtree
    zbytes = None
    for u in HYBAS:
        try:
            print("HydroBASINS:", u, flush=True)
            zbytes = get(u, timeout=600)
            break
        except Exception as e:
            print("  falló:", str(e)[:120], flush=True)
    if not zbytes:
        raise RuntimeError("no se pudo descargar HydroBASINS")
    tmp = tempfile.mkdtemp()
    zipfile.ZipFile(io.BytesIO(zbytes)).extractall(tmp)
    shp = [os.path.join(tmp, f) for f in os.listdir(tmp) if f.endswith(".shp")][0]
    rd = shapefile.Reader(shp)
    campos = [f[0] for f in rd.fields[1:]]
    ix = {c: i for i, c in enumerate(campos)}
    recs = rd.records()
    print("Subcuencas en Sudamérica (nivel 6):", len(recs), "campos:", campos, flush=True)
    sig = {}      # id -> siguiente aguas abajo
    info = {}
    for i, r in enumerate(recs):
        hid = int(r[ix["HYBAS_ID"]])
        sig[hid] = int(r[ix["NEXT_DOWN"]])
        info[hid] = {"i": i, "main": int(r[ix["MAIN_BAS"]]), "up": float(r[ix["UP_AREA"]]), "sub": float(r[ix["SUB_AREA"]]), "pfaf": int(r[ix["PFAF_ID"]]),
                     "endo": int(r[ix["ENDO"]]) if "ENDO" in ix else 0}
    # geometrías solo de las subcuencas que tocan Bolivia
    bol = contorno_bolivia()
    cajaB = box(*BBOX)
    geom, ids = [], []
    for i, sh in enumerate(rd.iterShapes()):
        b = sh.bbox
        if b[2] < BBOX[0] or b[0] > BBOX[2] or b[3] < BBOX[1] or b[1] > BBOX[3]:
            continue
        s = shape(sh.__geo_interface__).buffer(0)
        if s.intersects(cajaB):
            geom.append(s)
            ids.append(int(recs[i][ix["HYBAS_ID"]]))
    arbol = STRtree(geom)

    def contiene(lon, lat):
        p = Point(lon, lat)
        for k in arbol.query(p):
            if geom[int(k)].contains(p):
                return ids[int(k)]
        return None
    # grandes cuencas por sistema fluvial (MAIN_BAS)
    main_de = {}
    for nom, pts in GRANDES.items():
        for lon, lat in pts:
            h = contiene(lon, lat)
            print("  punto de referencia", nom, (lon, lat), "→", h, info.get(h, {}).get("main"), "pfaf", info.get(h, {}).get("pfaf"), flush=True)
            if h is not None:
                main_de.setdefault(info[h]["main"], nom)
    feats = []
    for mb, nom in main_de.items():
        partes = [geom[k] for k, h in enumerate(ids) if info[h]["main"] == mb]
        u = unary_union(partes).intersection(bol).simplify(0.01)
        if not u.is_empty:
            feats.append({"type": "Feature", "geometry": redondea(u, 3), "properties": {"t": "grande", "n": nom, "km2": round(u.area * 111.32 * 111.32 * math.cos(math.radians(16)))}})
    # el resto de Bolivia (si sobra) no se etiqueta: no se inventa un nombre
    # cuenca aportante a cada punto de caudal
    hijos = {}
    for h, s in sig.items():
        hijos.setdefault(s, []).append(h)
    for nom, rio, lat, lon in puntos_caudal():
        h = contiene(lon, lat)
        if h is None:
            print("  sin subcuenca para", nom, flush=True)
            continue
        cola, arriba = [h], {h}
        while cola:
            x = cola.pop()
            for y in hijos.get(x, []):
                if y not in arriba:
                    arriba.add(y)
                    cola.append(y)
        # geometrías (pueden estar fuera de la caja de Bolivia: se leen aparte)
        idx = [info[a]["i"] for a in arriba]
        gs = [shape(rd.shape(i).__geo_interface__).buffer(0) for i in idx]
        u = unary_union(gs).simplify(0.012)
        feats.append({"type": "Feature", "geometry": redondea(u, 3), "properties": {"t": "aportante", "n": "Cuenca aportante a %s (%s)" % (nom, rio), "p": nom, "km2": round(info[h]["up"]), "sub": len(arriba)}})
        print("  aportante", nom, "subcuencas", len(arriba), "área aportante HydroBASINS", round(info[h]["up"]), "km²", flush=True)
    if not feats:
        raise RuntimeError("sin cuencas")
    return {"type": "FeatureCollection", "meta": {
        "fuente": "HydroBASINS nivel 6 (HydroSHEDS; Lehner y Grill 2013, https://www.hydrosheds.org), uso libre con atribución",
        "metodo": "Grandes cuencas = sistemas fluviales (MAIN_BAS) de puntos de referencia dentro de Bolivia, recortados a Bolivia. Cuenca aportante = unión de las subcuencas que drenan hacia la subcuenca que contiene al punto de caudal (aproximada: incluye toda esa subcuenca).",
        "generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, "features": feats}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", choices=["rios", "lagos", "cuencas"])
    a = ap.parse_args()
    ok = 0
    for clave, fn, arch in (("rios", rios, "hidro_rios.json"), ("lagos", lagos, "hidro_lagos.json"), ("cuencas", cuencas, "hidro_cuencas.json")):
        if a.solo and a.solo != clave:
            continue
        try:
            guardar(fn(), os.path.join(DOCS, arch))
            ok += 1
        except Exception as e:
            print("::warning::%s no se actualizó: %s" % (clave, str(e)[:300]), flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

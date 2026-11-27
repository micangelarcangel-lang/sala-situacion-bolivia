#!/usr/bin/env python3
"""Extensión del espejo de agua de los lagos y salares de Bolivia, medida con imágenes Sentinel-2 L2A (Copernicus, datos abiertos, sin claves).

Qué mide: el área de píxeles clasificados como AGUA (SCL = 6) dentro de la «zona de medición» de cada lago (contorno de referencia + un margen),
mes a mes, para los últimos 24 meses. Es EXTENSIÓN, no nivel: el nivel (cota) lo mide otro instrumento (SENAMHI, altimetría) y no está conectado.

Fuente: Earth Search (Element 84), colección sentinel-2-l2a, API STAC pública; se lee solo la banda SCL (COG) por rangos HTTP y en baja resolución
(lectura con out_shape: se usan las vistas reducidas del COG). Si el lago cruza varias teselas o pasadas, se hace un mosaico de escenas de hasta 3 días.
Una escena solo entra a la serie si ≥ 85 % de los píxeles de la zona son válidos (sin nube, sombra, saturación ni «sin dato»); si no, el mes queda «insuficiente».
Nada se estima ni se interpola: los píxeles sin dato no se rellenan.

Robustez: si falla la fuente o un lago, se conserva lo anterior de ese lago (y se avisa); los meses ya medidos no se vuelven a leer.
Salida: docs/lagos_serie.json  (< 1,5 MB).   Uso: python lagos_serie.py [--solo titicaca] [--meses 24] [--salida RUTA] [--presupuesto-min 35]
"""
import argparse
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request

import numpy as np

RAIZ = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(RAIZ, "docs")
STAC = "https://earth-search.aws.element84.com/v1/search"
UA = {"User-Agent": "sala-situacion-bolivia/1.0 (+https://github.com/micangelarcangel-lang/sala-situacion-bolivia)", "Content-Type": "application/json"}
UMBRAL_VALIDOS = 85.0      # % mínimo de píxeles válidos en la zona para aceptar una escena
VENTANA_DIAS = 3           # escenas de hasta 3 días se mosaican
MAX_INTENTOS_MES = 3       # grupos de escenas que se prueban por mes antes de declararlo insuficiente
MAX_BYTES = 1_500_000
SCL_INVALIDOS = (0, 1, 3, 8, 9, 10)   # sin dato, saturado, sombra de nube, nube (prob. media/alta), cirro
SCL_AGUA = 6

LAGOS = [
    dict(id="titicaca", nombre="Lago Titicaca", ref="Lago Titicaca", tipo="lago", res_m=100, margen_km=3, bolivia=True),
    dict(id="poopo", nombre="Lago Poopó", ref="Lago Poopó", tipo="lago", res_m=60, margen_km=12),
    dict(id="uyuni", nombre="Salar de Uyuni", ref="Salar de Uyuni", tipo="salar", res_m=100, margen_km=3),
    dict(id="coipasa", nombre="Salar de Coipasa", ref="Salar de Coipasa", tipo="salar", res_m=80, margen_km=3),
    dict(id="concepcion", nombre="Laguna Concepción", ref="Laguna Concepción", tipo="lago", res_m=40, margen_km=2),
]

META = {
    "fuente": "Sentinel-2 L2A (Copernicus / ESA), vía Earth Search (Element 84, STAC público); clasificación de escena SCL (Sen2Cor)",
    "metodo": "Área de píxeles SCL = agua dentro de la zona de medición (contorno de referencia + margen), a 40–100 m según el lago (vista reducida del COG). "
              "Escenas de hasta 3 días se mosaican; se acepta una escena con ≥ 85 % de píxeles válidos en la zona; un mes por punto (la mejor escena).",
    "limitaciones": [
        "Es la extensión del espejo de agua, no el nivel (cota) del lago. El nivel del Titicaca lo publica el SENAMHI y aún no está conectado.",
        "El clasificador SCL puede confundir agua con sombras de cerros o nubes, y en los salares la sal húmeda o brillante puede quedar como nube o nieve: en el Salar de Uyuni y el de Coipasa hay pocas escenas aceptables.",
        "Los píxeles sin dato (hasta 15 % de la zona) no se estiman: el área puede quedar algo subestimada.",
        "Lagos someros como el Poopó cambian en pocas semanas; un punto por mes no recoge todo el ciclo.",
        "El contorno de referencia (Natural Earth/OpenStreetMap) no es la superficie de agua de hoy ni de un año fijo.",
    ],
    "umbral_validos_pct": UMBRAL_VALIDOS, "ventana_mosaico_dias": VENTANA_DIAS, "periodo_meses": 24,
}


# ---------------------------------------------------------------- utilidades de red (solo STAC)
def post_json(url, cuerpo, intentos=4, espera=5, timeout=120):
    ult = None
    for n in range(intentos):
        try:
            req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers=UA, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            ult = e
            if e.code in (400, 404):
                raise
        except Exception as e:
            ult = e
        time.sleep(espera * (n + 1))
    raise ult


def https_href(h):
    """Earth Search puede devolver s3://sentinel-cogs/...; se convierte a la dirección https equivalente."""
    p = "s3://sentinel-cogs/"
    return "https://sentinel-cogs.s3.us-west-2.amazonaws.com/" + h[len(p):] if h.startswith(p) else h


def buscar_stac(bbox, desde, hasta, post=post_json, max_paginas=20):
    """Escenas Sentinel-2 L2A en la caja [O,S,E,N] entre dos fechas (AAAA-MM-DD). Sigue la paginación del servicio."""
    cuerpo = {"collections": ["sentinel-2-l2a"], "bbox": list(bbox), "datetime": "%sT00:00:00Z/%sT23:59:59Z" % (desde, hasta), "limit": 100,
              "query": {"eo:cloud_cover": {"lt": 85}}}
    items, nxt = [], None
    for _ in range(max_paginas):
        r = post(STAC, cuerpo if nxt is None else nxt)
        for f in r.get("features", []):
            a = (f.get("assets") or {}).get("scl")
            if not a or not a.get("href"):
                continue
            p = f.get("properties") or {}
            fecha = (p.get("datetime") or "")[:10]
            if not fecha:
                continue
            items.append({"id": f["id"], "fecha": fecha, "nubes": float(p.get("eo:cloud_cover", 100)), "href": https_href(a["href"]),
                          "tesela": p.get("grid:code") or (f["id"].split("_")[1] if "_" in f["id"] else f["id"])})
        sig = [l for l in r.get("links", []) if l.get("rel") == "next"]
        if not sig:
            break
        l = sig[0]
        b = l.get("body")
        if b is None:
            break
        nxt = dict(cuerpo, **b) if l.get("merge") else b
    return items


def agrupar(items, ventana=VENTANA_DIAS):
    """Agrupa escenas en pasadas de hasta `ventana` días (la primera fecha del grupo marca el inicio). Por tesela se conserva la de menos nubes."""
    por = sorted(items, key=lambda x: x["fecha"])
    grupos, cur, ini = [], [], None
    for it in por:
        d = dt.date.fromisoformat(it["fecha"])
        if ini is None or (d - ini).days >= ventana:
            if cur:
                grupos.append(cur)
            cur, ini = [], d
        cur.append(it)
    if cur:
        grupos.append(cur)
    out = []
    for g in grupos:
        mejor = {}
        for it in g:
            if it["tesela"] not in mejor or it["nubes"] < mejor[it["tesela"]]["nubes"]:
                mejor[it["tesela"]] = it
        escenas = sorted(mejor.values(), key=lambda x: x["nubes"])
        out.append({"fecha": min(i["fecha"] for i in escenas), "mes": min(i["fecha"] for i in escenas)[:7], "escenas": escenas,
                    "nubes": sum(i["nubes"] for i in escenas) / len(escenas)})
    return out


# ---------------------------------------------------------------- geometría y rásters
def epsg_utm(lon, lat=-16.0):
    z = int((lon + 180) // 6) + 1
    return "EPSG:%d" % ((32700 if lat < 0 else 32600) + z)


def rejilla(ref_geom, margen_km, res_m, bolivia_geom=None):
    """Rejilla métrica (UTM) de la zona de medición: transform, forma, máscara de la zona y, si se pide, máscara de la parte boliviana."""
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    from rasterio.warp import transform_geom
    from shapely.geometry import mapping, shape
    c = ref_geom.centroid
    crs = epsg_utm(c.x, c.y)
    ref_m = shape(transform_geom("EPSG:4326", crs, mapping(ref_geom)))
    zona_g = ref_m.buffer(margen_km * 1000.0)
    x0, y0, x1, y1 = zona_g.bounds
    x0, y1 = math.floor(x0 / res_m) * res_m, math.ceil(y1 / res_m) * res_m
    ancho, alto = int(math.ceil((x1 - x0) / res_m)), int(math.ceil((y1 - (y1 - (y1 - y0))) / res_m)) if False else int(math.ceil((y1 - zona_g.bounds[1]) / res_m))
    tr = from_origin(x0, y1, res_m, res_m)
    zona = rasterize([(mapping(zona_g), 1)], out_shape=(alto, ancho), transform=tr, fill=0, dtype="uint8").astype(bool)
    bo = None
    ref_bo_km2 = None
    if bolivia_geom is not None:
        bo_m = shape(transform_geom("EPSG:4326", crs, mapping(bolivia_geom)))
        bo = rasterize([(mapping(bo_m), 1)], out_shape=(alto, ancho), transform=tr, fill=0, dtype="uint8").astype(bool)
        ref_bo_km2 = ref_m.intersection(bo_m).area / 1e6
    return {"crs": crs, "transform": tr, "shape": (alto, ancho), "zona": zona, "bo": bo, "res_m": res_m, "ref_km2": ref_m.area / 1e6,
            "ref_bo_km2": ref_bo_km2, "bounds": (x0, zona_g.bounds[1], x0 + ancho * res_m, y1)}


def lee_tesela(href, rj, abre=None):
    """Lee SCL de una tesela sobre la rejilla del lago. Usa lectura reducida (out_shape) para que el COG sirva sus vistas de baja resolución.
    Devuelve un arreglo uint8 de la forma de la rejilla (0 = sin dato) o None si la tesela no toca la zona."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import Affine
    from rasterio.warp import reproject, transform_bounds
    from rasterio.windows import Window, from_bounds
    abre = abre or rasterio.open
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="3",
                      AWS_NO_SIGN_REQUEST="YES", GDAL_HTTP_TIMEOUT="60"):
        with abre(href) as src:
            b = transform_bounds(rj["crs"], src.crs, *rj["bounds"], densify_pts=21)
            w = from_bounds(*b, transform=src.transform)
            w = Window(math.floor(w.col_off), math.floor(w.row_off), math.ceil(w.width) + 1, math.ceil(w.height) + 1)
            try:
                w = w.intersection(Window(0, 0, src.width, src.height))
            except Exception:
                return None
            if w.width < 1 or w.height < 1:
                return None
            f = max(1, int(round(rj["res_m"] / abs(src.transform.a))))
            sh = (max(1, int(w.height // f)), max(1, int(w.width // f)))
            dato = src.read(1, window=w, out_shape=sh, resampling=Resampling.nearest)
            tr = src.window_transform(w) * Affine.scale(w.width / sh[1], w.height / sh[0])
            dst = np.zeros(rj["shape"], dtype="uint8")
            reproject(dato, dst, src_transform=tr, src_crs=src.crs, dst_transform=rj["transform"], dst_crs=rj["crs"],
                      resampling=Resampling.nearest, src_nodata=0, dst_nodata=0)
            return dst


def valido(scl):
    return ~np.isin(scl, SCL_INVALIDOS)


def compone(arreglos):
    """Mosaico de escenas: se parte de la primera y los píxeles inválidos (sin dato o nube) se llenan con el primer píxel válido de las siguientes."""
    arreglos = [a for a in arreglos if a is not None]
    if not arreglos:
        return None
    r = arreglos[0].copy()
    for a in arreglos[1:]:
        m = ~valido(r) & valido(a)
        r[m] = a[m]
    return r


def medidas(scl, rj):
    """% de píxeles válidos de la zona y área de agua (km²) en la zona (y en la parte boliviana si hay máscara)."""
    zona = rj["zona"]
    nz = int(zona.sum())
    if nz == 0:
        return {"validos_pct": 0.0, "agua_km2": None, "agua_bo_km2": None}
    v = valido(scl) & zona
    agua = (scl == SCL_AGUA) & zona
    pix = (rj["res_m"] / 1000.0) ** 2
    o = {"validos_pct": 100.0 * int(v.sum()) / nz, "agua_km2": int(agua.sum()) * pix, "agua_bo_km2": None}
    if rj.get("bo") is not None:
        o["agua_bo_km2"] = int((agua & rj["bo"]).sum()) * pix
    return o


def poligono_agua(scl, rj, min_km2=0.25, tol_m=None):
    """Contorno del agua como geometría GeoJSON (EPSG:4326), simplificada y sin manchas menores de min_km2. None si no hay agua."""
    from rasterio.features import shapes
    from rasterio.warp import transform_geom
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    agua = ((scl == SCL_AGUA) & rj["zona"]).astype("uint8")
    if not agua.any():
        return None
    polys = []
    pix_km2 = (rj["res_m"] / 1000.0) ** 2
    for g, v in shapes(agua, mask=agua.astype(bool), transform=rj["transform"], connectivity=8):
        if v != 1:
            continue
        p = shape(g)
        if p.area / 1e6 >= min_km2 or p.area / 1e6 >= pix_km2 * 4:
            polys.append(p)
    polys = [p for p in polys if p.area / 1e6 >= min_km2]
    if not polys:
        return None
    u = unary_union(polys).simplify(tol_m or rj["res_m"] * 1.5, preserve_topology=True)
    if u.is_empty:
        return None
    g = transform_geom(rj["crs"], "EPSG:4326", mapping(u))
    return redondea(g, 4)


def redondea(g, n):
    def r(c):
        return [round(c[0], n), round(c[1], n)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


# ---------------------------------------------------------------- series
def meses_entre(hoy, n):
    """Lista 'AAAA-MM' de los últimos n meses incluido el actual, del más antiguo al más reciente."""
    y, m = hoy.year, hoy.month
    out = []
    for _ in range(n + 1):
        out.append("%04d-%02d" % (y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


def mes_anterior_anio(mes):
    return "%04d-%s" % (int(mes[:4]) - 1, mes[5:7])


def comparar(serie):
    """Último punto aceptado vs. el mismo mes del año anterior (solo si ese mes tiene punto aceptado)."""
    ok = [s for s in serie if s.get("estado") == "ok" and s.get("agua_km2") is not None]
    if not ok:
        return None, None, None
    ult = max(ok, key=lambda s: s["fecha"])
    prev = [s for s in ok if s["mes"] == mes_anterior_anio(ult["mes"])]
    if not prev:
        return ult, None, None
    p = prev[0]
    var = None if not p["agua_km2"] else round((ult["agua_km2"] - p["agua_km2"]) / p["agua_km2"] * 100, 1)
    return ult, p, var


def procesa_lago(cfg, ref_geom, hoy, previo, buscar, leer, bolivia_geom=None, meses=24, limite_t=None):
    """Serie de un lago. `previo` = registro anterior de este lago (se reutilizan los meses ya medidos). Lanza excepción si no se puede buscar escenas."""
    n = meses
    lista = meses_entre(hoy, n)
    rj = rejilla(ref_geom, cfg["margen_km"], cfg["res_m"], bolivia_geom if cfg.get("bolivia") else None)
    b = ref_geom.bounds
    mg = cfg["margen_km"] / 111.0 + 0.02
    desde = (dt.date(int(lista[0][:4]), int(lista[0][5:7]), 1)).isoformat()
    previa = {s["mes"]: s for s in (previo or {}).get("serie", [])}
    # meses por (re)calcular: nuevos, los 2 últimos, y los «insuficientes» recientes; lo ya medido no se vuelve a leer
    faltan = [m for m in lista if m not in previa or (m >= lista[-3] and previa[m].get("estado") != "ok") or (previa[m].get("estado") != "ok" and previa[m].get("intentos", 1) < 2)]
    nueva = {}
    mascara_reciente = None
    if faltan:
        items = buscar([b[0] - mg, b[1] - mg, b[2] + mg, b[3] + mg], desde, hoy.isoformat())
        grupos = agrupar(items)
        por_mes = {}
        for g in grupos:
            por_mes.setdefault(g["mes"], []).append(g)
        for mes in sorted(faltan, reverse=True):
            if limite_t is not None and time.time() > limite_t:
                break
            cand = sorted(por_mes.get(mes, []), key=lambda g: (g["nubes"], -len(g["escenas"])))[:MAX_INTENTOS_MES]
            mejor = None
            for g in cand:
                try:
                    scl = compone([leer(e["href"], rj) for e in g["escenas"]])
                except Exception as e:  # una escena ilegible no detiene el resto
                    print("  aviso: %s %s: %s" % (cfg["id"], g["fecha"], str(e)[:120]))
                    continue
                if scl is None:
                    continue
                m = medidas(scl, rj)
                reg = {"fecha": g["fecha"], "mes": mes, "validos_pct": round(m["validos_pct"], 1), "escena": " + ".join(e["id"] for e in g["escenas"][:6]),
                       "intentos": len(cand)}
                if m["validos_pct"] >= UMBRAL_VALIDOS and m["agua_km2"] is not None:
                    reg.update({"estado": "ok", "agua_km2": round(m["agua_km2"], 1)})
                    if m["agua_bo_km2"] is not None:
                        reg["agua_bo_km2"] = round(m["agua_bo_km2"], 1)
                    mejor = (reg, scl)
                    break
                if mejor is None or reg["validos_pct"] > mejor[0]["validos_pct"]:
                    reg.update({"estado": "insuficiente", "agua_km2": None})
                    mejor = (reg, scl)
            if mejor is None:
                nueva[mes] = {"fecha": mes + "-01", "mes": mes, "estado": "insuficiente", "agua_km2": None, "validos_pct": None, "escena": None, "intentos": len(cand),
                              "razon": "sin escenas disponibles ese mes" if not cand else "escenas ilegibles"}
            else:
                nueva[mes] = mejor[0]
                if mejor[0]["estado"] == "ok" and (mascara_reciente is None or mejor[0]["fecha"] > mascara_reciente[0]):
                    mascara_reciente = (mejor[0]["fecha"], mejor[1])
    serie = []
    for mes in lista:
        s = nueva.get(mes) or previa.get(mes)
        if s:
            serie.append(s)
    ult, ant, var = comparar(serie)
    poli, poli_f = None, None
    if ult:
        if mascara_reciente and mascara_reciente[0] == ult["fecha"]:
            poli, poli_f = poligono_agua(mascara_reciente[1], rj), ult["fecha"]
        elif previo and previo.get("poligono") and previo.get("poligono_fecha") == ult["fecha"]:
            poli, poli_f = previo["poligono"], ult["fecha"]
    reg = {"id": cfg["id"], "nombre": cfg["nombre"], "tipo": cfg["tipo"], "res_m": cfg["res_m"], "margen_km": cfg["margen_km"], "ref_km2": round(rj["ref_km2"], 1),
           "serie": serie, "poligono": poli, "poligono_fecha": poli_f}
    if rj["ref_bo_km2"] is not None:
        reg["ref_bo_km2"] = round(rj["ref_bo_km2"], 1)
    if ult:
        reg.update({"estado": "ok", "actual": {k: ult.get(k) for k in ("fecha", "agua_km2", "agua_bo_km2", "validos_pct", "escena") if ult.get(k) is not None},
                    "anterior": ({k: ant.get(k) for k in ("fecha", "agua_km2", "agua_bo_km2") if ant.get(k) is not None} if ant else None), "variacion_pct": var})
    else:
        n_ins = len([s for s in serie if s.get("estado") != "ok"])
        reg.update({"estado": "sin dato", "razon": "ninguna escena de los últimos %d meses alcanzó el %d %% de píxeles válidos (%d mes(es) intentados)" % (n, UMBRAL_VALIDOS, n_ins) if serie else "no hay escenas Sentinel-2 en el período"})
    reg["actualizado"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return reg


def conserva(previo, cfg, motivo):
    """Ante un fallo se mantiene lo anterior de ese lago y se avisa; si no había nada, queda «sin dato» con la razón."""
    if previo and previo.get("serie"):
        p = dict(previo)
        p["aviso"] = "No se pudo actualizar (%s); se muestran los datos de la última corrida válida." % motivo[:160]
        return p
    return {"id": cfg["id"], "nombre": cfg["nombre"], "tipo": cfg["tipo"], "estado": "sin dato", "razon": "no se pudo consultar la fuente: " + motivo[:160], "serie": [],
            "poligono": None, "poligono_fecha": None}


def tamano(obj):
    return len(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def ajusta_tamano(salida, limite=MAX_BYTES):
    """Si el archivo supera el límite, se simplifican más los polígonos (sin tocar las cifras)."""
    from shapely.geometry import mapping, shape
    tol = 0.0004
    while tamano(salida) > limite and tol < 0.01:
        for l in salida["lagos"]:
            if l.get("poligono"):
                s = shape(l["poligono"]).simplify(tol, preserve_topology=True)
                l["poligono"] = redondea(mapping(s), 4) if not s.is_empty else None
        tol *= 1.6
    return salida


def cargar_ref():
    from shapely.geometry import shape
    d = json.load(open(os.path.join(DOCS, "hidro_lagos.json"), encoding="utf-8"))
    return {f["properties"]["n"]: shape(f["geometry"]) for f in d["features"]}


def cargar_bolivia():
    from shapely.geometry import shape
    from shapely.ops import unary_union
    d = json.load(open(os.path.join(DOCS, "geo_dep.geojson"), encoding="utf-8"))
    return unary_union([shape(f["geometry"]).buffer(0) for f in d["features"]])


def principal(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--solo", help="id de un lago (titicaca, poopo, uyuni, coipasa, concepcion)")
    ap.add_argument("--meses", type=int, default=24)
    ap.add_argument("--salida", default=os.path.join(DOCS, "lagos_serie.json"))
    ap.add_argument("--presupuesto-min", type=float, default=35.0, help="tiempo máximo de lectura de imágenes; lo no medido queda para la siguiente corrida")
    a = ap.parse_args(argv)
    try:
        previo = json.load(open(a.salida, encoding="utf-8"))
    except Exception:
        previo = {}
    pl = {l["id"]: l for l in previo.get("lagos", [])}
    ref = cargar_ref()
    bol = cargar_bolivia()
    hoy = dt.datetime.now(dt.timezone.utc).date()
    limite = time.time() + a.presupuesto_min * 60
    res, fallos = [], 0
    for cfg in LAGOS:
        if a.solo and cfg["id"] != a.solo:
            if cfg["id"] in pl:
                res.append(pl[cfg["id"]])
            continue
        if cfg["ref"] not in ref:
            print("Sin contorno de referencia para", cfg["nombre"])
            res.append(conserva(pl.get(cfg["id"]), cfg, "falta el contorno de referencia"))
            fallos += 1
            continue
        print("==", cfg["nombre"], flush=True)
        try:
            r = procesa_lago(cfg, ref[cfg["ref"]], hoy, pl.get(cfg["id"]), buscar_stac, lee_tesela, bol, a.meses, limite)
            print("  estado:", r["estado"], "| puntos ok:", len([s for s in r["serie"] if s.get("estado") == "ok"]), "de", len(r["serie"]), "|",
                  json.dumps(r.get("actual"), ensure_ascii=False), flush=True)
        except Exception as e:
            print("  FALLO:", type(e).__name__, str(e)[:200], flush=True)
            r = conserva(pl.get(cfg["id"]), cfg, "%s: %s" % (type(e).__name__, e))
            fallos += 1
        res.append(r)
    if fallos == len([c for c in LAGOS if not a.solo or c["id"] == a.solo]) and not any(l.get("serie") for l in res):
        print("::error::No se pudo medir ningún lago y no hay datos anteriores; no se escribe nada.")
        return 1
    salida = {"version": 1, "generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "meta": dict(META, periodo_meses=a.meses), "lagos": res}
    salida = ajusta_tamano(salida)
    tmp = a.salida + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, a.salida)
    print("Escrito %s (%.0f KB)" % (a.salida, os.path.getsize(a.salida) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(principal())

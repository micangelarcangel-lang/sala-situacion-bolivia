#!/usr/bin/env python3
"""Malla de población de ~1 km para los mapas de exposición.

Método (híbrido, trazable):
  1. Total OFICIAL por municipio: INE, proyección PC20103 (docs/poblacion_mun.json).
  2. REPARTO dentro de cada municipio: WorldPop R2025A, "constrained" 100 m
     (https://www.worldpop.org, CC BY 4.0, DOI 10.5258/SOTON/WP00840).
     Se suma por bloques a ~1 km (30 segundos de arco) y se reescala, municipio
     por municipio, para que la suma de celdas sea EXACTAMENTE el total del INE.
  3. Con la malla, los mapas cuentan la población que cae dentro de cada radio
     (10/25/50 km, 25/50/100 km) en vez de contar municipios enteros.

Salida: docs/poblacion_malla.json (formato disperso, índices en delta).
Si la descarga falla, el proceso termina con error y NO toca el archivo anterior.
"""
import argparse
import hashlib
import json
import math
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import numpy as np

RAIZ = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(RAIZ, "docs")
URL = ("https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/{a}/BOL/v1/"
       "100m/constrained/bol_pop_{a}_CN_100m_R2025A_v1.tif")
ANIOS_WP = (2025, 2024)          # se usa el primero que exista
CELDA = 1.0 / 120.0              # 30 segundos de arco (~0,9 km en Bolivia)
RADIO_ORFANOS = 0.05             # grados (~5,5 km): píxeles fuera de polígonos simplificados
LICENCIA = "CC BY 4.0"
DOI = "10.5258/SOTON/WP00840"


def descargar(url, destino, intentos=3):
    """Descarga en streaming; devuelve sha256. Lanza excepción si no se puede."""
    ultimo = None
    for n in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sala-situacion-bolivia/1.0"})
            h = hashlib.sha256()
            with urllib.request.urlopen(req, timeout=120) as r, open(destino, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
                    h.update(b)
            return h.hexdigest()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            ultimo = e
        except Exception as e:  # red, tiempo de espera, etc.
            ultimo = e
        time.sleep(3 * (n + 1))
    raise ultimo


def sha256_archivo(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def cargar_municipios(ruta=None):
    from shapely.geometry import shape
    ruta = ruta or os.path.join(DOCS, "geo_mun.geojson")
    g = json.load(open(ruta, encoding="utf-8"))
    out = []
    for f in g["features"]:
        p = f["properties"]
        geom = shape(f["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        out.append((p["d"] + "|" + p["n"], geom))
    return out


def cargar_ine(anio, ruta=None):
    ruta = ruta or os.path.join(DOCS, "poblacion_mun.json")
    p = json.load(open(ruta, encoding="utf-8"))
    return {k: v["est"][str(anio)] for k, v in p["municipios"].items() if str(anio) in v.get("est", {})}


def _redondeo_resto_mayor(x, total):
    """Enteros que suman exactamente `total` (método del resto mayor)."""
    base = np.floor(x).astype(np.int64)
    falta = int(total - base.sum())
    if falta > 0:
        orden = np.argsort(-(x - base), kind="stable")
        base[orden[:falta]] += 1
    elif falta < 0:  # solo por error numérico
        orden = np.argsort(x - base, kind="stable")
        for i in orden:
            if falta == 0:
                break
            if base[i] > 0:
                base[i] -= 1
                falta += 1
    return base


def construir(tif, municipios, ine, anio, anio_wp=None, url=None, sha=None, banda_filas=1000):
    """Devuelve el diccionario listo para escribir. `municipios`: [(clave, geometría)]."""
    import rasterio
    from rasterio.features import rasterize
    from rasterio.windows import Window
    import shapely
    from shapely.strtree import STRtree

    claves = [k for k, _ in municipios]
    geoms = [g for _, g in municipios]
    NM = len(claves)
    if NM >= 32000:
        raise ValueError("demasiados municipios para int16")
    arbol = STRtree(geoms)

    with rasterio.open(tif) as src:
        if src.crs is None or src.crs.to_epsg() != 4326:
            raise ValueError("Se esperaba un raster en EPSG:4326, llegó %s" % (src.crs,))
        res = abs(src.transform.a)
        resy = abs(src.transform.e)
        f = max(1, int(round(CELDA / res)))
        d = res * f
        W, H = src.width, src.height
        lon0, lat0 = src.transform.c, src.transform.f
        nc, nr = int(math.ceil(W / f)), int(math.ceil(H / f))
        nodata = src.nodata
        banda = max(f, (banda_filas // f) * f)

        claves_celda = []
        sumas = []
        wp_total = 0.0
        wp_fuera = 0.0
        wp_reasig = 0.0
        n_huerfanos = 0

        for r0 in range(0, H, banda):
            h = min(banda, H - r0)
            win = Window(0, r0, W, h)
            a = src.read(1, window=win).astype("float32")
            if nodata is not None:
                a[a == nodata] = 0
            a[~np.isfinite(a)] = 0
            a[a < 0] = 0
            ys, xs = np.nonzero(a > 0)
            if ys.size == 0:
                continue
            vals = a[ys, xs].astype("float64")
            wp_total += float(vals.sum())

            tr = src.window_transform(win)
            lat_n, lat_s = lat0 - r0 * resy, lat0 - (r0 + h) * resy
            sel = [(g, i + 1) for i, g in enumerate(geoms)
                   if g.bounds[3] >= lat_s and g.bounds[1] <= lat_n]
            if sel:
                mun = rasterize(sel, out_shape=(h, W), transform=tr, fill=0, dtype="int16")
                m = mun[ys, xs].astype("int64") - 1
            else:
                m = np.full(ys.size, -1, dtype="int64")

            huerf = np.nonzero(m < 0)[0]
            if huerf.size:
                lon = lon0 + (xs[huerf] + 0.5) * res
                lat = lat0 - (r0 + ys[huerf] + 0.5) * resy
                pts = shapely.points(lon, lat)
                par = arbol.query_nearest(pts, max_distance=RADIO_ORFANOS, all_matches=False)
                m[huerf[par[0]]] = par[1]
                wp_reasig += float(vals[huerf[par[0]]].sum())
                n_huerfanos += int(par.shape[1])
                restantes = m < 0
                wp_fuera += float(vals[restantes].sum())

            ok = m >= 0
            if not ok.any():
                continue
            fila = (r0 + ys[ok]) // f
            col = xs[ok] // f
            clave = (fila * nc + col) * NM + m[ok]
            u, inv = np.unique(clave, return_inverse=True)
            claves_celda.append(u)
            sumas.append(np.bincount(inv, weights=vals[ok]))

    if claves_celda:
        K = np.concatenate(claves_celda)
        S = np.concatenate(sumas)
    else:
        K = np.zeros(0, dtype="int64")
        S = np.zeros(0)
    # Cada celda cae en una sola banda (banda múltiplo de f) → no hay duplicados entre bandas.
    flat = K // NM
    mi = (K % NM).astype("int64")

    wsum = np.bincount(mi, weights=S, minlength=NM)
    salida_flat, salida_m, salida_p = [], [], []
    sin_celdas, sin_ine, razones, extremas = [], [], [], []
    total_ine = 0

    orden_mun = np.argsort(mi, kind="stable")
    inicio = np.searchsorted(mi[orden_mun], np.arange(NM + 1))
    for i in range(NM):
        T = ine.get(claves[i])
        idx = orden_mun[inicio[i]:inicio[i + 1]]
        if T is None:
            sin_ine.append(claves[i])
            if idx.size:  # sin dato oficial: se deja el valor WorldPop redondeado
                p = np.rint(S[idx]).astype(np.int64)
                salida_flat.append(flat[idx]); salida_m.append(np.full(idx.size, i)); salida_p.append(p)
            continue
        T = int(T)
        total_ine += T
        if idx.size and wsum[i] > 0:
            r = T / wsum[i]
            razones.append(r)
            if r > 3 or r < 1 / 3:
                extremas.append([claves[i], round(r, 2)])
            p = _redondeo_resto_mayor(S[idx] * r, T)
            salida_flat.append(flat[idx]); salida_m.append(np.full(idx.size, i)); salida_p.append(p)
        elif T > 0:
            # Sin píxeles habitados en el producto: todo el total en el punto representativo.
            sin_celdas.append(claves[i])
            c = geoms[i].representative_point()
            fila = int(math.floor((lat0 - c.y) / d))
            col = int(math.floor((c.x - lon0) / d))
            if 0 <= fila < nr and 0 <= col < nc:
                salida_flat.append(np.array([fila * nc + col], dtype=np.int64))
                salida_m.append(np.array([i]))
                salida_p.append(np.array([T], dtype=np.int64))

    if salida_flat:
        F = np.concatenate(salida_flat).astype(np.int64)
        M = np.concatenate(salida_m).astype(np.int64)
        P = np.concatenate(salida_p).astype(np.int64)
    else:
        F = M = P = np.zeros(0, dtype=np.int64)
    keep = P > 0
    F, M, P = F[keep], M[keep], P[keep]
    o = np.lexsort((M, F))
    F, M, P = F[o], M[o], P[o]

    # Verificación: la suma por municipio debe ser exactamente el total INE.
    por_mun = np.bincount(M, weights=P, minlength=NM)
    for i in range(NM):
        T = ine.get(claves[i])
        if T is not None and int(por_mun[i]) != int(T) and claves[i] not in sin_celdas:
            raise AssertionError("Suma ≠ INE en %s: %s vs %s" % (claves[i], por_mun[i], T))
    total_malla = int(P.sum())

    razones = np.array(razones) if razones else np.array([1.0])
    meta = {
        "fuente": "WorldPop R2025A (constrained, 100 m) repartida por municipio; totales: INE PC20103 (Revisión 2025)",
        "metodo": "Suma por bloques a ~1 km; reescala por municipio al total INE (resto mayor, suma exacta). "
                  "Píxeles fuera de los polígonos simplificados (<5,5 km) se asignan al municipio más cercano. "
                  "Municipios sin píxeles habitados: total INE en su punto representativo.",
        "anio_ine": int(anio),
        "anio_worldpop": anio_wp,
        "licencia": LICENCIA,
        "cita": "WorldPop (www.worldpop.org), Universidad de Southampton. R2025A (versión alfa). DOI " + DOI,
        "url_origen": url,
        "sha256_origen": sha,
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "celda_grados": d,
        "n_celdas": int(P.size),
        "total_ine": int(total_ine),
        "total_malla": total_malla,
        "total_worldpop": int(round(wp_total)),
        "wp_reasignada_a_vecino": int(round(wp_reasig)),
        "wp_sin_municipio": int(round(wp_fuera)),
        "razon_ine_wp_mediana": round(float(np.median(razones)), 3),
        "razon_ine_wp_p05": round(float(np.percentile(razones, 5)), 3),
        "razon_ine_wp_p95": round(float(np.percentile(razones, 95)), 3),
        "municipios_razon_extrema": sorted(extremas, key=lambda x: -abs(math.log(x[1])))[:20],
        "municipios_sin_celdas": sin_celdas,
        "municipios_sin_dato_ine": sin_ine,
    }
    # Índices planos en delta (el primero es absoluto)
    delta = np.diff(F, prepend=0)
    return {
        "meta": meta,
        "grid": {"lon0": lon0, "lat0": lat0, "d": d, "nc": nc, "nr": nr},
        "munis": claves,
        "i": delta.tolist(),
        "m": M.tolist(),
        "p": P.tolist(),
    }


def guardar(out, ruta):
    """Escribe la malla y, al lado, un archivo pequeño solo con los metadatos (para la página de fuentes)."""
    for destino, datos in ((ruta, out), (os.path.splitext(ruta)[0] + "_meta.json", out["meta"])):
        tmp = destino + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, separators=(",", ":"), ensure_ascii=False)
        os.replace(tmp, destino)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tif", help="GeoTIFF local de WorldPop (omite la descarga)")
    ap.add_argument("--anio", type=int, help="Año INE para los totales (por defecto el año en curso, 2024-2034)")
    ap.add_argument("--salida", default=os.path.join(DOCS, "poblacion_malla.json"))
    a = ap.parse_args()

    anio = a.anio or min(max(datetime.now(timezone.utc).year, 2024), 2034)
    ine = cargar_ine(anio)
    if not ine:
        sys.exit("ERROR: poblacion_mun.json no tiene el año %s" % anio)
    municipios = cargar_municipios()

    with tempfile.TemporaryDirectory() as tmp:
        if a.tif:
            tif, url, anio_wp = a.tif, "archivo local", None
            sha = sha256_archivo(tif)
        else:
            tif = os.path.join(tmp, "wp.tif")
            url = sha = anio_wp = None
            for y in ANIOS_WP:
                u = URL.format(a=y)
                try:
                    print("Descargando", u, flush=True)
                    sha = descargar(u, tif)
                    url, anio_wp = u, y
                    break
                except urllib.error.HTTPError as e:
                    print("  no disponible (%s)" % e.code, flush=True)
                except Exception as e:
                    print("  falló: %s" % e, flush=True)
            if not url:
                sys.exit("ERROR: no se pudo descargar WorldPop; el archivo anterior no se modificó.")
        out = construir(tif, municipios, ine, anio, anio_wp, url, sha)

    m = out["meta"]
    print("Celdas: %d | INE %s: %d | malla: %d | WorldPop: %d" %
          (m["n_celdas"], anio, m["total_ine"], m["total_malla"], m["total_worldpop"]))
    print("Razón INE/WP mediana %.2f (p5 %.2f, p95 %.2f)" %
          (m["razon_ine_wp_mediana"], m["razon_ine_wp_p05"], m["razon_ine_wp_p95"]))
    print("Sin celdas:", len(m["municipios_sin_celdas"]), "| razón extrema:", len(m["municipios_razon_extrema"]),
          "| WP sin municipio:", m["wp_sin_municipio"])
    guardar(out, a.salida)
    print("Escrito", a.salida, "(%.1f MB)" % (os.path.getsize(a.salida) / 1e6))


if __name__ == "__main__":
    main()

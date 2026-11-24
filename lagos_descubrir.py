# -*- coding: utf-8 -*-
"""Sondeo de fuentes de datos de lagos (solo imprime en el registro; no escribe archivos de datos).
Sirve para verificar, desde un ejecutor con internet real, qué direcciones y formatos están disponibles antes de fijar el lector."""
import json
import re
import sys
import urllib.error
import urllib.request

UA = "Mozilla/5.0 (sala-situacion-bolivia; sondeo de fuentes)"


def pide(url, datos=None, cab=None, metodo=None, rango=None, t=60):
    h = {"User-Agent": UA}
    h.update(cab or {})
    if rango:
        h["Range"] = rango
    req = urllib.request.Request(url, data=datos, headers=h, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=t) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), (e.read() or b"")[:300]
    except Exception as e:
        return 0, {}, ("%s %s" % (type(e).__name__, e)).encode()


def head(url):
    s, h, b = pide(url, metodo="HEAD", t=40)
    return s, h.get("Content-Length"), h.get("Content-Type")


def seccion(t):
    print("\n==== " + t + " ====", flush=True)


def main():
    seccion("G-REALM: lista de lagos")
    for u in ("https://ipad.fas.usda.gov/lakes/images/LakesReservoirsCSV.txt",
              "https://ipad.fas.usda.gov/cropexplorer/global_reservoir/gr_regional_chart.aspx"):
        s, h, b = pide(u)
        print(u, s, len(b))
        if s == 200:
            tx = b.decode("utf-8", "replace")
            print("\n".join(tx.splitlines()[:4]))
            hit = [l for l in tx.splitlines() if re.search(r"titicaca|poop|bolivia|uru|coipasa|uyuni|\bperu\b|per[uú]", l, re.I)]
            print("coincidencias:", len(hit))
            print("\n".join(hit[:25]))
    seccion("G-REALM: archivos de ejemplo")
    for u in ("https://ipad.fas.usda.gov/lakes/images/lake0314.TPJOJ.2.txt",
              "https://ipad.fas.usda.gov/lakes/images/lake000314.TPJOJ.2.txt",
              "https://ipad.fas.usda.gov/lakes/images/000314.Victoria.TPJOJ.2.txt"):
        s, h, b = pide(u, rango="bytes=0-1500")
        print(u, s)
        if s in (200, 206):
            print(b.decode("utf-8", "replace")[:900])

    seccion("Sentinel-2 L2A en Earth Search (STAC, sin clave)")
    cuerpo = json.dumps({"collections": ["sentinel-2-l2a"], "bbox": [-67.4, -19.1, -66.7, -18.1],
                         "datetime": "2025-10-01T00:00:00Z/2025-10-31T23:59:59Z", "limit": 5,
                         "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}]}).encode()
    s, h, b = pide("https://earth-search.aws.element84.com/v1/search", datos=cuerpo, cab={"Content-Type": "application/json"})
    print("busqueda", s, len(b))
    if s == 200:
        d = json.loads(b)
        for it in d.get("features", [])[:5]:
            p = it["properties"]
            print(it["id"], p.get("datetime"), "nubes", p.get("eo:cloud_cover"), "nodata", p.get("s2:nodata_pixel_percentage"), "sw", p.get("processing:software"))
        if d.get("features"):
            a = d["features"][0]["assets"]
            print("assets:", sorted(a.keys()))
            for k in ("scl", "green", "swir16", "nir"):
                if k in a:
                    print(k, a[k].get("href"), json.dumps(a[k].get("raster:bands"))[:200], a[k].get("gsd"))
            s2, h2, b2 = pide(a["scl"]["href"], rango="bytes=0-100")
            print("lectura por rangos de scl:", s2, h2.get("Content-Range"))
    seccion("Landsat en Planetary Computer (STAC + token público)")
    for u in ("https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2",
              "https://planetarycomputer.microsoft.com/api/sas/v1/token/landsateuwest/landsat-c2"):
        s, h, b = pide(u)
        print(u, s, b[:200].decode("utf-8", "replace"))
    seccion("JRC Global Surface Water (descargas públicas)")
    for u in ("https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_70W_10S_v1_4_2021.tif",
              "https://storage.googleapis.com/global-surface-water/downloads2021/seasonality/seasonality_70W_10S_v1_4_2021.tif",
              "https://storage.googleapis.com/global-surface-water/downloads2021/yearlyClassification/yearlyClassification2015-0000000000-0000000000.tif",
              "https://storage.googleapis.com/global-surface-water/downloads2021/yearlyClassification/yearlyClassification2015_70W_10S.tif"):
        print(u.split("downloads2021/")[1], head(u))
    seccion("Otras (solo para documentar por qué se descartan)")
    for u in ("https://hydroweb.next.theia-land.fr/", "https://dahiti.dgfi.tum.de/en/products/water-level-altimetry/",
              "https://podaac.jpl.nasa.gov/dataset/PRESWOT_HYDRO_L2_GREALM_LAKE_HEIGHT_V2",
              "https://www.senamhi.gob.bo/", "https://www.senamhi.gob.pe/"):
        print(u, head(u))
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Pruebas de lagos_serie.py SIN internet: escenas y rásters sintéticos (nada de esto se publica)."""
import datetime as dt
import json
import os
import sys
import unittest

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import lagos_serie as L  # noqa: E402

try:
    import rasterio  # noqa: F401
    import shapely  # noqa: F401
    HAY_GEO = True
except Exception:  # pragma: no cover
    HAY_GEO = False

HOY = dt.date(2026, 11, 25)


def item(fecha, tesela="19KDB", nubes=5.0, i=0):
    return {"id": "S2A_%s_%s_%d" % (tesela, fecha.replace("-", ""), i), "fecha": fecha, "nubes": nubes, "href": "https://x/%s_%s.tif" % (tesela, fecha), "tesela": tesela}


class Utilidades(unittest.TestCase):
    def test_meses_entre(self):
        m = L.meses_entre(dt.date(2026, 2, 10), 3)
        self.assertEqual(m, ["2025-11", "2025-12", "2026-01", "2026-02"])
        self.assertEqual(len(L.meses_entre(HOY, 24)), 25)

    def test_https_href(self):
        self.assertEqual(L.https_href("s3://sentinel-cogs/a/b.tif"), "https://sentinel-cogs.s3.us-west-2.amazonaws.com/a/b.tif")
        self.assertEqual(L.https_href("https://otro/a.tif"), "https://otro/a.tif")

    def test_agrupar_por_ventana_y_tesela(self):
        its = [item("2026-10-01", "A", 10), item("2026-10-02", "A", 3, 1), item("2026-10-02", "B", 20), item("2026-10-09", "A", 7)]
        g = L.agrupar(its)
        self.assertEqual(len(g), 2)
        self.assertEqual(g[0]["fecha"], "2026-10-02")  # la escena del 1.° (más nubes que la del 2.° en la misma tesela) se descarta
        self.assertEqual({e["tesela"] for e in g[0]["escenas"]}, {"A", "B"})
        self.assertEqual([e["nubes"] for e in g[0]["escenas"] if e["tesela"] == "A"], [3])  # por tesela se conserva la de menos nubes
        self.assertEqual(g[1]["mes"], "2026-10")

    def test_comparar_mismo_mes_anio_anterior(self):
        s = [{"mes": "2025-10", "fecha": "2025-10-04", "estado": "ok", "agua_km2": 100.0},
             {"mes": "2026-10", "fecha": "2026-10-03", "estado": "ok", "agua_km2": 80.0},
             {"mes": "2026-11", "fecha": "2026-11-02", "estado": "insuficiente", "agua_km2": None}]
        ult, ant, var = L.comparar(s)
        self.assertEqual(ult["mes"], "2026-10")
        self.assertEqual(ant["mes"], "2025-10")
        self.assertEqual(var, -20.0)
        # sin el mismo mes del año anterior no se inventa la comparación
        u2, a2, v2 = L.comparar(s[1:])
        self.assertIsNotNone(u2)
        self.assertIsNone(a2)
        self.assertIsNone(v2)
        self.assertEqual(L.comparar([]), (None, None, None))

    def test_buscar_stac_pagina_y_filtra(self):
        pag = [{"features": [{"id": "S2A_19KDB_20261001_0_L2A", "properties": {"datetime": "2026-10-01T14:00:00Z", "eo:cloud_cover": 4, "grid:code": "MGRS-19KDB"},
                              "assets": {"scl": {"href": "s3://sentinel-cogs/x/SCL.tif"}}},
                             {"id": "sin_scl", "properties": {"datetime": "2026-10-02T14:00:00Z"}, "assets": {}}],
                "links": [{"rel": "next", "body": {"page": 2}, "merge": True}]},
               {"features": [{"id": "S2A_19KDB_20261006_0_L2A", "properties": {"datetime": "2026-10-06T14:00:00Z", "eo:cloud_cover": 9},
                              "assets": {"scl": {"href": "https://h/SCL.tif"}}}], "links": []}]
        llamadas = []

        def post(url, cuerpo):
            llamadas.append(cuerpo)
            return pag[len(llamadas) - 1]
        r = L.buscar_stac([-67, -19, -66, -18], "2026-10-01", "2026-10-31", post=post)
        self.assertEqual(len(r), 2)
        self.assertTrue(r[0]["href"].startswith("https://sentinel-cogs"))
        self.assertEqual(llamadas[1].get("page"), 2)
        self.assertEqual(llamadas[1].get("collections"), ["sentinel-2-l2a"])


class Rasters(unittest.TestCase):
    def test_valido_compone_y_medidas(self):
        a = np.array([[6, 9, 4], [6, 6, 0]], dtype="uint8")
        b = np.array([[6, 6, 4], [4, 6, 6]], dtype="uint8")
        self.assertEqual(L.valido(a).tolist(), [[True, False, True], [True, True, False]])
        c = L.compone([a, b, None])
        self.assertEqual(c.tolist(), [[6, 6, 4], [6, 6, 6]])  # inválidos de la primera se llenan con la siguiente válida
        self.assertIsNone(L.compone([None]))
        rj = {"zona": np.ones((2, 3), bool), "res_m": 1000.0, "bo": None}
        m = L.medidas(a, rj)
        self.assertAlmostEqual(m["validos_pct"], 4 / 6 * 100, places=3)
        self.assertEqual(m["agua_km2"], 3.0)  # 3 píxeles de 1 km²: nunca se estima el resto


def lago_prueba():
    from shapely.geometry import Point
    return Point(-67.1, -18.8).buffer(0.2)  # ~40 km de diámetro, cerca del Poopó


def fabrica_leer(fraccion_agua=0.5, nube=0.0):
    """Lector falso: agua en el centro de la zona (fracción del radio), nube en una franja y tierra en el resto. Respeta la forma de la rejilla."""
    def leer(href, rj):
        alto, ancho = rj["shape"]
        yy, xx = np.mgrid[0:alto, 0:ancho]
        cy, cx = (alto - 1) / 2, (ancho - 1) / 2
        r = np.hypot(yy - cy, xx - cx) / (min(alto, ancho) / 2)
        scl = np.full((alto, ancho), 4, dtype="uint8")
        scl[r < fraccion_agua] = 6
        if nube:
            k = int(alto * nube)
            scl[:k, :] = 9
        return scl
    return leer


@unittest.skipUnless(HAY_GEO, "requiere rasterio y shapely")
class Serie(unittest.TestCase):
    cfg = dict(id="poopo", nombre="Lago Poopó", ref="Lago Poopó", tipo="lago", res_m=1000, margen_km=5)

    def buscar_mensual(self, meses_con_escena):
        def buscar(bbox, desde, hasta):
            return [item(m + "-10", "19KDB", 4.0) for m in meses_con_escena]
        return buscar

    def test_serie_ok_con_poligono_y_sin_inventar(self):
        meses = L.meses_entre(HOY, 6)
        r = L.procesa_lago(self.cfg, lago_prueba(), HOY, None, self.buscar_mensual(meses[:-2]), fabrica_leer(.5), meses=6)
        self.assertEqual(r["estado"], "ok")
        oks = [s for s in r["serie"] if s["estado"] == "ok"]
        self.assertEqual(len(oks), len(meses) - 2)
        faltan = [s for s in r["serie"] if s["mes"] in meses[-2:]]
        for s in faltan:  # meses sin escenas: «insuficiente» y sin cifra
            self.assertEqual(s["estado"], "insuficiente")
            self.assertIsNone(s["agua_km2"])
        self.assertGreater(r["actual"]["agua_km2"], 0)
        self.assertLess(r["actual"]["agua_km2"], r["ref_km2"] * 2)
        self.assertIsNotNone(r["poligono"])
        self.assertIn(r["poligono"]["type"], ("Polygon", "MultiPolygon"))
        self.assertEqual(r["poligono_fecha"], r["actual"]["fecha"])

    def test_mas_agua_da_mayor_area(self):
        meses = L.meses_entre(HOY, 2)
        a = L.procesa_lago(self.cfg, lago_prueba(), HOY, None, self.buscar_mensual(meses), fabrica_leer(.3), meses=2)
        b = L.procesa_lago(self.cfg, lago_prueba(), HOY, None, self.buscar_mensual(meses), fabrica_leer(.7), meses=2)
        self.assertGreater(b["actual"]["agua_km2"], a["actual"]["agua_km2"] * 2)

    def test_demasiada_nube_es_insuficiente(self):
        meses = L.meses_entre(HOY, 2)
        r = L.procesa_lago(self.cfg, lago_prueba(), HOY, None, self.buscar_mensual(meses), fabrica_leer(.5, nube=.4), meses=2)
        self.assertEqual(r["estado"], "sin dato")
        self.assertTrue(all(s["agua_km2"] is None for s in r["serie"]))
        self.assertIn("razon", r)
        self.assertIsNone(r["poligono"])

    def test_no_relee_meses_ya_medidos(self):
        meses = L.meses_entre(HOY, 6)
        r1 = L.procesa_lago(self.cfg, lago_prueba(), HOY, None, self.buscar_mensual(meses), fabrica_leer(.5), meses=6)
        lecturas = []

        def leer(h, rj):
            lecturas.append(h)
            return fabrica_leer(.5)(h, rj)
        L.procesa_lago(self.cfg, lago_prueba(), HOY, r1, self.buscar_mensual(meses), leer, meses=6)
        self.assertLessEqual(len(lecturas), 3)  # solo los últimos meses se reprocesan

    def test_una_escena_ilegible_no_detiene(self):
        meses = L.meses_entre(HOY, 2)

        def leer(h, rj):
            if "2026-11" in h:
                raise IOError("COG ilegible")
            return fabrica_leer(.5)(h, rj)
        r = L.procesa_lago(self.cfg, lago_prueba(), HOY, None, self.buscar_mensual(meses), leer, meses=2)
        self.assertEqual(r["estado"], "ok")
        self.assertEqual([s["estado"] for s in r["serie"]][-1], "insuficiente")

    def test_conserva_ante_fallo(self):
        previo = {"id": "poopo", "serie": [{"mes": "2026-10", "estado": "ok", "agua_km2": 5.0}], "estado": "ok"}
        c = L.conserva(previo, self.cfg, "HTTP 503")
        self.assertIn("aviso", c)
        self.assertEqual(c["serie"], previo["serie"])
        v = L.conserva(None, self.cfg, "sin red")
        self.assertEqual(v["estado"], "sin dato")
        self.assertEqual(v["serie"], [])

    def test_ajusta_tamano_no_toca_cifras(self):
        from shapely.geometry import mapping
        g = L.redondea(mapping(lago_prueba()), 6)
        salida = {"lagos": [{"id": "x", "serie": [{"mes": "2026-10", "agua_km2": 1.5}], "poligono": g}]}
        s = L.ajusta_tamano(salida, limite=600)
        self.assertEqual(s["lagos"][0]["serie"][0]["agua_km2"], 1.5)
        self.assertLess(len(json.dumps(s)), len(json.dumps({"lagos": [{"id": "x", "serie": [{"mes": "2026-10", "agua_km2": 1.5}], "poligono": g}]})))


@unittest.skipUnless(HAY_GEO, "requiere rasterio y shapely")
class LecturaCOG(unittest.TestCase):
    """lee_tesela sobre un GeoTIFF sintético en UTM (como las teselas Sentinel-2): reproyección, recorte y agua medida."""

    def test_area_de_agua_medida_coincide_con_la_figura(self):
        import tempfile
        import rasterio
        from rasterio.crs import CRS
        from rasterio.transform import from_origin
        from shapely.geometry import Point
        crs = L.epsg_utm(-67.1, -18.8)
        cx, cy = 600000.0, 7920000.0  # cerca de (-67.1, -18.8) en la zona 19S
        res = 100.0
        n = 1200  # 120 km por lado
        x0, y0 = cx - n * res / 2, cy + n * res / 2
        yy, xx = np.mgrid[0:n, 0:n]
        radio_px = 150  # 15 km → área esperada = pi * 15² ≈ 706,9 km²
        scl = np.full((n, n), 4, dtype="uint8")
        scl[np.hypot(yy - n / 2, xx - n / 2) < radio_px] = 6
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "scl.tif")
            with rasterio.open(ruta, "w", driver="GTiff", height=n, width=n, count=1, dtype="uint8", crs=CRS.from_string(crs),
                               transform=from_origin(x0, y0, res, res), nodata=0) as dst:
                dst.write(scl, 1)
            from rasterio.warp import transform
            lon, lat = transform(CRS.from_string(crs), "EPSG:4326", [cx], [cy])
            ref = Point(lon[0], lat[0]).buffer(0.14)  # ~15 km
            rj = L.rejilla(ref, 8, 1000)
            lee = L.lee_tesela(ruta, rj)
            self.assertEqual(lee.shape, rj["shape"])
            m = L.medidas(lee, rj)
            self.assertGreater(m["validos_pct"], 99)
            esperado = np.pi * 15 ** 2
            self.assertAlmostEqual(m["agua_km2"] / esperado, 1.0, delta=0.08)  # lectura reducida a 1 km: ±8 %
            poli = L.poligono_agua(lee, rj)
            self.assertIsNotNone(poli)


@unittest.skipUnless(HAY_GEO, "requiere rasterio y shapely")
class DatosReales(unittest.TestCase):
    def test_contornos_de_referencia_existen(self):
        ref = L.cargar_ref()
        for c in L.LAGOS:
            self.assertIn(c["ref"], ref, "falta el contorno de " + c["nombre"])
        self.assertGreater(L.cargar_bolivia().area, 50)


if __name__ == "__main__":
    unittest.main()

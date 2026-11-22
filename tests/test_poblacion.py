"""Prueba de la malla de población con un raster sintético (sin internet).
Requiere rasterio y shapely; si no están instalados, se omite."""
import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
try:
    import rasterio
    from rasterio.transform import from_origin
    from shapely.geometry import box
    HAY = True
except Exception:  # pragma: no cover
    HAY = False


@unittest.skipUnless(HAY, "rasterio/shapely no instalados")
class MallaPoblacion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import poblacion_malla as pm
        cls.pm = pm
        cls.tmp = tempfile.TemporaryDirectory()
        res = 0.0008333333333333334  # 100 m
        lon0, lat0 = -68.0, -16.0
        W, H = 400, 300  # 0.33° x 0.25°
        a = np.zeros((H, W), dtype="float32")
        rng = np.random.default_rng(1)
        a[20:60, 20:60] = rng.random((40, 40)) * 5          # pueblo en A
        a[120:140, 220:240] = rng.random((20, 20)) * 30     # pueblo en B
        a[200:210, 100:110] = 2.0                           # C: no tiene píxeles (C queda sin celdas, ver más abajo)
        a[10:14, 390:399] = 3.0                             # píxeles fuera de los polígonos pero cerca (borde)
        a[0, 0] = -99999                                    # nodata
        cls.tif = os.path.join(cls.tmp.name, "s.tif")
        with rasterio.open(cls.tif, "w", driver="GTiff", height=H, width=W, count=1, dtype="float32",
                           crs="EPSG:4326", transform=from_origin(lon0, lat0, res, res), nodata=-99999) as dst:
            dst.write(a, 1)
        x = lambda c: lon0 + c * res
        y = lambda r: lat0 - r * res
        # A: columnas 0-199, B: 200-380, C: filas 180-300 (sin población en el raster salvo el bloque 200:210, que sí cae)
        cls.mun = [
            ("D|A", box(x(0), y(150), x(200), y(0))),
            ("D|B", box(x(200), y(150), x(380), y(0))),
            ("D|C", box(x(0), y(300), x(380), y(150))),
            ("D|Vacio", box(x(380), y(300), x(400), y(290))),   # sin píxeles con población
        ]
        cls.ine = {"D|A": 12345, "D|B": 6789, "D|C": 51, "D|Vacio": 77}
        cls.out = pm.construir(cls.tif, cls.mun, cls.ine, 2026, 2025, "x", "abc")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def sumas(self):
        o = self.out
        m = np.array(o["m"]); p = np.array(o["p"])
        return {o["munis"][i]: int(p[m == i].sum()) for i in range(len(o["munis"]))}

    def test_suma_exacta_por_municipio(self):
        s = self.sumas()
        for k, t in self.ine.items():
            self.assertEqual(s.get(k, 0), t, k)

    def test_municipio_sin_pixeles_va_al_punto_representativo(self):
        self.assertIn("D|Vacio", self.out["meta"]["municipios_sin_celdas"])

    def test_nodata_y_negativos_no_cuentan(self):
        self.assertLess(self.out["meta"]["total_worldpop"], 10 ** 5)
        self.assertGreater(self.out["meta"]["total_worldpop"], 0)

    def test_decodificacion_indices(self):
        o = self.out; g = o["grid"]
        flat = np.cumsum(o["i"])
        self.assertTrue((flat >= 0).all() and (flat < g["nc"] * g["nr"]).all())
        self.assertTrue((np.diff(flat) >= 0).all())
        fila, col = flat // g["nc"], flat % g["nc"]
        lon = g["lon0"] + (col + .5) * g["d"]; lat = g["lat0"] - (fila + .5) * g["d"]
        # Las celdas de A deben quedar dentro de la caja de A (con holgura de una celda)
        m = np.array(o["m"]); i = o["munis"].index("D|A")
        self.assertTrue((lon[m == i] < -68.0 + 200 * 0.00083333 + g["d"]).all())

    def test_total_meta(self):
        m = self.out["meta"]
        self.assertEqual(m["total_malla"], sum(self.sumas().values()))
        self.assertEqual(m["total_ine"], sum(self.ine.values()))

    def test_escritura_y_lectura(self):
        ruta = os.path.join(self.tmp.name, "m.json")
        self.pm.guardar(self.out, ruta)
        import json
        with open(ruta, encoding="utf-8") as f:
            r = json.load(f)
        self.assertEqual(len(r["i"]), len(r["m"]))
        self.assertEqual(len(r["p"]), r["meta"]["n_celdas"])
        with open(os.path.join(self.tmp.name, "m_meta.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["n_celdas"], r["meta"]["n_celdas"])


if __name__ == "__main__":
    unittest.main()

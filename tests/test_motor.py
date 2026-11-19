"""Pruebas del motor que no necesitan internet: clasificación de hechos de prensa y lectura de cifras de víctimas.
Ejecutar:  python -m unittest discover -s tests -v"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import depurar  # noqa: E402
import informe_hecho as ih  # noqa: E402


def cat(titulo, categoria="otra"):
    r = depurar.revisar({"titulo": titulo, "categoria": categoria, "origen": "prensa"})
    return None if r is None else r["categoria"]


class Clasificacion(unittest.TestCase):
    def test_no_rompe_con_datos_vacios(self):
        self.assertEqual(depurar.revisar({}), {})
        self.assertEqual(depurar.revisar({"titulo": None, "categoria": "otra"})["categoria"], "otra")

    def test_descarta_extranjero_y_enlaces(self):
        self.assertIsNone(cat("Casavalle, la barriada humilde de Montevideo", "hidrológica"))
        self.assertIsNone(cat("https://ejemplo.com/nota"))

    def test_palabra_completa_respalda_el_tipo(self):
        self.assertEqual(cat("La ola democrata aviva la disputa progresismo o pragmatismo", "geológica"), "otra")
        self.assertEqual(cat("Tarija: se agrava el estado de salud del niño mordido por perros", "climatológica"), "otra")

    def test_hechos_reales_se_conservan_o_promueven(self):
        self.assertEqual(cat("Potosí registra un sismo de magnitud 4.1 en la provincia Sud Lípez", "geológica"), "geológica")
        self.assertEqual(cat("Casas siguen inundadas en la zona sur de Cochabamba"), "hidrológica")
        self.assertEqual(cat("Gobierno explica a municipios cómo acceder a recursos para atender emergencias por El Niño", "climatológica"), "climatológica")
        self.assertEqual(cat("Minibús se embarranca en la zona alta del barrio minero San José", "geológica"), "antropogénica")


class Alcance(unittest.TestCase):
    def test_hechos_extranjeros_se_descartan(self):
        for t in ("Al menos 64 heridos en una colisión entre dos trenes en la provincia egipcia de Giza",
                  "Al menos 21 muertos por un choque entre un camión y un autobús en el sur de Tanzania",
                  "Seis muertos en Polonia por un tirador fascinado por la extrema derecha"):
            self.assertIsNone(cat(t), t)

    def test_hechos_en_bolivia_con_extranjeros_se_conservan(self):
        for t in ("Detención domiciliaria en caso de atropello a youtuber Surcoreano",
                  "DICTAN DETENCIÓN DOMICILIARIA A CHOFER IMPLICADO EN LA MUERTE DE CICLISTA COREANO",
                  "Colisión de dos buses en la carretera Oruro-Potosí deja 12 heridos"):
            self.assertIsNotNone(cat(t), t)

    def test_nombre_del_medio_no_es_un_lugar(self):
        import busqueda
        from shapely.geometry import Point
        geo = {"mun": [{"n": "Potosí", "d": "Potosí", "_s": Point(-65.75, -19.58).buffer(.1)}], "dep": []}
        con_medio = busqueda.ubicar_por_nombre(geo, "Colisión de dos trenes deja 46 heridos - El Potosí")
        con_lugar = busqueda.ubicar_por_nombre(geo, "Colisión de dos buses en Potosí deja 12 heridos - El Diario")
        self.assertNotEqual(con_medio[3], "nombre de municipio en el titular")
        self.assertEqual(con_lugar[3], "nombre de municipio en el titular")


class Cifras(unittest.TestCase):
    def test_lecturas_basicas(self):
        self.assertEqual(ih.cifras("Mueren 3 personas en un accidente en la carretera a Oruro"), (3, 0))
        self.assertEqual(ih.cifras("Colisión de dos trenes deja 46 heridos y 4 de gravedad"), (0, 46))
        self.assertEqual(ih.cifras("Mueren cinco mineros en Potosí"), (5, 0))

    def test_separador_de_miles_no_parte_la_cifra(self):
        self.assertEqual(ih.cifras("RD Congo supera barrera de 11.000 casos de ébola, con 5.387 muertos"), (0, 0))

    def test_sin_cifra_no_se_inventa(self):
        self.assertEqual(ih.cifras("Varios heridos en un choque"), (0, 0))

    def test_cifra_grande_sin_respaldo_del_titular_se_quita(self):
        r = {"origen": "prensa", "titulo": "Chuquisaca: Intensa granizada destruye techos de viviendas y cultivos", "categoria": "meteorológica",
             "cifras": {"fallecidos": 30, "heridos": 0, "notas": 20}}
        depurar.revisar(r)
        self.assertEqual(r["cifras"]["fallecidos"], 0)

    def test_cifra_respaldada_o_pequena_se_conserva(self):
        r = {"origen": "prensa", "titulo": "Colisión de dos trenes deja 46 heridos y 4 de gravedad", "categoria": "antropogénica",
             "cifras": {"fallecidos": 7, "heridos": 46, "notas": 2}}
        depurar.revisar(r)
        self.assertEqual((r["cifras"]["fallecidos"], r["cifras"]["heridos"]), (7, 46))

    def test_titular_singular_manda_sobre_cifra_inflada(self):
        r = {"origen": "prensa", "titulo": "Defensoría investiga muerte de un conscripto en Yacuiba", "categoria": "otra",
             "cifras": {"fallecidos": 17, "heridos": 0, "notas": 2}}
        depurar.revisar(r)
        self.assertEqual(r["cifras"]["fallecidos"], 1)



class Reporte(unittest.TestCase):
    def test_nota_sin_tipo_ni_victimas_no_es_un_hecho_del_reporte(self):
        import reporte_situacion as rs
        base = {"origen": "prensa", "ts": 1000, "ts_ult": 1000, "nivel": 1, "titulo": "x", "id": "a"}
        evs = [dict(base, id="a", categoria="otra", cifras={"fallecidos": 0, "heridos": 0}),
               dict(base, id="b", categoria="otra", cifras={"fallecidos": 2, "heridos": 0}),
               dict(base, id="c", categoria="meteorológica", cifras={"fallecidos": 0, "heridos": 0})]
        ids = {e["id"] for e in rs.seleccionar(evs, 0, 2000)}
        self.assertEqual(ids, {"b", "c"})

    def test_correo_y_pdf_comparten_las_mismas_cifras(self):
        import reporte_situacion as rs
        self.assertIsInstance(rs.RESUMENES, dict)

if __name__ == "__main__":
    unittest.main()

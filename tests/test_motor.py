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


if __name__ == "__main__":
    unittest.main()

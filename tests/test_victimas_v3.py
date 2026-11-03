import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import victimas_v3 as v


def test_cifras_basicas():
    r = v.extraer("Dos muertos tras choque de auto contra camión", "")
    assert r["fallecidos"] == (2, 2) and r["heridos"] is None


def test_varios_no_es_uno():
    r = v.extraer("Reportan tres muertos y varios heridos", "")
    assert r["fallecidos"] == (3, 3) and r["heridos"] == (2, None)


def test_verbo_sin_cifra_es_al_menos_uno():
    r = v.extraer("Muere niña de seis años tras accidente", "")
    assert r["fallecidos"] == (1, None)


def test_cuerpo_si_titular_no_trae():
    r = v.extraer("Accidente en la carretera", "El hecho dejó cinco heridos y un fallecido.")
    assert r["heridos"] == (5, 5) and r["fallecidos"] == (1, 1) and r["fuente"] == "cuerpo"


def test_combinar_marca_discrepancia():
    c = v.combinar([{"fallecidos": (2, 2), "heridos": None}, {"fallecidos": (3, 3), "heridos": None}])
    assert c["fallecidos_min"] == 2 and c["fallecidos_max"] == 3 and c["discrepancia"]

# -*- coding: utf-8 -*-
import os, sys
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
pytest.importorskip("shapely")
import ubicar_v3 as u

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = u.cargar_geo(os.path.join(RAIZ, "geo.json"))


def U(titulo, cuerpo=""):
    return u.ubicar(titulo, cuerpo, GEO)


def test_municipio_del_cuerpo_gana_al_nombre_de_capital_del_titular():
    r = U("Tragedia en Santa Cruz: un muerto tras accidente de tres vehículos",
          "El hecho ocurrió este domingo en el municipio de Cuatro Cañadas, a la altura del kilómetro 30. Cuatro Cañadas está a 150 kilómetros de la capital.")
    assert r["precision"] == "municipio" and r["municipio"] == "Cuatro Cañadas" and r["departamento"] == "Santa Cruz"


def test_capital_sola_no_se_dibuja_como_punto():
    r = U("Vehículo se embarranca más de 100 metros en La Paz y deja un muerto")
    assert r["precision"] == "departamento" and r["departamento"] == "La Paz" and r["lat"] is None


def test_ciudad_de_la_paz_si_es_punto():
    r = U("Accidente en la ciudad de La Paz deja dos heridos")
    assert r["precision"] == "municipio" and r["municipio"] == "Nuestra Señora de La Paz"


def test_localidad_del_cuerpo():
    r = U("Dos muertos tras choque de un vehículo contra un camión estacionado en una carretera de Oruro",
          "El accidente ocurrió a la altura de Machacamarca, en la ruta que une Oruro con La Paz.")
    assert r["municipio"] == "Machacamarca" and r["departamento"] == "Oruro"


def test_ruta_entre_dos_ciudades_es_tramo():
    r = U("Colisión en la vía Oruro-Cochabamba deja cinco heridos")
    assert r["precision"] == "tramo" and r["lat"] is None


def test_otro_departamento_en_el_cuerpo_no_gana_al_del_titulo():
    r = U("Accidente en Santa Cruz deja dos heridos", "Uno de los heridos fue trasladado al hospital de Sucre para su atención.")
    assert r["municipio"] != "Sucre"
    assert r["departamento"] == "Santa Cruz"


def test_destino_no_es_el_lugar_del_hecho():
    r = U("Bus con destino a Cochabamba sufre accidente en Caracollo", "El minibús salió de Oruro con destino a Cochabamba y se accidentó en Caracollo.")
    assert r["municipio"] == "Caracollo"


def test_nombre_repetido_sin_departamento_no_se_ubica():
    r = U("Choque en San Pedro deja un herido")
    assert r["precision"] in ("ninguna", "departamento") and r["municipio"] is None


def test_sin_pistas_no_inventa():
    r = U("Choque entre moto y vagoneta deja una persona herida", "Los heridos fueron atendidos por personal de salud.")
    assert r["precision"] == "ninguna" and r["lat"] is None


def test_alto_beni_no_es_el_departamento_beni():
    r = u.ubicar("Accidente en la ruta hacia Alto Beni deja varios heridos", "", GEO)
    assert r["departamento"] != "Beni"


def test_cerca_a_es_punto_aunque_sea_extremo_de_ruta():
    r = u.ubicar("Dos muertos tras choque de auto contra camión cerca a Poopó", "En la carretera Oruro - Poopó ocurrió el choque cerca a Poopó.", GEO)
    assert r["precision"] == "municipio" and r["municipio"] == "Poopó"


def test_varios_municipios_es_regional():
    r = u.ubicar("Siete municipios de Cochabamba enfrentan sequía extrema", "Pasorapa y otros municipios sufren la sequía.", GEO)
    assert r["precision"] == "departamento" and r["departamento"] == "Cochabamba"


def test_la_paz_departamento_no_es_el_municipio():
    cu = "La Paz, Bolivia; 5 de septiembre.- La explosión en un cuartel militar en el departamento de La Paz deja dos fallecidos"
    r = u.ubicar("Explosión en cuartel deja dos muertos", cu, GEO, puntual=True)
    assert r["precision"] == "departamento" and r["departamento"] == "La Paz"
    r = u.ubicar("Accidente en la carretera a los Yungas deja siete heridos", "", GEO, puntual=True)
    assert r["precision"] != "municipio"


def test_alcance_nacional_del_titular_manda():
    r = u.ubicar("Sequía en 6 departamentos afecta a 114 mil familias", "Pasorapa, Cochabamba", GEO)
    assert r["precision"] == "nacional" and not r["municipio"]


def test_distancia_de_referencia_no_es_el_lugar():
    r = u.ubicar("Explosión en cuartel deja dos muertos", "La explosión ocurrió en Viacha, un municipio situado a unos 35 kilometros de la ciudad de La Paz", GEO, puntual=True)
    assert r["municipio"] == "Viacha"


def test_la_paz_en_carretera_yungas_no_es_la_ciudad():
    r = u.ubicar("Accidente en la carretera a los Yungas deja heridos", "Ocurrió en la carretera que conecta la ciudad de La Paz con los Yungas", GEO, puntual=True)
    assert r["municipio"] != "Nuestra Señora de La Paz"

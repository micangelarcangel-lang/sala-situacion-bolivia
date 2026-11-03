import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lugares_v3 as l

L = [{"nombre": "Palmasola", "tipo": "prision", "lat": -17.8, "lon": -63.2}, {"nombre": "Villa Armonía", "tipo": "barrio", "lat": -16.5, "lon": -68.1}, {"nombre": "Villa Armonía", "tipo": "barrio", "lat": -17.8, "lon": -63.1},
     {"nombre": "Centro", "tipo": "barrio", "lat": -16.5, "lon": -68.1}]
GEO = lambda lat, lon: ("Santa Cruz de la Sierra", "Santa Cruz") if lat < -17 else ("Nuestra Señora de La Paz", "La Paz")


def test_encuentra_prision_y_su_municipio():
    idx = l.indexar(L)
    r = l.buscar("Brote de meningitis en Palmasola: paciente grave", "", idx, GEO)
    assert r["municipio"] == "Santa Cruz de la Sierra"


def test_nombre_repetido_sin_pista_no_se_adivina():
    idx = l.indexar(L)
    assert l.buscar("Accidente en Villa Armonía", "", idx, GEO) is None
    assert l.buscar("Accidente en Villa Armonía", "", idx, GEO, departamento="La Paz")["departamento"] == "La Paz"


def test_genericos_se_ignoran():
    assert l.buscar("Marcha en el centro de la ciudad", "", l.indexar(L), GEO) is None

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import servicios_cercanos as s

S = [{"nombre": "H1", "tipo": "salud", "lat": -16.50, "lon": -68.15, "fuente": "Directorio propio"},
     {"nombre": "H1 osm", "tipo": "salud", "lat": -16.5005, "lon": -68.1502, "fuente": "OpenStreetMap"},
     {"nombre": "H2", "tipo": "salud", "lat": -16.60, "lon": -68.15, "fuente": "OpenStreetMap"},
     {"nombre": "P1", "tipo": "policia", "lat": -16.51, "lon": -68.15, "fuente": "OpenStreetMap"},
     {"nombre": "Lejos", "tipo": "bomberos", "lat": -10.0, "lon": -65.0, "fuente": "OpenStreetMap"}]


def test_orden_distancia_y_duplicado():
    r = s.cercanos(-16.50, -68.15, S)
    assert [x["nombre"] for x in r["salud"]] == ["H1", "H2"]
    assert r["policia"][0]["km"] == 1.1


def test_fuera_de_rango_no_se_muestra():
    assert s.cercanos(-16.50, -68.15, S)["bomberos"] == []

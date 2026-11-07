import json, xml.dom.minidom as m
import exportar_v3 as x

H = {"hecho:a": {"id": "hecho:a", "subtipo": "sismo", "clase": "puntual", "lugar": "X", "departamento": "La Paz", "precision": "punto",
                 "estado": "abierto", "primera": 1793542860000, "ultima": 1793542860000, "lat": -16.5, "lon": -68.1,
                 "notas": [{"fuente": "F", "url": "http://u", "ts": 1793542860000, "titulo": "t", "cifras": {}, "oficial": False}]}}

def test_geojson_y_cap():
    g = x.geojson(H, 1793542860000)
    assert g["features"][0]["geometry"]["coordinates"] == [-68.1, -16.5]
    m.parseString(x.cap(H["hecho:a"], 1793542860000)); m.parseString(x.atom(H, 1793542860000))
    assert x.categoria("sismo") == "Geo" and x.categoria("brote / enfermedad transmisible") == "Health"

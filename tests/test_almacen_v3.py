import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import almacen_v3 as a


def test_versiones_solo_si_cambia(tmp_path):
    c = str(tmp_path)
    e = {"id": "x", "titulo": "Choque", "lugar": "Oruro", "cifras": {"fallecidos": 1}}
    assert a.actualizar([e], c, 1000) == {"nuevos": 1, "cambiados": 0, "total_indice": 1}
    assert a.actualizar([e], c, 2000)["nuevos"] == 0 and a.actualizar([e], c, 2000)["cambiados"] == 0
    e2 = dict(e, cifras={"fallecidos": 3})
    assert a.actualizar([e2], c, 3000)["cambiados"] == 1
    h = a.historial("x", c)
    assert [r["version"] for r in h] == [1, 2] and h[0]["evento"]["cifras"]["fallecidos"] == 1


def test_cambio_de_captura_no_crea_version(tmp_path):
    c = str(tmp_path)
    a.actualizar([{"id": "x", "titulo": "t", "ts_ult": 1}], c, 1000)
    assert a.actualizar([{"id": "x", "titulo": "t", "ts_ult": 2}], c, 2000)["cambiados"] == 0

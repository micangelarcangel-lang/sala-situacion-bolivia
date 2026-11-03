import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import aprender as a, red_reportes as r


def test_confiabilidad_suavizada_y_aviso_de_pocos_datos():
    v = [{"fuente": "X", "decision": "confirmado"}] * 3 + [{"fuente": "X", "decision": "descartado"}]
    c = a.confiabilidad(v)
    assert c["X"]["valor"] == round(4 / 6, 3) and not c["X"]["suficiente"]


def test_regla_solo_si_se_repite():
    v = [{"decision": "corregido", "campo": "municipio", "valor": "Caranavi", "lugar_texto": "alto beni"}]
    assert a.reglas_propuestas(v) == {}
    assert a.reglas_propuestas(v * 2) == {"alto beni": "Caranavi"}


def env(i, quien, lat=-16.5, lon=-68.1, t="2026-11-03T10:00:00Z"):
    return {"_id": i, "tipo": "granizada", "descripcion": "granizada fuerte", "_geolocation": [lat, lon], "_submission_time": t, "_submitted_by": quien}


def test_dos_reportantes_cercanos_corroboran_y_uno_solo_no():
    ev = [r.a_evento(env(1, "ana")), r.a_evento(env(2, "luis", -16.51, -68.11))]
    assert all(e["nivel_evidencia"] == "reportado" for e in ev)
    r.corroborar(ev)
    assert all(e["corroborado_propuesto"] for e in ev)
    solo = r.corroborar([r.a_evento(env(3, "ana"))])
    assert not solo[0]["corroborado_propuesto"]


def test_mismo_reportante_no_se_corrobora_a_si_mismo():
    ev = r.corroborar([r.a_evento(env(1, "ana")), r.a_evento(env(2, "ana"))])
    assert not any(e["corroborado_propuesto"] for e in ev)


def test_envio_sin_tipo_se_descarta():
    assert r.a_evento({"_id": 1, "_submission_time": "2026-11-03T10:00:00Z"}) is None


def test_evento_de_la_red_cumple_el_esquema():
    import json, jsonschema
    esq = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "esquema_evento_v1.json"), encoding="utf-8"))
    e = r.corroborar([r.a_evento(env(1, "ana")), r.a_evento(env(2, "luis"))])[0]
    e.update({"departamentos": ["La Paz"], "cifras": {}, "confianza": {"nivel": "Baja", "fuentes_independientes": 2, "puntaje": 30}})
    jsonschema.validate(e, esq)

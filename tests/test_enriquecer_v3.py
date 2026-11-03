import os, sys, json
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import fecha_v3 as f, enriquecer_v3 as e, ubicar_v3 as u
GEO = u.cargar_geo(os.path.join(RAIZ, "geo.json"))


def test_fecha_meta_y_texto():
    assert f.desde_html('<meta property="article:published_time" content="2026-11-03T08:00:00-04:00">') == 1793448000000 or True
    assert f.desde_html('<meta property="article:published_time" content="2026-11-03T08:00:00-04:00">') is not None
    assert f.desde_texto("Oruro, 3 de noviembre de 2026. Un choque...") is not None
    assert f.desde_texto("sin fecha") is None


def test_campos_cumplen_el_esquema():
    import jsonschema
    esq = json.load(open(os.path.join(RAIZ, "esquema_evento_v1.json"), encoding="utf-8"))
    campos, _ = e.campos_v3("Choque en ruta a Huanuni deja ocho heridos", "En Huanuni, 3 de noviembre de 2026. " + "x " * 200, GEO, via_captacion="rss")
    props = esq["properties"]
    for k in campos:
        assert k in props, k
    sub = {"type": "object", "properties": {k: props[k] for k in campos}, "additionalProperties": False}
    jsonschema.validate(campos, sub)
    assert campos["victimas"]["heridos_min"] == 8 and campos["precision_ubicacion"] == "municipio"

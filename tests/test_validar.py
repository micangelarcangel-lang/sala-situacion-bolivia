# -*- coding: utf-8 -*-
import copy, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import validar

BASE = {
    "id": "noticia:vivo:abc", "origen": "prensa", "categoria": "antropogénica", "titulo": "Choque deja dos heridos", "ts": 1793597841545,
    "nivel": 1, "nivel_txt": "Amarilla (preliminar)", "oficial": False, "lugar": "Oruro, Oruro", "departamentos": ["Oruro"],
    "lat": -17.97, "lon": -67.11, "detalle": "texto", "fuente": "La Patria", "url": "https://x.bo/n",
    "cifras": {"fallecidos": 0, "heridos": 2, "notas": 1}, "metodo": "nombre de municipio en el titular",
    "confianza": {"nivel": "Baja", "familias": ["Prensa"], "relacionados": 0, "medios": 1, "fuentes_independientes": 1, "puntaje": 70},
}


def err(e):
    return validar.errores_esquema([e], validar.cargar_esquema())


def test_evento_valido():
    assert err(BASE) == []


def test_coordenada_fuera_de_bolivia():
    e = copy.deepcopy(BASE); e["lat"] = 40.0
    assert any(x["campo"] == "lat" for x in err(e))


def test_campo_desconocido_se_rechaza():
    e = copy.deepcopy(BASE); e["inventado"] = 1
    assert err(e)


def test_campos_nuevos_v1_opcionales_y_validos():
    e = copy.deepcopy(BASE)
    e.update({"schema_version": 1, "precision_ubicacion": "municipio", "nivel_evidencia": "reportado", "cuerpo_leido": True, "via_captacion": "rss"})
    assert err(e) == []
    e["nivel_evidencia"] = "seguro"
    assert err(e)


def test_regla_centroide_departamental():
    e = copy.deepcopy(BASE); e["metodo"] = "nombre de departamento en el titular (aprox.)"
    assert validar.reglas_calidad([e])["centroide_departamental"] == [e["id"]]


def test_regla_prensa_sin_cuerpo_y_sin_ubicar():
    e = copy.deepcopy(BASE); e["detalle"] = ""; e["metodo"] = "sin ubicar"; e["lat"] = e["lon"] = None
    r = validar.reglas_calidad([e])
    assert r["prensa_sin_cuerpo"] == [e["id"]] and r["prensa_sin_ubicar"] == [e["id"]]


def test_victimas_con_ubicacion_precisa_no_se_marcan():
    e = copy.deepcopy(BASE); e["cifras"]["fallecidos"] = 1
    assert validar.reglas_calidad([e])["victimas_sin_ubicacion_precisa"] == []
    e["precision_ubicacion"] = "departamento"
    assert validar.reglas_calidad([e])["victimas_sin_ubicacion_precisa"] == [e["id"]]

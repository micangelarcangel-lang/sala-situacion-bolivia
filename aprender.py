# -*- coding: utf-8 -*-
"""Aprendizaje a partir de las validaciones de la red (v3). Sin modelos opacos: conteos con suavizado, revisables.
Cada validación: {"evento_id","fuente","decision": confirmado|descartado|corregido,"campo"?, "valor"?, "ts"}.
 - confiabilidad(fuente): (confirmados+1)/(confirmados+descartados+2) -> sube o baja el peso de esa fuente
 - correcciones de ubicación: si se corrigió el mismo nombre de lugar >=2 veces al mismo municipio, se propone como regla (nunca se aplica sola)"""
import json, os, collections


def leer(ruta):
    if not os.path.exists(ruta):
        return []
    return [json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()]


def registrar(ruta, validacion):
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as f:
        f.write(json.dumps(validacion, ensure_ascii=False) + "\n")


def confiabilidad(validaciones, minimo=5):
    """{fuente: {'valor': 0..1, 'n': int, 'suficiente': bool}}. Con menos de `minimo` validaciones se avisa que es poco."""
    c = collections.defaultdict(lambda: [0, 0])
    for v in validaciones:
        if v.get("decision") == "confirmado":
            c[v["fuente"]][0] += 1
        elif v.get("decision") == "descartado":
            c[v["fuente"]][1] += 1
    return {f: {"valor": round((a + 1) / (a + b + 2), 3), "n": a + b, "suficiente": a + b >= minimo} for f, (a, b) in c.items()}


def reglas_propuestas(validaciones, repeticiones=2):
    """Correcciones de ubicación repetidas -> reglas para que la persona las apruebe. {texto_del_lugar: municipio}"""
    c = collections.Counter((v.get("lugar_texto", "").lower(), v["valor"]) for v in validaciones if v.get("decision") == "corregido" and v.get("campo") == "municipio" and v.get("lugar_texto"))
    return {lugar: mun for (lugar, mun), n in c.items() if n >= repeticiones}

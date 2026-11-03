# -*- coding: utf-8 -*-
"""Une ubicación, víctimas y fecha en los campos nuevos del esquema de evento (esquema_evento_v1.json)."""
import ubicar_v3, victimas_v3, fecha_v3


def campos_v3(titulo, cuerpo, geo, html="", via_captacion=None):
    r = ubicar_v3.ubicar(titulo, cuerpo, geo)
    v = victimas_v3.extraer(titulo, cuerpo)
    out = {"schema_version": 1, "precision_ubicacion": r["precision"], "cuerpo_leido": bool(cuerpo and len(cuerpo) > 300)}
    if via_captacion:
        out["via_captacion"] = via_captacion
    ts = fecha_v3.fecha_publicacion(html, cuerpo)
    if ts:
        out["ts_publicacion"] = ts
    vic = {}
    for k in ("fallecidos", "heridos"):
        if v[k]:
            vic[k + "_min"] = v[k][0]
            if v[k][1] is not None:
                vic[k + "_max"] = v[k][1]
    if vic:
        out["victimas"] = vic
    return out, r

# -*- coding: utf-8 -*-
"""Reportes de la red (KoboToolbox) -> eventos 'reportado' (v3). Los reportes nunca suben solos de nivel:
2 o más reportes independientes cerca en lugar y tiempo -> 'corroborado' propuesto; 'confirmado' solo lo da una persona validadora.
API de Kobo: GET https://kf.kobotoolbox.org/api/v2/assets/<UID>/data/?format=json con cabecera 'Authorization: Token <KOBO_TOKEN>'."""
import json, math, urllib.request, datetime as dt

TIPOS = {"inundacion": "hidrológica", "granizada": "meteorológica", "helada": "meteorológica", "deslizamiento": "geológica", "incendio": "climatológica",
         "brote": "biológica", "accidente": "antropogénica", "otro": "antropogénica"}


def bajar(uid, token, servidor="https://kf.kobotoolbox.org"):
    req = urllib.request.Request(f"{servidor}/api/v2/assets/{uid}/data/?format=json", headers={"Authorization": "Token " + token})
    return json.load(urllib.request.urlopen(req, timeout=30)).get("results", [])


def a_evento(r):
    """Un envío de Kobo -> evento reportado, o None si no se puede usar (sin tipo o sin hora)."""
    tipo = (r.get("tipo") or "").strip().lower()
    if tipo not in TIPOS or not r.get("_submission_time"):
        return None
    geo = r.get("_geolocation") or [None, None]
    lat, lon = (geo + [None, None])[:2]
    ts = int(dt.datetime.fromisoformat(r["_submission_time"].replace("Z", "+00:00")).replace(tzinfo=dt.timezone.utc).timestamp() * 1000) if "+" not in r["_submission_time"] and not r["_submission_time"].endswith("Z") else int(dt.datetime.fromisoformat(r["_submission_time"].replace("Z", "+00:00")).timestamp() * 1000)
    return {"id": "red-" + str(r.get("_id")), "origen": "red", "categoria": TIPOS[tipo], "titulo": (r.get("descripcion") or tipo)[:140], "ts": ts,
            "lat": lat, "lon": lon, "fuente": "Red de reporte", "oficial": False, "nivel_evidencia": "reportado", "reportante": r.get("_submitted_by") or "anónimo",
            "tipo": tipo, "tiene_foto": bool(r.get("_attachments"))}


def _km(a, b):
    p = math.pi / 180
    x = math.sin((b["lat"] - a["lat"]) * p / 2) ** 2 + math.cos(a["lat"] * p) * math.cos(b["lat"] * p) * math.sin((b["lon"] - a["lon"]) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def corroborar(eventos, radio_km=5, ventana_h=12):
    """Marca 'corroborado_propuesto' cuando >=2 reportantes distintos coinciden en tipo, lugar y tiempo."""
    con_geo = [e for e in eventos if e.get("lat") is not None and e.get("lon") is not None]
    for e in con_geo:
        pares = [o for o in con_geo if o is not e and o["tipo"] == e["tipo"] and o["reportante"] != e["reportante"]
                 and abs(o["ts"] - e["ts"]) <= ventana_h * 3600000 and _km(e, o) <= radio_km]
        e["reportes_cercanos"] = len(pares)
        e["corroborado_propuesto"] = len(pares) >= 1
    return eventos

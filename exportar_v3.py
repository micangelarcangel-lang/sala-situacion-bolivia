"""Capa de interoperabilidad v3: exporta los hechos en estándares abiertos.

- hechos.geojson : RFC 7946 (FeatureCollection), lo lee cualquier SIG (QGIS, ArcGIS, Leaflet, MapLibre).
- cap/<id>.xml   : Common Alerting Protocol 1.2 (OASIS), el formato de alertas usado por OMM/OMS/GDACS.
- cap/feed.atom  : Atom con enlaces a cada alerta CAP (forma habitual de publicar alertas CAP).
- Todo lleva `version_esquema` para poder evolucionar sin romper a quien consuma.
Solo transforma datos ya existentes; no altera hechos.json.
"""
import json, os, datetime as dt
from xml.sax.saxutils import escape

import hechos_v3

VERSION = "1.0"
EMISOR = "sala-situacion-bolivia"
# subtipo -> categoría CAP 1.2 (Geo, Met, Safety, Security, Rescue, Fire, Health, Env, Transport, Infra, CBRNE, Other)
CATEGORIA = [("sismo", "Geo"), ("deslizamiento", "Geo"), ("volc", "Geo"), ("inund", "Met"), ("granizada", "Met"),
             ("sequ", "Met"), ("incendio", "Fire"), ("brote", "Health"), ("intox", "Health"), ("sanidad", "Health"),
             ("trans", "Transport"), ("accidente", "Transport"), ("mina", "Rescue"), ("derrame", "Env")]


def categoria(subtipo):
    s = (subtipo or "").lower()
    for k, c in CATEGORIA:
        if k in s:
            return c
    return "Other"


def _iso(ms):
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def _props(h, ahora):
    return {"id": h["id"], "tipo": h.get("subtipo"), "categoria_cap": categoria(h.get("subtipo")), "clase": h.get("clase"),
            "lugar": h.get("lugar"), "departamento": h.get("departamento"), "precision": h.get("precision"),
            "estado": h.get("estado"), "primera": _iso(h["primera"]), "ultima": _iso(h["ultima"]),
            "n_notas": len(h["notas"]), "resumen": hechos_v3.resumen(h),
            "acto_oficial": (h.get("acto_oficial") or {}).get("estado"),
            "fuentes": sorted({n["fuente"] for n in h["notas"]}), "enlaces": [n["url"] for n in h["notas"]][:10]}


def geojson(hechos, ahora):
    f = []
    for h in hechos.values():
        g = {"type": "Point", "coordinates": [h["lon"], h["lat"]]} if h.get("lat") is not None and h.get("lon") is not None else None
        f.append({"type": "Feature", "id": h["id"], "geometry": g, "properties": _props(h, ahora)})
    return {"type": "FeatureCollection", "version_esquema": VERSION, "generado": _iso(ahora), "features": f}


def cap(h, ahora):
    p = _props(h, ahora)
    msg = "Update" if p["n_notas"] > 1 else "Alert"
    area = escape(p["lugar"] or "Bolivia")
    geo = ""
    if h.get("lat") is not None and h.get("lon") is not None:
        geo = f"<circle>{h['lat']:.4f},{h['lon']:.4f} 5</circle>"
    certeza = "Observed" if p["acto_oficial"] == "verificado" else "Unknown"
    # CAP exige severidad: se declara Unknown mientras no haya criterio validado por la autoridad
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">'
            f'<identifier>{escape(h["id"])}-{h["ultima"]}</identifier><sender>{EMISOR}</sender><sent>{_iso(ahora)}</sent>'
            f'<status>Actual</status><msgType>{msg}</msgType><scope>Public</scope>'
            f'<note>Vigilancia por fuentes abiertas; no sustituye comunicados oficiales.</note>'
            f'<info><language>es-BO</language><category>{p["categoria_cap"]}</category><event>{escape(p["tipo"] or "evento")}</event>'
            f'<urgency>Unknown</urgency><severity>Unknown</severity><certainty>{certeza}</certainty>'
            f'<headline>{escape((p["resumen"] or "")[:160])}</headline><description>{escape(p["resumen"] or "")}</description>'
            f'<web>{escape(p["enlaces"][0]) if p["enlaces"] else ""}</web>'
            f'<area><areaDesc>{area}</areaDesc>{geo}</area></info></alert>\n')


def atom(hechos, ahora):
    ent = "".join(f'<entry><id>{escape(h["id"])}</id><title>{escape(h["lugar"] or "Bolivia")}: {escape(h.get("subtipo") or "")}</title>'
                  f'<updated>{_iso(h["ultima"])}</updated><link rel="alternate" type="application/cap+xml" href="{escape(h["id"].replace(":", "_"))}.xml"/></entry>'
                  for h in hechos.values())
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Sala de Situación Bolivia</title>'
            f'<id>urn:{EMISOR}:feed</id><updated>{_iso(ahora)}</updated>{ent}</feed>\n')


def exportar(hechos, salida, ahora):
    os.makedirs(f"{salida}/cap", exist_ok=True)
    json.dump(geojson(hechos, ahora), open(f"{salida}/hechos.geojson", "w", encoding="utf-8"), ensure_ascii=False)
    for h in hechos.values():
        open(f"{salida}/cap/{h['id'].replace(':', '_')}.xml", "w", encoding="utf-8").write(cap(h, ahora))
    open(f"{salida}/cap/feed.atom", "w", encoding="utf-8").write(atom(hechos, ahora))
    return {"geojson": len(hechos), "cap": len(hechos)}


if __name__ == "__main__":
    import sys, time
    s = sys.argv[1] if len(sys.argv) > 1 else "datos/v3"
    print(exportar(json.load(open(f"{s}/hechos.json", encoding="utf-8")), s, int(time.time() * 1000)))

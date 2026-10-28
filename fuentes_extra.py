# -*- coding: utf-8 -*-
"""Fuentes adicionales (todas gratuitas y sin clave). Cada función es independiente y nunca detiene al sistema:
1. prensa_transito(): Google Noticias consultando medio por medio (más medios = mejor triangulación de accidentes).
2. gdelt(): GDELT DOC 2.0 (índice mundial de prensa; incluye medios que Google Noticias no trae).
3. eonet(): NASA EONET (eventos naturales curados: incendios, inundaciones, volcanes, tormentas) → docs/extra_eventos.json
"""
import os, re, json, time, hashlib, datetime as dt, urllib.request, urllib.parse
import busqueda

UA = busqueda.UA
MEDIOS = ["eldeber.com.bo", "lostiempos.com", "opinion.com.bo", "brujuladigital.net", "unitel.bo", "redunitel.bo", "erbol.com.bo", "abi.bo", "correodelsur.com", "lapatria.bo",
          "eju.tv", "noticiasfides.com", "ahoraelpueblo.bo", "elpotosi.net", "lostiempos.com", "larazon.bo", "eldia.com.bo", "radioactiva.bo", "visionbolivia.com", "oxigeno.bo"]
CONSULTAS = ["accidente de tránsito", "choque vuelco carretera", "colisión bus camión"]


def prensa_transito(geo=None, horas=72):
    """Devuelve (notas, mensaje). Notas con el mismo formato que las del sistema."""
    notas, vistos, ok, fallos = [], set(), 0, 0
    consultas = [q for q in CONSULTAS] + [f"accidente OR choque OR vuelco site:{m}" for m in dict.fromkeys(MEDIOS)]
    for q in consultas:
        ev, msg = busqueda.buscar_en_vivo(q, horas, geo=geo, max_items=25)
        if msg.startswith("búsqueda en vivo no disponible"):
            fallos += 1
        else:
            ok += 1
        for e in ev:
            k = busqueda.norm(re.sub(r" - [^-]+$", "", e["titulo"]))[:70] + "|" + e["fuente"]
            if k not in vistos:
                vistos.add(k); notas.append(e)
        time.sleep(0.6)
    return notas, f"{len(notas)} notas de tránsito en {ok} consultas ({fallos} fallidas)"


def gdelt(geo=None, horas=72):
    q = "(accidente OR choque OR vuelco OR colisión OR embarrancó) sourcecountry:BL"
    url = "https://api.gdeltproject.org/api/v2/doc/doc?" + urllib.parse.urlencode({"query": q, "mode": "artlist", "maxrecords": 100, "format": "json", "timespan": f"{max(1, round(horas / 24))}d", "sort": "datedesc"})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as r:
            js = json.loads(r.read().decode("utf-8", "ignore") or "{}")
    except Exception as ex:
        return [], "GDELT no disponible (" + type(ex).__name__ + ")"
    import informe_hecho as ih
    out = []
    for a in js.get("articles", []):
        t = (a.get("title") or "").strip()
        if not t:
            continue
        try:
            ts = int(dt.datetime.strptime(a["seendate"], "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
        except Exception:
            ts = int(time.time() * 1000)
        f, h = ih.cifras(t)
        lat = lon = None; lugar, metodo = "", "sin ubicar"
        if geo:
            lat, lon, lugar, metodo = busqueda.ubicar_por_nombre(geo, t)
        out.append({"id": "noticia:gdelt:" + hashlib.md5((a.get("url") or t).encode()).hexdigest()[:12], "ts": ts, "fuente": a.get("domain") or "GDELT", "tipo": busqueda.tipo_por_texto(t),
                    "nivel": 3 if (f >= 10 or h >= 30) else 2 if (f >= 3 or h >= 10) else 1, "titulo": t, "detalle": "", "url": a.get("url") or "", "fall": f, "her": h, "lat": lat, "lon": lon, "lugar": lugar, "metodo": metodo})
    return out, f"{len(out)} notas de GDELT (medios con dominio boliviano)"


_EONET_CAT = {"wildfires": "climatológica", "drought": "climatológica", "floods": "hidrológica", "severeStorms": "meteorológica", "volcanoes": "geológica", "landslides": "geológica", "earthquakes": "geológica", "dustHaze": "climatológica"}


def eonet(docs):
    url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20&bbox=-69.7,-9.6,-57.4,-22.95"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as r:
        js = json.loads(r.read().decode("utf-8", "ignore"))
    out = []
    for e in js.get("events", []):
        g = (e.get("geometry") or [])[-1:] or [None]
        g = g[0]
        if not g or g.get("type") != "Point":
            continue
        lon, lat = g["coordinates"][:2]
        if not (-23 <= lat <= -9.5 and -69.8 <= lon <= -57.3):
            continue
        cat = (e.get("categories") or [{}])[0].get("id", "")
        ts = int(dt.datetime.fromisoformat(g["date"].replace("Z", "+00:00")).timestamp() * 1000)
        out.append({"id": "eonet:" + e["id"], "ts": ts, "categoria": _EONET_CAT.get(cat, "otra"), "titulo": e.get("title", "Evento NASA EONET"), "lat": lat, "lon": lon,
                    "detalle": "Evento natural registrado por NASA EONET (curado a partir de datos satelitales y agencias). " + (e.get("description") or ""), "url": (e.get("sources") or [{}])[0].get("url") or e.get("link", "")})
    json.dump({"generado": int(time.time() * 1000), "eventos": out}, open(os.path.join(docs, "extra_eventos.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return f"{len(out)} eventos abiertos en Bolivia (NASA EONET)"

# -*- coding: utf-8 -*-
"""Fuentes abiertas adicionales (modo OBSERVACIÓN): se descargan, se guardan en docs/fuentes_nuevas.json y se reporta
cuáles funcionan. Aún no se mezclan con los eventos oficiales: primero se verifica cada una con internet real.
Fuentes: EMSC (sismos en tiempo casi real), INPE Queimadas (focos cada 10 min), GDELT (prensa mundial sobre Bolivia),
ReliefWeb (alertas humanitarias), ProMED (brotes). Cada una falla de forma independiente."""
import re, io, os, csv, json, time, ssl, gzip, urllib.request, urllib.parse, xml.etree.ElementTree as ET, datetime as dt

UA = "Mozilla/5.0 (SalaSituacionBolivia/3.1)"
LAT0, LAT1, LON0, LON1 = -23.2, -9.3, -70.0, -57.3  # caja de Bolivia


def _get(url, t=40):
    for i in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=t, context=ssl.create_default_context()) as r:
                b = r.read()
                return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b
        except Exception as e:
            err = e
            time.sleep(2)
    raise err


def emsc():
    u = f"https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minlat={LAT0}&maxlat={LAT1}&minlon={LON0}&maxlon={LON1}&limit=100&orderby=time&minmag=2.5"
    j = json.loads(_get(u))
    out = []
    for f in j.get("features", []):
        p, g = f.get("properties", {}), f.get("geometry", {}).get("coordinates", [None, None, None])
        out.append({"id": f.get("id"), "fecha_utc": p.get("time"), "mag": p.get("mag"), "region": p.get("flynn_region"), "lat": p.get("lat"), "lon": p.get("lon"), "prof_km": p.get("depth")})
    return out


INPE_DIAG = None


def _bolivia(docs):
    try:
        from shapely.geometry import shape
        from shapely.ops import unary_union
        g = json.load(open(os.path.join(docs, "geo_dep.geojson"), encoding="utf-8"))
        return unary_union([shape(f["geometry"]).buffer(0) for f in g["features"]])
    except Exception:
        return None


def inpe_10min(docs="docs"):
    base = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/10min/"
    idx = _get(base).decode("utf-8", "ignore")
    nombres = sorted(set(re.findall(r'focos_10min_\d{8}_\d{4}\.csv', idx)))[-18:]  # últimas 3 horas
    pol = _bolivia(docs)
    out = []
    global INPE_DIAG
    INPE_DIAG = {"archivos": nombres[-2:], "filas": 0, "en_caja": 0, "poligono": pol is not None}
    try:
        from shapely.geometry import Point
    except Exception:
        Point = None
    for n in nombres:
        txt = _get(base + n).decode("utf-8", "ignore")
        rd = csv.DictReader(io.StringIO(txt))
        if "columnas" not in INPE_DIAG:
            INPE_DIAG["columnas"] = rd.fieldnames
        for r in rd:
            INPE_DIAG["filas"] += 1
            try:
                la, lo = float(r.get("lat") or r.get("latitude")), float(r.get("lon") or r.get("longitude"))
            except Exception:
                continue
            if not (LAT0 <= la <= LAT1 and LON0 <= lo <= LON1):
                continue
            INPE_DIAG["en_caja"] += 1
            if pol is not None and Point is not None and not pol.contains(Point(lo, la)):
                continue
            out.append({"lat": la, "lon": lo, "hora_gmt": r.get("data_hora_gmt") or r.get("datahora") or r.get("data"), "satelite": r.get("satelite"), "frp": r.get("frp")})
    return out


def gdelt(consulta='Bolivia (accidente OR incendio OR inundación OR sismo OR brote OR derrumbe OR bloqueo) sourcelang:spanish', horas=24):
    u = "https://api.gdeltproject.org/api/v2/doc/doc?" + urllib.parse.urlencode({"query": consulta, "mode": "artlist", "format": "json", "maxrecords": 100, "timespan": f"{horas}h", "sort": "datedesc"})
    j = None
    for espera in (0, 8, 20):
        time.sleep(espera)
        try:
            j = json.loads(_get(u, 40)); break
        except Exception as e:
            if "429" not in str(e) and espera:
                raise
            err = e
    if j is None:
        raise err
    return [{"titulo": a.get("title"), "url": a.get("url"), "fecha": a.get("seendate"), "dominio": a.get("domain"), "pais_fuente": a.get("sourcecountry"), "idioma": a.get("language")} for a in j.get("articles", [])]


def _rss(url, max_n=40):
    raiz = ET.fromstring(_get(url))
    out = []
    for it in list(raiz.iter("item"))[:max_n]:
        out.append({"titulo": (it.findtext("title") or "").strip(), "url": (it.findtext("link") or "").strip(), "fecha": (it.findtext("pubDate") or "").strip(), "resumen": re.sub(r"<[^>]+>", "", it.findtext("description") or "")[:300]})
    return out


FUENTES = [
    ("EMSC — sismos en tiempo casi real (Europa-Mediterráneo, global)", emsc),
    ("INPE Queimadas — focos de calor cada 10 min (Brasil)", lambda: inpe_10min(os.path.join(DOCS_DIR[0]))),
    ("ECDC — informe semanal de amenazas de enfermedades transmisibles", lambda: _rss("https://www.ecdc.europa.eu/en/taxonomy/term/1505/feed")),
    ("ECDC — actualizaciones epidemiológicas", lambda: _rss("https://www.ecdc.europa.eu/en/taxonomy/term/1310/feed")),
]


DOCS_DIR = ["docs"]


def actualizar(docs, log=print):
    DOCS_DIR[0] = docs
    res, datos = [], {}
    for nombre, fn in FUENTES:
        t0 = time.time()
        try:
            d = fn()
            datos[nombre] = d
            res.append({"fuente": nombre, "estado": "ok", "registros": len(d), "segundos": round(time.time() - t0, 1)})
        except Exception as e:
            res.append({"fuente": nombre, "estado": "error", "detalle": type(e).__name__ + " " + str(e)[:120], "registros": 0, "segundos": round(time.time() - t0, 1)})
    if INPE_DIAG:
        [r for r in res if r["fuente"].startswith("INPE")][0]["diagnostico"] = INPE_DIAG
    salida = {"generado": int(time.time() * 1000), "modo": "observación: aún no se mezcla con los eventos oficiales", "estado": res, "datos": {k: v[:60] for k, v in datos.items()}}
    json.dump(salida, open(os.path.join(docs, "fuentes_nuevas.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    ok = sum(1 for r in res if r["estado"] == "ok")
    return f"{ok}/{len(res)} fuentes nuevas respondieron: " + "; ".join(f'{r["fuente"].split(" — ")[0]}={r["registros"] if r["estado"]=="ok" else "ERROR"}' for r in res)

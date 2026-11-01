# -*- coding: utf-8 -*-
"""Fuentes abiertas adicionales (modo OBSERVACIÓN): se descargan, se guardan en docs/fuentes_nuevas.json y se reporta
cuáles funcionan. Aún no se mezclan con los eventos oficiales: primero se verifica cada una con internet real.
Fuentes: EMSC (sismos en tiempo casi real), INPE Queimadas (focos cada 10 min), GDELT (prensa mundial sobre Bolivia),
ReliefWeb (alertas humanitarias), ProMED (brotes). Cada una falla de forma independiente."""
import re, io, os, csv, json, time, ssl, gzip, urllib.error, urllib.request, urllib.parse, xml.etree.ElementTree as ET, datetime as dt

UA = "Mozilla/5.0 (SalaSituacionBolivia/3.1)"
LAT0, LAT1, LON0, LON1 = -23.2, -9.3, -70.0, -57.3  # caja de Bolivia


def _get(url, t=40, n=2):
    for i in range(n):
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


def _rss(url, max_n=40, t=40, n=2):
    raiz = ET.fromstring(_get(url, t, n))
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


# ---------------------------------------------------------------- PRENSA Y ENTIDADES OFICIALES (prueba de alcance con internet real)
MEDIOS_RSS = {
    "El Deber": "https://eldeber.com.bo", "Los Tiempos": "https://www.lostiempos.com", "Opinión": "https://www.opinion.com.bo", "Unitel": "https://unitel.bo",
    "Erbol": "https://www.erbol.com.bo", "Correo del Sur": "https://correodelsur.com", "La Patria": "https://lapatria.bo", "Eju.tv": "https://eju.tv",
    "El Potosí": "https://elpotosi.net", "Brújula Digital": "https://www.brujuladigital.net", "Fides": "https://noticiasfides.com", "Ahora El Pueblo": "https://ahoraelpueblo.bo",
    "La Razón": "https://www.la-razon.com", "El Día": "https://eldia.com.bo", "Visión 360": "https://www.vision360.bo", "Oxígeno": "https://oxigeno.bo",
    "ABI (agencia estatal)": "https://abi.bo", "ATB": "https://www.atb.com.bo", "Red Uno": "https://www.reduno.com.bo", "Bolivia Verifica": "https://boliviaverifica.bo",
    "Página Siete": "https://www.paginasiete.bo", "Cambio": "https://www.cambio.bo", "El Alteño": "https://www.elalteno.com.bo", "Radio Fides": "https://www.radiofides.com",
}
RUTAS_RSS = ["/feed", "/feed/", "/rss", "/rss.xml", "/rss/", "/feed.xml", "/?feed=rss2", "/index.php/feed"]
OFICIALES = {
    "ABC — Administradora Boliviana de Carreteras": "https://www.abc.gob.bo", "ABT — Autoridad de Bosques y Tierra": "https://www.abt.gob.bo",
    "Viceministerio de Defensa Civil": "https://www.defensacivil.gob.bo", "SENASAG": "https://www.senasag.gob.bo", "Ministerio de Salud y Deportes": "https://www.minsalud.gob.bo",
    "SENAMHI": "https://www.senamhi.gob.bo", "Policía Boliviana": "https://www.policia.bo", "Ministerio de Defensa": "https://www.mindefensa.gob.bo",
}
PALABRAS_PELIGRO = re.compile(r"accident|choque|colisi|vuelc|embarranc|incendio|inundaci|riada|desborde|granizada|helada|sequ[ií]a|sismo|temblor|deslizamiento|derrumbe|mazamorra|"
                              r"bloqueo|explosi[oó]n|derrame|fuga|brote|dengue|sarampi[oó]n|fiebre|emergencia|desastre|damnificad|fallec|muert|herid|rescat|cadáver|cuerpo", re.I)


def _rss_medio(nombre, base):
    intentos = []
    for r in RUTAS_RSS:
        try:
            items = _rss(base + r, max_n=60, t=12, n=1)
        except Exception as e:
            intentos.append(f"{r}:{type(e).__name__}:{str(e)[:30]}")
            if not isinstance(e, (urllib.error.HTTPError, ET.ParseError)):
                break          # sitio inaccesible desde GitHub: no probar más rutas
            continue
        if items:
            rel = [i for i in items if PALABRAS_PELIGRO.search(i["titulo"] + " " + i["resumen"])]
            for i in items:
                i["ruta"] = r; i["medio"] = nombre; i["relevante"] = bool(PALABRAS_PELIGRO.search(i["titulo"] + " " + i["resumen"]))
            return items
        intentos.append(f"{r}:vacío")
    raise RuntimeError("sin RSS: " + ",".join(intentos[:6]))


def _pagina_oficial(nombre, base):
    html = _get(base, 15, 1).decode("utf-8", "ignore")
    t = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    enl = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>([^<]{25,140})</a>', html)
    if not enl:
        raise RuntimeError("página sin titulares legibles (" + str(len(html)) + " bytes)")
    return [{"titulo": re.sub(r"\s+", " ", x).strip(), "url": u if u.startswith("http") else base.rstrip("/") + "/" + u.lstrip("/"), "medio": nombre, "relevante": bool(PALABRAS_PELIGRO.search(x))} for u, x in enl[:40]]


def _lote_prensa():
    """Prueba en paralelo todos los medios y entidades. Devuelve (estado por fuente, titulares)."""
    from concurrent.futures import ThreadPoolExecutor
    tareas = [(n, lambda n=n, b=b: _rss_medio(n, b)) for n, b in MEDIOS_RSS.items()] + [(n, lambda n=n, b=b: _pagina_oficial(n, b)) for n, b in OFICIALES.items()]

    def uno(t):
        n, f = t; t0 = time.time()
        try:
            d = f()
            return {"fuente": "Prensa/oficial — " + n, "estado": "ok", "registros": len(d), "relevantes": sum(1 for x in d if x.get("relevante")), "ruta": d[0].get("ruta", "página"), "segundos": round(time.time() - t0, 1)}, d
        except Exception as e:
            return {"fuente": "Prensa/oficial — " + n, "estado": "error", "detalle": (type(e).__name__ + " " + str(e))[:160], "registros": 0, "segundos": round(time.time() - t0, 1)}, []
    with ThreadPoolExecutor(max_workers=6) as ex:
        return list(ex.map(uno, tareas))


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
    try:
        for est, d in _lote_prensa():
            res.append(est)
            if d:
                datos[est["fuente"]] = [x for x in d if x.get("relevante")][:25] or d[:5]
    except Exception as e:
        res.append({"fuente": "Prensa/oficial — lote", "estado": "error", "detalle": type(e).__name__ + " " + str(e)[:120], "registros": 0, "segundos": 0})
    if INPE_DIAG:
        [r for r in res if r["fuente"].startswith("INPE")][0]["diagnostico"] = INPE_DIAG
    salida = {"generado": int(time.time() * 1000), "modo": "observación: aún no se mezcla con los eventos oficiales", "estado": res, "datos": {k: v[:60] for k, v in datos.items()}}
    json.dump(salida, open(os.path.join(docs, "fuentes_nuevas.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    ok = sum(1 for r in res if r["estado"] == "ok")
    return f"{ok}/{len(res)} fuentes nuevas respondieron: " + "; ".join(f'{r["fuente"].split(" — ")[0]}={r["registros"] if r["estado"]=="ok" else "ERROR"}' for r in res)

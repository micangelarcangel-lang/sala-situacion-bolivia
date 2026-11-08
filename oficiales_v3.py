# -*- coding: utf-8 -*-
"""Fuentes oficiales y datos abiertos por tipo de evento (solo lectura).
- Lluvia observada vs. normal (Open-Meteo, reanálisis): para sequía/inundación/helada.
- Textos oficiales de SENAMHI (alerta meteorológica, monitor de sequías) para cruzar con la prensa.
- Sismos USGS cerca de Bolivia."""
import json, re, datetime as dt, urllib.request

UA = {"User-Agent": "Mozilla/5.0 sala-situacion-bolivia/3"}


def _j(u, t=40):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read())


def lluvia(lat, lon, dias=30):
    """Lluvia diaria de los últimos `dias` días y la normal (promedio 2016-2025 para las mismas fechas)."""
    hoy = dt.date.today()
    r = _j(f"https://api.open-meteo.com/v1/forecast?latitude={lat:.3f}&longitude={lon:.3f}&daily=precipitation_sum&past_days={dias}&forecast_days=1&timezone=America/La_Paz")
    fechas = r["daily"]["time"][:-1]; obs = [v or 0 for v in r["daily"]["precipitation_sum"][:-1]]
    normal = None
    try:
        h = _j(f"https://archive-api.open-meteo.com/v1/archive?latitude={lat:.3f}&longitude={lon:.3f}&start_date=2016-01-01&end_date=2025-12-31&daily=precipitation_sum&timezone=America/La_Paz", 60)
        por = {}
        for d, v in zip(h["daily"]["time"], h["daily"]["precipitation_sum"]):
            por.setdefault(d[5:], []).append(v or 0)
        tot = [sum(por.get(f[5:], [0])) / max(1, len(por.get(f[5:], [0]))) for f in fechas]
        normal = round(sum(tot), 1)
    except Exception:
        pass
    return {"fechas": fechas, "mm": [round(x, 1) for x in obs], "total_mm": round(sum(obs), 1), "normal_mm": normal, "dias": dias,
            "fuente": "Open-Meteo (reanálisis ERA5/IFS); referencia, no reemplaza estaciones de SENAMHI"}


def textos_senamhi(log=print):
    import informe_hecho as ih
    out = []
    for nombre, u in (("SENAMHI · Aviso meteorológico", "https://senamhi.gob.bo/servicios/alerta-meteorologica"), ("SENAMHI · Monitor de sequías", "https://senamhi.gob.bo/servicios/monitor-sequias"), ("SENAMHI · Alertas hidrológicas", "https://senamhi.gob.bo/hidrologia/alertas")):
        try:
            html, final = ih.descargar(u); t = ih.texto_principal(html).strip()
            if len(t) > 200:
                out.append({"medio": nombre, "url": final, "titulo": nombre, "texto": t[:3500], "leida": True, "relevante": True, "pub": None, "fecha": "", "ronda": 0})
        except Exception as e:
            log("SENAMHI no disponible:", u, str(e)[:60])
    return out


def epi_texto(palabras, log=print):
    """Último boletín epidemiológico semanal del Ministerio de Salud (PDF público): devuelve las páginas que mencionan `palabras`."""
    import io
    from pypdf import PdfReader
    base = "https://minsalud.gob.bo"
    h = urllib.request.urlopen(urllib.request.Request(base + "/9104-boletines-epidemiologicos-2026", headers=UA), timeout=60).read().decode("utf-8", "ignore")
    enl = re.findall(r'href="(/component/jdownloads/send/[^"]*semana-epidemiologica-no-(\d+)[^"]*)"', h)
    if not enl:
        return None
    ruta, se = max(enl, key=lambda x: int(x[1]))
    b = urllib.request.urlopen(urllib.request.Request(base + ruta.replace("&amp;", "&"), headers=UA), timeout=90).read()
    pags = [re.sub(r"\s+", " ", (pg.extract_text() or "")) for pg in PdfReader(io.BytesIO(b)).pages]
    pal = [w.lower() for w in palabras if len(w) > 3]
    hit = [t for t in pags if any(w in t.lower() for w in pal)][:4] or pags[:2]
    return {"medio": f"Minsalud · Boletín epidemiológico SE {se}", "url": base + ruta.replace("&amp;", "&"), "titulo": f"Boletín epidemiológico semana {se}", "texto": " ".join(hit)[:7000], "leida": True, "relevante": True, "pub": None, "fecha": "", "ronda": 0}


def sismos(dias=15, mag=3.0):
    ini = (dt.date.today() - dt.timedelta(days=dias)).isoformat()
    j = _j(f"https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=-23&maxlatitude=-9&minlongitude=-70&maxlongitude=-57&starttime={ini}&minmagnitude={mag}&orderby=time&limit=20")
    return [{"lugar": f["properties"]["place"], "mag": f["properties"]["mag"], "t": f["properties"]["time"]} for f in j["features"]]


def para(subtipo, lat, lon, log=print, lugar=""):
    """Devuelve {'lluvia':…, 'textos':[…]} según el tipo de evento. Nunca lanza excepción."""
    out = {"lluvia": None, "textos": []}
    s = (subtipo or "").lower()
    try:
        if re.search(r"sequ|inund|granizada|helada|riada|desliz", s):
            if lat is not None:
                out["lluvia"] = lluvia(lat, lon, 90)
            out["textos"] = textos_senamhi(log)
        if re.search(r"brote|intox|sanidad|rabia|dengue|chikun|sarampi|c[oó]lera|gripe|influenza|covid|fiebre", s):
            palabras = re.findall(r"[a-záéíóúñ]{4,}", s) + [x for x in (lugar or "").lower().replace(",", " ").split()]
            t = epi_texto(palabras, log)
            if t:
                out["textos"].append(t)
    except Exception as e:
        log("oficiales falló:", type(e).__name__, str(e)[:80])
    return out

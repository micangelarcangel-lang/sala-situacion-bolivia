# -*- coding: utf-8 -*-
"""Búsqueda en vivo de un hecho en Google Noticias (cuando el sistema no lo captó solo)
y ubicación por nombre de municipio/departamento usando los límites oficiales (geoBoundaries)."""
import re, math, time, hashlib, urllib.request, urllib.parse, email.utils, unicodedata
import xml.etree.ElementTree as ET

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t)).strip()


REGLAS_TIPO = [
    ("geológica", r"sismo|terremoto|temblor|derrumbe|deslizamiento|desprendimiento|volcan|socavon"),
    ("hidrológica", r"inundaci|desborde|riada|crecida|anegamiento|mazamorra|rebalse"),
    ("tecnológica", r"explosi|fuga de gas|derrame|colapso|explot"),
    ("biológica", r"brote|epidemia|dengue|sarampi|fiebre amarilla|rabia|intoxicad|intoxicaci|influenza|gripe aviar|aftosa|malaria|chikungunya|casos de"),
    ("meteorológica", r"lluvia|tormenta|granizo|granizada|viento|ventarr|helada|nevada|tornado|surazo|rayo|alerta naranja|alerta roja"),
    ("climatológica", r"sequia|ola de calor|el nino|la nina|incendio forestal|chaqueo|quema"),
    ("antropogénica", r"incendio|bloqueo|accidente|choque|vuelco|colisi|atropell|embarranc|despen|enfrentamiento|ahog|asesin|homicid|feminicid"),
]


def tipo_por_texto(t):
    n = norm(t)
    for nombre, rx in REGLAS_TIPO:
        if re.search(rx, n):
            return nombre
    return "otra"


# ------------------------------------------------------------------ ubicación por nombre
_IDX = {}


def _indice(geo):
    k = id(geo)
    if k in _IDX:
        return _IDX[k]
    conteo = {}
    for u in geo["mun"]:
        conteo[norm(u["n"])] = conteo.get(norm(u["n"]), 0) + 1
    mun = []
    for u in geo["mun"]:
        nn = norm(u["n"])
        if len(nn) >= 5 and conteo[nn] == 1:  # solo nombres únicos y no demasiado cortos
            p = u["_s"].representative_point()
            mun.append((nn, p.y, p.x, u["n"], u["d"]))
    dep = []
    for u in geo["dep"]:
        p = u["_s"].representative_point()
        dep.append((norm(u["n"]), p.y, p.x, u["n"]))
    _IDX[k] = (mun, dep)
    return _IDX[k]


def ubicar_por_nombre(geo, texto):
    """Devuelve (lat, lon, lugar, metodo). Prefiere municipio; si no, departamento (aproximado)."""
    t = " " + norm(texto) + " "
    mun, dep = _indice(geo)
    mejor = None
    for nn, lat, lon, nombre, d in mun:
        k = t.find(" " + nn + " ")
        if k >= 0 and (mejor is None or len(nn) > mejor[0] or (len(nn) == mejor[0] and k < mejor[1])):
            mejor = (len(nn), k, lat, lon, nombre, d)
    if mejor:
        return mejor[2], mejor[3], f"{mejor[4]}, {mejor[5]}", "nombre de municipio en el titular"
    for nn, lat, lon, nombre in dep:
        if " " + nn + " " in t:
            return lat, lon, nombre + " (departamento)", "nombre de departamento en el titular (aprox.)"
    return None, None, "", "sin ubicar"


# ------------------------------------------------------------------ búsqueda en vivo
def buscar_en_vivo(q, horas, geo=None, max_items=40):
    """Busca q en Google Noticias (últimas `horas` h). Devuelve (eventos, mensaje). Nunca lanza excepción."""
    try:
        import informe_hecho as ih
        dias = max(1, math.ceil(horas / 24))
        url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(f"{q} Bolivia when:{dias}d") + "&hl=es-419&gl=BO&ceid=BO:es-419")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            xml = r.read()
        raiz = ET.fromstring(xml)
        lim = (time.time() - horas * 3600) * 1000
        out = []
        for it in raiz.iter("item"):
            titulo = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            if not titulo or not link:
                continue
            fuente = ""
            s = it.find("source")
            if s is not None and (s.text or "").strip():
                fuente = s.text.strip()
            elif " - " in titulo:
                fuente = titulo.rsplit(" - ", 1)[1].strip()
            try:
                ts = int(email.utils.parsedate_to_datetime(it.findtext("pubDate")).timestamp() * 1000)
            except Exception:
                ts = int(time.time() * 1000)
            if ts < lim:
                continue
            f, h = ih.cifras(re.sub(r" - [^-]+$", "", titulo))
            nivel = 3 if (f >= 10 or h >= 30) else 2 if (f >= 3 or h >= 10) else 1
            lat = lon = None
            lugar, metodo = "", "sin ubicar"
            if geo:
                lat, lon, lugar, metodo = ubicar_por_nombre(geo, titulo)
            out.append({"id": "noticia:vivo:" + hashlib.md5(link.encode()).hexdigest()[:12], "ts": ts, "fuente": fuente or "Google Noticias",
                        "tipo": tipo_por_texto(titulo), "nivel": nivel, "titulo": titulo, "detalle": "", "url": link, "fall": f, "her": h,
                        "lat": lat, "lon": lon, "lugar": lugar, "metodo": metodo})
            if len(out) >= max_items:
                break
        return out, f"{len(out)} nota(s) encontradas en Google Noticias"
    except Exception as e:
        return [], "búsqueda en vivo no disponible (" + type(e).__name__ + ": " + str(e)[:80] + ")"

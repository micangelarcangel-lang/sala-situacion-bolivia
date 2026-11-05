# -*- coding: utf-8 -*-
"""Fecha de publicación de una nota (v3): metadatos del HTML primero, texto en español después. Devuelve ms UTC o None."""
import re, json, datetime as dt

MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}
BO = dt.timezone(dt.timedelta(hours=-4))


def _ms(d):
    if d.tzinfo is None:
        d = d.replace(tzinfo=BO)
    return int(d.timestamp() * 1000)


def _iso(s):
    try:
        return _ms(dt.datetime.fromisoformat(s.strip().replace("Z", "+00:00")))
    except Exception:
        return None


def desde_html(html):
    for pat in (r'property=["\']article:published_time["\'][^>]*content=["\']([^"\']+)', r'content=["\']([^"\']+)["\'][^>]*property=["\']article:published_time',
                r'itemprop=["\']datePublished["\'][^>]*content=["\']([^"\']+)', r'"datePublished"\s*:\s*"([^"]+)"', r'<time[^>]*datetime=["\']([^"\']+)'):
        m = re.search(pat, html or "")
        if m and _iso(m.group(1)):
            return _iso(m.group(1))
    return None


def desde_texto(texto, hoy=None):
    """'3 de noviembre de 2026' o '03/11/2026' en los primeros 600 caracteres."""
    t = (texto or "")[:600].lower()
    m = re.search(r"(\d{1,2})\s+de\s+([a-z]+)\s+(?:de|del)\s+(\d{4})", t)
    if m and m.group(2) in MESES:
        try:
            return _ms(dt.datetime(int(m.group(3)), MESES[m.group(2)], int(m.group(1)), 12))
        except ValueError:
            pass
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b", t)
    if m:
        try:
            return _ms(dt.datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), 12))
        except ValueError:
            pass
    return None


def fecha_publicacion(html="", texto=""):
    return desde_html(html) or desde_texto(texto)


DIAS = {"lunes": 0, "martes": 1, "miercoles": 2, "miércoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "sábado": 5, "domingo": 6}


def fecha_hecho(texto, ts_pub):
    """Fecha en que ocurrió el hecho según el texto ('5 de septiembre', 'este viernes') en los primeros 500 caracteres. Devuelve ms o None.
    Sin año explícito: se toma el año más reciente que no sea posterior a la publicación y, si el texto nombra un día de la semana, el que coincida con ese día."""
    if not ts_pub:
        return None
    t = (texto or "")[:500].lower()
    pub = dt.datetime.fromtimestamp(ts_pub / 1000, BO)
    m = re.search(r"\b(\d{1,2})\s+de\s+(" + "|".join(MESES) + r")(?:\s+(?:de|del)\s+(20\d{2}))?", t)
    if not m:
        return None
    dia, mes = int(m.group(1)), MESES[m.group(2)]
    anios = [int(m.group(3))] if m.group(3) else [pub.year, pub.year - 1, pub.year - 2]
    sem = next((v for k, v in DIAS.items() if re.search(r"\b" + k + r"\b", t)), None)
    cand = []
    for a in anios:
        try:
            d = dt.datetime(a, mes, dia, 12, tzinfo=BO)
        except ValueError:
            continue
        if d <= pub + dt.timedelta(days=1):
            cand.append(d)
    if not cand:
        return None
    if sem is not None:
        ok = [d for d in cand if d.weekday() == sem]
        if ok:
            return _ms(max(ok))
        if not m.group(3):
            return None  # el día de la semana no cuadra con ningún año: no se arriesga una fecha
    return _ms(max(cand))

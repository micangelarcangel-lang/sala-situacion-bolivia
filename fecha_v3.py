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

# -*- coding: utf-8 -*-
"""Captación por RSS/Atom (v3): lee los feeds verificados de fuentes.yml (clave 'feeds') y devuelve notas con su FECHA DE PUBLICACIÓN real.
Los feeds de WordPress traen el cuerpo en content:encoded: se usa como texto de la nota, sin abrir la página (evita bloqueos).
captar(feeds) -> (notas, estado_por_feed)   nota = {titulo, url, ts_publicacion, cuerpo, medio, via}"""
import re, html, time, email.utils, datetime as dt, urllib.request
import xml.etree.ElementTree as ET

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
NS = {"content": "http://purl.org/rss/1.0/modules/content/", "dc": "http://purl.org/dc/elements/1.1/", "atom": "http://www.w3.org/2005/Atom"}


def _texto(h):
    h = re.sub(r"(?is)<(script|style).*?</\1>", " ", h or "")
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def _fecha(s):
    if not s:
        return None
    try:
        return int(email.utils.parsedate_to_datetime(s).timestamp() * 1000)
    except Exception:
        try:
            return int(dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000)
        except Exception:
            return None


def parsear(xml_bytes, medio=""):
    raiz = ET.fromstring(xml_bytes)
    notas = []
    for it in raiz.iter("item"):
        g = lambda tag, ns=None: (it.findtext(tag) if ns is None else it.findtext(tag, namespaces=NS)) or ""
        cuerpo = _texto(g("content:encoded", True)) or _texto(g("description"))
        notas.append({"titulo": _texto(g("title")), "url": g("link").strip(), "ts_publicacion": _fecha(g("pubDate")), "cuerpo": cuerpo[:4000], "medio": medio, "via": "rss"})
    for en in raiz.iter("{http://www.w3.org/2005/Atom}entry"):  # Atom
        l = en.find("atom:link", NS)
        notas.append({"titulo": _texto(en.findtext("atom:title", namespaces=NS)), "url": (l.get("href") if l is not None else ""), "ts_publicacion": _fecha(en.findtext("atom:published", namespaces=NS) or en.findtext("atom:updated", namespaces=NS)),
                      "cuerpo": _texto(en.findtext("atom:content", namespaces=NS) or en.findtext("atom:summary", namespaces=NS))[:4000], "medio": medio, "via": "rss"})
    return [n for n in notas if n["titulo"] and n["url"]]


def bajar(url, t=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=t) as r:
        crudo = r.read(8_000_000)
    if crudo[:2] == b"\x1f\x8b":
        import gzip
        crudo = gzip.decompress(crudo)
    return crudo


def captar(feeds):
    """feeds: lista de {medio, url}. Un feed caído no frena a los demás."""
    todas, estado = [], {}
    for f in feeds:
        ini = time.time()
        try:
            n = parsear(bajar(f["url"]), f["medio"])
            estado[f["medio"]] = {"ok": True, "notas": len(n), "seg": round(time.time() - ini, 1), "con_fecha": sum(1 for x in n if x["ts_publicacion"]), "con_cuerpo": sum(1 for x in n if len(x["cuerpo"]) > 300)}
            todas += n
        except Exception as e:
            estado[f["medio"]] = {"ok": False, "error": type(e).__name__ + ": " + str(e)[:100], "seg": round(time.time() - ini, 1)}
    return todas, estado

# -*- coding: utf-8 -*-
"""Captación genérica v3: una función por tipo de vía, todas devuelven la misma forma de elemento.
 elemento = {titulo, url, ts_publicacion (ms o None), fuente, resumen, via}
 captar(fuente, vias) prueba en orden: wp_json -> rss -> (navegador para el mismo rss) y se queda con la primera que entrega elementos.
Se apoya en escalera.obtener (directa -> navegador -> archivo), así que una fuente bloqueada para la vía directa se reintenta con navegador."""
import json, re, html, datetime as dt, email.utils
import xml.etree.ElementTree as ET
import escalera


def _ms_rfc(s):
    try:
        return int(email.utils.parsedate_to_datetime(s).timestamp() * 1000)
    except Exception:
        try:
            return int(dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000)
        except Exception:
            return None


def _limpio(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()


def parsear_rss(crudo, fuente):
    txt = crudo.decode("utf-8", "replace") if isinstance(crudo, bytes) else crudo
    txt = txt[txt.find("<"):] if "<" in txt else txt
    try:
        raiz = ET.fromstring(txt.encode("utf-8"))
    except ET.ParseError:
        return []
    out = []
    for it in list(raiz.iter("item")) + list(raiz.iter("{http://www.w3.org/2005/Atom}entry")):
        def g(*nombres):
            for n in nombres:
                x = it.find(n)
                if x is not None and (x.text or x.attrib.get("href")):
                    return (x.text or x.attrib.get("href") or "").strip()
            return ""
        a = "{http://www.w3.org/2005/Atom}"
        out.append({"titulo": _limpio(g("title", a + "title")), "url": g("link", a + "link"), "ts_publicacion": _ms_rfc(g("pubDate", a + "published", a + "updated")), "fuente": fuente,
                    "resumen": _limpio(g("description", a + "summary"))[:400], "via": "rss"})
    return [x for x in out if x["titulo"] and x["url"]]


def parsear_wp_json(crudo, fuente):
    try:
        d = json.loads(crudo.decode("utf-8", "replace") if isinstance(crudo, bytes) else crudo)
    except Exception:
        return []
    return [{"titulo": _limpio((p.get("title") or {}).get("rendered")), "url": p.get("link"), "ts_publicacion": _ms_rfc((p.get("date_gmt") or "") + "+00:00") if p.get("date_gmt") else None, "fuente": fuente,
             "resumen": _limpio((p.get("excerpt") or {}).get("rendered"))[:400], "via": "wp_json"} for p in d if isinstance(p, dict) and p.get("link")]


PARSERS = {"rss": parsear_rss, "wp_json": parsear_wp_json}


def captar(fuente, vias, fetch=None):
    """vias = [{'via': 'wp_json'|'rss', 'url': ...}]. Devuelve {'ok', 'via', 'elementos', 'intentos'}. fetch(url) -> dict de escalera.obtener (para pruebas)."""
    fetch = fetch or (lambda u: escalera.obtener(u, vias=("directa", "navegador"), min_chars=50, con_crudo=True))
    intentos = []
    for v in vias:
        r = fetch(v["url"])
        els = PARSERS[v["via"]](r.get("crudo") or b"", fuente) if r.get("ok") else []
        intentos.append({"via": v["via"], "url": v["url"], "ok_descarga": r.get("ok"), "via_descarga": r.get("via"), "elementos": len(els)})
        if els:
            return {"ok": True, "via": v["via"], "elementos": els, "intentos": intentos}
    return {"ok": False, "via": None, "elementos": [], "intentos": intentos}

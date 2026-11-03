# -*- coding: utf-8 -*-
"""Captación por buscador de noticias (v3): ruta alternativa para fuentes que bloquean la lectura directa (VIDECI, SNGR, SENASAG...).
La prensa replica sus comunicados; se consulta Google Noticias (RSS público) con consultas fijas y se devuelven notas con título, medio, enlace y fecha.
Nunca se presentan como comunicado oficial: son prensa que cita a la institución (nivel de evidencia de prensa)."""
import hashlib, re, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET, email.utils

CONSULTAS = {
    "Defensa Civil": ['"Defensa Civil" Bolivia', 'VIDECI Bolivia emergencia', 'Viceministerio de Defensa Civil Bolivia'],
    "SENASAG": ['SENASAG Bolivia sanidad animal', 'SENASAG Bolivia brote'],
    "Policía/Bomberos": ['Bomberos Bolivia incendio', 'Policía Boliviana accidente'],
}
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"


def _ts(s):
    try:
        return int(email.utils.parsedate_to_datetime(s).timestamp() * 1000)
    except Exception:
        return 0


def consultar(q, dias=2, t=20):
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(f"{q} when:{dias}d") + "&hl=es-419&gl=BO&ceid=BO:es-419"
    x = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=t).read()
    out = []
    for it in ET.fromstring(x).iter("item"):
        titulo = (it.findtext("title") or "").strip()
        medio = (it.findtext("source") or "").strip()
        if medio and titulo.endswith(" - " + medio):
            titulo = titulo[: -len(medio) - 3]
        out.append({"titulo": titulo, "medio": medio or "Google Noticias", "url": it.findtext("link") or "", "ts": _ts(it.findtext("pubDate"))})
    return out


def captar(dias=2, consultas=None):
    """Devuelve (lista de notas sin repetir, estado por consulta)."""
    vistos, notas, estado = set(), [], {}
    for grupo, qs in (consultas or CONSULTAS).items():
        for q in qs:
            try:
                r = consultar(q, dias)
                estado[q] = len(r)
            except Exception as e:
                r, estado[q] = [], f"error {type(e).__name__}"
            for n in r:
                k = re.sub(r"\W+", " ", n["titulo"].lower())[:90]
                if k and k not in vistos:
                    vistos.add(k); n["grupo"] = grupo; notas.append(n)
            time.sleep(1)
    return notas, estado


def a_evento(n):
    """Nota -> evento de prensa mínimo según esquema_evento_v1 (categoría y lugar los completa la etapa v3 de enriquecimiento)."""
    return {"id": "noticia:bus:" + hashlib.sha1((n["titulo"] + n["url"]).encode()).hexdigest()[:12], "origen": "prensa", "categoria": "otra", "titulo": n["titulo"], "ts": n["ts"] or int(time.time() * 1000),
            "fuente": n["medio"], "oficial": False, "departamentos": [], "cifras": {}, "url": n["url"], "via_captacion": "buscador", "nivel": 0, "nivel_txt": "Sin nivel",
            "confianza": {"nivel": "Baja", "fuentes_independientes": 1, "puntaje": 20}, "lugar": ""}

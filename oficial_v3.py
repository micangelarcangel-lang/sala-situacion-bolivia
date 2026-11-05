# -*- coding: utf-8 -*-
"""Triangulación con fuentes oficiales (v3): cuando una nota habla de una declaratoria, decreto, ley, resolución u ordenanza, se busca el respaldo en medios
oficiales según el alcance (nacional, departamental, municipal). La Gaceta Oficial de Bolivia bloquea las conexiones desde fuera del país (ERR_CONNECTION_RESET,
probado 05/11/2026 con las tres vías); mientras tanto se usa lo que sí responde: presidencia.gob.bo (WordPress, API pública) y los portales .gob.bo vía Google News.
Resultado: acto_oficial = {alcance, tipo, numero, estado, enlaces}. Estados: verificado (coincide el número de la norma) | respaldo_probable (hay una publicación oficial sobre el tema; confirmar a mano) | sin_respaldo_oficial_encontrado."""
import re, json, unicodedata, urllib.parse, urllib.request, time

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
TIPOS = [("declaratoria", r"declaratoria|declara(?:n|r|ron|do)? (?:la )?(?:situacion de )?(?:emergencia|desastre)|emergencia nacional|ley de emergencia|estado de (?:emergencia|excepcion)"),
         ("decreto", r"decreto supremo|\bds\b\s*(?:n[o°.]*\s*)?\d{3,5}"), ("ley", r"\bley\b\s*(?:n[o°.]*\s*)?\d{2,4}|ley (?:departamental|municipal|nacional)"),
         ("resolución", r"resolucion (?:ministerial|administrativa|biministerial|multiministerial)"), ("ordenanza", r"ordenanza municipal|ordenanza")]
ALCANCE = [("municipal", r"concejo municipal|alcaldia|ordenanza|gobierno autonomo municipal|\bgam\b|ley municipal|concejales"),
           ("departamental", r"gobernacion|asamblea legislativa departamental|asamblea departamental|ley departamental|gobernador|asamblea de (?:cochabamba|la paz|santa cruz|oruro|potosi|chuquisaca|tarija|beni|pando)"),
           ("nacional", r"decreto supremo|gobierno nacional|el gobierno\b|ministerio|ministro|viceministro|presidente|asamblea legislativa plurinacional|emergencia nacional|ley de emergencia|a nivel nacional")]
NUM = re.compile(r"(?:decreto supremo|\bds\b|ley|resolucion \w+|ordenanza(?: municipal)?)\s*(?:n[o°.]*\s*)?(\d{1,5}(?:[/-]\d{2,4})?)")


def norm(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


def detectar_acto(titulo, cuerpo=""):
    """Devuelve {alcance, tipo, numero} si el texto menciona un acto oficial; si no, None. El alcance sale de quién lo emite (gobierno / gobernación / alcaldía)."""
    t = norm(titulo) + " . " + norm((cuerpo or "")[:1200])
    tipo = next((n for n, p in TIPOS if re.search(p, t)), None)
    if not tipo:
        return None
    # la ordenanza o la ley "municipal/departamental" mandan; si hay varias, gana el alcance que aparece primero en el titular
    tt = norm(titulo)
    alc = next((n for n, p in ALCANCE if re.search(p, tt)), None) or next((n for n, p in ALCANCE if re.search(p, t)), "nacional")
    m = NUM.search(t)
    return {"alcance": alc, "tipo": tipo, "numero": m.group(1) if m else None}


def _get(url, t=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-419,es;q=0.9"})
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.read(600_000).decode("utf-8", "replace")


def _wp(dominio, q):
    """Entradas de un WordPress público (presidencia.gob.bo): [{titulo, url, fecha}]."""
    d = json.loads(_get(f"https://{dominio}/wp-json/wp/v2/posts?search={urllib.parse.quote(q)}&per_page=6&orderby=date&_fields=title,link,date"))
    return [{"titulo": re.sub(r"<[^>]+>", "", x["title"]["rendered"]), "url": x["link"], "fecha": x["date"][:10], "entidad": dominio} for x in d]


def _gnews(q):
    """Google News RSS: [{titulo, url, fecha, entidad}]."""
    import xml.etree.ElementTree as ET
    x = ET.fromstring(_get("https://news.google.com/rss/search?q=" + urllib.parse.quote(q) + "&hl=es-419&gl=BO&ceid=BO:es-419"))
    out = []
    for it in x.iter("item"):
        out.append({"titulo": (it.findtext("title") or ""), "url": it.findtext("link") or "", "fecha": (it.findtext("pubDate") or "")[5:16], "entidad": (it.findtext("source") or "")})
    return out[:8]


TEMA = {"sequía": "sequía", "inundación / riada": "inundación", "granizada / helada / viento": "granizada", "incendio forestal": "incendio forestal", "brote / enfermedad transmisible": "salud", "sismo": "sismo", "deslizamiento": "deslizamiento"}


def consultas(acto, subtipo, lugar_dep=None, municipio=None):
    """Búsquedas oficiales según el alcance. Cada una: (descripcion, funcion)."""
    tema = TEMA.get(subtipo, subtipo or "emergencia")
    n = f' "{acto["tipo"]}"'
    if acto["alcance"] == "nacional":
        q = []
        if acto.get("numero"):
            q.append(("presidencia.gob.bo", lambda: _wp("presidencia.gob.bo", acto["numero"])))
        q += [("presidencia.gob.bo", lambda: _wp("presidencia.gob.bo", f"emergencia {tema}")), ("portales .gob.bo", lambda: _gnews(f"site:gob.bo declaratoria emergencia {tema} when:30d"))]
        return q
    if acto["alcance"] == "departamental":
        return [("portales .gob.bo", lambda: _gnews(f'site:gob.bo "{lugar_dep}" gobernación {tema} emergencia when:30d'))]
    return [("portales .gob.bo", lambda: _gnews(f'site:gob.bo "{municipio or lugar_dep}" {tema} emergencia when:30d'))]


def _relevante(r, tema_pal, lugar):
    t = norm(r["titulo"])
    return bool(re.search(r"emergencia|desastre|decreto|ley\b|ordenanza|resolucion|declara", t)) and (tema_pal in t or (lugar and norm(lugar) in t))


def verificar(acto, subtipo, dep=None, mun=None, presupuesto_seg=20):
    """Busca respaldo oficial. Devuelve el acto con estado y enlaces; nunca lanza excepción (si una vía falla, se anota)."""
    ini = time.time()
    tema = norm(TEMA.get(subtipo, subtipo or "emergencia"))
    enlaces, errores = [], []
    for nombre, f in consultas(acto, subtipo, dep, mun):
        if time.time() - ini > presupuesto_seg:
            break
        try:
            for r in f():
                if _relevante(r, tema, mun or dep if acto["alcance"] != "nacional" else None):
                    enlaces.append({k: r.get(k) for k in ("entidad", "titulo", "url", "fecha")})
        except Exception as e:
            errores.append(f"{nombre}: {type(e).__name__}")
    out = dict(acto)
    # «verificado» solo si el número de la norma aparece en el título o la dirección del documento oficial; si no, es un respaldo probable que hay que confirmar a mano
    num = acto.get("numero")
    exacto = bool(num) and any(num in (e.get("titulo") or "") or num in (e.get("url") or "") for e in enlaces)
    out["estado"] = "verificado" if exacto else ("respaldo_probable" if enlaces else "sin_respaldo_oficial_encontrado")
    out["enlaces"] = enlaces[:3]
    if errores:
        out["vias_con_error"] = errores
    if acto["alcance"] == "nacional" and not enlaces:
        out["nota"] = "La Gaceta Oficial no es accesible desde fuera de Bolivia: verificar el número de norma en gacetaoficialdebolivia.gob.bo"
    return out

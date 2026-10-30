# -*- coding: utf-8 -*-
"""Informe por tema: busca un tema (p. ej. «sarampión», «dengue Caranavi», «bloqueo») en TODO lo que guarda la plataforma
y, además, en la prensa boliviana mes por mes (hasta 12 meses atrás). Une las notas que cuentan lo mismo, calcula la confianza
(número de medios + credibilidad de cada fuente) y deja docs/temas/<slug>.json, que la página tema.html dibuja con gráficos."""
import os, re, json, time, math, hashlib, unicodedata, urllib.parse, urllib.request, email.utils, datetime as dt
import xml.etree.ElementTree as ET

import transito as T

UA = "Mozilla/5.0 (SalaSituacionBolivia/3.0)"
TZ = dt.timezone(dt.timedelta(hours=-4))


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t)).strip()


def slug(q):
    return re.sub(r"[^a-z0-9]+", "_", norm(q)).strip("_")[:60] or "tema"


def coincide(texto, q):
    """Todas las palabras de la consulta aparecen (por raíz) en el texto."""
    t = norm(texto)
    for w in norm(q).split():
        if len(w) < 3:
            continue
        raiz = w[:-1] if len(w) > 5 and w.endswith("s") else w
        if raiz[:7] not in t:
            return False
    return True


# credibilidad aproximada por tipo de fuente (0–1). Es un criterio editorial del sistema, no una medición.
CRED_OFICIAL = 0.95


def credibilidad(medio):
    m = norm(medio)
    if any(k in m for k in ("abi agencia", "ministerio", "senamhi", "policia", "oms", "ops ", "paho", "who", "gob bo", "gobierno")):
        return 0.9
    if any(k in m for k in ("red uno", "unitel", "el deber", "los tiempos", "opinion", "la razon", "el dia", "pagina siete", "la patria", "correo del sur", "el potosi", "el diario", "brujula", "visión 360", "vision 360", "atb", "bolivision", "eju")):
        return 0.7
    return 0.5


def puntaje(medios):
    p = 1.0
    for m in medios:
        p *= (1 - credibilidad(m))
    return round(100 * (1 - p))


def _rss(q, d0, d1, filtro_extranjero):
    consulta = f'{q} Bolivia after:{d0:%Y-%m-%d} before:{d1:%Y-%m-%d}'
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(consulta) + "&hl=es-419&gl=BO&ceid=BO:es-419"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        raiz = ET.fromstring(r.read())
    out = []
    for it in raiz.iter("item"):
        titulo = (it.findtext("title") or "").strip(); link = (it.findtext("link") or "").strip()
        if not titulo or not link:
            continue
        s = it.find("source"); fuente = (s.text or "").strip() if s is not None else ""
        if not fuente and " - " in titulo:
            fuente = titulo.rsplit(" - ", 1)[1].strip()
        try:
            ts = int(email.utils.parsedate_to_datetime(it.findtext("pubDate")).timestamp() * 1000)
        except Exception:
            continue
        n = {"id": "tema:" + hashlib.md5(link.encode()).hexdigest()[:12], "ts": ts, "fuente": fuente or "Google Noticias", "titulo": titulo, "url": link, "fall": 0, "her": 0,
             "lat": None, "lon": None, "lugar": "", "metodo": "", "nivel": 1, "origen": "prensa"}
        if filtro_extranjero and filtro_extranjero(n):
            continue
        out.append(n)
    return out


def _ventanas(meses, ahora):
    """Ventanas mensuales hacia atrás; cada consulta de Google Noticias devuelve ~100 notas como máximo."""
    out = []
    fin = ahora + dt.timedelta(days=1)
    for _ in range(meses):
        ini = fin - dt.timedelta(days=31)
        out.append((ini, fin)); fin = ini
    return out


def _internas(docs, q):
    """Lo que la plataforma ya guarda: histórico de eventos, hechos de tránsito y publicaciones OPS/OMS/MSyD."""
    out = []
    ruta = os.path.join(docs, "eventos_unificados.json")
    try:
        for e in json.load(open(ruta, encoding="utf-8")).get("eventos", []):
            if e["origen"] in ("modelo", "foco"):
                continue
            if coincide(e["titulo"] + " " + (e.get("detalle") or "") + " " + (e.get("lugar") or ""), q):
                out.append({"id": e["id"], "ts": e["ts"], "fuente": e.get("fuente") or e["origen"], "titulo": e["titulo"], "url": e.get("url") or "", "fall": (e.get("cifras") or {}).get("fallecidos", 0),
                            "her": (e.get("cifras") or {}).get("heridos", 0), "lat": e.get("lat"), "lon": e.get("lon"), "lugar": e.get("lugar") or "", "metodo": "", "nivel": e.get("nivel") or 0,
                            "origen": e["origen"], "oficial": bool(e.get("oficial")), "categoria": e.get("categoria"), "deps": e.get("departamentos") or []})
    except Exception:
        pass
    try:
        for h in json.load(open(os.path.join(docs, "transito.json"), encoding="utf-8")).get("hechos", []):
            for n in h.get("notas", []):
                if coincide(n["titulo"], q):
                    out.append({"id": n["id"], "ts": n["ts"], "fuente": n.get("medio"), "titulo": n["titulo"], "url": n.get("url") or "", "fall": n.get("fall") or 0, "her": n.get("her") or 0,
                                "lat": h.get("lat"), "lon": h.get("lon"), "lugar": h.get("lugar") or "", "metodo": "", "nivel": 1, "origen": "prensa"})
    except Exception:
        pass
    return out


def _oficiales(docs, q):
    res = []
    try:
        epi = json.load(open(os.path.join(docs, "epidemio_oficial.json"), encoding="utf-8"))
    except Exception:
        return res
    for x in epi.get("internacional", []):
        if coincide(x.get("titulo", "") + " " + x.get("resumen", ""), q):
            res.append({"fuente": x.get("fuente"), "titulo": x.get("titulo"), "fecha": x.get("fecha"), "url": x.get("url"), "bolivia": "bolivia" in norm(x.get("resumen", "") + x.get("titulo", ""))})
    for b in epi.get("boletines", []):
        for f in b.get("frases", []):
            if coincide(f, q):
                res.append({"fuente": f"Boletín epidemiológico MSyD, semana {b.get('semana')}", "titulo": f, "fecha": b.get("periodo"), "url": b.get("url"), "bolivia": True})
    return res


def generar(q, docs, geo=None, meses=12, filtro_extranjero=None, log=print):
    q = (q or "").strip()
    ahora = dt.datetime.now(TZ)
    estado = []
    pool = {}

    def sumar(lista, nombre):
        n0 = len(pool)
        for n in lista:
            k = n["url"] or n["id"]
            if k not in pool and (n["ts"] >= (ahora - dt.timedelta(days=meses * 31)).timestamp() * 1000):
                pool[k] = n
        estado.append({"fuente": nombre, "estado": "ok", "notas": len(pool) - n0})

    sumar(_internas(docs, q), "Base de la plataforma (eventos y tránsito guardados)")
    fallos = 0
    nuevas = 0
    for d0, d1 in _ventanas(meses, ahora):
        try:
            L = _rss(q, d0, d1, filtro_extranjero)
            antes = len(pool)
            sumar(L, f"Prensa boliviana {d0:%Y-%m}")
            nuevas += len(pool) - antes
        except Exception as e:
            fallos += 1
            estado.append({"fuente": f"Prensa boliviana {d0:%Y-%m}", "estado": "error", "detalle": type(e).__name__ + " " + str(e)[:80], "notas": 0})
        time.sleep(0.6)
    notas = list(pool.values())
    # ubicación
    if geo:
        try:
            from busqueda import ubicar_por_nombre
            for n in notas:
                if n.get("lat") is None:
                    n["lat"], n["lon"], n["lugar"], n["metodo"] = ubicar_por_nombre(geo, n["titulo"])
        except Exception:
            pass
    # cifras
    try:
        import informe_hecho as ih
        for n in notas:
            if not n.get("fall") and not n.get("her"):
                n["fall"], n["her"] = ih.cifras(re.sub(r" - [^-]+$", "", n["titulo"]))
    except Exception:
        pass
    hechos = []
    for g in T.agrupar(notas):
        h = T._hecho(g)
        medios = h["medios"]
        pt = puntaje(medios)
        h["confianza"]["puntaje"] = pt
        h["confianza"]["razon"] = h["confianza"]["razon"].replace("sin confirmación de Policía/SUMA/ABC (no hay fuente oficial abierta)", "preliminar") + f" Puntaje de credibilidad {pt}/100."
        h["tipo"] = h.get("tipo") or "Tema"
        hechos.append(h)
    hechos.sort(key=lambda h: -h["ts"])
    por_mes, por_dep, por_medio = {}, {}, {}
    for h in hechos:
        m = dt.datetime.fromtimestamp(h["ts"] / 1000, TZ).strftime("%Y-%m")
        por_mes[m] = por_mes.get(m, 0) + 1
        por_dep[h["departamento"] or "Sin ubicar"] = por_dep.get(h["departamento"] or "Sin ubicar", 0) + 1
        for md in h["medios"]:
            por_medio[md] = por_medio.get(md, 0) + 1
    oficiales = _oficiales(docs, q)
    res = {"consulta": q, "slug": slug(q), "generado": int(time.time() * 1000), "meses": meses, "notas": len(notas), "n_hechos": len(hechos), "hechos": hechos,
           "por_mes": por_mes, "por_departamento": por_dep, "por_medio": dict(sorted(por_medio.items(), key=lambda x: -x[1])[:25]), "oficiales": oficiales, "fuentes": estado,
           "metodo": "Notas de prensa boliviana (Google Noticias, ventanas mensuales) y registros propios de la plataforma; las notas que cuentan el mismo hecho se unen; confianza = medios distintos (Alta ≥3, Media 2, Baja 1) y puntaje de credibilidad editorial por medio. Preliminar: no sustituye la confirmación oficial.",
           "limites": "Google Noticias entrega como máximo ~100 notas por mes y no cubre redes sociales, radio ni medios sin sitio web. Si un mes falló, aparece como error en 'fuentes'."}
    os.makedirs(os.path.join(docs, "temas"), exist_ok=True)
    json.dump(res, open(os.path.join(docs, "temas", res["slug"] + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    ruta = os.path.join(docs, "temas", "lista.json")
    try:
        lista = json.load(open(ruta, encoding="utf-8"))
    except Exception:
        lista = []
    lista = [x for x in lista if x["slug"] != res["slug"]] + [{"slug": res["slug"], "consulta": q, "generado": res["generado"], "n_hechos": len(hechos), "notas": len(notas)}]
    json.dump(sorted(lista, key=lambda x: -x["generado"])[:60], open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
    msg = f"tema «{q}»: {len(notas)} notas → {len(hechos)} hechos ({nuevas} nuevas de prensa; {fallos} mes(es) con error)"
    log(msg)
    return msg

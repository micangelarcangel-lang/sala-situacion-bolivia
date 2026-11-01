# -*- coding: utf-8 -*-
"""Lee el TEXTO de las notas de los hechos recientes (no solo el titular) y guarda un extracto breve + enlace en docs/textos_hechos.json.
Se usa en la ficha del hecho (evento.html). Solo hechos con actividad en las últimas 48 h; las notas ya leídas no se vuelven a descargar."""
import os, json, time
from concurrent.futures import ThreadPoolExecutor

EXTRACTO = 700
MAX_NUEVAS = 30
LIMITE_S = 280


def _j(r, d):
    try:
        return json.load(open(r, encoding="utf-8"))
    except Exception:
        return d


def actualizar(docs, log=print, horas=48):
    import informe_hecho as ih
    ahora = int(time.time() * 1000)
    lim = ahora - horas * 3600000
    ruta = os.path.join(docs, "textos_hechos.json")
    previo = _j(ruta, {}).get("hechos", {})
    cache = {n["url"]: n for h in previo.values() for n in h.get("notas", []) if n.get("url") and n.get("leido")}
    notas_de = {}
    d = {e["id"]: e for e in _j(os.path.join(docs, "data.json"), {}).get("eventos", [])}
    for e in _j(os.path.join(docs, "eventos_unificados.json"), {}).get("eventos", []):
        if e["origen"] != "prensa" or max(e["ts"], e.get("ts_ult", 0)) < lim:
            continue
        L, vistos = [], set()
        for i in [e["id"]] + list(e.get("alias", [])):
            x = d.get(i)
            if x and (x.get("url") or "").startswith("http") and x.get("fuente") not in vistos:
                vistos.add(x.get("fuente")); L.append({"medio": x.get("fuente", ""), "titulo": x.get("titulo", ""), "url": x["url"], "ts": x.get("ts")})
        if L:
            notas_de[e["id"]] = L
    for h in _j(os.path.join(docs, "transito.json"), {}).get("hechos", []):
        if (h.get("ultima_nota") or h["ts"]) < lim:
            continue
        notas_de[h["id"]] = [{"medio": n["medio"], "titulo": n["titulo"], "url": n["url"], "ts": n.get("ts")} for n in h.get("enlaces", [])[:4] if (n.get("url") or "").startswith("http")]
    pendientes = [(hid, n) for hid, L in notas_de.items() for n in L[:3] if n["url"] not in cache]
    pendientes = pendientes[:MAX_NUEVAS]
    t0 = time.time()

    def leer(p):
        hid, n = p
        if time.time() - t0 > LIMITE_S:
            return n["url"], {"estado": "sin leer (límite de tiempo de la corrida)", "texto": "", "leido": False}
        t, est, real = ih.leer_nota(n["url"])
        return n["url"], {"estado": est, "texto": t[:EXTRACTO].rsplit(" ", 1)[0] + ("..." if len(t) > EXTRACTO else "") if t else "", "url_real": real, "leido": True, "largo": len(t)}
    with ThreadPoolExecutor(max_workers=3) as ex:
        for url, r in ex.map(leer, pendientes):
            cache[url] = r
    out = {}
    for hid, L in notas_de.items():
        out[hid] = {"notas": [dict(n, **{k: v for k, v in cache.get(n["url"], {"estado": "sin leer", "texto": "", "leido": False}).items() if k != "url"}) for n in L]}
    json.dump({"generado": ahora, "hechos": out}, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    leidas = sum(1 for h in out.values() for n in h["notas"] if n.get("largo", 0) >= 150)
    return f"{len(out)} hechos con notas; {len(pendientes)} notas nuevas intentadas; {leidas} con texto"

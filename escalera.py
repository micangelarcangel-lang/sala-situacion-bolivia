# -*- coding: utf-8 -*-
"""Escalera de captación: prueba las vías de una fuente en orden y devuelve la primera que entrega contenido útil.

Vías genéricas implementadas aquí: directa (HTTP), navegador (Chromium con Playwright) y archivo (copia archivada en Wayback Machine).
Cada intento queda registrado (vía, estado, segundos, bytes, bloqueo, error) para el panel de salud de fuentes.
Una copia archivada solo se acepta si no es más vieja que max_dias; si lo es, se devuelve el dato pero marcado como desactualizado.

    r = obtener("https://sitio.gob.bo/boletin")
    r["ok"], r["via"], r["texto"], r["intentos"]
"""
import io, json, os, re, time, datetime as dt, urllib.request, urllib.error, urllib.parse

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MARCAS_BLOQUEO = re.compile(r"access denied|captcha|cloudflare|just a moment|attention required|forbidden|anubis|bot protection", re.I)
VIAS_POR_DEFECTO = ("directa", "navegador", "archivo")


def _bloqueo(texto):
    return bool(MARCAS_BLOQUEO.search((texto or "")[:3000]))


def via_directa(url, t=20):
    ini = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-419,es;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=t) as r:
            crudo = r.read(6_000_000)
            tipo = r.headers.get("content-type", "")
            return {"via": "directa", "estado": r.status, "tipo": tipo, "crudo": crudo, "seg": round(time.time() - ini, 1)}
    except urllib.error.HTTPError as e:
        return {"via": "directa", "estado": e.code, "seg": round(time.time() - ini, 1), "crudo": e.read(5000), "tipo": ""}
    except Exception as e:
        return {"via": "directa", "estado": None, "seg": round(time.time() - ini, 1), "error": type(e).__name__ + ": " + str(e)[:140]}


def via_navegador(url, t=30):
    ini = time.time()
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        return {"via": "navegador", "estado": None, "error": "playwright no disponible: " + str(e)[:100]}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(user_agent=UA, locale="es-BO")
            r = pg.goto(url, timeout=t * 1000, wait_until="domcontentloaded")
            pg.wait_for_timeout(2000)
            html = pg.content()
            b.close()
        return {"via": "navegador", "estado": r.status if r else None, "tipo": "text/html", "crudo": html.encode("utf-8"), "seg": round(time.time() - ini, 1)}
    except Exception as e:
        return {"via": "navegador", "estado": None, "seg": round(time.time() - ini, 1), "error": type(e).__name__ + ": " + str(e)[:140]}


def via_archivo(url, t=25):
    """Última captura pública de la página en Wayback Machine. Devuelve también su antigüedad en días."""
    ini = time.time()
    api = "https://archive.org/wayback/available?url=" + urllib.parse.quote(url, safe="")
    try:
        with urllib.request.urlopen(urllib.request.Request(api, headers={"User-Agent": UA}), timeout=t) as r:
            cap = (json.loads(r.read().decode("utf-8", "replace")).get("archived_snapshots") or {}).get("closest") or {}
        if not cap.get("available"):
            return {"via": "archivo", "estado": 404, "seg": round(time.time() - ini, 1), "error": "sin captura archivada"}
        ts = cap.get("timestamp", "")
        fecha = dt.datetime.strptime(ts[:14], "%Y%m%d%H%M%S").replace(tzinfo=dt.timezone.utc)
        edad = (dt.datetime.now(dt.timezone.utc) - fecha).days
        crudo_url = cap["url"].replace("/web/" + ts, "/web/" + ts + "id_")  # 'id_' = contenido original sin barra de Wayback
        with urllib.request.urlopen(urllib.request.Request(crudo_url, headers={"User-Agent": UA}), timeout=t) as r2:
            crudo = r2.read(6_000_000)
            tipo = r2.headers.get("content-type", "")
        return {"via": "archivo", "estado": 200, "tipo": tipo, "crudo": crudo, "seg": round(time.time() - ini, 1), "fecha_captura": fecha.isoformat(), "edad_dias": edad}
    except Exception as e:
        return {"via": "archivo", "estado": None, "seg": round(time.time() - ini, 1), "error": type(e).__name__ + ": " + str(e)[:140]}


VIAS = {"directa": via_directa, "navegador": via_navegador, "archivo": via_archivo}


def texto_de(crudo, tipo="", url=""):
    """Convierte lo descargado en texto: PDF con pypdf, HTML con trafilatura (si está) o quitando etiquetas."""
    if not crudo:
        return ""
    if "pdf" in (tipo or "").lower() or crudo[:5] == b"%PDF-" or url.lower().endswith(".pdf"):
        try:
            from pypdf import PdfReader
            return "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(crudo)).pages).strip()
        except Exception:
            return ""
    html = crudo.decode("utf-8", "replace")
    plano = re.sub(r"\s+", " ", re.sub(r"(?is)<(script|style).*?</\1>|<[^>]+>", " ", html)).strip()
    try:
        import trafilatura
        t = trafilatura.extract(html, include_comments=False, include_tables=True)
        # en una portada o un listado trafilatura devuelve poco: se usa el texto plano si es más completo
        if t and len(t) >= 300:
            return t
    except Exception:
        pass
    return plano


def _util(r, texto, min_chars):
    return r.get("estado") == 200 and len(texto) >= min_chars and not _bloqueo(texto)


def obtener(url, vias=VIAS_POR_DEFECTO, min_chars=300, max_dias=30, fetchers=None):
    """Prueba las vías en orden. Devuelve {ok, via, texto, url, intentos[], desactualizado?}.
    min_chars: texto mínimo para considerar útil la respuesta. max_dias: antigüedad máxima aceptada para una copia archivada."""
    fetchers = fetchers or VIAS
    intentos, mejor_vieja = [], None
    for v in vias:
        if v not in fetchers:
            intentos.append({"via": v, "estado": None, "error": "vía no implementada"})
            continue
        r = fetchers[v](url)
        texto = texto_de(r.get("crudo"), r.get("tipo", ""), url) if r.get("crudo") else ""
        ok = _util(r, texto, min_chars)
        reg = {"via": v, "estado": r.get("estado"), "seg": r.get("seg"), "chars": len(texto), "bloqueo": _bloqueo(texto) or r.get("estado") in (401, 403, 429), "error": r.get("error", ""), "muestra": texto[:120]}
        if "edad_dias" in r:
            reg["edad_dias"] = r["edad_dias"]
            reg["fecha_captura"] = r.get("fecha_captura")
        intentos.append(reg)
        if ok and v == "archivo" and r.get("edad_dias", 0) > max_dias:
            mejor_vieja = {"ok": False, "via": v, "texto": texto, "url": url, "desactualizado": True, "edad_dias": r["edad_dias"]}
            continue
        if ok:
            salida = {"ok": True, "via": v, "texto": texto, "url": url, "intentos": intentos}
            if v == "archivo":
                salida.update(desactualizado=False, edad_dias=r.get("edad_dias"))
            return salida
    if mejor_vieja:
        mejor_vieja["intentos"] = intentos
        return mejor_vieja
    return {"ok": False, "via": None, "texto": "", "url": url, "intentos": intentos}


def registrar(resultados, ruta):
    """Guarda el panel de salud: por fuente, qué vía funcionó y qué pasó en cada intento. resultados = {fuente_id: obtener(...)}"""
    panel = {"generado": int(time.time() * 1000), "fuentes": {}}
    for fid, r in resultados.items():
        panel["fuentes"][fid] = {"ok": r["ok"], "via": r["via"], "desactualizado": r.get("desactualizado", False), "edad_dias": r.get("edad_dias"), "intentos": r["intentos"]}
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(panel, f, ensure_ascii=False, indent=1)
    return panel

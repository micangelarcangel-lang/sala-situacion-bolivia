# -*- coding: utf-8 -*-
"""Vigilancia epidemiológica (eventos biológicos) con fuentes oficiales públicas:
 1) Boletín Epidemiológico semanal del Ministerio de Salud y Deportes (Bolivia) -> Slack cada boletín nuevo.
 2) Alertas/actualizaciones epidemiológicas de la OPS/OMS (región de las Américas) y Disease Outbreak News de la OMS:
    se listan en el tablero como VIGILANCIA INTERNACIONAL; solo van a Slack si el texto menciona a Bolivia.
Salida: docs/epidemio_oficial.json. Si algo falla se conserva lo anterior."""
import re, io, os, ssl, json, time, datetime, urllib.request, urllib.parse

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MSD = "https://www.minsalud.gob.bo/9104-boletines-epidemiologicos-2026"
OPS = "https://www.paho.org/es/alertas-actualizaciones-epidemiologicas"
DON = "https://www.who.int/api/news/diseaseoutbreaknews?sf_culture=en&$top=8&$orderby=PublicationDateAndTime%20desc&$select=Title,PublicationDateAndTime,UrlName,Summary"
MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}


def _get(u, binario=True, n=3, t=90):
    err = ""
    for i in range(n):
        for tls12 in (False, True):
            c = ssl.create_default_context()
            if tls12:
                c.maximum_version = ssl.TLSVersion.TLSv1_2
            try:
                with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept-Language": "es,en;q=0.8"}), timeout=t, context=c) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                err = f"HTTP {e.code}"
                if e.code in (403, 404):
                    raise RuntimeError(err)
            except Exception as e:
                err = type(e).__name__ + ": " + str(e)[:60]
        time.sleep(4)
    raise RuntimeError(err)


def _limpia(h):
    h = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)).strip()


# ------------------------------------------------------------------ 1) Ministerio de Salud
def msd_ultimo(previo_urls):
    h = _get(MSD).decode("utf-8", "ignore")
    enl = re.findall(r'href="([^"]*jdownloads/send/71-boletines-epidemiologicos-semanal/(\d+)-boletin-epidemiologico-semana-epidemiologica-no-(\d+)[^"]*)"', h)
    cand = sorted({(int(s), urllib.parse.urljoin("https://www.minsalud.gob.bo/", u.replace("&amp;", "&"))) for u, i, s in enl}, reverse=True)
    if not cand:
        raise RuntimeError("no se encontraron boletines en la página del Ministerio")
    sem, url = cand[0]
    return sem, url


def resumen_boletin(pdf_bytes):
    from pypdf import PdfReader
    r = PdfReader(io.BytesIO(pdf_bytes))
    txt = " ".join((p.extract_text() or "") for p in r.pages[:4])
    txt = re.sub(r"\s+", " ", txt)
    per = re.search(r"Semana Epidemiol[óo]gica N[º°o.]* ?(\d+)\s+(\d{1,2} de \w+(?: al \d{1,2} de \w+)?(?: \d{4})?)", txt)
    i = txt.find("Presentación")
    cuerpo = txt[i + 12:] if i >= 0 else txt
    frases = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])", cuerpo)
    clave = [f.strip() for f in frases if re.search(r"incremento|brote|alerta|nuevos? casos|casos de|aument|descenso|defunci|fallec", f, re.I) and len(f) > 40]
    todo = " ".join((p.extract_text() or "") for p in r.pages)
    return {"semana": int(per.group(1)) if per else None, "periodo": per.group(2) if per else "", "frases": clave[:5],
            "paginas": len(r.pages), "menciones": {k: len(re.findall(k, todo, re.I)) for k in ("brote", "alerta", "dengue", "sarampión", "tosferina", "fiebre amarilla", "rabia", "influenza", "diarrea", "chikungunya")}}


# ------------------------------------------------------------------ 2) OPS y OMS
def _fecha_slug(slug):
    m = re.search(r"(\d{1,2})-(" + "|".join(MESES) + r")-(\d{4})", slug)
    if m:
        return f"{m.group(3)}-{MESES[m.group(2)]:02d}-{int(m.group(1)):02d}"
    return ""


def ops_lista():
    h = _get(OPS).decode("utf-8", "ignore")
    out, vistos = [], set()
    for u in re.findall(r'href="(/es/documentos/[^"#?]+)"', h):
        s = u.rsplit("/", 1)[1]
        if u in vistos or not re.match(r"(alerta|actualizacion|informe|nota|comunicado)", s):
            continue
        vistos.add(u)
        titulo = s.replace("-", " ").capitalize()
        out.append({"fuente": "OPS/OMS", "titulo": titulo, "fecha": _fecha_slug(s), "url": "https://www.paho.org" + u, "slug": s})
    return out[:25]


def menciona_bolivia(url):
    try:
        t = _limpia(_get(url, t=60).decode("utf-8", "ignore"))
        return bool(re.search(r"\bBolivia\b", t))
    except Exception:
        return False


def don_lista():
    j = json.loads(_get(DON))
    out = []
    for x in j.get("value", []):
        out.append({"fuente": "OMS (Disease Outbreak News)", "titulo": (x.get("Title") or x.get("UrlName", "")).strip(),
                    "fecha": (x.get("PublicationDateAndTime") or "")[:10], "url": "https://www.who.int/emergencies/disease-outbreak-news/item/" + x.get("UrlName", ""),
                    "resumen": re.sub(r"\s+", " ", x.get("Summary") or "")[:500], "slug": x.get("UrlName", "")})
    return out


# ------------------------------------------------------------------ principal
def actualizar(docs, avisar=None):
    ruta = os.path.join(docs, "epidemio_oficial.json")
    est = {"boletines": [], "internacional": [], "vistos": []}
    if os.path.exists(ruta):
        try:
            est = json.load(open(ruta, encoding="utf-8"))
        except Exception:
            pass
    primera = not est.get("vistos")
    msg, hoy = [], datetime.date.today()
    # Ministerio de Salud
    try:
        sem, url = msd_ultimo(est["boletines"])
        if not any(b["semana"] == sem for b in est["boletines"]):
            res = resumen_boletin(_get(url, t=120))
            b = {"semana": sem, "periodo": res["periodo"], "url": url, "frases": res["frases"], "menciones": res["menciones"], "detectado": hoy.isoformat()}
            est["boletines"] = ([b] + est["boletines"])[:30]
            msg.append(f"boletín SE {sem} nuevo")
            if avisar and not primera:
                avisar(f":microscope: *Boletín Epidemiológico semanal — Ministerio de Salud y Deportes* · SE {sem} ({res['periodo']})\n"
                       + "\n".join("• " + f for f in res["frases"][:4]) + f"\nBoletín completo (PDF): {url}\n_Fuente oficial (DGE-MSyD)._")
            elif avisar and primera:
                avisar(f":microscope: *Vigilancia epidemiológica activada* — último boletín del Ministerio de Salud: SE {sem} ({res['periodo']})\n"
                       + "\n".join("• " + f for f in res["frases"][:4]) + f"\nPDF: {url}")
    except Exception as e:
        msg.append("Ministerio: " + str(e)[:80])
    # Internacional
    try:
        items = ops_lista()
    except Exception as e:
        items = []
        msg.append("OPS: " + str(e)[:60])
    try:
        items += don_lista()
    except Exception as e:
        msg.append("OMS: " + str(e)[:60])
    nuevos = [x for x in items if x["url"] not in est["vistos"]]
    for x in nuevos:
        est["vistos"].append(x["url"])
        reciente = x["fecha"] and (hoy - datetime.date.fromisoformat(x["fecha"])).days <= 14
        x["menciona_bolivia"] = menciona_bolivia(x["url"]) if (x["fuente"] == "OPS/OMS" and (reciente or not primera)) else None
        if x["fuente"] != "OPS/OMS":
            x["menciona_bolivia"] = bool(re.search(r"\bBolivia\b", x.get("resumen", "") + x["titulo"]))
        if avisar and not primera and x["menciona_bolivia"]:
            avisar(f":globe_with_meridians: *{x['fuente']}* menciona a Bolivia: {x['titulo']} ({x['fecha']})\n{x['url']}")
    conocidos = {x["url"]: x for x in est.get("internacional", [])}
    for x in items:
        conocidos[x["url"]] = {**conocidos.get(x["url"], {}), **x}
    est["internacional"] = sorted(conocidos.values(), key=lambda x: x.get("fecha", ""), reverse=True)[:60]
    est["vistos"] = est["vistos"][-600:]
    est["actualizado"] = datetime.datetime.utcnow().isoformat() + "Z"
    json.dump(est, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return f"{len(est['boletines'])} boletines MSyD, {len(nuevos)} ítems internacionales nuevos" + ("; " + "; ".join(msg) if msg else "") + (" (línea base)" if primera else "")

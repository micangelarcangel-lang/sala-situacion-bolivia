# -*- coding: utf-8 -*-
"""Investigador v3: dado un HECHO, amplía la búsqueda por sí solo, lee los artículos y ubica los lugares con coordenadas.
Etapas (las 1-3 no necesitan IA; la 4 usa un modelo si hay clave gratuita en los secretos del repositorio):
 1. Búsqueda en cascada: titulares del hecho -> Google Noticias (es y en) -> nombres propios hallados en los textos -> nueva búsqueda con esos nombres.
 2. Lectura completa de cada artículo (se resuelve el enlace de Google Noticias al medio real).
 3. Lugares: se extraen avenidas/sectores/zonas de los textos y se ubican con Nominatim (OpenStreetMap); el resultado queda con su distancia entre versiones.
 4. Análisis con modelo (afirmaciones con fuente, coincidencias, discrepancias, vacíos): Gemini o Groq si hay clave; si no, se deja constancia y no se inventa nada.
Salida: datos/v3/investigacion/<hecho>.json"""
import collections, datetime as dt, email.utils, json, math, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from xml.etree import ElementTree as ET
import informe_hecho as ih

UA = "Mozilla/5.0 (X11; Linux x86_64) sala-situacion-bolivia/3"
SALIDA = "datos/v3/investigacion"
SIN = set("el la los las de del en y a un una por con para que se su sus al lo como más pero es fue han ha este esta ese esa ayer hoy según tras sobre entre cuando también".split())
LUGARES_COMUNES = {"Bolivia", "El Alto", "La Paz", "Santa Cruz", "Cochabamba", "Oruro", "Potosí", "Tarija", "Beni", "Pando", "Chuquisaca", "Policía", "Fiscalía", "Cancillería", "Embajada", "Ministerio", "Gobierno", "Red Uno", "Unitel", "El Deber", "Corea", "Sudamérica", "Perú", "México"}


def _get(url, t=30):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=t).read()


def rss(q, hl="es-419", gl="BO", ceid="BO:es-419", dias=10):
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(f"{q} when:{dias}d") + f"&hl={hl}&gl={gl}&ceid={ceid}"
    try:
        root = ET.fromstring(_get(url))
    except Exception:
        return []
    out = []
    for it in root.iter("item"):
        t = (it.findtext("title") or "").strip(); src = it.find("source")
        medio = (src.text if src is not None else "") or (t.rsplit(" - ", 1)[-1] if " - " in t else "")
        try:
            pub = int(email.utils.parsedate_to_datetime(it.findtext("pubDate")).timestamp() * 1000)
        except Exception:
            pub = None
        out.append({"titulo": t.rsplit(" - ", 1)[0] if " - " in t else t, "medio": medio, "link": it.findtext("link"), "pub": pub, "consulta": q})
    return out


def consultas_iniciales(hecho):
    qs = []
    for n in hecho["notas"]:
        t = re.sub(r"[“”\"«»]", "", n["titulo"]).strip()
        t = re.sub(r"^[^\w]+", "", t)
        qs.append(t[:110])
    lugar = (hecho.get("lugar") or "").split(",")[0]
    qs.append(f"{hecho['subtipo']} {lugar}".strip())
    return list(dict.fromkeys(qs))


def nombres_propios(textos, minimo=2):
    c = collections.Counter()
    for t in textos:
        vistos = set(re.findall(r"\b[A-ZÁÉÍÓÚÑ][\wáéíóúñ'’\-]+(?: [A-ZÁÉÍÓÚÑ][\wáéíóúñ'’\-]+){1,3}\b", t))
        vistos |= set(re.findall(r"\b[A-Z][a-z]+[A-Z][A-Za-z]+\b", t))  # JinsTravel
        for v in vistos:
            if v.split()[0].lower() in SIN or v in LUGARES_COMUNES or len(v) < 6:
                continue
            c[v] += 1
    return [n for n, k in c.most_common(12) if k >= minimo]


def _n(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(t).lower()) if unicodedata.category(c) != "Mn")


def anclas(hecho):
    """Palabras que definen el hecho: las que comparten al menos la mitad de sus notas, más el lugar. Sirven para descartar ruido."""
    toks = [set(w for w in re.findall(r"[a-z]{5,}", _n(n["titulo"])) if w not in SIN) for n in hecho["notas"]]
    c = collections.Counter(w for t in toks for w in t)
    comunes = [w for w, k in c.items() if k >= max(1, len(toks) / 2)]
    lugar = _n((hecho.get("lugar") or "").split(",")[0])
    return comunes, lugar


def relevante(f, comunes, lugar, nombres=()):
    base = _n(f["titulo"] + " " + f.get("texto", "")[:2500])
    if nombres and any(_n(n) in base for n in nombres):
        return True
    hit = sum(1 for w in comunes if w[:6] in base) + (1 if lugar and lugar in base else 0)
    return hit >= min(3, len(comunes) + 1)


def distancia_km(a, b):
    R = 6371; p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1] - a[1]); dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * R * math.asin(math.sqrt(h)), 2)


def lugares_en(textos):
    c = collections.Counter()
    for t in textos:
        for m in re.finditer(r"\b(?:[Aa]v(?:enida|\.)|[Cc]alle|[Rr]otonda|[Ss]ector|[Zz]ona|[Pp]uente|[Cc]arretera)\s+(?:de\s+la\s+|de\s+los\s+|del\s+|de\s+)?[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ0-9][\wáéíóúñ]*){0,2}", t):
            c[re.sub(r"\s+", " ", m.group(0)).strip(" .,")] += 1
    return [l for l, k in c.most_common(14)]


def nominatim(q, ciudad):
    time.sleep(1.1)  # política de uso: 1 consulta por segundo
    url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=bo&q=" + urllib.parse.quote(f"{q}, {ciudad}, Bolivia")
    try:
        r = json.loads(_get(url))
        if r:
            return {"consulta": q, "lat": float(r[0]["lat"]), "lon": float(r[0]["lon"]), "nombre": r[0]["display_name"][:120], "tipo": r[0].get("type")}
    except Exception as e:
        return {"consulta": q, "error": type(e).__name__}
    return {"consulta": q, "sin_resultado": True}


# ---------------------------------------------------------------- IA (opcional, clave gratuita)
def llamar_ia(sistema, usuario, max_tokens=4000):
    """Gemini (AI Studio) o Groq, el que tenga clave en el entorno. Devuelve (texto_json, proveedor) o (None, motivo)."""
    k = os.environ.get("GEMINI_API_KEY", "").strip()
    errores = []
    if k:
        for modelo in ("gemini-2.5-flash", "gemini-2.0-flash"):
            try:
                cuerpo = {"systemInstruction": {"parts": [{"text": sistema}]}, "contents": [{"role": "user", "parts": [{"text": usuario}]}], "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "maxOutputTokens": max_tokens}}
                r = json.load(urllib.request.urlopen(urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={k}", data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"}), timeout=120))
                return r["candidates"][0]["content"]["parts"][0]["text"], "gemini/" + modelo
            except urllib.error.HTTPError as e:
                errores.append(f"gemini/{modelo}: HTTP {e.code} " + e.read()[:300].decode("utf8", "replace"))
            except Exception as e:
                errores.append(f"gemini/{modelo}: " + type(e).__name__ + " " + str(e)[:150])
    k = os.environ.get("GROQ_API_KEY", "").strip()
    if k:
        try:
            cuerpo = {"model": "llama-3.3-70b-versatile", "temperature": 0, "response_format": {"type": "json_object"}, "max_tokens": min(max_tokens, 6000), "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": usuario}]}
            r = json.load(urllib.request.urlopen(urllib.request.Request("https://api.groq.com/openai/v1/chat/completions", data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + k, "User-Agent": UA}), timeout=120))
            return r["choices"][0]["message"]["content"], "groq/llama-3.3-70b"
        except Exception as e:
            return None, "groq: " + type(e).__name__ + str(e)[:80]
    return None, ("; ".join(errores) if errores else "sin clave de IA en los secretos (GEMINI_API_KEY o GROQ_API_KEY)")


SISTEMA = ("Eres analista de un centro coordinador de emergencias. Recibes artículos de prensa sobre UN hecho. Usa SOLO lo que dicen los artículos; cada afirmación debe citar el medio. "
           "Si un dato no aparece, escribe null. No inventes nombres, cifras ni cargos. Distingue lo que afirma el medio de lo que atribuye a una autoridad. Responde en JSON.")


def analizar(fuentes):
    arts = "\n\n".join(f"[{i + 1}] {f['medio']} · {f['fecha']} · {f['url']}\n{f['texto'][:3500]}" for i, f in enumerate(fuentes) if f.get("texto"))[:60000]
    pedido = ("Con estos artículos devuelve JSON con: hecho{fecha,hora,lugar_versiones[{texto,fuentes}],victima{nombre,edad,nacionalidad},vehiculo,conductor{estado,declaraciones[{texto,atribuido_a,fuente}]}}, "
              "instituciones[{nombre,que_hizo,fuente}], cronologia[{cuando,que,fuentes}], afirmaciones[{dato,valor,fuentes,estado('coincide'|'fuente_unica'|'discrepa'),detalle}], "
              "vacios[strings: lo que NO se sabe y debería saberse], novedades_ultimas_24h[strings].\n\nARTÍCULOS:\n" + arts)
    txt, prov = llamar_ia(SISTEMA, pedido)
    if not txt:
        return None, prov
    try:
        return json.loads(txt), prov
    except Exception as e:
        return {"error_json": str(e)[:100], "crudo": txt[:500]}, prov


# ---------------------------------------------------------------- orquestación
def investigar(hecho, max_leer=24, log=print):
    t0 = time.time(); vistos = {}; qlog = []
    def agregar(items, ronda):
        n = 0
        for it in items:
            k = re.sub(r"\W+", "", it["titulo"].lower())[:60]
            if k not in vistos:
                vistos[k] = {**it, "ronda": ronda}; n += 1
        return n
    for q in consultas_iniciales(hecho):
        n = agregar(rss(q), 1); qlog.append((1, q, n))
    lista = list(vistos.values())[:max_leer]
    fuentes = []
    def leer(it):
        url, err = ih.resolver(it["link"])
        txt = ""; ok = False
        if url:
            try:
                txt = ih.leer_nota(url)[0] if isinstance(ih.leer_nota(url), tuple) else ih.leer_nota(url)
            except Exception:
                txt = ""
        txt = txt if isinstance(txt, str) else ""
        return {"medio": it["medio"], "titulo": it["titulo"], "url": url or it["link"], "fecha": dt.datetime.fromtimestamp(it["pub"] / 1000, dt.timezone(dt.timedelta(hours=-4))).strftime("%d/%m %H:%M") if it["pub"] else "", "pub": it["pub"], "ronda": it["ronda"], "leida": len(txt) > 300, "texto": txt[:8000], "resolvio": bool(url)}
    for it in lista:
        fuentes.append(leer(it))
    comunes, lugar = anclas(hecho)
    for f in fuentes:
        f["relevante"] = relevante(f, comunes, lugar)
    rel1 = [f for f in fuentes if f["relevante"]]
    nombres = nombres_propios([f["texto"] for f in rel1] + [f["titulo"] for f in rel1], minimo=2)[:4]
    log("anclas:", comunes, lugar, "| relevantes ronda 1:", len(rel1), "de", len(fuentes), "| nombres:", nombres)
    # ronda 2: con los nombres hallados, en español y en inglés
    for nm in nombres:
        for hl, gl, ceid, etq in (("es-419", "BO", "BO:es-419", "es"), ("en-US", "US", "US:en", "en")):
            n = agregar([dict(x, ronda=2) for x in rss(nm, hl, gl, ceid)], 2); qlog.append((2, f"{nm} [{etq}]", n))
    nuevos = [v for v in vistos.values() if v["ronda"] == 2][:max_leer]
    for it in nuevos:
        f = leer(it); f["relevante"] = relevante(f, comunes, lugar, nombres); fuentes.append(f)
    # lugares y coordenadas
    fuentes = [f for f in fuentes if f.get("relevante")]
    textos = [f["texto"] for f in fuentes if f["leida"]]
    ciudad = (hecho.get("lugar") or "El Alto").split(",")[0]
    geo = [nominatim(l, ciudad) for l in lugares_en(textos)[:7]]
    pts = [g for g in geo if "lat" in g]
    ref = (hecho.get("lat"), hecho.get("lon"))
    for g in pts:
        if ref[0] is not None:
            g["km_al_centro_municipio"] = distancia_km((g["lat"], g["lon"]), ref)
    total = len(vistos)
    analisis, prov = analizar([f for f in fuentes if f["leida"]])
    res = {"hecho_id": hecho["id"], "generado": dt.datetime.now(dt.timezone.utc).isoformat(), "segundos": round(time.time() - t0),
           "consultas": qlog, "descartadas_por_ruido": total - len(fuentes), "n_fuentes": len(fuentes), "n_leidas": sum(f["leida"] for f in fuentes), "nombres_propios": nombres, "lugares": geo, "ia": prov, "analisis": analisis,
           "fuentes": [{k: v for k, v in f.items() if k != "texto"} for f in fuentes]}
    return res, fuentes


if __name__ == "__main__":
    hid = sys.argv[1]
    H = json.load(open("datos/v3/hechos.json", encoding="utf-8"))[hid]
    res, fuentes = investigar(H)
    os.makedirs(SALIDA, exist_ok=True)
    json.dump(res, open(f"{SALIDA}/{hid.replace(':', '_')}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("RESUMEN fuentes:", res["n_fuentes"], "leídas:", res["n_leidas"], "segundos:", res["segundos"], "IA:", res["ia"])
    por = collections.Counter(f["medio"] for f in fuentes if f["leida"]); print("MEDIOS LEÍDOS:", dict(por))
    for f in sorted(fuentes, key=lambda f: f["pub"] or 0): print("  ", f["fecha"], "|", f["medio"], "|", "LEÍDA" if f["leida"] else "titular", "| r", f["ronda"], "|", f["titulo"][:80])
    print("NOMBRES:", res["nombres_propios"])
    for g in res["lugares"]: print("LUGAR:", {k: v for k, v in g.items()})
    if isinstance(res["analisis"], dict):
        print("ANALISIS:", json.dumps(res["analisis"], ensure_ascii=False)[:3000])

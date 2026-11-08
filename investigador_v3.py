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
LUGARES_COMUNES = {"YouTube", "Instagram", "Facebook", "Bolivia", "El Alto", "La Paz", "Santa Cruz", "Cochabamba", "Oruro", "Potosí", "Tarija", "Beni", "Pando", "Chuquisaca", "Policía", "Fiscalía", "Cancillería", "Embajada", "Ministerio", "Gobierno", "Red Uno", "Unitel", "El Deber", "Corea", "Sudamérica", "Perú", "México"}


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


TEMAS = [(r"tr[aá]nsito|accidente", r"ciclist|atropell|accident|cami[oó]n|choque|tr[aá]nsito|colisi|volcad|embest|veh[ií]cul"),
         (r"sequ", r"sequ|d[eé]ficit h[ií]drico|cisterna|forraje|falta de agua|escasez de agua|mortandad|cultivo"),
         (r"inund|riada|desliz", r"inund|riada|desborde|desliz|lluvia|r[ií]o|damnific|evacua"),
         (r"incendio", r"incendio|fuego|quema|llamas|bombero|hect[aá]rea|focos"),
         (r"sismo|terremoto", r"sismo|temblor|terremoto|magnitud|r[eé]plica"),
         (r"brote|intox|sanidad|rabia|dengue|chikun", r"brote|casos|dengue|chikun|rabia|intoxic|epidemi|v[ií]ctimas|sanitari")]


def tema_de(subtipo):
    for rx, tema in TEMAS:
        if re.search(rx, subtipo or "", re.I):
            return tema
    return None


def relevante(f, comunes, lugar, nombres=(), tema=None):
    base = _n(f["titulo"] + " " + f.get("texto", "")[:2500])
    if tema and not re.search(_n(tema), base):
        return False
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
        for intento in range(5):
            for modelo in ("gemini-3.8-flash", "gemini-flash-latest"):
                try:
                    cuerpo = {"systemInstruction": {"parts": [{"text": sistema}]}, "contents": [{"role": "user", "parts": [{"text": usuario}]}], "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "maxOutputTokens": max_tokens, "thinkingConfig": {"thinkingBudget": 0}}}
                    r = json.load(urllib.request.urlopen(urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={k}", data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"}), timeout=240))
                    return r["candidates"][0]["content"]["parts"][0]["text"], "gemini/" + modelo
                except urllib.error.HTTPError as e:
                    errores.append(f"intento {intento + 1} gemini/{modelo}: HTTP {e.code}")
                except Exception as e:
                    errores.append(f"intento {intento + 1} gemini/{modelo}: " + type(e).__name__)
            time.sleep(15 * (intento + 1) if not os.environ.get('GROQ_API_KEY') else 3)  # el servicio gratuito a veces responde 503 por alta demanda: se reintenta
    k = os.environ.get("GROQ_API_KEY", "").strip()
    if k:
        for modelo in ("llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"):
            try:
                cuerpo = {"model": modelo, "temperature": 0, "response_format": {"type": "json_object"}, "max_tokens": min(max_tokens, 5000), "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": usuario[:26000]}]}
                r = json.load(urllib.request.urlopen(urllib.request.Request("https://api.groq.com/openai/v1/chat/completions", data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + k, "User-Agent": UA}), timeout=120))
                return r["choices"][0]["message"]["content"], "groq/" + modelo
            except urllib.error.HTTPError as e:
                try: cuerpo_err = e.read().decode()[:160]
                except Exception: cuerpo_err = ""
                errores.append(f"groq/{modelo}: HTTP {e.code} {cuerpo_err}")
            except Exception as e:
                errores.append(f"groq/{modelo}: " + type(e).__name__)
    return None, ("; ".join(errores) if errores else "sin clave de IA en los secretos (GEMINI_API_KEY o GROQ_API_KEY)")


SISTEMA = ("Eres analista de un centro coordinador de emergencias. Recibes artículos de prensa sobre UN hecho. Ignora los artículos que no traten del hecho indicado. Usa SOLO lo que dicen los artículos; cada afirmación debe citar el medio. "
           "Si un dato no aparece, escribe null. No inventes nombres, cifras ni cargos. Distingue lo que afirma el medio de lo que atribuye a una autoridad. Responde en JSON.")


def analizar(fuentes, nombres=(), descr=""):
    def del_hecho(f):
        t = _n(f["titulo"] + " " + f["texto"][:3000])
        if any(_n(n) in t for n in nombres):
            return True
        if f.get("medio", "").startswith("SENAMHI"):
            return True
        return ("el alto" in t or "bolivia" in t) and any(k in t for k in ("coreano", "jinstravel", "ciclista", "youtuber"))
    fuentes = [f for f in fuentes if f.get("texto") and del_hecho(f)][:18]
    arts = "\n\n".join(f"[{i + 1}] {f['medio']} · {f['fecha']} · {f['url']}\n{f['texto'][:2200]}" for i, f in enumerate(fuentes))[:30000]
    pedido = (f"HECHO: {descr}. Usa solo los artículos que traten de ESTE hecho.\n" if descr else "") + ("Con estos artículos devuelve JSON con: hecho{fecha,hora,lugar_versiones[{texto,fuentes}],victima{nombre,edad,nacionalidad},vehiculo,conductor{estado,declaraciones[{texto,atribuido_a,fuente}]}}, "
              "instituciones[{nombre,que_hizo,fuente}], cronologia[{cuando,que,fuentes}], afirmaciones[{dato,valor,fuentes,estado('coincide'|'fuente_unica'|'discrepa'),detalle}], "
              "vacios[strings: lo que NO se sabe y debería saberse], novedades_ultimas_24h[strings].\n\nARTÍCULOS:\n" + arts)
    txt, prov = llamar_ia(SISTEMA, pedido)
    if not txt:
        return None, prov
    try:
        return json.loads(txt), prov
    except Exception as e:
        return {"error_json": str(e)[:100], "crudo": txt[:500]}, prov


# ---------------------------------------------------------------- informe de situación a partir del análisis
BO_MEDIOS = ("eju", "red uno", "jornada", "la patria", "bolivia.com", "correo del sur", "abi", "agencia boliviana", "el día", "unitel", "erbol", "el deber", "los tiempos", "página siete", "brújula", "urgente", "opinión", "visión 360", "ATB".lower(), "la razón", "el potosí", "el diario", "red patria", "bolivia tv", "radio fides", "cambio")


def pais(f):
    m, u = f["medio"].lower(), (f.get("url") or "").lower()
    if re.search(r"[\uac00-\ud7af]", f["medio"]) or "korea" in m or "chosun" in m or "sbs" in m or "starnews" in m or ".kr" in u:
        return "KR"
    if ".bo/" in u or u.endswith(".bo") or any(b in m for b in BO_MEDIOS):
        return "BO"
    return "OT"


IDIOMAS = {"es": ("es-419", "BO", "BO:es-419"), "en": ("en-US", "US", "US:en"), "ko": ("ko", "KR", "KR:ko")}


def plan_busqueda(hecho, rel1, log=print):
    """La IA lee lo ya hallado y propone qué más buscar (nombres, otros idiomas, medios del país de la víctima). Si falla, queda el método por reglas."""
    vacio = {"nombres": [], "consultas": []}
    try:
        res = "\n".join(f"- {f['medio']}: {f['titulo']} :: {f.get('texto','')[:350]}" for f in rel1[:12])
        txt, _ = llamar_ia("Eres analista de vigilancia por eventos. Respondes SOLO JSON.",
                           f"Hecho: {hecho['subtipo']} en {hecho.get('lugar')}. Lo hallado hasta ahora:\n{res}\n\nPropón búsquedas para encontrar OTROS medios (nacionales, del país de origen de las personas, agencias, comunicados oficiales). "
                           'JSON: {"nombres":[hasta 4 nombres completos de personas/organizaciones/canales clave, tal como los escriben los medios y variantes de grafía],'
                           '"consultas":[hasta 8 {"q":texto corto de búsqueda,"idioma":"es"|"en"|"ko"}]}. Incluye consultas en el idioma del país de origen de la víctima si es extranjera.', max_tokens=1500)
        d = json.loads(txt) if txt else {}
        cons = []
        for c in d.get("consultas", [])[:8]:
            h = IDIOMAS.get(c.get("idioma", "es"), IDIOMAS["es"]); q = str(c.get("q", "")).strip()
            if q:
                cons.append((q[:120], *h))
        return {"nombres": [str(n) for n in d.get("nombres", [])[:4] if len(str(n)) > 3], "consultas": cons}
    except Exception as e:
        log("plan IA falló:", str(e)[:80]); return vacio


SIS_RED = ("Eres analista senior de un centro coordinador de emergencias del Ministerio de Salud de Bolivia. Redactas un INFORME DE SITUACIÓN para la máxima autoridad. "
           "Usa EXCLUSIVAMENTE el análisis y las fuentes que se te dan; no inventes cifras, nombres, cargos ni plazos de la prensa. Las acciones, responsables y plazos son propuestas tuyas y deben ser razonables y concretas. "
           "No nombres al conductor y no lo califiques: presunción de inocencia. Estilo directo, frases cortas, sin adornos. Responde SOLO JSON. "
           "El lector es la MAE del Ministerio de Salud y Deportes. Las acciones deben ser de un centro coordinador de emergencias y concretas: verificar el estado del caso con Policía/Fiscalía/Cancillería (fuente oficial), pedir el parte policial, coordinar con Cancillería la repatriación, fijar UN mensaje oficial único y quién lo emite, vigilar la cobertura mediática y seguir la audiencia cautelar. "
           "PROHIBIDO proponer apoyo psicológico, restos biológicos, ciclorrutas, campañas o infraestructura vial generales. Si algo no está en las fuentes, dilo en no_se_sabe; no lo rellenes. Máximo 5 acciones, cada una de una sola línea.")


def _json(txt):
    try:
        return json.loads(txt) if txt else None
    except Exception:
        return None


def redactar(hecho, analisis, fuentes, lugares):
    """Tres pedidos cortos (en vez de uno largo) para que también un modelo pequeño responda con precisión."""
    comp = json.dumps(analisis, ensure_ascii=False)[:14000]
    base = f"Hecho del sistema: {hecho['subtipo']} en {hecho.get('lugar')}. Hoy es {dt.date.today().isoformat()}.\nANÁLISIS CON CITAS:\n{comp}\n\n"
    lug = json.dumps([g["consulta"] for g in lugares if "lat" in g], ensure_ascii=False)
    pedidos = [
        ("""JSON con EXACTAMENTE: titulo (máx 70 car., describe el hecho concreto: quién, qué, dónde), clasificacion, nivel_atencion ('Bajo'|'Medio'|'Alto'),
esencial{paso: QUÉ OCURRIÓ en 2 frases con datos del análisis (no una acción), resuelto: qué ya está establecido, abierto: qué sigue sin saberse, requiere: la decisión o gestión que se pide a la MAE},
kpis [[valor, etiqueta] x5] (fallecidos, heridos, aprehendidos, medios que lo reportan, alcance: 'Internacional' si medios de otro país lo reportan, 'Nacional' si varios departamentos o medios nacionales, si no 'Local'),
hitos [{dia:int día de noviembre, hora:número 0-24, texto:máx 28 car., hecho:true|false}] (6 a 7; los pendientes hecho:false con dia >= hoy),
ficha [[campo, valor]] (Fecha y hora, Lugar, Víctima, Vehículo, Conductor, Causa, Estado del caso, Respaldo oficial, Confianza),
lugares_citados: nombres de la lista %s que son versiones del lugar del hecho.""" % lug),
        ("""JSON con EXACTAMENTE: areas: lista de 4 OBJETOS {nombre, estado ('ÁMBAR'|'ROJO'|'VERDE'|'GRIS'), situacion (qué hizo o dijo, con dato concreto), responsable (institución o cargo real citado en el análisis), falta (documento o decisión concreta que falta)} (Policía/Tránsito, Fiscalía, Cancillería/Consular, Salud/Morgue), 
acciones: lista de 5 OBJETOS {accion (una línea, verbo + objeto concreto), responsable_sugerido (cargo/unidad), plazo ('24 h','48 h','72 h','Continuo')} de un centro coordinador del Ministerio de Salud: confirmar el estado del caso con fuente oficial, solicitar parte policial/informe forense, coordinar con Cancillería el traslado, fijar un mensaje oficial único, seguir la audiencia cautelar. Nada de apoyo psicológico ni infraestructura vial.,
riesgos [[titulo, explicacion con base en el análisis]] x3."""),
        ("""JSON con EXACTAMENTE: triangulacion [[dato, fuentes_y_valores (cada medio con lo que dice), estado ('Coincide'|'Fuente única'|'DISCREPA'|'Sin confirmar')]] (8 a 12 filas: hora, lugar, nombre, edad, fuga, alcotest, estado del conductor, comunicados oficiales...), cronologia [[cuando, que]] (8 a 12), no_se_sabe [strings], seguimiento [strings]."""),
    ]
    out = {}; prov = ""
    for p in pedidos:
        txt, prov = llamar_ia(SIS_RED, base + p, max_tokens=3500)
        d = _json(txt)
        if not d:
            return None, "redacción incompleta: " + str(prov)[:200]
        out.update(d)
    return out, prov


def armar_informe(hecho, res, fuentes, red):
    lei = [f for f in fuentes if f.get("leida") and f.get("relevante")]
    nac = sorted({f["medio"] for f in lei if pais(f) == "BO"}); intl = sorted({f["medio"] for f in lei if pais(f) != "BO"})
    cob = [[dt.datetime.fromtimestamp(f["pub"] / 1000, dt.timezone(dt.timedelta(hours=-4))).strftime("%Y-%m-%d"), f["medio"][:22], pais(f)] for f in lei if f.get("pub")]
    cob = [c for c in cob if "2026-11-04" <= c[0] <= "2026-11-09"]
    sinf = sorted({f["medio"] for f in lei if not f.get("pub")})
    pts = []
    cit = [_n(x) for x in red.get("lugares_citados", [])]
    for g in res["lugares"]:
        if "lat" in g and any(_n(c) in _n(g["consulta"]) or _n(g["consulta"]) in _n(c) for c in cit):
            pts.append({"nombre": g["consulta"], "lat": g["lat"], "lon": g["lon"]})
    A = dict(red)
    A.update({"hecho_id": hecho["id"], "codigo": "SITREP-AUTO-" + hecho["id"][-6:], "solicitado_por": "Máxima Autoridad Ejecutiva (MAE)", "corte": dt.datetime.now(dt.timezone(dt.timedelta(hours=-4))).strftime("%Y-%m-%d %H:%M (hora de Bolivia)"),
              "cobertura": cob, "sin_fecha": ("Sin fecha verificada: " + ", ".join(sinf[:8]) + ".") if sinf else "", "medios_nacionales": nac, "medios_internacionales": intl, "leidos_completos": [f["medio"] for f in lei],
              "mapa": {"puntos": pts}, "fuentes": [[f["medio"], f["url"], f["fecha"]] for f in sorted(lei, key=lambda f: f.get("pub") or 0)][:24]})
    A["kpis"] = [list(map(str, k)) for k in A.get("kpis", [])][:5]
    def txt(x):
        if isinstance(x, dict):
            return "; ".join(f"{k}: {txt(v)}" for k, v in x.items())
        if isinstance(x, (list, tuple)):
            return "; ".join(txt(i) for i in x)
        return {"no_se_sabe": "Sin confirmar"}.get(str(x), str(x))
    def fila(r, n, claves):
        if isinstance(r, str):
            r = [r]
        elif isinstance(r, dict):
            r = [r.get(k, "") for k in claves] if any(k in r for k in claves) else list(r.values())
        r = [txt(x) for x in r][:n]
        return r + [""] * (n - len(r))
    CL = {"acciones": ("accion", "responsable_sugerido", "plazo"), "riesgos": ("titulo", "explicacion"), "ficha": ("campo", "valor"),
          "triangulacion": ("dato", "fuentes_y_valores", "estado"), "cronologia": ("cuando", "que"),
          "areas": ("nombre", "estado", "situacion", "responsable", "falta")}
    for clave, n in (("acciones", 3), ("riesgos", 2), ("ficha", 2), ("triangulacion", 3), ("cronologia", 2), ("areas", 5)):
        A[clave] = [fila(r, n, CL[clave]) for r in A.get(clave, [])]
    for r in A["acciones"]:
        if not r[1]:
            r[1] = "Centro Coordinador de Emergencias"
        if not r[2]:
            m = re.search(r"antes del (\d{4})-(\d\d)-(\d\d)", r[0]); r[2] = f"{m.group(3)}/{m.group(2)}" if m else "Por definir"
            r[0] = re.sub(r"\s*antes del \d{4}-\d\d-\d\d\.?", ".", r[0])
    for r in A["triangulacion"]:
        r[0] = r[0].replace("_", " ").capitalize()
        r[2] = {"coincide": "Coincide", "fuente_unica": "Fuente única", "discrepa": "DISCREPA"}.get(r[2].lower(), r[2])
    return A


# ---------------------------------------------------------------- boletín (producto final)
SIS_BOL = ("Eres analista senior del Centro Coordinador de Emergencias en Salud del Ministerio de Salud y Deportes de Bolivia. Escribes un BOLETÍN DE SITUACIÓN para la máxima autoridad: "
           "solo lo que se sabe, dónde, qué falta y qué se pide. Usa EXCLUSIVAMENTE el análisis dado; no inventes datos. Frases cortas y directas. No nombres ni califiques al conductor (presunción de inocencia). "
           "Cuando los medios discrepan en un dato, dilo en la misma celda ('Discrepa: A según X; B según Y'). Nada de apoyo psicológico ni infraestructura vial. ADAPTA kpis, dimensiones de trazabilidad y acciones al TIPO de evento (tránsito: fallecidos, aprehendidos, repatriación; sequía/inundación/incendio: afectados, municipios, declaratoria de emergencia, ayuda; brote: casos, defunciones, control). Responde SOLO JSON.")


def og_imagen(fuentes, nombre, log=print):
    """Primer medio que cita a la persona y publica un retrato (og:image). Se enlaza, no se copia."""
    clave = _n(nombre.split()[0]) if nombre else ""
    for f in fuentes[:14]:
        if not f.get("leida") or not f.get("url", "").startswith("http") or (clave and clave not in _n(f["titulo"] + f["texto"][:1500])):
            continue
        try:
            html = _get(f["url"], 15)
            html = html.decode("utf-8", "ignore") if isinstance(html, bytes) else str(html)
            m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html) or re.search(r'content=["\']([^"\']+)["\'][^>]+property=["\']og:image', html)
            if m and "logo" not in m.group(1).lower():
                return f["url"], f["medio"]
        except Exception as ex:
            log("og:image falló", f["medio"], str(ex)[:60])
    return None, None


DIM_TIPO = [
    (r"tr[aá]nsito|accidente", "Identificación, Auxilio y atención en el lugar, Traslado y fallecimiento, Levantamiento y destino del cuerpo, Repatriación, Proceso judicial, Lugar del hecho",
     "personas fallecidas, aprehendidos, fecha del evento, alcance: 'Internacional' si medios de otro país lo reportan, 'Nacional' si varios departamentos o medios nacionales, si no 'Local'"),
    (r"sequ|inund|granizada|helada|riada|desliz", "Territorio afectado, Población y producción afectadas, Declaratoria y marco legal, Ayuda desplegada, Pérdidas reportadas, Necesidades pendientes, Pronóstico y evolución",
     "municipios afectados, familias o personas afectadas (si no hay dato 'S/D'), pérdidas principales (p. ej. cabezas de ganado, hectáreas), situación de la declaratoria ('Emergencia'|'Desastre'|'Sin declaratoria')"),
    (r"incendio", "Zona y superficie, Focos y control, Personas afectadas o evacuadas, Recursos desplegados, Causa, Riesgo para la salud (humo, calidad del aire), Declaratoria",
     "hectáreas o viviendas afectadas, personas afectadas, focos activos, estado ('Activo'|'Controlado'|'Extinguido')"),
    (r"sismo|terremoto", "Magnitud y epicentro, Daños, Personas afectadas, Respuesta, Servicios de salud, Réplicas, Declaratoria", "magnitud, personas heridas o fallecidas, viviendas afectadas, alcance"),
    (r"brote|intox|sanidad|rabia|dengue|chikun", "Casos confirmados y sospechosos, Defunciones, Territorio, Agente o causa, Medidas de control, Capacidad de servicios, Comunicación de riesgo", "casos, defunciones, municipios afectados, estado del control"),
]


def dim_tipo(subtipo):
    for rx, dims, kp in DIM_TIPO:
        if re.search(rx, subtipo or "", re.I):
            return dims, kp
    return "Qué ocurrió, Personas afectadas, Territorio, Respuesta de las instituciones, Daños y pérdidas, Qué falta por confirmar, Seguimiento", "personas afectadas, fallecidos, fecha del evento, alcance"


def redactar_boletin(hecho, analisis, log=print):
    dims, kpis = dim_tipo(hecho.get('subtipo'))
    comp = json.dumps(analisis, ensure_ascii=False)[:15000]
    base = f"Hecho: {hecho['subtipo']} en {hecho.get('lugar')}. Hoy es {dt.date.today().isoformat()}.\nANÁLISIS CON CITAS:\n{comp}\n\n"
    pedidos = [
        """JSON con EXACTAMENTE: titulo (máx 80 car., tipo de evento · lugar), sintesis (4-5 frases: quién, qué, cuándo, dónde, estado del caso, qué se discute o falta; sin acciones),
kpis [[valor, etiqueta] x4] (%s),
victima{nombre, detalle (edad · nacionalidad · cómo se le conoce)}, vehiculo (en mayúsculas, p. ej. 'CAMIÓN DE CARGA'),
versiones_lugar [{nombre_corto, consulta (lugar geocodificable corto, p. ej. 'Molino Andino, El Alto'), version 'A' (primera) o 'B' (posterior; solo si los medios discrepan en el lugar de un hecho puntual)}] (máx 10; en eventos extensos como sequía o inundación, los municipios afectados, todos 'A'),
operativa (2-3 frases de SITUACIÓN ACTUAL: en qué etapa está el caso y qué queda por cerrarse; es un boletín público: NO pidas acciones ni decisiones a nadie),
acciones [objetos {accion (una línea concreta), responsable_sugerido, plazo ('24 h','48 h','72 h','Continuo')}] x4: confirmar estado del caso con Policía/Fiscalía, pedir parte policial y forense, coordinar con Cancillería, fijar un mensaje oficial único.""",
        """JSON con EXACTAMENTE: trazabilidad [objetos {dimension, hallazgo, estado}] x7 con ESTAS dimensiones (en este orden): %s. 'hallazgo' = qué se sabe, en una frase, sin nombrar medios. 'estado' = SOLO una de: 'Confirmado' | 'Pendiente: <qué falta y quién lo tiene>' | 'Discrepa: <A> / <B>' | 'Sin dato público'. No cuentes medios ni cites fuentes aquí,
cronologia [objetos {cuando, que}] x7 (fecha y hora, un hecho por fila), reconstruccion (2-3 frases, informativa no pericial), vacios [strings: 5 documentos o datos que faltan y quién los tiene]."""]
    pedidos = [pedidos[0] % kpis, pedidos[1] % dims]
    out = {}
    for ped in pedidos:
        txt, prov = llamar_ia(SIS_BOL, base + ped, max_tokens=3500)
        d = _json(txt)
        if not d:
            return None, "redacción incompleta: " + str(prov)[:200]
        out.update(d); out["_prov"] = prov
    return out, out["_prov"]


def armar_boletin(hecho, res, fuentes, R, log=print):
    ahora = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4)))
    pts = []
    for v in [v for v in R.get("versiones_lugar", []) if not re.search(r"(?i)precis|principal|general|desconoc|no se", str(v.get("nombre_corto", "")) + str(v.get("consulta", "")))][:10]:
        ciudad = (hecho.get("lugar") or "El Alto").split(",")[0]
        cand = [str(v.get("consulta", "")), str(v.get("nombre_corto", "")), re.sub(r"(?i)^(av\.?|avenida|calle|sector|zona)\s+", "", str(v.get("nombre_corto", "")))]
        for q in dict.fromkeys(c for c in cand if len(c) > 3):
            g = nominatim(q, ciudad)
            if "lat" in g and distancia_km((g["lat"], g["lon"]), (hecho.get("lat") or g["lat"], hecho.get("lon") or g["lon"])) < 25:
                pts.append({"nombre": str(v.get("nombre_corto", q))[:40], "lat": g["lat"], "lon": g["lon"], "version": "B" if str(v.get("version")).upper() == "B" else "A"}); break
    if len(pts) < 1:  # respaldo: lugares hallados por reglas
        pts = [{"nombre": g["consulta"][:40], "lat": g["lat"], "lon": g["lon"], "version": "A"} for g in res["lugares"] if "lat" in g][:4]
    vic = R.get("victima", {}) or {}
    conductor = json.dumps((res.get("analisis") or {}).get("hecho", {}).get("conductor", {}), ensure_ascii=False).lower()
    if any(w in conductor for w in ("aprehend", "detenci", "detenid")):
        R["kpis"] = [[("1" if (k[0] == "0" and "prehend" in str(k[1]).lower()) else k[0]), k[1]] for k in R.get("kpis", [])]
    sin_ubicar = [str(v.get("nombre_corto", "")) for v in R.get("versiones_lugar", []) if str(v.get("nombre_corto", "")) not in [p["nombre"] for p in pts]]
    furl, fmedio = og_imagen(fuentes, vic.get("nombre", ""), log)
    lei = [f for f in fuentes if f.get("leida")]
    lat = [f for f in lei if not re.search(r"[\uac00-\ud7af]", f["medio"])]
    otros = len(lei) - len(lat)
    fu = [[f["medio"][:34], f["fecha"][:5] or "s/f"] for f in sorted(lat, key=lambda f: f.get("pub") or 0)][:30]
    if otros:
        fu.append([f"+{otros} notas de medios en coreano", ""])
    def fila(x, ks):
        return [str(x.get(k, "")) for k in ks] if isinstance(x, dict) else [str(i) for i in (list(x) + ["", "", ""])[:len(ks)]]
    return {"codigo": "BOL-" + hecho["id"][-6:].upper(), "titulo": R.get("titulo", ""),
            "meta": [["BOLETÍN", "001"], ["FECHA DEL HECHO", dt.datetime.fromtimestamp(hecho["primera"] / 1000, dt.timezone(dt.timedelta(hours=-4))).strftime("%d %b %Y").upper()],
                     ["CORTE", ahora.strftime("%d %b %Y · %H:%M BOT").upper()], ["ESTADO", "Seguimiento"]],
            "sintesis": R.get("sintesis", ""), "kpis": [[("S/D" if a in (None, "None", "null", "") else str(a)), str(b)] for a, b in [(list(k) + ["", ""])[:2] for k in R.get("kpis", [])]][:4], "puntos": pts, "nota_mapa": ("No se pudo ubicar en OpenStreetMap: " + ", ".join(sin_ubicar) + ".") if sin_ubicar else "",
            "victima": {"nombre": vic.get("nombre") or "", "detalle": vic.get("detalle") or ""}, "foto_url": furl, "foto_medio": fmedio, "vehiculo": R.get("vehiculo", "VEHÍCULO"), "lluvia": (res.get("oficiales") or {}).get("lluvia"), "mapa_tipo": "versiones" if re.search(r"(?i)tr[aá]nsito|accidente", hecho.get("subtipo") or "") else "afectados", "esquema": bool(re.search(r"(?i)tr[aá]nsito|accidente", hecho.get("subtipo") or "")),
            "operativa": R.get("operativa", ""), "acciones": [fila(a, ("accion", "responsable_sugerido", "plazo")) for a in R.get("acciones", [])][:4],
            "trazabilidad": [fila(t, ("dimension", "hallazgo", "estado")) for t in R.get("trazabilidad", [])], "cronologia": [fila(c, ("cuando", "que"))[:2] for c in R.get("cronologia", [])],
            "reconstruccion": R.get("reconstruccion", ""), "vacios": [str(v) for v in R.get("vacios", [])],
            "metodo": f"Búsqueda automática en prensa de Bolivia, Corea del Sur y otros países ({len(res['fuentes'])} notas halladas, {len(lei)} leídas completas); cruce de cada dato entre medios; lugares ubicados en OpenStreetMap. Redacción asistida por IA ({res['ia']}); requiere revisión humana antes de circular.",
            "fuentes": fu}


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
        f["relevante"] = relevante(f, comunes, lugar, (), tema_de(hecho.get("subtipo")))
    rel1 = [f for f in fuentes if f["relevante"]]
    tabu = set(re.findall(r"[a-z]{4,}", lugar)) | set(comunes) | {"alto"}
    nombres = [n for n in nombres_propios([f["texto"] for f in rel1] + [f["titulo"] for f in rel1], minimo=2) if not (set(re.findall(r"[a-z]{4,}", _n(n))) & tabu)][:3]
    plan = plan_busqueda(hecho, rel1 or fuentes[:8], log)
    nombres = list(dict.fromkeys(plan["nombres"] + nombres))[:6]
    log("anclas:", comunes, lugar, "| relevantes ronda 1:", len(rel1), "de", len(fuentes), "| nombres:", nombres, "| consultas IA:", plan["consultas"])
    for q, hl, gl, ceid in plan["consultas"]:
        n = agregar([dict(x, ronda=2) for x in rss(q, hl, gl, ceid)], 2); qlog.append((2, f"{q} [{hl}]", n))
    for nm in nombres[:3]:
        for hl, gl, ceid, etq in (("es-419", "BO", "BO:es-419", "es"), ("en-US", "US", "US:en", "en")):
            n = agregar([dict(x, ronda=2) for x in rss(nm, hl, gl, ceid)], 2); qlog.append((2, f"{nm} [{etq}]", n))
    nuevos = [v for v in vistos.values() if v["ronda"] == 2][:max_leer + 20]
    for it in nuevos:
        f = leer(it); f["relevante"] = relevante(f, comunes, lugar, nombres, tema_de(hecho.get("subtipo"))); fuentes.append(f)
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
    try:
        import oficiales_v3
        ref_ll = (hecho.get("lat"), hecho.get("lon")) if hecho.get("lat") is not None else ((pts[0]["lat"], pts[0]["lon"]) if pts else (None, None))
        ofi = oficiales_v3.para(hecho.get("subtipo"), ref_ll[0], ref_ll[1], log, hecho.get("lugar") or "")
    except Exception as e:
        ofi = {"lluvia": None, "textos": []}; log("oficiales:", str(e)[:80])
    analisis, prov = analizar([f for f in fuentes if f["leida"]] + ofi["textos"], nombres, f"{hecho['subtipo']} en {hecho.get('lugar')}")
    res = {"hecho_id": hecho["id"], "generado": dt.datetime.now(dt.timezone.utc).isoformat(), "segundos": round(time.time() - t0),
           "consultas": qlog, "descartadas_por_ruido": total - len(fuentes), "n_fuentes": len(fuentes), "n_leidas": sum(f["leida"] for f in fuentes), "nombres_propios": nombres, "lugares": geo, "oficiales": {"lluvia": ofi["lluvia"], "textos": [{"medio": t["medio"], "url": t["url"]} for t in ofi["textos"]]}, "ia": prov, "analisis": analisis,
           "fuentes": [{k: v for k, v in f.items() if k != "texto"} for f in fuentes]}
    return res, fuentes


if __name__ == "__main__":
    hid = sys.argv[1]
    H = json.load(open("datos/v3/hechos.json", encoding="utf-8"))[hid]
    res, fuentes = investigar(H)
    os.makedirs(SALIDA, exist_ok=True)
    json.dump(res, open(f"{SALIDA}/{hid.replace(':', '_')}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if isinstance(res["analisis"], dict) and "error_json" not in res["analisis"]:
        try:
            an = res["analisis"]
            hay = bool(an.get("instituciones") or an.get("cronologia") or an.get("afirmaciones") or (an.get("hecho") or {}).get("fecha"))
            medios = len({f["medio"] for f in fuentes if f["leida"]})
            if not hay or medios < 2:
                print("SIN EVENTO VERIFICABLE: el análisis no encontró hechos concretos o hay menos de 2 medios; no se genera boletín.")
                raise SystemExit(0)
            R, prov = redactar_boletin(H, res["analisis"])
            print("REDACCION:", "ok" if R else prov)
            if R:
                B = armar_boletin(H, res, fuentes, R)
                ruta = f"{SALIDA}/{hid.replace(':', '_')}_boletin.json"
                json.dump(B, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                pdf = f"{SALIDA}/{hid.replace(':', '_')}_BOLETIN.pdf"
                try:
                    import boletin_html
                    boletin_html.build(B, pdf)
                except Exception as ex:
                    print("HTML→PDF falló, se usa el formato simple:", str(ex)[:200])
                    import boletin_v3
                    boletin_v3.build(B, pdf)
                print("PDF generado")
        except Exception:
            import traceback; traceback.print_exc()
    print("RESUMEN fuentes:", res["n_fuentes"], "leídas:", res["n_leidas"], "segundos:", res["segundos"], "IA:", res["ia"])
    por = collections.Counter(f["medio"] for f in fuentes if f["leida"]); print("MEDIOS LEÍDOS:", dict(por))
    for f in sorted(fuentes, key=lambda f: f["pub"] or 0): print("  ", f["fecha"], "|", f["medio"], "|", "LEÍDA" if f["leida"] else "titular", "| r", f["ronda"], "|", f["titulo"][:80])
    print("NOMBRES:", res["nombres_propios"])
    for g in res["lugares"]: print("LUGAR:", {k: v for k, v in g.items()})
    if isinstance(res["analisis"], dict):
        print("ANALISIS:", json.dumps(res["analisis"], ensure_ascii=False)[:3000])

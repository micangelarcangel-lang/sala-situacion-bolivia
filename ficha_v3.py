# -*- coding: utf-8 -*-
"""Ficha por tipo de evento (v3). Cada campo tiene un estado explícito, nunca un hueco mudo:
   cifra          -> el texto da un número (valor)
   sin_victimas   -> el texto dice que NO hubo (solo fallecidos/heridos)
   no_precisado   -> el texto lo menciona sin número ("varios heridos")
   no_informado   -> el texto no lo menciona
La ficha lista 'faltan' = campos esperados para ese tipo que no quedaron en 'cifra'/'sin_victimas'/'dato'. Solo extrae de texto de prensa: no inventa."""
import re, unicodedata

NUM = {"un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12, "quince": 15, "veinte": 20}
VAGO = r"(?:varios|varias|algunos|algunas|numerosos|decenas de|cientos de|miles de)"

ESPERADOS = {
    "accidente de tránsito": ["tipo_accidente", "vehiculos", "fallecidos", "heridos"],
    "accidente aéreo": ["fallecidos", "heridos"],
    "incendio forestal": ["superficie_ha", "fallecidos", "heridos", "evacuados"],
    "incendio estructural": ["clase_inmueble", "fallecidos", "heridos", "evacuados"],
    "granizada / helada / viento": ["viviendas", "superficie_ha", "personas_afectadas", "fallecidos", "heridos"],
    "sequía": ["familias_afectadas", "personas_afectadas", "ganado", "superficie_ha", "fallecidos"],
    "inundación / riada": ["familias_afectadas", "personas_afectadas", "viviendas", "ganado", "fallecidos"],
    "deslizamiento": ["viviendas", "personas_afectadas", "fallecidos", "heridos"],
    "brote / enfermedad transmisible": ["casos_notificados", "casos_confirmados", "casos_sospechosos", "expuestos", "fallecidos"],
    "intoxicación / alimentos": ["casos_notificados", "casos_confirmados", "casos_sospechosos", "expuestos", "fallecidos"],
    "sismo": ["magnitud", "fallecidos", "heridos"],
    "explosión / fuga": ["fallecidos", "heridos", "evacuados"],
    "colapso estructural": ["clase_inmueble", "fallecidos", "heridos", "evacuados"],
    "sanidad animal": ["ganado", "casos_confirmados"],
    "intoxicación por gases (mina)": ["casos_notificados", "fallecidos", "heridos"],
}
TIPOS_ACCIDENTE = [("choque frontal", r"choque frontal"), ("colisión múltiple", r"colision multiple|choque multiple|accidente en cadena"), ("vuelco", r"vuelco|volco|volcadura"), ("atropello", r"atropell\w+"),
                   ("embarrancamiento", r"embarranc\w+|cae a un barranco|cayo a un barranco|precipit\w+"), ("choque", r"choque|colision|colisiono|choco|impact\w+"), ("despiste", r"despist\w+|se salio de la via")]
VEHICULOS = [("bus", r"\bbus\b|\bflota\b|\bomnibus\b"), ("minibús", r"minibus|\bmicro\b|trufi"), ("camión", r"camion|volqueta|tonel"), ("cisterna", r"cisterna"), ("motocicleta", r"moto\b|motocicleta|motociclista"),
             ("vagoneta", r"vagoneta|camioneta|\bjeep\b"), ("automóvil", r"\bauto\b|automovil|vehiculo liviano|taxi|\bcoche\b"), ("bicicleta", r"bicicleta|ciclista"), ("tren", r"\btren\b")]


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9,. ]+", " ", t)).strip()


def _num(tok, mil=False):
    tok = tok.replace(".", "").replace(",", ".") if tok.replace(".", "").replace(",", "").isdigit() and not re.fullmatch(r"\d{1,3}(\.\d{3})+", tok) else tok.replace(".", "")
    try:
        v = float(tok) if re.fullmatch(r"\d+(\.\d+)?", tok) else NUM.get(tok)
    except ValueError:
        v = None
    if v is None:
        return None
    return int(v * (1000 if mil else 1)) if float(v).is_integer() or mil else v


def _cifra(t, sustantivo, tope=10_000_000):
    """Primer 'N <sustantivo>' (admite '114 mil', '1.200', 'dos'). Devuelve int o None."""
    m = re.search(r"\b(\d[\d.,]*|" + "|".join(NUM) + r")\s*(mil\b)?\s*(?:de\s+)?(?:" + sustantivo + ")", t)
    if not m:
        return None
    v = _num(m.group(1), bool(m.group(2)))
    return int(v) if v is not None and v <= tope else None


def _campo(t, sustantivo, vago_ok=True):
    v = _cifra(t, sustantivo)
    if v is not None:
        return {"estado": "cifra", "valor": v}
    if vago_ok and re.search(VAGO + r"\s+(?:\w+\s+){0,2}(?:" + sustantivo + ")", t):
        return {"estado": "no_precisado"}
    if re.search(r"(?:" + sustantivo + r")\W+(?:\w+\W+){0,3}(?:afectad|damnificad|perdid|destruid|danad)", t) or re.search(r"(?:afectad|damnificad)\w*\W+(?:\w+\W+){0,3}(?:" + sustantivo + ")", t):
        return {"estado": "no_precisado"}
    return {"estado": "no_informado"}


SIN = r"(?:sin|no (?:se )?(?:reporto|reportaron|registro|registraron|hubo|dejo|dejaron|tuvo|causo|causaron|hay|habria)|ningun[ao]?|cero|ilesos?)"


def _cifra_verbal(t, verbos):
    """'Tres presuntos ladrones mueren…', 'mueren tres', 'fallecieron 4 personas'."""
    m = re.search(r"\b(\d{1,3}|" + "|".join(NUM) + r")\s+(?:\w+\s+){0,4}(?:" + verbos + r")\b", t) or re.search(r"\b(?:" + verbos + r")\s+(\d{1,3}|" + "|".join(NUM) + r")\b", t)
    if m:
        v = _num(m.group(1))
        return int(v) if v is not None and v < 500 else None
    return None


def _victima(t, sust_p, sust_s):
    """fallecidos/heridos: cifra, sin_victimas, no_precisado o no_informado."""
    v = _cifra(t, sust_p)
    if v is None and sust_p.startswith("muert"):
        v = _cifra_verbal(t, r"mueren|murieron|fallecen|fallecieron|pierden la vida|perdieron la vida")
    if v is None and sust_p.startswith("herid"):
        v = _cifra_verbal(t, r"resultaron heridos|resultan heridos|quedaron heridos|quedan heridos")
    if v is not None:
        return {"estado": "cifra", "valor": v}
    if re.search(SIN + r"\s+(?:\w+\s+){0,3}(?:victimas|" + sust_p + ")", t) or re.search(r"\bsin (?:victimas|" + sust_p + r")\b", t):
        return {"estado": "sin_victimas", "valor": 0}
    if re.search(r"\b(?:muere|murio|fallece|fallecio|pierde la vida|perdio la vida|perece)\b", t) and "fallec" in sust_p + "muert":
        if sust_p.startswith("muert"):
            return {"estado": "cifra", "valor": 1}
    if re.search(r"\b(?:herida|herido|lesionad[oa]|resulto herid[oa])\b", t) and sust_p.startswith("herid") and re.search(r"\b(?:un|una)\s+(?:persona\s+)?(?:herid|lesionad)", t):
        return {"estado": "cifra", "valor": 1}
    if re.search(VAGO + r"\s+(?:\w+\s+){0,2}(?:" + sust_p + ")", t) or re.search(r"\b(?:deja|dejo|dejan|con)\s+(?:" + sust_p + ")", t):
        return {"estado": "no_precisado"}
    return {"estado": "no_informado"}


def extraer(subtipo, titulo, cuerpo="", max_cuerpo=3500):
    t = norm((titulo or "") + " . " + (cuerpo or "")[:max_cuerpo])
    tt = norm(titulo)
    PROP = r"\b(?:\d+|\w+) de cada \d+\b"  # '7 de cada 10 casos' es una proporción, no una cifra de casos
    t, tt = re.sub(PROP, "proporcion", t), re.sub(PROP, "proporcion", tt)
    f = {}
    M = r"muertos?|fallecid[oa]s?|fallecimientos?|victimas mortales"
    H = r"herid[oa]s?|lesionad[oa]s?"
    esperados = ESPERADOS.get(subtipo, ["fallecidos", "heridos"])
    for campo in esperados:
        if campo == "fallecidos":
            f[campo] = next((r for r in (_victima(tt, M, "muerto"),) if r["estado"] == "cifra"), None) or _victima(t, M, "muerto")  # la cifra del titular manda
        elif campo == "heridos":
            f[campo] = next((r for r in (_victima(tt, H, "herido"),) if r["estado"] == "cifra"), None) or _victima(t, H, "herido")
        elif campo == "tipo_accidente":
            val = next((n for n, pat in TIPOS_ACCIDENTE if re.search(pat, tt)), None) or next((n for n, pat in TIPOS_ACCIDENTE if re.search(pat, t)), None)
            f[campo] = {"estado": "dato", "valor": val} if val else {"estado": "no_informado"}
        elif campo == "vehiculos":
            vs = [n for n, pat in VEHICULOS if re.search(pat, tt)] or [n for n, pat in VEHICULOS if re.search(pat, t)][:3]
            f[campo] = {"estado": "dato", "valor": vs} if vs else {"estado": "no_informado"}
        elif campo == "superficie_ha":
            f[campo] = _campo(t, r"hectareas?|has\b", False)
        elif campo == "viviendas":
            f[campo] = _campo(t, r"viviendas?|casas?|techos?|domicilios?")
        elif campo == "familias_afectadas":
            f[campo] = _campo(t, r"familias?")
        elif campo == "personas_afectadas":
            f[campo] = _campo(t, r"personas? afectad\w+|afectados|damnificad\w+|habitantes|pobladores")
        elif campo == "ganado":
            f[campo] = _campo(t, r"cabezas de ganado|reses|animales|ovinos|camelidos|llamas|bovinos|vacunos|aves|peces")
        elif campo == "evacuados":
            f[campo] = _campo(t, r"evacuad\w+|desalojad\w+|albergad\w+")
        elif campo == "casos_notificados":
            f[campo] = _campo(t, r"casos?|enfermos|pacientes|contagiad\w+|infectad\w+|intoxicad\w+|afectad[oa]s por (?:el|la) \w+|personas afectadas|afectados")
        elif campo == "casos_confirmados":
            f[campo] = _campo(t, r"casos? (?:confirmad\w+|positiv\w+)|(?:confirmad\w+|positiv\w+)\b|caso\b")
        elif campo == "casos_sospechosos":
            f[campo] = _campo(t, r"casos? sospechos\w+|sospechos\w+|casos? probables?")
        elif campo == "expuestos":
            f[campo] = _campo(t, r"expuest\w+|contactos?|personas en observacion|visitas")
        elif campo == "magnitud":
            m = re.search(r"magnitud\s*(?:de\s*)?(\d+[.,]?\d*)", t)
            f[campo] = {"estado": "dato", "valor": float(m.group(1).replace(",", "."))} if m else {"estado": "no_informado"}
        elif campo == "clase_inmueble":
            m = re.search(r"\b(vivienda|casa|mercado|edificio|fabrica|tienda|deposito|local|taller|almacen|colegio|hospital)\b", tt)
            f[campo] = {"estado": "dato", "valor": m.group(1)} if m else {"estado": "no_informado"}
    faltan = [c for c, v in f.items() if v["estado"] in ("no_informado", "no_precisado")]
    return {"subtipo": subtipo, "campos": f, "faltan": faltan, "completitud": round(1 - len(faltan) / max(1, len(f)), 2)}


def etiqueta(campo):
    return {"tipo_accidente": "tipo de accidente", "superficie_ha": "superficie (ha)", "familias_afectadas": "familias afectadas", "personas_afectadas": "personas afectadas", "casos_confirmados": "casos confirmados", "casos_notificados": "casos notificados",
            "casos_sospechosos": "casos sospechosos", "clase_inmueble": "inmueble", "vehiculos": "vehículos"}.get(campo, campo)


def resumen(ficha):
    """Texto corto para el boletín: 'Fallecidos: sin víctimas reportadas · Heridos: 3 · Faltan: vehículos'."""
    out = []
    for c, v in ficha["campos"].items():
        e = v["estado"]
        if e == "cifra":
            out.append(f"{etiqueta(c).capitalize()}: {v['valor']:,}".replace(",", "."))
        elif e == "sin_victimas":
            out.append(f"{etiqueta(c).capitalize()}: sin víctimas reportadas")
        elif e == "dato":
            val = ", ".join(v["valor"]) if isinstance(v["valor"], list) else v["valor"]
            out.append(f"{etiqueta(c).capitalize()}: {val}")
        elif e == "no_precisado":
            out.append(f"{etiqueta(c).capitalize()}: mencionado, cifra no precisada")
    s = " · ".join(out)
    ni = [c for c in ficha["faltan"] if ficha["campos"][c]["estado"] == "no_informado"]
    if ni:
        s += (" · " if s else "") + "No informado: " + ", ".join(etiqueta(c) for c in ni)
    return s

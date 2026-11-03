# -*- coding: utf-8 -*-
"""Clasificación de un hecho de prensa (v3): categoría > subtipo, y si es de Bolivia. Reglas explícitas y revisables, no un modelo opaco.
clasificar(titulo, cuerpo, lugar_bolivia) -> {categoria, subtipo, ambito: bolivia|exterior|sin_lugar, relevante, razones}
El titular pesa más que el cuerpo; un hecho que solo aparece de pasada en el cuerpo (p. ej. 'luto en la música: artistas muertos en accidentes') no se clasifica."""
import re, unicodedata

TAXONOMIA = [  # (categoria, subtipo, patrón sobre el texto normalizado)
    ("antropogénica", "accidente de tránsito", r"\b(choque|colision|vuelco|volco|atropell\w+|accidente de transito|accidente vehicular|embarranc\w+|cae a un barranco|ocupantes)\b"),
    ("antropogénica", "accidente aéreo", r"\b(avion|avioneta|aeronave|helicoptero)\b.*\b(cae|cayo|accidente|estrell\w+|desplom\w+)\b|\baccidente aereo\b"),
    ("climatológica", "incendio forestal", r"\b(incendios? forestal\w*|incendio de pastizal\w*|chaqueo|quemas?|focos de calor)\b"),
    ("tecnológica", "incendio estructural", r"\b(incendio|incendi\w+)\b.*\b(vivienda|casa|mercado|edificio|fabrica|tienda|local|deposito|vehiculo|moto|bus)\b"),
    ("hidrológica", "inundación / riada", r"\b(inundacion\w*|riada|desborde|desbordamiento|crecida|anegad\w+|mazamorra)\b"),
    ("geológica", "deslizamiento", r"\b(deslizamiento|derrumbe|mazamorra|aluvion|socavon|hundimiento)\b"),
    ("geológica", "sismo", r"\b(sismo|temblor|terremoto)\b"),
    ("meteorológica", "granizada / helada / viento", r"\b(granizada|helada|nevada|ventarron|vientos? de|tormenta|lluvias? intensa\w*|alerta (naranja|roja|amarilla))\b"),
    ("climatológica", "sequía", r"\b(sequia|deficit hidrico|escasez de agua)\b"),
    ("biológica", "brote / enfermedad transmisible", r"\b(brote|epidemia|casos de|dengue|chikungunya|sarampion|fiebre amarilla|malaria|leptospirosis|meningitis|influenza|covid|rabia|tos convulsiva|tuberculosis|hantavirus|ebola|mpox|viruela)\b"),
    ("biológica", "intoxicación / alimentos", r"\b(intoxicacion|intoxicad\w+|envenenamiento)\b"),
    ("biológica", "sanidad animal", r"\b(aftosa|gripe aviar|peste porcina|brucelosis|newcastle|mortandad de (ganado|peces|aves))\b"),
    ("tecnológica", "explosión / fuga", r"\b(explosion|explotar|fuga de gas|derrame|intoxicacion por gas)\b"),
]
EXTERIOR = ("ucrania", "rusia", "zelenski", "putin", "israel", "gaza", "iran", "china", "japon", "espana", "espanol", "mexico", "argentina", "chile", "peru", "colombia", "brasil", "venezuela", "ecuador", "paraguay", "uruguay",
            "estados unidos", "eeuu", "trump", "francia", "alemania", "italia", "honduras", "guatemala", "cuba", "haiti", "montevideo", "galapagos", "papa", "vaticano", "zaporiyia", "kiev", "gaza", "siria", "india", "corea", "turquia", "filipinas", "indonesia", "nigeria", "sudan")
BOLIVIA = re.compile(r"\b(bolivia\w*|la paz|el alto|cochabamba|santa cruz|oruro|potosi|sucre|tarija|beni|pando|chuquisaca|trinidad|cobija|senamhi|vicepresidencia|ministerio de salud|gobernacion|alcaldia|chaco|yungas|chapare)\b")


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t)).strip()


def clasificar(titulo, cuerpo="", lugar_bolivia=False):
    tn, cn = norm(titulo), norm((cuerpo or "")[:1200])
    res = {"categoria": None, "subtipo": None, "ambito": "sin_lugar", "relevante": False, "razones": []}
    for cat, sub, pat in TAXONOMIA:
        if re.search(pat, tn):
            res.update(categoria=cat, subtipo=sub)
            res["razones"].append("tipo en el titular")
            break
    if res["subtipo"] is None:
        for cat, sub, pat in TAXONOMIA:
            if len(re.findall(pat, cn)) >= 2:  # en el cuerpo debe aparecer al menos dos veces para contar
                res.update(categoria=cat, subtipo=sub); res["razones"].append("tipo repetido en el cuerpo"); break
    ext = [p for p in EXTERIOR if re.search(r"\b" + p + r"\b", tn)]
    bol = bool(BOLIVIA.search(tn)) or lugar_bolivia
    if ext and not bol:
        res["ambito"] = "exterior"; res["razones"].append("nombra: " + ext[0])
    elif bol:
        res["ambito"] = "bolivia"
    elif BOLIVIA.search(cn[:600]):
        res["ambito"] = "bolivia"; res["razones"].append("Bolivia solo en el cuerpo")
    res["relevante"] = res["subtipo"] is not None and res["ambito"] != "exterior"
    return res

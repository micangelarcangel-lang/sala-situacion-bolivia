# -*- coding: utf-8 -*-
"""Clasificación de un hecho de prensa (v3): categoría > subtipo, y si es de Bolivia. Reglas explícitas y revisables, no un modelo opaco.
clasificar(titulo, cuerpo, lugar_bolivia) -> {categoria, subtipo, ambito: bolivia|exterior|sin_lugar, relevante, razones}
El titular pesa más que el cuerpo; un hecho que solo aparece de pasada en el cuerpo (p. ej. 'luto en la música: artistas muertos en accidentes') no se clasifica."""
import re, unicodedata

TAXONOMIA = [  # (categoria, subtipo, patrón sobre el texto normalizado)
    ("antropogénica", "accidente de tránsito", r"\baccidente (?!aereo|minero|laboral|domestico|de trabajo|cerebro)\w*|\b(choque|colision|vuelco|volco|atropell\w+|accidente de transito|accidente vehicular|embarranc\w+|cae a un barranco|ocupantes)\b"),
    ("antropogénica", "accidente aéreo", r"\b(avion|avioneta|aeronave|helicoptero)\b.*\b(cae|cayo|accidente|estrell\w+|desplom\w+)\b|\baccidente aereo\b"),
    ("climatológica", "incendio forestal", r"\b(incendios? forestal\w*|incendio de pastizal\w*|chaqueo|quemas? (?:de )?(?:pastiz\w+|chaco|campos?|rastrojos?|chaqueo)|focos de calor)\b"),
    ("tecnológica", "incendio estructural", r"\b(incendio|incendi\w+)\b.*\b(vivienda|casa|mercado|edificio|fabrica|tienda|local|deposito|vehiculo|moto|bus|restaurante|negocio|comercio|hotel|taller|almacen|colegio|hospital)\b|\bincendio\b|\bqueman (?:\d+ )?vehiculos|\bquema de (?:\d+ |\w+ )?vehiculos"),
    ("hidrológica", "inundación / riada", r"\b(inundacion\w*|riada|desborde|desbordamiento|crecida|anegad\w+|mazamorra)\b"),
    ("geológica", "deslizamiento", r"\b(deslizamiento|derrumbe|mazamorra|aluvion|socavon|hundimiento)\b"),
    ("geológica", "sismo", r"\b(sismo|temblor|terremoto)\b"),
    ("meteorológica", "granizada / helada / viento", r"\b(granizada|helada|nevada|ventarron|vientos? de|tormenta|lluvias? intensa\w*|senamhi\b.*\balerta|alerta\b.*\b(viento|ventarron|lluvia|tormenta|granizo|helada|frio|nevada|rafagas)\w*)\b"),
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


DEPORTE = re.compile(r"\b(arbitr\w*|delantero|portero|futbol|partidos?|suspension|gol|goles|rival|liga|campeonato|torneo|equipo|jugador\w*|fichaje|entrenador)\b")
RUIDO = ("agenda informativa", "resumen de noticias", "titulares del dia", "lo mas leido", "horoscopo", "como actuar", "como identificar", "asi puedes", "consejos", "recomendaciones", "que no cunda", "que hacer ante", "como prevenir", "como evitar")
EXTRA_EXT = ("guayaquil", "galapagos", "florida", "nueva york", "la guaira", "tenerife", "california", "texas", "londres", "paris", "madrid", "barcelona", "lima", "buenos aires", "santiago de chile", "bogota", "caracas", "quito", "asuncion", "brasilia", "sao paulo", "rio de janeiro")


def clasificar(titulo, cuerpo="", lugar_bolivia=False, estricto=False):
    tn, cn = norm(titulo), norm((cuerpo or "")[:1200])
    res = {"categoria": None, "subtipo": None, "ambito": "sin_lugar", "relevante": False, "razones": []}
    hallados = [(m.start(), cat, sub) for cat, sub, pat in TAXONOMIA for m in [re.search(pat, tn)] if m]
    if hallados:  # gana el tipo que aparece primero en el titular ("La sequía golpea… riadas" es sequía)
        _, cat, sub = min(hallados)
        res.update(categoria=cat, subtipo=sub)
        res["razones"].append("tipo en el titular")
    if res["subtipo"] is None:
        for cat, sub, pat in TAXONOMIA:
            if len(re.findall(pat, cn)) >= 2:  # en el cuerpo debe aparecer al menos dos veces para contar
                res.update(categoria=cat, subtipo=sub); res["razones"].append("tipo repetido en el cuerpo"); break
    if any(r in tn for r in RUIDO) or DEPORTE.search(tn):
        res["subtipo"], res["categoria"] = None, None
        res["razones"].append("ruido o deportes")
    ext = [p for p in EXTERIOR + EXTRA_EXT if re.search(r"\b" + p + r"\b", tn)]
    bol = bool(BOLIVIA.search(tn)) or lugar_bolivia
    bol_titulo = bool(BOLIVIA.search(tn))
    if ext and not bol_titulo:  # el titular nombra otro país y ningún lugar de Bolivia: es del exterior aunque el cuerpo cite una ciudad homónima
        res["ambito"] = "exterior"; res["razones"].append("nombra: " + ext[0])
    elif bol:
        res["ambito"] = "bolivia"
    elif BOLIVIA.search(cn[:600]):
        res["ambito"] = "bolivia"; res["razones"].append("Bolivia solo en el cuerpo")
    # estricto (notas nuevas de feeds, sin ubicación previa): exige evidencia de Bolivia, no solo ausencia de un país extranjero
    res["relevante"] = res["subtipo"] is not None and (res["ambito"] == "bolivia" if estricto else res["ambito"] != "exterior")
    return res

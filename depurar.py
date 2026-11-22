# -*- coding: utf-8 -*-
"""Depuración de notas de prensa: (1) descarta lo que no es un evento (efemérides, juicios, operativos) o es del extranjero;
(2) corrige la categoría según el contenido del titular (Ley 602 art. 36). Reglas explícitas y revisables."""
import re, unicodedata


def n(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")
    return " " + re.sub(r"\s+", " ", re.sub(r"[^a-z0-9ñ]+", " ", t)).strip() + " "


# lugares boliviano (departamentos y ciudades) → si aparecen junto a un país extranjero, gana lo boliviano
BO = ("bolivia", "bolivian", "la paz", "el alto", "cochabamba", "santa cruz", "oruro", "potosi", "sucre", "tarija", "beni", "pando", "chuquisaca", "trinidad", "cobija",
      "yungas", "caranavi", "chapare", "quillacollo", "sacaba", "montero", "yacuiba", "villazon", "uyuni", "riberalta", "camiri", "cuatro canadas", "el sillar")
# ciudades/hechos extranjeros concretos: se descartan aunque aparezca una palabra boliviana (p. ej. «hospitales de La Paz, de Getafe…»)
EXT_FUERTE = ("getafe", "toledo", "madrid", "adamuz", "urda", "barcelona", "valencia", "sevilla", "bogota", "medellin", "lima peru", "buenos aires", "santiago de chile", "sao paulo",
              "rio de janeiro", "ciudad de mexico", "el bronco", "texas", "california", "nueva york", "pensilvania", "florida", "kiev", "gaza", "tel aviv", "teheran",
              "damasco", "siria", "corcega", "galapagos", "montevideo", "brooklyn", "praga", "guinea", "los angeles", "eaton", "salomon", "casa blanca", "trump", "gran sabana", "estado bolivar", "caracas", "maracaibo", "ciudad bolivar")
EXT_PAIS = ("espana", "mexico", "mexican", "chile", "chileno", "argentin", "peru ", "peruano", "brasil ", "colombia", "venezuela", "ecuador", "paraguay", "uruguay", "estados unidos",
            "ee uu", "china", "india", "japon", "rusia", "ucrania", "italia", "francia", "alemania", "reino unido", "turquia", "iran", "israel", "cuba", "guatemala", "honduras", "nicaragua", "haiti",
            "filipinas", "indonesia", "nepal", "pakistan", "africa", "europa",
            "egipt", "egipci", "belgica", "polonia", "polac", "tanzan", "senegal", "bulgar", "congo", " rdc ", "afganist", "sudan", "etiopia", "nigeria", "kenia", "somalia",
            "libano", "yemen", "irak", "iraq", "arabia saudi", "emiratos", "taiwan", "tailandia", "vietnam", "myanmar", "bangladesh", "sri lanka", "australia", "nueva zelanda",
            "canada ", "portugal", "grecia", "suiza", "austria", "holanda", "paises bajos", "suecia", "noruega", "finlandia", "dinamarca", "irlanda", "escocia",
            "inglaterra", "londres", "paris", "berlin", "moscu", "pekin", "washington", "zaporiyia", "cracovia", "frafurt", "francfort", "frankfurt", "marruecos", "argelia",
            "tunez", "libia", "mozambique", "angola", "zimbabue", "uganda", "camerun", "ghana", "costa rica", "panama", "dominicana", "puerto rico", "el salvador", "jamaica")
NO_EVENTO = re.compile(r" (dia de los muertos|dia del|dia de la|horoscopo|receta|concierto de|sindicad|imputad|acusad|homicidio culposo|aprehension|aprehendid|operativo policial|decomis|"
                       r"desafian la lluvia|vendedores|candidato|elecciones|campana electoral|aniversario|feria|futbol|partido de|resultados de la loteria|"
                       r"viral|viraliza|viralizan|viralizo|tiktok|ojo de la tormenta|interpol|con rabia|brote psicotico|cumbiera|cumbia|jugaran|jugara|plantel|clasico|seleccion|horoscopo) ")

# (categoría, patrón) en orden de prioridad
REGLAS = [
    ("antropogénica", re.compile(r" (choque|choca|chocan|colision|colisiona|colisionar|vuelco|volco|volcadura|volcaron|embarranc\w*|atropell\w*|accidente de transito|accidente en (la )?(carretera|ruta|via|tramo|avenida)|accidente vehicular|accidente de moto|accidente de bus) ")),
    ("climatológica", re.compile(r" (sequia|deficit hidrico|falta de lluvias?|sin lluvias|incendios? forestal|chaqueo|quema de pastiz|focos de calor|afectacion por incendios|incendios? en la chiquitania) ")),
    ("tecnológica", re.compile(r" (derrame|explosion|explota|fuga de gas|fuga de amoniaco|colapso (del|de la|de un|de una)|colapsa|se desploma|desplome) ")),
    ("geológica", re.compile(r" (sismo|temblor|temblo|terremoto|derrumbe|deslizamiento|mazamorra|socavon|volcan|erupcion) ")),
    ("biológica", re.compile(r" (dengue|chikungunya|coxsackie|influenza|sarampion|rabia|tosferina|fiebre amarilla|brote|epidemia|casos de|vacun|gripe|zoonosis|intoxicacion alimentaria|ebola|mpox|difteria|miasis|leptospirosis|malaria|chagas) ")),
]
BIO_TERMINOS = REGLAS[-1][1]


def _rx(*pal):
    return re.compile(r" (" + "|".join(pal) + r") ")


# términos que PROMUEVEN una nota sin clasificar («otra») a un tipo de peligro: palabras completas, sin ambigüedad
PROMO = [
    ("geológica", _rx("sismo", "sismos", "temblor", "temblores", "terremoto", "derrumbe", "derrumbes", "deslizamiento", "deslizamientos", "mazamorra", "mazamorras", "socavon", "hundimiento", "hundimientos", "volcan", "erupcion")),
    ("hidrológica", _rx("inundacion", "inundaciones", "inundado", "inundados", "inundada", "inundadas", "desborde", "desbordes", "desbordo", "crecida", "crecidas", "riada", "riadas", "anegamiento", "anegamientos")),
    ("climatológica", _rx("sequia", "sequias", "deficit hidrico", "incendio forestal", "incendios forestales", "chaqueo", "quemas", "focos de calor", "super nino", "fenomeno de el nino", "fenomeno del nino", "ola de calor")),
    ("meteorológica", _rx("granizada", "granizadas", "nevada", "nevadas", "helada", "heladas", "ventarron", "tormenta electrica", "frente frio", "surazo", "aviso meteorologico")),
    ("biológica", _rx("dengue", "chikungunya", "chikunguna", "coxsackie", "influenza", "sarampion", "tosferina", "fiebre amarilla", "brote de", "brotes de", "epidemia", "zoonosis", "ebola", "mpox", "difteria", "leptospirosis", "malaria", "chagas")),
]
# términos que MANTIENEN un tipo de peligro; si la nota no contiene ninguno (palabra completa), vuelve a «otra»
VALIDA = {
    "geológica": _rx("sismo", "sismos", "sismico", "temblor", "temblores", "temblo", "terremoto", "derrumbe", "derrumbes", "deslizamiento", "deslizamientos", "mazamorra", "socavon", "hundimiento", "hundimientos",
                     "volcan", "erupcion", "desprendimiento", "caida de rocas", "rajaduras", "grietas"),
    "hidrológica": _rx("inundacion", "inundaciones", "inundado", "inundados", "inundada", "inundadas", "desborde", "desbordes", "desbordo", "desbordan", "crecida", "crecidas", "riada", "riadas", "anegamiento",
                       "anegamientos", "anegado", "rio", "rios", "cauce", "aviso hidrologico", "mazamorra", "mazamorras"),
    "meteorológica": _rx("granizada", "granizadas", "granizo", "nevada", "nevadas", "helada", "heladas", "lluvia", "lluvias", "tormenta", "tormentas", "viento", "vientos", "ventarron", "ola de calor", "ola de frio",
                         "frente frio", "surazo", "temperatura", "temperaturas", "precipitacion", "precipitaciones", "aviso meteorologico", "senamhi", "pronostico", "pronostican", "ascenso termico", "calor", "frio",
                         "ciclon", "tornado", "friaje", "senamhi"),
    "climatológica": _rx("sequia", "sequias", "deficit hidrico", "incendio forestal", "incendios forestales", "incendio", "incendios", "chaqueo", "quema", "quemas", "focos de calor", "super nino",
                         "fenomeno de el nino", "fenomeno del nino", "la nina", "ola de calor", "falta de lluvias", "sin lluvias", "clima", "climatico", "chiquitania", "hectareas quemadas", "superficie quemada"),
    "tecnológica": _rx("derrame", "derrames", "explosion", "explosiones", "explota", "explosiona", "explosionan", "explosivo", "explosivos", "fuga", "colapso", "colapsa", "desplome", "se desploma", "intoxicacion", "contaminacion", "gas", "incendio",
                       "incendios", "mina", "minera", "quimico", "combustible", "emanacion"),
}
EL_NINO = re.compile(r" el nino ")
NINO_FENOMENO = re.compile(r" (fenomeno|clima|climatic\w*|sequia|lluvias?|emergencias?|alertas?|calor|enos|extremo|riesgo|familias|prepar\w*|impacto|desastres|nina|incendios?|inundac\w*|afecta\w*|2026|2027|oceano|pacifico|super) ")
NINO_NINO = re.compile(r" (mordido|herido|rescat\w*|desaparec\w*|menor|bebe|asesin\w*|violad\w*|golpead\w*|murio|fallec\w*|perros?|anos) ")


def _valida(c, t):
    rx = VALIDA.get(c)
    if rx is None:
        return True
    if rx.search(t):
        if c == "climatológica" and EL_NINO.search(t) and not re.search(r" (sequia|incendio\w*|chaqueo|quemas?|focos de calor|super nino|fenomeno de el nino|fenomeno del nino|la nina|ola de calor|clima\w*) ", t):
            return bool(NINO_FENOMENO.search(t)) and not NINO_NINO.search(t)
        return True
    # «el niño» como fenómeno climático (no el niño de una persona)
    return c == "climatológica" and bool(EL_NINO.search(t)) and bool(NINO_FENOMENO.search(t)) and not NINO_NINO.search(t)


def revisar(r):
    """r: evento de prensa (dict con titulo, categoria…). Devuelve None si se descarta, o r (posiblemente reclasificado)."""
    t = n(r.get("titulo"))
    if re.match(r"\s*https?://", str(r.get("titulo") or "")):   # un titular que es solo un enlace no dice qué pasó
        return None
    if NO_EVENTO.search(t):
        return None
    if any(" " + k + " " in t or k in t for k in EXT_FUERTE):
        return None
    if any(k in t for k in EXT_PAIS) and not any(" " + k + " " in t for k in BO):
        return None
    cat = r.get("categoria")
    for c, rx in REGLAS:
        if rx.search(t):
            # un corte de ruta por derrumbe sigue siendo geológico; accidentes de tránsito con incendio siguen siendo tránsito (regla 1 ya los toma)
            cat = c
            break
    else:
        if cat == "biológica" and not BIO_TERMINOS.search(t):
            cat = "tecnológica" if re.search(r" (mina|minera|quimic|gas|combustible) ", t) else cat
    # el tipo asignado debe estar respaldado por una palabra completa del titular; si no, vuelve a «otra» (p. ej. «barriada» no es riada, «progresismo» no es sismo)
    try:
        if cat in VALIDA and not _valida(cat, t):
            cat = "otra"
        if cat == "otra":
            for c, rx in PROMO:
                if rx.search(t) and (c != "climatológica" or not EL_NINO.search(t) or _valida(c, t)):
                    cat = c
                    break
    except Exception:   # la validación nunca debe detener al sistema: ante un error se conserva la categoría anterior
        pass
    if cat != r.get("categoria"):
        r["categoria"] = cat
        r["reclasificado"] = True
    _cifras_respaldadas(r)
    return r


_PLURAL_VICT = re.compile(r"\b(fallecidos|muertos|muertes|heridos|lesionados|victimas|decesos)\b")
_SINIESTRO = re.compile(r"\b(choque|colision|vuelco|vuelca|accidente|explosion|incendio|derrumbe|deslizamiento|mazamorra|naufragio|tragedia|atentado|tiroteo|balacera|ataque|masacre)\b")


def _cifras_respaldadas(r):
    """Una cifra de víctimas de 10 o más que el titular no menciona viene de texto ajeno (resúmenes de feeds que mezclan titulares) o de un error de lectura.
    Se conserva solo si el titular habla de víctimas en plural o de un siniestro; una cifra de 100 o más que el titular no respalda nunca se conserva.
    Las cifras que el titular sí respalda y las pequeñas no se tocan. Si algo falla, no se cambia nada."""
    try:
        c = r.get("cifras")
        if not isinstance(c, dict) or r.get("origen") != "prensa":
            return
        import informe_hecho as ih
        tit = str(r.get("titulo") or "")
        ft, ht = ih.cifras(tit)
        t = n(tit)
        plausible = bool(_PLURAL_VICT.search(t) or _SINIESTRO.search(t)) and not re.search(r"\d[.,]\d{3}\b", tit)
        for k, v in (("fallecidos", ft), ("heridos", ht)):
            x = c.get(k) or 0
            if v == 0 and x >= 10 and (x >= 100 or not plausible):
                c[k] = 0
                c["corregida"] = True
            elif v > 0 and x >= 5 * v + 10:   # el titular dice «un conscripto» (1) y la cifra guardada dice 17: manda el titular
                c[k] = v
                c["corregida"] = True
    except Exception:
        pass


TEMAS = (("sequia", r" (sequi|deficit hidrico|falta de lluvia)"), ("granizada", r" granizad|granizo"), ("nevada", r" nevad"), ("viento", r" viento"), ("lluvia", r" lluvi"), ("helada", r" helada"),
         ("desborde", r" desbord|crecida|riada"), ("inundacion", r" inundac|anega"), ("coxsackie", r" coxsackie"), ("dengue", r" dengue"), ("influenza", r" influenza|gripe"),
         ("rabia", r" rabia"), ("sarampion", r" sarampi"), ("derrumbe", r" derrumb|deslizam|mazamorra"), ("sismo", r" sism|temblo|temblor"), ("incendio", r" incendio|chaqueo|quema"))
AREA = ("climatológica", "meteorológica", "hidrológica", "biológica", "geológica")


def tema(titulo):
    t = n(titulo)
    return {k for k, rx in TEMAS if re.search(rx, t)}

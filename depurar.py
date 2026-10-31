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
              "rio de janeiro", "ciudad de mexico", "el bronco", "texas", "california", "nueva york", "pensilvania", "florida", "kiev", "gaza", "tel aviv", "teheran")
EXT_PAIS = ("espana", "mexico", "mexican", "chile", "chileno", "argentin", "peru ", "peruano", "brasil ", "colombia", "venezuela", "ecuador", "paraguay", "uruguay", "estados unidos",
            "ee uu", "china", "india", "japon", "rusia", "ucrania", "italia", "francia", "alemania", "reino unido", "turquia", "iran", "israel", "cuba", "guatemala", "honduras", "nicaragua", "haiti",
            "filipinas", "indonesia", "nepal", "pakistan", "africa", "europa")
NO_EVENTO = re.compile(r" (dia de los muertos|dia del|dia de la|horoscopo|receta|concierto de|sindicad|imputad|acusad|homicidio culposo|aprehension|aprehendid|operativo policial|decomis|"
                       r"desafian la lluvia|vendedores|candidato|elecciones|campana electoral|aniversario|feria|futbol|partido de|resultados de la loteria) ")

# (categoría, patrón) en orden de prioridad
REGLAS = [
    ("antropogénica", re.compile(r" (choque|choca|chocan|colision|colisiona|colisionar|vuelco|volco|volcadura|volcaron|embarranc|atropell|accidente de transito|accidente en (la )?(carretera|ruta|via|tramo|avenida)|accidente vehicular|accidente de moto|accidente de bus) ")),
    ("climatológica", re.compile(r" (sequia|deficit hidrico|falta de lluvias?|sin lluvias|incendios? forestal|chaqueo|quema de pastiz|focos de calor|afectacion por incendios|incendios? en la chiquitania) ")),
    ("tecnológica", re.compile(r" (derrame|explosion|explota|fuga de gas|fuga de amoniaco|colapso (del|de la|de un|de una)|colapsa|se desploma|desplome) ")),
    ("geológica", re.compile(r" (sismo|temblor|temblo|terremoto|derrumbe|deslizamiento|mazamorra|socavon|volcan|erupcion) ")),
    ("biológica", re.compile(r" (dengue|chikungunya|coxsackie|influenza|sarampion|rabia|tosferina|fiebre amarilla|brote|epidemia|casos de|vacun|gripe|zoonosis|intoxicacion alimentaria|ebola|mpox|difteria|miasis|leptospirosis|malaria|chagas) ")),
]
BIO_TERMINOS = REGLAS[-1][1]


def revisar(r):
    """r: evento de prensa (dict con titulo, categoria…). Devuelve None si se descarta, o r (posiblemente reclasificado)."""
    t = n(r.get("titulo"))
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
    if cat != r.get("categoria"):
        r["categoria"] = cat
        r["reclasificado"] = True
    return r


TEMAS = (("sequia", r" (sequi|deficit hidrico|falta de lluvia)"), ("granizada", r" granizad|granizo"), ("nevada", r" nevad"), ("viento", r" viento"), ("lluvia", r" lluvi"), ("helada", r" helada"),
         ("desborde", r" desbord|crecida|riada"), ("inundacion", r" inundac|anega"), ("coxsackie", r" coxsackie"), ("dengue", r" dengue"), ("influenza", r" influenza|gripe"),
         ("rabia", r" rabia"), ("sarampion", r" sarampi"), ("derrumbe", r" derrumb|deslizam|mazamorra"), ("sismo", r" sism|temblo|temblor"), ("incendio", r" incendio|chaqueo|quema"))
AREA = ("climatológica", "meteorológica", "hidrológica", "biológica", "geológica")


def tema(titulo):
    t = n(titulo)
    return {k for k, rx in TEMAS if re.search(rx, t)}

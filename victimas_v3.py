# -*- coding: utf-8 -*-
"""Cifras de víctimas como rango, a partir de titular + cuerpo (v3).
"un fallecido" -> 1 · "dos muertos" -> 2 · "varios heridos" -> mínimo 2, sin máximo · sin cifra -> None.
Entre varias notas del mismo hecho se combinan con combinar(): el rango abarca todas las cifras y marca discrepancia."""
import re, unicodedata

NUM = {"un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
       "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "veinte": 20}
VAGOS = {"varios": 2, "varias": 2, "algunos": 2, "multiples": 2, "numerosos": 3}
MUERTOS = r"(?:muertos?|muertes?|fallecid[oa]s?|fallecimientos?|victimas? mortales?|occisos?)"
HERIDOS = r"(?:heridos?|herid[ao]s?|lesionad[oa]s?|accidentad[oa]s?)"
CANT = r"(\d{1,3}|" + "|".join(NUM) + "|" + "|".join(VAGOS) + r")"


def _n(t):
    return "".join(c for c in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(c) != "Mn")


def _valor(tok):
    return int(tok) if tok.isdigit() else NUM.get(tok, VAGOS.get(tok))


def _buscar(t, patron):
    """Devuelve lista de (minimo, maximo) encontrados."""
    out = []
    for m in re.finditer(r"\b" + CANT + r"\s+(?:personas?\s+|menores?\s+|ocupantes\s+)?" + patron, t):
        v = _valor(m.group(1))
        if v is None or v > 200:
            continue
        out.append((v, None if m.group(1) in VAGOS else v))
    # "deja un muerto", "con un fallecido", "hay un herido" ya quedan cubiertos; "murió una niña" / "pierde la vida" = al menos 1
    return out


def extraer(titulo, cuerpo="", max_cuerpo=2500):
    """Devuelve {'fallecidos': (min,max)|None, 'heridos': (min,max)|None, 'fuente': 'titular'|'cuerpo'|None}.
    El titular manda; el cuerpo solo se usa si el titular no trae la cifra."""
    res = {"fallecidos": None, "heridos": None, "fuente": None}
    for etiqueta, texto in (("titular", _n(titulo or "")), ("cuerpo", _n((cuerpo or "")[:max_cuerpo]))):
        for clave, pat in (("fallecidos", MUERTOS), ("heridos", HERIDOS)):
            if res[clave] is None:
                h = _buscar(texto, pat)
                if h:
                    res[clave] = h[0]
                    res["fuente"] = res["fuente"] or etiqueta
        # verbos sin cifra: "muere/pierde la vida/fallece" = al menos 1 fallecido
        if res["fallecidos"] is None and re.search(r"\b(?:muere|murio|fallece|fallecio|pierde la vida|perdio la vida|perece)\b", texto) and etiqueta == "titular":
            res["fallecidos"] = (1, None)
            res["fuente"] = res["fuente"] or etiqueta
    return res


def combinar(lista):
    """lista de resultados de extraer() de notas del mismo hecho -> {'fallecidos_min','fallecidos_max','heridos_min','heridos_max','discrepancia'}."""
    out = {"discrepancia": False}
    for clave in ("fallecidos", "heridos"):
        vals = [r[clave] for r in lista if r.get(clave)]
        if not vals:
            continue
        minimos = [v[0] for v in vals]
        maximos = [v[1] for v in vals]
        out[clave + "_min"] = min(minimos)
        out[clave + "_max"] = None if any(m is None for m in maximos) else max(maximos)
        if len({v[0] for v in vals if v[1] is not None}) > 1:
            out["discrepancia"] = True
    return out

# -*- coding: utf-8 -*-
"""Ubicación de un hecho a partir del título y del cuerpo de la nota (v3).

Diferencias con la ubicación anterior (elegía el nombre de municipio más largo que apareciera en el titular):
  1. Puntúa cada municipio candidato: el título, el primer párrafo, las repeticiones y la preposición de lugar ("en", "cerca de",
     "municipio de") suman; los destinos y orígenes ("hacia", "rumbo a", "desde", "ruta a") restan.
  2. Respeta el departamento nombrado en el título: un candidato de otro departamento pierde puntos.
  3. El nombre de una capital sin más contexto ("Santa Cruz:", "en La Paz") puede ser el departamento o la ciudad: no se dibuja como
     punto, salvo que el texto diga "ciudad de X" o no haya otro municipio más específico.
  4. Una ruta entre dos lugares ("ruta Oruro - Cochabamba") es un tramo, no un punto.
  5. Devuelve la precisión (municipio, departamento, tramo, ninguna), las razones y las alternativas.
Solo reglas explícitas y revisables; la salida es información de prensa, no verificada.
"""
import json, re, unicodedata

CAPITALES = {  # nombre que usa la prensa -> (municipio del gazetteer, departamento)
    "santa cruz": ("Santa Cruz de la Sierra", "Santa Cruz"),
    "la paz": ("Nuestra Señora de La Paz", "La Paz"),
    "cochabamba": ("Cochabamba", "Cochabamba"),
    "oruro": ("Oruro", "Oruro"),
    "potosi": ("Potosí", "Potosí"),
    "sucre": ("Sucre", "Chuquisaca"),
    "tarija": ("Tarija", "Tarija"),
    "trinidad": ("Trinidad", "Beni"),
    "cobija": ("Cobija", "Pando"),
}
DEPARTAMENTOS = ["Beni", "Chuquisaca", "Cochabamba", "La Paz", "Oruro", "Pando", "Potosí", "Santa Cruz", "Tarija"]
LOCATIVOS = ("en", "cerca de", "municipio de", "localidad de", "poblacion de", "comunidad de", "a la altura de", "ciudad de", "provincia de")
DIRECCIONALES = ("hacia", "rumbo a", "con destino a", "procedente de", "proveniente de", "desde", "ruta a", "carretera a", "camino a", "via a", "dirigia a", "rumbo")
VIAS = ("ruta", "carretera", "camino", "via", "tramo", "autopista")


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t)).strip()


def cargar_geo(ruta):
    from shapely.geometry import shape
    g = json.load(open(ruta, encoding="utf-8"))
    return {k: [dict(u, _p=shape({"type": u["t"], "coordinates": u["g"]}).representative_point()) for u in g[k]] for k in ("dep", "mun")}


_IDX = {}


def _indice(geo):
    k = id(geo)
    if k in _IDX:
        return _IDX[k]
    idx = {}
    for u in geo["mun"]:
        idx.setdefault(norm(u["n"]), {"opciones": [], "capital": False})["opciones"].append({"nombre": u["n"], "dep": u["d"], "lat": u["_p"].y, "lon": u["_p"].x})
    for alias, (mun, dep) in CAPITALES.items():
        for u in geo["mun"]:
            if u["n"] == mun and u["d"] == dep:
                idx[alias] = {"opciones": [{"nombre": mun, "dep": dep, "lat": u["_p"].y, "lon": u["_p"].x}], "capital": True}
    _IDX[k] = idx
    return idx


def _apariciones(t, nombre):
    return [m.start() for m in re.finditer(r"(?<![a-z0-9])" + re.escape(nombre) + r"(?![a-z0-9])", t)]


def _previo(t, pos, n=3):
    return " ".join(t[:pos].split()[-n:])


def _deptos_del_titulo(tn):
    hallados = [d for d in DEPARTAMENTOS if _apariciones(tn, norm(d))]
    for alias, (_, dep) in CAPITALES.items():
        if dep not in hallados and _apariciones(tn, alias):
            hallados.append(dep)
    return hallados


def _extremos_de_ruta(texto_n, nombres):
    """Nombres que son los dos extremos de una ruta: 'ruta Oruro - Cochabamba', 'carretera Santa Cruz a Trinidad'.
    texto_n: texto normalizado donde los guiones ya se cambiaron por ' a '. nombres: nombres de candidatos presentes."""
    out = set()
    vias = "|".join(VIAS)
    for n1 in nombres:
        for n2 in nombres:
            if n1 != n2 and re.search(r"(?:" + vias + r")\s+(?:de\s+|entre\s+)?" + re.escape(n1) + r"\s+(?:a|al|hacia|y)\s+" + re.escape(n2) + r"(?![a-z0-9])", texto_n):
                out.update([n1, n2])
    return out


def ubicar(titulo, cuerpo, geo, max_cuerpo=3500):
    """Devuelve dict: municipio, departamento, lat, lon, precision, puntaje, razones, alternativas, motivo."""
    idx = _indice(geo)
    tn, cn = norm(titulo), norm((cuerpo or "")[:max_cuerpo])
    lead = cn[:400]
    deps_titulo = _deptos_del_titulo(tn)
    # los guiones del texto original separan los extremos de una ruta; norm() los vuelve espacio, por eso se mira el original
    texto_rutas = norm(re.sub(r"\s*[-–—]\s*", " a ", f"{titulo} . {(cuerpo or '')[:max_cuerpo]}"))
    cands = {}
    for nombre, info in idx.items():
        if len(nombre) < 4:
            continue
        en_t, en_c = _apariciones(tn, nombre), _apariciones(cn, nombre)
        if not en_t and not en_c:
            continue
        for op in info["opciones"]:
            c = cands.setdefault((op["nombre"], op["dep"]), {"op": op, "capital": info["capital"], "puntaje": 0.0, "razones": [], "ambiguo": len(info["opciones"]) > 1, "ciudad": False, "nombre_norm": nombre})
            if en_t:
                c["puntaje"] += 4; c["razones"].append("en el título")
            if en_c:
                if any(p < len(lead) for p in en_c):
                    c["puntaje"] += 3; c["razones"].append("en el primer párrafo")
                c["puntaje"] += min(3, len(en_c) - 1)
            for texto, posiciones in ((tn, en_t), (cn, en_c)):
                for p in posiciones:
                    previo = _previo(texto, p)
                    if any(previo.endswith(x) for x in DIRECCIONALES):
                        c["puntaje"] -= 3; c["razones"].append("destino u origen")
                    elif any(previo.endswith(x) for x in LOCATIVOS):
                        c["puntaje"] += 2; c["razones"].append("con preposición de lugar")
                    if previo.endswith("ciudad de"):
                        c["ciudad"] = True
    rutas = _extremos_de_ruta(texto_rutas, {c["nombre_norm"] for c in cands.values()})
    for (_, dep), c in cands.items():
        if deps_titulo:
            if dep not in deps_titulo:
                c["puntaje"] -= 5; c["razones"].append("otro departamento que el del título")
            else:
                c["puntaje"] += 1
        if c["ambiguo"] and not deps_titulo:
            c["puntaje"] -= 3; c["razones"].append("nombre repetido sin departamento")
        if len(c["nombre_norm"]) < 5 and "con preposición de lugar" not in c["razones"]:
            c["puntaje"] -= 4
        if not c["capital"]:
            c["puntaje"] += 1  # un municipio menor es más específico que el "Santa Cruz:" de un titular
        c["extremo_ruta"] = c["nombre_norm"] in rutas
        if c["extremo_ruta"]:
            c["puntaje"] -= 2; c["razones"].append("extremo de una ruta")
    orden = sorted(cands.values(), key=lambda c: -c["puntaje"])
    alt = [{"municipio": c["op"]["nombre"], "departamento": c["op"]["dep"], "puntaje": round(c["puntaje"], 1)} for c in orden[:3]]
    res = {"municipio": None, "departamento": None, "lat": None, "lon": None, "precision": "ninguna", "puntaje": 0, "razones": [], "alternativas": alt, "motivo": "sin candidatos"}
    dep_titulo = deps_titulo[0] if len(deps_titulo) == 1 else None
    if not orden:
        if dep_titulo:
            res.update(departamento=dep_titulo, precision="departamento", motivo="solo el departamento del título")
        return res
    top = orden[0]
    res.update(puntaje=round(top["puntaje"], 1), razones=sorted(set(top["razones"])))
    if top["extremo_ruta"]:
        deps = {c["op"]["dep"] for c in orden if c["extremo_ruta"]}
        res.update(departamento=next(iter(deps)) if len(deps) == 1 else None, precision="tramo", motivo="el nombre es un extremo de una ruta")
        return res
    if top["puntaje"] < 4:
        res.update(departamento=dep_titulo, precision="departamento" if dep_titulo else "ninguna", motivo="puntaje bajo")
        return res
    if len(orden) > 1 and top["puntaje"] - orden[1]["puntaje"] < 2 and orden[1]["op"]["dep"] != top["op"]["dep"]:
        res.update(precision="ninguna", motivo="dos candidatos de distinto departamento casi iguales")
        return res
    if top["capital"] and not top["ciudad"]:
        otros = [c for c in orden[1:] if not c["capital"] and c["puntaje"] >= 4 and not c["extremo_ruta"]]
        if not otros:
            res.update(departamento=top["op"]["dep"], precision="departamento", motivo="nombre de capital sin más contexto (puede ser el departamento)")
            return res
        top = otros[0]
        res.update(puntaje=round(top["puntaje"], 1), razones=sorted(set(top["razones"])))
    res.update(municipio=top["op"]["nombre"], departamento=top["op"]["dep"], lat=round(top["op"]["lat"], 5), lon=round(top["op"]["lon"], 5), precision="municipio", motivo="mejor candidato")
    return res

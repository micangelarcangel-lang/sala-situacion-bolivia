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
LOCATIVOS = ("en", "cerca de", "cerca a", "municipio de", "localidad de", "poblacion de", "comunidad de", "a la altura de", "ciudad de", "provincia de")
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


GENTILICIOS = {"Santa Cruz": r"cruceno\w*", "La Paz": r"pacen[oa]\w*|alteno\w*|alten[oa]\w*", "Cochabamba": r"cochabambin\w*", "Oruro": r"oruren\w*", "Potosí": r"potosin\w*",
               "Chuquisaca": r"chuquisaquen\w*", "Tarija": r"tarijen\w*", "Beni": r"benian\w*", "Pando": r"pandin\w*"}  # ya en forma normalizada (sin tildes, ñ -> n)
REGIONES = {"chaco cruceno": ["Santa Cruz"], "chaco": ["Santa Cruz", "Chuquisaca", "Tarija"], "chiquitania": ["Santa Cruz"], "yungas": ["La Paz"], "chapare": ["Cochabamba"]}


def _enmascarar(tn, idx):
    """'Alto Beni' es un municipio de La Paz: no cuenta como el departamento Beni."""
    if idx:
        for nombre, info in idx.items():
            if " " in nombre and any(norm(d) in nombre and nombre != norm(d) and info["opciones"][0]["dep"] != d for d in DEPARTAMENTOS) and _apariciones(tn, nombre):
                tn = re.sub(r"(?<![a-z0-9])" + re.escape(nombre) + r"(?![a-z0-9])", " ", tn)
    return tn


def _deptos_del_texto(t, idx=None):
    """Departamentos nombrados en un texto normalizado: por nombre, gentilicio ('el departamento cruceño') o región ('Chaco cruceño')."""
    t = _enmascarar(t, idx)
    out = []
    for d in DEPARTAMENTOS:
        if _apariciones(t, norm(d)) or re.search(r"(?<![a-z0-9])(?:" + GENTILICIOS[d] + r")(?![a-z0-9])", t):
            out.append(d)
    for reg, deps in REGIONES.items():
        if _apariciones(t, reg):
            out += [d for d in deps[:1] if d not in out]
    return out


def _deptos_del_titulo(tn, idx=None):
    if idx:  # "Alto Beni" es un municipio de La Paz: no cuenta como el departamento Beni
        for nombre, info in idx.items():
            if " " in nombre and any(norm(d) in nombre and nombre != norm(d) and info["opciones"][0]["dep"] != d for d in DEPARTAMENTOS) and _apariciones(tn, nombre):
                tn = re.sub(r"(?<![a-z0-9])" + re.escape(nombre) + r"(?![a-z0-9])", " ", tn)
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
            if n1 != n2 and (re.search(r"(?:" + vias + r")\s+(?:de\s+|entre\s+)?" + re.escape(n1) + r"\s+(?:a|al|hacia|y)\s+" + re.escape(n2) + r"(?![a-z0-9])", texto_n)
                             or re.search(r"(?:" + vias + r")\s+(?:\w+\s+){0,2}entre\s+" + re.escape(n1) + r"\s+y\s+" + re.escape(n2) + r"(?![a-z0-9])", texto_n)):
                out.update([n1, n2])
    return out


AMBIGUAS_CAPITAL = ("la paz", "nuestra senora de la paz", "santa cruz", "santa cruz de la sierra")


def _ubicar_base(titulo, cuerpo, geo, max_cuerpo=3500, puntual=False):
    """Núcleo: puntúa municipios candidatos. Devuelve dict: municipio, departamento, lat, lon, precision, puntaje, razones, alternativas, motivo."""
    idx = _indice(geo)
    tn, cn = norm(titulo), norm((cuerpo or "")[:max_cuerpo])
    lead = cn[:400]
    deps_titulo = _deptos_del_titulo(tn, idx)
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
                    if re.search(r"(kilometros|km|metros|minutos|horas) de (?:la |el )?(?:ciudad de)?$", texto[max(0, p - 50):p].rstrip()):
                        c["puntaje"] -= 3; c["razones"].append("distancia de referencia"); continue  # 'a 35 km de la ciudad de La Paz': referencia, no el lugar del hecho
                    if any(previo.endswith(x) for x in DIRECCIONALES):
                        c["puntaje"] -= 3; c["razones"].append("destino u origen")
                    elif any(previo.endswith(x) for x in LOCATIVOS):
                        c["puntaje"] += 2; c["razones"].append("con preposición de lugar")
                        if previo.endswith(("cerca de", "cerca a")):
                            c["cerca"] = True
                    if previo.endswith("ciudad de"):
                        c["ciudad"] = True
                    # un lugar dentro de la ciudad antes del nombre ("urbanización Milenium, Oruro"), o un hecho puntual con "en <capital>": es la ciudad, no el departamento
                    if c["capital"] and (re.search(r"\b(urbanizacion|avenida|calle|zona|barrio|plaza|mercado|rotonda|puente|terminal|distrito|av)\W+(?:\w+\W+){0,4}$", texto[max(0, p - 60):p]) or (puntual and c["nombre_norm"] not in AMBIGUAS_CAPITAL and (previo.endswith(" en") or previo == "en"))):
                        c["ciudad"] = True
                    if previo.endswith(("departamento de", "departamento", "yungas de", "provincia de")):
                        c["depto_explicito"] = True
                    if texto is tn and any(previo.endswith(x) for x in LOCATIVOS):
                        c["loc_titulo"] = True
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
        c["extremo_ruta"] = c["nombre_norm"] in rutas and not c.get("cerca")  # "cerca a Poopó" es un punto aunque Poopó sea extremo de la ruta
        if c["extremo_ruta"]:
            c["puntaje"] -= 2; c["razones"].append("extremo de una ruta")
    # varios municipios afectados ("siete municipios de Cochabamba", "casi 40 municipios"): el hecho es regional, no un punto
    multiples = bool(re.search(r"\b(?:\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|varios|decenas de|numerosos)\s+municipios\b", tn + " " + lead))
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
    if multiples:
        deps_c = {c["op"]["dep"] for c in orden if c["puntaje"] >= 4}
        dep = dep_titulo or (next(iter(deps_c)) if len(deps_c) == 1 else None)
        res.update(departamento=dep, precision="departamento" if dep else "ninguna", motivo="afecta a varios municipios: hecho regional")
        return res
    en_titulo = [c for c in orden if "en el título" in c["razones"] and not c["capital"] and c["puntaje"] >= 5 and not c["extremo_ruta"]]
    if len(en_titulo) >= 2 and len({c["op"]["dep"] for c in en_titulo}) == 1:
        res.update(departamento=en_titulo[0]["op"]["dep"], precision="varios", lugares=[c["op"]["nombre"] for c in en_titulo], motivo="el titular nombra varios municipios del mismo departamento")
        return res
    if top["extremo_ruta"]:
        deps = {c["op"]["dep"] for c in orden if c["extremo_ruta"]}
        ext = sorted((c for c in orden if c["extremo_ruta"]), key=lambda c: texto_rutas.find(c["nombre_norm"]))
        res.update(departamento=next(iter(deps)) if len(deps) == 1 else None, precision="tramo", motivo="el nombre es un extremo de una ruta",
                   tramo=" – ".join(dict.fromkeys(c["op"]["nombre"] for c in ext)), departamentos=sorted(deps))
        return res
    if top["puntaje"] < 4:
        res.update(departamento=dep_titulo, precision="departamento" if dep_titulo else "ninguna", motivo="puntaje bajo")
        return res
    if len(orden) > 1 and top["puntaje"] - orden[1]["puntaje"] < 2 and orden[1]["op"]["dep"] != top["op"]["dep"]:
        res.update(precision="ninguna", motivo="dos candidatos de distinto departamento casi iguales")
        return res
    if top["capital"] and not top.get("loc_titulo"):
        esp = [c for c in orden[1:] if not c["capital"] and c.get("loc_titulo") and c["puntaje"] >= 6 and not c["extremo_ruta"] and c["op"]["dep"] == top["op"]["dep"]]
        if esp:
            top = esp[0]
            res.update(puntaje=round(top["puntaje"], 1), razones=sorted(set(top["razones"])), motivo="municipio específico del titular frente al nombre de la capital")
            res.update(municipio=top["op"]["nombre"], departamento=top["op"]["dep"], lat=round(top["op"]["lat"], 5), lon=round(top["op"]["lon"], 5), precision="municipio")
            return res
    if top["capital"] and top.get("depto_explicito") and not re.search(r"\bciudad de " + re.escape(top["nombre_norm"]), cn + " " + tn):
        top["ciudad"] = False
    if top["capital"] and not top["ciudad"]:
        otros = [c for c in orden[1:] if not c["capital"] and c["puntaje"] >= 4 and not c["extremo_ruta"]]
        if not otros:
            res.update(departamento=top["op"]["dep"], precision="departamento", motivo="nombre de capital sin más contexto (puede ser el departamento)")
            return res
        top = otros[0]
        res.update(puntaje=round(top["puntaje"], 1), razones=sorted(set(top["razones"])))
    res.update(municipio=top["op"]["nombre"], departamento=top["op"]["dep"], lat=round(top["op"]["lat"], 5), lon=round(top["op"]["lon"], 5), precision="municipio", motivo="mejor candidato")
    return res


def crear_localizador(ruta):
    """Devuelve f(lat, lon) -> (municipio, departamento) o None, usando los polígonos municipales de geo.json."""
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree
    g = json.load(open(ruta, encoding="utf-8"))["mun"]
    formas = [shape({"type": u["t"], "coordinates": u["g"]}) for u in g]
    arbol = STRtree(formas)

    def f(lat, lon):
        p = Point(lon, lat)
        for i in arbol.query(p):
            if formas[int(i)].contains(p):
                return g[int(i)]["n"], g[int(i)]["d"]
        return None
    return f


NACIONAL = re.compile(r"\b(?:\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\s+departamentos\b|a nivel nacional|todo el pais|en todo el territorio|en todo el pais|todo el territorio nacional|emergencia nacional")


DATELINE = re.compile(r"^\s*(?:Por:\s*\w+\s*)?[A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,25},\s*Bolivia;[^.]{0,30}\.-?\s*")


def ubicar(titulo, cuerpo, geo, max_cuerpo=3500, puntual=False):
    """Ubicación completa: núcleo por puntaje + departamentos mencionados (nombre, gentilicio, región), tramos con extremos, varios lugares y alcance nacional.
    puntual=True para hechos de un lugar concreto (choque, incendio de un inmueble, colapso): 'en Oruro' se toma como la ciudad y no como el departamento."""
    cuerpo = DATELINE.sub("", cuerpo or "", count=1)  # 'La Paz, Bolivia; 5 de septiembre.-' es donde se redacta la nota, no donde ocurrió
    r = _ubicar_base(titulo, cuerpo, geo, max_cuerpo, puntual)
    tn, cn = norm(titulo), norm((cuerpo or "")[:max_cuerpo])
    texto = tn + " . " + cn[:600]
    idx = _indice(geo)
    deps = _deptos_del_texto(tn, idx) or _deptos_del_texto(cn[:600], idx)
    if (NACIONAL.search(tn) and r["precision"] != "tramo") or (NACIONAL.search(tn + " " + cn[:400]) and r["precision"] in ("ninguna", "departamento")):
        r.update(precision="nacional", motivo="alcance nacional según el texto", departamentos=deps, municipio=None, departamento=None, lat=None, lon=None)
        return r
    if r["precision"] in ("ninguna", "departamento") and deps:
        if len(deps) == 1:
            r.update(departamento=deps[0], precision="departamento", motivo=(r["motivo"] + "; departamento por el texto").strip("; "), departamentos=deps)
        else:
            r.update(departamento=None, precision="departamento", motivo="varios departamentos en el texto", departamentos=deps)
    if "departamentos" not in r and r.get("departamento"):
        r["departamentos"] = [r["departamento"]]
    return r

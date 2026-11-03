# -*- coding: utf-8 -*-
"""Lugares conocidos (barrios, zonas, cárceles, hospitales, universidades) para ubicar hechos que no nombran un municipio (v3).
Fuente: OpenStreetMap (Overpass) + nombres de servicios ya descargados. Regla de uso: el nombre debe aparecer en el titular o en el primer párrafo,
tener >= 6 letras, no ser un nombre de municipio y ser único en el país o coincidir con el departamento ya identificado."""
import json, os, re, time, urllib.parse, urllib.request, unicodedata, collections

FILTROS = {"prision": '["amenity"="prison"]', "barrio": '["place"~"^(suburb|neighbourhood|quarter)$"]', "universidad": '["amenity"="university"]'}
SERVIDORES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
GENERICOS = {"centro", "norte", "sur", "este", "oeste", "villa", "zona central", "plaza", "mercado", "hospital", "clinica", "policia", "estacion", "terminal", "colegio", "escuela", "iglesia"}


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t)).strip()


def bajar(ruta):
    out, errores = [], {}
    for tipo, f in FILTROS.items():
        q = f'[out:json][timeout:120];area["ISO3166-1"="BO"]->.b;(nwr{f}["name"](area.b););out center tags;'
        datos = None
        for srv in SERVIDORES:
            for n in range(3):
                try:
                    req = urllib.request.Request(srv, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "sala-situacion-bolivia/3"})
                    datos = json.load(urllib.request.urlopen(req, timeout=150)); break
                except Exception as e:
                    errores[f"{tipo}@{srv}"] = type(e).__name__ + ": " + str(e)[:80]; time.sleep(8 * (n + 1))
            if datos:
                break
        for el in (datos or {}).get("elements", []):
            c = el.get("center") or el
            if "lat" in c and el.get("tags", {}).get("name"):
                out.append({"nombre": el["tags"]["name"], "tipo": tipo, "lat": c["lat"], "lon": c["lon"]})
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    json.dump({"generado": int(time.time() * 1000), "errores": errores, "lugares": out}, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
    return out, errores


def indexar(lugares, servicios=(), nombres_municipios=()):
    """nombre normalizado -> lista de puntos. Excluye genéricos, nombres cortos y nombres de municipios."""
    excl = {norm(n) for n in nombres_municipios} | GENERICOS
    idx = collections.defaultdict(list)
    for l in list(lugares) + [s for s in servicios if s["tipo"] == "salud" and not s["nombre"].startswith("(sin")]:
        n = norm(l["nombre"])
        if len(n) >= 6 and n not in excl and not re.match(r"^(hospital|centro de salud|clinica|policlinico|puesto de salud)$", n):
            idx[n].append({"nombre": l["nombre"], "lat": l["lat"], "lon": l["lon"], "tipo": l["tipo"]})
    return idx


def buscar(titulo, cuerpo, idx, geo_fn=None, departamento=None, max_cuerpo=500):
    """Devuelve el lugar encontrado {nombre, lat, lon, tipo, departamento?} o None. geo_fn(lat, lon) -> (municipio, departamento) para validar el departamento."""
    t = norm(titulo) + " . " + norm((cuerpo or "")[:max_cuerpo])
    mejores = []
    for n, puntos in idx.items():
        if not re.search(r"(?<![a-z0-9])" + re.escape(n) + r"(?![a-z0-9])", t):
            continue
        cand = puntos
        if geo_fn:
            conf = [(p, geo_fn(p["lat"], p["lon"])) for p in puntos]
            if departamento:
                cand = [p for p, g in conf if g and g[1] == departamento] or (puntos if len(puntos) == 1 and not departamento else [])
            elif len(puntos) > 1 and len({g[1] for _, g in conf if g}) > 1:
                continue  # el mismo nombre en varios departamentos y sin pista: no se adivina
        elif len(puntos) > 1:
            continue
        if cand:
            mejores.append((len(n), cand[0]))
    if not mejores:
        return None
    mejores.sort(key=lambda x: -x[0])
    p = dict(mejores[0][1])
    if geo_fn:
        g = geo_fn(p["lat"], p["lon"])
        if g:
            p["municipio"], p["departamento"] = g
    return p

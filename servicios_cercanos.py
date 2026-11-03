# -*- coding: utf-8 -*-
"""Servicios cercanos a un evento (v3): hospitales/centros de salud, policía y bomberos, desde OpenStreetMap (Overpass).
 bajar(ruta)           -> descarga los servicios de Bolivia a un JSON (se corre en Actions, una vez al día o a la semana)
 cercanos(lat, lon, servicios, tipos, k, max_km) -> los k más cercanos por tipo, con distancia en línea recta (no ruta)
 cargar_directorio(csv) -> suma el directorio de salud propio (columnas: nombre,tipo,lat,lon,telefono,nivel); manda sobre OSM si coincide
Límite: OSM en Bolivia está incompleto; la distancia es en línea recta y no dice si el servicio está abierto."""
import csv, json, math, os, time, urllib.parse, urllib.request

CONSULTAS = {
    "salud": '["amenity"~"^(hospital|clinic|doctors)$"]',
    "policia": '["amenity"="police"]',
    "bomberos": '["amenity"="fire_station"]',
    "bomberos2": '["emergency"="fire_station"]',  # algunas estaciones están etiquetadas así
}
SERVIDORES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def _consulta(filtro):
    return f'[out:json][timeout:120];area["ISO3166-1"="BO"]->.b;(nwr{filtro}(area.b););out center tags;'


def bajar(ruta, reintentos=3):
    out, errores = [], {}
    for tipo, filtro in CONSULTAS.items():
        datos = None
        for srv in SERVIDORES:
            for n in range(reintentos):
                try:
                    req = urllib.request.Request(srv, data=urllib.parse.urlencode({"data": _consulta(filtro)}).encode(), headers={"User-Agent": "sala-situacion-bolivia/3"})
                    datos = json.load(urllib.request.urlopen(req, timeout=150))
                    break
                except Exception as e:
                    errores[f"{tipo}@{srv}"] = type(e).__name__ + ": " + str(e)[:80]
                    time.sleep(8 * (n + 1))
            if datos:
                break
        for el in (datos or {}).get("elements", []):
            c = el.get("center") or el
            if "lat" not in c:
                continue
            t = el.get("tags", {})
            out.append({"nombre": t.get("name") or t.get("name:es") or "(sin nombre en OSM)", "tipo": tipo.rstrip("2"), "lat": c["lat"], "lon": c["lon"],
                        "telefono": t.get("phone") or t.get("contact:phone") or "", "fuente": "OpenStreetMap", "osm": f"{el['type']}/{el['id']}"})
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    json.dump({"generado": int(time.time() * 1000), "n": len(out), "errores": errores, "servicios": out}, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
    return out, errores


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def cargar_directorio(ruta_csv):
    if not os.path.exists(ruta_csv):
        return []
    out = []
    for r in csv.DictReader(open(ruta_csv, encoding="utf-8")):
        try:
            out.append({"nombre": r["nombre"], "tipo": r.get("tipo") or "salud", "lat": float(r["lat"]), "lon": float(r["lon"]), "telefono": r.get("telefono", ""), "nivel": r.get("nivel", ""), "fuente": "Directorio propio"})
        except (KeyError, ValueError):
            continue
    return out


def cercanos(lat, lon, servicios, tipos=("salud", "policia", "bomberos"), k=3, max_km=50):
    """Si el directorio propio y OSM traen el mismo lugar (a <150 m y mismo tipo), queda el propio."""
    res = {}
    for t in tipos:
        c = sorted(({**s, "km": round(km(lat, lon, s["lat"], s["lon"]), 1)} for s in servicios if s["tipo"] == t), key=lambda s: s["km"])
        vistos, lista = [], []
        for s in c:
            if s["km"] > max_km:
                break
            if any(km(s["lat"], s["lon"], v["lat"], v["lon"]) < 0.15 for v in vistos):
                continue
            vistos.append(s); lista.append(s)
            if len(lista) == k:
                break
        res[t] = lista
    return res

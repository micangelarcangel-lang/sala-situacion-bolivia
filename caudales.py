# -*- coding: utf-8 -*-
"""Caudales de ríos estimados por el modelo GloFAS (Copernicus Emergency Management Service) vía Open-Meteo Flood API (libre, sin clave).
Compara el pronóstico de 30 días con la climatología 1993-2022 de la misma época (percentiles 50 y 90) en 9 puntos de ríos principales.
ES UN INDICADOR DE MODELO (celda de ~5 km más cercana al río), NO una alerta oficial: las alertas hidrológicas oficiales son las del SENAMHI.
Salida: docs/caudales.json; climatología en docs/caudales_clim.json (se calcula una sola vez)."""
import os, json, time, datetime as dt, urllib.request, urllib.parse, urllib.error

UA = "sala-situacion-bolivia"
URL = "https://flood-api.open-meteo.com/v1/flood"
PUNTOS = [
    ("Rurrenabaque", "Río Beni", -14.44, -67.53, "La Paz"), ("Puerto Villarroel", "Río Ichilo–Mamoré", -16.85, -64.78, "Cochabamba"),
    ("Trinidad", "Río Mamoré", -14.83, -64.90, "Beni"), ("Guayaramerín", "Río Mamoré", -10.82, -65.35, "Beni"), ("Riberalta", "Río Beni", -10.99, -66.10, "Beni"),
    ("Cobija", "Río Acre", -11.03, -68.77, "Pando"), ("Villamontes", "Río Pilcomayo", -21.26, -63.47, "Tarija"), ("Abapó", "Río Grande", -18.90, -63.40, "Santa Cruz"),
    ("San Borja", "Río Maniqui", -14.82, -66.85, "Beni")]


def _get(url, n=2, espera=5, timeout=45):
    err = ""
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                raise RuntimeError("429 límite de consultas de Open-Meteo (se reintenta en el próximo ciclo)")
            err = "HTTP %s" % e.code
        except Exception as e:
            err = type(e).__name__ + " " + str(e)[:80]
        time.sleep(espera * (i + 1))
    raise RuntimeError(err)


def _pct(vals, p):
    v = sorted(x for x in vals if x is not None)
    if not v:
        return None
    k = (len(v) - 1) * p / 100.0
    a = int(k); b = min(a + 1, len(v) - 1)
    return v[a] + (v[b] - v[a]) * (k - a)


def climatologia(fechas, q):
    """Por día del año (1..366): P50 y P90 con ventana de ±7 días. fechas ISO, q caudales."""
    por = {}
    for f, v in zip(fechas, q):
        if v is None:
            continue
        d = dt.date.fromisoformat(f).timetuple().tm_yday
        por.setdefault(d, []).append(v)
    p50, p90 = {}, {}
    for d in range(1, 367):
        w = []
        for k in range(-7, 8):
            w += por.get(((d - 1 + k) % 366) + 1, [])
        p50[d] = _pct(w, 50); p90[d] = _pct(w, 90)
    return {"p50": [p50[d] for d in range(1, 367)], "p90": [p90[d] for d in range(1, 367)]}


def evaluar(fechas, q, clim):
    """Devuelve la serie con P50/P90 de la misma fecha y el indicador."""
    p50, p90, ratio = [], [], []
    for f, v in zip(fechas, q):
        d = dt.date.fromisoformat(f).timetuple().tm_yday
        a, b = clim["p50"][d - 1], clim["p90"][d - 1]
        p50.append(a); p90.append(b)
        ratio.append(None if v is None or not b else round(v / b, 2))
    return p50, p90, ratio


def estado(ratio_max, caudal_max, p50_med):
    if ratio_max is None:
        return "sin dato", 0
    if ratio_max >= 1.5:
        return "Caudal muy por encima de lo normal (>150 % del P90)", 3
    if ratio_max >= 1.0:
        return "Caudal por encima de lo normal (>P90)", 2
    if p50_med and caudal_max is not None and caudal_max > p50_med * 1.2:
        return "Caudal algo sobre la mediana", 1
    return "Dentro de lo normal", 0


def actualizar(docs, forzar=False):
    ruta_c = os.path.join(docs, "caudales_clim.json")
    clim = json.load(open(ruta_c, encoding="utf-8")) if os.path.exists(ruta_c) else {}
    if "_celdas" not in clim:
        clim = {}                                      # climatología antigua (otra celda): se recalcula
    cambio = False
    limite = time.time() + 150
    celdas = clim.get("_celdas", {})
    for nom, rio, lat, lon, dep in PUNTOS:           # la celda de ~5 km más cercana puede no caer sobre el cauce: se elige la de mayor caudal en un entorno de ±0,1°
        if nom in celdas or time.time() > limite:
            continue
        offs = [(a * 0.05, b * 0.05) for a in range(-2, 3) for b in range(-2, 3)]
        q = urllib.parse.urlencode({"latitude": ",".join(str(round(lat + a, 3)) for a, b in offs), "longitude": ",".join(str(round(lon + b, 3)) for a, b in offs), "daily": "river_discharge", "forecast_days": 7})
        try:
            j = _get(URL + "?" + q)
            j = j if isinstance(j, list) else [j]
            med = [sum(x for x in (r["daily"]["river_discharge"] or []) if x is not None) for r in j]
            k = max(range(len(med)), key=lambda i: med[i])
            celdas[nom] = [round(lat + offs[k][0], 3), round(lon + offs[k][1], 3)]
        except Exception:
            celdas[nom] = [lat, lon]
        clim["_celdas"] = celdas
        json.dump(clim, open(ruta_c, "w", encoding="utf-8"), separators=(",", ":"))
        time.sleep(1.5)
    for nom, rio, lat, lon, dep in PUNTOS:
        if nom in clim:
            continue
        if time.time() > limite:
            break
        lat, lon = celdas.get(nom, [lat, lon])
        q = urllib.parse.urlencode({"latitude": lat, "longitude": lon, "daily": "river_discharge", "start_date": "1993-01-01", "end_date": "2022-12-31"})
        j = _get(URL + "?" + q)
        clim[nom] = climatologia(j["daily"]["time"], j["daily"]["river_discharge"])
        json.dump(clim, open(ruta_c, "w", encoding="utf-8"), separators=(",", ":"))
        time.sleep(2)
    if any(p[0] not in clim or p[0] not in celdas for p in PUNTOS):
        return f"parcial: climatología {len(clim)}/{len(PUNTOS)} puntos; continúa en el próximo ciclo"
    limite = time.time() + 120
    out, altos = [], []
    for nom, rio, lat, lon, dep in PUNTOS:
        lat_o, lon_o = lat, lon
        lat, lon = celdas.get(nom, [lat, lon])
        q = urllib.parse.urlencode({"latitude": lat, "longitude": lon, "daily": "river_discharge", "past_days": 14, "forecast_days": 30})
        lat, lon = lat_o, lon_o
        if time.time() > limite:
            out.append({"nombre": nom, "rio": rio, "departamento": dep, "lat": lat, "lon": lon, "error": "tiempo agotado", "nivel": 0, "estado": "sin dato"})
            continue
        try:
            j = _get(URL + "?" + q)
        except Exception as e:
            out.append({"nombre": nom, "rio": rio, "departamento": dep, "lat": lat, "lon": lon, "error": str(e)[:80], "nivel": 0, "estado": "sin dato"})
            continue
        f, v = j["daily"]["time"], j["daily"]["river_discharge"]
        p50, p90, ratio = evaluar(f, v, clim[nom])
        hoy = dt.date.today().isoformat()
        prox = [(a, b, c) for ff, a, b, c in zip(f, v, p50, ratio) if ff >= hoy][:10]
        rmax = max([c for _, _, c in prox if c is not None], default=None)
        cmax = max([a for a, _, _ in prox if a is not None], default=None)
        med = sorted([b for _, b, _ in prox if b is not None])
        est, niv = estado(rmax, cmax, med[len(med) // 2] if med else None)
        if not (p50 and any(x for x in p50 if x and x > 5)):
            est, niv = "Punto sin río representado en el modelo", 0
        out.append({"nombre": nom, "rio": rio, "departamento": dep, "lat": lat, "lon": lon, "fechas": f, "caudal_m3s": [None if x is None else round(x, 1) for x in v],
                    "p50": [None if x is None else round(x, 1) for x in p50], "p90": [None if x is None else round(x, 1) for x in p90], "ratio_p90_max_10d": rmax,
                    "caudal_max_10d": None if cmax is None else round(cmax, 1), "estado": est, "nivel": niv, "hoy": hoy})
        if niv >= 2:
            altos.append(nom)
        time.sleep(1.5)
    json.dump({"actualizado": dt.datetime.utcnow().isoformat() + "Z", "fuente": "GloFAS (Copernicus EMS) vía Open-Meteo Flood API", "climatologia": "1993-2022",
               "nota": "Indicador de modelo, no alerta oficial. Las alertas hidrológicas oficiales son las del SENAMHI.", "puntos": out},
              open(os.path.join(docs, "caudales.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return f"{len(out)} puntos; con caudal sobre P90: {', '.join(altos) or 'ninguno'}"

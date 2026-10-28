# -*- coding: utf-8 -*-
"""Focos de calor DETECTADOS por satélite (NASA FIRMS, VIIRS NOAA-21, casi tiempo real; el S-NPP deja de entregarse el 2-nov-2026) para Bolivia.
Requiere una clave gratuita en el secreto FIRMS_KEY (https://firms.modaps.eosdis.nasa.gov/api/map_key/). Sin clave se omite sin error.
OJO: un foco de calor es una detección térmica del satélite; incluye quemas agrícolas/chaqueo y no equivale a un incendio confirmado.
Salida: docs/focos_detectados.json (conteos por día, departamento y municipio) y docs/datos/focos_detectados_diario.csv"""
import re, os, csv, io, ssl, json, time, datetime, urllib.request

UA = "sala-situacion-bolivia"
FUENTE = "VIIRS_NOAA21_NRT"


def _get(u, n=2, t=75):
    err = ""
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=t, context=ssl.create_default_context()) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:60]
            time.sleep(5)
    raise RuntimeError(err)


def clasificar(filas, geo, puntos=None):
    from shapely.geometry import Point
    from shapely.prepared import prep
    deps = [(u["n"], prep(u["_s"])) for u in geo["dep"]]
    muns = {}
    for u in geo["mun"]:
        muns.setdefault(u["d"], []).append((u["n"], prep(u["_s"])))
    cuenta, cuenta_m, sin = {}, {}, 0
    for f in filas:
        try:
            lon, lat = float(f["longitude"]), float(f["latitude"])
        except Exception:
            continue
        p = Point(lon, lat)
        d = next((n for n, g in deps if g.intersects(p)), None)
        if not d:
            sin += 1
            continue
        dia = f["acq_date"]
        cuenta.setdefault(dia, {}).setdefault(d, 0)
        cuenta[dia][d] += 1
        m = next((n for n, g in muns.get(d, []) if g.intersects(p)), None)
        if m:
            cuenta_m.setdefault(dia, {}).setdefault(f"{m} ({d})", 0)
            cuenta_m[dia][f"{m} ({d})"] += 1
        if puntos is not None:
            try:
                frp = float(f.get("frp") or 0)
            except Exception:
                frp = 0.0
            puntos.append([round(lat, 3), round(lon, 3), round(frp, 1), dia, d, m or ""])
    return cuenta, cuenta_m, sin


def complejos(puntos, dia_ref, ventana_dias=10, minimo=8, celda=0.1):
    """Agrupa detecciones cercanas (celdas de 0,1° ≈ 11 km, vecindad de 8 celdas) en «complejos de focos».
    Usa las detecciones del día de referencia y del día anterior (una pasada de satélite no cubre todo el país en un día)."""
    import datetime as _dt
    ref = _dt.date.fromisoformat(dia_ref)
    dias = {(ref - _dt.timedelta(days=k)).isoformat() for k in range(0, 2)}
    celdas = {}
    for lat, lon, frp, dia, dep, mun in puntos:
        if dia not in dias:
            continue
        k = (int(lat // celda), int(lon // celda))
        c = celdas.setdefault(k, {"n": 0, "frp": 0.0, "lat": 0.0, "lon": 0.0, "pts": []})
        c["n"] += 1; c["frp"] += frp; c["lat"] += lat * max(frp, 1); c["lon"] += lon * max(frp, 1); c["pts"].append((lat, lon, frp, dep, mun))
    celdas = {k: v for k, v in celdas.items() if v['n'] >= 3}  # solo celdas densas: evita unir detecciones sueltas
    visto, out = set(), []
    for k in list(celdas):
        if k in visto:
            continue
        comp, pila = [], [k]
        visto.add(k)
        while pila:
            a = pila.pop(); comp.append(a)
            for da in (-1, 0, 1):
                for db in (-1, 0, 1):
                    b = (a[0] + da, a[1] + db)
                    if b in celdas and b not in visto:
                        visto.add(b); pila.append(b)
        pts = [p for c in comp for p in celdas[c]["pts"]]
        if len(pts) < minimo:
            continue
        w = sum(max(p[2], 1) for p in pts)
        clat = sum(p[0] * max(p[2], 1) for p in pts) / w
        clon = sum(p[1] * max(p[2], 1) for p in pts) / w
        deps, muns = {}, {}
        for p in pts:
            deps[p[3]] = deps.get(p[3], 0) + 1
            if p[4]:
                muns[p[4]] = muns.get(p[4], 0) + 1
        dep = max(deps, key=deps.get)
        out.append({"n": len(pts), "frp_mw": round(sum(p[2] for p in pts), 1), "lat": round(clat, 3), "lon": round(clon, 3), "departamento": dep,
                    "municipio": max(muns, key=muns.get) if muns else "", "municipios": sorted(muns, key=lambda m: -muns[m])[:4],
                    "bbox": [round(min(p[1] for p in pts), 3), round(min(p[0] for p in pts), 3), round(max(p[1] for p in pts), 3), round(max(p[0] for p in pts), 3)]})
    out.sort(key=lambda c: -c["frp_mw"])
    for i, c in enumerate(out[:25], 1):
        c["id"] = f"{dia_ref}:{i}"
    return out[:25]


def actualizar(docs, geo, avisar=None, hora_local=None):
    key = os.environ.get("FIRMS_KEY", "").strip()
    if not key:
        return "sin clave FIRMS_KEY (se omite)"
    try:
        txt = _get(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{FUENTE}/-69.7,-22.95,-57.4,-9.6/10")
    except Exception:
        txt = _get(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{FUENTE}/-69.7,-22.95,-57.4,-9.6/3")   # respaldo: 3 días
    if txt.lstrip().lower().startswith(("invalid", "<")) or "latitude" not in txt.split("\n", 1)[0]:
        raise RuntimeError("respuesta inesperada de FIRMS: " + txt[:80].replace(key, "[clave]"))
    filas = list(csv.DictReader(io.StringIO(txt)))
    # una detección puede repetirse: se deduplica
    vistos, uniq = set(), []
    for f in filas:
        k = (f["latitude"], f["longitude"], f["acq_date"], f["acq_time"])
        if k not in vistos:
            vistos.add(k); uniq.append(f)
    puntos = []
    cuenta, cuenta_m, sin = clasificar(uniq, geo, puntos)
    ruta = os.path.join(docs, "focos_detectados.json")
    est = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {"dias": {}, "municipios": {}}
    for dia, v in cuenta.items():
        est["dias"][dia] = v
        est["municipios"][dia] = dict(sorted(cuenta_m.get(dia, {}).items(), key=lambda x: -x[1])[:15])
    for k in sorted(est["dias"])[:-45]:
        est["dias"].pop(k, None); est["municipios"].pop(k, None)
    est.update({"actualizado": datetime.datetime.utcnow().isoformat() + "Z", "fuente": "NASA FIRMS " + FUENTE,
                "aclaracion": "Detecciones térmicas del satélite VIIRS; incluyen quemas agrícolas y no equivalen a incendios confirmados.",
                "detecciones_fuera_de_limites": sin})
    hoy = datetime.date.today().isoformat()
    # resumen diario a Slack: una vez al día, con el último día completo disponible
    ayer = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    if avisar and est.get("slack_dia") != hoy and ayer in est["dias"]:
        v = est["dias"][ayer]
        tot = sum(v.values())
        top = ", ".join(f"{d} {n}" for d, n in sorted(v.items(), key=lambda x: -x[1])[:5])
        mm = ", ".join(f"{m} {n}" for m, n in list(est["municipios"].get(ayer, {}).items())[:5])
        avisar(f":satellite: *Focos de calor detectados por satélite — {ayer}* (NASA FIRMS, VIIRS NOAA-21): *{tot}* en Bolivia\n"
               f"Por departamento: {top or 'sin detecciones'}\n" + (f"Municipios con más detecciones: {mm}\n" if mm else "") +
               "_Detecciones térmicas del satélite; incluyen quemas agrícolas. No son incendios confirmados._")
        est["slack_dia"] = hoy
    json.dump(est, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # puntos individuales (mapa de calor) y complejos de focos
    try:
        rp = os.path.join(docs, "focos_puntos.json")
        previos = json.load(open(rp, encoding="utf-8")).get("puntos", []) if os.path.exists(rp) else []
        dias_nuevos = {p[3] for p in puntos}
        mant = [p for p in previos if p[3] not in dias_nuevos]
        todos = sorted(mant + puntos, key=lambda p: p[3])
        fechas = sorted({p[3] for p in todos})[-14:]
        todos = [p for p in todos if p[3] in fechas]
        json.dump({"actualizado": est["actualizado"], "fuente": est["fuente"], "campos": ["lat", "lon", "frp_mw", "fecha", "departamento", "municipio"], "dias": fechas, "puntos": todos},
                  open(rp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        if fechas:
            comp = complejos(todos, fechas[-1])
            json.dump({"actualizado": est["actualizado"], "dia": fechas[-1], "complejos": comp}, open(os.path.join(docs, "focos_complejos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    except Exception as ex:
        est["error_puntos"] = type(ex).__name__ + " " + str(ex)[:80]
    os.makedirs(os.path.join(docs, "datos"), exist_ok=True)
    with open(os.path.join(docs, "datos", "focos_detectados_diario.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f); w.writerow(["fecha", "departamento", "focos_detectados", "fuente"])
        for dia in sorted(est["dias"]):
            for d, n in sorted(est["dias"][dia].items()):
                w.writerow([dia, d, n, est["fuente"]])
    return f"{len(uniq)} detecciones (10 días), {len(puntos)} en Bolivia, {0 if not puntos else 1} mapa de calor, {sum(sum(v.values()) for v in cuenta.values())} dentro de Bolivia"

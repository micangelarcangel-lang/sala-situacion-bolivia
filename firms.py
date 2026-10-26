# -*- coding: utf-8 -*-
"""Focos de calor DETECTADOS por satélite (NASA FIRMS, VIIRS NOAA-21, casi tiempo real; el S-NPP deja de entregarse el 2-nov-2026) para Bolivia.
Requiere una clave gratuita en el secreto FIRMS_KEY (https://firms.modaps.eosdis.nasa.gov/api/map_key/). Sin clave se omite sin error.
OJO: un foco de calor es una detección térmica del satélite; incluye quemas agrícolas/chaqueo y no equivale a un incendio confirmado.
Salida: docs/focos_detectados.json (conteos por día, departamento y municipio) y docs/datos/focos_detectados_diario.csv"""
import re, os, csv, io, ssl, json, time, datetime, urllib.request

UA = "sala-situacion-bolivia"
FUENTE = "VIIRS_NOAA21_NRT"


def _get(u, n=3, t=120):
    err = ""
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=t, context=ssl.create_default_context()) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:60]
            time.sleep(5)
    raise RuntimeError(err)


def clasificar(filas, geo):
    from shapely.geometry import Point
    from shapely.prepared import prep
    deps = [(u["n"], prep(u["_s"])) for u in geo["dep"]]
    muns = {}
    for u in geo["mun"]:
        muns.setdefault(u["d"], []).append((u["n"], prep(u["_s"])))
    cuenta, cuenta_m, sin = {}, {}, 0
    for f in filas:
        p = Point(float(f["longitude"]), float(f["latitude"]))
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
    return cuenta, cuenta_m, sin


def actualizar(docs, geo, avisar=None, hora_local=None):
    key = os.environ.get("FIRMS_KEY", "").strip()
    if not key:
        return "sin clave FIRMS_KEY (se omite)"
    txt = _get(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{FUENTE}/-69.7,-22.95,-57.4,-9.6/3")
    if txt.lstrip().lower().startswith(("invalid", "<")) or "latitude" not in txt.split("\n", 1)[0]:
        raise RuntimeError("respuesta inesperada de FIRMS: " + txt[:80].replace(key, "[clave]"))
    filas = list(csv.DictReader(io.StringIO(txt)))
    # una detección puede repetirse: se deduplica
    vistos, uniq = set(), []
    for f in filas:
        k = (f["latitude"], f["longitude"], f["acq_date"], f["acq_time"])
        if k not in vistos:
            vistos.add(k); uniq.append(f)
    cuenta, cuenta_m, sin = clasificar(uniq, geo)
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
    os.makedirs(os.path.join(docs, "datos"), exist_ok=True)
    with open(os.path.join(docs, "datos", "focos_detectados_diario.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f); w.writerow(["fecha", "departamento", "focos_detectados", "fuente"])
        for dia in sorted(est["dias"]):
            for d, n in sorted(est["dias"][dia].items()):
                w.writerow([dia, d, n, est["fuente"]])
    return f"{len(uniq)} detecciones (3 días), {sum(sum(v.values()) for v in cuenta.values())} dentro de Bolivia"

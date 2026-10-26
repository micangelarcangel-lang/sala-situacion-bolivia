# -*- coding: utf-8 -*-
"""Sismos oficiales del Observatorio San Calixto (tabla pública 'última semana').
Fuente: https://osc.org.bo/index.php/es/27-sismicidad/51-boletin-sismico
Guarda docs/sismos_oficiales.json (últimos 400 eventos acumulados) y docs/datos/sismos_historico.csv.
Avisa a Slack una vez por sismo según criterio técnico documentado (ver criterio_slack)."""
import re, os, ssl, csv, json, time, datetime, urllib.request

URL = "https://osc.org.bo/index.php/es/27-sismicidad/51-boletin-sismico"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# Criterio técnico (fuentes):
#  - USGS (clases por magnitud): 4.0-5.9 "moderada, posible daño en construcciones vulnerables"; 6.0-7.9 "severa".
#  - Observatorio San Calixto (OSC, boletín junio 2026): un sismo de más de 100 km de profundidad "es poco probable que sea sentido y cause daños en superficie".
# Regla: Slack si M >= 4.0 y profundidad <= 100 km (probablemente sentido), o si M >= 6.0 a cualquier profundidad.
MAG_SENTIDO, PROF_SENTIDO, MAG_SEVERO = 4.0, 100.0, 6.0


def criterio_slack(e):
    if e["mag"] >= MAG_SEVERO:
        return True, "magnitud >= 6.0 (clase severa, USGS)"
    if e["mag"] >= MAG_SENTIDO and e["prof_km"] <= PROF_SENTIDO:
        return True, "magnitud >= 4.0 y profundidad <= 100 km: probablemente sentido (USGS / OSC)"
    return False, ""
RX = re.compile(r"(\d{2}/\d{2}/\d{4}) (\d{2}:\d{2}:\d{2}) (-?\d+\.\d+) (-?\d+\.\d+) (\d+\.?\d*) (\d+\.?\d*) (Prov\. [^\d|]+?)(?=\s+\d{2}/\d{2}/\d{4} \d{2}:|\s+\d+ \||\s*$)")


def _descargar():
    err = ""
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": UA}), timeout=60, context=ssl.create_default_context()) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:80]
            time.sleep(4)
    raise RuntimeError(err)


def leer(html):
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t))
    out = []
    for f, h, la, lo, pr, mg, reg in RX.findall(t):
        d, m, a = f.split("/")
        reg = reg.strip(" ,")
        prov, _, dep = reg.partition(", ")
        out.append({"id": f"{a}{m}{d}T{h.replace(':', '')}_{la}_{lo}", "fecha_local": f"{a}-{m}-{d} {h}", "lat": float(la), "lon": float(lo),
                    "prof_km": float(pr), "mag": float(mg), "provincia": prov.replace("Prov. ", ""), "departamento": dep, "fuente": "Observatorio San Calixto"})
        out[-1]["probable_sentido"] = out[-1]["prof_km"] <= PROF_SENTIDO and out[-1]["mag"] >= MAG_SENTIDO
    return out


def actualizar(docs, avisar=None):
    ev = leer(_descargar())
    if not ev:
        raise RuntimeError("no se leyó ningún sismo (¿cambió la página?)")
    ruta = os.path.join(docs, "sismos_oficiales.json")
    previo = []
    if os.path.exists(ruta):
        try:
            previo = json.load(open(ruta, encoding="utf-8")).get("sismos", [])
        except Exception:
            pass
    ids = {e["id"] for e in previo}
    nuevos = [e for e in ev if e["id"] not in ids]
    todos = sorted({e["id"]: e for e in previo + ev}.values(), key=lambda e: e["fecha_local"], reverse=True)[:400]
    primera = not previo
    n_slack = 0
    if avisar and not primera:  # la primera vez solo se toma la línea base
        for e in sorted(nuevos, key=lambda e: e["fecha_local"]):
            ok, razon = criterio_slack(e)
            if ok:
                avisar(f":earth_americas: *Sismo registrado — Observatorio San Calixto* M {e['mag']:.1f}\n{e['fecha_local']} (hora local) · {e['provincia']}, {e['departamento']}\n"
                       f"Profundidad {e['prof_km']:.0f} km · lat {e['lat']}, lon {e['lon']}\n_Fuente: osc.org.bo (valor preliminar). Criterio de aviso: {razon}._")
                n_slack += 1
    json.dump({"actualizado": datetime.datetime.utcnow().isoformat() + "Z", "fuente": URL, "criterio_slack": "M>=4.0 y prof<=100 km, o M>=6.0", "sismos": todos},
              open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(docs, "datos"), exist_ok=True)
    with open(os.path.join(docs, "datos", "sismos_historico.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "fecha_local", "lat", "lon", "prof_km", "mag", "provincia", "departamento", "fuente"])
        for e in todos:
            w.writerow([e[k] for k in ("id", "fecha_local", "lat", "lon", "prof_km", "mag", "provincia", "departamento", "fuente")])
    return f"{len(ev)} sismos leídos, {len(nuevos)} nuevos, {n_slack} a Slack" + (" (línea base)" if primera else "")

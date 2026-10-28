# -*- coding: utf-8 -*-
"""Monitor de sequía meteorológica por departamento: Índice Estandarizado de Precipitación (SPI) de la OMM.
Método: McKee et al. (1993) y Guía del Usuario del SPI (OMM-Nº 1090, 2012): precipitación acumulada a k meses (1, 3, 6, 12), ajuste de una distribución gamma
por mes calendario sobre el período de referencia 1991-2020 (tratando los meses con cero lluvia con la probabilidad de ceros) y transformación a puntuación normal estándar.
Datos: reanálisis ERA5 (Copernicus/ECMWF) vía Open-Meteo Historical API (libre, sin clave). Cobertura: 18 puntos representativos (2 por departamento); el valor departamental es el promedio de sus puntos.
Salida: docs/sequia.json. Se recalcula una vez al día."""
import os, json, time, datetime as dt, urllib.request, urllib.parse, urllib.error, calendar

UA = "sala-situacion-bolivia"
URL = "https://archive-api.open-meteo.com/v1/archive"
REF = (1991, 2020)
PUNTOS = {
    "La Paz": [(-16.50, -68.15), (-14.50, -67.50)], "Cochabamba": [(-17.40, -66.15), (-17.00, -65.00)], "Santa Cruz": [(-17.80, -63.20), (-16.30, -62.00)],
    "Oruro": [(-17.97, -67.10), (-19.00, -67.50)], "Potosí": [(-19.58, -65.75), (-21.00, -66.50)], "Chuquisaca": [(-19.04, -65.26), (-20.50, -63.80)],
    "Tarija": [(-21.53, -64.73), (-22.00, -63.70)], "Beni": [(-14.83, -64.90), (-12.50, -66.50)], "Pando": [(-11.02, -68.77), (-11.50, -67.50)]}
CLASES = [(2.0, "Extremadamente húmedo", 3), (1.5, "Muy húmedo", 2), (1.0, "Moderadamente húmedo", 1), (-0.99, "Normal", 0), (-1.49, "Sequía moderada", -1),
          (-1.99, "Sequía severa", -2), (-99, "Sequía extrema", -3)]


def clase(v):
    if v is None:
        return None, None
    for lim, nom, n in CLASES:
        if v >= lim:
            return nom, n
    return CLASES[-1][1], CLASES[-1][2]


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


def mensual(fechas, lluvia):
    """Serie diaria -> totales mensuales {(año, mes): mm}, solo meses completos (sin datos faltantes)."""
    acum, cuenta = {}, {}
    for f, v in zip(fechas, lluvia):
        if v is None:
            cuenta[(int(f[:4]), int(f[5:7]))] = -10 ** 6
            continue
        k = (int(f[:4]), int(f[5:7]))
        acum[k] = acum.get(k, 0.0) + float(v)
        cuenta[k] = cuenta.get(k, 0) + 1
    return {k: v for k, v in acum.items() if cuenta.get(k, 0) == calendar.monthrange(*k)[1]}


def spi_serie(mens, k):
    """SPI-k para todos los meses disponibles. mens: {(a,m): mm}. Devuelve {(a,m): spi}."""
    import numpy as np
    from scipy import stats
    claves = sorted(mens)
    sumas = {}
    for (a, m) in claves:
        idx = a * 12 + (m - 1)
        parte = [mens.get(((idx - j) // 12, (idx - j) % 12 + 1)) for j in range(k)]
        if all(p is not None for p in parte):
            sumas[(a, m)] = sum(parte)
    out = {}
    for m in range(1, 13):
        ref = np.array([v for (a, mm), v in sumas.items() if mm == m and REF[0] <= a <= REF[1]], dtype=float)
        if len(ref) < 20:
            continue
        pos = ref[ref > 0]
        q = 1 - len(pos) / len(ref)
        if len(pos) >= 10 and np.std(pos) > 0:
            a_, loc, esc = stats.gamma.fit(pos, floc=0)
        else:
            a_ = esc = None
        for (a, mm), v in sumas.items():
            if mm != m:
                continue
            if v <= 0 or a_ is None:
                h = q if a_ is not None or v <= 0 else 0.5
                h = max(min(h * 0.5 + 0.0, 0.999), 0.001) if v <= 0 else h  # probabilidad de ceros: punto medio del tramo de ceros
            else:
                h = q + (1 - q) * stats.gamma.cdf(v, a_, loc=0, scale=esc)
            h = min(max(h, 0.001), 0.999)
            out[(a, mm)] = float(stats.norm.ppf(h))
    return out


def _promedio(series):
    claves = set.intersection(*[set(s) for s in series]) if series else set()
    return {k: sum(s[k] for s in series) / len(series) for k in claves}


def calcular(datos_por_dep, hoy=None):
    """datos_por_dep: {dep: [ (fechas, lluvia), ... por punto ]}. Devuelve el diccionario de salida."""
    hoy = hoy or dt.date.today()
    res, ultimo = {}, None
    for dep, lista in datos_por_dep.items():
        mens_p = [({(int(k[:4]), int(k[5:7])): v for k, v in x.items()} if isinstance(x, dict) else mensual(*x)) for x in lista]
        comunes = set.intersection(*[set(m) for m in mens_p])
        mens = {k: sum(m[k] for m in mens_p) / len(mens_p) for k in comunes}
        if not mens:
            continue
        ult = max(mens)
        ultimo = max(ultimo, ult) if ultimo else ult
        r = {}
        for k in (1, 3, 6, 12):
            s = spi_serie(mens, k)
            v = s.get(ult)
            r[f"spi{k}"] = None if v is None else round(v, 2)
            if k == 3:
                serie = sorted(s.items())[-36:]
                r["serie_spi3"] = [[f"{a}-{m:02d}", round(v, 2)] for (a, m), v in serie]
            if k == 1:
                r["serie_spi1"] = [[f"{a}-{m:02d}", round(v, 2)] for (a, m), v in sorted(s.items())[-24:]]
        norm = [v for (a, m), v in mens.items() if m == ult[1] and REF[0] <= a <= REF[1]]
        r["precip_mes_mm"] = round(mens[ult], 1)
        r["normal_mes_mm"] = round(sum(norm) / len(norm), 1) if norm else None
        r["pct_normal"] = round(100 * mens[ult] / (sum(norm) / len(norm)), 0) if norm and sum(norm) > 0 else None
        for k in (1, 3, 6, 12):
            r[f"clase{k}"], r[f"nivel{k}"] = clase(r[f"spi{k}"])
        res[dep] = r
    return {"actualizado": dt.datetime.utcnow().isoformat() + "Z", "ultimo_mes": f"{ultimo[0]}-{ultimo[1]:02d}" if ultimo else None, "referencia": f"{REF[0]}-{REF[1]}",
            "metodo": "SPI (OMM, McKee 1993), distribución gamma por mes calendario, ERA5 vía Open-Meteo", "departamentos": res,
            "nota": "En la estación seca (mayo–octubre) casi no llueve: el SPI de 1 mes es poco informativo; use SPI de 6 y 12 meses. Es un indicador de sequía meteorológica; no reemplaza una declaratoria."}


def actualizar(docs, forzar=False):
    ruta = os.path.join(docs, "sequia.json")
    hoy = dt.date.today()
    if os.path.exists(ruta) and not forzar:
        try:
            if json.load(open(ruta, encoding="utf-8")).get("actualizado", "")[:10] == hoy.isoformat():
                return "ya actualizado hoy"
        except Exception:
            pass
    fin = hoy - dt.timedelta(days=7)           # ERA5 se publica con ~5 días de retraso
    rc = os.path.join(docs, "sequia_cache.json")
    cache = {}
    try:
        cache = json.load(open(rc, encoding="utf-8"))
        if (hoy - dt.date.fromisoformat(cache.get("hasta", "2000-01-01"))).days > 25:
            cache = {}                                 # se renueva cada ~mes (cuando se completa un mes nuevo)
    except Exception:
        cache = {}
    deps = cache.get("deps", {})
    limite = time.time() + 150                         # presupuesto de tiempo por ciclo: nunca bloquea el sistema
    for dep, pts in PUNTOS.items():
        if dep in deps:
            continue
        if time.time() > limite:
            break
        q = urllib.parse.urlencode({"latitude": ",".join(str(p[0]) for p in pts), "longitude": ",".join(str(p[1]) for p in pts), "start_date": f"{REF[0] - 1}-01-01",
                                    "end_date": fin.isoformat(), "daily": "precipitation_sum", "timezone": "America/La_Paz"})
        j = _get(URL + "?" + q)
        j = j if isinstance(j, list) else [j]
        deps[dep] = [{"%d-%02d" % k: round(v, 2) for k, v in mensual(x["daily"]["time"], x["daily"]["precipitation_sum"]).items()} for x in j]
        json.dump({"hasta": cache.get("hasta") or hoy.isoformat(), "deps": deps}, open(rc, "w", encoding="utf-8"), separators=(",", ":"))
        time.sleep(2)
    falta = [d for d in PUNTOS if d not in deps]
    if falta:
        return f"parcial: {len(deps)}/{len(PUNTOS)} departamentos descargados; continúa en el próximo ciclo"
    out = calcular(deps, hoy)
    json.dump(out, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    sec = [d for d, v in out["departamentos"].items() if (v.get("nivel3") or 0) <= -1]
    return f"SPI hasta {out['ultimo_mes']}: {len(out['departamentos'])} departamentos; con sequía (SPI-3 ≤ -1): {', '.join(sec) or 'ninguno'}"

# -*- coding: utf-8 -*-
"""Base unificada de eventos: reúne prensa, SENAMHI, sismos, focos de calor y epidemiología en UN solo formato.
Salida: docs/eventos_unificados.json (acumulativo, 400 días), docs/datos/eventos_unificados.csv, docs/geo_dep.json (mapa simplificado para las fichas).
Cada registro: id, origen, categoria, titulo, ts (ms), nivel (0-3 o null), nivel_txt, oficial, lugar, departamentos[], lat, lon, detalle, fuente, url, cifras{}"""
import os, re, csv, json, time, datetime as dt

TZ = dt.timezone(dt.timedelta(hours=-4))
NIV = {"VERDE": 0, "AMARILLA": 1, "AMARILLO": 1, "NARANJA": 2, "ROJA": 3, "ROJO": 3}
NOMNIV = ["Verde", "Amarilla", "Naranja", "Roja"]
DEPS = ["La Paz", "Cochabamba", "Santa Cruz", "Oruro", "Potosí", "Chuquisaca", "Tarija", "Beni", "Pando"]


def _j(ruta, defecto):
    try:
        return json.load(open(ruta, encoding="utf-8"))
    except Exception:
        return defecto


def _ms(s):
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return int(dt.datetime.strptime(s[:19] if " " in s else s[:10], f).replace(tzinfo=TZ).timestamp() * 1000)
        except Exception:
            pass
    return None


def _dep_de_texto(t):
    t = t or ""
    return [d for d in DEPS if d.lower() in t.lower()]


def _norm(t):
    import unicodedata
    return re.sub(r"[^a-z0-9 ]", " ", "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")).strip()


_MEDIO_CANON = {"la patria": "La Patria", "opinion": "Opinión", "el diario": "El Diario", "el dia": "El Día", "el deber": "El Deber", "red uno": "Red Uno", "unitel": "Unitel",
                "eju tv": "Eju.tv", "brujula digital": "Brújula Digital", "la razon": "La Razón", "los tiempos": "Los Tiempos", "correo del sur": "Correo del Sur", "el potosi": "El Potosí",
                "anf agencia de noticias fides": "ANF", "fides": "Fides", "erbol": "Erbol", "vision 360": "Visión 360", "oxigeno": "Oxígeno", "atb": "ATB", "el mundo": "El Mundo"}


def canon_medio(m):
    """Nombre único del medio (La Patria = La Patria Bolivia) para que un mismo medio no cuente como dos fuentes. Devuelve '' si no es un medio periodístico."""
    n = _norm(m)
    if not n or re.search(r"amazon|vietnam|crprensa|msn|yahoo|google|facebook|youtube|tiktok", n):
        return ""
    for _ in range(2):
        n = re.sub(r" (noticias de bolivia para el mundo|bolivia|bo)$", "", n).strip()
    return _MEDIO_CANON.get(n) or " ".join(w.capitalize() if len(w) > 2 else w for w in n.split())


def _fuente_extranjera(f):
    f = _norm(f)
    return bool(re.search(r"\b(pe|ar|cl|br|co|mx|ec|py|uy|ve|es|cu)$", f) or " salta" in " " + f)


def _medios_directos(docs, geo, horas=96):
    """Notas de los RSS directos de los medios (fuentes_nuevas.json) con el mismo formato que las de Google Noticias.
    Solo titulares con palabras de peligro; así un hecho que cuentan varios medios sube de confianza."""
    import hashlib, email.utils, time as _t
    try:
        import busqueda, informe_hecho as ih
    except Exception:
        return []
    out, lim = [], (_t.time() - horas * 3600) * 1000
    for k, lista in (_j(os.path.join(docs, "fuentes_nuevas.json"), {}).get("datos", {}) or {}).items():
        if not k.startswith("Prensa/oficial"):
            continue
        for x in lista:
            if not x.get("ruta") or not x.get("relevante") or not x.get("titulo") or not (x.get("url") or "").startswith("http"):
                continue
            try:
                ts = int(email.utils.parsedate_to_datetime(x["fecha"]).timestamp() * 1000)
            except Exception:
                continue
            if ts < lim:
                continue
            t = x["titulo"]
            f, h = ih.cifras(t)
            lat = lon = None; lugar, metodo = "", "sin ubicar"
            if geo:
                lat, lon, lugar, metodo = busqueda.ubicar_por_nombre(geo, t + " " + (x.get("resumen") or ""))
            out.append({"id": "noticia:rss:" + hashlib.md5(x["url"].encode()).hexdigest()[:12], "ts": ts, "fuente": x["medio"], "tipo": busqueda.tipo_por_texto(t + " " + (x.get("resumen") or "")),
                        "nivel": 3 if (f >= 10 or h >= 30) else 2 if (f >= 3 or h >= 10) else 1, "titulo": t, "detalle": (x.get("resumen") or "")[:300], "url": x["url"], "fall": f, "her": h,
                        "lat": lat, "lon": lon, "lugar": lugar, "metodo": metodo})
    for x in (_j(os.path.join(docs, "prensa_medios.json"), {}).get("eventos") or []):
        if x.get("ts", 0) >= lim:
            out.append(x)
    return out


def desde_prensa(docs, ubicar, geo=None):
    out, vistos = [], {}
    for e in _j(os.path.join(docs, "data.json"), {}).get("eventos", []) + _medios_directos(docs, geo):
        deps = []
        if e.get("lat") is not None and ubicar:
            d, _m = ubicar(e["lat"], e["lon"])
            if d:
                deps = [d]
        deps = deps or _dep_de_texto(e.get("lugar"))
        n = e.get("nivel") or 0
        pref = e["id"].split(":")[0]
        origen = {"clima": "modelo", "gdacs": "gdacs", "usgs": "usgs"}.get(pref, "prensa")
        oficial = origen in ("gdacs", "usgs")
        titulo = re.sub(r" - [^-]+$", "", e.get("titulo", "")) if origen == "prensa" else e.get("titulo", "")
        det = e.get("detalle") or ""
        if origen == "prensa" and _fuente_extranjera(e.get("fuente")):
            det = ("Atención: la nota proviene de un medio extranjero y no está verificada por un medio boliviano. " + det).strip()
        if origen == "modelo":
            det = ("Pronóstico del modelo Open-Meteo (no es una observación ni un aviso oficial). " + det).strip()
        txt = {"prensa": " (preliminar)", "modelo": " (pronóstico de modelo)", "gdacs": " (GDACS)", "usgs": " (USGS)"}[origen]
        r = {"id": e["id"], "origen": origen, "categoria": e.get("tipo") or "otra", "titulo": titulo, "ts": e["ts"], "nivel": n, "nivel_txt": NOMNIV[n] + txt,
             "oficial": oficial, "lugar": e.get("lugar") or "", "departamentos": deps, "lat": e.get("lat"), "lon": e.get("lon"), "detalle": det, "fuente": e.get("fuente", ""),
             "url": e.get("url", ""), "ts_ult": e["ts"], "medios": [e.get("fuente", "")] if origen == "prensa" else [], "cifras": {"fallecidos": e.get("fall") or 0, "heridos": e.get("her") or 0, "notas": e.get("n_notas") or 1}, "metodo": e.get("metodo") or ""}
        if origen == "prensa":
            try:
                import depurar
                if depurar.revisar(r) is None:   # no es un evento o es del extranjero
                    continue
            except ImportError:
                pass
        if origen == "prensa":  # mismo titular el mismo día = mismo hecho: se funde
            k = _norm(titulo)[:70]
            if k in vistos and abs(vistos[k]["ts"] - r["ts"]) <= 72 * 3600000:
                a = vistos[k]
                a["cifras"]["notas"] = a["cifras"].get("notas", 1) + r["cifras"]["notas"]
                a["cifras"]["fallecidos"] = max(a["cifras"]["fallecidos"], r["cifras"]["fallecidos"])
                a["cifras"]["heridos"] = max(a["cifras"]["heridos"], r["cifras"]["heridos"])
                a["ts_ult"] = max(a.get("ts_ult", a["ts"]), r["ts"])
                a["ts"] = min(a["ts"], r["ts"])
                a["medios"] = sorted(set(a.get("medios", [])) | set(r.get("medios", [])))
                a.setdefault("alias", []).append(r["id"])
                continue
            vistos[k] = r
        if origen == "prensa":
            try:
                import transito
                c = transito.clasificar(titulo)
                if c:
                    r["subtipo"] = "Tránsito: " + c["tipo"]
            except Exception:
                pass
        out.append(r)
    return out


_DEPN = {"cochabamba", "santa", "potosi", "oruro", "tarija", "beni", "pando", "chuquisaca", "paz", "alto", "sucre", "bolivia", "carretera", "accidente", "heridos", "choque"}


def _temas(t):
    try:
        import depurar
        return depurar.tema(t)
    except ImportError:
        return set()


def fusion_semantica(evs):
    """Une notas de prensa que cuentan el MISMO hecho aunque el titular cambie (misma categoría, departamento compatible, ≤72 h,
    palabras específicas y nombres propios en común). Acumula los medios distintos: eso es lo que sube la confianza."""
    try:
        import transito as T
    except Exception:
        return evs
    res, grupos = [], []
    absorbidas = {}
    for r in evs:
        for al in r.get("alias", []):
            absorbidas[al] = r["id"]
    evs = [r for r in evs if not (r["origen"] == "prensa" and r["id"] in absorbidas and absorbidas[r["id"]] != r["id"])]   # nota ya fundida en otro hecho
    for r in sorted(evs, key=lambda x: x["ts"]):
        if r["origen"] != "prensa":
            res.append(r); continue
        ti = r["titulo"]
        tk, es = T._toks(ti), T._ents(ti)
        dp = set(r.get("departamentos") or [])
        destino = None
        for g in grupos:
            a = g["ev"]
            if abs(a["ts"] - r["ts"]) > 72 * 3600000:
                continue
            comun = g["tk"] & tk
            esp = {w for w in comun if w not in T._GEN}
            if a["categoria"] != r["categoria"]:
                # mismo hecho clasificado distinto por dos medios (p. ej. decreto de emergencia por El Niño): exige casi el mismo titular
                if len(esp) >= 4 and T._sim(g["tk"] - T._GEN, tk - T._GEN) >= 0.6 and abs(a["ts"] - r["ts"]) <= 48 * 3600000:
                    destino = g; break
                continue
            # (a) mismo hecho con departamento distinto en la nota (p. ej. «Los Chicos Fieles»): dos o más palabras específicas largas en común, ≤48 h
            fuertes = {w for w in esp if len(w) >= 6 and w not in _DEPN}
            ec = {w for w in (g["es"] & es) if w not in _DEPN}
            if len(fuertes) >= 2 and ec and abs(a["ts"] - r["ts"]) <= 48 * 3600000:
                destino = g; break
            if g["dp"] and dp and not (g["dp"] & dp):
                continue
            # (b) fenómeno de área (sequía, granizada, brote…): mismo tema, mismo departamento, ≤48 h
            try:
                import depurar as _dp
                if r["categoria"] in _dp.AREA and (g["th"] & _dp.tema(ti)) and abs(a["ts"] - r["ts"]) <= 48 * 3600000 and (g["dp"] & dp):
                    destino = g; break
            except ImportError:
                pass
            distintos = bool(g["es"] and es and not (g["es"] & es))
            s = T._sim(g["tk"] - T._GEN, tk - T._GEN)
            if (g["es"] & es and len(comun) >= 2) or (not distintos and s >= 0.5 and len(esp) >= 2):
                destino = g; break
        if destino is None:
            grupos.append({"ev": r, "tk": set(tk), "es": set(es), "dp": set(dp), "th": _temas(ti)}); res.append(r); continue
        a = destino["ev"]
        a["medios"] = sorted(set(a.get("medios", [])) | set(r.get("medios", [])))
        a["cifras"]["fallecidos"] = max(a["cifras"]["fallecidos"], r["cifras"]["fallecidos"])
        a["cifras"]["heridos"] = max(a["cifras"]["heridos"], r["cifras"]["heridos"])
        a["ts_ult"] = max(a.get("ts_ult", a["ts"]), r.get("ts_ult", r["ts"]))
        a["alias"] = sorted(set(a.get("alias", [])) | {r["id"]} | set(r.get("alias", [])))
        a["cifras"]["notas"] = 1 + len(a["alias"])
        a["lat"] = a["lat"] if a["lat"] is not None else r["lat"]; a["lon"] = a["lon"] if a["lon"] is not None else r["lon"]
        destino["tk"] |= tk; destino["es"] |= es; destino["dp"] |= dp; destino["th"] |= _temas(ti)
        if not a["departamentos"]:
            a["departamentos"] = r.get("departamentos") or []
    return res


def desde_senamhi(docs):
    out = []
    for a in _j(os.path.join(docs, "senamhi_alertas.json"), {}).get("alertas", []):
        n = NIV.get((a.get("nivel") or "").upper())
        ts = _ms(a.get("publicada") or "") or _ms(a.get("inicio") or "")
        if ts is None:
            continue
        clave = re.search(r"(\d+)\s*$", a.get("url") or a.get("pdf") or "") or re.search(r"alerta_(\d+)", a.get("pdf") or "")
        idn = ((a.get("tipo") or "hidrológica")[:4] + "-" + (clave.group(1) if clave else str(ts)))
        det = a.get("descripcion") or ""
        if a.get("rios"):
            det += (" " if det else "") + "Ríos citados: " + ", ".join(a["rios"][:15]) + "."
        if a.get("poblaciones"):
            det += " Poblaciones: " + ", ".join(a["poblaciones"][:15]) + "."
        out.append({"id": "senamhi:" + idn, "origen": "senamhi", "categoria": a.get("tipo") or "hidrológica", "titulo": a.get("titulo") or a.get("fenomeno") or "Aviso SENAMHI",
                    "ts": ts, "nivel": n, "nivel_txt": (a.get("nivel") or "").title() + " (oficial SENAMHI)", "oficial": True, "lugar": ", ".join(a.get("departamentos") or []),
                    "departamentos": a.get("departamentos") or [], "lat": None, "lon": None, "detalle": det.strip(), "fuente": "SENAMHI", "url": a.get("url") or a.get("pdf") or "",
                    "cifras": {"inicio": a.get("inicio"), "fin": a.get("fin"), "municipios": len(a.get("municipios") or []) or a.get("n_municipios") or 0},
                    "municipios": (a.get("municipios") or [])[:80], "fenomeno": a.get("fenomeno") or ""})
    return out


def desde_sismos(docs):
    out = []
    for s in _j(os.path.join(docs, "sismos_oficiales.json"), {}).get("sismos", []):
        ts = _ms(s.get("fecha_local", ""))
        if ts is None:
            continue
        sent = s.get("mag", 0) >= 4.0 and s.get("prof_km", 999) <= 100
        out.append({"id": "sismo:" + s["id"], "origen": "sismo", "categoria": "geológica", "titulo": f"Sismo M {s['mag']:.1f} — {s.get('provincia','')}, {s.get('departamento','')}",
                    "ts": ts, "nivel": None, "nivel_txt": "Sin nivel (magnitud y profundidad)", "oficial": True, "lugar": f"{s.get('provincia','')}, {s.get('departamento','')}",
                    "departamentos": [s.get("departamento")] if s.get("departamento") else [], "lat": s.get("lat"), "lon": s.get("lon"),
                    "detalle": ("Posiblemente sentido por la población (M≥4,0 y profundidad ≤100 km)." if sent else "Poco probable que haya sido sentido (magnitud <4,0 o profundidad >100 km)."),
                    "fuente": "Observatorio San Calixto", "url": "https://osc.org.bo/index.php/es/27-sismicidad/51-boletin-sismico",
                    "cifras": {"magnitud": s["mag"], "profundidad_km": s["prof_km"]}})
    return out


def desde_focos(docs):
    out = []
    d = _j(os.path.join(docs, "focos_detectados.json"), {})
    for dia, v in (d.get("dias") or {}).items():
        ts = _ms(dia)
        if ts is None:
            continue
        for dep, n in v.items():
            muni = [m.split(" (")[0] + f" {c}" for m, c in (d.get("municipios", {}).get(dia, {}) or {}).items() if m.endswith(f"({dep})")][:5]
            out.append({"id": f"foco:{dia}:{dep}", "origen": "foco", "categoria": "climatológica", "titulo": f"Focos de calor detectados — {dep}: {n}", "ts": ts + 12 * 3600000,
                        "nivel": None, "nivel_txt": "Sin nivel (conteo de detecciones)", "oficial": True, "lugar": dep, "departamentos": [dep], "lat": None, "lon": None,
                        "detalle": "Detecciones térmicas del satélite VIIRS (NASA FIRMS); incluyen quemas agrícolas y no equivalen a incendios confirmados." + (" Municipios con más: " + ", ".join(muni) + "." if muni else ""),
                        "fuente": "NASA FIRMS (VIIRS NOAA-21)", "url": "https://firms.modaps.eosdis.nasa.gov/", "cifras": {"focos": n}})
    return out


def desde_epi(docs):
    out = []
    d = _j(os.path.join(docs, "epidemio_oficial.json"), {})
    for b in d.get("boletines", [])[:12]:
        out.append({"id": f"epi:msd-se{b.get('semana')}", "origen": "epidemiologia", "categoria": "biológica", "titulo": f"Boletín epidemiológico Bolivia — semana {b.get('semana')}",
                    "ts": _ms(((b.get("periodo") or "")[-4:] + "-01-01")) or int(time.time() * 1000), "nivel": None, "nivel_txt": "Sin nivel", "oficial": True, "lugar": "Bolivia",
                    "departamentos": [], "lat": None, "lon": None, "detalle": " ".join(b.get("frases") or [])[:900], "fuente": "Ministerio de Salud y Deportes", "url": b.get("url", ""),
                    "cifras": {"semana": b.get("semana")}, "periodo": b.get("periodo")})
    for x in d.get("internacional", [])[:40]:
        ts = _ms(x.get("fecha", ""))
        if ts is None:
            continue
        out.append({"id": "epi:" + (x.get("slug") or x.get("titulo", "")[:40]), "origen": "epidemiologia", "categoria": "biológica", "titulo": x.get("titulo", ""), "ts": ts + 12 * 3600000,
                    "nivel": None, "nivel_txt": "Sin nivel (vigilancia internacional)", "oficial": True, "lugar": "Internacional", "departamentos": [], "lat": None, "lon": None,
                    "detalle": x.get("resumen") or "", "fuente": x.get("fuente", ""), "url": x.get("url", ""), "cifras": {}, "menciona_bolivia": bool(x.get("menciona_bolivia")), "internacional": True})
    return out


def desde_extra(docs):
    out = []
    for x in _j(os.path.join(docs, "extra_eventos.json"), {}).get("eventos", []):
        out.append({"id": x["id"], "origen": "eonet", "categoria": x["categoria"], "titulo": x["titulo"] + " (NASA EONET)", "ts": x["ts"], "nivel": None, "nivel_txt": "Sin nivel (evento NASA EONET)",
                    "oficial": True, "lugar": "", "departamentos": [], "lat": x["lat"], "lon": x["lon"], "detalle": x["detalle"], "fuente": "NASA EONET", "url": x.get("url", ""), "cifras": {}})
    return out


def desde_complejos(docs):
    out = []
    d = _j(os.path.join(docs, "focos_complejos.json"), {})
    ts = _ms(d.get("dia", "")) if d.get("dia") else None
    for c in d.get("complejos", [])[:15]:
        if ts is None:
            break
        out.append({"id": "complejo:" + c["id"] + ":" + str(c.get("departamento")), "origen": "foco", "categoria": "climatológica",
                    "titulo": f"Complejo de focos de calor — {c.get('municipio') or c['departamento']} ({c['n']} detecciones)", "ts": ts + 13 * 3600000,
                    "nivel": None, "nivel_txt": "Sin nivel (agrupación de detecciones)", "oficial": True, "lugar": f"{c.get('municipio','')}, {c['departamento']}".strip(", "),
                    "departamentos": [c["departamento"]], "lat": c["lat"], "lon": c["lon"],
                    "detalle": f"Agrupación de {c['n']} detecciones térmicas (VIIRS NOAA-21) en dos días, con potencia radiativa acumulada de {c['frp_mw']} MW. Municipios: {', '.join(c.get('municipios') or [])}. "
                               "Las detecciones incluyen quemas agrícolas y no equivalen a incendios confirmados.",
                    "fuente": "NASA FIRMS (VIIRS NOAA-21)", "url": "https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@" + f"{c['lon']},{c['lat']},11z",
                    "cifras": {"detecciones": c["n"], "frp_mw": c["frp_mw"]}, "bbox": c.get("bbox")})
    return out


def desde_sequia(docs):
    out = []
    d = _j(os.path.join(docs, "sequia.json"), {})
    um = d.get("ultimo_mes")
    ts = _ms(um + "-28") if um else None
    for dep, v in (d.get("departamentos") or {}).items():
        sev = min([x for x in (v.get("nivel3"), v.get("nivel6"), v.get("nivel12")) if x is not None] or [0])
        if ts is None or sev > -1:
            continue
        esc = min(((v.get("nivel%d" % k), k) for k in (3, 6, 12) if v.get("nivel%d" % k) is not None), key=lambda t: t[0])[1]
        out.append({"id": f"sequia:{um}:{dep}", "origen": "sequia", "categoria": "climatológica", "titulo": f"Déficit de precipitación — {dep}: {v.get('clase%d' % esc)} (SPI-{esc} {v.get('spi%d' % esc)})",
                    "ts": ts, "nivel": None, "nivel_txt": "Sin nivel (índice SPI)", "oficial": False, "lugar": dep, "departamentos": [dep], "lat": None, "lon": None,
                    "detalle": f"SPI-1 {v.get('spi1')} · SPI-3 {v.get('spi3')} · SPI-6 {v.get('spi6')} · SPI-12 {v.get('spi12')}. Precipitación del mes {v.get('precip_mes_mm')} mm ({v.get('pct_normal')} % de lo normal). "
                               "Indicador calculado con ERA5 (método OMM); no es una declaratoria de sequía.",
                    "fuente": "ERA5 / Open-Meteo (SPI-OMM)", "url": "https://library.wmo.int/idurl/4/39629", "cifras": {k: v.get(k) for k in ("spi1", "spi3", "spi6", "spi12")}})
    return out


def desde_caudales(docs):
    out = []
    d = _j(os.path.join(docs, "caudales.json"), {})
    ts = _ms(d.get("actualizado", "")[:10]) if d.get("actualizado") else None
    for p in d.get("puntos", []):
        if ts is None or (p.get("nivel") or 0) < 2:
            continue
        out.append({"id": f"caudal:{p['nombre']}:{p.get('hoy')}", "origen": "caudal", "categoria": "hidrológica", "titulo": f"Caudal elevado — {p['rio']} en {p['nombre']}", "ts": ts + 12 * 3600000,
                    "nivel": None, "nivel_txt": "Sin nivel (indicador de modelo)", "oficial": False, "lugar": f"{p['nombre']}, {p['departamento']}", "departamentos": [p["departamento"]],
                    "lat": p["lat"], "lon": p["lon"], "detalle": f"{p['estado']}. Caudal máximo previsto en 10 días: {p.get('caudal_max_10d')} m³/s. Indicador del modelo GloFAS, no alerta oficial.",
                    "fuente": "GloFAS (Copernicus EMS)", "url": "https://global-flood.emergency.copernicus.eu/", "cifras": {"caudal_max_10d_m3s": p.get("caudal_max_10d"), "ratio_p90": p.get("ratio_p90_max_10d")}})
    return out


FAM = {"eonet": "Internacional", "prensa": "Prensa", "senamhi": "Oficial nacional", "sismo": "Oficial nacional", "epidemiologia": "Oficial nacional", "foco": "Satélite", "gdacs": "Satélite / GDACS",
       "usgs": "Internacional", "modelo": "Modelo", "sequia": "Modelo", "caudal": "Modelo"}


# ---------------------------------------------------------------- triangulación con modelo de lenguaje (embeddings multilingües)
UMBRAL_EMB = 0.75   # mismo umbral semántico que usa World Monitor (semanticClusterThreshold)
_EMB = {}


def _embed(textos, espera_s=150):
    """Vectores normalizados con un modelo multilingüe pequeño (fastembed/ONNX, sin GPU). Devuelve None si no está disponible
    (sin internet para descargar el modelo, librería no instalada o demora): entonces se usa solo la fusión por reglas."""
    import threading
    res = {}

    def trabajo():
        try:
            import numpy as np
            from fastembed import TextEmbedding
            if "m" not in _EMB:
                _EMB["m"] = TextEmbedding("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
            v = np.array(list(_EMB["m"].embed(textos)), dtype="float32")
            v /= (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
            res["v"] = v
        except Exception as e:
            res["err"] = type(e).__name__ + " " + str(e)[:80]
    t = threading.Thread(target=trabajo, daemon=True)
    t.start(); t.join(espera_s)
    return res.get("v"), res.get("err", "sin respuesta a tiempo" if "v" not in res else "")


def fusion_embeddings(evs, docs=None, log=print):
    """Segunda pasada de triangulación: une notas de prensa del MISMO hecho aunque el titular use otras palabras.
    Condiciones (todas): similitud semántica ≥ UMBRAL_EMB, ≤48 h, departamento compatible, y al menos un indicio concreto en común
    (una palabra específica larga, un nombre propio o la misma cifra de víctimas). Cada unión queda en docs/triangulacion_log.json para auditarla."""
    try:
        import transito as T
    except Exception:
        return evs
    prensa = [e for e in evs if e["origen"] == "prensa"]
    if len(prensa) < 2:
        return evs
    V, err = _embed([re.sub(r"\s+", " ", (e["titulo"] + ". " + (e.get("detalle") or ""))[:300]) for e in prensa])
    if V is None:
        log("Triangulación por modelo de lenguaje no disponible (" + err + "); se usan solo las reglas.")
        return evs
    import numpy as np
    S_ = V @ V.T
    absorbido, union, log_u = {}, [], []
    orden = sorted(range(len(prensa)), key=lambda i: prensa[i]["ts"])
    for ia in range(len(orden)):
        i = orden[ia]
        if i in absorbido:
            continue
        a = prensa[i]
        for ib in range(ia + 1, len(orden)):
            j = orden[ib]
            if j in absorbido:
                continue
            b = prensa[j]
            if abs(a["ts"] - b["ts"]) > 48 * 3600000 or S_[i, j] < UMBRAL_EMB:
                continue
            da, db = set(a["departamentos"] or []), set(b["departamentos"] or [])
            if da and db and not (da & db):
                continue
            ta, tb = T._toks(a["titulo"]) - T._GEN, T._toks(b["titulo"]) - T._GEN
            esp = {w for w in (ta & tb) if len(w) >= 5 and w not in _DEPN}
            ea, eb = T._ents(a["titulo"]), T._ents(b["titulo"])
            ent = {w for w in (ea & eb) if w not in _DEPN}
            fa, fb = a["cifras"], b["cifras"]
            if ea and eb and not (ea & eb) and S_[i, j] < 0.85:
                continue    # nombres propios distintos: probablemente hechos distintos
            absorbido[j] = i
            a["medios"] = sorted(set(a.get("medios", [])) | set(b.get("medios", [])))
            a["cifras"]["fallecidos"] = max(fa.get("fallecidos", 0), fb.get("fallecidos", 0)); a["cifras"]["heridos"] = max(fa.get("heridos", 0), fb.get("heridos", 0))
            a["alias"] = sorted(set(a.get("alias", [])) | {b["id"]} | set(b.get("alias", [])))
            a["cifras"]["notas"] = 1 + len(a["alias"])
            a["ts_ult"] = max(a.get("ts_ult", a["ts"]), b.get("ts_ult", b["ts"]))
            a["lat"] = a["lat"] if a["lat"] is not None else b["lat"]; a["lon"] = a["lon"] if a["lon"] is not None else b["lon"]
            if not a["departamentos"]:
                a["departamentos"] = b.get("departamentos") or []
            log_u.append({"similitud": round(float(S_[i, j]), 3), "a": a["titulo"][:110], "b": b["titulo"][:110], "indicio": sorted(esp | ent)[:4] or "misma cifra de víctimas"})
    if docs:
        try:
            json.dump({"generado": int(time.time() * 1000), "umbral": UMBRAL_EMB, "uniones": log_u[:200]}, open(os.path.join(docs, "triangulacion_log.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        except Exception:
            pass
    log(f"Triangulación por modelo de lenguaje: {len(log_u)} notas unidas a un hecho existente")
    return [e for k, e in enumerate(evs) if not (e["origen"] == "prensa" and prensa.index(e) in absorbido)]


def _puntaje_ev(fam, medios):
    """Credibilidad combinada 0–100 (criterio editorial del sistema): oficial .95 · satélite .85 · internacional .8 · modelo .5 · cada medio de prensa según su peso."""
    w = {"Oficial nacional": .95, "Satélite": .85, "Internacional": .8, "Modelo": .5}
    p = 1.0
    for f in fam:
        if f in w:
            p *= 1 - w[f]
    try:
        import transito as T
        for m in (medios or ()):
            p *= 1 - T._cred(m)
        if "Prensa" in fam and not medios:
            p *= 1 - 0.6
    except Exception:
        pass
    return round(100 * (1 - p))


def triangular(evs):
    """Triangulación: cuántas FUENTES INDEPENDIENTES respaldan un evento.
    Cada medio de prensa distinto que cuenta el mismo hecho suma 1; cada familia no periodística (oficial nacional, satélite, internacional, modelo)
    con evento relacionado (misma categoría, departamento compatible, ≤72 h) suma 1.  Alta ≥ 3 · Media 2 · Baja 1."""
    def ventana(e):
        return 15 * 86400000 if e["origen"] in ("sequia", "caudal") else 72 * 3600000
    for e in evs:
        fam = {FAM.get(e["origen"], "Otra")}
        if e["origen"] == "prensa":
            e["medios"] = sorted({canon_medio(m) for m in e.get("medios", []) if canon_medio(m)})
        medios = {m for m in e.get("medios", []) if m} if e["origen"] == "prensa" else set()
        rel = 0
        for o in evs:
            if o is e or o["categoria"] != e["categoria"] or o.get("internacional") != e.get("internacional"):
                continue
            if abs(o["ts"] - e["ts"]) > max(ventana(e), ventana(o)):
                continue
            de, do = set(e["departamentos"]), set(o["departamentos"])
            if de and do and not (de & do):
                continue
            if (not de or not do) and not (e["origen"] in ("epidemiologia",) or o["origen"] in ("epidemiologia",)):
                continue
            if o["origen"] == "prensa" and e["origen"] == "prensa":
                continue                      # otra nota de prensa NO es el mismo hecho: solo cuenta si fue fusionada arriba
            fam.add(FAM.get(o["origen"], "Otra")); rel += 1
            if o["origen"] == "prensa":
                medios |= set()
        fuentes = len(fam - {"Prensa"}) + (max(len(medios), 1) if "Prensa" in fam else 0)
        niv = "Alta" if fuentes >= 3 else "Media" if fuentes == 2 else "Baja"
        e["confianza"] = {"nivel": niv, "familias": sorted(fam), "relacionados": rel, "medios": len(medios), "fuentes_independientes": fuentes, "puntaje": _puntaje_ev(fam, medios)}
    return evs


def geo_simplificado(geo, ruta):
    """Departamentos simplificados (para dibujar mapas SVG en las fichas, sin depender de internet)."""
    out = []
    for u in geo["dep"]:
        s = u["_s"].simplify(0.02, preserve_topology=True)
        polys = [s] if s.geom_type == "Polygon" else list(s.geoms)
        anillos = [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in polys if not p.is_empty]
        out.append({"n": u["n"], "r": anillos})
    json.dump(out, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def geo_geojson(geo, docs):
    """GeoJSON simplificado de departamentos y municipios para el mapa interactivo."""
    from shapely.geometry import mapping
    def fc(units, tol, props):
        feats = []
        for u in units:
            g = u["_s"].simplify(tol, preserve_topology=True)
            feats.append({"type": "Feature", "properties": props(u), "geometry": json.loads(json.dumps(mapping(g), separators=(",", ":")))})
        return {"type": "FeatureCollection", "features": feats}
    def redondear(o):
        if isinstance(o, list):
            return [redondear(x) for x in o]
        if isinstance(o, float):
            return round(o, 3)
        return o
    for nombre, units, tol, props in (("geo_dep.geojson", geo["dep"], 0.02, lambda u: {"n": u["n"]}), ("geo_mun.geojson", geo["mun"], 0.012, lambda u: {"n": u["n"], "d": u["d"]})):
        f = fc(units, tol, props)
        for ft in f["features"]:
            ft["geometry"]["coordinates"] = redondear(ft["geometry"]["coordinates"])
        json.dump(f, open(os.path.join(docs, nombre), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def actualizar(docs, geo=None, retener_dias=400):
    ubicar = None
    if geo:
        from shapely.geometry import Point
        def ubicar(lat, lon):
            p = Point(lon, lat)
            d = next((u["n"] for u in geo["dep"] if u["_s"].contains(p)), None)
            return d, None
        geo_simplificado(geo, os.path.join(docs, "geo_dep.json"))
        if not os.path.exists(os.path.join(docs, "geo_mun.geojson")):
            geo_geojson(geo, docs)
    ruta = os.path.join(docs, "eventos_unificados.json")
    previo = {e["id"]: e for e in _j(ruta, {}).get("eventos", [])}
    try:   # lo ya guardado también se depura (extranjero, no-eventos) y se reclasifica con las reglas vigentes
        import depurar
        for k in [k for k, e in previo.items() if e.get("origen") == "prensa" and depurar.revisar(e) is None]:
            del previo[k]
    except ImportError:
        pass
    nuevos = desde_prensa(docs, ubicar, geo) + desde_senamhi(docs) + desde_sismos(docs) + desde_focos(docs) + desde_complejos(docs) + desde_sequia(docs) + desde_caudales(docs) + desde_epi(docs) + desde_extra(docs)
    for e in nuevos:
        p = previo.get(e["id"])
        if p and e["origen"] == "prensa":   # un hecho que sigue recibiendo notas conserva su última actividad
            e["ts_ult"] = max(e.get("ts_ult", e["ts"]), p.get("ts_ult", p["ts"]))
        previo[e["id"]] = e
    lim = int(time.time() * 1000) - retener_dias * 86400000
    todos = sorted([e for e in previo.values() if e["ts"] >= lim], key=lambda e: -e["ts"])
    todos = sorted(fusion_semantica(todos), key=lambda e: -e["ts"])
    try:
        todos = sorted(fusion_embeddings(todos, docs), key=lambda e: -e["ts"])
    except Exception as ex:
        print("Triangulación por modelo de lenguaje falló (se conserva la de reglas): " + type(ex).__name__ + " " + str(ex)[:100])
    triangular(todos)
    json.dump({"generado": int(time.time() * 1000), "n": len(todos), "eventos": todos}, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    os.makedirs(os.path.join(docs, "datos"), exist_ok=True)
    with open(os.path.join(docs, "datos", "eventos_unificados.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "fecha_hora_La_Paz", "origen", "categoria", "titulo", "nivel", "oficial", "lugar", "departamentos", "lat", "lon", "fuente", "url", "cifras", "detalle"])
        for e in todos:
            w.writerow([e["id"], dt.datetime.fromtimestamp(e["ts"] / 1000, TZ).strftime("%Y-%m-%d %H:%M"), e["origen"], e["categoria"], e["titulo"], e["nivel_txt"], "sí" if e["oficial"] else "no",
                        e["lugar"], "; ".join(e["departamentos"]), e["lat"] if e["lat"] is not None else "", e["lon"] if e["lon"] is not None else "", e["fuente"], e["url"],
                        json.dumps(e["cifras"], ensure_ascii=False), (e["detalle"] or "")[:600]])
    por = {}
    for e in todos:
        por[e["origen"]] = por.get(e["origen"], 0) + 1
    return f"{len(todos)} eventos unificados ({', '.join(f'{k} {v}' for k, v in por.items())})"

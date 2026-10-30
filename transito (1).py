# -*- coding: utf-8 -*-
"""Tránsito y accidentes: detecta hechos viales en la prensa, une las notas que cuentan el MISMO hecho
y le asigna un nivel de confianza según cuántos medios independientes lo respaldan.
Salida: docs/transito.json (acumulativo) y docs/datos/transito_hechos.csv
Confianza: Alta = 3 o más medios distintos · Media = 2 · Baja = 1 (siempre 'preliminar': no hay fuente oficial abierta de Policía/ABC/SUMA)."""
import os, re, csv, json, time, hashlib, unicodedata, datetime as dt

TZ = dt.timezone(dt.timedelta(hours=-4))
DEPS = ["La Paz", "Cochabamba", "Santa Cruz", "Oruro", "Potosí", "Chuquisaca", "Tarija", "Beni", "Pando"]

_CHOQUE = r"accident|colisi|choqu|chocar|choco|vuelc|volcad|volco|embarranc|atropell|despist|despen|precipit|cayo a|cae a|cayeron a|siniestro vial|siniestro de transito|rodo"
_VIA = r"carretera|ruta|camino|\bvia\b|\bvias\b|transito|\bbus\b|omnibus|flota|minibus|micro\b|microbus|camion|cisterna|vehicul|motociclet|\bmoto\b|\bauto\b|automovil|volqueta|taxi|trufi|trailer|avenida|puente|conductor|chofer|pasajeros|autopista|curva|yungas|camioneta|vagoneta|motorizado|ciclista|peaton"
_EXCL = r"aeronave|avion|avioneta|helicopter|aereo|\btren\b|accidente cerebro|accidente laboral|accidente de trabajo|\bmina\b|minero|\bbote\b|lancha|barco|naufrag|getafe|toledo|madrid|espana|accidente nuclear|fuga|derrame|incendio de"


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t)).strip()


def clasificar(titulo, detalle=""):
    """Devuelve {'tipo','vehiculo','tramo'} si el texto describe un hecho de tránsito; si no, None."""
    t = norm(titulo)
    if not re.search(_CHOQUE, t) or not re.search(_VIA, t) or re.search(_EXCL, t):
        return None
    if re.search(r"vuelc|volcad|volco", t):
        tipo = "Vuelco"
    elif re.search(r"embarranc|barranco|despen|precipit|cayo a|cae a|cayeron a|rodo", t):
        tipo = "Caída a barranco / embarrancamiento"
    elif re.search(r"atropell", t):
        tipo = "Atropello"
    elif re.search(r"choqu|chocar|choco|colisi", t):
        tipo = "Choque / colisión"
    else:
        tipo = "Accidente (sin precisar)"
    if re.search(r"minibus|trufi|microbus|\bmicro\b", t):
        veh = "Minibús / micro"
    elif re.search(r"\bbus\b|omnibus|flota|pasajeros", t):
        veh = "Bus / flota"
    elif re.search(r"camion|cisterna|volqueta|trailer", t):
        veh = "Camión / carga"
    elif re.search(r"motociclet|\bmoto\b|motorizado", t):
        veh = "Motocicleta"
    elif re.search(r"ciclista|peaton", t):
        veh = "Peatón / ciclista"
    elif re.search(r"\bauto\b|automovil|camioneta|vagoneta|taxi|vehicul", t):
        veh = "Auto / camioneta"
    else:
        veh = "No precisado"
    m = re.search(r"(?:ruta|carretera|v[ií]a|camino)\s+(?:a|al|de|del|entre)?\s*((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)(?:\s*[-–a]\s*(?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+))?)", str(titulo or ""))
    return {"tipo": tipo, "vehiculo": veh, "tramo": m.group(1).strip() if m else ""}


_STOP = set("accidente accidentes deja dejan dejo heridos herido herida muertos muerto fallecidos fallecido carretera ruta camino bolivia una unos las los del por con tras entre sobre para como esta este que sus mas hay luego cinco cuatro tres dos graves grave persona personas video foto fotos ultima hora urgente atencion reportan reporta reportaron informa informan vehiculo vehiculos conductor chofer pasajeros".split())
# palabras que describen el MISMO hecho aunque el titular use otra palabra: se reducen a un concepto
_SINON = {"colision": "choque", "chocan": "choque", "choca": "choque", "choco": "choque", "chocaron": "choque", "triple": "choque", "frontal": "choque", "volcado": "vuelco", "volco": "vuelco", "volcadura": "vuelco",
          "quemado": "quemadura", "quemaduras": "quemadura", "quemaron": "quemadura", "incendio": "fuego", "llamas": "fuego", "cisternas": "cisterna", "camiones": "camion", "buses": "bus", "omnibus": "bus", "flota": "bus"}
_GEN = {"oruro", "potosi", "paz", "cruz", "santa", "cochabamba", "tarija", "beni", "pando", "chuquisaca", "bolivia", "carret", "ruta", "choque", "vuelco", "fuego", "bus", "camion", "cisterna", "quemadura", "terapia", "intensiva", "evacuan", "bomberos", "controlan", "complica", "circulacion", "congestionamiento", "tercer", "grado", "cuerpo", "lucha", "vida"}


_PREF = (("colisi", "choque"), ("choqu", "choque"), ("chocar", "choque"), ("volc", "vuelco"), ("vuelc", "vuelco"), ("quemad", "quemadura"), ("quemar", "quemadura"), ("quemadur", "quemadura"),
         ("incendi", "fuego"), ("cistern", "cisterna"), ("camion", "camion"), ("omnibus", "bus"))


def _stem(w):
    w = _SINON.get(w, w)
    for p, r in _PREF:
        if w.startswith(p):
            return r
    return w[:6] if len(w) > 6 else w


def _toks(t):
    return {_stem(w) for w in norm(t).split() if len(w) >= 4 and w not in _STOP}


def _ents(t):
    """Nombres propios / lugares del titular (palabras con mayúscula que no están al inicio): sirven para decir 'es el mismo hecho'."""
    out = set()
    for i, w in enumerate(re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}", str(t or ""))):
        if w[0].isupper() and norm(w) not in _STOP and norm(w) not in {"santa", "cruz", "paz", "oruro", "potosi", "cochabamba", "tarija", "beni", "pando", "chuquisaca", "bolivia", "carretera", "accidente", "choque", "atencion", "video", "muere", "mueren"}:
            out.add(_stem(norm(w)))
    return out


def _sim(a, b):
    if not a or not b:
        return 0
    return len(a & b) / min(len(a), len(b))


def _compat(da, db):
    """Departamentos compatibles: comparten alguno, o alguno de los dos no está identificado."""
    return not da or not db or bool(da & db)


def _tramo(t):
    m = re.search(r"([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)\s*[-–]\s*([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)", str(t or ""))
    return frozenset({norm(m.group(1)), norm(m.group(2))}) if m else frozenset()


_TIPOS_FUERTES = ("vuelc", "volcad", "atropell", "barranco", "embarranc")


def norm_tit_igual(g, tk):
    return any(tk == t for t in g.get("tks", []))


def _mismo(g, n, tk, es, dp, tr=frozenset()):
    """¿La nota n cuenta el mismo hecho que el grupo g? Palabras, nombres propios, tramo, consecuencias, departamento y tiempo."""
    dt_ = abs(g["ts"] - n["ts"])
    if dt_ > 72 * 3600000 or not _compat(g["dep"], dp):
        return False
    if tr and g["trs"] and tr not in g["trs"]:                       # tramos de carretera distintos: son hechos distintos
        return False
    comun = g["tk"] & tk
    esp = {w for w in comun if w not in _GEN}          # palabras en común que NO son genéricas
    distintos = bool(g["es"] and es and not (g["es"] & es))   # nombres propios distintos (p. ej. Diablada vs Pisiga)
    ent = g["es"] & es                                 # nombres propios en común (no lugares)
    s = _sim(g["tk"] - _GEN, tk - _GEN)
    if ent and (len(comun) >= 2 or s >= 0.3):
        return True
    if not distintos and dt_ <= 30 * 3600000 and len(comun - _GEN) >= 2 and _sim(g["tk"], tk) >= 0.8:      # titulares casi idénticos
        return True
    if not distintos and dt_ <= 30 * 3600000 and len(comun) >= 3 and norm_tit_igual(g, tk):
        return True
    if not distintos and s >= 0.5 and len(esp) >= 2:
        return True
    # mismo suceso narrado con otras palabras: misma consecuencia característica (cisterna / quemaduras / fuego)
    if len(comun & {"cisterna", "quemadura", "fuego"}) >= 2:
        return True
    # mismo vehículo distintivo (cisterna; camión + ómnibus) el mismo día y departamento compatible
    if dt_ <= 36 * 3600000 and ("cisterna" in comun or {"camion", "bus"} <= comun):
        return True
    # mismo tramo de carretera, mismo día y sin tipos de accidente contradictorios
    if dt_ <= 24 * 3600000 and tr and tr in g["trs"]:
        return True
    return False


def _deps(e):
    """Departamentos que menciona el TITULAR (sin el nombre del medio: 'El Potosí' no es Potosí; 'Alto Beni' es de La Paz)."""
    t = re.sub(r"alto beni", " ", _limpio(e.get("titulo")).lower())
    return {d for d in DEPS if d.lower() in t}


def _deps_blando(e):
    return {d for d in DEPS if d.lower() in str(e.get("lugar") or "").lower()}


def _limpio(t):
    return re.sub(r" - [^-]+$", "", str(t or "")).strip()


def _fmt(ms):
    return dt.datetime.fromtimestamp(ms / 1000, TZ).strftime("%Y-%m-%d %H:%M")


def _firma(n):
    ti = _limpio(n["titulo"])
    return _toks(ti), _ents(ti), _deps(n), _tramo(ti)


def _unir(a, b):
    a["notas"] += b["notas"]; a["tk"] |= b["tk"]; a["es"] |= b["es"]; a["dep"] |= b["dep"]; a["trs"] |= b["trs"]; a["tks"] += b["tks"]; a["ts"] = min(a["ts"], b["ts"])


def agrupar(notas):
    """Une notas del mismo hecho (palabras, nombres propios, tramo, consecuencias, departamento y tiempo) y fusiona los grupos que resultan ser el mismo hecho."""
    grupos = []
    for n in sorted(notas, key=lambda x: x["ts"]):
        tk, es, dp, tr = _firma(n)
        for g in grupos:
            if _mismo(g, n, tk, es, dp, tr):
                g["notas"].append(n); g["tks"].append(tk); g["tk"] |= tk; g["es"] |= es; g["dep"] |= dp
                if tr: g["trs"].add(tr)
                break
        else:
            grupos.append({"ts": n["ts"], "tk": set(tk), "es": set(es), "dep": set(dp), "trs": {tr} if tr else set(), "tks": [tk], "notas": [n]})
    cambio = True
    while cambio:  # segunda pasada: la nota 'puente' llegó después
        cambio = False
        for i in range(len(grupos)):
            for j in range(i + 1, len(grupos)):
                a, b = grupos[i], grupos[j]
                if any(_mismo(a, n, *_firma(n)) for n in b["notas"]):
                    _unir(a, b); del grupos[j]; cambio = True
                    break
            if cambio:
                break
    return grupos


def _hecho(g):
    ns = sorted(g["notas"], key=lambda x: x["ts"])
    cls = next((c for c in (clasificar(_limpio(n["titulo"])) for n in ns) if c), None) or {"tipo": "", "vehiculo": "", "tramo": ""}
    medios = sorted({(n.get("fuente") or "").strip() for n in ns if (n.get("fuente") or "").strip()})
    vf = sorted({n.get("fall") or 0 for n in ns if (n.get("fall") or 0) > 0})
    vh = sorted({n.get("her") or 0 for n in ns if (n.get("her") or 0) > 0})
    rep = max(ns, key=lambda n: ((n.get("lat") is not None), n.get("nivel") or 0, -n["ts"]))
    lat = lon = None
    lugar, metodo = "", "sin ubicar"
    for n in ns:
        if n.get("lat") is not None:
            lat, lon, lugar, metodo = n["lat"], n["lon"], n.get("lugar") or "", n.get("metodo") or ""
            break
    cuenta = {}
    por_titulo = any(_deps(n) for n in ns)
    for n in ns:
        for d in (_deps(n) if por_titulo else _deps_blando(n)):
            cuenta[d] = cuenta.get(d, 0) + 1
    dep_h = max(cuenta, key=lambda d: (cuenta[d], -DEPS.index(d))) if cuenta else ""
    nm = len(medios)
    conf = "Alta" if nm >= 3 else "Media" if nm == 2 else "Baja"
    razon = (f"{nm} medios distintos cuentan el mismo hecho" if nm > 1 else "Un solo medio lo reporta") + "; sin confirmación de Policía/SUMA/ABC (no hay fuente oficial abierta)."
    if len(vf) > 1 or len(vh) > 1:
        razon += " Los medios difieren en las cifras (se muestra el máximo)."
    enl, vistos = [], set()
    for n in ns:
        u = n.get("url") or ""
        k = (n.get("fuente"), _limpio(n["titulo"])[:40])
        if u.startswith("http") and k not in vistos:
            vistos.add(k); enl.append({"medio": n.get("fuente") or "", "titulo": _limpio(n["titulo"]), "url": u, "ts": n["ts"]})
    hid = "transito:" + hashlib.md5(min(str(n["id"]) for n in ns).encode()).hexdigest()[:10]
    return {"id": hid, "ts": ns[0]["ts"], "ultima_nota": ns[-1]["ts"], "titulo": _limpio(rep["titulo"]), "tipo": cls["tipo"], "vehiculo": cls["vehiculo"], "tramo": cls["tramo"],
            "departamento": dep_h, "lugar": lugar or dep_h, "lat": lat, "lon": lon, "metodo_ubicacion": metodo,
            "fallecidos": max(vf) if vf else 0, "heridos": max(vh) if vh else 0, "cifras_discrepantes": len(vf) > 1 or len(vh) > 1,
            "medios": medios, "n_medios": nm, "n_notas": len(ns), "confianza": {"nivel": conf, "razon": razon}, "enlaces": enl[:8],
            "notas": [{"id": str(n["id"]), "ts": n["ts"], "medio": n.get("fuente") or "", "titulo": _limpio(n["titulo"]), "url": n.get("url") or "", "fall": n.get("fall") or 0, "her": n.get("her") or 0} for n in ns]}


def actualizar(docs, notas, geo=None):
    """notas: lista de notas de prensa (dict con id, ts, fuente, titulo, url, fall, her, lat, lon, lugar, metodo, nivel)."""
    viales = [n for n in notas if clasificar(_limpio(n.get("titulo")))]
    ruta = os.path.join(docs, "transito.json")
    try:
        previo = json.load(open(ruta, encoding="utf-8")).get("hechos", [])
    except Exception:
        previo = []
    pool = {str(n["id"]): n for n in viales}
    for h in previo:  # notas de corridas anteriores: se conservan para no perder historial ni medios
        for e in h.get("notas", []):
            if e["id"] not in pool:
                pool[e["id"]] = {"id": e["id"], "ts": e["ts"], "fuente": e.get("medio"), "titulo": e.get("titulo"), "url": e.get("url"), "fall": e.get("fall"), "her": e.get("her"),
                                 "lat": h.get("lat"), "lon": h.get("lon"), "lugar": h.get("lugar"), "metodo": h.get("metodo_ubicacion"), "nivel": 1}
    hechos = [_hecho(g) for g in agrupar(list(pool.values()))]
    lim = int(time.time() * 1000) - 400 * 86400000
    hechos = sorted([h for h in hechos if h["ts"] >= lim], key=lambda h: -h["ts"])
    ahora = int(time.time() * 1000)
    h7 = [h for h in hechos if h["ts"] >= ahora - 7 * 86400000]
    res = {"hechos_24h": sum(1 for h in hechos if h["ts"] >= ahora - 86400000), "hechos_7d": len(h7), "fallecidos_7d": sum(h["fallecidos"] for h in h7), "heridos_7d": sum(h["heridos"] for h in h7),
           "alta_7d": sum(1 for h in h7 if h["confianza"]["nivel"] == "Alta")}
    json.dump({"generado": ahora, "n": len(hechos), "resumen": res, "metodo": "Detección por palabras clave en titulares de prensa boliviana; agrupación de notas del mismo hecho; confianza = número de medios distintos.", "hechos": hechos},
              open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    os.makedirs(os.path.join(docs, "datos"), exist_ok=True)
    with open(os.path.join(docs, "datos", "transito_hechos.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "fecha_hora_La_Paz", "titulo", "tipo", "vehiculo", "tramo", "departamento", "lugar", "lat", "lon", "fallecidos", "heridos", "cifras_discrepantes", "confianza", "n_medios", "medios", "n_notas", "enlaces"])
        for h in hechos:
            w.writerow([h["id"], _fmt(h["ts"]), h["titulo"], h["tipo"], h["vehiculo"], h["tramo"], h["departamento"], h["lugar"], h["lat"] if h["lat"] is not None else "", h["lon"] if h["lon"] is not None else "",
                        h["fallecidos"], h["heridos"], "sí" if h["cifras_discrepantes"] else "no", h["confianza"]["nivel"], h["n_medios"], "; ".join(h["medios"]), h["n_notas"], " | ".join(e["url"] for e in h["enlaces"])])
    return f"{len(hechos)} hechos de tránsito ({res['hechos_24h']} en 24 h, {res['hechos_7d']} en 7 días; {res['alta_7d']} con confianza alta)"

# -*- coding: utf-8 -*-
"""Alertas oficiales del SENAMHI (avisos hidrológicos) -> docs/senamhi_alertas.json
Fuente: https://www.senamhi.gob.bo/alertas2.php (tabla pública) + PDF de cada aviso.
No inventa nada: copia título, nivel (AMARILLO/NARANJA/ROJO) y fechas de la tabla; del PDF solo extrae
departamentos, ríos y poblaciones citados. Si algo falla, conserva lo ya guardado."""
import re, io, os, ssl, json, time, datetime, urllib.request, urllib.parse

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
BASE = "https://www.senamhi.gob.bo/"
DEPS = ["La Paz", "Cochabamba", "Santa Cruz", "Beni", "Pando", "Oruro", "Potosí", "Chuquisaca", "Tarija"]
NIV = {"AMARILLO": 1, "NARANJA": 2, "ROJO": 3}


def _get(url, n=3, t=60):
    err = ""
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=t, context=ssl.create_default_context()) as r:
                return r.read()
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:80]
            if "404" in err:
                break
            time.sleep(4)
    raise RuntimeError(err)


def _limpia(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()


def tabla():
    h = _get(BASE + "alertas2.php").decode("utf-8", "ignore")
    out = []
    for f in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S | re.I):
        c = [_limpia(x) for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", f, re.S | re.I)]
        m = re.search(r'href=["\']([^"\']*pdf_alertas/[^"\']+)', f)
        if len(c) >= 5 and m and c[4].upper() in NIV:
            out.append({"publicada": c[0], "inicio": c[1], "fin": c[2], "titulo": c[3].replace("AAVISO", "AVISO"), "nivel": c[4].upper(),
                        "pdf": urllib.parse.urljoin(BASE, m.group(1).replace(" ", "%20"))})
    return out


def leer_pdf(url):
    from pypdf import PdfReader
    d = _get(url)
    r = PdfReader(io.BytesIO(d))
    txt = "\n".join((p.extract_text() or "") for p in r.pages)
    # quita membretes repetidos
    txt = re.sub(r"MINISTERIO DE PRODUCCI.{0,600}?La Paz\s*[–-]\s*Bolivia", " ", txt, flags=re.S)
    plano = re.sub(r"\s+", " ", txt)
    deps = [d for d in DEPS if re.search(r"Departamento de " + d, plano, re.I)]
    rios = sorted(set(re.sub(r"\s+", " ", x).strip(" ,.") for x in re.findall(r"R[ií]o ([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)", plano)))
    pobl = []
    for m in re.finditer(r"poblaciones de ?:([^➢✓]{5,300})|poblados de ?:([^➢✓]{5,300})|pobladas? de ?:([^➢✓]{5,300})", plano):
        pobl.append(re.sub(r"\s+", " ", (m.group(1) or m.group(2) or m.group(3))).strip(" .,"))
    defin = ""
    m = re.search(r"DEFINICI[ÓO]N DE LA AMENAZA(.{0,900})", plano)
    if m:
        defin = m.group(1).strip()
    cuerpo = plano[:60000]
    return {"departamentos": deps, "rios": rios[:40], "poblaciones": pobl[:25], "definicion": defin[:700], "texto": cuerpo[:6000]}



# ------------------------------------------------------------------ AVISOS METEOROLÓGICOS (consulta pública de la app del SENAMHI)
URL_METEO = "https://senab.senamhi.gob.bo/api/forecastweather/datatable"
URL_VER = "https://sena.senamhi.gob.bo/public/forecast-public-reports/"


def _post_meteo(cuerpo):
    # el servidor de esta aplicación solo acepta TLS 1.2
    err = ""
    for i in range(3):
        c = ssl.create_default_context()
        c.maximum_version = ssl.TLSVersion.TLSv1_2
        try:
            rq = urllib.request.Request(URL_METEO, data=json.dumps(cuerpo).encode(), method="POST",
                                        headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"})
            with urllib.request.urlopen(rq, timeout=120, context=c) as r:
                return json.loads(r.read())
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:80]
            time.sleep(5)
    raise RuntimeError(err)


def _nivel_texto(nombre):
    n = (nombre or "").upper()
    return "ROJO" if n.startswith("ROJ") else "NARANJA" if n.startswith("NARAN") else "AMARILLO" if n.startswith("AMAR") else n


def _zonas(poligono, geo):
    """Departamentos y municipios que cruza el polígono del aviso (límites geoBoundaries)."""
    from shapely.geometry import shape
    g = shape(poligono)
    if not g.is_valid:
        g = g.buffer(0)
    g = g.simplify(0.005)
    if g.is_empty or g.area == 0:
        return [], [], 0
    deps = []
    for u in geo["dep"]:
        if u["_s"].intersects(g) and u["_s"].intersection(g).area / g.area >= 0.02:
            deps.append((u["_s"].intersection(g).area, u["n"]))
    muns = []
    for u in geo["mun"]:
        s = u["_s"]
        if s.intersects(g):
            a = s.intersection(g).area
            if a / s.area >= 0.2 or a / g.area >= 0.05:
                muns.append((a, u["n"] + " (" + u["d"] + ")"))
    deps = [n for a, n in sorted(deps, reverse=True)]
    muns = [n for a, n in sorted(muns, reverse=True)]
    return deps, muns[:60], len(muns)


def avisos_meteo(previo, geo, limite=12):
    """Lee los últimos avisos meteorológicos APROBADOS (lista pública). Devuelve lista de dicts en el mismo formato que los hidrológicos."""
    j = _post_meteo({"offset": 0, "limit": limite, "order": None, "query": {}, "type": "Aprobado"})
    hoy = datetime.date.today().isoformat()
    out = []
    for r in j.get("data", []):
        if not r.get("enable", True):
            continue
        clave = URL_VER + str(r["id"])
        a = dict(previo.get(clave, {}))
        ini, fin = (r.get("date") or ["", ""])[:2]
        nivel = _nivel_texto((r.get("ForecastTypeAlert") or {}).get("alertType"))
        fen = (r.get("ForecastTypeEvent") or {}).get("eventType", "")
        pub = (r.get("publicationDate") or r.get("audCreatedAt") or "").replace("T", " ")[:19]
        a.update({"tipo": "meteorológica", "publicada": pub, "inicio": ini, "fin": fin, "nivel": nivel, "fenomeno": fen,
                  "titulo": f"AVISO METEOROLÓGICO N° {r['code']} — {fen}", "pdf": clave, "url": clave,
                  "descripcion": re.sub(r"\s+", " ", r.get("description") or "").strip()})
        if geo and "departamentos" not in a:
            try:
                d, m, n = _zonas(r["dropArea"], geo)
                a.update({"departamentos": d, "municipios": m, "n_municipios": n})
            except Exception as e:
                a["error_zonas"] = type(e).__name__ + ": " + str(e)[:60]
        a["texto"] = a.get("descripcion", "")
        out.append(a)
    return out


def actualizar(docs, max_nuevos=60, geo=None):
    ruta = os.path.join(docs, "senamhi_alertas.json")
    previo = {}
    if os.path.exists(ruta):
        try:
            for a in json.load(open(ruta, encoding="utf-8")).get("alertas", []):
                previo[a["pdf"]] = a
        except Exception:
            pass
    filas = tabla()
    hoy = datetime.date.today().isoformat()
    alertas, nuevos, fallos = [], 0, 0
    for f in filas:
        a = dict(previo.get(f["pdf"], {}))
        a.update(f)
        if "texto" not in a and nuevos < max_nuevos:
            try:
                a.update(leer_pdf(f["pdf"]))
                nuevos += 1
            except Exception as e:
                a["error_pdf"] = str(e)[:80]
                fallos += 1
        m = re.search(r"N°\s*(\d+)\s*/\s*(\d+)", f["titulo"])
        a["numero"] = f"{int(m.group(1))}/{m.group(2)}" if m else ""
        a["vigente"] = f["fin"] >= hoy
        a["nivel_num"] = NIV[f["nivel"]]
        alertas.append(a)
    n_meteo, err_meteo = 0, ""
    try:
        for a in avisos_meteo(previo, geo):
            m = re.search(r"N°\s*(\d+)\s*/\s*(\d+)", a["titulo"])
            a["numero"] = f"{int(m.group(1))}/{m.group(2)}" if m else ""
            a["vigente"] = a["fin"] >= hoy
            a["nivel_num"] = NIV.get(a["nivel"], 0)
            alertas.append(a); n_meteo += 1
    except Exception as e:
        err_meteo = type(e).__name__ + ": " + str(e)[:80]
        # conserva los meteorológicos ya guardados si falla la consulta
        alertas += [dict(v, vigente=v.get("fin", "") >= hoy) for v in previo.values() if v.get("tipo") == "meteorológica"]
    alertas.sort(key=lambda x: x["publicada"], reverse=True)
    json.dump({"actualizado": datetime.datetime.utcnow().isoformat() + "Z", "fuente": BASE + "alertas2.php", "alertas": alertas},
              open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return (f"{len(alertas)} avisos, {sum(1 for a in alertas if a['vigente'])} vigentes, {nuevos} PDF nuevos leídos, {fallos} PDF con error; "
            f"meteorológicos leídos: {n_meteo}" + (f" (ERROR: {err_meteo})" if err_meteo else ""))


if __name__ == "__main__":
    print(actualizar("docs"))


def avisar_nuevos(docs, avisar, url_tablero=""):
    """Envía a Slack cada aviso nuevo (cualquier color) una sola vez. Los ya vencidos se marcan sin avisar."""
    ruta = os.path.join(docs, "senamhi_alertas.json")
    est_ruta = os.path.join(docs, "estado_senamhi.json")
    est = json.load(open(est_ruta)) if os.path.exists(est_ruta) else {"avisados": []}
    data = json.load(open(ruta, encoding="utf-8"))
    emo = {"AMARILLO": ":large_yellow_circle:", "NARANJA": ":large_orange_circle:", "ROJO": ":red_circle:"}
    n = 0
    for a in sorted(data["alertas"], key=lambda x: x["publicada"]):
        if a["pdf"] in est["avisados"]:
            continue
        est["avisados"].append(a["pdf"])
        if not a.get("vigente"):
            continue
        lugares = ", ".join(a.get("departamentos") or []) or "ver aviso"
        if a.get("tipo") == "meteorológica":
            muni = a.get("municipios") or []
            txt = (f"{emo.get(a['nivel'], '')} *ALERTA OFICIAL SENAMHI — {a['nivel']}* · Aviso meteorológico N° {a['numero']}\n"
                   f"*{a.get('fenomeno', '')}* · Vigencia: {a['inicio']} al {a['fin']}\n"
                   f"Departamentos: {lugares}" + (f" · Municipios (algunos): {', '.join(muni[:8])}" if muni else "") + "\n"
                   f"{a.get('descripcion', '')[:400]}\nAviso oficial: {a['url']}\n_Fuente oficial (SENAMHI)._")
        else:
            ríos = ", ".join((a.get("rios") or [])[:8])
            txt = (f"{emo.get(a['nivel'], '')} *ALERTA OFICIAL SENAMHI — {a['nivel']}* · Aviso hidrológico N° {a['numero']}\n"
                   f"Vigencia: {a['inicio']} al {a['fin']} · Departamentos: {lugares}\n"
                   + (f"Ríos citados: {ríos}\n" if ríos else "")
                   + f"{a['titulo']}\nPDF oficial: {a['pdf']}\n_Fuente oficial (SENAMHI)._")
        avisar(txt)
        n += 1
    json.dump(est, open(est_ruta, "w"), ensure_ascii=False)
    return n

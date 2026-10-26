# -*- coding: utf-8 -*-
"""Pronóstico SENAMHI de condiciones atmosféricas para propagación de incendios forestales (Boletín Nacional de Focos de Calor).
Fuente: https://senamhi.gob.bo/index.php/meteorologia/focos-calor  (PDF diario, días hábiles).
OJO: es un PRONÓSTICO de condiciones favorables a la propagación (propensión: Poco Propensa / Propensa / Muy Propensa),
no un conteo de incendios ni una declaratoria. El propio SENAMHI lo aclara. Salida: docs/focos_propension.json"""
import re, io, os, ssl, json, time, datetime, urllib.request, urllib.parse

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
PAGINA = "https://senamhi.gob.bo/index.php/meteorologia/focos-calor"
DEPS = ["SANTA CRUZ", "LA PAZ", "COCHABAMBA", "CHUQUISACA", "TARIJA", "PANDO", "BENI", "ORURO", "POTOSI", "POTOSÍ"]
LABEL = re.compile(r"(Muy Propensa|Poco Propensa|Propensa)\s*$", re.I)


def _get(u, n=3, t=90):
    err = ""
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=t, context=ssl.create_default_context()) as r:
                return r.read()
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:70]
            if "404" in err:
                break
            time.sleep(4)
    raise RuntimeError(err)


MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]


def ultimo_pdf():
    """Busca en la página la fecha más reciente y arma la dirección con el patrón oficial de carpetas."""
    h = _get(PAGINA).decode("utf-8", "ignore")
    fechas = sorted(set(re.findall(r"Pron_Focos_Bolivia_(\d{8})", h)), reverse=True)
    if not fechas:
        raise RuntimeError("no se encontraron boletines de focos de calor")
    f = fechas[0]
    a, m = f[:4], int(f[4:6])
    return f, f"https://senamhi.gob.bo/focoscalor/{a}/FC_{m}_{MESES[m-1]}_{a}/Pron_Focos_Bolivia_{f}.pdf"


def parsear(texto):
    """Devuelve {fecha_iso: [ {departamento, region, propension, tmax, hr, viento} ]}"""
    out, fecha, dep = {}, None, None
    for ln in texto.splitlines():
        ln = ln.strip()
        m = re.search(r"incendios forestales\s+(\d{2})/(\d{2})/(\d{4})", ln, re.I)
        if m:
            fecha, dep = f"{m.group(3)}-{m.group(2)}-{m.group(1)}", None
            out[fecha] = []
            continue
        if not fecha or not ln:
            continue
        if "Aviso Meteorol" in ln:
            break
        lab = LABEL.search(ln)
        # línea con solo el departamento (p. ej. "BENI")
        for d in DEPS:
            if ln == d:
                dep = d
                break
        if not lab:
            continue
        cuerpo = ln[:lab.start()].strip()
        for d in DEPS:
            if cuerpo.startswith(d + " "):
                dep, cuerpo = d, cuerpo[len(d):].strip()
                break
        m2 = re.match(r"([A-ZÁÉÍÓÚÑ ]+?)\s+(\d.*)$", cuerpo)
        if not m2 or not dep:
            continue
        region, nums = m2.group(1).strip(), re.findall(r"\d+", m2.group(2))
        out[fecha].append({"departamento": dep.title().replace("Potosi", "Potosí"), "region": region.title().replace(" De ", " de ").replace("Tropico", "Trópico"), "propension": lab.group(1).title(),
                           "tmax": [int(x) for x in nums[:2]], "hr": [int(x) for x in nums[2:4]], "viento_kmh": [int(x) for x in nums[4:6]]})
    return {k: v for k, v in out.items() if v}


def actualizar(docs, avisar=None):
    from pypdf import PdfReader
    ruta = os.path.join(docs, "focos_propension.json")
    est = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {}
    f, url = ultimo_pdf()
    if est.get("boletin") == f:
        return f"boletín {f} ya procesado"
    d = _get(url, t=120)
    r = PdfReader(io.BytesIO(d))
    texto = "\n".join((p.extract_text() or "") for p in r.pages)
    dias = parsear(texto)
    if not dias:
        raise RuntimeError("no se pudo leer la tabla del boletín (¿cambió el formato?)")
    muy = {dia: [f"{x['region']} ({x['departamento']})" for x in v if x["propension"] == "Muy Propensa"] for dia, v in dias.items()}
    n_alta = sum(len(v) for v in muy.values())
    nuevo = {"boletin": f, "url": url, "actualizado": datetime.datetime.utcnow().isoformat() + "Z", "pagina": PAGINA, "dias": dias, "muy_propensa": muy,
             "aclaracion": "Pronóstico de condiciones favorables a la propagación; no es conteo de incendios ni declaratoria oficial (SENAMHI)."}
    primera = not est
    json.dump(nuevo, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if avisar:
        lineas = [f"• {dia}: " + (", ".join(v) if v else "ninguna región en 'Muy Propensa'") for dia, v in sorted(muy.items())]
        avisar(":fire: *Pronóstico SENAMHI — condiciones para propagación de incendios forestales*" + (" (primer boletín leído)" if primera else "") + "\n"
               + "\n".join(lineas) + f"\nBoletín: {url}\n_Es un pronóstico de condiciones, no un conteo de incendios ni una declaratoria oficial._")
    return f"boletín {f}: {sum(len(v) for v in dias.values())} filas, {len(dias)} días, {n_alta} registros 'Muy Propensa'"

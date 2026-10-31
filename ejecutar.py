# -*- coding: utf-8 -*-
"""Orquestador de la Sala de Situación (se ejecuta en GitHub Actions cada 30 min).
1) Descarga los eventos del motor (Apps Script) -> docs/data.json (alimenta el tablero)
2) Genera PDF: inmediato (hechos con víctimas o nivel rojo), diario, semanal, o por solicitud
3) Avisa a Slack con el enlace al PDF
Variables: DATOS_URL (secreto), SLACK_WEBHOOK (secreto), MODO/HORAS (solo ejecución manual), DATOS_FILE (pruebas)
"""
import os, sys, json, time, urllib.request, urllib.parse, datetime as dt
from reporte_pdf import cargar_geo, build, agrupar_hechos

DOCS = "docs"
REP = os.path.join(DOCS, "reportes")
TZ = dt.timezone(dt.timedelta(hours=-4))  # America/La_Paz
HORA_DIARIO = 7
ESTADO = os.path.join(DOCS, "estado.json")


def log(m):
    print(m, flush=True)


def cargar_datos():
    f = os.environ.get("DATOS_FILE")
    if f:
        return json.load(open(f, encoding="utf-8"))
    url = os.environ.get("DATOS_URL", "").strip()
    if not url:
        log("ERROR: falta el secreto DATOS_URL"); sys.exit(1)
    p = urllib.parse.urlsplit(url)
    q = dict(urllib.parse.parse_qsl(p.query)); q["dias"] = "30"
    url = urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, urllib.parse.urlencode(q), ""))
    ult = None
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sala-situacion"})
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.loads(r.read().decode("utf-8"))
            if "eventos" not in d:
                raise ValueError("respuesta sin eventos: " + str(d.get("error", "?")))
            return d
        except Exception as e:  # no imprimir la URL (contiene la clave)
            ult = type(e).__name__ + ": " + str(e)[:120].replace(url, "[url]")
            time.sleep(5 * (i + 1))
    log("ERROR al descargar los datos del motor: " + str(ult)); sys.exit(1)


MEDIOS_BO = ["red uno", "el deber", "el dia", "los tiempos", "opinion", "la razon", "vision 360", "el diario", "brujula digital", "pagina siete",
             "unitel", "atb", "bolivia verifica", "el alteno", "el mundo bolivia", "correo del sur", "erbol", "radio fides", "fides", "panamericana", "abi",
             "agencia boliviana", "la patria", "el potosi", "eju", "oxigeno", "urgente.bo", "ahora el pueblo", "bolivia tv", "bolivia", "cambio", "la region",
             "el periodico", "sol de pando", "el nuevo dia", "opinion bolivia", "el pais", "la voz de tarija", "el tribuno", "bolivision", "tv universitaria"]
EXTRANJERO = ["pensilvania", "pennsylvania", "texas", "nueva york", "california", "florida", "canada", "ontario", "estados unidos", "ee. uu", "ee.uu", "europa", "espana", "paris", "londres", "india", "china", "japon", "filipinas", "nigeria", "congo", "uganda", "sudan", "arabia", "cuba", "habana", "dominicana", "santo domingo", "puerto rico", "mexico", "guatemala", "honduras", "el salvador", "nicaragua", "costa rica",
              "panama", "colombia", "venezuela", "ecuador", "peru", "lima", "argentina", "buenos aires", "chile", "santiago de chile", "paraguay", "uruguay", "brasil",
              "haiti", "jamaica", "estados unidos", "eeuu", "nueva york", "washington", "florida", "texas", "california", "canada", "espana", "madrid", "barcelona", "malaga", "andalucia", "sevilla", "granada", "alicante", "murcia", "galicia", "cataluna", "zaragoza", "bilbao", "marbella", "mallorca", "tenerife", "ibiza", "canarias", "alhaurin", "guardia civil", "comunidad de madrid", "castilla", "asturias", "navarra", "pais vasco",
              "francia", "paris", "italia", "alemania", "reino unido", "londres", "portugal", "rusia", "ucrania", "israel", "gaza", "libano", "siria", "turquia",
              "iran", "irak", "afganistan", "pakistan", "india", "bangladesh", "nepal", "china", "japon", "corea", "filipinas", "indonesia", "tailandia", "vietnam",
              "australia", "nigeria", "kenia", "sudan", "egipto", "marruecos", "argelia", "etiopia", "congo", "sudafrica", "somalia", "yemen", "myanmar", "taiwan"]
EXCLUIDOS = []


AMBIGUOS = ("la razon", "el pais", "el mundo", "el periodico", "la vanguardia", "abc", "el dia", "la voz", "el tribuno", "la region", "cambio", "opinion", "el nuevo dia")
LUGARES_BO = [" la paz ", " el alto ", " cochabamba ", " santa cruz ", " oruro ", " potosi ", " sucre ", " tarija ", " beni ", " trinidad ", " pando ", " cobija ", " chuquisaca ",
              " caranavi ", " yungas ", " chapare ", " quillacollo ", " sacaba ", " montero ", " warnes ", " yacuiba ", " villazon ", " uyuni ", " riberalta ", " guayaramerin ", " cochabambino", " paceno", " cruceno", " boliviano", " boliviana", " senamhi ", " sernap", " abc bolivia"]


def es_extranjero(e):
    """Hecho NO boliviano: sin coordenadas, sin la palabra 'Bolivia' y sin ser de un medio boliviano de la lista, o que nombra un país o ciudad extranjera."""
    import re
    t = " " + re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", _n(e.get("titulo", "") + " " + e.get("detalle", "")))) + " "
    f = _n(e.get("fuente", ""))
    # medio con dominio de otro país (.pe, .ar, .cl, .br…): solo se acepta si el texto nombra un lugar boliviano concreto
    if re.search(r"\.(pe|ar|cl|br|co|mx|ec|py|uy|ve|es|cu|do|gt|hn|sv|ni|cr|pa|us|uk|fr|it|de)(\s|$)", f) and not any(k in t for k in LUGARES_BO):
        return True
    if " bolivia " in t or " bolivian" in t or "bolivia" in f:
        return False
    if any(" " + k + " " in t for k in EXTRANJERO):
        return True
    if e.get("lat") is not None:  # con coordenadas y sin nombrar otro país: se acepta
        return False
    if f.startswith("registro"):  # registro abierto: lo ingresan personas; ya se revisó que no nombre otro país
        return False
    if f in AMBIGUOS and not any(k in t for k in LUGARES_BO):  # mismo nombre que un medio de otro país: exige un lugar boliviano
        return True
    if re.search(r"\.bo(\s|$)", f) or f in ("eju.tv", "lostiempos.com", "correodelsur.com", "brujuladigital.net", "elpotosi.net"):
        return False
    return not any(f == m or f.startswith(m + " ") or (" " + m) in f for m in MEDIOS_BO)


def relevante(e):
    """Descarta ruido de prensa: titulares sin relación con amenazas, y nivel 0 sin ubicación ni víctimas."""
    if e.get("tipo") == "sin clasificar":
        return False
    if es_extranjero(e):
        EXCLUIDOS.append(e.get("titulo", "")[:90])
        return False
    return e["nivel"] >= 1 or e.get("lat") is not None or (e.get("fall") or 0) > 0 or (e.get("her") or 0) > 0


def _n(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


def filtrar_busqueda(evs, q):
    """Reporte por evento: deja solo los eventos cuyo título, detalle o lugar contienen todas las palabras de q."""
    ps = [_n(x) for x in q.split() if len(x) >= 3]
    return [e for e in evs if all(p in _n(" ".join([e.get("titulo", ""), e.get("detalle", ""), e.get("lugar", "")])) for p in ps)]


def avisar(texto):
    wh = os.environ.get("SLACK_WEBHOOK", "").strip()
    if not wh:
        log("(sin SLACK_WEBHOOK: no se avisa a Slack)"); return
    try:
        req = urllib.request.Request(wh, data=json.dumps({"text": texto}).encode("utf-8"), headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        log("Aviso a Slack falló: " + type(e).__name__)


def base_url():
    repo = os.environ.get("GITHUB_REPOSITORY", "usuario/repositorio")
    o, n = repo.split("/")
    return f"https://{o.lower()}.github.io/{n}/"


def indice_reportes():
    import re as _re
    pdfs = sorted([f for f in os.listdir(REP) if f.endswith(".pdf")], reverse=True)
    grupos = [("hecho_", "Informes de un hecho (accidentes, desastres, etc.)"), ("sismos_", "Informes de sismos"), ("brote_", "Informes de brotes y alertas epidemiológicas (OPS/OMS)"), ("alerta_", "Alertas inmediatas"),
              ("diario_", "Reportes diarios"), ("semanal_", "Reportes semanales"), ("mensual_", "Reportes mensuales"), ("solicitud_", "Reportes por solicitud")]
    usados, bloques = set(), []

    try:
        tit = json.load(open(os.path.join(REP, "titulos.json"), encoding="utf-8"))
    except Exception:
        tit = {}

    def etiqueta(f):
        if tit.get(f):
            return tit[f]
        m = _re.search(r"(\d{8})_(\d{4})", f)
        if m:
            d, h = m.group(1), m.group(2)
            return f"{d[6:8]}/{d[4:6]}/{d[0:4]} {h[:2]}:{h[2:]}"
        m = _re.search(r"(\d{4}-?\d{2}-?\d{2}|\d{4}-W?\d{2})", f)
        return m.group(1) if m else f
    for pref, titulo in grupos:
        fs = [f for f in pdfs if f.startswith(pref)]
        usados.update(fs)
        if fs:
            bloques.append(f"<h2>{titulo}</h2><ul>" + "".join(f'<li><a href="{f}">{etiqueta(f)}</a> <small>{f[:-4].split("_",1)[-1] if f.startswith(("hecho_","sismos_","brote_")) else ""}</small></li>' for f in fs[:60]) + "</ul>")
    try:  # lista legible por el tablero (centro de informes)
        _lista = []
        for f in pdfs:
            pref = next((pr for pr, _ in grupos if f.startswith(pr)), "otro_")
            m = _re.search(r"(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})", f) or _re.search(r"(\d{4})-(\d{2})-(\d{2})()()", f)
            fecha = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" + (f"T{m.group(4)}:{m.group(5)}" if m.group(4) else "") if m else ""
            _lista.append({"archivo": f, "tipo": pref.rstrip("_"), "titulo": etiqueta(f), "fecha": fecha})
        json.dump(_lista, open(os.path.join(REP, "lista.json"), "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass
    otros = [f for f in pdfs if f not in usados]
    if otros:
        bloques.append("<h2>Otros</h2><ul>" + "".join(f'<li><a href="{f}">{f}</a></li>' for f in otros[:60]) + "</ul>")
    cuerpo = "".join(bloques) or "<p>Aún no hay reportes.</p>"
    open(os.path.join(REP, "index.html"), "w", encoding="utf-8").write(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reportes PDF</title>'
        '<style>body{font:15px/1.6 system-ui;max-width:760px;margin:24px auto;padding:0 16px}a{color:#0b5cab}h2{font-size:16px;margin:22px 0 4px;border-bottom:1px solid #ccd}'
        'ul{margin:4px 0;padding-left:20px}small{color:#778}.pedir{background:#eef4fb;border:1px solid #bcd;border-radius:8px;padding:10px 14px;margin:10px 0}</style>'
        '<h1>Reportes PDF — Sala de Situación</h1><p><a href="../">← Volver al tablero</a></p>'
        '<div class="pedir"><b>¿Necesita un informe específico?</b> Use <a href="https://script.google.com/macros/s/AKfycbzxWSLP0Vz_vJdugCpOngN-uYVsTEwW9b64phK1Q-xdmLJwiUhGhrUHqLp3srPE5sP0/exec?pedir=1">Pedir un informe</a> '
        'y escriba, por ejemplo: <i>accidente Caranavi</i>, <i>sismo hoy</i> o <i>sismo Potosí</i>. El PDF llega a Slack y aparece aquí en pocos minutos.</div>' + cuerpo)


def por_hecho(evs):
    """Una fila por hecho para el tablero: une las notas que cuentan lo mismo (cifras = máximo reportado, no suma)."""
    import reporte_pdf as rp
    filas = []
    for r in rp.agrupar_hechos([dict(e) for e in evs]):
        n = len(r.get("_ids", []))
        if n > 1:
            r["detalle"] = f"{n} notas de {len(r['_fuentes'])} fuente(s): {', '.join(r['_fuentes'])}. " + (r.get("detalle") or "")
            if r.get("_contradice"):
                r["detalle"] = "Las fuentes difieren en las cifras. " + r["detalle"]
        r["n_notas"] = n
        filas.append({k: v for k, v in r.items() if not k.startswith("_")})
    return sorted(filas, key=lambda e: -e["ts"])


def _correo_reporte(n, t, evs, ahora_ms, horas_env):
    """Envía por correo los reportes periódicos y los pedidos (no las alertas inmediatas, que van por Slack)."""
    import correo, reporte_pdf as rp, re as _re
    if not correo.configurado() or n.startswith("alerta_"):
        return
    horas = 24 * 31 if n.startswith("mensual_") else 168 if n.startswith("semanal_") else 24 if n.startswith("diario_") else int(horas_env or 24)
    ven = [dict(e) for e in evs if e["ts"] >= ahora_ms - horas * 3600000 and not (e["tipo"] == "sin clasificar" and e["nivel"] == 0)]
    grupos = rp.agrupar_hechos(ven)
    grupos.sort(key=lambda g: (-(g.get("nivel") or 0), -((g.get("fall") or 0) + (g.get("her") or 0)), -g["ts"]))
    fall = sum(g.get("fall") or 0 for g in grupos); her = sum(g.get("her") or 0 for g in grupos)
    resumen = [("Hechos", len(grupos)), ("Nivel naranja/rojo", sum(1 for g in grupos if (g.get("nivel") or 0) >= 2)), ("Fallecidos*", fall), ("Heridos*", her)]
    top = [(g["titulo"][:120], f"{g.get('tipo','')} · {g.get('lugar') or 'Bolivia'}" + (f" · {g.get('fall') or 0} fallecido(s), {g.get('her') or 0} herido(s)" if (g.get('fall') or g.get('her')) else "")) for g in [x for x in grupos if 'pronosticadas' not in x['titulo']][:8]]
    limpio = _re.sub(r":[a-z_]+:|<!channel>|\*", "", t).strip()
    nombre = {"diario": "Reporte diario", "semanal": "Reporte semanal", "mensual": "Reporte mensual"}.get(n.split("_")[0], limpio[:80])
    pdf_url = base_url() + "reportes/" + n
    html_c = correo.cuerpo_html(nombre, resumen, top, pdf_url, base_url())
    plano = f"{nombre}\n\n" + "\n".join(f"- {a}: {b}" for a, b in resumen) + "\n\n" + "\n".join(f"* {a} ({b})" for a, b in top) + f"\n\nPDF: {pdf_url}\nTablero: {base_url()}"
    correo.enviar(f"Sala de Situación Bolivia · {nombre} · {datetime_hoy()}", html_c, plano, [os.path.join(REP, n)], log=log)


def datetime_hoy():
    import datetime as _d
    return (_d.datetime.utcnow() - _d.timedelta(hours=4)).strftime("%d/%m/%Y")


def main():
    os.makedirs(REP, exist_ok=True)
    ahora_ms = int(time.time() * 1000)
    ahora = dt.datetime.fromtimestamp(ahora_ms / 1000, TZ)
    datos = cargar_datos()
    todos = datos["eventos"]
    evs = [e for e in todos if relevante(e)]
    # data.json = lo relevante (tablero y reportes); data_completo.json = base completa para análisis
    tablero = por_hecho(evs)
    json.dump({"generado": ahora_ms, "eventos": tablero}, open(os.path.join(DOCS, "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"generado": ahora_ms, "eventos": todos}, open(os.path.join(DOCS, "data_completo.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    log(f"{len(todos)} eventos descargados, {len(evs)} relevantes, {len(tablero)} hechos en el tablero")
    FUENTES = []

    def reg(nombre, inst, fn, auto=True):
        """Ejecuta una fuente y deja constancia de su estado (se muestra en el tablero)."""
        t0 = time.time()
        try:
            r = fn()
            FUENTES.append({"nombre": nombre, "institucion": inst, "estado": "ok", "detalle": str(r)[:200], "segundos": round(time.time() - t0, 1), "ts": ahora_ms})
            log(f"{nombre}: {str(r)[:300]}")
            return r
        except Exception as ex:
            msg = type(ex).__name__ + " " + str(ex)[:140]
            FUENTES.append({"nombre": nombre, "institucion": inst, "estado": "error", "detalle": msg, "segundos": round(time.time() - t0, 1), "ts": ahora_ms})
            log(f"No se pudo actualizar {nombre} (se conserva lo anterior): {msg}")
            return None

    def _datos_abiertos():
        import datos_abiertos
        return datos_abiertos.exportar(os.path.join(DOCS, "datos"), ahora_ms, evs, cargar_geo("geo.json"))

    def _senamhi():
        import senamhi
        r = senamhi.actualizar(DOCS, geo=cargar_geo("geo.json"))
        return str(r) + " · avisos enviados a Slack: " + str(senamhi.avisar_nuevos(DOCS, avisar))

    reg("Base de datos descargable", "Sala de Situación", _datos_abiertos)
    reg("Alertas oficiales hidrológicas y meteorológicas", "SENAMHI", _senamhi)
    reg("Sismos", "Observatorio San Calixto", lambda: __import__("sismos").actualizar(DOCS, avisar))
    reg("Vigilancia epidemiológica (boletín, OPS, OMS)", "Ministerio de Salud y Deportes / OPS / OMS", lambda: __import__("epidemio").actualizar(DOCS, avisar))
    reg("Pronóstico de propagación de incendios", "SENAMHI", lambda: __import__("focos").actualizar(DOCS, avisar))
    _r = reg("Focos de calor detectados por satélite", "NASA FIRMS", lambda: __import__("firms").actualizar(DOCS, cargar_geo("geo.json"), avisar))
    try:
        open(os.path.join(DOCS, "estado_firms.txt"), "w", encoding="utf-8").write(str(_r) + "\n")
    except Exception:
        pass
    reg("Sequía: índice SPI (ERA5, método OMM)", "Open-Meteo / Copernicus ERA5", lambda: __import__("sequia").actualizar(DOCS))
    reg("Caudales de ríos (modelo GloFAS)", "Copernicus EMS / Open-Meteo", lambda: __import__("caudales").actualizar(DOCS))

    def _transito():
        import fuentes_extra, transito
        geo_t = cargar_geo("geo.json")
        extra = []
        for fn in (fuentes_extra.prensa_transito, fuentes_extra.gdelt):
            try:
                n_, m_ = fn(geo_t)
                log("  · " + m_)
                extra += n_
            except Exception as ex_:
                log("  · fuente adicional no disponible: " + type(ex_).__name__ + " " + str(ex_)[:80])
        extra = [e for e in extra if relevante(e)]
        return transito.actualizar(DOCS, evs + extra, geo_t) + f" · {len(extra)} notas de medios adicionales"

    reg("Accidentes de tránsito (prensa por medio + GDELT)", "Medios bolivianos / GDELT", _transito)
    reg("Eventos naturales (NASA EONET)", "NASA", lambda: __import__("fuentes_extra").eonet(DOCS))
    for nom, inst, why in [
        ("Boletines de Defensa Civil / VIDECI", "Viceministerio de Defensa Civil", "El sitio bloquea el acceso automático. Se cubre por prensa y registro manual."),
        ("Sanidad animal", "SENASAG", "El sitio bloquea el acceso automático. Se cubre por prensa y registro manual."),
        ("Deslizamientos, eventos tecnológicos y antropogénicos", "Varias", "No existe fuente oficial abierta; se cubre con prensa verificada y registro manual."),
    ]:
        FUENTES.append({"nombre": nom, "institucion": inst, "estado": "sin_acceso", "detalle": why, "segundos": 0, "ts": ahora_ms})
    FUENTES.append({"nombre": "Prensa boliviana (Google Noticias)", "institucion": "Medios de comunicación", "estado": "ok",
                    "detalle": f"{len(todos)} notas descargadas, {len(evs)} relevantes, {len(tablero)} hechos", "segundos": 0, "ts": ahora_ms})
    try:
        json.dump({"generado": ahora_ms, "fuentes": FUENTES}, open(os.path.join(DOCS, "estado_fuentes.json"), "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass
    try:
        import unificar
        _u = unificar.actualizar(DOCS, cargar_geo("geo.json"))
        log("Base unificada de eventos: " + _u)
    except Exception as ex:
        log("No se pudo actualizar la base unificada (se conserva la anterior): " + type(ex).__name__ + " " + str(ex)[:100])
    if EXCLUIDOS:
        log(f"Excluidos por ser de otro país ({len(EXCLUIDOS)}):")
        for t in EXCLUIDOS[:30]:
            log("  - " + t)
    estado = json.load(open(ESTADO)) if os.path.exists(ESTADO) else {"reportados": [], "diario": "", "semanal": ""}
    geo = None
    hechos = []  # (archivo, texto)

    def pdf(nombre, **kw):
        nonlocal geo
        geo = geo or cargar_geo("geo.json")
        r = build([dict(e) for e in evs], geo, os.path.join(REP, nombre), ahora=ahora_ms, **kw)
        log(f"PDF {nombre}: {r}")
        return r

    modo = os.environ.get("MODO", "").strip()
    if modo == "solicitud":
        horas = int(os.environ.get("HORAS") or 24)
        q = (os.environ.get("BUSCAR") or "").strip()
        if q:  # informe por tema para la página tema.html (todo lo guardado + prensa del último año, con gráficos)
            try:
                import tema as _tema
                geo = geo or cargar_geo("geo.json")
                _m = _tema.generar(q, DOCS, geo, meses=12, filtro_extranjero=es_extranjero, log=log)
                avisar(f":mag: Informe por tema listo: {_m}. Ábralo en la página «Informe por tema» (tema.html?q={q.replace(' ', '+')}).")
                try:
                    import correo as _co
                    _u = base_url() + "tema.html?q=" + q.replace(" ", "+")
                    _co.enviar(f"Sala de Situación Bolivia · Informe por tema: {q}", f'<div style="font-family:Arial;max-width:600px"><h2 style="color:#0b3b6e">Informe por tema: {q}</h2><p>{_m}</p><p><a href="{_u}" style="background:#1d6fb8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Abrir el informe con gráficos</a></p><p style="font-size:12px;color:#7a8aa3">Información preliminar de prensa y fuentes oficiales.</p></div>', f"Informe por tema: {q}\n{_m}\n{_u}", log=log)
                except Exception as _ex2:
                    log(f"Correo del informe por tema falló: {type(_ex2).__name__}")
            except Exception as _ex:
                log(f"Informe por tema falló: {type(_ex).__name__} {str(_ex)[:150]}")
        import informe_sismo as _isis
        if q and _isis.es_consulta_sismo(q):
            # informe específico de sismos (fuente oficial: Observatorio San Calixto)
            try:
                _sis = json.load(open(os.path.join(DOCS, "sismos_oficiales.json"), encoding="utf-8")).get("sismos", [])
            except Exception:
                _sis = []
            geo = geo or cargar_geo("geo.json")
            _nom = f"sismos_{ahora:%Y%m%d_%H%M%S}.pdf"
            _ahora_dt = dt.datetime.now(_isis.TZ)
            _r = _isis.informe(_sis, geo, os.path.join(REP, _nom), consulta=q, horas=horas, ahora=_ahora_dt)
            log(f"Informe de sismos {_nom}: {_r}")
            if _r["n"]:
                _txt = (f":page_facing_up: Informe de sismos «{q}» — {_r['n']} sismo(s), mayor M {_r['mayor']:.1f} ({_r['mayor_lugar']}), "
                        f"{_r['sentido']} posiblemente sentido(s) (M≥4,0 y ≤100 km). Fuente: Observatorio San Calixto.")
            else:
                _txt = f":page_facing_up: Informe de sismos «{q}»: el Observatorio San Calixto no registra sismos en ese período y lugar."
            hechos.append((_nom, _txt))
        elif q and __import__("informe_brote").es_consulta_brote(q):
            # informe específico de brotes / alertas epidemiológicas (OPS, OMS, Ministerio de Salud y Deportes)
            import informe_brote as _ib, epidemio as _ep
            try:
                _epi = json.load(open(os.path.join(DOCS, "epidemio_oficial.json"), encoding="utf-8"))
            except Exception:
                _epi = {}
            _nom = f"brote_{ahora:%Y%m%d_%H%M%S}.pdf"
            _r = _ib.informe(_epi, None, os.path.join(REP, _nom), consulta=q, horas=horas, ahora=dt.datetime.now(_ib.TZ),
                             leer=lambda u: _ep._get(u, t=45).decode("utf-8", "ignore"))
            log(f"Informe epidemiológico {_nom}: {_r}")
            _txt = (f":page_facing_up: Informe epidemiológico «{q}» — {_r['n']} publicación(es) de OPS/OMS ({_r['periodo']}); "
                    f"mencionan a Bolivia: {_r['bolivia']}" + ("; no hubo publicaciones en el período, se muestran las más recientes." if _r["sin_periodo"] else "."))
            hechos.append((_nom, _txt))
        elif q:
            lim_q = ahora_ms - horas * 3600000
            pool = [e for e in filtrar_busqueda(evs, q) if e["ts"] >= lim_q]
            n_sistema = len(pool)
            # búsqueda en vivo: ayuda al sistema con hechos que no captó solo
            import busqueda
            geo = geo or cargar_geo("geo.json")
            vivos, msg_vivo = busqueda.buscar_en_vivo(q, horas, geo)
            claves = {_n(e["titulo"]) for e in pool} | {e.get("url") for e in pool}
            nuevos = [v for v in vivos if _n(v["titulo"]) not in claves and v["url"] not in claves and not es_extranjero(v)]
            descartados = len(vivos) - len(nuevos)
            pool += nuevos
            pool.sort(key=lambda e: e["ts"])
            log(f"Búsqueda '{q}': {n_sistema} nota(s) del sistema + {len(nuevos)} nuevas en vivo ({msg_vivo}; {descartados} repetidas o de otro país)")
            if not pool:
                avisar(f":mag: Informe de hecho «{q}» (últimas {horas} h): *no se encontraron notas* ni en el sistema ni en Google Noticias ({msg_vivo}). Puede que la prensa no lo haya publicado o que el titular no use esas palabras. Si lo conoce, regístrelo a mano en la página de pedidos.")
                json.dump(estado, open(ESTADO, "w"), ensure_ascii=False); indice_reportes(); return
            import informe_hecho as ih
            grupos_q = ih.agrupar_items(pool, ignorar_tipo=True)
            # se leen las notas (en paralelo) para unir las que cuentan el mismo hecho con titulares distintos
            from concurrent.futures import ThreadPoolExecutor
            por_leer = [e for g in grupos_q for e in g if str(e["id"]).startswith("noticia:") and (e.get("url") or "").startswith("http")][:30]
            with ThreadPoolExecutor(max_workers=3) as ex:
                textos_q = dict(zip([e["id"] for e in por_leer], ex.map(lambda e: ih.leer_nota(e["url"]), por_leer)))
            antes = len(grupos_q)
            grupos_q = ih.unir_por_texto(grupos_q, textos_q)
            log(f"Notas leídas: {sum(1 for v in textos_q.values() if v[0])} de {len(por_leer)}; hechos {antes} -> {len(grupos_q)} tras unir por texto")
            hechos_q = sorted(grupos_q, key=lambda g: (-len({i["fuente"] for i in g}), -len(g)))[:3]
            for k, items in enumerate(hechos_q, 1):
                n = f"hecho_{ahora:%Y%m%d_%H%M}_{k}.pdf"
                r = ih.informe(items, geo, os.path.join(REP, n), ahora=ahora_ms, consulta=q, textos={e["id"]: textos_q[e["id"]] for e in items if e["id"] in textos_q})
                log(f"Informe {n}: {r}")
                tit = items[-1]["titulo"][:90]
                hechos.append((n, f":page_facing_up: Informe de hecho «{tit}» — {r['notas']} nota(s), {r['fuentes']} fuente(s), texto leído en {r['leidas']} (fallecidos {r['fall']}, heridos {r['her']}, cifras de prensa)"))
        else:
            n = f"solicitud_{ahora:%Y%m%d_%H%M}_{horas}h.pdf"
            pdf(n, modo="programado", horas=horas, etiqueta=f"Reporte por solicitud — últimas {horas} h")
            hechos.append((n, f":page_facing_up: Reporte por solicitud (últimas {horas} h)"))
    else:
        # 1) inmediato: hechos con víctimas o nivel rojo, aún no reportados
        lim = ahora_ms - 48 * 3600000
        grupos = agrupar_hechos([e for e in evs if e["ts"] >= lim and not (e["tipo"] == "sin clasificar" and e["nivel"] == 0)])
        graves = [g for g in grupos if ((g.get("fall") or 0) > 0 or (g.get("her") or 0) > 0 or g["nivel"] >= 3)
                  and not (set(g["_ids"]) & set(estado["reportados"]))]  # un hecho ya avisado no se repite
        if graves:
            n = f"alerta_{ahora:%Y%m%d_%H%M}.pdf"
            ids = [i for g in graves for i in g["_ids"]]
            pdf(n, modo="inmediato", horas=48, ref=ids)
            estado["reportados"] = (estado["reportados"] + ids)[-3000:]
            fall = sum(e.get("fall") or 0 for e in graves); her = sum(e.get("her") or 0 for e in graves)
            hechos.append((n, f":rotating_light: <!channel> ALERTA INMEDIATA: {len(graves)} hecho(s) grave(s) (fallecidos {fall}, heridos {her}, cifras preliminares de prensa)"))
        # 2) diario (desde las 07:00 hora La Paz, una vez por día)
        hoy = f"{ahora:%Y-%m-%d}"
        if ahora.hour >= HORA_DIARIO and estado["diario"] != hoy:
            n = f"diario_{hoy}.pdf"
            pdf(n, modo="programado", horas=24, etiqueta="Reporte diario de situación")
            estado["diario"] = hoy
            hechos.append((n, f":page_facing_up: Reporte diario {hoy}"))
        # 3) semanal (lunes desde las 07:00)
        sem = f"{ahora.isocalendar()[0]}-W{ahora.isocalendar()[1]:02d}"
        if ahora.weekday() == 0 and ahora.hour >= HORA_DIARIO and estado["semanal"] != sem:
            n = f"semanal_{sem}.pdf"
            pdf(n, modo="programado", horas=168, etiqueta="Reporte semanal de situación")
            estado["semanal"] = sem
            hechos.append((n, f":page_facing_up: Reporte semanal {sem}"))

        # 4) mensual (día 1, desde las 07:00): cubre el mes anterior
        mes = f"{ahora:%Y-%m}"
        if ahora.day == 1 and ahora.hour >= HORA_DIARIO and estado.get("mensual") != mes:
            n = f"mensual_{mes}.pdf"
            pdf(n, modo="programado", horas=24 * 31, etiqueta="Reporte mensual de situación")
            estado["mensual"] = mes
            hechos.append((n, f":page_facing_up: Reporte mensual {mes}"))

    json.dump(estado, open(ESTADO, "w"), ensure_ascii=False)
    try:
        _tp = os.path.join(REP, "titulos.json")
        _t = json.load(open(_tp, encoding="utf-8")) if os.path.exists(_tp) else {}
        for n, t in hechos:
            import re as _re2
            _m = _re2.search(r"«(.*?)»", t)
            _tit = (_m.group(1) if _m else t.replace(":page_facing_up:", "").strip())
            _tit = _re2.sub(r"\s+-\s+[^-]{3,40}$", "", _tit)[:110]
            _t[n] = f"{ahora:%d/%m %H:%M} — " + (("Sismos: " + _tit) if n.startswith("sismos_") else ("Epidemiología: " + _tit) if n.startswith("brote_") else _tit)
        json.dump(_t, open(_tp, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass
    indice_reportes()
    for n, t in hechos:
        avisar(f"{t}\n{base_url()}reportes/{n}")
        try:
            _correo_reporte(n, t, evs, ahora_ms, os.environ.get("HORAS"))
        except Exception as _ex:
            log(f"Correo del reporte {n} falló: {type(_ex).__name__} {str(_ex)[:100]}")
    log("Listo. Reportes nuevos: " + (", ".join(n for n, _ in hechos) or "ninguno"))


if __name__ == "__main__":
    main()

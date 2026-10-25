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
EXTRANJERO = ["cuba", "habana", "dominicana", "santo domingo", "puerto rico", "mexico", "guatemala", "honduras", "el salvador", "nicaragua", "costa rica",
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
    pdfs = sorted([f for f in os.listdir(REP) if f.endswith(".pdf")], reverse=True)
    filas = "".join(f'<li><a href="{f}">{f}</a></li>' for f in pdfs) or "<li>Aún no hay reportes.</li>"
    open(os.path.join(REP, "index.html"), "w", encoding="utf-8").write(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reportes PDF</title>'
        '<style>body{font:15px/1.6 system-ui;max-width:720px;margin:24px auto;padding:0 16px}a{color:#0b5cab}</style>'
        '<h1>Reportes PDF — Sala de Situación</h1><p><a href="../">← Volver al tablero</a></p><ul>' + filas + "</ul>")


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
    try:
        import datos_abiertos
        geo_d = cargar_geo("geo.json")
        log("Base de datos descargable: " + str(datos_abiertos.exportar(os.path.join(DOCS, "datos"), ahora_ms, evs, geo_d)))
    except Exception as e:
        log("No se pudo actualizar la base de datos descargable: " + type(e).__name__ + " " + str(e)[:100])
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
        if q:
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
            hechos_q = sorted(ih.agrupar_items(pool, ignorar_tipo=True), key=lambda g: (-len({i["fuente"] for i in g}), -len(g)))[:3]
            for k, items in enumerate(hechos_q, 1):
                n = f"hecho_{ahora:%Y%m%d_%H%M}_{k}.pdf"
                r = ih.informe(items, geo, os.path.join(REP, n), ahora=ahora_ms, consulta=q)
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

    json.dump(estado, open(ESTADO, "w"), ensure_ascii=False)
    indice_reportes()
    for n, t in hechos:
        avisar(f"{t}\n{base_url()}reportes/{n}")
    log("Listo. Reportes nuevos: " + (", ".join(n for n, _ in hechos) or "ninguno"))


if __name__ == "__main__":
    main()

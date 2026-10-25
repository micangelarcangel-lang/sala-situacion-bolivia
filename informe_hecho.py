# -*- coding: utf-8 -*-
"""Informe de UN hecho: junta todas las notas de prensa del mismo suceso en un solo PDF.
- Lee el texto de cada nota (si el medio lo permite) y extrae frases textuales con cifras, lugar y circunstancias.
- Compara las cifras de fallecidos y heridos entre fuentes y señala contradicciones.
- Dice con claridad qué notas se pudieron leer completas y cuáles solo por titular.
"""
import re, io, json, time, urllib.request, unicodedata, datetime as dt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                Image, KeepTogether, NextPageTemplate, PageBreak)
import reporte_pdf as rp

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
NUM = {"un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
       "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "veinte": 20, "treinta": 30}
CLAVES = ("fallec", "muri", "muert", "herid", "lesion", "victim", "trasladad", "hospital", "policia", "bombero", "embarranc", "vuelc", "colision",
          "choque", "accidente", "carretera", "ruta", "tramo", "conductor", "chofer", "minibus", "bus ", "camion", "vehiculo", "identific", "causa",
          "auxili", "rescat", "ambulancia", "barranco", "kilometro", " km", "derrumbe", "inund", "incendio", "sismo", "temblor", "evacu", "damnific")


def norm(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


# ---------------------------------------------------------------- lectura de la nota
def resolver(url):
    """Los enlaces de Google Noticias son redirecciones: se obtiene la dirección real del medio.
    Devuelve (url_real, mensaje_de_error). Si falla, url_real es None y el mensaje dice por qué."""
    if "news.google.com" not in url:
        return url, ""
    try:
        from googlenewsdecoder import gnewsdecoder
        r = gnewsdecoder(url, interval=1)
        if isinstance(r, dict) and (r.get("success") or r.get("status")) and r.get("decoded_url"):
            return r["decoded_url"], ""
        return None, str((r or {}).get("message") or "sin respuesta")[:120]
    except Exception as e:
        return None, (type(e).__name__ + ": " + str(e))[:120]


def descargar(url, tiempo=25):
    """Descarga la página; si el medio responde 429/502/503 (demasiados pedidos) espera y reintenta."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-419,es;q=0.9", "Accept": "text/html,application/xhtml+xml"})
    for intento in range(4):
        try:
            with urllib.request.urlopen(req, timeout=tiempo) as r:
                raw = r.read(2_500_000)
                cs = r.headers.get_content_charset() or "utf-8"
                return raw.decode(cs, errors="replace"), r.geturl()
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503) and intento < 3:
                try:
                    espera = min(20, int(e.headers.get("Retry-After", "")))
                except Exception:
                    espera = 4 * (intento + 1)
                time.sleep(espera)
                continue
            raise


def texto_principal(html):
    try:
        import trafilatura
        t = trafilatura.extract(html, include_comments=False, favor_precision=True, include_tables=False)
        if t and len(t) > 300:
            return t
    except Exception:
        pass
    try:
        from bs4 import BeautifulSoup
        s = BeautifulSoup(html, "lxml")
        for x in s(["script", "style", "nav", "footer", "aside", "form"]):
            x.decompose()
        cont = s.find("article") or s
        ps = [p.get_text(" ", strip=True) for p in cont.find_all("p")]
        return "\n".join(p for p in ps if len(p) > 60)
    except Exception:
        return ""


def leer_nota(url):
    """Devuelve (texto, estado, url_real). Nunca lanza excepción."""
    try:
        real, msg = resolver(url)
        if real is None:
            return "", f"solo titular (no se pudo obtener la dirección del medio: {msg})", url
        html, final = descargar(real)
        t = texto_principal(html).strip()
        if len(t) >= 500:
            return t, "texto completo", final
        if len(t) >= 150:
            return t, "texto parcial", final
        return "", "solo titular (la página del medio no entregó el texto: puede requerir suscripción)", final
    except Exception as e:
        return "", f"solo titular (el medio no permitió abrir la nota: {type(e).__name__} {str(e)[:60]})", url


# ---------------------------------------------------------------- extracción
def _valor(s):
    s = norm(s)
    return int(s) if s.isdigit() else NUM.get(s)


_VAGOS = {"varios", "varias", "algunos", "algunas", "muchos", "muchas", "otros", "otras", "cuantos"}
_UNIDAD = {"de", "horas", "hrs", "h", "km", "kilometro", "kilometros", "metro", "metros", "mts", "ano", "anos", "minutos", "dias", "meses", "por", "bs", "bolivianos"}


def cifras(texto):
    """Mayores cifras de fallecidos y heridos que menciona un texto (cifras de prensa, sin validar).
    Para cada palabra clave busca el número más cercano antes (hasta 5 palabras) o, si no hay, justo después."""
    t = norm(texto)
    fall = her = 0
    for frase in re.split(r"[.;!?\n]+", t):
        tok = re.findall(r"[a-z0-9%]+", frase)
        for i, w in enumerate(tok):
            if w.startswith(("fallec", "muert", "muri", "perdieron")):
                tipo = "f"
            elif w.startswith(("herid", "lesionad")):
                tipo = "h"
            else:
                continue
            v = None
            for j in range(i - 1, max(i - 13, -1), -1):
                x = tok[j]
                if x.startswith(("fallec", "muert", "muri", "herid", "lesionad")):
                    break
                if x in _VAGOS:  # «varios heridos»: no hay cifra
                    break
                n = int(x) if x.isdigit() else NUM.get(x)
                if n == 1 and i - j > 3:  # «un» lejos de la palabra clave («a un barranco ... heridos») no es una cantidad
                    continue
                if n and not (j + 1 < len(tok) and tok[j + 1] in _UNIDAD):
                    v = n; break
            if v is None:
                for j in range(i + 1, min(i + 4, len(tok))):
                    x = tok[j]
                    n = int(x) if x.isdigit() else NUM.get(x)
                    if n and not (j + 1 < len(tok) and tok[j + 1] in _UNIDAD):
                        v = n; break
                    if x.startswith(("herid", "fallecid", "muert", "lesionad")):
                        break
            if v and v < 1000:
                if tipo == "f":
                    fall = max(fall, v)
                else:
                    her = max(her, v)
    if fall == 0 and re.search(r"\bun (?:fallecido|muerto)\b|\bmurio\b", t):
        fall = 1
    return fall, her


_NEG = {"no", "sin", "ningun", "ninguna", "ni", "descartan", "descarto", "descartaron", "nadie", "cero"}


def evidencia(texto, tipo):
    """Frase de la nota de donde sale la mayor cifra de heridos ('h') o fallecidos ('f')."""
    mejor, frase_mejor = 0, ""
    for fr in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", texto or "")):
        f, h = cifras(fr)
        v = h if tipo == "h" else f
        if v > mejor:
            mejor, frase_mejor = v, fr.strip()
    return frase_mejor[:260]


def menciones(texto, raices):
    """Cuenta menciones afirmadas y negadas ("no se registraron fallecidos") de una familia de palabras."""
    afirma = niega = 0
    for frase in re.split(r"[.;!?\n]+", norm(texto)):
        tok = re.findall(r"[a-z0-9]+", frase)
        for i, w in enumerate(tok):
            if w.startswith(raices):
                if any(x in _NEG for x in tok[max(0, i - 6):i]):
                    niega += 1
                else:
                    afirma += 1
    return afirma, niega


def _huellas(texto, n=8):
    pal = re.findall(r"[a-z0-9]+", norm(texto))
    return {hash(" ".join(pal[i:i + n])) for i in range(max(0, len(pal) - n + 1))}


def unir_por_texto(grupos, textos, minimo=3):
    """Une grupos de notas cuyo cuerpo comparte frases largas idénticas (misma cobertura de un mismo hecho aunque el titular difiera).
    textos: {id: (texto, estado, url)}. Se ignoran frases presentes en casi todas las notas (avisos, suscripciones)."""
    hu = []
    for g in grupos:
        h = set()
        for e in g:
            t = (textos.get(e["id"]) or ("",))[0]
            if t:
                h |= _huellas(t)
        hu.append(h)
    from collections import Counter
    cont = Counter(x for h in hu for x in h)
    comun = {x for x, c in cont.items() if len(grupos) >= 4 and c > 0.4 * len(grupos)}
    hu = [h - comun for h in hu]
    padre = list(range(len(grupos)))

    def raiz(i):
        while padre[i] != i:
            padre[i] = padre[padre[i]]; i = padre[i]
        return i
    for i in range(len(grupos)):
        for j in range(i + 1, len(grupos)):
            if len(hu[i] & hu[j]) >= minimo:
                padre[raiz(j)] = raiz(i)
    out = {}
    for i, g in enumerate(grupos):
        out.setdefault(raiz(i), []).extend(g)
    res = []
    for g in out.values():
        mejor = max(g, key=lambda e: (e["nivel"], e["ts"]))["tipo"]
        for e in g:
            e["tipo"] = mejor
        res.append(g)
    return res


def frases_clave(texto, titulo="", max_n=5):
    """Frases textuales de la nota con más información (cifras, lugar, circunstancias). Se citan sin modificar."""
    if not texto:
        return []
    texto = re.sub(r"(?i)escuchar esta nota", " ", texto)
    texto = re.sub(r"Foto:.*?Fuente:\s*(?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]*\s+){1,6}?(?=(?:Un|Una|El|La|Los|Las|En|Tras|Según)\b)", " ", texto)
    partes = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡“\"])", re.sub(r"\s+", " ", texto))
    pal_tit = {w for w in norm(re.sub(r" - [^-]+$", "", titulo)).split() if len(w) > 4}
    cand = []
    for i, s in enumerate(partes):
        s = s.strip()
        if not 50 <= len(s) <= 380:
            continue
        n = norm(s)
        pts = sum(2 for k in CLAVES if k in n)
        if re.search(r"\d", s):
            pts += 2
        pts += sum(1 for w in pal_tit if w in n)
        if re.search(r"suscri|cookies|compart|siguenos|lea tambien|publicidad|derechos reservados", n):
            pts -= 6
        if pts >= 4:
            cand.append((pts, i, s))
    top = sorted(cand, key=lambda x: (-x[0], x[1]))[:max_n]
    return [s for _, _, s in sorted(top, key=lambda x: x[1])]


# ---------------------------------------------------------------- agrupación
def agrupar_items(evs, ignorar_tipo=False):
    """Como agrupar_hechos, pero devuelve las listas de notas de cada hecho.
    ignorar_tipo: en una búsqueda dirigida, notas del mismo hecho clasificadas distinto se unen y toman un mismo tipo."""
    grupos = []
    for e in evs:
        f = rp._ficha(e["titulo"]) if str(e["id"]).startswith("noticia:") else None
        hallado = None
        if f is not None:
            for g in grupos:
                if g["f"] is not None and (ignorar_tipo or g["tipo"] == e["tipo"]) and rp._similitud(g["f"], f) >= 0.5:
                    hallado = g; break
        if hallado:
            hallado["items"].append(e)
        else:
            grupos.append({"tipo": e["tipo"], "f": f, "items": [e]})
    if ignorar_tipo:
        for g in grupos:
            mejor = max(g["items"], key=lambda i: (i["nivel"], i["ts"]))["tipo"]
            for i in g["items"]:
                i["tipo"] = mejor
    return [g["items"] for g in grupos]


def clave_url(u):
    """Dirección canónica: sin versión AMP, sin parámetros ni fragmento."""
    u = str(u or "").lower().split("#")[0].split("?")[0]
    u = re.sub(r"\.amp\.html$", ".html", u)
    u = re.sub(r"/amp/?$", "", u).rstrip("/")
    return u


def quitar_repetidas(items, textos):
    """Une notas repetidas: misma dirección real (normal/AMP) o mismo medio con el mismo titular."""
    vistas, salida = {}, []
    for e in items:
        real = textos.get(e["id"], ("", "", e.get("url")))[2] or e.get("url")
        k1 = clave_url(real) if "news.google.com" not in str(real) else None
        k2 = (norm(e["fuente"]), norm(re.sub(r" - [^-]+$", "", e["titulo"])))
        previa = vistas.get(("u", k1)) if k1 else None
        previa = previa or vistas.get(("t", k2))
        if previa is not None:
            previa["_repetidas"] = previa.get("_repetidas", 0) + 1
            continue
        if k1:
            vistas[("u", k1)] = e
        vistas[("t", k2)] = e
        salida.append(e)
    return salida


# ---------------------------------------------------------------- PDF
def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def informe(items, geo, salida, ahora=None, textos=None, consulta=""):
    """items: notas del MISMO hecho. textos: {id: (texto, estado, url_real)} (si falta, se leen aquí)."""
    ahora = ahora or int(time.time() * 1000)
    items = sorted(items, key=lambda e: e["ts"])
    textos = textos if textos is not None else {}
    for e in items:
        if e["id"] not in textos and str(e["id"]).startswith("noticia:") and (e.get("url") or "").startswith("http"):
            textos[e["id"]] = leer_nota(e["url"])
    n_original = len(items)
    items = quitar_repetidas(items, textos)
    reps = rp.agrupar_hechos([dict(e) for e in items])
    rep = reps[0]
    for r in reps[1:]:  # notas unidas por su texto aunque el titular difiera: se funden en un solo hecho
        rep["_fuentes"] = sorted(set(rep["_fuentes"]) | set(r["_fuentes"]))
        rep["_ids"] = rep["_ids"] + r["_ids"]
        rep["_enlaces"] = (rep["_enlaces"] + r["_enlaces"])[:3]
        rep["nivel"] = max(rep["nivel"], r["nivel"])
        rep["fall"] = max(rep.get("fall") or 0, r.get("fall") or 0)
        rep["her"] = max(rep.get("her") or 0, r.get("her") or 0)
        rep["_contradice"] = rep.get("_contradice") or r.get("_contradice")
        if rep.get("lat") is None and r.get("lat") is not None:
            rep["lat"], rep["lon"], rep["metodo"], rep["lugar"] = r["lat"], r["lon"], r.get("metodo"), r.get("lugar")
    rep["_n"] = 1
    dep, mun = rp.ubicar(rep, geo)
    ub = ", ".join(x for x in [mun, dep] if x) or (rep.get("lugar") or "no determinada")

    filas_f = []
    max_f, max_h = rep.get("fall") or 0, rep.get("her") or 0
    for e in items:
        t, est, real = textos.get(e["id"], ("", "no es una nota de prensa", e.get("url")))
        ft, ht = cifras(t) if t else (0, 0)
        if not str(e["id"]).startswith("noticia:") and (e.get("detalle") or "").strip():
            t, est = "", "registro ingresado a mano (sin nota de prensa)"
        ha, hn = menciones(t, ("herid", "lesionad")) if t else (0, 0)
        fa, fn = menciones(t, ("fallecid", "muert", "muri")) if t else (0, 0)
        h_tit_v = e.get("her") or 0
        tit_limpio = re.sub(r" - [^-]+$", "", e["titulo"])
        if str(e["id"]).startswith("noticia:") and h_tit_v == 1 and cifras(tit_limpio)[1] == 0 and re.search(r"herid|lesionad", norm(tit_limpio)):
            h_tit_v = 0  # «varios heridos»: el motor lo cuenta como 1, pero el titular no da cifra
            ha = max(ha, 1)
        filas_f.append({"e": e, "texto": t, "estado": est, "h_ev": evidencia(t, "h") if t else "", "f_ev": evidencia(t, "f") if t else "", "h_afirma": ha, "f_niega": fn, "f_afirma": fa, "url": real or e.get("url"), "f_tit": e.get("fall") or 0, "h_tit": h_tit_v,
                        "f_txt": ft, "h_txt": ht, "frases": frases_clave(t, e["titulo"]) if t else ([e["detalle"].strip()[:600]] if not str(e["id"]).startswith("noticia:") and (e.get("detalle") or "").strip() else [])})
    fvals = sorted({v for r in filas_f for v in (r["f_tit"], r["f_txt"]) if v > 0})
    hvals = sorted({v for r in filas_f for v in (r["h_tit"], r["h_txt"]) if v > 0})
    max_f = max(fvals or [0]); max_h = max(hvals or [0])

    def quien(campo_t, campo_x, v):
        return ", ".join(sorted({r["e"]["fuente"] for r in filas_f if v in (r[campo_t], r[campo_x])}))
    det_f = "; ".join(f"{v} según {quien('f_tit', 'f_txt', v)}" for v in fvals)
    det_h = "; ".join(f"{v} según {quien('h_tit', 'h_txt', v)}" for v in hvals)
    leidas = sum(1 for r in filas_f if r["texto"])

    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("fn", "Helvetica"), **k)
    st = {"h2": S("h2", fontSize=11.5, leading=14, textColor=colors.HexColor(rp.ACC), fn="Helvetica-Bold", spaceBefore=9, spaceAfter=4),
          "p": S("p", fontSize=8.6, leading=11.6, textColor=colors.HexColor(rp.INK)),
          "pm": S("pm", fontSize=7.2, leading=9.4, textColor=colors.HexColor(rp.MUT)),
          "q": S("q", fontSize=8.2, leading=11, textColor=colors.HexColor("#27303d"), leftIndent=8, borderPadding=(1, 0, 1, 6)),
          "cell": S("cell", fontSize=7.4, leading=9, textColor=colors.HexColor(rp.INK)),
          "cellh": S("cellh", fontSize=7.4, leading=9, textColor=colors.white, fn="Helvetica-Bold")}
    W, H = A4
    ahora_s = rp.hora(ahora).strftime("%d/%m/%Y %H:%M")
    nivel = rep["nivel"]
    titulo = "Informe de hecho"

    def pie(c, d):
        c.saveState(); c.setStrokeColor(colors.HexColor("#c9cfd8")); c.line(15 * mm, 13 * mm, W - 15 * mm, 13 * mm)
        c.setFont("Helvetica", 6.5); c.setFillColor(colors.HexColor(rp.MUT))
        c.drawString(15 * mm, 9.5 * mm, f"Sala de Situación — Bolivia · Generado {ahora_s} (hora La Paz) · Información de prensa, preliminar y sin confirmar")
        c.drawString(15 * mm, 6 * mm, "El nivel de color es preliminar (heurística propia) y no corresponde a una declaratoria de alerta de la Ley 602.")
        c.drawRightString(W - 15 * mm, 9.5 * mm, f"Pág. {d.page}"); c.restoreState()

    def cab(c, d):
        c.saveState(); c.setFillColor(colors.HexColor("#0f3d6e")); c.rect(0, H - 30 * mm, W, 30 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 16); c.drawString(15 * mm, H - 13 * mm, titulo)
        c.setFont("Helvetica", 9); c.setFillColor(colors.HexColor("#dbe6f3"))
        c.drawString(15 * mm, H - 20 * mm, (rep["titulo"][:110] + "…") if len(rep["titulo"]) > 110 else rep["titulo"])
        c.setFont("Helvetica", 7.5)
        c.drawString(15 * mm, H - 26 * mm, f"{len(items)} nota(s) de {len(rep['_fuentes'])} fuente(s) · {leidas} leída(s) con texto" + (f" · búsqueda: «{consulta}»" if consulta else ""))
        c.restoreState(); pie(c, d)

    doc = BaseDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=16 * mm, title=titulo, author="Sala de Situación Bolivia")
    fr1 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 34 * mm, id="f1", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    fr2 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 15 * mm, id="f2", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate("p1", [fr1], onPage=cab), PageTemplate("p2", [fr2], onPage=pie)])
    el = []

    # 1. Ficha
    primera, ultima = rp.hora(items[0]["ts"]), rp.hora(items[-1]["ts"])
    coord = f'{rep["lat"]:.4f}, {rep["lon"]:.4f}' if rep.get("lat") is not None else "sin coordenadas"
    metodo = rep.get("metodo") or "método no registrado"
    h_sc = max_h == 0 and any(r["h_afirma"] for r in filas_f)
    f_niega = max_f == 0 and any(r["f_niega"] for r in filas_f)
    f_sc = max_f == 0 and any(r["f_afirma"] for r in filas_f)
    txt_h = ("0 con cifra — las notas mencionan heridos pero no dan el número" if h_sc else f"{max_h}") + (f"  — las fuentes difieren: {det_h}" if len(hvals) > 1 else "")
    txt_f = ("0 con cifra — las notas mencionan fallecidos pero no dan el número" if f_sc else "0 — las notas indican que no hay fallecidos" if f_niega else f"{max_f}") + (f"  — las fuentes difieren: {det_f}" if len(fvals) > 1 else "")
    ficha = [["Tipo de amenaza", rep["tipo"]],
             ["Primera nota / última nota", f'{primera:%d/%m/%Y %H:%M} / {ultima:%d/%m/%Y %H:%M} (hora La Paz)'],
             ["Lugar", f"{ub} — {coord} ({metodo})"],
             ["Fallecidos (máximo reportado)", txt_f],
             ["Heridos (máximo reportado)", txt_h],
             ["Gravedad preliminar CCES", f"{rp.NOM[nivel]} (criterio propio por víctimas; no es una alerta oficial)"]]
    tf = Table([[Paragraph(f"<b>{a}</b>", st["cell"]), Paragraph(esc(b), st["cell"])] for a, b in ficha], colWidths=[48 * mm, W - 30 * mm - 48 * mm])
    tf.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d3d8df")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f7")),
                            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el.append(Paragraph("1. Identificación del hecho", st["h2"])); el.append(tf)

    # 2. Resumen consolidado (construido con reglas, no inventa nada)
    fuentes = ", ".join(rep["_fuentes"])
    partes = [f"Entre las {primera:%H:%M} y las {ultima:%H:%M} del {primera:%d/%m/%Y}, {len(rep['_fuentes'])} fuente(s) de prensa ({esc(fuentes)}) publicaron {len(items)} nota(s) sobre este hecho ({esc(rep['tipo'])})."]
    solo_registro = all(not str(e["id"]).startswith("noticia:") for e in items)
    if solo_registro:
        partes[0] = (f"Hecho registrado a mano ({esc(fuentes)}) el {primera:%d/%m/%Y a las %H:%M}. No proviene de una nota de prensa: los datos son los que declaró "
                     f"quien lo registró y no están verificados ({esc(rep['tipo'])}).")
    if ub and ub != "no determinada":
        partes.append(f"Ubicación: {esc(ub)} (determinada por: {esc(metodo)}).")
    else:
        partes.append("Ninguna nota permitió ubicar el hecho con certeza; no se dibuja en el mapa.")
    if max_f or max_h:
        partes.append(f"Cifras de prensa: hasta {max_f} fallecido(s) y {max_h} herido(s)." + (" <b>Las fuentes no coinciden</b>: se detallan abajo." if len(fvals) > 1 or len(hvals) > 1 else " Las fuentes que dan cifras coinciden."))
    else:
        partes.append("Ninguna nota da cifras de fallecidos ni de heridos.")
    if h_sc:
        partes.append("Las notas hablan de heridos (por ejemplo «varios») pero no precisan cuántos.")
    if f_niega:
        partes.append("Las notas indican que no hubo fallecidos.")
    if not solo_registro:
        partes.append(f"Se pudo leer el texto de {leidas} de {len(items)} nota(s); en las demás solo se dispone del titular.")
    el.append(Paragraph("2. Resumen consolidado", st["h2"])); el.append(Paragraph(" ".join(partes), st["p"]))

    # 3. Mapa
    if rep.get("lat") is not None:
        el.append(Paragraph("3. Ubicación", st["h2"]))
        el.append(Image(rp.mapa_png(geo, [rep], [rep], 6.4, 4.4), width=(W - 30 * mm) * .8, height=(W - 30 * mm) * .8 * 4.4 / 6.4, hAlign="CENTER"))
    el.append(NextPageTemplate("p2")); el.append(PageBreak())

    # 4. Cifras por fuente
    el.append(Paragraph("4. Cifras por fuente (comparación)", st["h2"]))
    tb = [[Paragraph(x, st["cellh"]) for x in ["Hora", "Fuente", "Fall. (titular)", "Her. (titular)", "Fall. (texto)", "Her. (texto)", "Lectura de la nota"]]]
    for r in filas_f:
        e = r["e"]
        tb.append([Paragraph(f'{rp.hora(e["ts"]):%d/%m %H:%M}', st["cell"]), Paragraph(esc(e["fuente"]), st["cell"]), Paragraph(str(r["f_tit"]), st["cell"]),
                   Paragraph(str(r["h_tit"]), st["cell"]), Paragraph(("s/c" if r["f_txt"] == 0 and r["f_afirma"] else str(r["f_txt"])) if r["texto"] else "—", st["cell"]),
                   Paragraph(("s/c" if r["h_txt"] == 0 and r["h_afirma"] else str(r["h_txt"])) if r["texto"] else "—", st["cell"]), Paragraph(esc(r["estado"]), st["cell"])])
    t = Table(tb, colWidths=[18 * mm, 32 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm, W - 30 * mm - 114 * mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d3d8df")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
    el.append(t)
    if len(hvals) > 1 or len(fvals) > 1:
        el.append(Spacer(1, 2 * mm))
        el.append(Paragraph("<b>De dónde sale cada cifra que difiere</b> (frase literal de la nota; verifique si cuenta a todos los heridos o solo a un grupo):", st["pm"]))
        for etiqueta, campo_t, campo_x, campo_ev, vals in (("Heridos", "h_tit", "h_txt", "h_ev", hvals), ("Fallecidos", "f_tit", "f_txt", "f_ev", fvals)):
            if len(vals) < 2:
                continue
            for r in filas_f:
                v = r[campo_x] if r[campo_x] else r[campo_t]
                if v and v in vals:
                    ev = r[campo_ev] if r[campo_x] and r[campo_ev] else re.sub(r" - [^-]+$", "", r["e"]["titulo"])
                    el.append(Paragraph(f'{etiqueta}: <b>{v}</b> — {esc(r["e"]["fuente"])} ({rp.hora(r["e"]["ts"]):%d/%m %H:%M}): «{esc(ev)}»', st["pm"]))
    el.append(Paragraph("«Titular» = cifra que aparece en el título; «texto» = mayor cifra detectada en el cuerpo de la nota por reglas automáticas (puede equivocarse: verifique en la nota). «s/c» = la nota menciona el dato pero sin cifra (p. ej. «varios heridos»). No se suman cifras de distintas notas porque cuentan a las mismas personas.", st["pm"]))

    # 5. Cronología y citas
    el.append(Paragraph("5. Cronología y detalle por fuente (citas textuales)", st["h2"]))
    citadas = {}
    for r in filas_f:
        e = r["e"]
        nuevas, comparte = [], []
        for f in r["frases"]:
            k = norm(re.sub(r"\s+", " ", f))[:80]
            if k in citadas:
                if citadas[k] not in comparte:
                    comparte.append(citadas[k])
            else:
                citadas[k] = e["fuente"]; nuevas.append(f)
        r["frases_nuevas"], r["comparte"] = nuevas, comparte
        bloque = [Paragraph(f'<b>{rp.hora(e["ts"]):%d/%m/%Y %H:%M} · {esc(e["fuente"])}</b> — {esc(re.sub(r" - [^-]+$", "", e["titulo"]))}', st["p"])]
        if r["frases"]:
            for f in r["frases_nuevas"]:
                bloque.append(Paragraph("«" + esc(f) + "»", st["q"]))
            if r["comparte"]:
                bloque.append(Paragraph("Otras frases de esta nota repiten, casi igual, lo ya citado de: " + esc(", ".join(r["comparte"])) + ".", st["pm"]))
        else:
            bloque.append(Paragraph("Solo se dispone del titular de esta nota." if not r["texto"] else "El texto no contiene frases con datos identificables.", st["pm"]))
        if r["url"]:
            bloque.append(Paragraph(f'Enlace: {esc(r["url"])}', st["pm"]))
        bloque.append(Spacer(1, 2.5 * mm))
        if e.get("_repetidas"):
            bloque.insert(-2, Paragraph(f'Esta nota apareció {e["_repetidas"] + 1} veces (versión normal y AMP o duplicado); se muestra una sola vez.', st["pm"]))
        el.append(KeepTogether(bloque[:3])); el.extend(bloque[3:])

    # 6. Pendiente
    el.append(Paragraph("6. Pendiente de confirmar", st["h2"]))
    pend = ["Cifras oficiales de fallecidos y heridos (red de salud, policía, bomberos)."]
    if len(fvals) > 1 or len(hvals) > 1:
        pend.append("Las fuentes dan cifras distintas; confirmar cuál es la correcta.")
    if rep.get("lat") is None or "aprox" in (metodo or ""):
        pend.append("Ubicación exacta (municipio, comunidad o tramo).")
    if solo_registro:
        pend.append("Verificar el hecho con el establecimiento de salud, la policía u otra fuente oficial: el registro no está verificado.")
    elif leidas < len(items):
        pend.append("Algunas notas no se pudieron leer completas: revisar su enlace.")
    if h_sc:
        pend.append("Número de heridos: las notas no lo precisan.")
    pend.append("Causa del hecho y atención recibida (si las notas no la precisan).")
    for p in pend:
        el.append(Paragraph("• " + esc(p), st["p"]))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph("Nota metodológica: las notas provienen de Google Noticias. Cada texto se lee desde la página del medio cuando éste lo permite. Las citas son frases literales de la nota (no están corregidas). Las cifras de víctimas son del texto de prensa, preliminares y sin validar.", st["pm"]))
    doc.build(el)
    return {"notas": len(items), "repetidas_unidas": n_original - len(items), "leidas": leidas, "fuentes": len(rep["_fuentes"]), "fall": max_f, "her": max_h}

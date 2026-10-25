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
    """Los enlaces de Google Noticias son redirecciones: se intenta obtener la dirección real del medio."""
    if "news.google.com" not in url:
        return url
    try:
        from googlenewsdecoder import gnewsdecoder
        r = gnewsdecoder(url, interval=1)
        if r.get("status") and r.get("decoded_url"):
            return r["decoded_url"]
    except Exception:
        pass
    return url


def descargar(url, tiempo=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-419,es;q=0.9", "Accept": "text/html,application/xhtml+xml"})
    with urllib.request.urlopen(req, timeout=tiempo) as r:
        raw = r.read(2_500_000)
        cs = r.headers.get_content_charset() or "utf-8"
        return raw.decode(cs, errors="replace"), r.geturl()


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
        real = resolver(url)
        html, final = descargar(real)
        t = texto_principal(html).strip()
        if len(t) >= 500:
            return t, "texto completo", final
        if len(t) >= 150:
            return t, "texto parcial", final
        return "", "solo titular (la página no entregó el texto: puede requerir suscripción)", final
    except Exception as e:
        return "", f"solo titular (no se pudo abrir: {type(e).__name__})", url


# ---------------------------------------------------------------- extracción
def _valor(s):
    s = norm(s)
    return int(s) if s.isdigit() else NUM.get(s)


_UNIDAD = {"de", "horas", "hrs", "h", "km", "kilometro", "kilometros", "metro", "metros", "mts", "ano", "anos", "minutos", "dias", "meses", "por", "bs", "bolivianos"}


def cifras(texto):
    """Mayores cifras de fallecidos y heridos que menciona un texto (cifras de prensa, sin validar).
    Para cada palabra clave busca el número más cercano antes (hasta 5 palabras) o, si no hay, justo después."""
    t = norm(texto)
    fall = her = 0
    for frase in re.split(r"[.;!?\n]+", t):
        tok = re.findall(r"[a-z0-9%]+", frase)
        for i, w in enumerate(tok):
            if w.startswith(("fallecid", "muert", "muri", "perdieron")):
                tipo = "f"
            elif w.startswith(("herid", "lesionad")):
                tipo = "h"
            else:
                continue
            v = None
            for j in range(i - 1, max(i - 13, -1), -1):
                x = tok[j]
                if x.startswith(("fallecid", "muert", "muri", "herid", "lesionad")):
                    break
                n = int(x) if x.isdigit() else NUM.get(x)
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


def frases_clave(texto, titulo="", max_n=5):
    """Frases textuales de la nota con más información (cifras, lugar, circunstancias). Se citan sin modificar."""
    if not texto:
        return []
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
def agrupar_items(evs):
    """Como agrupar_hechos, pero devuelve las listas de notas de cada hecho."""
    grupos = []
    for e in evs:
        f = rp._ficha(e["titulo"]) if str(e["id"]).startswith("noticia:") else None
        hallado = None
        if f is not None:
            for g in grupos:
                if g["f"] is not None and g["tipo"] == e["tipo"] and rp._similitud(g["f"], f) >= 0.5:
                    hallado = g; break
        if hallado:
            hallado["items"].append(e)
        else:
            grupos.append({"tipo": e["tipo"], "f": f, "items": [e]})
    return [g["items"] for g in grupos]


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
    rep = rp.agrupar_hechos([dict(e) for e in items])[0]
    rep["_n"] = 1
    dep, mun = rp.ubicar(rep, geo)
    ub = ", ".join(x for x in [mun, dep] if x) or (rep.get("lugar") or "no determinada")

    filas_f = []
    max_f, max_h = rep.get("fall") or 0, rep.get("her") or 0
    for e in items:
        t, est, real = textos.get(e["id"], ("", "no es una nota de prensa", e.get("url")))
        ft, ht = cifras(t) if t else (0, 0)
        filas_f.append({"e": e, "texto": t, "estado": est, "url": real or e.get("url"), "f_tit": e.get("fall") or 0, "h_tit": e.get("her") or 0,
                        "f_txt": ft, "h_txt": ht, "frases": frases_clave(t, e["titulo"])})
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
    ficha = [["Tipo de amenaza", rep["tipo"]],
             ["Primera nota / última nota", f'{primera:%d/%m/%Y %H:%M} / {ultima:%d/%m/%Y %H:%M} (hora La Paz)'],
             ["Lugar", f"{ub} — {coord} ({metodo})"],
             ["Fallecidos (máximo reportado)", f"{max_f}" + (f"  — las fuentes difieren: {det_f}" if len(fvals) > 1 else "")],
             ["Heridos (máximo reportado)", f"{max_h}" + (f"  — las fuentes difieren: {det_h}" if len(hvals) > 1 else "")],
             ["Gravedad preliminar CCES", f"{rp.NOM[nivel]} (criterio propio por víctimas; no es una alerta oficial)"]]
    tf = Table([[Paragraph(f"<b>{a}</b>", st["cell"]), Paragraph(esc(b), st["cell"])] for a, b in ficha], colWidths=[48 * mm, W - 30 * mm - 48 * mm])
    tf.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d3d8df")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f7")),
                            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el.append(Paragraph("1. Identificación del hecho", st["h2"])); el.append(tf)

    # 2. Resumen consolidado (construido con reglas, no inventa nada)
    fuentes = ", ".join(rep["_fuentes"])
    partes = [f"Entre las {primera:%H:%M} y las {ultima:%H:%M} del {primera:%d/%m/%Y}, {len(rep['_fuentes'])} fuente(s) de prensa ({esc(fuentes)}) publicaron {len(items)} nota(s) sobre este hecho ({esc(rep['tipo'])})."]
    if ub and ub != "no determinada":
        partes.append(f"Ubicación: {esc(ub)} (determinada por: {esc(metodo)}).")
    else:
        partes.append("Ninguna nota permitió ubicar el hecho con certeza; no se dibuja en el mapa.")
    if max_f or max_h:
        partes.append(f"Cifras de prensa: hasta {max_f} fallecido(s) y {max_h} herido(s)." + (" <b>Las fuentes no coinciden</b>: se detallan abajo." if len(fvals) > 1 or len(hvals) > 1 else " Las fuentes que dan cifras coinciden."))
    else:
        partes.append("Ninguna nota informa fallecidos ni heridos.")
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
                   Paragraph(str(r["h_tit"]), st["cell"]), Paragraph(str(r["f_txt"]) if r["texto"] else "—", st["cell"]),
                   Paragraph(str(r["h_txt"]) if r["texto"] else "—", st["cell"]), Paragraph(esc(r["estado"]), st["cell"])])
    t = Table(tb, colWidths=[18 * mm, 32 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm, W - 30 * mm - 114 * mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d3d8df")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
    el.append(t)
    el.append(Paragraph("«Titular» = cifra que aparece en el título; «texto» = mayor cifra detectada en el cuerpo de la nota por reglas automáticas (puede equivocarse: verifique en la nota). No se suman cifras de distintas notas porque cuentan a las mismas personas.", st["pm"]))

    # 5. Cronología y citas
    el.append(Paragraph("5. Cronología y detalle por fuente (citas textuales)", st["h2"]))
    for r in filas_f:
        e = r["e"]
        bloque = [Paragraph(f'<b>{rp.hora(e["ts"]):%d/%m/%Y %H:%M} · {esc(e["fuente"])}</b> — {esc(re.sub(r" - [^-]+$", "", e["titulo"]))}', st["p"])]
        if r["frases"]:
            for f in r["frases"]:
                bloque.append(Paragraph("«" + esc(f) + "»", st["q"]))
        else:
            bloque.append(Paragraph("Solo se dispone del titular de esta nota." if not r["texto"] else "El texto no contiene frases con datos identificables.", st["pm"]))
        bloque.append(Paragraph(f'Enlace: {esc(r["url"])}', st["pm"]))
        bloque.append(Spacer(1, 2.5 * mm))
        el.append(KeepTogether(bloque[:3])); el.extend(bloque[3:])

    # 6. Pendiente
    el.append(Paragraph("6. Pendiente de confirmar", st["h2"]))
    pend = ["Cifras oficiales de fallecidos y heridos (red de salud, policía, bomberos)."]
    if len(fvals) > 1 or len(hvals) > 1:
        pend.append("Las fuentes dan cifras distintas; confirmar cuál es la correcta.")
    if rep.get("lat") is None or "aprox" in (metodo or ""):
        pend.append("Ubicación exacta (municipio, comunidad o tramo).")
    if leidas < len(items):
        pend.append("Algunas notas no se pudieron leer completas: revisar su enlace.")
    pend.append("Causa del hecho y atención recibida (si las notas no la precisan).")
    for p in pend:
        el.append(Paragraph("• " + esc(p), st["p"]))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph("Nota metodológica: las notas provienen de Google Noticias. Cada texto se lee desde la página del medio cuando éste lo permite. Las citas son frases literales de la nota (no están corregidas). Las cifras de víctimas son del texto de prensa, preliminares y sin validar.", st["pm"]))
    doc.build(el)
    return {"notas": len(items), "leidas": leidas, "fuentes": len(rep["_fuentes"]), "fall": max_f, "her": max_h}

# -*- coding: utf-8 -*-
"""Informe específico de BROTES / alertas epidemiológicas (OPS/OMS) y su relación con Bolivia.
Pedidos típicos: «brote hoy», «alerta OPS hoy», «ébola», «dengue», «sarampión últimos 7 días».
Fuentes: alertas y actualizaciones epidemiológicas de OPS (paho.org), Disease Outbreak News de la OMS (who.int), boletín epidemiológico del Ministerio de Salud y Deportes.
No inventa: reproduce el texto oficial (en su idioma original), extrae cifras citadas y marca si la alerta menciona a Bolivia o a países vecinos."""
import re, json, os, datetime as dt, unicodedata
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, KeepTogether
import reporte_pdf as rp

TZ = rp.TZ
GENERICAS = {"brote", "brotes", "epidemia", "epidemias", "epidemiologica", "epidemiologico", "epidemiologicas", "epidemiologicos", "ops", "oms", "paho", "who",
             "alerta", "alertas", "enfermedad", "enfermedades", "vigilancia", "internacional", "actualizacion", "actualizaciones", "informe", "reporte"}
ENFERMEDADES = {"dengue", "ebola", "bundibugyo", "marburg", "sarampion", "chikungunya", "zika", "fiebre", "amarilla", "influenza", "gripe", "aviar", "covid", "coronavirus",
                "mers", "colera", "malaria", "paludismo", "rabia", "mpox", "viruela", "polio", "difteria", "tos", "ferina", "pertussis", "neumonia", "miasis", "oropouche", "meningitis",
                "hantavirus", "leptospirosis", "tuberculosis", "fiebre", "nipah", "lassa", "cuaresma"}
VECINOS = ["Brasil", "Brazil", "Perú", "Peru", "Chile", "Argentina", "Paraguay"]
RUIDO = {"de", "del", "la", "el", "en", "los", "las", "hoy", "ayer", "ultimas", "ultimos", "horas", "hora", "dias", "dia", "y", "por", "un", "una", "para"}


def norm(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


def es_consulta_brote(q):
    t = set(re.findall(r"[a-z0-9]+", norm(q)))
    return bool(t & GENERICAS) or bool(t & ENFERMEDADES)


def parsear(q, horas, ahora):
    toks = re.findall(r"[a-z0-9]+", norm(q))
    clave = [w for w in toks if w not in GENERICAS and w not in RUIDO and not w.isdigit()]
    hoy = ahora.date()
    if "hoy" in toks:
        return clave, hoy, hoy, f"hoy ({hoy:%d/%m/%Y})"
    if "ayer" in toks:
        a = hoy - dt.timedelta(days=1)
        return clave, a, a, f"ayer ({a:%d/%m/%Y})"
    dias = max(1, round(horas / 24))
    return clave, hoy - dt.timedelta(days=dias), hoy, f"últimos {dias} día(s)"


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def limpiar_html(h):
    h = re.sub(r"<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", h)
    t = re.sub(r"&nbsp;", " ", t); t = re.sub(r"&amp;", "&", t)
    return re.sub(r"\s+", " ", t).strip()


def oraciones(t):
    return [s.strip() for s in re.split(r"(?<=[\.\!\?])\s+(?=[A-ZÁÉÍÓÚÑ0-9])", t) if 40 <= len(s.strip()) <= 420]


CIFRA = re.compile(r"\d[\d\.,  ]*\s*(casos|cases|defunciones|deaths|muertes|fallecid|confirmad|confirmed|sospechos|suspected|hospitalizad|letalidad|fatality)", re.I)


def analizar(item, texto):
    base = texto or item.get("resumen") or ""
    ora = oraciones(base)
    cif = [s for s in ora if CIFRA.search(s)][:4]
    resumen = " ".join(ora[:4])[:900] if ora else (item.get("resumen") or "")[:600]
    bol = [s for s in ora if re.search(r"\bBolivia\b", s)][:3]
    vec = sorted({v for v in VECINOS if re.search(r"\b" + v + r"\b", base)})
    return {"resumen": resumen, "cifras": cif, "bolivia": bol, "vecinos": vec, "texto_completo": bool(texto)}


def informe(epi, geo_unused, salida, consulta="", horas=168, ahora=None, leer=None):
    """epi: contenido de epidemio_oficial.json. leer(url)->texto (puede fallar; entonces se usa el resumen guardado)."""
    ahora = ahora or dt.datetime.now(TZ)
    clave, d0, d1, periodo = parsear(consulta, horas, ahora)
    todos = list(epi.get("internacional") or [])
    def en_periodo(x):
        try:
            return d0 <= dt.date.fromisoformat(x["fecha"]) <= d1
        except Exception:
            return False
    def coincide(x):
        c = norm(" ".join([x.get("titulo", ""), x.get("slug", ""), x.get("resumen", "")]))
        return all(k in c for k in clave) if clave else True
    sel = sorted([x for x in todos if en_periodo(x) and coincide(x)], key=lambda x: x["fecha"], reverse=True)[:6]
    aviso = ""
    if not sel:
        previas = sorted([x for x in todos if coincide(x)], key=lambda x: x["fecha"], reverse=True)[:3]
        sel = previas
        aviso = (f"No se publicaron alertas de OPS/OMS en el período solicitado ({periodo})" + (f" sobre «{' '.join(clave)}»" if clave else "") +
                 (". Se muestran las más recientes disponibles." if previas else ". Tampoco hay publicaciones anteriores registradas con ese tema."))
    fichas = []
    for x in sel:
        txt = ""
        if leer:
            try:
                txt = limpiar_html(leer(x["url"]))
            except Exception:
                txt = ""
        fichas.append((x, analizar(x, txt)))
    bol = next(iter(epi.get("boletines") or []), None)
    frases_bol = []
    if bol:
        fr = bol.get("frases") or []
        frases_bol = [f for f in fr if clave and any(k in norm(f) for k in clave)] or ([] if clave else fr[:3])

    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("fn", "Helvetica"), **k)
    st = {"h2": S("h2", fontSize=11.5, leading=14, textColor=colors.HexColor(rp.ACC), fn="Helvetica-Bold", spaceBefore=9, spaceAfter=4),
          "h3": S("h3", fontSize=9.6, leading=12, textColor=colors.HexColor(rp.INK), fn="Helvetica-Bold", spaceBefore=6),
          "p": S("p", fontSize=8.6, leading=11.6, textColor=colors.HexColor(rp.INK)),
          "pm": S("pm", fontSize=7.4, leading=9.6, textColor=colors.HexColor(rp.MUT)),
          "q": S("q", fontSize=8.1, leading=10.8, textColor=colors.HexColor("#27303d"), leftIndent=8),
          "c": S("c", fontSize=7.8, leading=9.8, textColor=colors.HexColor(rp.INK))}
    W, H = A4
    titulo = "Informe de vigilancia epidemiológica" + (f" — {' '.join(clave).title()}" if clave else "")
    gen = ahora.strftime("%d/%m/%Y %H:%M")

    def pie(c, d):
        c.saveState(); c.setStrokeColor(colors.HexColor("#c9cfd8")); c.line(15 * mm, 13 * mm, W - 15 * mm, 13 * mm)
        c.setFont("Helvetica", 6.5); c.setFillColor(colors.HexColor(rp.MUT))
        c.drawString(15 * mm, 9.5 * mm, f"Sala de Situación — Bolivia · Generado {gen} (hora La Paz) · Fuentes: OPS/OMS y Ministerio de Salud y Deportes (publicaciones oficiales)")
        c.drawString(15 * mm, 6 * mm, "Resumen automático del texto oficial; ante decisiones, consulte el documento original. Los textos de la OMS están en su idioma original (inglés).")
        c.drawRightString(W - 15 * mm, 9.5 * mm, f"Pág. {d.page}"); c.restoreState()

    def cab(c, d):
        c.saveState(); c.setFillColor(colors.HexColor("#0f3d6e")); c.rect(0, H - 28 * mm, W, 28 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 15); c.drawString(15 * mm, H - 13 * mm, titulo[:70])
        c.setFont("Helvetica", 9); c.setFillColor(colors.HexColor("#dbe6f3")); c.drawString(15 * mm, H - 20 * mm, f"Período: {periodo} · {len(fichas)} publicación(es)")
        c.restoreState(); pie(c, d)

    doc = BaseDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=16 * mm, title=titulo, author="Sala de Situación Bolivia")
    fr1 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 32 * mm, id="f1", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    fr2 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 15 * mm, id="f2", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate("p1", [fr1], onPage=cab), PageTemplate("p2", [fr2], onPage=pie)])
    el = []
    men_bol = [f for f in fichas if f[1]["bolivia"]]
    men_vec = [f for f in fichas if f[1]["vecinos"]]
    el.append(Paragraph("1. Resumen para Bolivia", st["h2"]))
    if aviso:
        el.append(Paragraph(esc(aviso), st["p"]))
    if fichas:
        r = [f"{len(fichas)} publicación(es) revisada(s)."]
        r.append(("Mencionan a Bolivia (revise el contexto: puede ser para indicar que no hay casos): " + "; ".join(esc(f[0]["titulo"][:70]) for f in men_bol) + ".") if men_bol else
                 "Ninguna de las publicaciones revisadas menciona a Bolivia.")
        if men_vec:
            r.append("Mencionan países limítrofes: " + "; ".join(f"{esc(f[0]['titulo'][:50])} ({', '.join(f[1]['vecinos'])})" for f in men_vec) + ".")
        sin_txt = [f for f in fichas if not f[1]["texto_completo"]]
        if sin_txt:
            r.append(f"En {len(sin_txt)} publicación(es) no se pudo leer el texto completo; se usó el resumen publicado, por lo que la mención a Bolivia no pudo verificarse en ellas.")
        el.append(Paragraph(" ".join(r), st["p"]))
    if bol:
        el.append(Paragraph("2. Situación en Bolivia (Ministerio de Salud y Deportes)", st["h2"]))
        el.append(Paragraph(f"Último boletín epidemiológico: semana {esc(bol.get('semana'))} ({esc(bol.get('periodo'))}). <a href=\"{esc(bol.get('url'))}\" color=\"#0b5cab\">Ver boletín</a>", st["p"]))
        if frases_bol:
            for f in frases_bol:
                el.append(Paragraph("• " + esc(f), st["q"]))
        elif clave:
            el.append(Paragraph(f"El último boletín no menciona «{esc(' '.join(clave))}» entre sus puntos destacados.", st["pm"]))
    el.append(Paragraph("3. Publicaciones de OPS/OMS", st["h2"]))
    for x, a in fichas:
        bloque = [Paragraph(esc(x["titulo"]), st["h3"]),
                  Paragraph(f"{esc(x['fuente'])} · {esc(x['fecha'])} · <a href=\"{esc(x['url'])}\" color=\"#0b5cab\">documento original</a>", st["pm"]),
                  Spacer(1, 2), Paragraph(esc(a["resumen"] or "Sin resumen disponible."), st["p"])]
        if a["cifras"]:
            bloque.append(Paragraph("<b>Cifras citadas en el texto:</b>", st["c"]))
            bloque += [Paragraph("• " + esc(s), st["q"]) for s in a["cifras"]]
        if a["bolivia"]:
            bloque.append(Paragraph("<b>Menciona a Bolivia (revise el contexto):</b>", st["c"]))
            bloque += [Paragraph("• " + esc(s), st["q"]) for s in a["bolivia"]]
        elif a["vecinos"]:
            bloque.append(Paragraph("Menciona países limítrofes: " + esc(", ".join(a["vecinos"])) + ".", st["c"]))
        el.append(KeepTogether(bloque))
    if not fichas:
        el.append(Paragraph("No hay publicaciones para mostrar.", st["p"]))
    doc.build(el)
    return {"n": len(fichas), "bolivia": len(men_bol), "vecinos": len(men_vec), "periodo": periodo, "tema": " ".join(clave), "sin_periodo": bool(aviso)}

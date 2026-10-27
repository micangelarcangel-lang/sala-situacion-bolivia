# -*- coding: utf-8 -*-
"""Informe específico de SISMOS (fuente oficial: Observatorio San Calixto, osc.org.bo) por lugar y período.
Pedido típico (desde la página «Pedir» o el botón de GitHub): «sismo hoy», «sismo Potosí», «sismo La Paz 72 horas».
Salida: PDF con mapa, resumen, tabla y criterio técnico. No usa niveles de alerta propios: solo magnitud y profundidad."""
import io, json, os, re, datetime as dt, unicodedata
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, Image
import reporte_pdf as rp

TZ = rp.TZ
PALABRAS_SISMO = ("sismo", "sismos", "temblor", "temblores", "terremoto")


def norm(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


def es_consulta_sismo(q):
    return any(w in norm(q).split() for w in PALABRAS_SISMO)


def parsear(q, horas, ahora):
    """Devuelve (lugar, desde_datetime, etiqueta_periodo)."""
    t = norm(q)
    toks = [w for w in re.findall(r"[a-z0-9ñ]+", t)]
    quitar = set(PALABRAS_SISMO) | {"hoy", "ayer", "de", "del", "la", "el", "en", "ultimas", "ultimos", "horas", "hora", "dias", "dia", "los", "las"}
    lugar = " ".join(w for w in toks if w not in quitar and not w.isdigit())
    ahora_l = ahora.astimezone(TZ)
    if "hoy" in toks:
        desde = ahora_l.replace(hour=0, minute=0, second=0, microsecond=0)
        et = f"hoy ({desde:%d/%m/%Y})"
    elif "ayer" in toks:
        desde = ahora_l.replace(hour=0, minute=0, second=0, microsecond=0) - dt.timedelta(days=1)
        et = f"ayer ({desde:%d/%m/%Y})"
    else:
        desde = ahora_l - dt.timedelta(hours=horas)
        et = f"últimas {horas} horas"
    return lugar, desde, et


def clase(m):
    # clasificación usual de magnitud (USGS)
    if m < 2: return "Micro"
    if m < 4: return "Menor"
    if m < 5: return "Leve"
    if m < 6: return "Moderado"
    if m < 7: return "Fuerte"
    return "Mayor"


def filtrar(sismos, lugar, desde, hasta):
    out = []
    for s in sismos:
        try:
            f = dt.datetime.strptime(s["fecha_local"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=TZ)
        except Exception:
            continue
        if not (desde <= f <= hasta):
            continue
        if lugar:
            campo = norm(" ".join(str(s.get(k) or "") for k in ("departamento", "provincia")))
            if not all(w in campo for w in lugar.split()):
                continue
        s = dict(s); s["_f"] = f; out.append(s)
    return sorted(out, key=lambda s: s["_f"], reverse=True)


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def mapa(geo, sis):
    fig, ax = plt.subplots(figsize=(6.4, 5.4), dpi=200)
    ax.set_facecolor("#eaf1f7")
    rp.dibujar_poligonos(ax, geo["dep"], fc="#f7f8fa", ec="#6b7686", lw=.8)
    for u in geo["dep"]:
        c = u["_s"].representative_point()
        ax.text(c.x, c.y, u["n"].upper(), fontsize=5.2, color="#8792a2", ha="center", va="center", style="italic", clip_on=True)
    for s in sis:
        sup = s["prof_km"] <= 100
        ax.scatter(s["lon"], s["lat"], s=18 + (max(s["mag"], 1) ** 2.6) * 4, c="#c62828" if sup else "#5b6b82", alpha=.78, edgecolors="white", linewidths=.8, zorder=5)
    if sis:
        lons = [s["lon"] for s in sis]; lats = [s["lat"] for s in sis]
        if len(sis) > 1 and (max(lons) - min(lons) < 9):
            m = 1.8; ax.set_xlim(min(lons) - m, max(lons) + m); ax.set_ylim(min(lats) - m, max(lats) + m)
        else:
            ax.set_xlim(-69.9, -57.2); ax.set_ylim(-23.1, -9.4)
    ax.set_aspect(1 / 0.95); ax.set_xticks([]); ax.set_yticks([])
    h = [plt.Line2D([], [], marker="o", ls="", mfc="#c62828", mec="white", ms=7, label="Profundidad ≤ 100 km"),
         plt.Line2D([], [], marker="o", ls="", mfc="#5b6b82", mec="white", ms=7, label="Profundidad > 100 km")]
    ax.legend(handles=h, loc="lower left", fontsize=6, frameon=True, title="Tamaño = magnitud", title_fontsize=6.5)
    buf = io.BytesIO(); fig.tight_layout(pad=.3); fig.savefig(buf, format="png"); plt.close(fig); buf.seek(0)
    return buf


def informe(sismos, geo, salida, consulta="", horas=24, ahora=None):
    ahora = ahora or dt.datetime.now(TZ)
    lugar, desde, periodo = parsear(consulta, horas, ahora)
    sis = filtrar(sismos, lugar, desde, ahora)
    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("fn", "Helvetica"), **k)
    st = {"h2": S("h2", fontSize=11.5, leading=14, textColor=colors.HexColor(rp.ACC), fn="Helvetica-Bold", spaceBefore=9, spaceAfter=4),
          "p": S("p", fontSize=8.8, leading=12, textColor=colors.HexColor(rp.INK)),
          "pm": S("pm", fontSize=7.4, leading=9.6, textColor=colors.HexColor(rp.MUT)),
          "c": S("c", fontSize=7.8, leading=9.6, textColor=colors.HexColor(rp.INK)),
          "ch": S("ch", fontSize=7.8, leading=9.6, textColor=colors.white, fn="Helvetica-Bold")}
    W, H = A4
    titulo = "Informe de sismos" + (f" — {lugar.title()}" if lugar else " — Bolivia")
    gen = ahora.strftime("%d/%m/%Y %H:%M")

    def pie(c, d):
        c.saveState(); c.setStrokeColor(colors.HexColor("#c9cfd8")); c.line(15 * mm, 13 * mm, W - 15 * mm, 13 * mm)
        c.setFont("Helvetica", 6.5); c.setFillColor(colors.HexColor(rp.MUT))
        c.drawString(15 * mm, 9.5 * mm, f"Sala de Situación — Bolivia · Generado {gen} (hora La Paz) · Fuente: Observatorio San Calixto (osc.org.bo)")
        c.drawString(15 * mm, 6 * mm, "Datos preliminares del boletín sísmico; pueden ser revisados por el observatorio. No constituye alerta oficial.")
        c.drawRightString(W - 15 * mm, 9.5 * mm, f"Pág. {d.page}"); c.restoreState()

    def cab(c, d):
        c.saveState(); c.setFillColor(colors.HexColor("#0f3d6e")); c.rect(0, H - 28 * mm, W, 28 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 16); c.drawString(15 * mm, H - 13 * mm, titulo)
        c.setFont("Helvetica", 9); c.setFillColor(colors.HexColor("#dbe6f3"))
        c.drawString(15 * mm, H - 20 * mm, f"Período: {periodo}" + (f" · Lugar: {lugar.title()}" if lugar else ""))
        c.restoreState(); pie(c, d)

    doc = BaseDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=16 * mm, title=titulo, author="Sala de Situación Bolivia")
    fr1 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 32 * mm, id="f1", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    fr2 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 15 * mm, id="f2", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate("p1", [fr1], onPage=cab), PageTemplate("p2", [fr2], onPage=pie)])
    el = []
    if not sis:
        el.append(Paragraph("Resultado", st["h2"]))
        el.append(Paragraph(f"El Observatorio San Calixto no registra sismos en el boletín para ese período y lugar ({esc(periodo)}"
                            + (f", «{esc(lugar)}»" if lugar else "") + "). Esto no descarta eventos pequeños aún no publicados; el boletín se actualiza durante el día.", st["p"]))
        doc.build(el)
        return {"n": 0, "mayor": None}
    mayor = max(sis, key=lambda s: s["mag"])
    prom = sum(s["mag"] for s in sis) / len(sis)
    sup = [s for s in sis if s["prof_km"] <= 100]
    deps = {}
    for s in sis:
        deps[s["departamento"]] = deps.get(s["departamento"], 0) + 1
    ficha = [["Sismos registrados", f"{len(sis)} (superficiales ≤ 100 km: {len(sup)}; profundos: {len(sis) - len(sup)})"],
             ["Mayor magnitud", f"M {mayor['mag']:.1f} ({clase(mayor['mag'])}) — {mayor['provincia']}, {mayor['departamento']} — {mayor['_f']:%d/%m/%Y %H:%M} — {mayor['prof_km']:.0f} km de profundidad"],
             ["Más reciente", f"M {sis[0]['mag']:.1f} — {sis[0]['provincia']}, {sis[0]['departamento']} — {sis[0]['_f']:%d/%m/%Y %H:%M}"],
             ["Por departamento", ", ".join(f"{d} {n}" for d, n in sorted(deps.items(), key=lambda x: -x[1]))],
             ["Magnitud promedio", f"{prom:.1f}"]]
    tf = Table([[Paragraph(f"<b>{a}</b>", st["c"]), Paragraph(esc(b), st["c"])] for a, b in ficha], colWidths=[40 * mm, W - 30 * mm - 40 * mm])
    tf.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d3d8df")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f7")),
                            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el += [Paragraph("1. Resumen", st["h2"]), tf]
    sentido = [s for s in sis if s["mag"] >= 4.0 and s["prof_km"] <= 100]
    if sentido:
        nota = f"{len(sentido)} sismo(s) con magnitud ≥ 4,0 y profundidad ≤ 100 km: posiblemente sentidos por la población (criterio del sistema, basado en la clasificación de magnitud y en que los sismos de más de 100 km rara vez se sienten)."
    else:
        nota = "Ningún sismo cumple a la vez magnitud ≥ 4,0 y profundidad ≤ 100 km; es poco probable que hayan sido sentidos por la población."
    el += [Spacer(1, 4), Paragraph(esc(nota), st["p"])]
    el += [Paragraph("2. Ubicación", st["h2"]), Image(mapa(geo, sis), width=150 * mm, height=150 * mm * 5.4 / 6.4)]
    filas = [[Paragraph(h, st["ch"]) for h in ("Fecha y hora (La Paz)", "Mag.", "Clase", "Prof. km", "Provincia", "Departamento", "Coordenadas")]]
    for s in sis[:80]:
        filas.append([Paragraph(f"{s['_f']:%d/%m/%Y %H:%M}", st["c"]), Paragraph(f"<b>{s['mag']:.1f}</b>", st["c"]), Paragraph(clase(s["mag"]), st["c"]),
                      Paragraph(f"{s['prof_km']:.0f}", st["c"]), Paragraph(esc(s["provincia"]), st["c"]), Paragraph(esc(s["departamento"]), st["c"]),
                      Paragraph(f"{s['lat']:.2f}, {s['lon']:.2f}", st["c"])])
    t = Table(filas, colWidths=[33 * mm, 12 * mm, 18 * mm, 15 * mm, 35 * mm, 30 * mm, 37 * mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d3d8df")),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    el += [Paragraph("3. Detalle de cada sismo", st["h2"]), t]
    if len(sis) > 80:
        el.append(Paragraph(f"Se muestran los 80 más recientes de {len(sis)}.", st["pm"]))
    el += [Paragraph("4. Criterio técnico", st["h2"]),
           Paragraph("Clases de magnitud según la clasificación usual del USGS (micro &lt;2, menor 2–3,9, leve 4–4,9, moderado 5–5,9, fuerte 6–6,9, mayor ≥7). "
                     "La profundidad es relevante porque los sismos de foco profundo (&gt;100 km) rara vez se perciben en superficie. "
                     "El informe no asigna niveles de alerta: solo reproduce lo publicado por el Observatorio San Calixto.", st["pm"])]
    doc.build(el)
    return {"n": len(sis), "mayor": mayor["mag"], "mayor_lugar": f"{mayor['provincia']}, {mayor['departamento']}", "periodo": periodo, "lugar": lugar,
            "sentido": len(sentido)}

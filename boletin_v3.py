# -*- coding: utf-8 -*-
"""Boletín de situación de UN hecho (formato de centro coordinador): lo que se sabe, dónde, qué falta y qué se pide.
La triangulación se usa para ESCRIBIR cada hallazgo (el estado indica si coincide o discrepa); las fuentes y el método van al final, en pequeño."""
import json, datetime as dt, math
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle, FancyArrowPatch, Circle
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
import estilo_graficos as eg
from informe_ampliatorio_v3 import e, AZUL, GRIS, ROJO, VERDE, AMBAR

P = lambda n, **k: ParagraphStyle(n, fontName=k.pop("f", "Helvetica"), **k)
H2 = P("h2", fontSize=9.5, leading=12, textColor=colors.HexColor(AZUL), f="Helvetica-Bold", spaceBefore=8, spaceAfter=3)
T = P("t", fontSize=8.8, leading=12)
TB = P("tb", fontSize=8.2, leading=10.6)
TS = P("ts", fontSize=6.8, leading=8.8, textColor=colors.HexColor(GRIS))
TH = P("th", fontSize=7.2, leading=9, textColor=colors.white, f="Helvetica-Bold")
ROT = P("rot", fontSize=6.6, leading=8.4, textColor=colors.HexColor("#33404e"))


def _hav(a, b):
    R = 6371; p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1] - a[1]); dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def mapa(pts):
    """Cada versión del lugar que dan las fuentes, ubicada; la distancia entre versiones dice si hablan de la misma zona."""
    gm = json.load(open("docs/geo_mun.geojson", encoding="utf-8"))
    fig, ax = plt.subplots(figsize=(4.6, 2.35)); fig.patch.set_facecolor("white")
    la = [p["lat"] for p in pts]; lo = [p["lon"] for p in pts]; pad = max(.006, (max(la) - min(la)) * .35, (max(lo) - min(lo)) * .35)
    cx, cy = sum(lo) / len(lo), sum(la) / len(la)
    pol = lambda g: [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for f in gm["features"]:
        for q in pol(f["geometry"]):
            ax.add_patch(Polygon(q[0], closed=True, fc="#eef1f5", ec="#aab4c0", lw=.8))
    col = {"A": AZUL, "B": ROJO}
    for p in pts:
        c = col.get(p.get("version", "A"), AZUL)
        ax.scatter([p["lon"]], [p["lat"]], s=70, c=c, edgecolor="white", lw=1.5, zorder=5)
        ax.annotate(p["nombre"], (p["lon"], p["lat"]), xytext=(7, 6), textcoords="offset points", fontsize=7, color="#1b2430", zorder=6,
                    bbox=dict(boxstyle="round,pad=.15", fc="white", ec="none", alpha=.8))
    A_ = [p for p in pts if p.get("version", "A") == "A"]; B_ = [p for p in pts if p.get("version") == "B"]
    if A_ and B_:
        a = (sum(p["lat"] for p in A_) / len(A_), sum(p["lon"] for p in A_) / len(A_)); b = (sum(p["lat"] for p in B_) / len(B_), sum(p["lon"] for p in B_) / len(B_))
        ax.plot([a[1], b[1]], [a[0], b[0]], color="#555", lw=1, ls=(0, (3, 3)), zorder=4)
        ax.annotate(f"{_hav(a, b):.1f} km entre versiones", ((a[1] + b[1]) / 2, (a[0] + b[0]) / 2), xytext=(0, 14), textcoords="offset points", fontsize=7.2, ha="center", color="#333", fontweight="bold",
                    bbox=dict(boxstyle="round,pad=.2", fc="#fff8e1", ec="#e0c060", lw=.6))
    ax.set_xlim(min(lo) - pad * 1.4, max(lo) + pad * 1.4); ax.set_ylim(min(la) - pad, max(la) + pad)
    ax.set_aspect(1 / math.cos(math.radians(cy))); ax.axis("off")
    # escala 1 km
    xs = ax.get_xlim()[0] + (ax.get_xlim()[1] - ax.get_xlim()[0]) * .05; ys = ax.get_ylim()[0] + (ax.get_ylim()[1] - ax.get_ylim()[0]) * .06
    dl = 1 / (111.0 * math.cos(math.radians(cy))); ax.plot([xs, xs + dl], [ys, ys], color="#333", lw=2); ax.text(xs + dl / 2, ys + (ax.get_ylim()[1] - ax.get_ylim()[0]) * .03, "1 km", fontsize=6.5, ha="center")
    fig.tight_layout(pad=.2); return eg.png(fig, dpi=220, tight=False)


def esquema(vehiculo="CAMIÓN DE CARGA", victima="CICLISTA"):
    """Esquema ilustrativo de la interacción vial (no reproduce la escena)."""
    fig, ax = plt.subplots(figsize=(7.2, 1.25)); fig.patch.set_facecolor("white")
    ax.set_xlim(0, 100); ax.set_ylim(0, 24); ax.axis("off")
    ax.add_patch(Rectangle((0, 3), 100, 18, fc="#e4e7ec", ec="none"))
    for x in range(2, 100, 10): ax.plot([x, x + 5], [12, 12], color="white", lw=2)
    ax.add_patch(Rectangle((0, 3), 100, 1.2, fc="#aab4c0", ec="none")); ax.add_patch(Rectangle((0, 19.8), 100, 1.2, fc="#aab4c0", ec="none"))
    ax.add_patch(Rectangle((8, 13.6), 30, 5.2, fc="#5d7186", ec="white", lw=1.2)); ax.add_patch(Rectangle((8, 13.6), 8, 5.2, fc="#3c4c5c", ec="white", lw=1.2))
    ax.text(27, 16.2, vehiculo, color="white", fontsize=7 if len(vehiculo) < 17 else 5.6, ha="center", va="center", fontweight="bold")
    ax.add_patch(FancyArrowPatch((39, 16.2), (58, 16.2), arrowstyle="-|>", mutation_scale=10, color="#5d7186", lw=1.4))
    ax.add_patch(Circle((70, 7.2), 1.6, fc="none", ec=AZUL, lw=1.6)); ax.add_patch(Circle((77, 7.2), 1.6, fc="none", ec=AZUL, lw=1.6)); ax.plot([70, 73.5, 77], [7.2, 9.6, 7.2], color=AZUL, lw=1.6)
    ax.text(73.5, 4.6, victima, color=AZUL, fontsize=7, ha="center", fontweight="bold")
    ax.add_patch(Circle((66, 12), 3.2, fc="none", ec=ROJO, lw=1.2, ls=(0, (2, 2)))); ax.text(66, 21.6, "punto de impacto: no confirmado", color=ROJO, fontsize=6.8, ha="center")
    fig.tight_layout(pad=.1); return eg.png(fig, dpi=200, tight=False)


def _qr(url, tam=24 * mm):
    w = qr.QrCodeWidget(url); b = w.getBounds(); d = Drawing(tam, tam, transform=[tam / (b[2] - b[0]), 0, 0, tam / (b[3] - b[1]), 0, 0]); d.add(w); return d


def _tab(filas, anchos, cab, estcol=None):
    data = [[Paragraph(c, TH) for c in cab]] + filas
    t = Table(data, colWidths=anchos, repeatRows=1)
    st = [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZUL)), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 1), (-1, -1), .4, colors.HexColor("#d9dee4")),
          ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
    t.setStyle(TableStyle(st)); return t


def estado_color(s):
    s = s.lower()
    return ROJO if "discrep" in s else (AMBAR if ("pendiente" in s or "sin dato" in s) else VERDE)


def build(B, salida):
    W = A4[0] - 26 * mm; S = []

    def pie(c, d):
        c.saveState(); c.setFillColor(colors.HexColor(AZUL)); c.rect(0, A4[1] - 8 * mm, A4[0], 8 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 7.5); c.drawString(13 * mm, A4[1] - 5.2 * mm, "CENTRO COORDINADOR DE EMERGENCIAS EN SALUD · SALA DE SITUACIÓN BOLIVIA")
        c.setFont("Helvetica", 7.5); c.drawRightString(A4[0] - 13 * mm, A4[1] - 5.2 * mm, "Para: Máxima Autoridad Ejecutiva · circulación restringida")
        c.setFillColor(colors.HexColor(GRIS)); c.setFont("Helvetica", 6.8)
        c.drawString(13 * mm, 8 * mm, "Boletín elaborado con fuentes abiertas. No sustituye los informes oficiales, médico-forenses, fiscales ni consulares.")
        c.drawRightString(A4[0] - 13 * mm, 8 * mm, f"{B['codigo']} · pág. {d.page}"); c.restoreState()

    S += [Spacer(1, 2 * mm), Paragraph(f'<font size="17" color="{AZUL}"><b>BOLETÍN DE SITUACIÓN</b></font>', P("bt", fontSize=17, leading=22)), Paragraph(e(B["titulo"]), P("sub", fontSize=10.5, leading=13.5, textColor=colors.HexColor("#1b2430"), f="Helvetica-Bold")), Spacer(1, 2 * mm)]
    meta = [[Paragraph(f'<font size="6.6" color="{GRIS}">{k}</font><br/><b>{e(v)}</b>', TB) for k, v in B["meta"]]]
    t = Table(meta, colWidths=[W / len(B["meta"])] * len(B["meta"])); t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef3f9")), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LINEBEFORE", (0, 0), (0, 0), 3, colors.HexColor(AZUL))])); S += [t]
    S += [Paragraph("SÍNTESIS OPERATIVA", H2), Paragraph(e(B["sintesis"]), T), Spacer(1, 2 * mm)]
    kp = [[Paragraph(f'<font size="15" color="{AZUL}"><b>{e(a)}</b></font>', P("k", alignment=1, leading=18)) for a, _ in B["kpis"]], [Paragraph(e(b), P("kl", fontSize=7, leading=8.6, textColor=colors.HexColor(GRIS), alignment=1)) for _, b in B["kpis"]]]
    t = Table(kp, colWidths=[W / len(B["kpis"])] * len(B["kpis"])); t.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), .5, colors.HexColor("#d9dee4")), ("LINEBELOW", (0, 1), (-1, 1), .5, colors.HexColor("#d9dee4")), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)])); S += [t, Spacer(1, 3 * mm)]
    # mapa + identificación
    izq = [Paragraph("LOCALIZACIÓN: VERSIONES DE LOS REPORTES", H2)]
    if len(B.get("puntos", [])) >= 2:
        izq += [eg.imagen(mapa(B["puntos"]), W * .58), Paragraph(("<font color='%s'><b>Azul</b></font>: versión inicial · <font color='%s'><b>rojo</b></font>: versión posterior. " % (AZUL, ROJO) if any(p.get("version") == "B" for p in B["puntos"]) else "") + "Ubicación de referencia por OpenStreetMap, no coordenada confirmada del impacto. " + e(B.get("nota_mapa", "")), TS)]
    else:
        izq += [Paragraph("No hay dos o más lugares ubicados con precisión; el punto exacto requiere croquis policial.", TS)]
    der = [Paragraph("IDENTIFICACIÓN", H2), Paragraph("<b>%s</b>" % e(B["victima"]["nombre"]), P("n", fontSize=10, leading=12.5, textColor=colors.HexColor(AZUL))), Paragraph(e(B["victima"]["detalle"]), TB), Spacer(1, 2 * mm)]
    if B.get("foto_url"):
        der += [_qr(B["foto_url"]), Paragraph("Retrato difundido por %s. Escanee el código para abrir la fuente original. No es una imagen del accidente." % e(B.get("foto_medio", "un medio")), TS)]
    der += [Paragraph("Escena del siniestro: no se localizó fotografía verificable del impacto; no se incorpora material no autenticado.", TS)]
    t = Table([[izq, der]], colWidths=[W * .63, W * .37]); t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)])); S += [t]
    S += [Paragraph("ESQUEMA ILUSTRATIVO DE INTERACCIÓN VIAL", H2), eg.imagen(esquema(B.get("vehiculo", "CAMIÓN DE CARGA")), W),
          Paragraph("Representación conceptual; no reproduce la escena ni determina la mecánica del impacto. Debe sustituirse por el croquis, fotografías y peritaje oficiales.", TS)]
    S += [Paragraph("SITUACIÓN OPERATIVA Y ACCIONES", H2), Paragraph(e(B["operativa"]), T), Spacer(1, 2 * mm)]
    S += [_tab([[Paragraph(str(i + 1), TB), Paragraph(e(a[0]), TB), Paragraph(e(a[1]), TB), Paragraph("<b>%s</b>" % e(a[2]), TB)] for i, a in enumerate(B["acciones"])], [6 * mm, W - 6 * mm - 44 * mm - 16 * mm, 44 * mm, 16 * mm], ["#", "Acción", "Responsable sugerido", "Plazo"])]
    # página 2
    S += [PageBreak(), Paragraph("CADENA DE ATENCIÓN Y SITUACIÓN POSTERIOR", H2)]
    S += [_tab([[Paragraph("<b>%s</b>" % e(a), TB), Paragraph(e(b), TB), Paragraph('<font color="%s">%s</font>' % (estado_color(c), e(c)), TB)] for a, b, c in B["trazabilidad"]], [33 * mm, W - 33 * mm - 58 * mm, 58 * mm], ["DIMENSIÓN", "QUÉ SE SABE", "ESTADO"])]
    S += [Paragraph("RECONSTRUCCIÓN CRONOLÓGICA", H2), _tab([[Paragraph("<b>%s</b>" % e(a), TB), Paragraph(e(b), TB)] for a, b in B["cronologia"]], [30 * mm, W - 30 * mm], ["CUÁNDO", "QUÉ"])]
    S += [Paragraph("RECONSTRUCCIÓN PRELIMINAR", H2), Paragraph(e(B["reconstruccion"]), T), Paragraph("<b>Vacíos prioritarios:</b> " + e("; ".join(B["vacios"])) + ".", T)]
    # fuentes y método reducidos
    vis = {}
    for n, f in B.get("fuentes", []):
        vis.setdefault(n, f)
    fu = list(vis.items()); nc = 3; filas_n = (len(fu) + nc - 1) // nc
    filas = [[Paragraph("%s · %s" % (e(fu[k][0]), e(fu[k][1])) if k < len(fu) else "", ROT) for k in (i, i + filas_n, i + 2 * filas_n)] for i in range(filas_n)]
    S += [Paragraph("FUENTES Y MÉTODO", H2), Paragraph(e(B["metodo"]), TS)]
    if filas:
        t = Table(filas, colWidths=[W / 3] * 3); t.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("LEFTPADDING", (0, 0), (-1, -1), 0)])); S += [t]
    doc = SimpleDocTemplate(salida, pagesize=A4, leftMargin=13 * mm, rightMargin=13 * mm, topMargin=12 * mm, bottomMargin=13 * mm, title=B["titulo"], author="Sala de Situación Bolivia")
    doc.build(S, onFirstPage=pie, onLaterPages=pie)


if __name__ == "__main__":
    import sys
    build(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2])

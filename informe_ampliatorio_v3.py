# -*- coding: utf-8 -*-
"""Informe ampliatorio v3 de UN hecho (por solicitud de la MAE).
Entrada: un JSON de análisis (informes_ampliatorios/<id>.json) + datos del hecho en datos/v3/hechos.json.
Salida: PDF de 4 páginas: ficha y resumen · cronología y ubicación · triangulación y repercusión · trazabilidad y seguimiento.
No incluye fotografías de personas tomadas de medios (derechos y respeto a la familia); enlaza el material original."""
import json, sys, datetime as dt
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
import estilo_graficos as eg

BO = dt.timezone(dt.timedelta(hours=-4))
AZUL, GRIS, ROJO, VERDE, AMBAR = "#0b3d6e", "#5b6b7a", "#c0392b", "#1e8c5a", "#b7791f"
P = lambda n, **k: ParagraphStyle(n, fontName=k.pop("f", "Helvetica"), **k)
H1 = P("h1", fontSize=19, leading=23, textColor=colors.HexColor(AZUL), f="Helvetica-Bold")
H2 = P("h2", fontSize=11.5, leading=14, textColor=colors.HexColor(AZUL), f="Helvetica-Bold", spaceBefore=10, spaceAfter=4)
T = P("t", fontSize=9, leading=12.2)
TS = P("ts", fontSize=7.6, leading=10, textColor=colors.HexColor(GRIS))
TB = P("tb", fontSize=8.6, leading=11.4)
TH = P("th", fontSize=8, leading=10, textColor=colors.white, f="Helvetica-Bold")
LEAD = P("lead", fontSize=10.2, leading=14.2)


def e(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def mapa(geo_mun, geo_dep, lat, lon):
    pol = lambda g: [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(7.2, 3.3), gridspec_kw={"width_ratios": [1, 1.05]}); fig.patch.set_facecolor("white")
    for f in geo_dep["features"]:
        for p in pol(f["geometry"]):
            a.add_patch(Polygon(p[0], closed=True, fc="#0b3d6e" if f["properties"]["n"] == "La Paz" else "#eceae5", ec="white", lw=.8))
    a.autoscale_view(); a.set_aspect("equal"); a.axis("off"); a.set_title("Bolivia · departamento de La Paz", fontsize=8.5, loc="left", fontweight=600)
    xs, ys = [], []
    for f in geo_mun["features"]:
        if f["properties"]["d"] != "La Paz":
            continue
        ea = f["properties"]["n"] == "El Alto"
        for p in pol(f["geometry"]):
            b.add_patch(Polygon(p[0], closed=True, fc="#c0392b" if ea else "#e6edf5", ec="white", lw=.5, zorder=3 if ea else 2))
            xs += [q[0] for q in p[0]]; ys += [q[1] for q in p[0]]
    b.scatter([lon], [lat], s=34, c="#111", edgecolor="white", lw=1.4, zorder=5)
    b.annotate("El Alto\n(ubicación aproximada:\nmunicipio)", (lon, lat), xytext=(lon + 1.7, lat + 1.9), fontsize=7, arrowprops=dict(arrowstyle="-", color="#555", lw=.7), color="#222", zorder=6)
    b.set_xlim(min(xs) - .1, max(xs) + .1); b.set_ylim(min(ys) - .1, max(ys) + .1); b.set_aspect("equal"); b.axis("off")
    b.set_title("Municipios de La Paz", fontsize=8.5, loc="left", fontweight=600)
    fig.tight_layout()
    return eg.png(fig, dpi=200, tight=False)


def tabla(filas, anchos, cab=None, estados=None, zebra=True):
    datos = ([[Paragraph(c, TH) for c in cab]] if cab else []) + filas
    t = Table(datos, colWidths=anchos, repeatRows=1 if cab else 0)
    st = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), .4, colors.HexColor("#d9dee4")), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    if cab:
        st += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZUL))]
    return t, st


def build(analisis_ruta, hechos_ruta, salida):
    A = json.load(open(analisis_ruta, encoding="utf-8")); H = json.load(open(hechos_ruta, encoding="utf-8"))[A["hecho_id"]]
    gm, gd = json.load(open("docs/geo_mun.geojson", encoding="utf-8")), json.load(open("docs/geo_dep.geojson", encoding="utf-8"))
    W = A4[0] - 30 * mm; S = []

    def pie(c, d):
        c.saveState(); c.setFont("Helvetica", 7); c.setFillColor(colors.HexColor(GRIS))
        c.drawString(15 * mm, 9 * mm, f"{A['codigo']} · Informe preliminar basado en fuentes abiertas · Sala de Situación Bolivia · corte {A['corte']}")
        c.drawRightString(A4[0] - 15 * mm, 9 * mm, f"Pág. {d.page}"); c.restoreState()
        c.setFillColor(colors.HexColor(AZUL)); c.rect(0, A4[1] - 7 * mm, A4[0], 7 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 7.5); c.drawString(15 * mm, A4[1] - 4.8 * mm, "SALA DE SITUACIÓN BOLIVIA · INFORME AMPLIATORIO")
        c.setFont("Helvetica", 7.5); c.drawRightString(A4[0] - 15 * mm, A4[1] - 4.8 * mm, f"Solicitado por: {A['solicitado_por']}")
    # ---- página 1
    S += [Spacer(1, 4 * mm), Paragraph(A["codigo"] + " · " + e(A["clasificacion"]), TS), Paragraph(e(A["titulo"]), H1), Spacer(1, 3 * mm)]
    S += [Paragraph("Resumen", H2), Paragraph(e(A["resumen"]), LEAD), Paragraph("Ficha del hecho", H2)]
    t, st = tabla([[Paragraph("<b>" + e(k) + "</b>", TB), Paragraph(e(v), TB)] for k, v in A["ficha"]], [32 * mm, W - 32 * mm])
    t.setStyle(TableStyle(st)); S += [t]
    S += [Spacer(1, 3 * mm), Paragraph("<b>Imágenes.</b> Este informe no incorpora fotografías del fallecido tomadas de medios: la familia pidió respeto y privacidad y las imágenes tienen derechos de autor. El material gráfico original se enlaza en la página 4. Si se requiere una foto para uso institucional, debe pedirse a la Policía, la Fiscalía o la Embajada.", TS), PageBreak()]
    # ---- página 2
    S += [Paragraph("Cronología", H2)]
    t, st = tabla([[Paragraph("<b>" + e(a) + "</b>", TB), Paragraph(e(b), TB)] for a, b in A["cronologia"]], [34 * mm, W - 34 * mm]); t.setStyle(TableStyle(st)); S += [t]
    S += [Paragraph("Dónde ocurrió", H2), eg.imagen(mapa(gm, gd, H["lat"], H["lon"]), W)]
    S += [Paragraph("Cómo leer: el punto marca el municipio de El Alto, que es la ubicación que da el sistema. Las fuentes dan dos puntos distintos dentro de El Alto (ver triangulación), por eso no se dibuja un punto más exacto.", TS)]
    S += [Paragraph("Qué todavía no se sabe", H2)] + [Paragraph("• " + e(x), TB) for x in A["no_se_sabe"]] + [PageBreak()]
    # ---- página 3
    S += [Paragraph("Triangulación: qué dice cada fuente", H2), Paragraph("Cada dato se contrastó entre las notas leídas completas. «Coincide» = al menos dos medios independientes; «Fuente única» = un solo medio; «DISCREPA» = versiones distintas.", TS), Spacer(1, 2 * mm)]
    col = {"Coincide": VERDE, "Coincide (indirecta)": VERDE, "DISCREPA": ROJO, "DISCREPA (secundario)": AMBAR, "Fuente única": AMBAR, "Sin confirmar": AMBAR}
    filas = [[Paragraph("<b>" + e(a) + "</b>", TB), Paragraph(e(b), TB), Paragraph(f'<font color="{col.get(c, GRIS)}"><b>{e(c)}</b></font>', TB)] for a, b, c in A["triangulacion"]]
    t, st = tabla(filas, [32 * mm, W - 32 * mm - 27 * mm, 27 * mm], cab=["Dato", "Lo que dice cada fuente", "Estado"]); t.setStyle(TableStyle(st)); S += [t]
    S += [Paragraph("Repercusión", H2), Paragraph("<b>Nacional (%d):</b> %s" % (len(A["medios_nacionales"]), e(", ".join(A["medios_nacionales"]))), TB),
          Paragraph("<b>Internacional (%d):</b> %s" % (len(A["medios_internacionales"]), e(", ".join(A["medios_internacionales"]))), TB),
          Paragraph("<b>Leídos completos (%d):</b> %s. El resto, solo por titular." % (len(A["leidos_completos"]), e(", ".join(A["leidos_completos"]))), TB), PageBreak()]
    # ---- página 4
    S += [Paragraph("Seguimiento sugerido", H2)] + [Paragraph("• " + e(x), TB) for x in A["seguimiento"]]
    S += [Paragraph("Trazabilidad", H2)]
    ts = lambda ms: dt.datetime.fromtimestamp(ms / 1000, BO).strftime("%d/%m/%Y %H:%M")
    S += [Paragraph(f"<b>Hecho en el sistema:</b> {e(H['id'])} · {e(H['subtipo'])} · {len(H['notas'])} notas capturadas automáticamente ({ts(H['primera'])} a {ts(H['ultima'])} hora de Bolivia) · ubicación: precisión «{e(H['precision'])}».", TB),
          Paragraph("<b>Límite del sistema automático:</b> capturó 2 notas (Eju.tv y Red Uno) y le dio confianza baja por tener una sola fuente independiente. La búsqueda ampliada que sustenta este informe halló al menos 17 medios. La ampliación de la captura a más fuentes es la fase 1 del plan.", TB),
          Paragraph("<b>Método:</b> lectura completa de 7 notas, comparación dato por dato, y atribución de cada cifra a su fuente. Cuando una nota cita a otra (por ejemplo Unitel), se anota «vía». No se usó ningún dato sin fuente.", TB),
          Paragraph("<b>Cifras:</b> 1 fallecido (confirmado por familia y por todos los medios). Heridos: ninguno reportado.", TB), Paragraph("Fuentes consultadas", H2)]
    t, st = tabla([[Paragraph(e(n), TB), Paragraph('<font size="6.5">' + e(u) + "</font>", TB), Paragraph(e(f), TS)] for n, u, f in A["fuentes"]], [38 * mm, W - 38 * mm - 20 * mm, 20 * mm], cab=["Medio", "Enlace", "Nota"]); t.setStyle(TableStyle(st)); S += [t]
    SimpleDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm, title=A["titulo"], author="Sala de Situación Bolivia").build(S, onFirstPage=pie, onLaterPages=pie)


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], sys.argv[3])

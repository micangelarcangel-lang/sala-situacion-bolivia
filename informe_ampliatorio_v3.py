# -*- coding: utf-8 -*-
"""Informe ampliatorio v3 de UN hecho (por solicitud de la MAE).
Entrada: un JSON de análisis (informes_ampliatorios/<id>.json) + datos del hecho en datos/v3/hechos.json.
Salida: PDF de 4 páginas: ficha y resumen · cronología y ubicación · triangulación y repercusión · trazabilidad y seguimiento.
No incluye fotografías de personas tomadas de medios (derechos y respeto a la familia); enlaza el material original."""
import json, sys, textwrap, datetime as dt
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


def linea_tiempo(A):
    """Hecho y proceso (arriba) y repercusión (abajo) en el mismo eje de tiempo; lo pendiente va hueco y a la derecha de «hoy»."""
    import datetime as d
    fig, (a, b) = plt.subplots(2, 1, figsize=(7.2, 3.3), sharex=True, gridspec_kw={"height_ratios": [1.25, 1]}); fig.patch.set_facecolor("white")
    X = lambda dia, h=0: dia + h / 24
    if A.get("hitos"):
        hechos = [(X(h["dia"], h.get("hora", 0)), textwrap.fill(h["texto"], 16), 1 if h.get("hecho") else 0, 1 if i % 2 == 0 else -1) for i, h in enumerate(sorted(A["hitos"], key=lambda h: (h["dia"], h.get("hora", 0))))]
    else:
        hechos = [(X(4, 9.5), "Atropello\n~9:30", 1, 1), (X(4, 15), "Conductor\naprehendido\n(horas después)", 1, -1), (X(5, 12), "Familia y amigo\nconfirman la muerte", 1, 1),
                  (X(6, 21.4), "Cancillería: coordina\nrepatriación", 1, -1), (X(7.9), "Imputación y\nmedidas cautelares", 0, 1), (X(8.5), "Traslado de\nlos restos", 0, -1)]
    hoy = X(7, 8.75)
    a.axvspan(hoy, 9.2, color="#f3f1ec", zorder=0); a.axvline(hoy, color="#555", lw=.8, ls=(0, (3, 3)))
    a.text(hoy + .05, 1.62, "hoy 7/11", fontsize=7, color="#444"); a.text(9.15, 1.62, "por confirmar", fontsize=7, color="#7a7a7a", ha="right")
    a.axhline(0, color="#9aa5b1", lw=1)
    for x, t, ok, up in hechos:
        a.scatter([x], [0], s=62, zorder=3, facecolor=AZUL if ok else "white", edgecolor=AZUL, lw=1.6)
        a.annotate(t, (x, 0), xytext=(x, .75 * up), fontsize=7.2, ha="center", va="bottom" if up > 0 else "top", color="#1b2430" if ok else "#6b7785",
                   arrowprops=dict(arrowstyle="-", color="#b4bcc6", lw=.7))
    a.set_ylim(-1.75, 1.9); a.axis("off"); a.set_title("Hecho y proceso", fontsize=8.8, loc="left", fontweight=600)
    col = {"BO": AZUL, "KR": ROJO, "OT": "#8a96a3"}; por = {}
    for f, n, p in A["cobertura"]:
        dia = int(f[-2:]); k = por.setdefault(dia, []); k.append((n, p))
    for dia, L in por.items():
        L = sorted(L, key=lambda x: x[1])
        for r, (n, p) in enumerate(L[:7]):
            b.scatter([dia + .5], [r], s=70, color=col[p], zorder=3, edgecolor="white", lw=1.2)
            b.text(dia + .62, r, n, fontsize=6.4, va="center", color="#33404e")
        if len(L) > 7:
            b.text(dia + .5, 7, f"+{len(L) - 7} medios más", fontsize=6.4, ha="left", color="#33404e")
    b.set_ylim(-.7, 8); b.set_xlim(4, 9.2)
    for sp in ("top", "right", "left"): b.spines[sp].set_visible(False)
    b.set_yticks([]); b.set_xticks([4.5, 5.5, 6.5, 7.5, 8.5]); b.set_xticklabels(["mié 4/11", "jue 5/11", "vie 6/11", "sáb 7/11", "dom 8/11"], fontsize=7.6, color="#5b6b7a")
    b.tick_params(length=0); b.set_title("Repercusión: un punto por medio con fecha verificada", fontsize=8.8, loc="left", fontweight=600)
    from matplotlib.lines import Line2D
    b.legend(handles=[Line2D([0], [0], marker="o", color="w", markerfacecolor=c, markersize=7, label=l) for l, c in (("Bolivia", AZUL), ("Corea del Sur", ROJO), ("Otros países", "#8a96a3"))], fontsize=7, frameon=False, loc="upper right")
    fig.tight_layout(); return eg.png(fig, dpi=200, tight=False)


def _hav(a, b):
    import math
    R = 6371; p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1] - a[1]); dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def mapa_lugar(pts):
    """Las referencias de lugar que dan las fuentes, con coordenadas de OpenStreetMap y su separación: sirve para ver si las versiones son la misma zona."""
    gm = json.load(open("docs/geo_mun.geojson", encoding="utf-8"))
    fig, ax = plt.subplots(figsize=(6.4, 3.6)); fig.patch.set_facecolor("white")
    la = [p["lat"] for p in pts]; lo = [p["lon"] for p in pts]; pad = .018
    x0, x1, y0, y1 = min(lo) - pad, max(lo) + pad, min(la) - pad * .9, max(la) + pad * .9
    pol = lambda g: [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for f in gm["features"]:
        for p in pol(f["geometry"]):
            ax.add_patch(Polygon(p[0], closed=True, fc="#e9eef5", ec="#9aa8b8", lw=.8))
    cx, cy = sum(lo) / len(lo), sum(la) / len(la)
    import numpy as np
    r = max(_hav((cy, cx), (p["lat"], p["lon"])) for p in pts)
    th = np.linspace(0, 2 * np.pi, 120); dlat = r / 111.0; dlon = r / (111.0 * np.cos(np.radians(cy)))
    ax.plot(cx + dlon * np.cos(th), cy + dlat * np.sin(th), color="#c0392b", lw=1.1, ls=(0, (4, 3)), zorder=3)
    for i, p in enumerate(pts):
        ax.scatter([p["lon"]], [p["lat"]], s=48, c=AZUL, edgecolor="white", lw=1.4, zorder=5)
        ax.annotate(p["nombre"].capitalize(), (p["lon"], p["lat"]), xytext=(6, 5 if i % 2 == 0 else -12), textcoords="offset points", fontsize=7.2, color="#1b2430", zorder=6)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect(1 / np.cos(np.radians(cy))); ax.axis("off")
    ax.set_title(f"Todas las referencias caben en un círculo de {r:.1f} km de radio (círculo rojo)", fontsize=8.4, loc="left", fontweight=600)
    fig.tight_layout(); return eg.png(fig, dpi=200, tight=False)


def tabla(filas, anchos, cab=None, estados=None, zebra=True):
    datos = ([[Paragraph(c, TH) for c in cab]] if cab else []) + filas
    t = Table(datos, colWidths=anchos, repeatRows=1 if cab else 0)
    st = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), .4, colors.HexColor("#d9dee4")), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    if cab:
        st += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZUL))]
    return t, st


def build(analisis_ruta, hechos_ruta, salida):
    A = json.load(open(analisis_ruta, encoding="utf-8")); H = json.load(open(hechos_ruta, encoding="utf-8"))[A["hecho_id"]]
    W = A4[0] - 30 * mm; S = []
    SEM = {"ÁMBAR": ("#b7791f", "ATENCIÓN"), "ROJO": (ROJO, "CRÍTICO"), "VERDE": (VERDE, "CONTROLADO"), "GRIS": ("#6b7785", "SIN DATOS")}

    def pie(c, d):
        c.saveState(); c.setFont("Helvetica", 7); c.setFillColor(colors.HexColor(GRIS))
        c.drawString(15 * mm, 9 * mm, f"{A['codigo']} · Informe preliminar con fuentes abiertas · corte {A['corte']} · circulación restringida")
        c.drawRightString(A4[0] - 15 * mm, 9 * mm, f"Pág. {d.page}"); c.restoreState()
        c.setFillColor(colors.HexColor(AZUL)); c.rect(0, A4[1] - 7 * mm, A4[0], 7 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 7.5); c.drawString(15 * mm, A4[1] - 4.8 * mm, "CENTRO COORDINADOR DE EMERGENCIAS · SALA DE SITUACIÓN · INFORME DE SITUACIÓN")
        c.setFont("Helvetica", 7.5); c.drawRightString(A4[0] - 15 * mm, A4[1] - 4.8 * mm, f"Para: {A['solicitado_por']}")
    # ---- página 1: lo que se lee y se decide
    S += [Spacer(1, 3 * mm), Paragraph(A["codigo"] + " · " + e(A["clasificacion"]), TS), Paragraph(e(A["titulo"]), H1),
          Paragraph("<b>Nivel de atención:</b> " + e(A["nivel_atencion"]), TB), Spacer(1, 3 * mm)]
    E = A["esencial"]
    filas = [[Paragraph("<b>Qué pasó</b>", TB), Paragraph(e(E["paso"]), TB)], [Paragraph("<b>Ya resuelto</b>", TB), Paragraph(e(E["resuelto"]), TB)],
             [Paragraph("<b>Sigue abierto</b>", TB), Paragraph(e(E["abierto"]), TB)], [Paragraph("<b>Se requiere</b>", TB), Paragraph("<b>" + e(E["requiere"]) + "</b>", TB)]]
    t = Table(filas, colWidths=[27 * mm, W - 27 * mm]); t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef3f9")), ("LINEBELOW", (0, 0), (-1, -2), .5, colors.white), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor(AZUL))]))
    S += [t, Spacer(1, 4 * mm)]
    kp = [[Paragraph(f'<font size="{16 if len(a) < 4 else 11}" color="{AZUL}"><b>{e(a)}</b></font>', P("k", fontSize=14, leading=18, alignment=1)) for a, _ in A["kpis"]],
          [Paragraph(e(b), P("kl", fontSize=7.4, leading=9, textColor=colors.HexColor(GRIS), alignment=1)) for _, b in A["kpis"]]]
    t = Table(kp, colWidths=[W / len(A["kpis"])] * len(A["kpis"])); t.setStyle(TableStyle([("LINEBELOW", (0, 1), (-1, 1), .6, colors.HexColor("#d9dee4")), ("LINEABOVE", (0, 0), (-1, 0), .6, colors.HexColor("#d9dee4")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    S += [t, Paragraph("Línea de tiempo: qué pasó, qué falta y cómo creció la noticia", H2), eg.imagen(linea_tiempo(A), W),
          Paragraph("Cómo leer: arriba, lo ocurrido (relleno) y lo pendiente (hueco, a la derecha de «hoy»). Abajo, cuándo apareció la noticia en cada medio con fecha verificada. " + e(A["sin_fecha"]), TS), Paragraph("Acciones recomendadas", H2)]
    t, st = tabla([[Paragraph(str(i + 1), TB), Paragraph(e(a), TB), Paragraph(e(r), TB), Paragraph("<b>" + e(pz) + "</b>", TB)] for i, (a, r, pz) in enumerate(A["acciones"])], [7 * mm, W - 7 * mm - 42 * mm - 18 * mm, 42 * mm, 18 * mm], cab=["#", "Acción", "Responsable sugerido", "Plazo"])
    t.setStyle(TableStyle(st)); S += [t, Paragraph("Responsables y plazos son propuestos por la Sala; los confirma la MAE.", TS), PageBreak()]
    # ---- página 2: análisis
    S += [Paragraph("Situación por área", H2)]
    filas = []
    for nom, sem, sit, resp, pend in A["areas"]:
        c, tx_ = SEM[sem]
        filas.append([Paragraph("<b>" + e(nom) + "</b>", TB), Paragraph(f'<font color="{c}"><b>{tx_}</b></font>', TB), Paragraph(e(sit), TB), Paragraph(e(resp), TB), Paragraph(e(pend), TB)])
    t, st = tabla(filas, [26 * mm, 24 * mm, W - 26 * mm - 24 * mm - 33 * mm - 36 * mm, 33 * mm, 36 * mm], cab=["Área", "Estado", "Situación", "Responsable", "Falta"]); t.setStyle(TableStyle(st)); S += [t]
    mp = (A.get("mapa") or {}).get("puntos") or []
    if len(mp) >= 2:
        S += [Paragraph("Dónde: las versiones del lugar, ubicadas", H2), eg.imagen(mapa_lugar(mp), W * .8)]
    S += [Paragraph("Riesgos", H2)]
    t, st = tabla([[Paragraph("<b>" + e(a) + "</b>", TB), Paragraph(e(b), TB)] for a, b in A["riesgos"]], [40 * mm, W - 40 * mm]); t.setStyle(TableStyle(st)); S += [t]
    S += [Paragraph("<b>Sin mapa:</b> no hay un punto verificado (dos versiones del lugar dentro de El Alto) y el sistema no tiene otros hechos de la zona para comparar. Se agregará un mapa del corredor cuando la Policía confirme el punto. <b>Sin fotografía:</b> las de los medios tienen derechos de autor y la familia pidió privacidad; se pedirá el registro fotográfico del parte policial.", TS), PageBreak()]
    # ---- anexo A: triangulación
    S += [Paragraph("Anexo A · Triangulación dato por dato", H2), Paragraph("«Coincide» = al menos dos medios independientes; «Fuente única» = un solo medio; «DISCREPA» = versiones distintas.", TS), Spacer(1, 2 * mm)]
    col = {"Coincide": VERDE, "Coincide (indirecta)": VERDE, "DISCREPA": ROJO, "DISCREPA (secundario)": AMBAR, "Fuente única": AMBAR, "Sin confirmar": AMBAR}
    filas = [[Paragraph("<b>" + e(a) + "</b>", TB), Paragraph(e(b), TB), Paragraph(f'<font color="{col.get(c, GRIS)}"><b>{e(c)}</b></font>', TB)] for a, b, c in A["triangulacion"]]
    t, st = tabla(filas, [32 * mm, W - 32 * mm - 27 * mm, 27 * mm], cab=["Dato", "Lo que dice cada fuente", "Estado"]); t.setStyle(TableStyle(st)); S += [t]
    S += [Paragraph("Respaldo oficial", H2), Paragraph("Cancillería (vía El Deber) y Tránsito de El Alto (vía Starnews). No se localizó comunicado oficial directo. Fiscalía y Embajada aparecen solo citadas por medios.", TB)]
    S += [Paragraph("Ficha completa", H2)]
    t, st = tabla([[Paragraph("<b>" + e(k) + "</b>", TB), Paragraph(e(v), TB)] for k, v in A["ficha"]], [32 * mm, W - 32 * mm]); t.setStyle(TableStyle(st)); S += [t, PageBreak()]
    # ---- anexo B: trazabilidad
    ts = lambda ms: dt.datetime.fromtimestamp(ms / 1000, BO).strftime("%d/%m/%Y %H:%M")
    S += [Paragraph("Anexo B · Cronología detallada", H2)]
    t, st = tabla([[Paragraph("<b>" + e(a) + "</b>", TB), Paragraph(e(b), TB)] for a, b in A["cronologia"]], [34 * mm, W - 34 * mm]); t.setStyle(TableStyle(st)); S += [t]
    S += [Paragraph("Anexo C · Trazabilidad", H2),
          Paragraph(f"<b>Hecho en el sistema:</b> {e(H['id'])} · {e(H['subtipo'])} · {len(H['notas'])} notas capturadas automáticamente ({ts(H['primera'])} a {ts(H['ultima'])}) · ubicación: precisión «{e(H['precision'])}». El sistema automático le dio confianza baja por una sola fuente independiente; la búsqueda ampliada halló al menos 17 medios. Ampliar la captura es la fase 1 del plan.", TB),
          Paragraph("<b>Método:</b> lectura completa de 7 notas (El Deber, Erbol, Red Uno, Bolivia.com, Korea Herald, Starnews, SBS), comparación dato por dato y atribución de cada cifra a su fuente. No se usó ningún dato sin fuente. El conductor no se identifica: ninguna fuente publica su nombre.", TB), Paragraph("Fuentes", H2)]
    t, st = tabla([[Paragraph(e(n), TB), Paragraph('<font size="6.5">' + e(u) + "</font>", TB), Paragraph(e(f), TS)] for n, u, f in A["fuentes"]], [38 * mm, W - 38 * mm - 20 * mm, 20 * mm], cab=["Medio", "Enlace", "Nota"]); t.setStyle(TableStyle(st)); S += [t]
    SimpleDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm, title=A["titulo"], author="Sala de Situación Bolivia").build(S, onFirstPage=pie, onLaterPages=pie)


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], sys.argv[3])

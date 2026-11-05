# -*- coding: utf-8 -*-
"""Boletín semanal / mensual v3, construido sobre HECHOS (no notas): cada hecho cuenta una vez, con su cifra vigente al corte.
Uso desde ejecutar_v3.py: reporte_periodico_v3.build(hechos, ahora, dias, salida, titulo)"""
import collections, datetime as dt
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
import hechos_v3
from reporte_v3 import _png, AZUL, GRIS, BO

D = 24 * 3600 * 1000


def _esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;")


def _g_dias(hs, ini, dias):
    n = collections.Counter(int((h["primera"] - ini) // D) for h in hs if h["primera"] >= ini)
    paso = 1 if dias <= 10 else 5
    xs = list(range(0, dias, paso)); ys = [sum(n.get(i + k, 0) for k in range(paso)) for i in xs]
    fig, ax = plt.subplots(figsize=(3.6, 2.2))
    ax.bar(range(len(xs)), ys, color=AZUL)
    ax.set_xticks(range(len(xs))); ax.set_xticklabels([dt.datetime.fromtimestamp((ini + i * D) / 1000, BO).strftime("%d/%m") for i in xs], fontsize=6, rotation=60 if len(xs) > 8 else 0)
    ax.set_title("Hechos nuevos por " + ("día" if paso == 1 else "5 días"), fontsize=9, loc="left"); ax.tick_params(labelsize=7)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return _png(fig)


def _g_tipos(hs):
    c = collections.Counter(h["subtipo"] for h in hs).most_common(8)
    fig, ax = plt.subplots(figsize=(3.6, 2.2))
    ax.barh([k[:28] for k, _ in c][::-1], [v for _, v in c][::-1], color=AZUL)
    for i, v in enumerate([v for _, v in c][::-1]):
        ax.text(v, i, f" {v}", va="center", fontsize=7)
    ax.set_title("Hechos por tipo", fontsize=9, loc="left"); ax.tick_params(labelsize=7); ax.set_xticks([])
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return _png(fig)


def _g_evolucion(h):
    """Cifra principal del hecho a lo largo del tiempo (escalones)."""
    cv = hechos_v3.cifra_vigente(h)
    campo = next((c for c in ("fallecidos", "familias_afectadas", "personas_afectadas", "casos_notificados", "heridos") if c in cv and len(cv[c]["serie"]) > 1), None)
    if not campo:
        return None
    s = cv[campo]["serie"]
    fig, ax = plt.subplots(figsize=(7.2, 1.9))
    ax.step([dt.datetime.fromtimestamp(t / 1000, BO) for t, _ in s], [v for _, v in s], where="post", color=AZUL, marker="o", ms=3)
    ax.set_title(f"Evolución de {campo.replace('_', ' ')}: {h['subtipo']}, {h.get('lugar') or ''}"[:110], fontsize=8, loc="left"); ax.tick_params(labelsize=7)
    fig.autofmt_xdate()
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    return _png(fig)


def build(hechos, ahora, dias, salida, titulo):
    ini = ahora - dias * D
    hs = [h for h in hechos.values() if h["ultima"] >= ini and h["ultima"] <= ahora and h["primera"] <= ahora]
    desde = min((h["primera"] for h in hechos.values()), default=ahora)
    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("f", "Helvetica"), fontSize=k.pop("s", 9), leading=k.pop("l", 12), **k)
    est = {"t": S("t", f="Helvetica-Bold", s=17, l=20, textColor=colors.HexColor(AZUL)), "p": S("p"), "c": S("c", s=7.5, l=10, textColor=colors.HexColor(GRIS)),
           "h": S("h", f="Helvetica-Bold", s=10.5, l=14, textColor=colors.HexColor(AZUL), spaceBefore=6), "k": S("k", f="Helvetica-Bold", s=15, l=18, alignment=1), "kl": S("kl", s=7.5, l=9, alignment=1, textColor=colors.HexColor(GRIS))}
    fall = her = 0
    for h in hs:
        cv = hechos_v3.cifra_vigente(h, ahora)
        fall += cv.get("fallecidos", {}).get("valor", 0); her += cv.get("heridos", {}).get("valor", 0)
    abiertos = sum(h["estado"] == "abierto" for h in hs); reab = sum(h["reaperturas"] > 0 for h in hs)
    f = lambda t: dt.datetime.fromtimestamp(t / 1000, BO).strftime("%d/%m/%Y")
    el = [Paragraph(f"Sala de Situación Bolivia · {titulo}", est["t"]), Paragraph(f"Del {f(ini)} al {f(ahora)} (hora de Bolivia). Un hecho cuenta una sola vez aunque lo cubran varios medios; cifras de prensa sin confirmar.", est["c"]), Spacer(1, 5)]
    if desde > ini + D:
        el += [Paragraph(f"Atención: el sistema acumula hechos desde el {f(desde)}; este período está incompleto.", ParagraphStyle("a", fontSize=8, textColor=colors.HexColor("#b00020"))), Spacer(1, 4)]
    t = Table([[Paragraph(str(x), est["k"]) for x in (len(hs), abiertos, reab, f"{fall} / {her}")], [Paragraph(x, est["kl"]) for x in ("hechos", "siguen abiertos", "reabiertos", "fallecidos / heridos*")]], colWidths=[45 * mm] * 4)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .5, colors.HexColor("#c7d0d9")), ("LINEAFTER", (0, 0), (-2, -1), .3, colors.HexColor("#c7d0d9")), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f8fb"))]))
    el += [t, Spacer(1, 6)]
    if hs:
        gr = Table([[Image(_g_dias(hs, ini, dias), 85 * mm, 52 * mm), Image(_g_tipos(hs), 85 * mm, 52 * mm)]], colWidths=[90 * mm] * 2); el.append(gr)
    mayores = sorted(hs, key=lambda h: (-len(h["notas"]), -h["ultima"]))[:8]
    g = next((x for x in (_g_evolucion(h) for h in mayores) if x), None)
    if g:
        el += [Paragraph("Hecho con mayor evolución", est["h"]), Image(g, 170 * mm, 45 * mm)]
    el.append(Paragraph("Hechos con más seguimiento", est["h"]))
    filas = [["Hecho", "Lugar", "Seguimiento", "Cifras (evolución)"]]
    for h in mayores:
        a, b = (dt.datetime.fromtimestamp(h[k] / 1000, BO).strftime("%d/%m") for k in ("primera", "ultima"))
        filas.append([Paragraph(_esc(h["notas"][-1]["titulo"][:90]) + f'<br/><font size="7" color="{GRIS}">{h["subtipo"]} · {h["estado"]}{" · reabierto" if h["reaperturas"] else ""}</font>', est["p"]), Paragraph(_esc(h.get("lugar") or "—"), est["c"]),
                      Paragraph(f"{a} → {b}<br/>{len(h['notas'])} notas, {len({n['fuente'] for n in h['notas']})} medios", est["c"]), Paragraph(_esc(hechos_v3.evolucion(h) or "sin cifras"), est["c"])])
    tb = Table(filas, colWidths=[62 * mm, 30 * mm, 30 * mm, 58 * mm], repeatRows=1)
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZUL)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTSIZE", (0, 0), (-1, 0), 8), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f8fb")]), ("LINEBELOW", (0, 0), (-1, -1), .25, colors.HexColor("#d5dde5"))]))
    el += [tb, Paragraph("* Fallecidos y heridos: suma de la cifra vigente de cada hecho (mayor cifra oficial; si no hay, la mayor de prensa). Un hecho con cifra descendente se marca para revisión.", est["c"])]
    SimpleDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=13 * mm, bottomMargin=13 * mm, title=titulo, author="Sala de Situación Bolivia").build(el)
    return {"hechos": len(hs), "dias": dias}

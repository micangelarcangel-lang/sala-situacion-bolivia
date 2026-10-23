# -*- coding: utf-8 -*-
"""Genera el reporte PDF de la Sala de Situación (modo programado o inmediato).
Uso: python reporte_pdf.py --datos eventos.json --geo geo.json --salida reporte.pdf [--modo programado|inmediato] [--horas 24]
     python reporte_pdf.py --demo --salida demo.pdf
"""
import argparse, json, io, time, random, datetime as dt
from collections import Counter, defaultdict
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import PathPatch, Polygon as MPoly
from matplotlib.path import Path
from shapely.geometry import shape, Point
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, Image, PageBreak, KeepTogether)

NOM = ["Verde", "Amarilla", "Naranja", "Roja"]
COL = ["#2e7d32", "#f9a825", "#ef6c00", "#c62828"]
TZ = dt.timezone(dt.timedelta(hours=-4))  # America/La_Paz
INK, MUT, ACC = "#1c2430", "#5c6675", "#0b5cab"


def hora(ms):
    return dt.datetime.fromtimestamp(ms / 1000, TZ)


def cargar_geo(ruta):
    g = json.load(open(ruta, encoding="utf-8"))
    out = {}
    for k in ("dep", "mun"):
        out[k] = [dict(u, _s=shape({"type": u["t"], "coordinates": u["g"]})) for u in g[k]]
    return out


def ubicar(e, geo):
    if e.get("lat") is None or e.get("lon") is None:
        return None, None
    p = Point(e["lon"], e["lat"])
    dep = next((u["n"] for u in geo["dep"] if u["_s"].contains(p)), None)
    mun = next((u["n"] for u in geo["mun"] if u["_s"].contains(p)), None)
    return dep, mun


def dibujar_poligonos(ax, units, **kw):
    for u in units:
        geoms = [u["_s"]] if u["_s"].geom_type == "Polygon" else list(u["_s"].geoms)
        for poly in geoms:
            ax.add_patch(MPoly(list(poly.exterior.coords), closed=True, **kw))


def mapa_png(geo, evs, foco=None, ancho=6.4, alto=5.6):
    fig, ax = plt.subplots(figsize=(ancho, alto), dpi=200)
    ax.set_facecolor("#eaf1f7")
    dibujar_poligonos(ax, geo["mun"], fc="#f7f8fa", ec="#d3d8df", lw=0.25)
    dibujar_poligonos(ax, geo["dep"], fc="none", ec="#6b7686", lw=0.9)
    for u in geo["dep"]:
        c = u["_s"].representative_point()
        ax.text(c.x, c.y, u["n"].upper(), fontsize=5.2, color="#8792a2", ha="center", va="center", style="italic")
    n = 0
    for e in sorted(evs, key=lambda x: x["nivel"]):
        if e.get("lat") is None:
            continue
        n += 1
        ax.scatter(e["lon"], e["lat"], s=60 + e["nivel"] * 55, c=COL[e["nivel"]], edgecolors="white", linewidths=1.2, zorder=5, alpha=.95)
        ax.text(e["lon"], e["lat"], str(e["_n"]), fontsize=5.5, color="white" if e["nivel"] != 1 else "#222", ha="center", va="center", zorder=6, weight="bold")
    if foco:
        lons = [e["lon"] for e in foco if e.get("lon") is not None]
        lats = [e["lat"] for e in foco if e.get("lat") is not None]
        if lons:
            m = 1.6
            ax.set_xlim(min(lons) - m, max(lons) + m); ax.set_ylim(min(lats) - m * .9, max(lats) + m * .9)
    else:
        ax.set_xlim(-69.9, -57.2); ax.set_ylim(-23.1, -9.4)
    ax.set_aspect(1 / 0.95)
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color("#9aa6b6")
    ax.text(0.01, 0.01, "Límites: geoBoundaries · proyección geográfica simple", transform=ax.transAxes, fontsize=4.6, color="#6b7686")
    handles = [plt.Line2D([], [], marker="o", ls="", mfc=COL[i], mec="white", ms=7, label=NOM[i]) for i in (3, 2, 1, 0)]
    ax.legend(handles=handles, loc="lower left", bbox_to_anchor=(0.0, 0.05), fontsize=6, frameon=True, title="Nivel preliminar", title_fontsize=6.5)
    buf = io.BytesIO(); fig.tight_layout(pad=0.3); fig.savefig(buf, format="png"); plt.close(fig); buf.seek(0)
    return buf


def estilo_ax(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color("#9aa6b6")
    ax.tick_params(labelsize=6.5, colors="#3a4453")
    ax.yaxis.grid(True, color="#e3e7ec", lw=.6); ax.set_axisbelow(True)


def png(fig):
    buf = io.BytesIO(); fig.tight_layout(pad=0.6); fig.savefig(buf, format="png", dpi=200); plt.close(fig); buf.seek(0); return buf


def grafico_tendencia(evs, ahora, dias):
    d0 = hora(ahora).replace(hour=0, minute=0, second=0, microsecond=0) - dt.timedelta(days=dias - 1)
    dias_l = [d0 + dt.timedelta(days=i) for i in range(dias)]
    m = [[0] * dias for _ in range(4)]
    for e in evs:
        i = (hora(e["ts"]).replace(hour=0, minute=0, second=0, microsecond=0) - d0).days
        if 0 <= i < dias:
            m[e["nivel"]][i] += 1
    fig, ax = plt.subplots(figsize=(6.4, 2.5))
    base = [0] * dias
    for n in range(4):
        ax.bar(range(dias), m[n], bottom=base, color=COL[n], label=NOM[n], width=.72)
        base = [a + b for a, b in zip(base, m[n])]
    tot = base
    k = 3 if dias >= 7 else 1
    prom = [sum(tot[max(0, i - k + 1):i + 1]) / len(tot[max(0, i - k + 1):i + 1]) for i in range(dias)]
    ax.plot(range(dias), prom, color="#222", lw=1.3, marker="o", ms=2.5, label=f"Media móvil {k} d")
    step = max(1, dias // 10)
    ax.set_xticks(range(0, dias, step)); ax.set_xticklabels([dias_l[i].strftime("%d/%m") for i in range(0, dias, step)])
    ax.set_ylabel("Eventos", fontsize=7); estilo_ax(ax)
    ax.legend(fontsize=6, ncol=5, frameon=False, loc="upper left", bbox_to_anchor=(0, 1.2))
    return png(fig)


def grafico_barras_h(cuentas, titulo, color=ACC, color_fn=None, ancho=3.1, alto=2.6):
    items = cuentas.most_common(8)[::-1]
    fig, ax = plt.subplots(figsize=(ancho, alto))
    if not items:
        ax.text(.5, .5, "Sin datos", ha="center", transform=ax.transAxes, fontsize=8, color=MUT)
    else:
        ax.barh([i[0] for i in items], [i[1] for i in items], color=[color_fn(i[0]) if color_fn else color for i in items], height=.62)
        for y, (_, v) in enumerate(items):
            ax.text(v, y, f" {v}", va="center", fontsize=6.5)
    ax.set_title(titulo, fontsize=8, loc="left", color=INK, weight="bold")
    estilo_ax(ax); ax.yaxis.grid(False); ax.xaxis.grid(True, color="#e3e7ec", lw=.6)
    return png(fig)


def grafico_acumulado(evs, ahora, dias):
    d0 = hora(ahora).replace(hour=0, minute=0, second=0, microsecond=0) - dt.timedelta(days=dias - 1)
    f = [0] * dias; h = [0] * dias
    for e in evs:
        i = (hora(e["ts"]).replace(hour=0, minute=0, second=0, microsecond=0) - d0).days
        if 0 <= i < dias:
            f[i] += e.get("fall", 0) or 0; h[i] += e.get("her", 0) or 0
    cf = [sum(f[:i + 1]) for i in range(dias)]; ch = [sum(h[:i + 1]) for i in range(dias)]
    fig, ax = plt.subplots(figsize=(3.1, 2.6))
    ax.step(range(dias), cf, where="mid", color="#c62828", lw=1.6, label="Fallecidos (acum.)")
    ax.step(range(dias), ch, where="mid", color="#ef6c00", lw=1.6, label="Heridos (acum.)")
    step = max(1, dias // 5)
    ax.set_xticks(range(0, dias, step)); ax.set_xticklabels([(d0 + dt.timedelta(days=i)).strftime("%d/%m") for i in range(0, dias, step)])
    from matplotlib.ticker import MaxNLocator
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_title("Víctimas acumuladas", fontsize=8, loc="left", weight="bold"); estilo_ax(ax); ax.legend(fontsize=6, frameon=False)
    return png(fig)


def build(evs_all, geo, salida, modo="programado", horas=24, ahora=None, ref=None, etiqueta=None):
    ahora = ahora or int(time.time() * 1000)
    lim = ahora - horas * 3600000
    prev_lim = lim - horas * 3600000
    evs = sorted([e for e in evs_all if e["ts"] >= lim], key=lambda e: (-e["nivel"], -e["ts"]))
    prev = [e for e in evs_all if prev_lim <= e["ts"] < lim]
    for i, e in enumerate(evs, 1):
        e["_n"] = i
        e["_dep"], e["_mun"] = ubicar(e, geo)
    graves = [e for e in evs if (e.get("fall") or 0) > 0 or (e.get("her") or 0) > 0 or e["nivel"] >= 2]
    foco = [e for e in evs if (e.get("fall") or 0) > 0 or (e.get("her") or 0) > 0 or e["nivel"] == 3] if modo == "inmediato" else None
    if modo == "inmediato" and ref:
        foco = [e for e in evs if e["id"] in ref] or foco

    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("fn", "Helvetica"), **k)
    st = {
        "h1": S("h1", fontSize=17, leading=20, textColor=colors.white, fn="Helvetica-Bold"),
        "h1s": S("h1s", fontSize=8.5, leading=11, textColor=colors.HexColor("#dbe6f3")),
        "h2": S("h2", fontSize=11.5, leading=14, textColor=colors.HexColor(ACC), fn="Helvetica-Bold", spaceBefore=8, spaceAfter=4),
        "p": S("p", fontSize=8.3, leading=11, textColor=colors.HexColor(INK)),
        "pm": S("pm", fontSize=7, leading=9, textColor=colors.HexColor(MUT)),
        "cell": S("cell", fontSize=7, leading=8.6, textColor=colors.HexColor(INK)),
        "cellh": S("cellh", fontSize=7, leading=8.6, textColor=colors.white, fn="Helvetica-Bold"),
    }
    W, H = A4
    ahora_s = hora(ahora).strftime("%d/%m/%Y %H:%M")
    titulo = etiqueta or ("ALERTA INMEDIATA — Hecho grave" if modo == "inmediato" else "Reporte de Situación — Eventos adversos")
    banda = "#8e1b1b" if modo == "inmediato" else "#0f3d6e"

    def pie(c, d):
        c.saveState(); c.setStrokeColor(colors.HexColor("#c9cfd8")); c.line(15 * mm, 13 * mm, W - 15 * mm, 13 * mm)
        c.setFont("Helvetica", 6.5); c.setFillColor(colors.HexColor(MUT))
        c.drawString(15 * mm, 9.5 * mm, f"Sala de Situación — Bolivia · Generado {ahora_s} (hora La Paz)")
        c.drawString(15 * mm, 6 * mm, "Niveles PRELIMINARES (heurística propia), pendientes de validación técnica con la Ley 602, arts. 36-37.")
        c.drawRightString(W - 15 * mm, 9.5 * mm, f"Pág. {d.page}")
        c.restoreState()

    def cab(c, d):
        c.saveState(); c.setFillColor(colors.HexColor(banda)); c.rect(0, H - 30 * mm, W, 30 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 17); c.drawString(15 * mm, H - 14 * mm, titulo)
        c.setFont("Helvetica", 8.5); c.setFillColor(colors.HexColor("#dbe6f3"))
        c.drawString(15 * mm, H - 21 * mm, f"Periodo: últimas {horas} h hasta {ahora_s} (hora La Paz) · Modo: {modo} · Cobertura: territorio nacional")
        c.restoreState(); pie(c, d)

    doc = BaseDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=16 * mm,
                          title=titulo, author="Sala de Situación Bolivia")
    fr1 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 34 * mm, id="f1", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    fr2 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 15 * mm, id="f2", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate("p1", [fr1], onPage=cab), PageTemplate("p2", [fr2], onPage=pie)])
    from reportlab.platypus import NextPageTemplate
    el = []
    # Resumen
    cont = Counter(e["nivel"] for e in evs)
    fall = sum(e.get("fall") or 0 for e in evs); her = sum(e.get("her") or 0 for e in evs)
    sinloc = sum(1 for e in evs if e.get("lat") is None)
    d_prev = len(evs) - len(prev)
    tabla_res = Table([[
        *[Paragraph(f'<font size=16 color="{COL[n]}"><b>{cont.get(n, 0)}</b></font><br/><font size=7>{NOM[n]}</font>', st["p"]) for n in (3, 2, 1, 0)],
        Paragraph(f'<font size=16><b>{fall}</b></font><br/><font size=7>Fallecidos</font>', st["p"]),
        Paragraph(f'<font size=16><b>{her}</b></font><br/><font size=7>Heridos</font>', st["p"]),
        Paragraph(f'<font size=16><b>{len(evs)}</b></font><br/><font size=7>Eventos ({d_prev:+d} vs prev.)</font>', st["p"]),
    ]], colWidths=[(W - 30 * mm) * x for x in (.125, .125, .125, .125, .13, .13, .24)])
    tabla_res.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .5, colors.HexColor("#c9cfd8")), ("INNERGRID", (0, 0), (-1, -1), .3, colors.HexColor("#e3e7ec")),
                                   ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f9fb")), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    el += [tabla_res, Spacer(1, 3 * mm)]
    if modo == "inmediato":
        el.append(Paragraph("<b>Motivo de la alerta inmediata:</b> evento(s) con víctimas (fallecidos/heridos) o nivel rojo. Información preliminar de fuentes abiertas; requiere confirmación con la red de salud local.", st["p"]))
        el.append(Spacer(1, 2 * mm))
    el.append(Paragraph("1. Geolocalización de los hechos", st["h2"]))
    el.append(Image(mapa_png(geo, evs, foco, 6.4, 6.6), width=(W - 30 * mm) * .96, height=(W - 30 * mm) * .96 * 6.6 / 6.4, hAlign="CENTER"))
    el.append(Paragraph(f"Los números del mapa corresponden a la columna N° de la tabla. {sinloc} evento(s) no se pintan por no tener coordenadas confiables." if sinloc else "Los números del mapa corresponden a la columna N° de la tabla.", st["pm"]))
    el.append(NextPageTemplate("p2")); el.append(PageBreak())

    # Tabla de hechos
    el.append(Paragraph("2. Hechos registrados", st["h2"]))
    filas = [[Paragraph(x, st["cellh"]) for x in ["N°", "Hora local", "Nivel", "Tipo", "Hecho", "Ubicación", "Fall.", "Her.", "Fuente"]]]
    ts = [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d3d8df")), ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]
    for r, e in enumerate(evs[:60], 1):
        ub = ", ".join(x for x in [e["_mun"], e["_dep"]] if x) or "Sin ubicación"
        filas.append([Paragraph(str(e["_n"]), st["cell"]), Paragraph(hora(e["ts"]).strftime("%d/%m %H:%M"), st["cell"]),
                      Paragraph(f'<b>{NOM[e["nivel"]]}</b>', S("n", fontSize=7, leading=8.6, textColor=colors.white if e["nivel"] != 1 else colors.HexColor("#222"))),
                      Paragraph(e["tipo"], st["cell"]), Paragraph(esc(e["titulo"]), st["cell"]), Paragraph(esc(ub), st["cell"]),
                      Paragraph(str(e.get("fall") or 0), st["cell"]), Paragraph(str(e.get("her") or 0), st["cell"]), Paragraph(esc(e["fuente"]), st["cell"])])
        ts.append(("BACKGROUND", (2, r), (2, r), colors.HexColor(COL[e["nivel"]])))
    t = Table(filas, colWidths=[8 * mm, 17 * mm, 15 * mm, 21 * mm, 50 * mm, 33 * mm, 10 * mm, 10 * mm, 16 * mm], repeatRows=1)
    t.setStyle(TableStyle(ts)); el.append(t)
    if len(evs) > 60:
        el.append(Paragraph(f"Se muestran los 60 de mayor nivel; hay {len(evs) - 60} más en la base de datos.", st["pm"]))

    # Detalle de graves
    el.append(Paragraph("3. Detalle de hechos de mayor gravedad", st["h2"]))
    if not graves:
        el.append(Paragraph("No hubo hechos naranja/rojos ni con víctimas en el periodo.", st["p"]))
    for e in graves[:12]:
        ub = ", ".join(x for x in [e["_mun"], e["_dep"]] if x) or "ubicación no determinada"
        coord = f'{e["lat"]:.3f}, {e["lon"]:.3f}' if e.get("lat") is not None else "s/d"
        bloque = [Paragraph(f'<b>N° {e["_n"]} · <font color="{COL[e["nivel"]]}">{NOM[e["nivel"]].upper()}</font> · {esc(e["titulo"])}</b>', st["p"]),
                  Paragraph(f'Tipo: {e["tipo"]} · Fecha/hora: {hora(e["ts"]).strftime("%d/%m/%Y %H:%M")} · Lugar: {esc(ub)} · Coord.: {coord} ({esc(e.get("metodo") or "método no registrado")}) · Fallecidos: {e.get("fall") or 0} · Heridos: {e.get("her") or 0}', st["pm"]),
                  Paragraph(esc(e.get("detalle") or "Sin detalle adicional."), st["p"]),
                  Paragraph(f'Fuente: {esc(e["fuente"])}' + (f' · {esc(e["url"])}' if e.get("url", "").startswith("http") else ""), st["pm"]), Spacer(1, 2.5 * mm)]
        el.append(KeepTogether(bloque))

    # Indicadores
    el.append(PageBreak())
    dias = 14 if horas <= 168 else 30
    el.append(Paragraph(f"4. Indicadores y tendencias (últimos {dias} días)", st["h2"]))
    base = [e for e in evas_ventana(evs_all, ahora, dias)]
    el.append(Image(grafico_tendencia(base, ahora, dias), width=(W - 30 * mm) * .98, height=(W - 30 * mm) * .98 * 2.5 / 6.4, hAlign="CENTER"))
    for e in base:
        e["_dep"], _ = ubicar(e, geo)
    por_tipo = Counter(e["tipo"] for e in base); por_dep = Counter(e["_dep"] or "Sin ubicar" for e in base)
    imgs = Table([[Image(grafico_barras_h(por_tipo, "Eventos por tipo de amenaza", ACC), width=85 * mm, height=85 * mm * 2.6 / 3.1),
                   Image(grafico_barras_h(por_dep, "Eventos por departamento", "#5b6b84"), width=85 * mm, height=85 * mm * 2.6 / 3.1)],
                  [Image(grafico_acumulado(base, ahora, dias), width=85 * mm, height=85 * mm * 2.6 / 3.1),
                   Image(grafico_barras_h(Counter({NOM[e["nivel"]]: 0 for e in base}) + Counter(NOM[e["nivel"]] for e in base), "Eventos por nivel", color_fn=lambda n: COL[NOM.index(n)]), width=85 * mm, height=85 * mm * 2.6 / 3.1)]])
    el += [Spacer(1, 2 * mm), imgs]
    # Comparación
    el.append(Paragraph("5. Comparación con el periodo anterior", st["h2"]))
    def res(l): return (len(l), sum(1 for e in l if e["nivel"] >= 2), sum(e.get("fall") or 0 for e in l), sum(e.get("her") or 0 for e in l))
    a, b = res(evs), res(prev)
    comp = [[Paragraph(x, st["cellh"]) for x in ["Indicador", f"Últimas {horas} h", f"{horas} h previas", "Variación"]]]
    for nombre, x, y in zip(["Eventos totales", "Naranja o rojo", "Fallecidos", "Heridos"], a, b):
        var = "—" if y == 0 and x == 0 else ("nuevo" if y == 0 else f"{(x - y) / y * 100:+.0f}%")
        comp.append([Paragraph(nombre, st["cell"]), Paragraph(str(x), st["cell"]), Paragraph(str(y), st["cell"]), Paragraph(var, st["cell"])])
    tc = Table(comp, colWidths=[60 * mm, 35 * mm, 35 * mm, 30 * mm]); tc.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d3d8df")), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    el.append(tc); el.append(Spacer(1, 3 * mm))
    el.append(Paragraph("Nota metodológica: eventos tomados de fuentes abiertas automáticas (USGS, GDACS, Open-Meteo y titulares de prensa). Las cifras de víctimas se extraen de titulares y pueden estar incompletas o contradecirse entre medios; no sustituyen la notificación oficial. Los niveles de color son preliminares (heurística propia).", st["pm"]))
    doc.build(el)
    return {"eventos": len(evs), "graves": len(graves)}


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def evas_ventana(evs_all, ahora, dias):
    return [e for e in evs_all if e["ts"] >= ahora - dias * 86400000]


def demo(ahora):
    random.seed(7)
    L = [("Sismo M %.1f - %s", "geológica", "USGS", [(-19.6, -65.7, "Potosí"), (-17.4, -66.2, "Cochabamba"), (-21.5, -64.7, "Tarija")]),
         ("Lluvia intensa en %s", "hidrológica", "Open-Meteo", [(-14.8, -64.9, "Trinidad"), (-11.0, -68.7, "Cobija"), (-17.8, -63.2, "Santa Cruz")]),
         ("Calor extremo en %s", "climatológica", "Open-Meteo", [(-17.8, -63.2, "Santa Cruz"), (-14.8, -64.9, "Trinidad")]),
         ("Accidente de bus en ruta %s", "antropogénica", "Prensa", [(-17.9, -67.1, "Oruro"), (-16.5, -68.2, "La Paz"), (-19.0, -65.3, "Sucre")]),
         ("Granizada en %s", "meteorológica", "Prensa", [(-16.5, -68.2, "El Alto"), (-17.4, -66.2, "Cochabamba")])]
    ev = []
    for i in range(46):
        t, tipo, fu, locs = random.choice(L); la, lo, nom = random.choice(locs)
        titulo = (t % (round(random.uniform(3, 5.4), 1), nom)) if "%.1f" in t else t % nom
        nivel = random.choices([0, 1, 2, 3], [4, 6, 3, 1])[0]
        fall = random.randint(1, 6) if tipo == "antropogénica" and random.random() < .5 else 0
        her = fall * random.randint(1, 4) if fall else 0
        ev.append({"id": f"demo{i}", "ts": ahora - int(random.random() * 14 * 86400000 * (0.35 if i < 14 else 1)), "fuente": fu, "tipo": tipo, "nivel": 3 if fall > 3 else nivel,
                   "titulo": "[DEMO] " + titulo + " (ficticio)", "detalle": "Dato ficticio de demostración para probar el formato del reporte.", "url": "", "lat": la + random.uniform(-.25, .25), "lon": lo + random.uniform(-.25, .25), "fall": fall, "her": her})
    ev.append({"id": "demoX", "ts": ahora - 3600000, "fuente": "Prensa", "tipo": "otra", "nivel": 1, "titulo": "[DEMO] Hecho sin coordenadas (ficticio)", "detalle": "", "url": "", "lat": None, "lon": None, "fall": 0, "her": 0})
    return ev


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos"); ap.add_argument("--geo", default="geo.json"); ap.add_argument("--salida", required=True)
    ap.add_argument("--modo", default="programado"); ap.add_argument("--horas", type=int, default=24); ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    ahora = int(time.time() * 1000)
    evs = demo(ahora) if a.demo else json.load(open(a.datos, encoding="utf-8"))["eventos"]
    print(build(evs, cargar_geo(a.geo), a.salida, a.modo, a.horas, ahora))

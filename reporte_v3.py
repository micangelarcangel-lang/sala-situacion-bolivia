# -*- coding: utf-8 -*-
"""Boletín breve v3: 1-2 páginas, con cifras clave, un gráfico, un mapa de hechos bien ubicados, tabla de prioridad y trazabilidad.
Uso: python reporte_v3.py --eventos docs/eventos_unificados.json --horas 24 --salida salida/boletin.pdf"""
import argparse, io, json, os, collections, datetime as dt
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether

BO = dt.timezone(dt.timedelta(hours=-4))
AZUL, GRIS = "#0b3d6e", "#5b6b7a"
NIVEL = {"Roja": ("#c0392b", 4), "Rojo": ("#c0392b", 4), "Naranja": ("#e67e22", 3), "Amarilla": ("#d4ac0d", 2), "Amarillo": ("#d4ac0d", 2), "Verde": ("#2e8b57", 1)}
EV_ETIQ = {"Alta": "alta", "Media": "media", "Baja": "baja"}


def nivel_de(e):
    t = (e.get("nivel_txt") or "").split(" ")[0]
    return NIVEL.get(t, ("#7f8c8d", 0))


def seleccionar(eventos, ahora, horas):
    ini = ahora - horas * 3600 * 1000
    # solo hechos de Bolivia: con departamento identificado o de una fuente oficial nacional; la prensa sin lugar en Bolivia (p. ej. noticias del exterior) se deja fuera
    def vale(e):
        if "relevante_v3" in e:  # ya clasificado por la v3: tipo de hecho reconocido, no es del exterior y tiene contenido
            return e["relevante_v3"] and e.get("ambito") != "exterior" and not e.get("informacion_insuficiente")
        return bool(e.get("departamentos") or e.get("origen") in ("senamhi", "sismo", "epidemiologia"))
    return [e for e in eventos if e.get("ts", 0) >= ini and e.get("origen") != "foco" and vale(e)]


def prioridad(e):
    return (nivel_de(e)[1], 1 if e.get("oficial") else 0, (e.get("confianza") or {}).get("puntaje", 0))


def _png(fig, dpi=170):
    b = io.BytesIO(); fig.savefig(b, format="png", dpi=dpi, bbox_inches="tight"); plt.close(fig); b.seek(0); return b


def g_categorias(evs):
    c = collections.Counter(e.get("categoria", "otra") for e in evs).most_common()
    fig, ax = plt.subplots(figsize=(3.4, 2.2))
    ax.barh([k for k, _ in c][::-1], [v for _, v in c][::-1], color=AZUL)
    for i, v in enumerate([v for _, v in c][::-1]):
        ax.text(v, i, f" {v}", va="center", fontsize=8)
    ax.set_title("Eventos por categoría", fontsize=9, loc="left"); ax.tick_params(labelsize=8)
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    ax.set_xticks([])
    return _png(fig)


def mapa(evs, geo_dep):
    fig, ax = plt.subplots(figsize=(3.4, 3.4))
    for f in geo_dep["features"]:
        g = f["geometry"]; polis = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for p in polis:
            ax.fill(*zip(*p[0]), facecolor="#eef2f6", edgecolor="#9aa7b4", linewidth=.5)
    n = 0
    for e in evs:
        if e.get("lat") is not None and e.get("precision_ubicacion", "departamento" if "(departamento)" in (e.get("lugar") or "") else "municipio") in ("punto", "municipio"):
            ax.scatter(e["lon"], e["lat"], s=26, color=nivel_de(e)[0], edgecolor="white", linewidth=.5, zorder=3); n += 1
    ax.set_aspect("equal"); ax.axis("off"); ax.set_title(f"Hechos ubicados con precisión ({n})", fontsize=9, loc="left")
    return _png(fig)


def build(eventos, salida, horas=24, ahora=None, geo_dep_ruta="docs/geo_dep.geojson", hechos=None):
    ahora = ahora or max(e.get("ts", 0) for e in eventos)
    evs = seleccionar(eventos, ahora, horas)
    top = sorted(evs, key=prioridad, reverse=True)[:8]
    focos = sum(1 for e in eventos if e.get("origen") == "foco" and e.get("ts", 0) >= ahora - horas * 3600000)
    oficiales = sum(1 for e in evs if e.get("oficial"))
    deps = {d for e in evs for d in e.get("departamentos", [])}
    # un hecho contado por varios medios cuenta una sola vez: de cada grupo propuesto se toma la cifra mayor
    por_grupo = {}
    for e in evs:
        clave = e.get("hecho_id") or tuple(sorted(e.get("grupo_propuesto") or [e["id"]]))
        c = e.get("cifras") or {}
        a = por_grupo.setdefault(clave, [0, 0])
        a[0], a[1] = max(a[0], c.get("fallecidos", 0) or 0), max(a[1], c.get("heridos", 0) or 0)
    fall = sum(a[0] for a in por_grupo.values())
    her = sum(a[1] for a in por_grupo.values())
    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("f", "Helvetica"), fontSize=k.pop("s", 9), leading=k.pop("l", 12), **k)
    est = {"t": S("t", f="Helvetica-Bold", s=17, l=20, textColor=colors.HexColor(AZUL)), "p": S("p", s=9, l=12), "c": S("c", s=7.5, l=10, textColor=colors.HexColor(GRIS)),
           "h": S("h", f="Helvetica-Bold", s=10.5, l=14, textColor=colors.HexColor(AZUL), spaceBefore=6), "k": S("k", f="Helvetica-Bold", s=15, l=18, alignment=1), "kl": S("kl", s=7.5, l=9, alignment=1, textColor=colors.HexColor(GRIS))}
    f_ = dt.datetime.fromtimestamp(ahora / 1000, BO).strftime("%d/%m/%Y %H:%M")
    doc = SimpleDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=13 * mm, bottomMargin=13 * mm, title="Boletín Sala de Situación Bolivia", author="Sala de Situación Bolivia")
    el = [Paragraph("Sala de Situación Bolivia · Boletín breve", est["t"]), Paragraph(f"Últimas {horas} horas hasta {f_} (hora de Bolivia). Información de prensa y fuentes oficiales; la de prensa no está verificada.", est["c"]), Spacer(1, 5)]
    tiles = [[Paragraph(str(len(evs)), est["k"]), Paragraph(str(oficiales), est["k"]), Paragraph(str(len(deps)), est["k"]), Paragraph(f"{fall} / {her}", est["k"]), Paragraph(str(focos), est["k"])],
             [Paragraph(x, est["kl"]) for x in ("eventos", "de fuente oficial", "departamentos", "fallecidos / heridos*", "focos de calor")]]
    t = Table(tiles, colWidths=[36 * mm] * 5); t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .5, colors.HexColor("#c7d0d9")), ("LINEAFTER", (0, 0), (-2, -1), .3, colors.HexColor("#c7d0d9")), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f8fb")), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    el += [t, Spacer(1, 6)]
    if os.path.exists(geo_dep_ruta):
        geo = json.load(open(geo_dep_ruta, encoding="utf-8"))
        gr = Table([[Image(g_categorias(evs), 85 * mm, 55 * mm), Image(mapa(top + [e for e in evs if e not in top], geo), 85 * mm, 85 * mm)]], colWidths=[90 * mm, 90 * mm])
        gr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")])); el.append(gr)
    el.append(Paragraph("Eventos prioritarios", est["h"]))
    filas = [["Nivel", "Evento", "Lugar", "Evidencia", "Fuente"]]
    for e in top:
        c = e.get("confianza") or {}
        filas.append([Paragraph(f'<font color="{nivel_de(e)[0]}"><b>{(e.get("nivel_txt") or "sin nivel").split(" ")[0]}</b></font>', est["p"]), Paragraph(e["titulo"][:130].replace("&", "&amp;").replace("<", "&lt;") + (f'<br/><font size="7" color="{GRIS}">{e.get("subtipo", "")}: {e["ficha_resumen"]}</font>'.replace("&", "&amp;") if e.get("ficha_resumen") else "") + (f'<br/><font size="7" color="#b00020">Atención: {e["advertencia"]}</font>'.replace("&", "&amp;") if e.get("advertencia") else ""), est["p"]),
                      Paragraph((e.get("lugar") or "—").replace("&", "&amp;"), est["c"]), Paragraph(f'{EV_ETIQ.get(c.get("nivel"), "—")} · {c.get("fuentes_independientes", 0)} fuentes', est["c"]), Paragraph((e.get("fuente") or "")[:30], est["c"])])
    tb = Table(filas, colWidths=[17 * mm, 80 * mm, 32 * mm, 28 * mm, 23 * mm], repeatRows=1)
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZUL)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTSIZE", (0, 0), (-1, 0), 8), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f8fb")]), ("LINEBELOW", (0, 0), (-1, -1), .25, colors.HexColor("#d5dde5"))]))
    el.append(tb)
    if hechos:
        import hechos_v3
        ev_h = sorted((h for h in hechos.values() if h["estado"] == "abierto" and len(h["notas"]) > 1 and h["ultima"] >= ahora - horas * 3600000 * 3), key=lambda h: -len(h["notas"]))[:6]
        if ev_h:
            el.append(Paragraph("Hechos en evolución", est["h"]))
            fh = [["Hecho", "Lugar", "Seguimiento", "Cómo cambiaron las cifras"]]
            for h in ev_h:
                medios = len({n["fuente"] for n in h["notas"]})
                f1, f2 = (dt.datetime.fromtimestamp(h[k] / 1000, BO).strftime("%d/%m %H:%M") for k in ("primera", "ultima"))
                fh.append([Paragraph(h["notas"][-1]["titulo"][:90].replace("&", "&amp;").replace("<", "&lt;") + f'<br/><font size="7" color="{GRIS}">{h["subtipo"]}{" · reabierto" if h["reaperturas"] else ""}</font>', est["p"]),
                           Paragraph((h.get("lugar") or "—").replace("&", "&amp;"), est["c"]), Paragraph(f"{f1} → {f2}<br/>{len(h['notas'])} notas, {medios} medios", est["c"]),
                           Paragraph((hechos_v3.evolucion(h) or "sin cifras en las notas").replace("&", "&amp;") + (" (prensa, sin confirmar)" if not any(n["oficial"] for n in h["notas"]) else ""), est["c"])])
            tf = Table(fh, colWidths=[62 * mm, 30 * mm, 30 * mm, 58 * mm], repeatRows=1)
            tf.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZUL)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTSIZE", (0, 0), (-1, 0), 8), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f8fb")]), ("LINEBELOW", (0, 0), (-1, -1), .25, colors.HexColor("#d5dde5"))]))
            el.append(tf)
    fuentes = collections.Counter(e.get("fuente", "") for e in evs).most_common(6)
    el += [Paragraph("Método y trazabilidad", est["h"]),
           Paragraph("* Las cifras de víctimas vienen de titulares y notas de prensa y pueden cambiar; sin fuente institucional no pasan de nivel «corroborado». Los puntos del mapa son solo hechos ubicados con precisión de municipio o punto. "
                     "Nivel y evidencia se calculan con reglas publicadas (ver README del repositorio). Fuentes más frecuentes: " + ", ".join(f"{n} ({c})" for n, c in fuentes if n) + ".", est["c"]),
           Paragraph(f"Generado {dt.datetime.now(BO).strftime('%d/%m/%Y %H:%M')} · {len(eventos)} eventos en el período de captura · esquema de evento v1.", est["c"])]
    doc.build(el)
    return {"eventos": len(evs), "top": len(top)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--eventos", default="docs/eventos_unificados.json"); ap.add_argument("--horas", type=int, default=24); ap.add_argument("--salida", default="salida/boletin.pdf")
    a = ap.parse_args(); os.makedirs(os.path.dirname(a.salida) or ".", exist_ok=True)
    print(build(json.load(open(a.eventos, encoding="utf-8"))["eventos"], a.salida, a.horas))

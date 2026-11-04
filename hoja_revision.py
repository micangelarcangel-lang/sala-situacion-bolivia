# -*- coding: utf-8 -*-
"""Hoja de revisión: muestra estratificada de hechos de prensa de la v3 para que una persona marque lo correcto e incorrecto.
Uso: python hoja_revision.py --n 40 --semilla 7  -> datos/v3/revision.pdf y datos/v3/revision.json (clave con ids para medir el acierto)"""
import argparse, json, random, collections, html
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


def muestra(eventos, n, semilla):
    p = [x for x in eventos if x["origen"] == "prensa" and x.get("relevante_v3") and x.get("ambito") == "bolivia" and not x.get("informacion_insuficiente")]
    # un representante por grupo propuesto: no se revisa dos veces el mismo hecho
    vistos, uniq = set(), []
    for x in p:
        k = tuple(sorted(x.get("grupo_propuesto") or [x["id"]]))
        if k not in vistos:
            vistos.add(k); uniq.append(x)
    por_tipo = collections.defaultdict(list)
    for x in uniq:
        por_tipo[x["subtipo"]].append(x)
    rnd = random.Random(semilla)
    sel = []
    # cada tipo con al menos 1 y hasta el reparto proporcional
    for t, l in por_tipo.items():
        rnd.shuffle(l)
        sel.append(l.pop())
    resto = [x for l in por_tipo.values() for x in l]
    rnd.shuffle(resto)
    sel += resto[: max(0, n - len(sel))]
    sel = sel[:n]
    rnd.shuffle(sel)
    return sel


def build(eventos, n, semilla, pdf, clave):
    sel = muestra(eventos, n, semilla)
    S = lambda **k: ParagraphStyle("x", fontName=k.pop("f", "Helvetica"), fontSize=k.pop("s", 8), leading=k.pop("l", 10), **k)
    esc = lambda t: html.escape("".join(c for c in str(t or "") if ord(c) < 0x2000 or 0x2010 <= ord(c) <= 0x206F))  # sin emojis ni símbolos que Helvetica no dibuja
    filas = [["#", "Hecho (medio)", "Lugar que decidió el sistema", "Tipo", "Datos que extrajo", "Lugar", "Tipo", "Datos"]]
    for i, x in enumerate(sel, 1):
        lug = x.get("lugar") or "sin ubicar"
        prec = x.get("precision_ubicacion", "")
        url = x.get("url") or ""
        titulo = esc(x["titulo"][:150]) + (f' <font size="6.5" color="#0b5cad"><a href="{esc(url)}">(abrir nota)</a></font>' if url else "")
        filas.append([str(i), Paragraph(f'{titulo}<br/><font size="7" color="#5b6b7a">{esc(x.get("fuente",""))}</font>', S()), Paragraph(f'{esc(lug)}<br/><font size="7" color="#5b6b7a">precisión: {esc(prec)}</font>', S()),
                      Paragraph(esc(x["subtipo"]), S()), Paragraph(esc(x.get("ficha_resumen", "")), S(s=7.5)), "[   ]", "[   ]", "[   ]"])
    t = Table(filas, colWidths=[8 * mm, 88 * mm, 42 * mm, 26 * mm, 80 * mm, 11 * mm, 11 * mm, 11 * mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0b3d6e")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTSIZE", (0, 0), (-1, 0), 8), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (5, 1), (-1, -1), "CENTER"), ("FONTSIZE", (5, 1), (-1, -1), 9), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f8fb")]),
                           ("LINEBELOW", (0, 0), (-1, -1), .25, colors.HexColor("#d5dde5")), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    doc = SimpleDocTemplate(pdf, pagesize=landscape(A4), leftMargin=10 * mm, rightMargin=10 * mm, topMargin=10 * mm, bottomMargin=10 * mm, title="Hoja de revisión — Sala de Situación Bolivia v3")
    intro = [Paragraph("<b>Hoja de revisión · Sala de Situación Bolivia v3</b>", S(s=13, l=16, textColor=colors.HexColor("#0b3d6e"))),
             Paragraph("Para cada hecho, marque una X en la columna que esté <b>incorrecta</b> (deje [   ] vacío si está bien): <b>Lugar</b> = ubicación o precisión; <b>Tipo</b> = tipo de evento; <b>Datos</b> = cifras y campos de la ficha (incluye lo que falta). "
                       "Responda en el chat con los números, por ejemplo: «Lugar mal: 3, 7 · Tipo mal: 12 · Datos mal: 5, 9, 14». «Abrir nota» lleva a la nota original para comprobar.", S(s=8.5, l=11)), Spacer(1, 4)]
    doc.build(intro + [t])
    json.dump({"semilla": semilla, "n": len(sel), "items": [{"n": i, "id": x["id"], "titulo": x["titulo"], "lugar": x.get("lugar"), "precision": x.get("precision_ubicacion"), "subtipo": x["subtipo"], "ficha": x.get("ficha")} for i, x in enumerate(sel, 1)]},
              open(clave, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return collections.Counter(x["subtipo"] for x in sel)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=40); ap.add_argument("--semilla", type=int, default=7)
    a = ap.parse_args()
    ev = json.load(open("datos/v3/eventos_v3.json", encoding="utf-8"))["eventos"]
    print(build(ev, a.n, a.semilla, "datos/v3/revision.pdf", "datos/v3/revision.json"))

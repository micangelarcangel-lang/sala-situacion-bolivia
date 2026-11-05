# -*- coding: utf-8 -*-
"""Estilo común de los gráficos de los boletines (método dataviz: marcas finas, extremos redondeados, 2 px de separación, grilla apenas visible,
etiquetas solo donde importan, color por función). Fuente Inter incluida en fuentes/ (licencia OFL)."""
import os, io, collections
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import FancyBboxPatch, Polygon

AQUI = os.path.dirname(os.path.abspath(__file__))
for f in ("Inter-Regular.otf", "Inter-SemiBold.otf"):
    p = os.path.join(AQUI, "fuentes", f)
    if os.path.exists(p):
        fm.fontManager.addfont(p)

SUP, TXT, TXT2, TXT3, GRILLA = "#ffffff", "#0b0b0b", "#52514e", "#8a8984", "#e9e8e4"
CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"]  # azul, naranja, aqua, amarillo, magenta, violeta (orden fijo)
OTROS = "#a9a8a2"
SEC = ["#dbe7f6", "#a9c6ea", "#6fa1de", "#2a78d6", "#1b4f92"]  # una sola tonalidad, de claro a oscuro
FUENTE = "Inter" if any(f.name == "Inter" for f in fm.fontManager.ttflist) else "DejaVu Sans"


def _base(w, h):
    plt.rcParams.update({"font.family": FUENTE, "text.color": TXT, "axes.labelcolor": TXT2, "xtick.color": TXT2, "ytick.color": TXT2, "axes.edgecolor": GRILLA, "figure.facecolor": SUP, "axes.facecolor": SUP})
    fig, ax = plt.subplots(figsize=(w, h))
    fig.patch.set_facecolor(SUP)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(GRILLA)
    ax.spines["bottom"].set_linewidth(.8)
    ax.tick_params(length=0, labelsize=7.5)
    return fig, ax


def imagen(buf, ancho):
    """Imagen de reportlab con la proporción real del gráfico (sin deformarlo). ancho en puntos."""
    from PIL import Image as PI
    from reportlab.platypus import Image as RI
    im = PI.open(buf); w, h = im.size; buf.seek(0)
    return RI(buf, ancho, ancho * h / w)


def png(fig, dpi=220):
    b = io.BytesIO(); fig.savefig(b, format="png", dpi=dpi, bbox_inches="tight", facecolor=SUP); plt.close(fig); b.seek(0); return b


def titulo(ax, t, sub=None):
    ax.set_title(t, fontsize=9.5, loc="left", color=TXT, fontweight=600, pad=14 if sub else 8)
    if sub:
        ax.text(0, 1.03, sub, transform=ax.transAxes, fontsize=7.5, color=TXT3, va="bottom")


def _barra(ax, x0, y, largo, alto, color, horizontal=True):
    """Barra con extremo redondeado y base recta (se dibuja redonda y se tapa la base con un rectángulo)."""
    r = min(alto, largo) / 2.2
    if horizontal:
        ax.add_patch(FancyBboxPatch((x0, y - alto / 2), largo, alto, boxstyle=f"round,pad=0,rounding_size={r}", fc=color, ec="none", mutation_aspect=1))
        ax.add_patch(plt.Rectangle((x0, y - alto / 2), min(r * 2, largo) / 2, alto, fc=color, ec="none"))


def barras_h(datos, titulo_txt, sub=None, w=3.5, h=2.3, color=CAT[0], max_n=8):
    """Barras horizontales finas, valor en la punta, sin ejes de valor."""
    datos = datos[:max_n][::-1]
    fig, ax = _base(w, h)
    mx = max((v for _, v in datos), default=1)
    for i, (k, v) in enumerate(datos):
        _barra(ax, 0, i, v, .46, color)
        ax.text(v + mx * .02, i, f"{v:,}".replace(",", "."), va="center", fontsize=7.5, color=TXT, fontweight=600)
    ax.set_yticks(range(len(datos))); ax.set_yticklabels([k.replace(" transmisible", "")[:34] for k, _ in datos], fontsize=7.5)
    ax.set_xlim(0, mx * 1.18); ax.set_ylim(-.6, len(datos) - .4); ax.set_xticks([]); ax.spines["bottom"].set_visible(False)
    titulo(ax, titulo_txt, sub)
    return png(fig)


def apiladas(mat, etiquetas_x, titulo_txt, sub=None, w=7.2, h=2.5):
    """Columnas apiladas (hasta 5 tipos + otros), 2 px de separación entre tramos, grilla de un solo tono, leyenda en una fila."""
    fig, ax = _base(w, h)
    n = len(etiquetas_x)
    base = [0] * n
    tipos = list(mat)
    for k, t in enumerate(tipos):
        col = OTROS if t == "otros" else CAT[k % len(CAT)]
        ax.bar(range(n), mat[t], bottom=base, color=col, width=.5, edgecolor=SUP, linewidth=1.2, label=t[:28])
        base = [a + b for a, b in zip(base, mat[t])]
    for i, t in enumerate(base):
        if t:
            ax.text(i, t + max(base) * .03, str(t), ha="center", fontsize=7.5, color=TXT, fontweight=600)
    ax.set_xticks(range(n)); ax.set_xticklabels(etiquetas_x, fontsize=7.5)
    ax.set_ylim(0, max(1, max(base)) * 1.25); ax.yaxis.grid(True, color=GRILLA, linewidth=.8); ax.set_axisbelow(True)
    ax.tick_params(axis="y", labelsize=7, colors=TXT3)
    ax.legend(fontsize=7, frameon=False, ncol=3, loc="upper left", bbox_to_anchor=(0, 1.0), handlelength=1, handleheight=1, labelcolor=TXT2)
    titulo(ax, titulo_txt, sub)
    return png(fig)


def linea_escalon(serie, titulo_txt, sub=None, w=7.2, h=2.0):
    """Evolución de una cifra: escalones, 2 px, puntos de 8 px con aro de superficie, etiqueta solo en el primero y el último."""
    import datetime as dt
    fig, ax = _base(w, h)
    xs = [dt.datetime.fromtimestamp(t / 1000, dt.timezone(dt.timedelta(hours=-4))) for t, _ in serie]
    ys = [v for _, v in serie]
    ax.step(xs, ys, where="post", color=CAT[0], linewidth=2, solid_capstyle="round")
    ax.scatter(xs, ys, s=34, color=CAT[0], edgecolor=SUP, linewidth=2, zorder=3)
    for i in (0, len(ys) - 1):
        ax.annotate(f"{ys[i]:,}".replace(",", "."), (xs[i], ys[i]), textcoords="offset points", xytext=(0, 8), ha="center", fontsize=7.5, color=TXT, fontweight=600)
    ax.yaxis.grid(True, color=GRILLA, linewidth=.8); ax.set_axisbelow(True); ax.tick_params(axis="y", labelsize=7, colors=TXT3)
    ax.set_ylim(min(ys) - (max(ys) - min(ys)) * .15 if max(ys) != min(ys) else 0, max(ys) + (max(ys) - min(ys) or max(ys)) * .25)
    fig.autofmt_xdate(); titulo(ax, titulo_txt, sub)
    return png(fig)


def _pol(g):
    return [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]


def mapa(geo_mun, geo_dep, por_municipio, puntos, titulo_txt, sub=None, w=4.4, h=4.9):
    """Mapa sin marco: municipios en gris cálido; los que tienen hechos se pintan en una sola tonalidad azul (más oscuro = más hechos);
    límites departamentales finos encima con el nombre del departamento; hechos ubicados en un punto como círculo oscuro con aro de superficie."""
    fig, ax = plt.subplots(figsize=(w, h)); fig.patch.set_facecolor(SUP); ax.set_facecolor(SUP)
    mx = max(por_municipio.values(), default=1)
    for f in geo_mun["features"]:
        n = por_municipio.get((f["properties"]["n"], f["properties"]["d"]), 0)
        col = "#efeeea" if n == 0 else (SEC[2] if n == 1 else (SEC[3] if n <= 3 else SEC[4]))
        for p in _pol(f["geometry"]):
            ax.add_patch(Polygon(p[0], closed=True, fc=col, ec=SUP, lw=.35))
    for f in geo_dep["features"]:
        xs, ys = [], []
        for p in _pol(f["geometry"]):
            ax.add_patch(Polygon(p[0], closed=True, fc="none", ec="#8f8e88", lw=.6))
            xs += [q[0] for q in p[0]]; ys += [q[1] for q in p[0]]
        ax.text(sum(xs) / len(xs), sum(ys) / len(ys), f["properties"]["n"].upper(), fontsize=5.2, color="#6b6a65", ha="center", va="center", fontweight=600, alpha=.9)
    for lon, lat in puntos:
        ax.scatter(lon, lat, s=16, color="#0b0b0b", edgecolor=SUP, linewidth=1.2, zorder=4)
    ax.autoscale_view(); ax.set_aspect("equal"); ax.axis("off")
    ax.set_title(titulo_txt, fontsize=9.5, loc="left", color=TXT, fontweight=600, pad=14 if sub else 8)
    if sub:
        ax.text(0, 1.015, sub, transform=ax.transAxes, fontsize=7, color=TXT3, va="bottom")
    # leyenda mínima: tonos y punto
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch
    hand = [Patch(fc="#efeeea", ec=GRILLA, label="sin hechos")] + [Patch(fc=SEC[i], label=l) for i, l in ((2, "1 hecho"), (3, "2 a 3"), (4, "4 o más"))] + [Line2D([0], [0], marker="o", color="w", markerfacecolor="#0b0b0b", markeredgecolor=SUP, markersize=5, label="hecho ubicado")]
    ax.legend(handles=hand, fontsize=6.3, frameon=False, loc="lower left", labelcolor=TXT2, handlelength=1, ncol=1)
    return png(fig)

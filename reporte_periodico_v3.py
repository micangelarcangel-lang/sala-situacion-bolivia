# -*- coding: utf-8 -*-
"""Boletines semanal y mensual v3 sobre HECHOS (cada hecho cuenta una vez, con su cifra vigente al corte). El semanal sigue la SE (domingo a sábado) y el mensual el mes calendario;
cada uno tiene su propia estructura: el semanal es operativo-analítico (panorama de la semana, comparación con la anterior, mapa, hechos con seguimiento); el mensual es de tendencia y balance."""
import collections, datetime as dt
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
import hechos_v3, periodos
from reporte_v3 import _png, AZUL, GRIS, BO

D = 24 * 3600 * 1000
PAL = ["#0b3d6e", "#c0392b", "#e67e22", "#2e8b57", "#7d3c98", "#7f8c8d"]
DEPS = ["La Paz", "Santa Cruz", "Cochabamba", "Oruro", "Potosí", "Chuquisaca", "Tarija", "Beni", "Pando"]


def _e(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;")


def _sp(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)


def _ahora_cifras(hs, corte):
    f = h_ = 0
    for h in hs:
        cv = hechos_v3.cifra_vigente(h, corte)
        f += cv.get("fallecidos", {}).get("valor", 0); h_ += cv.get("heridos", {}).get("valor", 0)
    return f, h_


def g_serie(hs, ini, n, paso_dias, etiquetas, titulo, por_tipo=True):
    """Hechos nuevos por día (o por semana) apilados por los 5 tipos más frecuentes + otros."""
    tipos = [t for t, _ in collections.Counter(h["subtipo"] for h in hs).most_common(5)]
    mat = {t: [0] * n for t in tipos + ["otros"]}
    for h in hs:
        i = int((h["primera"] - ini) // (paso_dias * D))
        if 0 <= i < n:
            mat[h["subtipo"] if h["subtipo"] in tipos else "otros"][i] += 1
    fig, ax = plt.subplots(figsize=(7.2, 2.4))
    base = [0] * n
    for k, t in enumerate(tipos + ["otros"]):
        ax.bar(range(n), mat[t], bottom=base, color=PAL[k % len(PAL)], label=t[:26], width=.7); base = [a + b for a, b in zip(base, mat[t])]
    ax.set_xticks(range(n)); ax.set_xticklabels(etiquetas, fontsize=7)
    ax.set_title(titulo, fontsize=9, loc="left"); ax.tick_params(labelsize=7); _sp(ax)
    ax.set_ylim(0, max(1, max(base)) * 1.45)
    ax.legend(fontsize=6, frameon=False, ncol=3, loc="upper left")
    return _png(fig)


def g_tipos(hs, titulo="Hechos por tipo"):
    c = collections.Counter(h["subtipo"] for h in hs).most_common(8)
    fig, ax = plt.subplots(figsize=(3.6, 2.4))
    ax.barh([k[:28] for k, _ in c][::-1], [v for _, v in c][::-1], color=AZUL)
    for i, v in enumerate([v for _, v in c][::-1]):
        ax.text(v, i, f" {v}", va="center", fontsize=7)
    ax.set_title(titulo, fontsize=9, loc="left"); ax.tick_params(labelsize=7); ax.set_xticks([]); _sp(ax)
    return _png(fig)


def g_deptos(hs):
    c = collections.Counter(h.get("departamento") for h in hs if h.get("departamento"))
    xs = [d for d in DEPS if c.get(d)]; xs.sort(key=lambda d: c[d])
    fig, ax = plt.subplots(figsize=(3.6, 2.4))
    ax.barh(xs, [c[d] for d in xs], color=AZUL)
    for i, d in enumerate(xs):
        ax.text(c[d], i, f" {c[d]}", va="center", fontsize=7)
    ax.set_title("Hechos por departamento", fontsize=9, loc="left"); ax.tick_params(labelsize=7); ax.set_xticks([]); _sp(ax)
    return _png(fig)


def g_mapa(hs, geo_dep):
    """Mapa departamental (cantidad de hechos, un solo color en tres intensidades) con los hechos de municipio o punto encima."""
    c = collections.Counter(h.get("departamento") for h in hs if h.get("departamento"))
    mx = max(c.values(), default=1)
    fig, ax = plt.subplots(figsize=(4.2, 4.6))
    for f in geo_dep["features"]:
        g = f["geometry"]; polis = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        a = c.get(f["properties"]["n"], 0) / mx
        col = "#eef2f6" if a == 0 else ("#c9d9ea" if a < .34 else ("#8fb0d3" if a < .67 else "#4f7fb3"))
        for p in polis:
            ax.fill(*zip(*p[0]), facecolor=col, edgecolor="#9aa7b4", linewidth=.5)
    n = 0
    for h in hs:
        if h.get("lat") is not None and h.get("precision") in ("municipio", "punto"):
            ax.scatter(h["lon"], h["lat"], s=18, color="#c0392b", edgecolor="white", linewidth=.4, zorder=3); n += 1
    ax.set_aspect("equal"); ax.axis("off"); ax.set_title(f"Hechos por departamento (tono) y hechos ubicados en su municipio ({n}, puntos)", fontsize=7.5, loc="left")
    return _png(fig)


def g_evolucion(h):
    cv = hechos_v3.cifra_vigente(h)
    campo = next((c for c in ("fallecidos", "familias_afectadas", "personas_afectadas", "casos_notificados", "heridos") if c in cv and len({v for _, v in cv[c]["serie"]}) > 1 and cv[c]["valor"] >= 2 and not cv[c]["revisar"]), None)
    if not campo:
        return None
    s = cv[campo]["serie"]
    fig, ax = plt.subplots(figsize=(7.2, 1.9))
    ax.step([dt.datetime.fromtimestamp(t / 1000, BO) for t, _ in s], [v for _, v in s], where="post", color=AZUL, marker="o", ms=3)
    ax.set_title(f"Evolución de {campo.replace('_', ' ')}: {h['subtipo']}, {h.get('lugar') or ''}"[:110], fontsize=8, loc="left"); ax.tick_params(labelsize=7); fig.autofmt_xdate(); _sp(ax)
    return _png(fig)


def _desde(hechos, ahora):
    """Desde cuándo hay datos: se ignoran los 2 hechos más antiguos (notas viejas reubicadas por su fecha) para no creer que hay semanas completas que no existen."""
    ts = sorted(n["ts"] for h in hechos.values() for n in h["notas"] if not h.get("fusionados") or True)
    return ts[min(len(ts) - 1, 4)] if ts else ahora


def _estilos():
    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("f", "Helvetica"), fontSize=k.pop("s", 9), leading=k.pop("l", 12), **k)
    return {"t": S("t", f="Helvetica-Bold", s=17, l=20, textColor=colors.HexColor(AZUL)), "p": S("p"), "c": S("c", s=7.5, l=10, textColor=colors.HexColor(GRIS)), "b": S("b", s=9.5, l=13),
            "h": S("h", f="Helvetica-Bold", s=11, l=14, textColor=colors.HexColor(AZUL), spaceBefore=8, spaceAfter=3), "k": S("k", f="Helvetica-Bold", s=15, l=18, alignment=1), "kl": S("kl", s=7.5, l=9, alignment=1, textColor=colors.HexColor(GRIS)),
            "alerta": S("a", s=8, textColor=colors.HexColor("#b00020"))}


def _tabla(filas, anchos):
    t = Table(filas, colWidths=[a * mm for a in anchos], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZUL)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTSIZE", (0, 0), (-1, 0), 8), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f8fb")]), ("LINEBELOW", (0, 0), (-1, -1), .25, colors.HexColor("#d5dde5"))]))
    return t


def _kpis(est, datos):
    t = Table([[Paragraph(str(v), est["k"]) for v, _ in datos], [Paragraph(l, est["kl"]) for _, l in datos]], colWidths=[170 / len(datos) * mm] * len(datos))
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .5, colors.HexColor("#c7d0d9")), ("LINEAFTER", (0, 0), (-2, -1), .3, colors.HexColor("#c7d0d9")), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f8fb")), ("TOPPADDING", (0, 0), (-1, -1), 4)]))
    return t


def _delta(a, b):
    if b is None:
        return str(a)
    d = a - b
    return f"{a} ({'+' if d > 0 else ''}{d} vs. anterior)" if d else f"{a} (igual que el anterior)"


def _hechos_periodo(hechos, ini, fin):
    """Hechos con alguna nota dentro del período; 'nuevos' los que empiezan en él."""
    en = [h for h in hechos.values() if h["ultima"] >= ini and h["primera"] <= fin]
    return en, [h for h in en if h["primera"] >= ini]


def _calidad(hs):
    n = max(1, len(hs))
    muni = sum(h.get("precision") in ("municipio", "punto", "varios", "tramo") for h in hs)
    cif = sum(bool(hechos_v3.cifra_vigente(h)) for h in hs)
    multi = sum(len({x["fuente"] for x in h["notas"]}) > 1 for h in hs)
    return {"lugar_preciso": round(100 * muni / n), "con_cifras": round(100 * cif / n), "varios_medios": round(100 * multi / n)}


def _bloque_hechos(el, est, hs, ahora, n=10, con_grafica=True):
    mayores = sorted(hs, key=lambda h: (-len(h["notas"]), -h["ultima"]))[:n]
    if con_grafica:
        g = next((x for x in (g_evolucion(h) for h in mayores) if x), None)
        if g:
            el += [Paragraph("Hecho con mayor evolución", est["h"]), Image(g, 170 * mm, 45 * mm)]
    filas = [["Hecho", "Lugar", "Seguimiento", "Cifras (evolución)"]]
    for h in mayores:
        a, b = (dt.datetime.fromtimestamp(h[k] / 1000, BO).strftime("%d/%m") for k in ("primera", "ultima"))
        filas.append([Paragraph(_e(h["notas"][-1]["titulo"][:90]) + f'<br/><font size="7" color="{GRIS}">{h["subtipo"]} · {h["estado"]}{" · reabierto" if h["reaperturas"] else ""}</font>', est["p"]), Paragraph(_e(h.get("lugar") or "—"), est["c"]),
                      Paragraph(f"{a} → {b}<br/>{len(h['notas'])} notas, {len({x['fuente'] for x in h['notas']})} medios", est["c"]),
                      Paragraph(_e(hechos_v3.evolucion(h) or "sin cifras en las notas") + ("" if any(x["oficial"] for x in h["notas"]) else " (prensa, sin confirmar)"), est["c"])])
    el += [Paragraph("Hechos con más seguimiento", est["h"]), _tabla(filas, [62, 30, 30, 58])]


def _narrativa(hs, nuevos, f_, her):
    if not hs:
        return "No se registraron hechos en el período."
    tipo, nt = collections.Counter(h["subtipo"] for h in hs).most_common(1)[0]
    dep = collections.Counter(h.get("departamento") for h in hs if h.get("departamento")).most_common(1)
    mayor = max(hs, key=lambda h: len(h["notas"]))
    s = f"Se siguieron {len(hs)} hechos ({len(nuevos)} nuevos en el período). El tipo más frecuente fue «{tipo}» ({nt}). "
    if dep:
        s += f"El departamento con más hechos fue {dep[0][0]} ({dep[0][1]}). "
    s += f"El hecho con más cobertura fue «{mayor['notas'][-1]['titulo'][:90]}» ({len(mayor['notas'])} notas de {len({x['fuente'] for x in mayor['notas']})} medios). "
    return s + f"Suma de la cifra vigente: {f_} fallecidos y {her} heridos (prensa, sin confirmar salvo que se indique)."


def _metodo(el, est, hs, desde, ini, tipo):
    q = _calidad(hs)
    el += [Paragraph("Calidad de la información y método", est["h"]),
           Paragraph(f"Con lugar identificado hasta municipio, tramo o varios municipios: {q['lugar_preciso']}% de los hechos. Con alguna cifra: {q['con_cifras']}%. Cubiertos por más de un medio: {q['varios_medios']}%. "
                     "Un hecho cuenta una sola vez aunque lo cubran varios medios o lo sigan varios días. Cifra vigente: la mayor de fuente oficial; si no hay, la mayor de prensa. Si una nota posterior da una cifra menor, el hecho se marca para revisión. "
                     "Todo lo de prensa es información sin verificar; el nivel «confirmado» exige fuente institucional o validación.", est["c"])]
    if desde > ini + D:
        el.append(Paragraph(f"Atención: el sistema acumula hechos desde el {dt.datetime.fromtimestamp(desde / 1000, BO).strftime('%d/%m/%Y')}; este {tipo} está incompleto.", est["alerta"]))


def _doc(salida, titulo, el):
    SimpleDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=13 * mm, bottomMargin=13 * mm, title=titulo, author="Sala de Situación Bolivia").build(el)


def build_semanal(hechos, ahora, salida, geo_dep=None, inicio=None):
    ini, fin, s, cerrada = periodos.ventana_semanal(ahora)
    est = _estilos()
    hs, nuevos = _hechos_periodo(hechos, ini, fin)
    prev_ini, prev_fin = ini - 7 * D, ini - 1
    hp, nuevos_p = _hechos_periodo(hechos, prev_ini, prev_fin)
    desde = inicio or _desde(hechos, ahora)
    hay_prev = desde <= prev_ini  # solo se compara si la semana anterior está completa en los datos
    f_, her = _ahora_cifras(hs, fin)
    fp, herp = _ahora_cifras(hp, prev_fin)
    fe = lambda t: dt.datetime.fromtimestamp(t / 1000, BO).strftime("%d/%m/%Y")
    el = [Paragraph("Sala de Situación Bolivia · Boletín semanal", est["t"]),
          Paragraph(f"{periodos.etiqueta_semana(s)} · {'semana cerrada' if cerrada else 'semana en curso (parcial, hasta ' + dt.datetime.fromtimestamp(fin / 1000, BO).strftime('%d/%m %H:%M') + ')'} · emisión: domingos 7:00 (hora de Bolivia)", est["c"]), Spacer(1, 5),
          _kpis(est, [(_delta(len(nuevos), len(nuevos_p) if hay_prev else None), "hechos nuevos"), (sum(h["estado"] == "abierto" for h in hs), "siguen abiertos"), (sum(h["reaperturas"] > 0 for h in hs), "reabiertos"),
                      (f"{f_} / {her}", "fallecidos / heridos*")]), Spacer(1, 6), Paragraph(_narrativa(hs, nuevos, f_, her), est["b"])]
    dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
    if hs:
        el += [Spacer(1, 4), Image(g_serie(hs, ini, 7, 1, [f"{dias[i]} {(dt.datetime.fromtimestamp(ini / 1000, BO) + dt.timedelta(days=i)).day}" for i in range(7)], "Hechos nuevos por día de la semana"), 170 * mm, 56 * mm)]
        el.append(Table([[Image(g_tipos(hs), 83 * mm, 55 * mm), Image(g_deptos(hs), 83 * mm, 55 * mm)]], colWidths=[88 * mm] * 2))
    if geo_dep and hs:
        el += [PageBreak(), Paragraph("Dónde ocurrió", est["h"])]
        por_dep = collections.defaultdict(list)
        for h in hs:
            por_dep[h.get("departamento") or "Varios / nacional"].append(h)
        filas = [["Departamento", "Hechos", "Principales tipos"]] + [[d, str(len(v)), ", ".join(f"{t} ({n})" for t, n in collections.Counter(x["subtipo"] for x in v).most_common(3))] for d, v in sorted(por_dep.items(), key=lambda kv: -len(kv[1]))]
        el.append(Table([[Image(g_mapa(hs, geo_dep), 78 * mm, 85 * mm), _tabla([filas[0]] + [[Paragraph(_e(c), est["c"]) for c in f] for f in filas[1:]], [26, 14, 52])]], colWidths=[82 * mm, 92 * mm]))
    if hs:
        _bloque_hechos(el, est, hs, ahora, 10)
    _metodo(el, est, hs, desde, ini, "boletín")
    el.append(Paragraph("* Suma de la cifra vigente de cada hecho. " + ("La comparación con la semana anterior no está disponible: el sistema aún no acumula una semana previa completa." if not hay_prev else ""), est["c"]))
    _doc(salida, "Boletín semanal", el)
    return {"hechos": len(hs), "se": s["nro"], "cerrada": cerrada}


def build_mensual(hechos, ahora, salida, geo_dep=None, inicio=None):
    ini, fin, etiqueta, cerrado = periodos.ventana_mensual(ahora)
    est = _estilos()
    hs, nuevos = _hechos_periodo(hechos, ini, fin)
    desde = inicio or _desde(hechos, ahora)
    f_, her = _ahora_cifras(hs, fin)
    # tendencia por semana epidemiológica (domingo a sábado) dentro del mes
    sems, t = [], ini
    while t <= fin:
        s = periodos.semana(dt.datetime.fromtimestamp(t / 1000, BO).date())
        if not sems or sems[-1]["nro"] != s["nro"]:
            sems.append(s)
        t += D
    i0 = int(dt.datetime.combine(sems[0]["ini"], dt.time(0, 0), BO).timestamp() * 1000)
    el = [Paragraph("Sala de Situación Bolivia · Boletín mensual", est["t"]), Paragraph(f"{etiqueta} · {'mes cerrado' if cerrado else 'mes en curso (parcial, hasta ' + dt.datetime.fromtimestamp(fin / 1000, BO).strftime('%d/%m') + ')'} · emisión: primer día del mes, 7:00", est["c"]), Spacer(1, 5),
          _kpis(est, [(len(hs), "hechos en el mes"), (len(nuevos), "nuevos"), (sum(h["estado"] == "abierto" for h in hs), "siguen abiertos"), (f"{f_} / {her}", "fallecidos / heridos*")]), Spacer(1, 6), Paragraph(_narrativa(hs, nuevos, f_, her), est["b"])]
    if hs:
        el += [Spacer(1, 4), Image(g_serie(hs, i0, len(sems), 7, [f"SE {s['nro']}\n{s['ini'].strftime('%d/%m')}" for s in sems], "Hechos nuevos por semana (domingo a sábado)"), 170 * mm, 56 * mm),
               Table([[Image(g_tipos(hs, "Hechos del mes por tipo"), 83 * mm, 55 * mm), Image(g_deptos(hs), 83 * mm, 55 * mm)]], colWidths=[88 * mm] * 2)]
        # balance por tipo: hechos, cerrados, fallecidos
        filas = [["Tipo de hecho", "Hechos", "Abiertos", "Fallecidos (vigente)", "Heridos (vigente)"]]
        for tp, n in collections.Counter(h["subtipo"] for h in hs).most_common():
            g = [h for h in hs if h["subtipo"] == tp]
            ff, hh = _ahora_cifras(g, fin)
            filas.append([tp, str(n), str(sum(h["estado"] == "abierto" for h in g)), str(ff), str(hh)])
        el += [Paragraph("Balance del mes por tipo", est["h"]), _tabla([filas[0]] + [[Paragraph(_e(c), est["c"]) for c in f] for f in filas[1:]], [62, 22, 24, 34, 28])]
        if geo_dep:
            el += [PageBreak(), Paragraph("Dónde ocurrió", est["h"]), Table([[Image(g_mapa(hs, geo_dep), 78 * mm, 85 * mm), Paragraph("Tono más fuerte = más hechos en el departamento. Los puntos son hechos ubicados hasta municipio; los hechos de varios municipios, de alcance nacional o solo con departamento no tienen punto.", est["c"])]], colWidths=[82 * mm, 92 * mm])]
        _bloque_hechos(el, est, hs, ahora, 15)
    _metodo(el, est, hs, desde, ini, "mes")
    el.append(Paragraph("* Suma de la cifra vigente de cada hecho. Los hechos que cruzan dos meses se cuentan en ambos (aparecen en el mes en que tuvieron notas).", est["c"]))
    _doc(salida, "Boletín mensual", el)
    return {"hechos": len(hs), "mes": etiqueta, "cerrado": cerrado}

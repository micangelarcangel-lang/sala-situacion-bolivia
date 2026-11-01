# -*- coding: utf-8 -*-
"""Reporte de situación (diario, semanal, mensual o por solicitud) sobre la base UNIFICADA y triangulada de la Sala de Situación.
Contenido: resumen ejecutivo y lectura de la situación, mapa numerado, fichas de hechos prioritarios (con índice de prioridad,
cobertura y evolución), seguimiento de hechos que cambian, indicadores por tipo de amenaza (Ley 602 art. 36), gráficos,
registro, fuentes consultadas, metodología y límites.  Memoria de seguimiento: docs/seguimiento.json."""
import os, io, re, json, time, datetime as dt
from collections import Counter, defaultdict
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
import reporte_pdf as rp

TZ = dt.timezone(dt.timedelta(hours=-4))
DIA = 86400000
CATCOL = {"geológica": "#8d6e63", "meteorológica": "#1e88e5", "hidrológica": "#00897b", "climatológica": "#ef6c00", "biológica": "#8e24aa", "tecnológica": "#546e7a", "antropogénica": "#c62828"}
CATS = list(CATCOL)
INK, MUT, ACC = "#1c2430", "#5c6675", "#0b5cab"
HECHO_ORIGEN = ("prensa", "senamhi", "complejo", "gdacs", "usgs", "sismo", "epidemiologia")


def _j(ruta, defecto):
    try:
        return json.load(open(ruta, encoding="utf-8"))
    except Exception:
        return defecto


def hora(ms):
    return dt.datetime.fromtimestamp(ms / 1000, TZ)


def esc(s):
    return str("" if s is None else s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def corto(t, n=95):
    t = re.sub(r"\s+-\s+[^-]{3,40}$", "", t or "")
    return t if len(t) <= n else t[:n - 1].rstrip() + "..."


# ---------------------------------------------------------------- seguimiento (memoria entre ejecuciones)
def actualizar_seguimiento(docs, eventos, ahora):
    """Guarda, por hecho, cuántas notas y medios tiene y qué cifras, para saber qué CAMBIÓ desde el reporte anterior."""
    ruta = os.path.join(docs, "seguimiento.json")
    seg = _j(ruta, {})
    vivos = set()
    for e in eventos:
        if e["origen"] != "prensa":
            continue
        vivos.add(e["id"])
        c = e.get("cifras") or {}
        snap = [ahora, int(c.get("notas", 1)), len(e.get("medios") or []), int(c.get("fallecidos", 0)), int(c.get("heridos", 0))]
        h = seg.setdefault(e["id"], {"primero": ahora, "hist": []})
        if not h["hist"] or h["hist"][-1][1:] != snap[1:]:
            h["hist"].append(snap)
            h["hist"] = h["hist"][-40:]
    lim = ahora - 60 * DIA
    seg = {k: v for k, v in seg.items() if k in vivos or v["primero"] > lim}
    json.dump(seg, open(ruta, "w", encoding="utf-8"), separators=(",", ":"))
    return seg


def _antes(seg, id_, t):
    """Estado del hecho justo antes de t (o None si no existía)."""
    h = seg.get(id_)
    if not h or h["primero"] > t:
        return None
    ant = [s for s in h["hist"] if s[0] <= t]
    return ant[-1] if ant else None


# ---------------------------------------------------------------- índice de prioridad (0-100) — criterio del sistema
def prioridad(e, cambio=0):
    c = e.get("cifras") or {}
    f, h = int(c.get("fallecidos", 0) or 0), int(c.get("heridos", 0) or 0)
    nv = e.get("nivel")
    p = {None: 0, 0: 5, 1: 15, 2: 30, 3: 45}.get(nv, 0)
    p += min(25, 9 * f + 2.5 * h)
    p += 10 if e.get("oficial") else 0
    conf = (e.get("confianza") or {}).get("nivel")
    p += {"Alta": 10, "Media": 5}.get(conf, 0)
    p += min(10, 2.5 * max(0, len(e.get("medios") or []) - 1))
    p += min(5, cambio)
    return int(min(100, round(p)))


def _mag(e):
    return (e.get("cifras") or {}).get("magnitud")


def seleccionar(eventos, ini, fin):
    out = []
    for e in eventos:
        o = e["origen"]
        if o not in HECHO_ORIGEN:
            continue
        if o == "sismo" and (_mag(e) or 0) < 4.0:
            continue
        if o == "epidemiologia" and not (e.get("menciona_bolivia") or (e.get("confianza") or {}).get("nivel") in ("Alta", "Media")):
            continue
        vig = False
        if o == "senamhi":
            fin_av = (e.get("cifras") or {}).get("fin") or ""
            vig = fin_av >= hora(fin).strftime("%Y-%m-%d") and e["ts"] <= fin
        if ini <= max(e["ts"], e.get("ts_ult", 0)) <= fin or vig:
            out.append(e)
    vistos, res = set(), []
    for e in sorted(out, key=lambda x: -x["ts"]):
        k = (e["origen"], re.sub(r"\s+", " ", e["titulo"]).strip().lower()) if e["origen"] == "senamhi" else e["id"]
        if k not in vistos:
            vistos.add(k); res.append(e)
    return res


# ---------------------------------------------------------------- indicadores por tipo (de datos oficiales)
def indicadores(docs, eventos, ahora, horas):
    ini = ahora - horas * 3600000
    I = {}
    sis = [s for s in _j(os.path.join(docs, "sismos_oficiales.json"), {}).get("sismos", [])]
    for s in sis:
        try:
            s["_ts"] = int(dt.datetime.strptime(s["fecha_local"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=TZ).timestamp() * 1000)
        except Exception:
            s["_ts"] = 0
    sv = [s for s in sis if s["_ts"] >= ini]
    I["geológica"] = [("Sismos registrados (San Calixto)", len(sv)), ("Magnitud máxima", f"M {max([s['mag'] for s in sv]):.1f}" if sv else "-"),
                      ("Probablemente sentidos (M 4,0 o más y hasta 100 km)", sum(1 for s in sv if s.get("probable_sentido"))), ("Profundidad media", f"{sum(s['prof_km'] for s in sv) / len(sv):.0f} km" if sv else "-")]
    av = _j(os.path.join(docs, "senamhi_alertas.json"), {}).get("alertas", [])
    hoy = hora(ahora).strftime("%Y-%m-%d")
    for tipo in ("meteorológica", "hidrológica"):
        L = [a for a in av if (a.get("tipo") or ("hidrológica" if re.search("HIDROL", a.get("titulo") or "", re.I) else "meteorológica")) == tipo and (a.get("fin") or "") >= hoy]
        niv = Counter((a.get("nivel") or "").title() for a in L)
        mun = {m for a in L for m in (a.get("municipios") or [])}
        I[tipo] = [("Avisos SENAMHI vigentes", len(L)), ("Por nivel", ", ".join(f"{k}: {v}" for k, v in niv.items()) or "-"), ("Municipios bajo aviso", len(mun)),
                   ("Departamentos con aviso", ", ".join(sorted({d for a in L for d in (a.get("departamentos") or [])})) or "-")]
    R = _j(os.path.join(docs, "caudales.json"), {}).get("puntos", [])
    if R:
        I["hidrológica"] += [("Ríos monitoreados (GloFAS)", len(R)), ("Ríos sobre el umbral P90", sum(1 for r in R if (r.get("ratio_p90_max_10d") or 0) >= 1))]
    fp = _j(os.path.join(docs, "focos_puntos.json"), {})
    dias = fp.get("dias", [])
    u = dias[-1] if dias else ""
    pu = [p for p in fp.get("puntos", []) if p[3] == u]
    cp = _j(os.path.join(docs, "focos_complejos.json"), {}).get("complejos", [])
    sq = _j(os.path.join(docs, "sequia.json"), {}).get("departamentos", {})
    sec = [k for k, v in sq.items() if v.get("spi3") is not None and v["spi3"] <= -1]
    I["climatológica"] = [(f"Focos de calor ({u})", len(pu)), ("Potencia radiativa total", f"{sum(p[2] for p in pu):.0f} MW"), ("Complejos de incendio", len(cp)),
                          ("Departamentos con sequía (SPI-3 menor o igual a -1)", ", ".join(sec) or "ninguno")]
    nu = _j(os.path.join(docs, "fuentes_nuevas.json"), {}).get("datos", {})
    for k, v in nu.items():
        if k.startswith("INPE"):
            I["climatológica"].append(("Focos GOES (INPE, ultimas 3 h)", len({(x["lat"], x["lon"]) for x in v})))
    ep = _j(os.path.join(docs, "epidemio_oficial.json"), {})
    bol = sorted(ep.get("boletines", []), key=lambda b: -b.get("semana", 0))
    intl = ep.get("internacional", [])
    rec = [x for x in intl if x.get("fecha") and (ahora - dt.datetime.fromisoformat(x["fecha"][:10]).replace(tzinfo=TZ).timestamp() * 1000) <= 60 * DIA]
    I["biológica"] = [("Publicaciones OPS/OMS vigentes (60 d)", len(rec)), ("Mencionan a Bolivia", sum(1 for x in rec if "bolivia" in (x.get("titulo", "") + x.get("resumen", "")).lower())),
                      ("Último boletín del Ministerio de Salud", f"semana {bol[0]['semana']} ({bol[0].get('periodo', '')})" if bol else "-"),
                      ("Notas de prensa sobre salud (periodo)", sum(1 for e in eventos if e["origen"] == "prensa" and e["categoria"] == "biológica" and e["ts"] >= ini))]
    for c in ("tecnológica", "antropogénica"):
        L = [e for e in eventos if e["origen"] == "prensa" and e["categoria"] == c and e["ts"] >= ini]
        I[c] = [("Hechos de prensa (unidos)", len(L)), ("Con confianza media o alta", sum(1 for e in L if (e.get("confianza") or {}).get("nivel") in ("Media", "Alta"))),
                ("Fallecidos reportados (máx. por hecho)", sum((e.get("cifras") or {}).get("fallecidos", 0) for e in L)), ("Heridos reportados (máx. por hecho)", sum((e.get("cifras") or {}).get("heridos", 0) for e in L))]
    tr = [h for h in _j(os.path.join(docs, "transito.json"), {}).get("hechos", []) if h["ts"] >= ini]
    f_, h_ = sum(h.get("fallecidos", 0) for h in tr), sum(h.get("heridos", 0) for h in tr)
    I["salud"] = [("Hechos de tránsito", len(tr)), ("Fallecidos", f_), ("Heridos", h_), ("Letalidad (fallecidos / víctimas)", f"{round(100 * f_ / (f_ + h_))} %" if f_ + h_ else "-")]
    return I


# ---------------------------------------------------------------- gráficos
def _png(fig):
    return rp.png(fig)


def mapa_hechos(geo, hechos, docs, ancho=6.6, alto=5.8):
    fig, ax = plt.subplots(figsize=(ancho, alto), dpi=200)
    ax.set_facecolor("#eaf1f7")
    rp.dibujar_poligonos(ax, geo["mun"], fc="#f7f8fa", ec="#d3d8df", lw=0.25)
    rp.dibujar_poligonos(ax, geo["dep"], fc="none", ec="#6b7686", lw=0.9)
    for u in geo["dep"]:
        c = u["_s"].representative_point()
        ax.text(c.x, c.y, u["n"].upper(), fontsize=5, color="#8792a2", ha="center", va="center", style="italic")
    fp = _j(os.path.join(docs, "focos_puntos.json"), {})
    dias = fp.get("dias", [])[-3:]
    pts = [(p[1], p[0]) for p in fp.get("puntos", []) if p[3] in dias]
    if pts:
        ax.scatter([p[0] for p in pts], [p[1] for p in pts], s=3, c="#ff8f00", alpha=.55, linewidths=0, zorder=3, label="Focos de calor (3 d)")
    for i, e in enumerate(hechos, 1):
        if e.get("lat") is None:
            continue
        col = CATCOL.get(e["categoria"], "#555")
        ax.scatter(e["lon"], e["lat"], s=120, c=col, edgecolors="white", linewidths=1.3, zorder=6)
        ax.text(e["lon"], e["lat"], str(i), fontsize=6, color="white", ha="center", va="center", zorder=7, weight="bold")
    ax.set_xlim(-69.9, -57.2); ax.set_ylim(-23.1, -9.4); ax.set_aspect(1 / 0.95); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color("#9aa6b6")
    hs = [plt.Line2D([], [], marker="o", ls="", mfc=CATCOL[c], mec="white", ms=7, label=c.capitalize()) for c in CATS]
    if pts:
        hs.append(plt.Line2D([], [], marker="o", ls="", mfc="#ff8f00", ms=3, label="Focos de calor (3 d)"))
    ax.legend(handles=hs, loc="lower left", fontsize=5.6, frameon=True, title="Tipo (Ley 602)", title_fontsize=6.2)
    return _png(fig)


def g_barras(cuentas, titulo, color, ancho=3.2, alto=2.5, colores=None):
    k = sorted(cuentas, key=lambda x: cuentas[x])[-8:]
    fig, ax = plt.subplots(figsize=(ancho, alto))
    ax.barh(range(len(k)), [cuentas[x] for x in k], color=[(colores or {}).get(x, color) for x in k], height=.65)
    ax.set_yticks(range(len(k))); ax.set_yticklabels([x if len(x) < 22 else x[:21] + "." for x in k], fontsize=6.5)
    for i, x in enumerate(k):
        ax.text(cuentas[x] + max(cuentas.values()) * .02, i, str(cuentas[x]), va="center", fontsize=6.5)
    ax.set_title(titulo, fontsize=8, loc="left", color=INK, weight="bold"); rp.estilo_ax(ax); ax.yaxis.grid(False); ax.xaxis.grid(True, color="#e3e7ec", lw=.6)
    return _png(fig)


def g_tendencia(eventos, ahora, ndias):
    d0 = hora(ahora).replace(hour=0, minute=0, second=0, microsecond=0) - dt.timedelta(days=ndias - 1)
    m = {c: [0] * ndias for c in CATS}
    for e in eventos:
        if e["origen"] not in HECHO_ORIGEN or e["categoria"] not in m:
            continue
        i = (hora(e["ts"]).replace(hour=0, minute=0, second=0, microsecond=0) - d0).days
        if 0 <= i < ndias:
            m[e["categoria"]][i] += 1
    fig, ax = plt.subplots(figsize=(6.6, 2.4))
    base = [0] * ndias
    for c in CATS:
        ax.bar(range(ndias), m[c], bottom=base, color=CATCOL[c], width=.75, label=c.capitalize())
        base = [a + b for a, b in zip(base, m[c])]
    step = max(1, ndias // 10)
    ax.set_xticks(range(0, ndias, step)); ax.set_xticklabels([(d0 + dt.timedelta(days=i)).strftime("%d/%m") for i in range(0, ndias, step)])
    ax.set_ylabel("Hechos por día", fontsize=7); rp.estilo_ax(ax); ax.legend(fontsize=5.8, ncol=7, frameon=False, loc="upper left", bbox_to_anchor=(0, 1.22))
    return _png(fig)


# ---------------------------------------------------------------- narrativa (plantilla determinista, sin IA generativa)
def lectura(hechos, ind, nuevos, actualizados, horas, ahora):
    L = []
    n = len(hechos)
    conf = sum(1 for e in hechos if (e.get("confianza") or {}).get("nivel") in ("Alta", "Media"))
    f = sum((e.get("cifras") or {}).get("fallecidos", 0) for e in hechos if e["origen"] == "prensa")
    h = sum((e.get("cifras") or {}).get("heridos", 0) for e in hechos if e["origen"] == "prensa")
    L.append(f"En el periodo se registraron <b>{n} hechos</b> relevantes, de los cuales <b>{conf}</b> tienen confianza media o alta (dos o más fuentes independientes). "
             f"La prensa reporta <b>{f} fallecido(s)</b> y <b>{h} herido(s)</b> (cifras preliminares: máximo por hecho, no suma entre medios).")
    top = hechos[:3]
    if top:
        L.append("Los hechos de mayor prioridad son: " + "; ".join(f"<b>{i + 1}.</b> {esc(corto(e['titulo'], 80))} ({esc(e['categoria'])}, {esc(e.get('lugar') or 'Bolivia')})" for i, e in enumerate(top)) + ".")
    m = dict(ind.get("meteorológica", [])); hd = dict(ind.get("hidrológica", []))
    L.append(f"El SENAMHI mantiene <b>{m.get('Avisos SENAMHI vigentes', 0)}</b> aviso(s) meteorológico(s) y <b>{hd.get('Avisos SENAMHI vigentes', 0)}</b> hidrológico(s) vigentes"
             + (f"; {hd.get('Ríos sobre el umbral P90', 0)} río(s) del modelo GloFAS superan el umbral P90." if 'Ríos sobre el umbral P90' in hd else "."))
    c = dict(ind.get("climatológica", []))
    k = next((k for k in c if k.startswith("Focos de calor")), None)
    if k:
        L.append(f"Satélite: <b>{c[k]}</b> focos de calor en el último día con {c.get('Potencia radiativa total', '-')} de potencia radiativa; "
                 f"{c.get('Complejos de incendio', 0)} complejo(s) de incendio. Sequía (SPI-3): {esc(c.get('Departamentos con sequía (SPI-3 menor o igual a -1)', 'ninguno'))}.")
    if nuevos or actualizados:
        L.append(f"Respecto del reporte anterior: <b>{nuevos}</b> hecho(s) nuevo(s) y <b>{actualizados}</b> con nueva información (más notas, más medios o cifras distintas).")
    return L


# ---------------------------------------------------------------- documento
def build(docs, salida, periodo="diario", horas=24, ahora=None, geo=None, etiqueta=None, base_url="", log=print, ids_forzar=None):
    ahora = ahora or int(time.time() * 1000)
    ini = ahora - horas * 3600000
    eventos = _j(os.path.join(docs, "eventos_unificados.json"), {}).get("eventos", [])
    geo = geo or rp.cargar_geo("geo.json")
    seg = _j(os.path.join(docs, "seguimiento.json"), {})
    hechos = seleccionar(eventos, ini, ahora)
    estado = {}
    for e in hechos:
        a = _antes(seg, e["id"], ini)
        c = e.get("cifras") or {}
        if e["origen"] != "prensa":
            estado[e["id"]] = ("nuevo" if e["ts"] >= ini else "vigente", 1 if e["ts"] >= ini else 0, "")
        elif a is None:
            estado[e["id"]] = ("nuevo", 2, "") if e["ts"] >= ini else ("vigente", 0, "")
        else:
            dn, dm = int(c.get("notas", 1)) - a[1], len(e.get("medios") or []) - a[2]
            df_, dh = int(c.get("fallecidos", 0)) - a[3], int(c.get("heridos", 0)) - a[4]
            if dn > 0 or dm > 0 or df_ or dh:
                partes = []
                if dn > 0: partes.append(f"+{dn} nota(s)")
                if dm > 0: partes.append(f"+{dm} medio(s)")
                if df_: partes.append(f"fallecidos {a[3]} a {c.get('fallecidos', 0)}")
                if dh: partes.append(f"heridos {a[4]} a {c.get('heridos', 0)}")
                estado[e["id"]] = ("actualizado", 3 + (2 if df_ or dh else 0), ", ".join(partes))
            else:
                estado[e["id"]] = ("sin cambios", 0, "")
    hechos.sort(key=lambda e: (-prioridad(e, estado[e["id"]][1]), -e["ts"]))
    # hechos ANTERIORES a la ventana con información nueva dentro de ella (seguimiento)
    ids_v = {e["id"] for e in hechos}
    seguim = []
    for e in eventos:
        if e["origen"] != "prensa" or e["id"] in ids_v or e["ts"] >= ini:
            continue
        a, b = _antes(seg, e["id"], ini), seg.get(e["id"])
        if a and b and b["hist"] and b["hist"][-1][0] >= ini:
            u = b["hist"][-1]
            if u[1] > a[1] or u[2] > a[2] or u[3] != a[3] or u[4] != a[4]:
                seguim.append((e, a, u))
    seguim.sort(key=lambda x: -prioridad(x[0], 3))
    nuevos = sum(1 for v in estado.values() if v[0] == "nuevo")
    actual = sum(1 for v in estado.values() if v[0] == "actualizado") + len(seguim)
    ind = indicadores(docs, eventos, ahora, horas)
    maxf = {"diario": 8, "semanal": 12, "mensual": 15}.get(periodo, 10)
    top = hechos[:maxf]

    # ---- estilos
    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("fn", "Helvetica"), **k)
    st = {"h1": S("h1", fontSize=12.5, leading=15, textColor=colors.HexColor("#0b3b6e"), fn="Helvetica-Bold", spaceBefore=8, spaceAfter=4),
          "p": S("p", fontSize=8.6, leading=11.4, textColor=colors.HexColor(INK)), "sm": S("sm", fontSize=7.2, leading=9, textColor=colors.HexColor(MUT)),
          "t": S("t", fontSize=9.4, leading=11.6, textColor=colors.HexColor(INK), fn="Helvetica-Bold"), "cell": S("cell", fontSize=7.2, leading=8.8, textColor=colors.HexColor(INK)),
          "cellh": S("cellh", fontSize=7.2, leading=8.8, textColor=colors.white, fn="Helvetica-Bold"), "kv": S("kv", fontSize=18, leading=20, textColor=colors.HexColor("#0b3b6e"), fn="Helvetica-Bold", alignment=1),
          "kl": S("kl", fontSize=6.8, leading=8, textColor=colors.HexColor(MUT), alignment=1)}
    W, H = A4
    titulo = etiqueta or {"diario": "Reporte diario de situación", "semanal": "Reporte semanal de situación", "mensual": "Reporte mensual de situación"}.get(periodo, "Reporte de situación")
    ahora_s = hora(ahora).strftime("%d/%m/%Y %H:%M")
    desde_s = hora(ini).strftime("%d/%m/%Y %H:%M")

    def pie(c, d):
        c.saveState(); c.setStrokeColor(colors.HexColor("#c9cfd8")); c.line(15 * mm, 13 * mm, W - 15 * mm, 13 * mm); c.setFont("Helvetica", 6.5); c.setFillColor(colors.HexColor(MUT))
        c.drawString(15 * mm, 9.5 * mm, f"Sala de Situación - Bolivia - Generado {ahora_s} (hora La Paz) - Información preliminar de fuentes abiertas")
        c.drawString(15 * mm, 6 * mm, "Tipos de amenaza: Ley 602 art. 36. Niveles, prioridad y confianza son criterios del sistema, no oficiales (ver Metodología).")
        c.drawRightString(W - 15 * mm, 9.5 * mm, f"Pág. {d.page}"); c.restoreState()

    def cab(c, d):
        c.saveState(); c.setFillColor(colors.HexColor("#0f3d6e")); c.rect(0, H - 30 * mm, W, 30 * mm, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#d7263d")); c.rect(0, H - 31.2 * mm, W / 3, 1.2 * mm, stroke=0, fill=1); c.setFillColor(colors.HexColor("#f5b700")); c.rect(W / 3, H - 31.2 * mm, W / 3, 1.2 * mm, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#2e9e5b")); c.rect(2 * W / 3, H - 31.2 * mm, W / 3, 1.2 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 18); c.drawString(15 * mm, H - 14 * mm, titulo)
        c.setFont("Helvetica", 8.5); c.setFillColor(colors.HexColor("#dbe6f3")); c.drawString(15 * mm, H - 21 * mm, f"Bolivia - Periodo: {desde_s} a {ahora_s} (hora La Paz, últimas {horas} h)")
        c.drawString(15 * mm, H - 26 * mm, "Sala de Situación: monitoreo automático de fuentes abiertas (SENAMHI, San Calixto, NASA/INPE, OPS/OMS/ECDC, prensa boliviana)")
        c.restoreState(); pie(c, d)

    doc = BaseDocTemplate(salida, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=16 * mm, title=titulo, author="Sala de Situación Bolivia")
    f1 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 35 * mm, id="f1", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    f2 = Frame(15 * mm, 16 * mm, W - 30 * mm, H - 16 * mm - 15 * mm, id="f2", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="p1", frames=[f1], onPage=cab), PageTemplate(id="p2", frames=[f2], onPage=pie)])
    from reportlab.platypus import NextPageTemplate
    el = [NextPageTemplate("p2")]
    PW = W - 30 * mm

    # ---- 1. KPIs
    vic_f = sum((e.get("cifras") or {}).get("fallecidos", 0) for e in hechos if e["origen"] == "prensa"); vic_h = sum((e.get("cifras") or {}).get("heridos", 0) for e in hechos if e["origen"] == "prensa")
    conf_n = sum(1 for e in hechos if (e.get("confianza") or {}).get("nivel") in ("Alta", "Media"))
    cl = dict(ind.get("climatológica", [])); kf = next((k for k in cl if k.startswith("Focos de calor")), "")
    kp = [(len(hechos), "Hechos relevantes"), (conf_n, "Con confianza media/alta"), (vic_f, "Fallecidos*"), (vic_h, "Heridos*"), (cl.get(kf, 0), "Focos de calor (último día)"),
          (dict(ind.get("meteorológica", [])).get("Avisos SENAMHI vigentes", 0) + dict(ind.get("hidrológica", [])).get("Avisos SENAMHI vigentes", 0), "Avisos SENAMHI vigentes")]
    t = Table([[Paragraph(str(v), st["kv"]) for v, _ in kp], [Paragraph(l, st["kl"]) for _, l in kp]], colWidths=[PW / 6] * 6)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .6, colors.HexColor("#c9cfd8")), ("INNERGRID", (0, 0), (-1, -1), .3, colors.HexColor("#e1e6ee")), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f4f7fb")),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    el += [t, Paragraph("* Cifras preliminares de prensa: máximo reportado por hecho, no suma entre medios.", st["sm"]), Paragraph("1. Lectura de la situación", st["h1"])]
    for l in lectura(hechos, ind, nuevos, actual, horas, ahora):
        el.append(Paragraph("&bull; " + l, st["p"])); el.append(Spacer(1, 2.5))

    # ---- 2. Mapa + leyenda
    el.append(Paragraph("2. Geolocalización de los hechos prioritarios", st["h1"]))
    img = Image(mapa_hechos(geo, top, docs), width=PW * .62, height=PW * .62 * 5.8 / 6.6)
    filas = [[Paragraph("N°", st["cellh"]), Paragraph("Hecho", st["cellh"])]]
    for i, e in enumerate(top, 1):
        filas.append([Paragraph(f'<font color="{CATCOL.get(e["categoria"], "#555")}"><b>{i}</b></font>', st["cell"]), Paragraph(esc(corto(e["titulo"], 70)), st["cell"])])
    lg = Table(filas, colWidths=[7 * mm, PW * .38 - 9 * mm]); lg.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d8dde6")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el.append(Table([[img, lg]], colWidths=[PW * .62, PW * .38], style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    sinloc = sum(1 for e in top if e.get("lat") is None)
    el.append(Paragraph(f"El número del mapa es el de la lista. {sinloc} hecho(s) de la lista no tienen coordenadas confiables (por ejemplo avisos que abarcan departamentos). Puntos naranja pequeños: focos de calor de los últimos 3 días (NASA FIRMS).", st["sm"]))

    # ---- 3. Fichas
    el.append(PageBreak()); el.append(Paragraph("3. Hechos prioritarios (ficha por hecho)", st["h1"]))
    el.append(Paragraph("Ordenados por el índice de prioridad (0-100), que combina nivel, víctimas, fuente oficial, confianza, número de medios y evolución reciente. Es un criterio del sistema para decidir qué leer primero.", st["sm"]))
    el.append(Spacer(1, 4))
    for i, e in enumerate(top, 1):
        c = e.get("cifras") or {}; cf = e.get("confianza") or {}; col = CATCOL.get(e["categoria"], "#555")
        est = estado[e["id"]]
        tag = {"nuevo": '<font color="#1b7f3b"><b>NUEVO</b></font>', "actualizado": '<font color="#b45f06"><b>ACTUALIZADO</b></font>', "sin cambios": "Sin cambios", "vigente": "Vigente"}.get(est[0], "")
        meta = [f"<b>Tipo:</b> {esc(e['categoria'].capitalize())}" + (f" / {esc(e['subtipo'])}" if e.get("subtipo") else ""), f"<b>Lugar:</b> {esc(e.get('lugar') or ', '.join(e.get('departamentos') or []) or 'Bolivia')}",
                f"<b>Primera nota:</b> {hora(e['ts']).strftime('%d/%m %H:%M')}", f"<b>Nivel:</b> {esc(e.get('nivel_txt') or '-')}"]
        l2 = [f"<b>Confianza:</b> {esc(cf.get('nivel', '-'))}" + (f" (credibilidad {cf['puntaje']}/100, {cf.get('fuentes_independientes', 1)} fuente(s) independiente(s))" if cf.get("puntaje") is not None else ""), f"<b>Prioridad:</b> {prioridad(e, est[1])}/100"]
        if e["origen"] == "prensa":
            l2.append(f"<b>Víctimas (prensa):</b> {c.get('fallecidos', 0)} fallecido(s), {c.get('heridos', 0)} herido(s)")
            meds = ", ".join(esc(m) for m in (e.get("medios") or [])[:6]) or esc(e.get("fuente", ""))
            cob = f"<b>Cobertura:</b> {c.get('notas', 1)} nota(s) de {len(e.get('medios') or [1])} medio(s): {meds}"
        else:
            cob = f"<b>Fuente:</b> {esc(e.get('fuente', ''))}" + (" (oficial)" if e.get("oficial") else "")
        evo = f"<b>Evolución:</b> {tag}" + (f" - {esc(est[2])}" if est[2] else "")
        det = esc((e.get("detalle") or "").strip())[:420]
        enl = f'<a href="{esc(e["url"])}" color="#0b5cab">fuente original</a>' if (e.get("url") or "").startswith("http") else ""
        if base_url:
            enl += (" | " if enl else "") + f'<a href="{esc(base_url)}evento.html?id={esc(e["id"])}" color="#0b5cab">ficha web con mapa y gráficos</a>'
        cuerpo = [Paragraph(f"{i}. {esc(corto(e['titulo'], 150))}", st["t"]), Paragraph(" &nbsp;|&nbsp; ".join(meta), st["cell"]), Paragraph(" &nbsp;|&nbsp; ".join(l2), st["cell"]), Paragraph(cob, st["cell"]), Paragraph(evo, st["cell"])]
        if det:
            cuerpo.append(Paragraph(f"<b>Detalle:</b> {det}", st["cell"]))
        if enl:
            cuerpo.append(Paragraph(enl, st["cell"]))
        ficha = Table([["", cuerpo]], colWidths=[2.4 * mm, PW - 2.4 * mm])
        ficha.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (-1, -1), .4, colors.HexColor("#d3d8df")), ("BACKGROUND", (0, 0), (0, 0), colors.HexColor(col)),
                                   ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#fbfcfe")), ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (0, 0), (0, 0), 0),
                                   ("LEFTPADDING", (1, 0), (1, 0), 6), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        el += [KeepTogether([ficha]), Spacer(1, 4)]
    if not top:
        el.append(Paragraph("No hubo hechos relevantes en el periodo.", st["p"]))

    # ---- 4. Seguimiento
    el.append(Paragraph("4. Seguimiento: hechos anteriores con información nueva", st["h1"]))
    if seguim:
        el.append(Paragraph("Hechos que ya habían sido reportados antes de este periodo y cuya cobertura creció (más notas o medios) o cuyas cifras cambiaron. Un hecho que sigue acumulando notas suele indicar repercusión o información nueva.", st["sm"]))
        fl = [[Paragraph(x, st["cellh"]) for x in ("Hecho", "Primera nota", "Notas", "Medios", "Fallecidos", "Heridos", "Tipo")]]
        for e, a, u in seguim[:14]:
            fl.append([Paragraph(esc(corto(e["titulo"], 80)), st["cell"]), Paragraph(hora(e["ts"]).strftime("%d/%m %H:%M"), st["cell"]), Paragraph(f"{a[1]} a {u[1]}", st["cell"]), Paragraph(f"{a[2]} a {u[2]}", st["cell"]),
                       Paragraph(f"{a[3]} a {u[3]}", st["cell"]), Paragraph(f"{a[4]} a {u[4]}", st["cell"]), Paragraph(esc(e["categoria"]), st["cell"])])
        t = Table(fl, colWidths=[PW * .40, PW * .10, PW * .09, PW * .09, PW * .10, PW * .09, PW * .13], repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d8dde6")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fb")])]))
        el.append(t)
    else:
        el.append(Paragraph("Ningún hecho anterior recibió información nueva en el periodo (o el sistema aún no acumula historia suficiente: el seguimiento comienza desde la primera corrida con esta versión).", st["p"]))

    # ---- 5. Indicadores por tipo
    el.append(PageBreak()); el.append(Paragraph("5. Indicadores por tipo de amenaza (Ley 602, art. 36)", st["h1"]))
    NOMS = {"geológica": "Geológica", "meteorológica": "Meteorológica", "hidrológica": "Hidrológica", "climatológica": "Climatológica", "biológica": "Biológica", "tecnológica": "Tecnológica", "antropogénica": "Antropogénica", "salud": "Salud humana (tránsito)"}
    for c in CATS + ["salud"]:
        rows = ind.get(c, [])
        if not rows:
            continue
        col = CATCOL.get(c, "#c62828")
        t = Table([[Paragraph(f'<font color="white"><b>{NOMS[c]}</b></font>', st["cell"]), ""]] + [[Paragraph(esc(k), st["cell"]), Paragraph(esc(v), st["cell"])] for k, v in rows], colWidths=[PW * .56, PW * .44])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(col)), ("SPAN", (0, 0), (1, 0)), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d8dde6")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fb")])]))
        el += [KeepTogether([t]), Spacer(1, 5)]
    el.append(Paragraph("Cada indicador está definido (fórmula, fuente, frecuencia, límites) en la página «Indicadores y metodología» del tablero.", st["sm"]))

    # ---- 6. Gráficos
    el.append(PageBreak()); el.append(Paragraph("6. Gráficos de análisis", st["h1"]))
    ndias = {"diario": 14, "semanal": 28, "mensual": 60}.get(periodo, 14)
    el.append(Image(g_tendencia(eventos, ahora, ndias), width=PW, height=PW * 2.4 / 6.6))
    cat_c = Counter(e["categoria"] for e in hechos); dep_c = Counter(d for e in hechos for d in (e.get("departamentos") or ["Sin ubicar"])); conf_c = Counter((e.get("confianza") or {}).get("nivel", "Baja") for e in hechos)
    org_c = Counter({"prensa": "Prensa", "senamhi": "SENAMHI", "sismo": "San Calixto", "usgs": "USGS", "gdacs": "GDACS", "epidemiologia": "OPS/OMS/ECDC", "complejo": "NASA FIRMS"}.get(e["origen"], e["origen"]) for e in hechos)
    g1 = g_barras({k.capitalize(): v for k, v in cat_c.items()}, "Hechos por tipo de amenaza", ACC, colores={k.capitalize(): v for k, v in CATCOL.items()}); g2 = g_barras(dep_c, "Hechos por departamento", "#5c6b82")
    g3 = g_barras(conf_c, "Confianza (triangulación)", "#2e9e5b", colores={"Alta": "#2e9e5b", "Media": "#f5b700", "Baja": "#8896ab"}); g4 = g_barras(org_c, "Hechos por familia de fuente", "#0aa3a3")
    hw = PW / 2
    el.append(Table([[Image(g1, width=hw - 2, height=(hw - 2) * 2.5 / 3.2), Image(g2, width=hw - 2, height=(hw - 2) * 2.5 / 3.2)], [Image(g3, width=hw - 2, height=(hw - 2) * 2.5 / 3.2), Image(g4, width=hw - 2, height=(hw - 2) * 2.5 / 3.2)]], colWidths=[hw, hw]))

    # ---- 7. Registro
    el.append(PageBreak()); el.append(Paragraph("7. Registro de hechos del periodo", st["h1"]))
    fl = [[Paragraph(x, st["cellh"]) for x in ("N°", "Fecha", "Tipo", "Hecho", "Lugar", "Víct.", "Conf.", "Fuente")]]
    for i, e in enumerate(hechos[:150], 1):
        c = e.get("cifras") or {}
        fl.append([Paragraph(str(i), st["cell"]), Paragraph(hora(e["ts"]).strftime("%d/%m %H:%M"), st["cell"]), Paragraph(esc(e["categoria"][:5].capitalize() + "."), st["cell"]), Paragraph(esc(corto(e["titulo"], 90)), st["cell"]),
                   Paragraph(esc((e.get("lugar") or "-")[:28]), st["cell"]), Paragraph(f"{c.get('fallecidos', 0)}/{c.get('heridos', 0)}" if e["origen"] == "prensa" else "-", st["cell"]),
                   Paragraph(esc((e.get("confianza") or {}).get("nivel", "-")), st["cell"]), Paragraph(esc((", ".join((e.get("medios") or [])[:2]) or e.get("fuente", ""))[:30]), st["cell"])])
    t = Table(fl, colWidths=[PW * .05, PW * .09, PW * .08, PW * .34, PW * .15, PW * .06, PW * .08, PW * .15], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d8dde6")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fb")])]))
    el += [t, Paragraph("Víct. = fallecidos/heridos reportados por prensa. Conf. = confianza por triangulación.", st["sm"])]

    # ---- 8. Fuentes y metodología
    el.append(PageBreak()); el.append(Paragraph("8. Fuentes consultadas", st["h1"]))
    fu = _j(os.path.join(docs, "estado_fuentes.json"), {}).get("fuentes", [])
    nu = _j(os.path.join(docs, "fuentes_nuevas.json"), {}).get("estado", [])
    fl = [[Paragraph(x, st["cellh"]) for x in ("Fuente", "Institución", "Estado", "Detalle")]]
    for f in fu[:24]:
        fl.append([Paragraph(esc(f["nombre"][:55]), st["cell"]), Paragraph(esc(f.get("institucion", "")[:35]), st["cell"]), Paragraph("OK" if f.get("estado") == "ok" else "ERROR", st["cell"]), Paragraph(esc(str(f.get("detalle", ""))[:90]), st["cell"])])
    for f in nu:
        fl.append([Paragraph(esc(f["fuente"][:55]), st["cell"]), Paragraph("Fuente adicional", st["cell"]), Paragraph("OK" if f["estado"] == "ok" else "ERROR", st["cell"]), Paragraph(esc(f"{f.get('registros', 0)} registros" if f["estado"] == "ok" else f.get("detalle", ""))[:90], st["cell"])])
    t = Table(fl, colWidths=[PW * .34, PW * .20, PW * .08, PW * .38], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d6e")), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d8dde6")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el += [t, Paragraph("9. Metodología y límites", st["h1"])]
    for tx in ["<b>Triangulación:</b> las notas de prensa que cuentan el mismo hecho se unen (mismo tipo, lugar compatible, ventana de 48-72 h, palabras y nombres propios en común). Confianza: Alta = 3 o más fuentes independientes, Media = 2, Baja = 1. Fuente independiente = medio distinto o familia de fuente distinta (oficial, satélite, internacional, modelo).",
               "<b>Credibilidad (0-100):</b> 1 menos el producto de (1 menos el peso de cada fuente). Pesos editoriales: oficial 0,9-0,95; satélite 0,85; internacional 0,8; medios principales 0,7; otros 0,5; modelo 0,5. No es una medición empírica.",
               "<b>Índice de prioridad (0-100):</b> nivel (0-45) + víctimas (hasta 25) + fuente oficial (10) + confianza (5-10) + medios adicionales (hasta 10) + evolución reciente (hasta 5). Ordena qué leer primero; no reemplaza la evaluación técnica.",
               "<b>Evolución:</b> el sistema guarda cuántas notas, medios y cifras tenía cada hecho en cada corrida; «Actualizado» significa que desde el reporte anterior aumentaron notas o medios, o cambiaron las cifras.",
               "<b>Límites:</b> la prensa es preliminar y puede ser incompleta o contradictoria; no hay fuente oficial abierta de tránsito, hechos tecnológicos ni declaratorias; las redes sociales no se monitorean; los modelos (GloFAS, Open-Meteo) son orientativos. Para decisiones, verifique con SENAMHI, Policía, SUMA 161, SEDES y el Ministerio de Salud."]:
        el += [Paragraph("&bull; " + tx, st["p"]), Spacer(1, 3)]
    doc.build(el)
    r = {"hechos": len(hechos), "nuevos": nuevos, "actualizados": actual, "paginas": doc.page}
    log(f"Reporte {periodo}: {r}")
    return r


if __name__ == "__main__":
    import sys
    docs = sys.argv[1] if len(sys.argv) > 1 else "docs"
    per = sys.argv[2] if len(sys.argv) > 2 else "diario"
    hs = {"diario": 24, "semanal": 168, "mensual": 744}.get(per, 24)
    ev = _j(os.path.join(docs, "eventos_unificados.json"), {}).get("eventos", [])
    actualizar_seguimiento(docs, ev, int(time.time() * 1000))
    print(build(docs, f"prueba_{per}.pdf", per, hs, base_url="https://micangelarcangel-lang.github.io/sala-situacion-bolivia/"))

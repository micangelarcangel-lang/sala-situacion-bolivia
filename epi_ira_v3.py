# -*- coding: utf-8 -*-
"""Panorama de IRAs / influenza a partir del Boletín Epidemiológico semanal del Ministerio de Salud (PDF público).
Todo lo numérico se LEE del boletín (no lo inventa ninguna IA); el texto de síntesis se arma con plantilla a partir de esas cifras."""
import io, re, json, urllib.request, datetime as dt
UA = {"User-Agent": "Mozilla/5.0 sala-situacion-bolivia/3"}
BASE = "https://minsalud.gob.bo"
DEPTOS = ["Chuquisaca", "La Paz", "Cochabamba", "Oruro", "Potosí", "Tarija", "Santa Cruz", "Beni", "Pando"]
NUM = r"\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?"


def n(x):
    return float(x.replace(".", "").replace(",", ".")) if "," in x and x.count(",") == 1 and "." not in x.split(",")[0][-3:] or "," in x else float(x.replace(".", ""))


def num(x):
    x = x.strip()
    return float(x.replace(".", "").replace(",", ".")) if "," in x else float(x.replace(".", ""))


def _get(u, t=120):
    import time
    for k in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()
        except Exception:
            if k == 3:
                raise
            time.sleep(5 * (k + 1))


def enlaces():
    h = _get(BASE + "/9104-boletines-epidemiologicos-2026").decode("utf-8", "ignore")
    d = {}
    for ruta, se in re.findall(r'href="(/component/jdownloads/send/[^"]*semana-epidemiologica-no-(\d+)[^"]*)"', h):
        d[int(se)] = BASE + ruta.replace("&amp;", "&")
    return d


def paginas(url):
    from pypdf import PdfReader
    return [re.sub(r"\s+", " ", (p.extract_text() or "")) for p in PdfReader(io.BytesIO(_get(url))).pages]


def parse_boletin(pags):
    """Devuelve dict con SE, fechas, casos por departamento (3 últimas semanas), total, vacunas y frase de virus."""
    todo = " ".join(pags); out = {}
    m = re.search(r"Semana Epidemiol[oó]gica N[º°o]? ?(\d+) (\d+ de \w+ al \d+ de \w+ ?20 ?26)", todo)
    out["se"] = int(m.group(1)) if m else None; out["fechas"] = re.sub(r"\s+", " ", m.group(2)).replace("20 26", "2026") if m else ""
    deptos = []
    for d in DEPTOS:
        r = re.search(re.escape(d) + r" ((?:" + NUM + r") ){7}(" + NUM + r")", todo)
        if r:
            toks = re.findall(NUM, r.group(0)[len(d):])
            if len(toks) >= 8:
                v = [num(t) for t in toks[:8]]
                deptos.append({"depto": d, "acum": v[0], "tasa_acum": v[1], "casos39": v[2], "tasa39": v[3], "casos40": v[4], "tasa40": v[5], "casos41": v[6], "tasa41": v[7]})
    out["deptos"] = deptos
    m = re.search(r"semanas? epidemiol[oó]gicas? (\d+), el pa[ií]s registr[oó] (" + NUM + r") casos.*?(" + NUM + r")% en relaci[oó]n a la semana ant ?erior \((" + NUM + r")\)", todo)
    if m:
        out["nacional"] = {"se": int(m.group(1)), "casos": num(m.group(2)), "var_pct": num(m.group(3)), "casos_prev": num(m.group(4))}
    m = re.search(r"tasa de incidencia de (" + NUM + r") por 1\.000", todo)
    out["tasa_nacional"] = num(m.group(1)) if m else None
    m = re.search(r"aument[oó] de (" + NUM + r") a (" + NUM + r") dosis.{0,40}?(" + NUM + r") dosis adicionales", todo)
    out["vacuna"] = {"de": num(m.group(1)), "a": num(m.group(2)), "adicionales": num(m.group(3))} if m else None
    m = re.search(r"([^.]*circulaci[oó]n[^.]*predomin[^.]*\.)", todo) or re.search(r"([^.]*predomin[^.]*Influenza[^.]*\.)", todo)
    mv = re.search(r"influenza\s*(?:tipo\s*)?(A\s*\(?H\d ?N\d\)?|B|A)", todo, re.I)
    out["virus"] = (f"La circulación viral predominante es por influenza tipo {re.sub(r'[ ()]', '', mv.group(1)).upper()}." if mv and re.search(r"predomin", todo) else "")
    m = re.search(r"grupo etario muestra que.*?(\d+ ?a ?\d+ a[ñn]os).*?(\d+)%.*?seguida del grupo de (\d+ ?a ?\d+ a[ñn]os?), con el (\d+)%", todo)
    out["edad"] = {"mayor": m.group(1), "mayor_pct": int(m.group(2)), "segundo": m.group(3), "segundo_pct": int(m.group(4))} if m else None
    return out


def serie(max_se=8, log=print):
    enl = enlaces(); ses = sorted(enl)[-max_se:]; datos = {}
    for se in ses:
        try:
            p = parse_boletin(paginas(enl[se]))
            if p.get("nacional"):
                datos[se] = p
        except Exception as e:
            log("SE", se, "falló:", str(e)[:80])
    return datos, enl


def boletin(log=print):
    datos, enl = serie(8, log)
    if not datos:
        return None
    ult = max(datos); U = datos[ult]; N = U["nacional"]
    curva = [[se, d["nacional"]["casos"]] for se, d in sorted(datos.items())]
    # el boletín de la SE n también trae la SE n-1: se completa la serie con 'casos_prev'
    prev = {U["nacional"]["se"] - 1: U["nacional"]["casos_prev"]}
    for se, v in prev.items():
        if se not in [c[0] for c in curva]:
            curva.append([se, v]); curva.sort()
    dep = sorted(U["deptos"], key=lambda x: -x["tasa41"])
    top = ", ".join(f"{x['depto']} ({x['tasa41']:.1f}‰)".replace(".", ",") for x in dep[:3])
    sint = (f"En la SE {N['se']} ({U['fechas']}) el país notificó {N['casos']:,.0f} casos de infecciones respiratorias agudas, {('+' if N['var_pct'] > 0 else '')}{str(round(N['var_pct'], 1)).replace('.', ',')}% respecto de la semana anterior ({N['casos_prev']:,.0f}). ".replace(",", ".")
            + (f"Las tasas semanales más altas están en {top} por 1.000 habitantes. " if dep else "") + (U["virus"] + " " if U["virus"] else "")
            + "Fuente: Boletín Epidemiológico semanal, Dirección General de Epidemiología, Ministerio de Salud y Deportes.")
    kp = [[f"{N['casos']:,.0f}".replace(",", "."), f"casos de IRA, SE {N['se']}"], [f"{N['var_pct']:+.1f}%".replace(".", ","), "frente a la semana anterior"],
          [(f"{U['tasa_nacional']:.1f}".replace(".", ",") + "‰") if U["tasa_nacional"] else "S/D", "tasa semanal por 1.000 hab."],
          [f"+{U['vacuna']['adicionales']:,.0f}".replace(",", ".") if U["vacuna"] else "S/D", "dosis de vacuna antiinfluenza esta semana"]]
    return {"tipo": "epi_ira", "codigo": f"EPI-IRA-SE{N['se']}", "titulo": f"Infecciones respiratorias agudas e influenza · Bolivia · SE {N['se']}",
            "meta": [["BOLETÍN", f"SE {N['se']}"], ["PERIODO", U["fechas"]], ["CORTE", dt.datetime.now(dt.timezone(dt.timedelta(hours=-4))).strftime("%d %b %Y · %H:%M BOT").upper()], ["ESTADO", "Vigilancia activa"]],
            "sintesis": sint, "kpis": kp, "curva": curva, "deptos": dep, "vacuna": U["vacuna"], "edad": U["edad"], "virus": U["virus"], "url": enl[ult],
            "metodo": f"Cifras leídas automáticamente del Boletín Epidemiológico N° {N['se']} (PDF público del Ministerio de Salud y Deportes) y de las 7 ediciones anteriores para la curva semanal. No hay estimaciones propias; verificar contra el PDF original.",
            "fuentes": [[f"Boletín epidemiológico SE {se}", ""] for se in sorted(datos)]}


if __name__ == "__main__":
    b = boletin(); print(json.dumps(b, ensure_ascii=False, indent=1)[:3000] if b else "SIN DATOS")
    import os
    os.makedirs("datos/v3/investigacion", exist_ok=True)
    json.dump(b, open("datos/v3/investigacion/epi_ira.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if b:
        import boletin_html
        boletin_html.build(b, "datos/v3/investigacion/epi_ira_BOLETIN.pdf"); print("PDF generado")

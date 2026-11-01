# -*- coding: utf-8 -*-
"""Extrae datos estructurados del TEXTO completo de una nota (no solo del titular): víctimas, vehículos, vía/tramo, lugar (municipio),
autoridad citada, causa preliminar, traslado de heridos. Cada dato conserva la frase de la nota de donde sale (trazabilidad).
Reglas explícitas y revisables; es información de prensa, no verificada."""
import re
from collections import Counter

VEH = [("minibús", r"mini ?bus"), ("microbús", r"micro ?bus"), ("bus / flota", r"\bbus\b|\bflota\b|omnibus"), ("volqueta", r"volqueta"), ("camión", r"\bcamion\b|\bcamiones\b"),
       ("cisterna", r"cisterna"), ("tráiler", r"trailer|semirremolque|tractocamion"), ("motocicleta", r"motocicleta|\bmoto\b|\bmotos\b"), ("vagoneta / camioneta", r"vagoneta|camioneta"),
       ("automóvil", r"automovil|\bauto\b|\bautos\b|vehiculo (?:particular|liviano)"), ("taxi", r"\btaxi\b"), ("trufi", r"trufi"), ("ambulancia", r"ambulancia"), ("bicicleta", r"bicicleta"), ("tractor", r"tractor")]
AUT = [("Policía", r"policia|felcc|felcv|transito"), ("Bomberos", r"bombero"), ("SUMA 161", r"suma|161"), ("ABC", r"\babc\b|administradora boliviana de carreteras"), ("Fiscalía", r"fiscal"),
       ("Defensa Civil", r"defensa civil"), ("SEDES", r"\bsedes\b"), ("Alcaldía", r"alcaldia"), ("Gobernación", r"gobernacion"), ("FFAA", r"fuerzas armadas|ejercito")]
CAUSA = re.compile(r"exceso de velocidad|imprudencia|ebri|alcohol|se presume|presunt|primeras investigaciones|causa|desperfecto|falla|frenos|niebla|lluvia|resbal|descuido|invad|adelant|sue[nñ]o|curva", re.I)
TRASL = re.compile(r"trasladad|hospital|centro de salud|evacuad|ambulancia|atendid|internad|terapia", re.I)
VIA = re.compile(r"((?:carretera|ruta|camino|tramo|avenida|av\.|autopista|doble v[ií]a|puente|variante|calle)\s+(?:(?:de|a|al|del|la|el|nueva|antigua)\s+)?[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s*[–\-]\s*[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)*)")
KM = re.compile(r"(?:kil[oó]metro|km)\.?\s*(\d{1,4})", re.I)
ALT = re.compile(r"a la altura de\s+((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+\s?){1,3})")
RANGO = re.compile(r"((?:coronel|mayor|capit[aá]n|teniente|sargento|comandante|subcomandante|director|directora|fiscal|doctor|doctora|dr\.|dra\.)\s+(?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+\s?){1,3})")
HORA = re.compile(r"(?:a las|alrededor de las|cerca de las|sobre las)\s+(\d{1,2}[:.]\d{2})|(\d{1,2}[:.]\d{2})\s*(?:horas|hrs)|(madrugada|anoche|esta ma[nñ]ana|esta tarde|esta noche|la noche del [a-záéíóú]+)", re.I)


def _norm(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


def _frases(t):
    return [f.strip() for f in re.split(r"(?<=[.!?])\s+|\n+", re.sub(r"[ \t]+", " ", t or "")) if len(f.strip()) > 25]


def ficha(texto, geo=None, ih=None, bq=None):
    """Datos de UNA nota. Devuelve dict con las claves presentes."""
    if ih is None:
        import informe_hecho as ih
    if bq is None:
        import busqueda as bq
    t = re.sub(r"(?i)escuchar esta nota|foto:[^\n]*|fuente:[^\n]*", " ", texto or "")
    fr = _frases(t)
    out = {}
    f, h = ih.cifras(t)
    out["fallecidos"], out["heridos"] = f, h
    out["ev_f"], out["ev_h"] = (ih.evidencia(t, "f") if f else ""), (ih.evidencia(t, "h") if h else "")
    nt = _norm(t)
    out["vehiculos"] = [n for n, rx in VEH if re.search(rx, nt)][:5]
    vias = []
    for m in VIA.finditer(t):
        v = m.group(1).strip()
        if v not in vias:
            vias.append(v)
    out["via"] = vias[0] if vias else ""
    km = KM.search(t)
    if km:
        out["km"] = km.group(1)
    al = ALT.search(t)
    if al:
        out["altura"] = al.group(1).strip()
    out["autoridades"] = [n for n, rx in AUT if re.search(rx, nt)]
    rg = RANGO.search(t)
    if rg:
        out["vocero"] = rg.group(1).strip()
    cz = [x for x in fr if CAUSA.search(x)][:2]
    out["causa"] = " ".join(cz)[:320]
    tr = [x for x in fr if TRASL.search(x)][:2]
    out["traslado"] = " ".join(tr)[:320]
    hm = HORA.search(t)
    if hm:
        out["hora"] = next(g for g in hm.groups() if g)
    if geo:
        lat, lon, lugar, met = bq.ubicar_por_nombre(geo, t[:1800])
        if lat is not None and "(departamento)" not in lugar:
            out.update({"lat": lat, "lon": lon, "lugar": lugar})
    return out


def consolidar(notas):
    """notas: [{'medio','ts','ficha'}] -> ficha del hecho (valores acordados entre notas, discrepancias y frases de evidencia)."""
    F = [n for n in notas if n.get("ficha")]
    if not F:
        return None
    r = {"notas_leidas": len(F), "medios_leidos": sorted({n["medio"] for n in F})}
    for k, ev in (("fallecidos", "ev_f"), ("heridos", "ev_h")):
        vals = [(n["ficha"].get(k, 0), n["medio"], n["ficha"].get(ev, "")) for n in F]
        mx = max(v[0] for v in vals)
        r[k] = mx
        r[k + "_por_medio"] = {m: v for v, m, _ in vals}
        r[k + "_evidencia"] = next(({"medio": m, "frase": e} for v, m, e in vals if v == mx and e), None)
        r[k + "_discrepa"] = len({v for v, _, _ in vals if v > 0}) > 1
    veh = Counter(v for n in F for v in n["ficha"].get("vehiculos", []))
    r["vehiculos"] = [v for v, _ in veh.most_common(4)]
    for k in ("via", "km", "altura", "vocero", "causa", "traslado", "hora"):
        c = Counter(n["ficha"].get(k) for n in F if n["ficha"].get(k))
        if c:
            r[k] = c.most_common(1)[0][0]
    r["autoridades"] = [a for a, _ in Counter(a for n in F for a in n["ficha"].get("autoridades", [])).most_common(4)]
    lug = Counter((n["ficha"]["lugar"], n["ficha"]["lat"], n["ficha"]["lon"]) for n in F if n["ficha"].get("lat") is not None)
    if lug:
        (l, la, lo), _ = lug.most_common(1)[0]
        r.update({"lugar": l, "lat": la, "lon": lo})
    return r

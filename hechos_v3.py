"""Hechos v3: une las notas que hablan del mismo hecho en una sola ficha viva con historial de cifras.

Reglas (validadas con el Dr. Quispe, 04/11):
- Un hecho puntual (accidente, incendio de inmueble, colapso...) se cierra a los 3 días sin notas nuevas.
- Un hecho grande (sequía, brote, inundación...) se cierra a los 14 días; la ventana se extiende 7 días por cada 10 notas recientes (tope 45).
- Si un hecho cerrado reaparece (hasta 90 días después) se reabre, siempre que coincida el lugar y el texto; si no hay antecedente, es un hecho nuevo.
- Cifra vigente a una fecha de corte: la mayor de fuente oficial; si no hay oficial, la mayor de prensa marcada «sin confirmar».
  Si la última cifra baja respecto de otra anterior, se marca «revisar» (no se sobrescribe).
"""
import hashlib, collections
import agrupar_v3

GRANDES = {"sequía", "brote / enfermedad transmisible", "inundación / riada", "granizada / helada / viento", "incendio forestal", "sanidad animal", "intoxicación / alimentos"}
H = 3600 * 1000
D = 24 * H
CAMPOS_BASE = ("fallecidos", "heridos")


def clase(subtipo):
    return "grande" if subtipo in GRANDES else "puntual"


def huella(e):
    """Resumen mínimo de una nota para guardar en el hecho (con sus cifras tal como las dio esa nota)."""
    cifras = {}
    for c, v in ((e.get("ficha") or {}).get("campos") or {}).items():
        if v.get("estado") == "cifra":
            cifras[c] = v["valor"]
        elif v.get("estado") == "sin_victimas":
            cifras[c] = 0
    return {"id": e["id"], "ts": e.get("ts") or 0, "fuente": e.get("fuente") or "", "url": e.get("url"), "titulo": (e.get("titulo") or "")[:140],
            "oficial": bool(e.get("oficial")), "cifras": cifras, "subtipo": e.get("subtipo"), "departamento": (e.get("departamentos") or [None])[0],
            "municipio": (e.get("lugar") or "").split(",")[0] if e.get("precision_ubicacion") == "municipio" else None,
            "lugar": e.get("lugar") or "", "precision": e.get("precision_ubicacion"), "grandes": e.get("_grandes") or []}


def _pool_item(n):
    return {"titulo": n["titulo"], "ts": n["ts"], "departamento": n.get("departamento"), "municipio": n.get("municipio"),
            "fallecidos": n["cifras"].get("fallecidos"), "subtipo": n.get("subtipo"), "grandes": n.get("grandes")}


def ventana_ms(h):
    if h["clase"] == "puntual":
        return 3 * D
    recientes = sum(1 for n in h["notas"] if n["ts"] >= h["ultima"] - 14 * D)
    return min(45, 14 + 7 * (recientes // 10)) * D


def estado(h, ahora):
    return "abierto" if ahora - h["ultima"] <= ventana_ms(h) else "cerrado"


def _nuevo(notas):
    notas = sorted(notas, key=lambda n: n["ts"])
    mejor = max(notas, key=lambda n: ({"municipio": 3, "punto": 3, "tramo": 2, "varios": 2, "departamento": 1}.get(n.get("precision"), 0), n["ts"]))
    return {"id": "hecho:" + hashlib.sha1(notas[0]["id"].encode()).hexdigest()[:10], "subtipo": notas[0].get("subtipo"), "clase": clase(notas[0].get("subtipo")),
            "lugar": mejor.get("lugar"), "departamento": mejor.get("departamento"), "precision": mejor.get("precision"),
            "notas": notas, "primera": notas[0]["ts"], "ultima": notas[-1]["ts"], "reaperturas": 0, "posible_fusion": []}


def _agregar(h, n, ahora_nota):
    if n["ts"] > h["ultima"] + ventana_ms(h):  # llegó después del cierre: reapertura
        h["reaperturas"] += 1
    h["notas"].append(n); h["notas"].sort(key=lambda x: x["ts"]); h["ultima"] = h["notas"][-1]["ts"]


def _pasada(previos, libres, ventana_h, clases, solo_cerrados=False, solo_con_municipio=False, ahora=0):
    """Una pasada de unión sobre notas libres y las últimas notas de hechos existentes. Devuelve las notas que quedaron unidas."""
    pool, dueño = [], []
    for h in previos.values():
        if h["clase"] in clases and (not solo_cerrados or estado(h, ahora) == "cerrado"):
            for n in h["notas"][-8:]:
                pool.append(_pool_item(n)); dueño.append(("h", h["id"], n))
    for n in libres:
        if clase(n.get("subtipo")) in clases and (not solo_con_municipio or n.get("municipio")):
            pool.append(_pool_item(n)); dueño.append(("n", None, n))
    unidas = set()
    for g in agrupar_v3.agrupar(pool, ventana_h=ventana_h):
        if len(g["indices"]) < 2:
            continue
        miembros = [dueño[i] for i in g["indices"]]
        nuevas = [m[2] for m in miembros if m[0] == "n" and m[2]["id"] not in unidas]
        hs = sorted({m[1] for m in miembros if m[0] == "h"}, key=lambda i: -previos[i]["ultima"])
        if not nuevas:
            continue
        if hs:
            h = previos[hs[0]]
            for n in nuevas:
                _agregar(h, n, ahora)
            if len(hs) > 1:
                h["posible_fusion"] = sorted(set(h["posible_fusion"]) | set(hs[1:]))
        else:
            h = _nuevo(nuevas); previos[h["id"]] = h
        unidas |= {n["id"] for n in nuevas}
    return unidas


def actualizar(eventos, previos, ahora):
    """eventos: lista del flujo (ya enriquecidos). previos: dict id->hecho guardado. Devuelve el dict de hechos actualizado."""
    hechos = {k: v for k, v in previos.items()}
    conocidas = {n["id"]: h for h in hechos.values() for n in h["notas"]}
    libres = []
    for e in eventos:
        if e.get("origen") != "prensa" or not e.get("relevante_v3") or e.get("ambito") == "exterior" or e.get("informacion_insuficiente") or not e.get("subtipo") or e.get("subtipo") == "sin clasificar":
            continue
        n = huella(e)
        if e["id"] in conocidas:  # nota ya vista: se actualizan sus cifras y lugar por si el sistema mejoró
            h = conocidas[e["id"]]
            h["notas"] = [n if x["id"] == n["id"] else x for x in h["notas"]]
        else:
            libres.append(n)
    ids_libres = {n["id"] for n in libres}
    u = _pasada(hechos, libres, 72, ("puntual", "grande"), ahora=ahora)
    libres = [n for n in libres if n["id"] not in u]
    u = _pasada(hechos, libres, 14 * 24, ("grande",), ahora=ahora)
    libres = [n for n in libres if n["id"] not in u]
    u = _pasada(hechos, libres, 90 * 24, ("puntual", "grande"), solo_cerrados=True, solo_con_municipio=True, ahora=ahora)
    libres = [n for n in libres if n["id"] not in u]
    for n in libres:  # lo que no se unió a nada es un hecho nuevo
        h = _nuevo([n]); hechos[h["id"]] = h
    for h in hechos.values():
        con = [n for n in h["notas"] if n.get("lugar")]
        if con:
            mejor = max(con, key=lambda n: ({"municipio": 3, "punto": 3, "tramo": 2, "varios": 2, "departamento": 1}.get(n.get("precision"), 0), n["ts"]))
            h.update(lugar=mejor["lugar"], departamento=mejor.get("departamento"), precision=mejor.get("precision"))
        h["estado"] = estado(h, ahora)
    return hechos


def cifra_vigente(h, corte=None):
    """Por campo: la mayor cifra oficial hasta el corte; si no hay oficial, la mayor de prensa (sin confirmar). 'revisar' si la última cifra bajó."""
    notas = [n for n in h["notas"] if corte is None or n["ts"] <= corte]
    out = {}
    for campo in sorted({c for n in notas for c in n["cifras"]}):
        serie = [(n["ts"], n["cifras"][campo], n["oficial"], n["fuente"]) for n in notas if campo in n["cifras"]]
        of = [s for s in serie if s[2]]
        base = of or serie
        mejor = max(base, key=lambda s: (s[1], s[0]))
        ultima = max(serie, key=lambda s: s[0])
        out[campo] = {"valor": mejor[1], "origen": "oficial" if of else "prensa (sin confirmar)", "fuente": mejor[3], "reportes": len(serie),
                      "serie": [(s[0], s[1]) for s in sorted(serie)], "revisar": ultima[1] < max(s[1] for s in serie)}
    return out


def resumen(h, corte=None):
    cv = cifra_vigente(h, corte)
    partes = []
    for c, v in cv.items():
        txt = f"{c.replace('_', ' ').capitalize()}: {v['valor']:,}".replace(",", ".")
        if v["origen"] != "oficial":
            txt += " (prensa, sin confirmar)"
        if v["revisar"]:
            txt += " [revisar: una nota posterior da una cifra menor]"
        partes.append(txt)
    return " · ".join(partes)

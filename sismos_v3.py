# -*- coding: utf-8 -*-
"""Panorama sísmico de Bolivia con datos abiertos del USGS (catálogo FDSN). Sin IA: todo se lee del catálogo."""
import json, urllib.request, datetime as dt, os
UA = {"User-Agent": "Mozilla/5.0 sala-situacion-bolivia/3"}
BO = dt.timezone(dt.timedelta(hours=-4))


RAW = "https://raw.githubusercontent.com/micangelarcangel-lang/sala-situacion-bolivia/main/docs/sismos_oficiales.json"


def cargar():
    """Boletín sísmico del Observatorio San Calixto (fuente oficial) tal como ya lo lee el sistema; lee la copia publicada en main (solo lectura) y, si falla, la del repositorio."""
    try:
        return json.loads(urllib.request.urlopen(urllib.request.Request(RAW, headers=UA), timeout=40).read())
    except Exception:
        return json.load(open("docs/sismos_oficiales.json", encoding="utf-8"))


def boletin(datos=None, ventana="30d"):
    datos = datos or cargar()
    VD = {"24h": 1, "7d": 7, "30d": 30}; NV = {"24h": "últimas 24 horas", "7d": "últimos 7 días", "30d": "último mes"}
    EN = {"24h": "en las últimas 24 horas", "7d": "en los últimos 7 días", "30d": "en el último mes"}
    ventana = ventana if ventana in VD else "30d"; WD = VD[ventana]
    ev = []
    for x in datos["sismos"]:
        t = dt.datetime.strptime(x["fecha_local"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=BO).timestamp() * 1000
        ev.append({"t": t, "mag": x["mag"], "lugar": f"{x.get('provincia') or ''}, {x['departamento']}".strip(", "), "depto": x["departamento"], "lat": x["lat"], "lon": x["lon"], "prof": x["prof_km"], "bo": True, "sentido": bool(x.get("probable_sentido"))})
    ev.sort(key=lambda e: -e["t"])
    ahora = dt.datetime.now(dt.timezone.utc).timestamp() * 1000
    ev = [e for e in ev if ahora - e["t"] < WD * 864e5]; dias = WD
    u24 = [e for e in ev if ahora - e["t"] < 864e5]; u7 = [e for e in ev if ahora - e["t"] < 7 * 864e5]
    mayor = max(ev, key=lambda e: e["mag"]) if ev else None
    sent = [e for e in ev if e["sentido"]]
    por_depto = {}
    for e in ev: por_depto[e["depto"]] = por_depto.get(e["depto"], 0) + 1
    top = ", ".join(f"{d} ({n})" for d, n in sorted(por_depto.items(), key=lambda x: -x[1])[:3])
    loc = lambda e: dt.datetime.fromtimestamp(e["t"] / 1000, BO).strftime("%d/%m %H:%M")
    fmt = lambda m: str(m).replace(".", ",")
    sint = (f"El Observatorio San Calixto reporta {len(ev)} sismos {EN[ventana]}. " if ev else f"El Observatorio San Calixto no reporta sismos {EN[ventana]}. ")
    if mayor:
        sint += f"El mayor fue de magnitud {fmt(mayor['mag'])} ({loc(mayor)}, {mayor['lugar']}, a {mayor['prof']:.0f} km de profundidad). "
    sint += (f"Departamentos con más eventos: {top}. " if top else "") + (f"{len(sent)} evento(s) con probabilidad de haber sido sentidos por la población (magnitud 4,0 o más y profundidad menor a 100 km). " if ev else "")
    sint += "Fuente oficial: Observatorio San Calixto."
    kp = [[str(len(ev)), f"sismos, {NV[ventana]}"], [str(len(u24)), "últimas 24 horas"], [fmt(mayor["mag"]) if mayor else "—", "mayor magnitud"], [str(len(sent)), "probablemente sentidos"]]
    por_dia = {}
    for e in ev:
        d = dt.datetime.fromtimestamp(e["t"] / 1000, BO).strftime("%Y-%m-%d"); por_dia.setdefault(d, [0, 0]); por_dia[d][1 if e["sentido"] else 0] += 1
    hoy = dt.datetime.now(BO).date(); dias_l = [(hoy - dt.timedelta(days=i)).isoformat() for i in range(dias - 1, -1, -1)]
    return {"tipo": "sismo", "codigo": f"SIS-{ventana.upper()}-" + dt.datetime.now(BO).strftime("%Y%m%d"), "ventana": ventana, "titulo": f"Actividad sísmica en Bolivia · {NV[ventana]}",
            "meta": [["FUENTE", "Observatorio San Calixto"], ["VENTANA", NV[ventana].upper()], ["CORTE", dt.datetime.now(BO).strftime("%d %b %Y · %H:%M BOT").upper()], ["ESTADO", "Monitoreo"]],
            "sintesis": sint, "kpis": kp, "eventos": ev, "serie": [[d, *por_dia.get(d, [0, 0])] for d in dias_l], "por_depto": sorted(por_depto.items(), key=lambda x: -x[1]),
            "graf": [{"t": e["t"], "mag": e["mag"], "prof": e["prof"], "f": dt.datetime.fromtimestamp(e["t"]/1000, BO).strftime("%Y-%m-%d %H:%M"), "l": e["lugar"]} for e in ev], "ultimos": ev[:10], "metodo": f"Eventos del boletín sísmico oficial del Observatorio San Calixto, leídos automáticamente (actualizado: {datos.get('actualizado', '')[:16]} UTC). Un sismo se marca como 'probablemente sentido' con magnitud ≥ 4,0 y profundidad ≤ 100 km (criterio del sistema; no es una intensidad medida).",
            "fuentes": [["Observatorio San Calixto · Boletín sísmico", datos.get("fuente", "")]]}


if __name__ == "__main__":
    import sys; v = sys.argv[1] if len(sys.argv) > 1 else "30d"
    b = boletin(ventana=v); print(b["sintesis"])
    os.makedirs("datos/v3/investigacion", exist_ok=True)
    json.dump(b, open(f"datos/v3/investigacion/sismos_{v}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    import boletin_html
    boletin_html.build(b, f"datos/v3/investigacion/sismos_{v}_BOLETIN.pdf"); print("PDF generado")

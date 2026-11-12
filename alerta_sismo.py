"""Alerta de sismo: M >= 4,0 y profundidad <= 100 km (San Calixto), con municipios en el entorno.
Uso:  python alerta_sismo.py --probar     (muestra el mensaje, no envía ni guarda estado)
      python alerta_sismo.py              (envía por correo los sismos nuevos y los marca como avisados)
NO está conectado a ningún cron ni a sala.yml: la integración al flujo automático de main requiere aprobación."""
import json, math, os, sys
MAG_MIN, PROF_MAX = 4.0, 100.0
ESTADO = "docs/alerta_sismo_estado.json"

def km(lo1, la1, lo2, la2):
    r = math.pi / 180; a = math.sin((la2 - la1) * r / 2) ** 2 + math.cos(la1 * r) * math.cos(la2 * r) * math.sin((lo2 - lo1) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))

def radio(mag, prof):
    r = 300 if mag >= 6 else 150 if mag >= 5 else 60 if mag >= 4 else 30
    return r / 2 if prof > 100 else r

def centro(g):
    pts = []
    def rec(c):
        if isinstance(c[0], (int, float)): pts.append(c)
        else: [rec(x) for x in c]
    rec(g["coordinates"]); n = len(pts)
    return sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n

def entorno(s, munis):
    R = radio(s["mag"], s["prof_km"]); L = []
    for f in munis:
        lo, la = centro(f["geometry"]); d = km(s["lon"], s["lat"], lo, la)
        if d <= R: L.append((d, f["properties"]["n"], f["properties"]["d"]))
    return R, sorted(L)

def mensaje(s, R, L):
    t = "ALERTA SÍSMICA · M %.1f · %s (%s)" % (s["mag"], s["provincia"], s["departamento"])
    lin = ["Sismo M %.1f del %s (hora local), profundidad %.0f km. Fuente: Observatorio San Calixto." % (s["mag"], s["fecha_local"], s["prof_km"]),
           "Municipios dentro de ~%d km del epicentro (estimación del sistema, NO es un mapa oficial de intensidad):" % R]
    lin += ["  - %s (%s) · %d km" % (n, d, round(k)) for k, n, d in L[:20]] or ["  (ninguno con centro dentro del radio)"]
    lin.append("Confirme con SEGEOMIN/Defensa Civil antes de actuar. Tablero: https://micangelarcangel-lang.github.io/sala-situacion-bolivia/modulo.html?t=geol%C3%B3gica")
    return t, "\n".join(lin)

def main():
    probar = "--probar" in sys.argv
    sis = json.load(open("docs/sismos_oficiales.json", encoding="utf8"))["sismos"]
    munis = json.load(open("docs/geo_mun.geojson", encoding="utf8"))["features"]
    primera = not os.path.exists(ESTADO) and not probar
    visto = set(json.load(open(ESTADO))) if os.path.exists(ESTADO) and not probar else set()
    if primera:  # primera ejecución: marca lo ya ocurrido sin enviar, para no inundar el correo
        visto = {s["id"] for s in sis}; os.makedirs("docs", exist_ok=True); json.dump(sorted(visto), open(ESTADO, "w")); print("estado inicial creado:", len(visto)); return
    nuevos = [s for s in sis if s["mag"] >= MAG_MIN and s["prof_km"] <= PROF_MAX and s["id"] not in visto]
    if probar and not nuevos:  # para la prueba, usa el mayor sismo del registro
        nuevos = sorted(sis, key=lambda s: -s["mag"])[:1]
    for s in nuevos:
        R, L = entorno(s, munis); t, c = mensaje(s, R, L); print(t); print(c); print()
        if not probar and os.environ.get("GMAIL_USER"):
            import correo; correo.enviar(t, "<p>" + c.replace("\n", "<br>") + "</p>", c, [], log=print)
        visto.add(s["id"])
    if not probar:
        json.dump(sorted(visto), open(ESTADO, "w"))
    print("sismos avisados:", len(nuevos))

if __name__ == "__main__": main()

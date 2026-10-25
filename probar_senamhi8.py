# -*- coding: utf-8 -*-
"""Prueba 8: rutas de la parte PÚBLICA de la app de avisos (código público, incluidos los módulos que carga después). Escribe docs/senamhi_prueba8.txt."""
import ssl, re, urllib.request, datetime, os

B = "https://sena.senamhi.gob.bo/"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
out = ["Prueba 8 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(u):
    c = ssl.create_default_context(); c.maximum_version = ssl.TLSVersion.TLSv1_2
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=90, context=c) as r:
        return r.read(6000000).decode("utf-8", "ignore")


main = get(B + "main.19f39344b2ef5ab20685.js")
rt = get(B + "runtime.8c7c35cb32f24a56e2c0.js")
# módulos que se cargan después (lazy chunks)
mapa = re.findall(r"(\d{1,4}):\"([0-9a-f]{16,20})\"", rt)
archivos = [f"{a}.{b}.js" for a, b in mapa]
out.append(f"chunks diferidos: {len(archivos)}")
textos = {"main.js": main}
for f in archivos:
    try:
        textos[f] = get(B + f)
    except Exception as e:
        out.append(f"  {f}: error {type(e).__name__}")
out.append("tamaños: " + ", ".join(f"{k}={len(v)}" for k, v in textos.items()))
out.append("")
claves = ["X-SENA-Public-Request", "forecast-public", "public-report", "publicReport", "alert", "warning"]
for nombre, t in textos.items():
    for k in claves[:4]:
        for m in list(re.finditer(re.escape(k), t))[:5]:
            out.append(f"--- {nombre} [{k}] @{m.start()}\n" + t[max(0, m.start() - 300):m.end() + 700].replace("\n", " "))
    if nombre == "main.js":
        i = t.find("intercept(e,t){const n=sessionStorage")
        out.append("--- INTERCEPTOR completo\n" + t[i:i + 2200])
# cadenas con /api, /public/, endpoints en todos los módulos
rutas = set()
for nombre, t in textos.items():
    for m in re.findall(r"[\"'`]((?:/|\./)?(?:public|reports?|forecast|alerts?|warnings?|bulletins?|meteorological|hydrological|events?)[A-Za-z0-9_\-/{}$.]{0,80})[\"'`]", t):
        rutas.add(f"{nombre}: {m}")
out.append("\nRutas candidatas: %d" % len(rutas))
out += ["  " + r for r in sorted(rutas)[:200]]
os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba8.txt", "w", encoding="utf-8").write("\n".join(out))
print(len("\n".join(out)))

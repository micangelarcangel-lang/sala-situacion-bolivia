# -*- coding: utf-8 -*-
"""Prueba 7: cómo la página PÚBLICA de reportes obtiene sus datos (lee el código público de la app). Escribe docs/senamhi_prueba7.txt."""
import ssl, re, urllib.request, datetime, os

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
out = ["Prueba 7 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(u, limite=4000000):
    c = ssl.create_default_context(); c.maximum_version = ssl.TLSVersion.TLSv1_2
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=90, context=c) as r:
        return r.read(limite).decode("utf-8", "ignore")


t = get("https://sena.senamhi.gob.bo/main.19f39344b2ef5ab20685.js")
out.append(f"main.js {len(t)} bytes")
claves = ["forecast-public-reports", "public-reports", "publicReports", "meteorological-forecast", "shapefile", "shape", "download", "zip", "/public/", "Bearer", "auth_token", "environment.host", "host+", "this.host"]
visto = set()
for k in claves:
    n = 0
    for m in re.finditer(re.escape(k), t):
        a = max(0, m.start() - 250); b = min(len(t), m.end() + 350)
        frag = t[a:b].replace("\n", " ")
        h = hash(frag[:120])
        if h in visto:
            continue
        visto.add(h)
        out.append(f"--- [{k}] @{m.start()}\n{frag}")
        n += 1
        if n >= 4:
            break
os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba7.txt", "w", encoding="utf-8").write("\n".join(out))
print(len("\n".join(out)))

# -*- coding: utf-8 -*-
"""Prueba 9: rutas PÚBLICAS de avisos meteorológicos (las que usa la página pública). Si responden 401 se detiene: no se usan claves. Escribe docs/senamhi_prueba9.txt."""
import ssl, re, json, urllib.request, datetime, os

A = "https://senab.senamhi.gob.bo/api/"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
out = ["Prueba 9 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(u, metodo="GET"):
    c = ssl.create_default_context(); c.maximum_version = ssl.TLSVersion.TLSv1_2
    rq = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json"}, method=metodo)
    try:
        with urllib.request.urlopen(rq, timeout=60, context=c) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read(300000)
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read(800)
    except Exception as e:
        return type(e).__name__, "", str(e)[:100].encode()


# código de las pantallas públicas: cómo piden los datos
for chunk in re.findall(r'"(4500\.[0-9a-f]+\.js|1651\.[0-9a-f]+\.js)"', ""):
    pass
for nombre in ("4500.37b8024e48ac89a3e5fd.js", "1651.bdfc52e7276356fb36ca.js"):
    st, ct, d = get("https://sena.senamhi.gob.bo/" + nombre)
    t = d.decode("utf-8", "ignore") if isinstance(d, bytes) else ""
    for k in ("public/forecastweather", "forecastweather/report/", "forecast-public-reports"):
        for m in list(re.finditer(re.escape(k), t))[:3]:
            out.append(f"--- {nombre} [{k}] @{m.start()}\n" + t[max(0, m.start() - 500):m.end() + 600].replace("\n", " "))
out.append("")

for p in ["public/forecastweather", "public/forecastweather?page=1&limit=20", "forecastweather/public", "hydrological-alertas-hidrologicas-public",
          "public/hydrological-alertas-hidrologicas-public", "public/forecast-public-reports", "forecastweather/datatable"]:
    st, ct, d = get(A + p)
    s = d.decode("utf-8", "ignore") if isinstance(d, bytes) else str(d)
    out.append(f"== GET {A+p}\n   estado={st} tipo={ct} bytes={len(d)}\n   inicio: " + re.sub(r"\s+", " ", s[:1200]))
    if st == 200 and "json" in ct:
        try:
            j = json.loads(s)
            out.append("   JSON claves: " + (", ".join(list(j)[:20]) if isinstance(j, dict) else f"lista de {len(j)}"))
        except Exception:
            pass
os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba9.txt", "w", encoding="utf-8").write("\n".join(out))
print(len("\n".join(out)))

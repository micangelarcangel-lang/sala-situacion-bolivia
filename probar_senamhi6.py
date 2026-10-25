# -*- coding: utf-8 -*-
"""Prueba 6: API senab, GeoServer senageo y pronosticodiarioJson.php (TLS 1.2). Escribe docs/senamhi_prueba6.txt."""
import ssl, re, urllib.request, urllib.parse, datetime, os, json

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
out = ["Prueba 6 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(u, n=2, limite=400000):
    err = ""
    for _ in range(n):
        c = ssl.create_default_context(); c.maximum_version = ssl.TLSVersion.TLSv1_2
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json, text/xml, */*"}), timeout=60, context=c) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read(limite)
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Content-Type", ""), e.read(1500)
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:80]
    return err, "", b""


# 1) rutas de la API dentro del código de la app
st, ct, d = get("https://sena.senamhi.gob.bo/main.19f39344b2ef5ab20685.js", limite=3000000)
t = d.decode("utf-8", "ignore")
out.append(f"main.js {st} {len(t)}")
rutas = set()
for m in re.finditer(r"senab\.senamhi\.gob\.bo/api", t):
    rutas.add("ctx:" + t[max(0, m.start() - 80):m.end() + 120].replace("\n", " "))
for m in re.findall(r"[\"'`](/?(?:public|private|auth|forecast|alert|warning|aviso|report|bulletin|geo)[A-Za-z0-9_\-/]{3,80})[\"'`]", t):
    rutas.add(m)
for m in re.findall(r"[\"'`]([a-z\-/]*(?:alert|aviso|warning|forecast-public|public-report|bulletin)[A-Za-z0-9_\-/]{0,60})[\"'`]", t, re.I):
    rutas.add(m)
out.append("rutas en el código (%d):" % len(rutas))
for r in sorted(rutas)[:120]:
    out.append("   " + r[:260])
out.append("")

# 2) probar direcciones
pruebas = [
    "https://senab.senamhi.gob.bo/api",
    "https://senab.senamhi.gob.bo/api/public/forecast-public-reports",
    "https://senab.senamhi.gob.bo/api/forecast-public-reports",
    "https://senamhi.gob.bo/pronosticodiarioJson.php",
    "https://senageo.senamhi.gob.bo/geoserver/senamhi/wfs?service=WFS&request=GetCapabilities",
    "https://senageo.senamhi.gob.bo/geoserver/wfs?service=WFS&request=GetCapabilities",
    "https://senageo.senamhi.gob.bo/geoserver/rest/layers.json",
]
for u in pruebas:
    st, ct, d = get(u)
    out.append(f"== {u}\n   estado={st} tipo={ct} bytes={len(d)}")
    s = d.decode("utf-8", "ignore")
    if "GetCapabilities" in u and "FeatureType" in s:
        nombres = re.findall(r"<(?:wfs:)?Name>([^<]+)</(?:wfs:)?Name>", s)
        out.append("   capas (%d): " % len(nombres) + ", ".join(nombres[:200]))
    else:
        out.append("   inicio: " + re.sub(r"\s+", " ", s[:700]))
os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba6.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out)[:3000])

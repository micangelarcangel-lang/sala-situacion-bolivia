# -*- coding: utf-8 -*-
"""Prueba 5: busca la API de la app de avisos (Angular) de SENAMHI usando TLS 1.2. Escribe docs/senamhi_prueba5.txt."""
import ssl, re, urllib.request, datetime, os, json

H = "https://sena.senamhi.gob.bo/"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
out = ["Prueba 5 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def ctx():
    c = ssl.create_default_context()
    c.maximum_version = ssl.TLSVersion.TLSv1_2
    return c


def get(u, n=2):
    err = ""
    for _ in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json, text/html, */*"}), timeout=60, context=ctx()) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Content-Type", ""), e.read()[:500]
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:80]
    return err, "", b""


st, ct, d = get(H + "public/forecast-public-reports")
h = d.decode("utf-8", "ignore")
out.append(f"página: {st} {ct} {len(d)}")
js = re.findall(r'src="([^"]+\.js)"', h)
cand = set()
for j in js:
    s2, c2, d2 = get(H + j)
    t = d2.decode("utf-8", "ignore")
    out.append(f"{j}: {s2} {len(t)} bytes")
    for m in re.findall(r'["\'`](https?://[^"\'`\s]{6,160})["\'`]', t):
        if "senamhi" in m or "api" in m.lower():
            cand.add(m)
    for m in re.findall(r'["\'`](/?(?:api|public|forecast|alert|aviso|warning|report|shape|geo)[A-Za-z0-9_\-/.?=${}]{2,120})["\'`]', t):
        cand.add(m)
    for m in re.findall(r"(?:apiUrl|baseUrl|API_URL|apiBase|urlApi|endpoint)\s*[:=]\s*[\"'`]([^\"'`]+)", t, re.I):
        cand.add("CONFIG:" + m)
out.append("")
out.append("Direcciones/rutas candidatas (%d):" % len(cand))
for c in sorted(cand)[:250]:
    out.append("  " + c)
os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba5.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out)[:2500])

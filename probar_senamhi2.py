# -*- coding: utf-8 -*-
"""Prueba 2: visores incrustados de SENAMHI. Escribe docs/senamhi_prueba2.txt."""
import re, time, ssl, urllib.request, urllib.parse, datetime, os

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
VISORES = [
    "https://sena.senamhi.gob.bo/public/forecast-public-reports",
    "https://www.senamhi.gob.bo/alertas2.php",
    "https://senamhi.gob.bo/pronosticoH/index.html",
]
INTERES = r"\.(pdf|zip|shp|kml|kmz|json|geojson|csv|xls|xlsx|js)(\?|$)|alert|aviso|geoserver|wms|wfs|arcgis|api|shape|fetch|ajax|endpoint|/public/|\.php"
out = ["Prueba 2 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(url, limite=3000000, intentos=3, espera=60):
    ult = ""
    for i in range(intentos):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es"})
        try:
            with urllib.request.urlopen(req, timeout=espera, context=ssl.create_default_context()) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read(limite), ""
        except urllib.error.HTTPError as e:
            return e.code, "", b"", "HTTP"
        except Exception as e:
            ult = type(e).__name__ + ": " + str(e)[:100]
            time.sleep(5)
    return "ERR", "", b"", ult


for v in VISORES:
    st, ct, d, err = get(v)
    out.append(f"== {v}\n   estado={st} tipo={ct} bytes={len(d)} {err}")
    if not d:
        out.append("")
        continue
    h = d.decode("utf-8", "ignore")
    t = re.search(r"<title>(.*?)</title>", h, re.I | re.S)
    out.append("   título: " + (t.group(1).strip()[:100] if t else "-"))
    refs = set(re.findall(r'(?:href|src|action|data-[a-z-]+)\s*=\s*["\']([^"\']+)["\']', h))
    refs |= set(re.findall(r'["\'](https?://[^"\'\s<>]+|/[A-Za-z0-9_\-./?=&%]+\.(?:php|json|js|pdf|zip|geojson))["\']', h))
    for x in sorted(refs):
        if re.search(INTERES, x, re.I) and not x.startswith("data:"):
            out.append("   - " + urllib.parse.urljoin(v, x.replace(" ", "%20"))[:200])
    # llamadas dinámicas dentro del código de la página
    for m in sorted(set(re.findall(r"(?:fetch|axios\.get|\$\.(?:get|getJSON|ajax)|open)\(\s*[\"'`]([^\"'`]+)", h))):
        out.append("   llamada: " + m[:200])
    # texto visible (primeras líneas) para saber qué muestra
    txt = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
    txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", txt)).strip()
    out.append("   texto: " + txt[:600])
    out.append("")

os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba2.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))

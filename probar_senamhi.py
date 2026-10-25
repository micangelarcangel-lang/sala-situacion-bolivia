# -*- coding: utf-8 -*-
"""Prueba de acceso a SENAMHI desde el ejecutor de GitHub. Escribe docs/senamhi_prueba.txt (no toca nada más)."""
import re, ssl, time, urllib.request, urllib.parse, datetime, os

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
PAGINAS = [
    "https://senamhi.gob.bo/index.php/servicios/alerta-meteorologica",
    "https://senamhi.gob.bo/index.php/hidrologia/rhidrologico",
    "https://senamhi.gob.bo/index.php/hidrologia/alertas",
    "https://senamhi.gob.bo/index.php/hidrologia/repositorio-pronostico",
    "https://sena.senamhi.gob.bo/public/forecast-public-reports",
]
out = ["Prueba SENAMHI desde GitHub Actions - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(url, binario=False, limite=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es"})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=40, context=ctx) as r:
            d = r.read(limite) if limite else r.read()
            return r.status, r.headers.get("Content-Type", ""), d
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", "") if e.headers else "", b""
    except Exception as e:
        return "ERR " + type(e).__name__ + ": " + str(e)[:120], "", b""


enlaces_doc = []
for p in PAGINAS:
    st, ct, d = get(p)
    out.append(f"== {p}\n   estado={st} tipo={ct} bytes={len(d)}")
    if d:
        h = d.decode("utf-8", "ignore")
        hrefs = sorted(set(re.findall(r'(?:href|src|data-url|data-src)\s*=\s*["\']([^"\']+)["\']', h)))
        docs = [x for x in hrefs if re.search(r"\.(pdf|zip|shp|kml|kmz|json|geojson|csv|xls|xlsx)(\?|$)", x, re.I) or re.search(r"alert|aviso|geoserver|wms|wfs|arcgis|api|shape", x, re.I)]
        out.append(f"   enlaces totales={len(hrefs)}; de interés={len(docs)}")
        for x in docs[:80]:
            u = urllib.parse.urljoin(p, x.replace(" ", "%20"))
            out.append("   - " + u)
            enlaces_doc.append(u)
        iframes = re.findall(r"<iframe[^>]+src=[\"']([^\"']+)", h, re.I)
        for x in iframes:
            out.append("   iframe: " + urllib.parse.urljoin(p, x))
        scripts = [x for x in hrefs if x.endswith(".js")][:0]
    out.append("")

# probar descarga de un PDF de ejemplo (nivel hidrológico más reciente) y de un enlace de alerta
hoy = datetime.date.today()
for dd in range(0, 4):
    f = hoy - datetime.timedelta(days=dd)
    mes = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][f.month-1]
    u = f"https://senamhi.gob.bo/meteorologia/boletines/hidrologico/{f.year}/{mes}/REPORTE_DE_NIVELES_{f.strftime('%d%m%Y')}_SENAMHI.pdf"
    st, ct, d = get(u, limite=200000)
    out.append(f"PDF niveles {f}: estado={st} tipo={ct} bytes={len(d)} inicio={d[:5]!r}")
for u in enlaces_doc[:6]:
    if re.search(r"\.(pdf|zip)", u, re.I):
        st, ct, d = get(u, limite=100000)
        out.append(f"prueba descarga {u}\n   estado={st} tipo={ct} bytes={len(d)} inicio={d[:6]!r}")

os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))

# -*- coding: utf-8 -*-
"""Prueba 13: Defensa Civil (boletines de alerta), Monitor de Sequías, SIMB y lector de sismos de San Calixto. Solo lecturas públicas. Escribe docs/fuentes_prueba13.txt."""
import ssl, re, json, urllib.request, urllib.parse, datetime, os

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CAB = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7", "Accept-Language": "es-BO,es;q=0.9", "Referer": "https://www.google.com/"}
out = ["Prueba 13 fuentes - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(u, limite=3000000):
    err = ""
    for tls12 in (False, True):
        c = ssl.create_default_context()
        if tls12:
            c.maximum_version = ssl.TLSVersion.TLSv1_2
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=CAB), timeout=50, context=c) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read(limite)
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Content-Type", "") if e.headers else "", e.read(300)
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:70]
    return err, "", b""


def pag(u, patron=r"\.(pdf|zip|csv|json|kml|shp|xls|xlsx)(\?|$)|api|geoserver|wfs|wms|boletin|alerta|incendio", n=40, txt=900):
    st, ct, d = get(u)
    out.append(f"== {u}\n   estado={st} tipo={ct} bytes={len(d)}")
    if d and st == 200:
        h = d.decode("utf-8", "ignore")
        xs = sorted(set(urllib.parse.urljoin(u, x.replace(" ", "%20")) for x in re.findall(r'(?:href|src|data-url)=["\']([^"\'#]+)["\']', h)))
        for x in [x for x in xs if re.search(patron, x, re.I)][:n]:
            out.append("   - " + x)
        t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
        out.append("   texto: " + re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)).strip()[:txt])
    elif d:
        out.append("   cuerpo: " + re.sub(r"\s+", " ", d.decode("utf-8", "ignore"))[:200])
    out.append("")
    return d


D = "https://defensacivil.gob.bo/"
pag(D + "index.php/boletines-de-alerta/", patron=r"wp-content/uploads/2026|boletin|alerta|incendio", n=60, txt=600)
pag(D + "wp-json/wp/v2/media?per_page=5&search=BOLETIN&orderby=date&order=desc", txt=700)
pag(D + "wp-json/wp/v2/pages?per_page=3&slug=boletines-de-alerta", txt=500)
pag("https://monitorsequias.senamhi.gob.bo/", txt=700)
pag("https://simb.produccion.gob.bo/", patron=r"shp|zip|geojson|geoserver|wfs|wms|descarg|api|xhtml|mapa", txt=900)

# lector de sismos de San Calixto
st, ct, d = get("https://osc.org.bo/index.php/es/27-sismicidad/51-boletin-sismico")
h = d.decode("utf-8", "ignore")
t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t))
rx = re.compile(r"(\d{2}/\d{2}/\d{4}) (\d{2}:\d{2}:\d{2}) (-?\d+\.\d+) (-?\d+\.\d+) (\d+\.?\d*) (\d+\.?\d*) (Prov\. .+?)(?= \d{2}/\d{2}/\d{4} \d{2}:|\s{0,1}$| Resumen| Mostrando|\Z)")
ev = rx.findall(t)
out.append(f"== lector San Calixto: {len(ev)} sismos leídos")
for e in ev[:25]:
    out.append("   " + " | ".join(e))
out.append("   pie de tabla: " + t[t.rfind(ev[-1][6]) : t.rfind(ev[-1][6]) + 250] if ev else "   sin eventos")
os.makedirs("docs", exist_ok=True)
open("docs/fuentes_prueba13.txt", "w", encoding="utf-8").write("\n".join(out))
print(len("\n".join(out)))

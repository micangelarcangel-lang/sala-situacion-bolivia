# -*- coding: utf-8 -*-
"""Prueba 14: eventos biológicos (OPS, OMS, SENASAG, Min. Salud), Monitor de Sequías (rutas de datos) y NASA FIRMS. Solo lecturas públicas. Escribe docs/fuentes_prueba14.txt."""
import ssl, re, json, urllib.request, urllib.parse, datetime, os

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CAB = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml,application/json,*/*;q=0.8", "Accept-Language": "es,en;q=0.8"}
out = ["Prueba 14 fuentes - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


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
            return e.code, e.headers.get("Content-Type", "") if e.headers else "", b""
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:70]
    return err, "", b""


def pag(u, patron=r"\.(pdf|zip|csv|json|xml|rss|xls|xlsx)(\?|$)|rss|feed|boletin|alerta|brote|epidemi", n=30, txt=500):
    st, ct, d = get(u)
    out.append(f"== {u}\n   estado={st} tipo={ct} bytes={len(d)}")
    if d and st == 200:
        h = d.decode("utf-8", "ignore")
        xs = sorted(set(urllib.parse.urljoin(u, x.replace(" ", "%20")) for x in re.findall(r'(?:href|src)=["\']([^"\'#]+)["\']', h)))
        for x in [x for x in xs if re.search(patron, x, re.I)][:n]:
            out.append("   - " + x)
        t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
        out.append("   texto: " + re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)).strip()[:txt])
    out.append("")
    return d


# biológicos
pag("https://www.paho.org/es/alertas-actualizaciones-epidemiologicas", patron=r"alerta|actualizacion|epidemiol", n=25)
pag("https://www.who.int/feeds/entity/csr/don/en/rss.xml", txt=700)
pag("https://www.senasag.gob.bo/phocadownload/BOLETIN_SINAVE_2026/", patron=r"\.pdf", n=40, txt=200)
pag("https://www.senasag.gob.bo/", patron=r"sinave|boletin|alerta|sanidad|brote|aviar|aftosa", n=30, txt=300)
for u in ["https://www.minsalud.gob.bo/9104-boletines-epidemiologicos-2026", "https://minsalud.gob.bo/9104-boletines-epidemiologicos-2026", "https://www.minsalud.gob.bo/"]:
    pag(u, patron=r"epidemi|boletin|alerta|vigilancia|snis|brote|dengue|jdownload|\.pdf|download", n=50, txt=1200)
# Monitor de sequías: dónde pide sus datos
st, ct, d = get("https://monitorsequias.senamhi.gob.bo/")
h = d.decode("utf-8", "ignore")
out.append(f"== monitorsequias raíz: {st} {len(d)} bytes\n" + h[:900])
for j in re.findall(r'src=["\']([^"\']+\.js)["\']', h)[:6]:
    u = urllib.parse.urljoin("https://monitorsequias.senamhi.gob.bo/", j)
    st2, ct2, d2 = get(u, 6000000)
    t = d2.decode("utf-8", "ignore")
    out.append(f"-- {u}: {st2} {len(t)} bytes")
    cand = set(re.findall(r"[\"'`](https?://[^\"'`\s]{8,160})[\"'`]", t))
    cand = {c for c in cand if "senamhi" in c or "api" in c.lower() or "geoserver" in c.lower() or "sequi" in c.lower()}
    for c in sorted(cand)[:40]:
        out.append("   " + c)
    for m in re.findall(r"[\"'`]((?:/|\./)?(?:api|public|sequia|spi|spei|drought|indice|monitor|datos|data)[A-Za-z0-9_\-/{}$.?=]{2,80})[\"'`]", t)[:60]:
        out.append("   ruta: " + m)
# FIRMS: solo comprobar respuesta sin clave
st, ct, d = get("https://firms.modaps.eosdis.nasa.gov/api/country/csv/DEMO_KEY/VIIRS_SNPP_NRT/BOL/1")
out.append(f"FIRMS sin clave real: estado={st} bytes={len(d)} inicio={d[:150]!r}")
os.makedirs("docs", exist_ok=True)
open("docs/fuentes_prueba14.txt", "w", encoding="utf-8").write("\n".join(out))
print(len("\n".join(out)))

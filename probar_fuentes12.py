# -*- coding: utf-8 -*-
"""Prueba 12: contenido de páginas de SENAMHI (focos, sequías) y San Calixto. Solo lecturas públicas. Escribe docs/fuentes_prueba12.txt."""
import ssl, re, urllib.request, urllib.parse, datetime, os, time

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
out = ["Prueba 12 fuentes - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(u, limite=2500000):
    err = ""
    for tls12 in (False, True):
        c = ssl.create_default_context()
        if tls12:
            c.maximum_version = ssl.TLSVersion.TLSv1_2
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=50, context=c) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read(limite)
        except urllib.error.HTTPError as e:
            return e.code, "", b""
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:70]
    return err, "", b""


def pagina(u, n_enl=40, n_txt=1800, patron=r"\.(pdf|zip|csv|json|kml|shp|xls|xlsx|png|jpg)(\?|$)|iframe|geoserver|wms|api|descarg"):
    st, ct, d = get(u)
    out.append(f"== {u}\n   estado={st} tipo={ct} bytes={len(d)}")
    if not d:
        out.append(""); return ""
    h = d.decode("utf-8", "ignore")
    xs = sorted(set(urllib.parse.urljoin(u, x.replace(" ", "%20")) for x in re.findall(r'(?:href|src|data-url)=["\']([^"\'#]+)["\']', h)))
    xs = [x for x in xs if re.search(patron, x, re.I) and "fonts.g" not in x and "logo" not in x.lower()]
    for x in xs[:n_enl]:
        out.append("   - " + x)
    for x in re.findall(r"<iframe[^>]+src=[\"']([^\"']+)", h, re.I):
        out.append("   iframe: " + urllib.parse.urljoin(u, x))
    t = re.sub(r"<(script|style|nav|footer)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)).strip()
    out.append("   texto: " + t[:n_txt])
    out.append("")
    return h


S = "https://senamhi.gob.bo/index.php/"
for p in ["meteorologia/focos-calor", "servicios/monitor-sequias", "servicios/sequias", "servicios/fenext", "clima/monitoreo-climatico", "servicios/inadhi"]:
    pagina(S + p)
O = "https://osc.org.bo/index.php/es/"
for p in ["27-sismicidad/51-boletin-sismico", "sismicidad/boletininformativo", "sismicidad/inforepor", "27-sismicidad/66-boletines"]:
    pagina(O + p, patron=r"\.(pdf|zip|csv|json|kml|xml|xls|xlsx)(\?|$)|boletin|sism|informe|evento|descarg")
# GDELT con espera (antes dio 429) y un único intento
time.sleep(20)
st, ct, d = get("https://api.gdeltproject.org/api/v2/doc/doc?query=Bolivia%20sourcelang:spanish&mode=artlist&maxrecords=5&format=json&timespan=1d")
out.append(f"GDELT: estado={st} bytes={len(d)} inicio={d[:300]!r}")
for u in ["https://simb.produccion.gob.bo/", "https://simb.produccion.gob.bo/simb/index.xhtml", "https://simb.produccion.gob.bo/simb/faces/index.xhtml"]:
    st, ct, d = get(u)
    out.append(f"SIMB {u}: estado={st} tipo={ct} bytes={len(d)}")
os.makedirs("docs", exist_ok=True)
open("docs/fuentes_prueba12.txt", "w", encoding="utf-8").write("\n".join(out))
print(len("\n".join(out)))

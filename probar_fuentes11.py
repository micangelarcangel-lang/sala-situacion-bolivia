# -*- coding: utf-8 -*-
"""Prueba 11: acceso desde GitHub a otras fuentes oficiales/abiertas. Solo lecturas públicas. Escribe docs/fuentes_prueba11.txt."""
import ssl, re, json, urllib.request, urllib.parse, datetime, os, time

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
hoy = datetime.date.today()
out = ["Prueba 11 fuentes - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(u, tls12=False, limite=1500000):
    err = ""
    for _ in range(2):
        c = ssl.create_default_context()
        if tls12:
            c.maximum_version = ssl.TLSVersion.TLSv1_2
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "*/*"}), timeout=45, context=c) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read(limite)
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Content-Type", "") if e.headers else "", b""
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:70]
            if "handshake" in err or "SSL" in err:
                c2 = True
                tls12 = True
    return err, "", b""


def enlaces(h, base, patron=None, n=60):
    xs = sorted(set(urllib.parse.urljoin(base, x.replace(" ", "%20")) for x in re.findall(r'href=["\']([^"\'#]+)["\']', h)))
    if patron:
        xs = [x for x in xs if re.search(patron, x, re.I)]
    return xs[:n]


def probar(u, patron=None, texto=False, tls12=False):
    st, ct, d = get(u, tls12)
    out.append(f"== {u}\n   estado={st} tipo={ct} bytes={len(d)}")
    if d and ("html" in ct or "xml" in ct or "json" in ct or "text" in ct):
        h = d.decode("utf-8", "ignore")
        if "html" in ct:
            for x in enlaces(h, u, patron):
                out.append("   - " + x)
        if texto:
            out.append("   inicio: " + re.sub(r"\s+", " ", h[:900]))
    return st, d


# 1) SENAMHI: menú completo del sitio (para ubicar sequía, incendios, focos de calor, etc.)
st, d = probar("https://senamhi.gob.bo/index.php", patron=r"index\.php/|focoscalor|boletines")
# 2) SENAMHI focos de calor: boletín diario más reciente (patrón de carpeta/archivo observado en 2023 y 2026)
meses = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]
for dd in range(0, 6):
    f = hoy - datetime.timedelta(days=dd)
    u = f"https://senamhi.gob.bo/focoscalor/{f.year}/FC_{f.month}_{meses[f.month-1]}_{f.year}/Pron_Focos_Bolivia_{f.strftime('%Y%m%d')}.pdf"
    st, ct, d = get(u, limite=100000)
    out.append(f"focos {f}: estado={st} tipo={ct} bytes={len(d)}")
out.append("")
# 3) Sismos: USGS (GeoJSON público) para Bolivia, últimos 7 días
q = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=-23&maxlatitude=-9&minlongitude=-70&maxlongitude=-57&minmagnitude=2.5&orderby=time&limit=20&starttime=" + (hoy - datetime.timedelta(days=30)).isoformat()
st, d = probar(q)
try:
    j = json.loads(d)
    out.append(f"   USGS: {len(j['features'])} sismos M>=2.5 en 30 días en la caja de Bolivia")
    for f in j["features"][:5]:
        p = f["properties"]
        out.append(f"   - M{p['mag']} {p['place']} {datetime.datetime.utcfromtimestamp(p['time']/1000)} alerta_pager={p.get('alert')}")
except Exception as e:
    out.append("   USGS sin JSON: " + str(e)[:60])
# 4) San Calixto
for u in ["https://osc.org.bo/", "https://www.osc.org.bo/", "https://osc.org.bo/sismicidad/"]:
    probar(u, patron=r"sism|boletin|senal|evento|descarg|csv|json|xml|api|catalog", texto=False)
# 5) VIDECI / Defensa Civil
for u in ["https://defensacivil.gob.bo/", "https://www.defensacivil.gob.bo/", "https://sinager.defensacivil.gob.bo/", "https://vidеci.gob.bo/".replace("е", "e")]:
    probar(u, patron=r"bolet|alerta|emergenc|reporte|sinager|pdf|api|ultim", texto=False)
# 6) Incendios: INPE queimadas (público) y NASA FIRMS (solo prueba de acceso, sin clave)
probar("https://queimadas.dgi.inpe.br/queimadas/dados-abertos/", patron=r"csv|json|geojson|api|focos", texto=False)
probar("https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/America_do_Sul/", patron=r"\.csv", texto=False)
probar("https://firms.modaps.eosdis.nasa.gov/api/area/", texto=True)
# 7) GDELT (prueba de noticias Bolivia)
probar("https://api.gdeltproject.org/api/v2/doc/doc?query=Bolivia%20inundacion%20sourcecountry:BL&mode=artlist&maxrecords=5&format=json&timespan=7d", texto=True)
# 8) SIMB (Sistema de Información de Monitoreo de Bosques/ ... ) y otros
probar("https://simb.produccion.gob.bo/simb/", patron=r"shp|zip|geojson|geoserver|wfs|wms|descarg|api", texto=False)
os.makedirs("docs", exist_ok=True)
open("docs/fuentes_prueba11.txt", "w", encoding="utf-8").write("\n".join(out))
print(len("\n".join(out)))

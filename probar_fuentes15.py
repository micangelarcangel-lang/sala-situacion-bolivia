# -*- coding: utf-8 -*-
"""Prueba 15: boletín epidemiológico del Ministerio de Salud (PDF), alertas OPS, brotes OMS y sequías (CIMA). Solo lecturas públicas. Escribe docs/fuentes_prueba15.txt."""
import ssl, re, io, json, urllib.request, urllib.parse, datetime, os

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CAB = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "es,en;q=0.8"}
out = ["Prueba 15 fuentes - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(u, limite=8000000):
    err = ""
    for tls12 in (False, True):
        c = ssl.create_default_context()
        if tls12:
            c.maximum_version = ssl.TLSVersion.TLSv1_2
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=CAB), timeout=90, context=c) as r:
                return r.status, r.headers.get("Content-Type", ""), r.headers.get("Content-Disposition", ""), r.read(limite)
        except urllib.error.HTTPError as e:
            return e.code, "", "", b""
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:70]
    return err, "", "", b""


# 1) Boletín epidemiológico MSyD: página -> enlace más reciente -> PDF -> texto
st, ct, cd, d = get("https://www.minsalud.gob.bo/9104-boletines-epidemiologicos-2026")
h = d.decode("utf-8", "ignore")
enl = re.findall(r'href="([^"]*jdownloads/send/71-boletines-epidemiologicos-semanal/(\d+)-boletin-epidemiologico-semana-epidemiologica-no-(\d+)[^"]*)"', h)
enl = sorted({(int(s), int(i), u) for u, i, s in enl}, reverse=True)
out.append(f"boletines listados: {len(enl)}; semanas: {[e[0] for e in enl[:5]]}")
# estructura de títulos y fechas en la página
for m in list(re.finditer(r"Boletín Epidemiológico - Semana Epidemiológica N° ?(\d+)", h))[:3]:
    out.append("   título en página: " + re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h[m.start():m.start() + 600]))[:300])
if enl:
    sem, idb, u = enl[0]
    u = urllib.parse.urljoin("https://www.minsalud.gob.bo/", u.replace("&amp;", "&"))
    st, ct, cd, d = get(u)
    out.append(f"PDF semana {sem}: {u}\n   estado={st} tipo={ct} disp={cd} bytes={len(d)} inicio={d[:5]!r}")
    if d[:4] == b"%PDF":
        try:
            from pypdf import PdfReader
            r = PdfReader(io.BytesIO(d))
            out.append(f"   páginas={len(r.pages)}")
            texto = "\n".join((p.extract_text() or "") for p in r.pages[:6])
            out.append("   texto (primeras páginas): " + re.sub(r"\s+", " ", texto)[:2500])
            todo = " ".join((p.extract_text() or "") for p in r.pages)
            for k in ("brote", "alerta", "incremento", "casos confirmados", "dengue", "sarampión", "fiebre amarilla", "rabia", "influenza aviar", "diarrea"):
                out.append(f"   '{k}': {len(re.findall(k, todo, re.I))} menciones")
        except Exception as e:
            out.append("   error leyendo PDF: " + str(e)[:100])
out.append("")

# 2) OPS: lista de alertas con fechas
st, ct, cd, d = get("https://www.paho.org/es/alertas-actualizaciones-epidemiologicas")
h = d.decode("utf-8", "ignore")
items = re.findall(r'<a[^>]+href="(/es/documentos/[^"]+)"[^>]*>(.*?)</a>', h, re.S)
out.append(f"== OPS: estado={st} items={len(items)}")
vistos = set()
for u, t in items:
    if u in vistos:
        continue
    vistos.add(u)
    out.append("   - " + re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)).strip()[:140] + " -> " + u)
    if len(vistos) >= 12:
        break
# fecha/estructura de una tarjeta
i = h.find("/es/documentos/")
out.append("   fragmento HTML de una tarjeta: " + re.sub(r"\s+", " ", h[max(0, i - 400):i + 900]))
out.append("")

# 3) OMS: brotes (API pública del sitio)
for u in ["https://www.who.int/api/news/diseaseoutbreaknews?sf_culture=en&$top=5&$orderby=PublicationDateAndTime%20desc&$select=Title,PublicationDateAndTime,UrlName,Summary",
          "https://www.who.int/rss-feeds/news-english.xml"]:
    st, ct, cd, d = get(u)
    out.append(f"== {u[:100]}\n   estado={st} tipo={ct} bytes={len(d)} inicio={d[:700]!r}")
out.append("")

# 4) Sequías: servidor CIMA que usa el monitor
for u in ["https://sequiasbolivia.cimafoundation.org", "https://sequiasbolivia.cimafoundation.org/api/", "https://bolivia.mydewetra.cimafoundation.org/api/"]:
    st, ct, cd, d = get(u, 400000)
    out.append(f"== {u}\n   estado={st} tipo={ct} bytes={len(d)} inicio={d[:400]!r}")
os.makedirs("docs", exist_ok=True)
open("docs/fuentes_prueba15.txt", "w", encoding="utf-8").write("\n".join(out))
print(len("\n".join(out)))

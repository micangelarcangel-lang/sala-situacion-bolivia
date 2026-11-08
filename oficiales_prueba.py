import re, io, urllib.request
UA = {"User-Agent": "Mozilla/5.0 sala-situacion/3"}
def get(u, t=60):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()
try:
    h = get("https://sena.senamhi.gob.bo/public/forecast-public-reports").decode("utf-8", "ignore"); print("== SENA iframe", len(h))
    t = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", h, flags=re.S); print("   TEXTO:", re.sub(r"\s+", " ", t)[:900])
    for m in list(re.finditer(r'(?i)(fetch|axios\.get|\$\.get|ajax|url:)\(?\s*[:"\']([^"\']+)', h))[:10]: print("   JS", m.group(2)[:140])
    for m in list(re.finditer(r'(?:href|src)="([^"]+\.(?:pdf|png|jpg|json|geojson)[^"]*)"', h))[:15]: print("   ARCH", m.group(1)[:150])
except Exception as e:
    print("ERR sena", type(e).__name__, str(e)[:100])
try:
    b = get("https://minsalud.gob.bo/component/jdownloads/send/71-boletines-epidemiologicos-semanal/1060-boletin-epidemiologico-semana-epidemiologica-no-41?Itemid=465")
    print("== MINSALUD SE41 bytes", len(b), b[:8])
    from pypdf import PdfReader
    r = PdfReader(io.BytesIO(b)); print("   paginas", len(r.pages))
    print("   TEXTO:", re.sub(r"\s+", " ", (r.pages[0].extract_text() or ""))[:1200])
except Exception as e:
    print("ERR minsalud", type(e).__name__, str(e)[:100])

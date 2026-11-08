import re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 sala-situacion/3"}
def get(u, t=40):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()
for u in ("https://minsalud.gob.bo/9104-boletines-epidemiologicos-2026", "https://senamhi.gob.bo/servicios/alerta-meteorologica", "https://senamhi.gob.bo/hidrologia/alertas", "https://senamhi.gob.bo/meteorologia/pronostico"):
    try:
        h = get(u).decode("utf-8", "ignore"); print("==", u, len(h))
        for m in list(re.finditer(r'href="([^"]+\.(?:pdf|xlsx?|csv|json|kml)[^"]*)"', h, re.I))[:12]:
            print("   DOC", m.group(1)[:150])
        txt = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", h, flags=re.S); txt = re.sub(r"\s+", " ", txt)
        print("   TEXTO:", txt[:500])
    except Exception as e:
        print("ERR", u, type(e).__name__, str(e)[:80])

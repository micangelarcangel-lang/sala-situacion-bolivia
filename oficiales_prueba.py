import re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 sala-situacion/3"}
def get(u, t=40):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read().decode("utf-8", "ignore")
h = get("https://minsalud.gob.bo/9104-boletines-epidemiologicos-2026")
print("== MINSALUD enlaces con boletin/epidem/semana")
for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h, re.S):
    t = re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip()
    if re.search(r"(?i)boletin|boletín|epidem|semana|SE ?\d|2026", t + m.group(1)) and "Descarga/RRHH" not in m.group(1):
        print("  ", t[:70], "->", m.group(1)[:140])
for u in ("https://senamhi.gob.bo/servicios/alerta-meteorologica", "https://senamhi.gob.bo/hidrologia/alertas", "https://senamhi.gob.bo/servicios/monitor-sequias"):
    try:
        h = get(u); print("== SENAMHI", u, len(h))
        urls = set(re.findall(r"""["'](https?://[^"']+|/[a-zA-Z0-9_\-/\.]+(?:api|json|geojson|data|wms|wfs|alerta|aviso)[^"']*)["']""", h))
        for x in sorted(urls)[:25]: print("   REF", x[:150])
        for m in list(re.finditer(r'(?i)(fetch|axios\.get|\$\.get|ajax)\(\s*["\']([^"\']+)', h))[:8]: print("   JS", m.group(2)[:140])
        iframes = re.findall(r'<iframe[^>]+src="([^"]+)"', h); print("   IFRAME", iframes[:5])
        imgs = re.findall(r'<img[^>]+src="([^"]+)"', h); print("   IMG", [i for i in imgs if re.search(r"(?i)alert|aviso|mapa|pronost", i)][:6])
    except Exception as e:
        print("ERR", u, type(e).__name__, str(e)[:80])

"""Explora fuentes oficiales públicas desde el runner: qué publican y en qué formato (solo lectura)."""
import re, urllib.request, json
UA = {"User-Agent": "Mozilla/5.0 sala-situacion/3"}
def get(u, t=30):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read().decode("utf-8", "ignore")
for base in ("https://www.senamhi.gob.bo/", "https://www.minsalud.gob.bo/"):
    try:
        h = get(base); print("==", base, len(h))
        for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h, re.S):
            t = re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip()
            if re.search(r"(?i)aviso|alerta|pron[oó]stico|boletin|boletín|sismo|helada|inundaci|epidemi|vigilancia|comunicado|sequ", t + m.group(1)):
                print("  ", t[:80], "->", m.group(1)[:120])
    except Exception as e:
        print("ERR", base, type(e).__name__, str(e)[:80])
try:
    j = json.loads(get("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=-23&maxlatitude=-9&minlongitude=-70&maxlongitude=-57&starttime=2026-10-01&minmagnitude=3&orderby=time&limit=5"))
    print("USGS", [(f["properties"]["place"], f["properties"]["mag"]) for f in j["features"]])
except Exception as e:
    print("USGS ERR", e)
try:
    j = json.loads(get("https://api.open-meteo.com/v1/forecast?latitude=-18.1&longitude=-64.9&daily=precipitation_sum,temperature_2m_max&past_days=14&forecast_days=3&timezone=America/La_Paz"))
    print("OPEN-METEO Omereque", j["daily"]["precipitation_sum"], j["daily"]["temperature_2m_max"][:5])
except Exception as e:
    print("OM ERR", e)

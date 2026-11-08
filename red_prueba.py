"""Qué servicios de IA y de coordenadas se alcanzan desde Actions (código, tipo y primeros bytes de la respuesta)."""
import urllib.request, urllib.error, json
HOSTS = [
         "https://www.senamhi.gob.bo/", "https://www.senamhi.gob.bo/index.php/sismet", "https://www.defensacivil.gob.bo/", "https://videci.gob.bo/", "https://www.minsalud.gob.bo/", "https://snis.minsalud.gob.bo/", "https://www.abi.bo/", "https://www.erbol.com.bo/", "https://eldeber.com.bo/rss", "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=1", "https://firms.modaps.eosdis.nasa.gov/", "https://api.open-meteo.com/v1/forecast?latitude=-16.5&longitude=-68.15&daily=precipitation_sum",

         "https://tile.openstreetmap.org/15/10179/17908.png", "https://a.basemaps.cartocdn.com/rastertiles/voyager/15/10179/17908.png",
         "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/15/17908/10179", "https://fonts.googleapis.com/css2?family=Inter", "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
"https://models.github.ai/catalog/models", "https://generativelanguage.googleapis.com/v1beta/models", "https://api.groq.com/openai/v1/models",
         "https://openrouter.ai/api/v1/models", "https://api.anthropic.com/v1/models", "https://api.openai.com/v1/models", "https://huggingface.co/api/models?limit=1",
         "https://nominatim.openstreetmap.org/search?q=El+Alto,+Bolivia&format=json&limit=1", "https://overpass-api.de/api/status", "https://news.google.com/rss/search?q=ciclista+El+Alto&hl=es-419&gl=BO&ceid=BO:es-419",
         "https://example.com/", "https://eldeber.com.bo/", "https://www.reduno.com.bo/"]
for u in HOSTS:
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 sala-situacion/3"}), timeout=25)
        b = r.read(200)
        print("OK ", r.status, r.headers.get("content-type", "")[:30], len(b), repr(b[:70]), u[:70])
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, repr(e.read(80)), u[:70])
    except Exception as e:
        print("ERR", type(e).__name__, str(e)[:70], u[:70])

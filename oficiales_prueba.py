import re, io, urllib.request
UA = {"User-Agent": "Mozilla/5.0 sala-situacion/3"}
def get(u, t=90):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()
from pypdf import PdfReader
for se, n in (("41", 1060), ("40", 1059)):
    try:
        b = get(f"https://minsalud.gob.bo/component/jdownloads/send/71-boletines-epidemiologicos-semanal/{n}-boletin-epidemiologico-semana-epidemiologica-no-{se}?Itemid=465")
        r = PdfReader(io.BytesIO(b)); print(f"== SE{se} paginas", len(r.pages))
        for i, pg in enumerate(r.pages):
            t = re.sub(r"[ \t]+", " ", pg.extract_text() or "")
            if re.search(r"(?i)influenza|IRAG|infecci[oó]n respiratoria|ETI\b|sars|virus respiratorio", t):
                print(f"--- pag {i + 1} ({len(t)} car.)"); print(t[:1800])
    except Exception as e:
        print("ERR", se, type(e).__name__, str(e)[:100])

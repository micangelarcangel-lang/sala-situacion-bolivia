# -*- coding: utf-8 -*-
"""Reporte rápido de evento (1 página) con mapa de ubicación aproximada y esquema ilustrativo. Uso: python reporte_evento.py datos/v3/eventos/<id>.json
Genera datos/v3/investigacion/EVENTO_<id>.pdf. Las fotos de prensa se enlazan con crédito; no se copian."""
import base64, io, json, math, os, sys, urllib.request, urllib.parse, subprocess, tempfile
from html import escape as E
from PIL import Image, ImageDraw
import boletin_html as BH
UA = BH.UA
def geocodifica(q):
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + urllib.parse.quote(q), headers={"User-Agent": UA}), timeout=20))
        if r: return float(r[0]["lat"]), float(r[0]["lon"]), "Nominatim/OpenStreetMap"
    except Exception: pass
    return None
def overpass(q):
    for host in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(host, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA, "Accept": "*/*"}), timeout=60))["elements"]
        except Exception as ex: print("overpass", host, ex)
    return []
def interseccion(calle, anillo, caja="-17.85,-63.35,-17.30,-62.95"):
    """punto medio entre el tramo de la calle más cercano al anillo; devuelve (lat, lon, descripcion, n_calle, n_anillo)"""
    A = overpass('[out:json][timeout:50];way["name"~"%s"](%s);out tags center 200;' % (calle, caja)); B = overpass('[out:json][timeout:50];way["name"~"%s"](%s);out tags center 200;' % (anillo, caja))
    c = lambda e: (e["center"]["lat"], e["center"]["lon"])
    print("calle", len(A), "anillo", len(B), [e["tags"].get("name") for e in B][:5])
    if not A or not B: return None
    best = min(((math.hypot(c(a)[0] - c(b)[0], c(a)[1] - c(b)[1]), a, b) for a in A for b in B), key=lambda t: t[0]); d, a, b = best
    return (c(a)[0] + c(b)[0]) / 2, (c(a)[1] + c(b)[1]) / 2, "OpenStreetMap (Overpass): cruce de tramos de %s y %s (separación %.0f m)" % (a["tags"].get("name"), b["tags"].get("name"), d * 111000), len(A), len(B)
def mapa(lat, lon, z, W, H, radio_m, base="calles"):
    """teselas alrededor del punto + círculo de incertidumbre; devuelve data URI y si hubo red"""
    zt = z + 1; cx, cy = [v * 512 for v in BH._xy(lat, lon, z)]; ox, oy = cx - W / 2, cy - H / 2
    img = Image.new("RGB", (W, H), "#e9edf2"); red = False
    for tx in range(int(ox // 256), int((ox + W) // 256) + 1):
        for ty in range(int(oy // 256), int((oy + H) // 256) + 1):
            for pl in BH.BASES_PL[base]:
                try:
                    t = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(pl.format(z=zt, x=tx, y=ty), headers={"User-Agent": UA, "Referer": "https://github.com/micangelarcangel-lang/sala-situacion-bolivia"}), timeout=20).read())).convert("RGB").resize((256, 256)); img.paste(t, (int(tx * 256 - ox), int(ty * 256 - oy))); red = True; break
                except Exception: continue
    mpp = 156543.03 * math.cos(math.radians(lat)) / (2 ** z) / 2  # m por px (teselas de 512)
    r = max(6, radio_m / mpp); d = ImageDraw.Draw(img, "RGBA")
    d.ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), fill=(210, 73, 31, 60), outline=(210, 73, 31, 255), width=3)
    d.ellipse((W / 2 - 7, H / 2 - 7, W / 2 + 7, H / 2 + 7), fill=(139, 26, 26, 255), outline=(255, 255, 255, 255), width=2)
    b = io.BytesIO(); img.save(b, "PNG"); return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), red
ESQUEMA = """<svg viewBox="0 0 420 250" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="10"><rect width="420" height="250" fill="#f3f5f8"/>
<rect x="0" y="196" width="420" height="38" fill="#9aa5b4"/><text x="12" y="219" fill="#fff" font-weight="700">Av. Banzer (vía principal)</text>
<rect x="60" y="30" width="250" height="150" fill="none" stroke="#d2491f" stroke-width="2" stroke-dasharray="6 4"/><text x="64" y="26" fill="#d2491f" font-weight="700">Cordón de seguridad policial (referencial)</text>
<polygon points="110,70 190,58 240,80 232,140 150,152 104,122" fill="#8b1a1a" opacity=".85"/><text x="134" y="108" fill="#fff" font-weight="700">Planta</text><text x="122" y="121" fill="#fff">estructura colapsada</text>
<circle cx="210" cy="96" r="12" fill="#f5b700" stroke="#fff" stroke-width="2"/><text x="226" y="94" font-weight="700">Zona de</text><text x="226" y="106" font-weight="700">búsqueda</text>
<rect x="268" y="150" width="34" height="22" rx="4" fill="#1d6fb8"/><text x="270" y="164" fill="#fff" font-size="9">Triaje</text>
<rect x="318" y="150" width="62" height="22" rx="4" fill="#2e9e5b"/><text x="321" y="164" fill="#fff" font-size="9">Ambulancias</text>
<path d="M300 180 L300 196" stroke="#2e9e5b" stroke-width="3"/><text x="330" y="60" font-size="9" fill="#5a6b80">Fuga de gas (hipótesis)</text><path d="M326 62 L246 82" stroke="#5a6b80" stroke-dasharray="3 3"/></svg>"""
def main(f):
    e = json.load(open(f, encoding="utf8")); g = (interseccion(e["calle"], e["anillo"]) or [None])[:3] if e.get("calle") else None
    g = g if g and g[0] else (geocodifica(e["geocodificar"]) or (e["lat_ref"], e["lon_ref"], "referencia aproximada (no se pudo geocodificar)"))
    lat, lon, src = g; m1, r1 = mapa(lat, lon, 11, 520, 250, e["radio_m"]); m2, r2 = mapa(lat, lon, 15, 520, 250, e["radio_m"])
    h = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), e["plantilla"]), encoding="utf8").read()
    for k, v in (("{{MAPA_CIUDAD}}", m1), ("{{MAPA_DETALLE}}", m2), ("{{ESQUEMA}}", ESQUEMA), ("{{FUENTE_GEO}}", E(src)), ("{{RED}}", "" if r1 and r2 else " (mapa base no disponible en este entorno)")): h = h.replace(k, v)
    os.makedirs("datos/v3/investigacion", exist_ok=True); tmp = tempfile.mkdtemp(); hp = os.path.join(tmp, "r.html"); open(hp, "w", encoding="utf8").write(h)
    import shutil
    exe = next((shutil.which(x) for x in ("google-chrome", "chromium", "chromium-browser") if shutil.which(x)), None)
    subprocess.run([exe, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", "--virtual-time-budget=4000", "--print-to-pdf=" + os.path.abspath(f"datos/v3/investigacion/EVENTO_{e['id']}.pdf"), "file://" + hp], check=True, timeout=120, capture_output=True)
    print("ok", lat, lon, src, r1, r2)
main(sys.argv[1])

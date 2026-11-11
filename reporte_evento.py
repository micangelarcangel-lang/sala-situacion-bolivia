# -*- coding: utf-8 -*-
"""Reporte rápido de evento: página 1 = reporte de situación (plantilla); página 2 = geolocalización con las instituciones de respuesta
más cercanas (salud, bomberos, policía, rescate) tomadas de OpenStreetMap, y códigos QR a las fuentes.
Uso: python reporte_evento.py datos/v3/eventos/<id>.json  →  datos/v3/investigacion/EVENTO_<id>.pdf (+ _instituciones.json)"""
import base64, io, json, math, os, re, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
from html import escape as E
from PIL import Image, ImageDraw, ImageFont
import boletin_html as BH
UA = "sala-situacion-bolivia/3 (vigilancia por fuentes abiertas; contacto: github.com/micangelarcangel-lang)"
def get(u, data=None, t=60):
    return urllib.request.urlopen(urllib.request.Request(u, data=data, headers={"User-Agent": UA, "Accept": "application/json"}), timeout=t).read()
def hav(a, b, c, d):
    p = math.pi / 180; x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2; return 12742 * math.asin(math.sqrt(x))
CAT = [("salud", "Salud", "#1d6fb8"), ("bomberos", "Bomberos", "#d2491f"), ("policia", "Policía", "#2e3a8c"), ("rescate", "Rescate / emergencias", "#2e9e5b")]
def clasifica(tags):
    n = (tags.get("name") or "") + " " + (tags.get("operator") or ""); a = tags.get("amenity", ""); h = tags.get("healthcare", ""); em = tags.get("emergency", "")
    if a == "fire_station" or re.search(r"bombero|fundasol", n, re.I): return "bomberos"
    if a == "police" or re.search(r"polic[ií]a|felcc|felcn|diprove|estaci[oó]n policial|comando", n, re.I): return "policia"
    if em in ("ambulance_station", "rescue_station") or re.search(r"cruz roja|defensa civil|rescate|sar\b|suma|emergencia", n, re.I): return "rescate"
    if a in ("hospital", "clinic", "doctors") or h in ("hospital", "clinic", "centre", "doctor") or re.search(r"hospital|cl[ií]nica|centro de salud|policl[ií]nico|puesto de salud|cns|caja nacional", n, re.I): return "salud"
    return None
def instituciones(lat, lon, radio_m=18000):
    out = []
    q = '[out:json][timeout:50];(nwr["amenity"~"^(hospital|clinic|fire_station|police)$"](around:%d,%f,%f);nwr["healthcare"~"hospital|centre|clinic"](around:%d,%f,%f);nwr["emergency"~"ambulance_station|rescue_station"](around:%d,%f,%f););out center tags 300;' % (radio_m, lat, lon, radio_m, lat, lon, radio_m, lat, lon)
    fuente = None
    for host in ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try:
            els = json.loads(get(host, urllib.parse.urlencode({"data": q}).encode(), 70))["elements"]; fuente = "OpenStreetMap (Overpass)"
            for e in els:
                c = (e.get("lat"), e.get("lon")) if e["type"] == "node" else (e["center"]["lat"], e["center"]["lon"]); k = clasifica(e["tags"])
                if k and e["tags"].get("name"): out.append({"cat": k, "nombre": e["tags"]["name"], "lat": c[0], "lon": c[1], "dir": e["tags"].get("addr:street", "")})
            break
        except Exception as ex: print("overpass", host, str(ex)[:80])
    if not out:  # respaldo: Nominatim por palabra clave dentro de un cuadro alrededor del punto
        d = radio_m / 111000.0; vb = "%f,%f,%f,%f" % (lon - d, lat + d, lon + d, lat - d)
        for term in ("hospital", "clínica", "centro de salud", "bomberos", "policía", "estación policial", "cruz roja", "defensa civil"):
            try:
                for r in json.loads(get("https://nominatim.openstreetmap.org/search?format=json&limit=20&bounded=1&viewbox=%s&q=%s" % (vb, urllib.parse.quote(term)))):
                    k = clasifica({"name": r.get("name") or r.get("display_name", "")[:80], "amenity": r.get("type", "")}) or ("salud" if "hospital" in term or "clín" in term or "salud" in term else "bomberos" if "bombero" in term else "policia" if "polic" in term else "rescate")
                    out.append({"cat": k, "nombre": (r.get("name") or r.get("display_name", "").split(",")[0]), "lat": float(r["lat"]), "lon": float(r["lon"]), "dir": ""})
                fuente = "OpenStreetMap (Nominatim)"
            except Exception as ex: print("nominatim", term, str(ex)[:80])
            time.sleep(1.2)
    vis = {}
    for o in out:
        o["km"] = hav(lat, lon, o["lat"], o["lon"]); key = (o["cat"], re.sub(r"\W+", "", o["nombre"].lower())[:24])
        if key not in vis or o["km"] < vis[key]["km"]: vis[key] = o
    return sorted(vis.values(), key=lambda o: o["km"]), fuente
def mapa(lat, lon, z, W, H, radio_m, puntos=(), base="calles"):
    zt = z + 1; cx, cy = [v * 512 for v in BH._xy(lat, lon, z)]; ox, oy = cx - W / 2, cy - H / 2
    img = Image.new("RGB", (W, H), "#e9edf2"); red = False
    for tx in range(int(ox // 256), int((ox + W) // 256) + 1):
        for ty in range(int(oy // 256), int((oy + H) // 256) + 1):
            for pl in BH.BASES_PL[base]:
                try:
                    t = Image.open(io.BytesIO(get(pl.format(z=zt, x=tx, y=ty), None, 20))).convert("RGB").resize((256, 256)); img.paste(t, (int(tx * 256 - ox), int(ty * 256 - oy))); red = True; break
                except Exception: continue
    mpp = 156543.03 * math.cos(math.radians(lat)) / (2 ** z) / 2; r = radio_m / mpp; d = ImageDraw.Draw(img, "RGBA")
    d.ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), fill=(210, 73, 31, 45), outline=(210, 73, 31, 255), width=3)
    try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
    except Exception: f = ImageFont.load_default()
    for p in puntos:
        px = p["lon"]; py = p["lat"]; x, y = [v * 512 for v in BH._xy(py, px, z)]; x -= ox; y -= oy
        if 8 < x < W - 8 and 8 < y < H - 8:
            d.ellipse((x - 11, y - 11, x + 11, y + 11), fill=p["color"], outline=(255, 255, 255, 255), width=2); d.text((x, y), str(p["n"]), fill="white", font=f, anchor="mm")
    d.ellipse((W / 2 - 9, H / 2 - 9, W / 2 + 9, H / 2 + 9), fill=(139, 26, 26, 255), outline=(255, 255, 255, 255), width=3)
    b = io.BytesIO(); img.save(b, "PNG"); return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), red
def qr(url):
    s = BH.qr_svg(url); return s
def pagina_geo(e, lat, lon, src, inst, fuente_inst):
    sel = []; n = 0
    for k, nom, col in CAT:
        for o in [o for o in inst if o["cat"] == k][:e.get("max_por_categoria", 4)]: n += 1; o = dict(o, n=n, color=col, nomcat=nom); sel.append(o)
    mp, red = mapa(lat, lon, 11, 1060, 470, e["radio_m"], sel)
    filas = "".join('<tr><td><span class="pn" style="background:%s">%d</span></td><td>%s</td><td>%s</td><td style="text-align:right">%.1f km</td></tr>' % (o["color"], o["n"], E(o["nomcat"]), E(o["nombre"]), o["km"]) for o in sel)
    leyenda = "".join('<span class="lg"><i style="background:%s"></i>%s</span>' % (c, nm) for k, nm, c in CAT)
    qrs = "".join('<div class="q"><div class="qs">%s</div><div><b>%s</b><br><span>%s</span></div></div>' % (qr(f["url"]), E(f["medio"]), E(f["titulo"][:70])) for f in e.get("fuentes", []))
    return mp, red, '<div class="pg2"><div class="top">CENTRO COORDINADOR DE EMERGENCIAS EN SALUD · SALA DE SITUACIÓN BOLIVIA · GEOLOCALIZACIÓN DEL EVENTO</div><h2 style="margin-top:12px">Geolocalización y capacidad de respuesta cercana</h2><div class="mpf"><img src="%s"></div><div class="lgs">%s<span class="lg"><i class="ev"></i>Ubicación estimada del evento (círculo = incertidumbre)</span></div><p class="nt">Ubicación: %s. Distancias en línea recta desde el punto estimado, no por ruta; sirven para priorizar, no para calcular tiempos. Instituciones tomadas de %s; pueden faltar o estar desactualizadas: validar con el SEDES y el COE departamental.</p><table><tr><th>N.º</th><th>Tipo</th><th>Institución</th><th>Distancia</th></tr>%s</table><h2>Códigos QR a las fuentes</h2><div class="qrs">%s</div></div>' % (mp, leyenda, E(src), E(fuente_inst or "OpenStreetMap"), filas or '<tr><td colspan="4">No se pudo obtener instituciones cercanas en este momento.</td></tr>', qrs), sel
def main(f):
    e = json.load(open(f, encoding="utf8")); lat, lon, src = e["lat_ref"], e["lon_ref"], e["fuente_ref"]
    inst, fuente_inst = instituciones(lat, lon); mp, red, geo, sel = pagina_geo(e, lat, lon, src, inst, fuente_inst)
    h = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), e["plantilla"]), encoding="utf8").read().replace("{{GEO}}", geo)
    os.makedirs("datos/v3/investigacion", exist_ok=True); json.dump({"punto": [lat, lon], "fuente_punto": src, "fuente_instituciones": fuente_inst, "instituciones": sel, "todas": inst[:60]}, open(f"datos/v3/investigacion/EVENTO_{e['id']}_instituciones.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    tmp = tempfile.mkdtemp(); hp = os.path.join(tmp, "r.html"); open(hp, "w", encoding="utf8").write(h)
    exe = next((shutil.which(x) for x in ("google-chrome", "chromium", "chromium-browser") if shutil.which(x)), None)
    subprocess.run([exe, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", "--virtual-time-budget=4000", "--print-to-pdf=" + os.path.abspath(f"datos/v3/investigacion/EVENTO_{e['id']}.pdf"), "file://" + hp], check=True, timeout=120, capture_output=True)
    print("ok", len(inst), fuente_inst, red)
main(sys.argv[1])

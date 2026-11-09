# -*- coding: utf-8 -*-
"""Boletín de situación en HTML/CSS → PDF con Chrome (tipografía Inter, mapa con calles de CARTO/OpenStreetMap, QR a la fuente de la foto).
Entrada: el mismo dict B que usa boletin_v3. Si no hay red para las teselas, dibuja una cuadrícula neutra y lo avisa en el pie del mapa."""
import base64, io, json, math, os, shutil, subprocess, tempfile, urllib.request, datetime as dt
from html import escape as E

AZ, RJ, VD, AM, GR = "#0b3d6e", "#c0392b", "#1e8c5a", "#b7791f", "#5b6b7a"
UA = "Mozilla/5.0 sala-situacion-bolivia/3 (vigilancia por fuentes abiertas)"
AQUI = os.path.dirname(os.path.abspath(__file__))


def _xy(lat, lon, z):
    n = 2 ** z; x = (lon + 180) / 360 * n; y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n; return x, y


def mapa_base(pts, ancho=900, alto=720):
    if len(pts) < 1: raise ValueError
    """Une teselas CARTO 'Voyager' (OpenStreetMap) que cubren los puntos. Devuelve (data_uri, [(px,py)...], hubo_red)."""
    from PIL import Image, ImageDraw
    la = [p["lat"] for p in pts]; lo = [p["lon"] for p in pts]
    z = 17 if len(pts) > 1 else 12
    while z > 3 and len(pts) > 1:
        x0, y1 = _xy(min(la), min(lo), z); x1, y0 = _xy(max(la), max(lo), z)
        if (x1 - x0) * 512 < ancho * .62 and (y1 - y0) * 512 < alto * .62: break
        z -= 1
    cx = (_xy(min(la), min(lo), z)[0] + _xy(max(la), max(lo), z)[0]) / 2; cy = (_xy(min(la), min(lo), z)[1] + _xy(max(la), max(lo), z)[1]) / 2
    zt = z + 1  # teselas de 256 px a zoom z+1 = misma escala que 512 px a zoom z
    ox, oy = cx * 512 - ancho / 2, cy * 512 - alto / 2
    img = Image.new("RGB", (ancho, alto), "#e9edf2"); red = False
    plantillas = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"]
    for tx in range(int(ox // 256), int((ox + ancho) // 256) + 1):
        for ty in range(int(oy // 256), int((oy + alto) // 256) + 1):
            t = None
            for pl in plantillas:
                try:
                    if os.environ.get("MAPA_OFFLINE"): raise OSError
                    t = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(pl.format(z=zt, x=tx, y=ty), headers={"User-Agent": UA, "Referer": "https://github.com/micangelarcangel-lang/sala-situacion-bolivia"}), timeout=20).read())).convert("RGB").resize((256, 256)); red = True; break
                except Exception:
                    t = None
            if t is None:
                t = Image.new("RGB", (256, 256), "#e9edf2"); d = ImageDraw.Draw(t)
                for k in range(0, 256, 32): d.line([(k, 0), (k, 256)], fill="#d5dbe3"); d.line([(0, k), (256, k)], fill="#d5dbe3")
            img.paste(t, (int(tx * 256 - ox), int(ty * 256 - oy)))
    b = io.BytesIO(); img.save(b, "PNG", optimize=True)
    px = [(_xy(p["lat"], p["lon"], z)[0] * 512 - ox, _xy(p["lat"], p["lon"], z)[1] * 512 - oy) for p in pts]
    m_por_px = 156543.03392 * math.cos(math.radians(sum(la) / len(la))) / (2 ** z) / 2
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), px, red, m_por_px


def _hav(a, b):
    R = 6371; p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1] - a[1]); dp = p2 - p1
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


def svg_mapa(pts, ancho=900, alto=720, tipo='versiones'):
    uri, px, red, mpp = mapa_base(pts, ancho, alto)
    s = [f'<svg viewBox="0 0 {ancho} {alto}" xmlns="http://www.w3.org/2000/svg"><image href="{uri}" width="{ancho}" height="{alto}"/>']
    A = [i for i, p in enumerate(pts) if p.get("version", "A") == "A"]; B = [i for i, p in enumerate(pts) if p.get("version") == "B"]
    if A and B and tipo == 'versiones':
        a = (sum(px[i][0] for i in A) / len(A), sum(px[i][1] for i in A) / len(A)); b = (sum(px[i][0] for i in B) / len(B), sum(px[i][1] for i in B) / len(B))
        d = _hav((sum(pts[i]["lat"] for i in A) / len(A), sum(pts[i]["lon"] for i in A) / len(A)), (sum(pts[i]["lat"] for i in B) / len(B), sum(pts[i]["lon"] for i in B) / len(B)))
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        s.append(f'<line x1="{a[0]:.0f}" y1="{a[1]:.0f}" x2="{b[0]:.0f}" y2="{b[1]:.0f}" stroke="#222" stroke-width="3" stroke-dasharray="9 7"/>')
        s.append(f'<g transform="translate({mx:.0f},{my:.0f})"><rect x="-78" y="-17" width="156" height="34" rx="17" fill="#fff8e1" stroke="#d9b24a"/><text y="6" text-anchor="middle" font-size="17" font-weight="700" fill="#333">{d:.1f} km entre versiones</text></g>')
    for i, p in enumerate(pts):
        c = RJ if p.get("version") == "B" else AZ; x, y = px[i]
        s.append(f'<g transform="translate({x:.0f},{y:.0f})"><circle r="21" fill="{c}" opacity=".18"/><circle r="10" fill="{c}" stroke="#fff" stroke-width="3.5"/></g>')
        w = 11 * len(p["nombre"]) + 20; lx = x + 16 if x + 16 + w < ancho else x - 16 - w; ly = y - 40 if y > 60 else y + 18
        s.append(f'<g transform="translate({lx:.0f},{ly:.0f})"><rect width="{w}" height="28" rx="6" fill="#fff" stroke="{c}" stroke-width="1.6"/><text x="10" y="19.5" font-size="15.5" font-weight="600" fill="#1b2430">{E(p["nombre"])}</text></g>')
    bar = 1000 / mpp
    s.append(f'<g transform="translate(24,{alto - 34})"><rect x="-8" y="-10" width="{bar + 56:.0f}" height="34" rx="6" fill="#fff" opacity=".85"/><rect width="{bar:.0f}" height="6" fill="#222"/><text x="{bar + 8:.0f}" y="8" font-size="14" fill="#222" font-weight="600">1 km</text></g>')
    s.append(f'<text x="{ancho - 10}" y="{alto - 8}" text-anchor="end" font-size="11" fill="#444" opacity=".85">© OpenStreetMap contributors</text></svg>')
    return "".join(s), red


def qr_svg(url):
    import qrcode, qrcode.image.svg
    im = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=0)
    b = io.BytesIO(); im.save(b); t = b.getvalue().decode()
    return t[t.index("<svg"):].replace('width="', 'data-w="', 1).replace('height="', 'data-h="', 1)


def svg_lluvia(L):
    mm = L["mm"]; n = len(mm); W_, H_ = 1000, 230; mx = max(max(mm), 10); bw = (W_ - 60) / n
    s = [f'<svg viewBox="0 0 {W_} {H_}" xmlns="http://www.w3.org/2000/svg"><rect width="{W_}" height="{H_}" fill="#f6f8fb" rx="8"/>']
    for k in (0, .5, 1):
        y = 25 + (H_ - 70) * (1 - k); s.append(f'<line x1="50" x2="{W_ - 10}" y1="{y:.0f}" y2="{y:.0f}" stroke="#dde3ea"/><text x="44" y="{y + 5:.0f}" text-anchor="end" font-size="14" fill="#6b7785">{mx * k:.0f}</text>')
    for i, v in enumerate(mm):
        h = (H_ - 70) * v / mx; s.append(f'<rect x="{55 + i * bw:.1f}" y="{25 + (H_ - 70) - h:.1f}" width="{bw - 3:.1f}" height="{max(h, 1):.1f}" fill="#2a78d6" rx="2"/>')
    for i in (0, n // 2, n - 1):
        s.append(f'<text x="{55 + i * bw:.0f}" y="{H_ - 28}" font-size="14" fill="#6b7785">{L["fechas"][i][8:]}/{L["fechas"][i][5:7]}</text>')
    s.append(f'<text x="50" y="14" font-size="14" fill="#6b7785">mm por día</text></svg>')
    return "".join(s)


def svg_esquema(vehiculo):
    f = 11 if len(vehiculo) < 17 else 8.5
    return f'''<svg viewBox="0 0 1000 150" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="150" fill="#e4e8ee" rx="8"/><rect y="6" width="1000" height="9" fill="#b9c2cf"/><rect y="135" width="1000" height="9" fill="#b9c2cf"/>
<g stroke="#fff" stroke-width="4" stroke-dasharray="40 30"><line x1="0" y1="75" x2="1000" y2="75"/></g>
<rect x="90" y="30" width="330" height="36" rx="5" fill="#5d7186" stroke="#fff" stroke-width="2"/><rect x="90" y="30" width="80" height="36" rx="5" fill="#34455a"/><text x="295" y="53" text-anchor="middle" fill="#fff" font-size="{f*1.4}" font-weight="700">{E(vehiculo)}</text>
<path d="M430 48 H600" stroke="#5d7186" stroke-width="5" marker-end="url(#f)"/><defs><marker id="f" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="#5d7186"/></marker></defs>
<circle cx="700" cy="108" r="13" fill="none" stroke="{AZ}" stroke-width="4"/><circle cx="760" cy="108" r="13" fill="none" stroke="{AZ}" stroke-width="4"/><path d="M700 108 L730 88 L760 108 M730 88 L722 88" stroke="{AZ}" stroke-width="4" fill="none"/>
<text x="730" y="140" text-anchor="middle" fill="{AZ}" font-size="15" font-weight="700">CICLISTA</text>
<circle cx="650" cy="78" r="30" fill="none" stroke="{RJ}" stroke-width="3" stroke-dasharray="6 5"/><text x="650" y="40" text-anchor="middle" fill="{RJ}" font-size="14" font-weight="600">punto de impacto: no confirmado</text></svg>'''


CSS = """
@font-face{font-family:Inter;src:url('FUENTES/Inter-Regular.otf');font-weight:400}@font-face{font-family:Inter;src:url('FUENTES/Inter-SemiBold.otf');font-weight:600}@font-face{font-family:Inter;src:url('FUENTES/Inter-Bold.otf');font-weight:700}
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font:400 9.6pt/1.45 Inter,sans-serif;color:#1b2430}
.pg{width:210mm;height:297mm;padding:0 12mm 11mm;position:relative;overflow:hidden;page-break-after:always}
.top{margin:0 -12mm 6mm;background:#0b3d6e;color:#fff;height:12mm;display:flex;align-items:center;justify-content:space-between;padding:0 12mm;font-size:7pt;letter-spacing:.02em;white-space:nowrap}
.top b{font-weight:700}.pie{position:absolute;left:12mm;right:12mm;bottom:6mm;font-size:6.8pt;color:#6b7785;display:flex;justify-content:space-between;border-top:1px solid #dfe4ea;padding-top:2mm}
h1{font-size:22pt;line-height:1.1;margin:0;color:#0b3d6e;letter-spacing:-.01em}h1+div{font-size:11pt;font-weight:600;margin:1.5mm 0 4mm}
h2{font-size:7.6pt;letter-spacing:.09em;text-transform:uppercase;color:#0b3d6e;margin:0 0 2mm;font-weight:700}
.meta{display:flex;gap:0;background:#eef3f9;border-left:3px solid #0b3d6e;border-radius:3px}.meta div{flex:1;padding:2.2mm 3mm}.meta small{display:block;font-size:6.4pt;letter-spacing:.07em;color:#5b6b7a}.meta b{font-size:9.4pt}
.sint{font-size:10.4pt;line-height:1.5;margin:4mm 0}.kpis{display:flex;border-top:1px solid #dfe4ea;border-bottom:1px solid #dfe4ea;margin-bottom:4.5mm}.kpis div{flex:1;text-align:center;padding:3mm 0}.kpis b{display:block;font-size:17pt;color:#0b3d6e;line-height:1.1}.kpis small{font-size:7pt;color:#5b6b7a}
.g{display:grid;grid-template-columns:1.75fr 1fr;gap:5mm}.map{border:1px solid #cfd6df;border-radius:6px;overflow:hidden}.map svg{display:block;width:100%;height:auto}
.nota{font-size:6.8pt;color:#6b7785;line-height:1.35;margin-top:1.6mm}.card{border:1px solid #dfe4ea;border-radius:6px;padding:4mm;background:#fafbfd}.card .n{font-size:13pt;font-weight:700;color:#0b3d6e;line-height:1.15}.card .d{margin:1.5mm 0 3mm;font-size:8.6pt}
.mapw svg{max-height:82mm;width:auto;max-width:100%;display:block;margin:0 auto}.qr svg{width:26mm;height:26mm;display:block}.esq{margin-top:4.5mm}.esq svg{width:100%;height:auto;display:block}
table{border-collapse:collapse;width:100%;font-size:8pt}th{background:#0b3d6e;color:#fff;text-align:left;font-size:6.9pt;letter-spacing:.06em;padding:2mm 2.6mm;font-weight:700;text-transform:uppercase}td{padding:1.3mm 2.6mm;border-bottom:1px solid #e1e6ec;vertical-align:top}td.k{font-weight:600;white-space:nowrap}
.ok{color:#1e8c5a;font-weight:600}.pe{color:#b7791f;font-weight:600}.di{color:#c0392b;font-weight:600}.sec{margin-top:5mm}
.fu{max-height:22mm;overflow:hidden;columns:4;column-gap:5mm;font-size:6.2pt;color:#44505e;line-height:1.4}.met{font-size:7pt;color:#6b7785;margin-bottom:1.5mm}
"""


def estado(s):
    l = s.lower()
    return "di" if "discrep" in l else ("pe" if ("pendiente" in l or "sin dato" in l) else "ok")


def svg_curva(curva, W_=1000, H_=230):
    xs = [c[0] for c in curva]; ys = [c[1] for c in curva]; mx = max(ys) * 1.15; mn = min(ys) * .8
    X = lambda i: 70 + i * (W_ - 110) / max(1, len(curva) - 1); Y = lambda v: 30 + (H_ - 80) * (1 - (v - mn) / (mx - mn))
    s = [f'<svg viewBox="0 0 {W_} {H_}" xmlns="http://www.w3.org/2000/svg"><rect width="{W_}" height="{H_}" fill="#f6f8fb" rx="8"/>']
    for k in (0, .5, 1):
        v = mn + (mx - mn) * k; y = Y(v); s.append(f'<line x1="60" x2="{W_ - 20}" y1="{y:.0f}" y2="{y:.0f}" stroke="#dde3ea"/><text x="54" y="{y + 5:.0f}" text-anchor="end" font-size="15" fill="#6b7785">{v / 1000:.0f} mil</text>')
    pts = " ".join(f"{X(i):.0f},{Y(v):.0f}" for i, v in enumerate(ys))
    s.append(f'<polyline points="{pts}" fill="none" stroke="#2a78d6" stroke-width="4" stroke-linejoin="round"/>')
    for i, (se, v) in enumerate(curva):
        last = i == len(curva) - 1
        s.append(f'<circle cx="{X(i):.0f}" cy="{Y(v):.0f}" r="{8 if last else 5}" fill="{"#c0392b" if last else "#2a78d6"}" stroke="#fff" stroke-width="2.5"/><text x="{X(i):.0f}" y="{H_ - 26}" text-anchor="middle" font-size="15" fill="#44505e">SE {se}</text>')
        s.append(f'<text x="{X(i):.0f}" y="{Y(v) - 14:.0f}" text-anchor="middle" font-size="{16 if last else 14}" font-weight="{700 if last else 400}" fill="#1b2430">{v:,.0f}</text>'.replace(",", "."))
    return "".join(s) + "</svg>"


def svg_mapa_deptos(dep, W_=520):
    """Mapa coroplético: color = tasa semanal de la última semana; etiqueta = nombre y tasa; borde grueso si subió más de 5%."""
    import unicodedata
    n_ = lambda t: "".join(c for c in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(c) != "Mn")
    g = json.load(open(os.path.join(AQUI, "docs/geo_dep.geojson"), encoding="utf-8")); pol = lambda f: [f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"]
    allp = [pt for f in g["features"] for q in pol(f) for pt in q[0]]; lo0, lo1 = min(p[0] for p in allp), max(p[0] for p in allp); la0, la1 = min(p[1] for p in allp), max(p[1] for p in allp)
    k = math.cos(math.radians((la0 + la1) / 2)); H_ = W_ * (la1 - la0) / ((lo1 - lo0) * k)
    X = lambda lo: (lo - lo0) / (lo1 - lo0) * W_; Y = lambda la: (la1 - la) / (la1 - la0) * H_
    por = {n_(d["depto"]): d for d in dep}; mx = max(d["tasa41"] for d in dep); mn = min(d["tasa41"] for d in dep)
    def color(v):
        t = (v - mn) / max(mx - mn, 1e-9); a = (254, 240, 217); b = (179, 0, 0); m = (252, 141, 89)
        c = [a[i] + (m[i] - a[i]) * t / .5 for i in range(3)] if t < .5 else [m[i] + (b[i] - m[i]) * (t - .5) / .5 for i in range(3)]
        return "#%02x%02x%02x" % tuple(int(x) for x in c)
    s = [f'<svg viewBox="0 0 {W_} {H_:.0f}" xmlns="http://www.w3.org/2000/svg">']; rot = []
    for f in g["features"]:
        d = por.get(n_(f["properties"]["n"])); sube = d and d["tasa41"] > d["tasa40"] * 1.05
        for q in pol(f):
            s.append(f'<polygon points="{" ".join(f"{X(a):.1f},{Y(b):.1f}" for a, b in q[0])}" fill="{color(d["tasa41"]) if d else "#e5e9ee"}" stroke="{"#222" if sube else "#fff"}" stroke-width="{2.4 if sube else 1.2}" stroke-linejoin="round"/>')
        big = max(pol(f), key=lambda q: len(q[0]))[0]; cx = sum(p[0] for p in big) / len(big); cy = sum(p[1] for p in big) / len(big)
        if d:
            lum = sum(int(color(d["tasa41"])[i:i + 2], 16) for i in (1, 3, 5)) / 3; tc = "#fff" if lum < 150 else "#1b2430"
            rot.append(f'<text x="{X(cx):.0f}" y="{Y(cy) - 2:.0f}" text-anchor="middle" font-size="14" font-weight="700" fill="{tc}">{E(d["depto"].replace("Santa Cruz", "S. Cruz").replace("Cochabamba", "Cbba."))}</text><text x="{X(cx):.0f}" y="{Y(cy) + 14:.0f}" text-anchor="middle" font-size="14" fill="{tc}">{str(d["tasa41"]).replace(".", ",")}</text>')
    s += rot
    for i, v in enumerate([mn, (mn + mx) / 2, mx]):
        s.append(f'<rect x="{10 + i * 56}" y="{H_ - 34:.0f}" width="56" height="12" fill="{color(v)}"/><text x="{10 + i * 56 + 28}" y="{H_ - 8:.0f}" text-anchor="middle" font-size="12" fill="#44505e">{str(round(v, 1)).replace(".", ",")}</text>')
    return "".join(s) + "</svg>"


def svg_deptos(dep):
    mx = max(max(d["tasa41"], d["tasa40"]) for d in dep) * 1.1; H_ = 38 * len(dep) + 20
    s = [f'<svg viewBox="0 0 560 {H_}" xmlns="http://www.w3.org/2000/svg">']
    for i, d in enumerate(dep):
        y = 12 + i * 38; w = 330 * d["tasa41"] / mx; w0 = 330 * d["tasa40"] / mx; c = "#c0392b" if d["tasa41"] > d["tasa40"] * 1.05 else ("#1e8c5a" if d["tasa41"] < d["tasa40"] * .95 else "#2a78d6")
        flecha = "▲" if d["tasa41"] > d["tasa40"] * 1.05 else ("▼" if d["tasa41"] < d["tasa40"] * .95 else "■")
        s.append(f'<text x="0" y="{y + 19}" font-size="15" font-weight="600" fill="#1b2430">{E(d["depto"])}</text><rect x="110" y="{y + 3}" width="{w:.0f}" height="22" fill="{c}" rx="3"/>'
                 f'<line x1="{110 + w0:.0f}" x2="{110 + w0:.0f}" y1="{y - 1}" y2="{y + 29}" stroke="#222" stroke-width="3"/>'
                 f'<text x="{110 + max(w, w0) + 8:.0f}" y="{y + 19}" font-size="15" fill="#1b2430">{str(round(d["tasa41"], 1)).replace(".", ",")} {flecha}</text>')
    return "".join(s) + "</svg>"


def html_epi(B):
    cab = '<div class="top"><b>CENTRO COORDINADOR DE EMERGENCIAS EN SALUD · SALA DE SITUACIÓN BOLIVIA</b><span>Vigilancia epidemiológica · fuente oficial</span></div>'
    pie = lambda n: f'<div class="pie"><span>Cifras leídas del boletín oficial del Ministerio de Salud y Deportes. Verificar contra el documento original.</span><span>{E(B["codigo"])} · pág. {n}</span></div>'
    tb = "".join(f'<tr><td class="k">{E(d["depto"])}</td><td>{d["casos39"]:,.0f}</td><td>{d["casos40"]:,.0f}</td><td><b>{d["casos41"]:,.0f}</b></td><td>{str(d["tasa41"]).replace(".", ",")}</td><td class="{"di" if d["casos41"] > d["casos40"] * 1.05 else ("ok" if d["casos41"] < d["casos40"] * .95 else "")}">{(d["casos41"] - d["casos40"]) / d["casos40"] * 100:+.0f}%</td></tr>'.replace(",", "·").replace("·", ".", 0) for d in B["deptos"])
    tb = tb.replace("·", ".")
    vac = ""
    if B.get("vacuna"):
        V = B["vacuna"]; vac = f'<div class="card"><div class="n">{V["a"]:,.0f}</div><div class="d">dosis de vacuna antiinfluenza aplicadas en 2026 (+{V["adicionales"]:,.0f} en la semana)</div></div>'.replace(",", ".")
    p1 = f'''<div class="pg">{cab}<h1>SITUACIÓN EPIDEMIOLÓGICA</h1><div>{E(B["titulo"])}</div>
<div class="meta">{"".join(f"<div><small>{E(k)}</small><b>{E(v)}</b></div>" for k, v in B["meta"])}</div>
<div class="sint">{E(B["sintesis"])}</div><div class="kpis">{"".join(f"<div><b>{E(a)}</b><small>{E(b)}</small></div>" for a, b in B["kpis"])}</div>
<h2>Casos semanales de IRA en el país</h2><div class="map" style="border:0">{svg_curva(B["curva"])}</div><div class="nota">Punto rojo: última semana. Fuente: Boletín Epidemiológico semanal (SUIS).</div>
<div class="g" style="margin-top:5mm;grid-template-columns:1fr 1.05fr;gap:6mm"><div><h2>Mapa · tasa semanal por 1.000 hab.</h2><div class="mapw">{svg_mapa_deptos(B["deptos"])}</div><div class="nota">Más oscuro = mayor tasa. Borde negro: subió más de 5% frente a la semana anterior. Datos oficiales por departamento.</div></div><div><h2>Ranking y cambio</h2>{svg_deptos(B["deptos"])}<div class="nota">Barra: semana actual. Línea negra: semana anterior. ▲ sube más de 5% · ▼ baja más de 5%.</div></div></div>{pie(1)}</div>'''
    p2 = f'''<div class="pg">{cab}<h2>Vacunación y virus</h2><div class="g" style="grid-template-columns:1fr 1fr;margin-bottom:5mm">{vac}<div class="card"><div class="d" style="margin:0;font-size:9.6pt">{E(B.get("virus") or "Sin dato de circulación viral en este boletín.")}</div></div></div><h2>Casos de IRA por departamento · últimas tres semanas</h2><table><tr><th>Departamento</th><th>SE {B["curva"][-1][0] - 2}</th><th>SE {B["curva"][-1][0] - 1}</th><th>SE {B["curva"][-1][0]}</th><th>Tasa SE {B["curva"][-1][0]}</th><th>Cambio</th></tr>{tb}</table>
<div class="sec"><h2>Fuentes y método</h2><div class="met">{E(B["metodo"])}</div><div class="fu">{"<br>".join(E(n) for n, _ in B["fuentes"])}</div><div class="met" style="margin-top:2mm;word-break:break-all">Documento original: {E(B["url"])}</div></div>{pie(2)}</div>'''
    return f'<!doctype html><html lang="es"><meta charset="utf-8"><style>{CSS.replace("FUENTES", AQUI + "/fuentes")}</style><body>{p1}{p2}</body></html>'


def svg_sismos(ev, W_=900, H_=720):
    """Mapa de epicentros: tamaño = magnitud, color = profundidad (somero rojo, intermedio naranja, profundo azul)."""
    gm = json.load(open(os.path.join(AQUI, "docs/geo_dep.geojson"), encoding="utf-8"))
    esq = [{"lat": -23.5, "lon": -70.5}, {"lat": -8.5, "lon": -56.5}]
    uri, px, red, mpp = mapa_base(esq + [{"lat": e["lat"], "lon": e["lon"]} for e in ev], W_, H_)
    s = [f'<svg viewBox="0 0 {W_} {H_}" xmlns="http://www.w3.org/2000/svg"><image href="{uri}" width="{W_}" height="{H_}"/>']
    col = lambda p: "#d7301f" if p < 70 else ("#f59e0b" if p < 300 else "#2a5db0")
    for i, e in sorted(enumerate(ev), key=lambda x: x[1]["mag"]):
        x, y = px[i + 2]; r = 3 + (e["mag"] - 2) ** 1.6 * 2.2
        s.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{col(e["prof"])}" fill-opacity="{.75 if e["bo"] else .35}" stroke="{"#111" if e.get("sentido") else "#fff"}" stroke-width="{3 if e.get("sentido") else 1}"/>')
    my = max(ev, key=lambda e: e["mag"]) if ev else None
    if my:
        x, y = px[ev.index(my) + 2]; s.append(f'<text x="{x + 12:.0f}" y="{y - 10:.0f}" font-size="18" font-weight="700" fill="#1b2430" stroke="#fff" stroke-width="4" paint-order="stroke">M {str(my["mag"]).replace(".", ",")}</text>')
    for k, (t, c) in enumerate((("< 70 km", "#d7301f"), ("70–300 km", "#f59e0b"), ("> 300 km", "#2a5db0"))):
        s.append(f'<circle cx="{26 + k * 120}" cy="{H_ - 26}" r="8" fill="{c}"/><text x="{40 + k * 120}" y="{H_ - 21}" font-size="15" fill="#1b2430" stroke="#fff" stroke-width="3" paint-order="stroke">{t}</text>')
    s.append(f'<text x="{W_ - 8}" y="{H_ - 6}" text-anchor="end" font-size="11" fill="#444">© OpenStreetMap contributors</text></svg>')
    return "".join(s), red


def svg_serie(serie, W_=1000, H_=210):
    mx = max([a + b for _, a, b in serie] + [3]); n = len(serie); bw = (W_ - 70) / n
    s = [f'<svg viewBox="0 0 {W_} {H_}" xmlns="http://www.w3.org/2000/svg"><rect width="{W_}" height="{H_}" fill="#f6f8fb" rx="8"/>']
    for k in (0, .5, 1):
        y = 20 + (H_ - 60) * (1 - k); s.append(f'<line x1="50" x2="{W_ - 10}" y1="{y:.0f}" y2="{y:.0f}" stroke="#dde3ea"/><text x="44" y="{y + 5:.0f}" text-anchor="end" font-size="14" fill="#6b7785">{mx * k:.0f}</text>')
    for i, (d, a, b) in enumerate(serie):
        x = 55 + i * bw; ha = (H_ - 60) * a / mx; hb = (H_ - 60) * b / mx
        s.append(f'<rect x="{x:.1f}" y="{20 + (H_ - 60) - ha:.1f}" width="{bw - 3:.1f}" height="{ha:.1f}" fill="#a9b4c2"/><rect x="{x:.1f}" y="{20 + (H_ - 60) - ha - hb:.1f}" width="{bw - 3:.1f}" height="{hb:.1f}" fill="#d7301f"/>')
        if i in (0, n // 2, n - 1): s.append(f'<text x="{x:.0f}" y="{H_ - 14}" font-size="14" fill="#6b7785">{d[8:]}/{d[5:7]}</text>')
    s.append(f'<rect x="{W_ - 360}" y="6" width="12" height="12" fill="#a9b4c2"/><text x="{W_ - 343}" y="17" font-size="14" fill="#1b2430">sismos</text><rect x="{W_ - 270}" y="6" width="12" height="12" fill="#d7301f"/><text x="{W_ - 253}" y="17" font-size="14" fill="#1b2430">probablemente sentidos</text></svg>')
    return "".join(s)


def html_sismo(B):
    from datetime import datetime, timezone, timedelta
    cab = '<div class="top"><b>CENTRO COORDINADOR DE EMERGENCIAS EN SALUD · SALA DE SITUACIÓN BOLIVIA</b><span>Monitoreo sísmico · fuente oficial</span></div>'
    pie = lambda n: f'<div class="pie"><span>Datos del Observatorio San Calixto (boletín sísmico oficial).</span><span>{E(B["codigo"])} · pág. {n}</span></div>'
    mapa, red = svg_sismos(B["eventos"])
    fila = lambda e: f'<tr><td class="k">{datetime.fromtimestamp(e["t"] / 1000, timezone(timedelta(hours=-4))).strftime("%d/%m %H:%M")}</td><td><b>{str(e["mag"]).replace(".", ",")}</b></td><td>{e["prof"]:.0f} km</td><td>{E(e["lugar"])}</td></tr>'
    tb = "".join(fila(e) for e in B["ultimos"]) or '<tr><td colspan="4">Sin eventos en Bolivia en la ventana.</td></tr>'
    p1 = f'''<div class="pg">{cab}<h1>ACTIVIDAD SÍSMICA</h1><div>{E(B["titulo"])}</div>
<div class="meta">{"".join(f"<div><small>{E(k)}</small><b>{E(v)}</b></div>" for k, v in B["meta"])}</div>
<div class="sint">{E(B["sintesis"])}</div><div class="kpis">{"".join(f"<div><b>{E(a)}</b><small>{E(b)}</small></div>" for a, b in B["kpis"])}</div>
<h2>Epicentros · tamaño = magnitud, color = profundidad</h2><div class="map"><div class="mapw" style="max-width:100%">{mapa}</div></div><div class="nota">Contorno negro: probablemente sentido por la población (M ≥ 4,0 y profundidad ≤ 100 km).{"" if red else " (Mapa base no disponible en este entorno.)"}</div>{pie(1)}</div>'''
    p2 = f'''<div class="pg">{cab}<h2>Sismos por día</h2>{svg_serie(B["serie"])}<div class="sec"><h2>Últimos sismos en Bolivia</h2><table><tr><th>Fecha y hora (Bolivia)</th><th>Magnitud</th><th>Profundidad</th><th>Lugar</th></tr>{tb}</table></div>
<div class="sec"><h2>Fuentes y método</h2><div class="met">{E(B["metodo"])}</div></div>{pie(2)}</div>'''
    return f'<!doctype html><html lang="es"><meta charset="utf-8"><style>{CSS.replace("FUENTES", AQUI + "/fuentes")}</style><body>{p1}{p2}</body></html>'


def html(B):
    if B.get("tipo") == "epi_ira":
        return html_epi(B)
    if B.get("tipo") == "sismo":
        return html_sismo(B)
    pts = B.get("puntos", []); mapa = ""; nota = B.get("nota_mapa", "")
    if len(pts) >= 1:
        svg, red = svg_mapa(pts, tipo=B.get('mapa_tipo', 'versiones'))
        tit = "Localización · versiones de los reportes" if B.get("mapa_tipo", "versiones") == "versiones" else "Territorios mencionados como afectados"
        mapa = f'<h2>{tit}</h2><div class="map">{svg}</div><div class="nota">{"<b style=color:%s>Azul</b>: versión inicial · <b style=color:%s>rojo</b>: versión posterior. " % (AZ, RJ) if any(p.get("version") == "B" for p in pts) else ""}Ubicación de referencia en OpenStreetMap{", no coordenada confirmada del impacto" if B.get("mapa_tipo", "versiones") == "versiones" else " (centro del municipio); no delimita el área afectada"}. {E(nota)}{"" if red else " (Mapa base no disponible en este entorno)."}</div>'
    ident = f'<h2>{"Identificación" if B.get("mapa_tipo", "versiones") == "versiones" else "Panorama"}</h2><div class="card"><div class="n">{E(B["victima"].get("nombre") or "Sin víctimas reportadas")}</div><div class="d">{E(B["victima"].get("detalle") or "")}</div>'
    if B.get("foto_url") and B.get("mapa_tipo", "versiones") == "versiones":
        ident += f'<div class="qr">{qr_svg(B["foto_url"])}</div><div class="nota">Retrato difundido por {E(B.get("foto_medio") or "un medio")}. Escanee el código para abrir la fuente original. No es una imagen del accidente.</div>'
    ident += ('<div class="nota">Escena del siniestro: no se localizó fotografía verificable del impacto; no se incorpora material no autenticado.</div></div>' if B.get("mapa_tipo", "versiones") == "versiones" else '</div>')
    esq = f'<div class="esq"><h2>Esquema ilustrativo de interacción vial</h2>{svg_esquema(B.get("vehiculo", "VEHÍCULO"))}<div class="nota">Representación conceptual; no reproduce la escena ni determina la mecánica del impacto. Debe sustituirse por el croquis, fotografías y peritaje oficiales.</div></div>' if B.get("esquema", True) else ""
    if not B.get("esquema", True) and B.get("lluvia"):
        L = B["lluvia"]; nor = L.get("normal_mm"); dif = (f"{(L['total_mm'] - nor) / nor * 100:+.0f}% frente a lo normal" if nor else "sin referencia histórica")
        esq = f'<div class="esq"><h2>Lluvia observada · últimos {L["dias"]} días</h2><div class="kpis" style="margin:0 0 2mm"><div><b>{L["total_mm"]:.0f} mm</b><small>acumulado observado</small></div><div><b>{(str(round(nor)) + " mm") if nor else "—"}</b><small>normal 2016–2025, mismas fechas</small></div><div><b>{dif.split(" ")[0] if nor else "—"}</b><small>{dif if nor else ""}</small></div></div>{svg_lluvia(L)}<div class="nota">Fuente: {E(L["fuente"])}. Punto de referencia: municipio del evento.</div></div>'
    cab = lambda p: f'<div class="top"><b>CENTRO COORDINADOR DE EMERGENCIAS EN SALUD · SALA DE SITUACIÓN BOLIVIA</b><span>Para: MAE · circulación restringida</span></div>'
    pie = lambda n: f'<div class="pie"><span>Boletín elaborado con fuentes abiertas. No sustituye los informes oficiales, médico-forenses, fiscales ni consulares.</span><span>{E(B["codigo"])} · pág. {n}</span></div>'
    acc = "".join(f'<tr><td>{i + 1}</td><td>{E(a[0])}</td><td>{E(a[1])}</td><td class="k">{E(a[2])}</td></tr>' for i, a in enumerate(B["acciones"]))
    tra = "".join(f'<tr><td class="k">{E(a)}</td><td>{E(b)}</td><td class="{estado(c)}">{E(c)}</td></tr>' for a, b, c in B["trazabilidad"])
    vis = {}
    for n, f in B.get("fuentes", []): vis.setdefault(n, f)
    fu = "<br>".join(f"{E(n)}{' · ' + E(f) if f else ''}" for n, f in vis.items())
    p1 = f'''<div class="pg">{cab(1)}<h1>BOLETÍN DE SITUACIÓN</h1><div>{E(B["titulo"])}</div>
<div class="meta">{"".join(f"<div><small>{E(k)}</small><b>{E(v)}</b></div>" for k, v in B["meta"])}</div>
<div class="sint">{E(B["sintesis"])}</div><div class="kpis">{"".join(f"<div><b>{E(a)}</b><small>{E(b)}</small></div>" for a, b in B["kpis"])}</div>
<div class="g" style="{"" if B.get("mapa_tipo", "versiones") == "versiones" else "grid-template-columns:1fr"}"><div>{mapa}</div>{"<div>" + ident + "</div>" if B.get("mapa_tipo", "versiones") == "versiones" else ""}</div>{esq if B.get("esquema", True) else ""}{pie(1)}</div>'''
    p2 = f'''<div class="pg">{cab(2)}{esq if not B.get("esquema", True) else ""}<h2 style="margin-top:5mm">Situación actual</h2><div class="sint" style="margin-top:0;font-size:9.6pt">{E(B["operativa"])}</div>
<div class="sec"><h2>Cadena de atención y situación posterior</h2><table><tr><th>Dimensión</th><th>Qué se sabe</th><th>Estado</th></tr>{tra}</table></div>
<div class="sec" style="margin-top:3.5mm"><h2>Vacíos prioritarios</h2><div style="font-size:8pt;line-height:1.4">{E("; ".join(B["vacios"]))}.</div></div>
<div class="sec" style="margin-top:3.5mm"><h2>Fuentes y método</h2><div class="met">{E(B["metodo"])}</div><div class="fu">{fu}</div></div>{pie(2)}</div>'''
    return f'<!doctype html><html lang="es"><meta charset="utf-8"><style>{CSS.replace("FUENTES", AQUI + "/fuentes")}</style><body>{p1}{p2}</body></html>'


def build(B, salida):
    d = tempfile.mkdtemp(); h = os.path.join(d, "b.html"); open(h, "w", encoding="utf-8").write(html(B))
    exe = next((shutil.which(x) for x in ("google-chrome", "chromium", "chromium-browser") if shutil.which(x)), None)
    subprocess.run([exe, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", f"--print-to-pdf={os.path.abspath(salida)}", "file://" + h], check=True, timeout=120, capture_output=True)
    return salida


if __name__ == "__main__":
    import sys
    build(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2])

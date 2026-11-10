# -*- coding: utf-8 -*-
"""Boletín por tipo de evento y ventana: renderiza el propio módulo de la interfaz (mismas gráficas y mapas) y lo guarda en PDF.
Uso: python modulos_pdf.py <tipo> <24h|7d|30d>   (tipo: geológica, meteorológica, hidrológica, climatológica)"""
import sys, os, json, shutil, tempfile, threading, http.server, functools, urllib.request, datetime as dt
from playwright.sync_api import sync_playwright
AQUI = os.path.dirname(os.path.abspath(__file__))
RAW = "https://raw.githubusercontent.com/micangelarcangel-lang/sala-situacion-bolivia/main/docs/"
DIAS = {"24h": 1, "7d": 7, "30d": 30}; NOM = {"24h": "Últimas 24 horas", "7d": "Últimos 7 días", "30d": "Último mes"}
HIDE = ".alert{flex-wrap:wrap!important}.alert>div{min-width:0;flex:1 1 100%!important}.alert .badge{order:-1}.hdr,#hdr,.foot,#mbar,.mbar,#pnl,.noimp,.live,[id^=s-sub] .cap{display:none!important}.mctrl,.mtools,.maplibregl-ctrl-top-right,select{display:none!important}body{padding:0!important;background:#fff!important}.wrap{max-width:none!important;padding:0 6mm!important}"

import re
HECHO = re.compile(r"muri|muert|fallec|herid|accident|choque|colisi|vuelc|embarranc|atropell|bloque|marcha|paro |protesta|enfrentamient|conflict|asesin|feminicid|homicid|incendi|explosi|robo|atraco|secuestr|detenid|aprehend|rescat|derrumb|intoxic|ahog", re.I)
RUIDO = re.compile(r"econom|\bINE\b|unesco|whatsapp|seguro|artistas|música|pacto global|https?://|campaña|premio|libro|festival|aniversario|impunidad|informe", re.I)

EXTRA = re.compile(r"egip|españ|ucrania|gaza|israel|rusia|china|estados unidos|eeuu|méxico|argentin|brasil|peru\\b|perú|chile\\b|colombia|venezuela|mundo|tanzania|egipto|cairo|asu[aá]n|sud[aá]frica|india\\b|pakist|nigeria|congo|filipin|indonesia|turqu|ir[aá]n\\b|siria|francia|alemania|italia|reino unido|londres|madrid|tailandia|corea|jap[oó]n|paraguay|uruguay|ecuador|bogot|lima\\b|buenos aires", re.I)

def filtrar(dst):
    """Deja en el boletín solo hechos concretos (verbo de hecho en el titular y no ruido). Trabaja sobre la copia; no toca el sitio."""
    p = os.path.join(dst, "eventos_unificados.json")
    try:
        d = json.load(open(p, encoding="utf-8")); n0 = len(d["eventos"])
        ok = lambda e: e.get("categoria") not in ("antropogénica", "tecnológica", "otra") or (HECHO.search(e.get("titulo") or "") and not RUIDO.search(e.get("titulo") or "") and (e.get("departamentos") or e.get("lugar")) and "/mundo/" not in (e.get("url") or "") and not EXTRA.search(e.get("titulo") or ""))
        d["eventos"] = [e for e in d["eventos"] if ok(e)]
        for e in d["eventos"]:  # cifras implausibles para un solo hecho (p. ej. "180 vehículos" leído como heridos): se anulan
            c = e.get("cifras") or {}
            if c and max([v for k, v in c.items() if k in ("fallecidos", "heridos") and isinstance(v, (int, float))] or [0]) >= 100: c["fallecidos"] = c["heridos"] = 0
        d["n"] = len(d["eventos"]); json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False); print("hechos:", n0, "->", d["n"])
    except Exception as ex: print("filtro", ex)

def preparar(dst):
    shutil.copytree(os.path.join(AQUI, "docs"), dst, dirs_exist_ok=True)
    if os.environ.get("MAPA_OFFLINE"): filtrar(dst); return
    for f in os.listdir(dst):
        if f.endswith((".json", ".geojson")) and not os.path.isdir(os.path.join(dst, f)):
            try: open(os.path.join(dst, f), "wb").write(urllib.request.urlopen(urllib.request.Request(RAW + f, headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read())
            except Exception: pass
    filtrar(dst)

def generar(tipo, ventana, salida):
    d = tempfile.mkdtemp(); preparar(d)
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=d); H.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_port}/modulo.html?t={tipo}&p={DIAS[ventana]}" + ("&d=mun" if tipo == "climatológica" else "")
    with sync_playwright() as pw:
        try: b = pw.chromium.launch(channel="chrome", args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"])
        except Exception: b = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"])
        pg = b.new_page(viewport={"width": 1100, "height": 900}); pg.add_init_script("try{localStorage.setItem('sala_theme','light')}catch(e){}")
        pg.goto(url, wait_until="networkidle"); pg.wait_for_timeout(9000)
        corte = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4))).strftime("%d/%m/%Y %H:%M")
        tit = pg.evaluate("(document.querySelector('.hero h1')||document.querySelector('h1')||{}).textContent||''")
        pg.add_style_tag(content=HIDE)
        pg.evaluate("""([t,v,c])=>{var w=document.querySelector('.wrap');var d=document.createElement('div');d.style.cssText='background:linear-gradient(90deg,#0b3b6e,#1f6fb5);color:#fff;padding:14px 18px;border-radius:12px;margin:6px 0 10px;font-family:Inter,system-ui';d.innerHTML='<div style="font-size:11px;letter-spacing:.08em;opacity:.85">CENTRO COORDINADOR DE EMERGENCIAS EN SALUD · SALA DE SITUACIÓN BOLIVIA</div><div style="font-size:22px;font-weight:800;margin-top:2px">BOLETÍN DE SITUACIÓN · '+t.toUpperCase()+'</div><div style="font-size:13px;margin-top:2px">'+v+' · corte '+c+' (hora Bolivia) · fuentes abiertas, información preliminar</div>';w.insertBefore(d,w.firstChild)}""", [tit.strip(), NOM[ventana], corte])
        pg.wait_for_timeout(1500)
        # los mapas WebGL no salen en el PDF: se fotografían y se reemplazan por imagen
        import base64
        for i, m in enumerate(pg.query_selector_all(".maplibregl-map")):
            try:
                m.scroll_into_view_if_needed(); pg.wait_for_timeout(2500)
                u = "data:image/png;base64," + base64.b64encode(m.screenshot()).decode()
                m.evaluate("(e,u)=>{var i=document.createElement('img');i.src=u;i.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:5;object-fit:cover';e.style.position='relative';e.appendChild(i)}", u)
            except Exception as ex: print("mapa", i, ex)
        pg.emulate_media(media="screen"); pg.wait_for_timeout(1500)
        pg.pdf(path=salida, width="1100px", height=str(pg.evaluate("document.body.scrollHeight") + 40) + "px", print_background=True, margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
        b.close()
    srv.shutdown(); return salida

if __name__ == "__main__":
    import unicodedata
    T = sys.argv[1]; V = sys.argv[2]; os.makedirs("datos/v3/investigacion", exist_ok=True)
    tipos = ["geológica", "meteorológica", "hidrológica", "climatológica", "biológica", "tecnológica", "antropogénica", "salud"] if T == "todos" else [T]
    for t in tipos:
        for v in (list(DIAS) if V == "todas" else [V]):
            sl = unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode()
            try:
                out = f"datos/v3/investigacion/BOL_{sl}_{v}.pdf"; print(generar(t, v, out))
                epi = "datos/v3/investigacion/epi_ira_BOLETIN.pdf"
                if t == "biológica" and os.path.exists(epi):  # anexo: boletín oficial del Ministerio (IRAs/influenza)
                    from pypdf import PdfWriter; w = PdfWriter(); w.append(out); w.append(epi); w.write(out)
            except Exception as e: print("ERROR", t, v, e)
    if T == "todos":
        import transito_boletin as TB
        for v in (list(DIAS) if V == "todas" else [V]):
            try: B = TB.boletin(v); TB.build(B, f"datos/v3/investigacion/BOL_transito_{v}.pdf"); print("transito", v)
            except Exception as e: print("ERROR transito", v, e)
        import subprocess
        for v in (list(DIAS) if V == "todas" else [V]):
            subprocess.run([sys.executable, "sismos_v3.py", v], check=False)

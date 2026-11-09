# -*- coding: utf-8 -*-
"""Boletín por tipo de evento y ventana: renderiza el propio módulo de la interfaz (mismas gráficas y mapas) y lo guarda en PDF.
Uso: python modulos_pdf.py <tipo> <24h|7d|30d>   (tipo: geológica, meteorológica, hidrológica, climatológica)"""
import sys, os, json, shutil, tempfile, threading, http.server, functools, urllib.request, datetime as dt
from playwright.sync_api import sync_playwright
AQUI = os.path.dirname(os.path.abspath(__file__))
RAW = "https://raw.githubusercontent.com/micangelarcangel-lang/sala-situacion-bolivia/main/docs/"
DIAS = {"24h": 1, "7d": 7, "30d": 30}; NOM = {"24h": "Últimas 24 horas", "7d": "Últimos 7 días", "30d": "Último mes"}
HIDE = ".hdr,#hdr,.foot,#mbar,.mbar,#pnl,.noimp,.live,[id^=s-sub] .cap{display:none!important}body{padding:0!important;background:#fff!important}.wrap{max-width:none!important;padding:0 6mm!important}"

def preparar(dst):
    shutil.copytree(os.path.join(AQUI, "docs"), dst, dirs_exist_ok=True)
    if os.environ.get("MAPA_OFFLINE"): return
    for f in os.listdir(dst):
        if f.endswith((".json", ".geojson")) and not os.path.isdir(os.path.join(dst, f)):
            try: open(os.path.join(dst, f), "wb").write(urllib.request.urlopen(urllib.request.Request(RAW + f, headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read())
            except Exception: pass

def generar(tipo, ventana, salida):
    d = tempfile.mkdtemp(); preparar(d)
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=d); H.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_port}/modulo.html?t={tipo}&p={DIAS[ventana]}"
    with sync_playwright() as pw:
        try: b = pw.chromium.launch(channel="chrome", args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"])
        except Exception: b = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"])
        pg = b.new_page(viewport={"width": 1100, "height": 900}); pg.add_init_script("try{localStorage.setItem('sala_theme','light')}catch(e){}")
        pg.goto(url, wait_until="networkidle"); pg.wait_for_timeout(6000)
        corte = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4))).strftime("%d/%m/%Y %H:%M")
        tit = pg.evaluate("(document.querySelector('.hero h1')||document.querySelector('h1')||{}).textContent||''")
        pg.add_style_tag(content=HIDE)
        pg.evaluate("""([t,v,c])=>{var w=document.querySelector('.wrap');var d=document.createElement('div');d.style.cssText='background:linear-gradient(90deg,#0b3b6e,#1f6fb5);color:#fff;padding:14px 18px;border-radius:12px;margin:6px 0 10px;font-family:Inter,system-ui';d.innerHTML='<div style="font-size:11px;letter-spacing:.08em;opacity:.85">CENTRO COORDINADOR DE EMERGENCIAS EN SALUD · SALA DE SITUACIÓN BOLIVIA</div><div style="font-size:22px;font-weight:800;margin-top:2px">BOLETÍN DE SITUACIÓN · '+t.toUpperCase()+'</div><div style="font-size:13px;margin-top:2px">'+v+' · corte '+c+' (hora Bolivia) · fuentes abiertas, información preliminar</div>';w.insertBefore(d,w.firstChild)}""", [tit.strip(), NOM[ventana], corte])
        pg.wait_for_timeout(1500)
        pg.emulate_media(media="screen"); pg.wait_for_timeout(1500)
        pg.pdf(path=salida, width="1100px", height=str(pg.evaluate("document.body.scrollHeight") + 40) + "px", print_background=True, margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
        b.close()
    srv.shutdown(); return salida

if __name__ == "__main__":
    import unicodedata
    T = sys.argv[1]; V = sys.argv[2]; os.makedirs("datos/v3/investigacion", exist_ok=True)
    tipos = ["geológica", "meteorológica", "hidrológica", "climatológica"] if T == "todos" else [T]
    for t in tipos:
        for v in (list(DIAS) if V == "todas" else [V]):
            sl = unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode()
            try: print(generar(t, v, f"datos/v3/investigacion/BOL_{sl}_{v}.pdf"))
            except Exception as e: print("ERROR", t, v, e)

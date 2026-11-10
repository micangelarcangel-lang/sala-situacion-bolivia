# -*- coding: utf-8 -*-
"""Boletín de tránsito por ventana (24h/7d/30d) a partir de docs/transito.json (hechos únicos y triangulados por la sala)."""
import json, os, sys, urllib.request, datetime as dt
import boletin_html as BH
from boletin_html import E, AQUI
BO = dt.timezone(dt.timedelta(hours=-4)); UA = {"User-Agent": "Mozilla/5.0"}
RAW = "https://raw.githubusercontent.com/micangelarcangel-lang/sala-situacion-bolivia/main/docs/transito.json"
VD = {"24h": 1, "7d": 7, "30d": 30}; NV = {"24h": "últimas 24 horas", "7d": "últimos 7 días", "30d": "último mes"}


def cargar():
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(RAW, headers=UA), timeout=40).read())
    except Exception: return json.load(open(os.path.join(AQUI, "docs/transito.json"), encoding="utf-8"))


def boletin(ventana="7d", datos=None):
    datos = datos or cargar(); W = VD[ventana]; ahora = dt.datetime.now(dt.timezone.utc).timestamp() * 1000
    todos = [h for h in datos["hechos"] if h.get("departamento") or h.get("lat")]
    h = sorted([x for x in todos if ahora - x["ts"] < W * 864e5], key=lambda x: -x["ts"])
    prev = [x for x in todos if W * 864e5 <= ahora - x["ts"] < 2 * W * 864e5]
    f = sum(x.get("fallecidos") or 0 for x in h); he = sum(x.get("heridos") or 0 for x in h)
    fp = sum(x.get("fallecidos") or 0 for x in prev)
    conf = [x for x in h if (x.get("n_medios") or 0) >= 2]
    var = lambda a, b: ("sin periodo previo comparable" if not b else f"{(a - b) / b * 100:+.0f}% frente al periodo anterior").replace(".", ",")
    mx = max(h, key=lambda x: (x.get("fallecidos") or 0) + (x.get("heridos") or 0) * .1, default=None)
    deps = {}
    for x in h: deps[x.get("departamento") or "Sin ubicar"] = deps.get(x.get("departamento") or "Sin ubicar", 0) + 1
    top = ", ".join(f"{d} ({n})" for d, n in sorted(deps.items(), key=lambda a: -a[1])[:3] if d != "Sin ubicar")
    sint = (f"En {('las ' if ventana == '24h' else 'los ') if ventana != '30d' else 'el '}{NV[ventana]} la prensa boliviana reportó {len(h)} accidentes de tránsito únicos, con {f} fallecidos y {he} heridos. " if h else f"No se registraron accidentes de tránsito en {('las ' if ventana == '24h' else 'los ') if ventana != '30d' else 'el '}{NV[ventana]}. ")
    if h: sint += (f"Fallecidos: {var(f, fp)}. " if prev else "") + (f"Mayor concentración: {top}. " if top else "") + (f"El hecho más grave: {mx['titulo']} ({mx.get('lugar') or mx.get('departamento') or 'sin ubicar'}). " if mx and (mx.get('fallecidos') or 0) else "") + f"{len(conf)} de {len(h)} hechos están confirmados por 2 o más medios; ninguno por fuente oficial pública (Policía, SUMA, ABC)."
    kp = [[str(len(h)), "accidentes"], [str(f), "fallecidos"], [str(he), "heridos"], [f"{f / (f + he) * 100:.0f} %".replace(".", ",") if f + he else "—", "letalidad (fall./víctimas)"], [f"{len(conf)}/{len(h)}", "con 2+ medios"]]
    ev = [{"t": x["ts"], "titulo": x["titulo"], "tipo": x.get("tipo") or "Sin precisar", "veh": x.get("vehiculo") or "no precisado", "dep": x.get("departamento") or "Sin ubicar", "lugar": x.get("lugar") or x.get("departamento") or "—", "lat": x.get("lat"), "lon": x.get("lon"), "f": x.get("fallecidos") or 0, "h": x.get("heridos") or 0, "m": x.get("n_medios") or 1, "conf": (x.get("confianza") or {}).get("nivel", "Baja"), "fecha": dt.datetime.fromtimestamp(x["ts"] / 1000, BO).strftime("%Y-%m-%d %H:%M")} for x in h]
    ahora_l = dt.datetime.now(BO)
    return {"tipo": "transito", "ventana": ventana, "codigo": f"TRA-{ventana.upper()}-" + ahora_l.strftime("%Y%m%d"), "titulo": f"Accidentes de tránsito en Bolivia · {NV[ventana]}",
            "meta": [["FUENTE", "Prensa boliviana triangulada"], ["VENTANA", NV[ventana].upper()], ["CORTE", ahora_l.strftime("%d %b %Y · %H:%M BOT").upper()], ["ESTADO", "Preliminar"]],
            "sintesis": sint, "kpis": kp, "ev": ev, "graf": ev, "n_prev": len(prev), "f_prev": fp,
            "metodo": "Hechos únicos construidos por la sala a partir de notas de medios bolivianos; una nota repetida o actualizada no suma un hecho nuevo. Cifras de fallecidos y heridos tal como las informan los medios (el máximo reportado); no provienen de Policía, SUMA 161 ni ABC. El punto del mapa es el municipio o tramo mencionado, no la coordenada exacta del impacto."}


def svg_mapa(ev, W_=900, H_=700):
    gm = json.load(open(os.path.join(AQUI, "docs/geo_dep.geojson"), encoding="utf-8"))
    pts = [e for e in ev if e["lat"] is not None and e["lon"] is not None]
    esq = [{"lat": -22.9, "lon": -69.7}, {"lat": -9.6, "lon": -57.4}]
    uri, px, red, mpp = BH.mapa_base(esq + [{"lat": e["lat"], "lon": e["lon"]} for e in pts], W_, H_, .97)
    z_, ox_, oy_ = BH._ULT; s = [f'<svg viewBox="0 0 {W_} {H_}" xmlns="http://www.w3.org/2000/svg"><image href="{uri}" width="{W_}" height="{H_}"/>']
    for f in gm["features"]:
        for q in ([f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"]):
            s.append(f'<polygon points="{" ".join(f"{BH._xy(b_, a_, z_)[0] * 512 - ox_:.0f},{BH._xy(b_, a_, z_)[1] * 512 - oy_:.0f}" for a_, b_ in q[0][::2])}" fill="none" stroke="#3b4656" stroke-width="1.5" stroke-opacity=".7"/>')
    for i, e in sorted(enumerate(pts), key=lambda a: a[1]["f"]):
        x, y = px[i + 2]; r = 6 + (e["f"] * 2 + e["h"]) ** .5 * 4; c = "#c62828" if e["f"] else ("#f59e0b" if e["h"] else "#7b8794")
        s.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{c}" fill-opacity=".72" stroke="#fff" stroke-width="2"/>')
    for i, e in sorted(enumerate(pts), key=lambda a: -a[1]["f"])[:2]:
        if e["f"]:
            x, y = px[i + 2]; s.append(f'<text x="{x + 14:.0f}" y="{y - 8:.0f}" font-size="17" font-weight="700" fill="#1b2430" stroke="#fff" stroke-width="4" paint-order="stroke">{E(e["lugar"].split(",")[0])} · {e["f"]} f.</text>')
    for k, (t, c) in enumerate((("con fallecidos", "#c62828"), ("solo heridos", "#f59e0b"), ("sin víctimas informadas", "#7b8794"))):
        s.append(f'<circle cx="{26 + k * 170}" cy="{H_ - 26}" r="8" fill="{c}"/><text x="{40 + k * 170}" y="{H_ - 21}" font-size="15" fill="#1b2430" stroke="#fff" stroke-width="3" paint-order="stroke">{t}</text>')
    s.append(f'<text x="{W_ - 8}" y="{H_ - 6}" text-anchor="end" font-size="11" fill="#444">© OpenStreetMap contributors</text></svg>')
    return "".join(s), red, len(pts)


def graficas(B):
    d = json.dumps(B["ev"], ensure_ascii=False); v = B["ventana"]
    js = open(os.path.join(AQUI, "docs", "vendor", "echarts.min.js"), encoding="utf-8").read()
    tit = [("Accidentes y víctimas por " + ("hora" if v == "24h" else "día"), "Barras: hechos · línea: fallecidos + heridos"), ("Tipo de accidente", "Según el titular"), ("Vehículo involucrado", "Según la nota"), ("Víctimas por departamento", "Fallecidos y heridos informados"), ("Hora del día (La Paz)", "Cuándo ocurren los hechos"), ("Confianza de la información", "Medios independientes que lo cuentan")]
    hh = "".join(f'<div class="gc"><h3>{t}</h3><div class="gs">{c}</div><div id="g{i}" class="gx"></div></div>' for i, (t, c) in enumerate(tit))
    return f"""<div class="gg">{hh}</div><script>{js}</script><script>
var D={d},V="{v}",MUT="#5b6472",P=["#c62828","#f59e0b","#2a7fd1","#1f9d8a","#7b5ea7","#8d6e63","#7b8794"];
function ini(i,o){{var c=echarts.init(document.getElementById('g'+i),null,{{renderer:'svg'}});o.animation=false;c.setOption(o);}}
function cnt(f){{var o={{}};D.forEach(function(e){{var k=f(e);o[k]=(o[k]||0)+1}});return o}}
var n=V=='24h'?24:(V=='7d'?7:30),now=new Date(Date.now()-4*36e5),ord=[];
for(var i=n-1;i>=0;i--){{var x=new Date(now.getTime()-i*(V=='24h'?36e5:864e5)),iso=x.toISOString();ord.push(V=='24h'?iso.slice(5,10)+' '+iso.slice(11,13)+'h':iso.slice(5,10))}}
var kf=function(e){{return V=='24h'?e.fecha.slice(5,13)+'h':e.fecha.slice(5,10)}},a={{}},vv={{}};D.forEach(function(e){{var k=kf(e);a[k]=(a[k]||0)+1;vv[k]=(vv[k]||0)+e.f+e.h}});
ini(0,{{grid:{{left:30,right:30,top:14,bottom:34}},xAxis:{{type:'category',data:ord,axisLabel:{{interval:V=='30d'?4:(V=='24h'?3:0),fontSize:8}}}},yAxis:[{{type:'value',minInterval:1}},{{type:'value',splitLine:{{show:false}}}}],series:[{{type:'bar',data:ord.map(function(k){{return a[k]||0}}),itemStyle:{{color:'#c62828',borderRadius:[3,3,0,0]}}}},{{type:'line',yAxisIndex:1,smooth:true,data:ord.map(function(k){{return vv[k]||0}}),itemStyle:{{color:'#1d4f91'}},lineStyle:{{width:2}}}}]}});
var t=cnt(function(e){{return e.tipo.replace(/ \\(.*/,'')}});
ini(1,{{color:P,series:[{{type:'pie',radius:['42%','68%'],center:['50%','50%'],label:{{fontSize:8,formatter:'{{b}}: {{c}}'}},data:Object.keys(t).map(function(k){{return {{name:k,value:t[k]}}}})}}]}});
var ve=cnt(function(e){{return e.veh}}),vk=Object.keys(ve).sort(function(x,y){{return ve[y]-ve[x]}}).slice(0,8).reverse();
ini(2,{{grid:{{left:80,right:24,top:8,bottom:20}},xAxis:{{type:'value',minInterval:1}},yAxis:{{type:'category',data:vk,axisLabel:{{fontSize:8}}}},series:[{{type:'bar',data:vk.map(function(k){{return ve[k]}}),itemStyle:{{color:'#2a7fd1',borderRadius:[0,4,4,0]}},label:{{show:true,position:'right'}}}}]}});
var dp={{}};D.forEach(function(e){{dp[e.dep]=dp[e.dep]||[0,0];dp[e.dep][0]+=e.f;dp[e.dep][1]+=e.h}});var dk=Object.keys(dp).sort(function(x,y){{return (dp[y][0]*3+dp[y][1])-(dp[x][0]*3+dp[x][1])}}).slice(0,8).reverse();
ini(3,{{grid:{{left:70,right:20,top:18,bottom:20}},legend:{{top:0,textStyle:{{fontSize:8}},itemHeight:8}},xAxis:{{type:'value',minInterval:1}},yAxis:{{type:'category',data:dk,axisLabel:{{fontSize:8}}}},series:[{{name:'Fallecidos',type:'bar',stack:'v',data:dk.map(function(k){{return dp[k][0]}}),itemStyle:{{color:'#8e1b1b'}}}},{{name:'Heridos',type:'bar',stack:'v',data:dk.map(function(k){{return dp[k][1]}}),itemStyle:{{color:'#f59e0b'}}}}]}});
var h=[];for(var i=0;i<24;i++)h.push(0);D.forEach(function(e){{h[+e.fecha.slice(11,13)]++}});
ini(4,{{angleAxis:{{type:'category',data:h.map(function(_,i){{return i+'h'}}),axisLabel:{{color:MUT,fontSize:8}}}},radiusAxis:{{axisLabel:{{show:false}}}},polar:{{radius:'74%'}},series:[{{type:'bar',coordinateSystem:'polar',data:h,itemStyle:{{color:'#c62828'}}}}]}});
var cf=cnt(function(e){{return e.m>=3?'Alta (3+ medios)':(e.m==2?'Media (2 medios)':'Baja (1 medio)')}});
ini(5,{{color:['#1f9d8a','#f59e0b','#7b8794'],series:[{{type:'pie',radius:['42%','68%'],label:{{fontSize:8,formatter:'{{b}}: {{c}}'}},data:Object.keys(cf).map(function(k){{return {{name:k,value:cf[k]}}}})}}]}});
</script>"""


def html(B):
    cab = '<div class="top"><b>CENTRO COORDINADOR DE EMERGENCIAS EN SALUD · SALA DE SITUACIÓN BOLIVIA</b><span>Tránsito · hechos únicos triangulados de prensa</span></div>'
    pie = lambda n: f'<div class="pie"><span>Información preliminar de fuentes abiertas; no sustituye los registros de Policía, SUMA 161 ni ABC.</span><span>{E(B["codigo"])} · pág. {n}</span></div>'
    mapa, red, npt = svg_mapa(B["ev"])
    fila = lambda e: f'<tr><td class="k">{e["fecha"][8:10]}/{e["fecha"][5:7]} {e["fecha"][11:]}</td><td>{E(e["tipo"].split(" (")[0])}</td><td>{E(e["lugar"])}</td><td><b>{e["f"]}</b> f. · {e["h"]} h.</td><td>{e["m"]}</td></tr>'
    graves = sorted(B["ev"], key=lambda e: -(e["f"] * 3 + e["h"]))[:10]
    tb = "".join(fila(e) for e in graves) or '<tr><td colspan="5">Sin accidentes en la ventana.</td></tr>'
    p1 = f'''<div class="pg">{cab}<h1>ACCIDENTES DE TRÁNSITO</h1><div>{E(B["titulo"])}</div>
<div class="meta">{"".join(f"<div><small>{E(k)}</small><b>{E(v)}</b></div>" for k, v in B["meta"])}</div>
<div class="sint">{E(B["sintesis"])}</div><div class="kpis">{"".join(f"<div><b>{E(a)}</b><small>{E(b)}</small></div>" for a, b in B["kpis"])}</div>
<h2>Dónde ocurrieron · tamaño = víctimas, color = gravedad</h2><div class="map"><div class="mapa-ancho">{mapa}</div></div><div class="nota">{npt} de {len(B["ev"])} hechos con ubicación (municipio o tramo mencionado; no es la coordenada exacta del impacto).{"" if red else " (Mapa base no disponible en este entorno.)"}</div>{pie(1)}</div>'''
    p2 = f'''<div class="pg">{cab}<h2>Indicadores y gráficos de análisis</h2>{graficas(B)}<div class="sec"><h2>Hechos más graves de la ventana</h2><table><tr><th>Fecha</th><th>Tipo</th><th>Lugar</th><th>Víctimas</th><th>Medios</th></tr>{tb}</table></div>
<div class="sec"><h2>Fuentes y método</h2><div class="met">{E(B["metodo"])}</div></div>{pie(2)}</div>'''
    return f'<!doctype html><html lang="es"><meta charset="utf-8"><style>{BH.CSS.replace("FUENTES", AQUI + "/fuentes")}</style><body>{p1}{p2}</body></html>'


def build(B, salida):
    import tempfile, shutil, subprocess
    d = tempfile.mkdtemp(); h = os.path.join(d, "b.html"); open(h, "w", encoding="utf-8").write(html(B))
    exe = next(shutil.which(x) for x in ("google-chrome", "chromium", "chromium-browser") if shutil.which(x))
    subprocess.run([exe, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", "--virtual-time-budget=6000", f"--print-to-pdf={os.path.abspath(salida)}", "file://" + h], check=True, timeout=120, capture_output=True)


if __name__ == "__main__":
    os.makedirs("datos/v3/investigacion", exist_ok=True)
    for v in (list(VD) if len(sys.argv) < 2 or sys.argv[1] == "todas" else [sys.argv[1]]):
        B = boletin(v); print(B["sintesis"]); build(B, f"datos/v3/investigacion/BOL_transito_{v}.pdf")

# -*- coding: utf-8 -*-
"""Diagnóstico de fuentes: reemplaza a los 15 scripts probar_*.

Prueba una o varias direcciones y dice, por cada vía de la escalera, si respondió, cuánto tardó y si parece un bloqueo.
Uso:
    python diagnostico.py --url https://www.defensacivil.gob.bo --vias directa navegador
    python diagnostico.py --fuente defensa_civil_videci sngr     # usa las URL de fuentes.yml
    python diagnostico.py --solicitud diag_solicitud.txt         # ids y URL en un archivo
Salida: imprime un resumen y escribe diag_out/diagnostico.json (no se versiona).
"""
import argparse, json, os, re, sys, time, urllib.request, urllib.error

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MARCAS_BLOQUEO = re.compile(r"access denied|captcha|cloudflare|just a moment|attention required|forbidden|anubis|bot protection", re.I)


def directa(url, t=20):
    ini = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-419,es;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=t) as r:
            cuerpo = r.read(400_000).decode("utf-8", "replace")
            return {"via": "directa", "url": url, "estado": r.status, "bytes": len(cuerpo), "seg": round(time.time() - ini, 1), "tipo": r.headers.get("content-type", ""), "bloqueo": bool(MARCAS_BLOQUEO.search(cuerpo[:3000])), "muestra": re.sub(r"\s+", " ", cuerpo[:200])}
    except urllib.error.HTTPError as e:
        cuerpo = e.read(5000).decode("utf-8", "replace")
        return {"via": "directa", "url": url, "estado": e.code, "seg": round(time.time() - ini, 1), "bloqueo": bool(MARCAS_BLOQUEO.search(cuerpo)) or e.code in (401, 403, 429), "muestra": re.sub(r"\s+", " ", cuerpo[:200])}
    except Exception as e:
        return {"via": "directa", "url": url, "estado": None, "seg": round(time.time() - ini, 1), "error": type(e).__name__ + ": " + str(e)[:140]}


def navegador(url, t=30):
    ini = time.time()
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        return {"via": "navegador", "url": url, "estado": None, "error": "playwright no disponible: " + str(e)[:100]}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(user_agent=UA, locale="es-BO")
            r = pg.goto(url, timeout=t * 1000, wait_until="domcontentloaded")
            pg.wait_for_timeout(2000)
            html = pg.content()
            b.close()
        return {"via": "navegador", "url": url, "estado": r.status if r else None, "bytes": len(html), "seg": round(time.time() - ini, 1), "bloqueo": bool(MARCAS_BLOQUEO.search(html[:3000])), "muestra": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)[:200])}
    except Exception as e:
        return {"via": "navegador", "url": url, "estado": None, "seg": round(time.time() - ini, 1), "error": type(e).__name__ + ": " + str(e)[:140]}


def archivo(url, t=25):
    """Copia archivada pública (Wayback Machine): consulta si existe una captura reciente."""
    ini = time.time()
    api = "https://archive.org/wayback/available?url=" + urllib.request.quote(url, safe="")
    try:
        with urllib.request.urlopen(urllib.request.Request(api, headers={"User-Agent": UA}), timeout=t) as r:
            d = json.loads(r.read().decode("utf-8", "replace"))
        cap = (d.get("archived_snapshots") or {}).get("closest") or {}
        return {"via": "archivo", "url": url, "estado": 200 if cap.get("available") else 404, "captura": cap.get("url"), "fecha_captura": cap.get("timestamp"), "seg": round(time.time() - ini, 1)}
    except Exception as e:
        return {"via": "archivo", "url": url, "estado": None, "seg": round(time.time() - ini, 1), "error": type(e).__name__ + ": " + str(e)[:140]}


VIAS = {"directa": directa, "navegador": navegador, "archivo": archivo}


def urls_de_fuente(fid):
    import yaml
    d = yaml.safe_load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes.yml"), encoding="utf-8"))
    for f in d["fuentes"]:
        if f["id"] == fid:
            return sorted({v["url"] for v in f["vias"] if v.get("url")})
    raise SystemExit("fuente no encontrada: " + fid)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", nargs="*", default=[])
    ap.add_argument("--fuente", nargs="*", default=[])
    ap.add_argument("--solicitud", help="archivo con ids de fuentes.yml y/o URL separados por espacios o líneas")
    ap.add_argument("--vias", nargs="+", default=["directa", "navegador", "archivo"], choices=list(VIAS))
    ap.add_argument("--captar", nargs="*", default=[], help="ids de fuentes.yml con vías rss/wp_json: baja y cuenta elementos")
    ap.add_argument("--enlaces", action="store_true", help="con --escalera: imprime los enlaces de la página (con navegador si la directa falla)")
    ap.add_argument("--escalera", action="store_true", help="usa escalera.py: prueba las vías en orden y dice cuál funcionó")
    a = ap.parse_args()
    if a.captar:
        import yaml, captar_v3
        cat = yaml.safe_load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes.yml"), encoding="utf-8"))["fuentes"]
        for fid in a.captar:
            f = next(x for x in cat if x["id"] == fid)
            r = captar_v3.captar(fid, [v for v in f["vias"] if v["via"] in ("rss", "wp_json")])
            print(f"CAPTAR {fid} ok={r['ok']} via={r['via']} elementos={len(r['elementos'])} intentos={r['intentos']}")
            for e in r["elementos"][:5]:
                print(f"   {e['ts_publicacion']} | {e['titulo'][:90]} | {e['url'][:70]}")
        return
    fuentes = list(a.fuente)
    urls = list(a.url)
    if a.solicitud:
        for tok in open(a.solicitud, encoding="utf-8").read().split():
            (urls if tok.startswith("http") else fuentes).append(tok)
    for fid in fuentes:
        urls += urls_de_fuente(fid)
    urls = list(dict.fromkeys(urls))
    if not urls:
        raise SystemExit("indica --url o --fuente")
    res = []
    if a.escalera:
        import escalera
        panel = {}
        for u in urls:
            r = escalera.obtener(u, vias=tuple(a.vias))
            panel[u] = r
            ult = r["intentos"][-1] if r["intentos"] else {}
            print(f"ESCALERA ok={r['ok']} via={r['via']} desactualizado={r.get('desactualizado', '-')} edad_dias={r.get('edad_dias', '-')} intentos={[(i['via'], i['estado'], i.get('chars'), i.get('bloqueo')) for i in r['intentos']]} {u}")
            if a.enlaces and r["ok"]:
                import escalera as _e
                bruto = _e.VIAS[r["via"]](u).get("crudo") or b""
                html = bruto.decode("utf-8", "replace")
                vistos = []
                for href, txt in re.findall(r'(?is)<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html):
                    txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", txt)).strip()
                    if txt and len(txt) > 12 and (href, txt) not in vistos:
                        vistos.append((href, txt))
                for href, txt in vistos[:25]:
                    print(f"   enlace {txt[:80]!r} -> {href[:110]}")
            if not r["ok"]:
                for i in r["intentos"]:
                    print(f"   detalle {i['via']}: error={i.get('error', '')!r} muestra={i.get('muestra', '')!r}")
        os.makedirs("diag_out", exist_ok=True)
        escalera.registrar(panel, "diag_out/estado_vias.json")
        return
    for u in urls:
        for v in a.vias:
            r = VIAS[v](u)
            res.append(r)
            print(f"{v:9} {str(r.get('estado')):5} {r.get('seg', '')!s:>5}s  bloqueo={r.get('bloqueo', '-')}  {u}  {r.get('error', '')}")
    os.makedirs("diag_out", exist_ok=True)
    json.dump(res, open("diag_out/diagnostico.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()

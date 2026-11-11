"""Lector de enlaces: descarga páginas/PDF/CSV desde el ejecutor de GitHub y guarda texto + enlaces en datos/v3/fuentes/.
Uso: python herramientas/leer_url.py leer_fuentes.txt   (una URL por línea; '#' comenta)"""
import hashlib, json, os, re, sys, time, urllib.parse
import requests
from bs4 import BeautifulSoup
OUT = "datos/v3/fuentes"; os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "es,en;q=0.8"}
def slug(u): p = urllib.parse.urlparse(u); return re.sub(r"[^a-zA-Z0-9]+", "_", (p.netloc + p.path)).strip("_")[:70] + "_" + hashlib.md5(u.encode()).hexdigest()[:6]
def pdf_texto(b, f):
    open(f, "wb").write(b)
    from pypdf import PdfReader
    try: return "\n\n".join((p.extract_text() or "") for p in PdfReader(f).pages)
    except Exception as e: return "[no se pudo extraer texto del PDF: %s]" % e
estado = []
for u in [l.strip() for l in open(sys.argv[1], encoding="utf8") if l.strip() and not l.startswith("#")]:
    s = slug(u); r = {"url": u, "slug": s}
    try:
        try: x = requests.get(u, headers=UA, timeout=60, allow_redirects=True)
        except requests.exceptions.SSLError:  # sitios públicos de gobierno con cadena de certificados incompleta: lectura de solo lectura
            import urllib3; urllib3.disable_warnings(); x = requests.get(u, headers=UA, timeout=60, allow_redirects=True, verify=False); r["ssl"] = "sin verificar (certificado del sitio incompleto)"
        r["http"] = x.status_code; ct = x.headers.get("content-type", "").lower(); r["tipo"] = ct; r["bytes"] = len(x.content)
        if x.status_code >= 400: raise RuntimeError("HTTP %d" % x.status_code)
        if "pdf" in ct or u.lower().endswith(".pdf"):
            t = pdf_texto(x.content, f"{OUT}/{s}.pdf") if len(x.content) < 25e6 else "[PDF demasiado grande]"; open(f"{OUT}/{s}.txt", "w", encoding="utf8").write(t); r["chars"] = len(t)
        elif "html" in ct or "xml" in ct:
            h = x.text; soup = BeautifulSoup(h, "lxml"); links = []
            for a in soup.find_all("a", href=True):
                hr = urllib.parse.urljoin(u, a["href"]); links.append((a.get_text(" ", strip=True)[:90], hr))
            try:
                import trafilatura; t = trafilatura.extract(h, include_tables=True, include_links=False) or ""
            except Exception: t = ""
            if len(t) < 300: [e.decompose() for e in soup(["script", "style", "noscript"])]; t = re.sub(r"\n{3,}", "\n\n", soup.get_text("\n", strip=True))
            if len(t) < 1500:  # tableros JavaScript: renderizar con Chrome
                try:
                    from playwright.sync_api import sync_playwright
                    with sync_playwright() as pw:
                        b = pw.chromium.launch(); pg = b.new_page(ignore_https_errors=True, viewport={"width": 1400, "height": 1000}); pg.goto(u, wait_until="networkidle", timeout=60000); pg.wait_for_timeout(5000)
                        t2 = pg.inner_text("body"); pg.screenshot(path=f"{OUT}/{s}.png", full_page=True); b.close()
                    if len(t2) > len(t): t = t2; r["render"] = "chrome"
                except Exception as e: r["render_error"] = str(e)[:120]
            open(f"{OUT}/{s}.txt", "w", encoding="utf8").write(t); r["chars"] = len(t)
            doc = [l for l in links if re.search(r"\.(pdf|csv|xlsx?|json|zip)(\?|$)", l[1], re.I)]
            open(f"{OUT}/{s}.enlaces.txt", "w", encoding="utf8").write("== Archivos (pdf/csv/xlsx/json/zip) ==\n" + "\n".join(f"{a} | {b}" for a, b in doc) + "\n\n== Todos los enlaces ==\n" + "\n".join(f"{a} | {b}" for a, b in links)); r["archivos"] = len(doc)
        else:
            if len(x.content) < 15e6: open(f"{OUT}/{s}{os.path.splitext(urllib.parse.urlparse(u).path)[1][:6] or '.bin'}", "wb").write(x.content)
            r["chars"] = 0
    except Exception as e: r["error"] = str(e)[:200]
    estado.append(r); print(json.dumps(r, ensure_ascii=False)); time.sleep(1)
json.dump(estado, open(f"{OUT}/_estado.json", "w"), ensure_ascii=False, indent=1)

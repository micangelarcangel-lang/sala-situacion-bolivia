# -*- coding: utf-8 -*-
"""Prueba 3: tabla de alertas hidrológicas SENAMHI + texto de los últimos PDF. Escribe docs/senamhi_prueba3.txt."""
import re, io, ssl, time, urllib.request, urllib.parse, datetime, os

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
B = "https://www.senamhi.gob.bo/"
out = ["Prueba 3 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def get(url, n=3):
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60, context=ssl.create_default_context()) as r:
                return r.status, r.read()
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:80]
            time.sleep(4)
    return err, b""


st, d = get(B + "alertas2.php")
h = d.decode("utf-8", "ignore")
out.append(f"alertas2.php estado={st} bytes={len(d)}")
filas = re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S | re.I)
out.append(f"filas={len(filas)}")
pdfs = []
for f in filas[:40]:
    celdas = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", f, re.S | re.I)]
    m = re.search(r'href=["\']([^"\']*pdf_alertas/[^"\']+)', f)
    if m:
        pdfs.append(m.group(1))
    out.append(" | ".join(celdas) + ("  -> " + m.group(1) if m else ""))
out.append("")
for sec in ("despliegaalerta1.php", "alertasanteriores2.php"):
    st2, d2 = get(B + sec)
    out.append(f"{sec} estado={st2} bytes={len(d2)} inicio={d2[:200]!r}")
out.append("")

try:
    from pypdf import PdfReader
except Exception as e:
    PdfReader = None
    out.append("pypdf no disponible: " + str(e))
for p in pdfs[:3]:
    u = urllib.parse.urljoin(B, p)
    st3, d3 = get(u)
    out.append(f"=== PDF {u} estado={st3} bytes={len(d3)}")
    if PdfReader and d3[:4] == b"%PDF":
        try:
            r = PdfReader(io.BytesIO(d3))
            for pg in r.pages[:3]:
                out.append((pg.extract_text() or "")[:3500])
        except Exception as e:
            out.append("error leyendo pdf: " + str(e))
    out.append("")

os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba3.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out)[:3000])

# -*- coding: utf-8 -*-
"""Prueba 4: diagnóstico del servidor de avisos meteorológicos (sena.senamhi.gob.bo). Escribe docs/senamhi_prueba4.txt."""
import socket, ssl, time, datetime, os, subprocess, re

H = "sena.senamhi.gob.bo"
out = ["Prueba 4 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def sh(c, t=90):
    try:
        r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t)
        return (r.stdout + r.stderr)[:2500]
    except Exception as e:
        return "ERR " + str(e)


try:
    ips = sorted(set(x[4][0] for x in socket.getaddrinfo(H, 443)))
    out.append("DNS: " + ", ".join(ips))
except Exception as e:
    out.append("DNS error: " + str(e))
    ips = []
for ip in ips[:2]:
    for puerto in (443, 80):
        t0 = time.time()
        try:
            s = socket.create_connection((ip, puerto), timeout=20); s.close()
            out.append(f"TCP {ip}:{puerto} ok en {time.time()-t0:.1f}s")
        except Exception as e:
            out.append(f"TCP {ip}:{puerto} falla ({type(e).__name__}) en {time.time()-t0:.1f}s")
out.append("")
for etiqueta, cmd in [
    ("curl https", f"curl -sS -m 60 -o /tmp/a.html -w '%{{http_code}} %{{size_download}} %{{content_type}}' https://{H}/public/forecast-public-reports"),
    ("curl https tls1.2", f"curl -sS -m 60 --tlsv1.2 --tls-max 1.2 -o /tmp/b.html -w '%{{http_code}} %{{size_download}}' https://{H}/public/forecast-public-reports"),
    ("curl https -k", f"curl -sS -m 60 -k -o /tmp/c.html -w '%{{http_code}} %{{size_download}}' https://{H}/public/forecast-public-reports"),
    ("curl http", f"curl -sS -m 40 -L -o /tmp/d.html -w '%{{http_code}} %{{size_download}} %{{url_effective}}' http://{H}/public/forecast-public-reports"),
    ("curl raíz", f"curl -sS -m 40 -o /tmp/e.html -w '%{{http_code}} %{{size_download}}' https://{H}/"),
]:
    out.append(f"[{etiqueta}] " + sh(cmd))
for f in ("a", "b", "c", "d", "e"):
    p = f"/tmp/{f}.html"
    if os.path.exists(p) and os.path.getsize(p) > 0:
        h = open(p, encoding="utf-8", errors="ignore").read()
        out.append(f"--- contenido {f}.html ({len(h)} bytes)")
        refs = sorted(set(re.findall(r'(?:href|src|action)\s*=\s*["\']([^"\']+)["\']', h) + re.findall(r'["\'](/?(?:api|public|storage|geoserver)[^"\']{2,120})["\']', h)))
        out += ["   " + r[:200] for r in refs[:80]]
        txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)))
        out.append("   texto: " + txt[:500])
        break
os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba4.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))

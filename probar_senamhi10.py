# -*- coding: utf-8 -*-
"""Prueba 10: lista pública de avisos meteorológicos (la misma consulta que hace la página pública). Escribe docs/senamhi_prueba10.txt."""
import ssl, json, urllib.request, datetime, os

URL = "https://senab.senamhi.gob.bo/api/forecastweather/datatable"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
out = ["Prueba 10 SENAMHI - " + datetime.datetime.utcnow().isoformat() + "Z", ""]


def post(cuerpo):
    c = ssl.create_default_context(); c.maximum_version = ssl.TLSVersion.TLSv1_2
    rq = urllib.request.Request(URL, data=json.dumps(cuerpo).encode(), headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"}, method="POST")
    with urllib.request.urlopen(rq, timeout=120, context=c) as r:
        return r.status, r.read()


def recorta(v, prof=0):
    if isinstance(v, dict):
        return {k: recorta(x, prof + 1) for k, x in list(v.items())[:40]}
    if isinstance(v, list):
        return [recorta(x, prof + 1) for x in v[:3]] + (["...(%d en total)" % len(v)] if len(v) > 3 else [])
    if isinstance(v, str) and len(v) > 220:
        return v[:220] + "...(%d car.)" % len(v)
    return v


try:
    st, d = post({"offset": 0, "limit": 3, "order": None, "query": {}, "type": "Aprobado"})
    j = json.loads(d)
    out.append(f"estado={st} bytes={len(d)} count={j.get('count')}")
    data = j.get("data", [])
    out.append("claves del registro: " + ", ".join(data[0].keys()) if data else "sin datos")
    for r in data[:3]:
        out.append(json.dumps(recorta(r), ensure_ascii=False, indent=1))
    # tamaño por campo del primer registro
    if data:
        out.append("tamaño por campo: " + ", ".join(f"{k}={len(json.dumps(v))}" for k, v in data[0].items()))
except Exception as e:
    out.append("ERROR: " + type(e).__name__ + " " + str(e)[:200])
os.makedirs("docs", exist_ok=True)
open("docs/senamhi_prueba10.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out)[:3000])

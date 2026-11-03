# -*- coding: utf-8 -*-
"""Almacén de eventos con historial (v3). Solo texto, sin base de datos: se versiona bien en git y se lee con cualquier herramienta.
 datos/v3/historial/AAAA-MM.jsonl : una línea por cambio {id, version, registrado, hash, evento}; nunca se borra ni se reescribe
 datos/v3/indice.json             : id -> {version, hash, primera_vez, ultima_vez}
Un evento solo agrega línea si cambió algo importante (nivel, lugar, cifras, grupo, subtipo, evidencia), no por cambios de captura."""
import hashlib, json, os, datetime as dt

CLAVES = ("categoria", "subtipo", "titulo", "nivel_txt", "lugar", "lat", "lon", "departamentos", "cifras", "victimas", "confianza", "nivel_evidencia", "precision_ubicacion", "grupo_propuesto", "oficial")


def _hash(e):
    return hashlib.sha1(json.dumps({k: e.get(k) for k in CLAVES}, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()[:12]


def actualizar(eventos, carpeta="datos/v3", ahora_ms=None):
    os.makedirs(os.path.join(carpeta, "historial"), exist_ok=True)
    ruta_i = os.path.join(carpeta, "indice.json")
    idx = json.load(open(ruta_i, encoding="utf-8")) if os.path.exists(ruta_i) else {}
    import time
    ahora_ms = ahora_ms or int(time.time() * 1000)
    mes = dt.datetime.fromtimestamp(ahora_ms / 1000, dt.timezone.utc).strftime("%Y-%m")
    nuevos = cambiados = 0
    lineas = []
    for e in eventos:
        h = _hash(e)
        i = idx.get(e["id"])
        if i and i["hash"] == h:
            i["ultima_vez"] = ahora_ms
            continue
        v = (i["version"] + 1) if i else 1
        nuevos += not i
        cambiados += bool(i)
        idx[e["id"]] = {"version": v, "hash": h, "primera_vez": i["primera_vez"] if i else ahora_ms, "ultima_vez": ahora_ms}
        lineas.append(json.dumps({"id": e["id"], "version": v, "registrado": ahora_ms, "hash": h, "evento": e}, ensure_ascii=False))
    if lineas:
        with open(os.path.join(carpeta, "historial", mes + ".jsonl"), "a", encoding="utf-8") as f:
            f.write("\n".join(lineas) + "\n")
    json.dump(idx, open(ruta_i, "w", encoding="utf-8"), ensure_ascii=False)
    return {"nuevos": nuevos, "cambiados": cambiados, "total_indice": len(idx)}


def historial(id_, carpeta="datos/v3"):
    d = os.path.join(carpeta, "historial")
    out = []
    for n in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        for l in open(os.path.join(d, n), encoding="utf-8"):
            r = json.loads(l)
            if r["id"] == id_:
                out.append(r)
    return out

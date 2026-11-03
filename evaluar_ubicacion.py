# -*- coding: utf-8 -*-
"""Evalúa la ubicación v3 con notas reales: lee el cuerpo de cada nota de los hechos de tránsito y compara con la ubicación anterior.
Uso (en Actions, con internet): python evaluar_ubicacion.py [max_hechos]
Imprime una línea por hecho y un resumen. No escribe nada en docs/."""
import json, sys, time, collections
from concurrent.futures import ThreadPoolExecutor

import informe_hecho as ih
import ubicar_v3 as u

MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 40
NOTAS_POR_HECHO = 2


def leer(par):
    h, n = par
    t0 = time.time()
    texto, estado, real = ih.leer_nota(n["url"])
    return h["id"], n, texto, estado, round(time.time() - t0, 1)


def main():
    geo = u.cargar_geo("geo.json")
    hechos = json.load(open("docs/transito.json", encoding="utf-8"))["hechos"][:MAX]
    pares = [(h, n) for h in hechos for n in (h.get("notas") or [])[:NOTAS_POR_HECHO] if n.get("url")]
    print(f"hechos={len(hechos)} notas a leer={len(pares)}", flush=True)
    with ThreadPoolExecutor(6) as ex:
        leidas = list(ex.map(leer, pares))
    por_hecho = collections.defaultdict(list)
    for hid, n, texto, estado, seg in leidas:
        por_hecho[hid].append((n, texto, estado))
    est = collections.Counter(e.split(" (")[0] for _, _, _, e, _ in leidas)
    print("lectura de notas:", dict(est), flush=True)
    viejo, nuevo = collections.Counter(), collections.Counter()
    cambios = 0
    for h in hechos:
        notas = por_hecho.get(h["id"], [])
        cuerpo = " ".join(t for _, t, _ in notas if t)
        r = u.ubicar(h["titulo"], cuerpo, geo)
        v = "punto-dep" if "(departamento)" in (h.get("lugar") or "") else ("sin ubicar" if not h.get("lat") else "municipio")
        viejo[v] += 1; nuevo[r["precision"]] += 1
        igual = (r["municipio"] or "") in (h.get("lugar") or "")
        cambios += 0 if igual else 1
        marca = "=" if igual else "≠"
        print(f"{marca} [{'cuerpo' if cuerpo else 'titular'}] {h['titulo'][:70]!r} | ANTES: {h.get('lugar') or '-'} | AHORA: {r['municipio'] or r['departamento'] or '-'} ({r['precision']}, {r['puntaje']}) {','.join(r['razones'])[:80]}", flush=True)
    print("RESUMEN antes:", dict(viejo), "| ahora:", dict(nuevo), "| cambian:", cambios, "de", len(hechos), flush=True)


if __name__ == "__main__":
    main()

"""Adaptador del sitio: convierte eventos v3 + hechos al formato que ya lee el front (eventos_unificados.json).
- Quita notas de prensa no relevantes (sin contenido, ruido, fuera de Bolivia).
- Colapsa las notas de un mismo hecho en UN evento (cifra vigente, medios, nº de notas).
- Añade campos nuevos (subtipo, ficha_resumen, acto_oficial, hecho_id, n_notas) que el front puede mostrar.
No toca main ni el motor antiguo: escribe en la ruta que se le indique."""
import json, sys
import hechos_v3


def adaptar(eventos, hechos):
    out, vistos = [], set()
    for e in sorted(eventos, key=lambda e: -e["ts"]):
        if e.get("origen") == "prensa" and e.get("relevante_v3") is not True:
            continue
        hid = e.get("hecho_id")
        if not hid:
            out.append(e); continue
        if hid in vistos or hid not in hechos:
            continue
        vistos.add(hid)
        h = hechos[hid]
        cv = hechos_v3.cifra_vigente(h)
        e = dict(e)
        e.update(hecho_id=hid, n_notas=len(h["notas"]), ts=h["primera"], ts_ult=h["ultima"], lugar=h["lugar"] or e.get("lugar", ""),
                 medios=sorted({n["fuente"] for n in h["notas"]}), estado_hecho=h["estado"],
                 ficha_resumen=hechos_v3.resumen(h), acto_oficial=(h.get("acto_oficial") or {}).get("estado"))
        if "fallecidos" in cv or "heridos" in cv:
            e["cifras"] = {**e.get("cifras", {}), "fallecidos": cv.get("fallecidos", {}).get("valor", 0), "heridos": cv.get("heridos", {}).get("valor", 0), "notas": len(h["notas"])}
        out.append(e)
    return out


if __name__ == "__main__":
    src, hj, dst = sys.argv[1:4]
    ev = json.load(open(src, encoding="utf-8")); hs = json.load(open(hj, encoding="utf-8"))
    r = adaptar(ev["eventos"], hs)
    json.dump({**{k: v for k, v in ev.items() if k != "eventos"}, "n": len(r), "eventos": r}, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
    print(len(ev["eventos"]), "->", len(r))

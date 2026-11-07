"""Datos del módulo de tránsito (v3): un registro por hecho, listo para la página docs/transito_v3.html."""
import json, re, sys
import hechos_v3

TIPOS = [("atropell|arroll", "Atropello"), ("vuelco|vuelc|volc[óo]|volcad", "Vuelco"), ("embarranc|despe[ñn]|cay[óo] a|caída a|barranco", "Embarrancamiento / caída"),
         ("choque|colisi|colision|impact|choc", "Choque / colisión"), ("incendi|explot", "Incendio vehicular")]
VEH = [("bus|[óo]mnibus|flota|micro", "bus"), ("cami[óo]n|volqueta|cisterna|semirremolque", "camión"), ("moto", "moto"), ("ciclista|bicicleta", "bicicleta"), ("minibus|minib[úu]s|trufi", "minibús")]


def _cls(txt, lista, otro):
    t = txt.lower()
    for rx, n in lista:
        if re.search(rx, t):
            return n
    return otro


def construir(hechos):
    out = []
    for h in hechos.values():
        if h["subtipo"] != "accidente de tránsito":
            continue
        cv = hechos_v3.cifra_vigente(h)
        titulo = max(h["notas"], key=lambda n: len(n["titulo"]))["titulo"]
        f, he = cv.get("fallecidos", {}).get("valor"), cv.get("heridos", {}).get("valor")
        out.append({"id": h["id"], "ts": h["primera"], "ultima": h["ultima"], "titulo": titulo, "tipo": _cls(titulo, TIPOS, "Otro / sin detalle"),
                    "vehiculo": _cls(titulo, VEH, "no informado"), "lugar": h["lugar"], "departamento": h["departamento"], "precision": h["precision"],
                    "lat": h["lat"], "lon": h["lon"], "fallecidos": f or 0, "heridos": he or 0,
                    "victimas": "cifra" if (f or he) else "sin víctimas reportadas", "n_notas": len(h["notas"]),
                    "medios": sorted({n["fuente"] for n in h["notas"]}), "sin_confirmar": not any(n["oficial"] for n in h["notas"]), "url": h["notas"][0]["url"]})
    return sorted(out, key=lambda r: -r["ts"])


if __name__ == "__main__":
    hs = json.load(open(sys.argv[1], encoding="utf-8")); r = construir(hs)
    ini = json.load(open("datos/v3/inicio_captura.json")) if __import__("os").path.exists("datos/v3/inicio_captura.json") else {}
    json.dump({"inicio_captura": ini.get("desde"), "generado": max((x["ultima"] for x in r), default=0), "n": len(r), "hechos": r}, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
    print(len(r))

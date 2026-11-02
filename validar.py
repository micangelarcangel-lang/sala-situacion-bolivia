# -*- coding: utf-8 -*-
"""Valida los eventos contra esquema_evento_v1.json y mide las reglas de calidad de la v3.

Uso:
    python validar.py docs/eventos_unificados.json            # informe
    python validar.py docs/eventos_unificados.json --estricto # sale con error si algún evento no cumple el esquema
    python validar.py docs/eventos_unificados.json --json informe.json

Reglas de calidad (línea base de la v3, se miden pero no bloquean salvo --estricto):
  centroide_departamental : punto dibujado con ubicación solo por departamento
  prensa_sin_cuerpo       : nota de prensa sin detalle leído
  prensa_sin_ubicar       : nota de prensa sin ubicación
  victimas_sin_ubicacion_precisa : hecho con víctimas sin punto ni municipio
"""
import json, sys, os, argparse, collections

AQUI = os.path.dirname(os.path.abspath(__file__))


def cargar_esquema():
    with open(os.path.join(AQUI, "esquema_evento_v1.json"), encoding="utf-8") as f:
        return json.load(f)


def cargar_eventos(ruta):
    with open(ruta, encoding="utf-8") as f:
        d = json.load(f)
    return d["eventos"] if isinstance(d, dict) else d


def errores_esquema(eventos, esquema):
    from jsonschema import Draft202012Validator
    v = Draft202012Validator(esquema)
    salida = []
    for e in eventos:
        for err in sorted(v.iter_errors(e), key=lambda x: list(x.path)):
            ruta = ".".join(str(p) for p in err.path) or "(raíz)"
            salida.append({"id": e.get("id", "?"), "origen": e.get("origen", "?"), "campo": ruta, "error": err.message[:160]})
    return salida


def reglas_calidad(eventos):
    r = collections.OrderedDict((k, []) for k in ("centroide_departamental", "prensa_sin_cuerpo", "prensa_sin_ubicar", "victimas_sin_ubicacion_precisa"))
    for e in eventos:
        metodo = (e.get("metodo") or "")
        punto = e.get("lat") is not None and e.get("lon") is not None
        if punto and metodo.startswith("nombre de departamento"):
            r["centroide_departamental"].append(e["id"])
        if e.get("origen") == "prensa":
            if not (e.get("detalle") or "").strip():
                r["prensa_sin_cuerpo"].append(e["id"])
            if metodo == "sin ubicar":
                r["prensa_sin_ubicar"].append(e["id"])
        c = e.get("cifras") or {}
        if (c.get("fallecidos") or 0) + (c.get("heridos") or 0) > 0:
            prec = e.get("precision_ubicacion")
            preciso = prec in ("punto", "municipio") or (prec is None and punto and not metodo.startswith("nombre de departamento"))
            if not preciso:
                r["victimas_sin_ubicacion_precisa"].append(e["id"])
    return r


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("ruta")
    ap.add_argument("--estricto", action="store_true")
    ap.add_argument("--json")
    a = ap.parse_args(argv)
    eventos = cargar_eventos(a.ruta)
    esquema = cargar_esquema()
    errs = errores_esquema(eventos, esquema)
    con_error = {x["id"] for x in errs}
    cal = reglas_calidad(eventos)
    prensa = sum(1 for e in eventos if e.get("origen") == "prensa")
    victimas = sum(1 for e in eventos if ((e.get("cifras") or {}).get("fallecidos") or 0) + ((e.get("cifras") or {}).get("heridos") or 0) > 0)
    base = {"prensa_sin_cuerpo": prensa, "prensa_sin_ubicar": prensa, "victimas_sin_ubicacion_precisa": victimas}
    print(f"Eventos: {len(eventos)} | validan el esquema: {len(eventos) - len(con_error)} ({100 * (len(eventos) - len(con_error)) / max(1, len(eventos)):.1f} %)")
    if errs:
        por_campo = collections.Counter((x["origen"], x["campo"], x["error"][:60]) for x in errs)
        for (o, c, m), n in por_campo.most_common(8):
            print(f"  esquema · {o} · {c}: {m} (x{n})")
    print("Reglas de calidad:")
    for k, ids in cal.items():
        den = base.get(k)
        extra = f" de {den} ({100 * len(ids) / max(1, den):.0f} %)" if den else ""
        print(f"  {k}: {len(ids)}{extra}")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump({"eventos": len(eventos), "con_error_esquema": len(con_error), "errores": errs[:200], "calidad": {k: len(v) for k, v in cal.items()}, "prensa": prensa, "con_victimas": victimas}, f, ensure_ascii=False, indent=1)
    if a.estricto and errs:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

# -*- coding: utf-8 -*-
"""Flujo v3 en paralelo al sistema actual. NO envía correos ni toca docs/ de producción.
Lee los eventos que ya genera el sistema actual (docs/eventos_unificados.json), los pasa por las etapas v3 y escribe en datos/v3/:
  eventos_v3.json  (ubicación, víctimas, grupos, servicios cercanos, nivel de evidencia)
  boletin.pdf      (boletín breve)
  control_calidad.json (reglas de calidad antes y después, tiempos por etapa)
Cada etapa mide su tiempo: si una falla, las demás siguen y el fallo queda en control_calidad.json."""
import json, os, sys, time, collections, traceback
import ubicar_v3, victimas_v3, agrupar_v3, servicios_cercanos, reporte_v3, validar

SALIDA = "datos/v3"


def etapa(nombre, f, ctl):
    ini = time.time()
    try:
        r = f()
        ctl["etapas"][nombre] = {"ok": True, "seg": round(time.time() - ini, 1)}
        return r
    except Exception as e:
        ctl["etapas"][nombre] = {"ok": False, "seg": round(time.time() - ini, 1), "error": f"{type(e).__name__}: {str(e)[:200]}", "traza": traceback.format_exc()[-400:]}
        print("FALLÓ", nombre, e, flush=True)
        return None


def main():
    os.makedirs(SALIDA, exist_ok=True)
    ctl = {"etapas": {}}
    eventos = validar.cargar_eventos("docs/eventos_unificados.json")
    textos = json.load(open("docs/textos_hechos.json", encoding="utf-8")).get("hechos", {}) if os.path.exists("docs/textos_hechos.json") else {}
    ctl["antes"] = validar.reglas_calidad(eventos)
    def leer_cuerpos(presupuesto_seg=240, hilos=8, tope=150):
        """Lee la nota completa de la prensa que solo tiene titular. Guarda caché en datos/v3/cuerpos.json para no repetir."""
        import informe_hecho
        from concurrent.futures import ThreadPoolExecutor, as_completed
        ruta = f"{SALIDA}/cuerpos.json"
        cache = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {}
        ahora = time.time()
        cache = {u: c for u, c in cache.items() if ahora - c.get("t", 0) < 7 * 86400}
        pend = [e for e in sorted((x for x in eventos if x.get("origen") == "prensa" and x.get("url")), key=reporte_v3.prioridad, reverse=True)
                if e["url"] not in cache and not (textos.get(e["id"], {}).get("notas"))][:tope]
        est = collections.Counter()
        ini = time.time()
        with ThreadPoolExecutor(hilos) as ex:
            futs = {ex.submit(informe_hecho.leer_nota, e["url"]): e["url"] for e in pend}
            for f in as_completed(futs):
                u = futs[f]
                try:
                    t, estado, real = f.result()
                except Exception as err:
                    t, estado, real = "", f"error {type(err).__name__}", u
                cache[u] = {"texto": t[:3500], "estado": estado.split(" (")[0], "t": ahora}
                est[cache[u]["estado"]] += 1
                if time.time() - ini > presupuesto_seg:
                    for g in futs:
                        g.cancel()
                    break
        json.dump(cache, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
        return {"leidas_ahora": sum(est.values()), "estados": dict(est), "en_cache": len(cache), "pendientes": max(0, len(pend) - sum(est.values()))}
    ctl["lectura_cuerpos"] = etapa("leer_cuerpos", leer_cuerpos, ctl)
    cache_cuerpos = json.load(open(f"{SALIDA}/cuerpos.json", encoding="utf-8")) if os.path.exists(f"{SALIDA}/cuerpos.json") else {}
    geo = etapa("cargar_geografia", lambda: ubicar_v3.cargar_geo("geo.json"), ctl)

    def enriquecer():
        n = collections.Counter()
        for e in eventos:
            if e.get("origen") != "prensa":
                continue
            cuerpo = " ".join(nota.get("texto") or "" for nota in (textos.get(e["id"], {}).get("notas") or [])) or (cache_cuerpos.get(e.get("url"), {}).get("texto") or "")
            e["cuerpo_leido"] = len(cuerpo) > 300
            r = ubicar_v3.ubicar(e["titulo"], cuerpo, geo)
            e["precision_ubicacion"] = r["precision"]
            e["metodo"] = "sin ubicar" if r["precision"] == "ninguna" else "v3: " + r["motivo"] + (" (" + ", ".join(r["razones"][:3]) + ")" if r["razones"] else "")
            if e["cuerpo_leido"] and not (e.get("detalle") or "").strip():
                e["detalle"] = cuerpo[:700]
            n[r["precision"]] += 1
            if r["precision"] == "municipio":
                e.update(lugar=f'{r["municipio"]}, {r["departamento"]}', lat=r["lat"], lon=r["lon"], departamentos=[r["departamento"]])
            elif r["precision"] in ("departamento", "tramo") and r["departamento"]:
                e.update(lat=None, lon=None, departamentos=[r["departamento"]], lugar=f'{r["departamento"]} ({r["precision"]})')
            else:
                e.update(lat=None, lon=None)
            v = victimas_v3.extraer(e["titulo"], cuerpo)
            vic = {}
            for k in ("fallecidos", "heridos"):
                if v[k]:
                    vic[k + "_min"] = v[k][0]
                    if v[k][1] is not None:
                        vic[k + "_max"] = v[k][1]
            if vic:
                e["victimas"] = vic
            e["schema_version"] = 1
        return dict(n)
    ctl["ubicacion"] = etapa("enriquecer", enriquecer, ctl) if geo else None

    def grupos():
        idx = [i for i, e in enumerate(eventos) if e.get("origen") == "prensa"]
        fichas = [{"titulo": eventos[i]["titulo"], "ts": eventos[i].get("ts"), "departamento": (eventos[i].get("departamentos") or [None])[0],
                   "municipio": (eventos[i].get("lugar") or "").split(",")[0] if eventos[i].get("precision_ubicacion") == "municipio" else None,
                   "fallecidos": (eventos[i].get("victimas") or {}).get("fallecidos_min")} for i in idx]
        gs = [g for g in agrupar_v3.agrupar(fichas) if len(g["indices"]) > 1]
        for g in gs:
            ids = [eventos[idx[i]]["id"] for i in g["indices"]]
            for i in g["indices"]:
                eventos[idx[i]]["grupo_propuesto"] = ids
        return {"grupos_con_mas_de_un_evento": len(gs), "ejemplos": [[eventos[idx[i]]["titulo"][:70] for i in g["indices"]] for g in gs[:5]]}
    ctl["agrupacion"] = etapa("agrupar", grupos, ctl)

    def servicios():
        s = json.load(open("datos/servicios_osm.json", encoding="utf-8"))["servicios"]
        top = sorted([e for e in eventos if e.get("lat") is not None], key=reporte_v3.prioridad, reverse=True)[:20]
        for e in top:
            e["servicios_cercanos"] = {t: [{k: x[k] for k in ("nombre", "km", "telefono") if k in x} for x in l] for t, l in servicios_cercanos.cercanos(e["lat"], e["lon"], s).items()}
        return len(top)
    etapa("servicios_cercanos", servicios, ctl)
    json.dump({"generado": int(time.time() * 1000), "n": len(eventos), "eventos": eventos}, open(f"{SALIDA}/eventos_v3.json", "w", encoding="utf-8"), ensure_ascii=False)
    ctl["despues"] = validar.reglas_calidad(eventos)
    etapa("boletin", lambda: reporte_v3.build(eventos, f"{SALIDA}/boletin.pdf", 24, None, "docs/geo_dep.geojson"), ctl)
    json.dump(ctl, open(f"{SALIDA}/control_calidad.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("CALIDAD (antes -> después)", {k: (len(ctl["antes"][k]), len(ctl["despues"][k])) for k in ctl["antes"]}); print("ETAPAS", {k: (v["ok"], v["seg"]) for k, v in ctl["etapas"].items()})
    print("CUERPOS", ctl.get("lectura_cuerpos")); print("UBICACION", ctl.get("ubicacion")); print("AGRUPACION", ctl.get("agrupacion"))


if __name__ == "__main__":
    main()

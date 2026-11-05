# -*- coding: utf-8 -*-
"""Flujo v3 en paralelo al sistema actual. NO envía correos ni toca docs/ de producción.
Lee los eventos que ya genera el sistema actual (docs/eventos_unificados.json), los pasa por las etapas v3 y escribe en datos/v3/:
  eventos_v3.json  (ubicación, víctimas, grupos, servicios cercanos, nivel de evidencia)
  boletin.pdf      (boletín breve)
  control_calidad.json (reglas de calidad antes y después, tiempos por etapa)
Cada etapa mide su tiempo: si una falla, las demás siguen y el fallo queda en control_calidad.json."""
import re, json, os, sys, time, collections, traceback
import oficial_v3, reporte_periodico_v3, fecha_v3, hechos_v3, ficha_v3, captar_v3, lugares_v3, almacen_v3, clasificar_v3, ubicar_v3, victimas_v3, agrupar_v3, servicios_cercanos, reporte_v3, validar

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


PUNTUALES = ("accidente de tránsito", "incendio estructural", "colapso estructural", "explosión / fuga", "accidente aéreo", "intoxicación por gases (mina)")


def _grandes(e):
    """Cifras >= 10.000 del titular y del primer párrafo ('114 mil', '114.048'): sirven para unir notas del mismo hecho."""
    t = clasificar_v3.norm((e.get("titulo") or "") + " . " + (e.get("detalle") or "")[:500])
    out = set()
    for m in re.finditer(r"\b(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(mil\b)?", t):
        try:
            v = float(m.group(1).replace(".", "").replace(",", "")) * (1000 if m.group(2) else 1)
        except ValueError:
            continue
        if 10000 <= v <= 50_000_000 and not (1900 <= v <= 2100):
            out.add(v)
    return sorted(out)


def norm_t(t):
    return clasificar_v3.norm(t)


def main():
    os.makedirs(SALIDA, exist_ok=True)
    ctl = {"etapas": {}}
    eventos = validar.cargar_eventos("docs/eventos_unificados.json")
    textos = json.load(open("docs/textos_hechos.json", encoding="utf-8")).get("hechos", {}) if os.path.exists("docs/textos_hechos.json") else {}
    ctl["antes"] = validar.reglas_calidad(eventos)
    def _texto_disp(e):
        notas = " ".join(n.get("texto") or "" for n in (textos.get(e["id"], {}).get("notas") or []))
        det = e.get("detalle") or ""
        if re.match(r"^\d+ notas? de \d+ fuente", det.strip()):
            det = ""
        return max(len(notas), len(det))

    def leer_cuerpos(presupuesto_seg=240, hilos=8, tope=150):
        """Lee la nota completa de la prensa que solo tiene titular. Guarda caché en datos/v3/cuerpos.json para no repetir."""
        import informe_hecho
        from concurrent.futures import ThreadPoolExecutor, as_completed
        ruta = f"{SALIDA}/cuerpos.json"
        cache = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {}
        ahora = time.time()
        cache = {u: c for u, c in cache.items() if ahora - c.get("t", 0) < 7 * 86400}
        pend = [e for e in sorted((x for x in eventos if x.get("origen") == "prensa" and x.get("url")), key=reporte_v3.prioridad, reverse=True)
                if e["url"] not in cache and _texto_disp(e) < 1200][:tope]
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
    def captar_feeds(ventana_h=72):
        """Notas nuevas desde feeds RSS verificados (fuentes.yml). Se agregan solo las que la v3 clasifica como relevantes de Bolivia."""
        import yaml, hashlib
        feeds = [f for fu in yaml.safe_load(open("fuentes.yml", encoding="utf-8"))["fuentes"] for f in fu.get("feeds", [])]
        notas, estado = captar_v3.captar(feeds)
        conocidas = {e.get("url") for e in eventos}
        corte = int(time.time() * 1000) - ventana_h * 3600000
        nuevas = descartadas = 0
        pendientes = []
        for n in notas:
            if n["url"] in conocidas or (n["ts_publicacion"] or 0) < corte:
                continue
            if not clasificar_v3.clasificar(n["titulo"], n["cuerpo"])["relevante"]:
                descartadas += 1
                continue
            pendientes.append(n)
        # los feeds con solo resumen: se lee la página completa, solo de las notas que ya parecen relevantes por el titular
        cortas = [n for n in pendientes if len(n["cuerpo"]) < 300]
        leidas = collections.Counter()
        if cortas:
            import informe_hecho
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(8) as ex:
                for n, (t, est_pag, real) in zip(cortas, ex.map(lambda x: informe_hecho.leer_nota(x["url"]), cortas)):
                    leidas[est_pag.split(" (")[0]] += 1
                    if t:
                        n["cuerpo"] = t[:4000]
        for n in pendientes:
            cl = clasificar_v3.clasificar(n["titulo"], n["cuerpo"], False, True)  # con la página leída: ahora sí exige evidencia de Bolivia
            if not cl["relevante"]:
                descartadas += 1
                continue
            cache_cuerpos[n["url"]] = {"texto": n["cuerpo"], "estado": "texto completo", "t": time.time()}
            eventos.append({"id": "noticia:v3:" + hashlib.sha1(n["url"].encode()).hexdigest()[:12], "origen": "prensa", "categoria": cl["categoria"], "titulo": n["titulo"], "ts": n["ts_publicacion"], "ts_publicacion": n["ts_publicacion"],
                            "fuente": n["medio"], "url": n["url"], "oficial": False, "departamentos": [], "cifras": {}, "lugar": "", "lat": None, "lon": None, "nivel_txt": "Sin nivel (prensa, sin verificar)", "nivel": 0,
                            "confianza": {"nivel": "Baja", "fuentes_independientes": 1, "puntaje": 20}, "via_captacion": "rss", "metodo": "sin ubicar"})
            nuevas += 1
        return {"feeds": estado, "notas_leidas": len(notas), "eventos_nuevos": nuevas, "descartadas_por_no_relevantes": descartadas, "paginas_leidas": dict(leidas)}
    ctl["lectura_cuerpos"] = etapa("leer_cuerpos", leer_cuerpos, ctl)
    cache_cuerpos = json.load(open(f"{SALIDA}/cuerpos.json", encoding="utf-8")) if os.path.exists(f"{SALIDA}/cuerpos.json") else {}
    ctl["captar_feeds"] = etapa("captar_feeds", captar_feeds, ctl)
    geo = etapa("cargar_geografia", lambda: ubicar_v3.cargar_geo("geo.json"), ctl)

    indice_lugares = localizador = None
    def cargar_lugares():
        nonlocal indice_lugares, localizador
        L = json.load(open("datos/lugares_osm.json", encoding="utf-8"))["lugares"]
        S = json.load(open("datos/servicios_osm.json", encoding="utf-8"))["servicios"]
        localizador = ubicar_v3.crear_localizador("geo.json")
        indice_lugares = lugares_v3.indexar(L, S, [m["n"] for m in json.load(open("geo.json", encoding="utf-8"))["mun"]])
        return len(indice_lugares)
    etapa("cargar_lugares", cargar_lugares, ctl)

    def enriquecer():
        n = collections.Counter()
        for e in eventos:
            if e.get("origen") != "prensa":
                continue
            c_notas = " ".join(nota.get("texto") or "" for nota in (textos.get(e["id"], {}).get("notas") or []))
            c_cache = cache_cuerpos.get(e.get("url"), {}).get("texto") or ""
            cuerpo = max([c_notas, c_cache], key=len)
            e["cuerpo_leido"] = len(cuerpo) > 300
            pub = e.get("ts_publicacion") or e.get("ts") or 0
            pre = clasificar_v3.clasificar(e["titulo"], cuerpo)
            fh = fecha_v3.fecha_hecho(cuerpo, pub)
            if fh:
                e["fecha_hecho"] = fh
            fh0 = fecha_v3.fecha_hecho(cuerpo[:200], pub)  # fecha pegada al inicio de la nota (fechado o primera frase)
            if fh0 and pub - fh0 > 7 * 86400000 and pre["subtipo"] in PUNTUALES:  # solo hechos puntuales; en brotes o sequías una fecha del texto suele ser otra cosa (inicio, plazo)
                e.update(ts_publicacion=pub, ts=fh0, hecho_antiguo=True)
            elif e.get("hecho_antiguo"):  # corrida anterior con una regla más amplia: se devuelve la fecha de publicación
                e.update(ts=pub, hecho_antiguo=False)
            r = ubicar_v3.ubicar(e["titulo"], cuerpo, geo, puntual=pre["subtipo"] in PUNTUALES)
            e["precision_ubicacion"] = r["precision"]
            e["metodo"] = "sin ubicar" if r["precision"] == "ninguna" else "v3: " + r["motivo"] + (" (" + ", ".join(r["razones"][:3]) + ")" if r["razones"] else "")
            if e["cuerpo_leido"] and not (e.get("detalle") or "").strip():
                e["detalle"] = cuerpo[:700]
            n[r["precision"]] += 1
            if r["precision"] == "municipio":
                e.update(lugar=f'{r["municipio"]}, {r["departamento"]}', lat=r["lat"], lon=r["lon"], departamentos=[r["departamento"]])
            elif r["precision"] == "tramo":
                e.update(lat=None, lon=None, departamentos=r.get("departamentos") or [r["departamento"]], lugar="Tramo " + (r.get("tramo") or ""))
            elif r["precision"] == "varios":
                e.update(lat=None, lon=None, departamentos=[d for d in [r.get("departamento")] if d], lugar=", ".join(r.get("lugares") or []) + (f', {r["departamento"]}' if r.get("departamento") else ""), lugares=r.get("lugares"))
            elif r["precision"] == "nacional":
                e.update(lat=None, lon=None, departamentos=[], lugar="Nacional (varios departamentos)")
            elif r["precision"] == "departamento" and (r.get("departamentos") or r.get("departamento")):
                deps = r.get("departamentos") or [r["departamento"]]
                e.update(lat=None, lon=None, departamentos=deps, lugar=" y ".join(deps) + (" (solo departamento)" if len(deps) == 1 else " (solo departamentos)"))
            else:
                e.update(lat=None, lon=None, lugar="", departamentos=[])  # sin ubicación confiable: no se deja el lugar que puso el sistema anterior
            cl = clasificar_v3.clasificar(e["titulo"], cuerpo, e["precision_ubicacion"] in ("municipio", "departamento", "tramo", "varios", "nacional"), True)
            e.update(subtipo=cl["subtipo"] or "sin clasificar", ambito=cl["ambito"], relevante_v3=cl["relevante"])
            if cl["categoria"]:
                e["categoria"] = cl["categoria"]
            n["relevante"] += cl["relevante"]; n["exterior"] += cl["ambito"] == "exterior"
            e["acto_oficial"] = oficial_v3.detectar_acto(e["titulo"], cuerpo) if cl["relevante"] else None
            n["con_acto_oficial"] += bool(e["acto_oficial"])
            if cl["relevante"] and r["precision"] in ("ninguna", "departamento") and indice_lugares is not None:
                hit = lugares_v3.buscar(e["titulo"], cuerpo, indice_lugares, localizador, (e.get("departamentos") or [None])[0])
                if hit and hit.get("municipio"):
                    e.update(lat=round(hit["lat"], 5), lon=round(hit["lon"], 5), departamentos=[hit["departamento"]], lugar=f'{hit["nombre"]}, {hit["municipio"]}', precision_ubicacion="punto",
                             metodo=f'v3: lugar conocido ({hit["tipo"]}: {hit["nombre"]})')
                    n["por_lugar_conocido"] += 1
            if not cl["subtipo"]:
                e.pop("ficha", None); e.pop("ficha_resumen", None); e["informacion_insuficiente"] = False
                continue_ficha = False
            else:
                continue_ficha = True
            ficha = ficha_v3.extraer(cl["subtipo"] or "sin clasificar", e["titulo"], cuerpo) if continue_ficha else {"campos": {}, "faltan": [], "completitud": None}
            if continue_ficha:
                e["ficha"], e["ficha_resumen"] = ficha, ficha_v3.resumen(ficha)
            # víctimas: solo cifras reales (nunca "2 o más"); sin_victimas queda como 0 explícito
            vic = {}
            for k in ("fallecidos", "heridos"):
                c = ficha["campos"].get(k) or {}
                if c.get("estado") in ("cifra", "sin_victimas"):
                    vic[k + "_min"] = vic[k + "_max"] = c["valor"]
            e.pop("victimas", None)
            if continue_ficha:  # las cifras del sistema anterior no son confiables (p. ej. "30 viviendas" leído como 30 fallecidos): se reemplazan por las de la ficha
                e["cifras"] = {"fallecidos": vic.get("fallecidos_min", 0), "heridos": vic.get("heridos_min", 0), "notas": (e.get("cifras") or {}).get("notas", 0)}
            if vic:
                e["victimas"] = vic
            adv = []
            if e["precision_ubicacion"] in ("ninguna", "departamento", "nacional") and cl["subtipo"] in PUNTUALES:
                adv.append("hecho puntual sin lugar exacto")
            if re.search(r"\b(gobierno|ministr\w+|viceministr\w+|presidente|autoridades nacionales)\b", norm_t(e["titulo"])) or e["precision_ubicacion"] == "nacional":
                e["requiere_corroboracion"] = True; adv.append("alcance nacional o dato oficial: corroborar en otros medios")
            if cl["subtipo"] and len(cuerpo) < 300 and not any(v.get("estado") in ("cifra", "sin_victimas") for v in ficha["campos"].values()):
                adv.append("reporte vago: verificar antes de usar")
            e["advertencia"] = "; ".join(adv) if adv else None
            e["informacion_insuficiente"] = bool(len(e["titulo"].split()) <= 3 and not cuerpo and r["precision"] == "ninguna")
            e["schema_version"] = 1
        return dict(n)
    ctl["ubicacion"] = etapa("enriquecer", enriquecer, ctl) if geo else None

    def grupos():
        idx = [i for i, e in enumerate(eventos) if e.get("origen") == "prensa"]
        fichas = [{"titulo": eventos[i]["titulo"], "ts": eventos[i].get("ts"), "departamento": (eventos[i].get("departamentos") or [None])[0],
                   "municipio": (eventos[i].get("lugar") or "").split(",")[0] if eventos[i].get("precision_ubicacion") == "municipio" else None,
                   "fallecidos": (eventos[i].get("victimas") or {}).get("fallecidos_min"), "subtipo": eventos[i].get("subtipo"), "grandes": _grandes(eventos[i])} for i in idx]
        gs = [g for g in agrupar_v3.agrupar(fichas) if len(g["indices"]) > 1]
        for g in gs:
            ids = [eventos[idx[i]]["id"] for i in g["indices"]]
            for i in g["indices"]:
                eventos[idx[i]]["grupo_propuesto"] = ids
        por_id = {e["id"]: e for e in eventos}
        for e in eventos:
            if e.get("requiere_corroboracion"):
                fuentes = {por_id[i].get("fuente") for i in (e.get("grupo_propuesto") or [e["id"]]) if i in por_id}
                e["corroborada"] = len(fuentes) >= 2
                if e["corroborada"]:
                    e["advertencia"] = "; ".join(x for x in (e.get("advertencia") or "").split("; ") if "corroborar" not in x) or None
        return {"grupos_con_mas_de_un_evento": len(gs), "ejemplos": [[eventos[idx[i]]["titulo"][:70] for i in g["indices"]] for g in gs[:5]]}
    ctl["agrupacion"] = etapa("agrupar", grupos, ctl)

    def hechos():
        ruta = f"{SALIDA}/hechos.json"
        previos = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {}
        ahora = int(time.time() * 1000)
        for ev in eventos:
            ev["_grandes"] = _grandes(ev)
        hs = hechos_v3.actualizar(eventos, previos, ahora)
        por_nota = {n["id"]: h for h in hs.values() for n in h["notas"]}
        for ev in eventos:
            ev.pop("_grandes", None)
            if ev["id"] in por_nota:
                ev["hecho_id"] = por_nota[ev["id"]]["id"]
        for h in hs.values():
            for n in h["notas"]:
                n.pop("grandes", None)
        # triangulación con medios oficiales: un acto (declaratoria, decreto, ley, ordenanza) por hecho, buscado según su alcance; caché de 24 h
        actos = {ev["id"]: ev.get("acto_oficial") for ev in eventos if ev.get("acto_oficial")}
        ruta_c = f"{SALIDA}/oficial_cache.json"
        cache = json.load(open(ruta_c, encoding="utf-8")) if os.path.exists(ruta_c) else {}
        cache = {k: v for k, v in cache.items() if ahora - v.get("t", 0) < 24 * 3600000}
        verif = col = 0
        for h in sorted(hs.values(), key=lambda x: -len(x["notas"])):
            ac = [actos[n["id"]] for n in h["notas"] if n["id"] in actos]
            if not ac:
                h.pop("acto_oficial", None); continue
            alc = collections.Counter(a["alcance"] for a in ac).most_common()
            top = next(a for a in ac if a["alcance"] == alc[0][0])
            clave = "|".join(str(x) for x in (top["alcance"], top["tipo"], top.get("numero"), h["subtipo"], h.get("departamento"), (h["notas"][-1].get("municipio"))))
            if clave not in cache and verif < 10:
                cache[clave] = {"t": ahora, "r": oficial_v3.verificar(top, h["subtipo"], h.get("departamento"), h["notas"][-1].get("municipio"))}; verif += 1
            if clave in cache:
                h["acto_oficial"] = cache[clave]["r"]; col += cache[clave]["r"]["estado"] == "verificado"
            else:
                h["acto_oficial"] = dict(top, estado="pendiente_de_verificar")
        json.dump(cache, open(ruta_c, "w", encoding="utf-8"), ensure_ascii=False)
        json.dump(hs, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
        ab = [h for h in hs.values() if h["estado"] == "abierto"]
        return {"hechos": len(hs), "con_acto_oficial": sum(1 for h in hs.values() if h.get("acto_oficial")), "actos_verificados": col, "abiertos": len(ab), "con_varias_notas": sum(len(h["notas"]) > 1 for h in hs.values()), "reabiertos": sum(h["reaperturas"] > 0 for h in hs.values()),
                "ejemplos": [[h["subtipo"], h["lugar"], len(h["notas"]), hechos_v3.resumen(h)[:80]] for h in sorted(hs.values(), key=lambda h: -len(h["notas"]))[:4]]}
    ctl["hechos"] = etapa("hechos", hechos, ctl)

    def servicios():
        s = json.load(open("datos/servicios_osm.json", encoding="utf-8"))["servicios"]
        top = sorted([e for e in eventos if e.get("lat") is not None], key=reporte_v3.prioridad, reverse=True)[:20]
        for e in top:
            e["servicios_cercanos"] = {t: [{k: x[k] for k in ("nombre", "km", "telefono") if k in x} for x in l] for t, l in servicios_cercanos.cercanos(e["lat"], e["lon"], s).items()}
        return len(top)
    etapa("servicios_cercanos", servicios, ctl)
    ctl["almacen"] = etapa("almacen", lambda: almacen_v3.actualizar(eventos, SALIDA), ctl)
    json.dump({"generado": int(time.time() * 1000), "n": len(eventos), "eventos": eventos}, open(f"{SALIDA}/eventos_v3.json", "w", encoding="utf-8"), ensure_ascii=False)
    ctl["despues"] = validar.reglas_calidad(eventos)
    etapa("boletin", lambda: reporte_v3.build(eventos, f"{SALIDA}/boletin.pdf", 24, None, "docs/geo_dep.geojson", json.load(open(f"{SALIDA}/hechos.json", encoding="utf-8")) if os.path.exists(f"{SALIDA}/hechos.json") else None), ctl)
    def periodicos():
        hs = json.load(open(f"{SALIDA}/hechos.json", encoding="utf-8"))
        ahora = int(time.time() * 1000)
        geo_dep = json.load(open("docs/geo_dep.geojson", encoding="utf-8"))
        ruta_i = f"{SALIDA}/inicio_captura.json"  # desde cuándo el sistema captura de forma continua: los boletines no comparan contra períodos anteriores a esta fecha
        if not os.path.exists(ruta_i):
            json.dump({"desde": ahora - 72 * 3600000}, open(ruta_i, "w", encoding="utf-8"))
        ini_c = json.load(open(ruta_i, encoding="utf-8"))["desde"]
        return {"semanal": reporte_periodico_v3.build_semanal(hs, ahora, f"{SALIDA}/boletin_semanal.pdf", geo_dep, ini_c), "mensual": reporte_periodico_v3.build_mensual(hs, ahora, f"{SALIDA}/boletin_mensual.pdf", geo_dep, ini_c)}
    etapa("periodicos", periodicos, ctl)
    json.dump(ctl, open(f"{SALIDA}/control_calidad.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("CALIDAD (antes -> después)", {k: (len(ctl["antes"][k]), len(ctl["despues"][k])) for k in ctl["antes"]}); print("ETAPAS", {k: (v["ok"], v["seg"]) for k, v in ctl["etapas"].items()})
    print("ALMACEN", ctl.get("almacen")); print("FEEDS", ctl.get("captar_feeds")); print("CUERPOS", ctl.get("lectura_cuerpos")); print("UBICACION", ctl.get("ubicacion")); print("AGRUPACION", ctl.get("agrupacion")); print("HECHOS", ctl.get("hechos"))


if __name__ == "__main__":
    main()

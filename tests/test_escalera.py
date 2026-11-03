# -*- coding: utf-8 -*-
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import escalera

HTML = ("<html><body><article>" + "Informe de situación de emergencias en Bolivia. " * 20 + "</article></body></html>").encode()


def f_bloqueada(url, t=0):
    return {"via": "directa", "estado": 403, "crudo": b"Access Denied", "tipo": "text/html", "seg": 0.1}


def f_caida(url, t=0):
    return {"via": "navegador", "estado": None, "error": "TimeoutError", "seg": 30}


def f_ok(via, extra=None):
    def f(url, t=0):
        r = {"via": via, "estado": 200, "crudo": HTML, "tipo": "text/html", "seg": 0.5}
        r.update(extra or {})
        return r
    return f


def test_primera_via_que_funciona_gana():
    r = escalera.obtener("https://x.bo", fetchers={"directa": f_ok("directa"), "navegador": f_ok("navegador")})
    assert r["ok"] and r["via"] == "directa" and len(r["intentos"]) == 1


def test_bloqueo_pasa_a_la_siguiente_via():
    r = escalera.obtener("https://x.bo", fetchers={"directa": f_bloqueada, "navegador": f_caida, "archivo": f_ok("archivo", {"edad_dias": 3, "fecha_captura": "2026-10-30"})})
    assert r["ok"] and r["via"] == "archivo" and r["desactualizado"] is False
    assert [i["via"] for i in r["intentos"]] == ["directa", "navegador", "archivo"]
    assert r["intentos"][0]["bloqueo"] is True


def test_copia_archivada_vieja_se_marca_desactualizada():
    r = escalera.obtener("https://x.bo", fetchers={"directa": f_bloqueada, "navegador": f_caida, "archivo": f_ok("archivo", {"edad_dias": 400})}, max_dias=30)
    assert r["ok"] is False and r["desactualizado"] is True and r["edad_dias"] == 400 and r["texto"]


def test_todas_fallan_no_deja_en_blanco_el_registro():
    r = escalera.obtener("https://x.bo", fetchers={"directa": f_bloqueada, "navegador": f_caida, "archivo": f_caida})
    assert r["ok"] is False and r["via"] is None and len(r["intentos"]) == 3


def test_texto_corto_no_es_util():
    corto = lambda url, t=0: {"via": "directa", "estado": 200, "crudo": b"<html>ok</html>", "tipo": "text/html", "seg": 0.1}
    r = escalera.obtener("https://x.bo", vias=("directa",), fetchers={"directa": corto})
    assert r["ok"] is False


def test_registrar_panel(tmp_path):
    r = escalera.obtener("https://x.bo", fetchers={"directa": f_ok("directa")})
    ruta = tmp_path / "estado_vias.json"
    escalera.registrar({"fuente_a": r}, str(ruta))
    d = json.loads(ruta.read_text(encoding="utf-8"))
    assert d["fuentes"]["fuente_a"]["via"] == "directa"

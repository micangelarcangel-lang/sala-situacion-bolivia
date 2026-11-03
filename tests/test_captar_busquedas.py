import os, sys, json
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import captar_busquedas as c


def test_evento_minimo_cumple_el_esquema():
    import jsonschema
    esq = json.load(open(os.path.join(RAIZ, "esquema_evento_v1.json"), encoding="utf-8"))
    e = c.a_evento({"titulo": "Defensa Civil reporta riadas en Caranavi", "medio": "Unitel", "url": "https://x/y", "ts": 1793650912121, "grupo": "Defensa Civil"})
    jsonschema.validate(e, esq)
    assert e["id"].startswith("noticia:bus:") and not e["oficial"]


def test_consulta_con_red_falsa(monkeypatch):
    xml = b"<rss><channel><item><title>Riada en Caranavi - Unitel</title><source>Unitel</source><link>https://n/1</link><pubDate>Mon, 02 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>"
    class R:
        def read(self): return xml
    monkeypatch.setattr(c.urllib.request, "urlopen", lambda *a, **k: R())
    n = c.consultar("x")
    assert n[0]["titulo"] == "Riada en Caranavi" and n[0]["medio"] == "Unitel" and n[0]["ts"] > 0

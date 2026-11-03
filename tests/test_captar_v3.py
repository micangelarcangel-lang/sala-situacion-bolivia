import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import captar_v3 as c

RSS = b'<?xml version="1.0"?><rss><channel><item><title>Choque en Oruro</title><link>http://x/1</link><pubDate>Mon, 02 Nov 2026 10:00:00 +0000</pubDate><description>&lt;p&gt;Dos heridos&lt;/p&gt;</description></item></channel></rss>'
WP = json.dumps([{"title": {"rendered": "Riada en Caranavi"}, "link": "http://x/2", "date_gmt": "2026-11-02T10:00:00", "excerpt": {"rendered": "<p>Daños</p>"}}]).encode()


def test_rss_y_wp():
    r = c.parsear_rss(RSS, "X")[0]
    assert r["titulo"] == "Choque en Oruro" and r["ts_publicacion"] and r["resumen"] == "Dos heridos"
    w = c.parsear_wp_json(WP, "X")[0]
    assert w["titulo"] == "Riada en Caranavi" and w["ts_publicacion"]


def test_escalera_de_vias_cae_a_la_siguiente():
    def fetch(u):
        return {"ok": True, "via": "directa", "crudo": WP} if "wp-json" in u else {"ok": False}
    r = c.captar("X", [{"via": "rss", "url": "http://x/feed"}, {"via": "wp_json", "url": "http://x/wp-json"}], fetch)
    assert r["ok"] and r["via"] == "wp_json" and len(r["intentos"]) == 2


def test_todo_falla_devuelve_intentos():
    r = c.captar("X", [{"via": "rss", "url": "http://x/feed"}], lambda u: {"ok": False})
    assert not r["ok"] and r["intentos"][0]["elementos"] == 0

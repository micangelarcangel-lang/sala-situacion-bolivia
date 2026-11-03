import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import captar_v3 as c

RSS = """<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title>Choque en Oruro deja dos heridos</title><link>https://x.bo/a</link><pubDate>Mon, 02 Nov 2026 14:30:00 +0000</pubDate>
<description>resumen</description><content:encoded><![CDATA[<p>Un choque ocurrió en Oruro.</p><script>x()</script>]]></content:encoded></item>
<item><title></title><link>https://x.bo/b</link></item></channel></rss>"""


def test_parsea_rss_con_fecha_y_cuerpo():
    n = c.parsear(RSS.encode(), "X")
    assert len(n) == 1 and n[0]["cuerpo"] == "Un choque ocurrió en Oruro." and n[0]["ts_publicacion"] == 1793629800000
    assert n[0]["via"] == "rss"


def test_feed_caido_no_frena_a_los_demas(monkeypatch):
    monkeypatch.setattr(c, "bajar", lambda u, t=25: RSS.encode() if "ok" in u else (_ for _ in ()).throw(OSError("caído")))
    notas, est = c.captar([{"medio": "A", "url": "https://ok"}, {"medio": "B", "url": "https://mal"}])
    assert len(notas) == 1 and est["A"]["ok"] and not est["B"]["ok"]

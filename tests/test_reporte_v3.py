import os, sys, json
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import reporte_v3 as r

E = [{"id": "a", "origen": "prensa", "categoria": "otra", "titulo": "Guerra en el exterior", "ts": 1000, "departamentos": [], "nivel_txt": "Roja (preliminar)"},
     {"id": "b", "origen": "prensa", "categoria": "antropogénica", "titulo": "Choque en Oruro", "ts": 1000, "departamentos": ["Oruro"], "nivel_txt": "Amarilla (preliminar)", "cifras": {"fallecidos": 2, "heridos": 1}},
     {"id": "c", "origen": "senamhi", "categoria": "meteorológica", "titulo": "Alerta", "ts": 1000, "departamentos": ["La Paz"], "nivel_txt": "Naranja (oficial SENAMHI)", "oficial": True}]


def test_filtra_exterior_y_ordena():
    s = r.seleccionar(E, 1000, 24)
    assert [e["id"] for e in sorted(s, key=r.prioridad, reverse=True)] == ["c", "b"]


def test_genera_pdf(tmp_path):
    out = tmp_path / "b.pdf"
    r.build(E, str(out), 24, 1000, os.path.join(RAIZ, "docs", "geo_dep.geojson"))
    assert out.read_bytes()[:5] == b"%PDF-"


def test_hecho_repetido_en_varios_medios_cuenta_una_vez(tmp_path):
    ev = [{"id": f"m{i}", "origen": "prensa", "categoria": "antropogénica", "titulo": "Choque", "ts": 1000, "departamentos": ["Oruro"], "relevante_v3": True, "ambito": "bolivia",
           "cifras": {"fallecidos": 2, "heridos": 1}, "grupo_propuesto": ["m0", "m1", "m2"]} for i in range(3)]
    out = tmp_path / "b.pdf"
    r.build(ev, str(out), 24, 1000, os.path.join(RAIZ, "docs", "geo_dep.geojson"))
    assert out.exists()

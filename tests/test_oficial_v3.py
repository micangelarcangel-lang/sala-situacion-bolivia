import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import oficial_v3 as o


def test_declaratoria_nacional():
    a = o.detectar_acto("Gobierno declara emergencia nacional por la sequía", "Mediante Decreto Supremo 5123 se declara...")
    assert a["alcance"] == "nacional" and a["tipo"] in ("declaratoria", "decreto") and a["numero"] == "5123"


def test_declaratoria_departamental_y_municipal():
    assert o.detectar_acto("Gobernación de Cochabamba declara emergencia por sequía")["alcance"] == "departamental"
    assert o.detectar_acto("Concejo Municipal de Pasorapa aprueba ordenanza de emergencia por sequía")["alcance"] == "municipal"


def test_sin_acto_oficial():
    assert o.detectar_acto("Choque en la carretera deja dos heridos") is None


def test_verificar_tolera_fallos_de_red(monkeypatch):
    def falla(*a, **k):
        raise OSError("sin red")
    monkeypatch.setattr(o, "_wp", falla); monkeypatch.setattr(o, "_gnews", falla)
    r = o.verificar({"alcance": "nacional", "tipo": "declaratoria", "numero": None}, "sequía")
    assert r["estado"] == "sin_respaldo_oficial_encontrado" and r["vias_con_error"]

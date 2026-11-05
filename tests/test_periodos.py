import os, sys, datetime as dt
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import periodos as p


def test_semana_epidemiologica_2026():
    s = p.semana(dt.date(2026, 11, 4))
    assert (s["nro"], s["ini"], s["fin"]) == (44, dt.date(2026, 11, 1), dt.date(2026, 11, 7))
    assert p.semana(dt.date(2026, 1, 3))["anio"] == 2025 and p.semana(dt.date(2026, 1, 4))["nro"] == 1


def test_domingo_7am_emite_la_semana_cerrada():
    dom = int(dt.datetime(2026, 11, 8, 7, tzinfo=p.BO).timestamp() * 1000)
    ini, fin, s, cerrada = p.ventana_semanal(dom)
    assert cerrada and s["nro"] == 44 and dt.datetime.fromtimestamp(ini / 1000, p.BO).day == 1
    mie = int(dt.datetime(2026, 11, 4, 9, tzinfo=p.BO).timestamp() * 1000)
    assert p.ventana_semanal(mie)[3] is False

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agrupar_v3 as g

H = 3600 * 1000
def nota(t, ts=0, mun=None, dep=None, f=None):
    return {"titulo": t, "ts": ts, "municipio": mun, "departamento": dep, "fallecidos": f}


def test_une_misma_noticia_de_dos_medios():
    r = g.agrupar([nota("Choque de camión y ómnibus deja tres heridos en la carretera Oruro Huanuni", 0, "Huanuni", "Oruro"),
                   nota("Tres heridos tras choque entre camión y ómnibus en ruta a Huanuni", 2 * H, "Huanuni", "Oruro")])
    assert len(r) == 1


def test_no_une_distinto_departamento():
    r = g.agrupar([nota("Choque de dos camiones deja heridos", 0, None, "Oruro"), nota("Choque de dos camiones deja heridos", H, None, "Santa Cruz")])
    assert len(r) == 2


def test_no_une_fuera_de_ventana():
    r = g.agrupar([nota("Vuelco de bus en la carretera deja heridos", 0, "Caranavi", "La Paz"), nota("Vuelco de bus en la carretera deja heridos", 5 * 24 * H, "Caranavi", "La Paz")])
    assert len(r) == 2


def test_no_une_cifras_de_muertos_distintas():
    r = g.agrupar([nota("Choque en la doble vía deja dos muertos", 0, "Oruro", "Oruro", 2), nota("Choque en la doble vía deja cuatro muertos", H, "Oruro", "Oruro", 4)])
    assert len(r) == 2


def test_une_por_terminos_raros_compartidos():
    r = g.agrupar([nota("Brote de meningitis en Palmasola: paciente está grave", 0, "Santa Cruz de la Sierra", "Santa Cruz"),
                   nota("Sedes activa protocolos por caso de meningitis en cárcel de Palmasola", 3 * H, "Santa Cruz de la Sierra", "Santa Cruz"),
                   nota("Choque en la doble vía deja heridos", 2 * H, "Santa Cruz de la Sierra", "Santa Cruz")])
    assert sorted(len(x["indices"]) for x in r) == [1, 2]

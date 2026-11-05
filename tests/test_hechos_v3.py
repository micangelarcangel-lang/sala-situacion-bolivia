import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import hechos_v3 as h

D = 24 * 3600 * 1000


def ev(i, titulo, ts, fall=None, sub="accidente de tránsito", mun="Viacha", fuente="X", oficial=False):
    campos = {"fallecidos": {"estado": "cifra", "valor": fall}} if fall is not None else {}
    return {"id": i, "origen": "prensa", "relevante_v3": True, "ambito": "bolivia", "subtipo": sub, "titulo": titulo, "ts": ts, "fuente": fuente, "oficial": oficial,
            "departamentos": ["La Paz"], "lugar": f"{mun}, La Paz", "precision_ubicacion": "municipio", "ficha": {"campos": campos}}


def test_cadena_une_notas_y_toma_la_mayor_cifra():
    t0 = 1_800_000_000_000
    evs = [ev("a", "Accidente en Viacha deja dos muertos minibús camión", t0, 2, fuente="Red Uno"),
           ev("b", "Accidente en Viacha: ya son tres muertos minibús camión", t0 + 6 * 3600000, 3, fuente="EFE")]
    hs = h.actualizar(evs, {}, t0 + 7 * 3600000)
    assert len(hs) == 1
    x = next(iter(hs.values()))
    assert h.cifra_vigente(x)["fallecidos"]["valor"] == 3
    assert h.cifra_vigente(x, t0 + 3600000)["fallecidos"]["valor"] == 2  # corte anterior a la segunda nota


def test_oficial_manda_sobre_prensa():
    t0 = 1_800_000_000_000
    x = h._nuevo([h.huella(ev("a", "Accidente en Viacha", t0, 5, fuente="Prensa")), h.huella(ev("b", "Accidente en Viacha", t0 + 3600000, 3, fuente="Policía", oficial=True))])
    assert h.cifra_vigente(x)["fallecidos"]["valor"] == 3 and h.cifra_vigente(x)["fallecidos"]["origen"] == "oficial"


def test_cierre_puntual_3_dias_y_grande_14():
    t0 = 1_800_000_000_000
    p = h._nuevo([h.huella(ev("a", "Choque en Viacha", t0, 1))])
    g = h._nuevo([h.huella(ev("b", "Sequía golpea familias", t0, None, sub="sequía"))])
    assert h.estado(p, t0 + 2 * D) == "abierto" and h.estado(p, t0 + 4 * D) == "cerrado"
    assert h.estado(g, t0 + 13 * D) == "abierto" and h.estado(g, t0 + 15 * D) == "cerrado"


def test_ventana_grande_se_extiende_con_mas_reportes():
    t0 = 1_800_000_000_000
    notas = [h.huella(ev(f"n{i}", "Sequía golpea familias", t0 + i * 3600000, None, sub="sequía")) for i in range(20)]
    g = h._nuevo(notas)
    assert h.ventana_ms(g) == 28 * D


def test_marca_revisar_si_la_cifra_baja():
    t0 = 1_800_000_000_000
    x = h._nuevo([h.huella(ev("a", "Accidente en Viacha", t0, 4)), h.huella(ev("b", "Accidente en Viacha", t0 + 3600000, 3))])
    assert h.cifra_vigente(x)["fallecidos"]["revisar"] is True


def test_evolucion_en_texto():
    t0 = 1_800_000_000_000
    x = h._nuevo([h.huella(ev("a", "Accidente en Viacha", t0, 2)), h.huella(ev("b", "Accidente en Viacha", t0 + 3600000, 3)), h.huella(ev("c", "Accidente en Viacha", t0 + 7200000, 3))])
    assert h.evolucion(x) == "Fallecidos 2 → 3"


def test_error_de_unidad_no_entra_en_la_serie():
    t0 = 1_800_000_000_000
    x = h._nuevo([h.huella(ev("a", "Sequía", t0, None, sub="sequía")) for _ in range(1)])
    x["notas"] = [{"id": str(i), "ts": t0 + i, "fuente": "f", "oficial": False, "cifras": {"familias_afectadas": v}} for i, v in enumerate((114000, 114, 78000))]
    assert [v for _, v in h.cifra_vigente(x)["familias_afectadas"]["serie"]] == [114000, 78000]


def test_misma_emergencia_en_un_departamento_es_un_solo_hecho():
    t0 = 1_800_000_000_000
    a = ev("a", "Pasorapa pide ayuda por la sequía", t0, None, sub="sequía", mun="Pasorapa"); a["departamentos"] = ["Cochabamba"]; a["lugar"] = "Pasorapa, Cochabamba"
    b = ev("b", "Declaran emergencia por sequía en 7 municipios de Cochabamba", t0 + 2 * D, None, sub="sequía", mun="Omereque"); b["departamentos"] = ["Cochabamba"]; b["lugar"] = "Omereque, Cochabamba"
    c = ev("c", "Gobernación plantea ley para atender la sequía", t0 + 3 * D, None, sub="sequía", mun="Cochabamba"); c["departamentos"] = ["Cochabamba"]; c["lugar"] = "Cochabamba (solo departamento)"; c["precision_ubicacion"] = "departamento"
    hs = h.actualizar([a, b, c], {}, t0 + 4 * D)
    assert len(hs) == 1


def test_brotes_de_distinta_enfermedad_no_se_unen():
    t0 = 1_800_000_000_000
    a = ev("a", "Brote de influenza B en La Paz", t0, None, sub="brote / enfermedad transmisible"); a["departamentos"] = ["La Paz"]
    b = ev("b", "Casos de coxsackie en La Paz", t0 + D, None, sub="brote / enfermedad transmisible"); b["departamentos"] = ["La Paz"]
    assert len(h.actualizar([a, b], {}, t0 + 2 * D)) == 2

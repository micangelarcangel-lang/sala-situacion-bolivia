import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ficha_v3 as f


def est(r, c):
    return r["campos"][c]["estado"], r["campos"][c].get("valor")


def test_transito_tipo_vehiculos_y_victimas():
    r = f.extraer("accidente de tránsito", "Choque frontal entre camión y ómnibus deja tres heridos graves", "")
    assert est(r, "tipo_accidente") == ("dato", "choque frontal") and est(r, "heridos") == ("cifra", 3)
    assert est(r, "fallecidos")[0] == "no_informado" and "fallecidos" in r["faltan"]


def test_sin_victimas_es_distinto_de_no_informado():
    r = f.extraer("incendio estructural", "Incendio consume una tienda", "No hubo víctimas. Bomberos controlaron el fuego.")
    assert est(r, "fallecidos") == ("sin_victimas", 0) and est(r, "heridos") == ("sin_victimas", 0)


def test_varios_heridos_no_se_convierte_en_cifra():
    r = f.extraer("accidente de tránsito", "Vuelco deja varios heridos en la carretera", "")
    assert est(r, "heridos")[0] == "no_precisado"


def test_sequia_y_brote():
    r = f.extraer("sequía", "Emergencia por sequía", "Afecta a 1.200 familias y 5.000 cabezas de ganado, con 300 hectáreas perdidas.")
    assert est(r, "familias_afectadas") == ("cifra", 1200) and est(r, "ganado") == ("cifra", 5000) and est(r, "superficie_ha") == ("cifra", 300)
    r = f.extraer("brote / enfermedad transmisible", "Meningitis en cárcel", "Hay un caso confirmado y dos sospechosos; 15 contactos en observación.")
    assert est(r, "casos_confirmados") == ("cifra", 1) and est(r, "casos_sospechosos") == ("cifra", 2) and est(r, "expuestos") == ("cifra", 15)


def test_mil_y_resumen():
    r = f.extraer("sequía", "La sequía golpea a 114 mil familias", "")
    assert est(r, "familias_afectadas") == ("cifra", 114000)
    assert "114.000" in f.resumen(r) and "No informado" in f.resumen(r)


def test_mencion_generica_no_es_dato():
    r = f.extraer("sequía", "Sangre y drogas: muertes por encargo se disparan", "")
    assert est(r, "fallecidos")[0] == "no_informado"
    r = f.extraer("sequía", "Defensa Civil explica el protocolo ante familias de la zona", "")
    assert est(r, "familias_afectadas")[0] == "no_informado"


def test_cifra_con_verbo():
    r = f.extraer("intoxicación / alimentos", "Tres presuntos ladrones de mineral mueren por intoxicación en mina", "")
    assert est(r, "fallecidos") == ("cifra", 3)
    r = f.extraer("accidente de tránsito", "Colisión: murieron dos personas y resultaron heridos cuatro", "")
    assert est(r, "fallecidos") == ("cifra", 2)


def test_proporcion_no_es_cifra_de_casos():
    r = f.extraer("brote / enfermedad transmisible", "7 de cada 10 casos de resfrío en La Paz son de influenza B", "")
    assert r["campos"]["casos_notificados"]["estado"] != "cifra"


def test_cifra_del_titular_manda_sobre_el_cuerpo():
    r = f.extraer("intoxicación por gases (mina)", "Tres presuntos ladrones mueren por intoxicación en mina", "Dos cuerpos fueron hallados; murieron dos")
    assert r["campos"]["fallecidos"]["valor"] == 3

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import clasificar_v3 as c


def test_transito_bolivia():
    r = c.clasificar("Choque en la doble vía Oruro-La Paz deja cinco heridos")
    assert r["subtipo"] == "accidente de tránsito" and r["ambito"] == "bolivia" and r["relevante"]


def test_exterior_no_relevante():
    r = c.clasificar("Al menos 18 muertos en un ataque ruso contra una escuela en Zaporiyia, según Zelenski")
    assert r["ambito"] == "exterior" and not r["relevante"]


def test_economia_no_clasifica():
    r = c.clasificar("La economía registró una contracción del 3,27% entre enero y junio en Bolivia")
    assert r["subtipo"] is None and not r["relevante"]


def test_brote_y_lugar_por_ubicacion():
    r = c.clasificar("Brote de meningitis en Palmasola: paciente en estado grave", lugar_bolivia=True)
    assert r["subtipo"] == "brote / enfermedad transmisible" and r["relevante"]


def test_mencion_pasajera_en_el_cuerpo_no_cuenta():
    r = c.clasificar("Luto en la música", "Murió en un accidente. " + "El artista ... ", True)
    assert r["subtipo"] is None


def test_alerta_roja_de_interpol_no_es_clima():
    assert not c.clasificar("Bolivia pidió a Interpol alerta roja para dar con el paradero de exministro")["relevante"]
    assert c.clasificar("Senamhi emite alerta naranja por ráfagas de viento en Santa Cruz")["subtipo"] == "granizada / helada / viento"

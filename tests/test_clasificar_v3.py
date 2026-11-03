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


def test_estricto_exige_bolivia_y_descarta_deportes_y_exterior():
    assert not c.clasificar("Investigan si el avión que cayó en Florida comenzó a desintegrarse", "", False, True)["relevante"]
    assert not c.clasificar("Delantero del Tenerife está estable tras duro choque con un rival", "", False, True)["relevante"]
    assert not c.clasificar("Agenda informativa: Cochabamba tiene sequía", "", False, True)["relevante"]
    assert c.clasificar("Chuquisaca sufre intensa granizada que destruye techos", "", False, True)["relevante"]
    assert c.clasificar("Caso de meningitis en cárcel de Palmasola", "El Sedes de Santa Cruz activó protocolos.", False, True)["relevante"]


def test_gana_el_tipo_que_aparece_primero():
    assert c.clasificar("La sequía golpea a 114 mil familias en Bolivia y las inundaciones agravan el riesgo")["subtipo"] == "sequía"

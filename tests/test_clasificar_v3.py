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


def test_quema_de_vehiculos_no_es_incendio_forestal_ni_la_guia_es_un_hecho():
    assert c.clasificar("Queman vehículos en pugna de transportistas en Santa Cruz")["subtipo"] == "incendio estructural"
    assert not c.clasificar("Que no cunda el pánico: Bomberos enseñan cómo actuar ante una fuga de gas", "", True)["relevante"]
    assert not c.clasificar("Guayaquil vuelve a inundarse por fuertes lluvias", "El Senamhi de Santa Cruz informa", True)["relevante"]


def test_accidente_con_derrame_es_transito_e_incendio_en_restaurante_es_incendio():
    assert c.clasificar("Accidente en El Sillar deja heridos y derrame de combustible", "", True)["subtipo"] == "accidente de tránsito"
    assert c.clasificar("Incendio en un restaurante deja daños materiales en Santa Cruz")["subtipo"] == "incendio estructural"
    assert c.clasificar("Accidente aéreo deja dos muertos en Beni")["subtipo"] == "accidente aéreo"


def test_exterior_puerto_rico_y_seguimientos_judiciales_y_campanas():
    assert not c.clasificar("Motorista fallece tras accidente en expreso de San Juan hacia Bayamón", "", True, True)["relevante"]
    assert not c.clasificar("Detención preventiva por accidente de tránsito en Sucre", "", True, True)["relevante"]
    assert not c.clasificar("Oruro contará con 170 mil vacunas en campaña antirrábica", "", True, True)["relevante"]
    assert c.clasificar("Colapso de escenario musical deja tres heridos en Viacha", "", True, True)["subtipo"] == "colapso estructural"

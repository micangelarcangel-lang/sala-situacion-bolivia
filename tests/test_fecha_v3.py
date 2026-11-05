import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fecha_v3 as f



def test_fecha_del_hecho_con_dia_de_semana():
    import datetime as dt
    pub = int(dt.datetime(2026, 11, 4, 10, tzinfo=f.BO).timestamp() * 1000)
    r = f.fecha_hecho("La Paz, Bolivia; 5 de septiembre.- La explosión registrada este viernes en un cuartel", pub)
    assert dt.datetime.fromtimestamp(r / 1000, f.BO).year == 2025
    assert f.fecha_hecho("Sin fecha en el texto", pub) is None

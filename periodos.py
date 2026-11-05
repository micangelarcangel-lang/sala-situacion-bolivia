# -*- coding: utf-8 -*-
"""Períodos de los boletines. Semana epidemiológica (SE) como calendario: domingo a sábado; la SE 1 es la primera semana del año con al menos 4 días del año nuevo.
El boletín semanal se emite el domingo a las 7:00 y cubre la SE recién cerrada. No se nombra «epidemiológica» en el boletín salvo para eventos biológicos."""
import datetime as dt

BO = dt.timezone(dt.timedelta(hours=-4))
D = 24 * 3600 * 1000
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _ms(d):
    return int(d.timestamp() * 1000)


def _inicio_se1(anio):
    p = dt.date(anio, 1, 1)
    dom = p - dt.timedelta(days=(p.weekday() + 1) % 7)  # domingo de la semana que contiene el 1 de enero
    return dom if (dt.date(anio, 1, 1) - dom).days <= 3 else dom + dt.timedelta(days=7)  # con 4 o más días del año nuevo (jue-sáb = 3 días no alcanza)


def semana(fecha):
    """fecha: date -> dict(anio, nro, ini (date domingo), fin (date sábado))."""
    anio = fecha.year
    for a in (anio + 1, anio, anio - 1):
        ini1 = _inicio_se1(a)
        if fecha >= ini1:
            n = (fecha - ini1).days // 7 + 1
            ini = ini1 + dt.timedelta(days=7 * (n - 1))
            return {"anio": a, "nro": n, "ini": ini, "fin": ini + dt.timedelta(days=6)}


def ventana_semanal(ahora_ms):
    """(ini_ms, fin_ms, info, cerrada). Domingo antes de las 12:00: la SE que acaba de cerrar; otro momento: la SE en curso (parcial)."""
    ahora = dt.datetime.fromtimestamp(ahora_ms / 1000, BO)
    f = ahora.date()
    cerrada = ahora.weekday() == 6 and ahora.hour < 12
    s = semana(f - dt.timedelta(days=1)) if cerrada else semana(f)
    ini = _ms(dt.datetime.combine(s["ini"], dt.time(0, 0), BO))
    fin = _ms(dt.datetime.combine(s["fin"], dt.time(23, 59, 59), BO))
    return ini, min(fin, ahora_ms), s, cerrada


def ventana_mensual(ahora_ms):
    """(ini_ms, fin_ms, etiqueta, cerrado). El día 1 antes de las 12:00: el mes anterior completo; otro momento: el mes en curso (parcial)."""
    ahora = dt.datetime.fromtimestamp(ahora_ms / 1000, BO)
    cerrado = ahora.day == 1 and ahora.hour < 12
    if cerrado:
        fin_d = ahora.date() - dt.timedelta(days=1)
        ini_d = fin_d.replace(day=1)
    else:
        ini_d, fin_d = ahora.date().replace(day=1), ahora.date()
    ini = _ms(dt.datetime.combine(ini_d, dt.time(0, 0), BO))
    fin = _ms(dt.datetime.combine(fin_d, dt.time(23, 59, 59), BO))
    return ini, min(fin, ahora_ms), f"{MESES[ini_d.month - 1]} de {ini_d.year}", cerrado


def etiqueta_semana(s):
    f = lambda d: d.strftime("%d/%m/%Y")
    return f"SE {s['nro']} de {s['anio']} · domingo {f(s['ini'])} a sábado {f(s['fin'])}"

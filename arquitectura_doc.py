# -*- coding: utf-8 -*-
"""Genera ARQUITECTURA.md y docs/arquitectura.pdf: arquitectura definitiva, estado por componente y plan por fases. Se regenera con: python arquitectura_doc.py"""
import io, os, textwrap, datetime as dt
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
import estilo_graficos as eg

HECHO, PARCIAL, FALTA = "#1baf7a", "#eda100", "#c9c8c2"
CAPAS = [
    ("1 · Captación", [("Prensa (15 medios, RSS)", HECHO), ("Lectura de la nota completa", HECHO), ("SENAMHI, sismos, focos, Open-Meteo", PARCIAL), ("Portales de gobernaciones, SEDES, alcaldías", FALTA), ("PDF institucionales", FALTA), ("Red ciudadana (Kobo)", PARCIAL)]),
    ("2 · Extracción", [("Tipo → subtipo", HECHO), ("Ficha por tipo (víctimas, casos, afectados)", HECHO), ("Lugar (municipio, tramo, varios)", PARCIAL), ("Fecha del hecho", HECHO)]),
    ("3 · Inteligencia", [("Un hecho = una ficha viva", HECHO), ("Cifra vigente y evolución", HECHO), ("Respaldo oficial por alcance", PARCIAL), ("Aprendizaje con tus validaciones", PARCIAL)]),
    ("4 · Almacén e indicadores", [("Historial versionado", HECHO), ("Línea de base histórica por tipo", FALTA), ("Indicadores por tipo (tasas, canales, umbrales)", FALTA)]),
    ("5 · Salidas", [("Boletines diario/semanal/mensual (PDF)", PARCIAL), ("Correo 7:00 (Gmail)", PARCIAL), ("Web v3 (general + módulo por tipo + mapas)", FALTA), ("Consulta de un hecho con 3 datos", FALTA)]),
    ("6 · Operación", [("GitHub Actions, costo cero", HECHO), ("Programación 7:00 (solo desde main)", FALTA), ("Servidor con IP boliviana (Gaceta, VIDECI)", FALTA)]),
]

TIPOS = [
    ("Accidentes de tránsito", "Letalidad (fallecidos/accidentes); hechos por tramo; día y hora", "Mapa de calor día×hora; barras por tramo; tendencia 8 semanas vs. mismas semanas previas", "Tramos de carretera coloreados por hechos y puntos de mayor concentración", "Acumulación propia + cifras anuales de Policía/ABC"),
    ("Incendios forestales", "Focos de calor por día; superficie (ha); acumulado anual", "Línea diaria con banda histórica (p10–p90)", "Densidad de focos por municipio", "NASA FIRMS (archivo, clave gratuita)"),
    ("Sequía", "Déficit de lluvia (SPI) por municipio; municipios en emergencia; familias y ganado afectados", "Curva acumulada de municipios en emergencia + SPI", "Municipios coloreados por declaratoria o SPI", "Lluvia histórica (CHIRPS / Open-Meteo)"),
    ("Inundaciones / riadas", "Lluvia 72 h; caudal vs. umbral; familias y viviendas", "Hidrograma con umbrales + barras de lluvia", "Ríos y estaciones; municipios afectados", "SENAMHI caudales (ya hay series)"),
    ("Granizada / helada / viento", "Temperatura mínima vs. umbral de helada; ha de cultivo", "Serie de T mínima con umbral", "Pronóstico + municipios afectados", "Open-Meteo / SENAMHI"),
    ("Sismos", "Magnitud, profundidad, percibido", "Magnitud en el tiempo; acumulado 12 meses", "Epicentros (tamaño = magnitud)", "USGS (API abierta, sin clave)"),
    ("Brotes / enfermedades", "Curva por semana; canal endémico; tasa por 100 mil; letalidad; tasa de ataque", "Curva epidémica sobre canal endémico (cuartiles 5 años)", "Municipios por tasa de incidencia", "SEDES / SNIS (boletines semanales)"),
    ("Intoxicaciones y minas", "Casos, expuestos, tasa de ataque; curva por hora", "Curva de aparición de casos", "Puntos con servicios cercanos", "Acumulación propia"),
    ("Deslizamientos", "Lluvia previa; sitios que se repiten", "Lluvia 7 días antes de cada evento", "Puntos y tramos afectados", "Propia + ABC"),
    ("Sanidad animal", "Focos y animales por especie", "Curva de focos", "Focos por municipio", "SENASAG (bloquea desde GitHub)"),
    ("Incendio estructural, colapso, explosión", "Hechos por tipo de inmueble; víctimas", "Barras por tipo y mes", "Puntos con bomberos cercanos", "Acumulación propia (Bomberos)"),
]

FASES = [
    ("F1 · Captación completa", "Portales de las 9 gobernaciones, SEDES departamentales y alcaldías (con respaldo oficial) + PDF institucionales.", "Tabla de portales por departamento: responde / bloquea / sin página. Cobertura medida."),
    ("F2 · Líneas de base e indicadores", "Series históricas abiertas por tipo (sismos, focos, lluvia, caudales, epidemiología) y cálculo de indicadores.", "Cada tipo con su indicador y su base histórica verificada."),
    ("F3 · Módulos por tipo", "Una página web por tipo con su gráfica y su mapa propios. Piloto: tránsito, sequía y brotes; luego el resto.", "3 módulos funcionando; tú los revisas."),
    ("F4 · Boletines definitivos", "Diario, semanal (domingo 7:00) y mensual con tendencias y los módulos anteriores; envío por Gmail.", "PDF de cada período revisado por ti."),
    ("F5 · Consulta y red ciudadana", "Pedir un hecho con 3 datos o más; formulario Kobo y su lectura.", "Una consulta real respondida de punta a punta."),
    ("F6 · Producción", "Unir a main, programación, vigilancia de 3 días con el flujo viejo de respaldo; servidor adecuado si el piloto se aprueba.", "Tres días seguidos sin fallas."),
]


def diagrama():
    fig, ax = plt.subplots(figsize=(7.4, 5.4)); fig.patch.set_facecolor("white"); ax.axis("off")
    ax.set_xlim(0, 100); ax.set_ylim(0, 100)
    n = len(CAPAS); h = 100 / n
    for i, (nombre, items) in enumerate(CAPAS):
        y = 100 - (i + 1) * h
        ax.add_patch(FancyBboxPatch((0, y + 1.2), 14, h - 2.4, boxstyle="round,pad=0,rounding_size=1.2", fc="#0b3d6e", ec="none"))
        ax.text(7, y + h / 2, textwrap.fill(nombre, 12), color="white", fontsize=6.6, ha="center", va="center", fontweight=600)
        ancho = 86 / 6
        for j, (t, c) in enumerate(items):
            x = 15.5 + j * ancho
            ax.add_patch(FancyBboxPatch((x, y + 1.6), ancho - 1.2, h - 3.2, boxstyle="round,pad=0,rounding_size=1.0", fc=c, ec="none", alpha=.9 if c != FALTA else 1))
            ax.text(x + (ancho - 1.2) / 2, y + h / 2, textwrap.fill(t, 17), fontsize=5.6, ha="center", va="center", color="#0b0b0b", linespacing=1.15)
    from matplotlib.patches import Patch
    ax.legend(handles=[Patch(fc=HECHO, label="Hecho"), Patch(fc=PARCIAL, label="Parcial"), Patch(fc=FALTA, label="Falta")], loc="lower center", bbox_to_anchor=(.5, -0.08), ncol=3, fontsize=7, frameon=False)
    return eg.png(fig)


def md():
    o = ["# Sala de Situación Bolivia · Arquitectura y plan de trabajo", f"_Actualizado {dt.date.today():%d/%m/%Y}_", "", "## Capas y estado"]
    for n, items in CAPAS:
        o.append(f"**{n}**: " + "; ".join(f"{t} ({'hecho' if c == HECHO else 'parcial' if c == PARCIAL else 'falta'})" for t, c in items))
    o += ["", "## Módulo por tipo de evento", "| Tipo | Indicador | Gráfica | Mapa | Línea de base |", "|---|---|---|---|---|"] + [f"| {' | '.join(r)} |" for r in TIPOS]
    o += ["", "## Fases"] + [f"- **{a}**: {b} _Aceptación:_ {c}" for a, b, c in FASES]
    open("ARQUITECTURA.md", "w", encoding="utf-8").write("\n".join(o) + "\n")


def pdf(salida="docs/arquitectura.pdf"):
    S = lambda n, **k: ParagraphStyle(n, fontName=k.pop("f", "Helvetica"), fontSize=k.pop("s", 9), leading=k.pop("l", 12.5), **k)
    t, b, h, c = S("t", f="Helvetica-Bold", s=18, l=22, textColor=colors.HexColor("#0b3d6e")), S("b"), S("h", f="Helvetica-Bold", s=11.5, l=15, textColor=colors.HexColor("#0b3d6e"), spaceBefore=9, spaceAfter=3), S("c", s=7.3, l=9.5, textColor=colors.HexColor("#3d3c39"))
    el = [Paragraph("Sala de Situación Bolivia", t), Paragraph(f"Arquitectura definitiva y plan de trabajo · {dt.date.today():%d/%m/%Y}", c), Spacer(1, 6),
          Paragraph("Dónde estamos", h),
          Paragraph("Pediste desde el 02/11 una arquitectura completa. El esquema v3 quedó aprobado, pero no lo dejé escrito ni con estado por componente, y trabajé corrigiendo caso por caso. Esta hoja corrige eso: es el mapa único del proyecto y se actualiza en cada entrega.", b),
          Spacer(1, 3),
          Paragraph("En estos días se construyó el núcleo de inteligencia (lugar, tipo, ficha, un hecho = una ficha, cifra vigente, respaldo oficial) y los tres boletines. No se han construido todavía: la web v3, las líneas de base históricas, los módulos por tipo, los portales institucionales ni la producción. Por eso no ves la forma final.", b),
          Spacer(1, 6)]
    from reportlab.platypus import Image
    from estilo_graficos import imagen
    el += [imagen(diagrama(), 176 * mm), Paragraph("Capas del sistema y estado de cada componente.", c), Paragraph("Módulos por tipo de evento (indicadores, gráfica, mapa y línea de base)", h),
           Paragraph("Cada tipo tiene un indicador propio, una gráfica que muestra su comportamiento previo (tendencia, canal o umbral) y un mapa pensado para ese evento. La línea de base es lo que permite decir si algo está dentro de lo esperado o no.", b), Spacer(1, 4)]
    filas = [["Tipo", "Indicador", "Gráfica", "Mapa", "Línea de base"]] + [[Paragraph(x, c) for x in r] for r in TIPOS]
    tb = Table(filas, colWidths=[24 * mm, 41 * mm, 41 * mm, 36 * mm, 34 * mm], repeatRows=1)
    tb.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 7.5), ("LINEBELOW", (0, 0), (-1, 0), .8, colors.black), ("LINEBELOW", (0, 1), (-1, -1), .25, colors.HexColor("#e1e0dc")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el += [tb, PageBreak(), Paragraph("Plan por fases", h), Paragraph("Cada fase termina con algo que tú puedes ver y aprobar. Al final de todas, la revisión conjunta y la corrección definitiva que pediste.", b), Spacer(1, 4)]
    ft = Table([["Fase", "Qué incluye", "Cómo sabemos que terminó"]] + [[Paragraph(f"<b>{a}</b>", c), Paragraph(b_, c), Paragraph(c_, c)] for a, b_, c_ in FASES], colWidths=[34 * mm, 82 * mm, 60 * mm], repeatRows=1)
    ft.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 7.5), ("LINEBELOW", (0, 0), (-1, 0), .8, colors.black), ("LINEBELOW", (0, 1), (-1, -1), .25, colors.HexColor("#e1e0dc")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el += [ft, Paragraph("Límites que debes conocer", h),
           Paragraph("• El sistema solo tiene 3 días de historia propia: las tendencias de largo plazo dependen de series abiertas (USGS, NASA FIRMS, lluvia, SENAMHI, SEDES) y no todas son accesibles desde GitHub.<br/>"
                     "• La Gaceta Oficial, VIDECI y SENASAG bloquean las conexiones desde fuera de Bolivia; verificarlas bien requiere un servidor con IP boliviana (fase 6).<br/>"
                     "• GitHub Actions no es tiempo real ni exacto al minuto, y la programación horaria solo corre desde la rama principal.<br/>"
                     "• La precisión de lugar aún no es perfecta: en tu revisión de 40 hechos fue 55%; las correcciones posteriores no se han medido todavía.<br/>"
                     "• Las cifras de prensa son sin confirmar; «confirmado» exige fuente institucional o tu validación.", b),
           Paragraph("Decisiones que necesito de ti", h),
           Paragraph("1) ¿Confirmas el orden F1 → F6? 2) ¿Los tres tipos piloto de F3 (tránsito, sequía, brotes)? 3) Para F1 rastreo yo los portales de gobernaciones, SEDES y alcaldías; tú solo corriges lo que salga mal.", b)]
    SimpleDocTemplate(salida, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=13 * mm, bottomMargin=13 * mm, title="Arquitectura Sala de Situación Bolivia").build(el)


if __name__ == "__main__":
    md(); pdf()

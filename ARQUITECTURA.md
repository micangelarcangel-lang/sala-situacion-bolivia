# Sala de Situación Bolivia · Arquitectura y plan de trabajo
_Actualizado 06/11/2026_

## Capas y estado
**1 · Captación**: Prensa (15 medios, RSS) (hecho); Lectura de la nota completa (hecho); SENAMHI, sismos, focos, Open-Meteo (parcial); Portales de gobernaciones, SEDES, alcaldías (falta); PDF institucionales (falta); Red ciudadana (Kobo) (parcial)
**2 · Extracción**: Tipo → subtipo (hecho); Ficha por tipo (víctimas, casos, afectados) (hecho); Lugar (municipio, tramo, varios) (parcial); Fecha del hecho (hecho)
**3 · Inteligencia**: Un hecho = una ficha viva (hecho); Cifra vigente y evolución (hecho); Respaldo oficial por alcance (parcial); Aprendizaje con tus validaciones (parcial)
**4 · Almacén e indicadores**: Historial versionado (hecho); Línea de base histórica por tipo (falta); Indicadores por tipo (tasas, canales, umbrales) (falta)
**5 · Salidas**: Boletines diario/semanal/mensual (PDF) (parcial); Correo 7:00 (Gmail) (parcial); Web actual (main): existe, con datos antiguos (parcial); Conectar la web a los hechos v3 + módulos por tipo (falta); Consulta de un hecho con 3 datos (falta)
**6 · Operación**: GitHub Actions, costo cero (hecho); Programación 7:00 (solo desde main) (falta); Servidor con IP boliviana (Gaceta, VIDECI) (falta)

## Módulo por tipo de evento
| Tipo | Indicador | Gráfica | Mapa | Línea de base |
|---|---|---|---|---|
| Accidentes de tránsito | Letalidad (fallecidos/accidentes); hechos por tramo; día y hora | Mapa de calor día×hora; barras por tramo; tendencia 8 semanas vs. mismas semanas previas | Tramos de carretera coloreados por hechos y puntos de mayor concentración | Acumulación propia + cifras anuales de Policía/ABC |
| Incendios forestales | Focos de calor por día; superficie (ha); acumulado anual | Línea diaria con banda histórica (p10–p90) | Densidad de focos por municipio | NASA FIRMS (archivo, clave gratuita) |
| Sequía | Déficit de lluvia (SPI) por municipio; municipios en emergencia; familias y ganado afectados | Curva acumulada de municipios en emergencia + SPI | Municipios coloreados por declaratoria o SPI | Lluvia histórica (CHIRPS / Open-Meteo) |
| Inundaciones / riadas | Lluvia 72 h; caudal vs. umbral; familias y viviendas | Hidrograma con umbrales + barras de lluvia | Ríos y estaciones; municipios afectados | SENAMHI caudales (ya hay series) |
| Granizada / helada / viento | Temperatura mínima vs. umbral de helada; ha de cultivo | Serie de T mínima con umbral | Pronóstico + municipios afectados | Open-Meteo / SENAMHI |
| Sismos | Magnitud, profundidad, percibido | Magnitud en el tiempo; acumulado 12 meses | Epicentros (tamaño = magnitud) | USGS (API abierta, sin clave) |
| Brotes / enfermedades | Curva por semana; canal endémico; tasa por 100 mil; letalidad; tasa de ataque | Curva epidémica sobre canal endémico (cuartiles 5 años) | Municipios por tasa de incidencia | SEDES / SNIS (boletines semanales) |
| Intoxicaciones y minas | Casos, expuestos, tasa de ataque; curva por hora | Curva de aparición de casos | Puntos con servicios cercanos | Acumulación propia |
| Deslizamientos | Lluvia previa; sitios que se repiten | Lluvia 7 días antes de cada evento | Puntos y tramos afectados | Propia + ABC |
| Sanidad animal | Focos y animales por especie | Curva de focos | Focos por municipio | SENASAG (bloquea desde GitHub) |
| Incendio estructural, colapso, explosión | Hechos por tipo de inmueble; víctimas | Barras por tipo y mes | Puntos con bomberos cercanos | Acumulación propia (Bomberos) |

## Fases
- **F1 · Captación completa**: Portales de las 9 gobernaciones, SEDES departamentales y alcaldías (con respaldo oficial) + PDF institucionales. _Aceptación:_ Tabla de portales por departamento: responde / bloquea / sin página. Cobertura medida.
- **F2 · Líneas de base e indicadores**: Series históricas abiertas por tipo (sismos, focos, lluvia, caudales, epidemiología) y cálculo de indicadores. _Aceptación:_ Cada tipo con su indicador y su base histórica verificada.
- **F3 · Módulos por tipo**: Conectar la web actual a los hechos v3 (sin rehacerla) y agregar una página por tipo con su gráfica y su mapa propios. Piloto: tránsito, sequía y brotes; luego el resto. _Aceptación:_ 3 módulos funcionando; tú los revisas.
- **F4 · Boletines definitivos**: Diario, semanal (domingo 7:00) y mensual con tendencias y los módulos anteriores; envío por Gmail. _Aceptación:_ PDF de cada período revisado por ti.
- **F5 · Consulta y red ciudadana**: Pedir un hecho con 3 datos o más; formulario Kobo y su lectura. _Aceptación:_ Una consulta real respondida de punta a punta.
- **F6 · Producción**: Unir a main, programación, vigilancia de 3 días con el flujo viejo de respaldo; servidor adecuado si el piloto se aprueba. _Aceptación:_ Tres días seguidos sin fallas.

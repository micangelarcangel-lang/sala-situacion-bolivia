# Sala de Situación Bolivia v3 — estado y paso a producción

Rama: `v3-prueba-de-valor` (`main` no se tocó). Flujo paralelo: `.github/workflows/sala_v3.yml` → `ejecutar_v3.py` → `datos/v3/`.

## Qué hay y cómo se midió (datos reales, Actions, 03/11/2026)
| Parte | Estado | Evidencia |
|---|---|---|
| Escalera de captación (directa → navegador → archivo) | probada | `escalera.py`, diagnóstico de 17+69 direcciones |
| Fuentes por RSS (15 medios) | probada | 725 notas/72 h, todas con fecha de publicación |
| Lectura de la nota completa | probada | ~200 notas en 16–20 s; 160 con texto completo |
| Ubicación por puntaje | probada | puntos con solo el departamento: 12 → 0; prensa con municipio 35 → 64+ |
| Víctimas como rango | probada con datos de tránsito | `victimas_v3.py`, 7 pruebas |
| Clasificación por subtipo y ámbito (Bolivia/exterior) | probada, con falsos positivos corregidos | `clasificar_v3.py` |
| Agrupación entre medios | probada | meningitis Palmasola: 9 notas → 1 hecho |
| Servicios cercanos (OSM) | probada | 1.726 salud, 571 policía, 43 bomberos |
| Lugares conocidos | probada, conservadora | 2.286 lugares; ubica pocos pero sin errores vistos |
| Historial por versiones | probada | `almacen_v3.py` |
| Boletín breve (1 página) | probado visualmente | `datos/v3/boletin.pdf` |
| Reportes de la red (Kobo) y aprendizaje | **solo con pruebas, sin datos reales** | falta crear el formulario y el token |

## Lo que NO está validado
- Ninguna medición contra una verdad terreno: las cifras son "menos errores visibles", no exactitud medida. Falta que valides una muestra.
- Kobo nunca se probó con envíos reales.
- Las ejecuciones programadas (cada 30 min, 7:00) solo funcionan desde `main`.
- Cobertura: VIDECI y SENASAG bloquean; Cambio no responde; SNGR no existe en esas direcciones.
- Nivel de evidencia "confirmado" aún no se asigna automáticamente (requiere fuente institucional o tu validación).

## Pasos para pasar a producción (necesitan tu aprobación; ninguno está hecho)
1. Revisar en la rama `datos/v3/boletin.pdf` y 20 eventos al azar de `datos/v3/eventos_v3.json`.
2. Enchufar los módulos v3 a `ejecutar.py` (ubicación, víctimas, clasificación, agrupación, captación RSS) sin cambiar el envío por Gmail.
3. Pasar el boletín breve al correo de las 7:00 (reemplaza el informe largo; el largo queda como adjunto).
4. Mover los datos generados fuera de `main` (hoy `docs/` crece con cada corrida).
5. Crear el formulario Kobo (`formularios/reporte_ciudadano.xlsx`) y guardar `KOBO_TOKEN` como secreto.
6. Unir la rama a `main` y vigilar 3 días con el flujo viejo como respaldo.
7. Servidor adecuado para VIDECI/SENASAG/Cambio (IP boliviana) cuando el piloto se apruebe.

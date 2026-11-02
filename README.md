# Sala de Situación Bolivia

Sistema automático de vigilancia de eventos (costo cero: GitHub Actions + GitHub Pages). Capta datos oficiales, instrumentales y de prensa, los unifica en eventos y publica un tablero, mapas y reportes (PDF y correo).

## Cómo corre

- **Producción:** `.github/workflows/sala.yml` ejecuta `ejecutar.py` según el cron (y a pedido). Guarda lo generado en `docs/`, que publica GitHub Pages.
- **Diagnóstico:** `.github/workflows/diagnostico.yml` (manual) prueba las vías de una fuente y deja el resultado como artefacto.
- **Validación:** `.github/workflows/validar.yml` corre las pruebas y valida los eventos contra el esquema en cada rama que no sea `main`.

## Archivos clave (v3)

| Archivo | Para qué sirve |
| --- | --- |
| `esquema_evento_v1.json` | Contrato de un evento. Los campos nuevos (`precision_ubicacion`, `nivel_evidencia`, `cuerpo_leido`, `via_captacion`, `victimas`) son opcionales hasta la fase F3. |
| `fuentes.yml` | Catálogo de fuentes con su escalera de vías (api, rss, sitemap, html, navegador, pdf, archivo, correo, red). |
| `validar.py` | Valida eventos y mide la calidad: centroides departamentales, prensa sin cuerpo, prensa sin ubicar, víctimas sin ubicación precisa. |
| `diagnostico.py` | Prueba una URL o una fuente por varias vías y dice si hay bloqueo. Reemplaza a los antiguos `probar_*`. |
| `tests/` | Pruebas. `tests/fixtures/` guarda respuestas reales de SENAMHI y de otras fuentes, capturadas en producción. |

## Probar en local

```
pip install jsonschema pyyaml pytest
python -m pytest -q tests
python validar.py docs/eventos_unificados.json
```

## Línea base (02/11/2026, 549 eventos)

- 100 % de los eventos cumplen el esquema (el esquema es permisivo con los datos antiguos).
- 12 puntos dibujados en el centroide de un departamento.
- 147 de 203 notas de prensa sin cuerpo leído (72 %).
- 102 de 203 notas de prensa sin ubicar (50 %).
- 30 de 61 hechos con víctimas sin ubicación precisa (49 %).

La v3 busca bajar estas cuatro cifras y se mide con `validar.py`.

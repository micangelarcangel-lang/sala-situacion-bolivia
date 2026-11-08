# Traspaso del proyecto Sala de Situación Bolivia (rama `v3-prueba-de-valor`)

Para quien continúe (otra IA o persona). Estado al 8/11/2026. No tocar `main`, `sala.yml`, `ejecutar.py` ni el envío por Gmail sin aprobación del Dr. Quispe.

## Objetivo
Vigilancia por eventos de nivel nacional: buscar en cientos de medios y en reportes oficiales públicos (SENAMHI, VIDECI, etc. que ya publican a diario y solo hay que leerlos), triangular y generar un **boletín de situación** público de calidad institucional, por tipo de evento. Cero costo (GitHub Pages + Actions). Estándares abiertos (GeoJSON, CAP 1.2).

## Qué funciona
- `investigador_v3.py`: busca en Google News RSS (español, inglés, coreano), la IA propone consultas, lee ~35 notas completas, geocodifica lugares con Nominatim, analiza con Gemini (respaldo Groq), redacta en 2 pedidos JSON y genera el boletín.
- `boletin_html.py`: HTML/CSS → PDF con Chrome (fuente Inter en `fuentes/`), mapa con teselas OSM, QR a la fuente de la foto, esquema vial solo en tránsito. `boletin_v3.py` es el formato simple de respaldo.
- Se ejecuta con `investigar_solicitud.txt` (p. ej. `hecho:ddc06eb45e r20`) → workflow `investigador.yml` → `datos/v3/investigacion/`.
- Red del runner: alcanzables Gemini, Groq, OpenRouter, OpenAI, Anthropic (con clave), Nominatim, OSM/Esri tiles, Google Fonts. Modelos GitHub (models.github.ai) NO sirven. Secrets: GEMINI_API_KEY, GROQ_API_KEY (gratuitas).

## Problemas abiertos (por prioridad)
1. **Calidad de redacción**: Gemini gratis da 429/503; Groq (gpt-oss-120b) redacta irregular (ej. "Alcance: Local" en un hecho internacional, da por cierta una versión en discrepancia). Falta validar la salida contra las fuentes (segundo paso de verificación) y fijar reglas por tipo de evento.
2. **Lectura de fuentes oficiales públicas** (SENAMHI, VIDECI, SNIS, etc.): no implementada; solo prensa.
3. **Un diseño por tipo de evento**: hoy hay una plantilla con variantes (tránsito con esquema; sequía con municipios). Faltan incendio, sismo, brote, inundación con su propio mapa/gráfico.
4. **Foto**: solo enlace por QR (derechos de autor). 
5. **Tiempo**: ~5-9 min por boletín; solo probado en 2 hechos (tránsito, sequía).
6. **Mapa**: zoom a veces muy alejado; geocodificación débil para avenidas.
7. Integración con el sitio (`docs/`) y publicación de boletines enlazados a cada hecho.
8. Pruebas: `python -m pytest -q` (106 pasan).

## Criterios del usuario (obligatorios)
- Boletín **público**: no pide acciones a la MAE ni a nadie. Sin cronología/reconstrucción repetida, sin triangulación como sección (se usa para escribir; fuentes y método al final, cortos).
- Contenido: síntesis, cifras, mapa/geolocalización, identificación + foto (enlace), esquema, estado de la cadena de atención, vacíos. Referencia de calidad: `REPORTE_ACCIDENTE_DE_TRANSITO_CIUDADANO_DE_COREA_DEL_SUR.pdf` (ChatGPT) y superarlo.
- Cada tipo de evento con su propio diseño; presentación de vanguardia; respuestas breves y concretas; en español.

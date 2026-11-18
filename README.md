# Sala de Situación Bolivia

Vigilancia de eventos que afectan la salud pública en Bolivia, con fuentes abiertas y costo cero (GitHub Pages + GitHub Actions).
Sitio: https://micangelarcangel-lang.github.io/sala-situacion-bolivia/

> Información preliminar de fuentes abiertas. No reemplaza los comunicados oficiales del Ministerio de Salud y Deportes ni de las instituciones técnicas.

## Principios
- **Nunca se inventa un dato.** Lo que falta se muestra como "sin dato" o "sin fuente conectada".
- **Triangulación:** un hecho se considera confirmado según cuántas familias de fuentes *independientes* coinciden (institucional, instrumental, satélite, modelo, prensa). Una sola familia = "por confirmar".
- **Índice de riesgo relativo** (tipo INFORM) entre municipios; no es una probabilidad. Pesos y cortes por validar con el CCES.

## Estructura
| Carpeta / archivo | Qué hace |
|---|---|
| `docs/` | Sitio estático (HTML + JS, sin servidor). Los datos son archivos `docs/*.json` que escribe el motor. |
| `docs/lib.js`, `s2.js`, `territorio.js`, `evidencia.js` | Utilidades compartidas, cabecera y estilos, capa territorial (339 municipios) y panel de evidencia por familia de fuente. |
| `docs/centro.html` | Centro de mando: dónde coinciden hoy las fuentes independientes. |
| `docs/modulo.html`, `geologica.html`, `meteorologica.html`, `hidrologica.html` | Un diseño por tipo de evento. |
| `ejecutar.py` y módulos `*.py` | Motor: recolecta (SENAMHI, sismos, NASA FIRMS, caudales, prensa, OPS/OMS…), depura (`depurar.py`), unifica hechos (`unificar.py`) y genera informes PDF. |
| `riesgo_diario.js` | Calcula el índice de riesgo diario ejecutando **el mismo código del sitio** (`docs/territorio.js`) sobre `docs/`. |

## Flujos automáticos (`.github/workflows/`)
- `sala.yml` — cada 30 min: recolecta, unifica, genera informes y guarda en `docs/`. Archiva PDFs de más de 90 días en GitHub Releases.
- `riesgo.yml` — diario 07:40 (hora de Bolivia): escribe `docs/riesgo_diario.json` y agrega una columna a `docs/riesgo_historial.json` (máx. 400 días).

## Probar en local
```bash
cd docs && python3 -m http.server 8766        # sitio en http://localhost:8766
npm install --no-save jsdom@24.1.3 && node riesgo_diario.js docs   # índice de riesgo del día
```

## Ramas
`main` = producción · `v3-prueba-de-valor` = espejo de desarrollo.

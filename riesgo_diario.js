/* Índice de riesgo diario por municipio.
   Ejecuta el MISMO código del sitio (docs/territorio.js › TERR.api.indices) sobre los archivos de docs/,
   dentro de jsdom, para que el valor guardado sea idéntico al que muestra la web (sin lógica duplicada).
   Solo lee archivos locales: no usa internet.
   Salidas:  docs/riesgo_diario.json      (foto del día)
             docs/riesgo_historial.json   (serie diaria por municipio, máx. 400 días)
   Uso: node riesgo_diario.js [carpeta_docs]   (requiere: npm i jsdom)                                     */
const fs = require("fs"), path = require("path");
const {JSDOM} = require("jsdom");
const DOCS = path.resolve(process.argv[2] || path.join(__dirname, "docs"));
const MAX_DIAS = 400, MIN_MUN = 300;

function leer(f) { const p = path.join(DOCS, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; }
function r2(x) { return x == null || isNaN(x) ? null : Math.round(x * 100) / 100; }
function diaLaPaz(ms) { return new Date(ms).toLocaleDateString("en-CA", {timeZone: "America/La_Paz"}); }

const dom = new JSDOM('<!doctype html><html><body><div id="hdr"></div><div id="app"></div></body></html>', {url: "http://localhost/index.html", runScripts: "outside-only", pretendToBeVisual: true});
const w = dom.window;
w.fetch = (u) => {
  const f = path.join(DOCS, String(u).split("?")[0]);
  return Promise.resolve(fs.existsSync(f)
    ? {ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, "utf8")))}
    : {ok: false, json: () => Promise.resolve(null)});
};
for (const f of ["lib.js", "s2.js", "clima.js", "perfil.js", "territorio.js"]) w.eval(fs.readFileSync(path.join(DOCS, f), "utf8") + "\n//# sourceURL=" + f);

w.TERR.cargar().then((T) => {
  const I = w.TERR.api.indices(T), ks = Object.keys(I).filter((k) => k.charAt(0) !== "_"), ahora = Date.now(), fecha = diaLaPaz(ahora);
  if (ks.length < MIN_MUN) throw new Error("Solo " + ks.length + " municipios calculados (mínimo " + MIN_MUN + "): no se escribe nada.");
  const gen = ((T.D.eventos_unificados || {}).generado) || null;

  const mun = {}, cont = {"Muy bajo": 0, "Bajo": 0, "Medio": 0, "Alto": 0, "Muy alto": 0};
  ks.sort().forEach((k) => {
    const o = I[k], niv = o.niv[1];
    cont[niv] = (cont[niv] || 0) + 1;
    mun[k] = {R: r2(o.R), A: r2(o.A), V: r2(o.V), L: r2(o.L), niv, act: r2(o.act), parcial: !!o.parcial, sinHist: !!o.sinHist};
  });

  /* Departamentos: riesgo medio ponderado por población (solo municipios con población) */
  const dep = {};
  Object.keys(T.DEP).forEach((d) => {
    let sw = 0, s = 0, n = 0, mx = null;
    T.DEP[d].forEach((m) => { const o = I[m.k]; if (!o) return; n++; if (!mx || o.R > mx.R) mx = o; if (m.pob) { sw += m.pob; s += o.R * m.pob; } });
    const R = sw ? s / sw : null;
    dep[d] = {R: r2(R), niv: R == null ? null : w.TERR.api.nivelR(R)[1], municipios: n, mayor: mx ? {k: mx.k, R: r2(mx.R)} : null};
  });

  const foto = {
    version: 1, fecha, generado: new Date(ahora).toISOString(), datos_al: gen,
    metodo: "Índice relativo tipo INFORM: R = raíz cúbica de Amenaza × Vulnerabilidad × Falta de capacidad (cada una 0–10, mínimo 0,5), calculado por percentiles entre municipios. Si falta un componente completo se calcula con los disponibles y se marca parcial.",
    aviso: "Índice relativo entre municipios; no es una probabilidad. Pesos y cortes por validar con el CCES.",
    niveles: cont, departamentos: dep, municipios: mun
  };

  /* Historial: una columna por día; se reemplaza la del mismo día si se vuelve a ejecutar */
  let h = leer("riesgo_historial.json");
  if (!h || !Array.isArray(h.fechas) || typeof h.municipios !== "object") h = {version: 1, fechas: [], municipios: {}};
  let i = h.fechas.indexOf(fecha);
  if (i < 0) { h.fechas.push(fecha); i = h.fechas.length - 1; }
  const n = h.fechas.length;
  Object.keys(h.municipios).forEach((k) => { while (h.municipios[k].length < n) h.municipios[k].push(null); });
  ks.forEach((k) => { if (!h.municipios[k]) h.municipios[k] = new Array(n).fill(null); h.municipios[k][i] = mun[k].R; });
  Object.keys(h.municipios).forEach((k) => { if (!(k in mun)) h.municipios[k][i] = null; });
  if (h.fechas.length > MAX_DIAS) { const c = h.fechas.length - MAX_DIAS; h.fechas = h.fechas.slice(c); Object.keys(h.municipios).forEach((k) => { h.municipios[k] = h.municipios[k].slice(c); }); }
  h.actualizado = foto.generado;

  fs.writeFileSync(path.join(DOCS, "riesgo_diario.json"), JSON.stringify(foto));
  fs.writeFileSync(path.join(DOCS, "riesgo_historial.json"), JSON.stringify(h));
  console.log("Riesgo diario " + fecha + ": " + ks.length + " municipios · " + JSON.stringify(cont) + " · historial " + h.fechas.length + " día(s)");
}).catch((e) => { console.error("FALLO riesgo_diario:", e && e.message || e); process.exit(1); });

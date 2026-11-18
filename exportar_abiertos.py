"""Exporta los datos de la sala en formatos abiertos para integrarlos con otros sistemas (solo lee archivos de docs/, sin internet):

  docs/abierto/eventos.geojson        GeoJSON (RFC 7946): hechos con ubicación
  docs/abierto/avisos_cap.xml         Alertas en CAP 1.2 (OASIS): avisos vigentes de SENAMHI
  docs/abierto/riesgo_municipal.csv   Índice de riesgo diario por municipio (CSV UTF-8)
  docs/abierto/datapackage.json       Descriptor Frictionless Data Package de los archivos tabulares y geográficos

Nada se inventa: lo que falta queda vacío. Si una entrada no se puede exportar, se omite y el resto sigue."""
import csv
import datetime
import json
import os
import sys
from xml.sax.saxutils import escape

DOCS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")
OUT = os.path.join(DOCS, "abierto")
SITIO = "https://micangelarcangel-lang.github.io/sala-situacion-bolivia/"
LA_PAZ = datetime.timezone(datetime.timedelta(hours=-4))


def leer(nombre):
    p = os.path.join(DOCS, nombre)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def iso(ms):
    try:
        return datetime.datetime.fromtimestamp(int(ms) / 1000, LA_PAZ).isoformat(timespec="seconds")
    except Exception:
        return None


def geojson_eventos():
    d = leer("eventos_unificados.json") or {}
    feats = []
    for e in d.get("eventos", []):
        try:
            lat, lon = e.get("lat"), e.get("lon")
            if lat is None or lon is None or not (-24 < float(lat) < -9 and -70 < float(lon) < -57):
                continue
            c = e.get("cifras") or {}
            conf = e.get("confianza") or {}
            feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(float(lon), 5), round(float(lat), 5)]},
                          "properties": {"id": e.get("id"), "origen": e.get("origen"), "categoria": e.get("categoria"), "titulo": e.get("titulo"),
                                         "fecha": iso(e.get("ts")), "nivel": e.get("nivel"), "nivel_texto": e.get("nivel_txt"), "oficial": bool(e.get("oficial")),
                                         "departamentos": e.get("departamentos") or [], "lugar": e.get("lugar") or None,
                                         "fallecidos": c.get("fallecidos"), "heridos": c.get("heridos"), "confianza": conf.get("nivel"),
                                         "fuente": e.get("fuente"), "url": e.get("url") or None}})
        except Exception:
            continue
    gen = iso(d.get("generado"))
    return {"type": "FeatureCollection", "name": "eventos_sala_situacion_bolivia", "generado": gen,
            "aviso": "Información preliminar de fuentes abiertas; los hechos de prensa no están confirmados por el Ministerio de Salud y Deportes.", "features": feats}


_SEV = {"AMARILLA": ("Moderate", "Expected"), "NARANJA": ("Severe", "Expected"), "ROJA": ("Extreme", "Expected"), "VERDE": ("Minor", "Future")}
_CAT = {"meteorológica": "Met", "hidrológica": "Met", "geológica": "Geo", "climatológica": "Met"}


def cap_avisos():
    d = leer("senamhi_alertas.json") or {}
    hoy = datetime.datetime.now(LA_PAZ).date().isoformat()
    ahora = datetime.datetime.now(LA_PAZ).isoformat(timespec="seconds")
    partes = []
    for i, a in enumerate(d.get("alertas", [])):
        try:
            if (a.get("fin") or "9999") < hoy or str(a.get("vigente")) == "False":
                continue
            niv = str(a.get("nivel") or "").upper()
            sev, urg = _SEV.get(niv, ("Unknown", "Unknown"))
            tipo = a.get("tipo") or "hidrológica"
            ident = "senamhi-" + (a.get("numero") or a.get("titulo", "")[-24:] or str(i)).replace(" ", "_").replace("/", "-")
            enviada = (a.get("publicada") or "")[:19].replace(" ", "T")
            enviada = (enviada + "-04:00") if enviada else ahora
            area = ", ".join(a.get("municipios") or a.get("departamentos") or []) or "Bolivia"
            ev = a.get("fenomeno") or ("Amenaza " + tipo)
            ini = (a.get("inicio") or hoy) + "T00:00:00-04:00"
            fin = (a.get("fin") or hoy) + "T23:59:59-04:00"
            partes.append(
                "  <alert>\n"
                f"    <identifier>{escape(ident)}</identifier>\n    <sender>sala-situacion-bolivia@users.noreply.github.com</sender>\n    <sent>{escape(enviada)}</sent>\n"
                "    <status>Actual</status>\n    <msgType>Alert</msgType>\n    <source>SENAMHI Bolivia</source>\n    <scope>Public</scope>\n"
                "    <info>\n      <language>es-BO</language>\n"
                f"      <category>{_CAT.get(tipo, 'Met')}</category>\n      <event>{escape(ev)}</event>\n      <urgency>{urg}</urgency>\n      <severity>{sev}</severity>\n      <certainty>Likely</certainty>\n"
                f"      <effective>{escape(ini)}</effective>\n      <expires>{escape(fin)}</expires>\n      <senderName>SENAMHI Bolivia (reproducido por Sala de Situación Bolivia)</senderName>\n"
                f"      <headline>{escape(a.get('titulo') or ev)}</headline>\n      <description>{escape((a.get('descripcion') or a.get('texto') or '')[:1500])}</description>\n"
                f"      <web>{escape(a.get('url') or a.get('pdf') or SITIO)}</web>\n"
                f"      <area>\n        <areaDesc>{escape(area[:1000])}</areaDesc>\n      </area>\n    </info>\n  </alert>")
        except Exception:
            continue
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<!-- Reproducción en CAP 1.2 de los avisos vigentes de SENAMHI; la fuente oficial es senamhi.gob.bo. Municipios por intersección de polígonos (aproximado). Severidad según el color del aviso: amarilla = Moderate, naranja = Severe, roja = Extreme (convención de la sala, no de SENAMHI). -->\n'
            '<alerts xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">\n' + "\n".join(partes) + "\n</alerts>\n"), len(partes)


def csv_riesgo():
    d = leer("riesgo_diario.json")
    if not d:
        return 0
    filas = 0
    with open(os.path.join(OUT, "riesgo_municipal.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["fecha", "departamento", "municipio", "riesgo", "amenaza", "vulnerabilidad", "falta_capacidad", "nivel", "indice_parcial"])
        for k, m in sorted((d.get("municipios") or {}).items()):
            dep, _, mun = k.partition("|")
            w.writerow([d.get("fecha"), dep, mun] + ["" if m.get(x) is None else m.get(x) for x in ("R", "A", "V", "L")] + [m.get("niv"), "sí" if m.get("parcial") else "no"])
            filas += 1
    return filas


def datapackage(n_feat, n_cap, n_csv):
    return {"profile": "data-package", "name": "sala-situacion-bolivia", "title": "Sala de Situación Bolivia — datos abiertos",
            "description": "Hechos geolocalizados, avisos vigentes en formato CAP e índice de riesgo municipal diario. Información preliminar de fuentes abiertas; el índice es relativo entre municipios y está por validar con el CCES.",
            "homepage": SITIO, "created": datetime.datetime.now(LA_PAZ).isoformat(timespec="seconds"),
            "licenses": [], "notes_licencia": "Licencia por definir por el titular del proyecto; cada fuente original conserva su propia licencia y condiciones de uso.",
            "resources": [
                {"name": "eventos", "path": "eventos.geojson", "format": "geojson", "mediatype": "application/geo+json", "description": f"{n_feat} hechos con ubicación (RFC 7946)."},
                {"name": "avisos-cap", "path": "avisos_cap.xml", "format": "xml", "mediatype": "application/xml", "description": f"{n_cap} aviso(s) vigente(s) de SENAMHI en CAP 1.2 (OASIS)."},
                {"name": "riesgo-municipal", "path": "riesgo_municipal.csv", "format": "csv", "mediatype": "text/csv", "encoding": "utf-8", "description": f"{n_csv} municipios. Riesgo 0–10 relativo entre municipios (no es una probabilidad).",
                 "schema": {"fields": [{"name": "fecha", "type": "date"}, {"name": "departamento", "type": "string"}, {"name": "municipio", "type": "string"},
                                       {"name": "riesgo", "type": "number"}, {"name": "amenaza", "type": "number"}, {"name": "vulnerabilidad", "type": "number"},
                                       {"name": "falta_capacidad", "type": "number"}, {"name": "nivel", "type": "string"}, {"name": "indice_parcial", "type": "string"}]}}]}


def main():
    os.makedirs(OUT, exist_ok=True)
    g = geojson_eventos()
    with open(os.path.join(OUT, "eventos.geojson"), "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False, separators=(",", ":"))
    xml, n_cap = cap_avisos()
    with open(os.path.join(OUT, "avisos_cap.xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    n_csv = csv_riesgo()
    with open(os.path.join(OUT, "datapackage.json"), "w", encoding="utf-8") as f:
        json.dump(datapackage(len(g["features"]), n_cap, n_csv), f, ensure_ascii=False, indent=1)
    print(f"Datos abiertos: {len(g['features'])} hechos (GeoJSON), {n_cap} aviso(s) CAP, {n_csv} municipios (CSV)")


if __name__ == "__main__":
    main()

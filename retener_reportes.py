#!/usr/bin/env python3
"""Retención de reportes PDF de la Sala de Situación.

Los PDF con más de N días (90 por defecto) se archivan en una Release de GitHub
(una por mes: reportes-AAAA-MM) y SOLO después de comprobar que quedaron subidos se
quitan de docs/reportes. Nunca borra lo que no pudo archivar ni lo que no puede fechar.

Uso:  python retener_reportes.py [--dias 90] [--simular] [--hoy AAAA-MM-DD]
Requiere el CLI `gh` autenticado (en Actions: GH_TOKEN=${{ github.token }}).
Nota: los PDF ya subidos al historial de git siguen en él; esto acota el tamaño del
sitio publicado y evita que crezca sin límite, no reescribe el historial.
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
REP = os.environ.get("REPORTES_DIR") or os.path.join(BASE, "docs", "reportes")
FRENO = 0.6  # no se borra más de esta fracción del total en una corrida (protege de errores de fecha o de reloj)


def fecha_de(nombre):
    """Fecha del reporte según su nombre; None si no se puede fechar (entonces se conserva)."""
    try:
        m = re.search(r"(\d{4})(\d{2})(\d{2})_\d{4}", nombre) or re.search(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)", nombre)
        if m:
            return dt.date(int(m[1]), int(m[2]), int(m[3]))
        m = re.search(r"(\d{4})-W(\d{2})", nombre)
        if m:  # reporte semanal: cuenta desde el domingo de esa semana ISO
            return dt.date.fromisocalendar(int(m[1]), int(m[2]), 7)
        m = re.search(r"(?<!\d)(\d{4})-(\d{2})(?!\d|-)", nombre)
        if m:  # reporte mensual: cuenta desde el último día del mes
            y, mo = int(m[1]), int(m[2])
            return dt.date(y + (mo == 12), mo % 12 + 1, 1) - dt.timedelta(days=1)
    except ValueError:
        return None
    return None


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True)


def archivar(tag, archivos, repo):
    """Sube los PDF a la Release `tag` y devuelve (los verificados en la Release, mensaje de error)."""
    if gh("release", "view", tag, "--repo", repo).returncode != 0:
        r = gh("release", "create", tag, "--repo", repo, "--title", f"Reportes PDF archivados {tag[-7:]}",
               "--notes", "Reportes PDF de la Sala de Situación retirados del sitio por política de retención (origen: docs/reportes).")
        if r.returncode:
            return set(), f"no se pudo crear la Release {tag}: {r.stderr.strip()[:200]}"
    r = gh("release", "upload", tag, *[os.path.join(REP, f) for f in archivos], "--repo", repo, "--clobber")
    if r.returncode:
        return set(), f"falló la subida a {tag}: {r.stderr.strip()[:200]}"
    v = gh("release", "view", tag, "--repo", repo, "--json", "assets", "--jq", ".assets[].name")
    if v.returncode:
        return set(), f"no se pudo verificar la Release {tag}: {v.stderr.strip()[:200]}"
    en_release = set(v.stdout.split())
    return {f for f in archivos if f in en_release}, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=int(os.environ.get("RETENCION_DIAS", "90")))
    ap.add_argument("--hoy", default=None, help="AAAA-MM-DD (solo para pruebas)")
    ap.add_argument("--simular", action="store_true", help="solo muestra qué haría, sin tocar nada")
    a = ap.parse_args()

    hoy = dt.date.fromisoformat(a.hoy) if a.hoy else dt.datetime.now(dt.timezone.utc).date()
    corte = hoy - dt.timedelta(days=a.dias)
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    pdfs = sorted(f for f in os.listdir(REP) if f.endswith(".pdf"))
    sin_fecha = [f for f in pdfs if fecha_de(f) is None]
    viejos = [f for f in pdfs if (fecha_de(f) or hoy) < corte]
    print(f"Retención {a.dias} días · hoy {hoy} · corte {corte} · {len(pdfs)} PDF, {len(viejos)} con más de {a.dias} días, {len(sin_fecha)} sin fecha (se conservan)")
    if sin_fecha:
        print("::warning::PDF sin fecha reconocible en el nombre (se conservan): " + ", ".join(sin_fecha[:5]))
    if not viejos:
        print("Nada que archivar.")
        return 0
    if len(viejos) > FRENO * len(pdfs):
        print(f"::error::Freno de seguridad: se archivaría {len(viejos)} de {len(pdfs)} PDF (> {int(FRENO * 100)} %). No se toca nada; revisar fechas.")
        return 1
    if a.simular:
        print("SIMULACIÓN: se archivarían y quitarían: " + ", ".join(viejos))
        return 0
    if not repo:
        print("::error::Falta GITHUB_REPOSITORY; no se puede archivar. No se borra nada.")
        return 1

    por_tag = {}
    for f in viejos:
        d = fecha_de(f)
        por_tag.setdefault(f"reportes-{d:%Y-%m}", []).append(f)

    ruta_arch = os.path.join(REP, "archivo.json")
    try:
        arch = json.load(open(ruta_arch, encoding="utf-8"))
    except Exception:
        arch = []
    try:
        tit = json.load(open(os.path.join(REP, "titulos.json"), encoding="utf-8"))
    except Exception:
        tit = {}

    hubo_error, quitados = False, 0
    for tag, fs in sorted(por_tag.items()):
        ok, err = archivar(tag, fs, repo)
        if err:
            hubo_error = True
            print(f"::warning::{err}. No se borra ningún PDF de {tag}.")
        for f in fs:
            if f not in ok:
                if not err:
                    hubo_error = True
                    print(f"::warning::{f} no aparece en la Release {tag}; se conserva.")
                continue
            os.remove(os.path.join(REP, f))
            tit.pop(f, None)
            arch.append({"archivo": f, "fecha": fecha_de(f).isoformat(), "release": tag,
                         "url": f"https://github.com/{repo}/releases/download/{tag}/{f}"})
            quitados += 1
    if quitados:
        json.dump(sorted(arch, key=lambda x: x["archivo"]), open(ruta_arch, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        json.dump(tit, open(os.path.join(REP, "titulos.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"Archivados y quitados del sitio: {quitados} de {len(viejos)}.")
    return 1 if hubo_error else 0


if __name__ == "__main__":
    sys.exit(main())

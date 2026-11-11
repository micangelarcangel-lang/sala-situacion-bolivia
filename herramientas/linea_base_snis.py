"""Línea base histórica SNIS-VE 2010–2021 (mauforonda/vigilancia-epidemiologica, datos abiertos).
Uso: python3 herramientas/linea_base_snis.py <carpeta datos del repo> > docs/linea_base_snis.json
Total mensual (nacional y por departamento) para las enfermedades listadas; el último valor de cada fila es el total."""
import csv, glob, json, os, re, sys
D = sys.argv[1]
DIS = {"dengue": r"_dengue$", "malaria": r"_malaria$", "ira": r"ira-sin-neumonia$", "leishmaniasis": r"_leishmaniasis$", "varicela": r"_varicela$"}  # se excluyen neumonía (duplica IRA), chagas agudo (ruptura de serie 2015) y diarrea/sarampión (sin serie continua)
out = {}
for k, rx in DIS.items():
    for f in sorted(glob.glob(os.path.join(D, "*.csv"))):
        n = os.path.basename(f)[:-4]; y = int(n[:4]); n2 = n[5:]
        if y < 2010 or not re.search(rx, n2) or "muerte" in n2 or "mortalidad" in n2: continue
        for r in csv.reader(open(f, encoding="utf8")):
            if not r or r[0] == "codigo_municipio": continue
            try: v = float(r[-1]); m = int(r[4][5:7]); dep = str(r[0])[0]
            except Exception: continue
            a = out.setdefault(k, {}).setdefault(str(y), {}); 
            for z in ("nac", dep): a.setdefault(z, [0] * 12)[m - 1] += v
print(json.dumps({"fuente": "SNIS-VE vía mauforonda/vigilancia-epidemiologica (2001–2021, municipal mensual)", "deps": {"1": "Chuquisaca", "2": "La Paz", "3": "Cochabamba", "4": "Oruro", "5": "Potosí", "6": "Tarija", "7": "Santa Cruz", "8": "Beni", "9": "Pando"}, "d": out}, separators=(",", ":")))

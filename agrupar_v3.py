# -*- coding: utf-8 -*-
"""Agrupa notas que hablan del mismo hecho (v3). Sin modelos externos: TF-IDF + lugar + tiempo, reglas revisables.
Dos notas se unen si: (1) sus lugares son compatibles, (2) están a <= ventana_h horas, (3) su similitud de texto alcanza el umbral,
que baja si coinciden en municipio y en cifra de víctimas. Cada grupo guarda por qué se unió (razones)."""
import math, re, unicodedata
from collections import Counter

PARADA = set("de la el en y a los las un una con por para que se del al su sus lo como mas es son fue tras ante sobre entre este esta hay deja dejo dejan".split())


def _toks(t):
    t = "".join(c for c in unicodedata.normalize("NFD", (t or "").lower()) if unicodedata.category(c) != "Mn")
    return [w for w in re.findall(r"[a-z0-9]+", t) if w not in PARADA and len(w) > 2]


def _tfidf(docs):
    n = len(docs)
    df = Counter(w for d in docs for w in set(d))
    vecs = []
    for d in docs:
        tf = Counter(d)
        v = {w: (1 + math.log(c)) * (math.log((1 + n) / (1 + df[w])) + 1) for w, c in tf.items()}
        norma = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({w: x / norma for w, x in v.items()})
    return vecs


def _coseno(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(w, 0.0) for w, x in a.items())


def agrupar(notas, ventana_h=48, umbral=0.45, umbral_mismo_lugar=0.30):
    """notas: lista de dicts con titulo, cuerpo (opcional), ts (ms), municipio, departamento, fallecidos (min o None).
    Devuelve lista de grupos: {'indices': [...], 'razones': [...]}."""
    vecs = _tfidf([_toks(n.get("titulo", "") + " " + n.get("titulo", "") + " " + (n.get("cuerpo") or "")[:600]) for n in notas])
    # términos raros del titular (lugar, enfermedad, nombre propio): si dos notas comparten >= 2, hablan casi seguro del mismo hecho
    tt = [set(w for w in _toks(n.get("titulo", "")) if len(w) >= 6) for n in notas]
    dft = Counter(w for t in tt for w in t)
    tope_raro = max(6, int(0.05 * len(notas)))
    padre = list(range(len(notas)))
    razon = {}

    def raiz(i):
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    for i in range(len(notas)):
        for j in range(i + 1, len(notas)):
            a, b = notas[i], notas[j]
            if abs((a.get("ts") or 0) - (b.get("ts") or 0)) > ventana_h * 3600 * 1000:
                continue
            da, db = a.get("departamento"), b.get("departamento")
            if da and db and da != db:
                continue
            ga, gb = a.get("grandes") or (), b.get("grandes") or ()
            if a.get("subtipo") and a.get("subtipo") == b.get("subtipo") and any(abs(x - y) <= 0.01 * max(x, y) for x in ga for y in gb):
                padre[raiz(j)] = raiz(i)  # misma cifra grande y mismo tipo (p. ej. 114.000 familias por sequía): es el mismo hecho
                razon.setdefault(raiz(i), []).append(f"{i}~{j} misma cifra: {ga[0]}")
                continue
            ma, mb = a.get("municipio"), b.get("municipio")
            if ma and mb and ma != mb:
                continue
            mismo = bool(ma and ma == mb)
            fa, fb = a.get("fallecidos"), b.get("fallecidos")
            if fa is not None and fb is not None and fa != fb and fa > 1 and fb > 1:
                continue  # cifras de muertos incompatibles: hechos distintos
            sim = _coseno(vecs[i], vecs[j])
            raros = [w for w in tt[i] & tt[j] if dft[w] <= tope_raro]
            if len(raros) >= (2 if mismo else 4):  # sin el mismo municipio confirmado se exigen 4 términos raros compartidos
                padre[raiz(j)] = raiz(i)
                razon.setdefault(raiz(i), []).append(f"{i}~{j} términos raros: {', '.join(sorted(raros))[:50]}")
                continue
            if sim >= (umbral_mismo_lugar if mismo else umbral):
                padre[raiz(j)] = raiz(i)
                razon.setdefault(raiz(i), []).append(f"{i}~{j} sim={sim:.2f}{' mismo municipio' if mismo else ''}")
    grupos = {}
    for i in range(len(notas)):
        grupos.setdefault(raiz(i), []).append(i)
    return [{"indices": idx, "razones": [r for k in (raiz(idx[0]),) for r in razon.get(k, [])]} for idx in grupos.values()]

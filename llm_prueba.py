"""Prueba de viabilidad: ¿puede GitHub Actions llamar a un modelo de lenguaje GRATIS con el GITHUB_TOKEN (GitHub Models)?
Mide: catálogo disponible, calidad de extracción estructurada sobre un texto real, tiempo y límites de uso. No guarda nada."""
import json, os, time, urllib.request, urllib.error

TOKEN = os.environ.get("GITHUB_TOKEN", "")
H = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json"}


def get(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=60)
        return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def chat(modelo, texto):
    msg = {"model": modelo, "temperature": 0, "response_format": {"type": "json_object"}, "messages": [
        {"role": "system", "content": "Eres analista de vigilancia basada en eventos. Extrae SOLO lo que dice el texto; si un dato no está, usa null. Responde JSON."},
        {"role": "user", "content": "Extrae: fecha_hecho, hora, lugar, victima{nombre,edad,nacionalidad,estado}, vehiculo, conductor{estado_policial,declaracion}, instituciones_citadas[], cifras{fallecidos,heridos}, dato_no_confirmado[].\n\nTEXTO:\n" + texto}]}
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request("https://models.github.ai/inference/chat/completions", data=json.dumps(msg).encode(), headers=H), timeout=120)
        d = json.load(r)
        return {"ok": True, "seg": round(time.time() - t, 1), "limites": {k: v for k, v in r.headers.items() if "ratelimit" in k.lower() or "retry" in k.lower()}, "respuesta": d["choices"][0]["message"]["content"], "uso": d.get("usage")}
    except urllib.error.HTTPError as e:
        return {"ok": False, "http": e.code, "detalle": e.read().decode()[:400]}
    except Exception as e:
        return {"ok": False, "detalle": f"{type(e).__name__}: {e}"}


if __name__ == "__main__":
    print("TOKEN presente:", bool(TOKEN))
    st, cat = get("https://models.github.ai/catalog/models")
    print("CATALOGO http", st)
    if isinstance(cat, list):
        ids = [m.get("id") for m in cat]
        print(len(ids), "modelos:", ids[:60])
    else:
        print(str(cat)[:400]); ids = []
    cu = json.load(open("datos/v3/cuerpos.json", encoding="utf-8"))
    texto = next((v["texto"] for k, v in cu.items() if "coreano" in v.get("texto", "").lower() or "ciclista" in v.get("texto", "").lower()), "")
    if not texto:
        texto = "El Alto, 4 nov.- Un ciclista surcoreano de 33 años murió atropellado por un camión de carga en la avenida 6 de Marzo. El conductor huyó, pero fue aprehendido horas después. Según el capitán Medina, de Tránsito, dijo que no vio la bicicleta; la alcoholemia fue negativa."
    print("TEXTO (", len(texto), "caracteres ):", texto[:200].replace("\n", " "))
    cand = [m for m in ("openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4o", "meta/llama-3.3-70b-instruct", "deepseek/deepseek-v3-0324", "mistral-ai/mistral-medium-2505") if not ids or m in ids] or ["openai/gpt-4.1-mini"]
    for m in cand[:3]:
        print("\n=== MODELO", m); print(json.dumps(chat(m, texto[:6000]), ensure_ascii=False, indent=1))

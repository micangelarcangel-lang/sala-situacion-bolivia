# -*- coding: utf-8 -*-
"""Captación universal de notas: para CADA portal prueba varios métodos públicos (RSS, API de WordPress, mapa de noticias, sitemap, portada)
y usa el que funcione. Deja el resultado por portal en docs/captacion_estado.json (qué método funcionó, cuántas notas, error si falló)."""
import re, time, json, os, hashlib, datetime, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import xml.etree.ElementTree as ET

PORTALES = {
    "La Razón": "https://www.la-razon.com", "Opinión": "https://www.opinion.com.bo", "Los Tiempos": "https://www.lostiempos.com", "El Deber": "https://eldeber.com.bo",
    "Página Siete": "https://www.paginasiete.bo", "Visión 360": "https://www.vision360.bo", "Cambio": "https://www.cambio.bo", "Brújula Digital": "https://brujuladigital.net",
    "Eju.tv": "https://eju.tv", "Unitel": "https://unitel.bo", "Red Uno": "https://www.reduno.com.bo", "ATB": "https://www.atb.com.bo", "El Alteño": "https://elalteno.com.bo",
    "Radio Panamericana": "https://panamericana.bo", "Bolivia Verifica": "https://boliviaverifica.bo", "El Diario": "https://www.eldiario.net", "La Patria": "https://lapatriaenlinea.com",
    "Correo del Sur": "https://correodelsur.com", "El Día": "https://eldia.com.bo", "Erbol": "https://erbol.com.bo", "ABI": "https://abi.bo", "Bolivia.com": "https://www.bolivia.com",
    "Oxígeno": "https://oxigeno.bo", "Urgente.bo": "https://urgente.bo", "Infodeinteres": "https://infodeinteres.com",
    "SENAMHI": "https://www.senamhi.gob.bo", "Defensa Civil / VIDECI": "https://www.defensacivil.gob.bo", "Min. Defensa": "https://www.mindef.gob.bo", "ABC": "https://www.abc.gob.bo",
    "Min. Salud": "https://www.minsalud.gob.bo", "SEDES La Paz": "https://sedeslapaz.gob.bo", "Gob. La Paz": "https://lapaz.gob.bo", "INE": "https://www.ine.gob.bo", "SNGR": "https://www.sngr.gob.bo",
}
PELIGRO = re.compile(r"accident|chocq|choc[oó]|vuelc|colisi|incendi|inunda|riada|granizad|helada|nevad|sism|temblor|deslizam|derrumb|bloque|explosi|dengue|brote|sequ[ií]a|emergencia|desastre|alerta|aviso|lluvia|tormenta|desborde|mazamorra|muert|fallec|herid|rescat|evacu|sarampi|fiebre|chikun|rabia|gripe|aviar|incendio forestal|quema", re.I)
UA = {"User-Agent": "Mozilla/5.0 (compatible; SalaSituacionBolivia/1.0)", "Accept-Language": "es"}


import threading
_DL = threading.local()


def _get(url, t=10, n=2_500_000):
    if time.time() > getattr(_DL, "fin", 1e18):
        raise TimeoutError("presupuesto de tiempo del portal agotado")
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=min(t, 12))
    return r.read(n).decode("utf-8", "replace")


def _ts(s):
    try:
        s = (s or "").strip().replace("Z", "+00:00")
        d = datetime.datetime.fromisoformat(s) if "T" in s or "-" in s else None
        if d is None:
            raise ValueError
        if d.tzinfo is None:
            d = d.replace(tzinfo=datetime.timezone.utc)
        return int(d.timestamp() * 1000)
    except Exception:
        try:
            import email.utils
            return int(email.utils.parsedate_to_datetime(s).timestamp() * 1000)
        except Exception:
            return 0


def _titulo_de_url(u):
    slug = urllib.parse.urlparse(u).path.rstrip("/").rsplit("/", 1)[-1]
    slug = re.sub(r"\.(html?|php)$", "", slug)
    slug = re.sub(r"[-_]\d{4,}$", "", slug)
    t = re.sub(r"[-_]+", " ", slug).strip()
    return t[:1].upper() + t[1:] if len(t) > 15 and " " in t else ""


def _tag(e):
    return e.tag.rsplit("}", 1)[-1]


def _rss(base):
    out = []
    for p in ("/rss/listado/", "/feed", "/feed/", "/rss", "/rss.xml", "/feed.xml", "/?feed=rss2", "/index.php/feed", "/rss/portada", "/feeds/posts/default"):
        try:
            x = _get(base + p)
            if "<item" not in x and "<entry" not in x:
                continue
            root = ET.fromstring(x.encode("utf-8", "replace"))
            for it in root.iter():
                if _tag(it) in ("item", "entry"):
                    d = {_tag(c): (c.text or "") for c in it}
                    link = d.get("link") or next((c.get("href") for c in it if _tag(c) == "link" and c.get("href")), "")
                    out.append((d.get("title", "").strip(), link, _ts(d.get("pubDate") or d.get("published") or d.get("updated") or d.get("date"))))
            if out:
                return out, "rss " + p
        except Exception:
            continue
    return [], ""


def _wp(base):
    try:
        j = json.loads(_get(base + "/wp-json/wp/v2/posts?per_page=50&_fields=date_gmt,link,title"))
        out = [(re.sub(r"<[^>]+>", "", (p.get("title") or {}).get("rendered", "")).replace("&#8220;", '"').replace("&#8221;", '"').replace("&#8211;", "-").replace("&#038;", "&").strip(), p.get("link", ""), _ts(p.get("date_gmt"))) for p in j]
        return out, "api wordpress" if out else ""
    except Exception:
        return [], ""


def _sitemap(base):
    cands = []
    try:
        for l in _get(base + "/robots.txt", 15, 60000).splitlines():
            if l.lower().startswith("sitemap:"):
                cands.append(l.split(":", 1)[1].strip())
    except Exception:
        pass
    cands += [base + p for p in ("/sitemap_news.xml", "/news-sitemap.xml", "/sitemap-news.xml", "/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml")]
    vistos, cola, out, nn = set(), list(dict.fromkeys(cands))[:10], [], 0
    while cola and nn < 8:
        u = cola.pop(0)
        if u in vistos:
            continue
        vistos.add(u); nn += 1
        try:
            x = _get(u, 25)
            root = ET.fromstring(x.encode("utf-8", "replace"))
        except Exception:
            continue
        if _tag(root) == "sitemapindex":
            hijos = [(c.findtext("{*}lastmod") or "", c.findtext("{*}loc") or "") for c in root.iter() if _tag(c) == "sitemap"]
            hijos.sort(reverse=True)
            noticia = [h for h in hijos if re.search(r"news|noticia|post|article|nota", h[1], re.I)]
            cola = [h[1] for h in (noticia or hijos)[:3]] + cola
            continue
        for e in root.iter():
            if _tag(e) != "url":
                continue
            loc = e.findtext("{*}loc") or ""
            tit = next((c.text or "" for c in e.iter() if _tag(c) == "title"), "")
            fecha = next((c.text or "" for c in e.iter() if _tag(c) in ("publication_date",)), "") or e.findtext("{*}lastmod") or ""
            out.append((tit.strip() or _titulo_de_url(loc), loc, _ts(fecha)))
        if out:
            out.sort(key=lambda r: -r[2])
            return out[:400], "sitemap " + u.replace(base, "")
    return [], ""


def _portada(base):
    out = []
    for p in ("/", "/noticias", "/prensa"):
        try:
            x = _get(base + p)
        except Exception:
            continue
        for m in re.finditer(r'<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', x, re.S | re.I):
            h, t = m.group(1), re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip()
            if len(t) >= 35 and " " in t:
                out.append((t, urllib.parse.urljoin(base + p, h), 0))
        if len(out) >= 20:
            break
    return out[:200], "portada" if out else ""



def _bing(base):
    """Bing Noticias (RSS público) filtrado al dominio del portal: respaldo cuando el portal bloquea la lectura directa."""
    dom = urllib.parse.urlparse(base).netloc.replace("www.", "")
    q = urllib.parse.quote(f"site:{dom}")
    try:
        x = _get(f"https://www.bing.com/news/search?q={q}&format=rss&setlang=es-BO&cc=BO")
        root = ET.fromstring(x.encode("utf-8", "replace"))
        out = []
        for it in root.iter("item"):
            link = it.findtext("link") or ""
            m = re.search(r"[?&]url=([^&]+)", link)
            if m:
                link = urllib.parse.unquote(m.group(1))
            out.append(((it.findtext("title") or "").strip(), link, _ts(it.findtext("pubDate"))))
        return out, "bing noticias" if out else ""
    except Exception:
        return [], ""


# ---------------------------------------------------------------- redes públicas y videos (solo lo que es público y sin clave)
RX_RED = {
    "youtube": re.compile(r'https?://(?:www\.)?youtube\.com/((?:channel/UC[\w-]{22})|(?:@[\w.\-]+)|(?:c/[\w\-]+)|(?:user/[\w\-]+))', re.I),
    "telegram": re.compile(r'https?://(?:t\.me|telegram\.me)/(?:s/)?([A-Za-z][\w]{4,})', re.I),
    "facebook": re.compile(r'https?://(?:www\.)?facebook\.com/([\w.\-]{3,})', re.I),
    "x": re.compile(r'https?://(?:www\.)?(?:x|twitter)\.com/([\w]{2,})', re.I),
    "tiktok": re.compile(r'https?://(?:www\.)?tiktok\.com/(@[\w.\-]+)', re.I),
    "instagram": re.compile(r'https?://(?:www\.)?instagram\.com/([\w.\-]{3,})', re.I),
}
_IGN = {"share", "sharer", "intent", "home", "login", "tr", "plugins", "dialog", "watch", "playlist", "embed", "joinchat", "addstickers", "i", "hashtag"}


def descubrir_redes(base):
    """Las cuentas OFICIALES de cada medio se leen de su propio portal (no se adivinan)."""
    try:
        x = _get(base + "/", 12)
    except Exception:
        return {}
    r = {}
    for k, rx in RX_RED.items():
        for m in rx.finditer(x):
            v = m.group(1)
            if v.lower() in _IGN or v.lower().startswith(("sharer", "share")):
                continue
            r.setdefault(k, v)
            break
    return r


def _youtube_canal(ref):
    if ref.startswith("channel/"):
        cid = ref.split("/", 1)[1]
    else:
        x = _get("https://www.youtube.com/" + ref, 12)
        m = re.search(r'"(?:channelId|externalId)":"(UC[\w-]{22})"', x) or re.search(r'channel_id=(UC[\w-]{22})', x)
        if not m:
            return []
        cid = m.group(1)
    x = _get("https://www.youtube.com/feeds/videos.xml?channel_id=" + cid)
    root = ET.fromstring(x.encode("utf-8", "replace"))
    out = []
    for e in root.iter():
        if _tag(e) == "entry":
            d = {}
            for c in e.iter():
                d.setdefault(_tag(c), c.text or "")
            link = next((c.get("href") for c in e if _tag(c) == "link"), "")
            out.append((d.get("title", "").strip(), link, _ts(d.get("published")), (d.get("description") or "")[:400]))
    return out


def _telegram_canal(nombre):
    x = _get("https://t.me/s/" + nombre, 12)
    out = []
    for blk in x.split("tgme_widget_message_wrap")[1:]:
        t = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', blk, re.S)
        d = re.search(r'<a class="tgme_widget_message_date" href="([^"]+)"[^>]*><time[^>]*datetime="([^"]+)"', blk)
        if t and d:
            txt = re.sub(r"<[^>]+>", " ", t.group(1)); txt = re.sub(r"\s+", " ", txt.replace("&quot;", '"').replace("&amp;", "&")).strip()
            out.append((txt[:200], d.group(1), _ts(d.group(2)), txt[:600]))
    return out


def captar_redes(nombre, base, horas):
    """Devuelve (nombre, notas, redes_descubiertas, estado por red)."""
    _DL.fin = time.time() + 60
    redes = descubrir_redes(base)
    notas, est = [], {}
    for k, v in redes.items():
        if k not in ("youtube", "telegram"):
            est[k] = "cuenta encontrada (" + v + "); sin lectura pública sin inicio de sesión"
            continue
        try:
            L = _youtube_canal(v) if k == "youtube" else _telegram_canal(v)
            lim = int(time.time() * 1000) - horas * 3600000
            L = [r for r in L if r[2] == 0 or r[2] >= lim]
            notas += [(t, l, ts, d, k) for t, l, ts, d in L]
            est[k] = f"{len(L)} publicaciones leídas ({v})"
        except Exception as e:
            est[k] = "falló: " + type(e).__name__ + " " + str(e)[:60]
    return nombre, notas, redes, est


def captar_portal(nombre, base, horas):
    """Combina TODOS los métodos que respondan (un RSS trae solo ~10 notas; el sitemap y Bing traen más) y quita repetidas."""
    t0 = time.time()
    _DL.fin = t0 + 90
    lim = int(time.time() * 1000) - horas * 3600000
    todas, usados, vistos, errores = [], [], set(), []
    for fn in (_rss, _wp, _sitemap, _bing, _portada):
        try:
            L, met = fn(base)
        except Exception as e:
            L, met = [], ""
            errores.append(type(e).__name__)
        L = [r for r in L if r[1] and r[0] and (r[2] == 0 or r[2] >= lim)]
        if L:
            usados.append(met)
            for r in L:
                k = r[1].split("?")[0]
                if k not in vistos:
                    vistos.add(k); todas.append(r)
        if len(todas) >= 150 and fn is not _portada:
            break
    if todas:
        return nombre, todas, " + ".join(usados), round(time.time() - t0, 1), ""
    try:
        _DL.fin = time.time() + 15
        r = urllib.request.urlopen(urllib.request.Request(base + "/", headers=UA), timeout=10)
        det = f"responde HTTP {r.status} pero sin notas legibles (página cargada con JavaScript)"
    except Exception as e:
        det = "el portal rechaza la lectura: " + type(e).__name__ + " " + str(e)[:50]
    return nombre, [], "", round(time.time() - t0, 1), det



def _navegador(portales, horas, tope_s=150):
    """Último recurso para portales que cargan sus notas con JavaScript: abre el portal en un navegador real (Chromium sin pantalla)."""
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        return {}, "navegador no instalado (" + type(e).__name__ + ")"
    out, t0 = {}, time.time()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--no-sandbox"])
            ctx = b.new_context(user_agent=UA["User-Agent"], locale="es-BO")
            for nombre, base in portales:
                if time.time() - t0 > tope_s:
                    break
                L = []
                for ruta in ("/", "/noticias", "/prensa"):
                    try:
                        pg = ctx.new_page()
                        pg.goto(base + ruta, timeout=20000, wait_until="domcontentloaded")
                        try:
                            pg.wait_for_load_state("networkidle", timeout=8000)
                        except Exception:
                            pass
                        for t, h in pg.eval_on_selector_all("a", "els => els.map(e => [(e.innerText||e.getAttribute('aria-label')||e.title||'').trim(), e.href])"):
                            t = re.sub(r"\s+", " ", t)
                            if len(t) >= 35 and " " in t and h.startswith("http"):
                                L.append((t, h, 0))
                        pg.close()
                    except Exception:
                        pass
                    if len(L) >= 20:
                        break
                if L:
                    out[nombre] = L[:200]
            b.close()
    except Exception as e:
        return out, "navegador falló: " + type(e).__name__ + " " + str(e)[:80]
    return out, f"navegador: {len(out)} portales con notas"


def captar(docs, geo=None, horas=72, log=print):
    import busqueda
    import informe_hecho as ih
    ahora = int(time.time() * 1000)
    estado, eventos, vistos = {}, [], set()
    with ThreadPoolExecutor(max_workers=8) as ex:
        res = list(ex.map(lambda kv: captar_portal(kv[0], kv[1], horas), PORTALES.items()))
    pobres = [(r[0], PORTALES[r[0]]) for r in res if len(r[1]) < 8]
    if pobres:
        try:
            nv, msg_nav = _navegador(pobres, horas)
        except Exception as e:
            nv, msg_nav = {}, "navegador falló: " + type(e).__name__
        log("  · " + msg_nav)
        res = [(n, (nv[n] if n in nv else L), (m + " + navegador" if n in nv else m) if (n in nv or m) else m, s, ("" if n in nv else er)) for n, L, m, s, er in res]
        res = [(n, L, (m.strip(" +") or ("navegador" if L else "")), s, er) for n, L, m, s, er in res]
    with ThreadPoolExecutor(max_workers=8) as ex:
        rr = list(ex.map(lambda kv: captar_redes(kv[0], kv[1], horas), PORTALES.items()))
    redes_estado = {}
    for nombre, L, redes, est in rr:
        redes_estado[nombre] = {"cuentas": redes, "lectura": est}
        for tit, link, ts, det, red in L:
            if not PELIGRO.search(tit + " " + det):
                continue
            k = link.split("?")[0]
            if k in vistos:
                continue
            vistos.add(k)
            fa, he = ih.cifras(tit + ". " + det)
            nivel = 3 if (fa >= 10 or he >= 30) else 2 if (fa >= 3 or he >= 10) else 1
            lat = lon = None; lugar, metodo = "", "sin ubicar"
            if geo:
                lat, lon, lugar, metodo = busqueda.ubicar_por_nombre(geo, tit + " " + det)
            eventos.append({"id": "noticia:vivo:" + hashlib.md5(link.encode()).hexdigest()[:12], "ts": ts or ahora, "fuente": nombre, "tipo": busqueda.tipo_por_texto(tit + " " + det),
                            "nivel": nivel, "titulo": tit, "detalle": det, "url": link, "fall": fa, "her": he, "lat": lat, "lon": lon, "lugar": lugar, "metodo": metodo, "via": red})
    for nombre, L, met, seg, err in res:
        nuevas = 0
        for tit, link, ts in L:
            if not PELIGRO.search(tit):
                continue
            k = link.split("?")[0]
            if k in vistos:
                continue
            vistos.add(k)
            fa, he = ih.cifras(tit)
            nivel = 3 if (fa >= 10 or he >= 30) else 2 if (fa >= 3 or he >= 10) else 1
            lat = lon = None; lugar, metodo = "", "sin ubicar"
            if geo:
                lat, lon, lugar, metodo = busqueda.ubicar_por_nombre(geo, tit)
            eventos.append({"id": "noticia:vivo:" + hashlib.md5(link.encode()).hexdigest()[:12], "ts": ts or ahora, "fuente": nombre, "tipo": busqueda.tipo_por_texto(tit),
                            "nivel": nivel, "titulo": tit, "detalle": "", "url": link, "fall": fa, "her": he, "lat": lat, "lon": lon, "lugar": lugar, "metodo": metodo})
            nuevas += 1
        estado[nombre] = {"metodo": met or "ninguno", "leidas": len(L), "con_peligro": nuevas, "segundos": seg, "error": err}
    try:
        json.dump({"generado": ahora, "portales": estado, "redes": redes_estado}, open(os.path.join(docs, "captacion_estado.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    except Exception:
        pass
    ok = sum(1 for v in estado.values() if v["metodo"] != "ninguno")
    return eventos, f"{len(eventos)} notas de peligros en {ok}/{len(PORTALES)} portales leídos directamente"

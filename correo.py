# -*- coding: utf-8 -*-
"""Envío de reportes por correo (Gmail, contraseña de aplicación). Secretos: GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO (opcional)."""
import os, ssl, smtplib, mimetypes, html
from email.message import EmailMessage


def configurado():
    return bool(os.environ.get("GMAIL_USER", "").strip() and os.environ.get("GMAIL_APP_PASSWORD", "").strip())


def enviar(asunto, html_cuerpo, texto_plano, adjuntos=(), log=print):
    """adjuntos: rutas de archivo. Devuelve True si se envió."""
    if not configurado():
        log("(sin GMAIL_USER/GMAIL_APP_PASSWORD: no se envía correo)")
        return False
    usuario = os.environ["GMAIL_USER"].strip()
    clave = os.environ["GMAIL_APP_PASSWORD"].replace(" ", "").strip()
    para = [x.strip() for x in (os.environ.get("MAIL_TO") or usuario).replace(";", ",").split(",") if x.strip()]
    m = EmailMessage()
    m["Subject"] = asunto
    m["From"] = f"Sala de Situación Bolivia <{usuario}>"
    m["To"] = ", ".join(para)
    m.set_content(texto_plano)
    m.add_alternative(html_cuerpo, subtype="html")
    total = 0
    for ruta in adjuntos:
        try:
            tam = os.path.getsize(ruta)
            if total + tam > 20 * 1024 * 1024:
                log(f"adjunto omitido por tamaño: {ruta}")
                continue
            tipo, _ = mimetypes.guess_type(ruta)
            a, b = (tipo or "application/octet-stream").split("/", 1)
            m.add_attachment(open(ruta, "rb").read(), maintype=a, subtype=b, filename=os.path.basename(ruta))
            total += tam
        except Exception as e:
            log(f"no se pudo adjuntar {ruta}: {type(e).__name__}")
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=60) as s:
            s.login(usuario, clave)
            s.send_message(m)
        log(f"Correo enviado a {', '.join(para)}: {asunto}")
        return True
    except Exception as e:
        log(f"Correo falló: {type(e).__name__} {str(e)[:120]}")
        return False


def cuerpo_html(titulo, resumen, hechos, enlace_pdf, enlace_tablero):
    """resumen: lista de (etiqueta, valor); hechos: lista de (titulo, detalle)."""
    e = html.escape
    filas = "".join(f'<td style="padding:10px 14px;text-align:center;background:#f1f5fb;border-radius:8px"><div style="font-size:22px;font-weight:800;color:#0b3b6e">{e(str(v))}</div><div style="font-size:12px;color:#5b6b82">{e(str(k))}</div></td><td width="8"></td>' for k, v in resumen)
    li = "".join(f'<li style="margin-bottom:8px"><b>{e(t)}</b><br><span style="color:#5b6b82;font-size:13px">{e(d)}</span></li>' for t, d in hechos) or "<li>Sin hechos relevantes en el período.</li>"
    return f'''<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;color:#0f1b2d">
<div style="background:linear-gradient(90deg,#0b3b6e,#1d6fb8);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><div style="font-size:12px;opacity:.85">Sala de Situación · Bolivia</div><div style="font-size:21px;font-weight:800">{e(titulo)}</div></div>
<div style="border:1px solid #e1e7f0;border-top:0;padding:18px 22px;border-radius:0 0 12px 12px">
<table cellspacing="0" style="margin-bottom:16px"><tr>{filas}</tr></table>
<div style="font-weight:800;margin-bottom:6px">Hechos más importantes</div><ul style="padding-left:18px;margin:0 0 16px">{li}</ul>
<a href="{e(enlace_pdf)}" style="background:#1d6fb8;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;display:inline-block;margin-right:8px">Abrir el reporte PDF</a>
<a href="{e(enlace_tablero)}" style="color:#1d6fb8;font-weight:700">Ir al tablero</a>
<p style="font-size:11.5px;color:#7a8aa3;margin-top:18px">Información preliminar de fuentes abiertas (prensa, SENAMHI, NASA, OPS/OMS, otras). Las cifras de prensa no sustituyen la confirmación oficial. El PDF completo va adjunto.</p></div></div>'''

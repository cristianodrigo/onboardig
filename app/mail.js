import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST?.trim();
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS;
const fromAddr = (process.env.MAIL_FROM || user || '').trim();
const fromName = process.env.MAIL_FROM_NAME?.trim() || 'GCI — Onboarding';

export function mailConfigurado() {
  return Boolean(host && user && pass && fromAddr);
}

function transporter() {
  if (!mailConfigurado()) {
    throw new Error('Envio de e-mail não configurado. Defina SMTP_HOST, SMTP_USER, SMTP_PASS e MAIL_FROM.');
  }
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
  });
}

export function publicBase(req) {
  const env = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (env) return env;
  return `${req.protocol}://${req.get('host')}`;
}

export async function enviarConvite({ para, nome, link }) {
  const primeiro = (nome || '').trim().split(/\s+/)[0] || 'olá';
  const assunto = 'GCI — envie seus documentos de admissão';
  const texto = `Olá, ${primeiro}!

Bem-vindo(a) à GCI. Acesse o link abaixo para enviar seus documentos de admissão.
O link vale por 7 dias e só pode ser usado uma vez.

${link}

Se você não esperava este e-mail, fale com o RH.`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px;border:1px solid #e5e5e5;">
    <p style="margin:0 0 8px;font-size:13px;color:#666;">Grupo Consultoria Integrada</p>
    <h1 style="margin:0 0 16px;font-size:20px;">Onboarding</h1>
    <p style="margin:0 0 16px;line-height:1.5;">Olá, ${escHtml(primeiro)}! Bem-vindo(a) à GCI.</p>
    <p style="margin:0 0 20px;line-height:1.5;">Use o botão abaixo para enviar seus documentos de admissão. O link vale por <strong>7 dias</strong> e é de uso único.</p>
    <p style="margin:0 0 24px;"><a href="${escHtml(link)}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Enviar documentos</a></p>
    <p style="margin:0;font-size:12px;color:#666;line-height:1.5;word-break:break-all;">Se o botão não funcionar, copie este endereço:<br>${escHtml(link)}</p>
  </div>
</body></html>`;

  await transporter().sendMail({
    from: `"${fromName.replace(/"/g, '')}" <${fromAddr}>`,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) { location.href = '/login.html'; throw new Error('Não autenticado'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Erro inesperado. Tente de novo.');
  return data;
}

async function me() {
  const res = await fetch('/api/me');
  return (await res.json()).usuario;
}

async function requirePapel(papel) {
  const u = await me();
  if (!u) { location.href = '/login.html'; return null; }
  if (u.papel !== papel) {
    location.href = u.papel === 'rh' ? '/rh-revisao.html' : '/candidato-aprovacao.html';
    return null;
  }
  return u;
}

async function logout() {
  await api('/logout', { method: 'POST' });
  location.href = '/login.html';
}

const STATUS = {
  pendente:   { badge: 'b-pending',  icone: '○',  rotulo: 'Pendente' },
  em_revisao: { badge: 'b-review',   icone: '⏳', rotulo: 'Em revisão' },
  devolvido:  { badge: 'b-returned', icone: '↩',  rotulo: 'Devolvido' },
  aprovado:   { badge: 'b-approved', icone: '✓',  rotulo: 'Aprovado' },
};

const MOTIVOS = {
  foto_escura: 'Foto escura',
  foto_tremida: 'Foto tremida',
  corte: 'Documento cortado',
  reflexo: 'Reflexo na foto',
  numero_ilegivel: 'Número ilegível',
  numero_coberto: 'Número coberto',
  dados_divergentes: 'Dados divergentes do cadastro',
  outro: 'Outro',
};

const DICAS_DEVOLUCAO = 'Tire a foto perto de uma janela ou luz branca, apoie numa superfície plana e confira se os quatro cantos aparecem.';

function badgeStatus(status) {
  const s = STATUS[status] || STATUS.pendente;
  return `<span class="badge ${s.badge}"><span aria-hidden="true">${s.icone}</span> ${s.rotulo}</span>`;
}

function parseDevolucao(raw) {
  if (!raw) return { motivos: [], comentario: '' };
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j.motivos)) return { motivos: j.motivos, comentario: j.comentario || '' };
  } catch { /* formato legado: "foto_escura, numero_coberto" */ }
  return { motivos: String(raw).split(',').map((s) => s.trim()).filter(Boolean), comentario: '' };
}

function textoDevolucao(raw) {
  const d = parseDevolucao(raw);
  const nomes = d.motivos.map((m) => MOTIVOS[m] || m).join(' · ');
  return [nomes, d.comentario].filter(Boolean).join(' — ');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtData(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

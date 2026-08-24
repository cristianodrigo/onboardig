import { Router } from 'express';
import { db, auditar } from '../db.js';
import { docDoCatalogo, TIPOS_CONTRATO } from '../catalogo.js';
import { requireRh } from './auth.js';

const router = Router();

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

function progressoDaJornada(jornadaId) {
  const docs = db.prepare(`SELECT status FROM documentos WHERE jornada_id = ?`).all(jornadaId);
  return {
    enviados: docs.filter((d) => d.status !== 'pendente').length,
    aprovados: docs.filter((d) => d.status === 'aprovado').length,
    devolvidos: docs.filter((d) => d.status === 'devolvido').length,
    total: docs.length,
  };
}

router.get('/candidatos', requireRh, (req, res) => {
  const busca = `%${(req.query.q || '').toLowerCase()}%`;
  const rows = db.prepare(
    `SELECT u.id AS user_id, u.nome, u.email, u.ativo, j.id AS jornada_id, j.tipo_contrato, j.criado_em
     FROM jornadas j JOIN users u ON u.id = j.user_id
     WHERE lower(u.nome) LIKE ? OR lower(u.email) LIKE ?
     ORDER BY j.criado_em DESC`
  ).all(busca, busca);

  res.json({
    candidatos: rows.map((r) => ({
      ...r,
      tipo_contrato_label: TIPOS_CONTRATO[r.tipo_contrato] || r.tipo_contrato,
      progresso: progressoDaJornada(r.jornada_id),
    })),
  });
});

router.get('/candidatos/:id', requireRh, (req, res) => {
  const jornada = db.prepare(
    `SELECT j.*, u.nome, u.email, u.ativo FROM jornadas j JOIN users u ON u.id = j.user_id WHERE j.id = ?`
  ).get(req.params.id);
  if (!jornada) return res.status(404).json({ erro: 'Candidato não encontrado.' });

  const docs = db.prepare(`SELECT * FROM documentos WHERE jornada_id = ? ORDER BY id`).all(jornada.id).map((d) => {
    const spec = docDoCatalogo(jornada.tipo_contrato, d.tipo) || {};
    return {
      id: d.id, tipo: d.tipo, nome: spec.nome, icone: spec.icone, campos: spec.campos || [],
      status: d.status, motivo_devolucao: d.motivo_devolucao, tem_arquivo: !!d.arquivo_path,
      arquivo_nome: d.arquivo_nome, enviado_em: d.enviado_em, dados: JSON.parse(d.dados_json || '{}'),
    };
  });

  const auditoria = db.prepare(
    `SELECT a.*, u.nome AS autor FROM auditoria a LEFT JOIN users u ON u.id = a.autor_id
     WHERE a.entidade = 'documento' AND a.entidade_id IN (SELECT id FROM documentos WHERE jornada_id = ?)
        OR a.entidade = 'jornada' AND a.entidade_id = ?
     ORDER BY a.criado_em DESC LIMIT 50`
  ).all(jornada.id, jornada.id);

  res.json({
    candidato: {
      jornada_id: jornada.id, user_id: jornada.user_id, nome: jornada.nome, email: jornada.email,
      ativo: jornada.ativo, tipo_contrato: jornada.tipo_contrato,
      tipo_contrato_label: TIPOS_CONTRATO[jornada.tipo_contrato] || jornada.tipo_contrato,
      progresso: progressoDaJornada(jornada.id),
    },
    documentos: docs,
    motivos: MOTIVOS,
    auditoria,
  });
});

router.post('/documentos/:id/aprovar', requireRh, (req, res) => {
  const doc = db.prepare(`SELECT * FROM documentos WHERE id = ?`).get(req.params.id);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  db.prepare(`UPDATE documentos SET status = 'aprovado', motivo_devolucao = NULL WHERE id = ?`).run(doc.id);
  auditar(req.session.user.id, 'aprovacao', 'documento', doc.id, doc.status, 'aprovado');
  res.json({ ok: true, status: 'aprovado' });
});

router.post('/documentos/:id/devolver', requireRh, (req, res) => {
  const doc = db.prepare(`SELECT * FROM documentos WHERE id = ?`).get(req.params.id);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });

  const motivos = (req.body?.motivos || []).filter((m) => MOTIVOS[m]);
  const comentario = String(req.body?.comentario || '').slice(0, 500);
  if (motivos.length === 0 && !comentario) {
    return res.status(400).json({ erro: 'Informe ao menos um motivo ou comentário.' });
  }
  const valor = JSON.stringify({ motivos, comentario });
  db.prepare(`UPDATE documentos SET status = 'devolvido', motivo_devolucao = ? WHERE id = ?`).run(valor, doc.id);
  auditar(req.session.user.id, 'devolucao', 'documento', doc.id, doc.status, valor);
  res.json({ ok: true, status: 'devolvido' });
});

router.patch('/candidatos/:id', requireRh, (req, res) => {
  const jornada = db.prepare(`SELECT * FROM jornadas WHERE id = ?`).get(req.params.id);
  if (!jornada) return res.status(404).json({ erro: 'Candidato não encontrado.' });

  const { nome, dados_documento } = req.body || {};
  if (nome) {
    const antigo = db.prepare(`SELECT nome FROM users WHERE id = ?`).get(jornada.user_id).nome;
    db.prepare(`UPDATE users SET nome = ? WHERE id = ?`).run(String(nome).trim(), jornada.user_id);
    auditar(req.session.user.id, 'correcao_inline', 'jornada', jornada.id, antigo, nome);
  }
  if (dados_documento?.id) {
    const doc = db.prepare(`SELECT * FROM documentos WHERE id = ? AND jornada_id = ?`)
      .get(dados_documento.id, jornada.id);
    if (doc) {
      const dados = { ...JSON.parse(doc.dados_json || '{}'), ...(dados_documento.dados || {}) };
      db.prepare(`UPDATE documentos SET dados_json = ? WHERE id = ?`).run(JSON.stringify(dados), doc.id);
      auditar(req.session.user.id, 'correcao_inline', 'documento', doc.id, doc.dados_json, JSON.stringify(dados));
    }
  }
  res.json({ ok: true });
});

export default router;

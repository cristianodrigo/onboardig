import { Router } from 'express';
import { query, auditar, withTransaction } from '../db.js';
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

async function progressoDaJornada(jornadaId) {
  const docs = await query(`SELECT status FROM documentos WHERE jornada_id = $1`, [jornadaId]);
  return {
    enviados: docs.filter((d) => d.status !== 'pendente').length,
    aprovados: docs.filter((d) => d.status === 'aprovado').length,
    devolvidos: docs.filter((d) => d.status === 'devolvido').length,
    total: docs.length,
  };
}

router.get('/candidatos', requireRh, async (req, res) => {
  const busca = `%${(req.query.q || '').toLowerCase()}%`;
  const rows = await query(
    `SELECT u.id AS user_id, u.nome, u.email, u.ativo, j.id AS jornada_id, j.tipo_contrato, j.criado_em
     FROM jornadas j JOIN users u ON u.id = j.user_id
     WHERE lower(u.nome) LIKE $1 OR lower(u.email) LIKE $2
     ORDER BY j.criado_em DESC`,
    [busca, busca]
  );
  const candidatos = [];
  for (const r of rows) {
    candidatos.push({
      ...r,
      tipo_contrato_label: TIPOS_CONTRATO[r.tipo_contrato] || r.tipo_contrato,
      progresso: await progressoDaJornada(r.jornada_id),
    });
  }
  res.json({ candidatos });
});

router.get('/candidatos/:id', requireRh, async (req, res) => {
  const [jornada] = await query(
    `SELECT j.*, u.nome, u.email, u.ativo FROM jornadas j JOIN users u ON u.id = j.user_id WHERE j.id = $1`,
    [req.params.id]
  );
  if (!jornada) return res.status(404).json({ erro: 'Candidato não encontrado.' });

  const docs = (await query(`SELECT * FROM documentos WHERE jornada_id = $1 ORDER BY id`, [jornada.id])).map((d) => {
    const spec = docDoCatalogo(jornada.tipo_contrato, d.tipo) || {};
    return {
      id: d.id, tipo: d.tipo, nome: spec.nome, icone: spec.icone, campos: spec.campos || [],
      status: d.status, motivo_devolucao: d.motivo_devolucao, tem_arquivo: !!d.arquivo_path,
      arquivo_nome: d.arquivo_nome, enviado_em: d.enviado_em, dados: JSON.parse(d.dados_json || '{}'),
    };
  });
  const auditoria = await query(
    `SELECT a.*, u.nome AS autor FROM auditoria a LEFT JOIN users u ON u.id = a.autor_id
     WHERE a.entidade = 'documento' AND a.entidade_id IN (SELECT id FROM documentos WHERE jornada_id = $1)
        OR a.entidade = 'jornada' AND a.entidade_id = $2
     ORDER BY a.criado_em DESC LIMIT 50`,
    [jornada.id, jornada.id]
  );
  res.json({
    candidato: {
      jornada_id: jornada.id, user_id: jornada.user_id, nome: jornada.nome, email: jornada.email,
      ativo: jornada.ativo, tipo_contrato: jornada.tipo_contrato,
      tipo_contrato_label: TIPOS_CONTRATO[jornada.tipo_contrato] || jornada.tipo_contrato,
      progresso: await progressoDaJornada(jornada.id),
    },
    documentos: docs,
    motivos: MOTIVOS,
    auditoria,
  });
});

router.post('/documentos/:id/aprovar', requireRh, async (req, res) => {
  const [doc] = await query(`SELECT * FROM documentos WHERE id = $1`, [req.params.id]);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  await withTransaction(async (client) => {
    await query(`UPDATE documentos SET status = 'aprovado', motivo_devolucao = NULL WHERE id = $1`, [doc.id], client);
    await auditar(req.session.user.id, 'aprovacao', 'documento', doc.id, doc.status, 'aprovado', client);
  });
  res.json({ ok: true, status: 'aprovado' });
});

router.post('/documentos/:id/devolver', requireRh, async (req, res) => {
  const [doc] = await query(`SELECT * FROM documentos WHERE id = $1`, [req.params.id]);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  const motivos = (req.body?.motivos || []).filter((m) => MOTIVOS[m]);
  const comentario = String(req.body?.comentario || '').slice(0, 500);
  if (motivos.length === 0 && !comentario) {
    return res.status(400).json({ erro: 'Informe ao menos um motivo ou comentário.' });
  }
  const valor = JSON.stringify({ motivos, comentario });
  await withTransaction(async (client) => {
    await query(`UPDATE documentos SET status = 'devolvido', motivo_devolucao = $1 WHERE id = $2`, [valor, doc.id], client);
    await auditar(req.session.user.id, 'devolucao', 'documento', doc.id, doc.status, valor, client);
  });
  res.json({ ok: true, status: 'devolvido' });
});

router.patch('/candidatos/:id', requireRh, async (req, res) => {
  const [jornada] = await query(`SELECT * FROM jornadas WHERE id = $1`, [req.params.id]);
  if (!jornada) return res.status(404).json({ erro: 'Candidato não encontrado.' });
  const { nome, dados_documento } = req.body || {};
  await withTransaction(async (client) => {
    if (nome) {
      const [atual] = await query(`SELECT nome FROM users WHERE id = $1`, [jornada.user_id], client);
      await query(`UPDATE users SET nome = $1 WHERE id = $2`, [String(nome).trim(), jornada.user_id], client);
      await auditar(req.session.user.id, 'correcao_inline', 'jornada', jornada.id, atual.nome, nome, client);
    }
    if (dados_documento?.id) {
      const [doc] = await query(
        `SELECT * FROM documentos WHERE id = $1 AND jornada_id = $2`,
        [dados_documento.id, jornada.id],
        client
      );
      if (doc) {
        const dados = { ...JSON.parse(doc.dados_json || '{}'), ...(dados_documento.dados || {}) };
        const json = JSON.stringify(dados);
        await query(`UPDATE documentos SET dados_json = $1 WHERE id = $2`, [json, doc.id], client);
        await auditar(req.session.user.id, 'correcao_inline', 'documento', doc.id, doc.dados_json, json, client);
      }
    }
  });
  res.json({ ok: true });
});

export default router;

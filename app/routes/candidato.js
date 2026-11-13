import { Router } from 'express';
import multer from 'multer';
import { query, auditar, withTransaction } from '../db.js';
import { docDoCatalogo, arquivoObrigatorio, TIPOS_CONTRATO } from '../catalogo.js';
import { requireCandidato, requireAuth } from './auth.js';
import { saveFile, deleteFile, fileExists, sendFile } from '../storage.js';
import { statusDoErro } from '../http-erro.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new Error('Formato inválido. Envie JPG, PNG ou PDF.'), ok);
  },
});

const router = Router();

async function jornadaDoCandidato(userId) {
  const [jornada] = await query(`SELECT * FROM jornadas WHERE user_id = $1`, [userId]);
  return jornada;
}

async function montarChecklist(jornada) {
  const docs = await query(`SELECT * FROM documentos WHERE jornada_id = $1 ORDER BY id`, [jornada.id]);
  return docs.map((d) => {
    const spec = docDoCatalogo(jornada.tipo_contrato, d.tipo) || {};
    return {
      id: d.id, tipo: d.tipo, nome: spec.nome, icone: spec.icone, dica: spec.dica,
      campos: spec.campos || [], arquivo: spec.arquivo || 'sempre',
      condicional_arquivo: spec.condicional_arquivo || null,
      aviso_sus: spec.aviso_sus || null,
      status: d.status, motivo_devolucao: d.motivo_devolucao,
      tem_arquivo: !!d.arquivo_path, enviado_em: d.enviado_em,
      dados: JSON.parse(d.dados_json || '{}'),
    };
  });
}

router.get('/jornada', requireCandidato, async (req, res) => {
  const jornada = await jornadaDoCandidato(req.session.user.id);
  if (!jornada) return res.status(404).json({ erro: 'Jornada não encontrada. Fale com o RH.' });
  const checklist = await montarChecklist(jornada);
  const enviados = checklist.filter((d) => d.status !== 'pendente').length;
  const aprovados = checklist.filter((d) => d.status === 'aprovado').length;
  res.json({
    jornada: {
      tipo_contrato: jornada.tipo_contrato,
      tipo_contrato_label: TIPOS_CONTRATO[jornada.tipo_contrato] || jornada.tipo_contrato,
      prazo_recomendado: jornada.prazo_recomendado,
    },
    checklist,
    progresso: { enviados, aprovados, total: checklist.length },
  });
});

router.post('/documentos/:tipo/upload', requireCandidato, upload.single('arquivo'), async (req, res) => {
  try {
    const jornada = await jornadaDoCandidato(req.session.user.id);
    if (!jornada) return res.status(404).json({ erro: 'Jornada não encontrada.' });

    const [doc] = await query(
      `SELECT * FROM documentos WHERE jornada_id = $1 AND tipo = $2`,
      [jornada.id, req.params.tipo]
    );
    if (!doc) return res.status(404).json({ erro: 'Documento não faz parte do seu checklist.' });

    let dados = {};
    try { dados = req.body.dados ? JSON.parse(req.body.dados) : {}; } catch { dados = {}; }

    const spec = docDoCatalogo(jornada.tipo_contrato, doc.tipo);
    const exigeArquivo = arquivoObrigatorio(spec, dados);
    if (exigeArquivo && !req.file && !doc.arquivo_path) {
      return res.status(400).json({ erro: 'Selecione um arquivo JPG, PNG ou PDF.' });
    }

    let novoPath = doc.arquivo_path;
    let novoNome = doc.arquivo_nome;

    if (req.file) {
      const antigo = doc.arquivo_path;
      novoPath = await saveFile({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        userId: req.session.user.id,
        tipo: doc.tipo,
      });
      novoNome = req.file.originalname;
      if (antigo && antigo !== novoPath) await deleteFile(antigo);
    }

    const dadosJson = JSON.stringify(dados);
    await withTransaction(async (client) => {
      await query(
        `UPDATE documentos SET status = 'em_revisao', arquivo_path = $1, arquivo_nome = $2,
           dados_json = $3, motivo_devolucao = NULL, enviado_em = now() WHERE id = $4`,
        [novoPath, novoNome, dadosJson, doc.id],
        client
      );
      await auditar(
        req.session.user.id,
        req.file ? 'upload' : 'envio_dados',
        'documento',
        doc.id,
        doc.status,
        'em_revisao',
        client
      );
    });
    res.json({ ok: true, status: 'em_revisao' });
  } catch (err) {
    const mapeado = statusDoErro(err);
    if (mapeado && (mapeado.status === 503 || mapeado.status === 500)) {
      console.error(err);
      return res.status(mapeado.status).json({ erro: mapeado.erro });
    }
    console.error('upload falhou:', err);
    res.status(500).json({ erro: 'Falha ao salvar o arquivo. Tente novamente.' });
  }
});

router.patch('/documentos/:id/dados', requireCandidato, async (req, res) => {
  const jornada = await jornadaDoCandidato(req.session.user.id);
  const [doc] = await query(
    `SELECT * FROM documentos WHERE id = $1 AND jornada_id = $2`,
    [req.params.id, jornada?.id || -1]
  );
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });

  const dados = { ...JSON.parse(doc.dados_json || '{}'), ...(req.body?.dados || {}) };
  const json = JSON.stringify(dados);
  await withTransaction(async (client) => {
    await query(`UPDATE documentos SET dados_json = $1 WHERE id = $2`, [json, doc.id], client);
    await auditar(req.session.user.id, 'edicao_dados', 'documento', doc.id, doc.dados_json, json, client);
  });
  res.json({ ok: true, dados });
});

router.get('/documentos/:id/arquivo', requireAuth, async (req, res) => {
  try {
    const [doc] = await query(
      `SELECT d.*, j.user_id FROM documentos d JOIN jornadas j ON j.id = d.jornada_id WHERE d.id = $1`,
      [req.params.id]
    );
    if (!doc?.arquivo_path || !(await fileExists(doc.arquivo_path))) {
      return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    }
    const ehDono = doc.user_id === req.session.user.id;
    const ehRh = req.session.user.papel === 'rh';
    if (!ehDono && !ehRh) return res.status(403).json({ erro: 'Sem acesso a este arquivo.' });

    await auditar(req.session.user.id, ehRh && !ehDono ? 'visualizacao' : 'download', 'documento', doc.id);
    const inline = req.query.inline === '1' || req.query.inline === 'true';
    await sendFile(res, doc.arquivo_path, doc.arquivo_nome || 'documento', { inline });
  } catch (err) {
    const mapeado = statusDoErro(err);
    if (mapeado && (mapeado.status === 503 || mapeado.status === 500)) {
      console.error(err);
      return res.status(mapeado.status).json({ erro: mapeado.erro });
    }
    console.error('download falhou:', err);
    if (!res.headersSent) res.status(500).json({ erro: 'Falha ao baixar o arquivo.' });
  }
});

export default router;

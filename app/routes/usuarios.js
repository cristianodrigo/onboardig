import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, auditar, criarJornadaComChecklist, gerarConvite, withTransaction } from '../db.js';
import { requireRh } from './auth.js';
import { enviarConvite, mailConfigurado, publicBase } from '../mail.js';

const router = Router();
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const linkConvite = (req, token) => `${publicBase(req)}/convite.html?token=${token}`;

async function tentarEnviarConvite({ req, user, link }) {
  if (!mailConfigurado()) {
    return { email_enviado: false, email_erro: 'Envio de e-mail não configurado no servidor.' };
  }
  try {
    await enviarConvite({ para: user.email, nome: user.nome, link });
    await auditar(req.session.user.id, 'enviar_convite_email', 'user', user.id, null, user.email);
    return { email_enviado: true };
  } catch (err) {
    console.error('Falha ao enviar convite:', err.message);
    return { email_enviado: false, email_erro: err.message || 'Não foi possível enviar o e-mail.' };
  }
}

router.get('/usuarios', requireRh, async (req, res) => {
  const busca = `%${(req.query.q || '').toLowerCase()}%`;
  const usuarios = await query(
    `SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.criado_em, u.cpf,
            (SELECT j.id FROM jornadas j WHERE j.user_id = u.id) AS jornada_id,
            (SELECT CASE
               WHEN COUNT(*) FILTER (WHERE c.expira_em > now()) > 0
               THEN 'ativo' ELSE 'nenhum' END
             FROM convites c WHERE c.user_id = u.id AND c.revogado = false AND c.usado_em IS NULL) AS convite_status
     FROM users u
     WHERE lower(u.nome) LIKE $1 OR lower(u.email) LIKE $2
     ORDER BY u.papel, u.nome`,
    [busca, busca]
  );
  res.json({ usuarios });
});

router.post('/usuarios', requireRh, async (req, res) => {
  const { nome, email, senha, papel, cpf, tipo_contrato, enviar_email } = req.body || {};
  if (!nome?.trim() || !email || !['candidato', 'rh'].includes(papel)) {
    return res.status(400).json({ erro: 'Informe nome, e-mail e papel (candidato ou rh).' });
  }
  const contrato = ['CLT', 'ESTAGIO', 'PJ'].includes(tipo_contrato) ? tipo_contrato : 'CLT';
  if (papel === 'rh' && !senha) return res.status(400).json({ erro: 'Usuários do RH precisam de senha.' });
  if (!emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
  if (senha && String(senha).length < 6) return res.status(400).json({ erro: 'Senha deve ter ao menos 6 caracteres.' });

  const emailNorm = String(email).toLowerCase().trim();
  const [existente] = await query(`SELECT id FROM users WHERE email = $1`, [emailNorm]);
  if (existente) return res.status(409).json({ erro: 'Já existe usuário com este e-mail.' });

  const segredo = senha ? String(senha) : crypto.randomBytes(32).toString('hex');
  const hash = bcrypt.hashSync(segredo, 10);
  const cpfLimpo = cpf ? String(cpf).replace(/\D/g, '') : null;

  const criado = await withTransaction(async (client) => {
    const [user] = await query(
      `INSERT INTO users (nome, email, senha_hash, papel, cpf) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [nome.trim(), emailNorm, hash, papel, cpfLimpo],
      client
    );
    const userId = Number(user.id);
    let jornadaId = null;
    let link = null;
    if (papel === 'candidato') {
      jornadaId = await criarJornadaComChecklist(userId, contrato, client);
      await auditar(req.session.user.id, 'criar_jornada', 'jornada', jornadaId, null, contrato, client);
      if (!senha) {
        link = linkConvite(req, await gerarConvite(userId, 7, client));
        await auditar(req.session.user.id, 'gerar_convite', 'user', userId, null, '7 dias', client);
      }
    }
    await auditar(req.session.user.id, 'criar_usuario', 'user', userId, null, papel, client);
    return { userId, jornadaId, link };
  });

  let emailStatus = {};
  if (criado.link && enviar_email !== false) {
    emailStatus = await tentarEnviarConvite({
      req,
      user: { id: criado.userId, nome: nome.trim(), email: emailNorm },
      link: criado.link,
    });
  }
  res.status(201).json({
    ok: true, id: criado.userId, jornada_id: criado.jornadaId, link: criado.link, ...emailStatus,
  });
});

router.post('/usuarios/:id/convite', requireRh, async (req, res) => {
  const [user] = await query(`SELECT * FROM users WHERE id = $1`, [req.params.id]);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (user.papel !== 'candidato') return res.status(400).json({ erro: 'Convite é só para candidatos.' });

  const renovar = req.body?.renovar !== false;
  let link;
  if (renovar) {
    link = linkConvite(req, await gerarConvite(user.id));
    await auditar(req.session.user.id, 'renovar_convite', 'user', user.id, null, '7 dias');
  } else {
    const [vigente] = await query(
      `SELECT token FROM convites WHERE user_id = $1 AND revogado = false AND usado_em IS NULL
         AND expira_em > now() ORDER BY id DESC LIMIT 1`,
      [user.id]
    );
    if (!vigente) return res.status(400).json({ erro: 'Não há link ativo. Gere um novo convite.' });
    link = linkConvite(req, vigente.token);
  }
  const emailStatus = req.body?.enviar_email
    ? await tentarEnviarConvite({ req, user, link })
    : {};
  res.json({ ok: true, link, ...emailStatus });
});

router.patch('/usuarios/:id', requireRh, async (req, res) => {
  const [user] = await query(`SELECT * FROM users WHERE id = $1`, [req.params.id]);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const { nome, email, senha, ativo, cpf } = req.body || {};

  if (email !== undefined) {
    const emailNorm = String(email).toLowerCase().trim();
    if (!emailValido(emailNorm)) return res.status(400).json({ erro: 'E-mail inválido.' });
    const [conflito] = await query(`SELECT id FROM users WHERE email = $1 AND id != $2`, [emailNorm, user.id]);
    if (conflito) return res.status(409).json({ erro: 'E-mail já usado por outro usuário.' });
  }
  if (senha && String(senha).length < 6) return res.status(400).json({ erro: 'Senha deve ter ao menos 6 caracteres.' });
  if (ativo !== undefined && user.id === req.session.user.id && !ativo) {
    return res.status(400).json({ erro: 'Você não pode desativar a si mesmo.' });
  }

  await withTransaction(async (client) => {
    if (cpf !== undefined) {
      const novo = cpf ? String(cpf).replace(/\D/g, '') : null;
      await query(`UPDATE users SET cpf = $1 WHERE id = $2`, [novo, user.id], client);
      await auditar(req.session.user.id, 'editar_usuario', 'user', user.id, user.cpf, cpf, client);
    }
    if (nome !== undefined) {
      await query(`UPDATE users SET nome = $1 WHERE id = $2`, [String(nome).trim(), user.id], client);
      await auditar(req.session.user.id, 'editar_usuario', 'user', user.id, user.nome, nome, client);
    }
    if (email !== undefined) {
      const emailNorm = String(email).toLowerCase().trim();
      await query(`UPDATE users SET email = $1 WHERE id = $2`, [emailNorm, user.id], client);
      await auditar(req.session.user.id, 'editar_usuario', 'user', user.id, user.email, emailNorm, client);
    }
    if (senha) {
      await query(`UPDATE users SET senha_hash = $1 WHERE id = $2`, [bcrypt.hashSync(String(senha), 10), user.id], client);
      await auditar(req.session.user.id, 'resetar_senha', 'user', user.id, null, null, client);
    }
    if (ativo !== undefined) {
      await query(`UPDATE users SET ativo = $1 WHERE id = $2`, [Boolean(ativo), user.id], client);
      await auditar(req.session.user.id, ativo ? 'ativar_usuario' : 'desativar_usuario', 'user', user.id, user.ativo, Boolean(ativo), client);
    }
  });

  const [atualizado] = await query(`SELECT id, nome, email, papel, ativo FROM users WHERE id = $1`, [user.id]);
  res.json({ ok: true, usuario: atualizado });
});

export default router;

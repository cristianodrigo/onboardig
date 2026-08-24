import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, auditar, criarJornadaComChecklist, gerarConvite } from '../db.js';
import { requireRh } from './auth.js';

const router = Router();

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const linkConvite = (req, token) => `${req.protocol}://${req.get('host')}/convite.html?token=${token}`;

router.get('/usuarios', requireRh, (req, res) => {
  const busca = `%${(req.query.q || '').toLowerCase()}%`;
  const usuarios = db.prepare(
    `SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.criado_em, u.cpf,
            (SELECT j.id FROM jornadas j WHERE j.user_id = u.id) AS jornada_id,
            (SELECT CASE
               WHEN COUNT(*) FILTER (WHERE datetime(c.expira_em) > datetime('now')) > 0
               THEN 'ativo' ELSE 'nenhum' END
             FROM convites c WHERE c.user_id = u.id AND c.revogado = 0 AND c.usado_em IS NULL) AS convite_status
     FROM users u
     WHERE lower(u.nome) LIKE ? OR lower(u.email) LIKE ?
     ORDER BY u.papel, u.nome`
  ).all(busca, busca);
  res.json({ usuarios });
});

router.post('/usuarios', requireRh, (req, res) => {
  const { nome, email, senha, papel, cpf, tipo_contrato } = req.body || {};
  if (!nome?.trim() || !email || !['candidato', 'rh'].includes(papel)) {
    return res.status(400).json({ erro: 'Informe nome, e-mail e papel (candidato ou rh).' });
  }
  const contrato = ['CLT', 'ESTAGIO', 'PJ'].includes(tipo_contrato) ? tipo_contrato : 'CLT';
  if (papel === 'rh' && !senha) {
    return res.status(400).json({ erro: 'Usuários do RH precisam de senha.' });
  }
  if (!emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
  if (senha && String(senha).length < 6) return res.status(400).json({ erro: 'Senha deve ter ao menos 6 caracteres.' });

  const emailNorm = String(email).toLowerCase().trim();
  if (db.prepare(`SELECT id FROM users WHERE email = ?`).get(emailNorm)) {
    return res.status(409).json({ erro: 'Já existe usuário com este e-mail.' });
  }

  // candidato sem senha: acesso só pelo link de convite (hash inatingível)
  const segredo = senha ? String(senha) : crypto.randomBytes(32).toString('hex');
  const hash = bcrypt.hashSync(segredo, 10);
  const cpfLimpo = cpf ? String(cpf).replace(/\D/g, '') : null;

  const { lastInsertRowid: userId } = db.prepare(
    `INSERT INTO users (nome, email, senha_hash, papel, cpf) VALUES (?, ?, ?, ?, ?)`
  ).run(nome.trim(), emailNorm, hash, papel, cpfLimpo);

  let jornadaId = null;
  let link = null;
  if (papel === 'candidato') {
    jornadaId = criarJornadaComChecklist(userId, contrato);
    auditar(req.session.user.id, 'criar_jornada', 'jornada', jornadaId, null, contrato);
    if (!senha) {
      link = linkConvite(req, gerarConvite(userId));
      auditar(req.session.user.id, 'gerar_convite', 'user', userId, null, '7 dias');
    }
  }
  auditar(req.session.user.id, 'criar_usuario', 'user', userId, null, papel);
  res.status(201).json({ ok: true, id: userId, jornada_id: jornadaId, link });
});

router.post('/usuarios/:id/convite', requireRh, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (user.papel !== 'candidato') return res.status(400).json({ erro: 'Convite é só para candidatos.' });

  const link = linkConvite(req, gerarConvite(user.id));
  auditar(req.session.user.id, 'renovar_convite', 'user', user.id, null, '7 dias');
  res.json({ ok: true, link });
});

router.patch('/usuarios/:id', requireRh, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado.' });

  const { nome, email, senha, ativo, cpf } = req.body || {};

  if (cpf !== undefined) {
    db.prepare(`UPDATE users SET cpf = ? WHERE id = ?`).run(cpf ? String(cpf).replace(/\D/g, '') : null, user.id);
    auditar(req.session.user.id, 'editar_usuario', 'user', user.id, user.cpf, cpf);
  }
  if (nome !== undefined) {
    db.prepare(`UPDATE users SET nome = ? WHERE id = ?`).run(String(nome).trim(), user.id);
    auditar(req.session.user.id, 'editar_usuario', 'user', user.id, user.nome, nome);
  }
  if (email !== undefined) {
    const emailNorm = String(email).toLowerCase().trim();
    if (!emailValido(emailNorm)) return res.status(400).json({ erro: 'E-mail inválido.' });
    const conflito = db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).get(emailNorm, user.id);
    if (conflito) return res.status(409).json({ erro: 'E-mail já usado por outro usuário.' });
    db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(emailNorm, user.id);
    auditar(req.session.user.id, 'editar_usuario', 'user', user.id, user.email, emailNorm);
  }
  if (senha) {
    if (String(senha).length < 6) return res.status(400).json({ erro: 'Senha deve ter ao menos 6 caracteres.' });
    db.prepare(`UPDATE users SET senha_hash = ? WHERE id = ?`).run(bcrypt.hashSync(String(senha), 10), user.id);
    auditar(req.session.user.id, 'resetar_senha', 'user', user.id);
  }
  if (ativo !== undefined) {
    if (user.id === req.session.user.id && !ativo) {
      return res.status(400).json({ erro: 'Você não pode desativar a si mesmo.' });
    }
    db.prepare(`UPDATE users SET ativo = ? WHERE id = ?`).run(ativo ? 1 : 0, user.id);
    auditar(req.session.user.id, ativo ? 'ativar_usuario' : 'desativar_usuario', 'user', user.id, user.ativo, ativo ? 1 : 0);
  }

  const atualizado = db.prepare(`SELECT id, nome, email, papel, ativo FROM users WHERE id = ?`).get(user.id);
  res.json({ ok: true, usuario: atualizado });
});

export default router;

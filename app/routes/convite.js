import { Router } from 'express';
import { db, auditar } from '../db.js';

const router = Router();

const apenasDigitos = (s) => String(s || '').replace(/\D/g, '');

function conviteValido(token) {
  return db.prepare(
    `SELECT c.*, u.nome, u.email, u.cpf, u.ativo, u.papel
     FROM convites c JOIN users u ON u.id = c.user_id
     WHERE c.token = ? AND c.revogado = 0 AND c.usado_em IS NULL
       AND datetime(c.expira_em) > datetime('now')`
  ).get(token);
}

router.get('/convite/:token', (req, res) => {
  const c = conviteValido(req.params.token);
  if (!c || !c.ativo || c.papel !== 'candidato') {
    return res.status(410).json({ erro: 'Link expirado ou já utilizado. Peça um novo link ao RH.' });
  }
  res.json({ nome: c.nome.split(' ')[0], pede_cpf: !!c.cpf });
});

router.post('/convite', (req, res) => {
  const { token, cpf } = req.body || {};
  const c = conviteValido(String(token || ''));
  if (!c || !c.ativo || c.papel !== 'candidato') {
    return res.status(410).json({ erro: 'Link expirado ou já utilizado. Peça um novo link ao RH.' });
  }
  if (c.cpf && apenasDigitos(cpf) !== apenasDigitos(c.cpf)) {
    return res.status(401).json({ erro: 'CPF não confere com o cadastro. Confira os números.' });
  }

  db.prepare(`UPDATE convites SET usado_em = datetime('now') WHERE id = ?`).run(c.id);
  req.session.user = { id: c.user_id, nome: c.nome, email: c.email, papel: 'candidato' };
  req.session.cookie.maxAge = 7 * 24 * 3600000; // candidato entra pelo link por até 7 dias
  auditar(c.user_id, 'acesso_convite', 'user', c.user_id);
  res.json({ usuario: req.session.user });
});

export default router;

import { Router } from 'express';
import { query, auditar, withTransaction } from '../db.js';

const router = Router();
const apenasDigitos = (s) => String(s || '').replace(/\D/g, '');

async function conviteValido(token) {
  const [row] = await query(
    `SELECT c.*, u.nome, u.email, u.cpf, u.ativo, u.papel
     FROM convites c JOIN users u ON u.id = c.user_id
     WHERE c.token = $1 AND c.revogado = false AND c.usado_em IS NULL
       AND c.expira_em > now()`,
    [token]
  );
  return row;
}

router.get('/convite/:token', async (req, res) => {
  const c = await conviteValido(req.params.token);
  if (!c || !c.ativo || c.papel !== 'candidato') {
    return res.status(410).json({ erro: 'Link expirado ou já utilizado. Peça um novo link ao RH.' });
  }
  res.json({ nome: c.nome.split(' ')[0], pede_cpf: !!c.cpf });
});

router.post('/convite', async (req, res) => {
  const { token, cpf } = req.body || {};
  const c = await conviteValido(String(token || ''));
  if (!c || !c.ativo || c.papel !== 'candidato') {
    return res.status(410).json({ erro: 'Link expirado ou já utilizado. Peça um novo link ao RH.' });
  }
  if (c.cpf && apenasDigitos(cpf) !== apenasDigitos(c.cpf)) {
    return res.status(401).json({ erro: 'CPF não confere com o cadastro. Confira os números.' });
  }

  const marcado = await withTransaction(async (client) => {
    const rows = await query(
      `UPDATE convites SET usado_em = now()
       WHERE id = $1 AND revogado = false AND usado_em IS NULL AND expira_em > now()
       RETURNING id`,
      [c.id],
      client
    );
    if (rows.length === 0) return false;
    await auditar(c.user_id, 'acesso_convite', 'user', c.user_id, null, null, client);
    return true;
  });
  if (!marcado) {
    return res.status(410).json({ erro: 'Link expirado ou já utilizado. Peça um novo link ao RH.' });
  }
  req.session.user = { id: c.user_id, nome: c.nome, email: c.email, papel: 'candidato' };
  req.session.cookie.maxAge = 7 * 24 * 3600000;
  res.json({ usuario: req.session.user });
});

export default router;

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, auditar } from '../db.js';

const router = Router();

export function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ erro: 'Não autenticado.' });
  next();
}

export function requireRh(req, res, next) {
  if (!req.session.user) return res.status(401).json({ erro: 'Não autenticado.' });
  if (req.session.user.papel !== 'rh') return res.status(403).json({ erro: 'Acesso restrito ao RH.' });
  next();
}

export function requireCandidato(req, res, next) {
  if (!req.session.user) return res.status(401).json({ erro: 'Não autenticado.' });
  if (req.session.user.papel !== 'candidato') return res.status(403).json({ erro: 'Acesso restrito ao candidato.' });
  next();
}

router.post('/login', (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(senha, user.senha_hash)) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }
  if (!user.ativo) return res.status(403).json({ erro: 'Usuário desativado. Fale com o RH.' });

  req.session.user = { id: user.id, nome: user.nome, email: user.email, papel: user.papel };
  auditar(user.id, 'login', 'user', user.id);
  res.json({ usuario: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ usuario: req.session.user || null });
});

export default router;

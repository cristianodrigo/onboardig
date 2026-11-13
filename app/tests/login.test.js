import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { preparar, limpar } from './banco.js';

test('login do RH devolve o usuário', async () => {
  await preparar('onboarding_login_test');
  process.env.SEED_RH_EMAIL = 'rh@teste.local';
  process.env.SEED_RH_PASSWORD = 'senha-teste';
  process.env.SEED_RH_NOME = 'RH Teste';
  const { initSchema, seed, query, closePool } = await import('../db.js');
  const { default: authRoutes } = await import('../routes/auth.js');
  await initSchema();
  await limpar(query);
  await seed();

  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'teste', resave: false, saveUninitialized: false }));
  app.use('/api', authRoutes);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rh@teste.local', senha: 'senha-teste' }),
    });
    assert.equal(res.status, 200);
    const corpo = await res.json();
    assert.equal(corpo.usuario.email, 'rh@teste.local');
    assert.equal(corpo.usuario.papel, 'rh');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  }
});

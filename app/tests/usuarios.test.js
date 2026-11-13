import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { preparar, limpar } from './banco.js';

test('cria candidato uma vez e recusa e-mail repetido', async () => {
  await preparar('onboarding_usuarios_test');
  process.env.SEED_RH_EMAIL = 'rh@teste.local';
  process.env.SEED_RH_PASSWORD = 'senha-teste';
  process.env.SEED_RH_NOME = 'RH Teste';
  const { initSchema, seed, query, closePool, CATALOGO } = await import('../db.js');
  const { default: usuariosRoutes } = await import('../routes/usuarios.js');
  await initSchema();
  await limpar(query);
  await seed();
  const [rh] = await query(`SELECT id FROM users WHERE email = $1`, ['rh@teste.local']);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: { id: rh.id, papel: 'rh', nome: 'RH Teste', email: 'rh@teste.local' } };
    next();
  });
  app.use('/api', usuariosRoutes);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const postar = (corpo) => fetch(`http://127.0.0.1:${port}/api/usuarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  try {
    const res = await postar({ nome: 'Ana', email: 'ana@exemplo.com', papel: 'candidato', tipo_contrato: 'CLT' });
    assert.equal(res.status, 201);
    const corpo = await res.json();
    assert.ok(corpo.id);
    assert.match(corpo.link, /token=/);
    const [jornada] = await query(`SELECT id FROM jornadas WHERE user_id = $1`, [corpo.id]);
    const docs = await query(`SELECT id FROM documentos WHERE jornada_id = $1`, [jornada.id]);
    assert.equal(docs.length, CATALOGO.CLT.length);
    const convites = await query(
      `SELECT id FROM convites WHERE user_id = $1 AND revogado = false AND expira_em > now()`,
      [corpo.id]
    );
    assert.equal(convites.length, 1);

    const deNovo = await postar({ nome: 'Ana', email: 'ana@exemplo.com', papel: 'candidato' });
    assert.equal(deNovo.status, 409);
    const erro = await deNovo.json();
    assert.equal(erro.erro, 'Já existe usuário com este e-mail.');
    const [{ n }] = await query(`SELECT COUNT(*)::int AS n FROM users`);
    assert.equal(n, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  }
});

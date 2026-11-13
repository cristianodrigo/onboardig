import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { preparar, limpar } from './banco.js';

test('aprovar documento grava status e auditoria', async () => {
  await preparar('onboarding_revisao_test');
  process.env.SEED_RH_EMAIL = 'rh@teste.local';
  process.env.SEED_RH_PASSWORD = 'senha-teste';
  process.env.SEED_RH_NOME = 'RH Teste';
  const { initSchema, seed, query, closePool, criarJornadaComChecklist } = await import('../db.js');
  const { default: rhRoutes } = await import('../routes/rh.js');
  await initSchema();
  await limpar(query);
  await seed();
  const [rh] = await query(`SELECT id FROM users WHERE email = $1`, ['rh@teste.local']);
  const [candidato] = await query(
    `INSERT INTO users (nome, email, senha_hash, papel) VALUES ('Ana', 'ana-revisao@exemplo.com', 'hash', 'candidato') RETURNING id`
  );
  await criarJornadaComChecklist(candidato.id, 'CLT');
  const [doc] = await query(
    `SELECT d.id FROM documentos d JOIN jornadas j ON j.id = d.jornada_id WHERE j.user_id = $1 ORDER BY d.id LIMIT 1`,
    [candidato.id]
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: { id: rh.id, papel: 'rh', nome: 'RH Teste', email: 'rh@teste.local' } };
    next();
  });
  app.use('/api', rhRoutes);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/documentos/${doc.id}/aprovar`, { method: 'POST' });
    assert.equal(res.status, 200);
    const [gravado] = await query(`SELECT status FROM documentos WHERE id = $1`, [doc.id]);
    assert.equal(gravado.status, 'aprovado');
    const trilha = await query(
      `SELECT id FROM auditoria WHERE acao = 'aprovacao' AND entidade = 'documento' AND entidade_id = $1`,
      [doc.id]
    );
    assert.equal(trilha.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  }
});

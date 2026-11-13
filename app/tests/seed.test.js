import test from 'node:test';
import assert from 'node:assert/strict';
import { preparar, limpar } from './banco.js';

test('seed cria um RH e a segunda chamada não duplica', async () => {
  await preparar('onboarding_seed_test');
  process.env.SEED_RH_EMAIL = 'rh@teste.local';
  process.env.SEED_RH_PASSWORD = 'senha-teste';
  process.env.SEED_RH_NOME = 'RH Teste';
  const { initSchema, seed, query, closePool } = await import('../db.js');
  await initSchema();
  await limpar(query);
  await seed();
  await seed();
  const rows = await query(`SELECT email, papel, ativo FROM users ORDER BY id`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'rh@teste.local');
  assert.equal(rows[0].papel, 'rh');
  assert.equal(rows[0].ativo, true);
  await closePool();
});

test('banco vazio sem variáveis de seed não cria usuário', async () => {
  await preparar('onboarding_seed_test');
  delete process.env.SEED_RH_EMAIL;
  delete process.env.SEED_RH_PASSWORD;
  const { initSchema, seed, query, closePool } = await import('../db.js');
  await initSchema();
  await limpar(query);
  await seed();
  const rows = await query(`SELECT id FROM users`);
  assert.equal(rows.length, 0);
  await closePool();
});

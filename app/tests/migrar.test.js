import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { preparar } from './banco.js';

function sqliteComUmaLinha(arquivo) {
  const db = new DatabaseSync(arquivo);
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, nome TEXT, email TEXT, senha_hash TEXT, papel TEXT,
      ativo INTEGER, criado_em TEXT, cpf TEXT
    );
    CREATE TABLE jornadas (
      id INTEGER PRIMARY KEY, user_id INTEGER, tipo_contrato TEXT,
      prazo_recomendado TEXT, criado_em TEXT
    );
    CREATE TABLE documentos (
      id INTEGER PRIMARY KEY, jornada_id INTEGER, tipo TEXT, status TEXT,
      arquivo_path TEXT, arquivo_nome TEXT, dados_json TEXT,
      motivo_devolucao TEXT, enviado_em TEXT
    );
    CREATE TABLE convites (
      id INTEGER PRIMARY KEY, token TEXT, user_id INTEGER, criado_em TEXT,
      expira_em TEXT, usado_em TEXT, revogado INTEGER
    );
    CREATE TABLE auditoria (
      id INTEGER PRIMARY KEY, autor_id INTEGER, acao TEXT, entidade TEXT,
      entidade_id INTEGER, valor_antigo TEXT, valor_novo TEXT, criado_em TEXT
    );
  `);
  db.prepare(`INSERT INTO users (id, nome, email, senha_hash, papel, ativo, criado_em, cpf)
    VALUES (4, 'Ana', 'ana@exemplo.com', 'hash', 'candidato', 1, '2026-01-02 03:04:05', '123')`).run();
  db.prepare(`INSERT INTO jornadas (id, user_id, tipo_contrato, prazo_recomendado, criado_em)
    VALUES (8, 4, 'CLT', '2026-01-10', '2026-01-02 03:04:05')`).run();
  db.prepare(`INSERT INTO documentos (id, jornada_id, tipo, status, dados_json, enviado_em)
    VALUES (15, 8, 'rg', 'pendente', '{}', NULL)`).run();
  db.prepare(`INSERT INTO convites (id, token, user_id, criado_em, expira_em, usado_em, revogado)
    VALUES (3, 'tok-3', 4, '2026-01-02 03:04:05', '2026-01-09 03:04:05', NULL, 0)`).run();
  db.prepare(`INSERT INTO auditoria (id, autor_id, acao, entidade, entidade_id, valor_antigo, valor_novo, criado_em)
    VALUES (9, NULL, 'seed', 'user', 4, NULL, 'rh inicial', '2026-01-02 03:04:05')`).run();
  db.close();
}

test('cópia preserva ids e a segunda execução não altera o destino', async () => {
  await preparar('onboarding_migrar_test');
  const arquivo = path.join(os.tmpdir(), `onboardig-copia-${Date.now()}.db`);
  sqliteComUmaLinha(arquivo);
  const { migrar } = await import('../scripts/migrar-sqlite.mjs');
  await migrar({ sqlitePath: arquivo, databaseUrl: process.env.DATABASE_URL });
  const { query, closePool } = await import('../db.js');
  const [user] = await query(`SELECT id, email, ativo FROM users`);
  const [jornada] = await query(`SELECT id, user_id FROM jornadas`);
  const [doc] = await query(`SELECT id, jornada_id FROM documentos`);
  const [convite] = await query(`SELECT id, revogado FROM convites`);
  const [aud] = await query(`SELECT id, autor_id FROM auditoria`);
  assert.deepEqual(
    [user.id, user.email, user.ativo, jornada.id, jornada.user_id, doc.id, doc.jornada_id, convite.id, convite.revogado, aud.id, aud.autor_id],
    [4, 'ana@exemplo.com', true, 8, 4, 15, 8, 3, false, 9, null]
  );
  await assert.rejects(
    () => migrar({ sqlitePath: arquivo, databaseUrl: process.env.DATABASE_URL }),
    /Postgres já tem dados/
  );
  const depois = await query(`SELECT COUNT(*)::int AS n FROM users`);
  assert.equal(depois[0].n, 1);
  await closePool();
  fs.rmSync(arquivo, { force: true });
});

test('arquivo SQLite ausente não grava', async () => {
  await preparar('onboarding_migrar_test');
  const { migrar } = await import('../scripts/migrar-sqlite.mjs');
  const { initSchema, query, closePool } = await import('../db.js');
  await initSchema();
  await query(`TRUNCATE auditoria, convites, documentos, jornadas, users RESTART IDENTITY CASCADE`);
  await assert.rejects(
    () => migrar({ sqlitePath: path.join(os.tmpdir(), 'nao-existe-onboardig.db'), databaseUrl: process.env.DATABASE_URL }),
    /Arquivo SQLite não encontrado/
  );
  const rows = await query(`SELECT COUNT(*)::int AS n FROM users`);
  assert.equal(rows[0].n, 0);
  await closePool();
});

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { CATALOGO, TIPOS_CONTRATO } from './catalogo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'onboardig.db');

export const db = new DatabaseSync(dbPath);

export { CATALOGO, TIPOS_CONTRATO };

export function initSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      papel TEXT NOT NULL CHECK (papel IN ('candidato','rh')),
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jornadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      tipo_contrato TEXT NOT NULL DEFAULT 'CLT',
      prazo_recomendado TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jornada_id INTEGER NOT NULL REFERENCES jornadas(id),
      tipo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente','em_revisao','devolvido','aprovado')),
      arquivo_path TEXT,
      arquivo_nome TEXT,
      dados_json TEXT NOT NULL DEFAULT '{}',
      motivo_devolucao TEXT,
      enviado_em TEXT,
      UNIQUE (jornada_id, tipo)
    );

    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      autor_id INTEGER REFERENCES users(id),
      acao TEXT NOT NULL,
      entidade TEXT NOT NULL,
      entidade_id INTEGER NOT NULL,
      valor_antigo TEXT,
      valor_novo TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS convites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      expira_em TEXT NOT NULL,
      usado_em TEXT,
      revogado INTEGER NOT NULL DEFAULT 0
    );
  `);

  // migração leve: coluna cpf em users (segundo fator do link de convite)
  try { db.exec(`ALTER TABLE users ADD COLUMN cpf TEXT`); } catch { /* já existe */ }
}

export function auditar(autorId, acao, entidade, entidadeId, valorAntigo = null, valorNovo = null) {
  db.prepare(
    `INSERT INTO auditoria (autor_id, acao, entidade, entidade_id, valor_antigo, valor_novo)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(autorId, acao, entidade, entidadeId,
    valorAntigo == null ? null : String(valorAntigo),
    valorNovo == null ? null : String(valorNovo));
}

export function gerarConvite(userId, diasValidade = 7) {
  db.prepare(`UPDATE convites SET revogado = 1 WHERE user_id = ? AND usado_em IS NULL`).run(userId);
  const token = crypto.randomBytes(24).toString('base64url');
  db.prepare(
    `INSERT INTO convites (token, user_id, expira_em) VALUES (?, ?, datetime('now', ?))`
  ).run(token, userId, `+${diasValidade} days`);
  return token;
}

export function criarJornadaComChecklist(userId, tipoContrato = 'CLT') {
  const contrato = CATALOGO[tipoContrato] ? tipoContrato : 'CLT';
  const prazo = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const { lastInsertRowid: jornadaId } = db.prepare(
    `INSERT INTO jornadas (user_id, tipo_contrato, prazo_recomendado) VALUES (?, ?, ?)`
  ).run(userId, contrato, prazo);
  const insDoc = db.prepare(`INSERT INTO documentos (jornada_id, tipo) VALUES (?, ?)`);
  for (const d of CATALOGO[contrato]) insDoc.run(jornadaId, d.tipo);
  return jornadaId;
}

function seed() {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n;
  if (count > 0) return;

  const email = process.env.SEED_RH_EMAIL?.toLowerCase().trim();
  const senha = process.env.SEED_RH_PASSWORD;
  const nome = process.env.SEED_RH_NOME?.trim() || 'RH';

  if (!email || !senha) {
    console.warn('Banco vazio: defina SEED_RH_EMAIL e SEED_RH_PASSWORD para criar o primeiro usuário RH.');
    return;
  }

  const { lastInsertRowid: rhId } = db.prepare(
    `INSERT INTO users (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)`
  ).run(nome, email, bcrypt.hashSync(senha, 10), 'rh');
  auditar(null, 'seed', 'user', rhId, null, 'rh inicial');
  console.log(`Seed concluído: usuário RH ${email}`);
}

initSchema();
seed();

if (process.argv.includes('--reseed')) {
  console.log('Banco já inicializado em', dbPath);
}

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

  const hash = (s) => bcrypt.hashSync(s, 10);
  const insUser = db.prepare(
    `INSERT INTO users (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)`);

  const rhId = insUser.run('Renata Lima', 'renata@empresa.com', hash('admin123'), 'rh').lastInsertRowid;
  auditar(null, 'seed', 'user', rhId, null, 'rh criado');

  const marinaId = insUser.run('Marina Souza dos Santos', 'marina@exemplo.com', hash('senha123'), 'candidato').lastInsertRowid;
  const joaoId = insUser.run('João Pedro Alves', 'joao@exemplo.com', hash('senha123'), 'candidato').lastInsertRowid;
  const carlaId = insUser.run('Carla Nunes', 'carla@exemplo.com', hash('senha123'), 'candidato').lastInsertRowid;

  const jMarina = criarJornadaComChecklist(marinaId);
  const jJoao = criarJornadaComChecklist(joaoId);
  const jCarla = criarJornadaComChecklist(carlaId);

  const setDoc = db.prepare(
    `UPDATE documentos SET status = ?, dados_json = ?, motivo_devolucao = ?, enviado_em = datetime('now', ?)
     WHERE jornada_id = ? AND tipo = ?`);

  // Marina: 5/6 — RG em revisão, CPF aprovado, comprovante devolvido, dados bancários aprovados
  setDoc.run('em_revisao', JSON.stringify({ numero: '12.345.678-9', nome: 'Marina S. Santos' }), null, '-1 day', jMarina, 'rg');
  setDoc.run('aprovado', JSON.stringify({ numero: '123.456.789-00' }), null, '-1 day', jMarina, 'cpf');
  setDoc.run('devolvido', JSON.stringify({ titular: 'Ana Souza dos Santos', terceiro: true }), 'foto_escura, numero_coberto', '-2 days', jMarina, 'comprovante');
  setDoc.run('aprovado', JSON.stringify({ agencia: '0001', conta: '12345-6' }), null, '-2 days', jMarina, 'dados_bancarios');

  // João: 4/6 com 1 devolvido
  setDoc.run('devolvido', JSON.stringify({ numero: '98.765.432-1' }), 'foto_tremida', '-3 days', jJoao, 'rg');
  setDoc.run('aprovado', JSON.stringify({ numero: '987.654.321-00' }), null, '-3 days', jJoao, 'cpf');
  setDoc.run('em_revisao', JSON.stringify({}), null, '-2 days', jJoao, 'comprovante');
  setDoc.run('em_revisao', JSON.stringify({}), null, '-2 days', jJoao, 'ctps');

  // Carla: 6/6 aprovada (pronta)
  for (const d of CATALOGO.CLT.slice(0, 6)) {
    setDoc.run('aprovado', JSON.stringify({}), null, '-4 days', jCarla, d.tipo);
  }

  auditar(rhId, 'seed', 'jornada', jMarina, null, 'exemplos de demonstração');
  console.log('Seed concluído: renata@empresa.com/admin123, marina@exemplo.com/senha123 (+joao, carla)');
}

initSchema();
seed();

if (process.argv.includes('--reseed')) {
  console.log('Banco já inicializado em', dbPath);
}

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const TABELAS = ['users', 'jornadas', 'documentos', 'convites', 'auditoria'];

function bool(valor) {
  return Number(valor) === 1;
}

export async function migrar({ sqlitePath, databaseUrl }) {
  if (!fs.existsSync(sqlitePath)) throw new Error('Arquivo SQLite não encontrado.');
  process.env.DATABASE_URL = databaseUrl;
  const { initSchema, query, withTransaction, closePool } = await import('../db.js');
  await initSchema();
  const contagens = await Promise.all(TABELAS.map(async (tabela) => {
    const [row] = await query(`SELECT COUNT(*)::int AS n FROM ${tabela}`);
    return row.n;
  }));
  if (contagens.some((n) => n > 0)) {
    throw new Error('Postgres já tem dados. Esvazie as tabelas antes de copiar.');
  }

  const origem = new DatabaseSync(sqlitePath);
  const ler = (sql) => origem.prepare(sql).all();
  const users = ler(`SELECT id, nome, email, senha_hash, papel, ativo, criado_em, cpf FROM users ORDER BY id`);
  const jornadas = ler(`SELECT id, user_id, tipo_contrato, prazo_recomendado, criado_em FROM jornadas ORDER BY id`);
  const documentos = ler(`SELECT id, jornada_id, tipo, status, arquivo_path, arquivo_nome, dados_json, motivo_devolucao, enviado_em FROM documentos ORDER BY id`);
  const convites = ler(`SELECT id, token, user_id, criado_em, expira_em, usado_em, revogado FROM convites ORDER BY id`);
  const auditoria = ler(`SELECT id, autor_id, acao, entidade, entidade_id, valor_antigo, valor_novo, criado_em FROM auditoria ORDER BY id`);
  origem.close();

  await withTransaction(async (client) => {
    for (const row of users) {
      await query(
        `INSERT INTO users (id, nome, email, senha_hash, papel, ativo, criado_em, cpf)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [row.id, row.nome, row.email, row.senha_hash, row.papel, bool(row.ativo), row.criado_em, row.cpf],
        client
      );
    }
    for (const row of jornadas) {
      await query(
        `INSERT INTO jornadas (id, user_id, tipo_contrato, prazo_recomendado, criado_em)
         VALUES ($1,$2,$3,$4,$5)`,
        [row.id, row.user_id, row.tipo_contrato, row.prazo_recomendado, row.criado_em],
        client
      );
    }
    for (const row of documentos) {
      await query(
        `INSERT INTO documentos (id, jornada_id, tipo, status, arquivo_path, arquivo_nome, dados_json, motivo_devolucao, enviado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.id, row.jornada_id, row.tipo, row.status, row.arquivo_path, row.arquivo_nome, row.dados_json || '{}', row.motivo_devolucao, row.enviado_em],
        client
      );
    }
    for (const row of convites) {
      await query(
        `INSERT INTO convites (id, token, user_id, criado_em, expira_em, usado_em, revogado)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [row.id, row.token, row.user_id, row.criado_em, row.expira_em, row.usado_em, bool(row.revogado)],
        client
      );
    }
    for (const row of auditoria) {
      await query(
        `INSERT INTO auditoria (id, autor_id, acao, entidade, entidade_id, valor_antigo, valor_novo, criado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [row.id, row.autor_id, row.acao, row.entidade, row.entidade_id, row.valor_antigo, row.valor_novo, row.criado_em],
        client
      );
    }
    for (const tabela of TABELAS) {
      const [max] = await query(`SELECT MAX(id)::int AS n FROM ${tabela}`, [], client);
      if (max.n) {
        await query(`SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), $1, true)`, [max.n], client);
      }
    }
  });
  await closePool();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sqlitePath = process.env.SQLITE_PATH;
  const databaseUrl = process.env.DATABASE_URL;
  migrar({ sqlitePath, databaseUrl }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

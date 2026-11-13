import pg from 'pg';

const ADMIN = 'postgres://onboarding:onboarding@localhost:5432/postgres';

export async function preparar(nome) {
  if (!/^[a-z0-9_]+_test$/.test(nome)) {
    throw new Error(`DATABASE_URL precisa terminar em _test. Recebido: ${nome || '(vazio)'}`);
  }
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nome]);
  if (existe.rowCount === 0) await admin.query(`CREATE DATABASE ${nome}`);
  await admin.end();
  process.env.DATABASE_URL = `postgres://onboarding:onboarding@localhost:5432/${nome}`;
}

export async function limpar(query) {
  await query(`TRUNCATE auditoria, convites, documentos, jornadas, users RESTART IDENTITY CASCADE`);
}

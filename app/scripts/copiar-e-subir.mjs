import { initSchema, query, closePool } from '../db.js';
import { migrar } from './migrar-sqlite.mjs';
import { start } from '../server.js';

if (process.env.ONBOARDING_CUTOVER === '1') {
  await initSchema();
  await query(`TRUNCATE auditoria, convites, documentos, jornadas, users RESTART IDENTITY CASCADE`);
  await closePool();
  await migrar({
    sqlitePath: process.env.SQLITE_PATH,
    databaseUrl: process.env.DATABASE_URL,
  });
}

await start();

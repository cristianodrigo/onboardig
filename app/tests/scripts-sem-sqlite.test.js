import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ARQUIVOS = ['test-upload.mjs', 'test-catalogo.mjs', 'test-convite.mjs', 'test-azure-upload.mjs'];

test('scripts de verificação não abrem SQLite', () => {
  for (const nome of ARQUIVOS) {
    const texto = fs.readFileSync(new URL(`../scripts/${nome}`, import.meta.url), 'utf8');
    assert.equal(texto.includes('node:sqlite'), false, nome);
    assert.equal(texto.includes('onboardig.db'), false, nome);
  }
  const exemplo = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(exemplo, /^DATABASE_URL=/m);
  assert.equal(exemplo.includes('DATABASE_PATH'), false);
  const leia = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(leia, /Postgres já tem dados/);
});

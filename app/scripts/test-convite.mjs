// Verificação do fluxo de convite (link de acesso sem senha).
// Uso: node scripts/test-convite.mjs  (com o servidor rodando na porta 8765)
const BASE = 'http://localhost:8765';

async function login(email, senha) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return res.headers.get('set-cookie').split(';')[0];
}

const rh = await login('renata@empresa.com', 'admin123');

// 1. RH cria candidato sem senha, com CPF -> recebe link
const criar = await fetch(`${BASE}/api/usuarios`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie: rh },
  body: JSON.stringify({ nome: 'Pedro Convite', email: 'pedro.convite@exemplo.com', papel: 'candidato', cpf: '111.222.333-44' }),
});
const criado = await criar.json();
console.log('1. criado sem senha:', criar.status, { id: criado.id, link: criado.link?.slice(0, 60) + '...' });

const token = new URL(criado.link).searchParams.get('token');

// 2. Consulta pública do convite
const info = await (await fetch(`${BASE}/api/convite/${token}`)).json();
console.log('2. convite valido:', info);

// 3. CPF errado -> 401
const errado = await fetch(`${BASE}/api/convite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, cpf: '99999999999' }),
});
console.log('3. cpf errado:', errado.status, (await errado.json()).erro);

// 4. CPF certo -> sessao criada
const certo = await fetch(`${BASE}/api/convite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, cpf: '111.222.333-44' }),
});
const cookie = certo.headers.get('set-cookie')?.split(';')[0];
console.log('4. cpf certo:', certo.status, (await certo.json()).usuario.nome);

// 5. Sessão funciona na jornada
const jornada = await (await fetch(`${BASE}/api/jornada`, { headers: { cookie } })).json();
console.log('5. jornada via convite:', jornada.progresso, 'tipo:', jornada.jornada.tipo_contrato);

// 6. Reuso do mesmo token -> 410
const reuso = await fetch(`${BASE}/api/convite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token }),
});
console.log('6. reuso do link:', reuso.status, (await reuso.json()).erro);

// 7. RH renova o link -> novo token funciona sem CPF pedido? (pede CPF: sim)
const renova = await (await fetch(`${BASE}/api/usuarios/${criado.id}/convite`, { method: 'POST', headers: { cookie: rh } })).json();
const token2 = new URL(renova.link).searchParams.get('token');
const info2 = await (await fetch(`${BASE}/api/convite/${token2}`)).json();
console.log('7. link renovado:', info2);

// 8. Limpeza: remove usuário de teste
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(new URL('../onboardig.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
db.prepare(`UPDATE auditoria SET autor_id = NULL WHERE autor_id = ?`).run(criado.id);
db.prepare(`DELETE FROM convites WHERE user_id = ?`).run(criado.id);
db.prepare(`DELETE FROM documentos WHERE jornada_id = ?`).run(criado.jornada_id);
db.prepare(`DELETE FROM jornadas WHERE user_id = ?`).run(criado.id);
db.prepare(`DELETE FROM users WHERE id = ?`).run(criado.id);
console.log('8. usuario de teste removido');

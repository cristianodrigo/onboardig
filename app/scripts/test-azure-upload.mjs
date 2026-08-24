// Testa upload no storage ativo (Azure ou local) e confirma onde o arquivo ficou.
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

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const marina = await login('marina@exemplo.com', 'senha123');
const fd = new FormData();
fd.append('arquivo', new Blob([png], { type: 'image/png' }), 'azure-teste.png');
fd.append('dados', JSON.stringify({ numero: '12.345.678-9', legivel: true }));

const up = await fetch(`${BASE}/api/documentos/rg/upload`, {
  method: 'POST', headers: { cookie: marina }, body: fd,
});
console.log('1. upload:', up.status, await up.json());

const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(new URL('../onboardig.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const row = db.prepare(
  `SELECT d.arquivo_path, d.arquivo_nome, d.status
   FROM documentos d JOIN jornadas j ON j.id = d.jornada_id
   JOIN users u ON u.id = j.user_id
   WHERE u.email = 'marina@exemplo.com' AND d.tipo = 'rg'`
).get();
const azure = String(row?.arquivo_path || '').startsWith('azure:');
console.log('2. arquivo_path:', azure ? row.arquivo_path : row?.arquivo_path);
console.log('3. storage:', azure ? 'AZURE BLOB' : 'DISCO LOCAL', '| status:', row?.status, '| nome:', row?.arquivo_nome);

const rh = await login('renata@empresa.com', 'admin123');
const { candidatos } = await (await fetch(`${BASE}/api/candidatos`, { headers: { cookie: rh } })).json();
const marinaC = candidatos.find((c) => c.email === 'marina@exemplo.com');
const det = await (await fetch(`${BASE}/api/candidatos/${marinaC.jornada_id}`, { headers: { cookie: rh } })).json();
const rg = det.documentos.find((d) => d.tipo === 'rg');
const down = await fetch(`${BASE}/api/documentos/${rg.id}/arquivo`, { headers: { cookie: rh } });
console.log('4. download RH:', down.status, down.headers.get('content-type'));

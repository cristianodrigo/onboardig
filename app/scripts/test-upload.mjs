// Verificação ponta a ponta do fluxo de upload (candidato) + revisão (RH).
// Uso: node scripts/test-upload.mjs  (com o servidor rodando na porta 8765)
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

// PNG 1x1 válido
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const marina = await login('marina@exemplo.com', 'senha123');
const fd = new FormData();
fd.append('arquivo', new Blob([png], { type: 'image/png' }), 'rg.png');
fd.append('dados', JSON.stringify({ numero: '12.345.678-9', legivel: true }));

const up = await fetch(`${BASE}/api/documentos/rg/upload`, {
  method: 'POST',
  headers: { cookie: marina },
  body: fd,
});
console.log('1. upload marina/rg:', up.status, await up.json());

const j = await (await fetch(`${BASE}/api/jornada`, { headers: { cookie: marina } })).json();
const rg = j.checklist.find((d) => d.tipo === 'rg');
console.log('2. checklist apos upload:', { status: rg.status, tem_arquivo: rg.tem_arquivo, numero: rg.dados.numero });

const rh = await login('renata@empresa.com', 'admin123');
const { candidatos } = await (await fetch(`${BASE}/api/candidatos`, { headers: { cookie: rh } })).json();
const marinaC = candidatos.find((c) => c.email === 'marina@exemplo.com');
const det = await (await fetch(`${BASE}/api/candidatos/${marinaC.jornada_id}`, { headers: { cookie: rh } })).json();
const rgRh = det.documentos.find((d) => d.tipo === 'rg');
console.log('3. rh ve rg:', { status: rgRh.status, arquivo: rgRh.arquivo_nome });

const ap = await fetch(`${BASE}/api/documentos/${rgRh.id}/aprovar`, { method: 'POST', headers: { cookie: rh } });
console.log('4. rh aprova:', ap.status);

const down = await fetch(`${BASE}/api/documentos/${rgRh.id}/arquivo`, { headers: { cookie: rh } });
console.log('5. download arquivo:', down.status, down.headers.get('content-type') || '');

const det2 = await (await fetch(`${BASE}/api/candidatos/${marinaC.jornada_id}`, { headers: { cookie: rh } })).json();
console.log('6. auditoria recente:', det2.auditoria.slice(0, 3).map((a) => `${a.autor}: ${a.acao}`).join(' | '));

// Verificação do catálogo por tipo de contrato e upload dinâmico.
// Uso: node scripts/test-catalogo.mjs  (servidor na porta 8765)
const BASE = 'http://localhost:8765';

async function login(email, senha) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return res.headers.get('set-cookie').split(';')[0];
}

async function criarCandidato(rh, nome, email, tipo_contrato) {
  const res = await fetch(`${BASE}/api/usuarios`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: rh },
    body: JSON.stringify({ nome, email, papel: 'candidato', tipo_contrato }),
  });
  const body = await res.json();
  return { id: body.id, jornada: body.jornada_id, link: body.link };
}

async function acessarPorConvite(link) {
  const token = new URL(link).searchParams.get('token');
  const res = await fetch(`${BASE}/api/convite`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error('convite: ' + (await res.json()).erro);
  return res.headers.get('set-cookie').split(';')[0];
}

const rh = await login('renata@empresa.com', 'admin123');

// 1. Checklists por tipo
const est = await criarCandidato(rh, 'Edu Estagio', 'edu.estagio@exemplo.com', 'ESTAGIO');
const pj = await criarCandidato(rh, 'Paula PJ', 'paula.pj@exemplo.com', 'PJ');
const clt = await criarCandidato(rh, 'Caio CLT', 'caio.clt@exemplo.com', 'CLT');

const ckEst = await (await fetch(`${BASE}/api/candidatos/${est.jornada}`, { headers: { cookie: rh } })).json();
const ckPj = await (await fetch(`${BASE}/api/candidatos/${pj.jornada}`, { headers: { cookie: rh } })).json();
const ckClt = await (await fetch(`${BASE}/api/candidatos/${clt.jornada}`, { headers: { cookie: rh } })).json();
console.log('1. checklist ESTAGIO:', ckEst.documentos.length, '| PJ:', ckPj.documentos.length, '| CLT:', ckClt.documentos.length);
console.log('   PJ tem cartao_cnpj:', ckPj.documentos.some((d) => d.tipo === 'cartao_cnpj'),
  '| ESTAGIO tem termo:', ckEst.documentos.some((d) => d.tipo === 'termo_compromisso'),
  '| CLT tem sus/vt/uniforme:', ['sus', 'vale_transporte', 'uniforme'].every((t) => ckClt.documentos.some((d) => d.tipo === t)));

// 2. Candidato CLT via convite: uniforme (só dados) sem arquivo
const cCaio = await acessarPorConvite(clt.link);
const fdUniforme = new FormData();
fdUniforme.append('dados', JSON.stringify({ tamanho_camisa: 'M', tamanho_camiseta: 'M', tamanho_botina: '42' }));
const upUniforme = await fetch(`${BASE}/api/documentos/uniforme/upload`, { method: 'POST', headers: { cookie: cCaio }, body: fdUniforme });
console.log('2. uniforme so dados:', upUniforme.status, (await upUniforme.json()).status || '');

// 3. CPF sem arquivo -> 400 (exige upload)
const fdCpf = new FormData();
fdCpf.append('dados', JSON.stringify({ numero: '123.456.789-09' }));
const upCpf = await fetch(`${BASE}/api/documentos/cpf/upload`, { method: 'POST', headers: { cookie: cCaio }, body: fdCpf });
console.log('3. cpf sem arquivo:', upCpf.status, (await upCpf.json()).erro || '');

// 4. União estável = nao -> sem arquivo OK
const fdUniao = new FormData();
fdUniao.append('dados', JSON.stringify({ uniao_estavel: 'nao' }));
const upUniao = await fetch(`${BASE}/api/documentos/uniao_estavel/upload`, { method: 'POST', headers: { cookie: cCaio }, body: fdUniao });
console.log('4. uniao_estavel=nao sem arquivo:', upUniao.status);

// 5. União estável = sim sem arquivo -> 400 (condicional)
const fdUniaoSim = new FormData();
fdUniaoSim.append('dados', JSON.stringify({ uniao_estavel: 'sim' }));
const upUniaoSim = await fetch(`${BASE}/api/documentos/uniao_estavel/upload`, { method: 'POST', headers: { cookie: cCaio }, body: fdUniaoSim });
console.log('5. uniao_estavel=sim sem arquivo:', upUniaoSim.status, (await upUniaoSim.json()).erro || '');

// 6. Vale transporte optando (dados condicionais)
const fdVt = new FormData();
fdVt.append('dados', JSON.stringify({ opta: 'sim', quantidade_passagens: '4', valor_tarifa: '9,60' }));
const upVt = await fetch(`${BASE}/api/documentos/vale_transporte/upload`, { method: 'POST', headers: { cookie: cCaio }, body: fdVt });
console.log('6. vale_transporte com opta=sim:', upVt.status);

// 7. RH vê progresso do Caio (3 enviados) e campos rotulados
const detCaio = await (await fetch(`${BASE}/api/candidatos/${clt.jornada}`, { headers: { cookie: rh } })).json();
console.log('7. progresso Caio:', detCaio.candidato.progresso.enviados, 'de', detCaio.candidato.progresso.total,
  '| campos VT:', detCaio.documentos.find((d) => d.tipo === 'vale_transporte').campos.length);

// 8. Limpeza
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(new URL('../onboardig.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
for (const id of [est.id, pj.id, clt.id]) {
  db.prepare(`UPDATE auditoria SET autor_id = NULL WHERE autor_id = ?`).run(id);
  db.prepare(`DELETE FROM convites WHERE user_id = ?`).run(id);
  db.prepare(`DELETE FROM documentos WHERE jornada_id IN (SELECT id FROM jornadas WHERE user_id = ?)`).run(id);
  db.prepare(`DELETE FROM jornadas WHERE user_id = ?`).run(id);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}
console.log('8. usuarios de teste removidos');

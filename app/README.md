# Onboarding — protótipo funcional

Pré-onboarding documental com duas superfícies: jornada do candidato (mobile-first) e painel do RH, com gerenciamento de usuários.

## Rodar

```bash
npm install
cp .env.example .env   # Windows: copy .env.example .env
npm start
```

Abrir http://localhost:8765 — redireciona para o login.

### Azure Blob Storage (documentos)

Por padrão os arquivos vão para `uploads/` no disco. Para usar Azure:

1. Crie uma Storage Account e um container privado (ex.: `documentos`)
2. Copie a Connection string em Access keys
3. Preencha no `.env`:

```env
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=documentos
```

4. Reinicie o servidor — no console deve aparecer `Storage: Azure Blob (documentos)`

Blobs ficam em `candidatos/{userId}/{tipo}/{timestamp}-{arquivo}`. O download continua autenticado pela API (stream do blob).

## Primeiro acesso

Com o banco vazio, o app cria um único usuário RH se `SEED_RH_EMAIL` e `SEED_RH_PASSWORD` estiverem no `.env`. Sem isso, a tela de login fica sem credenciais de exemplo — o RH cadastra candidatos pelo painel.

## O que funciona

- **Login com papéis** (candidato/RH), sessão por cookie httpOnly, senha com bcrypt
- **Link de convite sem senha** (candidato): o RH cria o candidato sem senha e o sistema envia o link por e-mail (SMTP). O link vale 7 dias, uso único, renovável. Se o CPF for informado no cadastro, o candidato confirma o CPF ao abrir o link. Renovar o link revoga os anteriores
- **Gerenciamento de usuários** (só RH): criar, editar, resetar senha, ativar/desativar, gerar/renovar link de acesso em `/usuarios.html`. Criar candidato já gera a jornada CLT com o checklist de 6 documentos
- **Tipos de contrato** (escolhido pelo RH ao criar o candidato): **CLT** (18 documentos), **Estágio** (14, com termo de compromisso) e **PJ/CNPJ** (8, com cartão CNPJ). Cada documento tem seus próprios campos estruturados (catálogo em `catalogo.js`)
- **Candidato**: boas-vindas, checklist com progresso real, formulário dinâmico por documento, upload de arquivo (JPG/PNG/PDF, 10 MB), correção de documento devolvido com motivo e dicas
- **Validações e condicionais**: cartão SUS deve começar com 7 ou 8 (alerta para emitir cartão atualizado), vale transporte pergunta opt-in e só pede passagens/tarifa se "sim", declaração de união estável só habilita upload se o candidato indicar união estável, documentos só de dados (uniforme, contato de emergência, VT) não exigem arquivo
- **RH**: fila com busca, revisão por documento (aprovar/devolver com motivos categorizados/baixar), aprovação em massa, correção inline do cadastro, trilha de auditoria
- **Auditoria**: toda ação registra autor, data/hora e valor antigo → novo

## Stack

Node 24, Express, `pg`, Postgres 16. Desenvolvimento sobe com `docker compose up -d` na raiz. A URL fica em `DATABASE_URL`. Uploads: Azure Blob (se configurado) ou pasta `uploads/`.

## Ordem da virada

1. Criar o Postgres no Dokploy, no mesmo projeto do onboarding, e colocar a URL interna em `DATABASE_URL` do script.
2. `SQLITE_PATH=/data/onboardig.db` aponta para o volume `onboarding-sqlite`. Rodar `node scripts/migrar-sqlite.mjs`.
3. Se a saída for `Postgres já tem dados. Esvazie as tabelas antes de copiar.`, o app subiu antes da cópia. Pare o app, esvazie as tabelas e rode o script de novo.
4. Só então grave `DATABASE_URL` no app e publique.
5. Conferir login do RH, a lista de usuários e a contagem igual à do SQLite. O volume SQLite fica até essa conferência.

## Verificação

Com o servidor no ar: `node scripts/test-upload.mjs` — exercita upload, revisão, download e auditoria.

## Fora de escopo (fase 2 do PRD)

Exportação para o Sênior, OCR, notificações além do convite.

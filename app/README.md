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

## Credenciais de demonstração

| Papel | E-mail | Senha |
|---|---|---|
| RH | renata@empresa.com | admin123 |
| Candidata | marina@exemplo.com | senha123 |
| Candidato | joao@exemplo.com | senha123 |
| Candidata | carla@exemplo.com | senha123 |

## O que funciona

- **Login com papéis** (candidato/RH), sessão por cookie httpOnly, senha com bcrypt
- **Link de convite sem senha** (candidato): o RH cria o candidato sem senha e recebe um link (válido por 7 dias, uso único, renovável). Se o CPF for informado no cadastro, o candidato confirma o CPF ao abrir o link. Renovar o link revoga os anteriores
- **Gerenciamento de usuários** (só RH): criar, editar, resetar senha, ativar/desativar, gerar/renovar link de acesso em `/usuarios.html`. Criar candidato já gera a jornada CLT com o checklist de 6 documentos
- **Tipos de contrato** (escolhido pelo RH ao criar o candidato): **CLT** (18 documentos), **Estágio** (14, com termo de compromisso) e **PJ/CNPJ** (8, com cartão CNPJ). Cada documento tem seus próprios campos estruturados (catálogo em `catalogo.js`)
- **Candidato**: boas-vindas, checklist com progresso real, formulário dinâmico por documento, upload de arquivo (JPG/PNG/PDF, 10 MB), correção de documento devolvido com motivo e dicas
- **Validações e condicionais**: cartão SUS deve começar com 7 ou 8 (alerta para emitir cartão atualizado), vale transporte pergunta opt-in e só pede passagens/tarifa se "sim", declaração de união estável só habilita upload se o candidato indicar união estável, documentos só de dados (uniforme, contato de emergência, VT) não exigem arquivo
- **RH**: fila com busca, revisão por documento (aprovar/devolver com motivos categorizados/baixar), aprovação em massa, correção inline do cadastro, trilha de auditoria
- **Auditoria**: toda ação registra autor, data/hora e valor antigo → novo

## Stack

Node 24 (SQLite embutido via `node:sqlite`), Express, express-session, multer, bcryptjs, `@azure/storage-blob`. Banco em arquivo `onboardig.db`. Uploads: Azure Blob (se configurado) ou pasta `uploads/`.

## Verificação

Com o servidor no ar: `node scripts/test-upload.mjs` — exercita upload, revisão, download e auditoria.

## Fora de escopo (fase 2 do PRD)

Exportação para o Sênior, link mágico por e-mail, OCR, notificações reais.

// Catálogo de documentos e campos por tipo de contrato (CLT, Estágio, PJ).
// Fonte da verdade do checklist — backend (db/routes) e API para o frontend.

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const TIPOS_CONTRATO = {
  CLT: 'CLT',
  ESTAGIO: 'Estágio',
  PJ: 'PJ (CNPJ)',
};

const T = (key, label, extra = {}) => ({ key, label, tipo: 'text', ...extra });
const NUM = (key, label, extra = {}) => ({ key, label, tipo: 'numero', ...extra });
const DATE = (key, label, extra = {}) => ({ key, label, tipo: 'date', ...extra });
const SEL = (key, label, opcoes, extra = {}) => ({ key, label, tipo: 'select', opcoes, ...extra });

const CAMPOS_RG = [
  T('nome_completo', 'Nome completo'),
  T('nome_social', 'Nome social', { obrigatorio: false }),
  SEL('sexo', 'Sexo', ['Feminino', 'Masculino', 'Outro']),
  SEL('estado_civil', 'Estado civil', ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)']),
  T('nacionalidade', 'Nacionalidade'),
  SEL('estado_nascimento', 'Estado em que nasceu', UFS),
  T('cidade_nascimento', 'Cidade em que nasceu'),
  DATE('data_nascimento', 'Data de nascimento'),
  T('nome_mae', 'Nome completo da mãe'),
  T('numero', 'Número do RG'),
  DATE('data_expedicao', 'Data de expedição'),
  T('orgao_emissor', 'Órgão emissor'),
  SEL('uf_emissor', 'UF emissor', UFS),
];

const CAMPOS_CNH = [
  SEL('categoria', 'Categoria', ['A', 'B', 'AB', 'C', 'D', 'E', 'ACC']),
  T('numero_registro', 'Número de registro'),
  DATE('data_primeira_habilitacao', 'Data da 1ª habilitação'),
  T('orgao_emissor', 'Órgão emissor'),
  SEL('uf_emissor', 'UF emissor', UFS),
  DATE('data_emissao', 'Data de emissão'),
  DATE('validade', 'Validade'),
];

const CAMPOS_TITULO = [
  T('numero', 'Número'),
  T('zona', 'Zona'),
  T('secao', 'Seção'),
  SEL('uf_emissor', 'UF emissor', UFS),
];

const CAMPOS_RESERVISTA = [
  SEL('situacao_militar', 'Situação militar', ['Quite', 'Reservista', 'Dispensado', 'Isento']),
  T('numero_ra', 'Número do RA (registro de alistamento)'),
  T('categoria_militar', 'Categoria militar', { obrigatorio: false }),
  T('regiao_militar', 'Região militar', { obrigatorio: false }),
  T('orgao_expedidor', 'Órgão expedidor'),
  SEL('uf_expedicao', 'UF expedição', UFS),
];

const CAMPOS_RESIDENCIA = [
  SEL('tipo_logradouro', 'Tipo', ['Rua', 'Avenida', 'Alameda', 'Travessa', 'Estrada', 'Rodovia', 'Praça', 'Outro']),
  T('logradouro', 'Logradouro'),
  T('numero', 'Número'),
  T('complemento', 'Complemento', { obrigatorio: false }),
  T('bairro', 'Bairro'),
  T('cidade', 'Cidade'),
  SEL('estado', 'Estado', UFS),
  T('pais', 'País'),
  T('cep', 'CEP', { mascara: 'cep' }),
];

const CAMPOS_BANCO = [
  SEL('banco', 'Nome do banco', ['Itaú', 'BTG Pactual']),
  T('agencia', 'Agência'),
  T('conta', 'Conta'),
  T('digito_conta', 'Dígito da conta'),
];

const CAMPOS_UNIFORME = [
  SEL('tamanho_camisa', 'Tamanho camisa', ['PP', 'P', 'M', 'G', 'GG', 'XG']),
  SEL('tamanho_camiseta', 'Tamanho camiseta', ['PP', 'P', 'M', 'G', 'GG', 'XG']),
  SEL('tamanho_botina', 'Tamanho botina', ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']),
];

const CAMPOS_CONTATO = [
  T('nome_contato', 'Nome do contato'),
  T('telefone', 'Telefone', { mascara: 'telefone' }),
];

// arquivo: 'sempre' (exige upload) | 'nunca' (só dados) | 'condicional' (depende de um campo)
const DOC = (tipo, nome, icone, arquivo, campos = [], extra = {}) => ({ tipo, nome, icone, arquivo, campos, ...extra });

export const CATALOGO = {
  CLT: [
    DOC('cpf', 'CPF', '📄', 'sempre', [T('numero', 'Número do CPF', { mascara: 'cpf' })]),
    DOC('rg', 'RG', '🪪', 'sempre', CAMPOS_RG),
    DOC('uniao_estavel', 'Declaração de união estável', '💍', 'condicional', [
      SEL('uniao_estavel', 'Você está em união estável?', ['nao', 'sim']),
    ], { condicional_arquivo: { key: 'uniao_estavel', igual: 'sim' }, dica: 'Se indicar união estável, envie a declaração.' }),
    DOC('cnh', 'CNH', '🚗', 'sempre', CAMPOS_CNH, { obrigatorio_doc: false, dica: 'Só se tiver carteira de motorista.' }),
    DOC('titulo', 'Título de eleitor', '🗳️', 'sempre', CAMPOS_TITULO),
    DOC('ctps', 'CTPS', '📘', 'sempre', [T('numero', 'Número da CTPS')], { dica: 'Não encontra sua CTPS? A gente te mostra como.' }),
    DOC('certidao', 'Certidão de nascimento ou casamento', '📜', 'sempre', []),
    DOC('reservista', 'Certificado de reservista', '🪖', 'sempre', CAMPOS_RESERVISTA, { obrigatorio_doc: false, dica: 'Para quem tem obrigação militar.' }),
    DOC('escolaridade', 'Comprovante de escolaridade', '🎓', 'sempre', [
      SEL('grau_instrucao', 'Grau de instrução', ['Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Superior incompleto', 'Superior completo', 'Pós-graduação']),
    ]),
    DOC('pis', 'Comprovante de PIS/PASEP', '💳', 'sempre', [T('numero', 'Número do PIS/PASEP')]),
    DOC('comprovante', 'Comprovante de residência', '🏠', 'sempre', CAMPOS_RESIDENCIA, { dica: 'Não está no seu nome? Sem problema.' }),
    DOC('foto', 'Foto', '📷', 'sempre', [], { dica: 'Foto de rosto, fundo claro — como foto de documento.' }),
    DOC('dados_bancarios', 'Dados bancários', '🏦', 'sempre', CAMPOS_BANCO, { dica: 'Obrigatório Itaú; BTG em breve.' }),
    DOC('contato_emergencia', 'Contato de emergência', '🆘', 'nunca', CAMPOS_CONTATO),
    DOC('aso', 'ASO', '🩺', 'sempre', [DATE('data_exame', 'Data de realização do exame')], { dica: 'Atestado de Saúde Ocupacional.' }),
    DOC('vale_transporte', 'Vale transporte', '🚌', 'nunca', [
      SEL('opta', 'Opta por aderir ao vale transporte?', ['sim', 'nao']),
      NUM('quantidade_passagens', 'Quantidade de passagens por dia (ida + volta)', { condicional: { key: 'opta', igual: 'sim' } }),
      T('valor_tarifa', 'Valor da tarifa diária (R$)', { condicional: { key: 'opta', igual: 'sim' } }),
    ]),
    DOC('sus', 'Cartão do SUS', '🏥', 'sempre', [
      T('numero', 'Número do cartão SUS', { validacao: 'sus' }),
    ], { aviso_sus: 'O número do cartão SUS começa com 7 ou 8. Se o seu não começa assim, emita o cartão SUS atualizado no posto de saúde ou app Conecte SUS.' }),
    DOC('uniforme', 'Tamanho de uniforme', '👕', 'nunca', CAMPOS_UNIFORME),
  ],

  ESTAGIO: [
    DOC('rg', 'RG', '🪪', 'sempre', CAMPOS_RG),
    DOC('cpf', 'CPF', '📄', 'sempre', [T('numero', 'Número do CPF', { mascara: 'cpf' })]),
    DOC('cnh', 'CNH', '🚗', 'sempre', CAMPOS_CNH, { obrigatorio_doc: false, dica: 'Só se tiver carteira de motorista.' }),
    DOC('titulo', 'Título de eleitor', '🗳️', 'sempre', CAMPOS_TITULO),
    DOC('certidao', 'Certidão de nascimento ou casamento', '📜', 'sempre', []),
    DOC('reservista', 'Certificado de reservista', '🪖', 'sempre', CAMPOS_RESERVISTA, { obrigatorio_doc: false, dica: 'Para quem tem obrigação militar.' }),
    DOC('escolaridade', 'Comprovante de escolaridade', '🎓', 'sempre', [
      SEL('grau_instrucao', 'Grau de instrução', ['Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Superior incompleto', 'Superior completo', 'Pós-graduação']),
    ]),
    DOC('comprovante', 'Comprovante de residência', '🏠', 'sempre', CAMPOS_RESIDENCIA),
    DOC('foto', 'Foto', '📷', 'sempre', [], { dica: 'Foto de rosto, fundo claro — como foto de documento.' }),
    DOC('dados_bancarios', 'Dados bancários', '🏦', 'sempre', CAMPOS_BANCO, { dica: 'Obrigatório Itaú; BTG em breve.' }),
    DOC('contato_emergencia', 'Contato de emergência', '🆘', 'nunca', CAMPOS_CONTATO),
    DOC('aso', 'ASO', '🩺', 'sempre', [DATE('data_exame', 'Data de realização do exame')]),
    DOC('uniforme', 'Tamanho de uniforme', '👕', 'nunca', CAMPOS_UNIFORME),
    DOC('termo_compromisso', 'Termo de compromisso de estágio', '📝', 'sempre', [], { dica: 'Assinado por você, pela empresa e pela instituição de ensino.' }),
  ],

  PJ: [
    DOC('rg', 'RG', '🪪', 'sempre', CAMPOS_RG),
    DOC('cpf', 'CPF', '📄', 'sempre', [T('numero', 'Número do CPF', { mascara: 'cpf' })]),
    DOC('cnh', 'CNH', '🚗', 'sempre', CAMPOS_CNH, { obrigatorio_doc: false, dica: 'Só se tiver carteira de motorista.' }),
    DOC('certidao', 'Certidão de nascimento ou casamento', '📜', 'sempre', []),
    DOC('escolaridade', 'Comprovante de escolaridade', '🎓', 'sempre', [
      SEL('grau_instrucao', 'Grau de instrução', ['Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Superior incompleto', 'Superior completo', 'Pós-graduação']),
    ]),
    DOC('comprovante', 'Comprovante de residência', '🏠', 'sempre', CAMPOS_RESIDENCIA),
    DOC('uniforme', 'Tamanho de uniforme', '👕', 'nunca', CAMPOS_UNIFORME),
    DOC('cartao_cnpj', 'Cartão CNPJ', '🏢', 'sempre', [
      T('razao_social', 'Razão social'),
      T('numero_cnpj', 'Número do CNPJ', { mascara: 'cnpj' }),
    ]),
  ],
};

// Índice por tipo de documento (mesmo doc pode ter campos iguais em contratos diferentes)
export const DOCS_INDEX = {};
for (const docs of Object.values(CATALOGO)) {
  for (const d of docs) if (!DOCS_INDEX[d.tipo]) DOCS_INDEX[d.tipo] = d;
}

export function docDoCatalogo(tipoContrato, tipoDoc) {
  return (CATALOGO[tipoContrato] || CATALOGO.CLT).find((d) => d.tipo === tipoDoc)
    || DOCS_INDEX[tipoDoc] || null;
}

export function arquivoObrigatorio(spec, dados = {}) {
  if (!spec) return true;
  if (spec.arquivo === 'sempre') return true;
  if (spec.arquivo === 'nunca') return false;
  if (spec.arquivo === 'condicional' && spec.condicional_arquivo) {
    return dados[spec.condicional_arquivo.key] === spec.condicional_arquivo.igual;
  }
  return false;
}

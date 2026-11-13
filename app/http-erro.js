const QUEDA = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', '57P01', '53300']);

export function statusDoErro(err) {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') return { status: 413, erro: 'Arquivo maior que 10 MB.' };
  if (QUEDA.has(err.code)) return { status: 503, erro: 'Banco indisponível. Tente de novo em instantes.' };
  if (err.code === '23505' && String(err.constraint || '').includes('email')) {
    return { status: 409, erro: 'Já existe usuário com este e-mail.' };
  }
  if (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
    return { status: 500, erro: 'Falha ao acessar o banco.' };
  }
  return { status: 400, erro: err.message || 'Requisição inválida.' };
}

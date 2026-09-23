'use strict';

const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', 'historico-api.json');

function carregar() {
  if (!fs.existsSync(ARQUIVO)) return { versao: 1, publicacoes: [] };
  try {
    const data = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    if (!data || !Array.isArray(data.publicacoes)) return { versao: 1, publicacoes: [] };
    return data;
  } catch (_) {
    return { versao: 1, publicacoes: [] };
  }
}

function salvar(data) {
  const payload = {
    versao: 1,
    atualizado_em: new Date().toISOString(),
    publicacoes: (data.publicacoes || []).slice(-500),
  };
  fs.writeFileSync(ARQUIVO, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function chaveConteudo(item) {
  if (item.url) {
    try {
      const u = new URL(item.url);
      return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
    } catch (_) {
      return String(item.url).toLowerCase();
    }
  }
  return String(item.id_unico || item.titulo || '')
    .toLowerCase()
    .slice(0, 120);
}

function jaPublicado(pageId, item) {
  const key = chaveConteudo(item);
  const page = String(pageId);
  const hist = carregar();
  return hist.publicacoes.some(
    (p) =>
      p.status === 'publicado' &&
      String(p.page_id) === page &&
      (p.chave === key || (item.url && p.url === item.url))
  );
}

function ultimaFonte(pageId) {
  const page = String(pageId);
  const hist = carregar();
  for (let i = hist.publicacoes.length - 1; i >= 0; i--) {
    const p = hist.publicacoes[i];
    if (p.status === 'publicado' && String(p.page_id) === page) {
      return p.fonte_id || null;
    }
  }
  return null;
}

function registrarSucesso(entrada) {
  const hist = carregar();
  hist.publicacoes.push({
    status: 'publicado',
    page_id: String(entrada.page_id),
    pagina_nome: entrada.pagina_nome || '',
    fonte_id: entrada.fonte_id || '',
    fonte_nome: entrada.fonte_nome || '',
    url: entrada.url || '',
    chave: entrada.chave || chaveConteudo(entrada),
    titulo: entrada.titulo || '',
    post_id: entrada.post_id || null,
    publicado_em: new Date().toISOString(),
  });
  salvar(hist);
}

function registrarFalha(entrada) {
  const hist = carregar();
  hist.publicacoes.push({
    status: 'erro',
    page_id: String(entrada.page_id || ''),
    pagina_nome: entrada.pagina_nome || '',
    fonte_id: entrada.fonte_id || '',
    url: entrada.url || '',
    titulo: entrada.titulo || '',
    erro: entrada.erro || '',
    em: new Date().toISOString(),
  });
  salvar(hist);
}

module.exports = {
  ARQUIVO,
  carregar,
  salvar,
  chaveConteudo,
  jaPublicado,
  ultimaFonte,
  registrarSucesso,
  registrarFalha,
};

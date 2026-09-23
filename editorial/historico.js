'use strict';

const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', 'historico-editorial.json');
const MS_HORA = 60 * 60 * 1000;

function carregar() {
  if (!fs.existsSync(ARQUIVO)) {
    return { versao: 1, publicacoes: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    if (!data || !Array.isArray(data.publicacoes)) {
      return { versao: 1, publicacoes: [] };
    }
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

function normalizarUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim());
    let key = u.origin + u.pathname;
    if (key.endsWith('/')) key = key.slice(0, -1);
    return key.toLowerCase();
  } catch (_) {
    return String(url).trim().split('?')[0].replace(/\/$/, '').toLowerCase();
  }
}

function jaPublicado(pageId, url) {
  const key = normalizarUrl(url);
  const page = String(pageId);
  const hist = carregar();
  return hist.publicacoes.some(
    (p) =>
      p.status === 'publicado' &&
      String(p.page_id) === page &&
      normalizarUrl(p.url) === key
  );
}

function assuntoRecente(pageId, titulo, horas) {
  const page = String(pageId);
  const limite = Date.now() - (horas || 48) * MS_HORA;
  const base = simplificarTitulo(titulo);
  if (!base) return false;
  const hist = carregar();
  return hist.publicacoes.some((p) => {
    if (p.status !== 'publicado' || String(p.page_id) !== page) return false;
    const t = Date.parse(p.publicado_em || '');
    if (!Number.isFinite(t) || t < limite) return false;
    return simplificarTitulo(p.titulo) === base;
  });
}

function simplificarTitulo(titulo) {
  return String(titulo || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function ultimaFonteUsada(pageId) {
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

/** Só chamar após sucesso confirmado da Graph API. */
function registrarSucesso(entrada) {
  const hist = carregar();
  hist.publicacoes.push({
    status: 'publicado',
    page_id: String(entrada.page_id),
    pagina_nome: entrada.pagina_nome || '',
    fonte_id: entrada.fonte_id || '',
    fonte_nome: entrada.fonte_nome || '',
    url: entrada.url || '',
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
  normalizarUrl,
  jaPublicado,
  assuntoRecente,
  ultimaFonteUsada,
  registrarSucesso,
  registrarFalha,
};

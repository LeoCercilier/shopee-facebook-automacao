'use strict';

/**
 * Validador do Módulo 2.
 * Garante que preço e link do anúncio final são EXATAMENTE os do resultado-oferta.json.
 * A copy nunca pode sobrescrever dados críticos.
 */

function temValor(v) {
  return v != null && String(v).trim() !== '';
}

function contemUrl(texto) {
  return /https?:\/\//i.test(String(texto || ''));
}

function contemPrecoSuspeito(texto, precoOriginal) {
  const t = String(texto || '');
  // Se a copy menciona R$ e não é exatamente o preço original isolado, suspeito
  if (/R\$\s*[\d.,]+/i.test(t)) {
    const preco = String(precoOriginal || '').trim();
    if (preco && t.includes(preco)) return false;
    return true;
  }
  return false;
}

/**
 * Reivindicações que a copy não deve fazer sem dados no JSON.
 */
const PADROES_PROIBIDOS = [
  /\b\d{1,3}\s*%\s*off\b/i,
  /\bdesconto de\b/i,
  /\bpor apenas\b/i,
  /\bmelhores? avalia/i,
  /\b\d+[.,]\d+\s*estrelas?\b/i,
  /\bfrete gr[aá]tis\b/i,
  /\bgarantido\b/i,
  /\bmilagre\b/i,
  /\bcura\b/i,
  /\bpromessa\b/i,
];

function validarEntradaProduto(produto) {
  const erros = [];
  if (!produto || typeof produto !== 'object') {
    return { ok: false, erros: ['produto_ausente'] };
  }
  if (!temValor(produto.titulo)) erros.push('titulo_ausente');
  if (!temValor(produto.preco)) erros.push('preco_ausente');
  if (!temValor(produto.link)) erros.push('link_ausente');
  return { ok: erros.length === 0, erros };
}

/**
 * Valida uma opção de copy isolada (sem montar anúncio).
 */
function validarCopy(copyTexto, { preco, link }) {
  const avisos = [];
  const texto = String(copyTexto || '').trim();

  if (texto.length < 8) {
    return { ok: false, motivo: 'copy_muito_curta', avisos };
  }
  if (contemUrl(texto)) {
    return { ok: false, motivo: 'copy_contem_url', avisos };
  }
  if (contemPrecoSuspeito(texto, preco)) {
    return { ok: false, motivo: 'copy_contem_preco', avisos };
  }
  if (link && texto.includes(String(link).trim())) {
    return { ok: false, motivo: 'copy_contem_link_original', avisos };
  }
  for (const re of PADROES_PROIBIDOS) {
    if (re.test(texto)) {
      avisos.push(`padrao_proibido:${re}`);
      return { ok: false, motivo: 'copy_reivindicacao_nao_comprovada', avisos };
    }
  }
  return { ok: true, motivo: 'ok', avisos };
}

/**
 * Monta o anúncio final SEMPRE com preço/link originais do JSON.
 * Ignora qualquer preço/link vindo da camada de copy.
 */
function montarAnuncioFinal({ copySelecionada, titulo, preco, link }) {
  const copy = String(copySelecionada || '').trim();
  const precoOrig = String(preco).trim();
  const linkOrig = String(link).trim();

  const texto = `🔥 OFERTA DO DIA

${copy}

💰 ${precoOrig}

🛍️ Confira na Shopee:
${linkOrig}`;

  return texto;
}

/**
 * Verifica se o texto final preserva preço e link originais.
 */
function validarAnuncioFinal(textoFinal, { preco, link }) {
  const checks = {
    existe_produto_contexto: true,
    existe_preco: temValor(preco),
    existe_link: temValor(link),
    preco_no_texto: false,
    link_no_texto: false,
    preco_exato: false,
    link_exato: false,
    ia_tentou_preco_extra: false,
    ia_tentou_outro_link: false,
  };

  const texto = String(textoFinal || '');
  const precoOrig = String(preco || '').trim();
  const linkOrig = String(link || '').trim();

  checks.preco_no_texto = texto.includes(precoOrig);
  checks.link_no_texto = texto.includes(linkOrig);
  checks.preco_exato = checks.preco_no_texto;
  checks.link_exato = checks.link_no_texto;

  // Outros R$ além do original
  const precos = texto.match(/R\$\s*[\d.,]+/gi) || [];
  for (const p of precos) {
    if (p.replace(/\s+/g, ' ').trim() !== precoOrig.replace(/\s+/g, ' ').trim()) {
      // pode ser substring; comparar normalizado
      if (!precoOrig.includes(p.replace(/R\$\s*/i, '').trim()) && !p.includes(precoOrig)) {
        checks.ia_tentou_preco_extra = true;
      }
    }
  }

  const urls = texto.match(/https?:\/\/[^\s]+/gi) || [];
  for (const u of urls) {
    if (u !== linkOrig && !linkOrig.startsWith(u) && !u.startsWith(linkOrig.split('?')[0])) {
      checks.ia_tentou_outro_link = true;
    }
  }
  // Deve haver exatamente o link original (pelo menos uma ocorrência)
  if (urls.length === 0) checks.link_exato = false;

  const ok =
    checks.existe_preco &&
    checks.existe_link &&
    checks.preco_exato &&
    checks.link_exato &&
    !checks.ia_tentou_outro_link;

  return { ok, checks };
}

module.exports = {
  validarEntradaProduto,
  validarCopy,
  montarAnuncioFinal,
  validarAnuncioFinal,
  temValor,
};

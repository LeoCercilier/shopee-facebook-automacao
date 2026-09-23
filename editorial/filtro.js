'use strict';

const historico = require('./historico');

function normalizarTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Match por palavra/trecho com limites para evitar falso positivo curto. */
function contemKeyword(texto, lista) {
  const t = normalizarTexto(texto);
  for (const kw of lista || []) {
    const k = normalizarTexto(kw);
    if (!k || k.length < 3) continue;
    if (t.includes(k)) return true;
  }
  return false;
}

function eRelevante(item, paginaCfg) {
  if (item._erro_fonte) return { ok: false, motivo: 'erro_fonte' };
  if (!item.titulo || !item.url) return { ok: false, motivo: 'sem_titulo_ou_url' };

  const titulo = item.titulo;
  const blob = `${item.titulo} ${item.descricao || ''}`;

  if (contemKeyword(blob, paginaCfg.keywords_negativas)) {
    return { ok: false, motivo: 'keyword_negativa' };
  }

  // Fontes marcadas como sempre relevantes (ex.: SBD, Motociclismo Online)
  if (item.sempre_relevante) {
    return { ok: true, motivo: 'fonte_sempre_relevante' };
  }

  // Fontes genéricas (ex.: Folha, Agência Brasil): keyword OBRIGATÓRIA no TÍTULO
  const exigirTitulo =
    item.exigir_keyword_no_titulo !== false; // padrão true para não-sempre_relevante

  if (exigirTitulo) {
    if (contemKeyword(titulo, paginaCfg.keywords_positivas)) {
      return { ok: true, motivo: 'keyword_no_titulo' };
    }
    return { ok: false, motivo: 'fora_do_nicho_titulo' };
  }

  if (contemKeyword(blob, paginaCfg.keywords_positivas)) {
    return { ok: true, motivo: 'keyword_positiva' };
  }

  return { ok: false, motivo: 'fora_do_nicho' };
}

function filtrarElegiveis(itens, paginaCfg, opts = {}) {
  const pageId = paginaCfg.pageId;
  const cooldownHoras = opts.cooldownHoras || 48;
  const elegiveis = [];

  for (const item of itens) {
    if (item._erro_fonte) continue;

    const rel = eRelevante(item, paginaCfg);
    if (!rel.ok) {
      console.log(
        `    ✗ filtro: ${rel.motivo} — ${(item.titulo || '').slice(0, 60)}`
      );
      continue;
    }

    if (historico.jaPublicado(pageId, item.url)) {
      console.log(`    ✗ já publicado nesta Página — ${item.url.slice(0, 70)}`);
      continue;
    }

    if (historico.assuntoRecente(pageId, item.titulo, cooldownHoras)) {
      console.log(`    ✗ assunto recente — ${(item.titulo || '').slice(0, 60)}`);
      continue;
    }

    elegiveis.push({ ...item, motivo_relevancia: rel.motivo });
  }

  return elegiveis;
}

/**
 * Seleciona 1 item: prioridade da fonte (menor número = melhor),
 * depois mais recente; evita repetir a mesma fonte da última vez.
 */
function selecionarUm(elegiveis, paginaCfg) {
  if (!elegiveis.length) return null;

  const ultimaFonte = historico.ultimaFonteUsada(paginaCfg.pageId);

  const ordenados = [...elegiveis].sort((a, b) => {
    const pa = a.fonte_prioridade || 99;
    const pb = b.fonte_prioridade || 99;
    if (pa !== pb) return pa - pb;
    const ta = Date.parse(a.data || '') || 0;
    const tb = Date.parse(b.data || '') || 0;
    return tb - ta;
  });

  if (ultimaFonte) {
    const diferente = ordenados.find((i) => i.fonte_id !== ultimaFonte);
    if (diferente) return diferente;
  }

  return ordenados[0];
}

module.exports = {
  eRelevante,
  filtrarElegiveis,
  selecionarUm,
  normalizarTexto,
  contemKeyword,
};

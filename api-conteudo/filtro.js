'use strict';

const historico = require('./historico');
const { normalizar } = require('./coletor');

function contemKeyword(texto, lista) {
  const t = normalizar(texto);
  for (const kw of lista || []) {
    const k = normalizar(kw);
    if (k && k.length >= 2 && t.includes(k)) return true;
  }
  return false;
}

function eRelevante(item, paginaCfg) {
  if (item._erro_fonte) return { ok: false, motivo: 'erro_fonte' };
  if (!item.titulo) return { ok: false, motivo: 'sem_titulo' };

  const blob = `${item.titulo} ${item.descricao || ''}`;

  if (contemKeyword(blob, paginaCfg.keywords_negativas)) {
    return { ok: false, motivo: 'keyword_negativa' };
  }

  // Fontes com lista positiva vazia (ex.: casa MealDB/Dog/Meteo) passam
  const pos = paginaCfg.keywords_positivas || [];
  if (pos.length === 0) return { ok: true, motivo: 'fonte_nicho_fix' };

  // Wikipedia topics já são pré-selecionados por tópico
  if (item.fonte_id && String(item.fonte_id).startsWith('wiki')) {
    return { ok: true, motivo: 'topico_curado' };
  }

  if (contemKeyword(blob, pos)) {
    return { ok: true, motivo: 'keyword_positiva' };
  }

  return { ok: false, motivo: 'fora_do_nicho' };
}

function filtrarElegiveis(itens, paginaCfg) {
  const elegiveis = [];
  for (const item of itens) {
    if (item._erro_fonte) continue;
    const rel = eRelevante(item, paginaCfg);
    if (!rel.ok) {
      console.log(`    ✗ ${rel.motivo} — ${(item.titulo || '').slice(0, 55)}`);
      continue;
    }
    if (historico.jaPublicado(paginaCfg.pageId, item)) {
      console.log(`    ✗ já publicado — ${(item.titulo || '').slice(0, 55)}`);
      continue;
    }
    elegiveis.push({ ...item, motivo_relevancia: rel.motivo });
  }
  return elegiveis;
}

function selecionarUm(elegiveis, paginaCfg) {
  if (!elegiveis.length) return null;
  const ultima = historico.ultimaFonte(paginaCfg.pageId);

  const ordenados = [...elegiveis].sort((a, b) => {
    const pa = a.fonte_prioridade || 99;
    const pb = b.fonte_prioridade || 99;
    if (pa !== pb) return pa - pb;
    const ta = Date.parse(a.data || '') || 0;
    const tb = Date.parse(b.data || '') || 0;
    return tb - ta;
  });

  if (ultima) {
    const alt = ordenados.find((i) => i.fonte_id !== ultima);
    if (alt) return alt;
  }
  return ordenados[0];
}

module.exports = { eRelevante, filtrarElegiveis, selecionarUm };

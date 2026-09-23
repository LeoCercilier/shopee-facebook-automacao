'use strict';

const historico = require('./historico');

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function contemKeyword(texto, lista) {
  const t = normalizar(texto);
  for (const kw of lista || []) {
    const k = normalizar(kw);
    if (k && k.length >= 2 && t.includes(k)) return true;
  }
  return false;
}

function contarKeywords(texto, lista) {
  const t = normalizar(texto);
  let n = 0;
  for (const kw of lista || []) {
    const k = normalizar(kw);
    if (k && k.length >= 2 && t.includes(k)) n += 1;
  }
  return n;
}

/** Heurística simples: texto majoritariamente em português? */
function parecePortugues(texto) {
  const t = String(texto || '');
  if (!t.trim()) return false;
  // acentos comuns em PT
  if (/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(t)) return true;
  // palavras frequentes em PT
  const pt = [\n    /\bde\b/i,
    /\bda\b/i,
    /\bdo\b/i,
    /\bpara\b/i,
    /\bcom\b/i,
    /\buma\b/i,
    /\bque\b/i,
    /\bnão\b/i,
    /\bsão\b/i,
  ];
  let hits = 0;
  for (const re of pt) if (re.test(t)) hits += 1;
  return hits >= 2;
}

function pareceIngles(texto) {
  const t = String(texto || '');
  const en = [\n    /\bthe\b/i,
    /\band\b/i,
    /\bwith\b/i,
    /\bfrom\b/i,
    /\bthat\b/i,
    /\bthis\b/i,
    /\bhow\b/i,
    /\bwhat\b/i,
    /\byour\b/i,
  ];
  let hits = 0;
  for (const re of en) if (re.test(t)) hits += 1;
  return hits >= 2 && !parecePortugues(t);
}

/**
 * Calcula pontuação 0–100 e lista de motivos.
 */
function pontuar(item, paginaCfg, cfgGlobal = {}) {
  const motivos = [];
  let score = 30; // base neutra

  if (item._erro_fonte || !item.titulo) {
    return { score: 0, motivos: ['sem título ou erro de fonte'], status: 'rejeitado' };
  }

  const titulo = item.titulo;
  const desc = item.descricao || '';
  const blob = `${titulo} ${desc}`;
  const nicho = paginaCfg.nicho;

  // —— Hard reject: keywords negativas ——
  if (contemKeyword(blob, paginaCfg.keywords_negativas)) {
    return {
      score: 5,
      motivos: ['keyword negativa / tema proibido'],
      status: 'rejeitado',
    };
  }

  // Tópicos Wikipedia explicitamente evitados
  if (
    item.id_unico &&
    Array.isArray(paginaCfg.topicos_evitar) &&
    paginaCfg.topicos_evitar.some((t) =>
      normalizar(item.id_unico).includes(normalizar(t).replace(/\s+/g, '_'))
    )
  ) {
    return {
      score: 10,
      motivos: ['tópico na lista de exclusão'],
      status: 'rejeitado',
    };
  }

  // Já publicado
  if (historico.jaPublicado(paginaCfg.pageId, item)) {
    return {
      score: 0,
      motivos: ['já publicado nesta Página'],
      status: 'rejeitado',
    };
  }

  // Keywords positivas no título (peso alto)
  const kwTitulo = contarKeywords(titulo, paginaCfg.keywords_positivas);
  if (kwTitulo >= 1) {
    score += 18;
    motivos.push(`+${18} keyword no título (${kwTitulo})`);
  }
  const kwFortes = contarKeywords(titulo, paginaCfg.keywords_fortes || []);
  if (kwFortes >= 1) {
    score += 15;
    motivos.push(`+15 keyword forte no título`);
  }

  // Keywords na descrição
  const kwDesc = contarKeywords(desc, paginaCfg.keywords_positivas);
  if (kwDesc >= 1) {
    score += Math.min(12, kwDesc * 4);
    motivos.push(`+keywords na descrição (${kwDesc})`);
  }

  // Fonte adequada
  if (item.fonte_id === 'hacker-news' && nicho === 'marketing') {
    score += 8;
    motivos.push('+fonte HN ok para marketing');
  }
  if (item.fonte_id === 'spaceflight-news' && nicho === 'marketing') {
    // exige conexão com tech/IA/inovação
    if (
      contemKeyword(blob, [
        'ai',
        'artificial',
        'satellite',
        'innovation',
        'technology',
        'software',
        'startup',
        'commercial',
      ])
    ) {
      score += 6;
      motivos.push('+spaceflight com ângulo tech');
    } else {
      score -= 25;
      motivos.push('-spaceflight sem ângulo de negócio/tech');
    }
  }
  if (String(item.fonte_id || '').startsWith('wiki')) {
    if (parecePortugues(desc) || parecePortugues(titulo)) {
      score += 12;
      motivos.push('+Wikipedia em português');
    }
    // título só com uma palavra genérica (ex: "Pele", "Cosmético")
    if (titulo.trim().split(/\s+/).length <= 1 && desc.length < 80) {
      score -= 20;
      motivos.push('-título genérico / pouco contexto');
    }
  }

  // TheMealDB
  if (item.fonte_id === 'themealdb') {
    if (pareceIngles(titulo) && !item.titulo_pt) {
      score -= 15;
      motivos.push('-título em inglês sem tradução');
    }
    if (item.titulo_pt) {
      score += 12;
      motivos.push('+título traduzido');
    }
    if (item.imagem) {
      score += 8;
      motivos.push('+imagem de receita');
    }
    // categorias menos interessantes
    if (contemKeyword(desc, ['beef', 'lamb', 'goat', 'miscellaneous'])) {
      score -= 5;
      motivos.push('-categoria menos atrativa');
    }
  }

  // Open-Meteo: só se houver “dica de casa”
  if (item.fonte_id === 'open-meteo') {
    if (item.dica_casa) {
      score += 20;
      motivos.push('+dica climática útil para casa');
    } else {
      score -= 30;
      motivos.push('-clima sem aplicação prática');
    }
  }

  // Dog CEO desativado via config; se aparecer, baixa nota
  if (item.fonte_id === 'dog-ceo') {
    score -= 10;
    motivos.push('-pet aleatório (baixa prioridade editorial)');
  }

  // Imagem
  if (item.imagem && /^https?:\/\//i.test(item.imagem)) {
    score += 5;
    motivos.push('+tem imagem');
  }

  // Recência (quando houver data)
  if (item.data) {
    const ageH = (Date.now() - Date.parse(item.data)) / 3600000;
    if (Number.isFinite(ageH) && ageH >= 0 && ageH < 72) {
      score += 8;
      motivos.push('+conteúdo recente (<72h)');
    } else if (ageH > 24 * 30) {
      score -= 8;
      motivos.push('-conteúdo antigo');
    }
  }

  // Idioma para Marketing (fontes EN ok se tema forte)
  if (nicho === 'marketing' && pareceIngles(titulo)) {
    if (kwFortes >= 1 || kwTitulo >= 1) {
      score += 0;
      motivos.push('título EN aceito com keyword forte');
    } else {
      score -= 20;
      motivos.push('-título EN sem keyword de nicho');
    }
  }

  // Penalidade título muito curto / sensacionalista
  if (titulo.length < 12) {
    score -= 10;
    motivos.push('-título muito curto');
  }
  if (/!$/.test(titulo) || /\b(shock|killed|dead)\b/i.test(titulo)) {
    score -= 15;
    motivos.push('-tom sensacionalista');
  }

  // Marketing: exigir keyword forte OU 2 positivas
  if (nicho === 'marketing') {
    if (kwFortes < 1 && kwTitulo < 2) {
      score -= 25;
      motivos.push('-pouca relação com IA/negócios/marketing');
    }
  }

  // Rota: exigir relação clara com moto
  if (nicho === 'motociclismo') {
    if (!contemKeyword(blob, paginaCfg.keywords_positivas)) {
      score -= 30;
      motivos.push('-sem relação clara com motocicletas');
    }
    if (contemKeyword(titulo, ['motor de combustão', 'combustao interna'])) {
      score -= 40;
      motivos.push('-tema genérico de motor, não moto');
    }
  }

  // Beleza: preferir skincare prático
  if (nicho === 'beleza') {
    if (contemKeyword(blob, ['filtro solar', 'protetor', 'acne', 'hidrata', 'retinol', 'melasma'])) {
      score += 10;
      motivos.push('+tema skincare prático');
    }
    if (contemKeyword(blob, ['doença', 'hospital', 'diagnóstico'])) {
      score -= 20;
      motivos.push('-tom médico/hospitalar');
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const min =
    typeof cfgGlobal.pontuacao_minima_publicacao === 'number'
      ? cfgGlobal.pontuacao_minima_publicacao
      : 75;

  let status = 'rejeitado';
  if (score >= min) status = 'aprovado';
  else if (score >= 60) status = 'candidato_fraco';

  return { score, motivos, status, minima: min };
}

function avaliarItens(itens, paginaCfg, cfgGlobal = {}) {
  const avaliados = [];
  for (const item of itens) {
    if (item._erro_fonte) continue;
    const p = pontuar(item, paginaCfg, cfgGlobal);
    avaliados.push({
      ...item,
      pontuacao: p.score,
      motivos_pontuacao: p.motivos,
      status_curadoria: p.status,
      pontuacao_minima: p.minima,
    });
  }
  return avaliados.sort((a, b) => b.pontuacao - a.pontuacao);
}

function filtrarElegiveis(itens, paginaCfg, cfgGlobal = {}) {
  const avaliados = avaliarItens(itens, paginaCfg, cfgGlobal);
  const min =
    typeof cfgGlobal.pontuacao_minima_publicacao === 'number'
      ? cfgGlobal.pontuacao_minima_publicacao
      : 75;
  return avaliados.filter((i) => i.pontuacao >= min);
}

function selecionarUm(elegiveis, paginaCfg) {
  if (!elegiveis.length) return null;
  const ultima = historico.ultimaFonte(paginaCfg.pageId);
  const ordenados = [...elegiveis].sort((a, b) => {
    if (b.pontuacao !== a.pontuacao) return b.pontuacao - a.pontuacao;
    const pa = a.fonte_prioridade || 99;
    const pb = b.fonte_prioridade || 99;
    return pa - pb;
  });
  if (ultima) {
    const alt = ordenados.find((i) => i.fonte_id !== ultima && i.pontuacao >= 75);
    if (alt) return alt;
  }
  return ordenados[0];
}

module.exports = {
  pontuar,
  avaliarItens,
  filtrarElegiveis,
  selecionarUm,
  normalizar,
  parecePortugues,
  pareceIngles,
};

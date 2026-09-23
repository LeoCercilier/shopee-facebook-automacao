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

function parecePortugues(texto) {
  const t = String(texto || '');
  if (!t.trim()) return false;
  if (/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(t)) return true;
  const palavras = [' de ', ' da ', ' do ', ' para ', ' com ', ' uma ', ' que ', ' não ', ' são '];
  const low = ` ${t.toLowerCase()} `;
  let hits = 0;
  for (const p of palavras) if (low.includes(p)) hits += 1;
  return hits >= 2;
}

function pareceIngles(texto) {
  const t = String(texto || '');
  const palavras = [' the ', ' and ', ' with ', ' from ', ' that ', ' this ', ' how ', ' what ', ' your '];
  const low = ` ${t.toLowerCase()} `;
  let hits = 0;
  for (const p of palavras) if (low.includes(p)) hits += 1;
  return hits >= 2 && !parecePortugues(t);
}

function pontuar(item, paginaCfg, cfgGlobal = {}) {
  const motivos = [];
  let score = 30;

  if (item._erro_fonte || !item.titulo) {
    return { score: 0, motivos: ['sem título ou erro de fonte'], status: 'rejeitado' };
  }

  const titulo = item.titulo;
  const desc = item.descricao || '';
  const blob = `${titulo} ${desc}`;
  const nicho = paginaCfg.nicho;

  if (contemKeyword(blob, paginaCfg.keywords_negativas)) {
    return {
      score: 5,
      motivos: ['keyword negativa / tema proibido'],
      status: 'rejeitado',
    };
  }

  if (
    item.id_unico &&
    Array.isArray(paginaCfg.topicos_evitar) &&
    paginaCfg.topicos_evitar.some((t) =>
      normalizar(item.id_unico).includes(normalizar(String(t).replace(/\s+/g, '_')))
    )
  ) {
    return {
      score: 10,
      motivos: ['tópico na lista de exclusão'],
      status: 'rejeitado',
    };
  }

  if (historico.jaPublicado(paginaCfg.pageId, item)) {
    return {
      score: 0,
      motivos: ['já publicado nesta Página'],
      status: 'rejeitado',
    };
  }

  const kwTitulo = contarKeywords(titulo, paginaCfg.keywords_positivas);
  if (kwTitulo >= 1) {
    score += 18;
    motivos.push(`+keyword no título (${kwTitulo})`);
  }
  const kwFortes = contarKeywords(titulo, paginaCfg.keywords_fortes || []);
  if (kwFortes >= 1) {
    score += 15;
    motivos.push('+keyword forte no título');
  }

  const kwDesc = contarKeywords(desc, paginaCfg.keywords_positivas);
  if (kwDesc >= 1) {
    score += Math.min(12, kwDesc * 4);
    motivos.push(`+keywords na descrição (${kwDesc})`);
  }

  if (item.fonte_id === 'hacker-news' && nicho === 'marketing') {
    score += 8;
    motivos.push('+fonte HN');
  }
  if (item.fonte_id === 'spaceflight-news' && nicho === 'marketing') {
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
      motivos.push('-spaceflight sem ângulo tech/negócio');
    }
  }

  if (String(item.fonte_id || '').startsWith('wiki')) {
    if (parecePortugues(desc) || parecePortugues(titulo)) {
      score += 12;
      motivos.push('+Wikipedia em português');
    }
    if (titulo.trim().split(/\s+/).length <= 1 && desc.length < 100) {
      score -= 20;
      motivos.push('-título genérico / pouco contexto');
    }
  }

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
  }

  if (item.fonte_id === 'open-meteo') {
    if (item.dica_casa) {
      score += 25;
      motivos.push('+dica climática útil para casa');
    } else {
      score -= 30;
      motivos.push('-clima sem aplicação prática');
    }
  }

  if (item.fonte_id === 'dog-ceo') {
    score -= 15;
    motivos.push('-pet aleatório (baixa prioridade)');
  }

  if (item.imagem && /^https?:\/\//i.test(item.imagem)) {
    score += 5;
    motivos.push('+tem imagem');
  }

  if (item.data) {
    const ageH = (Date.now() - Date.parse(item.data)) / 3600000;
    if (Number.isFinite(ageH) && ageH >= 0 && ageH < 72) {
      score += 8;
      motivos.push('+recente (<72h)');
    } else if (ageH > 24 * 30) {
      score -= 8;
      motivos.push('-conteúdo antigo');
    }
  }

  if (nicho === 'marketing' && pareceIngles(titulo)) {
    if (kwFortes < 1 && kwTitulo < 1) {
      score -= 20;
      motivos.push('-título EN sem keyword de nicho');
    }
  }

  if (titulo.length < 12) {
    score -= 10;
    motivos.push('-título muito curto');
  }
  if (/\b(shock|killed|dead|attack)\b/i.test(titulo)) {
    score -= 15;
    motivos.push('-tom sensacionalista');
  }

  if (nicho === 'marketing') {
    if (kwFortes < 1 && kwTitulo < 2) {
      score -= 25;
      motivos.push('-pouca relação com IA/negócios/marketing');
    }
  }

  if (nicho === 'motociclismo') {
    if (!contemKeyword(blob, paginaCfg.keywords_positivas)) {
      score -= 30;
      motivos.push('-sem relação clara com motocicletas');
    }
    if (contemKeyword(titulo, ['motor de combustão', 'combustao interna'])) {
      score -= 40;
      motivos.push('-tema genérico de motor');
    }
  }

  if (nicho === 'beleza') {
    if (
      contemKeyword(blob, [
        'filtro solar',
        'protetor',
        'acne',
        'hidrata',
        'retinol',
        'melasma',
        'niacinamida',
      ])
    ) {
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
    return (a.fonte_prioridade || 99) - (b.fonte_prioridade || 99);
  });
  if (ultima) {
    const alt = ordenados.find((i) => i.fonte_id !== ultima);
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

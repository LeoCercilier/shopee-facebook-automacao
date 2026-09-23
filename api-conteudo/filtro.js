'use strict';

const historico = require('./historico');

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchKeyword(textoNorm, kwNorm) {
  if (!kwNorm || kwNorm.length < 2) return false;
  if (kwNorm.includes(' ')) return textoNorm.includes(kwNorm);
  const re = new RegExp(
    `(^|[^a-z0-9])${kwNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
    'i'
  );
  return re.test(textoNorm);
}

function contemKeyword(texto, lista) {
  const t = normalizar(texto);
  for (const kw of lista || []) {
    if (matchKeyword(t, normalizar(kw))) return true;
  }
  return false;
}

function contarKeywords(texto, lista) {
  const t = normalizar(texto);
  let n = 0;
  for (const kw of lista || []) {
    if (matchKeyword(t, normalizar(kw))) n += 1;
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

/** Marcadores típicos de espanhol (não confundir com PT). */
function pareceEspanhol(texto) {
  const low = ` ${normalizar(texto)} `;
  const marcadores = [
    ' el ', ' los ', ' las ', ' del ',
    ' cual ', ' cuales ', ' senala ', ' senalan ',
    ' gane ', ' gano ', ' mundial de ',
    ' segun ', ' tambien ', ' despues ',
    ' motocicletas ', ' novedad ',
  ];
  let hits = 0;
  for (const m of marcadores) {
    if (low.includes(m)) hits += 1;
  }
  // ñ sozinho não basta (pode aparecer em nomes), mas com artigo ES sim
  if (/\bñ|ñ/.test(String(texto || '')) && hits >= 1) hits += 1;
  return hits >= 2;
}

function temLixoMarkup(texto) {
  const t = String(texto || '');
  if (/<!\[CDATA\[|\]\]>|<!\[CDATA/i.test(t)) return true;
  if (/<\/?[a-z][^>]*>/i.test(t)) return true;
  if (/<|>|&nbsp;/i.test(t)) return true;
  return false;
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
  const fid = item.fonte_id || '';

  if (temLixoMarkup(titulo) || temLixoMarkup(desc)) {
    return { score: 3, motivos: ['título/descrição com CDATA ou HTML residual'], status: 'rejeitado' };
  }

  // Notícias em espanhol não devem ir direto ao feed em PT-BR
  if (pareceEspanhol(titulo) || pareceEspanhol(desc)) {
    return { score: 12, motivos: ['conteúdo em espanhol (não adaptável automaticamente)'], status: 'rejeitado' };
  }

  if (contemKeyword(blob, paginaCfg.keywords_negativas)) {
    return { score: 5, motivos: ['keyword negativa / tema proibido'], status: 'rejeitado' };
  }

  if (
    contemKeyword(blob, [
      'ravens', 'saints', 'nfl', 'nba', 'soccer', 'football game', 'vs.', ' vs ',
    ])
  ) {
    return { score: 8, motivos: ['conteúdo esportivo'], status: 'rejeitado' };
  }

  if (
    item.id_unico &&
    Array.isArray(paginaCfg.topicos_evitar) &&
    paginaCfg.topicos_evitar.some((t) =>
      normalizar(item.id_unico).includes(normalizar(String(t).replace(/\s+/g, '_')))
    )
  ) {
    return { score: 10, motivos: ['tópico na lista de exclusão'], status: 'rejeitado' };
  }

  if (historico.jaPublicado(paginaCfg.pageId, item)) {
    return { score: 0, motivos: ['já publicado nesta Página'], status: 'rejeitado' };
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

  if (fid === 'devto' && nicho === 'marketing') {
    score += 14;
    motivos.push('+DEV.to (fonte prioritária)');
  }
  if (fid === 'freenews-biz' && nicho === 'marketing') {
    score += 10;
    motivos.push('+FreeNews negócios');
  }
  if (fid === 'hacker-news' && nicho === 'marketing') {
    score += 4;
    motivos.push('+HN secundário');
  }
  if (fid === 'open-beauty' && nicho === 'beleza') {
    score += 16;
    motivos.push('+Open Beauty Facts');
    if (contemKeyword(blob, ['protetor', 'solar', 'sunscreen', 'fps', 'hidrat'])) {
      score += 8;
      motivos.push('+produto skincare claro');
    }
  }
  if (fid === 'taco' && nicho === 'casa') {
    score += 22;
    motivos.push('+TACO em português');
    if (parecePortugues(titulo)) {
      score += 10;
      motivos.push('+título PT');
    }
  }
  if (fid === 'freenews-moto' && nicho === 'motociclismo') {
    score += 12;
    motivos.push('+FreeNews motos');
  }

  if (String(fid).startsWith('wiki')) {
    if (parecePortugues(desc) || parecePortugues(titulo)) {
      score += 12;
      motivos.push('+Wikipedia PT');
    }
    if (titulo.trim().split(/\s+/).length <= 1 && desc.length < 100) {
      score -= 15;
      motivos.push('-título genérico');
    }
  }

  if (fid === 'open-meteo') {
    if (item.dica_casa) {
      score += 25;
      motivos.push('+dica climática útil');
    } else {
      score -= 30;
      motivos.push('-clima sem dica');
    }
  }

  if (item.imagem && /^https?:\/\//i.test(item.imagem)) {
    score += 5;
    motivos.push('+imagem');
  }

  if (item.data) {
    const ageH = (Date.now() - Date.parse(item.data)) / 3600000;
    if (Number.isFinite(ageH) && ageH >= 0 && ageH < 72) {
      score += 8;
      motivos.push('+recente');
    } else if (ageH > 24 * 30) {
      score -= 8;
      motivos.push('-antigo');
    }
  }

  if (nicho === 'marketing' && pareceIngles(titulo) && kwFortes < 1 && kwTitulo < 1) {
    score -= 20;
    motivos.push('-EN sem keyword de nicho');
  }

  if (titulo.length < 12) {
    score -= 10;
    motivos.push('-título curto');
  }
  if (/\b(shock|killed|dead|attack|missile)\b/i.test(titulo)) {
    score -= 20;
    motivos.push('-tom sensacionalista');
  }

  if (nicho === 'marketing' && kwFortes < 1 && kwTitulo < 2) {
    score -= 25;
    motivos.push('-pouca relação IA/negócios');
  }

  if (nicho === 'motociclismo') {
    if (!contemKeyword(blob, paginaCfg.keywords_positivas)) {
      score -= 30;
      motivos.push('-sem relação com motos');
    }
  }

  if (nicho === 'beleza') {
    if (
      contemKeyword(blob, [
        'filtro solar', 'protetor', 'acne', 'hidrata', 'retinol',
        'melasma', 'niacinamida', 'sunscreen', 'fps',
      ])
    ) {
      score += 10;
      motivos.push('+skincare prático');
    }
  }

  if (nicho === 'casa' && fid === 'taco') {
    // ok
  } else if (nicho === 'casa' && fid !== 'open-meteo' && fid !== 'taco') {
    if (!contemKeyword(blob, paginaCfg.keywords_positivas) && !parecePortugues(titulo)) {
      score -= 15;
      motivos.push('-pouca relação com casa');
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
  pareceEspanhol,
  temLixoMarkup,
};

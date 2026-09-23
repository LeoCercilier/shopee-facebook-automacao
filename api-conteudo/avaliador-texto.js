'use strict';

const { pareceIngles, parecePortugues, normalizar } = require('./filtro');

/** Palavras técnicas demais para Marketing Tips (público geral). */
const JARGAO_TECNICO = [
  'devsecops', 'kubernetes', 'k8s', 'terraform', 'ci/cd', 'pipeline',
  'microservice', 'graphql', 'websocket', 'container orchestration',
  'yaml', 'dockerfile', 'helm chart', 'istio', 'sre ',
];

const PROMOCIONAL = [
  'compre agora', 'garanta o seu', 'melhor produto', 'oferta imperdível',
  'clique aqui', 'promoção', 'desconto exclusivo', 'imperdível',
];

const IDIOMA_ESTRANGEIRO = [
  /\bthe\b/i, /\band\b/i, /\bwith\b/i, /\bfrom\b/i,
  /\bper\b/i, /\bche\b/i, /\bdella\b/i, /\bsono\b/i,
];

function contarHits(texto, lista) {
  const t = normalizar(texto);
  let n = 0;
  for (const kw of lista) {
    if (t.includes(normalizar(kw))) n += 1;
  }
  return n;
}

/**
 * Avalia o TEXTO FINAL do post (0–100).
 * Aprovação final exige score >= minimaTexto (padrão 80).
 */
function avaliarTextoFinal({ post, item, paginaCfg, cfgGlobal = {} }) {
  const motivos = [];
  let score = 50;
  const texto = (post && post.texto) || '';
  const corpo = texto
    .split('\n')
    .filter((l) => l && !/^(💡|✨|🏍️|🏠|🔎|Fonte:|Atribuição:)/i.test(l.trim()))
    .join(' ');
  const nicho = paginaCfg.nicho;
  const minima =
    typeof cfgGlobal.pontuacao_minima_texto === 'number'
      ? cfgGlobal.pontuacao_minima_texto
      : 80;

  if (!texto || texto.length < 40) {
    return {
      score: 0,
      status: 'rejeitado',
      motivos: ['texto ausente ou muito curto'],
      minima,
    };
  }

  // REGRA: proibir links externos (só Shopee pode ter link de produto)
  if (/https?:\/\//i.test(texto) || /saiba mais/i.test(texto)) {
    score -= 40;
    motivos.push('-link externo no texto (só Shopee pode ter link)');
  }

  // Português natural
  if (parecePortugues(corpo)) {
    score += 18;
    motivos.push('+português detectado');
  } else if (pareceIngles(corpo)) {
    score -= 35;
    motivos.push('-texto ainda em inglês');
  } else {
    score -= 15;
    motivos.push('-idioma incerto');
  }

  // Residual EN/IT em excesso no corpo
  let estrang = 0;
  for (const re of IDIOMA_ESTRANGEIRO) {
    if (re.test(corpo)) estrang += 1;
  }
  if (estrang >= 3) {
    score -= 25;
    motivos.push('-muito residual em idioma estrangeiro');
  } else if (estrang >= 1 && pareceIngles(corpo)) {
    score -= 10;
    motivos.push('-traços de inglês');
  }

  // Jargão técnico (Marketing)
  if (nicho === 'marketing') {
    const jar = contarHits(corpo + ' ' + (post.titulo || ''), JARGAO_TECNICO);
    if (jar >= 2) {
      score -= 30;
      motivos.push('-jargão técnico excessivo para o público');
    } else if (jar === 1) {
      score -= 12;
      motivos.push('-termo técnico presente');
    } else {
      score += 8;
      motivos.push('+linguagem acessível');
    }
  }

  // Propaganda (Studio / geral)
  if (contarHits(texto, PROMOCIONAL) > 0) {
    score -= 40;
    motivos.push('-tom promocional/propaganda');
  }

  // Open Beauty: não parecer catálogo
  if (item.fonte_id === 'open-beauty') {
    if (/\b(compre|garanta|oferta|desconto)\b/i.test(texto)) {
      score -= 30;
      motivos.push('-parece propaganda de produto');
    }
    if (/fps|protetor|solar|pele|hidrat/i.test(corpo)) {
      score += 12;
      motivos.push('+informação útil de skincare');
    } else {
      score -= 15;
      motivos.push('-produto sem dica educativa clara');
    }
  }

  // Relação título × nicho × descrição
  const blobFonte = `${item.titulo || ''} ${item.descricao || ''}`;
  const blobPost = `${post.titulo || ''} ${corpo}`;
  const pos = paginaCfg.keywords_positivas || [];
  const fortes = paginaCfg.keywords_fortes || [];

  let relFonte = 0;
  for (const kw of fortes) {
    if (normalizar(blobFonte).includes(normalizar(kw))) relFonte += 2;
  }
  for (const kw of pos) {
    if (normalizar(blobFonte).includes(normalizar(kw))) relFonte += 1;
  }

  if (relFonte === 0 && nicho !== 'casa') {
    score -= 25;
    motivos.push('-fonte sem relação clara com o nicho');
  } else if (relFonte >= 2) {
    score += 10;
    motivos.push('+fonte alinhada ao nicho');
  }

  // Incompatibilidade título vs conteúdo da fonte
  if (nicho === 'motociclismo') {
    const temMoto = /moto|motocicl|helmet|capacete|scooter|motogp/i.test(blobFonte);
    if (!temMoto) {
      score -= 40;
      motivos.push('-título/fonte incompatível com motos');
    }
  }
  if (nicho === 'marketing') {
    const temTema = /ai|inteligencia|startup|marketing|ecommerce|produtiv|negoci|ferramenta|automat/i.test(
      normalizar(blobFonte)
    );
    if (!temTema && relFonte < 2) {
      score -= 20;
      motivos.push('-pouca utilidade real para Marketing Tips');
    }
  }

  // Casa: ser rigoroso
  if (nicho === 'casa') {
    const util = /limp|organiza|decor|jardin|cozinha|culin|casa|umidade|mofo|arm[aá]rio/i.test(
      normalizar(blobPost + ' ' + blobFonte)
    );
    if (!util && item.fonte_id !== 'taco') {
      score -= 25;
      motivos.push('-pouca utilidade doméstica prática');
    }
    if (item.fonte_id === 'taco' && /kcal|prote|fibra|alimento/i.test(corpo)) {
      score += 15;
      motivos.push('+curiosidade alimentar útil');
    }
  }

  // Clareza / não robótico
  if (corpo.length >= 80 && corpo.length <= 450) {
    score += 8;
    motivos.push('+tamanho adequado');
  }
  if (/tema em evidência|leitura útil para quem acompanha/i.test(corpo)) {
    score -= 12;
    motivos.push('-texto genérico/robótico');
  }

  // Atribuição sem link
  if (/fonte:/i.test(texto)) {
    score += 5;
    motivos.push('+atribuição presente');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let status = 'rejeitado';
  if (score >= minima) status = 'aprovado';
  else if (score >= 60) status = 'fraco';

  return { score, status, motivos, minima };
}

module.exports = { avaliarTextoFinal };

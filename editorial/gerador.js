'use strict';

/**
 * Gera texto ORIGINAL curto a partir de metadados (título/URL).
 * NÃO copia description/content:encoded para o post.
 */

function limparTitulo(titulo) {
  return String(titulo || '')
    .replace(/\s+/g, ' ')
    .replace(/[|–—].*$/, (m) => (m.length > 40 ? '' : m))
    .trim();
}

function primeiroTema(titulo) {
  const t = limparTitulo(titulo);
  if (t.length <= 120) return t;
  return t.slice(0, 117).replace(/\s+\S*$/, '') + '…';
}

const ABERTURAS = {
  marketing: [
    'Vale a pena prestar atenção neste ponto do mercado digital:',
    'Uma leitura útil para quem vende online ou gerencia um negócio:',
    'Para quem acompanha marketing e e-commerce, este tema está em evidência:',
  ],
  beleza: [
    'Informação educativa sobre cuidados com a pele e bem-estar:',
    'Um tema relevante para quem se interessa por autocuidado (sem substituir orientação profissional):',
    'Conteúdo de referência sobre saúde da pele e cuidados pessoais:',
  ],
  motociclismo: [
    'Atualização do universo das duas rodas:',
    'Para quem acompanha motos, segurança e acessórios:',
    'Destaque do dia no motociclismo:',
  ],
  casa: [
    'Ideia prática para deixar a casa mais funcional:',
    'Sugestão útil de organização e utilidades domésticas:',
    'Para quem gosta de casa, decoração e praticidade no dia a dia:',
  ],
};

function escolherAbertura(nicho, seed) {
  const lista = ABERTURAS[nicho] || ABERTURAS.marketing;
  const idx = Math.abs(Number(seed) || 0) % lista.length;
  return lista[idx];
}

function hashSimples(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

/**
 * Monta o post final. description só influencia o tom internamente
 * (não é colada no texto publicado).
 */
function gerarPost({ item, paginaCfg }) {
  const tituloRef = primeiroTema(item.titulo);
  const abertura = escolherAbertura(paginaCfg.nicho, hashSimples(item.url));
  const fonteNome = item.fonte_nome || 'Fonte';
  const emoji = paginaCfg.emoji || '📌';
  const rotulo = paginaCfg.rotulo || 'CONTEÚDO';

  let corpo;
  if (paginaCfg.nicho === 'beleza') {
    corpo =
      `${abertura}\n\n` +
      `O material "${tituloRef}" traz informações para reflexão sobre cuidados pessoais. ` +
      `Não substitui consulta com profissional de saúde.`;
  } else if (paginaCfg.nicho === 'motociclismo') {
    corpo =
      `${abertura}\n\n` +
      `O destaque "${tituloRef}" pode interessar quem acompanha motos, manutenção ou segurança no trânsito.`;
  } else if (paginaCfg.nicho === 'casa') {
    corpo =
      `${abertura}\n\n` +
      `O tema "${tituloRef}" reúne ideias ligadas à organização, decoração ou utilidades para o dia a dia.`;
  } else {
    corpo =
      `${abertura}\n\n` +
      `O conteúdo "${tituloRef}" aborda pontos que podem ajudar na gestão de vendas, marketing ou negócios digitais.`;
  }

  // Garantir tamanho ~300–600 caracteres no bloco principal (sem URL)
  if (corpo.length > 520) {
    corpo = corpo.slice(0, 500).replace(/\s+\S*$/, '') + '.';
  }

  const texto = [
    `${emoji} ${rotulo}`,
    '',
    corpo,
    '',
    'Confira a matéria completa:',
    item.url,
    '',
    `Fonte: ${fonteNome}`,
  ].join('\n');

  return {
    texto,
    titulo_referencia: tituloRef,
    url: item.url,
    imagem: item.imagem || '',
    fonte_id: item.fonte_id,
    fonte_nome: fonteNome,
  };
}

function validarPost(post) {
  if (!post || !post.texto || !post.url) {
    return { ok: false, motivo: 'texto_ou_url_ausente' };
  }
  if (post.texto.length < 80) {
    return { ok: false, motivo: 'texto_muito_curto' };
  }
  if (!post.texto.includes(post.url)) {
    return { ok: false, motivo: 'url_nao_consta_no_texto' };
  }
  if (!/fonte:/i.test(post.texto)) {
    return { ok: false, motivo: 'sem_atribuicao' };
  }
  // Recusar se colou description longa (>120 chars iguais)
  return { ok: true };
}

module.exports = { gerarPost, validarPost, limparTitulo };

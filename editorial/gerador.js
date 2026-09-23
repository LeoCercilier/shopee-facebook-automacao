'use strict';

/**
 * Gera texto ORIGINAL curto a partir de metadados (título/URL).
 * NÃO copia description/content:encoded para o post.
 */

function limparTitulo(titulo) {
  return String(titulo || '')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function primeiroTema(titulo) {
  const t = limparTitulo(titulo);
  if (t.length <= 110) return t;
  return t.slice(0, 107).replace(/\s+\S*$/, '') + '…';
}

function hashSimples(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

function gerarPost({ item, paginaCfg }) {
  const tituloRef = primeiroTema(item.titulo);
  const fonteNome = item.fonte_nome || 'Fonte';
  const emoji = paginaCfg.emoji || '📌';
  const rotulo = paginaCfg.rotulo || 'CONTEÚDO';
  const url = item.url;

  let corpo;
  const seed = Math.abs(hashSimples(item.url)) % 3;

  if (paginaCfg.nicho === 'beleza') {
    const aberturas = [
      `A matéria "${tituloRef}" traz um ponto importante sobre saúde da pele e autocuidado.`,
      `Vale conferir: "${tituloRef}" — conteúdo educativo sobre cuidados pessoais e bem-estar da pele.`,
      `Sobre pele e autocuidado: "${tituloRef}". Informação para reflexão, sem substituir orientação profissional.`,
    ];
    corpo =
      aberturas[seed] +
      (seed === 2 ? '' : ' Não substitui consulta com dermatologista ou outro profissional de saúde.');
  } else if (paginaCfg.nicho === 'motociclismo') {
    const aberturas = [
      `No universo das duas rodas: "${tituloRef}".`,
      `Destaque para quem acompanha motos e acessórios: "${tituloRef}".`,
      `Atualização do motociclismo: "${tituloRef}".`,
    ];
    corpo = aberturas[seed];
  } else if (paginaCfg.nicho === 'casa') {
    const aberturas = [
      `Para a casa ficar mais prática: "${tituloRef}".`,
      `Ideia de organização e utilidades: "${tituloRef}".`,
      `Sugestão para o lar: "${tituloRef}".`,
    ];
    corpo = aberturas[seed];
  } else {
    const aberturas = [
      `Para quem acompanha negócios e marketing digital: "${tituloRef}".`,
      `Leitura útil sobre o mercado: "${tituloRef}".`,
      `Tema em evidência no empreendedorismo digital: "${tituloRef}".`,
    ];
    corpo = aberturas[seed];
  }

  if (corpo.length > 480) {
    corpo = corpo.slice(0, 460).replace(/\s+\S*$/, '') + '.';
  }

  const texto = [
    `${emoji} ${rotulo}`,
    '',
    corpo,
    '',
    'Confira a matéria completa:',
    url,
    '',
    `Fonte: ${fonteNome}`,
  ].join('\n');

  return {
    texto,
    titulo_referencia: tituloRef,
    url,
    imagem: item.imagem || '',
    fonte_id: item.fonte_id,
    fonte_nome: fonteNome,
  };
}

function validarPost(post) {
  if (!post || !post.texto || !post.url) {
    return { ok: false, motivo: 'texto_ou_url_ausente' };
  }
  if (post.texto.length < 60) {
    return { ok: false, motivo: 'texto_muito_curto' };
  }
  if (!post.texto.includes(post.url)) {
    return { ok: false, motivo: 'url_nao_consta_no_texto' };
  }
  if (!/fonte:/i.test(post.texto)) {
    return { ok: false, motivo: 'sem_atribuicao' };
  }
  if (/\uFFFD|��/.test(post.texto)) {
    return { ok: false, motivo: 'encoding_quebrado' };
  }
  if (/redir\.folha\.com\.br/i.test(post.url)) {
    return { ok: false, motivo: 'url_redirect_folha' };
  }
  return { ok: true };
}

module.exports = { gerarPost, validarPost, limparTitulo };

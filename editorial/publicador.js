'use strict';

/**
 * Publicação em Facebook Pages via Graph API.
 * Reutiliza o mesmo padrão de autenticação do modulo3.js
 * (System User Token → Page Access Token).
 * Nunca loga o token.
 */

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

function exigirToken() {
  const valor = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!valor || !String(valor).trim()) {
    throw new Error(
      'FACEBOOK_PAGE_ACCESS_TOKEN não definida. Configure o Secret no GitHub Actions.'
    );
  }
  return String(valor).trim();
}

async function obterTokenDaPagina(pageId, tokenSecret) {
  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
    );
    url.searchParams.set('fields', 'id,name,access_token,tasks');
    url.searchParams.set('limit', '100');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenSecret}` },
    });
    const data = await res.json();

    if (res.ok && Array.isArray(data.data)) {
      const page = data.data.find((p) => String(p.id) === String(pageId));
      if (page && page.access_token) {
        console.log('  Token da Página obtido via /me/accounts.');
        return page.access_token;
      }
    } else if (data.error) {
      console.log(
        '  Aviso: /me/accounts:',
        data.error.message || 'erro'
      );
    }
  } catch (err) {
    console.log('  Aviso: falha em /me/accounts:', err.message);
  }

  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}`
    );
    url.searchParams.set('fields', 'id,name,access_token');
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenSecret}` },
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      console.log('  Token da Página obtido via /{page-id}.');
      return data.access_token;
    }
  } catch (err) {
    console.log('  Aviso: falha ao consultar Página:', err.message);
  }

  console.log('  Usando token do Secret diretamente para publicar.');
  return tokenSecret;
}

async function postarFeed({ pageId, accessToken, message, link }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;
  const params = { message, published: 'true' };
  if (link) params.link = link;
  const body = new URLSearchParams(params);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }
  return { tipo: 'feed', post_id: data.id || null, raw: data };
}

async function postarFoto({ pageId, accessToken, imageUrl, caption }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`;
  const body = new URLSearchParams({
    url: imageUrl,
    caption,
    published: 'true',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }
  return {
    tipo: 'photo',
    post_id: data.post_id || data.id || null,
    raw: data,
  };
}

async function publicarNaPagina({ pageId, texto, link, imagem }) {
  const tokenSecret = exigirToken();
  const accessToken = await obterTokenDaPagina(pageId, tokenSecret);

  if (imagem && /^https?:\/\//i.test(imagem)) {
    try {
      console.log('  Tentando /photos ...');
      return await postarFoto({
        pageId,
        accessToken,
        imageUrl: imagem,
        caption: texto,
      });
    } catch (err) {
      console.log('  /photos falhou:', err.message);
      console.log('  Fallback /feed ...');
    }
  }

  return await postarFeed({
    pageId,
    accessToken,
    message: texto,
    link: link || null,
  });
}

module.exports = { publicarNaPagina, obterTokenDaPagina };

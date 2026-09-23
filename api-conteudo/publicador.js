'use strict';

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

function exigirToken() {
  const v = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!v || !String(v).trim()) {
    throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN não definida');
  }
  return String(v).trim();
}

async function obterTokenDaPagina(pageId, tokenSecret) {
  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
    );
    url.searchParams.set('fields', 'id,name,access_token');
    url.searchParams.set('limit', '100');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tokenSecret}` },
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.data)) {
      const page = data.data.find((p) => String(p.id) === String(pageId));
      if (page && page.access_token) {
        console.log('  Token da Página via /me/accounts');
        return page.access_token;
      }
    }
  } catch (err) {
    console.log('  Aviso /me/accounts:', err.message);
  }
  return tokenSecret;
}

async function postarFeed({ pageId, accessToken, message, link }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;
  const params = { message, published: 'true' };
  if (link) params.link = link;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }
  return { tipo: 'feed', post_id: data.id || null };
}

async function postarFoto({ pageId, accessToken, imageUrl, caption }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      url: imageUrl,
      caption,
      published: 'true',
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }
  return { tipo: 'photo', post_id: data.post_id || data.id || null };
}

async function publicarNaPagina({ pageId, texto, link, imagem }) {
  const secret = exigirToken();
  const accessToken = await obterTokenDaPagina(pageId, secret);

  if (imagem && /^https?:\/\//i.test(imagem)) {
    try {
      console.log('  Tentando /photos...');
      return await postarFoto({
        pageId,
        accessToken,
        imageUrl: imagem,
        caption: texto,
      });
    } catch (err) {
      console.log('  /photos falhou:', err.message);
      console.log('  Fallback /feed...');
    }
  }

  return postarFeed({
    pageId,
    accessToken,
    message: texto,
    link: link || null,
  });
}

module.exports = { publicarNaPagina };

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

/**
 * Publica no feed da Página.
 * Extras oficiais da Graph API (quando fornecidos):
 * - place: ID de um Place/Page de localização real (não inventar)
 * - feeling: { og_action_type_id, og_object_id, og_icon_id? }
 * - text_format_preset_id: só faz sentido com texto curto (~130 chars); posts longos ignoram
 * Stories NÃO são publicados aqui (exigem mídia e endpoints photo_stories/video_stories).
 */
async function postarFeed({ pageId, accessToken, message, link, extras = {} }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;
  const params = { message, published: 'true' };
  if (link) params.link = link;

  if (extras.place) {
    params.place = String(extras.place);
  }
  if (extras.feeling && extras.feeling.og_action_type_id && extras.feeling.og_object_id) {
    params.og_action_type_id = String(extras.feeling.og_action_type_id);
    params.og_object_id = String(extras.feeling.og_object_id);
    if (extras.feeling.og_icon_id) {
      params.og_icon_id = String(extras.feeling.og_icon_id);
    }
  }
  // Plano de fundo: só com texto curto; caso contrário a API pode rejeitar
  if (
    extras.text_format_preset_id &&
    String(message || '').length <= 130
  ) {
    params.text_format_preset_id = String(extras.text_format_preset_id);
  }

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

async function publicarNaPagina({ pageId, texto, link, imagem, graphExtras }) {
  const secret = exigirToken();
  const accessToken = await obterTokenDaPagina(pageId, secret);
  const extras = graphExtras || {};

  // API de conteúdo: sem imagem de terceiros e sem link externo
  if (imagem && /^https?:\/\//i.test(imagem) && link) {
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

  try {
    return await postarFeed({
      pageId,
      accessToken,
      message: texto,
      link: link || null,
      extras,
    });
  } catch (err) {
    // Se feeling/place/preset falhar, tenta post limpo (só mensagem)
    if (extras.place || extras.feeling || extras.text_format_preset_id) {
      console.log('  Aviso extras Graph API:', err.message);
      console.log('  Publicando só com mensagem...');
      return postarFeed({
        pageId,
        accessToken,
        message: texto,
        link: link || null,
        extras: {},
      });
    }
    throw err;
  }
}

module.exports = { publicarNaPagina };

'use strict';

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

function exigirToken() {
  const v = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!v || !String(v).trim()) {
    throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN não definida');
  }
  return String(v).trim();
}

/** Aceita apenas URL http(s) utilizável para /photos. */
function urlImagemValida(url) {
  const u = String(url || '').trim();
  if (!u || u === 'null' || u === 'undefined') return '';
  if (!/^https?:\/\//i.test(u)) return '';
  try {
    const parsed = new URL(u);
    if (!parsed.hostname || parsed.hostname.length < 3) return '';
    // evita data: ou esquemas estranhos já filtrados pelo regex
    return u;
  } catch (_) {
    return '';
  }
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
      caption: caption || '',
      published: 'true',
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }
  return { tipo: 'photo', post_id: data.post_id || data.id || null };
}

/**
 * Publica na Página.
 * - Com imagem http(s) válida → tenta /photos (caption = texto), SEM exigir link.
 * - Sem imagem ou se /photos falhar → /feed só com texto (link só se passado explicitamente).
 * Posts de API devem chamar com link: null.
 */
async function publicarNaPagina({ pageId, texto, link, imagem, graphExtras }) {
  const secret = exigirToken();
  const accessToken = await obterTokenDaPagina(pageId, secret);
  const extras = graphExtras || {};
  const img = urlImagemValida(imagem);

  if (img) {
    try {
      console.log('  Tentando /photos (imagem + legenda)...');
      return await postarFoto({
        pageId,
        accessToken,
        imageUrl: img,
        caption: texto,
      });
    } catch (err) {
      console.log('  /photos falhou:', err.message);
      console.log('  Fallback /feed (somente texto)...');
    }
  } else {
    console.log('  Sem imagem válida — publicando /feed (texto).');
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

module.exports = { publicarNaPagina, urlImagemValida };

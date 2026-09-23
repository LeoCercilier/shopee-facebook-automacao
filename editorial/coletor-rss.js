'use strict';

/**
 * Coleta itens de feeds RSS/Atom sem login.
 * Não grava corpo completo para republicação — só metadados de descoberta.
 */

const UA =
  'Mozilla/5.0 (compatible; ShopeeFacebookEditorial/1.0; +https://github.com/LeoCercilier/shopee-facebook-automacao)';

function stripTags(html) {
  return String(html || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXmlEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .trim();
}

function limparUrl(url) {
  let u = String(url || '').trim();
  // Folha: https://redir.folha.../*https://www1.folha...
  const star = u.indexOf('*http');
  if (star !== -1) {
    u = u.slice(star + 1);
  }
  return u;
}

function textoPareceQuebrado(s) {
  return /\uFFFD|��/.test(String(s || ''));
}

function extrairCampo(bloco, tag) {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    'i'
  );
  const m = bloco.match(re);
  if (!m) return '';
  return decodeXmlEntities(m[1]);
}

function extrairLink(bloco) {
  const simple = extrairCampo(bloco, 'link');
  if (simple && /^https?:\/\//i.test(simple)) return limparUrl(simple);

  const href = bloco.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (href && href[1]) return limparUrl(href[1]);

  const guid = extrairCampo(bloco, 'guid');
  if (guid && /^https?:\/\//i.test(guid)) return limparUrl(guid);

  return limparUrl(simple || guid || '');
}

function extrairImagem(bloco) {
  const enc = bloco.match(
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']*["'])?/i
  );
  if (enc && enc[1] && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enc[1])) {
    return enc[1];
  }
  const media = bloco.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (media && media[1]) return media[1];
  const img = bloco.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img && img[1] && /^https?:\/\//i.test(img[1])) return img[1];
  return '';
}

function extrairData(bloco) {
  const raw =
    extrairCampo(bloco, 'pubDate') ||
    extrairCampo(bloco, 'published') ||
    extrairCampo(bloco, 'updated') ||
    extrairCampo(bloco, 'dc:date') ||
    '';
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : raw;
}

function parseItens(xml) {
  const itens = [];
  const chunks = [];
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
  let m;
  while ((m = itemRe.exec(xml))) chunks.push(m[0]);
  while ((m = entryRe.exec(xml))) chunks.push(m[0]);

  if (chunks.length === 0 && /rss version="0\.91"/i.test(xml)) {
    const parts = xml.split(/<title>/i).slice(2);
    for (const part of parts) {
      const titleMatch = part.match(/^([\s\S]*?)<\/title>/i);
      if (!titleMatch) continue;
      const titulo = stripTags(decodeXmlEntities(titleMatch[1]));
      const linkMatch = part.match(/<link>([\s\S]*?)<\/link>/i);
      const link = linkMatch ? limparUrl(decodeXmlEntities(linkMatch[1])) : '';
      if (!link || !titulo) continue;
      if (/folha de s\.?paulo/i.test(titulo)) continue;
      const descMatch = part.match(/<description>([\s\S]*?)<\/description>/i);
      const desc = descMatch ? stripTags(descMatch[1]) : '';
      const dateMatch = part.match(
        /<(?:pubDate|dc:date)>([\s\S]*?)<\/(?:pubDate|dc:date)>/i
      );
      let data = null;
      if (dateMatch) {
        const t = Date.parse(dateMatch[1]);
        data = Number.isFinite(t) ? new Date(t).toISOString() : dateMatch[1];
      }
      itens.push({
        titulo,
        url: link,
        data,
        descricao: desc.slice(0, 400),
        imagem: '',
        autor: '',
      });
    }
    return itens;
  }

  for (const bloco of chunks) {
    const titulo = stripTags(extrairCampo(bloco, 'title'));
    const url = extrairLink(bloco);
    if (!titulo || !url) continue;
    const descricao = stripTags(
      extrairCampo(bloco, 'description') ||
        extrairCampo(bloco, 'summary') ||
        ''
    ).slice(0, 400);
    const autor = stripTags(
      extrairCampo(bloco, 'dc:creator') || extrairCampo(bloco, 'author') || ''
    );
    itens.push({
      titulo,
      url,
      data: extrairData(bloco),
      descricao,
      imagem: extrairImagem(bloco),
      autor,
    });
  }
  return itens;
}

function decodificarCorpo(buffer, contentType, xmlHint) {
  const ct = String(contentType || '').toLowerCase();
  const head = buffer.slice(0, 400).toString('latin1');
  const decl = (xmlHint || head).toLowerCase();
  const latin =
    /charset\s*=\s*["']?(iso-8859-1|latin-?1|windows-1252)/i.test(ct) ||
    /encoding\s*=\s*["']?(iso-8859-1|latin-?1|windows-1252)/i.test(decl);

  if (latin) {
    return buffer.toString('latin1');
  }
  // tenta UTF-8; se houver muitos �, refaz em latin1
  const asUtf8 = buffer.toString('utf8');
  if ((asUtf8.match(/\uFFFD/g) || []).length >= 2) {
    return buffer.toString('latin1');
  }
  return asUtf8;
}

async function buscarFeed(rssUrl) {
  const res = await fetch(rssUrl, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar ${rssUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const xml = decodificarCorpo(buf, res.headers.get('content-type'), '');
  if (!xml || xml.length < 50) {
    throw new Error(`Feed vazio ou inválido: ${rssUrl}`);
  }
  return parseItens(xml);
}

async function coletarFontes(fontes) {
  const resultados = [];
  for (const fonte of fontes || []) {
    try {
      const itens = await buscarFeed(fonte.rss);
      console.log(`  RSS ${fonte.nome}: ${itens.length} itens (${fonte.rss})`);
      for (const item of itens) {
        if (textoPareceQuebrado(item.titulo)) {
          console.log(
            `    ✗ encoding inválido no título — ${(item.titulo || '').slice(0, 40)}`
          );
          continue;
        }
        resultados.push({
          ...item,
          fonte_id: fonte.id,
          fonte_nome: fonte.nome,
          fonte_prioridade: fonte.prioridade || 99,
          sempre_relevante: Boolean(fonte.sempre_relevante),
          exigir_keyword_no_titulo: Boolean(fonte.exigir_keyword_no_titulo),
        });
      }
    } catch (err) {
      console.warn(`  ⚠ Fonte indisponível (${fonte.nome}): ${err.message}`);
      resultados.push({
        _erro_fonte: true,
        fonte_id: fonte.id,
        fonte_nome: fonte.nome,
        erro: err.message,
      });
    }
  }
  return resultados;
}

module.exports = {
  buscarFeed,
  coletarFontes,
  parseItens,
  stripTags,
  limparUrl,
};

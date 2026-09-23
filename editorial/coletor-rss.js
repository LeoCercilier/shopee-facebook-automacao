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
  // <link>url</link>
  const simple = extrairCampo(bloco, 'link');
  if (simple && /^https?:\/\//i.test(simple)) return simple.trim();

  // <link href="..." />
  const href = bloco.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (href && href[1]) return href[1].trim();

  // guid isPermalink
  const guid = extrairCampo(bloco, 'guid');
  if (guid && /^https?:\/\//i.test(guid)) return guid.trim();

  return simple || guid || '';
}

function extrairImagem(bloco) {
  const enc = bloco.match(
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']*["'])?/i
  );
  if (enc && enc[1] && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enc[1])) {
    return enc[1];
  }
  const media = bloco.match(
    /<media:content[^>]+url=["']([^"']+)["']/i
  );
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

  // RSS 0.91 Folha: às vezes estrutura diferente — fallback por <title> em canal
  if (chunks.length === 0 && /rss version="0\.91"/i.test(xml)) {
    // Folha lista itens como sequências title/link/description sem <item> em alguns exports;
    // tentar pares link+title no channel
    const parts = xml.split(/<title>/i).slice(2); // skip channel titles
    for (const part of parts) {
      const titleMatch = part.match(/^([\s\S]*?)<\/title>/i);
      if (!titleMatch) continue;
      const titulo = decodeXmlEntities(titleMatch[1]);
      const linkMatch = part.match(/<link>([\s\S]*?)<\/link>/i);
      const link = linkMatch ? decodeXmlEntities(linkMatch[1]) : '';
      if (!link || !titulo) continue;
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
        titulo: stripTags(titulo),
        url: link.trim(),
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
    // NÃO usar content:encoded no post — só contexto interno curto se description vazia
    const autor = stripTags(
      extrairCampo(bloco, 'dc:creator') || extrairCampo(bloco, 'author') || ''
    );
    itens.push({
      titulo,
      url: url.trim(),
      data: extrairData(bloco),
      descricao,
      imagem: extrairImagem(bloco),
      autor,
    });
  }
  return itens;
}

async function buscarFeed(rssUrl) {
  const res = await fetch(rssUrl, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar ${rssUrl}`);
  }
  const xml = await res.text();
  if (!xml || xml.length < 50) {
    throw new Error(`Feed vazio ou inválido: ${rssUrl}`);
  }
  const itens = parseItens(xml);
  return itens;
}

async function coletarFontes(fontes) {
  const resultados = [];
  for (const fonte of fontes || []) {
    try {
      const itens = await buscarFeed(fonte.rss);
      console.log(
        `  RSS ${fonte.nome}: ${itens.length} itens (${fonte.rss})`
      );
      for (const item of itens) {
        resultados.push({
          ...item,
          fonte_id: fonte.id,
          fonte_nome: fonte.nome,
          fonte_prioridade: fonte.prioridade || 99,
          sempre_relevante: Boolean(fonte.sempre_relevante),
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

module.exports = { buscarFeed, coletarFontes, parseItens, stripTags };

'use strict';

const UA =
  'ShopeeFacebookApiConteudo/1.0 (https://github.com/LeoCercilier/shopee-facebook-automacao; educational)';

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Remove CDATA, tags HTML e entidades que vazam no texto do post. */
function sanitizarTexto(s) {
  let t = String(s || '');
  if (!t) return '';
  // entidades (concatenacao evita corrupcao de < no transporte)
  t = t.split('&' + 'lt;').join('<');
  t = t.split('&' + 'gt;').join('>');
  t = t.split('&' + 'quot;').join('"');
  t = t.split('&' + 'nbsp;').join(' ');
  t = t.split('&' + 'amp;').join('&');
  t = t.replace(/&#0*39;/g, "'");
  t = t.replace(/&#x27;/gi, "'");
  t = t.replace(/<!\[CDATA\[/gi, ' ');
  t = t.replace(/\]\]>/g, ' ');
  t = t.replace(/\[CDATA\[/gi, ' ');
  t = t.replace(/\bCDATA\b/gi, ' ');
  t = t.replace(/<[^>]*>/g, ' ');
  t = t.replace(/&[a-zA-Z]+;/g, ' ');
  t = t.replace(/&#\d+;/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function itemLimpo(base) {
  return {
    ...base,
    titulo: sanitizarTexto(base.titulo),
    descricao: sanitizarTexto(base.descricao),
  };
}

async function coletarHackerNews(fonte) {
  const base = fonte.url.replace(/\/$/, '');
  const ids = await getJson(`${base}/topstories.json`);
  const slice = (ids || []).slice(0, 20);
  const itens = [];
  for (const id of slice) {
    try {
      const item = await getJson(`${base}/item/${id}.json`);
      if (!item || item.type !== 'story' || !item.title) continue;
      if (item.dead || item.deleted) continue;
      const url = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
      itens.push(
        itemLimpo({
          id_unico: `hn-${item.id}`,
          titulo: item.title,
          descricao: '',
          url,
          imagem: '',
          data: item.time ? new Date(item.time * 1000).toISOString() : null,
          fonte_id: fonte.id,
          fonte_nome: fonte.nome,
          fonte_prioridade: fonte.prioridade || 99,
        })
      );
    } catch (_) {}
  }
  return itens.filter((i) => i.titulo);
}

async function coletarSpaceflight(fonte) {
  const data = await getJson(fonte.url);
  const results = data.results || data || [];
  return results
    .map((a) =>
      itemLimpo({
        id_unico: `sfn-${a.id}`,
        titulo: a.title || '',
        descricao: (a.summary || '').slice(0, 280),
        url: a.url || '',
        imagem: a.image_url || '',
        data: a.published_at || null,
        fonte_id: fonte.id,
        fonte_nome: fonte.nome,
        fonte_prioridade: fonte.prioridade || 99,
      })
    )
    .filter((i) => i.titulo && i.url);
}

async function coletarDevto(fonte) {
  const tags = fonte.tags || ['ai'];
  const itens = [];
  const base = fonte.url.replace(/\/$/, '');
  for (const tag of tags) {
    try {
      const data = await getJson(
        `${base}?tag=${encodeURIComponent(tag)}&per_page=8&top=7`
      );
      for (const a of data || []) {
        if (!a.title || !a.url) continue;
        itens.push(
          itemLimpo({
            id_unico: `devto-${a.id}`,
            titulo: a.title,
            descricao: (a.description || '').slice(0, 280),
            url: a.url,
            imagem: a.cover_image || a.social_image || '',
            data: a.published_at || a.created_at || null,
            fonte_id: fonte.id,
            fonte_nome: fonte.nome,
            fonte_prioridade: fonte.prioridade || 99,
          })
        );
      }
    } catch (err) {
      console.warn(`    devto tag ${tag}: ${err.message}`);
    }
  }
  return itens.filter((i) => i.titulo);
}

async function coletarFreenews(fonte) {
  const queries = fonte.queries || ['technology'];
  const itens = [];
  const base = fonte.url.replace(/\/$/, '');
  for (const q of queries) {
    try {
      const url = `${base}?q=${encodeURIComponent(q)}&size=8`;
      const data = await getJson(url);
      for (const r of data.results || []) {
        if (!r.title || !r.url) continue;
        const limpo = itemLimpo({
          id_unico: `fn-${r.id || r.url}`,
          titulo: r.title,
          descricao: (r.description || '').slice(0, 280),
          url: r.url,
          imagem: '',
          data: r.published_at || null,
          fonte_id: fonte.id,
          fonte_nome: fonte.nome,
          fonte_prioridade: fonte.prioridade || 99,
          idioma: r.lang || '',
        });
        if (!limpo.titulo || /CDATA|<!\[|\]\]>/i.test(limpo.titulo)) continue;
        itens.push(limpo);
      }
    } catch (err) {
      console.warn(`    freenews "${q}": ${err.message}`);
    }
  }
  return itens;
}

async function coletarOpenBeauty(fonte) {
  const termos = fonte.termos || ['sunscreen'];
  const itens = [];
  for (const termo of termos) {
    try {
      const url =
        `${fonte.url}?search_terms=${encodeURIComponent(termo)}` +
        `&search_simple=1&action=process&json=1&page_size=5`;
      const data = await getJson(url);
      for (const p of data.products || []) {
        const nome =
          p.product_name_pt ||
          p.product_name ||
          p.generic_name ||
          p.brands ||
          '';
        if (!nome || nome.length < 4) continue;
        const cats = p.categories || '';
        const img =
          (p.image_front_small_url ||
            p.image_url ||
            p.image_front_url ||
            '') ||
          '';
        const code = p.code || p._id || nome;
        itens.push(
          itemLimpo({
            id_unico: `obf-${code}`,
            titulo: nome.slice(0, 120),
            descricao: `Categoria: ${cats}. Dados Open Beauty Facts (base aberta de cosmeticos).`.slice(
              0,
              280
            ),
            url: p.url || `https://world.openbeautyfacts.org/product/${code}`,
            imagem: img,
            data: null,
            fonte_id: fonte.id,
            fonte_nome: fonte.nome,
            fonte_prioridade: fonte.prioridade || 99,
          })
        );
      }
    } catch (err) {
      console.warn(`    open beauty "${termo}": ${err.message}`);
    }
  }
  return itens.filter((i) => i.titulo);
}

async function coletarTaco(fonte) {
  const data = await getJson(fonte.url);
  const foods = data.foods || [];
  if (!foods.length) return [];
  const candidatos = foods.filter((f) => {
    const d = String(f.description || '');
    if (d.length < 8) return false;
    if (/\bcru\b/i.test(d) && !/integral|parboilizado/i.test(d)) return false;
    return true;
  });
  const shuffled = [...candidatos].sort(() => Math.random() - 0.5).slice(0, 8);
  const itens = [];
  const detailBase = (fonte.detail_base || 'https://brolesi.github.io/taco/foods/').replace(
    /\/$/,
    ''
  );
  for (const f of shuffled) {
    try {
      const det = await getJson(`${detailBase}/${f.id}.json`);
      const kcal = det.energy_kcal != null ? Math.round(det.energy_kcal) : null;
      const prot = det.protein_g != null ? Number(det.protein_g).toFixed(1) : null;
      const fibra =
        det.dietary_fiber_g != null ? Number(det.dietary_fiber_g).toFixed(1) : null;
      const partes = [];
      if (kcal != null) partes.push(`cerca de ${kcal} kcal/100g`);
      if (prot != null) partes.push(`${prot}g de proteina`);
      if (fibra != null) partes.push(`${fibra}g de fibra`);
      const desc =
        partes.length > 0
          ? `${f.description} (${f.category}): ${partes.join(', ')}. Fonte: tabela TACO/UNICAMP.`
          : `${f.description} — alimento da tabela TACO (composicao brasileira).`;
      itens.push(
        itemLimpo({
          id_unico: `taco-${f.id}`,
          titulo: f.description,
          descricao: desc.slice(0, 320),
          url: 'https://www.nepa.unicamp.br/taco-tabela-brasileira-de-composicao-de-alimentos/',
          imagem: '',
          data: null,
          fonte_id: fonte.id,
          fonte_nome: fonte.nome,
          fonte_prioridade: fonte.prioridade || 99,
          licenca: 'Dados TACO/NEPA-UNICAMP (API estatica comunitaria)',
        })
      );
    } catch (err) {
      console.warn(`    taco ${f.id}: ${err.message}`);
    }
  }
  return itens.filter((i) => i.titulo);
}

async function coletarWikipediaTopics(fonte) {
  const topics = fonte.topics || [];
  if (!topics.length) return [];
  const shuffled = [...topics].sort(() => Math.random() - 0.5).slice(0, 6);
  const base = fonte.url.endsWith('/') ? fonte.url : fonte.url + '/';
  const itens = [];
  for (const topic of shuffled) {
    try {
      const data = await getJson(base + encodeURIComponent(topic));
      if (!data || data.type === 'disambiguation' || data.type === 'not_found') {
        continue;
      }
      const titulo = data.title || topic.replace(/_/g, ' ');
      const extract = (data.extract || '').slice(0, 360);
      const url =
        (data.content_urls && data.content_urls.desktop
          ? data.content_urls.desktop.page
          : null) ||
        `https://pt.wikipedia.org/wiki/${encodeURIComponent(topic)}`;
      const imagem =
        (data.thumbnail && data.thumbnail.source) ||
        (data.originalimage && data.originalimage.source) ||
        '';
      itens.push(
        itemLimpo({
          id_unico: `wiki-${topic}`,
          titulo,
          descricao: extract,
          url,
          imagem,
          data: null,
          fonte_id: fonte.id,
          fonte_nome: fonte.nome,
          fonte_prioridade: fonte.prioridade || 99,
          licenca: 'CC BY-SA (Wikipedia)',
        })
      );
    } catch (err) {
      console.warn(`    wiki ${topic}: ${err.message}`);
    }
  }
  return itens.filter((i) => i.titulo);
}

const WMO = {
  0: 'ceu limpo',
  1: 'principalmente limpo',
  2: 'parcialmente nublado',
  3: 'nublado',
  45: 'neblina',
  51: 'garoa',
  61: 'chuva leve',
  63: 'chuva moderada',
  65: 'chuva forte',
  80: 'pancadas de chuva',
  95: 'trovoada',
};

function montarDicaClima(temp, hum, code) {
  const cond = WMO[code] || 'condicao variavel';
  if (typeof temp === 'number' && temp >= 30) {
    return `Com cerca de ${Math.round(temp)}C em Sao Paulo (${cond}), priorize ventilacao e nao deixe produtos de limpeza ou cosmeticos ao sol.`;
  }
  if (typeof temp === 'number' && temp <= 14) {
    return `Temperatura em torno de ${Math.round(temp)}C (${cond}). Bom momento para organizar armarios e checar umidade em cantos da casa.`;
  }
  if (typeof hum === 'number' && hum >= 80) {
    return `Umidade alta (~${Math.round(hum)}%). Areje ambientes e fique atento a mofo em banheiros e armarios.`;
  }
  if ([61, 63, 65, 80, 95].includes(code)) {
    return `Previsao de ${cond}. Bom dia para organizacao interna, limpeza leve ou uma receita caseira.`;
  }
  return null;
}

async function coletarOpenMeteo(fonte) {
  const data = await getJson(fonte.url);
  const cur = data.current || {};
  const temp = cur.temperature_2m;
  const hum = cur.relative_humidity_2m;
  const code = cur.weather_code;
  const cond = WMO[code] || `codigo ${code}`;
  const dica = montarDicaClima(temp, hum, code);
  return [
    itemLimpo({
      id_unico: `meteo-sp-${cur.time || Date.now()}`,
      titulo: `Clima em Sao Paulo: ${temp}C, ${cond}`,
      descricao: `Umidade: ${hum}%. ${dica || 'Sem dica domestica especifica.'}`,
      url: 'https://open-meteo.com/',
      imagem: '',
      data: cur.time || null,
      fonte_id: fonte.id,
      fonte_nome: fonte.nome,
      fonte_prioridade: fonte.prioridade || 99,
      dica_casa: dica,
    }),
  ];
}

async function coletarFonte(fonte) {
  switch (fonte.tipo) {
    case 'hacker_news':
      return coletarHackerNews(fonte);
    case 'spaceflight_news':
      return coletarSpaceflight(fonte);
    case 'devto':
      return coletarDevto(fonte);
    case 'freenewsapi':
      return coletarFreenews(fonte);
    case 'open_beauty_facts':
      return coletarOpenBeauty(fonte);
    case 'taco':
      return coletarTaco(fonte);
    case 'wikipedia_topics':
      return coletarWikipediaTopics(fonte);
    case 'open_meteo':
      return coletarOpenMeteo(fonte);
    case 'themealdb':
    case 'dog_ceo':
      return [];
    default:
      throw new Error(`Tipo de fonte desconhecido: ${fonte.tipo}`);
  }
}

async function coletarFontes(fontes) {
  const out = [];
  for (const fonte of fontes || []) {
    if (fonte.ativo === false) {
      console.log(`  [DESCARTADA] ${fonte.nome}: desativada na config`);
      continue;
    }
    try {
      const itens = await coletarFonte(fonte);
      console.log(`  API ${fonte.nome}: ${itens.length} itens`);
      out.push(...itens);
    } catch (err) {
      console.warn(`  \u26a0 API ${fonte.nome}: ${err.message}`);
      out.push({
        _erro_fonte: true,
        fonte_id: fonte.id,
        fonte_nome: fonte.nome,
        erro: err.message,
      });
    }
  }
  return out;
}

module.exports = {
  coletarFontes,
  coletarFonte,
  normalizar,
  montarDicaClima,
  sanitizarTexto,
};

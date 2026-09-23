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

async function coletarHackerNews(fonte) {
  const base = fonte.url.replace(/\/$/, '');
  const ids = await getJson(`${base}/topstories.json`);
  const slice = (ids || []).slice(0, 25);
  const itens = [];
  for (const id of slice) {
    try {
      const item = await getJson(`${base}/item/${id}.json`);
      if (!item || item.type !== 'story' || !item.title) continue;
      if (item.dead || item.deleted) continue;
      const url = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
      itens.push({
        id_unico: `hn-${item.id}`,
        titulo: item.title,
        descricao: '',
        url,
        imagem: '',
        data: item.time
          ? new Date(item.time * 1000).toISOString()
          : null,
        fonte_id: fonte.id,
        fonte_nome: fonte.nome,
        fonte_prioridade: fonte.prioridade || 99,
      });
    } catch (_) {
      /* ignora item */
    }
  }
  return itens;
}

async function coletarSpaceflight(fonte) {
  const data = await getJson(fonte.url);
  const results = data.results || data || [];
  return results.map((a) => ({
    id_unico: `sfn-${a.id}`,
    titulo: a.title || '',
    descricao: (a.summary || '').slice(0, 280),
    url: a.url || '',
    imagem: a.image_url || '',
    data: a.published_at || null,
    fonte_id: fonte.id,
    fonte_nome: fonte.nome,
    fonte_prioridade: fonte.prioridade || 99,
  })).filter((i) => i.titulo && i.url);
}

async function coletarWikipediaTopics(fonte) {
  const topics = fonte.topics || [];
  if (!topics.length) return [];
  // escolhe até 5 tópicos aleatórios por execução
  const shuffled = [...topics].sort(() => Math.random() - 0.5).slice(0, 5);
  const base = fonte.url.endsWith('/') ? fonte.url : fonte.url + '/';
  const itens = [];
  for (const topic of shuffled) {
    try {
      const data = await getJson(base + encodeURIComponent(topic));
      if (!data || data.type === 'disambiguation' || data.type === 'not_found') {
        continue;
      }
      const titulo = data.title || topic.replace(/_/g, ' ');
      const extract = (data.extract || '').slice(0, 320);
      const url = (data.content_urls && data.content_urls.desktop
        ? data.content_urls.desktop.page
        : null) || `https://pt.wikipedia.org/wiki/${encodeURIComponent(topic)}`;
      const imagem =
        (data.thumbnail && data.thumbnail.source) ||
        (data.originalimage && data.originalimage.source) ||
        '';
      itens.push({
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
      });
    } catch (err) {
      console.warn(`    wiki ${topic}: ${err.message}`);
    }
  }
  return itens;
}

async function coletarMealDB(fonte) {
  const data = await getJson(fonte.url);
  const meal = (data.meals && data.meals[0]) || null;
  if (!meal) return [];
  return [
    {
      id_unico: `meal-${meal.idMeal}`,
      titulo: meal.strMeal || 'Receita',
      descricao: `Categoria: ${meal.strCategory || '—'} · Origem: ${meal.strArea || '—'}`,
      url: meal.strSource || meal.strYoutube || `https://www.themealdb.com/meal/${meal.idMeal}`,
      imagem: meal.strMealThumb || '',
      data: null,
      fonte_id: fonte.id,
      fonte_nome: fonte.nome,
      fonte_prioridade: fonte.prioridade || 99,
    },
  ];
}

async function coletarDogCeo(fonte) {
  const data = await getJson(fonte.url);
  if (!data || data.status !== 'success' || !data.message) return [];
  const img = data.message;
  const breedMatch = img.match(/breeds\/([^/]+)\//);
  const breed = breedMatch
    ? breedMatch[1].replace(/-/g, ' ')
    : 'cão';
  return [
    {
      id_unico: `dog-${img}`,
      titulo: `Foto de ${breed}`,
      descricao: 'Imagem pública de cão (Dog CEO API).',
      url: 'https://dog.ceo/dog-api/',
      imagem: img,
      data: null,
      fonte_id: fonte.id,
      fonte_nome: fonte.nome,
      fonte_prioridade: fonte.prioridade || 99,
    },
  ];
}

const WMO = {
  0: 'céu limpo',
  1: 'principalmente limpo',
  2: 'parcialmente nublado',
  3: 'nublado',
  45: 'neblina',
  48: 'neblina com geada',
  51: 'garoa leve',
  61: 'chuva leve',
  63: 'chuva moderada',
  65: 'chuva forte',
  80: 'pancadas de chuva',
  95: 'trovoada',
};

async function coletarOpenMeteo(fonte) {
  const data = await getJson(fonte.url);
  const cur = data.current || {};
  const temp = cur.temperature_2m;
  const hum = cur.relative_humidity_2m;
  const code = cur.weather_code;
  const cond = WMO[code] || `código climático ${code}`;
  const titulo = `Tempo em São Paulo: ${temp}°C, ${cond}`;
  return [
    {
      id_unico: `meteo-sp-${cur.time || Date.now()}`,
      titulo,
      descricao: `Umidade relativa: ${hum}%. Dados Open-Meteo (São Paulo).`,
      url: 'https://open-meteo.com/',
      imagem: '',
      data: cur.time || null,
      fonte_id: fonte.id,
      fonte_nome: fonte.nome,
      fonte_prioridade: fonte.prioridade || 99,
    },
  ];
}

async function coletarFonte(fonte) {
  switch (fonte.tipo) {
    case 'hacker_news':
      return coletarHackerNews(fonte);
    case 'spaceflight_news':
      return coletarSpaceflight(fonte);
    case 'wikipedia_topics':
      return coletarWikipediaTopics(fonte);
    case 'themealdb':
      return coletarMealDB(fonte);
    case 'dog_ceo':
      return coletarDogCeo(fonte);
    case 'open_meteo':
      return coletarOpenMeteo(fonte);
    default:
      throw new Error(`Tipo de fonte desconhecido: ${fonte.tipo}`);
  }
}

async function coletarFontes(fontes) {
  const out = [];
  for (const fonte of fontes || []) {
    try {
      const itens = await coletarFonte(fonte);
      console.log(`  API ${fonte.nome}: ${itens.length} itens`);
      out.push(...itens);
    } catch (err) {
      console.warn(`  ⚠ API ${fonte.nome}: ${err.message}`);
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

module.exports = { coletarFontes, coletarFonte, normalizar };

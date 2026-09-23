'use strict';

const { pareceIngles } = require('./filtro');

function encurtar(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function primeiraFraseUtil(texto, max = 220) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const partes = t.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const p of partes) {
    if (!p) continue;
    if (!out) out = p;
    else if ((out + ' ' + p).length <= max) out = out + ' ' + p;
    else break;
  }
  return encurtar(out || t, max);
}

/** Tradução superficial de títulos comuns de receitas (sem API externa). */
function traduzirTituloReceita(titulo) {
  if (!titulo) return '';
  if (!pareceIngles(titulo) && /[áàâãéêíóôõúç]/i.test(titulo)) return titulo;

  const mapa = {
    chicken: 'frango',
    beef: 'carne bovina',
    pork: 'porco',
    lamb: 'cordeiro',
    fish: 'peixe',
    salmon: 'salmão',
    shrimp: 'camarão',
    rice: 'arroz',
    pasta: 'massa',
    soup: 'sopa',
    salad: 'salada',
    cake: 'bolo',
    pie: 'torta',
    bread: 'pão',
    egg: 'ovo',
    eggs: 'ovos',
    cheese: 'queijo',
    vegetable: 'vegetais',
    vegetarian: 'vegetariano',
    spicy: 'apimentado',
    grilled: 'grelhado',
    roasted: 'assado',
    fried: 'frito',
    baked: 'assado',
    creamy: 'cremoso',
    chocolate: 'chocolate',
    apple: 'maçã',
    lemon: 'limão',
    garlic: 'alho',
    tomato: 'tomate',
    potato: 'batata',
    curry: 'curry',
    stew: 'ensopado',
    casserole: 'caçarola',
    pancake: 'panqueca',
    waffle: 'waffle',
    breakfast: 'café da manhã',
    dessert: 'sobremesa',
  };

  let t = titulo;
  for (const [en, pt] of Object.entries(mapa)) {
    t = t.replace(new RegExp(`\\b${en}\\b`, 'gi'), pt);
  }
  // se quase não mudou e continua EN, prefixa
  if (pareceIngles(t)) {
    return `Receita: ${titulo}`;
  }
  return t;
}

function gerarPost({ item, paginaCfg }) {
  const emoji = paginaCfg.emoji || '💡';
  const rotulo = paginaCfg.rotulo || 'CURIOSIDADE';
  const fonte = item.fonte_nome || 'Fonte';
  const url = item.url || '';

  let tituloExibicao = item.titulo_pt || item.titulo || '';
  let corpo;

  if (paginaCfg.nicho === 'beleza') {
    const fato = primeiraFraseUtil(item.descricao, 200);
    if (fato && !pareceIngles(fato)) {
      corpo =
        `${fato} ` +
        `Informação educativa — não substitui orientação de um profissional de saúde.`;
    } else {
      corpo =
        `Sobre ${tituloExibicao}: um tema relevante para quem cuida da pele e valoriza o autocuidado. ` +
        `Sempre vale confirmar com fontes confiáveis e, se necessário, com um dermatologista.`;
    }
  } else if (paginaCfg.nicho === 'motociclismo') {
    const fato = primeiraFraseUtil(item.descricao, 210);
    if (fato && !pareceIngles(fato)) {
      corpo = `Você sabia? ${fato}`;
    } else {
      corpo =
        `No universo das duas rodas, ${tituloExibicao} é um tema que interessa quem anda de moto, ` +
        `cuida do equipamento ou acompanha o esporte.`;
    }
  } else if (paginaCfg.nicho === 'casa') {
    if (item.fonte_id === 'themealdb') {
      tituloExibicao = item.titulo_pt || traduzirTituloReceita(item.titulo);
      const cat = item.categoria_pt || item.descricao || '';
      corpo =
        `Que tal experimentar na cozinha: ${tituloExibicao}? ` +
        (cat ? `${cat}. ` : '') +
        `Uma ideia prática para variar o cardápio em casa.`;
    } else if (item.fonte_id === 'open-meteo' && item.dica_casa) {
      corpo = item.dica_casa;
    } else {
      corpo =
        `${tituloExibicao}. ` +
        (item.descricao ? primeiraFraseUtil(item.descricao, 160) : 'Dica útil para o dia a dia em casa.');
    }
  } else {
    // marketing
    const fato = primeiraFraseUtil(item.descricao, 180);
    if (fato && !pareceIngles(fato)) {
      corpo = `${tituloExibicao}. ${fato}`;
    } else {
      corpo =
        `${tituloExibicao}. ` +
        `Um tema em evidência para quem acompanha tecnologia, negócios digitais e inovação.`;
    }
  }

  corpo = encurtar(corpo.replace(/\s+/g, ' ').trim(), 420);

  const linhas = [`${emoji} ${rotulo}`, '', corpo];
  if (url) {
    linhas.push('', '🔎 Saiba mais:', url);
  }
  linhas.push('', `Fonte: ${fonte}`);
  if (item.licenca) linhas.push(`Atribuição: ${item.licenca}`);

  return {
    texto: linhas.join('\n'),
    titulo: tituloExibicao,
    titulo_original: item.titulo,
    url,
    imagem: item.imagem || '',
    fonte_id: item.fonte_id,
    fonte_nome: fonte,
    id_unico: item.id_unico,
  };
}

function validarPost(post) {
  if (!post || !post.texto) return { ok: false, motivo: 'sem_texto' };
  if (post.texto.length < 50) return { ok: false, motivo: 'muito_curto' };
  if (!/fonte:/i.test(post.texto)) return { ok: false, motivo: 'sem_fonte' };
  // rejeitar se o corpo principal ainda parece inglês cru de receita
  const corpo = post.texto.split('\n').slice(2, 5).join(' ');
  if (pareceIngles(corpo) && /receita|meal|pork|beef|chicken/i.test(corpo)) {
    return { ok: false, motivo: 'texto_ainda_em_ingles' };
  }
  return { ok: true };
}

module.exports = { gerarPost, validarPost, traduzirTituloReceita, primeiraFraseUtil };

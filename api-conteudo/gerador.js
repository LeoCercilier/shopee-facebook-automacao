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

/** URL pública utilizável no post (https). */
function urlPublica(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return '';
  try {
    const parsed = new URL(u);
    if (!parsed.hostname || parsed.hostname.length < 3) return '';
    return u;
  } catch (_) {
    return '';
  }
}

function gerarPost({ item, paginaCfg }) {
  const emoji = paginaCfg.emoji || '💡';
  const rotulo = paginaCfg.rotulo || 'CURIOSIDADE';
  const fonte = item.fonte_nome || 'Fonte';
  const url = urlPublica(item.url);

  let tituloExibicao = item.titulo_pt || item.titulo || '';
  let corpo;

  if (paginaCfg.nicho === 'beleza') {
    if (item.fonte_id === 'open-beauty') {
      corpo =
        `Sobre cuidados com a pele: o produto "${tituloExibicao}" aparece em bases abertas de cosméticos. ` +
        `Use como referência para ler rótulos e FPS — sempre de acordo com a sua pele e orientação profissional.`;
    } else {
      const fato = primeiraFraseUtil(item.descricao, 200);
      if (fato && !pareceIngles(fato)) {
        corpo =
          `${fato} Informação educativa — não substitui orientação de um profissional de saúde.`;
      } else {
        corpo =
          `Sobre ${tituloExibicao}: tema relevante para quem cuida da pele. ` +
          `Confirme com fontes confiáveis e, se preciso, com um dermatologista.`;
      }
    }
  } else if (paginaCfg.nicho === 'motociclismo') {
    const fato = primeiraFraseUtil(item.descricao, 210);
    if (fato && !pareceIngles(fato)) {
      corpo = `Você sabia? ${fato}`;
    } else {
      corpo =
        `${tituloExibicao}: assunto que interessa quem anda de moto, cuida do equipamento ou acompanha o esporte.`;
    }
  } else if (paginaCfg.nicho === 'casa') {
    if (item.fonte_id === 'taco') {
      corpo =
        `Você sabia? ${primeiraFraseUtil(item.descricao, 240)} ` +
        `Útil para quem quer escolher melhor os alimentos no dia a dia em casa.`;
    } else if (item.fonte_id === 'open-meteo' && item.dica_casa) {
      corpo = item.dica_casa;
    } else {
      const fato = primeiraFraseUtil(item.descricao, 180);
      corpo =
        fato && !pareceIngles(fato)
          ? fato
          : `${tituloExibicao}: ideia útil para organização, limpeza ou rotina doméstica.`;
    }
  } else {
    const fato = primeiraFraseUtil(item.descricao, 180);
    if (fato && !pareceIngles(fato)) {
      corpo = `${tituloExibicao}. ${fato}`;
    } else if (fato) {
      corpo =
        `${tituloExibicao}. ` +
        `Leitura útil para quem acompanha tecnologia, produtividade ou negócios digitais.`;
    } else {
      corpo =
        `${tituloExibicao}. ` +
        `Tema em evidência para quem acompanha inovação e gestão digital.`;
    }
  }

  corpo = encurtar(corpo.replace(/\s+/g, ' ').trim(), 420);

  // Link obrigatório no texto da postagem
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
    tem_link: Boolean(url),
  };
}

function validarPost(post) {
  if (!post || !post.texto) return { ok: false, motivo: 'sem_texto' };
  if (post.texto.length < 50) return { ok: false, motivo: 'muito_curto' };
  if (!/fonte:/i.test(post.texto)) return { ok: false, motivo: 'sem_fonte' };

  const url = urlPublica(post.url);
  if (!url) {
    return { ok: false, motivo: 'sem_link_publico' };
  }
  if (!post.texto.includes(url)) {
    return { ok: false, motivo: 'link_nao_esta_no_texto' };
  }
  if (!/saiba mais/i.test(post.texto)) {
    return { ok: false, motivo: 'sem_bloco_saiba_mais' };
  }

  return { ok: true };
}

module.exports = {
  gerarPost,
  validarPost,
  primeiraFraseUtil,
  urlPublica,
};

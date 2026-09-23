'use strict';

const { pareceIngles, parecePortugues } = require('./filtro');
const { avaliarTextoFinal } = require('./avaliador-texto');

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
    else if ((out + ' ' + p).length <= max) out = `${out} ${p}`;
    else break;
  }
  return encurtar(out || t, max);
}

function tituloAdaptado(item, nicho) {
  const orig = String(item.titulo_pt || item.titulo || '').trim();
  if (!orig) return '';
  if (parecePortugues(orig) && !pareceIngles(orig)) return encurtar(orig, 90);

  const low = orig.toLowerCase();
  if (nicho === 'marketing') {
    if (/\b(ai|artificial intelligence|llm|gpt|openai)\b/i.test(low)) {
      return 'IA e produtividade no dia a dia digital';
    }
    if (/\bstartup|funding|raise[sd]?\b/i.test(low)) {
      return 'Movimento no ecossistema de startups';
    }
    if (/\bmarketing|ecommerce|e-commerce|affiliate\b/i.test(low)) {
      return 'Tendência em marketing e vendas digitais';
    }
    if (/\bproductivity|tool|automat/i.test(low)) {
      return 'Ferramentas e automação para trabalhar melhor';
    }
    return 'Ideia de tecnologia aplicada a negócios';
  }
  if (nicho === 'motociclismo') {
    if (/\belectric|el[eé]tric/i.test(low)) {
      return 'Novidade em moto elétrica';
    }
    if (/\bhelmet|capacete\b/i.test(low)) {
      return 'Segurança: o que observar no capacete';
    }
    if (/\bmotogp\b/i.test(low)) {
      return 'Atualização no mundo do MotoGP';
    }
    return 'Novidade no universo das duas rodas';
  }
  if (nicho === 'beleza') {
    if (/\bfps|solar|sunscreen|protetor\b/i.test(low)) {
      return 'Proteção solar no dia a dia';
    }
    if (/\bhidrat|moistur/i.test(low)) {
      return 'Hidratação e cuidados com a pele';
    }
    return 'Cuidados com a pele';
  }
  return encurtar(orig, 80);
}

function gerarPost({ item, paginaCfg }) {
  const emoji = paginaCfg.emoji || '💡';
  const rotulo = paginaCfg.rotulo || 'CURIOSIDADE';
  const fonte = item.fonte_nome || 'Fonte';
  const tituloExibicao = tituloAdaptado(item, paginaCfg.nicho);
  let corpo;

  if (paginaCfg.nicho === 'beleza') {
    if (item.fonte_id === 'open-beauty') {
      const ref = String(item.titulo || '');
      if (/solar|sunscreen|fps|protetor/i.test(ref)) {
        corpo =
          'O protetor solar é um dos passos mais importantes da rotina de pele. ' +
          'Na hora de escolher, observe o FPS e o tipo de pele — e, em caso de dúvida, ' +
          'peça orientação a um profissional de saúde.';
      } else if (/hidrat|moistur/i.test(ref)) {
        corpo =
          'Manter a pele hidratada ajuda na barreira cutânea e no conforto do dia a dia. ' +
          'Prefira texturas adequadas ao seu tipo de pele e evite promessas milagrosas.';
      } else {
        corpo =
          'Na hora de escolher cosméticos, ler o rótulo e conhecer ingredientes básicos ' +
          'faz diferença. Informação educativa — não substitui orientação profissional.';
      }
    } else {
      const fato = primeiraFraseUtil(item.descricao, 200);
      if (fato && parecePortugues(fato) && !pareceIngles(fato)) {
        corpo =
          `${fato} Informação educativa — não substitui orientação de um profissional de saúde.`;
      } else {
        corpo =
          `${tituloExibicao}: um tema útil para quem monta a rotina de skincare com consciência. ` +
          'Sempre confirme com fontes confiáveis.';
      }
    }
  } else if (paginaCfg.nicho === 'motociclismo') {
    const fato = primeiraFraseUtil(item.descricao, 180);
    if (fato && parecePortugues(fato) && !pareceIngles(fato)) {
      corpo = `Você sabia? ${fato}`;
    } else if (/electric|el[eé]tric/i.test(item.titulo || '')) {
      corpo =
        'As motos elétricas seguem ganhando espaço como opção de mobilidade urbana. ' +
        'Vale acompanhar autonomia, recarga e equipamentos de segurança.';
    } else if (/helmet|capacete/i.test(`${item.titulo} ${item.descricao}`)) {
      corpo =
        'O capacete é o item de segurança mais importante para quem anda de moto. ' +
        'Ajuste, certificação e conservação fazem diferença em cada trajeto.';
    } else {
      corpo =
        `${tituloExibicao}. Para quem anda de moto, equipamento e atenção no trânsito ` +
        'continuam sendo a base da segurança.';
    }
  } else if (paginaCfg.nicho === 'casa') {
    if (item.fonte_id === 'taco') {
      corpo =
        `Você sabia? ${primeiraFraseUtil(item.descricao, 220)} ` +
        'Útil para quem quer escolher melhor os alimentos no dia a dia.';
    } else if (item.fonte_id === 'open-meteo' && item.dica_casa) {
      corpo = item.dica_casa;
    } else {
      const fato = primeiraFraseUtil(item.descricao, 180);
      corpo =
        fato && parecePortugues(fato) && !pareceIngles(fato)
          ? fato
          : `${tituloExibicao}: ideia prática para organização, limpeza ou rotina em casa.`;
    }
  } else {
    const t = `${item.titulo || ''} ${item.descricao || ''}`;
    if (/\b(ai|artificial intelligence|llm|gpt)\b/i.test(t)) {
      corpo =
        'A inteligência artificial continua mudando a forma como empresas organizam tarefas, ' +
        'atendem clientes e analisam resultados. O ponto prático: usar a ferramenta certa ' +
        'pode economizar tempo no dia a dia.';
    } else if (/\bstartup|funding\b/i.test(t)) {
      corpo =
        'O ecossistema de startups segue movimentado. Para quem empreende ou vende online, ' +
        'acompanhar essas tendências ajuda a enxergar oportunidades de produto e marketing.';
    } else if (/\bmarketing|ecommerce|e-commerce|affiliate\b/i.test(t)) {
      corpo =
        'No marketing digital e no e-commerce, pequenas melhorias de processo e comunicação ' +
        'costumam gerar mais resultado do que grandes mudanças de uma só vez.';
    } else if (/\bproductivity|automat|tool\b/i.test(t)) {
      corpo =
        'Ferramentas de produtividade e automação ajudam a reduzir tarefas repetitivas. ' +
        'O segredo é escolher o que realmente encaixa na sua rotina — e não acumular apps.';
    } else {
      corpo =
        `${tituloExibicao}. Uma provocação útil para quem acompanha negócios digitais ` +
        'e quer aplicar tecnologia de forma prática.';
    }
  }

  corpo = encurtar(corpo.replace(/\s+/g, ' ').trim(), 420);

  // SEM link externo — apenas a automação Shopee pode publicar com link de produto
  const linhas = [
    `${emoji} ${rotulo}`,
    '',
    corpo,
    '',
    `Fonte de inspiração: ${fonte}`,
  ];
  if (item.licenca) {
    linhas.push(`Atribuição: ${item.licenca}`);
  }

  return {
    texto: linhas.join('\n'),
    titulo: tituloExibicao,
    titulo_original: item.titulo,
    titulo_adaptado: tituloExibicao,
    url_fonte_interna: item.url || '',
    url: '',
    imagem: '',
    fonte_id: item.fonte_id,
    fonte_nome: fonte,
    id_unico: item.id_unico,
    tem_link: false,
  };
}

function validarPost(post) {
  if (!post || !post.texto) return { ok: false, motivo: 'sem_texto' };
  if (post.texto.length < 50) return { ok: false, motivo: 'muito_curto' };
  if (!/fonte/i.test(post.texto)) return { ok: false, motivo: 'sem_fonte' };
  if (/https?:\/\//i.test(post.texto)) {
    return { ok: false, motivo: 'contem_link_externo' };
  }
  if (/saiba mais/i.test(post.texto)) {
    return { ok: false, motivo: 'bloco_saiba_mais_proibido' };
  }
  return { ok: true };
}

module.exports = {
  gerarPost,
  validarPost,
  avaliarTextoFinal,
  primeiraFraseUtil,
  tituloAdaptado,
};

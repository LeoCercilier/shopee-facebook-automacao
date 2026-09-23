'use strict';

const { pareceIngles, parecePortugues } = require('./filtro');
const { avaliarTextoFinal } = require('./avaliador-texto');
const { urlImagemValida } = require('./publicador');

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

function rotuloNatural(paginaCfg) {
  const custom = paginaCfg.rotulo_natural || paginaCfg.rotulo;
  if (custom && custom !== String(custom).toUpperCase()) {
    return String(custom).trim();
  }
  const map = {
    marketing: 'Insight de tecnologia',
    beleza: 'Cuidado com a pele',
    motociclismo: 'Curiosidade das duas rodas',
    casa: 'Dica para casa',
  };
  return map[paginaCfg.nicho] || 'Curiosidade';
}

function tituloAdaptado(item, nicho) {
  const orig = String(item.titulo_pt || item.titulo || '').trim();
  if (!orig) return '';
  if (parecePortugues(orig) && !pareceIngles(orig)) return encurtar(orig, 90);

  const low = orig.toLowerCase();
  if (nicho === 'marketing') {
    if (/\b(ai|artificial intelligence|llm|gpt|openai)\b/i.test(low)) {
      return 'Como a IA pode ajudar no dia a dia do negócio';
    }
    if (/\bstartup|funding|raise[sd]?\b/i.test(low)) {
      return 'O que o mercado de startups está mostrando agora';
    }
    if (/\bmarketing|ecommerce|e-commerce|affiliate\b/i.test(low)) {
      return 'Uma ideia prática de marketing digital';
    }
    if (/\bproductivity|tool|automat/i.test(low)) {
      return 'Produtividade: menos esforço, mais foco';
    }
    return 'Tecnologia aplicada a negócios de forma simples';
  }
  if (nicho === 'motociclismo') {
    if (/\belectric|el[eé]tric/i.test(low)) {
      return 'Motos elétricas e mobilidade urbana';
    }
    if (/\bhelmet|capacete\b/i.test(low)) {
      return 'Capacete: o detalhe que protege de verdade';
    }
    if (/\bmotogp\b/i.test(low)) {
      return 'O que está em alta no MotoGP';
    }
    return 'No universo das duas rodas';
  }
  if (nicho === 'beleza') {
    if (/\bfps|solar|sunscreen|protetor\b/i.test(low)) {
      return 'Proteção solar sem complicação';
    }
    if (/\bhidrat|moistur/i.test(low)) {
      return 'Hidratação que faz sentido na rotina';
    }
    return 'Cuidados com a pele no dia a dia';
  }
  return encurtar(orig, 80);
}

function detalheUtil(nicho, item) {
  const t = `${item.titulo || ''} ${item.descricao || ''}`;
  if (nicho === 'marketing') {
    if (/\b(ai|llm|gpt)\b/i.test(t)) {
      return 'Um bom ponto de partida é testar uma única tarefa repetitiva antes de automatizar tudo.';
    }
    if (/\bmarketing|ecommerce|e-commerce\b/i.test(t)) {
      return 'Medir uma métrica simples (clique, resposta ou venda) costuma valer mais do que várias campanhas soltas.';
    }
    return 'Guardar uma ideia por vez e aplicar na prática costuma render mais do que acumular tendências.';
  }
  if (nicho === 'beleza') {
    if (/solar|fps|sunscreen|protetor/i.test(t)) {
      return 'Reaplicar ao longo do dia, principalmente após suor ou água, faz diferença no resultado.';
    }
    if (/hidrat|moistur/i.test(t)) {
      return 'Aplicar com a pele ainda levemente úmida ajuda a selar a hidratação.';
    }
    return 'Mudanças na pele pedem paciência: resultados costumam aparecer com consistência, não da noite para o dia.';
  }
  if (nicho === 'motociclismo') {
    if (/helmet|capacete/i.test(t)) {
      return 'Troque o capacete após impacto forte ou quando a espuma interna começar a ceder.';
    }
    if (/electric|el[eé]tric/i.test(t)) {
      return 'Antes de comprar, confira autonomia real no seu trajeto e tempo de recarga disponível.';
    }
    return 'Revisar freios, pneus e luzes com regularidade evita sustos no trajeto do dia a dia.';
  }
  if (nicho === 'casa') {
    if (item.fonte_id === 'taco') {
      return 'Comparar rótulos e porções ajuda a montar refeições mais equilibradas em casa.';
    }
    return 'Uma mudança pequena e constante na organização costuma ser mais fácil de manter.';
  }
  return '';
}

function conviteSeguir(paginaCfg) {
  if (paginaCfg.convite_seguir === false) return '';
  const nome = paginaCfg.nome_curto || paginaCfg.nome || 'a Página';
  const opcoes = [
    `Se esse tipo de conteúdo ajuda você, siga ${nome} para receber mais dicas no feed.`,
    `Curtiu? Siga ${nome} e acompanhe próximos conteúdos no seu feed.`,
  ];
  const idx = String(paginaCfg.pageId || '').length % opcoes.length;
  return opcoes[idx];
}

function gerarPost({ item, paginaCfg }) {
  const emoji = paginaCfg.emoji || '💡';
  const rotulo = rotuloNatural(paginaCfg);
  const fonte = item.fonte_nome || 'Fonte';
  const tituloExibicao = tituloAdaptado(item, paginaCfg.nicho);
  // Imagem só da fonte/coleta — nunca inventar; nunca colocar URL no texto
  const imagem = urlImagemValida(item.imagem);
  let corpo;

  if (paginaCfg.nicho === 'beleza') {
    if (item.fonte_id === 'open-beauty') {
      const ref = String(item.titulo || '');
      if (/solar|sunscreen|fps|protetor/i.test(ref)) {
        corpo =
          'O protetor solar continua sendo um dos passos mais importantes da rotina de pele. ' +
          'Na hora de escolher, observe o FPS e o que funciona melhor para o seu tipo de pele — ' +
          'e, em caso de dúvida, peça orientação a um profissional de saúde.';
      } else if (/hidrat|moistur/i.test(ref)) {
        corpo =
          'Manter a pele hidratada ajuda na barreira cutânea e no conforto do dia a dia. ' +
          'Prefira texturas adequadas ao seu tipo de pele e desconfie de promessas milagrosas.';
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
        'As motos elétricas seguem ganhando espaço na mobilidade urbana. ' +
        'Vale olhar autonomia, recarga e equipamentos de segurança antes de qualquer decisão.';
    } else if (/helmet|capacete/i.test(`${item.titulo} ${item.descricao}`)) {
      corpo =
        'O capacete é o item de segurança mais importante para quem anda de moto. ' +
        'Ajuste correto, certificação e conservação fazem diferença em cada trajeto.';
    } else {
      corpo =
        `${tituloExibicao}. Para quem anda de moto, equipamento em ordem e atenção no trânsito ` +
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
          : `${tituloExibicao}: uma ideia prática para organização, limpeza ou rotina em casa.`;
    }
  } else {
    const t = `${item.titulo || ''} ${item.descricao || ''}`;
    if (/\b(ai|artificial intelligence|llm|gpt)\b/i.test(t)) {
      corpo =
        'A inteligência artificial está mudando a forma como empresas organizam tarefas, ' +
        'atendem clientes e analisam resultados. Na prática, escolher bem a ferramenta ' +
        'pode economizar tempo no dia a dia.';
    } else if (/\bstartup|funding\b/i.test(t)) {
      corpo =
        'O ecossistema de startups segue em movimento. Para quem empreende ou vende online, ' +
        'acompanhar essas mudanças ajuda a enxergar oportunidades de produto e marketing.';
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

  const detalhe = detalheUtil(paginaCfg.nicho, item);
  if (detalhe) {
    corpo = `${corpo} ${detalhe}`;
  }
  corpo = encurtar(corpo.replace(/\s+/g, ' ').trim(), 480);

  const convite = conviteSeguir(paginaCfg);

  const linhas = [`${emoji} ${rotulo}`, '', corpo, '', `Fonte de inspiração: ${fonte}`];
  if (item.licenca) {
    linhas.push(`Atribuição: ${item.licenca}`);
  }
  if (convite) {
    linhas.push('', convite);
  }

  return {
    texto: linhas.join('\n'),
    titulo: tituloExibicao,
    titulo_original: item.titulo,
    titulo_adaptado: tituloExibicao,
    url_fonte_interna: item.url || '',
    url: '',
    imagem,
    fonte_id: item.fonte_id,
    fonte_nome: fonte,
    id_unico: item.id_unico,
    tem_link: false,
    graph_extras: {
      text_format_preset_id: null,
      place: paginaCfg.place_id || null,
      feeling: paginaCfg.feeling || null,
    },
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
  if (/INSIGHT DE TECNOLOGIA|CUIDADO COM A PELE|CURIOSIDADE DAS DUAS RODAS|DICA PARA CASA/.test(post.texto)) {
    return { ok: false, motivo: 'rotulo_em_maiusculas' };
  }
  return { ok: true };
}

module.exports = {
  gerarPost,
  validarPost,
  avaliarTextoFinal,
  primeiraFraseUtil,
  tituloAdaptado,
  rotuloNatural,
  detalheUtil,
};

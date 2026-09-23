'use strict';

function encurtar(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function gerarPost({ item, paginaCfg }) {
  const emoji = paginaCfg.emoji || '💡';
  const rotulo = paginaCfg.rotulo || 'CURIOSIDADE';
  const fonte = item.fonte_nome || 'Fonte';
  const titulo = encurtar(item.titulo, 100);

  let corpo;
  if (paginaCfg.nicho === 'beleza') {
    corpo =
      `Um tópico útil sobre pele e autocuidado: ${titulo}. ` +
      `Resumo educativo com base em fonte pública — não substitui orientação de um profissional de saúde.`;
    if (item.descricao) {
      corpo += ` ${encurtar(item.descricao, 180)}`;
    }
  } else if (paginaCfg.nicho === 'motociclismo') {
    corpo =
      `No universo das duas rodas: ${titulo}. ` +
      (item.descricao ? encurtar(item.descricao, 200) : 'Conteúdo de referência para quem acompanha motos e trânsito.');
  } else if (paginaCfg.nicho === 'casa') {
    if (item.fonte_id === 'themealdb') {
      corpo = `Ideia para a cozinha: ${titulo}. ${item.descricao || ''}`.trim();
    } else if (item.fonte_id === 'dog-ceo') {
      corpo = `Momento pet para alegrar o dia: ${titulo}.`;
    } else if (item.fonte_id === 'open-meteo') {
      corpo = `${titulo}. ${item.descricao || ''} Dica: ajuste ventilação e rotina de casa conforme o clima.`.
        replace(/\.\s*\./g, '.');
    } else {
      corpo = `${titulo}. ${encurtar(item.descricao || '', 200)}`;
    }
  } else {
    // marketing / tech
    corpo =
      `${titulo}. ` +
      (item.descricao
        ? encurtar(item.descricao, 200)
        : 'Destaque de tecnologia, negócios ou inovação para inspirar sua rotina digital.');
  }

  corpo = encurtar(corpo, 450);

  const linhas = [`${emoji} ${rotulo}`, '', corpo];
  if (item.url) {
    linhas.push('', '🔎 Saiba mais:', item.url);
  }
  linhas.push('', `Fonte: ${fonte}`);
  if (item.licenca) {
    linhas.push(`Licença/atribuição: ${item.licenca}`);
  }

  const texto = linhas.join('\n');

  return {
    texto,
    titulo: item.titulo,
    url: item.url || '',
    imagem: item.imagem || '',
    fonte_id: item.fonte_id,
    fonte_nome: fonte,
    id_unico: item.id_unico,
  };
}

function validarPost(post) {
  if (!post || !post.texto) return { ok: false, motivo: 'sem_texto' };
  if (post.texto.length < 40) return { ok: false, motivo: 'muito_curto' };
  if (!/fonte:/i.test(post.texto)) return { ok: false, motivo: 'sem_fonte' };
  return { ok: true };
}

module.exports = { gerarPost, validarPost };

const fs = require('fs');
const { classificarOferta } = require('./classificar');
const { gerarOpcoesCopy } = require('./copy-content-creator');
const {
  validarEntradaProduto,
  validarCopy,
  montarAnuncioFinal,
  validarAnuncioFinal,
} = require('./validador-modulo2');

const ARQUIVO_ENTRADA = 'resultado-oferta.json';
const ARQUIVO_SAIDA = 'postagem-final.json';

/**
 * Módulo 2 – formata a oferta para publicação.
 *
 * Fluxo:
 *   resultado-oferta.json
 *   → valida dados críticos (título, preço, link)
 *   → monta anúncio com TÍTULO, PREÇO e LINK originais do JSON
 *   → valida anúncio final (título/preço/link obrigatórios no texto)
 *   → postagem-final.json
 *
 * Formato do texto:
 *   🔥 OFERTA DO DIA
 *   [título real]
 *   💰 [preço]
 *   🛍️ Confira na Shopee:
 *   [link]
 *
 * A camada de copy NÃO substitui o título nem define preço/link.
 */
function gerarPostagem() {
  if (!fs.existsSync(ARQUIVO_ENTRADA)) {
    throw new Error(`Arquivo ${ARQUIVO_ENTRADA} não encontrado.`);
  }

  const resultado = JSON.parse(fs.readFileSync(ARQUIVO_ENTRADA, 'utf8'));

  // Coletor pode indicar que não há oferta elegível nesta execução
  if (resultado.sem_oferta_elegivel || !resultado.produto) {
    const vazio = {
      sucesso: true,
      pulado: true,
      motivo: resultado.motivo || 'sem_produto',
      gerado_em: new Date().toISOString(),
      texto: null,
      produto: null,
    };
    fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(vazio, null, 2), 'utf8');
    console.log('');
    console.log('================================');
    console.log('MÓDULO 2 – SEM OFERTA PARA FORMATAR');
    console.log('================================');
    console.log('Motivo:', vazio.motivo);
    console.log('Arquivo:', ARQUIVO_SAIDA);
    return vazio;
  }

  const produtoOriginal = resultado.produto;
  const entrada = validarEntradaProduto(produtoOriginal);
  if (!entrada.ok) {
    throw new Error(
      `Dados críticos inválidos em resultado-oferta.json: ${entrada.erros.join(', ')}`
    );
  }

  // Valores críticos — congelados a partir do JSON (única fonte da verdade)
  const titulo = String(produtoOriginal.titulo).trim();
  const preco = String(produtoOriginal.preco).trim();
  const link = String(produtoOriginal.link).trim();
  const imagens = Array.isArray(produtoOriginal.imagens)
    ? produtoOriginal.imagens
    : [];
  const imagem = imagens.length > 0 ? imagens[0] : '';

  const nicho = classificarOferta({ titulo });

  // Content Creator permanece disponível só como metadado opcional.
  // NÃO entra no corpo principal da postagem (título real vem do JSON).
  let opcoesValidas = [];
  try {
    const opcoesBrutas = gerarOpcoesCopy({ titulo, nicho });
    for (const op of opcoesBrutas) {
      const v = validarCopy(op.texto, { preco, link });
      if (v.ok) opcoesValidas.push({ ...op, validacao: v });
    }
  } catch (err) {
    console.log('Aviso Content Creator (metadado):', err.message);
    opcoesValidas = [];
  }

  // Montagem determinística: TÍTULO + PREÇO + LINK só do JSON original
  const texto = montarAnuncioFinal({ titulo, preco, link });

  const vFinal = validarAnuncioFinal(texto, { titulo, preco, link });
  if (!vFinal.ok) {
    throw new Error(
      'Validação final falhou: título/preço/link não conferem com o original. ' +
        JSON.stringify(vFinal.checks)
    );
  }

  return gravarPostagem({
    titulo,
    preco,
    link,
    imagem,
    imagens,
    nicho,
    texto,
    opcoesValidas,
    copy_selecionada: {
      id: 0,
      estilo: 'titulo_original',
      texto: titulo,
    },
    validacao_final: vFinal,
  });
}

function gravarPostagem({
  titulo,
  preco,
  link,
  imagem,
  imagens,
  nicho,
  texto,
  opcoesValidas,
  copy_selecionada,
  validacao_final,
}) {
  const postagem = {
    sucesso: true,
    gerado_em: new Date().toISOString(),

    // Dados críticos (espelho do resultado-oferta.json)
    titulo,
    preco,
    link,
    imagem,
    nicho,

    produto: {
      titulo,
      preco,
      link,
      imagens,
      imagem,
    },

    // Content Creator (metadado opcional — não usado no corpo da postagem)
    copy_opcoes: opcoesValidas.map((o) => ({
      id: o.id,
      estilo: o.estilo,
      texto: o.texto,
    })),
    copy_selecionada: {
      id: copy_selecionada.id,
      estilo: copy_selecionada.estilo,
      texto: copy_selecionada.texto,
    },

    validacao: {
      titulo_origem: 'resultado-oferta.json',
      preco_origem: 'resultado-oferta.json',
      link_origem: 'resultado-oferta.json',
      titulo_preservado: validacao_final.checks.titulo_exato,
      preco_preservado: validacao_final.checks.preco_exato,
      link_preservado: validacao_final.checks.link_exato,
      checks: validacao_final.checks,
    },

    texto,
  };

  fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(postagem, null, 2), 'utf8');

  console.log('');
  console.log('================================');
  console.log('POSTAGEM GERADA COM SUCESSO');
  console.log('================================');
  console.log('Título :', titulo);
  console.log('Preço  :', preco, '(origem: resultado-oferta.json)');
  console.log('Link   :', link, '(origem: resultado-oferta.json)');
  console.log('Imagem :', imagem || '(não disponível)');
  console.log('Nicho  :', nicho);
  console.log('Corpo  : título real do produto (resultado-oferta.json)');
  console.log('Validação título/preço/link:', validacao_final.ok ? 'OK' : 'FALHA');
  console.log('');
  console.log('--- Texto da postagem ---');
  console.log(texto);
  console.log('-------------------------');
  console.log('Arquivo criado:', ARQUIVO_SAIDA);

  return postagem;
}

try {
  gerarPostagem();
} catch (erro) {
  console.error('');
  console.error('ERRO NO MÓDULO 2:');
  console.error(erro.message);
  process.exit(1);
}

module.exports = { gerarPostagem };

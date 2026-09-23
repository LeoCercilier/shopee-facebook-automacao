const fs = require('fs');
const { classificarOferta } = require('./classificar');
const {
  gerarOpcoesCopy,
  selecionarCopy,
  copyFallback,
} = require('./copy-content-creator');
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
 *   → Content Creator gera até 3 opções de copy (só texto de gancho)
 *   → valida cada copy (sem URL/preço/reivindicações)
 *   → monta anúncio com PREÇO e LINK originais do JSON
 *   → valida anúncio final
 *   → postagem-final.json
 *
 * A camada de copy NUNCA define preço nem link.
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

  // --- Content Creator: até 3 opções (custo zero, sem API) ---
  let opcoesBrutas = [];
  try {
    opcoesBrutas = gerarOpcoesCopy({ titulo, nicho });
  } catch (err) {
    console.log('Aviso Content Creator:', err.message);
    opcoesBrutas = [];
  }

  const opcoesValidas = [];
  for (const op of opcoesBrutas) {
    const v = validarCopy(op.texto, { preco, link });
    if (v.ok) {
      opcoesValidas.push({ ...op, validacao: v });
    } else {
      console.log(`  Copy #${op.id} descartada: ${v.motivo}`);
    }
  }

  const preferida = process.env.COPY_OPCAO;
  let escolhida = selecionarCopy(opcoesValidas, preferida);
  if (!escolhida || !escolhida.texto) {
    escolhida = { id: 0, estilo: 'fallback', texto: copyFallback() };
  }

  // Revalida a escolhida; se falhar, fallback duro
  const vCopy = validarCopy(escolhida.texto, { preco, link });
  const copyFinal = vCopy.ok ? escolhida.texto : copyFallback();

  // Montagem determinística: preço e link só do JSON original
  const texto = montarAnuncioFinal({
    copySelecionada: copyFinal,
    titulo,
    preco,
    link,
  });

  const vFinal = validarAnuncioFinal(texto, { preco, link });
  if (!vFinal.ok) {
    // Última proteção: reconstrói com fallback e valida de novo
    const textoSeguro = montarAnuncioFinal({
      copySelecionada: copyFallback(),
      titulo,
      preco,
      link,
    });
    const v2 = validarAnuncioFinal(textoSeguro, { preco, link });
    if (!v2.ok) {
      throw new Error(
        'Validação final falhou: preço/link não conferem com o original.'
      );
    }
    return gravarPostagem({
      titulo,
      preco,
      link,
      imagem,
      imagens,
      nicho,
      texto: textoSeguro,
      opcoesValidas,
      copy_selecionada: { id: 0, estilo: 'fallback', texto: copyFallback() },
      validacao_final: v2,
    });
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
    copy_selecionada: { ...escolhida, texto: copyFinal },
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

    // Content Creator
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
      preco_origem: 'resultado-oferta.json',
      link_origem: 'resultado-oferta.json',
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
  console.log('Copy   :', copy_selecionada.estilo, `(#${copy_selecionada.id})`);
  console.log('Opções :', opcoesValidas.length);
  console.log('Validação preço/link:', validacao_final.ok ? 'OK' : 'FALHA');
  console.log('');
  console.log('--- Opções de copy ---');
  for (const o of opcoesValidas) {
    console.log(`  [${o.id}] ${o.texto}`);
  }
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

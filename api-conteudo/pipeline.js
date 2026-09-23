'use strict';

const fs = require('fs');
const path = require('path');
const { coletarFontes } = require('./coletor');
const { filtrarElegiveis, selecionarUm } = require('./filtro');
const { gerarPost, validarPost } = require('./gerador');
const { publicarNaPagina } = require('./publicador');
const historico = require('./historico');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'config', 'apis-conteudo.json');
const RESULTADO = path.join(ROOT, 'resultado-api-conteudo.json');

async function processarPagina(paginaCfg) {
  console.log('');
  console.log('────────────────────────────────────');
  console.log(`Página: ${paginaCfg.nome} (${paginaCfg.pageId})`);
  console.log('────────────────────────────────────');

  if (!paginaCfg.ativo || !paginaCfg.pageId) {
    return { page_id: paginaCfg.pageId, status: 'inativa' };
  }

  const coletados = await coletarFontes(paginaCfg.fontes || []);
  const itens = coletados.filter((i) => !i._erro_fonte);
  const elegiveis = filtrarElegiveis(itens, paginaCfg);

  console.log(`  Coletados: ${itens.length} | Elegíveis: ${elegiveis.length}`);

  const escolhido = selecionarUm(elegiveis, paginaCfg);
  if (!escolhido) {
    console.log('  Sem conteúdo elegível. Não publicará.');
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'sem_conteudo',
    };
  }

  console.log(`  Selecionado: ${escolhido.titulo.slice(0, 80)}`);
  console.log(`  Fonte: ${escolhido.fonte_nome}`);
  if (escolhido.url) console.log(`  URL: ${escolhido.url}`);

  const post = gerarPost({ item: escolhido, paginaCfg });
  const val = validarPost(post);
  if (!val.ok) {
    console.log(`  Validação falhou: ${val.motivo}`);
    return {
      page_id: paginaCfg.pageId,
      status: 'validacao_falhou',
      motivo: val.motivo,
    };
  }

  try {
    const api = await publicarNaPagina({
      pageId: paginaCfg.pageId,
      texto: post.texto,
      link: post.url || null,
      imagem: post.imagem || '',
    });

    historico.registrarSucesso({
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      fonte_id: post.fonte_id,
      fonte_nome: post.fonte_nome,
      url: post.url,
      chave: historico.chaveConteudo(escolhido),
      titulo: post.titulo,
      post_id: api.post_id,
    });

    console.log('  ✅ PUBLICADO');
    console.log('  Post ID:', api.post_id);
    console.log('  Tipo:', api.tipo);

    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'publicado',
      post_id: api.post_id,
      tipo: api.tipo,
      titulo: post.titulo,
      url: post.url,
      fonte: post.fonte_nome,
      fonte_id: post.fonte_id,
    };
  } catch (err) {
    console.error('  ❌ Erro:', err.message);
    historico.registrarFalha({
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      fonte_id: escolhido.fonte_id,
      url: escolhido.url,
      titulo: escolhido.titulo,
      erro: err.message,
    });
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'erro',
      erro: err.message,
    };
  }
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('CONTEÚDO VIA APIs PÚBLICAS → FACEBOOK');
  console.log('========================================');

  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const resultados = [];

  for (const pagina of cfg.paginas || []) {
    try {
      resultados.push(await processarPagina(pagina));
    } catch (err) {
      console.error(`Erro em ${pagina.nome}:`, err.message);
      resultados.push({
        page_id: pagina.pageId,
        pagina_nome: pagina.nome,
        status: 'erro',
        erro: err.message,
      });
    }
  }

  const resumo = {
    gerado_em: new Date().toISOString(),
    publicados: resultados.filter((r) => r.status === 'publicado').length,
    sem_conteudo: resultados.filter((r) => r.status === 'sem_conteudo').length,
    erros: resultados.filter((r) => r.status === 'erro').length,
    resultados,
  };

  fs.writeFileSync(RESULTADO, JSON.stringify(resumo, null, 2) + '\n', 'utf8');
  console.log('');
  console.log('========== RESUMO ==========');
  console.log('Publicados:', resumo.publicados);
  console.log('Sem conteúdo:', resumo.sem_conteudo);
  console.log('Erros:', resumo.erros);
  console.log('Arquivo:', RESULTADO);

  const ativos = resultados.filter((r) => r.status !== 'inativa');
  if (ativos.length && ativos.every((r) => r.status === 'erro')) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ERRO FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = { main };

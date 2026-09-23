'use strict';

const fs = require('fs');
const path = require('path');
const { coletarFontes } = require('./coletor-rss');
const { filtrarElegiveis, selecionarUm } = require('./filtro');
const { gerarPost, validarPost } = require('./gerador');
const { publicarNaPagina } = require('./publicador');
const historico = require('./historico');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'editorial.json');
const RESULTADO_PATH = path.join(ROOT, 'resultado-editorial.json');

function carregarConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

async function processarPagina(paginaCfg, cfg) {
  console.log('');
  console.log('────────────────────────────────────');
  console.log(`Página: ${paginaCfg.nome} (${paginaCfg.pageId})`);
  console.log('────────────────────────────────────');

  if (!paginaCfg.ativo) {
    console.log('  Inativa na config. Pulando.');
    return { page_id: paginaCfg.pageId, status: 'inativa' };
  }

  if (!paginaCfg.pageId) {
    console.log('  Sem pageId. Pulando.');
    return { page_id: null, status: 'sem_page_id' };
  }

  const coletados = await coletarFontes(paginaCfg.fontes || []);
  const itens = coletados.filter((i) => !i._erro_fonte);
  const errosFonte = coletados.filter((i) => i._erro_fonte);

  const elegiveis = filtrarElegiveis(itens, paginaCfg, {
    cooldownHoras: cfg.cooldown_horas_mesmo_assunto || 48,
  });

  console.log(
    `  Itens coletados: ${itens.length} | Elegíveis: ${elegiveis.length} | Fontes com erro: ${errosFonte.length}`
  );

  const escolhido = selecionarUm(elegiveis, paginaCfg);
  if (!escolhido) {
    console.log('  Nenhum conteúdo elegível novo. Não publicará nesta Página.');
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'sem_conteudo',
      fontes_com_erro: errosFonte.map((e) => e.fonte_nome),
    };
  }

  console.log(`  Selecionado: ${escolhido.titulo.slice(0, 80)}`);
  console.log(`  Fonte: ${escolhido.fonte_nome}`);
  console.log(`  URL: ${escolhido.url}`);

  const post = gerarPost({ item: escolhido, paginaCfg });
  const validacao = validarPost(post);
  if (!validacao.ok) {
    console.log(`  Validação falhou: ${validacao.motivo}`);
    return {
      page_id: paginaCfg.pageId,
      status: 'validacao_falhou',
      motivo: validacao.motivo,
      titulo: escolhido.titulo,
      url: escolhido.url,
    };
  }

  try {
    const api = await publicarNaPagina({
      pageId: paginaCfg.pageId,
      texto: post.texto,
      link: post.url,
      imagem: post.imagem || '',
    });

    historico.registrarSucesso({
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      fonte_id: post.fonte_id,
      fonte_nome: post.fonte_nome,
      url: post.url,
      titulo: escolhido.titulo,
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
      titulo: escolhido.titulo,
      url: escolhido.url,
      fonte: post.fonte_nome,
      fonte_id: post.fonte_id,
    };
  } catch (err) {
    console.error('  ❌ Falha na publicação:', err.message);
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
      titulo: escolhido.titulo,
      url: escolhido.url,
    };
  }
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('MÓDULO EDITORIAL – PUBLICAÇÃO NAS PAGES');
  console.log('========================================');

  const cfg = carregarConfig();
  const paginas = cfg.paginas || [];
  const resultados = [];

  for (const pagina of paginas) {
    try {
      const r = await processarPagina(pagina, cfg);
      resultados.push(r);
    } catch (err) {
      console.error(`Erro inesperado em ${pagina.nome}:`, err.message);
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

  fs.writeFileSync(RESULTADO_PATH, JSON.stringify(resumo, null, 2) + '\n', 'utf8');

  console.log('');
  console.log('========== RESUMO EDITORIAL ==========');
  console.log('Publicados :', resumo.publicados);
  console.log('Sem conteúdo:', resumo.sem_conteudo);
  console.log('Erros      :', resumo.erros);
  console.log('Arquivo    :', RESULTADO_PATH);
  console.log('Histórico  :', historico.ARQUIVO);

  // Exit 1 só se todas as tentativas ativas falharam com erro de API
  const ativas = resultados.filter(
    (r) => r.status !== 'inativa' && r.status !== 'sem_page_id'
  );
  const soErros =
    ativas.length > 0 && ativas.every((r) => r.status === 'erro');
  if (soErros) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ERRO FATAL EDITORIAL:', err.message);
    process.exit(1);
  });
}

module.exports = { main, processarPagina };

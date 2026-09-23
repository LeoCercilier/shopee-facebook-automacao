'use strict';

const fs = require('fs');
const path = require('path');
const { coletarFontes } = require('./coletor');
const { avaliarItens } = require('./filtro');
const { gerarPost, validarPost } = require('./gerador');
const { avaliarTextoFinal } = require('./avaliador-texto');
const historico = require('./historico');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'config', 'apis-conteudo.json');
const CANDIDATOS = path.join(ROOT, 'resultado-api-candidatos.json');
const RESULTADO = path.join(ROOT, 'resultado-api-conteudo.json');

function podePublicar(cfg) {
  if (cfg.modo_validacao === true) return false;
  if (cfg.publicar === false) return false;
  if (process.env.PUBLICAR_API === 'false') return false;
  if (process.env.PUBLICAR_API === 'true') return true;
  return Boolean(cfg.publicar);
}

function avaliarCandidatoCompleto(item, paginaCfg, cfgGlobal) {
  const minFonte = cfgGlobal.pontuacao_minima_publicacao ?? 75;
  const minTexto = cfgGlobal.pontuacao_minima_texto ?? 80;

  const scoreFonte = item.pontuacao;
  const statusFonte = item.status_curadoria;

  if (scoreFonte < minFonte) {
    return {
      pagina: paginaCfg.nome,
      page_id: paginaCfg.pageId,
      fonte: item.fonte_nome,
      fonte_id: item.fonte_id,
      titulo_original: item.titulo,
      titulo_adaptado: null,
      score_fonte: scoreFonte,
      score_texto: null,
      status: 'rejeitado',
      motivo: `Score da fonte ${scoreFonte} < ${minFonte}. ${(item.motivos_pontuacao || []).slice(0, 2).join('; ')}`,
      texto_final: null,
      url_fonte_interna: item.url || '',
    };
  }

  let post;
  try {
    post = gerarPost({ item, paginaCfg });
  } catch (err) {
    return {
      pagina: paginaCfg.nome,
      page_id: paginaCfg.pageId,
      fonte: item.fonte_nome,
      fonte_id: item.fonte_id,
      titulo_original: item.titulo,
      titulo_adaptado: null,
      score_fonte: scoreFonte,
      score_texto: 0,
      status: 'rejeitado',
      motivo: `Falha ao gerar texto: ${err.message}`,
      texto_final: null,
      url_fonte_interna: item.url || '',
    };
  }

  const val = validarPost(post);
  if (!val.ok) {
    return {
      pagina: paginaCfg.nome,
      page_id: paginaCfg.pageId,
      fonte: item.fonte_nome,
      fonte_id: item.fonte_id,
      titulo_original: item.titulo,
      titulo_adaptado: post.titulo_adaptado || post.titulo,
      score_fonte: scoreFonte,
      score_texto: 0,
      status: 'rejeitado',
      motivo: `Validação estrutural: ${val.motivo}`,
      texto_final: post.texto,
      url_fonte_interna: item.url || '',
    };
  }

  const avTexto = avaliarTextoFinal({
    post,
    item,
    paginaCfg,
    cfgGlobal,
  });

  const aprovadoFinal =
    statusFonte === 'aprovado' &&
    avTexto.score >= minTexto &&
    avTexto.status === 'aprovado';

  return {
    pagina: paginaCfg.nome,
    page_id: paginaCfg.pageId,
    fonte: item.fonte_nome,
    fonte_id: item.fonte_id,
    titulo_original: item.titulo,
    titulo_adaptado: post.titulo_adaptado || post.titulo,
    score_fonte: scoreFonte,
    score_texto: avTexto.score,
    status: aprovadoFinal ? 'aprovado' : 'rejeitado',
    motivo: aprovadoFinal
      ? `Conteúdo relevante e texto adequado (fonte ${scoreFonte}, texto ${avTexto.score})`
      : `Texto insuficiente (${avTexto.score}/${minTexto}). ${(avTexto.motivos || []).slice(0, 3).join('; ')}`,
    motivos_fonte: item.motivos_pontuacao || [],
    motivos_texto: avTexto.motivos || [],
    texto_final: post.texto,
    url_fonte_interna: item.url || '',
    // nunca publicar link externo
    link_no_post: false,
  };
}

async function processarPagina(paginaCfg, cfgGlobal) {
  console.log('');
  console.log('────────────────────────────────────');
  console.log(`Página: ${paginaCfg.nome} (${paginaCfg.pageId})`);
  console.log('────────────────────────────────────');

  if (!paginaCfg.ativo || !paginaCfg.pageId) {
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'inativa',
      candidatos: [],
      stats: {},
    };
  }

  const coletados = await coletarFontes(paginaCfg.fontes || []);
  const itens = coletados.filter((i) => !i._erro_fonte);
  const avaliadosFonte = avaliarItens(itens, paginaCfg, cfgGlobal);

  const candidatos = [];
  for (const item of avaliadosFonte.slice(0, 20)) {
    const c = avaliarCandidatoCompleto(item, paginaCfg, cfgGlobal);
    candidatos.push(c);

    if (c.status === 'aprovado') {
      console.log(`[APROVADO]`);
      console.log(`  Fonte: ${c.fonte}`);
      console.log(`  Score fonte: ${c.score_fonte}`);
      console.log(`  Score texto: ${c.score_texto}`);
      console.log(`  Motivo: ${c.motivo}`);
    } else if (c.score_fonte >= (cfgGlobal.pontuacao_minima_publicacao ?? 75)) {
      console.log(`[REJEITADO]`);
      console.log(`  Fonte: ${c.fonte}`);
      console.log(`  Score fonte: ${c.score_fonte}`);
      console.log(`  Score texto: ${c.score_texto}`);
      console.log(`  Motivo: ${c.motivo}`);
    }
  }

  const aprovadosFonte = avaliadosFonte.filter(
    (i) => i.pontuacao >= (cfgGlobal.pontuacao_minima_publicacao ?? 75)
  ).length;
  const aprovadosTexto = candidatos.filter((c) => c.status === 'aprovado');
  const rejeitados = candidatos.filter((c) => c.status === 'rejeitado').length;

  console.log(`  Coletados: ${itens.length}`);
  console.log(`  Aprovados pela fonte: ${aprovadosFonte}`);
  console.log(`  Aprovados no texto final: ${aprovadosTexto.length}`);
  console.log(`  Rejeitados: ${rejeitados}`);
  console.log(`  Publicados: 0`);
  console.log(`  Motivo de não publicação: modo validação / política sem link externo`);

  const melhor = aprovadosTexto.sort(
    (a, b) => b.score_texto + b.score_fonte - (a.score_texto + a.score_fonte)
  )[0] || null;

  if (!melhor) {
    console.log('  ℹ️ Nenhum conteúdo passou nas duas etapas de curadoria.');
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'sem_conteudo_qualificado',
      candidatos,
      stats: {
        coletados: itens.length,
        aprovados_fonte: aprovadosFonte,
        aprovados_texto: 0,
        rejeitados,
        publicados: 0,
      },
    };
  }

  const publicarAgora = podePublicar(cfgGlobal);
  if (!publicarAgora) {
    console.log('  🔒 Modo validação: NÃO publicará no Facebook.');
    console.log('  🔒 Posts de API NÃO levam link (só Shopee pode ter link).');
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'aprovado_validacao',
      melhor,
      candidatos,
      stats: {
        coletados: itens.length,
        aprovados_fonte: aprovadosFonte,
        aprovados_texto: aprovadosTexto.length,
        rejeitados,
        publicados: 0,
      },
    };
  }

  // Publicação futura: texto SEM link externo
  const { publicarNaPagina } = require('./publicador');
  try {
    const api = await publicarNaPagina({
      pageId: paginaCfg.pageId,
      texto: melhor.texto_final,
      link: null,
      imagem: '',
    });
    historico.registrarSucesso({
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      fonte_id: melhor.fonte_id,
      fonte_nome: melhor.fonte,
      url: melhor.url_fonte_interna || '',
      chave: historico.chaveConteudo({
        url: melhor.url_fonte_interna,
        titulo: melhor.titulo_original,
      }),
      titulo: melhor.titulo_adaptado,
      post_id: api.post_id,
    });
    console.log('  ✅ PUBLICADO', api.post_id);
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'publicado',
      post_id: api.post_id,
      melhor,
      candidatos,
      stats: {
        coletados: itens.length,
        aprovados_fonte: aprovadosFonte,
        aprovados_texto: aprovadosTexto.length,
        rejeitados,
        publicados: 1,
      },
    };
  } catch (err) {
    console.error('  ❌ Erro:', err.message);
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'erro',
      erro: err.message,
      candidatos,
      stats: {
        coletados: itens.length,
        aprovados_fonte: aprovadosFonte,
        aprovados_texto: aprovadosTexto.length,
        rejeitados,
        publicados: 0,
      },
    };
  }
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('CURADORIA VIA APIs (2 ETAPAS)');
  console.log('========================================');

  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const validacao = podePublicar(cfg) === false;
  console.log(
    validacao
      ? 'Modo: VALIDAÇÃO (sem publicação no Facebook)'
      : 'Modo: PUBLICAÇÃO REAL'
  );
  console.log('Mín. score fonte:', cfg.pontuacao_minima_publicacao ?? 75);
  console.log('Mín. score texto:', cfg.pontuacao_minima_texto ?? 80);
  console.log('Links no post de API: PROIBIDOS (somente Shopee pode ter link)');

  const resultados = [];
  for (const pagina of cfg.paginas || []) {
    try {
      resultados.push(await processarPagina(pagina, cfg));
    } catch (err) {
      console.error(`Erro em ${pagina.nome}:`, err.message);
      resultados.push({
        page_id: pagina.pageId,
        pagina_nome: pagina.nome,
        status: 'erro',
        erro: err.message,
        candidatos: [],
        stats: {},
      });
    }
  }

  const payload = {
    gerado_em: new Date().toISOString(),
    modo: validacao ? 'validacao' : 'publicacao',
    politica_links: 'somente_shopee_pode_ter_link',
    pontuacao_minima_fonte: cfg.pontuacao_minima_publicacao ?? 75,
    pontuacao_minima_texto: cfg.pontuacao_minima_texto ?? 80,
    paginas: resultados.map((r) => ({
      pagina: r.pagina_nome,
      page_id: r.page_id,
      status: r.status,
      stats: r.stats || {},
      melhor: r.melhor || null,
      candidatos: r.candidatos || [],
    })),
  };

  fs.writeFileSync(CANDIDATOS, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  fs.writeFileSync(
    RESULTADO,
    JSON.stringify(
      {
        gerado_em: payload.gerado_em,
        modo: payload.modo,
        politica_links: payload.politica_links,
        resumo: resultados.map((r) => ({
          pagina: r.pagina_nome,
          status: r.status,
          stats: r.stats || {},
          melhor_titulo: r.melhor ? r.melhor.titulo_adaptado : null,
          score_fonte: r.melhor ? r.melhor.score_fonte : null,
          score_texto: r.melhor ? r.melhor.score_texto : null,
        })),
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  console.log('');
  console.log('========== RESUMO ==========');
  for (const r of resultados) {
    const s = r.stats || {};
    console.log(
      `  ${r.pagina_nome}: ${r.status} | coletados=${s.coletados ?? 0} fonte_ok=${s.aprovados_fonte ?? 0} texto_ok=${s.aprovados_texto ?? 0} rej=${s.rejeitados ?? 0} pub=${s.publicados ?? 0}`
    );
  }
  console.log('Arquivo:', CANDIDATOS);
  console.log('Nenhuma obrigação de preencher todas as Páginas.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ERRO FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = { main };

'use strict';

const fs = require('fs');
const path = require('path');
const { coletarFontes } = require('./coletor');
const { avaliarItens, filtrarElegiveis, selecionarUm } = require('./filtro');
const { gerarPost, validarPost } = require('./gerador');
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

async function processarPagina(paginaCfg, cfgGlobal) {
  console.log('');
  console.log('────────────────────────────────────');
  console.log(`Página: ${paginaCfg.nome} (${paginaCfg.pageId})`);
  console.log('────────────────────────────────────');

  if (!paginaCfg.ativo || !paginaCfg.pageId) {
    return { page_id: paginaCfg.pageId, status: 'inativa', candidatos: [] };
  }

  const coletados = await coletarFontes(paginaCfg.fontes || []);
  const itens = coletados.filter((i) => !i._erro_fonte);
  const avaliados = avaliarItens(itens, paginaCfg, cfgGlobal);

  // Log dos top candidatos (até 8)
  const top = avaliados.slice(0, 8);
  for (const c of top) {
    const st =
      c.status_curadoria === 'aprovado'
        ? 'APROVADO'
        : c.status_curadoria === 'candidato_fraco'
          ? 'FRACO'
          : 'REJEITADO';
    console.log(
      `  [${st}] ${c.pontuacao}/100 — ${(c.titulo || '').slice(0, 55)}`
    );
    console.log(`         Fonte: ${c.fonte_nome} | ${c.motivos_pontuacao.slice(0, 3).join('; ')}`);
  }

  const elegiveis = filtrarElegiveis(itens, paginaCfg, cfgGlobal);
  console.log(
    `  Coletados: ${itens.length} | ≥ mínima: ${elegiveis.length}`
  );

  const candidatosExport = avaliados.slice(0, 12).map((c) => {
    let postPreview = null;
    if (c.pontuacao >= 60) {
      try {
        const p = gerarPost({ item: c, paginaCfg });
        postPreview = {
          texto: p.texto,
          titulo: p.titulo,
          validacao: validarPost(p),
        };
      } catch (_) {
        postPreview = null;
      }
    }
    return {
      fonte: c.fonte_nome,
      fonte_id: c.fonte_id,
      titulo_original: c.titulo,
      titulo: c.titulo_pt || c.titulo,
      resumo: (c.descricao || '').slice(0, 280),
      url: c.url || '',
      imagem: c.imagem || '',
      pontuacao: c.pontuacao,
      status: c.status_curadoria,
      motivos: c.motivos_pontuacao,
      preview_post: postPreview,
    };
  });

  const escolhido = selecionarUm(elegiveis, paginaCfg);

  if (!escolhido) {
    console.log(
      '  ℹ️ Nenhum conteúdo atingiu a pontuação mínima para publicação.'
    );
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'sem_conteudo_qualificado',
      candidatos: candidatosExport,
    };
  }

  const post = gerarPost({ item: escolhido, paginaCfg });
  const val = validarPost(post);
  console.log(`  Melhor candidato: ${post.titulo.slice(0, 70)}`);
  console.log(`  Pontuação: ${escolhido.pontuacao}/100`);
  console.log(`  Validação do texto: ${val.ok ? 'ok' : val.motivo}`);

  if (!val.ok) {
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'validacao_falhou',
      motivo: val.motivo,
      candidatos: candidatosExport,
    };
  }

  const publicarAgora = podePublicar(cfgGlobal);
  if (!publicarAgora) {
    console.log('  🔒 Modo validação: NÃO publicará no Facebook.');
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'aprovado_validacao',
      pontuacao: escolhido.pontuacao,
      titulo: post.titulo,
      url: post.url,
      fonte: post.fonte_nome,
      preview: post.texto,
      candidatos: candidatosExport,
    };
  }

  // Publicação real (só quando modo_validacao=false e publicar=true)
  const { publicarNaPagina } = require('./publicador');
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
    console.log('  ✅ PUBLICADO', api.post_id);
    return {
      page_id: paginaCfg.pageId,
      pagina_nome: paginaCfg.nome,
      status: 'publicado',
      post_id: api.post_id,
      pontuacao: escolhido.pontuacao,
      titulo: post.titulo,
      candidatos: candidatosExport,
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
      candidatos: candidatosExport,
    };
  }
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('CURADORIA VIA APIs PÚBLICAS');
  console.log('========================================');

  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const validacao = podePublicar(cfg) === false;
  console.log(
    validacao
      ? 'Modo: VALIDAÇÃO (sem publicação no Facebook)'
      : 'Modo: PUBLICAÇÃO REAL'
  );
  console.log('Pontuação mínima:', cfg.pontuacao_minima_publicacao ?? 75);

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
      });
    }
  }

  const payload = {
    gerado_em: new Date().toISOString(),
    modo: validacao ? 'validacao' : 'publicacao',
    pontuacao_minima: cfg.pontuacao_minima_publicacao ?? 75,
    paginas: resultados.map((r) => ({
      pagina: r.pagina_nome,
      page_id: r.page_id,
      status: r.status,
      melhor: r.titulo
        ? {
            titulo: r.titulo,
            pontuacao: r.pontuacao,
            fonte: r.fonte,
            url: r.url,
            preview: r.preview || null,
          }
        : null,
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
        resumo: resultados.map((r) => ({
          pagina: r.pagina_nome,
          status: r.status,
          pontuacao: r.pontuacao || null,
          titulo: r.titulo || null,
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
    console.log(`  ${r.pagina_nome}: ${r.status}${r.pontuacao != null ? ` (${r.pontuacao})` : ''}`);
  }
  console.log('Candidatos:', CANDIDATOS);
  console.log(
    'ℹ️ Se nenhum item atingir a mínima, não publicar é o comportamento correto.'
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ERRO FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = { main };

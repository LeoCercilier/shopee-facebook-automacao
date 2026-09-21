/**
 * Módulo 3 – Publica a postagem na Página do Facebook (por nicho).
 *
 * Variáveis de ambiente:
 *   FACEBOOK_PAGE_ACCESS_TOKEN  (System User Token — nunca logado)
 *   FACEBOOK_PAGE_ID            (opcional; fallback só para nicho geral)
 *
 * Fluxo:
 *   postagem-final.json → nicho → página → /me/accounts → /photos|/feed
 *   histórico por link + pageId (7 dias)
 */

const fs = require("fs");
const { obterPaginaPorNicho } = require("./paginas");

const ARQUIVO_ENTRADA = "postagem-final.json";
const ARQUIVO_SAIDA = "resultado-postagem.json";
const ARQUIVO_HISTORICO = "historico-publicacoes.json";
const GRAPH_VERSION = "v21.0";
const DIAS_ESPERA = 7;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const PAGE_ID_MARKETING_TIPS = "369805844018354";

function exigirEnv(nome) {
  const valor = process.env[nome];
  if (!valor || !String(valor).trim()) {
    throw new Error(
      `Variável de ambiente ${nome} não definida. Configure o Secret no GitHub Actions.`
    );
  }
  return String(valor).trim();
}

function normalizarLink(link) {
  if (!link) return "";
  try {
    const u = new URL(String(link).trim());
    let key = u.origin + u.pathname;
    if (key.endsWith("/")) key = key.slice(0, -1);
    return key;
  } catch (_) {
    return String(link).trim().split("?")[0].replace(/\/$/, "");
  }
}

function carregarHistorico() {
  if (!fs.existsSync(ARQUIVO_HISTORICO)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(ARQUIVO_HISTORICO, "utf8"));
    if (!data || typeof data !== "object") return {};

    const migrado = {};
    for (const [link, valor] of Object.entries(data)) {
      if (!valor || typeof valor !== "object") continue;

      if (valor.ultima_publicacao && typeof valor.ultima_publicacao === "string") {
        migrado[link] = {
          [PAGE_ID_MARKETING_TIPS]: {
            ultima_publicacao: valor.ultima_publicacao
          }
        };
        continue;
      }

      const porPagina = {};
      for (const [pageId, info] of Object.entries(valor)) {
        if (info && info.ultima_publicacao) {
          porPagina[pageId] = { ultima_publicacao: info.ultima_publicacao };
        }
      }
      if (Object.keys(porPagina).length > 0) {
        migrado[link] = porPagina;
      }
    }
    return migrado;
  } catch (_) {
    return {};
  }
}

function salvarHistorico(historico) {
  const agora = Date.now();
  const limite = 90 * MS_POR_DIA;
  const limpo = {};

  for (const [link, porPagina] of Object.entries(historico || {})) {
    if (!porPagina || typeof porPagina !== "object") continue;
    const pages = {};
    for (const [pageId, info] of Object.entries(porPagina)) {
      if (!info || !info.ultima_publicacao) continue;
      const t = Date.parse(info.ultima_publicacao);
      if (!Number.isFinite(t)) continue;
      if (agora - t <= limite) {
        pages[pageId] = { ultima_publicacao: info.ultima_publicacao };
      }
    }
    if (Object.keys(pages).length > 0) {
      limpo[link] = pages;
    }
  }

  fs.writeFileSync(ARQUIVO_HISTORICO, JSON.stringify(limpo, null, 2) + "\n", "utf8");
}

function verificarRepublicacao(link, pageId) {
  const chave = normalizarLink(link);
  if (!chave || !pageId) {
    return { podePublicar: true, chave: chave || null, historico: carregarHistorico() };
  }

  const historico = carregarHistorico();
  const porPagina = historico[chave] || {};
  const registro = porPagina[String(pageId)];

  if (!registro || !registro.ultima_publicacao) {
    return { podePublicar: true, chave, historico };
  }

  const ultima = Date.parse(registro.ultima_publicacao);
  if (!Number.isFinite(ultima)) {
    return { podePublicar: true, chave, historico };
  }

  const agora = Date.now();
  const diasDecorridos = (agora - ultima) / MS_POR_DIA;

  if (diasDecorridos < DIAS_ESPERA) {
    const diasRestantes = Math.ceil(DIAS_ESPERA - diasDecorridos);
    return {
      podePublicar: false,
      chave,
      historico,
      ultima_publicacao: registro.ultima_publicacao,
      dias_decorridos: Math.floor(diasDecorridos * 10) / 10,
      dias_restantes: Math.max(1, diasRestantes)
    };
  }

  return {
    podePublicar: true,
    chave,
    historico,
    ultima_publicacao: registro.ultima_publicacao
  };
}

function registrarPublicacao(historico, chave, pageId) {
  if (!chave || !pageId) return;
  const atualizado = { ...(historico || {}) };
  if (!atualizado[chave] || typeof atualizado[chave] !== "object") {
    atualizado[chave] = {};
  }
  const porPagina = { ...atualizado[chave] };
  delete porPagina.ultima_publicacao;
  porPagina[String(pageId)] = {
    ultima_publicacao: new Date().toISOString()
  };
  atualizado[chave] = porPagina;
  salvarHistorico(atualizado);
}

async function obterTokenDaPagina(pageId, tokenSecret) {
  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
    );
    url.searchParams.set("fields", "id,name,access_token,tasks");
    url.searchParams.set("limit", "100");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenSecret}` }
    });
    const data = await res.json();

    if (res.ok && Array.isArray(data.data)) {
      const page = data.data.find((p) => String(p.id) === String(pageId));
      if (page && page.access_token) {
        console.log("Token da Página obtido via /me/accounts.");
        return page.access_token;
      }
      if (data.data.length > 0) {
        console.log(
          "Aviso: /me/accounts retornou páginas, mas não encontrou o PAGE_ID configurado."
        );
      }
    } else if (data.error) {
      console.log(
        "Aviso: /me/accounts não disponível com este token:",
        data.error.message
      );
    }
  } catch (err) {
    console.log("Aviso: falha em /me/accounts:", err.message);
  }

  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}`
    );
    url.searchParams.set("fields", "id,name,access_token");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenSecret}` }
    });
    const data = await res.json();

    if (res.ok && data.access_token) {
      console.log("Token da Página obtido via /{page-id}.");
      return data.access_token;
    }
    if (data.error) {
      console.log(
        "Aviso: não foi possível obter access_token da Página:",
        data.error.message
      );
    }
  } catch (err) {
    console.log("Aviso: falha ao consultar a Página:", err.message);
  }

  console.log("Usando o token do Secret diretamente para publicar.");
  return tokenSecret;
}

async function postarFoto({ pageId, accessToken, imageUrl, caption }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`;
  const body = new URLSearchParams({
    url: imageUrl,
    caption,
    published: "true"
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error?.message || JSON.stringify(data);
    throw new Error(msg);
  }

  return {
    tipo: "photo",
    post_id: data.post_id || data.id || null,
    id: data.id || null,
    raw: data
  };
}

async function postarFeed({ pageId, accessToken, message, link }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;
  const params = {
    message,
    published: "true"
  };
  if (link) params.link = link;

  const body = new URLSearchParams(params);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error?.message || JSON.stringify(data);
    throw new Error(msg);
  }

  return {
    tipo: "feed",
    post_id: data.id || null,
    id: data.id || null,
    raw: data
  };
}

async function publicar({ pageId, accessToken, texto, imagem, link }) {
  if (imagem) {
    try {
      console.log("Tentando publicar via /photos (imagem + legenda)...");
      return await postarFoto({
        pageId,
        accessToken,
        imageUrl: imagem,
        caption: texto
      });
    } catch (erro) {
      console.log("Publicação com imagem falhou.");
      console.log("Detalhe Graph API:", erro.message);
      console.log("Tentando fallback via /feed (texto + link)...");
    }
  } else {
    console.log("Sem imagem disponível. Publicando via /feed...");
  }

  return await postarFeed({
    pageId,
    accessToken,
    message: texto,
    link: link || null
  });
}

async function main() {
  console.log("");
  console.log("================================");
  console.log("MÓDULO 3 – POSTAGEM NO FACEBOOK");
  console.log("================================");

  if (!fs.existsSync(ARQUIVO_ENTRADA)) {
    throw new Error(
      `Arquivo ${ARQUIVO_ENTRADA} não encontrado. Rode o Módulo 2 antes.`
    );
  }

  const postagem = JSON.parse(fs.readFileSync(ARQUIVO_ENTRADA, "utf8"));

  const titulo = postagem.titulo || postagem.produto?.titulo || "";
  const preco = postagem.preco || postagem.produto?.preco || "";
  const link = postagem.link || postagem.produto?.link || "";
  const imagem =
    postagem.imagem ||
    postagem.produto?.imagem ||
    (Array.isArray(postagem.produto?.imagens)
      ? postagem.produto.imagens[0]
      : "") ||
    "";
  const texto =
    postagem.texto ||
    `🔥 OFERTA DO DIA

${titulo}

💰 ${preco}

🛍️ Confira na Shopee:
${link}`;

  const nicho = postagem.nicho || "geral";
  const pagina = obterPaginaPorNicho(nicho);

  if (!texto.trim()) {
    throw new Error("Texto da postagem vazio em postagem-final.json");
  }

  console.log("Título :", titulo || "(sem título)");
  console.log("Preço  :", preco || "(sem preço)");
  console.log("Link   :", link || "(sem link)");
  console.log("Imagem :", imagem ? "sim" : "não");
  console.log("Nicho  :", nicho);
  console.log("Página :", pagina.nome, `(${pagina.pageId || "sem pageId"})`);
  console.log("");

  if (!pagina.pageId) {
    console.log(
      `⚠️  Nicho "${nicho}" sem Page ID configurado. Publicação pulada (não redireciona).`
    );
    const resultado = {
      sucesso: true,
      pulado: true,
      motivo: "page_id_ausente",
      gerado_em: new Date().toISOString(),
      nicho,
      pagina: pagina.nome,
      postagem: { titulo, preco, link, imagem, texto }
    };
    fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(resultado, null, 2), "utf8");
    return;
  }

  const pageId = String(pagina.pageId);

  const checagem = verificarRepublicacao(link, pageId);
  if (!checagem.podePublicar) {
    console.log("⏳ Oferta dentro do período de espera (7 dias) nesta página.");
    console.log("Última publicação (UTC):", checagem.ultima_publicacao);
    console.log(
      `Faltam aproximadamente ${checagem.dias_restantes} dia(s) para poder republicar.`
    );
    console.log("Nenhuma postagem será feita nesta execução.");

    const resultado = {
      sucesso: true,
      pulado: true,
      motivo: "periodo_espera_7_dias",
      gerado_em: new Date().toISOString(),
      link,
      chave: checagem.chave,
      page_id: pageId,
      pagina: pagina.nome,
      nicho,
      ultima_publicacao: checagem.ultima_publicacao,
      dias_restantes: checagem.dias_restantes,
      postagem: { titulo, preco, link, imagem, texto }
    };
    fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(resultado, null, 2), "utf8");
    return;
  }

  if (checagem.ultima_publicacao) {
    console.log(
      "Oferta já publicada nesta página em",
      checagem.ultima_publicacao,
      "— prazo de 7 dias cumprido. Republicando."
    );
  }

  const tokenSecret = exigirEnv("FACEBOOK_PAGE_ACCESS_TOKEN");

  console.log("Página (ID):", pageId);

  const pageAccessToken = await obterTokenDaPagina(pageId, tokenSecret);
  console.log("");

  const resultadoApi = await publicar({
    pageId,
    accessToken: pageAccessToken,
    texto,
    imagem,
    link
  });

  registrarPublicacao(
    checagem.historico || carregarHistorico(),
    checagem.chave,
    pageId
  );

  const resultado = {
    sucesso: true,
    pulado: false,
    gerado_em: new Date().toISOString(),
    nicho,
    pagina: pagina.nome,
    page_id: pageId,
    post_id: resultadoApi.post_id,
    tipo: resultadoApi.tipo,
    link_facebook: resultadoApi.post_id
      ? `https://www.facebook.com/${resultadoApi.post_id}`
      : null,
    postagem: {
      titulo,
      preco,
      link,
      imagem,
      texto
    },
    api: {
      id: resultadoApi.id,
      post_id: resultadoApi.post_id
    }
  };

  fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(resultado, null, 2), "utf8");

  console.log("");
  console.log("✅ PUBLICAÇÃO REALIZADA COM SUCESSO");
  console.log("Página :", pagina.nome);
  console.log("Nicho  :", nicho);
  console.log("Tipo   :", resultado.tipo);
  console.log("Post ID:", resultado.post_id);
  if (resultado.link_facebook) {
    console.log("Link   :", resultado.link_facebook);
  }
  console.log("Histórico atualizado:", ARQUIVO_HISTORICO);
  console.log("Arquivo:", ARQUIVO_SAIDA);
}

main().catch((erro) => {
  console.error("");
  console.error("ERRO NO MÓDULO 3:");
  console.error(erro.message);

  const falha = {
    sucesso: false,
    gerado_em: new Date().toISOString(),
    erro: erro.message
  };
  try {
    fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(falha, null, 2), "utf8");
  } catch (_) {}

  process.exit(1);
});

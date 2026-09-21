/**
 * Módulo 3 – Publica a postagem na Página do Facebook via Graph API.
 *
 * Variáveis de ambiente:
 *   FACEBOOK_PAGE_ID
 *   FACEBOOK_PAGE_ACCESS_TOKEN  (Page Access Token, nunca logado)
 *
 * Lê:  postagem-final.json
 * Gera: resultado-postagem.json (sem o token)
 * Atualiza: historico-publicacoes.json (prazo de 7 dias por link)
 */

const fs = require("fs");

const ARQUIVO_ENTRADA = "postagem-final.json";
const ARQUIVO_SAIDA = "resultado-postagem.json";
const ARQUIVO_HISTORICO = "historico-publicacoes.json";
const GRAPH_VERSION = "v21.0";
const DIAS_ESPERA = 7;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

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
    return data && typeof data === "object" ? data : {};
  } catch (_) {
    return {};
  }
}

function salvarHistorico(historico) {
  const agora = Date.now();
  const limite = 90 * MS_POR_DIA;
  const limpo = {};
  for (const [k, v] of Object.entries(historico)) {
    if (!v || !v.ultima_publicacao) continue;
    const t = Date.parse(v.ultima_publicacao);
    if (!Number.isFinite(t)) continue;
    if (agora - t <= limite) limpo[k] = { ultima_publicacao: v.ultima_publicacao };
  }
  fs.writeFileSync(ARQUIVO_HISTORICO, JSON.stringify(limpo, null, 2) + "\n", "utf8");
}

function verificarRepublicacao(link) {
  const chave = normalizarLink(link);
  if (!chave) {
    return { podePublicar: true, chave: null };
  }

  const historico = carregarHistorico();
  const registro = historico[chave];
  if (!registro || !registro.ultima_publicacao) {
    return { podePublicar: true, chave, historico };
  }

  const ultima = Date.parse(registro.ultima_publicacao);
  if (!Number.isFinite(ultima)) {
    return { podePublicar: true, chave, historico };
  }

  const agora = Date.now();
  const decorridoMs = agora - ultima;
  const diasDecorridos = decorridoMs / MS_POR_DIA;

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

function registrarPublicacao(historico, chave) {
  if (!chave) return;
  const atualizado = { ...(historico || {}) };
  atualizado[chave] = {
    ultima_publicacao: new Date().toISOString()
  };
  salvarHistorico(atualizado);
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

  if (!texto.trim()) {
    throw new Error("Texto da postagem vazio em postagem-final.json");
  }

  console.log("Título :", titulo || "(sem título)");
  console.log("Preço  :", preco || "(sem preço)");
  console.log("Link   :", link || "(sem link)");
  console.log("Imagem :", imagem ? "sim" : "não");
  console.log("");

  const checagem = verificarRepublicacao(link);
  if (!checagem.podePublicar) {
    console.log("⏳ Oferta dentro do período de espera (7 dias).");
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
      ultima_publicacao: checagem.ultima_publicacao,
      dias_restantes: checagem.dias_restantes,
      postagem: { titulo, preco, link, imagem, texto }
    };
    fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(resultado, null, 2), "utf8");
    return;
  }

  if (checagem.ultima_publicacao) {
    console.log(
      "Oferta já publicada anteriormente em",
      checagem.ultima_publicacao,
      "— prazo de 7 dias cumprido. Republicando."
    );
  }

  const pageId = exigirEnv("FACEBOOK_PAGE_ID");
  const accessToken = exigirEnv("FACEBOOK_PAGE_ACCESS_TOKEN");

  console.log("Página (ID):", pageId);
  console.log("");

  const resultadoApi = await publicar({
    pageId,
    accessToken,
    texto,
    imagem,
    link
  });

  registrarPublicacao(checagem.historico || carregarHistorico(), checagem.chave);

  const resultado = {
    sucesso: true,
    pulado: false,
    gerado_em: new Date().toISOString(),
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

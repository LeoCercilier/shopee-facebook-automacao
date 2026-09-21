/**
 * Módulo 3 – Publica a postagem na Página do Facebook via Graph API.
 *
 * Variáveis de ambiente:
 *   FACEBOOK_PAGE_ID
 *   FACEBOOK_PAGE_ACCESS_TOKEN  (Page Access Token, nunca logado)
 *
 * Lê:  postagem-final.json
 * Gera: resultado-postagem.json (sem o token)
 */

const fs = require("fs");

const ARQUIVO_ENTRADA = "postagem-final.json";
const ARQUIVO_SAIDA = "resultado-postagem.json";
const GRAPH_VERSION = "v21.0";

function exigirEnv(nome) {
  const valor = process.env[nome];
  if (!valor || !String(valor).trim()) {
    throw new Error(
      `Variável de ambiente ${nome} não definida. Configure o Secret no GitHub Actions.`
    );
  }
  return String(valor).trim();
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
  // 1) Tenta publicar com imagem
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

  // 2) Fallback: feed com texto + link
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

  const pageId = exigirEnv("FACEBOOK_PAGE_ID");
  const accessToken = exigirEnv("FACEBOOK_PAGE_ACCESS_TOKEN");

  // Nunca imprimir o token
  console.log("Página (ID):", pageId);
  console.log("");

  const resultadoApi = await publicar({
    pageId,
    accessToken,
    texto,
    imagem,
    link
  });

  const resultado = {
    sucesso: true,
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

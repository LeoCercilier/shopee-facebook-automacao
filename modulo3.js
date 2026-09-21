/**
 * Módulo 3 – Publica a postagem na Página do Facebook via Graph API.
 *
 * Variáveis de ambiente necessárias:
 *   FACEBOOK_PAGE_ID            → ID da Página
 *   FACEBOOK_PAGE_ACCESS_TOKEN  → Page Access Token de longa duração
 *
 * Permissão necessária no token da Página: pages_manage_posts
 *
 * Lê:  postagem-final.json
 * Gera: resultado-postagem.json
 */

const fs = require("fs");

const ARQUIVO_ENTRADA = "postagem-final.json";
const ARQUIVO_SAIDA = "resultado-postagem.json";
const GRAPH_VERSION = "v21.0";

function exigirEnv(nome) {
  const valor = process.env[nome];
  if (!valor || !String(valor).trim()) {
    throw new Error(
      `Variável de ambiente ${nome} não definida. ` +
        `Configure o Secret no GitHub Actions ou exporte localmente.`
    );
  }
  return String(valor).trim();
}

/**
 * Publica na Página usando Page Access Token + pages_manage_posts.
 * Preferência:
 *   1) /{page-id}/photos  (imagem + caption) quando houver URL de imagem
 *   2) /{page-id}/feed    (texto + link) como fallback ou quando não houver imagem
 */
async function postarNaPagina({ message, imageUrl, link, pageId, accessToken }) {
  const base = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}`;

  // --- Tentativa 1: foto com caption (melhor engajamento visual) ---
  if (imageUrl) {
    try {
      const photoUrl = `${base}/photos`;
      const body = new URLSearchParams({
        url: imageUrl,
        caption: message,
        published: "true"
      });

      const res = await fetch(photoUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });

      const data = await res.json();

      if (res.ok && !data.error) {
        return {
          tipo: "photo",
          post_id: data.post_id || data.id,
          id: data.id,
          raw: data
        };
      }

      const msg = data.error?.message || JSON.stringify(data);
      console.log("Aviso: publicação com imagem falhou, tentando feed (texto + link).");
      console.log("Detalhe:", msg);
    } catch (err) {
      console.log("Aviso: erro ao publicar imagem, tentando feed (texto + link).");
      console.log("Detalhe:", err.message);
    }
  }

  // --- Tentativa 2 / fallback: feed com message + link ---
  const feedUrl = `${base}/feed`;
  const feedParams = {
    message,
    published: "true"
  };
  if (link) {
    feedParams.link = link;
  }

  const body = new URLSearchParams(feedParams);

  const res = await fetch(feedUrl, {
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
    throw new Error(`Graph API (feed) falhou: ${msg}`);
  }

  return {
    tipo: "feed",
    post_id: data.id,
    id: data.id,
    raw: data
  };
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

  const titulo = postagem.titulo || postagem.produto?.titulo;
  const preco = postagem.preco || postagem.produto?.preco;
  const link = postagem.link || postagem.produto?.link;
  const imagem =
    postagem.imagem ||
    postagem.produto?.imagem ||
    (Array.isArray(postagem.produto?.imagens)
      ? postagem.produto.imagens[0]
      : "");
  const texto = postagem.texto;

  if (!texto) {
    throw new Error("Campo 'texto' não encontrado em postagem-final.json");
  }

  console.log("Título :", titulo || "(sem título)");
  console.log("Preço  :", preco || "(sem preço)");
  console.log("Link   :", link || "(sem link)");
  console.log("Imagem :", imagem ? "sim" : "não");
  console.log("");

  if (
    process.env.FACEBOOK_DRY_RUN === "1" ||
    process.env.FACEBOOK_DRY_RUN === "true"
  ) {
    console.log("⚠️  MODO DRY-RUN ativo – nenhuma postagem real será feita.");
    const resultado = {
      sucesso: true,
      dry_run: true,
      gerado_em: new Date().toISOString(),
      mensagem:
        "Simulação concluída. Configure FACEBOOK_PAGE_ID e FACEBOOK_PAGE_ACCESS_TOKEN para postar de verdade.",
      postagem: { titulo, preco, link, imagem, texto }
    };
    fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(resultado, null, 2), "utf8");
    console.log("Arquivo criado:", ARQUIVO_SAIDA);
    return;
  }

  const pageId = exigirEnv("FACEBOOK_PAGE_ID");
  const accessToken = exigirEnv("FACEBOOK_PAGE_ACCESS_TOKEN");

  // Nunca imprimir o token
  console.log("Publicando na Página", pageId, "...");

  const resultadoApi = await postarNaPagina({
    message: texto,
    imageUrl: imagem || null,
    link: link || null,
    pageId,
    accessToken
  });

  const resultado = {
    sucesso: true,
    dry_run: false,
    gerado_em: new Date().toISOString(),
    page_id: pageId,
    post_id: resultadoApi.post_id,
    tipo: resultadoApi.tipo,
    link_facebook: resultadoApi.post_id
      ? `https://www.facebook.com/${resultadoApi.post_id}`
      : null,
    postagem: { titulo, preco, link, imagem, texto },
    api: resultadoApi.raw
  };

  fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(resultado, null, 2), "utf8");

  console.log("");
  console.log("✅ POSTAGEM REALIZADA COM SUCESSO");
  console.log("Post ID :", resultado.post_id);
  console.log("Tipo    :", resultado.tipo);
  if (resultado.link_facebook) {
    console.log("Link    :", resultado.link_facebook);
  }
  console.log("Arquivo :", ARQUIVO_SAIDA);
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

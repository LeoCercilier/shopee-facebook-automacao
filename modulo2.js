const fs = require("fs");

const ARQUIVO_ENTRADA = "resultado-oferta.json";
const ARQUIVO_SAIDA = "postagem-final.json";

function gerarPostagem() {
  if (!fs.existsSync(ARQUIVO_ENTRADA)) {
    throw new Error(`Arquivo ${ARQUIVO_ENTRADA} não encontrado.`);
  }

  const resultado = JSON.parse(
    fs.readFileSync(ARQUIVO_ENTRADA, "utf8")
  );

  if (!resultado.produto) {
    throw new Error("O resultado-oferta.json não contém o objeto produto.");
  }

  const { titulo, preco, link, imagens = [] } = resultado.produto;

  if (!titulo) {
    throw new Error("Título do produto não encontrado.");
  }

  if (!preco) {
    throw new Error("Preço do produto não encontrado.");
  }

  if (!link) {
    throw new Error("Link da oferta não encontrado.");
  }

  const texto = `🔥 OFERTA DO DIA

${titulo}

💰 ${preco}

🛍️ Confira na Shopee:
${link}`;

  const postagem = {
    sucesso: true,
    gerado_em: new Date().toISOString(),

    produto: {
      titulo,
      preco,
      link,
      imagens
    },

    texto
  };

  fs.writeFileSync(
    ARQUIVO_SAIDA,
    JSON.stringify(postagem, null, 2),
    "utf8"
  );

  console.log("");
  console.log("================================");
  console.log("POSTAGEM GERADA COM SUCESSO");
  console.log("================================");
  console.log(texto);
  console.log("");
  console.log(
    "Imagem disponível:",
    imagens.length > 0 ? "sim" : "não"
  );
  console.log("Arquivo criado:", ARQUIVO_SAIDA);
}

try {
  gerarPostagem();
} catch (erro) {
  console.error("");
  console.error("ERRO NO MÓDULO 2:");
  console.error(erro.message);
  process.exit(1);
}

const { chromium } = require("playwright");
const fs = require("fs");

const URL_OFERTAS =
  "https://leocercilier.github.io/shopee-achadinho/ofertas.html";

async function coletarOferta() {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 390,
        height: 844
      }
    });

    console.log("Abrindo ofertas.html...");

    await page.goto(URL_OFERTAS, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("Página carregada.");

    await page.waitForFunction(
      () => document.querySelectorAll(".card").length > 0,
      null,
      { timeout: 60000 }
    );

    console.log("Produtos encontrados.");

    const oferta = await page.locator(".card").first().evaluate((card) => {
      const texto = (seletor) => {
        const elemento = card.querySelector(seletor);
        return elemento ? elemento.textContent.trim() : "";
      };

      const linkElemento = card.querySelector(".btn-shopee");

      const imagens = Array.from(
        card.querySelectorAll(".card-image img")
      )
        .map((img) => img.src)
        .filter(Boolean)
        .slice(0, 2);

      return {
        titulo: texto(".card-name"),
        preco: texto(".card-price"),
        link: linkElemento ? linkElemento.href : "",
        imagens
      };
    });

    if (!oferta.titulo) {
      throw new Error("Não foi possível encontrar o título do produto.");
    }

    if (!oferta.link) {
      throw new Error("Não foi possível encontrar o link da oferta.");
    }

    const resultado = {
      sucesso: true,
      coletado_em: new Date().toISOString(),

      produto: {
        titulo: oferta.titulo,
        preco: oferta.preco,
        link: oferta.link,
        imagens: oferta.imagens
      },

      post: `🔥 OFERTA DO DIA

${oferta.titulo}

💰 ${oferta.preco}

🛍️ Confira na Shopee:
${oferta.link}`
    };

    fs.writeFileSync(
      "resultado-oferta.json",
      JSON.stringify(resultado, null, 2),
      "utf8"
    );

    console.log("");
    console.log("================================");
    console.log("OFERTA COLETADA COM SUCESSO");
    console.log("================================");
    console.log("Título:", oferta.titulo);
    console.log("Preço:", oferta.preco);
    console.log("Link:", oferta.link);
    console.log("Imagens:", oferta.imagens.length);
    console.log("");
    console.log("Arquivo criado: resultado-oferta.json");

    return resultado;
  } finally {
    await browser.close();
  }
}

coletarOferta().catch((erro) => {
  console.error("");
  console.error("ERRO NA COLETA:");
  console.error(erro.message);

  process.exit(1);
});

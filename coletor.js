const { chromium } = require("playwright");
const fs = require("fs");

const URL_OFERTAS =
  "https://leocercilier.github.io/shopee-achadinho/ofertas.html";

const ARQUIVO_HISTORICO = "historico-publicacoes.json";
const ARQUIVO_SAIDA = "resultado-oferta.json";
const DIAS_ESPERA = 7;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

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

/**
 * Lê o histórico apenas para consulta.
 * Aceita formato legado { ultima_publicacao } e novo { pageId: { ultima_publicacao } }.
 * Retorna Map<linkNormalizado, timestampMaisRecenteMs | null>
 */
function carregarUltimasPublicacoes() {
  const mapa = new Map();

  if (!fs.existsSync(ARQUIVO_HISTORICO)) {
    return mapa;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(ARQUIVO_HISTORICO, "utf8"));
  } catch (_) {
    return mapa;
  }

  if (!data || typeof data !== "object") return mapa;

  for (const [link, valor] of Object.entries(data)) {
    if (!valor || typeof valor !== "object") continue;

    const chave = normalizarLink(link);
    if (!chave) continue;

    let maisRecente = null;

    // Formato legado
    if (typeof valor.ultima_publicacao === "string") {
      const t = Date.parse(valor.ultima_publicacao);
      if (Number.isFinite(t)) maisRecente = t;
    } else {
      // Formato por pageId
      for (const info of Object.values(valor)) {
        if (!info || typeof info.ultima_publicacao !== "string") continue;
        const t = Date.parse(info.ultima_publicacao);
        if (!Number.isFinite(t)) continue;
        if (maisRecente === null || t > maisRecente) maisRecente = t;
      }
    }

    if (maisRecente !== null) {
      mapa.set(chave, maisRecente);
    }
  }

  return mapa;
}

/**
 * Elegível se:
 * - nunca publicada, ou
 * - última publicação (qualquer página) há >= 7 dias
 */
function analisarElegibilidade(link, historicoMap) {
  const chave = normalizarLink(link);
  if (!chave) {
    return { elegivel: false, nuncaPublicada: false, motivo: "link_invalido" };
  }

  if (!historicoMap.has(chave)) {
    return {
      elegivel: true,
      nuncaPublicada: true,
      chave,
      motivo: "nunca_publicada"
    };
  }

  const ultimaMs = historicoMap.get(chave);
  const diasDecorridos = (Date.now() - ultimaMs) / MS_POR_DIA;

  if (diasDecorridos >= DIAS_ESPERA) {
    return {
      elegivel: true,
      nuncaPublicada: false,
      chave,
      ultima_publicacao: new Date(ultimaMs).toISOString(),
      dias_decorridos: Math.floor(diasDecorridos * 10) / 10,
      motivo: "prazo_7_dias_cumprido"
    };
  }

  const diasRestantes = Math.max(1, Math.ceil(DIAS_ESPERA - diasDecorridos));
  return {
    elegivel: false,
    nuncaPublicada: false,
    chave,
    ultima_publicacao: new Date(ultimaMs).toISOString(),
    dias_decorridos: Math.floor(diasDecorridos * 10) / 10,
    dias_restantes: diasRestantes,
    motivo: "em_espera_7_dias"
  };
}

function selecionarOferta(ofertas, historicoMap) {
  const nuncaPublicadas = [];
  const liberadas = [];
  const emEspera = [];

  for (const oferta of ofertas) {
    const status = analisarElegibilidade(oferta.link, historicoMap);
    const item = { ...oferta, status };

    if (!status.elegivel) {
      emEspera.push(item);
      continue;
    }

    if (status.nuncaPublicada) {
      nuncaPublicadas.push(item);
    } else {
      liberadas.push(item);
    }
  }

  // Prioridade 1: nunca publicadas (ordem da página)
  // Prioridade 2: prazo cumprido (mais antiga primeiro = rodízio natural)
  liberadas.sort((a, b) => {
    const ta = Date.parse(a.status.ultima_publicacao || 0);
    const tb = Date.parse(b.status.ultima_publicacao || 0);
    return ta - tb;
  });

  const escolhida = nuncaPublicadas[0] || liberadas[0] || null;

  return { escolhida, nuncaPublicadas, liberadas, emEspera };
}

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

    // Extrai TODAS as ofertas (mesmos seletores de antes)
    const ofertas = await page.locator(".card").evaluateAll((cards) => {
      return cards.map((card) => {
        const texto = (seletor) => {
          const elemento = card.querySelector(seletor);
          return elemento ? elemento.textContent.trim() : "";
        };

        const linkElemento = card.querySelector(".btn-shopee");

        const imagens = Array.from(card.querySelectorAll(".card-image img"))
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
    });

    const validas = ofertas.filter((o) => o.titulo && o.link);
    console.log(`Total de cards: ${ofertas.length} | válidos: ${validas.length}`);

    const historicoMap = carregarUltimasPublicacoes();
    console.log(`Histórico: ${historicoMap.size} link(s) registrado(s).`);

    const { escolhida, nuncaPublicadas, liberadas, emEspera } = selecionarOferta(
      validas,
      historicoMap
    );

    console.log(`Nunca publicadas : ${nuncaPublicadas.length}`);
    console.log(`Liberadas (≥7d)  : ${liberadas.length}`);
    console.log(`Em espera (<7d)  : ${emEspera.length}`);

    if (!escolhida) {
      console.log("");
      console.log("================================");
      console.log("NENHUMA OFERTA ELEGÍVEL");
      console.log("================================");
      console.log(
        "Todas as ofertas estão dentro do período de espera de 7 dias ou a lista está vazia."
      );

      if (emEspera.length > 0) {
        console.log("");
        console.log("Ofertas em espera (amostra):");
        for (const item of emEspera.slice(0, 5)) {
          console.log(
            `- ${item.titulo.slice(0, 60)}... | faltam ~${item.status.dias_restantes} dia(s)`
          );
        }
      }

      const resultadoVazio = {
        sucesso: true,
        sem_oferta_elegivel: true,
        coletado_em: new Date().toISOString(),
        motivo: "todas_em_espera_ou_lista_vazia",
        total_ofertas: validas.length,
        em_espera: emEspera.length,
        produto: null
      };

      fs.writeFileSync(
        ARQUIVO_SAIDA,
        JSON.stringify(resultadoVazio, null, 2),
        "utf8"
      );

      console.log("");
      console.log("Arquivo criado:", ARQUIVO_SAIDA);
      console.log("(sem produto — módulo 2/3 não devem publicar nesta execução)");
      return resultadoVazio;
    }

    const oferta = escolhida;

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

    fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(resultado, null, 2), "utf8");

    console.log("");
    console.log("================================");
    console.log("OFERTA COLETADA COM SUCESSO");
    console.log("================================");
    console.log("Motivo :", oferta.status.motivo);
    console.log("Título :", oferta.titulo);
    console.log("Preço  :", oferta.preco);
    console.log("Link   :", oferta.link);
    console.log("Imagens:", oferta.imagens.length);
    console.log("");
    console.log("Arquivo criado:", ARQUIVO_SAIDA);

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

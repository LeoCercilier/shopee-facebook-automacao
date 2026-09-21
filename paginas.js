/**
 * Configuração central das Páginas do Facebook por nicho.
 * Uma oferta → um único nicho → uma única página.
 */

const PAGINAS = {
  geral: {
    chave: "geral",
    nome: "Marketing Tips",
    pageId: "369805844018354"
  },
  beleza: {
    chave: "beleza",
    nome: "Studio Marine Cuidados Pessoais",
    pageId: "1247772158429331"
  },
  motociclismo: {
    chave: "motociclismo",
    nome: "Rota das Duas Rodas - Acessórios",
    pageId: "1332730186586435"
  },
  casa: {
    chave: "casa",
    nome: "Casa & Conforto Utilidades",
    pageId: "1402223216297975"
  }
};

function obterPaginaPorNicho(nicho) {
  const key = String(nicho || "geral").toLowerCase();
  return PAGINAS[key] || PAGINAS.geral;
}

module.exports = { PAGINAS, obterPaginaPorNicho };

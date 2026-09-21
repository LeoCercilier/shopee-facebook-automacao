/**
 * Classifica a oferta em um único nicho com base no título.
 * Prioridade em empate: motociclismo > beleza > casa > geral
 * Evita falsos positivos de termos genéricos isolados.
 */

function normalizarTexto(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const REGRAS = {
  motociclismo: [
    "motocicleta",
    "capacete moto",
    "capacete para moto",
    "luvas para moto",
    "luva para moto",
    "suporte para celular de moto",
    "suporte celular moto",
    "protetor de motor",
    "bau para moto",
    "baú para moto",
    "bau moto",
    "manopla",
    "retrovisor moto",
    "retrovisor para moto",
    "acessorio para moto",
    "acessorios para moto",
    "peca para moto",
    "pecas para moto",
    "equipamento para motociclista",
    "motociclista",
    "para moto",
    " de moto",
    "moto "
  ],
  beleza: [
    "skincare",
    "protetor solar",
    "creme facial",
    "serum facial",
    "sérum",
    "serum",
    "maquiagem",
    "base liquida",
    "batom",
    "rimel",
    "rímel",
    "delineador",
    "shampoo",
    "condicionador",
    "mascara capilar",
    "máscara capilar",
    "perfume",
    "colonia",
    "colônia",
    "hidratante corporal",
    "creme corporal",
    "esfoliante corporal",
    "cuidados com a pele",
    "cuidados com o cabelo",
    "higiene pessoal",
    "manicure",
    "esmalte",
    "unha",
    "unhas",
    "beleza",
    "estetica",
    "estética",
    "facial",
    "anti idade",
    "antiidade",
    "acne",
    "sabonete facial"
  ],
  casa: [
    "utensilio",
    "utensílios",
    "organizador",
    "organizadores",
    "organizacao",
    "organização",
    "armazenamento",
    "decoracao",
    "decoração",
    "cozinha",
    "banheiro",
    "utilidade domestica",
    "utilidades domesticas",
    "utilidade doméstica",
    "eletrodomestico",
    "eletrodoméstico",
    "air fryer",
    "fritadeira",
    "panela",
    "jogo de panelas",
    "talher",
    "talheres",
    "toalha",
    "lencol",
    "lençol",
    "roupa de cama",
    "aspirador",
    "vassoura",
    "rodo",
    "limpeza",
    "organizador de gaveta",
    "cabide",
    "prateleira",
    "suporte de parede",
    "porta tempero",
    "escorredor"
  ]
};

const MOTO_SIMPLES = ["capacete", "motocross", "motociclista"];

function pontuar(tituloNorm, termos) {
  let pts = 0;
  for (const termo of termos) {
    const t = normalizarTexto(termo);
    if (t && tituloNorm.includes(t)) {
      pts += t.includes(" ") ? 3 : 2;
    }
  }
  return pts;
}

function classificarOferta({ titulo }) {
  const t = normalizarTexto(titulo);

  let scores = {
    motociclismo: pontuar(t, REGRAS.motociclismo),
    beleza: pontuar(t, REGRAS.beleza),
    casa: pontuar(t, REGRAS.casa)
  };

  for (const termo of MOTO_SIMPLES) {
    if (t.includes(termo)) scores.motociclismo += 2;
  }
  if (/\bmoto\b/.test(t) || t.includes("moto ")) {
    scores.motociclismo += 2;
  }

  const ordem = ["motociclismo", "beleza", "casa"];
  let melhor = "geral";
  let melhorPts = 0;

  for (const nicho of ordem) {
    if (scores[nicho] > melhorPts) {
      melhorPts = scores[nicho];
      melhor = nicho;
    }
  }

  if (melhorPts < 2) {
    return "geral";
  }

  return melhor;
}

module.exports = { classificarOferta };

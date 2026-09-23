'use strict';

/**
 * Camada inspirada no conceito Content Creator (agency-agents):
 * - copy curta e orientada a engajamento em redes/grupos
 * - sem inventar preço, link, desconto ou características
 * - custo zero: templates determinísticos (sem API obrigatória)
 *
 * A IA (se houver no futuro) só pode sugerir texto de gancho.
 * Preço e link nunca saem daqui — ficam no validador/módulo 2.
 */

function normalizar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Detecta temas genéricos só pelo título — sem afirmar benefícios inventados. */
function sinaisDoTitulo(titulo) {
  const t = normalizar(titulo);
  return {
    casa: /casa|cozinha|organiz|armario|gaveta|limpeza|utilidade|decor/.test(t),
    beleza: /pele|facial|shampoo|creme|protetor|solar|maquiagem|serum|perfume/.test(
      t
    ),
    moto: /moto|capacete|motocicl|motocross/.test(t),
    praticidade: /organiz|suporte|kit|kit |pratico|prático|portatil|portátil/.test(
      t
    ),
  };
}

/**
 * Gera até 3 opções de copy (somente ganchos).
 * Nunca inclui preço nem URL.
 */
function gerarOpcoesCopy({ titulo, nicho }) {
  const sinais = sinaisDoTitulo(titulo);
  const opcoes = [];

  // Opção 1 — gancho geral (sempre disponível)
  opcoes.push({
    id: 1,
    estilo: 'achadinho',
    texto: '🔥 Achadinho para quem busca mais praticidade no dia a dia!',
  });

  // Opção 2 — descoberta / curiosidade
  if (sinais.moto || nicho === 'motociclismo') {
    opcoes.push({
      id: 2,
      estilo: 'nicho_moto',
      texto: '🏍️ Olha esse achadinho para quem anda de moto!',
    });
  } else if (sinais.beleza || nicho === 'beleza') {
    opcoes.push({
      id: 2,
      estilo: 'nicho_beleza',
      texto: '✨ Achadinho de cuidados pessoais para conferir na Shopee!',
    });
  } else if (sinais.casa || nicho === 'casa') {
    opcoes.push({
      id: 2,
      estilo: 'nicho_casa',
      texto: '🏠 Achadinho útil para a casa — vale dar uma olhada!',
    });
  } else {
    opcoes.push({
      id: 2,
      estilo: 'descoberta',
      texto: '✨ Olha esse achadinho que encontramos na Shopee!',
    });
  }

  // Opção 3 — tom mais neutro / convite leve
  if (sinais.praticidade) {
    opcoes.push({
      id: 3,
      estilo: 'praticidade',
      texto: '🛍️ Uma opção prática para facilitar a rotina!',
    });
  } else {
    opcoes.push({
      id: 3,
      estilo: 'neutro',
      texto: '🛍️ Uma opção interessante para conferir hoje!',
    });
  }

  // Sanidade: nenhuma opção pode carregar URL ou preço
  return opcoes
    .map((o) => ({
      ...o,
      texto: String(o.texto || '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/R\$\s*[\d.,]+/gi, '')
        .trim(),
    }))
    .filter((o) => o.texto.length >= 8)
    .slice(0, 3);
}

/** Fallback único se algo falhar. */
function copyFallback() {
  return '🔥 Confira este achadinho na Shopee!';
}

/**
 * Seleciona uma copy (padrão: primeira válida).
 * índice pode vir de COPY_OPCAO=1|2|3 no ambiente.
 */
function selecionarCopy(opcoes, indicePreferido) {
  const lista = Array.isArray(opcoes) && opcoes.length ? opcoes : [];
  if (!lista.length) return { texto: copyFallback(), id: 0, estilo: 'fallback' };

  let idx = 0;
  if (indicePreferido != null && Number.isFinite(Number(indicePreferido))) {
    const n = Number(indicePreferido);
    if (n >= 1 && n <= lista.length) idx = n - 1;
  }
  return lista[idx];
}

module.exports = {
  gerarOpcoesCopy,
  selecionarCopy,
  copyFallback,
  sinaisDoTitulo,
};

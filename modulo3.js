/**
 * Módulo 3 – Diagnóstico seguro do Page Access Token (sem postar).
 *
 * Variáveis de ambiente:
 *   FACEBOOK_PAGE_ID
 *   FACEBOOK_PAGE_ACCESS_TOKEN
 *
 * Este modo NÃO cria postagem. Apenas inspeciona o token via Graph API
 * e grava o resultado em resultado-postagem.json (sem incluir o token).
 */

const fs = require("fs");

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

async function graphGet(path, accessToken, params = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function extrairScopes(debugData) {
  const scopes = new Set();

  if (Array.isArray(debugData.scopes)) {
    debugData.scopes.forEach((s) => scopes.add(String(s)));
  }

  if (Array.isArray(debugData.granular_scopes)) {
    for (const g of debugData.granular_scopes) {
      if (g && g.scope) scopes.add(String(g.scope));
    }
  }

  return Array.from(scopes).sort();
}

async function diagnosticar(pageIdEsperado, accessToken) {
  const relatorio = {
    sucesso: true,
    modo: "diagnostico",
    gerado_em: new Date().toISOString(),
    page_id_configurado: pageIdEsperado,
    token: {
      presente: true,
      comprimento: accessToken.length,
      prefixo: accessToken.slice(0, 4) + "…"
    },
    debug_token: null,
    me: null,
    permissoes: {
      lista: [],
      pages_manage_posts: false,
      pages_read_engagement: false
    },
    conclusao: []
  };

  console.log("1) Consultando /debug_token ...");
  const debug = await graphGet("/debug_token", accessToken, {
    input_token: accessToken
  });

  if (debug.data && debug.data.data) {
    const d = debug.data.data;
    const scopes = extrairScopes(d);

    relatorio.debug_token = {
      is_valid: d.is_valid === true,
      type: d.type || null,
      app_id: d.app_id || null,
      user_id: d.user_id || null,
      profile_id: d.profile_id || null,
      expires_at: d.expires_at || null,
      data_access_expires_at: d.data_access_expires_at || null,
      scopes
    };

    relatorio.permissoes.lista = scopes;
    relatorio.permissoes.pages_manage_posts = scopes.includes("pages_manage_posts");
    relatorio.permissoes.pages_read_engagement = scopes.includes(
      "pages_read_engagement"
    );

    console.log("   type       :", relatorio.debug_token.type || "(não informado)");
    console.log("   is_valid   :", relatorio.debug_token.is_valid);
    console.log("   scopes     :", scopes.length ? scopes.join(", ") : "(nenhum)");
  } else {
    relatorio.debug_token = {
      erro: debug.data?.error?.message || JSON.stringify(debug.data)
    };
    console.log("   falhou:", relatorio.debug_token.erro);
  }

  console.log("2) Consultando /me ...");
  const me = await graphGet("/me", accessToken, {
    fields: "id,name,category"
  });

  if (me.ok && me.data && !me.data.error) {
    relatorio.me = {
      id: me.data.id || null,
      name: me.data.name || null,
      category: me.data.category || null
    };
    console.log("   id         :", relatorio.me.id);
    console.log("   name       :", relatorio.me.name || "(sem nome)");
    console.log("   category   :", relatorio.me.category || "(n/a)");
  } else {
    relatorio.me = {
      erro: me.data?.error?.message || JSON.stringify(me.data)
    };
    console.log("   falhou:", relatorio.me.erro);
  }

  console.log("3) Conferindo Page ID configurado ...");
  const pageCheck = await graphGet(`/${pageIdEsperado}`, accessToken, {
    fields: "id,name"
  });

  if (pageCheck.ok && pageCheck.data && !pageCheck.data.error) {
    relatorio.pagina_configurada = {
      acessivel: true,
      id: pageCheck.data.id || null,
      name: pageCheck.data.name || null
    };
    console.log(
      "   Página OK  :",
      relatorio.pagina_configurada.name,
      `(${relatorio.pagina_configurada.id})`
    );
  } else {
    relatorio.pagina_configurada = {
      acessivel: false,
      erro: pageCheck.data?.error?.message || JSON.stringify(pageCheck.data)
    };
    console.log(
      "   Página NÃO acessível com este token:",
      relatorio.pagina_configurada.erro
    );
  }

  const tipo = relatorio.debug_token?.type || null;
  const meId = relatorio.me?.id || null;

  if (tipo === "PAGE") {
    relatorio.conclusao.push("Token identificado como PAGE.");
  } else if (tipo === "USER") {
    relatorio.conclusao.push(
      "Token identificado como USER (não é Page Access Token). Isso explica o erro de permissões de Página."
    );
  } else if (tipo) {
    relatorio.conclusao.push(`Tipo de token reportado pela API: ${tipo}.`);
  } else {
    relatorio.conclusao.push("API não informou o tipo do token claramente.");
  }

  if (meId && meId === String(pageIdEsperado)) {
    relatorio.conclusao.push(
      "/me retornou o mesmo ID da Página configurada → token age como a Página."
    );
  } else if (meId && meId !== String(pageIdEsperado)) {
    relatorio.conclusao.push(
      `/me retornou ID ${meId}, diferente do FACEBOOK_PAGE_ID (${pageIdEsperado}).`
    );
  }

  if (!relatorio.permissoes.pages_manage_posts) {
    relatorio.conclusao.push(
      "pages_manage_posts NÃO está presente nos scopes do token."
    );
  } else {
    relatorio.conclusao.push("pages_manage_posts está presente.");
  }

  if (!relatorio.permissoes.pages_read_engagement) {
    relatorio.conclusao.push(
      "pages_read_engagement NÃO está presente nos scopes do token."
    );
  } else {
    relatorio.conclusao.push("pages_read_engagement está presente.");
  }

  if (relatorio.pagina_configurada && !relatorio.pagina_configurada.acessivel) {
    relatorio.conclusao.push(
      "O token não consegue acessar o Page ID configurado nos Secrets."
    );
  }

  return relatorio;
}

async function main() {
  console.log("");
  console.log("================================");
  console.log("MÓDULO 3 – DIAGNÓSTICO DO TOKEN");
  console.log("(sem criar postagem)");
  console.log("================================");
  console.log("");

  const pageId = exigirEnv("FACEBOOK_PAGE_ID");
  const accessToken = exigirEnv("FACEBOOK_PAGE_ACCESS_TOKEN");

  console.log("FACEBOOK_PAGE_ID :", pageId);
  console.log("Token presente   : sim (valor oculto)");
  console.log("");

  const relatorio = await diagnosticar(pageId, accessToken);

  fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(relatorio, null, 2), "utf8");

  console.log("");
  console.log("================================");
  console.log("CONCLUSÃO");
  console.log("================================");
  for (const linha of relatorio.conclusao) {
    console.log("-", linha);
  }
  console.log("");
  console.log("Arquivo criado:", ARQUIVO_SAIDA);
  console.log("(token NÃO foi gravado neste arquivo)");
}

main().catch((erro) => {
  console.error("");
  console.error("ERRO NO DIAGNÓSTICO:");
  console.error(erro.message);

  const falha = {
    sucesso: false,
    modo: "diagnostico",
    gerado_em: new Date().toISOString(),
    erro: erro.message
  };
  try {
    fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(falha, null, 2), "utf8");
  } catch (_) {}

  process.exit(1);
});

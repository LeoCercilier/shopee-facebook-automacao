# Shopee Facebook Automação

Pipeline automático:

**Shopee Achadinho → Coletor → Módulo 2 → Módulo 3 → Página do Facebook**

## O que cada módulo faz

| Módulo | Arquivo | Função |
|--------|---------|--------|
| 1 | `coletor.js` | Abre a página de ofertas do Shopee Achadinho e extrai título, preço, link e imagem |
| 2 | `modulo2.js` | Transforma os dados no formato final + gera o texto da postagem |
| 3 | `modulo3.js` | Publica na Página do Facebook via Graph API (texto + imagem) |

## Fluxo completo

```
ofertas.html (Shopee Achadinho)
        ↓
   coletor.js          → resultado-oferta.json
        ↓
   modulo2.js          → postagem-final.json
        ↓
   modulo3.js          → resultado-postagem.json  +  post real na Página
```

## Configuração rápida (Graph API)

### 1. Criar App no Meta for Developers
1. Acesse https://developers.facebook.com/
2. Crie um App do tipo **Business**
3. Adicione o produto **Facebook Login** (ou use Graph API Explorer)

### 2. Obter o Page Access Token de longa duração
1. Vá em **Graph API Explorer**
2. Selecione o App e a Página
3. Permissões mínimas necessárias:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_read_user_content` (opcional)
4. Gere o token de curta duração
5. Troque por um de longa duração:
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={APP_ID}
     &client_secret={APP_SECRET}
     &fb_exchange_token={TOKEN_CURTO}
   ```
6. Anote o **Page ID** e o **Page Access Token**

### 3. Configurar Secrets no GitHub
No repositório → Settings → Secrets and variables → Actions:

| Secret | Valor |
|--------|-------|
| `FACEBOOK_PAGE_ID` | ID da sua Página |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Token de longa duração |

### 4. Rodar o pipeline
- **Manual**: Actions → “Coletar, formatar e postar oferta” → Run workflow
- **Automático**: a cada 6 horas (cron)

## Testes locais

```bash
# Instalar
npm install
npx playwright install chromium

# Pipeline completo em modo dry-run (não posta de verdade)
npm run pipeline:dry

# Ou passo a passo
npm run coletar
npm run formatar
FACEBOOK_DRY_RUN=1 npm run postar

# Postagem real (precisa das variáveis)
export FACEBOOK_PAGE_ID=seu_page_id
export FACEBOOK_PAGE_ACCESS_TOKEN=seu_token
npm run postar
```

## Arquivos gerados

- `resultado-oferta.json` → dados brutos coletados
- `postagem-final.json` → formato Título / Preço / Link / Imagem + texto
- `resultado-postagem.json` → resposta da Graph API (post_id, link etc.)

## Observações importantes

- O projeto **Shopee Achadinho** não é modificado.
- O Módulo 3 usa apenas a Graph API oficial (sem login de usuário).
- Após validar a postagem na Página, avaliamos a melhor forma de chegar aos **grupos**.

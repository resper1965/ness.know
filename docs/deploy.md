# Implantação do ness.KNOW

Já criados na conta Cloudflare (30/10/2026): D1 `ness-know` (com a migração 0001 aplicada) e R2 `ness-know-arquivos`.

1. **Código e dependências** (fora do OneDrive):

```powershell
git clone https://github.com/resper1965/ness.know C:\dev\ness.know
cd C:\dev\ness.know
npm install
```

2. **Índice de vetores** (antes do primeiro deploy; o índice de metadados precisa existir antes do primeiro vetor):

```powershell
npx wrangler vectorize create ness-know-trechos --dimensions=1024 --metric=cosine
npx wrangler vectorize create-metadata-index ness-know-trechos --propertyName=alvo --type=string
```

3. **Access** (Zero Trust › Access › Applications):
   - App **ness.KNOW**, self-hosted, domínio `know.ness.com.br`, política Allow com os e-mails de admin. Copie o *Application Audience (AUD) Tag* para `ACCESS_AUD` no `wrangler.jsonc`.
   - App **ness.KNOW MCP**, self-hosted, domínio `know.ness.com.br`, caminho `mcp`, política **Bypass / Everyone** (a chave de API protege o `/mcp`).

4. **Deploy** (cria o domínio `know.ness.com.br`):

```powershell
npx wrangler deploy
```

5. **Pacotes** (as pastas do faBRAINzio servem como estão; o pacote base primeiro, os acréscimos depois):

```powershell
$app = "https://know.ness.com.br"
cloudflared access login $app
$p = "C:\Windows\System32\faBRAINzio-pacotes"
node scripts/carregar-pacote.mjs "$p\seguranca-conformidade" $app
node scripts/carregar-pacote.mjs "$p\seguranca-conformidade-nist" $app
node scripts/carregar-pacote.mjs "C:\Users\resper\Downloads\seguranca-conformidade-cis" $app
node scripts/carregar-pacote.mjs "$p\setor-eletrico" $app
node scripts/carregar-pacote.mjs "$p\gestao-servicos-ti" $app
```

6. **Chaves:** abra `https://know.ness.com.br`, gere uma chave por cliente (ex.: faBRAINzio) com os pacotes dele.

7. **Medir:** `node scripts/avaliar-busca.mjs C:\Users\resper\Downloads\perguntas.json $app`.

# Implantação e operação

Os comandos são para PowerShell, num clone fora do OneDrive (`C:\dev\ness.know`). Requisitos: Node e npm, `cloudflared` (para scripts autenticados pelo Access) e acesso à conta Cloudflare da ness.

## Recursos na Cloudflare

| Recurso | Nome | Situação em 30/10/2026 |
| --- | --- | --- |
| Worker | `ness-know` | Publicado em `know.ness.com.br` |
| D1 | `ness-know` | Migração 0001 aplicada |
| R2 | `ness-know-arquivos` | Criado |
| Vectorize | `ness-know-trechos` | Criado, com o índice de metadados `alvo` |
| Access | app `know.ness.com.br` (Allow, e-mails dos admins) e app `know.ness.com.br/mcp` (Bypass, Everyone) | Configurados |

## Implantação inicial (já feita; fica como referência)

```powershell
git clone https://github.com/resper1965/ness.know C:\dev\ness.know
cd C:\dev\ness.know
npm install
npx wrangler vectorize create ness-know-trechos --dimensions=1024 --metric=cosine
npx wrangler vectorize create-metadata-index ness-know-trechos --propertyName=alvo --type=string
npx wrangler vectorize create-metadata-index ness-know-trechos --propertyName=documento_id --type=string
npx wrangler d1 migrations apply ness-know --remote
npx wrangler deploy
```

- **Binding do Vectorize:** se o wrangler perguntar se acrescenta o binding, responda **n**, porque o `wrangler.jsonc` já tem `VETORES`.
- **Índices de metadados:** só valem para vetores gravados depois de criados. Crie os índices antes da primeira carga. Se a carga já tiver sido feita, rode `node scripts/vetorizar.mjs` depois de criá-los.
- **`ACCESS_AUD`:** fica no `wrangler.jsonc` e é o *Application Audience Tag* da aplicação do Access sem caminho.

## Atualizar o serviço

```powershell
cd C:\dev\ness.know
git pull
npm install
npx wrangler d1 migrations apply ness-know --remote
npx wrangler deploy
```

O comando de migrações aplica só as que ainda não rodaram.

## Carregar ou atualizar pacotes

Cada pacote é uma pasta com estes arquivos:

```
pacote.json       {"slug", "nome", "descricao", "versao"}
instrucoes.md     como o agente deve usar o pacote
documentos.json   [{"arquivo", "titulo", "tipo", "versao", "vigencia", "fonte"}]
<os arquivos listados em documentos.json>
```

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

- Cada documento imprime `ok <título>: N trechos` ou `ERRO <título>: motivo`.
- **Recarregar** um documento com o mesmo título substitui a versão anterior, então rodar o script de novo não duplica nada.
- **Pastas de acréscimo** (`-nist`, `-cis`) usam o mesmo `slug` do pacote base e somam documentos a ele.
- **Títulos** são a identidade das normas nas chaves restritas. Mude um título só de propósito, porque a norma sai das chaves restritas a ele.

## Carregar ou atualizar o SCF STRM

O SCF STRM (planilhas Excel do SCF) vira SQL pelo conversor e entra direto no D1. A planilha e o SQL não vão para o Git.

```powershell
cd C:\dev\ness.know
git pull
npm install
npx wrangler d1 migrations apply ness-know --remote
Expand-Archive "C:\Users\resper\Downloads\STRM_2026-1_-_Excel.zip" "$env:TEMP\strm" -Force
node scripts/strm-para-sql.mjs "$env:TEMP\strm\STRM 2026-1 - Excel" "$env:TEMP\strm.sql"
npx wrangler d1 execute ness-know --remote --file="$env:TEMP\strm.sql"
npx wrangler deploy
```

- O conversor lê só a primeira aba de cada planilha e para com `<arquivo>: cabeçalho não reconhecido (falta …)` ou `<arquivo>: planilha sem abas` se o formato mudar.
- O SQL cria o pacote `scf-strm` ("Correspondência entre frameworks") e substitui todo o conteúdo anterior.
- Para liberar a uma chave, gere uma chave nova com o pacote **Correspondência entre frameworks** marcado.
- Uma versão nova do SCF repete os mesmos passos com o novo zip.

## Rotina

| Tarefa | Como |
| --- | --- |
| Liberar acesso a um agente | Aba **Chaves**: nome, pacotes inteiros ou normas escolhidas, **Gerar chave**. Entregue a chave por canal seguro |
| Mudar o que uma chave enxerga | Gere uma nova chave e revogue a antiga |
| Revogar | Aba **Chaves**, **Revogar**, **Confirmar** |
| Ver se um agente está usando | Coluna **Último uso** (atualizada a cada `initialize`) |
| Conferir uma chave | Aba **Conectar um agente**, comando `curl`; `401` indica chave errada ou revogada |
| Incluir um administrador | Acrescente o e-mail em `ADMIN_EMAILS` no `wrangler.jsonc` e na política do Access, e rode `npx wrangler deploy` |
| Medir a busca | `node scripts/avaliar-busca.mjs <perguntas.json> $app [pacote,pacote]` |
| Refazer os vetores | `node scripts/vetorizar.mjs $app` (só sobrescreve) |

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Interface mostra "Sua sessão expirou" logo ao abrir | Falta a aplicação do Access sem caminho, `ACCESS_AUD` errado ou e-mail fora de `ADMIN_EMAILS` | Confira os três e rode `npx wrangler deploy` |
| `/mcp` pede login no navegador | A aplicação Bypass do caminho `mcp` não existe ou está com Allow | Ajuste no Zero Trust |
| Agente recebe `401` | Chave errada, revogada ou sem o prefixo `Bearer` | Conferir com o `curl`; gerar outra |
| Busca semântica vazia numa chave restrita | Falta o índice de metadados `documento_id`, ou os vetores são anteriores a ele | Criar o índice e rodar `node scripts/vetorizar.mjs $app` |
| Documento com situação "Falhou" | PDF sem camada de texto ou arquivo corrompido | Usar um PDF com texto (OCR) e recarregar |
| `cloudflared access token` falha | Sessão do Access expirada | `cloudflared access login https://know.ness.com.br` |

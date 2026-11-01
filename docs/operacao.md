# Implantação e operação

Os comandos são para PowerShell, num clone fora do OneDrive (`C:\dev\ness.know`). Requisitos: Node e npm, `cloudflared` (para scripts autenticados pelo Access) e acesso à conta Cloudflare da ness.

## Recursos na Cloudflare

| Recurso | Nome | Situação em 31/10/2026 |
| --- | --- | --- |
| Worker | `ness-know` | Publicado em `know.ness.com.br` |
| D1 | `ness-know` | Migrações 0001 a 0003 aplicadas; 0004 pendente (ver [lacunas.md](lacunas.md), seção 1) |
| R2 | `ness-know-arquivos` | Criado |
| Vectorize | `ness-know-trechos` | Criado, com os índices de metadados `alvo` e `documento_id` |
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
node scripts/carregar-pacote.mjs pacotes\legislacao-digital $app   # neste repositório (ctresb/leis)
node scripts/carregar-pacote.mjs pacotes\crimes-ciberneticos-e-ti $app
```

- Cada documento imprime `ok <título>: N trechos` ou `ERRO <título>: motivo`.
- **Recarregar** um documento com o mesmo título substitui a versão anterior, então rodar o script de novo não duplica nada.
- **Pastas de acréscimo** (`-nist`, `-cis`) usam o mesmo `slug` do pacote base e somam documentos a ele.
- **Títulos** são a identidade das normas nas chaves restritas. Mude um título só de propósito, porque a norma sai das chaves restritas a ele.

## Carregar leis do acervo ctresb/leis

O [ctresb/leis](https://github.com/ctresb/leis) (MIT) traz a legislação brasileira em Markdown com cabeçalho YAML (título, tipo, data, ementa, `revogada`, `fonte`). O acervo inteiro (1,26 milhão de normas, 6,9 GB de texto) não cabe no D1 (10 GB, com o FTS) e levaria semanas a uma norma por chamada. **Carregue recortes**: as normas de um tema, não pastas inteiras de estado.

```powershell
# Clone parcial: sem o checkout (23 GB), depois só as pastas do recorte.
git clone --depth 1 --filter=blob:none --sparse https://github.com/ctresb/leis C:\dev\leis
git -C C:\dev\leis sparse-checkout set federal/leis-ordinarias reguladores/aneel
$p = "C:\pacotes\legislacao-digital"   # já com pacote.json e instrucoes.md
node scripts/leis-para-pacote.mjs C:\dev\leis $p federal/leis-ordinarias/2018/lei-13709-2018-08-14.md federal/leis-ordinarias/2014/lei-12965-2014-04-23.md
node scripts/carregar-pacote.mjs $p $app
```

- Cada `<caminho>` é um `.md` ou uma pasta do clone. As normas com `revogada: true` ficam de fora, e o conversor lista os títulos delas.
- **Recarregar não apaga** o que já está no pacote. Uma norma que saiu do `documentos.json` (revogada, ou trocada por outra) continua na busca até ser apagada. Para apagar, acrescente `--sincronizar` ao `carregar-pacote.mjs`: depois da carga, ele apaga do pacote os títulos que não estão no `documentos.json`. Se algum documento falhar na carga, ele não apaga nada. **Não use em pastas de acréscimo** (`-nist`, `-cis`), porque apagaria as normas do pacote base.
- **Título** = título da norma + UF + ementa (até 250 caracteres). Se dois arquivos dão o mesmo título, o segundo leva o caminho entre colchetes, porque título repetido substitui a outra norma na carga.
- `versao` recebe `versao_texto` (compilada ou original), `vigencia` recebe a data da norma, `fonte` o link oficial.
- Os vetores são gravados na própria carga; não precisa rodar `vetorizar.mjs`.
- O conversor põe cada artigo numa linha própria, então os trechos saem cortados e rotulados por artigo (`Art. 7º`).
- **Tamanho do pacote:** `listar_pacotes` devolve todos os títulos do pacote ao agente. Mantenha cada pacote em centenas de normas, não em milhares.
- Os textos são conversões automáticas e OCR, não a publicação oficial. Diga isso no `instrucoes.md` e mande o agente citar o link `fonte`.

## Carregar ou atualizar o SCF STRM

Duas cargas, sempre da mesma versão do SCF (a numeração dos controles muda entre versões): o catálogo (`scf-full-<versão>.json`) e o STRM. Os arquivos do SCF e o SQL gerado não vão para o Git.

```powershell
cd C:\dev\ness.know
git pull
npm install --include=dev
npx wrangler d1 migrations apply ness-know --remote
$scf = "$env:TEMP\scf"
Expand-Archive "<caminho>\SCF-2026-3.zip" $scf -Force
node scripts/scf-catalogo-para-sql.mjs "$scf\SCF-2026-3\JSON\scf-full-2026.3.json" "$env:TEMP\scf-catalogo.sql"
pip install pdfplumber
python scripts/strm-pdf-para-json.py "$scf\SCF-2026-3\Set Theory Relatiohship Mapping (STRM)" "$env:TEMP\strm.json"
node scripts/strm-para-sql.mjs "$env:TEMP\strm.json" "$env:TEMP\strm.sql"
npx wrangler d1 execute ness-know --remote --file="$env:TEMP\scf-catalogo.sql"
npx wrangler d1 execute ness-know --remote --file="$env:TEMP\strm.sql"
npx wrangler deploy
```

- Quando a versão trouxer o STRM em Excel (pasta de `scf-strm-*.xlsx`), passe a pasta direto ao `strm-para-sql.mjs`, sem o passo do Python.
- A extração dos PDFs leva de 20 a 40 minutos (268 arquivos).

- O conversor lê só a primeira aba de cada planilha e para com `<arquivo>: cabeçalho não reconhecido (falta …)` ou `<arquivo>: planilha sem abas` se o formato mudar.
- O SQL cria o pacote `scf-strm` ("Correspondência entre frameworks") e substitui todo o conteúdo anterior.
- Para liberar a uma chave, gere uma chave nova com o pacote **Correspondência entre frameworks** marcado.
- Rode os `d1 execute` fora do horário comercial: importar os SQL (cerca de 8 e 11 MB) pode deixar as consultas do /mcp lentas por instantes.
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

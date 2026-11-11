# Implantação e operação

Os comandos são para PowerShell, num clone fora do OneDrive (`C:\dev\ness.know`). Requisitos: Node e npm, `cloudflared` (para scripts autenticados pelo Access) e acesso à conta Cloudflare da ness.

## Recursos na Cloudflare

| Recurso | Nome | Situação em 03/11/2026 |
| --- | --- | --- |
| Worker | `ness-know` | Publicado em `know.ness.com.br` com o código do `main` (01/11/2026) |
| D1 | `ness-know` | Migrações 0001 a 0004 aplicadas na época (as seguintes, até a 0011, estão em `migrations/` e se aplicam com o comando de migrações); SCF 2026.3 carregado (catálogo e STRM, 03/11/2026) |
| R2 | `ness-know-arquivos` | Criado |
| Vectorize | `ness-know-trechos` | Criado, com os índices de metadados `alvo` e `documento_id` |
| Access | app `know.ness.com.br` (Allow, e-mails dos admins) e app `know.ness.com.br/mcp` (Bypass, Everyone) | Configurados. Para o OAuth faltam os Bypass e a aplicação de `/oauth/authorize` (seção abaixo) |

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

## Ligar o OAuth do /mcp (Access)

O código já está pronto (`src/oauth.ts`, migração 0009). Falta configurar o Access, na ordem. Zero Trust › Access controls › Applications › Add an application › Self-hosted, destino `know.ness.com.br`.

1. **Painel (já existe):** aplicação sem caminho, política Allow só para os administradores. Não muda.
2. **Bypass (política Bypass, Include Everyone), uma aplicação por caminho** ou uma com vários destinos: `mcp` (já existe), `health`, `.well-known/*`, `oauth/register` e `oauth/token`. Esses endereços são chamados pelo cliente MCP sem navegador, e quem os protege é o código (PKCE, código de uso único, limite de registro).
3. **`/oauth/authorize` (nova aplicação):** destino `know.ness.com.br`, caminho `oauth/authorize`, política Allow para os colaboradores da ness. (grupo ou domínio no Entra), **sem** exigir estar em `ADMIN_EMAILS`: quem autoriza é qualquer colaborador, e o que ele enxerga depois é decidido pelas regras da aba Acesso por pessoa. O Access escolhe a aplicação de caminho mais específico, então esta vale no lugar da do painel.
4. **`ACCESS_AUD_OAUTH`:** cada aplicação tem o seu *Application Audience Tag*. Copie o da aplicação do passo 3 para `ACCESS_AUD_OAUTH` em `vars` no `wrangler.jsonc` (sem ela, o Worker usa o `ACCESS_AUD` do painel e recusa o login com 401).
5. Aplique a migração e publique: `npx wrangler d1 migrations apply ness-know --remote` e `npx wrangler deploy`. Os dois limites novos (`LIMITE_REGISTRO_IP` e `LIMITE_REGISTRO`) são criados no deploy.
6. Na aba **Acesso por pessoa**, defina o padrão para todos (por exemplo, as leis públicas). Sem regra nenhuma, a pessoa autoriza e não vê nada.
7. Confira: `curl https://know.ness.com.br/.well-known/oauth-authorization-server` devolve o JSON de descoberta, e conectar o ness.work pelo endereço `https://know.ness.com.br/mcp` abre o consentimento.

## Uma base por empresa (cliente com a própria instância)

Cada empresa tem um **pacote** e uma **chave** só dela. O filtro é aplicado no servidor: a chave de uma empresa não alcança o pacote de outra, nem pedindo pelo nome. A empresa cola o endereço `https://know.ness.com.br/mcp` e a chave no Cloudflare OS dela.

**Criar:**
1. Carregue o pacote (`node scripts/carregar-pacote.mjs <pasta> <url>`; o `slug` em `pacote.json` identifica a empresa, por exemplo `cliente-x`).
2. Na aba **Pacotes**, abra o pacote e defina a **cota de documentos**, se quiser limitar.
3. Na aba **Chaves**, gere uma chave com o pacote da empresa (e, se for o caso, os pacotes comuns), com **validade** (por exemplo, 1 ano). A chave aparece uma vez; entregue por um canal seguro.
4. Acompanhe o uso na lista de chaves ("chamadas em 30 dias"). O limite de 240 chamadas por minuto vale por chave.
5. **Se a empresa sobe o próprio conteúdo:** na aba **Envio por empresa**, gere uma **chave de envio** para o pacote dela (precisa de cota, definida no passo 2). É outra credencial, com outro prefixo (`nessup_`): ela só grava no pacote da empresa, não lê pelo MCP, e a chave do MCP não grava. Entregue à empresa essa chave e o endereço `https://know.ness.com.br/enviar`. A chave vence em 1 ano e se revoga na mesma aba.

**Access para o envio pela empresa** (uma vez): a empresa não tem login no Access da ness., então estes caminhos precisam de **Bypass** (política Bypass, Include Everyone), como o `/mcp`: `enviar` e `api/envio/*`. Quem os protege é a chave de envio, o limite por chave (30 chamadas por minuto) e o limite de falhas por IP. O resto do painel continua atrás do Access. Depois do deploy, teste: abrir `https://know.ness.com.br/enviar` sem login deve mostrar a página, e `curl https://know.ness.com.br/api/envio/documentos` deve responder 401 em JSON (e não redirecionar para o login).

**O que a empresa pode fazer com a chave de envio:** listar, enviar (até 15 MB por arquivo e até a cota de documentos) e apagar documentos do próprio pacote. Enviar de novo um arquivo com o mesmo título substitui a versão anterior sem gastar cota. Ela não vê outros pacotes, não cria chaves e não mexe em regras de acesso. Cada envio e cada exclusão entram em `auditoria` (`envio.enviar`, `envio.apagar`), com o título e sem o conteúdo.

**Remover** (a empresa saiu ou pediu a exclusão dos dados):
1. Revogue a chave do MCP (aba Chaves) e a de envio (aba Envio por empresa) e tire o pacote das regras de acesso e das skills. Enquanto algo usar o pacote, a exclusão responde 409 e lista o que falta.
2. Na aba **Pacotes**, abra o pacote, clique em **Excluir pacote** e digite o slug. Isso apaga os documentos, os arquivos, os trechos e os vetores. Não dá para desfazer.
3. Se o faBRAINzio liga o pacote a uma organização (`org_pacotes`), tire a ligação lá: o ness.know não enxerga essa tabela.

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

### Conferir o STRM carregado

Depois de carregar uma versão nova do STRM, confira o que está em produção contra as planilhas da versão anterior (lacuna 3.1). O script só lê:

```powershell
cloudflared access login https://know.ness.com.br
node scripts/conferir-strm.mjs "<pasta-das-planilhas-2026.1>" https://know.ness.com.br
```

- Compara por framework e por item (a numeração do próprio framework é estável; os controles SCF foram renumerados no 2026.3, então o par item × controle não serve).
- `FALHA`: um framework perdeu mais de 2% dos itens (`--limite` muda), ou um framework da versão anterior sumiu. O script sai com código 1.
- `aviso`: o número de ligações mudou mais de 15%, o que a renumeração pode explicar. Só informa.
- Sem as planilhas da versão anterior (por exemplo, só o zip do SCF 2026.3, que vem em PDF), use `node scripts/conferir-strm.mjs --sem-anterior https://know.ness.com.br`: lista os frameworks de produção, marca como `FALHA` os que têm menos de 3 itens e imprime a amostra com o nome do PDF (`scf-strm-<id>.pdf`) para você conferir à mão. É uma conferência mais fraca: não compara com outra versão.
- Sorteia 30 itens (`--amostra`) de 3 frameworks (`--frameworks 27002-2022,csf-2,txramp`, trecho do id) e mostra as ligações de antes e de depois, para você conferir à mão contra o PDF ou a planilha.

## Rotina

| Tarefa | Como |
| --- | --- |
| Liberar acesso a um agente | Aba **Chaves**: nome, pacotes inteiros ou normas escolhidas, **Gerar chave**. Entregue a chave por canal seguro |
| Conferir se as leis envelheceram | Uma vez por mês: `git -C C:\dev\leis pull` e `node scripts/verificar-leis.mjs C:\dev\leis`. Para cada norma dos pacotes `legislacao-digital` e `crimes-ciberneticos-e-ti`, procura no acervo ctresb/leis os atos que a alteram ou revogam e diz o que o texto ainda não cita. `FALTA` (e código de saída 1) é alteração publicada depois da carga, ou qualquer alteração de um texto original: recarregue o pacote com o texto novo. `conferir` é alteração anterior à carga que o texto não cita, quase sempre dispositivo revogado depois ou medida provisória que perdeu a vigência: confira no Planalto. Só vê atos federais de 2000 em diante que citam a norma na ementa |
| Mandar a chave a um usuário | Logo depois de **Gerar chave**, clique em **Ver como conectar com esta chave**, escolha o agente dele e use **Copiar mensagem pronta**: o texto já traz os pacotes liberados, a receita com a chave, a conferência e os cuidados. A chave some ao recarregar a página. O usuário não precisa de acesso à interface |
| Mudar o que uma chave enxerga | Gere uma nova chave e revogue a antiga |
| Revogar | Aba **Chaves**, **Revogar**, **Confirmar** |
| Dar validade a uma chave | Ao gerar, escolha **Validade** (30 dias a 1 ano). Chaves a menos de 14 dias de vencer aparecem em laranja; chave vencida recebe `401` |
| Ver se um agente está usando | Coluna **Último uso** (atualizada a cada `initialize`) |
| Conferir uma chave | Aba **Conectar um agente**, comando `curl`; `401` indica chave errada ou revogada |
| Incluir um administrador | Acrescente o e-mail em `ADMIN_EMAILS` no `wrangler.jsonc` e na política do Access, e rode `npx wrangler deploy` |
| Medir a busca | `node scripts/avaliar-busca.mjs <perguntas.json> $app [pacote,pacote]`; gabaritos prontos e resultados em [gabaritos/](gabaritos/README.md) |
| Refazer os vetores | `node scripts/vetorizar.mjs $app` (só sobrescreve) |

## Backup, monitoramento e alertas

- **Restauração do banco (Time Travel).** O D1 guarda o histórico para voltar a qualquer minuto dos últimos 30 dias no plano Workers Paid (7 dias no gratuito), segundo a documentação da Cloudflare. **Confirme no painel** (Workers & Pages › D1 › `ness-know`) o plano e a janela da conta. Comandos: `npx wrangler d1 time-travel info ness-know` mostra o ponto atual, e `npx wrangler d1 time-travel restore ness-know --timestamp=<AAAA-MM-DDTHH:MM:SSZ>` volta ao instante escolhido (confira a sintaxe com `--help` antes de usar; a restauração substitui o estado atual, então anote o ponto atual antes).
- **Exportação manual.** `npx wrangler d1 export ness-know --remote --output=backup.sql`. **Não foi testado aqui**: o banco tem uma tabela virtual (`trechos_fts`, FTS5) e a exportação do D1 pode recusar bancos com tabelas virtuais. Se recusar, o Time Travel é o caminho de backup. Os originais dos documentos ficam no R2 e os pacotes na pasta de origem, então o conteúdo se refaz com `carregar-pacote.mjs`.
- **Saúde do serviço.** `GET /health` responde `ok` sem tocar no banco. `GET /health?profundo=1` faz um `SELECT 1` no D1 e responde `503 banco indisponível` se falhar. Para um monitor externo ver esse endereço, crie no Zero Trust uma aplicação do Access só para `know.ness.com.br/health` com política **Bypass › Everyone**, como a do caminho `/mcp` (Zero Trust › Access controls › Applications › Add an application › Self-hosted; destino `know.ness.com.br`, caminho `health`; política Bypass, Include Everyone). Sem isso o `/health` cai no login do Access.
- **Alertas.** Configure em Notificações da Cloudflare (Notifications › Add) um aviso para erros do Worker `ness-know`, e aponte o monitor externo para `/health?profundo=1`. Este repositório não cria alertas; os passos exatos do painel mudam, então siga a tela.

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Interface mostra "Sua sessão expirou" logo ao abrir | Falta a aplicação do Access sem caminho, `ACCESS_AUD` errado ou e-mail fora de `ADMIN_EMAILS` | Confira os três e rode `npx wrangler deploy` |
| `/mcp` pede login no navegador | A aplicação Bypass do caminho `mcp` não existe ou está com Allow | Ajuste no Zero Trust |
| Agente recebe `429` | A chave passou de 240 chamadas por minuto (o faBRAINzio usa uma chave só para todos os usuários) | Espere 30 segundos. Se for uso normal, suba `limit` em `ratelimits` no `wrangler.jsonc` e rode `npx wrangler deploy` |
| Agente recebe `401` | Chave errada, revogada, **vencida** (a aba Chaves mostra "Vencida em …") ou sem o prefixo `Bearer` | Conferir com o `curl`; gerar outra |
| Agente recebe `429` com `limite de requisições excedido` (sem "da chave") | Mais de 30 tentativas por minuto com chave ausente ou inválida a partir do mesmo IP (`LIMITE_AUTH`) | Corrigir a chave do agente; a espera é de 30 segundos |
| Cliente de navegador recebe `403 origem não permitida` | O `Origin` dele não está em `ORIGENS_MCP` | Acrescentar a origem à var `ORIGENS_MCP` no `wrangler.jsonc` (lista separada por vírgula) e rodar `npx wrangler deploy`. Agentes e CLIs não mandam `Origin` e não precisam disso |
| Busca semântica vazia numa chave restrita | Falta o índice de metadados `documento_id`, ou os vetores são anteriores a ele | Criar o índice e rodar `node scripts/vetorizar.mjs $app` |
| Documento com situação "Falhou" | PDF sem camada de texto ou arquivo corrompido | Usar um PDF com texto (OCR) e recarregar |
| Carga mostra `AVISO …: vetores não gravados` | O Workers AI ou o Vectorize falhou na hora de gerar os vetores. O documento e os trechos ficam gravados e a busca textual já o acha | Rode `node scripts/vetorizar.mjs $app` (só sobrescreve) |
| Recarga ou exclusão dá `500` e a norma aparece duas vezes no pacote | O Vectorize falhou ao apagar os vetores da versão anterior. O documento antigo fica, de propósito, para não deixar vetor órfão | Rode a carga de novo (ou `DELETE /api/documentos/<id>` da versão antiga) quando o Vectorize voltar |
| `cloudflared access token` falha | Sessão do Access expirada | `cloudflared access login https://know.ness.com.br` |

# Pedidos de autorização (rascunhos)

Rascunhos em inglês para a ness. enviar, em 27/11/2026. **O ness.know não envia nada**: quem assina e envia é a pessoa responsável. Preencha os campos entre colchetes. Cada pedido diz o que o ness.know faz e o que não faz, porque é isso que os termos de cada fornecedor restringem. Nenhum deles foi enviado.

Contexto comum a todos: o ness.know é um serviço **interno e somente leitura** da NESS. Quem consulta são colaboradores da equipe de SOC e NOC e um sistema interno. Ele **não revende, não repassa a clientes e não treina modelos de IA**. Guarda só metadados (título, data, identificadores e link para a origem) e sempre aponta de volta ao fornecedor.

## 1. Fortinet: avisos PSIRT (já em uso) e documentação

**Para:** o contato jurídico ou de parcerias da Fortinet (o site lista `legal@fortinet.com` e o canal de parceiros; confirme antes de enviar).
**Assunto:** Permission to use the FortiGuard PSIRT RSS feed internally

> Hello,
>
> [Nome], [cargo], NESS ([cidade], Brazil). We are a managed security and IT services company and a [cliente/parceiro, se for] of Fortinet.
>
> We run an internal, read-only knowledge service used by our SOC/NOC analysts. It reads the public FortiGuard PSIRT RSS feed (https://filestore.fortinet.com/fortiguard/rss/ir.xml) and stores only each advisory's title, short summary, CVE identifiers, publication date and the link back to fortiguard.com. We do not republish the advisory text, do not resell or share this data with customers or third parties, and do not use it to train AI models.
>
> Your site terms limit use to non-commercial use within the user's organization. Could you confirm in writing that this internal use of the PSIRT feed is permitted for NESS, or tell us what agreement we would need?
>
> We would also like to ask whether FortiOS administration documentation (docs.fortinet.com) may be searched for the same internal purpose, linking back to the source and without copying pages.
>
> Thank you,
> [Nome], [e-mail], [telefone]

## 2. RIPE NCC: RIPEstat

**Para:** `stat@ripe.net` (indicado nos termos do RIPEstat).
**Assunto:** Permission request: internal use of RIPEstat Data API for network monitoring

> Hello,
>
> [Nome], [cargo], NESS ([cidade], Brazil), a managed security and IT services company.
>
> We would like to use the RIPEstat Data API (as-overview, announced-prefixes, prefix-overview and geolocation) in an internal tool for our network operations and security analysts, to answer questions such as which network and country an IP address belongs to during incident analysis. Use would be low volume (well under 1,000 requests per day), identified with a `sourceapp` value, with short caching (up to 24 hours). We would not redistribute or repackage the data, and we would not offer it as a product to customers.
>
> The RIPEstat Service Terms state that commercial use requires written permission from the RIPE NCC. Could you confirm whether this internal use is permitted, or what permission we need?
>
> Thank you,
> [Nome], [e-mail]

## 3. OffSec: Exploit-DB

**Para:** o contato do Exploit-DB (o site indica a equipe do Exploit Database; confirme em exploit-db.com/about-exploit-db).
**Assunto:** Permission to index Exploit-DB metadata internally

> Hello,
>
> [Nome], [cargo], NESS ([cidade], Brazil), a managed security and IT services company.
>
> We would like to download the public `files_exploits.csv` index from the Exploit Database repository once a day and store only the exploit id, title, type, date and CVE identifiers, so our SOC analysts can see whether a public exploit exists for a CVE. We would link every entry back to exploit-db.com, would not copy exploit code, and would not share the data with customers or third parties.
>
> The site terms say users may not reproduce or copy any portion of the Service without written permission. Could you confirm in writing that this internal, metadata-only use is allowed?
>
> Thank you,
> [Nome], [e-mail]

## 4. Palo Alto Networks e Ivanti: RSS de avisos

Um e-mail por fornecedor, ao contato de parcerias ou jurídico (confirme nos sites).
**Assunto:** Permission to use your security advisory RSS feed internally

> Hello,
>
> [Nome], [cargo], NESS ([cidade], Brazil), a managed security and IT services company [and a partner/customer of your company, se for].
>
> We would like to read your public security advisory RSS feed ([https://security.paloaltonetworks.com/rss.xml | https://www.ivanti.com/blog/topics/security-advisory/rss]) in an internal, read-only tool for our SOC/NOC analysts, storing only each advisory's title, date, CVE identifiers and the link back to your site. We would not copy advisory text, redistribute it, or share it with customers or third parties.
>
> Your site terms limit use to personal, non-commercial internal use. Could you confirm in writing that this internal use is permitted for NESS?
>
> Thank you,
> [Nome], [e-mail]

## 5. NIC.br: CERT.br

**Para:** o contato do CERT.br (`/contato/` no site).
**Assunto:** Autorização para uso interno do feed de notícias do CERT.br

> Olá,
>
> [Nome], [cargo], NESS ([cidade]), empresa de serviços gerenciados de segurança e TI.
>
> Gostaríamos de ler o feed RSS público do CERT.br (https://cert.br/rss/certbr-rss.xml) numa ferramenta interna, somente leitura, usada pela nossa equipe de SOC e NOC, guardando apenas título, data, identificadores CVE e o link para a página original. Não copiamos o texto, não redistribuímos e não repassamos a clientes.
>
> O conteúdo do site é CC BY-NC-ND 4.0. Podem confirmar por escrito se esse uso interno é permitido para a NESS, ou qual autorização seria necessária?
>
> Obrigado,
> [Nome], [e-mail]

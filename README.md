# ness.KNOW

Base de normas, leis e frameworks curada pela ness. (ISO/ABNT, NIST, CIS, ITIL, regulação do setor elétrico), servida por **MCP** a qualquer agente ou projeto, com **chave de API** por cliente.

- `POST /mcp`: MCP Streamable HTTP, sem sessão. Ferramentas só de leitura: `listar_pacotes` (JSON com instruções de uso e documentos) e `buscar_conhecimento` (JSON com trechos, seção e uma fonte `ref: know-…` por trecho). Autenticação: `Authorization: Bearer nesskb_…`.
- `/`: interface de admin (atrás do Cloudflare Access): gerar e revogar chaves, ver pacotes, testar a busca.
- `/api/*`: API de admin (Access + `ADMIN_EMAILS`).

Busca híbrida: FTS5 (palavra, com códigos como A.8.16 em frase) e Vectorize (`bge-m3`, multilíngue), fundidas por RRF com a textual a peso 0,5 e a melhor textual garantida na última vaga. Trechos cortados antes de títulos, com a seção no vetor; sumário e índice não viram vetor. Medido com `scripts/avaliar-busca.mjs` (36 perguntas: 92% no top 5 na semântica, 89% na híbrida).

Origem: extraído do faBRAINzio em 30/10/2026 (`docs/spec.md`).

## Pastas
- `src/busca.ts` corte, seções, ingestão, vetores e busca · `src/mcp.ts` servidor MCP · `src/admin.ts` API · `src/acesso.ts` Access
- `public/` interface · `scripts/` carregar pacote, revetorizar, avaliar · `migrations/` D1 · `docs/` spec e implantação

## Desenvolvimento
`npm install`, `npm test`, `npm run check`. Implantação: `docs/deploy.md`.

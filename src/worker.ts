// ness.KNOW: base de normas, leis e frameworks da ness., consultada por MCP com chave de API.
import { adminDe, type EnvAcesso, emailDoAcesso } from "./acesso";
import { admin } from "./admin";
import type { EnvConhecimento } from "./busca";
import { type EnvMcp, mcp } from "./mcp";
import { autorizar, type EnvOauth, metadados, registrar, token } from "./oauth";

export interface Env extends EnvAcesso, EnvConhecimento, EnvMcp, EnvOauth {
  ASSETS: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname, searchParams } = new URL(req.url);
    if (req.method === "GET" && pathname === "/health") {
      if (!searchParams.has("profundo")) return new Response("ok");
      // Profundo: confere o D1, para um monitor externo distinguir "Worker no ar" de "Worker sem banco".
      return env.DB.prepare("SELECT 1").first().then(
        () => new Response("ok"),
        () => new Response("banco indisponível", { status: 503 }),
      );
    }
    // Fora do Access: a autenticação é a chave de API.
    if (pathname === "/mcp") return mcp(req, env);
    // OAuth do /mcp (oauth.ts). Descoberta, registro e token ficam fora do Access (Bypass); /oauth/authorize fica protegido.
    const meta = req.method === "GET" ? metadados(pathname, new URL(req.url).origin) : null;
    if (meta) return meta;
    if (pathname === "/oauth/register") return registrar(req, env);
    if (pathname === "/oauth/token") return token(req, env);
    if (pathname === "/oauth/authorize") {
      const pessoa = await emailDoAcesso(req, { ACCESS_TEAM: env.ACCESS_TEAM, ACCESS_AUD: env.ACCESS_AUD_OAUTH ?? env.ACCESS_AUD }); // qualquer pessoa liberada no Access, não só ADMIN_EMAILS
      return pessoa ? autorizar(req, env, pessoa) : Response.json({ erro: "não autorizado" }, { status: 401 });
    }
    if (pathname.startsWith("/api/")) {
      const email = await adminDe(req, env);
      if (!email) return Response.json({ erro: "não autorizado" }, { status: 401 });
      return admin(req, env, email, pathname);
    }
    return env.ASSETS.fetch(req);
  },
};

// ness.KNOW: base de normas, leis e frameworks da ness., consultada por MCP com chave de API.
import { adminDe, type EnvAcesso } from "./acesso";
import { admin } from "./admin";
import type { EnvConhecimento } from "./busca";
import { type EnvMcp, mcp } from "./mcp";

export interface Env extends EnvAcesso, EnvConhecimento, EnvMcp {
  ASSETS: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === "GET" && pathname === "/health") return new Response("ok");
    // Fora do Access: a autenticação é a chave de API.
    if (pathname === "/mcp") return mcp(req, env);
    if (pathname.startsWith("/api/")) {
      const email = await adminDe(req, env);
      if (!email) return Response.json({ erro: "não autorizado" }, { status: 401 });
      return admin(req, env, email, pathname);
    }
    return env.ASSETS.fetch(req);
  },
};

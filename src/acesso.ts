// Login da interface de admin: Cloudflare Access (o Worker confere o token mesmo assim) e lista de e-mails autorizados.
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface EnvAcesso {
  ACCESS_TEAM: string; // <time>.cloudflareaccess.com
  ACCESS_AUD: string; // "Application Audience (AUD) Tag" do app no Access
  ADMIN_EMAILS: string; // quem administra, separados por vírgula
}

export const permitido = (email: string, lista: string) =>
  lista
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(email.toLowerCase());

const chaves = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** E-mail do token do Access; sem conferir aqui, um erro de configuração no Access deixaria a API aberta. */
export async function emailDoAcesso(req: Request, env: Pick<EnvAcesso, "ACCESS_TEAM" | "ACCESS_AUD">): Promise<string | null> {
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  const emissor = `https://${env.ACCESS_TEAM}`;
  if (!chaves.has(emissor)) chaves.set(emissor, createRemoteJWKSet(new URL(`${emissor}/cdn-cgi/access/certs`)));
  try {
    const { payload } = await jwtVerify(token, chaves.get(emissor)!, { issuer: emissor, audience: env.ACCESS_AUD });
    return String(payload.email ?? "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Admin = token do Access válido e e-mail na lista. */
export async function adminDe(req: Request, env: EnvAcesso): Promise<string | null> {
  const email = await emailDoAcesso(req, env);
  return email && permitido(email, env.ADMIN_EMAILS ?? "") ? email : null;
}

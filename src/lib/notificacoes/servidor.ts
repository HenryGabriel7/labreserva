import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { origemAplicacao, sha256 } from "@/lib/notificacoes";

export function configuracaoDescadastro() {
  const segredo = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
  const appUrl = process.env.APP_URL;
  if (!segredo || segredo.length < 32 || !appUrl)
    throw new Error("DESCADASTRO_NAO_CONFIGURADO");
  return { segredo, origem: origemAplicacao(appUrl) };
}
export async function limitarEndpoint(request: Request, nome: string) {
  const admin = createAdminClient();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sem-ip";
  const { data, error } = await admin.rpc("consumir_rate_limit", {
    p_chave: `publico:${nome}:${await sha256(ip.slice(0, 128))}`,
    p_limite: nome === "resend" ? 120 : 30,
    p_janela_segundos: 60,
  });
  if (error) throw new Error("LIMITE_INDISPONIVEL");
  return data === true;
}
export const cabecalhosPrivados = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

import "server-only";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/data";

type Parametros = Record<string, string | string[] | undefined>;
type DestinoAdmin =
  "/admin/solicitacoes" | "/admin/bloqueios" | "/admin/ocorrencias";

export type PropsPaginaGestao = { searchParams: Promise<Parametros> };
export type EspacoGestao = "admin" | "monitor";

export async function getContextoGestao(
  espaco: EspacoGestao,
  destinoAdmin: DestinoAdmin,
  parametros: Parametros,
) {
  const ctx = await getContexto();
  if (ctx.demonstracao) return ctx;
  if (espaco === "monitor" && ctx.usuario?.roles.includes("admin")) {
    const pesquisa = new URLSearchParams();
    for (const [chave, valores] of Object.entries(parametros)) {
      for (const valor of Array.isArray(valores) ? valores : [valores]) {
        if (valor !== undefined) pesquisa.append(chave, valor);
      }
    }
    redirect(pesquisa.size ? `${destinoAdmin}?${pesquisa}` : destinoAdmin);
  }
  if (!ctx.usuario?.roles.includes(espaco)) redirect("/acesso-negado");
  return ctx;
}

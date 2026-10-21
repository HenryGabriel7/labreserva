import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exportacaoRelatorioSchema,
  gerarCsvRelatorio,
  gerarPdfRelatorio,
  intervaloRelatorio,
  lerJsonLimitado,
  origemPermitida,
  relatorioSchema,
} from "@/lib/relatorios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const erro = (mensagem: string, status: number) =>
  NextResponse.json(
    { error: mensagem },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );

export async function POST(request: Request) {
  if (!origemPermitida(request.headers.get("origin"), process.env.APP_URL))
    return erro("Origem não autorizada.", 403);
  const usuario = await getCurrentUser({ sensitive: true });
  if (!usuario) return erro("Autenticação necessária.", 401);
  if (!usuario.roles.includes("admin"))
    return erro("Acesso não autorizado.", 403);
  let entrada;
  try {
    entrada = exportacaoRelatorioSchema.safeParse(
      await lerJsonLimitado(request),
    );
  } catch {
    return erro("Envie filtros válidos em JSON.", 400);
  }
  if (!entrada.success)
    return erro("Confira o período e os filtros do relatório.", 400);
  try {
    const limite = await createAdminClient().rpc("consumir_rate_limit", {
      p_chave: `exportar-relatorio:${usuario.id}`,
      p_limite: 10,
      p_janela_segundos: 60,
    });
    if (limite.error) return erro("Serviço indisponível.", 503);
    if (limite.data !== true)
      return erro("Aguarde um minuto antes de exportar novamente.", 429);
    const dados = entrada.data;
    const db = await createClient();
    const resultado = await db.rpc("obter_relatorios", {
      ...intervaloRelatorio(dados),
      p_laboratorio_id: dados.laboratorio_id ?? null,
    });
    const relatorio = relatorioSchema.safeParse(resultado.data);
    if (resultado.error || !relatorio.success)
      return erro("Não foi possível preparar o relatório.", 503);
    const conteudo =
      dados.formato === "csv"
        ? gerarCsvRelatorio(relatorio.data, dados)
        : new Uint8Array(await gerarPdfRelatorio(relatorio.data, dados));
    // Sem confirmação do append de auditoria, nenhum arquivo é entregue.
    const auditoria = await db.rpc("registrar_exportacao", {
      p_formato: dados.formato,
      p_filtros: {
        inicio: dados.inicio,
        fim: dados.fim,
        laboratorio_id: dados.laboratorio_id ?? null,
      },
    });
    if (auditoria.error)
      return erro(
        "Não foi possível registrar a exportação. Tente novamente.",
        503,
      );
    return new Response(conteudo, {
      headers: {
        "Content-Type":
          dados.formato === "csv"
            ? "text/csv; charset=utf-8"
            : "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${dados.inicio}-${dados.fim}.${dados.formato}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return erro("Não foi possível exportar o relatório neste momento.", 503);
  }
}

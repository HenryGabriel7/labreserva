import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  lerJsonLimitado,
  origemPermitida,
  privacidadeSchema,
} from "@/lib/relatorios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const resposta = (dados: unknown, status = 200) =>
  NextResponse.json(dados, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request: Request) {
  if (!origemPermitida(request.headers.get("origin"), process.env.APP_URL))
    return resposta({ error: "Origem não autorizada." }, 403);
  const usuario = await getCurrentUser({ sensitive: true });
  if (!usuario) return resposta({ error: "Autenticação necessária." }, 401);
  let entrada;
  try {
    entrada = privacidadeSchema.safeParse(await lerJsonLimitado(request));
  } catch {
    return resposta({ error: "Envie dados válidos em JSON." }, 400);
  }
  if (!entrada.success)
    return resposta({ error: "Confira os dados e o motivo informado." }, 400);
  const dados = entrada.data;
  const administrador = usuario.roles.includes("admin");
  if (
    (dados.acao === "anonimizar" ||
      (dados.usuario_id && dados.usuario_id !== usuario.id)) &&
    !administrador
  )
    return resposta({ error: "Acesso não autorizado." }, 403);
  try {
    const limite = await createAdminClient().rpc("consumir_rate_limit", {
      p_chave: `privacidade:${usuario.id}`,
      p_limite: 5,
      p_janela_segundos: 300,
    });
    if (limite.error) return resposta({ error: "Serviço indisponível." }, 503);
    if (limite.data !== true)
      return resposta(
        { error: "Aguarde alguns minutos antes de continuar." },
        429,
      );
    const db = await createClient();
    if (dados.acao === "anonimizar") {
      const resultado = await db.rpc("anonimizar_usuario", {
        p_usuario_id: dados.usuario_id,
        p_motivo: dados.motivo,
      });
      if (resultado.error)
        return resposta(
          {
            error:
              "Não foi possível anonimizar a conta. Confira o usuário e as restrições de administração.",
          },
          400,
        );
      return resposta({ success: true });
    }
    const resultado = await db.rpc("exportar_dados_usuario", {
      p_usuario_id: dados.usuario_id ?? usuario.id,
    });
    if (resultado.error)
      return resposta({ error: "Não foi possível exportar os dados." }, 503);
    if (!resultado.data)
      return resposta({ error: "Registro não disponível." }, 404);
    return new Response(JSON.stringify(resultado.data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="dados-pessoais.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return resposta({ error: "Não foi possível concluir a solicitação." }, 503);
  }
}

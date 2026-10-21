import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_FOTOS_TEMPORARIAS } from "@/lib/uploads";

export async function autorizarUploadOcorrencia(
  request: Request,
  preparar = false,
) {
  const appUrl = process.env.APP_URL;
  if (!appUrl || request.headers.get("origin") !== new URL(appUrl).origin)
    return {
      erro: Response.json(
        { mensagem: "Origem não permitida." },
        { status: 403 },
      ),
    };
  const usuario = await getCurrentUser({ sensitive: true });
  if (!usuario)
    return {
      erro: Response.json(
        { mensagem: "Entre para continuar." },
        { status: 401 },
      ),
    };
  if (!usuario.roles.some((r) => r === "admin" || r === "monitor"))
    return {
      erro: Response.json({ mensagem: "Sem permissão." }, { status: 403 }),
    };
  const db = await createClient();
  const admin = createAdminClient();
  const limite = await admin.rpc("consumir_rate_limit", {
    p_chave: `${preparar ? "ocorrencias-upload" : "ocorrencias"}:${usuario.id}`,
    p_limite: 10,
    p_janela_segundos: 60,
  });
  if (limite.error || limite.data !== true)
    return {
      erro: Response.json(
        { mensagem: "Aguarde antes de tentar novamente." },
        { status: 429 },
      ),
    };
  return { usuario, db, admin };
}

export async function autorizarReservaOcorrencia(
  db: Awaited<ReturnType<typeof createClient>>,
  reservaId: string,
) {
  const { data: reserva, error } = await db
    .from("reservas")
    .select("id,laboratorio_id,status")
    .eq("id", reservaId)
    .maybeSingle();
  if (error || !reserva)
    return {
      erro: Response.json(
        { mensagem: "Reserva não encontrada." },
        { status: 404 },
      ),
    };
  const { data: pode, error: negado } = await db.rpc("pode_gerir_lab", {
    p_laboratorio_id: reserva.laboratorio_id,
  });
  if (negado || pode !== true)
    return {
      erro: Response.json(
        { mensagem: "Sem permissão neste laboratório." },
        { status: 403 },
      ),
    };
  if (!["em_uso", "concluida", "no_show"].includes(reserva.status))
    return {
      erro: Response.json(
        { mensagem: "Essa reserva não permite ocorrência neste momento." },
        { status: 409 },
      ),
    };
  return { reserva };
}

/** A API de upload assinado aceita tokens por duas horas. Só limpamos lotes
 * antigos após essa janela, inclusive os já consumidos, para evitar órfãos de
 * um upload tardio. Objetos de quarentena nunca possuem leitura pelo cliente. */
export async function limparLotesAntigos(
  admin: ReturnType<typeof createAdminClient>,
) {
  const corte = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("ocorrencia_uploads")
    .select("id,paths")
    .lt("expira_em", corte)
    .limit(10);
  for (const lote of data ?? []) {
    const { error } = await admin.storage
      .from(BUCKET_FOTOS_TEMPORARIAS)
      .remove(lote.paths);
    if (!error)
      await admin
        .from("ocorrencia_uploads")
        .delete()
        .eq("id", lote.id)
        .lt("expira_em", corte);
  }
}

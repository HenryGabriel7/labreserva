"use server";
import { z } from "@/lib/validacao";
import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { createClient } from "./supabase/server";
import { mensagemErro } from "./errors";
const schema = z
  .object({
    acao: z.enum([
      "aprovar",
      "recusar",
      "checkin",
      "checkout",
      "no_show",
      "substituir",
    ]),
    reservaId: z.uuid(),
    motivo: z.string().trim().max(2000),
    reservaAntigaId: z.uuid().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      ["aprovar", "recusar", "no_show", "substituir"].includes(v.acao) &&
      v.motivo.length < 3
    )
      ctx.addIssue({
        code: "custom",
        message: "Informe o motivo desta decisão.",
        path: ["motivo"],
      });
    if (v.acao === "substituir" && !v.reservaAntigaId)
      ctx.addIssue({
        code: "custom",
        message: "Selecione a reserva a substituir.",
        path: ["reservaAntigaId"],
      });
  });
export async function decidirReservaAction(dados: unknown) {
  const usuario = await requireUser(["monitor", "admin"], { sensitive: true });
  const parsed = schema.safeParse(dados);
  if (!parsed.success)
    return {
      ok: false,
      mensagem: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  const v = parsed.data;
  const db = await createClient();
  const { data: r, error: consulta } = await db
    .from("reservas")
    .select("id,solicitante_id,laboratorio_id")
    .eq("id", v.reservaId)
    .maybeSingle();
  if (consulta || !r)
    return { ok: false, mensagem: "Reserva não encontrada ou sem permissão." };
  if (r.solicitante_id === usuario.id)
    return {
      ok: false,
      mensagem: "Outra pessoa precisa decidir sua solicitação.",
    };
  const { data: pode, error: permissao } = await db.rpc("pode_gerir_lab", {
    p_laboratorio_id: r.laboratorio_id,
  });
  if (permissao || pode !== true)
    return {
      ok: false,
      mensagem: "Você não é responsável por este laboratório.",
    };
  const rpc = {
    aprovar: "aprovar_reserva",
    recusar: "recusar_reserva",
    checkin: "fazer_checkin",
    checkout: "fazer_checkout",
    no_show: "marcar_no_show",
    substituir: "substituir_reserva",
  }[v.acao];
  const args =
    v.acao === "substituir"
      ? {
          p_reserva_antiga_id: v.reservaAntigaId,
          p_reserva_nova_id: v.reservaId,
          p_motivo: v.motivo,
        }
      : v.acao === "checkin" || v.acao === "checkout"
        ? { p_reserva_id: v.reservaId, p_observacoes: v.motivo || null }
        : { p_reserva_id: v.reservaId, p_motivo: v.motivo };
  const { error } = await db.rpc(rpc, args);
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Operação registrada com sucesso." };
}

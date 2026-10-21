"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validacao";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const entradaSchema = z
  .object({ ids: z.array(z.uuid()).max(50).nullable() })
  .strict();

export async function marcarNotificacoesLidas(
  entrada: unknown,
): Promise<{ error?: string }> {
  const dados = entradaSchema.safeParse(entrada);
  if (!dados.success) return { error: "Seleção de notificações inválida." };
  const usuario = await getCurrentUser();
  if (!usuario)
    return { error: "Entre novamente para atualizar suas notificações." };
  const db = await createClient();
  const { error } = await db.rpc("marcar_notificacoes_lidas", {
    p_ids: dados.data.ids,
  });
  if (error) return { error: "Não foi possível atualizar suas notificações." };
  revalidatePath("/notificacoes");
  return {};
}

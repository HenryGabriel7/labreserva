"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  preferenciasNotificacaoSchema,
  type EstadoAuth,
} from "@/lib/auth-schema";

export async function salvarPreferencias(
  _estado: EstadoAuth,
  entrada: unknown,
): Promise<EstadoAuth> {
  const dados = preferenciasNotificacaoSchema.safeParse(entrada);
  if (!dados.success)
    return { error: "Confira suas preferências de notificação." };
  const usuario = await getCurrentUser();
  if (!usuario)
    return { error: "Entre novamente para salvar suas preferências." };
  const db = await createClient();
  const { error } = await db
    .from("profiles")
    .update({ preferencias_notificacao: dados.data })
    .eq("id", usuario.id)
    .select("id")
    .single();
  if (error) return { error: "Não foi possível salvar suas preferências." };
  revalidatePath("/perfil");
  return { success: "Preferências atualizadas." };
}

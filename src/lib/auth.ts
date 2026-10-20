import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { papeis, type Papel } from "@/lib/types";

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  roles: Papel[];
  ativo: true;
}
type OpcoesAutenticacao = { sensitive?: boolean };
const perfilSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    email: z.email(),
    ativo: z.literal(true),
  })
  .strict();
const papeisDoBancoSchema = z.array(
  z.object({ papel: z.enum(papeis) }).strict(),
);

export async function getCurrentUser(
  opcoes: OpcoesAutenticacao = {},
): Promise<UsuarioAutenticado | null> {
  if (!hasSupabaseConfiguration()) return null;
  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (error || typeof id !== "string" || !z.uuid().safeParse(id).success)
    return null;
  if (opcoes.sensitive) {
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user || data.user.id !== id) return null;
  }
  const [perfil, papeisUsuario] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,nome,email,ativo")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("user_roles").select("papel").eq("user_id", id),
  ]);
  if (perfil.error || papeisUsuario.error) return null;
  const perfilValidado = perfilSchema.safeParse(perfil.data);
  const rolesValidados = papeisDoBancoSchema.safeParse(papeisUsuario.data);
  if (
    !perfilValidado.success ||
    !rolesValidados.success ||
    rolesValidados.data.length === 0
  )
    return null;
  return {
    ...perfilValidado.data,
    roles: rolesValidados.data.map((linha) => linha.papel),
  };
}

export async function requireUser(
  roles: Papel[] = [],
  opcoes: OpcoesAutenticacao = {},
) {
  const usuario = await getCurrentUser(opcoes);
  if (!usuario) redirect("/login");
  if (roles.length && !roles.some((papel) => usuario.roles.includes(papel)))
    redirect("/acesso-negado");
  return usuario;
}

export const getUsuarioAtual = getCurrentUser;
export const requireSession = requireUser;

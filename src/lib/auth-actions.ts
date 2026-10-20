"use server";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import {
  definirSenhaSchema,
  loginSchema,
  recuperarSenhaSchema,
  type EstadoAuth,
} from "@/lib/auth-schema";

const mensagemLogin =
  "Não foi possível entrar. Confira os dados ou tente novamente mais tarde.";
const mensagemRecuperacao =
  "Se os dados corresponderem a uma conta ativa, enviaremos as instruções para seu e-mail.";
const hash = (valor: string) =>
  createHash("sha256").update(valor).digest("hex");
const camposFormulario = (formData: FormData) =>
  Object.fromEntries(
    [...formData.entries()].filter(([chave]) => !chave.startsWith("$ACTION_")),
  );

async function contextoRequisicao() {
  const cabecalhos = await headers();
  const candidato =
    cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    cabecalhos.get("x-real-ip") ??
    "";
  return {
    ip: isIP(candidato) ? candidato : null,
    userAgent: cabecalhos.get("user-agent")?.slice(0, 512) ?? null,
    chaveIp: hash(candidato || "origem-indisponivel"),
  };
}

export async function loginAction(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const dados = loginSchema.safeParse(camposFormulario(formData));
  if (!dados.success) return { error: mensagemLogin };
  try {
    const admin = createAdminClient();
    const contexto = await contextoRequisicao();
    const chaveConta = `login-conta:${hash(dados.data.email)}`;
    const [limite, bloqueio] = await Promise.all([
      admin.rpc("consumir_rate_limit", {
        p_chave: `login-ip:${contexto.chaveIp}`,
        p_limite: 30,
        p_janela_segundos: 900,
      }),
      admin.rpc("verificar_bloqueio_login", { p_chave: chaveConta }),
    ]);
    if (
      limite.error ||
      bloqueio.error ||
      limite.data !== true ||
      bloqueio.data !== false
    )
      return { error: mensagemLogin };
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: dados.data.email,
      password: dados.data.senha,
    });
    const usuario = error ? null : await getCurrentUser({ sensitive: true });
    if (!usuario) {
      if (!error) await supabase.auth.signOut({ scope: "global" });
      const registro = await admin.rpc("registrar_resultado_login", {
        p_chave: chaveConta,
        p_sucesso: false,
      });
      if (registro.error)
        console.error(
          "Falha ao registrar tentativa de autenticação.",
          registro.error.code,
        );
      return { error: mensagemLogin };
    }
    const registro = await admin.rpc("registrar_resultado_login", {
      p_chave: chaveConta,
      p_sucesso: true,
    });
    if (registro.error) {
      await supabase.auth.signOut({ scope: "global" });
      return { error: mensagemLogin };
    }
    if (usuario.roles.includes("admin")) {
      const auditoria = await admin.rpc("registrar_login_admin", {
        p_usuario_id: usuario.id,
        p_ip: contexto.ip,
        p_user_agent: contexto.userAgent,
      });
      if (auditoria.error) {
        await supabase.auth.signOut({ scope: "global" });
        return { error: mensagemLogin };
      }
    }
  } catch {
    console.error("O serviço de login está indisponível.");
    return { error: mensagemLogin };
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function recuperarSenhaAction(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const dados = recuperarSenhaSchema.safeParse(camposFormulario(formData));
  if (!dados.success) return { success: mensagemRecuperacao };
  try {
    const admin = createAdminClient();
    const contexto = await contextoRequisicao();
    const [limiteIp, limiteEmail] = await Promise.all([
      admin.rpc("consumir_rate_limit", {
        p_chave: `recuperacao-ip:${contexto.chaveIp}`,
        p_limite: 10,
        p_janela_segundos: 3600,
      }),
      admin.rpc("consumir_rate_limit", {
        p_chave: `recuperacao-email:${hash(dados.data.email)}`,
        p_limite: 3,
        p_janela_segundos: 3600,
      }),
    ]);
    if (
      limiteIp.error ||
      limiteEmail.error ||
      limiteIp.data !== true ||
      limiteEmail.data !== true
    )
      return { success: mensagemRecuperacao };
    const { data: perfil, error: perfilError } = await admin
      .from("profiles")
      .select("id,email,ativo")
      .eq("email", dados.data.email)
      .eq("ativo", true)
      .maybeSingle();
    if (perfilError || !perfil) return { success: mensagemRecuperacao };
    const appUrl = process.env.APP_URL;
    if (
      !appUrl ||
      ![
        "https:",
        ...(process.env.NODE_ENV !== "production" ? ["http:"] : []),
      ].includes(new URL(appUrl).protocol)
    )
      throw new Error("Origem não configurada.");
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: dados.data.email,
      options: { redirectTo: `${new URL(appUrl).origin}/definir-senha` },
    });
    if (error || !data.properties?.hashed_token || data.user?.id !== perfil.id)
      return { success: mensagemRecuperacao };
    const fila = await admin.rpc("enfileirar_recuperacao", {
      p_usuario_id: perfil.id,
      p_email: dados.data.email,
      p_token_hash: data.properties.hashed_token,
      p_app_url: new URL(appUrl).origin,
    });
    if (fila.error)
      console.error(
        "Falha ao enfileirar recuperação de conta.",
        fila.error.code,
      );
  } catch {
    console.error("O serviço de recuperação de conta está indisponível.");
  }
  return { success: mensagemRecuperacao };
}

export async function definirSenhaAction(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const dados = definirSenhaSchema.safeParse(camposFormulario(formData));
  if (!dados.success)
    return { error: dados.error.issues[0]?.message ?? "Confira a nova senha." };
  try {
    const usuario = await getCurrentUser({ sensitive: true });
    if (!usuario)
      return { error: "O link expirou. Solicite novas instruções de acesso." };
    const admin = createAdminClient();
    const limite = await admin.rpc("consumir_rate_limit", {
      p_chave: `senha:${usuario.id}`,
      p_limite: 5,
      p_janela_segundos: 900,
    });
    if (limite.error || limite.data !== true)
      return { error: "Aguarde alguns minutos antes de tentar novamente." };
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      password: dados.data.senha,
    });
    if (error)
      return {
        error:
          "Não foi possível atualizar a senha. Confira os requisitos e tente novamente.",
      };
    const { error: logoutError } = await supabase.auth.signOut({
      scope: "global",
    });
    if (logoutError)
      return {
        error: "Senha atualizada. Encerre a sessão antes de entrar novamente.",
      };
  } catch {
    return { error: "Não foi possível atualizar a senha neste momento." };
  }
  revalidatePath("/", "layout");
  redirect("/login?senha=atualizada");
}

export async function logoutAction() {
  const supabase = await createClient();
  // Até contas desativadas ou com perfil indisponível precisam conseguir encerrar a sessão.
  await supabase.auth.getUser();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error)
    throw new Error("Não foi possível encerrar as sessões. Tente novamente.");
  revalidatePath("/", "layout");
  redirect("/login");
}

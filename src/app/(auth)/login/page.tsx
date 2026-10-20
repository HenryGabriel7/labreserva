import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Entrar" };
const parametrosSchema = z
  .object({
    senha: z.literal("atualizada").optional(),
    erro: z.literal("link-invalido").optional(),
  })
  .strict();

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getCurrentUser()) redirect("/");
  const parametros = parametrosSchema.safeParse(await searchParams);
  return (
    <>
      <span className="auth-kicker">
        <ShieldCheck size={13} />
        PORTAL ACADÊMICO
      </span>
      <h1>Bom ter você por aqui.</h1>
      <p className="auth-description">
        Acesse sua conta para reservar laboratórios e acompanhar suas
        atividades.
      </p>
      {parametros.success && parametros.data.senha && (
        <p
          className="auth-feedback auth-feedback-success"
          role="status"
          style={{ marginBottom: 20 }}
        >
          Senha atualizada. Entre com sua nova senha.
        </p>
      )}
      {parametros.success && parametros.data.erro && (
        <p
          className="auth-feedback auth-feedback-error"
          role="alert"
          style={{ marginBottom: 20 }}
        >
          Este link é inválido ou expirou. Solicite novas instruções de acesso.
        </p>
      )}
      <LoginForm />
    </>
  );
}

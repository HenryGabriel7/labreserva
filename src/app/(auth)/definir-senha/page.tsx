import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { DefinirSenhaForm } from "../auth-forms";
export const metadata: Metadata = { title: "Definir senha" };
export default async function DefinirSenhaPage() {
  const usuario = await getCurrentUser({ sensitive: true });
  return (
    <>
      <span className="auth-kicker">
        <LockKeyhole size={13} />
        SEGURANÇA DA CONTA
      </span>
      <h1>Uma nova senha para você.</h1>
      {usuario ? (
        <>
          <p className="auth-description">
            Escolha uma senha forte e exclusiva. Depois de salvar, entre
            novamente para continuar.
          </p>
          <DefinirSenhaForm />
        </>
      ) : (
        <>
          <p className="auth-description">
            Abra o link de convite ou recuperação enviado ao seu e-mail para
            definir sua senha.
          </p>
          <Link href="/recuperar-senha" className="button button-primary">
            Solicitar novo link
          </Link>
          <Link href="/login" className="auth-back">
            Voltar para o login
          </Link>
        </>
      )}
    </>
  );
}

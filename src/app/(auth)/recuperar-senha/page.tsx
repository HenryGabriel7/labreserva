import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { RecuperarSenhaForm } from "../auth-forms";
export const metadata: Metadata = { title: "Recuperar senha" };
export default function RecuperarSenhaPage() {
  return (
    <>
      <span className="auth-kicker">
        <KeyRound size={13} />
        RECUPERAÇÃO DE ACESSO
      </span>
      <h1>Vamos recuperar seu acesso.</h1>
      <p className="auth-description">
        Informe seu e-mail institucional. Se houver uma conta ativa, você
        receberá um link para definir uma nova senha.
      </p>
      <RecuperarSenhaForm />
    </>
  );
}

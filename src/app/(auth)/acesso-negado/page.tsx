import Link from "next/link";
import { ShieldAlert } from "lucide-react";
export default function AcessoNegadoPage() {
  return (
    <>
      <span className="auth-kicker">
        <ShieldAlert size={13} />
        ACESSO RESTRITO
      </span>
      <h1>Acesso não autorizado.</h1>
      <p className="auth-description">
        Seu perfil não tem permissão para acessar esta área. Procure a
        administração se precisar de ajuda.
      </p>
      <Link href="/" className="button button-primary">
        Voltar ao início
      </Link>
    </>
  );
}

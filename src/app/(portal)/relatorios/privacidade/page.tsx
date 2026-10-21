import { PageHeading } from "@/components/shared";
import { getContexto } from "@/lib/data";
import { PrivacidadeForm } from "./privacidade-form";
import "../relatorios.css";

export default async function MeusDadosPage() {
  const { demonstracao, usuario } = await getContexto();
  return (
    <>
      <PageHeading
        titulo="Transparência sobre seus dados"
        descricao="Consulte os dados mantidos pela instituição e acompanhe seus direitos de privacidade."
      />
      <PrivacidadeForm
        demonstracao={demonstracao}
        administrador={usuario?.roles.includes("admin") ?? false}
      />
    </>
  );
}

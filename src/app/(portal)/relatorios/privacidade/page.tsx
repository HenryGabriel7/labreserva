import { PageHeading } from "@/components/shared";
import { getContexto } from "@/lib/data";
import { PrivacidadeForm } from "@/components/gestao/privacidade-form";
import "@/components/gestao/relatorios.css";

export default async function MeusDadosPage() {
  const { demonstracao } = await getContexto();
  return (
    <>
      <PageHeading
        titulo="Transparência sobre seus dados"
        descricao="Consulte os dados mantidos pela instituição e acompanhe seus direitos de privacidade."
      />
      <PrivacidadeForm demonstracao={demonstracao} administrador={false} />
    </>
  );
}

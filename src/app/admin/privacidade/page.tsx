import { PrivacidadeForm } from "@/components/gestao/privacidade-form";
import { PageHeading } from "@/components/shared";
import { requireUser } from "@/lib/auth";
import { getContexto } from "@/lib/data";
import "@/components/gestao/relatorios.css";

export default async function PrivacidadeAdmin() {
  const { demonstracao } = await getContexto();
  if (!demonstracao) await requireUser(["admin"], { sensitive: true });
  return (
    <>
      <PageHeading
        titulo="Privacidade institucional"
        descricao="Atenda pedidos de acesso e anonimização de dados pessoais."
      />
      <PrivacidadeForm demonstracao={demonstracao} administrador />
    </>
  );
}

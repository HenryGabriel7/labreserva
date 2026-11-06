import { requireUser } from "@/lib/auth";
import {
  getContexto,
  getLaboratorios,
  getEquipamentos,
  getJanelas,
} from "@/lib/data";
import { PageHeading } from "@/components/shared";
import { AdminCadastros } from "@/components/admin-cadastros";
import "@/app/(portal)/laboratorios/laboratorios.css";
export default async function Gerenciar() {
  const ctx = await getContexto();
  if (!ctx.demonstracao) await requireUser(["admin"]);
  const [laboratorios, equipamentos, janelas] = await Promise.all([
    getLaboratorios(),
    getEquipamentos(),
    getJanelas(),
  ]);
  return (
    <>
      <PageHeading
        titulo="Gestão dos espaços"
        descricao="Configure laboratórios, equipamentos e horários de funcionamento."
      />
      <AdminCadastros
        {...{ laboratorios, equipamentos, janelas }}
        demonstracao={ctx.demonstracao}
      />
    </>
  );
}

import Link from "next/link";
import { z } from "@/lib/validacao";
import { ArrowLeft } from "lucide-react";
import { PageHeading } from "@/components/shared";
import {
  getLaboratorios,
  getEquipamentos,
  getJanelas,
  getContexto,
} from "@/lib/data";
import { ReservaForm } from "@/components/reserva-form";
import "../reservas.css";
const schema = z
  .object({
    lab: z.uuid().optional(),
    data: z.iso.date().optional(),
    inicio: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    fim: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
  })
  .strict();
export default async function NovaReserva({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, laboratorios, equipamentos, janelas, ctx] = await Promise.all([
    searchParams,
    getLaboratorios(),
    getEquipamentos(),
    getJanelas(),
    getContexto(),
  ]);
  const parsed = schema.safeParse(params);
  return (
    <>
      <Link
        href="/reservas"
        className="section-link"
        style={{ marginBottom: 20 }}
      >
        <ArrowLeft size={14} />
        Minhas reservas
      </Link>
      <PageHeading
        titulo="Sua próxima descoberta começa aqui"
        descricao="Reserve um laboratório ou equipamento para dar vida à sua atividade."
      />
      <ReservaForm
        {...{ laboratorios, equipamentos, janelas }}
        labInicial={parsed.success ? parsed.data.lab : undefined}
        dataInicial={parsed.success ? parsed.data.data : undefined}
        horaInicioInicial={parsed.success ? parsed.data.inicio : undefined}
        horaFimInicial={parsed.success ? parsed.data.fim : undefined}
        demonstracao={ctx.demonstracao}
        prioridade={
          ctx.demonstracao ||
          Boolean(
            ctx.usuario?.roles.some(
              (r) => r === "professor" || r === "funcionario",
            ),
          )
        }
      />
    </>
  );
}

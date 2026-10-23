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
import { createClient } from "@/lib/supabase/server";
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
  const politica = { antecedenciaMinHoras: 1, antecedenciaMaxDias: 90 };
  if (!ctx.demonstracao) {
    const db = await createClient();
    const { data: regras, error } = await db
      .from("configuracoes")
      .select("chave,valor")
      .in("chave", ["antecedencia_min_horas", "antecedencia_max_dias"]);
    if (error)
      throw new Error("Não foi possível carregar a política de reservas.");
    for (const regra of regras) {
      if (regra.chave === "antecedencia_min_horas")
        politica.antecedenciaMinHoras = Number(regra.valor);
      if (regra.chave === "antecedencia_max_dias")
        politica.antecedenciaMaxDias = Number(regra.valor);
    }
  }
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
        politica={politica}
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

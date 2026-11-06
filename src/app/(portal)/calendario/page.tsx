import { z } from "@/lib/validacao";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getContexto, getLaboratorios } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { reservasDemo } from "@/lib/demo";
import { PageHeading, EmptyState } from "@/components/shared";
import { Calendario, type Ocupado } from "@/components/calendario";
import { diasCalendario, somarDias } from "@/lib/reservas";
import "./calendario.css";
const schema = z
  .object({
    lab: z.uuid().optional(),
    data: z.iso.date().optional(),
    visao: z.enum(["dia", "semana", "mes"]).optional(),
  })
  .strict();
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, labs, ctx] = await Promise.all([
    searchParams,
    getLaboratorios("ativos"),
    getContexto(),
  ]);
  const parsed = schema.safeParse(params);
  const f = parsed.success ? parsed.data : {};
  const lab = labs.find((l) => l.id === f.lab)?.id ?? labs[0]?.id;
  const data =
    f.data ?? formatInTimeZone(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
  const visao = f.visao ?? "dia";
  if (!lab) return <EmptyState titulo="Nenhum laboratório disponível" />;
  const dias = diasCalendario(data, visao);
  let ocupados: Ocupado[] = [];
  if (ctx.demonstracao)
    ocupados = reservasDemo()
      .filter(
        (r) =>
          r.laboratorio_id === lab && ["aprovada", "em_uso"].includes(r.status),
      )
      .map((r) => ({
        inicio: r.inicio,
        fim: r.fim,
        escopo: r.escopo,
        quantidades: [],
        bloqueado: false,
      }));
  else {
    const db = await createClient();
    const { data: intervalos, error } = await db.rpc(
      "consultar_disponibilidade",
      {
        p_laboratorio_id: lab,
        p_inicio: fromZonedTime(
          `${dias[0]}T00:00:00`,
          "America/Sao_Paulo",
        ).toISOString(),
        p_fim: fromZonedTime(
          `${somarDias(dias.at(-1)!, 1)}T00:00:00`,
          "America/Sao_Paulo",
        ).toISOString(),
      },
    );
    if (error) throw new Error("Falha ao consultar disponibilidade");
    ocupados = intervalos as Ocupado[];
  }
  return (
    <>
      <PageHeading
        titulo="Dê espaço aos seus planos"
        descricao="Consulte os horários de ocupação e encontre o melhor momento para sua atividade."
      />
      <Calendario laboratorios={labs} {...{ lab, data, visao, ocupados }} />
    </>
  );
}

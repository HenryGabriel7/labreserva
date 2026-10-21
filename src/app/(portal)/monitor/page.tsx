import Link from "next/link";
import { z } from "@/lib/validacao";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { ShieldAlert, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getContexto, getLaboratorios } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { reservasDemo } from "@/lib/demo";
import { ordenarSolicitacoes, somarDias } from "@/lib/reservas";
import type { Reserva } from "@/lib/types";
import { PageHeading, Pagination } from "@/components/shared";
import { MonitorPainel } from "@/components/monitor-painel";
import "./monitor.css";
const schema = z
  .object({
    aba: z.enum(["pendentes", "agenda", "historico"]).optional(),
    pagina: z.coerce.number().int().min(1).max(10000).optional(),
    lab: z.uuid().or(z.literal("")).optional(),
  })
  .strict();
export default async function Monitor({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [ctx, params, labs] = await Promise.all([
    getContexto(),
    searchParams,
    getLaboratorios(),
  ]);
  if (!ctx.demonstracao) await requireUser(["admin", "monitor"]);
  const parsed = schema.safeParse(params);
  const f = parsed.success ? parsed.data : {};
  const aba = f.aba ?? "pendentes",
    pagina = f.pagina ?? 1;
  const hoje = formatInTimeZone(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
  let reservas: Reserva[] = [],
    coincidentes: Reserva[] = [],
    total = 0;
  if (ctx.demonstracao) {
    const todas = reservasDemo();
    coincidentes = todas;
    reservas = todas.filter(
      (r) =>
        (!f.lab || r.laboratorio_id === f.lab) &&
        (aba === "pendentes"
          ? r.status === "pendente"
          : aba === "agenda"
            ? ["aprovada", "em_uso"].includes(r.status)
            : !["pendente", "aprovada", "em_uso"].includes(r.status)),
    );
    reservas = aba === "pendentes" ? ordenarSolicitacoes(reservas) : reservas;
    total = reservas.length;
  } else {
    const db = await createClient();
    let query = db
      .from("reservas")
      .select(
        "*, laboratorios(nome,tipo,localizacao), profiles!reservas_solicitante_id_fkey(nome,email)",
        { count: "exact" },
      );
    if (f.lab) query = query.eq("laboratorio_id", f.lab);
    if (aba === "pendentes")
      query = query
        .eq("status", "pendente")
        .order("prioridade_efetiva", { ascending: false })
        .order("created_at");
    else if (aba === "agenda")
      query = query
        .in("status", ["aprovada", "em_uso"])
        .lt(
          "inicio",
          fromZonedTime(
            `${somarDias(hoje, 1)}T00:00:00`,
            "America/Sao_Paulo",
          ).toISOString(),
        )
        .gt(
          "fim",
          fromZonedTime(`${hoje}T00:00:00`, "America/Sao_Paulo").toISOString(),
        )
        .order("inicio");
    else
      query = query
        .not("status", "in", "(pendente,aprovada,em_uso)")
        .order("inicio", { ascending: false });
    const { data, error, count } = await query.range(
      (pagina - 1) * 20,
      pagina * 20 - 1,
    );
    if (error) throw new Error("Falha ao carregar painel do monitor");
    reservas = data as Reserva[];
    total = count ?? 0;
    if (aba === "pendentes" && reservas.length) {
      const inicio = reservas.map((r) => r.inicio).sort()[0],
        fim = reservas
          .map((r) => r.fim)
          .sort()
          .at(-1)!;
      const { data, error } = await db
        .from("reservas")
        .select(
          "*, laboratorios(nome,tipo,localizacao), profiles!reservas_solicitante_id_fkey(nome,email)",
        )
        .in("laboratorio_id", [
          ...new Set(reservas.map((r) => r.laboratorio_id)),
        ])
        .in("status", ["pendente", "aprovada", "em_uso"])
        .lt("inicio", fim)
        .gt("fim", inicio)
        .order("prioridade_efetiva", { ascending: false })
        .order("created_at")
        .limit(100);
      if (error) throw new Error("Falha ao comparar solicitações");
      coincidentes = data as Reserva[];
    }
  }
  return (
    <>
      <PageHeading
        titulo="Cuidar dos espaços. Apoiar as descobertas."
        descricao="Analise solicitações, acompanhe a agenda e registre o uso dos laboratórios."
        acao={
          <>
            <Link href="/ocorrencias" className="button button-outline">
              <ClipboardList size={14} />
              Ocorrências
            </Link>
            <Link href="/bloqueios" className="button button-outline">
              <ShieldAlert size={14} />
              Bloquear horário
            </Link>
          </>
        }
      />
      <div className="monitor-tabs">
        <div>
          {(
            [
              ["pendentes", "Aguardando análise"],
              ["agenda", "Agenda de hoje"],
              ["historico", "Histórico"],
            ] as const
          ).map(([a, t]) => (
            <Link
              key={a}
              className={aba === a ? "selected" : ""}
              href={`/monitor?aba=${a}${f.lab ? `&lab=${f.lab}` : ""}`}
            >
              {t}
            </Link>
          ))}
        </div>
        <form className="page-actions" action="/monitor">
          <input type="hidden" name="aba" value={aba} />
          <select
            className="input"
            name="lab"
            defaultValue={f.lab ?? ""}
            aria-label="Filtrar laboratório"
          >
            <option value="">Todos os laboratórios</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
          <button className="button button-outline button-sm" type="submit">
            Filtrar
          </button>
        </form>
      </div>
      {ctx.demonstracao && (
        <p className="notice" style={{ marginBottom: 20 }}>
          Demonstração de leitura. As decisões ficam disponíveis apenas para
          monitores vinculados e administradores autenticados.
        </p>
      )}
      <MonitorPainel
        {...{ reservas, coincidentes }}
        demonstracao={ctx.demonstracao}
        usuarioId={ctx.usuario?.id}
      />
      <Pagination
        {...{ pagina, total }}
        base={`/monitor?aba=${aba}${f.lab ? `&lab=${f.lab}` : ""}`}
      />
    </>
  );
}

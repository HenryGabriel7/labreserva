import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getCurrentUser } from "@/lib/auth";
import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { labsDemo, equipamentosDemo, reservasDemo, janelasDemo } from "./demo";
import { laboratorioEdicaoSnapshotSchema } from "./schemas";
import { somarDias } from "./reservas";
import type {
  Laboratorio,
  Equipamento,
  Reserva,
  JanelaHorario,
  LaboratorioEdicao,
  Notificacao,
} from "./types";

export const getContexto = cache(async () => {
  if (!hasSupabaseConfiguration())
    return { demonstracao: true as boolean, usuario: null };
  const usuario = await getCurrentUser();
  if (!usuario) redirect("/login");
  return { demonstracao: false as boolean, usuario };
});
export const getLaboratorioAtivo = cache(
  async (id: string): Promise<Laboratorio | null> => {
    if ((await getContexto()).demonstracao)
      return labsDemo.find((lab) => lab.id === id && lab.ativo) ?? null;
    const db = await createClient();
    const { data, error } = await db
      .from("laboratorios")
      .select("*")
      .eq("id", id)
      .eq("ativo", true)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar o laboratório.");
    return data as Laboratorio | null;
  },
);
export const getLaboratorios = cache(
  async (
    filtro: "todos" | "ativos" = "todos",
    idSelecionado?: string,
  ): Promise<Laboratorio[]> => {
    if ((await getContexto()).demonstracao)
      return filtro === "ativos"
        ? labsDemo.filter((lab) => lab.ativo)
        : labsDemo;
    const db = await createClient();
    let consulta = db.from("laboratorios").select("*");
    if (filtro === "ativos") consulta = consulta.eq("ativo", true);
    const { data, error } = await consulta.order("nome").limit(100);
    if (error) throw new Error("Não foi possível carregar os laboratórios.");
    const laboratorios = data as Laboratorio[];
    if (
      filtro === "ativos" &&
      idSelecionado &&
      !laboratorios.some((lab) => lab.id === idSelecionado)
    ) {
      const selecionado = await getLaboratorioAtivo(idSelecionado);
      if (selecionado) return [...laboratorios, selecionado];
    }
    return laboratorios;
  },
);
type FiltrosCatalogo = {
  q?: string;
  tipo?: Laboratorio["tipo"] | "";
  capacidade?: number;
  equipamento?: string;
  pagina?: number;
};
type LaboratorioCatalogo = Laboratorio & {
  equipamentos: Pick<Equipamento, "id" | "nome">[];
};

function padraoBuscaLiteral(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getCatalogoLaboratorios({
  q,
  tipo,
  capacidade,
  equipamento,
  pagina = 1,
}: FiltrosCatalogo): Promise<{
  laboratorios: LaboratorioCatalogo[];
  total: number;
}> {
  const inicio = (pagina - 1) * 20;
  if ((await getContexto()).demonstracao) {
    const filtrados = labsDemo.filter(
      (lab) =>
        lab.ativo &&
        (!q ||
          [lab.nome, lab.descricao].some((valor) =>
            valor.toLowerCase().includes(q.toLowerCase()),
          )) &&
        (!tipo || lab.tipo === tipo) &&
        (!capacidade || lab.capacidade >= capacidade) &&
        (!equipamento ||
          equipamentosDemo.some(
            (item) =>
              item.laboratorio_id === lab.id &&
              item.nome.toLowerCase().includes(equipamento.toLowerCase()),
          )),
    );
    return {
      laboratorios: filtrados.slice(inicio, inicio + 20).map((lab) => ({
        ...lab,
        equipamentos: equipamentosDemo
          .filter((item) => item.laboratorio_id === lab.id)
          .slice(0, 3),
      })),
      total: filtrados.length,
    };
  }
  const db = await createClient();
  let consulta = db
    .from("laboratorios")
    .select(
      equipamento
        ? "*,equipamentos(id,nome),equipamento_buscado:equipamentos!inner()"
        : "*,equipamentos(id,nome)",
      { count: "exact" },
    )
    .eq("ativo", true);
  if (q) {
    // O valor passa pelo parser de filtros do PostgREST antes da regex do Postgres.
    const busca = JSON.stringify(padraoBuscaLiteral(q));
    consulta = consulta.or(
      "nome.imatch." + busca + ",descricao.imatch." + busca,
    );
  }
  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (capacidade) consulta = consulta.gte("capacidade", capacidade);
  if (equipamento)
    consulta = consulta.filter(
      "equipamento_buscado.nome",
      "imatch",
      padraoBuscaLiteral(equipamento),
    );
  const { data, error, count } = await consulta
    .order("nome")
    .order("id")
    .order("nome", { referencedTable: "equipamentos" })
    .order("id", { referencedTable: "equipamentos" })
    .limit(3, { referencedTable: "equipamentos" })
    .range(inicio, inicio + 19)
    .overrideTypes<LaboratorioCatalogo[], { merge: false }>();
  if (error?.code === "PGRST103" && pagina > 1)
    return { laboratorios: [], total: 0 };
  if (error) throw new Error("Não foi possível consultar o catálogo.");
  return { laboratorios: data, total: count ?? 0 };
}

export const getEquipamentos = cache(
  async (laboratorioId?: string): Promise<Equipamento[]> => {
    if ((await getContexto()).demonstracao)
      return laboratorioId
        ? equipamentosDemo.filter(
            (item) => item.laboratorio_id === laboratorioId,
          )
        : equipamentosDemo;
    const db = await createClient();
    let consulta = db.from("equipamentos").select("*");
    if (laboratorioId) consulta = consulta.eq("laboratorio_id", laboratorioId);
    const { data, error } = await consulta.order("nome").order("id").limit(500);
    if (error) throw new Error("Não foi possível carregar os equipamentos.");
    return data as Equipamento[];
  },
);
export const getJanelas = cache(
  async (laboratorioId?: string): Promise<JanelaHorario[]> => {
    if ((await getContexto()).demonstracao)
      return laboratorioId
        ? janelasDemo.filter(
            (janela) => janela.laboratorio_id === laboratorioId,
          )
        : janelasDemo;
    const db = await createClient();
    let consulta = db.from("janelas_horario").select("*");
    if (laboratorioId) consulta = consulta.eq("laboratorio_id", laboratorioId);
    const { data, error } = await consulta
      .order("dia_semana")
      .order("inicio")
      .order("id")
      .limit(700);
    if (error) throw new Error("Não foi possível carregar o funcionamento.");
    return data as JanelaHorario[];
  },
);

type LeituraLaboratorioEdicao =
  { dados: LaboratorioEdicao } | { status: 403 | 404 | 503; mensagem: string };

export async function getLaboratorioEdicao(
  id: string,
): Promise<LeituraLaboratorioEdicao> {
  const db = await createClient();
  const { data, error } = await db.rpc("obter_laboratorio_edicao", {
    p_id: id,
  });
  if (error?.message === "REGISTRO_NAO_ENCONTRADO")
    return { status: 404, mensagem: "Laboratório não encontrado." };
  if (error?.code === "42501")
    return { status: 403, mensagem: "Acesso não autorizado." };
  const resultado = laboratorioEdicaoSnapshotSchema.safeParse(data);
  if (error || !resultado.success || resultado.data.laboratorio.id !== id)
    return {
      status: 503,
      mensagem: "Não foi possível carregar os dados completos do laboratório.",
    };
  return { dados: resultado.data };
}

export async function getReservas({
  minhas = false,
  pagina = 1,
  status,
  dia,
}: {
  minhas?: boolean;
  pagina?: number;
  status?: string;
  dia?: string;
} = {}): Promise<{
  reservas: Reserva[];
  total: number;
}> {
  const { demonstracao, usuario } = await getContexto();
  const fuso = "America/Sao_Paulo";
  const periodo = dia
    ? {
        inicio: fromZonedTime(`${dia}T00:00:00`, fuso).toISOString(),
        fim: fromZonedTime(`${somarDias(dia, 1)}T00:00:00`, fuso).toISOString(),
      }
    : null;
  const statusAgenda = ["aprovada", "em_uso"];
  if (demonstracao) {
    const reservas = reservasDemo().filter(
      (r) =>
        (!status || r.status === status) &&
        (!periodo ||
          (statusAgenda.includes(r.status) &&
            Date.parse(r.inicio) < Date.parse(periodo.fim) &&
            Date.parse(r.fim) > Date.parse(periodo.inicio))),
    );
    return { reservas, total: reservas.length };
  }
  const db = await createClient();
  let query = db
    .from("reservas")
    .select(
      "*, laboratorios(nome,tipo,localizacao), profiles!reservas_solicitante_id_fkey(nome,email)",
      { count: "exact" },
    )
    .order("inicio", { ascending: !!periodo })
    .order("id");
  if (minhas && usuario) query = query.eq("solicitante_id", usuario.id);
  if (status) query = query.eq("status", status);
  if (periodo)
    query = query
      .lt("inicio", periodo.fim)
      .gt("fim", periodo.inicio)
      .in("status", statusAgenda);
  const { data, error, count } = await query.range(
    (pagina - 1) * 20,
    pagina * 20 - 1,
  );
  if (error) throw new Error("Não foi possível carregar as reservas.");
  return { reservas: data as Reserva[], total: count ?? 0 };
}

export function getAgendaPainel(minhas: boolean, agora: Date) {
  const dia = formatInTimeZone(agora, "America/Sao_Paulo", "yyyy-MM-dd");
  return getReservas({ minhas, dia });
}
export async function getNotificacoes(): Promise<Notificacao[]> {
  if ((await getContexto()).demonstracao) {
    const agora = Date.now();
    return [
      {
        tipo_evento: "reserva_aprovada",
        payload: {
          titulo: "Sua reserva foi aprovada",
          mensagem:
            "O Laboratório de Redes está reservado para sua próxima atividade.",
        },
      },
      { tipo_evento: "reserva_criada", payload: {} },
      { tipo_evento: "reserva_cancelada", payload: {} },
      { tipo_evento: "reserva_recusada", payload: {} },
      { tipo_evento: "reserva_substituida", payload: {} },
      { tipo_evento: "lembrete_reserva", payload: {} },
    ].map<Notificacao>((notificacao, indice) => {
      const data = new Date(agora - indice * 3_600_000).toISOString();
      return {
        ...notificacao,
        id: `demo-${indice}`,
        usuario_id: "",
        template: notificacao.tipo_evento,
        status: "enviada",
        created_at: data,
        lida_em: indice < 2 ? null : data,
      };
    });
  }
  const db = await createClient();
  const { data, error } = await db
    .from("notificacoes")
    .select(
      "id,usuario_id,tipo_evento,template,payload,status,created_at,lida_em",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Não foi possível carregar suas notificações.");
  return data as Notificacao[];
}

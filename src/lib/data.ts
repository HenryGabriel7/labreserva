import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { labsDemo, equipamentosDemo, reservasDemo, janelasDemo } from "./demo";
import type {
  Laboratorio,
  Equipamento,
  Reserva,
  JanelaHorario,
  Notificacao,
} from "./types";

export const getContexto = cache(async () => {
  if (!hasSupabaseConfiguration())
    return { demonstracao: true as boolean, usuario: null };
  const usuario = await getCurrentUser();
  if (!usuario) redirect("/login");
  return { demonstracao: false as boolean, usuario };
});
export const getLaboratorios = cache(
  async (filtro: "todos" | "ativos" = "todos"): Promise<Laboratorio[]> => {
    if ((await getContexto()).demonstracao)
      return filtro === "ativos"
        ? labsDemo.filter((lab) => lab.ativo)
        : labsDemo;
    const db = await createClient();
    let consulta = db.from("laboratorios").select("*");
    if (filtro === "ativos") consulta = consulta.eq("ativo", true);
    const { data, error } = await consulta.order("nome").limit(100);
    if (error) throw new Error("Não foi possível carregar os laboratórios.");
    return data as Laboratorio[];
  },
);
export const getEquipamentos = cache(async (): Promise<Equipamento[]> => {
  if ((await getContexto()).demonstracao) return equipamentosDemo;
  const db = await createClient();
  const { data, error } = await db
    .from("equipamentos")
    .select("*")
    .order("nome")
    .limit(500);
  if (error) throw new Error("Não foi possível carregar os equipamentos.");
  return data as Equipamento[];
});
export const getJanelas = cache(async (): Promise<JanelaHorario[]> => {
  if ((await getContexto()).demonstracao) return janelasDemo;
  const db = await createClient();
  const { data, error } = await db
    .from("janelas_horario")
    .select("*")
    .order("dia_semana")
    .limit(700);
  if (error) throw new Error("Não foi possível carregar o funcionamento.");
  return data as JanelaHorario[];
});
export async function getReservas({
  minhas = false,
  pagina = 1,
  status,
}: { minhas?: boolean; pagina?: number; status?: string } = {}): Promise<{
  reservas: Reserva[];
  total: number;
}> {
  const { demonstracao, usuario } = await getContexto();
  if (demonstracao) {
    const reservas = reservasDemo().filter(
      (r) => !status || r.status === status,
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
    .order("inicio", { ascending: false });
  if (minhas && usuario) query = query.eq("solicitante_id", usuario.id);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query.range(
    (pagina - 1) * 20,
    pagina * 20 - 1,
  );
  if (error) throw new Error("Não foi possível carregar as reservas.");
  return { reservas: data as Reserva[], total: count ?? 0 };
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

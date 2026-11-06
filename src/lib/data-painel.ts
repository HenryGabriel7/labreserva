import "server-only";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getContexto } from "./data";
import { somarDias } from "./reservas";
import { createClient } from "./supabase/server";
export interface ResumoPainel {
  labsAtivos: number;
  reservasHoje: number;
  confirmadasHoje: number;
  pendentes: number;
  ocupacaoPercentual: number;
  noShows: number;
  ocorrencias: number;
}
export async function getResumoPainel({
  pessoal = false,
}: { pessoal?: boolean } = {}): Promise<ResumoPainel | null> {
  const { demonstracao, usuario } = await getContexto();
  if (demonstracao) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("obter_resumo_painel");
  if (error) throw new Error("Não foi possível carregar os indicadores.");
  const resumo = data as ResumoPainel;
  if (!pessoal || !usuario?.roles.includes("admin")) return resumo;

  const fuso = "America/Sao_Paulo";
  const hoje = formatInTimeZone(new Date(), fuso, "yyyy-MM-dd");
  const inicio = fromZonedTime(`${hoje}T00:00:00`, fuso).toISOString();
  const fim = fromZonedTime(
    `${somarDias(hoje, 1)}T00:00:00`,
    fuso,
  ).toISOString();
  const proprias = () =>
    db
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .eq("solicitante_id", usuario.id);
  const noDia = () => proprias().lt("inicio", fim).gt("fim", inicio);
  const [reservasHoje, confirmadasHoje, pendentes] = await Promise.all([
    noDia(),
    noDia().in("status", ["aprovada", "em_uso", "concluida"]),
    proprias().eq("status", "pendente"),
  ]);
  if ([reservasHoje, confirmadasHoje, pendentes].some((r) => r.error))
    throw new Error("Não foi possível carregar seus indicadores de reserva.");
  return {
    ...resumo,
    reservasHoje: reservasHoje.count ?? 0,
    confirmadasHoje: confirmadasHoje.count ?? 0,
    pendentes: pendentes.count ?? 0,
    noShows: 0,
    ocorrencias: 0,
  };
}

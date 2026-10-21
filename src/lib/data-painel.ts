import "server-only";
import { getContexto } from "./data";
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
export async function getResumoPainel(): Promise<ResumoPainel | null> {
  if ((await getContexto()).demonstracao) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("obter_resumo_painel");
  if (error) throw new Error("Não foi possível carregar os indicadores.");
  return data as ResumoPainel;
}

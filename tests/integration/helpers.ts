import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const senhaDev = "DevOnly!123456";
export const motivoSemSupabase =
  "Supabase local não configurado: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY são necessários; não executado.";

export function configuracaoLocal() {
  const url = process.env.SUPABASE_URL;
  if (
    url &&
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
  )
    throw new Error(
      "Testes com service_role são restritos ao Supabase de loopback. Banco remoto recusado.",
    );
  const chavePublica = process.env.SUPABASE_PUBLISHABLE_KEY;
  const chaveServico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chavePublica || !chaveServico) {
    if (process.env.REQUIRE_SUPABASE_TESTS === "true")
      throw new Error(motivoSemSupabase);
    return null;
  }
  return { url, chavePublica, chaveServico };
}

export const ambienteLocal = configuracaoLocal();

export function clientePublico(accessToken?: string) {
  if (!ambienteLocal) throw new Error(motivoSemSupabase);
  return createClient(ambienteLocal.url, ambienteLocal.chavePublica, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

export function clienteServico() {
  if (!ambienteLocal) throw new Error(motivoSemSupabase);
  return createClient(ambienteLocal.url, ambienteLocal.chaveServico, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function exigirSucesso<
  T extends { data: unknown; error: { message: string } | null },
>(resultado: T, operacao: string): Extract<T, { error: null }>["data"] {
  if (resultado.error)
    throw new Error(`${operacao}: ${resultado.error.message}`);
  return resultado.data as Extract<T, { error: null }>["data"];
}

export async function criarPessoa(
  papel: "aluno" | "professor" | "funcionario" | "monitor" | "admin",
  servico = clienteServico(),
) {
  const email = `qa-${papel}-${randomUUID()}@teste.edu.br`;
  const auth = exigirSucesso(
    await servico.auth.admin.createUser({
      email,
      password: senhaDev,
      email_confirm: true,
    }),
    "Criar identidade QA",
  );
  if (!auth.user) throw new Error("Auth não criou a identidade QA.");
  const id = auth.user.id;
  exigirSucesso(
    await servico
      .from("profiles")
      .insert({ id, nome: `QA ${papel}`, email, ativo: true }),
    "Criar perfil QA",
  );
  exigirSucesso(
    await servico.from("user_roles").insert({ user_id: id, papel }),
    "Criar papel QA",
  );
  const cliente = clientePublico();
  const login = exigirSucesso(
    await cliente.auth.signInWithPassword({ email, password: senhaDev }),
    "Entrar como pessoa QA",
  );
  if (!login.session) throw new Error("Auth não criou sessão QA.");
  return { id, email, cliente, accessToken: login.session.access_token };
}

export async function criarLaboratorio(
  servico = clienteServico(),
  monitorId?: string,
) {
  const id = randomUUID();
  const nome = `Laboratório QA ${id.slice(0, 8)}`;
  exigirSucesso(
    await servico.from("laboratorios").insert({
      id,
      nome,
      tipo: "informatica",
      capacidade: 20,
      localizacao: "Ambiente de testes local",
      descricao: "Fixture exclusiva de testes automatizados",
      regras_de_uso: "Uso apenas para QA local.",
      ativo: true,
      modo_reserva: "slot_fixo",
      granularidade_minutos: 15,
      duracao_minima_minutos: 60,
      duracao_maxima_minutos: 240,
    }),
    "Criar laboratório QA",
  );
  exigirSucesso(
    await servico.from("janelas_horario").insert(
      Array.from({ length: 7 }, (_, dia_semana) => ({
        laboratorio_id: id,
        dia_semana,
        inicio: "08:00",
        fim: "22:00",
        duracao_slot_minutos: 60,
      })),
    ),
    "Criar janelas QA",
  );
  if (monitorId)
    exigirSucesso(
      await servico
        .from("monitor_laboratorios")
        .insert({ monitor_id: monitorId, laboratorio_id: id }),
      "Vincular monitor QA",
    );
  return { id, nome };
}

export function horarioFuturo(dias = 2) {
  const referencia = new Date(Date.now() + dias * 86400000);
  const data = formatInTimeZone(referencia, "America/Sao_Paulo", "yyyy-MM-dd");
  return {
    data,
    inicio: fromZonedTime(
      `${data}T14:00:00`,
      "America/Sao_Paulo",
    ).toISOString(),
    fim: fromZonedTime(`${data}T15:00:00`, "America/Sao_Paulo").toISOString(),
  };
}

export async function solicitar(
  cliente: SupabaseClient,
  laboratorioId: string,
  finalidade: string,
  horario = horarioFuturo(),
) {
  const resposta = exigirSucesso(
    await cliente.rpc("solicitar_reserva", {
      p_laboratorio_id: laboratorioId,
      p_inicio: horario.inicio,
      p_fim: horario.fim,
      p_escopo: "laboratorio",
      p_finalidade: finalidade,
      p_n_participantes: 3,
      p_equipamentos: [],
      p_justificativa_prioridade: null,
      p_recorrencia: null,
    }),
    "Solicitar reserva QA",
  ) as { reserva_ids: string[] };
  if (!resposta.reserva_ids?.[0])
    throw new Error("RPC não retornou a reserva QA.");
  return resposta.reserva_ids[0];
}

/** Fixture restrita a loopback: antecipa somente a reserva QA já aprovada, sem mudar status. */
export async function colocarReservaNoHorario(
  id: string,
  servico = clienteServico(),
) {
  configuracaoLocal();
  exigirSucesso(
    await servico
      .from("reservas")
      .update({
        inicio: new Date(Date.now() - 60000).toISOString(),
        fim: new Date(Date.now() + 3540000).toISOString(),
      })
      .eq("id", id)
      .eq("status", "aprovada")
      .select("id")
      .single(),
    "Ajustar relógio da fixture QA para check-in",
  );
}

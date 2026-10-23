import { fromZonedTime } from "date-fns-tz";
import type { Papel, Laboratorio, JanelaHorario } from "./types";
import { codigoErro } from "./errors";
export function prioridadeSolicitante(papeis: Papel[]): 1 | 2 {
  return papeis.some((p) => p === "professor" || p === "funcionario") ? 2 : 1;
}
export function ordenarSolicitacoes<
  T extends { prioridade_efetiva: number; created_at: string; id: string },
>(reservas: T[]): T[] {
  return [...reservas].sort(
    (a, b) =>
      b.prioridade_efetiva - a.prioridade_efetiva ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}
export function minutos(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}
export function horariosSlots(
  inicio: string,
  fim: string,
  duracao: number,
): string[] {
  if (!Number.isInteger(duracao) || duracao <= 0)
    throw new Error("Duração inválida");
  const resultado: string[] = [];
  for (let m = minutos(inicio); m <= minutos(fim); m += duracao)
    resultado.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  return resultado;
}
export function intervaloValido({
  inicio,
  fim,
  abertura,
  fechamento,
  modo,
  granularidade,
  slot,
  minima,
  maxima,
}: {
  inicio: string;
  fim: string;
  abertura: string;
  fechamento: string;
  modo: "slot_fixo" | "intervalo_livre";
  granularidade: number;
  slot: number;
  minima: number;
  maxima: number;
}) {
  const i = minutos(inicio),
    f = minutos(fim),
    a = minutos(abertura),
    z = minutos(fechamento),
    d = f - i,
    g = modo === "slot_fixo" ? slot : granularidade;
  return (
    g > 0 &&
    i >= a &&
    f <= z &&
    d >= minima &&
    d <= maxima &&
    d > 0 &&
    (i - a) % g === 0 &&
    d % g === 0
  );
}

export type CampoErroReserva =
  | "laboratorioId"
  | "data"
  | "horaInicio"
  | "horaFim"
  | "nParticipantes"
  | "equipamentos"
  | "dataFim"
  | "finalidade"
  | "justificativaPrioridade";
export interface ErroHorarioReserva {
  campo: CampoErroReserva;
  mensagem: string;
}
export interface PoliticaAntecedencia {
  antecedenciaMinHoras: number;
  antecedenciaMaxDias: number;
}

export function janelasDoDia(
  janelas: JanelaHorario[],
  laboratorioId: string,
  data: string,
) {
  const dia = new Date(`${data}T12:00:00Z`).getUTCDay();
  return janelas
    .filter((j) => j.laboratorio_id === laboratorioId && j.dia_semana === dia)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Espelha as regras de horário do RPC; o banco continua sendo a autoridade. */
export function validarHorarioReserva({
  laboratorio,
  janelas,
  data,
  horaInicio,
  horaFim,
  politica,
  agora = new Date(),
}: {
  laboratorio: Laboratorio | undefined;
  janelas: JanelaHorario[];
  data: string;
  horaInicio: string;
  horaFim: string;
  politica?: PoliticaAntecedencia;
  agora?: Date;
}): ErroHorarioReserva[] {
  if (!laboratorio?.ativo)
    return [
      {
        campo: "laboratorioId",
        mensagem: "Selecione um laboratório disponível.",
      },
    ];
  const funcionamento = janelasDoDia(janelas, laboratorio.id, data);
  if (!funcionamento.length)
    return [
      {
        campo: "data",
        mensagem:
          "Este laboratório não tem funcionamento cadastrado para este dia. Escolha outra data ou procure a administração.",
      },
    ];
  const inicio = fromZonedTime(`${data}T${horaInicio}:00`, "America/Sao_Paulo");
  if (inicio <= agora)
    return [
      { campo: "horaInicio", mensagem: "Escolha um horário de início futuro." },
    ];
  if (politica) {
    if (
      inicio.getTime() <
      agora.getTime() + politica.antecedenciaMinHoras * 3600000
    )
      return [
        {
          campo: "horaInicio",
          mensagem: `Solicite com pelo menos ${politica.antecedenciaMinHoras} hora(s) de antecedência. Escolha um início mais tarde.`,
        },
      ];
    if (
      inicio.getTime() >
      agora.getTime() + politica.antecedenciaMaxDias * 86400000
    )
      return [
        {
          campo: "data",
          mensagem: `A reserva deve começar nos próximos ${politica.antecedenciaMaxDias} dias. Escolha uma data mais próxima.`,
        },
      ];
  }
  const duracao = minutos(horaFim) - minutos(horaInicio);
  if (duracao <= 0)
    return [
      {
        campo: "horaFim",
        mensagem: "O término precisa ser depois do início, no mesmo dia.",
      },
    ];
  if (
    duracao < laboratorio.duracao_minima_minutos ||
    duracao > laboratorio.duracao_maxima_minutos
  )
    return [
      {
        campo: "horaFim",
        mensagem: `A duração deve ser de ${laboratorio.duracao_minima_minutos} a ${laboratorio.duracao_maxima_minutos} minutos. O período selecionado tem ${duracao} minutos; ajuste o horário de término.`,
      },
    ];
  const contem = funcionamento.filter(
    (j) =>
      minutos(horaInicio) >= minutos(j.inicio) &&
      minutos(horaFim) <= minutos(j.fim),
  );
  if (!contem.length) {
    const intervalos = funcionamento
      .map((j) => `${j.inicio.slice(0, 5)} às ${j.fim.slice(0, 5)}`)
      .join(" ou ");
    return [
      {
        campo: "horaInicio",
        mensagem: `Selecione início e término dentro do mesmo período de funcionamento: ${intervalos}.`,
      },
    ];
  }
  if (
    !contem.some((j) =>
      intervaloValido({
        inicio: horaInicio,
        fim: horaFim,
        abertura: j.inicio,
        fechamento: j.fim,
        modo: laboratorio.modo_reserva,
        granularidade: laboratorio.granularidade_minutos,
        slot: j.duracao_slot_minutos,
        minima: laboratorio.duracao_minima_minutos,
        maxima: laboratorio.duracao_maxima_minutos,
      }),
    )
  ) {
    const janela = contem[0];
    const passo =
      laboratorio.modo_reserva === "slot_fixo"
        ? janela.duracao_slot_minutos
        : laboratorio.granularidade_minutos;
    const exemplos = horariosSlots(janela.inicio, janela.fim, passo)
      .slice(0, 3)
      .join(", ");
    const campo =
      (minutos(horaInicio) - minutos(janela.inicio)) % passo !== 0
        ? "horaInicio"
        : "horaFim";
    return [
      {
        campo,
        mensagem: `Use horários em passos de ${passo} minutos a partir de ${janela.inicio.slice(0, 5)} (por exemplo, ${exemplos}). Ajuste ${campo === "horaInicio" ? "o início" : "o término"} para respeitar ${laboratorio.modo_reserva === "slot_fixo" ? "os slots deste laboratório" : "os intervalos deste laboratório"}.`,
      },
    ];
  }
  return [];
}

/** Somente códigos conhecidos viram campos; mensagens internas nunca vão ao cliente. */
export function campoErroReserva(erro: unknown): CampoErroReserva | undefined {
  const campos: Record<string, CampoErroReserva> = {
    DURACAO_INVALIDA: "horaFim",
    "23P01": "horaInicio",
    CONFLITO_SALA: "horaInicio",
    INTERVALO_INVALIDO: "horaInicio",
    FORA_JANELA: "horaInicio",
    FORA_DA_JANELA: "horaInicio",
    ANTECEDENCIA_INVALIDA: "data",
    HORARIO_BLOQUEADO: "horaInicio",
    BLOQUEIO_HORARIO: "horaInicio",
    LABORATORIO_INATIVO: "laboratorioId",
    CAPACIDADE_INVALIDA: "nParticipantes",
    EQUIPAMENTO_INDISPONIVEL: "equipamentos",
    EQUIPAMENTO_DUPLICADO: "equipamentos",
    EQUIPAMENTOS_OBRIGATORIOS: "equipamentos",
    ESTOQUE_INSUFICIENTE: "equipamentos",
    RECORRENCIA_INVALIDA: "dataFim",
    RECORRENCIA_SEM_DATAS: "dataFim",
  };
  return campos[codigoErro(erro) ?? ""];
}
export function somarDias(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diasCalendario(
  data: string,
  visao: "dia" | "semana" | "mes",
): string[] {
  if (visao === "dia") return [data];
  const base = visao === "mes" ? data.slice(0, 8) + "01" : data;
  const dow = new Date(`${base}T12:00:00Z`).getUTCDay();
  const inicio = somarDias(base, -((dow + 6) % 7));
  return Array.from({ length: visao === "mes" ? 42 : 7 }, (_, i) =>
    somarDias(inicio, i),
  );
}

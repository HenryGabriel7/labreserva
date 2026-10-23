import type { Notificacao } from "@/lib/types";

export interface ResumoNotificacao {
  id: string;
  titulo: string;
  mensagem: string;
  criadaEm: string;
  lidaEm: string | null;
  reservaId: string | null;
}

const titulos: Record<string, string> = {
  reserva_aprovada: "Sua reserva foi aprovada",
  reserva_recusada: "Atualização da sua solicitação",
  reserva_substituida: "Sua reserva foi substituída",
  reserva_cancelada: "Uma reserva foi cancelada",
  reserva_criada: "Nova solicitação de reserva",
  prioridade_substituicao: "Solicitação com prioridade para análise",
  pendencia_monitor: "Solicitação pendente de análise",
  reserva_no_show: "Não comparecimento registrado",
  solicitacao_criada: "Uma nova solicitação precisa de atenção",
  lembrete_reserva: "Sua atividade está chegando",
};
const mensagens: Record<string, string> = {
  reserva_criada: "Uma nova solicitação aguarda análise.",
  prioridade_substituicao:
    "Uma solicitação com prioridade coincide com uma reserva aprovada e precisa de análise.",
  pendencia_monitor:
    "Uma solicitação continua pendente. Confira os detalhes para decidir.",
  reserva_no_show: "Foi registrado não comparecimento à reserva.",
  reserva_aprovada: "Seu horário foi confirmado.",
  reserva_recusada:
    "Sua solicitação foi recusada. Confira os detalhes da decisão.",
  reserva_substituida:
    "Sua reserva foi substituída por uma solicitação com prioridade. Confira os detalhes.",
  reserva_cancelada:
    "A reserva foi cancelada. Confira os detalhes para mais informações.",
  lembrete_reserva: "Prepare-se para sua atividade reservada.",
};
const eventosPrivados = [
  "convite",
  "recuperacao",
  "recuperacao_senha",
  "seguranca_conta",
];

function contextoReserva(payload: Record<string, unknown>) {
  const partes: string[] = [];
  if (
    typeof payload.laboratorio_nome === "string" &&
    payload.laboratorio_nome.trim()
  )
    partes.push(payload.laboratorio_nome.trim().slice(0, 160));
  if (typeof payload.inicio === "string") {
    const inicio = new Date(payload.inicio);
    if (Number.isFinite(inicio.getTime())) {
      partes.push(
        new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "America/Sao_Paulo",
        }).format(inicio),
      );
    }
  }
  return partes.length ? ` ${partes.join(" · ")}.` : "";
}

/** Only presentation fields cross the shell's server/client boundary. */
export function resumirNotificacoes(
  notificacoes: Notificacao[],
): ResumoNotificacao[] {
  return notificacoes
    .filter(
      (item) =>
        !eventosPrivados.includes(item.tipo_evento) &&
        !eventosPrivados.includes(item.template),
    )
    .map((item) => ({
      id: item.id,
      titulo:
        typeof item.payload.titulo === "string"
          ? item.payload.titulo.slice(0, 160)
          : (titulos[item.tipo_evento] ?? "Uma atualização para você"),
      mensagem:
        typeof item.payload.mensagem === "string"
          ? item.payload.mensagem.slice(0, 500)
          : `${mensagens[item.tipo_evento] ?? "Acompanhe os detalhes da sua atividade no portal."}${contextoReserva(item.payload)}`.slice(
              0,
              500,
            ),
      criadaEm: item.created_at,
      lidaEm: item.lida_em,
      reservaId:
        typeof item.payload.reserva_id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          item.payload.reserva_id,
        )
          ? item.payload.reserva_id
          : null,
    }));
}

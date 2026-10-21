"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { z } from "@/lib/validacao";
import {
  Bell,
  CheckCheck,
  Check,
  ArrowUpRight,
  LoaderCircle,
} from "lucide-react";
import { EmptyState, dataBr } from "@/components/shared";
import type { Notificacao } from "@/lib/types";
import { marcarNotificacoesLidas } from "./actions";

const titulos: Record<string, string> = {
  reserva_aprovada: "Sua reserva foi aprovada",
  reserva_recusada: "Atualização da sua solicitação",
  reserva_substituida: "Sua reserva foi substituída",
  reserva_cancelada: "Uma reserva foi cancelada",
  solicitacao_criada: "Uma nova solicitação precisa de atenção",
  lembrete_reserva: "Sua atividade está chegando",
  convite: "Boas-vindas à instituição",
  recuperacao_senha: "Segurança da sua conta",
};

export function NotificacoesClient({
  notificacoes,
  demonstracao,
}: {
  notificacoes: Notificacao[];
  demonstracao: boolean;
}) {
  const [pendente, transicao] = useTransition();
  const [erro, setErro] = useState("");
  const naoLidas = notificacoes.filter((item) => !item.lida_em).length;
  const marcar = (ids: string[] | null) =>
    transicao(async () => {
      const resultado = await marcarNotificacoesLidas({ ids });
      setErro(resultado.error ?? "");
    });
  return (
    <section className="panel">
      <div className="section-heading notification-top">
        <h2>
          Suas atualizações{" "}
          {naoLidas > 0 && (
            <span className="badge badge-green" style={{ marginLeft: 7 }}>
              {naoLidas} nova{naoLidas !== 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <button
          className="button button-outline button-sm"
          disabled={demonstracao || pendente || !naoLidas}
          onClick={() => marcar(null)}
        >
          {pendente ? (
            <LoaderCircle size={14} className="people-spin" />
          ) : (
            <CheckCheck size={14} />
          )}
          Marcar todas como lidas
        </button>
      </div>
      {erro && (
        <p className="notification-feedback" role="alert">
          {erro}
        </p>
      )}
      {!notificacoes.length ? (
        <EmptyState
          titulo="Tudo em dia por aqui"
          descricao="Aprovações, lembretes e outras atualizações aparecerão neste espaço."
        />
      ) : (
        notificacoes.map((item) => {
          const titulo =
            typeof item.payload.titulo === "string"
              ? item.payload.titulo
              : (titulos[item.tipo_evento] ?? "Uma atualização para você");
          const mensagem =
            typeof item.payload.mensagem === "string"
              ? item.payload.mensagem
              : "Acompanhe os detalhes da sua atividade no portal.";
          const reservaId = z.uuid().safeParse(item.payload.reserva_id);
          return (
            <article
              className={`notification-row${item.lida_em ? "" : " notification-unread"}`}
              key={item.id}
            >
              <div className="notification-icon-box" aria-hidden="true">
                <Bell size={18} />
              </div>
              <div className="notification-copy">
                <h3>
                  {!item.lida_em && (
                    <span
                      className="notification-unread-dot"
                      role="img"
                      aria-label="Não lida"
                    />
                  )}
                  {titulo}
                </h3>
                <p>{mensagem}</p>
                <div className="notification-meta">
                  <time dateTime={item.created_at}>
                    {dataBr(item.created_at, "dd/MM/yyyy 'às' HH:mm")}
                  </time>
                  {reservaId.success && (
                    <Link
                      className="section-link"
                      href={`/reservas/${reservaId.data}`}
                      style={{ fontSize: 10 }}
                    >
                      Ver reserva <ArrowUpRight size={12} />
                    </Link>
                  )}
                  {!item.lida_em && (
                    <button
                      className="button button-ghost button-sm"
                      disabled={demonstracao || pendente}
                      onClick={() => marcar([item.id])}
                      aria-label={`Marcar como lida: ${titulo}`}
                      style={{
                        fontSize: 10,
                        minHeight: 30,
                        padding: "3px 5px",
                      }}
                    >
                      <Check size={12} />
                      Marcar como lida
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  Check,
  X,
  ArrowRightLeft,
  LogIn,
  LogOut,
  UserRoundX,
} from "lucide-react";
import type { Reserva } from "@/lib/types";
import { decidirReservaAction } from "@/lib/actions-monitor";
import "./gestao/monitor.css";

export function ReservaDecisao({
  reservaId,
  status,
  demonstracao,
  propria,
  substituiveis = [],
  ocorrenciaHref,
}: {
  reservaId: string;
  status: Reserva["status"];
  demonstracao: boolean;
  propria: boolean;
  substituiveis?: Reserva[];
  ocorrenciaHref?: string;
}) {
  const id = useId();
  const [motivo, setMotivo] = useState("");
  const [antiga, setAntiga] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(false);
  const motivoInput = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const erroNoMotivo =
    erro && mensagem.toLocaleLowerCase("pt-BR").includes("motivo");
  useEffect(() => {
    if (!erro || !mensagem) return;
    if (erroNoMotivo) motivoInput.current?.focus();
    else feedback.current?.focus();
  }, [erro, mensagem, erroNoMotivo]);
  const [pending, startTransition] = useTransition();
  function decidir(
    acao:
      "aprovar" | "recusar" | "checkin" | "checkout" | "no_show" | "substituir",
  ) {
    setMensagem("");
    setErro(false);
    if (
      ["aprovar", "recusar", "no_show", "substituir"].includes(acao) &&
      motivo.trim().length < 3
    ) {
      setErro(true);
      setMensagem("Informe o motivo desta decisão.");
      motivoInput.current?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const resultado = await decidirReservaAction({
          acao,
          reservaId,
          motivo,
          ...(acao === "substituir" ? { reservaAntigaId: antiga } : {}),
        });
        setErro(!resultado.ok);
        setMensagem(resultado.mensagem);
      } catch {
        setErro(true);
        setMensagem(
          "Não foi possível concluir a ação. Atualize e tente novamente.",
        );
      }
    });
  }
  return (
    <>
      <div className="monitor-decision" aria-busy={pending}>
        {propria && (
          <p className="notice" style={{ marginBottom: 15 }}>
            Esta solicitação é sua e precisa ser decidida por outra pessoa.
          </p>
        )}
        <label>
          {status === "pendente" ? "Motivo da decisão" : "Observações / motivo"}
          <input
            ref={motivoInput}
            className="input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              status === "pendente"
                ? "Pelo menos 3 caracteres"
                : "Registre o contexto da ação"
            }
            maxLength={2000}
            disabled={demonstracao || propria || pending}
            aria-required={status === "pendente"}
            aria-invalid={erroNoMotivo}
            aria-describedby={erroNoMotivo ? `${id}-feedback` : undefined}
          />
        </label>
        <div className="monitor-buttons">
          {status === "pendente" && (
            <>
              <button
                className="button button-primary button-sm"
                disabled={demonstracao || propria || pending}
                onClick={() => decidir("aprovar")}
              >
                <Check size={14} />
                Aprovar
              </button>
              <button
                className="button button-outline button-sm"
                disabled={demonstracao || propria || pending}
                onClick={() => decidir("recusar")}
              >
                <X size={14} />
                Recusar
              </button>
            </>
          )}
          {status === "aprovada" && (
            <>
              <button
                className="button button-primary button-sm"
                disabled={demonstracao || propria || pending}
                onClick={() => decidir("checkin")}
              >
                <LogIn size={14} />
                Fazer check-in
              </button>
              <button
                className="button button-outline button-sm"
                disabled={demonstracao || propria || pending}
                onClick={() => decidir("no_show")}
              >
                <UserRoundX size={14} />
                Registrar ausência
              </button>
            </>
          )}
          {status === "em_uso" && (
            <button
              className="button button-primary button-sm"
              disabled={demonstracao || propria || pending}
              onClick={() => decidir("checkout")}
            >
              <LogOut size={14} />
              Fazer check-out
            </button>
          )}
          {status === "em_uso" && ocorrenciaHref && (
            <Link
              className="button button-outline button-sm"
              href={ocorrenciaHref}
            >
              Registrar ocorrência
            </Link>
          )}
        </div>
        {substituiveis.length > 0 && (
          <div className="substitution-row">
            <label>
              Reserva aprovada a substituir
              <select
                className="input"
                value={antiga}
                onChange={(e) => setAntiga(e.target.value)}
                disabled={demonstracao || propria || pending}
              >
                <option value="">
                  Selecione após comparar as solicitações
                </option>
                {substituiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.profiles?.nome ?? "Aluno"} · {c.finalidade}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-outline button-sm"
              disabled={!antiga || demonstracao || propria || pending}
              onClick={() => decidir("substituir")}
            >
              <ArrowRightLeft size={14} />
              Substituir com motivo
            </button>
          </div>
        )}
        {mensagem && (
          <p
            ref={feedback}
            id={`${id}-feedback`}
            tabIndex={-1}
            role={erro ? "alert" : "status"}
            className={erro ? "monitor-error" : "notice"}
            style={{ marginTop: 15 }}
          >
            {mensagem}
          </p>
        )}
      </div>
    </>
  );
}

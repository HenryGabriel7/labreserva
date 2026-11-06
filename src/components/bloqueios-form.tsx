"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ShieldAlert, Search, LockKeyhole, Trash2 } from "lucide-react";
import {
  criarBloqueioAction,
  listarAfetadasAction,
  removerCadastroAction,
} from "@/lib/actions-cadastros";
import type { Laboratorio } from "@/lib/types";

type Afetada = {
  id: string;
  inicio: string;
  fim: string;
  finalidade?: string;
  status?: string;
};
export type BloqueioEdicao = {
  id: string;
  laboratorio_id: string | null;
  inicio: string;
  fim: string;
  motivo: string;
  descricao: string;
};

export function BloqueiosForm({
  laboratorios,
  demonstracao,
  admin,
  bloqueio,
  base,
}: {
  laboratorios: Laboratorio[];
  demonstracao: boolean;
  admin: boolean;
  bloqueio?: BloqueioEdicao;
  base: "/bloqueios" | "/admin/bloqueios";
}) {
  const router = useRouter();
  const [afetadas, setAfetadas] = useState<Afetada[]>([]);
  const [consultado, setConsultado] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [pending, startTransition] = useTransition();
  function intervalo(form: HTMLFormElement) {
    const f = new FormData(form);
    return {
      laboratorio_id: String(f.get("laboratorio_id")) || null,
      inicio: fromZonedTime(
        String(f.get("inicio")),
        "America/Sao_Paulo",
      ).toISOString(),
      fim: fromZonedTime(
        String(f.get("fim")),
        "America/Sao_Paulo",
      ).toISOString(),
    };
  }
  const horarioLocal = (valor: string) =>
    formatInTimeZone(
      new Date(valor),
      "America/Sao_Paulo",
      "yyyy-MM-dd'T'HH:mm",
    );
  return (
    <form
      className="panel detail-card form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        let i;
        try {
          i = intervalo(form);
        } catch {
          setMensagem("Informe datas e horários válidos.");
          return;
        }
        if (JSON.stringify(i) !== consultado) {
          setMensagem(
            "Consulte primeiro as reservas afetadas para este intervalo.",
          );
          return;
        }
        const f = new FormData(form);
        const dados = {
          ...i,
          ...(bloqueio ? { id: bloqueio.id } : {}),
          motivo: String(f.get("motivo")),
          descricao: String(f.get("descricao")),
          cancelar_reservas: f.get("cancelar_reservas") === "on",
          motivo_cancelamento:
            String(f.get("motivo_cancelamento") ?? "") || null,
        };
        startTransition(async () => {
          try {
            const r = await criarBloqueioAction(dados);
            setMensagem(r.mensagem);
            if (r.ok) {
              setConsultado("");
              setAfetadas([]);
              if (bloqueio) router.replace(base);
              else form.reset();
              router.refresh();
            }
          } catch {
            setMensagem("Não foi possível salvar o bloqueio.");
          }
        });
      }}
    >
      <h2 style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
        <LockKeyhole size={18} />
        {bloqueio ? "Editar bloqueio" : "Novo bloqueio"}
      </h2>
      <p className="page-subtitle">
        Horários de Brasília. Reservas em uso precisam ser concluídas antes de
        bloquear o espaço. Na edição, o laboratório permanece o mesmo.
      </p>
      <fieldset
        disabled={demonstracao || pending}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        {bloqueio && (
          <input
            type="hidden"
            name="laboratorio_id"
            value={bloqueio.laboratorio_id ?? ""}
          />
        )}
        <div className="form-grid">
          <label>
            Laboratório
            <select
              className="input"
              name={bloqueio ? undefined : "laboratorio_id"}
              defaultValue={bloqueio?.laboratorio_id ?? ""}
              disabled={Boolean(bloqueio)}
            >
              {admin && (
                <option value="">Todos os laboratórios (global)</option>
              )}
              {laboratorios.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motivo
            <select
              className="input"
              name="motivo"
              defaultValue={bloqueio?.motivo ?? "manutencao"}
            >
              <option value="manutencao">Manutenção</option>
              <option value="feriado">Feriado</option>
              <option value="evento">Evento</option>
            </select>
          </label>
          <label>
            Início
            <input
              required
              className="input"
              name="inicio"
              type="datetime-local"
              defaultValue={bloqueio ? horarioLocal(bloqueio.inicio) : ""}
            />
          </label>
          <label>
            Fim
            <input
              required
              className="input"
              name="fim"
              type="datetime-local"
              defaultValue={bloqueio ? horarioLocal(bloqueio.fim) : ""}
            />
          </label>
          <label className="full">
            Descrição
            <textarea
              required
              className="input"
              name="descricao"
              minLength={3}
              maxLength={2000}
              defaultValue={bloqueio?.descricao ?? ""}
            />
          </label>
        </div>
        <button
          type="button"
          className="button button-outline"
          style={{ marginTop: 20 }}
          onClick={(e) => {
            const form = e.currentTarget.form!;
            let i;
            try {
              i = intervalo(form);
            } catch {
              setMensagem("Informe primeiro as datas.");
              return;
            }
            startTransition(async () => {
              try {
                const r = await listarAfetadasAction(i);
                setMensagem(r.mensagem);
                if (r.ok) {
                  setAfetadas(r.reservas as Afetada[]);
                  setConsultado(JSON.stringify(i));
                }
              } catch {
                setMensagem("Não foi possível consultar as reservas.");
              }
            });
          }}
        >
          <Search size={14} />
          Consultar reservas afetadas
        </button>
        {consultado && (
          <div className="notice" style={{ marginTop: 18 }}>
            <strong>{afetadas.length} reserva(s) afetada(s)</strong>
            {afetadas.map((r) => (
              <p key={r.id}>
                {r.finalidade ?? "Reserva"} ·{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(r.inicio))}
              </p>
            ))}
          </div>
        )}
        {afetadas.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <label className="checkbox-label">
              <input type="checkbox" name="cancelar_reservas" required />
              Confirmo o cancelamento das reservas listadas e a notificação dos
              envolvidos.
            </label>
            <label style={{ marginTop: 15 }}>
              Motivo do cancelamento
              <textarea
                className="input"
                name="motivo_cancelamento"
                required
                minLength={5}
              />
            </label>
          </div>
        )}
        <div
          className="page-actions"
          style={{ marginTop: 22, flexWrap: "wrap" }}
        >
          <button
            type="submit"
            disabled={!consultado}
            className="button button-primary"
          >
            <ShieldAlert size={15} />
            {pending
              ? "Processando..."
              : bloqueio
                ? "Salvar alterações"
                : "Confirmar bloqueio"}
          </button>
          {bloqueio && (
            <Link href={base} className="button button-outline">
              Cancelar edição
            </Link>
          )}
        </div>
      </fieldset>
      {demonstracao && (
        <p className="notice">
          Alterações de bloqueios estão desabilitadas na demonstração.
        </p>
      )}
      {mensagem && (
        <p role="status" className="notice">
          {mensagem}
        </p>
      )}
    </form>
  );
}

export function RemoverBloqueio({
  id,
  demonstracao,
}: {
  id: string;
  demonstracao: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState("");
  return (
    <div>
      <button
        type="button"
        className="button button-ghost button-sm"
        disabled={demonstracao || pending}
        aria-label="Remover bloqueio"
        onClick={() => {
          if (
            !window.confirm(
              "Remover este bloqueio? A remoção será registrada na auditoria e não reativa reservas canceladas.",
            )
          )
            return;
          startTransition(async () => {
            try {
              const r = await removerCadastroAction({
                entidade: "bloqueios",
                id,
              });
              setMensagem(r.mensagem);
            } catch {
              setMensagem("Não foi possível remover o bloqueio.");
            }
          });
        }}
      >
        <Trash2 size={14} />
      </button>
      {mensagem && (
        <p role="status" className="field-error">
          {mensagem}
        </p>
      )}
    </div>
  );
}

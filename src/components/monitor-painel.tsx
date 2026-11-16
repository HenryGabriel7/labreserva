"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { Reserva } from "@/lib/types";
import { ReservaDecisao } from "./reserva-decisao";
import { aprovarSerieAction } from "@/lib/actions-reservas";
import { LabIcon, StatusBadge, dataBr, EmptyState } from "./shared";

type RotasMonitor = {
  reservasBase: "/reservas" | "/admin/reservas";
  ocorrenciasBase: "/ocorrencias" | "/admin/ocorrencias";
};

export function MonitorPainel({
  reservas,
  coincidentes,
  demonstracao,
  usuarioId,
  reservasBase,
  ocorrenciasBase,
}: {
  reservas: Reserva[];
  coincidentes: Reserva[];
  demonstracao: boolean;
  usuarioId?: string;
} & RotasMonitor) {
  const grupos = new Map<string, Reserva[]>();
  for (const r of reservas) {
    const key = r.recorrencia_id ?? r.id;
    grupos.set(key, [...(grupos.get(key) ?? []), r]);
  }
  return reservas.length ? (
    <div className="monitor-list">
      {[...grupos.entries()].map(([key, grupo]) => (
        <section key={key}>
          {grupo[0].recorrencia_id && (
            <SerieAcoes
              recorrenciaId={grupo[0].recorrencia_id}
              quantidade={grupo.length}
              demonstracao={
                demonstracao || grupo[0].solicitante_id === usuarioId
              }
              pendente={grupo.some((r) => r.status === "pendente")}
            />
          )}
          <div className="monitor-list">
            {grupo.map((r) => (
              <MonitorCard
                key={r.id}
                reserva={r}
                coincidentes={coincidentes.filter(
                  (c) =>
                    c.id !== r.id &&
                    c.laboratorio_id === r.laboratorio_id &&
                    c.inicio < r.fim &&
                    c.fim > r.inicio,
                )}
                demonstracao={demonstracao}
                propria={r.solicitante_id === usuarioId}
                {...{ reservasBase, ocorrenciasBase }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  ) : (
    <div className="panel">
      <EmptyState
        titulo="Tudo em dia por aqui"
        descricao="Não há reservas para os filtros selecionados."
      />
    </div>
  );
}
function SerieAcoes({
  recorrenciaId,
  quantidade,
  demonstracao,
  pendente,
}: {
  recorrenciaId: string;
  quantidade: number;
  demonstracao: boolean;
  pendente: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div
      className="panel"
      style={{ padding: 20, marginBottom: 12, borderColor: "#c8dfd3" }}
    >
      <h2 style={{ fontSize: 14, margin: "0 0 8px", fontWeight: 600 }}>
        Série recorrente · {quantidade} data(s) nesta página
      </h2>
      <p className="page-subtitle" style={{ fontSize: 10 }}>
        A aprovação da série mantém as datas conflitantes pendentes para análise
        individual.
      </p>
      {pendente && (
        <div
          className="page-actions"
          style={{ marginTop: 15, flexWrap: "wrap" }}
        >
          <label style={{ flex: 1 }}>
            Motivo da aprovação
            <input
              className="input"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={2000}
              disabled={demonstracao || pending}
            />
          </label>
          <button
            className="button button-primary button-sm"
            disabled={demonstracao || pending || motivo.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                try {
                  const r = await aprovarSerieAction({ recorrenciaId, motivo });
                  setErro(!r.ok);
                  setMensagem(r.mensagem);
                } catch {
                  setErro(true);
                  setMensagem("Não foi possível aprovar a série.");
                }
              })
            }
          >
            Aprovar datas sem conflito
          </button>
        </div>
      )}
      {mensagem && (
        <p
          role={erro ? "alert" : "status"}
          className={erro ? "monitor-error" : "notice"}
          style={{ marginTop: 15 }}
        >
          {mensagem}
        </p>
      )}
    </div>
  );
}
function MonitorCard({
  reserva: r,
  coincidentes,
  demonstracao,
  propria,
  reservasBase,
  ocorrenciasBase,
}: {
  reserva: Reserva;
  coincidentes: Reserva[];
  demonstracao: boolean;
  propria: boolean;
} & RotasMonitor) {
  const substituiveis = coincidentes.filter(
    (c) =>
      c.status === "aprovada" &&
      c.prioridade_efetiva === 1 &&
      r.prioridade_efetiva === 2,
  );
  return (
    <article className="panel monitor-card">
      <div className="monitor-card-top">
        <div className="monitor-card-lab">
          <LabIcon tipo={r.laboratorios?.tipo ?? "informatica"} />
          <div>
            <strong>{r.laboratorios?.nome}</strong>
            <small>
              {dataBr(r.inicio)} · {dataBr(r.inicio, "HH:mm")} –{" "}
              {dataBr(r.fim, "HH:mm")}
            </small>
          </div>
        </div>
        <div className="page-actions">
          {r.prioridade_efetiva === 2 && (
            <span className="badge badge-blue">Prioridade institucional</span>
          )}
          <StatusBadge status={r.status} />
        </div>
      </div>
      <Link className="monitor-purpose" href={`${reservasBase}/${r.id}`}>
        <h2>{r.finalidade}</h2>
        <ChevronRight size={15} />
      </Link>
      <div className="monitor-requester">
        <span>{r.profiles?.nome ?? "Solicitante"}</span>
        <span>· {r.n_participantes} participantes</span>
        <span>· Recebida em {dataBr(r.created_at, "dd/MM 'às' HH:mm")}</span>
      </div>
      {r.justificativa_prioridade && (
        <p className="monitor-justification">
          <strong>Justificativa</strong>
          {r.justificativa_prioridade}
        </p>
      )}
      {r.status === "pendente" && coincidentes.length > 0 && (
        <div className="conflict-section">
          <h3>
            <AlertTriangle size={14} />
            Horários coincidentes · compare antes de decidir
          </h3>
          <div className="conflict-grid">
            {coincidentes.slice(0, 4).map((c) => (
              <div key={c.id} className="conflict-option">
                <div>
                  <strong>{c.profiles?.nome ?? "Solicitante"}</strong>
                  <StatusBadge status={c.status} />
                </div>
                <p>{c.finalidade}</p>
                <small>
                  Prioridade {c.prioridade_efetiva} ·{" "}
                  {dataBr(c.created_at, "dd/MM HH:mm")}
                </small>
                {c.justificativa_prioridade && (
                  <p className="conflict-reason">
                    {c.justificativa_prioridade}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p>
            A sugestão considera prioridade e, em seguida, ordem de chegada. Uma
            escolha diferente exige justificativa.
          </p>
        </div>
      )}
      {["pendente", "aprovada", "em_uso"].includes(r.status) && (
        <ReservaDecisao
          reservaId={r.id}
          status={r.status}
          demonstracao={demonstracao}
          propria={propria}
          substituiveis={substituiveis}
          ocorrenciaHref={`${ocorrenciasBase}?reserva=${r.id}`}
        />
      )}
      {["concluida", "no_show"].includes(r.status) && (
        <Link
          className="button button-outline button-sm"
          href={`${ocorrenciasBase}?reserva=${r.id}`}
        >
          Registrar ocorrência
        </Link>
      )}
    </article>
  );
}

import Link from "next/link";
import {
  CalendarDays,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Clock3,
  FlaskConical,
  UsersRound,
  ChevronRight,
  Check,
  CircleHelp,
  ClipboardCheck,
} from "lucide-react";
import { getContexto, getLaboratorios, getReservas } from "@/lib/data";
import {
  PageHeading,
  LabIcon,
  StatusBadge,
  dataBr,
  EmptyState,
} from "@/components/shared";
import { nomeTipo } from "@/lib/types";
import { getResumoPainel } from "@/lib/data-painel";
import "./dashboard.css";

export default async function Dashboard() {
  const [{ usuario, demonstracao }, labs, { reservas }, resumo] =
    await Promise.all([
      getContexto(),
      getLaboratorios(),
      getReservas(),
      getResumoPainel(),
    ]);
  const gestor =
    demonstracao ||
    usuario?.roles.some((r) => ["admin", "monitor"].includes(r));
  const hoje = dataBr(new Date().toISOString(), "yyyy-MM-dd");
  const reservasHoje = reservas.filter(
    (r) => dataBr(r.inicio, "yyyy-MM-dd") === hoje,
  );
  const pendentes =
    resumo?.pendentes ?? reservas.filter((r) => r.status === "pendente").length;
  const aprovadas = reservas.filter((r) =>
    ["aprovada", "em_uso", "concluida"].includes(r.status),
  );
  const ocupacao =
    resumo?.ocupacaoPercentual ??
    (labs.length
      ? Math.round(
          (new Set(
            reservasHoje
              .filter((r) => r.status === "em_uso")
              .map((r) => r.laboratorio_id),
          ).size /
            labs.length) *
            100,
        )
      : 0);
  const proximas = reservasHoje
    .filter((r) => ["aprovada", "em_uso"].includes(r.status))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 3);
  const metrics = [
    {
      label: "Laboratórios ativos",
      value: resumo?.labsAtivos ?? labs.filter((l) => l.ativo).length,
      icon: FlaskConical,
      note: "Espaços prontos para aprender",
      cor: "green",
    },
    {
      label: "Reservas hoje",
      value: resumo?.reservasHoje ?? reservasHoje.length,
      icon: CalendarDays,
      note: `${resumo?.confirmadasHoje ?? aprovadas.filter((r) => dataBr(r.inicio, "yyyy-MM-dd") === hoje).length} confirmadas para hoje`,
      cor: "blue",
    },
    {
      label: "Aguardando aprovação",
      value: pendentes,
      icon: Clock3,
      note: "Solicitações para analisar",
      cor: "amber",
    },
    {
      label: "Ocupação neste momento",
      value: `${ocupacao}%`,
      icon: UsersRound,
      note: "Dos laboratórios disponíveis",
      cor: "purple",
    },
  ];
  const dataExtensa = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return (
    <>
      <PageHeading
        titulo={
          usuario
            ? `Olá, ${usuario.nome.split(" ")[0]}. Bom ter você por aqui!`
            : "Visão geral"
        }
        descricao="Acompanhe os espaços, organize as reservas e faça o conhecimento acontecer."
        acao={
          <>
            <Link href="/calendario" className="button button-outline">
              <CalendarDays size={15} />
              Ver calendário
            </Link>
            <Link href="/reservas/nova" className="button button-primary">
              <Plus size={16} />
              Nova reserva
            </Link>
          </>
        }
      />
      <div className="dashboard-dateline">
        <span className="dateline-dot" /> Seu campus, conectado <span>·</span>
        <span className="capitalize">{dataExtensa}</span>
      </div>
      <div className="metrics-grid">
        {metrics.map((m) => (
          <div className="panel metric" key={m.label}>
            <div className="metric-heading">
              <span>{m.label}</span>
              <span className={`metric-icon metric-${m.cor}`}>
                <m.icon size={17} strokeWidth={1.7} />
              </span>
            </div>
            <div className="metric-value">{m.value}</div>
            <div className="metric-note">
              {m.label === "Aguardando aprovação" && pendentes > 0 ? (
                <span className="metric-attention" />
              ) : (
                <span className="metric-note-line" />
              )}
              {m.note}
            </div>
          </div>
        ))}
      </div>
      {gestor && (
        <div className="dashboard-health">
          <span>Acompanhamento dos espaços</span>
          <div>
            <Link href="/monitor?aba=historico">
              <Clock3 size={13} />
              {resumo?.noShows ?? 0} ausências registradas
              <ArrowUpRight size={11} />
            </Link>
            <Link href="/ocorrencias">
              <ClipboardCheck size={13} />
              {resumo?.ocorrencias ?? 0} ocorrências
              <ArrowUpRight size={11} />
            </Link>
          </div>
        </div>
      )}
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="panel labs-overview">
            <div className="section-heading">
              <div>
                <h2>Nossos laboratórios</h2>
                <p>Encontre o espaço certo para a sua próxima ideia.</p>
              </div>
              <Link href="/laboratorios" className="section-link">
                Ver todos <ArrowRight size={14} />
              </Link>
            </div>
            <div className="lab-overview-grid">
              {labs.slice(0, 4).map((lab) => {
                const emUso = reservasHoje.some(
                  (r) => r.laboratorio_id === lab.id && r.status === "em_uso",
                );
                return (
                  <Link
                    key={lab.id}
                    href={`/laboratorios/${lab.id}`}
                    className="lab-overview-card"
                  >
                    <div className="lab-card-top">
                      <LabIcon tipo={lab.tipo} />
                      <span
                        className={`availability ${!lab.ativo ? "unavailable" : emUso ? "busy" : "free"}`}
                      >
                        <span />
                        {!lab.ativo
                          ? "Indisponível"
                          : emUso
                            ? "Em uso"
                            : "Consultar agenda"}
                      </span>
                    </div>
                    <h3>{nomeTipo[lab.tipo]}</h3>
                    <p>{lab.localizacao}</p>
                    <div className="lab-card-bottom">
                      <span>
                        <UsersRound size={12} />
                        {lab.capacidade} pessoas
                      </span>
                      <ChevronRight size={14} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
          <section className="panel recent-reservations">
            <div className="section-heading">
              <div>
                <h2>{gestor ? "Reservas recentes" : "Minhas reservas"}</h2>
                <p>As últimas movimentações dos seus espaços.</p>
              </div>
              <Link href="/reservas" className="section-link">
                Ver todas <ArrowRight size={14} />
              </Link>
            </div>
            {reservas.length ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Tabela com rolagem horizontal"
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Laboratório / Atividade</th>
                      <th>Data e horário</th>
                      <th>Solicitante</th>
                      <th>Status</th>
                      <th aria-label="Detalhes" />
                    </tr>
                  </thead>
                  <tbody>
                    {reservas.slice(0, 5).map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link
                            className="reservation-lab"
                            href={`/reservas/${r.id}`}
                          >
                            <LabIcon
                              tipo={r.laboratorios?.tipo ?? "informatica"}
                              size={15}
                            />
                            <span>
                              <strong>
                                {r.laboratorios?.nome.replace(
                                  "Laboratório de ",
                                  "",
                                )}
                              </strong>
                              <small>{r.finalidade}</small>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span className="table-date">
                            {dataBr(r.inicio, "dd MMM")}
                          </span>
                          <small className="table-time">
                            {dataBr(r.inicio, "HH:mm")} –{" "}
                            {dataBr(r.fim, "HH:mm")}
                          </small>
                        </td>
                        <td>
                          <span className="requester">
                            <span className="requester-avatar">
                              {r.profiles?.nome
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("") ?? "EU"}
                            </span>
                            {r.profiles?.nome
                              .split(" ")
                              .slice(0, 2)
                              .join(" ") ?? "Você"}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td>
                          <Link
                            href={`/reservas/${r.id}`}
                            aria-label={`Ver reserva: ${r.finalidade}`}
                          >
                            <ChevronRight size={15} color="#a3b0b9" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState />
            )}
            <div className="table-footer">
              <span>
                Mostrando {Math.min(5, reservas.length)} de {reservas.length}{" "}
                reservas carregadas
              </span>
              <span>
                <span className="table-footer-dot" />
                Atualizado agora
              </span>
            </div>
          </section>
        </div>
        <aside className="dashboard-secondary">
          <section className="panel today-panel">
            <div className="section-heading">
              <div className="today-heading">
                <CalendarDays size={17} />
                <h2>Na agenda de hoje</h2>
              </div>
              <span className="today-date">
                {dataBr(new Date().toISOString(), "dd/MM")}
              </span>
            </div>
            <div className="today-agenda">
              {proximas.length ? (
                proximas.map((r, i) => (
                  <Link
                    className={`agenda-item ${i === 0 ? "agenda-item-current" : ""}`}
                    key={r.id}
                    href={`/reservas/${r.id}`}
                  >
                    <div className="agenda-time">
                      <strong>{dataBr(r.inicio, "HH:mm")}</strong>
                      <span>{dataBr(r.fim, "HH:mm")}</span>
                    </div>
                    <div className="agenda-content">
                      <span className="agenda-type">
                        {r.laboratorios?.nome.replace("Laboratório de ", "")}
                      </span>
                      <h3>{r.finalidade}</h3>
                      <p>
                        <UsersRound size={11} />
                        {r.n_participantes} participantes
                      </p>
                      {r.status === "em_uso" ? (
                        <span className="agenda-live">
                          <span />
                          Em andamento
                        </span>
                      ) : (
                        <span className="agenda-confirmed">
                          <Check size={11} />
                          Confirmada
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              ) : (
                <EmptyState
                  titulo="Agenda livre"
                  descricao="Suas próximas atividades aparecerão aqui."
                />
              )}
            </div>
            <Link href="/calendario" className="agenda-footer">
              Abrir agenda completa <ArrowUpRight size={13} />
            </Link>
          </section>
          {gestor && (
            <section className="pending-callout">
              <span className="pending-callout-icon">
                <ClipboardCheck size={21} />
              </span>
              <h2>Cada solicitação, uma possibilidade.</h2>
              <p>
                {pendentes > 0
                  ? `Você tem ${pendentes} solicitações aguardando análise. Uma resposta faz a diferença.`
                  : "Tudo em dia! As próximas solicitações aparecerão no painel do monitor."}
              </p>
              <Link href="/monitor">
                Analisar solicitações <ArrowRight size={14} />
              </Link>
            </section>
          )}
          <div className="tip-card">
            <CircleHelp size={18} />
            <div>
              <strong>Planejar faz parte da descoberta</strong>
              <p>
                Reserve com antecedência e confira as regras de uso de cada
                laboratório.
              </p>
              <Link href="/ajuda">
                Conhecer as orientações
                <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

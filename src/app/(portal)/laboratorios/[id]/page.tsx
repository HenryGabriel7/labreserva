import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "@/lib/validacao";
import {
  ArrowLeft,
  Plus,
  UsersRound,
  MapPin,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { getLaboratorios, getEquipamentos, getJanelas } from "@/lib/data";
import { LabIcon } from "@/components/shared";
import "../laboratorios.css";
const dias = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export default async function LaboratorioDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [labs, equips, janelas] = await Promise.all([
    getLaboratorios(),
    getEquipamentos(),
    getJanelas(),
  ]);
  const lab = labs.find((l) => l.id === id);
  if (!lab) notFound();
  return (
    <>
      <Link
        className="section-link"
        href="/laboratorios"
        style={{ marginBottom: 25 }}
      >
        <ArrowLeft size={14} />
        Todos os laboratórios
      </Link>
      <div className="page-heading">
        <div>
          <div style={{ marginBottom: 16 }}>
            <LabIcon tipo={lab.tipo} size={24} />
          </div>
          <h1 className="page-title">{lab.nome}</h1>
          <div className="detail-info">
            <span>
              <MapPin size={15} />
              {lab.localizacao}
            </span>
            <span>
              <UsersRound size={15} />
              {lab.capacidade} pessoas
            </span>
            <span>
              <Clock3 size={15} />
              {lab.modo_reserva === "slot_fixo"
                ? "Horários fixos"
                : "Intervalo livre"}
            </span>
          </div>
        </div>
        <Link
          className="button button-primary"
          href={`/reservas/nova?lab=${id}`}
        >
          <Plus size={16} />
          Reservar este laboratório
        </Link>
      </div>
      <div className="detail-columns">
        <div>
          <section className="panel detail-card">
            <h2>Um espaço para ir além</h2>
            <p>{lab.descricao}</p>
            <h2 style={{ marginTop: 28 }}>Equipamentos disponíveis</h2>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Tabela com rolagem horizontal"
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Equipamento</th>
                    <th>Quantidade</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {equips
                    .filter((e) => e.laboratorio_id === id)
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{e.nome}</td>
                        <td>{e.quantidade}</td>
                        <td>
                          <span
                            className={`badge badge-${e.status === "ativo" ? "green" : "amber"}`}
                          >
                            {e.status === "ativo"
                              ? "Disponível"
                              : e.status === "manutencao"
                                ? "Manutenção"
                                : "Inativo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel detail-card">
            <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <ShieldCheck size={18} color="#087f67" />
              Cuidar do espaço é parte da experiência
            </h2>
            <p>{lab.regras_de_uso}</p>
          </section>
        </div>
        <aside>
          <section className="panel detail-card">
            <h2>Horário de funcionamento</h2>
            {janelas
              .filter((j) => j.laboratorio_id === id)
              .map((j) => (
                <div
                  key={j.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 0",
                    borderBottom: "1px solid #edf1f3",
                    fontSize: 10,
                    color: "#526a76",
                  }}
                >
                  <span>{dias[j.dia_semana]}</span>
                  <span>
                    {j.inicio.slice(0, 5)} – {j.fim.slice(0, 5)}
                  </span>
                </div>
              ))}
            <p style={{ fontSize: 10, marginTop: 20 }}>
              Duração de {lab.duracao_minima_minutos} a{" "}
              {lab.duracao_maxima_minutos} minutos. Intervalos de{" "}
              {lab.granularidade_minutos} minutos.
            </p>
            <Link
              className="button button-outline"
              href={`/calendario?lab=${id}`}
              style={{ width: "100%", marginTop: 10 }}
            >
              Consultar a agenda
            </Link>
          </section>
          <p
            className="page-subtitle"
            style={{ fontSize: 10, padding: "0 8px" }}
          >
            A reserva precisa ser aprovada por um monitor. Você receberá uma
            notificação quando houver uma decisão.
          </p>
        </aside>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "@/lib/validacao";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  UsersRound,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { getContexto } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { reservasDemo } from "@/lib/demo";
import type { Reserva } from "@/lib/types";
import { StatusBadge, LabIcon, dataBr } from "@/components/shared";
import { CancelarReserva } from "@/components/reserva-acoes";
import "@/app/(portal)/reservas/reservas.css";

export async function ReservaDetalhe({
  params,
  administrativo = false,
}: {
  params: Promise<{ id: string }>;
  administrativo?: boolean;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getContexto();
  const admin = ctx.usuario?.roles.includes("admin");
  if (administrativo && !ctx.demonstracao && !admin) redirect("/acesso-negado");
  let reserva: Reserva | undefined;
  if (ctx.demonstracao) reserva = reservasDemo().find((r) => r.id === id);
  else {
    const db = await createClient();
    const { data, error } = await db
      .from("reservas")
      .select(
        "*, laboratorios(nome,tipo,localizacao), profiles!reservas_solicitante_id_fkey(nome,email)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Falha ao consultar reserva");
    reserva = data ?? undefined;
  }
  if (!reserva) notFound();
  const r = reserva;
  if (admin && !administrativo && r.solicitante_id !== ctx.usuario?.id)
    redirect(`/admin/reservas/${id}`);
  return (
    <>
      <Link
        className="section-link"
        href={administrativo ? "/admin/solicitacoes" : "/reservas"}
        style={{ marginBottom: 22 }}
      >
        <ArrowLeft size={14} />
        {administrativo ? "Solicitações" : "Minhas reservas"}
      </Link>
      <div className="page-heading">
        <div>
          <h1 className="page-title">Detalhes da reserva</h1>
          <p className="page-subtitle">
            Protocolo #{id.slice(-8).toUpperCase()}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <section className="panel reservation-detail">
        <div className="reservation-detail-title">
          <LabIcon tipo={r.laboratorios?.tipo ?? "informatica"} size={26} />
          <div>
            <h2>{r.laboratorios?.nome}</h2>
            <p>
              <MapPin size={13} />
              {r.laboratorios?.localizacao}
            </p>
          </div>
        </div>
        <div className="reservation-facts">
          <div>
            <CalendarDays size={17} />
            <span>
              Data<strong>{dataBr(r.inicio, "dd 'de' MMMM 'de' yyyy")}</strong>
            </span>
          </div>
          <div>
            <Clock3 size={17} />
            <span>
              Horário
              <strong>
                {dataBr(r.inicio, "HH:mm")} às {dataBr(r.fim, "HH:mm")}
              </strong>
            </span>
          </div>
          <div>
            <UsersRound size={17} />
            <span>
              Participantes<strong>{r.n_participantes} pessoas</strong>
            </span>
          </div>
        </div>
        <h3>Finalidade</h3>
        <p>{r.finalidade}</p>
        {r.justificativa_prioridade && (
          <>
            <h3>Justificativa de prioridade</h3>
            <p>{r.justificativa_prioridade}</p>
          </>
        )}
        {r.profiles?.nome && (
          <>
            <h3>Solicitante</h3>
            <p>{r.profiles.nome}</p>
          </>
        )}
        {r.motivo && (
          <>
            <h3>Motivo registrado</h3>
            <p>{r.motivo}</p>
          </>
        )}
        {r.status === "pendente" && (
          <div
            className="notice"
            style={{ marginBlock: 22, display: "flex", gap: 9 }}
          >
            <ShieldCheck size={17} />
            {administrativo ? "A solicitação" : "Sua solicitação"} está
            aguardando análise.
          </div>
        )}
        {["pendente", "aprovada"].includes(r.status) && (
          <div
            style={{
              paddingTop: 20,
              borderTop: "1px solid #edf1f3",
              marginTop: 25,
            }}
          >
            <CancelarReserva reservaId={r.id} demonstracao={ctx.demonstracao} />
          </div>
        )}
      </section>
    </>
  );
}

import Link from "next/link";
import {
  CalendarDays,
  ShieldCheck,
  Clock3,
  UsersRound,
  ArrowRight,
} from "lucide-react";
import { PageHeading } from "@/components/shared";
import { getContexto } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
export default async function Ajuda() {
  const ctx = await getContexto();
  const regras: Record<string, number> = {
    cancelamento_prazo_horas: 2,
    antecedencia_min_horas: 1,
    antecedencia_max_dias: 90,
    noshow_tolerancia_minutos: 15,
  };
  if (!ctx.demonstracao) {
    const db = await createClient();
    const { data, error } = await db
      .from("configuracoes")
      .select("chave,valor")
      .in("chave", Object.keys(regras));
    if (error) throw new Error("Falha ao consultar regras");
    for (const r of data) regras[r.chave] = Number(r.valor);
  }
  const itens = [
    {
      icon: CalendarDays,
      titulo: "Encontre seu espaço",
      texto:
        "Explore o catálogo e consulte o calendário. A disponibilidade mostra somente horários ocupados; informações pessoais ficam protegidas.",
    },
    {
      icon: Clock3,
      titulo: "Planeje com antecedência",
      texto: `Solicite entre ${regras.antecedencia_min_horas} hora(s) e ${regras.antecedencia_max_dias} dias antes da atividade. Cada laboratório define a duração e os horários de funcionamento.`,
    },
    {
      icon: UsersRound,
      titulo: "Aguarde a confirmação",
      texto:
        "Professores e funcionários têm prioridade institucional. Em caso de empate, a sugestão segue a ordem de chegada. O monitor responsável analisa e registra a decisão.",
    },
    {
      icon: ShieldCheck,
      titulo: "Cuide do espaço e da sua agenda",
      texto: `Cancele até ${regras.cancelamento_prazo_horas} hora(s) antes do início. Depois disso, procure um monitor. Sem check-in após ${regras.noshow_tolerancia_minutos} minutos de tolerância, a ausência poderá ser registrada.`,
    },
  ];
  return (
    <>
      <PageHeading
        titulo="Um guia para fazer acontecer"
        descricao="Informações claras para aproveitar melhor os laboratórios da instituição."
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))",
          gap: 20,
        }}
      >
        {itens.map((i, n) => (
          <section className="panel" key={i.titulo} style={{ padding: 25 }}>
            <i.icon size={23} color="#087f67" />
            <span
              className="eyebrow"
              style={{ display: "block", marginTop: 20 }}
            >
              PASSO {String(n + 1).padStart(2, "0")}
            </span>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: "12px 0" }}>
              {i.titulo}
            </h2>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.9,
                color: "#526c7b",
                margin: 0,
              }}
            >
              {i.texto}
            </p>
          </section>
        ))}
      </div>
      <div className="notice" style={{ marginTop: 25 }}>
        Respeite as regras de segurança de cada espaço. Para ajustes de reserva
        ou relatos de problemas, procure o monitor responsável.
      </div>
      <Link
        className="button button-primary"
        href="/laboratorios"
        style={{ marginTop: 25 }}
      >
        Encontrar um laboratório
        <ArrowRight size={15} />
      </Link>
    </>
  );
}

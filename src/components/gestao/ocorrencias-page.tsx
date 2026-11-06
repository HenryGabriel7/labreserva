import { z } from "@/lib/validacao";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { reservasDemo } from "@/lib/demo";
import {
  PageHeading,
  EmptyState,
  dataBr,
  Pagination,
} from "@/components/shared";
import { OcorrenciaForm, AnexosOcorrencia } from "@/components/ocorrencia-form";
import type { Reserva } from "@/lib/types";
import {
  getContextoGestao,
  type EspacoGestao,
  type PropsPaginaGestao,
} from "./contexto";
import "./ocorrencias.css";
const schema = z
  .object({
    reserva: z.uuid().optional(),
    pagina: z.coerce.number().int().min(1).max(10000).optional(),
  })
  .strict();
export async function OcorrenciasPage({
  searchParams,
  espaco,
}: PropsPaginaGestao & { espaco: EspacoGestao }) {
  const params = await searchParams;
  const ctx = await getContextoGestao(espaco, "/admin/ocorrencias", params);
  const admin = espaco === "admin";
  const parsed = schema.safeParse(params);
  const f = parsed.success ? parsed.data : {};
  const pagina = f.pagina ?? 1;
  let reservas: Reserva[] = reservasDemo(),
    total = 0;
  let ocorrencias: {
    id: string;
    tipo: string;
    descricao: string;
    gravidade: string;
    created_at: string;
    anexos: string[];
    laboratorios: { nome: string };
  }[] = [];
  if (!ctx.demonstracao) {
    const db = await createClient();
    const [rs, os] = await Promise.all([
      db
        .from("reservas")
        .select("*, laboratorios(nome,tipo,localizacao)")
        .in("status", ["em_uso", "concluida", "no_show"])
        .order("inicio", { ascending: false })
        .limit(100),
      db
        .from("ocorrencias")
        .select("*,laboratorios(nome)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((pagina - 1) * 20, pagina * 20 - 1),
    ]);
    if (rs.error || os.error) throw new Error("Falha ao carregar ocorrências");
    reservas = rs.data as Reserva[];
    ocorrencias = os.data;
    total = os.count ?? 0;
    if (f.reserva && !reservas.some((r) => r.id === f.reserva)) {
      const { data, error } = await db
        .from("reservas")
        .select("*,laboratorios(nome,tipo,localizacao)")
        .eq("id", f.reserva)
        .maybeSingle();
      if (error) throw new Error("Falha ao consultar reserva");
      if (data) reservas.unshift(data as Reserva);
    }
  }
  return (
    <>
      <Link
        href={admin ? "/admin/solicitacoes" : "/monitor"}
        className="section-link"
        style={{ marginBottom: 20 }}
      >
        <ArrowLeft size={14} />
        {admin ? "Solicitações" : "Painel do monitor"}
      </Link>
      <PageHeading
        titulo="Cuidar também é registrar"
        descricao="Documente ocorrências e ajude a manter os laboratórios prontos para todos."
      />
      <div className="occurrence-layout">
        <section className="panel">
          <div className="section-heading">
            <h2>Histórico de ocorrências</h2>
          </div>
          {ocorrencias.length ? (
            <div className="occurrence-list">
              {ocorrencias.map((o) => (
                <article key={o.id}>
                  <div className="page-actions">
                    <span
                      className={`badge badge-${o.gravidade === "grave" ? "red" : o.gravidade === "media" ? "amber" : "gray"}`}
                    >
                      {o.gravidade}
                    </span>
                    <span>{dataBr(o.created_at)}</span>
                  </div>
                  <h3>
                    {o.tipo === "falta_material"
                      ? "Falta de material"
                      : o.tipo === "uso_indevido"
                        ? "Uso indevido"
                        : "Dano"}{" "}
                    · {o.laboratorios.nome}
                  </h3>
                  <p>{o.descricao}</p>
                  <AnexosOcorrencia id={o.id} quantidade={o.anexos.length} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              titulo="Nenhuma ocorrência registrada"
              descricao="Os registros ajudam a preservar nossos espaços de aprendizagem."
            />
          )}
          <Pagination
            {...{ pagina, total }}
            base={admin ? "/admin/ocorrencias" : "/ocorrencias"}
          />
        </section>
        <OcorrenciaForm
          {...{ reservas }}
          reservaInicial={f.reserva}
          demonstracao={ctx.demonstracao}
        />
      </div>
    </>
  );
}

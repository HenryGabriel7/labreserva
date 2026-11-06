import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "@/lib/validacao";
import { Pencil } from "lucide-react";
import { getLaboratorios } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeading,
  EmptyState,
  dataBr,
  Pagination,
} from "@/components/shared";
import {
  BloqueiosForm,
  RemoverBloqueio,
  type BloqueioEdicao,
} from "@/components/bloqueios-form";
import {
  getContextoGestao,
  type EspacoGestao,
  type PropsPaginaGestao,
} from "./contexto";
import "@/app/(portal)/laboratorios/laboratorios.css";

const filtrosSchema = z
  .object({
    editar: z.uuid().optional(),
    pagina: z.coerce.number().int().min(1).max(10000).optional(),
  })
  .strict();

export async function BloqueiosPage({
  searchParams,
  espaco,
}: PropsPaginaGestao & { espaco: EspacoGestao }) {
  const params = await searchParams;
  const ctx = await getContextoGestao(espaco, "/admin/bloqueios", params);
  const base = espaco === "admin" ? "/admin/bloqueios" : "/bloqueios";
  const filtros = filtrosSchema.safeParse(params);
  if (!filtros.success) notFound();
  const pagina = filtros.data.pagina ?? 1;
  let labs = await getLaboratorios();
  const admin =
    ctx.demonstracao || Boolean(ctx.usuario?.roles.includes("admin"));
  let bloqueios: BloqueioEdicao[] = [];
  let selecionado: BloqueioEdicao | undefined;
  let total = 0;
  if (!ctx.demonstracao) {
    const db = await createClient();
    if (!admin) {
      const { data, error } = await db
        .from("monitor_laboratorios")
        .select("laboratorio_id")
        .eq("monitor_id", ctx.usuario!.id);
      if (error) throw new Error("Falha ao carregar vínculos");
      labs = labs.filter((l) => data.some((v) => v.laboratorio_id === l.id));
    }
    let query = db
      .from("bloqueios")
      .select("id,laboratorio_id,inicio,fim,motivo,descricao", {
        count: "exact",
      })
      .order("inicio", { ascending: false });
    if (!admin)
      query = labs.length
        ? query.or(
            `laboratorio_id.is.null,laboratorio_id.in.(${labs.map((l) => l.id).join(",")})`,
          )
        : query.is("laboratorio_id", null);
    const { data, error, count } = await query.range(
      (pagina - 1) * 20,
      pagina * 20 - 1,
    );
    if (error) throw new Error("Falha ao carregar bloqueios");
    bloqueios = data;
    total = count ?? 0;
    if (filtros.data.editar) {
      const { data: item, error: consulta } = await db
        .from("bloqueios")
        .select("id,laboratorio_id,inicio,fim,motivo,descricao")
        .eq("id", filtros.data.editar)
        .maybeSingle();
      if (consulta) throw new Error("Falha ao carregar bloqueio");
      if (!item || (!admin && !labs.some((l) => l.id === item.laboratorio_id)))
        notFound();
      selecionado = item;
    }
  }
  return (
    <>
      <PageHeading
        titulo="Espaço para cuidar dos espaços"
        descricao="Organize manutenções, feriados e eventos com transparência."
      />
      <div className="crud-layout">
        <section className="panel">
          <div className="section-heading">
            <h2>Bloqueios cadastrados</h2>
          </div>
          {bloqueios.length ? (
            <div className="crud-list">
              {bloqueios.map((b) => {
                const podeEditar =
                  admin || labs.some((l) => l.id === b.laboratorio_id);
                return (
                  <div className="crud-list-item" key={b.id}>
                    <div>
                      <strong>{b.descricao}</strong>
                      <small>
                        {b.laboratorio_id
                          ? (labs.find((l) => l.id === b.laboratorio_id)
                              ?.nome ?? "Laboratório")
                          : "Todos os laboratórios"}{" "}
                        · {dataBr(b.inicio)} · {b.motivo}
                      </small>
                      <small>
                        {dataBr(b.inicio, "HH:mm")} –{" "}
                        {dataBr(b.fim, "dd/MM HH:mm")}
                      </small>
                    </div>
                    <div>
                      {podeEditar && (
                        <Link
                          className="button button-ghost button-sm"
                          href={`${base}?editar=${b.id}&pagina=${pagina}`}
                          aria-label={`Editar bloqueio: ${b.descricao}`}
                        >
                          <Pencil size={14} />
                        </Link>
                      )}
                      {admin && (
                        <RemoverBloqueio
                          id={b.id}
                          demonstracao={ctx.demonstracao}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              titulo="Nenhum bloqueio"
              descricao="Os espaços seguem o horário de funcionamento cadastrado."
            />
          )}
          <Pagination pagina={pagina} total={total} base={base} />
        </section>
        <BloqueiosForm
          key={selecionado?.id ?? "novo"}
          laboratorios={labs}
          demonstracao={ctx.demonstracao}
          admin={admin}
          bloqueio={selecionado}
          base={base}
        />
      </div>
    </>
  );
}

import { redirect } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { z } from "@/lib/validacao";
import {
  dataBr,
  EmptyState,
  PageHeading,
  Pagination,
} from "@/components/shared";
import { getContexto } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { filtroAuditoriaSchema, intervaloRelatorio } from "@/lib/relatorios";
import "@/components/gestao/relatorios.css";

const registrosSchema = z.array(
  z
    .object({
      id: z.uuid(),
      ator_id: z.uuid().nullable(),
      acao: z.string(),
      entidade: z.string(),
      entidade_id: z.uuid().nullable(),
      antes: z.json().nullable(),
      depois: z.json().nullable(),
      created_at: z.iso.datetime({ offset: true }),
      profiles: z.object({ nome: z.string() }).strict().nullable(),
    })
    .strict(),
);

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const contexto = await getContexto();
  if (!contexto.demonstracao && !contexto.usuario?.roles.includes("admin"))
    redirect("/acesso-negado");
  const validado = filtroAuditoriaSchema.safeParse(await searchParams);
  const filtros = validado.success
    ? validado.data
    : filtroAuditoriaSchema.parse({});
  let registros: z.infer<typeof registrosSchema> = [];
  let total = 0;
  let falha = false;
  if (!contexto.demonstracao && validado.success) {
    const db = await createClient();
    const periodo = intervaloRelatorio(filtros);
    let consulta = db
      .from("audit_log")
      .select(
        "id,ator_id,acao,entidade,entidade_id,antes,depois,created_at,profiles!audit_log_ator_id_fkey(nome)",
        { count: "exact" },
      )
      .gte("created_at", periodo.p_inicio)
      .lt("created_at", periodo.p_fim)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (filtros.acao) consulta = consulta.eq("acao", filtros.acao);
    if (filtros.entidade) consulta = consulta.eq("entidade", filtros.entidade);
    if (filtros.ator_id) consulta = consulta.eq("ator_id", filtros.ator_id);
    if (filtros.entidade_id)
      consulta = consulta.eq("entidade_id", filtros.entidade_id);
    const resultado = await consulta.range(
      (filtros.pagina - 1) * 20,
      filtros.pagina * 20 - 1,
    );
    const dados = registrosSchema.safeParse(resultado.data);
    if (resultado.error || !dados.success) falha = true;
    else {
      registros = dados.data;
      total = resultado.count ?? 0;
    }
  }
  const base = new URLSearchParams({
    inicio: filtros.inicio,
    fim: filtros.fim,
  });
  for (const chave of ["acao", "entidade", "ator_id", "entidade_id"] as const)
    if (filtros[chave]) base.set(chave, filtros[chave]);
  return (
    <>
      <PageHeading
        titulo="Cada decisão deixa um registro"
        descricao="Consulte ações administrativas, decisões de reservas e exportações registradas pela instituição."
      />
      {contexto.demonstracao && (
        <p className="notice report-notice">
          Demonstração de leitura. Registros reais de auditoria exigem Supabase
          configurado e acesso de administrador.
        </p>
      )}
      {!validado.success && (
        <p className="notice report-notice" role="alert">
          Filtros inválidos. Use um período de até 366 dias, IDs completos e
          identificadores de ação em letras, números e sublinhado.
        </p>
      )}
      <form
        className="panel report-filters audit-filters"
        action="/admin/auditoria"
      >
        <label>
          Início
          <input
            className="input"
            type="date"
            name="inicio"
            defaultValue={filtros.inicio}
            required
          />
        </label>
        <label>
          Fim
          <input
            className="input"
            type="date"
            name="fim"
            defaultValue={filtros.fim}
            required
          />
        </label>
        <label>
          Ação
          <input
            className="input"
            name="acao"
            defaultValue={filtros.acao}
            placeholder="Ex.: aprovar_reserva"
            maxLength={80}
          />
        </label>
        <label>
          Entidade
          <input
            className="input"
            name="entidade"
            defaultValue={filtros.entidade}
            placeholder="Ex.: reservas"
            maxLength={80}
          />
        </label>
        <label>
          ID do responsável
          <input
            className="input"
            name="ator_id"
            defaultValue={filtros.ator_id}
            placeholder="UUID do usuário"
            maxLength={36}
          />
        </label>
        <label>
          ID do registro
          <input
            className="input"
            name="entidade_id"
            defaultValue={filtros.entidade_id}
            placeholder="UUID da entidade"
            maxLength={36}
          />
        </label>
        <button className="button button-primary" type="submit">
          <SlidersHorizontal size={15} />
          Aplicar filtros
        </button>
      </form>
      <section className="panel">
        <div className="section-heading">
          <h2>Histórico de ações</h2>
          <span className="muted">
            {contexto.demonstracao ? "Somente leitura" : `${total} registros`}
          </span>
        </div>
        {falha ? (
          <div role="alert">
            <EmptyState
              titulo="Auditoria indisponível"
              descricao="Não foi possível consultar os registros agora."
              href={`/admin/auditoria?${base}`}
              label="Tentar novamente"
            />
          </div>
        ) : registros.length ? (
          <>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Tabela com rolagem horizontal"
            >
              <table className="data-table">
                <caption className="sr-only">
                  Auditoria filtrada, em ordem da ação mais recente
                </caption>
                <thead>
                  <tr>
                    <th>Data em São Paulo</th>
                    <th>Responsável</th>
                    <th>Ação</th>
                    <th>Registro</th>
                    <th>Alteração</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((registro) => (
                    <tr key={registro.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {dataBr(registro.created_at, "dd/MM/yyyy HH:mm:ss")}
                      </td>
                      <td>
                        {registro.ator_id ? (
                          <>
                            <strong>
                              {registro.profiles?.nome ?? "Usuário"}
                            </strong>
                            <br />
                            <code style={{ fontSize: 10 }}>
                              {registro.ator_id}
                            </code>
                          </>
                        ) : (
                          "Sistema"
                        )}
                      </td>
                      <td>
                        <code>{registro.acao}</code>
                      </td>
                      <td>
                        {registro.entidade}
                        <br />
                        <code style={{ fontSize: 10 }}>
                          {registro.entidade_id ?? "—"}
                        </code>
                      </td>
                      <td>
                        <details className="audit-detail">
                          <summary>Ver detalhes</summary>
                          <pre>
                            {JSON.stringify(
                              {
                                antes: registro.antes,
                                depois: registro.depois,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              pagina={filtros.pagina}
              total={total}
              base={`/admin/auditoria?${base}`}
            />
          </>
        ) : (
          <EmptyState
            titulo={
              contexto.demonstracao
                ? "A auditoria real aparecerá aqui"
                : "Nenhum registro encontrado"
            }
            descricao={
              contexto.demonstracao
                ? "As ações administrativas são registradas no banco, sem simulação de evidências."
                : "Ajuste o período e os filtros para consultar outras ações."
            }
          />
        )}
        {!falha && !registros.length && total > 0 && (
          <Pagination
            pagina={filtros.pagina}
            total={total}
            base={`/admin/auditoria?${base}`}
          />
        )}
      </section>
      <p className="report-criteria">
        Registros são imutáveis. As datas incluem todo o dia no fuso de São
        Paulo. O responsável “Sistema” identifica rotinas internas do banco.
      </p>
    </>
  );
}

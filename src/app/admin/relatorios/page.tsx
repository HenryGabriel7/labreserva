import Link from "next/link";
import { redirect } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { EmptyState, PageHeading, Pagination } from "@/components/shared";
import { getContexto, getLaboratorios } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import {
  filtroRelatorioSchema,
  intervaloRelatorio,
  nomesGravidade,
  nomesOcorrencia,
  nomesPapelRelatorio,
  relatorioSchema,
  relatorioVazio,
  resumoRelatorio,
} from "@/lib/relatorios";
import { ExportarRelatorio } from "./exportar-relatorio";
import "@/components/gestao/relatorios.css";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const contexto = await getContexto();
  if (!contexto.demonstracao && !contexto.usuario?.roles.includes("admin"))
    redirect("/acesso-negado");
  const validado = filtroRelatorioSchema.safeParse(await searchParams);
  const filtros = validado.success
    ? validado.data
    : filtroRelatorioSchema.parse({});
  const laboratorios = await getLaboratorios();
  let relatorio = relatorioVazio;
  let falha = "";
  if (!contexto.demonstracao && validado.success) {
    const db = await createClient();
    const resultado = await db.rpc("obter_relatorios", {
      ...intervaloRelatorio(filtros),
      p_laboratorio_id: filtros.laboratorio_id ?? null,
    });
    const dados = relatorioSchema.safeParse(resultado.data);
    if (resultado.error || !dados.success)
      falha =
        "Não foi possível carregar o relatório. Tente novamente em alguns instantes.";
    else relatorio = dados.data;
  }
  const resumo = resumoRelatorio(relatorio);
  const percentual = resumo.total
    ? Math.round((resumo.aprovadas / resumo.total) * 100)
    : 0;
  const base = new URLSearchParams({
    inicio: filtros.inicio,
    fim: filtros.fim,
  });
  if (filtros.laboratorio_id)
    base.set("laboratorio_id", filtros.laboratorio_id);
  const pagina = relatorio.por_laboratorio.slice(
    (filtros.pagina - 1) * 20,
    filtros.pagina * 20,
  );
  const periodo = {
    inicio: filtros.inicio,
    fim: filtros.fim,
    ...(filtros.laboratorio_id
      ? { laboratorio_id: filtros.laboratorio_id }
      : {}),
  };
  return (
    <>
      <PageHeading
        titulo="Informação para planejar melhor"
        descricao="Acompanhe a demanda, as confirmações e o uso dos espaços da instituição."
        acao={
          <ExportarRelatorio
            filtros={periodo}
            desabilitado={
              contexto.demonstracao || !validado.success || Boolean(falha)
            }
          />
        }
      />
      {contexto.demonstracao && (
        <p className="notice report-notice">
          Demonstração de leitura. Relatórios reais e exportações ficam
          disponíveis após configurar o Supabase e entrar como administrador.
        </p>
      )}
      {!validado.success && (
        <p className="notice report-notice" role="alert">
          Filtros inválidos. Use datas válidas, um laboratório e um período de
          até 366 dias.
        </p>
      )}
      <form className="panel report-filters" action="/admin/relatorios">
        <label>
          Início do período
          <input
            className="input"
            type="date"
            name="inicio"
            defaultValue={filtros.inicio}
            required
          />
        </label>
        <label>
          Fim do período
          <input
            className="input"
            type="date"
            name="fim"
            defaultValue={filtros.fim}
            required
          />
        </label>
        <label>
          Laboratório
          <select
            className="input"
            name="laboratorio_id"
            defaultValue={filtros.laboratorio_id ?? ""}
          >
            <option value="">Todos os laboratórios</option>
            {laboratorios.map((lab) => (
              <option value={lab.id} key={lab.id}>
                {lab.nome}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-primary" type="submit">
          <SlidersHorizontal size={15} />
          Aplicar filtros
        </button>
      </form>
      {falha ? (
        <div className="panel" role="alert">
          <EmptyState
            titulo="Relatório indisponível"
            descricao={falha}
            href={`/admin/relatorios?${base}`}
            label="Tentar novamente"
          />
        </div>
      ) : contexto.demonstracao ? (
        <div className="panel">
          <EmptyState
            titulo="Seus indicadores aparecerão aqui"
            descricao="Os filtros já estão preparados. Nenhum dado de demonstração é exportado como informação institucional."
          />
        </div>
      ) : !validado.success ? null : (
        <>
          <div className="report-metrics">
            <section className="panel report-metric">
              <p>Solicitações no período</p>
              <strong>{resumo.total}</strong>
              <small>{resumo.pendentes} aguardando decisão</small>
            </section>
            <section className="panel report-metric">
              <p>Aprovação no recorte</p>
              <strong>{percentual}%</strong>
              <small>
                {resumo.aprovadas} aprovadas, em uso ou concluídas / total
              </small>
            </section>
            <section className="panel report-metric">
              <p>Não comparecimentos</p>
              <strong>{resumo.noShows}</strong>
              <small>Reservas com status não compareceu</small>
            </section>
            <section className="panel report-metric">
              <p>Horas de sala confirmadas</p>
              <strong>
                {resumo.horas.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
              </strong>
              <small>Intervalos aprovados, em uso ou concluídos</small>
            </section>
          </div>
          <section className="panel report-section">
            <div className="section-heading">
              <h2>Uso por laboratório</h2>
              <Link href="/admin/auditoria" className="section-link">
                Consultar auditoria
              </Link>
            </div>
            {pagina.length ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Tabela com rolagem horizontal"
              >
                <table className="data-table">
                  <caption className="sr-only">
                    Solicitações por laboratório no período escolhido
                  </caption>
                  <thead>
                    <tr>
                      <th>Laboratório</th>
                      <th>Total</th>
                      <th>Aprovadas</th>
                      <th>Pendentes</th>
                      <th>Não compareceu</th>
                      <th>Horas de sala</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagina.map((lab) => (
                      <tr key={lab.id}>
                        <td>{lab.nome}</td>
                        <td>{lab.total}</td>
                        <td>{lab.aprovadas}</td>
                        <td>{lab.pendentes}</td>
                        <td>{lab.no_shows}</td>
                        <td>
                          {lab.horas_ocupadas.toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                titulo="Nenhum laboratório nesta página"
                descricao="Ajuste o filtro ou volte à primeira página do relatório."
                href={`/admin/relatorios?${base}`}
                label="Primeira página"
              />
            )}
            <Pagination
              pagina={filtros.pagina}
              total={relatorio.por_laboratorio.length}
              base={`/admin/relatorios?${base}`}
            />
          </section>
          <div className="report-sections">
            <section className="panel">
              <div className="section-heading">
                <h2>Solicitações por papel</h2>
              </div>
              {relatorio.por_papel.length ? (
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Tabela com rolagem horizontal"
                >
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Papel na solicitação</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.por_papel.map((papel) => (
                        <tr key={papel.papel}>
                          <td>{nomesPapelRelatorio[papel.papel]}</td>
                          <td>{papel.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  titulo="Sem solicitações no período"
                  descricao="A distribuição por papel aparecerá após as primeiras solicitações."
                />
              )}
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Ocorrências do período</h2>
              </div>
              {relatorio.ocorrencias.length ? (
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Tabela com rolagem horizontal"
                >
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Gravidade</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.ocorrencias.map((ocorrencia) => (
                        <tr key={`${ocorrencia.tipo}-${ocorrencia.gravidade}`}>
                          <td>{nomesOcorrencia[ocorrencia.tipo]}</td>
                          <td>{nomesGravidade[ocorrencia.gravidade]}</td>
                          <td>{ocorrencia.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  titulo="Nenhuma ocorrência registrada"
                  descricao="As ocorrências são agrupadas pela data em que foram registradas."
                />
              )}
            </section>
          </div>
          <p className="report-criteria">
            As datas incluem o dia inteiro em São Paulo. Reservas que
            intersectam o período entram no total; horas de sala são limitadas
            ao intervalo escolhido. A aprovação reflete o status atual e o papel
            é o registrado no momento da solicitação. Ocorrências usam a data do
            registro.{" "}
            <Link className="section-link" href="/admin/privacidade">
              Acessar privacidade institucional
            </Link>
          </p>
        </>
      )}
    </>
  );
}

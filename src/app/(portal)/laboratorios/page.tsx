import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Search,
  ArrowUpRight,
  UsersRound,
  MapPin,
  Clock3,
  ArrowRight,
} from "lucide-react";
import { getCatalogoLaboratorios } from "@/lib/data";
import { filtroCatalogoSchema } from "@/lib/schemas";
import {
  PageHeading,
  LabIcon,
  EmptyState,
  Pagination,
} from "@/components/shared";
import { nomeTipo, tiposLaboratorio } from "@/lib/types";
import "./laboratorios.css";
export default async function Laboratorios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filtros = filtroCatalogoSchema.safeParse(params);
  const f = filtros.success ? filtros.data : {};
  const { pagina = 1, ...busca } = f;
  const { laboratorios, total } = await getCatalogoLaboratorios({
    ...busca,
    pagina,
  });
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(busca))
    if (valor) query.set(chave, String(valor));
  const base = query.size ? `/laboratorios?${query}` : "/laboratorios";
  if (!laboratorios.length && pagina > 1) redirect(base);
  return (
    <>
      <PageHeading
        titulo="Espaços para descobrir"
        descricao="Conheça nossos laboratórios e encontre o ambiente ideal para a sua atividade."
        acao={
          <Link href="/calendario" className="button button-outline">
            <Clock3 size={15} />
            Consultar disponibilidade
          </Link>
        }
      />
      <form
        className="panel catalog-filters"
        action="/laboratorios"
        method="get"
        role="search"
        aria-label="Buscar laboratórios"
      >
        <div className="catalog-field catalog-search">
          <label htmlFor="catalogo-nome">Nome ou descrição</label>
          <Search size={17} aria-hidden="true" />
          <input
            className="input"
            id="catalogo-nome"
            type="search"
            name="q"
            placeholder="Ex.: Informática"
            defaultValue={f.q}
            maxLength={100}
          />
        </div>
        <div className="catalog-field">
          <label htmlFor="catalogo-tipo">Tipo de laboratório</label>
          <select
            className="input"
            id="catalogo-tipo"
            name="tipo"
            defaultValue={f.tipo ?? ""}
          >
            <option value="">Todos</option>
            {tiposLaboratorio.map((t) => (
              <option key={t} value={t}>
                {nomeTipo[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-field">
          <label htmlFor="catalogo-capacidade">Capacidade mínima</label>
          <select
            className="input"
            id="catalogo-capacidade"
            name="capacidade"
            defaultValue={f.capacidade ?? 0}
          >
            <option value="0">Qualquer</option>
            {[10, 20, 25, 30, 40].map((n) => (
              <option key={n} value={n}>
                {n}+ pessoas
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-field">
          <label htmlFor="catalogo-equipamento">Equipamento</label>
          <input
            className="input"
            id="catalogo-equipamento"
            name="equipamento"
            defaultValue={f.equipamento}
            maxLength={100}
          />
        </div>
        <button className="button button-primary" type="submit">
          Filtrar
        </button>
      </form>
      <div className="catalog-caption">
        <span>
          {total} laboratório{total !== 1 ? "s" : ""} encontrado
          {total !== 1 ? "s" : ""}
        </span>
        {f.q || f.tipo || f.capacidade || f.equipamento ? (
          <Link href="/laboratorios">Limpar filtros</Link>
        ) : (
          <span>Um lugar para cada possibilidade.</span>
        )}
      </div>
      {laboratorios.length ? (
        <div className="catalog-grid">
          {laboratorios.map((l) => (
            <article className="panel catalog-card" key={l.id}>
              <div className={`catalog-visual catalog-visual-${l.tipo}`}>
                <LabIcon tipo={l.tipo} size={42} />
                <span className="catalog-room-code">
                  {l.localizacao.split("·").at(-1)}
                </span>
                <span className={`badge badge-${l.ativo ? "green" : "gray"}`}>
                  {l.ativo ? "Ativo" : "Indisponível"}
                </span>
              </div>
              <div className="catalog-body">
                <span className="eyebrow">{nomeTipo[l.tipo]}</span>
                <h2>{l.nome}</h2>
                <p>{l.descricao}</p>
                <div className="catalog-meta">
                  <span>
                    <MapPin size={13} />
                    {l.localizacao}
                  </span>
                  <span>
                    <UsersRound size={13} />
                    {l.capacidade} pessoas
                  </span>
                </div>
                <div className="catalog-tags">
                  {l.equipamentos.map((e) => (
                    <span key={e.id}>{e.nome}</span>
                  ))}
                </div>
                <div className="catalog-card-footer">
                  <Link href={`/laboratorios/${l.id}`} className="section-link">
                    Conhecer o espaço <ArrowRight size={13} />
                  </Link>
                  <Link
                    href={`/reservas/nova?lab=${l.id}`}
                    className="button button-outline button-sm"
                    aria-label={`Reservar ${l.nome}`}
                  >
                    Reservar
                    <ArrowUpRight size={12} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            titulo="Nenhum laboratório encontrado"
            descricao="Experimente outros filtros para encontrar seu espaço."
            href="/laboratorios"
            label="Limpar filtros"
          />
        </div>
      )}
      {total > 20 && <Pagination pagina={pagina} total={total} base={base} />}
    </>
  );
}

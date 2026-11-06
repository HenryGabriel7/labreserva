import Link from "next/link";
import {
  Search,
  ArrowUpRight,
  UsersRound,
  MapPin,
  Clock3,
  ArrowRight,
} from "lucide-react";
import { getLaboratorios, getEquipamentos } from "@/lib/data";
import { filtroCatalogoSchema } from "@/lib/schemas";
import { PageHeading, LabIcon, EmptyState } from "@/components/shared";
import { nomeTipo, tiposLaboratorio } from "@/lib/types";
import "./laboratorios.css";
export default async function Laboratorios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, labs, equipamentos] = await Promise.all([
    searchParams,
    getLaboratorios("ativos"),
    getEquipamentos(),
  ]);
  const filtros = filtroCatalogoSchema.safeParse(params);
  const f = filtros.success ? filtros.data : {};
  const filtrados = labs.filter(
    (l) =>
      (!f.q ||
        `${l.nome} ${l.descricao}`.toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.tipo || l.tipo === f.tipo) &&
      (!f.capacidade || l.capacidade >= f.capacidade) &&
      (!f.equipamento ||
        equipamentos.some(
          (e) =>
            e.laboratorio_id === l.id &&
            e.nome.toLowerCase().includes(f.equipamento!.toLowerCase()),
        )),
  );
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
          {filtrados.length} laboratório{filtrados.length !== 1 ? "s" : ""}{" "}
          encontrado{filtrados.length !== 1 ? "s" : ""}
        </span>
        {f.q || f.tipo || f.capacidade || f.equipamento ? (
          <Link href="/laboratorios">Limpar filtros</Link>
        ) : (
          <span>Um lugar para cada possibilidade.</span>
        )}
      </div>
      {filtrados.length ? (
        <div className="catalog-grid">
          {filtrados.map((l) => (
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
                  {equipamentos
                    .filter((e) => e.laboratorio_id === l.id)
                    .slice(0, 3)
                    .map((e) => (
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
    </>
  );
}

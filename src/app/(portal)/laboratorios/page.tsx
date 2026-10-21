import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  UsersRound,
  MapPin,
  Clock3,
  Plus,
  ArrowRight,
} from "lucide-react";
import { getLaboratorios, getEquipamentos, getContexto } from "@/lib/data";
import { filtroCatalogoSchema } from "@/lib/schemas";
import { PageHeading, LabIcon, EmptyState } from "@/components/shared";
import { nomeTipo, tiposLaboratorio } from "@/lib/types";
import "./laboratorios.css";
export default async function Laboratorios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, labs, equipamentos, ctx] = await Promise.all([
    searchParams,
    getLaboratorios(),
    getEquipamentos(),
    getContexto(),
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
          ctx.usuario?.roles.includes("admin") ? (
            <Link
              href="/laboratorios/gerenciar"
              className="button button-outline"
            >
              <Plus size={15} />
              Gerenciar laboratórios
            </Link>
          ) : (
            <Link href="/calendario" className="button button-outline">
              <Clock3 size={15} />
              Consultar disponibilidade
            </Link>
          )
        }
      />
      <form className="panel catalog-filters" action="/laboratorios">
        <div className="catalog-search">
          <Search size={17} />
          <input
            name="q"
            placeholder="Busque por nome ou descrição..."
            defaultValue={f.q}
            aria-label="Nome ou descrição"
          />
        </div>
        <select
          className="input"
          name="tipo"
          defaultValue={f.tipo ?? ""}
          aria-label="Tipo de laboratório"
        >
          <option value="">Todos os tipos</option>
          {tiposLaboratorio.map((t) => (
            <option key={t} value={t}>
              {nomeTipo[t]}
            </option>
          ))}
        </select>
        <select
          className="input"
          name="capacidade"
          defaultValue={f.capacidade ?? 0}
          aria-label="Capacidade mínima"
        >
          <option value="0">Qualquer capacidade</option>
          {[10, 20, 25, 30, 40].map((n) => (
            <option key={n} value={n}>
              {n}+ pessoas
            </option>
          ))}
        </select>
        <input
          className="input"
          name="equipamento"
          defaultValue={f.equipamento}
          placeholder="Equipamento"
          aria-label="Filtrar por equipamento"
        />
        <button className="button button-primary" type="submit">
          <SlidersHorizontal size={15} />
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

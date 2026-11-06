import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ChartNoAxesCombined,
  ClipboardList,
  FlaskConical,
  ListChecks,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { PageHeading } from "@/components/shared";
import { requireUser } from "@/lib/auth";
import { getContexto } from "@/lib/data";
import { getResumoPainel } from "@/lib/data-painel";
import "@/components/gestao/relatorios.css";
import "./admin-dashboard.css";

export const metadata = { title: "Espaço administrativo" };

const modulos = [
  {
    href: "/admin/solicitacoes",
    titulo: "Solicitações",
    descricao:
      "Analise reservas, acompanhe a agenda e registre entradas e saídas.",
    Icone: ClipboardList,
  },
  {
    href: "/admin/laboratorios",
    titulo: "Gestão de laboratórios",
    descricao: "Cadastre os espaços e configure funcionamento e equipamentos.",
    Icone: FlaskConical,
  },
  {
    href: "/admin/bloqueios",
    titulo: "Bloqueios",
    descricao: "Organize os períodos de manutenção, feriados e eventos.",
    Icone: CalendarClock,
  },
  {
    href: "/admin/ocorrencias",
    titulo: "Ocorrências",
    descricao:
      "Consulte e registre ocorrências durante o uso dos laboratórios.",
    Icone: TriangleAlert,
  },
  {
    href: "/admin/usuarios",
    titulo: "Usuários",
    descricao: "Gerencie contas, papéis e vínculos de monitores.",
    Icone: UsersRound,
  },
  {
    href: "/admin/configuracoes",
    titulo: "Configurações",
    descricao: "Ajuste as regras e a identidade visual do portal.",
    Icone: Settings2,
  },
  {
    href: "/admin/relatorios",
    titulo: "Relatórios",
    descricao: "Acompanhe a demanda e a utilização dos espaços.",
    Icone: ChartNoAxesCombined,
  },
  {
    href: "/admin/auditoria",
    titulo: "Auditoria",
    descricao: "Consulte o histórico de ações registradas pelo sistema.",
    Icone: ListChecks,
  },
  {
    href: "/admin/privacidade",
    titulo: "Privacidade",
    descricao: "Atenda solicitações institucionais sobre dados pessoais.",
    Icone: ShieldCheck,
  },
];

export default async function AdminPage() {
  const { demonstracao } = await getContexto();
  if (!demonstracao) await requireUser(["admin"]);
  const resumo = await getResumoPainel().catch(() => null);
  const indicadores = resumo
    ? [
        {
          href: "/admin/solicitacoes?aba=agenda",
          titulo: "Reservas hoje",
          valor: resumo.reservasHoje,
          nota: `${resumo.confirmadasHoje} confirmadas para hoje`,
        },
        {
          href: "/admin/solicitacoes?aba=pendentes",
          titulo: "Aguardando aprovação",
          valor: resumo.pendentes,
          nota: "Solicitações para analisar",
        },
        {
          href: "/admin/laboratorios",
          titulo: "Ocupação neste momento",
          valor: `${resumo.ocupacaoPercentual}%`,
          nota: `${resumo.labsAtivos} laboratórios ativos`,
        },
        {
          href: "/admin/ocorrencias",
          titulo: "Ocorrências",
          valor: resumo.ocorrencias,
          nota: `${resumo.noShows} ausências registradas`,
        },
      ]
    : [];

  return (
    <>
      <PageHeading
        titulo="Espaço administrativo"
        descricao="Gerencie as reservas, os espaços e os acessos da instituição."
      />
      {resumo ? (
        <section
          aria-label="Indicadores institucionais"
          className="report-metrics"
        >
          {indicadores.map(({ href, titulo, valor, nota }) => (
            <Link
              key={href}
              href={href}
              className="panel report-metric admin-indicador"
            >
              <p>{titulo}</p>
              <strong>{valor}</strong>
              <small>{nota}</small>
            </Link>
          ))}
        </section>
      ) : !demonstracao ? (
        <p className="notice report-notice" role="status">
          Não foi possível carregar os indicadores agora. Os módulos continuam
          disponíveis.
        </p>
      ) : null}
      <ul className="admin-modulos" aria-label="Módulos administrativos">
        {modulos.map(({ href, titulo, descricao, Icone }) => (
          <li key={href}>
            <Link href={href} className="panel admin-modulo">
              <span className="admin-modulo-icone">
                <Icone size={20} aria-hidden="true" />
              </span>
              <span>
                <span className="admin-modulo-titulo">{titulo}</span>
                <span className="admin-modulo-descricao">{descricao}</span>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

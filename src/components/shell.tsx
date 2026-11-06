"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  FlaskConical,
  CalendarDays,
  ClipboardList,
  UsersRound,
  ChartNoAxesCombined,
  Settings2,
  ShieldCheck,
  PanelLeftClose,
  Menu,
  X,
  CircleHelp,
  ArrowUpRight,
  ArrowRightLeft,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResumoNotificacao } from "@/lib/notificacoes/resumo";
import { HeaderActions } from "./header-actions";
import "./shell.css";

const linksUsuario = [
  {
    href: "/",
    label: "Visão geral",
    icon: LayoutDashboard,
    group: "workspace",
  },
  {
    href: "/laboratorios",
    label: "Laboratórios",
    icon: FlaskConical,
    group: "workspace",
  },
  {
    href: "/calendario",
    label: "Calendário",
    icon: CalendarDays,
    group: "workspace",
  },
  {
    href: "/reservas",
    label: "Minhas reservas",
    icon: ClipboardList,
    group: "workspace",
  },
];
const linkMonitor = {
  href: "/monitor",
  label: "Solicitações",
  icon: ShieldCheck,
};
const linksAdmin = [
  {
    href: "/admin",
    label: "Visão geral",
    icon: LayoutDashboard,
    group: "workspace",
  },
  {
    href: "/admin/solicitacoes",
    label: "Solicitações",
    icon: ShieldCheck,
    group: "workspace",
  },
  {
    href: "/admin/laboratorios",
    label: "Laboratórios",
    icon: FlaskConical,
    group: "workspace",
  },
  {
    href: "/admin/usuarios",
    label: "Usuários",
    icon: UsersRound,
    group: "management",
  },
  {
    href: "/admin/bloqueios",
    label: "Bloqueios",
    icon: CalendarDays,
    group: "management",
  },
  {
    href: "/admin/ocorrencias",
    label: "Ocorrências",
    icon: ClipboardCheck,
    group: "management",
  },
  {
    href: "/admin/relatorios",
    label: "Relatórios",
    icon: ChartNoAxesCombined,
    group: "management",
  },
  {
    href: "/admin/auditoria",
    label: "Auditoria",
    icon: ClipboardList,
    group: "management",
  },
  {
    href: "/admin/configuracoes",
    label: "Configurações",
    icon: Settings2,
    group: "management",
  },
  {
    href: "/admin/privacidade",
    label: "Privacidade",
    icon: ShieldCheck,
    group: "management",
  },
];

export function Shell({
  children,
  nome = "Visitante",
  roles = [],
  demonstracao = false,
  administrativo = false,
  pendentes = 0,
  notificacoes = [],
  notificacoesIndisponiveis = false,
}: {
  children: React.ReactNode;
  nome?: string;
  roles?: string[];
  demonstracao?: boolean;
  administrativo?: boolean;
  pendentes?: number;
  notificacoes?: ResumoNotificacao[];
  notificacoesIndisponiveis?: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const aoRedimensionar = () => {
      if (!media.matches) setOpen(false);
    };
    media.addEventListener("change", aoRedimensionar);
    return () => media.removeEventListener("change", aoRedimensionar);
  }, []);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => menuButton.current?.focus());
      }
      if (evento.key !== "Tab") return;
      const itens = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>("a, button") ?? [],
      );
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo?.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro?.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [open]);
  const active = (href: string) =>
    path === href ||
    (href !== "/" && href !== "/admin" && path.startsWith(`${href}/`)) ||
    (href === "/admin/solicitacoes" && path.startsWith("/admin/reservas/"));
  const admin = roles.includes("admin");
  const podeAlternar = administrativo || demonstracao || admin;
  const visible = administrativo
    ? linksAdmin
    : [
        ...linksUsuario,
        ...(!admin && roles.includes("monitor")
          ? [{ ...linkMonitor, group: "management" }]
          : []),
      ];
  const espaco = administrativo ? "Espaço administrativo" : "Espaço de usuário";
  return (
    <div className={cn("app-shell", administrativo && "app-shell-admin")}>
      {open && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => menuButton.current?.focus());
          }}
        />
      )}
      <aside
        ref={sidebar}
        id="menu-principal"
        className={cn("sidebar", open && "sidebar-open")}
        aria-label="Menu principal"
        role={open ? "dialog" : "complementary"}
        aria-modal={open ? true : undefined}
      >
        <button
          type="button"
          className="sidebar-close"
          aria-label="Fechar menu principal"
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => menuButton.current?.focus());
          }}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <Link
          href={administrativo ? "/admin" : "/"}
          className="brand"
          onClick={() => setOpen(false)}
        >
          <span className="brand-icon">
            <FlaskConical size={22} />
          </span>
          <span>
            Lab<span className="brand-light">Reserva</span>
            <small>
              {administrativo ? "ADMINISTRAÇÃO" : "GESTÃO DE LABORATÓRIOS"}
            </small>
          </span>
        </Link>
        <nav aria-label={espaco}>
          <p className="nav-heading">{espaco}</p>
          {visible
            .filter((l) => l.group === "workspace")
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn("nav-item", active(l.href) && "nav-item-active")}
                aria-current={active(l.href) ? "page" : undefined}
              >
                <l.icon size={18} />
                {l.label}
              </Link>
            ))}
          {visible.some((l) => l.group === "management") && (
            <p className="nav-heading management-heading">GESTÃO</p>
          )}
          {visible
            .filter((l) => l.group === "management")
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn("nav-item", active(l.href) && "nav-item-active")}
                aria-current={active(l.href) ? "page" : undefined}
              >
                <l.icon size={18} />
                {l.label}
                {l.href === "/monitor" && pendentes > 0 && (
                  <span className="nav-count">{pendentes}</span>
                )}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span>
              <CircleHelp size={17} /> Precisa de uma mão?
            </span>
            <p>Consulte as regras de uso e a política de reservas.</p>
            <Link href="/ajuda">
              Acessar a central de ajuda <ArrowUpRight size={13} />
            </Link>
          </div>
          <Link className="sidebar-footer" href="/privacidade">
            <ShieldCheck size={13} />
            Privacidade e segurança <PanelLeftClose size={15} />
          </Link>
        </div>
      </aside>
      <div className="main-shell" inert={open ? true : undefined}>
        <header className={cn("topbar", podeAlternar && "topbar-com-troca")}>
          <div className="topbar-left">
            <button
              ref={menuButton}
              type="button"
              className="mobile-menu button button-ghost button-icon"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              aria-controls="menu-principal"
            >
              {open ? <X size={21} /> : <Menu size={21} />}
            </button>
            <div className="breadcrumb">
              <span className="breadcrumb-space">{espaco}</span>
              <span className="breadcrumb-divider" aria-hidden="true">
                /
              </span>
              <strong>
                {visible.find((l) => active(l.href))?.label ?? espaco}
              </strong>
            </div>
          </div>
          <div className="topbar-right">
            {podeAlternar && (
              <Link
                href={administrativo ? "/" : "/admin"}
                className="button button-outline workspace-switch"
              >
                <ArrowRightLeft size={16} aria-hidden="true" />
                {administrativo ? "Espaço de usuário" : "Espaço administrativo"}
              </Link>
            )}
            <HeaderActions
              administrativo={administrativo}
              nome={nome}
              roles={roles}
              demonstracao={demonstracao}
              notificacoes={notificacoes}
              notificacoesIndisponiveis={notificacoesIndisponiveis}
            />
          </div>
        </header>
        {demonstracao && (
          <div className="demo-bar">
            <span>
              <span className="demo-dot" /> Ambiente de demonstração · dados
              ilustrativos, somente leitura
            </span>
            <Link href="/login">
              Entrar na instituição <ArrowUpRight size={12} />
            </Link>
          </div>
        )}
        <main id="conteudo" className="page-content">
          {children}
        </main>
        <footer className="main-footer">
          <span>
            LabReserva <span>·</span> Mais organização. Mais possibilidades.
          </span>
          <span>
            Horários em Brasília (UTC−3)
            <span className="footer-dot" />
            Todos os sistemas em um só lugar
          </span>
        </footer>
      </div>
      <nav
        className="bottom-nav"
        aria-label="Navegação rápida"
        inert={open ? true : undefined}
      >
        {visible.slice(0, 4).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(active(l.href) && "active")}
            aria-current={active(l.href) ? "page" : undefined}
          >
            <l.icon size={20} />
            <span>
              {l.href === "/" || l.href === "/admin"
                ? "Início"
                : l.href === "/reservas"
                  ? "Reservas"
                  : l.label}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

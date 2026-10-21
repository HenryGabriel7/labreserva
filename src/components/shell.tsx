"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  FlaskConical,
  CalendarDays,
  ClipboardList,
  UsersRound,
  ChartNoAxesCombined,
  Settings2,
  ShieldCheck,
  Bell,
  Search,
  ChevronDown,
  PanelLeftClose,
  Menu,
  X,
  CircleHelp,
  ArrowUpRight,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import "./shell.css";

const links = [
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
  {
    href: "/monitor",
    label: "Solicitações",
    icon: ShieldCheck,
    group: "management",
    roles: ["monitor", "admin"],
  },
  {
    href: "/usuarios",
    label: "Usuários",
    icon: UsersRound,
    group: "management",
    roles: ["admin"],
  },
  {
    href: "/relatorios",
    label: "Relatórios",
    icon: ChartNoAxesCombined,
    group: "management",
    roles: ["admin"],
  },
  {
    href: "/auditoria",
    label: "Auditoria",
    icon: ClipboardList,
    group: "management",
    roles: ["admin"],
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings2,
    group: "management",
    roles: ["admin"],
  },
];

export function Shell({
  children,
  nome = "Visitante",
  roles = [],
  demonstracao = false,
  pendentes = 0,
}: {
  children: React.ReactNode;
  nome?: string;
  roles?: string[];
  demonstracao?: boolean;
  pendentes?: number;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) =>
    href === "/" ? path === href : path.startsWith(href);
  const visible = links.filter(
    (l) => !l.roles || demonstracao || l.roles.some((r) => roles.includes(r)),
  );
  const initials = nome
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
  return (
    <div className="app-shell">
      {open && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn("sidebar", open && "sidebar-open")}
        aria-label="Menu principal"
      >
        <Link href="/" className="brand">
          <span className="brand-icon">
            <FlaskConical size={22} />
          </span>
          <span>
            Lab<span className="brand-light">Reserva</span>
            <small>GESTÃO DE LABORATÓRIOS</small>
          </span>
        </Link>
        <div className="institution">
          <span className="institution-icon">
            <GraduationCap size={19} />
          </span>
          <div>
            <strong>Portal acadêmico</strong>
            <small>Campus principal</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav>
          <p className="nav-heading">ESPAÇO DE TRABALHO</p>
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
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu button button-ghost button-icon"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
            >
              {open ? <X size={21} /> : <Menu size={21} />}
            </button>
            <div className="breadcrumb">
              Portal acadêmico <span>/</span>
              <strong>
                {links.find((l) => active(l.href))?.label ?? "Meu espaço"}
              </strong>
            </div>
          </div>
          <div className="topbar-right">
            <form className="global-search" action="/laboratorios">
              <Search size={16} />
              <input
                name="q"
                aria-label="Buscar laboratórios"
                placeholder="Buscar laboratórios..."
              />
              <kbd>⌕</kbd>
            </form>
            <Link
              href="/notificacoes"
              className="notification-icon"
              aria-label="Central de notificações"
            >
              <Bell size={19} />
            </Link>
            <span className="topbar-divider" />
            <Link
              href={demonstracao ? "/login" : "/perfil"}
              className="profile-menu"
            >
              <span className="avatar">{demonstracao ? "LR" : initials}</span>
              <span>
                <strong>{nome}</strong>
                <small>
                  {demonstracao
                    ? "Demonstração"
                    : roles.includes("admin")
                      ? "Administrador"
                      : roles.includes("monitor")
                        ? "Monitor"
                        : roles.includes("professor")
                          ? "Professor"
                          : "Comunidade acadêmica"}
                </small>
              </span>
              <ChevronDown size={14} />
            </Link>
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
      <nav className="bottom-nav" aria-label="Navegação rápida">
        {visible.slice(0, 4).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(active(l.href) && "active")}
          >
            <l.icon size={20} />
            <span>
              {l.href === "/"
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

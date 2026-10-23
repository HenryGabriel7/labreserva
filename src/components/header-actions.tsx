"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  KeyRound,
  LogIn,
  LogOut,
  Settings2,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { logoutAction } from "@/lib/auth-actions";
import { marcarNotificacoesLidas } from "@/app/(portal)/notificacoes/actions";
import type { ResumoNotificacao } from "@/lib/notificacoes/resumo";

const rotulosPapel: Record<string, string> = {
  admin: "Administrador",
  monitor: "Monitor",
  professor: "Professor",
  funcionario: "Funcionário",
  aluno: "Aluno",
};

export function HeaderActions({
  nome,
  roles,
  demonstracao,
  notificacoes,
  notificacoesIndisponiveis = false,
}: {
  nome: string;
  roles: string[];
  demonstracao: boolean;
  notificacoes: ResumoNotificacao[];
  notificacoesIndisponiveis?: boolean;
}) {
  const [aberto, setAberto] = useState<"notificacoes" | "perfil" | null>(null);
  const [lidas, setLidas] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [pendente, transicao] = useTransition();
  const area = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const sino = useRef<HTMLButtonElement>(null);
  const perfil = useRef<HTMLButtonElement>(null);
  const id = useId();
  const novas = notificacoes.filter(
    (item) => !item.lidaEm && !lidas.includes(item.id),
  );
  const iniciais = nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("");

  useEffect(() => {
    if (!aberto) return;
    const botao = aberto === "notificacoes" ? sino.current : perfil.current;
    painel.current?.querySelector<HTMLElement>("button, a")?.focus();
    const fecharFora = (evento: Event) => {
      if (!area.current?.contains(evento.target as Node)) setAberto(null);
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        setAberto(null);
        botao?.focus();
      }
    };
    document.addEventListener("pointerdown", fecharFora);
    document.addEventListener("focusin", fecharFora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fecharFora);
      document.removeEventListener("focusin", fecharFora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const marcar = () => {
    setErro("");
    transicao(async () => {
      try {
        const resultado = await marcarNotificacoesLidas({
          ids: novas.map((item) => item.id),
        });
        if (resultado.error) setErro(resultado.error);
        else setLidas((atuais) => [...atuais, ...novas.map((item) => item.id)]);
      } catch {
        setErro(
          "Não foi possível atualizar suas notificações. Tente novamente.",
        );
      }
    });
  };

  return (
    <div className="header-actions" ref={area}>
      <button
        ref={sino}
        type="button"
        className="notification-icon"
        aria-label="Notificações"
        aria-haspopup="dialog"
        aria-expanded={aberto === "notificacoes"}
        aria-controls={`${id}-notificacoes`}
        onClick={() =>
          setAberto(aberto === "notificacoes" ? null : "notificacoes")
        }
      >
        <Bell size={20} aria-hidden="true" />
        {novas.length > 0 && (
          <span className="header-unread-dot" aria-hidden="true" />
        )}
      </button>
      <span className="topbar-divider" aria-hidden="true" />
      <button
        ref={perfil}
        type="button"
        className="profile-menu"
        aria-label={`Menu de perfil de ${nome}`}
        aria-haspopup="menu"
        aria-expanded={aberto === "perfil"}
        aria-controls={`${id}-perfil`}
        onClick={() => setAberto(aberto === "perfil" ? null : "perfil")}
      >
        <span className="avatar" aria-hidden="true">
          {demonstracao ? "LR" : iniciais}
        </span>
        <span className="profile-menu-copy">
          <strong>{nome}</strong>
          <small>
            {demonstracao
              ? "Demonstração"
              : (rotulosPapel[roles[0]] ?? "Comunidade acadêmica")}
          </small>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {aberto === "notificacoes" && (
        <div
          ref={painel}
          id={`${id}-notificacoes`}
          className="header-popover notifications-popover"
          role="dialog"
          aria-label="Notificações recentes"
        >
          <div className="header-popover-heading">
            <div>
              <h2>Notificações</h2>
              <p>As últimas atualizações da sua conta</p>
            </div>
            <button
              type="button"
              className="popover-close"
              aria-label="Fechar notificações"
              onClick={() => {
                setAberto(null);
                sino.current?.focus();
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {notificacoesIndisponiveis ? (
            <p className="popover-empty" role="status">
              Não foi possível carregar as notificações agora. Tente novamente
              em instantes.
            </p>
          ) : notificacoes.length === 0 ? (
            <p className="popover-empty">
              Tudo em dia. Você não tem notificações.
            </p>
          ) : (
            <ul className="popover-notification-list">
              {notificacoes.slice(0, 5).map((item) => {
                const naoLida = !item.lidaEm && !lidas.includes(item.id);
                return (
                  <li key={item.id} className={naoLida ? "unread" : undefined}>
                    <div className="popover-notification-title">
                      <strong>{item.titulo}</strong>
                      {naoLida && <span className="popover-new">Nova</span>}
                    </div>
                    <p>{item.mensagem}</p>
                    <div className="popover-notification-meta">
                      <time dateTime={item.criadaEm}>
                        {new Intl.DateTimeFormat("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "America/Sao_Paulo",
                        }).format(new Date(item.criadaEm))}
                      </time>
                      {item.reservaId && (
                        <Link
                          href={`/reservas/${item.reservaId}`}
                          onClick={() => setAberto(null)}
                        >
                          Ver reserva
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {erro && (
            <p className="popover-error" role="alert">
              {erro}
            </p>
          )}
          <div className="header-popover-footer">
            <Link href="/notificacoes" onClick={() => setAberto(null)}>
              Ver todas
            </Link>
            <button
              type="button"
              disabled={demonstracao || pendente || novas.length === 0}
              onClick={marcar}
            >
              <CheckCheck size={15} aria-hidden="true" />
              {pendente ? "Atualizando…" : "Marcar como lidas"}
            </button>
          </div>
        </div>
      )}

      {aberto === "perfil" && (
        <div
          ref={painel}
          id={`${id}-perfil`}
          className="header-popover profile-popover"
          role="menu"
          aria-label="Opções da conta"
          onKeyDown={(evento) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(evento.key))
              return;
            evento.preventDefault();
            const itens = Array.from(
              evento.currentTarget.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not(:disabled)',
              ),
            );
            const atual = itens.indexOf(document.activeElement as HTMLElement);
            const proximo =
              evento.key === "Home"
                ? 0
                : evento.key === "End"
                  ? itens.length - 1
                  : (atual +
                      (evento.key === "ArrowDown" ? 1 : -1) +
                      itens.length) %
                    itens.length;
            itens[proximo]?.focus();
          }}
        >
          <p className="profile-popover-name" role="presentation">
            {nome}
          </p>
          <Link role="menuitem" href="/perfil" onClick={() => setAberto(null)}>
            <UserRound size={17} aria-hidden="true" /> Meu perfil
          </Link>
          <Link
            role="menuitem"
            href="/perfil#preferencias"
            onClick={() => setAberto(null)}
          >
            <SlidersHorizontal size={17} aria-hidden="true" /> Preferências
          </Link>
          <Link
            role="menuitem"
            href="/perfil#seguranca"
            onClick={() => setAberto(null)}
          >
            <KeyRound size={17} aria-hidden="true" /> Segurança
          </Link>
          {(demonstracao || roles.includes("admin")) && (
            <Link
              role="menuitem"
              href="/configuracoes"
              onClick={() => setAberto(null)}
            >
              <Settings2 size={17} aria-hidden="true" /> Configurações do
              sistema
            </Link>
          )}
          <div className="profile-popover-separator" role="separator" />
          {demonstracao ? (
            <Link role="menuitem" href="/login" onClick={() => setAberto(null)}>
              <LogIn size={17} aria-hidden="true" /> Entrar na instituição
            </Link>
          ) : (
            <form action={logoutAction} role="none">
              <button role="menuitem" type="submit" className="profile-logout">
                <LogOut size={17} aria-hidden="true" /> Sair da conta
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

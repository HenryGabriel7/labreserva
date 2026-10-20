import Link from "next/link";
import {
  FlaskConical,
  ArrowUpRight,
  ShieldCheck,
  CalendarDays,
  GraduationCap,
} from "lucide-react";
import "./auth.css";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Link href="/" className="auth-brand">
          <span>
            <FlaskConical size={26} />
          </span>
          Lab<span className="auth-brand-light">Reserva</span>
        </Link>
        <div className="auth-story">
          <span className="auth-overline">ESPAÇOS QUE TRANSFORMAM</span>
          <h1>
            O próximo
            <br />
            conhecimento
            <br />
            começa aqui.
          </h1>
          <p>
            Laboratórios, pessoas e possibilidades.
            <br />
            Tudo conectado em um só lugar.
          </p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="auth-orbit auth-orbit-one" />
            <div className="auth-orbit auth-orbit-two" />
            <span className="auth-illustration-main">
              <FlaskConical size={66} strokeWidth={1.3} />
            </span>
            <span className="auth-illustration-small auth-small-one">
              <CalendarDays size={24} />
            </span>
            <span className="auth-illustration-small auth-small-two">
              <GraduationCap size={25} />
            </span>
          </div>
        </div>
        <div className="auth-aside-footer">
          <ShieldCheck size={16} />
          <span>Acesso seguro à sua instituição</span>
        </div>
      </aside>
      <main id="conteudo" className="auth-main">
        <div className="auth-mobile-brand">
          <Link href="/">
            <FlaskConical size={24} />
            LabReserva
          </Link>
        </div>
        <div className="auth-card">{children}</div>
        <footer className="auth-footer">
          <span>LabReserva · Portal acadêmico</span>
          <Link href="/privacidade">
            Privacidade <ArrowUpRight size={12} />
          </Link>
        </footer>
      </main>
    </div>
  );
}

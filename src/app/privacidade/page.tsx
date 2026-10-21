import Link from "next/link";
import { FlaskConical, ArrowLeft, ShieldCheck } from "lucide-react";
export const metadata = { title: "Privacidade" };
export default function Privacidade() {
  return (
    <main
      id="conteudo"
      style={{ maxWidth: 800, margin: "0 auto", padding: "40px 22px 70px" }}
    >
      <Link href="/" className="brand" style={{ padding: 0, marginBottom: 35 }}>
        <span className="brand-icon">
          <FlaskConical size={22} />
        </span>
        LabReserva
      </Link>
      <section className="panel" style={{ padding: "clamp(24px,5vw,45px)" }}>
        <ShieldCheck size={28} color="#087f67" />
        <h1 className="page-title" style={{ marginTop: 20 }}>
          Seus dados merecem cuidado.
        </h1>
        <p className="page-subtitle">
          Política de privacidade do portal de reserva de laboratórios.
        </p>
        <div style={{ fontSize: 13, lineHeight: 1.95, color: "#4b6575" }}>
          <h2 style={{ fontSize: 17, color: "#253f4d", marginTop: 30 }}>
            O que o portal utiliza
          </h2>
          <p>
            Nome, email institucional, matrícula, papéis e informações das
            reservas são usados para identificar solicitantes, organizar os
            espaços, comunicar decisões e manter um histórico das atividades.
          </p>
          <h2 style={{ fontSize: 17, color: "#253f4d" }}>Quem pode acessar</h2>
          <p>
            Você acompanha suas próprias solicitações. Monitores acessam os
            laboratórios sob sua responsabilidade. Administradores autorizados
            gerenciam o sistema e consultam a auditoria. O calendário
            compartilhado não revela informações pessoais.
          </p>
          <h2 style={{ fontSize: 17, color: "#253f4d" }}>
            Cookies e notificações
          </h2>
          <p>
            Cookies de sessão mantêm seu acesso seguro. Não usamos armazenamento
            local para tokens nem ferramentas de publicidade. Você pode
            desativar lembretes nas preferências; mensagens essenciais de conta
            e decisões de reserva continuam sendo enviadas.
          </p>
          <h2 style={{ fontSize: 17, color: "#253f4d" }}>Seus direitos</h2>
          <p>
            Use a área de dados pessoais para exportar suas informações em JSON.
            Para correção ou anonimização, solicite ao administrador
            institucional. A anonimização preserva os identificadores
            necessários ao histórico e à auditoria.
          </p>
          <Link
            className="button button-outline"
            href="/relatorios/privacidade"
          >
            Acessar meus dados pessoais
          </Link>
          <h2 style={{ fontSize: 17, color: "#253f4d", marginTop: 30 }}>
            Conservação e contato
          </h2>
          <p>
            A instituição responsável deve informar seu encarregado e confirmar
            os prazos de conservação antes da implantação. A configuração de
            referência prevê 24 meses para reservas e ocorrências e 60 meses
            para auditoria, sujeitos à política institucional. Procure a
            administração acadêmica para exercer seus direitos ou esclarecer
            dúvidas.
          </p>
        </div>
      </section>
      <Link className="section-link" href="/" style={{ marginTop: 25 }}>
        <ArrowLeft size={14} />
        Voltar para o portal
      </Link>
    </main>
  );
}

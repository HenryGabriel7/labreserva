import Link from "next/link";
import { ShieldCheck, LogOut, KeyRound } from "lucide-react";
import { PageHeading } from "@/components/shared";
import { getContexto } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { preferenciasNotificacaoSchema } from "@/lib/auth-schema";
import { logoutAction } from "@/lib/auth-actions";
import { PreferenciasForm } from "./preferencias-form";
import type { Papel } from "@/lib/types";
import "../pessoas.css";

const nomesPapel: Record<Papel, string> = {
  aluno: "Aluno",
  professor: "Professor",
  funcionario: "Funcionário",
  monitor: "Monitor",
  admin: "Administrador",
};

export default async function PerfilPage() {
  const { demonstracao, usuario } = await getContexto();
  let preferencias = { lembretes: true, outros: true };
  let matricula = "202601024";
  if (!demonstracao && usuario) {
    const db = await createClient();
    const { data, error } = await db
      .from("profiles")
      .select("matricula,preferencias_notificacao")
      .eq("id", usuario.id)
      .single();
    if (error) throw new Error("Não foi possível carregar seu perfil.");
    const validado = preferenciasNotificacaoSchema.safeParse(
      data.preferencias_notificacao,
    );
    if (validado.success) preferencias = validado.data;
    matricula = data.matricula || "Não informado";
  }
  const nome = usuario?.nome ?? "Ana Carolina Silva";
  const roles = usuario?.roles ?? ["aluno"];
  return (
    <>
      <PageHeading
        titulo="Seu espaço, suas preferências"
        descricao="Confira seus dados e escolha como quer acompanhar as atividades."
      />
      <div className="profile-columns">
        <section className="panel profile-card">
          <div className="profile-avatar" aria-hidden="true">
            {nome
              .split(" ")
              .slice(0, 2)
              .map((parte) => parte[0])
              .join("")}
          </div>
          <h2>{nome}</h2>
          <p>{usuario?.email ?? "ana.silva@instituicao.edu.br"}</p>
          <div
            className="people-tags"
            style={{ justifyContent: "center", marginTop: 18 }}
          >
            {roles.map((papel) => (
              <span className="badge badge-green" key={papel}>
                {nomesPapel[papel]}
              </span>
            ))}
          </div>
          <dl className="profile-meta">
            <div>
              <dt>MATRÍCULA OU REGISTRO</dt>
              <dd>{matricula}</dd>
            </div>
            <div>
              <dt>SITUAÇÃO DA CONTA</dt>
              <dd>
                <span className="badge badge-green">Ativa</span>
              </dd>
            </div>
          </dl>
          <p style={{ lineHeight: 1.8, marginTop: 24 }}>
            Para corrigir seu nome, matrícula ou papéis, procure a administração
            da instituição.
          </p>
        </section>
        <div>
          <PreferenciasForm
            preferencias={preferencias}
            demonstracao={demonstracao}
          />
          <section className="panel profile-security">
            <h2>
              <ShieldCheck size={18} color="#087f67" />
              Segurança da sua conta
            </h2>
            <p className="page-subtitle">
              Proteja seu acesso com uma senha exclusiva e encerre as sessões em
              dispositivos compartilhados.
            </p>
            <div className="profile-security-actions">
              {demonstracao ? (
                <button className="button button-outline" disabled>
                  <KeyRound size={14} />
                  Alterar senha
                </button>
              ) : (
                <Link href="/definir-senha" className="button button-outline">
                  <KeyRound size={14} />
                  Alterar senha
                </Link>
              )}
              <form action={logoutAction}>
                <button
                  className="button button-outline"
                  disabled={demonstracao}
                >
                  <LogOut size={14} />
                  Sair de todos os dispositivos
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

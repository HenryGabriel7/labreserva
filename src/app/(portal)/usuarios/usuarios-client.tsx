"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "@/lib/validacao";
import {
  FileUp,
  Plus,
  Pencil,
  UsersRound,
  X,
  Mail,
  LoaderCircle,
} from "lucide-react";
import { EmptyState } from "@/components/shared";
import {
  alterarUsuarioSchema,
  conviteSchema,
  importarUsuariosSchema,
} from "@/lib/auth-schema";
import { papeis, type Papel } from "@/lib/types";

export interface UsuarioLista {
  id: string;
  nome: string;
  email: string;
  matricula: string | null;
  ativo: boolean;
  papeis: Papel[];
  laboratorioIds: string[];
}
type LaboratorioLista = { id: string; nome: string };
const nomesPapel: Record<Papel, string> = {
  aluno: "Aluno",
  professor: "Professor",
  funcionario: "Funcionário",
  monitor: "Monitor",
  admin: "Administrador",
};
type Resultado = {
  error?: string;
  criados?: number;
  erros?: { linha: number; mensagem: string }[];
  success?: boolean;
};

function PapeisCheckbox({
  registro,
}: {
  registro: UseFormRegisterReturn<"papeis">;
}) {
  return (
    <fieldset className="people-fieldset">
      <legend>Papéis de acesso</legend>
      <div className="people-checkbox-grid">
        {papeis.map((papel) => (
          <label key={papel} className="people-checkbox">
            <input type="checkbox" value={papel} {...registro} />
            {nomesPapel[papel]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function UsuariosClient({
  usuarios,
  laboratorios,
  demonstracao,
}: {
  usuarios: UsuarioLista[];
  laboratorios: LaboratorioLista[];
  demonstracao: boolean;
}) {
  const [painel, setPainel] = useState<"criar" | "csv" | string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const selecionado = usuarios.find((usuario) => usuario.id === painel);
  return (
    <>
      <div className="people-toolbar">
        <div className="people-stat">
          <UsersRound size={20} />
          <div>
            <strong>Comunidade acadêmica</strong>
            <span>
              {usuarios.length} usuário{usuarios.length !== 1 ? "s" : ""} nesta
              página
            </span>
          </div>
        </div>
        <div className="page-actions">
          <button
            className="button button-outline"
            disabled={demonstracao}
            onClick={() => setPainel(painel === "csv" ? null : "csv")}
          >
            <FileUp size={15} />
            Importar CSV
          </button>
          <button
            className="button button-primary"
            disabled={demonstracao}
            onClick={() => setPainel(painel === "criar" ? null : "criar")}
          >
            <Plus size={16} />
            Adicionar usuário
          </button>
        </div>
      </div>
      {mensagem && (
        <p role="status" className="notice" style={{ marginBottom: 18 }}>
          {mensagem}
        </p>
      )}
      {painel && !demonstracao && (
        <section
          className="panel people-editor"
          aria-label={selecionado ? "Editar usuário" : "Convidar usuários"}
        >
          <div className="section-heading">
            <h2>
              {selecionado
                ? `Editar ${selecionado.nome}`
                : painel === "csv"
                  ? "Importar usuários por CSV"
                  : "Um novo acesso à instituição"}
            </h2>
            <button
              className="button button-ghost button-icon"
              aria-label="Fechar formulário"
              onClick={() => setPainel(null)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="people-editor-content">
            {selecionado ? (
              <EditarUsuario
                key={selecionado.id}
                usuario={selecionado}
                laboratorios={laboratorios}
                concluir={(texto) => {
                  setMensagem(texto);
                  setPainel(null);
                }}
              />
            ) : painel === "csv" ? (
              <ImportarUsuarios
                concluir={(texto) => {
                  setMensagem(texto);
                  setPainel(null);
                }}
              />
            ) : (
              <CriarUsuario
                concluir={(texto) => {
                  setMensagem(texto);
                  setPainel(null);
                }}
              />
            )}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>Usuários da instituição</h2>
          <span className="muted" style={{ fontSize: 11 }}>
            Acesso por convite
          </span>
        </div>
        {!usuarios.length ? (
          <EmptyState
            titulo="Sua comunidade começa aqui"
            descricao="Adicione uma pessoa ou importe os usuários para enviar os primeiros convites."
          />
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Lista de usuários, role horizontalmente para ver todas as colunas"
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Matrícula</th>
                  <th>Papéis</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.id}>
                    <td>
                      <div className="people-name">
                        <span className="people-avatar">
                          {usuario.nome
                            .split(" ")
                            .slice(0, 2)
                            .map((nome) => nome[0])
                            .join("")}
                        </span>
                        <div>
                          <strong>{usuario.nome}</strong>
                          <small>{usuario.email}</small>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{usuario.matricula || "—"}</td>
                    <td>
                      <div className="people-tags">
                        {usuario.papeis.map((papel) => (
                          <span
                            className={`badge badge-${papel === "admin" ? "blue" : papel === "monitor" ? "green" : "gray"}`}
                            key={papel}
                          >
                            {nomesPapel[papel]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge badge-${usuario.ativo ? "green" : "gray"}`}
                      >
                        {usuario.ativo ? "Ativo" : "Desativado"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button button-ghost button-icon"
                        disabled={demonstracao}
                        aria-label={`Editar ${usuario.nome}`}
                        onClick={() => setPainel(usuario.id)}
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="people-footnote">
        <Mail size={14} />
        Os convites chegam por e-mail. Ao desativar uma conta, o histórico de
        reservas é preservado.
      </p>
    </>
  );
}

function CriarUsuario({ concluir }: { concluir: (texto: string) => void }) {
  const router = useRouter();
  const [pendente, transicao] = useTransition();
  const [erro, setErro] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof conviteSchema>>({
    resolver: zodResolver(conviteSchema),
    defaultValues: { nome: "", email: "", matricula: "", papeis: ["aluno"] },
  });
  const enviar = handleSubmit((dados) =>
    transicao(async () => {
      setErro("");
      try {
        const response = await fetch("/api/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados),
        });
        const resultado = (await response.json()) as Resultado;
        if (!response.ok || !resultado.criados) {
          setErro(
            resultado.error ??
              resultado.erros?.[0]?.mensagem ??
              "Não foi possível criar o convite.",
          );
          return;
        }
        concluir("Usuário criado. O convite foi adicionado à fila de envio.");
        router.refresh();
      } catch {
        setErro("Não foi possível conectar ao serviço. Tente novamente.");
      }
    }),
  );
  return (
    <form
      noValidate
      className="form-stack"
      onSubmit={enviar}
      aria-busy={pendente}
    >
      {erro && (
        <p role="alert" className="field-error">
          {erro}
        </p>
      )}
      <div className="form-grid">
        <label>
          Nome completo
          <input
            className="input"
            autoComplete="name"
            aria-invalid={!!errors.nome}
            {...register("nome")}
          />
          {errors.nome && (
            <span className="field-error">
              Informe um nome com 2 a 160 caracteres.
            </span>
          )}
        </label>
        <label>
          E-mail institucional
          <input
            className="input"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <span className="field-error">Informe um e-mail válido.</span>
          )}
        </label>
        <label>
          Matrícula ou registro <span className="muted">(opcional)</span>
          <input className="input" {...register("matricula")} maxLength={80} />
        </label>
      </div>
      <PapeisCheckbox registro={register("papeis")} />
      {errors.papeis && (
        <p role="alert" className="field-error">
          Selecione pelo menos um papel.
        </p>
      )}
      <div>
        <button className="button button-primary" disabled={pendente}>
          {pendente ? (
            <LoaderCircle size={15} className="people-spin" />
          ) : (
            <Mail size={15} />
          )}
          {pendente ? "Criando convite..." : "Criar e enviar convite"}
        </button>
      </div>
    </form>
  );
}

function ImportarUsuarios({ concluir }: { concluir: (texto: string) => void }) {
  const router = useRouter();
  const [pendente, transicao] = useTransition();
  const [erro, setErro] = useState("");
  const [falhas, setFalhas] = useState<{ linha: number; mensagem: string }[]>(
    [],
  );
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<z.infer<typeof importarUsuariosSchema>>({
    resolver: zodResolver(importarUsuariosSchema),
    defaultValues: { csv: "" },
  });
  return (
    <form
      noValidate
      className="form-stack"
      aria-busy={pendente}
      onSubmit={handleSubmit((dados) =>
        transicao(async () => {
          setErro("");
          setFalhas([]);
          try {
            const response = await fetch("/api/usuarios", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(dados),
            });
            const resultado = (await response.json()) as Resultado;
            if (resultado.erros?.length) {
              setFalhas(resultado.erros);
              setErro(
                `${resultado.criados ?? 0} convite(s) criado(s). As linhas abaixo precisam de revisão. Não importe novamente as linhas que deram certo.`,
              );
              router.refresh();
              return;
            }
            if (!response.ok) {
              setErro(
                resultado.error ?? "Não foi possível importar o arquivo.",
              );
              return;
            }
            concluir(
              `${resultado.criados} convite(s) adicionado(s) à fila de envio.`,
            );
            router.refresh();
          } catch {
            setErro("Não foi possível conectar ao serviço. Tente novamente.");
          }
        }),
      )}
    >
      <p className="page-subtitle">
        Até 100 pessoas por arquivo. Use os campos{" "}
        <strong>nome,email,matricula,papeis</strong>. Separe papéis acumulados
        com uma barra vertical, por exemplo: aluno|monitor.
      </p>
      <label>
        Selecionar arquivo CSV
        <input
          className="input"
          type="file"
          accept=".csv,text/csv"
          onChange={async (evento) => {
            const arquivo = evento.target.files?.[0];
            if (!arquivo) return;
            if (arquivo.size > 131072) {
              setErro("O arquivo deve ter até 128 KB.");
              return;
            }
            setValue("csv", await arquivo.text(), { shouldValidate: true });
          }}
        />
      </label>
      <label>
        Conteúdo do CSV
        <textarea
          className="input people-csv"
          rows={6}
          spellCheck={false}
          placeholder={
            "nome,email,matricula,papeis\nAna Silva,ana@instituicao.edu.br,2026001,aluno"
          }
          {...register("csv")}
        />
        {errors.csv && (
          <span className="field-error">Informe um CSV de até 128 KB.</span>
        )}
      </label>
      {erro && (
        <p role="alert" className="field-error">
          {erro}
        </p>
      )}
      {falhas.length > 0 && (
        <ul className="people-import-errors">
          {falhas.map((falha) => (
            <li key={falha.linha}>
              Linha {falha.linha}: {falha.mensagem}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button className="button button-primary" disabled={pendente}>
          {pendente ? (
            <LoaderCircle size={15} className="people-spin" />
          ) : (
            <FileUp size={15} />
          )}
          {pendente ? "Importando..." : "Importar e criar convites"}
        </button>
      </div>
    </form>
  );
}

function EditarUsuario({
  usuario,
  laboratorios,
  concluir,
}: {
  usuario: UsuarioLista;
  laboratorios: LaboratorioLista[];
  concluir: (texto: string) => void;
}) {
  const router = useRouter();
  const [pendente, transicao] = useTransition();
  const [erro, setErro] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<
    z.input<typeof alterarUsuarioSchema>,
    unknown,
    z.output<typeof alterarUsuarioSchema>
  >({
    resolver: zodResolver(alterarUsuarioSchema),
    defaultValues: {
      id: usuario.id,
      nome: usuario.nome,
      matricula: usuario.matricula ?? "",
      ativo: usuario.ativo,
      papeis: usuario.papeis,
      laboratorioIds: usuario.laboratorioIds,
    },
  });
  return (
    <form
      className="form-stack"
      noValidate
      aria-busy={pendente}
      onSubmit={handleSubmit((dados) =>
        transicao(async () => {
          setErro("");
          try {
            const response = await fetch("/api/usuarios", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...dados,
                laboratorioIds: dados.papeis.includes("monitor")
                  ? dados.laboratorioIds
                  : [],
              }),
            });
            const resultado = (await response.json()) as Resultado;
            if (!response.ok) {
              setErro(
                resultado.error ?? "Não foi possível atualizar o usuário.",
              );
              return;
            }
            concluir("Permissões e vínculos atualizados.");
            router.refresh();
          } catch {
            setErro("Não foi possível conectar ao serviço. Tente novamente.");
          }
        }),
      )}
    >
      {erro && (
        <p role="alert" className="field-error">
          {erro}
        </p>
      )}
      <div className="form-grid">
        <label>
          Nome completo
          <input
            className="input"
            aria-invalid={!!errors.nome}
            {...register("nome")}
          />
          {errors.nome && (
            <span className="field-error">Informe um nome válido.</span>
          )}
        </label>
        <label>
          Matrícula ou registro
          <input className="input" maxLength={80} {...register("matricula")} />
        </label>
      </div>
      <p className="page-subtitle">E-mail: {usuario.email}</p>
      <PapeisCheckbox registro={register("papeis")} />
      {errors.papeis && (
        <p className="field-error">Selecione pelo menos um papel.</p>
      )}
      <fieldset className="people-fieldset">
        <legend>Laboratórios acompanhados como monitor</legend>
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          Os vínculos se aplicam somente a quem possui o papel de monitor.
        </p>
        <div className="people-checkbox-grid">
          {laboratorios.map((lab) => (
            <label key={lab.id} className="people-checkbox">
              <input
                type="checkbox"
                value={lab.id}
                {...register("laboratorioIds")}
              />
              {lab.nome}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="people-checkbox">
        <input type="checkbox" {...register("ativo")} />
        Conta ativa para acesso ao portal
      </label>
      <p className="page-subtitle">
        Desativar bloqueia o acesso e preserva o histórico. Sua própria
        permissão de administrador deve ser mantida.
      </p>
      <div>
        <button className="button button-primary" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

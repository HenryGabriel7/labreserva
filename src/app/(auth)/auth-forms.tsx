"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import {
  loginAction,
  recuperarSenhaAction,
  definirSenhaAction,
} from "@/lib/auth-actions";
import {
  loginSchema,
  recuperarSenhaSchema,
  definirSenhaSchema,
  type EstadoAuth,
} from "@/lib/auth-schema";

function formData(valores: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(valores)) dados.set(chave, valor);
  return dados;
}
function Feedback({ estado }: { estado: EstadoAuth }) {
  return estado.error ? (
    <p role="alert" className="auth-feedback auth-feedback-error">
      {estado.error}
    </p>
  ) : estado.success ? (
    <p role="status" className="auth-feedback auth-feedback-success">
      {estado.success}
    </p>
  ) : null;
}
function Enviar({
  pendente,
  children,
}: {
  pendente: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className="button button-primary" type="submit" disabled={pendente}>
      {pendente ? (
        <LoaderCircle size={16} className="auth-loading" aria-hidden="true" />
      ) : null}
      {pendente ? "Aguarde..." : children}
      {!pendente && <ArrowRight size={15} aria-hidden="true" />}
    </button>
  );
}

export function LoginForm() {
  const [estado, acao, pendenteAcao] = useActionState(loginAction, {});
  const [pendente, transicao] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", senha: "" },
  });
  return (
    <>
      <form
        className="auth-form"
        noValidate
        onSubmit={handleSubmit((valores) =>
          transicao(() => acao(formData(valores))),
        )}
        aria-busy={pendente || pendenteAcao}
      >
        <Feedback estado={estado} />
        <div>
          <label htmlFor="email">E-mail institucional</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="voce@instituicao.edu.br"
            style={{ marginTop: 7 }}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-erro" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p className="field-error" id="email-erro">
              {errors.email.message}
            </p>
          )}
        </div>
        <div>
          <div className="auth-field-heading">
            <label htmlFor="senha">Senha</label>
            <Link href="/recuperar-senha" className="section-link">
              Esqueci minha senha
            </Link>
          </div>
          <input
            id="senha"
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            aria-invalid={!!errors.senha}
            aria-describedby={errors.senha ? "senha-erro" : undefined}
            {...register("senha")}
          />
          {errors.senha && (
            <p className="field-error" id="senha-erro">
              {errors.senha.message}
            </p>
          )}
        </div>
        <Enviar pendente={pendente || pendenteAcao}>
          Entrar na minha conta
        </Enviar>
      </form>
      <p className="auth-help">
        Primeiro acesso? A sua instituição enviará um convite por e-mail.
        <br />
        Para obter acesso, procure a administração.
      </p>
    </>
  );
}

export function RecuperarSenhaForm() {
  const [estado, acao, pendenteAcao] = useActionState(recuperarSenhaAction, {});
  const [pendente, transicao] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof recuperarSenhaSchema>>({
    resolver: zodResolver(recuperarSenhaSchema),
    defaultValues: { email: "" },
  });
  return (
    <>
      <form
        className="auth-form"
        noValidate
        onSubmit={handleSubmit((valores) =>
          transicao(() => acao(formData(valores))),
        )}
        aria-busy={pendente || pendenteAcao}
      >
        <Feedback estado={estado} />
        <div>
          <label htmlFor="email">E-mail institucional</label>
          <input
            id="email"
            type="email"
            className="input"
            style={{ marginTop: 7 }}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="voce@instituicao.edu.br"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-erro" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-erro" className="field-error">
              {errors.email.message}
            </p>
          )}
        </div>
        <Enviar pendente={pendente || pendenteAcao}>Enviar instruções</Enviar>
      </form>
      <Link href="/login" className="auth-back">
        <ArrowLeft size={14} />
        Voltar para o login
      </Link>
    </>
  );
}

export function DefinirSenhaForm() {
  const [estado, acao, pendenteAcao] = useActionState(definirSenhaAction, {});
  const [pendente, transicao] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof definirSenhaSchema>>({
    resolver: zodResolver(definirSenhaSchema),
    defaultValues: { senha: "", confirmarSenha: "" },
  });
  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={handleSubmit((valores) =>
        transicao(() => acao(formData(valores))),
      )}
      aria-busy={pendente || pendenteAcao}
    >
      <Feedback estado={estado} />
      <div>
        <label htmlFor="senha">Nova senha</label>
        <input
          id="senha"
          className="input"
          type="password"
          autoComplete="new-password"
          style={{ marginTop: 7 }}
          aria-invalid={!!errors.senha}
          aria-describedby="senha-requisitos senha-erro"
          {...register("senha")}
        />
        <p id="senha-requisitos" className="auth-password-hint">
          Use pelo menos 12 caracteres, com letras maiúsculas e minúsculas,
          números e símbolos.
        </p>
        {errors.senha && (
          <p className="field-error" id="senha-erro">
            {errors.senha.message}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="confirmarSenha">Confirme a nova senha</label>
        <input
          id="confirmarSenha"
          className="input"
          type="password"
          autoComplete="new-password"
          style={{ marginTop: 7 }}
          aria-invalid={!!errors.confirmarSenha}
          aria-describedby={
            errors.confirmarSenha ? "confirmacao-erro" : undefined
          }
          {...register("confirmarSenha")}
        />
        {errors.confirmarSenha && (
          <p className="field-error" id="confirmacao-erro">
            {errors.confirmarSenha.message}
          </p>
        )}
      </div>
      <Enviar pendente={pendente || pendenteAcao}>Salvar minha senha</Enviar>
    </form>
  );
}

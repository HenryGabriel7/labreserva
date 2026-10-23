"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "@/lib/validacao";
import { BellRing, Check, LoaderCircle } from "lucide-react";
import {
  preferenciasNotificacaoSchema,
  type EstadoAuth,
} from "@/lib/auth-schema";
import { salvarPreferencias } from "./actions";

export function PreferenciasForm({
  preferencias,
  demonstracao,
}: {
  preferencias: z.infer<typeof preferenciasNotificacaoSchema>;
  demonstracao: boolean;
}) {
  const [estado, setEstado] = useState<EstadoAuth>({});
  const [pendente, transicao] = useTransition();
  const { register, handleSubmit } = useForm<
    z.infer<typeof preferenciasNotificacaoSchema>
  >({
    resolver: zodResolver(preferenciasNotificacaoSchema),
    defaultValues: preferencias,
  });
  return (
    <form
      id="preferencias"
      className="panel profile-preferences"
      onSubmit={handleSubmit((dados) =>
        transicao(async () => setEstado(await salvarPreferencias({}, dados))),
      )}
      aria-busy={pendente}
    >
      <h2>
        <BellRing
          size={17}
          style={{ color: "#087f67", verticalAlign: "middle", marginRight: 8 }}
        />
        Notificações do seu jeito
      </h2>
      <p className="page-subtitle">
        Escolha quais comunicações deseja receber por e-mail.
      </p>
      <label className="profile-option">
        <input
          type="checkbox"
          disabled={demonstracao}
          {...register("lembretes")}
        />
        <span>
          <strong>Lembretes das minhas reservas</strong>
          <small>
            Um aviso 24 horas e outro 1 hora antes das atividades aprovadas.
          </small>
        </span>
      </label>
      <label className="profile-option">
        <input
          type="checkbox"
          disabled={demonstracao}
          {...register("outros")}
        />
        <span>
          <strong>Atualizações de acompanhamento</strong>
          <small>
            Outros avisos sobre solicitações e atividades da instituição.
          </small>
        </span>
      </label>
      <p className="notice" style={{ marginTop: 20 }}>
        <Check size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />
        Decisões de reservas, convites e avisos de segurança são essenciais e
        sempre serão enviados.
      </p>
      {estado.error && (
        <p className="field-error" role="alert">
          {estado.error}
        </p>
      )}
      {estado.success && (
        <p className="notice" role="status">
          {estado.success}
        </p>
      )}
      <button
        className="button button-primary"
        disabled={demonstracao || pendente}
        type="submit"
        style={{ marginTop: 16 }}
      >
        {pendente && <LoaderCircle size={15} className="people-spin" />}
        {pendente ? "Salvando..." : "Salvar preferências"}
      </button>
    </form>
  );
}

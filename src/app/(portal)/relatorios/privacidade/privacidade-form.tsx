"use client";

import { useState, type FormEvent } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { z } from "@/lib/validacao";

const mensagemSchema = z.object({ error: z.string() }).strict();
export function PrivacidadeForm({
  administrador,
  demonstracao,
}: {
  administrador: boolean;
  demonstracao: boolean;
}) {
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  async function enviar(
    evento: FormEvent<HTMLFormElement>,
    acao: "exportar" | "anonimizar",
  ) {
    evento.preventDefault();
    setMensagem("");
    setCarregando(true);
    const form = new FormData(evento.currentTarget);
    const usuarioId = String(form.get("usuario_id") ?? "").trim();
    try {
      const resposta = await fetch("/api/privacidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao,
          ...(usuarioId ? { usuario_id: usuarioId } : {}),
          ...(acao === "anonimizar"
            ? { motivo: String(form.get("motivo") ?? "") }
            : {}),
        }),
      });
      if (!resposta.ok) {
        const erro = mensagemSchema.safeParse(await resposta.json());
        throw new Error(
          erro.success ? erro.data.error : "Não foi possível concluir.",
        );
      }
      if (acao === "exportar") {
        const url = URL.createObjectURL(await resposta.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = "dados-pessoais.json";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMensagem(
          "Arquivo JSON preparado. A exportação foi registrada na auditoria.",
        );
      } else
        setMensagem(
          "Conta anonimizada e desativada. Os IDs e o histórico operacional foram preservados.",
        );
    } catch (erro) {
      setMensagem(
        erro instanceof Error ? erro.message : "Não foi possível concluir.",
      );
    } finally {
      setCarregando(false);
    }
  }
  return (
    <>
      <form
        className="panel privacy-form"
        onSubmit={(evento) => enviar(evento, "exportar")}
      >
        <h2>Uma cópia dos seus dados</h2>
        <p>
          Baixe seu perfil, papéis, reservas e o registro das suas notificações
          em JSON. A instituição registra a exportação para proteger seus dados.
        </p>
        {administrador && (
          <label>
            ID de outro usuário (opcional)
            <input
              className="input"
              name="usuario_id"
              placeholder="Deixe vazio para exportar seus próprios dados"
              maxLength={36}
            />
          </label>
        )}
        <button
          className="button button-primary"
          type="submit"
          disabled={demonstracao || carregando}
        >
          <Download size={15} />
          {carregando ? "Processando…" : "Exportar dados em JSON"}
        </button>
      </form>
      {administrador && (
        <form
          className="panel privacy-form"
          onSubmit={(evento) => enviar(evento, "anonimizar")}
        >
          <h2>Anonimização administrativa</h2>
          <p>
            A conta é desativada e o perfil perde nome, e-mail e matrícula. Os
            IDs, reservas e a auditoria permanecem para cumprir a política de
            retenção institucional. A operação é registrada com o motivo
            informado.
          </p>
          <label>
            ID do usuário
            <input
              className="input"
              name="usuario_id"
              placeholder="UUID completo"
              minLength={36}
              maxLength={36}
              required
            />
          </label>
          <label>
            Motivo da anonimização
            <textarea
              className="input"
              name="motivo"
              minLength={10}
              maxLength={2000}
              required
              placeholder="Registre a solicitação e a base institucional para a operação."
            />
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
            <input type="checkbox" required />
            Conferi o usuário e autorizo a anonimização deste perfil.
          </label>
          <button
            className="button button-danger"
            type="submit"
            disabled={demonstracao || carregando}
          >
            <ShieldCheck size={15} />
            Anonimizar e desativar conta
          </button>
        </form>
      )}
      <p className="notice" role="status" aria-live="polite">
        {mensagem ||
          (demonstracao
            ? "Demonstração: nenhuma exportação ou alteração é realizada."
            : "Para dúvidas sobre retenção ou correção cadastral, procure a administração da instituição.")}
      </p>
    </>
  );
}

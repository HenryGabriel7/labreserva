"use client";
import { useState, useTransition } from "react";
import { Save, Palette } from "lucide-react";
import { configuracaoSchema } from "@/lib/schemas";
import { salvarConfiguracaoAction } from "@/lib/actions-cadastros";

export function IdentidadeVisualForm({
  valor,
  demonstracao,
}: {
  valor: unknown;
  demonstracao: boolean;
}) {
  const validado = configuracaoSchema.safeParse({
    chave: "identidade_visual",
    valor,
  });
  const inicial =
    validado.success && validado.data.chave === "identidade_visual"
      ? validado.data.valor
      : { nome: "Instituto Horizonte", cor: "#087f67", logo_url: "" };
  const [mensagem, setMensagem] = useState("");
  const [pendente, startTransition] = useTransition();
  return (
    <form
      className="panel detail-card"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            const r = await salvarConfiguracaoAction({
              chave: "identidade_visual",
              valor: {
                nome: String(dados.get("nome")),
                cor: String(dados.get("cor")),
                logo_url: String(dados.get("logo_url")),
              },
            });
            setMensagem(r.mensagem);
          } catch {
            setMensagem("Não foi possível salvar a identidade visual.");
          }
        });
      }}
    >
      <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Palette size={17} />
        Identidade dos e-mails
      </h2>
      <p>Nome, cor e logo da instituição usados nas próximas notificações.</p>
      <fieldset
        disabled={demonstracao || pendente}
        style={{ border: 0, padding: 0, margin: "22px 0 0" }}
      >
        <div className="form-grid">
          <label>
            Nome da instituição
            <input
              name="nome"
              className="input"
              defaultValue={inicial.nome}
              minLength={2}
              maxLength={150}
              required
            />
          </label>
          <label>
            Cor de destaque
            <input
              name="cor"
              type="color"
              className="input"
              defaultValue={inicial.cor}
            />
          </label>
          <label className="full">
            URL HTTPS do logo (opcional)
            <input
              name="logo_url"
              type="url"
              className="input"
              defaultValue={inicial.logo_url}
              placeholder="https://instituicao.edu.br/logo.png"
            />
          </label>
        </div>
        <button
          type="submit"
          className="button button-primary"
          style={{ marginTop: 22 }}
        >
          <Save size={15} />
          {pendente ? "Salvando..." : "Salvar identidade visual"}
        </button>
      </fieldset>
      {mensagem && (
        <p className="notice" role="status" style={{ marginTop: 18 }}>
          {mensagem}
        </p>
      )}
    </form>
  );
}

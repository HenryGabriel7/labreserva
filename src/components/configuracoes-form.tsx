"use client";
import { useState, useTransition } from "react";
import { Save, Settings2 } from "lucide-react";
import { salvarConfiguracaoAction } from "@/lib/actions-cadastros";
const labels: Record<string, string> = {
  cancelamento_prazo_horas: "Prazo para cancelamento (horas)",
  antecedencia_min_horas: "Antecedência mínima (horas)",
  antecedencia_max_dias: "Antecedência máxima (dias)",
  noshow_tolerancia_minutos: "Tolerância de comparecimento (min)",
  pendencia_lembrete_horas: "Lembrete de pendência (horas)",
  pendencia_alerta_admin_horas: "Alerta para administrador (horas)",
  recorrencia_max_meses: "Período máximo de recorrência (meses)",
  login_max_falhas: "Tentativas de login",
  login_bloqueio_minutos: "Bloqueio de login (min)",
  dominios_email_permitidos: "Domínios de email permitidos",
};
export function ConfiguracoesForm({
  configuracoes,
  demonstracao,
}: {
  configuracoes: { chave: string; valor: unknown }[];
  demonstracao: boolean;
}) {
  const [mensagem, setMensagem] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <section className="panel detail-card">
      <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Settings2 size={17} />
        Política de reservas e acesso
      </h2>
      <p>
        As alterações são registradas na auditoria e passam a valer para as
        próximas operações.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          marginTop: 25,
        }}
      >
        {configuracoes
          .filter((c) => labels[c.chave])
          .map((c) => (
            <form
              key={c.chave}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "end",
                maxWidth: 650,
              }}
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const raw = String(form.get("valor"));
                const valor =
                  c.chave === "dominios_email_permitidos"
                    ? raw
                        .split(",")
                        .map((v) => v.trim().toLowerCase())
                        .filter(Boolean)
                    : Number(raw);
                startTransition(async () => {
                  try {
                    const r = await salvarConfiguracaoAction({
                      chave: c.chave,
                      valor,
                    });
                    setMensagem(r.mensagem);
                  } catch {
                    setMensagem("Não foi possível salvar a configuração.");
                  }
                });
              }}
            >
              <label style={{ flex: 1 }}>
                {labels[c.chave]}
                <input
                  className="input"
                  name="valor"
                  type={
                    c.chave === "dominios_email_permitidos" ? "text" : "number"
                  }
                  defaultValue={
                    Array.isArray(c.valor)
                      ? c.valor.join(", ")
                      : String(c.valor)
                  }
                  min={1}
                  disabled={demonstracao || pending}
                />
              </label>
              <button
                type="submit"
                className="button button-outline"
                aria-label={`Salvar ${labels[c.chave]}`}
                disabled={demonstracao || pending}
              >
                <Save size={15} />
              </button>
            </form>
          ))}
      </div>
      {mensagem && (
        <p role="status" className="notice" style={{ marginTop: 20 }}>
          {mensagem}
        </p>
      )}
      <p className="page-subtitle" style={{ marginTop: 25, fontSize: 11 }}>
        Domínios separados por vírgula. Campo vazio permite qualquer domínio.
      </p>
    </section>
  );
}

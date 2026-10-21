"use client";
import { useState, useTransition } from "react";
import { cancelarReservaAction } from "@/lib/actions-reservas";
export function CancelarReserva({
  reservaId,
  demonstracao,
}: {
  reservaId: string;
  demonstracao: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div>
      {!aberto ? (
        <button
          className="button button-danger"
          disabled={demonstracao}
          onClick={() => setAberto(true)}
        >
          Cancelar reserva
        </button>
      ) : (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const motivo = new FormData(e.currentTarget).get("motivo");
            startTransition(async () => {
              try {
                const r = await cancelarReservaAction({ reservaId, motivo });
                setMensagem(r.mensagem);
                if (r.ok) setAberto(false);
              } catch {
                setMensagem("Não foi possível cancelar a reserva.");
              }
            });
          }}
        >
          <label>
            Motivo do cancelamento
            <textarea
              className="input"
              name="motivo"
              minLength={3}
              maxLength={2000}
              required
            />
          </label>
          <div className="page-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={() => setAberto(false)}
            >
              Voltar
            </button>
            <button
              disabled={pending}
              className="button button-danger"
              type="submit"
            >
              Confirmar cancelamento
            </button>
          </div>
        </form>
      )}
      {mensagem && (
        <p role="status" className="notice">
          {mensagem}
        </p>
      )}
    </div>
  );
}

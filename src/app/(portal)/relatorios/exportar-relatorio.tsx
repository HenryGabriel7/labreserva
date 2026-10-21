"use client";

import { useState } from "react";
import { Download, FileText, LoaderCircle } from "lucide-react";
import { z } from "@/lib/validacao";
import type { PeriodoRelatorio } from "@/lib/relatorios";

export function ExportarRelatorio({
  filtros,
  desabilitado,
}: {
  filtros: PeriodoRelatorio;
  desabilitado: boolean;
}) {
  const [carregando, setCarregando] = useState<"csv" | "pdf" | null>(null);
  const [mensagem, setMensagem] = useState("");
  async function exportar(formato: "csv" | "pdf") {
    setCarregando(formato);
    setMensagem("");
    try {
      const resposta = await fetch("/api/relatorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...filtros, formato }),
      });
      if (!resposta.ok) {
        const erro = z
          .object({ error: z.string() })
          .strict()
          .safeParse(await resposta.json());
        throw new Error(
          erro.success ? erro.data.error : "Não foi possível exportar.",
        );
      }
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-${filtros.inicio}-${filtros.fim}.${formato}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMensagem(
        "Arquivo preparado. A exportação foi registrada na auditoria.",
      );
    } catch (erro) {
      setMensagem(
        erro instanceof Error ? erro.message : "Não foi possível exportar.",
      );
    } finally {
      setCarregando(null);
    }
  }
  return (
    <div className="report-export">
      <div>
        <button
          className="button button-outline"
          type="button"
          onClick={() => exportar("csv")}
          disabled={desabilitado || carregando !== null}
        >
          {carregando === "csv" ? (
            <LoaderCircle size={15} />
          ) : (
            <Download size={15} />
          )}
          Exportar CSV
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={() => exportar("pdf")}
          disabled={desabilitado || carregando !== null}
        >
          {carregando === "pdf" ? (
            <LoaderCircle size={15} />
          ) : (
            <FileText size={15} />
          )}
          Exportar PDF
        </button>
      </div>
      <p role="status" aria-live="polite">
        {mensagem}
      </p>
    </div>
  );
}

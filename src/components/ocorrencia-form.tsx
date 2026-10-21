"use client";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Send, Paperclip } from "lucide-react";
import type { Reserva } from "@/lib/types";
import { dataBr } from "./shared";
export function OcorrenciaForm({
  reservas,
  reservaInicial,
  demonstracao,
}: {
  reservas: Reserva[];
  reservaInicial?: string;
  demonstracao: boolean;
}) {
  const [mensagem, setMensagem] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="panel occurrence-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const dados = new FormData(form);
        const fotos = dados
          .getAll("fotos")
          .filter((f) => f instanceof File && f.size > 0) as File[];
        if (fotos.length > 5 || fotos.some((f) => f.size > 5 * 1024 * 1024)) {
          setMensagem("Envie até 5 fotos de no máximo 5 MB cada.");
          return;
        }
        startTransition(async () => {
          try {
            let loteId: string | null = null;
            if (fotos.length) {
              const preparo = await fetch("/api/ocorrencias/uploads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  reservaId: dados.get("reservaId"),
                  fotos: fotos.map((foto) => ({
                    tamanho: foto.size,
                    mime: foto.type,
                  })),
                }),
              });
              const lote = await preparo.json();
              if (!preparo.ok) {
                setMensagem(
                  lote.mensagem ?? "Não foi possível preparar as fotos.",
                );
                return;
              }
              loteId = lote.loteId;
              // Os bytes vão ao bucket privado de quarentena, sem passar pela
              // função Vercel. O servidor ainda confere o conteúdo antes de usar.
              for (const [i, foto] of fotos.entries()) {
                const envio = await fetch(lote.uploads[i], {
                  method: "PUT",
                  headers: { "Content-Type": foto.type, "x-upsert": "false" },
                  body: foto,
                });
                if (!envio.ok) throw new Error("Falha ao enviar foto");
              }
            }
            const res = await fetch("/api/ocorrencias", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reservaId: dados.get("reservaId"),
                tipo: dados.get("tipo"),
                gravidade: dados.get("gravidade"),
                descricao: dados.get("descricao"),
                loteId,
              }),
            });
            const body = await res.json();
            setMensagem(body.mensagem ?? "Falha ao registrar.");
            if (res.ok) {
              form.reset();
              router.refresh();
            }
          } catch {
            setMensagem("Não foi possível enviar a ocorrência.");
          }
        });
      }}
    >
      <h2>Registrar uma ocorrência</h2>
      <p className="page-subtitle">
        Descreva o ocorrido para que possamos cuidar dos espaços.
      </p>
      <fieldset
        disabled={demonstracao || pending}
        style={{ border: 0, padding: 0, marginTop: 24 }}
      >
        <div className="form-grid">
          <label className="full">
            Reserva
            <select
              className="input"
              name="reservaId"
              defaultValue={reservaInicial}
              required
            >
              {reservas
                .filter((r) =>
                  ["em_uso", "concluida", "no_show"].includes(r.status),
                )
                .map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.laboratorios?.nome} · {dataBr(r.inicio)} · {r.finalidade}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Tipo
            <select className="input" name="tipo">
              <option value="dano">Dano</option>
              <option value="falta_material">Falta de material</option>
              <option value="uso_indevido">Uso indevido</option>
            </select>
          </label>
          <label>
            Gravidade
            <select className="input" name="gravidade">
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="grave">Grave · notificar administradores</option>
            </select>
          </label>
          <label className="full">
            O que aconteceu?
            <textarea
              className="input"
              name="descricao"
              minLength={5}
              maxLength={4000}
              required
              placeholder="Informe os detalhes relevantes, sem incluir dados pessoais desnecessários."
            />
          </label>
          <label className="full upload-area">
            <Camera size={24} />
            <strong>Fotos da ocorrência</strong>
            <span>Até 5 fotos JPEG, PNG ou WebP · máximo 5 MB cada</span>
            <input
              type="file"
              name="fotos"
              multiple
              accept="image/jpeg,image/png,image/webp"
            />
          </label>
        </div>
        <button
          type="submit"
          className="button button-primary"
          style={{ marginTop: 22 }}
        >
          <Send size={14} />
          {pending ? "Enviando..." : "Registrar ocorrência"}
        </button>
      </fieldset>
      {demonstracao && (
        <p className="notice" style={{ marginTop: 20 }}>
          O registro está desabilitado na demonstração.
        </p>
      )}
      {mensagem && (
        <p role="status" className="notice" style={{ marginTop: 20 }}>
          {mensagem}
        </p>
      )}
    </form>
  );
}
export function AnexosOcorrencia({
  id,
  quantidade,
}: {
  id: string;
  quantidade: number;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [pending, startTransition] = useTransition();
  return quantidade > 0 ? (
    <div>
      <button
        className="button button-ghost button-sm"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            try {
              const r = await fetch(
                `/api/ocorrencias/anexos?id=${encodeURIComponent(id)}`,
              );
              const body = await r.json();
              if (r.ok) setUrls(body.urls);
              else
                setMensagem(
                  body.mensagem ?? "Não foi possível abrir os anexos.",
                );
            } catch {
              setMensagem("Não foi possível abrir os anexos.");
            }
          });
        }}
      >
        <Paperclip size={13} />
        Abrir {quantidade} foto(s)
      </button>
      <div className="occurrence-photos">
        {urls.map((url, i) => (
          <a href={url} target="_blank" rel="noopener noreferrer" key={url}>
            <Image
              src={url}
              width={150}
              height={110}
              alt={`Foto ${i + 1} da ocorrência`}
              unoptimized
            />
          </a>
        ))}
      </div>
      {mensagem && (
        <p role="status" className="field-error">
          {mensagem}
        </p>
      )}
    </div>
  ) : null;
}

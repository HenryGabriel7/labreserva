import { randomUUID } from "node:crypto";
import {
  identificarFoto,
  lerJsonOcorrencia,
  ocorrenciaEntradaSchema,
  validarPathsTemporarios,
  BUCKET_FOTOS_TEMPORARIAS,
  MAX_FOTO_BYTES,
} from "@/lib/uploads";
import {
  autorizarUploadOcorrencia,
  autorizarReservaOcorrencia,
} from "@/lib/uploads-servidor";
import { mensagemErro } from "@/lib/errors";

export async function POST(request: Request) {
  const contexto = await autorizarUploadOcorrencia(request);
  if (contexto.erro) return contexto.erro;
  const { usuario, db, admin } = contexto;
  const enviados: string[] = [];
  let temporarios: string[] = [];
  let loteId: string | null = null;
  let registrada = false;
  try {
    const parsed = ocorrenciaEntradaSchema.safeParse(
      await lerJsonOcorrencia(request),
    );
    if (!parsed.success)
      return Response.json(
        { mensagem: "Confira os dados da ocorrência." },
        { status: 400 },
      );
    const v = parsed.data;
    const autorizacao = await autorizarReservaOcorrencia(db, v.reservaId);
    if (autorizacao.erro) return autorizacao.erro;
    const { reserva } = autorizacao;
    if (v.loteId) {
      // Compare-and-set garante consumo único, inclusive entre instâncias Vercel.
      // A chave e a lista de paths nunca são aceitas a partir do cliente.
      const { data: lote, error: claim } = await admin
        .from("ocorrencia_uploads")
        .update({ estado: "processando", updated_at: new Date().toISOString() })
        .eq("id", v.loteId)
        .eq("usuario_id", usuario.id)
        .eq("reserva_id", reserva.id)
        .eq("estado", "pendente")
        .gt("expira_em", new Date().toISOString())
        .select("id,paths")
        .maybeSingle();
      if (claim || !lote)
        return Response.json(
          {
            mensagem:
              "O envio das fotos expirou ou já foi utilizado. Selecione as fotos novamente.",
          },
          { status: 409 },
        );
      loteId = lote.id;
      temporarios = validarPathsTemporarios(lote.paths, usuario.id, lote.id);
      for (const path of temporarios) {
        const { data: foto, error: download } = await admin.storage
          .from(BUCKET_FOTOS_TEMPORARIAS)
          .download(path);
        if (download || !foto || foto.size > MAX_FOTO_BYTES)
          throw new Error("Foto indisponível");
        const conteudo = new Uint8Array(await foto.arrayBuffer());
        const tipo = await identificarFoto(conteudo);
        const destino = `${reserva.laboratorio_id}/${reserva.id}/${randomUUID()}.${tipo.extensao}`;
        const { error: upload } = await admin.storage
          .from("ocorrencias")
          .upload(destino, conteudo, { contentType: tipo.mime, upsert: false });
        if (upload) throw new Error("Falha de upload");
        enviados.push(destino);
      }
    }
    const { data, error: registro } = await db.rpc("registrar_ocorrencia", {
      p_reserva_id: v.reservaId,
      p_tipo: v.tipo,
      p_descricao: v.descricao,
      p_gravidade: v.gravidade,
      p_anexos: enviados,
    });
    if (registro)
      return Response.json(
        { mensagem: mensagemErro(registro) },
        { status: 400 },
      );
    registrada = true;
    return Response.json(
      { mensagem: "Ocorrência registrada.", id: data.id },
      { status: 201 },
    );
  } catch {
    return Response.json(
      {
        mensagem:
          "Não foi possível registrar. Use até 5 fotos JPEG, PNG ou WebP de até 5 MB.",
      },
      { status: 400 },
    );
  } finally {
    if (!registrada && enviados.length)
      await admin.storage.from("ocorrencias").remove(enviados);
    if (loteId) {
      await admin
        .from("ocorrencia_uploads")
        .update({
          estado: registrada ? "concluido" : "falhou",
          updated_at: new Date().toISOString(),
        })
        .eq("id", loteId);
      if (temporarios.length)
        await admin.storage.from(BUCKET_FOTOS_TEMPORARIAS).remove(temporarios);
    }
  }
}

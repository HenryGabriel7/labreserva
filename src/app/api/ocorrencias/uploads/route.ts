import { randomUUID } from "node:crypto";
import {
  BUCKET_FOTOS_TEMPORARIAS,
  fotosPreparacaoSchema,
  lerJsonOcorrencia,
} from "@/lib/uploads";
import {
  autorizarUploadOcorrencia,
  autorizarReservaOcorrencia,
  limparLotesAntigos,
} from "@/lib/uploads-servidor";

export async function POST(request: Request) {
  const contexto = await autorizarUploadOcorrencia(request, true);
  if (contexto.erro) return contexto.erro;
  const { usuario, db, admin } = contexto;
  try {
    const parsed = fotosPreparacaoSchema.safeParse(
      await lerJsonOcorrencia(request),
    );
    if (!parsed.success)
      return Response.json(
        { mensagem: "Envie até 5 fotos JPEG, PNG ou WebP de até 5 MB." },
        { status: 400 },
      );
    const autorizacao = await autorizarReservaOcorrencia(
      db,
      parsed.data.reservaId,
    );
    if (autorizacao.erro) return autorizacao.erro;
    await limparLotesAntigos(admin);
    const loteId = randomUUID();
    const paths = parsed.data.fotos.map(
      () => `${usuario.id}/${loteId}/${randomUUID()}`,
    );
    const { error } = await admin.from("ocorrencia_uploads").insert({
      id: loteId,
      usuario_id: usuario.id,
      reserva_id: parsed.data.reservaId,
      paths,
    });
    if (error) throw new Error("Lote indisponível");
    const uploads: string[] = [];
    for (const path of paths) {
      const { data, error: assinatura } = await admin.storage
        .from(BUCKET_FOTOS_TEMPORARIAS)
        .createSignedUploadUrl(path, { upsert: false });
      if (assinatura || !data?.signedUrl) {
        await admin
          .from("ocorrencia_uploads")
          .update({ estado: "falhou", updated_at: new Date().toISOString() })
          .eq("id", loteId);
        throw new Error("Assinatura indisponível");
      }
      uploads.push(data.signedUrl);
    }
    return Response.json(
      { loteId, uploads },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { mensagem: "Não foi possível preparar o envio das fotos." },
      { status: 400 },
    );
  }
}

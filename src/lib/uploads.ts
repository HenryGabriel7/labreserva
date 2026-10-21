import { fileTypeFromBuffer } from "file-type";
import { z } from "@/lib/validacao";
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;
export const BUCKET_FOTOS_TEMPORARIAS = "ocorrencias-temporarias";
export const MAX_JSON_OCORRENCIA_BYTES = 16 * 1024;
export const fotosPreparacaoSchema = z
  .object({
    reservaId: z.uuid(),
    fotos: z
      .array(
        z
          .object({
            tamanho: z.number().int().min(1).max(MAX_FOTO_BYTES),
            mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
export const ocorrenciaEntradaSchema = z
  .object({
    reservaId: z.uuid(),
    tipo: z.enum(["dano", "falta_material", "uso_indevido"]),
    gravidade: z.enum(["baixa", "media", "grave"]),
    descricao: z.string().trim().min(5).max(4000),
    loteId: z.uuid().nullable(),
  })
  .strict();

export async function lerJsonOcorrencia(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new Error("Use JSON.");
  return JSON.parse(
    new TextDecoder().decode(
      await lerCorpoLimitado(request, MAX_JSON_OCORRENCIA_BYTES),
    ),
  ) as unknown;
}

export function validarPathsTemporarios(
  paths: unknown,
  usuarioId: string,
  loteId: string,
): string[] {
  const resultado = z.array(z.string()).min(1).max(5).parse(paths);
  const prefixo = `${usuarioId}/${loteId}/`;
  if (
    new Set(resultado).size !== resultado.length ||
    resultado.some(
      (path) =>
        !path.startsWith(prefixo) ||
        !z.uuid().safeParse(path.slice(prefixo.length)).success,
    )
  )
    throw new Error("Lote inválido.");
  return resultado;
}
export async function identificarFoto(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_FOTO_BYTES)
    throw new Error("Cada foto deve ter até 5 MB.");
  let tipo;
  try {
    tipo = await fileTypeFromBuffer(bytes);
  } catch {
    throw new Error("O arquivo não é uma imagem válida.");
  }
  if (!tipo || !["image/jpeg", "image/png", "image/webp"].includes(tipo.mime))
    throw new Error("Use fotos JPEG, PNG ou WebP válidas.");
  return {
    mime: tipo.mime,
    extensao:
      tipo.mime === "image/jpeg"
        ? "jpg"
        : tipo.mime === "image/png"
          ? "png"
          : "webp",
  };
}
export async function lerCorpoLimitado(
  request: Request,
  limite = 26 * 1024 * 1024,
) {
  if (!request.body) throw new Error("Corpo vazio");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let tamanho = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > limite) {
        await reader.cancel();
        throw new Error("Envio muito grande");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(tamanho);
  let pos = 0;
  for (const c of chunks) {
    bytes.set(c, pos);
    pos += c.length;
  }
  return bytes;
}

import { randomUUID } from "node:crypto";
import { z } from "@/lib/validacao";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { identificarFoto, lerCorpoLimitado } from "@/lib/uploads";
import { mensagemErro } from "@/lib/errors";
const schema = z
  .object({
    reservaId: z.uuid(),
    tipo: z.enum(["dano", "falta_material", "uso_indevido"]),
    gravidade: z.enum(["baixa", "media", "grave"]),
    descricao: z.string().trim().min(5).max(4000),
  })
  .strict();
export async function POST(request: Request) {
  if (
    !process.env.APP_URL ||
    request.headers.get("origin") !== new URL(process.env.APP_URL).origin
  )
    return Response.json(
      { mensagem: "Origem não permitida." },
      { status: 403 },
    );
  const usuario = await getCurrentUser({ sensitive: true });
  if (!usuario)
    return Response.json(
      { mensagem: "Entre para continuar." },
      { status: 401 },
    );
  if (!usuario.roles.some((r) => r === "admin" || r === "monitor"))
    return Response.json({ mensagem: "Sem permissão." }, { status: 403 });
  const db = await createClient();
  const admin = createAdminClient();
  const limite = await admin.rpc("consumir_rate_limit", {
    p_chave: `ocorrencias:${usuario.id}`,
    p_limite: 10,
    p_janela_segundos: 60,
  });
  if (limite.error || limite.data !== true)
    return Response.json(
      { mensagem: "Aguarde antes de tentar novamente." },
      { status: 429 },
    );
  const enviados: string[] = [];
  try {
    const bytes = await lerCorpoLimitado(request);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    if (
      [...form.keys()].some(
        (k) =>
          !["reservaId", "tipo", "gravidade", "descricao", "fotos"].includes(k),
      )
    )
      return Response.json({ mensagem: "Campos inválidos." }, { status: 400 });
    const parsed = schema.safeParse(
      Object.fromEntries([...form.entries()].filter(([k]) => k !== "fotos")),
    );
    if (!parsed.success)
      return Response.json(
        { mensagem: "Confira os dados da ocorrência." },
        { status: 400 },
      );
    const v = parsed.data;
    const arquivos = form
      .getAll("fotos")
      .filter((f) => f instanceof File && f.size > 0) as File[];
    if (arquivos.length > 5)
      return Response.json(
        { mensagem: "Envie no máximo 5 fotos." },
        { status: 400 },
      );
    const { data: reserva, error } = await db
      .from("reservas")
      .select("id,laboratorio_id,status")
      .eq("id", v.reservaId)
      .maybeSingle();
    if (error || !reserva)
      return Response.json(
        { mensagem: "Reserva não encontrada." },
        { status: 404 },
      );
    const { data: pode, error: negado } = await db.rpc("pode_gerir_lab", {
      p_laboratorio_id: reserva.laboratorio_id,
    });
    if (negado || pode !== true)
      return Response.json(
        { mensagem: "Sem permissão neste laboratório." },
        { status: 403 },
      );
    if (!["em_uso", "concluida", "no_show"].includes(reserva.status))
      return Response.json(
        { mensagem: "Essa reserva não permite ocorrência neste momento." },
        { status: 409 },
      );
    const validados = await Promise.all(
      arquivos.map(async (f) => {
        const conteudo = new Uint8Array(await f.arrayBuffer());
        const tipo = await identificarFoto(conteudo);
        return { conteudo, ...tipo };
      }),
    );
    for (const foto of validados) {
      const path = `${reserva.laboratorio_id}/${reserva.id}/${randomUUID()}.${foto.extensao}`;
      const { error: upload } = await admin.storage
        .from("ocorrencias")
        .upload(path, foto.conteudo, { contentType: foto.mime, upsert: false });
      if (upload) throw new Error("Falha de upload");
      enviados.push(path);
    }
    const { data, error: registro } = await db.rpc("registrar_ocorrencia", {
      p_reserva_id: v.reservaId,
      p_tipo: v.tipo,
      p_descricao: v.descricao,
      p_gravidade: v.gravidade,
      p_anexos: enviados,
    });
    if (registro) {
      if (enviados.length)
        await admin.storage.from("ocorrencias").remove(enviados);
      return Response.json(
        { mensagem: mensagemErro(registro) },
        { status: 400 },
      );
    }
    return Response.json(
      { mensagem: "Ocorrência registrada.", id: data.id },
      { status: 201 },
    );
  } catch {
    if (enviados.length)
      await admin.storage.from("ocorrencias").remove(enviados);
    return Response.json(
      {
        mensagem:
          "Não foi possível registrar. Use até 5 fotos JPEG, PNG ou WebP de até 5 MB.",
      },
      { status: 400 },
    );
  }
}
